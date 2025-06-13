// Archivo generado automáticamente: app.js
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

// Configuración
require('./config/db'); // Conexión a DB
app.use(cors());
app.use(express.json());

// Rutas
const authRoutes = require('./routes/authRoutes');
const clienteRoutes = require('./routes/clienteRoutes');
const pedidoRoutes = require('./routes/pedidoRoutes');
const inventarioRoutes = require('./routes/inventarioRoutes');
const albaranRoutes = require('./routes/albaranRoutes');
const utilRoutes = require('./routes/utilRoutes');

app.use('/auth', authRoutes);
app.use('/clientes', clienteRoutes);
app.use('/pedidos', pedidoRoutes);
app.use('/inventario', inventarioRoutes);
app.use('/albaranes', albaranRoutes);
app.use('/utils', utilRoutes);

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  const { getLocalIp } = require('./utils/networkUtils');
  console.log(`✅ Backend accesible en:
  - Local: http://localhost:${PORT}
  - Red: http://${getLocalIp()}:${PORT}`);
});

// npm install express cors mssql nodemailer multer node-fetch node-cron