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

  function getCteInventarioActualFiltrado(codigoParamsSql) {
    const filtroCodigos = codigoParamsSql
      ? `AND LTRIM(RTRIM(s.CodigoArticulo)) IN (${codigoParamsSql})`
      : '';

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
          ${filtroCodigos}
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
          ${filtroCodigos}
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
  console.log('[SYNC AUTO] Iniciando sincronización automática...');
  
  try {
    if (!getPool() || !getPool().connected) {
      console.log('[SYNC AUTO] Esperando conexión a BD...');
      return;
    }

    // Obtener todas las empresas (sin filtro de almacenes)
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

    for (const empresa of empresas) {
      const codigoEmpresa = empresa.CodigoEmpresa;
      
      try {
        console.log(`[SYNC AUTO] Sincronizando empresa: ${codigoEmpresa}`);
        
        // 🔁 PAGINACIÓN: procesar discrepancias en lotes de 500
        const BATCH_SIZE = 500;
        let offset = 0;
        let hasMore = true;
        let empresaCorregidos = 0;
        let empresaErrores = 0;

        while (hasMore) {
          // Obtener un lote de discrepancias con paginación
          const discrepancias = await getPool().request()
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('offset', sql.Int, offset)
            .input('batchSize', sql.Int, BATCH_SIZE)
            .query(`
              WITH StockOficialSumado AS (
                SELECT 
                  CodigoArticulo,
                  CodigoAlmacen,
                  Ubicacion,
                  ISNULL(TipoUnidadMedida_, '') AS TipoUnidadMedida_,
                  ISNULL(Partida, '') AS Partida,
                  ISNULL(CodigoColor_, '') AS CodigoColor_,
                  ISNULL(CodigoTalla01_, '') AS CodigoTalla01_,
                  SUM(CAST(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS DECIMAL(18,4))) AS StockOficial
                FROM AcumuladoStock
                WHERE CodigoEmpresa = @codigoEmpresa
                  AND Periodo IN (0, 99)
                  AND Ejercicio = @ejercicio
                GROUP BY 
                  CodigoArticulo, CodigoAlmacen, Ubicacion,
                  ISNULL(TipoUnidadMedida_, ''),
                  ISNULL(Partida, ''),
                  ISNULL(CodigoColor_, ''),
                  ISNULL(CodigoTalla01_, '')
              ),
              StockUbicacionSumado AS (
                SELECT 
                  CodigoArticulo,
                  CodigoAlmacen,
                  Ubicacion,
                  ISNULL(TipoUnidadMedida_, '') AS TipoUnidadMedida_,
                  ISNULL(Partida, '') AS Partida,
                  ISNULL(CodigoColor_, '') AS CodigoColor_,
                  ISNULL(CodigoTalla01_, '') AS CodigoTalla01_,
                  SUM(CAST(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS DECIMAL(18,4))) AS StockUbicacion
                FROM AcumuladoStockUbicacion
                WHERE CodigoEmpresa = @codigoEmpresa
                  AND Periodo IN (0, 99)
                  AND Ejercicio = @ejercicio
                GROUP BY 
                  CodigoArticulo, CodigoAlmacen, Ubicacion,
                  ISNULL(TipoUnidadMedida_, ''),
                  ISNULL(Partida, ''),
                  ISNULL(CodigoColor_, ''),
                  ISNULL(CodigoTalla01_, '')
              )
              SELECT 
                s.CodigoArticulo,
                s.CodigoAlmacen,
                s.Ubicacion,
                s.TipoUnidadMedida_,
                s.Partida,
                s.CodigoColor_,
                s.CodigoTalla01_,
                s.StockOficial,
                ISNULL(u.StockUbicacion, 0) AS StockUbicacion,
                s.StockOficial - ISNULL(u.StockUbicacion, 0) AS Diferencia
              FROM StockOficialSumado s
              LEFT JOIN StockUbicacionSumado u
                ON u.CodigoArticulo = s.CodigoArticulo
                AND u.CodigoAlmacen = s.CodigoAlmacen
                AND u.Ubicacion = s.Ubicacion
                AND u.TipoUnidadMedida_ = s.TipoUnidadMedida_
                AND u.Partida = s.Partida
                AND u.CodigoColor_ = s.CodigoColor_
                AND u.CodigoTalla01_ = s.CodigoTalla01_
              WHERE s.StockOficial > 0
                AND ABS(s.StockOficial - ISNULL(u.StockUbicacion, 0)) > 0.001
              ORDER BY s.CodigoArticulo, s.CodigoAlmacen, s.Ubicacion
              OFFSET @offset ROWS FETCH NEXT @batchSize ROWS ONLY
            `);

          const batch = discrepancias.recordset;
          const batchCount = batch.length;

          if (batchCount === 0) {
            hasMore = false;
            break;
          }

          console.log(`[SYNC AUTO] Empresa ${codigoEmpresa}: lote ${offset / BATCH_SIZE + 1} con ${batchCount} discrepancias`);

          // Procesar cada discrepancia del lote
          for (const discrepancia of batch) {
            try {
              await corregirDiscrepancia(discrepancia, codigoEmpresa, ejercicio);
              empresaCorregidos++;
              totalCorregidos++;
              await new Promise(resolve => setTimeout(resolve, 10)); // pequeño delay para evitar saturación
            } catch (error) {
              console.error(`[SYNC AUTO] Error corrigiendo discrepancia para ${discrepancia.CodigoArticulo} en ${discrepancia.Ubicacion}:`, error.message);
              empresaErrores++;
              totalErrores++;
            }
          }

          offset += BATCH_SIZE;
        }

        console.log(`[SYNC AUTO] Empresa ${codigoEmpresa}: ${empresaCorregidos} correcciones, ${empresaErrores} errores`);
      } catch (error) {
        console.error(`[SYNC AUTO] Error en empresa ${codigoEmpresa}:`, error.message);
        totalErrores++;
      }
    }

    console.log(`[SYNC AUTO] Sincronización completada: ${totalCorregidos} correcciones, ${totalErrores} errores`);
  } catch (error) {
    console.error('[SYNC AUTO] Error general en sincronización:', error);
  }
}

/**
 * Obtiene el stock histórico total (periodos distintos de 99) para una combinación específica.
 * Suma los periodos 0, 1, 2... etc. (excluye 99) de los ejercicios base y actual.
 */
async function obtenerStockHistoricoTotal(codigoEmpresa, ajuste, contexto, transaction) {
  const {
    articulo,
    codigoAlmacen,
    ubicacionStr,
    partida,
    unidadStock,
    codigoColor,
    codigoTalla01
  } = ajuste;

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

  const result = await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicioBase', sql.SmallInt, contexto.ejercicioBase)
    .input('ejercicioActual', sql.SmallInt, contexto.ejercicioActual)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('tipoUnidad', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      SELECT SUM(CAST(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS DECIMAL(18,4))) AS StockHistorico
      FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio IN (@ejercicioBase, @ejercicioActual)
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND Ubicacion = @ubicacion
        AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
        AND ISNULL(Partida, '') = @partida
        AND ISNULL(CodigoColor_, '') = @codigoColor
        AND ISNULL(CodigoTalla01_, '') = @codigoTalla
        AND Periodo != 99
    `);

  return Number(result.recordset[0]?.StockHistorico || 0);
}


/**
 * Crea un registro en AcumuladoStockUbicacion con periodo 99,
 * asignándole el stock histórico proporcionado.
 */
async function crearRegistroPeriodo99(ajuste, codigoEmpresa, ejercicio, stockInicial, transaction) {
  const {
    articulo,
    codigoAlmacen,
    ubicacionStr,
    partida,
    unidadStock,
    codigoColor,
    codigoTalla01
  } = ajuste;

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

  // 1. Eliminar cualquier registro periodo 99 existente (por si acaso)
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('tipoUnidad', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      DELETE FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio = @ejercicio
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND Ubicacion = @ubicacion
        AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
        AND ISNULL(Partida, '') = @partida
        AND ISNULL(CodigoColor_, '') = @codigoColor
        AND ISNULL(CodigoTalla01_, '') = @codigoTalla
        AND Periodo = 99
    `);

  // 2. Insertar nuevo registro con el stock inicial
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .input('unidadSaldo', sql.Decimal(18,4), stockInicial)
    .input('unidadSaldoTipo', sql.Decimal(18,4), stockInicial)
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

  console.log(`[INICIALIZAR] Periodo99 creado para ${articulo} en ${ubicacionNormalizada} con stock ${stockInicial}`);
}

// Función para corregir una discrepancia individual (usada en sincronización automática)
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
      StockOficial      // ← Este es el stock total deseado (periodo0+periodo99)
    } = discrepancia;

    console.log(`[SYNC AUTO] Corrigiendo: ${CodigoArticulo} | ${CodigoAlmacen} | ${Ubicacion} | Stock oficial total: ${StockOficial}`);

    // 1. Obtener el stock actual del periodo 0 para esta combinación (si existe)
    const periodo0Result = await new sql.Request(transaction)
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
        SELECT COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS StockPeriodo0
        FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND CodigoAlmacen = @codigoAlmacen
          AND CodigoArticulo = @codigoArticulo
          AND Ubicacion = @ubicacion
          AND (TipoUnidadMedida_ = @tipoUnidadMedida OR (TipoUnidadMedida_ IS NULL AND @tipoUnidadMedida = ''))
          AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
          AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
          AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
          AND Periodo = 0
      `);

    const stockPeriodo0 = periodo0Result.recordset[0]?.StockPeriodo0 || 0;
    const nuevoPeriodo99 = parseFloat(StockOficial) - stockPeriodo0;

    console.log(`[SYNC AUTO] Periodo0: ${stockPeriodo0}, Total oficial: ${StockOficial}, Nuevo periodo99: ${nuevoPeriodo99}`);

    // 2. Eliminar el registro actual del periodo 99 (solo del ejercicio actual)
    await new sql.Request(transaction)
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

    // 3. Insertar el nuevo periodo99 solo si el valor es distinto de cero (opcional)
    //    Si se prefiere mantener siempre un registro (incluso cero), quita el if.
    if (Math.abs(nuevoPeriodo99) > 0.001) {
      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.Int, ejercicio)
        .input('codigoAlmacen', sql.VarChar, CodigoAlmacen)
        .input('ubicacion', sql.VarChar, Ubicacion)
        .input('codigoArticulo', sql.VarChar, CodigoArticulo)
        .input('tipoUnidadMedida', sql.VarChar, TipoUnidadMedida_ || '')
        .input('partida', sql.VarChar, Partida || '')
        .input('codigoColor', sql.VarChar, CodigoColor_ || '')
        .input('codigoTalla', sql.VarChar, CodigoTalla01_ || '')
        .input('unidadSaldo', sql.Decimal(18,4), nuevoPeriodo99)
        .input('unidadSaldoTipo', sql.Decimal(18,4), nuevoPeriodo99)
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
    } else {
      console.log(`[SYNC AUTO] Nuevo periodo99 es prácticamente cero, se omite inserción. El stock total quedará en ${stockPeriodo0}`);
    }

    await transaction.commit();
    console.log(`[SYNC AUTO] Corregido: ${CodigoArticulo} | ${CodigoAlmacen} | ${Ubicacion}`);
  } catch (error) {
    if (transaction && !transaction._aborted) {
      try { await transaction.rollback(); } catch (e) { console.error('[SYNC AUTO] Error en rollback:', e); }
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
  const requestStartedAt = Date.now();

  try {
    const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
    const codigoLike = `%${codigo}%`;
    const familiaLike = `%${familia}%`;
    const subfamiliaLike = `%${subfamilia}%`;
    const almacenLike = `%${almacen}%`;
    const ubicacionLike = `%${ubicacion}%`;

    // 1. Obtener códigos de artículo paginados (misma lógica que antes)
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
            AND s.Periodo IN (0, 99)
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
    const codigosPagina = codigoRows.slice(0, limit).map(row => String(row.CodigoArticulo || '').trim()).filter(Boolean);

    if (codigosPagina.length === 0) {
      return res.json({ items: [], hasMore: false, nextOffset: null });
    }

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

    // 🔥 CONSULTA PRINCIPAL CORREGIDA: se elimina s.Periodo y se asigna 99 como periodo fijo
    const detalleQuery = `
      WITH StockUbicacionSumado AS (
        SELECT
          s.CodigoEmpresa,
          s.CodigoAlmacen,
          s.Ubicacion,
          s.CodigoArticulo,
          ISNULL(s.TipoUnidadMedida_, '') AS TipoUnidadMedida_,
          ISNULL(s.Partida, '') AS Partida,
          ISNULL(s.CodigoColor_, '') AS CodigoColor_,
          ISNULL(s.CodigoTalla01_, '') AS CodigoTalla01_,
          SUM(CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18,4))) AS UnidadSaldoTotal,
          SUM(CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18,4))) AS UnidadSaldoTipoTotal,
          MAX(s.Ejercicio) AS Ejercicio
        FROM AcumuladoStockUbicacion s
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.Periodo IN (0, 99)
          AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
          AND LTRIM(RTRIM(s.CodigoArticulo)) IN (${codigoInputs})
        GROUP BY
          s.CodigoEmpresa, s.CodigoAlmacen, s.Ubicacion, s.CodigoArticulo,
          ISNULL(s.TipoUnidadMedida_, ''),
          ISNULL(s.Partida, ''),
          ISNULL(s.CodigoColor_, ''),
          ISNULL(s.CodigoTalla01_, '')
      ),
      StockUbicacionVersionado AS (
        SELECT
          s.*,
          ROW_NUMBER() OVER (
            PARTITION BY
              s.CodigoEmpresa, s.CodigoAlmacen, s.Ubicacion, s.CodigoArticulo,
              s.TipoUnidadMedida_, s.Partida, s.CodigoColor_, s.CodigoTalla01_
            ORDER BY
              CASE WHEN s.Ejercicio = @ejercicioActual THEN 0 ELSE 1 END,
              s.Ejercicio DESC
          ) AS rn
        FROM StockUbicacionSumado s
      ),
      StockUbicacionActual AS (
        SELECT * FROM StockUbicacionVersionado WHERE rn = 1
      ),
      AcumuladoStockSumado AS (
        SELECT
          s.CodigoEmpresa,
          s.CodigoAlmacen,
          s.CodigoArticulo,
          ISNULL(s.TipoUnidadMedida_, '') AS TipoUnidadMedida_,
          ISNULL(s.Partida, '') AS Partida,
          ISNULL(s.CodigoColor_, '') AS CodigoColor_,
          ISNULL(s.CodigoTalla01_, '') AS CodigoTalla01_,
          SUM(CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18,4))) AS UnidadSaldoTotal,
          SUM(CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18,4))) AS UnidadSaldoTipoTotal,
          MAX(s.Ejercicio) AS Ejercicio
        FROM AcumuladoStock s
        WHERE s.CodigoEmpresa = @codigoEmpresa
          AND s.Periodo IN (0, 99)
          AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
          AND LTRIM(RTRIM(s.CodigoArticulo)) IN (${codigoInputs})
        GROUP BY
          s.CodigoEmpresa, s.CodigoAlmacen, s.CodigoArticulo,
          ISNULL(s.TipoUnidadMedida_, ''),
          ISNULL(s.Partida, ''),
          ISNULL(s.CodigoColor_, ''),
          ISNULL(s.CodigoTalla01_, '')
      ),
      AcumuladoStockVersionado AS (
        SELECT
          s.*,
          ROW_NUMBER() OVER (
            PARTITION BY
              s.CodigoEmpresa, s.CodigoAlmacen, s.CodigoArticulo,
              s.TipoUnidadMedida_, s.Partida, s.CodigoColor_, s.CodigoTalla01_
            ORDER BY
              CASE WHEN s.Ejercicio = @ejercicioActual THEN 0 ELSE 1 END,
              s.Ejercicio DESC
          ) AS rn
        FROM AcumuladoStockSumado s
      ),
      AcumuladoStockActual AS (
        SELECT * FROM AcumuladoStockVersionado WHERE rn = 1
      ),
      AlmacenPlaceholder AS (
        SELECT TOP 1 CodigoAlmacen, Almacen AS NombreAlmacen
        FROM Almacenes WHERE CodigoEmpresa = @codigoEmpresa
        ORDER BY CASE WHEN CodigoAlmacen = 'CEN' THEN 0 ELSE 1 END, CodigoAlmacen
      ),
      ArticulosSinStock AS (
        SELECT
          a.CodigoEmpresa, a.CodigoArticulo, a.DescripcionArticulo,
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
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        s.TipoUnidadMedida_ AS UnidadStock,
        s.UnidadSaldoTipoTotal AS CantidadBase,
        s.UnidadSaldoTipoTotal AS Cantidad,
        s.Partida,
        99 AS Periodo,                    -- ← Periodo fijo (stock actual)
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
        ON alm.CodigoEmpresa = s.CodigoEmpresa AND alm.CodigoAlmacen = s.CodigoAlmacen
      LEFT JOIN Ubicaciones u
        ON u.CodigoEmpresa = s.CodigoEmpresa AND u.CodigoAlmacen = s.CodigoAlmacen AND u.Ubicacion = s.Ubicacion
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND LTRIM(RTRIM(COALESCE(a.CodigoArticulo, s.CodigoArticulo))) IN (${codigoInputs})
        AND (@almacen = '' OR (ISNULL(s.CodigoAlmacen, '') LIKE @almacenLike OR ISNULL(alm.Almacen, '') LIKE @almacenLike))
        AND (@ubicacion = '' OR (ISNULL(s.Ubicacion, '') LIKE @ubicacionLike OR ISNULL(u.DescripcionUbicacion, '') LIKE @ubicacionLike))

      UNION ALL

      SELECT
        a.CodigoArticulo,
        a.CodigoArticulo,
        a.DescripcionArticulo,
        COALESCE(a.Descripcion2Articulo, ''),
        ap.CodigoAlmacen,
        ap.NombreAlmacen,
        'SIN-UBICACION' AS Ubicacion,
        'Stock sin ubicacion asignada' AS DescripcionUbicacion,
        '' AS UnidadStock,
        CAST(0 AS DECIMAL(18,4)) AS CantidadBase,
        CAST(0 AS DECIMAL(18,4)) AS Cantidad,
        '' AS Partida,
        99 AS Periodo,                     -- ← Periodo fijo
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

    // Conversión de unidades (se mantiene)
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
          AND CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5', '000', 'SEC', 'R')
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

// ✅ 9.3 OBTENER ARTÃCULOS POR UBICACIÃ“N (CORREGIDO)
router.get('/stock/por-ubicacion', async (req, res) => {
  const { codigoAlmacen, ubicacion, page = 1, pageSize = 100 } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;
  const ejercicioActual = new Date().getFullYear(); // 2026

  console.log('================== STOCK POR UBICACIÓN ==================');
  console.log(`[STOCK] Empresa: ${codigoEmpresa}, Almacén: ${codigoAlmacen}, Ubicación: ${ubicacion}`);
  console.log(`[STOCK] Página: ${page}, Tamaño: ${pageSize}`);
  console.log(`[STOCK] Ejercicio usado: ${ejercicioActual}, Periodo: 99`);

  if (!codigoEmpresa || !codigoAlmacen || !ubicacion) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa, almacén y ubicación requeridos.' 
    });
  }

  try {
    const offset = (page - 1) * pageSize;
    const pool = getPool();

    // 1. Contar total de registros con stock > 0
    const countRequest = pool.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacion)
      .input('ejercicio', sql.Int, ejercicioActual)
      .input('periodo', sql.Int, 99);

    console.log('[STOCK] Ejecutando COUNT...');
    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS TotalCount
      FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND CodigoAlmacen = @codigoAlmacen
        AND Ubicacion = @ubicacion
        AND Ejercicio = @ejercicio
        AND Periodo = @periodo
        AND UnidadSaldo > 0
    `);
    const total = countResult.recordset[0].TotalCount;
    console.log(`[STOCK] Total registros con stock: ${total}`);

    // 2. Obtener los artículos con paginación
    const dataRequest = pool.request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacion)
      .input('ejercicio', sql.Int, ejercicioActual)
      .input('periodo', sql.Int, 99)
      .input('offset', sql.Int, offset)
      .input('pageSize', sql.Int, pageSize);

    console.log('[STOCK] Ejecutando consulta paginada...');
    const result = await dataRequest.query(`
      SELECT 
        s.CodigoArticulo,
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
      FROM AcumuladoStockUbicacion s
      LEFT JOIN Articulos a 
        ON a.CodigoArticulo = s.CodigoArticulo 
        AND a.CodigoEmpresa = s.CodigoEmpresa
      LEFT JOIN Colores_ c 
        ON c.CodigoColor_ = s.CodigoColor_
        AND c.CodigoEmpresa = s.CodigoEmpresa
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND s.CodigoAlmacen = @codigoAlmacen
        AND s.Ubicacion = @ubicacion
        AND s.Ejercicio = @ejercicio
        AND s.Periodo = @periodo
        AND s.UnidadSaldo > 0
      ORDER BY COALESCE(a.DescripcionArticulo, s.CodigoArticulo)
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `);

    console.log(`[STOCK] Filas devueltas: ${result.recordset.length}`);
    if (result.recordset.length > 0) {
      console.log('[STOCK] Primer artículo:', result.recordset[0]);
    } else {
      console.log('[STOCK] No se encontraron artículos con stock en esta ubicación');
    }

    res.json({
      success: true,
      articulos: result.recordset,
      total: total,
      debug: {
        ejercicio: ejercicioActual,
        periodo: 99,
        almacen: codigoAlmacen,
        ubicacion: ubicacion
      }
    });
  } catch (err) {
    console.error('[ERROR STOCK UBICACION]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener artículos por ubicación',
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
      mensaje: 'Código de empresa requerido.' 
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
        -- Stock total por combinación (periodo 0 + 99, ejercicios base/actual)
        WITH StockTotal AS (
          SELECT 
            CodigoArticulo,
            CodigoAlmacen,
            ISNULL(TipoUnidadMedida_, '') AS TipoUnidadMedida_,
            ISNULL(Partida, '') AS Partida,
            ISNULL(CodigoColor_, '') AS CodigoColor_,
            ISNULL(CodigoTalla01_, '') AS CodigoTalla01_,
            SUM(CAST(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS DECIMAL(18, 4))) as StockTotal
          FROM AcumuladoStock
          WHERE CodigoEmpresa = @codigoEmpresa
            AND Periodo IN (0, 99)                    -- ← Sumar ambos periodos
            AND Ejercicio IN (@ejercicioBase, @ejercicioActual)
          GROUP BY CodigoArticulo, CodigoAlmacen, 
                   ISNULL(TipoUnidadMedida_, ''), ISNULL(Partida, ''),
                   ISNULL(CodigoColor_, ''), ISNULL(CodigoTalla01_, '')
        ),

        -- Stock con ubicación (periodo 0 + 99, ejercicios base/actual)
        StockConUbicacion AS (
          SELECT 
            CodigoArticulo,
            CodigoAlmacen,
            ISNULL(TipoUnidadMedida_, '') AS TipoUnidadMedida_,
            ISNULL(Partida, '') AS Partida,
            ISNULL(CodigoColor_, '') AS CodigoColor_,
            ISNULL(CodigoTalla01_, '') AS CodigoTalla01_,
            SUM(CAST(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS DECIMAL(18, 4))) as StockConUbicacion
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND Periodo IN (0, 99)                    -- ← Sumar ambos periodos
            AND Ejercicio IN (@ejercicioBase, @ejercicioActual)
          GROUP BY CodigoArticulo, CodigoAlmacen,
                   ISNULL(TipoUnidadMedida_, ''), ISNULL(Partida, ''),
                   ISNULL(CodigoColor_, ''), ISNULL(CodigoTalla01_, '')
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
              THEN (st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) * a.FactorConversion_
            WHEN st.TipoUnidadMedida_ = a.UnidadMedida2_ 
              THEN (st.StockTotal - ISNULL(sc.StockConUbicacion, 0))
            ELSE (st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) * a.FactorConversion_
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
            CAST(CAST((st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) AS DECIMAL(18,4)) AS VARCHAR(20))
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
          AND sc.Partida = st.Partida
          AND sc.CodigoColor_ = st.CodigoColor_
          AND sc.CodigoTalla01_ = st.CodigoTalla01_
        WHERE (st.StockTotal - ISNULL(sc.StockConUbicacion, 0)) != 0
        ORDER BY st.CodigoArticulo, st.CodigoAlmacen
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR STOCK SIN UBICACION]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock sin ubicación',
      error: err.message 
    });
  }
});

// ============================================
// ✅ ENDPOINT ÚNICO Y DEFINITIVO (con paginación + Inventarios)
// Ruta: /inventario/historial-ajustes-v2
// ============================================
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
  const limit = [20, 25, 50, 100].includes(requestedLimit) ? requestedLimit : 20;
  const offset = (page - 1) * limit;

  const hoy = new Date();
  const haceTreintaDias = new Date(hoy);
  haceTreintaDias.setDate(hoy.getDate() - 30);

  const fechaDesde = req.query.fechaDesde || haceTreintaDias.toISOString().split('T')[0];
  const fechaHasta = req.query.fechaHasta || hoy.toISOString().split('T')[0];

  try {
    console.log(`[HISTORIAL V2] Empresa ${codigoEmpresa} | ${fechaDesde} → ${fechaHasta} | page ${page} | limit ${limit}`);

    // 1. Total de registros (MovimientoStock + Inventarios)
    const totalResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('fechaDesde', sql.Date, fechaDesde)
      .input('fechaHasta', sql.Date, fechaHasta)
      .query(`
        SELECT COUNT(*) AS Total FROM (
          SELECT 1 AS dummy FROM MovimientoStock m
          WHERE m.CodigoEmpresa = @codigoEmpresa
            AND m.TipoMovimiento = 5
            AND CONVERT(date, m.FechaRegistro) BETWEEN @fechaDesde AND @fechaHasta
            AND (m.Unidades IS NOT NULL AND m.Unidades <> 0)
          UNION ALL
          SELECT 1 AS dummy FROM Inventarios i
          WHERE i.CodigoEmpresa = @codigoEmpresa
            AND i.StatusRegulariza = -1
            AND CONVERT(date, i.FechaCreacion) BETWEEN @fechaDesde AND @fechaHasta
            AND (i.UnidadesInventario - i.UnidadesStock) != 0
        ) AS T
      `);

    const total = Number(totalResult.recordset[0]?.Total || 0);
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    // 2. Datos paginados (uniendo MovimientoStock e Inventarios)
    const dataResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('fechaDesde', sql.Date, fechaDesde)
      .input('fechaHasta', sql.Date, fechaHasta)
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(`
        WITH Combinados AS (
          -- Movimientos de stock
          SELECT
            m.Ejercicio,
            m.Periodo,
            m.CodigoArticulo,
            m.CodigoAlmacen,
            m.Ubicacion,
            ISNULL(m.Partida, '') AS Partida,
            CAST(ISNULL(m.Unidades, 0) AS DECIMAL(18,4)) AS Diferencia,
            m.Comentario,
            m.FechaRegistro,
            ISNULL(m.UnidadMedida1_, '') AS UnidadMedida,
            ISNULL(m.CodigoColor_, '') AS CodigoColor,
            ISNULL(m.CodigoTalla01_, '') AS CodigoTalla01,
            'MOVIMIENTO' AS TipoRegistro,
            CASE
              WHEN NULLIF(LTRIM(RTRIM(ISNULL(m.UsuarioProceso, ''))), '') IS NOT NULL
                AND LTRIM(RTRIM(ISNULL(m.UsuarioProceso, ''))) <> '0'
                THEN LTRIM(RTRIM(m.UsuarioProceso))
              WHEN CHARINDEX(' por ', ISNULL(m.Comentario, '')) > 0
                THEN LTRIM(RTRIM(SUBSTRING(
                  m.Comentario,
                  CHARINDEX(' por ', m.Comentario) + 5,
                  LEN(m.Comentario)
                )))
              ELSE NULL
            END AS Usuario,
            CASE
              WHEN CHARINDEX(' por ', ISNULL(m.Comentario, '')) > 0
                THEN LEFT(m.Comentario, CHARINDEX(' por ', m.Comentario) - 1)
              ELSE m.Comentario
            END AS ComentarioLimpio
          FROM MovimientoStock m
          WHERE m.CodigoEmpresa = @codigoEmpresa
            AND m.TipoMovimiento = 5
            AND CONVERT(date, m.FechaRegistro) BETWEEN @fechaDesde AND @fechaHasta
            AND (m.Unidades IS NOT NULL AND m.Unidades <> 0)

          UNION ALL

          -- Inventarios manuales
          SELECT
            YEAR(i.FechaCreacion) AS Ejercicio,
            MONTH(i.FechaCreacion) AS Periodo,
            i.CodigoArticulo,
            i.CodigoAlmacen,
            i.Ubicacion,
            ISNULL(i.Partida, '') AS Partida,
            CAST((i.UnidadesInventario - i.UnidadesStock) AS DECIMAL(18,4)) AS Diferencia,
            i.Inventario AS Comentario,
            i.FechaCreacion AS FechaRegistro,
            ISNULL(i.TipoUnidadMedida_, '') AS UnidadMedida,
            ISNULL(i.CodigoColor_, '') AS CodigoColor,
            ISNULL(i.CodigoTalla01_, '') AS CodigoTalla01,
            'INVENTARIO' AS TipoRegistro,
            NULL AS Usuario,
            i.Inventario AS ComentarioLimpio
          FROM Inventarios i
          WHERE i.CodigoEmpresa = @codigoEmpresa
            AND i.StatusRegulariza = -1
            AND CONVERT(date, i.FechaCreacion) BETWEEN @fechaDesde AND @fechaHasta
            AND (i.UnidadesInventario - i.UnidadesStock) != 0
        )
        SELECT
          c.Ejercicio,
          c.Periodo,
          c.CodigoArticulo,
          COALESCE(a.DescripcionArticulo, c.CodigoArticulo) AS DescripcionArticulo,
          c.CodigoAlmacen,
          COALESCE(alm.Almacen, c.CodigoAlmacen) AS NombreAlmacen,
          c.Ubicacion,
          COALESCE(u.DescripcionUbicacion, '') AS DescripcionUbicacion,
          c.Partida,
          c.Diferencia,
          c.ComentarioLimpio AS Comentario,
          c.Usuario,
          c.FechaRegistro,
          c.UnidadMedida,
          c.CodigoColor,
          c.CodigoTalla01,
          c.TipoRegistro
        FROM Combinados c
        LEFT JOIN Articulos a
          ON a.CodigoEmpresa = @codigoEmpresa
          AND a.CodigoArticulo = c.CodigoArticulo
        LEFT JOIN Almacenes alm
          ON alm.CodigoEmpresa = @codigoEmpresa
          AND alm.CodigoAlmacen = c.CodigoAlmacen
        LEFT JOIN Ubicaciones u
          ON u.CodigoEmpresa = @codigoEmpresa
          AND u.CodigoAlmacen = c.CodigoAlmacen
          AND u.Ubicacion = c.Ubicacion
        ORDER BY c.FechaRegistro DESC, c.CodigoArticulo
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    res.json({
      success: true,
      items: dataResult.recordset,
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

// ✅ ENDPOINT CORREGIDO: /stock/por-articulo
router.get('/stock/por-articulo', async (req, res) => {
  const { codigoArticulo, incluirSinUbicacion = 'false' } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !codigoArticulo) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa y artículo requeridos.' 
    });
  }

  try {
    // Obtener el contexto de inventario (ejercicioBase y ejercicioActual)
    const contexto = await obtenerContextoBaseInventario(codigoEmpresa);

    // Construir la consulta principal (con o sin la parte de stock sin ubicación)
    let query = `
      -- Stock con ubicación (periodos 0 y 99, ejercicios base y actual)
      SELECT 
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        SUM(CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18, 2))) AS Cantidad,
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
          ISNULL(s.TipoUnidadMedida_, ''), '_',
          ISNULL(s.Partida, ''), '_',
          ISNULL(s.CodigoColor_, ''), '_',
          ISNULL(s.CodigoTalla01_, '')
        ) AS GrupoUnico,
        CAST(SUM(COALESCE(s.UnidadSaldo, 0)) AS DECIMAL(18, 2)) AS UnidadSaldo_Original,
        CAST(SUM(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0)) AS DECIMAL(18, 2)) AS UnidadSaldoTipo_Corregido
      FROM AcumuladoStockUbicacion s
      LEFT JOIN Almacenes alm 
        ON alm.CodigoEmpresa = s.CodigoEmpresa 
        AND alm.CodigoAlmacen = s.CodigoAlmacen
      LEFT JOIN Articulos a 
        ON a.CodigoEmpresa = s.CodigoEmpresa 
        AND a.CodigoArticulo = s.CodigoArticulo
      LEFT JOIN Ubicaciones u 
        ON u.CodigoEmpresa = s.CodigoEmpresa 
        AND u.CodigoAlmacen = s.CodigoAlmacen 
        AND u.Ubicacion = s.Ubicacion
      LEFT JOIN Colores_ c 
        ON c.CodigoEmpresa = s.CodigoEmpresa 
        AND c.CodigoColor_ = s.CodigoColor_
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND s.CodigoArticulo = @codigoArticulo
        AND s.Periodo IN (0, 99)
        AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
      GROUP BY
        s.CodigoAlmacen, alm.Almacen,
        s.Ubicacion, u.DescripcionUbicacion,
        s.TipoUnidadMedida_, s.Partida,
        s.CodigoColor_, s.CodigoTalla01_, c.Color_,
        a.DescripcionArticulo, a.Descripcion2Articulo,
        s.CodigoArticulo   -- ✅ Agregado para evitar error 8120
    `;

    // Si se solicita incluir stock sin ubicación, agregar UNION ALL
    if (incluirSinUbicacion === 'true') {
      query += `
        UNION ALL

        -- Stock sin ubicación (periodos 0 y 99, ejercicios base y actual)
        SELECT 
          s.CodigoAlmacen,
          alm.Almacen AS NombreAlmacen,
          'SIN-UBICACION' AS Ubicacion,
          'Stock sin ubicación asignada' AS DescripcionUbicacion,
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
          FROM AcumuladoStock
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoArticulo = @codigoArticulo
            AND Periodo IN (0, 99)
            AND Ejercicio IN (@ejercicioBase, @ejercicioActual)
          GROUP BY CodigoAlmacen, CodigoArticulo
        ) s
        LEFT JOIN Almacenes alm 
          ON s.CodigoAlmacen = alm.CodigoAlmacen 
          AND alm.CodigoEmpresa = @codigoEmpresa
        LEFT JOIN Articulos a 
          ON a.CodigoEmpresa = @codigoEmpresa 
          AND a.CodigoArticulo = s.CodigoArticulo
        LEFT JOIN (
          SELECT 
            CodigoAlmacen,
            CodigoArticulo,
            SUM(UnidadSaldo) AS StockUbicado
          FROM AcumuladoStockUbicacion
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoArticulo = @codigoArticulo
            AND Periodo IN (0, 99)
            AND Ejercicio IN (@ejercicioBase, @ejercicioActual)
          GROUP BY CodigoAlmacen, CodigoArticulo
        ) u 
          ON u.CodigoAlmacen = s.CodigoAlmacen 
          AND u.CodigoArticulo = s.CodigoArticulo
        WHERE (s.StockTotal - ISNULL(u.StockUbicado, 0)) != 0
      `;
    }

    // Orden final
    query += ` ORDER BY CodigoAlmacen, Ubicacion`;

    // Ejecutar la consulta con los parámetros adecuados
    const request = agregarContextoInventario(
      getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, codigoArticulo),
      contexto
    );

    const result = await request.query(query);
      
    console.log(`[STOCK POR ARTICULO] Artículo: ${codigoArticulo}, Registros devueltos: ${result.recordset.length}`);
    
    // Opcional: depuración de cantidades negativas o cero
    const registrosNegativos = result.recordset.filter(item => item.Cantidad < 0);
    const registrosCero = result.recordset.filter(item => item.Cantidad === 0);
    if (registrosNegativos.length > 0 || registrosCero.length > 0) {
      console.log(`🔍 Artículo ${codigoArticulo}: ${registrosNegativos.length} negativos, ${registrosCero.length} cero`);
    }
    
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR STOCK POR ARTICULO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock por artículo.',
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
      mensaje: 'Código de empresa y artículo requeridos.' 
    });
  }

  console.log('[STOCK POR VARIANTE] Parámetros:', {
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

    // Construcción dinámica de filtros para color y talla
    let filtroColor = '';
    let filtroTalla = '';

    if (codigoColor && codigoColor !== '' && codigoColor !== 'null') {
      filtroColor = `AND ISNULL(s.CodigoColor_, '') = @codigoColor`;
      request.input('codigoColor', sql.VarChar(10), codigoColor);
    } else {
      // Si no se especifica color, incluir registros sin color o vacío
      filtroColor = `AND ISNULL(s.CodigoColor_, '') = ''`;
    }

    if (codigoTalla && codigoTalla !== '' && codigoTalla !== 'null') {
      filtroTalla = `AND ISNULL(s.CodigoTalla01_, '') = @codigoTalla`;
      request.input('codigoTalla', sql.VarChar(10), codigoTalla);
    } else {
      filtroTalla = `AND ISNULL(s.CodigoTalla01_, '') = ''`;
    }

    const query = `
      SELECT 
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        SUM(CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18, 2))) AS Cantidad,
        COALESCE(NULLIF(s.TipoUnidadMedida_, ''), 'unidades') AS UnidadMedida,
        s.Partida,
        s.CodigoColor_,
        s.CodigoTalla01_,
        SUM(CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18, 2))) AS UnidadSaldoTipo_Sum
      FROM AcumuladoStockUbicacion s
      LEFT JOIN Almacenes alm 
        ON alm.CodigoEmpresa = s.CodigoEmpresa 
        AND alm.CodigoAlmacen = s.CodigoAlmacen
      LEFT JOIN Ubicaciones u 
        ON u.CodigoEmpresa = s.CodigoEmpresa 
        AND u.CodigoAlmacen = s.CodigoAlmacen 
        AND u.Ubicacion = s.Ubicacion
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND s.CodigoArticulo = @codigoArticulo
        AND s.Periodo IN (0, 99)                       -- ← Sumar ambos periodos
        AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
        ${filtroColor}
        ${filtroTalla}
      GROUP BY
        s.CodigoAlmacen, alm.Almacen,
        s.Ubicacion, u.DescripcionUbicacion,
        s.TipoUnidadMedida_, s.Partida,
        s.CodigoColor_, s.CodigoTalla01_
      HAVING SUM(CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18, 2))) != 0
      ORDER BY s.CodigoAlmacen, s.Ubicacion
    `;

    console.log('[STOCK POR VARIANTE] Query ejecutada con filtros:', { color: codigoColor || '(vacío)', talla: codigoTalla || '(vacío)' });

    const result = await request.query(query);
    
    console.log(`[STOCK POR VARIANTE] Resultados: ${result.recordset.length} ubicaciones encontradas`);
    
    // Opcional: mostrar primeras filas para depuración
    if (result.recordset.length > 0) {
      console.log('[STOCK POR VARIANTE] Muestra:', result.recordset.slice(0, 3).map(r => ({
        almacen: r.CodigoAlmacen,
        ubicacion: r.Ubicacion,
        cantidad: r.Cantidad,
        color: r.CodigoColor_,
        talla: r.CodigoTalla01_
      })));
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

// ============================================
// ✅ ENDPOINT COMPLETO Y CORREGIDO: AJUSTAR INVENTARIO
// ============================================
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
      mensaje: 'Lista de ajustes vacía o inválida.' 
    });
  }

  // 1. Obtener contexto (ejercicioBase y ejercicioActual)
  const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
  const transaction = new sql.Transaction(getPool());

  try {
    await transaction.begin();

    console.log(`[AJUSTE MANUAL] Iniciando ${ajustes.length} ajustes para empresa ${codigoEmpresa}`);
    console.log(`[AJUSTE MANUAL] Contexto: ejercicioBase=${contexto.ejercicioBase}, ejercicioActual=${contexto.ejercicioActual}`);

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

      console.log(`[AJUSTE MANUAL] Procesando: ${ajusteDestino.articulo} | ${ajusteDestino.codigoAlmacen} | ${ajusteDestino.ubicacionStr} | Nueva cantidad: ${ajusteDestino.nuevaCantidad}`);

      const esEdicion = Boolean(ajuste.combinacionOriginal);
      const mismaCombinacion = esMismaCombinacionInventario(ajusteOrigen, ajusteDestino);
      const registroOrigen = await obtenerRegistroVigenteAcumuladoStockUbicacionExacto(codigoEmpresa, ajusteOrigen, transaction);
      const registroDestino = await obtenerRegistroVigenteAcumuladoStockUbicacionExacto(codigoEmpresa, ajusteDestino, transaction);
      const permiteRecrearDesdeCero = esEdicion && mismaCombinacion && !registroOrigen;

      // Diagnóstico para la combinación destino
      const diagnosticoDestino = await obtenerDiagnosticoStockVigenteAjuste(
        codigoEmpresa,
        ejercicio,
        ajusteDestino,
        contexto,
        transaction
      );

      // ✅ INICIALIZACIÓN AUTOMÁTICA (CORREGIDA): si falta periodo99 pero hay histórico, crear registro usando actualizarAcumuladoStockUbicacion
      if (debeBloquearAjusteSinStockVigente(diagnosticoDestino)) {
        console.log(`[AJUSTE MANUAL] Inicializando periodo 99 para ${ajusteDestino.articulo} basado en histórico`);
        
        const historicoTotal = await obtenerStockHistoricoTotal(codigoEmpresa, ajusteDestino, contexto, transaction);
        
        // 🔥 En lugar de crearRegistroPeriodo99, usamos actualizarAcumuladoStockUbicacion con la cantidad histórica
        // Esto unifica la lógica y evita duplicidad
        await actualizarAcumuladoStockUbicacion(
          { ...ajusteDestino, nuevaCantidad: historicoTotal },
          codigoEmpresa,
          ejercicio,
          contexto,
          transaction
        );
        
        // Sincronizar AcumuladoStock desde ubicaciones (recalcula el total)
        await sincronizarAcumuladoStockDesdeUbicaciones(
          ajusteDestino,
          codigoEmpresa,
          ejercicio,
          contexto,
          transaction
        );
        
        // Actualizar diagnóstico para que el flujo continúe
        diagnosticoDestino.existeUbicacionPeriodo99 = true;
        diagnosticoDestino.saldoAcumuladoPeriodo99 = historicoTotal;
        
        console.log(`[AJUSTE MANUAL] Periodo99 inicializado con stock ${historicoTotal}. Ahora puede ajustarse.`);
      }
      // Si no hay histórico ni periodo99, bloqueamos
      else if (!diagnosticoDestino.existeUbicacionPeriodo99 && !diagnosticoDestino.hayHistoricoOtrosPeriodos) {
        throw crearErrorInventario(409, 'No existe stock histórico ni registro vigente. No se puede ajustar.');
      }

      // Validación de existencia (evitar duplicados en creación)
      if (!esEdicion && registroDestino) {
        throw crearErrorInventario(409, 'Ese artículo/variante ya existe. Edítalo manualmente desde el listado.');
      }

      if (esEdicion && !registroOrigen && !permiteRecrearDesdeCero) {
        throw crearErrorInventario(409, 'No se encontró la combinación origen para editar el inventario.');
      }

      // Lógica de edición con cambio de combinación
      if (esEdicion && !mismaCombinacion) {
        const diagnosticoOrigen = await obtenerDiagnosticoStockVigenteAjuste(
          codigoEmpresa,
          ejercicio,
          ajusteOrigen,
          contexto,
          transaction
        );

        if (debeBloquearAjusteSinStockVigente(diagnosticoOrigen)) {
          throw crearErrorInventario(
            409,
            'El artículo origen tiene stock histórico pero no tiene saldo vigente en periodo 99. Regulariza/consolida primero.'
          );
        }

        const cantidadDestinoActual = parseFloat(registroDestino?.UnidadSaldo ?? 0) || 0;
        const cantidadFinalDestino = cantidadDestinoActual + ajusteDestino.nuevaCantidad;

        await eliminarCombinacionVigenteAcumuladoStockUbicacion(codigoEmpresa, ajusteOrigen, ejercicio, transaction);
        await actualizarAcumuladoStockUbicacion(
          { ...ajusteDestino, nuevaCantidad: cantidadFinalDestino },
          codigoEmpresa,
          ejercicio,
          contexto,
          transaction
        );
        await sincronizarAcumuladoStockDesdeUbicaciones(
          { ...ajusteOrigen, nuevaCantidad: 0 },
          codigoEmpresa,
          ejercicio,
          contexto,
          transaction
        );
        await sincronizarAcumuladoStockDesdeUbicaciones(
          { ...ajusteDestino, nuevaCantidad: cantidadFinalDestino },
          codigoEmpresa,
          ejercicio,
          contexto,
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

      // Actualización normal (misma combinación o creación)
      await actualizarAcumuladoStockUbicacion(ajusteDestino, codigoEmpresa, ejercicio, contexto, transaction);
      await sincronizarAcumuladoStockDesdeUbicaciones(ajusteDestino, codigoEmpresa, ejercicio, contexto, transaction);

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
      mensaje: `Ajustes realizados correctamente. ${ajustes.length} ubicaciones actualizadas.`
    });

  } catch (error) {
    try {
      if (!transaction._aborted) await transaction.rollback();
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

/**
 * Sincroniza AcumuladoStock (periodo 99) con la suma de todas las ubicaciones (periodos 0+99)
 * para la combinación específica de artículo, almacén, partida, unidad, color y talla.
 * 
 * @param {Object} ajuste - Datos de la combinación.
 * @param {string} codigoEmpresa - Código de empresa.
 * @param {number} ejercicio - Ejercicio actual (año).
 * @param {Object} contexto - Objeto con ejercicioBase y ejercicioActual (de obtenerContextoBaseInventario).
 * @param {Object} transaction - Transacción activa de SQL Server.
 */
async function sincronizarAcumuladoStockDesdeUbicaciones(ajuste, codigoEmpresa, ejercicio, contexto, transaction) {
  // 🔐 Validación estricta del contexto (evita errores silenciosos)
  if (!contexto || typeof contexto !== 'object') {
    throw new Error('sincronizarAcumuladoStockDesdeUbicaciones: contexto inválido o no proporcionado');
  }
  if (!contexto.ejercicioBase || !contexto.ejercicioActual) {
    throw new Error('sincronizarAcumuladoStockDesdeUbicaciones: faltan ejercicioBase o ejercicioActual en contexto');
  }

  const {
    articulo,
    codigoAlmacen,
    partida,
    unidadStock,
    codigoColor,
    codigoTalla01
  } = ajuste;

  // Normalización: si la unidad es "unidades" se guarda como cadena vacía (coherente con BD)
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock || '');

  // 1. Sumar el stock total de TODAS las ubicaciones para esta combinación,
  //    considerando periodos 0 y 99, y ejercicios base + actual.
  const totalResult = await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicioBase', sql.SmallInt, contexto.ejercicioBase)
    .input('ejercicioActual', sql.SmallInt, contexto.ejercicioActual)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidad', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      SELECT ISNULL(SUM(CAST(COALESCE(UnidadSaldo, 0) AS DECIMAL(18,4))), 0) AS TotalStock
      FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio IN (@ejercicioBase, @ejercicioActual)
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
        AND ISNULL(Partida, '') = @partida
        AND ISNULL(CodigoColor_, '') = @codigoColor
        AND ISNULL(CodigoTalla01_, '') = @codigoTalla
        AND Periodo IN (0, 99)
    `);

  const totalStock = Number(totalResult.recordset[0]?.TotalStock || 0);

  console.log(`[SINCRONIZAR] Total stock desde ubicaciones: ${totalStock} (ejercicios ${contexto.ejercicioBase}/${contexto.ejercicioActual})`);

  // 2. Eliminar el registro actual del periodo 99 en AcumuladoStock (solo para el ejercicio actual)
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidad', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      DELETE FROM AcumuladoStock
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio = @ejercicio
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
        AND ISNULL(Partida, '') = @partida
        AND ISNULL(CodigoColor_, '') = @codigoColor
        AND ISNULL(CodigoTalla01_, '') = @codigoTalla
        AND Periodo = 99
    `);

  // 3. Insertar nuevo registro en AcumuladoStock (periodo 99) solo si el stock total es distinto de cero
  if (Math.abs(totalStock) > 0.001) {
    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      // Nota: AcumuladoStock no tiene columna Ubicación, se usa un valor fijo o nulo
      .input('ubicacion', sql.VarChar, 'SIN-UBICACION')
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada)
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
      .input('unidadSaldo', sql.Decimal(18,4), totalStock)
      .input('unidadSaldoTipo', sql.Decimal(18,4), totalStock)
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
    console.log(`[SINCRONIZAR] Insertado registro en AcumuladoStock (periodo99) con stock ${totalStock}`);
  } else {
    console.log(`[SINCRONIZAR] Stock total es cero, no se inserta registro en AcumuladoStock`);
  }
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

// 🔥 FUNCIÓN CORREGIDA: Actualizar AcumuladoStockUbicacion (sin borrar ejercicios ajenos y usando ejercicio actual)
async function actualizarAcumuladoStockUbicacion(ajuste, codigoEmpresa, ejercicio, contexto, transaction) {
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

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

  // Obtener el Periodo0 total (de los ejercicios base y actual)
  const periodo0Result = await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicioBase', sql.SmallInt, contexto.ejercicioBase)
    .input('ejercicioActual', sql.SmallInt, contexto.ejercicioActual)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada || '')
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      SELECT SUM(CAST(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS DECIMAL(18,4))) AS StockPeriodo0
      FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio IN (@ejercicioBase, @ejercicioActual)
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND Ubicacion = @ubicacion
        AND (TipoUnidadMedida_ = @tipoUnidadMedida OR (TipoUnidadMedida_ IS NULL AND @tipoUnidadMedida = ''))
        AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
        AND Periodo = 0
    `);

  const stockPeriodo0 = Number(periodo0Result.recordset[0]?.StockPeriodo0 || 0);
  const nuevoPeriodo99 = parseFloat(nuevaCantidad) - stockPeriodo0;

  // Eliminar el registro actual del periodo 99 (solo ejercicio actual)
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)
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

  // Insertar el nuevo periodo99 (si es cero puedes omitirlo o mantenerlo según prefieras)
  if (Math.abs(nuevoPeriodo99) > 0.001) {
    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacionNormalizada)
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada || '')
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
      .input('unidadSaldo', sql.Decimal(18,4), nuevoPeriodo99)
      .input('unidadSaldoTipo', sql.Decimal(18,4), nuevoPeriodo99)
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

  console.log(`[AJUSTE] Periodo0 total = ${stockPeriodo0} | Total deseado = ${nuevaCantidad} | Nuevo Periodo99 = ${nuevoPeriodo99}`);
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

function debeBloquearAjusteSinStockVigente(diagnostico) {
  return (
    !diagnostico.existeUbicacionPeriodo99 &&
    (!diagnostico.existeAcumuladoPeriodo99 || diagnostico.saldoAcumuladoPeriodo99 === 0) &&
    diagnostico.hayHistoricoOtrosPeriodos
  );
}

async function obtenerDiagnosticoStockVigenteAjuste(codigoEmpresa, ejercicio, ajuste, contexto, transaction) {
  // 🛡️ Validar que transaction existe
  if (!transaction || typeof transaction !== 'object') {
    console.error('[ERROR] Transaction inválida en obtenerDiagnosticoStockVigenteAjuste', transaction);
    throw new Error('Se requiere una transacción activa para el diagnóstico');
  }

  const request = new sql.Request(transaction);
  request
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicioBase', sql.SmallInt, contexto.ejercicioBase)
    .input('ejercicioActual', sql.SmallInt, contexto.ejercicioActual)
    .input('codigoArticulo', sql.VarChar(50), ajuste.articulo)
    .input('codigoAlmacen', sql.VarChar(10), ajuste.codigoAlmacen)
    .input('ubicacion', sql.VarChar(50), ajuste.ubicacionStr)
    .input('tipoUnidad', sql.VarChar(20), ajuste.unidadStock || '')
    .input('partida', sql.VarChar(20), ajuste.partida || '')
    .input('codigoColor', sql.VarChar(20), ajuste.codigoColor || '')
    .input('codigoTalla', sql.VarChar(20), ajuste.codigoTalla01 || '');

  const result = await request.query(`
    SELECT
      (SELECT COUNT(*) FROM AcumuladoStockUbicacion s
       WHERE s.CodigoEmpresa = @codigoEmpresa
         AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
         AND s.CodigoArticulo = @codigoArticulo
         AND s.CodigoAlmacen = @codigoAlmacen
         AND s.Ubicacion = @ubicacion
         AND ISNULL(s.TipoUnidadMedida_, '') = @tipoUnidad
         AND ISNULL(s.Partida, '') = @partida
         AND ISNULL(s.CodigoColor_, '') = @codigoColor
         AND ISNULL(s.CodigoTalla01_, '') = @codigoTalla
         AND s.Periodo = 99) AS FilasUbicacionPeriodo99,
      (SELECT COUNT(*) FROM AcumuladoStock s
       WHERE s.CodigoEmpresa = @codigoEmpresa
         AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
         AND s.CodigoArticulo = @codigoArticulo
         AND s.CodigoAlmacen = @codigoAlmacen
         AND ISNULL(s.TipoUnidadMedida_, '') = @tipoUnidad
         AND ISNULL(s.Partida, '') = @partida
         AND ISNULL(s.CodigoColor_, '') = @codigoColor
         AND ISNULL(s.CodigoTalla01_, '') = @codigoTalla
         AND s.Periodo = 99) AS FilasAcumuladoPeriodo99,
      (SELECT COALESCE(SUM(ISNULL(s.UnidadSaldo, 0)), 0) FROM AcumuladoStock s
       WHERE s.CodigoEmpresa = @codigoEmpresa
         AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
         AND s.CodigoArticulo = @codigoArticulo
         AND s.CodigoAlmacen = @codigoAlmacen
         AND ISNULL(s.TipoUnidadMedida_, '') = @tipoUnidad
         AND ISNULL(s.Partida, '') = @partida
         AND ISNULL(s.CodigoColor_, '') = @codigoColor
         AND ISNULL(s.CodigoTalla01_, '') = @codigoTalla
         AND s.Periodo = 99) AS SaldoAcumuladoPeriodo99,
      (SELECT COUNT(*) FROM AcumuladoStockUbicacion s
       WHERE s.CodigoEmpresa = @codigoEmpresa
         AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
         AND s.CodigoArticulo = @codigoArticulo
         AND s.CodigoAlmacen = @codigoAlmacen
         AND s.Ubicacion = @ubicacion
         AND ISNULL(s.TipoUnidadMedida_, '') = @tipoUnidad
         AND ISNULL(s.Partida, '') = @partida
         AND ISNULL(s.CodigoColor_, '') = @codigoColor
         AND ISNULL(s.CodigoTalla01_, '') = @codigoTalla
         AND s.Periodo <> 99) AS HistoricoUbicacionOtrosPeriodos,
      (SELECT COUNT(*) FROM AcumuladoStock s
       WHERE s.CodigoEmpresa = @codigoEmpresa
         AND s.Ejercicio IN (@ejercicioBase, @ejercicioActual)
         AND s.CodigoArticulo = @codigoArticulo
         AND s.CodigoAlmacen = @codigoAlmacen
         AND ISNULL(s.TipoUnidadMedida_, '') = @tipoUnidad
         AND ISNULL(s.Partida, '') = @partida
         AND ISNULL(s.CodigoColor_, '') = @codigoColor
         AND ISNULL(s.CodigoTalla01_, '') = @codigoTalla
         AND s.Periodo <> 99) AS HistoricoAcumuladoOtrosPeriodos
  `);

  const row = result.recordset[0] || {};
  const historicoUbicacion = Number(row.HistoricoUbicacionOtrosPeriodos || 0);
  const historicoAcumulado = Number(row.HistoricoAcumuladoOtrosPeriodos || 0);

  return {
    existeUbicacionPeriodo99: Number(row.FilasUbicacionPeriodo99 || 0) > 0,
    existeAcumuladoPeriodo99: Number(row.FilasAcumuladoPeriodo99 || 0) > 0,
    saldoAcumuladoPeriodo99: Number(row.SaldoAcumuladoPeriodo99 || 0),
    hayHistoricoOtrosPeriodos: historicoUbicacion > 0 || historicoAcumulado > 0
  };
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

// Función para eliminar una combinación específica SOLO del ejercicio actual
async function eliminarCombinacionVigenteAcumuladoStockUbicacion(codigoEmpresa, ajuste, ejercicio, transaction) {
  const {
    articulo,
    codigoAlmacen,
    ubicacionStr,
    partida,
    unidadStock,
    codigoColor,
    codigoTalla01
  } = ajuste;

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)   // ← Recibido como parámetro
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('tipoUnidad', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      DELETE FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio = @ejercicio               -- ← Solo el ejercicio actual
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

/**
 * Función auxiliar para sanitizar strings antes de insertarlos en la BD.
 * Elimina caracteres problemáticos y trunca si es necesario.
 */
function sanitizeString(value, maxLength = 0) {
  if (value === null || value === undefined) return '';
  let str = String(value).trim();
  if (str === 'null' || str === 'undefined') return '';
  // Eliminar comillas, comas, punto y coma, saltos de línea, tabuladores
  str = str.replace(/[,;'"\n\r\t]/g, '').trim();
  if (maxLength > 0 && str.length > maxLength) {
    str = str.slice(0, maxLength);
  }
  return str;
}

/**
 * Registra un movimiento de inventario (tipo 5: ajuste) en la tabla MovimientoStock.
 * 
 * @param {Object} payload - Datos del movimiento.
 * @param {number} payload.codigoEmpresa - Código de empresa.
 * @param {number} payload.ejercicio - Ejercicio actual.
 * @param {string} payload.usuarioInventario - Usuario que realiza el ajuste.
 * @param {Object} payload.ajuste - Datos del ajuste (articulo, codigoAlmacen, ubicacionStr, unidadStock, partida, codigoColor, codigoTalla01).
 * @param {number} payload.unidades - Diferencia de stock aplicada.
 * @param {string} payload.comentario - Comentario del ajuste.
 * @param {Object} transaction - Transacción activa de SQL Server.
 */
async function registrarMovimientoInventario(payload, transaction) {
  const ahora = new Date();
  const periodo = ahora.getMonth() + 1;

  // Datos del ajuste con sanitización
  const codigoArticulo = sanitizeString(payload.ajuste.articulo, 20);
  const codigoAlmacen = sanitizeString(payload.ajuste.codigoAlmacen, 4);
  const ubicacion = sanitizeString(payload.ajuste.ubicacionStr, 15);
  const unidadMedida = sanitizeString(payload.ajuste.unidadStock || '', 10);
  const partida = sanitizeString(payload.ajuste.partida || '', 15);
  const codigoColor = sanitizeString(payload.ajuste.codigoColor || '', 10);
  const codigoTalla = sanitizeString(payload.ajuste.codigoTalla01 || '', 10);
  const codigoUsuario = sanitizeString(payload.usuarioInventario, 20);

  // Unidades (diferencia de stock)
  const unidades = typeof payload.unidades === 'number' ? payload.unidades : parseFloat(payload.unidades) || 0;

  // Comentario: asegurar que no supere los 40 caracteres (restricción típica de la columna)
  let comentarioBase = `${payload.comentario} por ${payload.usuarioInventario}`;
  comentarioBase = sanitizeString(comentarioBase, 0); // sin truncar aún
  const comentario = comentarioBase.length > 40 ? comentarioBase.slice(0, 37) + '...' : comentarioBase;

  console.log('[MOVIMIENTO INVENTARIO] Insertando registro:', {
    codigoEmpresa: payload.codigoEmpresa,
    ejercicio: payload.ejercicio,
    periodo,
    tipoMovimiento: 5,
    codigoArticulo,
    codigoAlmacen,
    ubicacion,
    unidades,
    comentario,
    usuario: codigoUsuario,
    unidadMedida,
    partida,
    codigoColor,
    codigoTalla
  });

  try {
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
      .input('unidades', sql.Decimal(18, 4), unidades)
      .input('comentario', sql.VarChar(40), comentario)
      .input('codigoCliente', sql.VarChar(20), codigoUsuario)
      .input('unidadMedida1', sql.VarChar(10), unidadMedida)
      .input('partida', sql.VarChar(15), partida)
      .input('codigoColor', sql.VarChar(10), codigoColor)
      .input('codigoTalla01', sql.VarChar(10), codigoTalla)
      .query(`
        INSERT INTO MovimientoStock (
          CodigoEmpresa, Ejercicio, Periodo, Fecha, FechaRegistro, TipoMovimiento,
          CodigoArticulo, CodigoAlmacen, Ubicacion,
          Unidades, Comentario, CodigoCliente, UnidadMedida1_, Partida,
          CodigoColor_, CodigoTalla01_
        ) VALUES (
          @codigoEmpresa, @ejercicio, @periodo, @fecha, @fechaRegistro, @tipoMovimiento,
          @codigoArticulo, @codigoAlmacen, @ubicacion,
          @unidades, @comentario, @codigoCliente, @unidadMedida1, @partida,
          @codigoColor, @codigoTalla01
        )
      `);

    console.log('[MOVIMIENTO INVENTARIO] Registro insertado correctamente');
  } catch (error) {
    console.error('[MOVIMIENTO INVENTARIO] Error al insertar:', error.message);
    throw new Error(`No se pudo registrar el movimiento de inventario: ${error.message}`);
  }
}

  return router;
};
