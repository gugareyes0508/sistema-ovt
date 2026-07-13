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

app.use(express.json({ limit: '25mb' }));
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
  'admin': { nombre: 'Administrador', rol: 'admin', departamento: 'Admin', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'miguel.padilla': { nombre: 'Miguel Padilla', rol: 'dpe', departamento: 'DPE', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: false, grupoServicioId: '' },
  'hugo.araya': { nombre: 'Hugo Araya', rol: 'dpe', departamento: 'DPE', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: false, grupoServicioId: '' },
  'gustavo.reyes': { nombre: 'Gustavo Reyes', rol: 'admin', departamento: 'Squad', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: false, grupoServicioId: '' },
  'najeeb.escobar': { nombre: 'Najeeb Escobar', rol: 'teamleader', departamento: 'TL', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: false, grupoServicioId: '' },
  'john.estrada': { nombre: 'John Estrada', rol: 'teamleader', departamento: 'TL', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: false, grupoServicioId: '' },
  'maria.admin': { nombre: 'Maria Admin', rol: 'coordinador', departamento: 'Coordinación', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: false, grupoServicioId: '' },
  'danilo.isla': { nombre: 'Danilo Isla', rol: 'itsm', departamento: 'ITSM', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: false, grupoServicioId: '' },
  'jorge.maureira': { nombre: 'Jorge Maureira', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'jhon.estrada': { nombre: 'Jhon Estrada', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'luis.vasquez': { nombre: 'Luis Vasquez', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'moises.junco': { nombre: 'Moises Junco', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'manuel.urbina': { nombre: 'Manuel Urbina Hernández', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'benjamin.fierro': { nombre: 'Benjamín Fierro', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'mauricio.serrano': { nombre: 'Mauricio Antonio Serrano Gonzalez', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'ricardo.rojas': { nombre: 'Ricardo Andrés Rojas Ramos', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'ariel.garate': { nombre: 'Ariel Garate', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'rodrigo.sanhueza': { nombre: 'Rodrigo Alejandro Sanhueza', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'sebastian.arroyo': { nombre: 'Sebastian Arroyo Vigouroux', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'cristian.madariaga': { nombre: 'Cristian Madariaga', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'miguel.martinez': { nombre: 'Miguel Martinez', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'fabian.tobar': { nombre: 'Fabian Tobar', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'gustavo.perolo': { nombre: 'Gustavo Perolo', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'leonardo.silva': { nombre: 'Leonardo Silva', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'cristian.lecaros': { nombre: 'Cristian Lecaros', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'rodrigo.escobedo': { nombre: 'Rodrigo Escobedo', rol: 'especialista', departamento: 'Middleware', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' },
  'alexis.alfonzo': { nombre: 'Alexis José Alfonzo', rol: 'especialista', departamento: 'Operaciones Cloud', contrasena: 'demo123', empresa: 'Kyndryl', clientesIds: ['bcochile'], haceOVT: true, grupoServicioId: '' }
};

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

// Semilla de clientes y grupos de servicio iniciales
async function inicializarClientesYGrupos() {
  try {
    const snapClientes = await db.collection('clientes').limit(1).get();
    if (!snapClientes.empty) {
      console.log('✓ Colección "clientes" ya existe en Firestore');
      return;
    }
    // Crear cliente inicial
    await db.collection('clientes').doc('bcochile').set({
      nombre: 'Banco de Chile',
      activo: true,
      creadoEn: new Date()
    });
    // Crear grupos de servicio iniciales
    const grupos = [
      { nombre: 'Middleware', descripcion: 'Equipo de middleware y aplicaciones' },
      { nombre: 'Operaciones Cloud', descripcion: 'Operaciones en plataformas cloud (OCI, Azure, AWS)' },
      { nombre: 'COE', descripcion: 'Center of Excellence' },
      { nombre: 'ITSM', descripcion: 'IT Service Management' }
    ];
    const batchG = db.batch();
    for (const g of grupos) {
      const ref = db.collection('grupos_servicio').doc();
      batchG.set(ref, { ...g, clienteId: 'bcochile', activo: true, creadoEn: new Date() });
    }
    await batchG.commit();
    console.log('✓ Cliente "Banco de Chile" y 4 grupos de servicio sembrados en Firestore');
  } catch (err) {
    console.error('✗ Error sembrando clientes/grupos:', err.message);
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
      { usuario, nombre: user.nombre, rol: user.rol, clientesIds: user.clientesIds || ['bcochile'] },
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
      usuario: {
        usuario,
        nombre: user.nombre,
        rol: user.rol,
        empresa: user.empresa || 'Kyndryl',
        haceOVT: user.haceOVT !== false,
        clientesIds: user.clientesIds || ['bcochile'],
        grupoServicioId: user.grupoServicioId || '',
        departamento: user.departamento || ''
      }
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
    const esAdmin = req.usuario.rol === 'admin';
    const esDpe = req.usuario.rol === 'dpe';
    if (!esAdmin && !esDpe) return res.status(403).json({ error: 'No tienes permisos' });

    // Cliente activo desde header — si viene, filtrar solo por ese cliente
    const clienteActivoId = req.headers['x-cliente-activo'] || '';

    const snapshot = await db.collection('usuarios').get();
    const usuariosList = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      const clientesUsuario = d.clientesIds || ['bcochile'];

      // Si viene cliente activo, mostrar solo usuarios de ese cliente
      if (clienteActivoId) {
        if (!clientesUsuario.includes(clienteActivoId)) return;
      } else if (esDpe) {
        // Sin cliente activo: DPE ve todos sus clientes
        const clientesDpe = req.usuario.clientesIds || [];
        const tieneAcceso = clientesDpe.some(c => clientesUsuario.includes(c));
        if (!tieneAcceso) return;
      }
      // Admin sin cliente activo: ve todos

      usuariosList.push({
        usuario: doc.id,
        nombre: d.nombre,
        rol: d.rol,
        departamento: d.departamento || '',
        empresa: d.empresa || 'Kyndryl',
        clientesIds: clientesUsuario,
        grupoServicioId: d.grupoServicioId || '',
        haceOVT: d.haceOVT !== false
      });
    });
    usuariosList.sort((a, b) => a.nombre.localeCompare(b.nombre));
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
    const esAdmin = req.usuario.rol === 'admin';
    const esDpe = req.usuario.rol === 'dpe';
    if (!esAdmin && !esDpe) return res.status(403).json({ error: 'No tienes permisos para crear usuarios' });

    const { usuario, nombre, rol, departamento, contrasena, empresa, clientesIds, grupoServicioId, haceOVT } = req.body;

    if (!usuario || !nombre || !contrasena) return res.status(400).json({ error: 'Faltan campos requeridos' });

    // DPE solo puede crear usuarios para sus clientes
    const clientesAsignados = clientesIds && Array.isArray(clientesIds) && clientesIds.length > 0
      ? clientesIds
      : (esDpe ? (req.usuario.clientesIds || ['bcochile']) : ['bcochile']);

    if (esDpe) {
      const clientesDpe = req.usuario.clientesIds || [];
      const sinAcceso = clientesAsignados.filter(c => !clientesDpe.includes(c));
      if (sinAcceso.length > 0) return res.status(403).json({ error: 'No tienes acceso a uno o más clientes indicados' });
    }

    const existente = await db.collection('usuarios').doc(usuario).get();
    if (existente.exists) return res.status(400).json({ error: 'Ese nombre de usuario ya existe' });

    await db.collection('usuarios').doc(usuario).set({
      nombre,
      contrasena,
      rol: rol || 'especialista',
      departamento: departamento || '',
      empresa: empresa || 'Kyndryl',
      clientesIds: clientesAsignados,
      grupoServicioId: grupoServicioId || '',
      haceOVT: haceOVT !== false
    });

    await db.collection('auditoria').add({
      accion: 'CREAR_USUARIO',
      usuarioAdminNombre: req.usuario.nombre,
      usuarioCreado: usuario,
      clientesIds: clientesAsignados,
      timestamp: new Date()
    });

    res.json({ success: true, message: `Usuario ${usuario} creado correctamente`, usuario: { usuario, nombre, rol: rol || 'especialista' } });
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
    const esAdmin = req.usuario.rol === 'admin';
    const esDpe = req.usuario.rol === 'dpe';
    if (!esAdmin && !esDpe) return res.status(403).json({ error: 'No tienes permisos para editar usuarios' });

    const { usuario, empresa, nombre, departamento, haceOVT, grupoServicioId, clientesIds, rol } = req.body;
    if (!usuario) return res.status(400).json({ error: 'Usuario requerido' });

    const userRef = db.collection('usuarios').doc(usuario);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Usuario no encontrado' });

    // DPE verifica que el usuario pertenece a sus clientes
    if (esDpe) {
      const clientesDpe = req.usuario.clientesIds || [];
      const clientesUsuario = userDoc.data().clientesIds || ['bcochile'];
      const tieneAcceso = clientesDpe.some(c => clientesUsuario.includes(c));
      if (!tieneAcceso) return res.status(403).json({ error: 'No tienes acceso a este usuario' });
      // DPE no puede cambiar rol a admin
      if (rol === 'admin') return res.status(403).json({ error: 'DPE no puede asignar rol admin' });
    }

    const cambios = {};
    if (empresa !== undefined) cambios.empresa = empresa;
    if (nombre !== undefined && nombre !== '') cambios.nombre = nombre;
    if (departamento !== undefined && departamento !== '') cambios.departamento = departamento;
    if (haceOVT !== undefined) cambios.haceOVT = Boolean(haceOVT);
    if (grupoServicioId !== undefined) cambios.grupoServicioId = grupoServicioId;
    if (clientesIds !== undefined && Array.isArray(clientesIds)) cambios.clientesIds = clientesIds;
    if (rol !== undefined) cambios.rol = rol;

    if (Object.keys(cambios).length === 0) return res.status(400).json({ error: 'No se enviaron campos para actualizar' });

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
    const rol = req.usuario.rol;
    let query = db.collection('registros');

    // Especialista: solo sus propios registros
    if (rol === 'especialista') {
      query = query.where('createdBy', '==', req.usuario.usuario);
    }

    const snapshot = await query.get();
    let registros = [];
    snapshot.forEach(doc => {
      registros.push({ id: doc.id, ...doc.data() });
    });

    // DPE: filtrar por el cliente activo enviado en el header
    if (rol === 'dpe') {
      const clienteActivoId = req.headers['x-cliente-activo'] || '';
      if (clienteActivoId) {
        const clienteDoc = await db.collection('clientes').doc(clienteActivoId).get();
        const nombreCliente = clienteDoc.exists ? clienteDoc.data().nombre : null;
        if (nombreCliente) {
          registros = registros.filter(r =>
            String(r.cliente || '').toLowerCase() === nombreCliente.toLowerCase()
          );
        } else {
          registros = [];
        }
      }
    }

    // TL: ve todos los registros (puede aprobar/rechazar)
    // No se aplica filtro adicional — mismo comportamiento que admin

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
    const esAdmin = req.usuario.rol === 'admin';
    const esDpe = req.usuario.rol === 'dpe';
    if (!esAdmin && !esDpe) return res.status(403).json({ error: 'Sin permisos' });

    const snap = await db.collection('claims_semanas').orderBy('fecha', 'asc').get();
    let semanas = [];
    snap.forEach(doc => semanas.push({ id: doc.id, ...doc.data() }));

    // Filtrar por clienteId guardado en cada semana (admin y DPE, según cliente activo)
    const clienteActivoId = req.headers['x-cliente-activo'] || '';
    if (clienteActivoId) {
      semanas = semanas.filter(s =>
        // Si no tiene clienteId, asumir bcochile (datos migrados antes del campo)
        (s.clienteId || 'bcochile') === clienteActivoId
      );
    }

    res.json(semanas);
  } catch (err) {
    console.error('Error GET /api/claims:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/claims/upload → recibe array de semanas procesadas, guarda solo las nuevas
app.post('/api/claims/upload', verificarToken, async (req, res) => {
  try {
    const esAdmin = req.usuario.rol === 'admin';
    const esDpe = req.usuario.rol === 'dpe';
    if (!esAdmin && !esDpe) return res.status(403).json({ error: 'Sin permisos' });

    const { semanas } = req.body;
    if (!Array.isArray(semanas) || semanas.length === 0) {
      return res.status(400).json({ error: 'No se recibieron semanas' });
    }

    // Determinar clienteId: DPE usa x-cliente-activo, admin usa 'bcochile' por defecto
    const clienteActivoId = req.headers['x-cliente-activo'] || 'bcochile';

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
        clienteId: clienteActivoId,
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

// DELETE /api/claims → limpiar las semanas del cliente activo (solo admin)
app.delete('/api/claims', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });

    const clienteActivoId = req.headers['x-cliente-activo'] || '';
    const snap = await db.collection('claims_semanas').get();
    const batch = db.batch();
    let borradas = 0;

    snap.forEach(doc => {
      const data = doc.data();
      // Si no hay cliente activo seleccionado, no borra nada (evita borrar todo por accidente)
      if (!clienteActivoId) return;
      if ((data.clienteId || 'bcochile') === clienteActivoId) {
        batch.delete(doc.ref);
        borradas++;
      }
    });

    if (!clienteActivoId) {
      return res.status(400).json({ error: 'No hay cliente activo seleccionado' });
    }

    await batch.commit();

    await db.collection('auditoria').add({
      accion: 'CLAIMS_DELETE',
      usuarioNombre: req.usuario.nombre,
      clienteId: clienteActivoId,
      semanasEliminadas: borradas,
      timestamp: new Date()
    });

    res.json({ message: `${borradas} semanas eliminadas (cliente: ${clienteActivoId})` });
  } catch (err) {
    console.error('Error DELETE /api/claims:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CLIENTES — CRUD
// ============================================

// Listar clientes (admin ve todos, DPE ve solo los suyos)
app.get('/api/clientes', verificarToken, async (req, res) => {
  try {
    const snap = await db.collection('clientes').get();
    const todos = [];
    snap.forEach(doc => todos.push({ id: doc.id, ...doc.data() }));
    if (req.usuario.rol === 'admin') return res.json(todos);
    // DPE: filtra por sus clientes
    const suyos = (req.usuario.clientesIds || []);
    res.json(todos.filter(c => suyos.includes(c.id)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Crear cliente (solo admin)
app.post('/api/clientes', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
    const { id, nombre } = req.body;
    if (!id || !nombre) return res.status(400).json({ error: 'id y nombre requeridos' });
    const existe = await db.collection('clientes').doc(id).get();
    if (existe.exists) return res.status(400).json({ error: 'Ya existe un cliente con ese ID' });
    await db.collection('clientes').doc(id).set({ nombre, activo: true, creadoEn: new Date() });
    res.json({ success: true, id, nombre });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// GRUPOS DE SERVICIO — CRUD
// ============================================

// Listar grupos (filtrados por clienteId)
app.get('/api/grupos-servicio', verificarToken, async (req, res) => {
  try {
    const { clienteId } = req.query;
    let query = db.collection('grupos_servicio').where('activo', '==', true);
    if (clienteId) query = query.where('clienteId', '==', clienteId);
    const snap = await query.get();
    const grupos = [];
    snap.forEach(doc => grupos.push({ id: doc.id, ...doc.data() }));
    grupos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    res.json(grupos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Crear grupo (admin o DPE de ese cliente)
app.post('/api/grupos-servicio', verificarToken, async (req, res) => {
  try {
    const { clienteId, nombre, descripcion } = req.body;
    if (!clienteId || !nombre) return res.status(400).json({ error: 'clienteId y nombre requeridos' });
    // Verificar permisos
    const esAdmin = req.usuario.rol === 'admin';
    const esDpe = req.usuario.rol === 'dpe' && (req.usuario.clientesIds || []).includes(clienteId);
    if (!esAdmin && !esDpe) return res.status(403).json({ error: 'Sin permisos para este cliente' });
    const ref = await db.collection('grupos_servicio').add({
      clienteId, nombre, descripcion: descripcion || '', activo: true, creadoEn: new Date(), creadoPor: req.usuario.nombre
    });
    res.json({ success: true, id: ref.id, nombre });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Editar grupo
app.patch('/api/grupos-servicio/:id', verificarToken, async (req, res) => {
  try {
    const esAdmin = req.usuario.rol === 'admin';
    const esDpe = req.usuario.rol === 'dpe';
    if (!esAdmin && !esDpe) return res.status(403).json({ error: 'Sin permisos' });

    const grupoDoc = await db.collection('grupos_servicio').doc(req.params.id).get();
    if (!grupoDoc.exists) return res.status(404).json({ error: 'Grupo no encontrado' });

    // DPE solo puede editar grupos de sus clientes
    if (esDpe) {
      const clientesDpe = req.usuario.clientesIds || [];
      if (!clientesDpe.includes(grupoDoc.data().clienteId)) {
        return res.status(403).json({ error: 'No tienes acceso a este grupo' });
      }
    }

    const { nombre, descripcion, activo } = req.body;
    const cambios = {};
    if (nombre !== undefined) cambios.nombre = nombre;
    if (descripcion !== undefined) cambios.descripcion = descripcion;
    if (activo !== undefined) cambios.activo = activo;
    await db.collection('grupos_servicio').doc(req.params.id).update(cambios);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/grupos-servicio/:id — admin y DPE (solo de sus clientes)
app.delete('/api/grupos-servicio/:id', verificarToken, async (req, res) => {
  try {
    const esAdmin = req.usuario.rol === 'admin';
    const esDpe = req.usuario.rol === 'dpe';
    if (!esAdmin && !esDpe) return res.status(403).json({ error: 'Sin permisos' });

    const grupoDoc = await db.collection('grupos_servicio').doc(req.params.id).get();
    if (!grupoDoc.exists) return res.status(404).json({ error: 'Grupo no encontrado' });

    // DPE solo puede eliminar grupos de sus clientes
    if (esDpe) {
      const clientesDpe = req.usuario.clientesIds || [];
      if (!clientesDpe.includes(grupoDoc.data().clienteId)) {
        return res.status(403).json({ error: 'No tienes acceso a este grupo' });
      }
    }

    // Verificar que no haya usuarios asignados a este grupo
    const usuariosConGrupo = await db.collection('usuarios')
      .where('grupoServicioId', '==', req.params.id).limit(1).get();
    if (!usuariosConGrupo.empty) {
      return res.status(400).json({ error: 'No se puede eliminar: hay usuarios asignados a este grupo. Reasigna los usuarios primero.' });
    }

    await db.collection('grupos_servicio').doc(req.params.id).delete();
    await db.collection('auditoria').add({
      accion: 'ELIMINAR_GRUPO',
      usuarioNombre: req.usuario.nombre,
      grupoId: req.params.id,
      grupoNombre: grupoDoc.data().nombre,
      timestamp: new Date()
    });
    res.json({ success: true, message: 'Grupo eliminado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// PERMISOS POR ROL — configuración de vistas
// Colección: permisos_roles (doc único: 'config')
// ============================================

const PERMISOS_DEFAULT = {
  admin:        { dashboard:true, analytics:true, 'ovt-proyectado':true, claim:true, usuarios:true, mantenedor:true, auditoria:true, registros:false, resumen:false, 'carga-excel':false, 'proyeccion-nueva':false, 'proyeccion-mis':false, 'permisos-roles':true },
  dpe:          { dashboard:true, analytics:true, 'ovt-proyectado':true, claim:true, usuarios:true, mantenedor:false, auditoria:false, registros:false, resumen:false, 'carga-excel':false, 'proyeccion-nueva':false, 'proyeccion-mis':false, 'permisos-roles':false },
  teamleader:   { dashboard:true, analytics:true, 'ovt-proyectado':false, claim:false, usuarios:false, mantenedor:false, auditoria:false, registros:false, resumen:false, 'carga-excel':false, 'proyeccion-nueva':false, 'proyeccion-mis':false, 'permisos-roles':false },
  especialista: { dashboard:false, analytics:false, 'ovt-proyectado':false, claim:false, usuarios:false, mantenedor:false, auditoria:false, registros:true, resumen:true, 'carga-excel':true, 'proyeccion-nueva':false, 'proyeccion-mis':false, 'permisos-roles':false },
  itsm:         { dashboard:false, analytics:false, 'ovt-proyectado':false, claim:false, usuarios:false, mantenedor:false, auditoria:false, registros:false, resumen:false, 'carga-excel':false, 'proyeccion-nueva':true, 'proyeccion-mis':true, 'permisos-roles':false },
};

// GET /api/permisos-roles — cualquier usuario autenticado puede leer
app.get('/api/permisos-roles', verificarToken, async (req, res) => {
  try {
    const doc = await db.collection('permisos_roles').doc('config').get();
    if (!doc.exists) {
      // Sembrar defaults si no existen
      await db.collection('permisos_roles').doc('config').set(PERMISOS_DEFAULT);
      return res.json(PERMISOS_DEFAULT);
    }
    res.json(doc.data());
  } catch (err) {
    console.error('Error GET /api/permisos-roles:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/permisos-roles — solo admin puede guardar
app.post('/api/permisos-roles', verificarToken, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo admin puede modificar permisos' });
    const permisos = req.body;
    if (!permisos || typeof permisos !== 'object') return res.status(400).json({ error: 'Payload inválido' });

    // Forzar que admin siempre tenga todo true
    Object.keys(permisos.admin || {}).forEach(k => { permisos.admin[k] = true; });

    await db.collection('permisos_roles').doc('config').set(permisos);

    await db.collection('auditoria').add({
      accion: 'EDITAR_PERMISOS_ROLES',
      usuarioAdminNombre: req.usuario.nombre,
      timestamp: new Date(),
      detalles: 'Configuración de permisos actualizada'
    });

    res.json({ success: true, message: 'Permisos actualizados correctamente' });
  } catch (err) {
    console.error('Error POST /api/permisos-roles:', err);
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
  console.log('✓ Multi-cliente: ACTIVO (clientes + grupos_servicio)');
  console.log('✓ Rol DPE: HABILITADO');
  console.log('==================================================');
  await inicializarUsuarios();
  await inicializarClientesYGrupos();
});
