const express = require('express');

module.exports = function createpedidosVentaRouter({ sql, getPool, clienteConfig }) {
  const router = express.Router();

router.get('/pedidosPendientes', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ 
      success: false, 
      mensaje: 'No autenticado' 
    });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  
  if (!codigoEmpresa) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Código de empresa requerido' 
    });
  }

  try {
    // 1. Obtener parámetros de filtro
    const rangoDias = req.query.rango || 'semana';
    const FormaEnvio = req.query.FormaEnvio;
    const empleado = req.query.empleado;
    const estadosPedido = req.query.estados ? req.query.estados.split(',') : [];
    const empleadoAsignado = req.query.empleadoAsignado;
    
    // 2. Calcular fechas según rango (ahora soporta 'todos')
    const hoy = new Date();
    let fechaInicio, fechaFinExclusiva;

    if (rangoDias === 'todos') {
      // Fechas muy amplias para no filtrar por tiempo (todos los pedidos históricos)
      fechaInicio = new Date('1900-01-01');
      fechaFinExclusiva = new Date('2100-01-01');
      console.log('[PEDIDOS] Rango = TODOS, sin filtro de fechas');
    } else if (rangoDias === 'dia') {
      fechaInicio = new Date(hoy);
      fechaInicio.setDate(hoy.getDate() - 1);
      fechaFinExclusiva = new Date(hoy);
      fechaFinExclusiva.setDate(hoy.getDate() + 2);
      console.log('[PEDIDOS] Rango = día');
    } else { // semana por defecto
      fechaInicio = new Date(hoy);
      fechaInicio.setDate(hoy.getDate() - 7);
      fechaFinExclusiva = new Date(hoy);
      fechaFinExclusiva.setDate(hoy.getDate() + 8);
      console.log('[PEDIDOS] Rango = semana');
    }

    fechaInicio.setHours(0, 0, 0, 0);
    fechaFinExclusiva.setHours(0, 0, 0, 0);
    
    // 3. Mapeo de formas de entrega (desde config del cliente)
    const formasEntregaMap = clienteConfig.formasEnvio;

    // 4. Construir consulta base
    let sqlQuery = `
      SELECT 
        c.CodigoEmpresa,
        c.EjercicioPedido,
        c.SeriePedido,
        c.NumeroPedido,
        c.RazonSocial,
        c.Domicilio,
        c.Municipio,
        c.ObservacionesWeb AS Observaciones,
        c.NombreObra,
        c.FechaPedido,
        c.FechaEntrega,
        c.FormaEnvio,
        c.Estado,
        c.StatusAprobado,
        CASE 
          WHEN c.Estado = 0 AND c.StatusAprobado = 0 THEN 'Revision'
          WHEN c.Estado = 0 AND c.StatusAprobado = -1 THEN 'Preparando'
          WHEN c.Estado = 2 AND c.StatusAprobado = -1 THEN 'Servido'
          WHEN c.Estado = 4 THEN 'Parcial'
          ELSE 'Desconocido'
        END AS Status,
        c.EsVoluminoso,
        c.EmpleadoAsignado,
        c.Contacto,
        c.Telefono AS TelefonoContacto,
        c.Vendedor,
        l.CodigoArticulo,
        l.DescripcionArticulo,
        l.Descripcion2Articulo,
        l.UnidadesPedidas, 
        l.UnidadesPendientes,
        l.UnidadesServidas,
        (l.UnidadesPedidas - l.UnidadesPendientes) AS UnidadesExpedidas,
        l.CodigoAlmacen,
        a.CodigoAlternativo,
        l.LineasPosicion,
        l.LineasPosicion AS MovPosicionLinea,
        l.UnidadMedida1_ AS UnidadBase,
        l.UnidadMedida2_ AS UnidadAlternativa,
        l.FactorConversion_ AS FactorConversion,
        COALESCE(NULLIF(l.UnidadMedida1_, ''), a.UnidadMedida2_, 'ud') AS UnidadPedido,
        emp.Nombre AS NombreVendedor,
        l.Precio,
        ISNULL(a.PesoBrutoUnitario_, 0) AS PesoUnitario,
        (l.UnidadesPendientes * ISNULL(a.PesoBrutoUnitario_, 0)) AS PesoTotalLinea,
        l.GrupoTalla_
      FROM CabeceraPedidoCliente c
      INNER JOIN LineasPedidoCliente l ON 
        c.CodigoEmpresa = l.CodigoEmpresa 
        AND c.EjercicioPedido = l.EjercicioPedido 
        AND c.SeriePedido = l.SeriePedido 
        AND c.NumeroPedido = l.NumeroPedido
      LEFT JOIN Articulos a ON 
        a.CodigoArticulo = l.CodigoArticulo 
        AND a.CodigoEmpresa = l.CodigoEmpresa
      LEFT JOIN Clientes emp ON 
        emp.CodigoCliente = c.EmpleadoAsignado 
        AND emp.CodigoEmpresa = c.CodigoEmpresa
      WHERE c.Estado IN (0, 4)
        AND c.CodigoEmpresa = @codigoEmpresa
        AND l.UnidadesPendientes > 0
        AND c.SeriePedido NOT IN (${clienteConfig.seriesPedidoExcluidas.map(s => `'${s}'`).join(', ')})
        AND c.FechaPedido >= @fechaInicio 
        AND c.FechaPedido < @fechaFinExclusiva
    `;

    // Filtros adicionales (FormaEnvio, empleado, etc.)
    if (FormaEnvio) {
      sqlQuery += ` AND c.FormaEnvio = @FormaEnvio`;
    }
    if (empleado) {
      sqlQuery += ` AND c.EmpleadoAsignado = @empleado`;
    }
    if (empleadoAsignado) {
      sqlQuery += ` AND c.EmpleadoAsignado = @empleadoAsignado`;
    }
    if (estadosPedido.length > 0) {
      const statusConditions = estadosPedido.map(() => 
        `(CASE WHEN c.Estado = 0 AND c.StatusAprobado = 0 THEN 'Revision'
               WHEN c.Estado = 0 AND c.StatusAprobado = -1 THEN 'Preparando'
               WHEN c.Estado = 2 AND c.StatusAprobado = -1 THEN 'Servido'
               WHEN c.Estado = 4 THEN 'Parcial'
               ELSE 'Desconocido' END) = ?`
      ).join(' OR ');
      sqlQuery += ` AND (${statusConditions})`;
    }
    sqlQuery += ` ORDER BY COALESCE(c.FechaEntrega, c.FechaPedido) ASC`;

    // Preparar request con parámetros
    const request = getPool().request();
    request.input('codigoEmpresa', sql.SmallInt, codigoEmpresa);
    request.input('fechaInicio', sql.DateTime, fechaInicio);
    request.input('fechaFinExclusiva', sql.DateTime, fechaFinExclusiva);
    
    if (FormaEnvio) request.input('FormaEnvio', sql.Int, FormaEnvio);
    if (empleado) request.input('empleado', sql.VarChar, empleado);
    if (empleadoAsignado) request.input('empleadoAsignado', sql.VarChar, empleadoAsignado);
    
    if (estadosPedido.length > 0) {
      estadosPedido.forEach((est, idx) => {
        request.input(`estado${idx}`, sql.VarChar, est);
      });
      let paramIndex = 0;
      sqlQuery = sqlQuery.replace(/\?/g, () => `@estado${paramIndex++}`);
    }

    const result = await request.query(sqlQuery);
    console.log(`[PEDIDOS] Consulta ejecutada. Filas obtenidas: ${result.recordset.length}`);

    // Si no hay resultados, devolver array vacío (frontend mostrará mensaje)
    if (result.recordset.length === 0) {
      return res.json([]);
    }

    // Recopilar IDs para detalles (tallas/colores)
    const lineasIds = [];
    result.recordset.forEach(row => {
      if (row.LineasPosicion) {
        lineasIds.push(row.LineasPosicion);
      }
    });

    let detallesPorLinea = {};
    if (lineasIds.length > 0) {
      const placeholders = lineasIds.map((_, i) => `@id${i}`).join(',');
      const detallesQuery = `
        SELECT 
          lt.MovPosicionLinea_ AS MovPosicionLinea,
          lt.CodigoColor_,
          c.Color_ AS NombreColor,
          lt.GrupoTalla_,
          gt.DescripcionGrupoTalla_ AS NombreGrupoTalla,
          gt.CodigoTalla01_,
          gt.CodigoTalla02_,
          gt.CodigoTalla03_,
          gt.CodigoTalla04_,
          gt.DescripcionTalla01_ AS DescTalla01,
          gt.DescripcionTalla02_ AS DescTalla02,
          gt.DescripcionTalla03_ AS DescTalla03,
          gt.DescripcionTalla04_ AS DescTalla04,
          lt.UnidadesTotalTallas_ AS Unidades,
          lt.UnidadesTalla01_,
          lt.UnidadesTalla02_,
          lt.UnidadesTalla03_,
          lt.UnidadesTalla04_
        FROM LineasPedidoClienteTallas lt
        LEFT JOIN Colores_ c ON 
          lt.CodigoColor_ = c.CodigoColor_ 
          AND lt.CodigoEmpresa = c.CodigoEmpresa
        LEFT JOIN GrupoTallas_ gt ON 
          lt.GrupoTalla_ = gt.GrupoTalla_ 
          AND lt.CodigoEmpresa = gt.CodigoEmpresa
        WHERE lt.CodigoEmpresa = @codigoEmpresa
          AND lt.MovPosicionLinea_ IN (${placeholders})
      `;
      const detallesRequest = getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa);
      lineasIds.forEach((id, index) => {
        detallesRequest.input(`id${index}`, sql.VarChar, id);
      });
      const detallesResult = await detallesRequest.query(detallesQuery);
      
      detallesResult.recordset.forEach(detalle => {
        const key = detalle.MovPosicionLinea;
        if (!detallesPorLinea[key]) detallesPorLinea[key] = [];
        
        const tallasConDescripciones = {};
        if (detalle.CodigoTalla01_ && detalle.UnidadesTalla01_ > 0) {
          tallasConDescripciones[detalle.CodigoTalla01_] = {
            descripcion: detalle.DescTalla01,
            unidades: detalle.UnidadesTalla01_
          };
        }
        if (detalle.CodigoTalla02_ && detalle.UnidadesTalla02_ > 0) {
          tallasConDescripciones[detalle.CodigoTalla02_] = {
            descripcion: detalle.DescTalla02,
            unidades: detalle.UnidadesTalla02_
          };
        }
        if (detalle.CodigoTalla03_ && detalle.UnidadesTalla03_ > 0) {
          tallasConDescripciones[detalle.CodigoTalla03_] = {
            descripcion: detalle.DescTalla03,
            unidades: detalle.UnidadesTalla03_
          };
        }
        if (detalle.CodigoTalla04_ && detalle.UnidadesTalla04_ > 0) {
          tallasConDescripciones[detalle.CodigoTalla04_] = {
            descripcion: detalle.DescTalla04,
            unidades: detalle.UnidadesTalla04_
          };
        }
        
        detallesPorLinea[key].push({
          color: {
            codigo: detalle.CodigoColor_,
            nombre: detalle.NombreColor
          },
          grupoTalla: {
            codigo: detalle.GrupoTalla_,
            nombre: detalle.NombreGrupoTalla
          },
          unidades: detalle.Unidades,
          tallas: tallasConDescripciones
        });
      });
    }

    // Combinar resultados
    const pedidosAgrupados = {};
    result.recordset.forEach(row => {
      const key = `${row.CodigoEmpresa}-${row.EjercicioPedido}-${row.SeriePedido}-${row.NumeroPedido}`;
      
      if (!pedidosAgrupados[key]) {
        pedidosAgrupados[key] = {
          codigoEmpresa: row.CodigoEmpresa,
          ejercicioPedido: row.EjercicioPedido,
          seriePedido: row.SeriePedido,
          numeroPedido: row.NumeroPedido,
          razonSocial: row.RazonSocial,
          domicilio: row.Domicilio,
          municipio: row.Municipio,
          observaciones: row.Observaciones,
          nombreObra: row.NombreObra,
          fechaPedido: row.FechaPedido,
          fechaEntrega: row.FechaEntrega,
          FormaEnvio: formasEntregaMap[row.FormaEnvio] || 'No especificada',
          Estado: row.Estado,
          StatusAprobado: row.StatusAprobado,
          Status: row.Status,
          EsVoluminoso: row.EsVoluminoso,
          EmpleadoAsignado: row.EmpleadoAsignado,
          Contacto: row.Contacto,
          TelefonoContacto: row.TelefonoContacto,
          Vendedor: row.Vendedor,
          NombreVendedor: row.NombreVendedor,
          PesoTotal: 0,
          articulos: []
        };
      }
      
      const pesoLinea = parseFloat(row.PesoTotalLinea) || 0;
      pedidosAgrupados[key].PesoTotal += pesoLinea;

      const detalles = detallesPorLinea[row.LineasPosicion] || [];
      pedidosAgrupados[key].articulos.push({
        codigoArticulo: row.CodigoArticulo,
        descripcionArticulo: row.DescripcionArticulo,
        descripcion2Articulo: row.Descripcion2Articulo,
        unidadesPedidas: row.UnidadesPedidas,
        unidadesPendientes: row.UnidadesPendientes,
        unidadesServidas: row.UnidadesServidas,
        UnidadesExpedidas: row.UnidadesExpedidas,
        codigoAlmacen: row.CodigoAlmacen,
        codigoAlternativo: row.CodigoAlternativo,
        detalles: detalles.length > 0 ? detalles : null,
        movPosicionLinea: row.LineasPosicion,
        unidadBase: row.UnidadBase,
        unidadAlternativa: row.UnidadAlternativa,
        factorConversion: row.FactorConversion,
        unidadPedido: row.UnidadPedido,
        precio: row.Precio,
        pesoUnitario: row.PesoUnitario,
        pesoTotalLinea: row.PesoTotalLinea,
        grupoTalla: row.GrupoTalla_
      });
    });
    
    const pedidosArray = Object.values(pedidosAgrupados);
    console.log(`[PEDIDOS] Total pedidos agrupados: ${pedidosArray.length}`);
    res.json(pedidosArray);
    
  } catch (err) {
    console.error('[ERROR PEDIDOS PENDIENTES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener pedidos pendientes',
      error: err.message,
      stack: err.stack
    });
  }
});

// ✅ NUEVO ENDPOINT: ACTUALIZAR ESTADO VOLUMINOSO
router.post('/pedidos/actualizar-voluminoso', async (req, res) => {
  const { codigoEmpresa, ejercicio, serie, numeroPedido, esVoluminoso } = req.body;

  if (!codigoEmpresa || !ejercicio || !numeroPedido) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan parámetros requeridos.' 
    });
  }

  try {
    await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('esVoluminoso', sql.Bit, esVoluminoso ? 1 : 0)
      .query(`
        UPDATE CabeceraPedidoCliente
        SET EsVoluminoso = @esVoluminoso
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    res.json({ 
      success: true, 
      mensaje: `Pedido ${esVoluminoso ? 'marcado como voluminoso' : 'desmarcado como voluminoso'} correctamente.` 
    });
  } catch (err) {
    console.error('[ERROR ACTUALIZAR VOLUMINOSO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al actualizar estado voluminoso.',
      error: err.message 
    });
  }
});

// ✅ 5.2 Asignar Preparador (VERSIÓN COMPLETA PARA REASIGNACIONES)
router.post('/asignarEmpleado', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autenticado' });
  }

  const { asignaciones } = req.body;

  if (!Array.isArray(asignaciones) || asignaciones.length === 0) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Datos inválidos para asignación' 
    });
  }

  const transaction = new sql.Transaction(getPool());
  
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    
    for (const asignacion of asignaciones) {
      await request
        .input('codigoEmpresa', sql.SmallInt, asignacion.codigoEmpresa)
        .input('ejercicio', sql.SmallInt, asignacion.ejercicioPedido)
        .input('serie', sql.VarChar, asignacion.seriePedido || '')
        .input('numeroPedido', sql.Int, asignacion.numeroPedido)
        .input('empleado', sql.VarChar, asignacion.empleado)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET EmpleadoAsignado = @empleado
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
    }
    
    await transaction.commit();
    res.json({ success: true, mensaje: 'Asignaciones actualizadas correctamente' });
  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR ASIGNAR EMPLEADO]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al asignar empleado', 
      error: err.message 
    });
  }
});

// ============================================================
// ✅ 5.3 ACTUALIZAR LÍNEA DE PEDIDO (VERSIÓN COMPLETA CON LOGS Y ALBARÁN MEJORADO)
// ============================================================
router.post('/actualizarLineaPedido', async (req, res) => {
  const datosLinea = req.body;

  console.log('[BACKEND DEBUG] ===== INICIO ACTUALIZAR LÍNEA =====');
  console.log('[BACKEND DEBUG] Datos recibidos:', {
    codigoArticulo: datosLinea.codigoArticulo,
    cantidadExpedida: datosLinea.cantidadExpedida,
    movPosicionLinea: datosLinea.movPosicionLinea,
    ubicacion: datosLinea.ubicacion,
    almacen: datosLinea.almacen,
    codigoEmpresa: datosLinea.codigoEmpresa,
    ejercicio: datosLinea.ejercicio,
    numeroPedido: datosLinea.numeroPedido
  });

  // Campos obligatorios
  const camposRequeridos = [
    'codigoEmpresa', 'ejercicio', 'numeroPedido',
    'codigoArticulo', 'cantidadExpedida', 'almacen',
    'movPosicionLinea'
  ];
  for (const campo of camposRequeridos) {
    if (!datosLinea[campo]) {
      return res.status(400).json({ success: false, mensaje: `Campo requerido: ${campo}` });
    }
  }
  // ubicacion puede ser '' (sin ubicación asignada) — se valida por separado
  if (datosLinea.ubicacion === undefined || datosLinea.ubicacion === null) {
    return res.status(400).json({ success: false, mensaje: 'Campo requerido: ubicacion' });
  }

  const truncarString = (valor, longitudMaxima) => {
    if (!valor) return '';
    return valor.toString().substring(0, longitudMaxima);
  };

  const codigoColor = datosLinea.codigoColor ? truncarString(datosLinea.codigoColor, 10) : '';
  const codigoTalla = datosLinea.codigoTalla ? truncarString(datosLinea.codigoTalla, 10) : '';
  const partida = datosLinea.partida ? truncarString(datosLinea.partida, 20) : '';

  // Zona descarga eliminada — solo se expide desde ubicaciones con stock real
  if (datosLinea.esZonaDescarga || datosLinea.ubicacion === 'Zona descarga') {
    return res.status(400).json({ success: false, mensaje: 'Zona descarga no permitida. Seleccione una ubicación con stock.' });
  }

  const transaction = new sql.Transaction(getPool());

  try {
    await transaction.begin();
    console.log('[EXPEDICION] Transacción iniciada');

    // 1. OBTENER DATOS DE LA LÍNEA
    const requestLinea = new sql.Request(transaction);
    const resultLinea = await requestLinea
      .input('movPosicionLinea', sql.VarChar, datosLinea.movPosicionLinea)
      .query(`
        SELECT 
          l.LineasPosicion,
          l.CodigoAlmacen, 
          l.DescripcionArticulo,
          l.Descripcion2Articulo,
          l.UnidadMedida1_ AS UnidadMedida, 
          l.Precio, 
          l.Partida,
          l.UnidadesPendientes,
          l.UnidadesServidas,
          l.GrupoTalla_,
          l.GrupoIva,
          l.[%Iva],
          l.PesoBrutoUnitario_,
          l.PesoNetoUnitario_,
          l.VolumenUnitario_,
          l.EjercicioPedido,
          l.NumeroPedido,
          l.SeriePedido,
          l.CodigoEmpresa,
          l.CodigoArticulo,
          a.CodigoFamilia,
          a.CodigoSubfamilia,
          a.UnidadMedida2_ AS UnidadBase,
          a.UnidadMedidaAlternativa_ AS UnidadAlternativa,
          a.FactorConversion_
        FROM LineasPedidoCliente l
        INNER JOIN Articulos a ON a.CodigoArticulo = l.CodigoArticulo AND a.CodigoEmpresa = l.CodigoEmpresa
        WHERE l.LineasPosicion = @movPosicionLinea
      `);

    if (resultLinea.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, mensaje: `Línea no encontrada con LineasPosicion: ${datosLinea.movPosicionLinea}` });
    }

    const lineaData = resultLinea.recordset[0];
    const unidadesPendientes = parseFloat(lineaData.UnidadesPendientes);
    const unidadesServidas = parseFloat(lineaData.UnidadesServidas) || 0;
    const movPosicionLinea = lineaData.LineasPosicion;
    const unidadMedida = lineaData.UnidadMedida || 'unidades';
    const precio = lineaData.Precio;
    const grupoTalla = lineaData.GrupoTalla_ ? (typeof lineaData.GrupoTalla_ === 'number' ? lineaData.GrupoTalla_.toString() : lineaData.GrupoTalla_) : null;

    console.log('[EXPEDICION] Línea obtenida - Pendientes:', unidadesPendientes, 'Servidas:', unidadesServidas);

    // Validar cantidad
    if (datosLinea.cantidadExpedida > unidadesPendientes) {
      await transaction.rollback();
      return res.status(400).json({ success: false, mensaje: `La cantidad a expedir (${datosLinea.cantidadExpedida}) supera las unidades pendientes (${unidadesPendientes}).` });
    }

    const cantidadExpedidaStock = datosLinea.cantidadExpedida;
    let ubicacionFinal = datosLinea.ubicacion;
    let partidaFinal = partida;

    // 2. VERIFICAR STOCK
    // Ubicación vacía o legacy 'SIN-UBICACION' = stock sin desglose por ubicación → leer de AcumuladoStock
    const esSinUbicacion = !datosLinea.ubicacion || datosLinea.ubicacion === '' || datosLinea.ubicacion === 'SIN-UBICACION';

    if (esSinUbicacion) {
        // Stock sin ubicación: leer desde AcumuladoStock (tabla resumen)
        const stockSinUbi = await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
          .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
          .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
          .input('partida', sql.VarChar(20), truncarString(partida, 20))
          .input('codigoColor', sql.VarChar(10), codigoColor)
          .input('codigoTalla', sql.VarChar(10), codigoTalla)
          .query(`
            SELECT TOP 1
              CAST(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS DECIMAL(18,4)) AS StockDisponible
            FROM AcumuladoStock
            WHERE CodigoEmpresa = @codigoEmpresa
              AND CodigoAlmacen = @almacen
              AND CodigoArticulo = @codigoArticulo
              AND (ISNULL(TipoUnidadMedida_, '') = @unidadMedida OR (@unidadMedida = 'unidades' AND (TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '')))
              AND ISNULL(Partida, '') = @partida
              AND (CodigoColor_ = @codigoColor OR (@codigoColor = '' AND CodigoColor_ IS NULL))
              AND (CodigoTalla01_ = @codigoTalla OR (@codigoTalla = '' AND CodigoTalla01_ IS NULL))
              AND Periodo = 99
              AND COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) > 0
            ORDER BY Ejercicio DESC
          `);

        if (stockSinUbi.recordset.length === 0) {
          await transaction.rollback();
          return res.status(400).json({ success: false, mensaje: `No hay stock disponible (sin ubicación) para el artículo ${datosLinea.codigoArticulo}.` });
        }

        const stockDisponible = parseFloat(stockSinUbi.recordset[0].StockDisponible) || 0;
        if (cantidadExpedidaStock > stockDisponible) {
          await transaction.rollback();
          return res.status(400).json({ success: false, mensaje: `Stock insuficiente (sin ubicación): disponible ${stockDisponible}, solicitado ${cantidadExpedidaStock}.` });
        }
        // ubicacionFinal ya es 'SIN-UBICACION', partidaFinal ya está asignada
        console.log('[EXPEDICION] Stock SIN-UBICACION verificado:', stockDisponible);

      } else {
        // Stock con ubicación normal: leer desde AcumuladoStockUbicacion
        const stockResult = await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
          .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
          .input('ubicacion', sql.VarChar(20), truncarString(datosLinea.ubicacion, 20))
          .input('partida', sql.VarChar(20), truncarString(partida, 20))
          .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
          .input('codigoColor', sql.VarChar(10), codigoColor)
          .input('codigoTalla', sql.VarChar(10), codigoTalla)
          .query(`
            SELECT TOP 1 
              Ubicacion, UnidadSaldoTipo_, Partida
            FROM AcumuladoStockUbicacion
            WHERE CodigoEmpresa = @codigoEmpresa
              AND CodigoAlmacen = @almacen
              AND CodigoArticulo = @codigoArticulo
              AND (TipoUnidadMedida_ = @unidadMedida OR (@unidadMedida = 'unidades' AND (TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '')))
              AND (CodigoColor_ = @codigoColor OR (@codigoColor = '' AND CodigoColor_ IS NULL))
              AND (CodigoTalla01_ = @codigoTalla OR (@codigoTalla = '' AND CodigoTalla01_ IS NULL))
              AND Periodo = 99
              AND UnidadSaldoTipo_ > 0
            ORDER BY 
              CASE WHEN Ubicacion = @ubicacion THEN 0 ELSE 1 END,
              UnidadSaldoTipo_ DESC
          `);

        if (stockResult.recordset.length === 0) {
          await transaction.rollback();
          return res.status(400).json({ success: false, mensaje: `No hay stock disponible en ninguna ubicación para el artículo ${datosLinea.codigoArticulo}.` });
        }

        const mejorUbicacion = stockResult.recordset[0];
        const stockDisponible = parseFloat(mejorUbicacion.UnidadSaldoTipo_) || 0;
        ubicacionFinal = mejorUbicacion.Ubicacion;
        partidaFinal = mejorUbicacion.Partida || '';

        if (cantidadExpedidaStock > stockDisponible) {
          await transaction.rollback();
          return res.status(400).json({ success: false, mensaje: `No hay suficiente stock en ${ubicacionFinal}. Solo hay ${stockDisponible} unidades.` });
        }
        console.log('[EXPEDICION] Stock verificado, ubicación:', ubicacionFinal, 'stock:', stockDisponible);
    }

    // 3. ACTUALIZAR LÍNEA DEL PEDIDO
    const requestUpdate = new sql.Request(transaction);
    await requestUpdate
      .input('cantidadExpedida', sql.Decimal(18,4), datosLinea.cantidadExpedida)
      .input('movPosicionLinea', sql.VarChar, movPosicionLinea)
      .query(`
        UPDATE LineasPedidoCliente
        SET 
          UnidadesPendientes = UnidadesPendientes - @cantidadExpedida,
          UnidadesServidas = UnidadesServidas + @cantidadExpedida
        WHERE LineasPosicion = @movPosicionLinea
      `);
    console.log('[EXPEDICION] Línea actualizada - pendientes reducidas');

    // 4. ACTUALIZAR STOCK EN UBICACIÓN
    if (esSinUbicacion) {
        // SIN-UBICACION: descontar directamente de AcumuladoStock (no hay fila en AcumuladoStockUbicacion)
        await new sql.Request(transaction)
          .input('cantidad', sql.Decimal(18,4), cantidadExpedidaStock)
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
          .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
          .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
          .input('partida', sql.VarChar(20), truncarString(partidaFinal, 20))
          .input('codigoColor', sql.VarChar(10), codigoColor)
          .input('codigoTalla', sql.VarChar(10), codigoTalla)
          .query(`
            UPDATE AcumuladoStock
            SET
              UnidadSaldo      = UnidadSaldo      - @cantidad,
              UnidadSaldoTipo_ = UnidadSaldoTipo_ - @cantidad
            WHERE IdAcumuladoStock = (
              SELECT TOP 1 IdAcumuladoStock FROM AcumuladoStock
              WHERE CodigoEmpresa = @codigoEmpresa
                AND CodigoAlmacen = @almacen
                AND CodigoArticulo = @codigoArticulo
                AND (ISNULL(TipoUnidadMedida_, '') = @unidadMedida OR (@unidadMedida = 'unidades' AND (TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '')))
                AND ISNULL(Partida, '') = @partida
                AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
                AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
                AND Periodo = 99
              ORDER BY Ejercicio DESC
            )
          `);
        console.log('[EXPEDICION] Stock SIN-UBICACION descontado de AcumuladoStock (fila más reciente por ejercicio)');

      } else {
        // Ubicación normal: descontar de AcumuladoStockUbicacion
        // AcumuladoStockUbicacion no tiene columna Id propia — usamos UPDATE con clave completa
        // + filtro de ejercicio más reciente en subconsulta para evitar tocar filas de ejercicios anteriores
        // si por algún motivo hay duplicados (BD sucia)
        const ejercicioMasRecienteResult = await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
          .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
          .input('ubicacion', sql.VarChar(20), truncarString(ubicacionFinal, 20))
          .input('partida', sql.VarChar(20), truncarString(partidaFinal, 20))
          .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
          .input('codigoColor', sql.VarChar(10), codigoColor)
          .input('codigoTalla', sql.VarChar(10), codigoTalla)
          .query(`
            SELECT TOP 1 Ejercicio FROM AcumuladoStockUbicacion
            WHERE CodigoEmpresa = @codigoEmpresa
              AND CodigoAlmacen = @almacen
              AND CodigoArticulo = @codigoArticulo
              AND Ubicacion = @ubicacion
              AND (TipoUnidadMedida_ = @unidadMedida OR (@unidadMedida = 'unidades' AND (TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '')))
              AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
              AND (CodigoColor_ = @codigoColor OR (@codigoColor = '' AND CodigoColor_ IS NULL))
              AND (CodigoTalla01_ = @codigoTalla OR (@codigoTalla = '' AND CodigoTalla01_ IS NULL))
              AND Periodo = 99
            ORDER BY Ejercicio DESC
          `);
        const ejercicioUbicacion = ejercicioMasRecienteResult.recordset[0]?.Ejercicio;
        if (ejercicioUbicacion === undefined) {
          await transaction.rollback();
          return res.status(400).json({ success: false, mensaje: `No se encontró registro de stock en ${ubicacionFinal} para descontar.` });
        }
        await new sql.Request(transaction)
          .input('cantidad', sql.Decimal(18,4), cantidadExpedidaStock)
          .input('ejercicio', sql.SmallInt, ejercicioUbicacion)
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('almacen', sql.VarChar(10), truncarString(datosLinea.almacen, 10))
          .input('codigoArticulo', sql.VarChar(20), truncarString(datosLinea.codigoArticulo, 20))
          .input('ubicacion', sql.VarChar(20), truncarString(ubicacionFinal, 20))
          .input('partida', sql.VarChar(20), truncarString(partidaFinal, 20))
          .input('unidadMedida', sql.VarChar(10), truncarString(unidadMedida, 10))
          .input('codigoColor', sql.VarChar(10), codigoColor)
          .input('codigoTalla', sql.VarChar(10), codigoTalla)
          .query(`
            UPDATE AcumuladoStockUbicacion
            SET
              UnidadSaldo      = UnidadSaldo      - @cantidad,
              UnidadSaldoTipo_ = UnidadSaldoTipo_ - @cantidad
            WHERE CodigoEmpresa = @codigoEmpresa
              AND Ejercicio = @ejercicio
              AND CodigoAlmacen = @almacen
              AND CodigoArticulo = @codigoArticulo
              AND Ubicacion = @ubicacion
              AND (TipoUnidadMedida_ = @unidadMedida OR (@unidadMedida = 'unidades' AND (TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '')))
              AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
              AND (CodigoColor_ = @codigoColor OR (@codigoColor = '' AND CodigoColor_ IS NULL))
              AND (CodigoTalla01_ = @codigoTalla OR (@codigoTalla = '' AND CodigoTalla01_ IS NULL))
              AND Periodo = 99
          `);
        console.log('[EXPEDICION] Stock actualizado en AcumuladoStockUbicacion');

        // Recalcular resumen AcumuladoStock
        await actualizarAcumuladoStockParaArticulo(
          transaction,
          datosLinea.codigoEmpresa,
          datosLinea.almacen,
          datosLinea.codigoArticulo,
          unidadMedida,
          partidaFinal,
          codigoColor,
          codigoTalla,
          ubicacionFinal
        );
        console.log('[EXPEDICION] AcumuladoStock recalculado');
    }

    // 5. ACTUALIZAR TABLA DE TALLAS (si aplica)
    if (codigoColor && grupoTalla && codigoTalla) {
      console.log('[EXPEDICION] Actualizando tallas con:', {
        grupoTalla, codigoColor, codigoTalla, cantidad: datosLinea.cantidadExpedida
      });
      const grupoTallasRequest = new sql.Request(transaction);
      let grupoTallaParam;
      if (grupoTalla && !isNaN(grupoTalla)) {
        grupoTallaParam = sql.Int;
      } else {
        grupoTallaParam = sql.VarChar;
      }
      const grupoTallasResult = await grupoTallasRequest
        .input('grupoTalla', grupoTallaParam, grupoTalla)
        .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
        .query(`
          SELECT
            CodigoTalla01_, CodigoTalla02_, CodigoTalla03_, CodigoTalla04_,
            CodigoTalla05_, CodigoTalla06_, CodigoTalla07_, CodigoTalla08_,
            CodigoTalla09_, CodigoTalla10_
          FROM GrupoTallas_
          WHERE GrupoTalla_ = @grupoTalla
            AND CodigoEmpresa = @codigoEmpresa
        `);

      if (grupoTallasResult.recordset.length > 0) {
        const grupoTallas = grupoTallasResult.recordset[0];
        let columnaTalla = '';
        for (let i = 1; i <= 10; i++) {
          const num = i.toString().padStart(2, '0');
          if (grupoTallas[`CodigoTalla${num}_`] === codigoTalla) {
            columnaTalla = `UnidadesTalla${num}_`;
            break;
          }
        }

        if (!columnaTalla) {
          throw new Error(`No se encontró la talla ${codigoTalla} en el grupo ${grupoTalla}. No se puede expedir.`);
        }

        await new sql.Request(transaction)
          .input('cantidadExpedida', sql.Decimal(18,4), datosLinea.cantidadExpedida)
          .input('movPosicionLinea', sql.VarChar, movPosicionLinea)
          .input('codigoColor', sql.VarChar, codigoColor)
          .query(`
            UPDATE LineasPedidoClienteTallas
            SET
              ${columnaTalla} = ${columnaTalla} - @cantidadExpedida,
              UnidadesTotalTallas_ = UnidadesTotalTallas_ - @cantidadExpedida
            WHERE MovPosicionLinea_ = @movPosicionLinea
              AND CodigoColor_ = @codigoColor
          `);
        console.log('[EXPEDICION] Tallas actualizadas correctamente');
      }
    }

    // 6. VERIFICAR SI EL PEDIDO ESTÁ COMPLETAMENTE EXPEDIDO (todas las líneas con pendientes = 0)
    const requestVerificarPedido = new sql.Request(transaction);
    const pedidoVerificado = await requestVerificarPedido
      .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
      .input('ejercicio', sql.SmallInt, datosLinea.ejercicio || lineaData.EjercicioPedido)
      .input('serie', sql.VarChar, datosLinea.serie || lineaData.SeriePedido || '')
      .input('numeroPedido', sql.Int, datosLinea.numeroPedido || lineaData.NumeroPedido)
      .query(`
        SELECT 
          CASE WHEN EXISTS (
            SELECT 1 
            FROM LineasPedidoCliente l
            WHERE l.CodigoEmpresa = @codigoEmpresa
              AND l.EjercicioPedido = @ejercicio
              AND (l.SeriePedido = @serie OR (@serie = '' AND l.SeriePedido IS NULL))
              AND l.NumeroPedido = @numeroPedido
              AND l.UnidadesPendientes > 0
          ) THEN 0 ELSE 1 END AS PedidoCompletado,
          c.Estado,
          c.StatusAprobado,
          c.FormaEnvio,
          c.CodigoCliente,
          c.RazonSocial,
          c.RazonSocial2,
          c.Domicilio,
          c.Municipio,
          c.CodigoPostal,
          c.Provincia,
          c.CodigoNacion,
          c.NumeroLineas,
          c.ImporteLiquido,
          c.EmpleadoAsignado,
          c.Telefono,
          c.Contacto,
          c.ObservacionesWeb,
          c.ObservacionesAlbaran,
          c.NombreObra,
          c.Vendedor,
          c.EsVoluminoso,
          c.CodigoCondiciones,
          c.CodigoTransportistaEnvios,
          c.TipoPortesEnvios,
          c.CifDni,
          c.CifEuropeo,
          c.SuPedido,
          c.FechaEntrega,
          c.CodigoZona,
          c.CodigoCanal,
          c.GrupoIva,
          c.IndicadorIva,
          c.TarifaPrecio,
          c.TarifaDescuento,
          c.[%Descuento],
          c.[%ProntoPago],
          c.[%Rappel],
          c.[%Comision],
          c.FormadePago,
          c.CodigoComisionista,
          c.CodigoComisionista2_,
          c.CodigoJefeVenta_,
          c.CodigoJefeZona_,
          c.CodigoDivisa,
          c.CodigoDefinicion_,
          c.CodigoContable,
          c.RemesaHabitual,
          c.CodigoBanco,
          c.CodigoAgencia,
          c.IdDelegacion,
          c.SiglaNacion,
          c.CodigoMunicipio,
          c.CodigoProvincia,
          c.NumeroPlazos,
          c.DiasPrimerPlazo,
          c.DiasEntrePlazos,
          c.CodigoTransaccion,
          c.CodigoTipoEfecto,
          c.DomicilioEnvio,
          c.DomicilioFactura,
          c.DomicilioRecibo,
          c.DC,
          c.CCC,
          c.IBAN,
          c.CodigoTerritorio,
          c.IvaIncluido,
          c.AlbaranValorado,
          c.PeriodicidadFacturas,
          c.AgruparAlbaranes,
          c.CopiasAlbaran,
          c.CopiasFactura,
          c.GenerarFactura
        FROM CabeceraPedidoCliente c
        WHERE c.CodigoEmpresa = @codigoEmpresa
          AND c.EjercicioPedido = @ejercicio
          AND (c.SeriePedido = @serie OR (@serie = '' AND c.SeriePedido IS NULL))
          AND c.NumeroPedido = @numeroPedido
      `);

    let pedidoCompletado = false;
    let pedidoParcial = false;
    let formaEnvioValor = null;
    let pedidoInfoParaAlbaran = null;

    if (pedidoVerificado.recordset.length > 0) {
      const pedidoInfo = pedidoVerificado.recordset[0];
      formaEnvioValor = pedidoInfo.FormaEnvio;
      const completado = pedidoInfo.PedidoCompletado === 1;

      if (completado && pedidoInfo.Estado !== 2) {
        pedidoCompletado = true;
        await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('ejercicio', sql.SmallInt, datosLinea.ejercicio || lineaData.EjercicioPedido)
          .input('serie', sql.VarChar, datosLinea.serie || lineaData.SeriePedido || '')
          .input('numeroPedido', sql.Int, datosLinea.numeroPedido || lineaData.NumeroPedido)
          .query(`
            UPDATE CabeceraPedidoCliente
            SET 
              Estado = 2,
              FechaCompletado = GETDATE(),
              StatusAprobado = -1
            WHERE CodigoEmpresa = @codigoEmpresa
              AND EjercicioPedido = @ejercicio
              AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
              AND NumeroPedido = @numeroPedido
              AND Estado IN (0, 4)
          `);
        await actualizarStatusSiExiste(
          transaction,
          datosLinea.codigoEmpresa,
          datosLinea.ejercicio || lineaData.EjercicioPedido,
          datosLinea.serie || lineaData.SeriePedido || '',
          datosLinea.numeroPedido || lineaData.NumeroPedido,
          'Servido'
        );
        console.log('[EXPEDICION] Pedido marcado como completado (Estado=2)');
      } else if (!completado && pedidoInfo.Estado !== 4) {
        pedidoParcial = true;
        await new sql.Request(transaction)
          .input('codigoEmpresa', sql.SmallInt, datosLinea.codigoEmpresa)
          .input('ejercicio', sql.SmallInt, datosLinea.ejercicio || lineaData.EjercicioPedido)
          .input('serie', sql.VarChar, datosLinea.serie || lineaData.SeriePedido || '')
          .input('numeroPedido', sql.Int, datosLinea.numeroPedido || lineaData.NumeroPedido)
          .query(`
            UPDATE CabeceraPedidoCliente
            SET Estado = 4, StatusAprobado = -1
            WHERE CodigoEmpresa = @codigoEmpresa
              AND EjercicioPedido = @ejercicio
              AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
              AND NumeroPedido = @numeroPedido
              AND Estado IN (0, 4)
          `);
        await actualizarStatusSiExiste(
          transaction,
          datosLinea.codigoEmpresa,
          datosLinea.ejercicio || lineaData.EjercicioPedido,
          datosLinea.serie || lineaData.SeriePedido || '',
          datosLinea.numeroPedido || lineaData.NumeroPedido,
          'Parcial'
        );
        console.log('[EXPEDICION] Pedido marcado como parcial (Estado=4)');
      }

      if (pedidoCompletado) {
        pedidoInfoParaAlbaran = {
          codigoEmpresa: datosLinea.codigoEmpresa,
          ejercicio: datosLinea.ejercicio || lineaData.EjercicioPedido,
          serie: datosLinea.serie || lineaData.SeriePedido || '',
          numeroPedido: datosLinea.numeroPedido || lineaData.NumeroPedido,
          pedidoInfo
        };
      }
    }

    // 7. GENERAR ALBARÁN AUTOMÁTICO dentro de la misma transacción (si pedido completado)
    // Si falla el albarán se hace rollback de toda la expedición — sin descuadres
    let albaranGenerado = false;
    let albaranInfo = null;

    if (pedidoCompletado && pedidoInfoParaAlbaran) {
      console.log('[EXPEDICION] Pedido completado, generando albarán dentro de la transacción...');
      const resultadoAlbaran = await generarAlbaranDentroDeTransaccion(pedidoInfoParaAlbaran, transaction);
      albaranGenerado = true;
      albaranInfo = resultadoAlbaran;
      console.log(`[EXPEDICION] Albarán generado: ${albaranInfo.serie}${albaranInfo.numero}`);
    }

    await transaction.commit();
    console.log('[EXPEDICION] Transacción principal confirmada');

    // 8. RESPUESTA AL FRONTEND
    const nuevasUnidadesPendientes = unidadesPendientes - datosLinea.cantidadExpedida;
    const nuevasUnidadesServidas = unidadesServidas + datosLinea.cantidadExpedida;

    const respuesta = {
      success: true,
      mensaje: pedidoCompletado
        ? (albaranGenerado ? 'Línea actualizada y albarán generado automáticamente' : 'Línea actualizada pero no se pudo generar el albarán')
        : 'Línea actualizada correctamente',
      detalles: {
        cantidadExpedidaVenta: datosLinea.cantidadExpedida,
        cantidadExpedidaStock: cantidadExpedidaStock,
        unidadesPendientesRestantes: nuevasUnidadesPendientes,
        unidadesServidasActualizadas: nuevasUnidadesServidas,
        stockRestante: 'Actualizado',
        ubicacionUtilizada: ubicacionFinal,
        pedidoCompletado: pedidoCompletado,
        pedidoParcial: pedidoParcial,
        statusPedido: pedidoCompletado ? 'Servido' : (pedidoParcial ? 'Parcial' : 'Preparando'),
        formaEnvio: formaEnvioValor,
        albaranGenerado: albaranGenerado,
        albaran: albaranInfo
      }
    };

    console.log('[EXPEDICION] ===== FIN ACTUALIZAR LÍNEA =====\n');
    res.json(respuesta);

  } catch (err) {
    if (transaction && !transaction._aborted) await transaction.rollback();
    console.error('[ERROR ACTUALIZAR LINEA PEDIDO]', err);
    console.error('[ERROR DETAILS]', err.message);
    console.error('[ERROR STACK]', err.stack);
    res.status(500).json({
      success: false,
      mensaje: 'Error al actualizar línea de pedido',
      error: err.message,
      detalles: err.stack
    });
  }
});


// ============================================================
// FUNCIÓN AUXILIAR: ACTUALIZAR CAMPO Status SI EXISTE
// Campo personalizado de algunos entornos. Si no existe, se ignora.
// Estado 0/Preparando → Status = 'Pendiente'
// Estado 4 (Parcial)  → Status = 'Parcial'
// Estado 2 (Servido)  → Status = 'Servido'
// ============================================================
async function actualizarStatusSiExiste(transactionOrNull, codigoEmpresa, ejercicio, serie, numeroPedido, nuevoStatus) {
  try {
    const req = transactionOrNull ? new sql.Request(transactionOrNull) : getPool().request();
    // sp_executesql para que no falle si la columna Status no existe en este entorno
    await req
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('nuevoStatus', sql.VarChar, nuevoStatus)
      .query(`
        IF EXISTS (
          SELECT 1 FROM sys.columns
          WHERE object_id = OBJECT_ID('CabeceraPedidoCliente')
            AND name = 'Status'
        )
        BEGIN
          EXEC sp_executesql
            N'UPDATE CabeceraPedidoCliente
              SET Status = @st
              WHERE CodigoEmpresa = @ce
                AND EjercicioPedido = @ej
                AND (SeriePedido = @sr OR (@sr = '''' AND SeriePedido IS NULL))
                AND NumeroPedido = @np',
            N'@ce SMALLINT, @ej SMALLINT, @sr VARCHAR(10), @np INT, @st VARCHAR(50)',
            @ce = @codigoEmpresa,
            @ej = @ejercicio,
            @sr = @serie,
            @np = @numeroPedido,
            @st = @nuevoStatus
        END
      `);
    console.log(`[STATUS] Status actualizado a '${nuevoStatus}' (si existe la columna)`);
  } catch (err) {
    console.warn('[STATUS] No se pudo actualizar campo Status:', err.message);
  }
}

// ============================================================
// FUNCIÓN AUXILIAR: ACTUALIZAR ACUMULADOSTOCK (TABLA RESUMEN)
// ============================================================
async function actualizarAcumuladoStockParaArticulo(transaction, codigoEmpresa, codigoAlmacen, codigoArticulo, unidadMedida, partida, codigoColor, codigoTalla, ubicacion) {
  const ejercicioActual = new Date().getFullYear();
  // Normalizar ubicacion: 'SIN-UBICACION' o 'SIN UBICACIÓN' → '' (cadena vacía es el estándar en BD)
  const ubicacionNorm = (!ubicacion || ubicacion === 'SIN-UBICACION' || ubicacion === 'SIN UBICACIÓN') ? '' : ubicacion;
  // El ejercicioBase se obtiene igual que en el resto de módulos
  const ctxResult = await new sql.Request(transaction)
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .query(`
      SELECT TOP 1 Ejercicio FROM AcumuladoStockUbicacion
      WHERE CodigoEmpresa = @codigoEmpresa AND Periodo = 99
        AND (COALESCE(UnidadSaldoTipo_, 0) <> 0 OR COALESCE(UnidadSaldo, 0) <> 0)
      ORDER BY Ejercicio DESC
    `);
  const ejercicioBase = ctxResult.recordset[0]?.Ejercicio || ejercicioActual;

  try {
    // Recalcular stock total desde AcumuladoStockUbicacion (periodo 99, ambos ejercicios)
    const totalResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioBase', sql.SmallInt, ejercicioBase)
      .input('ejercicioActual', sql.SmallInt, ejercicioActual)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('unidadMedida', sql.VarChar, unidadMedida || '')
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla || '')
      .query(`
        SELECT SUM(CAST(COALESCE(UnidadSaldoTipo_, UnidadSaldo, 0) AS DECIMAL(18,4))) AS StockTotal
        FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoAlmacen = @codigoAlmacen
          AND CodigoArticulo = @codigoArticulo
          AND Ejercicio IN (@ejercicioBase, @ejercicioActual)
          AND ISNULL(TipoUnidadMedida_, '') = @unidadMedida
          AND ISNULL(Partida, '') = @partida
          AND ISNULL(CodigoColor_, '') = @codigoColor
          AND ISNULL(CodigoTalla01_, '') = @codigoTalla
          AND Periodo = 99
      `);

    const stockTotal = parseFloat(totalResult.recordset[0]?.StockTotal) || 0;

    // Eliminar todos los registros periodo 99 existentes (todos los ejercicios) para evitar duplicados
    await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('unidadMedida', sql.VarChar, unidadMedida || '')
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla || '')
      .query(`
        DELETE FROM AcumuladoStock
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoAlmacen = @codigoAlmacen
          AND CodigoArticulo = @codigoArticulo
          AND ISNULL(TipoUnidadMedida_, '') = @unidadMedida
          AND ISNULL(Partida, '') = @partida
          AND ISNULL(CodigoColor_, '') = @codigoColor
          AND ISNULL(CodigoTalla01_, '') = @codigoTalla
          AND Periodo = 99
      `);

    // Insertar nuevo registro — incluyendo stock negativo (Sage permite stock negativo)
    if (Math.abs(stockTotal) > 0.001) {
      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicioActual)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .input('unidadMedida', sql.VarChar, unidadMedida || '')
        .input('partida', sql.VarChar, partida || '')
        .input('codigoColor', sql.VarChar, codigoColor || '')
        .input('codigoTalla', sql.VarChar, codigoTalla || '')
        .input('ubicacion', sql.VarChar, ubicacionNorm)
        .input('stockTotal', sql.Decimal(18,4), stockTotal)
        .query(`
          INSERT INTO AcumuladoStock (
            CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
            CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
            UnidadSaldo, UnidadSaldoTipo_, Periodo
          ) VALUES (
            @codigoEmpresa, @ejercicio, @codigoAlmacen, @ubicacion,
            @codigoArticulo, @unidadMedida, @partida, @codigoColor, @codigoTalla,
            @stockTotal, @stockTotal, 99
          )
        `);
    }
  } catch (error) {
    console.error('[ERROR ACTUALIZAR ACUMULADOSTOCK]', error);
    throw error;
  }
}

// ============================================================
// FUNCIÓN: GENERAR ALBARÁN USANDO LA TRANSACCIÓN EXISTENTE
// Se llama desde actualizarLineaPedido cuando el pedido se completa.
// Al usar la misma transacción, si el albarán falla se hace rollback
// de toda la expedición — sin descuadres de stock.
// ============================================================
async function generarAlbaranDentroDeTransaccion(infoPedido, transaction) {
  const log = (msg) => console.log(`[ALBARAN PEDIDO ${infoPedido.numeroPedido}] ${msg}`);
  log('Generando albarán dentro de transacción de expedición');

  const req = () => new sql.Request(transaction);
  const codigoEmpresa = infoPedido.codigoEmpresa;
  const ejercicio = infoPedido.ejercicio;
  const serie = infoPedido.serie || '';
  const numeroPedido = infoPedido.numeroPedido;
  const pedido = infoPedido.pedidoInfo;
  const fechaActual = new Date();
  const ejercicioAlbaran = fechaActual.getFullYear();

  // 1. Unidades ya albaranadas (no facturadas)
  const albaranesPrevios = await req()
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicioPedido', sql.SmallInt, ejercicio)
    .input('seriePedido', sql.VarChar, serie)
    .input('numeroPedido', sql.Int, numeroPedido)
    .query(`
      SELECT lac.CodigoArticulo, SUM(lac.UnidadesServidas) AS TotalUnidades
      FROM CabeceraAlbaranCliente cac
      INNER JOIN LineasAlbaranCliente lac
        ON cac.CodigoEmpresa = lac.CodigoEmpresa
        AND cac.EjercicioAlbaran = lac.EjercicioAlbaran
        AND cac.SerieAlbaran = lac.SerieAlbaran
        AND cac.NumeroAlbaran = lac.NumeroAlbaran
      WHERE cac.CodigoEmpresa = @codigoEmpresa
        AND cac.EjercicioPedido = @ejercicioPedido
        AND (cac.SeriePedido = @seriePedido OR (@seriePedido = '' AND cac.SeriePedido IS NULL))
        AND cac.NumeroPedido = @numeroPedido
        AND cac.StatusFacturado = 0
      GROUP BY lac.CodigoArticulo
    `);

  const unidadesYaAlbaranadas = {};
  albaranesPrevios.recordset.forEach(r => {
    unidadesYaAlbaranadas[r.CodigoArticulo] = parseFloat(r.TotalUnidades) || 0;
  });

  // 2. Líneas del pedido con unidades servidas
  const lineasPedido = await req()
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.SmallInt, ejercicio)
    .input('serie', sql.VarChar, serie)
    .input('numeroPedido', sql.Int, numeroPedido)
    .query(`
      SELECT
        l.CodigoArticulo, l.UnidadesServidas, l.Precio, l.CodigoAlmacen,
        l.LineasPosicion, l.GrupoIva, l.[%Iva], l.PesoBrutoUnitario_,
        l.PesoNetoUnitario_, l.VolumenUnitario_, l.DescripcionArticulo,
        l.Descripcion2Articulo, l.UnidadMedida1_, l.UnidadMedida2_,
        l.FactorConversion_, l.Partida,
        a.CodigoFamilia, a.CodigoSubfamilia
      FROM LineasPedidoCliente l
      LEFT JOIN Articulos a ON a.CodigoArticulo = l.CodigoArticulo AND a.CodigoEmpresa = l.CodigoEmpresa
      WHERE l.CodigoEmpresa = @codigoEmpresa
        AND l.EjercicioPedido = @ejercicio
        AND (l.SeriePedido = @serie OR (@serie = '' AND l.SeriePedido IS NULL))
        AND l.NumeroPedido = @numeroPedido
        AND l.UnidadesServidas > 0
    `);

  const lineasNuevas = [];
  for (const linea of lineasPedido.recordset) {
    const servidas = parseFloat(linea.UnidadesServidas) || 0;
    const yaAlbaranadas = unidadesYaAlbaranadas[linea.CodigoArticulo] || 0;
    const pendientesAlbaran = servidas - yaAlbaranadas;
    if (pendientesAlbaran > 0) {
      lineasNuevas.push({ ...linea, UnidadesServidas: pendientesAlbaran });
    }
  }

  if (lineasNuevas.length === 0) {
    log('No hay unidades nuevas para albarán — se omite.');
    return { serie, numero: null, lineas: 0, unidades: 0, importe: 0 };
  }

  // 3. Calcular totales
  let totalUnidades = 0, importeBruto = 0, pesoBruto = 0, pesoNeto = 0, volumen = 0, bultos = 0;
  for (const linea of lineasNuevas) {
    const u = parseFloat(linea.UnidadesServidas) || 0;
    const p = parseFloat(linea.Precio) || 0;
    totalUnidades += u;
    importeBruto += u * p;
    pesoBruto += u * (parseFloat(linea.PesoBrutoUnitario_) || 0);
    pesoNeto += u * (parseFloat(linea.PesoNetoUnitario_) || 0);
    volumen += u * (parseFloat(linea.VolumenUnitario_) || 0);
    bultos += Math.max(1, Math.ceil(Math.max(u / 10, (u * (parseFloat(linea.PesoBrutoUnitario_) || 0)) / 50)));
  }

  // 4. Siguiente número de albarán (con bloqueo)
  const nextAlbaranResult = await req()
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('ejercicio', sql.SmallInt, ejercicioAlbaran)
    .query(`
      SELECT ISNULL(MAX(NumeroAlbaran), 0) + 1 AS SiguienteNumero
      FROM CabeceraAlbaranCliente WITH (UPDLOCK, HOLDLOCK)
      WHERE CodigoEmpresa = @codigoEmpresa
        AND EjercicioAlbaran = @ejercicio
    `);
  const numeroAlbaran = nextAlbaranResult.recordset[0].SiguienteNumero;

  // 5. Insertar cabecera
  const horasAlbAux = fechaActual.getHours();
  const minutosAlbAux = fechaActual.getMinutes().toString().padStart(2, '0');
  const horaAlbaranDecimalAux = parseFloat(`${horasAlbAux}.${minutosAlbAux}`);
  const fechaEntregaAlbAux = pedido.FechaEntrega ? new Date(pedido.FechaEntrega) : fechaActual;

  await req()
    .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
    .input('idDelegacion', sql.SmallInt, pedido.IdDelegacion || 1)
    .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
    .input('serieAlbaran', sql.VarChar, serie)
    .input('numeroAlbaran', sql.Int, numeroAlbaran)
    .input('codigoCliente', sql.VarChar, (pedido.CodigoCliente ?? '').toString())
    .input('razonSocial', sql.VarChar, (pedido.RazonSocial ?? '').toString())
    .input('razonSocial2', sql.VarChar, (pedido.RazonSocial2 ?? '').toString())
    .input('razonSocialEnvios', sql.VarChar, (pedido.RazonSocial ?? '').toString())
    .input('domicilio', sql.VarChar, (pedido.Domicilio ?? '').toString())
    .input('domicilioEnvios', sql.VarChar, (pedido.Domicilio ?? '').toString())
    .input('municipio', sql.VarChar, (pedido.Municipio ?? '').toString())
    .input('municipioEnvios', sql.VarChar, (pedido.Municipio ?? '').toString())
    .input('provincia', sql.VarChar, (pedido.Provincia ?? '').toString())
    .input('provinciaEnvios', sql.VarChar, (pedido.Provincia ?? '').toString())
    .input('codigoPostal', sql.VarChar, (pedido.CodigoPostal ?? '').toString())
    .input('codigoPostalEnvios', sql.VarChar, (pedido.CodigoPostal ?? '').toString())
    .input('codigoNacion', sql.SmallInt, pedido.CodigoNacion || 1)
    .input('codigoNacionEnvios', sql.SmallInt, pedido.CodigoNacion || 1)
    .input('siglaNacion', sql.VarChar, (pedido.SiglaNacion ?? 'ES').toString())
    .input('codigoMunicipio', sql.Int, pedido.CodigoMunicipio || 0)
    .input('codigoMunicipioEnvios', sql.Int, pedido.CodigoMunicipio || 0)
    .input('codigoProvincia', sql.SmallInt, pedido.CodigoProvincia || 0)
    .input('codigoProvinciaEnvios', sql.SmallInt, pedido.CodigoProvincia || 0)
    .input('cifDni', sql.VarChar, (pedido.CifDni ?? '').toString())
    .input('cifEuropeo', sql.VarChar, (pedido.CifEuropeo ?? '').toString())
    .input('suPedido', sql.VarChar, (pedido.SuPedido ?? '').toString())
    .input('telefono', sql.VarChar, (pedido.Telefono ?? '').toString())
    .input('telefonoEnvios', sql.VarChar, (pedido.Telefono ?? '').toString())
    .input('contacto', sql.VarChar, (pedido.Contacto ?? '').toString())
    .input('fechaAlbaran', sql.DateTime, fechaActual)
    .input('fechaCreacion', sql.DateTime, fechaActual)
    .input('fechaEntrega', sql.DateTime, fechaEntregaAlbAux)
    .input('numeroLineas', sql.SmallInt, lineasNuevas.length)
    .input('empleadoAsignado', sql.VarChar, (pedido.EmpleadoAsignado ?? '').toString())
    .input('observacionesWeb', sql.Text, (pedido.ObservacionesWeb ?? '').toString())
    .input('observacionesAlbaran', sql.VarChar, (pedido.ObservacionesAlbaran ?? '').toString())
    .input('nombreObra', sql.VarChar, (pedido.NombreObra ?? '').toString())
    .input('vendedor', sql.VarChar, (pedido.Vendedor ?? '').toString())
    .input('statusFacturado', sql.SmallInt, 0)
    .input('esVoluminoso', sql.Bit, pedido.EsVoluminoso || 0)
    .input('esParcial', sql.Bit, 0)
    .input('ejercicioPedido', sql.SmallInt, ejercicio)
    .input('seriePedido', sql.VarChar, serie)
    .input('numeroPedido', sql.Int, numeroPedido)
    .input('codigoCondiciones', sql.SmallInt, pedido.CodigoCondiciones || 0)
    .input('formaDePago', sql.VarChar, (pedido.FormadePago ?? '').toString())
    .input('numeroPlazos', sql.SmallInt, pedido.NumeroPlazos || 1)
    .input('diasPrimerPlazo', sql.SmallInt, pedido.DiasPrimerPlazo || 0)
    .input('diasEntrePlazos', sql.SmallInt, pedido.DiasEntrePlazos || 0)
    .input('codigoTransportistaEnvios', sql.Int, pedido.CodigoTransportistaEnvios || 0)
    .input('tipoPortesEnvios', sql.VarChar, (pedido.TipoPortesEnvios ?? '').toString())
    .input('codigoTransaccion', sql.SmallInt, pedido.CodigoTransaccion || 1)
    .input('codigoTipoEfecto', sql.SmallInt, pedido.CodigoTipoEfecto || 0)
    .input('domicilioEnvioFlag', sql.SmallInt, pedido.DomicilioEnvio || 0)
    .input('domicilioFacturaFlag', sql.SmallInt, pedido.DomicilioFactura || 0)
    .input('domicilioReciboFlag', sql.SmallInt, pedido.DomicilioRecibo || 0)
    .input('dc', sql.VarChar, (pedido.DC ?? '').toString())
    .input('ccc', sql.VarChar, (pedido.CCC ?? '').toString())
    .input('iban', sql.VarChar, (pedido.IBAN ?? '').toString())
    .input('codigoTerritorio', sql.SmallInt, pedido.CodigoTerritorio || 0)
    .input('ivaIncluido', sql.SmallInt, pedido.IvaIncluido || 0)
    .input('formaEnvio', sql.Int, pedido.FormaEnvio || 3)
    .input('codigoZona', sql.VarChar, (pedido.CodigoZona ?? '').toString())
    .input('codigoCanal', sql.SmallInt, pedido.CodigoCanal || 0)
    .input('grupoIva', sql.TinyInt, pedido.GrupoIva || 1)
    .input('indicadorIva', sql.VarChar, (pedido.IndicadorIva ?? 'D').toString())
    .input('tarifaPrecio', sql.SmallInt, pedido.TarifaPrecio || 0)
    .input('tarifaDescuento', sql.SmallInt, pedido.TarifaDescuento || 0)
    .input('pctDescuento', sql.Decimal(18,4), parseFloat(pedido['%Descuento']) || 0)
    .input('pctProntoPago', sql.Decimal(18,4), parseFloat(pedido['%ProntoPago']) || 0)
    .input('pctRappel', sql.Decimal(18,4), parseFloat(pedido['%Rappel']) || 0)
    .input('pctComision', sql.Decimal(18,4), parseFloat(pedido['%Comision']) || 0)
    .input('codigoComisionista', sql.VarChar, (pedido.CodigoComisionista ?? '').toString())
    .input('codigoComisionista2', sql.VarChar, (pedido.CodigoComisionista2_ ?? '').toString())
    .input('codigoJefeVenta', sql.VarChar, (pedido.CodigoJefeVenta_ ?? '').toString())
    .input('codigoJefeZona', sql.VarChar, (pedido.CodigoJefeZona_ ?? '').toString())
    .input('codigoDivisa', sql.VarChar, (pedido.CodigoDivisa ?? '').toString())
    .input('codigoDefinicion', sql.VarChar, (pedido.CodigoDefinicion_ ?? '').toString())
    .input('codigoContable', sql.VarChar, (pedido.CodigoContable ?? '').toString())
    .input('remesaHabitual', sql.VarChar, (pedido.RemesaHabitual ?? '').toString())
    .input('codigoBanco', sql.VarChar, (pedido.CodigoBanco ?? '').toString())
    .input('codigoAgencia', sql.VarChar, (pedido.CodigoAgencia ?? '').toString())
    .input('albaranValorado', sql.SmallInt, pedido.AlbaranValorado || 0)
    .input('periodicidadFacturas', sql.SmallInt, pedido.PeriodicidadFacturas || 0)
    .input('agruparAlbaranes', sql.SmallInt, pedido.AgruparAlbaranes || 0)
    .input('copiasAlbaran', sql.SmallInt, pedido.CopiasAlbaran || 0)
    .input('copiasFactura', sql.SmallInt, pedido.CopiasFactura || 0)
    .input('generarFactura', sql.SmallInt, pedido.GenerarFactura || 0)
    .input('importeLiquido', sql.Decimal(18,4), importeBruto)
    .input('importeBruto', sql.Decimal(18,4), importeBruto)
    .input('baseImponible', sql.Decimal(18,4), importeBruto)
    .input('bultos', sql.Int, bultos)
    .input('pesoBruto', sql.Decimal(18,4), pesoBruto)
    .input('pesoNeto', sql.Decimal(18,4), pesoNeto)
    .input('volumen', sql.Decimal(18,4), volumen)
    .input('horaAlbaran', sql.Decimal(6,2), horaAlbaranDecimalAux)
    .query(`
      INSERT INTO CabeceraAlbaranCliente (
        CodigoEmpresa, IdDelegacion, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
        CodigoCliente, RazonSocial, RazonSocial2, RazonSocialEnvios,
        Domicilio, DomicilioEnvios, Municipio, MunicipioEnvios,
        Provincia, ProvinciaEnvios, CodigoPostal, CodigoPostalEnvios,
        CodigoNacion, CodigoNacionEnvios, SiglaNacion,
        CodigoMunicipio, CodigoMunicipioEnvios,
        CodigoProvincia, CodigoProvinciaEnvios,
        CifDni, CifEuropeo, SuPedido,
        Telefono, TelefonoEnvios, Contacto,
        FechaAlbaran, FechaCreacion, FechaEntrega,
        NumeroLineas, EmpleadoAsignado,
        ObservacionesWeb, ObservacionesAlbaran, NombreObra,
        Vendedor, StatusFacturado, EsVoluminoso, EsParcial,
        EjercicioPedido, SeriePedido, NumeroPedido,
        CodigoCondiciones, FormadePago, NumeroPlazos, DiasPrimerPlazo, DiasEntrePlazos,
        CodigoTransportistaEnvios, TipoPortesEnvios,
        CodigoTransaccion, CodigoTipoEfecto,
        DomicilioEnvio, DomicilioFactura, DomicilioRecibo,
        DC, CCC, IBAN, CodigoTerritorio, IvaIncluido,
        FormaEnvio, CodigoZona, CodigoCanal,
        GrupoIva, IndicadorIva, TarifaPrecio, TarifaDescuento,
        [%Descuento], [%ProntoPago], [%Rappel], [%Comision],
        CodigoComisionista, CodigoComisionista2_, CodigoJefeVenta_, CodigoJefeZona_,
        CodigoDivisa, CodigoDefinicion_, CodigoContable, RemesaHabitual,
        CodigoBanco, CodigoAgencia,
        AlbaranValorado, PeriodicidadFacturas, AgruparAlbaranes,
        CopiasAlbaran, CopiasFactura, GenerarFactura,
        ImporteLiquido, ImporteBruto, BaseImponible,
        Bultos, PesoBruto_, PesoNeto_, Volumen_, HoraAlbaran
      ) VALUES (
        @codigoEmpresa, @idDelegacion, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
        @codigoCliente, @razonSocial, @razonSocial2, @razonSocialEnvios,
        @domicilio, @domicilioEnvios, @municipio, @municipioEnvios,
        @provincia, @provinciaEnvios, @codigoPostal, @codigoPostalEnvios,
        @codigoNacion, @codigoNacionEnvios, @siglaNacion,
        @codigoMunicipio, @codigoMunicipioEnvios,
        @codigoProvincia, @codigoProvinciaEnvios,
        @cifDni, @cifEuropeo, @suPedido,
        @telefono, @telefonoEnvios, @contacto,
        @fechaAlbaran, @fechaCreacion, @fechaEntrega,
        @numeroLineas, @empleadoAsignado,
        @observacionesWeb, @observacionesAlbaran, @nombreObra,
        @vendedor, @statusFacturado, @esVoluminoso, @esParcial,
        @ejercicioPedido, @seriePedido, @numeroPedido,
        @codigoCondiciones, @formaDePago, @numeroPlazos, @diasPrimerPlazo, @diasEntrePlazos,
        @codigoTransportistaEnvios, @tipoPortesEnvios,
        @codigoTransaccion, @codigoTipoEfecto,
        @domicilioEnvioFlag, @domicilioFacturaFlag, @domicilioReciboFlag,
        @dc, @ccc, @iban, @codigoTerritorio, @ivaIncluido,
        @formaEnvio, @codigoZona, @codigoCanal,
        @grupoIva, @indicadorIva, @tarifaPrecio, @tarifaDescuento,
        @pctDescuento, @pctProntoPago, @pctRappel, @pctComision,
        @codigoComisionista, @codigoComisionista2, @codigoJefeVenta, @codigoJefeZona,
        @codigoDivisa, @codigoDefinicion, @codigoContable, @remesaHabitual,
        @codigoBanco, @codigoAgencia,
        @albaranValorado, @periodicidadFacturas, @agruparAlbaranes,
        @copiasAlbaran, @copiasFactura, @generarFactura,
        @importeLiquido, @importeBruto, @baseImponible,
        @bultos, @pesoBruto, @pesoNeto, @volumen, @horaAlbaran
      )
    `);

  // 6. Insertar líneas
  for (let i = 0; i < lineasNuevas.length; i++) {
    const linea = lineasNuevas[i];
    const u = parseFloat(linea.UnidadesServidas) || 0;
    const p = parseFloat(linea.Precio) || 0;
    const importeBrutoLinea = u * p;
    const ivaPct = parseFloat(linea['%Iva']) || 21;
    const cuotaIva = importeBrutoLinea * (ivaPct / 100);
    const pesoBrutoLinea = u * (parseFloat(linea.PesoBrutoUnitario_) || 0);
    const pesoNetoLinea = u * (parseFloat(linea.PesoNetoUnitario_) || 0);
    const volumenLinea = u * (parseFloat(linea.VolumenUnitario_) || 0);

    await req()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
      .input('serieAlbaran', sql.VarChar, serie)
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('orden', sql.SmallInt, i + 1)
      .input('lineasPosicion', sql.UniqueIdentifier, linea.LineasPosicion || null)
      .input('codigoArticulo', sql.VarChar, linea.CodigoArticulo || '')
      .input('descripcionArticulo', sql.VarChar, linea.DescripcionArticulo || '')
      .input('descripcion2Articulo', sql.VarChar, linea.Descripcion2Articulo || '')
      .input('codigodelCliente', sql.VarChar, (pedido.CodigoCliente ?? '').toString())
      .input('unidades', sql.Decimal(18,4), u)
      .input('unidadesServidas', sql.Decimal(18,4), u)
      .input('precio', sql.Decimal(18,4), p)
      .input('precioTotal', sql.Decimal(18,4), importeBrutoLinea)
      .input('tarifaPrecioLin', sql.SmallInt, pedido.TarifaPrecio || 0)
      .input('codigoAlmacen', sql.VarChar, linea.CodigoAlmacen || '')
      .input('partida', sql.VarChar, linea.Partida || '')
      .input('unidadMedida1_', sql.VarChar, linea.UnidadMedida1_ || '')
      .input('unidadMedida2_', sql.VarChar, linea.UnidadMedida2_ || '')
      .input('factorConversion_', sql.Decimal(18,4), parseFloat(linea.FactorConversion_) || 1)
      .input('ejercicioPedido', sql.SmallInt, ejercicio)
      .input('seriePedido', sql.VarChar, serie)
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('suPedido', sql.VarChar, (pedido.SuPedido ?? '').toString())
      .input('codigoDefinicion', sql.VarChar, (pedido.CodigoDefinicion_ ?? '').toString())
      .input('codigoTransaccion', sql.SmallInt, pedido.CodigoTransaccion || 1)
      .input('statusStock', sql.SmallInt, -1)
      .input('statusEstadis', sql.SmallInt, 0)
      .input('acumulaEstadistica', sql.SmallInt, -1)
      .input('bloqueoRebaje', sql.SmallInt, 0)
      .input('ivaIncluido', sql.SmallInt, pedido.IvaIncluido || 0)
      .input('grupoIva', sql.TinyInt, linea.GrupoIva || 1)
      .input('porcentajeIva', sql.Decimal(18,4), ivaPct)
      .input('codigoComisionista', sql.VarChar, (pedido.CodigoComisionista ?? '').toString())
      .input('codigoComisionista2', sql.VarChar, (pedido.CodigoComisionista2_ ?? '').toString())
      .input('codigoJefeVenta', sql.VarChar, (pedido.CodigoJefeVenta_ ?? '').toString())
      .input('codigoJefeZona', sql.VarChar, (pedido.CodigoJefeZona_ ?? '').toString())
      .input('importeLiquido', sql.Decimal(18,4), importeBrutoLinea)
      .input('importeNeto', sql.Decimal(18,4), importeBrutoLinea)
      .input('importeBruto', sql.Decimal(18,4), importeBrutoLinea)
      .input('baseImponible', sql.Decimal(18,4), importeBrutoLinea)
      .input('baseIva', sql.Decimal(18,4), importeBrutoLinea)
      .input('cuotaIva', sql.Decimal(18,4), cuotaIva)
      .input('totalIva', sql.Decimal(18,4), cuotaIva)
      .input('pesoBrutoUnitario_', sql.Decimal(18,4), parseFloat(linea.PesoBrutoUnitario_) || 0)
      .input('pesoNetoUnitario_', sql.Decimal(18,4), parseFloat(linea.PesoNetoUnitario_) || 0)
      .input('volumenUnitario_', sql.Decimal(18,4), parseFloat(linea.VolumenUnitario_) || 0)
      .input('pesoBruto_', sql.Decimal(18,4), pesoBrutoLinea)
      .input('pesoNeto_', sql.Decimal(18,4), pesoNetoLinea)
      .input('volumen_', sql.Decimal(18,4), volumenLinea)
      .input('codigoFamilia', sql.VarChar, linea.CodigoFamilia || '')
      .input('codigoSubfamilia', sql.VarChar, linea.CodigoSubfamilia || '')
      .input('fechaAlbaran', sql.DateTime, fechaActual)
      .input('fechaRegistro', sql.DateTime, fechaActual)
      .query(`
        INSERT INTO LineasAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          Orden, LineasPosicion,
          CodigoArticulo, DescripcionArticulo, Descripcion2Articulo,
          CodigodelCliente,
          Unidades, UnidadesServidas, Precio, PrecioTotal, TarifaPrecioLin,
          CodigoAlmacen, Partida,
          UnidadMedida1_, UnidadMedida2_, FactorConversion_,
          EjercicioPedido, SeriePedido, NumeroPedido,
          SuPedido, CodigoDefinicion_, CodigoTransaccion,
          StatusStock, StatusEstadis, AcumulaEstadistica_, BloqueoRebaje_,
          IvaIncluido, GrupoIva, [%Iva],
          CodigoComisionista, CodigoComisionista2_, CodigoJefeVenta_, CodigoJefeZona_,
          ImporteLiquido, ImporteNeto, ImporteBruto, BaseImponible, BaseIva, CuotaIva, TotalIva,
          PesoBrutoUnitario_, PesoNetoUnitario_, VolumenUnitario_,
          PesoBruto_, PesoNeto_, Volumen_,
          CodigoFamilia, CodigoSubfamilia,
          FechaAlbaran, FechaRegistro
        ) VALUES (
          @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
          @orden, @lineasPosicion,
          @codigoArticulo, @descripcionArticulo, @descripcion2Articulo,
          @codigodelCliente,
          @unidades, @unidadesServidas, @precio, @precioTotal, @tarifaPrecioLin,
          @codigoAlmacen, @partida,
          @unidadMedida1_, @unidadMedida2_, @factorConversion_,
          @ejercicioPedido, @seriePedido, @numeroPedido,
          @suPedido, @codigoDefinicion, @codigoTransaccion,
          @statusStock, @statusEstadis, @acumulaEstadistica, @bloqueoRebaje,
          @ivaIncluido, @grupoIva, @porcentajeIva,
          @codigoComisionista, @codigoComisionista2, @codigoJefeVenta, @codigoJefeZona,
          @importeLiquido, @importeNeto, @importeBruto, @baseImponible, @baseIva, @cuotaIva, @totalIva,
          @pesoBrutoUnitario_, @pesoNetoUnitario_, @volumenUnitario_,
          @pesoBruto_, @pesoNeto_, @volumen_,
          @codigoFamilia, @codigoSubfamilia,
          @fechaAlbaran, @fechaRegistro
        )
      `);
  }

  log(`Albarán ${numeroAlbaran} generado con ${lineasNuevas.length} líneas`);
  return { serie, numero: numeroAlbaran, lineas: lineasNuevas.length, unidades: totalUnidades, importe: importeBruto };
}

// ============================================================
// FUNCIÓN DE GENERACIÓN DE ALBARÁN AUTOMÁTICO (CORREGIDA - nuevo Request por query)
// ============================================================
async function generarAlbaranAutomaticoEnSegundoPlano(infoPedido) {
  const log = (msg) => console.log(`[ALBARAN PEDIDO ${infoPedido.numeroPedido}] ${msg}`);
  log('Iniciando proceso de generación de albarán');

  const transaction = new sql.Transaction(getPool());
  try {
    await transaction.begin();

    // Helper: crea un request nuevo por cada query (evita reutilización de inputs en mssql)
    const req = () => new sql.Request(transaction);

    // 1. Obtener unidades ya albaranadas en albaranes NO facturados
    const albaranesPrevios = await req()
      .input('codigoEmpresa', sql.SmallInt, infoPedido.codigoEmpresa)
      .input('ejercicioPedido', sql.SmallInt, infoPedido.ejercicio)
      .input('seriePedido', sql.VarChar, infoPedido.serie || '')
      .input('numeroPedido', sql.Int, infoPedido.numeroPedido)
      .query(`
        SELECT lac.CodigoArticulo, SUM(lac.UnidadesServidas) AS TotalUnidades
        FROM CabeceraAlbaranCliente cac
        INNER JOIN LineasAlbaranCliente lac 
          ON cac.CodigoEmpresa = lac.CodigoEmpresa
          AND cac.EjercicioAlbaran = lac.EjercicioAlbaran
          AND cac.SerieAlbaran = lac.SerieAlbaran
          AND cac.NumeroAlbaran = lac.NumeroAlbaran
        WHERE cac.CodigoEmpresa = @codigoEmpresa
          AND cac.EjercicioPedido = @ejercicioPedido
          AND (cac.SeriePedido = @seriePedido OR (@seriePedido = '' AND cac.SeriePedido IS NULL))
          AND cac.NumeroPedido = @numeroPedido
          AND cac.StatusFacturado = 0
        GROUP BY lac.CodigoArticulo
      `);

    const unidadesYaAlbaranadas = {};
    albaranesPrevios.recordset.forEach(row => {
      unidadesYaAlbaranadas[row.CodigoArticulo] = parseFloat(row.TotalUnidades) || 0;
    });
    log('Unidades ya albaranadas:', unidadesYaAlbaranadas);

    // 2. Obtener líneas del pedido con unidades servidas
    const lineasPedido = await req()
      .input('codigoEmpresa', sql.SmallInt, infoPedido.codigoEmpresa)
      .input('ejercicio', sql.SmallInt, infoPedido.ejercicio)
      .input('serie', sql.VarChar, infoPedido.serie || '')
      .input('numeroPedido', sql.Int, infoPedido.numeroPedido)
      .query(`
        SELECT 
          l.CodigoArticulo, l.UnidadesServidas, l.Precio, l.CodigoAlmacen,
          l.LineasPosicion, l.GrupoIva, l.[%Iva], l.PesoBrutoUnitario_,
          l.PesoNetoUnitario_, l.VolumenUnitario_, l.DescripcionArticulo,
          l.Descripcion2Articulo, l.UnidadMedida1_, l.UnidadMedida2_,
          l.FactorConversion_, l.Partida,
          a.CodigoFamilia, a.CodigoSubfamilia
        FROM LineasPedidoCliente l
        LEFT JOIN Articulos a ON a.CodigoArticulo = l.CodigoArticulo AND a.CodigoEmpresa = l.CodigoEmpresa
        WHERE l.CodigoEmpresa = @codigoEmpresa
          AND l.EjercicioPedido = @ejercicio
          AND (l.SeriePedido = @serie OR (@serie = '' AND l.SeriePedido IS NULL))
          AND l.NumeroPedido = @numeroPedido
          AND l.UnidadesServidas > 0
      `);

    const lineasNuevas = [];
    for (const linea of lineasPedido.recordset) {
      const servidas = parseFloat(linea.UnidadesServidas) || 0;
      const yaAlbaranadas = unidadesYaAlbaranadas[linea.CodigoArticulo] || 0;
      const pendientesAlbaran = servidas - yaAlbaranadas;
      if (pendientesAlbaran > 0) {
        lineasNuevas.push({ ...linea, UnidadesServidas: pendientesAlbaran });
      }
    }

    if (lineasNuevas.length === 0) {
      log('No hay unidades nuevas para albarán. Cancelando.');
      await transaction.rollback();
      return { success: false, error: 'No hay unidades nuevas para albarán' };
    }
    log(`Unidades nuevas a albaranar: ${lineasNuevas.length} líneas`);

    // 3. Calcular totales del nuevo albarán
    const fechaActual = new Date();
    const ejercicioAlbaran = fechaActual.getFullYear();
    let totalUnidades = 0;
    let importeBruto = 0;
    let pesoBruto = 0;
    let pesoNeto = 0;
    let volumen = 0;
    let bultos = 0;

    for (const linea of lineasNuevas) {
      const unidades = parseFloat(linea.UnidadesServidas) || 0;
      const precio = parseFloat(linea.Precio) || 0;
      totalUnidades += unidades;
      importeBruto += unidades * precio;
      pesoBruto += unidades * (parseFloat(linea.PesoBrutoUnitario_) || 0);
      pesoNeto += unidades * (parseFloat(linea.PesoNetoUnitario_) || 0);
      volumen += unidades * (parseFloat(linea.VolumenUnitario_) || 0);
      bultos += Math.max(1, Math.ceil(Math.max(unidades / 10, (unidades * (parseFloat(linea.PesoBrutoUnitario_) || 0)) / 50)));
    }

    // 4. Obtener siguiente número de albarán
    const nextAlbaran = await req()
      .input('codigoEmpresa', sql.SmallInt, infoPedido.codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicioAlbaran)
      .input('serie', sql.VarChar, infoPedido.serie || '')
      .query(`
        SELECT ISNULL(MAX(NumeroAlbaran), 0) + 1 AS SiguienteNumero
        FROM CabeceraAlbaranCliente WITH (UPDLOCK, HOLDLOCK)
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
      `);
    const numeroAlbaran = nextAlbaran.recordset[0].SiguienteNumero;
    log(`Nuevo número de albarán: ${numeroAlbaran}`);

    // 5. Insertar cabecera del albarán (nuevo request)
    const horasAlbAuto = fechaActual.getHours();
    const minutosAlbAuto = fechaActual.getMinutes().toString().padStart(2, '0');
    const horaAlbaranDecimalAuto = parseFloat(`${horasAlbAuto}.${minutosAlbAuto}`);
    const fechaEntregaAuto = infoPedido.pedidoInfo.FechaEntrega ? new Date(infoPedido.pedidoInfo.FechaEntrega) : fechaActual;

    await req()
      .input('codigoEmpresa', sql.SmallInt, infoPedido.codigoEmpresa)
      .input('idDelegacion', sql.SmallInt, infoPedido.pedidoInfo.IdDelegacion || 1)
      .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
      .input('serieAlbaran', sql.VarChar, infoPedido.serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, (infoPedido.pedidoInfo.CodigoCliente || '').toString())
      .input('razonSocial', sql.VarChar, (infoPedido.pedidoInfo.RazonSocial || '').toString())
      .input('razonSocial2', sql.VarChar, (infoPedido.pedidoInfo.RazonSocial2 || '').toString())
      .input('razonSocialEnvios', sql.VarChar, (infoPedido.pedidoInfo.RazonSocial || '').toString())
      .input('domicilio', sql.VarChar, (infoPedido.pedidoInfo.Domicilio || '').toString())
      .input('domicilioEnvios', sql.VarChar, (infoPedido.pedidoInfo.Domicilio || '').toString())
      .input('municipio', sql.VarChar, (infoPedido.pedidoInfo.Municipio || '').toString())
      .input('municipioEnvios', sql.VarChar, (infoPedido.pedidoInfo.Municipio || '').toString())
      .input('provincia', sql.VarChar, (infoPedido.pedidoInfo.Provincia || '').toString())
      .input('provinciaEnvios', sql.VarChar, (infoPedido.pedidoInfo.Provincia || '').toString())
      .input('codigoPostal', sql.VarChar, (infoPedido.pedidoInfo.CodigoPostal || '').toString())
      .input('codigoPostalEnvios', sql.VarChar, (infoPedido.pedidoInfo.CodigoPostal || '').toString())
      .input('codigoNacion', sql.SmallInt, infoPedido.pedidoInfo.CodigoNacion || 1)
      .input('codigoNacionEnvios', sql.SmallInt, infoPedido.pedidoInfo.CodigoNacion || 1)
      .input('siglaNacion', sql.VarChar, (infoPedido.pedidoInfo.SiglaNacion ?? 'ES').toString())
      .input('codigoMunicipio', sql.Int, infoPedido.pedidoInfo.CodigoMunicipio || 0)
      .input('codigoMunicipioEnvios', sql.Int, infoPedido.pedidoInfo.CodigoMunicipio || 0)
      .input('codigoProvincia', sql.SmallInt, infoPedido.pedidoInfo.CodigoProvincia || 0)
      .input('codigoProvinciaEnvios', sql.SmallInt, infoPedido.pedidoInfo.CodigoProvincia || 0)
      .input('cifDni', sql.VarChar, (infoPedido.pedidoInfo.CifDni ?? '').toString())
      .input('cifEuropeo', sql.VarChar, (infoPedido.pedidoInfo.CifEuropeo ?? '').toString())
      .input('suPedido', sql.VarChar, (infoPedido.pedidoInfo.SuPedido ?? '').toString())
      .input('telefono', sql.VarChar, (infoPedido.pedidoInfo.Telefono || '').toString())
      .input('telefonoEnvios', sql.VarChar, (infoPedido.pedidoInfo.Telefono || '').toString())
      .input('contacto', sql.VarChar, (infoPedido.pedidoInfo.Contacto || '').toString())
      .input('fechaAlbaran', sql.DateTime, fechaActual)
      .input('fechaCreacion', sql.DateTime, fechaActual)
      .input('fechaEntrega', sql.DateTime, fechaEntregaAuto)
      .input('numeroLineas', sql.SmallInt, lineasNuevas.length)
      .input('empleadoAsignado', sql.VarChar, (infoPedido.pedidoInfo.EmpleadoAsignado || '').toString())
      .input('observacionesWeb', sql.Text, (infoPedido.pedidoInfo.ObservacionesWeb || '').toString())
      .input('observacionesAlbaran', sql.VarChar, (infoPedido.pedidoInfo.ObservacionesAlbaran || '').toString())
      .input('nombreObra', sql.VarChar, (infoPedido.pedidoInfo.NombreObra || '').toString())
      .input('vendedor', sql.VarChar, (infoPedido.pedidoInfo.Vendedor || '').toString())
      .input('statusFacturado', sql.SmallInt, 0)
      .input('esVoluminoso', sql.Bit, infoPedido.pedidoInfo.EsVoluminoso || 0)
      .input('esParcial', sql.Bit, 0)
      .input('ejercicioPedido', sql.SmallInt, infoPedido.ejercicio)
      .input('seriePedido', sql.VarChar, infoPedido.serie || '')
      .input('numeroPedido', sql.Int, infoPedido.numeroPedido)
      .input('codigoCondiciones', sql.SmallInt, infoPedido.pedidoInfo.CodigoCondiciones || 0)
      .input('formaDePago', sql.VarChar, (infoPedido.pedidoInfo.FormadePago ?? '').toString())
      .input('numeroPlazos', sql.SmallInt, infoPedido.pedidoInfo.NumeroPlazos || 1)
      .input('diasPrimerPlazo', sql.SmallInt, infoPedido.pedidoInfo.DiasPrimerPlazo || 0)
      .input('diasEntrePlazos', sql.SmallInt, infoPedido.pedidoInfo.DiasEntrePlazos || 0)
      .input('codigoTransportistaEnvios', sql.Int, infoPedido.pedidoInfo.CodigoTransportistaEnvios || 0)
      .input('tipoPortesEnvios', sql.VarChar, (infoPedido.pedidoInfo.TipoPortesEnvios || '').toString())
      .input('codigoTransaccion', sql.SmallInt, infoPedido.pedidoInfo.CodigoTransaccion || 1)
      .input('codigoTipoEfecto', sql.SmallInt, infoPedido.pedidoInfo.CodigoTipoEfecto || 0)
      .input('domicilioEnvioFlag', sql.SmallInt, infoPedido.pedidoInfo.DomicilioEnvio || 0)
      .input('domicilioFacturaFlag', sql.SmallInt, infoPedido.pedidoInfo.DomicilioFactura || 0)
      .input('domicilioReciboFlag', sql.SmallInt, infoPedido.pedidoInfo.DomicilioRecibo || 0)
      .input('dc', sql.VarChar, (infoPedido.pedidoInfo.DC ?? '').toString())
      .input('ccc', sql.VarChar, (infoPedido.pedidoInfo.CCC ?? '').toString())
      .input('iban', sql.VarChar, (infoPedido.pedidoInfo.IBAN ?? '').toString())
      .input('codigoTerritorio', sql.SmallInt, infoPedido.pedidoInfo.CodigoTerritorio || 0)
      .input('ivaIncluido', sql.SmallInt, infoPedido.pedidoInfo.IvaIncluido || 0)
      .input('formaEnvio', sql.Int, infoPedido.pedidoInfo.FormaEnvio || 3)
      .input('codigoZona', sql.VarChar, (infoPedido.pedidoInfo.CodigoZona ?? '').toString())
      .input('codigoCanal', sql.SmallInt, infoPedido.pedidoInfo.CodigoCanal || 0)
      .input('grupoIva', sql.TinyInt, infoPedido.pedidoInfo.GrupoIva || 1)
      .input('indicadorIva', sql.VarChar, (infoPedido.pedidoInfo.IndicadorIva ?? 'D').toString())
      .input('tarifaPrecio', sql.SmallInt, infoPedido.pedidoInfo.TarifaPrecio || 0)
      .input('tarifaDescuento', sql.SmallInt, infoPedido.pedidoInfo.TarifaDescuento || 0)
      .input('pctDescuento', sql.Decimal(18,4), parseFloat(infoPedido.pedidoInfo['%Descuento']) || 0)
      .input('pctProntoPago', sql.Decimal(18,4), parseFloat(infoPedido.pedidoInfo['%ProntoPago']) || 0)
      .input('pctRappel', sql.Decimal(18,4), parseFloat(infoPedido.pedidoInfo['%Rappel']) || 0)
      .input('pctComision', sql.Decimal(18,4), parseFloat(infoPedido.pedidoInfo['%Comision']) || 0)
      .input('codigoComisionista', sql.VarChar, (infoPedido.pedidoInfo.CodigoComisionista ?? '').toString())
      .input('codigoComisionista2', sql.VarChar, (infoPedido.pedidoInfo.CodigoComisionista2_ ?? '').toString())
      .input('codigoJefeVenta', sql.VarChar, (infoPedido.pedidoInfo.CodigoJefeVenta_ ?? '').toString())
      .input('codigoJefeZona', sql.VarChar, (infoPedido.pedidoInfo.CodigoJefeZona_ ?? '').toString())
      .input('codigoDivisa', sql.VarChar, (infoPedido.pedidoInfo.CodigoDivisa ?? '').toString())
      .input('codigoDefinicion', sql.VarChar, (infoPedido.pedidoInfo.CodigoDefinicion_ ?? '').toString())
      .input('codigoContable', sql.VarChar, (infoPedido.pedidoInfo.CodigoContable ?? '').toString())
      .input('remesaHabitual', sql.VarChar, (infoPedido.pedidoInfo.RemesaHabitual ?? '').toString())
      .input('codigoBanco', sql.VarChar, (infoPedido.pedidoInfo.CodigoBanco ?? '').toString())
      .input('codigoAgencia', sql.VarChar, (infoPedido.pedidoInfo.CodigoAgencia ?? '').toString())
      .input('albaranValorado', sql.SmallInt, infoPedido.pedidoInfo.AlbaranValorado || 0)
      .input('periodicidadFacturas', sql.SmallInt, infoPedido.pedidoInfo.PeriodicidadFacturas || 0)
      .input('agruparAlbaranes', sql.SmallInt, infoPedido.pedidoInfo.AgruparAlbaranes || 0)
      .input('copiasAlbaran', sql.SmallInt, infoPedido.pedidoInfo.CopiasAlbaran || 0)
      .input('copiasFactura', sql.SmallInt, infoPedido.pedidoInfo.CopiasFactura || 0)
      .input('generarFactura', sql.SmallInt, infoPedido.pedidoInfo.GenerarFactura || 0)
      .input('importeLiquido', sql.Decimal(18,4), importeBruto)
      .input('importeBruto', sql.Decimal(18,4), importeBruto)
      .input('baseImponible', sql.Decimal(18,4), importeBruto)
      .input('bultos', sql.Int, bultos)
      .input('pesoBruto', sql.Decimal(18,4), pesoBruto)
      .input('pesoNeto', sql.Decimal(18,4), pesoNeto)
      .input('volumen', sql.Decimal(18,4), volumen)
      .input('horaAlbaran', sql.Decimal(6,2), horaAlbaranDecimalAuto)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, IdDelegacion, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, RazonSocial2, RazonSocialEnvios,
          Domicilio, DomicilioEnvios, Municipio, MunicipioEnvios,
          Provincia, ProvinciaEnvios, CodigoPostal, CodigoPostalEnvios,
          CodigoNacion, CodigoNacionEnvios, SiglaNacion,
          CodigoMunicipio, CodigoMunicipioEnvios,
          CodigoProvincia, CodigoProvinciaEnvios,
          CifDni, CifEuropeo, SuPedido,
          Telefono, TelefonoEnvios, Contacto,
          FechaAlbaran, FechaCreacion, FechaEntrega,
          NumeroLineas, EmpleadoAsignado,
          ObservacionesWeb, ObservacionesAlbaran, NombreObra,
          Vendedor, StatusFacturado, EsVoluminoso, EsParcial,
          EjercicioPedido, SeriePedido, NumeroPedido,
          CodigoCondiciones, FormadePago, NumeroPlazos, DiasPrimerPlazo, DiasEntrePlazos,
          CodigoTransportistaEnvios, TipoPortesEnvios,
          CodigoTransaccion, CodigoTipoEfecto,
          DomicilioEnvio, DomicilioFactura, DomicilioRecibo,
          DC, CCC, IBAN, CodigoTerritorio, IvaIncluido,
          FormaEnvio, CodigoZona, CodigoCanal,
          GrupoIva, IndicadorIva, TarifaPrecio, TarifaDescuento,
          [%Descuento], [%ProntoPago], [%Rappel], [%Comision],
          CodigoComisionista, CodigoComisionista2_, CodigoJefeVenta_, CodigoJefeZona_,
          CodigoDivisa, CodigoDefinicion_, CodigoContable, RemesaHabitual,
          CodigoBanco, CodigoAgencia,
          AlbaranValorado, PeriodicidadFacturas, AgruparAlbaranes,
          CopiasAlbaran, CopiasFactura, GenerarFactura,
          ImporteLiquido, ImporteBruto, BaseImponible,
          Bultos, PesoBruto_, PesoNeto_, Volumen_,
          HoraAlbaran
        ) VALUES (
          @codigoEmpresa, @idDelegacion, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
          @codigoCliente, @razonSocial, @razonSocial2, @razonSocialEnvios,
          @domicilio, @domicilioEnvios, @municipio, @municipioEnvios,
          @provincia, @provinciaEnvios, @codigoPostal, @codigoPostalEnvios,
          @codigoNacion, @codigoNacionEnvios, @siglaNacion,
          @codigoMunicipio, @codigoMunicipioEnvios,
          @codigoProvincia, @codigoProvinciaEnvios,
          @cifDni, @cifEuropeo, @suPedido,
          @telefono, @telefonoEnvios, @contacto,
          @fechaAlbaran, @fechaCreacion, @fechaEntrega,
          @numeroLineas, @empleadoAsignado,
          @observacionesWeb, @observacionesAlbaran, @nombreObra,
          @vendedor, @statusFacturado, @esVoluminoso, @esParcial,
          @ejercicioPedido, @seriePedido, @numeroPedido,
          @codigoCondiciones, @formaDePago, @numeroPlazos, @diasPrimerPlazo, @diasEntrePlazos,
          @codigoTransportistaEnvios, @tipoPortesEnvios,
          @codigoTransaccion, @codigoTipoEfecto,
          @domicilioEnvioFlag, @domicilioFacturaFlag, @domicilioReciboFlag,
          @dc, @ccc, @iban, @codigoTerritorio, @ivaIncluido,
          @formaEnvio, @codigoZona, @codigoCanal,
          @grupoIva, @indicadorIva, @tarifaPrecio, @tarifaDescuento,
          @pctDescuento, @pctProntoPago, @pctRappel, @pctComision,
          @codigoComisionista, @codigoComisionista2, @codigoJefeVenta, @codigoJefeZona,
          @codigoDivisa, @codigoDefinicion, @codigoContable, @remesaHabitual,
          @codigoBanco, @codigoAgencia,
          @albaranValorado, @periodicidadFacturas, @agruparAlbaranes,
          @copiasAlbaran, @copiasFactura, @generarFactura,
          @importeLiquido, @importeBruto, @baseImponible,
          @bultos, @pesoBruto, @pesoNeto, @volumen,
          @horaAlbaran
        )
      `);

    // 6. Insertar líneas del albarán (nuevo request por cada línea)
    for (let i = 0; i < lineasNuevas.length; i++) {
      const linea = lineasNuevas[i];
      const unidades = parseFloat(linea.UnidadesServidas) || 0;
      const precio = parseFloat(linea.Precio) || 0;
      const importeBrutoLinea = unidades * precio;
      const ivaPorcentaje = parseFloat(linea['%Iva']) || 21;
      const baseIvaLinea = importeBrutoLinea;
      const cuotaIvaLinea = baseIvaLinea * (ivaPorcentaje / 100);
      const pesoBrutoLinea = unidades * (parseFloat(linea.PesoBrutoUnitario_) || 0);
      const pesoNetoLinea = unidades * (parseFloat(linea.PesoNetoUnitario_) || 0);
      const volumenLinea = unidades * (parseFloat(linea.VolumenUnitario_) || 0);

      await req()
        .input('codigoEmpresa', sql.SmallInt, infoPedido.codigoEmpresa)
        .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
        .input('serieAlbaran', sql.VarChar, infoPedido.serie || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, i + 1)
        .input('lineasPosicion', sql.UniqueIdentifier, linea.LineasPosicion || null)
        .input('codigoArticulo', sql.VarChar, (linea.CodigoArticulo || '').toString())
        .input('descripcionArticulo', sql.VarChar, (linea.DescripcionArticulo || '').toString())
        .input('descripcion2Articulo', sql.VarChar, (linea.Descripcion2Articulo || '').toString())
        .input('codigodelCliente', sql.VarChar, (infoPedido.pedidoInfo.CodigoCliente || '').toString())
        .input('unidades', sql.Decimal(18,4), unidades)
        .input('unidadesServidas', sql.Decimal(18,4), unidades)
        .input('precio', sql.Decimal(18,4), precio)
        .input('precioTotal', sql.Decimal(18,4), importeBrutoLinea)
        .input('tarifaPrecioLin', sql.SmallInt, infoPedido.pedidoInfo.TarifaPrecio || 0)
        .input('codigoAlmacen', sql.VarChar, (linea.CodigoAlmacen || '').toString())
        .input('partida', sql.VarChar, (linea.Partida || '').toString())
        .input('unidadMedida1_', sql.VarChar, (linea.UnidadMedida1_ || '').toString())
        .input('unidadMedida2_', sql.VarChar, (linea.UnidadMedida2_ || '').toString())
        .input('factorConversion_', sql.Decimal(18,4), linea.FactorConversion_ || 1)
        .input('ejercicioPedido', sql.SmallInt, infoPedido.ejercicio)
        .input('seriePedido', sql.VarChar, infoPedido.serie || '')
        .input('numeroPedido', sql.Int, infoPedido.numeroPedido)
        .input('suPedido', sql.VarChar, (infoPedido.pedidoInfo.SuPedido ?? '').toString())
        .input('codigoDefinicion', sql.VarChar, (infoPedido.pedidoInfo.CodigoDefinicion_ ?? '').toString())
        .input('codigoTransaccion', sql.SmallInt, infoPedido.pedidoInfo.CodigoTransaccion || 1)
        .input('statusStock', sql.SmallInt, -1)
        .input('statusEstadis', sql.SmallInt, 0)
        .input('acumulaEstadistica', sql.SmallInt, -1)
        .input('bloqueoRebaje', sql.SmallInt, 0)
        .input('ivaIncluido', sql.SmallInt, infoPedido.pedidoInfo.IvaIncluido || 0)
        .input('grupoIva', sql.TinyInt, linea.GrupoIva || 1)
        .input('porcentajeIva', sql.Decimal(18,4), ivaPorcentaje)
        .input('codigoComisionista', sql.VarChar, (infoPedido.pedidoInfo.CodigoComisionista ?? '').toString())
        .input('codigoComisionista2', sql.VarChar, (infoPedido.pedidoInfo.CodigoComisionista2_ ?? '').toString())
        .input('codigoJefeVenta', sql.VarChar, (infoPedido.pedidoInfo.CodigoJefeVenta_ ?? '').toString())
        .input('codigoJefeZona', sql.VarChar, (infoPedido.pedidoInfo.CodigoJefeZona_ ?? '').toString())
        .input('importeLiquido', sql.Decimal(18,4), importeBrutoLinea)
        .input('importeNeto', sql.Decimal(18,4), importeBrutoLinea)
        .input('importeBruto', sql.Decimal(18,4), importeBrutoLinea)
        .input('baseImponible', sql.Decimal(18,4), baseIvaLinea)
        .input('baseIva', sql.Decimal(18,4), baseIvaLinea)
        .input('cuotaIva', sql.Decimal(18,4), cuotaIvaLinea)
        .input('totalIva', sql.Decimal(18,4), cuotaIvaLinea)
        .input('pesoBrutoUnitario_', sql.Decimal(18,4), parseFloat(linea.PesoBrutoUnitario_) || 0)
        .input('pesoNetoUnitario_', sql.Decimal(18,4), parseFloat(linea.PesoNetoUnitario_) || 0)
        .input('volumenUnitario_', sql.Decimal(18,4), parseFloat(linea.VolumenUnitario_) || 0)
        .input('pesoBruto_', sql.Decimal(18,4), pesoBrutoLinea)
        .input('pesoNeto_', sql.Decimal(18,4), pesoNetoLinea)
        .input('volumen_', sql.Decimal(18,4), volumenLinea)
        .input('codigoFamilia', sql.VarChar, (linea.CodigoFamilia || '').toString())
        .input('codigoSubfamilia', sql.VarChar, (linea.CodigoSubfamilia || '').toString())
        .input('fechaAlbaran', sql.DateTime, fechaActual)
        .input('fechaRegistro', sql.DateTime, fechaActual)
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, LineasPosicion,
            CodigoArticulo, DescripcionArticulo, Descripcion2Articulo,
            CodigodelCliente,
            Unidades, UnidadesServidas, Precio, PrecioTotal, TarifaPrecioLin,
            CodigoAlmacen, Partida,
            UnidadMedida1_, UnidadMedida2_, FactorConversion_,
            EjercicioPedido, SeriePedido, NumeroPedido,
            SuPedido, CodigoDefinicion_, CodigoTransaccion,
            StatusStock, StatusEstadis, AcumulaEstadistica_, BloqueoRebaje_,
            IvaIncluido, GrupoIva, [%Iva],
            CodigoComisionista, CodigoComisionista2_, CodigoJefeVenta_, CodigoJefeZona_,
            ImporteLiquido, ImporteNeto, ImporteBruto, BaseImponible, BaseIva, CuotaIva, TotalIva,
            PesoBrutoUnitario_, PesoNetoUnitario_, VolumenUnitario_,
            PesoBruto_, PesoNeto_, Volumen_,
            CodigoFamilia, CodigoSubfamilia,
            FechaAlbaran, FechaRegistro
          ) VALUES (
            @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
            @orden, @lineasPosicion,
            @codigoArticulo, @descripcionArticulo, @descripcion2Articulo,
            @codigodelCliente,
            @unidades, @unidadesServidas, @precio, @precioTotal, @tarifaPrecioLin,
            @codigoAlmacen, @partida,
            @unidadMedida1_, @unidadMedida2_, @factorConversion_,
            @ejercicioPedido, @seriePedido, @numeroPedido,
            @suPedido, @codigoDefinicion, @codigoTransaccion,
            @statusStock, @statusEstadis, @acumulaEstadistica, @bloqueoRebaje,
            @ivaIncluido, @grupoIva, @porcentajeIva,
            @codigoComisionista, @codigoComisionista2, @codigoJefeVenta, @codigoJefeZona,
            @importeLiquido, @importeNeto, @importeBruto, @baseImponible, @baseIva, @cuotaIva, @totalIva,
            @pesoBrutoUnitario_, @pesoNetoUnitario_, @volumenUnitario_,
            @pesoBruto_, @pesoNeto_, @volumen_,
            @codigoFamilia, @codigoSubfamilia,
            @fechaAlbaran, @fechaRegistro
          )
        `);
    }

    await transaction.commit();
    log(`Albarán ${numeroAlbaran} generado con éxito`);
    return {
      success: true,
      albaran: {
        numero: numeroAlbaran,
        serie: infoPedido.serie || '',
        ejercicio: ejercicioAlbaran,
        lineas: lineasNuevas.length,
        unidades: totalUnidades,
        importe: importeBruto
      }
    };
  } catch (err) {
    if (transaction && !transaction._aborted) await transaction.rollback();
    log(`ERROR CRÍTICO: ${err.message}`);
    console.error(err);
    return { success: false, error: err.message };
  }
}

// ✅ GENERAR ALBARÁN AUTOMÁTICO (SIEMPRE CREA UNO NUEVO CON SALDO PENDIENTE)
router.post('/generarAlbaranAutoCompletado', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroPedido } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroPedido) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos requeridos' });
  }

  const transaction = new sql.Transaction(getPool());

  try {
    await transaction.begin();
    // FIX: crear nuevo Request por cada query (mssql no permite reutilizar)
    const req = () => new sql.Request(transaction);

    // 1. Verificar que el pedido existe y está completado (Estado = 2)
    const pedidoResult = await req()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT 
          c.*,
          CASE WHEN EXISTS (
            SELECT 1 FROM LineasPedidoCliente l
            WHERE l.CodigoEmpresa = c.CodigoEmpresa
              AND l.EjercicioPedido = c.EjercicioPedido
              AND l.SeriePedido = c.SeriePedido
              AND l.NumeroPedido = c.NumeroPedido
              AND l.UnidadesPendientes > 0
          ) THEN 0 ELSE 1 END AS PedidoCompletado
        FROM CabeceraPedidoCliente c
        WHERE c.CodigoEmpresa = @codigoEmpresa
          AND c.EjercicioPedido = @ejercicio
          AND (c.SeriePedido = @serie OR (@serie = '' AND c.SeriePedido IS NULL))
          AND c.NumeroPedido = @numeroPedido
      `);

    if (pedidoResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ success: false, mensaje: 'Pedido no encontrado' });
    }

    const pedido = pedidoResult.recordset[0];
    if (pedido.PedidoCompletado !== 1) {
      await transaction.rollback();
      return res.status(400).json({ success: false, mensaje: 'El pedido no está completamente expedido' });
    }
    if (pedido.Estado !== 2) {
      await transaction.rollback();
      return res.status(400).json({ success: false, mensaje: 'El pedido no está marcado como servido/completado' });
    }

    // 2. Obtener albaranes anteriores NO FACTURADOS para calcular unidades ya albaranadas
    const albaranesPrevios = await req()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioPedido', sql.SmallInt, ejercicio)
      .input('seriePedido', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT lac.CodigoArticulo, SUM(lac.UnidadesServidas) AS TotalUnidades
        FROM CabeceraAlbaranCliente cac
        INNER JOIN LineasAlbaranCliente lac 
          ON cac.CodigoEmpresa = lac.CodigoEmpresa
          AND cac.EjercicioAlbaran = lac.EjercicioAlbaran
          AND cac.SerieAlbaran = lac.SerieAlbaran
          AND cac.NumeroAlbaran = lac.NumeroAlbaran
        WHERE cac.CodigoEmpresa = @codigoEmpresa
          AND cac.EjercicioPedido = @ejercicioPedido
          AND (cac.SeriePedido = @seriePedido OR (@seriePedido = '' AND cac.SeriePedido IS NULL))
          AND cac.NumeroPedido = @numeroPedido
          AND cac.StatusFacturado = 0
        GROUP BY lac.CodigoArticulo
      `);

    const unidadesYaAlbaranadas = {};
    albaranesPrevios.recordset.forEach(row => {
      unidadesYaAlbaranadas[row.CodigoArticulo] = parseFloat(row.TotalUnidades) || 0;
    });

    // 3. Obtener líneas del pedido con unidades servidas
    const lineasServidas = await req()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT 
          l.CodigoArticulo, l.UnidadesServidas, l.Precio, l.CodigoAlmacen,
          l.LineasPosicion, l.GrupoIva, l.[%Iva], l.PesoBrutoUnitario_,
          l.PesoNetoUnitario_, l.VolumenUnitario_, l.DescripcionArticulo,
          l.Descripcion2Articulo, l.UnidadMedida1_, l.UnidadMedida2_,
          l.FactorConversion_, l.Partida,
          a.CodigoFamilia, a.CodigoSubfamilia
        FROM LineasPedidoCliente l
        LEFT JOIN Articulos a ON a.CodigoArticulo = l.CodigoArticulo AND a.CodigoEmpresa = l.CodigoEmpresa
        WHERE l.CodigoEmpresa = @codigoEmpresa
          AND l.EjercicioPedido = @ejercicio
          AND (l.SeriePedido = @serie OR (@serie = '' AND l.SeriePedido IS NULL))
          AND l.NumeroPedido = @numeroPedido
          AND l.UnidadesServidas > 0
      `);

    // Filtrar solo las líneas con unidades NO ALBARANADAS
    const lineasParaNuevoAlbaran = [];
    for (const linea of lineasServidas.recordset) {
      const servidas = parseFloat(linea.UnidadesServidas) || 0;
      const yaAlbaranadas = unidadesYaAlbaranadas[linea.CodigoArticulo] || 0;
      const pendientesAlbaran = servidas - yaAlbaranadas;
      if (pendientesAlbaran > 0) {
        lineasParaNuevoAlbaran.push({ ...linea, UnidadesServidas: pendientesAlbaran });
      }
    }

    if (lineasParaNuevoAlbaran.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, mensaje: 'No hay nuevas unidades servidas para generar albarán' });
    }

    // 4. Generar nuevo albarán (misma lógica que generarAlbaranParcial)
    const fechaActual = new Date();
    const ejercicioAlbaran = fechaActual.getFullYear();

    const nextAlbaran = await req()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicioAlbaran)
      .input('serie', sql.VarChar, serie || '')
      .query(`
        SELECT ISNULL(MAX(NumeroAlbaran), 0) + 1 AS SiguienteNumero
        FROM CabeceraAlbaranCliente WITH (UPDLOCK, HOLDLOCK)
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
      `);
    const numeroAlbaran = nextAlbaran.recordset[0].SiguienteNumero;

    // Calcular totales
    let totalUnidades = 0;
    let importeBruto = 0;
    let pesoBruto = 0;
    let pesoNeto = 0;
    let volumen = 0;
    let bultos = 0;

    for (const linea of lineasParaNuevoAlbaran) {
      const unidades = parseFloat(linea.UnidadesServidas) || 0;
      const precio = parseFloat(linea.Precio) || 0;
      const pesoBrutoUnit = parseFloat(linea.PesoBrutoUnitario_) || 0;
      const pesoNetoUnit = parseFloat(linea.PesoNetoUnitario_) || 0;
      const volumenUnit = parseFloat(linea.VolumenUnitario_) || 0;

      totalUnidades += unidades;
      importeBruto += unidades * precio;
      pesoBruto += unidades * pesoBrutoUnit;
      pesoNeto += unidades * pesoNetoUnit;
      volumen += unidades * volumenUnit;
      bultos += Math.max(1, Math.ceil(Math.max(unidades / 10, (unidades * pesoBrutoUnit) / 50)));
    }

    // Insertar cabecera (igual que en generarAlbaranParcial)
    const horasAutoC = fechaActual.getHours();
    const minutosAutoC = fechaActual.getMinutes().toString().padStart(2, '0');
    const horaAlbaranAutoC = parseFloat(`${horasAutoC}.${minutosAutoC}`);
    const fechaEntregaAutoC = pedido.FechaEntrega ? new Date(pedido.FechaEntrega) : fechaActual;

    await req()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('idDelegacion', sql.SmallInt, pedido.IdDelegacion || 1)
      .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
      .input('serieAlbaran', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, (pedido.CodigoCliente ?? '').toString())
      .input('razonSocial', sql.VarChar, (pedido.RazonSocial ?? '').toString())
      .input('razonSocial2', sql.VarChar, (pedido.RazonSocial2 ?? '').toString())
      .input('razonSocialEnvios', sql.VarChar, (pedido.RazonSocial ?? '').toString())
      .input('domicilio', sql.VarChar, (pedido.Domicilio ?? '').toString())
      .input('domicilioEnvios', sql.VarChar, (pedido.Domicilio ?? '').toString())
      .input('municipio', sql.VarChar, (pedido.Municipio ?? '').toString())
      .input('municipioEnvios', sql.VarChar, (pedido.Municipio ?? '').toString())
      .input('provincia', sql.VarChar, (pedido.Provincia ?? '').toString())
      .input('provinciaEnvios', sql.VarChar, (pedido.Provincia ?? '').toString())
      .input('codigoPostal', sql.VarChar, (pedido.CodigoPostal ?? '').toString())
      .input('codigoPostalEnvios', sql.VarChar, (pedido.CodigoPostal ?? '').toString())
      .input('codigoNacion', sql.SmallInt, pedido.CodigoNacion || 1)
      .input('codigoNacionEnvios', sql.SmallInt, pedido.CodigoNacion || 1)
      .input('siglaNacion', sql.VarChar, (pedido.SiglaNacion ?? 'ES').toString())
      .input('codigoMunicipio', sql.Int, pedido.CodigoMunicipio || 0)
      .input('codigoMunicipioEnvios', sql.Int, pedido.CodigoMunicipio || 0)
      .input('codigoProvincia', sql.SmallInt, pedido.CodigoProvincia || 0)
      .input('codigoProvinciaEnvios', sql.SmallInt, pedido.CodigoProvincia || 0)
      .input('cifDni', sql.VarChar, (pedido.CifDni ?? '').toString())
      .input('cifEuropeo', sql.VarChar, (pedido.CifEuropeo ?? '').toString())
      .input('suPedido', sql.VarChar, (pedido.SuPedido ?? '').toString())
      .input('telefono', sql.VarChar, (pedido.Telefono ?? '').toString())
      .input('telefonoEnvios', sql.VarChar, (pedido.Telefono ?? '').toString())
      .input('contacto', sql.VarChar, (pedido.Contacto ?? '').toString())
      .input('fechaAlbaran', sql.DateTime, fechaActual)
      .input('fechaCreacion', sql.DateTime, fechaActual)
      .input('fechaEntrega', sql.DateTime, fechaEntregaAutoC)
      .input('numeroLineas', sql.SmallInt, lineasParaNuevoAlbaran.length)
      .input('empleadoAsignado', sql.VarChar, (pedido.EmpleadoAsignado ?? usuario).toString())
      .input('observacionesWeb', sql.Text, (pedido.ObservacionesWeb ?? '').toString())
      .input('observacionesAlbaran', sql.VarChar, (pedido.ObservacionesAlbaran ?? '').toString())
      .input('nombreObra', sql.VarChar, (pedido.NombreObra ?? '').toString())
      .input('vendedor', sql.VarChar, (pedido.Vendedor ?? '').toString())
      .input('statusFacturado', sql.SmallInt, 0)
      .input('esVoluminoso', sql.Bit, pedido.EsVoluminoso || 0)
      .input('esParcial', sql.Bit, 0)
      .input('ejercicioPedido', sql.SmallInt, ejercicio)
      .input('seriePedido', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('codigoCondiciones', sql.SmallInt, pedido.CodigoCondiciones || 0)
      .input('formaDePago', sql.VarChar, (pedido.FormadePago ?? '').toString())
      .input('numeroPlazos', sql.SmallInt, pedido.NumeroPlazos || 1)
      .input('diasPrimerPlazo', sql.SmallInt, pedido.DiasPrimerPlazo || 0)
      .input('diasEntrePlazos', sql.SmallInt, pedido.DiasEntrePlazos || 0)
      .input('codigoTransportistaEnvios', sql.Int, pedido.CodigoTransportistaEnvios || 0)
      .input('tipoPortesEnvios', sql.VarChar, (pedido.TipoPortesEnvios ?? '').toString())
      .input('codigoTransaccion', sql.SmallInt, pedido.CodigoTransaccion || 1)
      .input('codigoTipoEfecto', sql.SmallInt, pedido.CodigoTipoEfecto || 0)
      .input('domicilioEnvioFlag', sql.SmallInt, pedido.DomicilioEnvio || 0)
      .input('domicilioFacturaFlag', sql.SmallInt, pedido.DomicilioFactura || 0)
      .input('domicilioReciboFlag', sql.SmallInt, pedido.DomicilioRecibo || 0)
      .input('dc', sql.VarChar, (pedido.DC ?? '').toString())
      .input('ccc', sql.VarChar, (pedido.CCC ?? '').toString())
      .input('iban', sql.VarChar, (pedido.IBAN ?? '').toString())
      .input('codigoTerritorio', sql.SmallInt, pedido.CodigoTerritorio || 0)
      .input('ivaIncluido', sql.SmallInt, pedido.IvaIncluido || 0)
      .input('formaEnvio', sql.Int, pedido.FormaEnvio || 3)
      .input('codigoZona', sql.VarChar, (pedido.CodigoZona ?? '').toString())
      .input('codigoCanal', sql.SmallInt, pedido.CodigoCanal || 0)
      .input('grupoIva', sql.TinyInt, pedido.GrupoIva || 1)
      .input('indicadorIva', sql.VarChar, (pedido.IndicadorIva ?? 'D').toString())
      .input('tarifaPrecio', sql.SmallInt, pedido.TarifaPrecio || 0)
      .input('tarifaDescuento', sql.SmallInt, pedido.TarifaDescuento || 0)
      .input('pctDescuento', sql.Decimal(18,4), parseFloat(pedido['%Descuento']) || 0)
      .input('pctProntoPago', sql.Decimal(18,4), parseFloat(pedido['%ProntoPago']) || 0)
      .input('pctRappel', sql.Decimal(18,4), parseFloat(pedido['%Rappel']) || 0)
      .input('pctComision', sql.Decimal(18,4), parseFloat(pedido['%Comision']) || 0)
      .input('codigoComisionista', sql.VarChar, (pedido.CodigoComisionista ?? '').toString())
      .input('codigoComisionista2', sql.VarChar, (pedido.CodigoComisionista2_ ?? '').toString())
      .input('codigoJefeVenta', sql.VarChar, (pedido.CodigoJefeVenta_ ?? '').toString())
      .input('codigoJefeZona', sql.VarChar, (pedido.CodigoJefeZona_ ?? '').toString())
      .input('codigoDivisa', sql.VarChar, (pedido.CodigoDivisa ?? '').toString())
      .input('codigoDefinicion', sql.VarChar, (pedido.CodigoDefinicion_ ?? '').toString())
      .input('codigoContable', sql.VarChar, (pedido.CodigoContable ?? '').toString())
      .input('remesaHabitual', sql.VarChar, (pedido.RemesaHabitual ?? '').toString())
      .input('codigoBanco', sql.VarChar, (pedido.CodigoBanco ?? '').toString())
      .input('codigoAgencia', sql.VarChar, (pedido.CodigoAgencia ?? '').toString())
      .input('albaranValorado', sql.SmallInt, pedido.AlbaranValorado || 0)
      .input('periodicidadFacturas', sql.SmallInt, pedido.PeriodicidadFacturas || 0)
      .input('agruparAlbaranes', sql.SmallInt, pedido.AgruparAlbaranes || 0)
      .input('copiasAlbaran', sql.SmallInt, pedido.CopiasAlbaran || 0)
      .input('copiasFactura', sql.SmallInt, pedido.CopiasFactura || 0)
      .input('generarFactura', sql.SmallInt, pedido.GenerarFactura || 0)
      .input('importeLiquido', sql.Decimal(18,4), importeBruto)
      .input('importeBruto', sql.Decimal(18,4), importeBruto)
      .input('baseImponible', sql.Decimal(18,4), importeBruto)
      .input('bultos', sql.Int, bultos)
      .input('pesoBruto', sql.Decimal(18,4), pesoBruto)
      .input('pesoNeto', sql.Decimal(18,4), pesoNeto)
      .input('volumen', sql.Decimal(18,4), volumen)
      .input('horaAlbaran', sql.Decimal(6,2), horaAlbaranAutoC)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, IdDelegacion, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, RazonSocial2, RazonSocialEnvios,
          Domicilio, DomicilioEnvios, Municipio, MunicipioEnvios,
          Provincia, ProvinciaEnvios, CodigoPostal, CodigoPostalEnvios,
          CodigoNacion, CodigoNacionEnvios, SiglaNacion,
          CodigoMunicipio, CodigoMunicipioEnvios,
          CodigoProvincia, CodigoProvinciaEnvios,
          CifDni, CifEuropeo, SuPedido,
          Telefono, TelefonoEnvios, Contacto,
          FechaAlbaran, FechaCreacion, FechaEntrega,
          NumeroLineas, EmpleadoAsignado,
          ObservacionesWeb, ObservacionesAlbaran, NombreObra,
          Vendedor, StatusFacturado, EsVoluminoso, EsParcial,
          EjercicioPedido, SeriePedido, NumeroPedido,
          CodigoCondiciones, FormadePago, NumeroPlazos, DiasPrimerPlazo, DiasEntrePlazos,
          CodigoTransportistaEnvios, TipoPortesEnvios,
          CodigoTransaccion, CodigoTipoEfecto,
          DomicilioEnvio, DomicilioFactura, DomicilioRecibo,
          DC, CCC, IBAN, CodigoTerritorio, IvaIncluido,
          FormaEnvio, CodigoZona, CodigoCanal,
          GrupoIva, IndicadorIva, TarifaPrecio, TarifaDescuento,
          [%Descuento], [%ProntoPago], [%Rappel], [%Comision],
          CodigoComisionista, CodigoComisionista2_, CodigoJefeVenta_, CodigoJefeZona_,
          CodigoDivisa, CodigoDefinicion_, CodigoContable, RemesaHabitual,
          CodigoBanco, CodigoAgencia,
          AlbaranValorado, PeriodicidadFacturas, AgruparAlbaranes,
          CopiasAlbaran, CopiasFactura, GenerarFactura,
          ImporteLiquido, ImporteBruto, BaseImponible,
          Bultos, PesoBruto_, PesoNeto_, Volumen_, HoraAlbaran
        ) VALUES (
          @codigoEmpresa, @idDelegacion, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
          @codigoCliente, @razonSocial, @razonSocial2, @razonSocialEnvios,
          @domicilio, @domicilioEnvios, @municipio, @municipioEnvios,
          @provincia, @provinciaEnvios, @codigoPostal, @codigoPostalEnvios,
          @codigoNacion, @codigoNacionEnvios, @siglaNacion,
          @codigoMunicipio, @codigoMunicipioEnvios,
          @codigoProvincia, @codigoProvinciaEnvios,
          @cifDni, @cifEuropeo, @suPedido,
          @telefono, @telefonoEnvios, @contacto,
          @fechaAlbaran, @fechaCreacion, @fechaEntrega,
          @numeroLineas, @empleadoAsignado,
          @observacionesWeb, @observacionesAlbaran, @nombreObra,
          @vendedor, @statusFacturado, @esVoluminoso, @esParcial,
          @ejercicioPedido, @seriePedido, @numeroPedido,
          @codigoCondiciones, @formaDePago, @numeroPlazos, @diasPrimerPlazo, @diasEntrePlazos,
          @codigoTransportistaEnvios, @tipoPortesEnvios,
          @codigoTransaccion, @codigoTipoEfecto,
          @domicilioEnvioFlag, @domicilioFacturaFlag, @domicilioReciboFlag,
          @dc, @ccc, @iban, @codigoTerritorio, @ivaIncluido,
          @formaEnvio, @codigoZona, @codigoCanal,
          @grupoIva, @indicadorIva, @tarifaPrecio, @tarifaDescuento,
          @pctDescuento, @pctProntoPago, @pctRappel, @pctComision,
          @codigoComisionista, @codigoComisionista2, @codigoJefeVenta, @codigoJefeZona,
          @codigoDivisa, @codigoDefinicion, @codigoContable, @remesaHabitual,
          @codigoBanco, @codigoAgencia,
          @albaranValorado, @periodicidadFacturas, @agruparAlbaranes,
          @copiasAlbaran, @copiasFactura, @generarFactura,
          @importeLiquido, @importeBruto, @baseImponible,
          @bultos, @pesoBruto, @pesoNeto, @volumen, @horaAlbaran
        )
      `);

    // Insertar líneas del albarán (igual que en generarAlbaranParcial)
    for (let i = 0; i < lineasParaNuevoAlbaran.length; i++) {
      const linea = lineasParaNuevoAlbaran[i];
      const unidades = parseFloat(linea.UnidadesServidas) || 0;
      const precio = parseFloat(linea.Precio) || 0;
      const importeBrutoLinea = unidades * precio;
      const ivaPorcentaje = parseFloat(linea['%Iva']) || 21;
      const baseIvaLinea = importeBrutoLinea;
      const cuotaIvaLinea = baseIvaLinea * (ivaPorcentaje / 100);
      const pesoBrutoLinea = unidades * (parseFloat(linea.PesoBrutoUnitario_) || 0);
      const pesoNetoLinea = unidades * (parseFloat(linea.PesoNetoUnitario_) || 0);
      const volumenLinea = unidades * (parseFloat(linea.VolumenUnitario_) || 0);

      await req()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
        .input('serieAlbaran', sql.VarChar, serie || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, i + 1)
        .input('lineasPosicion', sql.UniqueIdentifier, linea.LineasPosicion || null)
        .input('codigoArticulo', sql.VarChar, (linea.CodigoArticulo ?? '').toString())
        .input('descripcionArticulo', sql.VarChar, (linea.DescripcionArticulo ?? '').toString())
        .input('descripcion2Articulo', sql.VarChar, (linea.Descripcion2Articulo ?? '').toString())
        .input('codigodelCliente', sql.VarChar, (pedido.CodigoCliente ?? '').toString())
        .input('unidades', sql.Decimal(18,4), unidades)
        .input('unidadesServidas', sql.Decimal(18,4), unidades)
        .input('precio', sql.Decimal(18,4), precio)
        .input('precioTotal', sql.Decimal(18,4), importeBrutoLinea)
        .input('tarifaPrecioLin', sql.SmallInt, pedido.TarifaPrecio || 0)
        .input('codigoAlmacen', sql.VarChar, (linea.CodigoAlmacen ?? '').toString())
        .input('partida', sql.VarChar, (linea.Partida ?? '').toString())
        .input('unidadMedida1_', sql.VarChar, (linea.UnidadMedida1_ ?? '').toString())
        .input('unidadMedida2_', sql.VarChar, (linea.UnidadMedida2_ ?? '').toString())
        .input('factorConversion_', sql.Decimal(18,4), linea.FactorConversion_ || 1)
        .input('ejercicioPedido', sql.SmallInt, ejercicio)
        .input('seriePedido', sql.VarChar, serie || '')
        .input('numeroPedido', sql.Int, numeroPedido)
        .input('suPedido', sql.VarChar, (pedido.SuPedido ?? '').toString())
        .input('codigoDefinicion', sql.VarChar, (pedido.CodigoDefinicion_ ?? '').toString())
        .input('codigoTransaccion', sql.SmallInt, pedido.CodigoTransaccion || 1)
        .input('statusStock', sql.SmallInt, -1)
        .input('statusEstadis', sql.SmallInt, 0)
        .input('acumulaEstadistica', sql.SmallInt, -1)
        .input('bloqueoRebaje', sql.SmallInt, 0)
        .input('ivaIncluido', sql.SmallInt, pedido.IvaIncluido || 0)
        .input('grupoIva', sql.TinyInt, linea.GrupoIva || 1)
        .input('porcentajeIva', sql.Decimal(18,4), ivaPorcentaje)
        .input('codigoComisionista', sql.VarChar, (pedido.CodigoComisionista ?? '').toString())
        .input('codigoComisionista2', sql.VarChar, (pedido.CodigoComisionista2_ ?? '').toString())
        .input('codigoJefeVenta', sql.VarChar, (pedido.CodigoJefeVenta_ ?? '').toString())
        .input('codigoJefeZona', sql.VarChar, (pedido.CodigoJefeZona_ ?? '').toString())
        .input('importeLiquido', sql.Decimal(18,4), importeBrutoLinea)
        .input('importeNeto', sql.Decimal(18,4), importeBrutoLinea)
        .input('importeBruto', sql.Decimal(18,4), importeBrutoLinea)
        .input('baseImponible', sql.Decimal(18,4), baseIvaLinea)
        .input('baseIva', sql.Decimal(18,4), baseIvaLinea)
        .input('cuotaIva', sql.Decimal(18,4), cuotaIvaLinea)
        .input('totalIva', sql.Decimal(18,4), cuotaIvaLinea)
        .input('pesoBrutoUnitario_', sql.Decimal(18,4), parseFloat(linea.PesoBrutoUnitario_) || 0)
        .input('pesoNetoUnitario_', sql.Decimal(18,4), parseFloat(linea.PesoNetoUnitario_) || 0)
        .input('volumenUnitario_', sql.Decimal(18,4), parseFloat(linea.VolumenUnitario_) || 0)
        .input('pesoBruto_', sql.Decimal(18,4), pesoBrutoLinea)
        .input('pesoNeto_', sql.Decimal(18,4), pesoNetoLinea)
        .input('volumen_', sql.Decimal(18,4), volumenLinea)
        .input('codigoFamilia', sql.VarChar, (linea.CodigoFamilia ?? '').toString())
        .input('codigoSubfamilia', sql.VarChar, (linea.CodigoSubfamilia ?? '').toString())
        .input('fechaAlbaran', sql.DateTime, fechaActual)
        .input('fechaRegistro', sql.DateTime, fechaActual)
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, LineasPosicion,
            CodigoArticulo, DescripcionArticulo, Descripcion2Articulo,
            CodigodelCliente,
            Unidades, UnidadesServidas, Precio, PrecioTotal, TarifaPrecioLin,
            CodigoAlmacen, Partida,
            UnidadMedida1_, UnidadMedida2_, FactorConversion_,
            EjercicioPedido, SeriePedido, NumeroPedido,
            SuPedido, CodigoDefinicion_, CodigoTransaccion,
            StatusStock, StatusEstadis, AcumulaEstadistica_, BloqueoRebaje_,
            IvaIncluido, GrupoIva, [%Iva],
            CodigoComisionista, CodigoComisionista2_, CodigoJefeVenta_, CodigoJefeZona_,
            ImporteLiquido, ImporteNeto, ImporteBruto, BaseImponible, BaseIva, CuotaIva, TotalIva,
            PesoBrutoUnitario_, PesoNetoUnitario_, VolumenUnitario_,
            PesoBruto_, PesoNeto_, Volumen_,
            CodigoFamilia, CodigoSubfamilia,
            FechaAlbaran, FechaRegistro
          ) VALUES (
            @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
            @orden, @lineasPosicion,
            @codigoArticulo, @descripcionArticulo, @descripcion2Articulo,
            @codigodelCliente,
            @unidades, @unidadesServidas, @precio, @precioTotal, @tarifaPrecioLin,
            @codigoAlmacen, @partida,
            @unidadMedida1_, @unidadMedida2_, @factorConversion_,
            @ejercicioPedido, @seriePedido, @numeroPedido,
            @suPedido, @codigoDefinicion, @codigoTransaccion,
            @statusStock, @statusEstadis, @acumulaEstadistica, @bloqueoRebaje,
            @ivaIncluido, @grupoIva, @porcentajeIva,
            @codigoComisionista, @codigoComisionista2, @codigoJefeVenta, @codigoJefeZona,
            @importeLiquido, @importeNeto, @importeBruto, @baseImponible, @baseIva, @cuotaIva, @totalIva,
            @pesoBrutoUnitario_, @pesoNetoUnitario_, @volumenUnitario_,
            @pesoBruto_, @pesoNeto_, @volumen_,
            @codigoFamilia, @codigoSubfamilia,
            @fechaAlbaran, @fechaRegistro
          )
        `);
    }

    await transaction.commit();

    res.json({
      success: true,
      mensaje: 'Albarán generado automáticamente al completar el pedido',
      albaran: {
        ejercicio: ejercicioAlbaran,
        serie: serie || '',
        numero: numeroAlbaran,
        lineas: lineasParaNuevoAlbaran.length,
        unidades: totalUnidades,
        importe: importeBruto
      }
    });
  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR ALBARÁN AUTO]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al generar albarán automático',
      error: err.message,
      stack: err.stack
    });
  }
});

// ✅ GENERAR ALBARÁN PARCIAL (VERSIÓN CORREGIDA - SOLO UNIDADES NO FACTURADAS)
router.post('/generarAlbaranParcial', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroPedido } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroPedido) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos: empresa, ejercicio y número de pedido.' 
    });
  }

  const transaction = new sql.Transaction(getPool());

  try {
    await transaction.begin();

    // 1. Verificar permisos del usuario
    const permisoResult = await getPool().request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador, StatusUsuarioAvanzado, StatusTodosLosPedidos, StatusUsuarioConsulta
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
      `);

    const permisosUsuario = permisoResult.recordset[0];
    const puedeGenerarParcial = permisosUsuario && permisosUsuario.StatusUsuarioConsulta !== -1 && (
      permisosUsuario.StatusAdministrador === -1 ||
      permisosUsuario.StatusUsuarioAvanzado === -1 ||
      permisosUsuario.StatusTodosLosPedidos === -1
    );

    if (!puedeGenerarParcial) {
      await transaction.rollback();
      return res.status(403).json({ 
        success: false, 
        mensaje: 'No tienes permiso para generar albaranes' 
      });
    }

    // 2. Obtener pedido de CabeceraPedidoCliente
    const pedidoResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT 
          CodigoCliente, RazonSocial, RazonSocial2, Domicilio, Municipio, 
          ImporteLiquido, EmpleadoAsignado, Telefono, Contacto,
          ObservacionesWeb, ObservacionesPedido, ObservacionesAlbaran,
          NombreObra, Vendedor, EsVoluminoso,
          Estado, StatusAprobado, FormaEnvio,
          CodigoCondiciones, CodigoTransportistaEnvios, TipoPortesEnvios,
          CodigoPostal, Provincia, CodigoNacion,
          CifDni, CifEuropeo, SuPedido, FechaPedido, FechaEntrega,
          CodigoZona, CodigoCanal, GrupoIva, IndicadorIva,
          TarifaPrecio, TarifaDescuento,
          [%Descuento], [%ProntoPago],
          FormadePago, CodigoComisionista, CodigoDivisa,
          CodigoDefinicion_, CodigoContable, RemesaHabitual,
          CodigoBanco, CodigoAgencia,
          IdDelegacion, SiglaNacion, CodigoMunicipio, CodigoProvincia,
          NumeroPlazos, DiasPrimerPlazo, DiasEntrePlazos,
          CodigoTransaccion, CodigoTipoEfecto,
          DomicilioEnvio, DomicilioFactura, DomicilioRecibo,
          DC, CCC, IBAN, CodigoTerritorio, IvaIncluido,
          AlbaranValorado, PeriodicidadFacturas, AgruparAlbaranes,
          CopiasAlbaran, CopiasFactura, GenerarFactura,
          [%Rappel], [%Comision],
          CodigoComisionista2_, CodigoJefeVenta_, CodigoJefeZona_
        FROM CabeceraPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
      `);

    if (pedidoResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Pedido no encontrado' 
      });
    }

    const pedido = pedidoResult.recordset[0];
    const fechaActual = new Date();
    const ejercicioAlbaran = fechaActual.getFullYear();

    // 3. Obtener albaranes anteriores para este pedido
    const albaranesAnterioresResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioPedido', sql.SmallInt, ejercicio)
      .input('seriePedido', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT lac.EjercicioAlbaran, lac.SerieAlbaran, lac.NumeroAlbaran,
               lac.CodigoArticulo, lac.UnidadesServidas
        FROM CabeceraAlbaranCliente cac
        INNER JOIN LineasAlbaranCliente lac 
          ON cac.CodigoEmpresa = lac.CodigoEmpresa 
          AND cac.EjercicioAlbaran = lac.EjercicioAlbaran 
          AND cac.SerieAlbaran = lac.SerieAlbaran 
          AND cac.NumeroAlbaran = lac.NumeroAlbaran
        WHERE cac.CodigoEmpresa = @codigoEmpresa
          AND cac.EjercicioPedido = @ejercicioPedido
          AND (cac.SeriePedido = @seriePedido OR (@seriePedido = '' AND cac.SeriePedido IS NULL))
          AND cac.NumeroPedido = @numeroPedido
          AND cac.StatusFacturado = 0
      `);

    // Calcular unidades ya facturadas por artículo
    const unidadesYaFacturadas = {};
    albaranesAnterioresResult.recordset.forEach(fila => {
      const articulo = fila.CodigoArticulo;
      const unidades = parseFloat(fila.UnidadesServidas) || 0;
      
      if (!unidadesYaFacturadas[articulo]) {
        unidadesYaFacturadas[articulo] = 0;
      }
      unidadesYaFacturadas[articulo] += unidades;
    });

    // 4. Obtener todas las líneas del pedido con unidades servidas NO FACTURADAS
    const lineasResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT 
          lpc.CodigoArticulo,
          lpc.DescripcionArticulo,
          lpc.Descripcion2Articulo,
          lpc.UnidadesServidas,
          lpc.UnidadesPedidas,
          lpc.UnidadesPendientes,
          lpc.Precio,
          lpc.CodigoAlmacen,
          lpc.Partida,
          lpc.UnidadMedida1_,
          lpc.UnidadMedida2_,
          lpc.FactorConversion_,
          lpc.LineasPosicion,
          lpc.GrupoIva,
          lpc.[%Iva],
          lpc.PesoBrutoUnitario_,
          lpc.PesoNetoUnitario_,
          lpc.VolumenUnitario_,
          a.CodigoFamilia,
          a.CodigoSubfamilia
        FROM LineasPedidoCliente lpc
        LEFT JOIN Articulos a ON a.CodigoArticulo = lpc.CodigoArticulo 
          AND a.CodigoEmpresa = lpc.CodigoEmpresa
        WHERE lpc.CodigoEmpresa = @codigoEmpresa
          AND lpc.EjercicioPedido = @ejercicio
          AND (lpc.SeriePedido = @serie OR (@serie = '' AND lpc.SeriePedido IS NULL))
          AND lpc.NumeroPedido = @numeroPedido
          AND lpc.UnidadesServidas > 0
      `);

    if (lineasResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        mensaje: 'No hay líneas con expediciones para generar albarán parcial' 
      });
    }

    // Filtrar solo las líneas con unidades servidas NO FACTURADAS
    const lineasConUnidadesNoFacturadas = lineasResult.recordset.filter(linea => {
      const articulo = linea.CodigoArticulo;
      const unidadesServidasTotal = parseFloat(linea.UnidadesServidas) || 0;
      const unidadesYaFacturadasParaArticulo = unidadesYaFacturadas[articulo] || 0;
      
      return unidadesServidasTotal > unidadesYaFacturadasParaArticulo;
    });

    if (lineasConUnidadesNoFacturadas.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        mensaje: 'No hay nuevas unidades servidas para generar albarán parcial' 
      });
    }

    // 5. Calcular totales SOLO de las unidades NO FACTURADAS
    let totalUnidadesNoFacturadas = 0;
    let importeBruto = 0;
    let pesoBruto = 0;
    let pesoNeto = 0;
    let volumen = 0;
    let bultos = 0;

    lineasConUnidadesNoFacturadas.forEach(linea => {
      const articulo = linea.CodigoArticulo;
      const unidadesServidasTotal = parseFloat(linea.UnidadesServidas) || 0;
      const unidadesYaFacturadasParaArticulo = unidadesYaFacturadas[articulo] || 0;
      const unidadesNoFacturadas = unidadesServidasTotal - unidadesYaFacturadasParaArticulo;
      
      const precio = parseFloat(linea.Precio) || 0;
      const pesoBrutoUnit = parseFloat(linea.PesoBrutoUnitario_) || 0;
      const pesoNetoUnit = parseFloat(linea.PesoNetoUnitario_) || 0;
      const volumenUnit = parseFloat(linea.VolumenUnitario_) || 0;

      totalUnidadesNoFacturadas += unidadesNoFacturadas;
      importeBruto += unidadesNoFacturadas * precio;
      pesoBruto += unidadesNoFacturadas * pesoBrutoUnit;
      pesoNeto += unidadesNoFacturadas * pesoNetoUnit;
      volumen += unidadesNoFacturadas * volumenUnit;
      
      // Estimación simple de bultos (1 bulto cada 10 unidades o 50kg)
      bultos += Math.max(1, Math.ceil(Math.max(unidadesNoFacturadas / 10, (unidadesNoFacturadas * pesoBrutoUnit) / 50)));
    });

    // 6. Verificar si hay líneas pendientes para determinar si es parcial
    const lineasPendientesResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT COUNT(*) as TotalPendientes
        FROM LineasPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
          AND NumeroPedido = @numeroPedido
          AND UnidadesPendientes > 0
      `);

    const tieneLineasPendientes = lineasPendientesResult.recordset[0].TotalPendientes > 0;
    const esAlbaranParcial = tieneLineasPendientes;

    // 7. Generar número de albarán
    const nextAlbaran = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioAlbaranNum', sql.SmallInt, ejercicioAlbaran)
      .input('serie', sql.VarChar, serie || '')
      .query(`
        SELECT ISNULL(MAX(NumeroAlbaran), 0) + 1 AS SiguienteNumero
        FROM CabeceraAlbaranCliente WITH (UPDLOCK, HOLDLOCK)
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicioAlbaranNum
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
      `);

    const numeroAlbaran = nextAlbaran.recordset[0].SiguienteNumero;

    // 8. Insertar cabecera del albarán
    const horasAlb = fechaActual.getHours();
    const minutosAlb = fechaActual.getMinutes().toString().padStart(2, '0');
    const horaAlbaranDecimal = parseFloat(`${horasAlb}.${minutosAlb}`);
    const fechaEntregaPedido = pedido.FechaEntrega ? new Date(pedido.FechaEntrega) : fechaActual;

    await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('idDelegacion', sql.SmallInt, pedido.IdDelegacion || 1)
      .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
      .input('serieAlbaran', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, (pedido.CodigoCliente ?? '').toString())
      .input('razonSocial', sql.VarChar, (pedido.RazonSocial ?? '').toString())
      .input('razonSocial2', sql.VarChar, (pedido.RazonSocial2 ?? '').toString())
      .input('razonSocialEnvios', sql.VarChar, (pedido.RazonSocial ?? '').toString())
      .input('domicilio', sql.VarChar, (pedido.Domicilio ?? '').toString())
      .input('domicilioEnvios', sql.VarChar, (pedido.Domicilio ?? '').toString())
      .input('municipio', sql.VarChar, (pedido.Municipio ?? '').toString())
      .input('municipioEnvios', sql.VarChar, (pedido.Municipio ?? '').toString())
      .input('provincia', sql.VarChar, (pedido.Provincia ?? '').toString())
      .input('provinciaEnvios', sql.VarChar, (pedido.Provincia ?? '').toString())
      .input('codigoPostal', sql.VarChar, (pedido.CodigoPostal ?? '').toString())
      .input('codigoPostalEnvios', sql.VarChar, (pedido.CodigoPostal ?? '').toString())
      .input('codigoNacion', sql.SmallInt, pedido.CodigoNacion || 1)
      .input('codigoNacionEnvios', sql.SmallInt, pedido.CodigoNacion || 1)
      .input('siglaNacion', sql.VarChar, (pedido.SiglaNacion ?? 'ES').toString())
      .input('codigoMunicipio', sql.Int, pedido.CodigoMunicipio || 0)
      .input('codigoMunicipioEnvios', sql.Int, pedido.CodigoMunicipio || 0)
      .input('codigoProvincia', sql.SmallInt, pedido.CodigoProvincia || 0)
      .input('codigoProvinciaEnvios', sql.SmallInt, pedido.CodigoProvincia || 0)
      .input('cifDni', sql.VarChar, (pedido.CifDni ?? '').toString())
      .input('cifEuropeo', sql.VarChar, (pedido.CifEuropeo ?? '').toString())
      .input('suPedido', sql.VarChar, (pedido.SuPedido ?? '').toString())
      .input('telefonoEnvios', sql.VarChar, (pedido.Telefono ?? '').toString())
      .input('telefono', sql.VarChar, (pedido.Telefono ?? '').toString())
      .input('contacto', sql.VarChar, (pedido.Contacto ?? '').toString())
      .input('fechaAlbaran', sql.DateTime, fechaActual)
      .input('fechaCreacion', sql.DateTime, fechaActual)
      .input('fechaEntrega', sql.DateTime, fechaEntregaPedido)
      .input('numeroLineas', sql.SmallInt, lineasConUnidadesNoFacturadas.length)
      .input('empleadoAsignado', sql.VarChar, (pedido.EmpleadoAsignado ?? usuario).toString())
      .input('observacionesWeb', sql.Text, (pedido.ObservacionesWeb ?? '').toString())
      .input('observacionesAlbaran', sql.VarChar, (pedido.ObservacionesAlbaran ?? '').toString())
      .input('nombreObra', sql.VarChar, (pedido.NombreObra ?? '').toString())
      .input('vendedor', sql.VarChar, (pedido.Vendedor ?? '').toString())
      .input('statusFacturado', sql.SmallInt, 0)
      .input('esVoluminoso', sql.Bit, pedido.EsVoluminoso || 0)
      .input('esParcial', sql.Bit, esAlbaranParcial ? 1 : 0)
      .input('ejercicioPedido', sql.SmallInt, ejercicio)
      .input('seriePedido', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('codigoCondiciones', sql.SmallInt, pedido.CodigoCondiciones || 0)
      .input('formaDePago', sql.VarChar, (pedido.FormadePago ?? '').toString())
      .input('numeroPlazos', sql.SmallInt, pedido.NumeroPlazos || 1)
      .input('diasPrimerPlazo', sql.SmallInt, pedido.DiasPrimerPlazo || 0)
      .input('diasEntrePlazos', sql.SmallInt, pedido.DiasEntrePlazos || 0)
      .input('codigoTransportistaEnvios', sql.Int, pedido.CodigoTransportistaEnvios || 0)
      .input('tipoPortesEnvios', sql.VarChar, (pedido.TipoPortesEnvios ?? '').toString())
      .input('codigoTransaccion', sql.SmallInt, pedido.CodigoTransaccion || 1)
      .input('codigoTipoEfecto', sql.SmallInt, pedido.CodigoTipoEfecto || 0)
      .input('domicilioEnvioFlag', sql.SmallInt, pedido.DomicilioEnvio || 0)
      .input('domicilioFacturaFlag', sql.SmallInt, pedido.DomicilioFactura || 0)
      .input('domicilioReciboFlag', sql.SmallInt, pedido.DomicilioRecibo || 0)
      .input('dc', sql.VarChar, (pedido.DC ?? '').toString())
      .input('ccc', sql.VarChar, (pedido.CCC ?? '').toString())
      .input('iban', sql.VarChar, (pedido.IBAN ?? '').toString())
      .input('codigoTerritorio', sql.SmallInt, pedido.CodigoTerritorio || 0)
      .input('ivaIncluido', sql.SmallInt, pedido.IvaIncluido || 0)
      .input('formaEnvio', sql.Int, pedido.FormaEnvio || 3)
      .input('codigoZona', sql.VarChar, (pedido.CodigoZona ?? '').toString())
      .input('codigoCanal', sql.SmallInt, pedido.CodigoCanal || 0)
      .input('grupoIva', sql.TinyInt, pedido.GrupoIva || 1)
      .input('indicadorIva', sql.VarChar, (pedido.IndicadorIva ?? 'D').toString())
      .input('tarifaPrecio', sql.SmallInt, pedido.TarifaPrecio || 0)
      .input('tarifaDescuento', sql.SmallInt, pedido.TarifaDescuento || 0)
      .input('pctDescuento', sql.Decimal(18,4), parseFloat(pedido['%Descuento']) || 0)
      .input('pctProntoPago', sql.Decimal(18,4), parseFloat(pedido['%ProntoPago']) || 0)
      .input('pctRappel', sql.Decimal(18,4), parseFloat(pedido['%Rappel']) || 0)
      .input('pctComision', sql.Decimal(18,4), parseFloat(pedido['%Comision']) || 0)
      .input('codigoComisionista', sql.VarChar, (pedido.CodigoComisionista ?? '').toString())
      .input('codigoComisionista2', sql.VarChar, (pedido.CodigoComisionista2_ ?? '').toString())
      .input('codigoJefeVenta', sql.VarChar, (pedido.CodigoJefeVenta_ ?? '').toString())
      .input('codigoJefeZona', sql.VarChar, (pedido.CodigoJefeZona_ ?? '').toString())
      .input('codigoDivisa', sql.VarChar, (pedido.CodigoDivisa ?? '').toString())
      .input('codigoDefinicion', sql.VarChar, (pedido.CodigoDefinicion_ ?? '').toString())
      .input('codigoContable', sql.VarChar, (pedido.CodigoContable ?? '').toString())
      .input('remesaHabitual', sql.VarChar, (pedido.RemesaHabitual ?? '').toString())
      .input('codigoBanco', sql.VarChar, (pedido.CodigoBanco ?? '').toString())
      .input('codigoAgencia', sql.VarChar, (pedido.CodigoAgencia ?? '').toString())
      .input('albaranValorado', sql.SmallInt, pedido.AlbaranValorado || 0)
      .input('periodicidadFacturas', sql.SmallInt, pedido.PeriodicidadFacturas || 0)
      .input('agruparAlbaranes', sql.SmallInt, pedido.AgruparAlbaranes || 0)
      .input('copiasAlbaran', sql.SmallInt, pedido.CopiasAlbaran || 0)
      .input('copiasFactura', sql.SmallInt, pedido.CopiasFactura || 0)
      .input('generarFactura', sql.SmallInt, pedido.GenerarFactura || 0)
      .input('importeLiquido', sql.Decimal(18,4), importeBruto)
      .input('importeBruto', sql.Decimal(18,4), importeBruto)
      .input('baseImponible', sql.Decimal(18,4), importeBruto)
      .input('bultos', sql.Int, bultos)
      .input('pesoBruto', sql.Decimal(18,4), pesoBruto)
      .input('pesoNeto', sql.Decimal(18,4), pesoNeto)
      .input('volumen', sql.Decimal(18,4), volumen)
      .input('horaAlbaran', sql.Decimal(6,2), horaAlbaranDecimal)
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, IdDelegacion, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, RazonSocial2, RazonSocialEnvios,
          Domicilio, DomicilioEnvios, Municipio, MunicipioEnvios,
          Provincia, ProvinciaEnvios, CodigoPostal, CodigoPostalEnvios,
          CodigoNacion, CodigoNacionEnvios, SiglaNacion,
          CodigoMunicipio, CodigoMunicipioEnvios,
          CodigoProvincia, CodigoProvinciaEnvios,
          CifDni, CifEuropeo, SuPedido,
          Telefono, TelefonoEnvios, Contacto,
          FechaAlbaran, FechaCreacion, FechaEntrega,
          NumeroLineas, EmpleadoAsignado,
          ObservacionesWeb, ObservacionesAlbaran, NombreObra,
          Vendedor, StatusFacturado, EsVoluminoso, EsParcial,
          EjercicioPedido, SeriePedido, NumeroPedido,
          CodigoCondiciones, FormadePago, NumeroPlazos, DiasPrimerPlazo, DiasEntrePlazos,
          CodigoTransportistaEnvios, TipoPortesEnvios,
          CodigoTransaccion, CodigoTipoEfecto,
          DomicilioEnvio, DomicilioFactura, DomicilioRecibo,
          DC, CCC, IBAN, CodigoTerritorio, IvaIncluido,
          FormaEnvio, CodigoZona, CodigoCanal,
          GrupoIva, IndicadorIva, TarifaPrecio, TarifaDescuento,
          [%Descuento], [%ProntoPago], [%Rappel], [%Comision],
          CodigoComisionista, CodigoComisionista2_, CodigoJefeVenta_, CodigoJefeZona_,
          CodigoDivisa, CodigoDefinicion_, CodigoContable, RemesaHabitual,
          CodigoBanco, CodigoAgencia,
          AlbaranValorado, PeriodicidadFacturas, AgruparAlbaranes,
          CopiasAlbaran, CopiasFactura, GenerarFactura,
          ImporteLiquido, ImporteBruto, BaseImponible,
          Bultos, PesoBruto_, PesoNeto_, Volumen_,
          HoraAlbaran
        ) VALUES (
          @codigoEmpresa, @idDelegacion, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
          @codigoCliente, @razonSocial, @razonSocial2, @razonSocialEnvios,
          @domicilio, @domicilioEnvios, @municipio, @municipioEnvios,
          @provincia, @provinciaEnvios, @codigoPostal, @codigoPostalEnvios,
          @codigoNacion, @codigoNacionEnvios, @siglaNacion,
          @codigoMunicipio, @codigoMunicipioEnvios,
          @codigoProvincia, @codigoProvinciaEnvios,
          @cifDni, @cifEuropeo, @suPedido,
          @telefono, @telefonoEnvios, @contacto,
          @fechaAlbaran, @fechaCreacion, @fechaEntrega,
          @numeroLineas, @empleadoAsignado,
          @observacionesWeb, @observacionesAlbaran, @nombreObra,
          @vendedor, @statusFacturado, @esVoluminoso, @esParcial,
          @ejercicioPedido, @seriePedido, @numeroPedido,
          @codigoCondiciones, @formaDePago, @numeroPlazos, @diasPrimerPlazo, @diasEntrePlazos,
          @codigoTransportistaEnvios, @tipoPortesEnvios,
          @codigoTransaccion, @codigoTipoEfecto,
          @domicilioEnvioFlag, @domicilioFacturaFlag, @domicilioReciboFlag,
          @dc, @ccc, @iban, @codigoTerritorio, @ivaIncluido,
          @formaEnvio, @codigoZona, @codigoCanal,
          @grupoIva, @indicadorIva, @tarifaPrecio, @tarifaDescuento,
          @pctDescuento, @pctProntoPago, @pctRappel, @pctComision,
          @codigoComisionista, @codigoComisionista2, @codigoJefeVenta, @codigoJefeZona,
          @codigoDivisa, @codigoDefinicion, @codigoContable, @remesaHabitual,
          @codigoBanco, @codigoAgencia,
          @albaranValorado, @periodicidadFacturas, @agruparAlbaranes,
          @copiasAlbaran, @copiasFactura, @generarFactura,
          @importeLiquido, @importeBruto, @baseImponible,
          @bultos, @pesoBruto, @pesoNeto, @volumen,
          @horaAlbaran
        )
      `);

    // 9. Insertar líneas del albarán SOLO con unidades NO FACTURADAS
    for (const [index, linea] of lineasConUnidadesNoFacturadas.entries()) {
      const articulo = linea.CodigoArticulo;
      const unidadesServidasTotal = parseFloat(linea.UnidadesServidas) || 0;
      const unidadesYaFacturadasParaArticulo = unidadesYaFacturadas[articulo] || 0;
      const unidadesNoFacturadas = unidadesServidasTotal - unidadesYaFacturadasParaArticulo;
      
      const precio = parseFloat(linea.Precio) || 0;
      const importeBrutoLinea = unidadesNoFacturadas * precio;
      const importeLiquidoLinea = importeBrutoLinea;
      const pesoBrutoUnit = parseFloat(linea.PesoBrutoUnitario_) || 0;
      const pesoNetoUnit = parseFloat(linea.PesoNetoUnitario_) || 0;
      const volumenUnit = parseFloat(linea.VolumenUnitario_) || 0;
      const pesoBrutoLinea = unidadesNoFacturadas * pesoBrutoUnit;
      const pesoNetoLinea = unidadesNoFacturadas * pesoNetoUnit;
      const volumenLinea = unidadesNoFacturadas * volumenUnit;
      const ivaPorcentaje = parseFloat(linea['%Iva']) || 21;
      const baseIvaLinea = importeBrutoLinea;
      const cuotaIvaLinea = baseIvaLinea * (ivaPorcentaje / 100);

      await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
        .input('serieAlbaran', sql.VarChar, serie || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, index + 1)
        .input('lineasPosicion', sql.UniqueIdentifier, linea.LineasPosicion || null)
        .input('codigoArticulo', sql.VarChar, (linea.CodigoArticulo ?? '').toString())
        .input('descripcionArticulo', sql.VarChar, (linea.DescripcionArticulo ?? '').toString())
        .input('descripcion2Articulo', sql.VarChar, (linea.Descripcion2Articulo ?? '').toString())
        .input('codigodelCliente', sql.VarChar, (pedido.CodigoCliente ?? '').toString())
        .input('unidades', sql.Decimal(18,4), unidadesNoFacturadas)
        .input('unidadesServidas', sql.Decimal(18,4), unidadesNoFacturadas)
        .input('precio', sql.Decimal(18,4), precio)
        .input('precioTotal', sql.Decimal(18,4), importeBrutoLinea)
        .input('tarifaPrecioLin', sql.SmallInt, pedido.TarifaPrecio || 0)
        .input('codigoAlmacen', sql.VarChar, (linea.CodigoAlmacen ?? '').toString())
        .input('partida', sql.VarChar, (linea.Partida ?? '').toString())
        .input('unidadMedida1_', sql.VarChar, (linea.UnidadMedida1_ ?? '').toString())
        .input('unidadMedida2_', sql.VarChar, (linea.UnidadMedida2_ ?? '').toString())
        .input('factorConversion_', sql.Decimal(18,4), linea.FactorConversion_ || 1)
        .input('ejercicioPedido', sql.SmallInt, ejercicio)
        .input('seriePedido', sql.VarChar, serie || '')
        .input('numeroPedido', sql.Int, numeroPedido)
        .input('suPedido', sql.VarChar, (pedido.SuPedido ?? '').toString())
        .input('codigoDefinicion', sql.VarChar, (pedido.CodigoDefinicion_ ?? '').toString())
        .input('codigoTransaccion', sql.SmallInt, pedido.CodigoTransaccion || 1)
        .input('statusStock', sql.SmallInt, -1)
        .input('statusEstadis', sql.SmallInt, 0)
        .input('acumulaEstadistica', sql.SmallInt, -1)
        .input('bloqueoRebaje', sql.SmallInt, 0)
        .input('ivaIncluido', sql.SmallInt, pedido.IvaIncluido || 0)
        .input('grupoIva', sql.TinyInt, linea.GrupoIva || 1)
        .input('porcentajeIva', sql.Decimal(18,4), ivaPorcentaje)
        .input('codigoComisionista', sql.VarChar, (pedido.CodigoComisionista ?? '').toString())
        .input('codigoComisionista2', sql.VarChar, (pedido.CodigoComisionista2_ ?? '').toString())
        .input('codigoJefeVenta', sql.VarChar, (pedido.CodigoJefeVenta_ ?? '').toString())
        .input('codigoJefeZona', sql.VarChar, (pedido.CodigoJefeZona_ ?? '').toString())
        .input('importeLiquido', sql.Decimal(18,4), importeLiquidoLinea)
        .input('importeNeto', sql.Decimal(18,4), importeBrutoLinea)
        .input('importeBruto', sql.Decimal(18,4), importeBrutoLinea)
        .input('baseImponible', sql.Decimal(18,4), baseIvaLinea)
        .input('baseIva', sql.Decimal(18,4), baseIvaLinea)
        .input('cuotaIva', sql.Decimal(18,4), cuotaIvaLinea)
        .input('totalIva', sql.Decimal(18,4), cuotaIvaLinea)
        .input('pesoBrutoUnitario_', sql.Decimal(18,4), pesoBrutoUnit)
        .input('pesoNetoUnitario_', sql.Decimal(18,4), pesoNetoUnit)
        .input('volumenUnitario_', sql.Decimal(18,4), volumenUnit)
        .input('pesoBruto_', sql.Decimal(18,4), pesoBrutoLinea)
        .input('pesoNeto_', sql.Decimal(18,4), pesoNetoLinea)
        .input('volumen_', sql.Decimal(18,4), volumenLinea)
        .input('codigoFamilia', sql.VarChar, (linea.CodigoFamilia ?? '').toString())
        .input('codigoSubfamilia', sql.VarChar, (linea.CodigoSubfamilia ?? '').toString())
        .input('fechaAlbaran', sql.DateTime, fechaActual)
        .input('fechaRegistro', sql.DateTime, fechaActual)
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, LineasPosicion,
            CodigoArticulo, DescripcionArticulo, Descripcion2Articulo,
            CodigodelCliente,
            Unidades, UnidadesServidas, Precio, PrecioTotal, TarifaPrecioLin,
            CodigoAlmacen, Partida,
            UnidadMedida1_, UnidadMedida2_, FactorConversion_,
            EjercicioPedido, SeriePedido, NumeroPedido,
            SuPedido, CodigoDefinicion_, CodigoTransaccion,
            StatusStock, StatusEstadis, AcumulaEstadistica_, BloqueoRebaje_,
            IvaIncluido, GrupoIva, [%Iva],
            CodigoComisionista, CodigoComisionista2_, CodigoJefeVenta_, CodigoJefeZona_,
            ImporteLiquido, ImporteNeto, ImporteBruto, BaseImponible, BaseIva, CuotaIva, TotalIva,
            PesoBrutoUnitario_, PesoNetoUnitario_, VolumenUnitario_,
            PesoBruto_, PesoNeto_, Volumen_,
            CodigoFamilia, CodigoSubfamilia,
            FechaAlbaran, FechaRegistro
          ) VALUES (
            @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
            @orden, @lineasPosicion,
            @codigoArticulo, @descripcionArticulo, @descripcion2Articulo,
            @codigodelCliente,
            @unidades, @unidadesServidas, @precio, @precioTotal, @tarifaPrecioLin,
            @codigoAlmacen, @partida,
            @unidadMedida1_, @unidadMedida2_, @factorConversion_,
            @ejercicioPedido, @seriePedido, @numeroPedido,
            @suPedido, @codigoDefinicion, @codigoTransaccion,
            @statusStock, @statusEstadis, @acumulaEstadistica, @bloqueoRebaje,
            @ivaIncluido, @grupoIva, @porcentajeIva,
            @codigoComisionista, @codigoComisionista2, @codigoJefeVenta, @codigoJefeZona,
            @importeLiquido, @importeNeto, @importeBruto, @baseImponible, @baseIva, @cuotaIva, @totalIva,
            @pesoBrutoUnitario_, @pesoNetoUnitario_, @volumenUnitario_,
            @pesoBruto_, @pesoNeto_, @volumen_,
            @codigoFamilia, @codigoSubfamilia,
            @fechaAlbaran, @fechaRegistro
          )
        `);
    }

    // 10. Actualizar estado del pedido
    if (esAlbaranParcial) {
      // Si es parcial, actualizar estado a 4 (Parcial)
      await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, serie || '')
        .input('numeroPedido', sql.Int, numeroPedido)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET Estado = 4
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
      await actualizarStatusSiExiste(null, codigoEmpresa, ejercicio, serie || '', numeroPedido, 'Parcial');
    } else {
      // Si no hay pendientes, marcar como completado (Estado 2 = Servido)
      await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, serie || '')
        .input('numeroPedido', sql.Int, numeroPedido)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET Estado = 2, FechaCompletado = GETDATE()
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
      await actualizarStatusSiExiste(null, codigoEmpresa, ejercicio, serie || '', numeroPedido, 'Servido');
    }

    await transaction.commit();

    res.json({ 
      success: true,
      mensaje: esAlbaranParcial ? 'Albarán parcial generado correctamente' : 'Albarán completo generado correctamente',
      albaran: {
        ejercicio: ejercicio,
        serie: serie || '',
        numero: numeroAlbaran,
        esParcial: esAlbaranParcial,
        lineasProcesadas: lineasConUnidadesNoFacturadas.length,
        unidadesServidas: totalUnidadesNoFacturadas,
        importe: importeBruto,
        statusPedido: esAlbaranParcial ? 'Parcial' : 'Servido'
      }
    });
  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR GENERAR ALBARAN PARCIAL]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al generar albarán parcial',
      error: err.message,
      stack: err.stack
    });
  }
});

// ============================================
// ✅ 6. ASIGNAR PEDIDOS SCREEN
// ============================================


  return router;
};