import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

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

const toDateString = (fecha) => {
  const d = toDate(fecha);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toTimeString = (fecha) => {
  const d = toDate(fecha);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const parseDateDisplay = (fecha) => {
  try {
    return toDate(fecha).toLocaleDateString('es-CL');
  } catch {
    return 'Sin fecha';
  }
};

const calcularHoras = (inicio, fin) => {
  if (!inicio || !fin) return 0;
  const diff = (fin - inicio) / (1000 * 60 * 60);
  return Math.max(0, Math.round(diff * 20) / 20);
};

const ProyeccionesITSM = ({ token, apiUrl, usuario }) => {
  const [proyecciones, setProyecciones] = useState([]);
  const [editandoId, setEditandoId] = useState(null);

  const vacio = {
    tipo: 'cambio',
    cliente: 'Banco de Chile',
    descripcion: '',
    fechaInicio: new Date(),
    fechaFin: new Date(),
    horas: 0,
    interno_cliente: 'interno',
    genera_ovt: 'si',
    especialidad: 'operaciones',
    probabilidad: 'media',
    numeroTicket: ''
  };

  const [form, setForm] = useState(vacio);

  const cargarProyecciones = useCallback(async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/proyecciones`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProyecciones(res.data || []);
    } catch (err) {
      console.error('Error cargando proyecciones:', err.message);
    }
  }, [apiUrl, token]);

  useEffect(() => { cargarProyecciones(); }, [cargarProyecciones]);

  const handleFecha = (campo, valor) => {
    setForm(prev => {
      const nuevo = { ...prev, [campo]: valor };
      if (campo === 'fechaInicio' || campo === 'fechaFin') {
        nuevo.horas = calcularHoras(nuevo.fechaInicio, nuevo.fechaFin);
      }
      return nuevo;
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    try {
      if (editandoId) {
        await axios.patch(`${apiUrl}/api/proyecciones/${editandoId}`, form, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('✓ Proyección actualizada');
        setEditandoId(null);
      } else {
        await axios.post(`${apiUrl}/api/proyecciones`, form, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('✓ Proyección guardada');
      }
      setForm(vacio);
      cargarProyecciones();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
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
      interno_cliente: p.interno_cliente || 'interno',
      genera_ovt: p.genera_ovt || 'si',
      especialidad: p.especialidad || 'operaciones',
      probabilidad: p.probabilidad || 'media',
      numeroTicket: p.numeroTicket || ''
    });
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setForm(vacio);
  };

  const cambiarEstado = async (id, nuevoEstado) => {
    try {
      await axios.patch(`${apiUrl}/api/proyecciones/${id}`, { estado: nuevoEstado }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      cargarProyecciones();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div>
      <section className="seccion" style={{ marginBottom: '30px' }}>
        <h2>📋 {editandoId ? '✏️ Editar Proyección' : 'Nueva Proyección de OVT'}</h2>
        <p style={{ color: '#666', fontSize: '13px', marginTop: '-10px', marginBottom: '20px' }}>
          Mismos campos que el ingreso real de OVT — esto es solo una estimación, no genera horas reales.
        </p>

        <form onSubmit={guardar} className="formulario-mejorado">
          <div className="form-group">
            <label>N° de Ticket</label>
            <input type="text" placeholder="Ej: INC0012345" value={form.numeroTicket}
              onChange={(e) => setForm({ ...form, numeroTicket: e.target.value })} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Tipo de Registro *</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <option value="cambio">Cambio</option>
                <option value="alerta">Alerta</option>
              </select>
            </div>
            <div className="form-group">
              <label>Cliente *</label>
              <select value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })}>
                <option value="Banco de Chile">Banco de Chile</option>
                <option value="Banco Santander">Banco Santander</option>
                <option value="Banco BCI">Banco BCI</option>
                <option value="Banco Estado">Banco Estado</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div className="form-group">
              <label>Especialidad *</label>
              <select value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value })}>
                <option value="operaciones">Operaciones Cloud</option>
                <option value="middleware">Middleware</option>
                <option value="ambas">Ambas</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Descripción de la actividad *</label>
            <textarea
              placeholder="Ej: Posible migración de base de datos cliente X durante el fin de semana"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              required
              rows="3"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Fecha Inicio (tentativa) *</label>
              <input type="date" value={toDateString(form.fechaInicio)}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  const f = new Date(y, m - 1, d, form.fechaInicio.getHours(), form.fechaInicio.getMinutes());
                  handleFecha('fechaInicio', f);
                }} />
            </div>
            <div className="form-group">
              <label>Hora Inicio (tentativa) *</label>
              <input type="time" value={toTimeString(form.fechaInicio)}
                onChange={(e) => {
                  const [h, mi] = e.target.value.split(':');
                  const f = new Date(form.fechaInicio);
                  f.setHours(parseInt(h), parseInt(mi));
                  handleFecha('fechaInicio', f);
                }} />
            </div>
            <div className="form-group">
              <label>Fecha Fin (tentativa) *</label>
              <input type="date" value={toDateString(form.fechaFin)}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  const f = new Date(y, m - 1, d, form.fechaFin.getHours(), form.fechaFin.getMinutes());
                  handleFecha('fechaFin', f);
                }} />
            </div>
            <div className="form-group">
              <label>Hora Fin (tentativa) *</label>
              <input type="time" value={toTimeString(form.fechaFin)}
                onChange={(e) => {
                  const [h, mi] = e.target.value.split(':');
                  const f = new Date(form.fechaFin);
                  f.setHours(parseInt(h), parseInt(mi));
                  handleFecha('fechaFin', f);
                }} />
            </div>
            <div className="form-group">
              <label>Horas (calculado automáticamente)</label>
              <input type="number" value={form.horas} disabled className="input-disabled" step="0.05" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Interno / Cliente</label>
              <select value={form.interno_cliente} onChange={(e) => setForm({ ...form, interno_cliente: e.target.value })}>
                <option value="interno">Interno</option>
                <option value="cliente">Cliente</option>
              </select>
            </div>
            <div className="form-group">
              <label>¿Generaría OVT?</label>
              <select value={form.genera_ovt} onChange={(e) => setForm({ ...form, genera_ovt: e.target.value })}>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '8px', padding: '14px' }}>
            <label style={{ color: '#92400e', fontWeight: '700' }}>⭐ Probabilidad de ocurrencia *</label>
            <select value={form.probabilidad} onChange={(e) => setForm({ ...form, probabilidad: e.target.value })} required>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>

          <button type="submit" className="btn-primary">
            {editandoId ? '✏️ Actualizar Proyección' : '✓ Guardar Proyección'}
          </button>
          {editandoId && (
            <button type="button" onClick={cancelarEdicion} className="btn-cancelar">✗ Cancelar</button>
          )}
        </form>
      </section>

      <section className="seccion">
        <h2>📊 Mis Proyecciones</h2>
        <p style={{ color: '#666', fontSize: '13px', marginTop: '-10px', marginBottom: '20px' }}>
          Puedes editar o descartar tus proyecciones en cualquier momento. Descartar es reversible.
        </p>

        {proyecciones.length === 0 ? (
          <p className="sin-datos">Aún no has registrado proyecciones</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>N° Ticket</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th>Descripción</th>
                <th>Especialidad</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Horas Est.</th>
                <th>Probabilidad</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {proyecciones.map(p => (
                <tr key={p.id} style={p.estado === 'descartado' ? { opacity: 0.55 } : {}}>
                  <td>{p.numeroTicket || '—'}</td>
                  <td>{p.tipo}</td>
                  <td>{p.cliente}</td>
                  <td style={{ maxWidth: '200px', whiteSpace: 'normal', wordBreak: 'break-word' }}>{p.descripcion}</td>
                  <td>{p.especialidad}</td>
                  <td style={{ fontSize: '12px' }}>{parseDateDisplay(p.fechaInicio)} {toTimeString(toDate(p.fechaInicio))}</td>
                  <td style={{ fontSize: '12px' }}>{parseDateDisplay(p.fechaFin)} {toTimeString(toDate(p.fechaFin))}</td>
                  <td className="numero">{p.horas}h</td>
                  <td>
                    <span className={`badge badge-${p.probabilidad === 'alta' ? 'fallido' : p.probabilidad === 'media' ? 'pendiente' : 'exitoso'}`}>
                      {p.probabilidad === 'alta' ? 'Alta' : p.probabilidad === 'media' ? 'Media' : 'Baja'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${p.estado === 'descartado' ? 'badge-fallido' : p.estado === 'confirmado' ? 'badge-exitoso' : 'badge-pendiente'}`}>
                      {p.estado === 'descartado' ? 'Descartado' : p.estado === 'confirmado' ? 'Confirmado' : 'Proyectado'}
                    </span>
                  </td>
                  <td className="acciones">
                    <button className="btn-editar" onClick={() => editar(p)} title="Editar">✏️ Editar</button>
                    {p.estado === 'descartado' ? (
                      <button className="btn-aprobar" onClick={() => cambiarEstado(p.id, 'proyectado')} title="Restaurar">↩️ Restaurar</button>
                    ) : (
                      <button className="btn-rechazar" onClick={() => cambiarEstado(p.id, 'descartado')} title="Descartar">✗ Descartar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

export default ProyeccionesITSM;
