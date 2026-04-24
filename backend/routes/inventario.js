const express = require('express');
const cron = require('node-cron');

module.exports = function createinventarioRouter({ sql, getPool }) {
  const router = express.Router();

  function getRequest(transaction = null) {
    return transaction ? new sql.Request(transaction) : getPool().request();
  }

  async function obtenerContextoBaseInventario(codigoEmpresa, transaction = null) {
    const ejercicioActual = new Date().getFullYear();

    const result = await getRequest(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        WITH Contextos AS (
          SELECT
            Ejercicio,
            Periodo,
            COUNT(*) AS TotalRegistros,
            COUNT(DISTINCT CodigoArticulo) AS TotalArticulos,
            SUM(ABS(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0))) AS MagnitudStock
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND (
              COALESCE(UnidadSaldoTipo_, 0) <> 0
              OR COALESCE(UnidadSaldo, 0) <> 0
            )
          GROUP BY Ejercicio, Periodo
        )
        SELECT TOP 1
          Ejercicio,
          Periodo,
          TotalRegistros,
          TotalArticulos
        FROM Contextos
        ORDER BY
          CASE WHEN Periodo = 99 THEN 0 ELSE 1 END,
          TotalArticulos DESC,
          TotalRegistros DESC,
          MagnitudStock DESC,
          Ejercicio DESC,
          Periodo DESC
      `);

    const contexto = result.recordset[0];

    return {
      ejercicioBase: contexto?.Ejercicio || ejercicioActual,
      periodoBase: contexto?.Periodo || 99,
      ejercicioActual
    };
  }

  function agregarContextoInventario(request, contexto) {
    return request
      .input('ejercicioBase', sql.SmallInt, contexto.ejercicioBase)
      .input('periodoBase', sql.SmallInt, contexto.periodoBase)
      .input('ejercicioActual', sql.SmallInt, contexto.ejercicioActual);
  }

  function getCteInventarioActual() {
    return `
      WITH StockUbicacionVersionado AS (
        SELECT
          s.*,
          ROW_NUMBER() OVER (
            PARTITION BY
              s.CodigoEmpresa,
              s.CodigoAlmacen,
              s.Ubicacion,
              s.CodigoArticulo,
              ISNULL(s.TipoUnidadMedida_, ''),
              ISNULL(s.Partida, ''),
              ISNULL(s.CodigoColor_, ''),
              ISNULL(s.CodigoTalla01_, '')
            ORDER BY
              CASE WHEN s.Ejercicio = @ejercicioActual THEN 0 ELSE 1 END,
              s.Ejercicio DESC
          ) AS rn
        FROM AcumuladoStockUbicacion s
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.Periodo = @periodoBase
          AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
      ),
      StockUbicacionActual AS (
        SELECT *
        FROM StockUbicacionVersionado
        WHERE rn = 1
      ),
      AcumuladoStockVersionado AS (
        SELECT
          s.*,
          ROW_NUMBER() OVER (
            PARTITION BY
              s.CodigoEmpresa,
              s.CodigoAlmacen,
              s.CodigoArticulo,
              ISNULL(s.TipoUnidadMedida_, ''),
              ISNULL(s.Partida, ''),
              ISNULL(s.CodigoColor_, ''),
              ISNULL(s.CodigoTalla01_, '')
            ORDER BY
              CASE WHEN s.Ejercicio = @ejercicioActual THEN 0 ELSE 1 END,
              s.Ejercicio DESC
          ) AS rn
        FROM AcumuladoStock s
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.Periodo = @periodoBase
          AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
      ),
      AcumuladoStockActual AS (
        SELECT *
        FROM AcumuladoStockVersionado
        WHERE rn = 1
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
          END,
          a.CodigoArticulo
      ) a
    `;
  }

async function sincronizacionAutomatica() {
  console.log('ðŸ”„ [SYNC AUTO] Iniciando sincronizaciÃ³n automÃ¡tica...');
  
  try {
    // Verificar que getPool() estÃ© conectado
    if (!getPool() || !getPool().connected) {
      console.log('â³ [SYNC AUTO] Esperando conexiÃ³n a BD...');
      return;
    }

    // Obtener todas las empresas - CORREGIDO: Sin columna Activa
    const empresasResult = await getPool().request()
      .query(`
        SELECT DISTINCT CodigoEmpresa 
        FROM Empresas 
        WHERE CodigoEmpresa IN (
          SELECT CodigoEmpresa 
          FROM lsysEmpresaAplicacion 
          WHERE CodigoAplicacion = 'CON'
        ) 
        AND CodigoEmpresa <= 10000
      `);

    const empresas = empresasResult.recordset;
    const ejercicio = new Date().getFullYear();

    let totalCorregidos = 0;
    let totalErrores = 0;

    // Procesar cada empresa
    for (const empresa of empresas) {
      const codigoEmpresa = empresa.CodigoEmpresa;
      
      try {
        console.log(`ðŸ¢ [SYNC AUTO] Sincronizando empresa: ${codigoEmpresa}`);
        
        // 1. IDENTIFICAR DISCREPANCIAS - CONSULTA MEJORADA
        const discrepancias = await getPool().request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.Int, ejercicio)
          .query(`
            SELECT 
              ast.CodigoArticulo,
              ast.CodigoAlmacen,
              ast.Ubicacion,
              ast.TipoUnidadMedida_,
              ast.Partida,
              ast.CodigoColor_,
              ast.CodigoTalla01_,
              -- Stock oficial (AcumuladoStock)
              CAST(COALESCE(ast.UnidadSaldoTipo_, ast.UnidadSaldo) AS DECIMAL(18, 4)) AS StockOficial,
              -- Stock en ubicaciÃ³n (AcumuladoStockUbicacion)
              COALESCE(asu.UnidadSaldoTipo_, asu.UnidadSaldo, 0) AS StockUbicacion,
              -- Diferencia
              CAST(COALESCE(ast.UnidadSaldoTipo_, ast.UnidadSaldo) AS DECIMAL(18, 4)) - COALESCE(asu.UnidadSaldoTipo_, asu.UnidadSaldo, 0) AS Diferencia
            FROM AcumuladoStock ast
            LEFT JOIN AcumuladoStockUbicacion asu 
              ON asu.CodigoEmpresa = ast.CodigoEmpresa
              AND asu.Ejercicio = ast.Ejercicio
              AND asu.CodigoAlmacen = ast.CodigoAlmacen
              AND asu.CodigoArticulo = ast.CodigoArticulo
              AND asu.Ubicacion = ast.Ubicacion
              AND ISNULL(asu.TipoUnidadMedida_, '') = ISNULL(ast.TipoUnidadMedida_, '')
              AND ISNULL(asu.Partida, '') = ISNULL(ast.Partida, '')
              AND ISNULL(asu.CodigoColor_, '') = ISNULL(ast.CodigoColor_, '')
              AND ISNULL(asu.CodigoTalla01_, '') = ISNULL(ast.CodigoTalla01_, '')
              AND asu.Periodo = 99
            WHERE ast.CodigoEmpresa = @codigoEmpresa
              AND ast.Ejercicio = @ejercicio
              AND ast.Periodo = 99
              AND ast.CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')
              AND ast.Ubicacion IS NOT NULL 
              AND ast.Ubicacion != ''
              AND COALESCE(ast.UnidadSaldoTipo_, ast.UnidadSaldo) > 0
              -- Solo procesar discrepancias significativas
              AND ABS(
                CAST(COALESCE(ast.UnidadSaldoTipo_, ast.UnidadSaldo) AS DECIMAL(18, 4)) - COALESCE(asu.UnidadSaldoTipo_, asu.UnidadSaldo, 0)
              ) > 0.001
          `);

        console.log(`ðŸ“Š [SYNC AUTO] Empresa ${codigoEmpresa}: ${discrepancias.recordset.length} discrepancias encontradas`);

        // 2. CORREGIR CADA DISCREPANCIA
        for (const discrepancia of discrepancias.recordset) {
          try {
            await corregirDiscrepancia(discrepancia, codigoEmpresa, ejercicio);
            totalCorregidos++;
            
            // PequeÃ±a pausa para no saturar la BD
            await new Promise(resolve => setTimeout(resolve, 10));
            
          } catch (error) {
            console.error(`âŒ [SYNC AUTO] Error corrigiendo discrepancia:`, error.message);
            totalErrores++;
          }
        }

      } catch (error) {
        console.error(`âŒ [SYNC AUTO] Error en empresa ${codigoEmpresa}:`, error.message);
        totalErrores++;
      }
    }

    console.log(`âœ… [SYNC AUTO] SincronizaciÃ³n completada: ${totalCorregidos} correcciones, ${totalErrores} errores`);
    
  } catch (error) {
    console.error('âŒ [SYNC AUTO] Error general en sincronizaciÃ³n:', error);
  }
}

// âœ… FUNCIÃ“N PARA CORREGIR UNA DISCREPANCIA INDIVIDUAL
async function corregirDiscrepancia(discrepancia, codigoEmpresa, ejercicio) {
  const transaction = new sql.Transaction(getPool());
  
  try {
    await transaction.begin();

    const {
      CodigoArticulo,
      CodigoAlmacen,
      Ubicacion,
      TipoUnidadMedida_,
      Partida,
      CodigoColor_,
      CodigoTalla01_,
      StockOficial,
      StockUbicacion,
      Diferencia
    } = discrepancia;

    console.log(`ðŸ”§ [SYNC AUTO] Corrigiendo: ${CodigoArticulo} | ${CodigoAlmacen} | ${Ubicacion} | ${StockUbicacion} â†’ ${StockOficial} (Diferencia: ${Diferencia})`);

    // 1. ELIMINAR REGISTRO EXISTENTE EN ACUMULADOSTOCKUBICACION (si existe)
    const requestEliminar = new sql.Request(transaction);
    await requestEliminar
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('codigoAlmacen', sql.VarChar, CodigoAlmacen)
      .input('codigoArticulo', sql.VarChar, CodigoArticulo)
      .input('ubicacion', sql.VarChar, Ubicacion)
      .input('tipoUnidadMedida', sql.VarChar, TipoUnidadMedida_ || '')
      .input('partida', sql.VarChar, Partida || '')
      .input('codigoColor', sql.VarChar, CodigoColor_ || '')
      .input('codigoTalla', sql.VarChar, CodigoTalla01_ || '')
      .query(`
        DELETE FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND CodigoAlmacen = @codigoAlmacen
          AND CodigoArticulo = @codigoArticulo
          AND Ubicacion = @ubicacion
          AND (TipoUnidadMedida_ = @tipoUnidadMedida OR (TipoUnidadMedida_ IS NULL AND @tipoUnidadMedida = ''))
          AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
          AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
          AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
          AND Periodo = 99
      `);

    // 2. INSERTAR NUEVO REGISTRO CON EL STOCK CORRECTO
    if (StockOficial > 0) {
      const requestInsertar = new sql.Request(transaction);
      
      await requestInsertar
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.Int, ejercicio)
        .input('codigoAlmacen', sql.VarChar, CodigoAlmacen)
        .input('ubicacion', sql.VarChar, Ubicacion)
        .input('codigoArticulo', sql.VarChar, CodigoArticulo)
        .input('tipoUnidadMedida', sql.VarChar, TipoUnidadMedida_ || '')
        .input('partida', sql.VarChar, Partida || '')
        .input('codigoColor', sql.VarChar, CodigoColor_ || '')
        .input('codigoTalla', sql.VarChar, CodigoTalla01_ || '')
        .input('unidadSaldo', sql.Decimal(18, 4), StockOficial)
        .input('unidadSaldoTipo', sql.Decimal(18, 4), StockOficial)
        .query(`
          INSERT INTO AcumuladoStockUbicacion (
            CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
            CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
            UnidadSaldo, UnidadSaldoTipo_, Periodo
          ) VALUES (
            @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
            @codigoArticulo, @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla,
            @unidadSaldo, @unidadSaldoTipo, 99
          )
        `);
    }

    await transaction.commit();
    console.log(`âœ… [SYNC AUTO] Corregido: ${CodigoArticulo} | ${CodigoAlmacen} | ${Ubicacion}`);

  } catch (error) {
    if (transaction._aborted === false) {
      await transaction.rollback();
    }
    throw error;
  }
}

// âœ… CONFIGURACIÃ“N DEL CRON JOB (CADA 3 HORAS)

// FunciÃ³n para iniciar la sincronizaciÃ³n despuÃ©s de la conexiÃ³n a BD
function iniciarSincronizacionAutomatica() {
  console.log('ðŸš€ [SYNC AUTO] Configurando sistema de sincronizaciÃ³n automÃ¡tica...');
  
  // SincronizaciÃ³n INMEDIATA al arrancar (5 segundos despuÃ©s de la conexiÃ³n)
  setTimeout(() => {
    console.log('â° [SYNC AUTO] Ejecutando sincronizaciÃ³n INICIAL inmediata...');
    sincronizacionAutomatica();
  }, 5000);

  // Programar ejecuciÃ³n cada 3 horas (0 */3 * * *)
  cron.schedule('0 */3 * * *', () => {
    console.log('â° [SYNC AUTO] Ejecutando sincronizaciÃ³n programada cada 3 horas...');
    sincronizacionAutomatica();
  });

  console.log('âœ… [SYNC AUTO] Sistema configurado: SincronizaciÃ³n inicial en 5 segundos + cada 3 horas');
}

// âœ… ENDPOINT MANUAL PARA FORZAR SINCRONIZACIÃ“N
router.post('/inventario/sincronizacion-automatica', async (req, res) => {
  try {
    console.log('ðŸ”§ [SYNC MANUAL] SincronizaciÃ³n manual solicitada');
    
    // Ejecutar sincronizaciÃ³n inmediata
    await sincronizacionAutomatica();
    
    res.json({
      success: true,
      mensaje: 'SincronizaciÃ³n automÃ¡tica ejecutada manualmente'
    });
    
  } catch (error) {
    console.error('[ERROR SYNC MANUAL]', error);
    res.status(500).json({
      success: false,
      mensaje: 'Error en sincronizaciÃ³n manual',
      error: error.message
    });
  }
});

async function obtenerStockTotalLote(req, res) {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

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
      SELECT
        a.CodigoArticulo,
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
          SELECT 1
          FROM AcumuladoStockUbicacion s
          LEFT JOIN Almacenes alm
            ON alm.CodigoEmpresa = s.CodigoEmpresa
            AND alm.CodigoAlmacen = s.CodigoAlmacen
          LEFT JOIN Ubicaciones u
            ON u.CodigoEmpresa = s.CodigoEmpresa
            AND u.CodigoAlmacen = s.CodigoAlmacen
            AND u.Ubicacion = s.Ubicacion
          WHERE s.CodigoEmpresa = a.CodigoEmpresa
            AND s.Periodo = @periodoBase
            AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
            AND LTRIM(RTRIM(s.CodigoArticulo)) = LTRIM(RTRIM(a.CodigoArticulo))
            AND (@almacen = '' OR (
              ISNULL(s.CodigoAlmacen, '') LIKE @almacenLike
              OR ISNULL(alm.Almacen, '') LIKE @almacenLike
            ))
            AND (@ubicacion = '' OR (
              ISNULL(s.Ubicacion, '') LIKE @ubicacionLike
              OR ISNULL(u.DescripcionUbicacion, '') LIKE @ubicacionLike
            ))
        )
      `;
    }

    queryCodigos = `
      WITH ArticulosFiltrados AS (
        ${queryCodigos}
      )
      SELECT CodigoArticulo, RowNum
      FROM ArticulosFiltrados
      WHERE RowNum > @offset
        AND RowNum <= (@offset + @limit + 1)
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
    const codigosPagina = codigoRows.slice(0, limit).map((row) => String(row.CodigoArticulo || '').trim()).filter(Boolean);

    if (codigosPagina.length === 0) {
      return res.json({
        items: [],
        hasMore: false,
        nextOffset: null
      });
    }

    const codigoInputs = codigosPagina
      .map((_, index) => `@codigoArticulo${index}`)
      .join(', ');

    const detalleRequest = agregarContextoInventario(
      getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa),
      contexto
    );

    codigosPagina.forEach((codigoArticulo, index) => {
      detalleRequest.input(`codigoArticulo${index}`, sql.VarChar(50), codigoArticulo);
    });

    detalleRequest
      .input('almacen', sql.NVarChar(200), almacen)
      .input('almacenLike', sql.NVarChar(210), almacenLike)
      .input('ubicacion', sql.NVarChar(200), ubicacion)
      .input('ubicacionLike', sql.NVarChar(210), ubicacionLike);

    const detalleQuery = `
      ${getCteInventarioActual()},
      AlmacenPlaceholder AS (
        SELECT TOP 1
          CodigoAlmacen,
          Almacen AS NombreAlmacen
        FROM Almacenes
        WHERE CodigoEmpresa = @codigoEmpresa
        ORDER BY CASE WHEN CodigoAlmacen = 'CEN' THEN 0 ELSE 1 END, CodigoAlmacen
      ),
      CodigosSeleccionados AS (
        SELECT LTRIM(RTRIM(CodigoArticulo)) AS CodigoArticulo
        FROM Articulos
        WHERE CodigoEmpresa = @codigoEmpresa
          AND LTRIM(RTRIM(CodigoArticulo)) IN (${codigoInputs})
      ),
      CodigosStockUbicacion AS (
        SELECT DISTINCT LTRIM(RTRIM(CodigoArticulo)) AS CodigoArticulo
        FROM StockUbicacionActual
        WHERE CodigoEmpresa = @codigoEmpresa
          AND LTRIM(RTRIM(CodigoArticulo)) IN (${codigoInputs})
      ),
      CodigosAcumuladoStock AS (
        SELECT DISTINCT LTRIM(RTRIM(CodigoArticulo)) AS CodigoArticulo
        FROM AcumuladoStockActual
        WHERE CodigoEmpresa = @codigoEmpresa
          AND LTRIM(RTRIM(CodigoArticulo)) IN (${codigoInputs})
      ),
      ArticulosSinStock AS (
        SELECT
          a.CodigoEmpresa,
          a.CodigoArticulo,
          a.DescripcionArticulo,
          a.Descripcion2Articulo,
          a.UnidadMedida2_,
          a.UnidadMedidaAlternativa_,
          a.FactorConversion_,
          a.CodigoFamilia,
          a.CodigoSubfamilia
        FROM Articulos a
        INNER JOIN CodigosSeleccionados cs
          ON cs.CodigoArticulo = LTRIM(RTRIM(a.CodigoArticulo))
        LEFT JOIN CodigosStockUbicacion su
          ON su.CodigoArticulo = LTRIM(RTRIM(a.CodigoArticulo))
        LEFT JOIN CodigosAcumuladoStock ast
          ON ast.CodigoArticulo = LTRIM(RTRIM(a.CodigoArticulo))
        WHERE a.CodigoEmpresa = @codigoEmpresa
          AND su.CodigoArticulo IS NULL
          AND ast.CodigoArticulo IS NULL
      )
      SELECT
        COALESCE(a.CodigoArticulo, s.CodigoArticulo) AS CodigoArticulo,
        s.CodigoArticulo AS CodigoArticuloStock,
        COALESCE(a.DescripcionArticulo, s.CodigoArticulo) AS DescripcionArticulo,
        COALESCE(a.Descripcion2Articulo, '') AS Descripcion2Articulo,
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        s.TipoUnidadMedida_ AS UnidadStock,
        s.UnidadSaldoTipo_ AS CantidadBase,
        s.UnidadSaldoTipo_ AS Cantidad,
        s.Partida,
        s.Periodo,
        s.CodigoColor_,
        s.CodigoTalla01_,
        a.UnidadMedida2_ AS UnidadBase,
        a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
        COALESCE(a.FactorConversion_, 1) AS FactorConversion,
        a.CodigoFamilia,
        a.CodigoSubfamilia,
        s.Ejercicio,
        CASE WHEN s.Ubicacion = 'SIN-UBICACION' OR s.Ubicacion IS NULL THEN 1 ELSE 0 END AS EsSinUbicacion,
        CONCAT(
          s.CodigoArticulo, '_',
          s.CodigoAlmacen, '_',
          s.Ubicacion, '_',
          s.TipoUnidadMedida_, '_',
          ISNULL(s.Partida, ''), '_',
          ISNULL(s.CodigoColor_, ''), '_',
          ISNULL(s.CodigoTalla01_, '')
        ) AS ClaveUnica,
        NULL AS MovPosicionLinea,
        0 AS SinRegistrosAcumuladoStock
      FROM StockUbicacionActual s
      ${getArticuloApply('s')}
      LEFT JOIN Almacenes alm
        ON alm.CodigoEmpresa = s.CodigoEmpresa
        AND alm.CodigoAlmacen = s.CodigoAlmacen
      LEFT JOIN Ubicaciones u
        ON u.CodigoEmpresa = s.CodigoEmpresa
        AND u.CodigoAlmacen = s.CodigoAlmacen
        AND u.Ubicacion = s.Ubicacion
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND LTRIM(RTRIM(COALESCE(a.CodigoArticulo, s.CodigoArticulo))) IN (${codigoInputs})
        AND (@almacen = '' OR (ISNULL(s.CodigoAlmacen, '') LIKE @almacenLike OR ISNULL(alm.Almacen, '') LIKE @almacenLike))
        AND (@ubicacion = '' OR (ISNULL(s.Ubicacion, '') LIKE @ubicacionLike OR ISNULL(u.DescripcionUbicacion, '') LIKE @ubicacionLike))

      UNION ALL

      SELECT
        a.CodigoArticulo AS CodigoArticulo,
        a.CodigoArticulo AS CodigoArticuloStock,
        a.DescripcionArticulo,
        COALESCE(a.Descripcion2Articulo, '') AS Descripcion2Articulo,
        ap.CodigoAlmacen,
        ap.NombreAlmacen,
        'SIN-UBICACION' AS Ubicacion,
        'Stock sin ubicacion asignada' AS DescripcionUbicacion,
        '' AS UnidadStock,
        CAST(0 AS DECIMAL(18, 4)) AS CantidadBase,
        CAST(0 AS DECIMAL(18, 4)) AS Cantidad,
        '' AS Partida,
        @periodoBase AS Periodo,
        '' AS CodigoColor_,
        '' AS CodigoTalla01_,
        a.UnidadMedida2_ AS UnidadBase,
        a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
        COALESCE(a.FactorConversion_, 1) AS FactorConversion,
        a.CodigoFamilia,
        a.CodigoSubfamilia,
        @ejercicioBase AS Ejercicio,
        1 AS EsSinUbicacion,
        CONCAT(a.CodigoArticulo, '_', ap.CodigoAlmacen, '_', 'SIN-UBICACION', '_', 'unidades', '_', '', '_', '', '_', '') AS ClaveUnica,
        NULL AS MovPosicionLinea,
        1 AS SinRegistrosAcumuladoStock
      FROM ArticulosSinStock a
      CROSS JOIN AlmacenPlaceholder ap
      ORDER BY CodigoArticulo, CodigoAlmacen, Ubicacion, UnidadStock
    `;

    const detalleResult = await detalleRequest.query(detalleQuery);
    const items = detalleResult.recordset || [];

    items.forEach((row) => {
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

    console.log(`[INVENTARIO] Lote rapido obtenido: ${codigosPagina.length} articulos, ${items.length} registros de detalle, hasMore=${hasMore}`);

    return res.json({
      items,
      hasMore,
      nextOffset: hasMore ? offset + codigosPagina.length : null
    });
  } catch (error) {
    console.error('[ERROR STOCK TOTAL LOTE]', error);
    return res.status(500).json({
      success: false,
      mensaje: 'Error al obtener el lote de inventario',
      error: error.message
    });
  }
}

router.get('/inventario/stock-total-lote', obtenerStockTotalLote);
router.get('/inventario/stock-total-completo', obtenerStockTotalLote);

// ============================================


router.get('/buscar-articulos', async (req, res) => {
  const { termino } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    if (!termino || termino.trim().length < 2) {
      return res.json([]);
    }

    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('termino', sql.VarChar, `%${termino}%`)
      .query(`
        SELECT TOP 20 
          a.CodigoArticulo,
          a.DescripcionArticulo
        FROM Articulos a
        WHERE a.CodigoEmpresa = @codigoEmpresa
          AND (a.CodigoArticulo LIKE @termino 
               OR a.DescripcionArticulo LIKE @termino)
        ORDER BY a.DescripcionArticulo
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR BUSCAR ARTICULOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al buscar artÃ­culos.',
      error: err.message
    });
  }
});

router.get('/inventario/almacenes-ajuste', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa) {
    return res.status(400).json({
      success: false,
      mensaje: 'CÃ³digo de empresa requerido.'
    });
  }

  try {
    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT
          CodigoAlmacen,
          Almacen
        FROM Almacenes
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5', '000', 'SEC')
        ORDER BY CodigoAlmacen
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ALMACENES AJUSTE INVENTARIO]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al obtener almacenes para nuevo ajuste.',
      error: err.message
    });
  }
});

// âœ… 9.3 OBTENER ARTÃCULOS POR UBICACIÃ“N (CORREGIDO)
router.get('/stock/por-ubicacion', async (req, res) => {
  const { codigoAlmacen, ubicacion, page = 1, pageSize = 100 } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !codigoAlmacen || !ubicacion) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'CÃ³digo de empresa, almacÃ©n y ubicaciÃ³n requeridos.' 
    });
  }

  try {
    const offset = (page - 1) * pageSize;
    const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
    
    // Consulta para obtener el total de registros
    const countResult = await agregarContextoInventario(
      getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacion),
      contexto
    )
      .query(`
        ${getCteInventarioActual()}
        SELECT COUNT(*) AS TotalCount
        FROM StockUbicacionActual s
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.CodigoAlmacen = @codigoAlmacen
          AND s.Ubicacion = @ubicacion
          AND s.UnidadSaldo > 0
      `);
    
    const total = countResult.recordset[0].TotalCount;
    
    // Consulta corregida - Incluye todos los almacenes
    const result = await agregarContextoInventario(
      getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacion),
      contexto
    )
      .query(`
        ${getCteInventarioActual()}
        SELECT 
          COALESCE(a.CodigoArticulo, s.CodigoArticulo) AS CodigoArticulo,
          s.CodigoArticulo AS CodigoArticuloStock,
          COALESCE(a.DescripcionArticulo, s.CodigoArticulo) AS DescripcionArticulo,
          COALESCE(a.Descripcion2Articulo, '') AS Descripcion2Articulo,
          s.UnidadSaldo AS Cantidad,
          s.TipoUnidadMedida_ AS UnidadMedida,
          a.UnidadMedida2_ AS UnidadBase,
          a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          COALESCE(a.FactorConversion_, 1) AS FactorConversion,
          s.Partida,
          s.CodigoColor_,
          c.Color_ AS NombreColor,
          s.CodigoTalla01_ AS Talla
        FROM StockUbicacionActual s
        ${getArticuloApply('s')}
        LEFT JOIN Colores_ c 
          ON c.CodigoColor_ = s.CodigoColor_
          AND c.CodigoEmpresa = s.CodigoEmpresa
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.CodigoAlmacen = @codigoAlmacen
          AND s.Ubicacion = @ubicacion
          AND s.UnidadSaldo > 0
        ORDER BY COALESCE(a.DescripcionArticulo, s.CodigoArticulo)
        OFFSET ${offset} ROWS
        FETCH NEXT ${pageSize} ROWS ONLY
      `);
      
    res.json({
      success: true,
      articulos: result.recordset,
      total: total
    });
  } catch (err) {
    console.error('[ERROR STOCK UBICACION]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener artÃ­culos por ubicaciÃ³n',
      error: err.message 
    });
  }
});

// âœ… 9.4 OBTENER STOCK POR MÃšLTIPLES ARTÃCULOS (CORREGIDO)
router.post('/ubicacionesMultiples', async (req, res) => {
  const { articulos } = req.body;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!articulos || !Array.isArray(articulos)) {
    return res.status(400).json({
      success: false,
      mensaje: 'Lista de artÃ­culos requerida en formato array.'
    });
  }

  try {
    const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
    const codigosArticulos = articulos.map(art => art.codigo);
    
    if (codigosArticulos.length === 0) {
      return res.json({});
    }

    // Crear placeholders para la consulta
    const articuloPlaceholders = codigosArticulos.map((_, i) => `@articulo${i}`).join(',');
    
    const query = `
      ${getCteInventarioActual()}
      SELECT 
        COALESCE(a.CodigoArticulo, s.CodigoArticulo) AS CodigoArticulo,
        s.CodigoArticulo AS CodigoArticuloStock,
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        CAST(s.UnidadSaldo AS DECIMAL(18, 2)) AS UnidadSaldo,
        COALESCE(NULLIF(s.TipoUnidadMedida_, ''), 'unidades') AS UnidadMedida,
        s.Partida,
        s.CodigoColor_,
        s.CodigoTalla01_
      FROM StockUbicacionActual s
      ${getArticuloApply('s')}
      LEFT JOIN Almacenes alm 
        ON alm.CodigoEmpresa = s.CodigoEmpresa 
        AND alm.CodigoAlmacen = s.CodigoAlmacen
      LEFT JOIN Ubicaciones u 
        ON u.CodigoEmpresa = s.CodigoEmpresa 
        AND u.CodigoAlmacen = s.CodigoAlmacen 
        AND u.Ubicacion = s.Ubicacion
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND s.UnidadSaldo > 0
        AND s.CodigoArticulo IN (${articuloPlaceholders})
      ORDER BY s.CodigoArticulo, s.UnidadSaldo DESC
    `;

    const request = agregarContextoInventario(
      getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa),
      contexto
    );

    // AÃ±adir parÃ¡metros para cada artÃ­culo
    codigosArticulos.forEach((codigo, index) => {
      request.input(`articulo${index}`, sql.VarChar, codigo);
    });

    const result = await request.query(query);

    console.log(`[DEBUG UBICACIONES] Consulta ejecutada para ${codigosArticulos.length} artÃ­culos`);
    console.log(`[DEBUG UBICACIONES] Resultados encontrados:`, result.recordset.length);

    // Agrupar por artÃ­culo
    const grouped = {};
    result.recordset.forEach(row => {
      const articulo = row.CodigoArticulo;
      if (!grouped[articulo]) {
        grouped[articulo] = [];
      }

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

    // Si no hay ubicaciones para algÃºn artÃ­culo, agregar Zona descarga para todos los almacenes reales de la empresa
    const almacenesResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT CodigoAlmacen, Almacen
        FROM Almacenes
        WHERE CodigoEmpresa = @codigoEmpresa
        ORDER BY CodigoAlmacen
      `);

    codigosArticulos.forEach(codigo => {
      if (!grouped[codigo] || grouped[codigo].length === 0) {
        console.log(`[DEBUG UBICACIONES] ArtÃ­culo ${codigo} sin stock - agregando Zona descarga para todos los almacenes`);
        grouped[codigo] = almacenesResult.recordset.map(almacen => ({
          codigoAlmacen: almacen.CodigoAlmacen,
          nombreAlmacen: almacen.Almacen || almacen.CodigoAlmacen,
          ubicacion: "Zona descarga",
          descripcionUbicacion: "Stock disponible para expediciÃ³n directa",
          unidadSaldo: Infinity,
          unidadMedida: 'unidades',
          partida: null,
          codigoColor: '',
          codigoTalla: ''
        }));
      }
    });

    res.json(grouped);
  } catch (err) {
    console.error('[ERROR UBICACIONES MULTIPLES]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al obtener ubicaciones mÃºltiples',
      error: err.message
    });
  }
});

// âœ… 9.7 OBTENER STOCK SIN UBICACIÃ“N (CORREGIDO)
router.get('/inventario/stock-sin-ubicacion', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'CÃ³digo de empresa requerido.' 
    });
  }

  try {
    const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
    const result = await agregarContextoInventario(
      getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa),
      contexto
    )
      .query(`
        ${getCteInventarioActual()},
        StockTotal AS (
          SELECT 
            CodigoArticulo,
            CodigoAlmacen,
            TipoUnidadMedida_,
            Partida,
            CodigoColor_,
            CodigoTalla01_,
            SUM(CAST(UnidadSaldo AS DECIMAL(18, 0))) as StockTotal
          FROM AcumuladoStockActual
          WHERE CodigoEmpresa = @codigoEmpresa
            AND UnidadSaldo > 0
          GROUP BY CodigoArticulo, CodigoAlmacen, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
        ),

        StockConUbicacion AS (
          SELECT 
            CodigoArticulo,
            CodigoAlmacen,
            TipoUnidadMedida_,
            Partida,
            CodigoColor_,
            CodigoTalla01_,
            SUM(CAST(UnidadSaldo AS DECIMAL(18, 0))) as StockConUbicacion
          FROM StockUbicacionActual
          WHERE CodigoEmpresa = @codigoEmpresa
            AND UnidadSaldo > 0
          GROUP BY CodigoArticulo, CodigoAlmacen, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
        )

        SELECT 
          st.CodigoArticulo,
          a.DescripcionArticulo,
          a.Descripcion2Articulo,
          st.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          '' AS Ubicacion,
          NULL AS DescripcionUbicacion,
          st.Partida,
          st.TipoUnidadMedida_ AS UnidadStock,
          a.UnidadMedida2_ AS UnidadBase,
          a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          a.FactorConversion_ AS FactorConversion,
          st.CodigoColor_,
          st.CodigoTalla01_,
          (st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) AS Cantidad,
          CASE 
            WHEN st.TipoUnidadMedida_ = a.UnidadMedidaAlternativa_ 
              THEN CAST((st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) * a.FactorConversion_ AS DECIMAL(18, 0))
            WHEN st.TipoUnidadMedida_ = a.UnidadMedida2_ 
              THEN CAST((st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) AS DECIMAL(18, 0))
            ELSE CAST((st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) * a.FactorConversion_ AS DECIMAL(18, 0))
          END AS CantidadBase,
          CONCAT(
            @codigoEmpresa, '_',
            @ejercicioBase, '_',
            st.CodigoAlmacen, '_',
            'SIN_UBICACION', '_',
            st.CodigoArticulo, '_',
            ISNULL(st.TipoUnidadMedida_, 'unidades'), '_',
            ISNULL(st.Partida, ''), '_',
            ISNULL(st.CodigoColor_, ''), '_',
            ISNULL(st.CodigoTalla01_, ''), '_',
            CAST((st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) AS VARCHAR(20))
          ) AS ClaveUnica,
          0 AS MovPosicionLinea
        FROM StockTotal st
        LEFT JOIN Articulos a 
          ON a.CodigoEmpresa = @codigoEmpresa 
          AND a.CodigoArticulo = st.CodigoArticulo
        LEFT JOIN Almacenes alm 
          ON alm.CodigoEmpresa = @codigoEmpresa 
          AND alm.CodigoAlmacen = st.CodigoAlmacen
        LEFT JOIN StockConUbicacion sc 
          ON sc.CodigoArticulo = st.CodigoArticulo
          AND sc.CodigoAlmacen = st.CodigoAlmacen
          AND sc.TipoUnidadMedida_ = st.TipoUnidadMedida_
          AND ISNULL(sc.Partida, '') = ISNULL(st.Partida, '')
          AND ISNULL(sc.CodigoColor_, '') = ISNULL(st.CodigoColor_, '')
          AND ISNULL(sc.CodigoTalla01_, '') = ISNULL(st.CodigoTalla01_, '')
        WHERE (st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) > 0
        ORDER BY st.CodigoArticulo, st.CodigoAlmacen
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR STOCK SIN UBICACION]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock sin ubicaciÃ³n',
      error: err.message 
    });
  }
});

// âœ… 9.7 OBTENER HISTÃ“RICO DE AJUSTES DE INVENTARIO (VERSIÃ“N MEJORADA - INCLUYE INVENTARIOS)
router.get('/inventario/historial-ajustes-v2', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({
      success: false,
      mensaje: 'No autenticado'
    });
  }

  const codigoEmpresa = req.user.CodigoEmpresa;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const requestedLimit = parseInt(req.query.limit, 10) || 20;
  const limit = [20, 25].includes(requestedLimit) ? requestedLimit : 20;
  const offset = (page - 1) * limit;

  const hoy = new Date();
  const haceTreintaDias = new Date(hoy);
  haceTreintaDias.setDate(hoy.getDate() - 30);

  const fechaDesde = req.query.fechaDesde || haceTreintaDias.toISOString().split('T')[0];
  const fechaHasta = req.query.fechaHasta || hoy.toISOString().split('T')[0];

  try {
    console.log(
      `[HISTORIAL INVENTARIO V2] Empresa ${codigoEmpresa} | desde ${fechaDesde} | hasta ${fechaHasta} | page ${page} | limit ${limit}`
    );

    const totalResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('fechaDesde', sql.Date, fechaDesde)
      .input('fechaHasta', sql.Date, fechaHasta)
      .query(`
        SELECT COUNT(*) AS Total
        FROM MovimientoStock m
        WHERE m.CodigoEmpresa = @codigoEmpresa
          AND m.TipoMovimiento = 5
          AND CONVERT(date, m.FechaRegistro) BETWEEN @fechaDesde AND @fechaHasta
          AND (
            (m.Unidades IS NOT NULL AND m.Unidades <> 0)
            OR ISNULL(m.Comentario, '') LIKE 'Inventario:%'
          )
      `);

    const total = Number(totalResult.recordset[0]?.Total || 0);
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    const movimientosResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('fechaDesde', sql.Date, fechaDesde)
      .input('fechaHasta', sql.Date, fechaHasta)
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT
          m.Ejercicio,
          m.Periodo,
          m.CodigoArticulo,
          COALESCE(a.DescripcionArticulo, m.CodigoArticulo) AS DescripcionArticulo,
          m.CodigoAlmacen,
          COALESCE(alm.Almacen, m.CodigoAlmacen) AS NombreAlmacen,
          m.Ubicacion,
          COALESCE(u.DescripcionUbicacion, '') AS DescripcionUbicacion,
          ISNULL(m.Partida, '') AS Partida,
          CAST(ISNULL(m.Unidades, 0) AS DECIMAL(18, 4)) AS Diferencia,
          CASE
            WHEN CHARINDEX(' por ', ISNULL(m.Comentario, '')) > 0
              THEN LTRIM(RTRIM(LEFT(
                ISNULL(m.Comentario, ''),
                LEN(ISNULL(m.Comentario, '')) - LEN(SUBSTRING(
                  ISNULL(m.Comentario, ''),
                  CHARINDEX(' por ', ISNULL(m.Comentario, '')),
                  LEN(ISNULL(m.Comentario, ''))
                ))
              )))
            ELSE ISNULL(m.Comentario, '')
          END AS Comentario,
          CASE
            WHEN NULLIF(LTRIM(RTRIM(ISNULL(m.UsuarioProceso, ''))), '') IS NOT NULL
              AND LTRIM(RTRIM(ISNULL(m.UsuarioProceso, ''))) <> '0'
              THEN LTRIM(RTRIM(ISNULL(m.UsuarioProceso, '')))
            WHEN CHARINDEX(' por ', ISNULL(m.Comentario, '')) > 0
              THEN NULLIF(LTRIM(RTRIM(SUBSTRING(
                ISNULL(m.Comentario, ''),
                CHARINDEX(' por ', ISNULL(m.Comentario, '')) + LEN(' por '),
                LEN(ISNULL(m.Comentario, ''))
              ))), '')
            ELSE NULL
          END AS Usuario,
          m.FechaRegistro,
          ISNULL(m.UnidadMedida1_, '') AS UnidadMedida,
          ISNULL(m.CodigoColor_, '') AS CodigoColor,
          ISNULL(m.CodigoTalla01_, '') AS CodigoTalla01,
          'MOVIMIENTO' AS TipoRegistro
        FROM MovimientoStock m
        LEFT JOIN Articulos a
          ON a.CodigoEmpresa = m.CodigoEmpresa
          AND a.CodigoArticulo = m.CodigoArticulo
        LEFT JOIN Almacenes alm
          ON alm.CodigoEmpresa = m.CodigoEmpresa
          AND alm.CodigoAlmacen = m.CodigoAlmacen
        LEFT JOIN Ubicaciones u
          ON u.CodigoEmpresa = m.CodigoEmpresa
          AND u.CodigoAlmacen = m.CodigoAlmacen
          AND u.Ubicacion = m.Ubicacion
        WHERE m.CodigoEmpresa = @codigoEmpresa
          AND m.TipoMovimiento = 5
          AND CONVERT(date, m.FechaRegistro) BETWEEN @fechaDesde AND @fechaHasta
          AND (
            (m.Unidades IS NOT NULL AND m.Unidades <> 0)
            OR ISNULL(m.Comentario, '') LIKE 'Inventario:%'
          )
        ORDER BY m.FechaRegistro DESC, m.CodigoArticulo ASC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    res.json({
      success: true,
      items: movimientosResult.recordset,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages
      },
      filtros: {
        fechaDesde,
        fechaHasta
      }
    });
  } catch (err) {
    console.error('[ERROR HISTORIAL AJUSTES V2]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al obtener historial de ajustes.',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

router.get('/inventario/historial-ajustes', async (req, res) => {
  // 1. Obtener empresa del usuario autenticado
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ 
      success: false, 
      mensaje: 'No autenticado' 
    });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  const anioActual = new Date().getFullYear();

  try {
    console.log(`ðŸ“Š Obteniendo historial de ajustes para empresa: ${codigoEmpresa}, aÃ±o: ${anioActual}`);
    
    // 2. Obtener fechas con ajustes - COMBINANDO MOVIMIENTOSTOCK E INVENTARIOS
    const fechasResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, anioActual)
      .query(`
        -- Fechas de MovimientoStock (ajustes)
        SELECT DISTINCT CONVERT(date, FechaRegistro) AS Fecha, 'MOVIMIENTO' AS Tipo
        FROM MovimientoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND TipoMovimiento = 5  -- 5: Ajuste
          AND (
            (Unidades IS NOT NULL AND Unidades != 0)
            OR Comentario LIKE 'Inventario:%'
          )
        
        UNION
        
        -- Fechas de Inventarios (ajustes manuales)
        SELECT DISTINCT CONVERT(date, FechaCreacion) AS Fecha, 'INVENTARIO' AS Tipo
        FROM Inventarios
        WHERE CodigoEmpresa = @codigoEmpresa
          AND StatusRegulariza = -1  -- Ajustes manuales
          AND YEAR(FechaCreacion) = @ejercicio
        
        ORDER BY Fecha DESC
      `);
    
    const fechas = fechasResult.recordset;
    console.log(`ðŸ“… Fechas con ajustes encontradas: ${fechas.length}`);
    
    const historial = [];
    
    // 3. Para cada fecha, obtener los ajustes de ambas tablas
    for (const fecha of fechas) {
      const fechaStr = fecha.Fecha.toISOString().split('T')[0];
      
      console.log(`ðŸ” Obteniendo ajustes para fecha: ${fechaStr}`);
      
      // Obtener ajustes de MovimientoStock
      const movimientosResult = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, anioActual)
        .input('fecha', sql.Date, fechaStr)
        .query(`
          SELECT 
            m.CodigoArticulo,
            a.DescripcionArticulo,
            m.CodigoAlmacen,
            alm.Almacen AS NombreAlmacen,
            m.Ubicacion,
            u.DescripcionUbicacion,
            m.Partida,
            m.Unidades AS Diferencia,
            m.Comentario,
            m.FechaRegistro,
            m.UnidadMedida1_ AS UnidadMedida,
            m.CodigoColor_,
            m.CodigoTalla01_,
            'MOVIMIENTO' AS TipoRegistro
          FROM MovimientoStock m
          LEFT JOIN Articulos a 
            ON a.CodigoArticulo = m.CodigoArticulo 
            AND a.CodigoEmpresa = m.CodigoEmpresa
          LEFT JOIN Almacenes alm 
            ON alm.CodigoAlmacen = m.CodigoAlmacen 
            AND alm.CodigoEmpresa = m.CodigoEmpresa
          LEFT JOIN Ubicaciones u 
            ON u.CodigoAlmacen = m.CodigoAlmacen 
            AND u.Ubicacion = m.Ubicacion 
            AND u.CodigoEmpresa = m.CodigoEmpresa
          WHERE m.CodigoEmpresa = @codigoEmpresa
            AND m.Ejercicio = @ejercicio
            AND m.TipoMovimiento = 5  -- 5: Ajuste
            AND CONVERT(date, m.FechaRegistro) = @fecha
            AND (
              (m.Unidades IS NOT NULL AND m.Unidades != 0)
              OR m.Comentario LIKE 'Inventario:%'
            )
        `);
      
      // Obtener ajustes de Inventarios
      const inventariosResult = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('fecha', sql.Date, fechaStr)
        .query(`
          SELECT 
            i.CodigoArticulo,
            a.DescripcionArticulo,
            i.CodigoAlmacen,
            alm.Almacen AS NombreAlmacen,
            i.Ubicacion,
            u.DescripcionUbicacion,
            i.Partida,
            (i.UnidadesInventario - i.UnidadesStock) AS Diferencia,
            i.Inventario AS Comentario,
            i.FechaCreacion AS FechaRegistro,
            i.TipoUnidadMedida_ AS UnidadMedida,
            i.CodigoColor_,
            i.CodigoTalla01_,
            'INVENTARIO' AS TipoRegistro
          FROM Inventarios i
          LEFT JOIN Articulos a 
            ON a.CodigoArticulo = i.CodigoArticulo 
            AND a.CodigoEmpresa = i.CodigoEmpresa
          LEFT JOIN Almacenes alm 
            ON alm.CodigoAlmacen = i.CodigoAlmacen 
            AND alm.CodigoEmpresa = i.CodigoEmpresa
          LEFT JOIN Ubicaciones u 
            ON u.CodigoAlmacen = i.CodigoAlmacen 
            AND u.Ubicacion = i.Ubicacion 
            AND u.CodigoEmpresa = i.CodigoEmpresa
          WHERE i.CodigoEmpresa = @codigoEmpresa
            AND i.StatusRegulariza = -1  -- Ajustes manuales
            AND CONVERT(date, i.FechaCreacion) = @fecha
            AND (i.UnidadesInventario - i.UnidadesStock) != 0
        `);
      
      // Combinar resultados
      const todosLosAjustes = [
        ...movimientosResult.recordset,
        ...inventariosResult.recordset
      ];
      
      console.log(`ðŸ“‹ Ajustes encontrados para ${fechaStr}: ${todosLosAjustes.length} (Movimientos: ${movimientosResult.recordset.length}, Inventarios: ${inventariosResult.recordset.length})`);
      
      if (todosLosAjustes.length > 0) {
        historial.push({
          fecha: fechaStr,
          totalAjustes: todosLosAjustes.length,
          detalles: todosLosAjustes.map(detalle => ({
            CodigoArticulo: detalle.CodigoArticulo,
            DescripcionArticulo: detalle.DescripcionArticulo || 'ArtÃ­culo no encontrado',
            CodigoAlmacen: detalle.CodigoAlmacen,
            NombreAlmacen: detalle.NombreAlmacen || detalle.CodigoAlmacen,
            Ubicacion: detalle.Ubicacion || 'N/A',
            DescripcionUbicacion: detalle.DescripcionUbicacion || 'N/A',
            Partida: detalle.Partida || 'N/A',
            Diferencia: parseFloat(detalle.Diferencia) || 0,
            Comentario: detalle.Comentario || `Ajuste manual - ${detalle.TipoRegistro}`,
            FechaRegistro: detalle.FechaRegistro,
            UnidadMedida: detalle.UnidadMedida || 'unidades',
            CodigoColor: detalle.CodigoColor_ || '',
            CodigoTalla01: detalle.CodigoTalla01_ || '',
            TipoRegistro: detalle.TipoRegistro || 'MOVIMIENTO'
          }))
        });
      }
    }
    
    console.log(`âœ… Historial completo generado con ${historial.length} dÃ­as de ajustes`);
    
    // Ordenar por fecha mÃ¡s reciente primero
    historial.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    res.json(historial);
  } catch (err) {
    console.error('[ERROR HISTORIAL AJUSTES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener historial de ajustes.',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// âœ… 9.8 OBTENER DETALLES POR MOV_POSICION_LINEA (VERSIÃ“N MEJORADA)
router.get('/stock/detalles', async (req, res) => {
  const { movPosicionLinea } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !movPosicionLinea) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan parÃ¡metros requeridos.' 
    });
  }

  try {
    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('movPosicionLinea', sql.VarChar, movPosicionLinea)
      .query(`
        SELECT 
          lt.CodigoColor_,
          c.Color_ AS NombreColor,
          lt.GrupoTalla_,
          gt.DescripcionGrupoTalla_ AS NombreGrupoTalla,
          -- Obtener descripciones de tallas
          t01.DescripcionTalla_ AS DescTalla01,
          t02.DescripcionTalla_ AS DescTalla02,
          t03.DescripcionTalla_ AS DescTalla03,
          t04.DescripcionTalla_ AS DescTalla04,
          lt.UnidadesTotalTallas_ AS Unidades,
          lt.UnidadesTalla01_,
          lt.UnidadesTalla02_,
          lt.UnidadesTalla03_,
          lt.UnidadesTalla04_
        FROM LineasPedidoClienteTallas lt
        LEFT JOIN Colores_ c 
          ON lt.CodigoColor_ = c.CodigoColor_
          AND lt.CodigoEmpresa = c.CodigoEmpresa
        LEFT JOIN GrupoTallas_ gt 
          ON lt.GrupoTalla_ = gt.GrupoTalla_ 
          AND lt.CodigoEmpresa = gt.CodigoEmpresa
        LEFT JOIN Tallas_ t01 ON lt.CodigoEmpresa = t01.CodigoEmpresa AND lt.GrupoTalla_ = t01.GrupoTalla_ AND lt.CodigoTalla01_ = t01.CodigoTalla_
        LEFT JOIN Tallas_ t02 ON lt.CodigoEmpresa = t02.CodigoEmpresa AND lt.GrupoTalla_ = t02.GrupoTalla_ AND lt.CodigoTalla02_ = t02.CodigoTalla_
        LEFT JOIN Tallas_ t03 ON lt.CodigoEmpresa = t03.CodigoEmpresa AND lt.GrupoTalla_ = t03.GrupoTalla_ AND lt.CodigoTalla03_ = t03.CodigoTalla_
        LEFT JOIN Tallas_ t04 ON lt.CodigoEmpresa = t04.CodigoEmpresa AND lt.GrupoTalla_ = t04.GrupoTalla_ AND lt.CodigoTalla04_ = t04.CodigoTalla_
        WHERE lt.CodigoEmpresa = @codigoEmpresa
          AND lt.MovPosicionLinea_ = @movPosicionLinea
      `);

    const detalles = result.recordset.map(detalle => {
      const tallas = {
        '01': {
          descripcion: detalle.DescTalla01,
          unidades: detalle.UnidadesTalla01_
        },
        '02': {
          descripcion: detalle.DescTalla02,
          unidades: detalle.UnidadesTalla02_
        },
        '03': {
          descripcion: detalle.DescTalla03,
          unidades: detalle.UnidadesTalla03_
        },
        '04': {
          descripcion: detalle.DescTalla04,
          unidades: detalle.UnidadesTalla04_
        }
      };

      return {
        color: {
          codigo: detalle.CodigoColor_,
          nombre: detalle.NombreColor
        },
        grupoTalla: {
          codigo: detalle.GrupoTalla_,
          nombre: detalle.NombreGrupoTalla
        },
        unidades: detalle.Unidades,
        tallas
      };
    });

    res.json(detalles);
  } catch (err) {
    console.error('[ERROR DETALLES STOCK]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener detalles del stock.',
      error: err.message 
    });
  }
});

// âœ… 9.9 OBTENER FAMILIAS
router.get('/familias', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'CÃ³digo de empresa requerido.' 
    });
  }

  try {
    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT DISTINCT 
          CodigoFamilia AS codigo, 
          CodigoFamilia AS nombre
        FROM Articulos
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoFamilia IS NOT NULL
          AND CodigoFamilia <> ''
        ORDER BY CodigoFamilia
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR FAMILIAS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener familias',
      error: err.message 
    });
  }
});

// âœ… 9.10 OBTENER SUBFAMILIAS
router.get('/subfamilias', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'CÃ³digo de empresa requerido.' 
    });
  }

  try {
    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT DISTINCT 
          CodigoSubfamilia AS codigo, 
          CodigoSubfamilia AS nombre
        FROM Articulos
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoSubfamilia IS NOT NULL
          AND CodigoSubfamilia <> ''
        ORDER BY CodigoSubfamilia
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR SUBFAMILIAS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener subfamilias',
      error: err.message 
    });
  }
});

// âœ… 9.11 OBTENER ARTÃCULOS CON STOCK (CORREGIDO)
router.get('/stock/articulos-con-stock', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 50;
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
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND (
          s.CodigoArticulo LIKE @searchTerm 
          OR a.DescripcionArticulo LIKE @searchTerm
        )
      GROUP BY COALESCE(a.CodigoArticulo, s.CodigoArticulo), s.CodigoArticulo, COALESCE(a.DescripcionArticulo, s.CodigoArticulo)
      HAVING SUM(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0)) > 0
      ORDER BY DescripcionArticulo
      OFFSET ${offset} ROWS
      FETCH NEXT ${pageSize} ROWS ONLY
    `;

    const countQuery = `
      ${getCteInventarioActual()}
      SELECT COUNT(*) AS Total
      FROM (
        SELECT 
          s.CodigoArticulo
        FROM StockUbicacionActual s
        ${getArticuloApply('s')}
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND (
            s.CodigoArticulo LIKE @searchTerm 
            OR a.DescripcionArticulo LIKE @searchTerm
          )
        GROUP BY s.CodigoArticulo
        HAVING SUM(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0)) > 0
      ) AS subquery
    `;

    const request = agregarContextoInventario(
      getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('searchTerm', sql.VarChar, `%${searchTerm}%`),
      contexto
    );

    const result = await request.query(query);
    const countResult = await request.query(countQuery);
    
    const total = countResult.recordset[0].Total;
    const totalPages = Math.ceil(total / pageSize);

    res.json({
      articulos: result.recordset,
      pagination: {
        page,
        pageSize,
        total,
        totalPages
      }
    });
  } catch (err) {
    console.error('[ERROR ARTICULOS CON STOCK]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener artÃ­culos con stock',
      error: err.message 
    });
  }
});

// âœ… 9.19 OBTENER UBICACIONES POR ALMACÃ‰N (VERSIÃ“N CORREGIDA Y MEJORADA)
router.get('/ubicaciones/:codigoAlmacen', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { codigoAlmacen } = req.params;
  const { incluirSinUbicacion = 'false' } = req.query;

  if (!codigoEmpresa || !codigoAlmacen) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'CÃ³digo de empresa y almacÃ©n requeridos.' 
    });
  }

  try {
    const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
    let query = `
      ${getCteInventarioActual()}
      SELECT 
        u.Ubicacion, 
        u.DescripcionUbicacion,
        alm.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        (SELECT COUNT(*) 
         FROM StockUbicacionActual s 
         WHERE s.CodigoEmpresa = u.CodigoEmpresa 
           AND s.CodigoAlmacen = u.CodigoAlmacen 
           AND s.Ubicacion = u.Ubicacion 
           AND s.UnidadSaldo > 0) AS CantidadArticulos
      FROM Ubicaciones u
      INNER JOIN Almacenes alm ON alm.CodigoEmpresa = u.CodigoEmpresa 
        AND alm.CodigoAlmacen = u.CodigoAlmacen
      WHERE u.CodigoEmpresa = @codigoEmpresa 
        AND u.CodigoAlmacen = @codigoAlmacen
    `;

    // Si se solicita incluir sin ubicaciÃ³n, agregar opciÃ³n virtual
    if (incluirSinUbicacion === 'true') {
      query = `
        ${query}
        UNION ALL
        SELECT 
          'SIN-UBICACION' AS Ubicacion,
          'Stock sin ubicaciÃ³n asignada' AS DescripcionUbicacion,
          @codigoAlmacen AS CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
           (SELECT COUNT(DISTINCT s.CodigoArticulo)
           FROM AcumuladoStockActual s
           LEFT JOIN StockUbicacionActual su 
             ON su.CodigoEmpresa = s.CodigoEmpresa 
             AND su.CodigoAlmacen = s.CodigoAlmacen 
             AND su.CodigoArticulo = s.CodigoArticulo
             AND su.UnidadSaldo > 0
           WHERE s.CodigoEmpresa = @codigoEmpresa
             AND s.CodigoAlmacen = @codigoAlmacen
             AND s.UnidadSaldo > 0
             AND su.CodigoArticulo IS NULL) AS CantidadArticulos
        FROM Almacenes alm
        WHERE alm.CodigoEmpresa = @codigoEmpresa
          AND alm.CodigoAlmacen = @codigoAlmacen
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
    console.error('[ERROR UBICACIONES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener ubicaciones',
      error: err.message 
    });
  }
});

// âœ… 9.20 OBTENER INFORMACIÃ“N DE ARTÃCULO (VERSIÃ“N CORREGIDA)
router.get('/articulos/:codigoArticulo', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { codigoArticulo } = req.params;

  try {
    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT 
          CodigoArticulo, 
          DescripcionArticulo, 
          UnidadMedida2_, 
          UnidadMedidaAlternativa_, 
          FactorConversion_
        FROM Articulos 
        WHERE CodigoEmpresa = @codigoEmpresa 
          AND CodigoArticulo = @codigoArticulo
      `);
      
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'ArtÃ­culo no encontrado' });
    }
    
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('[ERROR ARTICULO]', err);
    res.status(500).json({ error: 'Error al obtener artÃ­culo' });
  }
});

// âœ… 9.21 BUSCAR UBICACIONES (NUEVO ENDPOINT)
router.get('/articulos/:codigoArticulo/variantes-contexto', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { codigoArticulo } = req.params;

  try {
    const articuloResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT TOP 1
          CodigoArticulo,
          DescripcionArticulo,
          UnidadMedida2_,
          UnidadMedidaAlternativa_,
          FactorConversion_,
          GrupoTalla_,
          Colores_
        FROM Articulos
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoArticulo = @codigoArticulo
      `);

    if (articuloResult.recordset.length === 0) {
      return res.status(404).json({ success: false, mensaje: 'Articulo no encontrado' });
    }

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
          SELECT
            gt.GrupoTalla_,
            gt.DescripcionGrupoTalla_,
            gt.NumeroTallas_,
            v.Orden,
            v.CodigoTalla,
            v.DescripcionTalla
          FROM GrupoTallas_ gt
          CROSS APPLY (VALUES
            ${tallaValues}
          ) v(Orden, CodigoTalla, DescripcionTalla)
          WHERE gt.CodigoEmpresa = @codigoEmpresa
            AND gt.GrupoTalla_ = @grupoTalla
            AND NULLIF(LTRIM(RTRIM(v.CodigoTalla)), '') IS NOT NULL
          ORDER BY v.Orden
        `);

      if (tallasResult.recordset.length > 0) {
        const first = tallasResult.recordset[0];
        grupoTallaInfo = {
          codigo: first.GrupoTalla_,
          descripcion: first.DescripcionGrupoTalla_,
          numeroTallas: first.NumeroTallas_
        };
        tallas = tallasResult.recordset.map((talla) => ({
          codigo: talla.CodigoTalla,
          descripcion: talla.DescripcionTalla || talla.CodigoTalla
        }));
      }
    }

    const coloresResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT DISTINCT
          x.CodigoColor_,
          COALESCE(c.Color_, x.CodigoColor_) AS NombreColor
        FROM (
          SELECT ca.CodigoColor_
          FROM ColoresArticulo_ ca
          WHERE ca.CodigoEmpresa = @codigoEmpresa
            AND ca.CodigoArticulo = @codigoArticulo
            AND NULLIF(LTRIM(RTRIM(ca.CodigoColor_)), '') IS NOT NULL

          UNION

          SELECT s.CodigoColor_
          FROM AcumuladoStockUbicacion s
          WHERE s.CodigoEmpresa = @codigoEmpresa
            AND s.CodigoArticulo = @codigoArticulo
            AND NULLIF(LTRIM(RTRIM(s.CodigoColor_)), '') IS NOT NULL
        ) x
        LEFT JOIN Colores_ c
          ON c.CodigoEmpresa = @codigoEmpresa
          AND c.CodigoColor_ = x.CodigoColor_
        ORDER BY x.CodigoColor_
      `);

    const colores = coloresResult.recordset.map((color) => ({
      codigo: color.CodigoColor_,
      nombre: color.NombreColor || color.CodigoColor_
    }));

    res.json({
      success: true,
      articulo,
      usaTallas,
      usaColores: usaColores || colores.length > 0,
      grupoTalla: grupoTallaInfo,
      tallas,
      colores
    });
  } catch (err) {
    console.error('[ERROR VARIANTES CONTEXTO ARTICULO]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al obtener contexto de variantes del articulo',
      error: err.message
    });
  }
});

router.get('/buscar-ubicaciones', async (req, res) => {
  const { termino } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    if (!termino || termino.trim().length < 2) {
      return res.json([]);
    }

    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('termino', sql.VarChar, `%${termino}%`)
      .query(`
        SELECT 
          u.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          u.Ubicacion,
          u.DescripcionUbicacion,
          (SELECT COUNT(*) 
           FROM AcumuladoStockUbicacion s 
           WHERE s.CodigoEmpresa = u.CodigoEmpresa 
             AND s.CodigoAlmacen = u.CodigoAlmacen 
             AND s.Ubicacion = u.Ubicacion 
             AND s.Periodo = 99 
             AND s.UnidadSaldo > 0) AS CantidadArticulos
        FROM Ubicaciones u
        INNER JOIN Almacenes alm ON alm.CodigoEmpresa = u.CodigoEmpresa 
          AND alm.CodigoAlmacen = u.CodigoAlmacen
        WHERE u.CodigoEmpresa = @codigoEmpresa
          AND (u.Ubicacion LIKE @termino 
               OR u.DescripcionUbicacion LIKE @termino
               OR alm.Almacen LIKE @termino)
        ORDER BY u.Ubicacion
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR BUSCAR UBICACIONES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al buscar ubicaciones.',
      error: err.message
    });
  }
});

// âœ… 9.22 OBTENER STOCK POR ARTÃCULO
router.get('/stock/por-articulo', async (req, res) => {
  const { codigoArticulo, incluirSinUbicacion } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !codigoArticulo) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'CÃ³digo de empresa y artÃ­culo requeridos.' 
    });
  }

  try {
    const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
    const request = agregarContextoInventario(
      getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, codigoArticulo),
      contexto
    );

    // Consulta principal para stock con ubicaciÃ³n - INCLUYENDO NEGATIVOS Y CERO
    let query = `
      ${getCteInventarioActual()}
      SELECT 
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        -- ðŸ”¥ USAR UnidadSaldoTipo_ CUANDO HAY VARIANTES (color o talla)
        CASE 
          WHEN (s.CodigoColor_ IS NOT NULL AND s.CodigoColor_ != '') 
            OR (s.CodigoTalla01_ IS NOT NULL AND s.CodigoTalla01_ != '') 
            THEN CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo) AS DECIMAL(18, 2))
          ELSE CAST(s.UnidadSaldo AS DECIMAL(18, 2))
        END AS Cantidad,
        COALESCE(NULLIF(s.TipoUnidadMedida_, ''), 'unidades') AS UnidadMedida,
        s.TipoUnidadMedida_,
        s.Partida,
        s.CodigoColor_,
        s.CodigoTalla01_ AS Talla,
        c.Color_ AS NombreColor,
        COALESCE(a.DescripcionArticulo, s.CodigoArticulo) AS DescripcionArticulo,
        COALESCE(a.Descripcion2Articulo, '') AS Descripcion2Articulo,
        0 AS EsSinUbicacion,
        CONCAT(
          s.CodigoAlmacen, '_', 
          s.Ubicacion, '_',
          s.TipoUnidadMedida_, '_',
          ISNULL(s.Partida, ''), '_',
          ISNULL(s.CodigoColor_, ''), '_',
          ISNULL(s.CodigoTalla01_, '')
        ) AS GrupoUnico,
        CAST(s.UnidadSaldo AS DECIMAL(18, 2)) AS UnidadSaldo_Original,
        CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo) AS DECIMAL(18, 2)) AS UnidadSaldoTipo_Corregido
      FROM StockUbicacionActual s
      LEFT JOIN Almacenes alm 
        ON alm.CodigoEmpresa = s.CodigoEmpresa 
        AND alm.CodigoAlmacen = s.CodigoAlmacen
      ${getArticuloApply('s')}
      LEFT JOIN Ubicaciones u 
        ON u.CodigoEmpresa = s.CodigoEmpresa 
        AND u.CodigoAlmacen = s.CodigoAlmacen 
        AND u.Ubicacion = s.Ubicacion
      LEFT JOIN Colores_ c 
        ON c.CodigoEmpresa = s.CodigoEmpresa 
        AND c.CodigoColor_ = s.CodigoColor_
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND s.CodigoArticulo = @codigoArticulo
        -- ðŸ”¥ CORRECCIÃ“N: QUITAR FILTRO QUE EXCLUYE NEGATIVOS Y CERO
    `;

    // Si se solicita incluir stock sin ubicaciÃ³n
    if (incluirSinUbicacion === 'true') {
      query = `
        ${query}
        UNION ALL
        -- Stock sin ubicaciÃ³n por almacÃ©n (sin variantes) - INCLUYENDO NEGATIVOS Y CERO
        SELECT 
          s.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          'SIN-UBICACION' AS Ubicacion,
          'Stock sin ubicaciÃ³n asignada' AS DescripcionUbicacion,
          (s.StockTotal - ISNULL(u.StockUbicado, 0)) AS Cantidad,
          'unidades' AS UnidadMedida,
          'unidades' AS TipoUnidadMedida_,
          '' AS Partida,
          '' AS CodigoColor_,
          '' AS Talla,
          '' AS NombreColor,
          a.DescripcionArticulo,
          a.Descripcion2Articulo,
          1 AS EsSinUbicacion,
          CONCAT(s.CodigoAlmacen, '_SIN-UBICACION_unidades_') AS GrupoUnico,
          (s.StockTotal - ISNULL(u.StockUbicado, 0)) AS UnidadSaldo_Original,
          (s.StockTotal - ISNULL(u.StockUbicado, 0)) AS UnidadSaldoTipo_Corregido
        FROM (
          SELECT 
            CodigoAlmacen, 
            CodigoArticulo,
            SUM(UnidadSaldo) AS StockTotal
          FROM AcumuladoStockActual
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoArticulo = @codigoArticulo
          GROUP BY CodigoAlmacen, CodigoArticulo
        ) s
        LEFT JOIN Almacenes alm ON s.CodigoAlmacen = alm.CodigoAlmacen AND alm.CodigoEmpresa = @codigoEmpresa
        LEFT JOIN Articulos a ON a.CodigoEmpresa = @codigoEmpresa AND a.CodigoArticulo = s.CodigoArticulo
        LEFT JOIN (
          SELECT 
            CodigoAlmacen,
            CodigoArticulo,
            SUM(UnidadSaldo) AS StockUbicado
          FROM StockUbicacionActual
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoArticulo = @codigoArticulo
          GROUP BY CodigoAlmacen, CodigoArticulo
        ) u ON u.CodigoAlmacen = s.CodigoAlmacen AND u.CodigoArticulo = s.CodigoArticulo
        -- ðŸ”¥ CORRECCIÃ“N: INCLUIR CERO Y NEGATIVOS EN STOCK SIN UBICACIÃ“N
        WHERE (s.StockTotal - ISNULL(u.StockUbicado, 0)) != 0
      `;
    }

    query += ' ORDER BY CodigoAlmacen, Ubicacion';

    const result = await request.query(query);
      
    console.log(`[DEBUG STOCK POR ARTICULO] ArtÃ­culo: ${codigoArticulo}, Registros: ${result.recordset.length} (incluyendo negativos y cero)`);
    
    // Log para debugging de variantes (incluyendo negativos y cero)
    const registrosNegativos = result.recordset.filter(item => item.Cantidad < 0);
    const registrosCero = result.recordset.filter(item => item.Cantidad === 0);
    
    console.log(`ðŸ” ArtÃ­culo ${codigoArticulo}: ${registrosNegativos.length} negativos, ${registrosCero.length} cero`);
    
    if (registrosNegativos.length > 0) {
      console.log('ðŸ” DEBUG ArtÃ­culo con negativos encontrados:');
      registrosNegativos.forEach((item, index) => {
        console.log(`   âš ï¸ NEGATIVO - ${index + 1}. AlmacÃ©n: ${item.CodigoAlmacen}, UbicaciÃ³n: ${item.Ubicacion}, ` +
                   `Talla: ${item.Talla}, Cantidad: ${item.Cantidad}`);
      });
    }
    
    if (registrosCero.length > 0) {
      console.log('ðŸ” DEBUG ArtÃ­culo con ceros encontrados:');
      registrosCero.forEach((item, index) => {
        console.log(`   0ï¸âƒ£ CERO - ${index + 1}. AlmacÃ©n: ${item.CodigoAlmacen}, UbicaciÃ³n: ${item.Ubicacion}, ` +
                   `Talla: ${item.Talla}, Cantidad: ${item.Cantidad}`);
      });
    }
    
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR STOCK POR ARTICULO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock por artÃ­culo.',
      error: err.message 
    });
  }
});

// âœ… 9.12 OBTENER STOCK POR VARIANTE (CORREGIDO)
router.get('/stock/por-variante', async (req, res) => {
  const { codigoArticulo, codigoColor, codigoTalla } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !codigoArticulo) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'CÃ³digo de empresa y artÃ­culo requeridos.' 
    });
  }

  console.log('[STOCK POR VARIANTE DEBUG] ParÃ¡metros recibidos:', {
    codigoEmpresa,
    codigoArticulo,
    codigoColor,
    codigoTalla
  });

  try {
    const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
    const request = agregarContextoInventario(
      getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar(20), codigoArticulo),
      contexto
    );

    let query = `
      ${getCteInventarioActual()}
      SELECT 
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        CAST(s.UnidadSaldo AS DECIMAL(18, 2)) AS Cantidad,
        COALESCE(NULLIF(s.TipoUnidadMedida_, ''), 'unidades') AS UnidadMedida,
        s.Partida,
        s.CodigoColor_,
        s.CodigoTalla01_,
        s.UnidadSaldoTipo_
      FROM StockUbicacionActual s
      LEFT JOIN Almacenes alm ON 
        alm.CodigoEmpresa = s.CodigoEmpresa 
        AND alm.CodigoAlmacen = s.CodigoAlmacen
      LEFT JOIN Ubicaciones u ON 
        u.CodigoEmpresa = s.CodigoEmpresa 
        AND u.CodigoAlmacen = s.CodigoAlmacen 
        AND u.Ubicacion = s.Ubicacion
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND s.CodigoArticulo = @codigoArticulo
        AND s.UnidadSaldo > 0
    `;

    // ðŸ”¥ CORRECCIÃ“N CRÃTICA: FILTRO DINÃMICO POR COLOR Y TALLA
    // Si se proporciona cÃ³digoColor, filtrar por ese color especÃ­fico
    if (codigoColor !== undefined && codigoColor !== null && codigoColor !== '' && codigoColor !== 'null') {
      query += ` AND (
        s.CodigoColor_ = @codigoColor OR 
        (s.CodigoColor_ IS NULL AND @codigoColor = '') OR
        (s.CodigoColor_ = '' AND @codigoColor = '')
      )`;
      request.input('codigoColor', sql.VarChar(10), codigoColor);
    } else {
      // Si no se proporciona color, incluir solo ubicaciones sin color
      query += ` AND (s.CodigoColor_ IS NULL OR s.CodigoColor_ = '')`;
    }

    // ðŸ”¥ CORRECCIÃ“N CRÃTICA: FILTRO DINÃMICO POR TALLA
    // Si se proporciona cÃ³digoTalla, filtrar por esa talla especÃ­fica
    if (codigoTalla !== undefined && codigoTalla !== null && codigoTalla !== '' && codigoTalla !== 'null') {
      query += ` AND (
        s.CodigoTalla01_ = @codigoTalla OR 
        (s.CodigoTalla01_ IS NULL AND @codigoTalla = '') OR
        (s.CodigoTalla01_ = '' AND @codigoTalla = '')
      )`;
      request.input('codigoTalla', sql.VarChar(10), codigoTalla);
    } else {
      // Si no se proporciona talla, incluir solo ubicaciones sin talla
      query += ` AND (s.CodigoTalla01_ IS NULL OR s.CodigoTalla01_ = '')`;
    }

    query += ` ORDER BY s.CodigoAlmacen, s.Ubicacion`;

    console.log('[STOCK POR VARIANTE DEBUG] Query ejecutado:', {
      articulo: codigoArticulo,
      color: codigoColor || 'NO ESPECIFICADO',
      talla: codigoTalla || 'NO ESPECIFICADO',
      query: query.substring(0, 500) + '...'
    });

    const result = await request.query(query);
    
    console.log(`[STOCK POR VARIANTE] Resultados para ${codigoArticulo}: 
      Color: ${codigoColor || 'Sin color'}, 
      Talla: ${codigoTalla || 'Sin talla'},
      Ubicaciones encontradas: ${result.recordset.length}`);
    
    // ðŸ”¥ DEBUG DETALLADO: Mostrar las primeras ubicaciones encontradas
    if (result.recordset.length > 0) {
      console.log('[STOCK POR VARIANTE DEBUG] Primeras ubicaciones encontradas:');
      result.recordset.slice(0, 3).forEach((ubic, idx) => {
        console.log(`  ${idx + 1}. ${ubic.CodigoAlmacen} - ${ubic.Ubicacion} - 
          Color: ${ubic.CodigoColor_ || 'N/A'} - 
          Talla: ${ubic.CodigoTalla01_ || 'N/A'} - 
          Stock: ${ubic.Cantidad}`);
      });
    } else {
      console.log('[STOCK POR VARIANTE DEBUG] No se encontraron ubicaciones para esta combinaciÃ³n');
      
      // ðŸ”¥ OPCIÃ“N ALTERNATIVA: Buscar sin filtros de color/talla si no hay resultados
      const requestAlternativo = agregarContextoInventario(
        getPool().request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('codigoArticulo', sql.VarChar(20), codigoArticulo),
        contexto
      );
      
      const queryAlternativa = `
        ${getCteInventarioActual()}
        SELECT 
          s.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          s.Ubicacion,
          u.DescripcionUbicacion,
          CAST(s.UnidadSaldo AS DECIMAL(18, 2)) AS Cantidad,
          COALESCE(NULLIF(s.TipoUnidadMedida_, ''), 'unidades') AS UnidadMedida,
          s.Partida,
          s.CodigoColor_,
          s.CodigoTalla01_,
          s.UnidadSaldoTipo_
        FROM StockUbicacionActual s
        LEFT JOIN Almacenes alm ON 
          alm.CodigoEmpresa = s.CodigoEmpresa 
          AND alm.CodigoAlmacen = s.CodigoAlmacen
        LEFT JOIN Ubicaciones u ON 
          u.CodigoEmpresa = s.CodigoEmpresa 
          AND u.CodigoAlmacen = s.CodigoAlmacen 
          AND u.Ubicacion = s.Ubicacion
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.CodigoArticulo = @codigoArticulo
          AND s.UnidadSaldo > 0
        ORDER BY s.CodigoAlmacen, s.Ubicacion
      `;
      
      const resultAlternativo = await requestAlternativo.query(queryAlternativa);
      console.log(`[STOCK POR VARIANTE DEBUG] BÃºsqueda alternativa (sin filtros): ${resultAlternativo.recordset.length} resultados`);
      
      if (resultAlternativo.recordset.length > 0) {
        // Filtrar en memoria las que coincidan en color y talla
        const filtradosEnMemoria = resultAlternativo.recordset.filter(ubic => {
          const colorCoincide = 
            (!codigoColor || codigoColor === '' || codigoColor === 'null') ? 
            (!ubic.CodigoColor_ || ubic.CodigoColor_ === '') : 
            (ubic.CodigoColor_ === codigoColor);
          
          const tallaCoincide = 
            (!codigoTalla || codigoTalla === '' || codigoTalla === 'null') ? 
            (!ubic.CodigoTalla01_ || ubic.CodigoTalla01_ === '') : 
            (ubic.CodigoTalla01_ === codigoTalla);
          
          return colorCoincide && tallaCoincide;
        });
        
        console.log(`[STOCK POR VARIANTE DEBUG] Filtrado en memoria: ${filtradosEnMemoria.length} coincidencias`);
        
        // Si hay coincidencias en memoria, devolverlas
        if (filtradosEnMemoria.length > 0) {
          return res.json(filtradosEnMemoria);
        }
      }
    }
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR STOCK POR VARIANTE]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock por variante.',
      error: err.message,
      stack: err.stack 
    });
  }
});

// âœ… 9.14 OBTENER STOCK TOTAL COMPLETO
// âœ… 9.15 AJUSTAR INVENTARIO (VERSIÃ“N MEJORADA - INSERCIÃ“N EN AMBAS TABLAS)
router.post('/inventario/ajustar-completo', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { ajustes } = req.body;
  const codigoEmpresa = req.user.CodigoEmpresa;
  const ejercicio = new Date().getFullYear();
  const usuarioInventario = req.user.UsuarioLogicNet || req.user.CodigoCliente || req.user.CodigoUsuario || 'desconocido';

  if (!ajustes || !Array.isArray(ajustes) || ajustes.length === 0) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Lista de ajustes vacÃ­a o invÃ¡lida.' 
    });
  }

  const transaction = new sql.Transaction(getPool());
  
  try {
    await transaction.begin();

    console.log(`[AJUSTE MANUAL] Iniciando ${ajustes.length} ajustes para empresa ${codigoEmpresa}`);

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

      console.log(`[AJUSTE MANUAL] Procesando: ${ajusteDestino.articulo} | ${ajusteDestino.codigoAlmacen} | ${ajusteDestino.ubicacionStr} | ${ajusteDestino.nuevaCantidad}`);

      const esEdicion = Boolean(ajuste.combinacionOriginal);
      const mismaCombinacion = esMismaCombinacionInventario(ajusteOrigen, ajusteDestino);
      const registroOrigen = await obtenerRegistroVigenteAcumuladoStockUbicacionExacto(codigoEmpresa, ajusteOrigen, transaction);
      const registroDestino = await obtenerRegistroVigenteAcumuladoStockUbicacionExacto(codigoEmpresa, ajusteDestino, transaction);
      const permiteRecrearDesdeCero = esEdicion && mismaCombinacion && !registroOrigen;

      if (!esEdicion && registroDestino) {
        throw crearErrorInventario(409, 'Ese artÃ­culo/variante ya existe. EdÃ­talo manualmente desde el listado.');
      }

      if (esEdicion && !registroOrigen && !permiteRecrearDesdeCero) {
        throw crearErrorInventario(409, 'No se encontrÃ³ la combinaciÃ³n origen para editar el inventario.');
      }

      if (esEdicion && !mismaCombinacion) {
        const cantidadDestinoActual = parseFloat(registroDestino?.UnidadSaldo ?? 0) || 0;
        const cantidadFinalDestino = cantidadDestinoActual + ajusteDestino.nuevaCantidad;

        await eliminarCombinacionVigenteAcumuladoStockUbicacion(codigoEmpresa, ajusteOrigen, transaction);
        await actualizarAcumuladoStockUbicacion(
          { ...ajusteDestino, nuevaCantidad: cantidadFinalDestino },
          codigoEmpresa,
          ejercicio,
          transaction
        );
        await sincronizarAcumuladoStockDesdeUbicaciones(
          { ...ajusteOrigen, nuevaCantidad: 0 },
          codigoEmpresa,
          ejercicio,
          transaction
        );
        await sincronizarAcumuladoStockDesdeUbicaciones(
          { ...ajusteDestino, nuevaCantidad: cantidadFinalDestino },
          codigoEmpresa,
          ejercicio,
          transaction
        );

        await registrarMovimientoInventario(
          {
            codigoEmpresa,
            ejercicio,
            usuarioInventario,
            ajuste: { ...ajusteDestino, nuevaCantidad: cantidadFinalDestino },
            unidades: ajusteDestino.nuevaCantidad,
            comentario: registroDestino
              ? `Inventario: fusion de variante ${ajusteOrigen.codigoTalla01 || '-'}${ajusteOrigen.codigoColor || ''} -> ${ajusteDestino.codigoTalla01 || '-'}${ajusteDestino.codigoColor || ''}`
              : `Inventario: cambio de variante ${ajusteOrigen.codigoTalla01 || '-'}${ajusteOrigen.codigoColor || ''} -> ${ajusteDestino.codigoTalla01 || '-'}${ajusteDestino.codigoColor || ''}`
          },
          transaction
        );

        continue;
      }

      await actualizarAcumuladoStockUbicacion(ajusteDestino, codigoEmpresa, ejercicio, transaction);
      await sincronizarAcumuladoStockDesdeUbicaciones(ajusteDestino, codigoEmpresa, ejercicio, transaction);

      const cantidadAnterior = parseFloat(registroOrigen?.UnidadSaldo ?? registroDestino?.UnidadSaldo ?? 0) || 0;
      const diferencia = ajusteDestino.nuevaCantidad - cantidadAnterior;

      await registrarMovimientoInventario(
        {
          codigoEmpresa,
          ejercicio,
          usuarioInventario,
          ajuste: ajusteDestino,
          unidades: diferencia,
          comentario: esEdicion
            ? `Inventario: edicion manual${mismaCombinacion ? '' : ' de variante'}`
            : 'Inventario: nuevo ajuste manual'
        },
        transaction
      );
    }

    await transaction.commit();

    return res.json({
      success: true,
      mensaje: `Ajustes realizados correctamente. ${ajustes.length} ubicaciones actualizadas en ambas tablas.`
    });

    // 1. PRIMERO: Identificar y procesar cada ajuste individualmente
    for (const ajuste of ajustes) {
      const { 
        articulo, 
        codigoAlmacen, 
        ubicacionStr, 
        partida, 
        unidadStock, 
        nuevaCantidad,
        codigoColor, 
        codigoTalla01 
      } = ajuste;

      const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÃ“N' ? 'SIN-UBICACION' : ubicacionStr;
      const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

      console.log(`[AJUSTE MANUAL] Procesando: ${articulo} | ${codigoAlmacen} | ${ubicacionNormalizada} | ${nuevaCantidad}`);

      // ðŸ”¥ NUEVA LÃ“GICA: Verificar si ya existe en AcumuladoStock
      const existeEnAcumuladoStock = await verificarExistenciaEnAcumuladoStock(
        codigoEmpresa, ejercicio, articulo, codigoAlmacen, 
        unidadStockNormalizada, partida, codigoColor, codigoTalla01, 
        transaction
      );

      console.log(`[AJUSTE MANUAL] ${articulo} | Â¿Existe en AcumuladoStock?: ${existeEnAcumuladoStock}`);

      // 2. ACTUALIZAR AcumuladoStockUbicacion (SIEMPRE se actualiza)
      await actualizarAcumuladoStockUbicacion(
        ajuste, codigoEmpresa, ejercicio, transaction
      );

      // 3. ACTUALIZAR O INSERTAR en AcumuladoStock
      if (existeEnAcumuladoStock) {
        console.log(`[AJUSTE MANUAL] Actualizando AcumuladoStock (existente): ${articulo}`);
        await actualizarAcumuladoStock(
          ajuste, codigoEmpresa, ejercicio, transaction
        );
      } else {
        console.log(`[AJUSTE MANUAL] Insertando nuevo registro en AcumuladoStock (principal): ${articulo}`);
        await insertarAcumuladoStock(
          ajuste, codigoEmpresa, ejercicio, transaction
        );
      }
    }

    await transaction.commit();

    res.json({ 
      success: true, 
      mensaje: `Ajustes realizados correctamente. ${ajustes.length} ubicaciones actualizadas en ambas tablas.` 
    });

  } catch (error) {
    try {
      if (!transaction._aborted) {
        await transaction.rollback();
      }
    } catch (rollbackError) {
      console.error('[ERROR ROLLBACK AJUSTE INVENTARIO]', rollbackError);
    }
    console.error('[ERROR AJUSTAR INVENTARIO]', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      mensaje: error.publicMessage || 'Error al realizar los ajustes',
      error: error.message 
    });
  }
});

// ðŸ”¥ NUEVA FUNCIÃ“N: Verificar si existe en AcumuladoStock
async function obtenerEjercicioVigenteAcumuladoStockUbicacion(
  codigoEmpresa, articulo, codigoAlmacen, ubicacion, unidadStock,
  partida, codigoColor, codigoTalla01, transaction
) {
  const result = await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('ubicacion', sql.VarChar, ubicacion)
    .input('tipoUnidad', sql.VarChar, unidadStock || '')
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      SELECT MIN(Ejercicio) AS EjercicioVigente
      FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND Ubicacion = @ubicacion
        AND (
          (TipoUnidadMedida_ = @tipoUnidad)
          OR
          (ISNULL(TipoUnidadMedida_, '') = @tipoUnidad)
        )
        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
        AND Periodo = 99
    `);

  return parseInt(result.recordset[0]?.EjercicioVigente, 10) || null;
}

async function obtenerEjercicioVigenteAcumuladoStock(
  codigoEmpresa, articulo, codigoAlmacen, unidadStock,
  partida, codigoColor, codigoTalla01, transaction
) {
  const result = await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidad', sql.VarChar, unidadStock || '')
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      SELECT MIN(Ejercicio) AS EjercicioVigente
      FROM AcumuladoStock
      WHERE CodigoEmpresa = @codigoEmpresa
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND (
          (TipoUnidadMedida_ = @tipoUnidad)
          OR
          (ISNULL(TipoUnidadMedida_, '') = @tipoUnidad)
        )
        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
        AND Periodo = 99
    `);

  return parseInt(result.recordset[0]?.EjercicioVigente, 10) || null;
}

async function verificarExistenciaEnAcumuladoStock(
  codigoEmpresa, ejercicio, articulo, codigoAlmacen, 
  unidadStock, partida, codigoColor, codigoTalla01, 
  transaction
) {
  try {
    const result = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('tipoUnidad', sql.VarChar, unidadStock)
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
      .query(`
        SELECT COUNT(*) as Existe
        FROM AcumuladoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoAlmacen = @codigoAlmacen
          AND CodigoArticulo = @codigoArticulo
          AND (
            (TipoUnidadMedida_ = @tipoUnidad)
            OR 
            (TipoUnidadMedida_ = '' AND @tipoUnidad = '')
          )
          AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
          AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
          AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
          AND Periodo = 99
      `);

    return result.recordset[0].Existe > 0;
  } catch (error) {
    console.error('[ERROR VERIFICANDO EXISTENCIA EN ACUMULADOSTOCK]', error);
    return false;
  }
}

// ðŸ”¥ NUEVA FUNCIÃ“N: Insertar en AcumuladoStock (para nuevos registros)
async function insertarAcumuladoStock(ajuste, codigoEmpresa, ejercicio, transaction) {
  await sincronizarAcumuladoStockDesdeUbicaciones(ajuste, codigoEmpresa, ejercicio, transaction);
}

// ðŸ”¥ FUNCIÃ“N MODIFICADA: Actualizar AcumuladoStock (para registros existentes)
async function actualizarAcumuladoStock(ajuste, codigoEmpresa, ejercicio, transaction) {
  await sincronizarAcumuladoStockDesdeUbicaciones(ajuste, codigoEmpresa, ejercicio, transaction);
}

async function sincronizarAcumuladoStockDesdeUbicaciones(ajuste, codigoEmpresa, ejercicio, transaction) {
  const {
    articulo,
    codigoAlmacen,
    ubicacionStr,
    partida,
    unidadStock,
    codigoColor,
    codigoTalla01
  } = ajuste;

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÃ“N' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);
  const ejercicioAcumulado = (
    await obtenerEjercicioVigenteAcumuladoStock(
      codigoEmpresa,
      articulo,
      codigoAlmacen,
      unidadStockNormalizada,
      partida,
      codigoColor,
      codigoTalla01,
      transaction
    )
  ) || ejercicio;

  const resumenResult = await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidad', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      SELECT
        SUM(ISNULL(UnidadSaldo, 0)) AS TotalUnidadSaldo,
        SUM(ISNULL(UnidadSaldoTipo_, 0)) AS TotalUnidadSaldoTipo,
        MIN(NULLIF(Ubicacion, '')) AS UbicacionPrincipal,
        COUNT(*) AS TotalFilas
      FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND (
          (TipoUnidadMedida_ = @tipoUnidad)
          OR
          (TipoUnidadMedida_ = '' AND @tipoUnidad = '')
        )
        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
        AND Periodo = 99
    `);

  const resumen = resumenResult.recordset[0] || {};
  const totalFilas = Number(resumen.TotalFilas || 0);
  const totalUnidadSaldo = Number(resumen.TotalUnidadSaldo || 0);
  const totalUnidadSaldoTipo = Number(resumen.TotalUnidadSaldoTipo || 0);
  const ubicacionPrincipal = resumen.UbicacionPrincipal || ubicacionNormalizada;

  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidad', sql.VarChar, unidadStockNormalizada || '')
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      DELETE FROM AcumuladoStock
      WHERE CodigoEmpresa = @codigoEmpresa
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND (
          (TipoUnidadMedida_ = @tipoUnidad)
          OR
          (TipoUnidadMedida_ = '' AND @tipoUnidad = '')
        )
        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
        AND Periodo = 99
    `);

  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicioAcumulado)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('ubicacion', sql.VarChar, ubicacionPrincipal)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada || '')
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .input('unidadSaldo', sql.Decimal(18, 4), totalUnidadSaldo)
    .input('unidadSaldoTipo', sql.Decimal(18, 4), totalUnidadSaldoTipo)
    .query(`
      INSERT INTO AcumuladoStock (
        CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
        CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
        UnidadSaldo, UnidadSaldoTipo_, Periodo
      ) VALUES (
        @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
        @codigoArticulo, @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla,
        @unidadSaldo, @unidadSaldoTipo, 99
      )
    `);

  console.log(`[AJUSTE MANUAL] AcumuladoStock sincronizado desde ubicaciones: ${articulo} | ${codigoAlmacen} -> ${totalUnidadSaldoTipo}`);
}

// ðŸ”¥ FUNCIÃ“N MODIFICADA: Actualizar AcumuladoStockUbicacion
async function actualizarAcumuladoStockUbicacion(ajuste, codigoEmpresa, ejercicio, transaction) {
  const { 
    articulo, 
    codigoAlmacen, 
    ubicacionStr, 
    partida, 
    unidadStock, 
    nuevaCantidad,
    codigoColor, 
    codigoTalla01 
  } = ajuste;

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÃ“N' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);
  const ejercicioUbicacion = (
    await obtenerEjercicioVigenteAcumuladoStockUbicacion(
      codigoEmpresa,
      articulo,
      codigoAlmacen,
      ubicacionNormalizada,
      unidadStockNormalizada,
      partida,
      codigoColor,
      codigoTalla01,
      transaction
    )
  ) || ejercicio;

  // 1. ELIMINAR cualquier fila vigente duplicada para la combinaciÃ³n funcional exacta
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada || '')
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      DELETE FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND Ubicacion = @ubicacion
        AND (TipoUnidadMedida_ = @tipoUnidadMedida OR (TipoUnidadMedida_ IS NULL AND @tipoUnidadMedida = ''))
        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
        AND Periodo = 99
    `);

  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicioUbicacion)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada || '')
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .input('unidadSaldo', sql.Decimal(18, 4), parseFloat(nuevaCantidad) || 0)
    .input('unidadSaldoTipo', sql.Decimal(18, 4), parseFloat(nuevaCantidad) || 0)
    .query(`
      INSERT INTO AcumuladoStockUbicacion (
        CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
        CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
        UnidadSaldo, UnidadSaldoTipo_, Periodo
      ) VALUES (
        @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
        @codigoArticulo, @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla,
        @unidadSaldo, @unidadSaldoTipo, 99
      )
    `);

  console.log(`[AJUSTE MANUAL] AcumuladoStockUbicacion actualizado: ${articulo} | ${ubicacionNormalizada} -> ${nuevaCantidad}`);
}

// ðŸ”¥ NUEVA FUNCIÃ“N: Verificar si es ubicaciÃ³n principal en AcumuladoStock
async function esUbicacionPrincipalEnAcumuladoStock(
  codigoEmpresa, ejercicio, articulo, codigoAlmacen, 
  unidadStock, partida, codigoColor, codigoTalla01, 
  ubicacion, transaction
) {
  try {
    const result = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('tipoUnidad', sql.VarChar, unidadStock)
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
      .input('ubicacion', sql.VarChar, ubicacion)
      .query(`
        SELECT COUNT(*) as EsPrincipal
        FROM AcumuladoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND CodigoAlmacen = @codigoAlmacen
          AND CodigoArticulo = @codigoArticulo
          AND (
            (TipoUnidadMedida_ = @tipoUnidad)
            OR 
            (TipoUnidadMedida_ = '' AND @tipoUnidad = '')
          )
          AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
          AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
          AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
          AND Ubicacion = @ubicacion
          AND Periodo = 99
      `);

    return result.recordset[0].EsPrincipal > 0;
  } catch (error) {
    console.error('[ERROR VERIFICANDO UBICACIÃ“N PRINCIPAL]', error);
    return false;
  }
}

// ðŸ”¥ NUEVA FUNCIÃ“N: Actualizar solo AcumuladoStockUbicacion
async function actualizarAcumuladoStockUbicacion(ajuste, codigoEmpresa, ejercicio, transaction) {
  const { 
    articulo, 
    codigoAlmacen, 
    ubicacionStr, 
    partida, 
    unidadStock, 
    nuevaCantidad,
    codigoColor, 
    codigoTalla01 
  } = ajuste;

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÃ“N' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);
  const ejercicioUbicacion = (
    await obtenerEjercicioVigenteAcumuladoStockUbicacion(
      codigoEmpresa,
      articulo,
      codigoAlmacen,
      ubicacionNormalizada,
      unidadStockNormalizada,
      partida,
      codigoColor,
      codigoTalla01,
      transaction
    )
  ) || ejercicio;

  // 1. ELIMINAR cualquier fila vigente duplicada para la combinaciÃ³n funcional exacta
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada || '')
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      DELETE FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND Ubicacion = @ubicacion
        AND (TipoUnidadMedida_ = @tipoUnidadMedida OR (TipoUnidadMedida_ IS NULL AND @tipoUnidadMedida = ''))
        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
        AND Periodo = 99
    `);

  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicioUbicacion)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada || '')
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .input('unidadSaldo', sql.Decimal(18, 4), parseFloat(nuevaCantidad) || 0)
    .input('unidadSaldoTipo', sql.Decimal(18, 4), parseFloat(nuevaCantidad) || 0)
    .query(`
      INSERT INTO AcumuladoStockUbicacion (
        CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
        CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
        UnidadSaldo, UnidadSaldoTipo_, Periodo
      ) VALUES (
        @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
        @codigoArticulo, @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla,
        @unidadSaldo, @unidadSaldoTipo, 99
      )
    `);

  console.log(`[AJUSTE MANUAL] AcumuladoStockUbicacion actualizado: ${articulo} | ${ubicacionNormalizada} -> ${nuevaCantidad}`);
}

// ðŸ”¥ NUEVA FUNCIÃ“N: Actualizar AcumuladoStock (solo para ubicaciÃ³n principal)
async function actualizarAcumuladoStockPrincipal(ajuste, codigoEmpresa, ejercicio, transaction) {
  const { 
    articulo, 
    codigoAlmacen, 
    ubicacionStr, 
    partida, 
    unidadStock, 
    nuevaCantidad,
    codigoColor, 
    codigoTalla01 
  } = ajuste;

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÃ“N' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

  await new sql.Request(transaction)
    .input('nuevaCantidad', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.SmallInt, ejercicio)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidad', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .query(`
      UPDATE AcumuladoStock
      SET 
        UnidadSaldoTipo_ = @nuevaCantidad,
        UnidadSaldo = @nuevaCantidad
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio = @ejercicio
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND (
          (TipoUnidadMedida_ = @tipoUnidad)
          OR 
          (TipoUnidadMedida_ = '' AND @tipoUnidad = '')
        )
        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
        AND Ubicacion = @ubicacion
        AND Periodo = 99
    `);

  console.log(`[AJUSTE MANUAL] AcumuladoStock actualizado (principal): ${articulo} | ${ubicacionNormalizada} -> ${nuevaCantidad}`);
}

// âœ… 10.6 OBTENER UBICACIONES POR ALMACÃ‰N (CORRECCIÃ“N)
router.get('/inventario/ubicaciones-ajuste', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const {
    codigoAlmacen,
    search = '',
    offset = '0',
    limit = '50'
  } = req.query;

  if (!codigoEmpresa || !codigoAlmacen) {
    return res.status(400).json({
      success: false,
      mensaje: 'CÃƒÂ³digo de empresa y almacÃƒÂ©n requeridos.'
    });
  }

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
        SELECT
          u.Ubicacion,
          COALESCE(u.DescripcionUbicacion, '') AS DescripcionUbicacion
        FROM Ubicaciones u
        WHERE u.CodigoEmpresa = @codigoEmpresa
          AND u.CodigoAlmacen = @codigoAlmacen
          AND (
            @search IS NULL
            OR u.Ubicacion LIKE @search
            OR COALESCE(u.DescripcionUbicacion, '') LIKE @search
          )
        ORDER BY u.Ubicacion
        OFFSET @offset ROWS
        FETCH NEXT @fetchLimit ROWS ONLY
      `);

    const rows = Array.isArray(result.recordset) ? result.recordset : [];
    const hasMore = rows.length > limitValue;
    const items = hasMore ? rows.slice(0, limitValue) : rows;

    res.json({
      items,
      hasMore,
      nextOffset: hasMore ? offsetValue + items.length : null
    });
  } catch (err) {
    console.error('[ERROR UBICACIONES AJUSTE INVENTARIO]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al obtener ubicaciones para nuevo ajuste.',
      error: err.message
    });
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
    )
      .query(`
        ${getCteInventarioActual()}
        SELECT 
          u.Ubicacion,
          COALESCE(u.DescripcionUbicacion, '') AS DescripcionUbicacion,
          COUNT(DISTINCT s.CodigoArticulo) AS CantidadArticulos
        FROM Ubicaciones u
        LEFT JOIN StockUbicacionActual s 
          ON s.CodigoEmpresa = u.CodigoEmpresa 
          AND s.CodigoAlmacen = u.CodigoAlmacen 
          AND s.Ubicacion = u.Ubicacion
          AND s.UnidadSaldo > 0
        WHERE u.CodigoEmpresa = @codigoEmpresa
          AND u.CodigoAlmacen = @codigoAlmacen
        GROUP BY u.Ubicacion, u.DescripcionUbicacion
        ORDER BY u.Ubicacion
      `);
    
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR UBICACIONES POR ALMACEN]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener ubicaciones por almacÃ©n.',
      error: err.message 
    });
  }
});

// ============================================
// âœ… PEDIDOS DE COMPRA Y RECEPCIÃ“N (PAGINADO)
// ============================================

// âœ… FUNCIÃ“N AUXILIAR PARA MANEJO SEGURO DE STRINGS (SIN .substring problemÃ¡tico)
const safeString = (value, maxLength = 10, defaultValue = '') => {
  try {
    // Si es null o undefined, devolver valor por defecto
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    // Convertir a string de manera segura
    let str;
    if (typeof value === 'string') {
      str = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      str = String(value);
    } else if (typeof value === 'object') {
      // Para objetos, usar JSON.stringify o toString()
      str = value.toString ? value.toString() : JSON.stringify(value);
    } else {
      str = String(value);
    }
    
    // Trim
    str = str.trim();
    
    // Si queda vacÃ­o o es 'null'/'undefined', devolver valor por defecto
    if (str === '' || str === 'null' || str === 'undefined') {
      return defaultValue;
    }
    
    // Limpiar comas
    str = str.replace(/[,]/g, '').trim();
    
    // Truncar si excede la longitud mÃ¡xima (sin usar .substring si no es string)
    if (maxLength > 0 && str.length > maxLength) {
      // Usar slice en lugar de substring para mayor compatibilidad
      return str.slice(0, maxLength);
    }
    
    return str;
  } catch (error) {
    console.warn(`[safeString] Error procesando valor: ${error.message}`);
    return defaultValue;
  }
};

function normalizarAjusteInventario(ajuste = {}) {
  return {
    articulo: ajuste.articulo,
    descripcionArticulo: ajuste.descripcionArticulo || '',
    codigoAlmacen: ajuste.codigoAlmacen,
    ubicacionStr: ajuste.ubicacionStr === 'SIN UBICACIÃ“N' ? 'SIN-UBICACION' : (ajuste.ubicacionStr || 'SIN-UBICACION'),
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
      SELECT TOP 1
        Ejercicio,
        Periodo,
        UnidadSaldo,
        UnidadSaldoTipo_,
        CodigoArticulo,
        CodigoAlmacen,
        Ubicacion,
        TipoUnidadMedida_,
        Partida,
        CodigoColor_,
        CodigoTalla01_
      FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND CodigoArticulo = @codigoArticulo
        AND CodigoAlmacen = @codigoAlmacen
        AND Ubicacion = @ubicacion
        AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
        AND ISNULL(Partida, '') = @partida
        AND ISNULL(CodigoColor_, '') = @codigoColor
        AND ISNULL(CodigoTalla01_, '') = @codigoTalla
        AND Periodo = 99
      ORDER BY Ejercicio DESC
    `);

  return result.recordset[0] || null;
}

async function eliminarCombinacionVigenteAcumuladoStockUbicacion(codigoEmpresa, ajuste, transaction) {
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('codigoArticulo', sql.VarChar, ajuste.articulo)
    .input('codigoAlmacen', sql.VarChar, ajuste.codigoAlmacen)
    .input('ubicacion', sql.VarChar, ajuste.ubicacionStr)
    .input('tipoUnidad', sql.VarChar, ajuste.unidadStock || '')
    .input('partida', sql.VarChar, ajuste.partida || '')
    .input('codigoColor', sql.VarChar, ajuste.codigoColor || '')
    .input('codigoTalla', sql.VarChar, ajuste.codigoTalla01 || '')
    .query(`
      DELETE FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND CodigoArticulo = @codigoArticulo
        AND CodigoAlmacen = @codigoAlmacen
        AND Ubicacion = @ubicacion
        AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
        AND ISNULL(Partida, '') = @partida
        AND ISNULL(CodigoColor_, '') = @codigoColor
        AND ISNULL(CodigoTalla01_, '') = @codigoTalla
        AND Periodo = 99
    `);
}

async function registrarMovimientoInventario(payload, transaction) {
  const ahora = new Date();
  const periodo = ahora.getMonth() + 1;
  const comentario = safeString(`${payload.comentario} por ${payload.usuarioInventario}`, 40);
  const codigoUsuario = safeString(payload.usuarioInventario, 20, '');
  const codigoArticulo = safeString(payload.ajuste.articulo, 20);
  const codigoAlmacen = safeString(payload.ajuste.codigoAlmacen, 4);
  const ubicacion = safeString(payload.ajuste.ubicacionStr, 15);
  const unidadMedida = safeString(payload.ajuste.unidadStock || '', 10);
  const partida = safeString(payload.ajuste.partida || '', 15);
  const codigoColor = safeString(payload.ajuste.codigoColor || '', 10);
  const codigoTalla = safeString(payload.ajuste.codigoTalla01 || '', 10);

  console.log('[AJUSTE MANUAL] Registro historial inventario:', {
    codigoArticulo,
    codigoAlmacen,
    ubicacion,
    comentario,
    unidadMedida,
    partida,
    codigoColor,
    codigoTalla,
    unidades: payload.unidades
  });

  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, payload.codigoEmpresa)
    .input('ejercicio', sql.SmallInt, payload.ejercicio)
    .input('periodo', sql.SmallInt, periodo)
    .input('fecha', sql.Date, ahora)
    .input('fechaRegistro', sql.DateTime, ahora)
    .input('tipoMovimiento', sql.SmallInt, 5)
    .input('codigoArticulo', sql.VarChar(20), codigoArticulo)
    .input('codigoAlmacen', sql.VarChar(4), codigoAlmacen)
    .input('ubicacion', sql.VarChar(15), ubicacion)
    .input('unidades', sql.Decimal(18, 4), payload.unidades)
    .input('comentario', sql.VarChar(40), comentario)
    .input('codigoCliente', sql.VarChar(20), codigoUsuario)
    .input('unidadMedida', sql.VarChar(10), unidadMedida)
    .input('partida', sql.VarChar(15), partida)
    .input('codigoColor', sql.VarChar(10), codigoColor)
    .input('codigoTalla', sql.VarChar(10), codigoTalla)
    .query(`
      INSERT INTO MovimientoStock (
        CodigoEmpresa, Ejercicio, Periodo, Fecha, FechaRegistro, TipoMovimiento,
        CodigoArticulo, CodigoAlmacen, Ubicacion,
        Unidades, Comentario, CodigoCliente, UnidadMedida1_, Partida,
        CodigoColor_, CodigoTalla01_
      ) VALUES (
        @codigoEmpresa, @ejercicio, @periodo, @fecha, @fechaRegistro, @tipoMovimiento,
        @codigoArticulo, @codigoAlmacen, @ubicacion,
        @unidades, @comentario, @codigoCliente, @unidadMedida, @partida,
        @codigoColor, @codigoTalla
      )
    `);
}

  return router;
};


