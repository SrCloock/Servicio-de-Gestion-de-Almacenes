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
  console.log('🔄 [SYNC AUTO] Iniciando sincronización automática...');
  
  try {
    // Verificar que getPool() esté conectado
    if (!getPool() || !getPool().connected) {
      console.log('⏳ [SYNC AUTO] Esperando conexión a BD...');
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
        console.log(`🏢 [SYNC AUTO] Sincronizando empresa: ${codigoEmpresa}`);
        
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
              -- Stock en ubicación (AcumuladoStockUbicacion)
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

        console.log(`📊 [SYNC AUTO] Empresa ${codigoEmpresa}: ${discrepancias.recordset.length} discrepancias encontradas`);

        // 2. CORREGIR CADA DISCREPANCIA
        for (const discrepancia of discrepancias.recordset) {
          try {
            await corregirDiscrepancia(discrepancia, codigoEmpresa, ejercicio);
            totalCorregidos++;
            
            // Pequeña pausa para no saturar la BD
            await new Promise(resolve => setTimeout(resolve, 10));
            
          } catch (error) {
            console.error(`❌ [SYNC AUTO] Error corrigiendo discrepancia:`, error.message);
            totalErrores++;
          }
        }

      } catch (error) {
        console.error(`❌ [SYNC AUTO] Error en empresa ${codigoEmpresa}:`, error.message);
        totalErrores++;
      }
    }

    console.log(`✅ [SYNC AUTO] Sincronización completada: ${totalCorregidos} correcciones, ${totalErrores} errores`);
    
  } catch (error) {
    console.error('❌ [SYNC AUTO] Error general en sincronización:', error);
  }
}

// ✅ FUNCIÓN PARA CORREGIR UNA DISCREPANCIA INDIVIDUAL
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

    console.log(`🔧 [SYNC AUTO] Corrigiendo: ${CodigoArticulo} | ${CodigoAlmacen} | ${Ubicacion} | ${StockUbicacion} → ${StockOficial} (Diferencia: ${Diferencia})`);

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
    console.log(`✅ [SYNC AUTO] Corregido: ${CodigoArticulo} | ${CodigoAlmacen} | ${Ubicacion}`);

  } catch (error) {
    if (transaction._aborted === false) {
      await transaction.rollback();
    }
    throw error;
  }
}

// ✅ CONFIGURACIÓN DEL CRON JOB (CADA 3 HORAS)

// Función para iniciar la sincronización después de la conexión a BD
function iniciarSincronizacionAutomatica() {
  console.log('🚀 [SYNC AUTO] Configurando sistema de sincronización automática...');
  
  // Sincronización INMEDIATA al arrancar (5 segundos después de la conexión)
  setTimeout(() => {
    console.log('⏰ [SYNC AUTO] Ejecutando sincronización INICIAL inmediata...');
    sincronizacionAutomatica();
  }, 5000);

  // Programar ejecución cada 3 horas (0 */3 * * *)
  cron.schedule('0 */3 * * *', () => {
    console.log('⏰ [SYNC AUTO] Ejecutando sincronización programada cada 3 horas...');
    sincronizacionAutomatica();
  });

  console.log('✅ [SYNC AUTO] Sistema configurado: Sincronización inicial en 5 segundos + cada 3 horas');
}

// ✅ ENDPOINT MANUAL PARA FORZAR SINCRONIZACIÓN
router.post('/inventario/sincronizacion-automatica', async (req, res) => {
  try {
    console.log('🔧 [SYNC MANUAL] Sincronización manual solicitada');
    
    // Ejecutar sincronización inmediata
    await sincronizacionAutomatica();
    
    res.json({
      success: true,
      mensaje: 'Sincronización automática ejecutada manualmente'
    });
    
  } catch (error) {
    console.error('[ERROR SYNC MANUAL]', error);
    res.status(500).json({
      success: false,
      mensaje: 'Error en sincronización manual',
      error: error.message
    });
  }
});

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
      mensaje: 'Error al buscar artículos.',
      error: err.message
    });
  }
});

// ✅ 9.3 OBTENER ARTÍCULOS POR UBICACIÓN (CORREGIDO)
router.get('/stock/por-ubicacion', async (req, res) => {
  const { codigoAlmacen, ubicacion, page = 1, pageSize = 100 } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !codigoAlmacen || !ubicacion) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa, almacén y ubicación requeridos.' 
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
      mensaje: 'Error al obtener artículos por ubicación',
      error: err.message 
    });
  }
});

// ✅ 9.4 OBTENER STOCK POR MÚLTIPLES ARTÍCULOS (CORREGIDO)
router.post('/ubicacionesMultiples', async (req, res) => {
  const { articulos } = req.body;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!articulos || !Array.isArray(articulos)) {
    return res.status(400).json({
      success: false,
      mensaje: 'Lista de artículos requerida en formato array.'
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

    // Añadir parámetros para cada artículo
    codigosArticulos.forEach((codigo, index) => {
      request.input(`articulo${index}`, sql.VarChar, codigo);
    });

    const result = await request.query(query);

    console.log(`[DEBUG UBICACIONES] Consulta ejecutada para ${codigosArticulos.length} artículos`);
    console.log(`[DEBUG UBICACIONES] Resultados encontrados:`, result.recordset.length);

    // Agrupar por artículo
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

    // Si no hay ubicaciones para algún artículo, agregar Zona descarga para todos los almacenes reales de la empresa
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
        console.log(`[DEBUG UBICACIONES] Artículo ${codigo} sin stock - agregando Zona descarga para todos los almacenes`);
        grouped[codigo] = almacenesResult.recordset.map(almacen => ({
          codigoAlmacen: almacen.CodigoAlmacen,
          nombreAlmacen: almacen.Almacen || almacen.CodigoAlmacen,
          ubicacion: "Zona descarga",
          descripcionUbicacion: "Stock disponible para expedición directa",
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
      mensaje: 'Error al obtener ubicaciones múltiples',
      error: err.message
    });
  }
});

// ✅ 9.7 OBTENER STOCK SIN UBICACIÓN (CORREGIDO)
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
      mensaje: 'Error al obtener stock sin ubicación',
      error: err.message 
    });
  }
});

// ✅ 9.7 OBTENER HISTÓRICO DE AJUSTES DE INVENTARIO (VERSIÓN MEJORADA - INCLUYE INVENTARIOS)
router.get('/inventario/historial-ajustes', async (req, res) => {
  // 1. Obtener empresa del usuario autenticado
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ 
      success: false, 
      mensaje: 'No autenticado' 
    });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  const añoActual = new Date().getFullYear();

  try {
    console.log(`📊 Obteniendo historial de ajustes para empresa: ${codigoEmpresa}, año: ${añoActual}`);
    
    // 2. Obtener fechas con ajustes - COMBINANDO MOVIMIENTOSTOCK E INVENTARIOS
    const fechasResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, añoActual)
      .query(`
        -- Fechas de MovimientoStock (ajustes)
        SELECT DISTINCT CONVERT(date, FechaRegistro) AS Fecha, 'MOVIMIENTO' AS Tipo
        FROM MovimientoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND TipoMovimiento = 5  -- 5: Ajuste
          AND Unidades IS NOT NULL
          AND Unidades != 0
        
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
    console.log(`📅 Fechas con ajustes encontradas: ${fechas.length}`);
    
    const historial = [];
    
    // 3. Para cada fecha, obtener los ajustes de ambas tablas
    for (const fecha of fechas) {
      const fechaStr = fecha.Fecha.toISOString().split('T')[0];
      
      console.log(`🔍 Obteniendo ajustes para fecha: ${fechaStr}`);
      
      // Obtener ajustes de MovimientoStock
      const movimientosResult = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, añoActual)
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
            AND m.Unidades IS NOT NULL
            AND m.Unidades != 0
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
      
      console.log(`📋 Ajustes encontrados para ${fechaStr}: ${todosLosAjustes.length} (Movimientos: ${movimientosResult.recordset.length}, Inventarios: ${inventariosResult.recordset.length})`);
      
      if (todosLosAjustes.length > 0) {
        historial.push({
          fecha: fechaStr,
          totalAjustes: todosLosAjustes.length,
          detalles: todosLosAjustes.map(detalle => ({
            CodigoArticulo: detalle.CodigoArticulo,
            DescripcionArticulo: detalle.DescripcionArticulo || 'Artículo no encontrado',
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
    
    console.log(`✅ Historial completo generado con ${historial.length} días de ajustes`);
    
    // Ordenar por fecha más reciente primero
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

// ✅ 9.8 OBTENER DETALLES POR MOV_POSICION_LINEA (VERSIÓN MEJORADA)
router.get('/stock/detalles', async (req, res) => {
  const { movPosicionLinea } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !movPosicionLinea) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan parámetros requeridos.' 
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

// ✅ 9.9 OBTENER FAMILIAS
router.get('/familias', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
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

// ✅ 9.10 OBTENER SUBFAMILIAS
router.get('/subfamilias', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
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

// ✅ 9.11 OBTENER ARTÍCULOS CON STOCK (CORREGIDO)
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
      mensaje: 'Error al obtener artículos con stock',
      error: err.message 
    });
  }
});

// ✅ 9.19 OBTENER UBICACIONES POR ALMACÉN (VERSIÓN CORREGIDA Y MEJORADA)
router.get('/ubicaciones/:codigoAlmacen', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { codigoAlmacen } = req.params;
  const { incluirSinUbicacion = 'false' } = req.query;

  if (!codigoEmpresa || !codigoAlmacen) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa y almacén requeridos.' 
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

    // Si se solicita incluir sin ubicación, agregar opción virtual
    if (incluirSinUbicacion === 'true') {
      query = `
        ${query}
        UNION ALL
        SELECT 
          'SIN-UBICACION' AS Ubicacion,
          'Stock sin ubicación asignada' AS DescripcionUbicacion,
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

// ✅ 9.20 OBTENER INFORMACIÓN DE ARTÍCULO (VERSIÓN CORREGIDA)
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
      return res.status(404).json({ error: 'Artículo no encontrado' });
    }
    
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('[ERROR ARTICULO]', err);
    res.status(500).json({ error: 'Error al obtener artículo' });
  }
});

// ✅ 9.21 BUSCAR UBICACIONES (NUEVO ENDPOINT)
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

// ✅ 9.22 OBTENER STOCK POR ARTÍCULO
router.get('/stock/por-articulo', async (req, res) => {
  const { codigoArticulo, incluirSinUbicacion } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !codigoArticulo) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa y artículo requeridos.' 
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

    // Consulta principal para stock con ubicación - INCLUYENDO NEGATIVOS Y CERO
    let query = `
      ${getCteInventarioActual()}
      SELECT 
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        -- 🔥 USAR UnidadSaldoTipo_ CUANDO HAY VARIANTES (color o talla)
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
        -- 🔥 CORRECCIÓN: QUITAR FILTRO QUE EXCLUYE NEGATIVOS Y CERO
    `;

    // Si se solicita incluir stock sin ubicación
    if (incluirSinUbicacion === 'true') {
      query = `
        ${query}
        UNION ALL
        -- Stock sin ubicación por almacén (sin variantes) - INCLUYENDO NEGATIVOS Y CERO
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
        -- 🔥 CORRECCIÓN: INCLUIR CERO Y NEGATIVOS EN STOCK SIN UBICACIÓN
        WHERE (s.StockTotal - ISNULL(u.StockUbicado, 0)) != 0
      `;
    }

    query += ' ORDER BY CodigoAlmacen, Ubicacion';

    const result = await request.query(query);
      
    console.log(`[DEBUG STOCK POR ARTICULO] Artículo: ${codigoArticulo}, Registros: ${result.recordset.length} (incluyendo negativos y cero)`);
    
    // Log para debugging de variantes (incluyendo negativos y cero)
    const registrosNegativos = result.recordset.filter(item => item.Cantidad < 0);
    const registrosCero = result.recordset.filter(item => item.Cantidad === 0);
    
    console.log(`🔍 Artículo ${codigoArticulo}: ${registrosNegativos.length} negativos, ${registrosCero.length} cero`);
    
    if (registrosNegativos.length > 0) {
      console.log('🔍 DEBUG Artículo con negativos encontrados:');
      registrosNegativos.forEach((item, index) => {
        console.log(`   ⚠️ NEGATIVO - ${index + 1}. Almacén: ${item.CodigoAlmacen}, Ubicación: ${item.Ubicacion}, ` +
                   `Talla: ${item.Talla}, Cantidad: ${item.Cantidad}`);
      });
    }
    
    if (registrosCero.length > 0) {
      console.log('🔍 DEBUG Artículo con ceros encontrados:');
      registrosCero.forEach((item, index) => {
        console.log(`   0️⃣ CERO - ${index + 1}. Almacén: ${item.CodigoAlmacen}, Ubicación: ${item.Ubicacion}, ` +
                   `Talla: ${item.Talla}, Cantidad: ${item.Cantidad}`);
      });
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

// ✅ 9.12 OBTENER STOCK POR VARIANTE (CORREGIDO)
router.get('/stock/por-variante', async (req, res) => {
  const { codigoArticulo, codigoColor, codigoTalla } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !codigoArticulo) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa y artículo requeridos.' 
    });
  }

  console.log('[STOCK POR VARIANTE DEBUG] Parámetros recibidos:', {
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

    // 🔥 CORRECCIÓN CRÍTICA: FILTRO DINÁMICO POR COLOR Y TALLA
    // Si se proporciona códigoColor, filtrar por ese color específico
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

    // 🔥 CORRECCIÓN CRÍTICA: FILTRO DINÁMICO POR TALLA
    // Si se proporciona códigoTalla, filtrar por esa talla específica
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
    
    // 🔥 DEBUG DETALLADO: Mostrar las primeras ubicaciones encontradas
    if (result.recordset.length > 0) {
      console.log('[STOCK POR VARIANTE DEBUG] Primeras ubicaciones encontradas:');
      result.recordset.slice(0, 3).forEach((ubic, idx) => {
        console.log(`  ${idx + 1}. ${ubic.CodigoAlmacen} - ${ubic.Ubicacion} - 
          Color: ${ubic.CodigoColor_ || 'N/A'} - 
          Talla: ${ubic.CodigoTalla01_ || 'N/A'} - 
          Stock: ${ubic.Cantidad}`);
      });
    } else {
      console.log('[STOCK POR VARIANTE DEBUG] No se encontraron ubicaciones para esta combinación');
      
      // 🔥 OPCIÓN ALTERNATIVA: Buscar sin filtros de color/talla si no hay resultados
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
      console.log(`[STOCK POR VARIANTE DEBUG] Búsqueda alternativa (sin filtros): ${resultAlternativo.recordset.length} resultados`);
      
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

// ✅ 9.14 OBTENER STOCK TOTAL COMPLETO
router.get('/inventario/stock-total-completo', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const codigoEmpresa = req.user.CodigoEmpresa;

  try {
    const contexto = await obtenerContextoBaseInventario(codigoEmpresa);
    console.log(
      `[INVENTARIO] Obteniendo stock completo para empresa ${codigoEmpresa}. Base: ${contexto.ejercicioBase}/${contexto.periodoBase}, overlay actual: ${contexto.ejercicioActual}`
    );

    const query = `
      ${getCteInventarioActual()}
      SELECT 
        -- Información básica del artículo
        COALESCE(a.CodigoArticulo, s.CodigoArticulo) AS CodigoArticulo,
        s.CodigoArticulo AS CodigoArticuloStock,
        COALESCE(a.DescripcionArticulo, s.CodigoArticulo) AS DescripcionArticulo,
        COALESCE(a.Descripcion2Articulo, '') AS Descripcion2Articulo,
        
        -- Información de almacén y ubicación
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        
        -- Información de stock y unidades
        s.TipoUnidadMedida_ AS UnidadStock,
        s.UnidadSaldoTipo_ AS CantidadBase,  -- 🔥 CORRECCIÓN: Usar UnidadSaldoTipo_ para cálculos
        s.UnidadSaldoTipo_ AS Cantidad,           -- Cantidad en la unidad específica
        s.Partida,
        s.Periodo,
        
        -- Información de variantes
        s.CodigoColor_,
        s.CodigoTalla01_,
        
        -- Información de conversión de unidades
        a.UnidadMedida2_ AS UnidadBase,
        a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
        COALESCE(a.FactorConversion_, 1) AS FactorConversion,
        
        -- Categorización
        a.CodigoFamilia,
        a.CodigoSubfamilia,
        
        -- Identificadores únicos
        s.Ejercicio,
        
        -- Campos para lógica de la aplicación
        CASE 
          WHEN s.Ubicacion = 'SIN-UBICACION' OR s.Ubicacion IS NULL THEN 1
          ELSE 0
        END AS EsSinUbicacion,
        
        -- Generar clave única para agrupación
        CONCAT(
          s.CodigoArticulo, '_', 
          s.CodigoAlmacen, '_', 
          s.Ubicacion, '_', 
          s.TipoUnidadMedida_, '_',
          ISNULL(s.Partida, ''), '_',
          ISNULL(s.CodigoColor_, ''), '_',
          ISNULL(s.CodigoTalla01_, '')
        ) AS ClaveUnica,

        -- Campo para detalles (puede ser NULL)
        NULL AS MovPosicionLinea

      FROM StockUbicacionActual s
      
      -- Joins para información adicional
      ${getArticuloApply('s')}
      
      LEFT JOIN Almacenes alm 
        ON alm.CodigoEmpresa = s.CodigoEmpresa 
        AND alm.CodigoAlmacen = s.CodigoAlmacen
      
      LEFT JOIN Ubicaciones u 
        ON u.CodigoEmpresa = s.CodigoEmpresa 
        AND u.CodigoAlmacen = s.CodigoAlmacen 
        AND u.Ubicacion = s.Ubicacion
      
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND (
          s.UnidadSaldoTipo_ != 0  -- Incluir solo registros con cantidad
          OR s.UnidadSaldo != 0    -- O con cantidad en unidad específica
        )
      
      ORDER BY 
        s.CodigoArticulo,
        s.CodigoAlmacen,
        s.Ubicacion,
        s.TipoUnidadMedida_
    `;

    const result = await agregarContextoInventario(
      getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa),
      contexto
    ).query(query);

    console.log(`[INVENTARIO] Stock completo obtenido: ${result.recordset.length} registros`);

    result.recordset.forEach((row) => {
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

    // Log de sample para debugging
    if (result.recordset.length > 0) {
      const sample = result.recordset.slice(0, 3);
      console.log('[INVENTARIO] Sample de registros:', sample.map(r => ({
        articulo: r.CodigoArticulo,
        almacen: r.CodigoAlmacen,
        ubicacion: r.Ubicacion,
        unidad: r.UnidadStock,
        cantidadBase: r.CantidadBase,
        cantidad: r.Cantidad
      })));
    }

    res.json(result.recordset);

  } catch (error) {
    console.error('[ERROR STOCK TOTAL COMPLETO]', error);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener el stock total completo',
      error: error.message 
    });
  }
});

// ✅ 9.15 AJUSTAR INVENTARIO (VERSIÓN MEJORADA - INSERCIÓN EN AMBAS TABLAS)
router.post('/inventario/ajustar-completo', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { ajustes } = req.body;
  const codigoEmpresa = req.user.CodigoEmpresa;
  const ejercicio = new Date().getFullYear();

  if (!ajustes || !Array.isArray(ajustes) || ajustes.length === 0) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Lista de ajustes vacía o inválida.' 
    });
  }

  const transaction = new sql.Transaction(getPool());
  
  try {
    await transaction.begin();

    console.log(`[AJUSTE MANUAL] Iniciando ${ajustes.length} ajustes para empresa ${codigoEmpresa}`);

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

      const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
      const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

      console.log(`[AJUSTE MANUAL] Procesando: ${articulo} | ${codigoAlmacen} | ${ubicacionNormalizada} | ${nuevaCantidad}`);

      // 🔥 NUEVA LÓGICA: Verificar si ya existe en AcumuladoStock
      const existeEnAcumuladoStock = await verificarExistenciaEnAcumuladoStock(
        codigoEmpresa, ejercicio, articulo, codigoAlmacen, 
        unidadStockNormalizada, partida, codigoColor, codigoTalla01, 
        transaction
      );

      console.log(`[AJUSTE MANUAL] ${articulo} | ¿Existe en AcumuladoStock?: ${existeEnAcumuladoStock}`);

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
    await transaction.rollback();
    console.error('[ERROR AJUSTAR INVENTARIO]', error);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al realizar los ajustes',
      error: error.message 
    });
  }
});

// 🔥 NUEVA FUNCIÓN: Verificar si existe en AcumuladoStock
async function verificarExistenciaEnAcumuladoStock(
  codigoEmpresa, ejercicio, articulo, codigoAlmacen, 
  unidadStock, partida, codigoColor, codigoTalla01, 
  transaction
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
      .query(`
        SELECT COUNT(*) as Existe
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
          AND Periodo = 99
      `);

    return result.recordset[0].Existe > 0;
  } catch (error) {
    console.error('[ERROR VERIFICANDO EXISTENCIA EN ACUMULADOSTOCK]', error);
    return false;
  }
}

// 🔥 NUEVA FUNCIÓN: Insertar en AcumuladoStock (para nuevos registros)
async function insertarAcumuladoStock(ajuste, codigoEmpresa, ejercicio, transaction) {
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
    .input('unidadSaldo', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
    .input('unidadSaldoTipo', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
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

  console.log(`[AJUSTE MANUAL] AcumuladoStock INSERTADO (nuevo): ${articulo} | ${ubicacionNormalizada} -> ${nuevaCantidad}`);
}

// 🔥 FUNCIÓN MODIFICADA: Actualizar AcumuladoStock (para registros existentes)
async function actualizarAcumuladoStock(ajuste, codigoEmpresa, ejercicio, transaction) {
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
        UnidadSaldo = @nuevaCantidad,
        Ubicacion = @ubicacion
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
        AND Periodo = 99
    `);

  console.log(`[AJUSTE MANUAL] AcumuladoStock ACTUALIZADO (existente): ${articulo} | ${ubicacionNormalizada} -> ${nuevaCantidad}`);
}

// 🔥 FUNCIÓN MODIFICADA: Actualizar AcumuladoStockUbicacion
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

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

  // 1. ELIMINAR registro existente en AcumuladoStockUbicacion
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada)
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

  // 2. INSERTAR nuevo registro solo si la cantidad no es cero
  if (parseFloat(nuevaCantidad) !== 0) {
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
      .input('unidadSaldo', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
      .input('unidadSaldoTipo', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
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

  console.log(`[AJUSTE MANUAL] AcumuladoStockUbicacion actualizado: ${articulo} | ${ubicacionNormalizada} -> ${nuevaCantidad}`);
}

// 🔥 NUEVA FUNCIÓN: Verificar si es ubicación principal en AcumuladoStock
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
    console.error('[ERROR VERIFICANDO UBICACIÓN PRINCIPAL]', error);
    return false;
  }
}

// 🔥 NUEVA FUNCIÓN: Actualizar solo AcumuladoStockUbicacion
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

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' ? '' : unidadStock);

  // 1. ELIMINAR registro existente en AcumuladoStockUbicacion
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('tipoUnidadMedida', sql.VarChar, unidadStockNormalizada)
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

  // 2. INSERTAR nuevo registro solo si la cantidad no es cero
  if (parseFloat(nuevaCantidad) !== 0) {
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
      .input('unidadSaldo', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
      .input('unidadSaldoTipo', sql.Decimal(18, 4), parseFloat(nuevaCantidad))
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

  console.log(`[AJUSTE MANUAL] AcumuladoStockUbicacion actualizado: ${articulo} | ${ubicacionNormalizada} -> ${nuevaCantidad}`);
}

// 🔥 NUEVA FUNCIÓN: Actualizar AcumuladoStock (solo para ubicación principal)
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

  const ubicacionNormalizada = ubicacionStr === 'SIN UBICACIÓN' ? 'SIN-UBICACION' : ubicacionStr;
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

// ✅ 10.6 OBTENER UBICACIONES POR ALMACÉN (CORRECCIÓN)
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
      mensaje: 'Error al obtener ubicaciones por almacén.',
      error: err.message 
    });
  }
});

// ============================================
// ✅ PEDIDOS DE COMPRA Y RECEPCIÓN (PAGINADO)
// ============================================

// ✅ FUNCIÓN AUXILIAR PARA MANEJO SEGURO DE STRINGS (SIN .substring problemático)
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
    
    // Si queda vacío o es 'null'/'undefined', devolver valor por defecto
    if (str === '' || str === 'null' || str === 'undefined') {
      return defaultValue;
    }
    
    // Limpiar comas
    str = str.replace(/[,]/g, '').trim();
    
    // Truncar si excede la longitud máxima (sin usar .substring si no es string)
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

  return router;
};
