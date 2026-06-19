import React, { useState } from 'react';
import axios from 'axios';

// Este archivo va en: frontend/src/components/ExcelUpload.jsx
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const ExcelUpload = ({ token, usuario, onUploadComplete }) => {
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);

  // Descargar template Excel
  const descargarTemplate = () => {
    const datos = [
      ['tipo', 'descripcion', 'cliente', 'fechaInicio', 'horaInicio', 'fechaFin', 'horaFin', 'especialidad', 'interno_cliente', 'genera_ovt'],
      ['cambio', 'Descripción del cambio...', 'Banco de Chile', '2026-06-17', '15:00', '2026-06-18', '15:00', 'operaciones', 'interno', 'si'],
      ['alerta', 'Descripción de la alerta...', 'Banco Santander', '2026-06-17', '09:00', '2026-06-17', '17:00', 'middleware', 'cliente', 'no'],
    ];

    const csv = datos.map(fila => 
      fila.map(celda => `"${celda}"`).join(',')
    ).join('\n');

    const elemento = document.createElement('a');
    elemento.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
    elemento.setAttribute('download', 'template_registros.csv');
    elemento.style.display = 'none';
    document.body.appendChild(elemento);
    elemento.click();
    document.body.removeChild(elemento);
  };

  // Procesar archivo Excel
  const procesarArchivo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setError(null);
    setResultado(null);
    setCargando(true);

    try {
      // Leer archivo
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const contenido = event.target.result;
          const lineas = contenido.split('\n').filter(l => l.trim());
          
          if (lineas.length < 2) {
            setError('El archivo está vacío o no tiene encabezados');
            setCargando(false);
            return;
          }

          // Parse de encabezados
          const encabezados = lineas[0]
            .split(',')
            .map(h => h.replace(/"/g, '').trim().toLowerCase());

          // Mapear índices
          const indices = {
            tipo: encabezados.indexOf('tipo'),
            descripcion: encabezados.indexOf('descripcion'),
            cliente: encabezados.indexOf('cliente'),
            fechaInicio: encabezados.indexOf('fechainicio'),
            horaInicio: encabezados.indexOf('horainicio'),
            fechaFin: encabezados.indexOf('fechafin'),
            horaFin: encabezados.indexOf('horafin'),
            especialidad: encabezados.indexOf('especialidad'),
            interno_cliente: encabezados.indexOf('interno_cliente'),
            genera_ovt: encabezados.indexOf('genera_ovt'),
          };

          // Validar que tenga columnas requeridas
          if (indices.tipo === -1 || indices.descripcion === -1 || indices.cliente === -1) {
            setError('Faltan columnas requeridas: tipo, descripcion, cliente');
            setCargando(false);
            return;
          }

          // Parse de registros
          const registros = [];
          const errores = [];

          for (let i = 1; i < lineas.length; i++) {
            try {
              const partes = lineas[i].split(',').map(p => p.replace(/"/g, '').trim());
              
              if (!partes[indices.tipo]) continue; // Saltar vacías

              const fechaInicio = new Date(`${partes[indices.fechaInicio]}T${partes[indices.horaInicio]}`);
              const fechaFin = new Date(`${partes[indices.fechaFin]}T${partes[indices.horaFin]}`);

              const horas = (fechaFin - fechaInicio) / (1000 * 60 * 60);

              registros.push({
                tipo: partes[indices.tipo].toLowerCase(),
                descripcion: partes[indices.descripcion],
                cliente: partes[indices.cliente],
                fechaInicio,
                fechaFin,
                horas: Math.max(0, Math.round(horas * 20) / 20),
                especialista: usuario.nombre,
                especialidad: partes[indices.especialidad] || 'operaciones',
                interno_cliente: partes[indices.interno_cliente] || 'interno',
                genera_ovt: partes[indices.genera_ovt] || 'si',
                estado: 'pendiente'
              });
            } catch (err) {
              errores.push(`Fila ${i + 1}: ${err.message}`);
            }
          }

          if (registros.length === 0) {
            setError('No se pudieron procesar registros válidos del archivo');
            setCargando(false);
            return;
          }

          // Subir registros
          let exitosos = 0;
          let fallidos = 0;
          const erroresUpload = [];

          for (const reg of registros) {
            try {
              await axios.post(`${API_URL}/api/registros`, reg, {
                headers: { Authorization: `Bearer ${token}` }
              });
              exitosos++;
            } catch (err) {
              fallidos++;
              erroresUpload.push(`${reg.descripcion}: ${err.response?.data?.error || err.message}`);
            }
          }

          setResultado({
            exitosos,
            fallidos,
            total: registros.length,
            errores: erroresUpload.slice(0, 5) // Mostrar primeros 5 errores
          });

          // Callback
          if (onUploadComplete) {
            onUploadComplete(exitosos);
          }

          setCargando(false);
        } catch (err) {
          setError('Error procesando archivo: ' + err.message);
          setCargando(false);
        }
      };

      reader.readAsText(file);
    } catch (err) {
      setError('Error: ' + err.message);
      setCargando(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h3>📥 Cargar Registros desde Excel/CSV</h3>

      {/* Instrucciones */}
      <div style={{ background: '#e3f2fd', padding: '15px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', color: '#1565c0' }}>
        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>Pasos:</p>
        <ol style={{ margin: 0, paddingLeft: '20px' }}>
          <li>Descarga el template Excel haciendo clic en el botón abajo</li>
          <li>Completa tus registros (cambios/alertas)</li>
          <li>Sube el archivo aquí</li>
          <li>Se validarán y crearán automáticamente</li>
        </ol>
      </div>

      {/* Botón descargar template */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={descargarTemplate}
          style={{
            padding: '10px 20px',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
            marginRight: '10px'
          }}
        >
          📄 Descargar Template
        </button>
      </div>

      {/* Input archivo */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>
          Selecciona archivo CSV o Excel:
        </label>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={procesarArchivo}
          disabled={cargando}
          style={{
            padding: '8px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: cargando ? 'not-allowed' : 'pointer',
            opacity: cargando ? 0.6 : 1
          }}
        />
        <p style={{ fontSize: '12px', color: '#666', margin: '8px 0 0 0' }}>
          Soportados: CSV, XLSX, XLS
        </p>
      </div>

      {/* Cargando */}
      {cargando && (
        <div style={{ padding: '15px', background: '#fff3cd', borderRadius: '6px', color: '#856404', marginBottom: '20px' }}>
          ⏳ Procesando archivo... Por favor espera
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '15px', background: '#ffebee', borderRadius: '6px', color: '#c62828', marginBottom: '20px', borderLeft: '4px solid #f44336' }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>❌ Error:</p>
          <p style={{ margin: 0, fontSize: '13px' }}>{error}</p>
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div style={{ padding: '15px', background: '#e8f5e9', borderRadius: '6px', color: '#2e7d32', borderLeft: '4px solid #4CAF50' }}>
          <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', fontSize: '14px' }}>✅ Carga completada:</p>
          <div style={{ fontSize: '13px' }}>
            <p style={{ margin: '5px 0' }}>
              <strong style={{ color: '#2e7d32' }}>✓ Exitosos:</strong> {resultado.exitosos}/{resultado.total}
            </p>
            {resultado.fallidos > 0 && (
              <p style={{ margin: '5px 0', color: '#d32f2f' }}>
                <strong>✗ Fallidos:</strong> {resultado.fallidos}
              </p>
            )}
          </div>

          {resultado.errores.length > 0 && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#666', maxHeight: '150px', overflowY: 'auto' }}>
              <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>Primeros errores:</p>
              {resultado.errores.map((err, idx) => (
                <p key={idx} style={{ margin: '3px 0', color: '#d32f2f' }}>• {err}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info formato */}
      <div style={{ marginTop: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '6px', fontSize: '12px', color: '#666' }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>📋 Columnas requeridas:</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th style={{ textAlign: 'left', padding: '6px', fontWeight: 'bold' }}>Columna</th>
              <th style={{ textAlign: 'left', padding: '6px', fontWeight: 'bold' }}>Formato</th>
              <th style={{ textAlign: 'left', padding: '6px', fontWeight: 'bold' }}>Ejemplo</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px' }}><strong>tipo</strong> *</td>
              <td style={{ padding: '6px' }}>cambio | alerta</td>
              <td style={{ padding: '6px' }}>cambio</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px' }}><strong>descripcion</strong> *</td>
              <td style={{ padding: '6px' }}>texto</td>
              <td style={{ padding: '6px' }}>Cambio en sistema X</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px' }}><strong>cliente</strong> *</td>
              <td style={{ padding: '6px' }}>Banco de Chile, Santander, etc</td>
              <td style={{ padding: '6px' }}>Banco de Chile</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px' }}><strong>fechaInicio</strong> *</td>
              <td style={{ padding: '6px' }}>YYYY-MM-DD</td>
              <td style={{ padding: '6px' }}>2026-06-17</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px' }}><strong>horaInicio</strong> *</td>
              <td style={{ padding: '6px' }}>HH:MM</td>
              <td style={{ padding: '6px' }}>15:00</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px' }}><strong>fechaFin</strong> *</td>
              <td style={{ padding: '6px' }}>YYYY-MM-DD</td>
              <td style={{ padding: '6px' }}>2026-06-18</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px' }}><strong>horaFin</strong> *</td>
              <td style={{ padding: '6px' }}>HH:MM</td>
              <td style={{ padding: '6px' }}>15:00</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px' }}>especialidad</td>
              <td style={{ padding: '6px' }}>operaciones | middleware</td>
              <td style={{ padding: '6px' }}>operaciones</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px' }}>interno_cliente</td>
              <td style={{ padding: '6px' }}>interno | cliente</td>
              <td style={{ padding: '6px' }}>interno</td>
            </tr>
            <tr>
              <td style={{ padding: '6px' }}>genera_ovt</td>
              <td style={{ padding: '6px' }}>si | no</td>
              <td style={{ padding: '6px' }}>si</td>
            </tr>
          </tbody>
        </table>
        <p style={{ margin: '8px 0 0 0', color: '#999' }}>* = Requerido</p>
      </div>
    </div>
  );
};

export default ExcelUpload;
