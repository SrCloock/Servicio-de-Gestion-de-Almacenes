const express = require('express');

module.exports = function createtraspasosRouter({ sql, getPool }) {
  const router = express.Router();

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

router.get('/almacenes', async (req, res) => {
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
          AND CodigoAlmacen IN ('CEN', 'BCN', 'N5', 'N1', 'PK', '5')  -- TODOS LOS ALMACENES PERMITIDOS
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR ALMACENES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener almacenes.',
      error: err.message 
    });
  }
});

// ✅ 10.2 OBTENER UBICACIONES POR ALMACÉN (VERSIÓN CORREGIDA)
router.get('/ubicaciones-completas', async (req, res) => {
  const { codigoAlmacen, excluirUbicacion, incluirSinUbicacion = 'true' } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoEmpresa || !codigoAlmacen) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa y almacén requeridos.' 
    });
  }

  try {
    // Consulta base para ubicaciones normales
    let query = `
      SELECT 
        u.Ubicacion, 
        u.DescripcionUbicacion,
        'NORMAL' AS TipoUbicacion,
        (SELECT COUNT(DISTINCT s.CodigoArticulo)
         FROM AcumuladoStockUbicacion s 
         WHERE s.CodigoEmpresa = u.CodigoEmpresa 
           AND s.CodigoAlmacen = u.CodigoAlmacen 
           AND s.Ubicacion = u.Ubicacion 
           AND s.Periodo = 99 
           AND s.UnidadSaldo > 0) AS CantidadArticulos
      FROM Ubicaciones u
      WHERE u.CodigoEmpresa = @codigoEmpresa 
        AND u.CodigoAlmacen = @codigoAlmacen
    `;
    
    const request = getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen);

    // Excluir ubicación específica si se proporciona
    if (excluirUbicacion) {
      query += ' AND u.Ubicacion <> @excluirUbicacion';
      request.input('excluirUbicacion', sql.VarChar, excluirUbicacion);
    }

    // Incluir opción de Sin Ubicación si se solicita
    if (incluirSinUbicacion === 'true') {
      query = `
        ${query}
        UNION ALL
        SELECT 
          'SIN-UBICACION' AS Ubicacion,
          'Stock sin ubicación asignada' AS DescripcionUbicacion,
          'SIN_UBICACION' AS TipoUbicacion,
          (SELECT COUNT(DISTINCT s.CodigoArticulo)
           FROM AcumuladoStock s
           LEFT JOIN AcumuladoStockUbicacion su 
             ON su.CodigoEmpresa = s.CodigoEmpresa 
             AND su.CodigoAlmacen = s.CodigoAlmacen 
             AND su.CodigoArticulo = s.CodigoArticulo
             AND su.TipoUnidadMedida_ = s.TipoUnidadMedida_
             AND ISNULL(su.Partida, '') = ISNULL(s.Partida, '')
             AND ISNULL(su.CodigoColor_, '') = ISNULL(s.CodigoColor_, '')
             AND ISNULL(su.CodigoTalla01_, '') = ISNULL(s.CodigoTalla01_, '')
             AND su.Periodo = 99
             AND su.UnidadSaldo > 0
           WHERE s.CodigoEmpresa = @codigoEmpresa
             AND s.CodigoAlmacen = @codigoAlmacen
             AND s.Periodo = 99
             AND s.UnidadSaldo > 0
             AND su.CodigoArticulo IS NULL) AS CantidadArticulos
      `;
    }

    query += ' ORDER BY Ubicacion';
    
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR UBICACIONES COMPLETAS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener ubicaciones.',
      error: err.message 
    });
  }
});

// ✅ 10.3 ACTUALIZAR STOCK Y REGISTRAR TRASPASO (VERSIÓN CORREGIDA - UNIDADES ALTERNATIVAS)
router.post('/traspaso', async (req, res) => {
    const { 
        articulo, 
        origenAlmacen, 
        origenUbicacion, 
        destinoAlmacen, 
        destinoUbicacion, 
        cantidad, 
        unidadMedida, 
        partida, 
        codigoTalla, 
        codigoColor,
        esSinUbicacion = false 
    } = req.body;

    const usuario = req.user.UsuarioLogicNet;
    const codigoEmpresa = req.user.CodigoEmpresa;
    const ejercicio = new Date().getFullYear();

    console.log('🔍 [TRASPASO] Datos recibidos:', {
        articulo, origenAlmacen, origenUbicacion, destinoAlmacen, destinoUbicacion,
        cantidad, unidadMedida, partida, codigoTalla, codigoColor, esSinUbicacion
    });

    // Validaciones básicas
    const cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
        return res.status(400).json({ 
            success: false, 
            mensaje: 'La cantidad debe ser un número válido y positivo.' 
        });
    }

    if (!articulo || !origenAlmacen || !origenUbicacion || !destinoAlmacen || !destinoUbicacion) {
        return res.status(400).json({ 
            success: false, 
            mensaje: 'Faltan campos requeridos para el traspaso.' 
        });
    }

    if (origenAlmacen === destinoAlmacen && origenUbicacion === destinoUbicacion) {
        return res.status(400).json({ 
            success: false, 
            mensaje: 'No puedes traspasar a la misma ubicación de origen.' 
        });
    }

    const transaction = new sql.Transaction(getPool());
    
    try {
        await transaction.begin();
        
        // 🔥 CORRECCIÓN CRÍTICA: Normalizar valores NULL/vacíos
        const partidaNormalizada = partida || '';
        const codigoTallaNormalizado = codigoTalla || '';
        const codigoColorNormalizado = codigoColor || '';
        
        // 🔥 CORRECCIÓN: Manejo correcto de unidades
        const unidadMedidaBD = unidadMedida === 'unidades' ? '' : unidadMedida;

        console.log('📊 [TRASPASO] Valores normalizados:', {
            partidaNormalizada, codigoTallaNormalizado, codigoColorNormalizado, unidadMedidaBD
        });

        // 1. OBTENER STOCK ORIGEN - CONSULTA MEJORADA CON UNIDAD_SALDO_TIPO
        console.log('🔍 [TRASPASO] Buscando stock en origen...');
        const requestStockOrigen = new sql.Request(transaction);
        
        const queryStockOrigen = `
            SELECT 
                Ubicacion,
                TipoUnidadMedida_,
                Partida,
                CodigoColor_,
                CodigoTalla01_,
                UnidadSaldo,
                UnidadSaldoTipo_,
                -- 🔥 NUEVO: Obtener información del artículo para determinar unidad base
                (SELECT UnidadMedida2_ FROM Articulos WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo) AS UnidadBase,
                (SELECT UnidadMedidaAlternativa_ FROM Articulos WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo) AS UnidadAlternativa
            FROM AcumuladoStockUbicacion
            WHERE CodigoEmpresa = @codigoEmpresa
                AND Ejercicio = @ejercicio
                AND CodigoAlmacen = @codigoAlmacen
                AND Ubicacion = @ubicacion
                AND CodigoArticulo = @codigoArticulo
                AND TipoUnidadMedida_ = @tipoUnidadMedida
                AND Periodo = 99
                -- 🔥 CORRECCIÓN CRÍTICA: Buscar en UnidadSaldoTipo_ cuando hay variantes
                AND (UnidadSaldo > 0 OR UnidadSaldoTipo_ > 0)
                -- 🔥 CORRECCIÓN: Manejo flexible de NULLs y vacíos
                AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
                AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
                AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
        `;

        const stockOrigenResult = await requestStockOrigen
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('ubicacion', sql.VarChar, origenUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('tipoUnidadMedida', sql.VarChar, unidadMedidaBD)
            .input('partida', sql.VarChar, partidaNormalizada)
            .input('codigoColor', sql.VarChar, codigoColorNormalizado)
            .input('codigoTalla', sql.VarChar, codigoTallaNormalizado)
            .query(queryStockOrigen);

        console.log('📊 [TRASPASO] Resultados de stock origen:', stockOrigenResult.recordset);

        if (stockOrigenResult.recordset.length === 0) {
            // 🔥 INTENTAR FALLBACK: Buscar sin considerar variantes específicas
            console.log('🔄 [TRASPASO] Intentando búsqueda alternativa...');
            const requestStockFallback = new sql.Request(transaction);
            
            const fallbackResult = await requestStockFallback
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, origenAlmacen)
                .input('ubicacion', sql.VarChar, origenUbicacion)
                .input('codigoArticulo', sql.VarChar, articulo)
                .input('tipoUnidadMedida', sql.VarChar, unidadMedidaBD)
                .query(`
                    SELECT 
                        Ubicacion,
                        TipoUnidadMedida_,
                        Partida,
                        CodigoColor_,
                        CodigoTalla01_,
                        UnidadSaldo,
                        UnidadSaldoTipo_,
                        (SELECT UnidadMedida2_ FROM Articulos WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo) AS UnidadBase,
                        (SELECT UnidadMedidaAlternativa_ FROM Articulos WHERE CodigoEmpresa = @codigoEmpresa AND CodigoArticulo = @codigoArticulo) AS UnidadAlternativa
                    FROM AcumuladoStockUbicacion
                    WHERE CodigoEmpresa = @codigoEmpresa
                        AND Ejercicio = @ejercicio
                        AND CodigoAlmacen = @codigoAlmacen
                        AND Ubicacion = @ubicacion
                        AND CodigoArticulo = @codigoArticulo
                        AND TipoUnidadMedida_ = @tipoUnidadMedida
                        AND Periodo = 99
                        -- 🔥 CORRECCIÓN: Incluir también en el fallback
                        AND (UnidadSaldo > 0 OR UnidadSaldoTipo_ > 0)
                    ORDER BY UnidadSaldoTipo_ DESC, UnidadSaldo DESC
                `);

            console.log('📊 [TRASPASO] Resultados fallback:', fallbackResult.recordset);

            if (fallbackResult.recordset.length === 0) {
                throw new Error(`Stock en ubicación de origen no encontrado. Artículo: ${articulo}, Almacén: ${origenAlmacen}, Ubicación: ${origenUbicacion}, Unidad: ${unidadMedida}`);
            }

            // Usar el primer resultado del fallback
            const stockItem = fallbackResult.recordset[0];
            console.log('✅ [TRASPASO] Usando registro fallback:', stockItem);
        }

        const stockItems = stockOrigenResult.recordset.length > 0 ? stockOrigenResult.recordset : fallbackResult.recordset;
        const stockItem = stockItems[0];

        // 🔥 CORRECCIÓN CRÍTICA: Determinar qué campo usar para el stock
        let stockActual = 0;
        const unidadBase = stockItem.UnidadBase || '';
        const unidadAlternativa = stockItem.UnidadAlternativa || '';
        
        console.log('🔍 [TRASPASO] Información de unidades:', {
            unidadBase,
            unidadAlternativa,
            tipoUnidadMedida: stockItem.TipoUnidadMedida_,
            unidadSaldo: stockItem.UnidadSaldo,
            unidadSaldoTipo: stockItem.UnidadSaldoTipo_
        });

        // 🔥 LÓGICA MEJORADA: Usar UnidadSaldoTipo_ cuando es unidad alternativa o hay variantes
        if (stockItem.TipoUnidadMedida_ === unidadAlternativa || 
            stockItem.CodigoColor_ || 
            stockItem.CodigoTalla01_ ||
            stockItem.UnidadSaldoTipo_ > stockItem.UnidadSaldo) {
            
            // Es unidad alternativa o tiene variantes - usar UnidadSaldoTipo_
            stockActual = stockItem.UnidadSaldoTipo_;
            console.log('🔍 [TRASPASO] Usando UnidadSaldoTipo_ (unidad alternativa/variantes):', stockActual);
        } else {
            // Es unidad base - usar UnidadSaldo
            stockActual = stockItem.UnidadSaldo;
            console.log('🔍 [TRASPASO] Usando UnidadSaldo (unidad base):', stockActual);
        }

        // Asegurarse de que tenemos un valor válido
        if (isNaN(stockActual) || stockActual < 0) {
            stockActual = 0;
        }
        
        console.log('📊 [TRASPASO] Stock actual calculado:', {
            stockActual,
            ubicacion: stockItem.Ubicacion,
            unidad: stockItem.TipoUnidadMedida_,
            partida: stockItem.Partida,
            color: stockItem.CodigoColor_,
            talla: stockItem.CodigoTalla01_,
            unidadBase,
            unidadAlternativa
        });

        if (cantidadNum > stockActual) {
            throw new Error(`Cantidad solicitada (${cantidadNum}) supera el stock disponible (${stockActual})`);
        }

        // 2. ACTUALIZAR STOCK ORIGEN
        const nuevoStockOrigen = stockActual - cantidadNum;
        console.log('🔄 [TRASPASO] Actualizando stock origen:', { stockActual, cantidadNum, nuevoStockOrigen });

        // 🔥 CORRECCIÓN: Actualizar ambos campos - UnidadSaldo y UnidadSaldoTipo_
        if (nuevoStockOrigen === 0) {
            // Eliminar registro si queda en cero
            const requestEliminarOrigen = new sql.Request(transaction);
            await requestEliminarOrigen
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, origenAlmacen)
                .input('ubicacion', sql.VarChar, origenUbicacion)
                .input('codigoArticulo', sql.VarChar, articulo)
                .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
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
                        AND Periodo = 99
                `);
        } else {
            // Actualizar registro existente - AMBOS CAMPOS
            const requestActualizarOrigen = new sql.Request(transaction);
            await requestActualizarOrigen
                .input('nuevoStock', sql.Decimal(18,4), nuevoStockOrigen)
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, origenAlmacen)
                .input('ubicacion', sql.VarChar, origenUbicacion)
                .input('codigoArticulo', sql.VarChar, articulo)
                .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
                .input('partida', sql.VarChar, stockItem.Partida || '')
                .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
                .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
                .query(`
                    UPDATE AcumuladoStockUbicacion
                    SET UnidadSaldo = @nuevoStock,
                        UnidadSaldoTipo_ = @nuevoStock
                    WHERE CodigoEmpresa = @codigoEmpresa
                        AND Ejercicio = @ejercicio
                        AND CodigoAlmacen = @codigoAlmacen
                        AND Ubicacion = @ubicacion
                        AND CodigoArticulo = @codigoArticulo
                        AND TipoUnidadMedida_ = @tipoUnidadMedida
                        AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
                        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
                        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
                        AND Periodo = 99
                `);
        }

        // 3. ACTUALIZAR/CREAR STOCK DESTINO
        console.log('🔄 [TRASPASO] Actualizando stock destino...');
        const requestStockDestino = new sql.Request(transaction);
        
        const stockDestinoResult = await requestStockDestino
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
            .input('ubicacion', sql.VarChar, destinoUbicacion)
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
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
                    AND Periodo = 99
            `);

        let stockDestinoActual = 0;
        if (stockDestinoResult.recordset.length > 0) {
            const destinoItem = stockDestinoResult.recordset[0];
            // 🔥 CORRECCIÓN: Misma lógica para destino - determinar qué campo usar
            if (stockItem.TipoUnidadMedida_ === unidadAlternativa || 
                stockItem.CodigoColor_ || 
                stockItem.CodigoTalla01_) {
                stockDestinoActual = destinoItem.UnidadSaldoTipo_;
            } else {
                stockDestinoActual = destinoItem.UnidadSaldo;
            }
        }

        const nuevoStockDestino = stockDestinoActual + cantidadNum;
        console.log('📊 [TRASPASO] Stock destino:', { stockDestinoActual, cantidadNum, nuevoStockDestino });

        const requestUpsertDestino = new sql.Request(transaction);
        
        if (stockDestinoResult.recordset.length > 0) {
            // Actualizar registro existente - AMBOS CAMPOS
            await requestUpsertDestino
                .input('nuevoStock', sql.Decimal(18,4), nuevoStockDestino)
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
                .input('ubicacion', sql.VarChar, destinoUbicacion)
                .input('codigoArticulo', sql.VarChar, articulo)
                .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
                .input('partida', sql.VarChar, stockItem.Partida || '')
                .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
                .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
                .query(`
                    UPDATE AcumuladoStockUbicacion
                    SET UnidadSaldo = @nuevoStock,
                        UnidadSaldoTipo_ = @nuevoStock
                    WHERE CodigoEmpresa = @codigoEmpresa
                        AND Ejercicio = @ejercicio
                        AND CodigoAlmacen = @codigoAlmacen
                        AND Ubicacion = @ubicacion
                        AND CodigoArticulo = @codigoArticulo
                        AND TipoUnidadMedida_ = @tipoUnidadMedida
                        AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
                        AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
                        AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
                        AND Periodo = 99
                `);
        } else {
            // Insertar nuevo registro - AMBOS CAMPOS
            await requestUpsertDestino
                .input('nuevoStock', sql.Decimal(18,4), nuevoStockDestino)
                .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
                .input('ejercicio', sql.Int, ejercicio)
                .input('codigoAlmacen', sql.VarChar, destinoAlmacen)
                .input('ubicacion', sql.VarChar, destinoUbicacion)
                .input('codigoArticulo', sql.VarChar, articulo)
                .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
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
                        @nuevoStock, @nuevoStock, 99
                    )
                `);
        }

        // 4. ACTUALIZAR ACUMULADOSTOCK PARA MANTENER CONSISTENCIA
        console.log('🔄 [TRASPASO] Actualizando AcumuladoStock...');
        await actualizarAcumuladoStockGlobal(transaction, codigoEmpresa, ejercicio, origenAlmacen, articulo, stockItem);
        await actualizarAcumuladoStockGlobal(transaction, codigoEmpresa, ejercicio, destinoAlmacen, articulo, stockItem);

        // 5. REGISTRAR MOVIMIENTO
        console.log('📝 [TRASPASO] Registrando movimiento...');
        const fechaActual = new Date();
        const periodo = fechaActual.getMonth() + 1;
        const fechaSolo = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), fechaActual.getDate());
        
        const requestMov = new sql.Request(transaction);
        await requestMov
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.SmallInt, fechaActual.getFullYear())
            .input('periodo', sql.Int, periodo)
            .input('fecha', sql.Date, fechaSolo)
            .input('fechaRegistro', sql.DateTime, fechaActual)
            .input('tipoMovimiento', sql.SmallInt, 3) // 3 = Traspaso
            .input('codigoArticulo', sql.VarChar, articulo)
            .input('codigoAlmacen', sql.VarChar, origenAlmacen)
            .input('almacenContrapartida', sql.VarChar, destinoAlmacen)
            .input('ubicacion', sql.VarChar, origenUbicacion)
            .input('ubicacionContrapartida', sql.VarChar, destinoUbicacion)
            .input('partida', sql.VarChar, stockItem.Partida || '')
            .input('unidades', sql.Decimal(18,4), cantidadNum)
            .input('comentario', sql.VarChar, `Traspaso por ${usuario}`)
            .input('unidadMedida', sql.VarChar, unidadMedida)
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
        console.log('✅ [TRASPASO] Traspaso completado exitosamente');

        res.json({ 
            success: true, 
            mensaje: 'Traspaso realizado con éxito',
            datos: {
                articulo,
                origen: `${origenAlmacen}-${origenUbicacion}`,
                destino: `${destinoAlmacen}-${destinoUbicacion}`,
                cantidad: cantidadNum,
                unidad: unidadMedida
            }
        });
        
    } catch (err) {
        if (transaction._aborted === false) {
            await transaction.rollback();
            console.log('❌ [TRASPASO] Transacción revertida');
        }
        console.error('❌ [ERROR TRASPASO]', err);
        res.status(500).json({ 
            success: false, 
            mensaje: 'Error al realizar el traspaso',
            error: err.message
        });
    }
});

// 🔥 FUNCIÓN AUXILIAR: ACTUALIZAR ACUMULADOSTOCK GLOBAL
async function actualizarAcumuladoStockGlobal(transaction, codigoEmpresa, ejercicio, codigoAlmacen, codigoArticulo, stockItem) {
    try {
        const request = new sql.Request(transaction);
        
        await request
            .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
            .input('ejercicio', sql.Int, ejercicio)
            .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
            .input('codigoArticulo', sql.VarChar, codigoArticulo)
            .input('tipoUnidadMedida', sql.VarChar, stockItem.TipoUnidadMedida_)
            .input('partida', sql.VarChar, stockItem.Partida || '')
            .input('codigoColor', sql.VarChar, stockItem.CodigoColor_ || '')
            .input('codigoTalla', sql.VarChar, stockItem.CodigoTalla01_ || '')
            .query(`
                -- Calcular stock total sumando todas las ubicaciones
                DECLARE @StockTotal DECIMAL(18,4);
                
                SELECT @StockTotal = SUM(UnidadSaldo)
                FROM AcumuladoStockUbicacion
                WHERE CodigoEmpresa = @codigoEmpresa
                    AND Ejercicio = @ejercicio
                    AND CodigoAlmacen = @codigoAlmacen
                    AND CodigoArticulo = @codigoArticulo
                    AND TipoUnidadMedida_ = @tipoUnidadMedida
                    AND (Partida = @partida OR (Partida IS NULL AND @partida = '') OR (Partida = '' AND @partida = ''))
                    AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = '') OR (CodigoColor_ = '' AND @codigoColor = ''))
                    AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = '') OR (CodigoTalla01_ = '' AND @codigoTalla = ''))
                    AND Periodo = 99;
                
                -- UPSERT en AcumuladoStock
                MERGE INTO AcumuladoStock AS target
                USING (VALUES (
                    @codigoEmpresa, @ejercicio, @codigoAlmacen, @codigoArticulo,
                    @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla
                )) AS source (
                    CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                    TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_
                )
                ON target.CodigoEmpresa = source.CodigoEmpresa
                    AND target.Ejercicio = source.Ejercicio
                    AND target.CodigoAlmacen = source.CodigoAlmacen
                    AND target.CodigoArticulo = source.CodigoArticulo
                    AND target.TipoUnidadMedida_ = source.TipoUnidadMedida_
                    AND ISNULL(target.Partida, '') = ISNULL(source.Partida, '')
                    AND ISNULL(target.CodigoColor_, '') = ISNULL(source.CodigoColor_, '')
                    AND ISNULL(target.CodigoTalla01_, '') = ISNULL(source.CodigoTalla01_, '')
                    AND target.Periodo = 99
                
                WHEN MATCHED THEN
                    UPDATE SET 
                        UnidadSaldo = @StockTotal,
                        UnidadSaldoTipo_ = @StockTotal
                
                WHEN NOT MATCHED THEN
                    INSERT (
                        CodigoEmpresa, Ejercicio, CodigoAlmacen, CodigoArticulo,
                        TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
                        UnidadSaldo, UnidadSaldoTipo_, Periodo
                    ) VALUES (
                        @codigoEmpresa, @ejercicio, @codigoAlmacen, @codigoArticulo,
                        @tipoUnidadMedida, @partida, @codigoColor, @codigoTalla,
                        @StockTotal, @StockTotal, 99
                    );
            `);
            
        console.log('✅ AcumuladoStock actualizado para', codigoArticulo, 'en', codigoAlmacen);
    } catch (error) {
        console.error('❌ Error actualizando AcumuladoStock:', error);
        throw error;
    }
}

// ✅ 10.4 OBTENER HISTORIAL DE TRASPASOS (VERSIÓN COMPLETAMENTE CORREGIDA)
router.get('/historial-traspasos', async (req, res) => {
  const codigoEmpresa = req.user.CodigoEmpresa;
  const { fecha, page = 1, pageSize = 50 } = req.query;

  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido.' 
    });
  }

  try {
    const offset = (page - 1) * pageSize;
    
    let whereClause = `WHERE m.CodigoEmpresa = @codigoEmpresa AND m.TipoMovimiento = 3`;
    const request = getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa);

    if (fecha) {
      whereClause += ` AND CONVERT(date, m.FechaRegistro) = @fecha`;
      request.input('fecha', sql.Date, fecha);
    }

    // CONSULTA COMPLETAMENTE CORREGIDA - Usando solo columnas existentes
    const query = `
      SELECT 
        m.CodigoArticulo,
        a.DescripcionArticulo,
        m.CodigoAlmacen AS OrigenAlmacen,
        alm_origen.Almacen AS NombreAlmacenOrigen,
        m.Ubicacion AS OrigenUbicacion,
        m.AlmacenContrapartida AS DestinoAlmacen,
        alm_destino.Almacen AS NombreAlmacenDestino,
        m.UbicacionContrapartida AS DestinoUbicacion,
        m.Unidades AS Cantidad,
        m.UnidadMedida1_ AS UnidadMedida,
        m.Partida,
        m.CodigoTalla01_,
        m.CodigoColor_,
        m.Comentario,
        m.FechaRegistro,
        FORMAT(m.FechaRegistro, 'dd/MM/yyyy HH:mm:ss') AS FechaFormateada,
        u_origen.DescripcionUbicacion AS DescripcionUbicacionOrigen,
        u_destino.DescripcionUbicacion AS DescripcionUbicacionDestino
      FROM MovimientoStock m
      LEFT JOIN Articulos a 
        ON a.CodigoEmpresa = m.CodigoEmpresa 
        AND a.CodigoArticulo = m.CodigoArticulo
      LEFT JOIN Almacenes alm_origen 
        ON alm_origen.CodigoEmpresa = m.CodigoEmpresa 
        AND alm_origen.CodigoAlmacen = m.CodigoAlmacen
      LEFT JOIN Almacenes alm_destino 
        ON alm_destino.CodigoEmpresa = m.CodigoEmpresa 
        AND alm_destino.CodigoAlmacen = m.AlmacenContrapartida
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
      OFFSET ${offset} ROWS
      FETCH NEXT ${pageSize} ROWS ONLY
    `;

    const result = await request.query(query);
    
    // Obtener total de registros
    const countResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT COUNT(*) as Total
        FROM MovimientoStock m
        WHERE m.CodigoEmpresa = @codigoEmpresa 
          AND m.TipoMovimiento = 3
      `);

    const total = countResult.recordset[0]?.Total || 0;
    const totalPages = Math.ceil(total / pageSize);

    res.json({
      success: true,
      traspasos: result.recordset,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: total,
        totalPages: totalPages
      }
    });
  } catch (err) {
    console.error('[ERROR HISTORIAL TRASPASOS]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener historial de traspasos.',
      error: err.message 
    });
  }
});


// ✅ ENDPOINT DE DIAGNÓSTICO RÁPIDO
router.get('/debug/stock-articulo', async (req, res) => {
  const { codigoEmpresa, codigoArticulo } = req.query;
  
  try {
    // Stock en AcumuladoStockUbicacion
    const stockUbicacion = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT 
          CodigoAlmacen, Ubicacion, UnidadSaldo, TipoUnidadMedida_,
          Partida, CodigoColor_, CodigoTalla01_, Periodo
        FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoArticulo = @codigoArticulo
          AND Periodo = 99
          AND UnidadSaldo > 0
        ORDER BY UnidadSaldo DESC
      `);

    // Stock total en AcumuladoStock
    const stockTotal = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT 
          CodigoAlmacen, TipoUnidadMedida_, SUM(UnidadSaldo) as StockTotal
        FROM AcumuladoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoArticulo = @codigoArticulo
          AND Periodo = 99
        GROUP BY CodigoAlmacen, TipoUnidadMedida_
      `);

    res.json({
      success: true,
      stockUbicacion: stockUbicacion.recordset,
      stockTotal: stockTotal.recordset,
      mensaje: `Diagnóstico para artículo ${codigoArticulo}`
    });
  } catch (err) {
    console.error('[ERROR DIAGNOSTICO]', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// ✅ OBTENER STOCK POR ARTÍCULO (PARA TRASPASOS)
router.get('/traspasos/stock-por-articulo', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoArticulo } = req.query;
  const codigoEmpresa = req.user.CodigoEmpresa;

  if (!codigoArticulo) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de artículo requerido' 
    });
  }

  try {
    console.log(`[TRASPASOS] Obteniendo stock para artículo ${codigoArticulo}`);

    const contexto = await obtenerContextoStockArticulo(codigoEmpresa, codigoArticulo);
    console.log(`[TRASPASOS] Base de stock por ubicacion: ${contexto.ejercicioBase}/${contexto.periodoBase}`);

    const query = `
      SELECT 
        s.CodigoArticulo,
        COALESCE(a.DescripcionArticulo, s.CodigoArticulo) AS DescripcionArticulo,
        s.CodigoAlmacen,
        alm.Almacen AS NombreAlmacen,
        s.Ubicacion,
        u.DescripcionUbicacion,
        s.TipoUnidadMedida_ AS UnidadStock,
        CASE
          WHEN NULLIF(LTRIM(RTRIM(s.TipoUnidadMedida_)), '') = NULLIF(LTRIM(RTRIM(a.UnidadMedidaAlternativa_)), '')
            THEN CAST(COALESCE(s.UnidadSaldoTipo_, 0) * COALESCE(NULLIF(a.FactorConversion_, 0), 1) AS DECIMAL(18, 4))
          ELSE CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18, 4))
        END AS CantidadBase,
        CAST(COALESCE(s.UnidadSaldoTipo_, s.UnidadSaldo, 0) AS DECIMAL(18, 4)) AS Cantidad,
        s.Partida,
        s.CodigoColor_,
        s.CodigoTalla01_,
        a.UnidadMedida2_ AS UnidadBase,
        a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
        a.FactorConversion_ AS FactorConversion,
        CASE 
          WHEN s.Ubicacion = 'SIN-UBICACION' OR s.Ubicacion IS NULL THEN 1
          ELSE 0
        END AS EsSinUbicacion,
        CONCAT(
          s.CodigoArticulo, '_', 
          s.CodigoAlmacen, '_', 
          s.Ubicacion, '_', 
          s.TipoUnidadMedida_, '_',
          ISNULL(s.Partida, ''), '_',
          ISNULL(s.CodigoColor_, ''), '_',
          ISNULL(s.CodigoTalla01_, '')
        ) AS ClaveUnica
      FROM AcumuladoStockUbicacion s
      OUTER APPLY (
        SELECT TOP 1 a.*
        FROM Articulos a
        WHERE a.CodigoEmpresa = s.CodigoEmpresa
          AND (
            LTRIM(RTRIM(a.CodigoArticulo)) = LTRIM(RTRIM(s.CodigoArticulo))
            OR LTRIM(RTRIM(ISNULL(a.CodigoAlternativo, ''))) = LTRIM(RTRIM(s.CodigoArticulo))
            OR LTRIM(RTRIM(ISNULL(a.CodigoAlternativo2, ''))) = LTRIM(RTRIM(s.CodigoArticulo))
            OR LTRIM(RTRIM(ISNULL(a.CodigoArticuloOferta, ''))) = LTRIM(RTRIM(s.CodigoArticulo))
            OR LTRIM(RTRIM(ISNULL(a.ReferenciaEdi_, ''))) = LTRIM(RTRIM(s.CodigoArticulo))
            OR (
              TRY_CONVERT(BIGINT, s.CodigoArticulo) IS NOT NULL
              AND (
                TRY_CONVERT(BIGINT, a.CodigoArticulo) = TRY_CONVERT(BIGINT, s.CodigoArticulo)
                OR TRY_CONVERT(BIGINT, a.CodigoAlternativo) = TRY_CONVERT(BIGINT, s.CodigoArticulo)
                OR TRY_CONVERT(BIGINT, a.CodigoAlternativo2) = TRY_CONVERT(BIGINT, s.CodigoArticulo)
                OR TRY_CONVERT(BIGINT, a.CodigoArticuloOferta) = TRY_CONVERT(BIGINT, s.CodigoArticulo)
                OR TRY_CONVERT(BIGINT, a.ReferenciaEdi_) = TRY_CONVERT(BIGINT, s.CodigoArticulo)
              )
            )
          )
        ORDER BY
          CASE
            WHEN LTRIM(RTRIM(a.CodigoArticulo)) = LTRIM(RTRIM(s.CodigoArticulo)) THEN 0
            WHEN TRY_CONVERT(BIGINT, a.CodigoArticulo) = TRY_CONVERT(BIGINT, s.CodigoArticulo) THEN 1
            WHEN LTRIM(RTRIM(ISNULL(a.CodigoAlternativo, ''))) = LTRIM(RTRIM(s.CodigoArticulo)) THEN 2
            WHEN LTRIM(RTRIM(ISNULL(a.CodigoAlternativo2, ''))) = LTRIM(RTRIM(s.CodigoArticulo)) THEN 3
            WHEN LTRIM(RTRIM(ISNULL(a.CodigoArticuloOferta, ''))) = LTRIM(RTRIM(s.CodigoArticulo)) THEN 4
            WHEN LTRIM(RTRIM(ISNULL(a.ReferenciaEdi_, ''))) = LTRIM(RTRIM(s.CodigoArticulo)) THEN 5
            ELSE 6
          END,
          a.CodigoArticulo
      ) a
      INNER JOIN Almacenes alm 
        ON alm.CodigoEmpresa = s.CodigoEmpresa 
        AND alm.CodigoAlmacen = s.CodigoAlmacen
      LEFT JOIN Ubicaciones u 
        ON u.CodigoEmpresa = s.CodigoEmpresa 
        AND u.CodigoAlmacen = s.CodigoAlmacen 
        AND u.Ubicacion = s.Ubicacion
      WHERE s.CodigoEmpresa = @codigoEmpresa
        AND s.Ejercicio = @ejercicioBase
        AND s.Periodo = @periodoBase
        AND s.CodigoArticulo = @codigoArticulo
        AND NULLIF(LTRIM(RTRIM(s.CodigoAlmacen)), '') IS NOT NULL
        AND NULLIF(LTRIM(RTRIM(s.Ubicacion)), '') IS NOT NULL
        AND s.UnidadSaldoTipo_ > 0  -- Solo stock disponible
      ORDER BY 
        s.CodigoAlmacen,
        s.Ubicacion,
        s.UnidadSaldoTipo_ DESC
    `;

    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioBase', sql.SmallInt, contexto.ejercicioBase)
      .input('periodoBase', sql.SmallInt, contexto.periodoBase)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(query);

    console.log(`[TRASPASOS] Encontradas ${result.recordset.length} ubicaciones para ${codigoArticulo}`);

    res.json(result.recordset);

  } catch (error) {
    console.error('[ERROR STOCK POR ARTICULO TRASPASOS]', error);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener stock para traspasos',
      error: error.message 
    });
  }
});


// ============================================
// ✅ 9. INVENTARIO SCREEN
// ============================================


  return router;
};
