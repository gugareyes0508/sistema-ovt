// ============================================
// BACKEND: SISTEMA DE CONTROL OVT
// Node.js + Express + Firebase
// ============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const admin = require('firebase-admin');
const os = require('os');

// Inicializar Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Variables globales
const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-aqui';
const USUARIOS_DEMO = {
  'jorge.maureira': { password: 'demo123', nombre: 'Jorge Maureira', rol: 'especialista' },
  'jhon.estrada': { password: 'demo123', nombre: 'Jhon Estrada', rol: 'especialista' },
  'luis.vasquez': { password: 'demo123', nombre: 'Luis Vasquez', rol: 'especialista' },
  'moises.junco': { password: 'demo123', nombre: 'Moises Junco', rol: 'especialista' },
  'manuel.urbina': { password: 'demo123', nombre: 'Manuel Urbina Hernández', rol: 'especialista' },
  'benjamin.fierro': { password: 'demo123', nombre: 'Benjamín Fierro', rol: 'especialista' },
  'mauricio.serrano': { password: 'demo123', nombre: 'Mauricio Antonio Serrano Gonzalez', rol: 'especialista' },
  'ricardo.rojas': { password: 'demo123', nombre: 'Ricardo Andrés Rojas Ramos', rol: 'especialista' },
  'ariel.garate': { password: 'demo123', nombre: 'Ariel Garate', rol: 'especialista' },
  'najeeb.escobar': { password: 'demo123', nombre: 'Najeeb Ency Escobar Perez', rol: 'especialista' },
  'rodrigo.sanhueza': { password: 'demo123', nombre: 'Rodrigo Alejandro Sanhueza', rol: 'especialista' },
  'sebastian.arroyo': { password: 'demo123', nombre: 'Sebastian Arroyo Vigouroux', rol: 'especialista' },
  'cristian.madariaga': { password: 'demo123', nombre: 'Cristian Madariaga', rol: 'especialista' },
  'miguel.martinez': { password: 'demo123', nombre: 'Miguel Martinez', rol: 'especialista' },
  'fabian.tobar': { password: 'demo123', nombre: 'Fabian Tobar', rol: 'especialista' },
  'gustavo.perolo': { password: 'demo123', nombre: 'Gustavo Perolo', rol: 'especialista' },
  'leonardo.silva': { password: 'demo123', nombre: 'Leonardo Silva', rol: 'especialista' },
  'cristian.lecaros': { password: 'demo123', nombre: 'Cristian Lecaros', rol: 'especialista' },
  'rodrigo.escobedo': { password: 'demo123', nombre: 'Rodrigo Escobedo', rol: 'especialista' },
  'alexis.alfonzo': { password: 'demo123', nombre: 'Alexis José Alfonzo', rol: 'especialista' },
  'danilo.isla': { password: 'demo123', nombre: 'Danilo Isla', rol: 'especialista' },
  'gustavo.reyes': { password: 'demo123', nombre: 'Gustavo Reyes', rol: 'especialista' },
  'maria.admin': { password: 'demo123', nombre: 'María González', rol: 'coordinador' },
  'admin': { password: 'demo123', nombre: 'Administrador', rol: 'admin' }
};

// ============ FUNCIONES AUXILIARES ============

// Obtener IP del cliente
function obtenerIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.socket.remoteAddress || 
         'desconocida';
}

// Registrar en auditoría
async function registrarAuditoria(entityType, entityId, accion, usuarioId, usuarioNombre, usuarioRol, camposModificados, detalles, req) {
  try {
    const auditId = db.collection('auditoria').doc().id;
    
    await db.collection('auditoria').doc(auditId).set({
      auditId,
      entityType,
      entityId,
      accion,
      usuarioId,
      usuarioNombre,
      usuarioRol,
      camposModificados: camposModificados || {},
      detalles: detalles || '',
      metadata: {
        ipAddress: obtenerIP(req),
        userAgent: req.headers['user-agent'] || 'desconocido',
        navegador: req.headers['user-agent']?.match(/Chrome|Firefox|Safari|Edge/)?.[0] || 'desconocido',
        sistemaOperativo: req.headers['user-agent']?.match(/Windows|Mac|Linux|Android|iOS/)?.[0] || 'desconocido',
        dispositivo: req.headers['user-agent']?.includes('Mobile') ? 'Mobile' : 'Desktop'
      },
      timestamp: admin.firestore.Timestamp.now(),
      fechaLectura: new Date().toISOString()
    });
    
    console.log(`✓ Auditoría registrada: ${accion} en ${entityType}/${entityId}`);
  } catch (error) {
    console.error('Error registrando auditoría:', error);
  }
}

// Middleware de autenticación
function verificarToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Middleware de autorización por rol
function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'Acceso denegado: rol insuficiente' });
    }
    next();
  };
}

// ============ RUTAS DE AUTENTICACIÓN ============

app.post('/api/auth/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    
    if (!usuario || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    
    const usuarioData = USUARIOS_DEMO[usuario];
    if (!usuarioData || usuarioData.password !== password) {
      // Registrar intento fallido
      await registrarAuditoria('usuario', usuario, 'login_fallido', usuario, usuario, 'desconocido', {}, 'Intento de login fallido', req);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    
    // Crear JWT
    const token = jwt.sign(
      { usuarioId: usuario, nombre: usuarioData.nombre, rol: usuarioData.rol },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Registrar login exitoso
    await registrarAuditoria('usuario', usuario, 'login', usuario, usuarioData.nombre, usuarioData.rol, {}, 'Login exitoso', req);
    
    res.json({
      token,
      usuario: {
        usuarioId: usuario,
        nombre: usuarioData.nombre,
        rol: usuarioData.rol
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.post('/api/auth/logout', verificarToken, async (req, res) => {
  try {
    await registrarAuditoria('usuario', req.usuario.usuarioId, 'logout', req.usuario.usuarioId, req.usuario.nombre, req.usuario.rol, {}, 'Logout', req);
    res.json({ mensaje: 'Sesión cerrada' });
  } catch (error) {
    res.status(500).json({ error: 'Error en logout' });
  }
});

// ============ RUTAS DE REGISTROS (HORAS OVT) ============

// Crear nuevo registro
app.post('/api/registros', verificarToken, async (req, res) => {
  try {
    const { idCambio, cambio, cliente, fechaInicio, horaInicio, horaFin, especializad, horas, descripcion, estado } = req.body;
    
    if (!idCambio || !horas) {
      return res.status(400).json({ error: 'ID del cambio y horas son requeridos' });
    }
    
    const registroId = db.collection('registros').doc().id;
    
    const nuevoRegistro = {
      registroId,
      especialistaId: req.usuario.usuarioId,
      especialistaNombre: req.usuario.nombre,
      idCambio,
      cambio: cambio || '',
      cliente: cliente || '',
      fechaInicio: fechaInicio || new Date().toISOString(),
      horaInicio: horaInicio || '',
      horaFin: horaFin || '',
      cantidadHoras: parseFloat(horas),
      descripcion: descripcion || '',
      estado: estado || 'Pendiente',
      generaOVT: true,
      creadoPor: req.usuario.usuarioId,
      fechaCreacion: admin.firestore.Timestamp.now(),
      modificadoPor: req.usuario.usuarioId,
      fechaModificacion: admin.firestore.Timestamp.now(),
      version: 1
    };
    
    await db.collection('registros').doc(registroId).set(nuevoRegistro);
    
    // Registrar en auditoría
    await registrarAuditoria('registro', registroId, 'crear', req.usuario.usuarioId, req.usuario.nombre, req.usuario.rol, 
      { cantidadHoras: { valorAnterior: null, valorNuevo: horas }, estado: { valorAnterior: null, valorNuevo: 'Pendiente' } },
      `Nuevo registro: ${idCambio} - ${horas}h`, req);
    
    res.status(201).json({ 
      mensaje: 'Registro creado exitosamente',
      registro: nuevoRegistro 
    });
  } catch (error) {
    console.error('Error creando registro:', error);
    res.status(500).json({ error: 'Error al crear registro' });
  }
});

// Listar registros (con filtros por rol)
app.get('/api/registros', verificarToken, async (req, res) => {
  try {
    let query = db.collection('registros');
    
    // Si es especialista, solo ve sus propios registros
    if (req.usuario.rol === 'especialista') {
      query = query.where('especialistaId', '==', req.usuario.usuarioId);
    }
    
    const snapshot = await query.orderBy('fechaCreacion', 'desc').get();
    const registros = snapshot.docs.map(doc => ({
      ...doc.data(),
      fechaCreacion: doc.data().fechaCreacion?.toDate?.() || new Date(),
      fechaModificacion: doc.data().fechaModificacion?.toDate?.() || new Date()
    }));
    
    res.json({ registros, total: registros.length });
  } catch (error) {
    console.error('Error listando registros:', error);
    res.status(500).json({ error: 'Error al listar registros' });
  }
});

// Aprobar registro
app.patch('/api/registros/:id/aprobar', verificarToken, requiereRol('coordinador', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const registroRef = db.collection('registros').doc(id);
    const registroSnap = await registroRef.get();
    
    if (!registroSnap.exists) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    
    const registroAnterior = registroSnap.data();
    
    await registroRef.update({
      estado: 'Aprobado',
      aprobadoPor: req.usuario.usuarioId,
      fechaAprobacion: admin.firestore.Timestamp.now(),
      modificadoPor: req.usuario.usuarioId,
      fechaModificacion: admin.firestore.Timestamp.now()
    });
    
    // Auditoría
    await registrarAuditoria('registro', id, 'aprobar', req.usuario.usuarioId, req.usuario.nombre, req.usuario.rol,
      { estado: { valorAnterior: registroAnterior.estado, valorNuevo: 'Aprobado' } },
      `Registro ${registroAnterior.idCambio} aprobado`, req);
    
    res.json({ mensaje: 'Registro aprobado' });
  } catch (error) {
    console.error('Error aprobando registro:', error);
    res.status(500).json({ error: 'Error al aprobar registro' });
  }
});

// Rechazar registro
app.patch('/api/registros/:id/rechazar', verificarToken, requiereRol('coordinador', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { razonRechazo } = req.body;
    const registroRef = db.collection('registros').doc(id);
    const registroSnap = await registroRef.get();
    
    if (!registroSnap.exists) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    
    const registroAnterior = registroSnap.data();
    
    await registroRef.update({
      estado: 'Rechazado',
      razonRechazo: razonRechazo || 'Sin especificar',
      modificadoPor: req.usuario.usuarioId,
      fechaModificacion: admin.firestore.Timestamp.now()
    });
    
    // Auditoría
    await registrarAuditoria('registro', id, 'rechazar', req.usuario.usuarioId, req.usuario.nombre, req.usuario.rol,
      { estado: { valorAnterior: registroAnterior.estado, valorNuevo: 'Rechazado' } },
      `Registro ${registroAnterior.idCambio} rechazado. Razón: ${razonRechazo}`, req);
    
    res.json({ mensaje: 'Registro rechazado' });
  } catch (error) {
    console.error('Error rechazando registro:', error);
    res.status(500).json({ error: 'Error al rechazar registro' });
  }
});

// ============ RUTAS DE AUDITORÍA ============

// Ver historial de un registro
app.get('/api/auditoria/:entityId', verificarToken, requiereRol('coordinador', 'admin'), async (req, res) => {
  try {
    const { entityId } = req.params;
    const snapshot = await db.collection('auditoria')
      .where('entityId', '==', entityId)
      .orderBy('timestamp', 'desc')
      .get();
    
    const logs = snapshot.docs.map(doc => ({
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || new Date()
    }));
    
    res.json({ 
      entityId,
      historial: logs,
      total: logs.length
    });
  } catch (error) {
    console.error('Error obteniendo auditoría:', error);
    res.status(500).json({ error: 'Error al obtener auditoría' });
  }
});

// Ver todos los logs (solo admin)
app.get('/api/auditoria', verificarToken, requiereRol('admin'), async (req, res) => {
  try {
    const snapshot = await db.collection('auditoria')
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();
    
    const logs = snapshot.docs.map(doc => ({
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() || new Date()
    }));
    
    res.json({ logs, total: logs.length });
  } catch (error) {
    console.error('Error obteniendo auditoría:', error);
    res.status(500).json({ error: 'Error al obtener auditoría' });
  }
});

// ============ RUTAS DE DASHBOARD ============

app.get('/api/dashboard/resumen', verificarToken, async (req, res) => {
  try {
    let query = db.collection('registros');
    
    // Filtrar por especialista si no es coordinador/admin
    if (req.usuario.rol === 'especialista') {
      query = query.where('especialistaId', '==', req.usuario.usuarioId);
    }
    
    const snapshot = await query.get();
    const registros = snapshot.docs.map(d => d.data());
    
    const totalHoras = registros.reduce((sum, r) => sum + (r.cantidadHoras || 0), 0);
    const horasAprobadas = registros
      .filter(r => r.estado === 'Aprobado')
      .reduce((sum, r) => sum + r.cantidadHoras, 0);
    const horasPendientes = registros
      .filter(r => r.estado === 'Pendiente')
      .reduce((sum, r) => sum + r.cantidadHoras, 0);
    
    res.json({
      totalHoras: Math.round(totalHoras * 10) / 10,
      horasAprobadas: Math.round(horasAprobadas * 10) / 10,
      horasPendientes: Math.round(horasPendientes * 10) / 10,
      totalActividades: registros.length,
      especialistas: [...new Set(registros.map(r => r.especialistaNombre))].length
    });
  } catch (error) {
    console.error('Error en dashboard:', error);
    res.status(500).json({ error: 'Error al obtener datos del dashboard' });
  }
});

// ============ HEALTH CHECK ============

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============ INICIAR SERVIDOR ============

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✓ SERVIDOR OVT INICIADO`);
  console.log(`✓ Puerto: ${PORT}`);
  console.log(`✓ Auditoría: ACTIVA`);
  console.log(`✓ Usuarios: 25 especialistas + coordinador + admin`);
  console.log(`${'='.repeat(50)}\n`);
});

module.exports = app;
