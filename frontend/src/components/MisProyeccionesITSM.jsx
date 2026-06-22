import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

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
      descripcion: p.descripcion || '',
      horas: p.horas || 0,
      probabilidad: p.probabilidad || 'media'
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px', marginTop: '25px' }}>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px' }}>
          <h4 style={{ marginTop: 0 }}>Tendencia por Semana</h4>
          <div style={{ position: 'relative', height: '260px', overflow: 'hidden' }}>
            <Bar data={chartSemanal} options={chartOptions} />
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '20px' }}>
          <h4 style={{ marginTop: 0 }}>Distribución por Equipo</h4>
          <div style={{ position: 'relative', height: '260px', overflow: 'hidden' }}>
            <Doughnut data={chartEquipo} options={chartOptionsDoughnut} />
          </div>
        </div>
      </div>

      {editandoId && form && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', padding: '30px', borderRadius: '12px', zIndex: 9999, width: '95%', maxWidth: '500px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
          <h2 style={{ marginTop: 0 }}>✏️ Editar Proyección</h2>
          <form onSubmit={guardarEdicion}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Descripción</label>
              <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                style={{ width: '100%', minHeight: '70px', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Horas estimadas</label>
                <input type="number" step="0.05" value={form.horas}
                  onChange={(e) => setForm({ ...form, horas: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px' }}>Probabilidad</label>
                <select value={form.probabilidad} onChange={(e) => setForm({ ...form, probabilidad: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn-primary" style={{ flex: 1 }}>Guardar Cambios</button>
              <button type="button" className="btn-cancelar" style={{ flex: 1 }} onClick={() => { setEditandoId(null); setForm(null); }}>Cancelar</button>
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
              <th>N° Ticket</th><th>Cliente</th><th>Descripción</th><th>Especialidad</th>
              <th>Inicio</th><th>Fin</th><th>Horas</th><th>Probabilidad</th><th>Estado</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {todasParaTabla.map(p => (
              <tr key={p.id} style={p.estado === 'descartado' ? { opacity: 0.55 } : {}}>
                <td>{p.numeroTicket || '—'}</td>
                <td>{p.cliente}</td>
                <td style={{ maxWidth: '200px', whiteSpace: 'normal', wordBreak: 'break-word' }}>{p.descripcion}</td>
                <td>{p.especialidad}</td>
                <td style={{ fontSize: '12px' }}>{parseDateDisplay(p.fechaInicio)} {toTimeString(p.fechaInicio)}</td>
                <td style={{ fontSize: '12px' }}>{parseDateDisplay(p.fechaFin)} {toTimeString(p.fechaFin)}</td>
                <td className="numero">{p.horas}h</td>
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
