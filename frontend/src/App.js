import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'https://sistema-ovt-production.up.railway.app';

function App() {
  const [usuario, setUsuario] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [vista, setVista] = useState('mi-resumen');
  const [registros, setRegistros] = useState([
    {id: '1', tipo: 'cambio', descripcion: 'Cambio de configuración', cliente: 'Banco de Chile', fechaInicio: new Date('2026-06-10'), fechaFin: new Date('2026-06-10'), horas: 2, estado: 'fallido', especialista: 'Jorge Maureira'},
    {id: '2', tipo: 'alerta', descripcion: 'Alerta de mantenimiento', cliente: 'Banco de Chile', fechaInicio: new Date('2026-06-11'), fechaFin: new Date('2026-06-11'), horas: 1, estado: 'exitoso', especialista: 'Jorge Maureira'},
    {id: '3', tipo: 'cambio', descripcion: 'Mantenimiento 2', cliente: 'Banco de Chile', fechaInicio: new Date('2026-06-12'), fechaFin: new Date('2026-06-12'), horas: 3, estado: 'pendiente', especialista: 'Jorge Maureira'}
  ]);
  const [filtros, setFiltros] = useState({ mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), estado: null });
  const [modalEdicion, setModalEdicion] = useState({abierto: false, registro: null});
  const [formularioModal, setFormularioModal] = useState({});

  useEffect(() => {
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUsuario(payload);
    }
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

  const handleLogout = () => {
    setToken(null);
    setUsuario(null);
    localStorage.removeItem('token');
  };

  const abrirModalEdicion = (registro) => {
    if (registro.estado !== 'fallido') {
      alert('❌ Solo puedes editar registros rechazados');
      return;
    }
    alert('ℹ️ Editando registro rechazado. Puedes corregir y reenviarlo.');
    setModalEdicion({abierto: true, registro});
    setFormularioModal({
      tipo: registro.tipo,
      descripcion: registro.descripcion,
      cliente: registro.cliente,
      fechaInicio: registro.fechaInicio,
      fechaFin: registro.fechaFin,
      horas: registro.horas
    });
  };

  const guardarDesdeModal = (e) => {
    e.preventDefault();
    alert('✅ Registro guardado y enviado a aprobación');
    
    // Actualizar estado del registro a pendiente
    const registrosActualizados = registros.map(r => 
      r.id === modalEdicion.registro.id 
        ? {...r, ...formularioModal, estado: 'pendiente'}
        : r
    );
    setRegistros(registrosActualizados);
    setModalEdicion({abierto: false, registro: null});
  };

  if (!token) {
    return (
      <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}>
        <div style={{background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', maxWidth: '400px', width: '100%'}}>
          <h1 style={{textAlign: 'center', color: '#333', marginBottom: '30px'}}>🔐 Sistema OVT</h1>
          <form onSubmit={handleLogin}>
            <div style={{marginBottom: '15px'}}>
              <label style={{display: 'block', marginBottom: '5px', fontWeight: '600', color: '#333'}}>Usuario</label>
              <input name="usuario" type="text" defaultValue="jorge.maureira" required style={{width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px'}} />
            </div>
            <div style={{marginBottom: '20px'}}>
              <label style={{display: 'block', marginBottom: '5px', fontWeight: '600', color: '#333'}}>Contraseña</label>
              <input name="contrasena" type="password" defaultValue="demo123" required style={{width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px'}} />
            </div>
            <button type="submit" style={{width: '100%', padding: '12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '4px', fontWeight: '600', cursor: 'pointer', fontSize: '16px'}}>Ingresar</button>
          </form>
        </div>
      </div>
    );
  }

  const misRegistros = registros.filter(r => {
    const fecha = r.fechaInicio;
    if (fecha.getMonth() + 1 !== filtros.mes) return false;
    if (fecha.getFullYear() !== filtros.anio) return false;
    if (filtros.estado && r.estado !== filtros.estado) return false;
    return true;
  });

  return (
    <div style={{minHeight: '100vh', background: '#f5f5f5'}}>
      <header style={{background: '#667eea', color: 'white', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)'}}>
        <div style={{maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <h1 style={{margin: 0}}>📊 Sistema OVT v2</h1>
          <div>
            <span style={{marginRight: '20px'}}>{usuario?.usuario} ({usuario?.rol})</span>
            <button onClick={handleLogout} style={{background: 'white', color: '#667eea', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600'}}>Logout</button>
          </div>
        </div>
      </header>

      <main style={{maxWidth: '1200px', margin: '30px auto', padding: '0 20px'}}>
        <div style={{display: 'flex', gap: '10px', marginBottom: '30px', borderBottom: '2px solid #ddd', paddingBottom: '10px'}}>
          <button onClick={() => setVista('mi-resumen')} style={{padding: '10px 20px', background: vista === 'mi-resumen' ? '#667eea' : '#ddd', color: vista === 'mi-resumen' ? 'white' : '#333', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600'}}>
            📋 Mi Resumen
          </button>
          <button onClick={() => setVista('registrar')} style={{padding: '10px 20px', background: vista === 'registrar' ? '#667eea' : '#ddd', color: vista === 'registrar' ? 'white' : '#333', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600'}}>
            📝 Registrar
          </button>
        </div>

        {vista === 'mi-resumen' && (
          <div style={{background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)'}}>
            <h2>📋 Mi Resumen</h2>
            
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px'}}>
              <div style={{background: '#2196F3', color: 'white', padding: '20px', borderRadius: '8px', textAlign: 'center'}}>
                <div style={{fontSize: '12px', marginBottom: '10px'}}>📊 Registros</div>
                <div style={{fontSize: '32px', fontWeight: 'bold'}}>{misRegistros.length}</div>
              </div>
              <div style={{background: '#4CAF50', color: 'white', padding: '20px', borderRadius: '8px', textAlign: 'center'}}>
                <div style={{fontSize: '12px', marginBottom: '10px'}}>✅ Aprobados</div>
                <div style={{fontSize: '32px', fontWeight: 'bold'}}>{misRegistros.filter(r => r.estado === 'exitoso').reduce((sum, r) => sum + (r.horas || 0), 0).toFixed(1)}h</div>
              </div>
              <div style={{background: '#FF9800', color: 'white', padding: '20px', borderRadius: '8px', textAlign: 'center'}}>
                <div style={{fontSize: '12px', marginBottom: '10px'}}>⏳ Pendientes</div>
                <div style={{fontSize: '32px', fontWeight: 'bold'}}>{misRegistros.filter(r => r.estado === 'pendiente').length}</div>
              </div>
            </div>

            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '20px'}}>
              <div>
                <label style={{fontWeight: '600', display: 'block', marginBottom: '5px'}}>Mes</label>
                <select value={filtros.mes} onChange={(e) => setFiltros({...filtros, mes: parseInt(e.target.value)})} style={{width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}}>
                  {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{new Date(2026, i).toLocaleString('es-CL', {month: 'long'})}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontWeight: '600', display: 'block', marginBottom: '5px'}}>Año</label>
                <select value={filtros.anio} onChange={(e) => setFiltros({...filtros, anio: parseInt(e.target.value)})} style={{width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}}>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                </select>
              </div>
              <div>
                <label style={{fontWeight: '600', display: 'block', marginBottom: '5px'}}>Estado</label>
                <select value={filtros.estado || ''} onChange={(e) => setFiltros({...filtros, estado: e.target.value || null})} style={{width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}}>
                  <option value="">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="exitoso">Aprobado</option>
                  <option value="fallido">Rechazado</option>
                </select>
              </div>
            </div>

            <h3>Mis Registros</h3>
            {misRegistros.length === 0 ? (
              <p style={{color: '#999'}}>No hay registros para este período</p>
            ) : (
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
                  {misRegistros.map(r => (
                    <tr key={r.id} style={{borderBottom: '1px solid #eee'}}>
                      <td style={{padding: '12px'}}>{r.tipo}</td>
                      <td style={{padding: '12px'}}>{r.descripcion}</td>
                      <td style={{padding: '12px'}}>{r.fechaInicio.toLocaleDateString('es-CL')}</td>
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
            )}
          </div>
        )}

        {vista === 'registrar' && (
          <div style={{background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)'}}>
            <h2>📝 Registrar Cambio/Alerta</h2>
            <p style={{color: '#666'}}>Aquí puedes crear nuevos registros de cambios o alertas</p>
          </div>
        )}
      </main>

      {/* MODAL */}
      {modalEdicion.abierto && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999}}>
          <div style={{background: 'white', padding: '30px', borderRadius: '12px', maxWidth: '600px', width: '95%', maxHeight: '90vh', overflowY: 'auto'}}>
            <h2 style={{marginTop: 0}}>✏️ Editar Registro</h2>
            <form onSubmit={guardarDesdeModal}>
              <div style={{marginBottom: '15px'}}>
                <label style={{fontWeight: '600', marginBottom: '5px', display: 'block'}}>Tipo</label>
                <select value={formularioModal.tipo || ''} onChange={(e) => setFormularioModal({...formularioModal, tipo: e.target.value})} style={{width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}}>
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
                  <input type="date" value={formularioModal.fechaInicio ? formularioModal.fechaInicio.toISOString().split('T')[0] : ''} onChange={(e) => setFormularioModal({...formularioModal, fechaInicio: new Date(e.target.value)})} style={{width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}} />
                </div>
                <div>
                  <label style={{fontWeight: '600', marginBottom: '5px', display: 'block'}}>Fecha Fin</label>
                  <input type="date" value={formularioModal.fechaFin ? formularioModal.fechaFin.toISOString().split('T')[0] : ''} onChange={(e) => setFormularioModal({...formularioModal, fechaFin: new Date(e.target.value)})} style={{width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}} />
                </div>
              </div>
              <div style={{marginBottom: '15px'}}>
                <label style={{fontWeight: '600', marginBottom: '5px', display: 'block'}}>Horas</label>
                <input type="number" value={formularioModal.horas || 0} onChange={(e) => setFormularioModal({...formularioModal, horas: parseFloat(e.target.value)})} style={{width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}} step="0.5" />
              </div>
              <div style={{display: 'flex', gap: '10px'}}>
                <button type="submit" style={{flex: 1, padding: '12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600'}}>✅ Guardar y Enviar</button>
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
