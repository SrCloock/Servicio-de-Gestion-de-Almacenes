module.exports = function createAuthMiddleware() {
  return (req, res, next) => {
    const publicPaths = [
      '/login',
      '/',
      '/api/diagnostic',
      '/diagnostic',
      '/favicon.ico',
      '/PedidosScreen',
      '/designar-rutas',
      '/rutas',
      '/confirmacion-entrega',
      '/detalle-albaran',
      '/pedidos-asignados',
      '/albaranes-asignados',
      '/traspasos',
      '/inventario',
      '/gestion-documental',
      '/albaranes-compra'
    ].map((routePath) => routePath.toLowerCase());

    const normalizedPath = ((req.path || '/').replace(/\/+$/, '') || '/').toLowerCase();

    const isStaticFile = req.path.startsWith('/assets/')
      || req.path.startsWith('/static/')
      || req.path.endsWith('.js')
      || req.path.endsWith('.css')
      || req.path.endsWith('.ico')
      || req.path.endsWith('.png')
      || req.path.endsWith('.jpg')
      || req.path.endsWith('.svg')
      || req.path.endsWith('.woff')
      || req.path.endsWith('.woff2')
      || req.path.endsWith('.ttf');

    if (publicPaths.includes(normalizedPath) || isStaticFile) {
      return next();
    }

    const usuario = req.headers.usuario;
    const codigoempresa = req.headers.codigoempresa;

    if (!usuario || !codigoempresa) {
      console.error('Faltan cabeceras de autenticacion:', {
        path: req.path,
        method: req.method,
        origin: req.headers.origin
      });
      return res.status(401).json({
        success: false,
        mensaje: 'Faltan cabeceras de autenticación (usuario y codigoempresa)'
      });
    }

    req.user = {
      UsuarioLogicNet: usuario,
      CodigoEmpresa: parseInt(codigoempresa, 10) || 0
    };

    next();
  };
};
