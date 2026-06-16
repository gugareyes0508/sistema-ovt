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
// ADMIN: Crear nuevos usuarios admin
// ============================================
app.post('/api/admin/crear-usuario', verificarToken, async (req, res) => {
  try {
    // Solo el admin original puede crear nuevos usuarios
    if (req.usuario.usuario !== 'admin') {
      return res.status(403).json({ error: 'No tienes permisos para crear usuarios' });
    }

    const { usuario, nombre, rol, departamento, contrasena } = req.body;

    if (!usuario || !nombre || !contrasena) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    // Agregar usuario a la lista en memoria
    usuarios[usuario] = {
      nombre,
      contrasena,
      rol: rol || 'admin',
      departamento: departamento || ''
    };

    res.json({ 
      success: true, 
      message: `Usuario ${usuario} creado correctamente`,
      usuario: { usuario, nombre, rol: rol || 'admin' }
    });
  } catch (err) {
    console.error('Error creando usuario:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CAMBIAR CONTRASEÑA (Cualquier usuario autenticado)
// ============================================
app.post('/api/auth/cambiar-contrasena', verificarToken, async (req, res) => {
  try {
    const { contrasenaActual, contraseñaNueva } = req.body;

    if (!contrasenaActual || !contraseñaNueva) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    if (contraseñaNueva.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }

    // Verificar contraseña actual
    const user = usuarios[req.usuario.usuario];
    if (!user || user.contrasena !== contrasenaActual) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    // Cambiar contraseña
    usuarios[req.usuario.usuario].contrasena = contraseñaNueva;

    // Registrar en auditoría
    await db.collection('auditoria').add({
      accion: 'CAMBIO_CONTRASEÑA',
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      detalles: 'Cambio de contraseña exitoso'
    });

    res.json({ 
      success: true, 
      message: 'Contraseña cambiada correctamente'
    });
  } catch (err) {
    console.error('Error cambiando contraseña:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN: Resetear contraseña de otro usuario
// ============================================
app.post('/api/admin/resetear-contrasena', verificarToken, async (req, res) => {
  try {
    // Solo admin puede resetear contraseñas
    if (req.usuario.usuario !== 'admin') {
      return res.status(403).json({ error: 'No tienes permisos para resetear contraseñas' });
    }

    const { usuario, contraseñaNueva } = req.body;

    if (!usuario || !contraseñaNueva) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    if (!usuarios[usuario]) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Cambiar contraseña
    usuarios[usuario].contrasena = contraseñaNueva;

    res.json({ 
      success: true, 
      message: `Contraseña de ${usuario} reseteada a: ${contraseñaNueva}`
    });
  } catch (err) {
    console.error('Error reseteando contraseña:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// RUTAS: REGISTROS MEJORADOS
// ============================================

// GET registros - Especialista ve solo suyos, Coordinador/Admin ven todos
app.get('/api/registros', verificarToken, async (req, res) => {
  try {
    let query = db.collection('registros');
    
    // Si es especialista, solo ve sus registros
    if (req.usuario.rol === 'especialista') {
      query = query.where('createdBy', '==', req.usuario.usuario);
    }
    
    // Obtener registros sin ordenar primero
    const snapshot = await query.get();
    const registros = [];
    
    snapshot.forEach(doc => {
      registros.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Ordenar en memoria por createdAt descendente
    registros.sort((a, b) => {
      const fechaA = a.createdAt?.toDate?.() || new Date(a.createdAt) || new Date(0);
      const fechaB = b.createdAt?.toDate?.() || new Date(b.createdAt) || new Date(0);
      return fechaB - fechaA;
    });
    
    res.json(registros);
  } catch (err) {
    console.error('Error en GET /api/registros:', err);
    res.status(500).json({ error: 'Error al obtener registros' });
  }
});

// POST crear registro MEJORADO
app.post('/api/registros', verificarToken, async (req, res) => {
  try {
    const {
      tipo,
      descripcion,
      cliente,
      fechaInicio,
      fechaFin,
      horas,
      especialista,
      interno_cliente,
      genera_ovt,
      estado,
      especialidad
    } = req.body;
    
    if (!tipo || !descripcion || !cliente || !fechaInicio || !fechaFin) {
      return res.status(400).json({ error: 'Campos requeridos faltando' });
    }
    
    const docRef = await db.collection('registros').add({
      tipo: String(tipo),
      descripcion: String(descripcion),
      cliente: String(cliente),
      fechaInicio: new Date(fechaInicio),
      fechaFin: new Date(fechaFin),
      horas: parseFloat(horas),
      especialista: String(especialista),
      interno_cliente: String(interno_cliente),
      genera_ovt: String(genera_ovt),
      estado: String(estado),
      especialidad: String(especialidad),
      createdAt: new Date(),
      createdBy: req.usuario.usuario,
      createdByNombre: req.usuario.nombre
    });
    
    // Registrar en auditoría
    await db.collection('auditoria').add({
      accion: 'CREAR_REGISTRO',
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      camposModificados: { tipo, cliente, especialidad }
    });
    
    res.json({ 
      id: docRef.id,
      mensaje: 'Registro guardado correctamente'
    });
  } catch (err) {
    console.error('Error en POST /api/registros:', err);
    res.status(500).json({ error: 'Error al crear registro: ' + err.message });
  }
});

// PATCH actualizar registro (Especialista su propio registro)
app.patch('/api/registros/:id', verificarToken, async (req, res) => {
  try {
    const registroRef = db.collection('registros').doc(req.params.id);
    const doc = await registroRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    
    // Solo el especialista propietario o admin puede modificar
    if (req.usuario.rol === 'especialista' && doc.data().createdBy !== req.usuario.usuario) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este registro' });
    }
    
    await registroRef.update({
      ...req.body,
      updatedAt: new Date(),
      updatedBy: req.usuario.usuario
    });
    
    // Registrar en auditoría
    await db.collection('auditoria').add({
      accion: 'ACTUALIZAR_REGISTRO',
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      registroId: req.params.id
    });
    
    res.json({ message: 'Registro actualizado' });
  } catch (err) {
    console.error('Error en PATCH /api/registros:', err);
    res.status(500).json({ error: 'Error al actualizar' });
  }
});

// DELETE eliminar registro (Solo Admin)
app.delete('/api/registros/:id', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo el admin puede eliminar' });
    }
    
    await db.collection('registros').doc(req.params.id).delete();
    
    // Registrar en auditoría
    await db.collection('auditoria').add({
      accion: 'ELIMINAR_REGISTRO',
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      registroId: req.params.id
    });
    
    res.json({ message: 'Registro eliminado' });
  } catch (err) {
    console.error('Error en DELETE /api/registros:', err);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

// ============================================
// RUTAS: DASHBOARD MEJORADO
// ============================================

app.get('/api/dashboard/resumen', verificarToken, async (req, res) => {
  try {
    let query = db.collection('registros');
    
    // Si es especialista, solo sus registros
    if (req.usuario.rol === 'especialista') {
      query = query.where('createdBy', '==', req.usuario.usuario);
    }
    
    const snapshot = await query.get();
    
    let totalRegistros = 0;
    let totalHoras = 0;
    let horasEsteMes = 0;
    let registrosPendientes = 0;
    
    const ahora = new Date();
    const mesActual = ahora.getMonth();
    const anioActual = ahora.getFullYear();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      totalRegistros++;
      const horas = parseFloat(data.horas || 0);
      totalHoras += horas;
      
      // Verificar si es de este mes
      const fecha = data.fechaInicio?.toDate?.() || new Date(data.fechaInicio);
      if (fecha.getMonth() === mesActual && fecha.getFullYear() === anioActual) {
        horasEsteMes += horas;
      }
      
      if (data.estado === 'pendiente') {
        registrosPendientes++;
      }
    });
    
    res.json({
      totalRegistros,
      totalHoras: totalHoras.toFixed(1),
      horasEsteMes: horasEsteMes.toFixed(1),
      registrosPendientes
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
    message: 'Sistema OVT v2 - Backend API',
    version: '2.0.0',
    endpoints: [
      'POST /api/auth/login',
      'GET /api/registros',
      'POST /api/registros',
      'PATCH /api/registros/:id',
      'DELETE /api/registros/:id',
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
  console.log('✓ SERVIDOR OVT V2 INICIADO CORRECTAMENTE');
  console.log('==================================================');
  console.log('✓ Puerto:', PORT);
  console.log('✓ Firebase: CONECTADO');
  console.log('✓ Auditoría: ACTIVA');
  console.log('✓ 22 especialistas + coordinador + admin');
  console.log('✓ Cambios y Alertas con todos los campos');
  console.log('==================================================');
});
