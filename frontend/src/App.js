import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './App.css';
import { es } from 'date-fns/locale';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [usuario, setUsuario] = useState(JSON.parse(localStorage.getItem('usuario') || '{}'));
  const [registros, setRegistros] = useState([]);
  const [vista, setVista] = useState('registros');
  const [auditoria, setAuditoria] = useState([]);
  
  // Formulario mejorado
  const [formulario, setFormulario] = useState({
    tipo: 'cambio',
    descripcion: '',
    cliente: 'Banco de Chile',
    fechaInicio: new Date(),
    fechaFin: new Date(),
    horas: 0,
    especialista: usuario.nombre || '',
    interno_cliente: 'interno',
    genera_ovt: 'no',
    estado: 'pendiente',
    especialidad: 'operaciones'
  });

  const [dashboard, setDashboard] = useState({
    totalRegistros: 0,
    totalHoras: 0,
    horasEsteMes: 0,
    registrosPendientes: 0
  });

  const [filtros, setFiltros] = useState({
    mes: new Date().getMonth() + 1,
    anio: new Date().getFullYear(),
    fechaInicio: null,
    fechaFin: null
  });

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

  // Efecto inicial
  useEffect(() => {
    cargarRegistros();
    cargarDashboard();
    if (usuario.rol === 'admin') {
      cargarAuditoria();
    }
  }, [token, cargarRegistros, cargarDashboard, cargarAuditoria, usuario.rol]);

  // Calcular horas automáticamente
  const calcularHoras = (inicio, fin) => {
    if (!inicio || !fin) return 0;
    const diff = (fin - inicio) / (1000 * 60 * 60);
    return Math.max(0, diff.toFixed(2));
  };

  // Manejar cambio de fechas
  const handleFechaChange = (campo, valor) => {
    setFormulario(prev => {
      const nuevoForm = { ...prev, [campo]: valor };
      if (campo === 'fechaInicio' || campo === 'fechaFin') {
        nuevoForm.horas = calcularHoras(nuevoForm.fechaInicio, nuevoForm.fechaFin);
      }
      return nuevoForm;
    });
  };

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
    }
  };

  // Logout
  const manejarLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setToken(null);
    setUsuario({});
  };

  // Registrar cambio/alerta
  const manejarRegistro = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/api/registros`, formulario, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFormulario({
        tipo: 'cambio',
        descripcion: '',
        cliente: 'Banco de Chile',
        fechaInicio: new Date(),
        fechaFin: new Date(),
        horas: 0,
        especialista: usuario.nombre || '',
        interno_cliente: 'interno',
        genera_ovt: 'no',
        estado: 'pendiente',
        especialidad: 'operaciones'
      });
      cargarRegistros();
      cargarDashboard();
      alert('Registro guardado correctamente');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Eliminar registro (Admin)
  const manejarEliminar = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este registro?')) return;
    
    try {
      await axios.delete(`${API_URL}/api/registros/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      cargarRegistros();
      cargarDashboard();
      alert('Registro eliminado');
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
            <p className="version">v2.0.0</p>
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
          <h1>🕐 Sistema OVT v2</h1>
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
          📋 Registrar Cambio/Alerta
        </button>

        {(usuario.rol === 'coordinador' || usuario.rol === 'admin') && (
          <>
            <button 
              className={vista === 'mantenedor' ? 'nav-btn active' : 'nav-btn'} 
              onClick={() => setVista('mantenedor')}
            >
              ⚙️ Mantenedor
            </button>
          </>
        )}

        {usuario.rol === 'especialista' && (
          <button 
            className={vista === 'resumen' ? 'nav-btn active' : 'nav-btn'} 
            onClick={() => setVista('resumen')}
          >
            📊 Mi Resumen
          </button>
        )}

        {usuario.rol === 'admin' && (
          <>
            <button 
              className={vista === 'dashboard' ? 'nav-btn active' : 'nav-btn'} 
              onClick={() => setVista('dashboard')}
            >
              📊 Dashboard
            </button>
            <button 
              className={vista === 'auditoria' ? 'nav-btn active' : 'nav-btn'} 
              onClick={() => setVista('auditoria')}
            >
              🔍 Auditoría
            </button>
          </>
        )}
      </nav>

      {/* CONTENIDO PRINCIPAL */}
      <main className="main">
        
        {/* SECCIÓN: REGISTRAR CAMBIO/ALERTA */}
        {vista === 'registros' && (
          <section className="seccion">
            <h2>📋 Registrar Cambio o Alerta</h2>
            
            <form onSubmit={manejarRegistro} className="formulario-mejorado">
              <div className="form-row">
                <div className="form-group">
                  <label>Tipo de Registro *</label>
                  <select
                    value={formulario.tipo}
                    onChange={(e) => setFormulario({ ...formulario, tipo: e.target.value })}
                    required
                  >
                    <option value="cambio">Cambio</option>
                    <option value="alerta">Alerta</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Estado *</label>
                  <select
                    value={formulario.estado}
                    onChange={(e) => setFormulario({ ...formulario, estado: e.target.value })}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="exitoso">Exitoso</option>
                    <option value="fallido">Fallido</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Cliente *</label>
                  <select
                    value={formulario.cliente}
                    onChange={(e) => setFormulario({ ...formulario, cliente: e.target.value })}
                  >
                    <option value="Banco de Chile">Banco de Chile</option>
                    <option value="Banco Santander">Banco Santander</option>
                    <option value="Banco BCI">Banco BCI</option>
                    <option value="Banco Estado">Banco Estado</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Descripción del Cambio/Alerta *</label>
                <textarea
                  placeholder="Describe el cambio o alerta..."
                  value={formulario.descripcion}
                  onChange={(e) => setFormulario({ ...formulario, descripcion: e.target.value })}
                  required
                  rows="3"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Especialista</label>
                  <input
                    type="text"
                    value={formulario.especialista}
                    disabled
                    className="input-disabled"
                  />
                </div>

                <div className="form-group">
                  <label>Especialidad *</label>
                  <select
                    value={formulario.especialidad}
                    onChange={(e) => setFormulario({ ...formulario, especialidad: e.target.value })}
                  >
                    <option value="operaciones">Operaciones Cloud</option>
                    <option value="middleware">Middleware</option>
                    <option value="ambas">Ambas</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Interno/Cliente *</label>
                  <select
                    value={formulario.interno_cliente}
                    onChange={(e) => setFormulario({ ...formulario, interno_cliente: e.target.value })}
                  >
                    <option value="interno">Interno</option>
                    <option value="cliente">Cliente</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Fecha/Hora Inicio *</label>
                  <DatePicker
                    selected={formulario.fechaInicio}
                    onChange={(date) => handleFechaChange('fechaInicio', date)}
                    showTimeSelect
                    timeFormat="HH:mm"
                    dateFormat="dd/MM/yyyy HH:mm"
                    locale={es}
                  />
                </div>

                <div className="form-group">
                  <label>Fecha/Hora Fin *</label>
                  <DatePicker
                    selected={formulario.fechaFin}
                    onChange={(date) => handleFechaChange('fechaFin', date)}
                    showTimeSelect
                    timeFormat="HH:mm"
                    dateFormat="dd/MM/yyyy HH:mm"
                    locale={es}
                  />
                </div>

                <div className="form-group">
                  <label>Horas (calculado automáticamente)</label>
                  <input
                    type="number"
                    value={formulario.horas}
                    disabled
                    className="input-disabled"
                    step="0.01"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>¿Genera OVT? *</label>
                  <select
                    value={formulario.genera_ovt}
                    onChange={(e) => setFormulario({ ...formulario, genera_ovt: e.target.value })}
                  >
                    <option value="si">Sí</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn-primary">✓ Guardar Registro</button>
            </form>

            <h3>Mis Registros</h3>
            {registros.length === 0 ? (
              <p className="sin-datos">No hay registros</p>
            ) : (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Descripción</th>
                    <th>Cliente</th>
                    <th>Horas</th>
                    <th>Estado</th>
                    <th>Inicio</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r.id}>
                      <td><strong>{r.tipo}</strong></td>
                      <td>{r.descripcion?.substring(0, 30)}</td>
                      <td>{r.cliente}</td>
                      <td className="numero">{r.horas}h</td>
                      <td>
                        <span className={`badge badge-${r.estado}`}>
                          {r.estado}
                        </span>
                      </td>
                      <td>{r.fechaInicio ? new Date(r.fechaInicio).toLocaleDateString('es-CL') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* SECCIÓN: MANTENEDOR */}
        {vista === 'mantenedor' && (usuario.rol === 'coordinador' || usuario.rol === 'admin') && (
          <section className="seccion">
            <h2>⚙️ Mantenedor - Gestionar Registros</h2>
            
            {registros.length === 0 ? (
              <p className="sin-datos">No hay registros</p>
            ) : (
              <div className="tabla-responsive">
                <table className="tabla tabla-acciones">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Especialista</th>
                      <th>Descripción</th>
                      <th>Horas</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registros.map(r => (
                      <tr key={r.id}>
                        <td><strong>{r.tipo}</strong></td>
                        <td>{r.especialista}</td>
                        <td>{r.descripcion?.substring(0, 30)}</td>
                        <td className="numero">{r.horas}h</td>
                        <td>
                          <span className={`badge badge-${r.estado}`}>
                            {r.estado}
                          </span>
                        </td>
                        <td className="acciones">
                          {usuario.rol === 'admin' && (
                            <button 
                              className="btn-eliminar"
                              onClick={() => manejarEliminar(r.id)}
                            >
                              🗑️ Eliminar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* SECCIÓN: MI RESUMEN (Especialista) */}
        {vista === 'resumen' && usuario.rol === 'especialista' && (
          <section className="seccion">
            <h2>📊 Mi Resumen del Mes</h2>
            <div className="dashboard-grid">
              <div className="card card-blue">
                <h3>📋 Registros Este Mes</h3>
                <p className="numero">{dashboard.horasEsteMes || 0}</p>
              </div>
              <div className="card card-green">
                <h3>⏱️ Horas Registradas</h3>
                <p className="numero">{dashboard.totalHoras || 0}h</p>
              </div>
              <div className="card card-yellow">
                <h3>⏳ Registros Pendientes</h3>
                <p className="numero">{dashboard.registrosPendientes || 0}</p>
              </div>
            </div>
          </section>
        )}

        {/* SECCIÓN: DASHBOARD (Admin) */}
        {vista === 'dashboard' && usuario.rol === 'admin' && (
          <section className="seccion">
            <h2>📊 Dashboard Completo</h2>
            
            <div className="filtros-dashboard">
              <div className="form-group">
                <label>Mes</label>
                <select
                  value={filtros.mes}
                  onChange={(e) => setFiltros({ ...filtros, mes: parseInt(e.target.value) })}
                >
                  {[...Array(12)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2024, i).toLocaleString('es-CL', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Año</label>
                <select
                  value={filtros.anio}
                  onChange={(e) => setFiltros({ ...filtros, anio: parseInt(e.target.value) })}
                >
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                </select>
              </div>

              <div className="form-group">
                <label>Desde</label>
                <DatePicker
                  selected={filtros.fechaInicio}
                  onChange={(date) => setFiltros({ ...filtros, fechaInicio: date })}
                  dateFormat="dd/MM/yyyy"
                  locale={es}
                />
              </div>

              <div className="form-group">
                <label>Hasta</label>
                <DatePicker
                  selected={filtros.fechaFin}
                  onChange={(date) => setFiltros({ ...filtros, fechaFin: date })}
                  dateFormat="dd/MM/yyyy"
                  locale={es}
                />
              </div>
            </div>

            <div className="dashboard-grid">
              <div className="card card-blue">
                <h3>📋 Total Registros</h3>
                <p className="numero">{dashboard.totalRegistros || 0}</p>
              </div>
              <div className="card card-green">
                <h3>⏱️ Total Horas</h3>
                <p className="numero">{dashboard.totalHoras || 0}h</p>
              </div>
            </div>
          </section>
        )}

        {/* SECCIÓN: AUDITORÍA */}
        {vista === 'auditoria' && usuario.rol === 'admin' && (
          <section className="seccion">
            <h2>🔍 Auditoría</h2>
            
            {auditoria.length === 0 ? (
              <p className="sin-datos">Sin registros</p>
            ) : (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Acción</th>
                    <th>Usuario</th>
                    <th>Fecha/Hora</th>
                    <th>Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  {auditoria.map(log => (
                    <tr key={log.id}>
                      <td><strong>{log.accion}</strong></td>
                      <td>{log.usuarioNombre || '-'}</td>
                      <td>
                        {log.timestamp ? 
                          new Date(log.timestamp.toDate?.() || log.timestamp).toLocaleString('es-CL')
                          : '-'
                        }
                      </td>
                      <td>{log.camposModificados ? JSON.stringify(log.camposModificados).substring(0, 50) : '-'}</td>
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
        <p>Sistema OVT v2.0 © 2024 - Control de Overtime y Cambios/Alertas</p>
      </footer>
    </div>
  );
}

export default App;
