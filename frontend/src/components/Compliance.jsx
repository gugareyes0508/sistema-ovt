import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  ESTADOS_GESTION, parsearInventario, decodificar, aplicarFiltros, calcularVista, listaGestion,
  opcionesDe, claveHost, lunesDe, etiquetaSemana, aISO, esKyndryl, ordenarPorAdherencia, cargaCompleta, describirKyndryl, kyndrylDefinido, filtroActivo, KYNDRYL_FIJOS, kyndrylFijo, soloTotal, fechaLarga
} from '../utils/compliance';
import { ModalGestion, BuscadorEquipo } from './ComplianceGestion';

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
// Lo fijo de la definición de Kyndryl (en Banchile: administración principal y secundaria = Todos) se impone siempre
const normalizarConfig = (cfg) => {
  const c = clonar(cfg);
  Object.keys(KYNDRYL_FIJOS).forEach(ent => {
    if (c.entidades && c.entidades[ent]) KYNDRYL_FIJOS[ent].forEach(k => { c.entidades[ent].kyndryl[k] = { inc: [], exc: [] }; });
  });
  return c;
};
const ajustesDesdeConfig = (cfg) => ({ banco: clonar(cfg.entidades.banco), banchile: clonar(cfg.entidades.banchile) });
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

// Encabezado idéntico para Global y Kyndryl: alto fijo y detalle limitado a 2 líneas
function EncabezadoMirada({ nombre, detalle, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, minHeight: 66 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink-950)' }}>{nombre}</div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-800)' }}>Total máquinas: {v.total.total}</div>
        <div title={detalle} style={{ fontSize: '10px', color: 'var(--muted)', lineHeight: '13px', height: 26, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{detalle}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink-950)' }}>SCORE: {v.total.score !== null ? `${fmt(v.total.score)} %` : '—'}</div>
        <div style={{ fontSize: '10px', color: 'var(--muted)' }}>promedio adherencia{v.total.sinDato ? ` · ${v.total.sinDato} sin dato = 0` : ''}</div>
      </div>
    </div>
  );
}

function useAnchoAmplio(minimo = 820) {
  const [amplio, setAmplio] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= minimo));
  useEffect(() => {
    const ajustar = () => setAmplio(window.innerWidth >= minimo);
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [minimo]);
  return amplio;
}

// Global y Kyndryl lado a lado dentro de UNA sola cuadrícula de 2 columnas: cada fila (encabezado, Total,
// Producción, ...) toma la altura de la más alta, así los gráficos quedan siempre a la misma altura.
// En pantallas angostas se apilan (primero Global, luego Kyndryl). Banco: un único gráfico (Total) por mirada.
function MiradasHardening({ vistaGlobal, vistaKyndryl, detalleKyndryl, unico }) {
  const amplio = useAnchoAmplio();
  const tarjetas = unico ? [['Total', 'total']] : [['Total', 'total'], ['Producción', 'prod'], ['No producción', 'noProd']];
  const encG = <EncabezadoMirada key="enc-g" nombre="Global" detalle="Universo según los filtros" v={vistaGlobal} />;
  const encK = <EncabezadoMirada key="enc-k" nombre="Kyndryl" detalle={detalleKyndryl} v={vistaKyndryl} />;
  if (!amplio) {
    const apiladas = (v, pref) => tarjetas.map(([t, k]) => <TarjetaGauge key={pref + k} titulo={t} s={v[k]} />);
    return <div style={{ display: 'grid', gap: 8 }}>{[encG, ...apiladas(vistaGlobal, 'g'), encK, ...apiladas(vistaKyndryl, 'k')]}</div>;
  }
  const hijos = [encG, encK];
  tarjetas.forEach(([t, k]) => {
    hijos.push(<TarjetaGauge key={`g-${k}`} titulo={t} s={vistaGlobal[k]} />, <TarjetaGauge key={`k-${k}`} titulo={t} s={vistaKyndryl[k]} />);
  });
  return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', columnGap: 14, rowGap: 8, alignItems: 'stretch' }}>{hijos}</div>;
}

// Texto en una sola línea, recortado con "…" (el texto completo se ve al pasar el mouse)
function Recortado({ texto, ancho }) {
  if (!texto) return <span>—</span>;
  return <div title={texto} style={{ maxWidth: ancho, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</div>;
}

// Adherencia siempre como porcentaje: sin dato = 0% (así cuenta en el score) con su etiqueta; verde si cumple, rojo si no
function CeldaAdherencia({ adh, umbral }) {
  const mono = { fontFamily: "'IBM Plex Mono',monospace", fontSize: '12px' };
  if (adh === null) {
    return (
      <span style={{ whiteSpace: 'nowrap' }}>
        <b style={{ color: '#a61e2b', ...mono }}>0%</b>{' '}
        <span title="El inventario no trae adherencia para este equipo: cuenta como 0" style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '999px', background: 'rgba(215,59,71,.12)', color: '#a61e2b' }}>sin dato</span>
      </span>
    );
  }
  return <b style={{ color: adh >= umbral ? '#116642' : '#a61e2b', ...mono }}>{adh}%</b>;
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

function FiltroSelect({ etiqueta, opciones, valor, onChange, bloqueado, motivo }) {
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
      <button type="button" disabled={!!bloqueado} title={bloqueado ? motivo : undefined} onClick={() => { if (!bloqueado) setAbierto(a => !a); }}
        style={{ ...inputStyle, minWidth: 150, maxWidth: 230, textAlign: 'left', cursor: bloqueado ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          background: bloqueado ? '#f3f6f8' : '#fff', color: bloqueado ? 'var(--muted)' : 'var(--ink-950)',
          borderColor: !bloqueado && (lista.length > 0 || mixto) ? 'var(--bank-blue)' : 'var(--line)' }}>
        {resumen} <span style={{ float: 'right', marginLeft: 8, color: 'var(--muted)' }}>{bloqueado ? '🔒' : '▾'}</span>
      </button>
      {abierto && !bloqueado && (
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
  const [alcance, setAlcance] = useState('gestionar'); // detalle: 'gestionar' (bajo el umbral / sin dato) | 'todos' (todo el universo)
  const [estadoFiltro, setEstadoFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const [seleccion, setSeleccion] = useState([]);
  const [guardandoGestion, setGuardandoGestion] = useState(false);
  const [asignables, setAsignables] = useState([]);   // personas asociadas al cliente a quienes se puede derivar
  const [asigFiltro, setAsigFiltro] = useState('todos');
  const [modal, setModal] = useState(null);           // { claves: [clave, ...] } — ventana emergente de gestión
  const [ficha, setFicha] = useState(null);           // ficha (con historial) del equipo abierto en la ventana
  const [errorModal, setErrorModal] = useState(null);

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
        const cfgOk = normalizarConfig(cfg.data);
        setConfig(cfgOk);
        setAjustes(ajustesDesdeConfig(cfgOk));
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

  // Personas asociadas al cliente (para asignar / derivar)
  useEffect(() => {
    let cancelado = false;
    axios.get(`${apiUrl}/api/compliance/asignables`, { headers })
      .then(res => { if (!cancelado) setAsignables(res.data || []); })
      .catch(() => { if (!cancelado) setAsignables([]); });
    return () => { cancelado = true; };
  }, [apiUrl, headers]);

  // Ficha completa (con todo el historial) del equipo abierto en la ventana
  const claveFicha = modal && modal.claves.length === 1 ? modal.claves[0] : null;
  useEffect(() => {
    if (!claveFicha) { setFicha(null); return undefined; }
    let cancelado = false;
    setFicha({ clave: claveFicha, cargando: true, registro: null });
    axios.get(`${apiUrl}/api/compliance/gestion/${entidad}/${claveFicha}`, { headers })
      .then(res => { if (!cancelado) setFicha({ clave: claveFicha, cargando: false, registro: res.data.registro }); })
      .catch(() => { if (!cancelado) setFicha({ clave: claveFicha, cargando: false, registro: null, error: true }); });
    return () => { cancelado = true; };
  }, [claveFicha, entidad, apiUrl, headers]);

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
  const universoMirada = useMemo(() => (mirada === 'kyndryl' && kyndril ? universo.filter(r => esKyndryl(r, kyndril)) : universo), [universo, mirada, kyndril]);
  const nUniversoKyndryl = useMemo(() => (kyndril ? universo.filter(r => esKyndryl(r, kyndril)).length : 0), [universo, kyndril]);
  // Lista que se muestra: solo lo que hay que gestionar, o TODOS los servidores del universo con su % de adherencia
  const baseLista = useMemo(() => (alcance === 'todos' ? ordenarPorAdherencia(universoMirada) : aGestionarMirada), [alcance, universoMirada, aGestionarMirada]);
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
  const estadoDe = (r) => (regDe(r) ? regDe(r).estado : (r.adh !== null && r.adh >= umbral ? 'Sin gestión' : 'Pendiente'));
  const vencidoDe = (r) => {
    const g = regDe(r);
    return !!g && !!g.fechaResolucion && g.fechaResolucion < hoy && g.estado !== 'Resuelto' && g.estado !== 'Excepción';
  };
  const asignatarioDe = (r) => (regDe(r) ? regDe(r).asignatario : '');

  const conteos = useMemo(() => {
    const c = {};
    ESTADOS_GESTION.forEach(e => { c[e] = 0; });
    let vencidos = 0;
    aGestionarMirada.forEach(r => {
      const g = gestEnt[claveHost(r.host)];
      c[g ? g.estado : 'Pendiente'] += 1;
      if (g && g.fechaResolucion && g.fechaResolucion < hoy && g.estado !== 'Resuelto' && g.estado !== 'Excepción') vencidos += 1;
    });
    return { c, vencidos };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aGestionarMirada, gestEnt, hoy]);

  const listaVista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return baseLista.filter(r => {
      if (ffLista === 'P' && r.clas !== 'PRODUCCION') return false;
      if (ffLista === 'N' && r.clas === 'PRODUCCION') return false;
      if (ffLista === 'bajo' && (r.adh === null || r.adh >= umbral)) return false;
      if (ffLista === 'cumple' && (r.adh === null || r.adh < umbral)) return false;
      if (ffLista === 'sin' && r.adh !== null) return false;
      if (q && !r.host.toLowerCase().includes(q)) return false;
      if (asigFiltro === '__sin__' && asignatarioDe(r)) return false;
      if (asigFiltro !== 'todos' && asigFiltro !== '__sin__' && asignatarioDe(r) !== asigFiltro) return false;
      if (estadoFiltro === 'vencidos') return vencidoDe(r);
      if (estadoFiltro !== 'todos' && estadoDe(r) !== estadoFiltro) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseLista, ffLista, estadoFiltro, busqueda, asigFiltro, gestEnt, hoy, umbral]);

  const maxPag = Math.max(0, Math.ceil(listaVista.length / TAM_PAGINA) - 1);
  const pag = Math.min(pagina, maxPag);
  const filasPagina = listaVista.slice(pag * TAM_PAGINA, (pag + 1) * TAM_PAGINA);
  const filaPorClave = useMemo(() => {
    const m = new Map();
    baseLista.forEach(r => { const k = claveHost(r.host); if (!m.has(k)) m.set(k, r); });
    return m;
  }, [baseLista]);
  const seleccionValida = seleccion.filter(k => filaPorClave.has(k));
  // Todos los equipos del inventario de la hoja (para consultar uno que hoy cumple o quedó fuera de los filtros)
  const todasPorClave = useMemo(() => {
    const m = new Map();
    (rows || []).forEach(r => { const k = claveHost(r.host); if (!m.has(k)) m.set(k, r); });
    return m;
  }, [rows]);
  const filaDe = (clave) => filaPorClave.get(clave) || todasPorClave.get(clave);
  const asignatariosEnLista = useMemo(() => {
    const nombres = new Set();
    baseLista.forEach(r => { const g = gestEnt[claveHost(r.host)]; if (g && g.asignatario) nombres.add(g.asignatario); });
    return Array.from(nombres).sort((a, b) => a.localeCompare(b));
  }, [baseLista, gestEnt]);
  const sugerencias = useMemo(() => {
    const rb = new Set();
    const ce = new Set();
    Object.values(gestEnt).forEach(g => { if (g.responsableBanco) rb.add(g.responsableBanco); if (g.certificador) ce.add(g.certificador); });
    return { responsablesBanco: Array.from(rb).sort(), certificadores: Array.from(ce).sort() };
  }, [gestEnt]);

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
    if (kyndrylFijo(entidad, campo)) return;
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

  const cambiarEntidad = (id) => {
    setEntidad(id); setSeleccion([]); setPagina(0); setFfLista('todos'); setAsigFiltro('todos'); setAlcance('gestionar'); setModal(null); setErrorModal(null);
  };
  const abrirGestion = (clave) => { setErrorModal(null); setModal({ claves: [clave] }); };
  const abrirGestionMasiva = () => { setErrorModal(null); setModal({ claves: seleccionValida }); };
  const cerrarModal = () => { setModal(null); setErrorModal(null); };
  const alternarSeleccion = (clave) => {
    setSeleccion(seleccionValida.includes(clave) ? seleccionValida.filter(k => k !== clave) : [...seleccionValida, clave]);
  };
  const seleccionar = (lista) => setSeleccion(Array.from(new Set(lista.map(r => claveHost(r.host)))));

  // Valores iniciales de la ventana: un equipo → lo que ya tiene guardado; varios → todo en blanco ("sin cambio")
  const construirInicial = (claves) => {
    if (claves.length > 1) return { estado: '', asignatario: '', asignatarioNombre: '', responsableBanco: '', certificador: '', fecha: '', comentario: '' };
    const g = gestEnt[claves[0]];
    return {
      estado: g ? g.estado : 'En gestión',
      asignatario: g ? (g.asignatarioId || (g.asignatario ? `texto:${g.asignatario}` : '')) : '',
      asignatarioNombre: g ? g.asignatario : '',
      responsableBanco: g ? g.responsableBanco : '', certificador: g ? g.certificador : '',
      fecha: g ? g.fechaResolucion : '', comentario: ''
    };
  };

  // Un equipo: se guarda tal cual está el formulario (incluso vacíos). Varios: solo cambian los campos con valor.
  const guardarDesdeModal = async (datos) => {
    const hosts = modal.claves.map(k => (filaDe(k) || {}).host).filter(Boolean);
    if (hosts.length === 0) return;
    setGuardandoGestion(true);
    setErrorModal(null);
    try {
      for (let i = 0; i < hosts.length; i += 400) {
        await axios.put(`${apiUrl}/api/compliance/gestion`, { entidad, hosts: hosts.slice(i, i + 400), reemplazar: hosts.length === 1, ...datos }, { headers });
      }
      setVersionGestion(v => v + 1);
      setModal(null);
      setSeleccion([]);
      setMensaje({ tipo: 'success', texto: `Gestión guardada para ${hosts.length} servidor${hosts.length > 1 ? 'es' : ''}.` });
    } catch (err) {
      setErrorModal('No se pudo guardar la gestión: ' + (err.response?.data?.error || err.message));
    } finally {
      setGuardandoGestion(false);
    }
  };

  // ---------- render ----------
  const filaModal = modal && modal.claves.length === 1 ? filaDe(modal.claves[0]) : null;
  const regModal = ficha && modal && ficha.clave === modal.claves[0] ? ficha : null;
  const chipsModal = filaModal ? [
    { texto: filaModal.adh === null ? 'Adherencia 0% (sin dato)' : `Adherencia ${filaModal.adh}%`, alerta: filaModal.adh === null || filaModal.adh < umbral },
    { texto: `${filaModal.clas === 'PRODUCCION' ? 'Prod' : 'No prod'} · ${filaModal.amb || '—'}` },
    { texto: filaModal.svc || '—' }, { texto: filaModal.ubi || '—' }, { texto: filaModal.so || '—' }
  ] : [];
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
              <span key={e.id} role="button" tabIndex={0} onClick={() => cambiarEntidad(e.id)}
                onKeyDown={(ev) => { if (ev.key === 'Enter') cambiarEntidad(e.id); }}
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
      {mensaje && <div style={{ position: 'sticky', top: 8, zIndex: 20 }}><Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso></div>}

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

                {/* Definición de Kyndryl: fila aparte y siempre visible (no empuja los gráficos) */}
                <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ alignSelf: 'center', minWidth: 150 }}>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--ink-950)', letterSpacing: '.03em' }}>DEFINICIÓN DE KYNDRYL</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', lineHeight: 1.4 }}>Servidores del universo que cumplen esto · <b>{vista.kyndryl.total.total}</b></div>
                      {kyndrylFijo(entidad, 'adm2') && <div style={{ fontSize: '10px', color: '#8a5a06', lineHeight: 1.4 }}>🔒 En Banchile la administración es fija (Todos)</div>}
                    </div>
                    <FiltroSelect etiqueta="ADMINISTRACIÓN PRINCIPAL" opciones={opciones.adm1} valor={kyndril.adm1} onChange={v => cambiarKyndryl('adm1', v)}
                      bloqueado={kyndrylFijo(entidad, 'adm1')} motivo="Fija en Banchile: Kyndryl se define solo por Ubicación" />
                    <FiltroSelect etiqueta="ADMINISTRACIÓN SECUNDARIA" opciones={opciones.adm2} valor={kyndril.adm2} onChange={v => cambiarKyndryl('adm2', v)}
                      bloqueado={kyndrylFijo(entidad, 'adm2')} motivo="Fija en Banchile: Kyndryl se define solo por Ubicación" />
                    <FiltroSelect etiqueta="UBICACIÓN (KYNDRYL)" opciones={opciones.ubi} valor={kyndril.ubi} onChange={v => cambiarKyndryl('ubi', v)} />
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
                <MiradasHardening vistaGlobal={vista.global} vistaKyndryl={vista.kyndryl} detalleKyndryl={describirKyndryl(kyndril)} unico={soloTotal(entidad)} />
              )}

              {/* Gestión */}
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase', margin: '20px 0 8px' }}>
                Gestión de servidores bajo el umbral o sin adherencia
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <div role="group" aria-label="Mirada de la gestión" style={{ display: 'inline-flex', gap: 4, background: 'rgba(255,255,255,0.72)', border: '1px solid var(--line)', borderRadius: '999px', padding: 4 }}>
                  {[['global', 'Global', alcance === 'todos' ? universo.length : aGestionar.length], ['kyndryl', 'Kyndryl', alcance === 'todos' ? nUniversoKyndryl : nKyndryl]].map(([id, texto, n]) => (
                    <span key={id} role="button" tabIndex={0} aria-pressed={mirada === id}
                      onClick={() => { setMirada(id); setPagina(0); }}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') { setMirada(id); setPagina(0); } }}
                      style={{
                        padding: '6px 16px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                        background: mirada === id ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'transparent', color: mirada === id ? '#fff' : 'var(--muted)'
                      }}>{texto} · {n}</span>
                  ))}
                </div>
                <div role="group" aria-label="Alcance del detalle" style={{ display: 'inline-flex', gap: 4, background: 'rgba(255,255,255,0.72)', border: '1px solid var(--line)', borderRadius: '999px', padding: 4 }}>
                  {[['gestionar', `Por gestionar · ${aGestionarMirada.length}`], ['todos', `Todo el universo · ${universoMirada.length}`]].map(([id, texto]) => (
                    <span key={id} role="button" tabIndex={0} aria-pressed={alcance === id}
                      onClick={() => { setAlcance(id); setFfLista('todos'); setPagina(0); }}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') { setAlcance(id); setFfLista('todos'); setPagina(0); } }}
                      style={{
                        padding: '6px 16px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, cursor: 'pointer',
                        background: alcance === id ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'transparent', color: alcance === id ? '#fff' : 'var(--muted)'
                      }}>{texto}</span>
                  ))}
                </div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-950)' }}>
                  {alcance === 'todos' ? (
                    <>Umbral actual: <b>≥ {umbral}%</b> · <b>{universoMirada.length}</b> servidores en el universo ({mirada === 'kyndryl' ? 'Kyndryl' : 'Global'}) · <b>{aGestionarMirada.length}</b> a gestionar</>
                  ) : (
                    <>Umbral actual: <b>≥ {umbral}%</b> · <b>{aGestionarMirada.length}</b> servidores a gestionar ({mirada === 'kyndryl' ? 'Kyndryl' : 'Global'})</>
                  )}
                  {alcance === 'gestionar' && umbral !== 90 && <span style={{ color: '#8a5a06' }}> ({aGestionarMirada.length - aGestionar90 >= 0 ? '+' : ''}{aGestionarMirada.length - aGestionar90} vs. umbral 90%)</span>}
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

              <BuscadorEquipo rows={rows} estadoDe={estadoDe} onElegir={abrirGestion} />

              <div style={{ ...cardStyle, padding: 12 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                  {[['todos', 'Todos'],
                    ...(soloTotal(entidad) ? [] : [['P', 'Producción'], ['N', 'No producción']]),
                    ['bajo', 'Bajo umbral'], ['sin', 'Sin dato'],
                    ...(alcance === 'todos' ? [['cumple', 'Cumplen']] : [])].map(([id, texto]) => (
                    <Chip key={id} activo={ffLista === id} onClick={() => { setFfLista(id); setPagina(0); }}>{texto}</Chip>
                  ))}
                  <input type="search" placeholder="Buscar hostname..." value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(0); }}
                    aria-label="Buscar hostname" style={{ ...inputStyle, width: 180, fontSize: '11px' }} />
                  <select value={asigFiltro} onChange={e => { setAsigFiltro(e.target.value); setPagina(0); }} aria-label="Filtrar por asignatario"
                    style={{ ...inputStyle, fontSize: '11px', width: 'auto' }}>
                    <option value="todos">Asignatario: todos</option>
                    <option value="__sin__">Sin asignar</option>
                    {asignatariosEnLista.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {estadoFiltro !== 'todos' && <Chip activo onClick={() => setEstadoFiltro('todos')}>Estado: {estadoFiltro === 'vencidos' ? 'vencidos' : estadoFiltro} ✕</Chip>}
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6, fontSize: '11px', color: 'var(--muted)' }}>
                  <span>{listaVista.length} servidores en la lista</span>
                  {listaVista.length > 0 && <button onClick={() => seleccionar(filasPagina)} style={{ border: 'none', background: 'transparent', color: 'var(--bank-blue)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', padding: 0 }}>Seleccionar esta página</button>}
                  {listaVista.length > filasPagina.length && <button onClick={() => seleccionar(listaVista)} style={{ border: 'none', background: 'transparent', color: 'var(--bank-blue)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', padding: 0 }}>Seleccionar los {listaVista.length}</button>}
                  {seleccionValida.length > 0 && (
                    <>
                      <button onClick={abrirGestionMasiva} style={{ padding: '5px 12px', borderRadius: '999px', border: 'none', background: 'var(--bank-blue)', color: '#fff', fontWeight: 800, fontSize: '11px', cursor: 'pointer' }}>Gestionar seleccionados ({seleccionValida.length})</button>
                      <button onClick={() => setSeleccion([])} style={{ border: 'none', background: 'transparent', color: 'var(--muted)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', padding: 0 }}>Quitar selección</button>
                    </>
                  )}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['', 'Hostname', 'Ambiente', 'Servicio', 'Adherencia', 'Ubicación', 'Estado', 'Asignatario', 'Resp. Banco', 'Certificador', 'F. resolución', ''].map((h, i, todos) => (
                          <th key={i} style={{
                            textAlign: 'left', fontSize: '10px', color: 'var(--muted)', fontWeight: 800, padding: '6px 6px', whiteSpace: 'nowrap',
                            ...(i === todos.length - 1 ? { position: 'sticky', right: 0, background: '#fff' } : {})
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filasPagina.length === 0 ? (
                        <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--muted)', padding: 18, fontSize: '12px' }}>Sin servidores con estos filtros.</td></tr>
                      ) : filasPagina.map((r, i) => {
                        const clave = claveHost(r.host);
                        const reg = gestEnt[clave];
                        const esKyn = esKyndryl(r, kyndril);
                        const celda = { padding: '7px 6px', fontSize: '11px', borderTop: '1px solid rgba(18,52,78,0.06)', color: 'var(--ink-800)' };
                        return (
                          <tr key={`${clave}-${pag}-${i}`}>
                            <td style={celda}><input type="checkbox" checked={seleccionValida.includes(clave)} onChange={() => alternarSeleccion(clave)} aria-label={`Seleccionar ${r.host}`} /></td>
                            <td style={{ ...celda, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.host}</td>
                            <td style={{ ...celda, whiteSpace: 'nowrap' }}>{r.clas === 'PRODUCCION' ? 'Prod' : 'No prod'} · {r.amb || '—'}</td>
                            <td style={celda}><Recortado texto={r.svc} ancho={80} /></td>
                            <td style={celda}>
                              <CeldaAdherencia adh={r.adh} umbral={umbral} />
                            </td>
                            <td style={{ ...celda, whiteSpace: 'nowrap' }}>{r.ubi || '—'}{esKyn && kyndrylDefinido(kyndril) && <span style={{ marginLeft: 6, fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '999px', background: 'rgba(0,59,113,.1)', color: '#003b71' }}>Kyndryl</span>}</td>
                            <td style={celda}>{estadoDe(r) === 'Sin gestión' ? '—' : <PildoraEstado estado={estadoDe(r)} />}</td>
                            <td style={celda}><Recortado texto={reg && reg.asignatario} ancho={120} /></td>
                            <td style={celda}><Recortado texto={reg && reg.responsableBanco} ancho={90} /></td>
                            <td style={celda}><Recortado texto={reg && reg.certificador} ancho={100} /></td>
                            <td style={{ ...celda, whiteSpace: 'nowrap', color: vencidoDe(r) ? '#a61e2b' : 'var(--ink-800)', fontWeight: vencidoDe(r) ? 800 : 400 }}>
                              {reg && reg.fechaResolucion ? fechaLarga(reg.fechaResolucion) : '—'}
                              {vencidoDe(r) && <div style={{ fontSize: '10px', fontWeight: 800 }}>vencido</div>}
                            </td>
                            <td style={{ ...celda, position: 'sticky', right: 0, background: '#fff', boxShadow: '-8px 0 8px -8px rgba(18,52,78,.25)' }}>
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

              {/* Ventana emergente de gestión (un equipo o varios) */}
              {modal && (
                <ModalGestion
                  key={modal.claves.join('|')}
                  titulo={modal.claves.length === 1 ? `Gestión · ${(filaModal || {}).host || modal.claves[0]}` : `Gestión masiva · ${modal.claves.length} servidores`}
                  chips={chipsModal}
                  esMasivo={modal.claves.length > 1}
                  inicial={construirInicial(modal.claves)}
                  asignables={asignables}
                  sugerencias={sugerencias}
                  historial={modal.claves.length > 1 ? null : (regModal && !regModal.cargando ? (regModal.registro ? regModal.registro.historial : []) : null)}
                  actualizado={regModal && regModal.registro && regModal.registro.actualizadoPor ? `${regModal.registro.actualizadoPor} · ${fechaHora(regModal.registro.actualizadoEn)}` : ''}
                  onGuardar={guardarDesdeModal}
                  onCerrar={cerrarModal}
                  guardando={guardandoGestion}
                  error={errorModal || (regModal && regModal.error ? 'No se pudo cargar el historial de este equipo.' : null)}
                />
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
