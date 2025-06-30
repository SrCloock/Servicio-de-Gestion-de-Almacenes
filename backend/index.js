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

// ============================================
// ✅ 14. PEDIDOS PENDIENTES (CORREGIDO)
// ============================================
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
    // 1. Consulta principal con nombre de columna corregido
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
          c.ObservacionesPedido AS Observaciones,
          c.obra,
          c.FechaPedido,
          c.FechaEntrega,
          l.CodigoArticulo,
          l.DescripcionArticulo,
          l.Descripcion2Articulo,
          l.UnidadesPedidas, 
          l.UnidadesPendientes,
          l.CodigoAlmacen,
          a.CodigoAlternativo,
          l.LineasPosicion AS MovPosicionLinea  -- Nombre corregido
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
        ORDER BY c.FechaPedido DESC
      `);

    // 2. Recopilar IDs para detalles
    const lineasIds = [];
    result.recordset.forEach(row => {
      if (row.MovPosicionLinea) {
        lineasIds.push(row.MovPosicionLinea);
      }
    });

    // 3. Consulta para obtener detalles de tallas/colores
    let detallesPorLinea = {};
    if (lineasIds.length > 0) {
      const placeholders = lineasIds.map((_, i) => `@id${i}`).join(',');
      
      const detallesQuery = `
        SELECT 
          lt.MovPosicionLinea_ AS MovPosicionLinea,  -- Alias para consistencia
          lt.CodigoColor_,
          c.Color_ AS NombreColor,
          lt.GrupoTalla_,
          gt.DescripcionGrupoTalla_ AS NombreGrupoTalla,
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
          tallas: {
            '01': detalle.UnidadesTalla01_,
            '02': detalle.UnidadesTalla02_,
            '03': detalle.UnidadesTalla03_,
            '04': detalle.UnidadesTalla04_
          }
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
        movPosicionLinea: row.MovPosicionLinea
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
          a.Almacen AS NombreAlmacen,
          s.Ubicacion,
          u.DescripcionUbicacion,
          s.UnidadSaldo AS Cantidad
        FROM AcumuladoStockUbicacion s
        INNER JOIN Almacenes a 
          ON a.CodigoEmpresa = s.CodigoEmpresa 
          AND a.CodigoAlmacen = s.CodigoAlmacen
        LEFT JOIN Ubicaciones u 
          ON u.CodigoEmpresa = s.CodigoEmpresa 
          AND u.CodigoAlmacen = s.CodigoAlmacen 
          AND u.Ubicacion = s.Ubicacion
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.CodigoArticulo = @codigoArticulo
          AND s.Periodo = 99   -- Solo periodo 99 (stock actual)
          AND s.UnidadSaldo > 0
        ORDER BY s.CodigoAlmacen, s.Ubicacion
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
  
  try {
    const cabeceras = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          NumeroAlbaran, 
          SerieAlbaran, 
          FechaAlbaran, 
          CodigoCliente, 
          RazonSocial, 
          Domicilio, 
          Municipio, 
          ImporteLiquido,
          StatusFacturado
        FROM CabeceraAlbaranCliente
        WHERE StatusFacturado = 0
          AND CodigoEmpresa = @codigoEmpresa
        ORDER BY FechaAlbaran DESC
      `);

    const albaranesConLineas = await Promise.all(cabeceras.recordset.map(async (cabecera) => {
      const lineas = await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, new Date(cabecera.FechaAlbaran).getFullYear())
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
        id: cabecera.NumeroAlbaran,
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
        SET Estado = 1
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numeroPedido
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
      `);

    res.json({ success: true, mensaje: 'Pedido marcado como completado.' });
  } catch (err) {
    console.error('[ERROR MARCAR COMPLETADO]', err);
    res.status(500).json({ success: false, mensaje: 'Error al marcar pedido como completado.', error: err.message });
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
app.get('/buscar-articulos', async (req, res) => {
  const { termino } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    if (!termino || termino.trim().length < 1) {
      return res.json([]);
    }

    const result = await poolGlobal.request()
      .input('termino', sql.VarChar(50), `${termino}%`)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT TOP 50 
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
  const { codigoAlmacen, ubicacion } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !codigoAlmacen || !ubicacion) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa, almacén y ubicación requeridos.' 
    });
  }

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacion)
      .query(`
        SELECT 
          s.CodigoArticulo,
          a.DescripcionArticulo,
          s.UnidadSaldo AS Cantidad
        FROM AcumuladoStockUbicacion s
        INNER JOIN Articulos a 
          ON a.CodigoEmpresa = s.CodigoEmpresa 
          AND a.CodigoArticulo = s.CodigoArticulo
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.CodigoAlmacen = @codigoAlmacen
          AND s.Ubicacion = @ubicacion
          AND s.Periodo = 99  -- Solo periodo 99 (stock actual)
          AND s.UnidadSaldo > 0
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR STOCK UBICACION]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener artículos por ubicación.',
      error: err.message 
    });
  }
});


// ============================================
// ✅ 27. ACTUALIZAR STOCK Y REGISTRAR MOVIMIENTO (CORREGIDO)
// ============================================
app.post('/traspaso', async (req, res) => {
  const { 
    codigoEmpresa,
    articulo,
    origenAlmacen, origenUbicacion, 
    destinoAlmacen, destinoUbicacion, 
    cantidad,
    usuario
  } = req.body;

  // Validar que no sea la misma ubicación
  if (origenAlmacen === destinoAlmacen && origenUbicacion === destinoUbicacion) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'No puedes traspasar a la misma ubicación de origen' 
    });
  }

  if (!codigoEmpresa || !articulo || !origenAlmacen || !origenUbicacion || !destinoAlmacen || !destinoUbicacion || !cantidad) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos requeridos.' });
  }

  const fechaActual = new Date();
  const periodo = fechaActual.getMonth() + 1;
  const ejercicio = fechaActual.getFullYear();

  try {
    // 1. Actualizar AcumuladoStockUbicacion (Origen)
    await poolGlobal.request()
      .input('cantidad', sql.Decimal(18,4), cantidad)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, origenAlmacen)
      .input('ubicacion', sql.VarChar, origenUbicacion)
      .input('codigoArticulo', sql.VarChar, articulo)
      .query(`
        UPDATE AcumuladoStockUbicacion
        SET UnidadSaldo = UnidadSaldo - @cantidad
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoAlmacen = @codigoAlmacen
          AND Ubicacion = @ubicacion
          AND CodigoArticulo = @codigoArticulo
          AND Periodo = 99
      `);

    // 2. Actualizar o insertar en destino
    const existeDestino = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
      .input('ubicacion', sql.VarChar, destinoUbicacion)
      .input('codigoArticulo', sql.VarChar, articulo)
      .query(`
        SELECT 1
        FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoAlmacen = @codigoAlmacen
          AND Ubicacion = @ubicacion
          AND CodigoArticulo = @codigoArticulo
          AND Periodo = 99
      `);

    if (existeDestino.recordset.length > 0) {
      await poolGlobal.request()
        .input('cantidad', sql.Decimal(18,4), cantidad)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
        .input('ubicacion', sql.VarChar, destinoUbicacion)
        .input('codigoArticulo', sql.VarChar, articulo)
        .query(`
          UPDATE AcumuladoStockUbicacion
          SET UnidadSaldo = UnidadSaldo + @cantidad
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoAlmacen = @codigoAlmacen
            AND Ubicacion = @ubicacion
            AND CodigoArticulo = @codigoArticulo
            AND Periodo = 99
        `);
    } else {
      await poolGlobal.request()
        .input('cantidad', sql.Decimal(18,4), cantidad)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
        .input('ubicacion', sql.VarChar, destinoUbicacion)
        .input('codigoArticulo', sql.VarChar, articulo)
        .query(`
          INSERT INTO AcumuladoStockUbicacion (
            CodigoEmpresa, CodigoAlmacen, Ubicacion, CodigoArticulo,
            UnidadSaldo, Periodo
          ) VALUES (
            @codigoEmpresa, @codigoAlmacen, @ubicacion, @codigoArticulo,
            @cantidad, 99
          )
        `);
    }

    // 3. Registrar movimiento CORREGIDO (usar UnidadStock en lugar de Unidades)
    await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('periodo', sql.Int, periodo)
      .input('fecha', sql.DateTime, fechaActual)
      .input('tipoMovimiento', sql.SmallInt, 3) // 3: Traspaso
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('codigoAlmacen', sql.VarChar, origenAlmacen)
      .input('almacenContrapartida', sql.VarChar, destinoAlmacen)
      .input('unidadStock', sql.Decimal(18,4), cantidad) // CORRECCIÓN CLAVE
      .input('comentario', sql.VarChar, `Traspaso por Usuario: ${usuario}`)
      .input('ubicacion', sql.VarChar, origenUbicacion)
      .input('ubicacionContrapartida', sql.VarChar, destinoUbicacion)
      .query(`
        INSERT INTO MovimientoStock (
          CodigoEmpresa, Ejercicio, Periodo, FechaRegistro, TipoMovimiento,
          CodigoArticulo, CodigoAlmacen, AlmacenContrapartida,
          UnidadStock, Comentario, Ubicacion, UbicacionContrapartida
        ) VALUES (
          @codigoEmpresa, @ejercicio, @periodo, @fecha, @tipoMovimiento,
          @codigoArticulo, @codigoAlmacen, @almacenContrapartida,
          @unidadStock, @comentario, @ubicacion, @ubicacionContrapartida
        )
      `);

    res.json({ success: true, mensaje: 'Traspaso realizado con éxito.' });
  } catch (err) {
    console.error('[ERROR TRASPASO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al realizar el traspaso.',
      error: err.message 
    });
  }
});
// ============================================
// ✅ 28. OBTENER HISTÓRICO DE TRASPASOS (CORREGIDO)
// ============================================
app.get('/historial-traspasos', async (req, res) => {
  const { codigoEmpresa, usuario } = req.query;

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
          m.UnidadStock AS Cantidad,  -- CORRECCIÓN CLAVE: Usar UnidadStock
          m.Comentario,
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
// ✅ 29. OBTENER STOCK POR MÚLTIPLES ARTÍCULOS (SOLO PERIODO 99)
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

  try {
    // Crear cadena de parámetros segura
    const parametros = articulos.map((codigo, index) => {
      return `@articulo${index}`;
    }).join(',');

    const query = `
      SELECT 
        s.CodigoArticulo,
        s.CodigoAlmacen,
        a.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        s.UnidadSaldo AS Cantidad
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
        AND s.CodigoArticulo IN (${parametros})
    `;

    const request = poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa);

    // Añadir inputs dinámicos
    articulos.forEach((codigo, index) => {
      request.input(`articulo${index}`, sql.VarChar, codigo);
    });

    const result = await request.query(query);

    // Agrupar resultados por artículo
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
        nombreAlmacen: row.NombreAlmacen
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
          s.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          s.Ubicacion,
          u.DescripcionUbicacion,
          s.UnidadSaldo AS Cantidad
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

  const connection = await poolGlobal.connect();
  const transaction = new sql.Transaction(connection);
  
  try {
    await transaction.begin();
    
    for (const ajuste of ajustes) {
      // Parsear ubicación
      const [almacenInfo, ubicacionStr] = ajuste.ubicacion.split(' - ');
      const matches = almacenInfo.match(/\(([^)]+)\)/);
      const codigoAlmacen = matches ? matches[1] : almacenInfo;
      const ubicacion = ubicacionStr.trim();
      const partida = ajuste.partida || '';
      const codigoArticulo = ajuste.articulo;
      const nuevaCantidad = ajuste.nuevaCantidad;
      
      const request = new sql.Request(transaction);
      
      // 1. Obtener cantidad actual (SQL corregido)
      const result = await request
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('ubicacion', sql.VarChar, ubicacion)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .input('partida', sql.VarChar, partida)
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
      
      if (result.recordset.length === 0) {
        // Crear nuevo registro si no existe
        await request
          .input('nuevaCantidad', sql.Decimal(18,4), nuevaCantidad)
          .query(`
            INSERT INTO AcumuladoStockUbicacion (
              CodigoEmpresa, CodigoAlmacen, Ubicacion, 
              CodigoArticulo, UnidadSaldo, Periodo, Partida
            ) VALUES (
              @codigoEmpresa, @codigoAlmacen, @ubicacion,
              @codigoArticulo, @nuevaCantidad, 99, @partida
            )
          `);
      } else {
        const cantidadActual = result.recordset[0].Cantidad;
        const diferencia = nuevaCantidad - cantidadActual;
        
        // 2. Actualizar stock
        await request
          .input('nuevaCantidad', sql.Decimal(18,4), nuevaCantidad)
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
        
        // 3. Registrar movimiento solo si hay cambio
        if (diferencia !== 0) {
          const fechaActual = new Date();
          const periodo = fechaActual.getMonth() + 1;
          
          await request
            .input('ejercicio', sql.SmallInt, fechaActual.getFullYear())
            .input('periodo', sql.Int, periodo)
            .input('fecha', sql.DateTime, fechaActual)
            .input('tipoMovimiento', sql.SmallInt, 5) // 5: Ajuste
            .input('diferencia', sql.Decimal(18,4), diferencia)
            .input('comentario', sql.VarChar, `Ajuste manual por ${usuario}`)
            .input('partida', sql.VarChar, partida)
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
    }

    await transaction.commit();
    res.json({ success: true, mensaje: 'Ajustes realizados correctamente' });
    
  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR AJUSTAR INVENTARIO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al ajustar inventario',
      error: err.message 
    });
  } finally {
    connection.release(); // Liberar conexión al pool
  }
});


// ============================================
// ✅ INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log(`✅Servidor backend corriendo en http://localhost:${PORT}✅`);
});