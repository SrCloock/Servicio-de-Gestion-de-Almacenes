const cors = require('cors');

module.exports = function createCorsMiddleware({ allowedOrigins }) {
  return cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = `Origen ${origin} no permitido por CORS`;
        console.warn('CORS blocked:', origin);
        return callback(new Error(msg), false);
      }

      return callback(null, true);
    },
    credentials: true
  });
};
