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
const MiniBar = ({ label, value, max, color='var(--bank-blue)', right='' }) => (
  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
    <div style={{ fontSize:'11px', fontFamily:"'IBM Plex Mono',monospace", color:'var(--muted)', width:'140px', flexShrink:0, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</div>
    <div style={{ flex:1, background:'var(--paper-200)', borderRadius:'3px', height:'6px', overflow:'hidden' }}>
      <div style={{ width:`${Math.round(value/max*100)}%`, height:'100%', background:color, borderRadius:'3px' }} />
    </div>
    <div style={{ fontSize:'11px', fontFamily:"'IBM Plex Mono',monospace", color:'var(--muted)', width:'52px', flexShrink:0, textAlign:'right' }}>{right}</div>
  </div>
);

const InsightBox = ({ text }) => (
  <div style={{ background:'rgba(0,59,113,0.06)', border:'1px solid rgba(0,59,113,0.14)', borderRadius:'14px', padding:'10px 14px', fontSize:'12px', color:'var(--bank-blue)', marginTop:'12px', display:'flex', gap:'8px', fontWeight:'600' }}>
    <span style={{ flexShrink:0 }}>💡</span><span>{text}</span>
  </div>
);

const ChartCard = ({ title, height=220, children }) => (
  <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'18px 20px' }}>
    <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.09em', marginBottom:'4px' }}>Gráfico</div>
    <h4 style={{ margin:'0 0 14px', fontSize:'1rem', fontWeight:'800', color:'var(--ink-950)', letterSpacing:'-.03em' }}>{title}</h4>
    <div style={{ position:'relative', height:`${height}px`, overflow:'hidden' }}>{children}</div>
  </div>
);

const grid2 = { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:'16px', marginBottom:'16px' };
const grid3 = { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'12px', marginBottom:'16px' };
const gridColor = 'rgba(18,52,78,0.07)';
const textMuted = 'var(--muted)';
const chartBase = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} },
  scales:{ x:{ ticks:{font:{size:9},color:'#647887',maxRotation:45,autoSkip:false}, grid:{display:false} },
            y:{ ticks:{font:{size:9},color:'#647887'}, grid:{color:'rgba(18,52,78,0.07)'}, beginAtZero:true } } };

// ─── componente principal ─────────────────────────────────────────────────
// ─── Sub-componente: Tab Por Grupo ───────────────────────────────────────────
const GrupoTab = ({ grupoOrdenado, gruposPorPersona, filtradas, totalH, gruposFS, todasPersonasExcel, sinGrupo, sinGrupoConHoras, COLORES_GRUPO, COLOR_SIN_GRUPO, fmt, fmtK, KPI }) => {
  const [grupoSel, setGrupoSel] = React.useState(0);
  const [detalleGrupo, setDetalleGrupo] = React.useState(null);

  // Ordenar por costo descendente
  const gruposPorCosto = [...grupoOrdenado].sort((a, b) => b[1].costo - a[1].costo);
  const maxCosto = gruposPorCosto[0]?.[1].costo || 1;

  // Datos del grupo seleccionado para el chart dual
  const grupoActual = gruposPorCosto[grupoSel];
  const colorActual = grupoActual ? (grupoActual[0] === 'Sin grupo asignado' ? COLOR_SIN_GRUPO : COLORES_GRUPO[grupoSel % COLORES_GRUPO.length]) : '#2a78d6';

  const semanasLabels = filtradas.map(s => s.label);

  const horasPorSemana = filtradas.map(s =>
    Object.entries(s.personas || {}).reduce((sum, [emp, datos]) =>
      gruposPorPersona[emp]?.grupoNombre === grupoActual?.[0] ? sum + (datos.horas || 0) : sum, 0)
  );
  const costoPorSemana = filtradas.map(s =>
    Object.entries(s.personas || {}).reduce((sum, [emp, datos]) =>
      gruposPorPersona[emp]?.grupoNombre === grupoActual?.[0] ? sum + (datos.costo || 0) : sum, 0)
  );

  // Personas del grupo para el panel detalle
  const personasDelGrupo = (nombreGrupo) => {
    const personas = {};
    filtradas.forEach(s => {
      Object.entries(s.personas || {}).forEach(([emp, datos]) => {
        if (gruposPorPersona[emp]?.grupoNombre === nombreGrupo) {
          if (!personas[emp]) personas[emp] = { horas: 0, costo: 0 };
          personas[emp].horas += datos.horas || 0;
          personas[emp].costo += datos.costo || 0;
        }
      });
    });
    return Object.entries(personas).sort((a, b) => b[1].costo - a[1].costo);
  };

  const chartRef = React.useRef(null);
  const chartInstance = React.useRef(null);

  React.useEffect(() => {
    if (!chartRef.current || semanasLabels.length === 0) return;
    if (chartInstance.current) chartInstance.current.destroy();
    chartInstance.current = new ChartJS(chartRef.current, {
      type: 'bar',
      data: {
        labels: semanasLabels,
        datasets: [
          {
            label: 'Horas', type: 'bar', data: horasPorSemana,
            backgroundColor: colorActual + 'AA', borderColor: colorActual, borderWidth: 1, yAxisID: 'y'
          },
          {
            label: 'Costo USD', type: 'line', data: costoPorSemana,
            borderColor: '#e24b4a', backgroundColor: 'transparent',
            borderWidth: 2.5, tension: 0.3, fill: false,
            pointRadius: 5, pointBackgroundColor: '#e24b4a', pointBorderColor: '#fff', pointBorderWidth: 2,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { ticks: { font: { size: 9 }, color: '#888', maxRotation: 45, autoSkip: false }, grid: { display: false } },
          y: { position: 'left', beginAtZero: true, ticks: { font: { size: 9 }, color: '#888', callback: v => v + 'h' }, grid: { color: 'rgba(128,128,128,0.12)' } },
          y2: { position: 'right', beginAtZero: true, ticks: { font: { size: 9 }, color: '#e24b4a', callback: v => '$' + Math.round(v / 1000) + 'K' }, grid: { display: false } }
        }
      }
    });
    return () => { if (chartInstance.current) chartInstance.current.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoSel, filtradas.length]);

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <KPI icon="🏢" label="Grupos con datos" value={grupoOrdenado.filter(([k]) => k !== 'Sin grupo asignado').length} sub={`de ${gruposFS.length} configurados`} color="#2563eb" />
        <KPI icon="⚠️" label="Personas sin grupo" value={sinGrupo.length} sub="en Excel sin asignar" color="#d97706" />
        <KPI icon="✓" label="Personas cruzadas" value={[...todasPersonasExcel].length - sinGrupo.length} sub="match exitoso" color="#059669" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '16px' }}>

        {/* Barras por costo + clic detalle */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px 18px' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: '600' }}>Grupos — ordenados por costo</h4>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 12px' }}>Haz clic en una barra para ver detalle de personas</p>
          {gruposPorCosto.map(([nombre, v], i) => {
            const color = nombre === 'Sin grupo asignado' ? COLOR_SIN_GRUPO : COLORES_GRUPO[i % COLORES_GRUPO.length];
            return (
              <div key={nombre}
                onClick={() => setDetalleGrupo(detalleGrupo === nombre ? null : nombre)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '5px 6px', borderRadius: '8px', cursor: 'pointer',
                  background: detalleGrupo === nombre ? '#eff6ff' : 'transparent', transition: 'background .1s' }}
                onMouseOver={e => { if (detalleGrupo !== nombre) e.currentTarget.style.background = 'var(--paper-100)'; }}
                onMouseOut={e => { if (detalleGrupo !== nombre) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ fontSize: '11px', color: 'var(--muted)', width: '130px', flexShrink: 0, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</div>
                <div style={{ flex: 1, background: 'var(--line)', borderRadius: '3px', height: '10px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(v.costo / maxCosto * 100)}%`, height: '100%', background: color, borderRadius: '3px' }} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', width: '52px', flexShrink: 0, textAlign: 'right' }}>{fmtK(v.costo)}</div>
                <span style={{ fontSize: '12px', color: detalleGrupo === nombre ? '#2563eb' : 'var(--muted)' }}>
                  {detalleGrupo === nombre ? '▲' : '▼'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Gráfico dual — barras horas + línea costo */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px 18px' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: '600' }}>Tendencia semanal — horas y costo</h4>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {gruposPorCosto.slice(0, 6).map(([nombre], i) => {
              const color = nombre === 'Sin grupo asignado' ? COLOR_SIN_GRUPO : COLORES_GRUPO[i % COLORES_GRUPO.length];
              return (
                <button key={nombre} onClick={() => setGrupoSel(i)}
                  style={{ fontSize: '10px', padding: '3px 9px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                    background: grupoSel === i ? color : '#f3f4f6',
                    color: grupoSel === i ? '#fff' : 'var(--muted)',
                    fontWeight: grupoSel === i ? '700' : '400' }}>
                  {nombre.length > 14 ? nombre.slice(0, 14) + '…' : nombre}
                </button>
              );
            })}
          </div>
          <div style={{ position: 'relative', height: '200px' }}>
            <canvas ref={chartRef} />
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--muted)' }}>
              <span style={{ width: '12px', height: '10px', background: colorActual + 'AA', display: 'inline-block', borderRadius: '2px' }}></span>Horas (eje izq.)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--muted)' }}>
              <span style={{ width: '16px', height: '2px', background: '#e24b4a', display: 'inline-block', borderRadius: '1px' }}></span>Costo USD (eje der.)
            </span>
          </div>
        </div>
      </div>

      {/* Panel detalle de personas — aparece al hacer clic */}
      {detalleGrupo && (() => {
        const idx = gruposPorCosto.findIndex(([k]) => k === detalleGrupo);
        const color = detalleGrupo === 'Sin grupo asignado' ? COLOR_SIN_GRUPO : COLORES_GRUPO[idx % COLORES_GRUPO.length];
        const personas = personasDelGrupo(detalleGrupo);
        const totalGH = personas.reduce((s, [, v]) => s + v.horas, 0);
        const totalGC = personas.reduce((s, [, v]) => s + v.costo, 0);
        return (
          <div style={{ background: '#fff', border: `2px solid ${color}`, borderRadius: '10px', padding: '16px 18px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color }}>{detalleGrupo}</h4>
                <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
                  {personas.length} personas · {fmt(totalGH)}h · {fmtK(totalGC)} · Rate prom: ${totalGH > 0 ? fmt(totalGC / totalGH) : '—'}/h
                </p>
              </div>
              <button onClick={() => setDetalleGrupo(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted)', padding: '4px' }}>✕</button>
            </div>
            <table className="tabla" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th style={{ textAlign: 'right' }}>Horas</th>
                  <th style={{ textAlign: 'right' }}>Costo</th>
                  <th style={{ textAlign: 'right' }}>Rate/h</th>
                  <th style={{ textAlign: 'center' }}>% grupo</th>
                </tr>
              </thead>
              <tbody>
                {personas.map(([nombre, v]) => (
                  <tr key={nombre}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: color + '22', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>
                          {nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                        </div>
                        <span style={{ fontSize: '12px' }}>{nombre}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '600' }}>{fmt(v.horas)}h</td>
                    <td style={{ textAlign: 'right', fontWeight: '600' }}>{fmtK(v.costo)}</td>
                    <td style={{ textAlign: 'right', color: '#d97706', fontWeight: '600' }}>
                      {v.horas > 0 ? '$' + fmt(v.costo / v.horas) : '—'}/h
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                        <div style={{ width: '50px', height: '5px', background: 'var(--line)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${totalGH > 0 ? Math.round(v.horas / totalGH * 100) : 0}%`, height: '100%', background: color, borderRadius: '2px' }} />
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{totalGH > 0 ? Math.round(v.horas / totalGH * 100) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Personas sin match */}
      {sinGrupoConHoras.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px 18px' }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: '600' }}>⚠️ Personas sin grupo — pendientes de asignar</h4>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 10px' }}>Ve a Gestión de Usuarios para asignar grupo a estos especialistas.</p>
          <table className="tabla" style={{ minWidth: 0 }}>
            <thead><tr><th>Nombre en Excel</th><th>Horas</th><th>Estado</th></tr></thead>
            <tbody>
              {sinGrupoConHoras.map(p => (
                <tr key={p.nombre}>
                  <td style={{ fontSize: '11.5px' }}>{p.nombre}</td>
                  <td>{fmt(p.horas)}h</td>
                  <td>
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', fontWeight: '600',
                      background: p.matched ? '#fef3c7' : '#fee2e2',
                      color: p.matched ? '#92400e' : '#991b1b' }}>
                      {p.matched ? 'Sin grupo' : 'Sin match'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

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

  // Cargar usuarios y grupos para cruce por grupo (filtrado por cliente activo,
  // si no, "grupos configurados" y el cruce de personas mezclan datos de otros clientes)
  useEffect(() => {
    if (!token) return;
    const h = { Authorization: `Bearer ${token}` };
    if (clienteActivo) h['x-cliente-activo'] = clienteActivo;
    Promise.all([
      axios.get(`${apiUrl}/api/admin/listar-usuarios`, { headers: h }),
      axios.get(`${apiUrl}/api/grupos-servicio`, { headers: h, params: clienteActivo ? { clienteId: clienteActivo } : {} })
    ]).then(([resU, resG]) => {
      setUsuariosFS(resU.data.usuarios || []);
      setGruposFS(resG.data || []);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, apiUrl, clienteActivo]);


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
        const manager = String(fila[h['FUNC_MGR_EMAIL']] || '').trim().toLowerCase();

        if (!porSemana[key]) {
          porSemana[key] = {
            fecha: key,
            label: fecha.toLocaleDateString('es-CL', { day:'2-digit', month:'short' }),
            mes: fecha.getMonth() + 1,
            anio: fecha.getFullYear(),
            base:0, ot:0, sb:0, costo:0,
            personas:{}, wbs:{}, offering:{}, nivel:{}, jobRoles:{}, managers:{}
          };
        }
        const s = porSemana[key];
        const esOT = ot.includes('Over Time');
        const esSB = ot.includes('Stand');
        if (esOT) s.ot += horas;
        else if (esSB) s.sb += horas;
        else s.base += horas;
        s.costo += costo;
        if (persona) {
          if (!s.personas[persona]) s.personas[persona] = { horas:0, costo:0, horasOT:0, horasSB:0 };
          s.personas[persona].horas += horas;
          s.personas[persona].costo += costo;
          if (esOT) s.personas[persona].horasOT += horas;
          if (esSB) s.personas[persona].horasSB += horas;
        }
        if (wbs) { if (!s.wbs[wbs]) s.wbs[wbs] = { horas:0, costo:0 }; s.wbs[wbs].horas += horas; s.wbs[wbs].costo += costo; }
        if (offering) { if (!s.offering[offering]) s.offering[offering] = { horas:0, costo:0 }; s.offering[offering].horas += horas; s.offering[offering].costo += costo; }
        if (nivel) { if (!s.nivel[nivel]) s.nivel[nivel] = { horas:0, costo:0 }; s.nivel[nivel].horas += horas; s.nivel[nivel].costo += costo; }
        if (jobRole) { if (!s.jobRoles[jobRole]) s.jobRoles[jobRole] = 0; s.jobRoles[jobRole] += horas; }
        if (manager) { if (!s.managers[manager]) s.managers[manager] = { horas:0, costo:0 }; s.managers[manager].horas += horas; s.managers[manager].costo += costo; }
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
    if (!window.confirm(`¿Eliminar los datos de Claims del cliente activo (${clienteActivo || 'sin cliente seleccionado'})? No se puede deshacer. Los demás clientes no se ven afectados.`)) return;
    try {
      const res = await axios.delete(`${apiUrl}/api/claims`, { headers: getHeaders() });
      await cargarDatos();
      alert(`✅ ${res.data.message}`);
    } catch (err) { alert('Error: ' + (err.response?.data?.error || err.message)); }
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
    // Usar el grupo asignado para EL CLIENTE ACTIVO (un usuario puede tener
    // grupos distintos en cada cliente). Si el usuario aún no tiene el mapa
    // gruposPorCliente (dato legacy), se cae al grupoServicioId viejo.
    const grupoId = userMatch?.gruposPorCliente?.[clienteActivo] || userMatch?.grupoServicioId || '';
    if (userMatch && grupoId) {
      gruposPorPersona[empName] = {
        grupoId,
        grupoNombre: mapaGrupos[grupoId] || grupoId,
        matched: true
      };
    } else {
      gruposPorPersona[empName] = { grupoId: '__sin_grupo__', grupoNombre: 'Sin grupo asignado', matched: !!userMatch };
    }
  });

  // Acumular horas/costo por grupo (total, y separado por OT/SB para los
  // gráficos de "OVT por grupo" y "Standby por grupo")
  const grupoTotal = {};
  filtradas.forEach(s => {
    Object.entries(s.personas||{}).forEach(([empName, datos]) => {
      const { grupoNombre } = gruposPorPersona[empName] || { grupoNombre: 'Sin grupo asignado' };
      if (!grupoTotal[grupoNombre]) grupoTotal[grupoNombre] = { horas:0, costo:0, horasOT:0, horasSB:0, personas:new Set() };
      grupoTotal[grupoNombre].horas += datos.horas || 0;
      grupoTotal[grupoNombre].costo += datos.costo || 0;
      grupoTotal[grupoNombre].horasOT += datos.horasOT || 0;
      grupoTotal[grupoNombre].horasSB += datos.horasSB || 0;
      grupoTotal[grupoNombre].personas.add(empName);
    });
  });
  const grupoOrdenado = Object.entries(grupoTotal).sort((a,b) => b[1].horas - a[1].horas);
  // Rankings para los gráficos de "OVT por grupo" y "Standby por grupo" —
  // solo grupos con horas > 0 en esa categoría específica
  const grupoOTOrdenado = Object.entries(grupoTotal).filter(([,v]) => v.horasOT > 0).sort((a,b) => b[1].horasOT - a[1].horasOT);
  const grupoSBOrdenado = Object.entries(grupoTotal).filter(([,v]) => v.horasSB > 0).sort((a,b) => b[1].horasSB - a[1].horasSB);
  const totalOTGrupos = grupoOTOrdenado.reduce((sum,[,v]) => sum + v.horasOT, 0);
  const totalSBGrupos = grupoSBOrdenado.reduce((sum,[,v]) => sum + v.horasSB, 0);
  // Personas sin match o sin grupo
  const sinGrupo = [...todasPersonasExcel].filter(p => gruposPorPersona[p]?.grupoId === '__sin_grupo__');
  const sinGrupoConHoras = sinGrupo.map(p => {
    const h = filtradas.reduce((sum,s) => sum + ((s.personas||{})[p]?.horas||0), 0);
    const c = filtradas.reduce((sum,s) => sum + ((s.personas||{})[p]?.costo||0), 0);
    return { nombre:p, horas:h, costo:c, matched: gruposPorPersona[p]?.matched };
  }).sort((a,b) => b.horas - a.horas);

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

  // Agregación Manager (FUNC_MGR_EMAIL) — se muestra el nombre formateado a
  // partir del prefijo del correo, ej. "sergio.zuniga@kyndryl.com" → "Sergio Zuniga"
  const formatManager = (email) => {
    const prefijo = String(email||'').split('@')[0];
    return prefijo.split(/[._]/).filter(Boolean).map(p => p.charAt(0).toUpperCase()+p.slice(1)).join(' ') || 'Sin manager';
  };
  const mgrTotal = {};
  filtradas.forEach(s => Object.entries(s.managers||{}).forEach(([k,v]) => {
    if (!mgrTotal[k]) mgrTotal[k] = { horas:0, costo:0 };
    mgrTotal[k].horas += v.horas; mgrTotal[k].costo += v.costo;
  }));
  const mgrOrdenado = Object.entries(mgrTotal).sort((a,b) => b[1].horas - a[1].horas);

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
  const chartDonutMgr = {
    labels: mgrOrdenado.map(([k]) => formatManager(k)),
    datasets:[{ data:mgrOrdenado.map(([,v])=>v.horas), backgroundColor:COLORES_OFF, borderWidth:0 }]
  };
  const chartDonutOTGrupo = {
    labels: grupoOTOrdenado.slice(0,6).map(([k]) => k.substring(0,30)),
    datasets:[{ data:grupoOTOrdenado.slice(0,6).map(([,v])=>v.horasOT), backgroundColor:COLORES_GRUPO, borderWidth:0 }]
  };
  const chartDonutSBGrupo = {
    labels: grupoSBOrdenado.slice(0,6).map(([k]) => k.substring(0,30)),
    datasets:[{ data:grupoSBOrdenado.slice(0,6).map(([,v])=>v.horasSB), backgroundColor:COLORES_GRUPO, borderWidth:0 }]
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
  const KPI = ({ icon, label, value, sub, color='var(--ink-950)' }) => (
    <div style={{ background:'var(--glass)', border:'1px solid rgba(255,255,255,0.72)', borderRadius:'24px', padding:'16px', backdropFilter:'blur(18px)', boxShadow:'var(--shadow-soft)' }}>
      <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:'8px' }}>{label}</div>
      <div style={{ fontSize:'1.8rem', fontWeight:'800', color, lineHeight:1, letterSpacing:'-.07em', marginBottom:'4px' }}>{value}</div>
      {sub && <div style={{ fontSize:'11px', fontWeight:'600', color:'var(--muted)' }}>{sub}</div>}
    </div>
  );

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div>
      {/* UPLOAD */}
      <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'18px 22px', marginBottom:'18px', display:'flex', alignItems:'center', gap:'16px', cursor:'pointer' }}
        onClick={() => fileRef.current?.click()}>
        <div style={{ width:'42px', height:'42px', borderRadius:'14px', background:'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <span style={{ fontSize:'18px' }}>📊</span>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:'800', fontSize:'13px', color:'var(--ink-950)', marginBottom:'2px', letterSpacing:'-.01em' }}>
            {cargando ? 'Procesando archivo...' : 'Cargar Export.xlsx semanal'}
          </div>
          <div style={{ fontSize:'12px', fontWeight:'600', color:'var(--muted)' }}>
            Acumulativo · hoja "Export" requerida · las semanas nuevas se guardan en Firestore
          </div>
        </div>
        {ultimaCarga && (
          <div style={{ fontSize:'11px', fontFamily:"'IBM Plex Mono',monospace", color:'var(--muted)', textAlign:'right', flexShrink:0 }}>
            Última carga: {ultimaCarga}<br/>
            <button onClick={e=>{e.stopPropagation();limpiarDatos();}}
              style={{ fontSize:'10px', color:'var(--danger)', background:'none', border:'none', cursor:'pointer', padding:0, marginTop:'4px', fontWeight:'700' }}>
              Limpiar datos
            </button>
          </div>
        )}
        <button disabled={cargando} onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
          style={{ padding:'10px 18px', background: cargando ? 'var(--muted)' : 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color:'#fff', border:'none', borderRadius:'999px', fontWeight:'900', fontSize:'12px', cursor: cargando ? 'not-allowed':'pointer', whiteSpace:'nowrap', boxShadow:'0 12px 28px rgba(0,59,113,0.24)', flexShrink:0 }}>
          {cargando ? 'Cargando...' : 'Seleccionar archivo'}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }}
          onChange={(e) => { if (e.target.files[0]) procesarExcel(e.target.files[0]); e.target.value=''; }} />
      </div>

      {loadingDatos ? (
        <p style={{ textAlign:'center', color:'var(--muted)', padding:'40px', fontWeight:'600' }}>Cargando datos de Firestore...</p>
      ) : semanas.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--muted)' }}>
          <div style={{ fontSize:'48px', marginBottom:'14px' }}>📂</div>
          <p style={{ fontWeight:'800', color:'var(--ink-800)', letterSpacing:'-.02em' }}>Sin datos cargados</p>
          <p style={{ fontSize:'13px', fontWeight:'600' }}>Sube el archivo Export.xlsx para comenzar</p>
        </div>
      ) : (
        <>
          {/* FILTROS */}
          <div style={{ display:'flex', gap:'12px', alignItems:'flex-end', flexWrap:'wrap', marginBottom:'18px' }}>
            <div>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:'6px' }}>Mes</div>
              <select value={filtroMes} onChange={e => setFiltroMes(parseInt(e.target.value))}
                style={{ border:'1px solid var(--line)', borderRadius:'12px', padding:'9px 14px', background:'rgba(255,255,255,0.84)', color:'var(--ink-950)', fontSize:'13px', fontWeight:'600', minWidth:'130px' }}>
                {MESES.slice(1).map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:'6px' }}>Año</div>
              <select value={filtroAnio} onChange={e => setFiltroAnio(parseInt(e.target.value))}
                style={{ border:'1px solid var(--line)', borderRadius:'12px', padding:'9px 14px', background:'rgba(255,255,255,0.84)', color:'var(--ink-950)', fontSize:'13px', fontWeight:'600', minWidth:'100px' }}>
                {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {filtradas.length > 0 && (
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'11px', fontWeight:'700', color:'var(--muted)', alignSelf:'center', paddingLeft:'12px', borderLeft:'1px solid var(--line)' }}>
                {filtradas.length} semanas · {MESES[filtroMes]} {filtroAnio}
              </div>
            )}
          </div>

          {/* KPIs globales del período */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'14px', marginBottom:'20px' }}>
            <KPI label="Horas imputadas" value={fmt(totalH)+'h'} sub={`OT: ${fmt(totalOT)}h · SB: ${fmt(totalSB)}h`} color="var(--bank-blue)" />
            <KPI label="Costo total USD" value={fmtK(totalCosto)} sub={`Prom: ${fmtK(filtradas.length ? totalCosto/filtradas.length : 0)}/sem`} color="var(--success)" />
            <KPI label="Semanas con OT/SB" value={semsConOT} sub={`de ${filtradas.length} semanas`} color="var(--warning)" />
            <KPI label="Promedio semanal" value={fmt(promSem)+'h'} sub="horas imputadas/sem" />
            <KPI label="Rate promedio equipo" value={'$' + (totalH > 0 ? fmt(totalCosto/totalH) : '—') + '/h'} sub="costo por hora imputada" color="var(--kyn-red)" />
          </div>

          {/* TABS DE ANALÍTICA */}
          <div style={{ display:'inline-flex', flexWrap:'wrap', gap:'6px', padding:'5px', border:'1px solid rgba(18,52,78,0.09)', borderRadius:'16px', background:'rgba(255,255,255,0.55)', marginBottom:'20px', overflowX:'auto' }}>
            {TABS_ANALITICA.map(t => (
              <button key={t.id} onClick={() => setTabAnalitica(t.id)}
                style={{ borderRadius:'11px', padding:'8px 14px', background: tabAnalitca===t.id ? 'var(--ink-900)' : 'transparent',
                  color: tabAnalitca===t.id ? '#fff' : 'var(--muted)', fontWeight:'900', fontSize:'12px', border:'none', transition:'all .16s', cursor:'pointer', whiteSpace:'nowrap' }}>
                {t.label}
              </button>
            ))}
          </div>

          {filtradas.length === 0 ? (
            <p style={{ textAlign:'center', padding:'40px', color:'var(--muted)' }}>Sin datos para {MESES[filtroMes]} {filtroAnio}</p>
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
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:'16px', marginBottom:'16px' }}>
                    <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'20px' }}>
                      <h4 style={{ margin:'0 0 12px', fontSize:'13px', color:'var(--ink-800)', fontWeight:'600' }}>Distribución por Manager</h4>
                      <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                        <div style={{ position:'relative', width:'110px', height:'110px', flexShrink:0 }}>
                          <Doughnut data={chartDonutMgr} options={donutOpts} />
                        </div>
                        <div>
                          {mgrOrdenado.map(([k,v],i) => (
                            <div key={k} style={{ display:'flex', alignItems:'center', gap:'7px', fontSize:'11px', color:'var(--muted)', marginBottom:'6px' }}>
                              <div style={{ width:'10px', height:'10px', borderRadius:'2px', background:COLORES_OFF[i%COLORES_OFF.length]||'#888', flexShrink:0 }}></div>
                              <div><div style={{ fontWeight:'600', color:'var(--ink-800)' }}>{formatManager(k)}</div>
                              <div>{fmt(v.horas)}h · {fmtK(v.costo)} · {totalH>0?fmt(v.horas/totalH*100):'0'}%</div></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'20px' }}>
                      <h4 style={{ margin:'0 0 12px', fontSize:'13px', color:'var(--ink-800)', fontWeight:'600' }}>OVT por Grupo de Servicio</h4>
                      {grupoOTOrdenado.length === 0 ? (
                        <p style={{ fontSize:'12px', color:'var(--muted)', fontWeight:'600' }}>Sin horas de overtime en este período</p>
                      ) : (
                        <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                          <div style={{ position:'relative', width:'110px', height:'110px', flexShrink:0 }}>
                            <Doughnut data={chartDonutOTGrupo} options={donutOpts} />
                          </div>
                          <div>
                            {grupoOTOrdenado.slice(0,6).map(([k,v],i) => (
                              <div key={k} style={{ display:'flex', alignItems:'center', gap:'7px', fontSize:'11px', color:'var(--muted)', marginBottom:'6px' }}>
                                <div style={{ width:'10px', height:'10px', borderRadius:'2px', background:COLORES_GRUPO[i%COLORES_GRUPO.length], flexShrink:0 }}></div>
                                <div><div style={{ fontWeight:'600', color:'var(--ink-800)' }}>{k.substring(0,30)}</div>
                                <div>{fmt(v.horasOT)}h · {totalOTGrupos>0?fmt(v.horasOT/totalOTGrupos*100):'0'}%</div></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'20px' }}>
                      <h4 style={{ margin:'0 0 12px', fontSize:'13px', color:'var(--ink-800)', fontWeight:'600' }}>Standby por Grupo de Servicio</h4>
                      {grupoSBOrdenado.length === 0 ? (
                        <p style={{ fontSize:'12px', color:'var(--muted)', fontWeight:'600' }}>Sin horas de standby en este período</p>
                      ) : (
                        <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
                          <div style={{ position:'relative', width:'110px', height:'110px', flexShrink:0 }}>
                            <Doughnut data={chartDonutSBGrupo} options={donutOpts} />
                          </div>
                          <div>
                            {grupoSBOrdenado.slice(0,6).map(([k,v],i) => (
                              <div key={k} style={{ display:'flex', alignItems:'center', gap:'7px', fontSize:'11px', color:'var(--muted)', marginBottom:'6px' }}>
                                <div style={{ width:'10px', height:'10px', borderRadius:'2px', background:COLORES_GRUPO[i%COLORES_GRUPO.length], flexShrink:0 }}></div>
                                <div><div style={{ fontWeight:'600', color:'var(--ink-800)' }}>{k.substring(0,30)}</div>
                                <div>{fmt(v.horasSB)}h · {totalSBGrupos>0?fmt(v.horasSB/totalSBGrupos*100):'0'}%</div></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── TAB WBS ── */}
              {tabAnalitca === 'wbs' && (
                <div>
                  <div style={{ background:'rgba(255,255,255,0.84)', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px', marginBottom:'16px' }}>
                    <h4 style={{ margin:'0 0 14px', fontSize:'13px', color:'var(--ink-800)', fontWeight:'600' }}>Horas por WBS</h4>
                    {wbsOrdenado.map(([k,v]) => <MiniBar key={k} label={k.substring(0,25)} value={v.horas} max={wbsOrdenado[0][1].horas} right={fmt(v.horas)+'h'} />)}
                  </div>
                  <div style={{ background:'rgba(255,255,255,0.84)', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                    <h4 style={{ margin:'0 0 12px', fontSize:'13px', color:'var(--ink-800)', fontWeight:'600' }}>Detalle WBS — horas, costo y rate/h</h4>
                    <table className="tabla" style={{ minWidth:0 }}>
                      <thead><tr><th>WBS</th><th>Horas</th><th>Costo USD</th><th>Rate/h</th></tr></thead>
                      <tbody>
                        {wbsOrdenado.map(([k,v]) => (
                          <tr key={k}>
                            <td style={{ fontSize:'12px' }}>{k}</td>
                            <td>{fmt(v.horas)}h</td>
                            <td>{fmtK(v.costo)}</td>
                            <td style={{ color:'var(--warning)', fontWeight:'600' }}>${v.horas>0?fmt(v.costo/v.horas):0}/h</td>
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
                  <div style={{ background:'rgba(255,255,255,0.84)', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                    <h4 style={{ margin:'0 0 14px', fontSize:'13px', color:'var(--ink-800)', fontWeight:'600' }}>Top 10 · horas imputadas</h4>
                    {perOrdenado.map(([k,v]) => <MiniBar key={k} label={k} value={v.horas} max={maxPerH} right={fmt(v.horas)+'h'} />)}
                  </div>
                  <div style={{ background:'rgba(255,255,255,0.84)', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                    <h4 style={{ margin:'0 0 12px', fontSize:'13px', color:'var(--ink-800)', fontWeight:'600' }}>Rate USD/h por persona</h4>
                    <table className="tabla" style={{ minWidth:0 }}>
                      <thead><tr><th>Persona</th><th>Horas</th><th>Rate/h</th><th>Total USD</th></tr></thead>
                      <tbody>
                        {[...perOrdenado].sort((a,b) => (b[1].costo/b[1].horas)-(a[1].costo/a[1].horas)).map(([k,v]) => (
                          <tr key={k}>
                            <td style={{ fontSize:'11px' }}>{k}</td>
                            <td>{fmt(v.horas)}h</td>
                            <td style={{ color:'var(--warning)', fontWeight:'600' }}>${v.horas>0?fmt(v.costo/v.horas):0}/h</td>
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
                    <div style={{ background:'rgba(255,255,255,0.84)', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                      <h4 style={{ margin:'0 0 14px', fontSize:'13px', color:'var(--ink-800)', fontWeight:'600' }}>Horas por nivel de seniority</h4>
                      {nivOrdenado.map(([k,v]) => <MiniBar key={k} label={k} value={v.horas} max={maxNivH} right={fmt(v.horas)+'h'} />)}
                    </div>
                    <div style={{ background:'rgba(255,255,255,0.84)', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                      <h4 style={{ margin:'0 0 14px', fontSize:'13px', color:'var(--ink-800)', fontWeight:'600' }}>Costo USD por nivel</h4>
                      {[...nivOrdenado].sort((a,b) => b[1].costo-a[1].costo).map(([k,v]) => (
                        <MiniBar key={k} label={k} value={v.costo} max={nivOrdenado.reduce((m,[,x])=>Math.max(m,x.costo),1)} color="#1baf7a" right={fmtK(v.costo)} />
                      ))}
                    </div>
                  </div>
                  <div style={{ background:'rgba(255,255,255,0.84)', border:'1px solid #e5e7eb', borderRadius:'10px', padding:'16px 18px' }}>
                    <h4 style={{ margin:'0 0 12px', fontSize:'13px', color:'var(--ink-800)', fontWeight:'600' }}>Tabla comparativa por nivel</h4>
                    <table className="tabla" style={{ minWidth:0 }}>
                      <thead><tr><th>Nivel</th><th>Horas</th><th>Costo USD</th><th>Rate prom/h</th></tr></thead>
                      <tbody>
                        {nivOrdenado.map(([k,v]) => (
                          <tr key={k}>
                            <td style={{ fontWeight:'600' }}>{k}</td>
                            <td>{fmt(v.horas)}h</td>
                            <td>{fmtK(v.costo)}</td>
                            <td style={{ color:'var(--warning)', fontWeight:'600' }}>${v.horas>0?fmt(v.costo/v.horas):0}/h</td>
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
                <GrupoTab
                  grupoOrdenado={grupoOrdenado}
                  gruposPorPersona={gruposPorPersona}
                  filtradas={filtradas}
                  totalH={totalH}
                  gruposFS={gruposFS}
                  todasPersonasExcel={todasPersonasExcel}
                  sinGrupo={sinGrupo}
                  sinGrupoConHoras={sinGrupoConHoras}
                  COLORES_GRUPO={COLORES_GRUPO}
                  COLOR_SIN_GRUPO={COLOR_SIN_GRUPO}
                  fmt={fmt}
                  fmtK={fmtK}
                  KPI={KPI}
                />
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
    </div>
  );
};

export default ClaimDashboard;
