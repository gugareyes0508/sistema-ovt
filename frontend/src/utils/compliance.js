// Utilidades puras del módulo Compliance (sin React): parseo del inventario
// semanal (inventario_BCH.xlsx) y cálculos de cumplimiento. Están separadas
// del componente para poder probarlas con el Excel real fuera del navegador.

export const ENTIDADES = [
  { id: 'banco', label: 'Banco', hoja: 'CMDB Banco' },
  { id: 'banchile', label: 'Banchile', hoja: 'CMDB Banchile' }
];

export const COLUMNAS_REQUERIDAS = [
  'Hostname', 'Tipo de Infraestructura', 'Capacidad Primaria', 'Hardening', 'Ubicación',
  'Clasificación', 'Ambiente', 'Estado Operativo', 'Adherencia de Hardening (%)',
  'Sistema operativo', 'Servicio de Negocio'
];

export const ESTADOS_GESTION = ['Pendiente', 'En gestión', 'Escalado', 'Excepción', 'Resuelto'];
export const ESTADOS_BAJA = ['DE BAJA', 'DECOMISADA', 'PROCESO DE BAJA', 'TERMINATED'];

const txt = (v) => String(v === undefined || v === null ? '' : v).trim();
export const norm = (v) => txt(v).toUpperCase();

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
// Fila = [host, tipo, cap, hard, ubi, clas, amb, est, so, svc, adh] donde los
// textos repetidos van como índices a `dict` y adh es 0-100 (-1 = vacío).
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

    const dict = {};
    const indice = {};
    campos.forEach(([k]) => { dict[k] = []; indice[k] = new Map(); });
    const idxDe = (k, valor) => {
      if (!indice[k].has(valor)) { indice[k].set(valor, dict[k].length); dict[k].push(valor); }
      return indice[k].get(valor);
    };

    const rows = [];
    filas.forEach(f => {
      const host = txt(f['Hostname']);
      if (!host) return; // sin hostname no se puede gestionar ni contar
      const adh = parsePct(f['Adherencia de Hardening (%)']);
      rows.push([host, ...campos.map(([k, col, fn]) => idxDe(k, fn(f[col]))), adh === null ? -1 : adh]);
    });
    entidades[ent.id] = { dict, rows };
    resumen[ent.id] = { filas: rows.length, sinHostname: filas.length - rows.length };
  });

  if (Object.keys(entidades).length === 0) {
    throw new Error('El archivo no tiene las hojas "CMDB Banco" ni "CMDB Banchile"');
  }
  return { entidades, resumen, advertencias };
}

// {dict, rows} → filas como objetos fáciles de filtrar
export function decodificar({ dict, rows }) {
  return rows.map(r => ({
    host: r[0], tipo: dict.tipo[r[1]], cap: dict.cap[r[2]], hard: dict.hard[r[3]],
    ubi: dict.ubi[r[4]], clas: dict.clas[r[5]], amb: dict.amb[r[6]], est: dict.est[r[7]],
    so: dict.so[r[8]], svc: dict.svc[r[9]], adh: r[10] < 0 ? null : r[10]
  }));
}

const coincide = (lista, valor) => !lista || lista.length === 0 || lista.includes(valor);

// filtros: { tipo:[], cap:[], hard:[], ubi:[], excluirBajas:bool } — lista vacía = todos
export function aplicarFiltros(rows, filtros) {
  return rows.filter(r =>
    coincide(filtros.tipo, r.tipo) && coincide(filtros.cap, r.cap) && coincide(filtros.hard, r.hard) && coincide(filtros.ubi, r.ubi) &&
    (!filtros.excluirBajas || !ESTADOS_BAJA.includes(r.est))
  );
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

// Cumple = adherencia >= umbral. Kyndryl = el mismo universo sin las ubicaciones excluidas.
export function calcularVista(rows, umbral, kyndrylExcluye) {
  const g = { t: acum(), p: acum(), n: acum() };
  const k = { t: acum(), p: acum(), n: acum() };
  const excl = kyndrylExcluye || [];
  rows.forEach(r => {
    const esProd = r.clas === 'PRODUCCION';
    sumar(g.t, r, umbral); sumar(esProd ? g.p : g.n, r, umbral);
    if (!excl.includes(r.ubi)) { sumar(k.t, r, umbral); sumar(esProd ? k.p : k.n, r, umbral); }
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

// Kyndryl = el universo sin las ubicaciones excluidas (GCP por defecto)
export const esKyndryl = (r, kyndrylExcluye) => !(kyndrylExcluye || []).includes(r.ubi);

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
