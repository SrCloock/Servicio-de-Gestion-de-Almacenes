// Archivo generado automáticamente: utilRoutes.js
const express = require('express');
const router = express.Router();
const utilController = require('../controllers/utilController');
const upload = require('multer')();

router.post('/enviar-pdf-albaran', upload.single('pdf'), utilController.enviarPdfAlbaran);

module.exports = router;