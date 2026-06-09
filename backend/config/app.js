const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';
const PUBLIC_IP    = process.env.PUBLIC_IP  || 'localhost';
const PUBLIC_PORT  = process.env.PORT        || 3000;
const HOST         = process.env.HOST        || '0.0.0.0';

// En dev, el frontend corre en Vite (5173). En prod se sirve desde dist/.
const FRONTEND_DEV_ORIGIN = process.env.FRONTEND_DEV_ORIGIN || `http://localhost:5173`;

const allowedOrigins = [
  `http://${PUBLIC_IP}:${PUBLIC_PORT}`,  // acceso externo real
  `http://localhost:${PUBLIC_PORT}`,      // acceso local al backend
  FRONTEND_DEV_ORIGIN,                   // Vite en dev
];

// Deduplica por si alguna variable coincide
const uniqueOrigins = [...new Set(allowedOrigins)];

// La build del frontend se genera en frontend/dist
const distPath = path.join(__dirname, '..', '..', 'frontend', 'dist');

module.exports = {
  isProduction,
  PUBLIC_IP,
  PUBLIC_PORT,
  HOST,
  FRONTEND_DEV_ORIGIN,
  allowedOrigins: uniqueOrigins,
  distPath,
};