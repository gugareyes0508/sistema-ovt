// Utilidad centralizada para llamar a la API de GROQ.
//
// PROBLEMA QUE RESUELVE: Groq descontinúa modelos con relativa frecuencia
// (ej. llama-3.3-70b-versatile y llama-3.1-8b-instant se apagaron el
// 16-08-2026, sin aviso previo dentro de la app). Antes, el nombre del
// modelo estaba escrito a mano en 4 archivos distintos — cada vez que Groq
// apagaba uno, había que salir a buscar y actualizar todos esos lugares.
//
// SOLUCIÓN: en vez de hardcodear un ID de modelo, le preguntamos a Groq
// (endpoint GET /v1/models) cuáles siguen activos AHORA MISMO, y elegimos
// automáticamente el mejor disponible. Si Groq apaga un modelo mañana,
// simplemente desaparece de esa lista y la app salta sola al siguiente —
// cero cambios de código necesarios.
//
// NOTA (20-ago-2026): esta selección automática a veces elige un modelo
// "razonador" (tipo DeepSeek-R1/Qwen3), que por defecto devuelve su cadena
// de pensamiento envuelta en <think>...</think> ANTES de la respuesta real
// — eso rompía el parseo de JSON en Agrupación IA y ensuciaba el texto en
// IA Insights. Se corrige acá, en un solo lugar, con reasoning_format:
// 'hidden' (Groq lo ignora si el modelo no es razonador) más una limpieza
// de respaldo por si algún modelo no respeta ese parámetro.
//
// Uso en cualquier componente:
//   import { llamarGroq } from '../utils/groqClient';
//   const data = await llamarGroq([{ role: 'user', content: prompt }], { temperature: 0.5, maxTokens: 700 });
//   const texto = data.choices[0].message.content;

let modeloCache = null;
let cacheTimestamp = 0;
const CACHE_MS = 30 * 60 * 1000; // 30 minutos — evita golpear /models en cada llamada

// Filtra modelos que no sirven para chat de texto (voz, moderación, etc.)
const NO_ES_CHAT = /whisper|tts|orpheus|guard|safeguard/i;

// Modelos "razonadores" (DeepSeek-R1, Qwen3, gpt-oss, etc.): antes de
// responder gastan tokens "pensando" en voz alta. Para lo que esta app les
// pide (JSON corto, resúmenes breves) eso trae dos problemas: si el
// pensamiento no cabe en max_tokens, la respuesta útil queda vacía; y si
// cabe, hay que limpiar el bloque <think> aparte. Se prefieren modelos
// normales para estos usos — solo se cae a un razonador si no queda
// ninguna otra alternativa activa.
const ES_RAZONADOR = /deepseek-r1|qwen3|gpt-oss|reasoning|thinking|-r1(?:[^a-z]|$)/i;

// Quita cualquier bloque de razonamiento que el modelo haya devuelto igual
// dentro del contenido, en vez de en el campo separado "reasoning".
const limpiarRazonamiento = (texto) => (texto || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

async function obtenerModelosActivos() {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { 'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}` }
  });
  if (!res.ok) throw new Error('No se pudo consultar la lista de modelos de GROQ');
  const data = await res.json();
  const activos = (data.data || []).filter(m => m.active && !NO_ES_CHAT.test(m.id));

  const porContexto = (a, b) => (b.context_window || 0) - (a.context_window || 0);
  const normales = activos.filter(m => !ES_RAZONADOR.test(m.id)).sort(porContexto);
  const razonadores = activos.filter(m => ES_RAZONADOR.test(m.id)).sort(porContexto);

  // Los normales van primero siempre; los razonadores quedan al final,
  // como último recurso si no hay ningún modelo normal activo.
  return [...normales, ...razonadores];
}

async function obtenerModeloGroq(forzarRefresh = false) {
  const ahora = Date.now();
  if (!forzarRefresh && modeloCache && (ahora - cacheTimestamp) < CACHE_MS) {
    return modeloCache;
  }
  try {
    const candidatos = await obtenerModelosActivos();
    if (candidatos.length > 0) {
      modeloCache = candidatos[0].id;
      cacheTimestamp = ahora;
      return modeloCache;
    }
  } catch (err) {
    console.warn('[groqClient] No se pudo obtener /models, usando fallback fijo:', err.message);
  }
  // Fallback solo si /models falla por completo (ej. sin internet momentáneo)
  return 'openai/gpt-oss-120b';
}

/**
 * Llama a GROQ para generar texto (chat completion). Reintenta una vez con
 * el siguiente modelo disponible si el primero fallara (ej. justo se
 * descontinuó y el caché local todavía no se había refrescado).
 *
 * @param {Array<{role: string, content: string}>} mensajes
 * @param {{ temperature?: number, maxTokens?: number }} opciones
 * @returns {Promise<any>} La respuesta completa de la API (usar .choices[0].message.content)
 */
export async function llamarGroq(mensajes, opciones = {}) {
  const { temperature = 0.5, maxTokens = 700 } = opciones;

  const pedirCompletion = async (modelo, conReasoningFormat) => {
    const body = { model: modelo, messages: mensajes, temperature, max_tokens: maxTokens };
    // Si el modelo es razonador, que la cadena de pensamiento no venga
    // mezclada en el contenido. No todos los modelos aceptan este parámetro
    // — algunos directamente devuelven error 400 si se lo mandamos, así que
    // se agrega solo en el primer intento y se reintenta sin él si falla.
    if (conReasoningFormat) body.reasoning_format = 'hidden';

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}`
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || response.statusText);
    }
    return response.json();
  };

  const intentar = async (modelo) => {
    let data;
    try {
      data = await pedirCompletion(modelo, true);
    } catch (err) {
      if (/reasoning_format/i.test(err.message)) {
        // Este modelo no acepta el parámetro — mismo modelo, sin él.
        data = await pedirCompletion(modelo, false);
      } else {
        throw err;
      }
    }
    // Respaldo: si igual vino un <think>...</think> colado en el contenido
    // (modelo razonador que no soporta 'hidden' pero sí piensa igual), se
    // limpia acá antes de devolverlo a quien llamó.
    const contenidoOriginal = data.choices?.[0]?.message?.content || '';
    const contenidoLimpio = limpiarRazonamiento(contenidoOriginal);
    if (data.choices?.[0]?.message) data.choices[0].message.content = contenidoLimpio;
    // Si el modelo agotó max_tokens pensando, el contenido puede llegar
    // vacío de dos formas: porque acá se lo dejó vacío al limpiar un
    // <think> completo, O porque Groq ya lo separó en el campo "reasoning"
    // (con reasoning_format:'hidden' funcionando bien) y no quedó
    // presupuesto para la respuesta — en ese caso "content" ya viene vacío
    // de la API, sin pasar por la limpieza. Cubrimos los dos casos, si no
    // el error se pierde y aguas abajo solo se ve el mensaje genérico.
    if (!contenidoLimpio) {
      const motivo = data.choices?.[0]?.finish_reason;
      throw new Error(`El modelo "${modelo}" no devolvió contenido (finish_reason: ${motivo || 'desconocido'}). Probablemente gastó el límite de tokens pensando — probá con menos datos de entrada o reintenta.`);
    }
    return data;
  };

  const modelo = await obtenerModeloGroq();
  try {
    return await intentar(modelo);
  } catch (err) {
    // El modelo en caché falló (probablemente recién descontinuado) —
    // refrescamos la lista y probamos una vez más con el siguiente disponible.
    console.warn(`[groqClient] Modelo "${modelo}" falló (${err.message}), reintentando con otro...`);
    const modeloAlterno = await obtenerModeloGroq(true);
    if (modeloAlterno === modelo) throw err; // no hay otro modelo distinto disponible
    return await intentar(modeloAlterno);
  }
}

/**
 * Devuelve la lista completa de modelos activos aptos para chat, para
 * pantallas de diagnóstico como "Test IA".
 */
export async function listarModelosDisponibles() {
  return obtenerModelosActivos();
}
