// Archivo generado automáticamente: inventarioRoutes.js
const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventarioController');

router.get('/ubicaciones-articulo', inventarioController.getUbicacionesArticulo);
router.post('/actualizar-linea-pedido', inventarioController.actualizarLineaPedido);
router.get('/articulos-ubicacion', inventarioController.getArticulosPorUbicacion);
router.get('/ubicaciones-stock', inventarioController.getUbicacionesConStock);
router.post('/traspasos/confirmar', inventarioController.confirmarTraspasos);
router.get('/almacenes', inventarioController.getInventarioAlmacenes);
router.get('/ubicaciones', inventarioController.getInventarioUbicaciones);
router.get('/articulos', inventarioController.getArticulos);
router.get('/inventario', inventarioController.getInventario);
router.get('/almacenes-listado', inventarioController.getAlmacenes);
router.get('/ubicaciones-listado', inventarioController.getUbicaciones);
router.post('/ubicaciones-multiples', inventarioController.getUbicacionesMultiples);
router.post('/ajustar-stock', inventarioController.ajustarStock);

module.exports = router;