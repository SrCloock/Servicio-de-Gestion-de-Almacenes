const express = require('express');

module.exports = function createtraspasosRouter({ sql, getPool }) {
  const router = express.Router();

  // ==================== FUNCIONES RESTAURADAS ====================
  function normalizarTextoUbicacion(valor = '') {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase();
  }

  function esPseudoUbicacionSinUbicacion(valor = '') {
    const normalizado = normalizarTextoUbicacion(valor);
    return normalizado === 'SINUBICACION';
  }

  async function reasignarUbicacionPrincipalPseudoEnAcumuladoStock(
    transaction,
    codigoEmpresa,
    ejercicio,
    periodoBase,
    codigoAlmacen,
    codigoArticulo,
    destinoUbicacion,
    stockItem
  ) {
    if (!destinoUbicacion || esPseudoUbicacionSinUbicacion(destinoUbicacion)) {
      return false;
    }

    const requestActual = new sql.Request(transaction);
    const actualResult = await requestActual
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('periodoBase', sql.Int, periodoBase)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_ || '')
      .input('partida', sql.VarChar, stockItem.Partida || '')
      .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
      .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
      .query(`
        SELECT TOP 1 Ubicacion
        FROM AcumuladoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND CodigoAlmacen = @codigoAlmacen
          AND CodigoArticulo = @codigoArticulo
          AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidadMedida
          AND ISNULL(Partida, '') = @partida
          AND ISNULL(CodigoColor_, '') = @codigoColor
          AND ISNULL(CodigoTalla01_, '') = @codigoTalla
          AND Periodo = @periodoBase
        ORDER BY Ejercicio DESC
      `);

    const ubicacionActual = actualResult.recordset[0]?.Ubicacion || '';
    if (!esPseudoUbicacionSinUbicacion(ubicacionActual)) {
      return false;
    }

    const requestUpdate = new sql.Request(transaction);
    await requestUpdate
      .input('destinoUbicacion', sql.VarChar, destinoUbicacion)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('periodoBase', sql.Int, periodoBase)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_ || '')
      .input('partida', sql.VarChar, stockItem.Partida || '')
      .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
      .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
      .input('ubicacionActual', sql.VarChar, ubicacionActual)
      .query(`
        UPDATE AcumuladoStock
        SET Ubicacion = @destinoUbicacion
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND CodigoAlmacen = @codigoAlmacen
          AND CodigoArticulo = @codigoArticulo
          AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidadMedida
          AND ISNULL(Partida, '') = @partida
          AND ISNULL(CodigoColor_, '') = @codigoColor
          AND ISNULL(CodigoTalla01_, '') = @codigoTalla
          AND Periodo = @periodoBase
          AND ISNULL(Ubicacion, '') = @ubicacionActual
      `);

    console.log('[TRASPASO] Ubicacion principal reasignada en AcumuladoStock:', {
      codigoEmpresa, ejercicio, codigoAlmacen, codigoArticulo,
      ubicacionAnterior: ubicacionActual, nuevaUbicacion: destinoUbicacion
    });
    return true;
  }

  // ==================== FUNCIONES AUXILIARES CORREGIDAS ====================
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

  async function obtenerContextoStockArticulo(codigoEmpresa, codigoArticulo) {
    const ejercicioActual = new Date().getFullYear();
    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        WITH Contextos AS (
          SELECT
            Ejercicio,
            Periodo,
            COUNT(*) AS TotalRegistros,
            COUNT(DISTINCT CONCAT(
              ISNULL(CodigoAlmacen, ''), '|',
              ISNULL(Ubicacion, ''), '|',
              ISNULL(TipoUnidadMedida_, ''), '|',
              ISNULL(Partida, ''), '|',
              ISNULL(CodigoColor_, ''), '|',
              ISNULL(CodigoTalla01_, '')
            )) AS TotalOrigenes,
            SUM(ABS(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0))) AS MagnitudStock
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoArticulo = @codigoArticulo
            AND (COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) <> 0)
          GROUP BY Ejercicio, Periodo
        )
        SELECT TOP 1
          Ejercicio,
          Periodo,
          TotalRegistros,
          TotalOrigenes
        FROM Contextos
        ORDER BY
          CASE WHEN Periodo = 99 THEN 0 ELSE 1 END,
          Ejercicio DESC,
          TotalOrigenes DESC,
          TotalRegistros DESC,
          MagnitudStock DESC,
          Periodo DESC
      `);
    const contexto = result.recordset[0];
    return {
      ejercicioBase: contexto?.Ejercicio || ejercicioActual,
      periodoBase: contexto?.Periodo || 99,
      totalRegistros: contexto?.TotalRegistros || 0,
      totalOrigenes: contexto?.TotalOrigenes || 0
    };
  }

  // Middleware de validación de usuario
  function validarUser(req, res, next) {
    if (!req.user || !req.user.CodigoEmpresa) {
      return res.status(401).json({ success: false, mensaje: 'No autorizado. Usuario no identificado.' });
    }
    next();
  }

  // ==================== ENDPOINTS ====================
  router.get('/almacenes', validarUser, async (req, res) => {
    const codigoEmpresa = req.user.CodigoEmpresa;
    try {
      const result = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          SELECT CodigoAlmacen, Almacen 
          FROM Almacenes
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5', '000', 'SEC', 'R')
        `);
      res.json(result.recordset);
    } catch (err) {
      console.error('[ERROR ALMACENES]', err);
      res.status(500).json({ success: false, mensaje: 'Error al obtener almacenes.', error: err.message });
    }
  });

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
        .input('fetchLimit', sql.Int, limitValue + 1);

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
        SELECT
          Ubicacion,
          DescripcionUbicacion,
          TipoUbicacion,
          CantidadArticulos
        FROM UbicacionesConVirtual
        ORDER BY Ubicacion
        OFFSET @offset ROWS
        FETCH NEXT @fetchLimit ROWS ONLY;
      `;
      request.input('includeSinUbicacion', sql.Bit, incluirSinUbicacion === 'true');
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

  router.post('/traspaso', validarUser, async (req, res) => {
    const {
      articulo, origenAlmacen, origenUbicacion, destinoAlmacen, destinoUbicacion,
      cantidad, unidadMedida, partida, codigoTalla, codigoColor, esSinUbicacion = false
    } = req.body;

    const usuario = req.user.UsuarioLogicNet;
    const codigoEmpresa = req.user.CodigoEmpresa;
    const ejercicioActual = new Date().getFullYear();

    console.log('[TRASPASO] Datos recibidos:', { articulo, origenAlmacen, origenUbicacion, destinoAlmacen, destinoUbicacion, cantidad, unidadMedida, partida, codigoTalla, codigoColor, esSinUbicacion });

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

    const transaction = new sql.Transaction(getPool());
    try {
      await transaction.begin();

      // Obtener contexto (aunque no se use, se deja por si alguna otra parte lo requiere)
      const contextoStock = await obtenerContextoStockArticulo(codigoEmpresa, articulo);
      const periodoBase = 99;
      const partidaNormalizada = partida || '';
      const codigoTallaNormalizado = codigoTalla || '';
      const codigoColorNormalizado = codigoColor || '';
      const unidadMedidaBD = normalizarUnidadMedida(unidadMedida);

      // Consulta de stock origen (versión original con ROW_NUMBER)
      const requestStockOrigen = new sql.Request(transaction);
      const queryStockOrigen = `
        WITH StockOrigenVersionado AS (
          SELECT 
            Ejercicio,
            Periodo,
            Ubicacion,
            ISNULL(TipoUnidadMedida_, '') AS TipoUnidadMedida_,
            ISNULL(Partida, '') AS Partida,
            ISNULL(CodigoColor_, '') AS CodigoColor_,
            ISNULL(CodigoTalla01_, '') AS CodigoTalla01_,
            CAST(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS DECIMAL(18,4)) AS StockDisponible,
            UnidadSaldo,
            UnidadSaldoTipo_,
            ROW_NUMBER() OVER (
              PARTITION BY
                CodigoEmpresa,
                CodigoAlmacen,
                Ubicacion,
                CodigoArticulo,
                ISNULL(TipoUnidadMedida_, ''),
                ISNULL(Partida, ''),
                ISNULL(CodigoColor_, ''),
                ISNULL(CodigoTalla01_, '')
              ORDER BY
                CASE WHEN Periodo = 99 THEN 0 ELSE 1 END,
                Ejercicio DESC,
                Periodo DESC
            ) AS rn,
            (SELECT UnidadMedida2_ FROM Articulos WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo) AS UnidadBase,
            (SELECT UnidadMedidaAlternativa_ FROM Articulos WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo) AS UnidadAlternativa
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoAlmacen = @codigoAlmacen
            AND Ubicacion = @ubicacion
            AND CodigoArticulo = @codigoArticulo
            AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidadMedida
            AND Periodo = @periodoBase
            AND ISNULL(Partida, '') = @partida
            AND ISNULL(CodigoColor_, '') = @codigoColor
            AND ISNULL(CodigoTalla01_, '') = @codigoTalla
        )
        SELECT 
          Ejercicio,
          Periodo,
          Ubicacion,
          TipoUnidadMedida_,
          Partida,
          CodigoColor_,
          CodigoTalla01_,
          StockDisponible,
          UnidadSaldo,
          UnidadSaldoTipo_,
          UnidadBase,
          UnidadAlternativa
        FROM StockOrigenVersionado
        WHERE rn = 1
      `;

      const stockOrigenResult = await requestStockOrigen
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar, origenAlmacen)
        .input('ubicacion', sql.VarChar, origenUbicacion)
        .input('codigoArticulo', sql.VarChar, articulo)
        .input('tipoUnidadMedida', sql.VarChar, unidadMedidaBD)
        .input('periodoBase', sql.Int, periodoBase)
        .input('partida', sql.VarChar, partidaNormalizada)
        .input('codigoColor', sql.VarChar, codigoColorNormalizado)
        .input('codigoTalla', sql.VarChar, codigoTallaNormalizado)
        .query(queryStockOrigen);

      if (stockOrigenResult.recordset.length === 0) {
        throw new Error('No se encontró la variante exacta en origen');
      }

      const stockItem = stockOrigenResult.recordset[0];
      const ejercicioStock = parseInt(stockItem.Ejercicio, 10) || ejercicioActual;
      let stockActual = parseNumero(stockItem.StockDisponible);
      if (isNaN(stockActual) || stockActual < 0) stockActual = 0;

      if (cantidadNum > stockActual) {
        throw new Error(`Cantidad solicitada (${cantidadNum}) supera el stock disponible (${stockActual})`);
      }

      const nuevoStockOrigen = stockActual - cantidadNum;

      // Actualizar origen (mantiene su ejercicio)
      if (nuevoStockOrigen === 0) {
        await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.Int, ejercicioStock)
          .input('codigoAlmacen', sql.VarChar, origenAlmacen)
          .input('ubicacion', sql.VarChar, origenUbicacion)
          .input('codigoArticulo', sql.VarChar, articulo)
          .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
          .input('periodoBase', sql.Int, periodoBase)
          .input('partida', sql.VarChar, stockItem.Partida || '')
          .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
          .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
          .query(`
            DELETE FROM AcumuladoStockUbicacion
            WHERE CodigoEmpresa = @codigoEmpresa
              AND Ejercicio = @ejercicio
              AND CodigoAlmacen = @codigoAlmacen
              AND Ubicacion = @ubicacion
              AND CodigoArticulo = @codigoArticulo
              AND TipoUnidadMedida_ = @tipoUnidadMedida
              AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
              AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
              AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
              AND Periodo = @periodoBase
          `);
      } else {
        await new sql.Request(transaction)
          .input('nuevoStock', sql.Decimal(18,4), nuevoStockOrigen)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.Int, ejercicioStock)
          .input('codigoAlmacen', sql.VarChar, origenAlmacen)
          .input('ubicacion', sql.VarChar, origenUbicacion)
          .input('codigoArticulo', sql.VarChar, articulo)
          .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
          .input('periodoBase', sql.Int, periodoBase)
          .input('partida', sql.VarChar, stockItem.Partida || '')
          .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
          .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
          .query(`
            UPDATE AcumuladoStockUbicacion
            SET UnidadSaldo = @nuevoStock, UnidadSaldoTipo_ = @nuevoStock
            WHERE CodigoEmpresa = @codigoEmpresa
              AND Ejercicio = @ejercicio
              AND CodigoAlmacen = @codigoAlmacen
              AND Ubicacion = @ubicacion
              AND CodigoArticulo = @codigoArticulo
              AND TipoUnidadMedida_ = @tipoUnidadMedida
              AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
              AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
              AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
              AND Periodo = @periodoBase
          `);
      }

      // Destino: usar ejercicio actual
      const stockDestinoResult = await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.Int, ejercicioActual)
        .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
        .input('ubicacion', sql.VarChar, destinoUbicacion)
        .input('codigoArticulo', sql.VarChar, articulo)
        .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
        .input('periodoBase', sql.Int, periodoBase)
        .input('partida', sql.VarChar, stockItem.Partida || '')
        .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
        .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
        .query(`
          SELECT UnidadSaldo, UnidadSaldoTipo_
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND Ejercicio = @ejercicio
            AND CodigoAlmacen = @codigoAlmacen
            AND Ubicacion = @ubicacion
            AND CodigoArticulo = @codigoArticulo
            AND TipoUnidadMedida_ = @tipoUnidadMedida
            AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
            AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
            AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
            AND Periodo = @periodoBase
        `);

      let stockDestinoActual = 0;
      if (stockDestinoResult.recordset.length > 0) {
        stockDestinoActual = parseNumero(stockDestinoResult.recordset[0].UnidadSaldo) || 0;
      }
      const nuevoStockDestino = stockDestinoActual + cantidadNum;

      if (stockDestinoResult.recordset.length > 0) {
        await new sql.Request(transaction)
          .input('nuevoStock', sql.Decimal(18,4), nuevoStockDestino)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.Int, ejercicioActual)
          .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
          .input('ubicacion', sql.VarChar, destinoUbicacion)
          .input('codigoArticulo', sql.VarChar, articulo)
          .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
          .input('periodoBase', sql.Int, periodoBase)
          .input('partida', sql.VarChar, stockItem.Partida || '')
          .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
          .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
          .query(`
            UPDATE AcumuladoStockUbicacion
            SET UnidadSaldo = @nuevoStock, UnidadSaldoTipo_ = @nuevoStock
            WHERE CodigoEmpresa = @codigoEmpresa
              AND Ejercicio = @ejercicio
              AND CodigoAlmacen = @codigoAlmacen
              AND Ubicacion = @ubicacion
              AND CodigoArticulo = @codigoArticulo
              AND TipoUnidadMedida_ = @tipoUnidadMedida
              AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
              AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
              AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
              AND Periodo = @periodoBase
          `);
      } else {
        await new sql.Request(transaction)
          .input('nuevoStock', sql.Decimal(18,4), nuevoStockDestino)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.Int, ejercicioActual)
          .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
          .input('ubicacion', sql.VarChar, destinoUbicacion)
          .input('codigoArticulo', sql.VarChar, articulo)
          .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
          .input('periodoBase', sql.Int, periodoBase)
          .input('partida', sql.VarChar, stockItem.Partida || '')
          .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
          .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
          .query(`
            INSERT INTO AcumuladoStockUbicacion (
              CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
              CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
              UnidadSaldo, UnidadSaldoTipo_, Periodo
            ) VALUES (
              @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
              @codigoArticulo, @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla,
              @nuevoStock, @nuevoStock, @periodoBase
            )
          `);
      }

      // Actualizar AcumuladoStock (tabla resumen) para origen y destino
      await actualizarAcumuladoStockGlobal(transaction, codigoEmpresa, ejercicioStock, periodoBase, origenAlmacen, articulo, stockItem, null);
      await actualizarAcumuladoStockGlobal(transaction, codigoEmpresa, ejercicioActual, periodoBase, destinoAlmacen, articulo, stockItem, destinoUbicacion);

      // Registrar movimiento en MovimientoStock
      const fechaActual = new Date();
      const periodo = fechaActual.getMonth() + 1;
      const fechaSolo = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), fechaActual.getDate());

      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicioActual)
        .input('periodo', sql.Int, periodo)
        .input('fecha', sql.Date, fechaSolo)
        .input('fechaRegistro', sql.DateTime, fechaActual)
        .input('tipoMovimiento', sql.SmallInt, 3)
        .input('codigoArticulo', sql.VarChar, articulo)
        .input('codigoAlmacen', sql.VarChar, origenAlmacen)
        .input('almacenContrapartida', sql.VarChar, destinoAlmacen)
        .input('ubicacion', sql.VarChar, origenUbicacion)
        .input('ubicacionContrapartida', sql.VarChar, destinoUbicacion)
        .input('partida', sql.VarChar, stockItem.Partida || '')
        .input('unidades', sql.Decimal(18,4), cantidadNum)
        .input('comentario', sql.VarChar, `Traspaso por ${usuario}`)
        .input('unidadMedida', sql.VarChar, unidadMedidaBD)
        .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
        .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
        .query(`
          INSERT INTO MovimientoStock (
            CodigoEmpresa, Ejercicio, Periodo, Fecha, FechaRegistro, TipoMovimiento,
            CodigoArticulo, CodigoAlmacen, AlmacenContrapartida, Ubicacion, UbicacionContrapartida,
            Unidades, Comentario, UnidadMedida1_, Partida,
            CodigoColor_, CodigoTalla01_
          ) VALUES (
            @codigoEmpresa, @ejercicio, @periodo, @fecha, @fechaRegistro, @tipoMovimiento,
            @codigoArticulo, @codigoAlmacen, @almacenContrapartida, @ubicacion, @ubicacionContrapartida,
            @unidades, @comentario, @unidadMedida, @partida,
            @codigoColor, @codigoTalla
          )
        `);

      await transaction.commit();
      console.log('[TRASPASO] Traspaso completado exitosamente');

      res.json({
        success: true,
        mensaje: 'Traspaso realizado con éxito',
        datos: { articulo, origen: `${origenAlmacen}-${origenUbicacion}`, destino: `${destinoAlmacen}-${destinoUbicacion}`, cantidad: cantidadNum, unidad: unidadMedida }
      });
    } catch (err) {
      if (transaction._aborted === false) await transaction.rollback();
      console.error('[ERROR TRASPASO]', err);
      res.status(500).json({ success: false, mensaje: 'Error al realizar el traspaso', error: err.message });
    }
  });

  async function actualizarAcumuladoStockGlobal(transaction, codigoEmpresa, ejercicio, periodoBase, codigoAlmacen, codigoArticulo, stockItem, ubicacionPrincipalPreferida = null) {
    try {
      const request = new sql.Request(transaction);
      await request
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.Int, ejercicio)
        .input('periodoBase', sql.Int, periodoBase)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
        .input('partida', sql.VarChar, stockItem.Partida || '')
        .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
        .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
        .input('ubicacionPrincipalPreferida', sql.VarChar, ubicacionPrincipalPreferida || '')
        .query(`
          DECLARE @StockTotalUnidad DECIMAL(18,4);
          DECLARE @StockTotalUnidadTipo DECIMAL(18,4);
          DECLARE @UbicacionActual VARCHAR(50);
          DECLARE @UbicacionActualEsValida BIT = 0;
          DECLARE @UbicacionPreferidaEsValida BIT = 0;
          DECLARE @UbicacionPrincipalFinal VARCHAR(50);
          
          SELECT 
            @StockTotalUnidad = SUM(ISNULL(UnidadSaldo, 0)),
            @StockTotalUnidadTipo = SUM(ISNULL(UnidadSaldoTipo_, 0))
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND Ejercicio = @ejercicio
            AND CodigoAlmacen = @codigoAlmacen
            AND CodigoArticulo = @codigoArticulo
            AND TipoUnidadMedida_ = @tipoUnidadMedida
            AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
            AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
            AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
            AND Periodo = @periodoBase;

          IF ISNULL(@StockTotalUnidad, 0) = 0 AND ISNULL(@StockTotalUnidadTipo, 0) = 0
          BEGIN
            DELETE FROM AcumuladoStock
            WHERE CodigoEmpresa = @codigoEmpresa
              AND Ejercicio = @ejercicio
              AND CodigoAlmacen = @codigoAlmacen
              AND CodigoArticulo = @codigoArticulo
              AND TipoUnidadMedida_ = @tipoUnidadMedida
              AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
              AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
              AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
              AND Periodo = @periodoBase;
            RETURN;
          END

          SELECT TOP 1 @UbicacionActual = ast.Ubicacion
          FROM AcumuladoStock ast
          WHERE ast.CodigoEmpresa = @codigoEmpresa
            AND ast.Ejercicio = @ejercicio
            AND ast.CodigoAlmacen = @codigoAlmacen
            AND ast.CodigoArticulo = @codigoArticulo
            AND ISNULL(ast.TipoUnidadMedida_, '') = @tipoUnidadMedida
            AND ISNULL(ast.Partida, '') = @partida
            AND ISNULL(ast.CodigoColor_, '') = @codigoColor
            AND ISNULL(ast.CodigoTalla01_, '') = @codigoTalla
            AND ast.Periodo = @periodoBase
          ORDER BY ast.Ejercicio DESC;

          IF NULLIF(LTRIM(RTRIM(ISNULL(@UbicacionActual, ''))), '') IS NOT NULL
             AND EXISTS (SELECT 1 FROM Ubicaciones u WHERE u.CodigoEmpresa = @codigoEmpresa AND u.CodigoAlmacen = @codigoAlmacen AND u.Ubicacion = @UbicacionActual)
            SET @UbicacionActualEsValida = 1;

          IF NULLIF(LTRIM(RTRIM(ISNULL(@ubicacionPrincipalPreferida, ''))), '') IS NOT NULL
             AND EXISTS (SELECT 1 FROM Ubicaciones u WHERE u.CodigoEmpresa = @codigoEmpresa AND u.CodigoAlmacen = @codigoAlmacen AND u.Ubicacion = @ubicacionPrincipalPreferida)
            SET @UbicacionPreferidaEsValida = 1;

          IF @UbicacionActualEsValida = 1
            SET @UbicacionPrincipalFinal = @UbicacionActual;
          ELSE IF @UbicacionPreferidaEsValida = 1
            SET @UbicacionPrincipalFinal = @ubicacionPrincipalPreferida;
          ELSE
          BEGIN
            SELECT TOP 1 @UbicacionPrincipalFinal = su.Ubicacion
            FROM AcumuladoStockUbicacion su
            INNER JOIN Ubicaciones u ON u.CodigoEmpresa = su.CodigoEmpresa AND u.CodigoAlmacen = su.CodigoAlmacen AND u.Ubicacion = su.Ubicacion
            WHERE su.CodigoEmpresa = @codigoEmpresa
              AND su.Ejercicio = @ejercicio
              AND su.CodigoAlmacen = @codigoAlmacen
              AND su.CodigoArticulo = @codigoArticulo
              AND ISNULL(su.TipoUnidadMedida_, '') = @tipoUnidadMedida
              AND ISNULL(su.Partida, '') = @partida
              AND ISNULL(su.CodigoColor_, '') = @codigoColor
              AND ISNULL(su.CodigoTalla01_, '') = @codigoTalla
              AND su.Periodo = @periodoBase
              AND COALESCE(su.UnidadSaldo, 0) > 0
            ORDER BY COALESCE(su.UnidadSaldo, 0) DESC, su.Ubicacion;
          END
          
          MERGE INTO AcumuladoStock AS target
          USING (VALUES (@codigoEmpresa, @ejercicio, @codigoAlmacen, @codigoArticulo, @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla, @periodoBase)) AS source (CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_, Periodo)
          ON target.CodigoEmpresa = source.CodigoEmpresa
             AND target.Ejercicio = source.Ejercicio
             AND target.CodigoAlmacen = source.CodigoAlmacen
             AND target.CodigoArticulo = source.CodigoArticulo
             AND target.TipoUnidadMedida_ = source.TipoUnidadMedida_
             AND ISNULL(target.Partida, '') = ISNULL(source.Partida, '')
             AND ISNULL(target.CodigoColor_, '') = ISNULL(source.CodigoColor_, '')
             AND ISNULL(target.CodigoTalla01_, '') = ISNULL(source.CodigoTalla01_, '')
             AND target.Periodo = source.Periodo
          WHEN MATCHED THEN
            UPDATE SET UnidadSaldo = @StockTotalUnidad, UnidadSaldoTipo_ = @StockTotalUnidadTipo, Ubicacion = COALESCE(@UbicacionPrincipalFinal, target.Ubicacion)
          WHEN NOT MATCHED THEN
            INSERT (CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_, Ubicacion, UnidadSaldo, UnidadSaldoTipo_, Periodo)
            VALUES (@codigoEmpresa, @ejercicio, @codigoAlmacen, @codigoArticulo, @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla, @UbicacionPrincipalFinal, @StockTotalUnidad, @StockTotalUnidadTipo, @periodoBase);
        `);
      console.log('[AcumuladoStock] actualizado para', codigoArticulo, 'en', codigoAlmacen, 'ejercicio', ejercicio);
    } catch (error) {
      console.error('[ERROR actualizarAcumuladoStockGlobal]', error);
      throw error;
    }
  }

  router.get('/historial-traspasos', validarUser, async (req, res) => {
    const codigoEmpresa = req.user.CodigoEmpresa;
    const { fecha, page = 1, pageSize = 50 } = req.query;

    try {
      const offset = (page - 1) * pageSize;
      let whereClause = `WHERE m.CodigoEmpresa = @codigoEmpresa AND m.TipoMovimiento = 3`;
      const request = getPool().request().input('codigoEmpresa', sql.SmallInt, codigoEmpresa);

      if (fecha) {
        whereClause += ` AND CONVERT(date, m.FechaRegistro) = @fecha`;
        request.input('fecha', sql.Date, fecha);
      }

      const query = `
        SELECT 
          m.CodigoArticulo, a.DescripcionArticulo,
          m.CodigoAlmacen AS OrigenAlmacen, alm_origen.Almacen AS NombreAlmacenOrigen,
          m.Ubicacion AS OrigenUbicacion,
          m.AlmacenContrapartida AS DestinoAlmacen, alm_destino.Almacen AS NombreAlmacenDestino,
          m.UbicacionContrapartida AS DestinoUbicacion,
          m.Unidades AS Cantidad, m.UnidadMedida1_ AS UnidadMedida,
          m.Partida, m.CodigoTalla01_, m.CodigoColor_, m.Comentario,
          CASE WHEN m.Comentario LIKE 'Traspaso por %' THEN LTRIM(RTRIM(SUBSTRING(m.Comentario, LEN('Traspaso por ') + 1, LEN(m.Comentario)))) ELSE NULL END AS Usuario,
          m.FechaRegistro, FORMAT(m.FechaRegistro, 'dd/MM/yyyy HH:mm:ss') AS FechaFormateada,
          u_origen.DescripcionUbicacion AS DescripcionUbicacionOrigen,
          u_destino.DescripcionUbicacion AS DescripcionUbicacionDestino
        FROM MovimientoStock m
        LEFT JOIN Articulos a ON a.CodigoEmpresa = m.CodigoEmpresa AND a.CodigoArticulo = m.CodigoArticulo
        LEFT JOIN Almacenes alm_origen ON alm_origen.CodigoEmpresa = m.CodigoEmpresa AND alm_origen.CodigoAlmacen = m.CodigoAlmacen
        LEFT JOIN Almacenes alm_destino ON alm_destino.CodigoEmpresa = m.CodigoEmpresa AND alm_destino.CodigoAlmacen = m.AlmacenContrapartida
        LEFT JOIN Ubicaciones u_origen ON u_origen.CodigoEmpresa = m.CodigoEmpresa AND u_origen.CodigoAlmacen = m.CodigoAlmacen AND u_origen.Ubicacion = m.Ubicacion
        LEFT JOIN Ubicaciones u_destino ON u_destino.CodigoEmpresa = m.CodigoEmpresa AND u_destino.CodigoAlmacen = m.AlmacenContrapartida AND u_destino.Ubicacion = m.UbicacionContrapartida
        ${whereClause}
        ORDER BY m.FechaRegistro DESC
        OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
      `;
      const result = await request.query(query);
      const countResult = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`SELECT COUNT(*) as Total FROM MovimientoStock m WHERE m.CodigoEmpresa = @codigoEmpresa AND m.TipoMovimiento = 3`);
      const total = countResult.recordset[0]?.Total || 0;
      const totalPages = Math.ceil(total / pageSize);
      res.json({ success: true, traspasos: result.recordset, pagination: { page: parseInt(page), pageSize: parseInt(pageSize), total, totalPages } });
    } catch (err) {
      console.error('[ERROR HISTORIAL TRASPASOS]', err);
      res.status(500).json({ success: false, mensaje: 'Error al obtener historial de traspasos.', error: err.message });
    }
  });

  router.get('/debug/stock-articulo', async (req, res) => {
    const { codigoEmpresa, codigoArticulo } = req.query;
    try {
      const stockUbicacion = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .query(`SELECT CodigoAlmacen, Ubicacion, UnidadSaldo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_, Periodo FROM AcumuladoStockUbicacion WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo AND Periodo = 99 AND UnidadSaldo > 0 ORDER BY UnidadSaldo DESC`);
      const stockTotal = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .query(`SELECT CodigoAlmacen, TipoUnidadMedida_, SUM(UnidadSaldo) as StockTotal FROM AcumuladoStock WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo AND Periodo = 99 GROUP BY CodigoAlmacen, TipoUnidadMedida_`);
      res.json({ success: true, stockUbicacion: stockUbicacion.recordset, stockTotal: stockTotal.recordset });
    } catch (err) {
      console.error('[ERROR DIAGNOSTICO]', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/traspasos/stock-por-articulo', validarUser, async (req, res) => {
    const { codigoArticulo } = req.query;
    const codigoEmpresa = req.user.CodigoEmpresa;
    if (!codigoArticulo) {
      return res.status(400).json({ success: false, mensaje: 'Código de artículo requerido' });
    }
    try {
      const contexto = await obtenerContextoStockArticulo(codigoEmpresa, codigoArticulo);
      const query = `
        WITH StockUbicacionVersionado AS (
          SELECT
            s.CodigoEmpresa, s.CodigoArticulo,
            LTRIM(RTRIM(s.CodigoAlmacen)) AS CodigoAlmacen,
            CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(s.Ubicacion, ''))), '') IS NULL THEN 'SIN-UBICACION' ELSE LTRIM(RTRIM(s.Ubicacion)) END AS Ubicacion,
            ISNULL(LTRIM(RTRIM(s.TipoUnidadMedida_)), '') AS TipoUnidadMedida_,
            ISNULL(LTRIM(RTRIM(s.Partida)), '') AS Partida,
            ISNULL(LTRIM(RTRIM(s.CodigoColor_)), '') AS CodigoColor_,
            ISNULL(LTRIM(RTRIM(s.CodigoTalla01_)), '') AS CodigoTalla01_,
            CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18,4)) AS StockDisponible,
            s.Ejercicio, s.Periodo,
            ROW_NUMBER() OVER (PARTITION BY s.CodigoEmpresa, s.CodigoArticulo, LTRIM(RTRIM(s.CodigoAlmacen)), CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(s.Ubicacion, ''))), '') IS NULL THEN 'SIN-UBICACION' ELSE LTRIM(RTRIM(s.Ubicacion)) END, ISNULL(LTRIM(RTRIM(s.TipoUnidadMedida_)), ''), ISNULL(LTRIM(RTRIM(s.Partida)), ''), ISNULL(LTRIM(RTRIM(s.CodigoColor_)), ''), ISNULL(LTRIM(RTRIM(s.CodigoTalla01_)), '') ORDER BY CASE WHEN s.Periodo = 99 THEN 0 ELSE 1 END, s.Ejercicio DESC, s.Periodo DESC) AS rn
          FROM AcumuladoStockUbicacion s
          WHERE s.CodigoEmpresa = @codigoEmpresa AND s.CodigoArticulo = @codigoArticulo AND s.Periodo = 99 AND NULLIF(LTRIM(RTRIM(ISNULL(s.CodigoAlmacen, ''))), '') IS NOT NULL
        ),
        StockUbicacionExacto AS (
          SELECT * FROM StockUbicacionVersionado WHERE rn = 1 AND StockDisponible > 0
        ),
        StockAcumuladoVersionado AS (
          SELECT
            s.CodigoEmpresa, s.CodigoArticulo,
            LTRIM(RTRIM(s.CodigoAlmacen)) AS CodigoAlmacen,
            CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(s.Ubicacion, ''))), '') IS NULL THEN 'SIN-UBICACION' ELSE LTRIM(RTRIM(s.Ubicacion)) END AS Ubicacion,
            ISNULL(LTRIM(RTRIM(s.TipoUnidadMedida_)), '') AS TipoUnidadMedida_,
            ISNULL(LTRIM(RTRIM(s.Partida)), '') AS Partida,
            ISNULL(LTRIM(RTRIM(s.CodigoColor_)), '') AS CodigoColor_,
            ISNULL(LTRIM(RTRIM(s.CodigoTalla01_)), '') AS CodigoTalla01_,
            CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18,4)) AS StockDisponible,
            s.Ejercicio, s.Periodo,
            ROW_NUMBER() OVER (PARTITION BY s.CodigoEmpresa, s.CodigoArticulo, LTRIM(RTRIM(s.CodigoAlmacen)), CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(s.Ubicacion, ''))), '') IS NULL THEN 'SIN-UBICACION' ELSE LTRIM(RTRIM(s.Ubicacion)) END, ISNULL(LTRIM(RTRIM(s.TipoUnidadMedida_)), ''), ISNULL(LTRIM(RTRIM(s.Partida)), ''), ISNULL(LTRIM(RTRIM(s.CodigoColor_)), ''), ISNULL(LTRIM(RTRIM(s.CodigoTalla01_)), '') ORDER BY CASE WHEN s.Periodo = 99 THEN 0 ELSE 1 END, s.Ejercicio DESC, s.Periodo DESC) AS rn
          FROM AcumuladoStock s
          WHERE s.CodigoEmpresa = @codigoEmpresa AND s.CodigoArticulo = @codigoArticulo AND s.Periodo = 99 AND NULLIF(LTRIM(RTRIM(ISNULL(s.CodigoAlmacen, ''))), '') IS NOT NULL
        ),
        StockAcumuladoExacto AS (
          SELECT * FROM StockAcumuladoVersionado WHERE rn = 1 AND StockDisponible > 0
        ),
        StockCombinado AS (
          SELECT * FROM StockUbicacionExacto
          UNION ALL
          SELECT a.* FROM StockAcumuladoExacto a WHERE NOT EXISTS (SELECT 1 FROM StockUbicacionExacto u WHERE u.CodigoEmpresa = a.CodigoEmpresa AND u.CodigoArticulo = a.CodigoArticulo AND u.CodigoAlmacen = a.CodigoAlmacen AND u.Ubicacion = a.Ubicacion AND u.TipoUnidadMedida_ = a.TipoUnidadMedida_ AND u.Partida = a.Partida AND u.CodigoColor_ = a.CodigoColor_ AND u.CodigoTalla01_ = a.CodigoTalla01_)
        )
        SELECT
          s.CodigoArticulo, COALESCE(a.DescripcionArticulo, s.CodigoArticulo) AS DescripcionArticulo,
          s.CodigoAlmacen, alm.Almacen AS NombreAlmacen,
          s.Ubicacion, principal.UbicacionPrincipal,
          CASE WHEN s.Ubicacion = 'SIN-UBICACION' THEN 'Stock sin ubicación asignada' ELSE COALESCE(u.DescripcionUbicacion, '') END AS DescripcionUbicacion,
          s.TipoUnidadMedida_ AS UnidadStock,
          CAST(COALESCE(s.StockDisponible, 0) AS DECIMAL(18,4)) AS CantidadBase,
          CAST(COALESCE(s.StockDisponible, 0) AS DECIMAL(18,4)) AS Cantidad,
          s.Partida, s.CodigoColor_, s.CodigoTalla01_,
          a.UnidadMedida2_ AS UnidadBase, a.UnidadMedidaAlternativa_ AS UnidadAlternativa, a.FactorConversion_ AS FactorConversion,
          CASE WHEN s.Ubicacion = 'SIN-UBICACION' THEN 1 ELSE 0 END AS EsSinUbicacion,
          CASE WHEN ISNULL(LTRIM(RTRIM(principal.UbicacionPrincipal)), '') = ISNULL(LTRIM(RTRIM(s.Ubicacion)), '') THEN 1 ELSE 0 END AS EsUbicacionPrincipal,
          'AcumuladoStockUbicacion' AS TablaOrigen,
          CONCAT(s.CodigoArticulo, '_', s.CodigoAlmacen, '_', s.Ubicacion, '_', s.TipoUnidadMedida_, '_', s.Partida, '_', s.CodigoColor_, '_', s.CodigoTalla01_) AS ClaveUnica
        FROM StockCombinado s
        OUTER APPLY (SELECT TOP 1 a.* FROM Articulos a WHERE a.CodigoEmpresa = s.CodigoEmpresa AND (LTRIM(RTRIM(a.CodigoArticulo)) = LTRIM(RTRIM(s.CodigoArticulo)) OR LTRIM(RTRIM(ISNULL(a.CodigoAlternativo, ''))) = LTRIM(RTRIM(s.CodigoArticulo)) OR LTRIM(RTRIM(ISNULL(a.CodigoAlternativo2, ''))) = LTRIM(RTRIM(s.CodigoArticulo)) OR LTRIM(RTRIM(ISNULL(a.CodigoArticuloOferta, ''))) = LTRIM(RTRIM(s.CodigoArticulo)) OR LTRIM(RTRIM(ISNULL(a.ReferenciaEdi_, ''))) = LTRIM(RTRIM(s.CodigoArticulo)) OR (TRY_CONVERT(BIGINT, s.CodigoArticulo) IS NOT NULL AND (TRY_CONVERT(BIGINT, a.CodigoArticulo) = TRY_CONVERT(BIGINT, s.CodigoArticulo) OR TRY_CONVERT(BIGINT, a.CodigoAlternativo) = TRY_CONVERT(BIGINT, s.CodigoArticulo) OR TRY_CONVERT(BIGINT, a.CodigoAlternativo2) = TRY_CONVERT(BIGINT, s.CodigoArticulo) OR TRY_CONVERT(BIGINT, a.CodigoArticuloOferta) = TRY_CONVERT(BIGINT, s.CodigoArticulo) OR TRY_CONVERT(BIGINT, a.ReferenciaEdi_) = TRY_CONVERT(BIGINT, s.CodigoArticulo))) ORDER BY CASE WHEN LTRIM(RTRIM(a.CodigoArticulo)) = LTRIM(RTRIM(s.CodigoArticulo)) THEN 0 WHEN TRY_CONVERT(BIGINT, a.CodigoArticulo) = TRY_CONVERT(BIGINT, s.CodigoArticulo) THEN 1 WHEN LTRIM(RTRIM(ISNULL(a.CodigoAlternativo, ''))) = LTRIM(RTRIM(s.CodigoArticulo)) THEN 2 WHEN LTRIM(RTRIM(ISNULL(a.CodigoAlternativo2, ''))) = LTRIM(RTRIM(s.CodigoArticulo)) THEN 3 WHEN LTRIM(RTRIM(ISNULL(a.CodigoArticuloOferta, ''))) = LTRIM(RTRIM(s.CodigoArticulo)) THEN 4 WHEN LTRIM(RTRIM(ISNULL(a.ReferenciaEdi_, ''))) = LTRIM(RTRIM(s.CodigoArticulo)) THEN 5 ELSE 6 END, a.CodigoArticulo) a
        OUTER APPLY (SELECT TOP 1 CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(ast.Ubicacion, ''))), '') IS NULL THEN 'SIN-UBICACION' ELSE LTRIM(RTRIM(ast.Ubicacion)) END AS UbicacionPrincipal FROM AcumuladoStock ast WHERE ast.CodigoEmpresa = s.CodigoEmpresa AND ast.Periodo = 99 AND ISNULL(LTRIM(RTRIM(ast.CodigoAlmacen)), '') = ISNULL(LTRIM(RTRIM(s.CodigoAlmacen)), '') AND ISNULL(LTRIM(RTRIM(ast.CodigoArticulo)), '') = ISNULL(LTRIM(RTRIM(s.CodigoArticulo)), '') AND ISNULL(LTRIM(RTRIM(ast.TipoUnidadMedida_)), '') = ISNULL(LTRIM(RTRIM(s.TipoUnidadMedida_)), '') AND ISNULL(LTRIM(RTRIM(ast.Partida)), '') = ISNULL(LTRIM(RTRIM(s.Partida)), '') AND ISNULL(LTRIM(RTRIM(ast.CodigoColor_)), '') = ISNULL(LTRIM(RTRIM(s.CodigoColor_)), '') AND ISNULL(LTRIM(RTRIM(ast.CodigoTalla01_)), '') = ISNULL(LTRIM(RTRIM(s.CodigoTalla01_)), '') ORDER BY CASE WHEN ast.Periodo = 99 THEN 0 ELSE 1 END, ast.Ejercicio DESC, CASE WHEN NULLIF(LTRIM(RTRIM(ISNULL(ast.TipoUnidadMedida_, ''))), '') IS NULL THEN COALESCE(ast.UnidadSaldo, ast.UnidadSaldoTipo_, 0) ELSE COALESCE(NULLIF(ast.UnidadSaldoTipo_, 0), ast.UnidadSaldo, 0) END DESC) principal
        INNER JOIN Almacenes alm ON alm.CodigoEmpresa = s.CodigoEmpresa AND alm.CodigoAlmacen = s.CodigoAlmacen
        LEFT JOIN Ubicaciones u ON u.CodigoEmpresa = s.CodigoEmpresa AND u.CodigoAlmacen = s.CodigoAlmacen AND u.Ubicacion = s.Ubicacion
        ORDER BY s.CodigoAlmacen, s.Ubicacion, s.CodigoColor_, s.CodigoTalla01_, s.Partida, s.TipoUnidadMedida_, s.StockDisponible DESC
      `;
      const result = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .query(query);
      res.json(result.recordset);
    } catch (error) {
      console.error('[ERROR STOCK POR ARTICULO TRASPASOS]', error);
      res.status(500).json({ success: false, mensaje: 'Error al obtener stock para traspasos', error: error.message });
    }
  });

  return router;
};