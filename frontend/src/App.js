import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import TestGroq from './TestGroq';
import NuevaProyeccionITSM from './components/NuevaProyeccionITSM';
import MisProyeccionesITSM from './components/MisProyeccionesITSM';
import ExcelUploadITSM from './components/ExcelUploadITSM';
import ClaimDashboard from './components/ClaimDashboard';
import OvtProyectado from './components/OvtProyectado';
import ExcelUpload from './components/ExcelUpload';
import Analytics from './components/Analytics';
import GestionUsuarios from './components/GestionUsuarios';
import PermisosRoles from './components/PermisosRoles';
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
  const [clienteActivo, setClienteActivo] = useState(localStorage.getItem('clienteActivo') || '');
  const [seleccionandoCliente, setSeleccionandoCliente] = useState(false);
  const [clientesInfo, setClientesInfo] = useState([]);
  const [permisos, setPermisos] = useState(null); // permisos por rol cargados de Firestore
  const [registros, setRegistros] = useState([]);
  const [vista, setVista] = useState('registros');

  // Cambiar vista inicial según el rol
  useEffect(() => {
    if (usuario?.rol === 'admin') {
      setVista('dashboard');
    } else if (usuario?.rol === 'itsm') {
      setVista('proyeccion-mis');
    } else if (usuario?.rol === 'dpe') {
      setVista('dashboard');
    }
  }, [usuario?.rol]);

  // Cargar permisos de roles al iniciar sesión
  useEffect(() => {
    if (!token) return;
    axios.get(`${API_URL}/api/permisos-roles`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setPermisos(res.data))
      .catch(() => setPermisos(null)); // si falla, usa la lógica hardcoded como fallback
  }, [token]);

  // Cargar info de clientes para DPE
  useEffect(() => {
    if (!token || (usuario?.rol !== 'dpe' && usuario?.rol !== 'admin')) return;
    axios.get(`${API_URL}/api/clientes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        setClientesInfo(res.data || []);
        // Si DPE tiene múltiples clientes y no hay clienteActivo, mostrar selector
        if (usuario?.rol === 'dpe') {
          const ids = usuario?.clientesIds || [];
          if (!clienteActivo && ids.length > 0) {
            if (ids.length === 1) {
              setClienteActivo(ids[0]);
              localStorage.setItem('clienteActivo', ids[0]);
            } else {
              setSeleccionandoCliente(true);
            }
          }
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, usuario?.rol]);
  const [auditoria, setAuditoria] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [usuarioList, setUsuarioList] = useState([]);
  const [modalEdicion, setModalEdicion] = useState({ abierto: false, registro: null });
  const [seleccionados, setSeleccionados] = useState([]);
  const [seleccionadosPendientes, setSeleccionadosPendientes] = useState([]);
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
    interno_cliente: 'cliente',
    genera_ovt: 'si',
    estado: 'pendiente',
    especialidad: 'operaciones',
    numeroTicket: ''
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
    // Redondear a múltiplos de 0.05 (evita 24.01, 24.02, 24.03, 24.04)
    // Permite: 24.00, 24.05, 24.10, 24.15, 24.20, 24.25...
    return Math.max(0, Math.round(diff * 20) / 20);
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
      localStorage.setItem('lastActivity', Date.now().toString());
      setToken(response.data.token);
      setUsuario(response.data.usuario);
      setVista('registros');
    } catch (err) {
      alert('Credenciales incorrectas');
    }
  };

  // Logout
  const manejarLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    localStorage.removeItem('lastActivity');
    localStorage.removeItem('clienteActivo');
    setToken(null);
    setUsuario({});
    setClienteActivo('');
    setSeleccionandoCliente(false);
  }, []);

  // ============================================
  // CIERRE DE SESIÓN POR INACTIVIDAD (30 minutos)
  // ============================================
  useEffect(() => {
    if (!token) return;

    const LIMITE_INACTIVIDAD = 30 * 60 * 1000; // 30 minutos

    const registrarActividad = () => {
      localStorage.setItem('lastActivity', Date.now().toString());
    };

    // Si no hay registro previo (ej: login recién hecho), lo inicializa
    if (!localStorage.getItem('lastActivity')) {
      registrarActividad();
    }

    // Si al cargar la app ya pasaron 30+ min desde la última actividad
    // (ej: la pestaña estuvo cerrada o inactiva), cierra sesión de inmediato
    const ultimaActividad = parseInt(localStorage.getItem('lastActivity') || '0', 10);
    if (Date.now() - ultimaActividad > LIMITE_INACTIVIDAD) {
      manejarLogout();
      alert('Tu sesión se cerró por inactividad (30 minutos sin uso).');
      return;
    }

    const eventos = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    eventos.forEach(ev => window.addEventListener(ev, registrarActividad));

    const intervalo = setInterval(() => {
      const ultima = parseInt(localStorage.getItem('lastActivity') || '0', 10);
      if (Date.now() - ultima > LIMITE_INACTIVIDAD) {
        manejarLogout();
        alert('Tu sesión se cerró por inactividad (30 minutos sin uso).');
      }
    }, 30 * 1000); // revisa cada 30 segundos

    return () => {
      eventos.forEach(ev => window.removeEventListener(ev, registrarActividad));
      clearInterval(intervalo);
    };
  }, [token, manejarLogout]);

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
        interno_cliente: 'cliente',
        genera_ovt: 'si',
        estado: 'pendiente',
        especialidad: 'operaciones',
        numeroTicket: ''
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
      const esAdmin = usuario.rol === 'admin';

      if (!esAdmin && registro.estado !== "fallido") {
        alert("❌ Solo puedes editar registros rechazados");
        return;
      }

      if (registro.estado === "fallido") {
        alert("ℹ️ Editando registro rechazado.\n\nPuedes corregir y volver a enviarlo para aprobación.");
      } else if (esAdmin) {
        alert("ℹ️ Editando registro como administrador.\n\nEl estado actual (" + registro.estado + ") se mantendrá; no se reenviará a aprobación.");
      }
      
      setModalEdicion({ abierto: true, registro });
      setFormularioModal({
        tipo: registro.tipo || "cambio",
        descripcion: registro.descripcion || "",
        cliente: registro.cliente || "Banco de Chile",
        fechaInicio: toDate(registro.fechaInicio),
        fechaFin: toDate(registro.fechaFin),
        horas: Math.max(0, Math.round((registro.horas || 0) * 20) / 20),
        especialista: registro.especialista || registro.createdByNombre || "Sin especialista",
        especialidad: registro.especialidad || "operaciones",
        interno_cliente: registro.interno_cliente || "interno",
        genera_ovt: registro.genera_ovt || "si",
        numeroTicket: registro.numeroTicket || "",
        estadoOriginal: registro.estado || "pendiente"
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
      interno_cliente: 'cliente',
      genera_ovt: 'si',
      estado: 'pendiente',
      especialidad: 'operaciones',
      numeroTicket: ''
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

  // Selección múltiple (Mantenedor)
  const toggleSeleccion = (id) => {
    setSeleccionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSeleccionarTodos = (idsVisibles) => {
    const todosSeleccionados = idsVisibles.every(id => seleccionados.includes(id));
    if (todosSeleccionados) {
      setSeleccionados(prev => prev.filter(id => !idsVisibles.includes(id)));
    } else {
      setSeleccionados(prev => [...new Set([...prev, ...idsVisibles])]);
    }
  };

  const manejarEliminarSeleccionados = async () => {
    if (seleccionados.length === 0) return;
    if (!window.confirm(`¿Eliminar ${seleccionados.length} registro(s) seleccionado(s)? Esta acción no se puede deshacer.`)) return;

    try {
      await Promise.all(
        seleccionados.map(id =>
          axios.delete(`${API_URL}/api/registros/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      alert(`✓ ${seleccionados.length} registro(s) eliminado(s)`);
      setSeleccionados([]);
      cargarRegistros();
      cargarDashboard();
    } catch (err) {
      alert('Error eliminando registros: ' + (err.response?.data?.error || err.message));
      cargarRegistros();
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

  // Selección múltiple para la tabla de Pendientes (Dashboard admin)
  const toggleSeleccionPendiente = (id) => {
    setSeleccionadosPendientes(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSeleccionarTodosPendientes = (idsVisibles) => {
    const todosSeleccionados = idsVisibles.every(id => seleccionadosPendientes.includes(id));
    if (todosSeleccionados) {
      setSeleccionadosPendientes(prev => prev.filter(id => !idsVisibles.includes(id)));
    } else {
      setSeleccionadosPendientes(prev => [...new Set([...prev, ...idsVisibles])]);
    }
  };

  const manejarAprobacionMasiva = async (nuevoEstado) => {
    if (seleccionadosPendientes.length === 0) return;
    const accionTexto = nuevoEstado === 'exitoso' ? 'aprobar' : 'rechazar';
    if (!window.confirm(`¿${accionTexto.charAt(0).toUpperCase() + accionTexto.slice(1)} ${seleccionadosPendientes.length} registro(s) seleccionado(s)?`)) return;

    try {
      await Promise.all(
        seleccionadosPendientes.map(id =>
          axios.patch(`${API_URL}/api/registros/${id}`, { estado: nuevoEstado }, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      alert(`✓ ${seleccionadosPendientes.length} registro(s) ${nuevoEstado === 'exitoso' ? 'aprobado(s)' : 'rechazado(s)'}`);
      setSeleccionadosPendientes([]);
      cargarRegistros();
      cargarDashboard();
    } catch (err) {
      alert('Error procesando registros: ' + (err.response?.data?.error || err.message));
      cargarRegistros();
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

  // SELECTOR DE CLIENTE para DPE con múltiples clientes
  if (seleccionandoCliente && usuario?.rol === 'dpe') {
    const clientesDpe = clientesInfo.filter(c => (usuario.clientesIds||[]).includes(c.id));
    return (
      <div className="container-login">
        <div className="login-box" style={{ maxWidth:'480px' }}>
          <h1>👋 Hola, {usuario.nombre.split(' ')[0]}</h1>
          <h2>Elige el cliente con el que quieres trabajar</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px', margin:'10px 0 20px' }}>
            {clientesDpe.map(c => (
              <button key={c.id} type="button"
                onClick={() => {
                  setClienteActivo(c.id);
                  localStorage.setItem('clienteActivo', c.id);
                  setSeleccionandoCliente(false);
                  setVista('claim');
                }}
                style={{ padding:'16px 20px', background:'#fff', border:'2px solid #e5e7eb', borderRadius:'10px',
                  cursor:'pointer', textAlign:'left', fontSize:'14px', fontWeight:'600', color:'#111827',
                  display:'flex', alignItems:'center', gap:'12px', transition:'border-color .2s' }}
                onMouseOver={e => e.currentTarget.style.borderColor='#FF462D'}
                onMouseOut={e => e.currentTarget.style.borderColor='#e5e7eb'}
              >
                <span style={{ width:'36px', height:'36px', borderRadius:'8px', background:'#FF462D', color:'#fff',
                  display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'800', fontSize:'14px', flexShrink:0 }}>
                  {c.nombre.substring(0,2).toUpperCase()}
                </span>
                <div>
                  <div>{c.nombre}</div>
                  <div style={{ fontSize:'12px', color:'#9ca3af', fontWeight:'400', marginTop:'2px' }}>#{c.id}</div>
                </div>
                <span style={{ marginLeft:'auto', fontSize:'20px' }}>→</span>
              </button>
            ))}
          </div>
          <button onClick={manejarLogout}
            style={{ background:'none', border:'none', color:'#9ca3af', fontSize:'13px', cursor:'pointer', textDecoration:'underline' }}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // VISTA: APLICACIÓN PRINCIPAL
  // ============================================
  const esDpeMultiCliente = usuario?.rol === 'dpe' && (usuario?.clientesIds||[]).length > 1;

  // Helper: ¿puede este usuario ver esta vista?
  // Admin siempre puede. Para el resto usa permisos de Firestore si están cargados.
  const puedeVer = (vista) => {
    if (!usuario?.rol) return false;
    if (usuario.rol === 'admin') return true;
    if (!permisos) return true; // fallback: no restricción si no se cargaron permisos
    return !!permisos[usuario.rol]?.[vista];
  };

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="header-left">
          <h1>🕐 Sistema OVT v2</h1>
        </div>
        <div className="header-right">
          {/* Selector rápido de cliente para DPE multi-cliente */}
          {esDpeMultiCliente && clienteActivo && (
            <div style={{ position:'relative' }}>
              <select
                value={clienteActivo}
                onChange={e => {
                  setClienteActivo(e.target.value);
                  localStorage.setItem('clienteActivo', e.target.value);
                }}
                style={{ padding:'6px 28px 6px 10px', borderRadius:'8px', border:'1.5px solid rgba(255,255,255,0.35)',
                  background:'rgba(255,255,255,0.15)', color:'#fff', fontSize:'13px', fontWeight:'600', cursor:'pointer',
                  appearance:'none', WebkitAppearance:'none' }}
              >
                {clientesInfo.filter(c=>(usuario.clientesIds||[]).includes(c.id)).map(c=>(
                  <option key={c.id} value={c.id} style={{ background:'#111', color:'#fff' }}>{c.nombre}</option>
                ))}
              </select>
              <span style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.7)', pointerEvents:'none', fontSize:'12px' }}>▾</span>
            </div>
          )}
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
          <>
            {puedeVer('registros') && <button className={vista === 'registros' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('registros')}>📋 Registrar Cambio/Alerta</button>}
            {puedeVer('resumen') && <button className={vista === 'resumen' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('resumen')}>📊 Mi Resumen</button>}
            {puedeVer('carga-excel') && <button className={vista === 'excel-upload' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('excel-upload')}>📥 Cargar Excel</button>}
          </>
        )}

        {usuario.rol === 'itsm' && (
          <>
            {puedeVer('proyeccion-nueva') && <button className={vista === 'proyeccion-nueva' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('proyeccion-nueva')}>📋 Nueva Proyección</button>}
            {puedeVer('proyeccion-mis') && <button className={vista === 'proyeccion-mis' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('proyeccion-mis')}>📊 Mis Proyecciones</button>}
            {puedeVer('proyeccion-excel') && <button className={vista === 'proyeccion-excel' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('proyeccion-excel')}>📥 Cargar Excel</button>}
          </>
        )}

        {usuario.rol === 'dpe' && (
          <>
            {puedeVer('dashboard') && <button className={vista === 'dashboard' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('dashboard')}>📊 Dashboard</button>}
            {puedeVer('analytics') && <button className={vista === 'analytics' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('analytics')}>📈 Analytics</button>}
            {puedeVer('ovt-proyectado') && <button className={vista === 'ovt-proyectado' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('ovt-proyectado')}>📅 OVT Proyectado</button>}
            {puedeVer('claim') && <button className={vista === 'claim' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('claim')}>🕐 Control de Labor</button>}
            {puedeVer('usuarios') && <button className={vista === 'usuarios' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('usuarios')}>👥 Gestión de Usuarios</button>}
          </>
        )}

        {usuario.rol === 'admin' && (
          <>
            {puedeVer('dashboard') && <button className={vista === 'dashboard' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('dashboard')}>📊 Dashboard</button>}
            {puedeVer('analytics') && <button className={vista === 'analytics' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('analytics')}>📈 Analytics</button>}
            {puedeVer('ovt-proyectado') && <button className={vista === 'ovt-proyectado' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('ovt-proyectado')}>📅 OVT Proyectado</button>}
            {puedeVer('claim') && <button className={vista === 'claim' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('claim')}>🕐 Control de Labor</button>}
            {puedeVer('usuarios') && <button className={vista === 'usuarios' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('usuarios')}>👥 Gestión de Usuarios</button>}
            {puedeVer('mantenedor') && <button className={vista === 'mantenedor' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('mantenedor')}>⚙️ Mantenedor</button>}
            {puedeVer('auditoria') && <button className={vista === 'auditoria' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('auditoria')}>🔍 Auditoría</button>}
            <button className={vista === 'permisos-roles' ? 'nav-btn active' : 'nav-btn'} onClick={() => setVista('permisos-roles')}>🔐 Permisos</button>
          </>
        )}
      </nav>

      {/* CONTENIDO PRINCIPAL */}
      <main className="main">
        
        {/* SECCIÓN: REGISTRAR CAMBIO/ALERTA */}
        {vista === 'registros' && usuario.rol === 'especialista' && (
          <section className="seccion">
            <h2>📋 {editandoId ? '✏️ Editar Cambio/Alerta' : 'Registrar Cambio o Alerta'}</h2>
            
            <form onSubmit={manejarRegistro} className="formulario-mejorado">
              <div className="form-group">
                <label>N° de Ticket</label>
                <input
                  type="text"
                  placeholder="Ej: INC0012345"
                  value={formulario.numeroTicket}
                  onChange={(e) => setFormulario({ ...formulario, numeroTicket: e.target.value })}
                />
              </div>

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
                    <option value="incidente">Incidente</option>
                    <option value="requerimiento">Requerimiento</option>
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

        {/* SECCIÓN: EXCEL UPLOAD */}
        {vista === 'excel-upload' && usuario.rol === 'especialista' && (
          <section className="seccion">
            <h2>📥 Cargar Registros desde Excel</h2>
            <ExcelUpload 
              token={token} 
              apiUrl={API_URL}
              usuario={usuario} 
              onUploadComplete={() => {
                setTimeout(() => {
                  cargarRegistros();
                  cargarDashboard();
                }, 1000);
              }}
            />
          </section>
        )}

        {/* SECCIÓN: ANALYTICS */}
        {vista === 'analytics' && (usuario.rol === 'admin' || usuario.rol === 'dpe') && (
          <section className="seccion">
            <Analytics registros={registros} usuarios={usuarioList} token={token} />
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
                {seleccionados.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#fff3cd', border: '1px solid #FF9800', borderRadius: '8px',
                    padding: '12px 16px', marginBottom: '15px'
                  }}>
                    <span style={{fontSize: '13px', fontWeight: '600', color: '#92400e'}}>
                      {seleccionados.length} registro(s) seleccionado(s)
                    </span>
                    <button
                      onClick={manejarEliminarSeleccionados}
                      style={{
                        padding: '8px 16px', background: '#f44336', color: 'white',
                        border: 'none', borderRadius: '6px', cursor: 'pointer',
                        fontSize: '13px', fontWeight: '600'
                      }}
                    >
                      🗑️ Eliminar seleccionados ({seleccionados.length})
                    </button>
                  </div>
                )}
                <table className="tabla tabla-acciones">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={registros.length > 0 && registros.every(r => seleccionados.includes(r.id))}
                          onChange={() => toggleSeleccionarTodos(registros.map(r => r.id))}
                        />
                      </th>
                      <th>N° Ticket</th>
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
                      <tr key={r.id} style={seleccionados.includes(r.id) ? {background: '#fff8e1'} : {}}>
                        <td>
                          <input
                            type="checkbox"
                            checked={seleccionados.includes(r.id)}
                            onChange={() => toggleSeleccion(r.id)}
                          />
                        </td>
                        <td>{r.numeroTicket || '—'}</td>
                        <td><strong>{r.tipo}</strong></td>
                        <td>{r.createdByNombre || r.especialista}</td>
                        <td style={{maxWidth: '250px', whiteSpace: 'normal', wordBreak: 'break-word'}}>{r.descripcion}</td>
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
                <h3>📋 Cantidad de registros ingresados</h3>
                <p className="numero">{misRegistrosFiltrados.length}</p>
              </div>
              <div className="card card-green">
                <h3>✅ Horas Aprobadas en el mes</h3>
                <p className="numero">{misRegistrosFiltrados.filter(r => r.estado === 'exitoso').reduce((sum, r) => sum + (r.horas || 0), 0).toFixed(2)}h</p>
              </div>
              <div className="card card-yellow">
                <h3>⏳ Registros Pendientes de aprobación</h3>
                <p className="numero">{misRegistrosFiltrados.filter(r => r.estado === 'pendiente').length}</p>
              </div>
              <div className="card" style={{ background: 'linear-gradient(135deg, #d97706 0%, #92400e 100%)' }}>
                <h3>⏱️ Horas Pendientes de aprobación</h3>
                <p className="numero">{misRegistrosFiltrados.filter(r => r.estado === 'pendiente').reduce((sum, r) => sum + (r.horas || 0), 0).toFixed(2)}h</p>
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
                    <th>N° Ticket</th>
                    <th>Tipo</th>
                    <th>Descripción</th>
                    <th>Cliente</th>
                    <th>Inicio (Fecha - Hora)</th>
                    <th>Fin (Fecha - Hora)</th>
                    <th>Horas</th>
                    <th>Estado</th>
                    <th>Genera OVT</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {misRegistrosFiltrados.map(r => (
                    <tr key={r.id}>
                      <td>{r.numeroTicket || '—'}</td>
                      <td><strong>{r.tipo}</strong></td>
                      <td style={{maxWidth: '220px', whiteSpace: 'normal', wordBreak: 'break-word'}}>{r.descripcion}</td>
                      <td>{r.cliente}</td>
                      <td style={{fontSize: '13px'}}>{parseDate(r.fechaInicio)} <strong>{toTimeString(toDate(r.fechaInicio))}</strong></td>
                      <td style={{fontSize: '13px'}}>{parseDate(r.fechaFin)} <strong>{toTimeString(toDate(r.fechaFin))}</strong></td>
                      <td className="numero">{r.horas}h</td>
                      <td>
                        <span className={`badge badge-${r.estado}`}>
                          {r.estado === 'pendiente' ? 'Pendiente' : r.estado === 'exitoso' ? 'Aprobado' : 'Rechazado'}
                        </span>
                      </td>
                      <td>{r.genera_ovt === 'si' ? '✓' : '✗'}</td>
                      <td style={{textAlign: 'center', verticalAlign: 'middle'}}>
                        <div className="acciones">
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* SECCIÓN: DASHBOARD (Admin) */}
        {vista === 'dashboard' && (usuario.rol === 'admin' || usuario.rol === 'dpe') && (
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
                <h3>⏳ Pendientes de Aprobación</h3>
                <p className="numero">{pendientes}</p>
                <p style={{fontSize: '11px', color: '#fff', marginTop: '5px'}}>de {registrosFiltrados.length} registros</p>
              </div>
              <div className="card card-green">
                <h3>✅ Registros Aprobados</h3>
                <p className="numero">{aprobados}</p>
              </div>
              <div className="card" style={{ background: 'linear-gradient(135deg, #047857 0%, #064e3b 100%)' }}>
                <h3>📈 Total Horas Aprobadas en el mes</h3>
                <p className="numero">{totalHorasAprobadas.toFixed(2)}h</p>
              </div>
              <div className="card card-red">
                <h3>❌ Registros Rechazados</h3>
                <p className="numero">{rechazados}</p>
              </div>
            </div>

            {/* Tabla: Registros Pendientes */}
            <h3>⏳ Registros Pendientes de Aprobación</h3>
            {registrosFiltrados.filter(r => r.estado === 'pendiente').length === 0 ? (
              <p className="sin-datos">No hay registros pendientes</p>
            ) : (
              <>
                {seleccionadosPendientes.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#fff3cd', border: '1px solid #FF9800', borderRadius: '8px',
                    padding: '12px 16px', marginBottom: '15px'
                  }}>
                    <span style={{fontSize: '13px', fontWeight: '600', color: '#92400e'}}>
                      {seleccionadosPendientes.length} registro(s) seleccionado(s)
                    </span>
                    <div style={{display: 'flex', gap: '8px'}}>
                      <button
                        onClick={() => manejarAprobacionMasiva('exitoso')}
                        style={{
                          padding: '8px 16px', background: '#4CAF50', color: 'white',
                          border: 'none', borderRadius: '6px', cursor: 'pointer',
                          fontSize: '13px', fontWeight: '600'
                        }}
                      >
                        ✅ Aprobar seleccionados ({seleccionadosPendientes.length})
                      </button>
                      <button
                        onClick={() => manejarAprobacionMasiva('fallido')}
                        style={{
                          padding: '8px 16px', background: '#f44336', color: 'white',
                          border: 'none', borderRadius: '6px', cursor: 'pointer',
                          fontSize: '13px', fontWeight: '600'
                        }}
                      >
                        ❌ Rechazar seleccionados ({seleccionadosPendientes.length})
                      </button>
                    </div>
                  </div>
                )}
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={
                            registrosFiltrados.filter(r => r.estado === 'pendiente').length > 0 &&
                            registrosFiltrados.filter(r => r.estado === 'pendiente').every(r => seleccionadosPendientes.includes(r.id))
                          }
                          onChange={() => toggleSeleccionarTodosPendientes(registrosFiltrados.filter(r => r.estado === 'pendiente').map(r => r.id))}
                        />
                      </th>
                      <th>N° Ticket</th>
                      <th>Especialista</th>
                      <th>Tipo</th>
                      <th>Descripción</th>
                      <th>Inicio (Fecha - Hora)</th>
                      <th>Fin (Fecha - Hora)</th>
                      <th>Horas</th>
                      <th>Especialidad</th>
                      <th>Genera OVT</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrosFiltrados.filter(r => r.estado === 'pendiente').map(r => (
                      <tr key={r.id} style={seleccionadosPendientes.includes(r.id) ? {background: '#fff8e1'} : {}}>
                        <td>
                          <input
                            type="checkbox"
                            checked={seleccionadosPendientes.includes(r.id)}
                            onChange={() => toggleSeleccionPendiente(r.id)}
                          />
                        </td>
                        <td>{r.numeroTicket || '—'}</td>
                        <td><strong>{r.createdByNombre || r.especialista}</strong></td>
                        <td>{r.tipo}</td>
                        <td style={{maxWidth: '220px', whiteSpace: 'normal', wordBreak: 'break-word'}}>{r.descripcion}</td>
                        <td style={{fontSize: '13px'}}>{parseDate(r.fechaInicio)} <strong>{toTimeString(toDate(r.fechaInicio))}</strong></td>
                        <td style={{fontSize: '13px'}}>{parseDate(r.fechaFin)} <strong>{toTimeString(toDate(r.fechaFin))}</strong></td>
                        <td className="numero">{r.horas}h</td>
                        <td>{r.especialidad}</td>
                        <td>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: '700',
                            background: r.genera_ovt === 'si' ? '#d1fae5' : '#fee2e2',
                            color: r.genera_ovt === 'si' ? '#065f46' : '#991b1b'
                          }}>
                            {r.genera_ovt === 'si' ? '✓ SÍ' : '✗ NO'}
                          </span>
                        </td>
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
              </>
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
                    <th>N° Ticket</th>
                    <th>Tipo</th>
                    <th>Descripción</th>
                    <th>Especialista</th>
                    <th>Cliente</th>
                    <th>Inicio (Fecha - Hora)</th>
                    <th>Fin (Fecha - Hora)</th>
                    <th>Horas</th>
                    <th>Especialidad</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosFiltrados.filter(r => r.estado !== 'pendiente').map(r => (
                    <tr key={r.id}>
                      <td>{r.numeroTicket || '—'}</td>
                      <td><strong>{r.tipo}</strong></td>
                      <td style={{maxWidth: '220px', whiteSpace: 'normal', wordBreak: 'break-word'}}>{r.descripcion}</td>
                      <td>{r.createdByNombre || r.especialista}</td>
                      <td>{r.cliente}</td>
                      <td style={{fontSize: '13px'}}>{parseDate(r.fechaInicio)} <strong>{toTimeString(toDate(r.fechaInicio))}</strong></td>
                      <td style={{fontSize: '13px'}}>{parseDate(r.fechaFin)} <strong>{toTimeString(toDate(r.fechaFin))}</strong></td>
                      <td className="numero">{r.horas}h</td>
                      <td>{r.especialidad}</td>
                      <td>
                        <span className={`badge badge-${r.estado}`}>
                          {r.estado === 'exitoso' ? '✅ Aprobado' : '❌ Rechazado'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* SECCIÓN: GESTIÓN DE USUARIOS (Admin) */}
        {vista === 'usuarios' && (usuario.rol === 'admin' || usuario.rol === 'dpe') && (
          <GestionUsuarios token={token} apiUrl={API_URL} />
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
                      <td>{parseDate(log.timestamp) !== 'Sin fecha' ? new Date(log.timestamp?.toDate?.() || (log.timestamp?._seconds ? log.timestamp._seconds * 1000 : log.timestamp)).toLocaleString('es-CL') : '-'}</td>
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
            <h2 style={{marginTop: 0, marginBottom: '20px'}}>
              ✏️ Editar Registro {modalEdicion?.registro?.estado === 'fallido' ? 'Rechazado' : ''}
            </h2>
            
            {/* INFO NO EDITABLE */}
            <div style={{background: '#f5f5f5', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px'}}>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
                <div>
                  <span style={{color: '#666', display: 'block', marginBottom: '4px', fontWeight: '500'}}>N° de Ticket</span>
                  <span>{modalEdicion?.registro?.numeroTicket || 'Sin ticket'}</span>
                </div>
                <div>
                  <span style={{color: '#666', display: 'block', marginBottom: '4px', fontWeight: '500'}}>Especialista</span>
                  <span>{modalEdicion?.registro?.especialista || 'N/A'}</span>
                </div>
                <div>
                  <span style={{color: '#666', display: 'block', marginBottom: '4px', fontWeight: '500'}}>Estado Actual</span>
                  {(() => {
                    const e = modalEdicion?.registro?.estado;
                    const estilo = e === 'fallido'
                      ? { background: '#FFE0B2', color: '#E65100' }
                      : e === 'exitoso'
                        ? { background: '#d1fae5', color: '#065f46' }
                        : { background: '#fef3c7', color: '#92400e' };
                    const texto = e === 'fallido' ? 'Rechazado' : e === 'exitoso' ? 'Aprobado' : 'Pendiente';
                    return (
                      <span style={{ ...estilo, padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500', display: 'inline-block' }}>
                        {texto}
                      </span>
                    );
                  })()}
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
                {
                  tipo: formularioModal.tipo,
                  descripcion: formularioModal.descripcion,
                  fechaInicio: formularioModal.fechaInicio,
                  fechaFin: formularioModal.fechaFin,
                  horas: formularioModal.horas,
                  especialidad: formularioModal.especialidad,
                  genera_ovt: formularioModal.genera_ovt,
                  estado: formularioModal.estadoOriginal === 'fallido' ? 'pendiente' : formularioModal.estadoOriginal
                },
                {headers: {Authorization: `Bearer ${token}`}}
              )
              .then(() => {
                if (formularioModal.estadoOriginal === 'fallido') {
                  alert('✅ Registro guardado y enviado a aprobación');
                } else {
                  alert('✅ Registro actualizado correctamente');
                }
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
                  <option value="incidente">Incidente</option>
                  <option value="requerimiento">Requerimiento</option>
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
                        const diff = (fin - fecha) / (1000 * 60 * 60);
                        horas = Math.max(0, Math.round(diff * 20) / 20);
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
                        const diff = (fin - fecha) / (1000 * 60 * 60);
                        horas = Math.max(0, Math.round(diff * 20) / 20);
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
                        const diff = (fecha - inicio) / (1000 * 60 * 60);
                        horas = Math.max(0, Math.round(diff * 20) / 20);
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
                        const diff = (fecha - inicio) / (1000 * 60 * 60);
                        horas = Math.max(0, Math.round(diff * 20) / 20);
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
                  {formularioModal.estadoOriginal === 'fallido' ? '✅ Guardar y Enviar a Aprobación' : '✅ Guardar Cambios'}
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
                {formularioModal.estadoOriginal === 'fallido'
                  ? 'El registro quedará como "Pendiente de Aprobación"'
                  : `El estado se mantendrá como "${formularioModal.estadoOriginal === 'exitoso' ? 'Aprobado' : formularioModal.estadoOriginal === 'pendiente' ? 'Pendiente' : formularioModal.estadoOriginal}"`}
              </div>
            </form>
          </div>
        )}

        {/* Test GROQ */}
        {vista === 'test-groq' && <TestGroq />}

        {/* Nueva Proyección OVT (ITSM) */}
        {vista === 'proyeccion-nueva' && usuario.rol === 'itsm' && (
          <NuevaProyeccionITSM token={token} apiUrl={API_URL} />
        )}

        {/* Mis Proyecciones (ITSM) */}
        {vista === 'proyeccion-mis' && usuario.rol === 'itsm' && (
          <MisProyeccionesITSM token={token} apiUrl={API_URL} />
        )}

        {/* Carga Excel de Proyecciones (ITSM) */}
        {vista === 'proyeccion-excel' && usuario.rol === 'itsm' && (
          <ExcelUploadITSM token={token} apiUrl={API_URL} />
        )}

        {/* OVT Proyectado (Admin) */}
        {vista === 'ovt-proyectado' && (usuario.rol === 'admin' || usuario.rol === 'dpe') && (
          <OvtProyectado token={token} apiUrl={API_URL} />
        )}

        {/* Control de Labor (Claim) */}
        {vista === 'claim' && (usuario.rol === 'admin' || usuario.rol === 'dpe') && (
          <ClaimDashboard token={token} apiUrl={API_URL} />
        )}

        {/* Permisos de Roles — solo admin */}
        {vista === 'permisos-roles' && usuario.rol === 'admin' && (
          <PermisosRoles token={token} apiUrl={API_URL} />
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
