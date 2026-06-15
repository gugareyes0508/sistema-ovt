const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const admin = require('firebase-admin');

// Cargar credenciales Firebase desde archivo JSON
const serviceAccount = require('./firebase-key.json');

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://sistema-ovt-bcochile.firebaseio.com'
  });
  console.log('✓ Firebase inicializado correctamente');
} catch (err) {
  console.error('✗ Error inicializando Firebase:', err.message);
  process.exit(1);
}

const db = admin.firestore();
const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'secreto-demo';

// Usuarios de prueba
const usuarios = {
  'jorge.maureira': { rol: 'especialista', nombre: 'Jorge Maureira', contrasena: 'demo123' },
  'jhon.estrada': { rol: 'especialista', nombre: 'Jhon Estrada', contrasena: 'demo123' },
  'luis.vasquez': { rol: 'especialista', nombre: 'Luis Vasquez', contrasena: 'demo123' },
  'moises.junco': { rol: 'especialista', nombre: 'Moises Junco', contrasena: 'demo123' },
  'manuel.urbina': { rol: 'especialista', nombre: 'Manuel Urbina', contrasena: 'demo123' },
  'benjamin.fierro': { rol: 'especialista', nombre: 'Benjamin Fierro', contrasena: 'demo123' },
  'mauricio.serrano': { rol: 'especialista', nombre: 'Mauricio Serrano', contrasena: 'demo123' },
  'ricardo.rojas': { rol: 'especialista', nombre: 'Ricardo Rojas', contrasena: 'demo123' },
  'ariel.garate': { rol: 'especialista', nombre: 'Ariel Garate', contrasena: 'demo123' },
  'najeeb.escobar': { rol: 'especialista', nombre: 'Najeeb Escobar', contrasena: 'demo123' },
  'rodrigo.sanhueza': { rol: 'especialista', nombre: 'Rodrigo Sanhueza', contrasena: 'demo123' },
  'sebastian.arroyo': { rol: 'especialista', nombre: 'Sebastian Arroyo', contrasena: 'demo123' },
  'cristian.madariaga': { rol: 'especialista', nombre: 'Cristian Madariaga', contrasena: 'demo123' },
  'miguel.martinez': { rol: 'especialista', nombre: 'Miguel Martinez', contrasena: 'demo123' },
  'fabian.tobar': { rol: 'especialista', nombre: 'Fabian Tobar', contrasena: 'demo123' },
  'gustavo.perolo': { rol: 'especialista', nombre: 'Gustavo Perolo', contrasena: 'demo123' },
  'leonardo.silva': { rol: 'especialista', nombre: 'Leonardo Silva', contrasena: 'demo123' },
  'cristian.lecaros': { rol: 'especialista', nombre: 'Cristian Lecaros', contrasena: 'demo123' },
  'rodrigo.escobedo': { rol: 'especialista', nombre: 'Rodrigo Escobedo', contrasena: 'demo123' },
  'alexis.alfonzo': { rol: 'especialista', nombre: 'Alexis Alfonzo', contrasena: 'demo123' },
  'danilo.isla': { rol: 'especialista', nombre: 'Danilo Isla', contrasena: 'demo123' },
  'gustavo.reyes': { rol: 'especialista', nombre: 'Gustavo Reyes', contrasena: 'demo123' },
  'maria.admin': { rol: 'coordinador', nombre: 'Maria Admin', contrasena: 'demo123' },
  'admin': { rol: 'admin', nombre: 'Administrador', contrasena: 'demo123' }
};

// Verificar JWT
function verificarToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Sin token' });

  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { usuario, contrasena } = req.body;
    const u = usuarios[usuario];

    if (!u || u.contrasena !== contrasena) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign(
      { usuario, rol: u.rol, nombre: u.nombre },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log en auditoría
    await db.collection('auditoria').add({
      accion: 'login',
      usuario,
      nombre: u.nombre,
      rol: u.rol,
      timestamp: new Date()
    });

    res.json({ token, usuario: { id: usuario, nombre: u.nombre, rol: u.rol } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET registros
app.get('/api/registros', verificarToken, async (req, res) => {
  try {
    let query = db.collection('registros');
    if (req.usuario.rol === 'especialista') {
      query = query.where('especialista', '==', req.usuario.nombre);
    }

    const snap = await query.get();
    const registros = [];
    snap.forEach(doc => registros.push({ id: doc.id, ...doc.data() }));
    res.json(registros);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST registros
app.post('/api/registros', verificarToken, async (req, res) => {
  try {
    const { idCambio, nombreCambio, cliente, horas } = req.body;
    
    const doc = await db.collection('registros').add({
      idCambio,
      nombreCambio,
      cliente,
      horas: parseFloat(horas),
      especialista: req.usuario.nombre,
      estado: 'pendiente',
      createdAt: new Date()
    });

    res.json({ id: doc.id, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH aprobar
app.patch('/api/registros/:id/aprobar', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'coordinador' && req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await db.collection('registros').doc(req.params.id).update({
      estado: 'aprobado',
      aprobadoPor: req.usuario.nombre,
      aprobadoEn: new Date()
    });

    res.json({ id: req.params.id, estado: 'aprobado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH rechazar
app.patch('/api/registros/:id/rechazar', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'coordinador' && req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await db.collection('registros').doc(req.params.id).update({
      estado: 'rechazado',
      rechazadoPor: req.usuario.nombre,
      rechazadoEn: new Date()
    });

    res.json({ id: req.params.id, estado: 'rechazado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET auditoría
app.get('/api/auditoria', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo admin' });
    }

    const snap = await db.collection('auditoria').orderBy('timestamp', 'desc').limit(100).get();
    const logs = [];
    snap.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET dashboard
app.get('/api/dashboard/resumen', verificarToken, async (req, res) => {
  try {
    const snap = await db.collection('registros').get();
    const registros = [];
    snap.forEach(doc => registros.push(doc.data()));

    res.json({
      totalRegistros: registros.length,
      totalHoras: registros.reduce((s, r) => s + (r.horas || 0), 0),
      pendientes: registros.filter(r => r.estado === 'pendiente').length,
      aprobados: registros.filter(r => r.estado === 'aprobado').length,
      rechazados: registros.filter(r => r.estado === 'rechazado').length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Iniciar
app.listen(PORT, () => {
  console.log('\n==================================================');
  console.log('✓ SERVIDOR OVT ACTIVO');
  console.log('✓ Puerto: ' + PORT);
  console.log('✓ Firebase: Conectado');
  console.log('✓ Auditoría: ACTIVA');
  console.log('==================================================\n');
});
