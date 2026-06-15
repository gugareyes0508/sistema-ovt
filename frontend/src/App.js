import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [usuario, setUsuario] = useState(JSON.parse(localStorage.getItem('usuario') || '{}'));
  const [registros, setRegistros] = useState([]);
  const [formulario, setFormulario] = useState({
    idCambio: '',
    nombreCambio: '',
    cliente: '',
    horas: '0.5'
  });
  const [dashboard, setDashboard] = useState({
    totalRegistros: 0,
    totalHoras: 0,
    pendientes: 0,
    aprobados: 0,
    rechazados: 0
  });
  const [vista, setVista] = useState('registros');
  const [auditoria, setAuditoria] = useState([]);

  // Cargar registros
  const cargarRegistros = useCallback(async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_URL}/api/registros`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRegistros(response.data || []);
    } catch (err) {
      console.error('Error:', err.message);
    }
  }, [token]);

  // Cargar dashboard
  const cargarDashboard = useCallback(async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_URL}/api/dashboard/resumen`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDashboard(response.data || {});
    } catch (err) {
      console.error('Error:', err.message);
    }
  }, [token]);

  // Cargar auditoría
  const cargarAuditoria = useCallback(async () => {
    if (!token || usuario.rol !== 'admin') return;
    try {
      const response = await axios.get(`${API_URL}/api/auditoria`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAuditoria(response.data || []);
    } catch (err) {
      console.error('Error:', err.message);
    }
  }, [token, usuario.rol]);

  // Efecto: cargar datos al iniciar
  useEffect(() => {
    cargarRegistros();
    cargarDashboard();
    if (usuario.rol === 'admin') {
      cargarAuditoria();
    }
  }, [token, cargarRegistros, cargarDashboard, cargarAuditoria, usuario.rol]);

  // Login
  const manejarLogin = async (e) => {
    e.preventDefault();
    const usuarioInput = e.target.usuario.value;
    const contrasena = e.target.contrasena.value;

    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        usuario: usuarioInput,
        contrasena
      });

      localStorage.setItem('token', response.data.token);
      localStorage.setItem('usuario', JSON.stringify(response.data.usuario));
      setToken(response.data.token);
      setUsuario(response.data.usuario);
      setVista('registros');
    } catch (err) {
      alert('Credenciales incorrectas');
      e.target.reset();
    }
  };

  // Logout
  const manejarLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setToken(null);
    setUsuario({});
    setVista('registros');
  };

  // Registrar horas
  const manejarRegistro = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/registros`, formulario, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFormulario({ idCambio: '', nombreCambio: '', cliente: '', horas: '0.5' });
      cargarRegistros();
      cargarDashboard();
      alert('Horas registradas correctamente');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Aprobar registro
  const manejarAprobar = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/registros/${id}/aprobar`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      cargarRegistros();
      cargarDashboard();
      alert('Registro aprobado');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Rechazar registro
  const manejarRechazar = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/registros/${id}/rechazar`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      cargarRegistros();
      cargarDashboard();
      alert('Registro rechazado');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // ============================================
  // VISTA: LOGIN
  // ============================================
  if (!token) {
    return (
      <div className="container-login">
        <div className="login-box">
          <h1>🕐 Sistema OVT</h1>
          <h2>Control de Overtime</h2>
          <form onSubmit={manejarLogin}>
            <input type="text" name="usuario" placeholder="Usuario" required autoFocus />
            <input type="password" name="contrasena" placeholder="Contraseña" required />
            <button type="submit">Iniciar Sesión</button>
          </form>
          <div className="login-footer">
            <p>Sistema de Control de Overtime - Kyndryl Chile</p>
            <p className="version">v1.0.0</p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // VISTA: APLICACIÓN PRINCIPAL
  // ============================================
  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="header-left">
          <h1>🕐 Sistema OVT</h1>
        </div>
        <div className="header-right">
          <span className="user-badge">
            {usuario.nombre} <br />
            <small>({usuario.rol})</small>
          </span>
          <button className="btn-logout" onClick={manejarLogout}>Salir</button>
        </div>
      </header>

      {/* NAVEGACIÓN */}
      <nav className="nav">
        <button 
          className={vista === 'registros' ? 'nav-btn active' : 'nav-btn'} 
          onClick={() => setVista('registros')}
        >
          📋 Mis Registros
        </button>

        {(usuario.rol === 'coordinador' || usuario.rol === 'admin') && (
          <>
            <button 
              className={vista === 'mantenedor' ? 'nav-btn active' : 'nav-btn'} 
              onClick={() => setVista('mantenedor')}
            >
              ⚙️ Mantenedor
            </button>
            <button 
              className={vista === 'dashboard' ? 'nav-btn active' : 'nav-btn'} 
              onClick={() => setVista('dashboard')}
            >
              📊 Dashboard
            </button>
          </>
        )}

        {usuario.rol === 'admin' && (
          <button 
            className={vista === 'auditoria' ? 'nav-btn active' : 'nav-btn'} 
            onClick={() => setVista('auditoria')}
          >
            🔍 Auditoría
          </button>
        )}
      </nav>

      {/* CONTENIDO PRINCIPAL */}
      <main className="main">
        
        {/* SECCIÓN: MIS REGISTROS */}
        {vista === 'registros' && (
          <section className="seccion">
            <h2>📋 Registrar Horas de Overtime</h2>
            
            <form onSubmit={manejarRegistro} className="formulario">
              <div className="form-group">
                <label>ID del Cambio *</label>
                <input
                  type="text"
                  placeholder="Ej: CHG-2024-001"
                  value={formulario.idCambio}
                  onChange={(e) => setFormulario({ ...formulario, idCambio: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Nombre del Cambio</label>
                <input
                  type="text"
                  placeholder="Ej: Actualización Sistema"
                  value={formulario.nombreCambio}
                  onChange={(e) => setFormulario({ ...formulario, nombreCambio: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Cliente</label>
                <input
                  type="text"
                  placeholder="Ej: Cliente A"
                  value={formulario.cliente}
                  onChange={(e) => setFormulario({ ...formulario, cliente: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Horas *</label>
                <select
                  value={formulario.horas}
                  onChange={(e) => setFormulario({ ...formulario, horas: e.target.value })}
                >
                  <option value="0.5">0.5 horas</option>
                  <option value="1">1 hora</option>
                  <option value="1.5">1.5 horas</option>
                  <option value="2">2 horas</option>
                  <option value="2.5">2.5 horas</option>
                  <option value="3">3 horas</option>
                  <option value="4">4 horas</option>
                  <option value="8">8 horas (Jornada)</option>
                </select>
              </div>

              <button type="submit" className="btn-primary">✓ Registrar Horas</button>
            </form>

            <h3>Tus Registros</h3>
            {registros.length === 0 ? (
              <p className="sin-datos">No hay registros</p>
            ) : (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>ID Cambio</th>
                    <th>Nombre</th>
                    <th>Cliente</th>
                    <th>Horas</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r.id}>
                      <td><strong>{r.idCambio}</strong></td>
                      <td>{r.nombreCambio || '-'}</td>
                      <td>{r.cliente || '-'}</td>
                      <td className="numero">{r.horas}</td>
                      <td>
                        <span className={`badge badge-${r.estado}`}>
                          {r.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* SECCIÓN: MANTENEDOR (Coordinador/Admin) */}
        {vista === 'mantenedor' && (usuario.rol === 'coordinador' || usuario.rol === 'admin') && (
          <section className="seccion">
            <h2>⚙️ Mantenedor - Aprobar/Rechazar Registros</h2>
            
            {registros.length === 0 ? (
              <p className="sin-datos">No hay registros pendientes</p>
            ) : (
              <table className="tabla tabla-acciones">
                <thead>
                  <tr>
                    <th>ID Cambio</th>
                    <th>Especialista</th>
                    <th>Horas</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r.id}>
                      <td><strong>{r.idCambio}</strong></td>
                      <td>{r.especialista}</td>
                      <td className="numero">{r.horas}h</td>
                      <td>
                        <span className={`badge badge-${r.estado}`}>
                          {r.estado}
                        </span>
                      </td>
                      <td className="acciones">
                        {r.estado === 'pendiente' && (
                          <>
                            <button 
                              className="btn-aprobar"
                              onClick={() => manejarAprobar(r.id)}
                            >
                              ✓ Aprobar
                            </button>
                            <button 
                              className="btn-rechazar"
                              onClick={() => manejarRechazar(r.id)}
                            >
                              ✗ Rechazar
                            </button>
                          </>
                        )}
                        {r.estado !== 'pendiente' && (
                          <span className="sin-acciones">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* SECCIÓN: DASHBOARD */}
        {vista === 'dashboard' && (usuario.rol === 'coordinador' || usuario.rol === 'admin') && (
          <section className="seccion">
            <h2>📊 Dashboard</h2>
            <div className="dashboard-grid">
              <div className="card card-blue">
                <h3>📋 Total Registros</h3>
                <p className="numero">{dashboard.totalRegistros || 0}</p>
              </div>
              <div className="card card-green">
                <h3>⏱️ Total Horas</h3>
                <p className="numero">{dashboard.totalHoras || 0}h</p>
              </div>
              <div className="card card-yellow">
                <h3>⏳ Pendientes</h3>
                <p className="numero">{dashboard.pendientes || 0}</p>
              </div>
              <div className="card card-success">
                <h3>✓ Aprobados</h3>
                <p className="numero">{dashboard.aprobados || 0}</p>
              </div>
              <div className="card card-danger">
                <h3>✗ Rechazados</h3>
                <p className="numero">{dashboard.rechazados || 0}</p>
              </div>
            </div>
          </section>
        )}

        {/* SECCIÓN: AUDITORÍA (Solo Admin) */}
        {vista === 'auditoria' && usuario.rol === 'admin' && (
          <section className="seccion">
            <h2>🔍 Auditoría - Historial Completo</h2>
            
            {auditoria.length === 0 ? (
              <p className="sin-datos">Sin registros de auditoría</p>
            ) : (
              <table className="tabla tabla-auditoria">
                <thead>
                  <tr>
                    <th>Acción</th>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Fecha y Hora</th>
                    <th>Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  {auditoria.map(log => (
                    <tr key={log.id}>
                      <td><strong>{log.accion}</strong></td>
                      <td>{log.usuarioNombre || log.nombre || '-'}</td>
                      <td>{log.usuarioRol || log.rol || '-'}</td>
                      <td>
                        {log.timestamp ? 
                          new Date(log.timestamp.toDate?.() || log.timestamp).toLocaleString('es-CL')
                          : '-'
                        }
                      </td>
                      <td className="detalles">
                        {log.camposModificados ? 
                          JSON.stringify(log.camposModificados).substring(0, 50)
                          : '-'
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <p>Sistema OVT © 2024 - Control de Overtime</p>
      </footer>
    </div>
  );
}

export default App;
