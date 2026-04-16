const express = require('express');

module.exports = function createDiagnosticsRouter({
  isProduction,
  PUBLIC_IP,
  PUBLIC_PORT,
  allowedOrigins,
  dbConfig,
  getPool
}) {
  const router = express.Router();

router.get('/api/diagnostic', (req, res) => {
  res.json({
    success: true,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    baseUrl: `${req.protocol}://${req.get('host')}`,
    publicIp: PUBLIC_IP,
    port: PUBLIC_PORT,
    isProduction: isProduction,
    headers: {
      origin: req.headers.origin,
      host: req.headers.host,
      usuario: req.headers.usuario,
      codigoempresa: req.headers.codigoempresa
    },
    database: {
      connected: !!getPool(),
      server: dbConfig.server
    },
    cors: {
      allowedOrigins: allowedOrigins
    }
  });
});

router.get('/diagnostic', (req, res) => {
  res.json({
    message: '✅ Backend funcionando correctamente',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});



// ============================================


  return router;
};
