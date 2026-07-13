import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const VISTAS = [
  { id:'dashboard',        label:'Dashboard',             desc:'Resumen de registros y aprobaciones',    grupo:'Admin/DPE' },
  { id:'analytics',        label:'Analytics',             desc:'Gráficos y análisis de HHEE',            grupo:'Admin/DPE' },
  { id:'ovt-proyectado',   label:'OVT Proyectado',        desc:'Proyecciones de horas extra',            grupo:'Admin/DPE' },
  { id:'claim',            label:'Control de Labor',      desc:'Horas imputadas (Claims)',                grupo:'Admin/DPE' },
  { id:'usuarios',         label:'Gestión de Usuarios',   desc:'Crear y editar usuarios y grupos',        grupo:'Admin/DPE' },
  { id:'mantenedor',       label:'Mantenedor',            desc:'Gestión y aprobación de registros',       grupo:'Admin/DPE' },
  { id:'auditoria',        label:'Auditoría',             desc:'Log de acciones del sistema',             grupo:'Admin/DPE' },
  { id:'permisos-roles',   label:'Permisos de Roles',     desc:'Configurar accesos por rol',              grupo:'Admin/DPE' },
  { id:'registros',        label:'Registrar Cambio/Alerta','desc':'Formulario de nuevo registro',         grupo:'Especialista' },
  { id:'resumen',          label:'Mi Resumen',            desc:'Historial personal del especialista',     grupo:'Especialista' },
  { id:'carga-excel',      label:'Cargar Excel',          desc:'Carga masiva desde planilla propia',      grupo:'Especialista' },
  { id:'proyeccion-nueva', label:'Nueva Proyección ITSM', desc:'Crear proyección de tickets',             grupo:'ITSM' },
  { id:'proyeccion-mis',   label:'Mis Proyecciones ITSM', desc:'Historial de proyecciones ITSM',          grupo:'ITSM' },
  { id:'proyeccion-excel', label:'Cargar Excel ITSM',     desc:'Carga masiva Excel ITSM',                 grupo:'ITSM' },
];

const ROLES = [
  { id:'admin',        label:'admin',        color:'var(--danger)', bg:'#fee2e2' },
  { id:'dpe',          label:'dpe',          color:'var(--bank-blue)', bg:'#eff6ff' },
  { id:'teamleader',   label:'teamleader',   color:'#7c3aed', bg:'#ede9fe' },
  { id:'especialista', label:'especialista', color:'#d97706', bg:'#fef3c7' },
  { id:'itsm',         label:'itsm',         color:'var(--success)', bg:'#d1fae5' },
];

const GRUPOS = ['Admin/DPE','Especialista','ITSM'];

const PERMISOS_DEFAULT = {
  admin:        { dashboard:true, analytics:true, 'ovt-proyectado':true, claim:true, usuarios:true, mantenedor:true, auditoria:true, 'permisos-roles':true, registros:false, resumen:false, 'carga-excel':false, 'proyeccion-nueva':false, 'proyeccion-mis':false, 'proyeccion-excel':false },
  dpe:          { dashboard:true, analytics:true, 'ovt-proyectado':true, claim:true, usuarios:true, mantenedor:false, auditoria:false, 'permisos-roles':false, registros:false, resumen:false, 'carga-excel':false, 'proyeccion-nueva':false, 'proyeccion-mis':false, 'proyeccion-excel':false },
  teamleader:   { dashboard:true, analytics:true, 'ovt-proyectado':false, claim:false, usuarios:false, mantenedor:false, auditoria:false, 'permisos-roles':false, registros:false, resumen:false, 'carga-excel':false, 'proyeccion-nueva':false, 'proyeccion-mis':false, 'proyeccion-excel':false },
  especialista: { dashboard:false, analytics:false, 'ovt-proyectado':false, claim:false, usuarios:false, mantenedor:false, auditoria:false, 'permisos-roles':false, registros:true, resumen:true, 'carga-excel':true, 'proyeccion-nueva':false, 'proyeccion-mis':false, 'proyeccion-excel':false },
  itsm:         { dashboard:false, analytics:false, 'ovt-proyectado':false, claim:false, usuarios:false, mantenedor:false, auditoria:false, 'permisos-roles':false, registros:false, resumen:false, 'carga-excel':false, 'proyeccion-nueva':true, 'proyeccion-mis':true, 'proyeccion-excel':true },
};

const Toggle = ({ activo, disabled, onChange }) => (
  <button
    onClick={disabled ? undefined : onChange}
    aria-checked={activo}
    role="switch"
    style={{
      width:'38px', height:'22px', borderRadius:'11px', border:'none', cursor: disabled ? 'not-allowed' : 'pointer',
      background: disabled ? 'var(--line)' : activo ? 'var(--success)' : 'var(--line)',
      position:'relative', transition:'background .15s', flexShrink:0, opacity: disabled ? 0.5 : 1
    }}
  >
    <span style={{
      position:'absolute', top:'3px', left: activo ? '19px' : '3px',
      width:'16px', height:'16px', borderRadius:'50%', background:'rgba(255,255,255,0.84)',
      transition:'left .15s', boxShadow:'0 1px 3px rgba(0,0,0,.2)', display:'block'
    }} />
  </button>
);

const PermisosRoles = ({ token, apiUrl }) => {
  const [permisos, setPermisos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${apiUrl}/api/permisos-roles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPermisos(res.data);
    } catch {
      setPermisos(JSON.parse(JSON.stringify(PERMISOS_DEFAULT)));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, token]);

  useEffect(() => { cargar(); }, [cargar]);

  const togglePermiso = (rol, vista) => {
    if (rol === 'admin') return;
    setPermisos(prev => ({
      ...prev,
      [rol]: { ...prev[rol], [vista]: !prev[rol]?.[vista] }
    }));
    setDirty(true);
    setMensaje(null);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await axios.post(`${apiUrl}/api/permisos-roles`, permisos, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDirty(false);
      setMensaje({ tipo:'ok', texto:'✓ Permisos guardados correctamente. Los cambios se aplicarán en el próximo login.' });
    } catch (err) {
      setMensaje({ tipo:'error', texto:'❌ Error: ' + (err.response?.data?.error || err.message) });
    } finally {
      setGuardando(false);
    }
  };

  const resetear = () => {
    setPermisos(JSON.parse(JSON.stringify(PERMISOS_DEFAULT)));
    setDirty(true);
    setMensaje(null);
  };

  if (loading) return <section className="seccion"><p style={{textAlign:'center',color:'var(--muted)',padding:'40px'}}>⏳ Cargando permisos...</p></section>;

  return (
    <section className="seccion">
      <h2>🔐 Permisos de Roles</h2>
      <p style={{fontSize:'13px',color:'var(--muted)',marginBottom:'20px',marginTop:'-10px'}}>
        Define qué módulos ve cada rol. Los cambios se aplican en el próximo inicio de sesión.
      </p>

      {/* Info admin */}
      <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'14px',padding:'10px 14px',fontSize:'12px',color:'#1e40af',marginBottom:'20px',display:'flex',gap:'8px'}}>
        <span>ℹ️</span>
        <span>El rol <strong>admin</strong> siempre tiene acceso a todo y no puede ser restringido.</span>
      </div>

      {/* Acciones rápidas por columna */}
      <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
        {ROLES.filter(r=>r.id!=='admin').map(r => (
          <div key={r.id} style={{display:'flex',gap:'4px',alignItems:'center'}}>
            <span style={{fontSize:'11px',color:'var(--muted)'}}>
              <span style={{background:r.bg,color:r.color,padding:'2px 8px',borderRadius:'8px',fontWeight:'600',fontSize:'11px'}}>{r.label}</span>
            </span>
            <button onClick={() => {
              const todas = VISTAS.every(v => permisos[r.id]?.[v.id]);
              const nuevo = {};
              VISTAS.forEach(v => { nuevo[v.id] = !todas; });
              setPermisos(prev => ({ ...prev, [r.id]: { ...prev[r.id], ...nuevo } }));
              setDirty(true);
            }} style={{fontSize:'10px',padding:'2px 7px',background:'var(--paper-100)',border:'1px solid #e5e7eb',borderRadius:'8px',cursor:'pointer',color:'var(--ink-800)'}}>
              {VISTAS.every(v => permisos[r.id]?.[v.id]) ? 'Desactivar todo' : 'Activar todo'}
            </button>
          </div>
        ))}
        <button onClick={resetear} style={{fontSize:'10px',padding:'2px 10px',background:'none',border:'1px solid #e5e7eb',borderRadius:'8px',cursor:'pointer',color:'var(--muted)',marginLeft:'auto'}}>
          🔄 Restaurar defaults
        </button>
      </div>

      {/* TABLA MATRIZ */}
      <div className="tabla-responsive">
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:'600px'}}>
          <thead>
            <tr style={{background:'var(--paper-100)',borderBottom:'2px solid #e5e7eb'}}>
              <th style={{padding:'12px 14px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.4px',minWidth:'200px'}}>Vista / Módulo</th>
              {ROLES.map(r => (
                <th key={r.id} style={{padding:'12px 14px',textAlign:'center',fontSize:'11px',fontWeight:'700',minWidth:'100px'}}>
                  <span style={{background:r.bg,color:r.color,padding:'3px 10px',borderRadius:'16px',fontSize:'11px',fontWeight:'700'}}>
                    {r.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GRUPOS.map(grupo => {
              const vistasGrupo = VISTAS.filter(v => v.grupo === grupo);
              return (
                <React.Fragment key={grupo}>
                  <tr>
                    <td colSpan={ROLES.length + 1} style={{padding:'8px 14px',background:'var(--paper-100)',fontSize:'11px',fontWeight:'700',color:'var(--ink-800)',textTransform:'uppercase',letterSpacing:'.5px',borderBottom:'1px solid #e5e7eb'}}>
                      {grupo}
                    </td>
                  </tr>
                  {vistasGrupo.map(v => (
                    <tr key={v.id} style={{borderBottom:'1px solid #f3f4f6'}}>
                      <td style={{padding:'12px 14px',verticalAlign:'middle'}}>
                        <div style={{fontWeight:'600',fontSize:'13px',color:'var(--ink-950)'}}>{v.label}</div>
                        <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{v.desc}</div>
                      </td>
                      {ROLES.map(r => (
                        <td key={r.id} style={{padding:'12px 14px',textAlign:'center',verticalAlign:'middle'}}>
                          <div style={{display:'flex',justifyContent:'center'}}>
                            <Toggle
                              activo={r.id === 'admin' ? true : !!permisos[r.id]?.[v.id]}
                              disabled={r.id === 'admin'}
                              onChange={() => togglePermiso(r.id, v.id)}
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mensaje y botones */}
      {mensaje && (
        <div style={{
          marginTop:'16px', padding:'10px 14px', borderRadius:'14px', fontSize:'13px',
          background: mensaje.tipo==='ok' ? '#d1fae5' : '#fee2e2',
          color: mensaje.tipo==='ok' ? 'var(--success)' : '#991b1b',
          border: `1px solid ${mensaje.tipo==='ok' ? '#a7f3d0' : '#fca5a5'}`
        }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{display:'flex',gap:'10px',marginTop:'20px',alignItems:'center',flexWrap:'wrap'}}>
        <button
          onClick={guardar}
          disabled={!dirty || guardando}
          style={{
            padding:'11px 24px', background: (!dirty||guardando) ? 'var(--line)' : 'var(--kyn-red)',
            color:'rgba(255,255,255,0.84)', border:'none', borderRadius:'14px', fontWeight:'700', fontSize:'13px',
            cursor: (!dirty||guardando) ? 'not-allowed' : 'pointer', transition:'background .2s'
          }}
        >
          {guardando ? '⏳ Guardando...' : '💾 Guardar Permisos'}
        </button>
        {dirty && (
          <span style={{fontSize:'12px',color:'#d97706',fontWeight:'600'}}>
            ⚠️ Hay cambios sin guardar
          </span>
        )}
      </div>
    </section>
  );
};

export default PermisosRoles;
