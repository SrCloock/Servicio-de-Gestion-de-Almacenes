// Archivo generado automáticamente: albaranRoutes.js
const express = require('express');
const router = express.Router();
const albaranController = require('../controllers/albaranController');

router.post('/generar-desde-pedido', albaranController.generarAlbaranDesdePedido);
router.get('/pendientes', albaranController.getAlbaranesPendientes);

module.exports = router;