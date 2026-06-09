/**
 * ============================================================
 * CONFIGURACIÓN DEL CLIENTE
 * ============================================================
 * Edita SOLO este archivo al instalar en un nuevo cliente.
 * El resto del sistema lo lee automáticamente al arrancar.
 * ============================================================
 */

const clienteConfig = {
  // ── IDENTIFICACIÓN ─────────────────────────────────────────
  // Solo informativo — sirve para identificar la instalación en los logs.
  nombreCliente: 'Cliente Demo',

  // CodigoEmpresa en Sage200. TODAS las queries lo usan.
  // Cámbialo aquí y se propaga a todo el sistema.
  codigoEmpresa: 1,

  // ── ALMACENES ──────────────────────────────────────────────
  // Códigos de almacén habilitados en traspasos e inventario.
  // [] = todos los almacenes de la empresa en Sage.
  almacenesPermitidos: ['CEN', 'BCN', 'N5', 'N1', 'PK', '5', '000', 'SEC', 'R'],

  // ── SERIES DE PEDIDO EXCLUIDAS ─────────────────────────────
  // Pedidos con estas series NO aparecen en la pantalla de picking.
  seriesPedidoExcluidas: ['X', 'R'],

  // ── FORMAS DE ENVÍO ────────────────────────────────────────
  // FormaEnvio (número Sage) → etiqueta visible en el frontend.
  formasEnvio: {
    1: 'Recogida almacén',
    3: 'Nuestros medios',
    4: 'Agencia',
    5: 'Directo fábrica',
    6: 'Pedido express',
  },

  // ── CATEGORÍAS DE EMPLEADOS ────────────────────────────────
  // Valor de CodigoCategoriaCliente_ para identificar empleados/preparadores.
  categoriaEmpleado: 'emp',

  // ── FUNCIONALIDADES ────────────────────────────────────────
  usaMultipleUbicacion: false,
  usaLotes:             false,
  usaPartidas:          false,
  usaComponentes:       false,

  // ── PEDIDOS DE VENTA ───────────────────────────────────────
  pedidosVenta: {
    mostrarPrecio:           false,
    permitirCantidadParcial: true,
  },

  // ── ALBARANES / RUTAS ──────────────────────────────────────
  albaranes: {
    requiereFirma: false,
    requiereFoto:  false,
  },

  // ── INVENTARIO ─────────────────────────────────────────────
  inventario: {
    habilitado:            true,
    permitirNuevoArticulo: false,
  },

  // ── TRASPASOS ──────────────────────────────────────────────
  traspasos: { habilitado: true },

  // ── RECEPCIÓN DE COMPRAS ───────────────────────────────────
  recepcionCompras: { habilitado: true },
};

// ── VALIDACIÓN AL ARRANQUE ─────────────────────────────────────────────
function validateClienteConfig(config) {
  const errors = [];
  if (!config.nombreCliente)
    errors.push('nombreCliente es obligatorio');
  if (typeof config.codigoEmpresa !== 'number' || config.codigoEmpresa <= 0)
    errors.push('codigoEmpresa debe ser un número positivo');
  if (!Array.isArray(config.almacenesPermitidos))
    errors.push('almacenesPermitidos debe ser un array');
  if (!Array.isArray(config.seriesPedidoExcluidas))
    errors.push('seriesPedidoExcluidas debe ser un array');
  if (typeof config.formasEnvio !== 'object')
    errors.push('formasEnvio debe ser un objeto');
  if (!config.categoriaEmpleado)
    errors.push('categoriaEmpleado es obligatorio');
  if (errors.length > 0)
    throw new Error(`[ClienteConfig] Configuración inválida:\n  - ${errors.join('\n  - ')}`);
}

/**
 * Validación contra BD: verifica que codigoEmpresa existe en Sage.
 * Llámala desde iniciarServidor() en index.js, después de connectDB().
 */
async function validateCodigoEmpresaEnBD(getPool, sql) {
  const result = await getPool().request()
    .input('codigoEmpresa', sql.SmallInt, clienteConfig.codigoEmpresa)
    .query(`SELECT CodigoEmpresa FROM Empresas WHERE CodigoEmpresa = @codigoEmpresa`);

  if (result.recordset.length === 0) {
    throw new Error(
      `[ClienteConfig] codigoEmpresa=${clienteConfig.codigoEmpresa} no existe en la tabla Empresas de Sage. ` +
      `Revisa backend/config/cliente.js`
    );
  }
  console.log(`✅ CodigoEmpresa ${clienteConfig.codigoEmpresa} (${clienteConfig.nombreCliente}) verificado en BD.`);
}

function logClienteConfig(config) {
  const almacenes = config.almacenesPermitidos.length ? config.almacenesPermitidos.join(', ') : 'Todos';
  const series    = config.seriesPedidoExcluidas.length ? config.seriesPedidoExcluidas.join(', ') : 'Ninguna';
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║        CONFIGURACIÓN DEL CLIENTE                                       ║');
  console.log('╠════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Cliente:      ${config.nombreCliente.substring(0,26).padEnd(26)}║`);
  console.log(`║  CodEmpresa:   ${String(config.codigoEmpresa).padEnd(26)}║`);
  console.log(`║  Almacenes:    ${almacenes.substring(0,26).padEnd(26)}║`);
  console.log(`║  Series excl.: ${series.substring(0,26).padEnd(26)}║`);
  console.log('╠════════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Ubicaciones:  ${String(config.usaMultipleUbicacion).padEnd(26)}║`);
  console.log(`║  Lotes:        ${String(config.usaLotes).padEnd(26)}║`);
  console.log(`║  Partidas:     ${String(config.usaPartidas).padEnd(26)}║`);
  console.log(`║  Componentes:  ${String(config.usaComponentes).padEnd(26)}║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
}

validateClienteConfig(clienteConfig);

module.exports = { clienteConfig, validateClienteConfig, validateCodigoEmpresaEnBD, logClienteConfig };