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

// ✅ 7.1 GENERAR ALBARÁN AL ASIGNAR REPARTIDOR (ACTUALIZADO CON SISTEMA DE STATUS Y VOLUMINOSO)
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
               Contacto, Telefono AS TelefonoContacto, EsVoluminoso
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
      .input('esVoluminoso', sql.Bit, pedido.EsVoluminoso || 0)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
          NumeroLineas, ImporteLiquido, EmpleadoAsignado,
          obra, Contacto, Telefono, StatusFacturado, EsVoluminoso
        ) VALUES (
          @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
          @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
          @numeroLineas, @importeLiquido, @empleadoAsignado,
          @obra, @contacto, @telefonoContacto, @statusFacturado, @esVoluminoso
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
        repartidor: codigoRepartidor,
        esVoluminoso: pedido.EsVoluminoso || false
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

// ✅ 7.2 ALBARANES PENDIENTES (ACTUALIZADO CON VOLUMINOSO)
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
        cac.EsVoluminoso,
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
        EsVoluminoso: cabecera.EsVoluminoso,
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

// ✅ 7.5 MARCAR ALBARÁN COMO COMPLETADO (SIMPLIFICADO - SIN EMAIL)
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

    // 3. Actualizar StatusFacturado a -1 (completado) - SIN ENVÍO DE EMAIL
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
      mensaje: 'Albarán marcado como entregado correctamente'
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

// ✅ 7.6 ACTUALIZAR CANTIDADES DE ALBARANES (CORREGIDO)
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
// ✅ 5. PEDIDOS SCREEN
// ============================================

// ✅ 5.1 PEDIDOS PENDIENTES (ACTUALIZADO PARA INCLUIR PESO Y VOLUMINOSO)
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
    // 1. Obtener permisos del usuario (código existente)
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

    // 3. Obtener parámetros de filtro (código existente)
    const rangoDias = req.query.rango || 'semana';
    const formaEntrega = req.query.formaEntrega;
    const empleado = req.query.empleado;
    const estadosPedido = req.query.estados ? req.query.estados.split(',') : [];
    const empleadoAsignado = req.query.empleadoAsignado;
    
    // 4. Calcular fechas según rango (código existente)
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

    // 7. Consulta principal (ACTUALIZADA para incluir peso y voluminoso)
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
            WHEN c.Estado = 4 THEN 'Parcial'
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
          l.Precio,
          -- ✅ NUEVO: Peso del artículo y cálculo de peso total por línea
          ISNULL(a.PesoBrutoUnitario_, 0) AS PesoUnitario,
          (l.UnidadesPendientes * ISNULL(a.PesoBrutoUnitario_, 0)) AS PesoTotalLinea
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
        WHERE c.Estado IN (0, 4)
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

    // 8. Recopilar IDs para detalles (código existente)
    const lineasIds = [];
    result.recordset.forEach(row => {
      if (row.MovPosicionLinea) {
        lineasIds.push(row.MovPosicionLinea);
      }
    });

    // 9. Consulta para detalles de tallas/colores (código existente)
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

    // 10. Combinar resultados (ACTUALIZADO para incluir peso total)
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
          // ✅ NUEVO: Inicializar peso total
          PesoTotal: 0,
          articulos: []
        };
      }
      
      // ✅ NUEVO: Acumular peso total del pedido
      const pesoLinea = parseFloat(row.PesoTotalLinea) || 0;
      pedidosAgrupados[key].PesoTotal += pesoLinea;

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
        unidadPedido: row.UnidadPedido,
        // ✅ NUEVO: Peso de la línea
        pesoUnitario: row.PesoUnitario,
        pesoTotalLinea: row.PesoTotalLinea
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

// ✅ NUEVO ENDPOINT: ACTUALIZAR ESTADO VOLUMINOSO
app.post('/pedidos/actualizar-voluminoso', async (req, res) => {
  const { codigoEmpresa, ejercicio, serie, numeroPedido, esVoluminoso } = req.body;

  if (!codigoEmpresa || !ejercicio || !numeroPedido) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan parámetros requeridos.' 
    });
  }

  try {
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('esVoluminoso', sql.Bit, esVoluminoso ? 1 : 0)
      .query(`
        UPDATE CabeceraPedidoCliente
        SET EsVoluminoso = @esVoluminoso
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    res.json({ 
      success: true, 
      mensaje: `Pedido ${esVoluminoso ? 'marcado como voluminoso' : 'desmarcado como voluminoso'} correctamente.` 
    });
  } catch (err) {
    console.error('[ERROR ACTUALIZAR VOLUMINOSO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al actualizar estado voluminoso.',
      error: err.message 
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

// ✅ 5.3 ACTUALIZAR LÍNEA DE PEDIDO (VERSIÓN COMPLETA CON GENERACIÓN AUTOMÁTICA DE ALBARÁN Y MARCADO PARCIAL)
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
    let ubicacionFinal = datosLinea.ubicacion;
    let partidaFinal = partida;
    
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
        stockDisponible = parseFloat(stockResult.recordset[0].UnidadSaldo) || 0;
      }

      // ✅ MEJORA: Si no hay stock en la ubicación específica, buscar en otras ubicaciones del mismo almacén
      if (stockDisponible === 0) {
        console.log(`[INFO] No hay stock en ${datosLinea.ubicacion}, buscando en otras ubicaciones...`);
        
        const stockAlternativoRequest = new sql.Request(transaction);
        const stockAlternativoResult = await stockAlternativoRequest
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
          .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
          .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
          .query(`
            SELECT TOP 1 Ubicacion, UnidadSaldo, Partida
            FROM AcumuladoStockUbicacion
            WHERE 
              CodigoEmpresa = @codigoEmpresa
              AND CodigoAlmacen = @almacen
              AND CodigoArticulo = @codigoArticulo
              AND UnidadSaldo > 0
              AND (TipoUnidadMedida_ = @unidadMedida OR (@unidadMedida = 'unidades' AND (TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '')))
              AND Periodo = 99
            ORDER BY UnidadSaldo DESC
          `);

        if (stockAlternativoResult.recordset.length > 0) {
          const ubicacionAlternativa = stockAlternativoResult.recordset[0];
          stockDisponible = parseFloat(ubicacionAlternativa.UnidadSaldo);
          
          // Actualizar la ubicación y partida con la alternativa
          ubicacionFinal = ubicacionAlternativa.Ubicacion;
          partidaFinal = ubicacionAlternativa.Partida || '';
          
          console.log(`[INFO] Usando ubicación alternativa: ${ubicacionFinal} con stock: ${stockDisponible}`);
        } else {
          // Si no hay stock en ninguna ubicación, sugerir Zona descarga
          await transaction.rollback();
          return res.status(400).json({ 
            success: false, 
            mensaje: `No hay stock disponible en ninguna ubicación del almacén ${datosLinea.almacen}. Stock disponible: 0 unidades. Considera usar "Zona descarga" si el artículo está disponible.` 
          });
        }
      }

      // Verificar que la cantidad expedida no supere el stock disponible
      if (cantidadExpedidaStock > stockDisponible) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false, 
          mensaje: `No hay suficiente stock en ${ubicacionFinal}. Solo hay ${stockDisponible} unidades disponibles.` 
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
        .input('ubicacion', sql.VarChar(20), truncarString(ubicacionFinal, 20))
        .input('partida', sql.VarChar(20), truncarString(partidaFinal, 20))
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
        .input('ubicacion', sql.VarChar(20), truncarString(ubicacionFinal, 20))
        .input('partida', sql.VarChar(20), truncarString(partidaFinal, 20))
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
            'Zona Descarga'
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

    // ✅ NUEVA LÓGICA: Verificar si hay unidades expedidas pero aún quedan pendientes
    const expedidasRequest = new sql.Request(transaction);
    const expedidasResult = await expedidasRequest
      .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
      .input('ejercicio', sql.SmallInt, datosLinea.ejercicio)
      .input('serie', sql.VarChar, datosLinea.serie || '')
      .input('numeroPedido', sql.Int, datosLinea.numeroPedido)
      .query(`
        SELECT SUM(UnidadesPedidas - UnidadesPendientes) as TotalExpedidas
        FROM LineasPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    const totalExpedidas = expedidasResult.recordset[0].TotalExpedidas || 0;

    // ✅ ACTUALIZAR ESTADO DEL PEDIDO BASADO EN LAS CONDICIONES
    const updateEstadoRequest = new sql.Request(transaction);
    
    if (totalPendientes === 0) {
      // Pedido completado - generar albarán automático
      // 5.1 Obtener datos del pedido
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
            FormaEntrega, EsVoluminoso
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

        // 5.3 Crear cabecera del albarán - Incluir FormaEntrega y EsVoluminoso
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
          .input('esVoluminoso', sql.Bit, pedido.EsVoluminoso || 0)
          .query(`
            INSERT INTO CabeceraAlbaranCliente (
              CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
              CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
              NumeroLineas, ImporteLiquido, obra, Contacto, Telefono,
              Status, EjercicioPedido, SeriePedido, NumeroPedido, StatusFacturado,
              FormaEntrega, EsVoluminoso
            ) VALUES (
              @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
              @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
              @numeroLineas, @importeLiquido, @obra, @contacto, @telefonoContacto,
              @status, @ejercicioPedido, @seriePedido, @numeroPedido, @statusFacturado,
              @formaEntrega, @esVoluminoso
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
        await updateEstadoRequest
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
    } else if (totalExpedidas > 0) {
      // ✅ NUEVO: Marcar como parcial si hay unidades expedidas pero aún quedan pendientes
      await updateEstadoRequest
        .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
        .input('ejercicio', sql.SmallInt, datosLinea.ejercicio)
        .input('serie', sql.VarChar, datosLinea.serie || '')
        .input('numeroPedido', sql.Int, datosLinea.numeroPedido)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET Estado = 4  -- Parcial
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
            AND Estado != 4  -- Solo actualizar si no es ya parcial
        `);
    }

    // Obtener el estado actualizado del pedido para devolverlo en la respuesta
    const estadoActualResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
      .input('ejercicio', sql.SmallInt, datosLinea.ejercicio)
      .input('serie', sql.VarChar, datosLinea.serie || '')
      .input('numeroPedido', sql.Int, datosLinea.numeroPedido)
      .query(`
        SELECT Estado, StatusAprobado 
        FROM CabeceraPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    const estadoActual = estadoActualResult.recordset[0];

    await transaction.commit();

    // 6. Consultar el stock actual después del commit (solo si no es Zona descarga)
    let stockRestante = 0;
    if (!esZonaDescarga) {
      const requestStockActual = new sql.Request(poolGlobal);
      const stockActualResult = await requestStockActual
        .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
        .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
        .input('ubicacion', sql.VarChar(20), truncarString(ubicacionFinal, 20))
        .input('partida', sql.VarChar(20), truncarString(partidaFinal, 20))
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
        pedidoCompletado: totalPendientes === 0,
        ubicacionUtilizada: ubicacionFinal // ✅ Informar qué ubicación se usó finalmente
      },
      // ✅ INCLUIR ESTADO ACTUALIZADO EN LA RESPUESTA
      nuevoEstado: estadoActual.Estado,
      nuevoStatus: estadoActual.Estado === 4 ? 'Parcial' : 
                  estadoActual.Estado === 2 ? 'Servido' : 
                  estadoActual.Status
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

// ✅ 5.5 GENERAR ALBARÁN PARCIAL (VERSIÓN COMPLETA Y CORREGIDA)
app.post('/generarAlbaranParcial', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroPedido, lineasExpedidas } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  console.log('[GENERAR ALBARAN PARCIAL] Datos recibidos:', {
    codigoEmpresa, 
    ejercicio, 
    serie, 
    numeroPedido,
    lineasCount: lineasExpedidas?.length,
    usuario
  });

  // Validación completa de parámetros
  if (!codigoEmpresa || !ejercicio || !numeroPedido) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos: empresa, ejercicio y número de pedido.' 
    });
  }

  if (!lineasExpedidas || !Array.isArray(lineasExpedidas)) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'El formato de líneas expedidas es incorrecto.' 
    });
  }

  // ✅ VALIDACIÓN MEJORADA: Filtrar solo líneas con cantidad > 0 y código de artículo válido
  const lineasValidas = lineasExpedidas.filter(linea => {
    if (!linea) return false;
    
    const cantidad = parseFloat(linea.cantidad) || 0;
    const tieneArticulo = linea.codigoArticulo && linea.codigoArticulo.toString().trim() !== '';
    const tieneDescripcion = linea.descripcionArticulo && linea.descripcionArticulo.toString().trim() !== '';
    
    return cantidad > 0 && tieneArticulo && tieneDescripcion;
  });
  
  console.log('[GENERAR ALBARAN PARCIAL] Líneas válidas después de filtro:', lineasValidas.length);
  console.log('[GENERAR ALBARAN PARCIAL] Detalle líneas válidas:', lineasValidas.map(l => ({
    articulo: l.codigoArticulo,
    cantidad: l.cantidad,
    precio: l.precio
  })));

  if (lineasValidas.length === 0) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'No hay líneas con cantidades válidas (> 0) y códigos de artículo para generar albarán.' 
    });
  }

  const transaction = new sql.Transaction(poolGlobal);
  
  try {
    await transaction.begin();
    console.log('[GENERAR ALBARAN PARCIAL] Transacción iniciada');
    
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
          obra, Contacto, Telefono, SeriePedido, Estado, StatusAprobado,
          FormaEntrega, EsVoluminoso
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

    console.log('[GENERAR ALBARAN PARCIAL] Pedido encontrado:', {
      cliente: pedido.RazonSocial,
      obra: pedido.obra,
      voluminoso: pedido.EsVoluminoso,
      formaEntrega: pedido.FormaEntrega
    });

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
    console.log('[GENERAR ALBARAN PARCIAL] Incidencia:', incidencia);

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

    console.log('[GENERAR ALBARAN PARCIAL] Número de albarán:', numeroAlbaran);

    // 5. Calcular importe total solo de las líneas expedidas en esta operación
    let importeTotal = 0;
    let numeroLineas = lineasValidas.length;
    
    lineasValidas.forEach(linea => {
      const cantidad = parseFloat(linea.cantidad) || 0;
      const precio = parseFloat(linea.precio) || 0;
      const importeLinea = cantidad * precio;
      importeTotal += importeLinea;
      
      console.log(`[GENERAR ALBARAN PARCIAL] Línea cálculo: ${linea.codigoArticulo} - ${cantidad} x ${precio} = ${importeLinea}`);
    });

    console.log('[GENERAR ALBARAN PARCIAL] Importe total:', importeTotal, 'Número de líneas:', numeroLineas);

    // 6. Crear cabecera del albarán parcial
    const cabeceraRequest = new sql.Request(transaction);
    
    await cabeceraRequest
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioAlbaran', sql.SmallInt, añoActual)
      .input('serieAlbaran', sql.VarChar, pedido.SeriePedido || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, pedido.CodigoCliente || '')
      .input('razonSocial', sql.VarChar, pedido.RazonSocial || '')
      .input('domicilio', sql.VarChar, pedido.Domicilio || '')
      .input('municipio', sql.VarChar, pedido.Municipio || '')
      .input('fecha', sql.DateTime, fechaActual)
      .input('numeroLineas', sql.Int, numeroLineas)
      .input('importeLiquido', sql.Decimal(18,4), importeTotal)
      .input('obra', sql.VarChar, pedido.obra || '')
      .input('contacto', sql.VarChar, pedido.Contacto || '')
      .input('telefonoContacto', sql.VarChar, pedido.Telefono || '')
      .input('status', sql.SmallInt, 0)
      .input('incidencia', sql.Int, incidencia)
      .input('ejercicioPedido', sql.SmallInt, ejercicio)
      .input('seriePedido', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('statusFacturado', sql.SmallInt, 0)
      .input('observaciones', sql.VarChar, `Pedido: ${numeroPedido} - Albarán Parcial - Incidencia: ${incidencia}`)
      .input('formaEntrega', sql.Int, pedido.FormaEntrega || 3)
      .input('esVoluminoso', sql.Bit, pedido.EsVoluminoso ? 1 : 0)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
          NumeroLineas, ImporteLiquido, obra, Contacto, Telefono,
          Status, Incidencia, EjercicioPedido, SeriePedido, NumeroPedido, 
          StatusFacturado, ObservacionesAlbaran, FormaEntrega, EsVoluminoso
        ) VALUES (
          @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
          @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
          @numeroLineas, @importeLiquido, @obra, @contacto, @telefonoContacto,
          @status, @incidencia, @ejercicioPedido, @seriePedido, @numeroPedido, 
          @statusFacturado, @observaciones, @formaEntrega, @esVoluminoso
        )
      `);

    console.log('[GENERAR ALBARAN PARCIAL] Cabecera creada correctamente');

    // 7. Insertar líneas del albarán parcial (SOLO LAS VÁLIDAS)
    for (const [index, linea] of lineasValidas.entries()) {
      const lineaRequest = new sql.Request(transaction);
      const cantidad = parseFloat(linea.cantidad) || 0;
      const precio = parseFloat(linea.precio) || 0;
      
      console.log(`[GENERAR ALBARAN PARCIAL] Insertando línea ${index + 1}:`, {
        articulo: linea.codigoArticulo,
        descripcion: linea.descripcionArticulo,
        cantidad: cantidad,
        precio: precio,
        total: cantidad * precio
      });

      await lineaRequest
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, añoActual)
        .input('serie', sql.VarChar, pedido.SeriePedido || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, index + 1)
        .input('codigoArticulo', sql.VarChar, linea.codigoArticulo || '')
        .input('descripcionArticulo', sql.VarChar, linea.descripcionArticulo || '')
        .input('unidades', sql.Decimal(18,4), cantidad)
        .input('precio', sql.Decimal(18,4), precio)
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

    console.log('[GENERAR ALBARAN PARCIAL] Líneas insertadas correctamente');

    // 8. Verificar si quedan unidades pendientes en el pedido
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

    const totalPendientes = parseFloat(pendientesResult.recordset[0].TotalPendientes) || 0;
    console.log('[GENERAR ALBARAN PARCIAL] Unidades pendientes restantes:', totalPendientes);

    // 9. Actualizar estado del pedido
    const updateRequest = new sql.Request(transaction);
    if (totalPendientes > 0) {
      // Marcamos el pedido como parcial si aún quedan unidades pendientes
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
      console.log('[GENERAR ALBARAN PARCIAL] Pedido marcado como PARCIAL');
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
      console.log('[GENERAR ALBARAN PARCIAL] Pedido marcado como SERVIDO');
    }

    await transaction.commit();
    console.log('[GENERAR ALBARAN PARCIAL] Transacción confirmada');

    res.json({ 
      success: true,
      mensaje: 'Albarán parcial generado correctamente',
      albaran: {
        ejercicio: añoActual,
        serie: pedido.SeriePedido || '',
        numero: numeroAlbaran,
        incidencia: incidencia,
        importeTotal: importeTotal,
        observaciones: `Pedido: ${numeroPedido} - Albarán Parcial - Incidencia: ${incidencia}`,
        esVoluminoso: pedido.EsVoluminoso || false
      },
      statusPedido: totalPendientes > 0 ? 'Parcial' : 'Servido',
      lineasIncluidas: lineasValidas.length
    });

  } catch (err) {
    console.error('[ERROR ALBARAN PARCIAL]', err);
    
    if (transaction._aborted === false) {
      try {
        await transaction.rollback();
        console.log('[GENERAR ALBARAN PARCIAL] Transacción revertida');
      } catch (rollbackErr) {
        console.error('[ERROR ROLLBACK]', rollbackErr);
      }
    }
    
    // Detectar errores específicos
    let mensajeError = 'Error al generar albarán parcial';
    
    if (err.message.includes('invalid column name')) {
      mensajeError = `Error en base de datos: Columna no encontrada. Verifica que la tabla tenga la columna 'EsVoluminoso'.`;
    } else if (err.message.includes('permission denied')) {
      mensajeError = 'Error de permisos en base de datos';
    } else if (err.message.includes('timeout')) {
      mensajeError = 'Timeout en la conexión a base de datos';
    } else if (err.message.includes('foreign key') || err.message.includes('constraint')) {
      mensajeError = 'Error de integridad referencial en base de datos';
    }
    
    res.status(500).json({ 
      success: false, 
      mensaje: mensajeError,
      error: err.message,
      details: err.stack
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

// ============================================
// ✅ 9. INVENTARIO SCREEN
// ============================================

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

// ✅ 9.4 OBTENER STOCK POR MÚLTIPLES ARTÍCULOS (VERSIÓN CORREGIDA)
app.post('/ubicacionesMultiples', async (req, res) => {
  const { articulos } = req.body;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!articulos || !Array.isArray(articulos)) {
    return res.status(400).json({
      success: false,
      mensaje: 'Lista de artículos requerida en formato array.'
    });
  }

  try {
    const codigosArticulos = articulos.map(art => art.codigo);
    
    if (codigosArticulos.length === 0) {
      return res.json({});
    }

    // Crear placeholders para la consulta
    const articuloPlaceholders = codigosArticulos.map((_, i) => `@articulo${i}`).join(',');
    
    const query = `
      SELECT 
        s.CodigoArticulo,
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        CAST(s.UnidadSaldo AS DECIMAL(18, 2)) AS UnidadSaldo,
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
        AND s.Periodo = 99  -- SOLO período 99 (stock actual)
        AND s.UnidadSaldo > 0  -- Solo stock positivo real
        AND s.CodigoArticulo IN (${articuloPlaceholders})
      ORDER BY s.CodigoArticulo, s.UnidadSaldo DESC
    `;

    const request = poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa);

    // Añadir parámetros para cada artículo
    codigosArticulos.forEach((codigo, index) => {
      request.input(`articulo${index}`, sql.VarChar, codigo);
    });

    const result = await request.query(query);

    console.log(`[DEBUG UBICACIONES] Consulta ejecutada para ${codigosArticulos.length} artículos`);
    console.log(`[DEBUG UBICACIONES] Resultados encontrados:`, result.recordset.length);

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
        unidadSaldo: parseFloat(row.UnidadSaldo),
        unidadMedida: row.UnidadMedida,
        partida: row.Partida,
        codigoColor: row.CodigoColor_,
        codigoTalla: row.CodigoTalla01_
      });
    });

    // Si no hay ubicaciones para algún artículo, agregar Zona descarga
    codigosArticulos.forEach(codigo => {
      if (!grouped[codigo] || grouped[codigo].length === 0) {
        console.log(`[DEBUG UBICACIONES] Artículo ${codigo} sin stock - agregando Zona descarga`);
        grouped[codigo] = [{
          codigoAlmacen: "CEN",
          nombreAlmacen: "Almacén Central",
          ubicacion: "Zona descarga",
          descripcionUbicacion: "Stock disponible para expedición directa",
          unidadSaldo: Infinity,
          unidadMedida: 'unidades',
          partida: null,
          codigoColor: '',
          codigoTalla: ''
        }];
      }
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


// ✅ 9.8 OBTENER DETALLES POR MOV_POSICION_LINEA (VERSIÓN MEJORADA)

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


// ✅ 9.9 OBTENER FAMILIAS
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


// ✅ 9.10 OBTENER SUBFAMILIAS
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

// ✅ 9.11 OBTENER ARTÍCULOS CON STOCK - VERSIÓN CON DIVISIÓN
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
              THEN s.UnidadSaldo / NULLIF(a.FactorConversion_, 0) -- CAMBIO: Dividir en lugar de multiplicar
            WHEN s.TipoUnidadMedida_ = a.UnidadMedida2_ 
              THEN s.UnidadSaldo
            ELSE s.UnidadSaldo / NULLIF(a.FactorConversion_, 0) -- CAMBIO: Dividir en lugar de multiplicar
          END
        ) AS StockTotal
      FROM Articulos a
      INNER JOIN AcumuladoStockUbicacion s 
        ON s.CodigoEmpresa = a.CodigoEmpresa 
        AND s.CodigoArticulo = a.CodigoArticulo
      WHERE a.CodigoEmpresa = @codigoEmpresa
        AND s.Periodo IN (0, 99)
        AND (
          a.CodigoArticulo LIKE @searchTerm 
          OR a.DescripcionArticulo LIKE @searchTerm
        )
      GROUP BY a.CodigoArticulo, a.DescripcionArticulo
      HAVING SUM(
          CASE 
            WHEN s.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
              THEN s.UnidadSaldo / NULLIF(a.FactorConversion_, 0) -- CAMBIO: Dividir
            WHEN s.TipoUnidadMedida_ = a.UnidadMedida2_ 
              THEN s.UnidadSaldo
            ELSE s.UnidadSaldo / NULLIF(a.FactorConversion_, 0) -- CAMBIO: Dividir
          END
        ) > 0
      ORDER BY a.DescripcionArticulo
      OFFSET ${offset} ROWS
      FETCH NEXT ${pageSize} ROWS ONLY
    `;

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
          AND s.Periodo IN (0, 99)
          AND (
            a.CodigoArticulo LIKE @searchTerm 
            OR a.DescripcionArticulo LIKE @searchTerm
          )
        GROUP BY a.CodigoArticulo
        HAVING SUM(
            CASE 
              WHEN s.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
                THEN s.UnidadSaldo / NULLIF(a.FactorConversion_, 0) -- CAMBIO: Dividir
              WHEN s.TipoUnidadMedida_ = a.UnidadMedida2_ 
                THEN s.UnidadSaldo
              ELSE s.UnidadSaldo / NULLIF(a.FactorConversion_, 0) -- CAMBIO: Dividir
            END
          ) > 0
      ) AS subquery
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

// ✅ 9.14 OBTENER STOCK TOTAL - VERSIÓN CON DIVISIÓN Y EJERCICIO ACTUAL
app.get('/inventario/stock-total-completo', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const añoActual = new Date().getFullYear(); // 2025 o el año actual

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    console.log('🔍 Solicitando stock total CORREGIDO para empresa:', codigoEmpresa, 'Ejercicio:', añoActual);
    
    const query = `
      -- 1. STOCK OFICIAL (AcumuladoStock) - CON FILTRO DE NEGATIVOS Y EJERCICIO ACTUAL
      WITH StockOficial AS (
        SELECT 
          CodigoArticulo,
          TipoUnidadMedida_ AS UnidadStock,
          CASE 
            WHEN SUM(UnidadSaldo) < 0 THEN 0
            ELSE SUM(UnidadSaldo) 
          END AS StockTotalOficial
        FROM AcumuladoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio -- FILTRO EJERCICIO ACTUAL
          AND CodigoAlmacen = 'CEN'  
          AND Periodo = 99 -- SOLO PERIODO 99
        GROUP BY CodigoArticulo, TipoUnidadMedida_
      ),
      
      -- 2. STOCK EN UBICACIONES VÁLIDAS (con división en factor conversión)
      StockUbicacionesValidas AS (
        SELECT 
          s.CodigoArticulo,
          s.TipoUnidadMedida_ AS UnidadStock,
          s.CodigoAlmacen,
          COALESCE(alm.Almacen, 'Almacén Central') AS NombreAlmacen,
          s.Ubicacion,
          COALESCE(u.DescripcionUbicacion, 'Ubicación general') AS DescripcionUbicacion,
          COALESCE(s.Partida, '') AS Partida,
          CASE 
            WHEN s.UnidadSaldo < 0 THEN 0
            ELSE CAST(s.UnidadSaldo AS DECIMAL(18, 2))
          END AS Cantidad,
          COALESCE(s.CodigoColor_, '') AS CodigoColor_,
          COALESCE(s.CodigoTalla01_, '') AS CodigoTalla01_,
          COALESCE(a.DescripcionArticulo, '') AS DescripcionArticulo,
          COALESCE(a.Descripcion2Articulo, '') AS Descripcion2Articulo,
          COALESCE(a.CodigoFamilia, '') AS CodigoFamilia,
          COALESCE(a.CodigoSubfamilia, '') AS CodigoSubfamilia,
          COALESCE(a.UnidadMedida2_, 'unidades') AS UnidadBase,
          COALESCE(a.UnidadMedidaAlternativa_, '') AS UnidadAlternativa,
          COALESCE(a.FactorConversion_, 1) AS FactorConversion,
          -- Cálculo con DIVISIÓN en lugar de multiplicación
          CASE 
            WHEN s.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
              THEN CAST(
                CASE 
                  WHEN s.UnidadSaldo < 0 THEN 0 
                  ELSE s.UnidadSaldo / NULLIF(COALESCE(a.FactorConversion_, 1), 0) -- CAMBIO: Dividir
                END AS DECIMAL(18, 2)
              )
            WHEN s.TipoUnidadMedida_ = a.UnidadMedida2_ 
              THEN CAST(
                CASE 
                  WHEN s.UnidadSaldo < 0 THEN 0 
                  ELSE s.UnidadSaldo
                END AS DECIMAL(18, 2)
              )
            ELSE CAST(
              CASE 
                WHEN s.UnidadSaldo < 0 THEN 0 
                ELSE s.UnidadSaldo / NULLIF(COALESCE(a.FactorConversion_, 1), 0) -- CAMBIO: Dividir
              END AS DECIMAL(18, 2)
            )
          END AS CantidadBase
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
          AND s.Periodo = 99 -- SOLO PERIODO 99
          AND s.Ejercicio = @ejercicio -- FILTRO EJERCICIO ACTUAL
          AND s.CodigoAlmacen = 'CEN'
          AND s.UnidadSaldo > 0
          AND s.Ubicacion NOT IN ('Zona descarga', 'PASILLO 1')
      ),
      
      -- Resto de la consulta se mantiene igual...
      StockUbicadoAgrupado AS (
        SELECT 
          CodigoArticulo,
          UnidadStock,
          SUM(Cantidad) AS StockUbicadoValido,
          SUM(CantidadBase) AS StockUbicadoBaseValido
        FROM StockUbicacionesValidas
        GROUP BY CodigoArticulo, UnidadStock
      ),
      
      StockCalculado AS (
        SELECT 
          so.CodigoArticulo,
          so.UnidadStock,
          so.StockTotalOficial,
          COALESCE(su.StockUbicadoValido, 0) AS StockUbicadoValido,
          COALESCE(su.StockUbicadoBaseValido, 0) AS StockUbicadoBaseValido,
          CASE 
            WHEN so.StockTotalOficial >= COALESCE(su.StockUbicadoValido, 0) 
            THEN so.StockTotalOficial - COALESCE(su.StockUbicadoValido, 0)
            ELSE 0
          END AS StockSinUbicacion,
          CASE 
            WHEN so.StockTotalOficial = COALESCE(su.StockUbicadoValido, 0) THEN 'CUADRADO'
            WHEN so.StockTotalOficial > COALESCE(su.StockUbicadoValido, 0) THEN 'CON_SIN_UBICACION'
            ELSE 'EXCESO_UBICACION'
          END AS Estado
        FROM StockOficial so
        LEFT JOIN StockUbicadoAgrupado su 
          ON su.CodigoArticulo = so.CodigoArticulo 
          AND su.UnidadStock = so.UnidadStock
        WHERE so.StockTotalOficial > 0 OR COALESCE(su.StockUbicadoValido, 0) > 0
      )
      
      -- 5. CONSTRUIR RESULTADO FINAL (con división en stock sin ubicación)
      SELECT 
        uv.CodigoArticulo,
        uv.DescripcionArticulo,
        uv.Descripcion2Articulo,
        uv.CodigoFamilia,
        uv.CodigoSubfamilia,
        uv.CodigoAlmacen,
        uv.NombreAlmacen,
        uv.Ubicacion,
        uv.DescripcionUbicacion,
        uv.Partida,
        uv.Cantidad,
        uv.UnidadStock,
        uv.UnidadBase,
        uv.UnidadAlternativa,
        uv.FactorConversion,
        uv.CantidadBase,
        sc.StockTotalOficial AS StockTotal,
        sc.StockUbicadoValido,
        sc.StockSinUbicacion,
        sc.Estado,
        CONCAT(
          uv.CodigoArticulo, '_', 
          uv.UnidadStock, '_',
          uv.CodigoAlmacen, '_',
          uv.Ubicacion, '_',
          uv.Partida, '_',
          uv.CodigoColor_, '_',
          uv.CodigoTalla01_
        ) AS ClaveUnica,
        uv.CodigoColor_,
        uv.CodigoTalla01_,
        NULL AS MovPosicionLinea,
        0 AS EsSinUbicacion,
        'CON_UBICACION' AS TipoStock
      FROM StockUbicacionesValidas uv
      INNER JOIN StockCalculado sc 
        ON sc.CodigoArticulo = uv.CodigoArticulo 
        AND sc.UnidadStock = uv.UnidadStock
      WHERE uv.Cantidad > 0
      
      UNION ALL
      
      -- Agregar stock sin ubicación con DIVISIÓN
      SELECT 
        sc.CodigoArticulo,
        a.DescripcionArticulo,
        a.Descripcion2Articulo,
        a.CodigoFamilia,
        a.CodigoSubfamilia,
        'CEN' AS CodigoAlmacen,
        'Almacén Central' AS NombreAlmacen,
        'SIN UBICACIÓN' AS Ubicacion,
        'Stock sin ubicación asignada' AS DescripcionUbicacion,
        '' AS Partida,
        sc.StockSinUbicacion AS Cantidad,
        sc.UnidadStock,
        a.UnidadMedida2_ AS UnidadBase,
        a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
        a.FactorConversion_ AS FactorConversion,
        CASE 
          WHEN sc.UnidadStock = a.UnidadMedidaAlternativa_ 
            THEN CAST(sc.StockSinUbicacion / NULLIF(COALESCE(a.FactorConversion_, 1), 0) AS DECIMAL(18, 2)) -- CAMBIO: Dividir
          ELSE CAST(sc.StockSinUbicacion AS DECIMAL(18, 2))
        END AS CantidadBase,
        sc.StockTotalOficial AS StockTotal,
        sc.StockUbicadoValido,
        sc.StockSinUbicacion,
        sc.Estado,
        CONCAT(sc.CodigoArticulo, '_', sc.UnidadStock, '_SIN_UBICACION') AS ClaveUnica,
        NULL AS CodigoColor_,
        NULL AS CodigoTalla01_,
        NULL AS MovPosicionLinea,
        1 AS EsSinUbicacion,
        'SIN_UBICACION' AS TipoStock
      FROM StockCalculado sc
      INNER JOIN Articulos a 
        ON a.CodigoEmpresa = @codigoEmpresa 
        AND a.CodigoArticulo = sc.CodigoArticulo
      WHERE sc.StockSinUbicacion > 0
      
      ORDER BY CodigoArticulo, UnidadStock, EsSinUbicacion, Ubicacion
    `;

    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, añoActual) // Ejercicio actual
      .query(query);
      
    console.log('✅ Stock total CORREGIDO obtenido:', result.recordset.length, 'registros');
    
    res.json(result.recordset);
  } catch (err) {
    console.error('❌ [ERROR STOCK TOTAL CORREGIDO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock total corregido',
      error: err.message,
      details: err.originalError?.info?.message || 'Sin detalles adicionales'
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


// ✅ 9.14 OBTENER STOCK TOTAL CORREGIDO - VERSIÓN CORREGIDA
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
    console.log('🔍 Solicitando stock total CORREGIDO para empresa:', codigoEmpresa);
    
    const query = `
      -- 1. STOCK OFICIAL (AcumuladoStock) - CON FILTRO DE NEGATIVOS
      WITH StockOficial AS (
        SELECT 
          CodigoArticulo,
          TipoUnidadMedida_ AS UnidadStock,
          CASE 
            WHEN SUM(UnidadSaldo) < 0 THEN 0  -- Convertir negativos a 0
            ELSE SUM(UnidadSaldo) 
          END AS StockTotalOficial
        FROM AcumuladoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND CodigoAlmacen = 'CEN'  
          AND Periodo = 99
        GROUP BY CodigoArticulo, TipoUnidadMedida_
      ),
      
      -- 2. STOCK EN UBICACIONES VÁLIDAS (excluyendo ubicaciones problemáticas y negativos)
      StockUbicacionesValidas AS (
        SELECT 
          s.CodigoArticulo,
          s.TipoUnidadMedida_ AS UnidadStock,
          s.CodigoAlmacen,
          COALESCE(alm.Almacen, 'Almacén Central') AS NombreAlmacen,
          s.Ubicacion,
          COALESCE(u.DescripcionUbicacion, 'Ubicación general') AS DescripcionUbicacion,
          COALESCE(s.Partida, '') AS Partida,
          CASE 
            WHEN s.UnidadSaldo < 0 THEN 0  -- Convertir negativos a 0
            ELSE CAST(s.UnidadSaldo AS DECIMAL(18, 2))
          END AS Cantidad,
          COALESCE(s.CodigoColor_, '') AS CodigoColor_,
          COALESCE(s.CodigoTalla01_, '') AS CodigoTalla01_,
          COALESCE(a.DescripcionArticulo, '') AS DescripcionArticulo,
          COALESCE(a.Descripcion2Articulo, '') AS Descripcion2Articulo,
          COALESCE(a.CodigoFamilia, '') AS CodigoFamilia,
          COALESCE(a.CodigoSubfamilia, '') AS CodigoSubfamilia,
          COALESCE(a.UnidadMedida2_, 'unidades') AS UnidadBase,
          COALESCE(a.UnidadMedidaAlternativa_, '') AS UnidadAlternativa,
          COALESCE(a.FactorConversion_, 1) AS FactorConversion,
          -- Cálculo seguro de CantidadBase
          CASE 
            WHEN s.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
              THEN CAST(
                CASE 
                  WHEN s.UnidadSaldo < 0 THEN 0 
                  ELSE s.UnidadSaldo * COALESCE(a.FactorConversion_, 1)
                END AS DECIMAL(18, 2)
              )
            WHEN s.TipoUnidadMedida_ = a.UnidadMedida2_ 
              THEN CAST(
                CASE 
                  WHEN s.UnidadSaldo < 0 THEN 0 
                  ELSE s.UnidadSaldo
                END AS DECIMAL(18, 2)
              )
            ELSE CAST(
              CASE 
                WHEN s.UnidadSaldo < 0 THEN 0 
                ELSE s.UnidadSaldo * COALESCE(a.FactorConversion_, 1)
              END AS DECIMAL(18, 2)
            )
          END AS CantidadBase
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
          AND s.CodigoAlmacen = 'CEN'  -- SOLO CEN
          AND s.UnidadSaldo > 0  -- Solo stock positivo
          AND s.Ubicacion NOT IN ('Zona descarga', 'PASILLO 1')  -- EXCLUIR UBICACIONES PROBLEMÁTICAS
      ),
      
      -- 3. SUMA DE UBICACIONES VÁLIDAS POR ARTÍCULO/UNIDAD
      StockUbicadoAgrupado AS (
        SELECT 
          CodigoArticulo,
          UnidadStock,
          SUM(Cantidad) AS StockUbicadoValido,
          SUM(CantidadBase) AS StockUbicadoBaseValido
        FROM StockUbicacionesValidas
        GROUP BY CodigoArticulo, UnidadStock
      ),
      
      -- 4. CALCULAR STOCK SIN UBICACIÓN (NO PERMITIR NEGATIVOS)
      StockCalculado AS (
        SELECT 
          so.CodigoArticulo,
          so.UnidadStock,
          so.StockTotalOficial,
          COALESCE(su.StockUbicadoValido, 0) AS StockUbicadoValido,
          COALESCE(su.StockUbicadoBaseValido, 0) AS StockUbicadoBaseValido,
          CASE 
            WHEN so.StockTotalOficial >= COALESCE(su.StockUbicadoValido, 0) 
            THEN so.StockTotalOficial - COALESCE(su.StockUbicadoValido, 0)
            ELSE 0  -- NO PERMITIR STOCK SIN UBICACIÓN NEGATIVO
          END AS StockSinUbicacion,
          CASE 
            WHEN so.StockTotalOficial = COALESCE(su.StockUbicadoValido, 0) THEN 'CUADRADO'
            WHEN so.StockTotalOficial > COALESCE(su.StockUbicadoValido, 0) THEN 'CON_SIN_UBICACION'
            ELSE 'EXCESO_UBICACION'
          END AS Estado
        FROM StockOficial so
        LEFT JOIN StockUbicadoAgrupado su 
          ON su.CodigoArticulo = so.CodigoArticulo 
          AND su.UnidadStock = so.UnidadStock
        WHERE so.StockTotalOficial > 0 OR COALESCE(su.StockUbicadoValido, 0) > 0
      )
      
      -- 5. CONSTRUIR RESULTADO FINAL
      SELECT 
        uv.CodigoArticulo,
        uv.DescripcionArticulo,
        uv.Descripcion2Articulo,
        uv.CodigoFamilia,
        uv.CodigoSubfamilia,
        uv.CodigoAlmacen,
        uv.NombreAlmacen,
        uv.Ubicacion,
        uv.DescripcionUbicacion,
        uv.Partida,
        uv.Cantidad,
        uv.UnidadStock,
        uv.UnidadBase,
        uv.UnidadAlternativa,
        uv.FactorConversion,
        uv.CantidadBase,
        sc.StockTotalOficial AS StockTotal,  -- CORREGIDO: usar StockTotalOficial
        sc.StockUbicadoValido,
        sc.StockSinUbicacion,
        sc.Estado,
        CONCAT(
          uv.CodigoArticulo, '_', 
          uv.UnidadStock, '_',
          uv.CodigoAlmacen, '_',
          uv.Ubicacion, '_',
          uv.Partida, '_',
          uv.CodigoColor_, '_',
          uv.CodigoTalla01_
        ) AS ClaveUnica,
        uv.CodigoColor_,
        uv.CodigoTalla01_,
        NULL AS MovPosicionLinea,
        0 AS EsSinUbicacion,
        'CON_UBICACION' AS TipoStock
      FROM StockUbicacionesValidas uv
      INNER JOIN StockCalculado sc 
        ON sc.CodigoArticulo = uv.CodigoArticulo 
        AND sc.UnidadStock = uv.UnidadStock
      WHERE uv.Cantidad > 0  -- Solo registros con cantidad positiva
      
      UNION ALL
      
      -- Agregar stock sin ubicación cuando hay diferencia positiva
      SELECT 
        sc.CodigoArticulo,
        a.DescripcionArticulo,
        a.Descripcion2Articulo,
        a.CodigoFamilia,
        a.CodigoSubfamilia,
        'CEN' AS CodigoAlmacen,
        'Almacén Central' AS NombreAlmacen,
        'SIN UBICACIÓN' AS Ubicacion,
        'Stock sin ubicación asignada' AS DescripcionUbicacion,
        '' AS Partida,
        sc.StockSinUbicacion AS Cantidad,
        sc.UnidadStock,
        a.UnidadMedida2_ AS UnidadBase,
        a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
        a.FactorConversion_ AS FactorConversion,
        CASE 
          WHEN sc.UnidadStock = a.UnidadMedidaAlternativa_ 
            THEN CAST(sc.StockSinUbicacion * COALESCE(a.FactorConversion_, 1) AS DECIMAL(18, 2))
          ELSE CAST(sc.StockSinUbicacion AS DECIMAL(18, 2))
        END AS CantidadBase,
        sc.StockTotalOficial AS StockTotal,  -- CORREGIDO: usar StockTotalOficial
        sc.StockUbicadoValido,
        sc.StockSinUbicacion,
        sc.Estado,
        CONCAT(sc.CodigoArticulo, '_', sc.UnidadStock, '_SIN_UBICACION') AS ClaveUnica,
        NULL AS CodigoColor_,
        NULL AS CodigoTalla01_,
        NULL AS MovPosicionLinea,
        1 AS EsSinUbicacion,
        'SIN_UBICACION' AS TipoStock
      FROM StockCalculado sc
      INNER JOIN Articulos a 
        ON a.CodigoEmpresa = @codigoEmpresa 
        AND a.CodigoArticulo = sc.CodigoArticulo
      WHERE sc.StockSinUbicacion > 0
      
      ORDER BY CodigoArticulo, UnidadStock, EsSinUbicacion, Ubicacion
    `;

    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, añoActual)
      .query(query);
      
    console.log('✅ Stock total CORREGIDO obtenido:', result.recordset.length, 'registros');
    
    res.json(result.recordset);
  } catch (err) {
    console.error('❌ [ERROR STOCK TOTAL CORREGIDO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock total corregido',
      error: err.message,
      details: err.originalError?.info?.message || 'Sin detalles adicionales'
    });
  }
});

// ✅ 9.15 AJUSTAR INVENTARIO (VERSIÓN SUPER-CORREGIDA)
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
        console.log('🔧 Iniciando ajuste sincronizado...');

        // 1. PRIMERO VERIFICAR QUE TODOS LOS DATOS ESTÉN COMPLETOS
        for (const ajuste of ajustes) {
            const {
                articulo, codigoAlmacen, ubicacionStr, nuevaCantidad,
                partida = '', unidadStock, codigoColor = '', codigoTalla01 = ''
            } = ajuste;

            if (!articulo || !codigoAlmacen || !unidadStock || nuevaCantidad === undefined) {
                throw new Error(`Datos incompletos en ajuste: ${JSON.stringify(ajuste)}`);
            }
        }

        // 2. APLICAR AJUSTES UNO POR UNO
        for (const [index, ajuste] of ajustes.entries()) {
            const {
                articulo, codigoAlmacen, ubicacionStr, nuevaCantidad,
                partida = '', unidadStock, codigoColor = '', codigoTalla01 = ''
            } = ajuste;

            console.log(`🔄 Procesando ajuste ${index + 1}/${ajustes.length}:`, {
                articulo, codigoAlmacen, ubicacionStr, nuevaCantidad, unidadStock
            });

            // Determinar si es stock sin ubicación
            const esSinUbicacion = ubicacionStr === 'SIN UBICACIÓN' || ubicacionStr === 'SIN-UBICACION';
            const ubicacionFinal = esSinUbicacion ? 'SIN-UBICACION' : ubicacionStr;

            // A. OBTENER STOCK ACTUAL CON MANEJO DE ERRORES
            let stockActual = 0;
            let stockTotal = 0;
            
            try {
                const requestStockActual = new sql.Request(transaction);
                const stockActualResult = await requestStockActual
                    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                    .input('ejercicio', sql.Int, ejercicio)
                    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
                    .input('codigoArticulo', sql.VarChar, articulo)
                    .input('tipoUnidadMedida', sql.VarChar, unidadStock)
                    .input('partida', sql.VarChar, partida)
                    .input('codigoColor', sql.VarChar, codigoColor)
                    .input('codigoTalla01', sql.VarChar, codigoTalla01)
                    .input('ubicacionFinal', sql.VarChar, ubicacionFinal)
                    .query(`
                        SELECT 
                            Ubicacion,
                            UnidadSaldo AS StockUbicacion,
                            (SELECT ISNULL(UnidadSaldo, 0)
                             FROM AcumuladoStock 
                             WHERE CodigoEmpresa = @codigoEmpresa
                               AND Ejercicio = @ejercicio
                               AND CodigoAlmacen = @codigoAlmacen
                               AND CodigoArticulo = @codigoArticulo
                               AND TipoUnidadMedida_ = @tipoUnidadMedida
                               AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                               AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                               AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 = ''))
                               AND Periodo = 99) AS StockTotal
                        FROM AcumuladoStockUbicacion
                        WHERE CodigoEmpresa = @codigoEmpresa
                            AND Ejercicio = @ejercicio
                            AND CodigoAlmacen = @codigoAlmacen
                            AND CodigoArticulo = @codigoArticulo
                            AND TipoUnidadMedida_ = @tipoUnidadMedida
                            AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                            AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                            AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 = ''))
                            AND Ubicacion = @ubicacionFinal
                            AND Periodo = 99
                    `);

                stockActual = stockActualResult.recordset[0]?.StockUbicacion || 0;
                stockTotal = stockActualResult.recordset[0]?.StockTotal || 0;
                
                console.log(`📊 Stock actual: ${stockActual}, Stock total: ${stockTotal}`);
            } catch (error) {
                console.warn(`⚠️ No se pudo obtener stock actual, usando 0:`, error.message);
                stockActual = 0;
                stockTotal = 0;
            }

            const diferencia = parseFloat(nuevaCantidad) - parseFloat(stockActual);

            // B. ACTUALIZAR ACUMULADOSTOCKUBICACION - VERSIÓN CORREGIDA
              if (parseFloat(nuevaCantidad) === 0) {
                  // Eliminar registro si cantidad es cero
                  console.log(`🗑️ Eliminando registro con cantidad cero`);
                  const requestEliminar = new sql.Request(transaction);
                  await requestEliminar
                      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                      .input('ejercicio', sql.Int, ejercicio)
                      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
                      .input('ubicacion', sql.VarChar, ubicacionFinal)
                      .input('codigoArticulo', sql.VarChar, articulo)
                      .input('tipoUnidadMedida', sql.VarChar, unidadStock)
                      .input('partida', sql.VarChar, partida)
                      .input('codigoColor', sql.VarChar, codigoColor)
                      .input('codigoTalla01', sql.VarChar, codigoTalla01)
                      .query(`
                          DELETE FROM AcumuladoStockUbicacion
                          WHERE CodigoEmpresa = @codigoEmpresa
                              AND Ejercicio = @ejercicio
                              AND CodigoAlmacen = @codigoAlmacen
                              AND Ubicacion = @ubicacion
                              AND CodigoArticulo = @codigoArticulo
                              AND TipoUnidadMedida_ = @tipoUnidadMedida
                              AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                              AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                              AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 = ''))
                              AND Periodo = 99
                      `);
              } else {
                  // 🔥 CORRECCIÓN CRÍTICA: UPSERT con condición COMPLETA
                  console.log(`💾 Actualizando AcumuladoStockUbicacion: ${nuevaCantidad}`);
                  const requestUpsertUbicacion = new sql.Request(transaction);
                  
                  // Primero, intentar obtener el registro exacto que queremos actualizar
                  const findExistingResult = await requestUpsertUbicacion
                      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                      .input('ejercicio', sql.Int, ejercicio)
                      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
                      .input('ubicacion', sql.VarChar, ubicacionFinal)
                      .input('codigoArticulo', sql.VarChar, articulo)
                      .input('tipoUnidadMedida', sql.VarChar, unidadStock)
                      .input('partida', sql.VarChar, partida)
                      .input('codigoColor', sql.VarChar, codigoColor)
                      .input('codigoTalla01', sql.VarChar, codigoTalla01)
                      .query(`
                          SELECT Ubicacion, UnidadSaldo, Periodo
                          FROM AcumuladoStockUbicacion
                          WHERE CodigoEmpresa = @codigoEmpresa
                              AND Ejercicio = @ejercicio
                              AND CodigoAlmacen = @codigoAlmacen
                              AND Ubicacion = @ubicacion
                              AND CodigoArticulo = @codigoArticulo
                              AND TipoUnidadMedida_ = @tipoUnidadMedida
                              AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                              AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                              AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 = ''))
                              AND Periodo = 99
                      `);
                  
                  console.log(`🔍 Registros existentes encontrados:`, findExistingResult.recordset.length);
                  
                  if (findExistingResult.recordset.length > 0) {
                      console.log(`📝 Actualizando registro existente`);
                      // UPDATE directo - más seguro que MERGE
                      await requestUpsertUbicacion
                          .input('nuevaCantidad', sql.Decimal(18,4), nuevaCantidad)
                          .query(`
                              UPDATE AcumuladoStockUbicacion
                              SET UnidadSaldo = @nuevaCantidad,
                                  UnidadSaldoTipo_ = @nuevaCantidad
                              WHERE CodigoEmpresa = @codigoEmpresa
                                  AND Ejercicio = @ejercicio
                                  AND CodigoAlmacen = @codigoAlmacen
                                  AND Ubicacion = @ubicacion
                                  AND CodigoArticulo = @codigoArticulo
                                  AND TipoUnidadMedida_ = @tipoUnidadMedida
                                  AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                                  AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                                  AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 = ''))
                                  AND Periodo = 99
                          `);
                  } else {
                      console.log(`🆕 Insertando nuevo registro`);
                      // INSERT solo si no existe
                      await requestUpsertUbicacion
                          .input('nuevaCantidad', sql.Decimal(18,4), nuevaCantidad)
                          .query(`
                              INSERT INTO AcumuladoStockUbicacion (
                                  CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
                                  CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                                  UnidadSaldo, UnidadSaldoTipo_, Periodo
                              ) VALUES (
                                  @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
                                  @codigoArticulo, @tipoUnidadMedida, @partida, 
                                  @codigoColor, @codigoTalla01,
                                  @nuevaCantidad, @nuevaCantidad, 99
                              )
                          `);
                  }
              }
            // C. ACTUALIZAR ACUMULADOSTOCK (suma de todas las ubicaciones)
            console.log(`🔄 Actualizando AcumuladoStock`);
            const requestActualizarTotal = new sql.Request(transaction);
            await requestActualizarTotal
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
                .input('codigoArticulo', sql.VarChar, articulo)
                .input('tipoUnidadMedida', sql.VarChar, unidadStock)
                .input('partida', sql.VarChar, partida)
                .input('codigoColor', sql.VarChar, codigoColor)
                .input('codigoTalla01', sql.VarChar, codigoTalla01)
                .query(`
                    DECLARE @NuevoStockTotal DECIMAL(18,4);
                    
                    SELECT @NuevoStockTotal = ISNULL(SUM(UnidadSaldo), 0)
                    FROM AcumuladoStockUbicacion
                    WHERE CodigoEmpresa = @codigoEmpresa
                        AND Ejercicio = @ejercicio
                        AND CodigoAlmacen = @codigoAlmacen
                        AND CodigoArticulo = @codigoArticulo
                        AND TipoUnidadMedida_ = @tipoUnidadMedida
                        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                        AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 = ''))
                        AND Periodo = 99;
                    
                    -- UPSERT para AcumuladoStock
                    MERGE INTO AcumuladoStock AS target
                    USING (VALUES (
                        @codigoEmpresa, @ejercicio, @codigoAlmacen,
                        @codigoArticulo, @tipoUnidadMedida, @partida,
                        @codigoColor, @codigoTalla01
                    )) AS source (
                        CodigoEmpresa, Ejercicio, CodigoAlmacen,
                        CodigoArticulo, TipoUnidadMedida_, Partida,
                        CodigoColor_, CodigoTalla01_
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
                            UnidadSaldo = @NuevoStockTotal,
                            UnidadSaldoTipo_ = @NuevoStockTotal
                    
                    WHEN NOT MATCHED THEN
                        INSERT (
                            CodigoEmpresa, Ejercicio, CodigoAlmacen,
                            CodigoArticulo, TipoUnidadMedida_, Partida,
                            CodigoColor_, CodigoTalla01_,
                            UnidadSaldo, UnidadSaldoTipo_, Periodo
                        ) VALUES (
                            @codigoEmpresa, @ejercicio, @codigoAlmacen,
                            @codigoArticulo, @tipoUnidadMedida, @partida,
                            @codigoColor, @codigoTalla01,
                            @NuevoStockTotal, @NuevoStockTotal, 99
                        );
                `);

            // D. REGISTRAR MOVIMIENTO SOLO SI HAY DIFERENCIA
            if (Math.abs(diferencia) > 0.001) {
                console.log(`📝 Registrando movimiento: ${diferencia}`);
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
                    .input('codigoArticulo', sql.VarChar, articulo)
                    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
                    .input('ubicacion', sql.VarChar, ubicacionFinal)
                    .input('partida', sql.VarChar, partida || '')
                    .input('diferencia', sql.Decimal(18,4), diferencia)
                    .input('comentario', sql.VarChar, `Ajuste manual por ${usuario}`)
                    .input('unidadMedida', sql.VarChar, unidadStock)
                    .input('codigoColor', sql.VarChar, codigoColor || '')
                    .input('codigoTalla01', sql.VarChar, codigoTalla01 || '')
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

            // E. REGISTRAR EN INVENTARIOS (SIMPLIFICADO Y SEGURO)
            try {
                console.log(`📋 Registrando en Inventarios`);
                const fechaInventario = new Date();
                const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
                const mesAbrev = meses[fechaInventario.getMonth()];
                const dia = fechaInventario.getDate().toString().padStart(2, '0');
                
                // 🔥 CÓDIGO ÚNICO MÁS ROBUSTO
                const timestamp = Date.now().toString();
                const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
                const inventarioCodigo = `REG${dia}${mesAbrev}${timestamp}${random}`;
                
                // Limitar longitud a 50 caracteres (ajusta según tu BD)
                const codigoFinal = inventarioCodigo.substring(0, 50);
                
                console.log(`📝 Código de inventario: ${codigoFinal}`);

                const requestInventario = new sql.Request(transaction);
                await requestInventario
                    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                    .input('inventario', sql.VarChar, codigoFinal)
                    .input('codigoArticulo', sql.VarChar, articulo)
                    .input('partida', sql.VarChar, partida || '')
                    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
                    .input('tipoUnidadMedida', sql.VarChar, unidadStock)
                    .input('codigoColor', sql.VarChar, codigoColor || '')
                    .input('codigoTalla01', sql.VarChar, codigoTalla01 || '')
                    .input('unidadesStock', sql.Decimal(18,4), stockActual)
                    .input('unidadesInventario', sql.Decimal(18,4), nuevaCantidad)
                    .input('unidadesStock1', sql.Decimal(18,4), stockActual)
                    .input('unidadesInventario1', sql.Decimal(18,4), nuevaCantidad)
                    .input('precioMedio', sql.Decimal(18,4), 0)
                    .input('precioNuevo', sql.Decimal(18,4), 0)
                    .input('fechaInventario', sql.Date, fechaInventario)
                    .input('fechaCreacion', sql.DateTime, fechaInventario)
                    .query(`
                        -- INSERCIÓN SIMPLE CON MANEJO DE ERRORES
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
                    
                console.log(`✅ Registro en Inventarios exitoso`);
            } catch (inventarioError) {
                console.warn(`⚠️ Error al registrar en Inventarios:`, inventarioError.message);
                // NO hacemos rollback por este error, continuamos
            }
        }

        await transaction.commit();
        console.log(`✅ Todos los ajustes completados exitosamente`);

        res.json({
            success: true,
            mensaje: 'Ajustes aplicados correctamente',
            totalAjustes: ajustes.length
        });

    } catch (error) {
        if (transaction._aborted === false) {
            await transaction.rollback();
            console.log(`❌ Transacción revertida`);
        }
        console.error('❌ [ERROR CRÍTICO EN AJUSTE]', error);
        console.error('❌ Stack trace:', error.stack);
        
        res.status(500).json({
            success: false,
            mensaje: 'Error crítico al ajustar inventario',
            error: error.message,
            details: error.originalError?.info?.message || 'Sin detalles adicionales'
        });
    }
});

// ✅ 9.19 OBTENER UBICACIONES POR ALMACÉN (VERSIÓN CORREGIDA Y MEJORADA)
app.get('/ubicaciones/:codigoAlmacen', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { codigoAlmacen } = req.params;
  const { incluirSinUbicacion = 'false' } = req.query;

  if (!codigoEmpresa || !codigoAlmacen) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa y almacén requeridos.' 
    });
  }

  try {
    let query = `
      SELECT 
        u.Ubicacion, 
        u.DescripcionUbicacion,
        alm.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        (SELECT COUNT(*) 
         FROM AcumuladoStockUbicacion s 
         WHERE s.CodigoEmpresa = u.CodigoEmpresa 
           AND s.CodigoAlmacen = u.CodigoAlmacen 
           AND s.Ubicacion = u.Ubicacion 
           AND s.Periodo = 99 
           AND s.UnidadSaldo > 0) AS CantidadArticulos
      FROM Ubicaciones u
      INNER JOIN Almacenes alm ON alm.CodigoEmpresa = u.CodigoEmpresa 
        AND alm.CodigoAlmacen = u.CodigoAlmacen
      WHERE u.CodigoEmpresa = @codigoEmpresa 
        AND u.CodigoAlmacen = @codigoAlmacen
    `;

    // Si se solicita incluir sin ubicación, agregar opción virtual
    if (incluirSinUbicacion === 'true') {
      query = `
        ${query}
        UNION ALL
        SELECT 
          'SIN-UBICACION' AS Ubicacion,
          'Stock sin ubicación asignada' AS DescripcionUbicacion,
          @codigoAlmacen AS CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          (SELECT COUNT(DISTINCT s.CodigoArticulo)
           FROM AcumuladoStock s
           LEFT JOIN AcumuladoStockUbicacion su 
             ON su.CodigoEmpresa = s.CodigoEmpresa 
             AND su.CodigoAlmacen = s.CodigoAlmacen 
             AND su.CodigoArticulo = s.CodigoArticulo
             AND su.Periodo = 99
             AND su.UnidadSaldo > 0
           WHERE s.CodigoEmpresa = @codigoEmpresa
             AND s.CodigoAlmacen = @codigoAlmacen
             AND s.Periodo = 99
             AND s.UnidadSaldo > 0
             AND su.CodigoArticulo IS NULL) AS CantidadArticulos
        FROM Almacenes alm
        WHERE alm.CodigoEmpresa = @codigoEmpresa
          AND alm.CodigoAlmacen = @codigoAlmacen
      `;
    }

    query += ' ORDER BY Ubicacion';

    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .query(query);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR UBICACIONES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener ubicaciones',
      error: err.message 
    });
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

// ✅ 9.21 BUSCAR UBICACIONES (NUEVO ENDPOINT)
app.get('/buscar-ubicaciones', async (req, res) => {
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
        SELECT 
          u.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          u.Ubicacion,
          u.DescripcionUbicacion,
          (SELECT COUNT(*) 
           FROM AcumuladoStockUbicacion s 
           WHERE s.CodigoEmpresa = u.CodigoEmpresa 
             AND s.CodigoAlmacen = u.CodigoAlmacen 
             AND s.Ubicacion = u.Ubicacion 
             AND s.Periodo = 99 
             AND s.UnidadSaldo > 0) AS CantidadArticulos
        FROM Ubicaciones u
        INNER JOIN Almacenes alm ON alm.CodigoEmpresa = u.CodigoEmpresa 
          AND alm.CodigoAlmacen = u.CodigoAlmacen
        WHERE u.CodigoEmpresa = @codigoEmpresa
          AND (u.Ubicacion LIKE @termino 
               OR u.DescripcionUbicacion LIKE @termino
               OR alm.Almacen LIKE @termino)
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


// ✅ 9.22 OBTENER STOCK POR ARTÍCULO (VERSIÓN CORREGIDA)
app.get('/stock/por-articulo', async (req, res) => {
  const { codigoArticulo, incluirSinUbicacion } = req.query;
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

    // Consulta principal para stock con ubicación
    let query = `
      SELECT 
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        CAST(s.UnidadSaldo AS DECIMAL(18, 2)) AS Cantidad,
        COALESCE(NULLIF(s.TipoUnidadMedida_, ''), 'unidades') AS UnidadMedida,
        s.TipoUnidadMedida_,
        s.Partida,
        s.CodigoColor_,
        s.CodigoTalla01_ AS Talla,
        c.Color_ AS NombreColor,
        a.DescripcionArticulo,
        a.Descripcion2Articulo,
        0 AS EsSinUbicacion,
        CONCAT(
          s.CodigoAlmacen, '_', 
          s.Ubicacion, '_',
          s.TipoUnidadMedida_, '_',
          ISNULL(s.Partida, ''), '_',
          ISNULL(s.CodigoColor_, ''), '_',
          ISNULL(s.CodigoTalla01_, '')
        ) AS GrupoUnico
      FROM AcumuladoStockUbicacion s
      INNER JOIN Almacenes alm 
        ON alm.CodigoEmpresa = s.CodigoEmpresa 
        AND alm.CodigoAlmacen = s.CodigoAlmacen
      INNER JOIN Articulos a 
        ON a.CodigoEmpresa = s.CodigoEmpresa 
        AND a.CodigoArticulo = s.CodigoArticulo
      LEFT JOIN Ubicaciones u 
        ON u.CodigoEmpresa = s.CodigoEmpresa 
        AND u.CodigoAlmacen = s.CodigoAlmacen 
        AND u.Ubicacion = s.Ubicacion
      LEFT JOIN Colores_ c 
        ON c.CodigoEmpresa = s.CodigoEmpresa 
        AND c.CodigoColor_ = s.CodigoColor_
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND s.CodigoArticulo = @codigoArticulo
        AND s.Periodo IN (0, 99)
        AND s.UnidadSaldo > 0
    `;

    // Si se solicita incluir stock sin ubicación
    if (incluirSinUbicacion === 'true') {
      query = `
        ${query}
        UNION ALL
        -- Stock sin ubicación (versión corregida)
        SELECT 
          'CEN' AS CodigoAlmacen,
          'Almacén Central' AS NombreAlmacen,
          'SIN-UBICACION' AS Ubicacion,
          'Stock sin ubicación asignada' AS DescripcionUbicacion,
          stock_sin_ubicacion.Cantidad,
          'unidades' AS UnidadMedida,
          'unidades' AS TipoUnidadMedida_,
          '' AS Partida,
          '' AS CodigoColor_,
          '' AS Talla,
          '' AS NombreColor,
          a.DescripcionArticulo,
          a.Descripcion2Articulo,
          1 AS EsSinUbicacion,
          'CEN_SIN-UBICACION_unidades_' AS GrupoUnico
        FROM Articulos a
        CROSS APPLY (
          SELECT 
            CASE 
              WHEN stock_total.StockTotal > ISNULL(stock_ubicado.StockUbicado, 0)
              THEN stock_total.StockTotal - ISNULL(stock_ubicado.StockUbicado, 0)
              ELSE 0
            END AS Cantidad
          FROM (
            SELECT SUM(UnidadSaldo) AS StockTotal
            FROM AcumuladoStock 
            WHERE CodigoEmpresa = @codigoEmpresa
              AND CodigoArticulo = @codigoArticulo
              AND CodigoAlmacen = 'CEN'
              AND Periodo = 99
          ) stock_total
          CROSS APPLY (
            SELECT SUM(UnidadSaldo) AS StockUbicado
            FROM AcumuladoStockUbicacion 
            WHERE CodigoEmpresa = @codigoEmpresa
              AND CodigoArticulo = @codigoArticulo
              AND CodigoAlmacen = 'CEN'
              AND Periodo = 99
          ) stock_ubicado
        ) stock_sin_ubicacion
        WHERE a.CodigoEmpresa = @codigoEmpresa
          AND a.CodigoArticulo = @codigoArticulo
          AND stock_sin_ubicacion.Cantidad > 0
      `;
    }

    query += ' ORDER BY CodigoAlmacen, Ubicacion';

    const result = await request.query(query);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR STOCK POR ARTICULO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock por artículo.',
      error: err.message 
    });
  }
});

// ✅ 10.6 OBTENER UBICACIONES POR ALMACÉN (CORRECCIÓN)
app.get('/ubicaciones-por-almacen/:codigoAlmacen', async (req, res) => {
  const { codigoAlmacen } = req.params;
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .query(`
        SELECT 
          u.Ubicacion,
          COALESCE(u.DescripcionUbicacion, '') AS DescripcionUbicacion,
          COUNT(DISTINCT s.CodigoArticulo) AS CantidadArticulos
        FROM Ubicaciones u
        LEFT JOIN AcumuladoStockUbicacion s 
          ON s.CodigoEmpresa = u.CodigoEmpresa 
          AND s.CodigoAlmacen = u.CodigoAlmacen 
          AND s.Ubicacion = u.Ubicacion
          AND s.Periodo = 99
          AND s.UnidadSaldo > 0
        WHERE u.CodigoEmpresa = @codigoEmpresa
          AND u.CodigoAlmacen = @codigoAlmacen
        GROUP BY u.Ubicacion, u.DescripcionUbicacion
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

// ✅ 10.2 OBTENER UBICACIONES POR ALMACÉN (VERSIÓN CORREGIDA)
app.get('/ubicaciones-completas', async (req, res) => {
  const { codigoAlmacen, excluirUbicacion, incluirSinUbicacion = 'true' } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !codigoAlmacen) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa y almacén requeridos.' 
    });
  }

  try {
    // Consulta base para ubicaciones normales
    let query = `
      SELECT 
        u.Ubicacion, 
        u.DescripcionUbicacion,
        'NORMAL' AS TipoUbicacion,
        (SELECT COUNT(DISTINCT s.CodigoArticulo)
         FROM AcumuladoStockUbicacion s 
         WHERE s.CodigoEmpresa = u.CodigoEmpresa 
           AND s.CodigoAlmacen = u.CodigoAlmacen 
           AND s.Ubicacion = u.Ubicacion 
           AND s.Periodo = 99 
           AND s.UnidadSaldo > 0) AS CantidadArticulos
      FROM Ubicaciones u
      WHERE u.CodigoEmpresa = @codigoEmpresa 
        AND u.CodigoAlmacen = @codigoAlmacen
    `;
    
    const request = poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen);

    // Excluir ubicación específica si se proporciona
    if (excluirUbicacion) {
      query += ' AND u.Ubicacion <> @excluirUbicacion';
      request.input('excluirUbicacion', sql.VarChar, excluirUbicacion);
    }

    // Incluir opción de Sin Ubicación si se solicita
    if (incluirSinUbicacion === 'true') {
      query = `
        ${query}
        UNION ALL
        SELECT 
          'SIN-UBICACION' AS Ubicacion,
          'Stock sin ubicación asignada' AS DescripcionUbicacion,
          'SIN_UBICACION' AS TipoUbicacion,
          (SELECT COUNT(DISTINCT s.CodigoArticulo)
           FROM AcumuladoStock s
           LEFT JOIN AcumuladoStockUbicacion su 
             ON su.CodigoEmpresa = s.CodigoEmpresa 
             AND su.CodigoAlmacen = s.CodigoAlmacen 
             AND su.CodigoArticulo = s.CodigoArticulo
             AND su.TipoUnidadMedida_ = s.TipoUnidadMedida_
             AND ISNULL(su.Partida, '') = ISNULL(s.Partida, '')
             AND ISNULL(su.CodigoColor_, '') = ISNULL(s.CodigoColor_, '')
             AND ISNULL(su.CodigoTalla01_, '') = ISNULL(s.CodigoTalla01_, '')
             AND su.Periodo = 99
             AND su.UnidadSaldo > 0
           WHERE s.CodigoEmpresa = @codigoEmpresa
             AND s.CodigoAlmacen = @codigoAlmacen
             AND s.Periodo = 99
             AND s.UnidadSaldo > 0
             AND su.CodigoArticulo IS NULL) AS CantidadArticulos
      `;
    }

    query += ' ORDER BY Ubicacion';
    
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR UBICACIONES COMPLETAS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener ubicaciones.',
      error: err.message 
    });
  }
});

// ✅ 10.3 ACTUALIZAR STOCK Y REGISTRAR TRASPASO (VERSIÓN MEJORADA CON SINCRONIZACIÓN)
// REEMPLAZA al endpoint 10.3 anterior
app.post('/traspaso', async (req, res) => {
    const { 
        articulo, 
        origenAlmacen, 
        origenUbicacion, 
        destinoAlmacen, 
        destinoUbicacion, 
        cantidad, 
        unidadMedida, 
        partida, 
        codigoTalla, 
        codigoColor,
        esSinUbicacion = false 
    } = req.body;
    
    const usuario = req.user.UsuarioLogicNet;
    const codigoEmpresa = req.user.CodigoEmpresa;
    const ejercicio = new Date().getFullYear();

    // Validaciones básicas
    const cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
        return res.status(400).json({ 
            success: false, 
            mensaje: 'La cantidad debe ser un número válido y positivo.' 
        });
    }

    if (!articulo || !origenAlmacen || !origenUbicacion || !destinoAlmacen || !destinoUbicacion) {
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
        
        // 1. VERIFICACIÓN PREVIA DE SINCRONIZACIÓN
        console.log('🔍 Verificando estado de sincronización...');
        const requestVerificacion = new sql.Request(transaction);
        const verificacionResult = await requestVerificacion
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('tipoUnidadMedida', sql.VarChar, unidadMedida)
            .input('partida', sql.VarChar, partida || '')
            .input('codigoColor', sql.VarChar, codigoColor || '')
            .input('codigoTalla01', sql.VarChar, codigoTalla || '')
            .query(`
                SELECT 
                    (SELECT UnidadSaldo 
                     FROM AcumuladoStock 
                     WHERE CodigoEmpresa = @codigoEmpresa
                       AND Ejercicio = @ejercicio
                       AND CodigoAlmacen = @codigoAlmacen
                       AND CodigoArticulo = @codigoArticulo
                       AND TipoUnidadMedida_ = @tipoUnidadMedida
                       AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                       AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                       AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 = ''))
                       AND Periodo = 99) AS StockTotal,
                       
                    (SELECT SUM(UnidadSaldo)
                     FROM AcumuladoStockUbicacion
                     WHERE CodigoEmpresa = @codigoEmpresa
                       AND Ejercicio = @ejercicio
                       AND CodigoAlmacen = @codigoAlmacen
                       AND CodigoArticulo = @codigoArticulo
                       AND TipoUnidadMedida_ = @tipoUnidadMedida
                       AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                       AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                       AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 = ''))
                       AND Periodo = 99) AS StockUbicado
            `);

        const stockTotalGlobal = verificacionResult.recordset[0]?.StockTotal || 0;
        const stockUbicado = verificacionResult.recordset[0]?.StockUbicado || 0;
        
        // Si hay discrepancia significativa, corregir automáticamente
        if (Math.abs(stockTotalGlobal - stockUbicado) > 0.001) {
            console.warn(`⚠️ Discrepancia detectada. Stock Total: ${stockTotalGlobal}, Stock Ubicado: ${stockUbicado}. Corrigiendo...`);
            
            const requestCorreccion = new sql.Request(transaction);
            await requestCorreccion
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, origenAlmacen)
                .input('codigoArticulo', sql.VarChar, articulo)
                .input('tipoUnidadMedida', sql.VarChar, unidadMedida)
                .input('partida', sql.VarChar, partida || '')
                .input('codigoColor', sql.VarChar, codigoColor || '')
                .input('codigoTalla01', sql.VarChar, codigoTalla || '')
                .input('nuevoStockTotal', sql.Decimal(18,4), stockUbicado)
                .query(`
                    UPDATE AcumuladoStock
                    SET 
                        UnidadSaldo = @nuevoStockTotal,
                        UnidadSaldoTipo_ = @nuevoStockTotal
                    WHERE CodigoEmpresa = @codigoEmpresa
                      AND Ejercicio = @ejercicio
                      AND CodigoAlmacen = @codigoAlmacen
                      AND CodigoArticulo = @codigoArticulo
                      AND TipoUnidadMedida_ = @tipoUnidadMedida
                      AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                      AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                      AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 = ''))
                      AND Periodo = 99
                `);
                
            console.log('✅ Discrepancia corregida automáticamente');
        }

        // 2. MANEJO ESPECIAL PARA STOCK SIN UBICACIÓN
        let ubicacionOrigenFinal = origenUbicacion;
        let esTraspasoDesdeSinUbicacion = false;
        
        if (origenUbicacion === 'SIN-UBICACION' || esSinUbicacion) {
            esTraspasoDesdeSinUbicacion = true;
            ubicacionOrigenFinal = 'UBIC-DEFAULT';
            
            console.log('🔀 Traspaso desde SIN UBICACIÓN detectado');
            
            // Sincronizar stock sin ubicación para este artículo específico
            const requestSincronizar = new sql.Request(transaction);
            await requestSincronizar
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, origenAlmacen)
                .input('codigoArticulo', sql.VarChar, articulo)
                .input('unidadMedida', sql.VarChar, unidadMedida)
                .input('partida', sql.VarChar, partida || '')
                .input('codigoColor', sql.VarChar, codigoColor || '')
                .input('codigoTalla', sql.VarChar, codigoTalla || '')
                .query(`
                    WITH StockSinUbicacion AS (
                        SELECT 
                            ast.CodigoEmpresa,
                            ast.Ejercicio,
                            ast.CodigoAlmacen,
                            ast.CodigoArticulo,
                            ast.TipoUnidadMedida_,
                            ast.Partida,
                            ast.CodigoColor_,
                            ast.CodigoTalla01_,
                            (ast.UnidadSaldo - ISNULL(asu.StockUbicacion, 0)) AS StockSinUbicacion
                        FROM AcumuladoStock ast
                        LEFT JOIN (
                            SELECT 
                                CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                                TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                                SUM(UnidadSaldo) AS StockUbicacion
                            FROM AcumuladoStockUbicacion
                            WHERE CodigoEmpresa = @codigoEmpresa
                                AND Ejercicio = @ejercicio
                                AND CodigoAlmacen = @codigoAlmacen
                                AND CodigoArticulo = @codigoArticulo
                                AND Ubicacion <> 'SIN-UBICACION'
                                AND Periodo = 99
                            GROUP BY CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                                    TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
                        ) asu ON asu.CodigoEmpresa = ast.CodigoEmpresa
                            AND asu.Ejercicio = ast.Ejercicio
                            AND asu.CodigoAlmacen = ast.CodigoAlmacen
                            AND asu.CodigoArticulo = ast.CodigoArticulo
                            AND asu.TipoUnidadMedida_ = ast.TipoUnidadMedida_
                            AND ISNULL(asu.Partida, '') = ISNULL(ast.Partida, '')
                            AND ISNULL(asu.CodigoColor_, '') = ISNULL(ast.CodigoColor_, '')
                            AND ISNULL(asu.CodigoTalla01_, '') = ISNULL(ast.CodigoTalla01_, '')
                        WHERE ast.CodigoEmpresa = @codigoEmpresa
                            AND ast.Ejercicio = @ejercicio
                            AND ast.CodigoAlmacen = @codigoAlmacen
                            AND ast.CodigoArticulo = @codigoArticulo
                            AND ast.TipoUnidadMedida_ = @unidadMedida
                            AND (ast.Partida = @partida OR (ast.Partida IS NULL AND @partida = ''))
                            AND (ast.CodigoColor_ = @codigoColor OR (ast.CodigoColor_ IS NULL AND @codigoColor = ''))
                            AND (ast.CodigoTalla01_ = @codigoTalla OR (ast.CodigoTalla01_ IS NULL AND @codigoTalla = ''))
                            AND ast.Periodo = 99
                            AND (ast.UnidadSaldo - ISNULL(asu.StockUbicacion, 0)) > 0
                    )
                    
                    MERGE INTO AcumuladoStockUbicacion AS target
                    USING StockSinUbicacion AS source
                    ON target.CodigoEmpresa = source.CodigoEmpresa
                        AND target.Ejercicio = source.Ejercicio
                        AND target.CodigoAlmacen = source.CodigoAlmacen
                        AND target.Ubicacion = 'SIN-UBICACION'
                        AND target.CodigoArticulo = source.CodigoArticulo
                        AND target.TipoUnidadMedida_ = source.TipoUnidadMedida_
                        AND ISNULL(target.Partida, '') = ISNULL(source.Partida, '')
                        AND ISNULL(target.CodigoColor_, '') = ISNULL(source.CodigoColor_, '')
                        AND ISNULL(target.CodigoTalla01_, '') = ISNULL(source.CodigoTalla01_, '')
                        AND target.Periodo = 99
                    
                    WHEN MATCHED THEN
                        UPDATE SET 
                            UnidadSaldo = source.StockSinUbicacion,
                            UnidadSaldoTipo_ = source.StockSinUbicacion
                    
                    WHEN NOT MATCHED THEN
                        INSERT (
                            CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
                            CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                            UnidadSaldo, UnidadSaldoTipo_, Periodo
                        ) VALUES (
                            source.CodigoEmpresa, source.Ejercicio, source.CodigoAlmacen, 'SIN-UBICACION',
                            source.CodigoArticulo, source.TipoUnidadMedida_, source.Partida, source.CodigoColor_, source.CodigoTalla01_,
                            source.StockSinUbicacion, source.StockSinUbicacion, 99
                        );
                `);
        }

        // 3. OBTENER DATOS DEL STOCK ORIGEN
        const requestGet = new sql.Request(transaction);
        
        let queryStockOrigen = `
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
        `;

        if (esTraspasoDesdeSinUbicacion) {
            queryStockOrigen = `
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
                    AND Ubicacion = 'SIN-UBICACION'
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
            `;
        }

        const stockResult = await requestGet
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('ubicacion', sql.VarChar, esTraspasoDesdeSinUbicacion ? 'SIN-UBICACION' : origenUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('unidadMedida', sql.VarChar, unidadMedida)
            .input('partida', sql.VarChar, partida || '')
            .input('codigoTalla', sql.VarChar, codigoTalla || '')
            .input('codigoColor', sql.VarChar, codigoColor || '')
            .query(queryStockOrigen);
        
        if (stockResult.recordset.length === 0 || stockResult.recordset[0].CantidadTotal === null) {
            throw new Error('Stock en ubicación de origen no encontrado');
        }
        
        const stockTotalOrigen = stockResult.recordset[0].CantidadTotal;
        const partidaExistente = stockResult.recordset[0].PartidaExistente;
        const tallaExistente = stockResult.recordset[0].TallaExistente;
        const colorExistente = stockResult.recordset[0].ColorExistente;
        const unidadMedidaReal = stockResult.recordset[0].UnidadMedida || unidadMedida;
        
        if (cantidadNum > stockTotalOrigen) {
            throw new Error(`Cantidad supera el stock disponible (${stockTotalOrigen})`);
        }

        // 4. ELIMINAR REGISTROS CON SALDO CERO EN ORIGEN
        const requestDeleteCero = new sql.Request(transaction);
        await requestDeleteCero
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('ubicacion', sql.VarChar, esTraspasoDesdeSinUbicacion ? 'SIN-UBICACION' : origenUbicacion)
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

        // 5. UPSERT PARA ORIGEN
        const nuevoSaldoOrigen = stockTotalOrigen - cantidadNum;
        const requestUpsertOrigen = new sql.Request(transaction);
        
        let queryUpsertOrigen = `
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
        `;

        await requestUpsertOrigen
            .input('nuevoSaldo', sql.Decimal(18,4), nuevoSaldoOrigen)
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('ubicacion', sql.VarChar, esTraspasoDesdeSinUbicacion ? 'SIN-UBICACION' : origenUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('unidadMedida', sql.VarChar, unidadMedidaReal)
            .input('partida', sql.VarChar, partidaExistente || partida || '')
            .input('codigoTalla', sql.VarChar, tallaExistente || codigoTalla || '')
            .input('codigoColor', sql.VarChar, colorExistente || codigoColor || '')
            .query(queryUpsertOrigen);

        // 6. UPSERT PARA DESTINO
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

        // 7. ACTUALIZAR ACUMULADOSTOCK PARA MANTENER CONSISTENCIA
        const requestActualizarAcumuladoStock = new sql.Request(transaction);
        await requestActualizarAcumuladoStock
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('unidadMedida', sql.VarChar, unidadMedidaReal)
            .input('partida', sql.VarChar, partidaExistente || partida || '')
            .input('codigoColor', sql.VarChar, colorExistente || codigoColor || '')
            .input('codigoTalla01', sql.VarChar, tallaExistente || codigoTalla || '')
            .query(`
                UPDATE AcumuladoStock
                SET UnidadSaldo = (
                    SELECT SUM(UnidadSaldo)
                    FROM AcumuladoStockUbicacion
                    WHERE CodigoEmpresa = @codigoEmpresa
                        AND Ejercicio = @ejercicio
                        AND CodigoAlmacen = @codigoAlmacen
                        AND CodigoArticulo = @codigoArticulo
                        AND TipoUnidadMedida_ = @unidadMedida
                        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                        AND (CodigoTalla01_ = @codigoTalla01 OR (CodigoTalla01_ IS NULL AND @codigoTalla01 = ''))
                        AND Periodo = 99
                )
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

        // 8. REGISTRAR MOVIMIENTO
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
            .input('ubicacion', sql.VarChar, esTraspasoDesdeSinUbicacion ? 'SIN-UBICACION' : origenUbicacion)
            .input('ubicacionContrapartida', sql.VarChar, destinoUbicacion)
            .input('partida', sql.VarChar, partidaExistente || partida || '')
            .input('diferencia', sql.Decimal(18,4), cantidadNum)
            .input('comentario', sql.VarChar, `Traspaso por Usuario: ${usuario} ${esTraspasoDesdeSinUbicacion ? '(Desde Sin Ubicación)' : ''}`)
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
        
        // 9. SINCRONIZACIÓN POST-TRASPASO
        console.log('🔄 Sincronizando después del traspaso...');
        try {
            // Llamar al endpoint de sincronización para el artículo
            const axios = require('axios');
            await axios.post('http://localhost:3000/inventario/sincronizar-stock', {
                codigoArticulo: articulo,
                forzarCorreccion: true
            }, {
                headers: {
                    'Authorization': req.headers['authorization'],
                    'Content-Type': 'application/json'
                }
            });
            console.log('✅ Sincronización post-traspaso completada');
        } catch (syncError) {
            console.error('❌ Error en sincronización post-traspaso:', syncError.message);
        }
        
        res.json({ 
            success: true, 
            mensaje: 'Traspaso realizado con éxito y sincronizado',
            datos: {
                articulo: articulo,
                origen: `${origenAlmacen}-${origenUbicacion}`,
                destino: `${destinoAlmacen}-${destinoUbicacion}`,
                cantidad: cantidadNum,
                unidad: unidadMedidaReal,
                desdeSinUbicacion: esTraspasoDesdeSinUbicacion
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
            error: err.message
        });
    }
});

// ✅ FUNCIÓN AUXILIAR: SINCRONIZAR STOCK SIN UBICACIÓN PARA TRASPASO
async function sincronizarStockSinUbicacion(transaction, codigoEmpresa, ejercicio, codigoAlmacen, codigoArticulo, unidadMedida, partida, codigoColor, codigoTalla) {
    try {
        const requestSincronizar = new sql.Request(transaction);
        
        await requestSincronizar
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
            .input('codigoArticulo', sql.VarChar, codigoArticulo)
            .input('unidadMedida', sql.VarChar, unidadMedida)
            .input('partida', sql.VarChar, partida || '')
            .input('codigoColor', sql.VarChar, codigoColor || '')
            .input('codigoTalla', sql.VarChar, codigoTalla || '')
            .query(`
                -- Calcular stock sin ubicación
                WITH StockSinUbicacion AS (
                    SELECT 
                        ast.CodigoEmpresa,
                        ast.Ejercicio,
                        ast.CodigoAlmacen,
                        ast.CodigoArticulo,
                        ast.TipoUnidadMedida_,
                        ast.Partida,
                        ast.CodigoColor_,
                        ast.CodigoTalla01_,
                        (ast.UnidadSaldo - ISNULL(asu.StockUbicacion, 0)) AS StockSinUbicacion
                    FROM AcumuladoStock ast
                    LEFT JOIN (
                        SELECT 
                            CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                            TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                            SUM(UnidadSaldo) AS StockUbicacion
                        FROM AcumuladoStockUbicacion
                        WHERE CodigoEmpresa = @codigoEmpresa
                            AND Ejercicio = @ejercicio
                            AND CodigoAlmacen = @codigoAlmacen
                            AND CodigoArticulo = @codigoArticulo
                            AND Ubicacion <> 'SIN-UBICACION'
                            AND Periodo = 99
                        GROUP BY CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                                TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
                    ) asu ON asu.CodigoEmpresa = ast.CodigoEmpresa
                        AND asu.Ejercicio = ast.Ejercicio
                        AND asu.CodigoAlmacen = ast.CodigoAlmacen
                        AND asu.CodigoArticulo = ast.CodigoArticulo
                        AND asu.TipoUnidadMedida_ = ast.TipoUnidadMedida_
                        AND ISNULL(asu.Partida, '') = ISNULL(ast.Partida, '')
                        AND ISNULL(asu.CodigoColor_, '') = ISNULL(ast.CodigoColor_, '')
                        AND ISNULL(asu.CodigoTalla01_, '') = ISNULL(ast.CodigoTalla01_, '')
                    WHERE ast.CodigoEmpresa = @codigoEmpresa
                        AND ast.Ejercicio = @ejercicio
                        AND ast.CodigoAlmacen = @codigoAlmacen
                        AND ast.CodigoArticulo = @codigoArticulo
                        AND ast.TipoUnidadMedida_ = @unidadMedida
                        AND (ast.Partida = @partida OR (ast.Partida IS NULL AND @partida = ''))
                        AND (ast.CodigoColor_ = @codigoColor OR (ast.CodigoColor_ IS NULL AND @codigoColor = ''))
                        AND (ast.CodigoTalla01_ = @codigoTalla OR (ast.CodigoTalla01_ IS NULL AND @codigoTalla = ''))
                        AND ast.Periodo = 99
                        AND (ast.UnidadSaldo - ISNULL(asu.StockUbicacion, 0)) > 0
                )
                
                -- Insertar o actualizar en AcumuladoStockUbicacion
                MERGE INTO AcumuladoStockUbicacion AS target
                USING StockSinUbicacion AS source
                ON target.CodigoEmpresa = source.CodigoEmpresa
                    AND target.Ejercicio = source.Ejercicio
                    AND target.CodigoAlmacen = source.CodigoAlmacen
                    AND target.Ubicacion = 'SIN-UBICACION'
                    AND target.CodigoArticulo = source.CodigoArticulo
                    AND target.TipoUnidadMedida_ = source.TipoUnidadMedida_
                    AND ISNULL(target.Partida, '') = ISNULL(source.Partida, '')
                    AND ISNULL(target.CodigoColor_, '') = ISNULL(source.CodigoColor_, '')
                    AND ISNULL(target.CodigoTalla01_, '') = ISNULL(source.CodigoTalla01_, '')
                    AND target.Periodo = 99
                
                WHEN MATCHED THEN
                    UPDATE SET 
                        UnidadSaldo = source.StockSinUbicacion,
                        UnidadSaldoTipo_ = source.StockSinUbicacion
                
                WHEN NOT MATCHED THEN
                    INSERT (
                        CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
                        CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                        UnidadSaldo, UnidadSaldoTipo_, Periodo
                    ) VALUES (
                        source.CodigoEmpresa, source.Ejercicio, source.CodigoAlmacen, 'SIN-UBICACION',
                        source.CodigoArticulo, source.TipoUnidadMedida_, source.Partida, source.CodigoColor_, source.CodigoTalla01_,
                        source.StockSinUbicacion, source.StockSinUbicacion, 99
                    );
            `);
            
        console.log('✅ Stock sin ubicación sincronizado para traspaso');
    } catch (error) {
        console.error('❌ Error sincronizando stock sin ubicación:', error);
        throw new Error(`Error al sincronizar stock sin ubicación: ${error.message}`);
    }
}

// ✅ FUNCIÓN AUXILIAR: ACTUALIZAR ACUMULADOSTOCK
async function actualizarAcumuladoStock(transaction, codigoEmpresa, ejercicio, codigoAlmacen, codigoArticulo, unidadMedida, partida, codigoColor, codigoTalla) {
    try {
        const requestActualizar = new sql.Request(transaction);
        
        await requestActualizar
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
            .input('codigoArticulo', sql.VarChar, codigoArticulo)
            .input('unidadMedida', sql.VarChar, unidadMedida)
            .input('partida', sql.VarChar, partida)
            .input('codigoColor', sql.VarChar, codigoColor)
            .input('codigoTalla', sql.VarChar, codigoTalla)
            .query(`
                -- Actualizar AcumuladoStock con la suma de AcumuladoStockUbicacion
                UPDATE AcumuladoStock
                SET UnidadSaldo = (
                    SELECT SUM(UnidadSaldo)
                    FROM AcumuladoStockUbicacion
                    WHERE CodigoEmpresa = @codigoEmpresa
                        AND Ejercicio = @ejercicio
                        AND CodigoAlmacen = @codigoAlmacen
                        AND CodigoArticulo = @codigoArticulo
                        AND TipoUnidadMedida_ = @unidadMedida
                        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
                        AND Periodo = 99
                )
                WHERE CodigoEmpresa = @codigoEmpresa
                    AND Ejercicio = @ejercicio
                    AND CodigoAlmacen = @codigoAlmacen
                    AND CodigoArticulo = @codigoArticulo
                    AND TipoUnidadMedida_ = @unidadMedida
                    AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                    AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                    AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
                    AND Periodo = 99
            `);
            
        console.log('✅ AcumuladoStock actualizado para mantener consistencia');
    } catch (error) {
        console.error('❌ Error actualizando AcumuladoStock:', error);
        throw new Error(`Error al actualizar AcumuladoStock: ${error.message}`);
    }
}

// ✅ ENDPOINT ADICIONAL: VERIFICAR STOCK SIN UBICACIÓN PARA TRASPASO
app.get('/traspaso/verificar-stock-sin-ubicacion', async (req, res) => {
    const { codigoAlmacen, codigoArticulo, unidadMedida, partida, codigoColor, codigoTalla } = req.query;
    const codigoEmpresa = req.user.CodigoEmpresa;
    const ejercicio = new Date().getFullYear();

    try {
        const result = await poolGlobal.request()
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
            .input('codigoArticulo', sql.VarChar, codigoArticulo)
            .input('unidadMedida', sql.VarChar, unidadMedida)
            .input('partida', sql.VarChar, partida || '')
            .input('codigoColor', sql.VarChar, codigoColor || '')
            .input('codigoTalla', sql.VarChar, codigoTalla || '')
            .query(`
                SELECT 
                    ast.UnidadSaldo AS StockTotal,
                    ISNULL(asu.StockUbicacion, 0) AS StockUbicacion,
                    (ast.UnidadSaldo - ISNULL(asu.StockUbicacion, 0)) AS StockSinUbicacion
                FROM AcumuladoStock ast
                LEFT JOIN (
                    SELECT 
                        CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                        TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                        SUM(UnidadSaldo) AS StockUbicacion
                    FROM AcumuladoStockUbicacion
                    WHERE CodigoEmpresa = @codigoEmpresa
                        AND Ejercicio = @ejercicio
                        AND CodigoAlmacen = @codigoAlmacen
                        AND CodigoArticulo = @codigoArticulo
                        AND TipoUnidadMedida_ = @unidadMedida
                        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
                        AND Periodo = 99
                    GROUP BY CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                            TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
                ) asu ON asu.CodigoEmpresa = ast.CodigoEmpresa
                    AND asu.Ejercicio = ast.Ejercicio
                    AND asu.CodigoAlmacen = ast.CodigoAlmacen
                    AND asu.CodigoArticulo = ast.CodigoArticulo
                    AND asu.TipoUnidadMedida_ = ast.TipoUnidadMedida_
                    AND ISNULL(asu.Partida, '') = ISNULL(ast.Partida, '')
                    AND ISNULL(asu.CodigoColor_, '') = ISNULL(ast.CodigoColor_, '')
                    AND ISNULL(asu.CodigoTalla01_, '') = ISNULL(ast.CodigoTalla01_, '')
                WHERE ast.CodigoEmpresa = @codigoEmpresa
                    AND ast.Ejercicio = @ejercicio
                    AND ast.CodigoAlmacen = @codigoAlmacen
                    AND ast.CodigoArticulo = @codigoArticulo
                    AND ast.TipoUnidadMedida_ = @unidadMedida
                    AND (ast.Partida = @partida OR (ast.Partida IS NULL AND @partida = ''))
                    AND (ast.CodigoColor_ = @codigoColor OR (ast.CodigoColor_ IS NULL AND @codigoColor = ''))
                    AND (ast.CodigoTalla01_ = @codigoTalla OR (ast.CodigoTalla01_ IS NULL AND @codigoTalla = ''))
                    AND ast.Periodo = 99
            `);

        if (result.recordset.length === 0) {
            return res.json({
                success: true,
                stockDisponible: 0,
                mensaje: 'No se encontró stock para los criterios especificados'
            });
        }

        const stockInfo = result.recordset[0];
        
        res.json({
            success: true,
            stockTotal: stockInfo.StockTotal,
            stockUbicacion: stockInfo.StockUbicacion,
            stockSinUbicacion: stockInfo.StockSinUbicacion,
            stockDisponible: stockInfo.StockSinUbicacion
        });
    } catch (error) {
        console.error('[ERROR VERIFICAR STOCK SIN UBICACION]', error);
        res.status(500).json({
            success: false,
            mensaje: 'Error al verificar stock sin ubicación',
            error: error.message
        });
    }
});

// ✅ 10.4 OBTENER HISTORIAL DE TRASPASOS (VERSIÓN COMPLETAMENTE CORREGIDA)
app.get('/historial-traspasos', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { fecha, page = 1, pageSize = 50 } = req.query;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    const offset = (page - 1) * pageSize;
    
    let whereClause = `WHERE m.CodigoEmpresa = @codigoEmpresa AND m.TipoMovimiento = 3`;
    const request = poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa);

    if (fecha) {
      whereClause += ` AND CONVERT(date, m.FechaRegistro) = @fecha`;
      request.input('fecha', sql.Date, fecha);
    }

    // CONSULTA COMPLETAMENTE CORREGIDA - Usando solo columnas existentes
    const query = `
      SELECT 
        m.CodigoArticulo,
        a.DescripcionArticulo,
        m.CodigoAlmacen AS OrigenAlmacen,
        alm_origen.Almacen AS NombreAlmacenOrigen,
        m.Ubicacion AS OrigenUbicacion,
        m.AlmacenContrapartida AS DestinoAlmacen,
        alm_destino.Almacen AS NombreAlmacenDestino,
        m.UbicacionContrapartida AS DestinoUbicacion,
        m.Unidades AS Cantidad,
        m.UnidadMedida1_ AS UnidadMedida,
        m.Partida,
        m.CodigoTalla01_,
        m.CodigoColor_,
        m.Comentario,
        m.FechaRegistro,
        FORMAT(m.FechaRegistro, 'dd/MM/yyyy HH:mm:ss') AS FechaFormateada,
        u_origen.DescripcionUbicacion AS DescripcionUbicacionOrigen,
        u_destino.DescripcionUbicacion AS DescripcionUbicacionDestino
      FROM MovimientoStock m
      LEFT JOIN Articulos a 
        ON a.CodigoEmpresa = m.CodigoEmpresa 
        AND a.CodigoArticulo = m.CodigoArticulo
      LEFT JOIN Almacenes alm_origen 
        ON alm_origen.CodigoEmpresa = m.CodigoEmpresa 
        AND alm_origen.CodigoAlmacen = m.CodigoAlmacen
      LEFT JOIN Almacenes alm_destino 
        ON alm_destino.CodigoEmpresa = m.CodigoEmpresa 
        AND alm_destino.CodigoAlmacen = m.AlmacenContrapartida
      LEFT JOIN Ubicaciones u_origen 
        ON u_origen.CodigoEmpresa = m.CodigoEmpresa 
        AND u_origen.CodigoAlmacen = m.CodigoAlmacen 
        AND u_origen.Ubicacion = m.Ubicacion
      LEFT JOIN Ubicaciones u_destino 
        ON u_destino.CodigoEmpresa = m.CodigoEmpresa 
        AND u_destino.CodigoAlmacen = m.AlmacenContrapartida 
        AND u_destino.Ubicacion = m.UbicacionContrapartida
      ${whereClause}
      ORDER BY m.FechaRegistro DESC
      OFFSET ${offset} ROWS
      FETCH NEXT ${pageSize} ROWS ONLY
    `;

    const result = await request.query(query);
    
    // Obtener total de registros
    const countResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT COUNT(*) as Total
        FROM MovimientoStock m
        WHERE m.CodigoEmpresa = @codigoEmpresa 
          AND m.TipoMovimiento = 3
      `);

    const total = countResult.recordset[0]?.Total || 0;
    const totalPages = Math.ceil(total / pageSize);

    res.json({
      success: true,
      traspasos: result.recordset,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: total,
        totalPages: totalPages
      }
    });
  } catch (err) {
    console.error('[ERROR HISTORIAL TRASPASOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener historial de traspasos.',
      error: err.message 
    });
  }
});


// ✅ ENDPOINT DE DIAGNÓSTICO RÁPIDO
app.get('/debug/stock-articulo', async (req, res) => {
  const { codigoEmpresa, codigoArticulo } = req.query;
  
  try {
    // Stock en AcumuladoStockUbicacion
    const stockUbicacion = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT 
          CodigoAlmacen, Ubicacion, UnidadSaldo, TipoUnidadMedida_,
          Partida, CodigoColor_, CodigoTalla01_, Periodo
        FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoArticulo = @codigoArticulo
          AND Periodo = 99
          AND UnidadSaldo > 0
        ORDER BY UnidadSaldo DESC
      `);

    // Stock total en AcumuladoStock
    const stockTotal = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT 
          CodigoAlmacen, TipoUnidadMedida_, SUM(UnidadSaldo) as StockTotal
        FROM AcumuladoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoArticulo = @codigoArticulo
          AND Periodo = 99
        GROUP BY CodigoAlmacen, TipoUnidadMedida_
      `);

    res.json({
      success: true,
      stockUbicacion: stockUbicacion.recordset,
      stockTotal: stockTotal.recordset,
      mensaje: `Diagnóstico para artículo ${codigoArticulo}`
    });
  } catch (err) {
    console.error('[ERROR DIAGNOSTICO]', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});