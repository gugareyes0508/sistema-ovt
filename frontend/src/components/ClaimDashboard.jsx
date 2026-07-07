import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Tooltip, Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

const STORAGE_KEY = 'claim_data_v1';
const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ─── helpers ─────────────────────────────────────────────────────────────────

const parseFecha = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000));
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const fmt = (n, dec = 1) => (Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec)).toFixed(dec);

// ─── componente ──────────────────────────────────────────────────────────────

const ClaimDashboard = () => {
  const [semanas, setSemanas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [cargando, setCargando] = useState(false);
  const [ultimaCarga, setUltimaCarga] = useState(() => localStorage.getItem('claim_ultima_carga') || null);
  const [filtroMes, setFiltroMes] = useState(new Date().getMonth() + 1);
  const [filtroAnio, setFiltroAnio] = useState(new Date().getFullYear());
  const fileRef = useRef();

  // años disponibles en los datos
  const aniosDisponibles = [...new Set(semanas.map(s => s.anio))].sort((a, b) => b - a);
  if (!aniosDisponibles.includes(filtroAnio) && aniosDisponibles.length) {
    // no bloquear render, solo ajustar en el próximo ciclo
  }

  // ─── carga del Excel ───────────────────────────────────────────────────────
  const procesarExcel = async (file) => {
    setCargando(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const ws = wb.Sheets['Export'];
      if (!ws) throw new Error('No se encontró la hoja "Export" en el archivo');

      const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const headers = filas[0];
      const h = {};
      headers.forEach((v, i) => { if (v) h[String(v).trim()] = i; });

      const requeridos = ['EMP_NAME', 'WEEK_ENDING_DATE', 'HOURS', 'OVERTIME_IND', 'COST_SPOT_USD'];
      for (const r of requeridos) {
        if (!(r in h)) throw new Error(`Columna requerida no encontrada: ${r}`);
      }

      // agrupar por semana
      const porSemana = {};
      for (let i = 1; i < filas.length; i++) {
        const fila = filas[i];
        const fecha = parseFecha(fila[h['WEEK_ENDING_DATE']]);
        if (!fecha) continue;
        const key = fecha.toISOString().slice(0, 10);
        const persona = String(fila[h['EMP_NAME']] || '').trim();
        const horas = parseFloat(fila[h['HOURS']]) || 0;
        const ot = String(fila[h['OVERTIME_IND']] || '');
        const costo = parseFloat(fila[h['COST_SPOT_USD']]) || 0;

        if (!porSemana[key]) {
          porSemana[key] = {
            fecha: key,
            label: fecha.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }),
            mes: fecha.getMonth() + 1,
            anio: fecha.getFullYear(),
            base: 0, ot: 0, sb: 0, costo: 0,
            personas: {}
          };
        }
        const s = porSemana[key];
        if (ot.includes('Over Time')) s.ot += horas;
        else if (ot.includes('Stand')) s.sb += horas;
        else s.base += horas;
        s.costo += costo;
        if (persona) s.personas[persona] = (s.personas[persona] || 0) + horas;
      }

      const nuevasSemanas = Object.values(porSemana).sort((a, b) => a.fecha.localeCompare(b.fecha));

      // merge con datos previos (no sobreescribir semanas ya cargadas)
      const existentes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const existentesKeys = new Set(existentes.map(s => s.fecha));
      const merged = [...existentes, ...nuevasSemanas.filter(s => !existentesKeys.has(s.fecha))]
        .sort((a, b) => a.fecha.localeCompare(b.fecha));

      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      const ahora = new Date().toLocaleString('es-CL');
      localStorage.setItem('claim_ultima_carga', ahora);
      setSemanas(merged);
      setUltimaCarga(ahora);
      alert(`✅ Carga exitosa — ${nuevasSemanas.length} semanas procesadas (${nuevasSemanas.filter(s => !existentesKeys.has(s.fecha)).length} nuevas)`);
    } catch (err) {
      alert('❌ Error al procesar el archivo: ' + err.message);
    } finally {
      setCargando(false);
    }
  };

  const limpiarDatos = () => {
    if (!window.confirm('¿Eliminar todos los datos de Claims cargados? Esta acción no se puede deshacer.')) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('claim_ultima_carga');
    setSemanas([]);
    setUltimaCarga(null);
  };

  // ─── datos filtrados ────────────────────────────────────────────────────────
  const filtradas = semanas.filter(s => s.mes === filtroMes && s.anio === filtroAnio);

  const totalH = filtradas.reduce((sum, s) => sum + s.base + s.ot + s.sb, 0);
  const totalOT = filtradas.reduce((sum, s) => sum + s.ot, 0);
  const totalSB = filtradas.reduce((sum, s) => sum + s.sb, 0);
  const totalCosto = filtradas.reduce((sum, s) => sum + s.costo, 0);
  const semsConOT = filtradas.filter(s => s.ot > 0 || s.sb > 0).length;
  const promSemanal = filtradas.length ? totalH / filtradas.length : 0;

  // top personas
  const totPer = {};
  filtradas.forEach(s => Object.entries(s.personas).forEach(([k, v]) => { totPer[k] = (totPer[k] || 0) + v; }));
  const top10 = Object.entries(totPer).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxH = top10[0]?.[1] || 1;

  // chart data
  const gridColor = 'rgba(128,128,128,0.12)';
  const textMuted = '#888';
  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
    scales: {
      x: { stacked: true, ticks: { font: { size: 9 }, color: textMuted, maxRotation: 45, autoSkip: false }, grid: { display: false } },
      y: { stacked: true, ticks: { font: { size: 9 }, color: textMuted }, grid: { color: gridColor }, beginAtZero: true }
    }
  };
  const lineOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => '$' + fmt(ctx.raw / 1000) + 'K' } } },
    scales: {
      x: { ticks: { font: { size: 9 }, color: textMuted, maxRotation: 45, autoSkip: false }, grid: { display: false } },
      y: { ticks: { font: { size: 9 }, color: textMuted, callback: v => '$' + Math.round(v / 1000) + 'K' }, grid: { color: gridColor }, beginAtZero: true }
    }
  };

  const chartSemanal = {
    labels: filtradas.map(s => s.label),
    datasets: [
      { label: 'Base', data: filtradas.map(s => s.base), backgroundColor: '#2a78d6', stack: 'h' },
      { label: 'Overtime', data: filtradas.map(s => s.ot), backgroundColor: '#eda100', stack: 'h' },
      { label: 'Stand-by', data: filtradas.map(s => s.sb), backgroundColor: '#4a3aa7', stack: 'h' }
    ]
  };

  const chartCosto = {
    labels: filtradas.map(s => s.label),
    datasets: [{
      label: 'Costo USD', data: filtradas.map(s => s.costo),
      borderColor: '#1baf7a', backgroundColor: 'rgba(27,175,122,0.08)',
      borderWidth: 2, fill: true, tension: 0.35,
      pointRadius: 4, pointBackgroundColor: '#1baf7a', pointBorderColor: '#fff', pointBorderWidth: 1.5
    }]
  };

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <section className="seccion">
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ marginBottom: '4px' }}>🕐 Control de Labor (Claim)</h2>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
            Horas imputadas por el equipo Kyndryl Chile · carga semanal progresiva
          </p>
        </div>
        {ultimaCarga && (
          <div style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'right' }}>
            Última carga: {ultimaCarga}<br />
            <button onClick={limpiarDatos} style={{ fontSize: '11px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '4px' }}>
              🗑️ Limpiar datos
            </button>
          </div>
        )}
      </div>

      {/* UPLOAD */}
      <div
        style={{ border: '1.5px dashed #d1d5db', borderRadius: '8px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', cursor: 'pointer', background: '#fafafa' }}
        onClick={() => fileRef.current?.click()}
      >
        <span style={{ fontSize: '28px' }}>📊</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>
            {cargando ? '⏳ Procesando archivo...' : 'Cargar Export.xlsx semanal'}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af' }}>
            La carga es acumulativa — no reemplaza semanas ya cargadas · hoja "Export" requerida
          </div>
        </div>
        <button
          disabled={cargando}
          style={{ padding: '8px 16px', background: cargando ? '#d1d5db' : '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: cargando ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
        >
          {cargando ? '⏳ Cargando...' : '⬆️ Seleccionar archivo'}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files[0]) procesarExcel(e.target.files[0]); e.target.value = ''; }}
        />
      </div>

      {semanas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
          <div style={{ fontSize: '48px', marginBottom: '14px' }}>📂</div>
          <p style={{ fontSize: '15px', fontWeight: '600' }}>Sin datos cargados</p>
          <p style={{ fontSize: '13px' }}>Sube el archivo Export.xlsx para ver el análisis de Claims</p>
        </div>
      ) : (
        <>
          {/* FILTROS */}
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '14px 18px', marginBottom: '24px' }}>
            <div className="form-group" style={{ minWidth: '140px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '5px' }}>Mes</label>
              <select value={filtroMes} onChange={e => setFiltroMes(parseInt(e.target.value))}>
                {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ minWidth: '110px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', display: 'block', marginBottom: '5px' }}>Año</label>
              <select value={filtroAnio} onChange={e => setFiltroAnio(parseInt(e.target.value))}>
                {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div style={{ fontSize: '13px', color: '#6b7280', paddingLeft: '10px', borderLeft: '1px solid #e5e7eb', alignSelf: 'center' }}>
              {filtradas.length > 0
                ? <><strong>{filtradas.length}</strong> semanas · {MESES[filtroMes]} {filtroAnio}</>
                : <span style={{ color: '#ef4444' }}>Sin datos para este período</span>
              }
            </div>
          </div>

          {/* KPIs */}
          <div className="dashboard-grid" style={{ marginTop: 0, marginBottom: '24px' }}>
            <div className="card card-blue">
              <h3>🕐 Horas imputadas</h3>
              <p className="numero">{fmt(totalH)}h</p>
              <p style={{ fontSize: '11px', opacity: 0.85, marginTop: '5px' }}>OT: {fmt(totalOT)}h · SB: {fmt(totalSB)}h</p>
            </div>
            <div className="card card-green">
              <h3>💵 Costo total USD</h3>
              <p className="numero">${fmt(totalCosto / 1000)}K</p>
              <p style={{ fontSize: '11px', opacity: 0.85, marginTop: '5px' }}>Prom: ${fmt(filtradas.length ? totalCosto / filtradas.length / 1000 : 0)}K/sem</p>
            </div>
            <div className="card card-yellow">
              <h3>⚠️ Semanas con OT/SB</h3>
              <p className="numero">{semsConOT}</p>
              <p style={{ fontSize: '11px', opacity: 0.85, marginTop: '5px' }}>de {filtradas.length} semanas del período</p>
            </div>
            <div className="card" style={{ background: 'linear-gradient(135deg, #374151, #1f2937)' }}>
              <h3>📊 Promedio semanal</h3>
              <p className="numero">{fmt(promSemanal)}h</p>
              <p style={{ fontSize: '11px', opacity: 0.85, marginTop: '5px' }}>por semana en el período</p>
            </div>
          </div>

          {filtradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
              Sin datos para {MESES[filtroMes]} {filtroAnio}
            </div>
          ) : (
            <>
              {/* GRÁFICOS SEMANALES */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '18px' }}>
                  <h4 style={{ marginTop: 0, marginBottom: '12px', fontSize: '14px' }}>Horas por semana · Base / Overtime / Stand-by</h4>
                  <div style={{ display: 'flex', gap: '14px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    {[['#2a78d6','Base'], ['#eda100','Overtime'], ['#4a3aa7','Stand-by']].map(([c, l]) => (
                      <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#6b7280' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: c, display: 'inline-block' }}></span>{l}
                      </span>
                    ))}
                  </div>
                  <div style={{ position: 'relative', height: '200px' }}>
                    <Bar data={chartSemanal} options={chartOpts} />
                  </div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '18px' }}>
                  <h4 style={{ marginTop: 0, marginBottom: '12px', fontSize: '14px' }}>Costo USD por semana</h4>
                  <div style={{ position: 'relative', height: '230px' }}>
                    <Line data={chartCosto} options={lineOpts} />
                  </div>
                </div>
              </div>

              {/* PERSONAS + OT */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '18px' }}>
                  <h4 style={{ marginTop: 0, marginBottom: '14px', fontSize: '14px' }}>Top 10 personas por horas</h4>
                  {top10.map(([nombre, horas]) => (
                    <div key={nombre} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#6b7280', width: '130px', flexShrink: 0, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nombre}
                      </div>
                      <div style={{ flex: 1, background: '#e5e7eb', borderRadius: '3px', height: '7px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round(horas / maxH * 100)}%`, height: '100%', background: '#2a78d6', borderRadius: '3px' }} />
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af', width: '44px', textAlign: 'right' }}>{fmt(horas)}h</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '18px' }}>
                  <h4 style={{ marginTop: 0, marginBottom: '14px', fontSize: '14px' }}>Semanas con overtime / stand-by</h4>
                  {filtradas.filter(s => s.ot > 0 || s.sb > 0).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#9ca3af', fontSize: '13px' }}>Sin overtime en el período</div>
                  ) : (
                    <table className="tabla" style={{ minWidth: 0 }}>
                      <thead>
                        <tr>
                          <th>Semana</th>
                          <th>Modalidad</th>
                          <th>Horas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtradas.filter(s => s.ot > 0 || s.sb > 0).flatMap(s => [
                          s.ot > 0 && <tr key={s.fecha + '-ot'}>
                            <td>{s.label}</td>
                            <td><span className="badge badge-pendiente">Overtime</span></td>
                            <td>{fmt(s.ot)}h</td>
                          </tr>,
                          s.sb > 0 && <tr key={s.fecha + '-sb'}>
                            <td>{s.label}</td>
                            <td><span className="badge badge-exitoso">Stand-by</span></td>
                            <td>{fmt(s.sb)}h</td>
                          </tr>
                        ].filter(Boolean))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
};

export default ClaimDashboard;
