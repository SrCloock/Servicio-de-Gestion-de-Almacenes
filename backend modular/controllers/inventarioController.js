// Archivo generado automáticamente: inventarioController.js
const { getPool, sql } = require('../config/db');

const getUbicacionesArticulo = async (req, res) => {
  const { codigoArticulo } = req.query;

  if (!codigoArticulo) {
    return res.status(400).json({ success: false, mensaje: 'Código de artículo requerido.' });
  }

  try {
    const pool = await getPool();
    const request = pool.request();
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

      const requestDetalle = pool.request();
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
};

const actualizarLineaPedido = async (req, res) => {
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
    const pool = await getPool();
    const request = pool.request();
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
};

const getArticulosPorUbicacion = async (req, res) => {
  const { almacen, ubicacion } = req.query;

  if (!almacen || !ubicacion) {
    return res.status(400).json({ success: false, mensaje: 'Almacén y ubicación requeridos.' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
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
};

const getUbicacionesConStock = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
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
};

const confirmarTraspasos = async (req, res) => {
  const traspasos = req.body;
  
  if (!Array.isArray(traspasos) || traspasos.length === 0) {
    return res.status(400).json({ success: false, mensaje: 'Datos inválidos' });
  }
  
  try {
    const pool = await getPool();
    for (const traspaso of traspasos) {
      const { articulo, almacenOrigen, ubicacionOrigen, almacenDestino, ubicacionDestino, cantidad, usuario } = traspaso;
      
      // 1. Restar del origen
      await pool.request()
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
      await pool.request()
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
      await pool.request()
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
};

const getInventarioAlmacenes = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        a.CodigoArticulo AS codigo,
        a.DescripcionArticulo AS descripcion,
        asu.CodigoAlmacen AS almacen,
        alm.Almacen AS nombreAlmacen,
        SUM(asu.UnidadSaldo) AS stock
      FROM Articulos a
      LEFT JOIN AcumuladoStockUbicacion asu ON a.CodigoArticulo = asu.CodigoArticulo
      LEFT JOIN Almacenes alm ON asu.CodigoAlmacen = alm.CodigoAlmacen
      GROUP BY a.CodigoArticulo, a.DescripcionArticulo, asu.CodigoAlmacen, alm.Almacen
      ORDER BY a.CodigoArticulo, asu.CodigoAlmacen
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR INVENTARIO ALMACENES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener inventario por almacén' });
  }
};

const getInventarioUbicaciones = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT 
        a.CodigoArticulo AS codigo,
        asu.CodigoAlmacen AS almacen,
        asu.Ubicacion AS ubicacion,
        asu.UnidadSaldo AS stock
      FROM Articulos a
      JOIN AcumuladoStockUbicacion asu ON a.CodigoArticulo = asu.CodigoArticulo
      WHERE asu.UnidadSaldo > 0
      ORDER by a.CodigoArticulo, asu.CodigoAlmacen, asu.Ubicacion
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR INVENTARIO UBICACIONES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener inventario por ubicación' });
  }
};

const getArticulos = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
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
};

const getInventario = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
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
};

const getAlmacenes = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT DISTINCT CodigoAlmacen AS codigo, Almacen AS nombre
      FROM Almacenes
      ORDER BY Almacen
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ALMACENES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener almacenes' });
  }
};

const getUbicaciones = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT DISTINCT CodigoAlmacen, Ubicacion
      FROM AcumuladoStockUbicacion
      WHERE UnidadSaldo > 0
      ORDER BY CodigoAlmacen, Ubicacion;
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR UBICACIONES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener ubicaciones' });
  }
};

const getUbicacionesMultiples = async (req, res) => {
  const { articulos } = req.body;

  if (!Array.isArray(articulos) || articulos.length === 0) {
    return res.status(400).json({ success: false, mensaje: 'Lista de artículos requerida.' });
  }

  try {
    const pool = await getPool();
    const resultados = {};

    for (const codigoArticulo of articulos) {
      const request = pool.request();
      request.input('CodigoArticulo', sql.VarChar, codigoArticulo);

      const ubicacionesQuery = await request.query(`
        SELECT DISTINCT Ubicacion, Partida
        FROM MovimientoStock
        WHERE CodigoArticulo = @CodigoArticulo
      `);

      const ubicaciones = await Promise.all(
        ubicacionesQuery.recordset.map(async ({ Ubicacion, Partida }) => {
          const r = pool.request();
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
};

const ajustarStock = async (req, res) => {
  const { codigoArticulo, nuevoStock, usuarioId, codigoEmpresa } = req.body;
  
  if (!codigoArticulo || nuevoStock === undefined || !usuarioId || !codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Datos incompletos para ajuste de stock' 
    });
  }

  try {
    const pool = await getPool();
    
    // Verificar permisos
    const permisoResult = await pool.request()
      .input('usuarioId', sql.VarChar, usuarioId)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT ce.CodigoCategoriaEmpleadoLc
        FROM Clientes c
        JOIN LcCategoriasEmpleado ce 
          ON ce.CodigoEmpresa = c.CodigoEmpresa
          AND ce.CodigoCategoriaEmpleadoLc = c.CodigoCategoriaEmpleadoLc
        WHERE c.CodigoCliente = @usuarioId
          AND c.CodigoEmpresa = @codigoEmpresa
      `);

    if (permisoResult.recordset.length === 0 || 
        permisoResult.recordset[0].CodigoCategoriaEmpleadoLc !== 'ADM') {
      return res.status(403).json({ 
        success: false, 
        mensaje: 'No tiene permisos para realizar esta acción' 
      });
    }

    // Actualizar stock en todas las ubicaciones
    await pool.request()
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('nuevoStock', sql.Decimal(18, 4), nuevoStock)
      .query(`
        UPDATE AcumuladoStockUbicacion
        SET UnidadSaldo = @nuevoStock
        WHERE CodigoArticulo = @codigoArticulo
      `);
    
    // Registrar movimiento de ajuste
    await pool.request()
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('nuevoStock', sql.Decimal(18, 4), nuevoStock)
      .input('usuarioId', sql.VarChar, usuarioId)
      .input('fecha', sql.DateTime, new Date())
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
          CodigoEmpresa
        FROM AcumuladoStockUbicacion
        WHERE CodigoArticulo = @codigoArticulo
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
};

module.exports = {
  getUbicacionesArticulo,
  actualizarLineaPedido,
  getArticulosPorUbicacion,
  getUbicacionesConStock,
  confirmarTraspasos,
  getInventarioAlmacenes,
  getInventarioUbicaciones,
  getArticulos,
  getInventario,
  getAlmacenes,
  getUbicaciones,
  getUbicacionesMultiples,
  ajustarStock
};