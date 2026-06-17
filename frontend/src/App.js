import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// FUNCIONES HELPER PARA FECHAS
const toDate = (fecha) => {
  if (fecha instanceof Date) return fecha;
  
  if (typeof fecha === 'string') {
    // Si es formato YYYY-MM-DD sin hora, preservar 00:00
    if (fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = fecha.split('-').map(Number);
      return new Date(year, month - 1, day, 0, 0, 0);
    }
    // Si es ISO string con hora, parsear correctamente
    if (fecha.includes('T')) {
      return new Date(fecha);
    }
    return new Date(fecha);
  }
  
  // Firebase Timestamp
  if (fecha && fecha.toDate && typeof fecha.toDate === 'function') {
    return fecha.toDate();
  }
  
  // Firebase Firestore timestamp object
  if (fecha && fecha._seconds) {
    return new Date(fecha._seconds * 1000);
  }
  
  return new Date();
};

const toDateString = (fecha) => {
  try {
    const d = toDate(fecha);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
};

const toTimeString = (fecha) => {
  try {
    const d = toDate(fecha);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return '00:00';
  }
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [usuario, setUsuario] = useState(JSON.parse(localStorage.getItem('usuario') || '{}'));
  const [registros, setRegistros] = useState([]);
  const [vista, setVista] = useState('registros');

  // Cambiar vista inicial según el rol
  useEffect(() => {
    if (usuario?.rol === 'admin') {
      setVista('dashboard');
    }
  }, [usuario?.rol]);
  const [auditoria, setAuditoria] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [usuarioList, setUsuarioList] = useState([]);
  const [modalEdicion, setModalEdicion] = useState({ abierto: false, registro: null });
  const [formularioModal, setFormularioModal] = useState({});
  
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
  // Cargar dashboard (datos no usados actualmente)
  const cargarDashboard = useCallback(async () => {
    if (!token) return;
    try {
      // Endpoint disponible pero datos no usados en UI
      // await axios.get(`${API_URL}/api/dashboard/resumen`, {
      //   headers: { Authorization: `Bearer ${token}` }
      // });
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

  // Cargar lista de usuarios (para admin)
  const cargarUsuarios = useCallback(async () => {
    if (!token || usuario.rol !== 'admin') return;
    try {
      const response = await axios.get(`${API_URL}/api/admin/listar-usuarios`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.usuarios) {
        setUsuarioList(response.data.usuarios);
      }
    } catch (err) {
      console.error('Error cargando usuarios:', err.message);
    }
  }, [token, usuario.rol]);

  // Efecto inicial
  useEffect(() => {
    cargarRegistros();
    cargarDashboard();
    if (usuario.rol === 'admin') {
      cargarAuditoria();
      cargarUsuarios();
    }
  }, [token, cargarRegistros, cargarDashboard, cargarAuditoria, cargarUsuarios, usuario.rol]);

  // Cargar usuarios cuando se abre la vista de gestión
  useEffect(() => {
    if (vista === 'usuarios' && usuario.rol === 'admin') {
      cargarUsuarios();
    }
  }, [vista, cargarUsuarios, usuario.rol]);

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
    try {
      if (registro.estado !== "fallido") {
        alert("❌ Solo puedes editar registros rechazados");
        return;
      }
      
      alert("ℹ️ Editando registro rechazado.\n\nPuedes corregir y volver a enviarlo para aprobación.");
      
      setModalEdicion({ abierto: true, registro });
      setFormularioModal({
        tipo: registro.tipo || "cambio",
        descripcion: registro.descripcion || "",
        cliente: registro.cliente || "Banco de Chile",
        fechaInicio: toDate(registro.fechaInicio),
        fechaFin: toDate(registro.fechaFin),
        horas: registro.horas || 0,
        especialista: registro.especialista || usuario.nombre || "",
        especialidad: registro.especialidad || "operaciones",
        interno_cliente: registro.interno_cliente || "interno",
        genera_ovt: registro.genera_ovt || "si"
      });
    } catch (err) {
      console.error("Error en cargarParaEditar:", err);
      alert("❌ Error al abrir modal: " + err.message);
    }
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

  // Filtrar registros del usuario actual (especialista)
  const misRegistrosFiltrados = registros.filter(r => {
    // Solo registros del usuario actual
    if (r.createdBy !== usuario.usuario) return false;
    
    // Filtrar por mes/año si está en "Mi Resumen"
    if (vista === 'resumen') {
      try {
        let fecha;
        if (r.fechaInicio.toDate && typeof r.fechaInicio.toDate === 'function') {
          fecha = r.fechaInicio.toDate();
        } else if (typeof r.fechaInicio === 'object' && r.fechaInicio._seconds !== undefined) {
          fecha = new Date(r.fechaInicio._seconds * 1000);
        } else {
          fecha = new Date(r.fechaInicio);
        }
        
        if (isNaN(fecha.getTime())) return false;
        
        const mesCoincide = fecha.getMonth() === filtros.mes - 1;
        const anioCoincide = fecha.getFullYear() === filtros.anio;
        
        if (!mesCoincide || !anioCoincide) return false;
      } catch (err) {
        return false;
      }
    }
    
    // Filtrar por estado si está seleccionado
    if (filtros.estado && r.estado !== filtros.estado) return false;
    
    return true;
  });
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
        {usuario.rol === 'especialista' && (
          <button 
            className={vista === 'registros' ? 'nav-btn active' : 'nav-btn'} 
            onClick={() => setVista('registros')}
          >
            📋 Registrar Cambio/Alerta
          </button>
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
              className={vista === 'usuarios' ? 'nav-btn active' : 'nav-btn'} 
              onClick={() => setVista('usuarios')}
            >
              👥 Gestión de Usuarios
            </button>
            <button 
              className={vista === 'mantenedor' ? 'nav-btn active' : 'nav-btn'} 
              onClick={() => setVista('mantenedor')}
            >
              ⚙️ Mantenedor
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
                      (formulario.fechaInicio instanceof Date ? toDateString(formulario.fechaInicio) : formulario.fechaInicio)
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
                      (formulario.fechaFin instanceof Date ? toDateString(formulario.fechaFin) : formulario.fechaFin)
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
                <h3>📋 Registros</h3>
                <p className="numero">{misRegistrosFiltrados.length}</p>
              </div>
              <div className="card card-green">
                <h3>✅ Horas Aprobadas</h3>
                <p className="numero">{misRegistrosFiltrados.filter(r => r.estado === 'exitoso').reduce((sum, r) => sum + (r.horas || 0), 0)}h</p>
              </div>
              <div className="card card-yellow">
                <h3>⏳ Registros Pendientes</h3>
                <p className="numero">{misRegistrosFiltrados.filter(r => r.estado === 'pendiente').length}</p>
              </div>
            </div>

            {/* Filtros */}
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
            {misRegistrosFiltrados.length === 0 ? (
              <p className="sin-datos">No hay registros para este período</p>
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
                  {misRegistrosFiltrados.map(r => (
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
                        {r.estado === 'pendiente' ? (
                          <button 
                            className="btn-editar"
                            disabled
                            title="No puedes editar mientras está pendiente de aprobación"
                            style={{opacity: 0.5, cursor: 'not-allowed'}}
                          >
                            ⏳ Pendiente
                          </button>
                        ) : r.estado === 'exitoso' ? (
                          <button 
                            className="btn-editar"
                            disabled
                            title="No puedes editar registros aprobados"
                            style={{opacity: 0.5, cursor: 'not-allowed'}}
                          >
                            ✅ Aprobado
                          </button>
                        ) : (
                          <button 
                            className="btn-editar"
                            onClick={() => cargarParaEditar(r)}
                            title="Editar registro rechazado"
                          >
                            ✏️ Editar
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

        {/* SECCIÓN: GESTIÓN DE USUARIOS (Admin) */}
        {vista === 'usuarios' && usuario.rol === 'admin' && (
          <section className="seccion">
            <h2>👥 Gestión de Perfiles y Usuarios</h2>

            {/* Formulario Crear Usuario */}
            <div className="form-container">
              <h3>➕ Crear Nuevo Usuario</h3>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                
                const nuevoUsuario = {
                  usuario: e.target.usuario.value,
                  nombre: e.target.nombre.value,
                  rol: e.target.rol.value,
                  departamento: e.target.departamento.value,
                  contrasena: e.target.contrasena.value
                };

                // Validar campos
                if (!nuevoUsuario.usuario || !nuevoUsuario.nombre || !nuevoUsuario.contrasena || !nuevoUsuario.rol) {
                  alert('❌ Todos los campos son requeridos');
                  return;
                }

                // Llamar al backend
                axios.post(`${API_URL}/api/admin/crear-usuario`, nuevoUsuario, {
                  headers: { Authorization: `Bearer ${token}` }
                })
                .then(res => {
                  alert(`✅ ${res.data.message}`);
                  // Limpiar formulario
                  e.target.reset();
                  // Recargar si es necesario
                  cargarRegistros();
                })
                .catch(err => {
                  alert('❌ Error: ' + (err.response?.data?.error || err.message));
                });
              }}>
                
                <div className="form-group">
                  <label>Rol * (Selecciona el tipo de usuario)</label>
                  <select name="rol" defaultValue="especialista" required onChange={(e) => {
                    const rol = e.target.value;
                    const deptField = e.target.closest('form').querySelector('[name="departamento"]');
                    if (rol === 'admin') {
                      deptField.disabled = false;
                    } else if (rol === 'itsm') {
                      deptField.value = 'ITSM';
                      deptField.disabled = true;
                    } else {
                      deptField.value = 'Especialista';
                      deptField.disabled = true;
                    }
                  }}>
                    <option value="admin">🔑 Admin</option>
                    <option value="especialista">👤 Especialista</option>
                    <option value="itsm">🛠️ ITSM</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Usuario * (ej: miguel.padilla)</label>
                  <input 
                    type="text" 
                    name="usuario"
                    placeholder="usuario_sin_espacios"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Nombre Completo *</label>
                  <input 
                    type="text" 
                    name="nombre"
                    placeholder="ej: Miguel Padilla"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Departamento/Equipo</label>
                  <select name="departamento" defaultValue="Especialista">
                    <optgroup label="Admin">
                      <option value="DPE">DPE</option>
                      <option value="Squad">Squad</option>
                      <option value="TL">Team Lead (TL)</option>
                    </optgroup>
                    <optgroup label="Especialista">
                      <option value="Middleware">Middleware</option>
                      <option value="Operaciones Cloud">Operaciones Cloud</option>
                    </optgroup>
                    <optgroup label="ITSM">
                      <option value="ITSM">ITSM</option>
                    </optgroup>
                  </select>
                </div>

                <div className="form-group">
                  <label>Contraseña Inicial *</label>
                  <input 
                    type="password" 
                    name="contrasena"
                    placeholder="ej: demo123"
                    required
                  />
                  <small>Mínimo 4 caracteres. El usuario puede cambiarla después.</small>
                </div>

                <button type="submit" className="btn-guardar">
                  ✅ Crear Usuario
                </button>
              </form>
            </div>

            {/* Tabla de usuarios por rol */}
            <div style={{marginTop: '30px'}}>
              <h3>📋 Usuarios Creados</h3>
              
              <div style={{display: 'flex', gap: '20px', marginTop: '15px', flexWrap: 'wrap'}}>
                {/* Admins */}
                <div style={{flex: 1, minWidth: '280px', background: '#f5f5f5', padding: '15px', borderRadius: '8px', border: '2px solid #2196F3'}}>
                  <h4 style={{color: '#2196F3', marginTop: 0}}>🔑 Admins</h4>
                  <p style={{fontSize: '12px', color: '#666'}}>
                    • Miguel Padilla (DPE)<br/>
                    • Hugo Araya (DPE)<br/>
                    • Gustavo Reyes (Squad)<br/>
                    • Najeeb Escobar (TL)<br/>
                    • john Estrada (TL)
                  </p>
                </div>

                {/* Especialistas */}
                <div style={{flex: 1, minWidth: '280px', background: '#f5f5f5', padding: '15px', borderRadius: '8px', border: '2px solid #4CAF50'}}>
                  <h4 style={{color: '#4CAF50', marginTop: 0}}>👤 Especialistas</h4>
                  <p style={{fontSize: '12px', color: '#666'}}>
                    • Jorge Maureira<br/>
                    • Jhon Estrada<br/>
                    • Luis Vasquez<br/>
                    • ... (22 especialistas en total)
                  </p>
                </div>

                {/* ITSM */}
                <div style={{flex: 1, minWidth: '280px', background: '#f5f5f5', padding: '15px', borderRadius: '8px', border: '2px solid #FF9800'}}>
                  <h4 style={{color: '#FF9800', marginTop: 0}}>🛠️ ITSM</h4>
                  <p style={{fontSize: '12px', color: '#666'}}>
                    • Danilo Isla
                  </p>
                </div>
              </div>
            </div>

            {/* Info útil */}
            <div style={{
              background: '#e3f2fd',
              padding: '15px',
              borderRadius: '8px',
              marginTop: '20px',
              fontSize: '13px',
              borderLeft: '4px solid #2196F3'
            }}>
              <strong>ℹ️ Información:</strong><br/>
              <strong>🔑 Admin:</strong> Ve Dashboard, Mantenedor, Gestión de Usuarios, Auditoría<br/>
              <strong>👤 Especialista:</strong> Ve Registrar Cambios/Alertas, Mi Resumen<br/>
              <strong>🛠️ ITSM:</strong> Ve Dashboard ITSM (próximamente), Auditoría<br/>
              • Contraseña inicial: Se puede cambiar después de login<br/>
              • Se registra cada creación en auditoría
            </div>

            {/* SECCIÓN: RESETEAR CONTRASEÑA */}
            <h3 style={{marginTop: '40px', borderTop: '2px solid #ddd', paddingTop: '20px'}}>🔐 Gestionar Usuarios</h3>
            
            <div className="form-group">
              <label>🔍 Buscar Usuario</label>
              <input 
                type="text"
                id="buscador-usuarios"
                placeholder="Busca por usuario, nombre o departamento..."
                onChange={(e) => {
                  const busqueda = e.target.value.toLowerCase();
                  const lista = document.querySelectorAll('[data-usuario-item]');
                  lista.forEach(item => {
                    const coincide = item.getAttribute('data-usuario-item').includes(busqueda) || 
                                    item.getAttribute('data-nombre-item').toLowerCase().includes(busqueda) ||
                                    item.getAttribute('data-dept-item').toLowerCase().includes(busqueda);
                    item.style.display = coincide ? 'flex' : 'none';
                  });
                }}
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '14px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  marginBottom: '15px'
                }}
              />
            </div>

            <div id="lista-usuarios-container">
              {usuarioList && usuarioList.length > 0 ? (
                usuarioList.map(u => (
                  <div 
                    key={u.usuario} 
                    data-usuario-item={u.usuario}
                    data-nombre-item={u.nombre}
                    data-dept-item={u.departamento}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      background: '#f9f9f9',
                      borderRadius: '6px',
                      marginBottom: '8px',
                      border: '1px solid #eee'
                    }}
                  >
                    <div>
                      <strong>{u.nombre}</strong><br/>
                      <small style={{color: '#666'}}>@{u.usuario} • {u.rol} • {u.departamento}</small>
                    </div>
                    <div style={{display: 'flex', gap: '8px'}}>
                      <button
                        onClick={() => {
                          const nuevaContraseña = prompt(`Ingresa nueva contraseña para ${u.nombre}:\n(mínimo 4 caracteres)`, 'demo123');
                          
                          if (!nuevaContraseña) return;
                          if (nuevaContraseña.length < 4) {
                            alert('❌ La contraseña debe tener mínimo 4 caracteres');
                            return;
                          }

                          axios.post(`${API_URL}/api/admin/resetear-contrasena`, 
                            { 
                              usuario: u.usuario, 
                              contraseñaNueva: nuevaContraseña 
                            },
                            { headers: { Authorization: `Bearer ${token}` } }
                          )
                          .then(res => {
                            alert(`✅ Contraseña reseteada\nNueva: ${nuevaContraseña}`);
                          })
                          .catch(err => {
                            alert('❌ Error: ' + (err.response?.data?.error || err.message));
                          });
                        }}
                        style={{
                          padding: '8px 16px',
                          background: '#FF9800',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}
                      >
                        🔐 Resetear
                      </button>
                      
                      <button
                        onClick={() => {
                          if (u.usuario === 'admin') {
                            alert('❌ No se puede eliminar al admin original');
                            return;
                          }
                          if (!window.confirm(`¿Eliminar a ${u.nombre}? Esta acción no se puede deshacer.`)) return;

                          axios.post(`${API_URL}/api/admin/eliminar-usuario`, 
                            { usuario: u.usuario },
                            { headers: { Authorization: `Bearer ${token}` } }
                          )
                          .then(res => {
                            alert(`✅ Usuario ${u.nombre} eliminado`);
                            // Recargar lista
                            cargarUsuarios();
                          })
                          .catch(err => {
                            alert('❌ Error: ' + (err.response?.data?.error || err.message));
                          });
                        }}
                        style={{
                          padding: '8px 16px',
                          background: '#f44336',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p style={{textAlign: 'center', color: '#999'}}>Cargando usuarios...</p>
              )}
            </div>

            <div style={{
              background: '#fff3cd',
              padding: '12px',
              borderRadius: '6px',
              marginTop: '15px',
              fontSize: '12px',
              borderLeft: '4px solid #FF9800'
            }}>
              <strong>⚠️ Importante:</strong><br/>
              • 🔐 Resetear: Asigna nueva contraseña al usuario<br/>
              • 🗑️ Eliminar: Elimina permanentemente el usuario<br/>
              • Se registra cada acción en auditoría<br/>
              • El usuario puede cambiar su contraseña después de login
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

        {/* MODAL MEJORADO - EDICIÓN COMPLETA */}
        {modalEdicion && modalEdicion.abierto && (
          <div style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', padding: '30px', borderRadius: '12px', zIndex: 9999, width: '95%', maxWidth: '600px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto'}}>
            <h2 style={{marginTop: 0, marginBottom: '20px'}}>✏️ Editar Registro Rechazado</h2>
            
            {/* INFO NO EDITABLE */}
            <div style={{background: '#f5f5f5', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px'}}>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
                <div>
                  <span style={{color: '#666', display: 'block', marginBottom: '4px', fontWeight: '500'}}>Especialista</span>
                  <span>{modalEdicion?.registro?.especialista || 'N/A'}</span>
                </div>
                <div>
                  <span style={{color: '#666', display: 'block', marginBottom: '4px', fontWeight: '500'}}>Estado Actual</span>
                  <span style={{background: '#FFE0B2', color: '#E65100', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500', display: 'inline-block'}}>Rechazado</span>
                </div>
                <div>
                  <span style={{color: '#666', display: 'block', marginBottom: '4px', fontWeight: '500'}}>Cliente</span>
                  <span>{modalEdicion?.registro?.cliente || 'N/A'}</span>
                </div>
              </div>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (!modalEdicion?.registro?.id) {
                alert('Error: No se pudo obtener el ID del registro');
                return;
              }
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
            }}>
              
              <div style={{marginBottom: '15px'}}>
                <label style={{display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px'}}>Tipo *</label>
                <select 
                  value={formularioModal.tipo || 'cambio'}
                  onChange={(e) => setFormularioModal({...formularioModal, tipo: e.target.value})}
                  style={{width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px'}}
                >
                  <option value="cambio">Cambio</option>
                  <option value="alerta">Alerta</option>
                </select>
              </div>

              <div style={{marginBottom: '15px'}}>
                <label style={{display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px'}}>Descripción *</label>
                <textarea 
                  value={formularioModal.descripcion || ''} 
                  onChange={(e) => setFormularioModal({...formularioModal, descripcion: e.target.value})} 
                  style={{width: '100%', minHeight: '80px', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontFamily: 'inherit', fontSize: '14px'}} 
                />
              </div>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px'}}>
                <div>
                  <label style={{display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px'}}>Fecha Inicio *</label>
                  <input 
                    type="date"
                    value={formularioModal.fechaInicio ? (formularioModal.fechaInicio instanceof Date ? toDateString(formularioModal.fechaInicio) : formularioModal.fechaInicio) : ''}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      
                      // Validar que el formato sea correcto (YYYY-MM-DD)
                      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                      if (!dateRegex.test(e.target.value)) {
                        console.warn('Formato de fecha inválido:', e.target.value);
                        return;
                      }
                      
                      const horaActual = formularioModal.fechaInicio instanceof Date ? formularioModal.fechaInicio.getHours() : 0;
                      const minActual = formularioModal.fechaInicio instanceof Date ? formularioModal.fechaInicio.getMinutes() : 0;
                      const [year, month, day] = e.target.value.split('-').map(Number);
                      const fecha = new Date(year, month - 1, day, horaActual, minActual, 0);
                      if (isNaN(fecha.getTime())) {
                        console.warn('Fecha inválida:', e.target.value);
                        return;
                      }
                      
                      const fin = formularioModal.fechaFin;
                      let horas = formularioModal.horas;
                      if (fin && !isNaN(fin.getTime()) && !isNaN(fecha.getTime())) {
                        horas = parseFloat(Math.max(0, ((fin - fecha) / (1000 * 60 * 60)).toFixed(2)));
                      }
                      setFormularioModal({...formularioModal, fechaInicio: fecha, horas});
                    }}
                    style={{width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px'}}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px'}}>Hora Inicio *</label>
                  <input 
                    type="time"
                    value={formularioModal.fechaInicio ? (formularioModal.fechaInicio instanceof Date ? toTimeString(formularioModal.fechaInicio) : '00:00') : ''}
                    onChange={(e) => {
                      if (!e.target.value || !formularioModal.fechaInicio) return;
                      const [h, m] = e.target.value.split(':');
                      const fecha = new Date(formularioModal.fechaInicio);
                      fecha.setHours(parseInt(h), parseInt(m), 0);
                      
                      const fin = formularioModal.fechaFin;
                      let horas = formularioModal.horas;
                      if (fin && !isNaN(fin.getTime()) && !isNaN(fecha.getTime())) {
                        horas = parseFloat(Math.max(0, ((fin - fecha) / (1000 * 60 * 60)).toFixed(2)));
                      }
                      setFormularioModal({...formularioModal, fechaInicio: fecha, horas});
                    }}
                    style={{width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px'}}
                  />
                </div>
              </div>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px'}}>
                <div>
                  <label style={{display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px'}}>Fecha Fin *</label>
                  <input 
                    type="date"
                    value={formularioModal.fechaFin ? (formularioModal.fechaFin instanceof Date ? toDateString(formularioModal.fechaFin) : formularioModal.fechaFin) : ''}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      
                      // Validar que el formato sea correcto (YYYY-MM-DD)
                      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                      if (!dateRegex.test(e.target.value)) {
                        console.warn('Formato de fecha inválido:', e.target.value);
                        return;
                      }
                      
                      const horaActual = formularioModal.fechaInicio instanceof Date ? formularioModal.fechaInicio.getHours() : 0;
                      const minActual = formularioModal.fechaInicio instanceof Date ? formularioModal.fechaInicio.getMinutes() : 0;
                      const [year, month, day] = e.target.value.split('-').map(Number);
                      const fecha = new Date(year, month - 1, day, horaActual, minActual, 0);
                      if (isNaN(fecha.getTime())) {
                        console.warn('Fecha inválida:', e.target.value);
                        return;
                      }
                      
                      const inicio = formularioModal.fechaInicio;
                      let horas = formularioModal.horas;
                      if (inicio && !isNaN(inicio.getTime()) && !isNaN(fecha.getTime())) {
                        horas = parseFloat(Math.max(0, ((fecha - inicio) / (1000 * 60 * 60)).toFixed(2)));
                      }
                      setFormularioModal({...formularioModal, fechaFin: fecha, horas});
                    }}
                    style={{width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px'}}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px'}}>Hora Fin *</label>
                  <input 
                    type="time"
                    value={formularioModal.fechaFin ? (formularioModal.fechaFin instanceof Date ? toTimeString(formularioModal.fechaFin) : '00:00') : ''}
                    onChange={(e) => {
                      if (!e.target.value || !formularioModal.fechaFin) return;
                      const [h, m] = e.target.value.split(':');
                      const fecha = new Date(formularioModal.fechaFin);
                      fecha.setHours(parseInt(h), parseInt(m), 0);
                      
                      const inicio = formularioModal.fechaInicio;
                      let horas = formularioModal.horas;
                      if (inicio && !isNaN(inicio.getTime()) && !isNaN(fecha.getTime())) {
                        horas = parseFloat(Math.max(0, ((fecha - inicio) / (1000 * 60 * 60)).toFixed(2)));
                      }
                      setFormularioModal({...formularioModal, fechaFin: fecha, horas});
                    }}
                    style={{width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px'}}
                  />
                </div>
              </div>

              <div style={{marginBottom: '15px'}}>
                <label style={{display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px'}}>Horas (Calculadas Automáticamente)</label>
                <input 
                  type="number" 
                  value={formularioModal.horas || 0} 
                  disabled
                  style={{width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', background: '#f5f5f5', color: '#999', fontSize: '14px'}} 
                />
                <span style={{fontSize: '12px', color: '#999', marginTop: '4px', display: 'block'}}>Cambiar fecha/hora para recalcular</span>
              </div>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px'}}>
                <div>
                  <label style={{display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px'}}>Especialidad *</label>
                  <select 
                    value={formularioModal.especialidad || ''}
                    onChange={(e) => setFormularioModal({...formularioModal, especialidad: e.target.value})}
                    style={{width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px'}}
                  >
                    <option value="">Selecciona...</option>
                    <option value="middleware">Middleware</option>
                    <option value="operaciones">Operaciones Cloud</option>
                  </select>
                </div>
                <div>
                  <label style={{display: 'block', fontWeight: '600', marginBottom: '5px', fontSize: '14px'}}>¿Genera OVT? *</label>
                  <select 
                    value={formularioModal.genera_ovt || 'si'}
                    onChange={(e) => setFormularioModal({...formularioModal, genera_ovt: e.target.value})}
                    style={{width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px'}}
                  >
                    <option value="si">Sí</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>
              
              <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
                <button 
                  type="submit" 
                  style={{flex: 1, padding: '12px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px'}}
                >
                  ✅ Guardar y Enviar a Aprobación
                </button>
                <button 
                  type="button" 
                  onClick={() => setModalEdicion({abierto: false, registro: null})}
                  style={{flex: 1, padding: '12px', background: '#999', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px'}}
                >
                  ✗ Cancelar
                </button>
              </div>

              <div style={{fontSize: '12px', color: '#666', textAlign: 'center', marginTop: '12px'}}>
                El registro quedará como "Pendiente de Aprobación"
              </div>
            </form>
          </div>
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
