const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'demo123';

// ============================================
// MIDDLEWARES
// ============================================

app.use(express.json());
app.use(cors({
  origin: '*',
  credentials: true
}));

// ============================================
// FIREBASE INIT
// ============================================

try {
  let serviceAccount;
  
  if (process.env.FIREBASE_KEY_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_KEY_JSON);
  } else if (require.resolve('./firebase-key.json')) {
    serviceAccount = require('./firebase-key.json');
  }
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://sistema-ovt-bcochile.firebaseio.com'
  });
  
  console.log('✓ Firebase inicializado');
} catch (err) {
  console.error('✗ Error inicializando Firebase:', err.message);
  process.exit(1);
}

const db = admin.firestore();

// ============================================
// USUARIOS DEMO
// ============================================

const usuarios = {
  'jorge.maureira': { nombre: 'Jorge Maureira', rol: 'especialista', contrasena: 'demo123' },
  'jhon.estrada': { nombre: 'Jhon Estrada', rol: 'especialista', contrasena: 'demo123' },
  'luis.vasquez': { nombre: 'Luis Vasquez', rol: 'especialista', contrasena: 'demo123' },
  'moises.junco': { nombre: 'Moises Junco', rol: 'especialista', contrasena: 'demo123' },
  'manuel.urbina': { nombre: 'Manuel Urbina Hernández', rol: 'especialista', contrasena: 'demo123' },
  'benjamin.fierro': { nombre: 'Benjamín Fierro', rol: 'especialista', contrasena: 'demo123' },
  'mauricio.serrano': { nombre: 'Mauricio Antonio Serrano Gonzalez', rol: 'especialista', contrasena: 'demo123' },
  'ricardo.rojas': { nombre: 'Ricardo Andrés Rojas Ramos', rol: 'especialista', contrasena: 'demo123' },
  'ariel.garate': { nombre: 'Ariel Garate', rol: 'especialista', contrasena: 'demo123' },
  'najeeb.escobar': { nombre: 'Najeeb Ency Escobar Perez', rol: 'especialista', contrasena: 'demo123' },
  'rodrigo.sanhueza': { nombre: 'Rodrigo Alejandro Sanhueza', rol: 'especialista', contrasena: 'demo123' },
  'sebastian.arroyo': { nombre: 'Sebastian Arroyo Vigouroux', rol: 'especialista', contrasena: 'demo123' },
  'cristian.madariaga': { nombre: 'Cristian Madariaga', rol: 'especialista', contrasena: 'demo123' },
  'miguel.martinez': { nombre: 'Miguel Martinez', rol: 'especialista', contrasena: 'demo123' },
  'fabian.tobar': { nombre: 'Fabian Tobar', rol: 'especialista', contrasena: 'demo123' },
  'gustavo.perolo': { nombre: 'Gustavo Perolo', rol: 'especialista', contrasena: 'demo123' },
  'leonardo.silva': { nombre: 'Leonardo Silva', rol: 'especialista', contrasena: 'demo123' },
  'cristian.lecaros': { nombre: 'Cristian Lecaros', rol: 'especialista', contrasena: 'demo123' },
  'rodrigo.escobedo': { nombre: 'Rodrigo Escobedo', rol: 'especialista', contrasena: 'demo123' },
  'alexis.alfonzo': { nombre: 'Alexis José Alfonzo', rol: 'especialista', contrasena: 'demo123' },
  'danilo.isla': { nombre: 'Danilo Isla', rol: 'especialista', contrasena: 'demo123' },
  'gustavo.reyes': { nombre: 'Gustavo Reyes', rol: 'especialista', contrasena: 'demo123' },
  'maria.admin': { nombre: 'Maria Admin', rol: 'coordinador', contrasena: 'demo123' },
  'admin': { nombre: 'Administrador', rol: 'admin', contrasena: 'demo123' }
};

// ============================================
// MIDDLEWARE: Verificar Token
// ============================================

const verificarToken = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// ============================================
// RUTAS: AUTH
// ============================================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { usuario, contrasena } = req.body;
    
    if (!usuario || !contrasena) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    
    const user = usuarios[usuario];
    
    if (!user || user.contrasena !== contrasena) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    
    const token = jwt.sign(
      { usuario, nombre: user.nombre, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Registrar en auditoría
    await db.collection('auditoria').add({
      accion: 'LOGIN',
      usuarioNombre: user.nombre,
      usuarioRol: user.rol,
      timestamp: new Date(),
      ip: req.ip
    });
    
    res.json({
      token,
      usuario: { usuario, nombre: user.nombre, rol: user.rol }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================
// RUTAS: REGISTROS
// ============================================

// GET todos los registros
app.get('/api/registros', verificarToken, async (req, res) => {
  try {
    const snapshot = await db.collection('registros').orderBy('createdAt', 'desc').get();
    const registros = [];
    
    snapshot.forEach(doc => {
      registros.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.json(registros);
  } catch (err) {
    console.error('Error en GET /api/registros:', err);
    res.status(500).json({ error: 'Error al obtener registros' });
  }
});

// POST crear registro
app.post('/api/registros', verificarToken, async (req, res) => {
  try {
    const { idCambio, nombreCambio, cliente, horas } = req.body;
    
    if (!idCambio || !horas) {
      return res.status(400).json({ error: 'idCambio y horas son requeridos' });
    }
    
    const docRef = await db.collection('registros').add({
      idCambio: String(idCambio),
      nombreCambio: String(nombreCambio || ''),
      cliente: String(cliente || ''),
      horas: parseFloat(horas),
      especialista: req.usuario.nombre,
      estado: 'pendiente',
      createdAt: new Date(),
      createdBy: req.usuario.usuario
    });
    
    // Registrar en auditoría
    await db.collection('auditoria').add({
      accion: 'CREAR_REGISTRO',
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      camposModificados: { idCambio, horas }
    });
    
    res.json({ id: docRef.id, ...req.body });
  } catch (err) {
    console.error('Error en POST /api/registros:', err);
    res.status(500).json({ error: 'Error al crear registro' });
  }
});

// PATCH aprobar registro
app.patch('/api/registros/:id/aprobar', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'coordinador' && req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }
    
    await db.collection('registros').doc(req.params.id).update({
      estado: 'aprobado',
      updatedAt: new Date(),
      updatedBy: req.usuario.usuario
    });
    
    // Registrar en auditoría
    await db.collection('auditoria').add({
      accion: 'APROBAR_REGISTRO',
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      registroId: req.params.id
    });
    
    res.json({ message: 'Registro aprobado' });
  } catch (err) {
    console.error('Error en PATCH /aprobar:', err);
    res.status(500).json({ error: 'Error al aprobar' });
  }
});

// PATCH rechazar registro
app.patch('/api/registros/:id/rechazar', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'coordinador' && req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }
    
    await db.collection('registros').doc(req.params.id).update({
      estado: 'rechazado',
      updatedAt: new Date(),
      updatedBy: req.usuario.usuario
    });
    
    // Registrar en auditoría
    await db.collection('auditoria').add({
      accion: 'RECHAZAR_REGISTRO',
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      registroId: req.params.id
    });
    
    res.json({ message: 'Registro rechazado' });
  } catch (err) {
    console.error('Error en PATCH /rechazar:', err);
    res.status(500).json({ error: 'Error al rechazar' });
  }
});

// ============================================
// RUTAS: DASHBOARD
// ============================================

app.get('/api/dashboard/resumen', verificarToken, async (req, res) => {
  try {
    const snapshot = await db.collection('registros').get();
    
    let totalRegistros = 0;
    let totalHoras = 0;
    let pendientes = 0;
    let aprobados = 0;
    let rechazados = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      totalRegistros++;
      totalHoras += parseFloat(data.horas || 0);
      
      if (data.estado === 'pendiente') pendientes++;
      if (data.estado === 'aprobado') aprobados++;
      if (data.estado === 'rechazado') rechazados++;
    });
    
    res.json({
      totalRegistros,
      totalHoras: totalHoras.toFixed(1),
      pendientes,
      aprobados,
      rechazados
    });
  } catch (err) {
    console.error('Error en GET /dashboard:', err);
    res.status(500).json({ error: 'Error al obtener dashboard' });
  }
});

// ============================================
// RUTAS: AUDITORÍA
// ============================================

app.get('/api/auditoria', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }
    
    const snapshot = await db.collection('auditoria').orderBy('timestamp', 'desc').limit(100).get();
    const logs = [];
    
    snapshot.forEach(doc => {
      logs.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    res.json(logs);
  } catch (err) {
    console.error('Error en GET /auditoria:', err);
    res.status(500).json({ error: 'Error al obtener auditoría' });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Sistema OVT - Backend API',
    version: '1.0.0',
    endpoints: [
      'POST /api/auth/login',
      'GET /api/registros',
      'POST /api/registros',
      'PATCH /api/registros/:id/aprobar',
      'PATCH /api/registros/:id/rechazar',
      'GET /api/dashboard/resumen',
      'GET /api/auditoria'
    ]
  });
});

// ============================================
// ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log('==================================================');
  console.log('✓ SERVIDOR OVT INICIADO CORRECTAMENTE');
  console.log('==================================================');
  console.log('✓ Puerto:', PORT);
  console.log('✓ Firebase: CONECTADO');
  console.log('✓ Auditoría: ACTIVA');
  console.log('✓ 22 especialistas + coordinador + admin');
  console.log('==================================================');
});
