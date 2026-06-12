const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
require('dotenv').config();

const admin = require('firebase-admin');

// Inicializar Firebase con variables de entorno
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY ? 
    process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  databaseURL: process.env.FIREBASE_DATABASE_URL
};

console.log('Firebase Config:', {
  projectId: firebaseConfig.projectId,
  clientEmail: firebaseConfig.clientEmail,
  databaseURL: firebaseConfig.databaseURL
});

if (!firebaseConfig.projectId || !firebaseConfig.privateKey || !firebaseConfig.clientEmail) {
  console.error('❌ Variables de Firebase no configuradas correctamente');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
  databaseURL: firebaseConfig.databaseURL
});

const db = admin.firestore();
const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'secreto-temporal-cambiar-en-produccion';

// ============================================
// ESPECIALISTAS (22)
// ============================================
const especialistas = [
  'Jorge Maureira', 'Jhon Estrada', 'Luis Vasquez', 'Moises Junco',
  'Manuel Urbina Hernández', 'Benjamín Fierro', 'Mauricio Antonio Serrano Gonzalez',
  'Ricardo Andrés Rojas Ramos', 'Ariel Garate', 'Najeeb Ency Escobar Perez',
  'Rodrigo Alejandro Sanhueza', 'Sebastian Arroyo Vigouroux', 'Cristian Madariaga',
  'Miguel Martinez', 'Fabian Tobar', 'Gustavo Perolo', 'Leonardo Silva',
  'Cristian Lecaros', 'Rodrigo Escobedo', 'Alexis José Alfonzo', 'Danilo Isla',
  'Gustavo Reyes'
];

// ============================================
// USUARIOS DE PRUEBA
// ============================================
const usuarios = {
  'jorge.maureira': { rol: 'especialista', nombre: 'Jorge Maureira', contrasena: 'demo123' },
  'jhon.estrada': { rol: 'especialista', nombre: 'Jhon Estrada', contrasena: 'demo123' },
  'luis.vasquez': { rol: 'especialista', nombre: 'Luis Vasquez', contrasena: 'demo123' },
  'moises.junco': { rol: 'especialista', nombre: 'Moises Junco', contrasena: 'demo123' },
  'manuel.urbina': { rol: 'especialista', nombre: 'Manuel Urbina Hernández', contrasena: 'demo123' },
  'benjamin.fierro': { rol: 'especialista', nombre: 'Benjamín Fierro', contrasena: 'demo123' },
  'mauricio.serrano': { rol: 'especialista', nombre: 'Mauricio Antonio Serrano Gonzalez', contrasena: 'demo123' },
  'ricardo.rojas': { rol: 'especialista', nombre: 'Ricardo Andrés Rojas Ramos', contrasena: 'demo123' },
  'ariel.garate': { rol: 'especialista', nombre: 'Ariel Garate', contrasena: 'demo123' },
  'najeeb.escobar': { rol: 'especialista', nombre: 'Najeeb Ency Escobar Perez', contrasena: 'demo123' },
  'rodrigo.sanhueza': { rol: 'especialista', nombre: 'Rodrigo Alejandro Sanhueza', contrasena: 'demo123' },
  'sebastian.arroyo': { rol: 'especialista', nombre: 'Sebastian Arroyo Vigouroux', contrasena: 'demo123' },
  'cristian.madariaga': { rol: 'especialista', nombre: 'Cristian Madariaga', contrasena: 'demo123' },
  'miguel.martinez': { rol: 'especialista', nombre: 'Miguel Martinez', contrasena: 'demo123' },
  'fabian.tobar': { rol: 'especialista', nombre: 'Fabian Tobar', contrasena: 'demo123' },
  'gustavo.perolo': { rol: 'especialista', nombre: 'Gustavo Perolo', contrasena: 'demo123' },
  'leonardo.silva': { rol: 'especialista', nombre: 'Leonardo Silva', contrasena: 'demo123' },
  'cristian.lecaros': { rol: 'especialista', nombre: 'Cristian Lecaros', contrasena: 'demo123' },
  'rodrigo.escobedo': { rol: 'especialista', nombre: 'Rodrigo Escobedo', contrasena: 'demo123' },
  'alexis.alfonzo': { rol: 'especialista', nombre: 'Alexis José Alfonzo', contrasena: 'demo123' },
  'danilo.isla': { rol: 'especialista', nombre: 'Danilo Isla', contrasena: 'demo123' },
  'gustavo.reyes': { rol: 'especialista', nombre: 'Gustavo Reyes', contrasena: 'demo123' },
  'maria.admin': { rol: 'coordinador', nombre: 'Maria Admin', contrasena: 'demo123' },
  'admin': { rol: 'admin', nombre: 'Administrador', contrasena: 'demo123' }
};

// ============================================
// MIDDLEWARE: Verificar JWT
// ============================================
function verificarToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
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
}

// ============================================
// ENDPOINTS
// ============================================

// 1. Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { usuario, contrasena } = req.body;
    
    if (!usuario || !contrasena) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const usuarioData = usuarios[usuario];
    
    if (!usuarioData || usuarioData.contrasena !== contrasena) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { usuario, rol: usuarioData.rol, nombre: usuarioData.nombre },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Registrar login en auditoría
    await db.collection('auditoria').add({
      entityType: 'usuario',
      entityId: usuario,
      accion: 'login',
      usuarioId: usuario,
      usuarioNombre: usuarioData.nombre,
      usuarioRol: usuarioData.rol,
      timestamp: new Date(),
      metadata: {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    });

    res.json({
      token,
      usuario: { id: usuario, nombre: usuarioData.nombre, rol: usuarioData.rol }
    });
  } catch (err) {
    console.error('Error login:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Obtener registros
app.get('/api/registros', verificarToken, async (req, res) => {
  try {
    const { especialista } = req.query;
    let query = db.collection('registros');

    if (req.usuario.rol === 'especialista') {
      query = query.where('especialista', '==', req.usuario.nombre);
    } else if (especialista) {
      query = query.where('especialista', '==', especialista);
    }

    const snapshot = await query.get();
    const registros = [];
    snapshot.forEach(doc => {
      registros.push({ id: doc.id, ...doc.data() });
    });

    res.json(registros);
  } catch (err) {
    console.error('Error obtener registros:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Crear registro
app.post('/api/registros', verificarToken, async (req, res) => {
  try {
    const { idCambio, nombreCambio, cliente, fechaInicio, horaInicio, horaFin, horas } = req.body;

    if (!idCambio || !nombreCambio || !horas) {
      return res.status(400).json({ error: 'Campos requeridos incompletos' });
    }

    const nuevoRegistro = {
      idCambio,
      nombreCambio,
      cliente,
      fechaInicio,
      horaInicio,
      horaFin,
      horas: parseFloat(horas),
      especialista: req.usuario.nombre,
      estado: 'pendiente',
      createdAt: new Date(),
      usuarioId: req.usuario.usuario
    };

    const docRef = await db.collection('registros').add(nuevoRegistro);

    // Registrar en auditoría
    await db.collection('auditoria').add({
      entityType: 'registro',
      entityId: docRef.id,
      accion: 'crear',
      usuarioId: req.usuario.usuario,
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      camposModificados: nuevoRegistro,
      timestamp: new Date(),
      metadata: {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    });

    res.json({ id: docRef.id, ...nuevoRegistro });
  } catch (err) {
    console.error('Error crear registro:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Actualizar registro
app.patch('/api/registros/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const docRef = db.collection('registros').doc(id);
    await docRef.update(updates);

    // Registrar en auditoría
    await db.collection('auditoria').add({
      entityType: 'registro',
      entityId: id,
      accion: 'editar',
      usuarioId: req.usuario.usuario,
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      camposModificados: updates,
      timestamp: new Date(),
      metadata: {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    });

    res.json({ id, ...updates });
  } catch (err) {
    console.error('Error actualizar registro:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Aprobar registro
app.patch('/api/registros/:id/aprobar', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'coordinador' && req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { id } = req.params;
    await db.collection('registros').doc(id).update({
      estado: 'aprobado',
      aprobadoPor: req.usuario.nombre,
      aprobadoEn: new Date()
    });

    await db.collection('auditoria').add({
      entityType: 'registro',
      entityId: id,
      accion: 'aprobar',
      usuarioId: req.usuario.usuario,
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      metadata: { ipAddress: req.ip }
    });

    res.json({ id, estado: 'aprobado' });
  } catch (err) {
    console.error('Error aprobar:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Rechazar registro
app.patch('/api/registros/:id/rechazar', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'coordinador' && req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { id } = req.params;
    const { razon } = req.body;

    await db.collection('registros').doc(id).update({
      estado: 'rechazado',
      rechazadoPor: req.usuario.nombre,
      rechazadoEn: new Date(),
      razonRechazo: razon
    });

    await db.collection('auditoria').add({
      entityType: 'registro',
      entityId: id,
      accion: 'rechazar',
      usuarioId: req.usuario.usuario,
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      metadata: { ipAddress: req.ip }
    });

    res.json({ id, estado: 'rechazado' });
  } catch (err) {
    console.error('Error rechazar:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Obtener auditoría
app.get('/api/auditoria', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo admin puede ver auditoría' });
    }

    const snapshot = await db.collection('auditoria').orderBy('timestamp', 'desc').limit(500).get();
    const logs = [];
    snapshot.forEach(doc => {
      logs.push({ id: doc.id, ...doc.data() });
    });

    res.json(logs);
  } catch (err) {
    console.error('Error auditoría:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8. Dashboard
app.get('/api/dashboard/resumen', verificarToken, async (req, res) => {
  try {
    const snapshot = await db.collection('registros').get();
    const registros = [];
    snapshot.forEach(doc => {
      registros.push(doc.data());
    });

    const totalHoras = registros.reduce((sum, r) => sum + (r.horas || 0), 0);
    const pendientes = registros.filter(r => r.estado === 'pendiente').length;
    const aprobados = registros.filter(r => r.estado === 'aprobado').length;

    res.json({
      totalRegistros: registros.length,
      totalHoras,
      pendientes,
      aprobados,
      rechazados: registros.filter(r => r.estado === 'rechazado').length
    });
  } catch (err) {
    console.error('Error dashboard:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log('\n==================================================');
  console.log('✓ SERVIDOR OVT INICIADO');
  console.log('✓ Puerto: ' + PORT);
  console.log('✓ Auditoría: ACTIVA');
  console.log('✓ Usuarios: 22 especialistas + coordinador + admin');
  console.log('==================================================\n');
});