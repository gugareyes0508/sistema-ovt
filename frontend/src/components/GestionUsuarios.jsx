import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const ROLES = ['admin','dpe','teamleader','itsm','especialista'];
const EMPRESAS = ['Kyndryl','Incosec','Biznet','Otra'];
const ROL_COLORS = { admin:'var(--danger)', dpe:'var(--bank-blue)', teamleader:'#7c3aed', itsm:'var(--success)', especialista:'#d97706', coordinador:'#7c3aed' };

const Badge = ({ text, color='var(--muted)' }) => (
  <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:'16px', fontSize:'11px', fontWeight:'600',
    background:`${color}18`, color, border:`1px solid ${color}40`, whiteSpace:'nowrap' }}>{text}</span>
);

// IMPORTANTE: Input y Select deben vivir FUERA de GestionUsuarios.
// Si se definen dentro del componente, se recrean como funciones nuevas en cada
// render (cada tecla que se escribe dispara un re-render vía setModalUser), y
// React las trata como un tipo de componente distinto: desmonta y remonta el
// <input> del DOM en cada letra, perdiendo el foco cada vez.
const Input = ({ label, ...props }) => (
  <div style={{ marginBottom:'12px' }}>
    {label && <label style={{ display:'block', fontSize:'12px', fontWeight:'600', color:'var(--muted)', marginBottom:'5px' }}>{label}</label>}
    <input style={{ width:'100%', padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:'14px', fontSize:'13px', boxSizing:'border-box' }} {...props} />
  </div>
);
const Select = ({ label, options, ...props }) => (
  <div style={{ marginBottom:'12px' }}>
    {label && <label style={{ display:'block', fontSize:'12px', fontWeight:'600', color:'var(--muted)', marginBottom:'5px' }}>{label}</label>}
    <select style={{ width:'100%', padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:'14px', fontSize:'13px' }} {...props}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const GestionUsuarios = ({ token, apiUrl, rolUsuario = 'admin' }) => {
  const esAdmin = rolUsuario === 'admin';

  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros tabla
  const [filtroCliente, setFiltroCliente] = useState('todos');
  const [filtroRol, setFiltroRol] = useState('todos');
  const [filtroBusq, setFiltroBusq] = useState('');

  // Paginación de la tabla — la consulta a Firestore ya trae solo los
  // usuarios del cliente activo (una sola llamada, sin costo extra); esto
  // solo pagina lo que se MUESTRA, para que la tabla no renderice todo de
  // una. El buscador sigue funcionando sobre el set completo ya cargado.
  const [pagina, setPagina] = useState(1);
  const PAGE_SIZE = 10;
  useEffect(() => { setPagina(1); }, [filtroCliente, filtroRol, filtroBusq]);

  // Modal usuario
  const [modalUser, setModalUser] = useState({ abierto:false, modo:'crear', datos:{} });
  // Modal cliente
  const [modalCliente, setModalCliente] = useState({ abierto:false });
  const [nuevoClienteId, setNuevoClienteId] = useState('');
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('');
  // Modal grupo (crear)
  const [modalGrupo, setModalGrupo] = useState({ abierto:false, clienteId:'' });
  const [nuevoGrupoNombre, setNuevoGrupoNombre] = useState('');
  const [nuevoGrupoDesc, setNuevoGrupoDesc] = useState('');
  // Modal editar grupo
  const [modalEditGrupo, setModalEditGrupo] = useState({ abierto:false, grupo:null });
  const [editGrupoNombre, setEditGrupoNombre] = useState('');
  const [editGrupoDesc, setEditGrupoDesc] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [resU, resC, resG] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/listar-usuarios`, { headers }),
        axios.get(`${apiUrl}/api/clientes`, { headers }),
        axios.get(`${apiUrl}/api/grupos-servicio`, { headers })
      ]);
      setUsuarios(resU.data.usuarios || []);
      setClientes(resC.data || []);
      setGrupos(resG.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, token]);

  useEffect(() => { cargar(); }, [cargar]);

  const gruposDeCliente = (cId) => grupos.filter(g => g.clienteId === cId);
  const nombreCliente = (id) => clientes.find(c => c.id === id)?.nombre || id;
  const nombreGrupo = (id) => grupos.find(g => g.id === id)?.nombre || '—';

  // ── Filtrado ──
  const usuariosFiltrados = usuarios.filter(u => {
    if (filtroRol !== 'todos' && u.rol !== filtroRol) return false;
    if (filtroCliente !== 'todos' && !(u.clientesIds||[]).includes(filtroCliente)) return false;
    if (filtroBusq) {
      const b = filtroBusq.toLowerCase();
      if (!u.nombre.toLowerCase().includes(b) && !u.usuario.toLowerCase().includes(b)) return false;
    }
    return true;
  });

  const totalPaginas = Math.max(1, Math.ceil(usuariosFiltrados.length / PAGE_SIZE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const usuariosPagina = usuariosFiltrados.slice((paginaSegura-1)*PAGE_SIZE, paginaSegura*PAGE_SIZE);

  // ── Crear / Editar usuario ──
  const abrirModalCrear = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setModalUser({
      abierto: true, modo: 'crear',
      datos: { usuario:'', nombre:'', rol:'especialista', empresa:'Kyndryl', contrasena:'', departamento:'', clientesIds:[], gruposPorCliente:{}, haceOVT:true }
    });
  };

  const abrirModalEditar = (u) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Migración: si el usuario aún trae solo el grupoServicioId viejo (single),
    // se mapea al primer cliente para no perder el dato al editar.
    const gruposPorClienteInicial = u.gruposPorCliente && Object.keys(u.gruposPorCliente).length > 0
      ? u.gruposPorCliente
      : (u.grupoServicioId ? { [(u.clientesIds||['bcochile'])[0]]: u.grupoServicioId } : {});
    setModalUser({
      abierto: true, modo: 'editar',
      datos: { ...u, contrasena:'', gruposPorCliente: gruposPorClienteInicial }
    });
  };

  const guardarUsuario = async () => {
    const { datos, modo } = modalUser;
    if (!datos.usuario || !datos.nombre || (modo==='crear' && !datos.contrasena)) {
      alert('Usuario, nombre y contraseña son requeridos'); return;
    }
    if (datos.clientesIds.length === 0) { alert('Selecciona al menos un cliente'); return; }
    try {
      if (modo === 'crear') {
        await axios.post(`${apiUrl}/api/admin/crear-usuario`, datos, { headers });
        alert(`✅ Usuario ${datos.usuario} creado`);
      } else {
        const payload = { usuario: datos.usuario, nombre: datos.nombre, rol: datos.rol,
          empresa: datos.empresa, departamento: datos.departamento,
          clientesIds: datos.clientesIds, gruposPorCliente: datos.gruposPorCliente || {}, haceOVT: datos.haceOVT };
        await axios.post(`${apiUrl}/api/admin/editar-usuario`, payload, { headers });
        if (datos.contrasena) {
          await axios.post(`${apiUrl}/api/admin/resetear-contrasena`, { usuario: datos.usuario, contraseñaNueva: datos.contrasena }, { headers });
        }
        alert('✅ Usuario actualizado');
      }
      setModalUser({ abierto:false, modo:'crear', datos:{} });
      cargar();
    } catch (err) { alert('❌ ' + (err.response?.data?.error || err.message)); }
  };

  const eliminarUsuario = async (u) => {
    if (!window.confirm(`¿Eliminar a ${u.nombre}? No se puede deshacer.`)) return;
    try {
      await axios.post(`${apiUrl}/api/admin/eliminar-usuario`, { usuario: u.usuario }, { headers });
      alert('✅ Usuario eliminado'); cargar();
    } catch (err) { alert('❌ ' + (err.response?.data?.error || err.message)); }
  };

  const toggleHaceOVT = async (u) => {
    try {
      await axios.post(`${apiUrl}/api/admin/editar-usuario`, { usuario: u.usuario, haceOVT: !u.haceOVT }, { headers });
      cargar();
    } catch (err) { alert('❌ ' + err.message); }
  };

  // ── Crear cliente ──
  const crearCliente = async () => {
    if (!nuevoClienteId || !nuevoClienteNombre) { alert('ID y nombre requeridos'); return; }
    try {
      await axios.post(`${apiUrl}/api/clientes`, { id: nuevoClienteId.toLowerCase().replace(/\s/g,''), nombre: nuevoClienteNombre }, { headers });
      alert('✅ Cliente creado'); setModalCliente({abierto:false}); setNuevoClienteId(''); setNuevoClienteNombre(''); cargar();
    } catch (err) { alert('❌ ' + (err.response?.data?.error || err.message)); }
  };

  // ── Crear grupo ──
  const crearGrupo = async () => {
    if (!nuevoGrupoNombre) { alert('Nombre requerido'); return; }
    try {
      await axios.post(`${apiUrl}/api/grupos-servicio`, { clienteId: modalGrupo.clienteId, nombre: nuevoGrupoNombre, descripcion: nuevoGrupoDesc }, { headers });
      alert('✅ Grupo creado'); setModalGrupo({abierto:false, clienteId:''}); setNuevoGrupoNombre(''); setNuevoGrupoDesc(''); cargar();
    } catch (err) { alert('❌ ' + (err.response?.data?.error || err.message)); }
  };

  // ── Editar grupo ──
  const abrirEditarGrupo = (grupo) => {
    setModalEditGrupo({ abierto:true, grupo });
    setEditGrupoNombre(grupo.nombre);
    setEditGrupoDesc(grupo.descripcion || '');
  };

  const guardarEditGrupo = async () => {
    if (!editGrupoNombre) { alert('Nombre requerido'); return; }
    try {
      await axios.patch(`${apiUrl}/api/grupos-servicio/${modalEditGrupo.grupo.id}`, { nombre: editGrupoNombre, descripcion: editGrupoDesc }, { headers });
      alert('✅ Grupo actualizado'); setModalEditGrupo({abierto:false, grupo:null}); cargar();
    } catch (err) { alert('❌ ' + (err.response?.data?.error || err.message)); }
  };

  // ── Eliminar grupo ──
  const eliminarGrupo = async (grupo) => {
    if (!window.confirm(`¿Eliminar el grupo "${grupo.nombre}"?\nLos usuarios asignados a este grupo perderán su grupo.`)) return;
    try {
      await axios.delete(`${apiUrl}/api/grupos-servicio/${grupo.id}`, { headers });
      alert('✅ Grupo eliminado'); cargar();
    } catch (err) { alert('❌ ' + (err.response?.data?.error || err.message)); }
  };

  // ── helpers UI ──

  if (loading) return <section className="seccion"><p style={{textAlign:'center',color:'var(--muted)',padding:'40px'}}>⏳ Cargando...</p></section>;

  return (
    <section className="seccion">
      <h2>👥 Gestión de Usuarios</h2>

      {/* CLIENTES Y GRUPOS */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'14px', marginBottom:'28px' }}>
        {clientes.map(c => (
          <div key={c.id} style={{ background:'var(--paper-100)', border:'1px solid #e5e7eb', borderRadius:'16px', padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <div>
                <span style={{ fontWeight:'700', fontSize:'14px' }}>{c.nombre}</span>
                <span style={{ fontSize:'11px', color:'var(--muted)', marginLeft:'8px' }}>#{c.id}</span>
              </div>
              <button onClick={() => setModalGrupo({abierto:true, clienteId:c.id})}
                style={{ fontSize:'11px', padding:'4px 10px', background:'var(--bank-blue)', color:'rgba(255,255,255,0.84)', border:'none', borderRadius:'10px', cursor:'pointer' }}>
                + Grupo
              </button>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
              {gruposDeCliente(c.id).map(g => (
                <div key={g.id} style={{ display:'flex', alignItems:'center', gap:'4px', background:'#e0f2fe', borderRadius:'8px', padding:'2px 4px 2px 8px' }}>
                  <span style={{ fontSize:'11px', color:'var(--bank-blue)' }}>{g.nombre}</span>
                  <button onClick={() => abrirEditarGrupo(g)} title="Editar grupo"
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:'11px', padding:'0 2px', color:'var(--bank-blue)', lineHeight:1 }}>✏️</button>
                  <button onClick={() => eliminarGrupo(g)} title="Eliminar grupo"
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:'11px', padding:'0 2px', color:'var(--danger)', lineHeight:1 }}>✕</button>
                </div>
              ))}
              {gruposDeCliente(c.id).length === 0 && <span style={{ fontSize:'11px', color:'var(--muted)' }}>Sin grupos</span>}
            </div>
            <div style={{ fontSize:'11px', color:'var(--muted)', marginTop:'8px' }}>
              {usuarios.filter(u=>(u.clientesIds||[]).includes(c.id)).length} usuarios
            </div>
          </div>
        ))}
        {/* Nuevo Cliente — SOLO ADMIN */}
        {esAdmin && (
          <div style={{ border:'1.5px dashed #d1d5db', borderRadius:'16px', padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <button onClick={() => setModalCliente({abierto:true})}
              style={{ fontSize:'13px', color:'var(--muted)', background:'none', border:'none', cursor:'pointer', fontWeight:'600' }}>
              🏦 + Nuevo Cliente
            </button>
          </div>
        )}
      </div>

      {/* FILTROS + BOTÓN CREAR */}
      <div style={{ display:'flex', gap:'10px', alignItems:'flex-end', flexWrap:'wrap', marginBottom:'18px', background:'var(--paper-100)', border:'1px solid #e5e7eb', borderRadius:'14px', padding:'12px 16px' }}>
        <div style={{ flex:1, minWidth:'160px' }}>
          <label style={{ fontSize:'11px', fontWeight:'600', color:'var(--muted)', display:'block', marginBottom:'4px' }}>Buscar</label>
          <input value={filtroBusq} onChange={e=>setFiltroBusq(e.target.value)} placeholder="Nombre o usuario..."
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:'10px', fontSize:'13px' }} />
        </div>
        <div style={{ minWidth:'140px' }}>
          <label style={{ fontSize:'11px', fontWeight:'600', color:'var(--muted)', display:'block', marginBottom:'4px' }}>Cliente</label>
          <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)}
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:'10px', fontSize:'13px' }}>
            <option value="todos">Todos</option>
            {clientes.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div style={{ minWidth:'130px' }}>
          <label style={{ fontSize:'11px', fontWeight:'600', color:'var(--muted)', display:'block', marginBottom:'4px' }}>Rol</label>
          <select value={filtroRol} onChange={e=>setFiltroRol(e.target.value)}
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #d1d5db', borderRadius:'10px', fontSize:'13px' }}>
            <option value="todos">Todos</option>
            {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button onClick={abrirModalCrear}
          style={{ padding:'9px 18px', background:'var(--kyn-red)', color:'rgba(255,255,255,0.84)', border:'none', borderRadius:'14px', fontWeight:'700', fontSize:'13px', cursor:'pointer', whiteSpace:'nowrap' }}>
          ➕ Nuevo Usuario
        </button>
      </div>

      {/* TABLA USUARIOS */}
      <div className="tabla-responsive">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Cliente(s)</th>
              <th>Grupo</th>
              <th>Empresa</th>
              <th>OVT</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuariosPagina.map(u => (
              <tr key={u.usuario}>
                <td><strong>{u.nombre}</strong></td>
                <td style={{ fontSize:'12px', color:'var(--muted)' }}>@{u.usuario}</td>
                <td><Badge text={u.rol} color={ROL_COLORS[u.rol]||'var(--muted)'} /></td>
                <td style={{ fontSize:'12px' }}>
                  {(u.clientesIds||['bcochile']).map(cId=>(
                    <span key={cId} style={{ display:'inline-block', marginRight:'4px', marginBottom:'2px', background:'#eff6ff', color:'var(--bank-blue)', fontSize:'10px', padding:'2px 6px', borderRadius:'8px' }}>
                      {nombreCliente(cId)}
                    </span>
                  ))}
                </td>
                <td style={{ fontSize:'12px', color:'var(--muted)' }}>
                  {(() => {
                    const clientesUsuario = u.clientesIds || ['bcochile'];
                    const mapa = u.gruposPorCliente || (u.grupoServicioId ? { [clientesUsuario[0]]: u.grupoServicioId } : {});
                    const entradas = clientesUsuario.filter(cId => mapa[cId]);
                    if (entradas.length === 0) return '—';
                    if (clientesUsuario.length === 1) return nombreGrupo(mapa[entradas[0]]);
                    return entradas.map(cId => (
                      <div key={cId} style={{ whiteSpace:'nowrap' }}>
                        <span style={{ color:'var(--ink-800)', fontWeight:'600' }}>{nombreCliente(cId)}:</span> {nombreGrupo(mapa[cId])}
                      </div>
                    ));
                  })()}
                </td>
                <td style={{ fontSize:'12px' }}>{u.empresa||'Kyndryl'}</td>
                <td>
                  <button onClick={() => toggleHaceOVT(u)}
                    style={{ padding:'3px 10px', borderRadius:'16px', fontSize:'11px', fontWeight:'700', border:'none', cursor:'pointer',
                      background: u.haceOVT ? '#d1fae5' : 'var(--paper-100)', color: u.haceOVT ? 'var(--success)' : 'var(--muted)' }}>
                    {u.haceOVT ? '✓ OVT' : 'Solo Labor'}
                  </button>
                </td>
                <td>
                  <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                    <button onClick={() => abrirModalEditar(u)} className="btn-editar">✏️ Editar</button>
                    {u.usuario !== 'admin' && (
                      <button onClick={() => eliminarUsuario(u)} className="btn-rechazar">🗑️</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {usuariosFiltrados.length === 0 && <p className="sin-datos">Sin usuarios para los filtros seleccionados</p>}

        {usuariosFiltrados.length > PAGE_SIZE && (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'14px', fontSize:'13px' }}>
            <span style={{ color:'var(--muted)' }}>
              Mostrando {(paginaSegura-1)*PAGE_SIZE+1}–{Math.min(paginaSegura*PAGE_SIZE, usuariosFiltrados.length)} de {usuariosFiltrados.length}
            </span>
            <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
              <button onClick={() => setPagina(p => Math.max(1, p-1))} disabled={paginaSegura===1}
                style={{ padding:'6px 12px', borderRadius:'10px', border:'1px solid #d1d5db', background:'white', cursor: paginaSegura===1?'not-allowed':'pointer', opacity: paginaSegura===1?0.5:1 }}>
                ← Anterior
              </button>
              <span style={{ color:'var(--muted)' }}>Página {paginaSegura} de {totalPaginas}</span>
              <button onClick={() => setPagina(p => Math.min(totalPaginas, p+1))} disabled={paginaSegura===totalPaginas}
                style={{ padding:'6px 12px', borderRadius:'10px', border:'1px solid #d1d5db', background:'white', cursor: paginaSegura===totalPaginas?'not-allowed':'pointer', opacity: paginaSegura===totalPaginas?0.5:1 }}>
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL USUARIO ── */}
      {modalUser.abierto && (
        <div style={{ position:'fixed', inset:0, background:'rgba(6,24,38,0.5)', display:'flex', alignItems:'flex-start', justifyContent:'center', zIndex:9999, padding:'20px', overflowY:'auto' }}>
          <div style={{ background:'var(--glass-strong)', backdropFilter:'blur(22px)', borderRadius:'22px', padding:'28px', border:'1px solid rgba(255,255,255,0.72)', width:'100%', maxWidth:'560px', marginTop:'40px', boxShadow:'var(--shadow-lift)' }}>
            <h3 style={{ marginTop:0, marginBottom:'20px' }}>
              {modalUser.modo === 'crear' ? '➕ Nuevo Usuario' : `✏️ Editar — ${modalUser.datos.nombre}`}
            </h3>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 14px' }}>
              <Input label="Usuario *" value={modalUser.datos.usuario||''} disabled={modalUser.modo==='editar'}
                onChange={e=>setModalUser(p=>({...p,datos:{...p.datos,usuario:e.target.value}}))} placeholder="ej: juan.perez" />
              <Input label="Nombre completo *" value={modalUser.datos.nombre||''}
                onChange={e=>setModalUser(p=>({...p,datos:{...p.datos,nombre:e.target.value}}))} />
              <Select label="Rol *" value={modalUser.datos.rol||'especialista'}
                onChange={e=>setModalUser(p=>({...p,datos:{...p.datos,rol:e.target.value}}))}
                options={ROLES.map(r=>({value:r,label:r}))} />
              <Select label="Empresa" value={modalUser.datos.empresa||'Kyndryl'}
                onChange={e=>setModalUser(p=>({...p,datos:{...p.datos,empresa:e.target.value}}))}
                options={EMPRESAS.map(e=>({value:e,label:e}))} />
              <Input label={modalUser.modo==='crear' ? 'Contraseña *' : 'Nueva contraseña (opcional)'}
                type="password" value={modalUser.datos.contrasena||''}
                onChange={e=>setModalUser(p=>({...p,datos:{...p.datos,contrasena:e.target.value}}))}
                placeholder={modalUser.modo==='editar' ? 'Dejar vacío para no cambiar' : ''} />
              <Input label="Departamento" value={modalUser.datos.departamento||''}
                onChange={e=>setModalUser(p=>({...p,datos:{...p.datos,departamento:e.target.value}}))} />
            </div>

            {/* Clientes — multi-checkbox */}
            <div style={{ marginBottom:'12px' }}>
              <label style={{ display:'block', fontSize:'12px', fontWeight:'600', color:'var(--muted)', marginBottom:'8px' }}>Clientes * (puede tener acceso a más de uno)</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                {clientes.map(c => {
                  const sel = (modalUser.datos.clientesIds||[]).includes(c.id);
                  return (
                    <label key={c.id} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'6px 12px', border:`1px solid ${sel?'var(--bank-blue)':'var(--line)'}`,
                      borderRadius:'14px', cursor:'pointer', background: sel?'#eff6ff':'rgba(255,255,255,0.84)', fontSize:'13px' }}>
                      <input type="checkbox" checked={sel} onChange={() => {
                        const ids = modalUser.datos.clientesIds||[];
                        setModalUser(p=>{
                          const nuevosIds = sel ? ids.filter(x=>x!==c.id) : [...ids,c.id];
                          const nuevosGrupos = { ...(p.datos.gruposPorCliente||{}) };
                          if (sel) delete nuevosGrupos[c.id]; // al quitar el cliente, se limpia su grupo asignado
                          return {...p,datos:{...p.datos,clientesIds: nuevosIds, gruposPorCliente: nuevosGrupos}};
                        });
                      }} />
                      {c.nombre}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Grupo de servicio — uno por cada cliente asignado, así un usuario
                con acceso a más de un cliente puede tener grupos distintos */}
            {(modalUser.datos.clientesIds||[]).length > 0 && (
              <div style={{ marginBottom:'12px' }}>
                <label style={{ display:'block', fontSize:'12px', fontWeight:'600', color:'var(--muted)', marginBottom:'5px' }}>Grupo de Servicio (por cliente)</label>
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {(modalUser.datos.clientesIds||[]).map(cId => (
                    <div key={cId} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                      <span style={{ fontSize:'12px', color:'var(--ink-800)', fontWeight:'600', minWidth:'110px' }}>{nombreCliente(cId)}</span>
                      <select value={(modalUser.datos.gruposPorCliente||{})[cId] || ''}
                        onChange={e=>setModalUser(p=>({...p,datos:{...p.datos,gruposPorCliente:{...(p.datos.gruposPorCliente||{}), [cId]: e.target.value}}}))}
                        style={{ flex:1, padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:'14px', fontSize:'13px' }}>
                        <option value="">Sin grupo</option>
                        {gruposDeCliente(cId).map(g=><option key={g.id} value={g.id}>{g.nombre}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Toggle haceOVT */}
            <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px', background:'var(--paper-100)', borderRadius:'14px', marginBottom:'20px' }}>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'600' }}>
                <div style={{ position:'relative', width:'38px', height:'22px', flexShrink:0 }} onClick={()=>setModalUser(p=>({...p,datos:{...p.datos,haceOVT:!p.datos.haceOVT}}))}>
                  <div style={{ width:'38px', height:'22px', borderRadius:'11px', background: modalUser.datos.haceOVT?'var(--success)':'var(--line)', transition:'background .2s' }}></div>
                  <div style={{ position:'absolute', top:'3px', left: modalUser.datos.haceOVT?'19px':'3px', width:'16px', height:'16px', borderRadius:'50%', background:'rgba(255,255,255,0.84)', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }}></div>
                </div>
                ¿Hace OVT?
              </label>
              <span style={{ fontSize:'12px', color:'var(--muted)' }}>{modalUser.datos.haceOVT ? 'Registra horas extra en el módulo OVT' : 'Solo carga horas en Control de Labor (Claims)'}</span>
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={guardarUsuario} style={{ flex:1, padding:'11px', background:'var(--kyn-red)', color:'rgba(255,255,255,0.84)', border:'none', borderRadius:'14px', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>
                {modalUser.modo==='crear' ? '✅ Crear Usuario' : '✅ Guardar Cambios'}
              </button>
              <button onClick={()=>setModalUser({abierto:false,modo:'crear',datos:{}})}
                style={{ flex:1, padding:'11px', background:'var(--paper-100)', color:'var(--ink-800)', border:'1px solid #d1d5db', borderRadius:'14px', fontWeight:'600', fontSize:'13px', cursor:'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CLIENTE ── */}
      {modalCliente.abierto && (
        <div style={{ position:'fixed', inset:0, background:'rgba(6,24,38,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }}>
          <div style={{ background:'var(--glass-strong)', backdropFilter:'blur(22px)', borderRadius:'22px', padding:'28px', border:'1px solid rgba(255,255,255,0.72)', width:'100%', maxWidth:'400px', boxShadow:'var(--shadow-lift)' }}>
            <h3 style={{ marginTop:0, marginBottom:'20px' }}>🏦 Nuevo Cliente</h3>
            <div style={{ marginBottom:'12px' }}>
              <label style={{ display:'block', fontSize:'12px', fontWeight:'600', color:'var(--muted)', marginBottom:'5px' }}>ID único (slug) *</label>
              <input value={nuevoClienteId} onChange={e=>setNuevoClienteId(e.target.value)} placeholder="ej: santander"
                style={{ width:'100%', padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:'14px', fontSize:'13px', boxSizing:'border-box' }} />
              <small style={{ fontSize:'11px', color:'var(--muted)' }}>Sin espacios, solo minúsculas</small>
            </div>
            <div style={{ marginBottom:'20px' }}>
              <label style={{ display:'block', fontSize:'12px', fontWeight:'600', color:'var(--muted)', marginBottom:'5px' }}>Nombre *</label>
              <input value={nuevoClienteNombre} onChange={e=>setNuevoClienteNombre(e.target.value)} placeholder="ej: Banco Santander"
                style={{ width:'100%', padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:'14px', fontSize:'13px', boxSizing:'border-box' }} />
            </div>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={crearCliente} style={{ flex:1, padding:'11px', background:'var(--kyn-red)', color:'rgba(255,255,255,0.84)', border:'none', borderRadius:'14px', fontWeight:'700', cursor:'pointer' }}>✅ Crear</button>
              <button onClick={()=>setModalCliente({abierto:false})} style={{ flex:1, padding:'11px', background:'var(--paper-100)', color:'var(--ink-800)', border:'1px solid #d1d5db', borderRadius:'14px', fontWeight:'600', cursor:'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EDITAR GRUPO ── */}
      {modalEditGrupo.abierto && (
        <div style={{ position:'fixed', inset:0, background:'rgba(6,24,38,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }}>
          <div style={{ background:'var(--glass-strong)', backdropFilter:'blur(22px)', borderRadius:'22px', padding:'28px', border:'1px solid rgba(255,255,255,0.72)', width:'100%', maxWidth:'400px', boxShadow:'var(--shadow-lift)' }}>
            <h3 style={{ marginTop:0, marginBottom:'6px' }}>✏️ Editar Grupo</h3>
            <p style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'20px' }}>
              Cliente: <strong>{nombreCliente(modalEditGrupo.grupo?.clienteId)}</strong>
            </p>
            <div style={{ marginBottom:'12px' }}>
              <label style={{ display:'block', fontSize:'12px', fontWeight:'600', color:'var(--muted)', marginBottom:'5px' }}>Nombre *</label>
              <input value={editGrupoNombre} onChange={e=>setEditGrupoNombre(e.target.value)}
                style={{ width:'100%', padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:'14px', fontSize:'13px', boxSizing:'border-box' }} />
            </div>
            <div style={{ marginBottom:'20px' }}>
              <label style={{ display:'block', fontSize:'12px', fontWeight:'600', color:'var(--muted)', marginBottom:'5px' }}>Descripción</label>
              <input value={editGrupoDesc} onChange={e=>setEditGrupoDesc(e.target.value)}
                style={{ width:'100%', padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:'14px', fontSize:'13px', boxSizing:'border-box' }} />
            </div>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={guardarEditGrupo} style={{ flex:1, padding:'11px', background:'var(--kyn-red)', color:'rgba(255,255,255,0.84)', border:'none', borderRadius:'14px', fontWeight:'700', cursor:'pointer' }}>✅ Guardar</button>
              <button onClick={()=>setModalEditGrupo({abierto:false,grupo:null})} style={{ flex:1, padding:'11px', background:'var(--paper-100)', color:'var(--ink-800)', border:'1px solid #d1d5db', borderRadius:'14px', fontWeight:'600', cursor:'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {modalGrupo.abierto && (
        <div style={{ position:'fixed', inset:0, background:'rgba(6,24,38,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }}>
          <div style={{ background:'var(--glass-strong)', backdropFilter:'blur(22px)', borderRadius:'22px', padding:'28px', border:'1px solid rgba(255,255,255,0.72)', width:'100%', maxWidth:'400px', boxShadow:'var(--shadow-lift)' }}>
            <h3 style={{ marginTop:0, marginBottom:'6px' }}>📂 Nuevo Grupo de Servicio</h3>
            <p style={{ fontSize:'12px', color:'var(--muted)', marginBottom:'20px' }}>Cliente: <strong>{nombreCliente(modalGrupo.clienteId)}</strong></p>
            <div style={{ marginBottom:'12px' }}>
              <label style={{ display:'block', fontSize:'12px', fontWeight:'600', color:'var(--muted)', marginBottom:'5px' }}>Nombre *</label>
              <input value={nuevoGrupoNombre} onChange={e=>setNuevoGrupoNombre(e.target.value)} placeholder="ej: Middleware"
                style={{ width:'100%', padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:'14px', fontSize:'13px', boxSizing:'border-box' }} />
            </div>
            <div style={{ marginBottom:'20px' }}>
              <label style={{ display:'block', fontSize:'12px', fontWeight:'600', color:'var(--muted)', marginBottom:'5px' }}>Descripción</label>
              <input value={nuevoGrupoDesc} onChange={e=>setNuevoGrupoDesc(e.target.value)} placeholder="Descripción opcional"
                style={{ width:'100%', padding:'9px 12px', border:'1px solid #d1d5db', borderRadius:'14px', fontSize:'13px', boxSizing:'border-box' }} />
            </div>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={crearGrupo} style={{ flex:1, padding:'11px', background:'var(--kyn-red)', color:'rgba(255,255,255,0.84)', border:'none', borderRadius:'14px', fontWeight:'700', cursor:'pointer' }}>✅ Crear</button>
              <button onClick={()=>setModalGrupo({abierto:false, clienteId:''})} style={{ flex:1, padding:'11px', background:'var(--paper-100)', color:'var(--ink-800)', border:'1px solid #d1d5db', borderRadius:'14px', fontWeight:'600', cursor:'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default GestionUsuarios;
