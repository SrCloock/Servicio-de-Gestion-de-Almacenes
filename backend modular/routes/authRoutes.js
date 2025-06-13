// Archivo generado automáticamente: authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);
router.get('/categorias-empleado', authController.getCategoriasEmpleado);

module.exports = router;