// Archivo generado automáticamente: clienteRoutes.js
const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');

router.get('/dashboard', clienteController.getDashboard);
router.get('/comisionistas', clienteController.getComisionistas);
router.get('/listado', clienteController.getClientes);
router.get('/ficha', clienteController.getClienteFicha);
router.post('/guardar', clienteController.guardarCliente);
router.get('/historico-pedidos', clienteController.getHistoricoPedidos);
router.get('/consumos', clienteController.getConsumosCliente);
router.get('/cobros', clienteController.getCobrosCliente);

module.exports = router;