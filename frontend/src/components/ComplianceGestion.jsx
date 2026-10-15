import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ESTADOS_GESTION, historialOrdenado, agruparPorMes, claveHost, fechaLarga } from '../utils/compliance';

// ============================================
// Piezas de la gestión de servidores (módulo Compliance):
//  · ModalGestion     — ventana emergente para gestionar uno o varios equipos
//  · HistorialGestion — historial ordenado (más reciente primero, por mes, con scroll)
//  · BuscadorEquipo   — consulta cualquier equipo del inventario, aunque hoy cumpla
// ============================================

const LIMITE_HISTORIAL = 4; // entradas visibles antes de "Ver todo"
const labelStyle = { fontSize: '10px', fontWeight: 800, color: 'var(--muted)', display: 'block', marginBottom: 3, letterSpacing: '.03em' };
const inputStyle = { fontFamily: 'inherit', fontSize: '12px', border: '1px solid var(--line)', borderRadius: '10px', padding: '8px 10px', background: '#fff', color: 'var(--ink-950)', boxSizing: 'border-box', width: '100%' };
const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const valorCambio = (campo, v) => (campo === 'Fecha de resolución' ? fechaLarga(v) : v);
const etiquetaCambio = (c) => {
  if (c.de === '') return `${c.campo}: ${valorCambio(c.campo, c.a)}`;
  if (c.a === '') return `${c.campo}: ${valorCambio(c.campo, c.de)} → (vacío)`;
  return `${c.campo}: ${valorCambio(c.campo, c.de)} → ${valorCambio(c.campo, c.a)}`;
};

export function HistorialGestion({ entradas }) {
  const [verTodo, setVerTodo] = useState(false);
  const ordenadas = useMemo(() => historialOrdenado(entradas), [entradas]);
  if (entradas === null || entradas === undefined) return <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Cargando historial...</div>;
  if (ordenadas.length === 0) return <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Sin gestión registrada todavía.</div>;
  const visibles = verTodo ? ordenadas : ordenadas.slice(0, LIMITE_HISTORIAL);
  const grupos = agruparPorMes(visibles);
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', marginBottom: 6 }}>HISTORIAL ({ordenadas.length})</div>
      <div data-historial style={{
        maxHeight: verTodo ? 300 : 'none', overflowY: verTodo ? 'auto' : 'visible',
        ...(verTodo ? { border: '1px solid var(--line)', borderRadius: '10px', padding: '4px 10px' } : {})
      }}>
        {grupos.map(g => (
          <div key={g.mes}>
            {(verTodo || grupos.length > 1) && (
              <div style={{ position: 'sticky', top: 0, background: '#fff', fontSize: '10px', fontWeight: 800, color: 'var(--bank-blue)', padding: '4px 0', zIndex: 1 }}>{g.mes}</div>
            )}
            {g.entradas.map((h, i) => (
              <div key={`${h.fecha}-${i}`} style={{ borderLeft: '2px solid rgba(18,52,78,.15)', padding: '0 0 10px 10px', fontSize: '11px', color: 'var(--ink-800)' }}>
                <div><b>{h.usuario}</b> <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{fechaHora(h.fecha)}</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '3px 0' }}>
                  {h.cambios.length === 0
                    ? <span style={{ fontSize: '10px', color: 'var(--muted)' }}>Sin cambios en los campos</span>
                    : h.cambios.map(c => (
                      <span key={c.campo} style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,59,113,.08)', color: '#003b71' }}>{etiquetaCambio(c)}</span>
                    ))}
                </div>
                {h.comentario && <div style={{ background: 'rgba(18,52,78,.04)', borderRadius: '8px', padding: '5px 8px', fontStyle: 'italic' }}>{h.comentario}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
      {verTodo && <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: 4 }}>Desplázate dentro del recuadro para ver las {ordenadas.length} entradas.</div>}
      {ordenadas.length > LIMITE_HISTORIAL && (
        <button type="button" onClick={() => setVerTodo(v => !v)}
          style={{ border: 'none', background: 'transparent', color: 'var(--bank-blue)', fontWeight: 800, fontSize: '11px', cursor: 'pointer', padding: '4px 0' }}>
          {verTodo ? 'Ver menos' : `Ver todo (${ordenadas.length})`}
        </button>
      )}
    </div>
  );
}

// inicial: { estado, asignatario ('' | id | 'texto:Nombre'), asignatarioNombre, responsableBanco, certificador, fecha, comentario }
export function ModalGestion({ titulo, chips, esMasivo, inicial, asignables, sugerencias, historial, actualizado, onGuardar, onCerrar, guardando, error }) {
  const [f, setF] = useState(inicial);
  const primero = useRef(null);
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;

  useEffect(() => { if (primero.current) primero.current.focus(); }, []);
  useEffect(() => {
    const alTeclado = (e) => { if (e.key === 'Escape' && !guardando) cerrarRef.current(); };
    document.addEventListener('keydown', alTeclado);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', alTeclado); document.body.style.overflow = antes; };
  }, [guardando]);

  const opcionesAsignatario = useMemo(() => {
    const o = [{ v: '', t: esMasivo ? '(sin cambio)' : '— Sin asignar —' }];
    asignables.forEach(p => o.push({ v: p.usuario, t: `${p.nombre}${p.grupo || p.rol ? ` · ${p.grupo || p.rol}` : ''}` }));
    if (inicial.asignatario && !asignables.some(p => p.usuario === inicial.asignatario)) {
      o.push({ v: inicial.asignatario, t: `${inicial.asignatarioNombre || inicial.asignatario} (valor anterior)` });
    }
    return o;
  }, [asignables, inicial, esMasivo]);

  const guardar = () => {
    let asignatarioId = '';
    let asignatario = '';
    if (f.asignatario.startsWith('texto:')) asignatario = f.asignatario.slice(6);
    else if (f.asignatario) {
      const p = asignables.find(x => x.usuario === f.asignatario);
      asignatarioId = f.asignatario;
      asignatario = p ? p.nombre : (inicial.asignatarioNombre || f.asignatario);
    }
    onGuardar({ estado: f.estado, asignatarioId, asignatario, responsableBanco: f.responsableBanco, certificador: f.certificador, fechaResolucion: f.fecha, comentario: f.comentario });
  };

  const campo = (rotulo, hijo) => <div><label style={labelStyle}>{rotulo}</label>{hijo}</div>;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,24,38,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-modal-gestion"
        style={{ background: '#fff', borderRadius: '22px', boxShadow: '0 30px 80px rgba(6,24,38,.35)', width: '100%', maxWidth: 780, maxHeight: '92vh', overflowY: 'auto', padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
          <div id="titulo-modal-gestion" style={{ fontSize: '15px', fontWeight: 800, color: 'var(--ink-950)', wordBreak: 'break-all' }}>{titulo}</div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" disabled={guardando}
            style={{ border: '1px solid var(--line)', background: 'transparent', borderRadius: '999px', width: 30, height: 30, cursor: 'pointer', fontSize: '14px', color: 'var(--muted)', flexShrink: 0 }}>✕</button>
        </div>
        {chips && chips.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {chips.map((c, i) => (
              <span key={i} style={{ fontSize: '10px', fontWeight: 800, padding: '3px 9px', borderRadius: '999px', background: c.alerta ? 'rgba(215,59,71,.12)' : 'rgba(18,52,78,.06)', color: c.alerta ? '#a61e2b' : 'var(--muted)' }}>{c.texto}</span>
            ))}
          </div>
        )}
        {actualizado && <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: 8 }}>Última gestión: {actualizado}</div>}
        {esMasivo && (
          <div style={{ background: 'rgba(240,161,26,.1)', border: '1px solid rgba(240,161,26,.35)', borderRadius: '12px', padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: '#8a5a06', marginBottom: 10 }}>
            Los campos que dejes vacíos (o en "sin cambio") no se modifican en ningún equipo.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 10 }}>
          {campo('ESTADO', (
            <select ref={primero} value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })} style={inputStyle}>
              {esMasivo && <option value="">(sin cambio)</option>}
              {ESTADOS_GESTION.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          ))}
          {campo('ASIGNATARIO (PERSONA DEL CLIENTE)', (
            <select value={f.asignatario} onChange={e => setF({ ...f, asignatario: e.target.value })} style={inputStyle}>
              {opcionesAsignatario.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
            </select>
          ))}
          {campo('FECHA DE RESOLUCIÓN', <input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} style={inputStyle} />)}
          {campo('RESPONSABLE BANCO', (
            <>
              <input list="sugerencias-responsable-banco" value={f.responsableBanco} onChange={e => setF({ ...f, responsableBanco: e.target.value })} placeholder="Persona del Banco" style={inputStyle} />
              <datalist id="sugerencias-responsable-banco">{sugerencias.responsablesBanco.map(v => <option key={v} value={v} />)}</datalist>
            </>
          ))}
          {campo('CERTIFICADOR', (
            <>
              <input list="sugerencias-certificador" value={f.certificador} onChange={e => setF({ ...f, certificador: e.target.value })} placeholder="Quien certifica la resolución" style={inputStyle} />
              <datalist id="sugerencias-certificador">{sugerencias.certificadores.map(v => <option key={v} value={v} />)}</datalist>
            </>
          ))}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>COMENTARIO / ACCIÓN</label>
          <textarea rows={3} value={f.comentario} onChange={e => setF({ ...f, comentario: e.target.value })}
            placeholder="Ej: se agenda escaneo de hardening para el viernes; pendiente de ventana con el cliente"
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        {error && <div style={{ background: 'rgba(215,59,71,0.08)', border: '1px solid rgba(215,59,71,0.24)', borderRadius: '12px', padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: '#a61e2b', marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: esMasivo ? 0 : 16 }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
            style={{ padding: '9px 18px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, border: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando}
            style={{ padding: '9px 18px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, border: 'none', background: guardando ? 'var(--muted)' : 'var(--bank-blue)', color: '#fff', cursor: guardando ? 'not-allowed' : 'pointer' }}>
            {guardando ? 'Guardando...' : 'Guardar gestión'}
          </button>
        </div>

        {!esMasivo && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <HistorialGestion entradas={historial} />
          </div>
        )}
      </div>
    </div>
  );
}

export function BuscadorEquipo({ rows, estadoDe, onElegir }) {
  const [q, setQ] = useState('');
  const termino = q.trim().toLowerCase();
  const resultados = useMemo(() => {
    if (termino.length < 2) return [];
    const vistos = new Set();
    const out = [];
    for (let i = 0; i < rows.length && out.length < 8; i++) {
      const r = rows[i];
      if (r.host.toLowerCase().includes(termino)) {
        const k = claveHost(r.host);
        if (!vistos.has(k)) { vistos.add(k); out.push(r); }
      }
    }
    return out;
  }, [termino, rows]);
  return (
    <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.72)', borderRadius: '18px', boxShadow: 'var(--shadow-soft)', padding: '12px 14px', marginBottom: 10 }}>
      <label style={labelStyle}>CONSULTAR UN EQUIPO</label>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Escribe parte del hostname..." aria-label="Consultar un equipo"
        style={{ ...inputStyle, maxWidth: 360 }} />
      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: 4 }}>Busca en todo el inventario de la hoja, aunque el equipo hoy cumpla o esté fuera de los filtros: sirve para ver su gestión anterior.</div>
      {resultados.length > 0 && (
        <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
          {resultados.map(r => (
            <button key={claveHost(r.host)} type="button" onClick={() => { onElegir(claveHost(r.host)); setQ(''); }}
              style={{ display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: '10px', background: '#fff', cursor: 'pointer', fontSize: '11px', color: 'var(--ink-800)' }}>
              <b style={{ minWidth: 180 }}>{r.host}</b>
              <span>{r.adh === null ? 'adherencia 0% (sin dato)' : `adherencia ${r.adh}%`}</span>
              <span style={{ color: 'var(--muted)' }}>{r.amb || '—'} · {r.ubi || '—'}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 800, color: 'var(--bank-blue)' }}>{estadoDe(r)}</span>
            </button>
          ))}
        </div>
      )}
      {termino.length >= 2 && resultados.length === 0 && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: 8 }}>Sin coincidencias en el inventario de esta semana.</div>}
    </div>
  );
}
