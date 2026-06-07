const express = require('express');
const cron = require('node-cron');

module.exports = function createinventarioRouter({ sql, getPool }) {
  const router = express.Router();

  async function verificarPermiso(usuario, codigoEmpresa) {
    const result = await getPool().request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador, StatusUsuarioAvanzado, StatusVerInventarios
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario AND CodigoEmpresa = @codigoEmpresa
      `);
    if (result.recordset.length === 0) return false;
    const u = result.recordset[0];
    return u.StatusAdministrador === -1 || u.StatusUsuarioAvanzado === -1 || u.StatusVerInventarios === -1;
  }

  function getRequest(transaction = null) {
    return transaction ? new sql.Request(transaction) : getPool().request();
  }

  async function obtenerContextoBaseInventario(codigoEmpresa, transaction = null) {
    const ejercicioActual = new Date().getFullYear();
    const result = await getRequest(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        WITH Contextos AS (
          SELECT Ejercicio,
            COUNT(*) AS TotalRegistros,
            COUNT(DISTINCT CodigoArticulo) AS TotalArticulos,
            SUM(ABS(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0))) AS MagnitudStock
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND Periodo = 99
            AND (COALESCE(UnidadSaldoTipo_, 0) <> 0 OR COALESCE(UnidadSaldo, 0) <> 0)
          GROUP BY Ejercicio
        ),
        FallbackStock AS (
          SELECT TOP 1 Ejercicio
          FROM AcumuladoStock
          WHERE CodigoEmpresa = @codigoEmpresa AND Periodo = 99
          ORDER BY Ejercicio DESC
        )
        SELECT TOP 1
          COALESCE(c.Ejercicio, f.Ejercicio) AS Ejercicio
        FROM (SELECT NULL AS dummy) x
        LEFT JOIN Contextos c ON 1=1
        LEFT JOIN FallbackStock f ON 1=1
        ORDER BY
          CASE WHEN c.Ejercicio IS NOT NULL THEN 0 ELSE 1 END,
          c.TotalArticulos DESC,
          c.TotalRegistros DESC,
          c.MagnitudStock DESC,
          c.Ejercicio DESC
      `);
    const ejercicioBase = result.recordset[0]?.Ejercicio || ejercicioActual;
    return { ejercicioBase, periodoBase: 99, ejercicioActual };
  }

  function agregarContextoInventario(request, contexto) {
    return request
      .input('ejercicioBase', sql.SmallInt, contexto.ejercicioBase)
      .input('periodoBase', sql.SmallInt, contexto.periodoBase)
      .input('ejercicioActual', sql.SmallInt, contexto.ejercicioActual);
  }

  // Función unificada — sustituye getCteInventarioActual() y getCteInventarioActualFiltrado()
  // codigoParamsSql: string con placeholders separados por coma, p.ej. "@cod0, @cod1"  (null = sin filtro)
  function getCteInventarioActual(codigoParamsSql = null) {
    const filtroCodigos = codigoParamsSql
      ? `AND LTRIM(RTRIM(s.CodigoArticulo)) IN (${codigoParamsSql})`
      : '';
    return `
      WITH StockUbicacionVersionado AS (
        SELECT s.*,
          ROW_NUMBER() OVER (
            PARTITION BY s.CodigoEmpresa, s.CodigoAlmacen, s.Ubicacion, s.CodigoArticulo,
              ISNULL(s.TipoUnidadMedida_,''), ISNULL(s.Partida,''),
              ISNULL(s.CodigoColor_,''), ISNULL(s.CodigoTalla01_,'')
            ORDER BY CASE WHEN s.Ejercicio = @ejercicioActual THEN 0 ELSE 1 END, s.Ejercicio DESC
          ) AS rn
        FROM AcumuladoStockUbicacion s
        INNER JOIN Ubicaciones uv
          ON uv.CodigoEmpresa = s.CodigoEmpresa
          AND uv.CodigoAlmacen = s.CodigoAlmacen
          AND uv.Ubicacion = s.Ubicacion
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.Periodo = 99
          AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
          ${filtroCodigos}
          AND (
            COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) <> 0
            OR EXISTS (
              SELECT 1 FROM AcumuladoStock acs
              WHERE acs.CodigoEmpresa = s.CodigoEmpresa
                AND acs.CodigoArticulo = s.CodigoArticulo
                AND acs.CodigoAlmacen = s.CodigoAlmacen
                AND acs.Ubicacion = s.Ubicacion
                AND acs.Periodo = 99
                AND acs.Ejercicio IN (@ejercicioBase, @ejercicioActual)
            )
          )
      ),
      StockUbicacionActual AS (
        SELECT * FROM StockUbicacionVersionado WHERE rn = 1
      ),
      AcumuladoStockVersionado AS (
        SELECT s.*,
          ROW_NUMBER() OVER (
            PARTITION BY s.CodigoEmpresa, s.CodigoAlmacen, s.CodigoArticulo,
              ISNULL(s.TipoUnidadMedida_,''), ISNULL(s.Partida,''),
              ISNULL(s.CodigoColor_,''), ISNULL(s.CodigoTalla01_,'')
            ORDER BY CASE WHEN s.Ejercicio = @ejercicioActual THEN 0 ELSE 1 END, s.Ejercicio DESC
          ) AS rn
        FROM AcumuladoStock s
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.Periodo = 99
          AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
          ${filtroCodigos}
      ),
      AcumuladoStockActual AS (
        SELECT * FROM AcumuladoStockVersionado WHERE rn = 1
      )
    `;
  }

  function getArticuloApply(stockAlias = 's') {
    return `
      OUTER APPLY (
        SELECT TOP 1 a.*
        FROM Articulos a
        WHERE a.CodigoEmpresa = ${stockAlias}.CodigoEmpresa
          AND (
            LTRIM(RTRIM(a.CodigoArticulo)) = LTRIM(RTRIM(${stockAlias}.CodigoArticulo))
            OR LTRIM(RTRIM(ISNULL(a.CodigoAlternativo, ''))) = LTRIM(RTRIM(${stockAlias}.CodigoArticulo))
            OR LTRIM(RTRIM(ISNULL(a.CodigoAlternativo2, ''))) = LTRIM(RTRIM(${stockAlias}.CodigoArticulo))
            OR LTRIM(RTRIM(ISNULL(a.CodigoArticuloOferta, ''))) = LTRIM(RTRIM(${stockAlias}.CodigoArticulo))
            OR LTRIM(RTRIM(ISNULL(a.ReferenciaEdi_, ''))) = LTRIM(RTRIM(${stockAlias}.CodigoArticulo))
            OR (
              TRY_CONVERT(BIGINT, ${stockAlias}.CodigoArticulo) IS NOT NULL
              AND (
                TRY_CONVERT(BIGINT, a.CodigoArticulo) = TRY_CONVERT(BIGINT, ${stockAlias}.CodigoArticulo)
                OR TRY_CONVERT(BIGINT, a.CodigoAlternativo) = TRY_CONVERT(BIGINT, ${stockAlias}.CodigoArticulo)
                OR TRY_CONVERT(BIGINT, a.CodigoAlternativo2) = TRY_CONVERT(BIGINT, ${stockAlias}.CodigoArticulo)
                OR TRY_CONVERT(BIGINT, a.CodigoArticuloOferta) = TRY_CONVERT(BIGINT, ${stockAlias}.CodigoArticulo)
                OR TRY_CONVERT(BIGINT, a.ReferenciaEdi_) = TRY_CONVERT(BIGINT, ${stockAlias}.CodigoArticulo)
              )
            )
          )
        ORDER BY
          CASE
            WHEN LTRIM(RTRIM(a.CodigoArticulo)) = LTRIM(RTRIM(${stockAlias}.CodigoArticulo)) THEN 0
            WHEN TRY_CONVERT(BIGINT, a.CodigoArticulo) = TRY_CONVERT(BIGINT, ${stockAlias}.CodigoArticulo) THEN 1
            WHEN LTRIM(RTRIM(ISNULL(a.CodigoAlternativo, ''))) = LTRIM(RTRIM(${stockAlias}.CodigoArticulo)) THEN 2
            WHEN LTRIM(RTRIM(ISNULL(a.CodigoAlternativo2, ''))) = LTRIM(RTRIM(${stockAlias}.CodigoArticulo)) THEN 3
            WHEN LTRIM(RTRIM(ISNULL(a.CodigoArticuloOferta, ''))) = LTRIM(RTRIM(${stockAlias}.CodigoArticulo)) THEN 4
            WHEN LTRIM(RTRIM(ISNULL(a.ReferenciaEdi_, ''))) = LTRIM(RTRIM(${stockAlias}.CodigoArticulo)) THEN 5
            ELSE 6
          END, a.CodigoArticulo
      ) a
    `;
  }

  async function limpiarRegistrosCeroNoPrincipales(codigoEmpresa) {
    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        DELETE asu
        FROM AcumuladoStockUbicacion asu
        INNER JOIN Ubicaciones uv
          ON uv.CodigoEmpresa = asu.CodigoEmpresa
          AND uv.CodigoAlmacen = asu.CodigoAlmacen
          AND uv.Ubicacion = asu.Ubicacion
        WHERE asu.CodigoEmpresa = @codigoEmpresa
          AND asu.Periodo = 99
          AND COALESCE(asu.UnidadSaldoTipo_, asu.UnidadSaldo, 0) = 0
          AND NOT EXISTS (
            SELECT 1 FROM AcumuladoStock acs
            WHERE acs.CodigoEmpresa = asu.CodigoEmpresa
              AND acs.CodigoArticulo = asu.CodigoArticulo
              AND acs.CodigoAlmacen = asu.CodigoAlmacen
              AND acs.Ubicacion = asu.Ubicacion
              AND acs.Periodo = 99
          )
      `);
    const borrados = result.rowsAffected?.[0] || 0;
    console.log(`[LIMPIEZA CEROS] Empresa ${codigoEmpresa}: ${borrados} registros eliminados`);
    return borrados;
  }

  async function sincronizacionAutomatica() {
    try {
      if (!getPool() || !getPool().connected) return;
      const empresasResult = await getPool().request()
        .query(`
          SELECT DISTINCT CodigoEmpresa FROM Empresas
          WHERE CodigoEmpresa IN (
            SELECT CodigoEmpresa FROM lsysEmpresaAplicacion WHERE CodigoAplicacion = 'CON'
          ) AND CodigoEmpresa <= 10000
        `);
      let totalBorrados = 0;
      for (const empresa of empresasResult.recordset) {
        try {
          const borrados = await limpiarRegistrosCeroNoPrincipales(empresa.CodigoEmpresa);
          totalBorrados += borrados;
        } catch (error) {
          console.error(`[SYNC AUTO] Error empresa ${empresa.CodigoEmpresa}:`, error.message);
        }
      }
      console.log(`[SYNC AUTO] Completado: ${totalBorrados} registros eliminados`);
    } catch (error) {
      console.error('[SYNC AUTO] Error general:', error);
    }
  }

  function iniciarSincronizacionAutomatica() {
    setTimeout(() => sincronizacionAutomatica(), 5000);
    cron.schedule('0 */3 * * *', () => sincronizacionAutomatica());
    console.log('[SYNC AUTO] Limpieza inicial en 5s + cada 3 horas');
  }

  router.post('/inventario/sincronizacion-automatica', async (req, res) => {
    if (!req.user || !req.user.CodigoEmpresa)
      return res.status(401).json({ success: false, mensaje: 'No autorizado' });
    const usuarioCheckS = req.user.UsuarioLogicNet || req.user.CodigoUsuario;
    if (!(await verificarPermiso(usuarioCheckS, req.user.CodigoEmpresa)))
      return res.status(403).json({ success: false, mensaje: 'No tienes permiso.' });
    try {
      await sincronizacionAutomatica();
      res.json({ success: true, mensaje: 'Limpieza ejecutada manualmente' });
    } catch (error) {
      res.status(500).json({ success: false, mensaje: 'Error en limpieza manual', error: error.message });
    }
  });

  // Para SIN-UBICACION con múltiples filas en distintos ejercicios:
  // pone todas las filas a 0 y deja solo una con el valor correcto en el ejercicio actual
  async function consolidarAcumuladoStockSinUbicacion(
    codigoEmpresa, ejercicio, articulo, codigoAlmacen,
    unidadStock, partida, codigoColor, codigoTalla01,
    nuevaCantidad, transaction
  ) {
    const unidadNorm = (unidadStock === 'unidades' ? '' : unidadStock || '');

    // Poner todas las filas a 0
    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('tipoUnidad', sql.VarChar, unidadNorm)
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
      .query(`
        UPDATE AcumuladoStock
        SET UnidadSaldo = 0, UnidadSaldoTipo_ = 0
        WHERE CodigoEmpresa=@codigoEmpresa
          AND CodigoArticulo=@codigoArticulo
          AND CodigoAlmacen=@codigoAlmacen
          AND Periodo=99
          AND ISNULL(TipoUnidadMedida_,'')=@tipoUnidad
          AND ISNULL(Partida,'')=@partida
          AND ISNULL(CodigoColor_,'')=@codigoColor
          AND ISNULL(CodigoTalla01_,'')=@codigoTalla
      `);

    // Si la nueva cantidad es distinta de 0, actualizar la fila del ejercicio más reciente
    if (Math.abs(nuevaCantidad) > 0.001) {
      // Primero buscar el IdAcumuladoStock de la fila preferida (ejercicio actual o más reciente)
      const filaPreferida = await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.Int, ejercicio)
        .input('codigoArticulo', sql.VarChar, articulo)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('tipoUnidad', sql.VarChar, unidadNorm)
        .input('partida', sql.VarChar, partida || '')
        .input('codigoColor', sql.VarChar, codigoColor || '')
        .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
        .query(`
          SELECT TOP 1 IdAcumuladoStock
          FROM AcumuladoStock
          WHERE CodigoEmpresa=@codigoEmpresa
            AND CodigoAlmacen=@codigoAlmacen
            AND CodigoArticulo=@codigoArticulo
            AND Periodo=99
            AND ISNULL(TipoUnidadMedida_,'')=@tipoUnidad
            AND ISNULL(Partida,'')=@partida
            AND ISNULL(CodigoColor_,'')=@codigoColor
            AND ISNULL(CodigoTalla01_,'')=@codigoTalla
          ORDER BY CASE WHEN Ejercicio=@ejercicio THEN 0 ELSE 1 END, Ejercicio DESC
        `);

      const idFila = filaPreferida.recordset[0]?.IdAcumuladoStock;
      let updated = { rowsAffected: [0] };
      if (idFila !== undefined && idFila !== null) {
        updated = await new sql.Request(transaction)
          .input('idFila', sql.UniqueIdentifier, idFila)
          .input('valor', sql.Decimal(18, 4), nuevaCantidad)
          .query(`
            UPDATE AcumuladoStock
            SET UnidadSaldo=@valor, UnidadSaldoTipo_=@valor
            WHERE IdAcumuladoStock=@idFila
          `);
      }

      // Si no había ninguna fila (raro), insertar
      if ((updated.rowsAffected?.[0] || 0) === 0) {
        await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.Int, ejercicio)
          .input('codigoArticulo', sql.VarChar, articulo)
          .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
          .input('tipoUnidad', sql.VarChar, unidadNorm)
          .input('partida', sql.VarChar, partida || '')
          .input('codigoColor', sql.VarChar, codigoColor || '')
          .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
          .input('valor', sql.Decimal(18, 4), nuevaCantidad)
          .query(`
            INSERT INTO AcumuladoStock (
              CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
              CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
              UnidadSaldo, UnidadSaldoTipo_, Periodo
            ) VALUES (
              @codigoEmpresa, @ejercicio, @codigoAlmacen, 'SIN-UBICACION',
              @codigoArticulo, @tipoUnidad, @partida, @codigoColor, @codigoTalla,
              @valor, @valor, 99
            )
          `);
      }
    }
  }

  async function aplicarDeltaEnAcumuladoStock(
    codigoEmpresa, ejercicio, articulo, codigoAlmacen,
    ubicacionPrincipal, unidadStock, partida, codigoColor, codigoTalla01,
    delta, transaction
  ) {
    const unidadNorm = (unidadStock === 'unidades' ? '' : unidadStock || '');

    const updateResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('tipoUnidad', sql.VarChar, unidadNorm)
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
      .input('delta', sql.Decimal(18, 4), delta)
      .query(`
        UPDATE AcumuladoStock
        SET UnidadSaldo = UnidadSaldo + @delta,
            UnidadSaldoTipo_ = UnidadSaldoTipo_ + @delta
        WHERE IdAcumuladoStock = (
          SELECT TOP 1 IdAcumuladoStock FROM AcumuladoStock
          WHERE CodigoEmpresa = @codigoEmpresa
            AND Ejercicio = @ejercicio
            AND CodigoArticulo = @codigoArticulo
            AND CodigoAlmacen = @codigoAlmacen
            AND Periodo = 99
            AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
            AND ISNULL(Partida, '') = @partida
            AND ISNULL(CodigoColor_, '') = @codigoColor
            AND ISNULL(CodigoTalla01_, '') = @codigoTalla
          ORDER BY Ejercicio DESC
        )
      `);

    const filasActualizadas = updateResult.rowsAffected?.[0] || 0;

    if (filasActualizadas === 0) {
      const updatePrevResult = await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, articulo)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('tipoUnidad', sql.VarChar, unidadNorm)
        .input('partida', sql.VarChar, partida || '')
        .input('codigoColor', sql.VarChar, codigoColor || '')
        .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
        .input('delta', sql.Decimal(18, 4), delta)
        .query(`
          UPDATE AcumuladoStock
          SET UnidadSaldo = UnidadSaldo + @delta,
              UnidadSaldoTipo_ = UnidadSaldoTipo_ + @delta
          WHERE IdAcumuladoStock = (
            SELECT TOP 1 IdAcumuladoStock FROM AcumuladoStock
            WHERE CodigoEmpresa = @codigoEmpresa
              AND CodigoArticulo = @codigoArticulo
              AND CodigoAlmacen = @codigoAlmacen
              AND Periodo = 99
              AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
              AND ISNULL(Partida, '') = @partida
              AND ISNULL(CodigoColor_, '') = @codigoColor
              AND ISNULL(CodigoTalla01_, '') = @codigoTalla
            ORDER BY Ejercicio DESC
          )
        `);

      const filasPrev = updatePrevResult.rowsAffected?.[0] || 0;

      if (filasPrev === 0) {
        await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.Int, ejercicio)
          .input('codigoArticulo', sql.VarChar, articulo)
          .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
          .input('ubicacion', sql.VarChar, ubicacionPrincipal || 'SIN-UBICACION')
          .input('tipoUnidad', sql.VarChar, unidadNorm)
          .input('partida', sql.VarChar, partida || '')
          .input('codigoColor', sql.VarChar, codigoColor || '')
          .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
          .input('valor', sql.Decimal(18, 4), delta)
          .query(`
            INSERT INTO AcumuladoStock (
              CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
              CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
              UnidadSaldo, UnidadSaldoTipo_, Periodo
            ) VALUES (
              @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
              @codigoArticulo, @tipoUnidad, @partida, @codigoColor, @codigoTalla,
              @valor, @valor, 99
            )
          `);
      }
    }
  }

  async function obtenerUbicacionPrincipal(codigoEmpresa, ejercicio, articulo, codigoAlmacen, transaction) {
    const result = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .query(`
        SELECT TOP 1 Ubicacion FROM AcumuladoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoArticulo = @codigoArticulo
          AND CodigoAlmacen = @codigoAlmacen
          AND Periodo = 99
        ORDER BY Ejercicio DESC
      `);
    return result.recordset[0]?.Ubicacion || 'SIN-UBICACION';
  }

  async function obtenerStockTotalLote(req, res) {
    if (!req.user || !req.user.CodigoEmpresa)
      return res.status(401).json({ success: false, mensaje: 'No autorizado' });

    const codigoEmpresa = req.user.CodigoEmpresa;
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const codigo = String(req.query.codigo || req.query.search || '').trim();
    const almacen = String(req.query.almacen || '').trim();
    const ubicacion = String(req.query.ubicacion || '').trim();
    const familia = String(req.query.familia || '').trim();
    const subfamilia = String(req.query.subfamilia || '').trim();

    try {
      const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
      const codigoLike = `%${codigo}%`;
      const familiaLike = `%${familia}%`;
      const subfamiliaLike = `%${subfamilia}%`;
      const almacenLike = `%${almacen}%`;
      const ubicacionLike = `%${ubicacion}%`;

      let queryCodigos = `
        SELECT a.CodigoArticulo,
          ROW_NUMBER() OVER (ORDER BY a.CodigoArticulo) AS RowNum
        FROM Articulos a
        WHERE a.CodigoEmpresa = @codigoEmpresa
          AND (@codigo = '' OR (
            a.CodigoArticulo LIKE @codigoLike
            OR a.DescripcionArticulo LIKE @codigoLike
            OR ISNULL(a.Descripcion2Articulo, '') LIKE @codigoLike
          ))
          AND (@familia = '' OR ISNULL(a.CodigoFamilia, '') LIKE @familiaLike)
          AND (@subfamilia = '' OR ISNULL(a.CodigoSubfamilia, '') LIKE @subfamiliaLike)
      `;

      if (almacen || ubicacion) {
        queryCodigos += `
          AND EXISTS (
            SELECT 1 FROM AcumuladoStockUbicacion s
            INNER JOIN Ubicaciones uv
              ON uv.CodigoEmpresa = s.CodigoEmpresa
              AND uv.CodigoAlmacen = s.CodigoAlmacen
              AND uv.Ubicacion = s.Ubicacion
            LEFT JOIN Almacenes alm
              ON alm.CodigoEmpresa = s.CodigoEmpresa AND alm.CodigoAlmacen = s.CodigoAlmacen
            LEFT JOIN Ubicaciones u
              ON u.CodigoEmpresa = s.CodigoEmpresa AND u.CodigoAlmacen = s.CodigoAlmacen AND u.Ubicacion = s.Ubicacion
            WHERE s.CodigoEmpresa = a.CodigoEmpresa
              AND s.Periodo = 99
              AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
              AND LTRIM(RTRIM(s.CodigoArticulo)) = LTRIM(RTRIM(a.CodigoArticulo))
              AND (@almacen = '' OR (ISNULL(s.CodigoAlmacen,'') LIKE @almacenLike OR ISNULL(alm.Almacen,'') LIKE @almacenLike))
              AND (@ubicacion = '' OR (ISNULL(s.Ubicacion,'') LIKE @ubicacionLike OR ISNULL(u.DescripcionUbicacion,'') LIKE @ubicacionLike))
          )
        `;
      }

      queryCodigos = `
        WITH ArticulosFiltrados AS (${queryCodigos})
        SELECT CodigoArticulo, RowNum FROM ArticulosFiltrados
        WHERE RowNum > @offset AND RowNum <= (@offset + @limit + 1)
        ORDER BY RowNum
      `;

      const codigosResult = await agregarContextoInventario(
        getPool().request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('offset', sql.Int, offset)
          .input('limit', sql.Int, limit)
          .input('codigo', sql.NVarChar(200), codigo)
          .input('codigoLike', sql.NVarChar(210), codigoLike)
          .input('almacen', sql.NVarChar(200), almacen)
          .input('almacenLike', sql.NVarChar(210), almacenLike)
          .input('ubicacion', sql.NVarChar(200), ubicacion)
          .input('ubicacionLike', sql.NVarChar(210), ubicacionLike)
          .input('familia', sql.NVarChar(100), familia)
          .input('familiaLike', sql.NVarChar(110), familiaLike)
          .input('subfamilia', sql.NVarChar(100), subfamilia)
          .input('subfamiliaLike', sql.NVarChar(110), subfamiliaLike),
        contexto
      ).query(queryCodigos);

      const codigoRows = codigosResult.recordset || [];
      const hasMore = codigoRows.length > limit;
      const codigosPagina = codigoRows.slice(0, limit).map(row => String(row.CodigoArticulo || '').trim()).filter(Boolean);

      if (codigosPagina.length === 0)
        return res.json({ items: [], hasMore: false, nextOffset: null });

      const codigoInputs = codigosPagina.map((_, i) => `@codigoArticulo${i}`).join(', ');
      const detalleRequest = agregarContextoInventario(
        getPool().request().input('codigoEmpresa', sql.SmallInt, codigoEmpresa),
        contexto
      );
      codigosPagina.forEach((cod, i) => {
        detalleRequest.input(`codigoArticulo${i}`, sql.VarChar(50), cod);
      });
      detalleRequest
        .input('almacen', sql.NVarChar(200), almacen)
        .input('almacenLike', sql.NVarChar(210), almacenLike)
        .input('ubicacion', sql.NVarChar(200), ubicacion)
        .input('ubicacionLike', sql.NVarChar(210), ubicacionLike);

      const detalleQuery = `
        WITH StockUbicacionSumado AS (
          SELECT
            s.CodigoEmpresa, s.CodigoAlmacen, s.Ubicacion, s.CodigoArticulo,
            ISNULL(s.TipoUnidadMedida_,'') AS TipoUnidadMedida_,
            ISNULL(s.Partida,'') AS Partida,
            ISNULL(s.CodigoColor_,'') AS CodigoColor_,
            ISNULL(s.CodigoTalla01_,'') AS CodigoTalla01_,
            SUM(CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18,4))) AS UnidadSaldoTotal,
            SUM(CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18,4))) AS UnidadSaldoTipoTotal,
            MAX(s.Ejercicio) AS Ejercicio
          FROM AcumuladoStockUbicacion s
          INNER JOIN Ubicaciones uv
            ON uv.CodigoEmpresa = s.CodigoEmpresa
            AND uv.CodigoAlmacen = s.CodigoAlmacen
            AND uv.Ubicacion = s.Ubicacion
          WHERE s.CodigoEmpresa = @codigoEmpresa
            AND s.Periodo = 99
            AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
            AND LTRIM(RTRIM(s.CodigoArticulo)) IN (${codigoInputs})
          GROUP BY
            s.CodigoEmpresa, s.CodigoAlmacen, s.Ubicacion, s.CodigoArticulo,
            ISNULL(s.TipoUnidadMedida_,''), ISNULL(s.Partida,''),
            ISNULL(s.CodigoColor_,''), ISNULL(s.CodigoTalla01_,'')
        ),
        StockUbicacionVersionado AS (
          SELECT s.*,
            ROW_NUMBER() OVER (
              PARTITION BY s.CodigoEmpresa, s.CodigoAlmacen, s.Ubicacion, s.CodigoArticulo,
                s.TipoUnidadMedida_, s.Partida, s.CodigoColor_, s.CodigoTalla01_
              ORDER BY CASE WHEN s.Ejercicio = @ejercicioActual THEN 0 ELSE 1 END, s.Ejercicio DESC
            ) AS rn
          FROM StockUbicacionSumado s
        ),
        StockUbicacionActual AS (
          SELECT * FROM StockUbicacionVersionado
          WHERE rn = 1
            AND (
              UnidadSaldoTipoTotal <> 0
              OR EXISTS (
                SELECT 1 FROM AcumuladoStock acs
                WHERE acs.CodigoEmpresa = CodigoEmpresa
                  AND acs.CodigoArticulo = CodigoArticulo
                  AND acs.CodigoAlmacen = CodigoAlmacen
                  AND acs.Ubicacion = Ubicacion
                  AND acs.Periodo = 99
                  AND acs.Ejercicio IN (@ejercicioBase, @ejercicioActual)
              )
            )
        ),
        AcumuladoStockSumado AS (
          SELECT
            s.CodigoEmpresa, s.CodigoAlmacen, s.CodigoArticulo,
            ISNULL(s.TipoUnidadMedida_,'') AS TipoUnidadMedida_,
            ISNULL(s.Partida,'') AS Partida,
            ISNULL(s.CodigoColor_,'') AS CodigoColor_,
            ISNULL(s.CodigoTalla01_,'') AS CodigoTalla01_,
            SUM(CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18,4))) AS UnidadSaldoTotal,
            SUM(CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18,4))) AS UnidadSaldoTipoTotal,
            MAX(s.Ejercicio) AS Ejercicio
          FROM AcumuladoStock s
          WHERE s.CodigoEmpresa = @codigoEmpresa
            AND s.Periodo = 99
            AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
            AND LTRIM(RTRIM(s.CodigoArticulo)) IN (${codigoInputs})
          GROUP BY
            s.CodigoEmpresa, s.CodigoAlmacen, s.CodigoArticulo,
            ISNULL(s.TipoUnidadMedida_,''), ISNULL(s.Partida,''),
            ISNULL(s.CodigoColor_,''), ISNULL(s.CodigoTalla01_,'')
        ),
        AcumuladoStockVersionado AS (
          SELECT s.*,
            ROW_NUMBER() OVER (
              PARTITION BY s.CodigoEmpresa, s.CodigoAlmacen, s.CodigoArticulo,
                s.TipoUnidadMedida_, s.Partida, s.CodigoColor_, s.CodigoTalla01_
              ORDER BY CASE WHEN s.Ejercicio = @ejercicioActual THEN 0 ELSE 1 END, s.Ejercicio DESC
            ) AS rn
          FROM AcumuladoStockSumado s
        ),
        AcumuladoStockActual AS (
          SELECT * FROM AcumuladoStockVersionado WHERE rn = 1
        ),
        AlmacenPlaceholder AS (
          SELECT TOP 1 CodigoAlmacen, Almacen AS NombreAlmacen FROM Almacenes
          WHERE CodigoEmpresa = @codigoEmpresa
          ORDER BY CASE WHEN CodigoAlmacen = 'CEN' THEN 0 ELSE 1 END, CodigoAlmacen
        ),
        ArticulosSinUbicacion AS (
          SELECT
            a.CodigoEmpresa, a.CodigoArticulo, a.DescripcionArticulo,
            a.Descripcion2Articulo, a.UnidadMedida2_, a.UnidadMedidaAlternativa_,
            a.FactorConversion_, a.CodigoFamilia, a.CodigoSubfamilia,
            ast.CodigoAlmacen,
            ISNULL(ast.TipoUnidadMedida_,'') AS TipoUnidadMedida_,
            ISNULL(ast.Partida,'') AS Partida,
            ISNULL(ast.CodigoColor_,'') AS CodigoColor_,
            ISNULL(ast.CodigoTalla01_,'') AS CodigoTalla01_,
            SUM(CAST(COALESCE(ast.UnidadSaldoTipo_, ast.UnidadSaldo, 0) AS DECIMAL(18,4))) AS StockTotal,
            MAX(ast.Ejercicio) AS Ejercicio
          FROM Articulos a
          INNER JOIN AcumuladoStock ast
            ON ast.CodigoEmpresa = a.CodigoEmpresa
            AND LTRIM(RTRIM(ast.CodigoArticulo)) = LTRIM(RTRIM(a.CodigoArticulo))
            AND ast.Periodo = 99
            AND ast.Ejercicio IN (@ejercicioBase, @ejercicioActual)
          WHERE a.CodigoEmpresa = @codigoEmpresa
            AND LTRIM(RTRIM(a.CodigoArticulo)) IN (${codigoInputs})
            AND NOT EXISTS (
              SELECT 1 FROM StockUbicacionActual su
              WHERE su.CodigoEmpresa = a.CodigoEmpresa
                AND LTRIM(RTRIM(su.CodigoArticulo)) = LTRIM(RTRIM(a.CodigoArticulo))
                AND su.CodigoAlmacen = ast.CodigoAlmacen
            )
          GROUP BY
            a.CodigoEmpresa, a.CodigoArticulo, a.DescripcionArticulo,
            a.Descripcion2Articulo, a.UnidadMedida2_, a.UnidadMedidaAlternativa_,
            a.FactorConversion_, a.CodigoFamilia, a.CodigoSubfamilia,
            ast.CodigoAlmacen,
            ISNULL(ast.TipoUnidadMedida_,''), ISNULL(ast.Partida,''),
            ISNULL(ast.CodigoColor_,''), ISNULL(ast.CodigoTalla01_,'')
        ),
        ArticulosSinStock AS (
          SELECT a.CodigoEmpresa, a.CodigoArticulo, a.DescripcionArticulo,
            a.Descripcion2Articulo, a.UnidadMedida2_, a.UnidadMedidaAlternativa_,
            a.FactorConversion_, a.CodigoFamilia, a.CodigoSubfamilia
          FROM Articulos a
          WHERE a.CodigoEmpresa = @codigoEmpresa
            AND LTRIM(RTRIM(a.CodigoArticulo)) IN (${codigoInputs})
            AND NOT EXISTS (
              SELECT 1 FROM StockUbicacionActual su
              WHERE su.CodigoEmpresa = a.CodigoEmpresa
                AND LTRIM(RTRIM(su.CodigoArticulo)) = LTRIM(RTRIM(a.CodigoArticulo))
            )
            AND NOT EXISTS (
              SELECT 1 FROM AcumuladoStockActual ast
              WHERE ast.CodigoEmpresa = a.CodigoEmpresa
                AND LTRIM(RTRIM(ast.CodigoArticulo)) = LTRIM(RTRIM(a.CodigoArticulo))
            )
        )
        SELECT
          COALESCE(a.CodigoArticulo, s.CodigoArticulo) AS CodigoArticulo,
          s.CodigoArticulo AS CodigoArticuloStock,
          COALESCE(a.DescripcionArticulo, s.CodigoArticulo) AS DescripcionArticulo,
          COALESCE(a.Descripcion2Articulo, '') AS Descripcion2Articulo,
          s.CodigoAlmacen, alm.Almacen AS NombreAlmacen,
          s.Ubicacion, u.DescripcionUbicacion,
          s.TipoUnidadMedida_ AS UnidadStock,
          s.UnidadSaldoTipoTotal AS CantidadBase,
          s.UnidadSaldoTipoTotal AS Cantidad,
          s.Partida, 99 AS Periodo,
          s.CodigoColor_, s.CodigoTalla01_,
          a.UnidadMedida2_ AS UnidadBase,
          a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          COALESCE(a.FactorConversion_, 1) AS FactorConversion,
          a.CodigoFamilia, a.CodigoSubfamilia, s.Ejercicio,
          CASE WHEN s.Ubicacion = 'SIN-UBICACION' OR s.Ubicacion IS NULL THEN 1 ELSE 0 END AS EsSinUbicacion,
          CONCAT(s.CodigoArticulo,'_',s.CodigoAlmacen,'_',s.Ubicacion,'_',s.TipoUnidadMedida_,'_',
            ISNULL(s.Partida,''),'_',ISNULL(s.CodigoColor_,''),'_',ISNULL(s.CodigoTalla01_,'')) AS ClaveUnica,
          NULL AS MovPosicionLinea,
          0 AS SinRegistrosAcumuladoStock
        FROM StockUbicacionActual s
        ${getArticuloApply('s')}
        LEFT JOIN Almacenes alm ON alm.CodigoEmpresa = s.CodigoEmpresa AND alm.CodigoAlmacen = s.CodigoAlmacen
        LEFT JOIN Ubicaciones u ON u.CodigoEmpresa = s.CodigoEmpresa AND u.CodigoAlmacen = s.CodigoAlmacen AND u.Ubicacion = s.Ubicacion
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND LTRIM(RTRIM(COALESCE(a.CodigoArticulo, s.CodigoArticulo))) IN (${codigoInputs})
          AND (@almacen = '' OR (ISNULL(s.CodigoAlmacen,'') LIKE @almacenLike OR ISNULL(alm.Almacen,'') LIKE @almacenLike))
          AND (@ubicacion = '' OR (ISNULL(s.Ubicacion,'') LIKE @ubicacionLike OR ISNULL(u.DescripcionUbicacion,'') LIKE @ubicacionLike))

        UNION ALL

        SELECT
          asu.CodigoArticulo, asu.CodigoArticulo,
          asu.DescripcionArticulo,
          COALESCE(asu.Descripcion2Articulo,''),
          asu.CodigoAlmacen, alm2.Almacen AS NombreAlmacen,
          'SIN-UBICACION', 'Stock sin ubicación asignada',
          NULLIF(asu.TipoUnidadMedida_,'') AS UnidadStock,
          CAST(asu.StockTotal AS DECIMAL(18,4)),
          CAST(asu.StockTotal AS DECIMAL(18,4)),
          asu.Partida, 99,
          asu.CodigoColor_, asu.CodigoTalla01_,
          asu.UnidadMedida2_, asu.UnidadMedidaAlternativa_,
          COALESCE(asu.FactorConversion_,1),
          asu.CodigoFamilia, asu.CodigoSubfamilia, asu.Ejercicio, 1,
          CONCAT(asu.CodigoArticulo,'_',asu.CodigoAlmacen,'_','SIN-UBICACION','_',
            ISNULL(NULLIF(asu.TipoUnidadMedida_,''),'unidades'),'_',
            asu.Partida,'_',asu.CodigoColor_,'_',asu.CodigoTalla01_) AS ClaveUnica,
          NULL, 1
        FROM ArticulosSinUbicacion asu
        LEFT JOIN Almacenes alm2 ON alm2.CodigoEmpresa = asu.CodigoEmpresa AND alm2.CodigoAlmacen = asu.CodigoAlmacen
        WHERE (@almacen = '' OR (ISNULL(asu.CodigoAlmacen,'') LIKE @almacenLike OR ISNULL(alm2.Almacen,'') LIKE @almacenLike))

        UNION ALL

        SELECT
          a.CodigoArticulo, a.CodigoArticulo,
          a.DescripcionArticulo, COALESCE(a.Descripcion2Articulo,''),
          ap.CodigoAlmacen, ap.NombreAlmacen,
          'SIN-UBICACION', 'Stock sin ubicacion asignada',
          '', CAST(0 AS DECIMAL(18,4)), CAST(0 AS DECIMAL(18,4)), '',
          99, '', '',
          a.UnidadMedida2_, a.UnidadMedidaAlternativa_,
          COALESCE(a.FactorConversion_,1), a.CodigoFamilia, a.CodigoSubfamilia,
          @ejercicioBase, 1,
          CONCAT(a.CodigoArticulo,'_',ap.CodigoAlmacen,'_','SIN-UBICACION','_','unidades','_','','_','','_','') AS ClaveUnica,
          NULL, 1
        FROM ArticulosSinStock a
        CROSS JOIN AlmacenPlaceholder ap
        ORDER BY CodigoArticulo, CodigoAlmacen, Ubicacion, UnidadStock
      `;

      const detalleResult = await detalleRequest.query(detalleQuery);
      const items = detalleResult.recordset || [];

      items.forEach(row => {
        const unidadStock = String(row.UnidadStock || '').trim();
        const unidadAlternativa = String(row.UnidadAlternativa || '').trim();
        const cantidad = Number(row.Cantidad || 0);
        const factorConversion = Number(row.FactorConversion || 1);
        if (unidadStock && unidadAlternativa && unidadStock === unidadAlternativa && factorConversion > 0) {
          row.CantidadBase = cantidad * factorConversion;
        } else {
          row.CantidadBase = Number(row.CantidadBase || cantidad || 0);
        }
      });

      return res.json({ items, hasMore, nextOffset: hasMore ? offset + codigosPagina.length : null });
    } catch (error) {
      console.error('[ERROR STOCK TOTAL LOTE]', error);
      return res.status(500).json({ success: false, mensaje: 'Error al obtener el lote de inventario', error: error.message });
    }
  }

  router.get('/inventario/stock-total-lote', obtenerStockTotalLote);
  router.get('/inventario/stock-total-completo', obtenerStockTotalLote);

  router.get('/buscar-articulos', async (req, res) => {
    const { termino } = req.query;
    const codigoEmpresa = req.user.CodigoEmpresa;
    try {
      if (!termino || termino.trim().length < 2) return res.json([]);
      const result = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('termino', sql.VarChar, `%${termino}%`)
        .query(`
          SELECT TOP 20 a.CodigoArticulo, a.DescripcionArticulo
          FROM Articulos a
          WHERE a.CodigoEmpresa = @codigoEmpresa
            AND (a.CodigoArticulo LIKE @termino OR a.DescripcionArticulo LIKE @termino)
          ORDER BY a.DescripcionArticulo
        `);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al buscar artículos.', error: err.message });
    }
  });

  router.get('/inventario/almacenes-ajuste', async (req, res) => {
    const codigoEmpresa = req.user.CodigoEmpresa;
    if (!codigoEmpresa) return res.status(400).json({ success: false, mensaje: 'Código de empresa requerido.' });
    try {
      const result = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          SELECT CodigoAlmacen, Almacen FROM Almacenes
          WHERE CodigoEmpresa = @codigoEmpresa
          ORDER BY CodigoAlmacen
        `);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener almacenes.', error: err.message });
    }
  });

  router.get('/stock/por-ubicacion', async (req, res) => {
    const { codigoAlmacen, ubicacion, page = 1, pageSize = 100 } = req.query;
    const codigoEmpresa = req.user.CodigoEmpresa;
    if (!codigoEmpresa || !codigoAlmacen || !ubicacion)
      return res.status(400).json({ success: false, mensaje: 'Código de empresa, almacén y ubicación requeridos.' });
    try {
      const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
      const offset = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);
      const pool = getPool();

      const ubicacionValidaResult = await pool.request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('ubicacion', sql.VarChar, ubicacion)
        .query(`
          SELECT COUNT(*) AS EsValida FROM Ubicaciones
          WHERE CodigoEmpresa=@codigoEmpresa AND CodigoAlmacen=@codigoAlmacen AND Ubicacion=@ubicacion
        `);
      if ((ubicacionValidaResult.recordset[0]?.EsValida || 0) === 0)
        return res.json({ success: true, articulos: [], total: 0, advertencia: 'Ubicación no pertenece al almacén indicado' });

      const countResult = await agregarContextoInventario(
        pool.request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
          .input('ubicacion', sql.VarChar, ubicacion),
        contexto
      ).query(`
        SELECT COUNT(*) AS TotalCount FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa=@codigoEmpresa AND CodigoAlmacen=@codigoAlmacen
          AND Ubicacion=@ubicacion AND Ejercicio IN (@ejercicioBase,@ejercicioActual)
          AND Periodo=99 AND COALESCE(UnidadSaldoTipo_,UnidadSaldo,0) <> 0
      `);
      const total = countResult.recordset[0].TotalCount;

      const result = await agregarContextoInventario(
        pool.request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
          .input('ubicacion', sql.VarChar, ubicacion)
          .input('offset', sql.Int, offset)
          .input('pageSize', sql.Int, parseInt(pageSize, 10)),
        contexto
      ).query(`
        SELECT
          s.CodigoArticulo,
          COALESCE(a.DescripcionArticulo, s.CodigoArticulo) AS DescripcionArticulo,
          COALESCE(a.Descripcion2Articulo, '') AS Descripcion2Articulo,
          SUM(CAST(COALESCE(s.UnidadSaldoTipo_,s.UnidadSaldo,0) AS DECIMAL(18,4))) AS Cantidad,
          s.TipoUnidadMedida_ AS UnidadMedida,
          a.UnidadMedida2_ AS UnidadBase,
          a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          COALESCE(a.FactorConversion_, 1) AS FactorConversion,
          s.Partida, s.CodigoColor_,
          c.Color_ AS NombreColor,
          s.CodigoTalla01_ AS Talla
        FROM AcumuladoStockUbicacion s
        LEFT JOIN Articulos a ON a.CodigoArticulo=s.CodigoArticulo AND a.CodigoEmpresa=s.CodigoEmpresa
        LEFT JOIN Colores_ c ON c.CodigoColor_=s.CodigoColor_ AND c.CodigoEmpresa=s.CodigoEmpresa
        WHERE s.CodigoEmpresa=@codigoEmpresa AND s.CodigoAlmacen=@codigoAlmacen
          AND s.Ubicacion=@ubicacion AND s.Ejercicio IN (@ejercicioBase,@ejercicioActual)
          AND s.Periodo=99 AND COALESCE(s.UnidadSaldoTipo_,s.UnidadSaldo,0) <> 0
        GROUP BY s.CodigoArticulo, a.DescripcionArticulo, a.Descripcion2Articulo,
          s.TipoUnidadMedida_, a.UnidadMedida2_, a.UnidadMedidaAlternativa_,
          a.FactorConversion_, s.Partida, s.CodigoColor_, c.Color_, s.CodigoTalla01_
        ORDER BY COALESCE(a.DescripcionArticulo, s.CodigoArticulo)
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `);

      res.json({ success: true, articulos: result.recordset, total });
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener artículos por ubicación', error: err.message });
    }
  });

  router.post('/ubicacionesMultiples', async (req, res) => {
    const { articulos } = req.body;
    const codigoEmpresa = req.user.CodigoEmpresa;
    if (!articulos || !Array.isArray(articulos))
      return res.status(400).json({ success: false, mensaje: 'Lista de artículos requerida en formato array.' });
    try {
      const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
      const codigosArticulos = articulos.map(art => art.codigo);
      if (codigosArticulos.length === 0) return res.json({});

      const articuloPlaceholders = codigosArticulos.map((_, i) => `@articulo${i}`).join(',');
      const query = `
        ${getCteInventarioActual()}
        SELECT
          COALESCE(a.CodigoArticulo, s.CodigoArticulo) AS CodigoArticulo,
          s.CodigoArticulo AS CodigoArticuloStock,
          s.CodigoAlmacen, alm.Almacen AS NombreAlmacen,
          s.Ubicacion, u.DescripcionUbicacion,
          CAST(s.UnidadSaldo AS DECIMAL(18,2)) AS UnidadSaldo,
          COALESCE(NULLIF(s.TipoUnidadMedida_,''),'unidades') AS UnidadMedida,
          s.Partida, s.CodigoColor_, s.CodigoTalla01_
        FROM StockUbicacionActual s
        ${getArticuloApply('s')}
        LEFT JOIN Almacenes alm ON alm.CodigoEmpresa=s.CodigoEmpresa AND alm.CodigoAlmacen=s.CodigoAlmacen
        LEFT JOIN Ubicaciones u ON u.CodigoEmpresa=s.CodigoEmpresa AND u.CodigoAlmacen=s.CodigoAlmacen AND u.Ubicacion=s.Ubicacion
        WHERE s.CodigoEmpresa=@codigoEmpresa
          AND s.UnidadSaldo>0
          AND s.CodigoArticulo IN (${articuloPlaceholders})
        ORDER BY s.CodigoArticulo, s.UnidadSaldo DESC
      `;

      const request = agregarContextoInventario(
        getPool().request().input('codigoEmpresa', sql.SmallInt, codigoEmpresa),
        contexto
      );
      codigosArticulos.forEach((codigo, index) => request.input(`articulo${index}`, sql.VarChar, codigo));
      const result = await request.query(query);

      const grouped = {};
      result.recordset.forEach(row => {
        const articulo = row.CodigoArticulo;
        if (!grouped[articulo]) grouped[articulo] = [];
        grouped[articulo].push({
          codigoAlmacen: row.CodigoAlmacen,
          nombreAlmacen: row.NombreAlmacen,
          ubicacion: row.Ubicacion,
          descripcionUbicacion: row.DescripcionUbicacion,
          unidadSaldo: parseFloat(row.UnidadSaldo),
          unidadMedida: row.UnidadMedida,
          partida: row.Partida,
          codigoColor: row.CodigoColor_,
          codigoTalla: row.CodigoTalla01_
        });
      });

      // Artículos sin stock en ninguna ubicación → array vacío (no hay Zona descarga ni Infinity)
      codigosArticulos.forEach(codigo => {
        if (!grouped[codigo]) grouped[codigo] = [];
      });

      res.json(grouped);
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener ubicaciones múltiples', error: err.message });
    }
  });

  router.get('/inventario/stock-sin-ubicacion', async (req, res) => {
    const codigoEmpresa = req.user.CodigoEmpresa;
    if (!codigoEmpresa) return res.status(400).json({ success: false, mensaje: 'Código de empresa requerido.' });
    try {
      const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
      const result = await agregarContextoInventario(
        getPool().request().input('codigoEmpresa', sql.SmallInt, codigoEmpresa),
        contexto
      ).query(`
        WITH StockTotal AS (
          SELECT CodigoArticulo, CodigoAlmacen,
            ISNULL(TipoUnidadMedida_,'') AS TipoUnidadMedida_,
            ISNULL(Partida,'') AS Partida,
            ISNULL(CodigoColor_,'') AS CodigoColor_,
            ISNULL(CodigoTalla01_,'') AS CodigoTalla01_,
            SUM(CAST(COALESCE(UnidadSaldoTipo_,UnidadSaldo,0) AS DECIMAL(18,4))) AS StockTotal
          FROM AcumuladoStock
          WHERE CodigoEmpresa=@codigoEmpresa AND Periodo=99 AND Ejercicio IN (@ejercicioBase,@ejercicioActual)
          GROUP BY CodigoArticulo, CodigoAlmacen, ISNULL(TipoUnidadMedida_,''), ISNULL(Partida,''), ISNULL(CodigoColor_,''), ISNULL(CodigoTalla01_,'')
        ),
        StockConUbicacion AS (
          SELECT s.CodigoArticulo, s.CodigoAlmacen,
            ISNULL(s.TipoUnidadMedida_,'') AS TipoUnidadMedida_,
            ISNULL(s.Partida,'') AS Partida,
            ISNULL(s.CodigoColor_,'') AS CodigoColor_,
            ISNULL(s.CodigoTalla01_,'') AS CodigoTalla01_,
            SUM(CAST(COALESCE(s.UnidadSaldoTipo_,s.UnidadSaldo,0) AS DECIMAL(18,4))) AS StockConUbicacion
          FROM AcumuladoStockUbicacion s
          INNER JOIN Ubicaciones uv ON uv.CodigoEmpresa=s.CodigoEmpresa AND uv.CodigoAlmacen=s.CodigoAlmacen AND uv.Ubicacion=s.Ubicacion
          WHERE s.CodigoEmpresa=@codigoEmpresa AND s.Periodo=99 AND s.Ejercicio IN (@ejercicioBase,@ejercicioActual)
          GROUP BY s.CodigoArticulo, s.CodigoAlmacen, ISNULL(s.TipoUnidadMedida_,''), ISNULL(s.Partida,''), ISNULL(s.CodigoColor_,''), ISNULL(s.CodigoTalla01_,'')
        )
        SELECT
          st.CodigoArticulo, a.DescripcionArticulo, a.Descripcion2Articulo,
          st.CodigoAlmacen, alm.Almacen AS NombreAlmacen,
          '' AS Ubicacion, NULL AS DescripcionUbicacion,
          st.Partida, st.TipoUnidadMedida_ AS UnidadStock,
          a.UnidadMedida2_ AS UnidadBase, a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          a.FactorConversion_ AS FactorConversion,
          st.CodigoColor_, st.CodigoTalla01_,
          (st.StockTotal - ISNULL(sc.StockConUbicacion,0)) AS Cantidad,
          CASE
            WHEN st.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_
              THEN (st.StockTotal - ISNULL(sc.StockConUbicacion,0)) * a.FactorConversion_
            WHEN st.TipoUnidadMedida_ = a.UnidadMedida2_
              THEN (st.StockTotal - ISNULL(sc.StockConUbicacion,0))
            ELSE (st.StockTotal - ISNULL(sc.StockConUbicacion,0)) * a.FactorConversion_
          END AS CantidadBase,
          CONCAT(@codigoEmpresa,'_',@ejercicioBase,'_',st.CodigoAlmacen,'_','SIN_UBICACION','_',st.CodigoArticulo,'_',
            ISNULL(st.TipoUnidadMedida_,'unidades'),'_',ISNULL(st.Partida,''),'_',ISNULL(st.CodigoColor_,''),'_',
            ISNULL(st.CodigoTalla01_,''),'_',CAST(CAST((st.StockTotal - ISNULL(sc.StockConUbicacion,0)) AS DECIMAL(18,4)) AS VARCHAR(20))) AS ClaveUnica,
          0 AS MovPosicionLinea
        FROM StockTotal st
        LEFT JOIN Articulos a ON a.CodigoEmpresa=@codigoEmpresa AND a.CodigoArticulo=st.CodigoArticulo
        LEFT JOIN Almacenes alm ON alm.CodigoEmpresa=@codigoEmpresa AND alm.CodigoAlmacen=st.CodigoAlmacen
        LEFT JOIN StockConUbicacion sc
          ON sc.CodigoArticulo=st.CodigoArticulo AND sc.CodigoAlmacen=st.CodigoAlmacen
          AND sc.TipoUnidadMedida_=st.TipoUnidadMedida_ AND sc.Partida=st.Partida
          AND sc.CodigoColor_=st.CodigoColor_ AND sc.CodigoTalla01_=st.CodigoTalla01_
        WHERE (st.StockTotal - ISNULL(sc.StockConUbicacion,0)) != 0
        ORDER BY st.CodigoArticulo, st.CodigoAlmacen
      `);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener stock sin ubicación', error: err.message });
    }
  });

  router.get('/inventario/historial-ajustes-v2', async (req, res) => {
    if (!req.user || !req.user.CodigoEmpresa)
      return res.status(401).json({ success: false, mensaje: 'No autenticado' });

    const codigoEmpresa = req.user.CodigoEmpresa;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const requestedLimit = parseInt(req.query.limit, 10) || 20;
    const limit = [20, 25, 50, 100].includes(requestedLimit) ? requestedLimit : 20;
    const offset = (page - 1) * limit;
    const hoy = new Date();
    const haceTreintaDias = new Date(hoy);
    haceTreintaDias.setDate(hoy.getDate() - 30);
    const fechaDesde = req.query.fechaDesde || haceTreintaDias.toISOString().split('T')[0];
    const fechaHasta = req.query.fechaHasta || hoy.toISOString().split('T')[0];

    try {
      const totalResult = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('fechaDesde', sql.Date, fechaDesde)
        .input('fechaHasta', sql.Date, fechaHasta)
        .query(`
          SELECT COUNT(*) AS Total FROM (
            SELECT 1 AS dummy FROM MovimientoStock m
            WHERE m.CodigoEmpresa=@codigoEmpresa AND m.TipoMovimiento=5
              AND CONVERT(date,m.FechaRegistro) BETWEEN @fechaDesde AND @fechaHasta
              AND (m.Unidades IS NOT NULL AND m.Unidades<>0)
            UNION ALL
            SELECT 1 AS dummy FROM Inventarios i
            WHERE i.CodigoEmpresa=@codigoEmpresa AND i.StatusRegulariza=-1
              AND CONVERT(date,i.FechaCreacion) BETWEEN @fechaDesde AND @fechaHasta
              AND (i.UnidadesInventario - i.UnidadesStock) != 0
          ) AS T
        `);

      const total = Number(totalResult.recordset[0]?.Total || 0);
      const totalPages = Math.max(Math.ceil(total / limit), 1);

      const dataResult = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('fechaDesde', sql.Date, fechaDesde)
        .input('fechaHasta', sql.Date, fechaHasta)
        .input('offset', sql.Int, offset)
        .input('limit', sql.Int, limit)
        .query(`
          WITH Combinados AS (
            SELECT
              m.Ejercicio, m.Periodo, m.CodigoArticulo, m.CodigoAlmacen, m.Ubicacion,
              ISNULL(m.Partida,'') AS Partida,
              CAST(ISNULL(m.Unidades,0) AS DECIMAL(18,4)) AS Diferencia,
              m.Comentario, m.FechaRegistro,
              ISNULL(m.UnidadMedida1_,'') AS UnidadMedida,
              ISNULL(m.CodigoColor_,'') AS CodigoColor,
              ISNULL(m.CodigoTalla01_,'') AS CodigoTalla01,
              'MOVIMIENTO' AS TipoRegistro,
              CASE
                WHEN NULLIF(LTRIM(RTRIM(ISNULL(m.CodigoCliente,''))), '') IS NOT NULL
                  AND LTRIM(RTRIM(ISNULL(m.CodigoCliente,''))) <> '0'
                  THEN LTRIM(RTRIM(m.CodigoCliente))
                WHEN CHARINDEX(' por ', ISNULL(m.Comentario,'')) > 0
                  THEN LTRIM(RTRIM(SUBSTRING(m.Comentario, CHARINDEX(' por ',m.Comentario)+5, LEN(m.Comentario))))
                ELSE ''
              END AS Usuario,
              CASE
                WHEN CHARINDEX(' por ', ISNULL(m.Comentario,'')) > 0
                  THEN LEFT(m.Comentario, CHARINDEX(' por ',m.Comentario)-1)
                ELSE m.Comentario
              END AS ComentarioLimpio
            FROM MovimientoStock m
            WHERE m.CodigoEmpresa=@codigoEmpresa AND m.TipoMovimiento=5
              AND CONVERT(date,m.FechaRegistro) BETWEEN @fechaDesde AND @fechaHasta
              AND (m.Unidades IS NOT NULL AND m.Unidades<>0)
            UNION ALL
            SELECT
              YEAR(i.FechaCreacion), MONTH(i.FechaCreacion),
              i.CodigoArticulo, i.CodigoAlmacen, i.Ubicacion,
              ISNULL(i.Partida,''),
              CAST((i.UnidadesInventario - i.UnidadesStock) AS DECIMAL(18,4)),
              i.Inventario, i.FechaCreacion,
              ISNULL(i.TipoUnidadMedida_,''), ISNULL(i.CodigoColor_,''), ISNULL(i.CodigoTalla01_,''),
              'INVENTARIO', NULL, i.Inventario
            FROM Inventarios i
            WHERE i.CodigoEmpresa=@codigoEmpresa AND i.StatusRegulariza=-1
              AND CONVERT(date,i.FechaCreacion) BETWEEN @fechaDesde AND @fechaHasta
              AND (i.UnidadesInventario - i.UnidadesStock) != 0
          )
          SELECT
            c.Ejercicio, c.Periodo, c.CodigoArticulo,
            COALESCE(a.DescripcionArticulo, c.CodigoArticulo) AS DescripcionArticulo,
            c.CodigoAlmacen, COALESCE(alm.Almacen,c.CodigoAlmacen) AS NombreAlmacen,
            c.Ubicacion, COALESCE(u.DescripcionUbicacion,'') AS DescripcionUbicacion,
            c.Partida, c.Diferencia, c.ComentarioLimpio AS Comentario,
            c.Usuario, c.FechaRegistro, c.UnidadMedida,
            c.CodigoColor, c.CodigoTalla01, c.TipoRegistro
          FROM Combinados c
          LEFT JOIN Articulos a ON a.CodigoEmpresa=@codigoEmpresa AND a.CodigoArticulo=c.CodigoArticulo
          LEFT JOIN Almacenes alm ON alm.CodigoEmpresa=@codigoEmpresa AND alm.CodigoAlmacen=c.CodigoAlmacen
          LEFT JOIN Ubicaciones u ON u.CodigoEmpresa=@codigoEmpresa AND u.CodigoAlmacen=c.CodigoAlmacen AND u.Ubicacion=c.Ubicacion
          ORDER BY c.FechaRegistro DESC, c.CodigoArticulo
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

      res.json({
        success: true,
        items: dataResult.recordset,
        pagination: { page, limit, total, totalPages, hasPrev: page > 1, hasNext: page < totalPages },
        filtros: { fechaDesde, fechaHasta }
      });
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener historial de ajustes.', error: err.message });
    }
  });

  router.get('/stock/detalles', async (req, res) => {
    const { movPosicionLinea } = req.query;
    const codigoEmpresa = req.user.CodigoEmpresa;
    if (!codigoEmpresa || !movPosicionLinea)
      return res.status(400).json({ success: false, mensaje: 'Faltan parámetros requeridos.' });
    try {
      const result = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('movPosicionLinea', sql.VarChar, movPosicionLinea)
        .query(`
          SELECT
            lt.CodigoColor_, c.Color_ AS NombreColor,
            lt.GrupoTalla_, gt.DescripcionGrupoTalla_ AS NombreGrupoTalla,
            t01.DescripcionTalla_ AS DescTalla01, t02.DescripcionTalla_ AS DescTalla02,
            t03.DescripcionTalla_ AS DescTalla03, t04.DescripcionTalla_ AS DescTalla04,
            lt.UnidadesTotalTallas_ AS Unidades,
            lt.UnidadesTalla01_, lt.UnidadesTalla02_, lt.UnidadesTalla03_, lt.UnidadesTalla04_
          FROM LineasPedidoClienteTallas lt
          LEFT JOIN Colores_ c ON lt.CodigoColor_=c.CodigoColor_ AND lt.CodigoEmpresa=c.CodigoEmpresa
          LEFT JOIN GrupoTallas_ gt ON lt.GrupoTalla_=gt.GrupoTalla_ AND lt.CodigoEmpresa=gt.CodigoEmpresa
          LEFT JOIN Tallas_ t01 ON lt.CodigoEmpresa=t01.CodigoEmpresa AND lt.GrupoTalla_=t01.GrupoTalla_ AND lt.CodigoTalla01_=t01.CodigoTalla_
          LEFT JOIN Tallas_ t02 ON lt.CodigoEmpresa=t02.CodigoEmpresa AND lt.GrupoTalla_=t02.GrupoTalla_ AND lt.CodigoTalla02_=t02.CodigoTalla_
          LEFT JOIN Tallas_ t03 ON lt.CodigoEmpresa=t03.CodigoEmpresa AND lt.GrupoTalla_=t03.GrupoTalla_ AND lt.CodigoTalla03_=t03.CodigoTalla_
          LEFT JOIN Tallas_ t04 ON lt.CodigoEmpresa=t04.CodigoEmpresa AND lt.GrupoTalla_=t04.GrupoTalla_ AND lt.CodigoTalla04_=t04.CodigoTalla_
          WHERE lt.CodigoEmpresa=@codigoEmpresa AND lt.MovPosicionLinea_=@movPosicionLinea
        `);
      const detalles = result.recordset.map(detalle => ({
        color: { codigo: detalle.CodigoColor_, nombre: detalle.NombreColor },
        grupoTalla: { codigo: detalle.GrupoTalla_, nombre: detalle.NombreGrupoTalla },
        unidades: detalle.Unidades,
        tallas: {
          '01': { descripcion: detalle.DescTalla01, unidades: detalle.UnidadesTalla01_ },
          '02': { descripcion: detalle.DescTalla02, unidades: detalle.UnidadesTalla02_ },
          '03': { descripcion: detalle.DescTalla03, unidades: detalle.UnidadesTalla03_ },
          '04': { descripcion: detalle.DescTalla04, unidades: detalle.UnidadesTalla04_ }
        }
      }));
      res.json(detalles);
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener detalles del stock.', error: err.message });
    }
  });

  router.get('/familias', async (req, res) => {
    const codigoEmpresa = req.user.CodigoEmpresa;
    try {
      const result = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          SELECT DISTINCT CodigoFamilia AS codigo, CodigoFamilia AS nombre
          FROM Articulos WHERE CodigoEmpresa=@codigoEmpresa AND CodigoFamilia IS NOT NULL AND CodigoFamilia<>''
          ORDER BY CodigoFamilia
        `);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener familias', error: err.message });
    }
  });

  router.get('/subfamilias', async (req, res) => {
    const codigoEmpresa = req.user.CodigoEmpresa;
    try {
      const result = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          SELECT DISTINCT CodigoSubfamilia AS codigo, CodigoSubfamilia AS nombre
          FROM Articulos WHERE CodigoEmpresa=@codigoEmpresa AND CodigoSubfamilia IS NOT NULL AND CodigoSubfamilia<>''
          ORDER BY CodigoSubfamilia
        `);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener subfamilias', error: err.message });
    }
  });

  router.get('/stock/articulos-con-stock', async (req, res) => {
    const codigoEmpresa = req.user.CodigoEmpresa;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(req.query.pageSize, 10) || 50, 1);
    const searchTerm = req.query.search || '';
    const offset = (page - 1) * pageSize;
    try {
      const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
      const query = `
        ${getCteInventarioActual()}
        SELECT
          COALESCE(a.CodigoArticulo, s.CodigoArticulo) AS CodigoArticulo,
          s.CodigoArticulo AS CodigoArticuloStock,
          COALESCE(a.DescripcionArticulo, s.CodigoArticulo) AS DescripcionArticulo,
          SUM(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0)) AS StockTotal
        FROM StockUbicacionActual s
        ${getArticuloApply('s')}
        WHERE s.CodigoEmpresa=@codigoEmpresa
          AND (s.CodigoArticulo LIKE @searchTerm OR a.DescripcionArticulo LIKE @searchTerm)
        GROUP BY COALESCE(a.CodigoArticulo,s.CodigoArticulo), s.CodigoArticulo, COALESCE(a.DescripcionArticulo,s.CodigoArticulo)
        HAVING SUM(COALESCE(s.UnidadSaldoTipo_,s.UnidadSaldo,0)) > 0
        ORDER BY DescripcionArticulo
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `;
      const countQuery = `
        ${getCteInventarioActual()}
        SELECT COUNT(*) AS Total FROM (
          SELECT s.CodigoArticulo FROM StockUbicacionActual s
          ${getArticuloApply('s')}
          WHERE s.CodigoEmpresa=@codigoEmpresa
            AND (s.CodigoArticulo LIKE @searchTerm OR a.DescripcionArticulo LIKE @searchTerm)
          GROUP BY s.CodigoArticulo
          HAVING SUM(COALESCE(s.UnidadSaldoTipo_,s.UnidadSaldo,0)) > 0
        ) AS subquery
      `;
      const request = agregarContextoInventario(
        getPool().request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('searchTerm', sql.VarChar, `%${searchTerm}%`)
          .input('offset', sql.Int, offset)
          .input('pageSize', sql.Int, pageSize),
        contexto
      );
      const result = await request.query(query);
      const countResult = await request.query(countQuery);
      const total = countResult.recordset[0].Total;
      res.json({ articulos: result.recordset, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener artículos con stock', error: err.message });
    }
  });

  router.get('/ubicaciones/:codigoAlmacen', async (req, res) => {
    const codigoEmpresa = req.user.CodigoEmpresa;
    const { codigoAlmacen } = req.params;
    const { incluirSinUbicacion = 'false' } = req.query;
    if (!codigoEmpresa || !codigoAlmacen)
      return res.status(400).json({ success: false, mensaje: 'Código de empresa y almacén requeridos.' });
    try {
      const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
      let query = `
        ${getCteInventarioActual()}
        SELECT
          u.Ubicacion, u.DescripcionUbicacion,
          alm.CodigoAlmacen, alm.Almacen AS NombreAlmacen,
          (SELECT COUNT(*) FROM StockUbicacionActual s
           WHERE s.CodigoEmpresa=u.CodigoEmpresa AND s.CodigoAlmacen=u.CodigoAlmacen
             AND s.Ubicacion=u.Ubicacion AND s.UnidadSaldo>0) AS CantidadArticulos
        FROM Ubicaciones u
        INNER JOIN Almacenes alm ON alm.CodigoEmpresa=u.CodigoEmpresa AND alm.CodigoAlmacen=u.CodigoAlmacen
        WHERE u.CodigoEmpresa=@codigoEmpresa AND u.CodigoAlmacen=@codigoAlmacen
      `;
      if (incluirSinUbicacion === 'true') {
        query += `
          UNION ALL
          SELECT 'SIN-UBICACION', 'Stock sin ubicación asignada', @codigoAlmacen, alm.Almacen,
            (SELECT COUNT(DISTINCT s.CodigoArticulo) FROM AcumuladoStockActual s
             LEFT JOIN StockUbicacionActual su ON su.CodigoEmpresa=s.CodigoEmpresa AND su.CodigoAlmacen=s.CodigoAlmacen
               AND su.CodigoArticulo=s.CodigoArticulo AND su.UnidadSaldo>0
             WHERE s.CodigoEmpresa=@codigoEmpresa AND s.CodigoAlmacen=@codigoAlmacen
               AND s.UnidadSaldo>0 AND su.CodigoArticulo IS NULL) AS CantidadArticulos
          FROM Almacenes alm WHERE alm.CodigoEmpresa=@codigoEmpresa AND alm.CodigoAlmacen=@codigoAlmacen
        `;
      }
      query += ' ORDER BY Ubicacion';
      const result = await agregarContextoInventario(
        getPool().request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('codigoAlmacen', sql.VarChar, codigoAlmacen),
        contexto
      ).query(query);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener ubicaciones', error: err.message });
    }
  });

  router.get('/articulos/:codigoArticulo', async (req, res) => {
    const codigoEmpresa = req.user.CodigoEmpresa;
    const { codigoArticulo } = req.params;
    try {
      const result = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .query(`
          SELECT CodigoArticulo, DescripcionArticulo, UnidadMedida2_, UnidadMedidaAlternativa_, FactorConversion_
          FROM Articulos WHERE CodigoEmpresa=@codigoEmpresa AND CodigoArticulo=@codigoArticulo
        `);
      if (result.recordset.length === 0) return res.status(404).json({ error: 'Artículo no encontrado' });
      res.json(result.recordset[0]);
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener artículo' });
    }
  });

  router.get('/articulos/:codigoArticulo/variantes-contexto', async (req, res) => {
    const codigoEmpresa = req.user.CodigoEmpresa;
    const { codigoArticulo } = req.params;
    try {
      const articuloResult = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .query(`
          SELECT TOP 1 CodigoArticulo, DescripcionArticulo, UnidadMedida2_, UnidadMedidaAlternativa_,
            FactorConversion_, GrupoTalla_, Colores_
          FROM Articulos WHERE CodigoEmpresa=@codigoEmpresa AND CodigoArticulo=@codigoArticulo
        `);
      if (articuloResult.recordset.length === 0)
        return res.status(404).json({ success: false, mensaje: 'Articulo no encontrado' });

      const articulo = articuloResult.recordset[0];
      const grupoTalla = parseInt(articulo.GrupoTalla_, 10) || 0;
      const usaTallas = grupoTalla > 0;
      const usaColores = parseInt(articulo.Colores_, 10) === -1;
      let tallas = [];
      let grupoTallaInfo = null;

      if (usaTallas) {
        const tallaValues = Array.from({ length: 40 }, (_, index) => {
          const n = String(index + 1).padStart(2, '0');
          return `(${index + 1}, CodigoTalla${n}_, DescripcionTalla${n}_)`;
        }).join(',\n          ');
        const tallasResult = await getPool().request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('grupoTalla', sql.SmallInt, grupoTalla)
          .query(`
            SELECT gt.GrupoTalla_, gt.DescripcionGrupoTalla_, gt.NumeroTallas_, v.Orden, v.CodigoTalla, v.DescripcionTalla
            FROM GrupoTallas_ gt
            CROSS APPLY (VALUES ${tallaValues}) v(Orden, CodigoTalla, DescripcionTalla)
            WHERE gt.CodigoEmpresa=@codigoEmpresa AND gt.GrupoTalla_=@grupoTalla
              AND NULLIF(LTRIM(RTRIM(v.CodigoTalla)),'') IS NOT NULL
            ORDER BY v.Orden
          `);
        if (tallasResult.recordset.length > 0) {
          const first = tallasResult.recordset[0];
          grupoTallaInfo = { codigo: first.GrupoTalla_, descripcion: first.DescripcionGrupoTalla_, numeroTallas: first.NumeroTallas_ };
          tallas = tallasResult.recordset.map(t => ({ codigo: t.CodigoTalla, descripcion: t.DescripcionTalla || t.CodigoTalla }));
        }
      }

      const coloresResult = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .query(`
          SELECT DISTINCT x.CodigoColor_, COALESCE(c.Color_, x.CodigoColor_) AS NombreColor
          FROM (
            SELECT ca.CodigoColor_ FROM ColoresArticulo_ ca
            WHERE ca.CodigoEmpresa=@codigoEmpresa AND ca.CodigoArticulo=@codigoArticulo
              AND NULLIF(LTRIM(RTRIM(ca.CodigoColor_)),'') IS NOT NULL
            UNION
            SELECT s.CodigoColor_ FROM AcumuladoStockUbicacion s
            WHERE s.CodigoEmpresa=@codigoEmpresa AND s.CodigoArticulo=@codigoArticulo
              AND NULLIF(LTRIM(RTRIM(s.CodigoColor_)),'') IS NOT NULL
          ) x
          LEFT JOIN Colores_ c ON c.CodigoEmpresa=@codigoEmpresa AND c.CodigoColor_=x.CodigoColor_
          ORDER BY x.CodigoColor_
        `);
      const colores = coloresResult.recordset.map(c => ({ codigo: c.CodigoColor_, nombre: c.NombreColor || c.CodigoColor_ }));
      res.json({ success: true, articulo, usaTallas, usaColores: usaColores || colores.length > 0, grupoTalla: grupoTallaInfo, tallas, colores });
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener contexto de variantes', error: err.message });
    }
  });

  router.get('/buscar-ubicaciones', async (req, res) => {
    const { termino } = req.query;
    const codigoEmpresa = req.user.CodigoEmpresa;
    try {
      if (!termino || termino.trim().length < 2) return res.json([]);
      const result = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('termino', sql.VarChar, `%${termino}%`)
        .query(`
          SELECT
            u.CodigoAlmacen, alm.Almacen AS NombreAlmacen,
            u.Ubicacion, u.DescripcionUbicacion,
            (SELECT COUNT(*) FROM AcumuladoStockUbicacion s
             WHERE s.CodigoEmpresa=u.CodigoEmpresa AND s.CodigoAlmacen=u.CodigoAlmacen
               AND s.Ubicacion=u.Ubicacion AND s.Periodo=99 AND s.UnidadSaldo>0) AS CantidadArticulos
          FROM Ubicaciones u
          INNER JOIN Almacenes alm ON alm.CodigoEmpresa=u.CodigoEmpresa AND alm.CodigoAlmacen=u.CodigoAlmacen
          WHERE u.CodigoEmpresa=@codigoEmpresa
            AND (u.Ubicacion LIKE @termino OR u.DescripcionUbicacion LIKE @termino OR alm.Almacen LIKE @termino)
          ORDER BY u.Ubicacion
        `);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al buscar ubicaciones.', error: err.message });
    }
  });

  router.get('/stock/por-articulo', async (req, res) => {
    const { codigoArticulo, incluirSinUbicacion = 'false' } = req.query;
    const codigoEmpresa = req.user.CodigoEmpresa;
    if (!codigoEmpresa || !codigoArticulo)
      return res.status(400).json({ success: false, mensaje: 'Código de empresa y artículo requeridos.' });
    try {
      const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
      let query = `
        SELECT
          s.CodigoAlmacen, alm.Almacen AS NombreAlmacen,
          s.Ubicacion, u.DescripcionUbicacion,
          SUM(CAST(COALESCE(s.UnidadSaldoTipo_,s.UnidadSaldo,0) AS DECIMAL(18,2))) AS Cantidad,
          COALESCE(NULLIF(s.TipoUnidadMedida_,''),'unidades') AS UnidadMedida,
          s.TipoUnidadMedida_,
          s.Partida, s.CodigoColor_, s.CodigoTalla01_ AS Talla,
          c.Color_ AS NombreColor,
          COALESCE(a.DescripcionArticulo, s.CodigoArticulo) AS DescripcionArticulo,
          COALESCE(a.Descripcion2Articulo,'') AS Descripcion2Articulo,
          0 AS EsSinUbicacion,
          CONCAT(s.CodigoAlmacen,'_',s.Ubicacion,'_',ISNULL(s.TipoUnidadMedida_,''),'_',ISNULL(s.Partida,''),'_',ISNULL(s.CodigoColor_,''),'_',ISNULL(s.CodigoTalla01_,'')) AS GrupoUnico,
          CAST(SUM(COALESCE(s.UnidadSaldo,0)) AS DECIMAL(18,2)) AS UnidadSaldo_Original,
          CAST(SUM(COALESCE(s.UnidadSaldoTipo_,s.UnidadSaldo,0)) AS DECIMAL(18,2)) AS UnidadSaldoTipo_Corregido
        FROM AcumuladoStockUbicacion s
        INNER JOIN Ubicaciones uv ON uv.CodigoEmpresa=s.CodigoEmpresa AND uv.CodigoAlmacen=s.CodigoAlmacen AND uv.Ubicacion=s.Ubicacion
        LEFT JOIN Almacenes alm ON alm.CodigoEmpresa=s.CodigoEmpresa AND alm.CodigoAlmacen=s.CodigoAlmacen
        LEFT JOIN Articulos a ON a.CodigoEmpresa=s.CodigoEmpresa AND a.CodigoArticulo=s.CodigoArticulo
        LEFT JOIN Ubicaciones u ON u.CodigoEmpresa=s.CodigoEmpresa AND u.CodigoAlmacen=s.CodigoAlmacen AND u.Ubicacion=s.Ubicacion
        LEFT JOIN Colores_ c ON c.CodigoEmpresa=s.CodigoEmpresa AND c.CodigoColor_=s.CodigoColor_
        WHERE s.CodigoEmpresa=@codigoEmpresa
          AND s.CodigoArticulo=@codigoArticulo
          AND s.Periodo=99
          AND s.Ejercicio IN (@ejercicioBase,@ejercicioActual)
          AND (
            COALESCE(s.UnidadSaldoTipo_,s.UnidadSaldo,0) <> 0
            OR EXISTS (
              SELECT 1 FROM AcumuladoStock acs
              WHERE acs.CodigoEmpresa=s.CodigoEmpresa
                AND acs.CodigoArticulo=s.CodigoArticulo
                AND acs.CodigoAlmacen=s.CodigoAlmacen
                AND acs.Ubicacion=s.Ubicacion
                AND acs.Periodo=99
                AND acs.Ejercicio IN (@ejercicioBase,@ejercicioActual)
            )
          )
        GROUP BY s.CodigoAlmacen, alm.Almacen, s.Ubicacion, u.DescripcionUbicacion,
          s.TipoUnidadMedida_, s.Partida, s.CodigoColor_, s.CodigoTalla01_, c.Color_,
          a.DescripcionArticulo, a.Descripcion2Articulo, s.CodigoArticulo
      `;

      if (incluirSinUbicacion === 'true') {
        query += `
          UNION ALL
          SELECT
            s.CodigoAlmacen, alm.Almacen AS NombreAlmacen,
            'SIN-UBICACION', 'Stock sin ubicación asignada',
            (s.StockTotal - ISNULL(u.StockUbicado,0)) AS Cantidad,
            'unidades', 'unidades', '', '', '', '',
            a.DescripcionArticulo, a.Descripcion2Articulo,
            1,
            CONCAT(s.CodigoAlmacen,'_SIN-UBICACION_unidades_') AS GrupoUnico,
            (s.StockTotal - ISNULL(u.StockUbicado,0)),
            (s.StockTotal - ISNULL(u.StockUbicado,0))
          FROM (
            SELECT CodigoAlmacen, CodigoArticulo, SUM(UnidadSaldo) AS StockTotal
            FROM AcumuladoStock
            WHERE CodigoEmpresa=@codigoEmpresa AND CodigoArticulo=@codigoArticulo
              AND Periodo=99 AND Ejercicio IN (@ejercicioBase,@ejercicioActual)
            GROUP BY CodigoAlmacen, CodigoArticulo
          ) s
          LEFT JOIN Almacenes alm ON s.CodigoAlmacen=alm.CodigoAlmacen AND alm.CodigoEmpresa=@codigoEmpresa
          LEFT JOIN Articulos a ON a.CodigoEmpresa=@codigoEmpresa AND a.CodigoArticulo=s.CodigoArticulo
          LEFT JOIN (
            SELECT asu.CodigoAlmacen, asu.CodigoArticulo, SUM(asu.UnidadSaldo) AS StockUbicado
            FROM AcumuladoStockUbicacion asu
            INNER JOIN Ubicaciones uv ON uv.CodigoEmpresa=asu.CodigoEmpresa AND uv.CodigoAlmacen=asu.CodigoAlmacen AND uv.Ubicacion=asu.Ubicacion
            WHERE asu.CodigoEmpresa=@codigoEmpresa AND asu.CodigoArticulo=@codigoArticulo
              AND asu.Periodo=99 AND asu.Ejercicio IN (@ejercicioBase,@ejercicioActual)
            GROUP BY asu.CodigoAlmacen, asu.CodigoArticulo
          ) u ON u.CodigoAlmacen=s.CodigoAlmacen AND u.CodigoArticulo=s.CodigoArticulo
          WHERE (s.StockTotal - ISNULL(u.StockUbicado,0)) != 0
        `;
      }

      query += ` ORDER BY CodigoAlmacen, Ubicacion`;

      const request = agregarContextoInventario(
        getPool().request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('codigoArticulo', sql.VarChar, codigoArticulo),
        contexto
      );
      const result = await request.query(query);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener stock por artículo.', error: err.message });
    }
  });

  router.get('/stock/por-variante', async (req, res) => {
    const { codigoArticulo, codigoColor, codigoTalla } = req.query;
    const codigoEmpresa = req.user.CodigoEmpresa;
    if (!codigoEmpresa || !codigoArticulo)
      return res.status(400).json({ success: false, mensaje: 'Código de empresa y artículo requeridos.' });
    try {
      const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
      const request = agregarContextoInventario(
        getPool().request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('codigoArticulo', sql.VarChar(20), codigoArticulo),
        contexto
      );

      let filtroColor = `AND ISNULL(s.CodigoColor_,'') = ''`;
      let filtroTalla = `AND ISNULL(s.CodigoTalla01_,'') = ''`;
      if (codigoColor && codigoColor !== '' && codigoColor !== 'null') {
        filtroColor = `AND ISNULL(s.CodigoColor_,'') = @codigoColor`;
        request.input('codigoColor', sql.VarChar(10), codigoColor);
      }
      if (codigoTalla && codigoTalla !== '' && codigoTalla !== 'null') {
        filtroTalla = `AND ISNULL(s.CodigoTalla01_,'') = @codigoTalla`;
        request.input('codigoTalla', sql.VarChar(10), codigoTalla);
      }

      const query = `
        SELECT
          s.CodigoAlmacen, alm.Almacen AS NombreAlmacen,
          s.Ubicacion, u.DescripcionUbicacion,
          SUM(CAST(COALESCE(s.UnidadSaldoTipo_,s.UnidadSaldo,0) AS DECIMAL(18,2))) AS Cantidad,
          COALESCE(NULLIF(s.TipoUnidadMedida_,''),'unidades') AS UnidadMedida,
          s.Partida, s.CodigoColor_, s.CodigoTalla01_,
          SUM(CAST(COALESCE(s.UnidadSaldoTipo_,s.UnidadSaldo,0) AS DECIMAL(18,2))) AS UnidadSaldoTipo_Sum
        FROM AcumuladoStockUbicacion s
        INNER JOIN Ubicaciones uv ON uv.CodigoEmpresa=s.CodigoEmpresa AND uv.CodigoAlmacen=s.CodigoAlmacen AND uv.Ubicacion=s.Ubicacion
        LEFT JOIN Almacenes alm ON alm.CodigoEmpresa=s.CodigoEmpresa AND alm.CodigoAlmacen=s.CodigoAlmacen
        LEFT JOIN Ubicaciones u ON u.CodigoEmpresa=s.CodigoEmpresa AND u.CodigoAlmacen=s.CodigoAlmacen AND u.Ubicacion=s.Ubicacion
        WHERE s.CodigoEmpresa=@codigoEmpresa
          AND s.CodigoArticulo=@codigoArticulo
          AND s.Periodo=99
          AND s.Ejercicio IN (@ejercicioBase,@ejercicioActual)
          ${filtroColor}
          ${filtroTalla}
          AND (
            COALESCE(s.UnidadSaldoTipo_,s.UnidadSaldo,0) <> 0
            OR EXISTS (
              SELECT 1 FROM AcumuladoStock acs
              WHERE acs.CodigoEmpresa=s.CodigoEmpresa
                AND acs.CodigoArticulo=s.CodigoArticulo
                AND acs.CodigoAlmacen=s.CodigoAlmacen
                AND acs.Ubicacion=s.Ubicacion
                AND acs.Periodo=99
                AND acs.Ejercicio IN (@ejercicioBase,@ejercicioActual)
            )
          )
        GROUP BY s.CodigoAlmacen, alm.Almacen, s.Ubicacion, u.DescripcionUbicacion,
          s.TipoUnidadMedida_, s.Partida, s.CodigoColor_, s.CodigoTalla01_
        HAVING SUM(CAST(COALESCE(s.UnidadSaldoTipo_,s.UnidadSaldo,0) AS DECIMAL(18,2))) != 0
        ORDER BY s.CodigoAlmacen, s.Ubicacion
      `;
      const result = await request.query(query);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener stock por variante.', error: err.message });
    }
  });

  const MAX_AJUSTES_POR_LLAMADA = 500;

  router.post('/inventario/ajustar-completo', async (req, res) => {
    if (!req.user || !req.user.CodigoEmpresa)
      return res.status(401).json({ success: false, mensaje: 'No autorizado' });

    const { ajustes } = req.body;
    const codigoEmpresa = req.user.CodigoEmpresa;
    const usuarioCheck = req.user.UsuarioLogicNet || req.user.CodigoUsuario;
    if (!(await verificarPermiso(usuarioCheck, codigoEmpresa)))
      return res.status(403).json({ success: false, mensaje: 'No tienes permiso para ajustar inventario.' });

    const ejercicio = new Date().getFullYear();
    // CodigoCliente se guarda en el movimiento para trazabilidad
    const codigoClienteUsuario = req.user.CodigoCliente || '';
    // UsuarioLogicNet va al comentario (UsuarioProceso es smallint, no lo usamos)
    const usuarioInventario = req.user.UsuarioLogicNet || req.user.CodigoUsuario || 'desconocido';

    if (!ajustes || !Array.isArray(ajustes) || ajustes.length === 0)
      return res.status(400).json({ success: false, mensaje: 'Lista de ajustes vacía o inválida.' });

    if (ajustes.length > MAX_AJUSTES_POR_LLAMADA)
      return res.status(400).json({ success: false, mensaje: `Máximo ${MAX_AJUSTES_POR_LLAMADA} ajustes por llamada.` });

    const transaction = new sql.Transaction(getPool());

    try {
      await transaction.begin();

      for (const ajuste of ajustes) {
        const ajusteDestino = normalizarAjusteInventario(ajuste);
        const ajusteOrigen = normalizarAjusteInventario(
          ajuste.combinacionOriginal || {
            articulo: ajuste.articulo,
            codigoAlmacen: ajuste.codigoAlmacen,
            ubicacionStr: ajuste.ubicacionStr,
            partida: ajuste.partida,
            unidadStock: ajuste.unidadStock,
            codigoColor: ajuste.codigoColor,
            codigoTalla01: ajuste.codigoTalla01
          }
        );

        const ubicacionValidaResult = await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('codigoAlmacen', sql.VarChar, ajusteDestino.codigoAlmacen)
          .input('ubicacion', sql.VarChar, ajusteDestino.ubicacionStr)
          .query(`
            SELECT COUNT(*) AS EsValida FROM Ubicaciones
            WHERE CodigoEmpresa=@codigoEmpresa AND CodigoAlmacen=@codigoAlmacen AND Ubicacion=@ubicacion
          `);

        if ((ubicacionValidaResult.recordset[0]?.EsValida || 0) === 0 && ajusteDestino.ubicacionStr !== 'SIN-UBICACION')
          throw crearErrorInventario(400, `La ubicación ${ajusteDestino.ubicacionStr} no pertenece al almacén ${ajusteDestino.codigoAlmacen}.`);

        const esEdicion = Boolean(ajuste.combinacionOriginal);
        const mismaCombinacion = esMismaCombinacionInventario(ajusteOrigen, ajusteDestino);
        const registroOrigen = await obtenerRegistroVigenteAcumuladoStockUbicacionExacto(codigoEmpresa, ajusteOrigen, transaction);
        const registroDestino = await obtenerRegistroVigenteAcumuladoStockUbicacionExacto(codigoEmpresa, ajusteDestino, transaction);
        const ubicacionPrincipal = await obtenerUbicacionPrincipal(codigoEmpresa, ejercicio, ajusteDestino.articulo, ajusteDestino.codigoAlmacen, transaction);

        if (!esEdicion && registroDestino)
          throw crearErrorInventario(409, 'Ese artículo/variante ya existe. Edítalo manualmente desde el listado.');

        if (esEdicion && !registroOrigen && !mismaCombinacion)
          throw crearErrorInventario(409, 'No se encontró la combinación origen para editar el inventario.');

        if (esEdicion && !mismaCombinacion) {
          const cantidadAnteriorOrigen = parseFloat(registroOrigen?.UnidadSaldo ?? 0);
          const cantidadDestinoActual = parseFloat(registroDestino?.UnidadSaldo ?? 0);
          const cantidadFinalDestino = cantidadDestinoActual + ajusteDestino.nuevaCantidad;

          await eliminarCombinacionVigenteAcumuladoStockUbicacion(codigoEmpresa, ajusteOrigen, ejercicio, transaction);
          await upsertAcumuladoStockUbicacion(ajusteDestino, cantidadFinalDestino, codigoEmpresa, ejercicio, transaction);

          const deltaOrigen = -cantidadAnteriorOrigen;
          const deltaDestino = ajusteDestino.nuevaCantidad;

          if (Math.abs(deltaOrigen) > 0.001)
            await aplicarDeltaEnAcumuladoStock(codigoEmpresa, ejercicio, ajusteOrigen.articulo, ajusteOrigen.codigoAlmacen,
              ubicacionPrincipal, ajusteOrigen.unidadStock, ajusteOrigen.partida, ajusteOrigen.codigoColor, ajusteOrigen.codigoTalla01, deltaOrigen, transaction);
          if (Math.abs(deltaDestino) > 0.001)
            await aplicarDeltaEnAcumuladoStock(codigoEmpresa, ejercicio, ajusteDestino.articulo, ajusteDestino.codigoAlmacen,
              ubicacionPrincipal, ajusteDestino.unidadStock, ajusteDestino.partida, ajusteDestino.codigoColor, ajusteDestino.codigoTalla01, deltaDestino, transaction);

          await registrarMovimientoInventario({
            codigoEmpresa, ejercicio, usuarioInventario, codigoClienteUsuario,
            ajuste: { ...ajusteDestino, nuevaCantidad: cantidadFinalDestino },
            unidades: ajusteDestino.nuevaCantidad,
            comentario: registroDestino ? `Inventario: fusion de variante` : `Inventario: cambio de variante`
          }, transaction);
          continue;
        }

        // Para SIN-UBICACION siempre calculamos cantidadAnterior con SUM de TODOS los ejercicios
        // ya que pueden existir filas en múltiples ejercicios que sumen el total real
        let cantidadAnterior = parseFloat(registroOrigen?.UnidadSaldo ?? registroDestino?.UnidadSaldo ?? 0);
        if (ajusteDestino.ubicacionStr === 'SIN-UBICACION') {
          const stockActualResult = await new sql.Request(transaction)
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('codigoArticulo', sql.VarChar, ajusteDestino.articulo)
            .input('codigoAlmacen', sql.VarChar, ajusteDestino.codigoAlmacen)
            .input('tipoUnidad', sql.VarChar, ajusteDestino.unidadStock || '')
            .input('partida', sql.VarChar, ajusteDestino.partida || '')
            .input('codigoColor', sql.VarChar, ajusteDestino.codigoColor || '')
            .input('codigoTalla', sql.VarChar, ajusteDestino.codigoTalla01 || '')
            .query(`
              SELECT SUM(COALESCE(UnidadSaldoTipo_,UnidadSaldo,0)) AS StockActual
              FROM AcumuladoStock
              WHERE CodigoEmpresa=@codigoEmpresa
                AND CodigoArticulo=@codigoArticulo
                AND CodigoAlmacen=@codigoAlmacen
                AND Periodo=99
                AND ISNULL(TipoUnidadMedida_,'')=@tipoUnidad
                AND ISNULL(Partida,'')=@partida
                AND ISNULL(CodigoColor_,'')=@codigoColor
                AND ISNULL(CodigoTalla01_,'')=@codigoTalla
            `);
          cantidadAnterior = parseFloat(stockActualResult.recordset[0]?.StockActual ?? 0);
        }

        const delta = ajusteDestino.nuevaCantidad - cantidadAnterior;

        await upsertAcumuladoStockUbicacion(ajusteDestino, ajusteDestino.nuevaCantidad, codigoEmpresa, ejercicio, transaction);

        // SIN-UBICACION puede tener múltiples filas en distintos ejercicios que sumen el total.
        // En lugar de aplicar un delta (que solo toca una fila), consolidamos todas a 0
        // y ponemos el valor correcto en una sola fila.
        if (ajusteDestino.ubicacionStr === 'SIN-UBICACION') {
          await consolidarAcumuladoStockSinUbicacion(
            codigoEmpresa, ejercicio, ajusteDestino.articulo, ajusteDestino.codigoAlmacen,
            ajusteDestino.unidadStock, ajusteDestino.partida, ajusteDestino.codigoColor, ajusteDestino.codigoTalla01,
            ajusteDestino.nuevaCantidad, transaction
          );
        } else if (Math.abs(delta) > 0.001) {
          await aplicarDeltaEnAcumuladoStock(codigoEmpresa, ejercicio, ajusteDestino.articulo, ajusteDestino.codigoAlmacen,
            ubicacionPrincipal, ajusteDestino.unidadStock, ajusteDestino.partida, ajusteDestino.codigoColor, ajusteDestino.codigoTalla01, delta, transaction);
        }

        await registrarMovimientoInventario({
          codigoEmpresa, ejercicio, usuarioInventario, codigoClienteUsuario,
          ajuste: ajusteDestino,
          unidades: delta,
          comentario: esEdicion ? 'Inventario: edicion manual' : 'Inventario: nuevo ajuste manual'
        }, transaction);
      }

      await transaction.commit();
      return res.json({ success: true, mensaje: `Ajustes realizados correctamente. ${ajustes.length} ubicaciones actualizadas.` });
    } catch (error) {
      try { if (!transaction._aborted) await transaction.rollback(); } catch (e) { console.error('[ERROR ROLLBACK]', e); }
      res.status(error.statusCode || 500).json({
        success: false,
        mensaje: error.publicMessage || 'Error al realizar los ajustes',
        error: error.message
      });
    }
  });

  async function upsertAcumuladoStockUbicacion(ajuste, nuevaCantidad, codigoEmpresa, ejercicio, transaction) {
    const { articulo, codigoAlmacen, ubicacionStr, partida, unidadStock, codigoColor, codigoTalla01 } = ajuste;
    const ubicacionNorm = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
    const unidadNorm = (unidadStock === 'unidades' ? '' : unidadStock || '');

    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('ubicacion', sql.VarChar, ubicacionNorm)
      .input('tipoUnidad', sql.VarChar, unidadNorm)
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
      .query(`
        DELETE FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa=@codigoEmpresa AND Ejercicio=@ejercicio AND CodigoAlmacen=@codigoAlmacen
          AND CodigoArticulo=@codigoArticulo AND Ubicacion=@ubicacion
          AND ISNULL(TipoUnidadMedida_,'')=@tipoUnidad AND ISNULL(Partida,'')=@partida
          AND ISNULL(CodigoColor_,'')=@codigoColor AND ISNULL(CodigoTalla01_,'')=@codigoTalla
          AND Periodo=99
      `);

    if (Math.abs(nuevaCantidad) > 0.001) {
      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.Int, ejercicio)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('ubicacion', sql.VarChar, ubicacionNorm)
        .input('codigoArticulo', sql.VarChar, articulo)
        .input('tipoUnidad', sql.VarChar, unidadNorm)
        .input('partida', sql.VarChar, partida || '')
        .input('codigoColor', sql.VarChar, codigoColor || '')
        .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
        .input('valor', sql.Decimal(18, 4), nuevaCantidad)
        .query(`
          INSERT INTO AcumuladoStockUbicacion (
            CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
            CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
            UnidadSaldo, UnidadSaldoTipo_, Periodo
          ) VALUES (
            @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
            @codigoArticulo, @tipoUnidad, @partida, @codigoColor, @codigoTalla,
            @valor, @valor, 99
          )
        `);
    }
  }

  router.get('/inventario/ubicaciones-ajuste', async (req, res) => {
    const codigoEmpresa = req.user.CodigoEmpresa;
    const { codigoAlmacen, search = '', offset = '0', limit = '50' } = req.query;
    if (!codigoEmpresa || !codigoAlmacen)
      return res.status(400).json({ success: false, mensaje: 'Código de empresa y almacén requeridos.' });

    const searchValue = typeof search === 'string' ? search.trim() : '';
    const offsetValue = Math.max(parseInt(offset, 10) || 0, 0);
    const limitValue = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

    try {
      const result = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('search', sql.VarChar, searchValue ? `%${searchValue}%` : null)
        .input('offset', sql.Int, offsetValue)
        .input('fetchLimit', sql.Int, limitValue + 1)
        .query(`
          SELECT u.Ubicacion, COALESCE(u.DescripcionUbicacion,'') AS DescripcionUbicacion
          FROM Ubicaciones u
          WHERE u.CodigoEmpresa=@codigoEmpresa AND u.CodigoAlmacen=@codigoAlmacen
            AND (@search IS NULL OR u.Ubicacion LIKE @search OR COALESCE(u.DescripcionUbicacion,'') LIKE @search)
          ORDER BY u.Ubicacion
          OFFSET @offset ROWS FETCH NEXT @fetchLimit ROWS ONLY
        `);
      const rows = Array.isArray(result.recordset) ? result.recordset : [];
      const hasMore = rows.length > limitValue;
      const items = hasMore ? rows.slice(0, limitValue) : rows;
      res.json({ items, hasMore, nextOffset: hasMore ? offsetValue + items.length : null });
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener ubicaciones.', error: err.message });
    }
  });

  router.get('/ubicaciones-por-almacen/:codigoAlmacen', async (req, res) => {
    const { codigoAlmacen } = req.params;
    const codigoEmpresa = req.user.CodigoEmpresa;
    try {
      const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
      const result = await agregarContextoInventario(
        getPool().request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('codigoAlmacen', sql.VarChar, codigoAlmacen),
        contexto
      ).query(`
        ${getCteInventarioActual()}
        SELECT
          u.Ubicacion, COALESCE(u.DescripcionUbicacion,'') AS DescripcionUbicacion,
          COUNT(DISTINCT s.CodigoArticulo) AS CantidadArticulos
        FROM Ubicaciones u
        LEFT JOIN StockUbicacionActual s ON s.CodigoEmpresa=u.CodigoEmpresa AND s.CodigoAlmacen=u.CodigoAlmacen
          AND s.Ubicacion=u.Ubicacion AND s.UnidadSaldo>0
        WHERE u.CodigoEmpresa=@codigoEmpresa AND u.CodigoAlmacen=@codigoAlmacen
        GROUP BY u.Ubicacion, u.DescripcionUbicacion
        ORDER BY u.Ubicacion
      `);
      res.json(result.recordset);
    } catch (err) {
      res.status(500).json({ success: false, mensaje: 'Error al obtener ubicaciones por almacén.', error: err.message });
    }
  });

  function normalizarAjusteInventario(ajuste = {}) {
    return {
      articulo: ajuste.articulo,
      descripcionArticulo: ajuste.descripcionArticulo || '',
      codigoAlmacen: ajuste.codigoAlmacen,
      ubicacionStr: ajuste.ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : (ajuste.ubicacionStr || 'SIN-UBICACION'),
      partida: ajuste.partida || '',
      unidadStock: (!ajuste.unidadStock || ajuste.unidadStock === 'unidades') ? '' : ajuste.unidadStock,
      nuevaCantidad: parseFloat(ajuste.nuevaCantidad) || 0,
      codigoColor: ajuste.codigoColor || '',
      codigoTalla01: ajuste.codigoTalla01 || ''
    };
  }

  function esMismaCombinacionInventario(origen, destino) {
    return (
      origen.articulo === destino.articulo &&
      origen.codigoAlmacen === destino.codigoAlmacen &&
      origen.ubicacionStr === destino.ubicacionStr &&
      (origen.partida || '') === (destino.partida || '') &&
      (origen.unidadStock || '') === (destino.unidadStock || '') &&
      (origen.codigoColor || '') === (destino.codigoColor || '') &&
      (origen.codigoTalla01 || '') === (destino.codigoTalla01 || '')
    );
  }

  function crearErrorInventario(statusCode, publicMessage) {
    const error = new Error(publicMessage);
    error.statusCode = statusCode;
    error.publicMessage = publicMessage;
    return error;
  }

  async function obtenerRegistroVigenteAcumuladoStockUbicacionExacto(codigoEmpresa, ajuste, transaction) {
    const result = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, ajuste.articulo)
      .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
      .input('ubicacion', sql.VarChar, ajuste.ubicacionStr)
      .input('tipoUnidad', sql.VarChar, ajuste.unidadStock || '')
      .input('partida', sql.VarChar, ajuste.partida || '')
      .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
      .input('codigoTalla', sql.VarChar, ajuste.codigoTalla01 || '')
      .query(`
        SELECT TOP 1 Ejercicio, Periodo, UnidadSaldo, UnidadSaldoTipo_,
          CodigoArticulo, CodigoAlmacen, Ubicacion, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
        FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa=@codigoEmpresa AND CodigoArticulo=@codigoArticulo
          AND CodigoAlmacen=@codigoAlmacen AND Ubicacion=@ubicacion
          AND ISNULL(TipoUnidadMedida_,'')=@tipoUnidad AND ISNULL(Partida,'')=@partida
          AND ISNULL(CodigoColor_,'')=@codigoColor AND ISNULL(CodigoTalla01_,'')=@codigoTalla
          AND Periodo=99
        ORDER BY Ejercicio DESC
      `);
    return result.recordset[0] || null;
  }

  async function eliminarCombinacionVigenteAcumuladoStockUbicacion(codigoEmpresa, ajuste, ejercicio, transaction) {
    const ubicacionNorm = ajuste.ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ajuste.ubicacionStr;
    const unidadNorm = (ajuste.unidadStock === 'unidades' ? '' : ajuste.unidadStock || '');
    // Borramos TODOS los ejercicios para la combinación, no solo el ejercicioActual.
    // Si estamos en cambio de año el registro puede vivir en ejercicioBase (año anterior)
    // y filtrar por @ejercicio lo dejaría huérfano sin borrar.
    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, ajuste.articulo)
      .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacionNorm)
      .input('tipoUnidad', sql.VarChar, unidadNorm)
      .input('partida', sql.VarChar, ajuste.partida || '')
      .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
      .input('codigoTalla', sql.VarChar, ajuste.codigoTalla01 || '')
      .query(`
        DELETE FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa=@codigoEmpresa
          AND CodigoArticulo=@codigoArticulo AND CodigoAlmacen=@codigoAlmacen AND Ubicacion=@ubicacion
          AND ISNULL(TipoUnidadMedida_,'')=@tipoUnidad AND ISNULL(Partida,'')=@partida
          AND ISNULL(CodigoColor_,'')=@codigoColor AND ISNULL(CodigoTalla01_,'')=@codigoTalla
          AND Periodo=99
      `);
  }

  function sanitizeString(value, maxLength = 0) {
    if (value === null || value === undefined) return '';
    let str = String(value).trim();
    if (str === 'null' || str === 'undefined') return '';
    str = str.replace(/[,;'"\n\r\t]/g, '').trim();
    if (maxLength > 0 && str.length > maxLength) str = str.slice(0, maxLength);
    return str;
  }

  // FIX PRINCIPAL: UsuarioProceso es smallint → no se puede usar con string de usuario.
  // Se guarda el usuario en CodigoCliente (varchar) y en el Comentario.
  // UsuarioProceso se omite del INSERT.
  async function registrarMovimientoInventario(payload, transaction) {
    const ahora = new Date();
    const periodo = ahora.getMonth() + 1;
    const codigoArticulo = sanitizeString(payload.ajuste.articulo, 20);
    const codigoAlmacen = sanitizeString(payload.ajuste.codigoAlmacen, 4);
    const ubicacion = sanitizeString(payload.ajuste.ubicacionStr, 15);
    const unidadMedida = sanitizeString(payload.ajuste.unidadStock || '', 10);
    const partida = sanitizeString(payload.ajuste.partida || '', 15);
    const codigoColor = sanitizeString(payload.ajuste.codigoColor || '', 10);
    const codigoTalla = sanitizeString(payload.ajuste.codigoTalla01 || '', 10);
    // CodigoCliente es varchar — guardamos el código del cliente (ej: '0034')
    const codigoCliente = sanitizeString(payload.codigoClienteUsuario || '', 20);
    const unidades = typeof payload.unidades === 'number' ? payload.unidades : parseFloat(payload.unidades) || 0;
    // El nombre de usuario va en el comentario para trazabilidad
    let comentarioBase = `${payload.comentario} por ${payload.usuarioInventario}`;
    comentarioBase = sanitizeString(comentarioBase, 0);
    const comentario = comentarioBase.length > 40 ? comentarioBase.slice(0, 37) + '...' : comentarioBase;

    try {
      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, payload.codigoEmpresa)
        .input('ejercicio', sql.SmallInt, payload.ejercicio)
        .input('periodo', sql.SmallInt, periodo)
        .input('fecha', sql.Date, ahora)
        .input('fechaRegistro', sql.DateTime, ahora)
        .input('tipoMovimiento', sql.TinyInt, 5)
        .input('codigoArticulo', sql.VarChar(20), codigoArticulo)
        .input('codigoAlmacen', sql.VarChar(4), codigoAlmacen)
        .input('ubicacion', sql.VarChar(15), ubicacion)
        .input('unidades', sql.Decimal(18, 4), unidades)
        .input('comentario', sql.VarChar(40), comentario)
        .input('codigoCliente', sql.VarChar(20), codigoCliente)
        .input('unidadMedida1', sql.VarChar(10), unidadMedida)
        .input('partida', sql.VarChar(15), partida)
        .input('codigoColor', sql.VarChar(10), codigoColor)
        .input('codigoTalla01', sql.VarChar(10), codigoTalla)
        .query(`
          INSERT INTO MovimientoStock (
            CodigoEmpresa, Ejercicio, Periodo, Fecha, FechaRegistro, TipoMovimiento,
            CodigoArticulo, CodigoAlmacen, Ubicacion, Unidades, Comentario,
            CodigoCliente, UnidadMedida1_, Partida, CodigoColor_, CodigoTalla01_
          ) VALUES (
            @codigoEmpresa, @ejercicio, @periodo, @fecha, @fechaRegistro, @tipoMovimiento,
            @codigoArticulo, @codigoAlmacen, @ubicacion, @unidades, @comentario,
            @codigoCliente, @unidadMedida1, @partida, @codigoColor, @codigoTalla01
          )
        `);
    } catch (error) {
      throw new Error(`No se pudo registrar el movimiento de inventario: ${error.message}`);
    }
  }

  router.iniciarSincronizacionAutomatica = iniciarSincronizacionAutomatica;
  return router;
};