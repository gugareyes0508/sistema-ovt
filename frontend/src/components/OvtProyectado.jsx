import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, LineElement, PointElement, Tooltip, Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, LineElement, PointElement, Tooltip, Legend);

const toDate = (fecha) => {
  if (fecha instanceof Date) return fecha;
  if (typeof fecha === 'string') return new Date(fecha);
  if (fecha && fecha.toDate && typeof fecha.toDate === 'function') return fecha.toDate();
  if (fecha && fecha._seconds) return new Date(fecha._seconds * 1000);
  return new Date();
};

const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

const OvtProyectado = ({ token, apiUrl }) => {
  const [proyecciones, setProyecciones] = useState([]);
  const [registrosReales, setRegistrosReales] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loadingIA, setLoadingIA] = useState(false);

  const hoy = new Date();
  const [filtros, setFiltros] = useState({
    desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10),
    hasta: new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10),
    cliente: 'todos',
    probabilidad: 'todas'
  });

  const cargar = useCallback(async () => {
    try {
      const [resProy, resReg] = await Promise.all([
        axios.get(`${apiUrl}/api/proyecciones`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${apiUrl}/api/registros`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setProyecciones(resProy.data || []);
      setRegistrosReales(resReg.data || []);
    } catch (err) {
      console.error('Error cargando OVT Proyectado:', err.message);
    }
  }, [apiUrl, token]);

  useEffect(() => { cargar(); }, [cargar]);

  // Filtrado
  const dentroDeRango = (fecha) => {
    const f = toDate(fecha);
    return f >= new Date(filtros.desde) && f <= new Date(filtros.hasta + 'T23:59:59');
  };

  const proyeccionesFiltradas = proyecciones.filter(p => {
    if (p.estado === 'descartado') return false;
    if (p.genera_ovt === 'no') return false; // no se considera para sumas/gráficos
    if (!dentroDeRango(p.fechaInicio)) return false;
    if (filtros.cliente !== 'todos' && p.cliente !== filtros.cliente) return false;
    if (filtros.probabilidad !== 'todas' && p.probabilidad !== filtros.probabilidad) return false;
    return true;
  });

  // Para la tabla de detalle SÍ se muestran todas (incluidas las que no generan OVT), marcadas
  const proyeccionesParaTabla = proyecciones.filter(p => {
    if (p.estado === 'descartado') return false;
    if (!dentroDeRango(p.fechaInicio)) return false;
    if (filtros.cliente !== 'todos' && p.cliente !== filtros.cliente) return false;
    if (filtros.probabilidad !== 'todas' && p.probabilidad !== filtros.probabilidad) return false;
    return true;
  });

  const registrosRealesFiltrados = registrosReales.filter(r =>
    r.estado === 'exitoso' && dentroDeRango(r.fechaInicio)
  );

  // KPIs
  const totalProyectado = proyeccionesFiltradas.reduce((s, p) => s + (p.horas || 0), 0);
  const totalAlta = proyeccionesFiltradas.filter(p => p.probabilidad === 'alta').reduce((s, p) => s + (p.horas || 0), 0);
  const totalConfirmado = proyeccionesFiltradas.filter(p => p.estado === 'confirmado').reduce((s, p) => s + (p.horas || 0), 0);
  const totalReal = registrosRealesFiltrados.reduce((s, r) => s + (r.horas || 0), 0);

  // Por semana: proyectado vs real
  const porSemana = {};
  proyeccionesFiltradas.forEach(p => {
    const sk = `S${getWeekNumber(toDate(p.fechaInicio))}`;
    porSemana[sk] = porSemana[sk] || { proyectado: 0, real: 0 };
    porSemana[sk].proyectado += p.horas || 0;
  });
  registrosRealesFiltrados.forEach(r => {
    const sk = `S${getWeekNumber(toDate(r.fechaInicio))}`;
    porSemana[sk] = porSemana[sk] || { proyectado: 0, real: 0 };
    porSemana[sk].real += r.horas || 0;
  });
  const semanasOrdenadas = Object.keys(porSemana).sort();

  const chartSemanal = {
    labels: semanasOrdenadas,
    datasets: [
      { label: 'Proyectado', data: semanasOrdenadas.map(s => porSemana[s].proyectado), backgroundColor: '#93c5fd' },
      { label: 'Real Aprobado', data: semanasOrdenadas.map(s => porSemana[s].real), backgroundColor: '#2563eb' }
    ]
  };

  // Por probabilidad
  const porProbabilidad = { alta: 0, media: 0, baja: 0 };
  proyeccionesFiltradas.forEach(p => { porProbabilidad[p.probabilidad] = (porProbabilidad[p.probabilidad] || 0) + (p.horas || 0); });
  const chartProbabilidad = {
    labels: ['Alta', 'Media', 'Baja'],
    datasets: [{
      data: [porProbabilidad.alta, porProbabilidad.media, porProbabilidad.baja],
      backgroundColor: ['#ef4444', '#f59e0b', '#10b981']
    }]
  };

  // Por Equipo
  const porEquipo = { middleware: 0, operaciones: 0, ambas: 0 };
  proyeccionesFiltradas.forEach(p => { porEquipo[p.especialidad] = (porEquipo[p.especialidad] || 0) + (p.horas || 0); });
  const chartEquipo = {
    labels: ['Middleware', 'Operaciones Cloud', 'Ambas'],
    datasets: [{ data: [porEquipo.middleware, porEquipo.operaciones, porEquipo.ambas], backgroundColor: ['#3266ad', '#73726c', '#ba7517'] }]
  };

  // Por Especialista Asignado
  const porEspecialista = {};
  proyeccionesFiltradas.forEach(p => {
    const nombre = p.especialistaAsignado || 'Sin asignar';
    porEspecialista[nombre] = (porEspecialista[nombre] || 0) + (p.horas || 0);
  });
  const especialistasOrdenados = Object.entries(porEspecialista).sort((a, b) => b[1] - a[1]);
  const chartPorEspecialista = {
    labels: especialistasOrdenados.map(([nombre]) => nombre),
    datasets: [{ label: 'Horas', data: especialistasOrdenados.map(([, h]) => h), backgroundColor: '#1d9e75' }]
  };

  // OVT Proyectada por Día de Semana
  const diasOrden = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sab', 'Dom'];
  const diasNombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sab'];
  const porDiaSemana = { Lun: 0, Mar: 0, Mié: 0, Jue: 0, Vie: 0, Sab: 0, Dom: 0 };
  proyeccionesFiltradas.forEach(p => {
    const dia = diasNombres[toDate(p.fechaInicio).getDay()];
    porDiaSemana[dia] += p.horas || 0;
  });
  const chartPorDiaSemana = {
    labels: diasOrden,
    datasets: [{ label: 'Horas', data: diasOrden.map(d => porDiaSemana[d]), backgroundColor: '#ba7517' }]
  };

  // Distribución de Horario
  const porHorario = { 'Madrugada (00-06h)': 0, 'Mañana (06-12h)': 0, 'Tarde (12-18h)': 0, 'Noche (18-24h)': 0 };
  proyeccionesFiltradas.forEach(p => {
    const h = toDate(p.fechaInicio).getHours();
    if (h < 6) porHorario['Madrugada (00-06h)'] += p.horas || 0;
    else if (h < 12) porHorario['Mañana (06-12h)'] += p.horas || 0;
    else if (h < 18) porHorario['Tarde (12-18h)'] += p.horas || 0;
    else porHorario['Noche (18-24h)'] += p.horas || 0;
  });
  const chartHorario = {
    labels: Object.keys(porHorario),
    datasets: [{ data: Object.values(porHorario), backgroundColor: ['#1e3a8a', '#3266ad', '#f59e0b', '#7c3aed'] }]
  };

  // Evolución Semana a Semana (línea, solo proyectado)
  const chartEvolucion = {
    labels: semanasOrdenadas,
    datasets: [{
      label: 'Horas Proyectadas', data: semanasOrdenadas.map(s => porSemana[s].proyectado),
      borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', borderWidth: 2,
      fill: true, tension: 0.4, pointBackgroundColor: '#2563eb', pointRadius: 5
    }]
  };

  // Concentración por Hora del Día
  const porHora = Array.from({ length: 24 }, () => 0);
  proyeccionesFiltradas.forEach(p => { porHora[toDate(p.fechaInicio).getHours()] += p.horas || 0; });
  const chartPorHora = {
    labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
    datasets: [{ label: 'Horas', data: porHora, backgroundColor: '#73726c' }]
  };

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom', labels: { font: { size: 12 } } },
      tooltip: {
        callbacks: { label: (ctx) => `${ctx.dataset.label || ctx.label}: ${(ctx.raw ?? 0).toFixed(1)}h` }
      }
    },
    scales: { y: { beginAtZero: true } }
  };
  const chartOptionsDoughnut = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom', labels: { font: { size: 12 } } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${(ctx.parsed ?? 0).toFixed(1)}h` } }
    }
  };

  const generarInsights = async () => {
    setLoadingIA(true);
    try {
      const prompt = `Analiza esta proyección de OVT (horas extra estimadas, ingresadas por ITSM) vs lo realmente ejecutado:

Total Proyectado: ${totalProyectado.toFixed(1)}h
Alta probabilidad: ${totalAlta.toFixed(1)}h
Real Aprobado: ${totalReal.toFixed(1)}h
Por semana: ${JSON.stringify(porSemana)}

Genera 3 líneas cortas:
1. [TENDENCIA] patrón notable
2. [ALERTA] si hay sobre/sub-estimación importante (compara proyectado vs real)
3. [RECOMENDACIÓN] acción sugerida

Sé conciso, máximo 80 caracteres por línea.`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 400
        })
      });
      const data = await response.json();
      setInsights(data.choices?.[0]?.message?.content || 'Sin respuesta');
    } catch (err) {
      setInsights('Error generando insights: ' + err.message);
    } finally {
      setLoadingIA(false);
    }
  };

  return (
    <section className="seccion">
      <h2>📅 OVT Proyectado</h2>
      <p style={{ color: '#666', fontSize: '13px', marginTop: '-10px', marginBottom: '20px' }}>
        Estimaciones ingresadas por ITSM — no son horas reales, son posibles casos de overtime.
      </p>

      <div className="filtros-dashboard">
        <div className="form-group">
          <label>Desde</label>
          <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Hasta</label>
          <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Cliente</label>
          <select value={filtros.cliente} onChange={(e) => setFiltros({ ...filtros, cliente: e.target.value })}>
            <option value="todos">Todos</option>
            <option value="Banco de Chile">Banco de Chile</option>
            <option value="Banco Santander">Banco Santander</option>
            <option value="Banco BCI">Banco BCI</option>
            <option value="Banco Estado">Banco Estado</option>
          </select>
        </div>
        <div className="form-group">
          <label>Probabilidad</label>
          <select value={filtros.probabilidad} onChange={(e) => setFiltros({ ...filtros, probabilidad: e.target.value })}>
            <option value="todas">Todas</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card card-blue">
          <h3>📋 Horas Proyectadas</h3>
          <p className="numero">{totalProyectado.toFixed(1)}h</p>
          <p style={{ fontSize: '11px', marginTop: '5px' }}>{proyeccionesFiltradas.length} actividades</p>
        </div>
        <div className="card card-red">
          <h3>🔥 Alta Probabilidad</h3>
          <p className="numero">{totalAlta.toFixed(1)}h</p>
        </div>
        <div className="card card-green">
          <h3>✅ Confirmadas</h3>
          <p className="numero">{totalConfirmado.toFixed(1)}h</p>
        </div>
        <div className="card card-yellow">
          <h3>📊 Proyectado vs Real</h3>
          <p style={{ fontSize: '13px', margin: '4px 0' }}>Proy: <strong>{totalProyectado.toFixed(1)}h</strong></p>
          <p style={{ fontSize: '13px', margin: '4px 0' }}>Real: <strong>{totalReal.toFixed(1)}h</strong></p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px', marginTop: '25px' }}>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px' }}>
          <h4 style={{ marginTop: 0 }}>Tendencia por Semana (Proyectado vs Real)</h4>
          <div style={{ position: 'relative', height: '260px', overflow: 'hidden' }}>
            <Bar data={chartSemanal} options={chartOptions} />
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px' }}>
          <h4 style={{ marginTop: 0 }}>Distribución por Probabilidad</h4>
          <div style={{ position: 'relative', height: '260px', overflow: 'hidden' }}>
            <Doughnut data={chartProbabilidad} options={chartOptionsDoughnut} />
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px' }}>
          <h4 style={{ marginTop: 0 }}>Distribución por Equipo</h4>
          <div style={{ position: 'relative', height: '260px', overflow: 'hidden' }}>
            <Doughnut data={chartEquipo} options={chartOptionsDoughnut} />
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px' }}>
          <h4 style={{ marginTop: 0 }}>Distribución de Horario</h4>
          <div style={{ position: 'relative', height: '260px', overflow: 'hidden' }}>
            <Doughnut data={chartHorario} options={chartOptionsDoughnut} />
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px' }}>
          <h4 style={{ marginTop: 0 }}>OVT Proyectada por Día de Semana</h4>
          <div style={{ position: 'relative', height: '260px', overflow: 'hidden' }}>
            <Bar data={chartPorDiaSemana} options={chartOptions} />
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px' }}>
          <h4 style={{ marginTop: 0 }}>Evolución Semana a Semana</h4>
          <div style={{ position: 'relative', height: '260px', overflow: 'hidden' }}>
            <Line data={chartEvolucion} options={chartOptions} />
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px', marginTop: '20px' }}>
        <h4 style={{ marginTop: 0 }}>Concentración de OVT Proyectada por Hora del Día</h4>
        <div style={{ position: 'relative', height: '260px', overflow: 'hidden' }}>
          <Bar data={chartPorHora} options={chartOptions} />
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px', marginTop: '20px' }}>
        <h4 style={{ marginTop: 0 }}>Distribución por Especialista Asignado</h4>
        <div style={{ position: 'relative', height: `${Math.max(120, especialistasOrdenados.length * 45)}px`, overflow: 'hidden' }}>
          <Bar data={chartPorEspecialista} options={{ ...chartOptions, indexAxis: 'y' }} />
        </div>
      </div>

      <h3 style={{ marginTop: '30px' }}>Detalle de Proyecciones</h3>
      {proyeccionesParaTabla.length === 0 ? (
        <p className="sin-datos">No hay proyecciones para este filtro</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>N° Ticket</th><th>Cliente</th><th>Descripción</th><th>Especialidad</th><th>Especialista Asignado</th>
              <th>Inicio</th><th>Fin</th><th>Horas</th><th>Genera OVT</th><th>Probabilidad</th><th>Estado</th><th>Ingresado por</th>
            </tr>
          </thead>
          <tbody>
            {proyeccionesParaTabla.map(p => (
              <tr key={p.id} style={p.genera_ovt === 'no' ? { opacity: 0.65 } : {}}>
                <td>{p.numeroTicket || '—'}</td>
                <td>{p.cliente}</td>
                <td style={{ maxWidth: '200px', whiteSpace: 'normal', wordBreak: 'break-word' }}>{p.descripcion}</td>
                <td>{p.especialidad}</td>
                <td>{p.especialistaAsignado || 'Sin asignar'}</td>
                <td style={{ fontSize: '12px' }}>{toDate(p.fechaInicio).toLocaleDateString('es-CL')} {String(toDate(p.fechaInicio).getHours()).padStart(2,'0')}:{String(toDate(p.fechaInicio).getMinutes()).padStart(2,'0')}</td>
                <td style={{ fontSize: '12px' }}>{toDate(p.fechaFin).toLocaleDateString('es-CL')} {String(toDate(p.fechaFin).getHours()).padStart(2,'0')}:{String(toDate(p.fechaFin).getMinutes()).padStart(2,'0')}</td>
                <td className="numero">{p.horas}h</td>
                <td>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: '14px', fontSize: '11px', fontWeight: '700',
                    background: p.genera_ovt === 'no' ? '#fee2e2' : '#d1fae5',
                    color: p.genera_ovt === 'no' ? '#991b1b' : '#065f46'
                  }}>
                    {p.genera_ovt === 'no' ? '✗ No' : '✓ Sí'}
                  </span>
                </td>
                <td>
                  <span className={`badge badge-${p.probabilidad === 'alta' ? 'fallido' : p.probabilidad === 'media' ? 'pendiente' : 'exitoso'}`}>
                    {p.probabilidad}
                  </span>
                </td>
                <td>
                  <span className={`badge ${p.estado === 'confirmado' ? 'badge-exitoso' : 'badge-pendiente'}`}>
                    {p.estado}
                  </span>
                </td>
                <td>{p.createdByNombre}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: '25px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '10px', padding: '20px' }}>
        <h4 style={{ marginTop: 0, color: '#4338ca' }}>🤖 IA Insights — Proyección</h4>
        {loadingIA && <p style={{ color: '#666', fontStyle: 'italic' }}>Analizando...</p>}
        {insights && (
          <div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', color: '#3730a3' }}>{insights}</div>
        )}
        {!loadingIA && !insights && (
          <button onClick={generarInsights} className="btn-primary">Generar Análisis IA</button>
        )}
      </div>
    </section>
  );
};

export default OvtProyectado;
