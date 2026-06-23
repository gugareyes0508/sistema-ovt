import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, LineElement, PointElement, Tooltip, Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, LineElement, PointElement, Tooltip, Legend);

const toDate = (fecha) => {
  if (fecha instanceof Date) return fecha;
  if (typeof fecha === 'string') {
    if (fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = fecha.split('-').map(Number);
      return new Date(year, month - 1, day, 0, 0, 0);
    }
    return new Date(fecha);
  }
  if (fecha && fecha.toDate && typeof fecha.toDate === 'function') return fecha.toDate();
  if (fecha && fecha._seconds) return new Date(fecha._seconds * 1000);
  return new Date();
};

const toTimeString = (fecha) => {
  const d = toDate(fecha);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const toDateString = (fecha) => {
  const d = toDate(fecha);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const calcularHorasModal = (inicio, fin) => {
  if (!inicio || !fin) return 0;
  const diff = (fin - inicio) / (1000 * 60 * 60);
  return Math.max(0, Math.round(diff * 20) / 20);
};

const parseDateDisplay = (fecha) => {
  try { return toDate(fecha).toLocaleDateString('es-CL'); } catch { return 'Sin fecha'; }
};

const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

const MisProyeccionesITSM = ({ token, apiUrl }) => {
  const [proyecciones, setProyecciones] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(null);

  const hoy = new Date();
  const [filtros, setFiltros] = useState({
    desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10),
    hasta: new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10),
    probabilidad: 'todas'
  });

  const cargar = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/proyecciones`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProyecciones(res.data || []);
    } catch (err) {
      console.error('Error cargando proyecciones:', err.message);
    }
  }, [apiUrl, token]);

  useEffect(() => { cargar(); }, [cargar]);

  const dentroDeRango = (fecha) => {
    const f = toDate(fecha);
    return f >= new Date(filtros.desde) && f <= new Date(filtros.hasta + 'T23:59:59');
  };

  const filtradas = proyecciones.filter(p => {
    if (p.estado === 'descartado') return false;
    if (p.genera_ovt === 'no') return false; // no se considera para sumas/gráficos
    if (!dentroDeRango(p.fechaInicio)) return false;
    if (filtros.probabilidad !== 'todas' && p.probabilidad !== filtros.probabilidad) return false;
    return true;
  });

  const todasParaTabla = proyecciones.filter(p => dentroDeRango(p.fechaInicio));

  const totalProyectado = filtradas.reduce((s, p) => s + (p.horas || 0), 0);
  const totalAlta = filtradas.filter(p => p.probabilidad === 'alta').reduce((s, p) => s + (p.horas || 0), 0);

  const porSemana = {};
  filtradas.forEach(p => {
    const sk = `S${getWeekNumber(toDate(p.fechaInicio))}`;
    porSemana[sk] = (porSemana[sk] || 0) + (p.horas || 0);
  });
  const semanasOrdenadas = Object.keys(porSemana).sort();
  const chartSemanal = {
    labels: semanasOrdenadas,
    datasets: [{ label: 'Horas Proyectadas', data: semanasOrdenadas.map(s => porSemana[s]), backgroundColor: '#2563eb' }]
  };

  const porEquipo = { middleware: 0, operaciones: 0, ambas: 0 };
  filtradas.forEach(p => { porEquipo[p.especialidad] = (porEquipo[p.especialidad] || 0) + (p.horas || 0); });
  const chartEquipo = {
    labels: ['Middleware', 'Operaciones Cloud', 'Ambas'],
    datasets: [{
      data: [porEquipo.middleware, porEquipo.operaciones, porEquipo.ambas],
      backgroundColor: ['#3266ad', '#73726c', '#ba7517']
    }]
  };

  // Distribución por especialista asignado
  const porEspecialista = {};
  filtradas.forEach(p => {
    const nombre = p.especialistaAsignado || 'Sin asignar';
    porEspecialista[nombre] = (porEspecialista[nombre] || 0) + (p.horas || 0);
  });
  const especialistasOrdenados = Object.entries(porEspecialista).sort((a, b) => b[1] - a[1]);
  const chartPorEspecialista = {
    labels: especialistasOrdenados.map(([nombre]) => nombre),
    datasets: [{ label: 'Horas', data: especialistasOrdenados.map(([, h]) => h), backgroundColor: '#1d9e75' }]
  };

  // Distribución por Probabilidad
  const porProbabilidad = { alta: 0, media: 0, baja: 0 };
  filtradas.forEach(p => { porProbabilidad[p.probabilidad] = (porProbabilidad[p.probabilidad] || 0) + (p.horas || 0); });
  const chartProbabilidad = {
    labels: ['Alta', 'Media', 'Baja'],
    datasets: [{ data: [porProbabilidad.alta, porProbabilidad.media, porProbabilidad.baja], backgroundColor: ['#ef4444', '#f59e0b', '#10b981'] }]
  };

  // OVT Proyectada por Día de Semana
  const diasOrden = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sab', 'Dom'];
  const diasNombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sab'];
  const porDiaSemana = { Lun: 0, Mar: 0, Mié: 0, Jue: 0, Vie: 0, Sab: 0, Dom: 0 };
  filtradas.forEach(p => {
    const dia = diasNombres[toDate(p.fechaInicio).getDay()];
    porDiaSemana[dia] += p.horas || 0;
  });
  const chartPorDiaSemana = {
    labels: diasOrden,
    datasets: [{ label: 'Horas', data: diasOrden.map(d => porDiaSemana[d]), backgroundColor: '#ba7517' }]
  };

  // Distribución de Horario (Madrugada/Mañana/Tarde/Noche)
  const porHorario = { 'Madrugada (00-06h)': 0, 'Mañana (06-12h)': 0, 'Tarde (12-18h)': 0, 'Noche (18-24h)': 0 };
  filtradas.forEach(p => {
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

  // Evolución Semana a Semana (línea)
  const chartEvolucion = {
    labels: semanasOrdenadas,
    datasets: [{
      label: 'Horas Proyectadas', data: semanasOrdenadas.map(s => porSemana[s]),
      borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', borderWidth: 2,
      fill: true, tension: 0.4, pointBackgroundColor: '#2563eb', pointRadius: 5
    }]
  };

  // Concentración por Hora del Día
  const porHora = Array.from({ length: 24 }, () => 0);
  filtradas.forEach(p => { porHora[toDate(p.fechaInicio).getHours()] += p.horas || 0; });
  const chartPorHora = {
    labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
    datasets: [{ label: 'Horas', data: porHora, backgroundColor: '#73726c' }]
  };

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => `${(ctx.raw ?? 0).toFixed(1)}h` } }
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

  const editar = (p) => {
    setEditandoId(p.id);
    setForm({
      tipo: p.tipo || 'cambio',
      cliente: p.cliente || 'Banco de Chile',
      descripcion: p.descripcion || '',
      fechaInicio: toDate(p.fechaInicio),
      fechaFin: toDate(p.fechaFin),
      horas: p.horas || 0,
      especialidad: p.especialidad || 'operaciones',
      especialistaAsignado: p.especialistaAsignado || '',
      interno_cliente: p.interno_cliente || 'interno',
      genera_ovt: p.genera_ovt || 'si',
      probabilidad: p.probabilidad || 'media',
      numeroTicket: p.numeroTicket || ''
    });
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      await axios.patch(`${apiUrl}/api/proyecciones/${editandoId}`, form, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('✓ Proyección actualizada');
      setEditandoId(null);
      setForm(null);
      cargar();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const cambiarEstado = async (id, nuevoEstado) => {
    try {
      await axios.patch(`${apiUrl}/api/proyecciones/${id}`, { estado: nuevoEstado }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      cargar();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <section className="seccion">
      <h2>📊 Mis Proyecciones</h2>
      <p style={{ color: '#666', fontSize: '13px', marginTop: '-10px', marginBottom: '20px' }}>
        Puedes editar o descartar tus proyecciones en cualquier momento. Descartar es reversible.
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
          <p style={{ fontSize: '11px', marginTop: '5px' }}>{filtradas.length} actividades</p>
        </div>
        <div className="card card-red">
          <h3>🔥 Alta Probabilidad</h3>
          <p className="numero">{totalAlta.toFixed(1)}h</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '25px' }}>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px', minWidth: 0 }}>
          <h4 style={{ marginTop: 0, marginBottom: '16px' }}>Tendencia por Semana</h4>
          <div style={{ position: 'relative', height: '240px', overflow: 'hidden' }}>
            <Bar data={chartSemanal} options={chartOptions} />
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px', minWidth: 0 }}>
          <h4 style={{ marginTop: 0, marginBottom: '16px' }}>Distribución por Probabilidad</h4>
          <div style={{ position: 'relative', height: '240px', overflow: 'hidden' }}>
            <Doughnut data={chartProbabilidad} options={chartOptionsDoughnut} />
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px', minWidth: 0 }}>
          <h4 style={{ marginTop: 0, marginBottom: '16px' }}>Distribución por Equipo</h4>
          <div style={{ position: 'relative', height: '240px', overflow: 'hidden' }}>
            <Doughnut data={chartEquipo} options={chartOptionsDoughnut} />
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px', minWidth: 0 }}>
          <h4 style={{ marginTop: 0, marginBottom: '16px' }}>Distribución de Horario</h4>
          <div style={{ position: 'relative', height: '240px', overflow: 'hidden' }}>
            <Doughnut data={chartHorario} options={chartOptionsDoughnut} />
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px', minWidth: 0 }}>
          <h4 style={{ marginTop: 0, marginBottom: '16px' }}>OVT Proyectada por Día de Semana</h4>
          <div style={{ position: 'relative', height: '240px', overflow: 'hidden' }}>
            <Bar data={chartPorDiaSemana} options={chartOptions} />
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px', minWidth: 0 }}>
          <h4 style={{ marginTop: 0, marginBottom: '16px' }}>Evolución Semana a Semana</h4>
          <div style={{ position: 'relative', height: '240px', overflow: 'hidden' }}>
            <Line data={chartEvolucion} options={chartOptions} />
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px', marginTop: '20px' }}>
        <h4 style={{ marginTop: 0, marginBottom: '16px' }}>Concentración de OVT Proyectada por Hora del Día</h4>
        <div style={{ position: 'relative', height: '260px', overflow: 'hidden' }}>
          <Bar data={chartPorHora} options={chartOptions} />
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px', marginTop: '20px' }}>
        <h4 style={{ marginTop: 0, marginBottom: '16px' }}>Distribución por Especialista Asignado</h4>
        <div style={{ position: 'relative', height: `${Math.max(120, especialistasOrdenados.length * 45)}px`, overflow: 'hidden' }}>
          <Bar data={chartPorEspecialista} options={{ ...chartOptions, indexAxis: 'y' }} />
        </div>
      </div>

      {editandoId && form && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', padding: '30px', borderRadius: '12px', zIndex: 9999, width: '95%', maxWidth: '600px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
          <h2 style={{ marginTop: 0, marginBottom: '20px' }}>✏️ Editar Proyección</h2>

          <form onSubmit={guardarEdicion}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>N° de Ticket</label>
              <input type="text" value={form.numeroTicket} onChange={(e) => setForm({ ...form, numeroTicket: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Tipo *</label>
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }}>
                  <option value="cambio">Cambio</option>
                  <option value="alerta">Alerta</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Cliente *</label>
                <select value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }}>
                  <option value="Banco de Chile">Banco de Chile</option>
                  <option value="Banco Santander">Banco Santander</option>
                  <option value="Banco BCI">Banco BCI</option>
                  <option value="Banco Estado">Banco Estado</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Descripción *</label>
              <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                style={{ width: '100%', minHeight: '80px', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontFamily: 'inherit', fontSize: '14px' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Fecha Inicio *</label>
                <input type="date" value={toDateString(form.fechaInicio)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    const f = new Date(y, m - 1, d, form.fechaInicio.getHours(), form.fechaInicio.getMinutes());
                    const horas = calcularHorasModal(f, form.fechaFin);
                    setForm({ ...form, fechaInicio: f, horas });
                  }}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Hora Inicio *</label>
                <input type="time" value={toTimeString(form.fechaInicio)}
                  onChange={(e) => {
                    const [h, mi] = e.target.value.split(':');
                    const f = new Date(form.fechaInicio);
                    f.setHours(parseInt(h), parseInt(mi));
                    const horas = calcularHorasModal(f, form.fechaFin);
                    setForm({ ...form, fechaInicio: f, horas });
                  }}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Fecha Fin *</label>
                <input type="date" value={toDateString(form.fechaFin)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    const f = new Date(y, m - 1, d, form.fechaFin.getHours(), form.fechaFin.getMinutes());
                    const horas = calcularHorasModal(form.fechaInicio, f);
                    setForm({ ...form, fechaFin: f, horas });
                  }}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Hora Fin *</label>
                <input type="time" value={toTimeString(form.fechaFin)}
                  onChange={(e) => {
                    const [h, mi] = e.target.value.split(':');
                    const f = new Date(form.fechaFin);
                    f.setHours(parseInt(h), parseInt(mi));
                    const horas = calcularHorasModal(form.fechaInicio, f);
                    setForm({ ...form, fechaFin: f, horas });
                  }}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }} />
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Horas (Calculadas Automáticamente)</label>
              <input type="number" value={form.horas} disabled
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', background: '#f5f5f5', color: '#999', fontSize: '14px' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Especialidad *</label>
                <select value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }}>
                  <option value="middleware">Middleware</option>
                  <option value="operaciones">Operaciones Cloud</option>
                  <option value="ambas">Ambas</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Especialista Asignado</label>
                <select value={form.especialistaAsignado} onChange={(e) => setForm({ ...form, especialistaAsignado: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }}>
                  <option value="">Sin asignar</option>
                  <option value="Jorge Maureira">Jorge Maureira</option>
                  <option value="Jhon Estrada">Jhon Estrada</option>
                  <option value="Luis Vasquez">Luis Vasquez</option>
                  <option value="Moises Junco">Moises Junco</option>
                  <option value="Benjamín Fierro">Benjamín Fierro</option>
                  <option value="Ariel Garate">Ariel Garate</option>
                  <option value="Cristian Madariaga">Cristian Madariaga</option>
                  <option value="Miguel Martinez">Miguel Martinez</option>
                  <option value="Fabian Tobar">Fabian Tobar</option>
                  <option value="Gustavo Perolo">Gustavo Perolo</option>
                  <option value="Leonardo Silva">Leonardo Silva</option>
                  <option value="Cristian Lecaros">Cristian Lecaros</option>
                  <option value="Rodrigo Escobedo">Rodrigo Escobedo</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>⭐ Probabilidad *</label>
                <select value={form.probabilidad} onChange={(e) => setForm({ ...form, probabilidad: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #fbbf24', background: '#fef3c7', fontSize: '14px' }}>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                type="submit"
                style={{ flex: 1, padding: '12px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
              >
                ✅ Guardar Cambios
              </button>
              <button
                type="button"
                onClick={() => { setEditandoId(null); setForm(null); }}
                style={{ flex: 1, padding: '12px', background: '#999', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}
              >
                ✗ Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <h3 style={{ marginTop: '30px' }}>Detalle</h3>
      {todasParaTabla.length === 0 ? (
        <p className="sin-datos">No hay proyecciones para este período</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>N° Ticket</th><th>Cliente</th><th>Descripción</th><th>Especialidad</th><th>Especialista Asignado</th>
              <th>Inicio</th><th>Fin</th><th>Horas</th><th>Genera OVT</th><th>Probabilidad</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {todasParaTabla.map(p => (
              <tr key={p.id} style={p.estado === 'descartado' ? { opacity: 0.55 } : {}}>
                <td>{p.numeroTicket || '—'}</td>
                <td>{p.cliente}</td>
                <td style={{ maxWidth: '200px', whiteSpace: 'normal', wordBreak: 'break-word' }}>{p.descripcion}</td>
                <td>{p.especialidad}</td>
                <td>{p.especialistaAsignado || 'Sin asignar'}</td>
                <td style={{ fontSize: '12px' }}>{parseDateDisplay(p.fechaInicio)} {toTimeString(p.fechaInicio)}</td>
                <td style={{ fontSize: '12px' }}>{parseDateDisplay(p.fechaFin)} {toTimeString(p.fechaFin)}</td>
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
                  <span className={`badge ${p.estado === 'descartado' ? 'badge-fallido' : p.estado === 'confirmado' ? 'badge-exitoso' : 'badge-pendiente'}`}>
                    {p.estado}
                  </span>
                </td>
                <td className="acciones">
                  <button className="btn-editar" onClick={() => editar(p)}>✏️ Editar</button>
                  {p.estado === 'descartado' ? (
                    <button className="btn-aprobar" onClick={() => cambiarEstado(p.id, 'proyectado')}>↩️ Restaurar</button>
                  ) : (
                    <button className="btn-rechazar" onClick={() => cambiarEstado(p.id, 'descartado')}>✗ Descartar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};

export default MisProyeccionesITSM;
