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
// ✅ 5. PEDIDOS SCREEN
// ============================================

// ✅ 5.1 PEDIDOS PENDIENTES (VERSIÓN COMPLETA)
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

    // 7. Consulta principal
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
          c.Status,
          c.StatusAprobado,
          c.EsVoluminoso,
          c.EmpleadoAsignado,
          l.CodigoArticulo,
          l.DescripcionArticulo,
          l.Descripcion2Articulo,
          l.UnidadesPedidas, 
          l.UnidadesPendientes,
          l.CodigoAlmacen,
          a.CodigoAlternativo,
          l.LineasPosicion AS MovPosicionLinea,
          l.UnidadMedida1_ AS UnidadBase,
          l.UnidadMedida2_ AS UnidadAlternativa,
          l.FactorConversion_ AS FactorConversion,
          emp.Nombre AS Vendedor,
          c.Contacto,
          c.Telefono AS TelefonoContacto
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
        WHERE c.Estado = 0
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
          EmpleadoAsignado: row.EmpleadoAsignado,
          Vendedor: row.Vendedor,
          Contacto: row.Contacto,
          TelefonoContacto: row.TelefonoContacto,
          Status: row.Status,
          StatusAprobado: row.StatusAprobado,
          EsVoluminoso: row.EsVoluminoso,
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
        codigoAlmacen: row.CodigoAlmacen,
        codigoAlternativo: row.CodigoAlternativo,
        detalles: detalles.length > 0 ? detalles : null,
        movPosicionLinea: row.MovPosicionLinea,
        unidadBase: row.UnidadBase,
        unidadAlternativa: row.UnidadAlternativa,
        factorConversion: row.FactorConversion
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

// ✅ 5.3 ACTUALIZAR LÍNEA DE PEDIDO

app.post('/actualizarLineaPedido', async (req, res) => {
  const datosLinea = req.body;

  if (
    !datosLinea.codigoEmpresa ||
    !datosLinea.ejercicio ||
    !datosLinea.numeroPedido ||
    !datosLinea.codigoArticulo ||
    !datosLinea.cantidadExpedida ||
    !datosLinea.ubicacion
  ) {
    return res.status(400).json({ success: false, mensaje: 'Datos incompletos.' });
  }

  try {
    const request = poolGlobal.request();
    request.input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa);
    request.input('ejercicio', sql.SmallInt, datosLinea.ejercicio);
    request.input('numeroPedido', sql.Int, datosLinea.numeroPedido);
    request.input('codigoArticulo', sql.VarChar, datosLinea.codigoArticulo);
    request.input('cantidadExpedida', sql.Decimal(18, 4), datosLinea.cantidadExpedida);
    request.input('ubicacion', sql.VarChar, datosLinea.ubicacion);
    request.input('serie', sql.VarChar, datosLinea.serie || '');
    
    const partidaValue = datosLinea.partida || '';
    request.input('partida', sql.VarChar, partidaValue);

    const resultLinea = await request.query(`
      SELECT CodigoAlmacen, UnidadMedida1_, Precio
      FROM LineasPedidoCliente
      WHERE 
        CodigoEmpresa = @codigoEmpresa
        AND EjercicioPedido = @ejercicio
        AND NumeroPedido = @numeroPedido
        AND CodigoArticulo = @codigoArticulo
        AND SeriePedido = ISNULL(@serie, '')
    `);

    if (resultLinea.recordset.length === 0) {
      return res.status(404).json({ success: false, mensaje: 'Línea de pedido no encontrada' });
    }

    const lineaData = resultLinea.recordset[0];
    const codigoAlmacen = lineaData.CodigoAlmacen;
    const unidadMedida = lineaData.UnidadMedida1_;
    const precio = lineaData.Precio;
    
    request.input('codigoAlmacen', sql.VarChar, codigoAlmacen);
    request.input('unidadMedida', sql.VarChar, unidadMedida);
    request.input('precio', sql.Decimal(18, 4), precio);

    await request.query(`
      UPDATE LineasPedidoCliente
      SET UnidadesPendientes = UnidadesPendientes - @cantidadExpedida
      WHERE 
        CodigoEmpresa = @codigoEmpresa
        AND EjercicioPedido = @ejercicio
        AND NumeroPedido = @numeroPedido
        AND CodigoArticulo = @codigoArticulo
        AND SeriePedido = ISNULL(@serie, '')
    `);

    await request.query(`
      UPDATE AcumuladoStockUbicacion
      SET UnidadSaldo = UnidadSaldo - @cantidadExpedida
      WHERE 
        CodigoEmpresa = @codigoEmpresa
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND Ubicacion = @ubicacion
        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
    `);

    const fechaActual = new Date();
    const periodo = fechaActual.getMonth() + 1;
    const importe = precio * datosLinea.cantidadExpedida;
    
    request.input('fecha', sql.DateTime, fechaActual);
    request.input('periodo', sql.Int, periodo);
    request.input('tipoMovimiento', sql.SmallInt, 2);
    request.input('importe', sql.Decimal(18, 4), importe);

    await request.query(`
      INSERT INTO MovimientoStock (
        CodigoEmpresa,
        Ejercicio,
        Periodo,
        FechaRegistro,
        TipoMovimiento,
        CodigoArticulo,
        CodigoAlmacen,
        UnidadMedida1_, 
        Importe,
        Ubicacion,
        Partida,
        Unidades
      ) VALUES (
        @codigoEmpresa,
        @ejercicio,
        @periodo,
        @FechaRegistro,
        @tipoMovimiento,
        @codigoArticulo,
        @codigoAlmacen,
        @unidadMedida,
        @importe,
        @ubicacion,
        @partida,
        @cantidadExpedida
      )
    `);

    res.json({ success: true, mensaje: 'Línea actualizada y stock descontado' });
  } catch (err) {
    console.error('[ERROR ACTUALIZAR LINEA PEDIDO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al actualizar línea de pedido',
      error: err.message,
      stack: err.stack
    });
  }
});

// ✅ 5.4 GENERAR ALBARÁN PARCIAL
app.post('/generarAlbaranParcial', async (req, res) => {
  const { codigoEmpresa, ejercicio, serie, numeroPedido, lineasExpedidas } = req.body;

  if (!codigoEmpresa || !ejercicio || numeroPedido == null || !lineasExpedidas) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos del pedido.' });
  }

  // Validar que haya líneas
  if (lineasExpedidas.length === 0) {
    return res.status(400).json({ success: false, mensaje: 'No hay líneas para expedir.' });
  }

  try {
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

    const cabeceraPedido = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('serie', sql.VarChar, serie || '')
      .query(`
        SELECT TOP 1 *
        FROM CabeceraPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numeroPedido
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
      `);

    if (cabeceraPedido.recordset.length === 0) {
      return res.status(404).json({ success: false, mensaje: 'Pedido no encontrado.' });
    }

    const cab = cabeceraPedido.recordset[0];

    // Calcular importe líquido total
    let importeLiquidoTotal = 0;
    lineasExpedidas.forEach(linea => {
      importeLiquidoTotal += (linea.precio * linea.cantidad);
    });

    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, cab.CodigoEmpresa)
      .input('ejercicio', sql.SmallInt, cab.EjercicioPedido)
      .input('serie', sql.VarChar, cab.SeriePedido || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, cab.CodigoCliente)
      .input('razonSocial', sql.VarChar, cab.RazonSocial)
      .input('domicilio', sql.VarChar, cab.Domicilio)
      .input('municipio', sql.VarChar, cab.Municipio)
      .input('fecha', sql.DateTime, new Date())
      .input('numeroLineas', sql.Int, lineasExpedidas.length)
      .input('importeLiquido', sql.Decimal(18, 4), importeLiquidoTotal)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
          NumeroLineas, ImporteLiquido, EsParcial
        ) VALUES (
          @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
          @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
          @numeroLineas, @importeLiquido, 1
        )
      `);

    // Insertar líneas del albarán
    for (const [index, linea] of lineasExpedidas.entries()) {
      const importeLinea = linea.precio * linea.cantidad;
      
      await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, serie || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, index + 1)
        .input('codigoArticulo', sql.VarChar, linea.codigoArticulo)
        .input('descripcionArticulo', sql.VarChar, linea.descripcionArticulo)
        .input('unidades', sql.Decimal(18, 4), linea.cantidad)
        .input('precio', sql.Decimal(18, 4), linea.precio)
        .input('codigoAlmacen', sql.VarChar, linea.codigoAlmacen || '')
        .input('partida', sql.VarChar, linea.partida || '')
        .input('importeNeto', sql.Decimal(18, 4), importeLinea)
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, CodigoArticulo, DescripcionArticulo, Unidades, Precio,
            CodigoAlmacen, Partida, ImporteNeto
          ) VALUES (
            @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
            @orden, @codigoArticulo, @descripcionArticulo, @unidades, @precio,
            @codigoAlmacen, @partida, @importeNeto
          )
        `);
    }

    res.json({ 
      success: true, 
      mensaje: 'Albarán parcial generado',
      numeroAlbaran,
      serieAlbaran: serie || '',
      esParcial: true
    });
  } catch (err) {
    console.error('[ERROR ALBARAN PARCIAL]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al generar albarán parcial.',
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


// ✅ 6.4 ASIGNAR EMPLEADO A MÚLTIPLES PEDIDOS
app.post('/asignarPedidosAEmpleado', async (req, res) => {
  const { pedidos, codigoEmpleado } = req.body;
  
  if (!pedidos || !Array.isArray(pedidos) || pedidos.length === 0 || !codigoEmpleado) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Datos inválidos para asignación' 
    });
  }

  const transaction = new sql.Transaction(poolGlobal);
  
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    
    for (const pedido of pedidos) {
      await request
        .input('codigoEmpresa', sql.SmallInt, pedido.codigoEmpresa)
        .input('ejercicio', sql.SmallInt, pedido.ejercicioPedido)
        .input('serie', sql.VarChar, pedido.seriePedido || '')
        .input('numeroPedido', sql.Int, pedido.numeroPedido)
        .input('codigoEmpleado', sql.VarChar, codigoEmpleado)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET CodigoEmpleadoAsignado = @codigoEmpleado
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
    }
    
    await transaction.commit();
    res.json({ success: true, mensaje: 'Pedidos asignados correctamente' });
  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR ASIGNAR PEDIDOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al asignar pedidos',
      error: err.message 
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
// ✅ 7. ALBARANES SCREEN (COMPLETO Y CORREGIDO)
// ============================================

// ✅ 7.1 GENERAR ALBARÁN AL ASIGNAR REPARTIDOR (CORREGIDO)
app.post('/asignarRepartoYGenerarAlbaran', async (req, res) => {
  const { codigoEmpresa, numeroPedido, codigoRepartidor } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !numeroPedido || !codigoRepartidor) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos: empresa, pedido y repartidor.' 
    });
  }

  try {
    // 1. Verificar permisos del usuario que asigna
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
          AND Estado = 1
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

    // 4. Obtener el empleado asignado (repartidor)
    const repartidorResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('usuario', sql.VarChar, codigoRepartidor)
      .query(`
        SELECT CodigoCliente
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
          AND CodigoCategoriaCliente_ = 'emp'
          AND StatusDesignarRutas = '-1'
      `);

    if (repartidorResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Repartidor no encontrado' 
      });
    }

    const empleadoAsignado = repartidorResult.recordset[0].CodigoCliente;

    // 5. Crear cabecera del albarán con empleado asignado
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
      .input('numeroLineas', sql.Int, pedido.NumeroLineas)
      .input('importeLiquido', sql.Decimal(18,4), pedido.ImporteLiquido)
      .input('empleadoAsignado', sql.VarChar, empleadoAsignado)
      .input('obra', sql.VarChar, pedido.obra || '')
      .input('contacto', sql.VarChar, pedido.Contacto || '')
      .input('telefonoContacto', sql.VarChar, pedido.TelefonoContacto || '')
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
          NumeroLineas, ImporteLiquido, EmpleadoAsignado,
          obra, Contacto, Telefono
        ) VALUES (
          @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
          @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
          @numeroLineas, @importeLiquido, @empleadoAsignado,
          @obra, @contacto, @telefonoContacto
        )
      `);

    // 6. Copiar líneas del pedido
    const lineas = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, pedido.EjercicioPedido)
      .input('serie', sql.VarChar, pedido.SeriePedido || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT *
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

    // 7. Actualizar estado del pedido
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        UPDATE CabeceraPedidoCliente
        SET Estado = 2
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
        repartidor: empleadoAsignado
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

// ✅ 7.2 ALBARANES PENDIENTES (CORREGIDO)
app.get('/albaranesPendientes', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  const usuario = req.user.UsuarioLogicNet;

  try {
    // Verificar permisos del usuario
    const userPermResult = await poolGlobal.request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador, StatusUsuarioAvanzado, StatusVerAlbaranesAsignados 
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
      `);

    if (userPermResult.recordset.length === 0) {
      return res.status(403).json({ success: false, mensaje: 'Usuario no encontrado' });
    }

    const userPerms = userPermResult.recordset[0];
    const esAdmin = userPerms.StatusAdministrador === -1;
    const esUsuarioAvanzado = userPerms.StatusUsuarioAvanzado === -1;
    const esRepartidor = userPerms.StatusVerAlbaranesAsignados === -1;

    // Construir consulta base
    let query = `
      SELECT 
        c.NumeroAlbaran, 
        c.SerieAlbaran, 
        c.EjercicioAlbaran,
        c.CodigoEmpresa,
        c.FechaAlbaran, 
        c.CodigoCliente, 
        c.RazonSocial, 
        c.Domicilio, 
        c.Municipio, 
        c.ImporteLiquido,
        c.obra,
        c.Contacto,
        c.Telefono AS TelefonoContacto,
        rep.Nombre AS Vendedor,
        c.EmpleadoAsignado,
        empAsignado.Nombre AS NombreRepartidor
      FROM CabeceraAlbaranCliente c
      LEFT JOIN Clientes rep ON rep.CodigoCliente = c.CodigoRepartidor
        AND rep.CodigoEmpresa = c.CodigoEmpresa
      LEFT JOIN Clientes empAsignado ON empAsignado.CodigoCliente = c.EmpleadoAsignado
        AND empAsignado.CodigoEmpresa = c.CodigoEmpresa
      WHERE c.CodigoEmpresa = @codigoEmpresa
        AND c.FechaEntrega IS NULL
    `;

    // Filtrar por repartidor si no es admin
    if (esRepartidor && !esAdmin && !esUsuarioAvanzado) {
      query += ` AND c.EmpleadoAsignado IN (
        SELECT CodigoCliente 
        FROM Clientes 
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
      )`;
    }

    query += ' ORDER BY c.FechaAlbaran DESC';

    const request = poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa);

    if (esRepartidor && !esAdmin && !esUsuarioAvanzado) {
      request.input('usuario', sql.VarChar, usuario);
    }

    const result = await request.query(query);

    // Procesar resultados
    const albaranes = result.recordset.map(albaran => ({
      id: `${albaran.EjercicioAlbaran}-${albaran.SerieAlbaran || ''}-${albaran.NumeroAlbaran}`,
      ejercicio: albaran.EjercicioAlbaran,
      serie: albaran.SerieAlbaran || '',
      numero: albaran.NumeroAlbaran,
      codigoEmpresa: albaran.CodigoEmpresa,
      albaran: `${albaran.SerieAlbaran || ''}${albaran.SerieAlbaran ? '-' : ''}${albaran.NumeroAlbaran}`,
      cliente: albaran.RazonSocial,
      direccion: `${albaran.Domicilio}, ${albaran.Municipio}`,
      FechaAlbaran: albaran.FechaAlbaran,
      importeLiquido: albaran.ImporteLiquido,
      obra: albaran.obra,
      contacto: albaran.Contacto,
      telefonoContacto: albaran.TelefonoContacto,
      vendedor: albaran.Vendedor,
      empleadoAsignado: albaran.EmpleadoAsignado,
      nombreRepartidor: albaran.NombreRepartidor
    }));

    res.json(albaranes);
  } catch (err) {
    console.error('[ERROR ALBARANES PENDIENTES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener albaranes',
      error: err.message 
    });
  }
});

// ✅ 7.3 OBTENER PEDIDOS PREPARADOS (CORREGIDO)
app.get('/pedidos-preparados', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
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
          emp.Nombre AS Vendedor,
          p.CodigoEmpresa
        FROM CabeceraPedidoCliente p
        LEFT JOIN Clientes emp ON 
          emp.CodigoCliente = p.CodigoEmpleadoAsignado 
          AND emp.CodigoEmpresa = p.CodigoEmpresa
        WHERE p.CodigoEmpresa = @codigoEmpresa
          AND p.Estado = 1
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

// ✅ 7.4 OBTENER REPARTIDORES (CORREGIDO)
app.get('/repartidores', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          CodigoCliente AS id,
          Nombre AS nombre
        FROM Clientes
        WHERE CodigoCategoriaCliente_ = 'emp' 
          AND StatusDesignarRutas = '-1'
          AND CodigoEmpresa = @codigoEmpresa
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

// ✅ 7.5 MARCAR ALBARÁN COMO COMPLETADO (CORREGIDO)
app.post('/completar-albaran', async (req, res) => {
  const { codigoEmpresa, ejercicio, serie, numeroAlbaran } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroAlbaran) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos.' 
    });
  }

  try {
    // 1. Verificar si el usuario tiene permiso
    const permisoResult = await poolGlobal.request()
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

    if (permisoResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Albarán no encontrado' 
      });
    }

    const albaran = permisoResult.recordset[0];
    const esAdmin = req.user.StatusAdministrador === -1;
    const esUsuarioAvanzado = req.user.StatusUsuarioAvanzado === -1;
    
    // 2. Verificar si el usuario actual es el repartidor asignado
    if (!esAdmin && !esUsuarioAvanzado) {
      const usuarioActualResult = await poolGlobal.request()
        .input('usuario', sql.VarChar, usuario)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          SELECT CodigoCliente
          FROM Clientes
          WHERE UsuarioLogicNet = @usuario
            AND CodigoEmpresa = @codigoEmpresa
        `);

      if (usuarioActualResult.recordset.length === 0 || 
          usuarioActualResult.recordset[0].CodigoCliente !== albaran.EmpleadoAsignado) {
        return res.status(403).json({ 
          success: false, 
          mensaje: 'No tienes permiso para completar este albarán' 
        });
      }
    }

    // 3. Actualizar el estado del albarán
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET FechaEntrega = GETDATE()
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

// ✅ 7.6 OBTENER PEDIDOS PREPARADOS (CORREGIDO)
app.get('/pedidos-preparados', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
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
          emp.Nombre AS Vendedor,
          p.CodigoEmpresa
        FROM CabeceraPedidoCliente p
        LEFT JOIN Clientes emp ON 
          emp.CodigoCliente = p.CodigoEmpleadoAsignado 
          AND emp.CodigoEmpresa = p.CodigoEmpresa
        WHERE p.CodigoEmpresa = @codigoEmpresa
          AND p.Estado = 1
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

// ✅ 7.7 OBTENER REPARTIDORES (CORREGIDO)
app.get('/repartidores', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          UsuarioLogicNet AS id,
          Nombre AS nombre
        FROM Clientes
        WHERE CodigoCategoriaCliente_ = 'emp' 
          AND StatusDesignarRutas = '-1'
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


// ============================================
// ✅ 8. ASIGNAR ALBARANES SCREEN
// ============================================

// ✅ 8.1 ASIGNAR PEDIDO A REPARTIDOR

app.post('/asignarPedido', async (req, res) => {
  const { numeroPedido, codigoRepartidor, codigoEmpresa } = req.body;

  if (!numeroPedido || !codigoRepartidor || !codigoEmpresa) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos requeridos.' });
  }

  try {
    // Obtener detalles del pedido
    const pedidoResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT EjercicioPedido, SeriePedido 
        FROM CabeceraPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND NumeroPedido = @numeroPedido
      `);

    if (pedidoResult.recordset.length === 0) {
      return res.status(404).json({ success: false, mensaje: 'Pedido no encontrado.' });
    }

    const pedido = pedidoResult.recordset[0];
    
    // Insertar o actualizar asignación
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioPedido', sql.SmallInt, pedido.EjercicioPedido)
      .input('seriePedido', sql.VarChar, pedido.SeriePedido || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('codigoRepartidor', sql.VarChar, codigoRepartidor)
      .query(`
        MERGE INTO AsignacionesPedidos AS target
        USING (VALUES (
          @codigoEmpresa, 
          @ejercicioPedido, 
          @seriePedido, 
          @numeroPedido, 
          @codigoRepartidor
        )) AS source (
          CodigoEmpresa, 
          EjercicioPedido, 
          SeriePedido, 
          NumeroPedido, 
          CodigoRepartidor
        )
        ON target.CodigoEmpresa = source.CodigoEmpresa
          AND target.NumeroPedido = source.NumeroPedido
        WHEN MATCHED THEN
          UPDATE SET CodigoRepartidor = source.CodigoRepartidor
        WHEN NOT MATCHED THEN
          INSERT (
            CodigoEmpresa, 
            EjercicioPedido, 
            SeriePedido, 
            NumeroPedido, 
            CodigoRepartidor
          ) 
          VALUES (
            source.CodigoEmpresa, 
            source.EjercicioPedido, 
            source.SeriePedido, 
            source.NumeroPedido, 
            source.CodigoRepartidor
          );
      `);

    res.json({ success: true, mensaje: 'Asignación guardada correctamente' });
  } catch (err) {
    console.error('[ERROR ASIGNAR PEDIDO]', err);
    res.status(500).json({ success: false, mensaje: 'Error al asignar pedido', error: err.message });
  }
});

// ✅ 8.2 ASIGNAR ALBARÁN A USUARIO
app.post('/asignarAlbaran', async (req, res) => {
  const { codigoEmpresa, ejercicio, serie, numeroAlbaran, usuarioAsignado } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroAlbaran || !usuarioAsignado) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos requeridos.' });
  }

  try {
    // Verificar permisos del usuario que asigna
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
      return res.status(403).json({ success: false, mensaje: 'No tienes permiso para asignar albaranes' });
    }

    // Insertar asignación
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('usuarioAsignado', sql.VarChar, usuarioAsignado)
      .query(`
        INSERT INTO AsignacionesAlbaranes (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran, CodigoUsuarioAsignado
        ) VALUES (
          @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran, @usuarioAsignado
        )
      `);

    res.json({ success: true, mensaje: 'Albarán asignado correctamente' });
  } catch (err) {
    console.error('[ERROR ASIGNAR ALBARÁN]', err);
    res.status(500).json({ success: false, mensaje: 'Error al asignar albarán', error: err.message });
  }
});

// ✅ 8.3 OBTENER PEDIDOS PREPARADOS (NUEVO)
app.get('/pedidos-preparados', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
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
          emp.Nombre AS Vendedor
        FROM CabeceraPedidoCliente p
        LEFT JOIN Clientes emp ON 
          emp.CodigoCliente = p.CodigoEmpleadoAsignado 
          AND emp.CodigoEmpresa = p.CodigoEmpresa
        WHERE p.CodigoEmpresa = @codigoEmpresa
          AND p.Estado = 1  -- Completado (preparado)
          AND p.EstadoPedido = 0  -- Pendiente de asignar reparto
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

// ✅ 8.4 ASIGNAR REPARTO Y GENERAR ALBARÁN (NUEVO)
app.post('/asignar-reparto', async (req, res) => {
  const { pedidoId, repartidorId } = req.body;
  const codigoEmpresa = req.user.CodigoEmpresa;
  
  if (!codigoEmpresa || !pedidoId || !repartidorId) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan parámetros requeridos.' 
    });
  }

  try {
    // 1. Obtener datos del pedido
    const pedidoResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('pedidoId', sql.Int, pedidoId)
      .query(`
        SELECT *
        FROM CabeceraPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND NumeroPedido = @pedidoId
      `);
      
    if (pedidoResult.recordset.length === 0) {
      return res.status(404).json({ success: false, mensaje: 'Pedido no encontrado' });
    }
    
    const pedido = pedidoResult.recordset[0];
    
    // 2. Generar albarán con fecha actual
    const nextAlbaran = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, new Date().getFullYear())
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

    // Insertar cabecera albarán
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, new Date().getFullYear())
      .input('serie', sql.VarChar, pedido.SeriePedido || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, pedido.CodigoCliente)
      .input('razonSocial', sql.VarChar, pedido.RazonSocial)
      .input('domicilio', sql.VarChar, pedido.Domicilio)
      .input('municipio', sql.VarChar, pedido.Municipio)
      .input('fecha', sql.DateTime, fechaActual)
      .input('numeroLineas', sql.Int, pedido.NumeroLineas || 0)
      .input('importeLiquido', sql.Decimal(18,4), pedido.ImporteLiquido || 0)
      .input('codigoRepartidor', sql.VarChar, repartidorId)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
          NumeroLineas, ImporteLiquido, CodigoRepartidor
        ) VALUES (
          @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
          @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
          @numeroLineas, @importeLiquido, @codigoRepartidor
        )
      `);
    
    // Copiar líneas del pedido al albarán
    const lineas = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, pedido.EjercicioPedido)
      .input('serie', sql.VarChar, pedido.SeriePedido || '')
      .input('numeroPedido', sql.Int, pedido.NumeroPedido)
      .query(`
        SELECT *
        FROM LineasPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND SeriePedido = @serie
          AND NumeroPedido = @numeroPedido
      `);

    for (const [index, linea] of lineas.recordset.entries()) {
      await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, new Date().getFullYear())
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

    // 3. Actualizar estado del pedido
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('pedidoId', sql.Int, pedidoId)
      .query(`
        UPDATE CabeceraPedidoCliente
        SET EstadoPedido = 1  -- Marcado como servido
        WHERE CodigoEmpresa = @codigoEmpresa
          AND NumeroPedido = @pedidoId
      `);

    res.json({ 
      success: true,
      mensaje: 'Albarán generado y asignado',
      albaran: {
        numero: numeroAlbaran,
        serie: pedido.SeriePedido || '',
        fecha: fechaActual
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

// ✅ 8.5 ASIGNAR ALBARÁN A USUARIO
app.post('/asignar-albaran', async (req, res) => {
  const { codigoEmpresa, ejercicio, serie, numeroAlbaran, usuarioAsignado } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  // Validar datos requeridos
  if (!codigoEmpresa || !ejercicio || !numeroAlbaran || !usuarioAsignado) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos: codigoEmpresa, ejercicio, numeroAlbaran, usuarioAsignado.' 
    });
  }

  try {
    // 1. Verificar permisos del usuario que asigna
    const permisoResult = await poolGlobal.request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusDesignarRutas
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
      `);
    
    // Si no se encuentra el usuario o no tiene permiso
    if (permisoResult.recordset.length === 0) {
      return res.status(403).json({ 
        success: false, 
        mensaje: 'Usuario no encontrado' 
      });
    }
    
    if (permisoResult.recordset[0].StatusDesignarRutas !== -1) {
      return res.status(403).json({ 
        success: false, 
        mensaje: 'No tienes permiso para asignar albaranes' 
      });
    }

    // 2. Verificar si el albarán existe
    const albaranCheck = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .query(`
        SELECT 1
        FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    if (albaranCheck.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Albarán no encontrado' 
      });
    }

    // 3. Actualizar la asignación en la cabecera del albarán
    const updateResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('usuarioAsignado', sql.VarChar, usuarioAsignado)
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET UsuarioAsignado = @usuarioAsignado
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    // Verificar si se actualizó correctamente
    if (updateResult.rowsAffected[0] === 0) {
      return res.status(500).json({ 
        success: false, 
        mensaje: 'No se pudo actualizar el albarán' 
      });
    }

    res.json({ 
      success: true, 
      mensaje: 'Albarán asignado correctamente',
      datos: {
        albaran: `${serie || ''}${serie ? '-' : ''}${numeroAlbaran}`,
        usuarioAsignado
      }
    });
  } catch (err) {
    console.error('[ERROR ASIGNAR ALBARÁN]', err);
    
    // Manejar específicamente errores de columna faltante
    if (err.message.includes('Invalid column name')) {
      return res.status(500).json({ 
        success: false, 
        mensaje: 'Error en la estructura de la base de datos',
        solucion: 'Ejecute el script para agregar las columnas faltantes'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al asignar albarán',
      error: err.message,
      stack: err.stack
    });
  }
});

// ✅ 8.6 OBTENER REPARTIDORES
app.get('/repartidores', async (req, res) => {
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

// ✅ 8.7 ACTUALIZAR ASIGNACIÓN DE ALBARÁN
app.put('/actualizar-asignacion-albaran', async (req, res) => {
  const { codigoEmpresa, ejercicio, serie, numeroAlbaran, usuarioAsignado } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  // Validar datos requeridos
  if (!codigoEmpresa || !ejercicio || !numeroAlbaran) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos: codigoEmpresa, ejercicio, numeroAlbaran.' 
    });
  }

  try {
    // 1. Verificar permisos del usuario que asigna
    const permisoResult = await poolGlobal.request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusDesignarRutas
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
      `);
    
    // Si no se encuentra el usuario o no tiene permiso
    if (permisoResult.recordset.length === 0 || permisoResult.recordset[0].StatusDesignarRutas !== -1) {
      return res.status(403).json({ 
        success: false, 
        mensaje: 'No tienes permiso para asignar albaranes' 
      });
    }

    // 2. Actualizar la asignación
    const updateResult = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('usuarioAsignado', sql.VarChar, usuarioAsignado || null) // Permitir null para desasignar
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET UsuarioAsignado = @usuarioAsignado
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    if (updateResult.rowsAffected[0] === 0) {
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Albarán no encontrado' 
      });
    }

    res.json({ 
      success: true, 
      mensaje: 'Asignación actualizada correctamente'
    });
  } catch (err) {
    console.error('[ERROR ACTUALIZAR ASIGNACION]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al actualizar asignación',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 9. INVENTARIO SCREEN
// ============================================

// ✅ 9.1 OBTENER STOCK POR ARTÍCULO 

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
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT 
          s.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          s.Ubicacion,
          u.DescripcionUbicacion,
          s.UnidadSaldo AS Cantidad,
          s.TipoUnidadMedida_ AS UnidadMedida,
          art.UnidadMedida2_ AS UnidadBase,
          art.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          art.FactorConversion_ AS FactorConversion,
          s.Partida,
          -- Nuevo campo para agrupación única
          CONCAT(
            s.CodigoAlmacen, 
            '_', 
            s.Ubicacion, 
            '_', 
            s.TipoUnidadMedida_, 
            '_', 
            ISNULL(s.Partida, '')
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
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.CodigoArticulo = @codigoArticulo
          AND s.Periodo = 99
          AND s.UnidadSaldo > 0
        ORDER BY s.CodigoAlmacen, s.Ubicacion, s.TipoUnidadMedida_
      `);
      
    res.json(result.recordset);
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

// ✅ 9.3 OBTENER ARTÍCULOS POR UBICACIÓN 


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
          COUNT(*) OVER() AS TotalCount
        FROM AcumuladoStockUbicacion s
        INNER JOIN Articulos a ON 
          a.CodigoEmpresa = s.CodigoEmpresa AND 
          a.CodigoArticulo = s.CodigoArticulo
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.CodigoAlmacen = @codigoAlmacen
          AND s.Ubicacion = @ubicacion
          AND s.Periodo = 99
          AND s.UnidadSaldo > 0
        ORDER BY a.DescripcionArticulo
        OFFSET ${offset} ROWS
        FETCH NEXT ${pageSize} ROWS ONLY
      `);
      
    res.json({
      success: true,
      articulos: result.recordset.map(item => {
        const { TotalCount, ...rest } = item;
        return rest;
      }),
      total: result.recordset.length > 0 ? result.recordset[0].TotalCount : 0
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

// ✅ 9.4 OBTENER STOCK POR MÚLTIPLES ARTÍCULOS 


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
    const placeholders = articulos.map((_, i) => `@articulo${i}`).join(',');
    
    const query = `
      SELECT 
        s.CodigoArticulo,
        s.CodigoAlmacen,
        a.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        s.UnidadSaldo AS Cantidad,
        s.TipoUnidadMedida_ AS UnidadMedida,
        s.Partida
      FROM AcumuladoStockUbicacion s
      INNER JOIN Almacenes a 
        ON a.CodigoEmpresa = s.CodigoEmpresa 
        AND a.CodigoAlmacen = s.CodigoAlmacen
      LEFT JOIN Ubicaciones u 
        ON u.CodigoEmpresa = s.CodigoEmpresa 
        AND u.CodigoAlmacen = s.CodigoAlmacen 
        AND u.Ubicacion = s.Ubicacion
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND s.Periodo = 99
        AND s.UnidadSaldo > 0
        AND s.CodigoArticulo IN (${placeholders})
    `;

    const request = poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa);

    articulos.forEach((codigo, index) => {
      request.input(`articulo${index}`, sql.VarChar, codigo);
    });

    const result = await request.query(query);

    const grouped = {};
    result.recordset.forEach(row => {
      const articulo = row.CodigoArticulo;
      if (!grouped[articulo]) {
        grouped[articulo] = [];
      }
      
      grouped[articulo].push({
        ubicacion: row.Ubicacion,
        descripcionUbicacion: row.DescripcionUbicacion,
        unidadSaldo: row.Cantidad,
        codigoAlmacen: row.CodigoAlmacen,
        nombreAlmacen: row.NombreAlmacen,
        unidadMedida: row.UnidadMedida,
        partida: row.Partida
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

// ✅ 9.5 OBTENER STOCK TOTAL

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
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, añoActual)
      .query(`
        SELECT 
          s.CodigoArticulo,
          a.DescripcionArticulo,
          a.CodigoFamilia,
          a.CodigoSubfamilia,
          s.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          s.Ubicacion,
          u.DescripcionUbicacion,
          s.Partida,
          s.UnidadSaldo AS Cantidad,
          -- Unidad REAL del stock (crítica)
          s.TipoUnidadMedida_ AS UnidadStock,  -- <<--- Campo CORREGIDO
          a.UnidadMedida2_ AS UnidadBase,
          a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          a.FactorConversion_ AS FactorConversion,
          -- Calcular cantidad en unidad base
          CASE 
            WHEN s.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
              THEN s.UnidadSaldo * a.FactorConversion_
            ELSE s.UnidadSaldo
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
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR STOCK TOTAL]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock total',
      error: err.message 
    });
  }
});

// ✅ 9.6 AJUSTAR INVENTARIO


app.post('/inventario/ajustar', async (req, res) => {
  const { ajustes } = req.body;
  const usuario = req.user.UsuarioLogicNet;
  const codigoEmpresa = req.user.CodigoEmpresa;

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
      // 1. Obtener cantidad actual
      const requestGet = new sql.Request(transaction);
      const result = await requestGet
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
        .input('ubicacion', sql.VarChar, ajuste.ubicacionStr)
        .input('codigoArticulo', sql.VarChar, ajuste.articulo)
        .input('partida', sql.VarChar, ajuste.partida || '') // Manejar NULL
        .query(`
          SELECT 
            TipoUnidadMedida_ AS UnidadMedida, 
            UnidadSaldo AS Cantidad,
            Partida
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoAlmacen = @codigoAlmacen
            AND Ubicacion = @ubicacion
            AND CodigoArticulo = @codigoArticulo
            AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
            AND Periodo = 99
        `);
      
      let cantidadActual = 0;
      let unidadMedida = ajuste.unidadStock || 'unidades'; // Valor por defecto
      let partidaExistente = '';
      
      if (result.recordset.length > 0) {
        cantidadActual = result.recordset[0].Cantidad;
        unidadMedida = result.recordset[0].UnidadMedida || unidadMedida;
        partidaExistente = result.recordset[0].Partida || '';
      }

      const diferencia = ajuste.nuevaCantidad - cantidadActual;
      
      // 2. Actualizar o insertar
      if (result.recordset.length > 0) {
        const requestUpdate = new sql.Request(transaction);
        await requestUpdate
          .input('nuevaCantidad', sql.Decimal(18,4), ajuste.nuevaCantidad)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
          .input('ubicacion', sql.VarChar, ajuste.ubicacionStr)
          .input('codigoArticulo', sql.VarChar, ajuste.articulo)
          .input('partida', sql.VarChar, partidaExistente)
          .query(`
            UPDATE AcumuladoStockUbicacion
            SET UnidadSaldo = @nuevaCantidad
            WHERE CodigoEmpresa = @codigoEmpresa
              AND CodigoAlmacen = @codigoAlmacen
              AND Ubicacion = @ubicacion
              AND CodigoArticulo = @codigoArticulo
              AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
              AND Periodo = 99
          `);
      } else {
        const requestInsert = new sql.Request(transaction);
        await requestInsert
          .input('nuevaCantidad', sql.Decimal(18,4), ajuste.nuevaCantidad)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
          .input('ubicacion', sql.VarChar, ajuste.ubicacionStr)
          .input('codigoArticulo', sql.VarChar, ajuste.articulo)
          .input('partida', sql.VarChar, ajuste.partida || '')
          .input('unidadMedida', sql.VarChar, unidadMedida)
          .query(`
            INSERT INTO AcumuladoStockUbicacion (
              CodigoEmpresa, CodigoAlmacen, Ubicacion, 
              CodigoArticulo, UnidadSaldo, Periodo, Partida, TipoUnidadMedida_
            ) VALUES (
              @codigoEmpresa, @codigoAlmacen, @ubicacion,
              @codigoArticulo, @nuevaCantidad, 99, @partida, @unidadMedida
            )
          `);
      }
      
      // 3. Registrar movimiento (CON TODOS LOS CAMPOS NECESARIOS)
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
          .input('tipoMovimiento', sql.SmallInt, 5) // 5: Ajuste
          .input('codigoArticulo', sql.VarChar, ajuste.articulo)
          .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
          .input('ubicacion', sql.VarChar, ajuste.ubicacionStr)
          .input('partida', sql.VarChar, partidaExistente || ajuste.partida || '')
          .input('diferencia', sql.Decimal(18,4), diferencia)
          .input('comentario', sql.VarChar, `Ajuste manual por ${usuario}`)
          .input('unidadMedida', sql.VarChar, unidadMedida)
          .query(`
            INSERT INTO MovimientoStock (
              CodigoEmpresa, Ejercicio, Periodo, Fecha, FechaRegistro, TipoMovimiento,
              CodigoArticulo, CodigoAlmacen, Ubicacion, Partida, Unidades, Comentario,
              UnidadMedida1_, 
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
              @codigoAlmacen,  -- AlmacenContrapartida: mismo almacén
              @ubicacion       -- UbicacionContrapartida: misma ubicación
            )
          `);
      }
    }

    await transaction.commit();
    res.json({ success: true, mensaje: 'Ajustes realizados correctamente' });
    
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
// ✅ 9.8 OBTENER DETALLES POR MOV_POSICION_LINEA
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
        LEFT JOIN Colores_ c 
          ON lt.CodigoColor_ = c.CodigoColor_ 
          AND lt.CodigoEmpresa = c.CodigoEmpresa
        LEFT JOIN GrupoTallas_ gt 
          ON lt.GrupoTalla_ = gt.GrupoTalla_ 
          AND lt.CodigoEmpresa = gt.CodigoEmpresa
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

// ✅ 9.11 OBTENER ARTÍCULOS CON STOCK (PAGINADO)
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
        SUM(s.UnidadSaldo) AS StockTotal
      FROM Articulos a
      INNER JOIN AcumuladoStockUbicacion s 
        ON s.CodigoEmpresa = a.CodigoEmpresa 
        AND s.CodigoArticulo = a.CodigoArticulo
      WHERE a.CodigoEmpresa = @codigoEmpresa
        AND s.Periodo = 99
        AND s.UnidadSaldo > 0
        AND (
          a.CodigoArticulo LIKE @searchTerm 
          OR a.DescripcionArticulo LIKE @searchTerm
        )
      GROUP BY a.CodigoArticulo, a.DescripcionArticulo
      ORDER BY a.DescripcionArticulo
      OFFSET ${offset} ROWS
      FETCH NEXT ${pageSize} ROWS ONLY
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT a.CodigoArticulo) AS Total
      FROM Articulos a
      INNER JOIN AcumuladoStockUbicacion s 
        ON s.CodigoEmpresa = a.CodigoEmpresa 
        AND s.CodigoArticulo = a.CodigoArticulo
      WHERE a.CodigoEmpresa = @codigoEmpresa
        AND s.Periodo = 99
        AND s.UnidadSaldo > 0
        AND (
          a.CodigoArticulo LIKE @searchTerm 
          OR a.DescripcionArticulo LIKE @searchTerm
        )
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

// ✅ 10.3 ACTUALIZAR STOCK Y REGISTRAR TRASPASO 

app.post('/traspaso', async (req, res) => {
    const datos = req.body;
    const usuario = req.user.UsuarioLogicNet;
    const codigoEmpresa = req.user.CodigoEmpresa;

    // Validaciones
    if (!Number.isInteger(parseFloat(datos.cantidad)) || parseFloat(datos.cantidad) <= 0) {
        return res.status(400).json({ 
            success: false, 
            mensaje: 'La cantidad debe ser un número entero positivo' 
        });
    }

    if (!datos.destinoAlmacen || !datos.destinoUbicacion) {
        return res.status(400).json({ 
            success: false, 
            mensaje: 'Almacén y ubicación de destino son requeridos' 
        });
    }

    if (datos.origenAlmacen === datos.destinoAlmacen && datos.origenUbicacion === datos.destinoUbicacion) {
        return res.status(400).json({ 
            success: false, 
            mensaje: 'No puedes traspasar a la misma ubicación de origen' 
        });
    }

    if (!datos.unidadMedida) {
        return res.status(400).json({
            success: false,
            mensaje: 'Unidad de medida es requerida'
        });
    }

    const transaction = new sql.Transaction(poolGlobal);
    
    try {
        await transaction.begin();
        
        // 1. Obtener datos del stock origen
        const requestGet = new sql.Request(transaction);
        const stockResult = await requestGet
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('codigoAlmacen', sql.VarChar, datos.origenAlmacen)
            .input('ubicacion', sql.VarChar, datos.origenUbicacion)
            .input('codigoArticulo', sql.VarChar, datos.articulo)
            .input('unidadMedida', sql.VarChar, datos.unidadMedida)
            .input('partida', sql.VarChar, datos.partida || '')
            .query(`
                SELECT TipoUnidadMedida_, UnidadSaldo, Partida
                FROM AcumuladoStockUbicacion
                WHERE CodigoEmpresa = @codigoEmpresa
                    AND CodigoAlmacen = @codigoAlmacen
                    AND Ubicacion = @ubicacion
                    AND CodigoArticulo = @codigoArticulo
                    AND TipoUnidadMedida_ = @unidadMedida
                    AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                    AND Periodo = 99
            `);

        if (stockResult.recordset.length === 0) {
            throw new Error('Stock en ubicación de origen no encontrado');
        }
        
        const stockItem = stockResult.recordset[0];
        const cantidadNum = parseFloat(datos.cantidad);
        
        if (cantidadNum > stockItem.UnidadSaldo) {
            throw new Error(`Cantidad supera el stock disponible (${stockItem.UnidadSaldo})`);
        }

        // 2. Actualizar stock en origen
        const requestUpdateOrigen = new sql.Request(transaction);
        await requestUpdateOrigen
            .input('cantidad', sql.Decimal(18,4), cantidadNum)
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('codigoAlmacen', sql.VarChar, datos.origenAlmacen)
            .input('ubicacion', sql.VarChar, datos.origenUbicacion)
            .input('codigoArticulo', sql.VarChar, datos.articulo)
            .input('unidadMedida', sql.VarChar, datos.unidadMedida)
            .input('partida', sql.VarChar, stockItem.Partida || '')
            .query(`
                UPDATE AcumuladoStockUbicacion
                SET UnidadSaldo = UnidadSaldo - @cantidad
                WHERE CodigoEmpresa = @codigoEmpresa
                    AND CodigoAlmacen = @codigoAlmacen
                    AND Ubicacion = @ubicacion
                    AND CodigoArticulo = @codigoArticulo
                    AND TipoUnidadMedida_ = @unidadMedida
                    AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                    AND Periodo = 99
            `);

        // 3. Actualizar o insertar en destino
        const fechaActual = new Date();
        const ejercicio = fechaActual.getFullYear();
        
        const requestCheckDestino = new sql.Request(transaction);
        const existeDestino = await requestCheckDestino
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('codigoAlmacen', sql.VarChar, datos.destinoAlmacen)
            .input('ubicacion', sql.VarChar, datos.destinoUbicacion)
            .input('codigoArticulo', sql.VarChar, datos.articulo)
            .input('unidadMedida', sql.VarChar, datos.unidadMedida)
            .input('partida', sql.VarChar, stockItem.Partida || '')
            .query(`
                SELECT 1
                FROM AcumuladoStockUbicacion
                WHERE CodigoEmpresa = @codigoEmpresa
                    AND CodigoAlmacen = @codigoAlmacen
                    AND Ubicacion = @ubicacion
                    AND CodigoArticulo = @codigoArticulo
                    AND TipoUnidadMedida_ = @unidadMedida
                    AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                    AND Periodo = 99
                    AND Ejercicio = ${ejercicio}
            `);

        if (existeDestino.recordset.length > 0) {
            await requestCheckDestino
                .input('cantidad', sql.Decimal(18,4), cantidadNum)
                .query(`
                    UPDATE AcumuladoStockUbicacion
                    SET UnidadSaldo = UnidadSaldo + @cantidad
                    WHERE CodigoEmpresa = @codigoEmpresa
                        AND CodigoAlmacen = @codigoAlmacen
                        AND Ubicacion = @ubicacion
                        AND CodigoArticulo = @codigoArticulo
                        AND TipoUnidadMedida_ = @unidadMedida
                        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
                        AND Periodo = 99
                        AND Ejercicio = ${ejercicio}
                `);
        } else {
            await requestCheckDestino
                .input('cantidad', sql.Decimal(18,4), cantidadNum)
                .query(`
                    INSERT INTO AcumuladoStockUbicacion (
                        CodigoEmpresa, CodigoAlmacen, Ubicacion, 
                        CodigoArticulo, UnidadSaldo, Periodo, Ejercicio, Partida, TipoUnidadMedida_
                    ) VALUES (
                        @codigoEmpresa, @codigoAlmacen, @ubicacion,
                        @codigoArticulo, @cantidad, 99, ${ejercicio}, @partida, @unidadMedida
                    )
                `);
        }

        // ==============================================================
        // SOLUCIÓN DEFINITIVA PARA HORA DE MADRID (CEST, UTC+2)
        // ==============================================================
        const ahora = new Date();
        // Ajustar a hora de Madrid (UTC+2)
        const offsetMadrid = 2; 
        const horaMadrid = new Date(ahora.getTime() + offsetMadrid * 60 * 60 * 1000);

        // Fecha sin hora (para 'Fecha')
        const fechaSolo = new Date(
            horaMadrid.getFullYear(),
            horaMadrid.getMonth(),
            horaMadrid.getDate()
        );

        // Fecha con hora (para 'FechaRegistro')
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
            .input('tipoMovimiento', sql.SmallInt, 3) // 3: Traspaso
            .input('codigoArticulo', sql.VarChar, datos.articulo)
            .input('codigoAlmacen', sql.VarChar, datos.origenAlmacen)
            .input('almacenContrapartida', sql.VarChar, datos.destinoAlmacen)
            .input('ubicacion', sql.VarChar, datos.origenUbicacion)
            .input('ubicacionContrapartida', sql.VarChar, datos.destinoUbicacion)
            .input('partida', sql.VarChar, stockItem.Partida || '')
            .input('diferencia', sql.Decimal(18,4), cantidadNum)
            .input('comentario', sql.VarChar, `Traspaso por Usuario: ${usuario}`)
            .input('unidadMedida', sql.VarChar, datos.unidadMedida)
            .query(`
                INSERT INTO MovimientoStock (
                    CodigoEmpresa, Ejercicio, Periodo, Fecha, FechaRegistro, TipoMovimiento,
                    CodigoArticulo, CodigoAlmacen, AlmacenContrapartida, Ubicacion, UbicacionContrapartida,
                    Unidades, Comentario, UnidadMedida1_, Partida
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
                    @partida
                )
            `);

        await transaction.commit();
        
        res.json({ 
            success: true, 
            mensaje: 'Traspaso realizado con éxito',
            datos: {
                articulo: datos.articulo,
                origen: `${datos.origenAlmacen}-${datos.origenUbicacion}`,
                destino: `${datos.destinoAlmacen}-${datos.destinoUbicacion}`,
                cantidad: cantidadNum,
                unidad: datos.unidadMedida,
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
        await transaction.rollback();
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

// ✅ 10.5 OBTENER TODAS LAS UBICACIONES AGRUPADAS POR ALMACÉN
app.get('/ubicaciones-agrupadas', async (req, res) => {
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
        SELECT 
          a.CodigoAlmacen,
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
        GROUP BY a.CodigoAlmacen, a.Almacen, u.Ubicacion
        ORDER BY a.Almacen, u.Ubicacion
      `);
    
    // Agrupar por almacén
    const almacenesMap = {};
    result.recordset.forEach(row => {
      const key = row.CodigoAlmacen;
      
      if (!almacenesMap[key]) {
        almacenesMap[key] = {
          codigo: row.CodigoAlmacen,
          nombre: row.NombreAlmacen,
          ubicaciones: []
        };
      }
      
      almacenesMap[key].ubicaciones.push({
        codigo: row.Ubicacion,
        descripcion: row.Ubicacion, // Mostrar código en lugar de descripción
        cantidadArticulos: row.CantidadArticulos
      });
    });
    
    const almacenesArray = Object.values(almacenesMap);
    res.json(almacenesArray);
  } catch (err) {
    console.error('[ERROR UBICACIONES AGRUPADAS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener ubicaciones agrupadas.',
      error: err.message 
    });
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