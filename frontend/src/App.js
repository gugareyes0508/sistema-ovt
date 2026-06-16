import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'https://sistema-ovt-production.up.railway.app';

function App() {
  const [usuario, setUsuario] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [vista, setVista] = useState('mi-resumen');
  const [registros, setRegistros] = useState([]);
  const [mes, setMes] = useState(new Date().toLocaleString('es-ES', { month: '2-digit', year: 'numeric' }).split('/').reverse().join('-'));
  const [ano, setAno] = useState(new Date().getFullYear());
  const [estado, setEstado] = useState('Todos');
  const [formulario, setFormulario] = useState({tipo: 'cambio', descripcion: '', cliente: 'Banco de Chile', fechaInicio: new Date(), fechaFin: new Date(), horas: 0, especialidad: '', interno_cliente: 'interno', genera_ovt: 'si'});
  const [editandoId, setEditandoId] = useState(null);
  const [modalEdicion, setModalEdicion] = useState({abierto: false, registro: null});
  const [formularioModal, setFormularioModal] = useState({});

  useEffect(() => {
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUsuario(payload);
      cargarRegistros();
    }
  }, [token]);

  const cargarRegistros = useCallback(() => {
    if (!token) return;
    axios.get(`${API_URL}/api/registros`, {headers: {Authorization: `Bearer ${token}`}})
      .then(res => setRegistros(res.data))
      .catch(err => console.error('Error cargando registros:', err));
  }, [token]);

  const handleLogin = (e) => {
    e.preventDefault();
    const usuario = e.target.usuario.value;
    const contrasena = e.target.contrasena.value;
    axios.post(`${API_URL}/api/auth/login`, {usuario, contrasena})
      .then(res => {
        setToken(res.data.token);
        localStorage.setItem('token', res.data.token);
      })
      .catch(err => alert('❌ ' + (err.response?.data?.error || err.message)));
  };

  const handleGuardarRegistro = (e) => {
    e.preventDefault();
    const data = {...formulario, horas: parseFloat(formulario.horas)};
    const method = editandoId ? 'patch' : 'post';
    const url = editandoId ? `${API_URL}/api/registros/${editandoId}` : `${API_URL}/api/registros`;
    axios({method, url, data, headers: {Authorization: `Bearer ${token}`}})
      .then(() => {
        alert(editandoId ? '✅ Registro actualizado' : '✅ Registro creado');
        setEditandoId(null);
        setFormulario({tipo: 'cambio', descripcion: '', cliente: 'Banco de Chile', fechaInicio: new Date(), fechaFin: new Date(), horas: 0, especialidad: '', interno_cliente: 'interno', genera_ovt: 'si'});
        cargarRegistros();
      })
      .catch(err => alert('❌ ' + err.message));
  };

  const abrirModalEdicion = (registro) => {
    setModalEdicion({abierto: true, registro});
    setFormularioModal({
      tipo: registro.tipo || 'cambio',
      descripcion: registro.descripcion || '',
      cliente: registro.cliente || 'Banco de Chile',
      fechaInicio: registro.fechaInicio?.toDate ? registro.fechaInicio.toDate() : new Date(registro.fechaInicio),
      fechaFin: registro.fechaFin?.toDate ? registro.fechaFin.toDate() : new Date(registro.fechaFin),
      horas: registro.horas || 0,
      especialidad: registro.especialidad || '',
      interno_cliente: registro.interno_cliente || 'interno',
      genera_ovt: registro.genera_ovt || 'si'
    });
  };

  const guardarDesdeModal = (e) => {
    e.preventDefault();
    axios.patch(`${API_URL}/api/registros/${modalEdicion.registro.id}`, 
      {...formularioModal, estado: 'pendiente'},
      {headers: {Authorization: `Bearer ${token}`}}
    )
    .then(() => {
      alert('✅ Registro guardado y enviado a aprobación');
      setModalEdicion({abierto: false, registro: null});
      cargarRegistros();
    })
    .catch(err => alert('❌ Error: ' + err.message));
  };

  if (!token) {
    return (
      <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}>
        <div style={{background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', maxWidth: '400px', width: '100%'}}>
          <h1 style={{textAlign: 'center', color: '#333', marginBottom: '30px'}}>🔐 Sistema OVT</h1>
          <form onSubmit={handleLogin}>
            <div style={{marginBottom: '15px'}}>
              <label style={{display: 'block', marginBottom: '5px', fontWeight: '600', color: '#333'}}>Usuario</label>
              <input name="usuario" type="text" required style={{width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px'}} />
            </div>
            <div style={{marginBottom: '20px'}}>
              <label style={{display: 'block', marginBottom: '5px', fontWeight: '600', color: '#333'}}>Contraseña</label>
              <input name="contrasena" type="password" required style={{width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px'}} />
            </div>
            <button type="submit" style={{width: '100%', padding: '12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer', fontSize: '16px'}}>Ingresar</button>
          </form>
        </div>
      </div>
    );
  }

  const misRegistrosFiltrados = registros.filter(r => 
    r.createdBy === usuario.usuario && 
    (estado === 'Todos' || r.estado === estado)
  );

  return (
    <div style={{minHeight: '100vh', background: '#f5f5f5'}}>
      <header style={{background: '#667eea', color: 'white', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)'}}>
        <div style={{maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <h1 style={{margin: 0}}>📊 Sistema OVT v2</h1>
          <button onClick={() => {setToken(null); localStorage.removeItem('token')}} style={{background: 'white', color: '#667eea', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600'}}>Logout</button>
        </div>
      </header>

      <main style={{maxWidth: '1200px', margin: '30px auto', padding: '0 20px'}}>
        <div style={{display: 'flex', gap: '10px', marginBottom: '30px', borderBottom: '2px solid #ddd', paddingBottom: '10px'}}>
          {['mi-resumen', 'registrar'].map(v => (
            <button key={v} onClick={() => setVista(v)} style={{padding: '10px 20px', background: vista === v ? '#667eea' : '#ddd', color: vista === v ? 'white' : '#333', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', textTransform: 'capitalize'}}>
              {v === 'mi-resumen' ? '📋 Mi Resumen' : '📝 Registrar'}
            </button>
          ))}
        </div>

        {vista === 'mi-resumen' && (
          <div>
            <h2>📋 Mi Resumen</h2>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px'}}>
              <div style={{background: '#2196F3', color: 'white', padding: '20px', borderRadius: '8px', textAlign: 'center'}}>
                <div style={{fontSize: '12px', marginBottom: '10px'}}>📊 Registros</div>
                <div style={{fontSize: '32px', fontWeight: 'bold'}}>{misRegistrosFiltrados.length}</div>
              </div>
              <div style={{background: '#4CAF50', color: 'white', padding: '20px', borderRadius: '8px', textAlign: 'center'}}>
                <div style={{fontSize: '12px', marginBottom: '10px'}}>✅ Aprobados</div>
                <div style={{fontSize: '32px', fontWeight: 'bold'}}>{misRegistrosFiltrados.filter(r => r.estado === 'exitoso').reduce((acc, r) => acc + (r.horas || 0), 0).toFixed(1)}h</div>
              </div>
              <div style={{background: '#FF9800', color: 'white', padding: '20px', borderRadius: '8px', textAlign: 'center'}}>
                <div style={{fontSize: '12px', marginBottom: '10px'}}>⏳ Pendientes</div>
                <div style={{fontSize: '32px', fontWeight: 'bold'}}>{misRegistrosFiltrados.filter(r => r.estado === 'pendiente').length}</div>
              </div>
            </div>

            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '20px'}}>
              <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}}>
                <option>Todos</option>
                <option>pendiente</option>
                <option>exitoso</option>
                <option>fallido</option>
              </select>
            </div>

            <div style={{background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.1)'}}>
              <table style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{background: '#f5f5f5', borderBottom: '2px solid #ddd'}}>
                    <th style={{padding: '12px', textAlign: 'left', fontWeight: '600'}}>Tipo</th>
                    <th style={{padding: '12px', textAlign: 'left', fontWeight: '600'}}>Descripción</th>
                    <th style={{padding: '12px', textAlign: 'left', fontWeight: '600'}}>Fecha</th>
                    <th style={{padding: '12px', textAlign: 'left', fontWeight: '600'}}>Horas</th>
                    <th style={{padding: '12px', textAlign: 'left', fontWeight: '600'}}>Estado</th>
                    <th style={{padding: '12px', textAlign: 'left', fontWeight: '600'}}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {misRegistrosFiltrados.map(r => (
                    <tr key={r.id} style={{borderBottom: '1px solid #eee'}}>
                      <td style={{padding: '12px'}}>{r.tipo}</td>
                      <td style={{padding: '12px'}}>{r.descripcion}</td>
                      <td style={{padding: '12px'}}>{new Date(r.fechaInicio).toLocaleDateString('es-CL')}</td>
                      <td style={{padding: '12px'}}>{r.horas}h</td>
                      <td style={{padding: '12px'}}>
                        <span style={{padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', background: r.estado === 'pendiente' ? '#FFF3CD' : r.estado === 'exitoso' ? '#D4EDDA' : '#F8D7DA', color: r.estado === 'pendiente' ? '#856404' : r.estado === 'exitoso' ? '#155724' : '#721C24'}}>
                          {r.estado}
                        </span>
                      </td>
                      <td style={{padding: '12px'}}>
                        {r.estado === 'fallido' && <button onClick={() => abrirModalEdicion(r)} style={{padding: '6px 12px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px'}}>✏️ Editar</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {misRegistrosFiltrados.length === 0 && <div style={{padding: '40px', textAlign: 'center', color: '#999'}}>No hay registros</div>}
            </div>
          </div>
        )}

        {vista === 'registrar' && (
          <div style={{background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)'}}>
            <h2>📝 Registrar Cambio/Alerta</h2>
            <form onSubmit={handleGuardarRegistro}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px'}}>
                <div>
                  <label style={{display: 'block', fontWeight: '600', marginBottom: '5px'}}>Tipo</label>
                  <select value={formulario.tipo} onChange={(e) => setFormulario({...formulario, tipo: e.target.value})} style={{width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px'}}>
                    <option value="cambio">Cambio</option>
                    <option value="alerta">Alerta</option>
                  </select>
                </div>
                <div>
                  <label style={{display: 'block', fontWeight: '600', marginBottom: '5px'}}>Cliente</label>
                  <select value={formulario.cliente} onChange={(e) => setFormulario({...formulario, cliente: e.target.value})} style={{width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px'}}>
                    <option value="Banco de Chile">Banco de Chile</option>
                    <option value="Interno">Interno</option>
                  </select>
                </div>
              </div>
              <div style={{marginTop: '20px'}}>
                <label style={{display: 'block', fontWeight: '600', marginBottom: '5px'}}>Descripción</label>
                <textarea value={formulario.descripcion} onChange={(e) => setFormulario({...formulario, descripcion: e.target.value})} style={{width: '100%', minHeight: '100px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontFamily: 'inherit'}} required />
              </div>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '20px', marginTop: '20px'}}>
                <div>
                  <label style={{display: 'block', fontWeight: '600', marginBottom: '5px'}}>Fecha Inicio</label>
                  <input type="date" value={formulario.fechaInicio.toISOString().split('T')[0]} onChange={(e) => setFormulario({...formulario, fechaInicio: new Date(e.target.value)})} style={{width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px'}} required />
                </div>
                <div>
                  <label style={{display: 'block', fontWeight: '600', marginBottom: '5px'}}>Fecha Fin</label>
                  <input type="date" value={formulario.fechaFin.toISOString().split('T')[0]} onChange={(e) => setFormulario({...formulario, fechaFin: new Date(e.target.value)})} style={{width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px'}} required />
                </div>
                <div>
                  <label style={{display: 'block', fontWeight: '600', marginBottom: '5px'}}>Horas</label>
                  <input type="number" value={formulario.horas} onChange={(e) => setFormulario({...formulario, horas: parseFloat(e.target.value)})} style={{width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px'}} step="0.5" />
                </div>
              </div>
              <button type="submit" style={{marginTop: '20px', padding: '12px 24px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '16px'}}>✅ Guardar</button>
            </form>
          </div>
        )}
      </main>

      {/* MODAL - EDICIÓN */}
      {modalEdicion.abierto && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999}}>
          <div style={{background: 'white', padding: '30px', borderRadius: '12px', maxWidth: '600px', width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.3)'}}>
            <h2 style={{marginTop: 0}}>✏️ Editar Registro</h2>
            <form onSubmit={guardarDesdeModal}>
              <div style={{marginBottom: '15px'}}>
                <label style={{fontWeight: '600', marginBottom: '5px', display: 'block'}}>Tipo</label>
                <select value={formularioModal.tipo || 'cambio'} onChange={(e) => setFormularioModal({...formularioModal, tipo: e.target.value})} style={{width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}}>
                  <option value="cambio">Cambio</option>
                  <option value="alerta">Alerta</option>
                </select>
              </div>
              <div style={{marginBottom: '15px'}}>
                <label style={{fontWeight: '600', marginBottom: '5px', display: 'block'}}>Descripción</label>
                <textarea value={formularioModal.descripcion || ''} onChange={(e) => setFormularioModal({...formularioModal, descripcion: e.target.value})} style={{width: '100%', minHeight: '80px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontFamily: 'inherit'}} />
              </div>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px'}}>
                <div>
                  <label style={{fontWeight: '600', marginBottom: '5px', display: 'block'}}>Fecha Inicio</label>
                  <input type="date" value={formularioModal.fechaInicio ? formularioModal.fechaInicio.toISOString().split('T')[0] : ''} onChange={(e) => {if(e.target.value) setFormularioModal({...formularioModal, fechaInicio: new Date(e.target.value)})}} style={{width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}} />
                </div>
                <div>
                  <label style={{fontWeight: '600', marginBottom: '5px', display: 'block'}}>Hora Inicio</label>
                  <input type="time" value={formularioModal.fechaInicio ? formularioModal.fechaInicio.toTimeString().slice(0, 5) : ''} onChange={(e) => {if(e.target.value && formularioModal.fechaInicio){const[h,m]=e.target.value.split(':'); const f=new Date(formularioModal.fechaInicio); f.setHours(parseInt(h),parseInt(m),0); setFormularioModal({...formularioModal, fechaInicio: f})}}} style={{width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}} />
                </div>
              </div>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px'}}>
                <div>
                  <label style={{fontWeight: '600', marginBottom: '5px', display: 'block'}}>Fecha Fin</label>
                  <input type="date" value={formularioModal.fechaFin ? formularioModal.fechaFin.toISOString().split('T')[0] : ''} onChange={(e) => {if(e.target.value){const f=new Date(e.target.value); const inicio=formularioModal.fechaInicio; let h=formularioModal.horas; if(inicio && !isNaN(inicio.getTime()) && !isNaN(f.getTime())){h=parseFloat(Math.max(0,((f-inicio)/(1000*60*60)).toFixed(2)))}setFormularioModal({...formularioModal, fechaFin: f, horas: h})}}} style={{width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}} />
                </div>
                <div>
                  <label style={{fontWeight: '600', marginBottom: '5px', display: 'block'}}>Hora Fin</label>
                  <input type="time" value={formularioModal.fechaFin ? formularioModal.fechaFin.toTimeString().slice(0, 5) : ''} onChange={(e) => {if(e.target.value && formularioModal.fechaFin){const[h,m]=e.target.value.split(':'); const f=new Date(formularioModal.fechaFin); f.setHours(parseInt(h),parseInt(m),0); const inicio=formularioModal.fechaInicio; let horas=formularioModal.horas; if(inicio && !isNaN(inicio.getTime()) && !isNaN(f.getTime())){horas=parseFloat(Math.max(0,((f-inicio)/(1000*60*60)).toFixed(2)))}setFormularioModal({...formularioModal, fechaFin: f, horas: horas})}}} style={{width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}} />
                </div>
              </div>
              <div style={{marginBottom: '15px'}}>
                <label style={{fontWeight: '600', marginBottom: '5px', display: 'block'}}>Horas (Auto)</label>
                <input type="number" value={formularioModal.horas || 0} disabled style={{width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', background: '#f5f5f5', color: '#999'}} />
              </div>
              <div style={{display: 'flex', gap: '10px'}}>
                <button type="submit" style={{flex: 1, padding: '12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600'}}>✅ Guardar y Enviar a Aprobación</button>
                <button type="button" onClick={() => setModalEdicion({abierto: false, registro: null})} style={{flex: 1, padding: '12px', background: '#999', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600'}}>✗ Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
