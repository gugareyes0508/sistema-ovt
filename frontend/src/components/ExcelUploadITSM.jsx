import React, { useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

// ============================================
// Helpers de fecha/hora
// ============================================

const calcularHoras = (inicio, fin) => {
  if (!inicio || !fin || isNaN(inicio.getTime()) || isNaN(fin.getTime())) return 0;
  const diff = (fin - inicio) / (1000 * 60 * 60);
  return Math.max(0, Math.round(diff * 20) / 20);
};

// Acepta Date (si Excel ya trae la celda como fecha) o texto "DD-MM-AAAA" / "DD/MM/AAAA"
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

// Acepta texto "HH:MM" o fracción de día (cuando Excel guarda la hora como número decimal)
const parseHoraCelda = (valor) => {
  if (valor === undefined || valor === null || valor === '') return { h: 0, m: 0 };
  if (typeof valor === 'number') {
    const totalMin = Math.round(valor * 24 * 60);
    return { h: Math.floor(totalMin / 60) % 24, m: totalMin % 60 };
  }
  const texto = String(valor).trim();
  const match = texto.match(/^(\d{1,2}):(\d{2})/);
  if (match) return { h: parseInt(match[1]), m: parseInt(match[2]) };
  return { h: 0, m: 0 };
};

const combinarFechaHora = (fecha, hora) => {
  if (!fecha) return null;
  const f = new Date(fecha);
  f.setHours(hora.h, hora.m, 0, 0);
  return f;
};

const normalizar = (valor, opcionesValidas, porDefecto) => {
  const texto = String(valor || '').trim().toLowerCase();
  return opcionesValidas.includes(texto) ? texto : porDefecto;
};

// ============================================
// Columnas del template (mismos campos del formulario)
// ============================================

const ENCABEZADOS = [
  'N° Ticket',
  'Tipo (cambio/alerta)',
  'Cliente',
  'Especialidad (middleware/operaciones/ambas)',
  'Especialista Asignado',
  'Descripción de la actividad',
  'Fecha Inicio (DD-MM-AAAA)',
  'Hora Inicio (HH:MM)',
  'Fecha Fin (DD-MM-AAAA)',
  'Hora Fin (HH:MM)',
  'Interno/Cliente (interno/cliente)',
  'Genera OVT (si/no)',
  'Probabilidad (alta/media/baja)'
];

const FILA_EJEMPLO = [
  'INC0012345',
  'cambio',
  'Banco de Chile',
  'middleware',
  'Jorge Maureira',
  'Posible migración de base de datos cliente X durante el fin de semana',
  '24-06-2026',
  '22:00',
  '25-06-2026',
  '06:00',
  'cliente',
  'si',
  'alta'
];

const ExcelUploadITSM = ({ token, apiUrl }) => {
  const [archivo, setArchivo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [resultados, setResultados] = useState(null);

  const descargarTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([ENCABEZADOS, FILA_EJEMPLO]);
    ws['!cols'] = ENCABEZADOS.map(() => ({ wch: 26 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Proyecciones OVT');
    XLSX.writeFile(wb, 'template_proyecciones_ovt.xlsx');
  };

  const procesarArchivo = async () => {
    if (!archivo) return;
    setCargando(true);
    setResultados(null);

    try {
      const data = await archivo.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // Quita la fila de encabezado (y la de ejemplo si el usuario la dejó)
      const filasDatos = filas.slice(1).filter(f => f.some(celda => String(celda).trim() !== ''));

      const resultadosFilas = [];

      for (let i = 0; i < filasDatos.length; i++) {
        const fila = filasDatos[i];
        const [
          numeroTicket, tipoRaw, cliente, especialidadRaw, especialistaAsignado,
          descripcion, fechaInicioRaw, horaInicioRaw, fechaFinRaw, horaFinRaw,
          internoClienteRaw, generaOvtRaw, probabilidadRaw
        ] = fila;

        try {
          if (!cliente || !descripcion) {
            throw new Error('Faltan campos requeridos (Cliente o Descripción)');
          }

          const fechaInicioBase = parseFechaCelda(fechaInicioRaw);
          const fechaFinBase = parseFechaCelda(fechaFinRaw);
          if (!fechaInicioBase || !fechaFinBase) {
            throw new Error('Fecha Inicio o Fecha Fin inválida');
          }

          const fechaInicio = combinarFechaHora(fechaInicioBase, parseHoraCelda(horaInicioRaw));
          const fechaFin = combinarFechaHora(fechaFinBase, parseHoraCelda(horaFinRaw));
          const horas = calcularHoras(fechaInicio, fechaFin);

          const payload = {
            numeroTicket: String(numeroTicket || ''),
            tipo: normalizar(tipoRaw, ['cambio', 'alerta'], 'cambio'),
            cliente: String(cliente),
            especialidad: normalizar(especialidadRaw, ['middleware', 'operaciones', 'ambas'], 'operaciones'),
            especialistaAsignado: String(especialistaAsignado || ''),
            descripcion: String(descripcion),
            fechaInicio,
            fechaFin,
            horas,
            interno_cliente: normalizar(internoClienteRaw, ['interno', 'cliente'], 'cliente'),
            genera_ovt: normalizar(generaOvtRaw, ['si', 'no'], 'si'),
            probabilidad: normalizar(probabilidadRaw, ['alta', 'media', 'baja'], 'media')
          };

          await axios.post(`${apiUrl}/api/proyecciones`, payload, {
            headers: { Authorization: `Bearer ${token}` }
          });

          resultadosFilas.push({ fila: i + 2, exito: true, descripcion: payload.descripcion, ticket: payload.numeroTicket });
        } catch (err) {
          resultadosFilas.push({
            fila: i + 2,
            exito: false,
            descripcion: descripcion || '(sin descripción)',
            ticket: numeroTicket || '—',
            error: err.response?.data?.error || err.message
          });
        }
      }

      setResultados(resultadosFilas);
    } catch (err) {
      alert('Error leyendo el archivo Excel: ' + err.message);
    } finally {
      setCargando(false);
    }
  };

  const exitosos = resultados ? resultados.filter(r => r.exito).length : 0;
  const fallidos = resultados ? resultados.filter(r => !r.exito).length : 0;

  return (
    <section className="seccion">
      <h2>📥 Carga Masiva de Proyecciones OVT (Excel)</h2>
      <p style={{ color: '#666', fontSize: '13px', marginTop: '-10px', marginBottom: '20px' }}>
        Descarga el template, complétalo con tus proyecciones de la semana, y súbelo aquí. Cada fila se procesa igual que si la ingresaras manualmente en "Nueva Proyección".
      </p>

      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ marginTop: 0, fontSize: '15px', color: '#1e40af' }}>1️⃣ Descarga el template</h3>
        <p style={{ fontSize: '12.5px', color: '#1e40af', marginBottom: '14px' }}>
          Archivo Excel (.xlsx) con los mismos campos del formulario "Nueva Proyección", más una fila de ejemplo que puedes borrar.
        </p>
        <button onClick={descargarTemplate} className="btn-primary" style={{ background: '#1e40af' }}>
          ⬇️ Descargar template_proyecciones_ovt.xlsx
        </button>
      </div>

      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ marginTop: 0, fontSize: '15px' }}>2️⃣ Sube el archivo completado</h3>
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
          {cargando ? '⏳ Procesando...' : '🚀 Cargar Proyecciones'}
        </button>
      </div>

      {resultados && (
        <div>
          <div className="dashboard-grid" style={{ marginBottom: '20px' }}>
            <div className="card card-blue">
              <h3>📋 Total Filas</h3>
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
                <th>N° Ticket</th>
                <th>Descripción</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((r) => (
                <tr key={r.fila}>
                  <td>{r.fila}</td>
                  <td>{r.ticket}</td>
                  <td style={{ maxWidth: '300px', whiteSpace: 'normal', wordBreak: 'break-word' }}>{r.descripcion?.substring?.(0, 60) || r.descripcion}</td>
                  <td>
                    {r.exito ? (
                      <span className="badge badge-exitoso">✅ Cargada</span>
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
    </section>
  );
};

export default ExcelUploadITSM;
