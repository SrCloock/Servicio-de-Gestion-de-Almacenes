const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

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
        l.CodigoArticulo,
        l.DescripcionArticulo,
        l.UnidadesPedidas, 
        l.UnidadesPendientes,
        l.CodigoEmpresa,
        l.EjercicioPedido, 
        l.SeriePedido, 
        l.NumeroPedido 
      FROM CabeceraPedidoCliente c
      LEFT JOIN LineasPedidoCliente l ON 
        c.CodigoEmpresa = l.CodigoEmpresa 
        AND c.EjercicioPedido = l.EjercicioPedido 
        AND c.SeriePedido = l.SeriePedido 
        AND c.NumeroPedido = l.NumeroPedido
      WHERE l.UnidadesPendientes > 0
      ORDER BY l.NumeroPedido DESC
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
        unidadesPendientes: row.UnidadesPendientes
      });
    });

    res.json(Object.values(pedidosAgrupados));
  } catch (err) {
    console.error('[ERROR PEDIDOS PENDIENTES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener pedidos pendientes' });
  }
});

// ✅ Endpoint para obtener ubicaciones donde hay stock para un artículo
app.get('/ubicacionesArticulo', async (req, res) => {
  const { codigoArticulo } = req.query;

  if (!codigoArticulo) {
    return res.status(400).json({ success: false, mensaje: 'Código de artículo requerido.' });
  }

  try {
    const request = poolGlobal.request();
    request.input('CodigoArticulo', sql.VarChar, codigoArticulo);

    // Obtener ubicaciones
    const ubicacionesQuery = await request.query(`
      SELECT DISTINCT Ubicacion
      FROM MovimientoStock
      WHERE CodigoArticulo = @CodigoArticulo
    `);

    const ubicaciones = ubicacionesQuery.recordset.map(row => row.Ubicacion);

    // Obtener stock en esas ubicaciones
    const stockPromises = ubicaciones.map(async ubicacion => {
      const stockResult = await poolGlobal.request().query(`
        SELECT UnidadSaldo
        FROM AcumuladoStockUbicacion
        WHERE CodigoArticulo = '${codigoArticulo}' AND Ubicacion = '${ubicacion}'
      `);

      return {
        ubicacion,
        unidadSaldo: stockResult.recordset[0]?.UnidadSaldo || 0
      };
    });

    const stockPorUbicacion = await Promise.all(stockPromises);

    res.json(stockPorUbicacion);
  } catch (err) {
    console.error('[ERROR UBICACIONES ARTICULO]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener ubicaciones del artículo' });
  }
});

app.post('/actualizarLineaPedido', async (req, res) => {
  const { codigoEmpresa, ejercicio, serie, numeroPedido, codigoArticulo, cantidadExpedida } = req.body;

  if (!codigoEmpresa || !ejercicio || !serie || !numeroPedido || !codigoArticulo || !cantidadExpedida) {
    return res.status(400).json({ success: false, mensaje: 'Datos incompletos para la actualización.' });
  }

  try {
    const request = poolGlobal.request();
    await request.query(`
      UPDATE LineasPedidoCliente
      SET UnidadesPendientes = UnidadesPendientes - ${cantidadExpedida}
      WHERE 
        CodigoEmpresa = ${codigoEmpresa} AND
        EjercicioPedido = ${ejercicio} AND
        SeriePedido = '${serie}' AND
        NumeroPedido = ${numeroPedido} AND
        CodigoArticulo = '${codigoArticulo}'
    `);

    res.json({ success: true, mensaje: 'Línea actualizada correctamente.' });
  } catch (err) {
    console.error('[ERROR AL ACTUALIZAR LINEA PEDIDO]', err);
    res.status(500).json({ success: false, mensaje: 'Error al actualizar la línea del pedido.' });
  }
});


// 🖥️ Levantar servidor
app.listen(PORT, () => {
  console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
});
