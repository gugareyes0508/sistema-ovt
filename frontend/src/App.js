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

// Helper para construir headers con token y cliente activo (para DPE)
const buildHeaders = (token, clienteActivo = '') => {
  const h = { Authorization: `Bearer ${token}` };
  if (clienteActivo) h['x-cliente-activo'] = clienteActivo;
  return h;
};

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
  const [dropdownClienteAbierto, setDropdownClienteAbierto] = useState(false);
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
    } else if (usuario?.rol === 'teamleader') {
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

  // Cargar info de clientes para DPE y admin
  useEffect(() => {
    if (!token || (usuario?.rol !== 'dpe' && usuario?.rol !== 'admin')) return;
    axios.get(`${API_URL}/api/clientes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const lista = res.data || [];
        setClientesInfo(lista);
        // Admin: setear primer cliente si no hay uno activo
        if (usuario?.rol === 'admin' && !clienteActivo && lista.length > 0) {
          const primerCliente = lista[0].id;
          setClienteActivo(primerCliente);
          localStorage.setItem('clienteActivo', primerCliente);
        }
        // DPE: selector si tiene múltiples clientes
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
        headers: buildHeaders(token, clienteActivo)
      });
      setRegistros(response.data || []);
    } catch (err) {
      console.error('Error:', err.message);
    }
  }, [token, clienteActivo]);

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

  // Cerrar dropdown de cliente al hacer click fuera del sidebar
  useEffect(() => {
    if (!dropdownClienteAbierto) return;
    const handler = () => setDropdownClienteAbierto(false);
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [dropdownClienteAbierto]);

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

      // Limpiar clienteActivo anterior para que cada login arranque limpio
      localStorage.removeItem('clienteActivo');
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('usuario', JSON.stringify(response.data.usuario));
      localStorage.setItem('lastActivity', Date.now().toString());
      setToken(response.data.token);
      setUsuario(response.data.usuario);
      setClienteActivo('');
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
          <div className="login-brand">
            <span className="login-wordmark">kyndryl</span>
            <div className="login-sep"></div>
            <span className="login-client-chip">Sistema OVT</span>
          </div>
          <h1>Control de<br/>Overtime</h1>
          <h2>Acceso corporativo · Kyndryl Chile</h2>
          <form onSubmit={manejarLogin}>
            <div className="login-field">
              <label>Usuario<input type="text" name="usuario" placeholder="nombre.apellido" required autoFocus /></label>
            </div>
            <div className="login-field">
              <label>Contraseña<input type="password" name="contrasena" placeholder="••••••••" required /></label>
            </div>
            <button type="submit">Iniciar sesión</button>
          </form>
          <div className="login-footer">
            <p>Kyndryl Chile · 2026</p>
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
        <div className="login-box" style={{ maxWidth:'440px' }}>
          <div className="login-brand">
            <span className="login-wordmark">kyndryl</span>
          </div>
          <h1>Hola, {usuario.nombre.split(' ')[0]}</h1>
          <h2>Elige el cliente con el que quieres trabajar hoy</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px', margin:'20px 0' }}>
            {clientesDpe.map(c => (
              <button key={c.id} type="button"
                onClick={() => {
                  setClienteActivo(c.id);
                  localStorage.setItem('clienteActivo', c.id);
                  setSeleccionandoCliente(false);
                  setVista('dashboard');
                }}
                style={{ padding:'14px 16px', background:'rgba(255,255,255,0.72)', border:'1px solid rgba(18,52,78,0.13)',
                  borderRadius:'16px', cursor:'pointer', textAlign:'left', fontSize:'14px', fontWeight:'700',
                  color:'#061826', display:'flex', alignItems:'center', gap:'12px',
                  transition:'all .18s', boxShadow:'0 10px 28px rgba(6,24,38,0.06)' }}
                onMouseOver={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 18px 42px rgba(6,24,38,0.12)'; }}
                onMouseOut={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='0 10px 28px rgba(6,24,38,0.06)'; }}
              >
                <span style={{ width:'38px', height:'38px', borderRadius:'10px',
                  background:'linear-gradient(135deg,#092235,#003b71)', color:'#fff',
                  display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'800', fontSize:'13px', flexShrink:0 }}>
                  {c.nombre.substring(0,2).toUpperCase()}
                </span>
                <div>
                  <div style={{ fontWeight:'800', letterSpacing:'-.01em' }}>{c.nombre}</div>
                  <div style={{ fontSize:'11px', color:'#647887', fontWeight:'600', marginTop:'2px', fontFamily:"'IBM Plex Mono',monospace", letterSpacing:'.06em', textTransform:'uppercase' }}>#{c.id}</div>
                </div>
                <span style={{ marginLeft:'auto', color:'#003b71', fontSize:'18px', fontWeight:'300' }}>→</span>
              </button>
            ))}
          </div>
          <div className="login-footer">
            <button onClick={manejarLogout} style={{ background:'none', border:'none', color:'#647887', fontSize:'12px', cursor:'pointer', fontWeight:'700' }}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // VISTA: APLICACIÓN PRINCIPAL
  // ============================================
  // Helper: ¿puede este usuario ver esta vista?
  // Admin siempre puede. Para el resto usa permisos de Firestore si están cargados.
  const puedeVer = (vista) => {
    if (!usuario?.rol) return false;
    if (usuario.rol === 'admin') return true;
    if (!permisos) return true; // fallback: no restricción si no se cargaron permisos
    return !!permisos[usuario.rol]?.[vista];
  };


  // Meta por vista: eyebrow + título para el topbar
  const PAGE_META = {
    dashboard:       { eyebrow: 'Dashboard',       title: 'Gestión de Overtime',      sub: 'Aprobaciones, horas y registros del equipo.' },
    analytics:       { eyebrow: 'Analytics',        title: 'Análisis de HHEE',         sub: 'Tendencias, distribución y agrupación.' },
    'ovt-proyectado':{ eyebrow: 'OVT',             title: 'OVT Proyectado',           sub: 'Proyecciones de horas extra del equipo.' },
    claim:           { eyebrow: 'Control de Labor', title: 'Horas imputadas',          sub: 'Claims del equipo Kyndryl Chile.' },
    usuarios:        { eyebrow: 'Administración',   title: 'Gestión de usuarios',      sub: 'Usuarios, grupos y clientes del sistema.' },
    mantenedor:      { eyebrow: 'Administración',   title: 'Mantenedor',               sub: 'Gestión y aprobación de todos los registros.' },
    auditoria:       { eyebrow: 'Administración',   title: 'Auditoría',                sub: 'Log de acciones del sistema.' },
    'permisos-roles':{ eyebrow: 'Administración',   title: 'Permisos de roles',        sub: 'Configura qué ve cada perfil.' },
    registros:       { eyebrow: 'Especialista',     title: 'Registrar cambio',         sub: 'Completa los datos del registro de overtime.' },
    resumen:         { eyebrow: 'Especialista',     title: 'Mi resumen',               sub: 'Historial y horas aprobadas.' },
    'excel-upload':  { eyebrow: 'Especialista',     title: 'Cargar Excel',             sub: 'Carga masiva de registros desde planilla.' },
    'proyeccion-nueva':{ eyebrow:'ITSM',            title: 'Nueva proyección',         sub: 'Crea una nueva proyección de tickets ITSM.' },
    'proyeccion-mis':  { eyebrow:'ITSM',            title: 'Mis proyecciones',         sub: 'Historial de proyecciones enviadas.' },
    'proyeccion-excel':{ eyebrow:'ITSM',            title: 'Cargar Excel ITSM',        sub: 'Carga masiva desde planilla ITSM.' },
    'test-groq':     { eyebrow: 'Sistema',          title: 'Test API IA',              sub: 'Verificar conectividad con GROQ.' },
  };
  const meta = PAGE_META[vista] || { eyebrow: '', title: '', sub: '' };
  const nombreClienteActivo = clientesInfo.find(c => c.id === clienteActivo)?.nombre || '';

  return (
    <div className="app">

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-wordmark">kyndryl</div>
          {/* Selector de cliente — dropdown personalizado */}
          {(usuario?.rol === 'dpe' || usuario?.rol === 'admin') && clientesInfo.length > 0 && (() => {
            const clientesDisponibles = clientesInfo.filter(c => usuario.rol === 'admin' ? true : (usuario.clientesIds||[]).includes(c.id));
            const clienteNombre = clientesDisponibles.find(c => c.id === clienteActivo)?.nombre || clienteActivo;
            const tieneVarios = clientesDisponibles.length > 1;
            return (
              <div style={{ position:'relative' }}>
                <button
                  onClick={() => tieneVarios && setDropdownClienteAbierto(prev => !prev)}
                  style={{
                    display:'flex', alignItems:'center', gap:'8px', width:'100%',
                    border:'1px solid rgba(86,217,217,0.28)', borderRadius:'10px',
                    padding:'8px 11px', background:'rgba(86,217,217,0.07)',
                    color:'rgba(255,255,255,0.95)', fontSize:'12px', fontWeight:'700',
                    cursor: tieneVarios ? 'pointer' : 'default', textAlign:'left',
                    transition:'background .15s'
                  }}
                  onMouseOver={e => tieneVarios && (e.currentTarget.style.background='rgba(86,217,217,0.14)')}
                  onMouseOut={e => (e.currentTarget.style.background='rgba(86,217,217,0.07)')}
                >
                  <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#ff462d', flexShrink:0 }}></span>
                  <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{clienteNombre}</span>
                  {tieneVarios && <span style={{ color:'rgba(86,217,217,0.7)', fontSize:'10px', flexShrink:0 }}>{dropdownClienteAbierto ? '▲' : '▼'}</span>}
                </button>

                {/* Dropdown panel */}
                {dropdownClienteAbierto && tieneVarios && (
                  <div style={{
                    position:'absolute', top:'calc(100% + 6px)', left:0, right:0, zIndex:200,
                    background:'linear-gradient(160deg,#0b2940,#07131f)',
                    border:'1px solid rgba(86,217,217,0.2)', borderRadius:'12px',
                    overflow:'hidden', boxShadow:'0 16px 40px rgba(6,24,38,0.4)'
                  }}>
                    {clientesDisponibles.map(c => (
                      <button key={c.id}
                        onClick={() => {
                          setClienteActivo(c.id);
                          localStorage.setItem('clienteActivo', c.id);
                          setRegistros([]);
                          setVista('dashboard');
                          setDropdownClienteAbierto(false);
                        }}
                        style={{
                          display:'flex', alignItems:'center', gap:'8px', width:'100%',
                          padding:'10px 12px', background: c.id === clienteActivo ? 'rgba(86,217,217,0.12)' : 'transparent',
                          border:'none', borderBottom:'1px solid rgba(255,255,255,0.06)',
                          color: c.id === clienteActivo ? '#56d9d9' : 'rgba(255,255,255,0.85)',
                          fontSize:'12px', fontWeight:'700', textAlign:'left', cursor:'pointer',
                          transition:'background .12s'
                        }}
                        onMouseOver={e => { if(c.id !== clienteActivo) e.currentTarget.style.background='rgba(255,255,255,0.08)'; }}
                        onMouseOut={e => { if(c.id !== clienteActivo) e.currentTarget.style.background='transparent'; }}
                      >
                        <span style={{ width:'5px', height:'5px', borderRadius:'50%', background: c.id === clienteActivo ? '#56d9d9' : 'rgba(255,255,255,0.3)', flexShrink:0 }}></span>
                        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.nombre}</span>
                        {c.id === clienteActivo && <span style={{ marginLeft:'auto', fontSize:'11px' }}>✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Nav por rol */}
        {usuario.rol === 'especialista' && (
          <nav className="nav">
            {puedeVer('registros') && <button className={vista==='registros'?'nav-btn active':'nav-btn'} onClick={()=>setVista('registros')}><i className="ti ti-edit" aria-hidden="true"></i>Registrar cambio</button>}
            {puedeVer('resumen') && <button className={vista==='resumen'?'nav-btn active':'nav-btn'} onClick={()=>setVista('resumen')}><i className="ti ti-chart-bar" aria-hidden="true"></i>Mi resumen</button>}
            {puedeVer('carga-excel') && <button className={vista==='excel-upload'?'nav-btn active':'nav-btn'} onClick={()=>setVista('excel-upload')}><i className="ti ti-upload" aria-hidden="true"></i>Cargar Excel</button>}
          </nav>
        )}

        {usuario.rol === 'itsm' && (
          <nav className="nav">
            {puedeVer('proyeccion-nueva') && <button className={vista==='proyeccion-nueva'?'nav-btn active':'nav-btn'} onClick={()=>setVista('proyeccion-nueva')}><i className="ti ti-plus" aria-hidden="true"></i>Nueva proyección</button>}
            {puedeVer('proyeccion-mis') && <button className={vista==='proyeccion-mis'?'nav-btn active':'nav-btn'} onClick={()=>setVista('proyeccion-mis')}><i className="ti ti-list" aria-hidden="true"></i>Mis proyecciones</button>}
            {puedeVer('proyeccion-excel') && <button className={vista==='proyeccion-excel'?'nav-btn active':'nav-btn'} onClick={()=>setVista('proyeccion-excel')}><i className="ti ti-upload" aria-hidden="true"></i>Cargar Excel</button>}
          </nav>
        )}

        {(usuario.rol === 'dpe' || usuario.rol === 'teamleader') && (
          <nav className="nav">
            {puedeVer('dashboard') && <button className={vista==='dashboard'?'nav-btn active':'nav-btn'} onClick={()=>setVista('dashboard')}><i className="ti ti-layout-dashboard" aria-hidden="true"></i>Dashboard</button>}
            {puedeVer('analytics') && <button className={vista==='analytics'?'nav-btn active':'nav-btn'} onClick={()=>setVista('analytics')}><i className="ti ti-chart-bar" aria-hidden="true"></i>Analytics</button>}
            {usuario.rol==='dpe' && puedeVer('ovt-proyectado') && <button className={vista==='ovt-proyectado'?'nav-btn active':'nav-btn'} onClick={()=>setVista('ovt-proyectado')}><i className="ti ti-calendar" aria-hidden="true"></i>OVT Proyectado</button>}
            {usuario.rol==='dpe' && puedeVer('claim') && <button className={vista==='claim'?'nav-btn active':'nav-btn'} onClick={()=>setVista('claim')}><i className="ti ti-clock" aria-hidden="true"></i>Control de Labor</button>}
            {usuario.rol==='dpe' && puedeVer('usuarios') && <button className={vista==='usuarios'?'nav-btn active':'nav-btn'} onClick={()=>setVista('usuarios')}><i className="ti ti-users" aria-hidden="true"></i>Usuarios</button>}
          </nav>
        )}

        {usuario.rol === 'admin' && (
          <>
            <div className="sidebar-section">Principal</div>
            <nav className="nav">
              {puedeVer('dashboard') && <button className={vista==='dashboard'?'nav-btn active':'nav-btn'} onClick={()=>setVista('dashboard')}><i className="ti ti-layout-dashboard" aria-hidden="true"></i>Dashboard</button>}
              {puedeVer('analytics') && <button className={vista==='analytics'?'nav-btn active':'nav-btn'} onClick={()=>setVista('analytics')}><i className="ti ti-chart-bar" aria-hidden="true"></i>Analytics</button>}
              {puedeVer('ovt-proyectado') && <button className={vista==='ovt-proyectado'?'nav-btn active':'nav-btn'} onClick={()=>setVista('ovt-proyectado')}><i className="ti ti-calendar" aria-hidden="true"></i>OVT Proyectado</button>}
              {puedeVer('claim') && <button className={vista==='claim'?'nav-btn active':'nav-btn'} onClick={()=>setVista('claim')}><i className="ti ti-clock" aria-hidden="true"></i>Control de Labor</button>}
            </nav>
            <div className="sidebar-section">Administración</div>
            <nav className="nav">
              {puedeVer('usuarios') && <button className={vista==='usuarios'?'nav-btn active':'nav-btn'} onClick={()=>setVista('usuarios')}><i className="ti ti-users" aria-hidden="true"></i>Usuarios</button>}
              {puedeVer('mantenedor') && <button className={vista==='mantenedor'?'nav-btn active':'nav-btn'} onClick={()=>setVista('mantenedor')}><i className="ti ti-settings" aria-hidden="true"></i>Mantenedor</button>}
              {puedeVer('auditoria') && <button className={vista==='auditoria'?'nav-btn active':'nav-btn'} onClick={()=>setVista('auditoria')}><i className="ti ti-file-text" aria-hidden="true"></i>Auditoría</button>}
              <button className={vista==='permisos-roles'?'nav-btn active':'nav-btn'} onClick={()=>setVista('permisos-roles')}><i className="ti ti-shield" aria-hidden="true"></i>Permisos</button>
              <button className={vista==='test-groq'?'nav-btn active':'nav-btn'} onClick={()=>setVista('test-groq')}><i className="ti ti-robot" aria-hidden="true"></i>Test IA</button>
            </nav>
          </>
        )}

        {/* User card */}
        <div className="user-card">
          <strong>{usuario.nombre}</strong>
          <span>{usuario.rol} · {usuario.empresa || 'Kyndryl'}</span>
          <button className="btn-logout" onClick={manejarLogout}>Cerrar sesión</button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="main">
        {/* Topbar de página */}
        <div className="page-topbar">
          <div>
            {meta.eyebrow && <p className="page-eyebrow">{meta.eyebrow}</p>}
            <h1 className="page-title">{meta.title}</h1>
            {meta.sub && <p className="page-sub">{meta.sub}</p>}
          </div>
          {nombreClienteActivo && (
            <span className="kyn-badge">KYNDRYL × {nombreClienteActivo.toUpperCase()}</span>
          )}
        </div>


        
        {/* SECCIÓN: REGISTRAR CAMBIO/ALERTA */}
        {vista === 'registros' && usuario.rol === 'especialista' && (
          <section className="seccion">
            <p className="panel-label">Especialista</p>
            
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
            <p className="panel-label">Especialista</p>
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
        {vista === 'analytics' && (usuario.rol === 'admin' || usuario.rol === 'dpe' || usuario.rol === 'teamleader') && (
          <Analytics registros={registros} usuarios={usuarioList} token={token} />
        )}

        {/* SECCIÓN: MANTENEDOR */}
        {vista === 'mantenedor' && (usuario.rol === 'coordinador' || usuario.rol === 'admin') && (
          <div className="seccion">
            <p className="panel-label">Administración</p>
            <div className="panel-toolbar">
              <h2 style={{marginBottom:0}}>Todos los registros</h2>
              {seleccionados.length > 0 && (
                <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                  <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:'11px',color:'var(--muted)'}}>
                    {seleccionados.length} seleccionados
                  </span>
                  <button className="btn-rechazar" onClick={manejarEliminarSeleccionados}>
                    Eliminar ({seleccionados.length})
                  </button>
                </div>
              )}
            </div>
            {registros.length === 0 ? <p className="sin-datos">No hay registros</p> : (
              <div className="tabla-responsive">
                <table className="tabla">
                  <thead><tr>
                    <th><input type="checkbox"
                      checked={registros.length>0 && registros.every(r=>seleccionados.includes(r.id))}
                      onChange={()=>toggleSeleccionarTodos(registros.map(r=>r.id))}
                    /></th>
                    <th>Ticket</th><th>Tipo</th><th>Especialista</th><th>Descripción</th><th>Horas</th><th>Estado</th><th>Acciones</th>
                  </tr></thead>
                  <tbody>
                    {registros.map(r=>(
                      <tr key={r.id} style={seleccionados.includes(r.id)?{background:'rgba(86,217,217,0.06)'}:{}}>
                        <td><input type="checkbox" checked={seleccionados.includes(r.id)} onChange={()=>toggleSeleccion(r.id)}/></td>
                        <td style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:'11px',color:'var(--muted)'}}>{r.numeroTicket||'—'}</td>
                        <td style={{fontWeight:'700'}}>{r.tipo}</td>
                        <td>{r.createdByNombre||r.especialista}</td>
                        <td style={{maxWidth:'220px',whiteSpace:'normal',wordBreak:'break-word',fontSize:'12px'}}>{r.descripcion?.substring(0,60)}</td>
                        <td style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:'700'}}>{r.horas}h</td>
                        <td><span className={`badge badge-${r.estado}`}>{r.estado==='pendiente'?'Pendiente':r.estado==='exitoso'?'Aprobado':'Rechazado'}</span></td>
                        <td className="acciones">
                          <button className="btn-editar" onClick={()=>cargarParaEditar(r)}>Editar</button>
                          {r.estado==='pendiente' && <>
                            <button className="btn-aprobar" onClick={()=>manejarAprobacion(r.id,'exitoso')}>Aprobar</button>
                            <button className="btn-rechazar" onClick={()=>manejarAprobacion(r.id,'fallido')}>Rechazar</button>
                          </>}
                          <button className="btn-eliminar" onClick={()=>manejarEliminar(r.id)}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SECCIÓN: MI RESUMEN (Especialista) */}
        {vista === 'resumen' && usuario.rol === 'especialista' && (
          <div>
            {/* Filtros compactos */}
            <div style={{display:'flex',gap:'10px',marginBottom:'20px',flexWrap:'wrap',alignItems:'flex-end'}}>
              <div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:'10px',fontWeight:'700',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'6px'}}>Mes</div>
                <select value={filtros.mes} onChange={e=>setFiltros({...filtros,mes:parseInt(e.target.value)})}
                  style={{border:'1px solid var(--line)',borderRadius:'12px',padding:'9px 14px',background:'rgba(255,255,255,0.84)',color:'var(--ink-950)',fontSize:'13px',fontWeight:'600',minWidth:'130px'}}>
                  {[...Array(12)].map((_,i)=><option key={i+1} value={i+1}>{new Date(2024,i).toLocaleString('es-CL',{month:'long'})}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:'10px',fontWeight:'700',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'6px'}}>Año</div>
                <select value={filtros.anio} onChange={e=>setFiltros({...filtros,anio:parseInt(e.target.value)})}
                  style={{border:'1px solid var(--line)',borderRadius:'12px',padding:'9px 14px',background:'rgba(255,255,255,0.84)',color:'var(--ink-950)',fontSize:'13px',fontWeight:'600',minWidth:'100px'}}>
                  {['2023','2024','2025','2026','2027'].map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:'10px',fontWeight:'700',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'6px'}}>Estado</div>
                <select value={filtros.estado||''} onChange={e=>setFiltros({...filtros,estado:e.target.value||null})}
                  style={{border:'1px solid var(--line)',borderRadius:'12px',padding:'9px 14px',background:'rgba(255,255,255,0.84)',color:'var(--ink-950)',fontSize:'13px',fontWeight:'600',minWidth:'140px'}}>
                  <option value="">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="exitoso">Aprobado</option>
                  <option value="fallido">Rechazado</option>
                </select>
              </div>
            </div>
            {/* KPIs */}
            <div className="queue-tabs" style={{gridTemplateColumns:'repeat(4,minmax(0,1fr))',marginBottom:'20px'}}>
              <div className="queue-tab">
                <span className="queue-tab-label">Registros</span>
                <div className="queue-tab-num">{misRegistrosFiltrados.length}</div>
                <div className="queue-tab-sub">ingresados en el período</div>
              </div>
              <div className="queue-tab">
                <span className="queue-tab-label">Horas aprobadas</span>
                <div className="queue-tab-num">{misRegistrosFiltrados.filter(r=>r.estado==='exitoso').reduce((s,r)=>s+(r.horas||0),0).toFixed(1)}<span style={{fontSize:'1.2rem'}}>h</span></div>
                <div className="queue-tab-sub">en el período</div>
              </div>
              <div className="queue-tab">
                <span className="queue-tab-label">Pendientes</span>
                <div className="queue-tab-num">{misRegistrosFiltrados.filter(r=>r.estado==='pendiente').length}</div>
                <div className="queue-tab-sub">esperando aprobación</div>
              </div>
              <div className="queue-tab">
                <span className="queue-tab-label">Horas pendientes</span>
                <div className="queue-tab-num">{misRegistrosFiltrados.filter(r=>r.estado==='pendiente').reduce((s,r)=>s+(r.horas||0),0).toFixed(1)}<span style={{fontSize:'1.2rem'}}>h</span></div>
                <div className="queue-tab-sub">en espera</div>
              </div>
            </div>
            {/* Tabla */}
            <div className="seccion">
              <p className="panel-label">Historial</p>
              <h2>Mis registros</h2>
              {misRegistrosFiltrados.length===0 ? <p className="sin-datos">No hay registros para este período</p> : (
                <div className="tabla-responsive">
                  <table className="tabla">
                    <thead><tr>
                      <th>Ticket</th><th>Tipo</th><th>Descripción</th><th>Cliente</th>
                      <th>Inicio</th><th>Fin</th><th>Horas</th><th>Estado</th><th>OVT</th><th>Acción</th>
                    </tr></thead>
                    <tbody>
                      {misRegistrosFiltrados.map(r=>(
                        <tr key={r.id}>
                          <td style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:'11px',color:'var(--muted)'}}>{r.numeroTicket||'—'}</td>
                          <td style={{fontWeight:'700'}}>{r.tipo}</td>
                          <td style={{maxWidth:'200px',whiteSpace:'normal',wordBreak:'break-word',fontSize:'12px'}}>{r.descripcion?.substring(0,60)}</td>
                          <td style={{color:'var(--muted)'}}>{r.cliente}</td>
                          <td style={{fontSize:'12px',whiteSpace:'nowrap'}}>{parseDate(r.fechaInicio)} {toTimeString(toDate(r.fechaInicio))}</td>
                          <td style={{fontSize:'12px',whiteSpace:'nowrap'}}>{parseDate(r.fechaFin)} {toTimeString(toDate(r.fechaFin))}</td>
                          <td style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:'700'}}>{r.horas}h</td>
                          <td><span className={`badge badge-${r.estado}`}>{r.estado==='pendiente'?'Pendiente':r.estado==='exitoso'?'Aprobado':'Rechazado'}</span></td>
                          <td><span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'999px',fontWeight:'800',
                            background:r.genera_ovt==='si'?'rgba(32,166,106,0.12)':'rgba(18,52,78,0.08)',
                            color:r.genera_ovt==='si'?'#116642':'var(--muted)'}}>
                            {r.genera_ovt==='si'?'Sí':'No'}
                          </span></td>
                          <td>
                            {r.estado==='pendiente'||r.estado==='exitoso'
                              ? <span style={{fontSize:'11px',color:'var(--muted)',fontWeight:'600'}}>{r.estado==='pendiente'?'Esperando':'Aprobado'}</span>
                              : <button className="btn-editar" onClick={()=>cargarParaEditar(r)}>Editar</button>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECCIÓN: DASHBOARD */}
        {vista === 'dashboard' && (usuario.rol === 'admin' || usuario.rol === 'dpe' || usuario.rol === 'teamleader') && (
          <div>
            {/* Filtros de período */}
            <div style={{ display:'flex', gap:'10px', marginBottom:'20px', flexWrap:'wrap', alignItems:'flex-end' }}>
              <div>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'10px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:'6px' }}>Mes</div>
                <select value={filtros.mes} onChange={e=>setFiltros({...filtros,mes:parseInt(e.target.value)})}
                  style={{ border:'1px solid var(--line)', borderRadius:'12px', padding:'9px 14px', background:'rgba(255,255,255,0.84)', color:'var(--ink-950)', fontSize:'13px', fontWeight:'600', minWidth:'130px' }}>
                  {[...Array(12)].map((_,i)=>(
                    <option key={i+1} value={i+1}>{new Date(2024,i).toLocaleString('es-CL',{month:'long'})}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:'10px', fontWeight:'700', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:'6px' }}>Año</div>
                <select value={filtros.anio} onChange={e=>setFiltros({...filtros,anio:parseInt(e.target.value)})}
                  style={{ border:'1px solid var(--line)', borderRadius:'12px', padding:'9px 14px', background:'rgba(255,255,255,0.84)', color:'var(--ink-950)', fontSize:'13px', fontWeight:'600', minWidth:'100px' }}>
                  {['2023','2024','2025','2026','2027'].map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Queue Tabs — KPIs */}
            <div className="queue-tabs" style={{ gridTemplateColumns:'repeat(4,minmax(0,1fr))', marginBottom:'20px' }}>
              <div className="queue-tab active" style={{ '--qt-color':'var(--kyn-red)' }}>
                <span className="queue-tab-label">Pendientes</span>
                <div className="queue-tab-num" style={{ color:'var(--signal)' }}>{pendientes}</div>
                <div className="queue-tab-sub">de {registrosFiltrados.length} registros</div>
              </div>
              <div className="queue-tab">
                <span className="queue-tab-label">Aprobados</span>
                <div className="queue-tab-num">{aprobados}</div>
                <div className="queue-tab-sub">registros este período</div>
              </div>
              <div className="queue-tab">
                <span className="queue-tab-label">Horas aprobadas</span>
                <div className="queue-tab-num">{totalHorasAprobadas.toFixed(1)}<span style={{fontSize:'1.2rem'}}>h</span></div>
                <div className="queue-tab-sub">en el período seleccionado</div>
              </div>
              <div className="queue-tab">
                <span className="queue-tab-label">Rechazados</span>
                <div className="queue-tab-num">{rechazados}</div>
                <div className="queue-tab-sub">registros rechazados</div>
              </div>
            </div>

            {/* Tabla pendientes */}
            <div className="seccion" style={{ marginBottom:'16px' }}>
              <div className="panel-toolbar">
                <div>
                  <p className="panel-label">Aprobaciones</p>
                  <h2 style={{ marginBottom:0 }}>Registros pendientes</h2>
                </div>
                {seleccionadosPendientes.length > 0 && (
                  <div style={{ display:'flex', gap:'8px' }}>
                    <button className="btn-aprobar" onClick={()=>manejarAprobacionMasiva('exitoso')}>
                      Aprobar {seleccionadosPendientes.length} seleccionados
                    </button>
                    <button className="btn-rechazar" onClick={()=>manejarAprobacionMasiva('fallido')}>
                      Rechazar {seleccionadosPendientes.length}
                    </button>
                  </div>
                )}
              </div>
              {registrosFiltrados.filter(r=>r.estado==='pendiente').length===0 ? (
                <p className="sin-datos">No hay registros pendientes en este período</p>
              ) : (
                <div className="tabla-responsive">
                  <table className="tabla">
                    <thead><tr>
                      <th><input type="checkbox"
                        checked={registrosFiltrados.filter(r=>r.estado==='pendiente').length>0 && registrosFiltrados.filter(r=>r.estado==='pendiente').every(r=>seleccionadosPendientes.includes(r.id))}
                        onChange={()=>toggleSeleccionarTodosPendientes(registrosFiltrados.filter(r=>r.estado==='pendiente').map(r=>r.id))}
                      /></th>
                      <th>Ticket</th><th>Especialista</th><th>Tipo</th><th>Descripción</th>
                      <th>Inicio</th><th>Fin</th><th>Horas</th><th>OVT</th><th>Acciones</th>
                    </tr></thead>
                    <tbody>
                      {registrosFiltrados.filter(r=>r.estado==='pendiente').map(r=>(
                        <tr key={r.id} style={seleccionadosPendientes.includes(r.id)?{background:'rgba(86,217,217,0.06)'}:{}}>
                          <td><input type="checkbox" checked={seleccionadosPendientes.includes(r.id)} onChange={()=>toggleSeleccionPendiente(r.id)}/></td>
                          <td style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:'11px',color:'var(--muted)'}}>{r.numeroTicket||'—'}</td>
                          <td style={{fontWeight:'700'}}>{r.createdByNombre||r.especialista}</td>
                          <td>{r.tipo}</td>
                          <td style={{maxWidth:'180px',whiteSpace:'normal',wordBreak:'break-word',fontSize:'12px'}}>{r.descripcion?.substring(0,60)}</td>
                          <td style={{fontSize:'12px',whiteSpace:'nowrap'}}>{parseDate(r.fechaInicio)} {toTimeString(toDate(r.fechaInicio))}</td>
                          <td style={{fontSize:'12px',whiteSpace:'nowrap'}}>{parseDate(r.fechaFin)} {toTimeString(toDate(r.fechaFin))}</td>
                          <td style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:'700'}}>{r.horas}h</td>
                          <td>
                            <span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'999px',fontWeight:'800',
                              background:r.genera_ovt==='si'?'rgba(32,166,106,0.12)':'rgba(18,52,78,0.08)',
                              color:r.genera_ovt==='si'?'#116642':'var(--muted)'}}>
                              {r.genera_ovt==='si'?'Sí':'No'}
                            </span>
                          </td>
                          <td className="acciones">
                            <button className="btn-aprobar" onClick={()=>manejarAprobacion(r.id,'exitoso')}>Aprobar</button>
                            <button className="btn-rechazar" onClick={()=>manejarAprobacion(r.id,'fallido')}>Rechazar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Tablas complementarias */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
              {datosEspecialidad.length > 0 && (
                <div className="seccion" style={{ marginBottom:0 }}>
                  <p className="panel-label">Distribución</p>
                  <h2>Horas por especialidad</h2>
                  <table className="tabla">
                    <thead><tr><th>Especialidad</th><th style={{textAlign:'right'}}>Horas</th></tr></thead>
                    <tbody>
                      {datosEspecialidad.map(d=>(
                        <tr key={d.name}><td>{d.name}</td><td style={{textAlign:'right',fontFamily:"'IBM Plex Mono',monospace",fontWeight:'700',color:'var(--kyn-red)'}}>{d.value.toFixed(1)}h</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {datosEspecialista.length > 0 && (
                <div className="seccion" style={{ marginBottom:0 }}>
                  <p className="panel-label">Top especialistas</p>
                  <h2>Por horas aprobadas</h2>
                  <table className="tabla">
                    <thead><tr><th>Especialista</th><th style={{textAlign:'right'}}>Horas</th></tr></thead>
                    <tbody>
                      {datosEspecialista.map(d=>(
                        <tr key={d.name}><td style={{fontWeight:'600'}}>{d.name?.substring(0,28)}</td><td style={{textAlign:'right',fontFamily:"'IBM Plex Mono',monospace",fontWeight:'700'}}>{d.value.toFixed(1)}h</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Historial aprobaciones */}
            {registrosFiltrados.filter(r=>r.estado!=='pendiente').length > 0 && (
              <div className="seccion">
                <p className="panel-label">Historial</p>
                <h2>Aprobaciones y rechazos</h2>
                <div className="tabla-responsive">
                  <table className="tabla">
                    <thead><tr>
                      <th>Ticket</th><th>Tipo</th><th>Especialista</th><th>Cliente</th>
                      <th>Inicio</th><th>Fin</th><th>Horas</th><th>Estado</th>
                    </tr></thead>
                    <tbody>
                      {registrosFiltrados.filter(r=>r.estado!=='pendiente').map(r=>(
                        <tr key={r.id}>
                          <td style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:'11px',color:'var(--muted)'}}>{r.numeroTicket||'—'}</td>
                          <td style={{fontWeight:'600'}}>{r.tipo}</td>
                          <td>{r.createdByNombre||r.especialista}</td>
                          <td style={{color:'var(--muted)'}}>{r.cliente}</td>
                          <td style={{fontSize:'12px'}}>{parseDate(r.fechaInicio)} {toTimeString(toDate(r.fechaInicio))}</td>
                          <td style={{fontSize:'12px'}}>{parseDate(r.fechaFin)} {toTimeString(toDate(r.fechaFin))}</td>
                          <td style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:'700'}}>{r.horas}h</td>
                          <td><span className={`badge badge-${r.estado}`}>{r.estado==='exitoso'?'Aprobado':'Rechazado'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECCIÓN: GESTIÓN DE USUARIOS (Admin) */}
        {vista === 'usuarios' && (usuario.rol === 'admin' || usuario.rol === 'dpe') && (
          <GestionUsuarios token={token} apiUrl={API_URL} rolUsuario={usuario.rol} />
        )}

        {/* SECCIÓN: AUDITORÍA */}
        {vista === 'auditoria' && usuario.rol === 'admin' && (
          <div className="seccion">
            <p className="panel-label">Sistema</p>
            <h2>Log de auditoría</h2>
            {auditoria.length === 0 ? <p className="sin-datos">Sin registros de auditoría</p> : (
              <div className="tabla-responsive">
                <table className="tabla">
                  <thead><tr>
                    <th>Acción</th><th>Usuario</th><th>Fecha / Hora</th><th>Detalles</th>
                  </tr></thead>
                  <tbody>
                    {auditoria.map(log=>(
                      <tr key={log.id}>
                        <td style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:'11px',fontWeight:'700',color:'var(--bank-blue)',textTransform:'uppercase',letterSpacing:'.04em'}}>{log.accion}</td>
                        <td style={{fontWeight:'700'}}>{log.usuarioNombre||'—'}</td>
                        <td style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:'11px',color:'var(--muted)'}}>
                          {log.timestamp ? new Date(log.timestamp?.toDate?.() || (log.timestamp?._seconds?log.timestamp._seconds*1000:log.timestamp)).toLocaleString('es-CL') : '—'}
                        </td>
                        <td style={{fontSize:'12px',color:'var(--muted)'}}>{log.camposModificados?JSON.stringify(log.camposModificados).substring(0,60):'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* MODAL MEJORADO - EDICIÓN COMPLETA */}
        {modalEdicion && modalEdicion.abierto && (
          <div style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--glass-strong)', padding: '28px', borderRadius: '22px', zIndex: 9999, width: '95%', maxWidth: '600px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto'}}>
            <h2 style={{marginTop: 0, marginBottom: '20px'}}>
              ✏️ Editar Registro {modalEdicion?.registro?.estado === 'fallido' ? 'Rechazado' : ''}
            </h2>
            
            {/* INFO NO EDITABLE */}
            <div style={{background: 'var(--paper-100)', padding: '12px', borderRadius: '14px', border:'1px solid var(--line)', marginBottom: '20px', fontSize: '13px'}}>
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
                      ? { background: 'rgba(240,161,26,0.12)', color: 'var(--kyn-red)' }
                      : e === 'exitoso'
                        ? { background: 'rgba(32,166,106,0.12)', color: '#065f46' }
                        : { background: 'rgba(240,161,26,0.1)', color: 'var(--ink-800)' };
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
                  style={{width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd', background: 'var(--paper-100)', color: '#999', fontSize: '14px'}} 
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
                  style={{flex: 1, padding: '12px', background: '#2196F3', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px'}}
                >
                  {formularioModal.estadoOriginal === 'fallido' ? '✅ Guardar y Enviar a Aprobación' : '✅ Guardar Cambios'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setModalEdicion({abierto: false, registro: null})}
                  style={{flex: 1, padding: '12px', background: '#999', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '14px'}}
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
          <OvtProyectado token={token} apiUrl={API_URL} clienteActivo={clienteActivo} />
        )}

        {/* Control de Labor (Claim) */}
        {vista === 'claim' && (usuario.rol === 'admin' || usuario.rol === 'dpe') && (
          <ClaimDashboard token={token} apiUrl={API_URL} clienteActivo={clienteActivo} />
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
