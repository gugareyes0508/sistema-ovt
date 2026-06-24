import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

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
  const [especialistas, setEspecialistas] = useState([]);

  useEffect(() => {
    axios.get(`${apiUrl}/api/especialistas`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setEspecialistas(res.data || []))
      .catch(err => console.error('Error cargando especialistas:', err.message));
  }, [apiUrl, token]);

  const descargarTemplate = async () => {
    const wb = new ExcelJS.Workbook();

    // Hoja de Listas (oculta) — fuente de los combobox
    const listas = wb.addWorksheet('Listas');
    listas.state = 'veryHidden'; // oculta incluso desde el menú "Mostrar hoja" de Excel

    const TIPO_OPCIONES = ['cambio', 'alerta'];
    const CLIENTE_OPCIONES = ['Banco de Chile', 'Banco Santander', 'Banco BCI', 'Banco Estado', 'Otro'];
    const ESPECIALIDAD_OPCIONES = ['middleware', 'operaciones', 'ambas'];
    const INTERNO_CLIENTE_OPCIONES = ['interno', 'cliente'];
    const GENERA_OVT_OPCIONES = ['si', 'no'];
    const PROBABILIDAD_OPCIONES = ['alta', 'media', 'baja'];
    const ESPECIALISTA_OPCIONES = especialistas.length > 0
      ? especialistas.map(e => e.nombre)
      : ['Sin asignar'];

    TIPO_OPCIONES.forEach((v, i) => { listas.getCell(`A${i + 1}`).value = v; });
    CLIENTE_OPCIONES.forEach((v, i) => { listas.getCell(`B${i + 1}`).value = v; });
    ESPECIALIDAD_OPCIONES.forEach((v, i) => { listas.getCell(`C${i + 1}`).value = v; });
    INTERNO_CLIENTE_OPCIONES.forEach((v, i) => { listas.getCell(`D${i + 1}`).value = v; });
    GENERA_OVT_OPCIONES.forEach((v, i) => { listas.getCell(`E${i + 1}`).value = v; });
    PROBABILIDAD_OPCIONES.forEach((v, i) => { listas.getCell(`F${i + 1}`).value = v; });
    ESPECIALISTA_OPCIONES.forEach((v, i) => { listas.getCell(`G${i + 1}`).value = v; });

    // Hoja principal
    const ws = wb.addWorksheet('Proyecciones OVT');
    ws.addRow(ENCABEZADOS);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F7' } };
    ws.columns = ENCABEZADOS.map(() => ({ width: 28 }));
    ws.addRow(FILA_EJEMPLO);

    // Rango de filas con combobox (desde fila 2 hasta 200, suficiente para varias semanas)
    const ULTIMA_FILA = 200;

    const aplicarLista = (columna, rangoListas) => {
      for (let fila = 2; fila <= ULTIMA_FILA; fila++) {
        ws.getCell(`${columna}${fila}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Listas!${rangoListas}`],
          showErrorMessage: true,
          errorTitle: 'Valor inválido',
          error: 'Selecciona una opción de la lista desplegable.'
        };
      }
    };

    aplicarLista('B', `$A$1:$A$${TIPO_OPCIONES.length}`);                      // Tipo
    aplicarLista('C', `$B$1:$B$${CLIENTE_OPCIONES.length}`);                   // Cliente
    aplicarLista('D', `$C$1:$C$${ESPECIALIDAD_OPCIONES.length}`);              // Especialidad
    aplicarLista('E', `$G$1:$G$${ESPECIALISTA_OPCIONES.length}`);              // Especialista Asignado
    aplicarLista('K', `$D$1:$D$${INTERNO_CLIENTE_OPCIONES.length}`);           // Interno/Cliente
    aplicarLista('L', `$E$1:$E$${GENERA_OVT_OPCIONES.length}`);                // Genera OVT
    aplicarLista('M', `$F$1:$F$${PROBABILIDAD_OPCIONES.length}`);              // Probabilidad

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_proyecciones_ovt.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const procesarArchivo = async () => {
    if (!archivo) return;
    setCargando(true);
    setResultados(null);

    try {
      const data = await archivo.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      // Importante: el libro tiene 2 hojas (la oculta "Listas" + la de datos).
      // Buscamos explícitamente la hoja de datos por nombre, no por índice 0.
      const nombreHoja = wb.SheetNames.includes('Proyecciones OVT') ? 'Proyecciones OVT' : wb.SheetNames[0];
      const sheet = wb.Sheets[nombreHoja];
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
          <br />
          <strong>Las columnas Tipo, Cliente, Especialidad, Especialista Asignado, Interno/Cliente, Genera OVT y Probabilidad tienen un combobox (lista desplegable)</strong> — solo haz click en la celda y elige una opción, hasta la fila 200.
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
