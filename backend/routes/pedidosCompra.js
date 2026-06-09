const express = require('express');

module.exports = function createpedidosCompraRouter({ sql, getPool }) {
  const router = express.Router();
  const ALMACEN_RECEPCION_TEMPORAL = 'R';
  const UBICACION_RECEPCION_TEMPORAL = 'R1';

// =====================================================
// FUNCIONES AUXILIARES DE INVENTARIO (copia local)
// =====================================================

function safeString(value, maxLength = 10, defaultValue = '') {
  try {
    if (value === null || value === undefined) return defaultValue;
    let str;
    if (typeof value === 'string') str = value;
    else if (typeof value === 'number' || typeof value === 'boolean') str = String(value);
    else if (typeof value === 'object') str = value.toString ? value.toString() : JSON.stringify(value);
    else str = String(value);
    str = str.trim();
    if (str === '' || str === 'null' || str === 'undefined') return defaultValue;
    str = str.replace(/[,]/g, '').trim();
    if (maxLength > 0 && str.length > maxLength) return str.slice(0, maxLength);
    return str;
  } catch (error) {
    console.warn(`[safeString] Error: ${error.message}`);
    return defaultValue;
  }
}

function safeDecimal(value, defaultValue = 0) {
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

// Helper: genera el UNPIVOT de GrupoTallas_ para 26 columnas de talla
function buildTallasUnpivotQuery() {
  const unions = Array.from({ length: 26 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return i === 0
      ? `SELECT CodigoTalla${n}_ as CodigoTalla_, DescripcionTalla${n}_ as DescripcionTalla_, ${i + 1} as Orden_
          FROM GrupoTallas_ WHERE GrupoTalla_ = @grupoTalla AND CodigoEmpresa = @codigoEmpresa`
      : `SELECT CodigoTalla${n}_, DescripcionTalla${n}_, ${i + 1}
          FROM GrupoTallas_ WHERE GrupoTalla_ = @grupoTalla AND CodigoEmpresa = @codigoEmpresa`;
  }).join('\n          UNION ALL\n          ');
  return `
    SELECT CodigoTalla_, DescripcionTalla_, Orden_
    FROM (
      ${unions}
    ) AS tallas
    WHERE CodigoTalla_ IS NOT NULL AND CodigoTalla_ != ''
    ORDER BY Orden_
  `;
}

async function obtenerContextoBaseInventario(codigoEmpresa, transaction = null) {
  const ejercicioActual = new Date().getFullYear();
  const pool = transaction ? transaction._pool : getPool();
  const request = transaction ? new sql.Request(transaction) : pool.request();
  const result = await request
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .query(`
      WITH Contextos AS (
        SELECT
          Ejercicio,
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
  const contexto = result.recordset[0];
  return {
    ejercicioBase: contexto?.Ejercicio || ejercicioActual,
    periodoBase: 99,
    ejercicioActual
  };
}

// BUG 1 CORREGIDO: StockPeriodo0 ahora solo consulta ejercicioActual en Periodo=0
// para evitar doble conteo de aperturas de ejercicios anteriores.
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

  const ubicacionNormalizada = (ubicacionStr === 'SIN UBICACIÓN' || !ubicacionStr) ? '' : ubicacionStr;
  const unidadStockNormalizada = (unidadStock === 'unidades' || !unidadStock) ? '' : unidadStock;

  // BUG 1 FIX: solo ejercicioActual para Periodo=0 (apertura del ejercicio corriente)
  const periodo0Result = await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicioActual', sql.SmallInt, contexto.ejercicioActual)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('tipoUnidad', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      SELECT SUM(CAST(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS DECIMAL(18,4))) AS StockPeriodo0
      FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio = @ejercicioActual
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND Ubicacion = @ubicacion
        AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
        AND ISNULL(Partida, '') = @partida
        AND ISNULL(CodigoColor_, '') = @codigoColor
        AND ISNULL(CodigoTalla01_, '') = @codigoTalla
        AND Periodo = 0
    `);

  const stockPeriodo0 = safeDecimal(periodo0Result.recordset[0]?.StockPeriodo0, 0);
  const nuevoPeriodo99 = safeDecimal(nuevaCantidad, 0) - stockPeriodo0;

  // Eliminar el registro actual del periodo 99 (solo ejercicio actual)
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

  // Insertar nuevo periodo99
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('ubicacion', sql.VarChar, ubicacionNormalizada)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidad', sql.VarChar, unidadStockNormalizada)
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
        @codigoArticulo, @tipoUnidad, @partida, @codigoColor, @codigoTalla,
        @unidadSaldo, @unidadSaldoTipo, 99
      )
    `);
}

// BUG 10 CORREGIDO: el DELETE de AcumuladoStock ahora filtra por ejercicioActual
// para no borrar histórico de ejercicios anteriores.
async function sincronizarAcumuladoStockDesdeUbicaciones(ajuste, codigoEmpresa, ejercicio, contexto, transaction) {
  const {
    articulo,
    codigoAlmacen,
    partida,
    unidadStock,
    codigoColor,
    codigoTalla01
  } = ajuste;

  const unidadStockNormalizada = (unidadStock === 'unidades' || !unidadStock) ? '' : unidadStock;

  // Sumar stock total de TODAS las ubicaciones periodo 99
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
      SELECT SUM(CAST(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS DECIMAL(18,4))) AS TotalStock
      FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio IN (@ejercicioBase, @ejercicioActual)
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
        AND ISNULL(Partida, '') = @partida
        AND ISNULL(CodigoColor_, '') = @codigoColor
        AND ISNULL(CodigoTalla01_, '') = @codigoTalla
        AND Periodo = 99
    `);

  const totalStock = safeDecimal(totalResult.recordset[0]?.TotalStock, 0);

  const ubicacionPrincipal = codigoAlmacen === ALMACEN_RECEPCION_TEMPORAL
    ? UBICACION_RECEPCION_TEMPORAL
    : '';

  // BUG 10 FIX: DELETE solo para ejercicioActual, preserva histórico de otros ejercicios
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicioActual', sql.SmallInt, contexto.ejercicioActual)
    .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
    .input('codigoArticulo', sql.VarChar, articulo)
    .input('tipoUnidad', sql.VarChar, unidadStockNormalizada)
    .input('partida', sql.VarChar, partida || '')
    .input('codigoColor', sql.VarChar, codigoColor || '')
    .input('codigoTalla', sql.VarChar, codigoTalla01 || '')
    .query(`
      DELETE FROM AcumuladoStock
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio = @ejercicioActual
        AND CodigoAlmacen = @codigoAlmacen
        AND CodigoArticulo = @codigoArticulo
        AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
        AND ISNULL(Partida, '') = @partida
        AND ISNULL(CodigoColor_, '') = @codigoColor
        AND ISNULL(CodigoTalla01_, '') = @codigoTalla
        AND Periodo = 99
    `);

  if (Math.abs(totalStock) > 0.001) {
    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('ubicacion', sql.VarChar, ubicacionPrincipal)
      .input('codigoArticulo', sql.VarChar, articulo)
      .input('tipoUnidad', sql.VarChar, unidadStockNormalizada)
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
          @codigoArticulo, @tipoUnidad, @partida, @codigoColor, @codigoTalla,
          @unidadSaldo, @unidadSaldoTipo, 99
        )
      `);
  }
}

// Fin de código copiado

// BUG 2 CORREGIDO: numeración de albaranes usa lsysContadores con UPDLOCK atómico
// como fuente única de verdad, eliminando la race condition del MAX().
async function obtenerSiguienteNumeroAlbaranProveedor(transaction, codigoEmpresa) {
  const ejercicioAlbaran = new Date().getFullYear();
  const nombreContador = 'ALBARAN_PRO';

  // Intentar UPDATE atómico con UPDLOCK
  const updateResult = await new sql.Request(transaction)
    .input('ejercicio', sql.Int, ejercicioAlbaran)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('nombreContador', sql.VarChar(50), nombreContador)
    .query(`
      UPDATE lsysContadores WITH (UPDLOCK)
      SET sysContadorValor = sysContadorValor + 1
      OUTPUT deleted.sysContadorValor AS numeroAsignado
      WHERE sysEjercicio = @ejercicio
        AND sysNombreContador = @nombreContador
        AND sysGrupo = @codigoEmpresa
    `);

  let numeroAlbaran;

  if (updateResult.recordset.length > 0) {
    // El contador existía; el número asignado es el valor ANTES de incrementar
    numeroAlbaran = parseInt(updateResult.recordset[0].numeroAsignado, 10);
  } else {
    // El contador no existía: obtener el MAX real y arrancar desde ahí
    const maxResult = await new sql.Request(transaction)
      .input('ejercicio', sql.SmallInt, ejercicioAlbaran)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT ISNULL(MAX(NumeroAlbaran), 0) AS maxNumero
        FROM CabeceraAlbaranProveedor WITH (UPDLOCK, HOLDLOCK)
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
      `);
    numeroAlbaran = (parseInt(maxResult.recordset[0]?.maxNumero, 10) || 0) + 1;

    await new sql.Request(transaction)
      .input('ejercicio', sql.Int, ejercicioAlbaran)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('nombreContador', sql.VarChar(50), nombreContador)
      .input('nuevoValor', sql.Int, numeroAlbaran + 1)
      .query(`
        INSERT INTO lsysContadores (sysGrupo, sysEjercicio, sysNombreContador, sysContadorValor)
        VALUES (@codigoEmpresa, @ejercicio, @nombreContador, @nuevoValor)
      `);
  }

  return { ejercicioAlbaran, numeroAlbaran };
}

// ✅ 1. LISTAR PEDIDOS DE COMPRA (PAGINADO)
router.get('/pedidos-compra', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 15;
  const offset = (page - 1) * limit;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    console.log(`[DEBUG] Cargando pedidos - Página: ${page}, Límite: ${limit}`);
    
    const countResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT COUNT(DISTINCT cp.NumeroPedido) as total
        FROM CabeceraPedidoProveedor cp
        WHERE cp.CodigoEmpresa = @codigoEmpresa
          AND cp.Estado = 0
      `);
    
    const totalPedidos = countResult.recordset[0].total;
    const totalPages = Math.ceil(totalPedidos / limit);

    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT 
          cp.EjercicioPedido,
          cp.SeriePedido,
          cp.NumeroPedido,
          cp.FechaPedido,
          cp.CodigoProveedor,
          cp.RazonSocial AS NombreProveedor,
          cp.NumeroLineas,
          cp.ImporteLiquido,
          cp.Estado,
          cp.ObservacionesPedido AS Observaciones,
          COUNT(DISTINCT lp.Orden) AS TotalLineas,
          SUM(lp.UnidadesPedidas) AS TotalUnidadesPedidas,
          SUM(lp.UnidadesRecibidas) AS TotalUnidadesRecibidas,
          SUM(lp.UnidadesPendientes) AS TotalUnidadesPendientes,
          CASE 
            WHEN SUM(lp.UnidadesPendientes) = 0 THEN 1
            ELSE 0
          END AS CompletamenteRecepcionado
        FROM CabeceraPedidoProveedor cp
        LEFT JOIN LineasPedidoProveedor lp 
          ON lp.CodigoEmpresa = cp.CodigoEmpresa
          AND lp.EjercicioPedido = cp.EjercicioPedido
          AND lp.SeriePedido = cp.SeriePedido
          AND lp.NumeroPedido = cp.NumeroPedido
        WHERE cp.CodigoEmpresa = @codigoEmpresa
          AND cp.Estado = 0
        GROUP BY 
          cp.EjercicioPedido,
          cp.SeriePedido,
          cp.NumeroPedido,
          cp.FechaPedido,
          cp.CodigoProveedor,
          cp.RazonSocial,
          cp.NumeroLineas,
          cp.ImporteLiquido,
          cp.Estado,
          cp.ObservacionesPedido
        ORDER BY cp.FechaPedido DESC, cp.NumeroPedido DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);
      
    console.log(`[DEBUG] Pedidos encontrados: ${result.recordset.length} (Página ${page}/${totalPages})`);
    
    res.json({
      success: true,
      pedidos: result.recordset,
      pagination: {
        page,
        limit,
        total: totalPedidos,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (err) {
    console.error('[ERROR PEDIDOS COMPRA]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener pedidos de compra.',
      error: err.message 
    });
  }
});


// ✅ 2. DETALLE COMPLETO DE PEDIDO CON VARIANTES
router.get('/pedidos-compra/:ejercicio/:serie/:numero/detalle', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { ejercicio, serie, numero } = req.params;

  if (!codigoEmpresa || !ejercicio || !numero) {
    return res.status(400).json({
      success: false,
      mensaje: 'Parámetros requeridos: código de empresa, ejercicio y número de pedido.'
    });
  }

  try {
    console.log(`[DETALLE PEDIDO] Obteniendo detalle completo: ${ejercicio}/${serie || '0'}/${numero}`);
    
    const serieParam = (serie === 'undefined' || serie === 'null' || !serie) ? '0' : serie;

    const cabeceraResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(`
        SELECT 
          cp.*,
          p.CifDni,
          p.Domicilio,
          p.CodigoPostal,
          p.Municipio,
          p.Provincia,
          p.Telefono
        FROM CabeceraPedidoProveedor cp
        LEFT JOIN Proveedores p 
          ON p.CodigoProveedor = cp.CodigoProveedor
          AND p.CodigoEmpresa = cp.CodigoEmpresa
        WHERE cp.CodigoEmpresa = @codigoEmpresa
          AND cp.EjercicioPedido = @ejercicio
          AND cp.NumeroPedido = @numero
          AND (cp.SeriePedido = @serie OR (@serie = '0' AND (cp.SeriePedido IS NULL OR cp.SeriePedido = '' OR cp.SeriePedido = '0')))
      `);

    if (cabeceraResult.recordset.length === 0) {
      return res.status(404).json({ success: false, mensaje: 'Pedido no encontrado.' });
    }
    const cabecera = cabeceraResult.recordset[0];

    const lineasResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(`
        SELECT 
          lp.*,
          a.DescripcionArticulo,
          a.Descripcion2Articulo,
          a.UnidadMedida2_,
          a.UnidadMedidaAlternativa_,
          a.FactorConversion_,
          a.Colores_,
          a.GrupoTalla_,
          CASE 
            WHEN lp.UnidadesPedidas > 0 
            THEN (lp.UnidadesRecibidas / lp.UnidadesPedidas) * 100
            ELSE 0
          END AS PorcentajeRecepcionado,
          CASE 
            WHEN lp.Estado = 2 THEN 'COMPLETADO'
            WHEN lp.UnidadesPendientes = 0 THEN 'COMPLETADO'
            WHEN lp.UnidadesRecibidas > 0 THEN 'PARCIAL'
            ELSE 'PENDIENTE'
          END AS EstadoLinea
        FROM LineasPedidoProveedor lp
        LEFT JOIN Articulos a 
          ON a.CodigoArticulo = lp.CodigoArticulo
          AND a.CodigoEmpresa = lp.CodigoEmpresa
        WHERE lp.CodigoEmpresa = @codigoEmpresa
          AND lp.EjercicioPedido = @ejercicio
          AND lp.NumeroPedido = @numero
          AND (lp.SeriePedido = @serie OR (@serie = '0' AND (lp.SeriePedido IS NULL OR lp.SeriePedido = '' OR lp.SeriePedido = '0')))
        ORDER BY lp.Orden
      `);

    const lineasConVariantes = [];

    for (const linea of lineasResult.recordset) {
      const lineaConVariantes = { ...linea, variantes: [] };

      if (linea.Colores_ === -1 || (linea.GrupoTalla_ && linea.GrupoTalla_ !== '')) {
        const variantesResult = await getPool().request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.SmallInt, ejercicio)
          .input('numero', sql.Int, numero)
          .input('movPosicionLinea', sql.VarChar, linea.LineasPosicion)
          .query(`
            SELECT 
              lpt.*,
              c.Color_ AS NombreColor,
              gt.DescripcionGrupoTalla_
            FROM LineasPedidoProveedorTallas lpt
            LEFT JOIN Colores_ c 
              ON c.CodigoColor_ = lpt.CodigoColor_
              AND c.CodigoEmpresa = lpt.CodigoEmpresa
            LEFT JOIN GrupoTallas_ gt 
              ON gt.GrupoTalla_ = lpt.GrupoTalla_
              AND gt.CodigoEmpresa = lpt.CodigoEmpresa
            WHERE lpt.CodigoEmpresa = @codigoEmpresa
              AND lpt.EjercicioPedido = @ejercicio
              AND lpt.NumeroPedido = @numero
              AND lpt.MovPosicionLinea_ = @movPosicionLinea
          `);

        for (const variante of variantesResult.recordset) {
          const varianteData = {
            codigoColor: variante.CodigoColor_,
            nombreColor: variante.NombreColor,
            grupoTalla: variante.GrupoTalla_ || '',
            descripcionGrupoTalla: variante.DescripcionGrupoTalla_ || '',
            unidadesTotal: variante.UnidadesTotalTallas_ || 0,
            unidadesPorTalla: {}
          };

          if (variante.GrupoTalla_ && variante.GrupoTalla_.toString().trim() !== '') {
            try {
              const tallasResult = await getPool().request()
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('grupoTalla', sql.VarChar, variante.GrupoTalla_.toString())
                .query(buildTallasUnpivotQuery());

              const unidadesTalla = {};
              for (let i = 1; i <= 26; i++) {
                const n = String(i).padStart(2, '0');
                unidadesTalla[n] = variante[`UnidadesTalla${n}_`] || 0;
              }

              tallasResult.recordset.forEach((talla, idx) => {
                const numTalla = (idx + 1).toString().padStart(2, '0');
                varianteData.unidadesPorTalla[talla.CodigoTalla_] = {
                  codigo: talla.CodigoTalla_,
                  nombre: talla.DescripcionTalla_,
                  unidades: unidadesTalla[numTalla] || 0,
                  orden: talla.Orden_
                };
              });
            } catch (error) {
              console.warn(`[ADVERTENCIA] Error cargando tallas para grupo ${variante.GrupoTalla_}:`, error.message);
            }
          }

          lineaConVariantes.variantes.push(varianteData);
        }
      }

      lineaConVariantes.tipoVariante = 'NORMAL';
      if (linea.Colores_ === -1 && linea.GrupoTalla_ && linea.GrupoTalla_ !== '') {
        lineaConVariantes.tipoVariante = 'COLORES_TALLAS';
      } else if (linea.Colores_ === -1) {
        lineaConVariantes.tipoVariante = 'COLORES';
      } else if (linea.GrupoTalla_ && linea.GrupoTalla_ !== '') {
        lineaConVariantes.tipoVariante = 'TALLAS';
      }

      lineasConVariantes.push(lineaConVariantes);
    }

    res.json({
      success: true,
      cabecera: cabecera,
      lineas: lineasConVariantes,
      totalLineas: lineasConVariantes.length
    });

  } catch (err) {
    console.error('[ERROR DETALLE PEDIDO COMPLETO]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al obtener detalle completo del pedido.',
      error: err.message
    });
  }
});

// ✅ VARIANTES DISPONIBLES PARA ARTÍCULO
router.get(['/articulos/variantes', '/articulos/:codigoArticulo/variantes'], async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const codigoArticulo = req.params.codigoArticulo || req.query.codigoArticulo;

  if (!codigoEmpresa || !codigoArticulo) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa y artículo requeridos.' 
    });
  }

  try {
    const articuloResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT 
          CodigoArticulo,
          DescripcionArticulo,
          Colores_,
          GrupoTalla_,
          UnidadMedida2_,
          UnidadMedidaAlternativa_,
          FactorConversion_
        FROM Articulos
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoArticulo = @codigoArticulo
      `);

    if (articuloResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Artículo no encontrado.' 
      });
    }

    const articulo = articuloResult.recordset[0];
    const resultado = {
      articulo: articulo,
      colores: [],
      tallas: [],
      combinaciones: []
    };

    if (articulo.Colores_ === -1) {
      const coloresResult = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          SELECT 
            CodigoColor_ as codigo,
            Color_ as nombre
          FROM Colores_
          WHERE CodigoEmpresa = @codigoEmpresa
            AND Activo_ = 1
          ORDER BY Color_
        `);
      resultado.colores = coloresResult.recordset;
    }

    if (articulo.GrupoTalla_ && articulo.GrupoTalla_ !== '') {
      const tallasResult = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('grupoTalla', sql.VarChar, articulo.GrupoTalla_.toString())
        .query(buildTallasUnpivotQuery());
      
      resultado.tallas = tallasResult.recordset.map(t => ({
        codigo: t.CodigoTalla_,
        nombre: t.DescripcionTalla_,
        grupo: articulo.GrupoTalla_,
        orden: t.Orden_
      }));
      
      if (articulo.Colores_ === -1) {
        for (const color of resultado.colores) {
          for (const talla of resultado.tallas) {
            resultado.combinaciones.push({
              codigoColor: color.codigo,
              nombreColor: color.nombre,
              codigoTalla: talla.codigo,
              nombreTalla: talla.nombre,
              grupoTalla: talla.grupo
            });
          }
        }
      } else {
        resultado.combinaciones = resultado.tallas.map(talla => ({
          codigoColor: '',
          nombreColor: '',
          codigoTalla: talla.codigo,
          nombreTalla: talla.nombre,
          grupoTalla: talla.grupo
        }));
      }
    } else if (articulo.Colores_ === -1) {
      resultado.combinaciones = resultado.colores.map(color => ({
        codigoColor: color.codigo,
        nombreColor: color.nombre,
        codigoTalla: '',
        nombreTalla: '',
        grupoTalla: ''
      }));
    }

    res.json({
      success: true,
      ...resultado
    });
  } catch (err) {
    console.error('[ERROR VARIANTES ARTICULO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener variantes del artículo.',
      error: err.message 
    });
  }
});

router.get('/pedidos-compra/almacenes', async (req, res) => {
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
        SELECT CodigoAlmacen, Almacen
        FROM Almacenes
        WHERE CodigoEmpresa = @codigoEmpresa
        ORDER BY
          CASE WHEN CodigoAlmacen = '000' THEN 0 ELSE 1 END,
          CodigoAlmacen
      `);

    res.json({
      success: true,
      almacenes: result.recordset
    });
  } catch (err) {
    console.error('[ERROR ALMACENES PEDIDOS COMPRA]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al obtener almacenes para recepción de pedidos de compra.',
      error: err.message
    });
  }
});

// ✅ 5. PROCESAR RECEPCIÓN DE PEDIDO
router.post('/pedidos-compra/:ejercicio/:serie/:numero/recepcionar', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const codigoCliente = req.user.CodigoCliente || req.user.UsuarioLogicNet || 'SISTEMA';
  const { ejercicio, serie, numero } = req.params;
  const { lineasRecepcion, comentarioRecepcion, almacen: almacenReq, ubicacion: ubicacionReq } = req.body;

  const ALMACEN_RECEPCION_DEFAULT = 'R';
  const UBICACION_RECEPCION_DEFAULT = 'R1';

  const almacen = almacenReq || ALMACEN_RECEPCION_DEFAULT;
  const ubicacion = ubicacionReq || UBICACION_RECEPCION_DEFAULT;

  console.log('================== INICIO RECEPCIÓN ==================');
  console.log(`[RECEPCION] Empresa: ${codigoEmpresa}, Pedido: ${ejercicio}/${serie}/${numero}`);
  console.log(`[RECEPCION] Almacén: ${almacen}, Ubicación: ${ubicacion}`);
  console.log(`[RECEPCION] líneas a procesar: ${lineasRecepcion?.length || 0}`);

  if (!codigoEmpresa || !ejercicio || !numero) {
    return res.status(400).json({ success: false, mensaje: 'Parámetros del pedido requeridos.' });
  }
  if (!lineasRecepcion || !Array.isArray(lineasRecepcion) || lineasRecepcion.length === 0) {
    return res.status(400).json({ success: false, mensaje: 'Debe especificar al menos una línea.' });
  }

  const transaction = new sql.Transaction(getPool());
  try {
    await transaction.begin();

    const serieParam = (serie === 'undefined' || serie === 'null' || !serie) ? '0' : serie;

    // 1. Verificar pedido existe y está pendiente
    const pedidoResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(`
        SELECT Estado, CodigoProveedor, RazonSocial
        FROM CabeceraPedidoProveedor
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numero
          AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
      `);
    if (pedidoResult.recordset.length === 0) throw new Error('Pedido no encontrado.');
    const pedido = pedidoResult.recordset[0];
    if (pedido.Estado !== 0) throw new Error('El pedido no está en estado pendiente.');

    const contexto = await obtenerContextoBaseInventario(codigoEmpresa, transaction);
    console.log(`[RECEPCION] Contexto inventario: ejercicioBase=${contexto.ejercicioBase}, ejercicioActual=${contexto.ejercicioActual}`);

    const resultadosRecepcion = [];

    // 2. Procesar cada línea
    for (const [idx, recepcion] of lineasRecepcion.entries()) {
      const orden = recepcion.Orden !== undefined ? recepcion.Orden : (recepcion.orden !== undefined ? recepcion.orden : 0);
      const codigoArticulo = recepcion.codigoArticulo || recepcion.CodigoArticulo;
      const unidadesRecepcionar = parseFloat(recepcion.unidadesRecepcionar) || 0;
      const variantes = recepcion.variantes || [];

      if (!codigoArticulo) throw new Error(`Falta código de artículo en línea ${idx+1}`);
      if (unidadesRecepcionar <= 0) throw new Error(`Unidades inválidas en línea ${idx+1}`);

      // BUG 4 FIX: recalcular UnidadesPendientes en la query en lugar de confiar en el campo almacenado
      let query = `
        SELECT lp.*,
          a.DescripcionArticulo, a.Colores_, a.GrupoTalla_, a.UnidadMedida2_,
          a.UnidadMedidaAlternativa_, a.FactorConversion_, a.PrecioCompra,
          (lp.UnidadesPedidas - lp.UnidadesRecibidas) AS UnidadesPendientesReal
        FROM LineasPedidoProveedor lp
        LEFT JOIN Articulos a ON a.CodigoArticulo = lp.CodigoArticulo AND a.CodigoEmpresa = lp.CodigoEmpresa
        WHERE lp.CodigoEmpresa = @codigoEmpresa
          AND lp.EjercicioPedido = @ejercicio
          AND lp.NumeroPedido = @numero
          AND (lp.SeriePedido = @serie OR (@serie = '0' AND (lp.SeriePedido IS NULL OR lp.SeriePedido = '' OR lp.SeriePedido = '0')))
          AND lp.CodigoArticulo = @codigoArticulo
      `;
      if (orden > 0) query += ` AND lp.Orden = @orden`;
      query += ` ORDER BY lp.Orden`;

      const request = new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('numero', sql.Int, numero)
        .input('serie', sql.VarChar, serieParam)
        .input('codigoArticulo', sql.VarChar, codigoArticulo);
      if (orden > 0) request.input('orden', sql.Int, orden);
      const lineaResult = await request.query(query);
      if (lineaResult.recordset.length === 0) throw new Error(`Artículo ${codigoArticulo} no encontrado en el pedido`);
      const linea = lineaResult.recordset[0];
      const lineaOrden = linea.Orden;

      // BUG 4 FIX: usar UnidadesPendientesReal recalculado
      const unidadesPendientes = Math.max(0, safeDecimal(linea.UnidadesPendientesReal, 0));

      if (unidadesRecepcionar > unidadesPendientes) {
        throw new Error(`No se pueden recepcionar ${unidadesRecepcionar} unidades. Pendientes reales: ${unidadesPendientes}`);
      }

      const precio = parseFloat(linea.Precio) || 0;
      const factorConversion = parseFloat(linea.FactorConversion_) || 1;
      const unidadMedida2 = safeString(linea.UnidadMedida2_, 10, '');

      // ---- PREPARAR COMBINACIONES ----
      const combinaciones = [];
      if (variantes.length > 0) {
        const totalVariantes = variantes.reduce((sum, v) => sum + (parseFloat(v.unidades) || 0), 0);
        if (Math.abs(totalVariantes - unidadesRecepcionar) > 0.001) {
          throw new Error(`Suma de variantes (${totalVariantes}) no coincide con unidades a recepcionar (${unidadesRecepcionar})`);
        }

        for (const variante of variantes) {
          const unidadesVariante = parseFloat(variante.unidades) || 0;
          if (unidadesVariante <= 0) continue;

          if (variante.codigoColor || variante.codigoTalla) {
            const pendientesVarianteResult = await new sql.Request(transaction)
              .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
              .input('ejercicio', sql.SmallInt, ejercicio)
              .input('numero', sql.Int, numero)
              .input('serie', sql.VarChar, serieParam)
              .input('movPosicionLinea', sql.VarChar, linea.LineasPosicion || '')
              .input('codigoColor', sql.VarChar, variante.codigoColor || '')
              .query(`
                SELECT UnidadesTotalTallas_
                FROM LineasPedidoProveedorTallas
                WHERE CodigoEmpresa = @codigoEmpresa
                  AND EjercicioPedido = @ejercicio
                  AND NumeroPedido = @numero
                  AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
                  AND MovPosicionLinea_ = @movPosicionLinea
                  AND CodigoColor_ = @codigoColor
              `);
            if (pendientesVarianteResult.recordset.length > 0) {
              const pendientesVariante = parseFloat(pendientesVarianteResult.recordset[0].UnidadesTotalTallas_) || 0;
              if (unidadesVariante > pendientesVariante) {
                throw new Error(
                  `Variante color=${variante.codigoColor || '-'} talla=${variante.codigoTalla || '-'}: ` +
                  `se intentan recepcionar ${unidadesVariante} pero solo hay ${pendientesVariante} pendientes.`
                );
              }
            }
          }

          combinaciones.push({
            unidades: unidadesVariante,
            codigoColor: variante.codigoColor || '',
            codigoTalla: variante.codigoTalla || ''
          });
        }
      } else {
        combinaciones.push({
          unidades: unidadesRecepcionar,
          codigoColor: linea.CodigoColor_ || '',
          codigoTalla: linea.CodigoTalla01_ || ''
        });
      }

      // ---- ACTUALIZAR STOCK Y DESGLOSE DE TALLAS ----
      for (const comb of combinaciones) {
        // 1. Actualizar AcumuladoStockUbicacion y AcumuladoStock
        const stockActualQuery = await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicioBase', sql.SmallInt, contexto.ejercicioBase)
          .input('ejercicioActual', sql.SmallInt, contexto.ejercicioActual)
          .input('codigoAlmacen', sql.VarChar, almacen)
          .input('ubicacion', sql.VarChar, ubicacion)
          .input('codigoArticulo', sql.VarChar, codigoArticulo)
          .input('tipoUnidad', sql.VarChar, unidadMedida2)
          .input('partida', sql.VarChar, '')
          .input('codigoColor', sql.VarChar, comb.codigoColor)
          .input('codigoTalla', sql.VarChar, comb.codigoTalla)
          .query(`
            SELECT 
              ISNULL(SUM(CASE WHEN Periodo = 0 THEN UnidadSaldo ELSE 0 END), 0) AS StockPeriodo0,
              ISNULL(SUM(CASE WHEN Periodo = 99 THEN UnidadSaldo ELSE 0 END), 0) AS StockPeriodo99
            FROM AcumuladoStockUbicacion
            WHERE CodigoEmpresa = @codigoEmpresa
              AND Ejercicio IN (@ejercicioBase, @ejercicioActual)
              AND CodigoAlmacen = @codigoAlmacen
              AND Ubicacion = @ubicacion
              AND CodigoArticulo = @codigoArticulo
              AND ISNULL(TipoUnidadMedida_, '') = @tipoUnidad
              AND ISNULL(Partida, '') = @partida
              AND ISNULL(CodigoColor_, '') = @codigoColor
              AND ISNULL(CodigoTalla01_, '') = @codigoTalla
          `);

        const stockPeriodo0 = parseFloat(stockActualQuery.recordset[0]?.StockPeriodo0 || 0);
        const stockPeriodo99 = parseFloat(stockActualQuery.recordset[0]?.StockPeriodo99 || 0);
        const stockTotalActual = stockPeriodo0 + stockPeriodo99;
        const nuevoStockTotal = stockTotalActual + comb.unidades;

        await actualizarAcumuladoStockUbicacion(
          {
            articulo: codigoArticulo,
            codigoAlmacen: almacen,
            ubicacionStr: ubicacion,
            partida: '',
            unidadStock: unidadMedida2,
            nuevaCantidad: nuevoStockTotal,
            codigoColor: comb.codigoColor,
            codigoTalla01: comb.codigoTalla
          },
          codigoEmpresa,
          new Date().getFullYear(),
          contexto,
          transaction
        );

        await sincronizarAcumuladoStockDesdeUbicaciones(
          {
            articulo: codigoArticulo,
            codigoAlmacen: almacen,
            partida: '',
            unidadStock: unidadMedida2,
            codigoColor: comb.codigoColor,
            codigoTalla01: comb.codigoTalla
          },
          codigoEmpresa,
          new Date().getFullYear(),
          contexto,
          transaction
        );

        // BUG 3 CORREGIDO: el bloque de actualización de LineasPedidoProveedorTallas
        // ahora se activa con codigoTalla solo (no requiere también codigoColor),
        // para cubrir artículos SOLO-TALLA sin color.
        if (comb.codigoTalla && comb.codigoTalla !== '') {
          // BUG 7 CORREGIDO: si LineasPosicion no existe, se busca en BD en lugar
          // de construir una clave compuesta que nunca coincide.
          let movPosicionLineaValue = null;
          if (linea.LineasPosicion && typeof linea.LineasPosicion === 'string' && linea.LineasPosicion.trim() !== '') {
            movPosicionLineaValue = linea.LineasPosicion.trim();
          } else {
            // Intentar obtener desde la propia tabla de tallas
            const posicionResult = await new sql.Request(transaction)
              .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
              .input('ejercicio', sql.SmallInt, ejercicio)
              .input('numero', sql.Int, numero)
              .input('serie', sql.VarChar, serieParam)
              .input('codigoColor', sql.VarChar, comb.codigoColor)
              .query(`
                SELECT TOP 1 MovPosicionLinea_
                FROM LineasPedidoProveedorTallas
                WHERE CodigoEmpresa = @codigoEmpresa
                  AND EjercicioPedido = @ejercicio
                  AND NumeroPedido = @numero
                  AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
                  AND ISNULL(CodigoColor_, '') = @codigoColor
              `);
            if (posicionResult.recordset.length > 0) {
              movPosicionLineaValue = posicionResult.recordset[0].MovPosicionLinea_;
            } else {
              console.warn(`[RECEPCION] No se pudo obtener MovPosicionLinea_ para artículo ${codigoArticulo}, color=${comb.codigoColor}. Se omite actualización de tallas.`);
            }
          }

          if (movPosicionLineaValue) {
            const filaTallas = await new sql.Request(transaction)
              .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
              .input('ejercicio', sql.SmallInt, ejercicio)
              .input('numero', sql.Int, numero)
              .input('serie', sql.VarChar, serieParam)
              .input('movPosicionLinea', sql.VarChar, movPosicionLineaValue)
              .input('codigoColor', sql.VarChar, comb.codigoColor)
              .query(`
                SELECT * FROM LineasPedidoProveedorTallas
                WHERE CodigoEmpresa = @codigoEmpresa
                  AND EjercicioPedido = @ejercicio
                  AND NumeroPedido = @numero
                  AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
                  AND MovPosicionLinea_ = @movPosicionLinea
                  AND ISNULL(CodigoColor_, '') = @codigoColor
              `);

            if (filaTallas.recordset.length > 0) {
              const fila = filaTallas.recordset[0];
              let columnaUnidades = null;
              for (let i = 1; i <= 26; i++) {
                const num = i.toString().padStart(2, '0');
                const codigoTallaCampo = `CodigoTalla${num}_`;
                const unidadesCampo = `UnidadesTalla${num}_`;
                if (fila[codigoTallaCampo] === comb.codigoTalla) {
                  columnaUnidades = unidadesCampo;
                  break;
                }
              }
              if (!columnaUnidades) {
                console.warn(`[RECEPCION] No se encontró la talla ${comb.codigoTalla} en columnas CodigoTallaXX_ para color=${comb.codigoColor}.`);
              } else {
                const unidadesActuales = parseFloat(fila[columnaUnidades]) || 0;
                const nuevasUnidades = Math.max(0, unidadesActuales - comb.unidades);
                const nuevasRecibidas = (parseFloat(fila.UnidadesRecibidas) || 0) + comb.unidades;

                await new sql.Request(transaction)
                  .input('nuevasUnidades', sql.Decimal(18,4), nuevasUnidades)
                  .input('nuevasRecibidas', sql.Decimal(18,4), nuevasRecibidas)
                  .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                  .input('ejercicio', sql.SmallInt, ejercicio)
                  .input('numero', sql.Int, numero)
                  .input('serie', sql.VarChar, serieParam)
                  .input('movPosicionLinea', sql.VarChar, movPosicionLineaValue)
                  .input('codigoColor', sql.VarChar, comb.codigoColor)
                  .query(`
                    UPDATE LineasPedidoProveedorTallas
                    SET ${columnaUnidades} = @nuevasUnidades,
                        UnidadesRecibidas = @nuevasRecibidas
                    WHERE CodigoEmpresa = @codigoEmpresa
                      AND EjercicioPedido = @ejercicio
                      AND NumeroPedido = @numero
                      AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
                      AND MovPosicionLinea_ = @movPosicionLinea
                      AND ISNULL(CodigoColor_, '') = @codigoColor
                  `);
                console.log(`[RECEPCION] Talla ${comb.codigoTalla} (${columnaUnidades}): restantes=${nuevasUnidades}, recibidas=${nuevasRecibidas}`);
              }
            } else {
              console.warn(`[RECEPCION] No se encontró fila en LineasPedidoProveedorTallas para color=${comb.codigoColor}, pos=${movPosicionLineaValue}.`);
            }
          }
        } else {
          console.log(`[RECEPCION] Sin talla específica. No se actualiza LineasPedidoProveedorTallas.`);
        }
      } // fin for combinaciones

      // ---- ACTUALIZAR LÍNEA PRINCIPAL ----
      const nuevasUnidadesRecibidas = parseFloat(linea.UnidadesRecibidas) + unidadesRecepcionar;
      const nuevasUnidadesPendientes = Math.max(0, unidadesPendientes - unidadesRecepcionar);
      const nuevasUnidades2 = nuevasUnidadesRecibidas * factorConversion;

      await new sql.Request(transaction)
        .input('nuevasRecibidas', sql.Decimal(18,4), nuevasUnidadesRecibidas)
        .input('nuevasPendientes', sql.Decimal(18,4), nuevasUnidadesPendientes)
        .input('nuevasUnidades2', sql.Decimal(18,4), nuevasUnidades2)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('numero', sql.Int, numero)
        .input('serie', sql.VarChar, serieParam)
        .input('orden', sql.Int, lineaOrden)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .query(`
          UPDATE LineasPedidoProveedor
          SET UnidadesRecibidas = @nuevasRecibidas,
              UnidadesPendientes = @nuevasPendientes,
              Unidades2_ = @nuevasUnidades2
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND NumeroPedido = @numero
            AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
            AND Orden = @orden
            AND CodigoArticulo = @codigoArticulo
        `);

      if (nuevasUnidadesPendientes <= 0) {
        await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.SmallInt, ejercicio)
          .input('numero', sql.Int, numero)
          .input('serie', sql.VarChar, serieParam)
          .input('orden', sql.Int, lineaOrden)
          .input('codigoArticulo', sql.VarChar, codigoArticulo)
          .query(`
            UPDATE LineasPedidoProveedor
            SET Estado = 2
            WHERE CodigoEmpresa = @codigoEmpresa
              AND EjercicioPedido = @ejercicio
              AND NumeroPedido = @numero
              AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
              AND Orden = @orden
              AND CodigoArticulo = @codigoArticulo
          `);
      }

      resultadosRecepcion.push({
        orden: lineaOrden,
        codigoArticulo,
        descripcion: linea.DescripcionArticulo,
        unidadesRecepcionadas: unidadesRecepcionar,
        unidadesPendientesRestantes: nuevasUnidadesPendientes,
        tieneVariantes: variantes.length > 0,
      });
    } // fin for líneas

    // ---- VERIFICAR SI EL PEDIDO QUEDÓ COMPLETO ----
    const pendientesResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(`
        SELECT 
          ISNULL(SUM(UnidadesPendientes), 0) as totalPendientes,
          COUNT(CASE WHEN ISNULL(Estado,0) != 2 THEN 1 END) as lineasNoCompletadas
        FROM LineasPedidoProveedor
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numero
          AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
      `);
    const totalPendientes = safeDecimal(pendientesResult.recordset[0]?.totalPendientes, 0);
    const lineasNoCompletadas = parseInt(pendientesResult.recordset[0]?.lineasNoCompletadas, 10) || 0;
    const pedidoCompleto = (totalPendientes <= 0) && (lineasNoCompletadas === 0);

    // BUG 11 FIX: NO actualizamos Estado=2 de la cabecera aquí.
    // El estado 2 de la cabecera solo lo pone el endpoint generar-albaran,
    // para evitar que un fallo entre recepción y albarán deje la cabecera
    // en Estado=2 sin albarán generado.

    await transaction.commit();

    res.json({
      success: true,
      mensaje: 'Recepción procesada correctamente.',
      resultados: resultadosRecepcion,
      autoGenerarAlbaran: pedidoCompleto,
      pedido: {
        ejercicio, serie: serieParam, numero,
        proveedor: pedido.RazonSocial,
        estado: 0, // siempre 0 hasta que se genere albarán
        unidadesPendientes: totalPendientes
      },
      recepcion: { almacen, ubicacion, pedidoCompleto }
    });
  } catch (err) {
    console.error('[RECEPCION] ERROR. Haciendo ROLLBACK...', err);
    try { await transaction.rollback(); } catch (e) { console.error('Error en rollback:', e); }
    res.status(500).json({ success: false, mensaje: 'Error al procesar la recepción.', error: err.message });
  }
});

// ✅ 6. BUSCAR PEDIDOS CON FILTROS
// BUG 12 CORREGIDO: se usa un request separado para count y otro para la query paginada.
router.get('/pedidos-compra/buscar', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;

  const {
    proveedor = '',
    fechaDesde = '',
    fechaHasta = '',
    numeroPedido = '',
    estado = '0',
    page = 1,
    limit = 15
  } = req.query;

  const pagina = parseInt(page);
  const limite = parseInt(limit);
  const offset = (pagina - 1) * limite;

  if (!codigoEmpresa) {
    return res.status(400).json({
      success: false,
      mensaje: 'Código de empresa requerido.'
    });
  }

  try {
    console.log(`[BUSCAR PEDIDOS] proveedor=${proveedor}, numPedido=${numeroPedido}, fechas=${fechaDesde} a ${fechaHasta}, estado=${estado}`);

    // Construir condiciones WHERE dinámicas
    const condiciones = ['cp.CodigoEmpresa = @codigoEmpresa', 'cp.Estado = @estado'];

    if (proveedor && proveedor.trim() !== '') {
      condiciones.push('(cp.CodigoProveedor LIKE @proveedor OR cp.RazonSocial LIKE @proveedor)');
    }
    if (numeroPedido && numeroPedido.trim() !== '') {
      condiciones.push('cp.NumeroPedido = @numeroPedido');
    }
    if (fechaDesde && fechaDesde.trim() !== '') {
      condiciones.push('cp.FechaPedido >= @fechaDesde');
    }
    if (fechaHasta && fechaHasta.trim() !== '') {
      condiciones.push('cp.FechaPedido <= @fechaHasta');
    }

    const whereClause = `WHERE ${condiciones.join(' AND ')}`;

    // BUG 12 FIX: request separado para count
    const countRequest = getPool().request();
    countRequest.input('codigoEmpresa', sql.SmallInt, codigoEmpresa);
    countRequest.input('estado', sql.SmallInt, parseInt(estado));
    if (proveedor && proveedor.trim() !== '') countRequest.input('proveedor', sql.VarChar, `%${proveedor}%`);
    if (numeroPedido && numeroPedido.trim() !== '') countRequest.input('numeroPedido', sql.Int, parseInt(numeroPedido));
    if (fechaDesde && fechaDesde.trim() !== '') countRequest.input('fechaDesde', sql.Date, fechaDesde);
    if (fechaHasta && fechaHasta.trim() !== '') countRequest.input('fechaHasta', sql.Date, fechaHasta);

    const countResult = await countRequest.query(`
      SELECT COUNT(DISTINCT cp.NumeroPedido) as total
      FROM CabeceraPedidoProveedor cp
      ${whereClause}
    `);
    const totalPedidos = countResult.recordset[0].total;
    const totalPages = Math.ceil(totalPedidos / limite);

    // Request separado para datos paginados
    const dataRequest = getPool().request();
    dataRequest.input('codigoEmpresa', sql.SmallInt, codigoEmpresa);
    dataRequest.input('estado', sql.SmallInt, parseInt(estado));
    if (proveedor && proveedor.trim() !== '') dataRequest.input('proveedor', sql.VarChar, `%${proveedor}%`);
    if (numeroPedido && numeroPedido.trim() !== '') dataRequest.input('numeroPedido', sql.Int, parseInt(numeroPedido));
    if (fechaDesde && fechaDesde.trim() !== '') dataRequest.input('fechaDesde', sql.Date, fechaDesde);
    if (fechaHasta && fechaHasta.trim() !== '') dataRequest.input('fechaHasta', sql.Date, fechaHasta);
    dataRequest.input('offset', sql.Int, offset);
    dataRequest.input('limit', sql.Int, limite);

    const result = await dataRequest.query(`
      SELECT 
        cp.EjercicioPedido,
        cp.SeriePedido,
        cp.NumeroPedido,
        cp.FechaPedido,
        cp.CodigoProveedor,
        cp.RazonSocial AS NombreProveedor,
        cp.NumeroLineas,
        cp.ImporteLiquido,
        cp.Estado,
        cp.ObservacionesPedido AS Observaciones,
        COUNT(DISTINCT lp.Orden) AS TotalLineas,
        SUM(lp.UnidadesPedidas) AS TotalUnidadesPedidas,
        SUM(lp.UnidadesRecibidas) AS TotalUnidadesRecibidas,
        SUM(lp.UnidadesPendientes) AS TotalUnidadesPendientes,
        CASE 
          WHEN SUM(lp.UnidadesPendientes) = 0 THEN 1
          ELSE 0
        END AS CompletamenteRecepcionado
      FROM CabeceraPedidoProveedor cp
      LEFT JOIN LineasPedidoProveedor lp 
        ON lp.CodigoEmpresa = cp.CodigoEmpresa
        AND lp.EjercicioPedido = cp.EjercicioPedido
        AND lp.SeriePedido = cp.SeriePedido
        AND lp.NumeroPedido = cp.NumeroPedido
      ${whereClause}
      GROUP BY 
        cp.EjercicioPedido,
        cp.SeriePedido,
        cp.NumeroPedido,
        cp.FechaPedido,
        cp.CodigoProveedor,
        cp.RazonSocial,
        cp.NumeroLineas,
        cp.ImporteLiquido,
        cp.Estado,
        cp.ObservacionesPedido
      ORDER BY cp.FechaPedido DESC, cp.NumeroPedido DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      success: true,
      pedidos: result.recordset,
      pagination: {
        page: pagina,
        limit: limite,
        total: totalPedidos,
        totalPages,
        hasNext: pagina < totalPages,
        hasPrev: pagina > 1
      },
      filtrosAplicados: {
        proveedor: proveedor || null,
        fechaDesde: fechaDesde || null,
        fechaHasta: fechaHasta || null,
        numeroPedido: numeroPedido || null,
        estado: parseInt(estado)
      }
    });
  } catch (err) {
    console.error('[ERROR BUSCAR PEDIDOS COMPRA]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al buscar pedidos de compra.',
      error: err.message
    });
  }
});

// ✅ 7. GENERAR ALBARÁN A PARTIR DE PEDIDO RECEPCIONADO
router.post('/pedidos-compra/:ejercicio/:serie/:numero/generar-albaran', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { ejercicio, serie, numero } = req.params;
  const { suAlbaranNo, fechaSuAlbaran } = req.body;

  if (!suAlbaranNo || !fechaSuAlbaran) {
    return res.status(400).json({
      success: false,
      mensaje: 'Faltan datos obligatorios: Nº de Albarán del Proveedor (SuAlbaranNo) y Fecha del Albarán del Proveedor (FechaSuAlbaran).'
    });
  }

  if (!codigoEmpresa || !ejercicio || !numero) {
    return res.status(400).json({ success: false, mensaje: 'Parámetros del pedido requeridos.' });
  }

  const transaction = new sql.Transaction(getPool());
  try {
    await transaction.begin();
    const serieParam = (serie === 'undefined' || serie === 'null' || !serie) ? '0' : serie;

    // 1. Obtener cabecera del pedido
    const pedidoResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(`
        SELECT 
          cp.CodigoProveedor, cp.RazonSocial, cp.RazonSocial2, cp.Nombre,
          cp.Domicilio, cp.Domicilio2, cp.CodigoPostal, cp.CodigoMunicipio, cp.Municipio, cp.ColaMunicipio,
          cp.CodigoProvincia, cp.Provincia, cp.CodigoNacion, cp.Nacion,
          cp.CifDni, cp.CifEuropeo, cp.CodigoCondiciones, cp.FormadePago,
          cp.NumeroPlazos, cp.DiasPrimerPlazo, cp.DiasEntrePlazos, cp.DiasFijos1, cp.DiasFijos2, cp.DiasFijos3,
          cp.CodigoContable, cp.RemesaHabitual, cp.CodigoBanco, cp.CodigoAgencia, cp.DC, cp.CCC, cp.IBAN,
          cp.CodigoTransaccion, cp.CodigoTipoEfecto, cp.DomicilioRecibo,
          cp.TarifaPrecio, cp.TarifaDescuento, cp.IndicadorIva, cp.GrupoIva,
          cp.CodigoTransportista, cp.TipoPortes, cp.CodigoTerritorio,
          cp.CodVendedor, cp.Vendedor,
          cp.ObservacionesPedido AS ObservacionesProveedor,
          cp.Estado
        FROM CabeceraPedidoProveedor cp
        WHERE cp.CodigoEmpresa = @codigoEmpresa
          AND cp.EjercicioPedido = @ejercicio
          AND cp.NumeroPedido = @numero
          AND (cp.SeriePedido = @serie OR (@serie = '0' AND (cp.SeriePedido IS NULL OR cp.SeriePedido = '' OR cp.SeriePedido = '0')))
      `);
    if (pedidoResult.recordset.length === 0) throw new Error('Pedido no encontrado.');
    const pedido = pedidoResult.recordset[0];

    // 2. Líneas con unidades recibidas — BUG 5 FIX: bloquear con UPDLOCK para evitar doble albarán concurrente
    const lineasPedidoResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(`
        SELECT lp.*, a.DescripcionArticulo, a.UnidadMedida2_, a.FactorConversion_,
               lp.CodigoColor_, lp.GrupoTalla_, lp.CodigoTalla01_
        FROM LineasPedidoProveedor lp WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN Articulos a ON a.CodigoArticulo = lp.CodigoArticulo AND a.CodigoEmpresa = lp.CodigoEmpresa
        WHERE lp.CodigoEmpresa = @codigoEmpresa
          AND lp.EjercicioPedido = @ejercicio
          AND lp.NumeroPedido = @numero
          AND (lp.SeriePedido = @serie OR (@serie = '0' AND (lp.SeriePedido IS NULL OR lp.SeriePedido = '' OR lp.SeriePedido = '0')))
          AND lp.UnidadesRecibidas > 0
        ORDER BY lp.Orden
      `);
    if (lineasPedidoResult.recordset.length === 0) throw new Error('No hay líneas recepcionadas.');

    // 3. Calcular pendientes de albaranar
    const lineasConPendientes = [];
    for (const linea of lineasPedidoResult.recordset) {
      const codigoColor = safeString(linea.CodigoColor_, 10, '');
      const codigoTalla = safeString(linea.CodigoTalla01_, 10, '');

      // BUG 6 FIX: normalizar a NULL en la comparación usando ISNULL para evitar
      // falsos negativos cuando se insertó CodigoColor_ = '' vs NULL.
      const albaranadasResult = await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicioPedido', sql.SmallInt, ejercicio)
        .input('seriePedido', sql.VarChar, serieParam)
        .input('numeroPedido', sql.Int, numero)
        .input('ordenPedido', sql.SmallInt, linea.Orden)
        .input('codigoArticulo', sql.VarChar, linea.CodigoArticulo)
        .input('codigoColor', sql.VarChar, codigoColor)
        .input('codigoTalla', sql.VarChar, codigoTalla)
        .query(`
          SELECT ISNULL(SUM(UnidadesRecibidas), 0) as unidadesAlbaranadas
          FROM LineasAlbaranProveedor
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicioPedido
            AND ISNULL(SeriePedido, '0') = @seriePedido
            AND NumeroPedido = @numeroPedido
            AND Orden = @ordenPedido
            AND CodigoArticulo = @codigoArticulo
            AND ISNULL(CodigoColor_, '') = @codigoColor
            AND ISNULL(CodigoTalla01_, '') = @codigoTalla
        `);
      const totalRecibidas = safeDecimal(linea.UnidadesRecibidas, 0);
      const yaAlbaranado = safeDecimal(albaranadasResult.recordset[0]?.unidadesAlbaranadas, 0);
      const pendientes = totalRecibidas - yaAlbaranado;
      if (pendientes > 0) {
        lineasConPendientes.push({ ...linea, codigoColorSafe: codigoColor, codigoTallaSafe: codigoTalla, unidadesPendientesAlbaranar: pendientes });
      }
    }
    if (lineasConPendientes.length === 0) throw new Error('No hay unidades pendientes de albaranar.');

    // 4. Siguiente número de albarán
    const { ejercicioAlbaran, numeroAlbaran } = await obtenerSiguienteNumeroAlbaranProveedor(transaction, codigoEmpresa);
    const serieAlbaran = '';

    // 5. Calcular totales
    // BUG 9 FIX: usar linea['%Iva'] o PorcentajeIva para el porcentaje real, no CodigoIva
    let baseImponibleTotal = 0, totalIva = 0, importeLiquidoTotal = 0, totalUnidades = 0;
    const lineasProcesadas = lineasConPendientes.map(linea => {
      const unidades = safeDecimal(linea.unidadesPendientesAlbaranar, 0);
      const precio = safeDecimal(linea.Precio, 0);
      // BUG 9 FIX: usar el porcentaje real de IVA, no el código
      const ivaPct = safeDecimal(linea['%Iva'] ?? linea.PorcentajeIva ?? linea.CodigoIva, 21);
      const importeNeto = precio * unidades;
      const importeIva = importeNeto * (ivaPct / 100);
      const importeLiquido = importeNeto + importeIva;
      baseImponibleTotal += importeNeto;
      totalIva += importeIva;
      importeLiquidoTotal += importeLiquido;
      totalUnidades += unidades;
      const factorConversion = safeDecimal(linea.FactorConversion_, 1);
      const unidades2 = unidades * factorConversion;
      // BUG 8 FIX: unidadMedida1 es la unidad principal del artículo
      const unidadMedida1 = safeString(linea.UnidadMedida1_ || linea.UnidadMedida2_ || '', 10, '');
      const unidadMedida2 = safeString(linea.UnidadMedida2_, 10, '');
      return { ...linea, unidades, precio, iva: ivaPct, importeNeto, importeIva, importeLiquido, factorConversion, unidades2, unidadMedida1, unidadMedida2 };
    });

    // 6. Insertar cabecera del albarán
    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('serieAlbaran', sql.VarChar, serieAlbaran)
      .input('codigoProveedor', sql.VarChar(15), safeString(pedido.CodigoProveedor, 15))
      .input('razonSocial', sql.VarChar(40), safeString(pedido.RazonSocial, 40))
      .input('razonSocial2', sql.VarChar(40), safeString(pedido.RazonSocial2, 40))
      .input('nombre', sql.VarChar(40), safeString(pedido.Nombre, 40))
      .input('domicilio', sql.VarChar(40), safeString(pedido.Domicilio, 40))
      .input('domicilio2', sql.VarChar(40), safeString(pedido.Domicilio2, 40))
      .input('codigoPostal', sql.VarChar(10), safeString(pedido.CodigoPostal, 10))
      .input('codigoMunicipio', sql.VarChar(10), safeString(pedido.CodigoMunicipio, 10))
      .input('municipio', sql.VarChar(40), safeString(pedido.Municipio, 40))
      .input('colaMunicipio', sql.VarChar(10), safeString(pedido.ColaMunicipio, 10))
      .input('codigoProvincia', sql.VarChar(10), safeString(pedido.CodigoProvincia, 10))
      .input('provincia', sql.VarChar(30), safeString(pedido.Provincia, 30))
      .input('codigoNacion', sql.VarChar(5), safeString(pedido.CodigoNacion, 5))
      .input('nacion', sql.VarChar(20), safeString(pedido.Nacion, 20))
      .input('cifDni', sql.VarChar(13), safeString(pedido.CifDni, 13))
      .input('cifEuropeo', sql.VarChar(20), safeString(pedido.CifEuropeo, 20))
      .input('codigoCondiciones', sql.VarChar(10), safeString(pedido.CodigoCondiciones, 10))
      .input('formadePago', sql.VarChar(10), safeString(pedido.FormadePago, 10))
      .input('numeroPlazos', sql.SmallInt, safeDecimal(pedido.NumeroPlazos, 0))
      .input('diasPrimerPlazo', sql.SmallInt, safeDecimal(pedido.DiasPrimerPlazo, 0))
      .input('diasEntrePlazos', sql.SmallInt, safeDecimal(pedido.DiasEntrePlazos, 0))
      .input('diasFijos1', sql.SmallInt, safeDecimal(pedido.DiasFijos1, 0))
      .input('diasFijos2', sql.SmallInt, safeDecimal(pedido.DiasFijos2, 0))
      .input('diasFijos3', sql.SmallInt, safeDecimal(pedido.DiasFijos3, 0))
      .input('codigoContable', sql.VarChar(12), safeString(pedido.CodigoContable, 12))
      .input('remesaHabitual', sql.VarChar(10), safeString(pedido.RemesaHabitual, 10))
      .input('codigoBanco', sql.VarChar(4), safeString(pedido.CodigoBanco, 4))
      .input('codigoAgencia', sql.VarChar(4), safeString(pedido.CodigoAgencia, 4))
      .input('dc', sql.VarChar(2), safeString(pedido.DC, 2))
      .input('ccc', sql.VarChar(20), safeString(pedido.CCC, 20))
      .input('iban', sql.VarChar(34), safeString(pedido.IBAN, 34))
      .input('codigoTransaccion', sql.VarChar(10), safeString(pedido.CodigoTransaccion, 10))
      .input('codigoTipoEfecto', sql.VarChar(10), safeString(pedido.CodigoTipoEfecto, 10))
      .input('domicilioRecibo', sql.VarChar(40), safeString(pedido.DomicilioRecibo, 40))
      .input('tarifaPrecio', sql.VarChar(10), safeString(pedido.TarifaPrecio, 10))
      .input('tarifaDescuento', sql.VarChar(10), safeString(pedido.TarifaDescuento, 10))
      .input('indicadorIva', sql.SmallInt, safeDecimal(pedido.IndicadorIva, 1))
      .input('grupoIva', sql.SmallInt, safeDecimal(pedido.GrupoIva, 1))
      .input('codigoTransportista', sql.VarChar(15), safeString(pedido.CodigoTransportista, 15))
      .input('tipoPortes', sql.VarChar(2), safeString(pedido.TipoPortes, 2))
      .input('codigoTerritorio', sql.VarChar(10), safeString(pedido.CodigoTerritorio, 10))
      .input('codVendedor', sql.VarChar(10), safeString(pedido.CodVendedor, 10))
      .input('vendedor', sql.VarChar(40), safeString(pedido.Vendedor, 40))
      .input('observacionesProveedor', sql.VarChar(255), safeString(pedido.ObservacionesProveedor, 255))
      .input('numeroLineas', sql.Int, lineasProcesadas.length)
      .input('importeBruto', sql.Decimal(18,4), baseImponibleTotal)
      .input('importeNetoLineas', sql.Decimal(18,4), baseImponibleTotal)
      .input('importeParcial', sql.Decimal(18,4), baseImponibleTotal)
      .input('baseImponible', sql.Decimal(18,4), baseImponibleTotal)
      .input('totalCuotaIva', sql.Decimal(18,4), totalIva)
      .input('totalIva', sql.Decimal(18,4), totalIva)
      .input('importeLiquido', sql.Decimal(18,4), importeLiquidoTotal)
      .input('ejercicioPedido', sql.SmallInt, ejercicio)
      .input('seriePedido', sql.VarChar(10), serieParam)
      .input('numeroPedido', sql.Int, numero)
      .input('suAlbaranNo', sql.VarChar(50), safeString(suAlbaranNo, 50))
      .input('fechaSuAlbaran', sql.Date, fechaSuAlbaran)
      .query(`
        INSERT INTO CabeceraAlbaranProveedor (
          CodigoEmpresa, EjercicioAlbaran, NumeroAlbaran, SerieAlbaran,
          CodigoProveedor, RazonSocial, RazonSocial2, Nombre,
          Domicilio, Domicilio2, CodigoPostal, CodigoMunicipio, Municipio, ColaMunicipio,
          CodigoProvincia, Provincia, CodigoNacion, Nacion,
          CifDni, CifEuropeo, CodigoCondiciones, FormadePago,
          NumeroPlazos, DiasPrimerPlazo, DiasEntrePlazos, DiasFijos1, DiasFijos2, DiasFijos3,
          CodigoContable, RemesaHabitual, CodigoBanco, CodigoAgencia, DC, CCC, IBAN,
          CodigoTransaccion, CodigoTipoEfecto, DomicilioRecibo,
          TarifaPrecio, TarifaDescuento, IndicadorIva, GrupoIva,
          CodigoTransportista, TipoPortes, CodigoTerritorio,
          CodVendedor, Vendedor,
          ObservacionesProveedor,
          NumeroLineas, ImporteBruto, ImporteNetoLineas, ImporteParcial,
          BaseImponible, TotalCuotaIva, TotalIva, ImporteLiquido,
          EjercicioPedido, SeriePedido, NumeroPedido,
          SuAlbaranNo, FechaSuAlbaran,
          FechaAlbaran
        ) VALUES (
          @codigoEmpresa, @ejercicioAlbaran, @numeroAlbaran, @serieAlbaran,
          @codigoProveedor, @razonSocial, @razonSocial2, @nombre,
          @domicilio, @domicilio2, @codigoPostal, @codigoMunicipio, @municipio, @colaMunicipio,
          @codigoProvincia, @provincia, @codigoNacion, @nacion,
          @cifDni, @cifEuropeo, @codigoCondiciones, @formadePago,
          @numeroPlazos, @diasPrimerPlazo, @diasEntrePlazos, @diasFijos1, @diasFijos2, @diasFijos3,
          @codigoContable, @remesaHabitual, @codigoBanco, @codigoAgencia, @dc, @ccc, @iban,
          @codigoTransaccion, @codigoTipoEfecto, @domicilioRecibo,
          @tarifaPrecio, @tarifaDescuento, @indicadorIva, @grupoIva,
          @codigoTransportista, @tipoPortes, @codigoTerritorio,
          @codVendedor, @vendedor,
          @observacionesProveedor,
          @numeroLineas, @importeBruto, @importeNetoLineas, @importeParcial,
          @baseImponible, @totalCuotaIva, @totalIva, @importeLiquido,
          @ejercicioPedido, @seriePedido, @numeroPedido,
          @suAlbaranNo, @fechaSuAlbaran,
          GETDATE()
        )
      `);

    // 7. Insertar líneas del albarán
    for (const linea of lineasProcesadas) {
      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('serieAlbaran', sql.VarChar(10), serieAlbaran)
        .input('codigoArticulo', sql.VarChar(20), safeString(linea.CodigoArticulo, 20))
        .input('descripcionArticulo', sql.VarChar(50), safeString(linea.DescripcionArticulo, 50))
        .input('descripcion2Articulo', sql.VarChar(50), safeString(linea.Descripcion2Articulo, 50))
        .input('descripcionLinea', sql.VarChar(255), safeString(linea.DescripcionLinea, 255))
        .input('codigoAlmacen', sql.VarChar(10), safeString(linea.CodigoAlmacen, 10))
        .input('partida', sql.VarChar(20), safeString(linea.Partida, 20))
        .input('codigodelProveedor', sql.VarChar(15), safeString(linea.CodigodelProveedor, 15))
        .input('codigoFamilia', sql.VarChar(10), safeString(linea.CodigoFamilia, 10))
        .input('codigoSubfamilia', sql.VarChar(10), safeString(linea.CodigoSubfamilia, 10))
        .input('tipoArticulo', sql.VarChar(1), safeString(linea.TipoArticulo, 1))
        .input('largo', sql.Decimal(18,4), safeDecimal(linea.Largo_, 0))
        .input('alto', sql.Decimal(18,4), safeDecimal(linea.Alto_, 0))
        .input('ancho', sql.Decimal(18,4), safeDecimal(linea.Ancho_, 0))
        .input('dimension', sql.Decimal(18,4), safeDecimal(linea.Dimension_, 0))
        .input('codigoAlternativo2', sql.VarChar(20), safeString(linea.CodigoAlternativo2, 20))
        // BUG 8 FIX: unidadMedida1 usa la unidad principal, no la secundaria
        .input('unidadMedida1', sql.VarChar(10), linea.unidadMedida1)
        .input('unidadMedida2', sql.VarChar(10), linea.unidadMedida2)
        .input('factorConversion', sql.Decimal(18,4), linea.factorConversion)
        .input('unidadesRecibidas', sql.Decimal(18,4), linea.unidades)
        .input('unidades', sql.Decimal(18,4), linea.unidades)
        .input('unidades2', sql.Decimal(18,4), linea.unidades2)
        // BUG 6 FIX: normalizar vacío a NULL en la inserción para consistencia de comparaciones futuras
        .input('codigoColor', sql.VarChar(10), linea.codigoColorSafe || null)
        .input('grupoTalla', sql.SmallInt, safeDecimal(linea.GrupoTalla_, 0))
        .input('codigoTalla', sql.VarChar(10), linea.codigoTallaSafe || null)
        .input('grupoIva', sql.TinyInt, safeDecimal(linea.GrupoIva, 1))
        .input('codigoIva', sql.SmallInt, safeDecimal(linea.CodigoIva, 1))
        .input('ivaIncluido', sql.SmallInt, safeDecimal(linea.IvaIncluido, 0))
        .input('porcentajeIva', sql.Decimal(18,4), linea.iva)
        .input('ejercicioPedido', sql.SmallInt, ejercicio)
        .input('seriePedido', sql.VarChar(10), serieParam)
        .input('numeroPedido', sql.Int, numero)
        .input('orden', sql.SmallInt, linea.Orden)
        .input('precio', sql.Decimal(18,4), linea.precio)
        .input('importeBruto', sql.Decimal(18,4), linea.importeNeto)
        .input('importeNeto', sql.Decimal(18,4), linea.importeNeto)
        .input('baseImponible', sql.Decimal(18,4), linea.importeNeto)
        .input('baseIva', sql.Decimal(18,4), linea.importeNeto)
        .input('cuotaIva', sql.Decimal(18,4), linea.importeIva)
        .input('totalIva', sql.Decimal(18,4), linea.importeIva)
        .input('importeLiquido', sql.Decimal(18,4), linea.importeLiquido)
        .input('acumulaCosteProyectos', sql.SmallInt, -1)
        .query(`
          INSERT INTO LineasAlbaranProveedor (
            CodigoEmpresa, EjercicioAlbaran, NumeroAlbaran, SerieAlbaran,
            CodigoArticulo, DescripcionArticulo, Descripcion2Articulo, DescripcionLinea,
            CodigoAlmacen, Partida, CodigodelProveedor, CodigoFamilia, CodigoSubfamilia,
            TipoArticulo, Largo_, Alto_, Ancho_, Dimension_, CodigoAlternativo2,
            UnidadMedida1_, UnidadMedida2_, FactorConversion_,
            UnidadesRecibidas, Unidades, Unidades2_,
            CodigoColor_, GrupoTalla_, CodigoTalla01_,
            GrupoIva, CodigoIva, IvaIncluido, [%Iva],
            EjercicioPedido, SeriePedido, NumeroPedido, Orden,
            Precio, ImporteBruto, ImporteNeto, BaseImponible, BaseIva, CuotaIva, TotalIva, ImporteLiquido,
            AcumulaCosteProyectos,
            FechaRegistro, FechaAlbaran
          ) VALUES (
            @codigoEmpresa, @ejercicioAlbaran, @numeroAlbaran, @serieAlbaran,
            @codigoArticulo, @descripcionArticulo, @descripcion2Articulo, @descripcionLinea,
            @codigoAlmacen, @partida, @codigodelProveedor, @codigoFamilia, @codigoSubfamilia,
            @tipoArticulo, @largo, @alto, @ancho, @dimension, @codigoAlternativo2,
            @unidadMedida1, @unidadMedida2, @factorConversion,
            @unidadesRecibidas, @unidades, @unidades2,
            @codigoColor, @grupoTalla, @codigoTalla,
            @grupoIva, @codigoIva, @ivaIncluido, @porcentajeIva,
            @ejercicioPedido, @seriePedido, @numeroPedido, @orden,
            @precio, @importeBruto, @importeNeto, @baseImponible, @baseIva, @cuotaIva, @totalIva, @importeLiquido,
            @acumulaCosteProyectos,
            GETDATE(), GETDATE()
          )
        `);
    }

    // 8. Insertar MovimientoStock — un registro por cada línea del albarán
    const periodoAlbaran = new Date().getMonth() + 1; // 1-12
    const codigoUsuario = safeString(req.user?.UsuarioLogicNet || req.user?.CodigoCliente || 'SISTEMA', 50);
    for (const linea of lineasProcesadas) {
      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicioAlbaran)
        .input('periodo', sql.TinyInt, periodoAlbaran)
        .input('fecha', sql.DateTime, new Date())
        .input('serie', sql.VarChar(10), serieAlbaran)
        .input('documento', sql.Int, numeroAlbaran)
        .input('codigoArticulo', sql.VarChar(20), safeString(linea.CodigoArticulo, 20))
        .input('codigoAlmacen', sql.VarChar(10), safeString(linea.CodigoAlmacen || ALMACEN_RECEPCION_TEMPORAL, 10))
        .input('partida', sql.VarChar(20), safeString(linea.Partida, 20))
        .input('codigoColor', sql.VarChar(10), linea.codigoColorSafe || null)
        .input('grupoTalla', sql.SmallInt, safeDecimal(linea.GrupoTalla_, 0))
        .input('codigoTalla', sql.VarChar(10), linea.codigoTallaSafe || null)
        .input('unidades', sql.Decimal(18,10), linea.unidades)
        .input('unidadStock', sql.Decimal(18,10), linea.unidades)
        .input('unidadMedida1', sql.VarChar(10), linea.unidadMedida1)
        .input('precio', sql.Decimal(18,10), linea.precio)
        .input('importe', sql.Decimal(18,10), linea.importeNeto)
        .input('unidades2', sql.Decimal(18,10), linea.unidades2)
        .input('unidadMedida2', sql.VarChar(10), linea.unidadMedida2)
        .input('factorConversion', sql.Decimal(18,10), linea.factorConversion)
        .input('codigoProveedor', sql.VarChar(15), safeString(pedido.CodigoProveedor, 15))
        .input('ubicacion', sql.VarChar(50), UBICACION_RECEPCION_TEMPORAL)
        .input('statusAcumulado', sql.SmallInt, -1)
        .input('usuarioProceso', sql.VarChar(50), codigoUsuario)
        .input('empresaOrigen', sql.SmallInt, codigoEmpresa)
        .input('ejercicioDocumento', sql.SmallInt, ejercicioAlbaran)
        .input('origenMovimiento', sql.VarChar(1), 'B')
        .input('tipoMovimiento', sql.SmallInt, 1)
        .input('comentario', sql.VarChar(255), `Albarán compra:${ejercicioAlbaran}/${serieAlbaran}/${numeroAlbaran}`)
        .query(`
          INSERT INTO MovimientoStock (
            CodigoEmpresa, Ejercicio, Periodo, Fecha, FechaRegistro,
            Serie, Documento,
            CodigoArticulo, CodigoAlmacen, Partida,
            CodigoColor_, GrupoTalla_, CodigoTalla01_,
            Unidades, UnidadStock, UnidadMedida1_,
            Precio, Importe,
            Unidades2_, UnidadMedida2_, FactorConversion_,
            CodigoProveedor,
            Ubicacion,
            StatusAcumulado,
            MovPosicion, MovOrigen, Proceso,
            MovTraspaso, MovConsumo, MovIdentificador,
            UsuarioProceso, EmpresaOrigen,
            EjercicioDocumento,
            OrigenMovimiento, TipoMovimiento,
            Comentario
          ) VALUES (
            @codigoEmpresa, @ejercicio, @periodo, @fecha, GETDATE(),
            @serie, @documento,
            @codigoArticulo, @codigoAlmacen, @partida,
            @codigoColor, @grupoTalla, @codigoTalla,
            @unidades, @unidadStock, @unidadMedida1,
            @precio, @importe,
            @unidades2, @unidadMedida2, @factorConversion,
            @codigoProveedor,
            @ubicacion,
            @statusAcumulado,
            NEWID(), NEWID(), NEWID(),
            '00000000-0000-0000-0000-000000000000',
            '00000000-0000-0000-0000-000000000000',
            '00000000-0000-0000-0000-000000000000',
            @usuarioProceso, @empresaOrigen,
            @ejercicioDocumento,
            @origenMovimiento, @tipoMovimiento,
            @comentario
          )
        `);
    }

    // 9. Actualizar estado del pedido — BUG 11 FIX: el Estado=2 de la cabecera
    // se actualiza AQUÍ (en el albarán), no en el endpoint de recepción.
    const pendientesResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(`
        SELECT SUM(UnidadesPendientes) as totalPendientes
        FROM LineasPedidoProveedor
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numero
          AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
      `);
    const totalPendientes = safeDecimal(pendientesResult.recordset[0]?.totalPendientes, 0);
    const nuevoEstado = totalPendientes <= 0 ? 2 : 0;
    if (nuevoEstado !== pedido.Estado) {
      await new sql.Request(transaction)
        .input('nuevoEstado', sql.SmallInt, nuevoEstado)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('numero', sql.Int, numero)
        .input('serie', sql.VarChar, serieParam)
        .query(`
          UPDATE CabeceraPedidoProveedor
          SET Estado = @nuevoEstado
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND NumeroPedido = @numero
            AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
        `);
    }

    await transaction.commit();

    res.json({
      success: true,
      mensaje: 'Albarán generado correctamente.',
      albaran: {
        ejercicio: ejercicioAlbaran,
        numero: numeroAlbaran,
        serie: serieAlbaran,
        fecha: new Date().toISOString().split('T')[0],
        proveedor: { codigo: pedido.CodigoProveedor, nombre: pedido.RazonSocial },
        totalLineas: lineasProcesadas.length,
        totalUnidades,
        importes: { neto: baseImponibleTotal, iva: totalIva, liquido: importeLiquidoTotal },
        suAlbaranNo,
        fechaSuAlbaran
      }
    });
  } catch (err) {
    try { if (transaction && !transaction._aborted) await transaction.rollback(); } catch (e) { console.warn(e); }
    console.error('[ERROR GENERAR ALBARÁN]', err);
    res.status(500).json({ success: false, mensaje: `Error: ${err.message}`, error: err.message });
  }
});

// ✅ FINALIZAR PEDIDO
router.post('/pedidos-compra/:ejercicio/:serie/:numero/finalizar', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { ejercicio, serie, numero } = req.params;
  const { motivo } = req.body;

  console.log('✅ FINALIZANDO PEDIDO:', codigoEmpresa, `${ejercicio}/${serie || '0'}/${numero}`, motivo || 'Sin motivo');

  if (!codigoEmpresa || !ejercicio || !numero) {
    return res.status(400).json({ success: false, mensaje: 'Parámetros del pedido requeridos.' });
  }

  const transaction = new sql.Transaction(getPool());

  try {
    await transaction.begin();
    const serieParam = (serie === 'undefined' || serie === 'null' || !serie) ? '0' : serie;
    
    const pedidoResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(`
        SELECT Estado, RazonSocial, CodigoProveedor
        FROM CabeceraPedidoProveedor
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numero
          AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
      `);

    if (pedidoResult.recordset.length === 0) throw new Error('Pedido no encontrado.');
    const pedido = pedidoResult.recordset[0];
    if (pedido.Estado !== 0) throw new Error(`El pedido no está en estado pendiente. Estado actual: ${pedido.Estado}`);

    const lineasPendientesResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(`
        SELECT SUM(UnidadesPendientes) as totalPendientes
        FROM LineasPedidoProveedor
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numero
          AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
      `);

    const totalPendientes = parseFloat(lineasPendientesResult.recordset[0].totalPendientes) || 0;
    if (totalPendientes > 0) {
      console.log(`[FINALIZAR] Advertencia: ${totalPendientes} unidades pendientes. Se forzará cierre.`);
    }

    await new sql.Request(transaction)
      .input('nuevoEstado', sql.SmallInt, 2)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(`
        UPDATE LineasPedidoProveedor
        SET Estado = @nuevoEstado
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numero
          AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
      `);

    await new sql.Request(transaction)
      .input('nuevoEstado', sql.SmallInt, 2)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(`
        UPDATE CabeceraPedidoProveedor
        SET Estado = @nuevoEstado
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numero
          AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
      `);

    await transaction.commit();

    res.json({
      success: true,
      mensaje: totalPendientes > 0 
        ? `Pedido finalizado como servido con ${totalPendientes} unidades pendientes.`
        : 'Pedido finalizado correctamente como servido.',
      pedido: {
        ejercicio: parseInt(ejercicio),
        numero: parseInt(numero),
        serie: serieParam,
        estado: 2,
        unidadesPendientes: totalPendientes,
        proveedor: { codigo: pedido.CodigoProveedor, nombre: pedido.RazonSocial }
      }
    });

  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR FINALIZAR PEDIDO]', err);
    res.status(500).json({ success: false, mensaje: 'Error al finalizar el pedido.', error: err.message });
  }
});

// ✅ 9. ALBARÁN POR PROVEEDOR (múltiples pedidos)
router.post('/proveedores/:codigoProveedor/generar-albaran', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { codigoProveedor } = req.params;
  const { pedidos, suAlbaranNo, fechaSuAlbaran } = req.body;

  if (!suAlbaranNo || !fechaSuAlbaran) {
    return res.status(400).json({
      success: false,
      mensaje: 'Faltan datos obligatorios: Nº de Albarán del Proveedor (SuAlbaranNo) y Fecha del Albarán del Proveedor (FechaSuAlbaran).'
    });
  }

  if (!codigoEmpresa || !codigoProveedor) {
    return res.status(400).json({ success: false, mensaje: 'Código de empresa y proveedor requeridos.' });
  }
  if (!pedidos || !Array.isArray(pedidos) || pedidos.length === 0) {
    return res.status(400).json({ success: false, mensaje: 'Debe especificar los pedidos a incluir.' });
  }

  const transaction = new sql.Transaction(getPool());
  try {
    await transaction.begin();

    const primerPedidoInfo = pedidos[0];
    const ejercicioPrimero = primerPedidoInfo.ejercicio;
    const seriePrimero = (primerPedidoInfo.serie === 'undefined' || primerPedidoInfo.serie === 'null' || !primerPedidoInfo.serie) ? '0' : primerPedidoInfo.serie;
    const numeroPrimero = primerPedidoInfo.numero;

    const pedidoCabeceraResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicioPrimero)
      .input('numero', sql.Int, numeroPrimero)
      .input('serie', sql.VarChar, seriePrimero)
      .query(`
        SELECT 
          cp.CodigoProveedor, cp.RazonSocial, cp.RazonSocial2, cp.Nombre,
          cp.Domicilio, cp.Domicilio2, cp.CodigoPostal, cp.CodigoMunicipio, cp.Municipio, cp.ColaMunicipio,
          cp.CodigoProvincia, cp.Provincia, cp.CodigoNacion, cp.Nacion,
          cp.CifDni, cp.CifEuropeo, cp.CodigoCondiciones, cp.FormadePago,
          cp.NumeroPlazos, cp.DiasPrimerPlazo, cp.DiasEntrePlazos, cp.DiasFijos1, cp.DiasFijos2, cp.DiasFijos3,
          cp.CodigoContable, cp.RemesaHabitual, cp.CodigoBanco, cp.CodigoAgencia, cp.DC, cp.CCC, cp.IBAN,
          cp.CodigoTransaccion, cp.CodigoTipoEfecto, cp.DomicilioRecibo,
          cp.TarifaPrecio, cp.TarifaDescuento, cp.IndicadorIva, cp.GrupoIva,
          cp.CodigoTransportista, cp.TipoPortes, cp.CodigoTerritorio,
          cp.CodVendedor, cp.Vendedor,
          cp.ObservacionesPedido AS ObservacionesProveedor
        FROM CabeceraPedidoProveedor cp
        WHERE cp.CodigoEmpresa = @codigoEmpresa
          AND cp.EjercicioPedido = @ejercicio
          AND cp.NumeroPedido = @numero
          AND (cp.SeriePedido = @serie OR (@serie = '0' AND (cp.SeriePedido IS NULL OR cp.SeriePedido = '' OR cp.SeriePedido = '0')))
      `);
    if (pedidoCabeceraResult.recordset.length === 0) {
      throw new Error('No se encontró el primer pedido para obtener datos de cabecera.');
    }
    const pedidoHeader = pedidoCabeceraResult.recordset[0];

    const { ejercicioAlbaran, numeroAlbaran } = await obtenerSiguienteNumeroAlbaranProveedor(transaction, codigoEmpresa);
    const serieAlbaran = '';

    const lineasDetalladas = [];
    const pedidosPorProcesar = [];

    let totalUnidades = 0, baseImponibleTotal = 0, totalIva = 0, importeLiquidoTotal = 0;

    for (const pedidoInfo of pedidos) {
      const { ejercicio, serie, numero } = pedidoInfo;
      const serieParam = (serie === 'undefined' || serie === 'null' || !serie) ? '0' : serie;

      // BUG 5 FIX: bloquear líneas con UPDLOCK para evitar doble albarán concurrente
      const lineasPedidoResult = await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('numero', sql.Int, numero)
        .input('serie', sql.VarChar, serieParam)
        .query(`
          SELECT 
            lp.*,
            a.DescripcionArticulo,
            a.UnidadMedida2_,
            a.FactorConversion_,
            lp.CodigoColor_,
            lp.GrupoTalla_,
            lp.CodigoTalla01_
          FROM LineasPedidoProveedor lp WITH (UPDLOCK, HOLDLOCK)
          LEFT JOIN Articulos a ON a.CodigoArticulo = lp.CodigoArticulo AND a.CodigoEmpresa = lp.CodigoEmpresa
          WHERE lp.CodigoEmpresa = @codigoEmpresa
            AND lp.EjercicioPedido = @ejercicio
            AND lp.NumeroPedido = @numero
            AND (lp.SeriePedido = @serie OR (@serie = '0' AND (lp.SeriePedido IS NULL OR lp.SeriePedido = '' OR lp.SeriePedido = '0')))
            AND lp.UnidadesRecibidas > 0
          ORDER BY lp.Orden
        `);

      if (lineasPedidoResult.recordset.length === 0) continue;

      let pedidoConUnidadesPendientes = false;

      for (const linea of lineasPedidoResult.recordset) {
        const unidadesRecibidasTotales = safeDecimal(linea.UnidadesRecibidas, 0);
        const codigoColor = safeString(linea.CodigoColor_, 10, '');
        const codigoTalla = safeString(linea.CodigoTalla01_, 10, '');

        // BUG 6 FIX: usar ISNULL en la comparación para normalizar '' vs NULL
        const albaranadasResult = await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicioPedido', sql.SmallInt, ejercicio)
          .input('seriePedido', sql.VarChar(10), serieParam)
          .input('numeroPedido', sql.Int, numero)
          .input('ordenPedido', sql.SmallInt, linea.Orden)
          .input('codigoArticulo', sql.VarChar(20), linea.CodigoArticulo)
          .input('codigoColor', sql.VarChar(10), codigoColor)
          .input('codigoTalla', sql.VarChar(10), codigoTalla)
          .query(`
            SELECT ISNULL(SUM(UnidadesRecibidas), 0) as totalAlbaranado
            FROM LineasAlbaranProveedor
            WHERE CodigoEmpresa = @codigoEmpresa
              AND EjercicioPedido = @ejercicioPedido
              AND ISNULL(SeriePedido, '0') = @seriePedido
              AND NumeroPedido = @numeroPedido
              AND Orden = @ordenPedido
              AND CodigoArticulo = @codigoArticulo
              AND ISNULL(CodigoColor_, '') = @codigoColor
              AND ISNULL(CodigoTalla01_, '') = @codigoTalla
          `);
        const totalAlbaranado = safeDecimal(albaranadasResult.recordset[0]?.totalAlbaranado, 0);
        const pendientesAlbaranar = unidadesRecibidasTotales - totalAlbaranado;

        if (pendientesAlbaranar > 0) {
          pedidoConUnidadesPendientes = true;
          const precio = safeDecimal(linea.Precio, 0);
          const importeNetoLinea = precio * pendientesAlbaranar;
          // BUG 9 FIX: usar porcentaje real de IVA
          const ivaPct = safeDecimal(linea['%Iva'] ?? linea.PorcentajeIva ?? linea.CodigoIva, 21);
          const importeIvaLinea = importeNetoLinea * (ivaPct / 100);
          const importeLiquidoLinea = importeNetoLinea + importeIvaLinea;
          const factorConversion = safeDecimal(linea.FactorConversion_, 1);
          const unidades2 = pendientesAlbaranar * factorConversion;
          // BUG 8 FIX: unidadMedida1 usa la unidad principal
          const unidadMedida1 = safeString(linea.UnidadMedida1_ || linea.UnidadMedida2_ || '', 10, '');
          const unidadMedida2 = safeString(linea.UnidadMedida2_, 10, '');

          lineasDetalladas.push({
            ...linea,
            ejercicioPedido: ejercicio,
            seriePedido: serieParam,
            numeroPedido: numero,
            ordenPedido: linea.Orden,
            unidadesParaAlbaranar: pendientesAlbaranar,
            precio, iva: ivaPct, importeNetoLinea, importeIvaLinea, importeLiquidoLinea,
            factorConversion, unidades2, unidadMedida1, unidadMedida2,
            codigoColorSafe: codigoColor,
            codigoTallaSafe: codigoTalla,
            grupoIva: safeDecimal(linea.GrupoIva, 1),
            ivaIncluido: safeDecimal(linea.IvaIncluido, 0)
          });

          totalUnidades += pendientesAlbaranar;
          baseImponibleTotal += importeNetoLinea;
          totalIva += importeIvaLinea;
          importeLiquidoTotal += importeLiquidoLinea;
        }
      }

      pedidosPorProcesar.push({
        ejercicio,
        serie: serieParam,
        numero,
        tieneUnidadesPendientes: pedidoConUnidadesPendientes
      });
    }

    if (lineasDetalladas.length === 0) {
      throw new Error('No hay unidades pendientes de albaranar para generar un nuevo albarán.');
    }

    // Insertar cabecera del albarán
    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('serieAlbaran', sql.VarChar, serieAlbaran)
      .input('codigoProveedor', sql.VarChar(15), safeString(pedidoHeader.CodigoProveedor, 15))
      .input('razonSocial', sql.VarChar(40), safeString(pedidoHeader.RazonSocial, 40))
      .input('razonSocial2', sql.VarChar(40), safeString(pedidoHeader.RazonSocial2, 40))
      .input('nombre', sql.VarChar(40), safeString(pedidoHeader.Nombre, 40))
      .input('domicilio', sql.VarChar(40), safeString(pedidoHeader.Domicilio, 40))
      .input('domicilio2', sql.VarChar(40), safeString(pedidoHeader.Domicilio2, 40))
      .input('codigoPostal', sql.VarChar(10), safeString(pedidoHeader.CodigoPostal, 10))
      .input('codigoMunicipio', sql.VarChar(10), safeString(pedidoHeader.CodigoMunicipio, 10))
      .input('municipio', sql.VarChar(40), safeString(pedidoHeader.Municipio, 40))
      .input('colaMunicipio', sql.VarChar(10), safeString(pedidoHeader.ColaMunicipio, 10))
      .input('codigoProvincia', sql.VarChar(10), safeString(pedidoHeader.CodigoProvincia, 10))
      .input('provincia', sql.VarChar(30), safeString(pedidoHeader.Provincia, 30))
      .input('codigoNacion', sql.VarChar(5), safeString(pedidoHeader.CodigoNacion, 5))
      .input('nacion', sql.VarChar(20), safeString(pedidoHeader.Nacion, 20))
      .input('cifDni', sql.VarChar(13), safeString(pedidoHeader.CifDni, 13))
      .input('cifEuropeo', sql.VarChar(20), safeString(pedidoHeader.CifEuropeo, 20))
      .input('codigoCondiciones', sql.VarChar(10), safeString(pedidoHeader.CodigoCondiciones, 10))
      .input('formadePago', sql.VarChar(10), safeString(pedidoHeader.FormadePago, 10))
      .input('numeroPlazos', sql.SmallInt, safeDecimal(pedidoHeader.NumeroPlazos, 0))
      .input('diasPrimerPlazo', sql.SmallInt, safeDecimal(pedidoHeader.DiasPrimerPlazo, 0))
      .input('diasEntrePlazos', sql.SmallInt, safeDecimal(pedidoHeader.DiasEntrePlazos, 0))
      .input('diasFijos1', sql.SmallInt, safeDecimal(pedidoHeader.DiasFijos1, 0))
      .input('diasFijos2', sql.SmallInt, safeDecimal(pedidoHeader.DiasFijos2, 0))
      .input('diasFijos3', sql.SmallInt, safeDecimal(pedidoHeader.DiasFijos3, 0))
      .input('codigoContable', sql.VarChar(12), safeString(pedidoHeader.CodigoContable, 12))
      .input('remesaHabitual', sql.VarChar(10), safeString(pedidoHeader.RemesaHabitual, 10))
      .input('codigoBanco', sql.VarChar(4), safeString(pedidoHeader.CodigoBanco, 4))
      .input('codigoAgencia', sql.VarChar(4), safeString(pedidoHeader.CodigoAgencia, 4))
      .input('dc', sql.VarChar(2), safeString(pedidoHeader.DC, 2))
      .input('ccc', sql.VarChar(20), safeString(pedidoHeader.CCC, 20))
      .input('iban', sql.VarChar(34), safeString(pedidoHeader.IBAN, 34))
      .input('codigoTransaccion', sql.VarChar(10), safeString(pedidoHeader.CodigoTransaccion, 10))
      .input('codigoTipoEfecto', sql.VarChar(10), safeString(pedidoHeader.CodigoTipoEfecto, 10))
      .input('domicilioRecibo', sql.VarChar(40), safeString(pedidoHeader.DomicilioRecibo, 40))
      .input('tarifaPrecio', sql.VarChar(10), safeString(pedidoHeader.TarifaPrecio, 10))
      .input('tarifaDescuento', sql.VarChar(10), safeString(pedidoHeader.TarifaDescuento, 10))
      .input('indicadorIva', sql.SmallInt, safeDecimal(pedidoHeader.IndicadorIva, 1))
      .input('grupoIva', sql.SmallInt, safeDecimal(pedidoHeader.GrupoIva, 1))
      .input('codigoTransportista', sql.VarChar(15), safeString(pedidoHeader.CodigoTransportista, 15))
      .input('tipoPortes', sql.VarChar(2), safeString(pedidoHeader.TipoPortes, 2))
      .input('codigoTerritorio', sql.VarChar(10), safeString(pedidoHeader.CodigoTerritorio, 10))
      .input('codVendedor', sql.VarChar(10), safeString(pedidoHeader.CodVendedor, 10))
      .input('vendedor', sql.VarChar(40), safeString(pedidoHeader.Vendedor, 40))
      .input('observacionesProveedor', sql.VarChar(255), safeString(pedidoHeader.ObservacionesProveedor, 255))
      .input('numeroLineas', sql.Int, lineasDetalladas.length)
      .input('importeBruto', sql.Decimal(18,4), baseImponibleTotal)
      .input('importeNetoLineas', sql.Decimal(18,4), baseImponibleTotal)
      .input('importeParcial', sql.Decimal(18,4), baseImponibleTotal)
      .input('baseImponible', sql.Decimal(18,4), baseImponibleTotal)
      .input('totalCuotaIva', sql.Decimal(18,4), totalIva)
      .input('totalIva', sql.Decimal(18,4), totalIva)
      .input('importeLiquido', sql.Decimal(18,4), importeLiquidoTotal)
      .input('ejercicioPedido', sql.SmallInt, ejercicioPrimero)
      .input('seriePedido', sql.VarChar(10), seriePrimero)
      .input('numeroPedido', sql.Int, numeroPrimero)
      .input('suAlbaranNo', sql.VarChar(50), safeString(suAlbaranNo, 50))
      .input('fechaSuAlbaran', sql.Date, fechaSuAlbaran)
      .query(`
        INSERT INTO CabeceraAlbaranProveedor (
          CodigoEmpresa, EjercicioAlbaran, NumeroAlbaran, SerieAlbaran,
          CodigoProveedor, RazonSocial, RazonSocial2, Nombre,
          Domicilio, Domicilio2, CodigoPostal, CodigoMunicipio, Municipio, ColaMunicipio,
          CodigoProvincia, Provincia, CodigoNacion, Nacion,
          CifDni, CifEuropeo, CodigoCondiciones, FormadePago,
          NumeroPlazos, DiasPrimerPlazo, DiasEntrePlazos, DiasFijos1, DiasFijos2, DiasFijos3,
          CodigoContable, RemesaHabitual, CodigoBanco, CodigoAgencia, DC, CCC, IBAN,
          CodigoTransaccion, CodigoTipoEfecto, DomicilioRecibo,
          TarifaPrecio, TarifaDescuento, IndicadorIva, GrupoIva,
          CodigoTransportista, TipoPortes, CodigoTerritorio,
          CodVendedor, Vendedor,
          ObservacionesProveedor,
          NumeroLineas, ImporteBruto, ImporteNetoLineas, ImporteParcial,
          BaseImponible, TotalCuotaIva, TotalIva, ImporteLiquido,
          EjercicioPedido, SeriePedido, NumeroPedido,
          SuAlbaranNo, FechaSuAlbaran,
          FechaAlbaran
        ) VALUES (
          @codigoEmpresa, @ejercicioAlbaran, @numeroAlbaran, @serieAlbaran,
          @codigoProveedor, @razonSocial, @razonSocial2, @nombre,
          @domicilio, @domicilio2, @codigoPostal, @codigoMunicipio, @municipio, @colaMunicipio,
          @codigoProvincia, @provincia, @codigoNacion, @nacion,
          @cifDni, @cifEuropeo, @codigoCondiciones, @formadePago,
          @numeroPlazos, @diasPrimerPlazo, @diasEntrePlazos, @diasFijos1, @diasFijos2, @diasFijos3,
          @codigoContable, @remesaHabitual, @codigoBanco, @codigoAgencia, @dc, @ccc, @iban,
          @codigoTransaccion, @codigoTipoEfecto, @domicilioRecibo,
          @tarifaPrecio, @tarifaDescuento, @indicadorIva, @grupoIva,
          @codigoTransportista, @tipoPortes, @codigoTerritorio,
          @codVendedor, @vendedor,
          @observacionesProveedor,
          @numeroLineas, @importeBruto, @importeNetoLineas, @importeParcial,
          @baseImponible, @totalCuotaIva, @totalIva, @importeLiquido,
          @ejercicioPedido, @seriePedido, @numeroPedido,
          @suAlbaranNo, @fechaSuAlbaran,
          GETDATE()
        )
      `);

    // Insertar líneas del albarán
    for (const linea of lineasDetalladas) {
      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('serieAlbaran', sql.VarChar(10), serieAlbaran)
        .input('codigoArticulo', sql.VarChar(20), safeString(linea.CodigoArticulo, 20))
        .input('descripcionArticulo', sql.VarChar(50), safeString(linea.DescripcionArticulo, 50))
        .input('descripcion2Articulo', sql.VarChar(50), safeString(linea.Descripcion2Articulo, 50))
        .input('descripcionLinea', sql.VarChar(255), safeString(linea.DescripcionLinea, 255))
        .input('codigoAlmacen', sql.VarChar(10), safeString(linea.CodigoAlmacen, 10))
        .input('partida', sql.VarChar(20), safeString(linea.Partida, 20))
        .input('codigodelProveedor', sql.VarChar(15), safeString(linea.CodigodelProveedor, 15))
        .input('codigoFamilia', sql.VarChar(10), safeString(linea.CodigoFamilia, 10))
        .input('codigoSubfamilia', sql.VarChar(10), safeString(linea.CodigoSubfamilia, 10))
        .input('tipoArticulo', sql.VarChar(1), safeString(linea.TipoArticulo, 1))
        .input('largo', sql.Decimal(18,4), safeDecimal(linea.Largo_, 0))
        .input('alto', sql.Decimal(18,4), safeDecimal(linea.Alto_, 0))
        .input('ancho', sql.Decimal(18,4), safeDecimal(linea.Ancho_, 0))
        .input('dimension', sql.Decimal(18,4), safeDecimal(linea.Dimension_, 0))
        .input('codigoAlternativo2', sql.VarChar(20), safeString(linea.CodigoAlternativo2, 20))
        // BUG 8 FIX: unidadMedida1 usa la unidad principal
        .input('unidadMedida1', sql.VarChar(10), linea.unidadMedida1)
        .input('unidadMedida2', sql.VarChar(10), linea.unidadMedida2)
        .input('factorConversion', sql.Decimal(18,4), linea.factorConversion)
        .input('unidadesRecibidas', sql.Decimal(18,4), linea.unidadesParaAlbaranar)
        .input('unidades', sql.Decimal(18,4), linea.unidadesParaAlbaranar)
        .input('unidades2', sql.Decimal(18,4), linea.unidades2)
        // BUG 6 FIX: normalizar vacío a NULL para consistencia
        .input('codigoColor', sql.VarChar(10), linea.codigoColorSafe || null)
        .input('grupoTalla', sql.SmallInt, safeDecimal(linea.GrupoTalla_, 0))
        .input('codigoTalla', sql.VarChar(10), linea.codigoTallaSafe || null)
        .input('grupoIva', sql.TinyInt, linea.grupoIva)
        .input('codigoIva', sql.SmallInt, safeDecimal(linea.CodigoIva, 1))
        .input('ivaIncluido', sql.SmallInt, linea.ivaIncluido)
        .input('porcentajeIva', sql.Decimal(18,4), linea.iva)
        .input('ejercicioPedido', sql.SmallInt, linea.ejercicioPedido)
        .input('seriePedido', sql.VarChar(10), safeString(linea.seriePedido, 10, '0'))
        .input('numeroPedido', sql.Int, linea.numeroPedido)
        .input('orden', sql.SmallInt, linea.ordenPedido)
        .input('precio', sql.Decimal(18,4), linea.precio)
        .input('importeBruto', sql.Decimal(18,4), linea.importeNetoLinea)
        .input('importeNeto', sql.Decimal(18,4), linea.importeNetoLinea)
        .input('baseImponible', sql.Decimal(18,4), linea.importeNetoLinea)
        .input('baseIva', sql.Decimal(18,4), linea.importeNetoLinea)
        .input('cuotaIva', sql.Decimal(18,4), linea.importeIvaLinea)
        .input('totalIva', sql.Decimal(18,4), linea.importeIvaLinea)
        .input('importeLiquido', sql.Decimal(18,4), linea.importeLiquidoLinea)
        .input('acumulaCosteProyectos', sql.SmallInt, -1)
        .query(`
          INSERT INTO LineasAlbaranProveedor (
            CodigoEmpresa, EjercicioAlbaran, NumeroAlbaran, SerieAlbaran,
            CodigoArticulo, DescripcionArticulo, Descripcion2Articulo, DescripcionLinea,
            CodigoAlmacen, Partida, CodigodelProveedor, CodigoFamilia, CodigoSubfamilia,
            TipoArticulo, Largo_, Alto_, Ancho_, Dimension_, CodigoAlternativo2,
            UnidadMedida1_, UnidadMedida2_, FactorConversion_,
            UnidadesRecibidas, Unidades, Unidades2_,
            CodigoColor_, GrupoTalla_, CodigoTalla01_,
            GrupoIva, CodigoIva, IvaIncluido, [%Iva],
            EjercicioPedido, SeriePedido, NumeroPedido, Orden,
            Precio, ImporteBruto, ImporteNeto, BaseImponible, BaseIva, CuotaIva, TotalIva, ImporteLiquido,
            AcumulaCosteProyectos,
            FechaRegistro, FechaAlbaran
          ) VALUES (
            @codigoEmpresa, @ejercicioAlbaran, @numeroAlbaran, @serieAlbaran,
            @codigoArticulo, @descripcionArticulo, @descripcion2Articulo, @descripcionLinea,
            @codigoAlmacen, @partida, @codigodelProveedor, @codigoFamilia, @codigoSubfamilia,
            @tipoArticulo, @largo, @alto, @ancho, @dimension, @codigoAlternativo2,
            @unidadMedida1, @unidadMedida2, @factorConversion,
            @unidadesRecibidas, @unidades, @unidades2,
            @codigoColor, @grupoTalla, @codigoTalla,
            @grupoIva, @codigoIva, @ivaIncluido, @porcentajeIva,
            @ejercicioPedido, @seriePedido, @numeroPedido, @orden,
            @precio, @importeBruto, @importeNeto, @baseImponible, @baseIva, @cuotaIva, @totalIva, @importeLiquido,
            @acumulaCosteProyectos,
            GETDATE(), GETDATE()
          )
        `);
    }

    // Insertar MovimientoStock — un registro por cada línea del albarán
    const periodoAlbaranProv = new Date().getMonth() + 1;
    const codigoUsuarioProv = safeString(req.user?.UsuarioLogicNet || req.user?.CodigoCliente || 'SISTEMA', 50);
    for (const linea of lineasDetalladas) {
      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicioAlbaran)
        .input('periodo', sql.TinyInt, periodoAlbaranProv)
        .input('fecha', sql.DateTime, new Date())
        .input('serie', sql.VarChar(10), serieAlbaran)
        .input('documento', sql.Int, numeroAlbaran)
        .input('codigoArticulo', sql.VarChar(20), safeString(linea.CodigoArticulo, 20))
        .input('codigoAlmacen', sql.VarChar(10), safeString(linea.CodigoAlmacen || ALMACEN_RECEPCION_TEMPORAL, 10))
        .input('partida', sql.VarChar(20), safeString(linea.Partida, 20))
        .input('codigoColor', sql.VarChar(10), linea.codigoColorSafe || null)
        .input('grupoTalla', sql.SmallInt, safeDecimal(linea.GrupoTalla_, 0))
        .input('codigoTalla', sql.VarChar(10), linea.codigoTallaSafe || null)
        .input('unidades', sql.Decimal(18,10), linea.unidadesParaAlbaranar)
        .input('unidadStock', sql.Decimal(18,10), linea.unidadesParaAlbaranar)
        .input('unidadMedida1', sql.VarChar(10), linea.unidadMedida1)
        .input('precio', sql.Decimal(18,10), linea.precio)
        .input('importe', sql.Decimal(18,10), linea.importeNetoLinea)
        .input('unidades2', sql.Decimal(18,10), linea.unidades2)
        .input('unidadMedida2', sql.VarChar(10), linea.unidadMedida2)
        .input('factorConversion', sql.Decimal(18,10), linea.factorConversion)
        .input('codigoProveedor', sql.VarChar(15), safeString(pedidoHeader.CodigoProveedor, 15))
        .input('ubicacion', sql.VarChar(50), safeString(UBICACION_RECEPCION_TEMPORAL, 50))
        .input('statusAcumulado', sql.SmallInt, -1)
        .input('usuarioProceso', sql.VarChar(50), codigoUsuarioProv)
        .input('empresaOrigen', sql.SmallInt, codigoEmpresa)
        .input('ejercicioDocumento', sql.SmallInt, ejercicioAlbaran)
        .input('origenMovimiento', sql.VarChar(1), 'B')
        .input('tipoMovimiento', sql.SmallInt, 1)
        .input('comentario', sql.VarChar(255), `Albarán compra:${ejercicioAlbaran}/${serieAlbaran}/${numeroAlbaran}`)
        .query(`
          INSERT INTO MovimientoStock (
            CodigoEmpresa, Ejercicio, Periodo, Fecha, FechaRegistro,
            Serie, Documento,
            CodigoArticulo, CodigoAlmacen, Partida,
            CodigoColor_, GrupoTalla_, CodigoTalla01_,
            Unidades, UnidadStock, UnidadMedida1_,
            Precio, Importe,
            Unidades2_, UnidadMedida2_, FactorConversion_,
            CodigoProveedor,
            Ubicacion,
            StatusAcumulado,
            MovPosicion, MovOrigen, Proceso,
            MovTraspaso, MovConsumo, MovIdentificador,
            UsuarioProceso, EmpresaOrigen,
            EjercicioDocumento,
            OrigenMovimiento, TipoMovimiento,
            Comentario
          ) VALUES (
            @codigoEmpresa, @ejercicio, @periodo, @fecha, GETDATE(),
            @serie, @documento,
            @codigoArticulo, @codigoAlmacen, @partida,
            @codigoColor, @grupoTalla, @codigoTalla,
            @unidades, @unidadStock, @unidadMedida1,
            @precio, @importe,
            @unidades2, @unidadMedida2, @factorConversion,
            @codigoProveedor,
            @ubicacion,
            @statusAcumulado,
            NEWID(), NEWID(), NEWID(),
            '00000000-0000-0000-0000-000000000000',
            '00000000-0000-0000-0000-000000000000',
            '00000000-0000-0000-0000-000000000000',
            @usuarioProceso, @empresaOrigen,
            @ejercicioDocumento,
            @origenMovimiento, @tipoMovimiento,
            @comentario
          )
        `);
    }

    // Actualizar estado de cada pedido — BUG 11 FIX: Estado=2 cabecera solo aquí
    for (const pedidoInfo of pedidosPorProcesar) {
      const { ejercicio, serie, numero } = pedidoInfo;
      const pendientesResult = await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('numero', sql.Int, numero)
        .input('serie', sql.VarChar, serie)
        .query(`
          SELECT ISNULL(SUM(
            CASE WHEN lp.UnidadesRecibidas > ISNULL(la.TotalAlbaranado, 0)
                 THEN lp.UnidadesRecibidas - ISNULL(la.TotalAlbaranado, 0)
                 ELSE 0 END
          ), 0) as totalPendientesAlbaranar
          FROM LineasPedidoProveedor lp
          OUTER APPLY (
            SELECT SUM(la.UnidadesRecibidas) as TotalAlbaranado
            FROM LineasAlbaranProveedor la
            WHERE la.CodigoEmpresa = lp.CodigoEmpresa
              AND la.EjercicioPedido = lp.EjercicioPedido
              AND la.NumeroPedido = lp.NumeroPedido
              AND la.Orden = lp.Orden
              AND la.CodigoArticulo = lp.CodigoArticulo
              AND ISNULL(la.CodigoColor_, '') = ISNULL(lp.CodigoColor_, '')
              AND ISNULL(la.CodigoTalla01_, '') = ISNULL(lp.CodigoTalla01_, '')
          ) la
          WHERE lp.CodigoEmpresa = @codigoEmpresa
            AND lp.EjercicioPedido = @ejercicio
            AND lp.NumeroPedido = @numero
            AND (lp.SeriePedido = @serie OR (@serie = '0' AND (lp.SeriePedido IS NULL OR lp.SeriePedido = '' OR lp.SeriePedido = '0')))
        `);
      const totalPendientesAlbaranar = safeDecimal(pendientesResult.recordset[0]?.totalPendientesAlbaranar, 0);
      if (totalPendientesAlbaranar <= 0) {
        await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.SmallInt, ejercicio)
          .input('numero', sql.Int, numero)
          .input('serie', sql.VarChar, serie)
          .query(`
            UPDATE CabeceraPedidoProveedor
            SET Estado = 2
            WHERE CodigoEmpresa = @codigoEmpresa
              AND EjercicioPedido = @ejercicio
              AND NumeroPedido = @numero
              AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
          `);
        console.log(`[ALBARAN PROVEEDOR] Pedido ${ejercicio}/${serie}/${numero} actualizado a Estado=2.`);
      }
    }

    await transaction.commit();

    res.json({
      success: true,
      mensaje: 'Albarán generado correctamente.',
      albaran: {
        ejercicio: ejercicioAlbaran,
        numero: numeroAlbaran,
        serie: serieAlbaran,
        fecha: new Date().toISOString().split('T')[0],
        proveedor: { codigo: pedidoHeader.CodigoProveedor, nombre: pedidoHeader.RazonSocial },
        totalLineas: lineasDetalladas.length,
        totalUnidades,
        importes: { neto: baseImponibleTotal, iva: totalIva, liquido: importeLiquidoTotal },
        pedidosIncluidos: pedidosPorProcesar.length,
        suAlbaranNo,
        fechaSuAlbaran
      }
    });
  } catch (err) {
    try {
      if (transaction && !transaction._aborted) await transaction.rollback();
    } catch (e) { console.warn('Rollback falló:', e.message); }
    console.error('[ERROR ALBARÁN PROVEEDOR]', err);
    res.status(500).json({ success: false, mensaje: `Error: ${err.message}`, error: err.message });
  }
});

  return router;
};