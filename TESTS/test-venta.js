// ============================================================
// test-automatico-completo.js
// Tester automático: login real, sirve pedidos aleatorios,
// genera albaranes parciales y completos, verifica resultados.
//
// USO (PowerShell):
//   node .\test-automatico-completo.js
//
// OPCIONES (editar sección CONFIG abajo o usar env vars):
//   API_URL        default: http://localhost:3000
//   USUARIO        default: margarita
//   CONTRASENA     default: margarita
//   CODIGO_EMPRESA default: 1
//   MAX_PEDIDOS    default: 5
//   MODO           parcial | completo | mixto   default: mixto
//   DRY_RUN        1 = solo muestra sin ejecutar default: 0
// ============================================================

const http  = require('http');
const https = require('https');

// ── CONFIG ── editar aquí si no usas variables de entorno ───
const CFG = {
  BASE_URL:       process.env.API_URL        || 'http://localhost:3000',
  USUARIO:        process.env.USUARIO        || 'margarita',
  CONTRASENA:     process.env.CONTRASENA     || 'margarita',
  CODIGO_EMPRESA: parseInt(process.env.CODIGO_EMPRESA || '1', 10),
  MAX_PEDIDOS:    parseInt(process.env.MAX_PEDIDOS    || '5', 10),
  MODO:           process.env.MODO           || 'mixto',
  DRY_RUN:        process.env.DRY_RUN        === '1',
  PEDIDO_FIJO:    process.env.NUMERO_PEDIDO  ? parseInt(process.env.NUMERO_PEDIDO, 10) : null,
  // Se rellena tras el login:
  TOKEN:          '',
  USER_DATA:      null,
};

// ── LOGGER ──────────────────────────────────────────────────
const ts  = () => new Date().toISOString().replace('T',' ').slice(0,19);
const log = (m,d) => { process.stdout.write(`[${ts()}]  ${m}\n`);  if(d!==undefined) console.dir(d,{depth:3}); };
const ok  = (m,d) => { process.stdout.write(`[${ts()}] ✅ ${m}\n`); if(d!==undefined) console.dir(d,{depth:3}); };
const err = (m,d) => { process.stdout.write(`[${ts()}] ❌ ${m}\n`); if(d!==undefined) console.dir(d,{depth:3}); };
const inf = (m,d) => { process.stdout.write(`[${ts()}] ℹ️  ${m}\n`); if(d!==undefined) console.dir(d,{depth:3}); };
const sep = (t)   => { const l=t?`── ${t} ──`:'──────────────────────────────'; console.log('\n'+l+'\n'); };

// ── HTTP SIN AUTH (para login) ───────────────────────────────
function rawRequest(method, path, body, headers={}) {
  return new Promise((resolve, reject) => {
    const url     = new URL(CFG.BASE_URL + path);
    const isHttps = url.protocol === 'https:';
    const lib     = isHttps ? https : http;
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end',  () => {
        try   { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// HTTP CON AUTH — headers usuario y codigoempresa (igual que getAuthHeader del frontend)
function request(method, path, body) {
  const authHeaders = CFG.USER_DATA ? {
    'usuario':       CFG.USER_DATA.UsuarioLogicNet,
    'codigoempresa': String(CFG.USER_DATA.CodigoEmpresa),
  } : {};
  return rawRequest(method, path, body || undefined, authHeaders);
}
const GET  = (p)    => request('GET',  p, null);
const POST = (p, b) => request('POST', p, b);

// ── RESULTADOS GLOBALES ──────────────────────────────────────
const resultados = {
  pedidosProcesados:  [],
  albaranesGenerados: [],
  errores:            [],
  inicio:             Date.now(),
};

// ── STEP 1: LOGIN ────────────────────────────────────────────
async function login() {
  inf(`Haciendo login con usuario: ${CFG.USUARIO}`);
  const res = await rawRequest('POST', '/login', {
    usuario:   CFG.USUARIO,
    contrasena: CFG.CONTRASENA,
  });

  if (res.status !== 200 || !res.data?.success) {
    err('Login fallido', res.data);
    return false;
  }

  CFG.USER_DATA = res.data.datos; // objeto completo del usuario desde la BD

  ok(`Login correcto — usuario: ${CFG.USER_DATA?.UsuarioLogicNet || CFG.USUARIO}`, {
    CodigoEmpresa:   CFG.USER_DATA?.CodigoEmpresa,
    StatusAdmin:     CFG.USER_DATA?.StatusAdministrador,
    CodigoCliente:   CFG.USER_DATA?.CodigoCliente,
  });

  // Sobreescribir CODIGO_EMPRESA con el del usuario si no se especificó
  if (CFG.USER_DATA?.CodigoEmpresa && CFG.CODIGO_EMPRESA === 1) {
    CFG.CODIGO_EMPRESA = CFG.USER_DATA.CodigoEmpresa;
    inf(`CodigoEmpresa del usuario: ${CFG.CODIGO_EMPRESA}`);
  }

  return true;
}

// ── STEP 2: OBTENER PEDIDOS PENDIENTES ───────────────────────
async function obtenerPedidosPendientes() {
  inf('Obteniendo pedidos pendientes (rango: todos)...');
  const res = await GET(`/pedidosPendientes?rango=todos&codigoEmpresa=${CFG.CODIGO_EMPRESA}`);

  if (res.status === 401) {
    err('No autenticado — comprueba que el backend valida la sesión correctamente');
    err('Respuesta del servidor:', res.data);
    return [];
  }
  if (res.status !== 200) {
    err(`Error ${res.status} obteniendo pedidos`, res.data);
    return [];
  }

  const pedidos = Array.isArray(res.data) ? res.data : [];
  inf(`${pedidos.length} pedidos pendientes encontrados`);
  return pedidos;
}

// ── STEP 3: STOCK PARA UN ARTÍCULO ───────────────────────────
async function obtenerStock(codigoArticulo) {
  const res = await GET(`/traspasos/stock-por-articulo?codigoArticulo=${encodeURIComponent(codigoArticulo)}`);
  if (res.status !== 200) return [];
  return (Array.isArray(res.data) ? res.data : []).filter(u => {
    const esDescarga = u.Ubicacion === 'Zona descarga';
    const esSinUbi   = !u.Ubicacion || u.Ubicacion === 'SIN-UBICACION' || !u.Ubicacion.trim();
    return !esDescarga && !esSinUbi && parseFloat(u.Cantidad) > 0;
  });
}

// ── STEP 4: EXPEDIR UNA LÍNEA ────────────────────────────────
async function expedirLinea(pedido, linea, ubicacion, cantidad) {
  const payload = {
    codigoEmpresa:    pedido.codigoEmpresa,
    ejercicio:        pedido.ejercicioPedido,
    serie:            pedido.seriePedido || '',
    numeroPedido:     pedido.numeroPedido,
    codigoArticulo:   linea.codigoArticulo,
    cantidadExpedida: cantidad,
    almacen:          ubicacion.CodigoAlmacen  || ubicacion.codigoAlmacen,
    ubicacion:        ubicacion.Ubicacion      || ubicacion.ubicacion,
    partida:          ubicacion.Partida        || ubicacion.partida  || '',
    unidadMedida:     ubicacion.UnidadStock    || ubicacion.unidadMedida || 'unidades',
    codigoColor:      ubicacion.CodigoColor_   || ubicacion.codigoColor  || '',
    codigoTalla:      ubicacion.CodigoTalla01_ || ubicacion.codigoTalla  || '',
    esZonaDescarga:   false,
    movPosicionLinea: linea.movPosicionLinea,
  };

  if (CFG.DRY_RUN) {
    inf(`  [DRY-RUN] Expediría ${cantidad} u. de ${linea.codigoArticulo} desde ${payload.almacen}/${payload.ubicacion}`);
    return { success: true, detalles: { pedidoCompletado: false, pedidoParcial: true, albaranGenerado: false, unidadesPendientesRestantes: 0 } };
  }

  const res = await POST('/actualizarLineaPedido', payload);
  if (res.status !== 200 || !res.data?.success) {
    err(`  Error expidiendo ${linea.codigoArticulo} — HTTP ${res.status}`, {
      mensaje: res.data?.mensaje,
      error:   res.data?.error,
      payload: {
        articulo:  payload.codigoArticulo,
        cantidad:  payload.cantidadExpedida,
        almacen:   payload.almacen,
        ubicacion: payload.ubicacion,
        movPosicion: payload.movPosicionLinea,
      }
    });
    return null;
  }
  return res.data;
}

// ── STEP 5: GENERAR ALBARÁN PARCIAL ──────────────────────────
async function generarAlbaranParcial(pedido) {
  if (CFG.DRY_RUN) { inf(`[DRY-RUN] Generaría albarán PARCIAL para #${pedido.numeroPedido}`); return null; }
  const res = await POST('/generarAlbaranParcial', {
    codigoEmpresa: pedido.codigoEmpresa,
    ejercicio:     pedido.ejercicioPedido,
    serie:         pedido.seriePedido || '',
    numeroPedido:  pedido.numeroPedido,
  });
  if (res.status !== 200 || !res.data?.success) {
    err('Error generando albarán parcial', res.data);
    return null;
  }
  return res.data.albaran;
}

// ── STEP 6: GENERAR ALBARÁN COMPLETO ─────────────────────────
async function generarAlbaranCompleto(pedido) {
  if (CFG.DRY_RUN) { inf(`[DRY-RUN] Generaría albarán COMPLETO para #${pedido.numeroPedido}`); return null; }
  const res = await POST('/generarAlbaranAutoCompletado', {
    codigoEmpresa: pedido.codigoEmpresa,
    ejercicio:     pedido.ejercicioPedido,
    serie:         pedido.seriePedido || '',
    numeroPedido:  pedido.numeroPedido,
  });
  if (res.status !== 200 || !res.data?.success) {
    err('Error generando albarán completo', res.data);
    return null;
  }
  return res.data.albaran;
}

// ── STEP 7: PROCESAR UN PEDIDO COMPLETO ──────────────────────
async function procesarPedido(pedido, modoPedido) {
  sep(`PEDIDO #${pedido.numeroPedido} — ${pedido.razonSocial}`);
  inf(`Status: ${pedido.Status} | Envío: ${pedido.FormaEnvio} | Líneas: ${pedido.articulos?.length || 0}`);

  const lineasPendientes = (pedido.articulos || []).filter(a => parseFloat(a.unidadesPendientes) > 0);
  if (lineasPendientes.length === 0) { inf('Sin líneas pendientes, omitiendo'); return; }

  // Cuántas líneas expedir según modo
  const lineasAExpedir = modoPedido === 'parcial'
    ? lineasPendientes.slice(0, Math.max(1, Math.floor(lineasPendientes.length / 2))) // mitad
    : lineasPendientes; // todas

  inf(`Modo ${modoPedido.toUpperCase()}: expediendo ${lineasAExpedir.length} de ${lineasPendientes.length} líneas`);

  const lineasExpedidas = [];
  let albaranAutoGenerado = null;

  for (const linea of lineasAExpedir) {
    inf(`  → ${linea.codigoArticulo}: ${linea.unidadesPendientes} pendientes`);

    const ubicaciones = await obtenerStock(linea.codigoArticulo);
    if (ubicaciones.length === 0) {
      inf(`    Sin stock real en ninguna ubicacion — omitiendo ${linea.codigoArticulo}`);
      continue;
    }
    inf(`    Stock encontrado: ${ubicaciones.length} ubicaciones`, ubicaciones.map(u=>(`${u.CodigoAlmacen}/${u.Ubicacion}: ${u.Cantidad} ${u.UnidadStock||'ud'}`)));

    const ubicacion    = ubicaciones.sort((a,b) => parseFloat(b.Cantidad)-parseFloat(a.Cantidad))[0];
    const stockDisp    = parseFloat(ubicacion.Cantidad) || 0;
    const pendiente    = parseFloat(linea.unidadesPendientes) || 0;
    const cantidad     = Math.min(pendiente, stockDisp);

    if (cantidad <= 0) { inf(`    Stock 0 en ${ubicacion.Ubicacion} — omitiendo`); continue; }

    inf(`    Expidiendo ${cantidad} u. desde ${ubicacion.CodigoAlmacen}/${ubicacion.Ubicacion} (stock disponible: ${stockDisp})`);

    const resultado = await expedirLinea(pedido, linea, ubicacion, cantidad);
    if (!resultado) {
      resultados.errores.push({ pedido: pedido.numeroPedido, linea: linea.codigoArticulo, error: 'fallo expedicion' });
      continue;
    }

    ok(`    ✓ Expedidas ${cantidad} u. | pendientes restantes: ${resultado.detalles?.unidadesPendientesRestantes ?? '?'} | status: ${resultado.detalles?.statusPedido ?? '?'}`);
    lineasExpedidas.push({ articulo: linea.codigoArticulo, cantidad, ubicacion: ubicacion.Ubicacion });

    if (resultado.detalles?.albaranGenerado && resultado.detalles?.albaran) {
      albaranAutoGenerado = resultado.detalles.albaran;
      ok(`    Albarán automático generado: #${albaranAutoGenerado.numero}`, albaranAutoGenerado);
    }
  }

  if (lineasExpedidas.length === 0) { inf('  No se expidió ninguna línea'); return; }

  resultados.pedidosProcesados.push({
    numeroPedido:  pedido.numeroPedido,
    razonSocial:   pedido.razonSocial,
    modo:          modoPedido,
    lineasExpedidas,
  });

  // Si ya hay albarán automático, registrar y salir
  if (albaranAutoGenerado) {
    resultados.albaranesGenerados.push({ tipo: 'automatico-completo', pedido: pedido.numeroPedido, ...albaranAutoGenerado });
    return;
  }

  // Generar albarán manualmente
  let albaran = null;

  if (modoPedido === 'parcial') {
    inf('  Generando albarán PARCIAL...');
    albaran = await generarAlbaranParcial(pedido);
    if (albaran) ok(`  Albarán parcial #${albaran.numero} generado ✓`);
  } else {
    inf('  Generando albarán COMPLETO...');
    albaran = await generarAlbaranCompleto(pedido);
    if (albaran) {
      ok(`  Albarán completo #${albaran.numero} generado ✓`);
    } else {
      // Fallback: si el pedido no está 100% expedido, intentar parcial
      inf('  Pedido no 100% expedido → intentando albarán PARCIAL como fallback...');
      albaran = await generarAlbaranParcial(pedido);
      if (albaran) ok(`  Albarán parcial (fallback) #${albaran.numero} generado ✓`);
    }
  }

  if (albaran) {
    resultados.albaranesGenerados.push({ tipo: modoPedido, pedido: pedido.numeroPedido, ...albaran });
  } else {
    resultados.errores.push({ pedido: pedido.numeroPedido, error: 'albarán no generado' });
  }
}

// ── MAIN ─────────────────────────────────────────────────────
async function main() {
  sep('TEST AUTOMÁTICO — EXPEDICIÓN Y ALBARANES');
  log('Configuración:', {
    url:        CFG.BASE_URL,
    usuario:    CFG.USUARIO,
    empresa:    CFG.CODIGO_EMPRESA,
    maxPedidos: CFG.MAX_PEDIDOS,
    modo:       CFG.MODO,
    dryRun:     CFG.DRY_RUN,
  });

  // 1. Login
  const loginOk = await login();
  if (!loginOk) { err('No se pudo hacer login. Abortando.'); process.exit(1); }

  // 2. Obtener pedidos
  const pedidos = await obtenerPedidosPendientes();
  if (pedidos.length === 0) { err('Sin pedidos disponibles'); process.exit(0); }

  // 3. Selección: fija si se especifica NUMERO_PEDIDO, aleatoria si no
  let seleccionados;
  if (CFG.PEDIDO_FIJO) {
    const encontrado = pedidos.find(p => p.numeroPedido === CFG.PEDIDO_FIJO);
    if (!encontrado) { err(`Pedido #${CFG.PEDIDO_FIJO} no encontrado en los pedidos pendientes`); process.exit(1); }
    seleccionados = [encontrado];
    inf(`Modo pedido fijo: procesando solo #${CFG.PEDIDO_FIJO}`);
  } else {
    seleccionados = [...pedidos]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(CFG.MAX_PEDIDOS, pedidos.length));
    inf(`Seleccionados ${seleccionados.length} pedidos aleatorios de ${pedidos.length} disponibles`);
  }

  // 4. Procesar
  for (let i = 0; i < seleccionados.length; i++) {
    const modoPedido = CFG.MODO === 'mixto'
      ? (i % 2 === 0 ? 'completo' : 'parcial')
      : CFG.MODO;

    try {
      await procesarPedido(seleccionados[i], modoPedido);
    } catch (e) {
      err(`Error en pedido #${seleccionados[i].numeroPedido}: ${e.message}`);
      resultados.errores.push({ pedido: seleccionados[i].numeroPedido, error: e.message });
    }

    if (i < seleccionados.length - 1) await new Promise(r => setTimeout(r, 400));
  }

  // ── RESUMEN ───────────────────────────────────────────────
  sep('RESUMEN FINAL');
  const dur = ((Date.now() - resultados.inicio) / 1000).toFixed(1);
  ok(`Pedidos procesados:  ${resultados.pedidosProcesados.length}`);
  ok(`Albaranes generados: ${resultados.albaranesGenerados.length}`);
  if (resultados.errores.length) err(`Errores:             ${resultados.errores.length}`, resultados.errores);
  log(`Tiempo total: ${dur}s`);

  if (resultados.albaranesGenerados.length > 0) {
    sep('QUERIES SQL — VERIFICAR ALBARANES EN BD');
    resultados.albaranesGenerados.forEach((alb, i) => {
      console.log(`\n[${i+1}] Pedido #${alb.pedido} → Albarán ${alb.tipo} #${alb.numero} (ejercicio ${alb.ejercicio})`);
      console.log(`     Líneas: ${alb.lineas??'?'} | Uds: ${alb.unidades??'?'} | Importe: ${alb.importe?parseFloat(alb.importe).toFixed(2)+'€':'?'}`);
      console.log(`     SELECT * FROM CabeceraAlbaranCliente WHERE NumeroAlbaran=${alb.numero} AND EjercicioAlbaran=${alb.ejercicio} AND CodigoEmpresa=${CFG.CODIGO_EMPRESA};`);
      console.log(`     SELECT * FROM LineasAlbaranCliente   WHERE NumeroAlbaran=${alb.numero} AND EjercicioAlbaran=${alb.ejercicio} AND CodigoEmpresa=${CFG.CODIGO_EMPRESA};`);
    });
  }

  if (resultados.pedidosProcesados.length > 0) {
    sep('QUERIES SQL — VERIFICAR PEDIDOS EN BD');
    resultados.pedidosProcesados.forEach(p => {
      console.log(`\nPedido #${p.numeroPedido} — ${p.razonSocial} (modo: ${p.modo})`);
      console.log(`  SELECT Estado,StatusAprobado,FechaCompletado FROM CabeceraPedidoCliente WHERE NumeroPedido=${p.numeroPedido} AND CodigoEmpresa=${CFG.CODIGO_EMPRESA};`);
      console.log(`  SELECT CodigoArticulo,UnidadesPedidas,UnidadesPendientes,UnidadesServidas FROM LineasPedidoCliente WHERE NumeroPedido=${p.numeroPedido} AND CodigoEmpresa=${CFG.CODIGO_EMPRESA};`);
    });
  }

  sep();
  if (CFG.DRY_RUN) inf('DRY-RUN activo — ninguna operación fue ejecutada realmente.');
}

main().catch(e => { err('Error fatal:', e.message); console.error(e); process.exit(1); });