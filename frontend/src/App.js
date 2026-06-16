import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [usuario, setUsuario] = useState(JSON.parse(localStorage.getItem('usuario') || '{}'));
  const [registros, setRegistros] = useState([]);
  const [vista, setVista] = useState('registros');
  const [auditoria, setAuditoria] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  
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
    genera_ovt: 'si',
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

  // Registrar o actualizar cambio/alerta
  const manejarRegistro = async (e) => {
    e.preventDefault();
    try {
      if (editandoId) {
        // Actualizar registro
        await axios.patch(`${API_URL}/api/registros/${editandoId}`, formulario, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('✓ Registro actualizado correctamente');
        setEditandoId(null);
      } else {
        // Crear nuevo registro
        await axios.post(`${API_URL}/api/registros`, formulario, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('✓ ¡Registro guardado exitosamente!');
      }
      
      // Limpiar formulario
      setFormulario({
        tipo: 'cambio',
        descripcion: '',
        cliente: 'Banco de Chile',
        fechaInicio: new Date(),
        fechaFin: new Date(),
        horas: 0,
        especialista: usuario.nombre || '',
        interno_cliente: 'interno',
        genera_ovt: 'si',
        estado: 'pendiente',
        especialidad: 'operaciones'
      });
      
      // Recargar después de 1 segundo
      setTimeout(() => {
        cargarRegistros();
        cargarDashboard();
      }, 1000);
    } catch (err) {
      console.error('Error:', err);
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  // Cargar registro para editar
  const cargarParaEditar = (registro) => {
    // Admin puede editar cualquier registro, especialista solo los suyos
    if (usuario.rol === 'especialista' && registro.createdBy !== usuario.usuario) {
      alert('Solo puedes editar tus propios registros');
      return;
    }
    
    setEditandoId(registro.id);
    setFormulario({
      tipo: registro.tipo,
      descripcion: registro.descripcion,
      cliente: registro.cliente,
      fechaInicio: registro.fechaInicio?.toDate?.() || new Date(registro.fechaInicio),
      fechaFin: registro.fechaFin?.toDate?.() || new Date(registro.fechaFin),
      horas: registro.horas,
      especialista: registro.especialista,
      interno_cliente: registro.interno_cliente,
      genera_ovt: registro.genera_ovt,
      estado: registro.estado,
      especialidad: registro.especialidad
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Cancelar edición
  const cancelarEdicion = () => {
    setEditandoId(null);
    setFormulario({
      tipo: 'cambio',
      descripcion: '',
      cliente: 'Banco de Chile',
      fechaInicio: new Date(),
      fechaFin: new Date(),
      horas: 0,
      especialista: usuario.nombre || '',
      interno_cliente: 'interno',
      genera_ovt: 'si',
      estado: 'pendiente',
      especialidad: 'operaciones'
    });
  };

  // Función para parsear fechas de forma robusta
  const parseDate = (fecha) => {
    if (!fecha) return 'Sin fecha';
    
    try {
      let date;
      
      // Firestore Timestamp con método toDate()
      if (fecha.toDate && typeof fecha.toDate === 'function') {
        date = fecha.toDate();
      }
      // Firestore Timestamp plano: {_seconds, _nanoseconds}
      else if (typeof fecha === 'object' && fecha._seconds !== undefined) {
        date = new Date(fecha._seconds * 1000);
      }
      // String ISO
      else if (typeof fecha === 'string') {
        date = new Date(fecha);
      }
      // Número (timestamp ms)
      else if (typeof fecha === 'number') {
        date = new Date(fecha);
      }
      // Ya es Date
      else if (fecha instanceof Date) {
        date = fecha;
      }
      // Último recurso: intentar convertir directamente
      else {
        date = new Date(fecha);
      }
      
      if (isNaN(date.getTime())) {
        return 'Sin fecha';
      }
      
      return date.toLocaleDateString('es-CL');
    } catch (err) {
      return 'Sin fecha';
    }
  };

  // ============================================
  // FILTRADO POR MES/AÑO (DASHBOARD)
  // ============================================
  
  const registrosFiltrados = registros.filter(r => {
    if (!r.fechaInicio) return false;
    
    try {
      let fecha;
      
      // Manejar Firestore Timestamp con método toDate()
      if (r.fechaInicio.toDate && typeof r.fechaInicio.toDate === 'function') {
        fecha = r.fechaInicio.toDate();
      }
      // Manejar objeto plano de Firestore {_seconds, _nanoseconds}
      else if (typeof r.fechaInicio === 'object' && r.fechaInicio._seconds !== undefined) {
        fecha = new Date(r.fechaInicio._seconds * 1000);
      }
      // Otros formatos
      else {
        fecha = new Date(r.fechaInicio);
      }
      
      // Validar que la fecha sea válida
      if (isNaN(fecha.getTime())) {
        return false;
      }
      
      const match = fecha.getMonth() === filtros.mes - 1 && fecha.getFullYear() === filtros.anio;
      return match;
    } catch (err) {
      return false;
    }
  });

  // Debug: mostrar en consola
  React.useEffect(() => {
    if (registros.length > 0) {
      console.log(`[Dashboard] Total registros: ${registros.length}`);
    }
  }, [registros.length]);

  // Contar estados del mes filtrado
  const pendientes = registrosFiltrados.filter(r => r.estado === 'pendiente').length;
  const aprobados = registrosFiltrados.filter(r => r.estado === 'exitoso').length;
  const rechazados = registrosFiltrados.filter(r => r.estado === 'fallido').length;
  const totalHorasAprobadas = registrosFiltrados
    .filter(r => r.estado === 'exitoso')
    .reduce((sum, r) => sum + (r.horas || 0), 0);

  // Gráfico 1: Distribuir por especialidad
  const porEspecialidad = {};
  registrosFiltrados
    .filter(r => r.estado === 'exitoso')
    .forEach(r => {
      const esp = r.especialidad || 'Sin especialidad';
      porEspecialidad[esp] = (porEspecialidad[esp] || 0) + (r.horas || 0);
    });

  const datosEspecialidad = Object.entries(porEspecialidad).map(([name, value]) => ({
    name: name === 'middleware' ? 'Middleware' : name === 'operaciones' ? 'Operaciones Cloud' : name,
    value
  }));

  // Gráfico 2: Horas por especialista
  const porEspecialista = {};
  registrosFiltrados
    .filter(r => r.estado === 'exitoso')
    .forEach(r => {
      const esp = r.createdByNombre || r.especialista || 'Sin nombre';
      porEspecialista[esp] = (porEspecialista[esp] || 0) + (r.horas || 0);
    });

  const datosEspecialista = Object.entries(porEspecialista)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const manejarEliminar = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este registro?')) return;
    
    try {
      await axios.delete(`${API_URL}/api/registros/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      cargarRegistros();
      cargarDashboard();
      alert('✓ Registro eliminado');
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  // Aprobar o Rechazar registro (Admin)
  const manejarAprobacion = async (id, nuevoEstado) => {
    try {
      await axios.patch(`${API_URL}/api/registros/${id}`, 
        { estado: nuevoEstado },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(`✓ Registro ${nuevoEstado === 'exitoso' ? 'aprobado' : 'rechazado'}`);
      cargarRegistros();
      cargarDashboard();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
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
            <h2>📋 {editandoId ? '✏️ Editar Cambio/Alerta' : 'Registrar Cambio o Alerta'}</h2>
            
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
                    value={usuario.nombre || formulario.especialista}
                    disabled
                    style={{backgroundColor: '#e8f5e9', cursor: 'not-allowed', fontWeight: 'bold'}}
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
                  <label>Fecha Inicio *</label>
                  <input
                    type="date"
                    value={formulario.fechaInicio instanceof Date ? 
                      formulario.fechaInicio.toISOString().split('T')[0]
                      : ''
                    }
                    onChange={(e) => {
                      if (e.target.value) {
                        const [año, mes, dia] = e.target.value.split('-');
                        const fecha = new Date(parseInt(año), parseInt(mes) - 1, parseInt(dia));
                        fecha.setHours(formulario.fechaInicio.getHours(), formulario.fechaInicio.getMinutes());
                        handleFechaChange('fechaInicio', fecha);
                      }
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Hora Inicio * (HH:MM)</label>
                  <input
                    type="time"
                    value={formulario.fechaInicio instanceof Date ? 
                      String(formulario.fechaInicio.getHours()).padStart(2, '0') + ':' + 
                      String(formulario.fechaInicio.getMinutes()).padStart(2, '0')
                      : ''
                    }
                    onChange={(e) => {
                      if (e.target.value) {
                        const [horas, minutos] = e.target.value.split(':');
                        const nuevaFecha = new Date(formulario.fechaInicio);
                        nuevaFecha.setHours(parseInt(horas), parseInt(minutos));
                        handleFechaChange('fechaInicio', nuevaFecha);
                      }
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Fecha Fin *</label>
                  <input
                    type="date"
                    value={formulario.fechaFin instanceof Date ? 
                      formulario.fechaFin.toISOString().split('T')[0]
                      : ''
                    }
                    onChange={(e) => {
                      if (e.target.value) {
                        const [año, mes, dia] = e.target.value.split('-');
                        const fecha = new Date(parseInt(año), parseInt(mes) - 1, parseInt(dia));
                        fecha.setHours(formulario.fechaFin.getHours(), formulario.fechaFin.getMinutes());
                        handleFechaChange('fechaFin', fecha);
                      }
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Hora Fin * (HH:MM)</label>
                  <input
                    type="time"
                    value={formulario.fechaFin instanceof Date ? 
                      String(formulario.fechaFin.getHours()).padStart(2, '0') + ':' + 
                      String(formulario.fechaFin.getMinutes()).padStart(2, '0')
                      : ''
                    }
                    onChange={(e) => {
                      if (e.target.value) {
                        const [horas, minutos] = e.target.value.split(':');
                        const nuevaFecha = new Date(formulario.fechaFin);
                        nuevaFecha.setHours(parseInt(horas), parseInt(minutos));
                        handleFechaChange('fechaFin', nuevaFecha);
                      }
                    }}
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

              <button type="submit" className="btn-primary">
                {editandoId ? '✏️ Actualizar Registro' : '✓ Guardar Registro'}
              </button>
              {editandoId && (
                <button type="button" onClick={cancelarEdicion} className="btn-cancelar">
                  ✗ Cancelar Edición
                </button>
              )}
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
                    <th>Acciones</th>
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
                          {r.estado === 'pendiente' ? 'Pendiente de Aprobación' : r.estado === 'exitoso' ? 'Aprobado' : 'Rechazado'}
                        </span>
                      </td>
                      <td>
                        {parseDate(r.fechaInicio)}
                      </td>
                      <td>
                        <button 
                          className="btn-editar"
                          onClick={() => cargarParaEditar(r)}
                        >
                          ✏️ Editar
                        </button>
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
                            {r.estado === 'pendiente' ? 'Pendiente de Aprobación' : r.estado === 'exitoso' ? 'Aprobado' : 'Rechazado'}
                          </span>
                        </td>
                        <td className="acciones">
                          <button 
                            className="btn-editar"
                            onClick={() => cargarParaEditar(r)}
                            title="Editar registro"
                          >
                            ✏️ Editar
                          </button>
                          {r.estado === 'pendiente' && (
                            <>
                              <button 
                                className="btn-aprobar"
                                onClick={() => manejarAprobacion(r.id, 'exitoso')}
                                title="Aprobar registro"
                              >
                                ✅ Aprobar
                              </button>
                              <button 
                                className="btn-rechazar"
                                onClick={() => manejarAprobacion(r.id, 'fallido')}
                                title="Rechazar registro"
                              >
                                ❌ Rechazar
                              </button>
                            </>
                          )}
                          <button 
                            className="btn-eliminar"
                            onClick={() => manejarEliminar(r.id)}
                            title="Eliminar registro"
                          >
                            🗑️ Eliminar
                          </button>
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
            <h2>📊 Mi Resumen</h2>
            
            {/* Tarjetas de resumen */}
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

            {/* Filtros */}
            <div className="filtros-dashboard">
              <div className="form-group">
                <label>Desde</label>
                <input
                  type="date"
                  value={filtros.fechaInicio ? filtros.fechaInicio.toISOString().split('T')[0] : ''}
                  onChange={(e) => setFiltros({ ...filtros, fechaInicio: e.target.value ? new Date(e.target.value) : null })}
                />
              </div>

              <div className="form-group">
                <label>Hasta</label>
                <input
                  type="date"
                  value={filtros.fechaFin ? filtros.fechaFin.toISOString().split('T')[0] : ''}
                  onChange={(e) => setFiltros({ ...filtros, fechaFin: e.target.value ? new Date(e.target.value) : null })}
                />
              </div>

              <div className="form-group">
                <label>Estado</label>
                <select
                  value={filtros.estado || ''}
                  onChange={(e) => setFiltros({ ...filtros, estado: e.target.value || null })}
                >
                  <option value="">Todos</option>
                  <option value="pendiente">Pendiente de Aprobación</option>
                  <option value="exitoso">Aprobado</option>
                  <option value="fallido">Rechazado</option>
                </select>
              </div>
            </div>

            {/* Tabla de registros */}
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
                    <th>Fecha Inicio</th>
                    <th>Horas</th>
                    <th>Estado</th>
                    <th>Genera OVT</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => (
                    <tr key={r.id}>
                      <td><strong>{r.tipo}</strong></td>
                      <td>{r.descripcion?.substring(0, 25)}</td>
                      <td>{r.cliente}</td>
                      <td>{parseDate(r.fechaInicio)}</td>
                      <td className="numero">{r.horas}h</td>
                      <td>
                        <span className={`badge badge-${r.estado}`}>
                          {r.estado === 'pendiente' ? 'Pendiente de Aprobación' : r.estado === 'exitoso' ? 'Aprobado' : 'Rechazado'}
                        </span>
                      </td>
                      <td>{r.genera_ovt === 'si' ? '✓' : '✗'}</td>
                      <td className="acciones">
                        <button 
                          className="btn-editar"
                          onClick={() => cargarParaEditar(r)}
                        >
                          ✏️ Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* SECCIÓN: DASHBOARD (Admin) */}
        {vista === 'dashboard' && usuario.rol === 'admin' && (
          <section className="seccion">
            <h2>📊 Dashboard - Gestión de Registros</h2>
            
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
                  <option value="2023">2023</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                </select>
              </div>
            </div>

            {/* Tarjetas resumen */}
            <div className="dashboard-grid">
              <div className="card card-blue">
                <h3>⏳ Pendientes</h3>
                <p className="numero">{pendientes}</p>
                <p style={{fontSize: '11px', color: '#fff', marginTop: '5px'}}>de {registrosFiltrados.length} registros</p>
              </div>
              <div className="card card-green">
                <h3>✅ Aprobados</h3>
                <p className="numero">{aprobados}</p>
              </div>
              <div className="card card-red">
                <h3>❌ Rechazados</h3>
                <p className="numero">{rechazados}</p>
              </div>
              <div className="card card-yellow">
                <h3>📈 Total Horas Aprobadas</h3>
                <p className="numero">{totalHorasAprobadas}h</p>
              </div>
            </div>

            {/* Tabla: Registros Pendientes */}
            <h3>⏳ Registros Pendientes de Aprobación</h3>
            {registrosFiltrados.filter(r => r.estado === 'pendiente').length === 0 ? (
              <p className="sin-datos">No hay registros pendientes</p>
            ) : (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Especialista</th>
                    <th>Tipo</th>
                    <th>Descripción</th>
                    <th>Fecha</th>
                    <th>Horas</th>
                    <th>Especialidad</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosFiltrados.filter(r => r.estado === 'pendiente').map(r => (
                    <tr key={r.id}>
                      <td><strong>{r.createdByNombre || r.especialista}</strong></td>
                      <td>{r.tipo}</td>
                      <td>{r.descripcion?.substring(0, 30)}</td>
                      <td>{parseDate(r.fechaInicio)}</td>
                      <td className="numero">{r.horas}h</td>
                      <td>{r.especialidad}</td>
                      <td className="acciones">
                        <button 
                          className="btn-aprobar"
                          onClick={() => manejarAprobacion(r.id, 'exitoso')}
                          title="Aprobar registro"
                        >
                          ✅ Aprobar
                        </button>
                        <button 
                          className="btn-rechazar"
                          onClick={() => manejarAprobacion(r.id, 'fallido')}
                          title="Rechazar registro"
                        >
                          ❌ Rechazar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Gráficos */}
            <div style={{display: 'flex', gap: '20px', marginTop: '30px', flexWrap: 'wrap', justifyContent: 'space-around'}}>
              {/* Gráfico 1: Especialidad */}
              {datosEspecialidad.length > 0 && (
                <div style={{flex: 1, minWidth: '300px', background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #ddd'}}>
                  <h4 style={{marginTop: 0, marginBottom: '15px', color: '#333'}}>📊 Horas por Especialidad</h4>
                  <table style={{width: '100%', fontSize: '14px', borderCollapse: 'collapse'}}>
                    <tbody>
                      {datosEspecialidad.map((d, idx) => (
                        <tr key={d.name} style={{borderBottom: idx < datosEspecialidad.length - 1 ? '1px solid #eee' : 'none', paddingBottom: '8px'}}>
                          <td style={{padding: '8px 0'}}><strong>{d.name}</strong></td>
                          <td style={{textAlign: 'right', padding: '8px 0', fontWeight: 'bold', color: '#2196F3'}}>{d.value.toFixed(2)}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {/* Gráfico 2: Top 10 Especialistas */}
              {datosEspecialista.length > 0 && (
                <div style={{flex: 1, minWidth: '300px', background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #ddd'}}>
                  <h4 style={{marginTop: 0, marginBottom: '15px', color: '#333'}}>👥 Top Especialistas</h4>
                  <table style={{width: '100%', fontSize: '14px', borderCollapse: 'collapse'}}>
                    <tbody>
                      {datosEspecialista.map((d, idx) => (
                        <tr key={d.name} style={{borderBottom: idx < datosEspecialista.length - 1 ? '1px solid #eee' : 'none', paddingBottom: '8px'}}>
                          <td style={{padding: '8px 0'}}><strong>{d.name?.substring(0, 25)}</strong></td>
                          <td style={{textAlign: 'right', padding: '8px 0', fontWeight: 'bold', color: '#4CAF50'}}>{d.value.toFixed(2)}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <h3>📋 Historial de Aprobaciones</h3>
            {registrosFiltrados.filter(r => r.estado !== 'pendiente').length === 0 ? (
              <p className="sin-datos">No hay registros procesados</p>
            ) : (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Especialista</th>
                    <th>Horas</th>
                    <th>Especialidad</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosFiltrados.filter(r => r.estado !== 'pendiente').map(r => (
                    <tr key={r.id}>
                      <td>{r.createdByNombre || r.especialista}</td>
                      <td className="numero">{r.horas}h</td>
                      <td>{r.especialidad}</td>
                      <td>
                        <span className={`badge badge-${r.estado}`}>
                          {r.estado === 'exitoso' ? '✅ Aprobado' : '❌ Rechazado'}
                        </span>
                      </td>
                      <td>{parseDate(r.fechaInicio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
