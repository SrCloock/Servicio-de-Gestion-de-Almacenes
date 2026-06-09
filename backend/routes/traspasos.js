const express = require('express');

module.exports = function createtraspasosRouter({ sql, getPool, clienteConfig }) {
  const router = express.Router();

  // ── Helper: verificar permiso de pantalla ──────────────────────────────
  async function verificarPermiso(usuario, codigoEmpresa) {
    const result = await getPool().request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador, StatusUsuarioAvanzado, StatusVerTraspasosAlmacen
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
      `);
    if (result.recordset.length === 0) return false;
    const u = result.recordset[0];
    return u.StatusAdministrador === -1 || u.StatusUsuarioAvanzado === -1 || u.StatusVerTraspasosAlmacen === -1;
  }



  // ============================================================
  // HELPERS
  // ============================================================
  function parseNumero(valor) {
    if (valor === undefined || valor === null) return NaN;
    const str = String(valor).trim().replace(',', '.');
    return parseFloat(str);
  }

  function normalizarUnidadMedida(unidad) {
    if (!unidad) return '';
    const lower = String(unidad).toLowerCase();
    if (lower === 'unidades' || lower === 'unidad') return '';
    return String(unidad);
  }

  function validarUser(req, res, next) {
    if (!req.user || !req.user.CodigoEmpresa) {
      return res.status(401).json({ success: false, mensaje: 'No autorizado. Usuario no identificado.' });
    }
    next();
  }

  // ============================================================
  // CONTEXTO DE STOCK — solo periodo 99
  // ============================================================
  async function obtenerContextoStockArticulo(codigoEmpresa, codigoArticulo) {
    const ejercicioActual = new Date().getFullYear();
    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        WITH ContextosUbicacion AS (
          SELECT Ejercicio,
            COUNT(*) AS TotalRegistros,
            COUNT(DISTINCT CONCAT(
              ISNULL(CodigoAlmacen, ''), '|', ISNULL(Ubicacion, ''), '|',
              ISNULL(TipoUnidadMedida_, ''), '|', ISNULL(Partida, ''), '|',
              ISNULL(CodigoColor_, ''), '|', ISNULL(CodigoTalla01_, '')
            )) AS TotalOrigenes,
            SUM(ABS(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0))) AS MagnitudStock
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo
            AND Periodo = 99 AND (COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) <> 0)
          GROUP BY Ejercicio
        ),
        FallbackStock AS (
          SELECT TOP 1 Ejercicio FROM AcumuladoStock
          WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo
            AND Periodo = 99
          ORDER BY Ejercicio DESC
        )
        SELECT TOP 1 COALESCE(cu.Ejercicio, fs.Ejercicio) AS Ejercicio
        FROM (SELECT NULL AS dummy) x
        LEFT JOIN ContextosUbicacion cu ON 1=1
        LEFT JOIN FallbackStock fs ON 1=1
        ORDER BY
          CASE WHEN cu.Ejercicio IS NOT NULL THEN 0 ELSE 1 END,
          cu.TotalOrigenes DESC, cu.TotalRegistros DESC, cu.MagnitudStock DESC, cu.Ejercicio DESC
      `);

    const contexto = result.recordset[0];
    return {
      ejercicioBase: contexto?.Ejercicio || ejercicioActual,
      ejercicioActual
    };
  }

  // ============================================================
  // APLICAR DELTA EN AcumuladoStock (periodo 99)
  // Solo se llama cuando el traspaso es entre almacenes distintos.
  // Aplica +delta o -delta sobre el registro existente.
  // Si no existe, lo crea (primer movimiento del año).
  // ============================================================
  async function aplicarDeltaEnAcumuladoStock(
    transaction, codigoEmpresa, ejercicio,
    codigoAlmacen, codigoArticulo,
    tipoUnidadMedida, partida, codigoColor, codigoTalla01,
    delta, ubicacionPrincipal
  ) {
    const updateResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('tipoUnidad', sql.VarChar, tipoUnidadMedida || '')
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
      .input('delta', sql.Decimal(18, 4), delta)
      .query(`
        UPDATE AcumuladoStock
        SET
          UnidadSaldo      = UnidadSaldo      + @delta,
          UnidadSaldoTipo_ = UnidadSaldoTipo_ + @delta
        WHERE IdAcumuladoStock = (
          SELECT TOP 1 IdAcumuladoStock FROM AcumuladoStock
          WHERE CodigoEmpresa = @codigoEmpresa
            AND Ejercicio     = @ejercicio
            AND CodigoAlmacen = @codigoAlmacen
            AND CodigoArticulo = @codigoArticulo
            AND Periodo = 99
            AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
            AND ISNULL(Partida, '')           = @partida
            AND ISNULL(CodigoColor_, '')      = @codigoColor
            AND ISNULL(CodigoTalla01_, '')    = @codigoTalla
          ORDER BY Ejercicio DESC
        )
      `);

    const filas = updateResult.rowsAffected?.[0] || 0;

    if (filas === 0) {
      // No existe el registro periodo 99 → crearlo con el delta como valor inicial
      console.log(`[TRASPASO DELTA] No existe periodo99 en AcumuladoStock para ${codigoArticulo}/${codigoAlmacen}, creando...`);
      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.Int, ejercicio)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .input('ubicacion', sql.VarChar, ubicacionPrincipal || '')
        .input('tipoUnidad', sql.VarChar, tipoUnidadMedida || '')
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

    console.log(`[TRASPASO DELTA] AcumuladoStock ${codigoArticulo}/${codigoAlmacen}: delta=${delta}, filas=${filas}`);
  }

  // ============================================================
  // VALIDAR UBICACIÓN PERTENECE AL ALMACÉN
  // ============================================================
  async function validarUbicacionAlmacen(codigoEmpresa, codigoAlmacen, ubicacion, transaction = null) {
    // Ubicación vacía es un artefacto de datos (error humano), se permite pasar sin validar contra tabla Ubicaciones
    if (!ubicacion || ubicacion === 'SIN-UBICACION' || ubicacion === 'SIN UBICACIÓN' || ubicacion === '') {
      return true;
    }

    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacion)
      .query(`
        SELECT COUNT(*) AS EsValida
        FROM Ubicaciones
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoAlmacen = @codigoAlmacen
          AND Ubicacion = @ubicacion
      `);

    return (result.recordset[0]?.EsValida || 0) > 0;
  }

  // ============================================================
  // ENDPOINT: ALMACENES
  // ============================================================
  router.get('/almacenes', validarUser, async (req, res) => {
    const codigoEmpresa = req.user.CodigoEmpresa;
    try {
      const result = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          SELECT CodigoAlmacen, Almacen
          FROM Almacenes
          WHERE CodigoEmpresa = @codigoEmpresa
            ${clienteConfig.almacenesPermitidos.length > 0
              ? `AND CodigoAlmacen IN (${clienteConfig.almacenesPermitidos.map(a => `'${a}'`).join(', ')})`
              : '-- sin filtro de almacenes: se muestran todos'
            }
        `);
      res.json(result.recordset);
    } catch (err) {
      console.error('[ERROR ALMACENES]', err);
      res.status(500).json({ success: false, mensaje: 'Error al obtener almacenes.', error: err.message });
    }
  });

  // ============================================================
  // ENDPOINT: UBICACIONES COMPLETAS (paginado)
  // Solo devuelve ubicaciones válidas del almacén indicado.
  // ============================================================
  router.get('/ubicaciones-completas', validarUser, async (req, res) => {
    const {
      codigoAlmacen,
      excluirUbicacion,
      incluirSinUbicacion = 'true',
      search = '',
      offset = '0',
      limit = '50'
    } = req.query;
    const codigoEmpresa = req.user.CodigoEmpresa;

    if (!codigoAlmacen) {
      return res.status(400).json({ success: false, mensaje: 'Código de almacén requerido.' });
    }

    try {
      const searchValue = typeof search === 'string' ? search.trim() : '';
      const offsetValue = Math.max(parseInt(offset, 10) || 0, 0);
      const limitValue = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

      const request = getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('search', sql.VarChar, searchValue ? `%${searchValue}%` : null)
        .input('offset', sql.Int, offsetValue)
        .input('fetchLimit', sql.Int, limitValue + 1)
        .input('includeSinUbicacion', sql.Bit, incluirSinUbicacion === 'true');

      if (excluirUbicacion) {
        request.input('excluirUbicacion', sql.VarChar, excluirUbicacion);
      }

      const query = `
        WITH UbicacionesBase AS (
          SELECT
            u.Ubicacion,
            u.DescripcionUbicacion,
            'NORMAL' AS TipoUbicacion,
            (
              SELECT COUNT(DISTINCT s.CodigoArticulo)
              FROM AcumuladoStockUbicacion s
              WHERE s.CodigoEmpresa = u.CodigoEmpresa
                AND s.CodigoAlmacen = u.CodigoAlmacen
                AND s.Ubicacion = u.Ubicacion
                AND s.Periodo = 99
                AND COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) > 0
            ) AS CantidadArticulos
          FROM Ubicaciones u
          WHERE u.CodigoEmpresa = @codigoEmpresa
            AND u.CodigoAlmacen = @codigoAlmacen
            AND (@search IS NULL
              OR u.Ubicacion LIKE @search
              OR COALESCE(u.DescripcionUbicacion, '') LIKE @search)
            ${excluirUbicacion ? 'AND u.Ubicacion <> @excluirUbicacion' : ''}
        ),
        UbicacionesConVirtual AS (
          SELECT * FROM UbicacionesBase
          UNION ALL
          SELECT
            'SIN-UBICACION' AS Ubicacion,
            'Stock sin ubicación asignada' AS DescripcionUbicacion,
            'SIN_UBICACION' AS TipoUbicacion,
            (
              SELECT COUNT(DISTINCT s.CodigoArticulo)
              FROM AcumuladoStock s
              LEFT JOIN AcumuladoStockUbicacion su
                ON su.CodigoEmpresa = s.CodigoEmpresa
                AND su.CodigoAlmacen = s.CodigoAlmacen
                AND su.CodigoArticulo = s.CodigoArticulo
                AND ISNULL(su.TipoUnidadMedida_, '') = ISNULL(s.TipoUnidadMedida_, '')
                AND ISNULL(su.Partida, '') = ISNULL(s.Partida, '')
                AND ISNULL(su.CodigoColor_, '') = ISNULL(s.CodigoColor_, '')
                AND ISNULL(su.CodigoTalla01_, '') = ISNULL(s.CodigoTalla01_, '')
                AND su.Periodo = 99
                AND COALESCE(su.UnidadSaldoTipo_, su.UnidadSaldo, 0) > 0
              WHERE s.CodigoEmpresa = @codigoEmpresa
                AND s.CodigoAlmacen = @codigoAlmacen
                AND s.Periodo = 99
                AND COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) > 0
                AND su.CodigoArticulo IS NULL
            ) AS CantidadArticulos
          WHERE @includeSinUbicacion = 1
            AND (@search IS NULL
              OR 'SIN-UBICACION' LIKE @search
              OR 'Stock sin ubicación asignada' LIKE @search)
            ${excluirUbicacion ? "AND 'SIN-UBICACION' <> @excluirUbicacion" : ''}
        )
        SELECT Ubicacion, DescripcionUbicacion, TipoUbicacion, CantidadArticulos
        FROM UbicacionesConVirtual
        ORDER BY Ubicacion
        OFFSET @offset ROWS FETCH NEXT @fetchLimit ROWS ONLY
      `;

      const result = await request.query(query);
      const rows = Array.isArray(result.recordset) ? result.recordset : [];
      const hasMore = rows.length > limitValue;
      const items = hasMore ? rows.slice(0, limitValue) : rows;

      res.json({ items, hasMore, nextOffset: hasMore ? offsetValue + items.length : null });
    } catch (err) {
      console.error('[ERROR UBICACIONES COMPLETAS]', err);
      res.status(500).json({ success: false, mensaje: 'Error al obtener ubicaciones.', error: err.message });
    }
  });

  // ============================================================
  // ENDPOINT: STOCK POR ARTÍCULO (para selector de traspaso)
  // Filtra ubicaciones inválidas con INNER JOIN Ubicaciones.
  // Solo periodo 99.
  // ============================================================
  router.get('/traspasos/stock-por-articulo', validarUser, async (req, res) => {
    const { codigoArticulo } = req.query;
    const codigoEmpresa = req.user.CodigoEmpresa;

    if (!codigoArticulo) {
      return res.status(400).json({ success: false, mensaje: 'Código de artículo requerido' });
    }

    try {
      const contexto = await obtenerContextoStockArticulo(codigoEmpresa, codigoArticulo);

      const query = `
        -- UbicacionesPrincipales: la ubicación principal de cada almacén según AcumuladoStock
        WITH UbicacionesPrincipales AS (
          SELECT CodigoAlmacen, Ubicacion
          FROM AcumuladoStock
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoArticulo = @codigoArticulo
            AND Periodo = 99
            AND Ejercicio IN (@ejercicioBase, @ejercicioActual)
        )

        -- Stock con ubicación válida (periodo 99)
        SELECT
          s.CodigoEmpresa,
          s.CodigoArticulo,
          a.DescripcionArticulo,
          s.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          s.Ubicacion,
          u.DescripcionUbicacion,
          ISNULL(NULLIF(LTRIM(RTRIM(s.TipoUnidadMedida_)), ''), 'unidades') AS UnidadStock,
          CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18,4)) AS Cantidad,
          s.Partida,
          s.CodigoColor_,
          s.CodigoTalla01_ AS Talla,
          a.UnidadMedida2_ AS UnidadBase,
          a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          a.FactorConversion_ AS FactorConversion,
          0 AS EsSinUbicacion,
          -- ✅ Marcar si esta ubicación es la principal del almacén
          CASE WHEN up.Ubicacion = s.Ubicacion THEN 1 ELSE 0 END AS EsUbicacionPrincipal,
          -- ✅ Ubicación principal del almacén (para preseleccionar destino)
          up.Ubicacion AS UbicacionPrincipalAlmacen
        FROM AcumuladoStockUbicacion s
        -- ✅ FILTRO: solo ubicaciones que pertenecen al almacén correcto
        INNER JOIN Ubicaciones uv
          ON uv.CodigoEmpresa = s.CodigoEmpresa
          AND uv.CodigoAlmacen = s.CodigoAlmacen
          AND uv.Ubicacion = s.Ubicacion
        LEFT JOIN Articulos a
          ON a.CodigoEmpresa = s.CodigoEmpresa
          AND a.CodigoArticulo = s.CodigoArticulo
        LEFT JOIN Almacenes alm
          ON alm.CodigoEmpresa = s.CodigoEmpresa
          AND alm.CodigoAlmacen = s.CodigoAlmacen
        LEFT JOIN Ubicaciones u
          ON u.CodigoEmpresa = s.CodigoEmpresa
          AND u.CodigoAlmacen = s.CodigoAlmacen
          AND u.Ubicacion = s.Ubicacion
        LEFT JOIN UbicacionesPrincipales up
          ON up.CodigoAlmacen = s.CodigoAlmacen
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.CodigoArticulo = @codigoArticulo
          AND s.Periodo = 99
          AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
          AND COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) > 0

        UNION ALL

        -- Stock sin ubicación: aparece en AcumuladoStock pero no tiene desglose en AcumuladoStockUbicacion
        SELECT
          s.CodigoEmpresa,
          s.CodigoArticulo,
          a.DescripcionArticulo,
          s.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          'SIN-UBICACION' AS Ubicacion,
          'Stock sin ubicación asignada' AS DescripcionUbicacion,
          ISNULL(NULLIF(LTRIM(RTRIM(s.TipoUnidadMedida_)), ''), 'unidades') AS UnidadStock,
          CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18,4)) AS Cantidad,
          s.Partida,
          s.CodigoColor_,
          s.CodigoTalla01_ AS Talla,
          a.UnidadMedida2_ AS UnidadBase,
          a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          a.FactorConversion_ AS FactorConversion,
          1 AS EsSinUbicacion,
          1 AS EsUbicacionPrincipal,
          'SIN-UBICACION' AS UbicacionPrincipalAlmacen
        FROM AcumuladoStock s
        LEFT JOIN Articulos a
          ON a.CodigoEmpresa = s.CodigoEmpresa
          AND a.CodigoArticulo = s.CodigoArticulo
        LEFT JOIN Almacenes alm
          ON alm.CodigoEmpresa = s.CodigoEmpresa
          AND alm.CodigoAlmacen = s.CodigoAlmacen
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.CodigoArticulo = @codigoArticulo
          AND s.Periodo = 99
          AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
          AND COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) > 0
          AND NOT EXISTS (
            SELECT 1
            FROM AcumuladoStockUbicacion sub
            INNER JOIN Ubicaciones uv
              ON uv.CodigoEmpresa = sub.CodigoEmpresa
              AND uv.CodigoAlmacen = sub.CodigoAlmacen
              AND uv.Ubicacion = sub.Ubicacion
            WHERE sub.CodigoEmpresa = s.CodigoEmpresa
              AND sub.CodigoAlmacen = s.CodigoAlmacen
              AND sub.CodigoArticulo = s.CodigoArticulo
              AND ISNULL(sub.TipoUnidadMedida_, '') = ISNULL(s.TipoUnidadMedida_, '')
              AND ISNULL(sub.Partida, '')        = ISNULL(s.Partida, '')
              AND ISNULL(sub.CodigoColor_, '')   = ISNULL(s.CodigoColor_, '')
              AND ISNULL(sub.CodigoTalla01_, '') = ISNULL(s.CodigoTalla01_, '')
              AND sub.Periodo = 99
              AND COALESCE(sub.UnidadSaldoTipo_, sub.UnidadSaldo, 0) > 0
          )

        ORDER BY CodigoAlmacen, EsUbicacionPrincipal DESC, Cantidad DESC
      `;

      const result = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .input('ejercicioBase', sql.SmallInt, contexto.ejercicioBase)
        .input('ejercicioActual', sql.SmallInt, contexto.ejercicioActual)
        .query(query);

      res.json(result.recordset);
    } catch (error) {
      console.error('[ERROR STOCK POR ARTICULO TRASPASOS]', error);
      res.status(500).json({ success: false, mensaje: 'Error al obtener stock para traspasos', error: error.message });
    }
  });

  // ============================================================
  // ENDPOINT: UBICACIÓN PRINCIPAL DE UN ARTÍCULO EN UN ALMACÉN
  // GET /traspasos/ubicacion-principal?codigoArticulo=X&codigoAlmacen=Y
  // ============================================================
  router.get('/traspasos/ubicacion-principal', validarUser, async (req, res) => {
    const { codigoArticulo, codigoAlmacen } = req.query;
    const codigoEmpresa = req.user.CodigoEmpresa;
    const ejercicioActual = new Date().getFullYear();

    if (!codigoArticulo || !codigoAlmacen) {
      return res.status(400).json({ success: false, mensaje: 'codigoArticulo y codigoAlmacen requeridos.' });
    }

    try {
      const result = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('ejercicioActual', sql.SmallInt, ejercicioActual)
        .query(`
          SELECT TOP 1 Ubicacion
          FROM AcumuladoStock
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoArticulo = @codigoArticulo
            AND CodigoAlmacen = @codigoAlmacen
            AND Periodo = 99
            AND Ejercicio = @ejercicioActual
          ORDER BY Ejercicio DESC
        `);

      const ubicacion = result.recordset[0]?.Ubicacion || null;
      res.json({ ubicacion });
    } catch (err) {
      console.error('[ERROR UBICACION PRINCIPAL]', err);
      res.status(500).json({ success: false, mensaje: 'Error al obtener ubicacion principal.', error: err.message });
    }
  });

  // ============================================================
  // ENDPOINT: REALIZAR TRASPASO
  // ============================================================
  router.post('/traspaso', validarUser, async (req, res) => {
    const {
      articulo,
      origenAlmacen, origenUbicacion,
      destinoAlmacen, destinoUbicacion,
      cantidad, unidadMedida,
      partida, codigoTalla, codigoColor
    } = req.body;

    const usuario = req.user.UsuarioLogicNet || req.user.CodigoUsuario || 'desconocido';
    const codigoEmpresa = req.user.CodigoEmpresa;
    const ejercicioActual = new Date().getFullYear();

    if (!(await verificarPermiso(usuario, codigoEmpresa))) {
      return res.status(403).json({ success: false, mensaje: 'No tienes permiso para realizar traspasos.' });
    }

    console.log('[TRASPASO] Recibido:', { articulo, origenAlmacen, origenUbicacion, destinoAlmacen, destinoUbicacion, cantidad, unidadMedida, partida, codigoTalla, codigoColor });

    // Validaciones básicas
    const cantidadNum = parseNumero(cantidad);
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      return res.status(400).json({ success: false, mensaje: 'La cantidad debe ser un número válido y positivo.' });
    }
    if (!articulo || !origenAlmacen || !origenUbicacion || !destinoAlmacen || !destinoUbicacion) {
      return res.status(400).json({ success: false, mensaje: 'Faltan campos requeridos para el traspaso.' });
    }
    if (origenAlmacen === destinoAlmacen && origenUbicacion === destinoUbicacion) {
      return res.status(400).json({ success: false, mensaje: 'No puedes traspasar a la misma ubicación de origen.' });
    }

    // Almacén R es solo de salida — nunca puede ser destino de un traspaso
    if (destinoAlmacen === 'R') {
      return res.status(400).json({ success: false, mensaje: 'El almacén R (recepción) solo puede ser origen, no destino.' });
    }

    // Validar ubicaciones antes de abrir transacción
    const origenValido = await validarUbicacionAlmacen(codigoEmpresa, origenAlmacen, origenUbicacion);
    if (!origenValido) {
      return res.status(400).json({ success: false, mensaje: `La ubicación origen ${origenUbicacion} no pertenece al almacén ${origenAlmacen}.` });
    }

    const destinoValido = await validarUbicacionAlmacen(codigoEmpresa, destinoAlmacen, destinoUbicacion);
    if (!destinoValido) {
      return res.status(400).json({ success: false, mensaje: `La ubicación destino ${destinoUbicacion} no pertenece al almacén ${destinoAlmacen}.` });
    }

    const unidadMedidaBD = normalizarUnidadMedida(unidadMedida);
    const partidaNorm = partida || '';
    const tallaNorm = codigoTalla || '';
    const colorNorm = codigoColor || '';
    const mismoAlmacen = origenAlmacen === destinoAlmacen;

    const transaction = new sql.Transaction(getPool());
    try {
      await transaction.begin();

      // ── 1. LEER STOCK ORIGEN ──────────────────────────────────
      const stockOrigenResult = await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar, origenAlmacen)
        .input('ubicacion', sql.VarChar, origenUbicacion)
        .input('codigoArticulo', sql.VarChar, articulo)
        .input('tipoUnidadMedida', sql.VarChar, unidadMedidaBD)
        .input('partida', sql.VarChar, partidaNorm)
        .input('codigoColor', sql.VarChar, colorNorm)
        .input('codigoTalla', sql.VarChar, tallaNorm)
        .query(`
          SELECT TOP 1
            Ejercicio,
            CAST(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS DECIMAL(18,4)) AS StockDisponible,
            ISNULL(TipoUnidadMedida_, '') AS TipoUnidadMedida_,
            ISNULL(Partida, '') AS Partida,
            ISNULL(CodigoColor_, '') AS CodigoColor_,
            ISNULL(CodigoTalla01_, '') AS CodigoTalla01_
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoAlmacen = @codigoAlmacen
            AND Ubicacion = @ubicacion
            AND CodigoArticulo = @codigoArticulo
            AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidadMedida
            AND ISNULL(Partida, '') = @partida
            AND ISNULL(CodigoColor_, '') = @codigoColor
            AND ISNULL(CodigoTalla01_, '') = @codigoTalla
            AND Periodo = 99
          ORDER BY Ejercicio DESC
        `);

      if (stockOrigenResult.recordset.length === 0) {
        throw new Error('No se encontró stock en la ubicación origen para esta variante.');
      }

      const stockItem = stockOrigenResult.recordset[0];
      const ejercicioOrigen = parseInt(stockItem.Ejercicio, 10) || ejercicioActual;
      const stockActual = parseNumero(stockItem.StockDisponible) || 0;

      if (cantidadNum > stockActual) {
        throw new Error(`Cantidad solicitada (${cantidadNum}) supera el stock disponible (${stockActual}).`);
      }

      const nuevoStockOrigen = stockActual - cantidadNum;

      // ── 2. ACTUALIZAR ORIGEN en AcumuladoStockUbicacion ──────
      // Si el registro origen está en un ejercicio anterior al actual, migramos a ejercicioActual
      // (DELETE del viejo ejercicio + INSERT/UPDATE en ejercicioActual)
      const necesitaMigracion = ejercicioOrigen !== ejercicioActual;

      if (necesitaMigracion) {
        // Eliminar el registro del ejercicio anterior
        await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.Int, ejercicioOrigen)
          .input('codigoAlmacen', sql.VarChar, origenAlmacen)
          .input('ubicacion', sql.VarChar, origenUbicacion)
          .input('codigoArticulo', sql.VarChar, articulo)
          .input('tipoUnidad', sql.VarChar, stockItem.TipoUnidadMedida_)
          .input('partida', sql.VarChar, stockItem.Partida)
          .input('codigoColor', sql.VarChar, stockItem.CodigoColor_)
          .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_)
          .query(`
            DELETE FROM AcumuladoStockUbicacion
            WHERE CodigoEmpresa = @codigoEmpresa
              AND Ejercicio = @ejercicio
              AND CodigoAlmacen = @codigoAlmacen
              AND Ubicacion = @ubicacion
              AND CodigoArticulo = @codigoArticulo
              AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
              AND ISNULL(Partida, '') = @partida
              AND ISNULL(CodigoColor_, '') = @codigoColor
              AND ISNULL(CodigoTalla01_, '') = @codigoTalla
              AND Periodo = 99
          `);

        if (nuevoStockOrigen !== 0) {
          // Insertar en ejercicioActual con el nuevo valor
          await new sql.Request(transaction)
            .input('nuevoStock', sql.Decimal(18, 4), nuevoStockOrigen)
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicioActual)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('ubicacion', sql.VarChar, origenUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('tipoUnidad', sql.VarChar, stockItem.TipoUnidadMedida_)
            .input('partida', sql.VarChar, stockItem.Partida)
            .input('codigoColor', sql.VarChar, stockItem.CodigoColor_)
            .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_)
            .query(`
              INSERT INTO AcumuladoStockUbicacion (
                CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
                CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                UnidadSaldo, UnidadSaldoTipo_, Periodo
              ) VALUES (
                @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
                @codigoArticulo, @tipoUnidad, @partida, @codigoColor, @codigoTalla,
                @nuevoStock, @nuevoStock, 99
              )
            `);
        }
        // Si nuevoStockOrigen === 0 y había migración: el DELETE ya eliminó el registro.
        // El cron de limpieza no necesita intervenir.

      } else {
        // Mismo ejercicio: comportamiento original
        if (nuevoStockOrigen === 0) {
          // Si queda en 0 y no es la ubicación principal → eliminar
          // Si es la ubicación principal → dejar en 0 (la limpieza del cron lo gestiona)
          const esPrincipalResult = await new sql.Request(transaction)
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('ubicacion', sql.VarChar, origenUbicacion)
            .input('tipoUnidad', sql.VarChar, stockItem.TipoUnidadMedida_)
            .input('partida', sql.VarChar, stockItem.Partida)
            .input('codigoColor', sql.VarChar, stockItem.CodigoColor_)
            .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_)
            .query(`
              SELECT COUNT(*) AS EsPrincipal
              FROM AcumuladoStock
              WHERE CodigoEmpresa = @codigoEmpresa
                AND CodigoAlmacen = @codigoAlmacen
                AND CodigoArticulo = @codigoArticulo
                AND Ubicacion = @ubicacion
                AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
                AND ISNULL(Partida, '') = @partida
                AND ISNULL(CodigoColor_, '') = @codigoColor
                AND ISNULL(CodigoTalla01_, '') = @codigoTalla
                AND Periodo = 99
            `);

          const esPrincipal = (esPrincipalResult.recordset[0]?.EsPrincipal || 0) > 0;

          if (esPrincipal) {
            await new sql.Request(transaction)
              .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
              .input('ejercicio', sql.Int, ejercicioOrigen)
              .input('codigoAlmacen', sql.VarChar, origenAlmacen)
              .input('ubicacion', sql.VarChar, origenUbicacion)
              .input('codigoArticulo', sql.VarChar, articulo)
              .input('tipoUnidad', sql.VarChar, stockItem.TipoUnidadMedida_)
              .input('partida', sql.VarChar, stockItem.Partida)
              .input('codigoColor', sql.VarChar, stockItem.CodigoColor_)
              .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_)
              .query(`
                UPDATE AcumuladoStockUbicacion
                SET UnidadSaldo = 0, UnidadSaldoTipo_ = 0
                WHERE CodigoEmpresa = @codigoEmpresa
                  AND Ejercicio = @ejercicio
                  AND CodigoAlmacen = @codigoAlmacen
                  AND Ubicacion = @ubicacion
                  AND CodigoArticulo = @codigoArticulo
                  AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
                  AND ISNULL(Partida, '') = @partida
                  AND ISNULL(CodigoColor_, '') = @codigoColor
                  AND ISNULL(CodigoTalla01_, '') = @codigoTalla
                  AND Periodo = 99
              `);
          } else {
            await new sql.Request(transaction)
              .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
              .input('ejercicio', sql.Int, ejercicioOrigen)
              .input('codigoAlmacen', sql.VarChar, origenAlmacen)
              .input('ubicacion', sql.VarChar, origenUbicacion)
              .input('codigoArticulo', sql.VarChar, articulo)
              .input('tipoUnidad', sql.VarChar, stockItem.TipoUnidadMedida_)
              .input('partida', sql.VarChar, stockItem.Partida)
              .input('codigoColor', sql.VarChar, stockItem.CodigoColor_)
              .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_)
              .query(`
                DELETE FROM AcumuladoStockUbicacion
                WHERE CodigoEmpresa = @codigoEmpresa
                  AND Ejercicio = @ejercicio
                  AND CodigoAlmacen = @codigoAlmacen
                  AND Ubicacion = @ubicacion
                  AND CodigoArticulo = @codigoArticulo
                  AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
                  AND ISNULL(Partida, '') = @partida
                  AND ISNULL(CodigoColor_, '') = @codigoColor
                  AND ISNULL(CodigoTalla01_, '') = @codigoTalla
                  AND Periodo = 99
              `);
          }
        } else {
          await new sql.Request(transaction)
            .input('nuevoStock', sql.Decimal(18, 4), nuevoStockOrigen)
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicioOrigen)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('ubicacion', sql.VarChar, origenUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('tipoUnidad', sql.VarChar, stockItem.TipoUnidadMedida_)
            .input('partida', sql.VarChar, stockItem.Partida)
            .input('codigoColor', sql.VarChar, stockItem.CodigoColor_)
            .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_)
            .query(`
              UPDATE AcumuladoStockUbicacion
              SET UnidadSaldo = @nuevoStock, UnidadSaldoTipo_ = @nuevoStock
              WHERE CodigoEmpresa = @codigoEmpresa
                AND Ejercicio = @ejercicio
                AND CodigoAlmacen = @codigoAlmacen
                AND Ubicacion = @ubicacion
                AND CodigoArticulo = @codigoArticulo
                AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
                AND ISNULL(Partida, '') = @partida
                AND ISNULL(CodigoColor_, '') = @codigoColor
                AND ISNULL(CodigoTalla01_, '') = @codigoTalla
                AND Periodo = 99
            `);
        }
      }

      // ── 3. ACTUALIZAR DESTINO en AcumuladoStockUbicacion ─────
      const stockDestinoResult = await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
        .input('ubicacion', sql.VarChar, destinoUbicacion)
        .input('codigoArticulo', sql.VarChar, articulo)
        .input('tipoUnidad', sql.VarChar, stockItem.TipoUnidadMedida_)
        .input('partida', sql.VarChar, stockItem.Partida)
        .input('codigoColor', sql.VarChar, stockItem.CodigoColor_)
        .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_)
        .query(`
          SELECT TOP 1
            Ejercicio,
            CAST(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS DECIMAL(18,4)) AS StockActual
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoAlmacen = @codigoAlmacen
            AND Ubicacion = @ubicacion
            AND CodigoArticulo = @codigoArticulo
            AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
            AND ISNULL(Partida, '') = @partida
            AND ISNULL(CodigoColor_, '') = @codigoColor
            AND ISNULL(CodigoTalla01_, '') = @codigoTalla
            AND Periodo = 99
          ORDER BY Ejercicio DESC
        `);

      const stockDestinoActual = parseNumero(stockDestinoResult.recordset[0]?.StockActual) || 0;
      const nuevoStockDestino = stockDestinoActual + cantidadNum;
      // El ejercicio del registro destino existente (o ejercicioActual si es nuevo)
      const ejercicioDestino = stockDestinoResult.recordset[0]
        ? parseInt(stockDestinoResult.recordset[0].Ejercicio, 10) || ejercicioActual
        : ejercicioActual;

      if (stockDestinoResult.recordset.length > 0) {
        // Si el registro destino es de un ejercicio anterior: eliminar el viejo y crear en ejercicioActual
        if (ejercicioDestino !== ejercicioActual) {
          await new sql.Request(transaction)
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicioDestino)
            .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
            .input('ubicacion', sql.VarChar, destinoUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('tipoUnidad', sql.VarChar, stockItem.TipoUnidadMedida_)
            .input('partida', sql.VarChar, stockItem.Partida)
            .input('codigoColor', sql.VarChar, stockItem.CodigoColor_)
            .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_)
            .query(`
              DELETE FROM AcumuladoStockUbicacion
              WHERE CodigoEmpresa = @codigoEmpresa
                AND Ejercicio = @ejercicio
                AND CodigoAlmacen = @codigoAlmacen
                AND Ubicacion = @ubicacion
                AND CodigoArticulo = @codigoArticulo
                AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
                AND ISNULL(Partida, '') = @partida
                AND ISNULL(CodigoColor_, '') = @codigoColor
                AND ISNULL(CodigoTalla01_, '') = @codigoTalla
                AND Periodo = 99
            `);
          // Insertar en ejercicioActual
          await new sql.Request(transaction)
            .input('nuevoStock', sql.Decimal(18, 4), nuevoStockDestino)
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicioActual)
            .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
            .input('ubicacion', sql.VarChar, destinoUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('tipoUnidad', sql.VarChar, stockItem.TipoUnidadMedida_)
            .input('partida', sql.VarChar, stockItem.Partida)
            .input('codigoColor', sql.VarChar, stockItem.CodigoColor_)
            .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_)
            .query(`
              INSERT INTO AcumuladoStockUbicacion (
                CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
                CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                UnidadSaldo, UnidadSaldoTipo_, Periodo
              ) VALUES (
                @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
                @codigoArticulo, @tipoUnidad, @partida, @codigoColor, @codigoTalla,
                @nuevoStock, @nuevoStock, 99
              )
            `);
        } else {
          // Mismo ejercicio: UPDATE normal
          await new sql.Request(transaction)
            .input('nuevoStock', sql.Decimal(18, 4), nuevoStockDestino)
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicioActual)
            .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
            .input('ubicacion', sql.VarChar, destinoUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('tipoUnidad', sql.VarChar, stockItem.TipoUnidadMedida_)
            .input('partida', sql.VarChar, stockItem.Partida)
            .input('codigoColor', sql.VarChar, stockItem.CodigoColor_)
            .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_)
            .query(`
              UPDATE AcumuladoStockUbicacion
              SET UnidadSaldo = @nuevoStock, UnidadSaldoTipo_ = @nuevoStock
              WHERE CodigoEmpresa = @codigoEmpresa
                AND Ejercicio = @ejercicio
                AND CodigoAlmacen = @codigoAlmacen
                AND Ubicacion = @ubicacion
                AND CodigoArticulo = @codigoArticulo
                AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
                AND ISNULL(Partida, '') = @partida
                AND ISNULL(CodigoColor_, '') = @codigoColor
                AND ISNULL(CodigoTalla01_, '') = @codigoTalla
                AND Periodo = 99
            `);
        }
      } else {
        await new sql.Request(transaction)
          .input('nuevoStock', sql.Decimal(18, 4), nuevoStockDestino)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.Int, ejercicioActual)
          .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
          .input('ubicacion', sql.VarChar, destinoUbicacion)
          .input('codigoArticulo', sql.VarChar, articulo)
          .input('tipoUnidad', sql.VarChar, stockItem.TipoUnidadMedida_)
          .input('partida', sql.VarChar, stockItem.Partida)
          .input('codigoColor', sql.VarChar, stockItem.CodigoColor_)
          .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_)
          .query(`
            INSERT INTO AcumuladoStockUbicacion (
              CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
              CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
              UnidadSaldo, UnidadSaldoTipo_, Periodo
            ) VALUES (
              @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
              @codigoArticulo, @tipoUnidad, @partida, @codigoColor, @codigoTalla,
              @nuevoStock, @nuevoStock, 99
            )
          `);
      }

      // ── 4. ACTUALIZAR AcumuladoStock — solo si son almacenes distintos ──
      if (!mismoAlmacen) {
        const ubicacionPrincipalDestino = (destinoUbicacion && destinoUbicacion !== 'SIN-UBICACION') ? destinoUbicacion : '';

        // Origen: usar ejercicioActual (el registro ya fue migrado o está en el año actual)
        await aplicarDeltaEnAcumuladoStock(
          transaction, codigoEmpresa, ejercicioActual,
          origenAlmacen, articulo,
          stockItem.TipoUnidadMedida_, stockItem.Partida,
          stockItem.CodigoColor_, stockItem.CodigoTalla01_,
          -cantidadNum, origenUbicacion
        );

        await aplicarDeltaEnAcumuladoStock(
          transaction, codigoEmpresa, ejercicioActual,
          destinoAlmacen, articulo,
          stockItem.TipoUnidadMedida_, stockItem.Partida,
          stockItem.CodigoColor_, stockItem.CodigoTalla01_,
          cantidadNum, ubicacionPrincipalDestino
        );
      }
      // Si mismoAlmacen → AcumuladoStock no se toca

      // ── 5. REGISTRAR MOVIMIENTO ───────────────────────────────
      const fechaActual = new Date();
      const periodo = fechaActual.getMonth() + 1;

      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicioActual)
        .input('periodo', sql.Int, periodo)
        .input('fecha', sql.Date, fechaActual)
        .input('fechaRegistro', sql.DateTime, fechaActual)
        .input('tipoMovimiento', sql.SmallInt, 3)
        .input('codigoArticulo', sql.VarChar, articulo)
        .input('codigoAlmacen', sql.VarChar, origenAlmacen)
        .input('almacenContrapartida', sql.VarChar, destinoAlmacen)
        .input('ubicacion', sql.VarChar, origenUbicacion)
        .input('ubicacionContrapartida', sql.VarChar, destinoUbicacion)
        .input('partida', sql.VarChar, stockItem.Partida)
        .input('unidades', sql.Decimal(18, 4), cantidadNum)
        .input('comentario', sql.VarChar, `Traspaso por ${usuario}`)
        .input('unidadMedida', sql.VarChar, unidadMedidaBD)
        .input('codigoColor', sql.VarChar, stockItem.CodigoColor_)
        .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_)
        .query(`
          INSERT INTO MovimientoStock (
            CodigoEmpresa, Ejercicio, Periodo, Fecha, FechaRegistro, TipoMovimiento,
            CodigoArticulo, CodigoAlmacen, AlmacenContrapartida, Ubicacion, UbicacionContrapartida,
            Unidades, Comentario, UnidadMedida1_, Partida, CodigoColor_, CodigoTalla01_
          ) VALUES (
            @codigoEmpresa, @ejercicio, @periodo, @fecha, @fechaRegistro, @tipoMovimiento,
            @codigoArticulo, @codigoAlmacen, @almacenContrapartida, @ubicacion, @ubicacionContrapartida,
            @unidades, @comentario, @unidadMedida, @partida, @codigoColor, @codigoTalla
          )
        `);

      await transaction.commit();

      console.log(`[TRASPASO] OK: ${articulo} | ${origenAlmacen}/${origenUbicacion} → ${destinoAlmacen}/${destinoUbicacion} | ${cantidadNum} | mismoAlmacen=${mismoAlmacen}`);

      res.json({
        success: true,
        mensaje: 'Traspaso realizado con éxito',
        datos: {
          articulo,
          origen: `${origenAlmacen}/${origenUbicacion}`,
          destino: `${destinoAlmacen}/${destinoUbicacion}`,
          cantidad: cantidadNum,
          unidad: unidadMedida,
          mismoAlmacen
        }
      });

    } catch (err) {
      if (transaction && !transaction._aborted) {
        try { await transaction.rollback(); } catch (e) { console.error('[ROLLBACK ERROR]', e); }
      }
      console.error('[ERROR TRASPASO]', err);
      res.status(500).json({ success: false, mensaje: err.message || 'Error al realizar el traspaso', error: err.message });
    }
  });

  // ============================================================
  // ENDPOINT: HISTORIAL DE TRASPASOS
  // ============================================================
  router.get('/historial-traspasos', validarUser, async (req, res) => {
    const codigoEmpresa = req.user.CodigoEmpresa;
    const { fecha, page = 1, pageSize = 50 } = req.query;

    try {
      const pageSafeInt = Math.max(parseInt(pageSize, 10) || 50, 1);
      const pageSafeNum = Math.max(parseInt(page, 10) || 1, 1);
      const offset = (pageSafeNum - 1) * pageSafeInt;
      let whereClause = `WHERE m.CodigoEmpresa = @codigoEmpresa AND m.TipoMovimiento = 3`;
      const request = getPool().request().input('codigoEmpresa', sql.SmallInt, codigoEmpresa);

      if (fecha) {
        whereClause += ` AND CONVERT(date, m.FechaRegistro) = @fecha`;
        request.input('fecha', sql.Date, fecha);
      }

      const query = `
        SELECT
          m.CodigoArticulo,
          a.DescripcionArticulo,
          m.CodigoAlmacen AS OrigenAlmacen,
          alm_origen.Almacen AS NombreAlmacenOrigen,
          m.Ubicacion AS OrigenUbicacion,
          u_origen.DescripcionUbicacion AS DescripcionUbicacionOrigen,
          m.AlmacenContrapartida AS DestinoAlmacen,
          alm_destino.Almacen AS NombreAlmacenDestino,
          m.UbicacionContrapartida AS DestinoUbicacion,
          u_destino.DescripcionUbicacion AS DescripcionUbicacionDestino,
          m.Unidades AS Cantidad,
          m.UnidadMedida1_ AS UnidadMedida,
          m.Partida,
          m.CodigoTalla01_,
          m.CodigoColor_,
          m.Comentario,
          CASE
            WHEN m.Comentario LIKE 'Traspaso por %'
            THEN LTRIM(RTRIM(SUBSTRING(m.Comentario, LEN('Traspaso por ') + 1, LEN(m.Comentario))))
            ELSE NULL
          END AS Usuario,
          m.FechaRegistro,
          FORMAT(m.FechaRegistro, 'dd/MM/yyyy HH:mm:ss') AS FechaFormateada
        FROM MovimientoStock m
        LEFT JOIN Articulos a
          ON a.CodigoEmpresa = m.CodigoEmpresa AND a.CodigoArticulo = m.CodigoArticulo
        LEFT JOIN Almacenes alm_origen
          ON alm_origen.CodigoEmpresa = m.CodigoEmpresa AND alm_origen.CodigoAlmacen = m.CodigoAlmacen
        LEFT JOIN Almacenes alm_destino
          ON alm_destino.CodigoEmpresa = m.CodigoEmpresa AND alm_destino.CodigoAlmacen = m.AlmacenContrapartida
        LEFT JOIN Ubicaciones u_origen
          ON u_origen.CodigoEmpresa = m.CodigoEmpresa
          AND u_origen.CodigoAlmacen = m.CodigoAlmacen
          AND u_origen.Ubicacion = m.Ubicacion
        LEFT JOIN Ubicaciones u_destino
          ON u_destino.CodigoEmpresa = m.CodigoEmpresa
          AND u_destino.CodigoAlmacen = m.AlmacenContrapartida
          AND u_destino.Ubicacion = m.UbicacionContrapartida
        ${whereClause}
        ORDER BY m.FechaRegistro DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      `;
      request.input('offset', sql.Int, offset).input('pageSize', sql.Int, pageSafeInt);

      const result = await request.query(query);

      const countResult = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          SELECT COUNT(*) AS Total
          FROM MovimientoStock
          WHERE CodigoEmpresa = @codigoEmpresa AND TipoMovimiento = 3
        `);

      const total = countResult.recordset[0]?.Total || 0;

      res.json({
        success: true,
        traspasos: result.recordset,
        pagination: {
          page: parseInt(page),
          pageSize: pageSafeInt,
          total,
          totalPages: Math.ceil(total / pageSize)
        }
      });
    } catch (err) {
      console.error('[ERROR HISTORIAL TRASPASOS]', err);
      res.status(500).json({ success: false, mensaje: 'Error al obtener historial de traspasos.', error: err.message });
    }
  });

  // ============================================================
  // ENDPOINT: DEBUG
  // ============================================================
  router.get('/debug/stock-articulo', async (req, res) => {
    const { codigoEmpresa, codigoArticulo } = req.query;
    try {
      const stockUbicacion = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .query(`
          SELECT s.CodigoAlmacen, s.Ubicacion, s.UnidadSaldo, s.TipoUnidadMedida_,
                 s.Partida, s.CodigoColor_, s.CodigoTalla01_, s.Periodo, s.Ejercicio
          FROM AcumuladoStockUbicacion s
          INNER JOIN Ubicaciones uv
            ON uv.CodigoEmpresa = s.CodigoEmpresa
            AND uv.CodigoAlmacen = s.CodigoAlmacen
            AND uv.Ubicacion = s.Ubicacion
          WHERE s.CodigoEmpresa = @codigoEmpresa
            AND s.CodigoArticulo = @codigoArticulo
            AND s.Periodo = 99
            AND s.UnidadSaldo > 0
          ORDER BY s.UnidadSaldo DESC
        `);

      const ejercicioActualDebug = new Date().getFullYear();
      const stockTotal = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .input('ejercicio', sql.Int, ejercicioActualDebug)
        .query(`
          SELECT CodigoAlmacen, Ubicacion, TipoUnidadMedida_,
                 UnidadSaldo AS StockTotal
          FROM AcumuladoStock
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoArticulo = @codigoArticulo
            AND Periodo = 99
            AND Ejercicio = @ejercicio
        `);

      res.json({ success: true, stockUbicacion: stockUbicacion.recordset, stockTotal: stockTotal.recordset });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};