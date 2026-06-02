const express = require('express');

module.exports = function createasignarAlbaranesRouter({ sql, getPool }) {
  const router = express.Router();

router.post('/asignarAlbaranExistente', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroAlbaran, codigoRepartidor } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroAlbaran || !codigoRepartidor) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos requeridos.' });
  }

  try {
    // Verificar permisos: admin, advanced, o StatusVerAlbaranesAsignados
    const permisoResult = await getPool().request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador, StatusUsuarioAvanzado,
               StatusDesignarRutas, StatusVerAlbaranesAsignados
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario AND CodigoEmpresa = @codigoEmpresa
      `);

    if (permisoResult.recordset.length === 0) {
      return res.status(403).json({ success: false, mensaje: 'Usuario no encontrado' });
    }

    const u = permisoResult.recordset[0];
    const puedeAsignar =
      u.StatusAdministrador       === -1 ||
      u.StatusUsuarioAvanzado     === -1 ||
      u.StatusVerAlbaranesAsignados === -1;

    if (!puedeAsignar) {
      return res.status(403).json({ success: false, mensaje: 'No tienes permiso para asignar repartos' });
    }

    // Verificar que el albarán existe y no está completado
    const albaranCheck = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .query(`
        SELECT StatusFacturado
        FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    if (albaranCheck.recordset.length === 0) {
      return res.status(404).json({ success: false, mensaje: 'Albarán no encontrado' });
    }

    if (albaranCheck.recordset[0].StatusFacturado !== 0) {
      return res.status(400).json({ success: false, mensaje: 'No se puede asignar un albarán ya completado' });
    }

    // Asignar repartidor
    await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('empleadoAsignado', sql.VarChar, codigoRepartidor)
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET EmpleadoAsignado = @empleadoAsignado
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    res.json({ success: true, mensaje: 'Albarán asignado correctamente al repartidor' });
  } catch (err) {
    console.error('[ERROR ASIGNAR ALBARÁN EXISTENTE]', err);
    res.status(500).json({ success: false, mensaje: 'Error al asignar albarán', error: err.message });
  }
});

// Albaranes para asignación (StatusFacturado=0, FormaEnvio=3)
router.get('/albaranes-asignacion', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const codigoEmpresa = req.user.CodigoEmpresa;
  const usuario = req.user.UsuarioLogicNet;

  try {
    const permisoResult = await getPool().request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador, StatusUsuarioAvanzado,
               StatusDesignarRutas, StatusVerAlbaranesAsignados
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario AND CodigoEmpresa = @codigoEmpresa
      `);

    if (permisoResult.recordset.length === 0) {
      return res.status(403).json({ success: false, mensaje: 'Usuario no encontrado' });
    }

    const u = permisoResult.recordset[0];
    // Admin/Advanced/StatusVerAlbaranesAsignados → ven TODOS los albaranes
    const puedeVerTodos =
      u.StatusAdministrador         === -1 ||
      u.StatusUsuarioAvanzado       === -1 ||
      u.StatusVerAlbaranesAsignados === -1;

    // StatusDesignarRutas sin lo anterior → solo ve los suyos
    const puedeVerPantalla = puedeVerTodos || u.StatusDesignarRutas === -1;

    if (!puedeVerPantalla) {
      return res.status(403).json({ success: false, mensaje: 'No tienes permiso para ver esta pantalla' });
    }

    const usuarioCondition = puedeVerTodos ? '' : `AND cac.EmpleadoAsignado = '${usuario}'`;

    const query = `
      SELECT
        cac.NumeroAlbaran,
        cac.SerieAlbaran,
        cac.EjercicioAlbaran,
        cac.CodigoEmpresa,
        cac.FechaAlbaran,
        cac.CodigoCliente,
        cac.RazonSocial,
        cac.Municipio,
        cac.ImporteLiquido,
        cac.StatusFacturado,
        cac.EmpleadoAsignado AS repartidorAsignado,
        cac.NombreObra,
        cac.Contacto,
        cac.Telefono AS TelefonoContacto,
        cpc.NumeroPedido,
        cpc.Estado AS EstadoPedido,
        cpc.Status AS StatusPedido,
        cpc.EsVoluminoso AS EsVoluminosoPedido
      FROM CabeceraAlbaranCliente cac
      LEFT JOIN CabeceraPedidoCliente cpc
        ON cac.CodigoEmpresa = cpc.CodigoEmpresa
        AND cac.EjercicioPedido = cpc.EjercicioPedido
        AND cac.SeriePedido = cpc.SeriePedido
        AND cac.NumeroPedido = cpc.NumeroPedido
      WHERE cac.CodigoEmpresa = @codigoEmpresa
        AND cac.StatusFacturado = 0
        AND cac.FormaEnvio = 3
        AND cac.FechaAlbaran >= DATEADD(DAY, -30, GETDATE())
        ${usuarioCondition}
      ORDER BY cac.FechaAlbaran DESC
    `;

    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(query);

    const albaranesFormateados = await Promise.all(result.recordset.map(async (albaran) => {
      const lineasResult = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, albaran.CodigoEmpresa)
        .input('ejercicio', sql.SmallInt, albaran.EjercicioAlbaran)
        .input('serie', sql.VarChar, albaran.SerieAlbaran || '')
        .input('numeroAlbaran', sql.Int, albaran.NumeroAlbaran)
        .query(`
          SELECT
            lac.Orden AS orden,
            lac.CodigoArticulo AS codigo,
            lac.DescripcionArticulo AS nombre,
            lac.Unidades AS cantidad,
            CAST(lac.Unidades * ISNULL(a.PesoBrutoUnitario_, 0) AS DECIMAL(18,4)) AS pesoTotal
          FROM LineasAlbaranCliente lac
          LEFT JOIN Articulos a
            ON a.CodigoEmpresa = lac.CodigoEmpresa
            AND a.CodigoArticulo = lac.CodigoArticulo
          WHERE lac.CodigoEmpresa = @codigoEmpresa
            AND lac.EjercicioAlbaran = @ejercicio
            AND (lac.SerieAlbaran = @serie OR (@serie = '' AND lac.SerieAlbaran IS NULL))
            AND lac.NumeroAlbaran = @numeroAlbaran
          ORDER BY lac.Orden ASC
        `);

      return {
        ...albaran,
        albaran: `${albaran.SerieAlbaran || ''}${albaran.SerieAlbaran ? '-' : ''}${albaran.NumeroAlbaran}`,
        obra: albaran.NombreObra,
        esParcial: albaran.EstadoPedido === 4,
        Status: albaran.StatusPedido || 'Pendiente',
        articulos: lineasResult.recordset
      };
    }));

    res.json(albaranesFormateados);
  } catch (err) {
    console.error('[ERROR ALBARANES ASIGNACION]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener albaranes', error: err.message });
  }
});

// Repartidores disponibles
router.get('/repartidores', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT UsuarioLogicNet AS id, Nombre AS nombre
        FROM Clientes
        WHERE (StatusDesignarRutas = -1 OR StatusVerAlbaranesAsignados = -1)
          AND CodigoEmpresa = @codigoEmpresa
          AND UsuarioLogicNet IS NOT NULL
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR OBTENER REPARTIDORES]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener repartidores', error: err.message });
  }
});

// Revertir estado de albarán (solo admin/advanced)
router.post('/revertir-albaran', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroAlbaran } = req.body;

  try {
    const permisoResult = await getPool().request()
      .input('usuario', sql.VarChar, req.user.UsuarioLogicNet)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador, StatusUsuarioAvanzado
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario AND CodigoEmpresa = @codigoEmpresa
      `);

    if (permisoResult.recordset.length === 0) {
      return res.status(403).json({ success: false, mensaje: 'Usuario no encontrado' });
    }

    const u = permisoResult.recordset[0];
    if (u.StatusAdministrador !== -1 && u.StatusUsuarioAvanzado !== -1) {
      return res.status(403).json({ success: false, mensaje: 'Requiere permisos de administrador o usuario avanzado' });
    }

    await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET StatusFacturado = 0
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    res.json({ success: true, mensaje: 'Estado revertido correctamente' });
  } catch (err) {
    console.error('[ERROR REVERTIR ALBARÁN]', err);
    res.status(500).json({ success: false, mensaje: 'Error al revertir albarán', error: err.message });
  }
});

// Albaranes completados (últimos 7 días, FormaEnvio=3)
router.get('/albaranes-completados', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT
          CONCAT(cac.EjercicioAlbaran, '-', cac.SerieAlbaran, '-', cac.NumeroAlbaran) AS id,
          cac.NumeroAlbaran,
          cac.SerieAlbaran,
          cac.EjercicioAlbaran,
          cac.CodigoEmpresa,
          cac.FechaAlbaran,
          cac.RazonSocial,
          cac.NombreObra,
          cac.StatusFacturado,
          cpc.FormaEnvio
        FROM CabeceraAlbaranCliente cac
        INNER JOIN CabeceraPedidoCliente cpc
          ON cac.CodigoEmpresa = cpc.CodigoEmpresa
          AND cac.EjercicioPedido = cpc.EjercicioPedido
          AND cac.SeriePedido = cpc.SeriePedido
          AND cac.NumeroPedido = cpc.NumeroPedido
        WHERE cac.CodigoEmpresa = @codigoEmpresa
          AND cac.StatusFacturado = -1
          AND cac.FechaAlbaran >= DATEADD(DAY, -7, GETDATE())
          AND cpc.FormaEnvio = 3
        ORDER BY cac.FechaAlbaran DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ALBARANES COMPLETADOS]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener albaranes completados', error: err.message });
  }
});

  return router;
};