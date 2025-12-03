const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// Inicialización de Express
const upload = multer();
const app = express();

// ✅ CONFIGURACIÓN MULTI-ENTORNO MEJORADA
const isProduction = process.env.NODE_ENV === 'production';
const PUBLIC_IP = process.env.PUBLIC_IP || '84.120.61.159'; // Tu IP pública
const PUBLIC_PORT = process.env.PORT || 3000;

// Configuración CORS dinámica
const allowedOrigins = isProduction 
  ? [
      `http://${PUBLIC_IP}:${PUBLIC_PORT}`,
      `http://${PUBLIC_IP}:5173`,
      'http://localhost:5173',
      'http://localhost:3000'
    ]
  : [
      'http://localhost:5173',
      'http://localhost:3000',
      `http://${PUBLIC_IP}:${PUBLIC_PORT}`
    ];

console.log('🌍 Entorno:', isProduction ? 'PRODUCCIÓN' : 'DESARROLLO');
console.log('🎯 Orígenes permitidos:', allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (como mobile apps o curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `Origen ${origin} no permitido por CORS`;
      console.warn('🚨 CORS Blocked:', origin);
      return callback(new Error(msg), false);
    }
    console.log('✅ CORS Permitido:', origin);
    return callback(null, true);
  },
  credentials: true
}));

// ✅ MIDDLEWARE PARA LOGS DE DEPURACIÓN
app.use((req, res, next) => {
  console.log(`🌐 [${isProduction ? 'PROD' : 'DEV'}] ${req.method} ${req.url}`);
  console.log(`   Origin: ${req.headers.origin}`);
  console.log(`   Host: ${req.headers.host}`);
  console.log(`   User-Agent: ${req.headers['user-agent']}`);
  next();
});

app.use(express.json());

// 🔥 Configuración de conexión a SQL Server (MEJOR CON VARIABLES DE ENTORNO)
const dbConfig = {
  server: 'DESKTOP-N86U7H1',
  database: 'Sage',
  user: 'Logic',
  password: '12345',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    appName: 'GestorComprasWeb',
    connectTimeout: 30000,
    requestTimeout: 30000,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  }
};

// 🔥 Pool de conexión global
let poolGlobal;

// ============================================
// ✅ CONEXIÓN A LA BASE DE DATOS
// ============================================
async function conectarDB() {
  try {
    if (!poolGlobal) {
      poolGlobal = await sql.connect(dbConfig);
      console.log('✅ Conexión a SQL Server establecida.');
    }
    return poolGlobal;
  } catch (err) {
    console.error('❌ Error de conexión a BD:', err);
    throw err;
  }
}

// Middleware de conexión a base de datos
app.use(async (req, res, next) => {
  try {
    await conectarDB();
    next();
  } catch (err) {
    console.error('Error de conexión:', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error conectando a la base de datos.',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 2. MIDDLEWARE DE AUTENTICACIÓN MEJORADO
// ============================================
app.use((req, res, next) => {
  // ✅ EXCLUIR RECURSOS ESTÁTICOS Y RUTAS PÚBLICAS
  const publicPaths = [
    '/login', 
    '/', 
    '/api/diagnostic', 
    '/diagnostic',
    '/favicon.ico'
  ];
  
  // Excluir archivos estáticos (JS, CSS, imágenes, etc.)
  const isStaticFile = req.path.startsWith('/assets/') || 
                      req.path.startsWith('/static/') ||
                      req.path.endsWith('.js') ||
                      req.path.endsWith('.css') ||
                      req.path.endsWith('.ico') ||
                      req.path.endsWith('.png') ||
                      req.path.endsWith('.jpg') ||
                      req.path.endsWith('.svg') ||
                      req.path.endsWith('.woff') ||
                      req.path.endsWith('.woff2') ||
                      req.path.endsWith('.ttf');

  if (publicPaths.includes(req.path) || isStaticFile) {
    console.log(`✅ Ruta pública: ${req.path}`);
    return next();
  }

  const usuario = req.headers.usuario;
  const codigoempresa = req.headers.codigoempresa;

  if (!usuario || !codigoempresa) {
    console.error('🚨 Faltan cabeceras de autenticación:', {
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

  console.log(`🔒 Usuario autenticado: ${usuario}, Empresa: ${codigoempresa}`);
  next();
});

// ============================================
// ✅ ENDPOINT DE DIAGNÓSTICO MEJORADO
// ============================================
app.get('/api/diagnostic', (req, res) => {
  res.json({
    success: true,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    baseUrl: `${req.protocol}://${req.get('host')}`,
    publicIp: PUBLIC_IP,
    port: PUBLIC_PORT,
    isProduction: isProduction,
    headers: {
      origin: req.headers.origin,
      host: req.headers.host,
      usuario: req.headers.usuario,
      codigoempresa: req.headers.codigoempresa
    },
    database: {
      connected: !!poolGlobal,
      server: dbConfig.server
    },
    cors: {
      allowedOrigins: allowedOrigins
    }
  });
});

app.get('/diagnostic', (req, res) => {
  res.json({
    message: '✅ Backend funcionando correctamente',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});



// ============================================
// ✅ 3. LOGIN (SIN PERMISOS) - MANTENER ORIGINAL
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
// ✅ 5. OBTENER EMPRESAS
// ============================================

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
// ✅ 5. PEDIDOS SCREEN
// ============================================

// ✅ 5.1 PEDIDOS PENDIENTES (VERSIÓN COMPLETA CON TODOS LOS CAMPOS)
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
    const FormaEnvio = req.query.FormaEnvio;
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

    // 7. Consulta principal (ACTUALIZADA CON TODOS LOS CAMPOS NECESARIOS)
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
          c.NombreObra,
          c.FechaPedido,
          c.FechaEntrega,
          c.FormaEnvio,
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
          c.Contacto,
          c.Telefono AS TelefonoContacto,
          c.Vendedor,
          l.CodigoArticulo,
          l.DescripcionArticulo,
          l.Descripcion2Articulo,
          l.UnidadesPedidas, 
          l.UnidadesPendientes,
          l.UnidadesServidas,
          (l.UnidadesPedidas - l.UnidadesPendientes) AS UnidadesExpedidas,
          l.CodigoAlmacen,
          a.CodigoAlternativo,
          l.LineasPosicion,
          l.LineasPosicion AS MovPosicionLinea,
          l.UnidadMedida1_ AS UnidadBase,
          l.UnidadMedida2_ AS UnidadAlternativa,
          l.FactorConversion_ AS FactorConversion,
          COALESCE(NULLIF(l.UnidadMedida1_, ''), a.UnidadMedida2_, 'ud') AS UnidadPedido,
          emp.Nombre AS NombreVendedor,
          l.Precio,
          ISNULL(a.PesoBrutoUnitario_, 0) AS PesoUnitario,
          (l.UnidadesPendientes * ISNULL(a.PesoBrutoUnitario_, 0)) AS PesoTotalLinea,
          l.GrupoTalla_
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
          ${FormaEnvio ? `AND c.FormaEnvio = ${FormaEnvio}` : ''}
          ${empleado ? `AND c.EmpleadoAsignado = '${empleado}'` : ''}
          ${usuarioCondition}
          ${empleadoAsignado ? `AND c.EmpleadoAsignado = '${empleadoAsignado}'` : ''}
        ORDER BY c.FechaEntrega ASC
      `);

    // 8. Recopilar IDs para detalles (usando LineasPosicion)
    const lineasIds = [];
    result.recordset.forEach(row => {
      if (row.LineasPosicion) {
        lineasIds.push(row.LineasPosicion);
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
          gt.CodigoTalla01_,
          gt.CodigoTalla02_,
          gt.CodigoTalla03_,
          gt.CodigoTalla04_,
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
        
        const tallasConDescripciones = {};
        
        // Talla 01
        if (detalle.CodigoTalla01_ && detalle.UnidadesTalla01_ > 0) {
          tallasConDescripciones[detalle.CodigoTalla01_] = {
            descripcion: detalle.DescTalla01,
            unidades: detalle.UnidadesTalla01_
          };
        }
        
        // Talla 02
        if (detalle.CodigoTalla02_ && detalle.UnidadesTalla02_ > 0) {
          tallasConDescripciones[detalle.CodigoTalla02_] = {
            descripcion: detalle.DescTalla02,
            unidades: detalle.UnidadesTalla02_
          };
        }
        
        // Talla 03
        if (detalle.CodigoTalla03_ && detalle.UnidadesTalla03_ > 0) {
          tallasConDescripciones[detalle.CodigoTalla03_] = {
            descripcion: detalle.DescTalla03,
            unidades: detalle.UnidadesTalla03_
          };
        }
        
        // Talla 04
        if (detalle.CodigoTalla04_ && detalle.UnidadesTalla04_ > 0) {
          tallasConDescripciones[detalle.CodigoTalla04_] = {
            descripcion: detalle.DescTalla04,
            unidades: detalle.UnidadesTalla04_
          };
        }
        
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
          nombreObra: row.NombreObra,
          fechaPedido: row.FechaPedido,
          fechaEntrega: row.FechaEntrega,
          FormaEnvio: formasEntregaMap[row.FormaEnvio] || 'No especificada',
          Estado: row.Estado,
          StatusAprobado: row.StatusAprobado,
          Status: row.Status,
          EsVoluminoso: row.EsVoluminoso,
          EmpleadoAsignado: row.EmpleadoAsignado,
          Contacto: row.Contacto,
          TelefonoContacto: row.TelefonoContacto,
          Vendedor: row.Vendedor,
          NombreVendedor: row.NombreVendedor,
          PesoTotal: 0,
          articulos: []
        };
      }
      
      const pesoLinea = parseFloat(row.PesoTotalLinea) || 0;
      pedidosAgrupados[key].PesoTotal += pesoLinea;

      const detalles = detallesPorLinea[row.LineasPosicion] || [];
      pedidosAgrupados[key].articulos.push({
        codigoArticulo: row.CodigoArticulo,
        descripcionArticulo: row.DescripcionArticulo,
        descripcion2Articulo: row.Descripcion2Articulo,
        unidadesPedidas: row.UnidadesPedidas,
        unidadesPendientes: row.UnidadesPendientes,
        unidadesServidas: row.UnidadesServidas,
        UnidadesExpedidas: row.UnidadesExpedidas,
        codigoAlmacen: row.CodigoAlmacen,
        codigoAlternativo: row.CodigoAlternativo,
        detalles: detalles.length > 0 ? detalles : null,
        movPosicionLinea: row.LineasPosicion,
        unidadBase: row.UnidadBase,
        unidadAlternativa: row.UnidadAlternativa,
        factorConversion: row.FactorConversion,
        unidadPedido: row.UnidadPedido,
        precio: row.Precio,
        pesoUnitario: row.PesoUnitario,
        pesoTotalLinea: row.PesoTotalLinea,
        grupoTalla: row.GrupoTalla_
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

// ✅ 5.3 ACTUALIZAR LÍNEA DE PEDIDO (VERSIÓN COMPLETA - ACTUALIZA UNIDADES SERVIDAS)
app.post('/actualizarLineaPedido', async (req, res) => {
  const datosLinea = req.body;

  console.log('[BACKEND DEBUG] Datos recibidos para actualizar línea:', {
    codigoArticulo: datosLinea.codigoArticulo,
    unidadMedida: datosLinea.unidadMedida,
    cantidadExpedida: datosLinea.cantidadExpedida,
    movPosicionLinea: datosLinea.movPosicionLinea,
    ubicacion: datosLinea.ubicacion,
    almacen: datosLinea.almacen,
    codigoColor: datosLinea.codigoColor,
    codigoTalla: datosLinea.codigoTalla,
    esZonaDescarga: datosLinea.esZonaDescarga
  });

  // Campos obligatorios
  const camposRequeridos = [
    'codigoEmpresa', 'ejercicio', 'numeroPedido', 
    'codigoArticulo', 'cantidadExpedida', 'ubicacion', 'almacen',
    'movPosicionLinea'
  ];
  
  for (const campo of camposRequeridos) {
    if (!datosLinea[campo]) {
      return res.status(400).json({ 
        success: false, 
        mensaje: `Campo requerido: ${campo}` 
      });
    }
  }

  const truncarString = (valor, longitudMaxima) => {
    if (!valor) return '';
    return valor.toString().substring(0, longitudMaxima);
  };

  const codigoColor = datosLinea.codigoColor ? truncarString(datosLinea.codigoColor, 10) : '';
  const codigoTalla = datosLinea.codigoTalla ? truncarString(datosLinea.codigoTalla, 10) : '';
  const partida = datosLinea.partida ? truncarString(datosLinea.partida, 20) : '';
  const esZonaDescarga = datosLinea.esZonaDescarga || datosLinea.ubicacion === "Zona descarga";

  const transaction = new sql.Transaction(poolGlobal);
  
  try {
    await transaction.begin();
    
    // OBTENER DATOS USANDO SOLO LineasPosicion COMO ID ÚNICO
    const requestLinea = new sql.Request(transaction);
    const resultLinea = await requestLinea
      .input('movPosicionLinea', sql.VarChar, datosLinea.movPosicionLinea)
      .query(`
        SELECT 
          l.LineasPosicion,
          l.CodigoAlmacen, 
          l.UnidadMedida1_ AS UnidadMedida, 
          l.Precio, 
          l.UnidadesPendientes,
          l.UnidadesServidas,
          l.GrupoTalla_,
          l.EjercicioPedido,
          l.NumeroPedido,
          l.SeriePedido,
          l.CodigoEmpresa,
          l.CodigoArticulo,
          a.UnidadMedida2_ AS UnidadBase,
          a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          a.FactorConversion_ AS FactorConversion
        FROM LineasPedidoCliente l
        INNER JOIN Articulos a ON a.CodigoArticulo = l.CodigoArticulo AND a.CodigoEmpresa = l.CodigoEmpresa
        WHERE l.LineasPosicion = @movPosicionLinea
      `);

    if (resultLinea.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        mensaje: `Línea de pedido no encontrada con LineasPosicion: ${datosLinea.movPosicionLinea}` 
      });
    }

    const lineaData = resultLinea.recordset[0];
    const codigoAlmacen = lineaData.CodigoAlmacen;
    
    const unidadMedida = lineaData.UnidadMedida || 'unidades';
    const precio = lineaData.Precio;
    const unidadesPendientes = parseFloat(lineaData.UnidadesPendientes);
    const unidadesServidas = parseFloat(lineaData.UnidadesServidas) || 0;
    const movPosicionLinea = lineaData.LineasPosicion;
    
    const grupoTalla = lineaData.GrupoTalla_ ? 
                      (typeof lineaData.GrupoTalla_ === 'number' ? 
                       lineaData.GrupoTalla_.toString() : 
                       lineaData.GrupoTalla_) : 
                      null;

    console.log('[BACKEND DEBUG] Datos de línea corregidos:', {
      articulo: datosLinea.codigoArticulo,
      unidadMedida: unidadMedida,
      unidadesPendientes: unidadesPendientes,
      unidadesServidas: unidadesServidas,
      movPosicionLinea: movPosicionLinea,
      grupoTalla: grupoTalla
    });

    // VALIDACIÓN DE UNIDADES PENDIENTES
    if (datosLinea.cantidadExpedida > unidadesPendientes) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        mensaje: `La cantidad a expedir (${datosLinea.cantidadExpedida}) supera las unidades pendientes (${unidadesPendientes}).` 
      });
    }

    // ✅ CORRECCIÓN: NO HACER CONVERSIÓN DE UNIDADES - USAR CANTIDAD DIRECTA
    const cantidadExpedidaStock = datosLinea.cantidadExpedida;

    console.log('[BACKEND DEBUG] Expedición sin conversión:', {
      cantidadExpedida: datosLinea.cantidadExpedida,
      cantidadExpedidaStock: cantidadExpedidaStock
    });

    // VERIFICAR STOCK SOLO SI NO ES ZONA DESCARGA
    let ubicacionFinal = datosLinea.ubicacion;
    let partidaFinal = partida;
    
    if (!esZonaDescarga) {
      console.log('[BACKEND DEBUG] Verificando stock para ubicación:', ubicacionFinal);
      
      const requestStock = new sql.Request(transaction);
      const stockResult = await requestStock
        .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
        .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
        .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
        .input('ubicacion', sql.VarChar(20), truncarString(datosLinea.ubicacion, 20))
        .input('partida', sql.VarChar(20), truncarString(partida, 20))
        .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
        .input('codigoColor', sql.VarChar(10), codigoColor)
        .input('codigoTalla', sql.VarChar(10), codigoTalla)
        .query(`
          SELECT UnidadSaldoTipo_
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
        const stockData = stockResult.recordset[0];
        stockDisponible = parseFloat(stockData.UnidadSaldoTipo_) || 0;
      }

      console.log('[BACKEND DEBUG] Stock disponible:', stockDisponible, 'Cantidad a expedir:', cantidadExpedidaStock);

      if (stockDisponible === 0) {
        const stockAlternativoRequest = new sql.Request(transaction);
        const stockAlternativoResult = await stockAlternativoRequest
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
          .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
          .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
          .input('codigoColor', sql.VarChar(10), codigoColor)
          .input('codigoTalla', sql.VarChar(10), codigoTalla)
          .query(`
            SELECT TOP 1 Ubicacion, UnidadSaldoTipo_, Partida
            FROM AcumuladoStockUbicacion
            WHERE 
              CodigoEmpresa = @codigoEmpresa
              AND CodigoAlmacen = @almacen
              AND CodigoArticulo = @codigoArticulo
              AND UnidadSaldoTipo_ > 0
              AND (TipoUnidadMedida_ = @unidadMedida OR (@unidadMedida = 'unidades' AND (TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '')))
              AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
              AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
              AND Periodo = 99
            ORDER BY UnidadSaldoTipo_ DESC
          `);

        if (stockAlternativoResult.recordset.length > 0) {
          const ubicacionAlternativa = stockAlternativoResult.recordset[0];
          stockDisponible = parseFloat(ubicacionAlternativa.UnidadSaldoTipo_) || 0;
          ubicacionFinal = ubicacionAlternativa.Ubicacion;
          partidaFinal = ubicacionAlternativa.Partida || '';
        } else {
          await transaction.rollback();
          return res.status(400).json({ 
            success: false, 
            mensaje: `No hay stock disponible en ninguna ubicación. Stock disponible: 0 unidades.` 
          });
        }
      }

      if (cantidadExpedidaStock > stockDisponible) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false, 
          mensaje: `No hay suficiente stock en ${ubicacionFinal}. Solo hay ${stockDisponible} unidades disponibles.` 
        });
      }
    }

    // ✅ CORRECCIÓN CRÍTICA: ACTUALIZAR UNIDADES PENDIENTES Y UNIDADES SERVIDAS
    const requestUpdate = new sql.Request(transaction);
    await requestUpdate
      .input('cantidadExpedida', sql.Decimal(18, 4), datosLinea.cantidadExpedida)
      .input('movPosicionLinea', sql.VarChar, movPosicionLinea)
      .query(`
        UPDATE LineasPedidoCliente
        SET 
          UnidadesPendientes = UnidadesPendientes - @cantidadExpedida,
          UnidadesServidas = UnidadesServidas + @cantidadExpedida
        WHERE LineasPosicion = @movPosicionLinea
      `);

    console.log('[BACKEND DEBUG] Línea actualizada - Unidades pendientes reducidas y servidas incrementadas');

    // ACTUALIZAR STOCK EN AMBAS TABLAS
    if (!esZonaDescarga) {
      console.log('[BACKEND DEBUG] Actualizando stock en ubicación:', ubicacionFinal);
      
      const requestStockActual = new sql.Request(transaction);
      const stockActualResult = await requestStockActual
        .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
        .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
        .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
        .input('ubicacion', sql.VarChar(20), truncarString(ubicacionFinal, 20))
        .input('partida', sql.VarChar(20), truncarString(partidaFinal, 20))
        .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
        .input('codigoColor', sql.VarChar(10), codigoColor)
        .input('codigoTalla', sql.VarChar(10), codigoTalla)
        .query(`
          SELECT UnidadSaldo, UnidadSaldoTipo_
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

      if (stockActualResult.recordset.length > 0) {
        const stockActualData = stockActualResult.recordset[0];
        
        const stockActualUnidadSaldo = parseFloat(stockActualData.UnidadSaldo) || 0;
        const stockActualUnidadSaldoTipo = parseFloat(stockActualData.UnidadSaldoTipo_) || 0;
        
        const nuevoStockUnidadSaldo = Math.max(0, stockActualUnidadSaldo - cantidadExpedidaStock);
        const nuevoStockUnidadSaldoTipo = Math.max(0, stockActualUnidadSaldoTipo - cantidadExpedidaStock);

        const requestUpdateStockUbicacion = new sql.Request(transaction);
        await requestUpdateStockUbicacion
          .input('nuevoStockUnidadSaldo', sql.Decimal(18, 4), nuevoStockUnidadSaldo)
          .input('nuevoStockUnidadSaldoTipo', sql.Decimal(18, 4), nuevoStockUnidadSaldoTipo)
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
          .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
          .input('ubicacion', sql.VarChar(20), truncarString(ubicacionFinal, 20))
          .input('partida', sql.VarChar(20), truncarString(partidaFinal, 20))
          .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
          .input('codigoColor', sql.VarChar(10), codigoColor)
          .input('codigoTalla', sql.VarChar(10), codigoTalla)
          .query(`
            UPDATE AcumuladoStockUbicacion
            SET 
              UnidadSaldo = @nuevoStockUnidadSaldo,
              UnidadSaldoTipo_ = @nuevoStockUnidadSaldoTipo
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

        const requestStockPrincipal = new sql.Request(transaction);
        const stockPrincipalResult = await requestStockPrincipal
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
          .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
          .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
          .input('partida', sql.VarChar(20), truncarString(partidaFinal, 20))
          .input('codigoColor', sql.VarChar(10), codigoColor)
          .input('codigoTalla', sql.VarChar(10), codigoTalla)
          .input('ubicacion', sql.VarChar(20), truncarString(ubicacionFinal, 20))
          .query(`
            SELECT UnidadSaldo, UnidadSaldoTipo_
            FROM AcumuladoStock
            WHERE 
              CodigoEmpresa = @codigoEmpresa
              AND CodigoAlmacen = @almacen
              AND CodigoArticulo = @codigoArticulo
              AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
              AND (TipoUnidadMedida_ = @unidadMedida OR (@unidadMedida = 'unidades' AND (TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '')))
              AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
              AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
              AND Ubicacion = @ubicacion
              AND Periodo = 99
          `);

        if (stockPrincipalResult.recordset.length > 0) {
          const stockPrincipalData = stockPrincipalResult.recordset[0];
          
          const stockPrincipalUnidadSaldo = parseFloat(stockPrincipalData.UnidadSaldo) || 0;
          const stockPrincipalUnidadSaldoTipo = parseFloat(stockPrincipalData.UnidadSaldoTipo_) || 0;
          
          const nuevoStockPrincipalUnidadSaldo = Math.max(0, stockPrincipalUnidadSaldo - cantidadExpedidaStock);
          const nuevoStockPrincipalUnidadSaldoTipo = Math.max(0, stockPrincipalUnidadSaldoTipo - cantidadExpedidaStock);

          const requestUpdateStockPrincipal = new sql.Request(transaction);
          await requestUpdateStockPrincipal
            .input('nuevoStockUnidadSaldo', sql.Decimal(18, 4), nuevoStockPrincipalUnidadSaldo)
            .input('nuevoStockUnidadSaldoTipo', sql.Decimal(18, 4), nuevoStockPrincipalUnidadSaldoTipo)
            .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
            .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
            .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
            .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
            .input('partida', sql.VarChar(20), truncarString(partidaFinal, 20))
            .input('codigoColor', sql.VarChar(10), codigoColor)
            .input('codigoTalla', sql.VarChar(10), codigoTalla)
            .input('ubicacion', sql.VarChar(20), truncarString(ubicacionFinal, 20))
            .query(`
              UPDATE AcumuladoStock
              SET 
                UnidadSaldo = @nuevoStockUnidadSaldo,
                UnidadSaldoTipo_ = @nuevoStockUnidadSaldoTipo
              WHERE 
                CodigoEmpresa = @codigoEmpresa
                AND CodigoAlmacen = @almacen
                AND CodigoArticulo = @codigoArticulo
                AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                AND (TipoUnidadMedida_ = @unidadMedida OR (@unidadMedida = 'unidades' AND (TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '')))
                AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
                AND Ubicacion = @ubicacion
                AND Periodo = 99
            `);
        }
      }
    }

    // ACTUALIZAR TABLA DE TALLAS SI ES NECESARIO
    if (codigoColor && grupoTalla && codigoTalla) {
      console.log('[BACKEND DEBUG] Actualizando tallas con:', {
        grupoTalla: grupoTalla,
        codigoColor: codigoColor,
        codigoTalla: codigoTalla,
        cantidad: datosLinea.cantidadExpedida
      });

      try {
        const grupoTallasRequest = new sql.Request(transaction);
        
        let grupoTallaParam;
        if (grupoTalla && !isNaN(grupoTalla)) {
          grupoTallaParam = sql.Int;
        } else {
          grupoTallaParam = sql.VarChar;
        }
        
        const grupoTallasResult = await grupoTallasRequest
          .input('grupoTalla', grupoTallaParam, grupoTalla)
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .query(`
            SELECT CodigoTalla01_, CodigoTalla02_, CodigoTalla03_, CodigoTalla04_
            FROM GrupoTallas_
            WHERE GrupoTalla_ = @grupoTalla
              AND CodigoEmpresa = @codigoEmpresa
          `);

        if (grupoTallasResult.recordset.length > 0) {
          const grupoTallas = grupoTallasResult.recordset[0];
          let columnaTalla = '';
          
          if (grupoTallas.CodigoTalla01_ === codigoTalla) {
            columnaTalla = 'UnidadesTalla01_';
          } else if (grupoTallas.CodigoTalla02_ === codigoTalla) {
            columnaTalla = 'UnidadesTalla02_';
          } else if (grupoTallas.CodigoTalla03_ === codigoTalla) {
            columnaTalla = 'UnidadesTalla03_';
          } else if (grupoTallas.CodigoTalla04_ === codigoTalla) {
            columnaTalla = 'UnidadesTalla04_';
          }
          
          if (columnaTalla) {
            console.log(`[BACKEND DEBUG] Actualizando columna: ${columnaTalla} para talla: ${codigoTalla}`);
            
            const updateTallasRequest = new sql.Request(transaction);
            await updateTallasRequest
              .input('cantidadExpedida', sql.Decimal(18, 4), datosLinea.cantidadExpedida)
              .input('movPosicionLinea', sql.VarChar, movPosicionLinea)
              .input('codigoColor', sql.VarChar, codigoColor)
              .query(`
                UPDATE LineasPedidoClienteTallas
                SET 
                  ${columnaTalla} = ${columnaTalla} - @cantidadExpedida,
                  UnidadesTotalTallas_ = UnidadesTotalTallas_ - @cantidadExpedida
                WHERE MovPosicionLinea_ = @movPosicionLinea
                  AND CodigoColor_ = @codigoColor
              `);
          }
        }
      } catch (tallasError) {
        console.error('[ERROR ACTUALIZAR TALLAS]', tallasError);
      }
    }

    await transaction.commit();

    // CALCULAR NUEVOS VALORES
    const nuevasUnidadesPendientes = unidadesPendientes - datosLinea.cantidadExpedida;
    const nuevasUnidadesServidas = unidadesServidas + datosLinea.cantidadExpedida;

    res.json({ 
      success: true, 
      mensaje: 'Línea actualizada correctamente',
      detalles: {
        cantidadExpedidaVenta: datosLinea.cantidadExpedida,
        cantidadExpedidaStock: cantidadExpedidaStock,
        unidadesPendientesRestantes: nuevasUnidadesPendientes,
        unidadesServidasActualizadas: nuevasUnidadesServidas,
        stockRestante: esZonaDescarga ? 'N/A (Zona Descarga)' : 'Actualizado',
        ubicacionUtilizada: ubicacionFinal,
        tallasActualizadas: !!(codigoColor && grupoTalla && codigoTalla),
        unidadMedida: unidadMedida
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
      detalles: err.stack
    });
  }
});

// ✅ GENERAR ALBARÁN PARCIAL (ACTUALIZADO)
app.post('/generarAlbaranParcial', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroPedido } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroPedido) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos: empresa, ejercicio y número de pedido.' 
    });
  }

  const transaction = new sql.Transaction(poolGlobal);
  
  try {
    await transaction.begin();

    // 1. Verificar permisos del usuario
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
      await transaction.rollback();
      return res.status(403).json({ 
        success: false, 
        mensaje: 'No tienes permiso para generar albaranes' 
      });
    }

    // 2. Obtener el pedido con datos completos
    const pedidoResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT 
          cpc.*,
          cli.NombreObra,
          cli.Vendedor,
          cli.Contacto,
          cli.Telefono,
          cli.ObservacionesWeb
        FROM CabeceraPedidoCliente cpc
        LEFT JOIN Clientes cli ON cpc.CodigoCliente = cli.CodigoCliente 
          AND cpc.CodigoEmpresa = cli.CodigoEmpresa
        WHERE cpc.CodigoEmpresa = @codigoEmpresa
          AND cpc.EjercicioPedido = @ejercicio
          AND (cpc.SeriePedido = @serie OR (@serie = '' AND cpc.SeriePedido IS NULL))
          AND cpc.NumeroPedido = @numeroPedido
      `);

    if (pedidoResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Pedido no encontrado' 
      });
    }

    const pedido = pedidoResult.recordset[0];

    // 3. Obtener TODAS las líneas del pedido (incluyendo completadas y parciales)
    const lineasResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT 
          lpc.*,
          a.UnidadBase,
          a.UnidadAlternativa,
          a.FactorConversion
        FROM LineasPedidoCliente lpc
        LEFT JOIN Articulos a ON lpc.CodigoArticulo = a.CodigoArticulo 
          AND lpc.CodigoEmpresa = a.CodigoEmpresa
        WHERE lpc.CodigoEmpresa = @codigoEmpresa
          AND lpc.EjercicioPedido = @ejercicio
          AND (lpc.SeriePedido = @serie OR (@serie = '' AND lpc.SeriePedido IS NULL))
          AND lpc.NumeroPedido = @numeroPedido
          AND (lpc.UnidadesServidas > 0 OR lpc.UnidadesPendientes > 0)  -- Incluir líneas con expediciones
      `);

    if (lineasResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        mensaje: 'No hay líneas con expediciones para generar albarán parcial' 
      });
    }

    // 4. Verificar si hay líneas completadas (para determinar si es parcial)
    const lineasCompletadas = lineasResult.recordset.filter(linea => 
      parseFloat(linea.UnidadesServidas) > 0
    ).length;

    const esAlbaranParcial = lineasCompletadas > 0;

    // 5. Generar número de albarán
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
    const fechaActual = new Date();

    // 6. Crear cabecera del albarán
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, pedido.CodigoCliente)
      .input('razonSocial', sql.VarChar, pedido.RazonSocial)
      .input('domicilio', sql.VarChar, pedido.Domicilio)
      .input('municipio', sql.VarChar, pedido.Municipio)
      .input('fecha', sql.DateTime, fechaActual)
      .input('numeroLineas', sql.Int, lineasResult.recordset.length)
      .input('importeLiquido', sql.Decimal(18,4), pedido.ImporteLiquido || 0)
      .input('empleadoAsignado', sql.VarChar, pedido.CodigoEmpleadoAsignado || usuario)
      .input('contacto', sql.VarChar, pedido.Contacto || '')
      .input('telefonoContacto', sql.VarChar, pedido.Telefono || '')
      .input('observacionesWeb', sql.VarChar, pedido.ObservacionesWeb || '')
      .input('nombreObra', sql.VarChar, pedido.NombreObra || '')
      .input('vendedor', sql.VarChar, pedido.Vendedor || '')
      .input('statusFacturado', sql.SmallInt, 0)
      .input('esVoluminoso', sql.Bit, pedido.EsVoluminoso || 0)
      .input('esParcial', sql.Bit, esAlbaranParcial ? 1 : 0)
      .input('ejercicioPedido', sql.SmallInt, ejercicio)
      .input('seriePedido', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
          NumeroLineas, ImporteLiquido, EmpleadoAsignado,
          Contacto, Telefono, ObservacionesWeb, NombreObra, Vendedor,
          StatusFacturado, EsVoluminoso, EsParcial,
          EjercicioPedido, SeriePedido, NumeroPedido
        ) VALUES (
          @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
          @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
          @numeroLineas, @importeLiquido, @empleadoAsignado,
          @contacto, @telefonoContacto, @observacionesWeb, @nombreObra, @vendedor,
          @statusFacturado, @esVoluminoso, @esParcial,
          @ejercicioPedido, @seriePedido, @numeroPedido
        )
      `);

    // 7. Copiar las líneas al albarán (usar unidades servidas si existen, sino pendientes)
    for (const [index, linea] of lineasResult.recordset.entries()) {
      // Para albarán parcial, usar unidades servidas; para completo, usar pendientes
      const unidadesAExpedir = linea.UnidadesServidas > 0 ? linea.UnidadesServidas : linea.UnidadesPendientes;
      
      await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, serie || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, index + 1)
        .input('codigoArticulo', sql.VarChar, linea.CodigoArticulo)
        .input('descripcionArticulo', sql.VarChar, linea.DescripcionArticulo)
        .input('unidades', sql.Decimal(18,4), unidadesAExpedir)
        .input('precio', sql.Decimal(18,4), linea.Precio)
        .input('codigoAlmacen', sql.VarChar, linea.CodigoAlmacen || '')
        .input('partida', sql.VarChar, linea.Partida || '')
        .input('unidadMedida', sql.VarChar, linea.UnidadPedido || linea.UnidadBase || '')
        .input('unidadBase', sql.VarChar, linea.UnidadBase || '')
        .input('unidadAlternativa', sql.VarChar, linea.UnidadAlternativa || '')
        .input('factorConversion', sql.Decimal(18,4), linea.FactorConversion || 1)
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, CodigoArticulo, DescripcionArticulo, Unidades, Precio,
            CodigoAlmacen, Partida, UnidadMedida, UnidadBase, UnidadAlternativa, FactorConversion
          ) VALUES (
            @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
            @orden, @codigoArticulo, @descripcionArticulo, @unidades, @precio,
            @codigoAlmacen, @partida, @unidadMedida, @unidadBase, @unidadAlternativa, @factorConversion
          )
        `);
    }

    // 8. Actualizar estado del pedido
    // Verificar si quedan líneas pendientes después de la expedición
    const lineasPendientesResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT COUNT(*) as TotalPendientes
        FROM LineasPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
          AND UnidadesPendientes > 0
      `);

    const totalPendientes = lineasPendientesResult.recordset[0].TotalPendientes;

    if (totalPendientes > 0) {
      // Si quedan pendientes, marcar como parcial (Estado = 4)
      await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, serie || '')
        .input('numeroPedido', sql.Int, numeroPedido)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET Estado = 4,  -- Parcial
              Status = 'Parcial'
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
    } else {
      // Si no quedan pendientes, marcar como completado (Estado = 1)
      await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, serie || '')
        .input('numeroPedido', sql.Int, numeroPedido)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET Estado = 1,  -- Completado
              Status = 'Completado',
              FechaCompletado = GETDATE()
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
    }

    await transaction.commit();

    res.json({ 
      success: true,
      mensaje: esAlbaranParcial ? 'Albarán parcial generado correctamente' : 'Albarán completo generado correctamente',
      albaran: {
        ejercicio: ejercicio,
        serie: serie || '',
        numero: numeroAlbaran,
        esParcial: esAlbaranParcial,
        lineasProcesadas: lineasResult.recordset.length
      }
    });
  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR GENERAR ALBARAN PARCIAL]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al generar albarán parcial',
      error: err.message 
    });
  }
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

// ✅ 7.1 GENERAR ALBARÁN AL ASIGNAR REPARTIDOR - CORREGIDO PARA LÍNEAS COMPLETADAS
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

    // 2. Obtener datos del pedido INCLUYENDO LÍNEAS COMPLETADAS
    const pedidoResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT 
          p.EjercicioPedido, p.SeriePedido, p.CodigoCliente, p.RazonSocial, 
          p.Domicilio, p.Municipio, p.NumeroLineas, p.ImporteLiquido, p.NombreObra,
          p.Contacto, p.Telefono AS TelefonoContacto, p.EsVoluminoso,
          -- Calcular líneas pendientes para determinar si es parcial
          (SELECT COUNT(*) FROM LineasPedidoCliente l 
           WHERE l.CodigoEmpresa = p.CodigoEmpresa
             AND l.EjercicioPedido = p.EjercicioPedido
             AND l.SeriePedido = p.SeriePedido
             AND l.NumeroPedido = p.NumeroPedido
             AND l.UnidadesPendientes > 0) AS LineasPendientes
        FROM CabeceraPedidoCliente p
        WHERE p.CodigoEmpresa = @codigoEmpresa
          AND p.NumeroPedido = @numeroPedido
          AND p.Estado = 1  -- Pedido preparado
      `);

    if (pedidoResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Pedido no encontrado o no está preparado' 
      });
    }

    const pedido = pedidoResult.recordset[0];
    const ejercicio = new Date().getFullYear();
    const esAlbaranParcial = pedido.LineasPendientes > 0;

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
      .input('NombreObra', sql.VarChar, pedido.NombreObra || '')
      .input('contacto', sql.VarChar, pedido.Contacto || '')
      .input('telefonoContacto', sql.VarChar, pedido.TelefonoContacto || '')
      .input('statusFacturado', sql.SmallInt, 0)
      .input('esVoluminoso', sql.Bit, pedido.EsVoluminoso || 0)
      .input('esParcial', sql.Bit, esAlbaranParcial)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
          NumeroLineas, ImporteLiquido, EmpleadoAsignado,
          NombreObra, Contacto, Telefono, StatusFacturado, EsVoluminoso, EsParcial
        ) VALUES (
          @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
          @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
          @numeroLineas, @importeLiquido, @empleadoAsignado,
          @NombreObra, @contacto, @telefonoContacto, @statusFacturado, @esVoluminoso, @esParcial
        )
      `);

    // 5. Copiar TODAS las líneas del pedido al albarán (incluyendo completadas)
    const lineas = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, pedido.EjercicioPedido)
      .input('serie', sql.VarChar, pedido.SeriePedido || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT 
          CodigoArticulo, DescripcionArticulo, 
          CASE WHEN UnidadesPendientes > 0 THEN UnidadesPendientes ELSE UnidadesServidas END as Unidades,
          Precio, CodigoAlmacen, Partida, UnidadPedido
        FROM LineasPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND SeriePedido = @serie
          AND NumeroPedido = @numeroPedido
          AND (UnidadesServidas > 0 OR UnidadesPendientes > 0)  -- Incluir líneas con expediciones
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
        .input('unidades', sql.Decimal(18,4), linea.Unidades)
        .input('precio', sql.Decimal(18,4), linea.Precio)
        .input('codigoAlmacen', sql.VarChar, linea.CodigoAlmacen || '')
        .input('partida', sql.VarChar, linea.Partida || '')
        .input('unidadMedida', sql.VarChar, linea.UnidadPedido || '')
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, CodigoArticulo, DescripcionArticulo, Unidades, Precio,
            CodigoAlmacen, Partida, UnidadMedida
          ) VALUES (
            @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
            @orden, @codigoArticulo, @descripcionArticulo, @unidades, @precio,
            @codigoAlmacen, @partida, @unidadMedida
          )
        `);
    }

    // 6. Actualizar estado del pedido SOLO si está completamente completado
    if (!esAlbaranParcial) {
      await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('numeroPedido', sql.Int, numeroPedido)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET Estado = 2, Status = 'Servido'
          WHERE CodigoEmpresa = @codigoEmpresa
            AND NumeroPedido = @numeroPedido
        `);
    }

    res.json({ 
      success: true,
      mensaje: esAlbaranParcial ? 'Albarán parcial generado correctamente' : 'Albarán completo generado correctamente',
      albaran: {
        ejercicio,
        serie: pedido.SeriePedido || '',
        numero: numeroAlbaran,
        repartidor: codigoRepartidor,
        esVoluminoso: pedido.EsVoluminoso || false,
        esParcial: esAlbaranParcial
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

// ✅ ENDPOINT PARA EXPEDICIÓN OPTIMIZADA
app.post('/expedir-articulo', async (req, res) => {
  const { 
    codigoEmpresa, ejercicio, serie, numeroPedido, 
    codigoArticulo, cantidad, almacen, ubicacion, partida, unidadMedida 
  } = req.body;

  try {
    const transaction = new sql.Transaction(poolGlobal);
    await transaction.begin();

    // 1. Actualizar línea del pedido
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('cantidad', sql.Decimal(18,4), cantidad)
      .query(`
        UPDATE LineasPedidoCliente
        SET UnidadesServidas = ISNULL(UnidadesServidas, 0) + @cantidad,
            UnidadesPendientes = UnidadesPedidas - (ISNULL(UnidadesServidas, 0) + @cantidad)
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND SeriePedido = @serie
          AND NumeroPedido = @numeroPedido
          AND CodigoArticulo = @codigoArticulo
      `);

    // 2. Obtener nuevo estado de la línea
    const lineaActualizada = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT UnidadesPendientes, UnidadesServidas
        FROM LineasPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND SeriePedido = @serie
          AND NumeroPedido = @numeroPedido
          AND CodigoArticulo = @codigoArticulo
      `);

    await transaction.commit();

    res.json({
      success: true,
      nuevoPendiente: lineaActualizada.recordset[0]?.UnidadesPendientes || 0,
      totalServido: lineaActualizada.recordset[0]?.UnidadesServidas || 0
    });

  } catch (error) {
    await transaction.rollback();
    console.error('[ERROR EXPEDIR ARTICULO]', error);
    res.status(500).json({
      success: false,
      mensaje: 'Error al expedir artículo',
      error: error.message
    });
  }
});

// ✅ 7.2 ALBARANES PENDIENTES (VERSIÓN SIN JOIN - MÁS SEGURA)
app.get('/api/albaranesPendientes', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  
  try {
    const query = `
      SELECT 
        NumeroAlbaran, 
        SerieAlbaran, 
        EjercicioAlbaran,
        CodigoEmpresa,
        FechaAlbaran, 
        CodigoCliente, 
        RazonSocial, 
        Domicilio, 
        Municipio, 
        ImporteLiquido,
        StatusFacturado,
        EmpleadoAsignado,
        NombreObra,
        Contacto,
        Telefono,
        FormaEnvio,
        EsVoluminoso,
        EjercicioPedido,
        SeriePedido,
        NumeroPedido
      FROM CabeceraAlbaranCliente
      WHERE CodigoEmpresa = @codigoEmpresa
        AND StatusFacturado = 0
        AND FechaAlbaran >= DATEADD(DAY, -30, GETDATE())
        AND FormaEnvio = 3  -- Solo nuestros medios
      ORDER BY FechaAlbaran DESC
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
            Orden AS orden,
            CodigoArticulo AS codigo,
            DescripcionArticulo AS nombre,
            Unidades AS cantidad,
            Unidades AS cantidadEntregada
          FROM LineasAlbaranCliente
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioAlbaran = @ejercicio
            AND SerieAlbaran = @serie
            AND NumeroAlbaran = @numeroAlbaran
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
        nombreObra: cabecera.NombreObra,
        contacto: cabecera.Contacto,
        telefonoContacto: cabecera.Telefono,
        FormaEnvio: cabecera.FormaEnvio,
        EsVoluminoso: cabecera.EsVoluminoso,
        NumeroPedido: cabecera.NumeroPedido,
        articulos: lineas.recordset.map(art => ({
          ...art,
          cantidadOriginal: art.cantidad,
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
          p.NombreObra,
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

// ✅ 7.7 COMPLETAR ALBARÁN CON FIRMAS (NUEVO)
app.post('/completarAlbaranConFirmas', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { 
    codigoEmpresa, 
    ejercicio, 
    serie, 
    numeroAlbaran, 
    firmaCliente,
    firmaRepartidor,
    observaciones 
  } = req.body;
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
        SELECT EmpleadoAsignado, StatusFacturado
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
    
    if (albaran.StatusFacturado === -1) {
      return res.status(400).json({ 
        success: false, 
        mensaje: 'El albarán ya está completado' 
      });
    }
    
    if (!esAdmin && !esUsuarioAvanzado) {
      if (albaran.EmpleadoAsignado !== usuario) {
        return res.status(403).json({ 
          success: false, 
          mensaje: 'No tienes permiso para completar este albarán' 
        });
      }
    }

    // 3. Actualizar albarán con firmas y estado completado
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('firmaCliente', sql.Text, firmaCliente)
      .input('firmaRepartidor', sql.Text, firmaRepartidor)
      .input('observaciones', sql.VarChar, observaciones || '')
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET StatusFacturado = -1,
            FirmaCliente = @firmaCliente,
            FirmaRepartidor = @firmaRepartidor,
            ObservacionesAlbaran = COALESCE(ObservacionesAlbaran, '') + 
              CASE WHEN @observaciones != '' THEN 
                CHAR(13) + CHAR(10) + 'Observaciones entrega: ' + @observaciones 
              ELSE '' END,
            FechaEntrega = GETDATE()
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    res.json({ 
      success: true, 
      mensaje: 'Albarán completado con firmas correctamente'
    });
  } catch (err) {
    console.error('[ERROR COMPLETAR ALBARÁN CON FIRMAS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al completar albarán con firmas',
      error: err.message
    });
  }
});

// ✅ 7.8 OBTENER ALBARANES COMPLETADOS (ACTUALIZADO SOLO CON NOMBRE NombreObra)
app.get('/albaranesCompletados', async (req, res) => {
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
        cac.NombreObra, -- ✅ SOLO NOMBRE OBRA
        cac.Contacto,
        cac.Telefono AS TelefonoContacto,
        cac.FormaEnvio,
        cac.EsVoluminoso,
        cac.ObservacionesAlbaran,
        ISNULL(cac.FirmaCliente, '') as FirmaCliente,
        ISNULL(cac.FirmaRepartidor, '') as FirmaRepartidor
      FROM CabeceraAlbaranCliente cac
      WHERE cac.CodigoEmpresa = @codigoEmpresa
        AND cac.StatusFacturado = -1
        AND cac.FechaAlbaran >= DATEADD(DAY, -30, GETDATE())
        AND cac.FormaEnvio = 3  -- Solo nuestros medios
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
            lac.Unidades AS cantidad
          FROM LineasAlbaranCliente lac
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
        nombreObra: cabecera.NombreObra, // ✅ SOLO NOMBRE OBRA
        contacto: cabecera.Contacto,
        telefonoContacto: cabecera.TelefonoContacto,
        FormaEnvio: cabecera.FormaEnvio,
        EsVoluminoso: cabecera.EsVoluminoso,
        tieneFirmaCliente: cabecera.FirmaCliente && cabecera.FirmaCliente.length > 10,
        tieneFirmaRepartidor: cabecera.FirmaRepartidor && cabecera.FirmaRepartidor.length > 10,
        firmaCliente: cabecera.FirmaCliente,
        firmaRepartidor: cabecera.FirmaRepartidor,
        observaciones: cabecera.ObservacionesAlbaran,
        articulos: lineas.recordset
      };
    }));

    res.json(albaranesConLineas);
  } catch (err) {
    console.error('[ERROR OBTENER ALBARANES COMPLETADOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener albaranes completados',
      error: err.message 
    });
  }
});

// ✅ 7.9 REVERTIR ALBARÁN COMPLETADO (NUEVO)
app.post('/revertirAlbaran', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { 
    codigoEmpresa, 
    ejercicio, 
    serie, 
    numeroAlbaran 
  } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroAlbaran) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos.' 
    });
  }

  try {
    // 1. Verificar permisos de administrador
    const permisoResult = await poolGlobal.request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
      `);

    if (permisoResult.recordset.length === 0 || permisoResult.recordset[0].StatusAdministrador !== -1) {
      return res.status(403).json({ 
        success: false, 
        mensaje: 'Solo los administradores pueden revertir albaranes' 
      });
    }

    // 2. Verificar que el albarán existe y está completado
    const albaranResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .query(`
        SELECT StatusFacturado
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

    if (albaranResult.recordset[0].StatusFacturado !== -1) {
      return res.status(400).json({ 
        success: false, 
        mensaje: 'El albarán no está completado' 
      });
    }

    // 3. Revertir el estado a pendiente
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET StatusFacturado = 0,
            FechaEntrega = NULL
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    res.json({ 
      success: true, 
      mensaje: 'Albarán revertido correctamente, ahora aparecerá en gestión de rutas'
    });
  } catch (err) {
    console.error('[ERROR REVERTIR ALBARÁN]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al revertir albarán',
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
        cac.NombreObra,
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
          cac.NombreObra,
          cac.StatusFacturado,
          cpc.FormaEnvio
        FROM CabeceraAlbaranCliente cac
        INNER JOIN CabeceraPedidoCliente cpc ON 
          cac.CodigoEmpresa = cpc.CodigoEmpresa 
          AND cac.EjercicioPedido = cpc.EjercicioPedido
          AND cac.SeriePedido = cpc.SeriePedido
          AND cac.NumeroPedido = cpc.NumeroPedido
        WHERE cac.CodigoEmpresa = @codigoEmpresa
          AND cac.StatusFacturado = -1
          AND cac.FechaAlbaran >= DATEADD(DAY, -7, GETDATE())
          AND cpc.FormaEnvio = 3  -- Solo nuestros medios
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
// ✅ SISTEMA DE SINCRONIZACIÓN AUTOMÁTICA CADA 3 HORAS (SIN LOGS)
// ============================================

// ✅ FUNCIÓN PRINCIPAL DE SINCRONIZACIÓN
async function sincronizacionAutomatica() {
  console.log('🔄 [SYNC AUTO] Iniciando sincronización automática...');
  
  try {
    // Verificar que poolGlobal esté conectado
    if (!poolGlobal || !poolGlobal.connected) {
      console.log('⏳ [SYNC AUTO] Esperando conexión a BD...');
      return;
    }

    // Obtener todas las empresas - CORREGIDO: Sin columna Activa
    const empresasResult = await poolGlobal.request()
      .query(`
        SELECT DISTINCT CodigoEmpresa 
        FROM Empresas 
        WHERE CodigoEmpresa IN (
          SELECT CodigoEmpresa 
          FROM lsysEmpresaAplicacion 
          WHERE CodigoAplicacion = 'CON'
        ) 
        AND CodigoEmpresa <= 10000
      `);

    const empresas = empresasResult.recordset;
    const ejercicio = new Date().getFullYear();

    let totalCorregidos = 0;
    let totalErrores = 0;

    // Procesar cada empresa
    for (const empresa of empresas) {
      const codigoEmpresa = empresa.CodigoEmpresa;
      
      try {
        console.log(`🏢 [SYNC AUTO] Sincronizando empresa: ${codigoEmpresa}`);
        
        // 1. IDENTIFICAR DISCREPANCIAS - CONSULTA MEJORADA
        const discrepancias = await poolGlobal.request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.Int, ejercicio)
          .query(`
            SELECT 
              ast.CodigoArticulo,
              ast.CodigoAlmacen,
              ast.Ubicacion,
              ast.TipoUnidadMedida_,
              ast.Partida,
              ast.CodigoColor_,
              ast.CodigoTalla01_,
              -- Stock oficial (AcumuladoStock)
              CAST(COALESCE(ast.UnidadSaldoTipo_, ast.UnidadSaldo) AS DECIMAL(18, 4)) AS StockOficial,
              -- Stock en ubicación (AcumuladoStockUbicacion)
              COALESCE(asu.UnidadSaldoTipo_, asu.UnidadSaldo, 0) AS StockUbicacion,
              -- Diferencia
              CAST(COALESCE(ast.UnidadSaldoTipo_, ast.UnidadSaldo) AS DECIMAL(18, 4)) - COALESCE(asu.UnidadSaldoTipo_, asu.UnidadSaldo, 0) AS Diferencia
            FROM AcumuladoStock ast
            LEFT JOIN AcumuladoStockUbicacion asu 
              ON asu.CodigoEmpresa = ast.CodigoEmpresa
              AND asu.Ejercicio = ast.Ejercicio
              AND asu.CodigoAlmacen = ast.CodigoAlmacen
              AND asu.CodigoArticulo = ast.CodigoArticulo
              AND asu.Ubicacion = ast.Ubicacion
              AND ISNULL(asu.TipoUnidadMedida_, '') = ISNULL(ast.TipoUnidadMedida_, '')
              AND ISNULL(asu.Partida, '') = ISNULL(ast.Partida, '')
              AND ISNULL(asu.CodigoColor_, '') = ISNULL(ast.CodigoColor_, '')
              AND ISNULL(asu.CodigoTalla01_, '') = ISNULL(ast.CodigoTalla01_, '')
              AND asu.Periodo = 99
            WHERE ast.CodigoEmpresa = @codigoEmpresa
              AND ast.Ejercicio = @ejercicio
              AND ast.Periodo = 99
              AND ast.CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
              AND ast.Ubicacion IS NOT NULL 
              AND ast.Ubicacion != ''
              AND COALESCE(ast.UnidadSaldoTipo_, ast.UnidadSaldo) > 0
              -- Solo procesar discrepancias significativas
              AND ABS(
                CAST(COALESCE(ast.UnidadSaldoTipo_, ast.UnidadSaldo) AS DECIMAL(18, 4)) - COALESCE(asu.UnidadSaldoTipo_, asu.UnidadSaldo, 0)
              ) > 0.001
          `);

        console.log(`📊 [SYNC AUTO] Empresa ${codigoEmpresa}: ${discrepancias.recordset.length} discrepancias encontradas`);

        // 2. CORREGIR CADA DISCREPANCIA
        for (const discrepancia of discrepancias.recordset) {
          try {
            await corregirDiscrepancia(discrepancia, codigoEmpresa, ejercicio);
            totalCorregidos++;
            
            // Pequeña pausa para no saturar la BD
            await new Promise(resolve => setTimeout(resolve, 10));
            
          } catch (error) {
            console.error(`❌ [SYNC AUTO] Error corrigiendo discrepancia:`, error.message);
            totalErrores++;
          }
        }

      } catch (error) {
        console.error(`❌ [SYNC AUTO] Error en empresa ${codigoEmpresa}:`, error.message);
        totalErrores++;
      }
    }

    console.log(`✅ [SYNC AUTO] Sincronización completada: ${totalCorregidos} correcciones, ${totalErrores} errores`);
    
  } catch (error) {
    console.error('❌ [SYNC AUTO] Error general en sincronización:', error);
  }
}

// ✅ FUNCIÓN PARA CORREGIR UNA DISCREPANCIA INDIVIDUAL
async function corregirDiscrepancia(discrepancia, codigoEmpresa, ejercicio) {
  const transaction = new sql.Transaction(poolGlobal);
  
  try {
    await transaction.begin();

    const {
      CodigoArticulo,
      CodigoAlmacen,
      Ubicacion,
      TipoUnidadMedida_,
      Partida,
      CodigoColor_,
      CodigoTalla01_,
      StockOficial,
      StockUbicacion,
      Diferencia
    } = discrepancia;

    console.log(`🔧 [SYNC AUTO] Corrigiendo: ${CodigoArticulo} | ${CodigoAlmacen} | ${Ubicacion} | ${StockUbicacion} → ${StockOficial} (Diferencia: ${Diferencia})`);

    // 1. ELIMINAR REGISTRO EXISTENTE EN ACUMULADOSTOCKUBICACION (si existe)
    const requestEliminar = new sql.Request(transaction);
    await requestEliminar
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('codigoAlmacen', sql.VarChar, CodigoAlmacen)
      .input('codigoArticulo', sql.VarChar, CodigoArticulo)
      .input('ubicacion', sql.VarChar, Ubicacion)
      .input('tipoUnidadMedida', sql.VarChar, TipoUnidadMedida_ || '')
      .input('partida', sql.VarChar, Partida || '')
      .input('codigoColor', sql.VarChar, CodigoColor_ || '')
      .input('codigoTalla', sql.VarChar, CodigoTalla01_ || '')
      .query(`
        DELETE FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND CodigoAlmacen = @codigoAlmacen
          AND CodigoArticulo = @codigoArticulo
          AND Ubicacion = @ubicacion
          AND (TipoUnidadMedida_ = @tipoUnidadMedida OR (TipoUnidadMedida_ IS NULL AND @tipoUnidadMedida = ''))
          AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
          AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
          AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
          AND Periodo = 99
      `);

    // 2. INSERTAR NUEVO REGISTRO CON EL STOCK CORRECTO
    if (StockOficial > 0) {
      const requestInsertar = new sql.Request(transaction);
      
      await requestInsertar
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.Int, ejercicio)
        .input('codigoAlmacen', sql.VarChar, CodigoAlmacen)
        .input('ubicacion', sql.VarChar, Ubicacion)
        .input('codigoArticulo', sql.VarChar, CodigoArticulo)
        .input('tipoUnidadMedida', sql.VarChar, TipoUnidadMedida_ || '')
        .input('partida', sql.VarChar, Partida || '')
        .input('codigoColor', sql.VarChar, CodigoColor_ || '')
        .input('codigoTalla', sql.VarChar, CodigoTalla01_ || '')
        .input('unidadSaldo', sql.Decimal(18, 4), StockOficial)
        .input('unidadSaldoTipo', sql.Decimal(18, 4), StockOficial)
        .query(`
          INSERT INTO AcumuladoStockUbicacion (
            CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
            CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
            UnidadSaldo, UnidadSaldoTipo_, Periodo
          ) VALUES (
            @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
            @codigoArticulo, @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla,
            @unidadSaldo, @unidadSaldoTipo, 99
          )
        `);
    }

    await transaction.commit();
    console.log(`✅ [SYNC AUTO] Corregido: ${CodigoArticulo} | ${CodigoAlmacen} | ${Ubicacion}`);

  } catch (error) {
    if (transaction._aborted === false) {
      await transaction.rollback();
    }
    throw error;
  }
}

// ✅ CONFIGURACIÓN DEL CRON JOB (CADA 3 HORAS)

// Función para iniciar la sincronización después de la conexión a BD
function iniciarSincronizacionAutomatica() {
  console.log('🚀 [SYNC AUTO] Configurando sistema de sincronización automática...');
  
  // Sincronización INMEDIATA al arrancar (5 segundos después de la conexión)
  setTimeout(() => {
    console.log('⏰ [SYNC AUTO] Ejecutando sincronización INICIAL inmediata...');
    sincronizacionAutomatica();
  }, 5000);

  // Programar ejecución cada 3 horas (0 */3 * * *)
  cron.schedule('0 */3 * * *', () => {
    console.log('⏰ [SYNC AUTO] Ejecutando sincronización programada cada 3 horas...');
    sincronizacionAutomatica();
  });

  console.log('✅ [SYNC AUTO] Sistema configurado: Sincronización inicial en 5 segundos + cada 3 horas');
}

// ✅ ENDPOINT MANUAL PARA FORZAR SINCRONIZACIÓN
app.post('/inventario/sincronizacion-automatica', async (req, res) => {
  try {
    console.log('🔧 [SYNC MANUAL] Sincronización manual solicitada');
    
    // Ejecutar sincronización inmediata
    await sincronizacionAutomatica();
    
    res.json({
      success: true,
      mensaje: 'Sincronización automática ejecutada manualmente'
    });
    
  } catch (error) {
    console.error('[ERROR SYNC MANUAL]', error);
    res.status(500).json({
      success: false,
      mensaje: 'Error en sincronización manual',
      error: error.message
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
          AND CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')  -- TODOS LOS ALMACENES PERMITIDOS
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

// ✅ 10.3 ACTUALIZAR STOCK Y REGISTRAR TRASPASO (VERSIÓN CORREGIDA - UNIDADES ALTERNATIVAS)
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

    console.log('🔍 [TRASPASO] Datos recibidos:', {
        articulo, origenAlmacen, origenUbicacion, destinoAlmacen, destinoUbicacion,
        cantidad, unidadMedida, partida, codigoTalla, codigoColor, esSinUbicacion
    });

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
        
        // 🔥 CORRECCIÓN CRÍTICA: Normalizar valores NULL/vacíos
        const partidaNormalizada = partida || '';
        const codigoTallaNormalizado = codigoTalla || '';
        const codigoColorNormalizado = codigoColor || '';
        
        // 🔥 CORRECCIÓN: Manejo correcto de unidades
        const unidadMedidaBD = unidadMedida === 'unidades' ? '' : unidadMedida;

        console.log('📊 [TRASPASO] Valores normalizados:', {
            partidaNormalizada, codigoTallaNormalizado, codigoColorNormalizado, unidadMedidaBD
        });

        // 1. OBTENER STOCK ORIGEN - CONSULTA MEJORADA CON UNIDAD_SALDO_TIPO
        console.log('🔍 [TRASPASO] Buscando stock en origen...');
        const requestStockOrigen = new sql.Request(transaction);
        
        const queryStockOrigen = `
            SELECT 
                Ubicacion,
                TipoUnidadMedida_,
                Partida,
                CodigoColor_,
                CodigoTalla01_,
                UnidadSaldo,
                UnidadSaldoTipo_,
                -- 🔥 NUEVO: Obtener información del artículo para determinar unidad base
                (SELECT UnidadMedida2_ FROM Articulos WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo) AS UnidadBase,
                (SELECT UnidadMedidaAlternativa_ FROM Articulos WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo) AS UnidadAlternativa
            FROM AcumuladoStockUbicacion
            WHERE CodigoEmpresa = @codigoEmpresa
                AND Ejercicio = @ejercicio
                AND CodigoAlmacen = @codigoAlmacen
                AND Ubicacion = @ubicacion
                AND CodigoArticulo = @codigoArticulo
                AND TipoUnidadMedida_ = @tipoUnidadMedida
                AND Periodo = 99
                -- 🔥 CORRECCIÓN CRÍTICA: Buscar en UnidadSaldoTipo_ cuando hay variantes
                AND (UnidadSaldo > 0 OR UnidadSaldoTipo_ > 0)
                -- 🔥 CORRECCIÓN: Manejo flexible de NULLs y vacíos
                AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
                AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
                AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
        `;

        const stockOrigenResult = await requestStockOrigen
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('ubicacion', sql.VarChar, origenUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('tipoUnidadMedida', sql.VarChar, unidadMedidaBD)
            .input('partida', sql.VarChar, partidaNormalizada)
            .input('codigoColor', sql.VarChar, codigoColorNormalizado)
            .input('codigoTalla', sql.VarChar, codigoTallaNormalizado)
            .query(queryStockOrigen);

        console.log('📊 [TRASPASO] Resultados de stock origen:', stockOrigenResult.recordset);

        if (stockOrigenResult.recordset.length === 0) {
            // 🔥 INTENTAR FALLBACK: Buscar sin considerar variantes específicas
            console.log('🔄 [TRASPASO] Intentando búsqueda alternativa...');
            const requestStockFallback = new sql.Request(transaction);
            
            const fallbackResult = await requestStockFallback
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, origenAlmacen)
                .input('ubicacion', sql.VarChar, origenUbicacion)
                .input('codigoArticulo', sql.VarChar, articulo)
                .input('tipoUnidadMedida', sql.VarChar, unidadMedidaBD)
                .query(`
                    SELECT 
                        Ubicacion,
                        TipoUnidadMedida_,
                        Partida,
                        CodigoColor_,
                        CodigoTalla01_,
                        UnidadSaldo,
                        UnidadSaldoTipo_,
                        (SELECT UnidadMedida2_ FROM Articulos WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo) AS UnidadBase,
                        (SELECT UnidadMedidaAlternativa_ FROM Articulos WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo) AS UnidadAlternativa
                    FROM AcumuladoStockUbicacion
                    WHERE CodigoEmpresa = @codigoEmpresa
                        AND Ejercicio = @ejercicio
                        AND CodigoAlmacen = @codigoAlmacen
                        AND Ubicacion = @ubicacion
                        AND CodigoArticulo = @codigoArticulo
                        AND TipoUnidadMedida_ = @tipoUnidadMedida
                        AND Periodo = 99
                        -- 🔥 CORRECCIÓN: Incluir también en el fallback
                        AND (UnidadSaldo > 0 OR UnidadSaldoTipo_ > 0)
                    ORDER BY UnidadSaldoTipo_ DESC, UnidadSaldo DESC
                `);

            console.log('📊 [TRASPASO] Resultados fallback:', fallbackResult.recordset);

            if (fallbackResult.recordset.length === 0) {
                throw new Error(`Stock en ubicación de origen no encontrado. Artículo: ${articulo}, Almacén: ${origenAlmacen}, Ubicación: ${origenUbicacion}, Unidad: ${unidadMedida}`);
            }

            // Usar el primer resultado del fallback
            const stockItem = fallbackResult.recordset[0];
            console.log('✅ [TRASPASO] Usando registro fallback:', stockItem);
        }

        const stockItems = stockOrigenResult.recordset.length > 0 ? stockOrigenResult.recordset : fallbackResult.recordset;
        const stockItem = stockItems[0];

        // 🔥 CORRECCIÓN CRÍTICA: Determinar qué campo usar para el stock
        let stockActual = 0;
        const unidadBase = stockItem.UnidadBase || '';
        const unidadAlternativa = stockItem.UnidadAlternativa || '';
        
        console.log('🔍 [TRASPASO] Información de unidades:', {
            unidadBase,
            unidadAlternativa,
            tipoUnidadMedida: stockItem.TipoUnidadMedida_,
            unidadSaldo: stockItem.UnidadSaldo,
            unidadSaldoTipo: stockItem.UnidadSaldoTipo_
        });

        // 🔥 LÓGICA MEJORADA: Usar UnidadSaldoTipo_ cuando es unidad alternativa o hay variantes
        if (stockItem.TipoUnidadMedida_ === unidadAlternativa || 
            stockItem.CodigoColor_ || 
            stockItem.CodigoTalla01_ ||
            stockItem.UnidadSaldoTipo_ > stockItem.UnidadSaldo) {
            
            // Es unidad alternativa o tiene variantes - usar UnidadSaldoTipo_
            stockActual = stockItem.UnidadSaldoTipo_;
            console.log('🔍 [TRASPASO] Usando UnidadSaldoTipo_ (unidad alternativa/variantes):', stockActual);
        } else {
            // Es unidad base - usar UnidadSaldo
            stockActual = stockItem.UnidadSaldo;
            console.log('🔍 [TRASPASO] Usando UnidadSaldo (unidad base):', stockActual);
        }

        // Asegurarse de que tenemos un valor válido
        if (isNaN(stockActual) || stockActual < 0) {
            stockActual = 0;
        }
        
        console.log('📊 [TRASPASO] Stock actual calculado:', {
            stockActual,
            ubicacion: stockItem.Ubicacion,
            unidad: stockItem.TipoUnidadMedida_,
            partida: stockItem.Partida,
            color: stockItem.CodigoColor_,
            talla: stockItem.CodigoTalla01_,
            unidadBase,
            unidadAlternativa
        });

        if (cantidadNum > stockActual) {
            throw new Error(`Cantidad solicitada (${cantidadNum}) supera el stock disponible (${stockActual})`);
        }

        // 2. ACTUALIZAR STOCK ORIGEN
        const nuevoStockOrigen = stockActual - cantidadNum;
        console.log('🔄 [TRASPASO] Actualizando stock origen:', { stockActual, cantidadNum, nuevoStockOrigen });

        // 🔥 CORRECCIÓN: Actualizar ambos campos - UnidadSaldo y UnidadSaldoTipo_
        if (nuevoStockOrigen === 0) {
            // Eliminar registro si queda en cero
            const requestEliminarOrigen = new sql.Request(transaction);
            await requestEliminarOrigen
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, origenAlmacen)
                .input('ubicacion', sql.VarChar, origenUbicacion)
                .input('codigoArticulo', sql.VarChar, articulo)
                .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
                .input('partida', sql.VarChar, stockItem.Partida || '')
                .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
                .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
                .query(`
                    DELETE FROM AcumuladoStockUbicacion
                    WHERE CodigoEmpresa = @codigoEmpresa
                        AND Ejercicio = @ejercicio
                        AND CodigoAlmacen = @codigoAlmacen
                        AND Ubicacion = @ubicacion
                        AND CodigoArticulo = @codigoArticulo
                        AND TipoUnidadMedida_ = @tipoUnidadMedida
                        AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
                        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
                        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
                        AND Periodo = 99
                `);
        } else {
            // Actualizar registro existente - AMBOS CAMPOS
            const requestActualizarOrigen = new sql.Request(transaction);
            await requestActualizarOrigen
                .input('nuevoStock', sql.Decimal(18,4), nuevoStockOrigen)
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, origenAlmacen)
                .input('ubicacion', sql.VarChar, origenUbicacion)
                .input('codigoArticulo', sql.VarChar, articulo)
                .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
                .input('partida', sql.VarChar, stockItem.Partida || '')
                .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
                .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
                .query(`
                    UPDATE AcumuladoStockUbicacion
                    SET UnidadSaldo = @nuevoStock,
                        UnidadSaldoTipo_ = @nuevoStock
                    WHERE CodigoEmpresa = @codigoEmpresa
                        AND Ejercicio = @ejercicio
                        AND CodigoAlmacen = @codigoAlmacen
                        AND Ubicacion = @ubicacion
                        AND CodigoArticulo = @codigoArticulo
                        AND TipoUnidadMedida_ = @tipoUnidadMedida
                        AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
                        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
                        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
                        AND Periodo = 99
                `);
        }

        // 3. ACTUALIZAR/CREAR STOCK DESTINO
        console.log('🔄 [TRASPASO] Actualizando stock destino...');
        const requestStockDestino = new sql.Request(transaction);
        
        const stockDestinoResult = await requestStockDestino
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
            .input('ubicacion', sql.VarChar, destinoUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
            .input('partida', sql.VarChar, stockItem.Partida || '')
            .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
            .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
            .query(`
                SELECT UnidadSaldo, UnidadSaldoTipo_
                FROM AcumuladoStockUbicacion
                WHERE CodigoEmpresa = @codigoEmpresa
                    AND Ejercicio = @ejercicio
                    AND CodigoAlmacen = @codigoAlmacen
                    AND Ubicacion = @ubicacion
                    AND CodigoArticulo = @codigoArticulo
                    AND TipoUnidadMedida_ = @tipoUnidadMedida
                    AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
                    AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
                    AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
                    AND Periodo = 99
            `);

        let stockDestinoActual = 0;
        if (stockDestinoResult.recordset.length > 0) {
            const destinoItem = stockDestinoResult.recordset[0];
            // 🔥 CORRECCIÓN: Misma lógica para destino - determinar qué campo usar
            if (stockItem.TipoUnidadMedida_ === unidadAlternativa || 
                stockItem.CodigoColor_ || 
                stockItem.CodigoTalla01_) {
                stockDestinoActual = destinoItem.UnidadSaldoTipo_;
            } else {
                stockDestinoActual = destinoItem.UnidadSaldo;
            }
        }

        const nuevoStockDestino = stockDestinoActual + cantidadNum;
        console.log('📊 [TRASPASO] Stock destino:', { stockDestinoActual, cantidadNum, nuevoStockDestino });

        const requestUpsertDestino = new sql.Request(transaction);
        
        if (stockDestinoResult.recordset.length > 0) {
            // Actualizar registro existente - AMBOS CAMPOS
            await requestUpsertDestino
                .input('nuevoStock', sql.Decimal(18,4), nuevoStockDestino)
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
                .input('ubicacion', sql.VarChar, destinoUbicacion)
                .input('codigoArticulo', sql.VarChar, articulo)
                .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
                .input('partida', sql.VarChar, stockItem.Partida || '')
                .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
                .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
                .query(`
                    UPDATE AcumuladoStockUbicacion
                    SET UnidadSaldo = @nuevoStock,
                        UnidadSaldoTipo_ = @nuevoStock
                    WHERE CodigoEmpresa = @codigoEmpresa
                        AND Ejercicio = @ejercicio
                        AND CodigoAlmacen = @codigoAlmacen
                        AND Ubicacion = @ubicacion
                        AND CodigoArticulo = @codigoArticulo
                        AND TipoUnidadMedida_ = @tipoUnidadMedida
                        AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
                        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
                        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
                        AND Periodo = 99
                `);
        } else {
            // Insertar nuevo registro - AMBOS CAMPOS
            await requestUpsertDestino
                .input('nuevoStock', sql.Decimal(18,4), nuevoStockDestino)
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
                .input('ubicacion', sql.VarChar, destinoUbicacion)
                .input('codigoArticulo', sql.VarChar, articulo)
                .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
                .input('partida', sql.VarChar, stockItem.Partida || '')
                .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
                .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
                .query(`
                    INSERT INTO AcumuladoStockUbicacion (
                        CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
                        CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                        UnidadSaldo, UnidadSaldoTipo_, Periodo
                    ) VALUES (
                        @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
                        @codigoArticulo, @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla,
                        @nuevoStock, @nuevoStock, 99
                    )
                `);
        }

        // 4. ACTUALIZAR ACUMULADOSTOCK PARA MANTENER CONSISTENCIA
        console.log('🔄 [TRASPASO] Actualizando AcumuladoStock...');
        await actualizarAcumuladoStockGlobal(transaction, codigoEmpresa, ejercicio, origenAlmacen, articulo, stockItem);
        await actualizarAcumuladoStockGlobal(transaction, codigoEmpresa, ejercicio, destinoAlmacen, articulo, stockItem);

        // 5. REGISTRAR MOVIMIENTO
        console.log('📝 [TRASPASO] Registrando movimiento...');
        const fechaActual = new Date();
        const periodo = fechaActual.getMonth() + 1;
        const fechaSolo = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), fechaActual.getDate());
        
        const requestMov = new sql.Request(transaction);
        await requestMov
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.SmallInt, fechaActual.getFullYear())
            .input('periodo', sql.Int, periodo)
            .input('fecha', sql.Date, fechaSolo)
            .input('fechaRegistro', sql.DateTime, fechaActual)
            .input('tipoMovimiento', sql.SmallInt, 3) // 3 = Traspaso
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('almacenContrapartida', sql.VarChar, destinoAlmacen)
            .input('ubicacion', sql.VarChar, origenUbicacion)
            .input('ubicacionContrapartida', sql.VarChar, destinoUbicacion)
            .input('partida', sql.VarChar, stockItem.Partida || '')
            .input('unidades', sql.Decimal(18,4), cantidadNum)
            .input('comentario', sql.VarChar, `Traspaso por ${usuario}`)
            .input('unidadMedida', sql.VarChar, unidadMedida)
            .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
            .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
            .query(`
                INSERT INTO MovimientoStock (
                    CodigoEmpresa, Ejercicio, Periodo, Fecha, FechaRegistro, TipoMovimiento,
                    CodigoArticulo, CodigoAlmacen, AlmacenContrapartida, Ubicacion, UbicacionContrapartida,
                    Unidades, Comentario, UnidadMedida1_, Partida,
                    CodigoColor_, CodigoTalla01_
                ) VALUES (
                    @codigoEmpresa, @ejercicio, @periodo, @fecha, @fechaRegistro, @tipoMovimiento,
                    @codigoArticulo, @codigoAlmacen, @almacenContrapartida, @ubicacion, @ubicacionContrapartida,
                    @unidades, @comentario, @unidadMedida, @partida,
                    @codigoColor, @codigoTalla
                )
            `);

        await transaction.commit();
        console.log('✅ [TRASPASO] Traspaso completado exitosamente');

        res.json({ 
            success: true, 
            mensaje: 'Traspaso realizado con éxito',
            datos: {
                articulo,
                origen: `${origenAlmacen}-${origenUbicacion}`,
                destino: `${destinoAlmacen}-${destinoUbicacion}`,
                cantidad: cantidadNum,
                unidad: unidadMedida
            }
        });
        
    } catch (err) {
        if (transaction._aborted === false) {
            await transaction.rollback();
            console.log('❌ [TRASPASO] Transacción revertida');
        }
        console.error('❌ [ERROR TRASPASO]', err);
        res.status(500).json({ 
            success: false, 
            mensaje: 'Error al realizar el traspaso',
            error: err.message
        });
    }
});

// 🔥 FUNCIÓN AUXILIAR: ACTUALIZAR ACUMULADOSTOCK GLOBAL
async function actualizarAcumuladoStockGlobal(transaction, codigoEmpresa, ejercicio, codigoAlmacen, codigoArticulo, stockItem) {
    try {
        const request = new sql.Request(transaction);
        
        await request
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
            .input('codigoArticulo', sql.VarChar, codigoArticulo)
            .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
            .input('partida', sql.VarChar, stockItem.Partida || '')
            .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
            .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
            .query(`
                -- Calcular stock total sumando todas las ubicaciones
                DECLARE @StockTotal DECIMAL(18,4);
                
                SELECT @StockTotal = SUM(UnidadSaldo)
                FROM AcumuladoStockUbicacion
                WHERE CodigoEmpresa = @codigoEmpresa
                    AND Ejercicio = @ejercicio
                    AND CodigoAlmacen = @codigoAlmacen
                    AND CodigoArticulo = @codigoArticulo
                    AND TipoUnidadMedida_ = @tipoUnidadMedida
                    AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
                    AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
                    AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
                    AND Periodo = 99;
                
                -- UPSERT en AcumuladoStock
                MERGE INTO AcumuladoStock AS target
                USING (VALUES (
                    @codigoEmpresa, @ejercicio, @codigoAlmacen, @codigoArticulo,
                    @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla
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
                        UnidadSaldo = @StockTotal,
                        UnidadSaldoTipo_ = @StockTotal
                
                WHEN NOT MATCHED THEN
                    INSERT (
                        CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                        TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                        UnidadSaldo, UnidadSaldoTipo_, Periodo
                    ) VALUES (
                        @codigoEmpresa, @ejercicio, @codigoAlmacen, @codigoArticulo,
                        @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla,
                        @StockTotal, @StockTotal, 99
                    );
            `);
            
        console.log('✅ AcumuladoStock actualizado para', codigoArticulo, 'en', codigoAlmacen);
    } catch (error) {
        console.error('❌ Error actualizando AcumuladoStock:', error);
        throw error;
    }
}

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

// ✅ OBTENER STOCK POR ARTÍCULO (PARA TRASPASOS)
app.get('/traspasos/stock-por-articulo', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoArticulo } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;
  const ejercicio = new Date().getFullYear();

  if (!codigoArticulo) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de artículo requerido' 
    });
  }

  try {
    console.log(`[TRASPASOS] Obteniendo stock para artículo ${codigoArticulo}`);

    const query = `
      SELECT 
        s.CodigoArticulo,
        a.DescripcionArticulo,
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        s.TipoUnidadMedida_ AS UnidadStock,
        s.UnidadSaldoTipo_ AS CantidadBase,
        s.UnidadSaldoTipo_ AS Cantidad,
        s.Partida,
        s.CodigoColor_,
        s.CodigoTalla01_,
        a.UnidadMedida2_ AS UnidadBase,
        a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
        a.FactorConversion_ AS FactorConversion,
        CASE 
          WHEN s.Ubicacion = 'SIN-UBICACION' OR s.Ubicacion IS NULL THEN 1
          ELSE 0
        END AS EsSinUbicacion,
        CONCAT(
          s.CodigoArticulo, '_', 
          s.CodigoAlmacen, '_', 
          s.Ubicacion, '_', 
          s.TipoUnidadMedida_, '_',
          ISNULL(s.Partida, ''), '_',
          ISNULL(s.CodigoColor_, ''), '_',
          ISNULL(s.CodigoTalla01_, '')
        ) AS ClaveUnica
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
        AND s.Ejercicio = @ejercicio
        AND s.Periodo = 99
        AND s.CodigoArticulo = @codigoArticulo
        AND s.CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
        AND s.UnidadSaldoTipo_ > 0  -- Solo stock disponible
      ORDER BY 
        s.CodigoAlmacen,
        s.UnidadSaldoTipo_ DESC
    `;

    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(query);

    console.log(`[TRASPASOS] Encontradas ${result.recordset.length} ubicaciones para ${codigoArticulo}`);

    res.json(result.recordset);

  } catch (error) {
    console.error('[ERROR STOCK POR ARTICULO TRASPASOS]', error);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock para traspasos',
      error: error.message 
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

// ✅ 9.3 OBTENER ARTÍCULOS POR UBICACIÓN (CORREGIDO)
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
          AND s.CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
          AND s.Ubicacion = @ubicacion
          AND s.Periodo IN (0, 99)
          AND s.UnidadSaldo > 0
      `);
    
    const total = countResult.recordset[0].TotalCount;
    
    // Consulta corregida - Incluye todos los almacenes
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
          AND s.CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
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

// ✅ 9.4 OBTENER STOCK POR MÚLTIPLES ARTÍCULOS (CORREGIDO)
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
        AND s.CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
        AND s.Periodo = 99
        AND s.UnidadSaldo > 0
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

    // Si no hay ubicaciones para algún artículo, agregar Zona descarga para cada almacén
    const almacenes = ['CEN', 'BCN', 'N5', 'N1', 'PK', '5'];
    const nombresAlmacenes = {
      'CEN': 'Almacén Central',
      'BCN': 'Almacén Barcelona', 
      'N5': 'Almacén N5',
      'N1': 'Almacén N1',
      'PK': 'Almacén PK',
      '5': 'Almacén 5'
    };

    codigosArticulos.forEach(codigo => {
      if (!grouped[codigo] || grouped[codigo].length === 0) {
        console.log(`[DEBUG UBICACIONES] Artículo ${codigo} sin stock - agregando Zona descarga para todos los almacenes`);
        grouped[codigo] = almacenes.map(almacen => ({
          codigoAlmacen: almacen,
          nombreAlmacen: nombresAlmacenes[almacen] || almacen,
          ubicacion: "Zona descarga",
          descripcionUbicacion: "Stock disponible para expedición directa",
          unidadSaldo: Infinity,
          unidadMedida: 'unidades',
          partida: null,
          codigoColor: '',
          codigoTalla: ''
        }));
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

// ✅ 9.7 OBTENER STOCK SIN UBICACIÓN (CORREGIDO)
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
            AND CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
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
            AND CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
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
          '' AS Ubicacion,
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
            'SIN_UBICACION', '_',
            st.CodigoArticulo, '_',
            ISNULL(st.TipoUnidadMedida_, 'unidades'), '_',
            ISNULL(st.Partida, ''), '_',
            ISNULL(st.CodigoColor_, ''), '_',
            ISNULL(st.CodigoTalla01_, ''), '_',
            CAST((st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) AS VARCHAR(20))
          ) AS ClaveUnica,
          0 AS MovPosicionLinea
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

// ✅ 9.7 OBTENER HISTÓRICO DE AJUSTES DE INVENTARIO (VERSIÓN MEJORADA - INCLUYE INVENTARIOS)
app.get('/inventario/historial-ajustes', async (req, res) => {
  // 1. Obtener empresa del usuario autenticado
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ 
      success: false, 
      mensaje: 'No autenticado' 
    });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  const añoActual = new Date().getFullYear();

  try {
    console.log(`📊 Obteniendo historial de ajustes para empresa: ${codigoEmpresa}, año: ${añoActual}`);
    
    // 2. Obtener fechas con ajustes - COMBINANDO MOVIMIENTOSTOCK E INVENTARIOS
    const fechasResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, añoActual)
      .query(`
        -- Fechas de MovimientoStock (ajustes)
        SELECT DISTINCT CONVERT(date, FechaRegistro) AS Fecha, 'MOVIMIENTO' AS Tipo
        FROM MovimientoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND TipoMovimiento = 5  -- 5: Ajuste
          AND Unidades IS NOT NULL
          AND Unidades != 0
        
        UNION
        
        -- Fechas de Inventarios (ajustes manuales)
        SELECT DISTINCT CONVERT(date, FechaCreacion) AS Fecha, 'INVENTARIO' AS Tipo
        FROM Inventarios
        WHERE CodigoEmpresa = @codigoEmpresa
          AND StatusRegulariza = -1  -- Ajustes manuales
          AND YEAR(FechaCreacion) = @ejercicio
        
        ORDER BY Fecha DESC
      `);
    
    const fechas = fechasResult.recordset;
    console.log(`📅 Fechas con ajustes encontradas: ${fechas.length}`);
    
    const historial = [];
    
    // 3. Para cada fecha, obtener los ajustes de ambas tablas
    for (const fecha of fechas) {
      const fechaStr = fecha.Fecha.toISOString().split('T')[0];
      
      console.log(`🔍 Obteniendo ajustes para fecha: ${fechaStr}`);
      
      // Obtener ajustes de MovimientoStock
      const movimientosResult = await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, añoActual)
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
            m.FechaRegistro,
            m.UnidadMedida1_ AS UnidadMedida,
            m.CodigoColor_,
            m.CodigoTalla01_,
            'MOVIMIENTO' AS TipoRegistro
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
            AND m.Ejercicio = @ejercicio
            AND m.TipoMovimiento = 5  -- 5: Ajuste
            AND CONVERT(date, m.FechaRegistro) = @fecha
            AND m.Unidades IS NOT NULL
            AND m.Unidades != 0
        `);
      
      // Obtener ajustes de Inventarios
      const inventariosResult = await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('fecha', sql.Date, fechaStr)
        .query(`
          SELECT 
            i.CodigoArticulo,
            a.DescripcionArticulo,
            i.CodigoAlmacen,
            alm.Almacen AS NombreAlmacen,
            i.Ubicacion,
            u.DescripcionUbicacion,
            i.Partida,
            (i.UnidadesInventario - i.UnidadesStock) AS Diferencia,
            i.Inventario AS Comentario,
            i.FechaCreacion AS FechaRegistro,
            i.TipoUnidadMedida_ AS UnidadMedida,
            i.CodigoColor_,
            i.CodigoTalla01_,
            'INVENTARIO' AS TipoRegistro
          FROM Inventarios i
          LEFT JOIN Articulos a 
            ON a.CodigoArticulo = i.CodigoArticulo 
            AND a.CodigoEmpresa = i.CodigoEmpresa
          LEFT JOIN Almacenes alm 
            ON alm.CodigoAlmacen = i.CodigoAlmacen 
            AND alm.CodigoEmpresa = i.CodigoEmpresa
          LEFT JOIN Ubicaciones u 
            ON u.CodigoAlmacen = i.CodigoAlmacen 
            AND u.Ubicacion = i.Ubicacion 
            AND u.CodigoEmpresa = i.CodigoEmpresa
          WHERE i.CodigoEmpresa = @codigoEmpresa
            AND i.StatusRegulariza = -1  -- Ajustes manuales
            AND CONVERT(date, i.FechaCreacion) = @fecha
            AND (i.UnidadesInventario - i.UnidadesStock) != 0
        `);
      
      // Combinar resultados
      const todosLosAjustes = [
        ...movimientosResult.recordset,
        ...inventariosResult.recordset
      ];
      
      console.log(`📋 Ajustes encontrados para ${fechaStr}: ${todosLosAjustes.length} (Movimientos: ${movimientosResult.recordset.length}, Inventarios: ${inventariosResult.recordset.length})`);
      
      if (todosLosAjustes.length > 0) {
        historial.push({
          fecha: fechaStr,
          totalAjustes: todosLosAjustes.length,
          detalles: todosLosAjustes.map(detalle => ({
            CodigoArticulo: detalle.CodigoArticulo,
            DescripcionArticulo: detalle.DescripcionArticulo || 'Artículo no encontrado',
            CodigoAlmacen: detalle.CodigoAlmacen,
            NombreAlmacen: detalle.NombreAlmacen || detalle.CodigoAlmacen,
            Ubicacion: detalle.Ubicacion || 'N/A',
            DescripcionUbicacion: detalle.DescripcionUbicacion || 'N/A',
            Partida: detalle.Partida || 'N/A',
            Diferencia: parseFloat(detalle.Diferencia) || 0,
            Comentario: detalle.Comentario || `Ajuste manual - ${detalle.TipoRegistro}`,
            FechaRegistro: detalle.FechaRegistro,
            UnidadMedida: detalle.UnidadMedida || 'unidades',
            CodigoColor: detalle.CodigoColor_ || '',
            CodigoTalla01: detalle.CodigoTalla01_ || '',
            TipoRegistro: detalle.TipoRegistro || 'MOVIMIENTO'
          }))
        });
      }
    }
    
    console.log(`✅ Historial completo generado con ${historial.length} días de ajustes`);
    
    // Ordenar por fecha más reciente primero
    historial.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    res.json(historial);
  } catch (err) {
    console.error('[ERROR HISTORIAL AJUSTES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener historial de ajustes.',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
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

// ✅ 9.11 OBTENER ARTÍCULOS CON STOCK (CORREGIDO)
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
              THEN s.UnidadSaldo / NULLIF(a.FactorConversion_, 0)
            WHEN s.TipoUnidadMedida_ = a.UnidadMedida2_ 
              THEN s.UnidadSaldo
            ELSE s.UnidadSaldo / NULLIF(a.FactorConversion_, 0)
          END
        ) AS StockTotal
      FROM Articulos a
      INNER JOIN AcumuladoStockUbicacion s 
        ON s.CodigoEmpresa = a.CodigoEmpresa 
        AND s.CodigoArticulo = a.CodigoArticulo
      WHERE a.CodigoEmpresa = @codigoEmpresa
        AND s.CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
        AND s.Periodo IN (0, 99)
        AND (
          a.CodigoArticulo LIKE @searchTerm 
          OR a.DescripcionArticulo LIKE @searchTerm
        )
      GROUP BY a.CodigoArticulo, a.DescripcionArticulo
      HAVING SUM(
          CASE 
            WHEN s.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
              THEN s.UnidadSaldo / NULLIF(a.FactorConversion_, 0)
            WHEN s.TipoUnidadMedida_ = a.UnidadMedida2_ 
              THEN s.UnidadSaldo
            ELSE s.UnidadSaldo / NULLIF(a.FactorConversion_, 0)
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
          AND s.CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
          AND s.Periodo IN (0, 99)
          AND (
            a.CodigoArticulo LIKE @searchTerm 
            OR a.DescripcionArticulo LIKE @searchTerm
          )
        GROUP BY a.CodigoArticulo
        HAVING SUM(
            CASE 
              WHEN s.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
                THEN s.UnidadSaldo / NULLIF(a.FactorConversion_, 0)
              WHEN s.TipoUnidadMedida_ = a.UnidadMedida2_ 
                THEN s.UnidadSaldo
              ELSE s.UnidadSaldo / NULLIF(a.FactorConversion_, 0)
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

// ✅ 9.22 OBTENER STOCK POR ARTÍCULO
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

    // Consulta principal para stock con ubicación - INCLUYENDO NEGATIVOS Y CERO
    let query = `
      SELECT 
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        -- 🔥 USAR UnidadSaldoTipo_ CUANDO HAY VARIANTES (color o talla)
        CASE 
          WHEN (s.CodigoColor_ IS NOT NULL AND s.CodigoColor_ != '') 
            OR (s.CodigoTalla01_ IS NOT NULL AND s.CodigoTalla01_ != '') 
            THEN CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo) AS DECIMAL(18, 2))
          ELSE CAST(s.UnidadSaldo AS DECIMAL(18, 2))
        END AS Cantidad,
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
        ) AS GrupoUnico,
        CAST(s.UnidadSaldo AS DECIMAL(18, 2)) AS UnidadSaldo_Original,
        CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo) AS DECIMAL(18, 2)) AS UnidadSaldoTipo_Corregido
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
        AND s.CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
        AND s.Periodo IN (0, 99)
        -- 🔥 CORRECCIÓN: QUITAR FILTRO QUE EXCLUYE NEGATIVOS Y CERO
    `;

    // Si se solicita incluir stock sin ubicación
    if (incluirSinUbicacion === 'true') {
      query = `
        ${query}
        UNION ALL
        -- Stock sin ubicación por almacén (sin variantes) - INCLUYENDO NEGATIVOS Y CERO
        SELECT 
          s.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          'SIN-UBICACION' AS Ubicacion,
          'Stock sin ubicación asignada' AS DescripcionUbicacion,
          (s.StockTotal - ISNULL(u.StockUbicado, 0)) AS Cantidad,
          'unidades' AS UnidadMedida,
          'unidades' AS TipoUnidadMedida_,
          '' AS Partida,
          '' AS CodigoColor_,
          '' AS Talla,
          '' AS NombreColor,
          a.DescripcionArticulo,
          a.Descripcion2Articulo,
          1 AS EsSinUbicacion,
          CONCAT(s.CodigoAlmacen, '_SIN-UBICACION_unidades_') AS GrupoUnico,
          (s.StockTotal - ISNULL(u.StockUbicado, 0)) AS UnidadSaldo_Original,
          (s.StockTotal - ISNULL(u.StockUbicado, 0)) AS UnidadSaldoTipo_Corregido
        FROM (
          SELECT 
            CodigoAlmacen, 
            CodigoArticulo,
            SUM(UnidadSaldo) AS StockTotal
          FROM AcumuladoStock
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoArticulo = @codigoArticulo
            AND CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
            AND Periodo = 99
          GROUP BY CodigoAlmacen, CodigoArticulo
        ) s
        INNER JOIN Almacenes alm ON s.CodigoAlmacen = alm.CodigoAlmacen AND alm.CodigoEmpresa = @codigoEmpresa
        INNER JOIN Articulos a ON a.CodigoEmpresa = @codigoEmpresa AND a.CodigoArticulo = s.CodigoArticulo
        LEFT JOIN (
          SELECT 
            CodigoAlmacen,
            CodigoArticulo,
            SUM(UnidadSaldo) AS StockUbicado
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoArticulo = @codigoArticulo
            AND CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
            AND Periodo = 99
          GROUP BY CodigoAlmacen, CodigoArticulo
        ) u ON u.CodigoAlmacen = s.CodigoAlmacen AND u.CodigoArticulo = s.CodigoArticulo
        -- 🔥 CORRECCIÓN: INCLUIR CERO Y NEGATIVOS EN STOCK SIN UBICACIÓN
        WHERE (s.StockTotal - ISNULL(u.StockUbicado, 0)) != 0
      `;
    }

    query += ' ORDER BY CodigoAlmacen, Ubicacion';

    const result = await request.query(query);
      
    console.log(`[DEBUG STOCK POR ARTICULO] Artículo: ${codigoArticulo}, Registros: ${result.recordset.length} (incluyendo negativos y cero)`);
    
    // Log para debugging de variantes (incluyendo negativos y cero)
    const registrosNegativos = result.recordset.filter(item => item.Cantidad < 0);
    const registrosCero = result.recordset.filter(item => item.Cantidad === 0);
    
    console.log(`🔍 Artículo ${codigoArticulo}: ${registrosNegativos.length} negativos, ${registrosCero.length} cero`);
    
    if (registrosNegativos.length > 0) {
      console.log('🔍 DEBUG Artículo con negativos encontrados:');
      registrosNegativos.forEach((item, index) => {
        console.log(`   ⚠️ NEGATIVO - ${index + 1}. Almacén: ${item.CodigoAlmacen}, Ubicación: ${item.Ubicacion}, ` +
                   `Talla: ${item.Talla}, Cantidad: ${item.Cantidad}`);
      });
    }
    
    if (registrosCero.length > 0) {
      console.log('🔍 DEBUG Artículo con ceros encontrados:');
      registrosCero.forEach((item, index) => {
        console.log(`   0️⃣ CERO - ${index + 1}. Almacén: ${item.CodigoAlmacen}, Ubicación: ${item.Ubicacion}, ` +
                   `Talla: ${item.Talla}, Cantidad: ${item.Cantidad}`);
      });
    }
    
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

// ✅ 9.12 OBTENER STOCK POR VARIANTE (CORREGIDO)
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
        AND s.CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
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

// ✅ 9.14 OBTENER STOCK TOTAL COMPLETO
app.get('/inventario/stock-total-completo', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const codigoEmpresa = req.user.CodigoEmpresa;
  const ejercicio = new Date().getFullYear();

  try {
    console.log(`[INVENTARIO] Obteniendo stock completo para empresa ${codigoEmpresa}, ejercicio ${ejercicio}`);

    const query = `
      SELECT 
        -- Información básica del artículo
        s.CodigoArticulo,
        a.DescripcionArticulo,
        a.Descripcion2Articulo,
        
        -- Información de almacén y ubicación
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        
        -- Información de stock y unidades
        s.TipoUnidadMedida_ AS UnidadStock,
        s.UnidadSaldoTipo_ AS CantidadBase,  -- 🔥 CORRECCIÓN: Usar UnidadSaldoTipo_ para cálculos
        s.UnidadSaldoTipo_ AS Cantidad,           -- Cantidad en la unidad específica
        s.Partida,
        s.Periodo,
        
        -- Información de variantes
        s.CodigoColor_,
        s.CodigoTalla01_,
        
        -- Información de conversión de unidades
        a.UnidadMedida2_ AS UnidadBase,
        a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
        a.FactorConversion_ AS FactorConversion,
        
        -- Categorización
        a.CodigoFamilia,
        a.CodigoSubfamilia,
        
        -- Identificadores únicos
        s.Ejercicio,
        
        -- Campos para lógica de la aplicación
        CASE 
          WHEN s.Ubicacion = 'SIN-UBICACION' OR s.Ubicacion IS NULL THEN 1
          ELSE 0
        END AS EsSinUbicacion,
        
        -- Generar clave única para agrupación
        CONCAT(
          s.CodigoArticulo, '_', 
          s.CodigoAlmacen, '_', 
          s.Ubicacion, '_', 
          s.TipoUnidadMedida_, '_',
          ISNULL(s.Partida, ''), '_',
          ISNULL(s.CodigoColor_, ''), '_',
          ISNULL(s.CodigoTalla01_, '')
        ) AS ClaveUnica,

        -- Campo para detalles (puede ser NULL)
        NULL AS MovPosicionLinea

      FROM AcumuladoStockUbicacion s
      
      -- Joins para información adicional
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
        AND s.Ejercicio = @ejercicio
        AND s.Periodo = 99
        AND s.CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
        AND (
          s.UnidadSaldoTipo_ != 0  -- Incluir solo registros con cantidad
          OR s.UnidadSaldo != 0    -- O con cantidad en unidad específica
        )
      
      ORDER BY 
        s.CodigoArticulo,
        s.CodigoAlmacen,
        s.Ubicacion,
        s.TipoUnidadMedida_
    `;

    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .query(query);

    console.log(`[INVENTARIO] Stock completo obtenido: ${result.recordset.length} registros`);

    // Log de sample para debugging
    if (result.recordset.length > 0) {
      const sample = result.recordset.slice(0, 3);
      console.log('[INVENTARIO] Sample de registros:', sample.map(r => ({
        articulo: r.CodigoArticulo,
        almacen: r.CodigoAlmacen,
        ubicacion: r.Ubicacion,
        unidad: r.UnidadStock,
        cantidadBase: r.CantidadBase,
        cantidad: r.Cantidad
      })));
    }

    res.json(result.recordset);

  } catch (error) {
    console.error('[ERROR STOCK TOTAL COMPLETO]', error);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener el stock total completo',
      error: error.message 
    });
  }
});

// ✅ 9.15 AJUSTAR INVENTARIO (VERSIÓN MEJORADA - INSERCIÓN EN AMBAS TABLAS)
app.post('/inventario/ajustar-completo', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { ajustes } = req.body;
  const codigoEmpresa = req.user.CodigoEmpresa;
  const ejercicio = new Date().getFullYear();

  if (!ajustes || !Array.isArray(ajustes) || ajustes.length === 0) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Lista de ajustes vacía o inválida.' 
    });
  }

  const transaction = new sql.Transaction(poolGlobal);
  
  try {
    await transaction.begin();

    console.log(`[AJUSTE MANUAL] Iniciando ${ajustes.length} ajustes para empresa ${codigoEmpresa}`);

    // 1. PRIMERO: Identificar y procesar cada ajuste individualmente
    for (const ajuste of ajustes) {
      const { 
        articulo, 
        codigoAlmacen, 
        ubicacionStr, 
        partida, 
        unidadStock, 
        nuevaCantidad,
        codigoColor, 
        codigoTalla01 
      } = ajuste;

      const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
      const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

      console.log(`[AJUSTE MANUAL] Procesando: ${articulo} | ${codigoAlmacen} | ${ubicacionNormalizada} | ${nuevaCantidad}`);

      // 🔥 NUEVA LÓGICA: Verificar si ya existe en AcumuladoStock
      const existeEnAcumuladoStock = await verificarExistenciaEnAcumuladoStock(
        codigoEmpresa, ejercicio, articulo, codigoAlmacen, 
        unidadStockNormalizada, partida, codigoColor, codigoTalla01, 
        transaction
      );

      console.log(`[AJUSTE MANUAL] ${articulo} | ¿Existe en AcumuladoStock?: ${existeEnAcumuladoStock}`);

      // 2. ACTUALIZAR AcumuladoStockUbicacion (SIEMPRE se actualiza)
      await actualizarAcumuladoStockUbicacion(
        ajuste, codigoEmpresa, ejercicio, transaction
      );

      // 3. ACTUALIZAR O INSERTAR en AcumuladoStock
      if (existeEnAcumuladoStock) {
        console.log(`[AJUSTE MANUAL] Actualizando AcumuladoStock (existente): ${articulo}`);
        await actualizarAcumuladoStock(
          ajuste, codigoEmpresa, ejercicio, transaction
        );
      } else {
        console.log(`[AJUSTE MANUAL] Insertando nuevo registro en AcumuladoStock (principal): ${articulo}`);
        await insertarAcumuladoStock(
          ajuste, codigoEmpresa, ejercicio, transaction
        );
      }
    }

    await transaction.commit();

    res.json({ 
      success: true, 
      mensaje: `Ajustes realizados correctamente. ${ajustes.length} ubicaciones actualizadas en ambas tablas.` 
    });

  } catch (error) {
    await transaction.rollback();
    console.error('[ERROR AJUSTAR INVENTARIO]', error);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al realizar los ajustes',
      error: error.message 
    });
  }
});

// 🔥 NUEVA FUNCIÓN: Verificar si existe en AcumuladoStock
async function verificarExistenciaEnAcumuladoStock(
  codigoEmpresa, ejercicio, articulo, codigoAlmacen, 
  unidadStock, partida, codigoColor, codigoTalla01, 
  transaction
) {
  try {
    const result = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('tipoUnidad', sql.VarChar, unidadStock)
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
      .query(`
        SELECT COUNT(*) as Existe
        FROM AcumuladoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND CodigoAlmacen = @codigoAlmacen
          AND CodigoArticulo = @codigoArticulo
          AND (
            (TipoUnidadMedida_ = @tipoUnidad)
            OR 
            (TipoUnidadMedida_ = '' AND @tipoUnidad = '')
          )
          AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
          AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
          AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
          AND Periodo = 99
      `);

    return result.recordset[0].Existe > 0;
  } catch (error) {
    console.error('[ERROR VERIFICANDO EXISTENCIA EN ACUMULADOSTOCK]', error);
    return false;
  }
}

// 🔥 NUEVA FUNCIÓN: Insertar en AcumuladoStock (para nuevos registros)
async function insertarAcumuladoStock(ajuste, codigoEmpresa, ejercicio, transaction) {
  const { 
    articulo, 
    codigoAlmacen, 
    ubicacionStr, 
    partida, 
    unidadStock, 
    nuevaCantidad,
    codigoColor, 
    codigoTalla01 
  } = ajuste;

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .input('unidadSaldo', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
    .input('unidadSaldoTipo', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
    .query(`
      INSERT INTO AcumuladoStock (
        CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
        CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
        UnidadSaldo, UnidadSaldoTipo_, Periodo
      ) VALUES (
        @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
        @codigoArticulo, @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla,
        @unidadSaldo, @unidadSaldoTipo, 99
      )
    `);

  console.log(`[AJUSTE MANUAL] AcumuladoStock INSERTADO (nuevo): ${articulo} | ${ubicacionNormalizada} -> ${nuevaCantidad}`);
}

// 🔥 FUNCIÓN MODIFICADA: Actualizar AcumuladoStock (para registros existentes)
async function actualizarAcumuladoStock(ajuste, codigoEmpresa, ejercicio, transaction) {
  const { 
    articulo, 
    codigoAlmacen, 
    ubicacionStr, 
    partida, 
    unidadStock, 
    nuevaCantidad,
    codigoColor, 
    codigoTalla01 
  } = ajuste;

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

  await new sql.Request(transaction)
    .input('nuevaCantidad', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.SmallInt, ejercicio)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidad', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .query(`
      UPDATE AcumuladoStock
      SET 
        UnidadSaldoTipo_ = @nuevaCantidad,
        UnidadSaldo = @nuevaCantidad,
        Ubicacion = @ubicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio = @ejercicio
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND (
          (TipoUnidadMedida_ = @tipoUnidad)
          OR 
          (TipoUnidadMedida_ = '' AND @tipoUnidad = '')
        )
        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
        AND Periodo = 99
    `);

  console.log(`[AJUSTE MANUAL] AcumuladoStock ACTUALIZADO (existente): ${articulo} | ${ubicacionNormalizada} -> ${nuevaCantidad}`);
}

// 🔥 FUNCIÓN MODIFICADA: Actualizar AcumuladoStockUbicacion
async function actualizarAcumuladoStockUbicacion(ajuste, codigoEmpresa, ejercicio, transaction) {
  const { 
    articulo, 
    codigoAlmacen, 
    ubicacionStr, 
    partida, 
    unidadStock, 
    nuevaCantidad,
    codigoColor, 
    codigoTalla01 
  } = ajuste;

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

  // 1. ELIMINAR registro existente en AcumuladoStockUbicacion
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      DELETE FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio = @ejercicio
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND Ubicacion = @ubicacion
        AND (TipoUnidadMedida_ = @tipoUnidadMedida OR (TipoUnidadMedida_ IS NULL AND @tipoUnidadMedida = ''))
        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
        AND Periodo = 99
    `);

  // 2. INSERTAR nuevo registro solo si la cantidad no es cero
  if (parseFloat(nuevaCantidad) !== 0) {
    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacionNormalizada)
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada)
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
      .input('unidadSaldo', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
      .input('unidadSaldoTipo', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
      .query(`
        INSERT INTO AcumuladoStockUbicacion (
          CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
          CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
          UnidadSaldo, UnidadSaldoTipo_, Periodo
        ) VALUES (
          @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
          @codigoArticulo, @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla,
          @unidadSaldo, @unidadSaldoTipo, 99
        )
      `);
  }

  console.log(`[AJUSTE MANUAL] AcumuladoStockUbicacion actualizado: ${articulo} | ${ubicacionNormalizada} -> ${nuevaCantidad}`);
}

// 🔥 NUEVA FUNCIÓN: Verificar si es ubicación principal en AcumuladoStock
async function esUbicacionPrincipalEnAcumuladoStock(
  codigoEmpresa, ejercicio, articulo, codigoAlmacen, 
  unidadStock, partida, codigoColor, codigoTalla01, 
  ubicacion, transaction
) {
  try {
    const result = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('tipoUnidad', sql.VarChar, unidadStock)
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
      .input('ubicacion', sql.VarChar, ubicacion)
      .query(`
        SELECT COUNT(*) as EsPrincipal
        FROM AcumuladoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND CodigoAlmacen = @codigoAlmacen
          AND CodigoArticulo = @codigoArticulo
          AND (
            (TipoUnidadMedida_ = @tipoUnidad)
            OR 
            (TipoUnidadMedida_ = '' AND @tipoUnidad = '')
          )
          AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
          AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
          AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
          AND Ubicacion = @ubicacion
          AND Periodo = 99
      `);

    return result.recordset[0].EsPrincipal > 0;
  } catch (error) {
    console.error('[ERROR VERIFICANDO UBICACIÓN PRINCIPAL]', error);
    return false;
  }
}

// 🔥 NUEVA FUNCIÓN: Actualizar solo AcumuladoStockUbicacion
async function actualizarAcumuladoStockUbicacion(ajuste, codigoEmpresa, ejercicio, transaction) {
  const { 
    articulo, 
    codigoAlmacen, 
    ubicacionStr, 
    partida, 
    unidadStock, 
    nuevaCantidad,
    codigoColor, 
    codigoTalla01 
  } = ajuste;

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

  // 1. ELIMINAR registro existente en AcumuladoStockUbicacion
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      DELETE FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio = @ejercicio
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND Ubicacion = @ubicacion
        AND (TipoUnidadMedida_ = @tipoUnidadMedida OR (TipoUnidadMedida_ IS NULL AND @tipoUnidadMedida = ''))
        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
        AND Periodo = 99
    `);

  // 2. INSERTAR nuevo registro solo si la cantidad no es cero
  if (parseFloat(nuevaCantidad) !== 0) {
    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacionNormalizada)
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada)
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
      .input('unidadSaldo', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
      .input('unidadSaldoTipo', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
      .query(`
        INSERT INTO AcumuladoStockUbicacion (
          CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
          CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
          UnidadSaldo, UnidadSaldoTipo_, Periodo
        ) VALUES (
          @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
          @codigoArticulo, @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla,
          @unidadSaldo, @unidadSaldoTipo, 99
        )
      `);
  }

  console.log(`[AJUSTE MANUAL] AcumuladoStockUbicacion actualizado: ${articulo} | ${ubicacionNormalizada} -> ${nuevaCantidad}`);
}

// 🔥 NUEVA FUNCIÓN: Actualizar AcumuladoStock (solo para ubicación principal)
async function actualizarAcumuladoStockPrincipal(ajuste, codigoEmpresa, ejercicio, transaction) {
  const { 
    articulo, 
    codigoAlmacen, 
    ubicacionStr, 
    partida, 
    unidadStock, 
    nuevaCantidad,
    codigoColor, 
    codigoTalla01 
  } = ajuste;

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

  await new sql.Request(transaction)
    .input('nuevaCantidad', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.SmallInt, ejercicio)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidad', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .query(`
      UPDATE AcumuladoStock
      SET 
        UnidadSaldoTipo_ = @nuevaCantidad,
        UnidadSaldo = @nuevaCantidad
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio = @ejercicio
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND (
          (TipoUnidadMedida_ = @tipoUnidad)
          OR 
          (TipoUnidadMedida_ = '' AND @tipoUnidad = '')
        )
        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
        AND Ubicacion = @ubicacion
        AND Periodo = 99
    `);

  console.log(`[AJUSTE MANUAL] AcumuladoStock actualizado (principal): ${articulo} | ${ubicacionNormalizada} -> ${nuevaCantidad}`);
}

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
// ✅ CONFIGURACIÓN SIMPLIFICADA - GARANTIZADA
// ============================================

// 1. Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'dist')));

// 2. Manejar rutas del frontend (SPA)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/PedidosScreen', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/designar-rutas', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/rutas', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/confirmacion-entrega', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/detalle-albaran', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/pedidos-asignados', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/albaranes-asignados', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/traspasos', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/inventario', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.get('/gestion-documental', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ============================================
// ✅ INICIAR SERVIDOR PARA PRODUCCIÓN
// ============================================
async function iniciarServidor() {
  try {
    await conectarDB();
    
    app.listen(PUBLIC_PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor backend corriendo en http://0.0.0.0:${PUBLIC_PORT}`);
      console.log(`📱 Accesible desde: http://${PUBLIC_IP}:${PUBLIC_PORT}`);
      console.log(`🔧 Entorno: ${process.env.NODE_ENV || 'development'}`);
      console.log('🎯 Orígenes CORS permitidos:', allowedOrigins);
    });
    
  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
}

// Manejo de cierre graceful
process.on('SIGINT', async () => {
  console.log('🛑 Cerrando servidor...');
  if (poolGlobal) {
    await poolGlobal.close();
  }
  process.exit(0);
});

iniciarServidor();