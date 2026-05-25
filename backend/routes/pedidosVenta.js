const express = require('express');

module.exports = function createpedidosVentaRouter({ sql, getPool }) {
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
    
    // 3. Mapeo de formas de entrega
    const formasEntregaMap = {
      1: 'Recogida Guadalhorce',
      3: 'Nuestros Medios',
      4: 'Agencia',
      5: 'Directo Fabrica',
      6: 'Pedido Express'
    };

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
        AND c.SeriePedido NOT IN ('X', 'R')
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
    'codigoArticulo', 'cantidadExpedida', 'ubicacion', 'almacen',
    'movPosicionLinea'
  ];
  for (const campo of camposRequeridos) {
    if (!datosLinea[campo]) {
      return res.status(400).json({ success: false, mensaje: `Campo requerido: ${campo}` });
    }
  }

  const truncarString = (valor, longitudMaxima) => {
    if (!valor) return '';
    return valor.toString().substring(0, longitudMaxima);
  };

  const codigoColor = datosLinea.codigoColor ? truncarString(datosLinea.codigoColor, 10) : '';
  const codigoTalla = datosLinea.codigoTalla ? truncarString(datosLinea.codigoTalla, 10) : '';
  const partida = datosLinea.partida ? truncarString(datosLinea.partida, 20) : '';
  const esZonaDescarga = datosLinea.esZonaDescarga || datosLinea.ubicacion === "Zona descarga";

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

    // 2. VERIFICAR STOCK (si no es Zona Descarga)
    if (!esZonaDescarga) {
      const requestStock = new sql.Request(transaction);
      const stockResult = await requestStock
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

    // 4. ACTUALIZAR STOCK EN UBICACIÓN (solo si no es zona descarga)
    if (!esZonaDescarga) {
      // Actualizar AcumuladoStockUbicacion
      const requestStockUpdate = new sql.Request(transaction);
      await requestStockUpdate
        .input('cantidad', sql.Decimal(18,4), cantidadExpedidaStock)
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
            UnidadSaldo = UnidadSaldo - @cantidad,
            UnidadSaldoTipo_ = UnidadSaldoTipo_ - @cantidad
          WHERE CodigoEmpresa = @codigoEmpresa
            AND CodigoAlmacen = @almacen
            AND CodigoArticulo = @codigoArticulo
            AND Ubicacion = @ubicacion
            AND (TipoUnidadMedida_ = @unidadMedida OR (@unidadMedida = 'unidades' AND (TipoUnidadMedida_ IS NULL OR TipoUnidadMedida_ = '')))
            AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
            AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
            AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
            AND Periodo = 99
        `);
      console.log('[EXPEDICION] Stock actualizado en AcumuladoStockUbicacion');

      // Actualizar tabla resumen AcumuladoStock
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
      console.log('[EXPEDICION] Stock actualizado en AcumuladoStock');
    }

    // 5. ACTUALIZAR TABLA DE TALLAS (si aplica)
    if (codigoColor && grupoTalla && codigoTalla) {
      console.log('[EXPEDICION] Actualizando tallas con:', {
        grupoTalla, codigoColor, codigoTalla, cantidad: datosLinea.cantidadExpedida
      });
      try {
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
            SELECT CodigoTalla01_, CodigoTalla02_, CodigoTalla03_, CodigoTalla04_
            FROM GrupoTallas_
            WHERE GrupoTalla_ = @grupoTalla
              AND CodigoEmpresa = @codigoEmpresa
          `);

        if (grupoTallasResult.recordset.length > 0) {
          const grupoTallas = grupoTallasResult.recordset[0];
          let columnaTalla = '';
          if (grupoTallas.CodigoTalla01_ === codigoTalla) {
            columnaTalla = 'UnidadesTalla01_';
          } else if (grupoTallas.CodigoTalla02_ === codigoTalla) {
            columnaTalla = 'UnidadesTalla02_';
          } else if (grupoTallas.CodigoTalla03_ === codigoTalla) {
            columnaTalla = 'UnidadesTalla03_';
          } else if (grupoTallas.CodigoTalla04_ === codigoTalla) {
            columnaTalla = 'UnidadesTalla04_';
          }

          if (columnaTalla) {
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
      } catch (tallasError) {
        console.error('[ERROR ACTUALIZAR TALLAS]', tallasError);
        // No hacemos rollback porque no es crítico, solo log
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
              AND l.SeriePedido = @serie
              AND l.NumeroPedido = @numeroPedido
              AND l.UnidadesPendientes > 0
          ) THEN 0 ELSE 1 END AS PedidoCompletado,
          c.Estado,
          c.StatusAprobado,
          c.FormaEnvio,
          c.CodigoCliente,
          c.RazonSocial,
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
          c.NombreObra,
          c.Vendedor,
          c.EsVoluminoso,
          c.CodigoCondiciones,
          c.CodigoTransportistaEnvios,
          c.TipoPortesEnvios
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

    await transaction.commit();
    console.log('[EXPEDICION] Transacción principal confirmada');

    // 7. GENERAR ALBARÁN AUTOMÁTICO EN SEGUNDO PLANO (solo si pedido completado)
    let albaranGenerado = false;
    let albaranInfo = null;

    if (pedidoCompletado && pedidoInfoParaAlbaran) {
      console.log('[EXPEDICION] Pedido completado, iniciando generación de albarán...');
      const resultadoAlbaran = await generarAlbaranAutomaticoEnSegundoPlano(pedidoInfoParaAlbaran);
      if (resultadoAlbaran.success) {
        albaranGenerado = true;
        albaranInfo = resultadoAlbaran.albaran;
        console.log(`[EXPEDICION] Albarán generado correctamente: ${albaranInfo.serie}${albaranInfo.numero}`);
      } else {
        console.error(`[EXPEDICION] Error generando albarán: ${resultadoAlbaran.error}`);
      }
    }

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
        stockRestante: esZonaDescarga ? 'N/A (Zona Descarga)' : 'Actualizado',
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
// FUNCIÓN AUXILIAR: ACTUALIZAR ACUMULADOSTOCK (TABLA RESUMEN)
// ============================================================
async function actualizarAcumuladoStockParaArticulo(transaction, codigoEmpresa, codigoAlmacen, codigoArticulo, unidadMedida, partida, codigoColor, codigoTalla, ubicacion) {
  try {
    // Recalcular stock total desde AcumuladoStockUbicacion
    const totalResult = await new sql.Request(transaction)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('unidadMedida', sql.VarChar, unidadMedida || '')
      .input('partida', sql.VarChar, partida || '')
      .input('codigoColor', sql.VarChar, codigoColor || '')
      .input('codigoTalla', sql.VarChar, codigoTalla || '')
      .query(`
        SELECT SUM(UnidadSaldoTipo_) AS StockTotal
        FROM AcumuladoStockUbicacion
        WHERE CodigoEmpresa = @codigoEmpresa
          AND CodigoAlmacen = @codigoAlmacen
          AND CodigoArticulo = @codigoArticulo
          AND (TipoUnidadMedida_ = @unidadMedida OR (@unidadMedida = '' AND TipoUnidadMedida_ IS NULL))
          AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
          AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
          AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
          AND Periodo = 99
      `);

    const stockTotal = totalResult.recordset[0]?.StockTotal || 0;

    // Eliminar registro existente
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
          AND (TipoUnidadMedida_ = @unidadMedida OR (@unidadMedida = '' AND TipoUnidadMedida_ IS NULL))
          AND (Partida = @partida OR (Partida IS NULL AND @partida = ''))
          AND (CodigoColor_ = @codigoColor OR (CodigoColor_ IS NULL AND @codigoColor = ''))
          AND (CodigoTalla01_ = @codigoTalla OR (CodigoTalla01_ IS NULL AND @codigoTalla = ''))
          AND Periodo = 99
      `);

    // Insertar nuevo registro si hay stock
    if (stockTotal > 0) {
      await new sql.Request(transaction)
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('codigoAlmacen', sql.VarChar, codigoAlmacen)
        .input('codigoArticulo', sql.VarChar, codigoArticulo)
        .input('unidadMedida', sql.VarChar, unidadMedida || '')
        .input('partida', sql.VarChar, partida || '')
        .input('codigoColor', sql.VarChar, codigoColor || '')
        .input('codigoTalla', sql.VarChar, codigoTalla || '')
        .input('ubicacion', sql.VarChar, ubicacion)
        .input('stockTotal', sql.Decimal(18,4), stockTotal)
        .query(`
          INSERT INTO AcumuladoStock (
            CodigoEmpresa, Ejercicio, CodigoAlmacen, Ubicacion,
            CodigoArticulo, TipoUnidadMedida_, Partida, CodigoColor_, CodigoTalla01_,
            UnidadSaldo, UnidadSaldoTipo_, Periodo
          ) VALUES (
            @codigoEmpresa, YEAR(GETDATE()), @codigoAlmacen, @ubicacion,
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
// FUNCIÓN DE GENERACIÓN DE ALBARÁN AUTOMÁTICO (MEJORADA)
// ============================================================
async function generarAlbaranAutomaticoEnSegundoPlano(infoPedido) {
  const log = (msg) => console.log(`[ALBARAN PEDIDO ${infoPedido.numeroPedido}] ${msg}`);
  log('Iniciando proceso de generación de albarán');

  const transaction = new sql.Transaction(getPool());
  try {
    await transaction.begin();
    const txRequest = transaction.request();

    // 1. Obtener unidades ya albaranadas en albaranes NO facturados (StatusFacturado = 0)
    const albaranesPrevios = await txRequest
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
    log('Unidades ya albaranadas en albaranes pendientes:', unidadesYaAlbaranadas);

    // 2. Obtener líneas del pedido con unidades servidas
    const lineasPedido = await txRequest
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

    // 4. Obtener siguiente número de albarán
    const nextAlbaran = await txRequest
      .input('codigoEmpresa', sql.SmallInt, infoPedido.codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicioAlbaran)
      .input('serie', sql.VarChar, infoPedido.serie || '')
      .query(`
        SELECT ISNULL(MAX(NumeroAlbaran), 0) + 1 AS SiguienteNumero
        FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
      `);
    const numeroAlbaran = nextAlbaran.recordset[0].SiguienteNumero;
    log(`Nuevo número de albarán: ${numeroAlbaran}`);

    // 5. Insertar cabecera del albarán (ajustar nombres de columna según tu esquema)
    await txRequest
      .input('codigoEmpresa', sql.SmallInt, infoPedido.codigoEmpresa)
      .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
      .input('serieAlbaran', sql.VarChar, infoPedido.serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, (infoPedido.pedidoInfo.CodigoCliente || '').toString())
      .input('razonSocial', sql.VarChar, (infoPedido.pedidoInfo.RazonSocial || '').toString())
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
      .input('fechaAlbaran', sql.DateTime, fechaActual)
      .input('fechaCreacion', sql.DateTime, fechaActual)
      .input('fechaEntrega', sql.DateTime, fechaActual)
      .input('numeroLineas', sql.SmallInt, lineasNuevas.length)
      .input('empleadoAsignado', sql.VarChar, (infoPedido.pedidoInfo.EmpleadoAsignado || '').toString())
      .input('telefono', sql.VarChar, (infoPedido.pedidoInfo.Telefono || '').toString())
      .input('telefonoEnvios', sql.VarChar, (infoPedido.pedidoInfo.Telefono || '').toString())
      .input('contacto', sql.VarChar, (infoPedido.pedidoInfo.Contacto || '').toString())
      .input('observacionesWeb', sql.Text, `${(infoPedido.pedidoInfo.ObservacionesWeb || '').toString()} | Albarán automático post-expedición`)
      .input('nombreObra', sql.VarChar, (infoPedido.pedidoInfo.NombreObra || '').toString())
      .input('vendedor', sql.VarChar, (infoPedido.pedidoInfo.Vendedor || '').toString())
      .input('statusFacturado', sql.SmallInt, 0)
      .input('esVoluminoso', sql.Bit, infoPedido.pedidoInfo.EsVoluminoso || 0)
      .input('esParcial', sql.Bit, 0)
      .input('ejercicioPedido', sql.SmallInt, infoPedido.ejercicio)
      .input('seriePedido', sql.VarChar, infoPedido.serie || '')
      .input('numeroPedido', sql.Int, infoPedido.numeroPedido)
      .input('codigoCondiciones', sql.SmallInt, infoPedido.pedidoInfo.CodigoCondiciones || 0)
      .input('codigoTransportistaEnvios', sql.Int, infoPedido.pedidoInfo.CodigoTransportistaEnvios || 0)
      .input('tipoPortesEnvios', sql.VarChar, (infoPedido.pedidoInfo.TipoPortesEnvios || '').toString())
      .input('formaEnvio', sql.Int, infoPedido.pedidoInfo.FormaEnvio || 3)
      .input('importeLiquido', sql.Decimal(18,4), importeBruto)
      .input('importeBruto', sql.Decimal(18,4), importeBruto)
      .input('baseImponible', sql.Decimal(18,4), importeBruto)
      .input('bultos', sql.Int, bultos)
      .input('pesoBruto', sql.Decimal(18,4), pesoBruto)
      .input('pesoNeto', sql.Decimal(18,4), pesoNeto)
      .input('volumen', sql.Decimal(18,4), volumen)
      .input('horaAlbaran', sql.Decimal(6,2), parseFloat(`${fechaActual.getHours()}.${fechaActual.getMinutes()}`))
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, RazonSocialEnvios,
          Domicilio, DomicilioEnvios, Municipio, MunicipioEnvios,
          Provincia, ProvinciaEnvios, CodigoPostal, CodigoPostalEnvios,
          CodigoNacion, CodigoNacionEnvios, Telefono, TelefonoEnvios,
          Contacto, FechaAlbaran, FechaCreacion, FechaEntrega,
          NumeroLineas, EmpleadoAsignado, ObservacionesWeb, NombreObra,
          Vendedor, StatusFacturado, EsVoluminoso, EsParcial,
          EjercicioPedido, SeriePedido, NumeroPedido,
          CodigoCondiciones, CodigoTransportistaEnvios, TipoPortesEnvios,
          FormaEnvio, ImporteLiquido, ImporteBruto, BaseImponible,
          Bultos, PesoBruto_, PesoNeto_, Volumen_,
          HoraAlbaran
        ) VALUES (
          @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
          @codigoCliente, @razonSocial, @razonSocialEnvios,
          @domicilio, @domicilioEnvios, @municipio, @municipioEnvios,
          @provincia, @provinciaEnvios, @codigoPostal, @codigoPostalEnvios,
          @codigoNacion, @codigoNacionEnvios, @telefono, @telefonoEnvios,
          @contacto, @fechaAlbaran, @fechaCreacion, @fechaEntrega,
          @numeroLineas, @empleadoAsignado, @observacionesWeb, @nombreObra,
          @vendedor, @statusFacturado, @esVoluminoso, @esParcial,
          @ejercicioPedido, @seriePedido, @numeroPedido,
          @codigoCondiciones, @codigoTransportistaEnvios, @tipoPortesEnvios,
          @formaEnvio, @importeLiquido, @importeBruto, @baseImponible,
          @bultos, @pesoBruto, @pesoNeto, @volumen,
          @horaAlbaran
        )
      `);

    // 6. Insertar líneas del albarán
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

      await txRequest
        .input('codigoEmpresa', sql.SmallInt, infoPedido.codigoEmpresa)
        .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
        .input('serieAlbaran', sql.VarChar, infoPedido.serie || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, i + 1)
        .input('lineasPosicion', sql.UniqueIdentifier, linea.LineasPosicion || null)
        .input('codigoArticulo', sql.VarChar, (linea.CodigoArticulo || '').toString())
        .input('descripcionArticulo', sql.VarChar, (linea.DescripcionArticulo || '').toString())
        .input('descripcion2Articulo', sql.VarChar, (linea.Descripcion2Articulo || '').toString())
        .input('unidades', sql.Decimal(18,4), unidades)
        .input('unidadesServidas', sql.Decimal(18,4), unidades)
        .input('precio', sql.Decimal(18,4), precio)
        .input('codigoAlmacen', sql.VarChar, (linea.CodigoAlmacen || '').toString())
        .input('partida', sql.VarChar, (linea.Partida || '').toString())
        .input('unidadMedida1_', sql.VarChar, (linea.UnidadMedida1_ || '').toString())
        .input('unidadMedida2_', sql.VarChar, (linea.UnidadMedida2_ || '').toString())
        .input('factorConversion_', sql.Decimal(18,4), linea.FactorConversion_ || 1)
        .input('ejercicioPedido', sql.SmallInt, infoPedido.ejercicio)
        .input('seriePedido', sql.VarChar, infoPedido.serie || '')
        .input('numeroPedido', sql.Int, infoPedido.numeroPedido)
        .input('grupoIva', sql.TinyInt, linea.GrupoIva || 1)
        .input('porcentajeIva', sql.Decimal(18,4), ivaPorcentaje)
        .input('importeLiquido', sql.Decimal(18,4), importeBrutoLinea)
        .input('importeBruto', sql.Decimal(18,4), importeBrutoLinea)
        .input('baseImponible', sql.Decimal(18,4), baseIvaLinea)
        .input('baseIva', sql.Decimal(18,4), baseIvaLinea)
        .input('cuotaIva', sql.Decimal(18,4), cuotaIvaLinea)
        .input('pesoBrutoUnitario_', sql.Decimal(18,4), parseFloat(linea.PesoBrutoUnitario_) || 0)
        .input('pesoNetoUnitario_', sql.Decimal(18,4), parseFloat(linea.PesoNetoUnitario_) || 0)
        .input('volumenUnitario_', sql.Decimal(18,4), parseFloat(linea.VolumenUnitario_) || 0)
        .input('pesoBruto_', sql.Decimal(18,4), pesoBrutoLinea)
        .input('pesoNeto_', sql.Decimal(18,4), pesoNetoLinea)
        .input('volumen_', sql.Decimal(18,4), volumenLinea)
        .input('codigoFamilia', sql.VarChar, (linea.CodigoFamilia || '').toString())
        .input('codigoSubfamilia', sql.VarChar, (linea.CodigoSubfamilia || '').toString())
        .input('fechaRegistro', sql.DateTime, fechaActual)
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, LineasPosicion,
            CodigoArticulo, DescripcionArticulo, Descripcion2Articulo,
            Unidades, UnidadesServidas, Precio,
            CodigoAlmacen, Partida,
            UnidadMedida1_, UnidadMedida2_, FactorConversion_,
            EjercicioPedido, SeriePedido, NumeroPedido,
            GrupoIva, [%Iva],
            ImporteLiquido, ImporteBruto, BaseImponible, BaseIva, CuotaIva,
            PesoBrutoUnitario_, PesoNetoUnitario_, VolumenUnitario_,
            PesoBruto_, PesoNeto_, Volumen_,
            CodigoFamilia, CodigoSubfamilia,
            FechaRegistro
          ) VALUES (
            @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
            @orden, @lineasPosicion,
            @codigoArticulo, @descripcionArticulo, @descripcion2Articulo,
            @unidades, @unidadesServidas, @precio,
            @codigoAlmacen, @partida,
            @unidadMedida1_, @unidadMedida2_, @factorConversion_,
            @ejercicioPedido, @seriePedido, @numeroPedido,
            @grupoIva, @porcentajeIva,
            @importeLiquido, @importeBruto, @baseImponible, @baseIva, @cuotaIva,
            @pesoBrutoUnitario_, @pesoNetoUnitario_, @volumenUnitario_,
            @pesoBruto_, @pesoNeto_, @volumen_,
            @codigoFamilia, @codigoSubfamilia,
            @fechaRegistro
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
    const txRequest = transaction.request();

    // 1. Verificar que el pedido existe y está completado (Estado = 2)
    const pedidoResult = await txRequest
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
    const albaranesPrevios = await txRequest
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
    const lineasServidas = await txRequest
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

    const nextAlbaran = await txRequest
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicioAlbaran)
      .input('serie', sql.VarChar, serie || '')
      .query(`
        SELECT ISNULL(MAX(NumeroAlbaran), 0) + 1 AS SiguienteNumero
        FROM CabeceraAlbaranCliente
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
    await txRequest
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
      .input('serieAlbaran', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, pedido.CodigoCliente || '')
      .input('razonSocial', sql.VarChar, pedido.RazonSocial || '')
      .input('razonSocialEnvios', sql.VarChar, pedido.RazonSocial || '')
      .input('domicilio', sql.VarChar, pedido.Domicilio || '')
      .input('domicilioEnvios', sql.VarChar, pedido.Domicilio || '')
      .input('municipio', sql.VarChar, pedido.Municipio || '')
      .input('municipioEnvios', sql.VarChar, pedido.Municipio || '')
      .input('provincia', sql.VarChar, pedido.Provincia || '')
      .input('provinciaEnvios', sql.VarChar, pedido.Provincia || '')
      .input('codigoPostal', sql.VarChar, pedido.CodigoPostal || '')
      .input('codigoPostalEnvios', sql.VarChar, pedido.CodigoPostal || '')
      .input('codigoNacion', sql.SmallInt, pedido.CodigoNacion || 1)
      .input('codigoNacionEnvios', sql.SmallInt, pedido.CodigoNacion || 1)
      .input('fechaAlbaran', sql.DateTime, fechaActual)
      .input('fechaCreacion', sql.DateTime, fechaActual)
      .input('fechaEntrega', sql.DateTime, fechaActual)
      .input('numeroLineas', sql.SmallInt, lineasParaNuevoAlbaran.length)
      .input('empleadoAsignado', sql.VarChar, pedido.EmpleadoAsignado || usuario)
      .input('telefono', sql.VarChar, pedido.Telefono || '')
      .input('telefonoEnvios', sql.VarChar, pedido.Telefono || '')
      .input('contacto', sql.VarChar, pedido.Contacto || '')
      .input('observacionesWeb', sql.Text, (pedido.ObservacionesWeb || '') + ' | Albarán automático post-expedición')
      .input('nombreObra', sql.VarChar, pedido.NombreObra || '')
      .input('vendedor', sql.VarChar, pedido.Vendedor || '')
      .input('statusFacturado', sql.SmallInt, 0)
      .input('esVoluminoso', sql.Bit, pedido.EsVoluminoso || 0)
      .input('esParcial', sql.Bit, 0)
      .input('ejercicioPedido', sql.SmallInt, ejercicio)
      .input('seriePedido', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('codigoCondiciones', sql.SmallInt, pedido.CodigoCondiciones || 0)
      .input('codigoTransportistaEnvios', sql.Int, pedido.CodigoTransportistaEnvios || 0)
      .input('tipoPortesEnvios', sql.VarChar, pedido.TipoPortesEnvios || '')
      .input('formaEnvio', sql.Int, pedido.FormaEnvio || 3)
      .input('importeLiquido', sql.Decimal(18,4), importeBruto)
      .input('importeBruto', sql.Decimal(18,4), importeBruto)
      .input('baseImponible', sql.Decimal(18,4), importeBruto)
      .input('bultos', sql.Int, bultos)
      .input('pesoBruto', sql.Decimal(18,4), pesoBruto)
      .input('pesoNeto', sql.Decimal(18,4), pesoNeto)
      .input('volumen', sql.Decimal(18,4), volumen)
      .input('horaAlbaran', sql.Decimal(6,2), parseFloat(`${fechaActual.getHours()}.${fechaActual.getMinutes()}`))
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, RazonSocialEnvios,
          Domicilio, DomicilioEnvios, Municipio, MunicipioEnvios,
          Provincia, ProvinciaEnvios, CodigoPostal, CodigoPostalEnvios,
          CodigoNacion, CodigoNacionEnvios, Telefono, TelefonoEnvios,
          Contacto, FechaAlbaran, FechaCreacion, FechaEntrega,
          NumeroLineas, EmpleadoAsignado, ObservacionesWeb, NombreObra,
          Vendedor, StatusFacturado, EsVoluminoso, EsParcial,
          EjercicioPedido, SeriePedido, NumeroPedido,
          CodigoCondiciones, CodigoTransportistaEnvios, TipoPortesEnvios,
          FormaEnvio, ImporteLiquido, ImporteBruto, BaseImponible,
          Bultos, PesoBruto_, PesoNeto_, Volumen_,
          HoraAlbaran
        ) VALUES (
          @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
          @codigoCliente, @razonSocial, @razonSocialEnvios,
          @domicilio, @domicilioEnvios, @municipio, @municipioEnvios,
          @provincia, @provinciaEnvios, @codigoPostal, @codigoPostalEnvios,
          @codigoNacion, @codigoNacionEnvios, @telefono, @telefonoEnvios,
          @contacto, @fechaAlbaran, @fechaCreacion, @fechaEntrega,
          @numeroLineas, @empleadoAsignado, @observacionesWeb, @nombreObra,
          @vendedor, @statusFacturado, @esVoluminoso, @esParcial,
          @ejercicioPedido, @seriePedido, @numeroPedido,
          @codigoCondiciones, @codigoTransportistaEnvios, @tipoPortesEnvios,
          @formaEnvio, @importeLiquido, @importeBruto, @baseImponible,
          @bultos, @pesoBruto, @pesoNeto, @volumen,
          @horaAlbaran
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

      await txRequest
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
        .input('serieAlbaran', sql.VarChar, serie || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, i + 1)
        .input('lineasPosicion', sql.UniqueIdentifier, linea.LineasPosicion || null)
        .input('codigoArticulo', sql.VarChar, linea.CodigoArticulo || '')
        .input('descripcionArticulo', sql.VarChar, linea.DescripcionArticulo || '')
        .input('descripcion2Articulo', sql.VarChar, linea.Descripcion2Articulo || '')
        .input('unidades', sql.Decimal(18,4), unidades)
        .input('unidadesServidas', sql.Decimal(18,4), unidades)
        .input('precio', sql.Decimal(18,4), precio)
        .input('codigoAlmacen', sql.VarChar, linea.CodigoAlmacen || '')
        .input('partida', sql.VarChar, linea.Partida || '')
        .input('unidadMedida1_', sql.VarChar, linea.UnidadMedida1_ || '')
        .input('unidadMedida2_', sql.VarChar, linea.UnidadMedida2_ || '')
        .input('factorConversion_', sql.Decimal(18,4), linea.FactorConversion_ || 1)
        .input('ejercicioPedido', sql.SmallInt, ejercicio)
        .input('seriePedido', sql.VarChar, serie || '')
        .input('numeroPedido', sql.Int, numeroPedido)
        .input('grupoIva', sql.TinyInt, linea.GrupoIva || 1)
        .input('porcentajeIva', sql.Decimal(18,4), ivaPorcentaje)
        .input('importeLiquido', sql.Decimal(18,4), importeBrutoLinea)
        .input('importeBruto', sql.Decimal(18,4), importeBrutoLinea)
        .input('baseImponible', sql.Decimal(18,4), baseIvaLinea)
        .input('baseIva', sql.Decimal(18,4), baseIvaLinea)
        .input('cuotaIva', sql.Decimal(18,4), cuotaIvaLinea)
        .input('pesoBrutoUnitario_', sql.Decimal(18,4), parseFloat(linea.PesoBrutoUnitario_) || 0)
        .input('pesoNetoUnitario_', sql.Decimal(18,4), parseFloat(linea.PesoNetoUnitario_) || 0)
        .input('volumenUnitario_', sql.Decimal(18,4), parseFloat(linea.VolumenUnitario_) || 0)
        .input('pesoBruto_', sql.Decimal(18,4), pesoBrutoLinea)
        .input('pesoNeto_', sql.Decimal(18,4), pesoNetoLinea)
        .input('volumen_', sql.Decimal(18,4), volumenLinea)
        .input('codigoFamilia', sql.VarChar, linea.CodigoFamilia || '')
        .input('codigoSubfamilia', sql.VarChar, linea.CodigoSubfamilia || '')
        .input('fechaRegistro', sql.DateTime, fechaActual)
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, LineasPosicion,
            CodigoArticulo, DescripcionArticulo, Descripcion2Articulo,
            Unidades, UnidadesServidas, Precio,
            CodigoAlmacen, Partida,
            UnidadMedida1_, UnidadMedida2_, FactorConversion_,
            EjercicioPedido, SeriePedido, NumeroPedido,
            GrupoIva, [%Iva],
            ImporteLiquido, ImporteBruto, BaseImponible, BaseIva, CuotaIva,
            PesoBrutoUnitario_, PesoNetoUnitario_, VolumenUnitario_,
            PesoBruto_, PesoNeto_, Volumen_,
            CodigoFamilia, CodigoSubfamilia,
            FechaRegistro
          ) VALUES (
            @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
            @orden, @lineasPosicion,
            @codigoArticulo, @descripcionArticulo, @descripcion2Articulo,
            @unidades, @unidadesServidas, @precio,
            @codigoAlmacen, @partida,
            @unidadMedida1_, @unidadMedida2_, @factorConversion_,
            @ejercicioPedido, @seriePedido, @numeroPedido,
            @grupoIva, @porcentajeIva,
            @importeLiquido, @importeBruto, @baseImponible, @baseIva, @cuotaIva,
            @pesoBrutoUnitario_, @pesoNetoUnitario_, @volumenUnitario_,
            @pesoBruto_, @pesoNeto_, @volumen_,
            @codigoFamilia, @codigoSubfamilia,
            @fechaRegistro
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
          CodigoCliente, RazonSocial, Domicilio, Municipio, 
          ImporteLiquido, EmpleadoAsignado, Telefono, Contacto,
          ObservacionesWeb, NombreObra, Vendedor, EsVoluminoso,
          Estado, StatusAprobado, FormaEnvio,
          CodigoCondiciones, CodigoTransportistaEnvios, TipoPortesEnvios,
          CodigoPostal, Provincia, CodigoNacion
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
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .query(`
        SELECT ISNULL(MAX(NumeroAlbaran), 0) + 1 AS SiguienteNumero
        FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
      `);

    const numeroAlbaran = nextAlbaran.recordset[0].SiguienteNumero;

    // 8. Insertar cabecera del albarán
    await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioAlbaran', sql.SmallInt, ejercicio)
      .input('serieAlbaran', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoCliente', sql.VarChar, (pedido.CodigoCliente ?? '').toString())
      .input('razonSocial', sql.VarChar, (pedido.RazonSocial ?? '').toString())
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
      .input('fechaAlbaran', sql.DateTime, fechaActual)
      .input('fechaCreacion', sql.DateTime, fechaActual)
      .input('fechaEntrega', sql.DateTime, fechaActual)
      .input('numeroLineas', sql.SmallInt, lineasConUnidadesNoFacturadas.length)
      .input('empleadoAsignado', sql.VarChar, (pedido.EmpleadoAsignado ?? usuario).toString())
      .input('telefono', sql.VarChar, (pedido.Telefono ?? '').toString())
      .input('telefonoEnvios', sql.VarChar, (pedido.Telefono ?? '').toString())
      .input('contacto', sql.VarChar, (pedido.Contacto ?? '').toString())
      .input('observacionesWeb', sql.Text, (pedido.ObservacionesWeb ?? '').toString())
      .input('nombreObra', sql.VarChar, (pedido.NombreObra ?? '').toString())
      .input('vendedor', sql.VarChar, (pedido.Vendedor ?? '').toString())
      .input('statusFacturado', sql.SmallInt, 0)
      .input('esVoluminoso', sql.Bit, pedido.EsVoluminoso || 0)
      .input('esParcial', sql.Bit, esAlbaranParcial ? 1 : 0)
      .input('ejercicioPedido', sql.SmallInt, ejercicio)
      .input('seriePedido', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('codigoCondiciones', sql.SmallInt, pedido.CodigoCondiciones || 0)
      .input('codigoTransportistaEnvios', sql.Int, pedido.CodigoTransportistaEnvios || 0)
      .input('tipoPortesEnvios', sql.VarChar, (pedido.TipoPortesEnvios ?? '').toString())
      .input('formaEnvio', sql.Int, pedido.FormaEnvio || 3)
      .input('importeLiquido', sql.Decimal(18,4), importeBruto)
      .input('importeBruto', sql.Decimal(18,4), importeBruto)
      .input('baseImponible', sql.Decimal(18,4), importeBruto)
      .input('bultos', sql.Int, bultos)
      .input('pesoBruto', sql.Decimal(18,4), pesoBruto)
      .input('pesoNeto', sql.Decimal(18,4), pesoNeto)
      .input('volumen', sql.Decimal(18,4), volumen)
      .input('horaAlbaran', sql.Decimal(6,2), parseFloat(`${fechaActual.getHours()}.${fechaActual.getMinutes()}`))
      .query(`
        INSERT INTO CabeceraAlbaranCliente (
          CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
          CodigoCliente, RazonSocial, RazonSocialEnvios,
          Domicilio, DomicilioEnvios, Municipio, MunicipioEnvios,
          Provincia, ProvinciaEnvios, CodigoPostal, CodigoPostalEnvios,
          CodigoNacion, CodigoNacionEnvios, Telefono, TelefonoEnvios,
          Contacto, FechaAlbaran, FechaCreacion, FechaEntrega,
          NumeroLineas, EmpleadoAsignado, ObservacionesWeb, NombreObra,
          Vendedor, StatusFacturado, EsVoluminoso, EsParcial,
          EjercicioPedido, SeriePedido, NumeroPedido,
          CodigoCondiciones, CodigoTransportistaEnvios, TipoPortesEnvios,
          FormaEnvio, ImporteLiquido, ImporteBruto, BaseImponible,
          Bultos, PesoBruto_, PesoNeto_, Volumen_,
          HoraAlbaran
        ) VALUES (
          @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
          @codigoCliente, @razonSocial, @razonSocialEnvios,
          @domicilio, @domicilioEnvios, @municipio, @municipioEnvios,
          @provincia, @provinciaEnvios, @codigoPostal, @codigoPostalEnvios,
          @codigoNacion, @codigoNacionEnvios, @telefono, @telefonoEnvios,
          @contacto, @fechaAlbaran, @fechaCreacion, @fechaEntrega,
          @numeroLineas, @empleadoAsignado, @observacionesWeb, @nombreObra,
          @vendedor, @statusFacturado, @esVoluminoso, @esParcial,
          @ejercicioPedido, @seriePedido, @numeroPedido,
          @codigoCondiciones, @codigoTransportistaEnvios, @tipoPortesEnvios,
          @formaEnvio, @importeLiquido, @importeBruto, @baseImponible,
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
        .input('ejercicioAlbaran', sql.SmallInt, ejercicio)
        .input('serieAlbaran', sql.VarChar, serie || '')
        .input('numeroAlbaran', sql.Int, numeroAlbaran)
        .input('orden', sql.SmallInt, index + 1)
        .input('lineasPosicion', sql.UniqueIdentifier, linea.LineasPosicion || null)
        .input('codigoArticulo', sql.VarChar, (linea.CodigoArticulo ?? '').toString())
        .input('descripcionArticulo', sql.VarChar, (linea.DescripcionArticulo ?? '').toString())
        .input('descripcion2Articulo', sql.VarChar, (linea.Descripcion2Articulo ?? '').toString())
        .input('unidades', sql.Decimal(18,4), unidadesNoFacturadas)
        .input('unidadesServidas', sql.Decimal(18,4), unidadesNoFacturadas)
        .input('precio', sql.Decimal(18,4), precio)
        .input('codigoAlmacen', sql.VarChar, (linea.CodigoAlmacen ?? '').toString())
        .input('partida', sql.VarChar, (linea.Partida ?? '').toString())
        .input('unidadMedida1_', sql.VarChar, (linea.UnidadMedida1_ ?? '').toString())
        .input('unidadMedida2_', sql.VarChar, (linea.UnidadMedida2_ ?? '').toString())
        .input('factorConversion_', sql.Decimal(18,4), linea.FactorConversion_ || 1)
        .input('ejercicioPedido', sql.SmallInt, ejercicio)
        .input('seriePedido', sql.VarChar, serie || '')
        .input('numeroPedido', sql.Int, numeroPedido)
        .input('grupoIva', sql.TinyInt, linea.GrupoIva || 1)
        .input('porcentajeIva', sql.Decimal(18,4), ivaPorcentaje)
        .input('importeLiquido', sql.Decimal(18,4), importeLiquidoLinea)
        .input('importeBruto', sql.Decimal(18,4), importeBrutoLinea)
        .input('baseImponible', sql.Decimal(18,4), baseIvaLinea)
        .input('baseIva', sql.Decimal(18,4), baseIvaLinea)
        .input('cuotaIva', sql.Decimal(18,4), cuotaIvaLinea)
        .input('pesoBrutoUnitario_', sql.Decimal(18,4), pesoBrutoUnit)
        .input('pesoNetoUnitario_', sql.Decimal(18,4), pesoNetoUnit)
        .input('volumenUnitario_', sql.Decimal(18,4), volumenUnit)
        .input('pesoBruto_', sql.Decimal(18,4), pesoBrutoLinea)
        .input('pesoNeto_', sql.Decimal(18,4), pesoNetoLinea)
        .input('volumen_', sql.Decimal(18,4), volumenLinea)
        .input('codigoFamilia', sql.VarChar, (linea.CodigoFamilia ?? '').toString())
        .input('codigoSubfamilia', sql.VarChar, (linea.CodigoSubfamilia ?? '').toString())
        .input('fechaRegistro', sql.DateTime, fechaActual)
        .query(`
          INSERT INTO LineasAlbaranCliente (
            CodigoEmpresa, EjercicioAlbaran, SerieAlbaran, NumeroAlbaran,
            Orden, LineasPosicion,
            CodigoArticulo, DescripcionArticulo, Descripcion2Articulo,
            Unidades, UnidadesServidas, Precio,
            CodigoAlmacen, Partida,
            UnidadMedida1_, UnidadMedida2_, FactorConversion_,
            EjercicioPedido, SeriePedido, NumeroPedido,
            GrupoIva, [%Iva],
            ImporteLiquido, ImporteBruto, BaseImponible, BaseIva, CuotaIva,
            PesoBrutoUnitario_, PesoNetoUnitario_, VolumenUnitario_,
            PesoBruto_, PesoNeto_, Volumen_,
            CodigoFamilia, CodigoSubfamilia,
            FechaRegistro
          ) VALUES (
            @codigoEmpresa, @ejercicioAlbaran, @serieAlbaran, @numeroAlbaran,
            @orden, @lineasPosicion,
            @codigoArticulo, @descripcionArticulo, @descripcion2Articulo,
            @unidades, @unidadesServidas, @precio,
            @codigoAlmacen, @partida,
            @unidadMedida1_, @unidadMedida2_, @factorConversion_,
            @ejercicioPedido, @seriePedido, @numeroPedido,
            @grupoIva, @porcentajeIva,
            @importeLiquido, @importeBruto, @baseImponible, @baseIva, @cuotaIva,
            @pesoBrutoUnitario_, @pesoNetoUnitario_, @volumenUnitario_,
            @pesoBruto_, @pesoNeto_, @volumen_,
            @codigoFamilia, @codigoSubfamilia,
            @fechaRegistro
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
          SET Estado = 4, Status = 'Parcial'
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
    } else {
      // Si no hay pendientes, marcar como completado (Estado 2 = Servido)
      await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, ejercicio)
        .input('serie', sql.VarChar, serie || '')
        .input('numeroPedido', sql.Int, numeroPedido)
        .query(`
          UPDATE CabeceraPedidoCliente
          SET Estado = 2, Status = 'Servido', FechaCompletado = GETDATE()
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioPedido = @ejercicio
            AND (SeriePedido = @serie OR (@serie = '' AND SeriePedido IS NULL))
            AND NumeroPedido = @numeroPedido
        `);
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
