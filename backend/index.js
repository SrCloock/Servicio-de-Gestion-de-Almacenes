const express = require('express');

const {
  isProduction,
  PUBLIC_IP,
  PUBLIC_PORT,
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
const createCorsMiddleware = require('./middlewares/cors');
const createRequestLogger = require('./middlewares/requestLogger');
const createDbConnectionMiddleware = require('./middlewares/dbConnection');
const createAuthMiddleware = require('./middlewares/auth');
const createDiagnosticsRouter = require('./routes/diagnostics');
const createGeneralRouter = require('./routes/general');
const createLoginRouter = require('./routes/login');
const createPedidosVentaRouter = require('./routes/pedidosVenta');
const createAsignarPedidosRouter = require('./routes/asignarPedidos');
const createAlbaranesRouter = require('./routes/albaranes');
const createAsignarAlbaranesRouter = require('./routes/asignarAlbaranes');
const createInventarioRouter = require('./routes/inventario');
const createTraspasosRouter = require('./routes/traspasos');
const createPedidosCompraRouter = require('./routes/pedidosCompra');
const createGestionDocumentalRouter = require('./routes/gestionDocumental');
const serveSpa = require('./utils/serveSpa');

const app = express();
const sharedDeps = { sql, getPool };

console.log('🌍 Entorno:', isProduction ? 'PRODUCCIÓN' : 'DESARROLLO');
console.log('🎯 Orígenes permitidos:', allowedOrigins);

app.use(createCorsMiddleware({ allowedOrigins }));
app.use(createRequestLogger({ isProduction }));
app.use(express.json());
serveSpa(app, { distPath });
app.use(createDbConnectionMiddleware({ connectDB }));
app.use(createAuthMiddleware());

app.use(createDiagnosticsRouter({
  isProduction,
  PUBLIC_IP,
  PUBLIC_PORT,
  allowedOrigins,
  dbConfig,
  getPool
}));
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

    app.listen(PUBLIC_PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor backend corriendo en http://0.0.0.0:${PUBLIC_PORT}`);
      console.log(`📱 Accesible desde: http://${PUBLIC_IP}:${PUBLIC_PORT}`);
      console.log(`🔧 Entorno: ${process.env.NODE_ENV || 'development'}`);
      console.log('🎯 Orígenes CORS permitidos:', allowedOrigins);
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
