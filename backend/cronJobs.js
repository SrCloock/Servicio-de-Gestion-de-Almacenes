const cron = require('node-cron');

cron.schedule('0 0 * * *', async () => {
  console.log('🕛 Generando albaranes automáticos...');

  const pedidos = await poolGlobal.request().query(`
    SELECT *
    FROM CabeceraPedidoCliente
    WHERE Estado = 1 AND Transportista IS NOT NULL
  `);

  for (const pedido of pedidos.recordset) {
    // Reutiliza el endpoint ya creado
    await fetch('http://localhost:3000/generarAlbaranDesdePedido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigoEmpresa: pedido.CodigoEmpresa,
        ejercicio: pedido.EjercicioPedido,
        serie: pedido.SeriePedido,
        numeroPedido: pedido.NumeroPedido
      })
    });
  }

  console.log('✅ Albaranes generados.');
});
