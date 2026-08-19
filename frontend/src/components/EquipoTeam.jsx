import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const buildHeaders = (token, clienteActivo = '') => {
  const h = { Authorization: `Bearer ${token}` };
  if (clienteActivo) h['x-cliente-activo'] = clienteActivo;
  return h;
};

const ESTADOS_PERSONA = {
  disponible: { label: 'Disponible', bg: 'rgba(32,166,106,0.14)', fg: '#116642' },
  oncall: { label: 'On Call', bg: 'rgba(215,59,71,0.12)', fg: '#a61e2b' },
  noche: { label: 'Turno noche', bg: 'rgba(124,58,237,0.14)', fg: '#5b21b6' },
  vacaciones: { label: 'Vacaciones', bg: 'rgba(217,119,6,0.14)', fg: '#8a5a06' },
  licencia: { label: 'Licencia', bg: 'rgba(107,114,128,0.12)', fg: '#4b5563' },
  inactivo: { label: 'Inactivo', bg: 'rgba(107,114,128,0.12)', fg: '#6b7280' }
};

const TIPOS_TURNO = {
  normal: 'Normal', oncall: 'On Call', noche: 'Turno noche', vacaciones: 'Vacaciones', licencia: 'Licencia'
};

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const PillEstado = ({ estado }) => {
  const c = ESTADOS_PERSONA[estado] || ESTADOS_PERSONA.disponible;
  return (
    <span style={{ background: c.bg, color: c.fg, fontSize: '11px', fontWeight: '800', padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  );
};

const inicioSemana = (fecha) => {
  const d = new Date(fecha);
  const dia = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dia);
  d.setHours(0, 0, 0, 0);
  return d;
};

const fmtFecha = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function EquipoTeam({ token, apiUrl, clienteActivo, usuario }) {
  const headers = buildHeaders(token, clienteActivo);
  const puedeGestionRoster = usuario?.rol === 'admin' || usuario?.rol === 'dpe';
  const puedeGestionOperativa = ['admin', 'dpe', 'teamleader'].includes(usuario?.rol);

  const [subTab, setSubTab] = useState('roster');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [personas, setPersonas] = useState([]);
  const [seguimientoMap, setSeguimientoMap] = useState({});
  const [turnos, setTurnos] = useState([]);
  const [skillsConfig, setSkillsConfig] = useState([]);
  const [skillsRatings, setSkillsRatings] = useState({});
  const [csat, setCsat] = useState([]);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [rPersonas, rSeg, rTurnos, rSkillsCfg, rSkills, rCsat] = await Promise.all([
        axios.get(`${apiUrl}/api/equipo`, { headers }),
        axios.get(`${apiUrl}/api/equipo/seguimiento-todas`, { headers }),
        axios.get(`${apiUrl}/api/equipo/turnos`, { headers }),
        axios.get(`${apiUrl}/api/equipo/skills-config`, { headers }),
        axios.get(`${apiUrl}/api/equipo/skills`, { headers }),
        axios.get(`${apiUrl}/api/equipo/csat`, { headers })
      ]);
      setPersonas(rPersonas.data);
      setSeguimientoMap(rSeg.data);
      setTurnos(rTurnos.data);
      setSkillsConfig(rSkillsCfg.data);
      setSkillsRatings(rSkills.data);
      setCsat(rCsat.data);
    } catch (err) {
      setError('Error cargando datos de equipo: ' + (err.response?.data?.error || err.message));
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, clienteActivo]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  // ============ ROSTER ============
  const [modalSeguimiento, setModalSeguimiento] = useState(null);
  const [notaNueva, setNotaNueva] = useState('');
  const [guardandoNota, setGuardandoNota] = useState(false);

  const actualizarEstado = async (id, estado) => {
    try {
      await axios.put(`${apiUrl}/api/equipo/${id}`, { estado }, { headers });
      setPersonas(prev => prev.map(p => p.id === id ? { ...p, estado } : p));
    } catch (err) {
      setError('Error actualizando estado: ' + (err.response?.data?.error || err.message));
    }
  };

  const guardarNota = async () => {
    if (!modalSeguimiento || !notaNueva.trim()) return;
    setGuardandoNota(true);
    try {
      await axios.post(`${apiUrl}/api/equipo/seguimiento`, { personaId: modalSeguimiento.id, nota: notaNueva.trim() }, { headers });
      setNotaNueva('');
      const res = await axios.get(`${apiUrl}/api/equipo/seguimiento-todas`, { headers });
      setSeguimientoMap(res.data);
    } catch (err) {
      setError('Error guardando nota: ' + (err.response?.data?.error || err.message));
    } finally {
      setGuardandoNota(false);
    }
  };

  // ============ TURNOS ============
  const [semanaBase, setSemanaBase] = useState(() => inicioSemana(new Date()));
  const diasDeLaSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(semanaBase);
    d.setDate(d.getDate() + i);
    return d;
  });

  const turnoDe = (personaId, fecha) => turnos.find(t => t.personaId === personaId && t.fecha === fecha);

  const asignarTurno = async (personaId, fecha, tipo) => {
    try {
      await axios.post(`${apiUrl}/api/equipo/turnos`, { personaId, fecha, tipo }, { headers });
      setTurnos(prev => {
        const sinEsta = prev.filter(t => !(t.personaId === personaId && t.fecha === fecha));
        return [...sinEsta, { id: `${personaId}_${fecha}`, personaId, fecha, tipo }];
      });
    } catch (err) {
      setError('Error asignando turno: ' + (err.response?.data?.error || err.message));
    }
  };

  // ============ SKILLS ============
  const [nuevaSkill, setNuevaSkill] = useState('');

  const agregarSkill = async () => {
    const nombre = nuevaSkill.trim();
    if (!nombre || skillsConfig.includes(nombre)) return;
    const nuevas = [...skillsConfig, nombre];
    try {
      await axios.post(`${apiUrl}/api/equipo/skills-config`, { skills: nuevas }, { headers });
      setSkillsConfig(nuevas);
      setNuevaSkill('');
    } catch (err) {
      setError('Error agregando skill: ' + (err.response?.data?.error || err.message));
    }
  };

  const quitarSkill = async (skill) => {
    const nuevas = skillsConfig.filter(s => s !== skill);
    try {
      await axios.post(`${apiUrl}/api/equipo/skills-config`, { skills: nuevas }, { headers });
      setSkillsConfig(nuevas);
    } catch (err) {
      setError('Error quitando skill: ' + (err.response?.data?.error || err.message));
    }
  };

  const setRating = async (personaId, skill, rating) => {
    setSkillsRatings(prev => ({ ...prev, [personaId]: { ...(prev[personaId] || {}), [skill]: rating } }));
    try {
      await axios.post(`${apiUrl}/api/equipo/skills`, { personaId, skill, rating }, { headers });
    } catch (err) {
      setError('Error guardando rating: ' + (err.response?.data?.error || err.message));
    }
  };

  // ============ CSAT ============
  const [modalCsat, setModalCsat] = useState(null);
  const [guardandoCsat, setGuardandoCsat] = useState(false);

  const guardarCsat = async () => {
    if (!modalCsat?.mes || modalCsat.score === undefined) return;
    setGuardandoCsat(true);
    try {
      await axios.post(`${apiUrl}/api/equipo/csat`, modalCsat, { headers });
      setModalCsat(null);
      const res = await axios.get(`${apiUrl}/api/equipo/csat`, { headers });
      setCsat(res.data);
    } catch (err) {
      setError('Error guardando CSAT: ' + (err.response?.data?.error || err.message));
    } finally {
      setGuardandoCsat(false);
    }
  };

  // ============ KPIs ============
  const totalPersonas = personas.length;
  const disponibles = personas.filter(p => p.estado === 'disponible').length;
  const fuera = personas.filter(p => p.estado === 'vacaciones' || p.estado === 'licencia').length;
  const sinSeguimiento30d = personas.filter(p => {
    const notas = seguimientoMap[p.id]?.notas;
    if (!notas || notas.length === 0) return true;
    const ultima = notas[notas.length - 1];
    const fecha = ultima.fecha?._seconds ? new Date(ultima.fecha._seconds * 1000) : new Date(ultima.fecha);
    return (Date.now() - fecha.getTime()) / 86400000 > 30;
  }).length;
  const csatUltimo = csat[0];

  const SUBTABS = [
    { id: 'roster', label: 'Roster' },
    { id: 'turnos', label: 'Turnos / On Call' },
    { id: 'skills', label: 'Skills matrix' },
    { id: 'csat', label: 'CSAT' }
  ];

  return (
    <div>
      {error && (
        <div style={{ background: 'rgba(215,59,71,0.08)', border: '1px solid rgba(215,59,71,0.24)', borderRadius: '14px', padding: '10px 16px', color: '#a61e2b', fontSize: '13px', fontWeight: '600', marginBottom: '18px' }}>
          {error}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10, marginBottom: 18 }}>
        <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '18px', padding: '14px', boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)' }}>Integrantes</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--ink-950)' }}>{totalPersonas}</div>
        </div>
        <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '18px', padding: '14px', boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)' }}>Disponibles</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: '#116642' }}>{disponibles}</div>
        </div>
        <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '18px', padding: '14px', boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)' }}>Vacaciones/Licencia</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--ink-950)' }}>{fuera}</div>
        </div>
        <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '18px', padding: '14px', boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)' }}>Sin seguimiento &gt;30d</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: '#a61e2b' }}>{sinSeguimiento30d}</div>
        </div>
        <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '18px', padding: '14px', boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)' }}>CSAT último mes</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--ink-950)' }}>{csatUltimo ? `${csatUltimo.score}/5` : '—'}</div>
        </div>
      </div>

      {/* SUB-TABS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {SUBTABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: '9px 16px', borderRadius: '999px', fontSize: '12px', fontWeight: '800', cursor: 'pointer',
              border: subTab === t.id ? 'none' : '1px solid var(--line)',
              background: subTab === t.id ? 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))' : 'rgba(255,255,255,0.72)',
              color: subTab === t.id ? '#fff' : 'var(--ink-800)'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {cargando ? (
        <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px', fontWeight: '600' }}>Cargando...</p>
      ) : (
        <>
          {/* ============ ROSTER ============ */}
          {subTab === 'roster' && (
            <div>
              <div className="tabla-responsive">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Rol</th>
                      <th>Grupo</th>
                      <th>Estado</th>
                      <th>Última nota</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {personas.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: '600' }}>No hay usuarios asociados a este cliente en Gestión de Usuarios.</td></tr>
                    )}
                    {personas.map(p => {
                      const notas = seguimientoMap[p.id]?.notas;
                      const ultima = notas?.length ? notas[notas.length - 1] : null;
                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: '700' }}>{p.nombre}</td>
                          <td>{p.cargo || '—'}</td>
                          <td>{p.grupo || '—'}</td>
                          <td>
                            {puedeGestionOperativa ? (
                              <select
                                value={p.estado}
                                onChange={e => actualizarEstado(p.id, e.target.value)}
                                style={{ border: '1px solid var(--line)', borderRadius: '999px', padding: '4px 10px', fontSize: '11px', fontWeight: '800', background: 'rgba(255,255,255,0.84)' }}
                              >
                                {Object.entries(ESTADOS_PERSONA).map(([v, cfg]) => <option key={v} value={v}>{cfg.label}</option>)}
                              </select>
                            ) : <PillEstado estado={p.estado} />}
                          </td>
                          <td style={{ color: 'var(--muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ultima?.texto || 'Sin nota'}
                          </td>
                          <td className="acciones">
                            <button className="btn-editar" onClick={() => setModalSeguimiento(p)}>Seguimiento</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '10px' }}>
                El roster se arma automáticamente desde Gestión de Usuarios para el cliente activo. Para agregar o quitar personas, edítalo ahí.
              </p>
            </div>
          )}

          {/* ============ TURNOS ============ */}
          {subTab === 'turnos' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <button onClick={() => setSemanaBase(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; })} style={{ border: '1px solid var(--line)', borderRadius: '999px', background: 'rgba(255,255,255,0.72)', padding: '7px 14px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>← Semana anterior</button>
                <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--ink-950)' }}>
                  {diasDeLaSemana[0].toLocaleDateString('es-CL')} — {diasDeLaSemana[6].toLocaleDateString('es-CL')}
                </span>
                <button onClick={() => setSemanaBase(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; })} style={{ border: '1px solid var(--line)', borderRadius: '999px', background: 'rgba(255,255,255,0.72)', padding: '7px 14px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>Semana siguiente →</button>
              </div>
              <div className="tabla-responsive">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      {diasDeLaSemana.map((d, i) => <th key={i} style={{ textAlign: 'center' }}>{DIAS_SEMANA[i]}<br /><span style={{ fontWeight: '400', fontSize: '10px' }}>{d.getDate()}/{d.getMonth() + 1}</span></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {personas.length === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: '600' }}>Agrega personas al roster primero.</td></tr>
                    )}
                    {personas.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: '700' }}>{p.nombre}</td>
                        {diasDeLaSemana.map((d, i) => {
                          const fecha = fmtFecha(d);
                          const t = turnoDe(p.id, fecha);
                          return (
                            <td key={i} style={{ textAlign: 'center' }}>
                              {puedeGestionOperativa ? (
                                <select
                                  value={t?.tipo || 'normal'}
                                  onChange={e => asignarTurno(p.id, fecha, e.target.value)}
                                  style={{ fontSize: '10px', border: '1px solid var(--line)', borderRadius: '8px', padding: '3px 4px', background: 'rgba(255,255,255,0.84)' }}
                                >
                                  {Object.entries(TIPOS_TURNO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                              ) : (t ? TIPOS_TURNO[t.tipo] : 'Normal')}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============ SKILLS ============ */}
          {subTab === 'skills' && (
            <div>
              {puedeGestionOperativa && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="text" placeholder="Nueva habilidad..." value={nuevaSkill}
                    onChange={e => setNuevaSkill(e.target.value)}
                    style={{ border: '1px solid var(--line)', borderRadius: '12px', padding: '8px 14px', fontSize: '13px' }}
                  />
                  <button onClick={agregarSkill} style={{ border: '1px solid var(--line)', borderRadius: '999px', background: 'rgba(255,255,255,0.72)', padding: '8px 14px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>+ Agregar habilidad</button>
                </div>
              )}
              <div className="tabla-responsive">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      {skillsConfig.map(s => (
                        <th key={s}>
                          {s} {puedeGestionOperativa && <button onClick={() => quitarSkill(s)} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '11px' }}>✕</button>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {personas.length === 0 && (
                      <tr><td colSpan={skillsConfig.length + 1} style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: '600' }}>Agrega personas al roster primero.</td></tr>
                    )}
                    {personas.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: '700' }}>{p.nombre}</td>
                        {skillsConfig.map(s => {
                          const rating = skillsRatings[p.id]?.[s] || 0;
                          return (
                            <td key={s}>
                              {[1, 2, 3, 4, 5].map(n => (
                                <span
                                  key={n}
                                  onClick={() => puedeGestionOperativa && setRating(p.id, s, n)}
                                  style={{ cursor: puedeGestionOperativa ? 'pointer' : 'default', color: n <= rating ? '#d97706' : 'var(--line)', fontSize: '14px' }}
                                >★</span>
                              ))}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============ CSAT ============ */}
          {subTab === 'csat' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                {puedeGestionRoster && (
                  <button
                    onClick={() => setModalCsat({ mes: '', score: 5, comentario: '' })}
                    style={{ borderRadius: '999px', background: 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color: '#fff', padding: '10px 18px', fontSize: '12px', fontWeight: '900', border: 'none', cursor: 'pointer' }}
                  >
                    + Registrar CSAT del mes
                  </button>
                )}
              </div>
              <div className="tabla-responsive">
                <table className="tabla">
                  <thead>
                    <tr><th>Mes</th><th>Score</th><th>Comentario</th></tr>
                  </thead>
                  <tbody>
                    {csat.length === 0 && (
                      <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: '600' }}>Sin registros de CSAT aún.</td></tr>
                    )}
                    {csat.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: '700' }}>{c.mes}</td>
                        <td>{c.score} / 5</td>
                        <td style={{ color: 'var(--muted)' }}>{c.comentario || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL SEGUIMIENTO */}
      {modalSeguimiento && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,24,38,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--paper-50)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: 22, width: 460, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontWeight: '800', margin: 0, color: 'var(--ink-950)' }}>{modalSeguimiento.nombre}</p>
              <button onClick={() => setModalSeguimiento(null)} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <textarea placeholder="Nota de seguimiento (1:1, feedback, próximos pasos)" value={notaNueva} onChange={e => setNotaNueva(e.target.value)} style={{ width: '100%', minHeight: 70, marginBottom: 12, border: '1px solid var(--line)', borderRadius: '12px', padding: '10px 14px', fontSize: '13px', fontFamily: 'inherit' }} />
            <button disabled={guardandoNota || !notaNueva.trim()} onClick={guardarNota} style={{ border: 'none', borderRadius: '999px', background: 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color: '#fff', padding: '9px 18px', fontSize: '12px', fontWeight: '900', cursor: 'pointer', marginBottom: 16 }}>
              {guardandoNota ? 'Guardando...' : 'Agregar nota'}
            </button>
            <p style={{ fontSize: '12px', fontWeight: '800', margin: '0 0 8px' }}>Historial</p>
            {(!seguimientoMap[modalSeguimiento.id]?.notas || seguimientoMap[modalSeguimiento.id].notas.length === 0) && (
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Sin notas registradas todavía.</p>
            )}
            {seguimientoMap[modalSeguimiento.id]?.notas?.slice().reverse().map((n, i) => (
              <div key={i} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
                <p style={{ fontSize: '13px', margin: 0 }}>{n.texto}</p>
                <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '2px 0 0' }}>
                  {n.autor} · {n.fecha?._seconds ? new Date(n.fecha._seconds * 1000).toLocaleString('es-CL') : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL CSAT */}
      {modalCsat && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,24,38,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--paper-50)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '22px', padding: 22, width: 400 }}>
            <p style={{ fontWeight: '800', margin: '0 0 16px', color: 'var(--ink-950)' }}>Registrar CSAT</p>
            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Mes (formato AAAA-MM)</label>
            <input type="month" value={modalCsat.mes} onChange={e => setModalCsat({ ...modalCsat, mes: e.target.value })} style={{ width: '100%', marginBottom: 12, border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px' }} />
            <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Score — {modalCsat.score} / 5</label>
            <input type="range" min="1" max="5" step="0.1" value={modalCsat.score} onChange={e => setModalCsat({ ...modalCsat, score: Number(e.target.value) })} style={{ width: '100%', marginBottom: 12 }} />
            <textarea placeholder="Comentario (opcional)" value={modalCsat.comentario} onChange={e => setModalCsat({ ...modalCsat, comentario: e.target.value })} style={{ width: '100%', minHeight: 60, marginBottom: 16, border: '1px solid var(--line)', borderRadius: '12px', padding: '9px 14px', fontSize: '13px', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalCsat(null)} style={{ border: '1px solid var(--line)', borderRadius: '999px', background: 'transparent', padding: '9px 16px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' }}>Cancelar</button>
              <button disabled={guardandoCsat || !modalCsat.mes} onClick={guardarCsat} style={{ border: 'none', borderRadius: '999px', background: 'linear-gradient(135deg,var(--ink-900),var(--bank-blue))', color: '#fff', padding: '9px 18px', fontSize: '12px', fontWeight: '900', cursor: 'pointer' }}>
                {guardandoCsat ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
