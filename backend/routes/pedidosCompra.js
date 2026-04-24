const express = require('express');

module.exports = function createpedidosCompraRouter({ sql, getPool }) {
  const router = express.Router();
  const ALMACEN_RECEPCION_TEMPORAL = 'PTO';
  const UBICACION_RECEPCION_TEMPORAL = 'RECEPCION';

  function safeString(value, maxLength = 10, defaultValue = '') {
    if (value === null || value === undefined || value === 'null' || value === 'undefined') {
      return defaultValue;
    }

    let str = String(value).trim();

    if (str.length > 0 && str.length % 2 === 0) {
      const mitad = Math.floor(str.length / 2);
      const primeraMitad = str.substring(0, mitad);
      const segundaMitad = str.substring(mitad);

      if (primeraMitad === segundaMitad) {
        str = primeraMitad;
      }
    }

    if (str === 'BOLSAS' || str === 'BOLSASBOLSAS') {
      str = 'BOLSA';
    }

    const cleaned = str.replace(/[,]/g, '').trim();

    if (maxLength > 0 && cleaned.length > maxLength) {
      return cleaned.substring(0, maxLength);
    }

    return cleaned === '' ? defaultValue : cleaned;
  }

  function safeDecimal(value, defaultValue = 0) {
    if (value === null || value === undefined || value === 'null' || value === 'undefined') {
      return defaultValue;
    }

    const num = parseFloat(value);
    return Number.isNaN(num) ? defaultValue : num;
  }

  async function obtenerSiguienteNumeroAlbaranProveedor(transaction, codigoEmpresa) {
    const ejercicioAlbaran = new Date().getFullYear();
    const nombreContador = 'ALBARAN_PRO';

    const contadorResult = await new sql.Request(transaction)
      .input('ejercicio', sql.Int, ejercicioAlbaran)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT sysContadorValor
        FROM lsysContadores
        WHERE sysEjercicio = @ejercicio
          AND sysNombreContador = '${nombreContador}'
          AND sysGrupo = @codigoEmpresa
      `);

    const maximoResult = await new sql.Request(transaction)
      .input('ejercicio', sql.SmallInt, ejercicioAlbaran)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT ISNULL(MAX(NumeroAlbaran), 0) AS maxNumero
        FROM CabeceraAlbaranProveedor
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
      `);

    const siguientePorCabecera = (parseInt(maximoResult.recordset[0]?.maxNumero, 10) || 0) + 1;
    const siguientePorContador = parseInt(contadorResult.recordset[0]?.sysContadorValor, 10) || 0;
    const numeroAlbaran = Math.max(siguientePorContador, siguientePorCabecera, 1);
    const nuevoValorContador = numeroAlbaran + 1;

    if (contadorResult.recordset.length === 0) {
      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.Int, ejercicioAlbaran)
        .input('nuevoValorContador', sql.Int, nuevoValorContador)
        .query(`
          INSERT INTO lsysContadores (sysGrupo, sysEjercicio, sysNombreContador, sysContadorValor)
          VALUES (@codigoEmpresa, @ejercicio, '${nombreContador}', @nuevoValorContador)
        `);
    } else {
      await new sql.Request(transaction)
        .input('nuevoValorContador', sql.Int, nuevoValorContador)
        .input('ejercicio', sql.Int, ejercicioAlbaran)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .query(`
          UPDATE lsysContadores
          SET sysContadorValor = @nuevoValorContador
          WHERE sysEjercicio = @ejercicio
            AND sysNombreContador = '${nombreContador}'
            AND sysGrupo = @codigoEmpresa
        `);
    }

    return { ejercicioAlbaran, numeroAlbaran };
  }

async function actualizarStockPorVariante(
  transaction, codigoEmpresa, codigoArticulo, almacen, ubicacion,
  unidades, codigoColor, codigoTalla, comentario, codigoCliente,
  precio, unidadMedida2, factorConversion
) {
  const ejercicio = new Date().getFullYear();
  
  // Usar safeString para unidadMedida2
  const unidadMedida2Safe = safeString(unidadMedida2, 10, '');
  
  console.log(`[STOCK] Actualizando stock: ${codigoArticulo}, Unidades: ${unidades}, UnidadMedida: '${unidadMedida2Safe}'`);
  
  const existeUbicacion = await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)
    .input('almacen', sql.VarChar, safeString(almacen, 10, ''))
    .input('ubicacion', sql.VarChar, safeString(ubicacion, 10, ''))
    .input('articulo', sql.VarChar, safeString(codigoArticulo, 20, ''))
    .input('color', sql.VarChar, safeString(codigoColor, 10, ''))
    .input('talla', sql.VarChar, safeString(codigoTalla, 10, ''))
    .query(`
      SELECT UnidadSaldo 
      FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio = @ejercicio
        AND CodigoAlmacen = @almacen
        AND Ubicacion = @ubicacion
        AND CodigoArticulo = @articulo
        AND (CodigoColor_ = @color OR (CodigoColor_ IS NULL AND @color = ''))
        AND (CodigoTalla01_ = @talla OR (CodigoTalla01_ IS NULL AND @talla = ''))
        AND Periodo = 99
    `);

  if (existeUbicacion.recordset.length > 0) {
    const nuevoStock = parseFloat(existeUbicacion.recordset[0].UnidadSaldo) + unidades;
    
    await new sql.Request(transaction)
      .input('nuevoStock', sql.Decimal(18, 4), nuevoStock)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('almacen', sql.VarChar, safeString(almacen, 10, ''))
      .input('ubicacion', sql.VarChar, safeString(ubicacion, 10, ''))
      .input('articulo', sql.VarChar, safeString(codigoArticulo, 20, ''))
      .input('color', sql.VarChar, safeString(codigoColor, 10, ''))
      .input('talla', sql.VarChar, safeString(codigoTalla, 10, ''))
      .query(`
        UPDATE AcumuladoStockUbicacion
        SET UnidadSaldo = @nuevoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND CodigoAlmacen = @almacen
          AND Ubicacion = @ubicacion
          AND CodigoArticulo = @articulo
          AND (CodigoColor_ = @color OR (CodigoColor_ IS NULL AND @color = ''))
          AND (CodigoTalla01_ = @talla OR (CodigoTalla01_ IS NULL AND @talla = ''))
          AND Periodo = 99
      `);
  } else {
    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('almacen', sql.VarChar, safeString(almacen, 10, ''))
      .input('ubicacion', sql.VarChar, safeString(ubicacion, 10, ''))
      .input('articulo', sql.VarChar, safeString(codigoArticulo, 20, ''))
      .input('color', sql.VarChar, safeString(codigoColor, 10, ''))
      .input('talla', sql.VarChar, safeString(codigoTalla, 10, ''))
      .input('stock', sql.Decimal(18, 4), unidades)
      .query(`
        INSERT INTO AcumuladoStockUbicacion (
          CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
          CodigoArticulo, CodigoColor_, CodigoTalla01_,
          UnidadSaldo, Periodo
        ) VALUES (
          @codigoEmpresa, @ejercicio, @almacen, @ubicacion,
          @articulo, @color, @talla,
          @stock, 99
        )
      `);
  }

  await actualizarAcumuladoStockGeneral(
    transaction, codigoEmpresa, codigoArticulo, almacen,
    unidades, codigoColor, codigoTalla
  );

  await registrarMovimientoStock(
    transaction, codigoEmpresa, codigoArticulo, almacen, ubicacion,
    unidades, codigoColor, codigoTalla, comentario, codigoCliente,
    precio, unidadMedida2Safe, factorConversion
  );
}

// ✅ Función registrarMovimientoStock (COMPLETA Y CORREGIDA)
async function registrarMovimientoStock(
  transaction, codigoEmpresa, codigoArticulo, almacen, ubicacion,
  unidades, codigoColor, codigoTalla, comentario, codigoCliente,
  precio, unidadMedida2, factorConversion
) {
  const ejercicio = new Date().getFullYear();
  
  // Usar safeString para todos los campos de texto
  const unidadMedida2Safe = safeString(unidadMedida2, 10, '');
  const codigoColorSafe = safeString(codigoColor, 10, '');
  const codigoTallaSafe = safeString(codigoTalla, 10, '');
  const comentarioSafe = safeString(comentario, 255, 'RECEPCIÓN');
  const codigoClienteSafe = safeString(codigoCliente, 20, 'SISTEMA');
  
  // Calcular valores
  const unidadesNum = parseFloat(unidades) || 0;
  const factorConversionNum = parseFloat(factorConversion) || 1;
  const unidades2 = unidadesNum * factorConversionNum;
  const precioNum = parseFloat(precio) || 0;
  const importe = precioNum * unidadesNum;
  
  console.log(`[MOVIMIENTO STOCK] Insertando: ${codigoArticulo}, Unidades: ${unidadesNum}, UnidadMedida: '${unidadMedida2Safe}'`);
  
  // Obtener GrupoTalla_ del artículo si no se proporciona
  let grupoTalla = 0;
  if (!codigoTalla || codigoTalla === '') {
    try {
      const articuloResult = await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoArticulo', sql.VarChar, safeString(codigoArticulo, 20, ''))
        .query(`
          SELECT GrupoTalla_ FROM Articulos 
          WHERE CodigoEmpresa = @codigoEmpresa 
          AND CodigoArticulo = @codigoArticulo
        `);
      
      if (articuloResult.recordset.length > 0) {
        grupoTalla = parseFloat(articuloResult.recordset[0].GrupoTalla_) || 0;
      }
    } catch (error) {
      console.warn(`[ADVERTENCIA] Error obteniendo GrupoTalla_: ${error.message}`);
    }
  }
  
  // Insertar movimiento de stock
  await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)
    .input('almacen', sql.VarChar, safeString(almacen, 10, ''))
    .input('ubicacion', sql.VarChar, safeString(ubicacion, 10, ''))
    .input('articulo', sql.VarChar, safeString(codigoArticulo, 20, ''))
    .input('unidades', sql.Decimal(18, 4), unidadesNum)
    .input('color', sql.VarChar, codigoColorSafe)
    .input('grupoTalla', sql.SmallInt, grupoTalla)
    .input('talla', sql.VarChar, codigoTallaSafe)
    .input('comentario', sql.VarChar, comentarioSafe)
    .input('codigoCliente', sql.VarChar, codigoClienteSafe)
    .input('precio', sql.Decimal(18, 4), precioNum)
    .input('importe', sql.Decimal(18, 4), importe)
    .input('unidades2', sql.Decimal(18, 4), unidades2)
    .input('unidadMedida1', sql.VarChar, unidadMedida2Safe)
    .input('unidadMedida2', sql.VarChar, unidadMedida2Safe)
    .input('factorConversion', sql.Decimal(18, 4), factorConversionNum)
    .input('precioMedio', sql.Decimal(18, 4), precioNum)
    .query(`
      INSERT INTO MovimientoStock (
        CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
        CodigoArticulo, Unidades, CodigoColor_, GrupoTalla_, CodigoTalla01_,
        TipoMovimiento, Comentario, CodigoCliente,
        Precio, Importe, Unidades2_,
        UnidadMedida1_, UnidadMedida2_, FactorConversion_,
        PrecioMedio, FechaRegistro
      ) VALUES (
        @codigoEmpresa, @ejercicio, @almacen, @ubicacion,
        @articulo, @unidades, @color, @grupoTalla, @talla,
        1, @comentario, @codigoCliente,
        @precio, @importe, @unidades2,
        @unidadMedida1, @unidadMedida2, @factorConversion,
        @precioMedio, GETDATE()
      )
    `);
  
  console.log(`[MOVIMIENTO STOCK] Insertado correctamente: ${codigoArticulo}, Unidades: ${unidadesNum}, UnidadMedida: '${unidadMedida2Safe}'`);
}

// ✅ Función actualizarAcumuladoStockGeneral (COMPLETA)
async function actualizarAcumuladoStockGeneral(
  transaction, codigoEmpresa, codigoArticulo, almacen,
  unidades, codigoColor, codigoTalla
) {
  const ejercicio = new Date().getFullYear();
  
  const existeStock = await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.Int, ejercicio)
    .input('almacen', sql.VarChar, safeString(almacen, 10, ''))
    .input('articulo', sql.VarChar, safeString(codigoArticulo, 20, ''))
    .input('color', sql.VarChar, safeString(codigoColor, 10, ''))
    .input('talla', sql.VarChar, safeString(codigoTalla, 10, ''))
    .query(`
      SELECT UnidadSaldo 
      FROM AcumuladoStock
      WHERE CodigoEmpresa = @codigoEmpresa
        AND Ejercicio = @ejercicio
        AND CodigoAlmacen = @almacen
        AND CodigoArticulo = @articulo
        AND (CodigoColor_ = @color OR (CodigoColor_ IS NULL AND @color = ''))
        AND (CodigoTalla01_ = @talla OR (CodigoTalla01_ IS NULL AND @talla = ''))
        AND Periodo = 99
    `);

  if (existeStock.recordset.length > 0) {
    const nuevoStock = parseFloat(existeStock.recordset[0].UnidadSaldo) + unidades;
    
    await new sql.Request(transaction)
      .input('nuevoStock', sql.Decimal(18, 4), nuevoStock)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('almacen', sql.VarChar, safeString(almacen, 10, ''))
      .input('articulo', sql.VarChar, safeString(codigoArticulo, 20, ''))
      .input('color', sql.VarChar, safeString(codigoColor, 10, ''))
      .input('talla', sql.VarChar, safeString(codigoTalla, 10, ''))
      .query(`
        UPDATE AcumuladoStock
        SET UnidadSaldo = @nuevoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND Ejercicio = @ejercicio
          AND CodigoAlmacen = @almacen
          AND CodigoArticulo = @articulo
          AND (CodigoColor_ = @color OR (CodigoColor_ IS NULL AND @color = ''))
          AND (CodigoTalla01_ = @talla OR (CodigoTalla01_ IS NULL AND @talla = ''))
          AND Periodo = 99
      `);
  } else {
    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.Int, ejercicio)
      .input('almacen', sql.VarChar, safeString(almacen, 10, ''))
      .input('articulo', sql.VarChar, safeString(codigoArticulo, 20, ''))
      .input('color', sql.VarChar, safeString(codigoColor, 10, ''))
      .input('talla', sql.VarChar, safeString(codigoTalla, 10, ''))
      .input('stock', sql.Decimal(18, 4), unidades)
      .query(`
        INSERT INTO AcumuladoStock (
          CodigoEmpresa, Ejercicio, CodigoAlmacen,
          CodigoArticulo, CodigoColor_, CodigoTalla01_,
          UnidadSaldo, Periodo
        ) VALUES (
          @codigoEmpresa, @ejercicio, @almacen,
          @articulo, @color, @talla,
          @stock, 99
        )
      `);
  }
}

// ✅ 1. LISTAR PEDIDOS DE COMPRA (PAGINADO)
router.get('/pedidos-compra', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  
  // Parámetros de paginación
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
    
    // Contar total de pedidos (para paginación)
    const countResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioActual', sql.SmallInt, new Date().getFullYear())
      .query(`
        SELECT COUNT(DISTINCT cp.NumeroPedido) as total
        FROM CabeceraPedidoProveedor cp
        WHERE cp.CodigoEmpresa = @codigoEmpresa
          AND cp.EjercicioPedido = @ejercicioActual
          AND cp.Estado = 0  -- Solo pendientes
      `);
    
    const totalPedidos = countResult.recordset[0].total;
    const totalPages = Math.ceil(totalPedidos / limit);

    // Consulta paginada
    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioActual', sql.SmallInt, new Date().getFullYear())
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
          AND cp.EjercicioPedido = @ejercicioActual
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
    
    // 1. OBTENER CABECERA DEL PEDIDO
    const cabeceraQuery = `
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
    `;
    
    const cabeceraResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(cabeceraQuery);

    if (cabeceraResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Pedido no encontrado.' 
      });
    }

    const cabecera = cabeceraResult.recordset[0];
    
    // 2. OBTENER LÍNEAS PRINCIPALES DEL PEDIDO
    const lineasQuery = `
      SELECT 
        lp.*,
        a.DescripcionArticulo,
        a.Descripcion2Articulo,
        a.UnidadMedida2_,
        a.UnidadMedidaAlternativa_,
        a.FactorConversion_,
        a.Colores_,
        a.GrupoTalla_,
        -- Calcular porcentaje recepcionado
        CASE 
          WHEN lp.UnidadesPedidas > 0 
          THEN (lp.UnidadesRecibidas / lp.UnidadesPedidas) * 100
          ELSE 0
        END AS PorcentajeRecepcionado,
        -- Determinar estado de la línea
        CASE 
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
    `;
    
    const lineasResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(lineasQuery);

    const lineasConVariantes = [];

    // 3. PARA CADA LÍNEA, OBTENER DESGLOSE DE VARIANTES (COLORES/TALLAS)
    for (const linea of lineasResult.recordset) {
      const lineaConVariantes = { ...linea, variantes: [] };
      
      // Solo buscar variantes si el artículo tiene colores o tallas
      if (linea.Colores_ === -1 || (linea.GrupoTalla_ && linea.GrupoTalla_ !== '')) {
        const variantesQuery = `
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
        `;
        
        const variantesResult = await getPool().request()
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.SmallInt, ejercicio)
          .input('numero', sql.Int, numero)
          .input('movPosicionLinea', sql.VarChar, linea.LineasPosicion)
          .query(variantesQuery);
        
        // Procesar cada variante
        for (const variante of variantesResult.recordset) {
          const varianteData = {
            codigoColor: variante.CodigoColor_,
            nombreColor: variante.NombreColor,
            grupoTalla: variante.GrupoTalla_ || '',
            descripcionGrupoTalla: variante.DescripcionGrupoTalla_ || '',
            unidadesTotal: variante.UnidadesTotalTallas_ || 0,
            unidadesPorTalla: {}
          };
          
          // Solo obtener tallas si hay un grupo de tallas válido
          if (variante.GrupoTalla_ && variante.GrupoTalla_.toString().trim() !== '') {
            try {
              const grupoTallasQuery = `
                SELECT CodigoTalla_, DescripcionTalla_, Orden_
                FROM Tallas_
                WHERE CodigoEmpresa = @codigoEmpresa
                  AND GrupoTalla_ = @grupoTalla
                  AND Activo_ = 1
                ORDER BY Orden_
              `;
              
              const grupoTallasResult = await getPool().request()
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('grupoTalla', sql.VarChar, variante.GrupoTalla_.toString())
                .query(grupoTallasQuery);
              
              // Mapear las unidades por talla
              const totalTallas = {
                '01': variante.UnidadesTalla01_ || 0,
                '02': variante.UnidadesTalla02_ || 0,
                '03': variante.UnidadesTalla03_ || 0,
                '04': variante.UnidadesTalla04_ || 0,
                '05': variante.UnidadesTalla05_ || 0,
                '06': variante.UnidadesTalla06_ || 0,
                '07': variante.UnidadesTalla07_ || 0,
                '08': variante.UnidadesTalla08_ || 0,
                '09': variante.UnidadesTalla09_ || 0,
                '10': variante.UnidadesTalla10_ || 0
              };
              
              grupoTallasResult.recordset.forEach((talla, index) => {
                const numeroTalla = (index + 1).toString().padStart(2, '0');
                varianteData.unidadesPorTalla[talla.CodigoTalla_] = {
                  codigo: talla.CodigoTalla_,
                  nombre: talla.DescripcionTalla_,
                  unidades: totalTallas[numeroTalla] || 0,
                  orden: talla.Orden_ || 0
                };
              });
            } catch (error) {
              console.warn(`[ADVERTENCIA] Error obteniendo tallas para grupo ${variante.GrupoTalla_}:`, error.message);
              // Continuamos sin las tallas, pero mantenemos la variante
            }
          }
          
          lineaConVariantes.variantes.push(varianteData);
        }
      }
      
      // Determinar tipo de variante de la línea
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

// ✅ 3. VARIANTES DISPONIBLES PARA ARTÍCULO
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
    // Obtener información del artículo
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

    // Obtener colores si el artículo los tiene
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

    // Obtener tallas si el artículo las tiene
    if (articulo.GrupoTalla_ && articulo.GrupoTalla_ !== '') {
      const tallasResult = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('grupoTalla', sql.VarChar, articulo.GrupoTalla_)
        .query(`
          SELECT 
            CodigoTalla_ as codigo,
            DescripcionTalla_ as nombre,
            GrupoTalla_ as grupo,
            Orden_
          FROM Tallas_
          WHERE CodigoEmpresa = @codigoEmpresa
            AND GrupoTalla_ = @grupoTalla
            AND Activo_ = 1
          ORDER BY Orden_
        `);
      
      resultado.tallas = tallasResult.recordset;
      
      // Si hay colores, generar combinaciones
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
        // Solo tallas
        resultado.combinaciones = resultado.tallas.map(talla => ({
          codigoColor: '',
          nombreColor: '',
          codigoTalla: talla.codigo,
          nombreTalla: talla.nombre,
          grupoTalla: talla.grupo
        }));
      }
    } else if (articulo.Colores_ === -1) {
      // Solo colores
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

// ✅ 4. PROCESAR RECEPCIÓN DE PEDIDO - COMPLETO CON TODOS LOS CAMPOS (CORREGIDO)
router.post('/pedidos-compra/:ejercicio/:serie/:numero/recepcionar', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const codigoCliente = req.user.CodigoCliente || req.user.UsuarioLogicNet || 'SISTEMA';
  const { ejercicio, serie, numero } = req.params;
  const { 
    lineasRecepcion, 
    comentarioRecepcion 
  } = req.body;
  const almacen = ALMACEN_RECEPCION_TEMPORAL;
  const ubicacion = UBICACION_RECEPCION_TEMPORAL;

  console.log('📥 DATOS RECIBIDOS EN BACKEND:');
  console.log('- Empresa:', codigoEmpresa);
  console.log('- Cliente:', codigoCliente);
  console.log('- Pedido:', `${ejercicio}/${serie || '0'}/${numero}`);
  console.log('- Almacén:', almacen);
  console.log('- Ubicación:', ubicacion);
  console.log('- Comentario:', comentarioRecepcion);
  console.log('- LineasRecepcion:', JSON.stringify(lineasRecepcion, null, 2));

  if (!codigoEmpresa || !ejercicio || !numero) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Parámetros del pedido requeridos.' 
    });
  }

  if (!lineasRecepcion || !Array.isArray(lineasRecepcion) || lineasRecepcion.length === 0) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Debe especificar al menos una línea.' 
    });
  }

  const transaction = new sql.Transaction(getPool());

  try {
    await transaction.begin();
    console.log(`[RECEPCIÓN] Iniciando recepción para pedido ${numero}`);

    // 1. Verificar pedido
    const pedidoResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serie || '0')
      .query(`
        SELECT Estado, CodigoProveedor, RazonSocial
        FROM CabeceraPedidoProveedor
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numero
          AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
      `);

    if (pedidoResult.recordset.length === 0) {
      throw new Error('Pedido no encontrado.');
    }

    const pedido = pedidoResult.recordset[0];
    if (pedido.Estado !== 0) {
      throw new Error('El pedido no está en estado pendiente.');
    }

    const resultadosRecepcion = [];

    // 2. Procesar cada línea
    for (const recepcion of lineasRecepcion) {
      // VALORES POR DEFECTO
      const orden = recepcion.Orden !== undefined ? recepcion.Orden : 
                   (recepcion.orden !== undefined ? recepcion.orden : 0);
      
      const codigoArticulo = recepcion.codigoArticulo || recepcion.CodigoArticulo;
      const unidadesRecepcionar = recepcion.unidadesRecepcionar || 0;
      const variantes = recepcion.variantes || [];

      console.log(`[RECEPCIÓN] Procesando: Artículo ${codigoArticulo}, Orden ${orden}, Unidades ${unidadesRecepcionar}`);

      // Validaciones básicas
      if (!codigoArticulo) {
        throw new Error(`Falta código de artículo`);
      }
      
      if (!unidadesRecepcionar || parseFloat(unidadesRecepcionar) <= 0) {
        throw new Error(`Debe especificar unidades a recepcionar`);
      }

      // Buscar línea por código de artículo
      let query = `
        SELECT 
          lp.*,
          a.DescripcionArticulo,
          a.Colores_,
          a.GrupoTalla_,
          a.UnidadMedida2_,
          a.UnidadMedidaAlternativa_,
          a.FactorConversion_,
          a.PrecioCompra  -- CORRECCIÓN: Usar PrecioCompra en lugar de PrecioMedio
        FROM LineasPedidoProveedor lp
        LEFT JOIN Articulos a 
          ON a.CodigoArticulo = lp.CodigoArticulo
          AND a.CodigoEmpresa = lp.CodigoEmpresa
        WHERE lp.CodigoEmpresa = @codigoEmpresa
          AND lp.EjercicioPedido = @ejercicio
          AND lp.NumeroPedido = @numero
          AND (lp.SeriePedido = @serie OR (@serie = '0' AND (lp.SeriePedido IS NULL OR lp.SeriePedido = '' OR lp.SeriePedido = '0')))
          AND lp.CodigoArticulo = @codigoArticulo
      `;

      // Si orden > 0, lo usamos como filtro adicional
      if (orden > 0) {
        query += ` AND lp.Orden = @orden`;
      }

      query += ` ORDER BY lp.Orden`;

      const request = new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('numero', sql.Int, numero)
        .input('serie', sql.VarChar, serie || '0')
        .input('codigoArticulo', sql.VarChar, codigoArticulo);

      if (orden > 0) {
        request.input('orden', sql.Int, orden);
      }

      const lineaResult = await request.query(query);

      if (lineaResult.recordset.length === 0) {
        throw new Error(`Artículo ${codigoArticulo} no encontrado en el pedido`);
      }

      // Tomar la primera línea que coincida
      const linea = lineaResult.recordset[0];
      const lineaOrden = linea.Orden;
      const unidadesPendientes = parseFloat(linea.UnidadesPendientes) || 0;
      const unidadesRecepcionarNum = parseFloat(unidadesRecepcionar) || 0;

      // Validar unidades
      if (unidadesRecepcionarNum > unidadesPendientes) {
        throw new Error(`No se pueden recepcionar ${unidadesRecepcionarNum} unidades. Pendientes: ${unidadesPendientes}`);
      }

      // ✅ CORRECCIÓN: Obtener datos necesarios para las funciones auxiliares
      const precio = parseFloat(linea.Precio) || 0;
      const factorConversion = parseFloat(linea.FactorConversion_) || 1;

      // ✅ CORRECCIÓN: Obtener unidadMedida2 de forma SEGURA
      let unidadMedida2 = '';
      if (linea.UnidadMedida2_ !== undefined && linea.UnidadMedida2_ !== null) {
        // Si existe, convertir a string y limpiar
        unidadMedida2 = String(linea.UnidadMedida2_).trim();
        // Eliminar comas si las hay
        unidadMedida2 = unidadMedida2.replace(/[,]/g, '');
      }

      // Si queda vacío o es 'null'/'undefined', dejamos cadena vacía
      if (unidadMedida2 === 'null' || unidadMedida2 === 'undefined' || unidadMedida2 === '') {
        unidadMedida2 = '';
      }

      // Actualizar stock (con o sin variantes)
      if (variantes.length > 0) {
        const totalVariantes = variantes.reduce((sum, v) => sum + (parseFloat(v.unidades) || 0), 0);
        
        if (Math.abs(totalVariantes - unidadesRecepcionarNum) > 0.001) {
          throw new Error(`Suma de variantes (${totalVariantes}) no coincide con unidades a recepcionar (${unidadesRecepcionarNum})`);
        }

        for (const variante of variantes) {
          const unidadesVariante = parseFloat(variante.unidades) || 0;
          if (unidadesVariante > 0) {
            await actualizarStockPorVariante(
              transaction,
              codigoEmpresa,
              codigoArticulo,
              almacen,
              ubicacion,
              unidadesVariante,
              variante.codigoColor || '',
              variante.codigoTalla || '',
              `RECEPCIÓN PEDIDO ${numero}`,
              codigoCliente,
              precio,
              unidadMedida2,
              factorConversion
            );
          }
        }
      } else {
        await actualizarStockPorVariante(
          transaction,
          codigoEmpresa,
          codigoArticulo,
          almacen,
          ubicacion,
          unidadesRecepcionarNum,
          linea.CodigoColor_ || '',
          linea.CodigoTalla01_ || '',
          `RECEPCIÓN PEDIDO ${numero}`,
          codigoCliente,
          precio,
          unidadMedida2,
          factorConversion
        );
      }

      // Actualizar línea del pedido - CORRECCIÓN: Actualizar Unidades2_ también
      const nuevasUnidadesRecibidas = parseFloat(linea.UnidadesRecibidas) + unidadesRecepcionarNum;
      const nuevasUnidadesPendientes = Math.max(0, unidadesPendientes - unidadesRecepcionarNum);
      const nuevasUnidades2 = nuevasUnidadesRecibidas * factorConversion;

      await new sql.Request(transaction)
        .input('nuevasRecibidas', sql.Decimal(18, 4), nuevasUnidadesRecibidas)
        .input('nuevasPendientes', sql.Decimal(18, 4), nuevasUnidadesPendientes)
        .input('nuevasUnidades2', sql.Decimal(18, 4), nuevasUnidades2)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('numero', sql.Int, numero)
        .input('serie', sql.VarChar, serie || '0')
        .input('orden', sql.Int, lineaOrden)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .query(`
          UPDATE LineasPedidoProveedor
          SET 
            UnidadesRecibidas = @nuevasRecibidas,
            UnidadesPendientes = @nuevasPendientes,
            Unidades2_ = @nuevasUnidades2  -- CORRECCIÓN: Actualizar Unidades2_
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND NumeroPedido = @numero
            AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
            AND Orden = @orden
            AND CodigoArticulo = @codigoArticulo
        `);

      resultadosRecepcion.push({
        orden: lineaOrden,
        codigoArticulo,
        descripcion: linea.DescripcionArticulo,
        unidadesRecepcionadas: unidadesRecepcionarNum,
        unidadesPreviasRecibidas: parseFloat(linea.UnidadesRecibidas),
        unidadesNuevasRecibidas: nuevasUnidadesRecibidas,
        unidadesPendientesRestantes: nuevasUnidadesPendientes,
        tieneVariantes: variantes.length > 0,
        variantesProcesadas: variantes
      });
    }

    const pendientesResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serie || '0')
      .query(`
        SELECT ISNULL(SUM(UnidadesPendientes), 0) as totalPendientes
        FROM LineasPedidoProveedor
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numero
          AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
      `);

    const totalPendientes = safeDecimal(pendientesResult.recordset[0]?.totalPendientes, 0);
    const pedidoCompleto = totalPendientes <= 0;

    await new sql.Request(transaction)
      .input('nuevoEstado', sql.SmallInt, pedidoCompleto ? 2 : 0)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serie || '0')
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
      mensaje: 'Recepción procesada correctamente.',
      resultados: resultadosRecepcion,
      autoGenerarAlbaran: pedidoCompleto,
      pedido: {
        ejercicio,
        serie: serie || '0',
        numero,
        proveedor: pedido.RazonSocial,
        estado: pedidoCompleto ? 2 : 0,
        unidadesPendientes: totalPendientes
      },
      recepcion: {
        almacen,
        ubicacion,
        pedidoCompleto
      }
    });

  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR PROCESAR RECEPCIÓN]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al procesar la recepción.',
      error: err.message
    });
  }
});

// ✅ 6. BUSCAR PEDIDOS CON FILTROS
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
  
  const offset = (parseInt(page) - 1) * parseInt(limit);

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    // Construir condiciones WHERE
    let condiciones = ['cp.CodigoEmpresa = @codigoEmpresa'];
    const request = getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('estado', sql.SmallInt, parseInt(estado));

    // Filtro por proveedor
    if (proveedor) {
      condiciones.push('(cp.CodigoProveedor LIKE @proveedor OR cp.RazonSocial LIKE @proveedor)');
      request.input('proveedor', sql.VarChar, `%${proveedor}%`);
    }

    // Filtro por número de pedido
    if (numeroPedido) {
      condiciones.push('cp.NumeroPedido = @numeroPedido');
      request.input('numeroPedido', sql.Int, parseInt(numeroPedido));
    }

    // Filtro por fechas
    if (fechaDesde) {
      condiciones.push('cp.FechaPedido >= @fechaDesde');
      request.input('fechaDesde', sql.Date, fechaDesde);
    }
    
    if (fechaHasta) {
      condiciones.push('cp.FechaPedido <= @fechaHasta');
      request.input('fechaHasta', sql.Date, fechaHasta);
    }

    const whereClause = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    // Contar total
    const countQuery = `
      SELECT COUNT(DISTINCT cp.NumeroPedido) as total
      FROM CabeceraPedidoProveedor cp
      ${whereClause}
    `;
    
    const countResult = await request.query(countQuery);
    const totalPedidos = countResult.recordset[0].total;
    const totalPages = Math.ceil(totalPedidos / limit);

    // Consulta paginada
    const query = `
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
    `;
    
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, parseInt(limit));
    
    const result = await request.query(query);

    res.json({
      success: true,
      pedidos: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalPedidos,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      },
      filtros: {
        proveedor,
        fechaDesde,
        fechaHasta,
        numeroPedido,
        estado
      }
    });
  } catch (err) {
    console.error('[ERROR BUSCAR PEDIDOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al buscar pedidos.',
      error: err.message 
    });
  }
});

// ✅ 7. GENERAR ALBARÁN A PARTIR DE PEDIDO RECEPCIONADO - SOLO UNIDADES NO ALBARANADAS
router.post('/pedidos-compra/:ejercicio/:serie/:numero/generar-albaran', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { ejercicio, serie, numero } = req.params;

  if (!codigoEmpresa || !ejercicio || !numero) {
    return res.status(400).json({
      success: false,
      mensaje: 'Parametros del pedido requeridos.'
    });
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
        SELECT
          cp.*, 
          p.CifDni
        FROM CabeceraPedidoProveedor cp
        LEFT JOIN Proveedores p
          ON p.CodigoProveedor = cp.CodigoProveedor
          AND p.CodigoEmpresa = cp.CodigoEmpresa
        WHERE cp.CodigoEmpresa = @codigoEmpresa
          AND cp.EjercicioPedido = @ejercicio
          AND cp.NumeroPedido = @numero
          AND (cp.SeriePedido = @serie OR (@serie = '0' AND (cp.SeriePedido IS NULL OR cp.SeriePedido = '' OR cp.SeriePedido = '0')))
      `);

    if (pedidoResult.recordset.length === 0) {
      throw new Error('Pedido no encontrado.');
    }

    const pedido = pedidoResult.recordset[0];

    const lineasPedidoResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(`
        SELECT
          lp.Orden,
          lp.LineasPosicion,
          lp.CodigoArticulo,
          lp.DescripcionArticulo,
          lp.UnidadesRecibidas,
          lp.UnidadMedida2_,
          lp.FactorConversion_,
          lp.GrupoIva,
          lp.CodigoIva,
          lp.IvaIncluido,
          lp.Precio,
          lp.CodigoColor_,
          lp.GrupoTalla_,
          lp.CodigoTalla01_
        FROM LineasPedidoProveedor lp
        WHERE lp.CodigoEmpresa = @codigoEmpresa
          AND lp.EjercicioPedido = @ejercicio
          AND lp.NumeroPedido = @numero
          AND (lp.SeriePedido = @serie OR (@serie = '0' AND (lp.SeriePedido IS NULL OR lp.SeriePedido = '' OR lp.SeriePedido = '0')))
          AND lp.UnidadesRecibidas > 0
        ORDER BY lp.Orden
      `);

    if (lineasPedidoResult.recordset.length === 0) {
      throw new Error('No hay lineas recepcionadas para generar albaran.');
    }

    const lineasConPendientes = [];

    for (const linea of lineasPedidoResult.recordset) {
      const codigoColor = safeString(linea.CodigoColor_, 10, '');
      const codigoTalla = safeString(linea.CodigoTalla01_, 10, '');

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
            AND (CodigoColor_ = @codigoColor OR (@codigoColor = '' AND CodigoColor_ IS NULL))
            AND (CodigoTalla01_ = @codigoTalla OR (@codigoTalla = '' AND CodigoTalla01_ IS NULL))
        `);

      const unidadesRecibidasTotales = safeDecimal(linea.UnidadesRecibidas, 0);
      const unidadesAlbaranadas = safeDecimal(albaranadasResult.recordset[0]?.unidadesAlbaranadas, 0);
      const unidadesPendientesAlbaranar = unidadesRecibidasTotales - unidadesAlbaranadas;

      if (unidadesPendientesAlbaranar > 0) {
        lineasConPendientes.push({
          ...linea,
          codigoColorSafe: codigoColor,
          codigoTallaSafe: codigoTalla,
          unidadesRecibidasTotales,
          unidadesAlbaranadas,
          unidadesPendientesAlbaranar
        });
      }
    }

    if (lineasConPendientes.length === 0) {
      throw new Error('No hay unidades pendientes de albaranar en este pedido.');
    }

    const { ejercicioAlbaran, numeroAlbaran } = await obtenerSiguienteNumeroAlbaranProveedor(transaction, codigoEmpresa);
    const serieAlbaran = '';

    let baseImponibleTotal = 0;
    let totalIva = 0;
    let importeLiquidoTotal = 0;

    const lineasProcesadas = lineasConPendientes.map((linea) => {
      const unidadesAAlbaranar = safeDecimal(linea.unidadesPendientesAlbaranar, 0);
      const precio = safeDecimal(linea.Precio, 0);
      const porcentajeIva = safeDecimal(linea.CodigoIva, 21);
      const factorConversion = safeDecimal(linea.FactorConversion_, 1);
      const importeNetoLinea = precio * unidadesAAlbaranar;
      const importeIvaLinea = importeNetoLinea * (porcentajeIva / 100);
      const importeLiquidoLinea = importeNetoLinea + importeIvaLinea;

      baseImponibleTotal += importeNetoLinea;
      totalIva += importeIvaLinea;
      importeLiquidoTotal += importeLiquidoLinea;

      return {
        ...linea,
        unidadesAAlbaranar,
        precio,
        porcentajeIva,
        factorConversion,
        importeNetoLinea,
        importeIvaLinea,
        importeLiquidoLinea
      };
    });

    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('serieAlbaran', sql.VarChar, serieAlbaran)
      .input('codigoProveedor', sql.VarChar(15), safeString(pedido.CodigoProveedor, 15, ''))
      .input('razonSocial', sql.VarChar(40), safeString(pedido.RazonSocial, 40, ''))
      .input('numeroLineas', sql.Int, lineasProcesadas.length)
      .input('importeBruto', sql.Decimal(18, 4), baseImponibleTotal)
      .input('importeLiquido', sql.Decimal(18, 4), importeLiquidoTotal)
      .input('baseImponible', sql.Decimal(18, 4), baseImponibleTotal)
      .input('totalIva', sql.Decimal(18, 4), totalIva)
      .input('cifDni', sql.VarChar(13), safeString(pedido.CifDni, 13, ''))
      .query(`
        INSERT INTO CabeceraAlbaranProveedor (
          CodigoEmpresa,
          EjercicioAlbaran,
          NumeroAlbaran,
          SerieAlbaran,
          CodigoProveedor,
          RazonSocial,
          NumeroLineas,
          ImporteBruto,
          ImporteLiquido,
          BaseImponible,
          TotalIva,
          CifDni,
          FechaAlbaran
        ) VALUES (
          @codigoEmpresa,
          @ejercicioAlbaran,
          @numeroAlbaran,
          @serieAlbaran,
          @codigoProveedor,
          @razonSocial,
          @numeroLineas,
          @importeBruto,
          @importeLiquido,
          @baseImponible,
          @totalIva,
          @cifDni,
          GETDATE()
        )
      `);

    for (const linea of lineasProcesadas) {
      const unidadesAAlbaranar = safeDecimal(linea.unidadesAAlbaranar, 0);
      const factorConversion = safeDecimal(linea.factorConversion, 1);
      const unidadMedida = safeString(linea.UnidadMedida2_, 10, '');

      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('serieAlbaran', sql.VarChar(10), safeString(serieAlbaran, 10, ''))
        .input('codigoArticulo', sql.VarChar(20), safeString(linea.CodigoArticulo, 20))
        .input('descripcionArticulo', sql.VarChar(50), safeString(linea.DescripcionArticulo, 50))
        .input('unidadMedida1', sql.VarChar(10), safeString(unidadMedida, 10, ''))
        .input('unidadMedida2', sql.VarChar(10), safeString(unidadMedida, 10, ''))
        .input('factorConversion', sql.Decimal(18, 4), factorConversion)
        .input('unidadesRecibidas', sql.Decimal(18, 4), unidadesAAlbaranar)
        .input('unidades', sql.Decimal(18, 4), unidadesAAlbaranar)
        .input('unidades2', sql.Decimal(18, 4), unidadesAAlbaranar * factorConversion)
        .input('codigoColor', sql.VarChar(10), safeString(linea.codigoColorSafe, 10, ''))
        .input('grupoTalla', sql.SmallInt, safeDecimal(linea.GrupoTalla_, 0))
        .input('codigoTalla', sql.VarChar(10), safeString(linea.codigoTallaSafe, 10, ''))
        .input('grupoIva', sql.TinyInt, safeDecimal(linea.GrupoIva, 1))
        .input('codigoIva', sql.SmallInt, safeDecimal(linea.CodigoIva, 21))
        .input('ivaIncluido', sql.SmallInt, safeDecimal(linea.IvaIncluido, 0))
        .input('porcentajeIva', sql.Decimal(18, 4), safeDecimal(linea.porcentajeIva, 21))
        .input('ejercicioPedido', sql.SmallInt, ejercicio)
        .input('seriePedido', sql.VarChar(10), safeString(serieParam, 10, '0'))
        .input('numeroPedido', sql.Int, numero)
        .input('orden', sql.SmallInt, linea.Orden)
        .input('precio', sql.Decimal(18, 4), safeDecimal(linea.precio, 0))
        .input('importeBruto', sql.Decimal(18, 4), safeDecimal(linea.importeNetoLinea, 0))
        .input('importeNeto', sql.Decimal(18, 4), safeDecimal(linea.importeNetoLinea, 0))
        .input('baseImponible', sql.Decimal(18, 4), safeDecimal(linea.importeNetoLinea, 0))
        .input('baseIva', sql.Decimal(18, 4), safeDecimal(linea.importeNetoLinea, 0))
        .input('cuotaIva', sql.Decimal(18, 4), safeDecimal(linea.importeIvaLinea, 0))
        .input('totalIva', sql.Decimal(18, 4), safeDecimal(linea.importeIvaLinea, 0))
        .input('importeLiquido', sql.Decimal(18, 4), safeDecimal(linea.importeLiquidoLinea, 0))
        .query(`
          INSERT INTO LineasAlbaranProveedor (
            CodigoEmpresa,
            EjercicioAlbaran,
            NumeroAlbaran,
            SerieAlbaran,
            CodigoArticulo,
            DescripcionArticulo,
            UnidadMedida1_,
            UnidadMedida2_,
            FactorConversion_,
            CodigoColor_,
            GrupoTalla_,
            CodigoTalla01_,
            GrupoIva,
            CodigoIva,
            IvaIncluido,
            [%Iva],
            EjercicioPedido,
            SeriePedido,
            NumeroPedido,
            Orden,
            UnidadesRecibidas,
            Unidades,
            Unidades2_,
            Precio,
            ImporteBruto,
            ImporteNeto,
            BaseImponible,
            BaseIva,
            CuotaIva,
            TotalIva,
            ImporteLiquido,
            FechaRegistro,
            FechaAlbaran
          ) VALUES (
            @codigoEmpresa,
            @ejercicioAlbaran,
            @numeroAlbaran,
            @serieAlbaran,
            @codigoArticulo,
            @descripcionArticulo,
            @unidadMedida1,
            @unidadMedida2,
            @factorConversion,
            @codigoColor,
            @grupoTalla,
            @codigoTalla,
            @grupoIva,
            @codigoIva,
            @ivaIncluido,
            @porcentajeIva,
            @ejercicioPedido,
            @seriePedido,
            @numeroPedido,
            @orden,
            @unidadesRecibidas,
            @unidades,
            @unidades2,
            @precio,
            @importeBruto,
            @importeNeto,
            @baseImponible,
            @baseIva,
            @cuotaIva,
            @totalIva,
            @importeLiquido,
            GETDATE(),
            GETDATE()
          )
        `);
    }

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

    await transaction.commit();

    res.json({
      success: true,
      mensaje: 'Nuevo albaran generado correctamente.',
      albaran: {
        ejercicio: ejercicioAlbaran,
        numero: numeroAlbaran,
        serie: serieAlbaran,
        fecha: new Date().toISOString().split('T')[0],
        proveedor: {
          codigo: safeString(pedido.CodigoProveedor, 15, ''),
          nombre: safeString(pedido.RazonSocial, 40, '')
        },
        totalLineas: lineasProcesadas.length,
        importes: {
          neto: baseImponibleTotal,
          iva: totalIva,
          liquido: importeLiquidoTotal
        },
        tipo: 'NUEVO',
        unidadesIncluidas: lineasProcesadas.reduce((sum, l) => sum + safeDecimal(l.unidadesAAlbaranar, 0), 0),
        unidadesYaAlbaranadas: lineasConPendientes.reduce((sum, l) => sum + safeDecimal(l.unidadesAlbaranadas, 0), 0)
      },
      pedido: {
        ejercicio: parseInt(ejercicio, 10),
        numero: parseInt(numero, 10),
        serie: serieParam,
        estado: nuevoEstado,
        unidadesPendientes: totalPendientes,
        totalUnidadesRecibidas: lineasConPendientes.reduce((sum, l) => sum + safeDecimal(l.unidadesRecibidasTotales, 0), 0),
        unidadesYaAlbaranadas: lineasConPendientes.reduce((sum, l) => sum + safeDecimal(l.unidadesAlbaranadas, 0), 0),
        unidadesPorAlbaranar: lineasConPendientes.reduce((sum, l) => sum + safeDecimal(l.unidadesPendientesAlbaranar, 0), 0)
      }
    });
  } catch (err) {
    console.error('[ERROR GENERAR NUEVO ALBARAN]', err);
    await transaction.rollback();
    res.status(500).json({
      success: false,
      mensaje: `Error al generar nuevo albaran: ${err.message}`,
      error: err.message
    });
  }
});

router.post('/pedidos-compra/:ejercicio/:serie/:numero/finalizar', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { ejercicio, serie, numero } = req.params;
  const { motivo } = req.body;

  console.log('✅ FINALIZANDO PEDIDO:');
  console.log('- Empresa:', codigoEmpresa);
  console.log('- Pedido:', `${ejercicio}/${serie || '0'}/${numero}`);
  console.log('- Motivo:', motivo || 'Sin motivo especificado');

  if (!codigoEmpresa || !ejercicio || !numero) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Parámetros del pedido requeridos.' 
    });
  }

  const transaction = new sql.Transaction(getPool());

  try {
    await transaction.begin();
    console.log(`[FINALIZAR PEDIDO] Iniciando transacción para pedido ${numero}`);

    const serieParam = (serie === 'undefined' || serie === 'null' || !serie) ? '0' : serie;
    
    // 1. VERIFICAR QUE EL PEDIDO EXISTE Y ESTÁ PENDIENTE
    const pedidoResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('numero', sql.Int, numero)
      .input('serie', sql.VarChar, serieParam)
      .query(`
        SELECT 
          Estado,
          RazonSocial,
          CodigoProveedor,
          COUNT(*) as count
        FROM CabeceraPedidoProveedor
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND NumeroPedido = @numero
          AND (SeriePedido = @serie OR (@serie = '0' AND (SeriePedido IS NULL OR SeriePedido = '' OR SeriePedido = '0')))
        GROUP BY Estado, RazonSocial, CodigoProveedor
      `);

    if (pedidoResult.recordset.length === 0) {
      throw new Error('Pedido no encontrado.');
    }

    const pedido = pedidoResult.recordset[0];
    
    if (pedido.Estado !== 0) {
      throw new Error(`El pedido no está en estado pendiente. Estado actual: ${pedido.Estado}`);
    }

    // 2. VERIFICAR QUE NO HAY UNIDADES PENDIENTES EN LAS LÍNEAS
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
      // OPCIONAL: Podemos permitir finalizar igualmente o rechazar
      // En este caso, permitimos pero mostramos advertencia
      console.log(`[FINALIZAR PEDIDO] Advertencia: Hay ${totalPendientes} unidades pendientes en el pedido`);
    }

    // 3. ACTUALIZAR ESTADO DEL PEDIDO A 2 (SERVIDO) EN CABECERA
    console.log(`[FINALIZAR PEDIDO] Actualizando estado del pedido a 2 (Servido)...`);
    
    await new sql.Request(transaction)
      .input('nuevoEstado', sql.SmallInt, 2) // Estado 2 = Servido
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

    // 4. OPCIONAL: También actualizar estado en líneas si es necesario
    // (Generalmente el estado se maneja en la cabecera, pero si hay campo Estado en líneas)
    const tieneEstadoEnLineas = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'LineasPedidoProveedor' 
          AND COLUMN_NAME = 'Estado'
          AND TABLE_SCHEMA = 'dbo'
      `);

    if (tieneEstadoEnLineas.recordset.length > 0) {
      console.log(`[FINALIZAR PEDIDO] Actualizando estado en líneas...`);
      
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
    }

    await transaction.commit();

    // 5. RESPONDER CON ÉXITO
    res.json({
      success: true,
      mensaje: totalPendientes > 0 
        ? `Pedido finalizado como servido con ${totalPendientes} unidades pendientes.`
        : 'Pedido finalizado correctamente como servido.',
      pedido: {
        ejercicio: parseInt(ejercicio),
        numero: parseInt(numero),
        serie: serieParam,
        estado: 2, // Servido
        unidadesPendientes: totalPendientes,
        proveedor: {
          codigo: pedido.CodigoProveedor,
          nombre: pedido.RazonSocial
        }
      }
    });

  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR FINALIZAR PEDIDO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al finalizar el pedido.',
      error: err.message
    });
  }
});

// ✅ 9. GENERAR ALBARÁN POR PROVEEDOR (NUEVO ALBARÁN CADA VEZ - NO ACUMULATIVO) - CORREGIDO Y SIN ORDEN
router.post('/proveedores/:codigoProveedor/generar-albaran', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { codigoProveedor } = req.params;
  const { pedidos } = req.body;

  console.log('📦 GENERANDO NUEVO ALBARÁN POR PROVEEDOR (CORREGIDO):');
  console.log('- Empresa:', codigoEmpresa);
  console.log('- Proveedor:', codigoProveedor);
  console.log('- Pedidos a incluir:', pedidos?.length || 0);

  if (!codigoEmpresa || !codigoProveedor) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa y proveedor requeridos.' 
    });
  }

  if (!pedidos || !Array.isArray(pedidos) || pedidos.length === 0) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Debe especificar los pedidos a incluir.' 
    });
  }

  const transaction = new sql.Transaction(getPool());

  try {
    await transaction.begin();
    console.log(`[ALBARÁN NUEVO] Iniciando para proveedor ${codigoProveedor}`);

    // 1. OBTENER INFORMACIÓN DEL PROVEEDOR
    const proveedorResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoProveedor', sql.VarChar, codigoProveedor)
      .query(`
        SELECT 
          CodigoProveedor,
          RazonSocial,
          CifDni,
          Domicilio,
          CodigoPostal,
          Municipio,
          Provincia,
          Telefono
        FROM Proveedores
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoProveedor = @codigoProveedor
      `);

    if (proveedorResult.recordset.length === 0) {
      throw new Error('Proveedor no encontrado.');
    }

    const proveedor = proveedorResult.recordset[0];

    // 2. OBTENER NUEVO NÚMERO DE ALBARÁN (SIEMPRE NUEVO)
    const { ejercicioAlbaran, numeroAlbaran } = await obtenerSiguienteNumeroAlbaranProveedor(transaction, codigoEmpresa);
    const serieAlbaran = '';
    console.log(`[ALBARÁN NUEVO] Nuevo número de albarán: ${numeroAlbaran}`);

    // 3. FUNCIONES AUXILIARES MEJORADAS
    const safeString = (value, maxLength = 10, defaultValue = '') => {
      if (value === null || value === undefined || value === 'null' || value === 'undefined') {
        return defaultValue;
      }
      
      let str = String(value).trim();
      
      // ✅ CORRECCIÓN: Detectar y eliminar duplicaciones
      if (str.length % 2 === 0) {
        const mitad = Math.floor(str.length / 2);
        const primeraMitad = str.substring(0, mitad);
        const segundaMitad = str.substring(mitad);
        
        if (primeraMitad === segundaMitad) {
          console.log(`[CORRECCIÓN] Valor duplicado: "${str}" -> usando: "${primeraMitad}"`);
          str = primeraMitad;
        }
      }
      
      // ✅ CORRECCIÓN: Corregir "BOLSAS" a "BOLSA" si es necesario
      if (str === 'BOLSAS' || str === 'BOLSASBOLSAS') {
        console.log(`[CORRECCIÓN] Unidad de medida: "${str}" -> "BOLSA"`);
        str = 'BOLSA';
      }
      
      // Limpiar comas
      const cleaned = str.replace(/[,]/g, '').trim();
      
      // Truncar si es necesario
      if (maxLength > 0 && cleaned.length > maxLength) {
        console.warn(`[ADVERTENCIA] Valor truncado de ${cleaned.length} a ${maxLength}: "${cleaned}"`);
        return cleaned.substring(0, maxLength);
      }
      
      return cleaned === '' ? defaultValue : cleaned;
    };

    const safeDecimal = (value, defaultValue = 0) => {
      if (value === null || value === undefined || value === 'null' || value === 'undefined') {
        return defaultValue;
      }
      const num = parseFloat(value);
      return isNaN(num) ? defaultValue : num;
    };

    // 4. RECOLECTAR LÍNEAS DE PEDIDOS (SOLO UNIDADES NO ALBARANADAS - CORRECCIÓN CLAVE)
    const lineasDetalladas = [];
    let totalUnidades = 0;
    let baseImponibleTotal = 0;
    let totalIva = 0;
    let importeLiquidoTotal = 0;

    for (const pedidoInfo of pedidos) {
      const { ejercicio, serie, numero } = pedidoInfo;
      const serieParam = serie || '0';

      console.log(`[ALBARÁN NUEVO] Procesando pedido ${ejercicio}/${serieParam}/${numero}`);

      // Consulta para obtener líneas con unidades recibidas
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
          FROM LineasPedidoProveedor lp
          LEFT JOIN Articulos a 
            ON a.CodigoArticulo = lp.CodigoArticulo
            AND a.CodigoEmpresa = lp.CodigoEmpresa
          WHERE lp.CodigoEmpresa = @codigoEmpresa
            AND lp.EjercicioPedido = @ejercicio
            AND lp.NumeroPedido = @numero
            AND (lp.SeriePedido = @serie OR (@serie = '0' AND (lp.SeriePedido IS NULL OR lp.SeriePedido = '' OR lp.SeriePedido = '0')))
            AND lp.UnidadesRecibidas > 0
          ORDER BY lp.Orden
        `);

      if (lineasPedidoResult.recordset.length > 0) {
        for (const linea of lineasPedidoResult.recordset) {
          const unidadesRecibidasTotales = safeDecimal(linea.UnidadesRecibidas, 0);
          
          // ✅ CORRECCIÓN: Usar safeString para codigoColor y codigoTalla
          const codigoColorValue = safeString(linea.CodigoColor_, 10, '');
          const codigoTallaValue = safeString(linea.CodigoTalla01_, 10, '');
          
          // ✅✅✅ CORRECCIÓN CLAVE: Verificar cuántas unidades YA ESTÁN ALBARANADAS
          // ✅ SIN el parámetro ordenLinea que causaba el error
          const albaranesPreviosResult = await new sql.Request(transaction)
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicioPedido', sql.SmallInt, ejercicio)
            .input('seriePedido', sql.VarChar, serieParam)
            .input('numeroPedido', sql.Int, numero)
            .input('ordenPedido', sql.SmallInt, linea.Orden)
            .input('codigoArticulo', sql.VarChar, linea.CodigoArticulo)
            .input('codigoColor', sql.VarChar, codigoColorValue) // ✅ Usar valor procesado
            .input('codigoTalla', sql.VarChar, codigoTallaValue) // ✅ Usar valor procesado
            .query(`
              SELECT ISNULL(SUM(UnidadesRecibidas), 0) as totalAlbaranado
              FROM LineasAlbaranProveedor
              WHERE CodigoEmpresa = @codigoEmpresa
                AND EjercicioPedido = @ejercicioPedido
                AND ISNULL(SeriePedido, '0') = @seriePedido
                AND NumeroPedido = @numeroPedido
                AND Orden = @ordenPedido
                AND CodigoArticulo = @codigoArticulo
                AND (CodigoColor_ = @codigoColor OR (@codigoColor = '' AND CodigoColor_ IS NULL))
                AND (CodigoTalla01_ = @codigoTalla OR (@codigoTalla = '' AND CodigoTalla01_ IS NULL))
            `);

          const totalAlbaranado = safeDecimal(albaranesPreviosResult.recordset[0]?.totalAlbaranado, 0);
          const unidadesPendientesAlbaranar = unidadesRecibidasTotales - totalAlbaranado;
          
          console.log(`[ALBARÁN NUEVO] Artículo: ${linea.CodigoArticulo}`);
          console.log(`  - Unidades recibidas totales: ${unidadesRecibidasTotales}`);
          console.log(`  - Unidades ya albaranadas: ${totalAlbaranado}`);
          console.log(`  - Unidades pendientes de albaranar: ${unidadesPendientesAlbaranar}`);
          console.log(`  - Color: "${codigoColorValue}", Talla: "${codigoTallaValue}"`);
          
          // ✅ Solo incluir si hay unidades pendientes de albaranar
          if (unidadesPendientesAlbaranar > 0) {
            const precio = safeDecimal(linea.Precio, 0);
            const importeNetoLinea = precio * unidadesPendientesAlbaranar;
            const porcentajeIva = safeDecimal(linea.CodigoIva, 21);
            const factorIva = 1 + (porcentajeIva / 100);
            const importeLiquidoLinea = importeNetoLinea * factorIva;
            const importeIvaLinea = importeLiquidoLinea - importeNetoLinea;
            const factorConversion = safeDecimal(linea.FactorConversion_, 1);
            const unidades2 = unidadesPendientesAlbaranar * factorConversion;

            // ✅ CORRECCIÓN: Obtener unidad de medida limpia
            const unidadMedida2Original = linea.UnidadMedida2_ || '';
            const unidadMedida2Limpia = safeString(unidadMedida2Original, 10, '');
            
            console.log(`[ALBARÁN NUEVO] INCLUYENDO en nuevo albarán: ${linea.CodigoArticulo}, Unidades: ${unidadesPendientesAlbaranar}`);

            // Agregar a la lista
            lineasDetalladas.push({
              ...linea,
              ejercicioPedido: ejercicio,
              seriePedido: serieParam,
              numeroPedido: numero,
              ordenPedido: linea.Orden,
              unidadesRecibidasTotales,
              unidadesYaAlbaranadas: totalAlbaranado,
              unidadesParaAlbaranar: unidadesPendientesAlbaranar,  // ✅ Solo las pendientes
              unidades2,
              precio,
              factorConversion,
              importeNetoLinea,
              importeLiquidoLinea,
              importeIvaLinea,
              porcentajeIva,
              unidadMedida2: unidadMedida2Limpia,
              grupoIva: safeDecimal(linea.GrupoIva, 1),
              ivaIncluido: safeDecimal(linea.IvaIncluido, 0),
              codigoColorSafe: codigoColorValue,  // ✅ Guardar valor procesado
              codigoTallaSafe: codigoTallaValue   // ✅ Guardar valor procesado
            });

            // Acumular totales (SOLO de las unidades pendientes)
            totalUnidades += unidadesPendientesAlbaranar;
            baseImponibleTotal += importeNetoLinea;
            totalIva += importeIvaLinea;
            importeLiquidoTotal += importeLiquidoLinea;
          } else {
            console.log(`[ALBARÁN NUEVO] OMITIENDO: ${linea.CodigoArticulo} - Ya está totalmente albaranado`);
          }
        }
      }
    }

    // ✅ VERIFICAR QUE HAY LÍNEAS PARA ALBARANAR
    if (lineasDetalladas.length === 0) {
      throw new Error('No hay unidades pendientes de albaranar para generar un nuevo albarán. Todas las unidades recibidas ya han sido albaranadas en albaranes anteriores.');
    }

    console.log(`[ALBARÁN NUEVO] Total líneas: ${lineasDetalladas.length}, Unidades pendientes: ${totalUnidades}, Importe: ${importeLiquidoTotal}`);

    // 5. INSERTAR CABECERA DEL NUEVO ALBARÁN
    console.log(`[ALBARÁN NUEVO] Insertando nueva cabecera...`);
    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('serieAlbaran', sql.VarChar, serieAlbaran)
      .input('codigoProveedor', sql.VarChar(15), safeString(proveedor.CodigoProveedor, 15))
      .input('razonSocial', sql.VarChar(40), safeString(proveedor.RazonSocial, 40))
      .input('numeroLineas', sql.Int, lineasDetalladas.length)
      .input('importeBruto', sql.Decimal(18, 4), baseImponibleTotal)
      .input('importeLiquido', sql.Decimal(18, 4), importeLiquidoTotal)
      .input('baseImponible', sql.Decimal(18, 4), baseImponibleTotal)
      .input('totalIva', sql.Decimal(18, 4), totalIva)
      .input('cifDni', sql.VarChar(13), safeString(proveedor.CifDni, 13))
      .query(`
        INSERT INTO CabeceraAlbaranProveedor (
          CodigoEmpresa,
          EjercicioAlbaran,
          NumeroAlbaran,
          SerieAlbaran,
          CodigoProveedor,
          RazonSocial,
          NumeroLineas,
          ImporteBruto,
          ImporteLiquido,
          BaseImponible,
          TotalIva,
          CifDni,
          FechaAlbaran
        ) VALUES (
          @codigoEmpresa,
          @ejercicioAlbaran,
          @numeroAlbaran,
          @serieAlbaran,
          @codigoProveedor,
          @razonSocial,
          @numeroLineas,
          @importeBruto,
          @importeLiquido,
          @baseImponible,
          @totalIva,
          @cifDni,
          GETDATE()
        )
      `);

    // 6. INSERTAR LÍNEAS DEL NUEVO ALBARÁN (SOLO UNIDADES PENDIENTES)
    console.log(`[ALBARÁN NUEVO] Insertando ${lineasDetalladas.length} líneas...`);
    
    for (let i = 0; i < lineasDetalladas.length; i++) {
      const linea = lineasDetalladas[i];
      
      // ✅ Usar SOLO las unidades pendientes de albaranar
      const unidadesParaAlbaranar = safeDecimal(linea.unidadesParaAlbaranar, 0);
      const factorConversion = safeDecimal(linea.factorConversion, 1);
      const unidades2 = unidadesParaAlbaranar * factorConversion;
      const precio = safeDecimal(linea.precio, 0);
      const importeNetoLinea = safeDecimal(linea.importeNetoLinea, 0);
      const importeLiquidoLinea = safeDecimal(linea.importeLiquidoLinea, 0);
      const importeIvaLinea = safeDecimal(linea.importeIvaLinea, 0);
      const porcentajeIva = safeDecimal(linea.porcentajeIva, 21);
      const grupoIva = safeDecimal(linea.grupoIva, 1);
      const ivaIncluido = safeDecimal(linea.ivaIncluido, 0);
      
      // ✅ USAR LOS VALORES YA PROCESADOS CON safeString
      const unidadMedida2 = safeString(linea.unidadMedida2, 10, '');
      const codigoColor = safeString(linea.codigoColorSafe, 10, '');
      const grupoTalla = safeDecimal(linea.GrupoTalla_, 0);
      const codigoTalla = safeString(linea.codigoTallaSafe, 10, '');
      
      console.log(`[ALBARÁN NUEVO] Línea ${i+1}: ${linea.CodigoArticulo} - ${unidadesParaAlbaranar} unidades pendientes`);
      console.log(`  - Color: "${codigoColor}", Talla: "${codigoTalla}", Unidad: "${unidadMedida2}"`);
      
      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('serieAlbaran', sql.VarChar(10), safeString(serieAlbaran, 10, ''))
        .input('codigoArticulo', sql.VarChar(20), safeString(linea.CodigoArticulo, 20))
        .input('descripcionArticulo', sql.VarChar(50), safeString(linea.DescripcionArticulo, 50))
        .input('unidadMedida1', sql.VarChar(10), safeString(unidadMedida2, 10, ''))
        .input('unidadMedida2', sql.VarChar(10), safeString(unidadMedida2, 10, ''))
        .input('factorConversion', sql.Decimal(18, 4), factorConversion)
        .input('unidadesRecibidas', sql.Decimal(18, 4), unidadesParaAlbaranar)  // ✅ Solo pendientes
        .input('unidades', sql.Decimal(18, 4), unidadesParaAlbaranar)           // ✅ Solo pendientes
        .input('unidades2', sql.Decimal(18, 4), unidades2)
        .input('codigoColor', sql.VarChar(10), safeString(codigoColor, 10, ''))
        .input('grupoTalla', sql.SmallInt, grupoTalla)
        .input('codigoTalla', sql.VarChar(10), safeString(codigoTalla, 10, ''))
        .input('grupoIva', sql.TinyInt, grupoIva)
        .input('codigoIva', sql.SmallInt, porcentajeIva)
        .input('ivaIncluido', sql.SmallInt, ivaIncluido)
        .input('porcentajeIva', sql.Decimal(18, 4), porcentajeIva)
        .input('ejercicioPedido', sql.SmallInt, linea.ejercicioPedido)
        .input('seriePedido', sql.VarChar(10), safeString(linea.seriePedido, 10, '0'))
        .input('numeroPedido', sql.Int, linea.numeroPedido)
        .input('orden', sql.SmallInt, linea.ordenPedido)
        .input('precio', sql.Decimal(18, 4), precio)
        .input('importeBruto', sql.Decimal(18, 4), importeNetoLinea)
        .input('importeNeto', sql.Decimal(18, 4), importeNetoLinea)
        .input('baseImponible', sql.Decimal(18, 4), importeNetoLinea)
        .input('baseIva', sql.Decimal(18, 4), importeNetoLinea)
        .input('cuotaIva', sql.Decimal(18, 4), importeIvaLinea)
        .input('totalIva', sql.Decimal(18, 4), importeIvaLinea)
        .input('importeLiquido', sql.Decimal(18, 4), importeLiquidoLinea)
        .query(`
          INSERT INTO LineasAlbaranProveedor (
            CodigoEmpresa,
            EjercicioAlbaran,
            NumeroAlbaran,
            SerieAlbaran,
            CodigoArticulo,
            DescripcionArticulo,
            UnidadMedida1_,
            UnidadMedida2_,
            FactorConversion_,
            CodigoColor_,
            GrupoTalla_,
            CodigoTalla01_,
            GrupoIva,
            CodigoIva,
            IvaIncluido,
            [%Iva],
            EjercicioPedido,
            SeriePedido,
            NumeroPedido,
            Orden,
            UnidadesRecibidas,
            Unidades,
            Unidades2_,
            Precio,
            ImporteBruto,
            ImporteNeto,
            BaseImponible,
            BaseIva,
            CuotaIva,
            TotalIva,
            ImporteLiquido,
            FechaRegistro,
            FechaAlbaran
          ) VALUES (
            @codigoEmpresa,
            @ejercicioAlbaran,
            @numeroAlbaran,
            @serieAlbaran,
            @codigoArticulo,
            @descripcionArticulo,
            @unidadMedida1,
            @unidadMedida2,
            @factorConversion,
            @codigoColor,
            @grupoTalla,
            @codigoTalla,
            @grupoIva,
            @codigoIva,
            @ivaIncluido,
            @porcentajeIva,
            @ejercicioPedido,
            @seriePedido,
            @numeroPedido,
            @orden,
            @unidadesRecibidas,
            @unidades,
            @unidades2,
            @precio,
            @importeBruto,
            @importeNeto,
            @baseImponible,
            @baseIva,
            @cuotaIva,
            @totalIva,
            @importeLiquido,
            GETDATE(),
            GETDATE()
          )
        `);
    }

    await transaction.commit();

    // 7. RESPONDER CON ÉXITO Y DETALLES DE LO PROCESADO
    const resumenPorPedido = {};
    
    lineasDetalladas.forEach(linea => {
      const clave = `${linea.ejercicioPedido}/${linea.seriePedido}/${linea.numeroPedido}`;
      if (!resumenPorPedido[clave]) {
        resumenPorPedido[clave] = {
          unidadesRecibidasTotales: 0,
          unidadesYaAlbaranadas: 0,
          unidadesNuevasAlbaranadas: 0
        };
      }
      
      resumenPorPedido[clave].unidadesRecibidasTotales += linea.unidadesRecibidasTotales;
      resumenPorPedido[clave].unidadesYaAlbaranadas += linea.unidadesYaAlbaranadas;
      resumenPorPedido[clave].unidadesNuevasAlbaranadas += linea.unidadesParaAlbaranar;
    });

    res.json({
      success: true,
      mensaje: 'Nuevo albarán generado correctamente (solo con unidades no albaranadas previamente).',
      albaran: {
        ejercicio: ejercicioAlbaran,
        numero: numeroAlbaran,
        serie: serieAlbaran,
        fecha: new Date().toISOString().split('T')[0],
        proveedor: {
          codigo: proveedor.CodigoProveedor,
          nombre: proveedor.RazonSocial
        },
        totalLineas: lineasDetalladas.length,
        totalUnidades: totalUnidades,
        importes: {
          neto: baseImponibleTotal,
          iva: totalIva,
          liquido: importeLiquidoTotal
        },
        pedidosIncluidos: Object.keys(resumenPorPedido).length,
        tipo: 'NUEVO_NO_ACUMULATIVO',
        resumenPorPedido: resumenPorPedido
      }
    });

  } catch (err) {
    console.error('[ERROR GENERAR NUEVO ALBARÁN]', err);
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error('[ERROR ROLLBACK GENERAR NUEVO ALBARÁN]', rollbackError);
    }
    res.status(500).json({ 
      success: false, 
      mensaje: `Error al generar nuevo albarán: ${err.message}`,
      error: err.message,
      detalle: {
        codigoProveedor,
        pedidos: Array.isArray(pedidos)
          ? pedidos.map((pedido) => ({
              ejercicio: pedido?.ejercicio,
              serie: pedido?.serie || '0',
              numero: pedido?.numero
            }))
          : []
      }
    });
  }
});



// ============================================
// ✅ CONFIGURACIÓN SIMPLIFICADA - GARANTIZADA
// ============================================


  return router;
};
