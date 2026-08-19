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
  { id:'tendencia', label:'📈 Tendencia' },
  { id:'iniciativas', label:'📋 Iniciativas' }
];

const ESTADOS_INICIATIVA = {
  no_iniciada: { label: 'No iniciada', bg: 'rgba(107,114,128,0.12)', fg: '#4b5563' },
  en_curso: { label: 'En curso', bg: 'rgba(37,99,235,0.12)', fg: '#1d4ed8' },
  en_riesgo: { label: 'En riesgo', bg: 'rgba(217,119,6,0.14)', fg: '#8a5a06' },
  bloqueada: { label: 'Bloqueada', bg: 'rgba(215,59,71,0.12)', fg: '#a61e2b' },
  completada: { label: 'Completada', bg: 'rgba(32,166,106,0.14)', fg: '#116642' }
};
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
    <div title={label} style={{ fontSize:'11px', fontFamily:"'IBM Plex Mono',monospace", color:'var(--muted)', width:'170px', flexShrink:0, textAlign:'right', whiteSpace:'normal', lineHeight:1.3, wordBreak:'break-word' }}>{label}</div>
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
  const [detalleGrupo, setDetalleGrupo] = React.useState(null);
  const [gruposActivos, setGruposActivos] = React.useState(null); // se inicializa con el top al calcular gruposPorCosto
  const [puntoDetalle, setPuntoDetalle] = React.useState(null); // { grupoNombre, semanaLabel, semanaIdx }
  const [metrica, setMetrica] = React.useState('horas'); // 'horas' | 'costo' — qué muestra el gráfico de tendencia

  // Ordenar por costo descendente
  const gruposPorCosto = [...grupoOrdenado].sort((a, b) => b[1].costo - a[1].costo);
  const maxCosto = gruposPorCosto[0]?.[1].costo || 1;
  const top10Grupos = gruposPorCosto.slice(0, 10);

  // Por defecto, solo el grupo top queda activo en el gráfico de tendencia
  React.useEffect(() => {
    if (gruposActivos === null && top10Grupos.length > 0) {
      setGruposActivos(new Set([top10Grupos[0][0]]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top10Grupos.length]);

  const toggleGrupoActivo = (nombre) => {
    setGruposActivos(prev => {
      const next = new Set(prev);
      if (next.has(nombre)) next.delete(nombre); else next.add(nombre);
      return next;
    });
    setPuntoDetalle(null);
  };

  const semanasLabels = filtradas.map(s => s.label);

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

  // Personas de un grupo en UNA semana específica (para el clic en el punto del gráfico)
  const personasDelGrupoEnSemana = (nombreGrupo, semanaIdx) => {
    const s = filtradas[semanaIdx];
    if (!s) return [];
    const personas = [];
    Object.entries(s.personas || {}).forEach(([emp, datos]) => {
      if (gruposPorPersona[emp]?.grupoNombre === nombreGrupo) {
        personas.push([emp, datos]);
      }
    });
    return personas.sort((a, b) => b[1].horas - a[1].horas);
  };

  const chartRef = React.useRef(null);
  const chartInstance = React.useRef(null);

  React.useEffect(() => {
    if (!chartRef.current || semanasLabels.length === 0 || !gruposActivos) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const campo = metrica === 'costo' ? 'costo' : 'horas';
    const datasets = top10Grupos
      .filter(([nombre]) => gruposActivos.has(nombre))
      .map(([nombre], _i) => {
        const idxColor = top10Grupos.findIndex(([n]) => n === nombre);
        const color = nombre === 'Sin grupo asignado' ? COLOR_SIN_GRUPO : COLORES_GRUPO[idxColor % COLORES_GRUPO.length];
        const valorPorSemana = filtradas.map(s =>
          Object.entries(s.personas || {}).reduce((sum, [emp, datos]) =>
            gruposPorPersona[emp]?.grupoNombre === nombre ? sum + (datos[campo] || 0) : sum, 0)
        );
        return {
          label: nombre, data: valorPorSemana,
          borderColor: color, backgroundColor: color,
          borderWidth: 2, tension: 0.3, fill: false,
          pointRadius: 5, pointHoverRadius: 7, pointBackgroundColor: color, pointBorderColor: '#fff', pointBorderWidth: 2
        };
      });

    chartInstance.current = new ChartJS(chartRef.current, {
      type: 'line',
      data: { labels: semanasLabels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const el = elements[0];
          const dataset = datasets[el.datasetIndex];
          setPuntoDetalle({ grupoNombre: dataset.label, semanaLabel: semanasLabels[el.index], semanaIdx: el.index });
        },
        onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length ? 'pointer' : 'default'; },
        plugins: {
          legend: { display: datasets.length > 1, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10, padding: 10 } },
          tooltip: { mode: 'index', intersect: false, callbacks: { label: ctx => `${ctx.dataset.label}: ${metrica === 'costo' ? fmtK(ctx.parsed.y) : fmt(ctx.parsed.y)+'h'}` } }
        },
        scales: {
          x: { ticks: { font: { size: 9 }, color: '#888', maxRotation: 45, autoSkip: false }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { font: { size: 9 }, color: '#888', callback: v => metrica === 'costo' ? '$'+Math.round(v/1000)+'K' : v + 'h' }, grid: { color: 'rgba(128,128,128,0.12)' } }
        }
      }
    });
    return () => { if (chartInstance.current) chartInstance.current.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gruposActivos, filtradas.length, metrica]);

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
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'10px', flexWrap:'wrap' }}>
            <div>
              <h4 style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: '600' }}>Tendencia semanal por grupo</h4>
              <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 10px' }}>Prende/apaga grupos para comparar · haz clic en un punto para ver los especialistas de esa semana</p>
            </div>
            <div style={{ display:'flex', gap:'4px', background:'#f3f4f6', borderRadius:'10px', padding:'3px', flexShrink:0 }}>
              <button onClick={() => setMetrica('horas')}
                style={{ fontSize:'11px', padding:'5px 10px', borderRadius:'8px', border:'none', cursor:'pointer', fontWeight:'700',
                  background: metrica==='horas' ? '#fff' : 'transparent', color: metrica==='horas' ? 'var(--ink-950)' : 'var(--muted)',
                  boxShadow: metrica==='horas' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Horas</button>
              <button onClick={() => setMetrica('costo')}
                style={{ fontSize:'11px', padding:'5px 10px', borderRadius:'8px', border:'none', cursor:'pointer', fontWeight:'700',
                  background: metrica==='costo' ? '#fff' : 'transparent', color: metrica==='costo' ? 'var(--ink-950)' : 'var(--muted)',
                  boxShadow: metrica==='costo' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Costo USD</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {top10Grupos.map(([nombre], i) => {
              const color = nombre === 'Sin grupo asignado' ? COLOR_SIN_GRUPO : COLORES_GRUPO[i % COLORES_GRUPO.length];
              const activo = gruposActivos && gruposActivos.has(nombre);
              return (
                <button key={nombre} onClick={() => toggleGrupoActivo(nombre)}
                  style={{ fontSize: '10px', padding: '4px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', display:'flex', alignItems:'center', gap:'5px',
                    background: activo ? '#fff' : '#f3f4f6', boxShadow: activo ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                    color: activo ? 'var(--ink-950)' : 'var(--muted)', fontWeight: activo ? '700' : '400' }}>
                  <span style={{ width:'8px', height:'8px', borderRadius:'50%', background: activo ? color : '#c3c9ce', display:'inline-block' }}></span>
                  {nombre.length > 14 ? nombre.slice(0, 14) + '…' : nombre}
                </button>
              );
            })}
          </div>
          <div style={{ position: 'relative', height: '200px' }}>
            <canvas ref={chartRef} />
          </div>

          {puntoDetalle && (() => {
            const personas = personasDelGrupoEnSemana(puntoDetalle.grupoNombre, puntoDetalle.semanaIdx);
            const totalSemGrupo = personas.reduce((s, [, v]) => s + (v.horas || 0), 0);
            return (
              <div style={{ marginTop: '14px', background: 'var(--paper-50, #f9fafb)', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--ink-950)' }}>
                    {puntoDetalle.grupoNombre} · semana {puntoDetalle.semanaLabel}
                  </div>
                  <button onClick={() => setPuntoDetalle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px' }}>✕</button>
                </div>
                {personas.length === 0 ? (
                  <p style={{ fontSize: '11px', color: 'var(--muted)', margin: 0 }}>Sin especialistas con horas en este grupo esa semana</p>
                ) : personas.map(([emp, datos]) => (
                  <div key={emp} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '4px 0', borderBottom: '1px solid #eee' }}>
                    <span style={{ fontWeight: '600', color: 'var(--ink-800)' }}>{emp}</span>
                    <span style={{ color: 'var(--muted)' }}>{fmt(datos.horas)}h · {fmtK(datos.costo)}{totalSemGrupo > 0 ? ` · ${fmt(datos.horas / totalSemGrupo * 100)}%` : ''}</span>
                  </div>
                ))}
              </div>
            );
          })()}
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
  const [grupoAnualSel, setGrupoAnualSel] = useState(null); // grupo elegido para el gráfico anual "Tendencia por grupo"
  const [iaLoading, setIaLoading] = useState(false);
  const [iaError, setIaError] = useState(null);
  const [iaInsights, setIaInsights] = useState(null);
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

  // ── Iniciativas e Issues ──
  const [iniciativas, setIniciativas] = useState([]);
  const [cargandoIniciativas, setCargandoIniciativas] = useState(false);
  const [errorIniciativas, setErrorIniciativas] = useState(null);
  const [modalIniciativa, setModalIniciativa] = useState(null); // null = cerrado, {} = nueva, {...} = editando
  const [guardandoIniciativa, setGuardandoIniciativa] = useState(false);

  const cargarIniciativas = useCallback(async () => {
    setCargandoIniciativas(true);
    setErrorIniciativas(null);
    try {
      const res = await axios.get(`${apiUrl}/api/iniciativas`, { headers: getHeaders() });
      setIniciativas(res.data || []);
    } catch (err) {
      setErrorIniciativas('Error cargando iniciativas: ' + (err.response?.data?.error || err.message));
    } finally {
      setCargandoIniciativas(false);
    }
  }, [apiUrl, getHeaders]);

  useEffect(() => { cargarIniciativas(); }, [cargarIniciativas]);

  const guardarIniciativa = async (datos) => {
    setGuardandoIniciativa(true);
    try {
      if (datos.id) {
        await axios.put(`${apiUrl}/api/iniciativas/${datos.id}`, datos, { headers: getHeaders() });
      } else {
        await axios.post(`${apiUrl}/api/iniciativas`, datos, { headers: getHeaders() });
      }
      setModalIniciativa(null);
      cargarIniciativas();
    } catch (err) {
      setErrorIniciativas('Error guardando: ' + (err.response?.data?.error || err.message));
    } finally {
      setGuardandoIniciativa(false);
    }
  };

  const eliminarIniciativa = async (id) => {
    if (!window.confirm('¿Eliminar esta iniciativa? No se puede deshacer.')) return;
    try {
      await axios.delete(`${apiUrl}/api/iniciativas/${id}`, { headers: getHeaders() });
      cargarIniciativas();
    } catch (err) {
      setErrorIniciativas('Error eliminando: ' + (err.response?.data?.error || err.message));
    }
  };

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

      const requeridos = ['EMP_NAME','WEEK_ENDING_DATE','HOURS','OVERTIME_IND','COST_SPOT_USD','LEDGER_MONTH_NAME'];
      for (const r of requeridos) {
        if (!(r in h)) throw new Error(`Columna requerida no encontrada: ${r}`);
      }

      const MESES_LEDGER = { January:1, February:2, March:3, April:4, May:5, June:6, July:7, August:8, September:9, October:10, November:11, December:12 };

      const porSemana = {};
      for (let i = 1; i < filas.length; i++) {
        const fila = filas[i];
        const fecha = parseFecha(fila[h['WEEK_ENDING_DATE']]);
        if (!fecha) continue;
        const fechaKey = fecha.toISOString().slice(0,10);

        // El mes "contable" real (LEDGER_MONTH_NAME) no siempre coincide con el mes
        // calendario del WEEK_ENDING_DATE — filas de una misma semana pueden quedar
        // contabilizadas en meses distintos (ajustes de cierre). Se agrupa por el mes
        // contable para que el total de "julio" cuadre con el reporte oficial de Kyndryl.
        // OJO: LEDGER_YEAR es el AÑO FISCAL de Kyndryl (ej. 2027), no el año calendario —
        // por eso el año se calcula desde WEEK_ENDING_DATE, con ajuste solo si el mes
        // contable cruza el límite diciembre/enero hacia el año calendario siguiente/anterior.
        const nombreMesLedger = String(fila[h['LEDGER_MONTH_NAME']] || '').trim();
        const mesSemana = fecha.getMonth() + 1;
        const mes = MESES_LEDGER[nombreMesLedger] || mesSemana;
        let anio = fecha.getFullYear();
        if (mes === 1 && mesSemana === 12) anio += 1;
        else if (mes === 12 && mesSemana === 1) anio -= 1;

        // Clave compuesta: una misma semana calendario puede generar más de un
        // "bucket" si sus filas se reparten entre dos meses contables distintos.
        const key = `${fechaKey}__${anio}-${String(mes).padStart(2,'0')}`;

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
            fecha: fechaKey,
            claveDoc: key,
            label: fecha.toLocaleDateString('es-CL', { day:'2-digit', month:'short' }),
            mes, anio,
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

      const nuevasSemanas = Object.values(porSemana).sort((a,b) => a.claveDoc.localeCompare(b.claveDoc));
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

  // Versión ANUAL del cruce persona→grupo (todas las semanas cargadas, no
  // solo el mes/año filtrado). gruposPorPersona de arriba está acotado al
  // mes filtrado a propósito (así las KPIs "Personas sin grupo" de esta
  // pestaña reflejan el período seleccionado) — pero eso hacía que el
  // gráfico "Tendencia anual por grupo" no encontrara a nadie fuera del mes
  // actual, mostrando 0h en semanas de otros meses.
  const gruposPorPersonaAnual = {};
  const todasPersonasExcelAnual = new Set();
  semanas.forEach(s => Object.keys(s.personas||{}).forEach(p => todasPersonasExcelAnual.add(p)));
  todasPersonasExcelAnual.forEach(empName => {
    const userMatch = matchearNombre(empName, usuariosFS);
    const grupoId = userMatch?.gruposPorCliente?.[clienteActivo] || userMatch?.grupoServicioId || '';
    if (userMatch && grupoId) {
      gruposPorPersonaAnual[empName] = { grupoId, grupoNombre: mapaGrupos[grupoId] || grupoId, matched: true };
    } else {
      gruposPorPersonaAnual[empName] = { grupoId: '__sin_grupo__', grupoNombre: 'Sin grupo asignado', matched: !!userMatch };
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

  // Tendencia — todas las semanas. Una misma semana calendario puede existir como
  // 2 documentos si sus horas se repartieron entre dos meses contables distintos
  // (ver lógica de carga); acá se fusionan por fecha (incluyendo el detalle anidado
  // por persona/WBS/grupo) para no duplicar ni perder datos en el gráfico anual.
  // Copia profunda de un sub-objeto tipo { persona: {horas, costo, ...} } —
  // IMPORTANTE: una copia superficial ({...obj}) solo clona la "caja" externa,
  // dejando los valores internos apuntando a los MISMOS objetos que viven en el
  // estado `semanas`. Sumar sobre esos valores después mutaría permanentemente
  // el estado real cada vez que la app se vuelve a pintar (bug ya corregido).
  const copiaProfunda = (obj) => {
    const copia = {};
    Object.entries(obj || {}).forEach(([clave, datos]) => { copia[clave] = { ...datos }; });
    return copia;
  };
  const sumarSubobjeto = (destino, origen) => {
    Object.entries(origen || {}).forEach(([clave, datos]) => {
      if (!destino[clave]) destino[clave] = { horas: 0, costo: 0, horasOT: 0, horasSB: 0 };
      destino[clave].horas += datos.horas || 0;
      destino[clave].costo += datos.costo || 0;
      destino[clave].horasOT += datos.horasOT || 0;
      destino[clave].horasSB += datos.horasSB || 0;
    });
  };
  const semanasPorFecha = {};
  semanas.forEach(s => {
    if (!semanasPorFecha[s.fecha]) {
      semanasPorFecha[s.fecha] = {
        ...s,
        personas: copiaProfunda(s.personas),
        wbs: copiaProfunda(s.wbs),
        offering: copiaProfunda(s.offering),
        nivel: copiaProfunda(s.nivel),
        managers: copiaProfunda(s.managers),
        jobRoles: { ...(s.jobRoles || {}) }
      };
    } else {
      const acc = semanasPorFecha[s.fecha];
      acc.base += s.base; acc.ot += s.ot; acc.sb += s.sb; acc.costo += s.costo;
      sumarSubobjeto(acc.personas, s.personas);
      sumarSubobjeto(acc.wbs, s.wbs);
      sumarSubobjeto(acc.offering, s.offering);
      sumarSubobjeto(acc.nivel, s.nivel);
      sumarSubobjeto(acc.managers, s.managers);
      Object.entries(s.jobRoles || {}).forEach(([rol, horas]) => { acc.jobRoles[rol] = (acc.jobRoles[rol] || 0) + horas; });
    }
  });
  const todosSem = Object.values(semanasPorFecha).sort((a,b) => a.fecha.localeCompare(b.fecha));
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

  // Tendencia por grupo — ANUAL (todas las semanas cargadas, no solo el mes
  // filtrado), un grupo a la vez, horas y costo juntos como en el gráfico
  // general de arriba.
  const grupoTotalAnual = {};
  todosSem.forEach(s => {
    Object.entries(s.personas||{}).forEach(([empName, datos]) => {
      const { grupoNombre } = gruposPorPersonaAnual[empName] || { grupoNombre: 'Sin grupo asignado' };
      if (!grupoTotalAnual[grupoNombre]) grupoTotalAnual[grupoNombre] = { horas:0, costo:0 };
      grupoTotalAnual[grupoNombre].horas += datos.horas || 0;
      grupoTotalAnual[grupoNombre].costo += datos.costo || 0;
    });
  });
  const grupoOrdenadoAnual = Object.entries(grupoTotalAnual).sort((a,b) => b[1].costo - a[1].costo);
  const top10GruposAnual = grupoOrdenadoAnual.slice(0, 10);
  const grupoAnualActivo = grupoAnualSel && top10GruposAnual.some(([n]) => n === grupoAnualSel)
    ? grupoAnualSel
    : (top10GruposAnual[0]?.[0] || null);
  const idxColorAnual = top10GruposAnual.findIndex(([n]) => n === grupoAnualActivo);
  const colorGrupoAnual = grupoAnualActivo === 'Sin grupo asignado' ? COLOR_SIN_GRUPO : COLORES_GRUPO[idxColorAnual % COLORES_GRUPO.length] || '#2a78d6';

  const horasPorSemanaGrupoAnual = todosSem.map(s =>
    Object.entries(s.personas||{}).reduce((sum,[emp,datos]) =>
      (gruposPorPersonaAnual[emp]?.grupoNombre === grupoAnualActivo) ? sum + (datos.horas||0) : sum, 0)
  );
  const costoPorSemanaGrupoAnual = todosSem.map(s =>
    Object.entries(s.personas||{}).reduce((sum,[emp,datos]) =>
      (gruposPorPersonaAnual[emp]?.grupoNombre === grupoAnualActivo) ? sum + (datos.costo||0) : sum, 0)
  );
  const chartTendenciaGrupoAnual = {
    labels: todosSem.map(s => s.label),
    datasets:[
      { label:'Horas', data:horasPorSemanaGrupoAnual, borderColor:colorGrupoAnual, backgroundColor:colorGrupoAnual+'12', borderWidth:2, fill:true, tension:0.35, pointRadius:3, pointBackgroundColor:colorGrupoAnual, yAxisID:'y' },
      { label:'Costo USD', data:costoPorSemanaGrupoAnual, borderColor:'#1baf7a', backgroundColor:'transparent', borderWidth:2, borderDash:[4,3], fill:false, tension:0.35, pointRadius:3, pointBackgroundColor:'#1baf7a', yAxisID:'y2' }
    ]
  };

  // Consolidado mensual — suma todas las semanas dentro de cada mes calendario.
  // IMPORTANTE: usa `semanas` (sin fusionar por fecha), no `todosSem` — porque
  // `todosSem` fusiona semanas repartidas entre dos meses contables para el
  // gráfico de Tendencia, y aquí necesitamos justo lo contrario: mantenerlas
  // separadas para que cada mes sume su costo real (ej. julio = $152.86K).
  const MESES_NOMBRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesesMap = {};
  semanas.forEach(s => {
    const key = `${s.anio}-${String(s.mes).padStart(2,'0')}`;
    if (!mesesMap[key]) mesesMap[key] = { anio:s.anio, mes:s.mes, horas:0, costo:0, semanas:0 };
    mesesMap[key].horas += (s.base||0)+(s.ot||0)+(s.sb||0);
    mesesMap[key].costo += s.costo||0;
    mesesMap[key].semanas += 1;
  });
  const hoy = new Date();
  const mesesConsolidado = Object.keys(mesesMap).sort().map((key, i, arr) => {
    const m = mesesMap[key];
    const esUltimo = i === arr.length - 1;
    const esMesActual = esUltimo && m.anio === hoy.getFullYear() && m.mes === (hoy.getMonth()+1);
    const anterior = i > 0 ? mesesMap[arr[i-1]] : null;
    const variacion = anterior && anterior.horas > 0 ? ((m.horas - anterior.horas) / anterior.horas) * 100 : null;
    return {
      key, label: `${MESES_NOMBRE[m.mes-1]} ${m.anio}`,
      horas: m.horas, costo: m.costo, semanas: m.semanas,
      rate: m.horas > 0 ? m.costo / m.horas : 0,
      parcial: esMesActual, variacion
    };
  });
  const chartMensual = {
    labels: mesesConsolidado.map(m => m.label),
    datasets:[
      { label:'Horas', type:'bar', data:mesesConsolidado.map(m=>m.horas), backgroundColor:'#2a78d6', borderRadius:6, yAxisID:'y' },
      { label:'Costo USD', type:'line', data:mesesConsolidado.map(m=>m.costo), borderColor:'#1baf7a', backgroundColor:'transparent', borderWidth:2.5, borderDash:[5,3], fill:false, tension:0.3, pointRadius:5, pointBackgroundColor:'#1baf7a', pointBorderColor:'#fff', pointBorderWidth:2, yAxisID:'y2' }
    ]
  };
  const lineOpts = { ...chartBase, scales:{ ...chartBase.scales, y:{...chartBase.scales.y, ticks:{...chartBase.scales.y.ticks, callback:v=>'$'+Math.round(v/1000)+'K'}} } };

  // ── Análisis global IA (Resumen Ejecutivo + tarjetas por grupo) ──
  // Las cifras (horas, costo, %, tendencia) se calculan en JS para que sean
  // exactas; la IA solo redacta el resumen ejecutivo y una recomendación
  // corta por grupo — no inventa números.
  const totalHorasAnual = todosSem.reduce((s,x)=>s+(x.base||0)+(x.ot||0)+(x.sb||0),0);
  const totalCostoAnual = todosSem.reduce((s,x)=>s+(x.costo||0),0);
  const mesMayorCarga = [...mesesConsolidado].sort((a,b)=>b.horas-a.horas)[0] || null;

  const statsGruposAnual = top10GruposAnual.slice(0,8).map(([nombre, v], i) => {
    // Tendencia: compara la 2da mitad del período vs la 1ra mitad para este grupo
    const mitad = Math.ceil(todosSem.length/2);
    const primeraMitad = todosSem.slice(0, mitad);
    const segundaMitad = todosSem.slice(mitad);
    const horasPrimera = primeraMitad.reduce((s,sem)=>s+Object.entries(sem.personas||{}).reduce((a,[emp,d])=>gruposPorPersonaAnual[emp]?.grupoNombre===nombre?a+(d.horas||0):a,0),0);
    const horasSegunda = segundaMitad.reduce((s,sem)=>s+Object.entries(sem.personas||{}).reduce((a,[emp,d])=>gruposPorPersonaAnual[emp]?.grupoNombre===nombre?a+(d.horas||0):a,0),0);
    let tendencia = 'estable';
    if (horasPrimera > 0) {
      if (horasSegunda > horasPrimera * 1.15) tendencia = 'creciente';
      else if (horasSegunda < horasPrimera * 0.85) tendencia = 'decreciente';
    }
    return {
      nombre, horas: v.horas, costo: v.costo,
      pct: totalHorasAnual > 0 ? (v.horas/totalHorasAnual*100) : 0,
      tendencia,
      color: nombre === 'Sin grupo asignado' ? COLOR_SIN_GRUPO : COLORES_GRUPO[i % COLORES_GRUPO.length],
      recomendacion: '' // se completa con la respuesta de IA
    };
  });

  const generarInsightsTendencia = async () => {
    setIaLoading(true);
    setIaError(null);
    try {
      const resumenGrupos = statsGruposAnual.map(g =>
        `${g.nombre}: ${fmt(g.horas)}h (${fmt(g.pct)}%), ${fmtK(g.costo)}, tendencia ${g.tendencia}`
      ).join('\n');

      const prompt = `Analiza estos datos de horas extra (OVT) de Kyndryl Chile.

TOTAL DEL PERÍODO: ${fmt(totalHorasAnual)}h, ${fmtK(totalCostoAnual)}, ${todosSem.length} semanas cargadas.
MES CON MAYOR CARGA: ${mesMayorCarga ? `${mesMayorCarga.label} (${fmt(mesMayorCarga.horas)}h)` : 'sin datos'}.

HORAS POR GRUPO DE SERVICIO:
${resumenGrupos}

Responde en EXACTAMENTE este formato de texto plano, una línea por elemento, sin markdown ni numeración:
RESUMEN: <1-2 oraciones resumiendo la carga de trabajo y dónde se concentra, máx 220 caracteres>
GRUPO: ${statsGruposAnual[0]?.nombre || ''} | <recomendación de gestión de máx 40 caracteres para este grupo>
${statsGruposAnual.slice(1).map(g => `GRUPO: ${g.nombre} | <recomendación de máx 40 caracteres>`).join('\n')}

No agregues texto fuera de ese formato.`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 700
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error('Error en GROQ: ' + (errorData.error?.message || response.statusText));
      }

      const data = await response.json();
      const texto = data.choices[0].message.content;

      // Parsear el formato RESUMEN: / GRUPO: nombre | recomendación
      const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);
      let resumen = '';
      const recomendaciones = {};
      lineas.forEach(linea => {
        if (linea.startsWith('RESUMEN:')) {
          resumen = linea.replace('RESUMEN:', '').trim();
        } else if (linea.startsWith('GRUPO:')) {
          const resto = linea.replace('GRUPO:', '').trim();
          const [nombreG, ...rec] = resto.split('|');
          if (nombreG) recomendaciones[nombreG.trim()] = rec.join('|').trim();
        }
      });

      const gruposConRecomendacion = statsGruposAnual.map(g => ({
        ...g,
        recomendacion: recomendaciones[g.nombre] || 'Sin recomendación específica'
      }));

      setIaInsights({ resumen: resumen || 'Análisis generado sin resumen ejecutivo.', grupos: gruposConRecomendacion });
    } catch (err) {
      setIaError('Error generando análisis: ' + err.message);
      console.error(err);
    } finally {
      setIaLoading(false);
    }
  };

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
            Acumulativo · hoja "Export" requerida · cada carga actualiza las semanas con los datos más recientes
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

          {(filtradas.length === 0 && tabAnalitca !== 'iniciativas') ? (
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
                      {mgrOrdenado.length === 0 ? (
                        <p style={{ fontSize:'12px', color:'var(--muted)', fontWeight:'600' }}>Sin datos de manager en este período — vuelve a subir el Export.xlsx para incluirlos</p>
                      ) : (
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
                      )}
                    </div>
                    <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'20px' }}>
                      <h4 style={{ margin:'0 0 12px', fontSize:'13px', color:'var(--ink-800)', fontWeight:'600' }}>OVT por Grupo de Servicio</h4>
                      {grupoOTOrdenado.length === 0 ? (
                        <p style={{ fontSize:'12px', color:'var(--muted)', fontWeight:'600' }}>Sin horas de overtime en este período — si esperabas ver datos, vuelve a subir el Export.xlsx</p>
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
                        <p style={{ fontSize:'12px', color:'var(--muted)', fontWeight:'600' }}>Sin horas de standby en este período — si esperabas ver datos, vuelve a subir el Export.xlsx</p>
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

                  {/* Tendencia anual por grupo — mismo rango completo, un grupo a la vez */}
                  <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'18px 20px', marginTop:'16px' }}>
                    <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.09em', marginBottom:'4px' }}>Gráfico</div>
                    <h4 style={{ margin:'0 0 12px', fontSize:'1rem', fontWeight:'800', color:'var(--ink-950)', letterSpacing:'-.03em' }}>Tendencia anual por grupo — horas y costo</h4>
                    <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'14px' }}>
                      {top10GruposAnual.map(([nombre], i) => {
                        const color = nombre === 'Sin grupo asignado' ? COLOR_SIN_GRUPO : COLORES_GRUPO[i % COLORES_GRUPO.length];
                        const activo = nombre === grupoAnualActivo;
                        return (
                          <button key={nombre} onClick={() => setGrupoAnualSel(nombre)}
                            style={{ fontSize:'10px', padding:'4px 10px', borderRadius:'12px', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:'5px',
                              background: activo ? color : '#f3f4f6', color: activo ? '#fff' : 'var(--muted)', fontWeight: activo ? '700' : '400' }}>
                            {nombre.length > 16 ? nombre.slice(0,16)+'…' : nombre}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ position:'relative', height:'220px', overflow:'hidden' }}>
                      <Line data={chartTendenciaGrupoAnual} options={chartTendOpts} />
                    </div>
                  </div>

                  {/* Consolidado mensual */}
                  <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'18px 20px', marginTop:'16px' }}>
                    <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.09em', marginBottom:'4px' }}>Gráfico</div>
                    <h4 style={{ margin:'0 0 4px', fontSize:'1rem', fontWeight:'800', color:'var(--ink-950)', letterSpacing:'-.03em' }}>Consolidado mensual — horas y costo</h4>
                    <p style={{ fontSize:'11px', color:'var(--muted)', margin:'0 0 14px' }}>Suma de todas las semanas dentro de cada mes calendario</p>
                    <div style={{ position:'relative', height:'220px', overflow:'hidden', marginBottom:'18px' }}>
                      <Line data={chartMensual} options={chartTendOpts} />
                    </div>

                    <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:'8px' }}>Detalle</div>
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                        <thead>
                          <tr style={{ textAlign:'left', color:'var(--muted)', fontSize:'10px', textTransform:'uppercase', letterSpacing:'.05em' }}>
                            <th style={{ padding:'6px 8px 6px 0', fontWeight:'700' }}>Mes</th>
                            <th style={{ padding:'6px 8px', fontWeight:'700' }}>Semanas</th>
                            <th style={{ padding:'6px 8px', fontWeight:'700', textAlign:'right' }}>Horas</th>
                            <th style={{ padding:'6px 8px', fontWeight:'700', textAlign:'right' }}>Costo</th>
                            <th style={{ padding:'6px 8px', fontWeight:'700', textAlign:'right' }}>Rate/h</th>
                            <th style={{ padding:'6px 0 6px 8px', fontWeight:'700', textAlign:'right' }}>Var. vs mes ant.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mesesConsolidado.map(m => (
                            <tr key={m.key} style={{ borderTop:'1px solid rgba(11,41,64,0.06)' }}>
                              <td style={{ padding:'8px 8px 8px 0', fontWeight:'700', color:'var(--ink-950)' }}>{m.label}</td>
                              <td style={{ padding:'8px', color:'var(--muted)' }}>
                                {m.semanas}{m.parcial && <span style={{ color:'#d97706', fontWeight:'700' }}> · parcial</span>}
                              </td>
                              <td style={{ padding:'8px', textAlign:'right', fontWeight:'700', color:'var(--ink-950)' }}>{fmt(m.horas)}h</td>
                              <td style={{ padding:'8px', textAlign:'right', color:'#1baf7a', fontWeight:'700' }}>{fmtK(m.costo)}</td>
                              <td style={{ padding:'8px', textAlign:'right', color:'var(--muted)' }}>${fmt(m.rate)}/h</td>
                              <td style={{ padding:'8px 0 8px 8px', textAlign:'right', fontWeight:'700', color: m.variacion===null ? 'var(--muted)' : (m.variacion>=0 ? '#e24b4a' : '#1baf7a') }}>
                                {m.variacion===null ? '—' : `${m.variacion>=0?'▲':'▼'} ${fmt(Math.abs(m.variacion))}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Análisis IA de tendencias */}
                  <div style={{ border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', background:'var(--glass)', boxShadow:'var(--shadow-soft)', backdropFilter:'blur(18px)', padding:'18px 20px', marginTop:'16px' }}>
                    <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'9px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.09em', marginBottom:'4px' }}>IA</div>
                    <h4 style={{ margin:'0 0 12px', fontSize:'1rem', fontWeight:'800', color:'var(--ink-950)', letterSpacing:'-.03em' }}>Análisis global de tendencias — costos, horas y grupos</h4>

                    {iaLoading && <p style={{ color:'var(--muted)', fontStyle:'italic', fontSize:'13px' }}>⏳ Analizando tendencia mensual y por grupo...</p>}
                    {iaError && <p style={{ color:'#e24b4a', fontSize:'13px' }}>❌ {iaError}</p>}

                    {iaInsights && !iaLoading && (
                      <div>
                        {/* Resumen Ejecutivo */}
                        <div style={{ background:'rgba(238,245,248,0.7)', border:'1px solid rgba(11,41,64,0.08)', borderRadius:'14px', padding:'14px 16px', marginBottom:'16px' }}>
                          <div style={{ fontSize:'11px', fontWeight:'800', color:'var(--ink-950)', marginBottom:'6px' }}>📋 Resumen Ejecutivo</div>
                          <p style={{ fontSize:'13px', color:'var(--ink-800)', margin:'0 0 8px', lineHeight:'1.5' }}>{iaInsights.resumen}</p>
                          <div style={{ display:'flex', gap:'16px', flexWrap:'wrap', fontSize:'11px', color:'var(--muted)' }}>
                            {mesMayorCarga && <span>🏔️ Mayor carga: <strong style={{color:'var(--ink-950)'}}>{mesMayorCarga.label}</strong> ({fmt(mesMayorCarga.horas)}h)</span>}
                            <span>📊 Total analizado: <strong style={{color:'var(--ink-950)'}}>{fmt(totalHorasAnual)}h · {fmtK(totalCostoAnual)}</strong></span>
                          </div>
                        </div>

                        {/* Tarjetas por grupo */}
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:'12px', marginBottom:'14px' }}>
                          {iaInsights.grupos.map(g => {
                            const tendIcon = g.tendencia === 'creciente' ? '📈' : g.tendencia === 'decreciente' ? '📉' : '➡️';
                            return (
                              <div key={g.nombre} style={{ borderRadius:'16px', overflow:'hidden', border:'1px solid rgba(11,41,64,0.08)', background:'#fff' }}>
                                <div style={{ background:g.color, color:'#fff', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                  <span style={{ fontSize:'12px', fontWeight:'800' }}>{g.nombre}</span>
                                  <span style={{ fontSize:'10px', fontWeight:'700', background:'rgba(255,255,255,0.25)', padding:'2px 8px', borderRadius:'10px' }}>{tendIcon} {g.tendencia}</span>
                                </div>
                                <div style={{ padding:'12px 14px' }}>
                                  <div style={{ display:'flex', gap:'14px', marginBottom:'10px' }}>
                                    <div>
                                      <div style={{ fontSize:'15px', fontWeight:'800', color:'var(--ink-950)' }}>{fmt(g.horas)}h</div>
                                      <div style={{ fontSize:'9px', color:'var(--muted)', textTransform:'uppercase', fontWeight:'700' }}>Horas</div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize:'15px', fontWeight:'800', color:'var(--ink-950)' }}>{fmt(g.pct)}%</div>
                                      <div style={{ fontSize:'9px', color:'var(--muted)', textTransform:'uppercase', fontWeight:'700' }}>Del total</div>
                                    </div>
                                    <div>
                                      <div style={{ fontSize:'15px', fontWeight:'800', color:'var(--ink-950)' }}>{fmtK(g.costo)}</div>
                                      <div style={{ fontSize:'9px', color:'var(--muted)', textTransform:'uppercase', fontWeight:'700' }}>Costo</div>
                                    </div>
                                  </div>
                                  <div style={{ fontSize:'11px', color:'var(--ink-800)', background:'rgba(238,245,248,0.7)', borderRadius:'8px', padding:'6px 10px', display:'flex', alignItems:'center', gap:'6px' }}>
                                    💡 {g.recomendacion}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <button onClick={generarInsightsTendencia}
                          style={{ padding:'9px 16px', background:'#4CAF50', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'12px', fontWeight:'700' }}>
                          🔄 Regenerar análisis
                        </button>
                      </div>
                    )}
                    {!iaLoading && !iaInsights && !iaError && (
                      <button onClick={generarInsightsTendencia}
                        style={{ padding:'10px 18px', background:'#3266ad', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'700' }}>
                        🚀 Generar análisis IA
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── TAB INICIATIVAS ── */}
              {tabAnalitca === 'iniciativas' && (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px', flexWrap:'wrap', gap:'10px' }}>
                    <div>
                      <h3 style={{ margin:0, fontSize:'1rem', fontWeight:'800', color:'var(--ink-950)' }}>Iniciativas e Issues</h3>
                      <p style={{ margin:'2px 0 0', fontSize:'12px', color:'var(--muted)' }}>Seguimiento de iniciativas y problemas abiertos de la cuenta.</p>
                    </div>
                    <button
                      onClick={() => setModalIniciativa({ nombre:'', fechaCompromiso:'', estado:'no_iniciada', progreso:0, responsable:'', tipo:'iniciativa', notas:'' })}
                      style={{ borderRadius:'999px', background:'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color:'#fff', padding:'10px 18px', fontSize:'12px', fontWeight:'900', border:'none', cursor:'pointer', boxShadow:'0 12px 28px rgba(0,59,113,0.22)' }}
                    >
                      + Nueva iniciativa
                    </button>
                  </div>

                  {errorIniciativas && (
                    <div style={{ background:'rgba(215,59,71,0.08)', border:'1px solid rgba(215,59,71,0.24)', borderRadius:'12px', padding:'10px 16px', color:'#a61e2b', fontSize:'13px', fontWeight:'600', marginBottom:'14px' }}>
                      {errorIniciativas}
                    </div>
                  )}

                  {cargandoIniciativas ? (
                    <p style={{ textAlign:'center', color:'var(--muted)', padding:'30px' }}>Cargando...</p>
                  ) : (
                    <div className="tabla-responsive">
                      <table className="tabla">
                        <thead>
                          <tr>
                            <th>Nombre</th>
                            <th>Tipo</th>
                            <th>Fecha compromiso</th>
                            <th>Estado</th>
                            <th style={{ width:'160px' }}>Progreso</th>
                            <th>Responsable</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {iniciativas.length === 0 && (
                            <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--muted)', fontWeight:'600' }}>Sin iniciativas registradas aún.</td></tr>
                          )}
                          {iniciativas.map(it => {
                            const est = ESTADOS_INICIATIVA[it.estado] || ESTADOS_INICIATIVA.no_iniciada;
                            return (
                              <tr key={it.id}>
                                <td style={{ fontWeight:'700' }}>{it.nombre}</td>
                                <td style={{ textTransform:'capitalize' }}>{it.tipo === 'issue' ? 'Issue' : 'Iniciativa'}</td>
                                <td>{it.fechaCompromiso ? new Date(it.fechaCompromiso + 'T00:00:00').toLocaleDateString('es-CL') : '—'}</td>
                                <td>
                                  <span style={{ background:est.bg, color:est.fg, fontSize:'11px', fontWeight:'800', padding:'4px 10px', borderRadius:'999px', whiteSpace:'nowrap' }}>
                                    {est.label}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                                    <div style={{ flex:1, height:'6px', borderRadius:'999px', background:'rgba(18,52,78,0.1)', overflow:'hidden' }}>
                                      <div style={{ width:`${it.progreso || 0}%`, height:'100%', background:'var(--bank-blue)' }} />
                                    </div>
                                    <span style={{ fontSize:'11px', fontWeight:'700', color:'var(--muted)', flexShrink:0 }}>{it.progreso || 0}%</span>
                                  </div>
                                </td>
                                <td>{it.responsable || '—'}</td>
                                <td className="acciones">
                                  <button className="btn-editar" onClick={() => setModalIniciativa(it)}>Editar</button>
                                  <button className="btn-eliminar" onClick={() => eliminarIniciativa(it.id)}>Eliminar</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* MODAL CREAR/EDITAR INICIATIVA */}
      {modalIniciativa && (
        <div style={{ position:'fixed', inset:0, background:'rgba(6,24,38,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'20px' }}>
          <div style={{ background:'var(--paper-50)', border:'1px solid rgba(255,255,255,0.72)', borderRadius:'22px', boxShadow:'var(--shadow-lift)', padding:'22px', width:480, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'16px' }}>
              <p style={{ fontWeight:'800', margin:0, color:'var(--ink-950)', fontSize:'15px' }}>
                {modalIniciativa.id ? 'Editar iniciativa' : 'Nueva iniciativa'}
              </p>
              <button onClick={() => setModalIniciativa(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'18px', padding:'4px' }}>✕</button>
            </div>

            <label style={{ fontSize:'10px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'6px' }}>Nombre</label>
            <input
              type="text"
              value={modalIniciativa.nombre}
              onChange={e => setModalIniciativa({ ...modalIniciativa, nombre: e.target.value })}
              placeholder="Nombre de la iniciativa o issue"
              style={{ width:'100%', marginBottom:'14px', border:'1px solid var(--line)', borderRadius:'12px', padding:'9px 14px', fontSize:'13px', background:'rgba(255,255,255,0.84)', color:'var(--ink-950)' }}
            />

            <label style={{ fontSize:'10px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'6px' }}>Tipo</label>
            <select
              value={modalIniciativa.tipo || 'iniciativa'}
              onChange={e => setModalIniciativa({ ...modalIniciativa, tipo: e.target.value })}
              style={{ width:'100%', marginBottom:'14px', border:'1px solid var(--line)', borderRadius:'12px', padding:'9px 14px', fontSize:'13px', fontWeight:'600', background:'rgba(255,255,255,0.84)', color:'var(--ink-950)' }}
            >
              <option value="iniciativa">Iniciativa</option>
              <option value="issue">Issue</option>
            </select>

            <label style={{ fontSize:'10px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'6px' }}>Fecha de compromiso</label>
            <input
              type="date"
              value={modalIniciativa.fechaCompromiso || ''}
              onChange={e => setModalIniciativa({ ...modalIniciativa, fechaCompromiso: e.target.value })}
              style={{ width:'100%', marginBottom:'14px', border:'1px solid var(--line)', borderRadius:'12px', padding:'9px 14px', fontSize:'13px', background:'rgba(255,255,255,0.84)', color:'var(--ink-950)' }}
            />

            <label style={{ fontSize:'10px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'6px' }}>Estado</label>
            <select
              value={modalIniciativa.estado}
              onChange={e => setModalIniciativa({ ...modalIniciativa, estado: e.target.value })}
              style={{ width:'100%', marginBottom:'14px', border:'1px solid var(--line)', borderRadius:'12px', padding:'9px 14px', fontSize:'13px', fontWeight:'600', background:'rgba(255,255,255,0.84)', color:'var(--ink-950)' }}
            >
              {Object.entries(ESTADOS_INICIATIVA).map(([valor, cfg]) => (
                <option key={valor} value={valor}>{cfg.label}</option>
              ))}
            </select>

            <label style={{ fontSize:'10px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'6px' }}>
              Progreso — {modalIniciativa.progreso || 0}%
            </label>
            <input
              type="range" min="0" max="100" step="5"
              value={modalIniciativa.progreso || 0}
              onChange={e => setModalIniciativa({ ...modalIniciativa, progreso: Number(e.target.value) })}
              style={{ width:'100%', marginBottom:'14px' }}
            />

            <label style={{ fontSize:'10px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'6px' }}>Responsable</label>
            <input
              type="text"
              value={modalIniciativa.responsable || ''}
              onChange={e => setModalIniciativa({ ...modalIniciativa, responsable: e.target.value })}
              placeholder="Nombre del responsable"
              style={{ width:'100%', marginBottom:'14px', border:'1px solid var(--line)', borderRadius:'12px', padding:'9px 14px', fontSize:'13px', background:'rgba(255,255,255,0.84)', color:'var(--ink-950)' }}
            />

            <label style={{ fontSize:'10px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:'6px' }}>Notas (opcional)</label>
            <textarea
              value={modalIniciativa.notas || ''}
              onChange={e => setModalIniciativa({ ...modalIniciativa, notas: e.target.value })}
              placeholder="Contexto, bloqueos, próximos pasos..."
              style={{ width:'100%', minHeight:'70px', marginBottom:'18px', border:'1px solid var(--line)', borderRadius:'12px', padding:'10px 14px', fontSize:'13px', fontFamily:'inherit', background:'rgba(255,255,255,0.84)', color:'var(--ink-950)', resize:'vertical' }}
            />

            <button
              onClick={() => guardarIniciativa(modalIniciativa)}
              disabled={guardandoIniciativa || !modalIniciativa.nombre?.trim()}
              style={{ borderRadius:'999px', background: guardandoIniciativa ? 'var(--muted)' : 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color:'#fff', padding:'10px 18px', fontSize:'13px', fontWeight:'900', border:'none', boxShadow:'0 12px 28px rgba(0,59,113,0.22)', cursor: guardandoIniciativa ? 'not-allowed' : 'pointer', width:'100%' }}
            >
              {guardandoIniciativa ? 'Guardando...' : (modalIniciativa.id ? 'Guardar cambios' : 'Crear iniciativa')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClaimDashboard;
