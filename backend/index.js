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

// 🔑 MIDDLEWARE DE PERMISOS ADMIN
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

// Ejemplo de uso en una ruta:
app.get('/todos-albaranes', checkAdmin, async (req, res) => {
  try {
    const result = await poolGlobal.request().query(`
      SELECT * FROM CabeceraAlbaranCliente
      ORDER BY FechaAlbaran DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ALBARANES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener albaranes' });
  }
});

// ============================================
// 🔑 MIDDLEWARE DE AUTENTICACIÓN (CORRECCIÓN FINAL)
// ============================================
app.use((req, res, next) => {
  // Permitir rutas públicas
  const publicPaths = ['/login', '/'];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  // Verificar headers
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

  // Crear objeto user en la request
  req.user = {
    UsuarioLogicNet: usuario,
    CodigoEmpresa: parseInt(codigoempresa, 10) || 0
  };

  console.log(`🔒 Usuario autenticado: ${usuario}, Empresa: ${codigoempresa}`);
  next();
});

// ============================================
// ✅ 1. Conexión a la base de datos
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
// ✅ Función auxiliar: Obtener siguiente número de documento
// ============================================
async function getNextDocumentNumber(transaction, codigoEmpresa, serie) {
  const result = await transaction.request()
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('serie', sql.VarChar(3), serie)
    .query(`
      SELECT ISNULL(MAX(NumeroDocumento), 0) AS maxNum 
      FROM CabeceraTraspasoAlmacen 
      WHERE CodigoEmpresa = @codigoEmpresa 
        AND SerieDocumento = @serie
    `);

  return result.recordset[0].maxNum + 1;
}

// ============================================
// ✅ 2. Login con permisos por categoría (SIN JWT)
// ============================================
app.post('/login', async (req, res) => {
  const { usuario, contrasena } = req.body;

  try {
    const result = await poolGlobal.request()
      .input('usuario', sql.VarChar, usuario)
      .input('contrasena', sql.VarChar, contrasena)
      .query(`
        SELECT 
          c.*,
          ce.CodigoCategoriaEmpleadoLc AS categoria
        FROM Clientes c
        LEFT JOIN LcCategoriasEmpleado ce 
          ON ce.CodigoEmpresa = c.CodigoEmpresa
          AND ce.CodigoCategoriaEmpleadoLc = c.CodigoCategoriaEmpleadoLc
        WHERE c.UsuarioLogicNet = @usuario 
          AND c.ContraseñaLogicNet = @contrasena
      `);

    if (result.recordset.length > 0) {
      const userData = result.recordset[0];

      // Determinar permisos basados en categoría
      const permisos = {
        inventario_editar: userData.categoria === 'ADM',
        pedidos_editar: userData.categoria === 'ADM',
        traspasos_editar: true,
        clientes_editar: userData.categoria === 'ADM',
        dashboard_acceso: true
      };

      // Retornar los datos del usuario y sus permisos (SIN TOKEN)
      res.json({ 
        success: true, 
        mensaje: 'Login correcto', 
        datos: userData,
        permisos 
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
// ✅ 3. Obtener categorías de empleado (CORRECCIÓN)
// ============================================
app.get('/categorias-empleado', async (req, res) => {
  const { codigoEmpresa } = req.query;

  // Verificar autenticación
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
// ✅ 4. Dashboard (Empresas)
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
// ✅ 5. Comisionistas
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
// ✅ 6. Clientes (Listado)
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
// ✅ 7. Ficha de Cliente
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
// ✅ 8. Guardar Cliente
// ============================================
app.post('/guardarCliente', async (req, res) => {
  const clienteData = req.body;
  
  if (!clienteData.CodigoCliente) {
    return res.status(400).json({ success: false, mensaje: 'Código de cliente requerido.' });
  }

  try {
    const request = poolGlobal.request();
    
    // Añadir todos los parámetros
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
// ✅ 9. Histórico de Pedidos
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
// ✅ 10. Consumos del Cliente
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
// ✅ 11. Cobros del Cliente
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
// ✅ 12. Pedidos Pendientes (CORRECCIÓN COMPLETA)
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
    if (parseInt(codigoEmpresa) !== req.user.CodigoEmpresa) {
      return res.status(403).json({ 
        success: false, 
        mensaje: 'No autorizado para esta empresa' 
      });
    }

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
          a.CodigoAlternativo 
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
      pedidosAgrupados[key].articulos.push({
        codigoArticulo: row.CodigoArticulo,
        descripcionArticulo: row.DescripcionArticulo,
        descripcion2Articulo: row.Descripcion2Articulo,
        unidadesPedidas: row.UnidadesPedidas,
        unidadesPendientes: row.UnidadesPendientes,
        codigoAlmacen: row.CodigoAlmacen,
        codigoAlternativo: row.CodigoAlternativo
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

// Nuevo endpoint para obtener stock
app.get('/stock', async (req, res) => {
  const { codigoEmpresa, codigoArticulo } = req.query;
  
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT CodigoAlmacen, Ubicacion, UnidadSaldo 
        FROM AcumuladoStockUbicacion 
        WHERE CodigoEmpresa = @codigoEmpresa 
          AND CodigoArticulo = @codigoArticulo
          AND UnidadSaldo > 0
      `);
      
    res.json(result.recordset);
  } catch (error) {
    console.error('[ERROR OBTENER STOCK]', error);
    res.status(500).json({ error: 'Error al obtener stock' });
  }
});

// Nuevo endpoint para ubicaciones por almacén
app.get('/ubicaciones/almacen', async (req, res) => {
  const { almacen } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('almacen', sql.VarChar, almacen)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT DISTINCT Ubicacion
        FROM AcumuladoStockUbicacion
        WHERE CodigoAlmacen = @almacen
          AND CodigoEmpresa = @codigoEmpresa
      `);

    res.json(result.recordset.map(row => row.Ubicacion));
  } catch (err) {
    console.error('[ERROR UBICACIONES ALMACEN]', err);
    res.status(500).json({ error: 'Error al obtener ubicaciones' });
  }
});

// En el endpoint /ajustar-stock
app.post('/ajustar-stock', async (req, res) => {
  const { codigoArticulo, nuevoStock } = req.body;
  
  if (!req.user || !codigoArticulo || nuevoStock === undefined) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Datos incompletos para ajuste de stock' 
    });
  }
  
  try {    
    if (!req.user.permisos?.inventario_editar) {
      return res.status(403).json({ 
        success: false, 
        mensaje: 'No tiene permisos para realizar esta acción' 
      });
    }

    await poolGlobal.request()
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('nuevoStock', sql.Decimal(18, 4), nuevoStock)
      .input('codigoEmpresa', sql.SmallInt, req.user.CodigoEmpresa)
      .query(`
        UPDATE AcumuladoStockUbicacion
        SET UnidadSaldo = @nuevoStock
        WHERE CodigoArticulo = @codigoArticulo
        AND CodigoEmpresa = @codigoEmpresa
      `);
    
    await poolGlobal.request()
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('nuevoStock', sql.Decimal(18, 4), nuevoStock)
      .input('usuarioId', sql.VarChar, req.user.CodigoCliente)
      .input('fecha', sql.DateTime, new Date())
      .input('codigoEmpresa', sql.SmallInt, req.user.CodigoEmpresa)
      .query(`
        INSERT INTO AjustesInventario (
          CodigoArticulo, StockAnterior, StockNuevo, Usuario, FechaAjuste, CodigoEmpresa
        )
        SELECT 
          @codigoArticulo, 
          UnidadSaldo, 
          @nuevoStock, 
          @usuarioId,
          @fecha,
          @codigoEmpresa
        FROM AcumuladoStockUbicacion
        WHERE CodigoArticulo = @codigoArticulo
        AND CodigoEmpresa = @codigoEmpresa
      `);

    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR AJUSTANDO STOCK]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al ajustar stock',
      error: err.message
    });
  }
});

// ============================================
// ✅ 13. Ubicaciones de un Artículo (ACTUALIZADO)
// ============================================
app.get('/ubicacionesArticulo', async (req, res) => {
  const { codigoArticulo } = req.query;
  
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ 
      success: false, 
      mensaje: 'No autenticado' 
    });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoArticulo) {
    return res.status(400).json({ success: false, mensaje: 'Código de artículo requerido.' });
  }

  try {
    const request = poolGlobal.request();
    request.input('CodigoArticulo', sql.VarChar, codigoArticulo);
    request.input('CodigoEmpresa', sql.SmallInt, codigoEmpresa);

    const ubicacionesPartidasQuery = await request.query(`
      SELECT DISTINCT Ubicacion, Partida
      FROM MovimientoStock
      WHERE CodigoArticulo = @CodigoArticulo
        AND CodigoEmpresa = @CodigoEmpresa
    `);

    const ubicacionesPartidas = ubicacionesPartidasQuery.recordset;

    const stockPromises = ubicacionesPartidas.map(async row => {
      const { Ubicacion, Partida } = row;

      const requestDetalle = poolGlobal.request();
      requestDetalle.input('CodigoArticulo', sql.VarChar, codigoArticulo);
      requestDetalle.input('Ubicacion', sql.VarChar, Ubicacion);
      requestDetalle.input('CodigoEmpresa', sql.SmallInt, codigoEmpresa);
      
      if (Partida !== null) {
        requestDetalle.input('Partida', sql.VarChar, Partida);
      }

      const stockResult = await requestDetalle.query(`
        SELECT UnidadSaldo
        FROM AcumuladoStockUbicacion
        WHERE CodigoArticulo = @CodigoArticulo 
          AND Ubicacion = @Ubicacion
          AND CodigoEmpresa = @CodigoEmpresa
          ${Partida !== null ? "AND Partida = @Partida" : "AND Partida IS NULL"}
      `);

      return {
        ubicacion: Ubicacion,
        partida: Partida || null,
        unidadSaldo: stockResult.recordset[0]?.UnidadSaldo || 0
      };
    });

    const stockPorUbicacionPartida = await Promise.all(stockPromises);

    if (stockPorUbicacionPartida.length === 0) {
      stockPorUbicacionPartida.push({
        ubicacion: "Zona descarga",
        partida: null,
        unidadSaldo: 0
      });
    }

    res.json(stockPorUbicacionPartida);
  } catch (err) {
    console.error('[ERROR UBICACIONES ARTICULO]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener ubicaciones del artículo' });
  }
});

// ============================================
// ✅ 14. Actualizar Línea de Pedido (MODIFICADO)
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
    
    // Manejar partida null (convertir a cadena vacía si es null)
    const partidaValue = datosLinea.partida || '';
    request.input('partida', sql.VarChar, partidaValue);

    // Obtener el almacén desde la línea de pedido
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

    // Actualizar línea de pedido
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

    // Actualizar stock con manejo de partida
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

    // Registrar movimiento de stock
    const fechaActual = new Date();
    const periodo = fechaActual.getMonth() + 1;
    const importe = precio * datosLinea.cantidadExpedida;
    
    request.input('fecha', sql.DateTime, fechaActual);
    request.input('periodo', sql.Int, periodo);
    request.input('tipoMovimiento', sql.SmallInt, 2); // 2 = Salida
    request.input('importe', sql.Decimal(18, 4), importe);

    await request.query(`
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
        Unidades
      ) VALUES (
        @codigoEmpresa,
        @ejercicio,
        @periodo,
        @fecha,
        @tipoMovimiento,
        @codigoArticulo,
        @codigoAlmacen,
        @unidadMedida,
        @precio,
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
// ✅ 15. Traspasos - Artículos por Ubicación (MODIFICADO)
// ============================================
app.get('/articulosPorUbicacion', async (req, res) => {
  const { almacen, ubicacion } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!almacen || !ubicacion || !codigoEmpresa) {
    return res.status(400).json({ success: false, mensaje: 'Datos insuficientes.' });
  }

  try {
    const result = await poolGlobal.request()
      .input('almacen', sql.VarChar, almacen)
      .input('ubicacion', sql.VarChar, ubicacion)
      .input('codigoempresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          a.CodigoArticulo AS codigo,
          a.DescripcionArticulo AS nombre,
          asu.UnidadSaldo AS stock
        FROM AcumuladoStockUbicacion asu
        INNER JOIN Articulos a ON asu.CodigoArticulo = a.CodigoArticulo
        WHERE asu.CodigoAlmacen = @almacen
          AND asu.Ubicacion = @ubicacion
          AND asu.CodigoEmpresa = @codigoempresa
          AND asu.UnidadSaldo > 0
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ARTICULOS POR UBICACION]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener artículos por ubicación' });
  }
});

// ============================================
// ✅ 16. Traspasos - Ubicaciones con Stock (MODIFICADO)
// ============================================
app.get('/ubicacionesConStock', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa) {
    return res.status(400).json({ success: false, mensaje: 'Código de empresa requerido.' });
  }

  try {
    const result = await poolGlobal.request()
      .input('codigoempresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT DISTINCT 
          CodigoAlmacen AS almacen, 
          Ubicacion,
          COUNT(CodigoArticulo) AS articulos
        FROM AcumuladoStockUbicacion
        WHERE UnidadSaldo > 0
          AND CodigoEmpresa = @codigoempresa
        GROUP BY CodigoAlmacen, Ubicacion
        ORDER BY CodigoAlmacen, Ubicacion
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR UBICACIONES CON STOCK]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener ubicaciones con stock' });
  }
});

// ============================================
// ✅ 17. Confirmar Traspasos (VERSIÓN COMPLETA)
// ============================================
app.post('/traspasos/confirmar', async (req, res) => {
  const traspasos = req.body.traspasos;
  const user = req.user;

  if (!traspasos || !Array.isArray(traspasos)) {
    return res.status(400).json({ success: false, mensaje: 'Datos inválidos' });
  }

  const transaction = new sql.Transaction(poolGlobal);
  try {
    await transaction.begin();

    // Agrupar traspasos por par (almacenOrigen, almacenDestino)
    const grupos = {};
    traspasos.forEach(traspaso => {
      const key = `${traspaso.almacenOrigen}-${traspaso.almacenDestino}`;
      if (!grupos[key]) {
        grupos[key] = [];
      }
      grupos[key].push(traspaso);
    });

    // Procesar cada grupo por separado
    for (const [key, grupo] of Object.entries(grupos)) {
      const [almacenOrigen, almacenDestino] = key.split('-');
      
      // Generar ID único para este grupo de traspasos
      const idTraspaso = uuidv4();
      
      // Obtener siguiente número de documento para esta serie
      const nextDoc = await getNextDocumentNumber(transaction, user.CodigoEmpresa, 'TRA');
      
      // Insertar cabecera para este grupo
      await transaction.request()
        .input('idTraspaso', sql.UniqueIdentifier, idTraspaso)
        .input('ejercicio', sql.SmallInt, new Date().getFullYear())
        .input('serie', sql.VarChar(3), 'TRA')
        .input('numero', sql.Int, nextDoc)
        .input('fecha', sql.Date, new Date())
        .input('almacenOrigen', sql.VarChar(10), almacenOrigen)
        .input('almacenDestino', sql.VarChar(10), almacenDestino)
        .input('comentario', sql.VarChar(100), `Traspaso confirmado por ${user.CodigoCliente}`)
        .input('codigoEmpresa', sql.SmallInt, user.CodigoEmpresa)
        .input('usuario', sql.VarChar(50), user.CodigoCliente)
        .query(`
          INSERT INTO CabeceraTraspasoAlmacen 
            (IdTraspasoAlmacen, EjercicioDocumento, SerieDocumento, NumeroDocumento, 
             FechaDocumento, CodigoAlmacen, AlmacenContrapartida, Comentario, 
             CodigoEmpresa, Usuario)
          VALUES 
            (@idTraspaso, @ejercicio, @serie, @numero, 
             @fecha, @almacenOrigen, @almacenDestino, @comentario, 
             @codigoEmpresa, @usuario)
        `);

      // Insertar cada línea del grupo
      for (const traspaso of grupo) {
        await transaction.request()
          .input('idTraspaso', sql.UniqueIdentifier, idTraspaso)
          .input('ejercicio', sql.SmallInt, new Date().getFullYear())
          .input('serie', sql.VarChar(3), 'TRA')
          .input('numero', sql.Int, nextDoc)
          .input('codigoArticulo', sql.VarChar(20), traspaso.articulo)
          .input('unidades', sql.Decimal(18, 4), traspaso.cantidad)
          .input('ubicacionOrigen', sql.VarChar(20), traspaso.ubicacionOrigen)
          .input('ubicacionDestino', sql.VarChar(20), traspaso.ubicacionDestino)
          .input('codigoEmpresa', sql.SmallInt, user.CodigoEmpresa)
          .query(`
            INSERT INTO LineasTraspasoAlmacen (
              IdTraspasoAlmacen, EjercicioDocumento, SerieDocumento, NumeroDocumento,
              CodigoArticulo, Unidades,
              UbicacionOrigen, UbicacionDestino,
              CodigoEmpresa
            ) VALUES (
              @idTraspaso, @ejercicio, @serie, @numero,
              @codigoArticulo, @unidades,
              @ubicacionOrigen, @ubicacionDestino,
              @codigoEmpresa
            )
          `);

        // Actualizar stock: restar del origen (si no es descarga)
        if (traspaso.almacenOrigen !== 'DESCARGA') {
          await transaction.request()
            .input('cantidad', sql.Decimal(18, 2), traspaso.cantidad)
            .input('codigoEmpresa', sql.SmallInt, user.CodigoEmpresa)
            .input('codigoArticulo', sql.VarChar(20), traspaso.articulo)
            .input('almacen', sql.VarChar(10), traspaso.almacenOrigen)
            .input('ubicacion', sql.VarChar(20), traspaso.ubicacionOrigen)
            .query(`
              UPDATE AcumuladoStockUbicacion 
              SET UnidadSaldo = UnidadSaldo - @cantidad
              WHERE CodigoEmpresa = @codigoEmpresa
                AND CodigoArticulo = @codigoArticulo
                AND CodigoAlmacen = @almacen
                AND Ubicacion = @ubicacion
            `);
        }

        // Sumar al destino
        await transaction.request()
          .input('cantidad', sql.Decimal(18, 2), traspaso.cantidad)
          .input('codigoEmpresa', sql.SmallInt, user.CodigoEmpresa)
          .input('codigoArticulo', sql.VarChar(20), traspaso.articulo)
          .input('almacen', sql.VarChar(10), traspaso.almacenDestino)
          .input('ubicacion', sql.VarChar(20), traspaso.ubicacionDestino)
          .query(`
            UPDATE AcumuladoStockUbicacion 
            SET UnidadSaldo = UnidadSaldo + @cantidad
            WHERE CodigoEmpresa = @codigoEmpresa
              AND CodigoArticulo = @codigoArticulo
              AND CodigoAlmacen = @almacen
              AND Ubicacion = @ubicacion
          `);

        // ============================================
        // ✅ INSERTAR MOVIMIENTOS DE STOCK (SIMPLIFICADO)
        // ============================================
        const fechaActual = new Date();
        const periodo = fechaActual.getMonth() + 1;
        
        // Movimiento de SALIDA (origen) - solo si no es descarga
        if (traspaso.almacenOrigen !== 'DESCARGA') {
          await transaction.request()
            .input('codigoEmpresa', sql.SmallInt, user.CodigoEmpresa)
            .input('ejercicio', sql.SmallInt, fechaActual.getFullYear())
            .input('periodo', sql.Int, periodo)
            .input('fecha', sql.DateTime, fechaActual)
            .input('tipoMovimiento', sql.SmallInt, 2)
            .input('codigoArticulo', sql.VarChar, traspaso.articulo)
            .input('codigoAlmacen', sql.VarChar, traspaso.almacenOrigen)
            .input('unidadMedida', sql.VarChar, 'UN')
            .input('precioMedio', sql.Decimal(18, 4), 0)
            .input('importe', sql.Decimal(18, 4), 0)
            .input('ubicacion', sql.VarChar, traspaso.ubicacionOrigen)
            .input('unidades', sql.Decimal(18, 4), traspaso.cantidad)
            .input('comentario', sql.VarChar, `Salida por traspaso`)
            .query(`
              INSERT INTO MovimientoStock (
                CodigoEmpresa, Ejercicio, Periodo, Fecha, TipoMovimiento,
                CodigoArticulo, CodigoAlmacen, UnidadMedida1_, PrecioMedio, Importe,
                Ubicacion, Unidades, Comentario
              ) VALUES (
                @codigoEmpresa, @ejercicio, @periodo, @fecha, @tipoMovimiento,
                @codigoArticulo, @codigoAlmacen, @unidadMedida, @precioMedio, @importe,
                @ubicacion, @unidades, @comentario
              )
            `);
        }

        // Movimiento de ENTRADA (destino)
        await transaction.request()
          .input('codigoEmpresa', sql.SmallInt, user.CodigoEmpresa)
          .input('ejercicio', sql.SmallInt, fechaActual.getFullYear())
          .input('periodo', sql.Int, periodo)
          .input('fecha', sql.DateTime, fechaActual)
          .input('tipoMovimiento', sql.SmallInt, 1)
          .input('codigoArticulo', sql.VarChar, traspaso.articulo)
          .input('codigoAlmacen', sql.VarChar, traspaso.almacenDestino)
          .input('unidadMedida', sql.VarChar, 'UN')
          .input('precioMedio', sql.Decimal(18, 4), 0)
          .input('importe', sql.Decimal(18, 4), 0)
          .input('ubicacion', sql.VarChar, traspaso.ubicacionDestino)
          .input('unidades', sql.Decimal(18, 4), traspaso.cantidad)
          .input('comentario', sql.VarChar, `Entrada por traspaso`)
          .query(`
            INSERT INTO MovimientoStock (
              CodigoEmpresa, Ejercicio, Periodo, Fecha, TipoMovimiento,
              CodigoArticulo, CodigoAlmacen, UnidadMedida1_, PrecioMedio, Importe,
              Ubicacion, Unidades, Comentario
            ) VALUES (
              @codigoEmpresa, @ejercicio, @periodo, @fecha, @tipoMovimiento,
              @codigoArticulo, @codigoAlmacen, @unidadMedida, @precioMedio, @importe,
              @ubicacion, @unidades, @comentario
            )
          `);
      }
    }

    await transaction.commit();
    res.json({ success: true });
  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR CONFIRMAR TRASPASOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al confirmar traspasos',
      error: err.message 
    });
  }
});


// ============================================
// ✅ 18. Generar Albarán desde Pedido
// ============================================
app.post('/generarAlbaranDesdePedido', async (req, res) => {
  const { codigoEmpresa, ejercicio, serie, numeroPedido } = req.body;

  if (!codigoEmpresa || !ejercicio || numeroPedido == null) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos del pedido.' });
  }

  try {
    // 1. Obtener siguiente número de albarán
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

    // 2. Obtener cabecera del pedido
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

    // 3. Obtener líneas del pedido
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

    // 4. Insertar cabecera del albarán
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

    // 5. Insertar líneas en el albarán
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

    // 6. Marcar pedido como servido
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
// ✅ 19. Albaranes Pendientes (IMPLEMENTACIÓN COMPLETA)
// ============================================
app.get('/albaranesPendientes', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  
  try {
    // Obtener cabeceras de albaranes
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

    // Obtener líneas para cada albarán
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
        articulos: lineas.recordset // Agregamos las líneas
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
// ✅ 20. Inventario - Almacenes (CORRECCIÓN)
// ============================================
app.get('/inventario/almacenes', async (req, res) => {
  // Verificar autenticación
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
          a.CodigoArticulo AS codigo,
          a.DescripcionArticulo AS descripcion,
          asu.CodigoAlmacen AS almacen,
          alm.Almacen AS nombreAlmacen,
          SUM(asu.UnidadSaldo) AS stock
        FROM Articulos a
        LEFT JOIN AcumuladoStockUbicacion asu 
          ON a.CodigoArticulo = asu.CodigoArticulo
          AND asu.CodigoEmpresa = @codigoEmpresa
        LEFT JOIN Almacenes alm 
          ON asu.CodigoAlmacen = alm.CodigoAlmacen
          AND alm.CodigoEmpresa = @codigoEmpresa
        WHERE a.CodigoEmpresa = @codigoEmpresa
        GROUP BY a.CodigoArticulo, a.DescripcionArticulo, asu.CodigoAlmacen, alm.Almacen
        ORDER BY a.CodigoArticulo, asu.CodigoAlmacen
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR INVENTARIO ALMACENES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener inventario por almacén',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 21. Inventario - Ubicaciones (CORRECCIÓN)
// ============================================
app.get('/inventario/ubicaciones', async (req, res) => {
  // Verificar autenticación
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
          a.CodigoArticulo AS codigo,
          asu.CodigoAlmacen AS almacen,
          asu.Ubicacion AS ubicacion,
          asu.Partida AS partida,
          SUM(asu.UnidadSaldo) AS stock
        FROM Articulos a
        JOIN AcumuladoStockUbicacion asu ON a.CodigoArticulo = asu.CodigoArticulo
        WHERE a.CodigoEmpresa = @codigoEmpresa
          AND asu.CodigoEmpresa = @codigoEmpresa
        GROUP BY a.CodigoArticulo, asu.CodigoAlmacen, asu.Ubicacion, asu.Partida
        ORDER BY a.CodigoArticulo, asu.CodigoAlmacen, asu.Ubicacion
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR INVENTARIO UBICACIONES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener inventario por ubicación',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 23. Inventario Consolidado (CORRECCIÓN)
// ============================================
app.get('/inventario', async (req, res) => {
  // Verificar autenticación
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
          a.CodigoArticulo AS codigo,
          a.DescripcionArticulo AS descripcion,
          COALESCE(SUM(asu.UnidadSaldo), 0) AS stock
        FROM Articulos a
        LEFT JOIN AcumuladoStockUbicacion asu 
          ON a.CodigoArticulo = asu.CodigoArticulo
          AND asu.CodigoEmpresa = @codigoEmpresa
        WHERE a.CodigoEmpresa = @codigoEmpresa
        GROUP BY a.CodigoArticulo, a.DescripcionArticulo
        ORDER BY a.CodigoArticulo
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR INVENTARIO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener inventario',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 24. Listado de Almacenes (CORRECCIÓN)
// ============================================
app.get('/almacenes', async (req, res) => {
  // Verificar autenticación
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
        SELECT CodigoAlmacen AS codigo, Almacen AS nombre
        FROM Almacenes
        WHERE CodigoEmpresa = @codigoEmpresa
        ORDER BY Almacen
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ALMACENES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener almacenes',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 25. Ubicaciones (filtrado por empresa)
// ============================================
app.get('/ubicaciones', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, req.user.CodigoEmpresa)
      .query(`
        SELECT DISTINCT CodigoAlmacen, Ubicacion
        FROM AcumuladoStockUbicacion
        WHERE UnidadSaldo > 0
          AND CodigoEmpresa = @codigoEmpresa
        ORDER BY CodigoAlmacen, Ubicacion;
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR UBICACIONES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener ubicaciones' });
  }
});

// ============================================
// ✅ 26. Ubicaciones Múltiples (ACTUALIZADO)
// ============================================
app.post('/ubicacionesMultiples', async (req, res) => {
  const { articulos } = req.body;
  
  // Verificar autenticación
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ 
      success: false, 
      mensaje: 'No autenticado' 
    });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!Array.isArray(articulos) || articulos.length === 0) {
    return res.status(400).json({ success: false, mensaje: 'Lista de artículos requerida.' });
  }

  try {
    const resultados = {};

    for (const codigoArticulo of articulos) {
      const request = poolGlobal.request();
      request.input('CodigoArticulo', sql.VarChar, codigoArticulo);
      request.input('CodigoEmpresa', sql.SmallInt, codigoEmpresa);

      const ubicacionesQuery = await request.query(`
        SELECT DISTINCT Ubicacion, Partida
        FROM MovimientoStock
        WHERE CodigoArticulo = @CodigoArticulo
          AND CodigoEmpresa = @CodigoEmpresa
      `);

      const ubicaciones = await Promise.all(
        ubicacionesQuery.recordset.map(async ({ Ubicacion, Partida }) => {
          const r = poolGlobal.request();
          r.input('CodigoArticulo', sql.VarChar, codigoArticulo);
          r.input('Ubicacion', sql.VarChar, Ubicacion);
          r.input('CodigoEmpresa', sql.SmallInt, codigoEmpresa);
          if (Partida !== null) r.input('Partida', sql.VarChar, Partida);

          const stock = await r.query(`
            SELECT UnidadSaldo
            FROM AcumuladoStockUbicacion
            WHERE CodigoArticulo = @CodigoArticulo 
              AND Ubicacion = @Ubicacion
              AND CodigoEmpresa = @CodigoEmpresa
              ${Partida !== null ? "AND Partida = @Partida" : "AND Partida IS NULL"}
          `);

          return {
            ubicacion: Ubicacion,
            partida: Partida || null,
            unidadSaldo: stock.recordset[0]?.UnidadSaldo || 0
          };
        })
      );

      resultados[codigoArticulo] = ubicaciones.filter(u => u.unidadSaldo > 0);
    }

    res.json(resultados);
  } catch (err) {
    console.error('[ERROR MULTI UBICACIONES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener múltiples ubicaciones' });
  }
});

// ============================================
// ✅ 27. Marcar Pedido como Completado
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
// ✅ 28. Enviar PDF por Email
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
// ✅ 29. Ajustar Stock (con permisos)
// ============================================
app.post('/ajustar-stock', async (req, res) => {
  const { codigoArticulo, nuevoStock } = req.body;
  
  if (!req.user || !codigoArticulo || nuevoStock === undefined) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Datos incompletos para ajuste de stock' 
    });
  }
  
  try {    
    // Verificar permisos del usuario
    if (!req.user.permisos?.inventario_editar) {
      return res.status(403).json({ 
        success: false, 
        mensaje: 'No tiene permisos para realizar esta acción' 
      });
    }

    // Actualizar stock en todas las ubicaciones
    await poolGlobal.request()
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('nuevoStock', sql.Decimal(18, 4), nuevoStock)
      .input('codigoEmpresa', sql.SmallInt, req.user.CodigoEmpresa)
      .query(`
        UPDATE AcumuladoStockUbicacion
        SET UnidadSaldo = @nuevoStock
        WHERE CodigoArticulo = @codigoArticulo
        AND CodigoEmpresa = @codigoEmpresa
      `);
    
    // Registrar movimiento de ajuste
    await poolGlobal.request()
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('nuevoStock', sql.Decimal(18, 4), nuevoStock)
      .input('usuarioId', sql.VarChar, req.user.CodigoCliente)
      .input('fecha', sql.DateTime, new Date())
      .input('codigoEmpresa', sql.SmallInt, req.user.CodigoEmpresa)
      .query(`
        INSERT INTO AjustesInventario (
          CodigoArticulo, StockAnterior, StockNuevo, Usuario, FechaAjuste, CodigoEmpresa
        )
        SELECT 
          @codigoArticulo, 
          UnidadSaldo, 
          @nuevoStock, 
          @usuarioId,
          @fecha,
          @codigoEmpresa
        FROM AcumuladoStockUbicacion
        WHERE CodigoArticulo = @codigoArticulo
        AND CodigoEmpresa = @codigoEmpresa
      `);

    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR AJUSTANDO STOCK]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al ajustar stock',
      error: err.message
    });
  }
});

// ============================================
// ✅ Sincronizar Inventario con Sage
// ============================================
app.post('/sincronizar-inventario', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  try {
    // 1. Obtener inventario actualizado de Sage
    const inventarioSage = await poolGlobal.request()
      .input('CodigoEmpresa', sql.SmallInt, req.user.CodigoEmpresa)
      .query(`SELECT * FROM InventarioSage WHERE CodigoEmpresa = @CodigoEmpresa`);
    
    // 2. Actualizar nuestra base de datos
    for (const item of inventarioSage.recordset) {
      await poolGlobal.request()
        .input('CodigoArticulo', sql.VarChar, item.CodigoArticulo)
        .input('Stock', sql.Int, item.Stock)
        .input('CodigoEmpresa', sql.SmallInt, req.user.CodigoEmpresa)
        .query(`UPDATE AcumuladoStockUbicacion 
                SET UnidadSaldo = @Stock 
                WHERE CodigoArticulo = @CodigoArticulo
                AND CodigoEmpresa = @CodigoEmpresa`);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR SINCRONIZACION]', err);
    res.status(500).json({ success: false, mensaje: 'Error al sincronizar inventario' });
  }
});

// ============================================
// ✅ 31. Historial de Traspasos (CORRECCIÓN)
// ============================================
app.get('/traspasos/historial', async (req, res) => {
  // Verificar autenticación
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
          Fecha,
          Articulo,
          AlmacenOrigen,
          UbicacionOrigen,
          AlmacenDestino,
          UbicacionDestino,
          Cantidad,
          Usuario
        FROM TraspasosHistorial
        WHERE CodigoEmpresa = @codigoEmpresa
        ORDER BY Fecha DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR HISTORIAL TRASPASOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener historial de traspasos',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 32. Movimientos de Stock (NUEVO)
// ============================================
app.get('/movimientos', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  const { dias = 30 } = req.query;
  
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, req.user.CodigoEmpresa)
      .query(`
        SELECT TOP 100 *
        FROM MovimientoStock 
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Fecha >= DATEADD(day, -${dias}, GETDATE())
        ORDER BY Fecha DESC
      `);
    
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR MOVIMIENTOS STOCK]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener movimientos' });
  }
});

// backend/index.js (agregar estas rutas)

// Nuevo endpoint para obtener empresas
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

// Nuevo endpoint para obtener repartidores
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

// ✅ 33. Ajustar Stock por Ubicación/Partida
app.post('/ajustar-stock-ubicacion', async (req, res) => {
  const { 
    codigoArticulo, 
    codigoAlmacen, 
    ubicacion, 
    partida, 
    nuevoStock 
  } = req.body;
  
  if (!req.user || !codigoArticulo || nuevoStock === undefined) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Datos incompletos' 
    });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  const usuarioId = req.user.CodigoCliente;

  try {
    // 1. Obtener stock actual para registro histórico
    const stockActual = await poolGlobal.request()
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacion)
      .input('partida', sql.VarChar, partida || '')
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT UnidadSaldo
        FROM AcumuladoStockUbicacion
        WHERE CodigoArticulo = @codigoArticulo
          AND CodigoAlmacen = @codigoAlmacen
          AND Ubicacion = @ubicacion
          AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
          AND CodigoEmpresa = @codigoEmpresa
      `);

    const stockAnterior = stockActual.recordset[0]?.UnidadSaldo || 0;

    // 2. Actualizar stock
    await poolGlobal.request()
      .input('nuevoStock', sql.Decimal(18, 4), nuevoStock)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacion)
      .input('partida', sql.VarChar, partida || '')
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        UPDATE AcumuladoStockUbicacion
        SET UnidadSaldo = @nuevoStock
        WHERE CodigoArticulo = @codigoArticulo
          AND CodigoAlmacen = @codigoAlmacen
          AND Ubicacion = @ubicacion
          AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
          AND CodigoEmpresa = @codigoEmpresa
      `);

    // 3. Registrar en histórico
    await poolGlobal.request()
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacion)
      .input('partida', sql.VarChar, partida || null)
      .input('stockAnterior', sql.Decimal(18, 4), stockAnterior)
      .input('stockNuevo', sql.Decimal(18, 4), nuevoStock)
      .input('usuario', sql.VarChar, usuarioId)
      .input('fecha', sql.DateTime, new Date())
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        INSERT INTO AjustesStockUbicacion (
          CodigoArticulo, CodigoAlmacen, Ubicacion, Partida,
          StockAnterior, StockNuevo, Usuario, Fecha, CodigoEmpresa
        ) VALUES (
          @codigoArticulo, @codigoAlmacen, @ubicacion, @partida,
          @stockAnterior, @stockNuevo, @usuario, @fecha, @codigoEmpresa
        )
      `);

    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR AJUSTE UBICACION]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al ajustar stock',
      error: err.message 
    });
  }
});

// Nuevo endpoint para asignar pedidos
app.post('/asignarPedido', async (req, res) => {
  const { pedidoId, repartidorId, codigoEmpresa } = req.body;
  
  if (!pedidoId || !repartidorId || !codigoEmpresa) {
    return res.status(400).json({ success: false, mensaje: 'Datos incompletos' });
  }

  try {
    await poolGlobal.request()
      .input('pedidoId', sql.Int, pedidoId)
      .input('repartidorId', sql.VarChar, repartidorId)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        UPDATE CabeceraPedidoCliente
        SET CodigoRepartidor = @repartidorId
        WHERE NumeroPedido = @pedidoId
        AND CodigoEmpresa = @codigoEmpresa
      `);
    
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR ASIGNAR PEDIDO]', err);
    res.status(500).json({ success: false, mensaje: 'Error al asignar pedido' });
  }
});

// ✅ 34. Ajustar múltiples stocks
app.post('/ajustar-stock-multiple', async (req, res) => {
  const { ajustes } = req.body;
  
  if (!req.user || !Array.isArray(ajustes)) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Datos inválidos' 
    });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  const usuarioId = req.user.CodigoCliente;

  try {
    for (const ajuste of ajustes) {
      const { 
        codigoArticulo, 
        codigoAlmacen, 
        ubicacion, 
        partida, 
        nuevoStock 
      } = ajuste;

      // 1. Obtener stock actual para registro histórico
      const stockActual = await poolGlobal.request()
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('ubicacion', sql.VarChar, ubicacion)
        .input('partida', sql.VarChar, partida || '')
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          SELECT UnidadSaldo
          FROM AcumuladoStockUbicacion
          WHERE CodigoArticulo = @codigoArticulo
            AND CodigoAlmacen = @codigoAlmacen
            AND Ubicacion = @ubicacion
            AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
            AND CodigoEmpresa = @codigoEmpresa
        `);

      const stockAnterior = stockActual.recordset[0]?.UnidadSaldo || 0;

      // 2. Actualizar stock
      await poolGlobal.request()
        .input('nuevoStock', sql.Decimal(18, 4), nuevoStock)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('ubicacion', sql.VarChar, ubicacion)
        .input('partida', sql.VarChar, partida || '')
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          UPDATE AcumuladoStockUbicacion
          SET UnidadSaldo = @nuevoStock
          WHERE CodigoArticulo = @codigoArticulo
            AND CodigoAlmacen = @codigoAlmacen
            AND Ubicacion = @ubicacion
            AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
            AND CodigoEmpresa = @codigoEmpresa
        `);

      // 3. Registrar en histórico
      await poolGlobal.request()
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('ubicacion', sql.VarChar, ubicacion)
        .input('partida', sql.VarChar, partida || null)
        .input('stockAnterior', sql.Decimal(18, 4), stockAnterior)
        .input('stockNuevo', sql.Decimal(18, 4), nuevoStock)
        .input('usuario', sql.VarChar, usuarioId)
        .input('fecha', sql.DateTime, new Date())
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          INSERT INTO AjustesStockUbicacion (
            CodigoArticulo, CodigoAlmacen, Ubicacion, Partida,
            StockAnterior, StockNuevo, Usuario, Fecha, CodigoEmpresa
          ) VALUES (
            @codigoArticulo, @codigoAlmacen, @ubicacion, @partida,
            @stockAnterior, @stockNuevo, @usuario, @fecha, @codigoEmpresa
          )
        `);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR AJUSTE MULTIPLE]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al ajustar stocks',
      error: err.message 
    });
  }
});

// stock por ubicacion nuevo

app.get('/stock-ubicacion', async (req, res) => {
  const { codigoEmpresa, codigoArticulo } = req.query;
  
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT CodigoAlmacen, Ubicacion, UnidadSaldo 
        FROM AcumuladoStockUbicacion 
        WHERE CodigoEmpresa = @codigoEmpresa 
          AND CodigoArticulo = @codigoArticulo
          AND UnidadSaldo > 0
      `);
      
    res.json(result.recordset);
  } catch (error) {
    console.error('[ERROR OBTENER STOCK POR UBICACION]', error);
    res.status(500).json({ error: 'Error al obtener stock por ubicación' });
  }
});


// stock total por almacen 

app.get('/stock-total', async (req, res) => {
  const { codigoEmpresa, codigoArticulo } = req.query;
  
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT CodigoAlmacen, SUM(UnidadSaldo) AS UnidadSaldo
        FROM AcumuladoStock 
        WHERE CodigoEmpresa = @codigoEmpresa 
          AND CodigoArticulo = @codigoArticulo
          AND Ejercicio = YEAR(GETDATE())
          AND Periodo = 99
          AND UnidadSaldo > 0
        GROUP BY CodigoAlmacen
      `);
      
    res.json(result.recordset);
  } catch (error) {
    console.error('[ERROR OBTENER STOCK TOTAL]', error);
    res.status(500).json({ error: 'Error al obtener stock total' });
  }
});


// ============================================
// ✅ Obtener stock con ubicaciones (MODIFICADO)
// ============================================
app.get('/stock-con-ubicacion', async (req, res) => {
  const { codigoEmpresa, codigoArticulo } = req.query;
  
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        -- Stock por ubicaciones específicas
        SELECT 
          aus.CodigoAlmacen, 
          aus.Ubicacion,
          aus.UnidadSaldo
        FROM AcumuladoStockUbicacion aus
        WHERE aus.CodigoEmpresa = @codigoEmpresa
          AND aus.CodigoArticulo = @codigoArticulo
          AND aus.UnidadSaldo > 0
        
        UNION ALL
        
        -- Stock no asignado a ubicaciones
        SELECT 
          as2.CodigoAlmacen,
          'Ubicación general' AS Ubicacion,
          (as2.UnidadSaldo - ISNULL(SUM(aus.UnidadSaldo), 0)) AS UnidadSaldo
        FROM AcumuladoStock as2
        LEFT JOIN AcumuladoStockUbicacion aus 
          ON as2.CodigoEmpresa = aus.CodigoEmpresa
          AND as2.CodigoArticulo = aus.CodigoArticulo
          AND as2.CodigoAlmacen = aus.CodigoAlmacen
        WHERE as2.CodigoEmpresa = @codigoEmpresa
          AND as2.CodigoArticulo = @codigoArticulo
          AND as2.Ejercicio = YEAR(GETDATE())
          AND as2.Periodo = 99
        GROUP BY as2.CodigoAlmacen, as2.UnidadSaldo
        HAVING (as2.UnidadSaldo - ISNULL(SUM(aus.UnidadSaldo), 0)) > 0
        
        ORDER BY UnidadSaldo DESC
      `);
      
    res.json(result.recordset);
  } catch (error) {
    console.error('[ERROR OBTENER STOCK CON UBICACION]', error);
    res.status(500).json({ error: 'Error al obtener stock con ubicación' });
  }
});


// ============================================
// ✅ 35. Movimientos combinados (Stock + Traspasos) - VERSIÓN COMPLETA Y CORREGIDA
// ============================================
app.get('/movimientos-combinados', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  const { dias = 30 } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    // 1. Obtener movimientos de stock
    const movimientosStock = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('dias', sql.Int, dias)
      .query(`
        SELECT 
          Fecha,
          CodigoArticulo,
          CodigoAlmacen,
          Ubicacion,
          Unidades,
          TipoMovimiento,
          Comentario,
          NULL AS AlmacenOrigen,
          NULL AS UbicacionOrigen,
          NULL AS AlmacenDestino,
          NULL AS UbicacionDestino,
          'Stock' AS Tipo,
          'Sistema' AS Usuario  -- Valor fijo
        FROM MovimientoStock 
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Fecha >= DATEADD(day, -@dias, GETDATE())
      `);

    // 2. Obtener traspasos con información completa
    const traspasos = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('dias', sql.Int, dias)
      .query(`
        SELECT 
          c.FechaDocumento AS Fecha,
          l.CodigoArticulo,
          c.CodigoAlmacen AS AlmacenOrigen,
          l.UbicacionOrigen,
          c.AlmacenContrapartida AS AlmacenDestino,
          l.UbicacionDestino,
          l.Unidades,
          c.Usuario,
          c.Comentario,
          'Traspaso' AS Tipo
        FROM CabeceraTraspasoAlmacen c
        INNER JOIN LineasTraspasoAlmacen l 
          ON c.IdTraspasoAlmacen = l.IdTraspasoAlmacen
          AND c.CodigoEmpresa = l.CodigoEmpresa
        WHERE c.CodigoEmpresa = @codigoEmpresa
          AND c.FechaDocumento >= DATEADD(day, -@dias, GETDATE())
      `);

    // Combinar y ordenar resultados
    const resultados = [
      ...movimientosStock.recordset,
      ...traspasos.recordset
    ].sort((a, b) => new Date(b.Fecha) - new Date(a.Fecha));

    res.json(resultados);
  } catch (err) {
    console.error('[ERROR MOVIMIENTOS COMBINADOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener movimientos combinados',
      error: err.message
    });
  }
});

// ============================================
// ✅ Historial completo de traspasos
// ============================================
app.get('/historial-traspasos', async (req, res) => {
  const { codigoEmpresa } = req.query;
  
  if (!codigoEmpresa) {
    return res.status(400).json({ success: false, mensaje: 'Código de empresa requerido' });
  }

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT 
          c.*,
          l.CodigoArticulo,
          l.Unidades,
          l.UbicacionOrigen,
          l.UbicacionDestino
        FROM CabeceraTraspasoAlmacen c
        INNER JOIN LineasTraspasoAlmacen l 
          ON c.CodigoEmpresa = l.CodigoEmpresa
          AND c.EjercicioDocumento = l.EjercicioDocumento
          AND c.SerieDocumento = l.SerieDocumento
          AND c.NumeroDocumento = l.NumeroDocumento
        WHERE c.CodigoEmpresa = @codigoEmpresa
        ORDER BY c.FechaDocumento DESC
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR HISTORIAL TRASPASOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener historial de traspasos',
      error: err.message 
    });
  }
});

// Nuevo endpoint para pedidos asignados
app.get('/pedidosAsignados', async (req, res) => {
  const usuario = req.headers.usuario;
  const codigoEmpresa = req.headers.codigoempresa;
  
  try {
    // 1. Obtener información del usuario actual
    const user = await poolGlobal.request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT CodigoCliente, CodigoCategoriaEmpleadoLc 
        FROM Clientes 
        WHERE UsuarioLogicNet = @usuario
        AND CodigoEmpresa = @codigoEmpresa
      `);
    
    if (user.recordset.length === 0) {
      return res.status(404).json([]);
    }
    
    const userData = user.recordset[0];
    
    // 2. Determinar qué pedidos debe ver
    if (userData.CodigoCategoriaEmpleadoLc === 'ADM') {
      // Administrador: ve TODOS los pedidos de empleados (EMP)
      const pedidos = await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          SELECT C.* 
          FROM CabeceraPedidoCliente C
          INNER JOIN Clientes Cli ON C.CodigoCliente = Cli.CodigoCliente
          WHERE Cli.CodigoCategoriaCliente_ = 'EMP'
          AND C.Estado = 0
          AND C.CodigoEmpresa = @codigoEmpresa
        `);
      
      res.json(pedidos.recordset);
      
    } else if (userData.CodigoCategoriaEmpleadoLc === 'REP') {
      // Repartidor: solo ve SUS pedidos
      const pedidos = await poolGlobal.request()
        .input('codigoCliente', sql.VarChar, userData.CodigoCliente)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          SELECT * 
          FROM CabeceraPedidoCliente
          WHERE CodigoCliente = @codigoCliente
          AND Estado = 0
          AND CodigoEmpresa = @codigoEmpresa
        `);
      
      res.json(pedidos.recordset);
      
    } else {
      // Otros empleados (no ADM ni REP) - ver solo sus pedidos
      const pedidos = await poolGlobal.request()
        .input('codigoCliente', sql.VarChar, userData.CodigoCliente)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          SELECT * 
          FROM CabeceraPedidoCliente
          WHERE CodigoCliente = @codigoCliente
          AND Estado = 0
          AND CodigoEmpresa = @codigoEmpresa
        `);
      
      res.json(pedidos.recordset);
    }
    
  } catch (err) {
    console.error('[ERROR PEDIDOS ASIGNADOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener pedidos asignados',
      error: err.message
    });
  }
});

// ============================================
// 🖥️ Iniciar Servidor
// ============================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend accesible en:
  - Local: http://localhost:${PORT}
  - Red: http://${getLocalIp()}:${PORT}`);
});

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '0.0.0.0';
}