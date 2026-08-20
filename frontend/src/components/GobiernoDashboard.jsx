import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

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

export default function GobiernoDashboard({ token, apiUrl, clienteActivo }) {
  const headers = buildHeaders(token, clienteActivo);

  const [subTab, setSubTab] = useState('panel'); // 'panel' (vista central) | 'config'

  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [modalItem, setModalItem] = useState(null);
  const [notaNueva, setNotaNueva] = useState('');
  const [guardando, setGuardando] = useState(false);

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

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

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

  // KPIs de resumen
  const itemsEstado = items.filter(i => i.tipo === 'estado');
  const alDia = itemsEstado.filter(i => i.estado === 'al_dia').length;
  const pendientes = itemsEstado.filter(i => i.estado === 'pendiente').length;
  const atrasados = itemsEstado.filter(i => i.estado === 'atrasado').length;
  const kpis = items.filter(i => i.tipo === 'kpi');

  const porCategoria = {};
  items.forEach(i => { if (!porCategoria[i.categoria]) porCategoria[i.categoria] = []; porCategoria[i.categoria].push(i); });

  const fmtFecha = (f) => f?._seconds ? new Date(f._seconds * 1000).toLocaleDateString('es-CL') : (f ? new Date(f).toLocaleDateString('es-CL') : '—');

  return (
    <div>
      {error && (
        <div style={{ background: 'rgba(215,59,71,0.08)', border: '1px solid rgba(215,59,71,0.24)', borderRadius: '14px', padding: '10px 16px', color: '#a61e2b', fontSize: '13px', fontWeight: '600', marginBottom: '18px' }}>
          {error}
        </div>
      )}

      {/* SUB-TABS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button
          onClick={() => setSubTab('panel')}
          style={{ padding: '9px 16px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', cursor: 'pointer',
            border: subTab === 'panel' ? 'none' : '1px solid var(--line)',
            background: subTab === 'panel' ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'rgba(255,255,255,0.72)',
            color: subTab === 'panel' ? '#fff' : 'var(--ink-800)' }}>
          Panel
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

      {cargando ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px', fontWeight: '600' }}>Cargando...</p>
      ) : subTab === 'panel' ? (
        /* ============ PANEL CENTRAL ============
           Vista principal, se va armando ítem por ítem según se defina cada uno.
           Por ahora solo muestra los KPIs numéricos como punto de partida. */
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
            El resto del panel se va a ir construyendo ítem por ítem. Los datos ya cargados están en la pestaña "Configuración" mientras tanto.
          </div>
        </div>
      ) : (
        /* ============ CONFIGURACIÓN ============
           Vista de administración: los 14 ítems agrupados por categoría, con
           edición de estado/valor/responsable y notas. Esta es la fuente de
           datos que alimenta el Panel de arriba. */
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
      )}

      {/* MODAL EDITAR ÍTEM */}
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
    </div>
  );
}
