// Archivo generado automáticamente: pedidoRoutes.js
const express = require('express');
const router = express.Router();
const pedidoController = require('../controllers/pedidoController');

router.get('/pendientes', pedidoController.getPedidosPendientes);
router.post('/marcar-completado', pedidoController.marcarPedidoCompletado);

module.exports = router;