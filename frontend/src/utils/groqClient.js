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
// NOTA (21-ago-2026): la selección automática puede tocarle a un modelo
// que "existe y responde" pero no sirve para esta app por distintos
// motivos — razonador (piensa en <think> antes de responder), agéntico
// ("compound", orquesta herramientas en vez de solo responder texto), o de
// nicho con cuota de throughput muy chica (ej. allam-2-7b, especializado en
// árabe, con límite de 6.000 tokens/minuto). Parchar cada nombre de a uno
// es un juego sin fin, así que el fix de fondo es este: en vez de probar
// solo el modelo #1 y reintentar una vez, se recorre TODA la lista
// ordenada de candidatos hasta que uno funcione de verdad — cualquier
// modelo problemático nuevo que aparezca queda cubierto solo, sin tocar
// código, siempre que exista al menos un candidato sano en la lista.
//
// Uso en cualquier componente:
//   import { llamarGroq } from '../utils/groqClient';
//   const data = await llamarGroq([{ role: 'user', content: prompt }], { temperature: 0.5, maxTokens: 700 });
//   const texto = data.choices[0].message.content;

let listaCache = null;
let cacheTimestamp = 0;
const CACHE_MS = 30 * 60 * 1000; // 30 minutos — evita golpear /models en cada llamada

// Filtra modelos que no sirven para chat de texto simple:
// - voz/moderación (whisper, tts, guard...)
// - "compound": agénticos, orquestan herramientas en vez de solo responder
// - modelos regionales/de nicho con cuota de throughput muy chica para esta
//   app (allam, mistral-saba: modelos especializados en árabe con TPM bajo)
const NO_ES_CHAT = /whisper|tts|orpheus|guard|safeguard|compound|allam|saba/i;

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

// Lista de IDs en orden de preferencia. Cachea 30 min para no golpear
// /models en cada llamada; se puede forzar un refresh.
async function obtenerListaModelos(forzarRefresh = false) {
  const ahora = Date.now();
  if (!forzarRefresh && listaCache && (ahora - cacheTimestamp) < CACHE_MS) {
    return listaCache;
  }
  try {
    const candidatos = await obtenerModelosActivos();
    if (candidatos.length > 0) {
      listaCache = candidatos.map(m => m.id);
      cacheTimestamp = ahora;
      return listaCache;
    }
  } catch (err) {
    console.warn('[groqClient] No se pudo obtener /models, usando fallback fijo:', err.message);
  }
  // Fallback solo si /models falla por completo (ej. sin internet momentáneo)
  return ['openai/gpt-oss-120b'];
}

/**
 * Llama a GROQ para generar texto (chat completion). Recorre la lista
 * completa de modelos activos, en orden, hasta que uno responda con
 * contenido de verdad — no se rinde después de un solo reintento.
 *
 * @param {Array<{role: string, content: string}>} mensajes
 * @param {{ temperature?: number, maxTokens?: number }} opciones
 * @returns {Promise<any>} La respuesta completa de la API (usar .choices[0].message.content)
 */
// Tope de tokens por minuto (prompt + respuesta) observado en esta cuenta
// de Groq, en el tier gratuito on_demand — es el MISMO para todos los
// modelos probados, así que es un límite de cuenta, no de modelo. Se deja
// margen de seguridad (el límite real observado es 8.000).
const TPM_MAX_SEGURO = 7000;

// Estimación de tokens a partir de caracteres. Deliberadamente generosa
// (sobreestima) para dejar margen: mejor pedir de menos que pasarse y que
// Groq rechace la petición entera por "Request too large".
const estimarTokens = (texto) => Math.ceil((texto || '').length / 3.3);

export async function llamarGroq(mensajes, opciones = {}) {
  const { temperature = 0.5, maxTokens = 700 } = opciones;
  const tokensPrompt = estimarTokens(mensajes.map(m => m.content).join('\n'));

  const pedirCompletion = async (modelo, conParamsRazonador) => {
    const esRazonador = ES_RAZONADOR.test(modelo);
    // Los razonadores necesitan presupuesto extra: parte se les va en
    // pensar (aunque sea "poco") antes de escribir la respuesta real. Pero
    // nunca se puede superar lo que la cuenta permite por minuto en total
    // (prompt + respuesta) — de ahí el tope contra maxTokensDisponible.
    const maxTokensDisponible = Math.max(300, TPM_MAX_SEGURO - tokensPrompt);
    const maxTokensDeseado = esRazonador ? Math.max(maxTokens * 2, maxTokens + 1500) : maxTokens;
    const maxTokensEfectivo = Math.min(maxTokensDeseado, maxTokensDisponible);
    const body = { model: modelo, messages: mensajes, temperature, max_tokens: maxTokensEfectivo };
    if (conParamsRazonador) {
      // 'hidden' saca el razonamiento del content; 'low' reduce cuánto
      // piensa antes de responder (algunos modelos igual ignoran esto,
      // pero para los que lo soportan deja mucho más lugar para la
      // respuesta real dentro del mismo presupuesto de tokens).
      body.reasoning_format = 'hidden';
      body.reasoning_effort = 'low';
    }

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
      if (/reasoning_format|reasoning_effort/i.test(err.message)) {
        // Este modelo no acepta esos parámetros — mismo modelo, sin ellos.
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
    // y no quedó presupuesto para la respuesta — en ese caso "content" ya
    // viene vacío de la API, sin pasar por la limpieza. Cubrimos los dos
    // casos, si no el error se pierde y esta llamada se da por "exitosa"
    // sin serlo, saltándose el paso a probar el siguiente modelo.
    if (!contenidoLimpio) {
      const motivo = data.choices?.[0]?.finish_reason;
      throw new Error(`El modelo "${modelo}" no devolvió contenido (finish_reason: ${motivo || 'desconocido'}).`);
    }
    return data;
  };

  const candidatos = await obtenerListaModelos();
  const erroresPorModelo = [];

  for (let i = 0; i < candidatos.length; i++) {
    const modelo = candidatos[i];
    try {
      return await intentar(modelo);
    } catch (err) {
      erroresPorModelo.push(`${modelo}: ${err.message}`);
      console.warn(`[groqClient] Modelo "${modelo}" falló (${err.message}), probando el siguiente...`);
      // Si es el último candidato de la lista cacheada, se refresca por si
      // hay modelos nuevos que la caché de 30 min todavía no conoce.
      if (i === candidatos.length - 1) {
        const listaFresca = await obtenerListaModelos(true);
        const nuevos = listaFresca.filter(m => !candidatos.includes(m));
        for (const modeloNuevo of nuevos) {
          try {
            return await intentar(modeloNuevo);
          } catch (err2) {
            erroresPorModelo.push(`${modeloNuevo}: ${err2.message}`);
          }
        }
      }
    }
  }

  throw new Error(`Ningún modelo GROQ disponible pudo responder. Detalle: ${erroresPorModelo.join(' | ')}`);
}

/**
 * Devuelve la lista completa de modelos activos aptos para chat, con sus
 * datos (context_window, etc.), para pantallas de diagnóstico como "Test IA".
 */
export async function listarModelosDisponibles() {
  return obtenerModelosActivos();
}
