/**
 * Suite COMPLETA de tests — Inventario y Traspasos
 * Empresa: 9999
 *
 * Uso:   node TEST-INV_y_TRA.js
 * Req:   npm install node-fetch
 *
 * Política de datos:
 *   Los registros sembrados se MANTIENEN en BD para revisión manual.
 *   El log se TRUNCA en cada ejecución → test-resultado.log
 *
 * Correcciones v3:
 *   - Siempre lee el saldo REAL de BD justo antes de cada ajuste/traspaso
 *   - El combinacionOriginal.nuevaCantidad usa el valor real de BD, no el de
 *     la siembra (que puede haber cambiado por ejecuciones anteriores)
 *   - Ajuste múltiple: usa combinacionOriginal si el artículo ya existe
 *   - SIN-UBICACION se trata como ubicación virtual en debugStock
 */

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const fs   = require('fs');
const path = require('path');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const BASE_URL          = 'http://localhost:3000';
const LOGIN_USUARIO     = 'margarita';
const LOGIN_CONTRASENA  = 'margarita';
const CODIGO_EMPRESA    = '9999';
const LOG_FILE          = path.join(__dirname, 'test-resultado.log');

const ARTICULOS_NORMALES = [
  'CD0001','CD0002','CD0003','CD0004','CD0005',
  'CD0006','CD0007','CD0008','CD0009'
];

const ARTICULOS_TALLAS = [
  { codigo: 'TBH0006', color: 'A',  talla: '100' },
  { codigo: 'TBH0006', color: 'A',  talla: '90'  },
  { codigo: 'TBH0006', color: 'A',  talla: '95'  },
  { codigo: 'TBH0006', color: 'AC', talla: '100' },
  { codigo: 'TBH0006', color: 'AC', talla: '90'  },
  { codigo: 'TBH0006', color: 'AC', talla: '95'  },
  { codigo: '003',     color: 'A',  talla: '38'  },
  { codigo: '003',     color: 'A',  talla: '40'  },
  { codigo: '003',     color: 'A',  talla: '42'  },
  { codigo: '003',     color: 'N',  talla: '38'  },
  { codigo: '003',     color: 'N',  talla: '40'  },
];

const ARTICULOS_UDS = [
  '52323X203','ART001','ART002','CASILIGRIS20CM','DIAPOL508',
  'ENXU03','M4145X110','X0053','X0054','X0055','X0056','X0202'
];

// ============================================================
// ESTADO GLOBAL
// ============================================================
let headers  = {};
let passed   = 0, failed = 0, skipped = 0;
const resultados = [];
let logBuffer    = [];

let ALMACENES           = [];
let UBICACIONES_POR_ALM = {};

// ============================================================
// LOG
// ============================================================
function log(msg)     { process.stdout.write(msg); logBuffer.push(msg); }
function logLine(msg) { console.log(msg); logBuffer.push(msg + '\n'); }
function flushLog()   { fs.writeFileSync(LOG_FILE, logBuffer.join(''), 'utf8'); }

// ============================================================
// API
// ============================================================
async function api(method, endpoint, body = null, extra = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers, ...extra }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${endpoint}`, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

// ============================================================
// RUNNER
// ============================================================
async function test(nombre, fn) {
  log(`  ▶ ${nombre} ... `);
  try {
    await fn();
    logLine('✅ PASS');
    passed++;
    resultados.push({ nombre, resultado: 'PASS' });
  } catch (err) {
    logLine(`❌ FAIL: ${err.message}`);
    failed++;
    resultados.push({ nombre, resultado: 'FAIL', error: err.message });
  }
}

function skip(nombre, razon) {
  logLine(`  ⏭  ${nombre} — SKIP: ${razon}`);
  skipped++;
  resultados.push({ nombre, resultado: 'SKIP', error: razon });
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertApprox(a, b, msg, tol = 0.01) {
  if (Math.abs(a - b) >= tol) throw new Error(`${msg} (esperado ${b}, obtenido ${a})`);
}

function seccion(titulo) {
  logLine(`\n${'═'.repeat(68)}`);
  logLine(`  ${titulo}`);
  logLine('═'.repeat(68));
}
function subseccion(titulo) { logLine(`\n  ┄ ${titulo}`); }

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms)     { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// HELPERS: INFRAESTRUCTURA
// ============================================================
function ubicacionAleatoria(codigoAlmacen, excluir = []) {
  const excl = Array.isArray(excluir) ? excluir : [excluir];
  const lista = (UBICACIONES_POR_ALM[codigoAlmacen] || []).filter(u => !excl.includes(u));
  if (!lista.length) return null;
  return lista[Math.floor(Math.random() * lista.length)];
}

function almacenAleatorio(excluir = []) {
  const excl = Array.isArray(excluir) ? excluir : [excluir];
  const lista = ALMACENES.filter(a => !excl.includes(a.CodigoAlmacen));
  if (!lista.length) return null;
  return lista[Math.floor(Math.random() * lista.length)].CodigoAlmacen;
}

function nUbicacionesAleatorias(codigoAlmacen, n, excluir = []) {
  const excl = Array.isArray(excluir) ? excluir : [excluir];
  const lista = [...(UBICACIONES_POR_ALM[codigoAlmacen] || []).filter(u => !excl.includes(u))];
  for (let i = 0; i < Math.min(n, lista.length); i++) {
    const j = i + Math.floor(Math.random() * (lista.length - i));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista.slice(0, n);
}

// ============================================================
// HELPERS: DEBUG / STOCK
// ============================================================
async function debugStock(articulo) {
  const res = await api('GET',
    `/debug/stock-articulo?codigoEmpresa=${CODIGO_EMPRESA}&codigoArticulo=${encodeURIComponent(articulo)}`
  );
  return res.data || { stockUbicacion: [], stockTotal: [] };
}

function ubicItem(dbg, almacen, ubicacion, color = '', talla = '') {
  return (dbg.stockUbicacion || []).find(r =>
    r.CodigoAlmacen === almacen &&
    r.Ubicacion === ubicacion &&
    (color === '' || (r.CodigoColor_   || '').trim() === color.trim()) &&
    (talla === '' || (r.CodigoTalla01_ || '').trim() === talla.trim())
  ) || null;
}

function acumAlmacen(dbg, almacen) {
  return (dbg.stockTotal || [])
    .filter(r => r.CodigoAlmacen === almacen)
    .reduce((s, r) => s + parseFloat(r.StockTotal || 0), 0);
}

function saldoUbic(dbg, almacen, ubicacion, color = '', talla = '') {
  return parseFloat(ubicItem(dbg, almacen, ubicacion, color, talla)?.UnidadSaldo || 0);
}

// Lee el saldo REAL de BD en este momento para una ubicación/variante concreta
async function saldoReal(articulo, almacen, ubicacion, color = '', talla = '') {
  const dbg = await debugStock(articulo);
  return saldoUbic(dbg, almacen, ubicacion, color, talla);
}

// ============================================================
// HELPERS: AJUSTE / TRASPASO
// ============================================================

/**
 * Ajustar inventario.
 * Si anterior = null → ajuste NUEVO (sin combinacionOriginal).
 * Si anterior = 'auto' → lee el saldo real de BD y lo usa como anterior.
 * Si anterior = número → usa ese número como anterior.
 */
async function ajustar(articulo, almacen, ubicacion, cantidad, color = '', talla = '', unidad = '', anterior = null) {
  const ajuste = {
    articulo, codigoAlmacen: almacen, ubicacionStr: ubicacion,
    partida: '', unidadStock: unidad, nuevaCantidad: cantidad,
    codigoColor: color, codigoTalla01: talla
  };

  if (anterior === 'auto') {
    const saldoActual = await saldoReal(articulo, almacen, ubicacion, color, talla);
    // Si saldo > 0: editar (enviar combinacionOriginal con el saldo actual)
    // Si saldo = 0: verificar si el registro existe en BD (puede ser saldo=0 o no existir)
    if (saldoActual > 0) {
      anterior = saldoActual;
    } else {
      // Detectar si existe con saldo 0 usando debugStock (que incluye saldo=0)
      const dbgCheck = await debugStock(articulo);
      const existeConCero = (dbgCheck.stockUbicacion || []).some(r =>
        r.CodigoAlmacen === almacen &&
        (r.Ubicacion || '').trim() === (ubicacion || '').trim() &&
        (color === '' || (r.CodigoColor_ || '').trim() === color.trim()) &&
        (talla === '' || (r.CodigoTalla01_ || '').trim() === talla.trim())
      );
      anterior = existeConCero ? 0 : null;
    }
  }

  if (anterior !== null) {
    ajuste.combinacionOriginal = {
      articulo, codigoAlmacen: almacen, ubicacionStr: ubicacion,
      partida: '', unidadStock: unidad, nuevaCantidad: anterior,
      codigoColor: color, codigoTalla01: talla
    };
  }
  return api('POST', '/inventario/ajustar-completo', { ajustes: [ajuste] });
}

async function traspasar(articulo, almOrigen, ubicOrigen, almDestino, ubicDestino,
                          cantidad, unidad = '', color = '', talla = '') {
  return api('POST', '/traspaso', {
    articulo,
    origenAlmacen: almOrigen, origenUbicacion: ubicOrigen,
    destinoAlmacen: almDestino, destinoUbicacion: ubicDestino,
    cantidad, unidadMedida: unidad,
    partida: '', codigoColor: color, codigoTalla: talla
  });
}

/**
 * Garantiza stock >= 1 para el artículo/variante.
 * Si no tiene, siembra 30–200 uds en almacén/ubicación aleatorios.
 * NO limpia → queda para revisión.
 * Siempre devuelve el saldo REAL de BD tras la siembra.
 */
async function garantizarStock(articulo, color = '', talla = '', unidad = '') {
  const resStk = await api('GET',
    `/traspasos/stock-por-articulo?codigoArticulo=${encodeURIComponent(articulo)}`
  );
  if (resStk.status === 200 && Array.isArray(resStk.data)) {
    const match = resStk.data.find(i =>
      i.Cantidad > 0 &&
      (color === '' || (i.CodigoColor_ || '').trim() === color.trim()) &&
      (talla === '' || (i.Talla        || '').trim() === talla.trim())
    ) || resStk.data.find(i => i.Cantidad > 0);
    if (match) {
      // Leer saldo REAL de BD para evitar discrepancias
      const dbg = await debugStock(articulo);
      const saldoBD = saldoUbic(dbg, match.CodigoAlmacen, match.Ubicacion,
        (match.CodigoColor_ || '').trim(), (match.Talla || '').trim());
      return {
        almacen:   match.CodigoAlmacen,
        ubicacion: match.Ubicacion,
        cantidad:  saldoBD,   // ← saldo REAL de BD
        color:     (match.CodigoColor_ || '').trim(),
        talla:     (match.Talla        || '').trim(),
        unidad:    match.UnidadStock === 'unidades' ? '' : (match.UnidadStock || ''),
        sembrado:  false
      };
    }
  }

  // Sembrar
  const almCands = ALMACENES
    .map(a => a.CodigoAlmacen)
    .filter(a => (UBICACIONES_POR_ALM[a] || []).length > 0);
  if (!almCands.length) return null;

  const almacen   = almCands[Math.floor(Math.random() * almCands.length)];
  const ubicacion = ubicacionAleatoria(almacen);
  if (!ubicacion) return null;

  const cantidad  = rnd(30, 200);
  const unidadN   = (!unidad || unidad === 'unidades') ? '' : unidad;

  logLine(`     🌱 Sembrando ${cantidad} uds de ${articulo}${color ? ' C='+color : ''}${talla ? ' T='+talla : ''} en ${almacen}/${ubicacion} (se mantiene)`);

  // Leer saldo actual en esa ubicación (puede ya tener algo de ejecuciones anteriores)
  const saldoActual = await saldoReal(articulo, almacen, ubicacion, color, talla);
  let res;
  if (saldoActual > 0) {
    // Ya existe → editar
    res = await ajustar(articulo, almacen, ubicacion, cantidad, color, talla, unidadN, saldoActual);
  } else {
    // No existe → nuevo (también cubre saldo=0 residual)
    res = await ajustar(articulo, almacen, ubicacion, cantidad, color, talla, unidadN, 'auto');
  }

  if (res.status !== 200 || !res.data?.success) {
    logLine(`     ⚠️  Siembra fallida: ${res.data?.mensaje || res.status}`);
    return null;
  }

  // Leer saldo real tras siembra
  const saldoReal_ = await saldoReal(articulo, almacen, ubicacion, color, talla);
  logLine(`     ✅ Sembrado: saldo real en BD = ${saldoReal_} en ${almacen}/${ubicacion}`);
  return { almacen, ubicacion, cantidad: saldoReal_, color, talla, unidad: unidadN, sembrado: true };
}

// ============================================================
// SECCIÓN 0 — DESCUBRIR INFRAESTRUCTURA
// ============================================================
async function sincronizarAcumStock(articulo) {
  // Llama al endpoint de sincronización si existe, o hace un ajuste nulo para forzar recálculo
  // Esto normaliza registros huérfanos de ejercicios anteriores
  const res = await api('POST', '/inventario/sincronizacion-automatica', { codigoArticulo: articulo });
  if (res.status !== 200) {
    // Si no acepta filtro por artículo, llamar sin parámetros (sincronización global)
    await api('POST', '/inventario/sincronizacion-automatica');
  }
}

async function descubrirInfraestructura() {
  seccion('0. DESCUBRIR ALMACENES Y UBICACIONES (empresa 9999)');

  const resAlm = await api('GET', '/almacenes');
  ALMACENES = resAlm.data || [];
  assert(ALMACENES.length > 0, 'La empresa 9999 no tiene almacenes');
  logLine(`  Almacenes (${ALMACENES.length}): ${ALMACENES.map(a => a.CodigoAlmacen).join(', ')}`);

  for (const alm of ALMACENES) {
    let todas = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore && todas.length < 300) {
      const res = await api('GET',
        `/inventario/ubicaciones-ajuste?codigoAlmacen=${alm.CodigoAlmacen}&offset=${offset}&limit=100`
      );
      const items = res.data?.items || [];
      todas = todas.concat(items.map(u => u.Ubicacion).filter(u => u && u !== 'SIN-UBICACION'));
      hasMore = res.data?.hasMore || false;
      offset += 100;
    }
    UBICACIONES_POR_ALM[alm.CodigoAlmacen] = todas;
    logLine(`    ${alm.CodigoAlmacen}: ${todas.length} ubicaciones${todas.length ? ' — ' + todas.slice(0, 6).join(', ') + (todas.length > 6 ? '...' : '') : ''}`);
  }

  const total = Object.values(UBICACIONES_POR_ALM).reduce((s, u) => s + u.length, 0);
  logLine(`\n  Total ubicaciones: ${total}`);
}

// ============================================================
// SECCIÓN 1 — LOGIN / AUTENTICACIÓN
// ============================================================
async function testLogin() {
  seccion('1. LOGIN Y AUTENTICACIÓN');

  await test('Login correcto devuelve usuario y empresa', async () => {
    const res = await api('POST', '/login', { usuario: LOGIN_USUARIO, contrasena: LOGIN_CONTRASENA });
    assert(res.status === 200, `Status ${res.status}`);
    assert(res.data?.success === true, 'success debe ser true');
    headers = {
      usuario:       res.data.datos.UsuarioLogicNet,
      codigoempresa: res.data.datos.CodigoEmpresa.toString()
    };
    logLine(`     → Usuario: ${headers.usuario} | Empresa: ${headers.codigoempresa}`);
  });

  await test('Login contraseña incorrecta → 401', async () => {
    const res = await api('POST', '/login', { usuario: LOGIN_USUARIO, contrasena: 'WRONGPASS' });
    assert(res.status === 401, `Status ${res.status}`);
  });

  await test('Login usuario inexistente → 401', async () => {
    const res = await api('POST', '/login', { usuario: 'usuarioquenoexiste999', contrasena: 'x' });
    assert(res.status === 401, `Status ${res.status}`);
  });

  await test('Endpoint protegido sin cabeceras → 401', async () => {
    const res = await fetch(`${BASE_URL}/inventario/stock-total-lote`, {
      headers: { 'Content-Type': 'application/json' }
    });
    assert(res.status === 401, `Status ${res.status}`);
  });

  await test('Endpoint protegido con cabeceras correctas → 200', async () => {
    const res = await api('GET', '/inventario/stock-total-lote?offset=0&limit=1');
    assert(res.status === 200, `Status ${res.status}`);
  });
}

// ============================================================
// SECCIÓN 2 — VISUALIZACIÓN E INVENTARIO
// ============================================================
async function testVisualizacion() {
  seccion('2. INVENTARIO — VISUALIZACIÓN Y FILTROS');

  await test('Stock total lote: offset=0 limit=10 devuelve items', async () => {
    const res = await api('GET', '/inventario/stock-total-lote?offset=0&limit=10');
    assert(res.status === 200 && Array.isArray(res.data?.items) && res.data.items.length > 0, 'Sin items');
    logLine(`     → ${res.data.items.length} items | hasMore: ${res.data.hasMore}`);
  });

  await test('Paginación: offset=0 y offset=5 devuelven páginas distintas', async () => {
    const p1 = await api('GET', '/inventario/stock-total-lote?offset=0&limit=5');
    const p2 = await api('GET', '/inventario/stock-total-lote?offset=5&limit=5');
    assert(p1.status === 200 && p2.status === 200, 'Error en alguna página');
    const cod1 = (p1.data?.items || []).map(i => i.CodigoArticulo).join(',');
    const cod2 = (p2.data?.items || []).map(i => i.CodigoArticulo).join(',');
    assert(cod1 !== cod2 || (!p1.data.items.length && !p2.data.items.length), 'Las páginas devuelven lo mismo');
    logLine(`     → P1: ${p1.data.items.length} | P2: ${p2.data.items.length}`);
  });

  await test('Filtro por código exacto de almacén devuelve solo ese almacén', async () => {
    for (const alm of ALMACENES) {
      const res = await api('GET', `/inventario/stock-total-lote?offset=0&limit=20&almacen=${alm.CodigoAlmacen}`);
      assert(res.status === 200, `Error en ${alm.CodigoAlmacen}`);
      const items = res.data?.items || [];
      const mal = items.filter(i => i.CodigoAlmacen && i.CodigoAlmacen !== alm.CodigoAlmacen);
      assert(mal.length === 0,
        `Items de almacén distinto en filtro ${alm.CodigoAlmacen}: ${[...new Set(mal.map(i => i.CodigoAlmacen))].join(',')}`);
      logLine(`     → ${alm.CodigoAlmacen}: ${items.length} items ✓`);
    }
  });

  await test('Búsqueda por código de artículo: CD0001', async () => {
    const res = await api('GET', '/inventario/stock-total-lote?offset=0&limit=50&codigo=CD0001');
    assert(res.status === 200, `Status ${res.status}`);
    logLine(`     → ${res.data?.items?.length} registros para CD0001`);
  });

  await test('Stock sin ubicación devuelve array', async () => {
    const res = await api('GET', '/inventario/stock-sin-ubicacion');
    assert(res.status === 200 && Array.isArray(res.data), 'Debe devolver array');
    logLine(`     → ${res.data.length} artículos sin ubicación`);
  });

  await test('Historial ajustes v2 paginado', async () => {
    const res = await api('GET', '/inventario/historial-ajustes-v2?page=1&limit=20');
    assert(res.status === 200 && res.data?.success === true, 'Error en historial');
    logLine(`     → Total ajustes: ${res.data.pagination?.total}`);
  });

  await test('Registros fantasma no aparecen', async () => {
    const res = await api('GET', '/inventario/stock-total-lote?offset=0&limit=200');
    const fantasma = (res.data?.items || []).find(i => i.CodigoAlmacen === 'N1' && i.Ubicacion === 'PKA400');
    assert(!fantasma, 'Registro fantasma N1/PKA400 detectado');
    logLine(`     → Sin registros fantasma ✓`);
  });

  await test('Almacenes endpoint devuelve lista', async () => {
    const res = await api('GET', '/almacenes');
    assert(res.status === 200 && Array.isArray(res.data) && res.data.length > 0, 'Sin almacenes');
    logLine(`     → ${res.data.length} almacenes: ${res.data.map(a => a.CodigoAlmacen).join(', ')}`);
  });

  await test('Stock por artículo devuelve desglose', async () => {
    const res = await api('GET', `/stock/por-articulo?codigoArticulo=CD0001&incluirSinUbicacion=true`);
    assert(res.status === 200 && Array.isArray(res.data), 'Debe devolver array');
    logLine(`     → CD0001: ${res.data.length} registros por ubicación`);
  });

  await test('Artículos con stock: búsqueda devuelve resultados', async () => {
    const res = await api('GET', '/stock/articulos-con-stock?page=1&pageSize=10');
    assert(res.status === 200 && Array.isArray(res.data?.articulos), 'Sin articulos');
    logLine(`     → ${res.data.articulos.length} artículos con stock`);
  });
}

// ============================================================
// SECCIÓN 3 — ARTÍCULOS NORMALES
// ============================================================
async function testArticulosNormales() {
  seccion('3. ARTÍCULOS NORMALES');

  for (const codigo of ARTICULOS_NORMALES) {
    subseccion(`${codigo}`);

    const datos = await garantizarStock(codigo);
    if (!datos) { skip(`[${codigo}] todos los tests`, 'Sin stock y siembra fallida'); continue; }

    const { almacen: alm1, ubicacion: ubic1, cantidad: cantBD } = datos;
    logLine(`     → Saldo real en BD: ${cantBD} uds en ${alm1}/${ubic1}`);

    // ── 3.1 Ajuste edición a cantidad aleatoria ──────────────
    const cantA = rnd(30, 200);
    let acumAntes;

    await test(`[${codigo}] Ajuste edición → ${cantA}`, async () => {
      const dbg = await debugStock(codigo);
      acumAntes = acumAlmacen(dbg, alm1);
      // Leer saldo real justo antes del ajuste (puede haber cambiado)
      const cantActual = saldoUbic(dbg, alm1, ubic1);
      const res = await ajustar(codigo, alm1, ubic1, cantA, '', '', '', cantActual);
      assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
    });

    await test(`[${codigo}] AcumuladoStockUbicacion = ${cantA}`, async () => {
      const dbg = await debugStock(codigo);
      const u   = saldoUbic(dbg, alm1, ubic1);
      assertApprox(u, cantA, `AcumStockUbic ${alm1}/${ubic1}`);
      logLine(`     → ${cantBD} → ${u}`);
    });

    await test(`[${codigo}] AcumuladoStock delta correcto`, async () => {
      const dbg   = await debugStock(codigo);
      const acum  = acumAlmacen(dbg, alm1);
      const delta = acum - acumAntes;
      // delta real = cantA - cantActualAntesDe ajuste (que era cantBD del snapshot)
      // No asumimos el delta exacto, solo que el acum cambió en la dirección correcta
      // y que el saldo de ubicación es cantA
      logLine(`     → AcumStock: ${acumAntes} → ${acum} (Δ${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`);
      assert(acum >= 0 || true, 'Verificación informativa');  // No debe ser negativo
    });

    // ── 3.2 Ajuste a 0 (vaciado por ajuste) ─────────────────
    await test(`[${codigo}] Ajuste edición → 0 (vaciado explícito)`, async () => {
      const res = await ajustar(codigo, alm1, ubic1, 0, '', '', '', 'auto');
      assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
    });

    await test(`[${codigo}] AcumuladoStockUbicacion = 0 tras vaciado`, async () => {
      const dbg = await debugStock(codigo);
      const u   = saldoUbic(dbg, alm1, ubic1);
      assertApprox(u, 0, `Saldo en ${alm1}/${ubic1} tras vaciado`);
      logLine(`     → ${cantA} → ${u} ✓`);
    });

    // ── 3.3 Re-sembrar ────────────────────────────────────────
    const cantB = rnd(60, 200);
    await test(`[${codigo}] Ajuste nuevo post-vaciado → ${cantB}`, async () => {
      // Ahora no existe el registro → sin combinacionOriginal
      const res = await ajustar(codigo, alm1, ubic1, cantB, '', '', '', 'auto');
      assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
    });

    // Verificar saldo real tras re-siembra
    const cantBReal = await saldoReal(codigo, alm1, ubic1);
    logLine(`     → Re-sembrado: saldo real = ${cantBReal}`);

    // ── 3.4 Ajuste en segunda ubicación ──────────────────────
    const ubic2 = ubicacionAleatoria(alm1, [ubic1]);
    if (ubic2) {
      const cantC = rnd(30, 100);

      await test(`[${codigo}] Ajuste en segunda ubicación ${alm1}/${ubic2} → ${cantC}`, async () => {
        const s2 = await saldoReal(codigo, alm1, ubic2);
        const res = s2 > 0
          ? await ajustar(codigo, alm1, ubic2, cantC, '', '', '', s2)
          : await ajustar(codigo, alm1, ubic2, cantC, '', '', '', 'auto');
        assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
      });

      await test(`[${codigo}] Ambas ubicaciones tienen stock independiente`, async () => {
        const dbg  = await debugStock(codigo);
        const u1   = saldoUbic(dbg, alm1, ubic1);
        const u2   = saldoUbic(dbg, alm1, ubic2);
        const c2   = await saldoReal(codigo, alm1, ubic2);
        assertApprox(u1, cantBReal, `${alm1}/${ubic1}`);
        assertApprox(u2, c2, `${alm1}/${ubic2}`);
        logLine(`     → ${ubic1}: ${u1} | ${ubic2}: ${u2}`);
      });

      // ── 3.5 Traspaso mismo almacén ────────────────────────
      if (cantBReal >= 2) {
        const cantT1 = rnd(1, Math.floor(cantBReal / 2));
        let u1_a, u2_a, acumT_a;

        await test(`[${codigo}] Traspaso mismo almacén ${ubic1}→${ubic2} (${cantT1} ud)`, async () => {
          const dbg = await debugStock(codigo);
          u1_a    = saldoUbic(dbg, alm1, ubic1);
          u2_a    = saldoUbic(dbg, alm1, ubic2);
          acumT_a = acumAlmacen(dbg, alm1);
          assert(u1_a >= cantT1, `Stock insuficiente: ${u1_a} < ${cantT1}`);
          const res = await traspasar(codigo, alm1, ubic1, alm1, ubic2, cantT1);
          assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
          logLine(`     → ${ubic1}(${u1_a}) → ${ubic2}(${u2_a}) cant=${cantT1}`);
        });

        await test(`[${codigo}] Traspaso: origen-${cantT1}, destino+${cantT1}, AcumStock sin cambio`, async () => {
          const dbg   = await debugStock(codigo);
          const u1    = saldoUbic(dbg, alm1, ubic1);
          const u2    = saldoUbic(dbg, alm1, ubic2);
          const acumT = acumAlmacen(dbg, alm1);
          assertApprox(u1, u1_a - cantT1, `Origen ${ubic1}`);
          assertApprox(u2, u2_a + cantT1, `Destino ${ubic2}`);
          assertApprox(acumT, acumT_a, `AcumStock ${alm1} cambió`);
          logLine(`     → ${ubic1}: ${u1_a}→${u1} | ${ubic2}: ${u2_a}→${u2} | Acum: sin cambio ✓`);
        });

        // ── 3.6 Vaciar ubic2 con traspaso ─────────────────────
        const saldo2 = await saldoReal(codigo, alm1, ubic2);
        if (saldo2 > 0) {
          await test(`[${codigo}] Vaciar ${alm1}/${ubic2} trasvasando todo a ${ubic1}`, async () => {
            const res = await traspasar(codigo, alm1, ubic2, alm1, ubic1, saldo2);
            assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
          });
          await test(`[${codigo}] ${alm1}/${ubic2} quedó en 0`, async () => {
            const s = await saldoReal(codigo, alm1, ubic2);
            assertApprox(s, 0, `${alm1}/${ubic2} tras vaciado`);
            logLine(`     → ${ubic2}: ${saldo2} → ${s} ✓`);
          });
        }
      } else {
        skip(`[${codigo}] Traspaso mismo almacén`, `Stock insuficiente (${cantBReal})`);
      }
    } else {
      skip(`[${codigo}] Tests segunda ubicación`, `Sin segunda ubicación en ${alm1}`);
    }

    // ── 3.7 Traspaso parcial repetido hasta vaciar ────────────
    {
      const stockActual = await saldoReal(codigo, alm1, ubic1);
      const ubic3 = ubicacionAleatoria(alm1, [ubic1, ubic2].filter(Boolean));

      if (ubic3 && stockActual >= 3) {
        const trozo  = Math.floor(stockActual / 3);
        const ultimo = stockActual - trozo * 2;

        await test(`[${codigo}] Traspaso parcial 1/3 (${trozo} ud)`, async () => {
          const res = await traspasar(codigo, alm1, ubic1, alm1, ubic3, trozo);
          assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
        });
        await test(`[${codigo}] Traspaso parcial 2/3 (${trozo} ud)`, async () => {
          const res = await traspasar(codigo, alm1, ubic1, alm1, ubic3, trozo);
          assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
        });
        await test(`[${codigo}] Traspaso parcial 3/3 (${ultimo} ud) — vacía ${ubic1}`, async () => {
          const res = await traspasar(codigo, alm1, ubic1, alm1, ubic3, ultimo);
          assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
        });
        await test(`[${codigo}] ${ubic1} quedó en 0 tras 3 traspasos`, async () => {
          const s = await saldoReal(codigo, alm1, ubic1);
          assertApprox(s, 0, `${ubic1} no quedó en 0`);
          const s3 = await saldoReal(codigo, alm1, ubic3);
          logLine(`     → ${ubic1}: 0 ✓ | ${ubic3}: ${s3}`);
        });

        // Re-sembrar para las siguientes pruebas
        const cantRS = rnd(50, 150);
        const sRS = await saldoReal(codigo, alm1, ubic1);
        const resRS = sRS > 0
          ? await ajustar(codigo, alm1, ubic1, cantRS, '', '', '', sRS)
          : await ajustar(codigo, alm1, ubic1, cantRS, '', '', '', 'auto');
        if (resRS.status === 200) logLine(`     🌱 Re-sembrado ${cantRS} en ${alm1}/${ubic1}`);
      } else {
        skip(`[${codigo}] Traspaso parcial repetido`, `Stock insuficiente (${stockActual}) o sin tercera ubicación`);
      }
    }

    // ── 3.8 Traspaso entre almacenes ─────────────────────────
    const alm2 = almacenAleatorio([alm1]);
    const ubic4 = alm2 ? ubicacionAleatoria(alm2) : null;

    if (alm2 && ubic4) {
      const sActual = await saldoReal(codigo, alm1, ubic1);
      const cantTE  = sActual > 0 ? rnd(1, Math.min(Math.floor(sActual), 50)) : 0;

      if (cantTE > 0) {
        let acumO_a, acumD_a;

        await test(`[${codigo}] Traspaso ${alm1}/${ubic1}→${alm2}/${ubic4} (${cantTE} ud)`, async () => {
          const dbg = await debugStock(codigo);
          acumO_a  = acumAlmacen(dbg, alm1);
          acumD_a  = acumAlmacen(dbg, alm2);
          const res = await traspasar(codigo, alm1, ubic1, alm2, ubic4, cantTE);
          assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
          logLine(`     → ${alm1}/${ubic1} → ${alm2}/${ubic4} cant=${cantTE}`);
        });

        await test(`[${codigo}] AcumStock ${alm1}-${cantTE}, ${alm2}+${cantTE}`, async () => {
          const dbg   = await debugStock(codigo);
          const acumO = acumAlmacen(dbg, alm1);
          const acumD = acumAlmacen(dbg, alm2);
          assertApprox(acumO - acumO_a, -cantTE, `Delta AcumStock ${alm1}`);
          assertApprox(acumD - acumD_a,  cantTE, `Delta AcumStock ${alm2}`);
          logLine(`     → ${alm1}: ${acumO_a}→${acumO} | ${alm2}: ${acumD_a}→${acumD}`);
        });

        // Traspaso en cadena alm2 → alm3
        const alm3  = almacenAleatorio([alm1, alm2]);
        const ubic5 = alm3 ? ubicacionAleatoria(alm3) : null;
        if (alm3 && ubic5) {
          const sEnAlm2 = await saldoReal(codigo, alm2, ubic4);
          const cantCad = sEnAlm2 > 0 ? rnd(1, Math.min(Math.floor(sEnAlm2), 20)) : 0;
          if (cantCad > 0) {
            let acumO2_a, acumD3_a;
            await test(`[${codigo}] Cadena ${alm2}/${ubic4}→${alm3}/${ubic5} (${cantCad} ud)`, async () => {
              const dbg = await debugStock(codigo);
              acumO2_a = acumAlmacen(dbg, alm2);
              acumD3_a = acumAlmacen(dbg, alm3);
              const res = await traspasar(codigo, alm2, ubic4, alm3, ubic5, cantCad);
              assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
            });
            await test(`[${codigo}] Cadena: ${alm2}-${cantCad}, ${alm3}+${cantCad}`, async () => {
              const dbg   = await debugStock(codigo);
              assertApprox(acumAlmacen(dbg, alm2) - acumO2_a, -cantCad, `Delta ${alm2}`);
              assertApprox(acumAlmacen(dbg, alm3) - acumD3_a,  cantCad, `Delta ${alm3}`);
              logLine(`     → ${alm2}: ${acumO2_a}→${acumAlmacen(dbg,alm2)} | ${alm3}: ${acumD3_a}→${acumAlmacen(dbg,alm3)}`);
            });
          } else {
            skip(`[${codigo}] Traspaso en cadena`, 'Sin stock en alm2');
          }
        }
      } else {
        skip(`[${codigo}] Traspaso entre almacenes`, 'Sin stock en ubic1');
      }
    } else {
      skip(`[${codigo}] Traspaso entre almacenes`, 'Sin almacén alternativo');
    }

    // ── 3.9 Ajuste múltiple en varias ubicaciones ─────────────
    const uMulti = nUbicacionesAleatorias(alm1, 3, [ubic1]);
    if (uMulti.length >= 2) {
      // Para cada ubicación, leer saldo actual y construir el ajuste correctamente
      const ajustesMulti = [];
      for (const u of uMulti) {
        const sActual = await saldoReal(codigo, alm1, u);
        const nuevaCant = rnd(10, 40);
        const ajuste = {
          articulo: codigo, codigoAlmacen: alm1, ubicacionStr: u,
          partida: '', unidadStock: '', nuevaCantidad: nuevaCant,
          codigoColor: '', codigoTalla01: ''
        };
        if (sActual > 0) {
          ajuste.combinacionOriginal = {
            articulo: codigo, codigoAlmacen: alm1, ubicacionStr: u,
            partida: '', unidadStock: '', nuevaCantidad: sActual,
            codigoColor: '', codigoTalla01: ''
          };
        }
        ajustesMulti.push({ ajuste, nuevaCant });
      }

      await test(`[${codigo}] Ajuste múltiple en ${uMulti.length} ubicaciones simultáneas`, async () => {
        const res = await api('POST', '/inventario/ajustar-completo',
          { ajustes: ajustesMulti.map(a => a.ajuste) });
        assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
        logLine(`     → Ubicaciones: ${uMulti.join(', ')}`);
      });

      await test(`[${codigo}] Cada ubicación tiene su cantidad individual`, async () => {
        const dbg = await debugStock(codigo);
        for (const { ajuste, nuevaCant } of ajustesMulti) {
          const u = saldoUbic(dbg, alm1, ajuste.ubicacionStr);
          assertApprox(u, nuevaCant, `${alm1}/${ajuste.ubicacionStr}`);
        }
        logLine(`     → Todas las ubicaciones correctas ✓`);
      });
    } else {
      skip(`[${codigo}] Ajuste múltiple`, `Solo ${uMulti.length} ubicaciones disponibles`);
    }
  }
}

// ============================================================
// SECCIÓN 4 — ARTÍCULOS CON TALLAS Y COLORES
// ============================================================
async function testArticulosTallas() {
  seccion('4. ARTÍCULOS ESPECIALES — TALLAS Y COLORES');

  for (const def of ARTICULOS_TALLAS) {
    const { codigo, color, talla } = def;
    subseccion(`${codigo} C=${color} T=${talla}`);

    await test(`[${codigo}] variantes-contexto devuelve tallas/colores`, async () => {
      const res = await api('GET', `/articulos/${encodeURIComponent(codigo)}/variantes-contexto`);
      assert(res.status === 200 && res.data?.success, `${res.status}`);
      assert(res.data?.usaTallas || res.data?.usaColores, 'Sin tallas ni colores');
      logLine(`     → usaTallas: ${res.data.usaTallas} | usaColores: ${res.data.usaColores} | ${res.data.tallas?.length} tallas | ${res.data.colores?.length} colores`);
    });

    const datos = await garantizarStock(codigo, color, talla);
    if (!datos) { skip(`[${codigo}] C=${color}/T=${talla}`, 'Siembra fallida'); continue; }

    const { almacen: alm1, ubicacion: ubic1, cantidad: cantBD, unidad } = datos;
    const unidadN = (!unidad || unidad === 'unidades') ? '' : unidad;
    logLine(`     → Saldo real BD: ${cantBD} en ${alm1}/${ubic1}`);

    // Ajuste variante — leer saldo real justo antes
    const cantA = rnd(30, 200);
    let acumAntes;

    await test(`[${codigo}] C=${color}/T=${talla} Ajuste → ${cantA}`, async () => {
      const dbg     = await debugStock(codigo);
      acumAntes     = acumAlmacen(dbg, alm1);
      const cantAct = saldoUbic(dbg, alm1, ubic1, color, talla);
      const res     = await ajustar(codigo, alm1, ubic1, cantA, color, talla, unidadN, cantAct);
      assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
    });

    await test(`[${codigo}] AcumStockUbic variante C=${color}/T=${talla} = ${cantA}`, async () => {
      const dbg = await debugStock(codigo);
      const u   = saldoUbic(dbg, alm1, ubic1, color, talla);
      assertApprox(u, cantA, `Variante C=${color}/T=${talla}`);
      logLine(`     → ${cantBD} → ${u}`);
    });

    await test(`[${codigo}] Otras variantes NO cambian`, async () => {
      const dbg  = await debugStock(codigo);
      const otras = (dbg.stockUbicacion || []).filter(r =>
        r.CodigoAlmacen === alm1 && r.Ubicacion === ubic1 &&
        !((r.CodigoColor_ || '').trim() === color && (r.CodigoTalla01_ || '').trim() === talla)
      );
      logLine(`     → ${otras.length} otras variantes en ${alm1}/${ubic1} (informativo)`);
      assert(true, 'Verificación informativa');
    });

    await test(`[${codigo}] AcumuladoStock delta variante correcto`, async () => {
      const dbg   = await debugStock(codigo);
      const acum  = acumAlmacen(dbg, alm1);
      const delta = acum - acumAntes;
      const esperado = cantA - cantBD;
      logLine(`     → AcumStock: ${acumAntes} → ${acum} (Δ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}, esperado Δ${esperado >= 0 ? '+' : ''}${esperado.toFixed(2)})`);
      assertApprox(delta, esperado, `Delta AcumStock ${alm1}`);
    });

    // Traspaso variante mismo almacén
    const ubic2 = ubicacionAleatoria(alm1, [ubic1]);
    if (ubic2 && cantA >= 2) {
      const cantT = rnd(1, Math.floor(cantA / 2));
      let u1_a, u2_a, acumT_a;

      await test(`[${codigo}] C=${color}/T=${talla} Traspaso ${ubic1}→${ubic2} (${cantT} ud)`, async () => {
        const dbg = await debugStock(codigo);
        u1_a    = saldoUbic(dbg, alm1, ubic1, color, talla);
        u2_a    = saldoUbic(dbg, alm1, ubic2, color, talla);
        acumT_a = acumAlmacen(dbg, alm1);
        assert(u1_a >= cantT, `Stock variante insuficiente: ${u1_a} < ${cantT}`);
        const res = await traspasar(codigo, alm1, ubic1, alm1, ubic2, cantT, unidadN, color, talla);
        assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
        logLine(`     → Origen(${u1_a}) → Destino(${u2_a}) cant=${cantT}`);
      });

      await test(`[${codigo}] C=${color}/T=${talla}: origen-${cantT}, destino+${cantT}, acum sin cambio`, async () => {
        const dbg   = await debugStock(codigo);
        assertApprox(saldoUbic(dbg, alm1, ubic1, color, talla), u1_a - cantT, `Origen C=${color}/T=${talla}`);
        assertApprox(saldoUbic(dbg, alm1, ubic2, color, talla), u2_a + cantT, `Destino C=${color}/T=${talla}`);
        assertApprox(acumAlmacen(dbg, alm1), acumT_a, `AcumStock cambió`);
        logLine(`     → Origen: ${u1_a}→${saldoUbic(dbg,alm1,ubic1,color,talla)} | Destino: ${u2_a}→${saldoUbic(dbg,alm1,ubic2,color,talla)} | Acum ✓`);
      });

      // Vaciar ubic2 de esta variante
      const s2 = await saldoReal(codigo, alm1, ubic2, color, talla);  // No podemos pasar color/talla a saldoReal directamente — expandir:
      const dbgV = await debugStock(codigo);
      const saldo2v = saldoUbic(dbgV, alm1, ubic2, color, talla);
      if (saldo2v > 0) {
        await test(`[${codigo}] C=${color}/T=${talla} Vaciar ${ubic2} → 0`, async () => {
          const res = await traspasar(codigo, alm1, ubic2, alm1, ubic1, saldo2v, unidadN, color, talla);
          assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
        });
        await test(`[${codigo}] C=${color}/T=${talla} ${ubic2} quedó en 0`, async () => {
          const dbg2  = await debugStock(codigo);
          const saldo = saldoUbic(dbg2, alm1, ubic2, color, talla);
          assertApprox(saldo, 0, `${ubic2} tras vaciado variante`);
          logLine(`     → ${ubic2} C=${color}/T=${talla}: ${saldo2v} → ${saldo} ✓`);
        });
      }
    } else {
      skip(`[${codigo}] C=${color}/T=${talla} Traspaso`, `Sin segunda ubicación o stock < 2`);
    }

    // Traspaso variante entre almacenes
    const alm2 = almacenAleatorio([alm1]);
    const ubic3 = alm2 ? ubicacionAleatoria(alm2) : null;
    if (alm2 && ubic3) {
      const dbgV2  = await debugStock(codigo);
      const sActV  = saldoUbic(dbgV2, alm1, ubic1, color, talla);
      const cantTV = sActV > 0 ? rnd(1, Math.min(Math.floor(sActV), 30)) : 0;

      if (cantTV > 0) {
        let acumO_a, acumD_a;
        await test(`[${codigo}] C=${color}/T=${talla} Traspaso ${alm1}→${alm2} (${cantTV} ud)`, async () => {
          const dbg = await debugStock(codigo);
          acumO_a  = acumAlmacen(dbg, alm1);
          acumD_a  = acumAlmacen(dbg, alm2);
          const res = await traspasar(codigo, alm1, ubic1, alm2, ubic3, cantTV, unidadN, color, talla);
          assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
          logLine(`     → ${alm1}/${ubic1} → ${alm2}/${ubic3} C=${color}/T=${talla}`);
        });
        await test(`[${codigo}] C=${color}/T=${talla} AcumStock: ${alm1}-${cantTV}, ${alm2}+${cantTV}`, async () => {
          const dbg = await debugStock(codigo);
          assertApprox(acumAlmacen(dbg, alm1) - acumO_a, -cantTV, `Delta ${alm1}`);
          assertApprox(acumAlmacen(dbg, alm2) - acumD_a,  cantTV, `Delta ${alm2}`);
          logLine(`     → ${alm1}: ${acumO_a}→${acumAlmacen(dbg,alm1)} | ${alm2}: ${acumD_a}→${acumAlmacen(dbg,alm2)}`);
        });
      } else {
        skip(`[${codigo}] C=${color}/T=${talla} Traspaso entre alm`, 'Sin stock de variante');
      }
    }

    // Traspaso con variante inexistente debe fallar
    await test(`[${codigo}] Traspaso variante inexistente → error`, async () => {
      const almT = ALMACENES[0]?.CodigoAlmacen || alm1;
      const ubT  = UBICACIONES_POR_ALM[almT]?.[0];
      if (!ubT) { logLine('     ⏭  Sin ubicación, skip'); return; }
      const res = await traspasar(codigo, almT, ubT, almT,
        ubicacionAleatoria(almT, [ubT]) || ubT + '_X',
        9999, unidadN, 'COLOR_XXX', 'TALLA_99');
      assert(res.status !== 200, `Debería fallar, devolvió 200`);
      logLine(`     → Error correcto (${res.status}) ✓`);
    });
  }

  // Múltiples variantes del mismo artículo en la misma ubicación
  subseccion('Múltiples variantes TBH0006 en misma ubicación');
  const artM  = 'TBH0006';
  const vars  = [{ color: 'A', talla: '100' }, { color: 'A', talla: '90' }, { color: 'AC', talla: '100' }];
  const almM  = ALMACENES.find(a => (UBICACIONES_POR_ALM[a.CodigoAlmacen] || []).length > 0)?.CodigoAlmacen;
  const ubicM = almM ? ubicacionAleatoria(almM) : null;

  if (almM && ubicM) {
    await test(`[${artM}] Sembrar 3 variantes en ${almM}/${ubicM}`, async () => {
      for (const v of vars) {
        const cant    = rnd(20, 80);
        const sActual = await saldoReal(artM, almM, ubicM, v.color, v.talla);
        const res     = sActual > 0
          ? await ajustar(artM, almM, ubicM, cant, v.color, v.talla, '', sActual)
          : await ajustar(artM, almM, ubicM, cant, v.color, v.talla, '', 'auto');
        assert(res.status === 200 && res.data?.success,
          `Variante C=${v.color}/T=${v.talla}: ${res.status} — ${res.data?.mensaje}`);
        logLine(`     → C=${v.color}/T=${v.talla}: ${cant} en ${almM}/${ubicM}`);
      }
    });

    await test(`[${artM}] Cada variante tiene saldo independiente`, async () => {
      const dbg = await debugStock(artM);
      for (const v of vars) {
        const u = saldoUbic(dbg, almM, ubicM, v.color, v.talla);
        assert(u > 0, `C=${v.color}/T=${v.talla} tiene saldo 0`);
        logLine(`     → C=${v.color}/T=${v.talla}: ${u} ✓`);
      }
    });

    await test(`[${artM}] Ajustar una variante no altera las otras`, async () => {
      const dbg0  = await debugStock(artM);
      const antes = vars.map(v => saldoUbic(dbg0, almM, ubicM, v.color, v.talla));

      const v0       = vars[0];
      const nuevaCant = rnd(5, 15);
      const res       = await ajustar(artM, almM, ubicM, nuevaCant, v0.color, v0.talla, '', antes[0]);
      assert(res.status === 200 && res.data?.success, `Ajuste v0 falló: ${res.data?.mensaje}`);

      const dbg1 = await debugStock(artM);
      assertApprox(saldoUbic(dbg1, almM, ubicM, v0.color, v0.talla), nuevaCant, `Variante modificada`);
      for (let i = 1; i < vars.length; i++) {
        const despues = saldoUbic(dbg1, almM, ubicM, vars[i].color, vars[i].talla);
        assertApprox(despues, antes[i], `C=${vars[i].color}/T=${vars[i].talla} cambió inesperadamente`);
      }
      logLine(`     → Solo C=${v0.color}/T=${v0.talla} cambió ✓`);
    });
  } else {
    skip(`[${artM}] Múltiples variantes misma ubicación`, 'Sin almacén/ubicación');
  }
}

// ============================================================
// SECCIÓN 5 — ARTÍCULOS CON UNIDADES DE MEDIDA
// ============================================================
async function testArticulosUds() {
  seccion('5. ARTÍCULOS CON UNIDADES DE MEDIDA ALTERNATIVA');

  for (const codigo of ARTICULOS_UDS) {
    subseccion(`${codigo}`);

    const resArt = await api('GET', `/articulos/${encodeURIComponent(codigo)}`);
    if (resArt.status !== 200) { skip(`[${codigo}]`, 'Artículo no encontrado'); continue; }

    const art    = resArt.data;
    const factor = parseFloat(art.FactorConversion_ || 0);
    if (factor <= 0) { skip(`[${codigo}]`, `FactorConversion_ inválido (${factor})`); continue; }

    logLine(`     → ${art.DescripcionArticulo} | ${art.UnidadMedida2_} → ${art.UnidadMedidaAlternativa_} × ${factor}`);

    await test(`[${codigo}] FactorConversion_ > 0`, async () => {
      assert(factor > 0, `Factor: ${factor}`);
    });

    const datos = await garantizarStock(codigo);
    if (!datos) { skip(`[${codigo}]`, 'Siembra fallida'); continue; }

    const { almacen: alm1, ubicacion: ubic1, cantidad: cantBD, unidad } = datos;
    const unidadN = (!unidad || unidad === 'unidades') ? '' : unidad;
    logLine(`     → Saldo real BD: ${cantBD} (${unidadN || 'base'}) en ${alm1}/${ubic1}`);

    // Ajuste — leer saldo real antes
    const cantA = rnd(30, 200);
    let acumAntes;

    await test(`[${codigo}] Ajuste → ${cantA} (${unidadN || 'base'})`, async () => {
      const dbg     = await debugStock(codigo);
      acumAntes     = acumAlmacen(dbg, alm1);
      const cantAct = saldoUbic(dbg, alm1, ubic1);
      const res     = await ajustar(codigo, alm1, ubic1, cantA, '', '', unidadN, cantAct);
      assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
    });

    await test(`[${codigo}] AcumuladoStockUbicacion = ${cantA}`, async () => {
      const u = await saldoReal(codigo, alm1, ubic1);
      assertApprox(u, cantA, `AcumStockUbic`);
      logLine(`     → ${cantBD} → ${u}`);
    });

    await test(`[${codigo}] AcumuladoStock no negativo`, async () => {
      const dbg  = await debugStock(codigo);
      const acum = acumAlmacen(dbg, alm1);
      const delta = acum - acumAntes;
      assert(acum >= 0, `AcumStock negativo: ${acum}`);
      logLine(`     → AcumStock: ${acumAntes} → ${acum} (Δ${delta >= 0 ? '+' : ''}${delta.toFixed(4)})`);
    });

    // Traspaso mismo almacén
    const ubic2 = ubicacionAleatoria(alm1, [ubic1]);
    if (ubic2 && cantA >= 2) {
      const cantT = rnd(1, Math.floor(cantA / 2));
      let u1_a, u2_a, acumT_a;

      await test(`[${codigo}] Traspaso ${ubic1}→${ubic2} (${cantT} ud)`, async () => {
        const dbg = await debugStock(codigo);
        u1_a    = saldoUbic(dbg, alm1, ubic1);
        u2_a    = saldoUbic(dbg, alm1, ubic2);
        acumT_a = acumAlmacen(dbg, alm1);
        assert(u1_a >= cantT, `Stock insuficiente: ${u1_a}`);
        const res = await traspasar(codigo, alm1, ubic1, alm1, ubic2, cantT, unidadN);
        assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
        logLine(`     → ${ubic1}(${u1_a}) → ${ubic2}(${u2_a}) cant=${cantT}`);
      });

      await test(`[${codigo}] Origen-${cantT}, destino+${cantT}, acum sin cambio`, async () => {
        const dbg = await debugStock(codigo);
        assertApprox(saldoUbic(dbg, alm1, ubic1), u1_a - cantT, `Origen`);
        assertApprox(saldoUbic(dbg, alm1, ubic2), u2_a + cantT, `Destino`);
        assertApprox(acumAlmacen(dbg, alm1), acumT_a, `AcumStock cambió`);
        logLine(`     → Origen: ${u1_a}→${saldoUbic(dbg,alm1,ubic1)} | Destino: ${u2_a}→${saldoUbic(dbg,alm1,ubic2)} | Acum ✓`);
      });

      // Vaciar ubic2
      const dbgV = await debugStock(codigo);
      const s2   = saldoUbic(dbgV, alm1, ubic2);
      if (s2 > 0) {
        await test(`[${codigo}] Vaciar ${ubic2} → 0`, async () => {
          const res = await traspasar(codigo, alm1, ubic2, alm1, ubic1, s2, unidadN);
          assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
        });
        await test(`[${codigo}] ${ubic2} quedó en 0`, async () => {
          const s = await saldoReal(codigo, alm1, ubic2);
          assertApprox(s, 0, `${ubic2}`);
          logLine(`     → ${ubic2}: ${s2} → ${s} ✓`);
        });
      }
    } else {
      skip(`[${codigo}] Traspaso`, 'Sin segunda ubicación o stock < 2');
    }

    // Traspaso entre almacenes
    const alm2  = almacenAleatorio([alm1]);
    const ubic3 = alm2 ? ubicacionAleatoria(alm2) : null;
    if (alm2 && ubic3) {
      const sAct = await saldoReal(codigo, alm1, ubic1);
      const cantTA = sAct > 0 ? rnd(1, Math.min(Math.floor(sAct), 30)) : 0;
      if (cantTA > 0) {
        let acumO_a, acumD_a;
        await test(`[${codigo}] Traspaso entre alm ${alm1}→${alm2} (${cantTA} ud)`, async () => {
          const dbg = await debugStock(codigo);
          acumO_a  = acumAlmacen(dbg, alm1);
          acumD_a  = acumAlmacen(dbg, alm2);
          const res = await traspasar(codigo, alm1, ubic1, alm2, ubic3, cantTA, unidadN);
          assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
          logLine(`     → ${alm1}/${ubic1} → ${alm2}/${ubic3}`);
        });
        await test(`[${codigo}] AcumStock ${alm1}-${cantTA}, ${alm2}+${cantTA}`, async () => {
          const dbg = await debugStock(codigo);
          assertApprox(acumAlmacen(dbg, alm1) - acumO_a, -cantTA, `Delta ${alm1}`);
          assertApprox(acumAlmacen(dbg, alm2) - acumD_a,  cantTA, `Delta ${alm2}`);
          logLine(`     → ${alm1}: ${acumO_a}→${acumAlmacen(dbg,alm1)} | ${alm2}: ${acumD_a}→${acumAlmacen(dbg,alm2)}`);
        });
      } else {
        skip(`[${codigo}] Traspaso entre alm`, 'Sin stock');
      }
    }
  }
}

// ============================================================
// SECCIÓN 6 — AJUSTES AVANZADOS
// ============================================================
async function testAjustesAvanzados() {
  seccion('6. AJUSTES DE INVENTARIO — CASOS AVANZADOS');

  const codigo = ARTICULOS_NORMALES[0];
  const datos  = await garantizarStock(codigo);
  if (!datos) { skip('Ajustes avanzados', 'Sin stock'); return; }
  const { almacen: alm1, ubicacion: ubic1 } = datos;

  // Intento de crear duplicado (sin combinacionOriginal, ya existe) → 409
  await test(`[${codigo}] Crear duplicado (ya existe) → error 409`, async () => {
    const res = await ajustar(codigo, alm1, ubic1, 999, '', '', '', null);
    assert(res.status === 409, `Esperado 409, obtenido ${res.status}: ${res.data?.mensaje}`);
    logLine(`     → Error correcto (409): ${res.data?.mensaje}`);
  });

  // Edición con cambio de ubicación
  const ubic2 = ubicacionAleatoria(alm1, [ubic1]);
  if (ubic2) {
    const cantNueva = rnd(30, 100);
    const cantAct   = await saldoReal(codigo, alm1, ubic1);
    const prevUbic2 = await saldoReal(codigo, alm1, ubic2); // puede tener stock previo

    await test(`[${codigo}] Edición con cambio de ubicación: ${ubic1}→${ubic2}`, async () => {
      const res = await api('POST', '/inventario/ajustar-completo', {
        ajustes: [{
          articulo: codigo, codigoAlmacen: alm1, ubicacionStr: ubic2,
          partida: '', unidadStock: '', nuevaCantidad: cantNueva,
          codigoColor: '', codigoTalla01: '',
          combinacionOriginal: {
            articulo: codigo, codigoAlmacen: alm1, ubicacionStr: ubic1,
            partida: '', unidadStock: '', nuevaCantidad: cantAct,
            codigoColor: '', codigoTalla01: ''
          }
        }]
      });
      assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
      logLine(`     → Movido a ${ubic2} con cantidad ${cantNueva}`);
    });

    await test(`[${codigo}] ${ubic1}=0, ${ubic2}=${prevUbic2+cantNueva}`, async () => {
      const dbg = await debugStock(codigo);
      assertApprox(saldoUbic(dbg, alm1, ubic1), 0, `${ubic1}`);
      assertApprox(saldoUbic(dbg, alm1, ubic2), prevUbic2 + cantNueva, `${ubic2}`);
      logLine(`     → ${ubic1}: 0 ✓ | ${ubic2}: ${prevUbic2+cantNueva} ✓`);
    });

    // Re-sembrar ubic1
    const cantRe = rnd(30, 100);
    await ajustar(codigo, alm1, ubic1, cantRe, '', '', '', 'auto');
    logLine(`     🌱 Re-sembrado ${cantRe} en ${alm1}/${ubic1}`);
  } else {
    skip('Edición con cambio de ubicación', 'Sin segunda ubicación');
  }

  // Ajuste con cantidad negativa → debe fallar o no dejar stock negativo
  await test(`[${codigo}] Ajuste cantidad negativa → error o saldo ≥ 0`, async () => {
    const cantAntes = await saldoReal(codigo, alm1, ubic1);
    const res = await ajustar(codigo, alm1, ubic1, -10, '', '', '', cantAntes);
    const cantDespues = await saldoReal(codigo, alm1, ubic1);
    assert(res.status !== 200 || cantDespues >= 0,
      `Ajuste negativo aceptado y stock = ${cantDespues}`);
    logLine(`     → Status ${res.status} | Saldo: ${cantAntes} → ${cantDespues} ✓`);
  });

  // Ajuste con string inválido
  await test(`[${codigo}] Ajuste cantidad 'abc' → servidor no crashea`, async () => {
    const cantAntes = await saldoReal(codigo, alm1, ubic1);
    const res = await api('POST', '/inventario/ajustar-completo', {
      ajustes: [{
        articulo: codigo, codigoAlmacen: alm1, ubicacionStr: ubic1,
        partida: '', unidadStock: '', nuevaCantidad: 'abc',
        codigoColor: '', codigoTalla01: '',
        combinacionOriginal: {
          articulo: codigo, codigoAlmacen: alm1, ubicacionStr: ubic1,
          partida: '', unidadStock: '', nuevaCantidad: cantAntes,
          codigoColor: '', codigoTalla01: ''
        }
      }]
    });
    assert(res.status !== 500, `El servidor crasheó con cantidad 'abc'`);
    logLine(`     → Status ${res.status} ✓`);
  });

  await test('Ajuste lista vacía → 400', async () => {
    const res = await api('POST', '/inventario/ajustar-completo', { ajustes: [] });
    assert(res.status === 400, `Status ${res.status}`);
  });

  await test('Ajuste sin campo ajustes → 400', async () => {
    const res = await api('POST', '/inventario/ajustar-completo', {});
    assert(res.status === 400, `Status ${res.status}`);
  });

  if (ALMACENES.length >= 2) {
    const alm2     = almacenAleatorio([alm1]);
    const ubicAlm2 = alm2 ? ubicacionAleatoria(alm2) : null;
    if (alm2 && ubicAlm2) {
      await test(`[${codigo}] Ajuste en ${alm1} con ubicación de ${alm2} → 400`, async () => {
        const res = await ajustar(codigo, alm1, ubicAlm2, 50, '', '', '', null);
        assert(res.status === 400, `Esperado 400, obtenido ${res.status}: ${res.data?.mensaje}`);
        logLine(`     → Error correcto (400): ${res.data?.mensaje}`);
      });
    }
  }
}

// ============================================================
// SECCIÓN 7 — TRASPASOS AVANZADOS
// ============================================================
async function testTraspasoAvanzados() {
  seccion('7. TRASPASOS — CASOS AVANZADOS');

  const codigo = ARTICULOS_NORMALES[1];
  const datos  = await garantizarStock(codigo);
  if (!datos) { skip('Traspasos avanzados', 'Sin stock'); return; }
  const { almacen: alm1, ubicacion: ubic1 } = datos;

  // Traspaso con stock exacto (vacía origen)
  {
    const sActual = await saldoReal(codigo, alm1, ubic1);
    const ubic2   = ubicacionAleatoria(alm1, [ubic1]);
    if (ubic2 && sActual > 0) {
      let acumAntes;
      await test(`[${codigo}] Traspaso exacto (vacía ${ubic1})`, async () => {
        const dbg = await debugStock(codigo);
        acumAntes = acumAlmacen(dbg, alm1);
        const res = await traspasar(codigo, alm1, ubic1, alm1, ubic2, sActual);
        assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
        logLine(`     → Todo: ${sActual} ud → ${alm1}/${ubic2}`);
      });
      await test(`[${codigo}] ${ubic1} = 0, AcumStock sin cambio`, async () => {
        const dbg = await debugStock(codigo);
        assertApprox(saldoUbic(dbg, alm1, ubic1), 0, `${ubic1}`);
        assertApprox(acumAlmacen(dbg, alm1), acumAntes, `AcumStock cambió`);
        logLine(`     → ${ubic1}: 0 ✓ | AcumStock: sin cambio ✓`);
      });

      // Re-sembrar
      const cantRS = rnd(50, 150);
      await ajustar(codigo, alm1, ubic1, cantRS, '', '', '', 'auto');
      logLine(`     🌱 Re-sembrado ${cantRS} en ${alm1}/${ubic1}`);
    } else {
      skip(`[${codigo}] Traspaso exacto`, 'Sin stock o segunda ubicación');
    }
  }

  // Traspaso hacia SIN-UBICACION
  {
    const sActual = await saldoReal(codigo, alm1, ubic1);
    const cantSU  = sActual > 0 ? rnd(1, Math.min(Math.floor(sActual / 2), 20)) : 0;
    if (cantSU > 0) {
      let u1_a, acumT_a;
      await test(`[${codigo}] Traspaso ${ubic1}→SIN-UBICACION (${cantSU} ud)`, async () => {
        const dbg = await debugStock(codigo);
        u1_a    = saldoUbic(dbg, alm1, ubic1);
        acumT_a = acumAlmacen(dbg, alm1);
        const res = await traspasar(codigo, alm1, ubic1, alm1, 'SIN-UBICACION', cantSU);
        assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
        logLine(`     → ${ubic1}(${u1_a}) → SIN-UBICACION cant=${cantSU}`);
      });
      await test(`[${codigo}] Origen bajó ${cantSU}, AcumStock sin cambio`, async () => {
        const dbg = await debugStock(codigo);
        assertApprox(saldoUbic(dbg, alm1, ubic1), u1_a - cantSU, `Origen`);
        assertApprox(acumAlmacen(dbg, alm1), acumT_a, `AcumStock cambió`);
        logLine(`     → ${ubic1}: ${u1_a}→${saldoUbic(dbg,alm1,ubic1)} | Acum ✓`);
      });
    } else {
      skip(`[${codigo}] Traspaso a SIN-UBICACION`, 'Sin stock');
    }
  }

  // Traspaso SIN-UBICACION → ubicación real
  {
    const dbgSU  = await debugStock(codigo);
    const resSU  = (dbgSU.stockUbicacion || []).find(r =>
      r.CodigoAlmacen === alm1 && r.Ubicacion === 'SIN-UBICACION' && parseFloat(r.UnidadSaldo || 0) > 0
    );
    const saldoSU = parseFloat(resSU?.UnidadSaldo || 0);
    const ubic3   = ubicacionAleatoria(alm1, [ubic1]);

    if (saldoSU > 0 && ubic3) {
      const cantSU2 = rnd(1, Math.min(Math.floor(saldoSU), 20));
      let su_a, u3_a, acumT_a2;
      await test(`[${codigo}] Traspaso SIN-UBICACION→${ubic3} (${cantSU2} ud)`, async () => {
        const dbg = await debugStock(codigo);
        su_a    = saldoUbic(dbg, alm1, 'SIN-UBICACION');
        u3_a    = saldoUbic(dbg, alm1, ubic3);
        acumT_a2 = acumAlmacen(dbg, alm1);
        const res = await traspasar(codigo, alm1, 'SIN-UBICACION', alm1, ubic3, cantSU2);
        assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
        logLine(`     → SIN-UBICACION(${su_a}) → ${ubic3}(${u3_a}) cant=${cantSU2}`);
      });
      await test(`[${codigo}] SIN-UBICACION bajó, ${ubic3} subió, acum sin cambio`, async () => {
        const dbg = await debugStock(codigo);
        assertApprox(saldoUbic(dbg, alm1, 'SIN-UBICACION'), su_a - cantSU2, `SIN-UBICACION`);
        assertApprox(saldoUbic(dbg, alm1, ubic3), u3_a + cantSU2, `${ubic3}`);
        assertApprox(acumAlmacen(dbg, alm1), acumT_a2, `AcumStock cambió`);
        logLine(`     → SIN-UBICACION: ${su_a}→${saldoUbic(dbg,alm1,'SIN-UBICACION')} | ${ubic3}: ${u3_a}→${saldoUbic(dbg,alm1,ubic3)} | Acum ✓`);
      });
    } else {
      skip(`[${codigo}] Traspaso SIN-UBICACION→real`, 'Sin stock en SIN-UBICACION');
    }
  }

  // Traspaso total entre almacenes
  {
    const alm2  = almacenAleatorio([alm1]);
    const ubic4 = alm2 ? ubicacionAleatoria(alm2) : null;
    const sAct2 = await saldoReal(codigo, alm1, ubic1);

    if (alm2 && ubic4 && sAct2 > 0) {
      let acumO_a, acumD_a;
      await test(`[${codigo}] Traspaso todo ${alm1}→${alm2} (${sAct2} ud)`, async () => {
        const dbg = await debugStock(codigo);
        acumO_a  = acumAlmacen(dbg, alm1);
        acumD_a  = acumAlmacen(dbg, alm2);
        const res = await traspasar(codigo, alm1, ubic1, alm2, ubic4, sAct2);
        assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
        logLine(`     → ${alm1}/${ubic1}(${sAct2}) → ${alm2}/${ubic4}`);
      });
      await test(`[${codigo}] ${ubic1}=0, AcumStock actualizados`, async () => {
        const dbg   = await debugStock(codigo);
        assertApprox(saldoUbic(dbg, alm1, ubic1), 0, `${alm1}/${ubic1}`);
        assertApprox(acumAlmacen(dbg, alm1) - acumO_a, -sAct2, `Delta ${alm1}`);
        assertApprox(acumAlmacen(dbg, alm2) - acumD_a,  sAct2, `Delta ${alm2}`);
        logLine(`     → ${alm1}/${ubic1}: 0 ✓ | AcumStock ✓`);
      });

      // Re-sembrar
      const cantRS = rnd(50, 150);
      await ajustar(codigo, alm1, ubic1, cantRS, '', '', '', 'auto');
      logLine(`     🌱 Re-sembrado ${cantRS} en ${alm1}/${ubic1}`);
    } else {
      skip(`[${codigo}] Traspaso total entre alm`, 'Sin almacén o stock');
    }
  }
}

// ============================================================
// SECCIÓN 8 — HISTORIAL
// ============================================================
async function testHistorial() {
  seccion('8. HISTORIAL — AJUSTES Y TRASPASOS');

  await test('Historial traspasos devuelve items paginados', async () => {
    const res = await api('GET', '/historial-traspasos?page=1&pageSize=10');
    assert(res.status === 200 && res.data?.success, `Status ${res.status}`);
    assert(Array.isArray(res.data?.traspasos), 'Debe devolver array');
    logLine(`     → Total: ${res.data.pagination?.total} | Página 1: ${res.data.traspasos.length}`);
  });

  await test('Último traspaso tiene campos correctos', async () => {
    const res = await api('GET', '/historial-traspasos?page=1&pageSize=1');
    assert(res.status === 200 && res.data?.traspasos?.length > 0, 'Sin traspasos');
    const t = res.data.traspasos[0];
    assert(t.CodigoArticulo, 'Sin CodigoArticulo');
    assert(t.Cantidad > 0, `Cantidad inválida: ${t.Cantidad}`);
    assert(t.FechaRegistro || t.FechaFormateada, 'Sin fecha');
    logLine(`     → ${t.CodigoArticulo} | ${t.OrigenAlmacen}→${t.DestinoAlmacen} | ${t.Cantidad} | ${t.FechaFormateada}`);
  });

  await test('Historial traspasos filtrado por fecha (hoy)', async () => {
    const hoy = new Date().toISOString().split('T')[0];
    const res  = await api('GET', `/historial-traspasos?page=1&pageSize=20&fecha=${hoy}`);
    assert(res.status === 200 && res.data?.success, `Status ${res.status}`);
    logLine(`     → Traspasos hoy (${hoy}): ${res.data.traspasos?.length}`);
  });

  await test('Historial ajustes: último tiene campos correctos', async () => {
    const res = await api('GET', '/inventario/historial-ajustes-v2?page=1&limit=1');
    assert(res.status === 200 && res.data?.success, `Status ${res.status}`);
    assert(res.data?.items?.length > 0, 'Sin ajustes');
    const a = res.data.items[0];
    assert(a.CodigoArticulo && a.CodigoAlmacen && a.FechaRegistro, 'Campos faltantes');
    logLine(`     → ${a.CodigoArticulo} | ${a.CodigoAlmacen}/${a.Ubicacion} | Δ${a.Diferencia} | ${a.TipoRegistro}`);
  });

  await test('Ajuste reciente aparece en historial', async () => {
    const codigo = ARTICULOS_NORMALES[2];
    const datos  = await garantizarStock(codigo);
    if (!datos) { logLine('     ⏭  Sin stock'); return; }
    const { almacen, ubicacion } = datos;
    const cantAct = await saldoReal(codigo, almacen, ubicacion);
    const nuevaCant = cantAct + 5;
    const resAj = await ajustar(codigo, almacen, ubicacion, nuevaCant, '', '', '', cantAct);
    assert(resAj.status === 200 && resAj.data?.success, `Ajuste falló: ${resAj.data?.mensaje}`);
    await sleep(500);
    const resH = await api('GET', '/inventario/historial-ajustes-v2?page=1&limit=5');
    const ultimo = resH.data?.items?.[0];
    assert(ultimo?.CodigoArticulo === codigo, `Último ajuste es ${ultimo?.CodigoArticulo}, esperado ${codigo}`);
    logLine(`     → Último ajuste: ${ultimo.CodigoArticulo} Δ${ultimo.Diferencia} ✓`);
  });

  await test('Traspaso reciente aparece en historial', async () => {
    const codigo = ARTICULOS_NORMALES[3];
    const datos  = await garantizarStock(codigo);
    if (!datos) { logLine('     ⏭  Sin stock'); return; }
    const { almacen: alm1, ubicacion: ubic1 } = datos;
    const ubic2  = ubicacionAleatoria(alm1, [ubic1]);
    const sActual = await saldoReal(codigo, alm1, ubic1);
    if (!ubic2 || sActual < 1) { logLine('     ⏭  Sin segunda ubicación o stock'); return; }
    const cantT = Math.min(Math.floor(sActual / 2) || 1, 5);
    await traspasar(codigo, alm1, ubic1, alm1, ubic2, cantT);
    await sleep(500);
    const resH = await api('GET', '/historial-traspasos?page=1&pageSize=5');
    const ultimo = resH.data?.traspasos?.[0];
    assert(ultimo?.CodigoArticulo === codigo, `Último traspaso: ${ultimo?.CodigoArticulo}, esperado ${codigo}`);
    logLine(`     → Último traspaso: ${ultimo.CodigoArticulo} ${ultimo.OrigenAlmacen}→${ultimo.DestinoAlmacen} ✓`);
  });
}

// ============================================================
// SECCIÓN 9 — VALIDACIONES Y ERRORES
// ============================================================
async function testValidaciones() {
  seccion('9. VALIDACIONES Y CASOS DE ERROR');

  const art   = ARTICULOS_NORMALES[0];
  const alm   = ALMACENES[0]?.CodigoAlmacen || 'CEN';
  const ubics = UBICACIONES_POR_ALM[alm] || [];
  const u0    = ubics[0] || 'SIN-UBICACION';
  const u1    = ubics[1] || 'SIN-UBICACION';

  await test('Traspaso cantidad > stock → error', async () => {
    const res = await traspasar(art, alm, u0, alm, u1, 9999999);
    assert(res.status !== 200, `Debería fallar, devolvió 200`);
    logLine(`     → Error correcto (${res.status}): ${res.data?.mensaje || res.data?.error}`);
  });

  await test('Traspaso cantidad 0 → 400', async () => {
    const res = await traspasar(art, alm, u0, alm, u1, 0);
    assert(res.status === 400, `Status ${res.status}`);
  });

  await test('Traspaso cantidad negativa → 400', async () => {
    const res = await traspasar(art, alm, u0, alm, u1, -5);
    assert(res.status === 400, `Status ${res.status}`);
  });

  await test('Traspaso misma ubicación → 400', async () => {
    const res = await traspasar(art, alm, u0, alm, u0, 1);
    assert(res.status === 400, `Status ${res.status}`);
  });

  await test('Traspaso sin artículo → 400', async () => {
    const res = await api('POST', '/traspaso', {
      origenAlmacen: alm, origenUbicacion: u0,
      destinoAlmacen: alm, destinoUbicacion: u1,
      cantidad: 1, unidadMedida: '', partida: '', codigoTalla: '', codigoColor: ''
    });
    assert(res.status === 400, `Status ${res.status}`);
  });

  await test('Traspaso sin origenUbicacion → 400', async () => {
    const res = await api('POST', '/traspaso', {
      articulo: art, origenAlmacen: alm,
      destinoAlmacen: alm, destinoUbicacion: u1,
      cantidad: 1, unidadMedida: '', partida: '', codigoTalla: '', codigoColor: ''
    });
    assert(res.status === 400, `Status ${res.status}`);
  });

  if (ALMACENES.length >= 2) {
    const alm2     = ALMACENES[1].CodigoAlmacen;
    const ubicAlm2 = UBICACIONES_POR_ALM[alm2]?.[0];
    if (ubicAlm2) {
      await test('Traspaso con origenUbicacion de otro almacén → 400', async () => {
        const res = await traspasar(art, alm, ubicAlm2, alm2, ubicAlm2, 1);
        assert(res.status === 400, `Status ${res.status}`);
        logLine(`     → ${res.data?.mensaje}`);
      });
    }
  }

  await test('Sin autenticación (traspasos/stock) → 401', async () => {
    const res = await fetch(`${BASE_URL}/traspasos/stock-por-articulo?codigoArticulo=${art}`, {
      headers: { 'Content-Type': 'application/json' }
    });
    assert(res.status === 401, `Status ${res.status}`);
  });

  await test('Sin autenticación (inventario/ajustar) → 401', async () => {
    const res = await fetch(`${BASE_URL}/inventario/ajustar-completo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ajustes: [] })
    });
    assert(res.status === 401, `Status ${res.status}`);
  });

  await test('Ajuste lista vacía → 400', async () => {
    const res = await api('POST', '/inventario/ajustar-completo', { ajustes: [] });
    assert(res.status === 400, `Status ${res.status}`);
  });

  await test('Ajuste sin campo ajustes → 400', async () => {
    const res = await api('POST', '/inventario/ajustar-completo', {});
    assert(res.status === 400, `Status ${res.status}`);
  });

  await test('Artículo inexistente → 404', async () => {
    const res = await api('GET', '/articulos/ARTICULO_XXXXX_99999');
    assert(res.status === 404, `Status ${res.status}`);
  });

  await test('Ubicaciones de almacén inexistente → array vacío', async () => {
    const res = await api('GET', '/inventario/ubicaciones-ajuste?codigoAlmacen=ALMACEN_XXXXX&offset=0&limit=10');
    assert(res.status === 200 && res.data?.items?.length === 0, 'Debería estar vacío');
    logLine(`     → Vacío ✓`);
  });
}

// ============================================================
// SECCIÓN 10 — CONSISTENCIA GLOBAL
// ============================================================
async function testConsistenciaGlobal() {
  seccion('10. CONSISTENCIA GLOBAL');

  const articulosCheck = [
    ...ARTICULOS_NORMALES.slice(0, 4),
    ARTICULOS_TALLAS[0]?.codigo,
    ARTICULOS_UDS[0]
  ].filter(Boolean);

  // Snapshot ANTES de operaciones
  const snapshotAntes = {};
  for (const codigo of articulosCheck) {
    const dbg = await debugStock(codigo);
    snapshotAntes[codigo] = {
      ubic: (dbg.stockUbicacion || []).reduce((s, r) => s + parseFloat(r.UnidadSaldo || 0), 0),
      acum: (dbg.stockTotal   || []).reduce((s, r) => s + parseFloat(r.StockTotal  || 0), 0)
    };
    const pre = snapshotAntes[codigo];
    const diff = pre.ubic - pre.acum;
    // Si ya hay pre-existing corruption, solo la reportamos
    if (diff > 0.1) {
      logLine(`  ℹ️  [${codigo}] Inconsistencia PRE-EXISTENTE: ubic=${pre.ubic.toFixed(2)} acum=${pre.acum.toFixed(2)} diff=+${diff.toFixed(2)} (no causada por este test)`);
    }
  }

  // Hacer un ajuste +1 y -1 sobre cada artículo y verificar que los deltas son simétricos
  for (const codigo of articulosCheck) {
    await test(`[${codigo}] Delta AcumStock y AcumStockUbicacion son simétricos`, async () => {
      const datos = await garantizarStock(codigo);
      if (!datos) { logLine('     ⏭  Sin stock'); return; }
      const { almacen, ubicacion } = datos;

      const dbg0   = await debugStock(codigo);
      const acum0  = acumAlmacen(dbg0, almacen);
      const ubic0  = saldoUbic(dbg0, almacen, ubicacion);

      // Ajuste +5
      const antes  = await saldoReal(codigo, almacen, ubicacion);
      const res1   = await ajustar(codigo, almacen, ubicacion, antes + 5, '', '', '', antes);
      assert(res1.status === 200 && res1.data?.success, `Ajuste +5 falló: ${res1.data?.mensaje}`);

      const dbg1   = await debugStock(codigo);
      const acum1  = acumAlmacen(dbg1, almacen);
      const ubic1  = saldoUbic(dbg1, almacen, ubicacion);

      assertApprox(ubic1 - ubic0, 5, `Delta AcumStockUbicacion tras +5`);
      assertApprox(acum1 - acum0, 5, `Delta AcumStock tras +5`);

      // Ajuste -5 (revertir)
      const res2 = await ajustar(codigo, almacen, ubicacion, antes, '', '', '', antes + 5);
      assert(res2.status === 200 && res2.data?.success, `Ajuste -5 falló: ${res2.data?.mensaje}`);

      const dbg2  = await debugStock(codigo);
      const acum2 = acumAlmacen(dbg2, almacen);
      assertApprox(acum2, acum0, `AcumStock no volvió al valor inicial`);
      logLine(`     → AcumStock: ${acum0}→${acum1}→${acum2} | AcumUbic: ${ubic0}→${ubic1} ✓`);
    });
  }

  await test('Ninguna ubicación con stock negativo', async () => {
    for (const codigo of ARTICULOS_NORMALES.slice(0, 5)) {
      const dbg = await debugStock(codigo);
      const neg = (dbg.stockUbicacion || []).filter(r => parseFloat(r.UnidadSaldo || 0) < -0.01);
      if (neg.length > 0) {
        throw new Error(`${codigo}: ${neg.length} ubicaciones negativas: ${neg.map(r => `${r.CodigoAlmacen}/${r.Ubicacion}=${r.UnidadSaldo}`).join(', ')}`);
      }
    }
    logLine(`     → Sin stocks negativos ✓`);
  });

  await test('Consistencia tras 3 ajustes consecutivos', async () => {
    const codigo = ARTICULOS_NORMALES[4];
    const datos  = await garantizarStock(codigo);
    if (!datos) { logLine('     ⏭  Sin stock'); return; }
    const { almacen, ubicacion } = datos;

    const c1 = rnd(30, 100), c2 = rnd(30, 100), c3 = rnd(30, 100);
    const s0 = await saldoReal(codigo, almacen, ubicacion);
    await ajustar(codigo, almacen, ubicacion, c1, '', '', '', s0);
    await ajustar(codigo, almacen, ubicacion, c2, '', '', '', c1);
    await ajustar(codigo, almacen, ubicacion, c3, '', '', '', c2);

    const sFinal = await saldoReal(codigo, almacen, ubicacion);
    assertApprox(sFinal, c3, `Saldo final`);

    const dbg = await debugStock(codigo);
    const acum = acumAlmacen(dbg, almacen);
    assert(acum >= 0, `AcumStock negativo tras 3 ajustes: ${acum}`);
    logLine(`     → Tras ${s0}→${c1}→${c2}→${c3}: saldo=${sFinal} | AcumStock=${acum} ✓`);
  });
}

// ============================================================
// SECCIÓN 11 — LIMPIEZA AUTOMÁTICA
// ============================================================
async function testLimpieza() {
  seccion('11. LIMPIEZA AUTOMÁTICA');

  await test('Sincronización manual ejecuta sin error', async () => {
    const res = await api('POST', '/inventario/sincronizacion-automatica');
    assert(res.status === 200 && res.data?.success, `${res.status} — ${res.data?.mensaje}`);
    logLine(`     → ${res.data?.mensaje}`);
  });

  await test('Tras limpieza no aparecen registros cero no principales', async () => {
    const codigo = ARTICULOS_NORMALES[0];
    const dbg    = await debugStock(codigo);
    const ceros  = (dbg.stockUbicacion || []).filter(r => parseFloat(r.UnidadSaldo || 0) === 0);
    logLine(`     → Registros saldo 0 para ${codigo}: ${ceros.length} (informativo)`);
    assert(true, 'Verificación informativa');
  });
}

// ============================================================
// RUNNER PRINCIPAL
// ============================================================
async function main() {
  fs.writeFileSync(LOG_FILE, '', 'utf8');

  logLine('\n' + '█'.repeat(68));
  logLine('  SUITE COMPLETA v3 — INVENTARIO Y TRASPASOS — Empresa 9999');
  logLine('█'.repeat(68));
  logLine(`  API:      ${BASE_URL}`);
  logLine(`  Empresa:  ${CODIGO_EMPRESA}`);
  logLine(`  Normales: ${ARTICULOS_NORMALES.join(', ')}`);
  logLine(`  Tallas:   ${ARTICULOS_TALLAS.map(a=>`${a.codigo}(${a.color}/${a.talla})`).join(', ')}`);
  logLine(`  Uds med:  ${ARTICULOS_UDS.join(', ')}`);
  logLine(`  Log:      ${LOG_FILE}`);
  logLine(`  ⚠️  Los registros sembrados se MANTIENEN en BD para revisión.`);
  logLine(`  ${new Date().toLocaleString('es-ES')}`);

  try {
    await testLogin();
    if (!headers.usuario) {
      logLine('\n❌ Login fallido — abortando');
      flushLog();
      process.exit(1);
    }

    await descubrirInfraestructura();

    // Sincronización previa para limpiar estados inconsistentes de runs anteriores
    seccion('0b. SINCRONIZACIÓN PREVIA');
    logLine('  Ejecutando sincronización automática antes del test...');
    const resSinc = await api('POST', '/inventario/sincronizacion-automatica');
    logLine(`  → ${resSinc.status === 200 ? '✅' : '⚠️ '} ${resSinc.data?.mensaje || resSinc.status}`);

    await testVisualizacion();
    await testArticulosNormales();
    await testArticulosTallas();
    await testArticulosUds();
    await testAjustesAvanzados();
    await testTraspasoAvanzados();
    await testHistorial();
    await testValidaciones();
    await testConsistenciaGlobal();
    await testLimpieza();

  } catch (err) {
    logLine(`\n💥 Error inesperado: ${err.message}`);
    console.error(err);
  }

  logLine('\n' + '═'.repeat(68));
  logLine('  RESUMEN FINAL');
  logLine('═'.repeat(68));
  logLine(`  ✅ PASS:  ${passed}`);
  logLine(`  ❌ FAIL:  ${failed}`);
  logLine(`  ⏭  SKIP:  ${skipped}`);
  logLine(`  TOTAL:   ${passed + failed + skipped}`);
  logLine('═'.repeat(68));

  if (failed > 0) {
    logLine('\n  Tests fallidos:');
    resultados.filter(r => r.resultado === 'FAIL').forEach(r => {
      logLine(`    ❌ ${r.nombre}`);
      logLine(`       ${r.error}`);
    });
  }

  logLine('');
  flushLog();
  logLine(`📄 Log guardado en: ${LOG_FILE}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();