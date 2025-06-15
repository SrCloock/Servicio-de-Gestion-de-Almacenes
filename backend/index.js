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
const jwt = require('jsonwebtoken');

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
// ✅ 3. Obtener categorías de empleado
// ============================================
app.get('/categorias-empleado', async (req, res) => {
  const { codigoEmpresa } = req.query;

  if (!codigoEmpresa) {
    return res.status(400).json({ success: false, mensaje: 'Código de empresa requerido.' });
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
    res.status(500).json({ success: false, mensaje: 'Error al obtener categorías de empleado.' });
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
// ✅ 12. Pedidos Pendientes (Actualizado con CodigoEmpresa del usuario)
// ============================================
app.get('/pedidosPendientes', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ 
      success: false, 
      mensaje: 'No autorizado' 
    });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        WITH UltimosPedidos AS (
          SELECT TOP 30 
            c.CodigoEmpresa,
            c.EjercicioPedido,
            c.SeriePedido,
            c.NumeroPedido,
            c.RazonSocial,
            c.Domicilio,
            c.Municipio,
            c.ObservacionesPedido,
            c.NombreObra,
            c.FechaPedido
          FROM CabeceraPedidoCliente c
          WHERE c.Estado = 0
            AND c.CodigoEmpresa = @codigoEmpresa
          ORDER BY c.FechaPedido DESC
        )
        SELECT 
          up.RazonSocial,
          up.Domicilio,
          up.Municipio,
          up.ObservacionesPedido,
          up.NombreObra,
          l.CodigoArticulo,
          l.DescripcionArticulo,
          l.Descripcion2Articulo,
          l.UnidadesPedidas, 
          l.UnidadesPendientes,
          l.CodigoEmpresa,
          l.EjercicioPedido, 
          l.SeriePedido, 
          l.NumeroPedido,
          l.CodigoAlmacen,
          a.CodigoAlternativo 
        FROM UltimosPedidos up
        LEFT JOIN LineasPedidoCliente l 
          ON up.CodigoEmpresa = l.CodigoEmpresa 
          AND up.EjercicioPedido = l.EjercicioPedido 
          AND up.SeriePedido = l.SeriePedido 
          AND up.NumeroPedido = l.NumeroPedido 
        LEFT JOIN Articulos a 
          ON a.CodigoArticulo = l.CodigoArticulo 
          AND a.CodigoEmpresa = l.CodigoEmpresa
        WHERE NOT EXISTS (
          SELECT 1
          FROM LineasAlbaranCliente la
          WHERE 
            la.CodigoEmpresa = l.CodigoEmpresa AND
            la.EjercicioPedido = l.EjercicioPedido AND
            ISNULL(la.SeriePedido, '') = ISNULL(l.SeriePedido, '') AND
            la.NumeroPedido = l.NumeroPedido
        )
        ORDER BY up.FechaPedido DESC
      `);

    // Agrupar por pedido
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
          observacionesPedido: row.ObservacionesPedido,
          NombreObra: row.NombreObra,
          fechaPedido: row.FechaPedido,
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

    // Convertimos el objeto en un array de pedidos
    const pedidosArray = Object.values(pedidosAgrupados);
    
    res.json(pedidosArray);
  } catch (err) {
    console.error('[ERROR PEDIDOS PENDIENTES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener pedidos pendientes',
      error: err.message 
    });
  }
});

// ============================================
// ✅ 13. Ubicaciones de un Artículo
// ============================================
app.get('/ubicacionesArticulo', async (req, res) => {
  const { codigoArticulo } = req.query;

  if (!codigoArticulo) {
    return res.status(400).json({ success: false, mensaje: 'Código de artículo requerido.' });
  }

  try {
    const request = poolGlobal.request();
    request.input('CodigoArticulo', sql.VarChar, codigoArticulo);

    // Obtener ubicaciones y partidas
    const ubicacionesPartidasQuery = await request.query(`
      SELECT DISTINCT Ubicacion, Partida
      FROM MovimientoStock
      WHERE CodigoArticulo = @CodigoArticulo
    `);

    const ubicacionesPartidas = ubicacionesPartidasQuery.recordset;

    // Obtener stock para cada combinación
    const stockPromises = ubicacionesPartidas.map(async row => {
      const { Ubicacion, Partida } = row;

      const requestDetalle = poolGlobal.request();
      requestDetalle.input('CodigoArticulo', sql.VarChar, codigoArticulo);
      requestDetalle.input('Ubicacion', sql.VarChar, Ubicacion);
      if (Partida !== null) {
        requestDetalle.input('Partida', sql.VarChar, Partida);
      }

      const stockResult = await requestDetalle.query(`
        SELECT UnidadSaldo
        FROM AcumuladoStockUbicacion
        WHERE CodigoArticulo = @CodigoArticulo AND Ubicacion = @Ubicacion
        ${Partida !== null ? "AND Partida = @Partida" : "AND Partida IS NULL"}
      `);

      return {
        ubicacion: Ubicacion,
        partida: Partida || null,
        unidadSaldo: stockResult.recordset[0]?.UnidadSaldo || 0
      };
    });

    const stockPorUbicacionPartida = await Promise.all(stockPromises);

    // Si no hay ubicaciones, devolver ubicación por defecto
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
// ✅ 14. Actualizar Línea de Pedido (Expedición)
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
    if (datosLinea.partida) request.input('partida', sql.VarChar, datosLinea.partida);

    // 1. Actualizar pedido
    await request.query(`
      UPDATE LineasPedidoCliente
      SET UnidadesPendientes = UnidadesPendientes - @cantidadExpedida
      WHERE 
        CodigoEmpresa = @codigoEmpresa AND
        EjercicioPedido = @ejercicio AND
        NumeroPedido = @numeroPedido AND
        CodigoArticulo = @codigoArticulo AND
        SeriePedido = ISNULL(@serie, '')
    `);

    // 2. Descontar stock
    await request.query(`
      UPDATE AcumuladoStockUbicacion
      SET UnidadSaldo = UnidadSaldo - @cantidadExpedida
      WHERE 
        CodigoArticulo = @codigoArticulo AND
        Ubicacion = @ubicacion
        ${datosLinea.partida ? "AND Partida = @partida" : "AND Partida IS NULL"}
    `);

    // 3. Registrar movimiento de stock
    const fechaActual = new Date();
    const periodo = fechaActual.getMonth() + 1;

    await request.input('fecha', sql.DateTime, fechaActual);
    await request.input('periodo', sql.Int, periodo);
    await request.input('tipoMovimiento', sql.SmallInt, 2); // Salida

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
      )
      SELECT 
        @codigoEmpresa,
        @ejercicio,
        @periodo,
        @fecha,
        @tipoMovimiento,
        @codigoArticulo,
        CodigoAlmacen,
        UnidadMedida1_,
        Precio,
        Precio * @cantidadExpedida,
        @ubicacion,
        @partida,
        @cantidadExpedida
      FROM LineasPedidoCliente
      WHERE 
        CodigoEmpresa = @codigoEmpresa AND
        EjercicioPedido = @ejercicio AND
        NumeroPedido = @numeroPedido AND
        CodigoArticulo = @codigoArticulo
    `);

    res.json({ success: true, mensaje: 'Línea actualizada y stock descontado' });
  } catch (err) {
    console.error('[ERROR ACTUALIZAR LINEA PEDIDO]', err);
    res.status(500).json({ success: false, mensaje: 'Error al actualizar línea de pedido' });
  }
});

// ============================================
// ✅ 15. Traspasos - Artículos por Ubicación
// ============================================
app.get('/articulosPorUbicacion', async (req, res) => {
  const { almacen, ubicacion } = req.query;

  if (!almacen || !ubicacion) {
    return res.status(400).json({ success: false, mensaje: 'Almacén y ubicación requeridos.' });
  }

  try {
    const result = await poolGlobal.request()
      .input('almacen', sql.VarChar, almacen)
      .input('ubicacion', sql.VarChar, ubicacion)
      .query(`
        SELECT 
          a.CodigoArticulo AS codigo,
          a.DescripcionArticulo AS nombre,
          asu.UnidadSaldo AS stock
        FROM AcumuladoStockUbicacion asu
        INNER JOIN Articulos a ON asu.CodigoArticulo = a.CodigoArticulo
        WHERE asu.CodigoAlmacen = @almacen
          AND asu.Ubicacion = @ubicacion
          AND asu.UnidadSaldo > 0
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ARTICULOS POR UBICACION]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener artículos por ubicación' });
  }
});

// ============================================
// ✅ 16. Traspasos - Ubicaciones con Stock
// ============================================
app.get('/ubicacionesConStock', async (req, res) => {
  try {
    const result = await poolGlobal.request().query(`
      SELECT DISTINCT 
        CodigoAlmacen AS almacen, 
        Ubicacion,
        COUNT(CodigoArticulo) AS articulos
      FROM AcumuladoStockUbicacion
      WHERE UnidadSaldo > 0
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
// ✅ 17. Confirmar Traspasos
// ============================================
app.post('/traspasos/confirmar', async (req, res) => {
  const traspasos = req.body;
  
  if (!Array.isArray(traspasos) || traspasos.length === 0) {
    return res.status(400).json({ success: false, mensaje: 'Datos inválidos' });
  }
  
  try {
    for (const traspaso of traspasos) {
      const { articulo, almacenOrigen, ubicacionOrigen, almacenDestino, ubicacionDestino, cantidad, usuario } = traspaso;
      
      // 1. Restar del origen
      await poolGlobal.request()
        .input('articulo', sql.VarChar, articulo)
        .input('almacenOrigen', sql.VarChar, almacenOrigen)
        .input('ubicacionOrigen', sql.VarChar, ubicacionOrigen)
        .input('cantidad', sql.Int, cantidad)
        .query(`
          UPDATE AcumuladoStockUbicacion
          SET UnidadSaldo = UnidadSaldo - @cantidad
          WHERE CodigoArticulo = @articulo
            AND CodigoAlmacen = @almacenOrigen
            AND Ubicacion = @ubicacionOrigen
        `);
        
      // 2. Sumar al destino
      await poolGlobal.request()
        .input('articulo', sql.VarChar, articulo)
        .input('almacenDestino', sql.VarChar, almacenDestino)
        .input('ubicacionDestino', sql.VarChar, ubicacionDestino)
        .input('cantidad', sql.Int, cantidad)
        .query(`
          UPDATE AcumuladoStockUbicacion
          SET UnidadSaldo = UnidadSaldo + @cantidad
          WHERE CodigoArticulo = @articulo
            AND CodigoAlmacen = @almacenDestino
            AND Ubicacion = @ubicacionDestino
        `);
        
      // 3. Registrar en historial
      await poolGlobal.request()
        .input('fecha', sql.DateTime, new Date())
        .input('articulo', sql.VarChar, articulo)
        .input('almacenOrigen', sql.VarChar, almacenOrigen)
        .input('ubicacionOrigen', sql.VarChar, ubicacionOrigen)
        .input('almacenDestino', sql.VarChar, almacenDestino)
        .input('ubicacionDestino', sql.VarChar, ubicacionDestino)
        .input('cantidad', sql.Int, cantidad)
        .input('usuario', sql.VarChar, usuario)
        .query(`
          INSERT INTO TraspasosHistorial (
            Fecha, Articulo, AlmacenOrigen, UbicacionOrigen,
            AlmacenDestino, UbicacionDestino, Cantidad, Usuario
          ) VALUES (
            @fecha, @articulo, @almacenOrigen, @ubicacionOrigen,
            @almacenDestino, @ubicacionDestino, @cantidad, @usuario
          )
        `);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR CONFIRMAR TRASPASOS]', err);
    res.status(500).json({ success: false, mensaje: 'Error al confirmar traspasos' });
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
// ✅ 19. Albaranes Pendientes (filtrado por empresa)
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
        SELECT * 
        FROM CabeceraAlbaranCliente
        WHERE StatusFacturado = 0
          AND CodigoEmpresa = @codigoEmpresa
        ORDER BY FechaAlbaran DESC
      `);

    // Resto del código sin cambios...
    // ... (código para obtener líneas y agrupar)
  } catch (err) {
    console.error('[ERROR OBTENER ALBARANES PENDIENTES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener albaranes pendientes' });
  }
});

// ============================================
// ✅ 20. Inventario - Almacenes (filtrado por empresa)
// ============================================
app.get('/inventario/almacenes', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, req.user.CodigoEmpresa)
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
    res.status(500).json({ success: false, mensaje: 'Error al obtener inventario por almacén' });
  }
});

// ============================================
// ✅ 21. Inventario - Ubicaciones
// ============================================
app.get('/inventario/ubicaciones', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, req.user.CodigoEmpresa)
      .query(`
        SELECT 
          a.CodigoArticulo AS codigo,
          asu.CodigoAlmacen AS almacen,
          asu.Ubicacion AS ubicacion,
          asu.UnidadSaldo AS stock
        FROM Articulos a
        JOIN AcumuladoStockUbicacion asu ON a.CodigoArticulo = asu.CodigoArticulo
        WHERE asu.UnidadSaldo > 0
          AND a.CodigoEmpresa = @codigoEmpresa
        ORDER BY a.CodigoArticulo, asu.CodigoAlmacen, asu.Ubicacion
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR INVENTARIO UBICACIONES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener inventario por ubicación' });
  }
});

// ============================================
// ✅ 22. Artículos con Stock (filtrado por empresa)
// ============================================
app.get('/articulos', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, req.user.CodigoEmpresa)
      .query(`
        SELECT 
          a.CodigoArticulo AS codigo,
          a.DescripcionArticulo AS nombre,
          COALESCE(SUM(asu.UnidadSaldo), 0) AS stock
        FROM Articulos a
        LEFT JOIN AcumuladoStockUbicacion asu ON a.CodigoArticulo = asu.CodigoArticulo
        WHERE a.CodigoEmpresa = @codigoEmpresa
        GROUP BY a.CodigoArticulo, a.DescripcionArticulo
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ARTICULOS]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener artículos' });
  }
});

// ============================================
// ✅ 23. Inventario Consolidado (filtrado por empresa)
// ============================================
app.get('/inventario', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, req.user.CodigoEmpresa)
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
    res.status(500).json({ success: false, mensaje: 'Error al obtener inventario' });
  }
});

// ============================================
// ✅ 24. Listado de Almacenes (filtrado por empresa)
// ============================================
app.get('/almacenes', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  try {
    const result = await poolGlobal.request()
      .input('codigoEmpresa', sql.SmallInt, req.user.CodigoEmpresa)
      .query(`
        SELECT DISTINCT CodigoAlmacen AS codigo, Almacen AS nombre
        FROM Almacenes
        WHERE CodigoEmpresa = @codigoEmpresa
        ORDER BY Almacen
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ALMACENES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener almacenes' });
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
// ✅ 26. Ubicaciones Múltiples
// ============================================
app.post('/ubicacionesMultiples', async (req, res) => {
  const { articulos } = req.body;

  if (!Array.isArray(articulos) || articulos.length === 0) {
    return res.status(400).json({ success: false, mensaje: 'Lista de artículos requerida.' });
  }

  try {
    const resultados = {};

    for (const codigoArticulo of articulos) {
      const request = poolGlobal.request();
      request.input('CodigoArticulo', sql.VarChar, codigoArticulo);

      const ubicacionesQuery = await request.query(`
        SELECT DISTINCT Ubicacion, Partida
        FROM MovimientoStock
        WHERE CodigoArticulo = @CodigoArticulo
      `);

      const ubicaciones = await Promise.all(
        ubicacionesQuery.recordset.map(async ({ Ubicacion, Partida }) => {
          const r = poolGlobal.request();
          r.input('CodigoArticulo', sql.VarChar, codigoArticulo);
          r.input('Ubicacion', sql.VarChar, Ubicacion);
          if (Partida !== null) r.input('Partida', sql.VarChar, Partida);

          const stock = await r.query(`
            SELECT UnidadSaldo
            FROM AcumuladoStockUbicacion
            WHERE CodigoArticulo = @CodigoArticulo AND Ubicacion = @Ubicacion
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