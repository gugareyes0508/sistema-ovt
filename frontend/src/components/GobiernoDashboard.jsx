import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const buildHeaders = (token, clienteActivo = '') => {
  const h = { Authorization: `Bearer ${token}` };
  if (clienteActivo) h['x-cliente-activo'] = clienteActivo;
  return h;
};

const ESTADOS = {
  sin_datos: { label: 'Sin datos', bg: 'rgba(107,114,128,0.12)', fg: '#4b5563' },
  al_dia: { label: 'Al día', bg: 'rgba(32,166,106,0.14)', fg: '#116642' },
  pendiente: { label: 'Pendiente', bg: 'rgba(240,161,26,0.15)', fg: '#8a5a06' },
  atrasado: { label: 'Atrasado', bg: 'rgba(215,59,71,0.12)', fg: '#a61e2b' }
};

const CATEGORIAS_ORDEN = ['Operación', 'Cumplimiento', 'Infraestructura', 'Continuidad', 'Estrategia'];

const PillEstado = ({ estado }) => {
  const c = ESTADOS[estado] || ESTADOS.sin_datos;
  return (
    <span style={{ background: c.bg, color: c.fg, fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  );
};

// Formatea un valor de indicador: si es una fracción (<=1) y el objetivo
// menciona "%", se muestra como porcentaje; si no, tal cual (número o texto).
const formatearValorIndicador = (valor, objetivo) => {
  const objetivoTexto = String(objetivo || '');
  if (typeof valor === 'number') {
    if (valor <= 1 && objetivoTexto.includes('%')) return `${(valor * 100).toFixed(1)}%`;
    return valor.toLocaleString('es-CL');
  }
  return valor === '' || valor === undefined || valor === null ? '—' : String(valor);
};

const iconoIndicador = (nombre) => {
  const n = String(nombre || '').toLowerCase();
  if (n.includes('total') || n.includes('universo')) return 'ti-server';
  if (n.includes('cobertura') || n.includes('template')) return 'ti-circle-check';
  if (n.includes('comunicaci')) return 'ti-plug-connected';
  if (n.includes('deshabilitad')) return 'ti-user-x';
  if (n.includes('zabbix')) return 'ti-plus';
  if (n.includes('grupo')) return 'ti-users';
  if (n.includes('monitor')) return 'ti-activity';
  return 'ti-chart-bar';
};

export default function GobiernoDashboard({ token, apiUrl, clienteActivo }) {
  const headers = buildHeaders(token, clienteActivo);
  const fileRef = useRef(null);

  const [subTab, setSubTab] = useState('panel'); // 'panel' | 'monitoreo' | 'config'

  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [modalItem, setModalItem] = useState(null);
  const [notaNueva, setNotaNueva] = useState('');
  const [guardando, setGuardando] = useState(false);

  // ============ MONITOREO (carga semanal de Excel) ============
  const [cargas, setCargas] = useState([]);
  const [cargandoMonitoreo, setCargandoMonitoreo] = useState(true);
  const [errorMonitoreo, setErrorMonitoreo] = useState(null);
  const [subiendoExcel, setSubiendoExcel] = useState(false);
  const [mensajeSubida, setMensajeSubida] = useState(null);
  const [pendientesModal, setPendientesModal] = useState(null); // { fecha, lista }
  const [cargandoPendientesId, setCargandoPendientesId] = useState(null);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await axios.get(`${apiUrl}/api/gobierno`, { headers });
      setItems(res.data);
    } catch (err) {
      setError('Error cargando gobierno de cuenta: ' + (err.response?.data?.error || err.message));
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, clienteActivo]);

  const cargarMonitoreo = useCallback(async () => {
    setCargandoMonitoreo(true);
    setErrorMonitoreo(null);
    try {
      const res = await axios.get(`${apiUrl}/api/gobierno/monitoreo`, { headers });
      setCargas(res.data);
    } catch (err) {
      setErrorMonitoreo('Error cargando el histórico de monitoreo: ' + (err.response?.data?.error || err.message));
    } finally {
      setCargandoMonitoreo(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, clienteActivo]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);
  useEffect(() => { cargarMonitoreo(); }, [cargarMonitoreo]);

  const abrirEditar = (item) => {
    setModalItem({ ...item });
    setNotaNueva('');
  };

  const guardarItem = async () => {
    if (!modalItem) return;
    setGuardando(true);
    try {
      const payload = {
        responsable: modalItem.responsable || '',
        frecuencia: modalItem.frecuencia || 'mensual',
        link: modalItem.link || '',
        nota: notaNueva
      };
      if (modalItem.tipo === 'kpi') {
        payload.valorActual = modalItem.valorActual === '' ? null : modalItem.valorActual;
        payload.unidad = modalItem.unidad || '%';
      } else {
        payload.estado = modalItem.estado || 'sin_datos';
      }
      await axios.put(`${apiUrl}/api/gobierno/${modalItem.id}`, payload, { headers });
      setModalItem(null);
      setNotaNueva('');
      cargarDatos();
    } catch (err) {
      setError('Error guardando: ' + (err.response?.data?.error || err.message));
    } finally {
      setGuardando(false);
    }
  };

  // ============ PARSEO DEL EXCEL DE MONITOREO ============
  // Estructura fija del reporte (Jenkins/Zabbix, hoja "KPI"):
  //   fila con "Generado: dd-mm-aaaa hh:mm"
  //   tabla con encabezados KPI | Valor | Objetivo | Cumple
  // Hoja "_datos_grafico": Estado | Cantidad
  // Hoja "Pendientes": título en fila 1, encabezados reales en fila 2
  const procesarExcelMonitoreo = async (file) => {
    setSubiendoExcel(true);
    setMensajeSubida(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });

      const hojaKPI = wb.Sheets['KPI'];
      if (!hojaKPI) throw new Error('No se encontró la hoja "KPI" en el archivo');
      const filasKPI = XLSX.utils.sheet_to_json(hojaKPI, { header: 1, defval: '' });

      let fechaGenerado = null;
      for (const f of filasKPI) {
        const m = /Generado:\s*(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/.exec(String(f[0] || ''));
        if (m) {
          const [, d, mo, y, h, mi] = m;
          fechaGenerado = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
          break;
        }
      }
      if (!fechaGenerado) fechaGenerado = new Date();

      const idxHeader = filasKPI.findIndex(f => f[0] === 'KPI' && f[1] === 'Valor');
      if (idxHeader === -1) throw new Error('No se encontró la tabla de indicadores (KPI/Valor/Objetivo/Cumple) en la hoja "KPI"');
      const indicadores = [];
      for (let i = idxHeader + 1; i < filasKPI.length; i++) {
        const f = filasKPI[i];
        if (!f[0]) break;
        indicadores.push({
          nombre: String(f[0]),
          valor: f[1],
          objetivo: String(f[2] ?? ''),
          cumple: f[3] === '✅' || f[3] === true
        });
      }
      if (indicadores.length === 0) throw new Error('La tabla de indicadores está vacía');

      let distribucion = [];
      const hojaDist = wb.Sheets['_datos_grafico'];
      if (hojaDist) {
        distribucion = XLSX.utils.sheet_to_json(hojaDist, { defval: '' }).map(r => ({
          estado: r['Estado'] || '',
          cantidad: Number(r['Cantidad']) || 0
        }));
      }

      let pendientes = [];
      const hojaPend = wb.Sheets['Pendientes'];
      if (hojaPend) {
        pendientes = XLSX.utils.sheet_to_json(hojaPend, { range: 1, defval: '' });
      }

      const resp = await axios.post(`${apiUrl}/api/gobierno/monitoreo/upload`, {
        fechaGenerado: fechaGenerado.toISOString(),
        indicadores,
        distribucion,
        pendientes
      }, { headers });

      if (resp.data.success) {
        setMensajeSubida({ tipo: 'success', texto: `Carga registrada: ${indicadores.length} indicadores, ${pendientes.length} equipos pendientes.` });
        cargarMonitoreo();
      }
    } catch (err) {
      setMensajeSubida({ tipo: 'error', texto: 'Error procesando el archivo: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSubiendoExcel(false);
    }
  };

  const verPendientes = async (carga) => {
    setCargandoPendientesId(carga.id);
    try {
      const res = await axios.get(`${apiUrl}/api/gobierno/monitoreo/${carga.id}/pendientes`, { headers });
      setPendientesModal({ fecha: carga.fecha, lista: res.data });
    } catch (err) {
      setMensajeSubida({ tipo: 'error', texto: 'Error cargando el detalle: ' + (err.response?.data?.error || err.message) });
    } finally {
      setCargandoPendientesId(null);
    }
  };

  const fmtFecha = (f) => f?._seconds ? new Date(f._seconds * 1000).toLocaleDateString('es-CL') : (f ? new Date(f).toLocaleDateString('es-CL') : '—');
  const fmtFechaHora = (f) => {
    const d = f?._seconds ? new Date(f._seconds * 1000) : new Date(f);
    return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const ultimaCarga = cargas[0] || null;
  const historicoAscendente = useMemo(() => [...cargas].reverse(), [cargas]);

  const buscarIndicador = (indicadores, patron) =>
    (indicadores || []).find(i => patron.test(i.nombre || ''));

  const dataTendencia = useMemo(() => {
    const labels = historicoAscendente.map(c => fmtFecha(c.fecha));
    const cobertura = historicoAscendente.map(c => {
      const ind = buscarIndicador(c.indicadores, /cobertura/i);
      if (!ind || typeof ind.valor !== 'number') return null;
      return ind.valor <= 1 ? +(ind.valor * 100).toFixed(1) : ind.valor;
    });
    return {
      labels,
      datasets: [{
        label: 'Cobertura de monitoreo',
        data: cobertura,
        borderColor: '#20a66a',
        backgroundColor: 'rgba(32,166,106,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#20a66a',
        spanGaps: true
      }]
    };
  }, [historicoAscendente]);

  // KPIs de resumen (pestaña Panel)
  const itemsEstado = items.filter(i => i.tipo === 'estado');
  const alDia = itemsEstado.filter(i => i.estado === 'al_dia').length;
  const pendientes = itemsEstado.filter(i => i.estado === 'pendiente').length;
  const atrasados = itemsEstado.filter(i => i.estado === 'atrasado').length;
  const kpis = items.filter(i => i.tipo === 'kpi');

  const porCategoria = {};
  items.forEach(i => { if (!porCategoria[i.categoria]) porCategoria[i.categoria] = []; porCategoria[i.categoria].push(i); });

  return (
    <div>
      {error && (
        <div style={{ background: 'rgba(215,59,71,0.08)', border: '1px solid rgba(215,59,71,0.24)', borderRadius: '14px', padding: '10px 16px', color: '#a61e2b', fontSize: '13px', fontWeight: '600', marginBottom: '18px' }}>
          {error}
        </div>
      )}

      {/* SUB-TABS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button
          onClick={() => setSubTab('panel')}
          style={{ padding: '9px 16px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', cursor: 'pointer',
            border: subTab === 'panel' ? 'none' : '1px solid var(--line)',
            background: subTab === 'panel' ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'rgba(255,255,255,0.72)',
            color: subTab === 'panel' ? '#fff' : 'var(--ink-800)' }}>
          Panel
        </button>
        <button
          onClick={() => setSubTab('monitoreo')}
          style={{ padding: '9px 16px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', cursor: 'pointer',
            border: subTab === 'monitoreo' ? 'none' : '1px solid var(--line)',
            background: subTab === 'monitoreo' ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'rgba(255,255,255,0.72)',
            color: subTab === 'monitoreo' ? '#fff' : 'var(--ink-800)' }}>
          <i className="ti ti-activity" aria-hidden="true" style={{ marginRight: 4 }}></i>Monitoreo
        </button>
        <button
          onClick={() => setSubTab('config')}
          style={{ padding: '9px 16px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', cursor: 'pointer',
            border: subTab === 'config' ? 'none' : '1px solid var(--line)',
            background: subTab === 'config' ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'rgba(255,255,255,0.72)',
            color: subTab === 'config' ? '#fff' : 'var(--ink-800)' }}>
          <i className="ti ti-settings" aria-hidden="true" style={{ marginRight: 4 }}></i>Configuración
        </button>
      </div>

      {/* ============ PANEL ============ */}
      {subTab === 'panel' && (
        cargando ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px', fontWeight: '600' }}>Cargando...</p>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kpis.length || 1}, minmax(0,1fr))`, gap: 10, marginBottom: 18 }}>
              {kpis.map(k => (
                <div key={k.id} style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '18px', padding: '14px', boxShadow: 'var(--shadow-soft)' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)' }}>{k.nombre}</div>
                  <div style={{ fontSize: '26px', fontWeight: '800', color: 'var(--ink-950)' }}>
                    {k.valorActual !== null && k.valorActual !== undefined ? `${k.valorActual}${k.unidad || '%'}` : '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Actualizado: {fmtFecha(k.actualizadoEn)}</div>
                </div>
              ))}
            </div>
            <div style={{ background: 'var(--glass)', border: '1px dashed rgba(255,255,255,0.72)', borderRadius: '22px', padding: '30px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
              El resto del panel se va a ir construyendo ítem por ítem — el resumen de Monitoreo se agrega acá una vez definido su formato final.
            </div>
          </div>
        )
      )}

      {/* ============ MONITOREO ============ */}
      {subTab === 'monitoreo' && (
        <div>
          {errorMonitoreo && (
            <div style={{ background: 'rgba(215,59,71,0.08)', border: '1px solid rgba(215,59,71,0.24)', borderRadius: '14px', padding: '10px 16px', color: '#a61e2b', fontSize: '13px', fontWeight: '600', marginBottom: '18px' }}>
              {errorMonitoreo}
            </div>
          )}

          {/* CARGA DE EXCEL */}
          <div
            style={{ border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', background: 'var(--glass)', boxShadow: 'var(--shadow-soft)', padding: '18px 22px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', flexWrap: 'wrap' }}
            onClick={() => fileRef.current?.click()}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-file-spreadsheet" aria-hidden="true" style={{ fontSize: '18px', color: '#fff' }}></i>
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', marginBottom: '2px' }}>
                {subiendoExcel ? 'Procesando archivo...' : 'Cargar reporte semanal de monitoreo (Excel)'}
              </div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)' }}>
                Hoja "KPI" + "_datos_grafico" + "Pendientes" · queda guardado como una carga nueva del histórico
              </div>
            </div>
            {ultimaCarga && (
              <div style={{ fontSize: '11px', fontFamily: "'IBM Plex Mono',monospace", color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>
                Última carga:<br />{fmtFechaHora(ultimaCarga.fecha)}
              </div>
            )}
            <button
              disabled={subiendoExcel}
              onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
              style={{ padding: '10px 18px', background: subiendoExcel ? 'var(--muted)' : 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color: '#fff', border: 'none', borderRadius: '999px', fontWeight: '900', fontSize: '12px', cursor: subiendoExcel ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {subiendoExcel ? 'Cargando...' : 'Seleccionar archivo'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files[0]) procesarExcelMonitoreo(e.target.files[0]); e.target.value = ''; }}
            />
          </div>

          {mensajeSubida && (
            <div style={{
              background: mensajeSubida.tipo === 'error' ? 'rgba(215,59,71,0.08)' : 'rgba(32,166,106,0.1)',
              border: `1px solid ${mensajeSubida.tipo === 'error' ? 'rgba(215,59,71,0.24)' : 'rgba(32,166,106,0.24)'}`,
              borderRadius: '14px', padding: '10px 16px', fontSize: '13px', fontWeight: '600', marginBottom: '18px',
              color: mensajeSubida.tipo === 'error' ? '#a61e2b' : '#116642'
            }}>
              {mensajeSubida.texto}
            </div>
          )}

          {cargandoMonitoreo ? (
            <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px', fontWeight: '600' }}>Cargando...</p>
          ) : !ultimaCarga ? (
            <div style={{ background: 'var(--glass)', border: '1px dashed rgba(255,255,255,0.72)', borderRadius: '22px', padding: '30px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
              Todavía no hay ninguna carga. Sube el primer reporte semanal para empezar el histórico.
            </div>
          ) : (
            <>
              {/* KPIs de la última carga */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 18 }}>
                {ultimaCarga.indicadores.map((ind, i) => (
                  <div key={i} style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '16px', padding: '12px', boxShadow: 'var(--shadow-soft)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <i className={`ti ${iconoIndicador(ind.nombre)}`} aria-hidden="true" style={{ fontSize: '13px', color: 'var(--muted)' }}></i>
                      <span style={{ fontSize: '9px', fontWeight: '800', color: 'var(--muted)', letterSpacing: '.03em', textTransform: 'uppercase' }}>{ind.nombre}</span>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--ink-950)', fontFamily: "'IBM Plex Mono',monospace" }}>
                      {formatearValorIndicador(ind.valor, ind.objetivo)}
                    </div>
                    {ind.objetivo && ind.objetivo !== '-' && (
                      <div style={{ fontSize: '10px', fontWeight: '700', color: ind.cumple ? 'var(--muted)' : '#a61e2b' }}>
                        objetivo {ind.objetivo}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Tendencia */}
              <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: '18px', boxShadow: 'var(--shadow-soft)', marginBottom: '18px' }}>
                <p style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', margin: '0 0 12px' }}>
                  Tendencia de cobertura · histórico real ({cargas.length} {cargas.length === 1 ? 'carga' : 'cargas'})
                </p>
                <div style={{ position: 'relative', height: '220px' }}>
                  <Line
                    data={dataTendencia}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { beginAtZero: false, ticks: { callback: v => `${v}%` } },
                        x: { grid: { display: false } }
                      }
                    }}
                  />
                </div>
              </div>

              {/* Histórico de cargas */}
              <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: '16px 18px', boxShadow: 'var(--shadow-soft)' }}>
                <p style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', margin: '0 0 10px' }}>Histórico de cargas</p>
                <div className="tabla-responsive">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Cobertura</th>
                        <th>Equipos por revisar</th>
                        <th>Subido por</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargas.map((c, i) => {
                        const cobertura = buscarIndicador(c.indicadores, /cobertura/i);
                        return (
                          <tr key={c.id}>
                            <td style={{ fontWeight: '700' }}>
                              {fmtFecha(c.fecha)}{i === 0 && <span style={{ color: '#20a66a', fontSize: '10px', fontWeight: '800', marginLeft: 6 }}>· actual</span>}
                            </td>
                            <td style={{ fontWeight: '800', color: '#116642' }}>
                              {cobertura ? formatearValorIndicador(cobertura.valor, cobertura.objetivo) : '—'}
                            </td>
                            <td style={{ color: 'var(--muted)' }}>{c.totalPendientes} equipos</td>
                            <td style={{ color: 'var(--muted)' }}>{c.cargadoPor}</td>
                            <td className="acciones">
                              <button className="btn-editar" onClick={() => verPendientes(c)} disabled={cargandoPendientesId === c.id}>
                                {cargandoPendientesId === c.id ? 'Cargando...' : 'Ver detalle'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ CONFIGURACIÓN ============ */}
      {subTab === 'config' && (
        cargando ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px', fontWeight: '600' }}>Cargando...</p>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(32,166,106,0.1)', color: '#116642', fontSize: '12px', fontWeight: '800', padding: '8px 16px', borderRadius: '999px' }}>{alDia} al día</div>
              <div style={{ background: 'rgba(240,161,26,0.12)', color: '#8a5a06', fontSize: '12px', fontWeight: '800', padding: '8px 16px', borderRadius: '999px' }}>{pendientes} pendientes</div>
              <div style={{ background: 'rgba(215,59,71,0.1)', color: '#a61e2b', fontSize: '12px', fontWeight: '800', padding: '8px 16px', borderRadius: '999px' }}>{atrasados} atrasados</div>
            </div>

            {CATEGORIAS_ORDEN.filter(cat => porCategoria[cat]?.length).map(cat => (
              <div key={cat} style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: '16px 18px', boxShadow: 'var(--shadow-soft)', marginBottom: '14px' }}>
                <p style={{ fontWeight: '800', fontSize: '13px', color: 'var(--ink-950)', margin: '0 0 10px' }}>{cat}</p>
                <div className="tabla-responsive">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Ítem</th>
                        <th>Responsable</th>
                        <th>Frecuencia</th>
                        <th>Última act.</th>
                        <th>Estado / Valor</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {porCategoria[cat].map(item => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: '700' }}>{item.nombre}</td>
                          <td style={{ color: 'var(--muted)' }}>{item.responsable || '—'}</td>
                          <td style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>{item.frecuencia || '—'}</td>
                          <td style={{ color: 'var(--muted)' }}>{fmtFecha(item.actualizadoEn)}</td>
                          <td>
                            {item.tipo === 'kpi'
                              ? <span style={{ fontWeight: '800' }}>{item.valorActual !== null && item.valorActual !== undefined ? `${item.valorActual}${item.unidad || '%'}` : '—'}</span>
                              : <PillEstado estado={item.estado} />}
                          </td>
                          <td className="acciones">
                            <button className="btn-editar" onClick={() => abrirEditar(item)}>Editar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* MODAL EDITAR ÍTEM (Configuración) */}
      {modalItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,24,38,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--paper-50)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: 22, width: 460, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ fontWeight: '800', margin: 0, color: 'var(--ink-950)' }}>{modalItem.nombre}</p>
              <button onClick={() => setModalItem(null)} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 16px' }}>{modalItem.categoria}</p>

            {modalItem.tipo === 'kpi' ? (
              <>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Valor actual</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input type="number" value={modalItem.valorActual ?? ''} onChange={e => setModalItem({ ...modalItem, valorActual: e.target.value })}
                    style={{ flex: 1, border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px' }} />
                  <input type="text" value={modalItem.unidad || '%'} onChange={e => setModalItem({ ...modalItem, unidad: e.target.value })}
                    style={{ width: 60, border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 10px', fontSize: '13px' }} />
                </div>
              </>
            ) : (
              <>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Estado</label>
                <select value={modalItem.estado || 'sin_datos'} onChange={e => setModalItem({ ...modalItem, estado: e.target.value })}
                  style={{ width: '100%', marginBottom: 12, border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px', fontWeight: '600' }}>
                  {Object.entries(ESTADOS).map(([v, cfg]) => <option key={v} value={v}>{cfg.label}</option>)}
                </select>
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Responsable</label>
                <input type="text" value={modalItem.responsable || ''} onChange={e => setModalItem({ ...modalItem, responsable: e.target.value })}
                  style={{ width: '100%', border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Frecuencia</label>
                <select value={modalItem.frecuencia || 'mensual'} onChange={e => setModalItem({ ...modalItem, frecuencia: e.target.value })}
                  style={{ width: '100%', border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px', fontWeight: '600' }}>
                  <option value="semanal">Semanal</option>
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="continuo">Continuo</option>
                </select>
              </div>
            </div>

            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Link al reporte (opcional)</label>
            <input type="text" placeholder="https://..." value={modalItem.link || ''} onChange={e => setModalItem({ ...modalItem, link: e.target.value })}
              style={{ width: '100%', marginBottom: 12, border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px' }} />

            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Nueva nota (opcional)</label>
            <textarea placeholder="Comentario, hallazgo, próxima acción..." value={notaNueva} onChange={e => setNotaNueva(e.target.value)}
              style={{ width: '100%', minHeight: 60, marginBottom: 14, border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px', fontFamily: 'inherit' }} />

            <button onClick={guardarItem} disabled={guardando}
              style={{ width: '100%', borderRadius: '999px', background: guardando ? 'var(--muted)' : 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color: '#fff', padding: '10px 18px', fontSize: '13px', fontWeight: '900', border: 'none', cursor: guardando ? 'not-allowed' : 'pointer', marginBottom: 16 }}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>

            <p style={{ fontSize: '12px', fontWeight: '800', margin: '0 0 8px' }}>Historial</p>
            {(!modalItem.notas || modalItem.notas.length === 0) && (
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Sin notas registradas todavía.</p>
            )}
            {modalItem.notas?.slice().reverse().map((n, i) => (
              <div key={i} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
                <p style={{ fontSize: '13px', margin: 0 }}>{n.texto}</p>
                <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '2px 0 0' }}>
                  {n.autor} · {fmtFecha(n.fecha)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL DETALLE DE EQUIPOS PENDIENTES (Monitoreo) */}
      {pendientesModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,24,38,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--paper-50)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: 22, width: 720, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ fontWeight: '800', margin: 0, color: 'var(--ink-950)' }}>Equipos por revisar · {fmtFecha(pendientesModal.fecha)}</p>
              <button onClick={() => setPendientesModal(null)} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 16px' }}>{pendientesModal.lista.length} equipos</p>

            {pendientesModal.lista.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Sin equipos pendientes en esta carga.</p>
            ) : (
              <div className="tabla-responsive">
                <table className="tabla" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th>Hostname</th>
                      <th>Ambiente</th>
                      <th>Estado Zabbix</th>
                      <th>Comunicación</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendientesModal.lista.map((eq, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: '700' }}>{eq['Hostname'] || '—'}</td>
                        <td style={{ color: 'var(--muted)' }}>{eq['Ambiente'] || '—'}</td>
                        <td style={{ color: 'var(--muted)' }}>{eq['ZBX_status'] || '—'}</td>
                        <td style={{ color: 'var(--muted)' }}>{eq['ZBX_Comunicacion'] || '—'}</td>
                        <td style={{ fontWeight: '700', color: '#a61e2b' }}>{eq['MOTIVO'] || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
