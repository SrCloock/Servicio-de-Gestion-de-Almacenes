const cors = require('cors');

module.exports = function createCorsMiddleware({ allowedOrigins }) {
  return cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      let parsedOrigin;
      try {
        parsedOrigin = new URL(origin);
      } catch {
        parsedOrigin = null;
      }

      const isLocalDevOrigin = parsedOrigin
        && ['localhost', '127.0.0.1'].includes(parsedOrigin.hostname);

      if (!isLocalDevOrigin && allowedOrigins.indexOf(origin) === -1) {
        const msg = `Origen ${origin} no permitido por CORS`;
        console.warn('CORS blocked:', origin);
        return callback(new Error(msg), false);
      }

      return callback(null, true);
    },
    credentials: true
  });
};
