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
// Uso en cualquier componente:
//   import { llamarGroq } from '../utils/groqClient';
//   const data = await llamarGroq([{ role: 'user', content: prompt }], { temperature: 0.5, maxTokens: 700 });
//   const texto = data.choices[0].message.content;

let modeloCache = null;
let cacheTimestamp = 0;
const CACHE_MS = 30 * 60 * 1000; // 30 minutos — evita golpear /models en cada llamada

// Filtra modelos que no sirven para chat de texto (voz, moderación, etc.)
const NO_ES_CHAT = /whisper|tts|orpheus|guard|safeguard/i;

async function obtenerModelosActivos() {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { 'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}` }
  });
  if (!res.ok) throw new Error('No se pudo consultar la lista de modelos de GROQ');
  const data = await res.json();
  return (data.data || [])
    .filter(m => m.active && !NO_ES_CHAT.test(m.id))
    // Preferimos el modelo con mayor ventana de contexto: normalmente indica
    // el modelo "insignia" más capaz de la familia vigente en ese momento.
    .sort((a, b) => (b.context_window || 0) - (a.context_window || 0));
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

  const intentar = async (modelo) => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}`
      },
      body: JSON.stringify({ model: modelo, messages: mensajes, temperature, max_tokens: maxTokens })
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || response.statusText);
    }
    return response.json();
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
