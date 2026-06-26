import React, { useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

const normalizarTexto = (txt) =>
  String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const calcularHoras = (inicio, fin) => {
  if (!inicio || !fin || isNaN(inicio.getTime()) || isNaN(fin.getTime())) return 0;
  const diff = (fin - inicio) / (1000 * 60 * 60);
  return Math.max(0, Math.round(diff * 20) / 20);
};

const parseFechaCelda = (valor) => {
  if (!valor) return null;
  if (valor instanceof Date && !isNaN(valor.getTime())) return valor;
  const texto = String(valor).trim();
  const match = texto.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  }
  const intento = new Date(texto);
  return isNaN(intento.getTime()) ? null : intento;
};

const parseHoraCelda = (valor) => {
  if (valor === undefined || valor === null || valor === '' || valor === '-') return null;
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return { h: valor.getHours(), m: valor.getMinutes() };
  }
  if (typeof valor === 'number') {
    const totalMin = Math.round(valor * 24 * 60);
    return { h: Math.floor(totalMin / 60) % 24, m: totalMin % 60 };
  }
  const texto = String(valor).trim();
  const match = texto.match(/^(\d{1,2}):(\d{2})/);
  if (match) return { h: parseInt(match[1]), m: parseInt(match[2]) };
  return null;
};

const combinarFechaHora = (fechaBase, hora) => {
  const f = new Date(fechaBase);
  f.setHours(hora.h, hora.m, 0, 0);
  return f;
};

// Categoriza según el prefijo del N° de Ticket (ALERT/CHG/INC/RITM).
// Si el ticket no trae un prefijo reconocible (ej: "XXXXX"), usa palabras clave de la descripción como respaldo.
const inferirTipo = (ticket, descripcion) => {
  const t = String(ticket || '').trim().toUpperCase();
  if (t.startsWith('ALERT')) return 'alerta';
  if (t.startsWith('CHG')) return 'cambio';
  if (t.startsWith('INC')) return 'incidente';
  if (t.startsWith('RITM')) return 'requerimiento';

  const txt = normalizarTexto(descripcion);
  if (txt.includes('incidente')) return 'incidente';
  if (txt.includes('alerta') || txt.includes('falla')) return 'alerta';
  if (txt.includes('requerimiento')) return 'requerimiento';
  return 'cambio';
};

const encontrarColumna = (headers, posibles) => {
  const normalizados = headers.map(normalizarTexto);
  for (const candidato of posibles) {
    const idx = normalizados.findIndex(h => h.includes(candidato));
    if (idx !== -1) return idx;
  }
  return -1;
};

const ExcelUpload = ({ token, apiUrl, usuario, onUploadComplete }) => {
  const [archivo, setArchivo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [resultados, setResultados] = useState(null);

  const [opciones, setOpciones] = useState({
    cliente: 'Banco de Chile',
    especialidad: 'operaciones',
    interno_cliente: 'cliente',
    genera_ovt: 'si'
  });

  const procesarArchivo = async () => {
    if (!archivo) return;
    setCargando(true);
    setResultados(null);

    try {
      const data = await archivo.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const nombreHoja = wb.SheetNames[0];
      const sheet = wb.Sheets[nombreHoja];
      const filas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (filas.length < 2) {
        throw new Error('El archivo no tiene filas de datos');
      }

      const headers = filas[0];
      const idxFecha = encontrarColumna(headers, ['fecha']);
      const idxTicket = encontrarColumna(headers, ['chg', 'ritm', 'ticket', 'n ticket', 'n° ticket']);
      const idxDescripcion = encontrarColumna(headers, ['detalle', 'descripcion']);
      const idxHoraInicio = encontrarColumna(headers, ['hora de inicio', 'hora inicio', 'inicio']);
      const idxHoraFin = encontrarColumna(headers, ['hora de termino', 'hora de término', 'hora termino', 'hora fin', 'termino', 'término']);

      if (idxFecha === -1 || idxDescripcion === -1 || idxHoraInicio === -1 || idxHoraFin === -1) {
        throw new Error(
          'No se encontraron las columnas esperadas (Fecha, Detalle de actividad, Hora de Inicio, Hora de Termino). ' +
          'Revisa que tu planilla tenga esos encabezados en la primera fila.'
        );
      }

      const filasDatos = filas.slice(1);
      const resultadosFilas = [];

      for (let i = 0; i < filasDatos.length; i++) {
        const fila = filasDatos[i];
        const numFilaExcel = i + 2;

        const fechaRaw = fila[idxFecha];
        const ticketRaw = idxTicket !== -1 ? fila[idxTicket] : '';
        const descripcionRaw = fila[idxDescripcion];
        const horaInicioRaw = fila[idxHoraInicio];
        const horaFinRaw = fila[idxHoraFin];

        const sinActividad =
          !descripcionRaw || String(descripcionRaw).trim() === '' ||
          horaInicioRaw === '-' || horaFinRaw === '-' ||
          parseHoraCelda(horaInicioRaw) === null || parseHoraCelda(horaFinRaw) === null;

        if (sinActividad) continue;

        try {
          const fechaBase = parseFechaCelda(fechaRaw);
          if (!fechaBase) throw new Error('Fecha inválida');

          const horaInicio = parseHoraCelda(horaInicioRaw);
          const horaFin = parseHoraCelda(horaFinRaw);

          const fechaInicio = combinarFechaHora(fechaBase, horaInicio);
          let fechaFin = combinarFechaHora(fechaBase, horaFin);

          if (fechaFin <= fechaInicio) {
            fechaFin = new Date(fechaFin.getTime() + 24 * 60 * 60 * 1000);
          }

          const horas = calcularHoras(fechaInicio, fechaFin);
          const descripcion = String(descripcionRaw).trim();

          const payload = {
            numeroTicket: ticketRaw ? String(ticketRaw).trim() : '',
            tipo: inferirTipo(ticketRaw, descripcion),
            descripcion,
            cliente: opciones.cliente,
            fechaInicio,
            fechaFin,
            horas,
            especialista: usuario.nombre || '',
            interno_cliente: opciones.interno_cliente,
            genera_ovt: opciones.genera_ovt,
            estado: 'pendiente',
            especialidad: opciones.especialidad
          };

          await axios.post(`${apiUrl}/api/registros`, payload, {
            headers: { Authorization: `Bearer ${token}` }
          });

          resultadosFilas.push({ fila: numFilaExcel, exito: true, ticket: payload.numeroTicket || '—', descripcion, horas });
        } catch (err) {
          resultadosFilas.push({
            fila: numFilaExcel,
            exito: false,
            ticket: ticketRaw || '—',
            descripcion: descripcionRaw || '(sin descripción)',
            error: err.response?.data?.error || err.message
          });
        }
      }

      setResultados(resultadosFilas);
      if (onUploadComplete) onUploadComplete();
    } catch (err) {
      alert('Error leyendo el archivo Excel: ' + err.message);
    } finally {
      setCargando(false);
    }
  };

  const exitosos = resultados ? resultados.filter(r => r.exito).length : 0;
  const fallidos = resultados ? resultados.filter(r => !r.exito).length : 0;

  return (
    <div>
      <p style={{ color: '#666', fontSize: '13px', marginBottom: '20px' }}>
        Sube directamente tu planilla de seguimiento actual (la misma que ya usas, con columnas
        <strong> Fecha, CHG/RITM/Otro, Detalle de actividad, Hora de Inicio, Hora de Termino</strong>).
        No necesitas cambiar tu formato — el sistema detecta esas columnas automáticamente y omite las filas sin horario (con "-").
      </p>

      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, fontSize: '15px' }}>Datos que tu planilla no incluye (se aplican a todas las filas)</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Cliente</label>
            <select value={opciones.cliente} onChange={(e) => setOpciones({ ...opciones, cliente: e.target.value })}>
              <option value="Banco de Chile">Banco de Chile</option>
              <option value="Banco Santander">Banco Santander</option>
              <option value="Banco BCI">Banco BCI</option>
              <option value="Banco Estado">Banco Estado</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
          <div className="form-group">
            <label>Especialidad</label>
            <select value={opciones.especialidad} onChange={(e) => setOpciones({ ...opciones, especialidad: e.target.value })}>
              <option value="operaciones">Operaciones Cloud</option>
              <option value="middleware">Middleware</option>
              <option value="ambas">Ambas</option>
            </select>
          </div>
          <div className="form-group">
            <label>Interno/Cliente</label>
            <select value={opciones.interno_cliente} onChange={(e) => setOpciones({ ...opciones, interno_cliente: e.target.value })}>
              <option value="cliente">Cliente</option>
              <option value="interno">Interno</option>
            </select>
          </div>
          <div className="form-group">
            <label>¿Genera OVT?</label>
            <select value={opciones.genera_ovt} onChange={(e) => setOpciones({ ...opciones, genera_ovt: e.target.value })}>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
        <small style={{ color: '#999' }}>
          El "Tipo" se detecta automáticamente según el prefijo de tu N° de Ticket: <strong>ALERT</strong> → Alerta, <strong>CHG</strong> → Cambio, <strong>INC</strong> → Incidente, <strong>RITM</strong> → Requerimiento. Si el ticket no calza con ninguno (ej: "XXXXX"), se usa la descripción como respaldo.
        </small>
      </div>

      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, fontSize: '15px' }}>Sube tu planilla (.xlsx)</h3>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setArchivo(e.target.files[0])}
          style={{ marginBottom: '14px', display: 'block' }}
        />
        <button
          onClick={procesarArchivo}
          disabled={!archivo || cargando}
          className="btn-primary"
          style={{ opacity: !archivo || cargando ? 0.5 : 1, cursor: !archivo || cargando ? 'not-allowed' : 'pointer' }}
        >
          {cargando ? '⏳ Procesando...' : '🚀 Cargar Registros'}
        </button>
      </div>

      {resultados && (
        <div>
          <div className="dashboard-grid" style={{ marginBottom: '20px' }}>
            <div className="card card-blue">
              <h3>📋 Filas Procesadas</h3>
              <p className="numero">{resultados.length}</p>
            </div>
            <div className="card card-green">
              <h3>✅ Exitosas</h3>
              <p className="numero">{exitosos}</p>
            </div>
            <div className="card card-red">
              <h3>❌ Fallidas</h3>
              <p className="numero">{fallidos}</p>
            </div>
          </div>

          <h3>Detalle por fila</h3>
          <table className="tabla">
            <thead>
              <tr>
                <th>Fila Excel</th>
                <th>Ticket</th>
                <th>Descripción</th>
                <th>Horas</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((r) => (
                <tr key={r.fila}>
                  <td>{r.fila}</td>
                  <td>{r.ticket}</td>
                  <td style={{ maxWidth: '300px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    {String(r.descripcion).substring(0, 70)}
                  </td>
                  <td>{r.horas ?? '—'}</td>
                  <td>
                    {r.exito ? (
                      <span className="badge badge-exitoso">✅ Cargada (pendiente de aprobación)</span>
                    ) : (
                      <span className="badge badge-fallido" title={r.error}>❌ {r.error}</span>
                    )}
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

export default ExcelUpload;
