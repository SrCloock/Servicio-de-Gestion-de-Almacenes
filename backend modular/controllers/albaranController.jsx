// Archivo generado automáticamente: albaranController.js
const { getPool, sql } = require('../config/db');

const generarAlbaranDesdePedido = async (req, res) => {
  const { codigoEmpresa, ejercicio, serie, numeroPedido } = req.body;

  if (!codigoEmpresa || !ejercicio || numeroPedido == null) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos del pedido.' });
  }

  try {
    const pool = await getPool();
    // 1. Obtener siguiente número de albarán
    const nextAlbaran = await pool.request()
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
    const cabeceraPedido = await pool.request()
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
    const lineas = await pool.request()
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
    await pool.request()
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
      return pool.request()
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
    await pool.request()
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
};

const getAlbaranesPendientes = async (req, res) => {
  try {
    const pool = await getPool();
    const cabeceras = await pool.request().query(`
      SELECT * 
      FROM CabeceraAlbaranCliente
      WHERE StatusFacturado = 0
      ORDER BY FechaAlbaran DESC
    `);

    const resultados = [];

    for (const cab of cabeceras.recordset) {
      const lineas = await pool.request().query(`
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
};

module.exports = {
  generarAlbaranDesdePedido,
  getAlbaranesPendientes
};