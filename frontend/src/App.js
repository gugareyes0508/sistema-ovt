import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const ESPECIALISTAS = [
  'Jorge Maureira', 'Jhon Estrada', 'Luis Vasquez', 'Moises Junco',
  'Manuel Urbina Hernández', 'Benjamín Fierro', 'Mauricio Antonio Serrano Gonzalez',
  'Ricardo Andrés Rojas Ramos', 'Ariel Garate', 'Najeeb Ency Escobar Perez',
  'Rodrigo Alejandro Sanhueza', 'Sebastian Arroyo Vigouroux', 'Cristian Madariaga',
  'Miguel Martinez', 'Fabian Tobar', 'Gustavo Perolo', 'Leonardo Silva',
  'Cristian Lecaros', 'Rodrigo Escobedo', 'Alexis José Alfonzo', 'Danilo Isla', 'Gustavo Reyes'
];

function App() {
  // Estados de login
  const [pantalla, setPantalla] = useState('login'); // login, app
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [rolActual, setRolActual] = useState(null);

  // Estados de aplicación
  const [tab, setTab] = useState('registros'); // registros, mantenedor, dashboard, auditoria
  const [registros, setRegistros] = useState([]);
  const [auditoria, setAuditoria] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');

  // Estados del formulario
  const [formData, setFormData] = useState({
    idCambio: '',
    cambio: '',
    cliente: '',
    fechaInicio: new Date().toISOString().split('T')[0],
    horaInicio: '',
    horaFin: '',
    especialidad: '',
    horas: '',
    descripcion: '',
    estado: 'Pendiente'
  });

  // Estados del dashboard
  const [dashboardData, setDashboardData] = useState({
    totalHoras: 0,
    horasAprobadas: 0,
    horasPendientes: 0,
    totalActividades: 0
  });

  // Cargar datos al iniciar si hay token
  useEffect(() => {
    if (token) {
      const datosGuardados = localStorage.getItem('usuarioActual');
      if (datosGuardados) {
        const datos = JSON.parse(datosGuardados);
        setUsuarioActual(datos.nombre);
        setRolActual(datos.rol);
        setPantalla('app');
        cargarRegistros();
        cargarDashboard();
      }
    }
  }, [token]);

  // LOGIN
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMensaje('');

    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        usuario,
        password
      });

      const { token: newToken, usuario: usuarioData } = response.data;
      
      setToken(newToken);
      localStorage.setItem('token', newToken);
      localStorage.setItem('usuarioActual', JSON.stringify(usuarioData));
      setUsuarioActual(usuarioData.nombre);
      setRolActual(usuarioData.rol);
      setPantalla('app');
      setMensaje('✓ Sesión iniciada correctamente');
      
      // Limpiar formulario
      setUsuario('');
      setPassword('');
    } catch (error) {
      setMensaje('✗ Usuario o contraseña incorrectos');
      console.error('Error login:', error);
    } finally {
      setLoading(false);
    }
  };

  // LOGOUT
  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('usuarioActual');
    setUsuarioActual(null);
    setRolActual(null);
    setPantalla('login');
    setUsuario('');
    setPassword('');
    setMensaje('');
  };

  // Cargar registros
  const cargarRegistros = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/registros`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRegistros(response.data.registros || []);
    } catch (error) {
      console.error('Error cargando registros:', error);
      setMensaje('Error cargando registros');
    }
  };

  // Cargar dashboard
  const cargarDashboard = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/dashboard/resumen`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDashboardData(response.data);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
    }
  };

  // Crear registro
  const handleCrearRegistro = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMensaje('');

    if (!formData.idCambio || !formData.horas) {
      setMensaje('✗ ID del cambio y horas son requeridos');
      setLoading(false);
      return;
    }

    try {
      await axios.post(`${API_URL}/api/registros`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setMensaje('✓ Registro creado exitosamente');
      setFormData({
        idCambio: '',
        cambio: '',
        cliente: '',
        fechaInicio: new Date().toISOString().split('T')[0],
        horaInicio: '',
        horaFin: '',
        especialidad: '',
        horas: '',
        descripcion: '',
        estado: 'Pendiente'
      });

      cargarRegistros();
      cargarDashboard();
    } catch (error) {
      setMensaje('✗ Error creando registro: ' + (error.response?.data?.error || error.message));
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Aprobar registro
  const handleAprobar = async (registroId) => {
    setLoading(true);
    try {
      await axios.patch(`${API_URL}/api/registros/${registroId}/aprobar`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMensaje('✓ Registro aprobado');
      cargarRegistros();
      cargarDashboard();
    } catch (error) {
      setMensaje('✗ Error aprobando: ' + error.response?.data?.error);
    } finally {
      setLoading(false);
    }
  };

  // Rechazar registro
  const handleRechazar = async (registroId) => {
    const razon = prompt('Ingresa razón del rechazo:');
    if (!razon) return;

    setLoading(true);
    try {
      await axios.patch(`${API_URL}/api/registros/${registroId}/rechazar`, 
        { razonRechazo: razon },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMensaje('✓ Registro rechazado');
      cargarRegistros();
      cargarDashboard();
    } catch (error) {
      setMensaje('✗ Error rechazando: ' + error.response?.data?.error);
    } finally {
      setLoading(false);
    }
  };

  // Cargar auditoría de un registro
  const cargarAuditoria = async (registroId) => {
    try {
      const response = await axios.get(`${API_URL}/api/auditoria/${registroId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAuditoria(response.data.historial || []);
      setTab('auditoria');
    } catch (error) {
      setMensaje('✗ Error cargando auditoría: ' + error.response?.data?.error);
    }
  };

  // PANTALLA DE LOGIN
  if (pantalla === 'login') {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>🔐 Sistema de Control OVT</h1>
          <p>Overtime Management System</p>

          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Usuario"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              disabled={loading}
            />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Ingresando...' : 'Iniciar Sesión'}
            </button>
          </form>

          {mensaje && <div className={`mensaje ${mensaje.includes('✗') ? 'error' : 'exito'}`}>{mensaje}</div>}

          <div className="usuarios-demo">
            <strong>👤 Usuarios de Prueba:</strong>
            <div>
              <strong>Especialista:</strong> jorge.maureira / demo123
            </div>
            <div>
              <strong>Coordinador:</strong> maria.admin / demo123
            </div>
            <div>
              <strong>Admin:</strong> admin / demo123
            </div>
          </div>
        </div>
      </div>
    );
  }

  // PANTALLA PRINCIPAL
  return (
    <div className="app-container">
      <header className="app-header">
        <div>
          <h1>Sistema de Control OVT</h1>
          <p>👤 {usuarioActual} | {rolActual}</p>
        </div>
        <button onClick={handleLogout} className="btn-logout">Cerrar Sesión</button>
      </header>

      <nav className="app-nav">
        {(rolActual === 'especialista' || rolActual === 'coordinador' || rolActual === 'admin') && (
          <button 
            className={tab === 'registros' ? 'active' : ''} 
            onClick={() => { setTab('registros'); cargarRegistros(); }}
          >
            Mis Registros
          </button>
        )}
        {(rolActual === 'coordinador' || rolActual === 'admin') && (
          <button 
            className={tab === 'mantenedor' ? 'active' : ''} 
            onClick={() => { setTab('mantenedor'); cargarRegistros(); }}
          >
            Mantenedor
          </button>
        )}
        {(rolActual === 'coordinador' || rolActual === 'admin') && (
          <button 
            className={tab === 'dashboard' ? 'active' : ''} 
            onClick={() => { setTab('dashboard'); cargarDashboard(); }}
          >
            Dashboard
          </button>
        )}
        {rolActual === 'admin' && (
          <button 
            className={tab === 'auditoria' ? 'active' : ''} 
            onClick={() => setTab('auditoria')}
          >
            Auditoría
          </button>
        )}
      </nav>

      <main className="app-main">
        {mensaje && (
          <div className={`mensaje ${mensaje.includes('✗') ? 'error' : 'exito'}`}>
            {mensaje}
          </div>
        )}

        {/* TAB: MIS REGISTROS / REGISTROS */}
        {tab === 'registros' && (
          <div>
            <section className="formulario-section">
              <h2>Registrar Horas de Overtime</h2>
              <form onSubmit={handleCrearRegistro} className="form-grid">
                <input
                  type="text"
                  placeholder="ID del Cambio *"
                  value={formData.idCambio}
                  onChange={(e) => setFormData({...formData, idCambio: e.target.value})}
                  required
                />
                <input
                  type="text"
                  placeholder="Nombre del Cambio"
                  value={formData.cambio}
                  onChange={(e) => setFormData({...formData, cambio: e.target.value})}
                />
                <input
                  type="text"
                  placeholder="Cliente"
                  value={formData.cliente}
                  onChange={(e) => setFormData({...formData, cliente: e.target.value})}
                />
                <input
                  type="date"
                  value={formData.fechaInicio}
                  onChange={(e) => setFormData({...formData, fechaInicio: e.target.value})}
                />
                <input
                  type="time"
                  placeholder="Hora Inicio"
                  value={formData.horaInicio}
                  onChange={(e) => setFormData({...formData, horaInicio: e.target.value})}
                />
                <input
                  type="time"
                  placeholder="Hora Fin"
                  value={formData.horaFin}
                  onChange={(e) => setFormData({...formData, horaFin: e.target.value})}
                />
                <input
                  type="text"
                  placeholder="Especialidad"
                  value={formData.especialidad}
                  onChange={(e) => setFormData({...formData, especialidad: e.target.value})}
                />
                <input
                  type="number"
                  placeholder="Horas (ej: 0.5, 2.5, 8) *"
                  step="0.5"
                  min="0"
                  max="24"
                  value={formData.horas}
                  onChange={(e) => setFormData({...formData, horas: e.target.value})}
                  required
                />
                <textarea
                  placeholder="Descripción del trabajo"
                  value={formData.descripcion}
                  onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                  className="textarea-full"
                />
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Guardando...' : 'Registrar Horas'}
                </button>
              </form>
            </section>

            <section className="tabla-section">
              <h3>Mis Registros Recientes</h3>
              <div className="tabla-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>ID Cambio</th>
                      <th>Cliente</th>
                      <th>Fecha</th>
                      <th>Horario</th>
                      <th>Horas</th>
                      <th>Descripción</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registros.length === 0 ? (
                      <tr><td colSpan="8" style={{textAlign: 'center', padding: '20px', color: '#666'}}>No hay registros</td></tr>
                    ) : (
                      registros.map(reg => (
                        <tr key={reg.registroId}>
                          <td className="id-cambio">{reg.idCambio}</td>
                          <td>{reg.cliente}</td>
                          <td>{new Date(reg.fechaCreacion?.toDate?.() || reg.fechaCreacion).toLocaleDateString()}</td>
                          <td>{reg.horaInicio} - {reg.horaFin}</td>
                          <td className="horas"><strong>{reg.cantidadHoras}</strong></td>
                          <td className="descripcion">{reg.descripcion}</td>
                          <td>
                            <span className={`estado estado-${reg.estado.toLowerCase()}`}>
                              {reg.estado}
                            </span>
                          </td>
                          <td className="acciones">
                            {(rolActual === 'coordinador' || rolActual === 'admin') && reg.estado === 'Pendiente' && (
                              <>
                                <button onClick={() => handleAprobar(reg.registroId)} className="btn-small btn-success">✓</button>
                                <button onClick={() => handleRechazar(reg.registroId)} className="btn-small btn-danger">✗</button>
                              </>
                            )}
                            <button onClick={() => cargarAuditoria(reg.registroId)} className="btn-small btn-info">🔍</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB: MANTENEDOR */}
        {tab === 'mantenedor' && (rolActual === 'coordinador' || rolActual === 'admin') && (
          <div>
            <section className="tabla-section">
              <h2>Mantenedor - Todos los Registros</h2>
              <div className="tabla-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>ID Cambio</th>
                      <th>Especialista</th>
                      <th>Cliente</th>
                      <th>Fecha</th>
                      <th>Horas</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registros.map(reg => (
                      <tr key={reg.registroId}>
                        <td className="id-cambio">{reg.idCambio}</td>
                        <td>{reg.especialistaNombre}</td>
                        <td>{reg.cliente}</td>
                        <td>{new Date(reg.fechaCreacion?.toDate?.() || reg.fechaCreacion).toLocaleDateString()}</td>
                        <td><strong>{reg.cantidadHoras}</strong></td>
                        <td>
                          <span className={`estado estado-${reg.estado.toLowerCase()}`}>
                            {reg.estado}
                          </span>
                        </td>
                        <td className="acciones">
                          {reg.estado === 'Pendiente' && (
                            <>
                              <button onClick={() => handleAprobar(reg.registroId)} className="btn-small btn-success">Aprobar</button>
                              <button onClick={() => handleRechazar(reg.registroId)} className="btn-small btn-danger">Rechazar</button>
                            </>
                          )}
                          <button onClick={() => cargarAuditoria(reg.registroId)} className="btn-small btn-info">Historial</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB: DASHBOARD */}
        {tab === 'dashboard' && (rolActual === 'coordinador' || rolActual === 'admin') && (
          <div>
            <section className="dashboard-section">
              <h2>Dashboard de Overtime</h2>
              <div className="kpi-grid">
                <div className="kpi-card">
                  <div className="kpi-label">Total Horas OVT</div>
                  <div className="kpi-value">{dashboardData.totalHoras.toFixed(1)}</div>
                </div>
                <div className="kpi-card kpi-success">
                  <div className="kpi-label">Aprobadas</div>
                  <div className="kpi-value">{dashboardData.horasAprobadas.toFixed(1)}</div>
                </div>
                <div className="kpi-card kpi-warning">
                  <div className="kpi-label">Pendientes</div>
                  <div className="kpi-value">{dashboardData.horasPendientes.toFixed(1)}</div>
                </div>
                <div className="kpi-card kpi-info">
                  <div className="kpi-label">Actividades</div>
                  <div className="kpi-value">{dashboardData.totalActividades}</div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB: AUDITORÍA */}
        {tab === 'auditoria' && (
          <div>
            <section className="auditoria-section">
              <h2>Log de Auditoría</h2>
              <div className="auditoria-list">
                {auditoria.length === 0 ? (
                  <p style={{textAlign: 'center', color: '#666', padding: '20px'}}>No hay registros de auditoría</p>
                ) : (
                  auditoria.map((log, i) => (
                    <div key={i} className="auditoria-item">
                      <div className="auditoria-header">
                        <strong>{log.usuarioNombre}</strong>
                        <span className="accion-badge">{log.accion}</span>
                        <span className="timestamp">
                          {new Date(log.timestamp?.toDate?.() || log.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="auditoria-body">
                        <p><strong>Acción:</strong> {log.accion}</p>
                        <p><strong>Detalles:</strong> {log.detalles}</p>
                        <p><strong>IP:</strong> {log.metadata?.ipAddress}</p>
                        <p><strong>Navegador:</strong> {log.metadata?.navegador} | {log.metadata?.sistemaOperativo}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
