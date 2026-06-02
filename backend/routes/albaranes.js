//albaranes.js — VERSIÓN CORREGIDA
// FIXES aplicados:
// 1. albaranesPendientes: muestra TODOS los albaranes StatusFacturado=0 con NumeroPedido
//    (generados por expedición) sin filtrar por FormaEnvio
// 2. asignarRepartoYGenerarAlbaran: busca Estado IN (1,2) para compatibilidad
//    con pedidosVenta que marca Estado=2
// 3. FormaEnvio se preserva del pedido original pero NO filtra la visibilidad

const express = require('express');

module.exports = function createalbaranesRouter({ sql, getPool }) {
  const router = express.Router();

  const MENSAJE_FIRMAS_OBLIGATORIAS = 'Debes registrar ambas firmas antes de completar el albarán';

  const tieneFirmaValida = (firma) => {
    return typeof firma === 'string'
      && firma.startsWith('data:image/png')
      && firma.length >= 1000;
  };

  const obtenerRangoFechas = (rango = 'mes') => {
    const hoy = new Date();
    const fechaInicio = new Date(hoy);
    const fechaFinExclusiva = new Date(hoy);

    if (rango === 'dia') {
      fechaInicio.setHours(0, 0, 0, 0);
      fechaFinExclusiva.setDate(hoy.getDate() + 1);
      fechaFinExclusiva.setHours(0, 0, 0, 0);
      return { fechaInicio, fechaFinExclusiva };
    }

    if (rango === 'semana') {
      fechaInicio.setDate(hoy.getDate() - 7);
    } else {
      fechaInicio.setDate(hoy.getDate() - 30);
    }

    fechaInicio.setHours(0, 0, 0, 0);
    fechaFinExclusiva.setDate(hoy.getDate() + 1);
    fechaFinExclusiva.setHours(0, 0, 0, 0);

    return { fechaInicio, fechaFinExclusiva };
  };

router.post('/asignarRepartoYGenerarAlbaran', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroPedido, codigoRepartidor } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroPedido || !codigoRepartidor) {
    return res.status(400).json({ 
      success: false, 
      mensaje: 'Faltan datos requeridos: empresa, ejercicio, pedido y repartidor.' 
    });
  }

  const transaction = new sql.Transaction(getPool());

  try {
    await transaction.begin();

    // 1. Verificar permisos
    const permisoResult = await getPool().request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador, StatusUsuarioAvanzado, StatusDesignarRutas
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario
          AND CodigoEmpresa = @codigoEmpresa
      `);
    
    if (permisoResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(403).json({ success: false, mensaje: 'Usuario no encontrado' });
    }

    const userPerms = permisoResult.recordset[0];
    const puedeAsignar =
      userPerms.StatusAdministrador === -1 ||
      userPerms.StatusUsuarioAvanzado === -1 ||
      userPerms.StatusDesignarRutas === -1;

    if (!puedeAsignar) {
      await transaction.rollback();
      return res.status(403).json({ success: false, mensaje: 'No tienes permiso para asignar repartos' });
    }

    // FIX 3: Estado IN (1,2) — pedidosVenta marca Estado=2, no Estado=1
    // Estado 1 = completado en sistema antiguo
    // Estado 2 = servido/completado en pedidosVenta.js
    const pedidoResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .query(`
        SELECT 
          p.CodigoCliente, p.RazonSocial, p.Domicilio, p.Municipio, 
          p.CodigoPostal, p.Provincia, p.CodigoNacion,
          p.NumeroLineas, p.ImporteLiquido, p.NombreObra,
          p.Contacto, p.Telefono, p.EsVoluminoso, p.Vendedor,
          p.CodigoCondiciones, p.CodigoTransportistaEnvios, p.TipoPortesEnvios,
          p.FormaEnvio, p.Estado,
          (SELECT COUNT(*) FROM LineasPedidoCliente l 
           WHERE l.CodigoEmpresa = p.CodigoEmpresa
             AND l.EjercicioPedido = p.EjercicioPedido
             AND l.SeriePedido = p.SeriePedido
             AND l.NumeroPedido = p.NumeroPedido
             AND l.UnidadesPendientes > 0) AS LineasPendientes
        FROM CabeceraPedidoCliente p
        WHERE p.CodigoEmpresa = @codigoEmpresa
          AND p.EjercicioPedido = @ejercicio
          AND (p.SeriePedido = @serie OR (@serie = '' AND p.SeriePedido IS NULL))
          AND p.NumeroPedido = @numeroPedido
          AND p.Estado IN (1, 2)
      `);

    if (pedidoResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        mensaje: 'Pedido no encontrado o no está completado/servido (Estado debe ser 1 o 2)' 
      });
    }

    const pedido = pedidoResult.recordset[0];
    const tieneLineasPendientes = pedido.LineasPendientes > 0;
    const esAlbaranParcial = tieneLineasPendientes;
    const fechaActual = new Date();
    const ejercicioAlbaran = fechaActual.getFullYear();

    // 3. Generar número de albarán
    const nextAlbaran = await getPool().request()
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

    // 4. Calcular totales del albarán
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
          lpc.UnidadesPedidas,
          lpc.UnidadesPendientes,
          lpc.UnidadesServidas,
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
          AND (lpc.UnidadesServidas > 0 OR lpc.UnidadesPendientes > 0)
      `);

    if (lineasResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ success: false, mensaje: 'No hay líneas para generar albarán' });
    }

    let totalUnidades = 0;
    let importeBruto = 0;
    let pesoBruto = 0;
    let pesoNeto = 0;
    let volumen = 0;
    let bultos = 0;

    lineasResult.recordset.forEach(linea => {
      const unidades = linea.UnidadesServidas > 0 ? linea.UnidadesServidas : linea.UnidadesPedidas;
      const unidadesNum = parseFloat(unidades) || 0;
      const precio = parseFloat(linea.Precio) || 0;
      const pesoBrutoUnit = parseFloat(linea.PesoBrutoUnitario_) || 0;
      const pesoNetoUnit = parseFloat(linea.PesoNetoUnitario_) || 0;
      const volumenUnit = parseFloat(linea.VolumenUnitario_) || 0;

      totalUnidades += unidadesNum;
      importeBruto += unidadesNum * precio;
      pesoBruto += unidadesNum * pesoBrutoUnit;
      pesoNeto += unidadesNum * pesoNetoUnit;
      volumen += unidadesNum * volumenUnit;
      bultos += Math.max(1, Math.ceil(Math.max(unidadesNum / 10, (unidadesNum * pesoBrutoUnit) / 50)));
    });

    // 5. Insertar cabecera del albarán
    await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicioAlbaran', sql.SmallInt, ejercicioAlbaran)
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
      .input('numeroLineas', sql.SmallInt, lineasResult.recordset.length)
      .input('empleadoAsignado', sql.VarChar, codigoRepartidor)
      .input('telefono', sql.VarChar, (pedido.Telefono ?? '').toString())
      .input('telefonoEnvios', sql.VarChar, (pedido.Telefono ?? '').toString())
      .input('contacto', sql.VarChar, (pedido.Contacto ?? '').toString())
      .input('observacionesWeb', sql.Text, 'Generado automáticamente al asignar reparto')
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

    // 6. Insertar líneas del albarán
    for (const [index, linea] of lineasResult.recordset.entries()) {
      const unidades = linea.UnidadesServidas > 0 ? linea.UnidadesServidas : linea.UnidadesPedidas;
      const unidadesNum = parseFloat(unidades) || 0;
      const precio = parseFloat(linea.Precio) || 0;
      const importeBrutoLinea = unidadesNum * precio;
      const importeLiquidoLinea = importeBrutoLinea;
      const pesoBrutoUnit = parseFloat(linea.PesoBrutoUnitario_) || 0;
      const pesoNetoUnit = parseFloat(linea.PesoNetoUnitario_) || 0;
      const volumenUnit = parseFloat(linea.VolumenUnitario_) || 0;
      const pesoBrutoLinea = unidadesNum * pesoBrutoUnit;
      const pesoNetoLinea = unidadesNum * pesoNetoUnit;
      const volumenLinea = unidadesNum * volumenUnit;
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
        .input('unidades', sql.Decimal(18,4), unidadesNum)
        .input('unidadesServidas', sql.Decimal(18,4), unidadesNum)
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

    // 7. Actualizar estado del pedido (usa actualizarStatusSiExiste para compatibilidad)
    if (esAlbaranParcial) {
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
    } else {
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
    }

    await transaction.commit();

    res.json({ 
      success: true,
      mensaje: esAlbaranParcial ? 'Albarán parcial generado y asignado correctamente' : 'Albarán completo generado y asignado correctamente',
      albaran: {
        ejercicio: ejercicioAlbaran,
        serie: serie || '',
        numero: numeroAlbaran,
        esParcial: esAlbaranParcial,
        repartidor: codigoRepartidor,
        lineasProcesadas: lineasResult.recordset.length,
        statusPedido: esAlbaranParcial ? 'Parcial' : 'Servido'
      }
    });
  } catch (err) {
    await transaction.rollback();
    console.error('[ERROR ASIGNAR REPARTO Y GENERAR ALBARAN]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al asignar reparto y generar albarán',
      error: err.message,
      stack: err.stack
    });
  }
});

// ✅ ENDPOINT PARA EXPEDICIÓN OPTIMIZADA
router.post('/expedir-articulo', async (req, res) => {
  const { 
    codigoEmpresa, ejercicio, serie, numeroPedido, 
    codigoArticulo, cantidad, almacen, ubicacion, partida, unidadMedida 
  } = req.body;

  try {
    const transaction = new sql.Transaction(getPool());
    await transaction.begin();

    await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .input('cantidad', sql.Decimal(18,4), cantidad)
      .query(`
        UPDATE LineasPedidoCliente
        SET UnidadesServidas = ISNULL(UnidadesServidas, 0) + @cantidad,
            UnidadesPendientes = UnidadesPedidas - (ISNULL(UnidadesServidas, 0) + @cantidad)
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND SeriePedido = @serie
          AND NumeroPedido = @numeroPedido
          AND CodigoArticulo = @codigoArticulo
      `);

    const lineaActualizada = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroPedido', sql.Int, numeroPedido)
      .input('codigoArticulo', sql.VarChar, codigoArticulo)
      .query(`
        SELECT UnidadesPendientes, UnidadesServidas
        FROM LineasPedidoCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioPedido = @ejercicio
          AND SeriePedido = @serie
          AND NumeroPedido = @numeroPedido
          AND CodigoArticulo = @codigoArticulo
      `);

    await transaction.commit();

    res.json({
      success: true,
      nuevoPendiente: lineaActualizada.recordset[0]?.UnidadesPendientes || 0,
      totalServido: lineaActualizada.recordset[0]?.UnidadesServidas || 0
    });

  } catch (error) {
    console.error('[ERROR EXPEDIR ARTICULO]', error);
    res.status(500).json({ success: false, mensaje: 'Error al expedir artículo', error: error.message });
  }
});

// ✅ ALBARANES PENDIENTES
// FIX 1: Eliminar filtro FormaEnvio — mostrar TODOS los albaranes StatusFacturado=0
// que tengan NumeroPedido (generados desde expedición) independientemente del medio de envío
router.get('/api/albaranesPendientes', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  const rango = req.query.rango || 'mes';
  
  try {
    const { fechaInicio, fechaFinExclusiva } = obtenerRangoFechas(rango);

    // FIX PERMISOS: determinar si el usuario puede ver todos los albaranes
    const user = req.user;
    const isSuperUser = user.StatusAdministrador === -1 || user.StatusUsuarioAvanzado === -1;
    const puedeVerTodos = isSuperUser || user.StatusVerAlbaranesAsignados === -1;

    // Si es trabajador normal (StatusDesignarRutas), solo ve sus albaranes asignados
    const filtrarPorUsuario = !puedeVerTodos;
    const codigoUsuario = user.CodigoCliente || user.UsuarioLogicNet;

    if (filtrarPorUsuario) {
      console.log(`[ALBARANES] Usuario sin permiso total — filtrando por EmpleadoAsignado: ${codigoUsuario}`);
    }

    // FIX: sin filtro FormaEnvio — mostrar TODOS los albaranes StatusFacturado=0
    const queryCabeceras = `
      SELECT 
        cac.NumeroAlbaran, 
        cac.SerieAlbaran, 
        cac.EjercicioAlbaran,
        cac.CodigoEmpresa,
        cac.FechaAlbaran, 
        cac.CodigoCliente, 
        cac.RazonSocial, 
        cac.Domicilio, 
        cac.Municipio, 
        cac.ImporteLiquido,
        cac.StatusFacturado,
        cac.EmpleadoAsignado,
        cac.NombreObra,
        cac.Contacto,
        cac.Telefono AS TelefonoContacto,
        cac.FormaEnvio,
        cac.EsVoluminoso,
        cac.EsParcial,
        ISNULL(cac.FirmaCliente, '') AS FirmaCliente,
        ISNULL(cac.FirmaRepartidor, '') AS FirmaRepartidor,
        cac.EjercicioPedido,
        cac.SeriePedido,
        cac.NumeroPedido,
        cpc.Estado AS EstadoPedido,
        cpc.StatusAprobado,
        CASE 
          WHEN cpc.Estado = 2 AND cpc.StatusAprobado = -1 THEN 'Servido'
          WHEN cpc.Estado = 4 THEN 'Parcial'
          WHEN cpc.Estado = 0 AND cpc.StatusAprobado = -1 THEN 'Preparando'
          WHEN cpc.Estado = 0 AND cpc.StatusAprobado = 0 THEN 'Revision'
          ELSE 'Desconocido'
        END AS StatusPedido,
        cpc.EsVoluminoso AS EsVoluminosoPedido
      FROM CabeceraAlbaranCliente cac
      LEFT JOIN CabeceraPedidoCliente cpc ON 
        cac.CodigoEmpresa = cpc.CodigoEmpresa 
        AND cac.EjercicioPedido = cpc.EjercicioPedido
        AND (cac.SeriePedido = cpc.SeriePedido OR (cac.SeriePedido IS NULL AND cpc.SeriePedido IS NULL))
        AND cac.NumeroPedido = cpc.NumeroPedido
      WHERE cac.CodigoEmpresa = @codigoEmpresa
        AND cac.StatusFacturado = 0
        AND cac.NumeroPedido IS NOT NULL
        AND cac.FechaAlbaran >= @fechaInicio
        AND cac.FechaAlbaran < @fechaFinExclusiva
        ${filtrarPorUsuario ? 'AND cac.EmpleadoAsignado = @codigoUsuario' : ''}
      ORDER BY cac.FechaAlbaran DESC
    `;
    
    const requestCabeceras = getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('fechaInicio', sql.DateTime, fechaInicio)
      .input('fechaFinExclusiva', sql.DateTime, fechaFinExclusiva);

    if (filtrarPorUsuario) {
      requestCabeceras.input('codigoUsuario', sql.VarChar, codigoUsuario);
    }

    const cabeceras = await requestCabeceras.query(queryCabeceras);
    
    const albaranesConLineas = await Promise.all(cabeceras.recordset.map(async (cabecera) => {
      const lineas = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, cabecera.CodigoEmpresa)
        .input('ejercicio', sql.SmallInt, cabecera.EjercicioAlbaran)
        .input('serie', sql.VarChar, cabecera.SerieAlbaran || '')
        .input('numeroAlbaran', sql.Int, cabecera.NumeroAlbaran)
        .query(`
          SELECT 
            Orden AS orden,
            CodigoArticulo AS codigo,
            DescripcionArticulo AS nombre,
            Unidades AS cantidad,
            UnidadesServidas AS cantidadEntregada
          FROM LineasAlbaranCliente
          WHERE CodigoEmpresa = @codigoEmpresa
            AND EjercicioAlbaran = @ejercicio
            AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
            AND NumeroAlbaran = @numeroAlbaran
        `);
      
      return {
        id: `${cabecera.EjercicioAlbaran}-${cabecera.SerieAlbaran || ''}-${cabecera.NumeroAlbaran}`,
        ejercicio: cabecera.EjercicioAlbaran,
        serie: cabecera.SerieAlbaran || '',
        numero: cabecera.NumeroAlbaran,
        codigoEmpresa: cabecera.CodigoEmpresa,
        albaran: `${cabecera.SerieAlbaran || ''}${cabecera.SerieAlbaran ? '-' : ''}${cabecera.NumeroAlbaran}`,
        cliente: cabecera.RazonSocial,
        direccion: `${cabecera.Domicilio || ''}, ${cabecera.Municipio || ''}`.trim().replace(/^,\s*/, ''),
        municipio: cabecera.Municipio,
        FechaAlbaran: cabecera.FechaAlbaran,
        importeLiquido: cabecera.ImporteLiquido,
        empleadoAsignado: cabecera.EmpleadoAsignado,
        nombreObra: cabecera.NombreObra,
        obra: cabecera.NombreObra,
        contacto: cabecera.Contacto,
        telefonoContacto: cabecera.TelefonoContacto,
        formaentrega: cabecera.FormaEnvio,
        esParcial: cabecera.EsParcial,
        EsVoluminoso: cabecera.EsVoluminoso,
        tieneFirmaCliente: cabecera.FirmaCliente && cabecera.FirmaCliente.length > 10,
        tieneFirmaRepartidor: cabecera.FirmaRepartidor && cabecera.FirmaRepartidor.length > 10,
        NumeroPedido: cabecera.NumeroPedido,
        EstadoPedido: cabecera.EstadoPedido,
        StatusPedido: cabecera.StatusPedido,
        EsVoluminosoPedido: cabecera.EsVoluminosoPedido,
        articulos: lineas.recordset.map(art => ({
          ...art,
          cantidadOriginal: art.cantidad,
          cantidadEntregada: art.cantidadEntregada || art.cantidad
        }))
      };
    }));
    
    res.json(albaranesConLineas);
    
  } catch (err) {
    console.error('[ERROR OBTENER ALBARANES PENDIENTES]', err);
    res.status(500).json({ 
      success: false, 
      mensaje: 'Error al obtener albaranes pendientes',
      error: err.message 
    });
  }
});

// ✅ PEDIDOS PREPARADOS (Estado IN (1,2) para compatibilidad)
router.get('/pedidos-preparados', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const codigoEmpresa = req.user.CodigoEmpresa;
  const dias = req.query.dias ? parseInt(req.query.dias) : 30;

  try {
    const result = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('dias', sql.Int, dias)
      .query(`
        SELECT 
          p.NumeroPedido,
          p.EjercicioPedido,
          p.SeriePedido,
          p.RazonSocial,
          p.Domicilio,
          p.Municipio,
          p.NombreObra,
          p.FechaPedido,
          p.Contacto,
          p.Telefono AS TelefonoContacto,
          p.CodigoEmpresa,
          p.Estado,
          -- FIX: incluir los que NO tienen albarán todavía (para que aparezcan en asignación)
          (SELECT COUNT(*) FROM CabeceraAlbaranCliente cac
           WHERE cac.CodigoEmpresa = p.CodigoEmpresa
             AND cac.EjercicioPedido = p.EjercicioPedido
             AND cac.NumeroPedido = p.NumeroPedido
             AND cac.StatusFacturado = 0) AS AlbaranesPendientes
        FROM CabeceraPedidoCliente p
        WHERE p.CodigoEmpresa = @codigoEmpresa
          AND p.Estado IN (1, 2)
          AND p.FechaPedido >= DATEADD(DAY, -@dias, GETDATE())
        ORDER BY p.FechaPedido DESC
      `);
      
    res.json(result.recordset);
  } catch (err) {
    console.error('[ERROR PEDIDOS PREPARADOS]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener pedidos preparados', error: err.message });
  }
});

// ✅ COMPLETAR ALBARÁN CON FIRMAS
const completarAlbaranHandler = async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroAlbaran, firmaCliente, firmaRepartidor, observaciones } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroAlbaran) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos requeridos.' });
  }

  if (!tieneFirmaValida(firmaCliente) || !tieneFirmaValida(firmaRepartidor)) {
    return res.status(400).json({ success: false, mensaje: MENSAJE_FIRMAS_OBLIGATORIAS });
  }

  try {
    const permisoResult = await getPool().request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador, StatusUsuarioAvanzado
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario AND CodigoEmpresa = @codigoEmpresa
      `);

    if (permisoResult.recordset.length === 0) {
      return res.status(403).json({ success: false, mensaje: 'Usuario no encontrado' });
    }

    const userPerms = permisoResult.recordset[0];
    const esAdmin = userPerms.StatusAdministrador === -1;
    const esUsuarioAvanzado = userPerms.StatusUsuarioAvanzado === -1;
    
    const albaranResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .query(`
        SELECT EmpleadoAsignado, StatusFacturado
        FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    if (albaranResult.recordset.length === 0) {
      return res.status(404).json({ success: false, mensaje: 'Albarán no encontrado' });
    }

    const albaran = albaranResult.recordset[0];

    if (albaran.StatusFacturado === -1) {
      return res.status(400).json({ success: false, mensaje: 'El albarán ya está completado' });
    }

    if (!esAdmin && !esUsuarioAvanzado && albaran.EmpleadoAsignado !== usuario) {
      return res.status(403).json({ success: false, mensaje: 'No tienes permiso para completar este albarán' });
    }

    await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('firmaCliente', sql.Text, firmaCliente)
      .input('firmaRepartidor', sql.Text, firmaRepartidor)
      .input('observaciones', sql.VarChar, observaciones || '')
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET StatusFacturado = -1,
            FirmaCliente = @firmaCliente,
            FirmaRepartidor = @firmaRepartidor,
            ObservacionesAlbaran = COALESCE(ObservacionesAlbaran, '') + 
              CASE WHEN @observaciones != '' THEN 
                CHAR(13) + CHAR(10) + 'Observaciones entrega: ' + @observaciones 
              ELSE '' END,
            FechaEntrega = GETDATE()
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    res.json({ success: true, mensaje: 'Albarán marcado como entregado correctamente' });
  } catch (err) {
    console.error('[ERROR COMPLETAR ALBARÁN]', err);
    res.status(500).json({ success: false, mensaje: 'Error al completar albarán', error: err.message });
  }
};

router.post('/completar-albaran', completarAlbaranHandler);
router.post('/api/completar-albaran', completarAlbaranHandler);

// ✅ ACTUALIZAR CANTIDADES DE ALBARÁN
router.put('/actualizarCantidadesAlbaran', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroAlbaran, lineas, observaciones } = req.body;

  if (!codigoEmpresa || !ejercicio || !numeroAlbaran || !lineas || !Array.isArray(lineas)) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos requeridos.' });
  }

  try {
    const transaction = new sql.Transaction(getPool());
    await transaction.begin();

    try {
      for (const linea of lineas) {
        const { orden, unidades } = linea;
        const request = new sql.Request(transaction);
        await request
          .input('unidades', sql.Decimal(18, 4), unidades)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.SmallInt, ejercicio)
          .input('serie', sql.VarChar, serie || '')
          .input('numeroAlbaran', sql.Int, numeroAlbaran)
          .input('orden', sql.SmallInt, orden)
          .query(`
            UPDATE LineasAlbaranCliente
            SET Unidades = @unidades
            WHERE CodigoEmpresa = @codigoEmpresa
              AND EjercicioAlbaran = @ejercicio
              AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
              AND NumeroAlbaran = @numeroAlbaran
              AND Orden = @orden
          `);
      }

      if (observaciones && observaciones.trim() !== '') {
        const requestObs = new sql.Request(transaction);
        await requestObs
          .input('observaciones', sql.VarChar, observaciones)
          .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
          .input('ejercicio', sql.SmallInt, ejercicio)
          .input('serie', sql.VarChar, serie || '')
          .input('numeroAlbaran', sql.Int, numeroAlbaran)
          .query(`
            UPDATE CabeceraAlbaranCliente
            SET ObservacionesAlbaran = 
                COALESCE(ObservacionesAlbaran, '') + CHAR(13) + CHAR(10) + @observaciones
            WHERE CodigoEmpresa = @codigoEmpresa
              AND EjercicioAlbaran = @ejercicio
              AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
              AND NumeroAlbaran = @numeroAlbaran
          `);
      }

      await transaction.commit();
      res.json({ success: true, mensaje: 'Cantidades actualizadas correctamente' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('[ERROR ACTUALIZAR CANTIDADES ALBARAN]', err);
    res.status(500).json({ success: false, mensaje: 'Error al actualizar cantidades', error: err.message });
  }
});

// ✅ COMPLETAR ALBARÁN CON FIRMAS (alias)
router.post('/completarAlbaranConFirmas', completarAlbaranHandler);

// ✅ ALBARANES COMPLETADOS
// FIX: también sin filtro FormaEnvio para mostrar todos los entregados
router.get('/albaranesCompletados', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }
  
  const codigoEmpresa = req.user.CodigoEmpresa;
  const rango = req.query.rango || 'mes';
  
  try {
    const { fechaInicio, fechaFinExclusiva } = obtenerRangoFechas(rango);
    const query = `
      SELECT 
        cac.NumeroAlbaran, 
        cac.SerieAlbaran, 
        cac.EjercicioAlbaran,
        cac.CodigoEmpresa,
        cac.FechaAlbaran, 
        cac.CodigoCliente, 
        cac.RazonSocial, 
        cac.Domicilio, 
        cac.Municipio, 
        cac.ImporteLiquido,
        cac.StatusFacturado,
        cac.EmpleadoAsignado,
        cac.NombreObra,
        cac.Contacto,
        cac.Telefono AS TelefonoContacto,
        cac.FormaEnvio,
        cac.EsVoluminoso,
        cac.EsParcial,
        cac.ObservacionesAlbaran,
        ISNULL(cac.FirmaCliente, '') as FirmaCliente,
        ISNULL(cac.FirmaRepartidor, '') as FirmaRepartidor
      FROM CabeceraAlbaranCliente cac
      WHERE cac.CodigoEmpresa = @codigoEmpresa
        AND cac.StatusFacturado = -1
        AND cac.NumeroPedido IS NOT NULL
        AND cac.FechaAlbaran >= @fechaInicio
        AND cac.FechaAlbaran < @fechaFinExclusiva
      ORDER BY cac.FechaAlbaran DESC
    `;
    
    const cabeceras = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('fechaInicio', sql.DateTime, fechaInicio)
      .input('fechaFinExclusiva', sql.DateTime, fechaFinExclusiva)
      .query(query);

    const albaranesConLineas = await Promise.all(cabeceras.recordset.map(async (cabecera) => {
      const lineas = await getPool().request()
        .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
        .input('ejercicio', sql.SmallInt, cabecera.EjercicioAlbaran)
        .input('serie', sql.VarChar, cabecera.SerieAlbaran || '')
        .input('numeroAlbaran', sql.Int, cabecera.NumeroAlbaran)
        .query(`
          SELECT 
            lac.Orden AS orden,
            lac.CodigoArticulo AS codigo,
            lac.DescripcionArticulo AS nombre,
            lac.Unidades AS cantidad
          FROM LineasAlbaranCliente lac
          WHERE lac.CodigoEmpresa = @codigoEmpresa
            AND lac.EjercicioAlbaran = @ejercicio
            AND (lac.SerieAlbaran = @serie OR (@serie = '' AND lac.SerieAlbaran IS NULL))
            AND lac.NumeroAlbaran = @numeroAlbaran
        `);

      return {
        id: `${cabecera.EjercicioAlbaran}-${cabecera.SerieAlbaran || ''}-${cabecera.NumeroAlbaran}`,
        ejercicio: cabecera.EjercicioAlbaran,
        serie: cabecera.SerieAlbaran || '',
        numero: cabecera.NumeroAlbaran,
        codigoEmpresa: cabecera.CodigoEmpresa,
        albaran: `${cabecera.SerieAlbaran || ''}${cabecera.SerieAlbaran ? '-' : ''}${cabecera.NumeroAlbaran}`,
        cliente: cabecera.RazonSocial,
        direccion: `${cabecera.Domicilio || ''}, ${cabecera.Municipio || ''}`.trim().replace(/^,\s*/, ''),
        FechaAlbaran: cabecera.FechaAlbaran,
        importeLiquido: cabecera.ImporteLiquido,
        empleadoAsignado: cabecera.EmpleadoAsignado,
        nombreObra: cabecera.NombreObra,
        contacto: cabecera.Contacto,
        telefonoContacto: cabecera.TelefonoContacto,
        FormaEnvio: cabecera.FormaEnvio,
        EsVoluminoso: cabecera.EsVoluminoso,
        esParcial: cabecera.EsParcial,
        tieneFirmaCliente: cabecera.FirmaCliente && cabecera.FirmaCliente.length > 10,
        tieneFirmaRepartidor: cabecera.FirmaRepartidor && cabecera.FirmaRepartidor.length > 10,
        firmaCliente: cabecera.FirmaCliente,
        firmaRepartidor: cabecera.FirmaRepartidor,
        observaciones: cabecera.ObservacionesAlbaran,
        articulos: lineas.recordset
      };
    }));

    res.json(albaranesConLineas);
  } catch (err) {
    console.error('[ERROR OBTENER ALBARANES COMPLETADOS]', err);
    res.status(500).json({ success: false, mensaje: 'Error al obtener albaranes completados', error: err.message });
  }
});

// ✅ REVERTIR ALBARÁN COMPLETADO
router.post('/revertirAlbaran', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroAlbaran } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroAlbaran) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos requeridos.' });
  }

  try {
    const permisoResult = await getPool().request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador FROM Clientes
        WHERE UsuarioLogicNet = @usuario AND CodigoEmpresa = @codigoEmpresa
      `);

    if (permisoResult.recordset.length === 0 || permisoResult.recordset[0].StatusAdministrador !== -1) {
      return res.status(403).json({ success: false, mensaje: 'Solo los administradores pueden revertir albaranes' });
    }

    const albaranResult = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .query(`
        SELECT StatusFacturado FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    if (albaranResult.recordset.length === 0) {
      return res.status(404).json({ success: false, mensaje: 'Albarán no encontrado' });
    }

    if (albaranResult.recordset[0].StatusFacturado !== -1) {
      return res.status(400).json({ success: false, mensaje: 'El albarán no está completado' });
    }

    await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET StatusFacturado = 0, FechaEntrega = NULL
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    res.json({ success: true, mensaje: 'Albarán revertido correctamente' });
  } catch (err) {
    console.error('[ERROR REVERTIR ALBARÁN]', err);
    res.status(500).json({ success: false, mensaje: 'Error al revertir albarán', error: err.message });
  }
});

// ✅ ASIGNAR REPARTIDOR A ALBARÁN EXISTENTE
// Endpoint que llama DesignarRutasScreen al guardar asignaciones
router.post('/asignarAlbaranExistente', async (req, res) => {
  if (!req.user || !req.user.CodigoEmpresa) {
    return res.status(401).json({ success: false, mensaje: 'No autorizado' });
  }

  const { codigoEmpresa, ejercicio, serie, numeroAlbaran, codigoRepartidor } = req.body;
  const usuario = req.user.UsuarioLogicNet;

  if (!codigoEmpresa || !ejercicio || !numeroAlbaran || !codigoRepartidor) {
    return res.status(400).json({
      success: false,
      mensaje: 'Faltan datos: empresa, ejercicio, número de albarán y repartidor.'
    });
  }

  try {
    // Verificar permisos
    const permisoResult = await getPool().request()
      .input('usuario', sql.VarChar, usuario)
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .query(`
        SELECT StatusAdministrador, StatusUsuarioAvanzado, StatusDesignarRutas
        FROM Clientes
        WHERE UsuarioLogicNet = @usuario AND CodigoEmpresa = @codigoEmpresa
      `);

    if (permisoResult.recordset.length === 0) {
      return res.status(403).json({ success: false, mensaje: 'Usuario no encontrado' });
    }

    const p = permisoResult.recordset[0];
    const puedeAsignar =
      p.StatusAdministrador === -1 ||
      p.StatusUsuarioAvanzado === -1 ||
      p.StatusDesignarRutas === -1;

    if (!puedeAsignar) {
      return res.status(403).json({ success: false, mensaje: 'Sin permiso para asignar repartos' });
    }

    // Verificar que el albarán existe y está pendiente
    const albaranCheck = await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .query(`
        SELECT NumeroAlbaran, StatusFacturado
        FROM CabeceraAlbaranCliente
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    if (albaranCheck.recordset.length === 0) {
      return res.status(404).json({ success: false, mensaje: 'Albarán no encontrado' });
    }

    if (albaranCheck.recordset[0].StatusFacturado === -1) {
      return res.status(400).json({ success: false, mensaje: 'El albarán ya está completado y no se puede reasignar' });
    }

    // Actualizar repartidor asignado
    await getPool().request()
      .input('codigoEmpresa', sql.SmallInt, codigoEmpresa)
      .input('ejercicio', sql.SmallInt, ejercicio)
      .input('serie', sql.VarChar, serie || '')
      .input('numeroAlbaran', sql.Int, numeroAlbaran)
      .input('codigoRepartidor', sql.VarChar, codigoRepartidor)
      .query(`
        UPDATE CabeceraAlbaranCliente
        SET EmpleadoAsignado = @codigoRepartidor
        WHERE CodigoEmpresa = @codigoEmpresa
          AND EjercicioAlbaran = @ejercicio
          AND (SerieAlbaran = @serie OR (@serie = '' AND SerieAlbaran IS NULL))
          AND NumeroAlbaran = @numeroAlbaran
      `);

    res.json({
      success: true,
      mensaje: `Repartidor asignado correctamente al albarán ${numeroAlbaran}`
    });
  } catch (err) {
    console.error('[ERROR ASIGNAR ALBARAN EXISTENTE]', err);
    res.status(500).json({
      success: false,
      mensaje: 'Error al asignar repartidor',
      error: err.message
    });
  }
});

// ============================================
// ✅ 8. ASIGNAR ALBARANES SCREEN
// ============================================

  return router;
};