const express = require('express');

const {
  isProduction,
  PUBLIC_IP,
  PUBLIC_PORT,
  HOST,
  allowedOrigins,
  distPath
} = require('./config/app');
const {
  sql,
  dbConfig,
  connectDB,
  getPool,
  closeDB
} = require('./config/db');
const { clienteConfig, logClienteConfig, validateCodigoEmpresaEnBD } = require('./config/cliente');

const createCorsMiddleware         = require('./middlewares/cors');
const createRequestLogger          = require('./middlewares/requestLogger');
const createDbConnectionMiddleware = require('./middlewares/dbConnection');
const createAuthMiddleware         = require('./middlewares/auth');
const createDiagnosticsRouter      = require('./routes/diagnostics');
const createGeneralRouter          = require('./routes/general');
const createLoginRouter            = require('./routes/login');
const createPedidosVentaRouter     = require('./routes/pedidosVenta');
const createAsignarPedidosRouter   = require('./routes/asignarPedidos');
const createAlbaranesRouter        = require('./routes/albaranes');
const createAsignarAlbaranesRouter = require('./routes/asignarAlbaranes');
const createInventarioRouter       = require('./routes/inventario');
const createTraspasosRouter        = require('./routes/traspasos');
const createPedidosCompraRouter    = require('./routes/pedidosCompra');
const createGestionDocumentalRouter = require('./routes/gestionDocumental');
const serveSpa                     = require('./utils/serveSpa');

const app = express();
const sharedDeps = { sql, getPool, clienteConfig };

console.log('🌍 Entorno:', isProduction ? 'PRODUCCIÓN' : 'DESARROLLO');
console.log('🎯 Orígenes CORS permitidos:', allowedOrigins);
logClienteConfig(clienteConfig);

app.use(createCorsMiddleware({ allowedOrigins }));
app.use(createRequestLogger({ isProduction }));
app.use(express.json());
serveSpa(app, { distPath });
app.use(createDbConnectionMiddleware({ connectDB }));

// ── RUTAS PÚBLICAS (antes del auth) ─────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({
    success: true,
    config: {
      nombreCliente:        clienteConfig.nombreCliente,
      usaMultipleUbicacion: clienteConfig.usaMultipleUbicacion,
      usaLotes:             clienteConfig.usaLotes,
      usaPartidas:          clienteConfig.usaPartidas,
      usaComponentes:       clienteConfig.usaComponentes,
      almacenesPermitidos:  clienteConfig.almacenesPermitidos,
      pedidosVenta:         clienteConfig.pedidosVenta,
      albaranes:            clienteConfig.albaranes,
      inventario:           clienteConfig.inventario,
      traspasos:            clienteConfig.traspasos,
      recepcionCompras:     clienteConfig.recepcionCompras,
    }
  });
});

// ── AUTH + ROUTERS PROTEGIDOS ────────────────────────────────
app.use(createAuthMiddleware({ clienteConfig }));

app.use(createDiagnosticsRouter({ isProduction, PUBLIC_IP, PUBLIC_PORT, allowedOrigins, dbConfig, getPool }));
app.use(createLoginRouter(sharedDeps));
app.use(createGeneralRouter(sharedDeps));
app.use(createPedidosVentaRouter(sharedDeps));
app.use(createAsignarPedidosRouter(sharedDeps));
app.use(createAlbaranesRouter(sharedDeps));
app.use(createAsignarAlbaranesRouter(sharedDeps));
app.use(createInventarioRouter(sharedDeps));
app.use(createTraspasosRouter(sharedDeps));
app.use(createPedidosCompraRouter(sharedDeps));
app.use(createGestionDocumentalRouter(sharedDeps));

async function iniciarServidor() {
  try {
    await connectDB();
    await validateCodigoEmpresaEnBD(getPool, sql);

    app.listen(PUBLIC_PORT, HOST, () => {
      console.log(`🚀 Servidor backend corriendo en http://${HOST}:${PUBLIC_PORT}`);
      console.log(`📱 Accesible desde:               http://${PUBLIC_IP}:${PUBLIC_PORT}`);
      console.log(`🔧 Entorno:                        ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('🛑 Cerrando servidor...');
  await closeDB();
  process.exit(0);
});

iniciarServidor();