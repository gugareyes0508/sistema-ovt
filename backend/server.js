const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'demo123';

// ============================================
// TELEGRAM CONFIG
// ============================================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function enviarMensajeTelegram(mensaje) {
  return new Promise((resolve) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.warn('⚠️ Telegram no configurado (falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID)');
      return resolve(false);
    }

    const payload = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: mensaje,
      parse_mode: 'HTML'
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✓ Mensaje enviado a Telegram');
          resolve(true);
        } else {
          console.error('✗ Error enviando a Telegram:', data);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      console.error('✗ Error de conexión con Telegram:', err.message);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

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

// Esta lista es solo la SEMILLA inicial. La fuente de verdad real es la
// colección 'usuarios' en Firestore — así los usuarios creados/editados/eliminados
// desde Gestión de Usuarios persisten entre reinicios del servidor (Railway).
const SEED_USUARIOS = {
  'admin': { nombre: 'Administrador', rol: 'admin', departamento: 'Admin', contrasena: 'demo123', empresa: 'Kyndryl' },
  'miguel.padilla': { nombre: 'Miguel Padilla', rol: 'admin', departamento: 'DPE', contrasena: 'demo123', empresa: 'Kyndryl' },
  'hugo.araya': { nombre: 'Hugo Araya', rol: 'admin', departamento: 'DPE', contrasena: 'demo123', empresa: 'Kyndryl' },
  'gustavo.reyes': { nombre: 'Gustavo Reyes', rol: 'admin', departamento: 'Squad', contrasena: 'demo123', empresa: 'Kyndryl' },
  'najeeb.escobar': { nombre: 'Najeeb Escobar', rol: 'admin', departamento: 'TL', contrasena: 'demo123', empresa: 'Kyndryl' },
  'john.estrada': { nombre: 'john Estrada', rol: 'admin', departamento: 'TL', contrasena: 'demo123', empresa: 'Kyndryl' },
  'maria.admin': { nombre: 'Maria Admin', rol: 'coordinador', departamento: 'Coordinación', contrasena: 'demo123', empresa: 'Kyndryl' },
  'danilo.isla': { nombre: 'Danilo Isla', rol: 'itsm', departamento: 'ITSM', contrasena: 'demo123', empresa: 'Kyndryl' },
  'jorge.maureira': { nombre: 'Jorge Maureira', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl' },
  'jhon.estrada': { nombre: 'Jhon Estrada', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl' },
  'luis.vasquez': { nombre: 'Luis Vasquez', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl' },
  'moises.junco': { nombre: 'Moises Junco', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl' },
  'manuel.urbina': { nombre: 'Manuel Urbina Hernández', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl' },
  'benjamin.fierro': { nombre: 'Benjamín Fierro', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl' },
  'mauricio.serrano': { nombre: 'Mauricio Antonio Serrano Gonzalez', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl' },
  'ricardo.rojas': { nombre: 'Ricardo Andrés Rojas Ramos', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl' },
  'ariel.garate': { nombre: 'Ariel Garate', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl' },
  'rodrigo.sanhueza': { nombre: 'Rodrigo Alejandro Sanhueza', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl' },
  'sebastian.arroyo': { nombre: 'Sebastian Arroyo Vigouroux', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl' },
  'cristian.madariaga': { nombre: 'Cristian Madariaga', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl' },
  'miguel.martinez': { nombre: 'Miguel Martinez', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl' },
  'fabian.tobar': { nombre: 'Fabian Tobar', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl' },
  'gustavo.perolo': { nombre: 'Gustavo Perolo', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl' },
  'leonardo.silva': { nombre: 'Leonardo Silva', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl' },
  'cristian.lecaros': { nombre: 'Cristian Lecaros', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl' },
  'rodrigo.escobedo': { nombre: 'Rodrigo Escobedo', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl' },
  'alexis.alfonzo': { nombre: 'Alexis José Alfonzo', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl' }
};

// Carga la semilla a Firestore SOLO si la colección 'usuarios' está vacía
// (primera vez que corre el sistema con esta versión). Es idempotente:
// si ya hay usuarios guardados, no hace nada y respeta lo que el admin haya gestionado.
async function inicializarUsuarios() {
  try {
    const snapshot = await db.collection('usuarios').limit(1).get();
    if (!snapshot.empty) {
      console.log('✓ Colección "usuarios" ya existe en Firestore, no se siembra de nuevo');
      return;
    }
    const batch = db.batch();
    for (const [usuario, datos] of Object.entries(SEED_USUARIOS)) {
      batch.set(db.collection('usuarios').doc(usuario), datos);
    }
    await batch.commit();
    console.log('✓ Usuarios iniciales sembrados en Firestore (' + Object.keys(SEED_USUARIOS).length + ')');
  } catch (err) {
    console.error('✗ Error sembrando usuarios en Firestore:', err.message);
  }
}

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

    const userDoc = await db.collection('usuarios').doc(usuario).get();

    if (!userDoc.exists) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = userDoc.data();

    if (user.contrasena !== contrasena) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign(
      { usuario, nombre: user.nombre, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

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
// LISTAR TODOS LOS USUARIOS (para admin)
// ============================================
app.get('/api/admin/listar-usuarios', verificarToken, async (req, res) => {
  try {
    if (req.usuario.usuario !== 'admin') {
      return res.status(403).json({ error: 'No tienes permisos' });
    }

    const snapshot = await db.collection('usuarios').get();
    const usuariosList = [];
    snapshot.forEach(doc => {
      const datos = doc.data();
      usuariosList.push({
        usuario: doc.id,
        nombre: datos.nombre,
        rol: datos.rol,
        departamento: datos.departamento || 'N/A',
        empresa: datos.empresa || 'Sin asignar'
      });
    });

    res.json({ success: true, usuarios: usuariosList });
  } catch (err) {
    console.error('Error listando usuarios:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// LISTAR ESPECIALISTAS ACTIVOS (para selects de ITSM/Admin)
// Endpoint liviano, sin datos sensibles, accesible a itsm y admin
// ============================================
app.get('/api/especialistas', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin' && req.usuario.rol !== 'itsm') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const snapshot = await db.collection('usuarios').where('rol', '==', 'especialista').get();
    const especialistas = [];
    snapshot.forEach(doc => {
      const datos = doc.data();
      especialistas.push({ nombre: datos.nombre, departamento: datos.departamento || '' });
    });
    especialistas.sort((a, b) => a.nombre.localeCompare(b.nombre));

    res.json(especialistas);
  } catch (err) {
    console.error('Error listando especialistas:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/crear-usuario', verificarToken, async (req, res) => {
  try {
    if (req.usuario.usuario !== 'admin') {
      return res.status(403).json({ error: 'No tienes permisos para crear usuarios' });
    }

    const { usuario, nombre, rol, departamento, contrasena, empresa } = req.body;

    if (!usuario || !nombre || !contrasena) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const existente = await db.collection('usuarios').doc(usuario).get();
    if (existente.exists) {
      return res.status(400).json({ error: 'Ese nombre de usuario ya existe' });
    }

    await db.collection('usuarios').doc(usuario).set({
      nombre,
      contrasena,
      rol: rol || 'admin',
      departamento: departamento || '',
      empresa: empresa || 'Kyndryl'
    });

    await db.collection('auditoria').add({
      accion: 'CREAR_USUARIO',
      usuarioAdminNombre: req.usuario.nombre,
      usuarioCreado: usuario,
      timestamp: new Date()
    });

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
// CAMBIAR CONTRASEÑA
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

    const userRef = db.collection('usuarios').doc(req.usuario.usuario);
    const userDoc = await userRef.get();
    if (!userDoc.exists || userDoc.data().contrasena !== contrasenaActual) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    await userRef.update({ contrasena: contraseñaNueva });

    await db.collection('auditoria').add({
      accion: 'CAMBIO_CONTRASEÑA',
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      detalles: 'Cambio de contraseña exitoso'
    });

    res.json({ success: true, message: 'Contraseña cambiada correctamente' });
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
    if (req.usuario.usuario !== 'admin') {
      return res.status(403).json({ error: 'No tienes permisos para resetear contraseñas' });
    }

    const { usuario, contraseñaNueva } = req.body;

    if (!usuario || !contraseñaNueva) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const userRef = db.collection('usuarios').doc(usuario);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    await userRef.update({ contrasena: contraseñaNueva });

    await db.collection('auditoria').add({
      accion: 'RESETEO_CONTRASENA',
      usuarioAdminNombre: req.usuario.nombre,
      usuarioAfectado: usuario,
      timestamp: new Date(),
      detalles: `Reseteo de contraseña realizado por admin`
    });

    res.json({ success: true, message: `Contraseña de ${usuario} reseteada correctamente` });
  } catch (err) {
    console.error('Error reseteando contraseña:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN: Editar parámetros de un usuario (ej: empresa, departamento, nombre)
// ============================================
app.post('/api/admin/editar-usuario', verificarToken, async (req, res) => {
  try {
    if (req.usuario.usuario !== 'admin') {
      return res.status(403).json({ error: 'No tienes permisos para editar usuarios' });
    }

    const { usuario, empresa, nombre, departamento } = req.body;

    if (!usuario) {
      return res.status(400).json({ error: 'Usuario requerido' });
    }

    const userRef = db.collection('usuarios').doc(usuario);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const cambios = {};
    if (empresa !== undefined) cambios.empresa = empresa;
    if (nombre !== undefined && nombre !== '') cambios.nombre = nombre;
    if (departamento !== undefined && departamento !== '') cambios.departamento = departamento;

    if (Object.keys(cambios).length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos para actualizar' });
    }

    await userRef.update(cambios);

    await db.collection('auditoria').add({
      accion: 'EDITAR_USUARIO',
      usuarioAdminNombre: req.usuario.nombre,
      usuarioEditado: usuario,
      camposModificados: cambios,
      timestamp: new Date()
    });

    res.json({ success: true, message: `Usuario ${usuario} actualizado correctamente` });
  } catch (err) {
    console.error('Error editando usuario:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN: Eliminar usuario
// ============================================
app.post('/api/admin/eliminar-usuario', verificarToken, async (req, res) => {
  try {
    if (req.usuario.usuario !== 'admin') {
      return res.status(403).json({ error: 'No tienes permisos para eliminar usuarios' });
    }

    const { usuario } = req.body;

    if (!usuario) {
      return res.status(400).json({ error: 'Usuario requerido' });
    }

    if (usuario === 'admin') {
      return res.status(400).json({ error: 'No se puede eliminar al admin original' });
    }

    const userRef = db.collection('usuarios').doc(usuario);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const nombreUsuario = userDoc.data().nombre;
    await userRef.delete();

    await db.collection('auditoria').add({
      accion: 'ELIMINAR_USUARIO',
      usuarioAdminNombre: req.usuario.nombre,
      usuarioEliminado: usuario,
      usuarioEliminadoNombre: nombreUsuario,
      timestamp: new Date(),
      detalles: `Usuario eliminado por admin`
    });

    res.json({ success: true, message: `Usuario ${usuario} (${nombreUsuario}) eliminado correctamente` });
  } catch (err) {
    console.error('Error eliminando usuario:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// RUTAS: REGISTROS MEJORADOS
// ============================================

app.get('/api/registros', verificarToken, async (req, res) => {
  try {
    let query = db.collection('registros');

    if (req.usuario.rol === 'especialista') {
      query = query.where('createdBy', '==', req.usuario.usuario);
    }

    const snapshot = await query.get();
    const registros = [];

    snapshot.forEach(doc => {
      registros.push({ id: doc.id, ...doc.data() });
    });

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

// POST crear registro MEJORADO — incluye numeroTicket
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
      especialidad,
      numeroTicket
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
      numeroTicket: numeroTicket ? String(numeroTicket) : '',
      createdAt: new Date(),
      createdBy: req.usuario.usuario,
      createdByNombre: req.usuario.nombre
    });

    await db.collection('auditoria').add({
      accion: 'CREAR_REGISTRO',
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      camposModificados: { tipo, cliente, especialidad, numeroTicket }
    });

    if (String(estado) === 'pendiente') {
      const mensaje =
        `🔔 <b>Nuevo registro pendiente de aprobación</b>\n\n` +
        `👤 <b>Especialista:</b> ${req.usuario.nombre}\n` +
        `📋 <b>Tipo:</b> ${tipo}\n` +
        `🎫 <b>N° Ticket:</b> ${numeroTicket || 'Sin ticket'}\n` +
        `🏢 <b>Cliente:</b> ${cliente}\n` +
        `⏱️ <b>Horas:</b> ${horas}h\n` +
        `🛠️ <b>Especialidad:</b> ${especialidad}\n` +
        `📝 <b>Descripción:</b> ${String(descripcion).substring(0, 150)}\n\n` +
        `✅ Ingresa al sistema para aprobar o rechazar.`;

      enviarMensajeTelegram(mensaje);
    }

    res.json({
      id: docRef.id,
      mensaje: 'Registro guardado correctamente'
    });
  } catch (err) {
    console.error('Error en POST /api/registros:', err);
    res.status(500).json({ error: 'Error al crear registro: ' + err.message });
  }
});

// PATCH actualizar registro
app.patch('/api/registros/:id', verificarToken, async (req, res) => {
  try {
    const registroRef = db.collection('registros').doc(req.params.id);
    const doc = await registroRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    if (req.usuario.rol === 'especialista' && doc.data().createdBy !== req.usuario.usuario) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este registro' });
    }

    const estabaPendiente = doc.data().estado === 'pendiente';
    const quedaPendiente = req.body.estado === 'pendiente';

    await registroRef.update({
      ...req.body,
      updatedAt: new Date(),
      updatedBy: req.usuario.usuario
    });

    await db.collection('auditoria').add({
      accion: 'ACTUALIZAR_REGISTRO',
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      registroId: req.params.id
    });

    if (!estabaPendiente && quedaPendiente) {
      const data = doc.data();
      const mensaje =
        `🔔 <b>Registro corregido - Pendiente de aprobación</b>\n\n` +
        `👤 <b>Especialista:</b> ${data.createdByNombre || data.especialista}\n` +
        `📋 <b>Tipo:</b> ${req.body.tipo || data.tipo}\n` +
        `🎫 <b>N° Ticket:</b> ${req.body.numeroTicket || data.numeroTicket || 'Sin ticket'}\n` +
        `🏢 <b>Cliente:</b> ${req.body.cliente || data.cliente}\n` +
        `⏱️ <b>Horas:</b> ${req.body.horas || data.horas}h\n\n` +
        `✅ Ingresa al sistema para aprobar o rechazar.`;

      enviarMensajeTelegram(mensaje);
    }

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
// RUTAS: PROYECCIONES OVT (ITSM)
// Colección separada de "registros" — son estimaciones, no horas reales.
// ============================================

// GET proyecciones - ITSM ve solo las suyas, Admin/Coordinador ven todas (con filtros opcionales)
app.get('/api/proyecciones', verificarToken, async (req, res) => {
  try {
    let query = db.collection('proyecciones_ovt');

    if (req.usuario.rol === 'itsm') {
      query = query.where('createdBy', '==', req.usuario.usuario);
    }

    const snapshot = await query.get();
    const proyecciones = [];

    snapshot.forEach(doc => {
      proyecciones.push({ id: doc.id, ...doc.data() });
    });

    proyecciones.sort((a, b) => {
      const fechaA = a.createdAt?.toDate?.() || new Date(a.createdAt) || new Date(0);
      const fechaB = b.createdAt?.toDate?.() || new Date(b.createdAt) || new Date(0);
      return fechaB - fechaA;
    });

    res.json(proyecciones);
  } catch (err) {
    console.error('Error en GET /api/proyecciones:', err);
    res.status(500).json({ error: 'Error al obtener proyecciones' });
  }
});

// POST crear proyección (solo ITSM)
app.post('/api/proyecciones', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'itsm') {
      return res.status(403).json({ error: 'Solo ITSM puede registrar proyecciones' });
    }

    const {
      tipo,
      descripcion,
      cliente,
      fechaInicio,
      fechaFin,
      horas,
      interno_cliente,
      genera_ovt,
      especialidad,
      probabilidad,
      numeroTicket,
      especialistaAsignado
    } = req.body;

    if (!tipo || !descripcion || !cliente || !fechaInicio || !fechaFin || !probabilidad) {
      return res.status(400).json({ error: 'Campos requeridos faltando' });
    }

    const docRef = await db.collection('proyecciones_ovt').add({
      tipo: String(tipo),
      descripcion: String(descripcion),
      cliente: String(cliente),
      fechaInicio: new Date(fechaInicio),
      fechaFin: new Date(fechaFin),
      horas: parseFloat(horas) || 0,
      interno_cliente: String(interno_cliente || 'interno'),
      genera_ovt: String(genera_ovt || 'si'),
      especialidad: String(especialidad || 'operaciones'),
      especialistaAsignado: especialistaAsignado ? String(especialistaAsignado) : 'Sin asignar',
      probabilidad: String(probabilidad), // 'alta' | 'media' | 'baja'
      numeroTicket: numeroTicket ? String(numeroTicket) : '',
      estado: 'proyectado', // 'proyectado' | 'confirmado' | 'descartado'
      createdAt: new Date(),
      createdBy: req.usuario.usuario,
      createdByNombre: req.usuario.nombre
    });

    await db.collection('auditoria').add({
      accion: 'CREAR_PROYECCION_OVT',
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      camposModificados: { tipo, cliente, probabilidad }
    });

    res.json({ id: docRef.id, mensaje: 'Proyección guardada correctamente' });
  } catch (err) {
    console.error('Error en POST /api/proyecciones:', err);
    res.status(500).json({ error: 'Error al crear proyección: ' + err.message });
  }
});

// PATCH actualizar proyección (solo el ITSM que la creó, o admin)
app.patch('/api/proyecciones/:id', verificarToken, async (req, res) => {
  try {
    const ref = db.collection('proyecciones_ovt').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Proyección no encontrada' });
    }

    if (req.usuario.rol === 'itsm' && doc.data().createdBy !== req.usuario.usuario) {
      return res.status(403).json({ error: 'No tienes permiso para modificar esta proyección' });
    }

    await ref.update({
      ...req.body,
      updatedAt: new Date(),
      updatedBy: req.usuario.usuario
    });

    await db.collection('auditoria').add({
      accion: 'ACTUALIZAR_PROYECCION_OVT',
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      proyeccionId: req.params.id
    });

    res.json({ message: 'Proyección actualizada' });
  } catch (err) {
    console.error('Error en PATCH /api/proyecciones:', err);
    res.status(500).json({ error: 'Error al actualizar proyección' });
  }
});

// DELETE eliminar proyección (admin: cualquiera | ITSM: solo las propias) — eliminación permanente, distinto de "descartar"
app.delete('/api/proyecciones/:id', verificarToken, async (req, res) => {
  try {
    const ref = db.collection('proyecciones_ovt').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Proyección no encontrada' });
    }

    const esAdmin = req.usuario.rol === 'admin';
    const esDuena = req.usuario.rol === 'itsm' && doc.data().createdBy === req.usuario.usuario;

    if (!esAdmin && !esDuena) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta proyección' });
    }

    await ref.delete();

    await db.collection('auditoria').add({
      accion: 'ELIMINAR_PROYECCION_OVT',
      usuarioNombre: req.usuario.nombre,
      usuarioRol: req.usuario.rol,
      timestamp: new Date(),
      proyeccionId: req.params.id
    });

    res.json({ message: 'Proyección eliminada' });
  } catch (err) {
    console.error('Error en DELETE /api/proyecciones:', err);
    res.status(500).json({ error: 'Error al eliminar proyección' });
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
      logs.push({ id: doc.id, ...doc.data() });
    });

    res.json(logs);
  } catch (err) {
    console.error('Error en GET /auditoria:', err);
    res.status(500).json({ error: 'Error al obtener auditoría' });
  }
});

// ============================================
// RUTA: TEST TELEGRAM
// ============================================

app.get('/api/telegram/test', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const enviado = await enviarMensajeTelegram(
      `✅ <b>Test de conexión</b>\n\nSistema OVT está correctamente conectado a Telegram.`
    );

    if (enviado) {
      res.json({ success: true, message: 'Mensaje de prueba enviado correctamente' });
    } else {
      res.status(500).json({ success: false, error: 'No se pudo enviar el mensaje. Verifica TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.' });
    }
  } catch (err) {
    console.error('Error en test de Telegram:', err);
    res.status(500).json({ error: err.message });
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
    version: '2.1.0',
    endpoints: [
      'POST /api/auth/login',
      'GET /api/registros',
      'POST /api/registros',
      'PATCH /api/registros/:id',
      'DELETE /api/registros/:id',
      'GET /api/dashboard/resumen',
      'GET /api/auditoria',
      'GET /api/telegram/test'
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
// CLAIMS — Control de Labor
// Colección Firestore: claims_semanas
// Cada documento = una semana procesada del Export.xlsx
// ============================================

// GET /api/claims → listar todas las semanas cargadas
app.get('/api/claims', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
    const snap = await db.collection('claims_semanas').orderBy('fecha', 'asc').get();
    const semanas = [];
    snap.forEach(doc => semanas.push({ id: doc.id, ...doc.data() }));
    res.json(semanas);
  } catch (err) {
    console.error('Error GET /api/claims:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/claims/upload → recibe array de semanas procesadas, guarda solo las nuevas
app.post('/api/claims/upload', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
    const { semanas } = req.body;
    if (!Array.isArray(semanas) || semanas.length === 0) {
      return res.status(400).json({ error: 'No se recibieron semanas' });
    }

    // Verificar cuáles fechas ya existen
    const existSnap = await db.collection('claims_semanas').get();
    const existentes = new Set();
    existSnap.forEach(doc => existentes.add(doc.data().fecha));

    const nuevas = semanas.filter(s => !existentes.has(s.fecha));
    if (nuevas.length === 0) {
      return res.json({ message: 'Todas las semanas ya estaban cargadas', nuevas: 0, total: semanas.length });
    }

    const batch = db.batch();
    nuevas.forEach(sem => {
      const ref = db.collection('claims_semanas').doc(sem.fecha);
      batch.set(ref, {
        ...sem,
        creadoPor: req.usuario.nombre,
        creadoEn: new Date()
      });
    });
    await batch.commit();

    await db.collection('auditoria').add({
      accion: 'CLAIMS_UPLOAD',
      usuarioNombre: req.usuario.nombre,
      semanasNuevas: nuevas.length,
      semanasTotales: semanas.length,
      timestamp: new Date()
    });

    res.json({ message: 'Carga exitosa', nuevas: nuevas.length, total: semanas.length });
  } catch (err) {
    console.error('Error POST /api/claims/upload:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/claims → limpiar TODAS las semanas (solo admin)
app.delete('/api/claims', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
    const snap = await db.collection('claims_semanas').get();
    const batch = db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    res.json({ message: `${snap.size} semanas eliminadas` });
  } catch (err) {
    console.error('Error DELETE /api/claims:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, async () => {
  console.log('==================================================');
  console.log('✓ SERVIDOR OVT V2 INICIADO CORRECTAMENTE');
  console.log('==================================================');
  console.log('✓ Puerto:', PORT);
  console.log('✓ Firebase: CONECTADO');
  console.log('✓ Auditoría: ACTIVA');
  console.log('✓ Telegram:', TELEGRAM_BOT_TOKEN ? 'CONFIGURADO' : 'NO CONFIGURADO');
  console.log('✓ Campo N° Ticket: HABILITADO');
  console.log('✓ Usuarios: persistidos en Firestore (colección "usuarios")');
  console.log('==================================================');
  await inicializarUsuarios();
});
