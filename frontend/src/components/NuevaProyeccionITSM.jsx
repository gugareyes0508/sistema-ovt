import React, { useState, useEffect } from 'react';
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

const calcularHoras = (inicio, fin) => {
  if (!inicio || !fin) return 0;
  const diff = (fin - inicio) / (1000 * 60 * 60);
  return Math.max(0, Math.round(diff * 20) / 20);
};

const vacio = {
  tipo: 'cambio',
  cliente: 'Banco de Chile',
  descripcion: '',
  fechaInicio: new Date(),
  fechaFin: new Date(),
  horas: 0,
  interno_cliente: 'cliente',
  genera_ovt: 'si',
  especialidad: 'operaciones',
  especialistaAsignado: '',
  probabilidad: 'media',
  numeroTicket: ''
};

const NuevaProyeccionITSM = ({ token, apiUrl, onGuardado }) => {
  const [form, setForm] = useState(vacio);
  const [especialistas, setEspecialistas] = useState([]);

  useEffect(() => {
    axios.get(`${apiUrl}/api/especialistas`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setEspecialistas(res.data || []))
      .catch(err => console.error('Error cargando especialistas:', err.message));
  }, [apiUrl, token]);

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
      await axios.post(`${apiUrl}/api/proyecciones`, form, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('✓ Proyección guardada');
      setForm(vacio);
      if (onGuardado) onGuardado();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <section className="seccion">
      <h2>📋 Nueva Proyección de OVT</h2>
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
              <option value="incidente">Incidente</option>
              <option value="requerimiento">Requerimiento</option>
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
          <label>Especialista Asignado</label>
          <select value={form.especialistaAsignado} onChange={(e) => setForm({ ...form, especialistaAsignado: e.target.value })}>
            <option value="">Sin asignar</option>
            {especialistas.map(e => (
              <option key={e.nombre} value={e.nombre}>{e.nombre}{e.departamento ? ` (${e.departamento})` : ''}</option>
            ))}
          </select>
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

        <button type="submit" className="btn-primary">✓ Guardar Proyección</button>
      </form>
    </section>
  );
};

export default NuevaProyeccionITSM;
