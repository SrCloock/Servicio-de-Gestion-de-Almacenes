// Archivo generado automáticamente: pedidoController.js
const { getPool, sql } = require('../config/db');

const getPedidosPendientes = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
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
          AND c.CodigoEmpresa = 1
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
};

const marcarPedidoCompletado = async (req, res) => {
  const { codigoEmpresa, ejercicio, numeroPedido, serie } = req.body;

  if (!codigoEmpresa || !ejercicio || !numeroPedido) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos del pedido.' });
  }

  try {
    const pool = await getPool();
    await pool.request()
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
};

module.exports = {
  getPedidosPendientes,
  marcarPedidoCompletado
};