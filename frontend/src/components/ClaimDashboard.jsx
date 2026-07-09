import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement, Tooltip, Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend);

const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const NIVEL_MAP = { RDO005:'Associate', RDO006:'Senior Associate', RDO007:'Lead Specialist', RDO008:'Senior Lead', RCO008:'Architect', RDOT05:'Trainee', RDSB06:'Sr Associate SB' };
const TABS_ANALITICA = [
  { id:'resumen',   label:'📊 Resumen' },
  { id:'wbs',       label:'🗂️ Por WBS' },
  { id:'personas',  label:'👥 Por Persona' },
  { id:'nivel',     label:'🏅 Por Nivel' },
  { id:'grupo',     label:'🏢 Por Grupo' },
  { id:'tendencia', label:'📈 Tendencia' }
];
const COLORES_GRUPO = ['#2a78d6','#059669','#7c3aed','#e24b4a','#1baf7a','#d97706','#0891b2','#be185d'];
const COLOR_SIN_GRUPO = '#d97706';

// ── Lógica de match de nombres Excel ↔ Firestore ────────────────────────────
const normalizarNombre = (s) => (s||'').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // quitar tildes
  .replace(/[^a-z\s]/g,'').trim();

const matchearNombre = (empName, usuarios) => {
  const emp = normalizarNombre(empName);
  // 1) exacto normalizado
  const exacto = usuarios.find(u => normalizarNombre(u.nombre) === emp);
  if (exacto) return exacto;
  // 2) partial: al menos 2 palabras en común de longitud >= 3
  const palabrasEmp = emp.split(/\s+/).filter(p => p.length >= 3);
  let mejorMatch = null; let mejorScore = 0;
  usuarios.forEach(u => {
    const palabrasU = normalizarNombre(u.nombre).split(/\s+/).filter(p => p.length >= 3);
    const comunes = palabrasEmp.filter(pe => palabrasU.some(pu => pu.includes(pe) || pe.includes(pu)));
    if (comunes.length >= 2 && comunes.length > mejorScore) {
      mejorScore = comunes.length; mejorMatch = u;
    }
  });
  return mejorMatch;
};

const fmt = (n, dec=1) => (Math.round(n * Math.pow(10,dec)) / Math.pow(10,dec)).toFixed(dec);
const fmtK = (n) => n >= 1000 ? '$' + fmt(n/1000) + 'K' : '$' + Math.round(n);

const parseFecha = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000));
  const d = new Date(v); return isNaN(d.getTime()) ? null : d;
};

// ─── sub-componentes de gráfico ───────────────────────────────────────────
const MiniBar = ({ label, value, max, color='#2a78d6', right='' }) => (
  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'7px' }}>
    <div style={{ fontSize:'11px', color:'#6b7280', width:'140px', flexShrink:0, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</div>
    <div style={{ flex:1, background:'#e5e7eb', borderRadius:'3px', height:'7px', overflow:'hidden' }}>
      <div style={{ width:`${Math.round(value/max*100)}%`, height:'100%', background:color, borderRadius:'3px' }} />
    </div>
    <div style={{ fontSize:'11px', color:'#9ca3af', width:'52px', flexShrink:0, textAlign:'right' }}>{right}</div>
  </div>
);

const InsightBox = ({ text }) => (
  <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'8px', padding:'10px 12px', fontSize:'12px', color:'#1e40af', marginTop:'12px', display:'flex', gap:'8px' }}>
    <span>💡</span><span>{text}</span>
  </div>
);

const ChartCard = ({ title, height=220, children }) => (
  <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
    <h4 style={{ margin:'0 0 12px', fontSize:'13px', color:'#374151', fontWeight:'600' }}>{title}</h4>
    <div style={{ position:'relative', height:`${height}px`, overflow:'hidden' }}>{children}</div>
  </div>
);

const grid2 = { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:'16px', marginBottom:'16px' };
const grid3 = { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'12px', marginBottom:'16px' };
const gridColor = 'rgba(128,128,128,0.12)';
const textMuted = '#888';
const chartBase = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} },
  scales:{ x:{ ticks:{font:{size:9},color:textMuted,maxRotation:45,autoSkip:false}, grid:{display:false} },
            y:{ ticks:{font:{size:9},color:textMuted}, grid:{color:gridColor}, beginAtZero:true } } };

// ─── componente principal ─────────────────────────────────────────────────
const ClaimDashboard = ({ token, apiUrl, clienteActivo = '' }) => {
  const [semanas, setSemanas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [loadingDatos, setLoadingDatos] = useState(true);
  const [ultimaCarga, setUltimaCarga] = useState(null);
  const [filtroMes, setFiltroMes] = useState(new Date().getMonth() + 1);
  const [filtroAnio, setFiltroAnio] = useState(new Date().getFullYear());
  const [tabAnalitca, setTabAnalitica] = useState('resumen');
  // Datos para cruce por grupo
  const [usuariosFS, setUsuariosFS] = useState([]);
  const [gruposFS, setGruposFS] = useState([]);
  const fileRef = useRef();

  const getHeaders = useCallback(() => {
    const h = { Authorization: `Bearer ${token}` };
    if (clienteActivo) h['x-cliente-activo'] = clienteActivo;
    return h;
  }, [token, clienteActivo]);

  // ── cargar datos de Firestore al montar ──
  const cargarDatos = useCallback(async () => {
    setLoadingDatos(true);
    try {
      const res = await axios.get(`${apiUrl}/api/claims`, { headers: getHeaders() });
      setSemanas(res.data || []);
      if (res.data?.length > 0) {
        const ultima = res.data[res.data.length - 1];
        setUltimaCarga(ultima.creadoEn ? new Date(ultima.creadoEn._seconds * 1000).toLocaleString('es-CL') : ultima.fecha);
      }
    } catch (err) { console.error('Error cargando claims:', err.message); }
    finally { setLoadingDatos(false); }
  }, [apiUrl, getHeaders]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  // Cargar usuarios y grupos para cruce por grupo
  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };
    Promise.all([
      axios.get(`${apiUrl}/api/admin/listar-usuarios`, { headers: h }),
      axios.get(`${apiUrl}/api/grupos-servicio`, { headers: h })
    ]).then(([resU, resG]) => {
      setUsuariosFS(resU.data.usuarios || []);
      setGruposFS(resG.data || []);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, apiUrl]);

  // ── procesar Excel y subir a Firestore ──
  const procesarExcel = async (file) => {
    setCargando(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type:'array', cellDates:true });
      const ws = wb.Sheets['Export'];
      if (!ws) throw new Error('No se encontró la hoja "Export"');

      const filas = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
      const headers = filas[0];
      const h = {};
      headers.forEach((v, i) => { if (v) h[String(v).trim()] = i; });

      const requeridos = ['EMP_NAME','WEEK_ENDING_DATE','HOURS','OVERTIME_IND','COST_SPOT_USD'];
      for (const r of requeridos) {
        if (!(r in h)) throw new Error(`Columna requerida no encontrada: ${r}`);
      }

      const porSemana = {};
      for (let i = 1; i < filas.length; i++) {
        const fila = filas[i];
        const fecha = parseFecha(fila[h['WEEK_ENDING_DATE']]);
        if (!fecha) continue;
        const key = fecha.toISOString().slice(0,10);
        const persona = String(fila[h['EMP_NAME']] || '').trim();
        const horas = parseFloat(fila[h['HOURS']]) || 0;
        const ot = String(fila[h['OVERTIME_IND']] || '');
        const costo = parseFloat(fila[h['COST_SPOT_USD']]) || 0;
        const wbs = String(fila[h['WBS_DESC']] || 'Sin WBS').trim();
        const offering = String(fila[h['OFFERING_NAME']] || '').replace('CLOUD: ','').trim();
        const nivel = NIVEL_MAP[String(fila[h['EMP_LEVEL_CODE']] || '')] || 'Otro';
        const jobRole = String(fila[h['PRIMARY_JOB_ROLE']] || '').trim();

        if (!porSemana[key]) {
          porSemana[key] = {
            fecha: key,
            label: fecha.toLocaleDateString('es-CL', { day:'2-digit', month:'short' }),
            mes: fecha.getMonth() + 1,
            anio: fecha.getFullYear(),
            base:0, ot:0, sb:0, costo:0,
            personas:{}, wbs:{}, offering:{}, nivel:{}, jobRoles:{}
          };
        }
        const s = porSemana[key];
        if (ot.includes('Over Time')) s.ot += horas;
        else if (ot.includes('Stand')) s.sb += horas;
        else s.base += horas;
        s.costo += costo;
        if (persona) {
          if (!s.personas[persona]) s.personas[persona] = { horas:0, costo:0 };
          s.personas[persona].horas += horas;
          s.personas[persona].costo += costo;
        }
        if (wbs) { if (!s.wbs[wbs]) s.wbs[wbs] = { horas:0, costo:0 }; s.wbs[wbs].horas += horas; s.wbs[wbs].costo += costo; }
        if (offering) { if (!s.offering[offering]) s.offering[offering] = { horas:0, costo:0 }; s.offering[offering].horas += horas; s.offering[offering].costo += costo; }
        if (nivel) { if (!s.nivel[nivel]) s.nivel[nivel] = { horas:0, costo:0 }; s.nivel[nivel].horas += horas; s.nivel[nivel].costo += costo; }
        if (jobRole) { if (!s.jobRoles[jobRole]) s.jobRoles[jobRole] = 0; s.jobRoles[jobRole] += horas; }
      }

      const nuevasSemanas = Object.values(porSemana).sort((a,b) => a.fecha.localeCompare(b.fecha));
      const res = await axios.post(`${apiUrl}/api/claims/upload`, { semanas: nuevasSemanas }, { headers: getHeaders() });
      alert(`✅ ${res.data.message}\nNuevas: ${res.data.nuevas} · Total en archivo: ${res.data.total}`);
      await cargarDatos();
    } catch (err) {
      alert('❌ Error: ' + err.message);
    } finally { setCargando(false); }
  };

  const limpiarDatos = async () => {
    if (!window.confirm('¿Eliminar TODOS los datos de Claims de Firestore? No se puede deshacer.')) return;
    try {
      await axios.delete(`${apiUrl}/api/claims`, { headers: getHeaders() });
      setSemanas([]); setUltimaCarga(null);
      alert('✅ Datos eliminados');
    } catch (err) { alert('Error: ' + err.message); }
  };

  // ── filtrado y agregación ──
  const aniosDisponibles = [...new Set(semanas.map(s => s.anio))].sort((a,b) => b-a);
  const filtradas = semanas.filter(s => s.mes === filtroMes && s.anio === filtroAnio);

  // KPIs del período
  const totalH = filtradas.reduce((sum,s) => sum + s.base + s.ot + s.sb, 0);
  const totalOT = filtradas.reduce((sum,s) => sum + s.ot, 0);
  const totalSB = filtradas.reduce((sum,s) => sum + s.sb, 0);
  const totalCosto = filtradas.reduce((sum,s) => sum + s.costo, 0);
  const semsConOT = filtradas.filter(s => s.ot > 0 || s.sb > 0).length;
  const promSem = filtradas.length ? totalH / filtradas.length : 0;

  // ── Agregación por Grupo de Servicio ──────────────────────────────────────
  // Construir mapa empName → { grupoId, grupoNombre }
  const mapaGrupos = {};
  gruposFS.forEach(g => { mapaGrupos[g.id] = g.nombre; });

  const gruposPorPersona = {}; // nombreExcel → { grupoId, grupoNombre, matched }
  const todasPersonasExcel = new Set();
  filtradas.forEach(s => Object.keys(s.personas||{}).forEach(p => todasPersonasExcel.add(p)));

  todasPersonasExcel.forEach(empName => {
    const userMatch = matchearNombre(empName, usuariosFS);
    if (userMatch && userMatch.grupoServicioId) {
      gruposPorPersona[empName] = {
        grupoId: userMatch.grupoServicioId,
        grupoNombre: mapaGrupos[userMatch.grupoServicioId] || userMatch.grupoServicioId,
        matched: true
      };
    } else {
      gruposPorPersona[empName] = { grupoId: '__sin_grupo__', grupoNombre: 'Sin grupo asignado', matched: !!userMatch };
    }
  });

  // Acumular horas/costo por grupo
  const grupoTotal = {};
  filtradas.forEach(s => {
    Object.entries(s.personas||{}).forEach(([empName, datos]) => {
      const { grupoNombre } = gruposPorPersona[empName] || { grupoNombre: 'Sin grupo asignado' };
      if (!grupoTotal[grupoNombre]) grupoTotal[grupoNombre] = { horas:0, costo:0, personas:new Set() };
      grupoTotal[grupoNombre].horas += datos.horas || 0;
      grupoTotal[grupoNombre].costo += datos.costo || 0;
      grupoTotal[grupoNombre].personas.add(empName);
    });
  });
  const grupoOrdenado = Object.entries(grupoTotal).sort((a,b) => b[1].horas - a[1].horas);
  const maxGrupoH = grupoOrdenado[0]?.[1].horas || 1;

  // Personas sin match o sin grupo
  const sinGrupo = [...todasPersonasExcel].filter(p => gruposPorPersona[p]?.grupoId === '__sin_grupo__');
  const sinGrupoConHoras = sinGrupo.map(p => {
    const h = filtradas.reduce((sum,s) => sum + ((s.personas||{})[p]?.horas||0), 0);
    const c = filtradas.reduce((sum,s) => sum + ((s.personas||{})[p]?.costo||0), 0);
    return { nombre:p, horas:h, costo:c, matched: gruposPorPersona[p]?.matched };
  }).sort((a,b) => b.horas - a.horas);

  // Chart tendencia por grupo (barras apiladas semanales)
  const gruposUnicos = grupoOrdenado.filter(([k]) => k !== 'Sin grupo asignado').map(([k]) => k);
  const chartGrupoSemanal = {
    labels: filtradas.map(s => s.label),
    datasets: [
      ...gruposUnicos.map((g, i) => ({
        label: g,
        data: filtradas.map(s => {
          return Object.entries(s.personas||{}).reduce((sum,[emp,datos]) => {
            return (gruposPorPersona[emp]?.grupoNombre === g) ? sum + (datos.horas||0) : sum;
          }, 0);
        }),
        backgroundColor: COLORES_GRUPO[i % COLORES_GRUPO.length],
        stack: 'g'
      })),
      {
        label: 'Sin grupo', stack: 'g',
        data: filtradas.map(s => Object.entries(s.personas||{}).reduce((sum,[emp,datos]) =>
          gruposPorPersona[emp]?.grupoId === '__sin_grupo__' ? sum + (datos.horas||0) : sum, 0)),
        backgroundColor: COLOR_SIN_GRUPO
      }
    ]
  };

  const chartDonutGrupo = {
    labels: grupoOrdenado.map(([k]) => k),
    datasets:[{ data: grupoOrdenado.map(([,v]) => v.horas),
      backgroundColor: grupoOrdenado.map(([k],i) => k === 'Sin grupo asignado' ? COLOR_SIN_GRUPO : COLORES_GRUPO[i % COLORES_GRUPO.length]),
      borderWidth:0 }]
  };

  // Agregación WBS
  const wbsTotal = {};
  filtradas.forEach(s => Object.entries(s.wbs||{}).forEach(([k,v]) => {
    if (!wbsTotal[k]) wbsTotal[k] = { horas:0, costo:0 };
    wbsTotal[k].horas += v.horas; wbsTotal[k].costo += v.costo;
  }));
  const wbsOrdenado = Object.entries(wbsTotal).sort((a,b) => b[1].horas - a[1].horas);

  // Agregación Offering
  const offTotal = {};
  filtradas.forEach(s => Object.entries(s.offering||{}).forEach(([k,v]) => {
    if (!offTotal[k]) offTotal[k] = { horas:0, costo:0 };
    offTotal[k].horas += v.horas; offTotal[k].costo += v.costo;
  }));
  const offOrdenado = Object.entries(offTotal).sort((a,b) => b[1].horas - a[1].horas);

  // Agregación Personas
  const perTotal = {};
  filtradas.forEach(s => Object.entries(s.personas||{}).forEach(([k,v]) => {
    if (!perTotal[k]) perTotal[k] = { horas:0, costo:0 };
    perTotal[k].horas += v.horas; perTotal[k].costo += v.costo;
  }));
  const perOrdenado = Object.entries(perTotal).sort((a,b) => b[1].horas - a[1].horas).slice(0,10);
  const maxPerH = perOrdenado[0]?.[1].horas || 1;

  // Agregación Nivel
  const nivTotal = {};
  filtradas.forEach(s => Object.entries(s.nivel||{}).forEach(([k,v]) => {
    if (!nivTotal[k]) nivTotal[k] = { horas:0, costo:0, personas:new Set() };
    nivTotal[k].horas += v.horas; nivTotal[k].costo += v.costo;
  }));
  const nivOrdenado = Object.entries(nivTotal).sort((a,b) => b[1].horas - a[1].horas);
  const maxNivH = nivOrdenado[0]?.[1].horas || 1;

  // Charts semanales
  const COLORES_OFF = ['#2a78d6','#1baf7a','#eda100','#4a3aa7','#e24b4a'];
  const chartSemanal = {
    labels: filtradas.map(s => s.label),
    datasets: [
      { label:'Base', data:filtradas.map(s=>s.base), backgroundColor:'#2a78d6', stack:'h' },
      { label:'Overtime', data:filtradas.map(s=>s.ot), backgroundColor:'#eda100', stack:'h' },
      { label:'Stand-by', data:filtradas.map(s=>s.sb), backgroundColor:'#4a3aa7', stack:'h' }
    ]
  };
  const chartCosto = {
    labels: filtradas.map(s => s.label),
    datasets:[{ label:'Costo USD', data:filtradas.map(s=>s.costo), borderColor:'#1baf7a', backgroundColor:'rgba(27,175,122,0.08)', borderWidth:2, fill:true, tension:0.35, pointRadius:4, pointBackgroundColor:'#1baf7a', pointBorderColor:'#fff', pointBorderWidth:1.5 }]
  };
  const chartDonutOff = {
    labels: offOrdenado.map(([k]) => k.substring(0,30)),
    datasets:[{ data:offOrdenado.map(([,v])=>v.horas), backgroundColor:COLORES_OFF, borderWidth:0 }]
  };
  const chartDonutWbs = {
    labels: wbsOrdenado.slice(0,5).map(([k]) => k.substring(0,30)),
    datasets:[{ data:wbsOrdenado.slice(0,5).map(([,v])=>v.horas), backgroundColor:['#2a78d6','#1baf7a','#eda100','#4a3aa7','#e24b4a'], borderWidth:0 }]
  };

  // Tendencia — todas las semanas
  const todosSem = [...semanas].sort((a,b) => a.fecha.localeCompare(b.fecha));
  const chartTendencia = {
    labels: todosSem.map(s => s.label),
    datasets:[
      { label:'Horas', data:todosSem.map(s=>s.base+s.ot+s.sb), borderColor:'#2a78d6', backgroundColor:'rgba(42,120,214,0.07)', borderWidth:2, fill:true, tension:0.35, pointRadius:3, pointBackgroundColor:'#2a78d6', yAxisID:'y' },
      { label:'Costo USD', data:todosSem.map(s=>s.costo), borderColor:'#1baf7a', backgroundColor:'transparent', borderWidth:2, borderDash:[4,3], fill:false, tension:0.35, pointRadius:3, pointBackgroundColor:'#1baf7a', yAxisID:'y2' }
    ]
  };
  const chartTendOpts = { responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ display:true, position:'top', labels:{ font:{size:11}, boxWidth:12, padding:14 } }, tooltip:{ mode:'index', intersect:false } },
    scales:{
      x:{ ticks:{font:{size:9},color:textMuted,maxRotation:45,autoSkip:false}, grid:{display:false} },
      y:{ ticks:{font:{size:9},color:textMuted}, grid:{color:gridColor}, beginAtZero:true, position:'left' },
      y2:{ ticks:{font:{size:9},color:textMuted,callback:v=>'$'+Math.round(v/1000)+'K'}, grid:{display:false}, beginAtZero:true, position:'right' }
    }
  };
  const donutOpts = { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{display:false} } };
  const barOpts = { ...chartBase, scales:{ ...chartBase.scales, x:{...chartBase.scales.x,stacked:true}, y:{...chartBase.scales.y,stacked:true} } };
  const lineOpts = { ...chartBase, scales:{ ...chartBase.scales, y:{...chartBase.scales.y, ticks:{...chartBase.scales.y.ticks, callback:v=>'$'+Math.round(v/1000)+'K'}} } };

  // KPI box helper
  const KPI = ({ icon, label, value, sub, color='#111827' }) => (
    <div style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'14px 16px' }}>
      <div style={{ fontSize:'11px', color:'#6b7280', marginBottom:'4px' }}>{icon} {label}</div>
      <div style={{ fontSize:'20px', fontWeight:'700', color, marginBottom:'3px' }}>{value}</div>
      {sub && <div style={{ fontSize:'11px', color:'#9ca3af' }}>{sub}</div>}
    </div>
  );

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <section className="seccion">
      {/* HEADER */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'12px', marginBottom:'20px' }}>
        <div>
          <h2 style={{ marginBottom:'4px' }}>🕐 Control de Labor (Claim)</h2>
          <p style={{ fontSize:'13px', color:'#6b7280', margin:0 }}>Horas imputadas por el equipo Kyndryl Chile · datos en Firestore · carga semanal progresiva</p>
        </div>
        {ultimaCarga && (
          <div style={{ fontSize:'12px', color:'#9ca3af', textAlign:'right' }}>
            Última carga: {ultimaCarga}<br/>
            <button onClick={limpiarDatos} style={{ fontSize:'11px', color:'#ef4444', background:'none', border:'none', cursor:'pointer', padding:0, marginTop:'4px' }}>
              🗑️ Limpiar todos los datos
            </button>
          </div>
        )}
      </div>

      {/* UPLOAD */}
      <div style={{ border:'1.5px dashed #d1d5db', borderRadius:'8px', padding:'14px 20px', display:'flex', alignItems:'center', gap:'14px', marginBottom:'24px', background:'#fafafa', cursor:'pointer' }}
        onClick={() => fileRef.current?.click()}>
        <span style={{ fontSize:'26px' }}>📊</span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:'600', fontSize:'14px', marginBottom:'2px' }}>
            {cargando ? '⏳ Procesando archivo...' : 'Cargar Export.xlsx semanal'}
          </div>
          <div style={{ fontSize:'12px', color:'#9ca3af' }}>
            Acumulativo · hoja "Export" requerida · las semanas nuevas se guardan en Firestore
          </div>
        </div>
        <button disabled={cargando} onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
          style={{ padding:'8px 16px', background: cargando ? '#d1d5db' : '#FF462D', color:'#fff', border:'none', borderRadius:'8px', fontWeight:'700', fontSize:'13px', cursor: cargando ? 'not-allowed':'pointer', whiteSpace:'nowrap' }}>
          {cargando ? '⏳ Cargando...' : '⬆️ Seleccionar archivo'}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }}
          onChange={(e) => { if (e.target.files[0]) procesarExcel(e.target.files[0]); e.target.value=''; }} />
      </div>

      {loadingDatos ? (
        <p style={{ textAlign:'center', color:'#9ca3af', padding:'40px' }}>⏳ Cargando datos de Firestore...</p>
      ) : semanas.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'#9ca3af' }}>
          <div style={{ fontSize:'48px', marginBottom:'14px' }}>📂</div>
          <p style={{ fontWeight:'600' }}>Sin datos cargados</p>
          <p style={{ fontSize:'13px' }}>Sube el archivo Export.xlsx para comenzar</p>
        </div>
      ) : (
        <>
          {/* FILTROS */}
          <div style={{ display:'flex', gap:'14px', alignItems:'flex-end', flexWrap:'wrap', background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'14px 18px', marginBottom:'22px' }}>
            <div className="form-group" style={{ minWidth:'130px' }}>
              <label style={{ fontSize:'12px', fontWeight:'600', color:'#6b7280', display:'block', marginBottom:'5px' }}>Mes</label>
              <select value={filtroMes} onChange={e => setFiltroMes(parseInt(e.target.value))}>
                {MESES.slice(1).map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ minWidth:'100px' }}>
              <label style={{ fontSize:'12px', fontWeight:'600', color:'#6b7280', display:'block', marginBottom:'5px' }}>Año</label>
              <select value={filtroAnio} onChange={e => setFiltroAnio(parseInt(e.target.value))}>
                {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div style={{ fontSize:'13px', color:'#6b7280', paddingLeft:'12px', borderLeft:'1px solid #e5e7eb', alignSelf:'center' }}>
              {filtradas.length > 0
                ? <><strong>{filtradas.length}</strong> semanas · {MESES[filtroMes]} {filtroAnio}</>
                : <span style={{ color:'#ef4444' }}>Sin datos para este período</span>}
            </div>
          </div>

          {/* KPIs globales del período */}
          <div style={{ ...grid3, gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', marginBottom:'24px' }}>
            <KPI icon="🕐" label="Horas imputadas" value={fmt(totalH)+'h'} sub={`OT: ${fmt(totalOT)}h · SB: ${fmt(totalSB)}h`} color="#2563eb" />
            <KPI icon="💵" label="Costo total USD" value={fmtK(totalCosto)} sub={`Prom: ${fmtK(filtradas.length ? totalCosto/filtradas.length : 0)}/sem`} color="#059669" />
            <KPI icon="⚠️" label="Semanas con OT/SB" value={semsConOT} sub={`de ${filtradas.length} semanas`} color="#d97706" />
            <KPI icon="📊" label="Promedio semanal" value={fmt(promSem)+'h'} sub="horas imputadas/sem" />
            <KPI icon="💹" label="Rate promedio equipo"
              value={'$' + (totalH > 0 ? fmt(totalCosto/totalH) : '—') + '/h'}
              sub="costo por hora imputada" color="#7c3aed" />
          </div>

          {/* TABS DE ANALÍTICA */}
          <div style={{ borderBottom:'2px solid #e5e7eb', display:'flex', gap:'4px', marginBottom:'20px', overflowX:'auto' }}>
            {TABS_ANALITICA.map(t => (
              <button key={t.id} onClick={() => setTabAnalitica(t.id)}
                style={{ padding:'10px 16px', background:'none', border:'none', borderBottom: tabAnalitca===t.id ? '3px solid #FF462D':'3px solid transparent',
                  color: tabAnalitca===t.id ? '#FF462D':'#6b7280', fontWeight:'600', fontSize:'13px', cursor:'pointer', whiteSpace:'nowrap', marginBottom:'-2px' }}>
                {t.label}
              </button>
            ))}
          </div>

          {filtradas.length === 0 ? (
            <p style={{ textAlign:'center', padding:'40px', color:'#9ca3af' }}>Sin datos para {MESES[filtroMes]} {filtroAnio}</p>
          ) : (
            <>
              {/* ── TAB RESUMEN ── */}
              {tabAnalitca === 'resumen' && (
                <div>
                  <div style={grid2}>
                    <ChartCard title="Horas por semana · Base / Overtime / Stand-by" height={220}>
                      <Bar data={chartSemanal} options={barOpts} />
                    </ChartCard>
                    <ChartCard title="Costo USD por semana" height={220}>
                      <Line data={chartCosto} options={lineOpts} />
                    </ChartCard>
                  </div>
                  <div style={grid2}>
                    <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                      <h4 style={{ margin:'0 0 12px', fontSize:'13px', color:'#374151', fontWeight:'600' }}>Distribución por Offering</h4>
                      <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                        <div style={{ position:'relative', width:'110px', height:'110px', flexShrink:0 }}>
                          <Doughnut data={chartDonutOff} options={donutOpts} />
                        </div>
                        <div>
                          {offOrdenado.map(([k,v],i) => (
                            <div key={k} style={{ display:'flex', alignItems:'center', gap:'7px', fontSize:'11px', color:'#6b7280', marginBottom:'6px' }}>
                              <div style={{ width:'10px', height:'10px', borderRadius:'2px', background:COLORES_OFF[i]||'#888', flexShrink:0 }}></div>
                              <div><div style={{ fontWeight:'600', color:'#374151' }}>{k.substring(0,35)}</div>
                              <div>{fmt(v.horas)}h · {fmtK(v.costo)} · {totalH>0?fmt(v.horas/totalH*100):'0'}%</div></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                      <h4 style={{ margin:'0 0 12px', fontSize:'13px', color:'#374151', fontWeight:'600' }}>Distribución por tipo de WBS</h4>
                      <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                        <div style={{ position:'relative', width:'110px', height:'110px', flexShrink:0 }}>
                          <Doughnut data={chartDonutWbs} options={donutOpts} />
                        </div>
                        <div>
                          {wbsOrdenado.slice(0,5).map(([k,v],i) => (
                            <div key={k} style={{ display:'flex', alignItems:'center', gap:'7px', fontSize:'11px', color:'#6b7280', marginBottom:'6px' }}>
                              <div style={{ width:'10px', height:'10px', borderRadius:'2px', background:['#2a78d6','#1baf7a','#eda100','#4a3aa7','#e24b4a'][i], flexShrink:0 }}></div>
                              <div><div style={{ fontWeight:'600', color:'#374151' }}>{k.substring(0,30)}</div>
                              <div>{fmt(v.horas)}h · {fmtK(v.costo)}</div></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB WBS ── */}
              {tabAnalitca === 'wbs' && (
                <div>
                  <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px', marginBottom:'16px' }}>
                    <h4 style={{ margin:'0 0 14px', fontSize:'13px', color:'#374151', fontWeight:'600' }}>Horas por WBS</h4>
                    {wbsOrdenado.map(([k,v]) => <MiniBar key={k} label={k.substring(0,25)} value={v.horas} max={wbsOrdenado[0][1].horas} right={fmt(v.horas)+'h'} />)}
                  </div>
                  <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                    <h4 style={{ margin:'0 0 12px', fontSize:'13px', color:'#374151', fontWeight:'600' }}>Detalle WBS — horas, costo y rate/h</h4>
                    <table className="tabla" style={{ minWidth:0 }}>
                      <thead><tr><th>WBS</th><th>Horas</th><th>Costo USD</th><th>Rate/h</th></tr></thead>
                      <tbody>
                        {wbsOrdenado.map(([k,v]) => (
                          <tr key={k}>
                            <td style={{ fontSize:'12px' }}>{k}</td>
                            <td>{fmt(v.horas)}h</td>
                            <td>{fmtK(v.costo)}</td>
                            <td style={{ color:'#d97706', fontWeight:'600' }}>${v.horas>0?fmt(v.costo/v.horas):0}/h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <InsightBox text={`WBS con mayor rate/h: ${wbsOrdenado.sort((a,b)=>(b[1].costo/b[1].horas)-(a[1].costo/a[1].horas))[0]?.[0] || '—'}. Monitorear si escala en horas.`} />
                  </div>
                </div>
              )}

              {/* ── TAB PERSONAS ── */}
              {tabAnalitca === 'personas' && (
                <div style={grid2}>
                  <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                    <h4 style={{ margin:'0 0 14px', fontSize:'13px', color:'#374151', fontWeight:'600' }}>Top 10 · horas imputadas</h4>
                    {perOrdenado.map(([k,v]) => <MiniBar key={k} label={k} value={v.horas} max={maxPerH} right={fmt(v.horas)+'h'} />)}
                  </div>
                  <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                    <h4 style={{ margin:'0 0 12px', fontSize:'13px', color:'#374151', fontWeight:'600' }}>Rate USD/h por persona</h4>
                    <table className="tabla" style={{ minWidth:0 }}>
                      <thead><tr><th>Persona</th><th>Horas</th><th>Rate/h</th><th>Total USD</th></tr></thead>
                      <tbody>
                        {[...perOrdenado].sort((a,b) => (b[1].costo/b[1].horas)-(a[1].costo/a[1].horas)).map(([k,v]) => (
                          <tr key={k}>
                            <td style={{ fontSize:'11px' }}>{k}</td>
                            <td>{fmt(v.horas)}h</td>
                            <td style={{ color:'#d97706', fontWeight:'600' }}>${v.horas>0?fmt(v.costo/v.horas):0}/h</td>
                            <td>{fmtK(v.costo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── TAB NIVEL ── */}
              {tabAnalitca === 'nivel' && (
                <div>
                  <div style={grid2}>
                    <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                      <h4 style={{ margin:'0 0 14px', fontSize:'13px', color:'#374151', fontWeight:'600' }}>Horas por nivel de seniority</h4>
                      {nivOrdenado.map(([k,v]) => <MiniBar key={k} label={k} value={v.horas} max={maxNivH} right={fmt(v.horas)+'h'} />)}
                    </div>
                    <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                      <h4 style={{ margin:'0 0 14px', fontSize:'13px', color:'#374151', fontWeight:'600' }}>Costo USD por nivel</h4>
                      {[...nivOrdenado].sort((a,b) => b[1].costo-a[1].costo).map(([k,v]) => (
                        <MiniBar key={k} label={k} value={v.costo} max={nivOrdenado.reduce((m,[,x])=>Math.max(m,x.costo),1)} color="#1baf7a" right={fmtK(v.costo)} />
                      ))}
                    </div>
                  </div>
                  <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                    <h4 style={{ margin:'0 0 12px', fontSize:'13px', color:'#374151', fontWeight:'600' }}>Tabla comparativa por nivel</h4>
                    <table className="tabla" style={{ minWidth:0 }}>
                      <thead><tr><th>Nivel</th><th>Horas</th><th>Costo USD</th><th>Rate prom/h</th></tr></thead>
                      <tbody>
                        {nivOrdenado.map(([k,v]) => (
                          <tr key={k}>
                            <td style={{ fontWeight:'600' }}>{k}</td>
                            <td>{fmt(v.horas)}h</td>
                            <td>{fmtK(v.costo)}</td>
                            <td style={{ color:'#d97706', fontWeight:'600' }}>${v.horas>0?fmt(v.costo/v.horas):0}/h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <InsightBox text="Lead Specialist y Senior Lead tienen el mayor rate/h — concentrar sus horas en WBS de mayor valor agrega más margen." />
                  </div>
                </div>
              )}

              {/* ── TAB TENDENCIA (todas las semanas) ── */}
              {/* ── TAB POR GRUPO ── */}
              {tabAnalitca === 'grupo' && (
                <div>
                  {/* KPIs de grupo */}
                  <div style={{ ...grid3, gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', marginBottom:'20px' }}>
                    <KPI icon="🏢" label="Grupos con datos" value={grupoOrdenado.filter(([k])=>k!=='Sin grupo asignado').length} sub={`de ${gruposFS.length} configurados`} color="#2563eb" />
                    <KPI icon="⚠️" label="Personas sin grupo" value={sinGrupo.length} sub="en Excel sin asignar" color="#d97706" />
                    <KPI icon="✓" label="Personas cruzadas" value={[...todasPersonasExcel].length - sinGrupo.length} sub="match exitoso" color="#059669" />
                  </div>

                  {/* Barras + tabla */}
                  <div style={grid2}>
                    <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                      <h4 style={{ margin:'0 0 14px', fontSize:'13px', fontWeight:'600' }}>Horas por grupo</h4>
                      {grupoOrdenado.map(([nombre, v], i) => (
                        <MiniBar key={nombre} label={nombre}
                          value={v.horas} max={maxGrupoH}
                          color={nombre === 'Sin grupo asignado' ? COLOR_SIN_GRUPO : COLORES_GRUPO[i % COLORES_GRUPO.length]}
                          right={fmt(v.horas)+'h'} />
                      ))}
                    </div>
                    <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                      <h4 style={{ margin:'0 0 12px', fontSize:'13px', fontWeight:'600' }}>Costo y Rate/h por grupo</h4>
                      <table className="tabla" style={{ minWidth:0 }}>
                        <thead><tr><th>Grupo</th><th>Personas</th><th>Horas</th><th>Costo</th><th>Rate/h</th></tr></thead>
                        <tbody>
                          {grupoOrdenado.map(([nombre, v], i) => (
                            <tr key={nombre}>
                              <td style={{ fontSize:'12px' }}>
                                <span style={{ display:'inline-block', width:'8px', height:'8px', borderRadius:'2px', marginRight:'6px',
                                  background: nombre === 'Sin grupo asignado' ? COLOR_SIN_GRUPO : COLORES_GRUPO[i % COLORES_GRUPO.length] }}></span>
                                {nombre}
                              </td>
                              <td style={{ textAlign:'center' }}>{v.personas.size}</td>
                              <td>{fmt(v.horas)}h</td>
                              <td>{fmtK(v.costo)}</td>
                              <td style={{ color:'#d97706', fontWeight:'600' }}>${v.horas > 0 ? fmt(v.costo/v.horas) : 0}/h</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Tendencia semanal por grupo */}
                  <ChartCard title="Tendencia semanal de horas por grupo — barras apiladas" height={220}>
                    <Bar data={chartGrupoSemanal} options={{ ...barOpts, plugins:{ legend:{ display:true, position:'bottom', labels:{ font:{size:10}, boxWidth:10, padding:12 } }, tooltip:{ mode:'index', intersect:false } } }} />
                  </ChartCard>

                  {/* Donut + tabla sin grupo */}
                  <div style={{ ...grid2, marginTop:'16px' }}>
                    <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                      <h4 style={{ margin:'0 0 12px', fontSize:'13px', fontWeight:'600' }}>Distribución % por grupo</h4>
                      <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                        <div style={{ position:'relative', width:'120px', height:'120px', flexShrink:0 }}>
                          <Doughnut data={chartDonutGrupo} options={{ responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{ legend:{display:false} } }} />
                        </div>
                        <div>
                          {grupoOrdenado.map(([k,v], i) => (
                            <div key={k} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', color:'#6b7280', marginBottom:'5px' }}>
                              <div style={{ width:'9px', height:'9px', borderRadius:'2px', flexShrink:0,
                                background: k === 'Sin grupo asignado' ? COLOR_SIN_GRUPO : COLORES_GRUPO[i % COLORES_GRUPO.length] }}></div>
                              <span>{k}</span>
                              <span style={{ marginLeft:'auto', fontWeight:'600', color:'#374151' }}>{totalH > 0 ? fmt(v.horas/totalH*100) : 0}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Tabla personas sin grupo */}
                    <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                      <h4 style={{ margin:'0 0 4px', fontSize:'13px', fontWeight:'600' }}>⚠️ Personas sin grupo — pendientes de asignar</h4>
                      {sinGrupoConHoras.length === 0 ? (
                        <div style={{ textAlign:'center', padding:'20px', color:'#9ca3af', fontSize:'13px' }}>
                          ✅ Todas las personas tienen grupo asignado
                        </div>
                      ) : (
                        <>
                          <p style={{ fontSize:'11px', color:'#9ca3af', margin:'0 0 10px' }}>
                            Ve a Gestión de Usuarios para asignar grupo a estos especialistas.
                          </p>
                          <table className="tabla" style={{ minWidth:0 }}>
                            <thead><tr><th>Nombre en Excel</th><th>Horas</th><th>Estado</th></tr></thead>
                            <tbody>
                              {sinGrupoConHoras.map(p => (
                                <tr key={p.nombre}>
                                  <td style={{ fontSize:'11.5px' }}>{p.nombre}</td>
                                  <td>{fmt(p.horas)}h</td>
                                  <td>
                                    <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'4px', fontWeight:'600',
                                      background: p.matched ? '#fef3c7' : '#fee2e2',
                                      color: p.matched ? '#92400e' : '#991b1b' }}>
                                      {p.matched ? 'Sin grupo' : 'Sin match'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {tabAnalitca === 'tendencia' && (
                <div>
                  <ChartCard title="Tendencia de horas y costo USD — todas las semanas cargadas" height={240}>
                    <Line data={chartTendencia} options={chartTendOpts} />
                  </ChartCard>
                  <div style={{ ...grid3, marginTop:'16px' }}>
                    <KPI icon="📈" label="Semana pico (horas)"
                      value={`${fmt(Math.max(...todosSem.map(s=>s.base+s.ot+s.sb)))}h`}
                      sub={todosSem.find(s=>s.base+s.ot+s.sb===Math.max(...todosSem.map(x=>x.base+x.ot+x.sb)))?.label||''}
                      color="#2563eb" />
                    <KPI icon="💵" label="Semana pico (costo)"
                      value={fmtK(Math.max(...todosSem.map(s=>s.costo)))}
                      sub={todosSem.find(s=>s.costo===Math.max(...todosSem.map(x=>x.costo)))?.label||''}
                      color="#059669" />
                    <KPI icon="🔢" label="Total semanas cargadas" value={semanas.length} sub={`${semanas[0]?.label||''} → ${semanas[semanas.length-1]?.label||''}`} />
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
};

export default ClaimDashboard;
