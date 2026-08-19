import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { llamarGroq } from '../utils/groqClient';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const buildHeaders = (token, clienteActivo = '') => {
  const h = { Authorization: `Bearer ${token}` };
  if (clienteActivo) h['x-cliente-activo'] = clienteActivo;
  return h;
};

const UMBRAL_REITERATIVA = 3;

const ESTADOS = {
  sin_gestion: 'Sin gestión',
  en_gestion: 'En gestión',
  resuelto: 'Resuelto',
  escalado_dpp: 'Escalado a DPP'
};

const COLOR_ESTADO = {
  sin_gestion: { bg: 'rgba(215,59,71,0.12)', fg: '#a61e2b' },
  en_gestion: { bg: 'rgba(240,161,26,0.15)', fg: '#8a5a06' },
  resuelto: { bg: 'rgba(32,166,106,0.14)', fg: '#116642' },
  escalado_dpp: { bg: 'rgba(124,58,237,0.14)', fg: '#5b21b6' }
};

const PillEstado = ({ estado }) => {
  const c = COLOR_ESTADO[estado] || COLOR_ESTADO.sin_gestion;
  return (
    <span style={{ background: c.bg, color: c.fg, fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
      {ESTADOS[estado] || estado}
    </span>
  );
};

function extraerHostDeDescripcion(descripcion, tipo) {
  const texto = String(descripcion || '');
  let m = /Host:\s*([^\n]+)/.exec(texto);
  if (m) return m[1].trim();
  m = /Name\[0\]:\s*([^\n]+)/.exec(texto);
  if (m) return m[1].trim();
  m = /Kubernetes workload\s*\n([^\n]+)/.exec(texto);
  if (m) return m[1].trim();
  if (tipo && /^el balancer|^lbaas/i.test(tipo)) return tipo.trim();
  return null;
}

// Igual al slug del backend — para agrupar host+tipo de forma consistente
function slugAlertaKeyFront(host, tipo) {
  const norm = (s) => String(s || 'desconocido')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `${norm(host)}__${norm(tipo)}`;
}

// Mismo helper de tarjeta KPI que usa ClaimDashboard, para que se vea idéntico
const KPI = ({ label, value, sub, color = 'var(--ink-950)' }) => (
  <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '24px', padding: '16px', backdropFilter: 'blur(18px)', boxShadow: 'var(--shadow-soft)' }}>
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '9px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '8px' }}>{label}</div>
    <div style={{ fontSize: '1.8rem', fontWeight: '800', color, lineHeight: 1, letterSpacing: '-.07em', marginBottom: '4px' }}>{value}</div>
    {sub && <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--muted)' }}>{sub}</div>}
  </div>
);

export default function ControlAlertas({ token, apiUrl, clienteActivo, usuario }) {
  const fileRef = useRef(null);

  const [grupoFiltro, setGrupoFiltro] = useState('');
  const [mesFiltro, setMesFiltro] = useState('');
  const [busquedaHost, setBusquedaHost] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [error, setError] = useState(null);

  const [subiendo, setSubiendo] = useState(false);
  const [mensajeSubida, setMensajeSubida] = useState(null);
  const [ultimaCarga, setUltimaCarga] = useState(null);
  const [reiniciando, setReiniciando] = useState(false);

  const [alertaSeleccionada, setAlertaSeleccionada] = useState(null);
  const [notaNueva, setNotaNueva] = useState('');
  const [estadoNuevo, setEstadoNuevo] = useState('en_gestion');
  const [asignadoATemp, setAsignadoATemp] = useState('');
  const [historialGestion, setHistorialGestion] = useState(null);
  const [alertasAsociadas, setAlertasAsociadas] = useState(null);
  const [ticketSeleccionado, setTicketSeleccionado] = useState(null);
  const [guardandoNota, setGuardandoNota] = useState(false);

  const [analisisIA, setAnalisisIA] = useState(null);
  const [cargandoIA, setCargandoIA] = useState(false);
  const [errorIA, setErrorIA] = useState(null);

  const headers = buildHeaders(token, clienteActivo);

  const [alertasRawTodas, setAlertasRawTodas] = useState([]);
  const [gestionMap, setGestionMap] = useState({});
  const [asignables, setAsignables] = useState([]);
  const [soloMisAsignadas, setSoloMisAsignadas] = useState(false);

  // Una sola lectura completa de cada colección — todo lo demás (KPIs, tendencia,
  // ranking, meses disponibles, nuevo vs reiterativo) se calcula en el navegador.
  const cargarDatos = useCallback(async () => {
    setCargandoDatos(true);
    setError(null);
    try {
      const [resRaw, resGestion, resAsignables] = await Promise.all([
        axios.get(`${apiUrl}/api/alertas`, { headers }),
        axios.get(`${apiUrl}/api/alertas/gestion-todas`, { headers }),
        axios.get(`${apiUrl}/api/alertas/asignables`, { headers })
      ]);
      setAlertasRawTodas(resRaw.data);
      setGestionMap(resGestion.data);
      setAsignables(resAsignables.data);
    } catch (err) {
      setError('Error cargando datos de alertas: ' + (err.response?.data?.error || err.message));
    } finally {
      setCargandoDatos(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, clienteActivo]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);
  useEffect(() => { setPagina(1); }, [grupoFiltro, mesFiltro, busquedaHost, tipoFiltro, soloMisAsignadas]);

  const fechaDeAlerta = (a) => a.creado?._seconds ? new Date(a.creado._seconds * 1000) : (a.creado ? new Date(a.creado) : null);

  // Meses disponibles en los datos, para el filtro (más reciente primero)
  const mesesDisponibles = React.useMemo(() => {
    const set = new Set();
    alertasRawTodas.forEach(a => {
      const f = fechaDeAlerta(a);
      if (f) set.add(`${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(set).sort().reverse();
  }, [alertasRawTodas]);

  const nombreMes = (ym) => {
    const [y, m] = ym.split('-');
    const nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${nombres[parseInt(m, 10) - 1]} ${y}`;
  };

  // Alertas visibles según filtros de grupo + mes
  const alertasFiltradas = React.useMemo(() => {
    return alertasRawTodas.filter(a => {
      if (grupoFiltro && a.grupo !== grupoFiltro) return false;
      if (mesFiltro) {
        const f = fechaDeAlerta(a);
        const ym = f ? `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}` : null;
        if (ym !== mesFiltro) return false;
      }
      return true;
    });
  }, [alertasRawTodas, grupoFiltro, mesFiltro]);

  // KPIs + tendencia semanal (incluye línea "Total"), calculados sobre lo filtrado
  const resumen = React.useMemo(() => {
    const total = alertasFiltradas.length;
    const criticas = alertasFiltradas.filter(a => a.gravedad === 'Critical').length;

    const conteoPorClave = {};
    alertasFiltradas.forEach(a => {
      const clave = slugAlertaKeyFront(a.host, a.tipo);
      conteoPorClave[clave] = (conteoPorClave[clave] || 0) + 1;
    });
    const clavesReiterativas = Object.keys(conteoPorClave).filter(k => conteoPorClave[k] >= UMBRAL_REITERATIVA);
    const sinGestion = clavesReiterativas.filter(k => !(gestionMap[k]?.notas?.length > 0)).length;

    const semanas = {};
    alertasFiltradas.forEach(a => {
      const fecha = fechaDeAlerta(a);
      if (!fecha) return;
      const onejan = new Date(fecha.getFullYear(), 0, 1);
      const semanaNum = Math.ceil((((fecha - onejan) / 86400000) + onejan.getDay() + 1) / 7);
      const key = `Sem ${semanaNum}`;
      if (!semanas[key]) semanas[key] = { Critical: 0, Major: 0, otros: 0 };
      if (a.gravedad === 'Critical') semanas[key].Critical++;
      else if (a.gravedad === 'Major') semanas[key].Major++;
      else semanas[key].otros++;
    });

    return { total, criticas, reiterativas: clavesReiterativas.length, sinGestion, tendenciaSemanal: semanas };
  }, [alertasFiltradas, gestionMap]);

  // Primera aparición histórica de cada host+tipo (usa TODO el historial, no el filtro actual)
  const primeraAparicionPorClave = React.useMemo(() => {
    const mapa = {};
    let fechaMasReciente = null;
    alertasRawTodas.forEach(a => {
      const clave = slugAlertaKeyFront(a.host, a.tipo);
      const f = fechaDeAlerta(a);
      if (!f) return;
      if (!mapa[clave] || f < mapa[clave]) mapa[clave] = f;
      if (!fechaMasReciente || f > fechaMasReciente) fechaMasReciente = f;
    });
    return { mapa, fechaMasReciente };
  }, [alertasRawTodas]);

  const etiquetaNuevoReiterativo = (clave) => {
    const primera = primeraAparicionPorClave.mapa[clave];
    const ahora = primeraAparicionPorClave.fechaMasReciente;
    if (!primera || !ahora) return { tipo: 'nuevo', texto: 'Nuevo' };
    const dias = Math.floor((ahora - primera) / 86400000);
    if (dias <= 7) return { tipo: 'nuevo', texto: 'Nuevo esta semana' };
    const semanas = Math.floor(dias / 7);
    return { tipo: 'reiterativo', texto: `Reiterativo · hace ${semanas} semana${semanas === 1 ? '' : 's'}` };
  };

  // Ranking de reiterativas sobre lo filtrado, con estado de gestión y etiqueta nuevo/reiterativo
  const reiterativas = React.useMemo(() => {
    const grupos = {};
    alertasFiltradas.forEach(a => {
      const clave = slugAlertaKeyFront(a.host, a.tipo);
      if (!grupos[clave]) grupos[clave] = { clave, host: a.host || 'Desconocido', tipo: a.tipo, grupo: a.grupo, veces: 0 };
      grupos[clave].veces++;
    });
    let lista = Object.values(grupos)
      .filter(g => g.veces >= UMBRAL_REITERATIVA)
      .map(g => {
        const gestion = gestionMap[g.clave];
        const ultimaNota = gestion?.notas?.length ? gestion.notas[gestion.notas.length - 1] : null;
        return {
          ...g,
          estadoGestion: gestion?.estado || 'sin_gestion',
          ultimaNota: ultimaNota?.texto || null,
          asignadoA: gestion?.asignadoA || null,
          asignadoANombre: gestion?.asignadoANombre || null,
          etiqueta: etiquetaNuevoReiterativo(g.clave)
        };
      });
    if (soloMisAsignadas) lista = lista.filter(g => g.asignadoA === usuario?.usuario);
    return lista.sort((a, b) => b.veces - a.veces);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertasFiltradas, gestionMap, primeraAparicionPorClave, soloMisAsignadas]);

  const reiniciarDatos = async () => {
    if (!window.confirm('Esto elimina TODAS las alertas y gestiones cargadas para este cliente, para volver a importar el Excel corregido. ¿Continuar?')) return;
    setReiniciando(true);
    setError(null);
    try {
      await axios.delete(`${apiUrl}/api/alertas`, { headers });
      setMensajeSubida({ tipo: 'success', texto: 'Datos reiniciados. Ya puedes volver a importar el Excel.' });
      cargarDatos();
    } catch (err) {
      setError('Error reiniciando datos: ' + (err.response?.data?.error || err.message));
    } finally {
      setReiniciando(false);
    }
  };

  // ============ SUBIDA DE EXCEL ============
  const procesarExcel = async (file) => {
    setSubiendo(true);
    setMensajeSubida(null);
    setError(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

      const alertas = [];
      wb.SheetNames.forEach(nombreHoja => {
        if (!/operaciones cloud|middleware cloud/i.test(nombreHoja)) return;
        const hoja = wb.Sheets[nombreHoja];
        const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });

        filas.forEach(fila => {
          const descripcion = fila['Descripción'] || '';
          alertas.push({
            numero: fila['Número'] || '',
            gravedad: fila['Gravedad'] || '',
            tipo: fila['Tipo'] || '',
            recurso: fila['Recurso'] || '',
            descripcionBreve: fila['Descripción breve'] || '',
            descripcion,
            host: extraerHostDeDescripcion(descripcion, fila['Tipo']),
            grupo: nombreHoja,
            grupoAsignacion: fila['Grupo de asignación'] || '',
            asignadoA: fila['Asignado a'] || '',
            prioridad: fila['Prioridad'] || null,
            horaEventoInicial: fila['Hora del evento inicial'] || null,
            horaUltimoEvento: fila['Hora del último evento'] || null,
            creado: fila['Creado'] || null,
            estado: fila['Estado'] || ''
          });
        });
      });

      if (alertas.length === 0) {
        setMensajeSubida({ tipo: 'error', texto: 'No se encontraron hojas "Operaciones Cloud" o "Middleware Cloud" en el archivo.' });
        setSubiendo(false);
        return;
      }

      const resp = await axios.post(`${apiUrl}/api/alertas/upload`, { alertas }, { headers });
      setMensajeSubida({
        tipo: 'success',
        texto: `Carga completa: ${resp.data.nuevas} alertas nuevas de ${resp.data.total} en el archivo.`
      });
      setUltimaCarga(new Date().toLocaleString('es-CL'));
      cargarDatos();
    } catch (err) {
      setMensajeSubida({ tipo: 'error', texto: 'Error procesando el archivo: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSubiendo(false);
    }
  };

  // ============ GESTIÓN DE UNA ALERTA REITERATIVA ============
  const abrirGestion = (alerta) => {
    setAlertaSeleccionada(alerta);
    setNotaNueva('');
    setEstadoNuevo(alerta.estadoGestion === 'sin_gestion' ? 'en_gestion' : alerta.estadoGestion);
    setAsignadoATemp(alerta.asignadoA || '');
    // Todo 100% local — ya tenemos todas las alertas y toda la gestión cargadas, cero lecturas nuevas
    setAlertasAsociadas(alertasRawTodas.filter(a => (a.host || 'Desconocido') === alerta.host && a.tipo === alerta.tipo));
    setHistorialGestion(gestionMap[alerta.clave] || { notas: [] });
  };

  const guardarNota = async () => {
    if (!alertaSeleccionada) return;
    setGuardandoNota(true);
    try {
      const personaAsignada = asignables.find(p => p.usuario === asignadoATemp);
      await axios.post(`${apiUrl}/api/alertas/gestion`, {
        host: alertaSeleccionada.host,
        tipo: alertaSeleccionada.tipo,
        grupo: alertaSeleccionada.grupo,
        nota: notaNueva.trim() || null,
        estado: estadoNuevo,
        asignadoA: asignadoATemp || null,
        asignadoANombre: personaAsignada?.nombre || null
      }, { headers });
      const notaGuardada = notaNueva.trim();
      const nuevaEntradaNota = notaGuardada ? { texto: notaGuardada, autor: usuario?.nombre || 'Yo', fecha: { _seconds: Date.now() / 1000 } } : null;
      setNotaNueva('');
      // Actualización local de la gestión — sin volver a leer toda la colección
      setGestionMap(prev => {
        const anterior = prev[alertaSeleccionada.clave] || { notas: [] };
        const notas = nuevaEntradaNota ? [...(anterior.notas || []), nuevaEntradaNota] : (anterior.notas || []);
        return { ...prev, [alertaSeleccionada.clave]: { ...anterior, estado: estadoNuevo, asignadoA: asignadoATemp || null, asignadoANombre: personaAsignada?.nombre || null, notas } };
      });
      abrirGestion({ ...alertaSeleccionada, asignadoA: asignadoATemp || null });
    } catch (err) {
      setError('Error guardando gestión: ' + (err.response?.data?.error || err.message));
    } finally {
      setGuardandoNota(false);
    }
  };

  // ============ ANÁLISIS IA (GROQ) ============
  const generarAnalisisIA = async () => {
    if (!resumen || reiterativas.length === 0) return;
    setCargandoIA(true);
    setErrorIA(null);
    setAnalisisIA(null);
    try {
      const listado = reiterativas.slice(0, 40)
        .map(r => `- [${r.grupo}] ${r.host} — ${r.tipo} (${r.veces} veces, gestión: ${ESTADOS[r.estadoGestion] || r.estadoGestion})`)
        .join('\n');

      const systemMsg = 'Eres un analista de operaciones cloud/middleware experto en Kyndryl Chile. Agrupa alertas reiterativas por causa raíz real. Responde SOLO con JSON válido y completo, sin texto adicional ni bloques de código.';

      const userMsg = `Analiza estas ${reiterativas.length} alertas reiterativas (3+ veces) de las últimas semanas:

${listado}

Totales: ${resumen.total} alertas totales, ${resumen.criticas} críticas, ${resumen.sinGestion} reiterativas sin gestión.

REGLAS DE AGRUPACIÓN:
1. Agrupa por CAUSA RAÍZ real (ej: "Filesystem/Almacenamiento", "Memoria RAM/SWAP", "Middleware JMX/Threads", "Balanceadores/Red", "Kubernetes/Recursos"), no por host individual.
2. Cada grupo debe listar los hosts más afectados dentro de esa categoría.
3. La prioridad es "alta" si algún host del grupo supera 10 veces o está sin gestión, "media" si está entre 5-10, "baja" si es menor.

Responde SOLO con este JSON sin markdown:
{"grupos":[{"nombre":"string","descripcion":"string","alertas":0,"hosts_afectados":0,"prioridad":"alta|media|baja","top_hosts":["host1","host2"],"recomendacion":"string max 120 chars"}],"resumen_ejecutivo":"string","host_mas_critico":"string","patron_principal":"string"}`;

      let respuestaTexto = '';
      try {
        const data = await llamarGroq(
          [
            { role: 'system', content: systemMsg },
            { role: 'user', content: userMsg }
          ],
          { temperature: 0.2, maxTokens: 2000 }
        );
        respuestaTexto = data.choices?.[0]?.message?.content || '';
      } catch (err) {
        console.warn('Error llamando a GROQ:', err.message);
      }

      if (!respuestaTexto) throw new Error('No se pudo obtener respuesta de ningún modelo GROQ disponible.');

      let limpio = respuestaTexto.replace(/```json/gi, '').replace(/```/g, '').trim();
      if (!limpio.endsWith('}')) {
        const lastBrace = limpio.lastIndexOf('}');
        if (lastBrace !== -1) {
          limpio = limpio.substring(0, lastBrace + 1);
          const openBraces = (limpio.match(/{/g) || []).length;
          const closeBraces = (limpio.match(/}/g) || []).length;
          for (let i = 0; i < openBraces - closeBraces; i++) limpio += '}';
        }
      }

      const parsed = JSON.parse(limpio);
      if (!parsed.grupos || !Array.isArray(parsed.grupos)) {
        throw new Error('La IA no devolvió el formato esperado. Intenta de nuevo.');
      }
      // El % lo calculamos nosotros (matemática exacta) — no le pedimos a la IA que lo calcule
      const totalAlertasReiterativas = parsed.grupos.reduce((sum, g) => sum + (g.alertas || 0), 0) || 1;
      parsed.grupos = parsed.grupos.map(g => ({ ...g, porcentaje: ((g.alertas || 0) / totalAlertasReiterativas) * 100 }));
      setAnalisisIA(parsed);
    } catch (err) {
      setErrorIA('Error generando análisis IA: ' + err.message + '. Verifica que REACT_APP_GROQ_API_KEY esté configurado.');
    } finally {
      setCargandoIA(false);
    }
  };

  // ============ DATOS DEL GRÁFICO DE TENDENCIA ============
  const datosTendencia = resumen?.tendenciaSemanal && Object.keys(resumen.tendenciaSemanal).length > 0 ? (() => {
    const labels = Object.keys(resumen.tendenciaSemanal)
      .sort((a, b) => parseInt(a.replace('Sem ', ''), 10) - parseInt(b.replace('Sem ', ''), 10));
    return {
      labels,
      datasets: [
        {
          label: 'Total',
          data: labels.map(k => resumen.tendenciaSemanal[k].Critical + resumen.tendenciaSemanal[k].Major + resumen.tendenciaSemanal[k].otros),
          borderColor: '#12344e',
          backgroundColor: 'rgba(18,52,78,0.08)',
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: '#12344e'
        }
      ]
    };
  })() : null;

  // Detalle por semana — para mostrar debajo del gráfico al hacer clic en un punto
  const detallePorSemana = React.useMemo(() => {
    const detalle = {};
    alertasFiltradas.forEach(a => {
      const fecha = fechaDeAlerta(a);
      if (!fecha) return;
      const onejan = new Date(fecha.getFullYear(), 0, 1);
      const semanaNum = Math.ceil((((fecha - onejan) / 86400000) + onejan.getDay() + 1) / 7);
      const key = `Sem ${semanaNum}`;
      if (!detalle[key]) detalle[key] = { total: 0, criticas: 0, major: 0, otros: 0, porClave: {} };
      detalle[key].total++;
      if (a.gravedad === 'Critical') detalle[key].criticas++;
      else if (a.gravedad === 'Major') detalle[key].major++;
      else detalle[key].otros++;
      const clave = slugAlertaKeyFront(a.host, a.tipo);
      if (!detalle[key].porClave[clave]) detalle[key].porClave[clave] = { host: a.host || 'Desconocido', tipo: a.tipo, veces: 0 };
      detalle[key].porClave[clave].veces++;
    });
    return detalle;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertasFiltradas]);

  const [semanaSeleccionada, setSemanaSeleccionada] = useState(null);

  const tiposDisponibles = Array.from(new Set(reiterativas.map(a => a.tipo))).sort();

  const reiterativasFiltradas = reiterativas.filter(a => {
    if (busquedaHost && !a.host.toLowerCase().includes(busquedaHost.toLowerCase())) return false;
    if (tipoFiltro && a.tipo !== tipoFiltro) return false;
    return true;
  });

  const totalPaginas = Math.max(1, Math.ceil(reiterativasFiltradas.length / POR_PAGINA));
  const reiterativasPagina = reiterativasFiltradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  return (
    <div>
      {/* UPLOAD */}
      <div
        style={{ border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', background: 'var(--glass)', boxShadow: 'var(--shadow-soft)', backdropFilter: 'blur(18px)', padding: '18px 22px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }}
        onClick={() => fileRef.current?.click()}
      >
        <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-bell" aria-hidden="true" style={{ fontSize: '18px', color: '#fff' }}></i>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', marginBottom: '2px', letterSpacing: '-.01em' }}>
            {subiendo ? 'Procesando archivo...' : 'Importar alertas semanales (Excel)'}
          </div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)' }}>
            Acumulativo · hojas "Operaciones Cloud" / "Middleware Cloud" · duplicados se omiten automáticamente
          </div>
        </div>
        {ultimaCarga && (
          <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace", color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>
            Última carga:<br />{ultimaCarga}
          </div>
        )}
        <button
          disabled={subiendo}
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
          style={{ padding: '10px 18px', background: subiendo ? 'var(--muted)' : 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color: '#fff', border: 'none', borderRadius: '999px', fontWeight: '900', fontSize: '12px', cursor: subiendo ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', boxShadow: '0 12px 28px rgba(0,59,113,0.24)', flexShrink: 0 }}
        >
          {subiendo ? 'Cargando...' : 'Seleccionar archivo'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files[0]) procesarExcel(e.target.files[0]); e.target.value = ''; }}
        />
      </div>

      {mensajeSubida && (
        <div style={{
          background: mensajeSubida.tipo === 'error' ? 'rgba(215,59,71,0.08)' : 'rgba(32,166,106,0.1)',
          border: `1px solid ${mensajeSubida.tipo === 'error' ? 'rgba(215,59,71,0.24)' : 'rgba(32,166,106,0.24)'}`,
          borderRadius: '14px', padding: '10px 16px', fontSize: '13px', fontWeight: '600', marginBottom: '18px',
          color: mensajeSubida.tipo === 'error' ? '#a61e2b' : '#116642'
        }}>
          {mensajeSubida.texto}
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(215,59,71,0.08)', border: '1px solid rgba(215,59,71,0.24)', borderRadius: '14px', padding: '10px 16px', color: '#a61e2b', fontSize: '13px', fontWeight: '600', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <span>{error}</span>
          <button onClick={cargarDatos} style={{ flexShrink: 0, border: '1px solid rgba(215,59,71,0.3)', borderRadius: '999px', background: '#fff', color: '#a61e2b', padding: '6px 14px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>
            Reintentar
          </button>
        </div>
      )}

      {cargandoDatos ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px', fontWeight: '600' }}>Cargando datos de Firestore...</p>
      ) : (
        <>
          {/* FILTROS POR GRUPO */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['', 'Operaciones Cloud', 'Middleware Cloud'].map(g => (
                <button
                  key={g || 'todas'}
                  onClick={() => setGrupoFiltro(g)}
                  style={{
                    padding: '9px 16px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', cursor: 'pointer',
                    border: grupoFiltro === g ? 'none' : '1px solid var(--line)',
                    background: grupoFiltro === g ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'rgba(255,255,255,0.72)',
                    color: grupoFiltro === g ? '#fff' : 'var(--ink-800)'
                  }}
                >
                  {g || 'Todas'}
                </button>
              ))}
              <select
                value={mesFiltro}
                onChange={e => setMesFiltro(e.target.value)}
                style={{ border: '1px solid var(--line)', borderRadius: '999px', padding: '9px 16px', fontSize: '12px', fontWeight: '800', background: 'rgba(255,255,255,0.72)', color: 'var(--ink-800)' }}
              >
                <option value="">Todos los meses</option>
                {mesesDisponibles.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '800', color: 'var(--ink-800)', cursor: 'pointer', padding: '9px 14px', border: '1px solid var(--line)', borderRadius: '999px', background: soloMisAsignadas ? 'rgba(37,99,235,0.1)' : 'rgba(255,255,255,0.72)' }}>
                <input type="checkbox" checked={soloMisAsignadas} onChange={e => setSoloMisAsignadas(e.target.checked)} />
                Solo mis asignadas
              </label>
            </div>
            {usuario?.rol === 'admin' && (
              <button
                onClick={reiniciarDatos}
                disabled={reiniciando}
                style={{ border: 'none', background: 'none', color: 'var(--muted)', fontSize: '11px', fontWeight: '700', cursor: reiniciando ? 'not-allowed' : 'pointer', textDecoration: 'underline' }}
              >
                {reiniciando ? 'Reiniciando...' : 'Reiniciar datos e importar de nuevo'}
              </button>
            )}
          </div>

          {/* BUSCADOR + FILTRO POR TIPO */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Buscar por host..."
              value={busquedaHost}
              onChange={e => setBusquedaHost(e.target.value)}
              style={{ flex: '1 1 220px', border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px', background: 'rgba(255,255,255,0.84)', color: 'var(--ink-950)' }}
            />
            <select
              value={tipoFiltro}
              onChange={e => setTipoFiltro(e.target.value)}
              style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px', fontWeight: '600', background: 'rgba(255,255,255,0.84)', color: 'var(--ink-950)', minWidth: '200px' }}
            >
              <option value="">Todos los tipos</option>
              {tiposDisponibles.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* KPIs */}
          <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', marginBottom: '12px' }}>
            <KPI label="Alertas totales" value={resumen?.total ?? 0} sub="en el período cargado" />
            <KPI label="Críticas" value={resumen?.criticas ?? 0} sub="gravedad Critical" color="var(--danger)" />
            <KPI label={`Reiterativas (>${UMBRAL_REITERATIVA - 1}x)`} value={resumen?.reiterativas ?? 0} sub="mismo host + tipo" color="var(--warning)" />
            <KPI label="Sin gestión" value={resumen?.sinGestion ?? 0} sub="reiterativas sin nota" />
          </div>

          {/* TENDENCIA */}
          {datosTendencia && (
            <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: '18px', boxShadow: 'var(--shadow-soft)', backdropFilter: 'blur(18px)', marginBottom: '12px' }}>
              <div style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', letterSpacing: '-.01em', marginBottom: '10px' }}>
                Tendencia semanal de alertas — toca un punto para ver el detalle
              </div>
              <div style={{ height: 220 }}>
                <Line
                  data={datosTendencia}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } },
                    onClick: (evt, elements) => {
                      if (elements.length > 0) {
                        const idx = elements[0].index;
                        setSemanaSeleccionada(datosTendencia.labels[idx]);
                      }
                    },
                    onHover: (evt, elements) => {
                      evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                    }
                  }}
                />
              </div>

              {semanaSeleccionada && detallePorSemana[semanaSeleccionada] && (() => {
                const d = detallePorSemana[semanaSeleccionada];
                const topClaves = Object.values(d.porClave).sort((a, b) => b.veces - a.veces).slice(0, 5);
                return (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)' }}>Detalle {semanaSeleccionada}</span>
                      <button onClick={() => setSemanaSeleccionada(null)} style={{ border: 'none', background: 'none', color: 'var(--muted)', fontSize: '11px', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}>Cerrar</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                      <div style={{ background: 'rgba(18,52,78,0.06)', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--ink-950)' }}>{d.total}</div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Total</div>
                      </div>
                      <div style={{ background: 'rgba(215,59,71,0.08)', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#a61e2b' }}>{d.criticas}</div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Critical</div>
                      </div>
                      <div style={{ background: 'rgba(86,217,217,0.1)', borderRadius: '10px', padding: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#0e7490' }}>{d.major}</div>
                        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Major</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', marginBottom: '6px' }}>Hosts más activos esa semana:</div>
                    {topClaves.map((c, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', padding: '4px 0', color: 'var(--ink-800)' }}>
                        <span>{c.host} — {c.tipo}</span>
                        <span style={{ fontWeight: '800' }}>{c.veces}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* RANKING REITERATIVAS */}
          <p className="panel-label" style={{ marginBottom: '6px' }}>Ranking de alertas reiterativas</p>
          <div className="tabla-responsive" style={{ marginBottom: '10px' }}>
            <table className="tabla" style={{ fontSize: '13px' }}>
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: 'center' }}>Veces</th>
                  <th>Grupo</th>
                  <th>Antigüedad</th>
                  <th>Asignado a</th>
                  <th>Estado gestión</th>
                  <th>Última nota</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reiterativasPagina.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: '600' }}>Sin alertas reiterativas que coincidan.</td></tr>
                )}
                {reiterativasPagina.map(a => (
                  <tr key={a.clave} style={{ cursor: 'pointer' }} onClick={() => abrirGestion(a)}>
                    <td>{a.host}</td>
                    <td>{a.tipo}</td>
                    <td className="numero" style={{ textAlign: 'center' }}>{a.veces}</td>
                    <td>{a.grupo}</td>
                    <td>
                      <span style={{
                        fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap',
                        background: a.etiqueta?.tipo === 'nuevo' ? 'rgba(37,99,235,0.12)' : 'rgba(107,114,128,0.12)',
                        color: a.etiqueta?.tipo === 'nuevo' ? '#1d4ed8' : '#4b5563'
                      }}>
                        {a.etiqueta?.texto}
                      </span>
                    </td>
                    <td style={{ color: a.asignadoANombre ? 'var(--ink-800)' : 'var(--muted)', fontWeight: a.asignadoANombre ? '700' : '400' }}>
                      {a.asignadoANombre || 'Sin asignar'}
                    </td>
                    <td><PillEstado estado={a.estadoGestion} /></td>
                    <td style={{ color: 'var(--muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.ultimaNota || 'Sin nota'}
                    </td>
                    <td className="acciones">
                      <button className="btn-editar" onClick={(e) => { e.stopPropagation(); abrirGestion(a); }}>Ver detalle</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
                style={{ border: '1px solid var(--line)', borderRadius: '999px', background: 'rgba(255,255,255,0.72)', color: pagina === 1 ? 'var(--muted)' : 'var(--ink-800)', padding: '7px 14px', fontSize: '12px', fontWeight: '800', cursor: pagina === 1 ? 'not-allowed' : 'pointer' }}
              >
                Anterior
              </button>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted)' }}>Página {pagina} de {totalPaginas}</span>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
                style={{ border: '1px solid var(--line)', borderRadius: '999px', background: 'rgba(255,255,255,0.72)', color: pagina === totalPaginas ? 'var(--muted)' : 'var(--ink-800)', padding: '7px 14px', fontSize: '12px', fontWeight: '800', cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer' }}
              >
                Siguiente
              </button>
            </div>
          )}

          {/* ANÁLISIS IA */}
          <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: '18px 22px', boxShadow: 'var(--shadow-soft)', backdropFilter: 'blur(18px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', letterSpacing: '-.01em' }}>
                <i className="ti ti-sparkles" aria-hidden="true" style={{ marginRight: 6, color: 'var(--signal)' }}></i>
                Análisis IA semanal
              </div>
              <button
                onClick={generarAnalisisIA}
                disabled={cargandoIA || !resumen}
                style={{ border: '1px solid var(--line)', borderRadius: '999px', background: 'rgba(255,255,255,0.72)', color: 'var(--ink-800)', padding: '9px 16px', fontSize: '12px', fontWeight: '800', cursor: cargandoIA ? 'not-allowed' : 'pointer' }}
              >
                {cargandoIA ? 'Analizando...' : 'Generar análisis'}
              </button>
            </div>

            {errorIA && <p style={{ fontSize: '13px', color: '#a61e2b', fontWeight: '600' }}>{errorIA}</p>}

            {cargandoIA && (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                <p style={{ fontWeight: '600', fontSize: '13px' }}>La IA está agrupando las alertas por causa raíz...</p>
              </div>
            )}

            {analisisIA && !cargandoIA && (
              <>
                <div style={{ background: 'rgba(0,59,113,0.07)', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '16px', marginBottom: '18px' }}>
                  <div style={{ fontWeight: '700', color: 'var(--bank-blue)', marginBottom: '8px', fontSize: '13px' }}>Resumen ejecutivo</div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#1e3a8a', lineHeight: '1.6' }}>{analisisIA.resumen_ejecutivo}</p>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '12px', flexWrap: 'wrap' }}>
                    <span><strong>Host más crítico:</strong> {analisisIA.host_mas_critico}</span>
                    <span><strong>Patrón principal:</strong> {analisisIA.patron_principal}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                  {(analisisIA.grupos || []).sort((a, b) => (b.alertas || 0) - (a.alertas || 0)).map((grupo, idx) => {
                    const colores = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d'];
                    const color = colores[idx % colores.length];
                    const prioridadEtiqueta = { alta: 'Prioridad alta', media: 'Prioridad media', baja: 'Prioridad baja' }[grupo.prioridad] || grupo.prioridad;
                    return (
                      <div key={idx} style={{ background: 'white', border: `2px solid ${color}20`, borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ background: color, padding: '12px 14px', color: 'white' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '13px' }}>{grupo.nombre}</strong>
                            <span style={{ fontSize: '10px', opacity: 0.9, fontWeight: '700' }}>{prioridadEtiqueta}</span>
                          </div>
                          <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '4px' }}>{grupo.descripcion}</div>
                        </div>
                        <div style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px', textAlign: 'center' }}>
                            <div style={{ background: `${color}10`, borderRadius: '10px', padding: '8px' }}>
                              <div style={{ fontSize: '16px', fontWeight: '800', color }}>{grupo.alertas}</div>
                              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Alertas</div>
                            </div>
                            <div style={{ background: `${color}10`, borderRadius: '10px', padding: '8px' }}>
                              <div style={{ fontSize: '16px', fontWeight: '800', color }}>{grupo.hosts_afectados}</div>
                              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Hosts</div>
                            </div>
                            <div style={{ background: `${color}10`, borderRadius: '10px', padding: '8px' }}>
                              <div style={{ fontSize: '16px', fontWeight: '800', color }}>{(grupo.porcentaje || 0).toFixed(0)}%</div>
                              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Del total</div>
                            </div>
                          </div>
                          {grupo.top_hosts?.length > 0 && (
                            <div style={{ marginBottom: '10px' }}>
                              <div style={{ fontSize: '11px', fontWeight: '700', color: '#12344e', marginBottom: '5px' }}>Hosts más afectados:</div>
                              {grupo.top_hosts.map((h, i) => (
                                <div key={i} style={{ fontSize: '11.5px', color: 'var(--muted)', padding: '2px 0' }}>· {h}</div>
                              ))}
                            </div>
                          )}
                          {grupo.recomendacion && (
                            <div style={{ background: 'rgba(238,245,248,0.7)', borderLeft: `3px solid ${color}`, padding: '8px 10px', borderRadius: '0 6px 6px 0', fontSize: '11.5px', color: '#12344e' }}>
                              {grupo.recomendacion}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {!analisisIA && !errorIA && !cargandoIA && (
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0, fontWeight: '600' }}>Genera un resumen de tendencias y recomendaciones sobre las alertas reiterativas.</p>
            )}
          </div>
        </>
      )}

      {/* MODAL DE GESTIÓN */}
      {alertaSeleccionada && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,24,38,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'var(--paper-50)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', boxShadow: 'var(--shadow-lift)', padding: '22px', width: 480, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <p style={{ fontWeight: '800', margin: 0, color: 'var(--ink-950)', letterSpacing: '-.01em' }}>{alertaSeleccionada.host}</p>
                <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '2px 0 0', fontWeight: '600' }}>{alertaSeleccionada.tipo} · {alertaSeleccionada.veces} veces</p>
              </div>
              <button
                onClick={() => { setAlertaSeleccionada(null); setHistorialGestion(null); setAlertasAsociadas(null); setTicketSeleccionado(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px', padding: '4px' }}
              >
                <i className="ti ti-x" aria-hidden="true"></i>
              </button>
            </div>

            <p style={{ fontSize: '12px', fontWeight: '800', margin: '0 0 8px', color: 'var(--ink-950)', letterSpacing: '-.01em' }}>
              Alertas asociadas {alertasAsociadas ? `(${alertasAsociadas.length})` : ''}
            </p>
            {!alertasAsociadas && <p style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '600' }}>Cargando...</p>}
            {alertasAsociadas?.length === 0 && <p style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '600' }}>Sin registros individuales.</p>}
            <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '18px' }}>
              {alertasAsociadas?.map(t => (
                <div key={t.id} onClick={() => setTicketSeleccionado(t)} style={{ borderTop: '1px solid var(--line)', padding: '8px 0', display: 'flex', justifyContent: 'space-between', gap: '8px', cursor: 'pointer' }}>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: '700', margin: 0, color: 'var(--bank-blue)' }}>{t.numero}</p>
                    <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '2px 0 0' }}>
                      {t.gravedad} · {t.creado?._seconds ? new Date(t.creado._seconds * 1000).toLocaleDateString('es-CL') : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', flexShrink: 0, alignSelf: 'center' }}>{t.estado}</span>
                </div>
              ))}
            </div>

            <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: '6px' }}>Estado</label>
            <select
              value={estadoNuevo}
              onChange={e => setEstadoNuevo(e.target.value)}
              style={{ width: '100%', marginBottom: '14px', border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', background: 'rgba(255,255,255,0.84)', color: 'var(--ink-950)', fontSize: '13px', fontWeight: '600' }}
            >
              {Object.entries(ESTADOS).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>{etiqueta}</option>
              ))}
            </select>

            <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: '6px' }}>Asignar a</label>
            <select
              value={asignadoATemp}
              onChange={e => setAsignadoATemp(e.target.value)}
              style={{ width: '100%', marginBottom: '14px', border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', background: 'rgba(255,255,255,0.84)', color: 'var(--ink-950)', fontSize: '13px', fontWeight: '600' }}
            >
              <option value="">Sin asignar</option>
              {asignables.map(p => (
                <option key={p.usuario} value={p.usuario}>{p.nombre} ({p.rol})</option>
              ))}
            </select>

            <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: '6px' }}>Nueva nota de gestión</label>
            <textarea
              value={notaNueva}
              onChange={e => setNotaNueva(e.target.value)}
              placeholder="Describe la acción tomada o el próximo paso"
              style={{ width: '100%', minHeight: '70px', marginBottom: '14px', border: '1px solid var(--line)', borderRadius: '12px', padding: '10px 14px', fontSize: '13px', fontFamily: 'inherit', background: 'rgba(255,255,255,0.84)', color: 'var(--ink-950)', resize: 'vertical' }}
            />

            <button
              onClick={guardarNota}
              disabled={guardandoNota}
              style={{ borderRadius: '999px', background: guardandoNota ? 'var(--muted)' : 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color: '#fff', padding: '10px 18px', fontSize: '13px', fontWeight: '900', border: 'none', boxShadow: '0 12px 28px rgba(0,59,113,0.22)', cursor: guardandoNota ? 'not-allowed' : 'pointer', marginBottom: '18px' }}
            >
              {guardandoNota ? 'Guardando...' : 'Guardar'}
            </button>

            <p style={{ fontSize: '12px', fontWeight: '800', margin: '0 0 8px', color: 'var(--ink-950)', letterSpacing: '-.01em' }}>Historial</p>
            {(!historialGestion?.notas || historialGestion.notas.length === 0) && (
              <p style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '600' }}>Sin notas registradas todavía.</p>
            )}
            {historialGestion?.notas?.slice().reverse().map((n, i) => (
              <div key={i} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
                <p style={{ fontSize: '13px', margin: 0, color: 'var(--ink-800)' }}>{n.texto}</p>
                <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '4px 0 0', fontWeight: '600' }}>
                  {n.autor} · {n.fecha?._seconds ? new Date(n.fecha._seconds * 1000).toLocaleString('es-CL') : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-MODAL: detalle completo de un ticket individual */}
      {ticketSeleccionado && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,24,38,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ background: 'var(--paper-50)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', boxShadow: 'var(--shadow-lift)', padding: '22px', width: 520, maxHeight: '82vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <p style={{ fontWeight: '800', margin: 0, color: 'var(--ink-950)', letterSpacing: '-.01em' }}>{ticketSeleccionado.numero}</p>
                <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '2px 0 0', fontWeight: '600' }}>{ticketSeleccionado.tipo}</p>
              </div>
              <button
                onClick={() => setTicketSeleccionado(null)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px', padding: '4px' }}
              >
                <i className="ti ti-x" aria-hidden="true"></i>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: '12px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Gravedad</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--ink-950)', marginTop: '2px' }}>{ticketSeleccionado.gravedad}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: '12px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Estado</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--ink-950)', marginTop: '2px' }}>{ticketSeleccionado.estado}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: '12px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Grupo</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--ink-950)', marginTop: '2px' }}>{ticketSeleccionado.grupo}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: '12px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Asignado a</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--ink-950)', marginTop: '2px' }}>{ticketSeleccionado.asignadoA || '—'}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: '12px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Evento inicial</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--ink-950)', marginTop: '2px' }}>
                  {ticketSeleccionado.horaEventoInicial?._seconds ? new Date(ticketSeleccionado.horaEventoInicial._seconds * 1000).toLocaleString('es-CL') : '—'}
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: '12px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Último evento</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--ink-950)', marginTop: '2px' }}>
                  {ticketSeleccionado.horaUltimoEvento?._seconds ? new Date(ticketSeleccionado.horaUltimoEvento._seconds * 1000).toLocaleString('es-CL') : '—'}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>Descripción breve</div>
            <p style={{ fontSize: '13px', color: 'var(--ink-800)', margin: '0 0 14px', lineHeight: 1.5 }}>{ticketSeleccionado.descripcionBreve || '—'}</p>

            <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>Descripción completa</div>
            <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: '12px', padding: '12px 14px', fontSize: '12.5px', color: 'var(--ink-800)', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: '220px', overflowY: 'auto' }}>
              {ticketSeleccionado.descripcion || 'Sin descripción disponible.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
