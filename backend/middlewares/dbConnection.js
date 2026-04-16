module.exports = function createDbConnectionMiddleware({ connectDB }) {
  return async (req, res, next) => {
    try {
      await connectDB();
      next();
    } catch (err) {
      console.error('Error de conexión:', err);
      res.status(500).json({
        success: false,
        mensaje: 'Error conectando a la base de datos.',
        error: err.message
      });
    }
  };
};
