const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const fetch = require('node-fetch'); // 👈 necesario fuera del navegador

const upload = multer();
const router = express.Router();
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'client/build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build/index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// ⚙️ Configuración real de conexión
const dbConfig = {
  user: 'logic',
  password: 'Sage2024+',
  server: 'SVRALANDALUS',
  database: 'DEMOS',
  options: {
    trustServerCertificate: true,
    enableArithAbort: true,   // Mejor control de errores
    requestTimeout: 60000     // ⏰ 60 segundos en lugar de 15
  }
};

require('./cronJobs');


// ✅ Endpoint de login
app.post('/login', async (req, res) => {
  const { usuario, contrasena } = req.body;

  try {
    await sql.connect(dbConfig);

    const result = await sql.query`
      SELECT * FROM Clientes
      WHERE UsuarioLogicNet = ${usuario} AND ContraseñaLogicNet = ${contrasena}
    `;

    if (result.recordset.length > 0) {
      res.json({ success: true, mensaje: 'Login correcto', datos: result.recordset[0] });
    } else {
      res.status(401).json({ success: false, mensaje: 'Usuario o contraseña incorrectos' });
    }
  } catch (err) {
    console.error('[ERROR SQL]', err);
    res.status(500).json({ success: false, mensaje: 'Error de conexión a la base de datos' });
  }
});

// ✅ Endpoint de dashboard para traer las empresas
app.get('/dashboard', async (req, res) => {
  try {
    await sql.connect(dbConfig);

    const result = await sql.query(`
      SELECT * FROM Empresas
    `);

    res.json(result.recordset); // Devolvemos todas las empresas
  } catch (err) {
    console.error('[ERROR SQL DASHBOARD]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener empresas' });
  }
});

// ✅ Nuevo endpoint para traer los comisionistas
app.get('/comisionistas', async (req, res) => {
  const { codigoEmpresa } = req.query;

  if (!codigoEmpresa) {
    return res.status(400).json({ success: false, mensaje: 'Código de empresa requerido.' });
  }

  try {
    await sql.connect(dbConfig);

    const request = new sql.Request();
    request.input('CodigoEmpresa', sql.SmallInt, codigoEmpresa);

    const result = await request.query(`
      SELECT *
      FROM Comisionistas
      WHERE CodigoEmpresa = @CodigoEmpresa
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR SQL COMISIONISTAS]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener comisionistas.' });
  }
});


// ✅ Endpoint para traer clientes filtrados por empresa
app.get('/clientes', async (req, res) => {
  const { codigoEmpresa } = req.query;

  if (!codigoEmpresa) {
    return res.status(400).json({ success: false, mensaje: 'Código de empresa requerido.' });
  }

  try {
    await sql.connect(dbConfig);

    const request = new sql.Request();
    request.input('CodigoEmpresa', sql.SmallInt, codigoEmpresa);

    const result = await request.query(`
      SELECT 
        CodigoCliente, Nombre, Domicilio, Municipio, Provincia, CodigoPostal, Telefono, Fax, Email1
      FROM Clientes
      WHERE CodigoEmpresa = @CodigoEmpresa
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR SQL CLIENTES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener clientes.' });
  }
});

// ✅ Endpoint para traer ficha de un cliente
app.get('/clienteFicha', async (req, res) => {
  const { codigoCliente, codigoEmpresa } = req.query;

  if (!codigoCliente || !codigoEmpresa) {
    return res.status(400).json({ success: false, mensaje: 'Código de cliente y empresa requeridos.' });
  }

  try {
    await sql.connect(dbConfig);

    const request = new sql.Request();
    request.input('CodigoCliente', sql.VarChar(15), codigoCliente);
    request.input('CodigoEmpresa', sql.SmallInt, codigoEmpresa);

    const result = await request.query(`
      SELECT *
      FROM Clientes
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



app.post('/guardarCliente', async (req, res) => {
  const {
    CodigoCliente,
    Nombre,
    CifDni,
    TipoCliente,
    Nombre1,
    FormadePago,
    Email1,
    Email2,
    Telefono,
    Fax,
    CodigoPostal,
    Domicilio,
    Municipio,
    Provincia,
    ObservacionesCliente
  } = req.body;

  if (!CodigoCliente) {
    return res.status(400).json({ success: false, mensaje: 'Código de cliente requerido.' });
  }

  try {
    await sql.connect(dbConfig);

    const request = new sql.Request();
    request.input('Nombre', sql.VarChar, Nombre || '');
    request.input('CifDni', sql.VarChar, CifDni || '');
    request.input('TipoCliente', sql.VarChar, TipoCliente || '');
    request.input('Nombre1', sql.VarChar, Nombre1 || '');
    request.input('FormadePago', sql.VarChar, FormadePago || '');
    request.input('Email1', sql.VarChar, Email1 || '');
    request.input('Email2', sql.VarChar, Email2 || '');
    request.input('Telefono', sql.VarChar, Telefono || '');
    request.input('Fax', sql.VarChar, Fax || '');
    request.input('CodigoPostal', sql.VarChar, CodigoPostal || '');
    request.input('Domicilio', sql.VarChar, Domicilio || '');
    request.input('Municipio', sql.VarChar, Municipio || '');
    request.input('Provincia', sql.VarChar, Provincia || '');
    request.input('ObservacionesCliente', sql.VarChar, ObservacionesCliente || '');
    request.input('CodigoCliente', sql.VarChar, CodigoCliente);

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

let poolGlobal;

// 🔥 Conectar una sola vez
async function conectarDB() {
  if (!poolGlobal) {
    poolGlobal = await sql.connect(dbConfig);
    console.log('✅ Conexión a SQL Server establecida.');
  }
}

// ✅ Antes de cada endpoint, conectar si no está conectado
app.use(async (req, res, next) => {
  try {
    await conectarDB();
    next();
  } catch (err) {
    console.error('Error de conexión:', err);
    res.status(500).send('Error conectando a la base de datos.');
  }
});

// ✅ Endpoints (ahora no vuelves a poner sql.connect)

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

app.get('/pedidosPendientes', async (req, res) => {
  try {
    const result = await poolGlobal.request().query(`
SELECT 
  c.RazonSocial,
  c.Domicilio,
  c.Municipio,
  c.ObservacionesPedido,
  c.Obra,
  l.CodigoArticulo,
  l.DescripcionArticulo,
  l.UnidadesPedidas, 
  l.UnidadesPendientes,
  l.CodigoEmpresa,
  l.EjercicioPedido, 
  l.SeriePedido, 
  l.NumeroPedido,
  l.CodigoAlmacen,
  a.CodigoAlternativo 
FROM CabeceraPedidoCliente c
LEFT JOIN LineasPedidoCliente l 
  ON c.CodigoEmpresa = l.CodigoEmpresa 
  AND c.EjercicioPedido = l.EjercicioPedido 
  AND c.SeriePedido = l.SeriePedido 
  AND c.NumeroPedido = l.NumeroPedido 

  LEFT JOIN Articulos a ON a.CodigoArticulo = l.CodigoArticulo 
  and a.codigoEmpresa = c.CodigoEmpresa

WHERE c.Estado = 0 -- Estado pendiente
  AND c.SeriePedido = 'FERRETERIA' -- 🛠️ FILTRO POR SERIE FERRETERIA
AND NOT EXISTS (
  SELECT 1
  FROM LineasAlbaranCliente la
  WHERE 
    la.CodigoEmpresa = l.CodigoEmpresa AND
    la.EjercicioPedido = l.EjercicioPedido AND
    ISNULL(la.SeriePedido, '') = ISNULL(l.SeriePedido, '') AND
    la.NumeroPedido = l.NumeroPedido
)
ORDER BY c.FechaPedido DESC
    `);

    // Agrupar por pedido
    const pedidosAgrupados = {};

    result.recordset.forEach(row => {
      const key = `${row.CodigoEmpresa}-${row.EjercicioPedido}-${row.SeriePedido}-${row.NumeroPedido}`;

      if (!pedidosAgrupados[key]) {
        pedidosAgrupados[key] = {
          codigoEmpresa: row.CodigoEmpresa,
          ejercicio: row.EjercicioPedido,
          serie: row.SeriePedido,
          numeroPedido: row.NumeroPedido,
          razonSocial: row.RazonSocial,
          domicilio: row.Domicilio,
          municipio: row.Municipio,
          observaciones: row.ObservacionesPedido,
          articulos: []
        };
      }

   pedidosAgrupados[key].articulos.push({
  codigoArticulo: row.CodigoArticulo,
  descripcionArticulo: row.DescripcionArticulo,
  unidadesPedidas: row.UnidadesPedidas,
  unidadesPendientes: row.UnidadesPendientes,
  codigoAlmacen: row.CodigoAlmacen,
 codigoAlternativo: row.CodigoAlternativo
});

    });

    res.json(Object.values(pedidosAgrupados));
  } catch (err) {
    console.error('[ERROR PEDIDOS PENDIENTES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener pedidos pendientes' });
  }
});

// ✅ Endpoint para actualizar una línea de pedido y descontar stock
app.post('/actualizarLineaPedido', async (req, res) => {
  const {
    codigoEmpresa,
    ejercicio,
    serie,
    numeroPedido,
    codigoArticulo,
    cantidadExpedida,
    ubicacion,
    partida // puede ser null
  } = req.body;

  if (
    codigoEmpresa == null ||
    ejercicio == null ||
    numeroPedido == null ||
    codigoArticulo == null ||
    cantidadExpedida == null ||
    ubicacion == null
  ) {
    return res.status(400).json({ success: false, mensaje: 'Datos incompletos para la actualización.' });
  }

  try {
    // 🔹 1. Actualizar línea de pedido (siempre)
    const request = poolGlobal.request();
    request.input('codigoEmpresa', sql.SmallInt, codigoEmpresa);
    request.input('ejercicio', sql.SmallInt, ejercicio);
    request.input('numeroPedido', sql.Int, numeroPedido);
    request.input('codigoArticulo', sql.VarChar, codigoArticulo);
    request.input('cantidadExpedida', sql.Decimal(18, 4), cantidadExpedida);
    request.input('ubicacion', sql.VarChar, ubicacion);
    request.input('serie', sql.VarChar, serie || '');
    if (partida) request.input('partida', sql.VarChar, partida);

    const updatePedidoQuery = `
      UPDATE LineasPedidoCliente
      SET UnidadesPendientes = UnidadesPendientes - @cantidadExpedida
      WHERE 
        CodigoEmpresa = @codigoEmpresa AND
        EjercicioPedido = @ejercicio AND
        NumeroPedido = @numeroPedido AND
        CodigoArticulo = @codigoArticulo AND
        SeriePedido = ISNULL(@serie, '')
    `;
    const result = await request.query(updatePedidoQuery);
    console.log('[UPDATE PEDIDO] Filas afectadas:', result.rowsAffected);

    // 🔹 2. Descontar unidades del stock (solo si la ubicación NO es "Zona descarga")
    if (ubicacion !== "Zona descarga") {
      const stockUpdateRequest = poolGlobal.request();
      stockUpdateRequest.input('codigoEmpresa', sql.SmallInt, codigoEmpresa);
      stockUpdateRequest.input('ejercicio', sql.SmallInt, ejercicio);
      stockUpdateRequest.input('codigoArticulo', sql.VarChar, codigoArticulo);
      stockUpdateRequest.input('ubicacion', sql.VarChar, ubicacion);
      stockUpdateRequest.input('cantidadExpedida', sql.Decimal(18, 4), cantidadExpedida);
      stockUpdateRequest.input('partida', sql.VarChar, partida || '');

      // Obtener precio unitario
      const datosLinea = await poolGlobal.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('numeroPedido', sql.Int, numeroPedido)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .input('serie', sql.VarChar, serie || '')
        .query(`
          SELECT TOP 1 Precio
          FROM LineasPedidoCliente
          WHERE 
            CodigoEmpresa = @codigoEmpresa AND
            EjercicioPedido = @ejercicio AND
            NumeroPedido = @numeroPedido AND
            CodigoArticulo = @codigoArticulo AND
            (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
        `);

      const precioUnitario = datosLinea.recordset[0]?.Precio || 0;

      // Obtener datos de ubicación para CódigoAlmacén y UnidadMedida
      const almacenQuery = await poolGlobal.request()
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .input('ubicacion', sql.VarChar, ubicacion)
        .input('partida', sql.VarChar, partida || '')
        .query(`
          SELECT TOP 1 CodigoAlmacen, UnidadMedida1_
          FROM AcumuladoStockUbicacion
          WHERE CodigoArticulo = @codigoArticulo
            AND Ubicacion = @ubicacion
            AND ISNULL(LTRIM(RTRIM(Partida)), '') = ISNULL(LTRIM(RTRIM(@partida)), '')
        `);

      const codigoAlmacen = almacenQuery.recordset[0]?.CodigoAlmacen || '';
      const unidadMedida = almacenQuery.recordset[0]?.UnidadMedida1_ || '';

      // Insertar movimiento
      const movimientoRequest = poolGlobal.request();
      movimientoRequest.input('codigoEmpresa', sql.SmallInt, codigoEmpresa);
      movimientoRequest.input('ejercicio', sql.SmallInt, ejercicio);
      movimientoRequest.input('periodo', sql.Int, (new Date()).getMonth() + 1);
      movimientoRequest.input('fecha', sql.DateTime, new Date());
      movimientoRequest.input('codigoArticulo', sql.VarChar, codigoArticulo);
      movimientoRequest.input('codigoAlmacen', sql.VarChar, codigoAlmacen);
      movimientoRequest.input('unidadMedida', sql.VarChar, unidadMedida);
      movimientoRequest.input('codigoColor', sql.VarChar, '');
      movimientoRequest.input('codigoTalla', sql.VarChar, '');
      movimientoRequest.input('precioMedio', sql.Decimal(18, 4), precioUnitario);
      movimientoRequest.input('importe', sql.Decimal(18, 4), precioUnitario * cantidadExpedida);
      movimientoRequest.input('ubicacion', sql.VarChar, ubicacion);
      movimientoRequest.input('partida', sql.VarChar, partida || '');
      movimientoRequest.input('cantidadExpedida', sql.Decimal(18, 4), cantidadExpedida);

      await movimientoRequest.query(`
        INSERT INTO MovimientoStock (
          CodigoEmpresa, Ejercicio, Periodo, Fecha, TipoMovimiento,
          CodigoArticulo, CodigoAlmacen, UnidadMedida1_, CodigoColor_,
          CodigoTalla01_, PrecioMedio, Importe, Ubicacion, Partida, Unidades
        ) VALUES (
          @codigoEmpresa, @ejercicio, @periodo, @fecha, 2,
          @codigoArticulo, @codigoAlmacen, @unidadMedida, @codigoColor,
          @codigoTalla, @precioMedio, @importe, @ubicacion, @partida, @cantidadExpedida
        )
      `);
    }

    // 🔹 3. Devolver ubicaciones actualizadas (solo con saldo positivo)
    const stockQuery = poolGlobal.request();
    stockQuery.input('codigoArticulo', sql.VarChar, codigoArticulo);
    const ubicacionesResult = await stockQuery.query(`
      SELECT Ubicacion, Partida, UnidadSaldo
      FROM AcumuladoStockUbicacion
      WHERE CodigoArticulo = @codigoArticulo AND UnidadSaldo > 0
    `);

    res.json({
      success: true,
      mensaje: 'Línea y stock actualizados correctamente.',
      stockActualizado: ubicacionesResult.recordset
    });

  } catch (err) {
    console.error('[ERROR AL ACTUALIZAR LINEA PEDIDO]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al actualizar la línea del pedido o el stock.',
      error: err.message,
      detalle: err.stack
    });
  }
});






app.post('/traspasoAlmacen', async (req, res) => {
  const { articulo, origen, destino, cantidad } = req.body;

  if (!articulo || !origen || !destino || !cantidad) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos para realizar el traspaso.' });
  }

  try {
    const request = poolGlobal.request();

    // Restar del origen
    await request.query(`
      UPDATE AcumuladoStockUbicacion
      SET UnidadSaldo = UnidadSaldo - ${cantidad}
      WHERE CodigoArticulo = '${articulo}' AND Ubicacion = '${origen}'
    `);

    // Sumar al destino
    const checkDestino = await request.query(`
      SELECT COUNT(*) as total
      FROM AcumuladoStockUbicacion
      WHERE CodigoArticulo = '${articulo}' AND Ubicacion = '${destino}'
    `);

    if (checkDestino.recordset[0].total > 0) {
      await request.query(`
        UPDATE AcumuladoStockUbicacion
        SET UnidadSaldo = UnidadSaldo + ${cantidad}
        WHERE CodigoArticulo = '${articulo}' AND Ubicacion = '${destino}'
      `);
    } else {
      await request.query(`
        INSERT INTO AcumuladoStockUbicacion (CodigoArticulo, Ubicacion, UnidadSaldo)
        VALUES ('${articulo}', '${destino}', ${cantidad})
      `);
    }

    res.json({ success: true, mensaje: 'Traspaso realizado correctamente.' });
  } catch (err) {
    console.error('[ERROR AL TRASPASAR STOCK]', err);
    res.status(500).json({ success: false, mensaje: 'Error al traspasar stock.' });
  }
});

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
    const request = poolGlobal.request();
    request.input('codigoEmpresa', sql.SmallInt, codigoEmpresa);
    request.input('ejercicio', sql.SmallInt, ejercicio);
    request.input('numeroPedido', sql.Int, numeroPedido);
    request.input('serie', sql.VarChar, serie || '');

    const cabeceraPedido = await request.query(`
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


    // 4. Insertar cabecera del albarán con totales
    const insertCabecera = poolGlobal.request();
    insertCabecera.input('codigoEmpresa', sql.SmallInt, cab.CodigoEmpresa);
    insertCabecera.input('ejercicio', sql.SmallInt, cab.EjercicioPedido);
    insertCabecera.input('serie', sql.VarChar, cab.SeriePedido || '');
    insertCabecera.input('numeroAlbaran', sql.Int, numeroAlbaran);
    insertCabecera.input('codigoCliente', sql.VarChar, cab.CodigoCliente);
    insertCabecera.input('razonSocial', sql.VarChar, cab.RazonSocial);
    insertCabecera.input('domicilio', sql.VarChar, cab.Domicilio);
    insertCabecera.input('municipio', sql.VarChar, cab.Municipio);
    insertCabecera.input('fecha', sql.DateTime, new Date());
    insertCabecera.input('numeroLineas', sql.Int, totalLineas);
    insertCabecera.input('importeLiquido', sql.Decimal(18, 4), importeLiquido);

    await insertCabecera.query(`
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
  const insertLinea = poolGlobal.request();
  insertLinea.input('codigoEmpresa', sql.SmallInt, linea.CodigoEmpresa);
  insertLinea.input('ejercicio', sql.SmallInt, ejercicio);
  insertLinea.input('serie', sql.VarChar, serie || '');
  insertLinea.input('numeroAlbaran', sql.Int, numeroAlbaran);
  insertLinea.input('orden', sql.SmallInt, index + 1);
  insertLinea.input('codigoArticulo', sql.VarChar, linea.CodigoArticulo);
  insertLinea.input('descripcionArticulo', sql.VarChar, linea.DescripcionArticulo);
  insertLinea.input('unidades', sql.Decimal(18, 4), linea.UnidadesPedidas);
  insertLinea.input('precio', sql.Decimal(18, 4), linea.Precio);
  insertLinea.input('codigoAlmacen', sql.VarChar, linea.CodigoAlmacen || '');
insertLinea.input('partida', sql.VarChar, linea.Partida || '');
  insertLinea.input('porcentajeDescuento', sql.Decimal(5, 2), linea['%Descuento'] || 0);
  insertLinea.input('importeDescuento', sql.Decimal(18, 4), linea.ImporteDescuento || 0);
  insertLinea.input('importeBruto', sql.Decimal(18, 4), linea.ImporteBruto || 0);
  insertLinea.input('importeNeto', sql.Decimal(18, 4), linea.ImporteNeto || 0);
  insertLinea.input('ImporteLiquido', sql.Decimal(18, 4), linea.ImporteLiquido || 0);

  return insertLinea.query(`
    INSERT INTO LineasAlbaranCliente (
      CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
      Orden, CodigoArticulo, DescripcionArticulo, Unidades, Precio,
      CodigoAlmacen, Partida, [%Descuento], ImporteDescuento,
      ImporteBruto, ImporteNeto,ImporteLiquido
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
app.get('/albaranesPendientes', async (req, res) => {
  try {
    const cabeceras = await poolGlobal.request().query(`
      SELECT 
        *
      FROM CabeceraAlbaranCliente
      WHERE StatusFacturado = 0
      ORDER BY FechaAlbaran DESC
    `);

    const resultados = [];

    for (const cab of cabeceras.recordset) {
      const lineas = await poolGlobal.request().query(`
        SELECT DescripcionArticulo AS nombre, Unidades AS cantidad
        FROM LineasAlbaranCliente
        WHERE CodigoEmpresa = ${cab.CodigoEmpresa} 
          AND NumeroAlbaran = ${cab.NumeroAlbaran} 
          AND SerieAlbaran = '${cab.SerieAlbaran}' 
          AND EjercicioAlbaran = ${cab.EjercicioAlbaran}
      `);

 resultados.push({
  id: `${cab.NumeroAlbaran}-${cab.SerieAlbaran}`,
  albaran: `${cab.SerieAlbaran}-${cab.NumeroAlbaran}`,
  cliente: cab.RazonSocial,
  direccion: `${cab.Domicilio}, ${cab.Municipio}`,
  articulos: lineas.recordset,
  importeLiquido: cab.ImporteLiquido,
  FechaAlbaran: cab.FechaAlbaran 
});
    }

    res.json(resultados);
  } catch (err) {
    console.error('[ERROR OBTENER ALBARANES PENDIENTES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener albaranes pendientes', error: err.message });
  }
});

// Obtener todos los artículos con stock
app.get('/articulos', async (req, res) => {
  try {
    const result = await poolGlobal.request().query(`
      SELECT 
        a.CodigoArticulo AS codigo,
        a.DescripcionArticulo AS nombre,
        COALESCE(SUM(asu.UnidadSaldo), 0) AS stock
      FROM Articulos a
      LEFT JOIN AcumuladoStockUbicacion asu ON a.CodigoArticulo = asu.CodigoArticulo
      GROUP BY a.CodigoArticulo, a.DescripcionArticulo
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ARTICULOS]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener artículos' });
  }
});

// Obtener inventario consolidado
app.get('/inventario', async (req, res) => {
  try {
    const result = await poolGlobal.request().query(`
      SELECT 
        a.CodigoArticulo AS codigo,
        a.DescripcionArticulo AS descripcion,
        COALESCE(SUM(asu.UnidadSaldo), 0) AS stock
      FROM Articulos a
      LEFT JOIN AcumuladoStockUbicacion asu ON a.CodigoArticulo = asu.CodigoArticulo
      GROUP BY a.CodigoArticulo, a.DescripcionArticulo
      ORDER BY a.CodigoArticulo
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR INVENTARIO]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener inventario' });
  }
});

// Obtener historial de traspasos (últimos 30 días)
app.get('/traspasos/historial', async (req, res) => {
  const dias = req.query.dias || 30;
  
  try {
    const result = await poolGlobal.request()
      .input('dias', sql.Int, dias)
      .query(`
        SELECT 
          Fecha,
          Articulo,
          AlmacenOrigen,
          UbicacionOrigen,
          AlmacenDestino,
          UbicacionDestino,
          Cantidad,
          Estado
        FROM TraspasosHistorial
        WHERE Fecha >= DATEADD(day, -@dias, GETDATE())
        ORDER BY Fecha DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR HISTORIAL TRASPASOS]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener historial' });
  }
});

// Obtener almacenes
app.get('/almacenes', async (req, res) => {
  try {
    const result = await poolGlobal.request().query(`
      SELECT DISTINCT CodigoAlmacen AS codigo, DescripcionAlmacen AS nombre
      FROM Almacenes
      ORDER BY DescripcionAlmacen
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ALMACENES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener almacenes' });
  }
});

// Obtener ubicaciones de un almacén
app.get('/ubicaciones', async (req, res) => {
  const { almacen } = req.query;
  
  if (!almacen) {
    return res.status(400).json({ success: false, mensaje: 'Almacén requerido' });
  }
  
  try {
    const result = await poolGlobal.request()
      .input('almacen', sql.VarChar, almacen)
      .query(`
        SELECT DISTINCT Ubicacion
        FROM AcumuladoStockUbicacion
        WHERE CodigoAlmacen = @almacen
        ORDER BY Ubicacion
      `);
    
    const ubicaciones = result.recordset.map(row => row.Ubicacion);
    res.json(ubicaciones);
  } catch (err) {
    console.error('[ERROR UBICACIONES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener ubicaciones' });
  }
});

// Confirmar traspasos
app.post('/traspasos/confirmar', async (req, res) => {
  const traspasos = req.body;
  
  if (!Array.isArray(traspasos) || traspasos.length === 0) {
    return res.status(400).json({ success: false, mensaje: 'Datos inválidos' });
  }
  
  try {
    for (const traspaso of traspasos) {
      const { articulo, almacenOrigen, ubicacionOrigen, almacenDestino, ubicacionDestino, cantidad } = traspaso;
      
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
        .input('fecha', sql.Date, new Date())
        .input('articulo', sql.VarChar, articulo)
        .input('almacenOrigen', sql.VarChar, almacenOrigen)
        .input('ubicacionOrigen', sql.VarChar, ubicacionOrigen)
        .input('almacenDestino', sql.VarChar, almacenDestino)
        .input('ubicacionDestino', sql.VarChar, ubicacionDestino)
        .input('cantidad', sql.Int, cantidad)
        .query(`
          INSERT INTO TraspasosHistorial (
            Fecha, Articulo, AlmacenOrigen, UbicacionOrigen,
            AlmacenDestino, UbicacionDestino, Cantidad
          ) VALUES (
            @fecha, @articulo, @almacenOrigen, @ubicacionOrigen,
            @almacenDestino, @ubicacionDestino, @cantidad
          )
        `);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('[ERROR CONFIRMAR TRASPASOS]', err);
    res.status(500).json({ success: false, mensaje: 'Error al confirmar traspasos' });
  }
});


// Endpoint para recibir el PDF y enviarlo por correo
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
        pass: 'zffu ydpx mxwh sqkw' // contraseña de aplicación
      }
    });

    await transporter.sendMail({
      from: 'Ferretería Luque <sergitabernerrsalle@gmail.com>',
      to,
      subject: 'Entrega de Albarán',
      text: 'Adjunto encontrarás el PDF con el detalle del albarán entregado.',
      attachments: [
        {
          filename: pdfName,
          content: pdfBuffer
        }
      ]
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[ERROR ENVÍO EMAIL]', error);
    res.status(500).json({ success: false, mensaje: 'Error al enviar correo.', error: error.message });
  }
});

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


// 🖥️ Levantar servidor
app.listen(PORT, () => {
  console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
});