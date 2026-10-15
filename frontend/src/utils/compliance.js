// Utilidades puras del módulo Compliance (sin React): parseo del inventario
// semanal (inventario_BCH.xlsx) y cálculos de cumplimiento. Están separadas
// del componente para poder probarlas con el Excel real fuera del navegador.

export const ENTIDADES = [
  { id: 'banco', label: 'Banco', hoja: 'CMDB Banco' },
  { id: 'banchile', label: 'Banchile', hoja: 'CMDB Banchile' }
];

// Columnas obligatorias del Excel
export const COLUMNAS_REQUERIDAS = [
  'Hostname', 'Tipo de Infraestructura', 'Capacidad Primaria', 'Hardening', 'Ubicación',
  'Clasificación', 'Ambiente', 'Estado Operativo', 'Adherencia de Hardening (%)',
  'Sistema operativo', 'Servicio de Negocio'
];
// Columnas opcionales (si faltan se avisa y el filtro correspondiente no tiene efecto).
// El CMDB trae "Capacidad Secundaría" con tilde: por eso las columnas se buscan sin tildes.
export const COLUMNAS_OPCIONALES = [
  ['cap2', 'Capacidad Secundaria'], ['adm1', 'Administración principal'], ['adm2', 'Administración secundaria']
];

export const ESTADOS_GESTION = ['Pendiente', 'En gestión', 'Escalado', 'Excepción', 'Resuelto'];

// Filtros de la vista (cada uno: { inc:[valores permitidos], exc:[valores descartados] })
export const FILTROS_CLAVES = ['tipo', 'cap', 'cap2', 'clas', 'hard', 'est', 'ubi'];
// Definición de la mirada Kyndryl (mismo formato)
export const KYNDRYL_CLAVES = ['adm1', 'adm2', 'ubi'];
// Partes de la definición de Kyndryl que son FIJAS (solo lectura, siempre "Todos") en cada hoja.
// En Banchile Kyndryl se define solo por Ubicación (el universo sin GCP); en Banco todo es editable.
export const KYNDRYL_FIJOS = { banchile: ['adm1', 'adm2'] };
export const kyndrylFijo = (entidad, clave) => (KYNDRYL_FIJOS[entidad] || []).includes(clave);

export const NOMBRE_CAMPO = {
  tipo: 'Tipo de Infraestructura', cap: 'Capacidad Primaria', cap2: 'Capacidad Secundaria', clas: 'Clasificación',
  hard: 'Hardening', est: 'Estado Operativo', ubi: 'Ubicación', adm1: 'Administración principal', adm2: 'Administración secundaria'
};

const txt = (v) => String(v === undefined || v === null ? '' : v).trim();
export const norm = (v) => txt(v).toUpperCase();
const sinTildes = (s) => txt(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

// "0,98" → 98 · 0.98 → 98 · 98 → 98 · vacío → null
export function parsePct(v) {
  if (v === undefined || v === null) return null;
  let n = v;
  if (typeof n === 'string') {
    const s = n.trim().replace('%', '').replace(',', '.');
    if (s === '') return null;
    n = Number(s);
  }
  if (typeof n !== 'number' || !isFinite(n)) return null;
  const pct = n <= 1.5 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

// Clave estable de un host para guardar su gestión (misma regla que el backend)
export function claveHost(h) {
  return txt(h).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 150);
}

// Lee el workbook (SheetJS) y lo deja compacto: cada hoja → { dict, rows }.
// Fila = [host, tipo, cap, hard, ubi, clas, amb, est, so, svc, adh, cap2, adm1, adm2]
// donde los textos repetidos van como índices a `dict` y adh es 0-100 (-1 = vacío).
export function parsearInventario(XLSX, buffer) {
  // Siempre como Uint8Array: SheetJS no detecta bien un ArrayBuffer que venga de otro contexto
  const datos = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const wb = XLSX.read(datos, { type: 'array' });
  const entidades = {};
  const resumen = {};
  const advertencias = [];
  const campos = [
    ['tipo', 'Tipo de Infraestructura', norm], ['cap', 'Capacidad Primaria', norm],
    ['hard', 'Hardening', norm], ['ubi', 'Ubicación', norm], ['clas', 'Clasificación', norm],
    ['amb', 'Ambiente', norm], ['est', 'Estado Operativo', norm],
    ['so', 'Sistema operativo', txt], ['svc', 'Servicio de Negocio', txt]
  ];

  ENTIDADES.forEach(ent => {
    const nombreHoja = wb.SheetNames.find(n => norm(n) === norm(ent.hoja));
    if (!nombreHoja) { advertencias.push(`No se encontró la hoja "${ent.hoja}"`); return; }
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { defval: '' });
    if (filas.length === 0) { advertencias.push(`La hoja "${ent.hoja}" está vacía`); return; }
    const cols = Object.keys(filas[0]);
    const faltan = COLUMNAS_REQUERIDAS.filter(c => !cols.includes(c));
    if (faltan.length > 0) throw new Error(`En la hoja "${nombreHoja}" faltan las columnas: ${faltan.join(', ')}`);
    // columnas opcionales, buscadas sin importar tildes ni mayúsculas
    const colDe = {};
    COLUMNAS_OPCIONALES.forEach(([k, nombre]) => {
      colDe[k] = cols.find(c => sinTildes(c) === sinTildes(nombre)) || null;
      if (!colDe[k]) advertencias.push(`La hoja "${nombreHoja}" no tiene la columna "${nombre}": ese filtro no tendrá efecto`);
    });

    const dict = {};
    const indice = {};
    [...campos.map(c => c[0]), ...COLUMNAS_OPCIONALES.map(c => c[0])].forEach(k => { dict[k] = []; indice[k] = new Map(); });
    const idxDe = (k, valor) => {
      if (!indice[k].has(valor)) { indice[k].set(valor, dict[k].length); dict[k].push(valor); }
      return indice[k].get(valor);
    };

    const rows = [];
    filas.forEach(f => {
      const host = txt(f['Hostname']);
      if (!host) return; // sin hostname no se puede gestionar ni contar
      const adh = parsePct(f['Adherencia de Hardening (%)']);
      rows.push([
        host, ...campos.map(([k, col, fn]) => idxDe(k, fn(f[col]))), adh === null ? -1 : adh,
        ...COLUMNAS_OPCIONALES.map(([k]) => idxDe(k, colDe[k] ? norm(f[colDe[k]]) : ''))
      ]);
    });
    entidades[ent.id] = { dict, rows };
    resumen[ent.id] = { filas: rows.length, sinHostname: filas.length - rows.length };
  });

  if (Object.keys(entidades).length === 0) {
    throw new Error('El archivo no tiene las hojas "CMDB Banco" ni "CMDB Banchile"');
  }
  return { entidades, resumen, advertencias };
}

// {dict, rows} → filas como objetos fáciles de filtrar. Las cargas antiguas (11 columnas,
// sin Capacidad Secundaria ni Administración) se leen igual, con esos campos vacíos.
export function decodificar({ dict, rows }) {
  const d = (k, i) => (dict[k] && i !== undefined && dict[k][i] !== undefined ? dict[k][i] : '');
  return rows.map(r => ({
    host: r[0], tipo: dict.tipo[r[1]], cap: dict.cap[r[2]], hard: dict.hard[r[3]],
    ubi: dict.ubi[r[4]], clas: dict.clas[r[5]], amb: dict.amb[r[6]], est: dict.est[r[7]],
    so: dict.so[r[8]], svc: dict.svc[r[9]], adh: r[10] < 0 ? null : r[10],
    cap2: d('cap2', r[11]), adm1: d('adm1', r[12]), adm2: d('adm2', r[13])
  }));
}
// ¿esta carga trae las columnas agregadas después (Capacidad Secundaria / Administración)?
export const cargaCompleta = (dict) => !!(dict && dict.cap2 && dict.adm1 && dict.adm2);

// Un filtro { inc, exc } deja pasar un valor si está en `inc` (cuando hay lista) y no está en `exc`
const pasa = (f, v) => {
  if (!f) return true;
  const inc = f.inc || [];
  const exc = f.exc || [];
  return (inc.length === 0 || inc.includes(v)) && !exc.includes(v);
};
export const filtroActivo = (f) => !!f && ((f.inc && f.inc.length > 0) || (f.exc && f.exc.length > 0));
export const filtroVacio = () => ({ inc: [], exc: [] });

export function aplicarFiltros(rows, filtros) {
  return rows.filter(r => FILTROS_CLAVES.every(k => pasa(filtros[k], r[k])));
}

// Kyndryl = el universo restringido por su definición (ej. Administración secundaria = KYNDRYL,
// o Ubicación sin GCP). Una definición vacía deja pasar todo.
export const esKyndryl = (r, kyndril) => KYNDRYL_CLAVES.every(k => pasa(kyndril && kyndril[k], r[k]));
export const kyndrylDefinido = (kyndril) => KYNDRYL_CLAVES.some(k => filtroActivo(kyndril && kyndril[k]));
export function describirKyndryl(kyndril) {
  const partes = [];
  KYNDRYL_CLAVES.forEach(k => {
    const f = kyndril && kyndril[k];
    if (f && f.inc && f.inc.length) partes.push(`${NOMBRE_CAMPO[k]}: ${f.inc.join(', ')}`);
    if (f && f.exc && f.exc.length) partes.push(`${NOMBRE_CAMPO[k]} sin ${f.exc.join(', ')}`);
  });
  return partes.length ? partes.join(' · ') : 'Global (sin definición de Kyndryl)';
}

const acum = () => ({ total: 0, cumple: 0, suma: 0, sinDato: 0 });
const sumar = (a, r, umbral) => {
  a.total += 1;
  if (r.adh === null) a.sinDato += 1; else { a.suma += r.adh; if (r.adh >= umbral) a.cumple += 1; }
};
const cerrar = (a) => ({
  total: a.total, cumple: a.cumple, noCumple: a.total - a.cumple, sinDato: a.sinDato,
  score: a.total ? a.suma / a.total : null // vacío cuenta como 0
});

// Cumple = adherencia >= umbral. Kyndryl = el universo que cumple la definición de Kyndryl.
export function calcularVista(rows, umbral, kyndril) {
  const g = { t: acum(), p: acum(), n: acum() };
  const k = { t: acum(), p: acum(), n: acum() };
  rows.forEach(r => {
    const esProd = r.clas === 'PRODUCCION';
    sumar(g.t, r, umbral); sumar(esProd ? g.p : g.n, r, umbral);
    if (esKyndryl(r, kyndril)) { sumar(k.t, r, umbral); sumar(esProd ? k.p : k.n, r, umbral); }
  });
  const fin = (x) => ({ total: cerrar(x.t), prod: cerrar(x.p), noProd: cerrar(x.n) });
  return { global: fin(g), kyndryl: fin(k) };
}

// Servidores a gestionar: sin adherencia o por debajo del umbral (sin dato primero, luego menor adherencia)
export function listaGestion(rows, umbral) {
  return rows
    .filter(r => r.adh === null || r.adh < umbral)
    .sort((a, b) => ((a.adh === null ? -1 : a.adh) - (b.adh === null ? -1 : b.adh)) || a.host.localeCompare(b.host));
}

export function opcionesDe(rows, campo) {
  const conteo = new Map();
  rows.forEach(r => conteo.set(r[campo], (conteo.get(r[campo]) || 0) + 1));
  return Array.from(conteo.entries()).map(([valor, n]) => ({ valor, n })).sort((a, b) => b.n - a.n);
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function lunesDe(fecha = new Date()) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return aISO(d);
}
export function etiquetaSemana(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const ini = new Date(y, m - 1, d);
  const fin = new Date(y, m - 1, d + 6);
  const dd = (x) => String(x.getDate()).padStart(2, '0');
  return ini.getMonth() === fin.getMonth()
    ? `${dd(ini)}–${dd(fin)} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`
    : `${dd(ini)} ${MESES[ini.getMonth()]} – ${dd(fin)} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`;
}
