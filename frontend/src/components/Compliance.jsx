import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  ESTADOS_GESTION, parsearInventario, decodificar, aplicarFiltros, calcularVista, listaGestion,
  opcionesDe, claveHost, lunesDe, etiquetaSemana, aISO, esKyndryl, cargaCompleta, describirKyndryl, kyndrylDefinido, filtroActivo
} from '../utils/compliance';

// ============================================
// Módulo Compliance — pestaña Hardening (Vulnerabilidades y Parchado: próximamente)
// Fuente: inventario semanal (inventario_BCH.xlsx, hojas CMDB Banco / CMDB Banchile)
// Cumple = Adherencia de Hardening > umbral · vacío cuenta como 0 en el score
// Kyndryl = mismo universo sin las ubicaciones excluidas (GCP por defecto)
// ============================================

const ENTIDADES_UI = [{ id: 'banco', label: 'Banco' }, { id: 'banchile', label: 'Banchile' }];
const TAM_PAGINA = 50;
const COLOR_ESTADO = {
  'Pendiente': ['rgba(107,114,128,.14)', '#4b5563'],
  'En gestión': ['rgba(0,59,113,.12)', '#003b71'],
  'Escalado': ['rgba(240,161,26,.18)', '#8a5a06'],
  'Excepción': ['rgba(127,119,221,.16)', '#4b43a8'],
  'Resuelto': ['rgba(32,166,106,.16)', '#116642']
};

const cardStyle = { background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '18px', boxShadow: 'var(--shadow-soft)', padding: '14px' };
const labelStyle = { fontSize: '10px', fontWeight: 800, color: 'var(--muted)', display: 'block', marginBottom: 3, letterSpacing: '.03em' };
const inputStyle = { fontFamily: 'inherit', fontSize: '12px', border: '1px solid var(--line)', borderRadius: '10px', padding: '7px 10px', background: '#fff', color: 'var(--ink-950)', boxSizing: 'border-box' };

const fmt = (n, d = 1) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d });
const etq = (v) => (v === '' ? '(vacío)' : v);
const colorGauge = (p) => (p >= 95 ? '#2b5fb0' : p >= 90 ? '#e0a800' : '#c8402f');
const clonar = (x) => JSON.parse(JSON.stringify(x));
// Cada hoja (Banco / Banchile) tiene sus propios filtros por defecto y su propia definición de Kyndryl
const ajustesDesdeConfig = (cfg) => ({ banco: clonar(cfg.entidades.banco), banchile: clonar(cfg.entidades.banchile) });
const fechaCorta = (iso) => (iso ? iso.slice(5).split('-').reverse().join('/') : '');
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

// ---------- componentes de presentación (definidos a nivel de módulo) ----------

function Gauge({ pct }) {
  const largo = Math.PI * 50;
  const hay = pct !== null;
  const valor = hay ? Math.max(0, Math.min(100, pct)) : 0;
  const color = hay ? colorGauge(pct) : '#c9d1d6';
  return (
    <svg viewBox="0 0 120 70" width="120" height="70" role="img" aria-label={hay ? `${fmt(pct)}% cumple` : 'sin datos'}>
      <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="#e6e9ec" strokeWidth="14" />
      <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke={color} strokeWidth="14" strokeDasharray={`${(valor / 100) * largo} ${largo}`} />
      <text x="60" y="56" textAnchor="middle" fontSize="16" fontWeight="800" fill="#061826" fontFamily="'IBM Plex Mono',monospace">{hay ? `${fmt(pct)}%` : '—'}</text>
    </svg>
  );
}

function TarjetaGauge({ titulo, s }) {
  const pct = s.total ? (s.cumple / s.total) * 100 : null;
  const cifra = (rotulo, valor, color) => (
    <div>
      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{rotulo}</div>
      <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: "'IBM Plex Mono',monospace", color: color || 'var(--ink-950)' }}>{valor}</div>
    </div>
  );
  return (
    <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
      <div style={{ minWidth: 70, fontSize: '11px', fontWeight: 800, color: 'var(--ink-800)' }}>{titulo}</div>
      <Gauge pct={pct} />
      <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', textAlign: 'center' }}>
        {cifra('Total', s.total)}
        {cifra('Cumple', s.cumple, '#2b5fb0')}
        {cifra('No cumple', s.noCumple, '#a0452d')}
      </div>
    </div>
  );
}

function ColumnaMirada({ nombre, detalle, v, controlExtra }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink-950)' }}>{nombre}</div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-800)' }}>Total máquinas: {v.total.total}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{detalle}</div>
          {controlExtra && <div style={{ marginTop: 6 }}>{controlExtra}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink-950)' }}>SCORE: {v.total.score !== null ? `${fmt(v.total.score)} %` : '—'}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted)' }}>promedio adherencia{v.total.sinDato ? ` · ${v.total.sinDato} sin dato = 0` : ''}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <TarjetaGauge titulo="Total" s={v.total} />
        <TarjetaGauge titulo="Producción" s={v.prod} />
        <TarjetaGauge titulo="No producción" s={v.noProd} />
      </div>
    </div>
  );
}

function PildoraEstado({ estado }) {
  const [bg, fg] = COLOR_ESTADO[estado] || COLOR_ESTADO['Pendiente'];
  return <span style={{ fontSize: '10px', fontWeight: 800, padding: '3px 9px', borderRadius: '999px', whiteSpace: 'nowrap', background: bg, color: fg }}>{estado}</span>;
}

function Chip({ activo, onClick, children }) {
  return (
    <span onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 800,
        cursor: 'pointer', userSelect: 'none', border: activo ? 'none' : '1px solid var(--line)',
        background: activo ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'rgba(255,255,255,0.72)', color: activo ? '#fff' : 'var(--muted)'
      }}>
      {children}
    </span>
  );
}

function FiltroSelect({ etiqueta, opciones, valor, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const [modoLocal, setModoLocal] = useState('inc');
  const mixto = valor.inc.length > 0 && valor.exc.length > 0;
  const modo = valor.inc.length > 0 ? 'inc' : valor.exc.length > 0 ? 'exc' : modoLocal;
  const lista = modo === 'inc' ? valor.inc : valor.exc;
  const nuevo = (l, m) => (m === 'inc' ? { inc: l, exc: [] } : { inc: [], exc: l });
  const alternar = (v) => onChange(nuevo(lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v], modo));
  const cambiarModo = (m) => { setModoLocal(m); onChange(nuevo(lista, m)); };
  const nombres = (l) => `${l.slice(0, 2).map(etq).join(', ')}${l.length > 2 ? ` +${l.length - 2}` : ''}`;
  const resumen = mixto ? `${valor.inc.length} incl. · ${valor.exc.length} excl.`
    : lista.length === 0 ? 'Todos'
      : modo === 'exc' ? `Todos menos ${nombres(lista)}` : nombres(lista);
  const todas = [...opciones, ...lista.filter(v => !opciones.some(o => o.valor === v)).map(v => ({ valor: v, n: 0 }))];
  const modoBtn = (m, texto) => (
    <button type="button" onClick={() => cambiarModo(m)} aria-pressed={modo === m}
      style={{ flex: 1, padding: '5px 8px', borderRadius: '999px', border: 'none', fontSize: '10px', fontWeight: 800, cursor: 'pointer',
        background: modo === m ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'transparent', color: modo === m ? '#fff' : 'var(--muted)' }}>{texto}</button>
  );
  return (
    <div style={{ position: 'relative' }}>
      <label style={labelStyle}>{etiqueta}</label>
      <button type="button" onClick={() => setAbierto(a => !a)}
        style={{ ...inputStyle, minWidth: 150, maxWidth: 230, textAlign: 'left', cursor: 'pointer', fontWeight: 700, fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          borderColor: lista.length > 0 || mixto ? 'var(--bank-blue)' : 'var(--line)' }}>
        {resumen} <span style={{ float: 'right', marginLeft: 8, color: 'var(--muted)' }}>▾</span>
      </button>
      {abierto && (
        <>
          <div onClick={() => setAbierto(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 41, marginTop: 4, minWidth: 250, maxHeight: 320, overflowY: 'auto', background: '#fff', border: '1px solid var(--line)', borderRadius: '12px', boxShadow: 'var(--shadow-soft)', padding: 8 }}>
            <div style={{ display: 'flex', gap: 2, padding: 3, marginBottom: 6, border: '1px solid var(--line)', borderRadius: '999px' }}>
              {modoBtn('inc', 'Solo estos')}
              {modoBtn('exc', 'Todos menos estos')}
            </div>
            {todas.map(o => (
              <label key={o.valor} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: '12px', cursor: 'pointer', color: 'var(--ink-800)' }}>
                <input type="checkbox" checked={lista.includes(o.valor)} onChange={() => alternar(o.valor)} />
                <span style={{ flex: 1 }}>{etq(o.valor)}</span>
                <span style={{ color: 'var(--muted)', fontSize: '10px' }}>{o.n}</span>
              </label>
            ))}
            <button type="button" onClick={() => onChange({ inc: [], exc: [] })}
              style={{ marginTop: 6, width: '100%', padding: '6px', border: '1px solid var(--line)', borderRadius: '8px', background: 'transparent', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', cursor: 'pointer' }}>
              Sin filtrar (todos)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Aviso({ tipo, children }) {
  const [bg, borde, color] = tipo === 'error' ? ['rgba(215,59,71,0.08)', 'rgba(215,59,71,0.24)', '#a61e2b']
    : tipo === 'aviso' ? ['rgba(240,161,26,0.1)', 'rgba(240,161,26,0.35)', '#8a5a06']
      : ['rgba(32,166,106,0.1)', 'rgba(32,166,106,0.24)', '#116642'];
  return (
    <div style={{ background: bg, border: `1px solid ${borde}`, borderRadius: '14px', padding: '10px 16px', fontSize: '13px', fontWeight: 600, marginBottom: 14, color }}>{children}</div>
  );
}

// ---------- componente principal ----------

export default function Compliance({ token, apiUrl, clienteActivo, usuario }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, ...(clienteActivo ? { 'x-cliente-activo': clienteActivo } : {}) }), [token, clienteActivo]);
  const puedeCargar = usuario?.rol === 'admin' || usuario?.rol === 'dpe';
  const hoy = aISO(new Date());
  const fileRef = useRef(null);
  const cacheRef = useRef({});

  const [tab, setTab] = useState('hardening');
  const [entidad, setEntidad] = useState('banchile');
  const [cargas, setCargas] = useState([]);
  const [semana, setSemana] = useState('');
  const [config, setConfig] = useState(null);
  const [ajustes, setAjustes] = useState(null); // { banco: {filtros, kyndryl}, banchile: {filtros, kyndryl} }
  const [umbral, setUmbral] = useState(90);
  const [cargandoBase, setCargandoBase] = useState(true);
  const [filas, setFilas] = useState(null);
  const [cargandoFilas, setCargandoFilas] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState(null);
  const [versionDatos, setVersionDatos] = useState(0);
  const [mensaje, setMensaje] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [semanaCarga, setSemanaCarga] = useState(lunesDe());
  const [guardandoConfig, setGuardandoConfig] = useState(false);

  const [gestion, setGestion] = useState({});
  const [versionGestion, setVersionGestion] = useState(0);
  const [ffLista, setFfLista] = useState('todos');
  const [mirada, setMirada] = useState('global'); // mirada de la lista de gestión: global | kyndryl
  const [estadoFiltro, setEstadoFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const [seleccion, setSeleccion] = useState([]);
  const [form, setForm] = useState({ estado: 'En gestión', responsable: '', fecha: '', comentario: '' });
  const [guardandoGestion, setGuardandoGestion] = useState(false);

  // Config + semanas cargadas (al entrar y al cambiar de cliente)
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [cfg, lista] = await Promise.all([
          axios.get(`${apiUrl}/api/compliance/config`, { headers }),
          axios.get(`${apiUrl}/api/compliance/cargas`, { headers })
        ]);
        if (cancelado) return;
        setConfig(cfg.data);
        setAjustes(ajustesDesdeConfig(cfg.data));
        setUmbral(cfg.data.umbral);
        setCargas(lista.data);
        setSemana(prev => prev || (lista.data[0] ? lista.data[0].semana : ''));
      } catch (err) {
        if (!cancelado) setErrorGlobal('Error cargando Compliance: ' + (err.response?.data?.error || err.message));
      } finally {
        if (!cancelado) setCargandoBase(false);
      }
    })();
    return () => { cancelado = true; };
  }, [apiUrl, headers]);

  // Filas de la semana y hoja seleccionadas (con caché por semana|hoja)
  useEffect(() => {
    if (!semana) { setFilas(null); return undefined; }
    const key = `${semana}|${entidad}`;
    if (cacheRef.current[key]) { setFilas(cacheRef.current[key]); return undefined; }
    let cancelado = false;
    setCargandoFilas(true);
    setErrorGlobal(null);
    axios.get(`${apiUrl}/api/compliance/cargas/${semana}/${entidad}`, { headers })
      .then(res => {
        if (cancelado) return;
        const dec = { rows: decodificar(res.data), completa: cargaCompleta(res.data.dict), cargadoPor: res.data.cargadoPor, cargadoEn: res.data.cargadoEn };
        cacheRef.current[key] = dec;
        setFilas(dec);
      })
      .catch(err => {
        if (cancelado) return;
        setFilas(null);
        if (err.response?.status !== 404) setErrorGlobal('Error cargando el inventario: ' + (err.response?.data?.error || err.message));
      })
      .finally(() => { if (!cancelado) setCargandoFilas(false); });
    return () => { cancelado = true; };
  }, [semana, entidad, apiUrl, headers, versionDatos]);

  // Gestión registrada de la hoja activa
  useEffect(() => {
    let cancelado = false;
    axios.get(`${apiUrl}/api/compliance/gestion`, { headers, params: { entidad } })
      .then(res => { if (!cancelado) setGestion(prev => ({ ...prev, [entidad]: res.data })); })
      .catch(err => { if (!cancelado) setErrorGlobal('Error cargando la gestión: ' + (err.response?.data?.error || err.message)); });
    return () => { cancelado = true; };
  }, [entidad, apiUrl, headers, versionGestion]);

  // ---------- derivados ----------
  const rows = filas ? filas.rows : null;
  const filtros = ajustes ? ajustes[entidad].filtros : null;
  const kyndril = ajustes ? ajustes[entidad].kyndryl : null;
  const universo = useMemo(() => (rows && filtros ? aplicarFiltros(rows, filtros) : []), [rows, filtros]);
  const vista = useMemo(() => calcularVista(universo, umbral, kyndril), [universo, umbral, kyndril]);
  const aGestionar = useMemo(() => listaGestion(universo, umbral), [universo, umbral]);
  const aGestionarMirada = useMemo(
    () => (mirada === 'kyndryl' && kyndril ? aGestionar.filter(r => esKyndryl(r, kyndril)) : aGestionar),
    [aGestionar, mirada, kyndril]
  );
  const nKyndryl = useMemo(() => (kyndril ? aGestionar.filter(r => esKyndryl(r, kyndril)).length : 0), [aGestionar, kyndril]);
  const aGestionar90 = useMemo(
    () => universo.filter(r => (r.adh === null || r.adh < 90) && (mirada === 'global' || (kyndril && esKyndryl(r, kyndril)))).length,
    [universo, mirada, kyndril]
  );
  const opciones = useMemo(() => {
    const o = {};
    ['tipo', 'cap', 'cap2', 'clas', 'hard', 'est', 'ubi', 'adm1', 'adm2'].forEach(k => { o[k] = rows ? opcionesDe(rows, k) : []; });
    return o;
  }, [rows]);

  const gestEnt = useMemo(() => gestion[entidad] || {}, [gestion, entidad]);
  const regDe = (r) => gestEnt[claveHost(r.host)];
  const estadoDe = (r) => (regDe(r) ? regDe(r).estado : 'Pendiente');
  const vencidoDe = (r) => {
    const g = regDe(r);
    return !!g && !!g.fechaCompromiso && g.fechaCompromiso < hoy && g.estado !== 'Resuelto' && g.estado !== 'Excepción';
  };

  const conteos = useMemo(() => {
    const c = {};
    ESTADOS_GESTION.forEach(e => { c[e] = 0; });
    let vencidos = 0;
    aGestionarMirada.forEach(r => {
      const g = gestEnt[claveHost(r.host)];
      c[g ? g.estado : 'Pendiente'] += 1;
      if (g && g.fechaCompromiso && g.fechaCompromiso < hoy && g.estado !== 'Resuelto' && g.estado !== 'Excepción') vencidos += 1;
    });
    return { c, vencidos };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aGestionarMirada, gestEnt, hoy]);

  const listaVista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return aGestionarMirada.filter(r => {
      if (ffLista === 'P' && r.clas !== 'PRODUCCION') return false;
      if (ffLista === 'N' && r.clas === 'PRODUCCION') return false;
      if (ffLista === 'bajo' && r.adh === null) return false;
      if (ffLista === 'sin' && r.adh !== null) return false;
      if (q && !r.host.toLowerCase().includes(q)) return false;
      if (estadoFiltro === 'vencidos') return vencidoDe(r);
      if (estadoFiltro !== 'todos' && estadoDe(r) !== estadoFiltro) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aGestionarMirada, ffLista, estadoFiltro, busqueda, gestEnt, hoy]);

  const maxPag = Math.max(0, Math.ceil(listaVista.length / TAM_PAGINA) - 1);
  const pag = Math.min(pagina, maxPag);
  const filasPagina = listaVista.slice(pag * TAM_PAGINA, (pag + 1) * TAM_PAGINA);
  const filaPorClave = useMemo(() => {
    const m = new Map();
    aGestionarMirada.forEach(r => { const k = claveHost(r.host); if (!m.has(k)) m.set(k, r); });
    return m;
  }, [aGestionarMirada]);
  const seleccionValida = seleccion.filter(k => filaPorClave.has(k));

  const semanaInfo = cargas.find(c => c.semana === semana);
  const vistaModificada = !!config && !!ajustes && (
    umbral !== config.umbral || JSON.stringify(config.entidades[entidad]) !== JSON.stringify(ajustes[entidad])
  );
  // Las cargas anteriores a Capacidad Secundaria / Administración no traen esas columnas: sus filtros no tendrían efecto
  const usaColumnasNuevas = !!filtros && !!kyndril && (filtroActivo(filtros.cap2) || filtroActivo(kyndril.adm1) || filtroActivo(kyndril.adm2));

  // ---------- acciones ----------
  const cambiarFiltro = (campo, valor) => {
    setAjustes(prev => ({ ...prev, [entidad]: { ...prev[entidad], filtros: { ...prev[entidad].filtros, [campo]: valor } } }));
    setPagina(0);
  };
  const cambiarKyndryl = (campo, valor) => {
    setAjustes(prev => ({ ...prev, [entidad]: { ...prev[entidad], kyndryl: { ...prev[entidad].kyndryl, [campo]: valor } } }));
    setPagina(0);
  };
  const restablecer = () => {
    setAjustes(prev => ({ ...prev, [entidad]: clonar(config.entidades[entidad]) }));
    setUmbral(config.umbral);
    setPagina(0);
  };

  const guardarConfig = async () => {
    setGuardandoConfig(true);
    setMensaje(null);
    try {
      await axios.put(`${apiUrl}/api/compliance/config`, { umbral, entidad, filtros, kyndryl: kyndril }, { headers });
      setConfig(prev => ({ ...prev, umbral, entidades: { ...prev.entidades, [entidad]: clonar(ajustes[entidad]) } }));
      setMensaje({ tipo: 'success', texto: `Umbral y filtros de ${entidad === 'banco' ? 'Banco' : 'Banchile'} guardados como predeterminados.` });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'No se pudo guardar: ' + (err.response?.data?.error || err.message) });
    } finally {
      setGuardandoConfig(false);
    }
  };

  const procesarArchivo = async (file) => {
    setSubiendo(true);
    setMensaje(null);
    try {
      const buffer = await file.arrayBuffer();
      const { entidades, resumen, advertencias } = parsearInventario(XLSX, buffer);
      await axios.post(`${apiUrl}/api/compliance/upload`, { semana: semanaCarga, entidades }, { headers });
      const lista = await axios.get(`${apiUrl}/api/compliance/cargas`, { headers });
      Object.keys(cacheRef.current).forEach(k => { if (k.startsWith(`${semanaCarga}|`)) delete cacheRef.current[k]; });
      setCargas(lista.data);
      setSemana(semanaCarga);
      setVersionDatos(v => v + 1);
      const detalle = Object.keys(resumen).map(k => `${k === 'banco' ? 'Banco' : 'Banchile'}: ${resumen[k].filas} servidores`).join(' · ');
      setMensaje({ tipo: 'success', texto: `Semana ${etiquetaSemana(semanaCarga)} cargada — ${detalle}.${advertencias.length ? ' Aviso: ' + advertencias.join('; ') + '.' : ''}` });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error procesando el archivo: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSubiendo(false);
    }
  };

  const abrirGestion = (clave) => {
    const g = gestEnt[clave];
    setSeleccion([clave]);
    setForm({ estado: g ? g.estado : 'En gestión', responsable: g ? g.responsable : '', fecha: g ? g.fechaCompromiso : '', comentario: '' });
  };
  const alternarSeleccion = (clave) => {
    const nueva = seleccionValida.includes(clave) ? seleccionValida.filter(k => k !== clave) : [...seleccionValida, clave];
    setSeleccion(nueva);
    if (nueva.length === 1) abrirGestion(nueva[0]);
    else if (nueva.length > 1) setForm({ estado: 'En gestión', responsable: '', fecha: '', comentario: '' });
  };
  const seleccionar = (lista) => {
    const claves = Array.from(new Set(lista.map(r => claveHost(r.host))));
    setSeleccion(claves);
    setForm({ estado: 'En gestión', responsable: '', fecha: '', comentario: '' });
  };

  const guardarGestion = async () => {
    const hosts = seleccionValida.map(k => filaPorClave.get(k).host);
    if (hosts.length === 0) return;
    setGuardandoGestion(true);
    setMensaje(null);
    try {
      for (let i = 0; i < hosts.length; i += 400) {
        await axios.put(`${apiUrl}/api/compliance/gestion`, {
          entidad, hosts: hosts.slice(i, i + 400), estado: form.estado, responsable: form.responsable,
          fechaCompromiso: form.fecha, comentario: form.comentario
        }, { headers });
      }
      setVersionGestion(v => v + 1);
      setForm(f => ({ ...f, comentario: '' }));
      if (hosts.length > 1) setSeleccion([]);
      setMensaje({ tipo: 'success', texto: `Gestión guardada para ${hosts.length} servidor${hosts.length > 1 ? 'es' : ''}.` });
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'No se pudo guardar la gestión: ' + (err.response?.data?.error || err.message) });
    } finally {
      setGuardandoGestion(false);
    }
  };

  // ---------- render ----------
  const unico = seleccionValida.length === 1 ? filaPorClave.get(seleccionValida[0]) : null;
  const regUnico = unico ? regDe(unico) : null;
  const hayCarga = !!semana && !!filas;

  const tabBtn = (id, texto, habilitado) => (
    <button key={id} onClick={() => habilitado && setTab(id)} disabled={!habilitado}
      style={{
        padding: '9px 16px', borderRadius: '999px', fontSize: '12px', fontWeight: 800, cursor: habilitado ? 'pointer' : 'default',
        border: tab === id ? 'none' : '1px solid var(--line)', opacity: habilitado ? 1 : 0.55,
        background: tab === id ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'rgba(255,255,255,0.72)', color: tab === id ? '#fff' : 'var(--ink-800)'
      }}>
      {texto}{habilitado ? '' : ' · próximo'}
    </button>
  );

  if (cargandoBase) return <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 30, fontWeight: 600 }}>Cargando...</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tabBtn('vulnerabilidades', 'Vulnerabilidades', false)}
          {tabBtn('parchado', 'Parchado', false)}
          {tabBtn('hardening', 'Hardening', true)}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', gap: 4, background: 'rgba(255,255,255,0.72)', border: '1px solid var(--line)', borderRadius: '999px', padding: 4 }}>
            {ENTIDADES_UI.map(e => (
              <span key={e.id} role="button" tabIndex={0} onClick={() => { setEntidad(e.id); setSeleccion([]); setPagina(0); }}
                onKeyDown={(ev) => { if (ev.key === 'Enter') { setEntidad(e.id); setSeleccion([]); setPagina(0); } }}
                style={{
                  padding: '6px 16px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                  background: entidad === e.id ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'transparent', color: entidad === e.id ? '#fff' : 'var(--muted)'
                }}>{e.label}</span>
            ))}
          </div>
          {cargas.length > 0 && (
            <div>
              <select value={semana} onChange={e => { setSemana(e.target.value); setSeleccion([]); setPagina(0); }} aria-label="Semana"
                style={{ ...inputStyle, fontWeight: 700, fontSize: '11px' }}>
                {cargas.map(c => <option key={c.semana} value={c.semana}>Semana {etiquetaSemana(c.semana)}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {errorGlobal && <Aviso tipo="error">{errorGlobal}</Aviso>}
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

      {tab === 'hardening' && (
        <>
          {puedeCargar && (
            <div style={{ ...cardStyle, padding: '14px 18px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--ink-950)' }}>{subiendo ? 'Procesando archivo...' : 'Cargar inventario semanal'}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)' }}>
                    inventario_BCH.xlsx · hojas "CMDB Banco" + "CMDB Banchile" · cada semana queda en el histórico (volver a subir la misma semana la reemplaza)
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>SEMANA (LUNES)</label>
                  <input type="date" value={semanaCarga}
                    onChange={e => { if (e.target.value) { const [y, m, d] = e.target.value.split('-').map(Number); setSemanaCarga(lunesDe(new Date(y, m - 1, d))); } }}
                    style={inputStyle} />
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: 2 }}>{etiquetaSemana(semanaCarga)}</div>
                </div>
                <button disabled={subiendo} onClick={() => fileRef.current && fileRef.current.click()}
                  style={{ padding: '10px 18px', background: subiendo ? 'var(--muted)' : 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color: '#fff', border: 'none', borderRadius: '999px', fontWeight: 900, fontSize: '12px', cursor: subiendo ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                  {subiendo ? 'Cargando...' : 'Seleccionar archivo'}
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files[0]) procesarArchivo(e.target.files[0]); e.target.value = ''; }} />
              </div>
            </div>
          )}

          {!semana ? (
            <div style={{ ...cardStyle, border: '1px dashed var(--line)', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', padding: 30 }}>
              {puedeCargar ? 'Todavía no hay inventario cargado. Sube el primer inventario_BCH.xlsx para comenzar.' : 'Todavía no hay inventario cargado. Un administrador o DPE debe subir el primero.'}
            </div>
          ) : cargandoFilas ? (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 30, fontWeight: 600 }}>Cargando inventario...</p>
          ) : !hayCarga ? (
            <div style={{ ...cardStyle, border: '1px dashed var(--line)', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', padding: 30 }}>
              La semana {etiquetaSemana(semana)} no tiene datos de {entidad === 'banco' ? 'Banco' : 'Banchile'}.
            </div>
          ) : (
            <>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>
                {entidad === 'banco' ? 'CMDB Banco' : 'CMDB Banchile'} · semana {etiquetaSemana(semana)} · {rows.length} servidores en el inventario
                {semanaInfo ? ` · cargado por ${filas.cargadoPor || semanaInfo.cargadoPor} (${fechaHora(filas.cargadoEn || semanaInfo.cargadoEn)})` : ''}
              </div>

              {usaColumnasNuevas && !filas.completa && (
                <Aviso tipo="aviso">
                  Esta carga es anterior a las columnas Capacidad Secundaria y Administración, así que esos filtros (y la definición de Kyndryl por administración) no tienen efecto y las cifras no son las definitivas.
                  {puedeCargar ? ' Vuelve a subir el inventario de esta semana para aplicarlos.' : ' Pide a un administrador o DPE que vuelva a subir el inventario de esta semana.'}
                </Aviso>
              )}

              {/* Filtros y umbral */}
              <div style={{ ...cardStyle, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                  <FiltroSelect etiqueta="TIPO DE INFRAESTRUCTURA" opciones={opciones.tipo} valor={filtros.tipo} onChange={v => cambiarFiltro('tipo', v)} />
                  <FiltroSelect etiqueta="CAPACIDAD PRIMARIA" opciones={opciones.cap} valor={filtros.cap} onChange={v => cambiarFiltro('cap', v)} />
                  <FiltroSelect etiqueta="CAPACIDAD SECUNDARIA" opciones={opciones.cap2} valor={filtros.cap2} onChange={v => cambiarFiltro('cap2', v)} />
                  <FiltroSelect etiqueta="CLASIFICACIÓN" opciones={opciones.clas} valor={filtros.clas} onChange={v => cambiarFiltro('clas', v)} />
                  <FiltroSelect etiqueta="HARDENING" opciones={opciones.hard} valor={filtros.hard} onChange={v => cambiarFiltro('hard', v)} />
                  <FiltroSelect etiqueta="ESTADO OPERATIVO" opciones={opciones.est} valor={filtros.est} onChange={v => cambiarFiltro('est', v)} />
                  <FiltroSelect etiqueta="UBICACIÓN" opciones={opciones.ubi} valor={filtros.ubi} onChange={v => cambiarFiltro('ubi', v)} />
                  <div style={{ minWidth: 200, flex: 1, maxWidth: 300 }}>
                    <label style={labelStyle}>UMBRAL DE CUMPLIMIENTO: <span style={{ color: 'var(--bank-blue)', fontSize: '12px' }}>≥ {umbral}%</span></label>
                    <input type="range" min="50" max="100" step="1" value={umbral} onChange={e => { setUmbral(Number(e.target.value)); setPagina(0); }}
                      style={{ width: '100%', accentColor: '#003b71' }} aria-label="Umbral de cumplimiento" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', lineHeight: 1.5, flex: 1, minWidth: 260 }}>
                    <b>Cumple</b> = Adherencia de Hardening ≥ {umbral}% · vacío cuenta como 0 · Gauge: <span style={{ color: '#2b5fb0' }}>●</span> ≥95% <span style={{ color: '#e0a800' }}>●</span> 90–95% <span style={{ color: '#c8402f' }}>●</span> &lt;90%
                    {vistaModificada && <span style={{ color: '#8a5a06', fontWeight: 700 }}> · vista distinta a los valores predeterminados del módulo</span>}
                  </div>
                  {vistaModificada && <button onClick={restablecer} style={{ padding: '6px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>Restablecer</button>}
                  {puedeCargar && vistaModificada && (
                    <button onClick={guardarConfig} disabled={guardandoConfig}
                      style={{ padding: '6px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, border: 'none', background: 'var(--bank-blue)', color: '#fff', cursor: guardandoConfig ? 'not-allowed' : 'pointer' }}>
                      {guardandoConfig ? 'Guardando...' : 'Guardar como predeterminado'}
                    </button>
                  )}
                </div>
              </div>

              {/* Global y Kyndryl */}
              {universo.length === 0 ? (
                <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--muted)', fontSize: '13px', padding: 24 }}>Ningún servidor cumple estos filtros.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
                  <ColumnaMirada nombre="Global" detalle="Universo según los filtros" v={vista.global} />
                  <ColumnaMirada nombre="Kyndryl"
                    detalle={describirKyndryl(kyndril)} v={vista.kyndryl}
                    controlExtra={(
                      <details>
                        <summary style={{ fontSize: '11px', fontWeight: 800, color: 'var(--bank-blue)', cursor: 'pointer' }}>Definir qué es Kyndryl</summary>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                          <FiltroSelect etiqueta="ADMINISTRACIÓN PRINCIPAL" opciones={opciones.adm1} valor={kyndril.adm1} onChange={v => cambiarKyndryl('adm1', v)} />
                          <FiltroSelect etiqueta="ADMINISTRACIÓN SECUNDARIA" opciones={opciones.adm2} valor={kyndril.adm2} onChange={v => cambiarKyndryl('adm2', v)} />
                          <FiltroSelect etiqueta="UBICACIÓN" opciones={opciones.ubi} valor={kyndril.ubi} onChange={v => cambiarKyndryl('ubi', v)} />
                        </div>
                      </details>
                    )} />
                </div>
              )}

              {/* Gestión */}
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase', margin: '20px 0 8px' }}>
                Gestión de servidores bajo el umbral o sin adherencia
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <div role="group" aria-label="Mirada de la gestión" style={{ display: 'inline-flex', gap: 4, background: 'rgba(255,255,255,0.72)', border: '1px solid var(--line)', borderRadius: '999px', padding: 4 }}>
                  {[['global', 'Global', aGestionar.length], ['kyndryl', 'Kyndryl', nKyndryl]].map(([id, texto, n]) => (
                    <span key={id} role="button" tabIndex={0} aria-pressed={mirada === id}
                      onClick={() => { setMirada(id); setPagina(0); }}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') { setMirada(id); setPagina(0); } }}
                      style={{
                        padding: '6px 16px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                        background: mirada === id ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'transparent', color: mirada === id ? '#fff' : 'var(--muted)'
                      }}>{texto} · {n}</span>
                  ))}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-950)' }}>
                  Umbral actual: <b>≥ {umbral}%</b> · <b>{aGestionarMirada.length}</b> servidores a gestionar ({mirada === 'kyndryl' ? 'Kyndryl' : 'Global'})
                  {umbral !== 90 && <span style={{ color: '#8a5a06' }}> ({aGestionarMirada.length - aGestionar90 >= 0 ? '+' : ''}{aGestionarMirada.length - aGestionar90} vs. umbral 90%)</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {ESTADOS_GESTION.map(e => (
                  <span key={e} role="button" tabIndex={0} onClick={() => { setEstadoFiltro(estadoFiltro === e ? 'todos' : e); setPagina(0); }}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') { setEstadoFiltro(estadoFiltro === e ? 'todos' : e); setPagina(0); } }}
                    style={{ ...cardStyle, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', outline: estadoFiltro === e ? '2px solid var(--bank-blue)' : 'none' }}>
                    <PildoraEstado estado={e} />
                    <b style={{ fontSize: '16px', fontFamily: "'IBM Plex Mono',monospace" }}>{conteos.c[e]}</b>
                  </span>
                ))}
                <span role="button" tabIndex={0} onClick={() => { setEstadoFiltro(estadoFiltro === 'vencidos' ? 'todos' : 'vencidos'); setPagina(0); }}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') { setEstadoFiltro(estadoFiltro === 'vencidos' ? 'todos' : 'vencidos'); setPagina(0); } }}
                  style={{ ...cardStyle, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', outline: estadoFiltro === 'vencidos' ? '2px solid #a61e2b' : 'none' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, padding: '3px 9px', borderRadius: '999px', background: 'rgba(215,59,71,.12)', color: '#a61e2b' }}>Compromiso vencido</span>
                  <b style={{ fontSize: '16px', fontFamily: "'IBM Plex Mono',monospace" }}>{conteos.vencidos}</b>
                </span>
              </div>

              <div style={{ ...cardStyle, padding: 12 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                  {[['todos', 'Todos'], ['P', 'Producción'], ['N', 'No producción'], ['bajo', 'Bajo umbral'], ['sin', 'Sin dato']].map(([id, texto]) => (
                    <Chip key={id} activo={ffLista === id} onClick={() => { setFfLista(id); setPagina(0); }}>{texto}</Chip>
                  ))}
                  <input type="search" placeholder="Buscar hostname..." value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(0); }}
                    aria-label="Buscar hostname" style={{ ...inputStyle, width: 180, fontSize: '11px' }} />
                  {estadoFiltro !== 'todos' && <Chip activo onClick={() => setEstadoFiltro('todos')}>Estado: {estadoFiltro === 'vencidos' ? 'vencidos' : estadoFiltro} ✕</Chip>}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6, fontSize: '11px', color: 'var(--muted)' }}>
                  <span>{listaVista.length} servidores en la lista</span>
                  {listaVista.length > 0 && <button onClick={() => seleccionar(filasPagina)} style={{ border: 'none', background: 'transparent', color: 'var(--bank-blue)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', padding: 0 }}>Seleccionar esta página</button>}
                  {listaVista.length > filasPagina.length && <button onClick={() => seleccionar(listaVista)} style={{ border: 'none', background: 'transparent', color: 'var(--bank-blue)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', padding: 0 }}>Seleccionar los {listaVista.length}</button>}
                  {seleccionValida.length > 0 && <button onClick={() => setSeleccion([])} style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', padding: 0 }}>Quitar selección ({seleccionValida.length})</button>}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['', 'Hostname', 'Ambiente', 'SO', 'Servicio', 'Adherencia', 'Ubicación', 'Gestión', ''].map((h, i) => (
                          <th key={i} style={{ textAlign: 'left', fontSize: '10px', color: 'var(--muted)', fontWeight: 800, padding: '6px 8px', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filasPagina.length === 0 ? (
                        <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18, fontSize: '12px' }}>Sin servidores con estos filtros.</td></tr>
                      ) : filasPagina.map((r, i) => {
                        const clave = claveHost(r.host);
                        const reg = gestEnt[clave];
                        const esKyn = esKyndryl(r, kyndril);
                        const celda = { padding: '7px 8px', fontSize: '11px', borderTop: '1px solid rgba(18,52,78,0.06)', color: 'var(--ink-800)' };
                        return (
                          <tr key={`${clave}-${pag}-${i}`}>
                            <td style={celda}><input type="checkbox" checked={seleccionValida.includes(clave)} onChange={() => alternarSeleccion(clave)} aria-label={`Seleccionar ${r.host}`} /></td>
                            <td style={{ ...celda, fontWeight: 700 }}>{r.host}</td>
                            <td style={celda}>{r.clas === 'PRODUCCION' ? 'Prod' : 'No prod'} · {r.amb || '—'}</td>
                            <td style={celda}>{r.so || '—'}</td>
                            <td style={celda}>{r.svc || '—'}</td>
                            <td style={celda}>
                              {r.adh === null
                                ? <span style={{ fontSize: '10px', fontWeight: 800, padding: '3px 9px', borderRadius: '999px', background: 'rgba(215,59,71,.12)', color: '#a61e2b', whiteSpace: 'nowrap' }}>Sin dato (0)</span>
                                : <b style={{ color: '#a61e2b', fontFamily: "'IBM Plex Mono',monospace" }}>{r.adh}%</b>}
                            </td>
                            <td style={celda}>{r.ubi || '—'}{esKyn && kyndrylDefinido(kyndril) && <span style={{ marginLeft: 6, fontSize: '10px', fontWeight: 800, padding: '3px 9px', borderRadius: '999px', background: 'rgba(0,59,113,.1)', color: '#003b71' }}>Kyndryl</span>}</td>
                            <td style={celda}>
                              <PildoraEstado estado={reg ? reg.estado : 'Pendiente'} />
                              {reg && reg.fechaCompromiso && (
                                <div style={{ fontSize: '10px', color: vencidoDe(r) ? '#a61e2b' : 'var(--muted)', fontWeight: vencidoDe(r) ? 800 : 400 }}>
                                  compromiso {fechaCorta(reg.fechaCompromiso)}{vencidoDe(r) ? ' · vencido' : ''}
                                </div>
                              )}
                            </td>
                            <td style={celda}>
                              <button onClick={() => abrirGestion(clave)}
                                style={{ padding: '6px 12px', borderRadius: '999px', fontSize: '10px', fontWeight: 800, border: 'none', background: 'var(--bank-blue)', color: '#fff', cursor: 'pointer' }}>Gestionar</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {maxPag > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 10, fontSize: '11px', color: 'var(--muted)' }}>
                    <button disabled={pag === 0} onClick={() => setPagina(pag - 1)} style={{ padding: '5px 12px', borderRadius: '999px', border: '1px solid var(--line)', background: 'transparent', fontWeight: 800, fontSize: '11px', cursor: pag === 0 ? 'default' : 'pointer', opacity: pag === 0 ? 0.5 : 1 }}>Anterior</button>
                    <span>Página {pag + 1} de {maxPag + 1}</span>
                    <button disabled={pag === maxPag} onClick={() => setPagina(pag + 1)} style={{ padding: '5px 12px', borderRadius: '999px', border: '1px solid var(--line)', background: 'transparent', fontWeight: 800, fontSize: '11px', cursor: pag === maxPag ? 'default' : 'pointer', opacity: pag === maxPag ? 0.5 : 1 }}>Siguiente</button>
                  </div>
                )}
              </div>

              {/* Panel de gestión */}
              {seleccionValida.length > 0 && (
                <div style={{ ...cardStyle, marginTop: 12, border: '1px solid rgba(0,59,113,.35)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--ink-950)' }}>
                      {unico ? `Gestión · ${unico.host}` : `Gestión masiva · ${seleccionValida.length} servidores`}
                    </div>
                    <button onClick={() => setSeleccion([])} style={{ padding: '6px 12px', borderRadius: '999px', fontSize: '10px', fontWeight: 800, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>Cerrar</button>
                  </div>
                  {unico && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {[unico.adh === null ? 'Sin adherencia (cuenta 0)' : `Adherencia ${unico.adh}%`, unico.amb || '—', unico.svc || '—', unico.ubi || '—'].map((t, i) => (
                        <span key={i} style={{ fontSize: '10px', fontWeight: 800, padding: '3px 9px', borderRadius: '999px', background: i === 0 ? 'rgba(215,59,71,.12)' : 'rgba(18,52,78,.06)', color: i === 0 ? '#a61e2b' : 'var(--muted)' }}>{t}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 2, minWidth: 260, display: 'grid', gap: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                        <div>
                          <label style={labelStyle}>ESTADO</label>
                          <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} style={{ ...inputStyle, width: '100%' }}>
                            {ESTADOS_GESTION.map(e => <option key={e} value={e}>{e}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={labelStyle}>RESPONSABLE</label>
                          <input value={form.responsable} onChange={e => setForm({ ...form, responsable: e.target.value })} placeholder="Equipo o persona" style={{ ...inputStyle, width: '100%' }} />
                        </div>
                        <div>
                          <label style={labelStyle}>FECHA COMPROMISO</label>
                          <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} style={{ ...inputStyle, width: '100%' }} />
                        </div>
                      </div>
                      <div>
                        <label style={labelStyle}>COMENTARIO / ACCIÓN</label>
                        <textarea rows={3} value={form.comentario} onChange={e => setForm({ ...form, comentario: e.target.value })}
                          placeholder="Ej: se agenda escaneo de hardening para el viernes; pendiente de ventana con el cliente"
                          style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
                      </div>
                      <div>
                        <button onClick={guardarGestion} disabled={guardandoGestion}
                          style={{ padding: '9px 18px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, border: 'none', background: guardandoGestion ? 'var(--muted)' : 'var(--bank-blue)', color: '#fff', cursor: guardandoGestion ? 'not-allowed' : 'pointer' }}>
                          {guardandoGestion ? 'Guardando...' : 'Guardar gestión'}
                        </button>
                      </div>
                    </div>
                    {unico && (
                      <div style={{ flex: 1, minWidth: 220, maxHeight: 240, overflowY: 'auto' }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }}>HISTORIAL</div>
                        {!regUnico || regUnico.historial.length === 0 ? (
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Sin gestión registrada todavía.</div>
                        ) : regUnico.historial.slice().reverse().map((h, i) => (
                          <div key={i} style={{ borderLeft: '2px solid rgba(18,52,78,.15)', padding: '0 0 8px 10px', fontSize: '11px', color: 'var(--ink-800)' }}>
                            <b>{h.usuario}</b> <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{fechaHora(h.fecha)}</span>
                            <div>
                              {h.estado}{h.responsable ? ` · ${h.responsable}` : ''}{h.fechaCompromiso ? ` · compromiso ${fechaCorta(h.fechaCompromiso)}` : ''}
                              {h.comentario ? ` — ${h.comentario}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: 12, lineHeight: 1.5 }}>
                Score = promedio de adherencia de todas las máquinas del universo (vacío = 0) · la gestión se guarda por hostname y se conserva entre cargas semanales.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
