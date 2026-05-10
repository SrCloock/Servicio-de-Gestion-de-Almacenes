// hooks.js
import { useCallback, useRef, useState } from 'react';
import API from '../../helpers/api';
import {
  ALMACEN_RECEPCION_FIJO,
  UBICACION_RECEPCION_FIJA,
  getApiErrorMessage,
  agruparPedidosPorProveedor
} from './utils';

// ==================== usePedidosCompra ====================
export const usePedidosCompra = (user) => {
  const [pedidos, setPedidos] = useState([]);
  const [pedidosAgrupados, setPedidosAgrupados] = useState({});
  const [detallesPedidos, setDetallesPedidos] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  });
  const [filtros, setFiltros] = useState({
    proveedor: '',
    fechaDesde: '',
    fechaHasta: '',
    numeroPedido: ''
  });

  const cargarPedidosRef = useRef(false);

  const cargarPedidos = useCallback(async (pagina = 1, usarFiltros = false) => {
    if (cargarPedidosRef.current) return;
    cargarPedidosRef.current = true;

    if (!user.CodigoEmpresa) {
      setError('No se ha configurado la empresa del usuario');
      cargarPedidosRef.current = false;
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let url = '/pedidos-compra';
      const params = new URLSearchParams({
        page: pagina,
        limit: pagination.limit
      });

      if (usarFiltros && (filtros.proveedor || filtros.fechaDesde || filtros.fechaHasta || filtros.numeroPedido)) {
        url = '/pedidos-compra/buscar';
        if (filtros.proveedor) params.append('proveedor', filtros.proveedor);
        if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
        if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
        if (filtros.numeroPedido) params.append('numeroPedido', filtros.numeroPedido);
        params.append('estado', '0');
      }

      const { data } = await API.get(url, {
        params: Object.fromEntries(params.entries())
      });

      if (data.success) {
        setPedidos(data.pedidos);
        setPagination(data.pagination);
        const agrupados = agruparPedidosPorProveedor(data.pedidos);
        setPedidosAgrupados(agrupados);
      } else {
        throw new Error(data.mensaje || 'Error desconocido');
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Error al cargar pedidos'));
    } finally {
      setLoading(false);
      setTimeout(() => {
        cargarPedidosRef.current = false;
      }, 1000);
    }
  }, [user, pagination.limit, filtros]);

  const cargarDetallesPedido = useCallback(async (ejercicio, serie, numero, forzarRecarga = false) => {
    const clave = `${ejercicio}_${serie || '0'}_${numero}`;
    if (detallesPedidos[clave] && !forzarRecarga) {
      return detallesPedidos[clave];
    }

    setLoading(true);
    try {
      const serieParam = serie || '0';
      const { data } = await API.get(`/pedidos-compra/${ejercicio}/${serieParam}/${numero}/detalle`);
      if (data.success) {
        setDetallesPedidos(prev => ({
          ...prev,
          [clave]: data
        }));
        return data;
      }
    } catch (err) {
      setError(`Error cargando detalles: ${getApiErrorMessage(err, 'Error al cargar detalles del pedido')}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [detallesPedidos]);

  const actualizarDetallesPedido = useCallback((clave, nuevosDetalles) => {
    setDetallesPedidos(prev => ({
      ...prev,
      [clave]: nuevosDetalles
    }));
  }, []);

  return {
    pedidos,
    pedidosAgrupados,
    detallesPedidos,
    setDetallesPedidos: actualizarDetallesPedido,
    loading,
    error,
    setError,
    success,
    setSuccess,
    pagination,
    setPagination,
    filtros,
    setFiltros,
    cargarPedidos,
    cargarDetallesPedido
  };
};

// ==================== useRecepcionModal ====================
export const useRecepcionModal = ({
  user,
  cargarDetallesPedido,
  cargarPedidos,
  pagination,
  setError,
  setSuccess
}) => {
  const [modalRecepcion, setModalRecepcion] = useState(false);
  const [lineaARecepcionar, setLineaARecepcionar] = useState(null);
  const [almacenes, setAlmacenes] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [selectedAlmacen, setSelectedAlmacen] = useState('');
  const [selectedUbicacion, setSelectedUbicacion] = useState('');
  const [unidadesARecepcionar, setUnidadesARecepcionar] = useState('');
  const [variantesDistribucion, setVariantesDistribucion] = useState([]);
  const [loadingVariantes, setLoadingVariantes] = useState(false);
  const [loadingRecepcion, setLoadingRecepcion] = useState(false);

  const cargarVariantesArticulo = async (codigoArticulo) => {
    setLoadingVariantes(true);
    try {
      const { data } = await API.get(`/articulos/${encodeURIComponent(codigoArticulo)}/variantes`);
      if (data.success) {
        if (data.combinaciones && data.combinaciones.length > 0) {
          const distribucion = data.combinaciones.map(comb => ({
            codigoColor: comb.codigoColor || '',
            nombreColor: comb.nombreColor || '',
            codigoTalla: comb.codigoTalla || '',
            nombreTalla: comb.nombreTalla || '',
            grupoTalla: comb.grupoTalla || '',
            unidades: 0,
            maxUnidades: parseFloat(unidadesARecepcionar) || 0
          }));
          setVariantesDistribucion(distribucion);
        } else if (data.colores && data.colores.length > 0) {
          const distribucion = data.colores.map(color => ({
            codigoColor: color.codigo,
            nombreColor: color.nombre,
            codigoTalla: '',
            nombreTalla: '',
            grupoTalla: '',
            unidades: 0,
            maxUnidades: parseFloat(unidadesARecepcionar) || 0
          }));
          setVariantesDistribucion(distribucion);
        } else if (data.tallas && data.tallas.length > 0) {
          const distribucion = data.tallas.map(talla => ({
            codigoColor: '',
            nombreColor: '',
            codigoTalla: talla.codigo,
            nombreTalla: talla.nombre,
            grupoTalla: talla.grupo || '',
            unidades: 0,
            maxUnidades: parseFloat(unidadesARecepcionar) || 0
          }));
          setVariantesDistribucion(distribucion);
        }
      }
    } catch (err) {
      console.error('Error cargando variantes:', err);
    } finally {
      setLoadingVariantes(false);
    }
  };

  const abrirModalRecepcion = async (linea, pedidoKey, variante = null, talla = null) => {
    let unidadesPendientes;
    if (variante && talla) {
      unidadesPendientes = parseFloat(talla.unidades) || 0;
    } else if (variante) {
      unidadesPendientes = parseFloat(variante.unidadesTotal) || 0;
    } else {
      unidadesPendientes = parseFloat(linea.UnidadesPendientes) || 0;
    }

    if (unidadesPendientes <= 0) {
      setError('No hay unidades pendientes para recepcionar');
      return;
    }

    setLineaARecepcionar({ linea, variante, talla, pedidoKey });
    setUnidadesARecepcionar(unidadesPendientes.toString());
    setSelectedAlmacen(ALMACEN_RECEPCION_FIJO);
    setSelectedUbicacion(UBICACION_RECEPCION_FIJA);
    setAlmacenes([{
      CodigoAlmacen: ALMACEN_RECEPCION_FIJO,
      Almacen: 'Recepción temporal'
    }]);
    setUbicaciones([{
      Ubicacion: UBICACION_RECEPCION_FIJA,
      DescripcionUbicacion: 'Recepción temporal'
    }]);
    setVariantesDistribucion([]);

    if (!variante && !talla && linea.variantes && linea.variantes.length > 0) {
      const distribucion = [];
      linea.variantes.forEach(varianteItem => {
        if (varianteItem.unidadesPorTalla) {
          Object.values(varianteItem.unidadesPorTalla).forEach(tallaItem => {
            if (parseFloat(tallaItem.unidades) > 0) {
              distribucion.push({
                codigoColor: varianteItem.codigoColor,
                nombreColor: varianteItem.nombreColor,
                codigoTalla: tallaItem.codigo,
                nombreTalla: tallaItem.nombre,
                grupoTalla: varianteItem.grupoTalla,
                unidades: 0,
                maxUnidades: parseFloat(tallaItem.unidades) || 0
              });
            }
          });
        } else if (varianteItem.unidadesTotal > 0) {
          distribucion.push({
            codigoColor: varianteItem.codigoColor || '',
            nombreColor: varianteItem.nombreColor || '',
            codigoTalla: '',
            nombreTalla: '',
            grupoTalla: varianteItem.grupoTalla || '',
            unidades: 0,
            maxUnidades: parseFloat(varianteItem.unidadesTotal) || 0
          });
        }
      });
      if (distribucion.length > 0) {
        setVariantesDistribucion(distribucion);
      } else {
        await cargarVariantesArticulo(linea.CodigoArticulo);
      }
    } else if (!variante && !talla && linea.tipoVariante !== 'NORMAL') {
      await cargarVariantesArticulo(linea.CodigoArticulo);
    }

    setModalRecepcion(true);
  };

  const cerrarModalRecepcion = () => {
    setModalRecepcion(false);
    setLineaARecepcionar(null);
    setVariantesDistribucion([]);
    setUnidadesARecepcionar('');
    setSelectedAlmacen('');
    setSelectedUbicacion('');
  };

  const procesarRecepcionLinea = async () => {
    if (!lineaARecepcionar) return;

    if (!selectedAlmacen || !selectedUbicacion) {
      setError('Debe seleccionar un almacén y ubicación');
      return;
    }

    const unidades = parseFloat(unidadesARecepcionar) || 0;
    if (unidades <= 0) {
      setError('Debe especificar unidades a recepcionar');
      return;
    }

    setLoadingRecepcion(true);
    setError(null);

    try {
      const { linea, variante, talla, pedidoKey } = lineaARecepcionar;

      const body = {
        almacen: selectedAlmacen,
        ubicacion: selectedUbicacion,
        lineasRecepcion: [{
          Orden: linea.Orden || 0,
          codigoArticulo: linea.CodigoArticulo,
          unidadesRecepcionar: unidades,
          variantes: variante ? [
            {
              codigoColor: variante.codigoColor || '',
              codigoTalla: talla ? talla.codigo : '',
              unidades: unidades
            }
          ] : variantesDistribucion
            .filter(v => parseFloat(v.unidades) > 0)
            .map(v => ({
              codigoColor: v.codigoColor || '',
              codigoTalla: v.codigoTalla || '',
              unidades: v.unidades
            }))
        }],
        comentarioRecepcion: `Recepción manual por ${user.UsuarioLogicNet}`
      };

      const { data } = await API.post(
        `/pedidos-compra/${linea.EjercicioPedido}/${linea.SeriePedido || '0'}/${linea.NumeroPedido}/recepcionar`,
        body
      );

      if (data.success) {
        let mensajeExito = `Recepción exitosa: ${unidades} unidades de ${linea.CodigoArticulo} añadidas a ${selectedAlmacen} - ${selectedUbicacion}`;
        if (variante) {
          mensajeExito += ` (${variante.nombreColor}${talla ? ' - ' + talla.nombre : ''})`;
        }

        if (data.autoGenerarAlbaran) {
          try {
            const { data: albaranData } = await API.post(
              `/pedidos-compra/${linea.EjercicioPedido}/${linea.SeriePedido || '0'}/${linea.NumeroPedido}/generar-albaran`,
              {}
            );
            if (albaranData?.success && albaranData?.albaran) {
              mensajeExito += `. Albarán generado automáticamente: ${albaranData.albaran.numero} (Ejercicio ${albaranData.albaran.ejercicio})`;
            }
          } catch (autoAlbaranError) {
            mensajeExito += '. La recepción se guardó, pero la generación automática del albarán ha fallado.';
            setError(getApiErrorMessage(autoAlbaranError, 'Error al generar el albarán automáticamente.'));
          }
        }

        setSuccess(mensajeExito);

        // Recargar detalles del pedido
        await cargarDetallesPedido(linea.EjercicioPedido, linea.SeriePedido || '0', linea.NumeroPedido, true);
        // Recargar lista de pedidos
        await cargarPedidos(pagination.page, true);

        cerrarModalRecepcion();
      }
    } catch (err) {
      setError(`Error en recepción: ${err.message}`);
    } finally {
      setLoadingRecepcion(false);
    }
  };

  return {
    modalRecepcion,
    lineaARecepcionar,
    almacenes,
    ubicaciones,
    selectedAlmacen,
    setSelectedAlmacen,
    selectedUbicacion,
    setSelectedUbicacion,
    unidadesARecepcionar,
    setUnidadesARecepcionar,
    variantesDistribucion,
    setVariantesDistribucion,
    loadingVariantes,
    loadingRecepcion,
    abrirModalRecepcion,
    cerrarModalRecepcion,
    procesarRecepcionLinea
  };
};

// ==================== useAlbaranModal ====================
export const useAlbaranModal = ({
  user,
  detallesPedidos,
  cargarDetallesPedido,
  cargarPedidos,
  pagination,
  setError,
  setSuccess
}) => {
  const [modalGenerarAlbaran, setModalGenerarAlbaran] = useState(false);
  const [pedidoAAlbaran, setPedidoAAlbaran] = useState(null);
  const [lineasConRecepcion, setLineasConRecepcion] = useState([]);
  const [totalUnidadesAlbaran, setTotalUnidadesAlbaran] = useState(0);
  const [importeTotalAlbaran, setImporteTotalAlbaran] = useState(0);
  const [loadingAlbaran, setLoadingAlbaran] = useState(false);

  const calcularLineasParaAlbaran = (detalles, pedido) => {
    const lineasConUnidadesRecibidas = detalles.lineas.filter(l =>
      parseFloat(l.UnidadesRecibidas) > 0
    );
    if (lineasConUnidadesRecibidas.length === 0) {
      setError('No hay líneas con unidades recibidas para generar albarán');
      return false;
    }
    const totalUnidades = lineasConUnidadesRecibidas.reduce((sum, l) =>
      sum + parseFloat(l.UnidadesRecibidas), 0
    );
    const importeTotal = lineasConUnidadesRecibidas.reduce((sum, l) =>
      sum + (parseFloat(l.UnidadesRecibidas) * parseFloat(l.Precio || 0)), 0
    );
    setLineasConRecepcion(lineasConUnidadesRecibidas);
    setTotalUnidadesAlbaran(totalUnidades);
    setImporteTotalAlbaran(importeTotal);
    return true;
  };

  const prepararGenerarAlbaran = async (pedido) => {
    const clave = `${pedido.EjercicioPedido}_${pedido.SeriePedido || '0'}_${pedido.NumeroPedido}`;
    let detalles = detallesPedidos[clave];
    if (!detalles) {
      detalles = await cargarDetallesPedido(pedido.EjercicioPedido, pedido.SeriePedido || '0', pedido.NumeroPedido, false);
      if (!detalles) return;
    }
    if (calcularLineasParaAlbaran(detalles, pedido)) {
      setPedidoAAlbaran({
        tipo: 'PEDIDO',
        ...pedido
      });
      setModalGenerarAlbaran(true);
    }
  };

  const prepararGenerarAlbaranPorProveedor = async (claveProveedor, pedidosAgrupados) => {
    const grupo = pedidosAgrupados[claveProveedor];
    if (!grupo || !grupo.tieneUnidadesParaAlbaran) {
      setError('Este proveedor no tiene unidades recepcionadas para generar albarán');
      return;
    }

    const lineasConRecepcionAgrupadas = [];
    let totalUnidades = 0;
    let importeTotal = 0;

    for (const pedido of grupo.pedidos) {
      if (parseFloat(pedido.TotalUnidadesRecibidas) <= 0) continue;
      const clavePedido = `${pedido.EjercicioPedido}_${pedido.SeriePedido || '0'}_${pedido.NumeroPedido}`;
      let detalles = detallesPedidos[clavePedido];
      if (!detalles) {
        detalles = await cargarDetallesPedido(pedido.EjercicioPedido, pedido.SeriePedido || '0', pedido.NumeroPedido, false);
        if (!detalles) continue;
      }
      const lineasConUnidades = detalles.lineas.filter(l => parseFloat(l.UnidadesRecibidas) > 0);
      const lineasConPedido = lineasConUnidades.map(linea => ({
        ...linea,
        ejercicioPedido: pedido.EjercicioPedido,
        seriePedido: pedido.SeriePedido || '0',
        numeroPedido: pedido.NumeroPedido,
        proveedor: pedido.NombreProveedor,
        codigoProveedor: pedido.CodigoProveedor
      }));
      lineasConRecepcionAgrupadas.push(...lineasConPedido);
      totalUnidades += lineasConUnidades.reduce((sum, l) => sum + parseFloat(l.UnidadesRecibidas), 0);
      importeTotal += lineasConUnidades.reduce((sum, l) => sum + (parseFloat(l.UnidadesRecibidas) * parseFloat(l.Precio || 0)), 0);
    }

    if (lineasConRecepcionAgrupadas.length === 0) {
      setError('No hay líneas con unidades recepcionadas');
      return;
    }

    setPedidoAAlbaran({
      tipo: 'PROVEEDOR',
      codigoProveedor: grupo.codigoProveedor,
      nombreProveedor: grupo.nombreProveedor,
      pedidos: grupo.pedidos
        .filter(p => parseFloat(p.TotalUnidadesRecibidas) > 0)
        .map(p => ({
          ejercicio: p.EjercicioPedido,
          serie: p.SeriePedido || '0',
          numero: p.NumeroPedido
        }))
    });
    setLineasConRecepcion(lineasConRecepcionAgrupadas);
    setTotalUnidadesAlbaran(totalUnidades);
    setImporteTotalAlbaran(importeTotal);
    setModalGenerarAlbaran(true);
  };

  const generarAlbaran = async () => {
    if (!pedidoAAlbaran) return;

    setLoadingAlbaran(true);
    setError(null);

    try {
      if (pedidoAAlbaran.tipo === 'PROVEEDOR') {
        const { data } = await API.post(
          `/proveedores/${pedidoAAlbaran.codigoProveedor}/generar-albaran`,
          { pedidos: pedidoAAlbaran.pedidos }
        );
        if (data.success) {
          setSuccess(`✅ Albarán NO ACUMULATIVO generado correctamente para ${pedidoAAlbaran.nombreProveedor}. Número: ${data.albaran.numero}`);
          await cargarPedidos(pagination.page, true);
          cerrarModalAlbaran();
        }
      } else {
        const { data } = await API.post(
          `/pedidos-compra/${pedidoAAlbaran.EjercicioPedido}/${pedidoAAlbaran.SeriePedido || '0'}/${pedidoAAlbaran.NumeroPedido}/generar-albaran`
        );
        if (data.success) {
          setSuccess(`✅ Albarán NO ACUMULATIVO generado correctamente. Número: ${data.albaran.numero} (Ejercicio: ${data.albaran.ejercicio})`);
          await cargarPedidos(pagination.page, true);
          cerrarModalAlbaran();
        }
      }
    } catch (err) {
      setError(`Error al generar albarán: ${getApiErrorMessage(err, 'Error al generar albarán')}`);
    } finally {
      setLoadingAlbaran(false);
    }
  };

  const cerrarModalAlbaran = () => {
    setModalGenerarAlbaran(false);
    setPedidoAAlbaran(null);
    setLineasConRecepcion([]);
    setTotalUnidadesAlbaran(0);
    setImporteTotalAlbaran(0);
  };

  return {
    modalGenerarAlbaran,
    pedidoAAlbaran,
    lineasConRecepcion,
    totalUnidadesAlbaran,
    importeTotalAlbaran,
    loadingAlbaran,
    prepararGenerarAlbaran,
    prepararGenerarAlbaranPorProveedor,
    generarAlbaran,
    cerrarModalAlbaran
  };
};

// ==================== useFinalizarPedido ====================
export const useFinalizarPedido = ({
  user,
  cargarPedidos,
  pagination,
  setError,
  setSuccess
}) => {
  const [modalFinalizarPedido, setModalFinalizarPedido] = useState(false);
  const [pedidoAFinalizar, setPedidoAFinalizar] = useState(null);
  const [loadingFinalizar, setLoadingFinalizar] = useState(false);

  const prepararFinalizarPedido = (pedido) => {
    setPedidoAFinalizar(pedido);
    setModalFinalizarPedido(true);
  };

  const finalizarPedido = async () => {
    if (!pedidoAFinalizar) return;

    setLoadingFinalizar(true);
    setError(null);

    try {
      const { data } = await API.post(
        `/pedidos-compra/${pedidoAFinalizar.EjercicioPedido}/${pedidoAFinalizar.SeriePedido || '0'}/${pedidoAFinalizar.NumeroPedido}/finalizar`,
        { motivo: `Finalizado manualmente por ${user.UsuarioLogicNet}` }
      );
      if (data.success) {
        setSuccess(`✅ Pedido #${pedidoAFinalizar.NumeroPedido} finalizado correctamente como servido.`);
        await cargarPedidos(pagination.page, true);
        cerrarModalFinalizar();
      }
    } catch (err) {
      setError(`Error al finalizar pedido: ${getApiErrorMessage(err, 'Error al finalizar pedido')}`);
    } finally {
      setLoadingFinalizar(false);
    }
  };

  const cerrarModalFinalizar = () => {
    setModalFinalizarPedido(false);
    setPedidoAFinalizar(null);
  };

  return {
    modalFinalizarPedido,
    pedidoAFinalizar,
    loadingFinalizar,
    prepararFinalizarPedido,
    finalizarPedido,
    cerrarModalFinalizar
  };
};