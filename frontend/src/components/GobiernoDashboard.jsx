import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);

const PALETA_DIST = ['#003b71', '#20a66a', '#f0a11a', '#d73b47', '#7f77dd', '#56d9d9', '#8a5a06', '#b4b2a9'];

const buildHeaders = (token, clienteActivo = '') => {
  const h = { Authorization: `Bearer ${token}` };
  if (clienteActivo) h['x-cliente-activo'] = clienteActivo;
  return h;
};

const ESTADOS = {
  sin_datos: { label: 'Sin datos', bg: 'rgba(107,114,128,0.12)', fg: '#4b5563' },
  al_dia: { label: 'Al día', bg: 'rgba(32,166,106,0.14)', fg: '#116642' },
  pendiente: { label: 'Pendiente', bg: 'rgba(240,161,26,0.15)', fg: '#8a5a06' },
  atrasado: { label: 'Atrasado', bg: 'rgba(215,59,71,0.12)', fg: '#a61e2b' }
};

const CATEGORIAS_ORDEN = ['Operación', 'Cumplimiento', 'Infraestructura', 'Continuidad', 'Estrategia'];

const PillEstado = ({ estado }) => {
  const c = ESTADOS[estado] || ESTADOS.sin_datos;
  return (
    <span style={{ background: c.bg, color: c.fg, fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  );
};

// Formatea un valor de indicador: si es una fracción (<=1) y el objetivo
// menciona "%", se muestra como porcentaje; si no, tal cual (número o texto).
const formatearValorIndicador = (valor, objetivo) => {
  const objetivoTexto = String(objetivo || '');
  if (typeof valor === 'number') {
    if (valor <= 1 && objetivoTexto.includes('%')) return `${(valor * 100).toFixed(1)}%`;
    return valor.toLocaleString('es-CL');
  }
  return valor === '' || valor === undefined || valor === null ? '—' : String(valor);
};

const iconoIndicador = (nombre) => {
  const n = String(nombre || '').toLowerCase();
  if (n.includes('total') || n.includes('universo')) return 'ti-server';
  if (n.includes('cobertura') || n.includes('template')) return 'ti-circle-check';
  if (n.includes('comunicaci')) return 'ti-plug-connected';
  if (n.includes('deshabilitad')) return 'ti-user-x';
  if (n.includes('zabbix')) return 'ti-plus';
  if (n.includes('grupo')) return 'ti-users';
  if (n.includes('monitor')) return 'ti-activity';
  return 'ti-chart-bar';
};

export default function GobiernoDashboard({ token, apiUrl, clienteActivo }) {
  const headers = buildHeaders(token, clienteActivo);
  const fileRef = useRef(null);

  const [subTab, setSubTab] = useState('panel'); // 'panel' | 'monitoreo' | 'config'

  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [modalItem, setModalItem] = useState(null);
  const [notaNueva, setNotaNueva] = useState('');
  const [guardando, setGuardando] = useState(false);

  // ============ MONITOREO (carga semanal de Excel) ============
  const [cargas, setCargas] = useState([]);
  const [cargandoMonitoreo, setCargandoMonitoreo] = useState(true);
  const [errorMonitoreo, setErrorMonitoreo] = useState(null);
  const [subiendoExcel, setSubiendoExcel] = useState(false);
  const [mensajeSubida, setMensajeSubida] = useState(null);
  const [pendientesModal, setPendientesModal] = useState(null); // { fecha, lista }
  const [cargandoPendientesId, setCargandoPendientesId] = useState(null);

  // ============ INVENTARIO (carga semanal de Excel, universo VM SO + AP) ============
  const fileInvRef = useRef(null);
  const [cargasInv, setCargasInv] = useState([]);
  const [cargandoInv, setCargandoInv] = useState(true);
  const [errorInv, setErrorInv] = useState(null);
  const [subiendoInv, setSubiendoInv] = useState(false);
  const [mensajeInv, setMensajeInv] = useState(null);
  const [parcheModal, setParcheModal] = useState(null); // { fecha, lista }
  const [cargandoParcheId, setCargandoParcheId] = useState(null);
  const [segmentoInv, setSegmentoInv] = useState('general'); // 'general' | 'vmSo' | 'ap'
  const [recalculandoId, setRecalculandoId] = useState(null);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await axios.get(`${apiUrl}/api/gobierno`, { headers });
      setItems(res.data);
    } catch (err) {
      setError('Error cargando gobierno de cuenta: ' + (err.response?.data?.error || err.message));
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, clienteActivo]);

  const cargarMonitoreo = useCallback(async () => {
    setCargandoMonitoreo(true);
    setErrorMonitoreo(null);
    try {
      const res = await axios.get(`${apiUrl}/api/gobierno/monitoreo`, { headers });
      setCargas(res.data);
    } catch (err) {
      setErrorMonitoreo('Error cargando el histórico de monitoreo: ' + (err.response?.data?.error || err.message));
    } finally {
      setCargandoMonitoreo(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, clienteActivo]);

  const cargarInventario = useCallback(async () => {
    setCargandoInv(true);
    setErrorInv(null);
    try {
      const res = await axios.get(`${apiUrl}/api/gobierno/inventario`, { headers });
      setCargasInv(res.data);
    } catch (err) {
      setErrorInv('Error cargando el histórico de inventario: ' + (err.response?.data?.error || err.message));
    } finally {
      setCargandoInv(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, clienteActivo]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);
  useEffect(() => { cargarMonitoreo(); }, [cargarMonitoreo]);
  useEffect(() => { cargarInventario(); }, [cargarInventario]);

  const abrirEditar = (item) => {
    setModalItem({ ...item });
    setNotaNueva('');
  };

  const guardarItem = async () => {
    if (!modalItem) return;
    setGuardando(true);
    try {
      const payload = {
        responsable: modalItem.responsable || '',
        frecuencia: modalItem.frecuencia || 'mensual',
        link: modalItem.link || '',
        nota: notaNueva
      };
      if (modalItem.tipo === 'kpi') {
        payload.valorActual = modalItem.valorActual === '' ? null : modalItem.valorActual;
        payload.unidad = modalItem.unidad || '%';
      } else {
        payload.estado = modalItem.estado || 'sin_datos';
      }
      await axios.put(`${apiUrl}/api/gobierno/${modalItem.id}`, payload, { headers });
      setModalItem(null);
      setNotaNueva('');
      cargarDatos();
    } catch (err) {
      setError('Error guardando: ' + (err.response?.data?.error || err.message));
    } finally {
      setGuardando(false);
    }
  };

  // ============ PARSEO DEL EXCEL DE MONITOREO ============
  // Estructura fija del reporte (Jenkins/Zabbix, hoja "KPI"):
  //   fila con "Generado: dd-mm-aaaa hh:mm"
  //   tabla con encabezados KPI | Valor | Objetivo | Cumple
  // Hoja "_datos_grafico": Estado | Cantidad
  // Hoja "Pendientes": título en fila 1, encabezados reales en fila 2
  const procesarExcelMonitoreo = async (file) => {
    setSubiendoExcel(true);
    setMensajeSubida(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });

      const hojaKPI = wb.Sheets['KPI'];
      if (!hojaKPI) throw new Error('No se encontró la hoja "KPI" en el archivo');
      const filasKPI = XLSX.utils.sheet_to_json(hojaKPI, { header: 1, defval: '' });

      let fechaGenerado = null;
      for (const f of filasKPI) {
        const m = /Generado:\s*(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/.exec(String(f[0] || ''));
        if (m) {
          const [, d, mo, y, h, mi] = m;
          fechaGenerado = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
          break;
        }
      }
      if (!fechaGenerado) fechaGenerado = new Date();

      const idxHeader = filasKPI.findIndex(f => f[0] === 'KPI' && f[1] === 'Valor');
      if (idxHeader === -1) throw new Error('No se encontró la tabla de indicadores (KPI/Valor/Objetivo/Cumple) en la hoja "KPI"');
      const indicadores = [];
      for (let i = idxHeader + 1; i < filasKPI.length; i++) {
        const f = filasKPI[i];
        if (!f[0]) break;
        indicadores.push({
          nombre: String(f[0]),
          valor: f[1],
          objetivo: String(f[2] ?? ''),
          cumple: f[3] === '✅' || f[3] === true
        });
      }
      if (indicadores.length === 0) throw new Error('La tabla de indicadores está vacía');

      let distribucion = [];
      const hojaDist = wb.Sheets['_datos_grafico'];
      if (hojaDist) {
        distribucion = XLSX.utils.sheet_to_json(hojaDist, { defval: '' }).map(r => ({
          estado: r['Estado'] || '',
          cantidad: Number(r['Cantidad']) || 0
        }));
      }

      let pendientes = [];
      const hojaPend = wb.Sheets['Pendientes'];
      if (hojaPend) {
        pendientes = XLSX.utils.sheet_to_json(hojaPend, { range: 1, defval: '' });
      }

      const resp = await axios.post(`${apiUrl}/api/gobierno/monitoreo/upload`, {
        fechaGenerado: fechaGenerado.toISOString(),
        indicadores,
        distribucion,
        pendientes
      }, { headers });

      if (resp.data.success) {
        setMensajeSubida({ tipo: 'success', texto: `Carga registrada: ${indicadores.length} indicadores, ${pendientes.length} equipos pendientes.` });
        cargarMonitoreo();
      }
    } catch (err) {
      setMensajeSubida({ tipo: 'error', texto: 'Error procesando el archivo: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSubiendoExcel(false);
    }
  };

  const verPendientes = async (carga) => {
    setCargandoPendientesId(carga.id);
    try {
      const res = await axios.get(`${apiUrl}/api/gobierno/monitoreo/${carga.id}/pendientes`, { headers });
      setPendientesModal({ fecha: carga.fecha, lista: res.data });
    } catch (err) {
      setMensajeSubida({ tipo: 'error', texto: 'Error cargando el detalle: ' + (err.response?.data?.error || err.message) });
    } finally {
      setCargandoPendientesId(null);
    }
  };

  // ============ PARSEO DEL EXCEL DE INVENTARIO ============
  // Hoja "INFRAESTRUCTURA": headers en la fila 1 (sin filas de título como
  // en Monitoreo). El universo administrado se define por
  // revision_fact ∈ ("VM SO","AP") — ese filtro ES la definición de
  // "administrado" (no se cruza con otras columnas). VM SO y AP tienen
  // objetivos de cumplimiento distintos, así que se agregan por separado
  // además del total general.
  const agregarSegmentoInventario = (filas) => {
    const total = filas.length;

    const aplicable = filas.filter(r => r['Parchado'] && r['Parchado'] !== 'NO APLICA');
    const ok = aplicable.filter(r => r['Parchado'] === 'SI');
    const parchado = { aplicable: aplicable.length, ok: ok.length, pct: aplicable.length ? +(100 * ok.length / aplicable.length).toFixed(1) : null };

    const ahora = new Date();
    const eol = { critico: 0, alto: 0, medio: 0, bajo: 0, sinDato: 0 };
    filas.forEach(r => {
      const efectiva = r['EOS Extendido SO'] || r['EOS SO'];
      if (!efectiva || !(efectiva instanceof Date) || isNaN(efectiva.getTime())) { eol.sinDato++; return; }
      const dias = Math.floor((efectiva - ahora) / (1000 * 60 * 60 * 24));
      if (dias < 0) eol.critico++;
      else if (dias <= 30) eol.alto++;
      else if (dias <= 180) eol.medio++;
      else eol.bajo++;
    });

    const distribucionDe = (campo, top) => {
      const conteo = {};
      filas.forEach(r => {
        let v = r[campo];
        v = (v === undefined || v === null || v === '') ? 'Sin dato' : String(v).trim().toUpperCase();
        conteo[v] = (conteo[v] || 0) + 1;
      });
      let entradas = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
      if (top && entradas.length > top) {
        const resto = entradas.slice(top).reduce((s, [, v]) => s + v, 0);
        entradas = entradas.slice(0, top).concat([['Otros', resto]]);
      }
      return entradas.map(([label, valor]) => ({ label, valor }));
    };

    const distribuciones = {
      entorno: distribucionDe('Ambiente'),
      nube: distribucionDe('Ubicación'),
      familiaSo: distribucionDe('Familia SO'),
      kpe: distribucionDe('KPE'),
      obsolescenciaSo: distribucionDe('Estado Obsolescencia SO'),
      hardening: distribucionDe('Hardening'),
      sistemaOperativo: distribucionDe('Sistema operativo', 8)
    };

    const hostnames = filas.map(r => String(r['Hostname'] || '')).filter(Boolean);
    const equiposParchePendiente = filas
      .filter(r => r['Parchado'] === 'NO - Sin Parche Vigente')
      .map(r => ({ hostname: r['Hostname'] || '', ambiente: r['Ambiente'] || '', ubicacion: r['Ubicación'] || '', sistemaOperativo: r['Sistema operativo'] || '' }));

    return { total, parchado, eol, distribuciones, hostnames, equiposParchePendiente };
  };

  // Columnas mínimas que se guardan por equipo para poder "Recalcular" una
  // carga después (por ejemplo si se agrega un indicador nuevo) sin tener
  // que volver a subir el Excel original.
  const COLUMNAS_BASE_INVENTARIO = ['revision_fact', 'Hostname', 'Parchado', 'EOS Extendido SO', 'EOS SO', 'Ambiente', 'Ubicación', 'Familia SO', 'KPE', 'Estado Obsolescencia SO', 'Hardening', 'Sistema operativo'];
  const filaBaseDe = (r) => {
    const out = {};
    COLUMNAS_BASE_INVENTARIO.forEach(c => { out[c] = r[c] ?? ''; });
    return out;
  };

  const procesarExcelInventario = async (file) => {
    setSubiendoInv(true);
    setMensajeInv(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

      const hoja = wb.Sheets['INFRAESTRUCTURA'];
      if (!hoja) throw new Error('No se encontró la hoja "INFRAESTRUCTURA" en el archivo');
      const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });

      const universo = filas.filter(r => r['revision_fact'] === 'VM SO' || r['revision_fact'] === 'AP');
      if (universo.length === 0) throw new Error('No se encontraron equipos con revision_fact "VM SO" o "AP"');

      const segmentos = {
        general: agregarSegmentoInventario(universo),
        vmSo: agregarSegmentoInventario(universo.filter(r => r['revision_fact'] === 'VM SO')),
        ap: agregarSegmentoInventario(universo.filter(r => r['revision_fact'] === 'AP'))
      };
      const filasBase = universo.map(filaBaseDe);

      const resp = await axios.post(`${apiUrl}/api/gobierno/inventario/upload`, { segmentos, filasBase }, { headers });

      if (resp.data.success) {
        const c = resp.data.cambios?.general || {};
        const cambiosTxto = c.altas !== null && c.altas !== undefined ? ` (${c.altas} altas, ${c.bajas} bajas)` : '';
        setMensajeInv({ tipo: 'success', texto: `Carga registrada: ${segmentos.general.total} equipos${cambiosTxto}.` });
        cargarInventario();
      }
    } catch (err) {
      setMensajeInv({ tipo: 'error', texto: 'Error procesando el archivo: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSubiendoInv(false);
    }
  };

  // Trae las filas crudas guardadas de una carga y vuelve a correr la misma
  // agregación (sin necesidad del Excel original) — útil cuando se agrega
  // un indicador/gráfico nuevo y las cargas viejas no lo tienen todavía.
  const recalcularCarga = async (carga) => {
    setRecalculandoId(carga.id);
    setMensajeInv(null);
    try {
      const res = await axios.get(`${apiUrl}/api/gobierno/inventario/${carga.id}/filas-base`, { headers });
      const filasBase = res.data || [];
      if (filasBase.length === 0) {
        setMensajeInv({ tipo: 'error', texto: 'Esta carga no tiene filas base guardadas (es de antes de esta función) — hay que volver a subir el Excel.' });
        return;
      }
      // Las fechas viajan como texto ISO por JSON; se reconvierten a Date
      // para que el cálculo de EOL/EOS funcione igual que en la carga original.
      const filas = filasBase.map(r => ({
        ...r,
        'EOS Extendido SO': r['EOS Extendido SO'] ? new Date(r['EOS Extendido SO']) : '',
        'EOS SO': r['EOS SO'] ? new Date(r['EOS SO']) : ''
      }));

      const nuevoGeneral = agregarSegmentoInventario(filas);
      const nuevoVmSo = agregarSegmentoInventario(filas.filter(r => r['revision_fact'] === 'VM SO'));
      const nuevoAp = agregarSegmentoInventario(filas.filter(r => r['revision_fact'] === 'AP'));

      const soloAgregados = (s) => ({ total: s.total, parchado: s.parchado, eol: s.eol, distribuciones: s.distribuciones, equiposParchePendiente: s.equiposParchePendiente });

      await axios.put(`${apiUrl}/api/gobierno/inventario/${carga.id}/recalcular`, {
        segmentos: { general: soloAgregados(nuevoGeneral), vmSo: soloAgregados(nuevoVmSo), ap: soloAgregados(nuevoAp) }
      }, { headers });

      setMensajeInv({ tipo: 'success', texto: `Carga del ${fmtFecha(carga.fecha)} recalculada correctamente.` });
      cargarInventario();
    } catch (err) {
      setMensajeInv({ tipo: 'error', texto: 'Error recalculando: ' + (err.response?.data?.error || err.message) });
    } finally {
      setRecalculandoId(null);
    }
  };

  const verParchePendiente = async (carga, segmento) => {
    setCargandoParcheId(carga.id);
    try {
      const res = await axios.get(`${apiUrl}/api/gobierno/inventario/${carga.id}/parche-pendiente`, { headers, params: { segmento } });
      setParcheModal({ fecha: carga.fecha, lista: res.data });
    } catch (err) {
      setMensajeInv({ tipo: 'error', texto: 'Error cargando el detalle: ' + (err.response?.data?.error || err.message) });
    } finally {
      setCargandoParcheId(null);
    }
  };

  const fmtFecha = (f) => f?._seconds ? new Date(f._seconds * 1000).toLocaleDateString('es-CL') : (f ? new Date(f).toLocaleDateString('es-CL') : '—');
  const fmtFechaHora = (f) => {
    const d = f?._seconds ? new Date(f._seconds * 1000) : new Date(f);
    return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const ultimaCarga = cargas[0] || null;
  const historicoAscendente = useMemo(() => [...cargas].reverse(), [cargas]);

  // Indicadores de la última carga, separados entre los que cumplen objetivo
  // y los que no, para la vista ejecutiva (Resumen general / Requieren atención)
  const indicadoresConObjetivo = useMemo(
    () => (ultimaCarga?.indicadores || []).filter(i => i.objetivo && i.objetivo !== '-'),
    [ultimaCarga]
  );
  const indicadoresFallando = useMemo(
    () => indicadoresConObjetivo.filter(i => !i.cumple),
    [indicadoresConObjetivo]
  );
  const indicadoresOk = useMemo(
    () => (ultimaCarga?.indicadores || []).filter(i => !indicadoresFallando.includes(i)),
    [ultimaCarga, indicadoresFallando]
  );

  const buscarIndicador = (indicadores, patron) =>
    (indicadores || []).find(i => patron.test(i.nombre || ''));

  const dataTendencia = useMemo(() => {
    const labels = historicoAscendente.map(c => fmtFecha(c.fecha));
    const cobertura = historicoAscendente.map(c => {
      const ind = buscarIndicador(c.indicadores, /cobertura/i);
      if (!ind || typeof ind.valor !== 'number') return null;
      return ind.valor <= 1 ? +(ind.valor * 100).toFixed(1) : ind.valor;
    });
    return {
      labels,
      datasets: [{
        label: 'Cobertura de monitoreo',
        data: cobertura,
        borderColor: '#20a66a',
        backgroundColor: 'rgba(32,166,106,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#20a66a',
        spanGaps: true
      }]
    };
  }, [historicoAscendente]);

  const ultimaCargaInv = cargasInv[0] || null;
  // Datos del segmento elegido (general/vmSo/ap) dentro de la última carga —
  // todo lo que se muestra en pantalla se deriva de este objeto.
  const segActualInv = ultimaCargaInv?.segmentos?.[segmentoInv] || null;
  const historicoAscendenteInv = useMemo(() => [...cargasInv].reverse(), [cargasInv]);

  const dataTendenciaInv = useMemo(() => {
    const labels = historicoAscendenteInv.map(c => fmtFecha(c.fecha));
    return {
      labels,
      datasets: [{
        label: 'Total equipos',
        data: historicoAscendenteInv.map(c => c.segmentos?.[segmentoInv]?.total ?? null),
        borderColor: '#003b71',
        backgroundColor: 'rgba(0,59,113,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#003b71',
        spanGaps: true
      }]
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historicoAscendenteInv, segmentoInv]);

  const dataEolInv = useMemo(() => {
    const e = segActualInv?.eol || {};
    return {
      labels: ['Crítico (vencido)', 'Alto (≤30 días)', 'Medio (30-180 días)', 'Bajo (>180 días)', 'Sin dato'],
      valores: [e.critico || 0, e.alto || 0, e.medio || 0, e.bajo || 0, e.sinDato || 0],
      colores: ['#d73b47', '#f0a11a', '#eda100', '#20a66a', '#b4b2a9']
    };
  }, [segActualInv]);

  const dataObsSoInv = useMemo(() => {
    const entradas = segActualInv?.distribuciones?.obsolescenciaSo || [];
    const colorPorEtiqueta = { VIGENTE: '#20a66a', EXTENDIDO: '#f0a11a', OBSOLETO: '#d73b47', 'SIN DATO': '#b4b2a9' };
    return {
      labels: entradas.map(e => e.label),
      valores: entradas.map(e => e.valor),
      colores: entradas.map(e => colorPorEtiqueta[e.label] || '#7f77dd')
    };
  }, [segActualInv]);

  const dataHardeningInv = useMemo(() => {
    const entradas = segActualInv?.distribuciones?.hardening || [];
    const colorPorEtiqueta = { SI: '#20a66a', 'NO APLICA': '#b4b2a9', 'NO - FAR': '#f0a11a', 'NO - SIN LINEAMIENTO': '#d73b47', 'SIN DATO': '#7f77dd' };
    return {
      labels: entradas.map(e => e.label),
      valores: entradas.map(e => e.valor),
      colores: entradas.map(e => colorPorEtiqueta[e.label] || '#003b71')
    };
  }, [segActualInv]);

  const nombreSegmento = { general: 'Vista general', vmSo: 'VM SO', ap: 'AP' };

  // KPIs de resumen (pestaña Panel)
  const itemsEstado = items.filter(i => i.tipo === 'estado');
  const alDia = itemsEstado.filter(i => i.estado === 'al_dia').length;
  const pendientes = itemsEstado.filter(i => i.estado === 'pendiente').length;
  const atrasados = itemsEstado.filter(i => i.estado === 'atrasado').length;
  const kpis = items.filter(i => i.tipo === 'kpi');

  const porCategoria = {};
  items.forEach(i => { if (!porCategoria[i.categoria]) porCategoria[i.categoria] = []; porCategoria[i.categoria].push(i); });

  return (
    <div>
      {error && (
        <div style={{ background: 'rgba(215,59,71,0.08)', border: '1px solid rgba(215,59,71,0.24)', borderRadius: '14px', padding: '10px 16px', color: '#a61e2b', fontSize: '13px', fontWeight: '600', marginBottom: '18px' }}>
          {error}
        </div>
      )}

      {/* SUB-TABS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button
          onClick={() => setSubTab('panel')}
          style={{ padding: '9px 16px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', cursor: 'pointer',
            border: subTab === 'panel' ? 'none' : '1px solid var(--line)',
            background: subTab === 'panel' ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'rgba(255,255,255,0.72)',
            color: subTab === 'panel' ? '#fff' : 'var(--ink-800)' }}>
          Panel
        </button>
        <button
          onClick={() => setSubTab('monitoreo')}
          style={{ padding: '9px 16px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', cursor: 'pointer',
            border: subTab === 'monitoreo' ? 'none' : '1px solid var(--line)',
            background: subTab === 'monitoreo' ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'rgba(255,255,255,0.72)',
            color: subTab === 'monitoreo' ? '#fff' : 'var(--ink-800)' }}>
          <i className="ti ti-activity" aria-hidden="true" style={{ marginRight: 4 }}></i>Monitoreo
        </button>
        <button
          onClick={() => setSubTab('inventario')}
          style={{ padding: '9px 16px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', cursor: 'pointer',
            border: subTab === 'inventario' ? 'none' : '1px solid var(--line)',
            background: subTab === 'inventario' ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'rgba(255,255,255,0.72)',
            color: subTab === 'inventario' ? '#fff' : 'var(--ink-800)' }}>
          <i className="ti ti-server-2" aria-hidden="true" style={{ marginRight: 4 }}></i>Inventario
        </button>
        <button
          onClick={() => setSubTab('config')}
          style={{ padding: '9px 16px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', cursor: 'pointer',
            border: subTab === 'config' ? 'none' : '1px solid var(--line)',
            background: subTab === 'config' ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'rgba(255,255,255,0.72)',
            color: subTab === 'config' ? '#fff' : 'var(--ink-800)' }}>
          <i className="ti ti-settings" aria-hidden="true" style={{ marginRight: 4 }}></i>Configuración
        </button>
      </div>

      {/* ============ PANEL ============ */}
      {subTab === 'panel' && (
        cargando ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px', fontWeight: '600' }}>Cargando...</p>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kpis.length || 1}, minmax(0,1fr))`, gap: 10, marginBottom: 18 }}>
              {kpis.map(k => (
                <div key={k.id} style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '18px', padding: '14px', boxShadow: 'var(--shadow-soft)' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)' }}>{k.nombre}</div>
                  <div style={{ fontSize: '26px', fontWeight: '800', color: 'var(--ink-950)' }}>
                    {k.valorActual !== null && k.valorActual !== undefined ? `${k.valorActual}${k.unidad || '%'}` : '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Actualizado: {fmtFecha(k.actualizadoEn)}</div>
                </div>
              ))}
            </div>
            <div style={{ background: 'var(--glass)', border: '1px dashed rgba(255,255,255,0.72)', borderRadius: '22px', padding: '30px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
              El resto del panel se va a ir construyendo ítem por ítem — el resumen de Monitoreo se agrega acá una vez definido su formato final.
            </div>
          </div>
        )
      )}

      {/* ============ MONITOREO ============ */}
      {subTab === 'monitoreo' && (
        <div>
          {errorMonitoreo && (
            <div style={{ background: 'rgba(215,59,71,0.08)', border: '1px solid rgba(215,59,71,0.24)', borderRadius: '14px', padding: '10px 16px', color: '#a61e2b', fontSize: '13px', fontWeight: '600', marginBottom: '18px' }}>
              {errorMonitoreo}
            </div>
          )}

          {/* CARGA DE EXCEL */}
          <div
            style={{ border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', background: 'var(--glass)', boxShadow: 'var(--shadow-soft)', padding: '18px 22px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', flexWrap: 'wrap' }}
            onClick={() => fileRef.current?.click()}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-file-spreadsheet" aria-hidden="true" style={{ fontSize: '18px', color: '#fff' }}></i>
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', marginBottom: '2px' }}>
                {subiendoExcel ? 'Procesando archivo...' : 'Cargar reporte semanal de monitoreo (Excel)'}
              </div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)' }}>
                Hoja "KPI" + "_datos_grafico" + "Pendientes" · queda guardado como una carga nueva del histórico
              </div>
            </div>
            {ultimaCarga && (
              <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace", color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>
                Última carga:<br />{fmtFechaHora(ultimaCarga.fecha)}
              </div>
            )}
            <button
              disabled={subiendoExcel}
              onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
              style={{ padding: '10px 18px', background: subiendoExcel ? 'var(--muted)' : 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color: '#fff', border: 'none', borderRadius: '999px', fontWeight: '900', fontSize: '12px', cursor: subiendoExcel ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {subiendoExcel ? 'Cargando...' : 'Seleccionar archivo'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files[0]) procesarExcelMonitoreo(e.target.files[0]); e.target.value = ''; }}
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

          {cargandoMonitoreo ? (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px', fontWeight: '600' }}>Cargando...</p>
          ) : !ultimaCarga ? (
            <div style={{ background: 'var(--glass)', border: '1px dashed rgba(255,255,255,0.72)', borderRadius: '22px', padding: '30px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
              Todavía no hay ninguna carga. Sube el primer reporte semanal para empezar el histórico.
            </div>
          ) : (
            <>
              {/* Encabezado resumen: estado general de un vistazo */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--ink-950)' }}>Estado de infraestructura</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600' }}>Última carga: {fmtFechaHora(ultimaCarga.fecha)} · {ultimaCarga.cargadoPor}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {indicadoresFallando.length > 0 ? (
                    <span style={{ background: 'rgba(240,161,26,0.15)', color: '#8a5a06', fontSize: '11px', fontWeight: '800', padding: '7px 14px', borderRadius: '999px' }}>
                      {indicadoresFallando.length} de {indicadoresConObjetivo.length} indicadores fuera de objetivo
                    </span>
                  ) : (
                    <span style={{ background: 'rgba(32,166,106,0.14)', color: '#116642', fontSize: '11px', fontWeight: '800', padding: '7px 14px', borderRadius: '999px' }}>
                      Todos los indicadores en objetivo
                    </span>
                  )}
                  <span style={{
                    background: ultimaCarga.totalPendientes > 0 ? 'rgba(215,59,71,0.1)' : 'rgba(32,166,106,0.14)',
                    color: ultimaCarga.totalPendientes > 0 ? '#a61e2b' : '#116642',
                    fontSize: '11px', fontWeight: '800', padding: '7px 14px', borderRadius: '999px'
                  }}>
                    {ultimaCarga.totalPendientes} equipos por revisar
                  </span>
                </div>
              </div>

              {/* Resumen general (indicadores OK) */}
              <div style={{ fontSize: '10px', fontWeight: '800', color: 'var(--muted)', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8 }}>
                Resumen general
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
                {indicadoresOk.map((ind, i) => {
                  const tieneObjetivo = ind.objetivo && ind.objetivo !== '-';
                  return (
                    <div key={i} style={{
                      background: tieneObjetivo ? 'rgba(32,166,106,0.05)' : 'var(--glass)',
                      border: tieneObjetivo ? '1px solid rgba(32,166,106,0.25)' : '1px solid rgba(255,255,255,0.72)',
                      borderRadius: '16px', padding: '14px', boxShadow: 'var(--shadow-soft)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <i className={`ti ${iconoIndicador(ind.nombre)}`} aria-hidden="true" style={{ fontSize: '13px', color: tieneObjetivo ? '#20a66a' : 'var(--muted)' }}></i>
                        <span style={{ fontSize: '9px', fontWeight: '800', color: 'var(--muted)', letterSpacing: '.02em', textTransform: 'uppercase' }}>{ind.nombre}</span>
                      </div>
                      <div style={{ fontSize: '22px', fontWeight: '800', color: tieneObjetivo ? '#116642' : 'var(--ink-950)', fontFamily: "'IBM Plex Mono',monospace" }}>
                        {formatearValorIndicador(ind.valor, ind.objetivo)}
                      </div>
                      {tieneObjetivo && (
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#20a66a' }}>{ind.objetivo} objetivo</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Requieren atención (indicadores fuera de objetivo) */}
              {indicadoresFallando.length > 0 && (
                <>
                  <div style={{ fontSize: '10px', fontWeight: '800', color: '#a61e2b', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Requieren atención
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
                    {indicadoresFallando.map((ind, i) => (
                      <div key={i} style={{ background: 'rgba(215,59,71,0.06)', border: '1px solid rgba(215,59,71,0.22)', borderRadius: '16px', padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <i className={`ti ${iconoIndicador(ind.nombre)}`} aria-hidden="true" style={{ fontSize: '13px', color: '#a61e2b' }}></i>
                          <span style={{ fontSize: '9px', fontWeight: '800', color: 'var(--muted)', letterSpacing: '.02em', textTransform: 'uppercase' }}>{ind.nombre}</span>
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: '800', color: '#a61e2b', fontFamily: "'IBM Plex Mono',monospace" }}>
                          {formatearValorIndicador(ind.valor, ind.objetivo)}
                        </div>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#a61e2b' }}>objetivo {ind.objetivo}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Tendencia */}
              <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: '18px', boxShadow: 'var(--shadow-soft)', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', margin: 0 }}>Tendencia de cobertura</p>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '700' }}>
                    {cargas.length} {cargas.length === 1 ? 'carga' : 'cargas'} en el histórico
                  </span>
                </div>
                {cargas.length < 2 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#20a66a', flexShrink: 0 }}></div>
                    <div style={{ flex: 1, height: 1, background: 'var(--line)' }}></div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '700', whiteSpace: 'nowrap' }}>
                      Se necesitan al menos 2 cargas para trazar la tendencia
                    </div>
                  </div>
                ) : (
                  <div style={{ position: 'relative', height: '220px' }}>
                    <Line
                      data={dataTendencia}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                          y: { beginAtZero: false, ticks: { callback: v => `${v}%` } },
                          x: { grid: { display: false } }
                        }
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Histórico de cargas */}
              <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: '16px 18px', boxShadow: 'var(--shadow-soft)' }}>
                <p style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', margin: '0 0 10px' }}>Histórico de cargas</p>
                <div className="tabla-responsive">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Cobertura</th>
                        <th>Equipos por revisar</th>
                        <th>Subido por</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargas.map((c, i) => {
                        const cobertura = buscarIndicador(c.indicadores, /cobertura/i);
                        return (
                          <tr key={c.id} style={i === 0 ? { background: 'rgba(32,166,106,0.05)' } : undefined}>
                            <td style={{ fontWeight: '700' }}>
                              {fmtFecha(c.fecha)}{i === 0 && <span style={{ color: '#20a66a', fontSize: '10px', fontWeight: '800', marginLeft: 6 }}>· actual</span>}
                            </td>
                            <td style={{ fontWeight: '800', color: '#116642', fontFamily: "'IBM Plex Mono',monospace" }}>
                              {cobertura ? formatearValorIndicador(cobertura.valor, cobertura.objetivo) : '—'}
                            </td>
                            <td style={{ color: 'var(--muted)' }}>{c.totalPendientes} equipos</td>
                            <td style={{ color: 'var(--muted)' }}>{c.cargadoPor}</td>
                            <td className="acciones">
                              <button className="btn-editar" onClick={() => verPendientes(c)} disabled={cargandoPendientesId === c.id}>
                                {cargandoPendientesId === c.id ? 'Cargando...' : 'Ver detalle'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ INVENTARIO ============ */}
      {subTab === 'inventario' && (
        <div>
          {errorInv && (
            <div style={{ background: 'rgba(215,59,71,0.08)', border: '1px solid rgba(215,59,71,0.24)', borderRadius: '14px', padding: '10px 16px', color: '#a61e2b', fontSize: '13px', fontWeight: '600', marginBottom: '18px' }}>
              {errorInv}
            </div>
          )}

          {/* CARGA DE EXCEL */}
          <div
            style={{ border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', background: 'var(--glass)', boxShadow: 'var(--shadow-soft)', padding: '18px 22px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', flexWrap: 'wrap' }}
            onClick={() => fileInvRef.current?.click()}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-server-2" aria-hidden="true" style={{ fontSize: '18px', color: '#fff' }}></i>
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', marginBottom: '2px' }}>
                {subiendoInv ? 'Procesando archivo...' : 'Cargar inventario semanal (Excel CMDB)'}
              </div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)' }}>
                Hoja "INFRAESTRUCTURA" · universo = revision_fact en (VM SO, AP) · queda guardado como una carga nueva del histórico
              </div>
            </div>
            {ultimaCargaInv && (
              <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace", color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>
                Última carga:<br />{fmtFechaHora(ultimaCargaInv.fecha)}
              </div>
            )}
            <button
              disabled={subiendoInv}
              onClick={(e) => { e.stopPropagation(); fileInvRef.current?.click(); }}
              style={{ padding: '10px 18px', background: subiendoInv ? 'var(--muted)' : 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color: '#fff', border: 'none', borderRadius: '999px', fontWeight: '900', fontSize: '12px', cursor: subiendoInv ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {subiendoInv ? 'Cargando...' : 'Seleccionar archivo'}
            </button>
            <input
              ref={fileInvRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files[0]) procesarExcelInventario(e.target.files[0]); e.target.value = ''; }}
            />
          </div>

          {mensajeInv && (
            <div style={{
              background: mensajeInv.tipo === 'error' ? 'rgba(215,59,71,0.08)' : 'rgba(32,166,106,0.1)',
              border: `1px solid ${mensajeInv.tipo === 'error' ? 'rgba(215,59,71,0.24)' : 'rgba(32,166,106,0.24)'}`,
              borderRadius: '14px', padding: '10px 16px', fontSize: '13px', fontWeight: '600', marginBottom: '18px',
              color: mensajeInv.tipo === 'error' ? '#a61e2b' : '#116642'
            }}>
              {mensajeInv.texto}
            </div>
          )}

          {cargandoInv ? (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px', fontWeight: '600' }}>Cargando...</p>
          ) : !ultimaCargaInv ? (
            <div style={{ background: 'var(--glass)', border: '1px dashed rgba(255,255,255,0.72)', borderRadius: '22px', padding: '30px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
              Todavía no hay ninguna carga. Sube el primer inventario semanal para empezar el histórico.
            </div>
          ) : (
            <>
              {/* Selector de segmento: VM SO y AP tienen objetivos distintos */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--ink-950)' }}>{nombreSegmento[segmentoInv]}</div>
                <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.9)', border: '1px solid var(--line)', borderRadius: '999px', padding: 4 }}>
                  {['general', 'vmSo', 'ap'].map(seg => (
                    <button
                      key={seg}
                      onClick={() => setSegmentoInv(seg)}
                      style={{
                        padding: '7px 16px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', border: 'none', cursor: 'pointer',
                        background: segmentoInv === seg ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'transparent',
                        color: segmentoInv === seg ? '#fff' : 'var(--muted)'
                      }}
                    >
                      {nombreSegmento[seg]}
                    </button>
                  ))}
                </div>
              </div>

              {/* KPIs principales */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
                <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '16px', padding: '14px', boxShadow: 'var(--shadow-soft)' }}>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: 'var(--muted)', letterSpacing: '.03em', marginBottom: 6 }}>
                    {segmentoInv === 'general' ? 'TOTAL UNIVERSO' : `TOTAL ${nombreSegmento[segmentoInv]}`}
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--ink-950)', fontFamily: "'IBM Plex Mono',monospace" }}>{segActualInv?.total?.toLocaleString('es-CL')}</div>
                </div>
                {segmentoInv === 'general' && (
                  <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '16px', padding: '14px', boxShadow: 'var(--shadow-soft)' }}>
                    <div style={{ fontSize: '9px', fontWeight: '800', color: 'var(--muted)', letterSpacing: '.03em', marginBottom: 6 }}>VM SO / AP</div>
                    <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--ink-950)', fontFamily: "'IBM Plex Mono',monospace" }}>
                      {ultimaCargaInv.segmentos.vmSo?.total?.toLocaleString('es-CL')} <span style={{ fontSize: 13, color: 'var(--muted)' }}>/ {ultimaCargaInv.segmentos.ap?.total?.toLocaleString('es-CL')}</span>
                    </div>
                  </div>
                )}
                <div style={{ background: 'rgba(32,166,106,0.05)', border: '1px solid rgba(32,166,106,0.25)', borderRadius: '16px', padding: '14px' }}>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: 'var(--muted)', letterSpacing: '.03em', marginBottom: 6 }}>PARCHADO OK</div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#116642', fontFamily: "'IBM Plex Mono',monospace" }}>
                    {segActualInv?.parchado?.pct != null ? `${segActualInv.parchado.pct}%` : '—'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '700' }}>
                    {segActualInv?.parchado?.ok ?? 0} de {segActualInv?.parchado?.aplicable ?? 0} aplicables
                  </div>
                </div>
                <div style={{ background: 'rgba(215,59,71,0.05)', border: '1px solid rgba(215,59,71,0.22)', borderRadius: '16px', padding: '14px' }}>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: 'var(--muted)', letterSpacing: '.03em', marginBottom: 6 }}>EOL CRÍTICO + ALTO</div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#a61e2b', fontFamily: "'IBM Plex Mono',monospace" }}>
                    {((segActualInv?.eol?.critico || 0) + (segActualInv?.eol?.alto || 0)).toLocaleString('es-CL')}
                  </div>
                </div>
                <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '16px', padding: '14px', boxShadow: 'var(--shadow-soft)' }}>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: 'var(--muted)', letterSpacing: '.03em', marginBottom: 8 }}>VS. CARGA ANTERIOR</div>
                  {segActualInv?.cambios?.altas === null || segActualInv?.cambios?.altas === undefined ? (
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '700' }}>Sin comparación disponible</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div><div style={{ fontSize: 15, fontWeight: 800, color: '#116642', fontFamily: "'IBM Plex Mono',monospace" }}>+{segActualInv.cambios.altas}</div><div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>altas</div></div>
                      <div><div style={{ fontSize: 15, fontWeight: 800, color: '#a61e2b', fontFamily: "'IBM Plex Mono',monospace" }}>-{segActualInv.cambios.bajas}</div><div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>bajas</div></div>
                      <div><div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink-950)', fontFamily: "'IBM Plex Mono',monospace" }}>{segActualInv.cambios.neto >= 0 ? '+' : ''}{segActualInv.cambios.neto}</div><div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>neto</div></div>
                    </div>
                  )}
                </div>
              </div>

              {/* Obsolescencia EOL/EOS + Estado Obsolescencia SO + Hardening + Parchado + Top parche pendiente */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 18 }}>
                <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '16px', padding: '16px', boxShadow: 'var(--shadow-soft)' }}>
                  <p style={{ fontWeight: '800', fontSize: '12px', color: 'var(--ink-950)', margin: '0 0 2px' }}>Obsolescencia EOL/EOS</p>
                  <p style={{ fontSize: '10px', color: 'var(--muted)', margin: '0 0 10px' }}>por fecha real (EOS SO / EOS Extendido SO)</p>
                  <div style={{ position: 'relative', height: '120px' }}>
                    <Doughnut
                      data={{ labels: dataEolInv.labels, datasets: [{ data: dataEolInv.valores, backgroundColor: dataEolInv.colores, borderColor: '#fff', borderWidth: 2 }] }}
                      options={{ responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {dataEolInv.labels.map((lab, i) => {
                      const total = dataEolInv.valores.reduce((a, b) => a + b, 0) || 1;
                      return (
                        <div key={lab} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink-800)', marginBottom: 3 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 2, background: dataEolInv.colores[i], display: 'inline-block' }}></span>{lab}
                          </span>
                          <span style={{ fontWeight: 800 }}>{dataEolInv.valores[i]} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({(100 * dataEolInv.valores[i] / total).toFixed(1)}%)</span></span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '16px', padding: '16px', boxShadow: 'var(--shadow-soft)' }}>
                  <p style={{ fontWeight: '800', fontSize: '12px', color: 'var(--ink-950)', margin: '0 0 2px' }}>Estado Obsolescencia SO</p>
                  <p style={{ fontSize: '10px', color: 'var(--muted)', margin: '0 0 10px' }}>campo "Estado Obsolescencia SO"</p>
                  <div style={{ position: 'relative', height: '120px' }}>
                    <Doughnut
                      data={{ labels: dataObsSoInv.labels, datasets: [{ data: dataObsSoInv.valores, backgroundColor: dataObsSoInv.colores, borderColor: '#fff', borderWidth: 2 }] }}
                      options={{ responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {dataObsSoInv.labels.map((lab, i) => {
                      const total = dataObsSoInv.valores.reduce((a, b) => a + b, 0) || 1;
                      return (
                        <div key={lab} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink-800)', marginBottom: 3 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 2, background: dataObsSoInv.colores[i], display: 'inline-block' }}></span>{lab}
                          </span>
                          <span style={{ fontWeight: 800 }}>{dataObsSoInv.valores[i]} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({(100 * dataObsSoInv.valores[i] / total).toFixed(1)}%)</span></span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '16px', padding: '16px', boxShadow: 'var(--shadow-soft)' }}>
                  <p style={{ fontWeight: '800', fontSize: '12px', color: 'var(--ink-950)', margin: '0 0 2px' }}>Hardening</p>
                  <p style={{ fontSize: '10px', color: 'var(--muted)', margin: '0 0 10px' }}>campo "Hardening"</p>
                  <div style={{ position: 'relative', height: '120px' }}>
                    <Doughnut
                      data={{ labels: dataHardeningInv.labels, datasets: [{ data: dataHardeningInv.valores, backgroundColor: dataHardeningInv.colores, borderColor: '#fff', borderWidth: 2 }] }}
                      options={{ responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {dataHardeningInv.labels.map((lab, i) => {
                      const total = dataHardeningInv.valores.reduce((a, b) => a + b, 0) || 1;
                      return (
                        <div key={lab} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink-800)', marginBottom: 3 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 2, background: dataHardeningInv.colores[i], display: 'inline-block' }}></span>{lab}
                          </span>
                          <span style={{ fontWeight: 800 }}>{dataHardeningInv.valores[i]} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({(100 * dataHardeningInv.valores[i] / total).toFixed(1)}%)</span></span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '16px', padding: '16px', boxShadow: 'var(--shadow-soft)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ fontWeight: '800', fontSize: '12px', color: 'var(--ink-950)', alignSelf: 'flex-start', margin: '0 0 10px' }}>Cumplimiento Parches</p>
                  <div style={{ position: 'relative', width: 150, height: 90 }}>
                    <Doughnut
                      data={{ datasets: [{ data: [segActualInv?.parchado?.pct || 0, 100 - (segActualInv?.parchado?.pct || 0)], backgroundColor: ['#20a66a', 'var(--paper-100)'], borderWidth: 0 }] }}
                      options={{ responsive: true, maintainAspectRatio: false, circumference: 180, rotation: 270, cutout: '75%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }}
                    />
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#116642', fontFamily: "'IBM Plex Mono',monospace", marginTop: -38 }}>
                    {segActualInv?.parchado?.pct != null ? `${segActualInv.parchado.pct}%` : '—'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, marginTop: 14 }}>
                    {segActualInv?.parchado?.ok ?? 0} de {segActualInv?.parchado?.aplicable ?? 0} aplicables
                  </div>
                </div>

                <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '16px', padding: '16px', boxShadow: 'var(--shadow-soft)' }}>
                  <p style={{ fontWeight: '800', fontSize: '12px', color: 'var(--ink-950)', margin: '0 0 2px' }}>Top equipos con parche pendiente</p>
                  <p style={{ fontSize: '10px', color: 'var(--muted)', margin: '0 0 10px' }}>{segActualInv?.totalParchePendiente ?? 0} equipos "sin parche vigente" en {nombreSegmento[segmentoInv]}</p>
                  <button className="btn-editar" onClick={() => verParchePendiente(ultimaCargaInv, segmentoInv)} disabled={cargandoParcheId === ultimaCargaInv.id}>
                    {cargandoParcheId === ultimaCargaInv.id ? 'Cargando...' : 'Ver listado completo'}
                  </button>
                </div>
              </div>

              {/* Distribuciones */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: 10 }}>
                {[
                  ['Entorno', 'entorno'],
                  ['Nube', 'nube'],
                  ['Familia de S.O.', 'familiaSo'],
                  ['KPE', 'kpe']
                ].map(([titulo, clave]) => {
                  const datos = segActualInv?.distribuciones?.[clave] || [];
                  const total = datos.reduce((s, d) => s + d.valor, 0) || 1;
                  return (
                    <div key={clave} style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '16px', padding: '14px', boxShadow: 'var(--shadow-soft)' }}>
                      <p style={{ fontWeight: '800', fontSize: '11px', color: 'var(--ink-950)', margin: '0 0 8px' }}>{titulo}</p>
                      {datos.map((d, i) => (
                        <div key={d.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 9, color: 'var(--ink-800)', marginBottom: 4 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
                            <span style={{ width: 6, height: 6, borderRadius: 2, background: PALETA_DIST[i % PALETA_DIST.length], display: 'inline-block', flexShrink: 0 }}></span>{d.label}
                          </span>
                          <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{d.valor} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({(100 * d.valor / total).toFixed(1)}%)</span></span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Sistema Operativo: tarjeta ancha, sin truncar nombres */}
              <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '16px', padding: '16px', boxShadow: 'var(--shadow-soft)', marginBottom: 18 }}>
                <p style={{ fontWeight: '800', fontSize: '12px', color: 'var(--ink-950)', margin: '0 0 10px' }}>Sistema Operativo</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '6px 24px' }}>
                  {(segActualInv?.distribuciones?.sistemaOperativo || []).map((d, i) => {
                    const total = (segActualInv?.distribuciones?.sistemaOperativo || []).reduce((s, x) => s + x.valor, 0) || 1;
                    return (
                      <div key={d.label} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-800)', gap: 10, padding: '4px 0', borderBottom: '1px solid rgba(18,52,78,0.06)' }}>
                        <span style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: PALETA_DIST[i % PALETA_DIST.length], display: 'inline-block', flexShrink: 0, marginTop: 4 }}></span>
                          <span style={{ lineHeight: 1.35 }}>{d.label}</span>
                        </span>
                        <span style={{ fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 }}>{d.valor} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({(100 * d.valor / total).toFixed(1)}%)</span></span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tendencia */}
              <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: '18px', boxShadow: 'var(--shadow-soft)', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', margin: 0 }}>Evolución del total · {nombreSegmento[segmentoInv]}</p>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '700' }}>
                    {cargasInv.length} {cargasInv.length === 1 ? 'carga' : 'cargas'} en el histórico
                  </span>
                </div>
                {cargasInv.length < 2 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#003b71', flexShrink: 0 }}></div>
                    <div style={{ flex: 1, height: 1, background: 'var(--line)' }}></div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '700', whiteSpace: 'nowrap' }}>
                      Se necesitan al menos 2 cargas para trazar la tendencia
                    </div>
                  </div>
                ) : (
                  <div style={{ position: 'relative', height: '220px' }}>
                    <Line
                      data={dataTendenciaInv}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: false }, x: { grid: { display: false } } }
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Histórico de cargas */}
              <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: '16px 18px', boxShadow: 'var(--shadow-soft)' }}>
                <p style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', margin: '0 0 10px' }}>Histórico de cargas · {nombreSegmento[segmentoInv]}</p>
                <div className="tabla-responsive">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Total</th>
                        <th>Altas / Bajas</th>
                        <th>Parchado OK</th>
                        <th>Subido por</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargasInv.map((c, i) => {
                        const s = c.segmentos?.[segmentoInv] || {};
                        return (
                          <tr key={c.id} style={i === 0 ? { background: 'rgba(32,166,106,0.05)' } : undefined}>
                            <td style={{ fontWeight: '700' }}>
                              {fmtFecha(c.fecha)}{i === 0 && <span style={{ color: '#20a66a', fontSize: '10px', fontWeight: '800', marginLeft: 6 }}>· actual</span>}
                            </td>
                            <td style={{ fontWeight: '800', color: 'var(--ink-950)', fontFamily: "'IBM Plex Mono',monospace" }}>{s.total?.toLocaleString('es-CL')}</td>
                            <td style={{ color: 'var(--muted)' }}>
                              {s.cambios?.altas != null ? `+${s.cambios.altas} / -${s.cambios.bajas}` : '—'}
                            </td>
                            <td style={{ color: 'var(--muted)' }}>{s.parchado?.pct != null ? `${s.parchado.pct}%` : '—'}</td>
                            <td style={{ color: 'var(--muted)' }}>{c.cargadoPor}</td>
                            <td className="acciones">
                              <button className="btn-editar" onClick={() => verParchePendiente(c, segmentoInv)} disabled={cargandoParcheId === c.id}>
                                {cargandoParcheId === c.id ? 'Cargando...' : 'Ver parches'}
                              </button>
                              <button className="btn-editar" onClick={() => recalcularCarga(c)} disabled={recalculandoId === c.id} title="Vuelve a calcular los indicadores usando las filas guardadas de esta carga, sin subir el Excel de nuevo">
                                {recalculandoId === c.id ? 'Recalculando...' : 'Recalcular'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ CONFIGURACIÓN ============ */}
      {subTab === 'config' && (
        cargando ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px', fontWeight: '600' }}>Cargando...</p>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(32,166,106,0.1)', color: '#116642', fontSize: '12px', fontWeight: '800', padding: '8px 16px', borderRadius: '999px' }}>{alDia} al día</div>
              <div style={{ background: 'rgba(240,161,26,0.12)', color: '#8a5a06', fontSize: '12px', fontWeight: '800', padding: '8px 16px', borderRadius: '999px' }}>{pendientes} pendientes</div>
              <div style={{ background: 'rgba(215,59,71,0.1)', color: '#a61e2b', fontSize: '12px', fontWeight: '800', padding: '8px 16px', borderRadius: '999px' }}>{atrasados} atrasados</div>
            </div>

            {CATEGORIAS_ORDEN.filter(cat => porCategoria[cat]?.length).map(cat => (
              <div key={cat} style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: '16px 18px', boxShadow: 'var(--shadow-soft)', marginBottom: '14px' }}>
                <p style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', margin: '0 0 10px' }}>{cat}</p>
                <div className="tabla-responsive">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Ítem</th>
                        <th>Responsable</th>
                        <th>Frecuencia</th>
                        <th>Última act.</th>
                        <th>Estado / Valor</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {porCategoria[cat].map(item => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: '700' }}>{item.nombre}</td>
                          <td style={{ color: 'var(--muted)' }}>{item.responsable || '—'}</td>
                          <td style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>{item.frecuencia || '—'}</td>
                          <td style={{ color: 'var(--muted)' }}>{fmtFecha(item.actualizadoEn)}</td>
                          <td>
                            {item.tipo === 'kpi'
                              ? <span style={{ fontWeight: '800' }}>{item.valorActual !== null && item.valorActual !== undefined ? `${item.valorActual}${item.unidad || '%'}` : '—'}</span>
                              : <PillEstado estado={item.estado} />}
                          </td>
                          <td className="acciones">
                            <button className="btn-editar" onClick={() => abrirEditar(item)}>Editar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* MODAL EDITAR ÍTEM (Configuración) */}
      {modalItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,24,38,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--paper-50)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: 22, width: 460, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ fontWeight: '800', margin: 0, color: 'var(--ink-950)' }}>{modalItem.nombre}</p>
              <button onClick={() => setModalItem(null)} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 16px' }}>{modalItem.categoria}</p>

            {modalItem.tipo === 'kpi' ? (
              <>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Valor actual</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input type="number" value={modalItem.valorActual ?? ''} onChange={e => setModalItem({ ...modalItem, valorActual: e.target.value })}
                    style={{ flex: 1, border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px' }} />
                  <input type="text" value={modalItem.unidad || '%'} onChange={e => setModalItem({ ...modalItem, unidad: e.target.value })}
                    style={{ width: 60, border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 10px', fontSize: '13px' }} />
                </div>
              </>
            ) : (
              <>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Estado</label>
                <select value={modalItem.estado || 'sin_datos'} onChange={e => setModalItem({ ...modalItem, estado: e.target.value })}
                  style={{ width: '100%', marginBottom: 12, border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px', fontWeight: '600' }}>
                  {Object.entries(ESTADOS).map(([v, cfg]) => <option key={v} value={v}>{cfg.label}</option>)}
                </select>
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Responsable</label>
                <input type="text" value={modalItem.responsable || ''} onChange={e => setModalItem({ ...modalItem, responsable: e.target.value })}
                  style={{ width: '100%', border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Frecuencia</label>
                <select value={modalItem.frecuencia || 'mensual'} onChange={e => setModalItem({ ...modalItem, frecuencia: e.target.value })}
                  style={{ width: '100%', border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px', fontWeight: '600' }}>
                  <option value="semanal">Semanal</option>
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="continuo">Continuo</option>
                </select>
              </div>
            </div>

            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Link al reporte (opcional)</label>
            <input type="text" placeholder="https://..." value={modalItem.link || ''} onChange={e => setModalItem({ ...modalItem, link: e.target.value })}
              style={{ width: '100%', marginBottom: 12, border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px' }} />

            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nueva nota (opcional)</label>
            <textarea placeholder="Comentario, hallazgo, próxima acción..." value={notaNueva} onChange={e => setNotaNueva(e.target.value)}
              style={{ width: '100%', minHeight: 60, marginBottom: 14, border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px', fontFamily: 'inherit' }} />

            <button onClick={guardarItem} disabled={guardando}
              style={{ width: '100%', borderRadius: '999px', background: guardando ? 'var(--muted)' : 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color: '#fff', padding: '10px 18px', fontSize: '13px', fontWeight: '900', border: 'none', cursor: guardando ? 'not-allowed' : 'pointer', marginBottom: 16 }}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>

            <p style={{ fontSize: '12px', fontWeight: '800', margin: '0 0 8px' }}>Historial</p>
            {(!modalItem.notas || modalItem.notas.length === 0) && (
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Sin notas registradas todavía.</p>
            )}
            {modalItem.notas?.slice().reverse().map((n, i) => (
              <div key={i} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
                <p style={{ fontSize: '13px', margin: 0 }}>{n.texto}</p>
                <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '2px 0 0' }}>
                  {n.autor} · {fmtFecha(n.fecha)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL DETALLE DE EQUIPOS PENDIENTES (Monitoreo) */}
      {pendientesModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,24,38,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--paper-50)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: 22, width: 720, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ fontWeight: '800', margin: 0, color: 'var(--ink-950)' }}>Equipos por revisar · {fmtFecha(pendientesModal.fecha)}</p>
              <button onClick={() => setPendientesModal(null)} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 16px' }}>{pendientesModal.lista.length} equipos</p>

            {pendientesModal.lista.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Sin equipos pendientes en esta carga.</p>
            ) : (
              <div className="tabla-responsive">
                <table className="tabla" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th>Hostname</th>
                      <th>Ambiente</th>
                      <th>Estado Zabbix</th>
                      <th>Comunicación</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendientesModal.lista.map((eq, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: '700' }}>{eq['Hostname'] || '—'}</td>
                        <td style={{ color: 'var(--muted)' }}>{eq['Ambiente'] || '—'}</td>
                        <td style={{ color: 'var(--muted)' }}>{eq['ZBX_status'] || '—'}</td>
                        <td style={{ color: 'var(--muted)' }}>{eq['ZBX_Comunicacion'] || '—'}</td>
                        <td style={{ fontWeight: '700', color: '#a61e2b' }}>{eq['MOTIVO'] || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DETALLE DE EQUIPOS CON PARCHE PENDIENTE (Inventario) */}
      {parcheModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,24,38,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--paper-50)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: 22, width: 680, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ fontWeight: '800', margin: 0, color: 'var(--ink-950)' }}>Parche pendiente · {fmtFecha(parcheModal.fecha)}</p>
              <button onClick={() => setParcheModal(null)} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 16px' }}>{parcheModal.lista.length} equipos "sin parche vigente"</p>

            {parcheModal.lista.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Sin equipos con parche pendiente en esta carga.</p>
            ) : (
              <div className="tabla-responsive">
                <table className="tabla" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th>Hostname</th>
                      <th>Ambiente</th>
                      <th>Ubicación</th>
                      <th>Sistema Operativo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcheModal.lista.map((eq, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: '700' }}>{eq.hostname || '—'}</td>
                        <td style={{ color: 'var(--muted)' }}>{eq.ambiente || '—'}</td>
                        <td style={{ color: 'var(--muted)' }}>{eq.ubicacion || '—'}</td>
                        <td style={{ color: 'var(--muted)' }}>{eq.sistemaOperativo || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
