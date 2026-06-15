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
      setRegistros(response.data);
    } catch (err) {
      console.error('Error cargando registros:', err.message);
    }
  }, [token]);

  // Cargar dashboard
  const cargarDashboard = useCallback(async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_URL}/api/dashboard/resumen`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDashboard(response.data);
    } catch (err) {
      console.error('Error cargando dashboard:', err.message);
    }
  }, [token]);

  // Cargar auditoría
  const cargarAuditoria = useCallback(async () => {
    if (!token || usuario.rol !== 'admin') return;
    try {
      const response = await axios.get(`${API_URL}/api/auditoria`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAuditoria(response.data);
    } catch (err) {
      console.error('Error cargando auditoría:', err.message);
    }
  }, [token, usuario.rol]);

  // Efecto inicial
  useEffect(() => {
    if (token) {
      cargarRegistros();
      cargarDashboard();
      if (usuario.rol === 'admin') {
        cargarAuditoria();
      }
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
    } catch (err) {
      alert('Credenciales incorrectas');
    }
  };

  // Logout
  const manejarLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setToken(null);
    setUsuario({});
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
    } catch (err) {
      alert('Error registrando horas: ' + err.message);
    }
  };

  // Aprobar
  const aprobar = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/registros/${id}/aprobar`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      cargarRegistros();
    } catch (err) {
      alert('Error aprobando: ' + err.message);
    }
  };

  // Rechazar
  const rechazar = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/registros/${id}/rechazar`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      cargarRegistros();
    } catch (err) {
      alert('Error rechazando: ' + err.message);
    }
  };

  // Si no está logueado
  if (!token) {
    return (
      <div className="container-login">
        <div className="login-box">
          <h1>Sistema OVT</h1>
          <h2>Control de Overtime</h2>
          <form onSubmit={manejarLogin}>
            <input type="text" name="usuario" placeholder="Usuario" required />
            <input type="password" name="contrasena" placeholder="Contraseña" required />
            <button type="submit">Iniciar Sesión</button>
          </form>
          <p className="demo-info">
            <strong>Demo:</strong><br />
            Especialista: jorge.maureira / demo123<br />
            Coordinador: maria.admin / demo123<br />
            Admin: admin / demo123
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Sistema OVT</h1>
        <div className="user-info">
          <span>{usuario.nombre} ({usuario.rol})</span>
          <button onClick={manejarLogout}>Logout</button>
        </div>
      </header>

      <nav className="nav">
        <button 
          className={vista === 'registros' ? 'active' : ''} 
          onClick={() => setVista('registros')}
        >
          Mis Registros
        </button>
        {usuario.rol === 'coordinador' && (
          <>
            <button 
              className={vista === 'mantenedor' ? 'active' : ''} 
              onClick={() => setVista('mantenedor')}
            >
              Mantenedor
            </button>
            <button 
              className={vista === 'dashboard' ? 'active' : ''} 
              onClick={() => setVista('dashboard')}
            >
              Dashboard
            </button>
          </>
        )}
        {usuario.rol === 'admin' && (
          <>
            <button 
              className={vista === 'dashboard' ? 'active' : ''} 
              onClick={() => setVista('dashboard')}
            >
              Dashboard
            </button>
            <button 
              className={vista === 'auditoria' ? 'active' : ''} 
              onClick={() => setVista('auditoria')}
            >
              Auditoría
            </button>
          </>
        )}
      </nav>

      <main className="main">
        {/* Vista: Mis Registros */}
        {vista === 'registros' && (
          <section className="seccion">
            <h2>Registrar Horas</h2>
            <form onSubmit={manejarRegistro} className="formulario">
              <input
                type="text"
                placeholder="ID del Cambio"
                value={formulario.idCambio}
                onChange={(e) => setFormulario({ ...formulario, idCambio: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="Nombre del Cambio"
                value={formulario.nombreCambio}
                onChange={(e) => setFormulario({ ...formulario, nombreCambio: e.target.value })}
              />
              <input
                type="text"
                placeholder="Cliente"
                value={formulario.cliente}
                onChange={(e) => setFormulario({ ...formulario, cliente: e.target.value })}
              />
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
                <option value="8">8 horas</option>
              </select>
              <button type="submit">Registrar Horas</button>
            </form>

            <h3>Tus Registros</h3>
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
                    <td>{r.idCambio}</td>
                    <td>{r.nombreCambio}</td>
                    <td>{r.cliente}</td>
                    <td>{r.horas}</td>
                    <td className={`estado-${r.estado}`}>{r.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Vista: Dashboard */}
        {vista === 'dashboard' && (
          <section className="seccion">
            <h2>Dashboard</h2>
            <div className="dashboard-grid">
              <div className="card">
                <h3>Total Registros</h3>
                <p className="numero">{dashboard.totalRegistros}</p>
              </div>
              <div className="card">
                <h3>Total Horas</h3>
                <p className="numero">{dashboard.totalHoras}</p>
              </div>
              <div className="card pendiente">
                <h3>Pendientes</h3>
                <p className="numero">{dashboard.pendientes}</p>
              </div>
              <div className="card aprobado">
                <h3>Aprobados</h3>
                <p className="numero">{dashboard.aprobados}</p>
              </div>
              <div className="card rechazado">
                <h3>Rechazados</h3>
                <p className="numero">{dashboard.rechazados}</p>
              </div>
            </div>
          </section>
        )}

        {/* Vista: Auditoría (solo admin) */}
        {vista === 'auditoria' && usuario.rol === 'admin' && (
          <section className="seccion">
            <h2>Auditoría</h2>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Acción</th>
                  <th>Usuario</th>
                  <th>Timestamp</th>
                  <th>Detalles</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.map(log => (
                  <tr key={log.id}>
                    <td>{log.accion}</td>
                    <td>{log.usuarioNombre || log.nombre}</td>
                    <td>{new Date(log.timestamp?.toDate?.() || log.timestamp).toLocaleString()}</td>
                    <td>{JSON.stringify(log.camposModificados || {}).substring(0, 50)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
