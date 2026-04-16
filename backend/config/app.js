const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';
const PUBLIC_IP = process.env.PUBLIC_IP || '80.24.244.68';
const PUBLIC_PORT = process.env.PORT || 3000;
const FRONTEND_DEV_ORIGIN = process.env.FRONTEND_DEV_ORIGIN || 'http://localhost:5173';
const allowedOrigins = isProduction
  ? [
      `http://${PUBLIC_IP}:${PUBLIC_PORT}`,
      FRONTEND_DEV_ORIGIN,
      'http://localhost:3000'
    ]
  : [
      FRONTEND_DEV_ORIGIN,
      'http://localhost:3000',
      `http://${PUBLIC_IP}:${PUBLIC_PORT}`
    ];

// La build del frontend se genera en frontend/dist y esa será
// la ruta única que el backend usará para servir la SPA.
const distPath = path.join(__dirname, '..', '..', 'frontend', 'dist');

module.exports = {
  isProduction,
  PUBLIC_IP,
  PUBLIC_PORT,
  FRONTEND_DEV_ORIGIN,
  allowedOrigins,
  distPath
};
