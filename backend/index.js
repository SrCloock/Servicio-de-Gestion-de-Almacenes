const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const fetch = require('node-fetch');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// Inicialización de Express
const upload = multer();
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// 🔥 Configuración de conexión a SQL Server
const dbConfig = {
  user: 'logic',
  password: 'Sage2024+',
  server: 'SVRALANDALUS',
  database: 'DEMOS',
  options: {
    trustServerCertificate: true,
    useUTC: false,
    dateStrings: true,
    enableArithAbort: true,
    requestTimeout: 60000
  }
};

// 🔥 Pool de conexión global
let poolGlobal;

// ============================================
// ✅ 1. CONEXIÓN A LA BASE DE DATOS
// ============================================
async function conectarDB() {
  if (!poolGlobal) {
    poolGlobal = await sql.connect(dbConfig);
    console.log('✅ Conexión a SQL Server establecida.');
  }
}

// Middleware de conexión a base de datos
app.use(async (req, res, next) => {
  try {
    await conectarDB();
    next();
  } catch (err) {
    console.error('Error de conexión:', err);
    res.status(500).send('Error conectando a la base de datos.');
  }
});


// ============================================
// ✅ 2. MIDDLEWARE DE AUTENTICACIÓN
// ============================================
app.use((req, res, next) => {
  const publicPaths = ['/login', '/'];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  const usuario = req.headers.usuario;
  const codigoempresa = req.headers.codigoempresa;

  if (!usuario || !codigoempresa) {
    console.error('🚨 Faltan cabeceras de autenticación:', {
      path: req.path,
      headers: req.headers
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

  console.log(`🔒 Usuario autenticado: ${usuario}, Empresa: ${codigoempresa}`);
  next();
});

// ============================================
// ✅ 3. LOGIN (SIN PERMISOS)
// ============================================
app.post('/login', async (req, res) => {
  const { usuario, contrasena } = req.body;

  try {
    const result = await poolGlobal.request()
      .input('usuario', sql.VarChar, usuario)
      .input('contrasena', sql.VarChar, contrasena)
      .query(`
        SELECT * 
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario 
          AND ContraseñaLogicNet = @contrasena
      `);

    if (result.recordset.length > 0) {
      const userData = result.recordset[0];
      res.json({ 
        success: true, 
        mensaje: 'Login correcto', 
        datos: userData
      });
    } else {
      res.status(401).json({ success: false, mensaje: 'Usuario o contraseña incorrectos' });
    }
  } catch (err) {
    console.error('[ERROR SQL LOGIN]', err);
    res.status(500).json({ success: false, mensaje: 'Error de conexión a la base de datos' });
  }
}); 

// ============================================
// ✅ 4. OBTENER EMPRESAS (DASHBOARD)
// ============================================
app.get('/dashboard', async (req, res) => {
  try {
    const result = await poolGlobal.request().query(`
      SELECT * FROM Empresas
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR SQL DASHBOARD]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener empresas' });
  }
});



// ============================================
// ✅ 11. FUNCIONES EXTRA
// ============================================

// ✅ 11.1 ENVIAR PDF POR EMAIL
app.post('/enviar-pdf-albaran', upload.single('pdf'), async (req, res) => {
  const to = req.body.to || 'sergitaberner@hotmail.es';
  const pdfBuffer = req.file?.buffer;
  const pdfName = req.file?.originalname || 'albaran.pdf';

  if (!pdfBuffer) {
    return res.status(400).json({ success: false, mensaje: 'No se recibió el archivo PDF' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'sergitabernerrsalle@gmail.com',
        pass: 'zffu ydpx mxwh sqkw'
      }
    });

    await transporter.sendMail({
      from: 'Ferretería Luque <sergitabernerrsalle@gmail.com>',
      to,
      subject: 'Entrega de Albarán',
      text: 'Adjunto encontrarás el PDF con el detalle del albarán entregado.',
      attachments: [{
        filename: pdfName,
        content: pdfBuffer
      }]
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[ERROR ENVÍO EMAIL]', error);
    res.status(500).json({ success: false, mensaje: 'Error al enviar correo.', error: error.message });
  }
});

// ✅ 11.2 OBTENER EMPRESAS

app.get('/empresas', async (req, res) => {
  try {
    const result = await poolGlobal.request().query(`
      SELECT * 
      FROM Empresas 
      WHERE CodigoEmpresa IN (
        SELECT CodigoEmpresa 
        FROM lsysEmpresaAplicacion 
        WHERE CodigoAplicacion = 'CON'
      ) 
      AND CodigoEmpresa <= 10000
      ORDER BY CodigoEmpresa
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR EMPRESAS]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener empresas' });
  }
});


// ✅ Agregar columna UnidadesEntregadas
app.get('/add-unidades-entregadas-column', async (req, res) => {
  try {
    await poolGlobal.request().query(`
      ALTER TABLE LineasAlbaranCliente
      ADD UnidadesEntregadas DECIMAL(18,4) NULL;
    `);
    res.json({ success: true, mensaje: 'Columna UnidadesEntregadas agregada' });
  } catch (err) {
    console.error('[ERROR ALTER TABLE]', err);
    res.status(500).json({ success: false, mensaje: 'Error al agregar columna' });
  }
});

// ============================================
// ✅ INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log(`✅Servidor backend corriendo en http://localhost:${PORT}✅`);
});



// ============================================
// ✅ 6. ASIGNAR PEDIDOS SCREEN
// ============================================

// ✅ 6.1 MARCAR PEDIDO COMO COMPLETADO

app.post('/marcarPedidoCompletado', async (req, res) => {
  const { codigoEmpresa, ejercicio, numeroPedido, serie } = req.body;

  if (!codigoEmpresa || !ejercicio || !numeroPedido) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos del pedido.' });
  }

  try {
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('serie', sql.VarChar, serie || '')
      .query(`
        UPDATE CabeceraPedidoCliente
        SET Estado = 1,  -- 1 = Completado (antes era 1 = Servido)
            FechaCompletado = GETDATE()
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numeroPedido
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
      `);

    res.json({ 
      success: true, 
      mensaje: 'Pedido marcado como completado. Ahora debe ser asignado a un empleado para generar el albarán.' 
    });
  } catch (err) {
    console.error('[ERROR MARCAR COMPLETADO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al marcar pedido como completado.', 
      error: err.message 
    });
  }
});


// ✅ 6.2 OBTENER PEDIDOS COMPLETADOS (CORREGIDO)
app.get('/pedidosCompletados', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ 
      success: false, 
      mensaje: 'No autenticado' 
    });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          p.*,
          (SELECT COUNT(*) FROM LineasPedidoCliente l 
           WHERE l.CodigoEmpresa = p.CodigoEmpresa
           AND l.EjercicioPedido = p.EjercicioPedido
           AND l.SeriePedido = p.SeriePedido
           AND l.NumeroPedido = p.NumeroPedido) AS TotalLineas,
          p.CodigoEmpleadoAsignado
        FROM CabeceraPedidoCliente p
        WHERE p.CodigoEmpresa = @codigoEmpresa
          AND p.Estado = 1  -- Completados
          AND p.CodigoEmpleadoAsignado IS NULL  -- Solo pedidos sin empleado asignado
        ORDER BY p.FechaPedido DESC
      `);

    // Obtener detalles de los artículos para cada pedido
    const pedidosConArticulos = await Promise.all(result.recordset.map(async pedido => {
      const lineas = await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, pedido.EjercicioPedido)
        .input('serie', sql.VarChar, pedido.SeriePedido || '')
        .input('numeroPedido', sql.Int, pedido.NumeroPedido)
        .query(`
          SELECT 
            CodigoArticulo,
            DescripcionArticulo,
            UnidadesPedidas
          FROM LineasPedidoCliente
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND SeriePedido = @serie
            AND NumeroPedido = @numeroPedido
        `);
      
      return {
        ...pedido,
        articulos: lineas.recordset
      };
    }));
    
    res.json(pedidosConArticulos);
  } catch (err) {
    console.error('[ERROR PEDIDOS COMPLETADOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener pedidos completados',
      error: err.message 
    });
  }
});

// ✅ 6.3 ASIGNAR PEDIDO Y GENERAR ALBARÁN (ACTUALIZADO)
app.post('/asignarPedidoYGenerarAlbaran', async (req, res) => {
  const { codigoEmpresa, ejercicio, serie, numeroPedido } = req.body;

  if (!codigoEmpresa || !ejercicio || !numeroPedido) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos del pedido.' 
    });
  }

  const transaction = new sql.Transaction(poolGlobal);
  
  try {
    await transaction.begin();
    
    // 1. Obtener el empleado asignado del pedido
    const requestEmpleado = new sql.Request(transaction);
    const empleadoResult = await requestEmpleado
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT CodigoEmpleadoAsignado
        FROM CabeceraPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numeroPedido
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
      `);

    if (empleadoResult.recordset.length === 0 || !empleadoResult.recordset[0].CodigoEmpleadoAsignado) {
      throw new Error('El pedido no tiene un empleado asignado');
    }

    const codigoEmpleado = empleadoResult.recordset[0].CodigoEmpleadoAsignado;

    // 2. Obtener el siguiente número de albarán
    const nextAlbaran = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .query(`
        SELECT ISNULL(MAX(NumeroAlbaran), 0) + 1 AS SiguienteNumero
        FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
      `);

    const numeroAlbaran = nextAlbaran.recordset[0].SiguienteNumero;

    // 3. Copiar cabecera del pedido al albarán
    const cabeceraPedido = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT TOP 1 *
        FROM CabeceraPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    if (cabeceraPedido.recordset.length === 0) {
      throw new Error('Pedido no encontrado');
    }

    const cab = cabeceraPedido.recordset[0];
    const fechaActual = new Date();

    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, cab.CodigoEmpresa)
      .input('ejercicio', sql.SmallInt, cab.EjercicioPedido)
      .input('serie', sql.VarChar, cab.SeriePedido || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, cab.CodigoCliente)
      .input('razonSocial', sql.VarChar, cab.RazonSocial)
      .input('domicilio', sql.VarChar, cab.Domicilio)
      .input('municipio', sql.VarChar, cab.Municipio)
      .input('fecha', sql.DateTime, fechaActual)
      .input('numeroLineas', sql.Int, cab.NumeroLineas || 0)
      .input('importeLiquido', sql.Decimal(18,4), cab.ImporteLiquido || 0)
      .input('codigoEmpleado', sql.VarChar, codigoEmpleado)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
          NumeroLineas, ImporteLiquido, CodigoRepartidor
        ) VALUES (
          @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
          @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
          @numeroLineas, @importeLiquido, @codigoEmpleado
        )
      `);

    // 4. Copiar líneas del pedido al albarán
    const lineas = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT *
        FROM LineasPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    for (const [index, linea] of lineas.recordset.entries()) {
      await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, serie || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, index + 1)
        .input('codigoArticulo', sql.VarChar, linea.CodigoArticulo)
        .input('descripcionArticulo', sql.VarChar, linea.DescripcionArticulo)
        .input('unidades', sql.Decimal(18,4), linea.UnidadesPedidas)
        .input('precio', sql.Decimal(18,4), linea.Precio)
        .input('codigoAlmacen', sql.VarChar, linea.CodigoAlmacen || '')
        .input('partida', sql.VarChar, linea.Partida || '')
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, CodigoArticulo, DescripcionArticulo, Unidades, Precio,
            CodigoAlmacen, Partida
          ) VALUES (
            @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
            @orden, @codigoArticulo, @descripcionArticulo, @unidades, @precio,
            @codigoAlmacen, @partida
          )
        `);
    }

    // 5. Marcar el pedido como servido (Estado = 2)
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        UPDATE CabeceraPedidoCliente
        SET Estado = 2
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    await transaction.commit();
    
    res.json({ 
      success: true, 
      mensaje: 'Albarán generado y pedido marcado como servido.',
      numeroAlbaran,
      serieAlbaran: serie || ''
    });
  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR ASIGNAR Y GENERAR ALBARAN]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al asignar pedido y generar albarán',
      error: err.message 
    });
  }
});


// ✅ 6.4 ASIGNAR/REMOVER EMPLEADO DE MÚLTIPLES PEDIDOS (SOLUCIÓN FINAL)
app.post('/asignarPedidosAEmpleado', async (req, res) => {
  const { pedidos, codigoEmpleado } = req.body;
  
  // Validación mejorada
  if (!pedidos || !Array.isArray(pedidos)) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Formato incorrecto: pedidos debe ser un array' 
    });
  }

  if (pedidos.length === 0) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'No hay pedidos para asignar' 
    });
  }

  const transaction = new sql.Transaction(poolGlobal);
  
  try {
    await transaction.begin();
    
    // SOLUCIÓN: Crear un nuevo Request para cada iteración
    for (const pedido of pedidos) {
      const request = new sql.Request(transaction); // Nueva instancia por pedido
      
      await request
        .input('codigoEmpresa', sql.SmallInt, pedido.codigoEmpresa)
        .input('ejercicio', sql.SmallInt, pedido.ejercicioPedido)
        .input('serie', sql.VarChar, pedido.seriePedido || '')
        .input('numeroPedido', sql.Int, pedido.numeroPedido)
        .input('empleado', sql.VarChar, codigoEmpleado)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET EmpleadoAsignado = @empleado
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
    }
    
    await transaction.commit();
    
    const accion = codigoEmpleado ? "asignado(s)" : "desasignado(s)";
    res.json({ 
      success: true, 
      mensaje: `${pedidos.length} pedido(s) ${accion} correctamente`,
      pedidosActualizados: pedidos.length
    });
  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR ASIGNAR PEDIDOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al actualizar asignaciones',
      error: err.message,
      detalles: err.originalError?.info?.message || 'Verificar estructura de la tabla'
    });
  }
});

// ✅ 6.5 ASIGNAR PEDIDO A EMPLEADO
app.post('/asignar-pedido', async (req, res) => {
  const { pedidoId, empleadoId } = req.body;
  const codigoEmpresa = req.user.CodigoEmpresa;
  
  if (!codigoEmpresa || !pedidoId) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan parámetros requeridos.' 
    });
  }

  try {
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('empleadoId', sql.VarChar, empleadoId)
      .input('pedidoId', sql.Int, pedidoId)
      .query(`
        UPDATE CabeceraPedidoCliente
        SET CodigoEmpleadoAsignado = @empleadoId
        WHERE CodigoEmpresa = @codigoEmpresa
          AND NumeroPedido = @pedidoId
      `);
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR ASIGNAR PEDIDO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al asignar pedido',
      error: err.message 
    });
  }
});



// ✅ 6.6 OBTENER PEDIDOS SIN ASIGNAR
app.get('/pedidos-sin-asignar', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          NumeroPedido,
          RazonSocial,
          FechaPedido,
          CodigoEmpleadoAsignado
        FROM CabeceraPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Estado = 0
          AND CodigoEmpleadoAsignado IS NULL
        ORDER BY FechaPedido DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR PEDIDOS SIN ASIGNAR]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener pedidos sin asignar',
      error: err.message 
    });
  }
});

// ✅ 6.7 OBTENER EMPLEADOS PREPARADORES (VERSIÓN COMPLETA)
app.get('/empleados/preparadores', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autenticado' });
  }

  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          UsuarioLogicNet AS codigo, 
          Nombre AS nombre
        FROM Clientes
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoCategoriaCliente_ = 'emp'
          AND StatusTodosLosPedidos = -1
          AND UsuarioLogicNet IS NOT NULL
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR OBTENER PREPARADORES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener preparadores',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 7. ALBARANES SCREEN (CORREGIDO Y COMPLETO)
// ============================================

// ✅ 7.1 GENERAR ALBARÁN AL ASIGNAR REPARTIDOR (ACTUALIZADO CON SISTEMA DE STATUS)
app.post('/asignarRepartoYGenerarAlbaran', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, numeroPedido, codigoRepartidor } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !numeroPedido || !codigoRepartidor) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos: empresa, pedido y repartidor.' 
    });
  }

  try {
    // 1. Verificación de permisos
    const permisoResult = await poolGlobal.request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusDesignarRutas
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
      `);
    
    if (permisoResult.recordset.length === 0 || permisoResult.recordset[0].StatusDesignarRutas !== -1) {
      return res.status(403).json({ 
        success: false, 
        mensaje: 'No tienes permiso para asignar repartos' 
      });
    }

    // 2. Obtener datos del pedido
    const pedidoResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT EjercicioPedido, SeriePedido, CodigoCliente, RazonSocial, 
               Domicilio, Municipio, NumeroLineas, ImporteLiquido, obra,
               Contacto, Telefono AS TelefonoContacto
        FROM CabeceraPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND NumeroPedido = @numeroPedido
          AND Estado = 1  -- Pedido preparado
      `);

    if (pedidoResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Pedido no encontrado o no está preparado' 
      });
    }

    const pedido = pedidoResult.recordset[0];
    const ejercicio = new Date().getFullYear();

    // 3. Generar número de albarán
    const nextAlbaran = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, pedido.SeriePedido || '')
      .query(`
        SELECT ISNULL(MAX(NumeroAlbaran), 0) + 1 AS SiguienteNumero
        FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
      `);

    const numeroAlbaran = nextAlbaran.recordset[0].SiguienteNumero;
    const fechaActual = new Date();

    // 4. Crear cabecera del albarán
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, pedido.SeriePedido || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, pedido.CodigoCliente)
      .input('razonSocial', sql.VarChar, pedido.RazonSocial)
      .input('domicilio', sql.VarChar, pedido.Domicilio)
      .input('municipio', sql.VarChar, pedido.Municipio)
      .input('fecha', sql.DateTime, fechaActual)
      .input('numeroLineas', sql.Int, pedido.NumeroLineas || 0)
      .input('importeLiquido', sql.Decimal(18,4), pedido.ImporteLiquido || 0)
      .input('empleadoAsignado', sql.VarChar, codigoRepartidor)
      .input('obra', sql.VarChar, pedido.obra || '')
      .input('contacto', sql.VarChar, pedido.Contacto || '')
      .input('telefonoContacto', sql.VarChar, pedido.TelefonoContacto || '')
      .input('statusFacturado', sql.SmallInt, 0)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
          NumeroLineas, ImporteLiquido, EmpleadoAsignado,
          obra, Contacto, Telefono, StatusFacturado
        ) VALUES (
          @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
          @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
          @numeroLineas, @importeLiquido, @empleadoAsignado,
          @obra, @contacto, @telefonoContacto, @statusFacturado
        )
      `);

    // 5. Copiar líneas del pedido al albarán
    const lineas = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, pedido.EjercicioPedido)
      .input('serie', sql.VarChar, pedido.SeriePedido || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT CodigoArticulo, DescripcionArticulo, UnidadesPedidas, Precio, CodigoAlmacen, Partida
        FROM LineasPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND SeriePedido = @serie
          AND NumeroPedido = @numeroPedido
      `);

    for (const [index, linea] of lineas.recordset.entries()) {
      await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, pedido.SeriePedido || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, index + 1)
        .input('codigoArticulo', sql.VarChar, linea.CodigoArticulo)
        .input('descripcionArticulo', sql.VarChar, linea.DescripcionArticulo)
        .input('unidades', sql.Decimal(18,4), linea.UnidadesPedidas)
        .input('precio', sql.Decimal(18,4), linea.Precio)
        .input('codigoAlmacen', sql.VarChar, linea.CodigoAlmacen || '')
        .input('partida', sql.VarChar, linea.Partida || '')
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, CodigoArticulo, DescripcionArticulo, Unidades, Precio,
            CodigoAlmacen, Partida
          ) VALUES (
            @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
            @orden, @codigoArticulo, @descripcionArticulo, @unidades, @precio,
            @codigoAlmacen, @partida
          )
        `);
    }

    // 6. Actualizar estado del pedido
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        UPDATE CabeceraPedidoCliente
        SET Estado = 2, Status = 'Servido'
        WHERE CodigoEmpresa = @codigoEmpresa
          AND NumeroPedido = @numeroPedido
      `);

    res.json({ 
      success: true,
      mensaje: 'Albarán generado y asignado correctamente',
      albaran: {
        ejercicio,
        serie: pedido.SeriePedido || '',
        numero: numeroAlbaran,
        repartidor: codigoRepartidor
      }
    });
  } catch (err) {
    console.error('[ERROR ASIGNAR REPARTO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al asignar reparto',
      error: err.message 
    });
  }
});

// ✅ 7.2 ALBARANES PENDIENTES (ACTUALIZADO PARA USAR FORMAENTREGA DEL ALBARÁN)
app.get('/albaranesPendientes', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  
  try {
    const query = `
      SELECT 
        cac.NumeroAlbaran, 
        cac.SerieAlbaran, 
        cac.EjercicioAlbaran,
        cac.CodigoEmpresa,
        cac.FechaAlbaran, 
        cac.CodigoCliente, 
        cac.RazonSocial, 
        cac.Domicilio, 
        cac.Municipio, 
        cac.ImporteLiquido,
        cac.StatusFacturado,
        cac.EmpleadoAsignado,
        cac.obra,
        cac.Contacto,
        cac.Telefono AS TelefonoContacto,
        cac.FormaEntrega,
        cpc.Estado as EstadoPedido
      FROM CabeceraAlbaranCliente cac
      LEFT JOIN CabeceraPedidoCliente cpc ON 
        cac.CodigoEmpresa = cpc.CodigoEmpresa 
        AND cac.EjercicioPedido = cpc.EjercicioPedido
        AND cac.SeriePedido = cpc.SeriePedido
        AND cac.NumeroPedido = cpc.NumeroPedido
      WHERE cac.CodigoEmpresa = @codigoEmpresa
        AND cac.StatusFacturado = 0
        AND cac.FechaAlbaran >= DATEADD(DAY, -7, GETDATE())
        AND cac.FormaEntrega = 3  -- Solo nuestros medios
      ORDER BY cac.FechaAlbaran DESC
    `;
    
    const cabeceras = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(query);

    const albaranesConLineas = await Promise.all(cabeceras.recordset.map(async (cabecera) => {
      const lineas = await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, cabecera.EjercicioAlbaran)
        .input('serie', sql.VarChar, cabecera.SerieAlbaran || '')
        .input('numeroAlbaran', sql.Int, cabecera.NumeroAlbaran)
        .query(`
          SELECT 
            lac.Orden AS orden,
            lac.CodigoArticulo AS codigo,
            lac.DescripcionArticulo AS nombre,
            lac.Unidades AS cantidad,
            lpc.UnidadesPedidas AS cantidadOriginal
          FROM LineasAlbaranCliente lac
          LEFT JOIN LineasPedidoCliente lpc 
            ON lac.CodigoEmpresa = lpc.CodigoEmpresa
            AND lac.EjercicioPedido = lpc.EjercicioPedido
            AND lac.SeriePedido = lpc.SeriePedido
            AND lac.NumeroPedido = lpc.NumeroPedido
            AND lac.Orden = lpc.Orden
          WHERE lac.CodigoEmpresa = @codigoEmpresa
            AND lac.EjercicioAlbaran = @ejercicio
            AND lac.SerieAlbaran = @serie
            AND lac.NumeroAlbaran = @numeroAlbaran
        `);

      return {
        id: `${cabecera.EjercicioAlbaran}-${cabecera.SerieAlbaran || ''}-${cabecera.NumeroAlbaran}`,
        ejercicio: cabecera.EjercicioAlbaran,
        serie: cabecera.SerieAlbaran || '',
        numero: cabecera.NumeroAlbaran,
        codigoEmpresa: cabecera.CodigoEmpresa,
        albaran: `${cabecera.SerieAlbaran || ''}${cabecera.SerieAlbaran ? '-' : ''}${cabecera.NumeroAlbaran}`,
        cliente: cabecera.RazonSocial,
        direccion: `${cabecera.Domicilio}, ${cabecera.Municipio}`,
        FechaAlbaran: cabecera.FechaAlbaran,
        importeLiquido: cabecera.ImporteLiquido,
        empleadoAsignado: cabecera.EmpleadoAsignado,
        obra: cabecera.obra,
        contacto: cabecera.Contacto,
        telefonoContacto: cabecera.TelefonoContacto,
        FormaEntrega: cabecera.FormaEntrega,
        EstadoPedido: cabecera.EstadoPedido,
        articulos: lineas.recordset.map(art => ({
          ...art,
          cantidadOriginal: art.cantidadOriginal || art.cantidad,
          cantidadEntregada: art.cantidad
        }))
      };
    }));

    res.json(albaranesConLineas);
  } catch (err) {
    console.error('[ERROR OBTENER ALBARANES PENDIENTES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener albaranes pendientes',
      error: err.message 
    });
  }
});

// ✅ 7.3 OBTENER PEDIDOS PREPARADOS (ÚLTIMO MES)
app.get('/pedidos-preparados', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const codigoEmpresa = req.user.CodigoEmpresa;
  const dias = req.query.dias ? parseInt(req.query.dias) : 30; // 1 mes por defecto

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('dias', sql.Int, dias)
      .query(`
        SELECT 
          p.NumeroPedido,
          p.EjercicioPedido,
          p.SeriePedido,
          p.RazonSocial,
          p.Domicilio,
          p.Municipio,
          p.obra,
          p.FechaPedido,
          p.Contacto,
          p.Telefono AS TelefonoContacto,
          p.CodigoEmpresa
        FROM CabeceraPedidoCliente p
        WHERE p.CodigoEmpresa = @codigoEmpresa
          AND p.Estado = 1
          AND p.FechaPedido >= DATEADD(DAY, -@dias, GETDATE())
        ORDER BY p.FechaPedido DESC
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR PEDIDOS PREPARADOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener pedidos preparados',
      error: err.message
    });
  }
});

// ✅ 7.4 OBTENER REPARTIDORES (VERSIÓN FINAL)
app.get('/repartidores', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          UsuarioLogicNet AS id,
          Nombre AS nombre
        FROM Clientes
        WHERE StatusVerAlbaranesAsignados = -1
          AND CodigoEmpresa = @codigoEmpresa
          AND UsuarioLogicNet IS NOT NULL
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR OBTENER REPARTIDORES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener repartidores',
      error: err.message 
    });
  }
});

// ✅ 7.5 MARCAR ALBARÁN COMO COMPLETADO (ACTUALIZADO)
app.post('/completar-albaran', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroAlbaran } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroAlbaran) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos.' 
    });
  }

  try {
    // 1. Verificar permisos
    const permisoResult = await poolGlobal.request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador, StatusUsuarioAvanzado
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
      `);

    if (permisoResult.recordset.length === 0) {
      return res.status(403).json({ 
        success: false, 
        mensaje: 'Usuario no encontrado' 
      });
    }

    const userPerms = permisoResult.recordset[0];
    const esAdmin = userPerms.StatusAdministrador === -1;
    const esUsuarioAvanzado = userPerms.StatusUsuarioAvanzado === -1;
    
    // 2. Verificar repartidor asignado
    const albaranResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .query(`
        SELECT EmpleadoAsignado
        FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    if (albaranResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Albarán no encontrado' 
      });
    }

    const albaran = albaranResult.recordset[0];
    
    if (!esAdmin && !esUsuarioAvanzado) {
      if (albaran.EmpleadoAsignado !== usuario) {
        return res.status(403).json({ 
          success: false, 
          mensaje: 'No tienes permiso para completar este albarán' 
        });
      }
    }

    // 3. Actualizar StatusFacturado a -1 (completado)
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET StatusFacturado = -1
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    res.json({ 
      success: true, 
      mensaje: 'Albarán marcado como entregado'
    });
  } catch (err) {
    console.error('[ERROR COMPLETAR ALBARÁN]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al completar albarán',
      error: err.message
    });
  }
});

// ============================================
// ✅ 7.6 ACTUALIZAR CANTIDADES DE ALBARANES (CORREGIDO)
// ============================================
app.put('/actualizarCantidadesAlbaran', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { 
    codigoEmpresa, 
    ejercicio, 
    serie, 
    numeroAlbaran, 
    lineas,
    observaciones 
  } = req.body;

  if (!codigoEmpresa || !ejercicio || !numeroAlbaran || !lineas || !Array.isArray(lineas)) {
    return res.status(400).json({
      success: false,
      mensaje: 'Faltan datos requeridos: empresa, ejercicio, albarán y líneas.'
    });
  }

  try {
    const transaction = new sql.Transaction(poolGlobal);
    await transaction.begin();

    try {
      for (const linea of lineas) {
        const { orden, unidades } = linea;
        const request = new sql.Request(transaction);
        await request
          .input('unidades', sql.Decimal(18, 4), unidades)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.SmallInt, ejercicio)
          .input('serie', sql.VarChar, serie || '')
          .input('numeroAlbaran', sql.Int, numeroAlbaran)
          .input('orden', sql.SmallInt, orden)
          .query(`
            UPDATE LineasAlbaranCliente
            SET Unidades = @unidades
            WHERE CodigoEmpresa = @codigoEmpresa
              AND EjercicioAlbaran = @ejercicio
              AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
              AND NumeroAlbaran = @numeroAlbaran
              AND Orden = @orden
          `);
      }

      if (observaciones && observaciones.trim() !== '') {
        const requestObs = new sql.Request(transaction);
        await requestObs
          .input('observaciones', sql.VarChar, observaciones)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.SmallInt, ejercicio)
          .input('serie', sql.VarChar, serie || '')
          .input('numeroAlbaran', sql.Int, numeroAlbaran)
          .query(`
            UPDATE CabeceraAlbaranCliente
            SET ObservacionesAlbaran = 
                COALESCE(ObservacionesAlbaran, '') + 
                CHAR(13) + CHAR(10) + 
                @observaciones
            WHERE CodigoEmpresa = @codigoEmpresa
              AND EjercicioAlbaran = @ejercicio
              AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
              AND NumeroAlbaran = @numeroAlbaran
          `);
      }

      await transaction.commit();
      res.json({ success: true, mensaje: 'Cantidades actualizadas correctamente' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('[ERROR ACTUALIZAR CANTIDADES ALBARAN]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al actualizar cantidades',
      error: err.message
    });
  }
});

// ============================================
// ✅ 8. ASIGNAR ALBARANES SCREEN
// ============================================

// ✅ 8.1 ASIGNAR ALBARÁN EXISTENTE A REPARTIDOR
app.post('/asignarAlbaranExistente', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroAlbaran, codigoRepartidor } = req.body;

  if (!codigoEmpresa || !ejercicio || !numeroAlbaran || !codigoRepartidor) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos.' 
    });
  }

  try {
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('empleadoAsignado', sql.VarChar, codigoRepartidor)
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET EmpleadoAsignado = @empleadoAsignado
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    res.json({ 
      success: true, 
      mensaje: 'Albarán asignado correctamente'
    });
  } catch (err) {
    console.error('[ERROR ASIGNAR ALBARÁN EXISTENTE]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al asignar albarán existente',
      error: err.message 
    });
  }
});

// ✅ 8.2 ALBARANES PARA ASIGNACIÓN (ACTUALIZADO)
app.get('/albaranes-asignacion', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  
  try {
    const query = `
      SELECT 
        cac.NumeroAlbaran, 
        cac.SerieAlbaran, 
        cac.EjercicioAlbaran,
        cac.CodigoEmpresa,
        cac.FechaAlbaran, 
        cac.CodigoCliente, 
        cac.RazonSocial, 
        cac.Municipio,
        cac.ImporteLiquido,
        cac.StatusFacturado,
        cac.EmpleadoAsignado AS repartidorAsignado,
        cac.obra,
        cac.Contacto,
        cac.Telefono AS TelefonoContacto,
        cpc.NumeroPedido
      FROM CabeceraAlbaranCliente cac
      JOIN CabeceraPedidoCliente cpc 
        ON cac.CodigoEmpresa = cpc.CodigoEmpresa
        AND cac.EjercicioPedido = cpc.EjercicioPedido
        AND cac.SeriePedido = cpc.SeriePedido
        AND cac.NumeroPedido = cpc.NumeroPedido
      WHERE cac.CodigoEmpresa = @codigoEmpresa
        AND cac.StatusFacturado = 0
        AND cac.FechaAlbaran >= DATEADD(DAY, -30, GETDATE())
      ORDER BY cac.FechaAlbaran DESC
    `;
    
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(query);
      
    // Formatear albaran
    const albaranesFormateados = result.recordset.map(albaran => ({
      ...albaran,
      albaran: `${albaran.SerieAlbaran || ''}${albaran.SerieAlbaran ? '-' : ''}${albaran.NumeroAlbaran}`
    }));

    res.json(albaranesFormateados);
  } catch (err) {
    console.error('[ERROR ALBARANES ASIGNACION]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener albaranes para asignación',
      error: err.message 
    });
  }
});


// ✅ 8.6 OBTENER REPARTIDORES (VERSIÓN FINAL)
app.get('/repartidores', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          UsuarioLogicNet AS id,
          Nombre AS nombre
        FROM Clientes
        WHERE (StatusDesignarRutas = -1 OR StatusVerAlbaranesAsignados = -1)
          AND CodigoEmpresa = @codigoEmpresa
          AND UsuarioLogicNet IS NOT NULL
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR OBTENER REPARTIDORES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener repartidores',
      error: err.message 
    });
  }
});

// ✅ 8.8 REVERTIR ESTADO DE ALBARÁN
app.post('/revertir-albaran', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroAlbaran } = req.body;

  try {
    // Verificar permisos de administrador
    const permisoResult = await poolGlobal.request()
      .input('usuario', sql.VarChar, req.user.UsuarioLogicNet)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador 
        FROM Clientes 
        WHERE UsuarioLogicNet = @usuario AND CodigoEmpresa = @codigoEmpresa
      `);
    
    if (permisoResult.recordset.length === 0 || permisoResult.recordset[0].StatusAdministrador !== -1) {
      return res.status(403).json({ success: false, mensaje: 'Requiere permisos de administrador' });
    }

    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET StatusFacturado = 0
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    res.json({ success: true, mensaje: 'Estado revertido correctamente' });
  } catch (err) {
    console.error('[ERROR REVERTIR ALBARÁN]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al revertir albarán',
      error: err.message 
    });
  }
});

// ✅ 8.9 ALBARANES COMPLETADOS (ACTUALIZADO CON FILTRO FORMA ENTREGA 3 Y 7 DÍAS)
app.get('/albaranes-completados', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          CONCAT(cac.EjercicioAlbaran, '-', cac.SerieAlbaran, '-', cac.NumeroAlbaran) AS id,
          cac.NumeroAlbaran,
          cac.SerieAlbaran,
          cac.EjercicioAlbaran,
          cac.CodigoEmpresa,
          cac.FechaAlbaran,
          cac.RazonSocial,
          cac.obra,
          cac.StatusFacturado,
          cpc.FormaEntrega
        FROM CabeceraAlbaranCliente cac
        INNER JOIN CabeceraPedidoCliente cpc ON 
          cac.CodigoEmpresa = cpc.CodigoEmpresa 
          AND cac.EjercicioPedido = cpc.EjercicioPedido
          AND cac.SeriePedido = cpc.SeriePedido
          AND cac.NumeroPedido = cpc.NumeroPedido
        WHERE cac.CodigoEmpresa = @codigoEmpresa
          AND cac.StatusFacturado = -1
          AND cac.FechaAlbaran >= DATEADD(DAY, -7, GETDATE())
          AND cpc.FormaEntrega = 3  -- Solo nuestros medios
        ORDER BY cac.FechaAlbaran DESC
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ALBARANES COMPLETADOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener albaranes completados',
      error: err.message 
    });
  }
});




// ============================================
// ✅ 9. INVENTARIO SCREEN
// ============================================

// ✅ 9.1 OBTENER STOCK POR ARTÍCULO (VERSIÓN MEJORADA)
app.get('/stock/por-articulo', async (req, res) => {
  const { codigoArticulo } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;
  
  if (!codigoEmpresa || !codigoArticulo) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa y artículo requeridos.' 
    });
  }

  try {
    // Primero obtenemos el stock total por almacén desde AcumuladoStock
    const stockTotalResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT 
          s.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          s.TipoUnidadMedida_ AS UnidadMedida,
          CAST(s.UnidadSaldo AS DECIMAL(18, 2)) AS StockTotalAlmacen
        FROM AcumuladoStock s
        INNER JOIN Almacenes alm 
          ON alm.CodigoEmpresa = s.CodigoEmpresa 
          AND alm.CodigoAlmacen = s.CodigoAlmacen
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.CodigoArticulo = @codigoArticulo
          AND s.Periodo = 99
      `);

    // Luego obtenemos el detalle por ubicación
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT 
          s.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          s.Ubicacion,
          u.DescripcionUbicacion,
          CAST(s.UnidadSaldo AS DECIMAL(18, 2)) AS Cantidad,
          COALESCE(NULLIF(s.TipoUnidadMedida_, ''), 'unidades') AS UnidadMedida,
          art.UnidadMedida2_ AS UnidadBase,
          art.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          art.FactorConversion_ AS FactorConversion,
          s.Partida,
          s.CodigoColor_,
          c.Color_ AS NombreColor,
          s.CodigoTalla01_ AS Talla,
          -- Calcular el porcentaje que representa esta ubicación del total del almacén
          CASE 
            WHEN st.StockTotalAlmacen > 0 THEN
              CAST((s.UnidadSaldo / st.StockTotalAlmacen) * 100 AS DECIMAL(5, 2))
            ELSE 0
          END AS PorcentajeDelTotal,
          CONCAT(
            s.CodigoAlmacen, 
            '_', 
            s.Ubicacion, 
            '_', 
            COALESCE(NULLIF(s.TipoUnidadMedida_, ''), 'unidades'),
            '_', 
            ISNULL(s.Partida, ''),
            '_',
            ISNULL(s.CodigoTalla01_, ''),
            '_',
            ISNULL(s.CodigoColor_, '')
          ) AS GrupoUnico
        FROM AcumuladoStockUbicacion s
        INNER JOIN Almacenes alm 
          ON alm.CodigoEmpresa = s.CodigoEmpresa 
          AND alm.CodigoAlmacen = s.CodigoAlmacen
        LEFT JOIN Ubicaciones u 
          ON u.CodigoEmpresa = s.CodigoEmpresa 
          AND u.CodigoAlmacen = s.CodigoAlmacen 
          AND u.Ubicacion = s.Ubicacion
        INNER JOIN Articulos art
          ON art.CodigoEmpresa = s.CodigoEmpresa
          AND art.CodigoArticulo = s.CodigoArticulo
        LEFT JOIN Colores_ c 
          ON c.CodigoEmpresa = s.CodigoEmpresa
          AND c.CodigoColor_ = s.CodigoColor_
        LEFT JOIN (
          SELECT CodigoAlmacen, SUM(UnidadSaldo) AS StockTotalAlmacen
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoArticulo = @codigoArticulo
            AND Periodo = 99
          GROUP BY CodigoAlmacen
        ) st ON st.CodigoAlmacen = s.CodigoAlmacen
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.CodigoArticulo = @codigoArticulo
          AND s.Periodo = 99
          AND s.UnidadSaldo > 0
        ORDER BY s.CodigoAlmacen, s.Ubicacion, s.TipoUnidadMedida_
      `);
      
    // Combinar los resultados
    const response = {
      stockTotalPorAlmacen: stockTotalResult.recordset,
      detalleUbicaciones: result.recordset
    };
    
    res.json(response);
  } catch (err) {
    console.error('[ERROR STOCK ARTICULO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock del artículo.',
      error: err.message 
    });
  }
});

// ✅ 9.2 BUSCAR ARTÍCULOS


app.get('/buscar-articulos', async (req, res) => {
  const { termino } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    if (!termino || termino.trim().length < 2) {
      return res.json([]);
    }

    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('termino', sql.VarChar, `%${termino}%`)
      .query(`
        SELECT TOP 20 
          a.CodigoArticulo,
          a.DescripcionArticulo
        FROM Articulos a
        WHERE a.CodigoEmpresa = @codigoEmpresa
          AND (a.CodigoArticulo LIKE @termino 
               OR a.DescripcionArticulo LIKE @termino)
        ORDER BY a.DescripcionArticulo
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR BUSCAR ARTICULOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al buscar artículos.',
      error: err.message
    });
  }
});

// ✅ 9.3 OBTENER ARTÍCULOS POR UBICACIÓN (VERSIÓN CORREGIDA)
app.get('/stock/por-ubicacion', async (req, res) => {
  const { codigoAlmacen, ubicacion, page = 1, pageSize = 100 } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !codigoAlmacen || !ubicacion) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa, almacén y ubicación requeridos.' 
    });
  }

  try {
    const offset = (page - 1) * pageSize;
    
    // Consulta para obtener el total de registros
    const countResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacion)
      .query(`
        SELECT COUNT(*) AS TotalCount
        FROM AcumuladoStockUbicacion s
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.CodigoAlmacen = @codigoAlmacen
          AND s.Ubicacion = @ubicacion
          AND s.Periodo IN (0, 99)
          AND s.UnidadSaldo > 0
      `);
    
    const total = countResult.recordset[0].TotalCount;
    
    // Consulta corregida - Eliminadas columnas CodigoTalla02_, CodigoTalla03_, CodigoTalla04_
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacion)
      .query(`
        SELECT 
          s.CodigoArticulo,
          a.DescripcionArticulo,
          a.Descripcion2Articulo,
          s.UnidadSaldo AS Cantidad,
          s.TipoUnidadMedida_ AS UnidadMedida,
          a.UnidadMedida2_ AS UnidadBase,
          a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          a.FactorConversion_ AS FactorConversion,
          s.Partida,
          s.CodigoColor_,
          c.Color_ AS NombreColor,
          s.CodigoTalla01_ AS Talla
        FROM AcumuladoStockUbicacion s
        INNER JOIN Articulos a 
          ON a.CodigoEmpresa = s.CodigoEmpresa 
          AND a.CodigoArticulo = s.CodigoArticulo
        LEFT JOIN Colores_ c 
          ON c.CodigoColor_ = s.CodigoColor_
          AND c.CodigoEmpresa = s.CodigoEmpresa
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.CodigoAlmacen = @codigoAlmacen
          AND s.Ubicacion = @ubicacion
          AND s.Periodo IN (0, 99)
          AND s.UnidadSaldo > 0
        ORDER BY a.DescripcionArticulo
        OFFSET ${offset} ROWS
        FETCH NEXT ${pageSize} ROWS ONLY
      `);
      
    res.json({
      success: true,
      articulos: result.recordset,
      total: total
    });
  } catch (err) {
    console.error('[ERROR STOCK UBICACION]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener artículos por ubicación',
      error: err.message 
    });
  }
});

// ✅ 9.4 OBTENER STOCK POR MÚLTIPLES ARTÍCULOS (VERSIÓN MEJORADA)
app.post('/ubicacionesMultiples', async (req, res) => {
  const { articulos } = req.body;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!articulos || !Array.isArray(articulos)) {
    return res.status(400).json({
      success: false,
      mensaje: 'Lista de artículos requerida en formato array.'
    });
  }

  if (articulos.length === 0) {
    return res.json({});
  }

  try {
    const codigosArticulos = articulos.map(art => art.codigo);
    
    // Crear placeholders para la consulta
    const articuloPlaceholders = codigosArticulos.map((_, i) => `@articulo${i}`).join(',');
    
    const query = `
      SELECT 
        s.CodigoArticulo,
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        CAST(s.UnidadSaldo AS DECIMAL(18, 2)) AS Cantidad,
        COALESCE(NULLIF(s.TipoUnidadMedida_, ''), 'unidades') AS UnidadMedida,
        s.Partida,
        s.CodigoColor_,
        s.CodigoTalla01_
      FROM AcumuladoStockUbicacion s
      INNER JOIN Almacenes alm 
        ON alm.CodigoEmpresa = s.CodigoEmpresa 
        AND alm.CodigoAlmacen = s.CodigoAlmacen
      LEFT JOIN Ubicaciones u 
        ON u.CodigoEmpresa = s.CodigoEmpresa 
        AND u.CodigoAlmacen = s.CodigoAlmacen 
        AND u.Ubicacion = s.Ubicacion
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND s.Periodo IN (0, 99)
        AND s.UnidadSaldo > 0
        AND s.CodigoArticulo IN (${articuloPlaceholders})
      ORDER BY s.CodigoArticulo, s.CodigoAlmacen, s.Ubicacion
    `;

    const request = poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa);

    // Añadir parámetros para cada artículo
    codigosArticulos.forEach((codigo, index) => {
      request.input(`articulo${index}`, sql.VarChar, codigo);
    });

    const result = await request.query(query);

    // Agrupar por artículo
    const grouped = {};
    result.recordset.forEach(row => {
      const articulo = row.CodigoArticulo;
      if (!grouped[articulo]) {
        grouped[articulo] = [];
      }

      grouped[articulo].push({
        codigoAlmacen: row.CodigoAlmacen,
        nombreAlmacen: row.NombreAlmacen,
        ubicacion: row.Ubicacion,
        descripcionUbicacion: row.DescripcionUbicacion,
        unidadSaldo: row.Cantidad,
        unidadMedida: row.UnidadMedida,
        partida: row.Partida,
        codigoColor: row.CodigoColor_,
        codigoTalla: row.CodigoTalla01_
      });
    });

    res.json(grouped);
  } catch (err) {
    console.error('[ERROR UBICACIONES MULTIPLES]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al obtener ubicaciones múltiples',
      error: err.message
    });
  }
});


// ✅ 9.5 OBTENER STOCK TOTAL MEJORADO (CON UBICACIÓN + SIN UBICACIÓN)
app.get('/inventario/stock-total', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const añoActual = new Date().getFullYear();

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    console.log('🔍 Solicitando stock total para empresa:', codigoEmpresa);
    
    // 1. Stock con ubicación
    const stockConUbicacionQuery = `
      SELECT 
        s.CodigoEmpresa,
        s.Ejercicio,
        s.Periodo,
        s.CodigoArticulo,
        a.DescripcionArticulo,
        a.Descripcion2Articulo,
        a.CodigoFamilia,
        a.CodigoSubfamilia,
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        s.Partida,
        CAST(s.UnidadSaldo AS DECIMAL(18, 0)) AS Cantidad,
        s.TipoUnidadMedida_ AS UnidadStock,
        a.UnidadMedida2_ AS UnidadBase,
        a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
        a.FactorConversion_ AS FactorConversion,
        s.CodigoColor_,
        s.CodigoTalla01_,
        CASE 
          WHEN s.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
            THEN CAST(s.UnidadSaldo * a.FactorConversion_ AS DECIMAL(18, 0))
          WHEN s.TipoUnidadMedida_ = a.UnidadMedida2_ 
            THEN CAST(s.UnidadSaldo AS DECIMAL(18, 0))
          ELSE CAST(s.UnidadSaldo AS DECIMAL(18, 0))
        END AS CantidadBase,
        CONCAT(
          s.CodigoEmpresa, '_',
          s.Ejercicio, '_',
          s.Periodo, '_',
          s.CodigoAlmacen, '_',
          s.Ubicacion, '_',
          s.CodigoArticulo, '_',
          ISNULL(s.TipoUnidadMedida_, 'unidades'), '_',
          ISNULL(s.Partida, ''), '_',
          ISNULL(s.CodigoColor_, ''), '_',
          ISNULL(s.CodigoTalla01_, '')
        ) AS ClaveUnica,
        s.MovPosicionLinea,
        0 AS EsSinUbicacion
      FROM AcumuladoStockUbicacion s
      INNER JOIN Articulos a 
        ON a.CodigoEmpresa = s.CodigoEmpresa 
        AND a.CodigoArticulo = s.CodigoArticulo
      INNER JOIN Almacenes alm 
        ON alm.CodigoEmpresa = s.CodigoEmpresa 
        AND alm.CodigoAlmacen = s.CodigoAlmacen
      LEFT JOIN Ubicaciones u 
        ON u.CodigoEmpresa = s.CodigoEmpresa 
        AND u.CodigoAlmacen = s.CodigoAlmacen 
        AND u.Ubicacion = s.Ubicacion
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND s.Periodo = 99
        AND s.Ejercicio = @ejercicio
        AND s.UnidadSaldo > 0
    `;

    // 2. Stock sin ubicación (diferencia entre AcumuladoStock y AcumuladoStockUbicacion)
    const stockSinUbicacionQuery = `
      SELECT 
        st.CodigoEmpresa,
        st.Ejercicio,
        st.Periodo,
        st.CodigoArticulo,
        a.DescripcionArticulo,
        a.Descripcion2Articulo,
        a.CodigoFamilia,
        a.CodigoSubfamilia,
        st.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        'SIN-UBICACION' AS Ubicacion,
        'Stock sin ubicación asignada' AS DescripcionUbicacion,
        st.Partida,
        (st.UnidadSaldo - ISNULL(su.StockUbicacion, 0)) AS Cantidad,
        st.TipoUnidadMedida_ AS UnidadStock,
        a.UnidadMedida2_ AS UnidadBase,
        a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
        a.FactorConversion_ AS FactorConversion,
        st.CodigoColor_,
        st.CodigoTalla01_,
        CASE 
          WHEN st.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
            THEN CAST((st.UnidadSaldo - ISNULL(su.StockUbicacion, 0)) * a.FactorConversion_ AS DECIMAL(18, 0))
          WHEN st.TipoUnidadMedida_ = a.UnidadMedida2_ 
            THEN CAST((st.UnidadSaldo - ISNULL(su.StockUbicacion, 0)) AS DECIMAL(18, 0))
          ELSE CAST((st.UnidadSaldo - ISNULL(su.StockUbicacion, 0)) AS DECIMAL(18, 0))
        END AS CantidadBase,
        CONCAT(
          st.CodigoEmpresa, '_',
          st.Ejercicio, '_',
          st.Periodo, '_',
          st.CodigoAlmacen, '_',
          'SIN-UBICACION', '_',
          st.CodigoArticulo, '_',
          ISNULL(st.TipoUnidadMedida_, 'unidades'), '_',
          ISNULL(st.Partida, ''), '_',
          ISNULL(st.CodigoColor_, ''), '_',
          ISNULL(st.CodigoTalla01_, '')
        ) AS ClaveUnica,
        0 AS MovPosicionLinea,
        1 AS EsSinUbicacion
      FROM AcumuladoStock st
      INNER JOIN Articulos a 
        ON a.CodigoEmpresa = st.CodigoEmpresa 
        AND a.CodigoArticulo = st.CodigoArticulo
      INNER JOIN Almacenes alm 
        ON alm.CodigoEmpresa = st.CodigoEmpresa 
        AND alm.CodigoAlmacen = st.CodigoAlmacen
      LEFT JOIN (
        SELECT 
          CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
          TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
          SUM(UnidadSaldo) AS StockUbicacion
        FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Periodo = 99
          AND Ejercicio = @ejercicio
        GROUP BY CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                 TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
      ) su ON su.CodigoEmpresa = st.CodigoEmpresa
        AND su.Ejercicio = st.Ejercicio
        AND su.CodigoAlmacen = st.CodigoAlmacen
        AND su.CodigoArticulo = st.CodigoArticulo
        AND su.TipoUnidadMedida_ = st.TipoUnidadMedida_
        AND ISNULL(su.Partida, '') = ISNULL(st.Partida, '')
        AND ISNULL(su.CodigoColor_, '') = ISNULL(st.CodigoColor_, '')
        AND ISNULL(su.CodigoTalla01_, '') = ISNULL(st.CodigoTalla01_, '')
      WHERE st.CodigoEmpresa = @codigoEmpresa
        AND st.Periodo = 99
        AND st.Ejercicio = @ejercicio
        AND st.UnidadSaldo > 0
        AND (st.UnidadSaldo - ISNULL(su.StockUbicacion, 0)) > 0
    `;

    // Combinar ambos resultados
    const query = `
      ${stockConUbicacionQuery}
      UNION ALL
      ${stockSinUbicacionQuery}
      ORDER BY CodigoArticulo, CodigoAlmacen, EsSinUbicacion, Ubicacion
    `;

    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, añoActual)
      .query(query);
      
    console.log('✅ Stock total obtenido:', result.recordset.length, 'registros');
    res.json(result.recordset);
  } catch (err) {
    console.error('❌ [ERROR STOCK TOTAL]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock total',
      error: err.message,
      details: err.originalError?.info?.message || 'Sin detalles adicionales'
    });
  }
});
// ✅ 9.6 AJUSTAR INVENTARIO (VERSIÓN COMPLETA CON INVENTARIOS)
app.post('/inventario/ajustar', async (req, res) => {
    const { ajustes } = req.body;
    const usuario = req.user.UsuarioLogicNet;
    const codigoEmpresa = req.user.CodigoEmpresa;
    const ejercicio = new Date().getFullYear();
    const fechaActual = new Date();

    if (!Array.isArray(ajustes)) {
        return res.status(400).json({ 
            success: false, 
            mensaje: 'Formato de ajustes inválido.' 
        });
    }

    const transaction = new sql.Transaction(poolGlobal);
    
    try {
        await transaction.begin();
        
        // Generar código único para el inventario
        const codigoInventario = `AJUSTE_${fechaActual.getFullYear()}${String(fechaActual.getMonth() + 1).padStart(2, '0')}${String(fechaActual.getDate()).padStart(2, '0')}_${Date.now()}`;
        
        for (const ajuste of ajustes) {
            // 1. Obtener datos actuales del artículo
            const requestArticulo = new sql.Request(transaction);
            const articuloResult = await requestArticulo
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('codigoArticulo', sql.VarChar, ajuste.articulo)
                .query(`
                    SELECT 
                        PrecioMedio, UnidadMedida2_, UnidadMedidaAlternativa_, FactorConversion_
                    FROM Articulos
                    WHERE CodigoEmpresa = @codigoEmpresa
                      AND CodigoArticulo = @codigoArticulo
                `);
            
            if (articuloResult.recordset.length === 0) {
                throw new Error(`Artículo ${ajuste.articulo} no encontrado`);
            }
            
            const articuloInfo = articuloResult.recordset[0];
            const precioMedio = articuloInfo.PrecioMedio || 0;
            
            // 2. Obtener stock actual
            const requestStock = new sql.Request(transaction);
            const stockResult = await requestStock
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
                .input('codigoArticulo', sql.VarChar, ajuste.articulo)
                .input('unidadMedida', sql.VarChar, ajuste.unidadStock)
                .input('partida', sql.VarChar, ajuste.partida || '')
                .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
                .input('codigoTalla01', sql.VarChar, ajuste.codigoTalla01 || '')
                .query(`
                    SELECT UnidadSaldo AS StockActual
                    FROM AcumuladoStock
                    WHERE CodigoEmpresa = @codigoEmpresa
                      AND Ejercicio = @ejercicio
                      AND CodigoAlmacen = @codigoAlmacen
                      AND CodigoArticulo = @codigoArticulo
                      AND TipoUnidadMedida_ = @unidadMedida
                      AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                      AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                      AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 = ''))
                      AND Periodo = 99
                `);
            
            const stockActual = stockResult.recordset.length > 0 ? stockResult.recordset[0].StockActual : 0;
            const diferencia = ajuste.nuevaCantidad - stockActual;
            
            // 3. Actualizar AcumuladoStock
            const requestUpdateStock = new sql.Request(transaction);
            await requestUpdateStock
                .input('nuevaCantidad', sql.Decimal(18,4), ajuste.nuevaCantidad)
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
                .input('codigoArticulo', sql.VarChar, ajuste.articulo)
                .input('unidadMedida', sql.VarChar, ajuste.unidadStock)
                .input('partida', sql.VarChar, ajuste.partida || '')
                .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
                .input('codigoTalla01', sql.VarChar, ajuste.codigoTalla01 || '')
                .query(`
                    MERGE INTO AcumuladoStock AS target
                    USING (VALUES (
                        @codigoEmpresa, @ejercicio, @codigoAlmacen, @codigoArticulo,
                        @unidadMedida, @partida, @codigoColor, @codigoTalla01
                    )) AS source (
                        CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                        TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
                    )
                    ON target.CodigoEmpresa = source.CodigoEmpresa
                        AND target.Ejercicio = source.Ejercicio
                        AND target.CodigoAlmacen = source.CodigoAlmacen
                        AND target.CodigoArticulo = source.CodigoArticulo
                        AND target.TipoUnidadMedida_ = source.TipoUnidadMedida_
                        AND ISNULL(target.Partida, '') = ISNULL(source.Partida, '')
                        AND ISNULL(target.CodigoColor_, '') = ISNULL(source.CodigoColor_, '')
                        AND ISNULL(target.CodigoTalla01_, '') = ISNULL(source.CodigoTalla01_, '')
                        AND target.Periodo = 99
                    
                    WHEN MATCHED THEN
                        UPDATE SET 
                            UnidadSaldo = @nuevaCantidad,
                            UnidadSaldoTipo_ = @nuevaCantidad
                    
                    WHEN NOT MATCHED THEN
                        INSERT (
                            CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                            TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                            UnidadSaldo, UnidadSaldoTipo_, Periodo
                        ) VALUES (
                            @codigoEmpresa, @ejercicio, @codigoAlmacen, @codigoArticulo,
                            @unidadMedida, @partida, @codigoColor, @codigoTalla01,
                            @nuevaCantidad, @nuevaCantidad, 99
                        );
                `);
            
            // 4. Si es stock sin ubicación, crear registro en AcumuladoStockUbicacion
            if (ajuste.ubicacionStr === 'SIN-UBICACION') {
                const requestUbicacion = new sql.Request(transaction);
                await requestUbicacion
                    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                    .input('ejercicio', sql.Int, ejercicio)
                    .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
                    .input('codigoArticulo', sql.VarChar, ajuste.articulo)
                    .input('unidadMedida', sql.VarChar, ajuste.unidadStock)
                    .input('partida', sql.VarChar, ajuste.partida || '')
                    .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
                    .input('codigoTalla01', sql.VarChar, ajuste.codigoTalla01 || '')
                    .input('nuevaCantidad', sql.Decimal(18,4), ajuste.nuevaCantidad)
                    .query(`
                        MERGE INTO AcumuladoStockUbicacion AS target
                        USING (VALUES (
                            @codigoEmpresa, @ejercicio, @codigoAlmacen, @codigoArticulo,
                            @unidadMedida, @partida, @codigoColor, @codigoTalla01
                        )) AS source (
                            CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                            TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
                        )
                        ON target.CodigoEmpresa = source.CodigoEmpresa
                            AND target.Ejercicio = source.Ejercicio
                            AND target.CodigoAlmacen = source.CodigoAlmacen
                            AND target.CodigoArticulo = source.CodigoArticulo
                            AND target.TipoUnidadMedida_ = source.TipoUnidadMedida_
                            AND ISNULL(target.Partida, '') = ISNULL(source.Partida, '')
                            AND ISNULL(target.CodigoColor_, '') = ISNULL(source.CodigoColor_, '')
                            AND ISNULL(target.CodigoTalla01_, '') = ISNULL(source.CodigoTalla01_, '')
                            AND target.Ubicacion = 'SIN-UBICACION'
                            AND target.Periodo = 99
                        
                        WHEN MATCHED THEN
                            UPDATE SET 
                                UnidadSaldo = @nuevaCantidad,
                                UnidadSaldoTipo_ = @nuevaCantidad
                        
                        WHEN NOT MATCHED THEN
                            INSERT (
                                CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                                TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                                Ubicacion, UnidadSaldo, UnidadSaldoTipo_, Periodo
                            ) VALUES (
                                @codigoEmpresa, @ejercicio, @codigoAlmacen, @codigoArticulo,
                                @unidadMedida, @partida, @codigoColor, @codigoTalla01,
                                'SIN-UBICACION', @nuevaCantidad, @nuevaCantidad, 99
                            );
                    `);
            }
            
            // 5. Registrar en tabla Inventarios (como en tu ejemplo)
            const requestInventario = new sql.Request(transaction);
            await requestInventario
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('inventario', sql.VarChar, codigoInventario)
                .input('codigoArticulo', sql.VarChar, ajuste.articulo)
                .input('partida', sql.VarChar, ajuste.partida || '')
                .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
                .input('unidadMedida', sql.VarChar, ajuste.unidadStock)
                .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
                .input('codigoTalla01', sql.VarChar, ajuste.codigoTalla01 || '')
                .input('unidadesStock', sql.Decimal(18,4), stockActual)
                .input('unidadesInventario', sql.Decimal(18,4), ajuste.nuevaCantidad)
                .input('precioMedio', sql.Decimal(18,4), precioMedio)
                .input('precioNuevo', sql.Decimal(18,4), precioMedio)
                .input('fechaInventario', sql.Date, fechaActual)
                .input('fechaCreacion', sql.DateTime, fechaActual)
                .query(`
                    INSERT INTO Inventarios (
                        CodigoEmpresa, Inventario, CodigoArticulo, Partida,
                        CodigoAlmacen, TipoUnidadMedida_, CodigoColor_, CodigoTalla01_,
                        UnidadesStock, UnidadesInventario, PrecioMedio, PrecioNuevo,
                        FechaInventario, FechaCreacion, StatusRegulariza
                    ) VALUES (
                        @codigoEmpresa, @inventario, @codigoArticulo, @partida,
                        @codigoAlmacen, @unidadMedida, @codigoColor, @codigoTalla01,
                        @unidadesStock, @unidadesInventario, @precioMedio, @precioNuevo,
                        @fechaInventario, @fechaCreacion, -1
                    )
                `);
            
            // 6. Registrar movimiento solo si hay diferencia
            if (diferencia !== 0) {
                const periodo = fechaActual.getMonth() + 1;
                const fechaSolo = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), fechaActual.getDate());
                
                const requestMov = new sql.Request(transaction);
                await requestMov
                    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                    .input('ejercicio', sql.SmallInt, fechaActual.getFullYear())
                    .input('periodo', sql.Int, periodo)
                    .input('fecha', sql.Date, fechaSolo)
                    .input('fechaRegistro', sql.DateTime, fechaActual)
                    .input('tipoMovimiento', sql.SmallInt, 5) // 5: Ajuste
                    .input('codigoArticulo', sql.VarChar, ajuste.articulo)
                    .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
                    .input('ubicacion', sql.VarChar, ajuste.ubicacionStr)
                    .input('partida', sql.VarChar, ajuste.partida || '')
                    .input('diferencia', sql.Decimal(18,4), diferencia)
                    .input('comentario', sql.VarChar, `Ajuste manual por ${usuario}`)
                    .input('unidadMedida', sql.VarChar, ajuste.unidadStock)
                    .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
                    .input('codigoTalla01', sql.VarChar, ajuste.codigoTalla01 || '')
                    .query(`
                        INSERT INTO MovimientoStock (
                            CodigoEmpresa, Ejercicio, Periodo, Fecha, FechaRegistro, TipoMovimiento,
                            CodigoArticulo, CodigoAlmacen, Ubicacion, Partida, Unidades, Comentario,
                            UnidadMedida1_, CodigoColor_, CodigoTalla01_,
                            AlmacenContrapartida, UbicacionContrapartida
                        ) VALUES (
                            @codigoEmpresa, 
                            @ejercicio, 
                            @periodo, 
                            @fecha, 
                            @fechaRegistro, 
                            @tipoMovimiento,
                            @codigoArticulo, 
                            @codigoAlmacen, 
                            @ubicacion, 
                            @partida, 
                            @diferencia, 
                            @comentario, 
                            @unidadMedida, 
                            @codigoColor,
                            @codigoTalla01,
                            @codigoAlmacen,
                            @ubicacion
                        )
                    `);
            }
        }

        await transaction.commit();
        res.json({ 
            success: true, 
            mensaje: 'Ajustes realizados correctamente',
            codigoInventario: codigoInventario
        });
        
    } catch (err) {
        if (transaction._aborted === false) {
            await transaction.rollback();
        }
        console.error('[ERROR AJUSTAR INVENTARIO]', err);
        res.status(500).json({ 
            success: false, 
            mensaje: 'Error al ajustar inventario',
            error: err.message,
            stack: err.stack
        });
    }
});

// ✅ 9.7 OBTENER STOCK SIN UBICACIÓN (DIFERENCIA ENTRE AcumuladoStock Y AcumuladoStockUbicacion)
app.get('/inventario/stock-sin-ubicacion', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const añoActual = new Date().getFullYear();

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, añoActual)
      .query(`
        -- Stock total por artículo, almacén y características
        WITH StockTotal AS (
          SELECT 
            CodigoArticulo,
            CodigoAlmacen,
            TipoUnidadMedida_,
            Partida,
            CodigoColor_,
            CodigoTalla01_,
            SUM(CAST(UnidadSaldo AS DECIMAL(18, 0))) as StockTotal
          FROM AcumuladoStock
          WHERE CodigoEmpresa = @codigoEmpresa
            AND Ejercicio = @ejercicio
            AND Periodo IN (0, 99)
            AND UnidadSaldo > 0
          GROUP BY CodigoArticulo, CodigoAlmacen, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
        ),
        
        -- Stock con ubicación
        StockConUbicacion AS (
          SELECT 
            CodigoArticulo,
            CodigoAlmacen,
            TipoUnidadMedida_,
            Partida,
            CodigoColor_,
            CodigoTalla01_,
            SUM(CAST(UnidadSaldo AS DECIMAL(18, 0))) as StockConUbicacion
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND Ejercicio = @ejercicio
            AND Periodo IN (0, 99)
            AND UnidadSaldo > 0
          GROUP BY CodigoArticulo, CodigoAlmacen, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
        )
        
        -- Diferencia: Stock sin ubicación
        SELECT 
          st.CodigoArticulo,
          a.DescripcionArticulo,
          a.Descripcion2Articulo,
          st.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          '' AS Ubicacion, -- Ubicación vacía
          NULL AS DescripcionUbicacion,
          st.Partida,
          st.TipoUnidadMedida_ AS UnidadStock,
          a.UnidadMedida2_ AS UnidadBase,
          a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          a.FactorConversion_ AS FactorConversion,
          st.CodigoColor_,
          st.CodigoTalla01_,
          (st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) AS Cantidad,
          CASE 
            WHEN st.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
              THEN CAST((st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) * a.FactorConversion_ AS DECIMAL(18, 0))
            WHEN st.TipoUnidadMedida_ = a.UnidadMedida2_ 
              THEN CAST((st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) AS DECIMAL(18, 0))
            ELSE CAST((st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) * a.FactorConversion_ AS DECIMAL(18, 0))
          END AS CantidadBase,
          CONCAT(
            @codigoEmpresa, '_',
            @ejercicio, '_',
            st.CodigoAlmacen, '_',
            'SIN_UBICACION', '_', -- Identificador especial para sin ubicación
            st.CodigoArticulo, '_',
            ISNULL(st.TipoUnidadMedida_, 'unidades'), '_',
            ISNULL(st.Partida, ''), '_',
            ISNULL(st.CodigoColor_, ''), '_',
            ISNULL(st.CodigoTalla01_, ''), '_',
            CAST((st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) AS VARCHAR(20))
          ) AS ClaveUnica,
          0 AS MovPosicionLinea -- No tiene movimiento asociado
        FROM StockTotal st
        INNER JOIN Articulos a 
          ON a.CodigoEmpresa = @codigoEmpresa 
          AND a.CodigoArticulo = st.CodigoArticulo
        INNER JOIN Almacenes alm 
          ON alm.CodigoEmpresa = @codigoEmpresa 
          AND alm.CodigoAlmacen = st.CodigoAlmacen
        LEFT JOIN StockConUbicacion sc 
          ON sc.CodigoArticulo = st.CodigoArticulo
          AND sc.CodigoAlmacen = st.CodigoAlmacen
          AND sc.TipoUnidadMedida_ = st.TipoUnidadMedida_
          AND ISNULL(sc.Partida, '') = ISNULL(st.Partida, '')
          AND ISNULL(sc.CodigoColor_, '') = ISNULL(st.CodigoColor_, '')
          AND ISNULL(sc.CodigoTalla01_, '') = ISNULL(st.CodigoTalla01_, '')
        WHERE (st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) > 0
        ORDER BY st.CodigoArticulo, st.CodigoAlmacen
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR STOCK SIN UBICACION]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock sin ubicación',
      error: err.message 
    });
  }
});

// ✅ 9.7 OBTENER HISTÓRICO DE AJUSTES DE INVENTARIO (AGRUPA POR DÍA)
app.get('/inventario/historial-ajustes', async (req, res) => {
  // 1. Obtener empresa del usuario autenticado
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ 
      success: false, 
      mensaje: 'No autenticado' 
    });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    // 2. Obtener fechas con ajustes
    const fechasResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT DISTINCT CONVERT(date, FechaRegistro) AS Fecha
        FROM MovimientoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND TipoMovimiento = 5  -- 5: Ajuste
        ORDER BY Fecha DESC
      `);
    
    const fechas = fechasResult.recordset;
    const historial = [];
    
    // 3. Para cada fecha, obtener los ajustes
    for (const fecha of fechas) {
      const fechaStr = fecha.Fecha.toISOString().split('T')[0];
      
      const detallesResult = await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('fecha', sql.Date, fechaStr)
        .query(`
          SELECT 
            m.CodigoArticulo,
            a.DescripcionArticulo,
            m.CodigoAlmacen,
            alm.Almacen AS NombreAlmacen,
            m.Ubicacion,
            u.DescripcionUbicacion,
            m.Partida,
            m.Unidades AS Diferencia,
            m.Comentario,
            m.FechaRegistro
          FROM MovimientoStock m
          LEFT JOIN Articulos a 
            ON a.CodigoArticulo = m.CodigoArticulo 
            AND a.CodigoEmpresa = m.CodigoEmpresa
          LEFT JOIN Almacenes alm 
            ON alm.CodigoAlmacen = m.CodigoAlmacen 
            AND alm.CodigoEmpresa = m.CodigoEmpresa
          LEFT JOIN Ubicaciones u 
            ON u.CodigoAlmacen = m.CodigoAlmacen 
            AND u.Ubicacion = m.Ubicacion 
            AND u.CodigoEmpresa = m.CodigoEmpresa
          WHERE m.CodigoEmpresa = @codigoEmpresa
            AND m.TipoMovimiento = 5  -- 5: Ajuste
            AND CONVERT(date, m.FechaRegistro) = @fecha
          ORDER BY m.FechaRegistro DESC
        `);
      
      historial.push({
        fecha: fechaStr,
        totalAjustes: detallesResult.recordset.length,
        detalles: detallesResult.recordset
      });
    }
    
    res.json(historial);
  } catch (err) {
    console.error('[ERROR HISTORIAL AJUSTES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener historial de ajustes.',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 9.8 OBTENER DETALLES POR MOV_POSICION_LINEA (VERSIÓN MEJORADA)
// ============================================
app.get('/stock/detalles', async (req, res) => {
  const { movPosicionLinea } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !movPosicionLinea) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan parámetros requeridos.' 
    });
  }

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('movPosicionLinea', sql.VarChar, movPosicionLinea)
      .query(`
        SELECT 
          lt.CodigoColor_,
          c.Color_ AS NombreColor,
          lt.GrupoTalla_,
          gt.DescripcionGrupoTalla_ AS NombreGrupoTalla,
          -- Obtener descripciones de tallas
          t01.DescripcionTalla_ AS DescTalla01,
          t02.DescripcionTalla_ AS DescTalla02,
          t03.DescripcionTalla_ AS DescTalla03,
          t04.DescripcionTalla_ AS DescTalla04,
          lt.UnidadesTotalTallas_ AS Unidades,
          lt.UnidadesTalla01_,
          lt.UnidadesTalla02_,
          lt.UnidadesTalla03_,
          lt.UnidadesTalla04_
        FROM LineasPedidoClienteTallas lt
        LEFT JOIN Colores_ c 
          ON lt.CodigoColor_ = c.CodigoColor_
          AND lt.CodigoEmpresa = c.CodigoEmpresa
        LEFT JOIN GrupoTallas_ gt 
          ON lt.GrupoTalla_ = gt.GrupoTalla_ 
          AND lt.CodigoEmpresa = gt.CodigoEmpresa
        LEFT JOIN Tallas_ t01 ON lt.CodigoEmpresa = t01.CodigoEmpresa AND lt.GrupoTalla_ = t01.GrupoTalla_ AND lt.CodigoTalla01_ = t01.CodigoTalla_
        LEFT JOIN Tallas_ t02 ON lt.CodigoEmpresa = t02.CodigoEmpresa AND lt.GrupoTalla_ = t02.GrupoTalla_ AND lt.CodigoTalla02_ = t02.CodigoTalla_
        LEFT JOIN Tallas_ t03 ON lt.CodigoEmpresa = t03.CodigoEmpresa AND lt.GrupoTalla_ = t03.GrupoTalla_ AND lt.CodigoTalla03_ = t03.CodigoTalla_
        LEFT JOIN Tallas_ t04 ON lt.CodigoEmpresa = t04.CodigoEmpresa AND lt.GrupoTalla_ = t04.GrupoTalla_ AND lt.CodigoTalla04_ = t04.CodigoTalla_
        WHERE lt.CodigoEmpresa = @codigoEmpresa
          AND lt.MovPosicionLinea_ = @movPosicionLinea
      `);

    const detalles = result.recordset.map(detalle => {
      const tallas = {
        '01': {
          descripcion: detalle.DescTalla01,
          unidades: detalle.UnidadesTalla01_
        },
        '02': {
          descripcion: detalle.DescTalla02,
          unidades: detalle.UnidadesTalla02_
        },
        '03': {
          descripcion: detalle.DescTalla03,
          unidades: detalle.UnidadesTalla03_
        },
        '04': {
          descripcion: detalle.DescTalla04,
          unidades: detalle.UnidadesTalla04_
        }
      };

      return {
        color: {
          codigo: detalle.CodigoColor_,
          nombre: detalle.NombreColor
        },
        grupoTalla: {
          codigo: detalle.GrupoTalla_,
          nombre: detalle.NombreGrupoTalla
        },
        unidades: detalle.Unidades,
        tallas
      };
    });

    res.json(detalles);
  } catch (err) {
    console.error('[ERROR DETALLES STOCK]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener detalles del stock.',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 9.9 OBTENER FAMILIAS
// ============================================
app.get('/familias', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT DISTINCT 
          CodigoFamilia AS codigo, 
          CodigoFamilia AS nombre
        FROM Articulos
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoFamilia IS NOT NULL
          AND CodigoFamilia <> ''
        ORDER BY CodigoFamilia
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR FAMILIAS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener familias',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 9.10 OBTENER SUBFAMILIAS
// ============================================
app.get('/subfamilias', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT DISTINCT 
          CodigoSubfamilia AS codigo, 
          CodigoSubfamilia AS nombre
        FROM Articulos
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoSubfamilia IS NOT NULL
          AND CodigoSubfamilia <> ''
        ORDER BY CodigoSubfamilia
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR SUBFAMILIAS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener subfamilias',
      error: err.message 
    });
  }
});

// ✅ 9.11 OBTENER ARTÍCULOS CON STOCK (PAGINADO) - VERSIÓN CORREGIDA
app.get('/stock/articulos-con-stock', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 50;
  const searchTerm = req.query.search || '';
  const offset = (page - 1) * pageSize;

  try {
    const query = `
      SELECT DISTINCT
        a.CodigoArticulo,
        a.DescripcionArticulo,
        SUM(
          CASE 
            WHEN s.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
              THEN s.UnidadSaldo * a.FactorConversion_
            WHEN s.TipoUnidadMedida_ = a.UnidadMedida2_ 
              THEN s.UnidadSaldo
            ELSE s.UnidadSaldo * a.FactorConversion_
          END
        ) AS StockTotal
      FROM Articulos a
      INNER JOIN AcumuladoStockUbicacion s 
        ON s.CodigoEmpresa = a.CodigoEmpresa 
        AND s.CodigoArticulo = a.CodigoArticulo
      WHERE a.CodigoEmpresa = @codigoEmpresa
        AND s.Periodo IN (0, 99)  -- ¡Paréntesis corregido!
        AND (
          a.CodigoArticulo LIKE @searchTerm 
          OR a.DescripcionArticulo LIKE @searchTerm
        )
      GROUP BY a.CodigoArticulo, a.DescripcionArticulo
      HAVING SUM(
          CASE 
            WHEN s.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
              THEN s.UnidadSaldo * a.FactorConversion_
            WHEN s.TipoUnidadMedida_ = a.UnidadMedida2_ 
              THEN s.UnidadSaldo
            ELSE s.UnidadSaldo * a.FactorConversion_
          END
        ) > 0
      ORDER BY a.DescripcionArticulo
      OFFSET ${offset} ROWS
      FETCH NEXT ${pageSize} ROWS ONLY
    `;

    // Consulta de conteo corregida (usa el alias de la subconsulta)
    const countQuery = `
      SELECT COUNT(*) AS Total
      FROM (
        SELECT 
          a.CodigoArticulo
        FROM Articulos a
        INNER JOIN AcumuladoStockUbicacion s 
          ON s.CodigoEmpresa = a.CodigoEmpresa 
          AND s.CodigoArticulo = a.CodigoArticulo
        WHERE a.CodigoEmpresa = @codigoEmpresa
          AND s.Periodo IN (0, 99)  -- ¡Paréntesis corregido!
          AND (
            a.CodigoArticulo LIKE @searchTerm 
            OR a.DescripcionArticulo LIKE @searchTerm
          )
        GROUP BY a.CodigoArticulo
        HAVING SUM(
            CASE 
              WHEN s.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
                THEN s.UnidadSaldo * a.FactorConversion_
              WHEN s.TipoUnidadMedida_ = a.UnidadMedida2_ 
                THEN s.UnidadSaldo
              ELSE s.UnidadSaldo * a.FactorConversion_
            END
          ) > 0
      ) AS subquery  -- Usamos el alias aquí
    `;

    const request = poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('searchTerm', sql.VarChar, `%${searchTerm}%`);

    const result = await request.query(query);
    const countResult = await request.query(countQuery);
    
    const total = countResult.recordset[0].Total;
    const totalPages = Math.ceil(total / pageSize);

    res.json({
      articulos: result.recordset,
      pagination: {
        page,
        pageSize,
        total,
        totalPages
      }
    });
  } catch (err) {
    console.error('[ERROR ARTICULOS CON STOCK]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener artículos con stock',
      error: err.message 
    });
  }
});

// ✅ 9.12 OBTENER STOCK POR VARIANTE (VERSIÓN MEJORADA)
app.get('/stock/por-variante', async (req, res) => {
  const { codigoArticulo, codigoColor, codigoTalla } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !codigoArticulo) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa y artículo requeridos.' 
    });
  }

  try {
    const request = poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo);

    let query = `
      SELECT 
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        CAST(s.UnidadSaldo AS DECIMAL(18, 2)) AS Cantidad,
        COALESCE(NULLIF(s.TipoUnidadMedida_, ''), 'unidades') AS UnidadMedida,
        s.Partida
      FROM AcumuladoStockUbicacion s
      INNER JOIN Almacenes alm ON 
        alm.CodigoEmpresa = s.CodigoEmpresa 
        AND alm.CodigoAlmacen = s.CodigoAlmacen
      LEFT JOIN Ubicaciones u ON 
        u.CodigoEmpresa = s.CodigoEmpresa 
        AND u.CodigoAlmacen = s.CodigoAlmacen 
        AND u.Ubicacion = s.Ubicacion
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND s.CodigoArticulo = @codigoArticulo
        AND s.Periodo IN (0, 99)
        AND s.UnidadSaldo > 0
    `;

    // Añadir filtros por color y talla si están presentes
    if (codigoColor && codigoColor !== '') {
      query += ` AND s.CodigoColor_ = @codigoColor`;
      request.input('codigoColor', sql.VarChar, codigoColor);
    }

    if (codigoTalla && codigoTalla !== '') {
      query += ` AND s.CodigoTalla01_ = @codigoTalla`;
      request.input('codigoTalla', sql.VarChar, codigoTalla);
    }

    query += ` ORDER BY s.CodigoAlmacen, s.Ubicacion`;

    const result = await request.query(query);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR STOCK POR VARIANTE]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock por variante.',
      error: err.message 
    });
  }
});

// ✅ 9.13 SINCRONIZAR STOCK ENTRE ACUMULADOSTOCK Y ACUMULADOSTOCKUBICACION
app.post('/inventario/sincronizar-stock', async (req, res) => {
  const { codigoArticulo } = req.body;
  const codigoEmpresa = req.user.CodigoEmpresa;
  const ejercicio = new Date().getFullYear();

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  const transaction = new sql.Transaction(poolGlobal);
  
  try {
    await transaction.begin();
    
    // 1. Obtener artículos a sincronizar (todos o uno específico)
    let queryArticulos = `
      SELECT DISTINCT CodigoArticulo 
      FROM AcumuladoStock 
      WHERE CodigoEmpresa = @codigoEmpresa 
        AND Ejercicio = @ejercicio
        AND Periodo = 99
    `;
    
    if (codigoArticulo) {
      queryArticulos += ' AND CodigoArticulo = @codigoArticulo';
    }
    
    const requestArticulos = new sql.Request(transaction);
    requestArticulos.input('codigoEmpresa', sql.SmallInt, codigoEmpresa);
    requestArticulos.input('ejercicio', sql.Int, ejercicio);
    
    if (codigoArticulo) {
      requestArticulos.input('codigoArticulo', sql.VarChar, codigoArticulo);
    }
    
    const articulosResult = await requestArticulos.query(queryArticulos);
    const articulos = articulosResult.recordset;
    
    let totalSincronizados = 0;
    let totalConDiscrepancias = 0;
    
    // 2. Para cada artículo, verificar y sincronizar
    for (const articulo of articulos) {
      const codigoArticuloActual = articulo.CodigoArticulo;
      
      // Obtener stock total por almacén desde AcumuladoStock
      const requestStockTotal = new sql.Request(transaction);
      const stockTotalResult = await requestStockTotal
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.Int, ejercicio)
        .input('codigoArticulo', sql.VarChar, codigoArticuloActual)
        .query(`
          SELECT 
            CodigoAlmacen,
            TipoUnidadMedida_,
            CodigoColor_,
            CodigoTalla01_,
            Partida,
            CAST(UnidadSaldo AS DECIMAL(18, 4)) AS StockTotal
          FROM AcumuladoStock
          WHERE CodigoEmpresa = @codigoEmpresa
            AND Ejercicio = @ejercicio
            AND CodigoArticulo = @codigoArticulo
            AND Periodo = 99
        `);
      
      // Obtener stock por ubicación desde AcumuladoStockUbicacion
      const requestStockUbicacion = new sql.Request(transaction);
      const stockUbicacionResult = await requestStockUbicacion
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.Int, ejercicio)
        .input('codigoArticulo', sql.VarChar, codigoArticuloActual)
        .query(`
          SELECT 
            CodigoAlmacen,
            TipoUnidadMedida_,
            CodigoColor_,
            CodigoTalla01_,
            Partida,
            SUM(CAST(UnidadSaldo AS DECIMAL(18, 4))) AS StockUbicacionTotal
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND Ejercicio = @ejercicio
            AND CodigoArticulo = @codigoArticulo
            AND Periodo = 99
          GROUP BY CodigoAlmacen, TipoUnidadMedida_, CodigoColor_, CodigoTalla01_, Partida
        `);
      
      // Crear mapa para comparar
      const stockTotalMap = new Map();
      stockTotalResult.recordset.forEach(item => {
        const key = `${item.CodigoAlmacen}_${item.TipoUnidadMedida_}_${item.CodigoColor_ || ''}_${item.CodigoTalla01_ || ''}_${item.Partida || ''}`;
        stockTotalMap.set(key, item.StockTotal);
      });
      
      const stockUbicacionMap = new Map();
      stockUbicacionResult.recordset.forEach(item => {
        const key = `${item.CodigoAlmacen}_${item.TipoUnidadMedida_}_${item.CodigoColor_ || ''}_${item.CodigoTalla01_ || ''}_${item.Partida || ''}`;
        stockUbicacionMap.set(key, item.StockUbicacionTotal);
      });
      
      // 3. Identificar discrepancias y corregirlas
      for (const [key, stockTotal] of stockTotalMap.entries()) {
        const stockUbicacion = stockUbicacionMap.get(key) || 0;
        const diferencia = stockTotal - stockUbicacion;
        
        if (Math.abs(diferencia) > 0.001) { // Tolerancia para decimales
          totalConDiscrepancias++;
          
          // Desglosar la clave
          const [codigoAlmacen, tipoUnidadMedida, codigoColor, codigoTalla01, partida] = key.split('_');
          
          if (diferencia > 0) {
            // Hay más stock en AcumuladoStock -> agregar a una ubicación por defecto
            const requestCorreccion = new sql.Request(transaction);
            await requestCorreccion
              .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
              .input('ejercicio', sql.Int, ejercicio)
              .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
              .input('codigoArticulo', sql.VarChar, codigoArticuloActual)
              .input('tipoUnidadMedida', sql.VarChar, tipoUnidadMedida)
              .input('codigoColor', sql.VarChar, codigoColor === '' ? null : codigoColor)
              .input('codigoTalla01', sql.VarChar, codigoTalla01 === '' ? null : codigoTalla01)
              .input('partida', sql.VarChar, partida === '' ? null : partida)
              .input('diferencia', sql.Decimal(18, 4), diferencia)
              .query(`
                MERGE INTO AcumuladoStockUbicacion AS target
                USING (VALUES (
                  @codigoEmpresa, @ejercicio, @codigoAlmacen, 
                  'UBIC-DEFAULT', @codigoArticulo, @tipoUnidadMedida,
                  @codigoColor, @codigoTalla01, @partida
                )) AS source (
                  CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
                  CodigoArticulo, TipoUnidadMedida_, CodigoColor_, CodigoTalla01_, Partida
                )
                ON target.CodigoEmpresa = source.CodigoEmpresa
                  AND target.Ejercicio = source.Ejercicio
                  AND target.CodigoAlmacen = source.CodigoAlmacen
                  AND target.Ubicacion = source.Ubicacion
                  AND target.CodigoArticulo = source.CodigoArticulo
                  AND target.TipoUnidadMedida_ = source.TipoUnidadMedida_
                  AND ISNULL(target.CodigoColor_, '') = ISNULL(source.CodigoColor_, '')
                  AND ISNULL(target.CodigoTalla01_, '') = ISNULL(source.CodigoTalla01_, '')
                  AND ISNULL(target.Partida, '') = ISNULL(source.Partida, '')
                  AND target.Periodo = 99
                
                WHEN MATCHED THEN
                  UPDATE SET UnidadSaldo = target.UnidadSaldo + @diferencia
                
                WHEN NOT MATCHED THEN
                  INSERT (
                    CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
                    CodigoArticulo, TipoUnidadMedida_, CodigoColor_, CodigoTalla01_, Partida,
                    UnidadSaldo, Periodo
                  ) VALUES (
                    @codigoEmpresa, @ejercicio, @codigoAlmacen, 'UBIC-DEFAULT',
                    @codigoArticulo, @tipoUnidadMedida, 
                    @codigoColor, @codigoTalla01, @partida,
                    @diferencia, 99
                  );
              `);
          } else {
            // Hay más stock en AcumuladoStockUbicacion -> ajustar proporcionalmente
            const factorAjuste = stockTotal / stockUbicacion;
            
            const requestAjusteProporcional = new sql.Request(transaction);
            await requestAjusteProporcional
              .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
              .input('ejercicio', sql.Int, ejercicio)
              .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
              .input('codigoArticulo', sql.VarChar, codigoArticuloActual)
              .input('tipoUnidadMedida', sql.VarChar, tipoUnidadMedida)
              .input('codigoColor', sql.VarChar, codigoColor === '' ? null : codigoColor)
              .input('codigoTalla01', sql.VarChar, codigoTalla01 === '' ? null : codigoTalla01)
              .input('partida', sql.VarChar, partida === '' ? null : partida)
              .input('factorAjuste', sql.Decimal(18, 4), factorAjuste)
              .query(`
                UPDATE AcumuladoStockUbicacion
                SET UnidadSaldo = CAST(UnidadSaldo * @factorAjuste AS DECIMAL(18, 4))
                WHERE CodigoEmpresa = @codigoEmpresa
                  AND Ejercicio = @ejercicio
                  AND CodigoAlmacen = @codigoAlmacen
                  AND CodigoArticulo = @codigoArticulo
                  AND TipoUnidadMedida_ = @tipoUnidadMedida
                  AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor IS NULL))
                  AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 IS NULL))
                  AND (Partida = @partida OR (Partida IS NULL AND @partida IS NULL))
                  AND Periodo = 99
              `);
          }
        }
      }
      
      totalSincronizados++;
    }
    
    await transaction.commit();
    
    res.json({
      success: true,
      mensaje: 'Sincronización completada',
      totalArticulos: totalSincronizados,
      totalDiscrepancias: totalConDiscrepancias
    });
    
  } catch (err) {
    if (transaction._aborted === false) {
      await transaction.rollback();
    }
    console.error('[ERROR SINCRONIZAR STOCK]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al sincronizar stock',
      error: err.message 
    });
  }
});

// ✅ 9.14 OBTENER STOCK TOTAL MEJORADO (INCLUYE STOCK SIN UBICACIÓN) - VERSIÓN CORREGIDA
app.get('/inventario/stock-total-completo', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const añoActual = new Date().getFullYear();

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    console.log('🔍 Solicitando stock total completo para empresa:', codigoEmpresa);
    
    // Consulta corregida - eliminada referencia a MovPosicionLinea
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, añoActual)
      .query(`
        -- Stock con ubicación (existente)
        WITH StockConUbicacion AS (
          SELECT 
            s.CodigoEmpresa,
            s.Ejercicio,
            s.Periodo,
            s.CodigoArticulo,
            a.DescripcionArticulo,
            a.Descripcion2Articulo,
            a.CodigoFamilia,
            a.CodigoSubfamilia,
            s.CodigoAlmacen,
            alm.Almacen AS NombreAlmacen,
            s.Ubicacion,
            u.DescripcionUbicacion,
            s.Partida,
            CAST(s.UnidadSaldo AS DECIMAL(18, 0)) AS Cantidad,
            s.TipoUnidadMedida_ AS UnidadStock,
            a.UnidadMedida2_ AS UnidadBase,
            a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
            a.FactorConversion_ AS FactorConversion,
            s.CodigoColor_,
            s.CodigoTalla01_,
            CASE 
              WHEN s.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
                THEN CAST(s.UnidadSaldo * a.FactorConversion_ AS DECIMAL(18, 0))
              WHEN s.TipoUnidadMedida_ = a.UnidadMedida2_ 
                THEN CAST(s.UnidadSaldo AS DECIMAL(18, 0))
              ELSE CAST(s.UnidadSaldo AS DECIMAL(18, 0))
            END AS CantidadBase,
            CONCAT(
              s.CodigoEmpresa, '_',
              s.Ejercicio, '_',
              s.Periodo, '_',
              s.CodigoAlmacen, '_',
              s.Ubicacion, '_',
              s.CodigoArticulo, '_',
              ISNULL(s.TipoUnidadMedida_, 'unidades'), '_',
              ISNULL(s.Partida, ''), '_',
              ISNULL(s.CodigoColor_, ''), '_',
              ISNULL(s.CodigoTalla01_, '')
            ) AS ClaveUnica,
            -- MovPosicionLinea eliminado ya que no existe en AcumuladoStockUbicacion
            NULL AS MovPosicionLinea,
            0 AS EsSinUbicacion,
            'CON_UBICACION' AS TipoStock
          FROM AcumuladoStockUbicacion s
          INNER JOIN Articulos a 
            ON a.CodigoEmpresa = s.CodigoEmpresa 
            AND a.CodigoArticulo = s.CodigoArticulo
          INNER JOIN Almacenes alm 
            ON alm.CodigoEmpresa = s.CodigoEmpresa 
            AND alm.CodigoAlmacen = s.CodigoAlmacen
          LEFT JOIN Ubicaciones u 
            ON u.CodigoEmpresa = s.CodigoEmpresa 
            AND u.CodigoAlmacen = s.CodigoAlmacen 
            AND u.Ubicacion = s.Ubicacion
          WHERE s.CodigoEmpresa = @codigoEmpresa
            AND s.Periodo = 99
            AND s.Ejercicio = @ejercicio
            AND s.UnidadSaldo > 0
        ),
        
        -- Stock sin ubicación (diferencia entre AcumuladoStock y AcumuladoStockUbicacion)
        StockSinUbicacion AS (
          SELECT 
            ast.CodigoEmpresa,
            ast.Ejercicio,
            ast.Periodo,
            ast.CodigoArticulo,
            a.DescripcionArticulo,
            a.Descripcion2Articulo,
            a.CodigoFamilia,
            a.CodigoSubfamilia,
            ast.CodigoAlmacen,
            alm.Almacen AS NombreAlmacen,
            'SIN UBICACIÓN' AS Ubicacion,
            'Stock sin ubicación asignada' AS DescripcionUbicacion,
            ast.Partida,
            CAST((ast.UnidadSaldo - ISNULL(asu.StockUbicacion, 0)) AS DECIMAL(18, 0)) AS Cantidad,
            ast.TipoUnidadMedida_ AS UnidadStock,
            a.UnidadMedida2_ AS UnidadBase,
            a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
            a.FactorConversion_ AS FactorConversion,
            ast.CodigoColor_,
            ast.CodigoTalla01_,
            CASE 
              WHEN ast.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
                THEN CAST((ast.UnidadSaldo - ISNULL(asu.StockUbicacion, 0)) * a.FactorConversion_ AS DECIMAL(18, 0))
              WHEN ast.TipoUnidadMedida_ = a.UnidadMedida2_ 
                THEN CAST((ast.UnidadSaldo - ISNULL(asu.StockUbicacion, 0)) AS DECIMAL(18, 0))
              ELSE CAST((ast.UnidadSaldo - ISNULL(asu.StockUbicacion, 0)) AS DECIMAL(18, 0))
            END AS CantidadBase,
            CONCAT(
              ast.CodigoEmpresa, '_',
              ast.Ejercicio, '_',
              ast.CodigoAlmacen, '_',
              'SIN_UBICACION', '_',
              ast.CodigoArticulo, '_',
              ISNULL(ast.TipoUnidadMedida_, 'unidades'), '_',
              ISNULL(ast.Partida, ''), '_',
              ISNULL(ast.CodigoColor_, ''), '_',
              ISNULL(ast.CodigoTalla01_, '')
            ) AS ClaveUnica,
            NULL AS MovPosicionLinea,
            1 AS EsSinUbicacion,
            'SIN_UBICACION' AS TipoStock
          FROM AcumuladoStock ast
          INNER JOIN Articulos a 
            ON a.CodigoEmpresa = ast.CodigoEmpresa 
            AND a.CodigoArticulo = ast.CodigoArticulo
          INNER JOIN Almacenes alm 
            ON alm.CodigoEmpresa = ast.CodigoEmpresa 
            AND alm.CodigoAlmacen = ast.CodigoAlmacen
          LEFT JOIN (
            SELECT 
              CodigoArticulo, CodigoAlmacen, TipoUnidadMedida_, Partida,
              CodigoColor_, CodigoTalla01_, SUM(UnidadSaldo) AS StockUbicacion
            FROM AcumuladoStockUbicacion
            WHERE CodigoEmpresa = @codigoEmpresa
              AND Ejercicio = @ejercicio
              AND Periodo = 99
            GROUP BY CodigoArticulo, CodigoAlmacen, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
          ) asu ON asu.CodigoArticulo = ast.CodigoArticulo
            AND asu.CodigoAlmacen = ast.CodigoAlmacen
            AND asu.TipoUnidadMedida_ = ast.TipoUnidadMedida_
            AND ISNULL(asu.Partida, '') = ISNULL(ast.Partida, '')
            AND ISNULL(asu.CodigoColor_, '') = ISNULL(ast.CodigoColor_, '')
            AND ISNULL(asu.CodigoTalla01_, '') = ISNULL(ast.CodigoTalla01_, '')
          WHERE ast.CodigoEmpresa = @codigoEmpresa
            AND ast.Ejercicio = @ejercicio
            AND ast.Periodo = 99
            AND ast.UnidadSaldo > 0
            AND (ast.UnidadSaldo - ISNULL(asu.StockUbicacion, 0)) > 0
        )
        
        -- Combinar ambos resultados
        SELECT * FROM StockConUbicacion
        UNION ALL
        SELECT * FROM StockSinUbicacion
        ORDER BY CodigoArticulo, CodigoAlmacen, TipoStock, Ubicacion
      `);
      
    console.log('✅ Stock total completo obtenido:', result.recordset.length, 'registros');
    res.json(result.recordset);
  } catch (err) {
    console.error('❌ [ERROR STOCK TOTAL COMPLETO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock total completo',
      error: err.message,
      details: err.originalError?.info?.message || 'Sin detalles adicionales'
    });
  }
});

// ✅ 9.15 AJUSTAR INVENTARIO MEJORADO (VERSIÓN CORREGIDA - SIN PRECIO MEDIO)
app.post('/inventario/ajustar-completo', async (req, res) => {
    const { ajustes } = req.body;
    const usuario = req.user.UsuarioLogicNet;
    const codigoEmpresa = req.user.CodigoEmpresa;
    const ejercicio = new Date().getFullYear();

    if (!Array.isArray(ajustes)) {
        return res.status(400).json({ 
            success: false, 
            mensaje: 'Formato de ajustes inválido.' 
        });
    }

    const transaction = new sql.Transaction(poolGlobal);
    
    try {
        await transaction.begin();
        
        for (const ajuste of ajustes) {
            // 1. Obtener datos actuales del artículo (SIN PRECIO MEDIO)
            const requestArticulo = new sql.Request(transaction);
            const articuloResult = await requestArticulo
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('codigoArticulo', sql.VarChar, ajuste.articulo)
                .query(`
                    SELECT 
                        UnidadMedida2_, UnidadMedidaAlternativa_, FactorConversion_
                    FROM Articulos
                    WHERE CodigoEmpresa = @codigoEmpresa
                      AND CodigoArticulo = @codigoArticulo
                `);
            
            if (articuloResult.recordset.length === 0) {
                throw new Error(`Artículo ${ajuste.articulo} no encontrado`);
            }
            
            const articuloInfo = articuloResult.recordset[0];
            const precioMedio = 0; // Valor por defecto ya que no existe la columna
            
            // 2. Obtener stock actual
            const requestStock = new sql.Request(transaction);
            const stockResult = await requestStock
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
                .input('codigoArticulo', sql.VarChar, ajuste.articulo)
                .input('unidadMedida', sql.VarChar, ajuste.unidadStock)
                .input('partida', sql.VarChar, ajuste.partida || '')
                .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
                .input('codigoTalla01', sql.VarChar, ajuste.codigoTalla01 || '')
                .query(`
                    SELECT UnidadSaldo AS StockActual
                    FROM AcumuladoStock
                    WHERE CodigoEmpresa = @codigoEmpresa
                      AND Ejercicio = @ejercicio
                      AND CodigoAlmacen = @codigoAlmacen
                      AND CodigoArticulo = @codigoArticulo
                      AND TipoUnidadMedida_ = @unidadMedida
                      AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                      AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                      AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 = ''))
                      AND Periodo = 99
                `);
            
            const stockActual = stockResult.recordset.length > 0 ? stockResult.recordset[0].StockActual : 0;
            const diferencia = ajuste.nuevaCantidad - stockActual;
            
            // 3. Si es stock sin ubicación, crear una ubicación por defecto
            const ubicacionFinal = ajuste.ubicacionStr === 'SIN UBICACIÓN' ? 'UBIC-DEFAULT' : ajuste.ubicacionStr;
            
            // 4. Actualizar AcumuladoStockUbicacion (solo si no es SIN UBICACIÓN o si estamos asignando ubicación)
            if (ajuste.ubicacionStr !== 'SIN UBICACIÓN') {
                if (ajuste.nuevaCantidad === 0) {
                    // Eliminar registro si la nueva cantidad es cero
                    const requestDelete = new sql.Request(transaction);
                    await requestDelete
                        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                        .input('ejercicio', sql.Int, ejercicio)
                        .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
                        .input('ubicacion', sql.VarChar, ubicacionFinal)
                        .input('codigoArticulo', sql.VarChar, ajuste.articulo)
                        .input('unidadMedida', sql.VarChar, ajuste.unidadStock)
                        .input('partida', sql.VarChar, ajuste.partida || '')
                        .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
                        .input('codigoTalla01', sql.VarChar, ajuste.codigoTalla01 || '')
                        .query(`
                            DELETE FROM AcumuladoStockUbicacion
                            WHERE CodigoEmpresa = @codigoEmpresa
                              AND Ejercicio = @ejercicio
                              AND CodigoAlmacen = @codigoAlmacen
                              AND Ubicacion = @ubicacion
                              AND CodigoArticulo = @codigoArticulo
                              AND TipoUnidadMedida_ = @unidadMedida
                              AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                              AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                              AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 = ''))
                              AND Periodo = 99
                        `);
                } else {
                    // UPSERT para actualizar o insertar
                    const requestUpsert = new sql.Request(transaction);
                    await requestUpsert
                        .input('nuevaCantidad', sql.Decimal(18,4), ajuste.nuevaCantidad)
                        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                        .input('ejercicio', sql.Int, ejercicio)
                        .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
                        .input('ubicacion', sql.VarChar, ubicacionFinal)
                        .input('codigoArticulo', sql.VarChar, ajuste.articulo)
                        .input('unidadMedida', sql.VarChar, ajuste.unidadStock)
                        .input('partida', sql.VarChar, ajuste.partida || '')
                        .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
                        .input('codigoTalla01', sql.VarChar, ajuste.codigoTalla01 || '')
                        .query(`
                            MERGE INTO AcumuladoStockUbicacion AS target
                            USING (VALUES (
                                @codigoEmpresa, 
                                @ejercicio,
                                @codigoAlmacen, 
                                @ubicacion,
                                @codigoArticulo, 
                                @unidadMedida,
                                @partida,
                                @codigoColor,
                                @codigoTalla01
                            )) AS source (
                                CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion, 
                                CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
                            )
                            ON target.CodigoEmpresa = source.CodigoEmpresa
                                AND target.Ejercicio = source.Ejercicio
                                AND target.CodigoAlmacen = source.CodigoAlmacen
                                AND target.Ubicacion = source.Ubicacion
                                AND target.CodigoArticulo = source.CodigoArticulo
                                AND target.TipoUnidadMedida_ = source.TipoUnidadMedida_
                                AND ISNULL(target.Partida, '') = ISNULL(source.Partida, '')
                                AND ISNULL(target.CodigoColor_, '') = ISNULL(source.CodigoColor_, '')
                                AND ISNULL(target.CodigoTalla01_, '') = ISNULL(source.CodigoTalla01_, '')
                                AND target.Periodo = 99
                            
                            WHEN MATCHED THEN
                                UPDATE SET UnidadSaldo = @nuevaCantidad
                            
                            WHEN NOT MATCHED THEN
                                INSERT (
                                    CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion, 
                                    CodigoArticulo, UnidadSaldo, Periodo, Partida, TipoUnidadMedida_,
                                    CodigoColor_, CodigoTalla01_
                                ) VALUES (
                                    @codigoEmpresa, 
                                    @ejercicio,
                                    @codigoAlmacen, 
                                    @ubicacion,
                                    @codigoArticulo, 
                                    @nuevaCantidad, 
                                    99, 
                                    @partida, 
                                    @unidadMedida,
                                    @codigoColor,
                                    @codigoTalla01
                                );
                        `);
                }
            }
            
            // 5. Actualizar AcumuladoStock (siempre)
            const requestActualizarAcumuladoStock = new sql.Request(transaction);
            await requestActualizarAcumuladoStock
                .input('nuevaCantidad', sql.Decimal(18,4), ajuste.nuevaCantidad)
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
                .input('codigoArticulo', sql.VarChar, ajuste.articulo)
                .input('unidadMedida', sql.VarChar, ajuste.unidadStock)
                .input('partida', sql.VarChar, ajuste.partida || '')
                .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
                .input('codigoTalla01', sql.VarChar, ajuste.codigoTalla01 || '')
                .query(`
                    MERGE INTO AcumuladoStock AS target
                    USING (VALUES (
                        @codigoEmpresa, @ejercicio, @codigoAlmacen, @codigoArticulo,
                        @unidadMedida, @partida, @codigoColor, @codigoTalla01
                    )) AS source (
                        CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                        TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
                    )
                    ON target.CodigoEmpresa = source.CodigoEmpresa
                        AND target.Ejercicio = source.Ejercicio
                        AND target.CodigoAlmacen = source.CodigoAlmacen
                        AND target.CodigoArticulo = source.CodigoArticulo
                        AND target.TipoUnidadMedida_ = source.TipoUnidadMedida_
                        AND ISNULL(target.Partida, '') = ISNULL(source.Partida, '')
                        AND ISNULL(target.CodigoColor_, '') = ISNULL(source.CodigoColor_, '')
                        AND ISNULL(target.CodigoTalla01_, '') = ISNULL(source.CodigoTalla01_, '')
                        AND target.Periodo = 99
                    
                    WHEN MATCHED THEN
                        UPDATE SET UnidadSaldo = @nuevaCantidad
                    
                    WHEN NOT MATCHED THEN
                        INSERT (
                            CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                            TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                            UnidadSaldo, Periodo
                        ) VALUES (
                            @codigoEmpresa, @ejercicio, @codigoAlmacen, @codigoArticulo,
                            @unidadMedida, @partida, @codigoColor, @codigoTalla01,
                            @nuevaCantidad, 99
                        );
                `);
            
            // 6. Registrar movimiento solo si hay diferencia
            if (diferencia !== 0) {
                const fechaActual = new Date();
                const periodo = fechaActual.getMonth() + 1;
                const fechaSolo = new Date(
                    fechaActual.getFullYear(),
                    fechaActual.getMonth(),
                    fechaActual.getDate()
                );
                
                const requestMov = new sql.Request(transaction);
                await requestMov
                    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                    .input('ejercicio', sql.SmallInt, fechaActual.getFullYear())
                    .input('periodo', sql.Int, periodo)
                    .input('fecha', sql.Date, fechaSolo)
                    .input('fechaRegistro', sql.DateTime, fechaActual)
                    .input('tipoMovimiento', sql.SmallInt, 5)
                    .input('codigoArticulo', sql.VarChar, ajuste.articulo)
                    .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
                    .input('ubicacion', sql.VarChar, ubicacionFinal)
                    .input('partida', sql.VarChar, ajuste.partida || '')
                    .input('diferencia', sql.Decimal(18,4), diferencia)
                    .input('comentario', sql.VarChar, `Ajuste manual por ${usuario}`)
                    .input('unidadMedida', sql.VarChar, ajuste.unidadStock)
                    .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
                    .input('codigoTalla01', sql.VarChar, ajuste.codigoTalla01 || '')
                    .query(`
                        INSERT INTO MovimientoStock (
                            CodigoEmpresa, Ejercicio, Periodo, Fecha, FechaRegistro, TipoMovimiento,
                            CodigoArticulo, CodigoAlmacen, Ubicacion, Partida, Unidades, Comentario,
                            UnidadMedida1_, CodigoColor_, CodigoTalla01_,
                            AlmacenContrapartida, UbicacionContrapartida
                        ) VALUES (
                            @codigoEmpresa, 
                            @ejercicio, 
                            @periodo, 
                            @fecha, 
                            @fechaRegistro, 
                            @tipoMovimiento,
                            @codigoArticulo, 
                            @codigoAlmacen, 
                            @ubicacion, 
                            @partida, 
                            @diferencia, 
                            @comentario, 
                            @unidadMedida, 
                            @codigoColor,
                            @codigoTalla01,
                            @codigoAlmacen,
                            @ubicacion
                        )
                    `);
            }
            
            // 7. REGISTRAR EN TABLA INVENTARIOS (VERSIÓN CORREGIDA - SIN PRECIO MEDIO)
            const fechaInventario = new Date();
            // Generar código de inventario como Sage (REG + DÍA + MES abreviado)
            const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
            const mesAbrev = meses[fechaInventario.getMonth()];
            const dia = fechaInventario.getDate().toString().padStart(2, '0');
            const inventarioCodigo = `REG${dia}${mesAbrev}`;
            
            const requestInventario = new sql.Request(transaction);
            await requestInventario
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('inventario', sql.VarChar, inventarioCodigo)
                .input('codigoArticulo', sql.VarChar, ajuste.articulo)
                .input('partida', sql.VarChar, ajuste.partida || '')
                .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
                .input('tipoUnidadMedida', sql.VarChar, ajuste.unidadStock)
                .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
                .input('codigoTalla01', sql.VarChar, ajuste.codigoTalla01 || '')
                .input('unidadesStock', sql.Decimal(18,4), stockActual) // Stock actual
                .input('unidadesInventario', sql.Decimal(18,4), ajuste.nuevaCantidad) // Nueva cantidad
                .input('unidadesStock1', sql.Decimal(18,4), stockActual) // Para UnidadesStock1_
                .input('unidadesInventario1', sql.Decimal(18,4), ajuste.nuevaCantidad) // Para UnidadesInventario1_
                .input('precioMedio', sql.Decimal(18,4), 0) // Valor por defecto
                .input('precioNuevo', sql.Decimal(18,4), 0) // Valor por defecto
                .input('fechaInventario', sql.Date, fechaInventario)
                .input('fechaCreacion', sql.DateTime, fechaInventario)
                .query(`
                    INSERT INTO Inventarios (
                        CodigoEmpresa, Inventario, CodigoArticulo, Partida,
                        CodigoAlmacen, TipoUnidadMedida_, CodigoColor_, CodigoTalla01_,
                        UnidadesStock, UnidadesInventario, UnidadesStock1_, UnidadesInventario1_,
                        PrecioMedio, PrecioNuevo, FechaInventario, FechaCreacion, StatusRegulariza
                    ) VALUES (
                        @codigoEmpresa, @inventario, @codigoArticulo, @partida,
                        @codigoAlmacen, @tipoUnidadMedida, @codigoColor, @codigoTalla01,
                        @unidadesStock, @unidadesInventario, @unidadesStock1, @unidadesInventario1,
                        @precioMedio, @precioNuevo, @fechaInventario, @fechaCreacion, -1
                    )
                `);
        }

        await transaction.commit();
        res.json({ 
            success: true, 
            mensaje: 'Ajustes realizados correctamente y registrados en inventarios' 
        });
        
    } catch (err) {
        if (transaction._aborted === false) {
            await transaction.rollback();
        }
        console.error('[ERROR AJUSTAR INVENTARIO COMPLETO]', err);
        res.status(500).json({ 
            success: false, 
            mensaje: 'Error al ajustar inventario',
            error: err.message,
            stack: err.stack
        });
    }
});
// ✅ 9.18 OBTENER ALMACENES
app.get('/almacenes', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT CodigoAlmacen, Almacen AS NombreAlmacen 
        FROM Almacenes 
        WHERE CodigoEmpresa = @codigoEmpresa
        ORDER BY Almacen
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ALMACENES]', err);
    res.status(500).json({ error: 'Error al obtener almacenes' });
  }
});

// ✅ 9.19 OBTENER UBICACIONES POR ALMACÉN
app.get('/ubicaciones/:codigoAlmacen', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { codigoAlmacen } = req.params;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .query(`
        SELECT Ubicacion, DescripcionUbicacion 
        FROM Ubicaciones 
        WHERE CodigoEmpresa = @codigoEmpresa 
          AND CodigoAlmacen = @codigoAlmacen
        ORDER BY Ubicacion
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR UBICACIONES]', err);
    res.status(500).json({ error: 'Error al obtener ubicaciones' });
  }
});

// ✅ 9.20 OBTENER INFORMACIÓN DE ARTÍCULO (VERSIÓN CORREGIDA)
app.get('/articulos/:codigoArticulo', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { codigoArticulo } = req.params;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT 
          CodigoArticulo, 
          DescripcionArticulo, 
          UnidadMedida2_, 
          UnidadMedidaAlternativa_, 
          FactorConversion_
        FROM Articulos 
        WHERE CodigoEmpresa = @codigoEmpresa 
          AND CodigoArticulo = @codigoArticulo
      `);
      
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Artículo no encontrado' });
    }
    
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('[ERROR ARTICULO]', err);
    res.status(500).json({ error: 'Error al obtener artículo' });
  }
});

// ============================================
// ✅ 9.8 OBTENER DETALLES POR MOV_POSICION_LINEA (VERSIÓN MEJORADA)
// ============================================
app.get('/stock/detalles', async (req, res) => {
  const { movPosicionLinea } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !movPosicionLinea) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan parámetros requeridos.' 
    });
  }

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('movPosicionLinea', sql.VarChar, movPosicionLinea)
      .query(`
        SELECT 
          lt.CodigoColor_,
          c.Color_ AS NombreColor,
          lt.GrupoTalla_,
          gt.DescripcionGrupoTalla_ AS NombreGrupoTalla,
          -- Obtener descripciones de tallas
          t01.DescripcionTalla_ AS DescTalla01,
          t02.DescripcionTalla_ AS DescTalla02,
          t03.DescripcionTalla_ AS DescTalla03,
          t04.DescripcionTalla_ AS DescTalla04,
          lt.UnidadesTotalTallas_ AS Unidades,
          lt.UnidadesTalla01_,
          lt.UnidadesTalla02_,
          lt.UnidadesTalla03_,
          lt.UnidadesTalla04_
        FROM LineasPedidoClienteTallas lt
        LEFT JOIN Colores_ c 
          ON lt.CodigoColor_ = c.CodigoColor_
          AND lt.CodigoEmpresa = c.CodigoEmpresa
        LEFT JOIN GrupoTallas_ gt 
          ON lt.GrupoTalla_ = gt.GrupoTalla_ 
          AND lt.CodigoEmpresa = gt.CodigoEmpresa
        LEFT JOIN Tallas_ t01 ON lt.CodigoEmpresa = t01.CodigoEmpresa AND lt.GrupoTalla_ = t01.GrupoTalla_ AND lt.CodigoTalla01_ = t01.CodigoTalla_
        LEFT JOIN Tallas_ t02 ON lt.CodigoEmpresa = t02.CodigoEmpresa AND lt.GrupoTalla_ = t02.GrupoTalla_ AND lt.CodigoTalla02_ = t02.CodigoTalla_
        LEFT JOIN Tallas_ t03 ON lt.CodigoEmpresa = t03.CodigoEmpresa AND lt.GrupoTalla_ = t03.GrupoTalla_ AND lt.CodigoTalla03_ = t03.CodigoTalla_
        LEFT JOIN Tallas_ t04 ON lt.CodigoEmpresa = t04.CodigoEmpresa AND lt.GrupoTalla_ = t04.GrupoTalla_ AND lt.CodigoTalla04_ = t04.CodigoTalla_
        WHERE lt.CodigoEmpresa = @codigoEmpresa
          AND lt.MovPosicionLinea_ = @movPosicionLinea
      `);

    const detalles = result.recordset.map(detalle => {
      const tallas = {
        '01': {
          descripcion: detalle.DescTalla01,
          unidades: detalle.UnidadesTalla01_
        },
        '02': {
          descripcion: detalle.DescTalla02,
          unidades: detalle.UnidadesTalla02_
        },
        '03': {
          descripcion: detalle.DescTalla03,
          unidades: detalle.UnidadesTalla03_
        },
        '04': {
          descripcion: detalle.DescTalla04,
          unidades: detalle.UnidadesTalla04_
        }
      };

      return {
        color: {
          codigo: detalle.CodigoColor_,
          nombre: detalle.NombreColor
        },
        grupoTalla: {
          codigo: detalle.GrupoTalla_,
          nombre: detalle.NombreGrupoTalla
        },
        unidades: detalle.Unidades,
        tallas
      };
    });

    res.json(detalles);
  } catch (err) {
    console.error('[ERROR DETALLES STOCK]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener detalles del stock.',
      error: err.message 
    });
  }
});
// ============================================
// ✅ 10. TRASPASOS SCREEN
// ============================================

// ✅ 10.1 OBTENER ALMACENES POR EMPRESA

app.get('/almacenes', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT CodigoAlmacen, Almacen 
        FROM Almacenes
        WHERE CodigoEmpresa = @codigoEmpresa
        AND CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ALMACENES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener almacenes.',
      error: err.message 
    });
  }
});

// ✅ 10.2 OBTENER UBICACIONES POR ALMACÉN

app.get('/ubicaciones', async (req, res) => {
  const { codigoAlmacen, excluirUbicacion } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !codigoAlmacen) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa y almacén requeridos.' 
    });
  }

  try {
    let query = `
      SELECT Ubicacion, DescripcionUbicacion
      FROM Ubicaciones
      WHERE CodigoEmpresa = @codigoEmpresa
        AND CodigoAlmacen = @codigoAlmacen
    `;
    
    const request = poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen);
    
    // Excluir ubicación específica si se proporciona
    if (excluirUbicacion) {
      query += ' AND Ubicacion <> @excluirUbicacion';
      request.input('excluirUbicacion', sql.VarChar, excluirUbicacion);
    }
    
    query += ' ORDER BY Ubicacion';
    
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR UBICACIONES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener ubicaciones.',
      error: err.message 
    });
  }
});

// ✅ 10.3 ACTUALIZAR STOCK Y REGISTRAR TRASPASO (VERSIÓN COMPLETA MODIFICADA)
app.post('/traspaso', async (req, res) => {
    const { articulo, origenAlmacen, origenUbicacion, destinoAlmacen, destinoUbicacion, cantidad, unidadMedida, partida, codigoTalla, codigoColor } = req.body;
    const usuario = req.user.UsuarioLogicNet;
    const codigoEmpresa = req.user.CodigoEmpresa;
    const ejercicio = new Date().getFullYear();

    // Validaciones
    const cantidadNum = Number(cantidad);
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
        return res.status(400).json({ 
            success: false, 
            mensaje: 'La cantidad debe ser un número válido y positivo.' 
        });
    }

    if (!articulo || !origenAlmacen || !origenUbicacion || !destinoAlmacen || !destinoUbicacion || !unidadMedida) {
        return res.status(400).json({ 
            success: false, 
            mensaje: 'Faltan campos requeridos para el traspaso.' 
        });
    }

    if (origenAlmacen === destinoAlmacen && origenUbicacion === destinoUbicacion) {
        return res.status(400).json({ 
            success: false, 
            mensaje: 'No puedes traspasar a la misma ubicación de origen.' 
        });
    }

    const transaction = new sql.Transaction(poolGlobal);
    
    try {
        await transaction.begin();
        
        // 1. Obtener datos del stock origen con condiciones específicas
        const requestGet = new sql.Request(transaction);
        const stockResult = await requestGet
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('ubicacion', sql.VarChar, origenUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('unidadMedida', sql.VarChar, unidadMedida)
            .input('partida', sql.VarChar, partida || '')
            .input('codigoTalla', sql.VarChar, codigoTalla || '')
            .input('codigoColor', sql.VarChar, codigoColor || '')
            .query(`
                SELECT 
                    TipoUnidadMedida_ AS UnidadMedida, 
                    SUM(UnidadSaldo) AS CantidadTotal,
                    MAX(Partida) AS PartidaExistente,
                    MAX(CodigoTalla01_) AS TallaExistente,
                    MAX(CodigoColor_) AS ColorExistente
                FROM AcumuladoStockUbicacion
                WHERE CodigoEmpresa = @codigoEmpresa
                    AND Ejercicio = @ejercicio
                    AND CodigoAlmacen = @codigoAlmacen
                    AND Ubicacion = @ubicacion
                    AND CodigoArticulo = @codigoArticulo
                    AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                    AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
                    AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                    AND (
                        (TipoUnidadMedida_ = @unidadMedida) 
                        OR 
                        ((TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '') AND @unidadMedida = 'unidades')
                    )
                    AND Periodo IN (0, 99)
                GROUP BY CodigoAlmacen, Ubicacion, CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
            `);
        
        if (stockResult.recordset.length === 0 || stockResult.recordset[0].CantidadTotal === null) {
            throw new Error('Stock en ubicación de origen no encontrado');
        }
        
        const stockTotal = stockResult.recordset[0].CantidadTotal;
        const partidaExistente = stockResult.recordset[0].PartidaExistente;
        const tallaExistente = stockResult.recordset[0].TallaExistente;
        const colorExistente = stockResult.recordset[0].ColorExistente;
        const unidadMedidaReal = stockResult.recordset[0].UnidadMedida || unidadMedida;
        
        if (cantidadNum > stockTotal) {
            throw new Error(`Cantidad supera el stock disponible (${stockTotal})`);
        }

        // 2. Eliminar registros con saldo cero en origen
        const requestDeleteCero = new sql.Request(transaction);
        await requestDeleteCero
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('ubicacion', sql.VarChar, origenUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('unidadMedida', sql.VarChar, unidadMedidaReal)
            .input('partida', sql.VarChar, partidaExistente || partida || '')
            .input('codigoTalla', sql.VarChar, tallaExistente || codigoTalla || '')
            .input('codigoColor', sql.VarChar, colorExistente || codigoColor || '')
            .query(`
                DELETE FROM AcumuladoStockUbicacion
                WHERE CodigoEmpresa = @codigoEmpresa
                  AND Ejercicio = @ejercicio
                  AND CodigoAlmacen = @codigoAlmacen
                  AND Ubicacion = @ubicacion
                  AND CodigoArticulo = @codigoArticulo
                  AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                  AND (
                      (TipoUnidadMedida_ = @unidadMedida)
                      OR 
                      ((TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '') AND @unidadMedida = 'unidades')
                  )
                  AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
                  AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                  AND Periodo = 99
                  AND UnidadSaldo = 0
            `);

        // 3. UPSERT para origen
        const nuevoSaldoOrigen = stockTotal - cantidadNum;
        const requestUpsertOrigen = new sql.Request(transaction);
        await requestUpsertOrigen
            .input('nuevoSaldo', sql.Decimal(18,4), nuevoSaldoOrigen)
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('ubicacion', sql.VarChar, origenUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('unidadMedida', sql.VarChar, unidadMedidaReal)
            .input('partida', sql.VarChar, partidaExistente || partida || '')
            .input('codigoTalla', sql.VarChar, tallaExistente || codigoTalla || '')
            .input('codigoColor', sql.VarChar, colorExistente || codigoColor || '')
            .query(`
                MERGE INTO AcumuladoStockUbicacion AS target
                USING (VALUES (
                    @codigoEmpresa, 
                    @ejercicio,
                    @codigoAlmacen, 
                    @ubicacion,
                    @codigoArticulo, 
                    @unidadMedida,
                    @partida,
                    @codigoTalla,
                    @codigoColor
                )) AS source (
                    CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion, 
                    CodigoArticulo, TipoUnidadMedida_, Partida, CodigoTalla01_, CodigoColor_
                )
                ON target.CodigoEmpresa = source.CodigoEmpresa
                    AND target.Ejercicio = source.Ejercicio
                    AND target.CodigoAlmacen = source.CodigoAlmacen
                    AND target.Ubicacion = source.Ubicacion
                    AND target.CodigoArticulo = source.CodigoArticulo
                    AND (
                        (target.TipoUnidadMedida_ = source.TipoUnidadMedida_)
                        OR 
                        ((target.TipoUnidadMedida_ IS NULL OR target.TipoUnidadMedida_ = '') AND source.TipoUnidadMedida_ = 'unidades')
                    )
                    AND ISNULL(target.Partida, '') = ISNULL(source.Partida, '')
                    AND ISNULL(target.CodigoTalla01_, '') = ISNULL(source.CodigoTalla01_, '')
                    AND ISNULL(target.CodigoColor_, '') = ISNULL(source.CodigoColor_, '')
                    AND target.Periodo = 99
                
                WHEN MATCHED THEN
                    UPDATE SET UnidadSaldo = @nuevoSaldo
                
                WHEN NOT MATCHED THEN
                    INSERT (
                        CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion, 
                        CodigoArticulo, UnidadSaldo, Periodo, Partida, TipoUnidadMedida_,
                        CodigoTalla01_, CodigoColor_
                    ) VALUES (
                        @codigoEmpresa, 
                        @ejercicio,
                        @codigoAlmacen, 
                        @ubicacion,
                        @codigoArticulo, 
                        @nuevoSaldo, 
                        99, 
                        @partida, 
                        @unidadMedida,
                        @codigoTalla,
                        @codigoColor
                    );
            `);

        // 4. UPSERT para destino
        const requestGetDestino = new sql.Request(transaction);
        const destinoResult = await requestGetDestino
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
            .input('ubicacion', sql.VarChar, destinoUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('partida', sql.VarChar, partidaExistente || partida || '')
            .input('unidadMedida', sql.VarChar, unidadMedidaReal)
            .input('codigoTalla', sql.VarChar, tallaExistente || codigoTalla || '')
            .input('codigoColor', sql.VarChar, colorExistente || codigoColor || '')
            .query(`
                SELECT SUM(UnidadSaldo) AS CantidadTotal
                FROM AcumuladoStockUbicacion
                WHERE CodigoEmpresa = @codigoEmpresa
                  AND Ejercicio = @ejercicio
                  AND CodigoAlmacen = @codigoAlmacen
                  AND Ubicacion = @ubicacion
                  AND CodigoArticulo = @codigoArticulo
                  AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                  AND (
                      (TipoUnidadMedida_ = @unidadMedida)
                      OR 
                      ((TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '') AND @unidadMedida = 'unidades')
                  )
                  AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
                  AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                  AND Periodo IN (0, 99)
            `);
        
        let stockDestino = 0;
        if (destinoResult.recordset.length > 0 && destinoResult.recordset[0].CantidadTotal !== null) {
            stockDestino = destinoResult.recordset[0].CantidadTotal;
        }
        
        const requestDeleteDestino = new sql.Request(transaction);
        await requestDeleteDestino
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
            .input('ubicacion', sql.VarChar, destinoUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('partida', sql.VarChar, partidaExistente || partida || '')
            .input('unidadMedida', sql.VarChar, unidadMedidaReal)
            .input('codigoTalla', sql.VarChar, tallaExistente || codigoTalla || '')
            .input('codigoColor', sql.VarChar, colorExistente || codigoColor || '')
            .query(`
                DELETE FROM AcumuladoStockUbicacion
                WHERE CodigoEmpresa = @codigoEmpresa
                  AND Ejercicio = @ejercicio
                  AND CodigoAlmacen = @codigoAlmacen
                  AND Ubicacion = @ubicacion
                  AND CodigoArticulo = @codigoArticulo
                  AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                  AND (
                      (TipoUnidadMedida_ = @unidadMedida)
                      OR 
                      ((TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '') AND @unidadMedida = 'unidades')
                  )
                  AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
                  AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                  AND Periodo = 99
                  AND UnidadSaldo = 0
            `);

        const nuevoSaldoDestino = stockDestino + cantidadNum;
        const requestUpsertDestino = new sql.Request(transaction);
        await requestUpsertDestino
            .input('nuevoSaldo', sql.Decimal(18,4), nuevoSaldoDestino)
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
            .input('ubicacion', sql.VarChar, destinoUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('unidadMedida', sql.VarChar, unidadMedidaReal)
            .input('partida', sql.VarChar, partidaExistente || partida || '')
            .input('codigoTalla', sql.VarChar, tallaExistente || codigoTalla || '')
            .input('codigoColor', sql.VarChar, colorExistente || codigoColor || '')
            .query(`
                MERGE INTO AcumuladoStockUbicacion AS target
                USING (VALUES (
                    @codigoEmpresa, 
                    @ejercicio,
                    @codigoAlmacen, 
                    @ubicacion,
                    @codigoArticulo, 
                    @unidadMedida,
                    @partida,
                    @codigoTalla,
                    @codigoColor
                )) AS source (
                    CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion, 
                    CodigoArticulo, TipoUnidadMedida_, Partida, CodigoTalla01_, CodigoColor_
                )
                ON target.CodigoEmpresa = source.CodigoEmpresa
                    AND target.Ejercicio = source.Ejercicio
                    AND target.CodigoAlmacen = source.CodigoAlmacen
                    AND target.Ubicacion = source.Ubicacion
                    AND target.CodigoArticulo = source.CodigoArticulo
                    AND (
                        (target.TipoUnidadMedida_ = source.TipoUnidadMedida_)
                        OR 
                        ((target.TipoUnidadMedida_ IS NULL OR target.TipoUnidadMedida_ = '') AND source.TipoUnidadMedida_ = 'unidades')
                    )
                    AND ISNULL(target.Partida, '') = ISNULL(source.Partida, '')
                    AND ISNULL(target.CodigoTalla01_, '') = ISNULL(source.CodigoTalla01_, '')
                    AND ISNULL(target.CodigoColor_, '') = ISNULL(source.CodigoColor_, '')
                    AND target.Periodo = 99
                
                WHEN MATCHED THEN
                    UPDATE SET UnidadSaldo = @nuevoSaldo
                
                WHEN NOT MATCHED THEN
                    INSERT (
                        CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion, 
                        CodigoArticulo, UnidadSaldo, Periodo, Partida, TipoUnidadMedida_,
                        CodigoTalla01_, CodigoColor_
                    ) VALUES (
                        @codigoEmpresa, 
                        @ejercicio,
                        @codigoAlmacen, 
                        @ubicacion,
                        @codigoArticulo, 
                        @nuevoSaldo, 
                        99, 
                        @partida, 
                        @unidadMedida,
                        @codigoTalla,
                        @codigoColor
                    );
            `);

        // 5. Registrar movimiento
        const fechaActual = new Date();
        const offsetMadrid = 2;
        const horaMadrid = new Date(fechaActual.getTime() + offsetMadrid * 60 * 60 * 1000);
        const fechaSolo = new Date(
            horaMadrid.getFullYear(),
            horaMadrid.getMonth(),
            horaMadrid.getDate()
        );
        const fechaConHora = new Date(
            horaMadrid.getFullYear(),
            horaMadrid.getMonth(),
            horaMadrid.getDate(),
            horaMadrid.getHours(),
            horaMadrid.getMinutes(),
            horaMadrid.getSeconds()
        );
        const periodo = horaMadrid.getMonth() + 1;
        const ejercicioMov = horaMadrid.getFullYear();

        const requestMov = new sql.Request(transaction);
        await requestMov
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.SmallInt, ejercicioMov)
            .input('periodo', sql.Int, periodo)
            .input('fecha', sql.Date, fechaSolo)
            .input('fechaRegistro', sql.DateTime, fechaConHora)
            .input('tipoMovimiento', sql.SmallInt, 3)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('almacenContrapartida', sql.VarChar, destinoAlmacen)
            .input('ubicacion', sql.VarChar, origenUbicacion)
            .input('ubicacionContrapartida', sql.VarChar, destinoUbicacion)
            .input('partida', sql.VarChar, partidaExistente || partida || '')
            .input('diferencia', sql.Decimal(18,4), cantidadNum)
            .input('comentario', sql.VarChar, `Traspaso por Usuario: ${usuario}`)
            .input('unidadMedida', sql.VarChar, unidadMedidaReal)
            .input('grupoTalla', sql.Int, codigoTalla ? 1 : 0)
            .input('codigoTalla', sql.VarChar, tallaExistente || codigoTalla || '')
            .input('codigoColor', sql.VarChar, colorExistente || codigoColor || '')
            .query(`
                INSERT INTO MovimientoStock (
                    CodigoEmpresa, Ejercicio, Periodo, Fecha, FechaRegistro, TipoMovimiento,
                    CodigoArticulo, CodigoAlmacen, AlmacenContrapartida, Ubicacion, UbicacionContrapartida,
                    Unidades, Comentario, UnidadMedida1_, Partida,
                    GrupoTalla_, CodigoTalla01_, CodigoColor_
                ) VALUES (
                    @codigoEmpresa, 
                    @ejercicio, 
                    @periodo, 
                    @fecha, 
                    @fechaRegistro, 
                    @tipoMovimiento,
                    @codigoArticulo, 
                    @codigoAlmacen, 
                    @almacenContrapartida,
                    @ubicacion, 
                    @ubicacionContrapartida,
                    @diferencia, 
                    @comentario, 
                    @unidadMedida, 
                    @partida,
                    @grupoTalla,
                    @codigoTalla,
                    @codigoColor
                )
            `);

        await transaction.commit();
        
        res.json({ 
            success: true, 
            mensaje: 'Traspaso realizado con éxito',
            datos: {
                articulo: articulo,
                origen: `${origenAlmacen}-${origenUbicacion}`,
                destino: `${destinoAlmacen}-${destinoUbicacion}`,
                cantidad: cantidadNum,
                unidad: unidadMedidaReal,
                fecha: fechaConHora.toLocaleString('es-ES', {
                    timeZone: 'Europe/Madrid',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                })
            }
        });
        
    } catch (err) {
        if (transaction._aborted === false) {
            await transaction.rollback();
        }
        console.error('[ERROR TRASPASO]', err);
        res.status(500).json({ 
            success: false, 
            mensaje: 'Error al realizar el traspaso',
            error: err.message,
            stack: err.stack
        });
    }
});

// ✅ 10.4 OBTENER HISTÓRICO DE TRASPASOS


app.get('/historial-traspasos', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !usuario) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa y usuario requeridos.' 
    });
  }

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          m.FechaRegistro,
          FORMAT(m.FechaRegistro, 'dd/MM/yyyy HH:mm:ss') AS FechaFormateada,
          m.CodigoArticulo,
          a.DescripcionArticulo,
          m.CodigoAlmacen AS OrigenAlmacen,
          almOrigen.Almacen AS NombreOrigenAlmacen,
          m.Ubicacion AS OrigenUbicacion,
          m.AlmacenContrapartida AS DestinoAlmacen,
          almDestino.Almacen AS NombreDestinoAlmacen,
          m.UbicacionContrapartida AS DestinoUbicacion,
          m.Unidades AS Cantidad,
          m.Comentario,
          m.UnidadMedida1_ AS UnidadMedida,
          m.Partida,
          CASE 
            WHEN m.TipoMovimiento = 3 THEN 'Salida'
            WHEN m.TipoMovimiento = 4 THEN 'Entrada'
            ELSE 'Otro'
          END AS TipoMovimiento
        FROM MovimientoStock m
        LEFT JOIN Articulos a 
          ON a.CodigoArticulo = m.CodigoArticulo 
          AND a.CodigoEmpresa = m.CodigoEmpresa
        LEFT JOIN Almacenes almOrigen 
          ON almOrigen.CodigoAlmacen = m.CodigoAlmacen 
          AND almOrigen.CodigoEmpresa = m.CodigoEmpresa
        LEFT JOIN Almacenes almDestino 
          ON almDestino.CodigoAlmacen = m.AlmacenContrapartida 
          AND almDestino.CodigoEmpresa = m.CodigoEmpresa
        WHERE m.CodigoEmpresa = @codigoEmpresa
          AND m.TipoMovimiento IN (3, 4) -- Traspasos
        ORDER BY m.FechaRegistro DESC
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR HISTORIAL TRASPASOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener histórico de traspasos.',
      error: err.message 
    });
  }
});

// ✅ 10.5 OBTENER UBICACIONES AGRUPADAS POR ALMACÉN (VERSIÓN PAGINADA)
app.get('/ubicaciones-agrupadas-paginadas', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 50;
  const offset = (page - 1) * pageSize;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    // Consulta para obtener almacenes con paginación
    const almacenesQuery = `
      SELECT DISTINCT
        a.CodigoAlmacen,
        a.Almacen AS NombreAlmacen
      FROM Almacenes a
      WHERE a.CodigoEmpresa = @codigoEmpresa
        AND a.CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
      ORDER BY a.Almacen
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT CodigoAlmacen) AS Total
      FROM Almacenes
      WHERE CodigoEmpresa = @codigoEmpresa
        AND CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
    `;

    const request = poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('offset', sql.Int, offset)
      .input('pageSize', sql.Int, pageSize);

    const almacenesResult = await request.query(almacenesQuery);
    const countResult = await request.query(countQuery);
    
    const total = countResult.recordset[0].Total;
    const totalPages = Math.ceil(total / pageSize);

    // Para cada almacén, obtener sus ubicaciones (esto se puede optimizar aún más)
    const almacenesConUbicaciones = [];
    
    for (const almacen of almacenesResult.recordset) {
      const ubicacionesResult = await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar, almacen.CodigoAlmacen)
        .query(`
          SELECT TOP 10 
            u.Ubicacion,
            '' AS DescripcionUbicacion,
            COUNT(s.CodigoArticulo) AS CantidadArticulos
          FROM Ubicaciones u
          LEFT JOIN AcumuladoStockUbicacion s 
            ON s.CodigoEmpresa = u.CodigoEmpresa 
            AND s.CodigoAlmacen = u.CodigoAlmacen 
            AND s.Ubicacion = u.Ubicacion
            AND s.Periodo = 99
            AND s.UnidadSaldo > 0
          WHERE u.CodigoEmpresa = @codigoEmpresa
            AND u.CodigoAlmacen = @codigoAlmacen
          GROUP BY u.Ubicacion
          ORDER BY u.Ubicacion
        `);
      
      almacenesConUbicaciones.push({
        codigo: almacen.CodigoAlmacen,
        nombre: almacen.Almacen,
        ubicaciones: ubicacionesResult.recordset
      });
    }

    res.json({
      almacenes: almacenesConUbicaciones,
      pagination: {
        page,
        pageSize,
        total,
        totalPages
      }
    });
  } catch (err) {
    console.error('[ERROR UBICACIONES AGRUPADAS PAGINADAS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener ubicaciones agrupadas.',
      error: err.message 
    });
  }
});

// ✅ OBTENER UBICACIONES POR ALMACÉN (PARA CARGA BAJO DEMANDA)
app.get('/ubicaciones-por-almacen/:codigoAlmacen', async (req, res) => {
  const { codigoAlmacen } = req.params;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .query(`
        SELECT 
          u.Ubicacion,
          '' AS DescripcionUbicacion,
          COUNT(s.CodigoArticulo) AS CantidadArticulos
        FROM Ubicaciones u
        LEFT JOIN AcumuladoStockUbicacion s 
          ON s.CodigoEmpresa = u.CodigoEmpresa 
          AND s.CodigoAlmacen = u.CodigoAlmacen 
          AND s.Ubicacion = u.Ubicacion
          AND s.Periodo = 99
          AND s.UnidadSaldo > 0
        WHERE u.CodigoEmpresa = @codigoEmpresa
          AND u.CodigoAlmacen = @codigoAlmacen
        GROUP BY u.Ubicacion
        ORDER BY u.Ubicacion
      `);
    
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR UBICACIONES POR ALMACEN]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener ubicaciones por almacén.',
      error: err.message 
    });
  }
});

// ✅ BUSCAR UBICACIONES
app.get('/buscar-ubicaciones', async (req, res) => {
  const { termino } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('termino', sql.VarChar, `%${termino}%`)
      .query(`
        SELECT TOP 20
          u.CodigoAlmacen,
          a.Almacen AS NombreAlmacen,
          u.Ubicacion,
          '' AS DescripcionUbicacion,
          COUNT(s.CodigoArticulo) AS CantidadArticulos
        FROM Ubicaciones u
        INNER JOIN Almacenes a 
          ON a.CodigoEmpresa = u.CodigoEmpresa 
          AND a.CodigoAlmacen = u.CodigoAlmacen
        LEFT JOIN AcumuladoStockUbicacion s 
          ON s.CodigoEmpresa = u.CodigoEmpresa 
          AND s.CodigoAlmacen = u.CodigoAlmacen 
          AND s.Ubicacion = u.Ubicacion
          AND s.Periodo = 99
          AND s.UnidadSaldo > 0
        WHERE u.CodigoEmpresa = @codigoEmpresa
          AND u.Ubicacion LIKE @termino
        GROUP BY u.CodigoAlmacen, a.Almacen, u.Ubicacion
        ORDER BY u.Ubicacion
      `);
    
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR BUSCAR UBICACIONES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al buscar ubicaciones.',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 5. PEDIDOS SCREEN
// ============================================

// ✅ 5.1 PEDIDOS PENDIENTES (ACTUALIZADO PARA INCLUIR PEDIDOS PARCIALES)
app.get('/pedidosPendientes', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ 
      success: false, 
      mensaje: 'No autenticado' 
    });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  const usuario = req.user.UsuarioLogicNet;
  
  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido' 
    });
  }

  try {
    // 1. Obtener permisos del usuario
    const userPermResult = await poolGlobal.request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador, StatusUsuarioAvanzado, StatusTodosLosPedidos 
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
      `);
    
    if (userPermResult.recordset.length === 0) {
      return res.status(403).json({ 
        success: false, 
        mensaje: 'Usuario no encontrado' 
      });
    }
    
    const userPerms = userPermResult.recordset[0];
    const esAdmin = userPerms.StatusAdministrador === -1;
    const esUsuarioAvanzado = userPerms.StatusUsuarioAvanzado === -1;
    const esPreparador = userPerms.StatusTodosLosPedidos === -1;
    
    // 2. Construir condición para filtrar por usuario asignado
    let usuarioCondition = '';
    if (esPreparador && !esAdmin && !esUsuarioAvanzado) {
      usuarioCondition = `AND c.EmpleadoAsignado = '${usuario}'`;
    }

    // 3. Obtener parámetros de filtro
    const rangoDias = req.query.rango || 'semana';
    const formaEntrega = req.query.formaEntrega;
    const empleado = req.query.empleado;
    const estadosPedido = req.query.estados ? req.query.estados.split(',') : [];
    const empleadoAsignado = req.query.empleadoAsignado;
    
    // 4. Calcular fechas según rango
    const hoy = new Date();
    let fechaInicio, fechaFin;
    
    if (rangoDias === 'dia') {
      fechaInicio = new Date(hoy);
      fechaInicio.setDate(hoy.getDate() - 1);
      fechaFin = new Date(hoy);
      fechaFin.setDate(hoy.getDate() + 1);
    } else {
      fechaInicio = new Date(hoy);
      fechaInicio.setDate(hoy.getDate() - 7);
      fechaFin = new Date(hoy);
      fechaFin.setDate(hoy.getDate() + 7);
    }

    // 5. Formatear fechas para SQL
    const formatDate = (date) => date.toISOString().split('T')[0];
    
    // 6. Mapeo de formas de entrega
    const formasEntregaMap = {
      1: 'Recogida Guadalhorce',
      3: 'Nuestros Medios',
      4: 'Agencia',
      5: 'Directo Fabrica',
      6: 'Pedido Express'
    };

    // 7. Consulta principal (ACTUALIZADA para incluir Estado 4 - Parcial)
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          c.CodigoEmpresa,
          c.EjercicioPedido,
          c.SeriePedido,
          c.NumeroPedido,
          c.RazonSocial,
          c.Domicilio,
          c.Municipio,
          c.ObservacionesWeb AS Observaciones,
          c.obra,
          c.FechaPedido,
          c.FechaEntrega,
          c.FormaEntrega,
          c.Estado,
          c.StatusAprobado,
          -- Determinar Status basado en Estado y StatusAprobado
          CASE 
            WHEN c.Estado = 0 AND c.StatusAprobado = 0 THEN 'Revision'
            WHEN c.Estado = 0 AND c.StatusAprobado = -1 THEN 'Preparando'
            WHEN c.Estado = 2 AND c.StatusAprobado = -1 THEN 'Servido'
            WHEN c.Estado = 4 THEN 'Parcial'  -- Nuevo estado para pedidos parciales
            ELSE 'Desconocido'
          END AS Status,
          c.EsVoluminoso,
          c.EmpleadoAsignado,
          l.CodigoArticulo,
          l.DescripcionArticulo,
          l.Descripcion2Articulo,
          l.UnidadesPedidas, 
          l.UnidadesPendientes,
          (l.UnidadesPedidas - l.UnidadesPendientes) AS UnidadesExpedidas,
          l.CodigoAlmacen,
          a.CodigoAlternativo,
          l.LineasPosicion AS MovPosicionLinea,
          l.UnidadMedida1_ AS UnidadBase,
          l.UnidadMedida2_ AS UnidadAlternativa,
          l.FactorConversion_ AS FactorConversion,
          -- Asegurar unidadPedido con valor por defecto
          COALESCE(NULLIF(l.UnidadMedida1_, ''), a.UnidadMedida2_, 'ud') AS UnidadPedido,
          emp.Nombre AS Vendedor,
          c.Contacto,
          c.Telefono AS TelefonoContacto,
          l.Precio
        FROM CabeceraPedidoCliente c
        INNER JOIN LineasPedidoCliente l ON 
          c.CodigoEmpresa = l.CodigoEmpresa 
          AND c.EjercicioPedido = l.EjercicioPedido 
          AND c.SeriePedido = l.SeriePedido 
          AND c.NumeroPedido = l.NumeroPedido
        LEFT JOIN Articulos a ON 
          a.CodigoArticulo = l.CodigoArticulo 
          AND a.CodigoEmpresa = l.CodigoEmpresa
        LEFT JOIN Clientes emp ON 
          emp.CodigoCliente = c.EmpleadoAsignado 
          AND emp.CodigoEmpresa = c.CodigoEmpresa
        WHERE c.Estado IN (0, 4)  -- Incluir estados 0 (pendiente) y 4 (parcial)
          AND c.CodigoEmpresa = @codigoEmpresa
          AND l.UnidadesPendientes > 0
          AND c.SeriePedido NOT IN ('X', 'R')
          ${estadosPedido.length > 0 ? 
            `AND c.Status IN (${estadosPedido.map(e => `'${e}'`).join(',')})` : ''}
          AND c.FechaEntrega BETWEEN '${formatDate(fechaInicio)}' AND '${formatDate(fechaFin)}'
          ${formaEntrega ? `AND c.FormaEntrega = ${formaEntrega}` : ''}
          ${empleado ? `AND c.EmpleadoAsignado = '${empleado}'` : ''}
          ${usuarioCondition}
          ${empleadoAsignado ? `AND c.EmpleadoAsignado = '${empleadoAsignado}'` : ''}
        ORDER BY c.FechaEntrega ASC
      `);

    // 8. Recopilar IDs para detalles
    const lineasIds = [];
    result.recordset.forEach(row => {
      if (row.MovPosicionLinea) {
        lineasIds.push(row.MovPosicionLinea);
      }
    });

    // 9. Consulta para detalles de tallas/colores
    let detallesPorLinea = {};
    if (lineasIds.length > 0) {
      const placeholders = lineasIds.map((_, i) => `@id${i}`).join(',');
      
      const detallesQuery = `
        SELECT 
          lt.MovPosicionLinea_ AS MovPosicionLinea,
          lt.CodigoColor_,
          c.Color_ AS NombreColor,
          lt.GrupoTalla_,
          gt.DescripcionGrupoTalla_ AS NombreGrupoTalla,
          gt.DescripcionTalla01_ AS DescTalla01,
          gt.DescripcionTalla02_ AS DescTalla02,
          gt.DescripcionTalla03_ AS DescTalla03,
          gt.DescripcionTalla04_ AS DescTalla04,
          lt.UnidadesTotalTallas_ AS Unidades,
          lt.UnidadesTalla01_,
          lt.UnidadesTalla02_,
          lt.UnidadesTalla03_,
          lt.UnidadesTalla04_
        FROM LineasPedidoClienteTallas lt
        LEFT JOIN Colores_ c ON 
          lt.CodigoColor_ = c.CodigoColor_ 
          AND lt.CodigoEmpresa = c.CodigoEmpresa
        LEFT JOIN GrupoTallas_ gt ON 
          lt.GrupoTalla_ = gt.GrupoTalla_ 
          AND lt.CodigoEmpresa = gt.CodigoEmpresa
        WHERE lt.CodigoEmpresa = @codigoEmpresa
          AND lt.MovPosicionLinea_ IN (${placeholders})
      `;

      const detallesRequest = poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa);
      
      lineasIds.forEach((id, index) => {
        detallesRequest.input(`id${index}`, sql.VarChar, id);
      });

      const detallesResult = await detallesRequest.query(detallesQuery);
      
      // Organizar por MovPosicionLinea
      detallesResult.recordset.forEach(detalle => {
        const key = detalle.MovPosicionLinea;
        if (!detallesPorLinea[key]) {
          detallesPorLinea[key] = [];
        }
        
        // Crear objeto con descripciones de tallas
        const tallasConDescripciones = {
          '01': {
            descripcion: detalle.DescTalla01,
            unidades: detalle.UnidadesTalla01_
          },
          '02': {
            descripcion: detalle.DescTalla02,
            unidades: detalle.UnidadesTalla02_
          },
          '03': {
            descripcion: detalle.DescTalla03,
            unidades: detalle.UnidadesTalla03_
          },
          '04': {
            descripcion: detalle.DescTalla04,
            unidades: detalle.UnidadesTalla04_
          }
        };
        
        detallesPorLinea[key].push({
          color: {
            codigo: detalle.CodigoColor_,
            nombre: detalle.NombreColor
          },
          grupoTalla: {
            codigo: detalle.GrupoTalla_,
            nombre: detalle.NombreGrupoTalla
          },
          unidades: detalle.Unidades,
          tallas: tallasConDescripciones
        });
      });
    }

    // 10. Combinar resultados
    const pedidosAgrupados = {};
    result.recordset.forEach(row => {
      const key = `${row.CodigoEmpresa}-${row.EjercicioPedido}-${row.SeriePedido}-${row.NumeroPedido}`;
      
      if (!pedidosAgrupados[key]) {
        pedidosAgrupados[key] = {
          codigoEmpresa: row.CodigoEmpresa,
          ejercicioPedido: row.EjercicioPedido,
          seriePedido: row.SeriePedido,
          numeroPedido: row.NumeroPedido,
          razonSocial: row.RazonSocial,
          domicilio: row.Domicilio,
          municipio: row.Municipio,
          observaciones: row.Observaciones,
          obra: row.obra,
          fechaPedido: row.FechaPedido,
          fechaEntrega: row.FechaEntrega,
          formaEntrega: formasEntregaMap[row.FormaEntrega] || 'No especificada',
          Estado: row.Estado,
          StatusAprobado: row.StatusAprobado,
          Status: row.Status,
          EsVoluminoso: row.EsVoluminoso,
          EmpleadoAsignado: row.EmpleadoAsignado,
          Vendedor: row.Vendedor,
          Contacto: row.Contacto,
          TelefonoContacto: row.TelefonoContacto,
          articulos: []
        };
      }
      
      // Añadir detalles si existen
      const detalles = detallesPorLinea[row.MovPosicionLinea] || [];
      pedidosAgrupados[key].articulos.push({
        codigoArticulo: row.CodigoArticulo,
        descripcionArticulo: row.DescripcionArticulo,
        descripcion2Articulo: row.Descripcion2Articulo,
        unidadesPedidas: row.UnidadesPedidas,
        unidadesPendientes: row.UnidadesPendientes,
        UnidadesExpedidas: row.UnidadesExpedidas,
        codigoAlmacen: row.CodigoAlmacen,
        codigoAlternativo: row.CodigoAlternativo,
        detalles: detalles.length > 0 ? detalles : null,
        movPosicionLinea: row.MovPosicionLinea,
        unidadBase: row.UnidadBase,
        unidadAlternativa: row.UnidadAlternativa,
        factorConversion: row.FactorConversion,
        unidadPedido: row.UnidadPedido
      });
    });
    
    const pedidosArray = Object.values(pedidosAgrupados);
    res.json(pedidosArray);
  } catch (err) {
    console.error('[ERROR PEDIDOS PENDIENTES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener pedidos pendientes',
      error: err.message,
      stack: err.stack
    });
  }
});

// ✅ 5.2 Asignar Preparador (VERSIÓN COMPLETA PARA REASIGNACIONES)
app.post('/asignarEmpleado', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autenticado' });
  }

  const { asignaciones } = req.body;

  if (!Array.isArray(asignaciones) || asignaciones.length === 0) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Datos inválidos para asignación' 
    });
  }

  const transaction = new sql.Transaction(poolGlobal);
  
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    
    for (const asignacion of asignaciones) {
      await request
        .input('codigoEmpresa', sql.SmallInt, asignacion.codigoEmpresa)
        .input('ejercicio', sql.SmallInt, asignacion.ejercicioPedido)
        .input('serie', sql.VarChar, asignacion.seriePedido || '')
        .input('numeroPedido', sql.Int, asignacion.numeroPedido)
        .input('empleado', sql.VarChar, asignacion.empleado)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET EmpleadoAsignado = @empleado
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
    }
    
    await transaction.commit();
    res.json({ success: true, mensaje: 'Asignaciones actualizadas correctamente' });
  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR ASIGNAR EMPLEADO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al asignar empleado', 
      error: err.message 
    });
  }
});

// ✅ 5.3 ACTUALIZAR LÍNEA DE PEDIDO (VERSIÓN COMPLETA CON GENERACIÓN AUTOMÁTICA DE ALBARÁN)
app.post('/actualizarLineaPedido', async (req, res) => {
  const datosLinea = req.body;

  // Campos obligatorios
  const camposRequeridos = [
    'codigoEmpresa', 'ejercicio', 'numeroPedido', 
    'codigoArticulo', 'cantidadExpedida', 'ubicacion', 'almacen'
  ];
  
  for (const campo of camposRequeridos) {
    if (!datosLinea[campo]) {
      return res.status(400).json({ 
        success: false, 
        mensaje: `Campo requerido: ${campo}` 
      });
    }
  }

  // Función helper para truncar strings según longitud máxima
  const truncarString = (valor, longitudMaxima) => {
    if (!valor) return '';
    return valor.toString().substring(0, longitudMaxima);
  };

  // Valores por defecto para campos que no pueden ser NULL
  const codigoColor = datosLinea.codigoColor || '';
  const codigoTalla = datosLinea.codigoTalla || '';
  const partida = datosLinea.partida || '';

  // Verificar si es Zona descarga (stock infinito)
  const esZonaDescarga = datosLinea.esZonaDescarga || datosLinea.ubicacion === "Zona descarga";

  const transaction = new sql.Transaction(poolGlobal);
  
  try {
    await transaction.begin();
    
    // 1. Obtener detalles de la línea del pedido
    const requestLinea = new sql.Request(transaction);
    const resultLinea = await requestLinea
      .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
      .input('ejercicio', sql.SmallInt, datosLinea.ejercicio)
      .input('numeroPedido', sql.Int, datosLinea.numeroPedido)
      .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
      .input('serie', sql.VarChar(10), truncarString(datosLinea.serie, 10))
      .query(`
        SELECT 
          l.CodigoAlmacen, 
          l.UnidadMedida1_ AS UnidadMedida, 
          l.Precio, 
          l.UnidadesPendientes,
          a.UnidadMedida2_ AS UnidadBase,
          a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          a.FactorConversion_ AS FactorConversion
        FROM LineasPedidoCliente l
        INNER JOIN Articulos a ON a.CodigoArticulo = l.CodigoArticulo AND a.CodigoEmpresa = l.CodigoEmpresa
        WHERE 
          l.CodigoEmpresa = @codigoEmpresa
          AND l.EjercicioPedido = @ejercicio
          AND l.NumeroPedido = @numeroPedido
          AND l.CodigoArticulo = @codigoArticulo
          AND (l.SeriePedido = @serie OR (@serie = '' AND l.SeriePedido IS NULL))
      `);

    if (resultLinea.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, mensaje: 'Línea de pedido no encontrada' });
    }

    const lineaData = resultLinea.recordset[0];
    const codigoAlmacen = lineaData.CodigoAlmacen;
    const unidadMedida = lineaData.UnidadMedida;
    const precio = lineaData.Precio;
    const unidadesPendientes = parseFloat(lineaData.UnidadesPendientes);
    const factorConversion = parseFloat(lineaData.FactorConversion) || 1;
    const unidadBase = lineaData.UnidadBase;
    const unidadAlternativa = lineaData.UnidadAlternativa;

    // Determinar si necesitamos convertir unidades
    const necesitaConversion = unidadMedida !== unidadBase;
    const cantidadExpedidaStock = necesitaConversion ? 
      datosLinea.cantidadExpedida / factorConversion : 
      datosLinea.cantidadExpedida;

    // Verificar que la cantidad expedida no supere lo pendiente
    if (datosLinea.cantidadExpedida > unidadesPendientes) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        mensaje: `La cantidad a expedir (${datosLinea.cantidadExpedida}) supera las unidades pendientes (${unidadesPendientes}).` 
      });
    }

    // 2. Verificar stock disponible solo si NO es Zona descarga
    if (!esZonaDescarga) {
      const requestStock = new sql.Request(transaction);
      const stockResult = await requestStock
        .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
        .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
        .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
        .input('ubicacion', sql.VarChar(20), truncarString(datosLinea.ubicacion, 20))
        .input('partida', sql.VarChar(20), truncarString(partida, 20))
        .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
        .input('codigoColor', sql.VarChar(10), truncarString(codigoColor, 10))
        .input('codigoTalla', sql.VarChar(10), truncarString(codigoTalla, 10))
        .query(`
          SELECT UnidadSaldo
          FROM AcumuladoStockUbicacion
          WHERE 
            CodigoEmpresa = @codigoEmpresa
            AND CodigoAlmacen = @almacen
            AND CodigoArticulo = @codigoArticulo
            AND Ubicacion = @ubicacion
            AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
            AND (TipoUnidadMedida_ = @unidadMedida OR (@unidadMedida = 'unidades' AND (TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '')))
            AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
            AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
            AND Periodo = 99
        `);

      let stockDisponible = 0;
      if (stockResult.recordset.length > 0) {
        stockDisponible = parseFloat(stockResult.recordset[0].UnidadSaldo);
      }

      // Verificar que la cantidad expedida no supere el stock disponible
      if (cantidadExpedidaStock > stockDisponible) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false, 
          mensaje: `No hay suficiente stock en ${datosLinea.ubicacion}. Solo hay ${stockDisponible} unidades disponibles.` 
        });
      }
    }

    // 3. Actualizar línea de pedido (reducir unidades pendientes)
    const requestUpdate = new sql.Request(transaction);
    await requestUpdate
      .input('cantidadExpedida', sql.Decimal(18, 4), datosLinea.cantidadExpedida)
      .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
      .input('ejercicio', sql.SmallInt, datosLinea.ejercicio)
      .input('numeroPedido', sql.Int, datosLinea.numeroPedido)
      .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
      .input('serie', sql.VarChar(10), truncarString(datosLinea.serie, 10))
      .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
      .query(`
        UPDATE LineasPedidoCliente
        SET UnidadesPendientes = UnidadesPendientes - @cantidadExpedida
        WHERE 
          CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numeroPedido
          AND CodigoArticulo = @codigoArticulo
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND UnidadMedida1_ = @unidadMedida
      `);

    // 4. Registrar movimiento de stock
    const fechaActual = new Date();
    const periodo = fechaActual.getMonth() + 1;
    const importe = precio * datosLinea.cantidadExpedida;

    // Para Zona descarga, no actualizamos el stock físico
    if (!esZonaDescarga) {
      const requestMovimiento = new sql.Request(transaction);
      await requestMovimiento
        .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
        .input('ejercicio', sql.SmallInt, fechaActual.getFullYear())
        .input('periodo', sql.Int, periodo)
        .input('fecha', sql.DateTime, fechaActual)
        .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
        .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
        .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
        .input('precio', sql.Decimal(18, 4), precio)
        .input('importe', sql.Decimal(18, 4), importe)
        .input('ubicacion', sql.VarChar(20), truncarString(datosLinea.ubicacion, 20))
        .input('partida', sql.VarChar(20), truncarString(partida, 20))
        .input('cantidadExpedidaStock', sql.Decimal(18, 4), cantidadExpedidaStock)
        .input('codigoColor', sql.VarChar(10), truncarString(codigoColor, 10))
        .input('codigoTalla', sql.VarChar(10), truncarString(codigoTalla, 10))
        .query(`
          INSERT INTO MovimientoStock (
            CodigoEmpresa,
            Ejercicio,
            Periodo,
            Fecha,
            TipoMovimiento,
            CodigoArticulo,
            CodigoAlmacen,
            UnidadMedida1_,
            PrecioMedio,
            Importe,
            Ubicacion,
            Partida,
            Unidades,
            CodigoColor_,
            CodigoTalla01_
          ) VALUES (
            @codigoEmpresa,
            @ejercicio,
            @periodo,
            @fecha,
            2,  -- 2 = Salida
            @codigoArticulo,
            @almacen,
            @unidadMedida,
            @precio,
            @importe,
            @ubicacion,
            @partida,
            @cantidadExpedidaStock,
            @codigoColor,
            @codigoTalla
          )
        `);
    } else {
      // Para Zona descarga, registramos un movimiento especial sin afectar stock
      const requestMovimiento = new sql.Request(transaction);
      await requestMovimiento
        .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
        .input('ejercicio', sql.SmallInt, fechaActual.getFullYear())
        .input('periodo', sql.Int, periodo)
        .input('fecha', sql.DateTime, fechaActual)
        .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
        .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
        .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
        .input('precio', sql.Decimal(18, 4), precio)
        .input('importe', sql.Decimal(18, 4), importe)
        .input('ubicacion', sql.VarChar(20), truncarString(datosLinea.ubicacion, 20))
        .input('partida', sql.VarChar(20), truncarString(partida, 20))
        .input('cantidadExpedidaStock', sql.Decimal(18, 4), cantidadExpedidaStock)
        .input('codigoColor', sql.VarChar(10), truncarString(codigoColor, 10))
        .input('codigoTalla', sql.VarChar(10), truncarString(codigoTalla, 10))
        .query(`
          INSERT INTO MovimientoStock (
            CodigoEmpresa,
            Ejercicio,
            Periodo,
            Fecha,
            TipoMovimiento,
            CodigoArticulo,
            CodigoAlmacen,
            UnidadMedida1_,
            PrecioMedio,
            Importe,
            Ubicacion,
            Partida,
            Unidades,
            CodigoColor_,
            CodigoTalla01_,
            Comentario
          ) VALUES (
            @codigoEmpresa,
            @ejercicio,
            @periodo,
            @fecha,
            9,  -- 9 = Expedición desde Zona Descarga (tipo especial)
            @codigoArticulo,
            @almacen,
            @unidadMedida,
            @precio,
            @importe,
            @ubicacion,
            @partida,
            @cantidadExpedidaStock,
            @codigoColor,
            @codigoTalla,
            'Zona Descarga'  -- Comentario más corto
          )
        `);
    }

    // 5. VERIFICAR SI EL PEDIDO SE HA COMPLETADO Y GENERAR ALBARÁN AUTOMÁTICAMENTE
    const pendientesRequest = new sql.Request(transaction);
    const pendientesResult = await pendientesRequest
      .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
      .input('ejercicio', sql.SmallInt, datosLinea.ejercicio)
      .input('serie', sql.VarChar, datosLinea.serie || '')
      .input('numeroPedido', sql.Int, datosLinea.numeroPedido)
      .query(`
        SELECT SUM(UnidadesPendientes) as TotalPendientes
        FROM LineasPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    const totalPendientes = pendientesResult.recordset[0].TotalPendientes || 0;

    // Solo generar albarán automático si no es un pedido parcial
    if (totalPendientes === 0) {
      // 5.1 Obtener datos del pedido (ACTUALIZADO PARA INCLUIR FormaEntrega)
      const pedidoRequest = new sql.Request(transaction);
      const pedidoResult = await pedidoRequest
        .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
        .input('ejercicio', sql.SmallInt, datosLinea.ejercicio)
        .input('serie', sql.VarChar, datosLinea.serie || '')
        .input('numeroPedido', sql.Int, datosLinea.numeroPedido)
        .query(`
          SELECT 
            CodigoCliente, RazonSocial, Domicilio, Municipio,
            obra, Contacto, Telefono, SeriePedido, ImporteLiquido, NumeroLineas,
            FormaEntrega
          FROM CabeceraPedidoCliente
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);

      if (pedidoResult.recordset.length > 0) {
        const pedido = pedidoResult.recordset[0];
        const añoActual = new Date().getFullYear();

        // 5.2 Generar número de albarán
        const nextAlbaranRequest = new sql.Request(transaction);
        const nextAlbaran = await nextAlbaranRequest
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('ejercicio', sql.SmallInt, añoActual)
          .input('serie', sql.VarChar, pedido.SeriePedido || '')
          .query(`
            SELECT ISNULL(MAX(NumeroAlbaran), 0) + 1 AS SiguienteNumero
            FROM CabeceraAlbaranCliente
            WHERE CodigoEmpresa = @codigoEmpresa
              AND EjercicioAlbaran = @ejercicio
              AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          `);

        const numeroAlbaran = nextAlbaran.recordset[0].SiguienteNumero;
        const fechaActual = new Date();

        // 5.3 Crear cabecera del albarán - Incluir FormaEntrega
        const cabeceraRequest = new sql.Request(transaction);
        await cabeceraRequest
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('ejercicioAlbaran', sql.SmallInt, añoActual)
          .input('serieAlbaran', sql.VarChar, pedido.SeriePedido || '')
          .input('numeroAlbaran', sql.Int, numeroAlbaran)
          .input('codigoCliente', sql.VarChar, pedido.CodigoCliente)
          .input('razonSocial', sql.VarChar, pedido.RazonSocial)
          .input('domicilio', sql.VarChar, pedido.Domicilio)
          .input('municipio', sql.VarChar, pedido.Municipio)
          .input('fecha', sql.DateTime, fechaActual)
          .input('numeroLineas', sql.Int, pedido.NumeroLineas || 0)
          .input('importeLiquido', sql.Decimal(18,4), pedido.ImporteLiquido || 0)
          .input('obra', sql.VarChar, pedido.obra || '')
          .input('contacto', sql.VarChar, pedido.Contacto || '')
          .input('telefonoContacto', sql.VarChar, pedido.Telefono || '')
          .input('status', sql.SmallInt, 0)
          .input('ejercicioPedido', sql.SmallInt, datosLinea.ejercicio)
          .input('seriePedido', sql.VarChar, datosLinea.serie || '')
          .input('numeroPedido', sql.Int, datosLinea.numeroPedido)
          .input('statusFacturado', sql.SmallInt, 0)
          .input('formaEntrega', sql.Int, pedido.FormaEntrega)
          .query(`
            INSERT INTO CabeceraAlbaranCliente (
              CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
              CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
              NumeroLineas, ImporteLiquido, obra, Contacto, Telefono,
              Status, EjercicioPedido, SeriePedido, NumeroPedido, StatusFacturado,
              FormaEntrega
            ) VALUES (
              @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
              @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
              @numeroLineas, @importeLiquido, @obra, @contacto, @telefonoContacto,
              @status, @ejercicioPedido, @seriePedido, @numeroPedido, @statusFacturado,
              @formaEntrega
            )
          `);

        // 5.4 Insertar líneas del albarán
        const lineasRequest = new sql.Request(transaction);
        const lineasResult = await lineasRequest
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('ejercicio', sql.SmallInt, datosLinea.ejercicio)
          .input('serie', sql.VarChar, datosLinea.serie || '')
          .input('numeroPedido', sql.Int, datosLinea.numeroPedido)
          .query(`
            SELECT 
              CodigoArticulo, DescripcionArticulo, UnidadesPedidas, Precio, 
              CodigoAlmacen, Partida, Orden
            FROM LineasPedidoCliente
            WHERE CodigoEmpresa = @codigoEmpresa
              AND EjercicioPedido = @ejercicio
              AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
              AND NumeroPedido = @numeroPedido
          `);

        for (const linea of lineasResult.recordset) {
          const insertLineaRequest = new sql.Request(transaction);
          await insertLineaRequest
            .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
            .input('ejercicio', sql.SmallInt, añoActual)
            .input('serie', sql.VarChar, pedido.SeriePedido || '')
            .input('numeroAlbaran', sql.Int, numeroAlbaran)
            .input('orden', sql.SmallInt, linea.Orden)
            .input('codigoArticulo', sql.VarChar, linea.CodigoArticulo)
            .input('descripcionArticulo', sql.VarChar, linea.DescripcionArticulo)
            .input('unidades', sql.Decimal(18,4), linea.UnidadesPedidas)
            .input('precio', sql.Decimal(18,4), linea.Precio)
            .input('codigoAlmacen', sql.VarChar, linea.CodigoAlmacen || '')
            .input('partida', sql.VarChar, linea.Partida || '')
            .query(`
              INSERT INTO LineasAlbaranCliente (
                CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
                Orden, CodigoArticulo, DescripcionArticulo, Unidades, Precio,
                CodigoAlmacen, Partida
              ) VALUES (
                @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
                @orden, @codigoArticulo, @descripcionArticulo, @unidades, @precio,
                @codigoAlmacen, @partida
              )
            `);
        }

        // 5.5 Actualizar estado del pedido a servido
        const updatePedidoRequest = new sql.Request(transaction);
        await updatePedidoRequest
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('ejercicio', sql.SmallInt, datosLinea.ejercicio)
          .input('serie', sql.VarChar, datosLinea.serie || '')
          .input('numeroPedido', sql.Int, datosLinea.numeroPedido)
          .query(`
            UPDATE CabeceraPedidoCliente
            SET Estado = 2
            WHERE CodigoEmpresa = @codigoEmpresa
              AND EjercicioPedido = @ejercicio
              AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
              AND NumeroPedido = @numeroPedido
          `);
      }
    }

    await transaction.commit();

    // 6. Consultar el stock actual después del commit (solo si no es Zona descarga)
    let stockRestante = 0;
    if (!esZonaDescarga) {
      const requestStockActual = new sql.Request(poolGlobal);
      const stockActualResult = await requestStockActual
        .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
        .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
        .input('ubicacion', sql.VarChar(20), truncarString(datosLinea.ubicacion, 20))
        .input('partida', sql.VarChar(20), truncarString(partida, 20))
        .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
        .input('codigoColor', sql.VarChar(10), truncarString(codigoColor, 10))
        .input('codigoTalla', sql.VarChar(10), truncarString(codigoTalla, 10))
        .query(`
          SELECT UnidadSaldo
          FROM AcumuladoStockUbicacion
          WHERE 
            CodigoEmpresa = @codigoEmpresa
            AND CodigoAlmacen = @codigoAlmacen
            AND CodigoArticulo = @codigoArticulo
            AND Ubicacion = @ubicacion
            AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
            AND (TipoUnidadMedida_ = @unidadMedida OR (@unidadMedida = 'unidades' AND (TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '')))
            AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
            AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
            AND Periodo = 99
        `);

      stockRestante = stockActualResult.recordset[0]?.UnidadSaldo || 0;
    }

    res.json({ 
      success: true, 
      mensaje: totalPendientes === 0 
        ? 'Pedido completado y albarán generado automáticamente' 
        : 'Línea actualizada correctamente',
      detalles: {
        cantidadExpedidaVenta: datosLinea.cantidadExpedida,
        cantidadExpedidaStock: cantidadExpedidaStock,
        unidadesPendientesRestantes: unidadesPendientes - datosLinea.cantidadExpedida,
        stockRestante: esZonaDescarga ? 'N/A (Zona Descarga)' : stockRestante,
        pedidoCompletado: totalPendientes === 0
      }
    });
  } catch (err) {
    if (transaction._aborted === false) {
      await transaction.rollback();
    }
    console.error('[ERROR ACTUALIZAR LINEA PEDIDO]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al actualizar línea de pedido',
      error: err.message,
      stack: err.stack
    });
  }
});

// ✅ 5.5 GENERAR ALBARÁN PARCIAL (ACTUALIZADO PARA INCLUIR FORMAENTREGA)
app.post('/generarAlbaranParcial', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroPedido, lineasExpedidas } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroPedido || !lineasExpedidas || !Array.isArray(lineasExpedidas)) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos: empresa, ejercicio, pedido y líneas expedidas.' 
    });
  }

  // Validar que haya al menos una línea con cantidad > 0
  const lineasValidas = lineasExpedidas.filter(linea => linea.cantidad > 0);
  if (lineasValidas.length === 0) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'No hay líneas con cantidades válidas para generar albarán.' 
    });
  }

  const transaction = new sql.Transaction(poolGlobal);
  
  try {
    await transaction.begin();
    
    // 1. Verificar permisos
    const permisoRequest = new sql.Request(transaction);
    const permisoResult = await permisoRequest
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusTodosLosPedidos, StatusAdministrador, StatusUsuarioAvanzado, StatusUsuarioConsulta
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
      `);
    
    if (permisoResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(403).json({ 
        success: false, 
        mensaje: 'Usuario no encontrado' 
      });
    }

    const userPerms = permisoResult.recordset[0];
    const tienePermisoPreparador = userPerms.StatusTodosLosPedidos === -1;
    const esAdmin = userPerms.StatusAdministrador === -1;
    const esUsuarioAvanzado = userPerms.StatusUsuarioAvanzado === -1;
    const esSoloLectura = userPerms.StatusUsuarioConsulta === -1;
    
    if (esSoloLectura || !(esAdmin || esUsuarioAvanzado || tienePermisoPreparador)) {
      await transaction.rollback();
      return res.status(403).json({ 
        success: false, 
        mensaje: 'No tienes permiso para generar albaranes parciales.' 
      });
    }

    // 2. Obtener datos del pedido (ACTUALIZADO PARA INCLUIR FormaEntrega)
    const pedidoRequest = new sql.Request(transaction);
    const pedidoResult = await pedidoRequest
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT 
          CodigoCliente, RazonSocial, Domicilio, Municipio,
          obra, Contacto, Telefono, SeriePedido, Estado, StatusAprobado,
          FormaEntrega
        FROM CabeceraPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    if (pedidoResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Pedido no encontrado' 
      });
    }

    const pedido = pedidoResult.recordset[0];
    const añoActual = new Date().getFullYear();

    // 3. Obtener el número de incidencia para este pedido
    const incidenciaRequest = new sql.Request(transaction);
    const incidenciaResult = await incidenciaRequest
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT ISNULL(MAX(Incidencia), 0) + 1 AS SiguienteIncidencia
        FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    const incidencia = incidenciaResult.recordset[0].SiguienteIncidencia;

    // 4. Generar número de albarán
    const nextAlbaranRequest = new sql.Request(transaction);
    const nextAlbaran = await nextAlbaranRequest
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, añoActual)
      .input('serie', sql.VarChar, pedido.SeriePedido || '')
      .query(`
        SELECT ISNULL(MAX(NumeroAlbaran), 0) + 1 AS SiguienteNumero
        FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
      `);

    const numeroAlbaran = nextAlbaran.recordset[0].SiguienteNumero;
    const fechaActual = new Date();

    // 5. Calcular importe total solo de las líneas expedidas en esta operación
    let importeTotal = 0;
    let numeroLineas = lineasValidas.length;
    
    lineasValidas.forEach(linea => {
      importeTotal += (linea.cantidad * linea.precio);
    });

    // 6. Crear cabecera del albarán parcial - Incluir observaciones y FormaEntrega
    const cabeceraRequest = new sql.Request(transaction);
    await cabeceraRequest
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioAlbaran', sql.SmallInt, añoActual)
      .input('serieAlbaran', sql.VarChar, pedido.SeriePedido || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, pedido.CodigoCliente)
      .input('razonSocial', sql.VarChar, pedido.RazonSocial)
      .input('domicilio', sql.VarChar, pedido.Domicilio)
      .input('municipio', sql.VarChar, pedido.Municipio)
      .input('fecha', sql.DateTime, fechaActual)
      .input('numeroLineas', sql.Int, numeroLineas)
      .input('importeLiquido', sql.Decimal(18,4), importeTotal)
      .input('obra', sql.VarChar, pedido.obra || '')
      .input('contacto', sql.VarChar, pedido.Contacto || '')
      .input('telefonoContacto', sql.VarChar, pedido.Telefono || '')
      .input('status', sql.SmallInt, 0)  // 0 para pendiente
      .input('incidencia', sql.Int, incidencia)
      .input('ejercicioPedido', sql.SmallInt, ejercicio)
      .input('seriePedido', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('statusFacturado', sql.SmallInt, 0)
      .input('observaciones', sql.VarChar, `Pedido: ${numeroPedido} - Albarán Parcial - Incidencia: ${incidencia}`)
      .input('formaEntrega', sql.Int, pedido.FormaEntrega)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
          NumeroLineas, ImporteLiquido, obra, Contacto, Telefono,
          Status, Incidencia, EjercicioPedido, SeriePedido, NumeroPedido, StatusFacturado, ObservacionesAlbaran,
          FormaEntrega
        ) VALUES (
          @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
          @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
          @numeroLineas, @importeLiquido, @obra, @contacto, @telefonoContacto,
          @status, @incidencia, @ejercicioPedido, @seriePedido, @numeroPedido, @statusFacturado, @observaciones,
          @formaEntrega
        )
      `);

    // 7. Insertar líneas del albarán parcial (solo las expedidas en esta operación)
    for (const [index, linea] of lineasValidas.entries()) {
      const lineaRequest = new sql.Request(transaction);
      await lineaRequest
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, añoActual)
        .input('serie', sql.VarChar, pedido.SeriePedido || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, index + 1)
        .input('codigoArticulo', sql.VarChar, linea.codigoArticulo)
        .input('descripcionArticulo', sql.VarChar, linea.descripcionArticulo)
        .input('unidades', sql.Decimal(18,4), linea.cantidad)
        .input('precio', sql.Decimal(18,4), linea.precio)
        .input('codigoAlmacen', sql.VarChar, linea.codigoAlmacen || '')
        .input('partida', sql.VarChar, linea.partida || '')
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, CodigoArticulo, DescripcionArticulo, Unidades, Precio,
            CodigoAlmacen, Partida
          ) VALUES (
            @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
            @orden, @codigoArticulo, @descripcionArticulo, @unidades, @precio,
            @codigoAlmacen, @partida
          )
        `);
    }

    // 8. Verificar si quedan unidades pendientes
    const pendientesRequest = new sql.Request(transaction);
    const pendientesResult = await pendientesRequest
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT SUM(UnidadesPendientes) as TotalPendientes
        FROM LineasPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    const totalPendientes = pendientesResult.recordset[0].TotalPendientes || 0;

    // 9. Actualizar estado del pedido - Para pedidos usamos Estado
    const updateRequest = new sql.Request(transaction);
    if (totalPendientes > 0) {
      // Marcamos el pedido como parcial (Estado = 4) si aún quedan unidades pendientes
      await updateRequest
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, serie || '')
        .input('numeroPedido', sql.Int, numeroPedido)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET Estado = 4  -- 4 para pedido parcial
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
    } else {
      // Marcamos el pedido como servido si no quedan unidades pendientes
      await updateRequest
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, serie || '')
        .input('numeroPedido', sql.Int, numeroPedido)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET Estado = 2  -- 2 para servido
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
    }

    await transaction.commit();

    res.json({ 
      success: true,
      mensaje: 'Albarán parcial generado correctamente',
      albaran: {
        ejercicio: añoActual,
        serie: pedido.SeriePedido || '',
        numero: numeroAlbaran,
        incidencia: incidencia,
        importeTotal: importeTotal,
        observaciones: `Pedido: ${numeroPedido} - Albarán Parcial - Incidencia: ${incidencia}`
      },
      statusPedido: totalPendientes > 0 ? 'Parcial' : 'Servido'
    });
  } catch (err) {
    if (transaction._aborted === false) {
      await transaction.rollback();
    }
    console.error('[ERROR ALBARAN PARCIAL]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al generar albarán parcial',
      error: err.message 
    });
  }
});



// ✅ ENDPOINT PARA GENERAR ALBARÁN PARCIAL (ACTUALIZADO)
app.post('/generarAlbaranParcial', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroPedido, lineasExpedidas } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroPedido || !lineasExpedidas || !Array.isArray(lineasExpedidas)) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos: empresa, ejercicio, pedido y líneas expedidas.' 
    });
  }

  // Validar que haya al menos una línea con cantidad > 0
  const lineasValidas = lineasExpedidas.filter(linea => linea.cantidad > 0);
  if (lineasValidas.length === 0) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'No hay líneas con cantidades válidas para generar albarán.' 
    });
  }

  const transaction = new sql.Transaction(poolGlobal);
  
  try {
    await transaction.begin();
    
    // 1. Verificar permisos
    const permisoRequest = new sql.Request(transaction);
    const permisoResult = await permisoRequest
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusTodosLosPedidos, StatusAdministrador, StatusUsuarioAvanzado, StatusUsuarioConsulta
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
      `);
    
    if (permisoResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(403).json({ 
        success: false, 
        mensaje: 'Usuario no encontrado' 
      });
    }

    const userPerms = permisoResult.recordset[0];
    const tienePermisoPreparador = userPerms.StatusTodosLosPedidos === -1;
    const esAdmin = userPerms.StatusAdministrador === -1;
    const esUsuarioAvanzado = userPerms.StatusUsuarioAvanzado === -1;
    const esSoloLectura = userPerms.StatusUsuarioConsulta === -1;
    
    if (esSoloLectura || !(esAdmin || esUsuarioAvanzado || tienePermisoPreparador)) {
      await transaction.rollback();
      return res.status(403).json({ 
        success: false, 
        mensaje: 'No tienes permiso para generar albaranes parciales.' 
      });
    }

    // 2. Obtener datos del pedido
    const pedidoRequest = new sql.Request(transaction);
    const pedidoResult = await pedidoRequest
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT 
          CodigoCliente, RazonSocial, Domicilio, Municipio,
          obra, Contacto, Telefono, SeriePedido, Estado, StatusAprobado
        FROM CabeceraPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    if (pedidoResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Pedido no encontrado' 
      });
    }

    const pedido = pedidoResult.recordset[0];
    const añoActual = new Date().getFullYear();

    // 3. Obtener el número de incidencia para este pedido
    const incidenciaRequest = new sql.Request(transaction);
    const incidenciaResult = await incidenciaRequest
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT ISNULL(MAX(Incidencia), 0) + 1 AS SiguienteIncidencia
        FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    const incidencia = incidenciaResult.recordset[0].SiguienteIncidencia;

    // 4. Generar número de albarán
    const nextAlbaranRequest = new sql.Request(transaction);
    const nextAlbaran = await nextAlbaranRequest
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, añoActual)
      .input('serie', sql.VarChar, pedido.SeriePedido || '')
      .query(`
        SELECT ISNULL(MAX(NumeroAlbaran), 0) + 1 AS SiguienteNumero
        FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
      `);

    const numeroAlbaran = nextAlbaran.recordset[0].SiguienteNumero;
    const fechaActual = new Date();

    // 5. Calcular importe total solo de las líneas expedidas en esta operación
    let importeTotal = 0;
    let numeroLineas = lineasValidas.length;
    
    lineasValidas.forEach(linea => {
      importeTotal += (linea.cantidad * linea.precio);
    });

    // 6. Crear cabecera del albarán parcial - Incluir observaciones
    const cabeceraRequest = new sql.Request(transaction);
    await cabeceraRequest
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioAlbaran', sql.SmallInt, añoActual)
      .input('serieAlbaran', sql.VarChar, pedido.SeriePedido || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, pedido.CodigoCliente)
      .input('razonSocial', sql.VarChar, pedido.RazonSocial)
      .input('domicilio', sql.VarChar, pedido.Domicilio)
      .input('municipio', sql.VarChar, pedido.Municipio)
      .input('fecha', sql.DateTime, fechaActual)
      .input('numeroLineas', sql.Int, numeroLineas)
      .input('importeLiquido', sql.Decimal(18,4), importeTotal)
      .input('obra', sql.VarChar, pedido.obra || '')
      .input('contacto', sql.VarChar, pedido.Contacto || '')
      .input('telefonoContacto', sql.VarChar, pedido.Telefono || '')
      .input('status', sql.SmallInt, 0)  // 0 para pendiente
      .input('incidencia', sql.Int, incidencia)
      .input('ejercicioPedido', sql.SmallInt, ejercicio)
      .input('seriePedido', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('statusFacturado', sql.SmallInt, 0)
      .input('observaciones', sql.VarChar, `Pedido: ${numeroPedido} - Albarán Parcial - Incidencia: ${incidencia}`)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
          NumeroLineas, ImporteLiquido, obra, Contacto, Telefono,
          Status, Incidencia, EjercicioPedido, SeriePedido, NumeroPedido, StatusFacturado, ObservacionesAlbaran
        ) VALUES (
          @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
          @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
          @numeroLineas, @importeLiquido, @obra, @contacto, @telefonoContacto,
          @status, @incidencia, @ejercicioPedido, @seriePedido, @numeroPedido, @statusFacturado, @observaciones
        )
      `);

    // 7. Insertar líneas del albarán parcial (solo las expedidas en esta operación)
    for (const [index, linea] of lineasValidas.entries()) {
      const lineaRequest = new sql.Request(transaction);
      await lineaRequest
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, añoActual)
        .input('serie', sql.VarChar, pedido.SeriePedido || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, index + 1)
        .input('codigoArticulo', sql.VarChar, linea.codigoArticulo)
        .input('descripcionArticulo', sql.VarChar, linea.descripcionArticulo)
        .input('unidades', sql.Decimal(18,4), linea.cantidad)
        .input('precio', sql.Decimal(18,4), linea.precio)
        .input('codigoAlmacen', sql.VarChar, linea.codigoAlmacen || '')
        .input('partida', sql.VarChar, linea.partida || '')
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, CodigoArticulo, DescripcionArticulo, Unidades, Precio,
            CodigoAlmacen, Partida
          ) VALUES (
            @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
            @orden, @codigoArticulo, @descripcionArticulo, @unidades, @precio,
            @codigoAlmacen, @partida
          )
        `);
    }

    // 8. Verificar si quedan unidades pendientes
    const pendientesRequest = new sql.Request(transaction);
    const pendientesResult = await pendientesRequest
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT SUM(UnidadesPendientes) as TotalPendientes
        FROM LineasPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    const totalPendientes = pendientesResult.recordset[0].TotalPendientes || 0;

    // 9. Actualizar estado del pedido - Para pedidos usamos Estado
    const updateRequest = new sql.Request(transaction);
    if (totalPendientes > 0) {
      // Marcamos el pedido como parcial (Estado = 4) si aún quedan unidades pendientes
      await updateRequest
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, serie || '')
        .input('numeroPedido', sql.Int, numeroPedido)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET Estado = 4  -- 4 para pedido parcial
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
    } else {
      // Marcamos el pedido como servido si no quedan unidades pendientes
      await updateRequest
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, serie || '')
        .input('numeroPedido', sql.Int, numeroPedido)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET Estado = 2  -- 2 para servido
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
    }

    await transaction.commit();

    res.json({ 
      success: true,
      mensaje: 'Albarán parcial generado correctamente',
      albaran: {
        ejercicio: añoActual,
        serie: pedido.SeriePedido || '',
        numero: numeroAlbaran,
        incidencia: incidencia,
        importeTotal: importeTotal,
        observaciones: `Pedido: ${numeroPedido} - Albarán Parcial - Incidencia: ${incidencia}`
      },
      statusPedido: totalPendientes > 0 ? 'Parcial' : 'Servido'
    });
  } catch (err) {
    if (transaction._aborted === false) {
      await transaction.rollback();
    }
    console.error('[ERROR ALBARAN PARCIAL]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al generar albarán parcial',
      error: err.message 
    });
  }
});

