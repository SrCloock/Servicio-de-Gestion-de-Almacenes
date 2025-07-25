﻿const express = require('express');
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
// ✅ 2. MIDDLEWARE DE PERMISOS ADMIN
// ============================================
function checkAdmin(req, res, next) {
  const user = req.user;
  
  if (user && user.categoria === 'ADM') {
    return next();
  }
  
  res.status(403).json({ 
    success: false, 
    mensaje: 'Acceso restringido a administradores' 
  });
}

// ============================================
// ✅ 3. MIDDLEWARE DE AUTENTICACIÓN
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
// ✅ 4. LOGIN (SIN PERMISOS)
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
// ✅ 5. OBTENER CATEGORÍAS DE EMPLEADO
// ============================================
app.get('/categorias-empleado', async (req, res) => {
  const { codigoEmpresa } = req.query;

  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ 
      success: false, 
      mensaje: 'No autenticado' 
    });
  }
  
  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    const result = await poolGlobal.request()
      .input('CodigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT CodigoCategoriaEmpleadoLc AS codigo, CategoriaEmpleadoLc AS nombre
        FROM LcCategoriasEmpleado
        WHERE CodigoEmpresa = @CodigoEmpresa
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR CATEGORIAS EMPLEADO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener categorías de empleado.',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 6. OBTENER EMPRESAS (DASHBOARD)
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
// ✅ 7. OBTENER COMISIONISTAS
// ============================================
app.get('/comisionistas', async (req, res) => {
  const { codigoEmpresa } = req.query;

  if (!codigoEmpresa) {
    return res.status(400).json({ success: false, mensaje: 'Código de empresa requerido.' });
  }

  try {
    const result = await poolGlobal.request()
      .input('CodigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT * FROM Comisionistas
        WHERE CodigoEmpresa = @CodigoEmpresa
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR SQL COMISIONISTAS]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener comisionistas.' });
  }
});

// ============================================
// ✅ 8. OBTENER LISTADO DE CLIENTES
// ============================================
app.get('/clientes', async (req, res) => {
  const { codigoEmpresa } = req.query;

  if (!codigoEmpresa) {
    return res.status(400).json({ success: false, mensaje: 'Código de empresa requerido.' });
  }

  try {
    const result = await poolGlobal.request()
      .input('CodigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          CodigoCliente, Nombre, Domicilio, Municipio, 
          Provincia, CodigoPostal, Telefono, Fax, Email1
        FROM Clientes
        WHERE CodigoEmpresa = @CodigoEmpresa
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR SQL CLIENTES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener clientes.' });
  }
});

// ============================================
// ✅ 9. OBTENER FICHA DE CLIENTE
// ============================================
app.get('/clienteFicha', async (req, res) => {
  const { codigoCliente, codigoEmpresa } = req.query;

  if (!codigoCliente || !codigoEmpresa) {
    return res.status(400).json({ success: false, mensaje: 'Código de cliente y empresa requeridos.' });
  }

  try {
    const result = await poolGlobal.request()
      .input('CodigoCliente', sql.VarChar(15), codigoCliente)
      .input('CodigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT * FROM Clientes
        WHERE CodigoCliente = @CodigoCliente AND CodigoEmpresa = @CodigoEmpresa
      `);

    if (result.recordset.length > 0) {
      res.json(result.recordset[0]);
    } else {
      res.status(404).json({ success: false, mensaje: 'Cliente no encontrado.' });
    }
  } catch (err) {
    console.error('[ERROR SQL CLIENTE FICHA]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener ficha de cliente.' });
  }
});

// ============================================
// ✅ 10. GUARDAR CLIENTE
// ============================================
app.post('/guardarCliente', async (req, res) => {
  const clienteData = req.body;
  
  if (!clienteData.CodigoCliente) {
    return res.status(400).json({ success: false, mensaje: 'Código de cliente requerido.' });
  }

  try {
    const request = poolGlobal.request();
    
    Object.keys(clienteData).forEach(key => {
      request.input(key, sql.VarChar, clienteData[key] || '');
    });

    await request.query(`
      UPDATE Clientes
      SET 
        Nombre = @Nombre,
        CifDni = @CifDni,
        TipoCliente = @TipoCliente,
        Nombre1 = @Nombre1,
        FormadePago = @FormadePago,
        Email1 = @Email1,
        Email2 = @Email2,
        Telefono = @Telefono,
        Fax = @Fax,
        CodigoPostal = @CodigoPostal,
        Domicilio = @Domicilio,
        Municipio = @Municipio,
        Provincia = @Provincia,
        ObservacionesCliente = @ObservacionesCliente
      WHERE CodigoCliente = @CodigoCliente
    `);

    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR SQL GUARDAR CLIENTE]', err);
    res.status(500).json({ success: false, mensaje: 'Error al guardar cliente.' });
  }
});

// ============================================
// ✅ 11. HISTÓRICO DE PEDIDOS
// ============================================
app.get('/historicoPedidos', async (req, res) => {
  const cif = req.query.cif;
  if (!cif) return res.status(400).send('CIF requerido.');

  try {
    const result = await poolGlobal.request().query(`
      SELECT 
        l.BaseImponible, 
        l.CodigoComisionista,
        l.FechaPedido, 
        l.CodigoEmpresa,
        l.NumeroPedido,
        l.DescripcionArticulo,
        l.Descripcion2Articulo,
        c.CifDni, 
        l.UnidadesPedidas, 
        l.Precio
      FROM CabeceraPedidoCliente c
      LEFT JOIN LineasPedidoCliente l ON 
        c.CodigoEmpresa = l.CodigoEmpresa 
        AND c.EjercicioPedido = l.EjercicioPedido 
        AND c.SeriePedido = l.SeriePedido 
        AND c.NumeroPedido = l.NumeroPedido
      WHERE c.CifDni = '${cif}'
      ORDER BY l.FechaPedido DESC, l.NumeroPedido DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR HISTORICO PEDIDOS]', err);
    res.status(500).send('Error histórico pedidos.');
  }
});

// ============================================
// ✅ 12. CONSUMOS DEL CLIENTE
// ============================================
app.get('/consumosCliente', async (req, res) => {
  const cif = req.query.cif;
  if (!cif) return res.status(400).send('CIF requerido.');

  try {
    const empresasQuery = await poolGlobal.request().query(`
      SELECT DISTINCT e.Empresa
      FROM CabeceraPedidoCliente c
      INNER JOIN Empresas e ON e.CodigoEmpresa = c.CodigoEmpresa
      WHERE c.CifDni = '${cif}'
    `);

    const empresas = empresasQuery.recordset.map(emp => `[${emp.Empresa}]`);
    const cols = empresas.join(', ');
    const sumaTotal = empresas.join(' + ');

    const sqlPivot = `
      SELECT 
        Anyo, 
        ${cols},
        ${sumaTotal} AS Total
      FROM (
        SELECT 
          YEAR(c.FechaPedido) AS Anyo,
          e.Empresa,
          SUM(l.BaseImponible) AS Total
        FROM CabeceraPedidoCliente c
        INNER JOIN LineasPedidoCliente l ON 
          c.CodigoEmpresa = l.CodigoEmpresa 
          AND c.EjercicioPedido = l.EjercicioPedido 
          AND c.SeriePedido = l.SeriePedido 
          AND c.NumeroPedido = l.NumeroPedido
        INNER JOIN Empresas e ON e.CodigoEmpresa = c.CodigoEmpresa
        WHERE c.CifDni = '${cif}'
        GROUP BY YEAR(c.FechaPedido), e.Empresa
      ) AS datos
      PIVOT (
        SUM(Total) FOR Empresa IN (${cols})
      ) AS pivote
      ORDER BY Anyo DESC;
    `;

    const resultado = await poolGlobal.request().query(sqlPivot);
    res.json(resultado.recordset);
  } catch (err) {
    console.error('[ERROR CONSUMOS CLIENTE]', err);
    res.status(500).send('Error consumos cliente.');
  }
});

// ============================================
// ✅ 13. COBROS DEL CLIENTE
// ============================================
app.get('/cobrosCliente', async (req, res) => {
  const cif = req.query.cif;
  if (!cif) return res.status(400).send('CIF requerido.');

  try {
    const result = await poolGlobal.request()
      .input('cif', sql.VarChar, cif)
      .query(`
        SELECT 
          cf.CodigoClienteProveedor,
          c.RazonSocial,
          cf.Factura,
          cf.FechaFactura,
          cf.FechaVencimiento,
          cf.TipoEfecto,
          cf.ImportePendiente,
          cf.Comentario
        FROM CarteraEfectos cf
        LEFT JOIN Clientes c ON 
          c.CodigoEmpresa = cf.CodigoEmpresa
          AND c.CodigoCliente = cf.CodigoClienteProveedor
        WHERE c.CifDni = @cif
        ORDER BY cf.CodigoEmpresa, cf.CodigoCuenta, cf.FechaFactura, cf.FechaVencimiento
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR COBROS CLIENTE]', err);
    res.status(500).send('Error cobros cliente.');
  }
});

// ✅ 14. PEDIDOS PENDIENTES (CON DETALLES DE TALLAS Y UNIDADES DE MEDIDA)
// ✅ 14. PEDIDOS PENDIENTES (MODIFICADO CON FILTROS)
app.get('/pedidosPendientes', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ 
      success: false, 
      mensaje: 'No autenticado' 
    });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  
  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido' 
    });
  }

  try {
    // Obtener parámetros de filtro
    const rangoDias = req.query.rango || 'semana'; // 'semana' o 'dia'
    const formaEntrega = req.query.formaEntrega; // Opcional: 1,2,3,4,5

    // Calcular fechas según rango
    const hoy = new Date();
    let fechaInicio, fechaFin;
    
    if (rangoDias === 'dia') {
      fechaInicio = new Date(hoy);
      fechaInicio.setDate(hoy.getDate() - 1); // Ayer
      fechaFin = new Date(hoy);
      fechaFin.setDate(hoy.getDate() + 1); // Mañana
    } else { // Por defecto: semana
      fechaInicio = new Date(hoy);
      fechaInicio.setDate(hoy.getDate() - 7); // Hace una semana
      fechaFin = new Date(hoy);
      fechaFin.setDate(hoy.getDate() + 7); // Dentro de una semana
    }

    // Formatear fechas para SQL
    const formatDate = (date) => date.toISOString().split('T')[0];
    
    // Mapeo de formas de entrega
    const formasEntregaMap = {
      1: 'Pájaro Rojo',
      2: 'Pájaro Azul',
      3: 'Pájaro Verde',
      4: 'Pájaro Naranja',
      5: 'Pájaro Blanco'
    };

    // 1. Consulta principal
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
          c.ObservacionesWeb AS Observaciones,  -- Cambiado a ObservacionesWeb
          c.obra,
          c.FechaPedido,
          c.FechaEntrega,
          c.FormaEntrega,  -- Nuevo campo
          l.CodigoArticulo,
          l.DescripcionArticulo,
          l.Descripcion2Articulo,
          l.UnidadesPedidas, 
          l.UnidadesPendientes,
          l.CodigoAlmacen,
          a.CodigoAlternativo,
          l.LineasPosicion AS MovPosicionLinea,
          -- Unidades de medida
          l.UnidadMedida1_ AS UnidadBase,
          l.UnidadMedida2_ AS UnidadAlternativa,
          l.FactorConversion_ AS FactorConversion
        FROM CabeceraPedidoCliente c
        INNER JOIN LineasPedidoCliente l ON 
          c.CodigoEmpresa = l.CodigoEmpresa 
          AND c.EjercicioPedido = l.EjercicioPedido 
          AND c.SeriePedido = l.SeriePedido 
          AND c.NumeroPedido = l.NumeroPedido
        LEFT JOIN Articulos a ON 
          a.CodigoArticulo = l.CodigoArticulo 
          AND a.CodigoEmpresa = l.CodigoEmpresa
        WHERE c.Estado = 0
          AND c.CodigoEmpresa = @codigoEmpresa
          AND l.UnidadesPendientes > 0
          AND c.SeriePedido NOT IN ('X', 'R')  -- Excluir series X y R
          AND c.FechaEntrega BETWEEN '${formatDate(fechaInicio)}' AND '${formatDate(fechaFin)}'  -- Filtrar por rango
          ${formaEntrega ? `AND c.FormaEntrega = ${formaEntrega}` : ''}  -- Filtrar por forma de entrega si se proporciona
        ORDER BY c.FechaEntrega ASC  -- Ordenar por fecha de entrega (más próxima primero)
      `);

    // 2. Recopilar IDs para detalles
    const lineasIds = [];
    result.recordset.forEach(row => {
      if (row.MovPosicionLinea) {
        lineasIds.push(row.MovPosicionLinea);
      }
    });

    // 3. Consulta para detalles de tallas/colores
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

    // 4. Combinar resultados
    const pedidosAgrupados = {};
    result.recordset.forEach(row => {
      const key = `${row.CodigoEmpresa}-${row.EjercicioPedido}-${row.SeriePedido}-${row.NumeroPedido}`;
      
      if (!pedidosAgrupados[key]) {
        pedidosAgrupados[key] = {
          codigoEmpresa: row.CodigoEmpresa,
          ejercicioPedido: row.EjercicioPedido,
          seriePedido: row.SeriePedido || '',
          numeroPedido: row.NumeroPedido,
          razonSocial: row.RazonSocial,
          domicilio: row.Domicilio,
          municipio: row.Municipio,
          observaciones: row.Observaciones,
          obra: row.obra,
          fechaPedido: row.FechaPedido,
          fechaEntrega: row.FechaEntrega,
          formaEntrega: formasEntregaMap[row.FormaEntrega] || 'No especificada',  // Mapeado a texto
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
        // Campos para unidades de medida
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

// ============================================
// ✅ 15. OBTENER STOCK POR ARTÍCULO (CORREGIDO - SOLO PERIODO 99)
// ============================================
// ✅ 15. OBTENER STOCK POR ARTÍCULO (CORREGIDO PARA MULTIPLES UNIDADES)
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

// ============================================
// ✅ 16. OBTENER ALMACENES POR EMPRESA (CORREGIDO)
// ============================================
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

// ============================================
// ✅ 17. OBTENER UBICACIONES POR ALMACÉN (MODIFICADO)
// ============================================
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

// ============================================
// ✅ 18. ACTUALIZAR LÍNEA DE PEDIDO
// ============================================
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

// ============================================
// ✅ 19. GENERAR ALBARÁN DESDE PEDIDO
// ============================================
app.post('/generarAlbaranDesdePedido', async (req, res) => {
  const { codigoEmpresa, ejercicio, serie, numeroPedido } = req.body;

  if (!codigoEmpresa || !ejercicio || numeroPedido == null) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos del pedido.' });
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

    const lineas = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('serie', sql.VarChar, serie || '')
      .query(`
        SELECT *
        FROM LineasPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numeroPedido
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
      `);

    const totalLineas = lineas.recordset.length;
    const importeLiquido = cab.ImporteLiquido || 0;

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
      .input('numeroLineas', sql.Int, totalLineas)
      .input('importeLiquido', sql.Decimal(18, 4), importeLiquido)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, Domicilio, Municipio, FechaAlbaran,
          NumeroLineas, ImporteLiquido
        ) VALUES (
          @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
          @codigoCliente, @razonSocial, @domicilio, @municipio, @fecha,
          @numeroLineas, @importeLiquido
        )
      `);

    const promises = lineas.recordset.map((linea, index) => {
      return poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, linea.CodigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, serie || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, index + 1)
        .input('codigoArticulo', sql.VarChar, linea.CodigoArticulo)
        .input('descripcionArticulo', sql.VarChar, linea.DescripcionArticulo)
        .input('unidades', sql.Decimal(18, 4), linea.UnidadesPedidas)
        .input('precio', sql.Decimal(18, 4), linea.Precio)
        .input('codigoAlmacen', sql.VarChar, linea.CodigoAlmacen || '')
        .input('partida', sql.VarChar, linea.Partida || '')
        .input('porcentajeDescuento', sql.Decimal(5, 2), linea['%Descuento'] || 0)
        .input('importeDescuento', sql.Decimal(18, 4), linea.ImporteDescuento || 0)
        .input('importeBruto', sql.Decimal(18, 4), linea.ImporteBruto || 0)
        .input('importeNeto', sql.Decimal(18, 4), linea.ImporteNeto || 0)
        .input('ImporteLiquido', sql.Decimal(18, 4), linea.ImporteLiquido || 0)
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, CodigoArticulo, DescripcionArticulo, Unidades, Precio,
            CodigoAlmacen, Partida, [%Descuento], ImporteDescuento,
            ImporteBruto, ImporteNeto, ImporteLiquido
          ) VALUES (
            @codigoEmpresa, @ejercicio, @serie, @numeroAlbaran,
            @orden, @codigoArticulo, @descripcionArticulo, @unidades, @precio,
            @codigoAlmacen, @partida, @porcentajeDescuento, @importeDescuento,
            @importeBruto, @importeNeto, @ImporteLiquido
          )
        `);
    });

    await Promise.all(promises);

    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('serie', sql.VarChar, serie || '')
      .query(`
        UPDATE CabeceraPedidoCliente
        SET Estado = 2
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numeroPedido
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
      `);

    res.json({ success: true, mensaje: 'Albarán generado y pedido marcado como servido.' });
  } catch (err) {
    console.error('[ERROR GENERAR ALBARÁN]', err);
    res.status(500).json({ success: false, mensaje: 'Error al generar albarán.', error: err.message });
  }
});

// ============================================
// ✅ 20. ALBARANES PENDIENTES
// ============================================
app.get('/albaranesPendientes', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  const todos = req.query.todos === 'true'; // Nuevo parámetro para obtener todos
  
  try {
    let query = `
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
        StatusFacturado
      FROM CabeceraAlbaranCliente
      WHERE CodigoEmpresa = @codigoEmpresa
    `;
    
    if (!todos) {
      query += ' AND StatusFacturado = 0';
    }
    
    query += ' ORDER BY FechaAlbaran DESC';
    
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
            CodigoArticulo AS codigo,
            DescripcionArticulo AS nombre,
            Unidades AS cantidad
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
        articulos: lineas.recordset
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

// ============================================
// ✅ 21. MARCAR PEDIDO COMO COMPLETADO
// ============================================
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

// ============================================
// ✅ 22. ENVIAR PDF POR EMAIL
// ============================================
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

// ============================================
// ✅ 23. OBTENER EMPRESAS
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
// ✅ 24. OBTENER REPARTIDORES
// ============================================
app.get('/repartidores', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT CodigoCliente, Nombre
        FROM Clientes
        WHERE CodigoCategoriaEmpleadoLc = 'rep'
        AND CodigoEmpresa = @codigoEmpresa
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR REPARTIDORES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener repartidores' });
  }
});

// ============================================
// ✅ 25. BUSCAR ARTÍCULOS (CORREGIDO)
// ============================================
// ✅ 25. BUSCAR ARTÍCULOS (OPTIMIZADO)
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


// ============================================
// ✅ 26. OBTENER ARTÍCULOS POR UBICACIÓN (CORREGIDO - SOLO PERIODO 99)
// ============================================

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
// ============================================
// ✅ 27. ACTUALIZAR STOCK Y REGISTRAR MOVIMIENTO (CORREGIDO)
// ============================================
// ✅ 27. ACTUALIZAR STOCK Y REGISTRAR MOVIMIENTO (CON HORA DE MADRID)
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

  if (datos.origenAlmacen === datos.destinoAlmacen && datos.origenUbicacion === datos.destinoUbicacion) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'No puedes traspasar a la misma ubicación de origen' 
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
      .input('partida', sql.VarChar, datos.partida || '')
      .query(`
        SELECT TipoUnidadMedida_, UnidadSaldo, Partida
        FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoAlmacen = @codigoAlmacen
          AND Ubicacion = @ubicacion
          AND CodigoArticulo = @codigoArticulo
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
      .input('partida', sql.VarChar, stockItem.Partida || '')
      .query(`
        UPDATE AcumuladoStockUbicacion
        SET UnidadSaldo = UnidadSaldo - @cantidad
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoAlmacen = @codigoAlmacen
          AND Ubicacion = @ubicacion
          AND CodigoArticulo = @codigoArticulo
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
      .input('partida', sql.VarChar, stockItem.Partida || '')
      .input('unidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
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

    // 4. Registrar movimiento - CON HORA DE MADRID
    const periodo = fechaActual.getMonth() + 1;
    
    // Obtener hora local de Madrid
    const fechaMadrid = new Date(fechaActual.toLocaleString("es-ES", {
      timeZone: "Europe/Madrid"
    }));
    
    const fechaHoraSQL = fechaMadrid.toISOString().slice(0, 19).replace('T', ' ');
    
    const requestMov = new sql.Request(transaction);
    await requestMov
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('periodo', sql.Int, periodo)
      .input('fecha', sql.Date, fechaMadrid.toISOString().split('T')[0])
      .input('fechaRegistro', sql.DateTime, fechaHoraSQL)
      .input('tipoMovimiento', sql.SmallInt, 3)
      .input('codigoArticulo', sql.VarChar, datos.articulo)
      .input('codigoAlmacen', sql.VarChar, datos.origenAlmacen)
      .input('almacenDestino', sql.VarChar, datos.destinoAlmacen)
      .input('ubicacion', sql.VarChar, datos.origenUbicacion)
      .input('ubicacionDestino', sql.VarChar, datos.destinoUbicacion)
      .input('partida', sql.VarChar, stockItem.Partida || '')
      .input('diferencia', sql.Decimal(18,4), cantidadNum)
      .input('comentario', sql.VarChar, `Traspaso por Usuario: ${usuario}`)
      .input('unidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
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
          @almacenDestino,
          @ubicacion, 
          @ubicacionDestino,
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
        unidad: stockItem.TipoUnidadMedida_,
        fecha: fechaHoraSQL
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

// ============================================
// ✅ 28. OBTENER HISTÓRICO DE TRASPASOS (CORREGIDO)
// ============================================
app.get('/historial-traspasos', async (req, res) => {
  // Obtener datos del usuario autenticado
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
          CONVERT(VARCHAR(20), m.FechaRegistro, 120) AS Fecha,
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

// ============================================
// ✅ 29. OBTENER STOCK POR MÚLTIPLES ARTÍCULOS 
// ============================================

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

// ============================================
// ✅ 30. OBTENER STOCK TOTAL (PARA INVENTARIO) - ACTUALIZADO
// ============================================
// ✅ 30. OBTENER STOCK TOTAL (CORREGIDO PARA MOSTRAR UNIDADES REALES)
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
// ============================================
// ✅ 31. AJUSTAR INVENTARIO (ACTUALIZADO CON PARTIDAS)
// ============================================
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
          SELECT UnidadSaldo AS Cantidad
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoAlmacen = @codigoAlmacen
            AND Ubicacion = @ubicacion
            AND CodigoArticulo = @codigoArticulo
            AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
            AND Periodo = 99
        `);
      
      let cantidadActual = 0;
      if (result.recordset.length > 0) {
        cantidadActual = result.recordset[0].Cantidad;
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
          .input('partida', sql.VarChar, ajuste.partida || '') // Manejar NULL
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
          .input('partida', sql.VarChar, ajuste.partida || '') // Manejar NULL
          .query(`
            INSERT INTO AcumuladoStockUbicacion (
              CodigoEmpresa, CodigoAlmacen, Ubicacion, 
              CodigoArticulo, UnidadSaldo, Periodo, Partida
            ) VALUES (
              @codigoEmpresa, @codigoAlmacen, @ubicacion,
              @codigoArticulo, @nuevaCantidad, 99, @partida
            )
          `);
      }
      
      // 3. Registrar movimiento
      if (diferencia !== 0) {
        const fechaActual = new Date();
        const periodo = fechaActual.getMonth() + 1;
        const requestMov = new sql.Request(transaction);
        await requestMov
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.SmallInt, fechaActual.getFullYear())
          .input('periodo', sql.Int, periodo)
          .input('fecha', sql.DateTime, fechaActual)
          .input('tipoMovimiento', sql.SmallInt, 5)
          .input('codigoArticulo', sql.VarChar, ajuste.articulo)
          .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
          .input('ubicacion', sql.VarChar, ajuste.ubicacionStr)
          .input('partida', sql.VarChar, ajuste.partida || '') // Manejar NULL
          .input('diferencia', sql.Decimal(18,4), diferencia)
          .input('comentario', sql.VarChar, `Ajuste manual por ${usuario}`)
          .query(`
            INSERT INTO MovimientoStock (
              CodigoEmpresa, Ejercicio, Periodo, FechaRegistro, TipoMovimiento,
              CodigoArticulo, CodigoAlmacen, Ubicacion, Partida, Unidades, Comentario
            ) VALUES (
              @codigoEmpresa, @ejercicio, @periodo, @fecha, @tipoMovimiento,
              @codigoArticulo, @codigoAlmacen, @ubicacion, @partida, @diferencia, @comentario
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
// ============================================
// ✅ 32. ASIGNAR PEDIDO A REPARTIDOR
// ============================================
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

// ✅ 33. OBTENER HISTÓRICO DE AJUSTES DE INVENTARIO (AGRUPA POR DÍA)
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
// ✅ 34. OBTENER DETALLES POR MOV_POSICION_LINEA
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
// ✅ 35. OBTENER FAMILIAS
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
// ✅ 36. OBTENER SUBFAMILIAS
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

// ✅ 37. GENERAR ALBARÁN PARCIAL
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


// ✅ 38. ASIGNAR ALBARÁN A USUARIO
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

// ✅ 39. OBTENER EMPLEADOS (ACTUALIZADO)
app.get('/empleados', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          CodigoCliente,
          Nombre,
          UsuarioLogicNet
        FROM Clientes
        WHERE CodigoCategoriaCliente_ = 'emp'
          AND CodigoEmpresa = @codigoEmpresa
          AND (
            StatusAdministrador = '-1'
            OR StatusUsuarioAvanzado = '-1'
            OR (StatusVerPedidosAsignados = '-1' AND StatusVerAlbaranesAsignados = '-1')
          )
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR EMPLEADOS]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener empleados' });
  }
});

// ✅ 40. OBTENER TODAS LAS UBICACIONES AGRUPADAS POR ALMACÉN
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
          u.DescripcionUbicacion,
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
        GROUP BY a.CodigoAlmacen, a.Almacen, u.Ubicacion, u.DescripcionUbicacion
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
        descripcion: row.DescripcionUbicacion || row.Ubicacion,
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

// ✅ OBTENER ARTÍCULOS CON STOCK (PAGINADO)
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

// ✅ 41. OBTENER PEDIDOS COMPLETADOS (CORREGIDO)
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

// ✅ 42. ASIGNAR PEDIDO Y GENERAR ALBARÁN (ACTUALIZADO)
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


// ✅ 44. ASIGNAR EMPLEADO A PEDIDO COMPLETADO
app.post('/asignarEmpleadoAPedido', async (req, res) => {
  const { codigoEmpresa, ejercicio, serie, numeroPedido, codigoEmpleado } = req.body;

  if (!codigoEmpresa || !ejercicio || !numeroPedido || !codigoEmpleado) {
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
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('codigoEmpleado', sql.VarChar, codigoEmpleado)
      .query(`
        UPDATE CabeceraPedidoCliente
        SET CodigoEmpleadoAsignado = @codigoEmpleado
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    res.json({ 
      success: true, 
      mensaje: 'Empleado asignado correctamente al pedido' 
    });
  } catch (err) {
    console.error('[ERROR ASIGNAR EMPLEADO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al asignar empleado',
      error: err.message 
    });
  }
});

// ✅ 45. ASIGNAR ALBARÁN A EMPLEADO (NUEVO ENDPOINT)
app.post('/asignarAlbaran', async (req, res) => {
  const { 
    codigoEmpresa,
    ejercicio,
    serie,
    numeroAlbaran,
    usuarioAsignado
  } = req.body;

  if (!codigoEmpresa || !ejercicio || !numeroAlbaran || !usuarioAsignado) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos.' 
    });
  }

  try {
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie)
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('usuarioAsignado', sql.VarChar, usuarioAsignado)
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET CodigoRepartidor = @usuarioAsignado
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND SerieAlbaran = @serie
          AND NumeroAlbaran = @numeroAlbaran
      `);

    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR ASIGNAR ALBARÁN]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al asignar albarán',
      error: err.message 
    });
  }
});

// ============================================
// ✅ INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log(`✅Servidor backend corriendo en http://localhost:${PORT}✅`);
});