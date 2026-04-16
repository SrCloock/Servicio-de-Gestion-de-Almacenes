module.exports = function createRequestLogger({ isProduction }) {
  return (req, res, next) => {
    if (!isProduction) {
      console.log(`[DEV] ${req.method} ${req.url}`);
    }

    next();
  };
};
