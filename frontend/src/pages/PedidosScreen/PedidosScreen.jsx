// PedidosScreen.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Box } from '@mui/material';
import {
  FaBox,
  FaCheck,
  FaChevronDown,
  FaExclamation,
  FaEllipsisV,
  FaInfoCircle,
  FaPhone,
  FaSearch,
  FaSync,
  FaUser,
  FaWeight,
  FaCalendarAlt,
} from 'react-icons/fa';

import API from '../../helpers/api';
import { getAuthHeader } from '../../helpers/authHelper';
import { usePermissions } from '../../PermissionsManager';
import Navbar from '../../components/Navbar';
import {
  useDebounce,
  opcionesStatus,
  validarExpedicionLinea,
  mostrarToastEnPagina,
} from './hooksYHelpers';
import {
  PedidosHeader,
  PedidosFilters,
  PedidosSummaryBar,
  PedidosList,
  PedidosStateView,
  PedidoCard,
  PedidoLineasTable,
  Paginacion,
} from './componentes';
import {
  LineaPedido,
  DetallesArticuloModal,
  CameraModal,
} from './modalesYLineas';

const PedidosScreen = () => {
  const navigate = useNavigate();
  const pedidosPorPagina = 20;

  const { canViewAllOrders, canPerformActions, canPerformActionsInPedidos } = usePermissions();

  // Estados principales
  const [pedidos, setPedidos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState({});
  const [expediciones, setExpediciones] = useState({});
  const [pedidoViewModes, setPedidoViewModes] = useState({});
  const [loading, setLoading] = useState(true);
  const [generandoAlbaran, setGenerandoAlbaran] = useState(false);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const debouncedFiltroBusqueda = useDebounce(filtroBusqueda, 500);
  // ✅ NUEVO: valor por defecto 'todos' para ver todos los pedidos sin límite de fechas
  const [rangoFechas, setRangoFechas] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const [error, setError] = useState('');
  const [detallesModal, setDetallesModal] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [currentScanningLine, setCurrentScanningLine] = useState(null);
  const [scannedItems, setScannedItems] = useState({});
  const [cameraError, setCameraError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [lineasProcesando, setLineasProcesando] = useState({});
  const [articulosConUbicacionesCargadas, setArticulosConUbicacionesCargadas] = useState(new Set());
  const [articulosCargandoUbicaciones, setArticulosCargandoUbicaciones] = useState(new Set());

  const abortControllerRef = useRef(null);
  const rangoFechasRef = useRef(rangoFechas);
  const userRef = useRef(JSON.parse(localStorage.getItem('user') || 'null'));

  // Mantener ref actualizada
  useEffect(() => {
    rangoFechasRef.current = rangoFechas;
  }, [rangoFechas]);

  // ----------------------
  // Funciones de negocio
  // ----------------------
  const mostrarNotificacionNavegador = useCallback((titulo, cuerpo, tipo = 'info') => {
    if (!('Notification' in window)) {
      mostrarToastEnPagina(titulo, cuerpo, tipo);
      return false;
    }
    if (Notification.permission === 'granted') {
      const options = { body: cuerpo, icon: '/favicon.ico', tag: 'albaran-generado', renotify: true };
      if ('vibrate' in navigator) navigator.vibrate(tipo === 'error' ? [200, 100, 200] : [100]);
      const notificacion = new Notification(titulo, options);
      notificacion.onclick = () => {
        window.focus();
        notificacion.close();
      };
      setTimeout(() => notificacion.close(), 5000);
      return true;
    } else if (Notification.permission !== 'denied') {
      if (window.confirm('¿Deseas recibir notificaciones cuando se generen albaranes?')) {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') mostrarNotificacionNavegador(titulo, cuerpo, tipo);
          else mostrarToastEnPagina(titulo, cuerpo, tipo);
        });
      }
      return false;
    } else {
      mostrarToastEnPagina(titulo, cuerpo, tipo);
      return false;
    }
  }, []);

  const handleActualizarVoluminoso = useCallback(async (pedido, esVoluminoso) => {
    if (!canPerformActionsInPedidos) return;
    try {
      const response = await API.post(
        '/pedidos/actualizar-voluminoso',
        {
          codigoEmpresa: pedido.codigoEmpresa,
          ejercicio: pedido.ejercicioPedido,
          serie: pedido.seriePedido,
          numeroPedido: pedido.numeroPedido,
          esVoluminoso,
        },
        { headers: getAuthHeader() }
      );
      if (response.data.success) {
        setPedidos((prev) =>
          prev.map((p) =>
            p.numeroPedido === pedido.numeroPedido ? { ...p, EsVoluminoso: esVoluminoso } : p
          )
        );
        alert(response.data.mensaje);
      }
    } catch (error) {
      console.error(error);
      alert('Error: ' + (error.response?.data?.mensaje || error.message));
      throw error;
    }
  }, [canPerformActionsInPedidos]);

  const cargarUbicacionesParaArticulos = useCallback(
    async (codigosArticulos) => {
      const codigosParaCargar = codigosArticulos.filter(
        (codigo) => !articulosConUbicacionesCargadas.has(codigo) && !articulosCargandoUbicaciones.has(codigo)
      );
      if (codigosParaCargar.length === 0) return;
      setArticulosCargandoUbicaciones((prev) => new Set([...prev, ...codigosParaCargar]));
      const headers = getAuthHeader();
      const nuevasUbicaciones = {};
      try {
        const batchSize = 10;
        for (let i = 0; i < codigosParaCargar.length; i += batchSize) {
          const batch = codigosParaCargar.slice(i, i + batchSize);
          const resultados = await Promise.allSettled(
            batch.map(async (codigo) => {
              const response = await API.get('/traspasos/stock-por-articulo', {
                headers,
                params: { codigoArticulo: codigo },
              });
              return {
                codigo,
                data: response.data.map((item) => ({
                  codigoAlmacen: item.CodigoAlmacen,
                  ubicacion: item.Ubicacion,
                  partida: item.Partida || null,
                  unidadSaldo: item.Cantidad,
                  unidadMedida: item.UnidadStock || 'unidades',
                  codigoColor: item.CodigoColor_ || '',
                  codigoTalla: item.CodigoTalla01_ || '',
                  descripcionUbicacion: item.DescripcionUbicacion,
                })),
              };
            })
          );
          resultados.forEach((resultado) => {
            if (resultado.status === 'fulfilled') {
              nuevasUbicaciones[resultado.value.codigo] = resultado.value.data;
            }
          });
          setUbicaciones((prev) => ({ ...prev, ...nuevasUbicaciones }));
        }
      } finally {
        setArticulosConUbicacionesCargadas((prev) => new Set([...prev, ...codigosParaCargar]));
        setArticulosCargandoUbicaciones((prev) => {
          const nuevo = new Set(prev);
          codigosParaCargar.forEach((c) => nuevo.delete(c));
          return nuevo;
        });
      }
    },
    [articulosConUbicacionesCargadas, articulosCargandoUbicaciones]
  );

  const handleExpedirArticuloOptimizado = useCallback(
    async (linea, pedido, expedicion) => {
      if (!canPerformActions || isScanning) return;
      const key = linea.movPosicionLinea;
      const validacion = validarExpedicionLinea(linea, expedicion, ubicaciones);
      if (!validacion.isValid) {
        mostrarToastEnPagina('Cantidad no válida', validacion.message, 'error');
        return;
      }
      setLineasProcesando((prev) => ({ ...prev, [key]: true }));
      try {
        const response = await API.post(
          '/actualizarLineaPedido',
          {
            codigoEmpresa: pedido.codigoEmpresa,
            ejercicio: pedido.ejercicioPedido,
            serie: pedido.seriePedido || '',
            numeroPedido: pedido.numeroPedido,
            codigoArticulo: linea.codigoArticulo,
            cantidadExpedida: validacion.cantidad,
            almacen: expedicion.almacen,
            ubicacion: expedicion.ubicacion,
            partida: expedicion.partida || '',
            unidadMedida: expedicion.unidadMedida || linea.unidadPedido,
            codigoColor: expedicion.codigoColor || '',
            codigoTalla: expedicion.codigoTalla || '',
            esZonaDescarga: expedicion.ubicacion === 'Zona descarga',
            movPosicionLinea: key,
          },
          { headers: getAuthHeader() }
        );
        if (response.data.success) {
          // ✅ Notificación mejorada según respuesta del backend
          const { albaranGenerado, albaran, pedidoCompletado } = response.data.detalles || {};
          if (albaranGenerado && albaran) {
            mostrarNotificacionNavegador(
              'Albarán Generado',
              `✅ Albarán Nº ${albaran.serie || ''}${albaran.numero} generado automáticamente.`,
              'success'
            );
            mostrarToastEnPagina('Albarán generado', `Nº ${albaran.serie || ''}${albaran.numero}`, 'success');
          } else if (pedidoCompletado && !albaranGenerado) {
            mostrarNotificacionNavegador(
              'Atención',
              `Pedido #${pedido.numeroPedido} completado pero no se pudo generar el albarán automáticamente. Revisa logs.`,
              'error'
            );
          } else {
            mostrarNotificacionNavegador(
              'Expedición Registrada',
              `Servidas ${validacion.cantidad} ${linea.unidadBase || 'ud'} para pedido #${pedido.numeroPedido}.`,
              'info'
            );
          }

          // Actualización local del estado
          setPedidos((prev) =>
            prev
              .map((p) => {
                if (p.numeroPedido !== pedido.numeroPedido) return p;
                const articulosActualizados = p.articulos.map((art) =>
                  art.movPosicionLinea === key
                    ? {
                        ...art,
                        unidadesPendientes: Math.max(0, parseFloat(art.unidadesPendientes) - validacion.cantidad),
                      }
                    : art
                );
                const tieneLineasPendientes = articulosActualizados.some(
                  (art) => parseFloat(art.unidadesPendientes) > 0
                );
                if (!tieneLineasPendientes) return null; // eliminar pedido si está completamente expedido
                return {
                  ...p,
                  Estado: response.data.detalles?.pedidoParcial ? 4 : p.Estado,
                  Status:
                    response.data.detalles?.statusPedido ||
                    (response.data.detalles?.pedidoParcial ? 'Parcial' : p.Status),
                  articulos: articulosActualizados,
                };
              })
              .filter(Boolean)
          );

          if (expedicion.ubicacion !== 'Zona descarga') {
            setUbicaciones((prev) => {
              const nuevas = { ...prev };
              const ubicacionActualizada = (nuevas[linea.codigoArticulo] || []).map((ubic) =>
                ubic.ubicacion === expedicion.ubicacion &&
                ubic.codigoAlmacen === expedicion.almacen &&
                (ubic.partida || '') === (expedicion.partida || '')
                  ? { ...ubic, unidadSaldo: Math.max(0, parseFloat(ubic.unidadSaldo) - validacion.cantidad) }
                  : ubic
              );
              nuevas[linea.codigoArticulo] = ubicacionActualizada;
              return nuevas;
            });
          }
          setExpediciones((prev) => ({ ...prev, [key]: { ...prev[key], cantidad: '0' } }));
        }
      } catch (error) {
        console.error(error);
        mostrarNotificacionNavegador('Error al Expedir', error.response?.data?.mensaje || error.message, 'error');
        alert('❌ Error: ' + (error.response?.data?.mensaje || error.message));
      } finally {
        setLineasProcesando((prev) => ({ ...prev, [key]: false }));
      }
    },
    [canPerformActions, isScanning, ubicaciones, mostrarNotificacionNavegador]
  );

  const procesarExpedicion = useCallback(
    (codigoVerificado, detalle = null) => {
      if (!currentScanningLine) return false;
      const { linea, pedido } = currentScanningLine;
      if (codigoVerificado === linea.codigoArticulo || codigoVerificado === linea.codigoAlternativo) {
        const key = linea.movPosicionLinea;
        const expedicion = expediciones[key];
        if (!expedicion) return false;
        handleExpedirArticuloOptimizado(linea, pedido, expedicion);
        if (detalle) {
          const itemKey = `${linea.codigoArticulo}-${detalle.talla}-${detalle.color}`;
          setScannedItems((prev) => ({ ...prev, [itemKey]: (prev[itemKey] || 0) + 1 }));
        }
        return true;
      }
      return false;
    },
    [currentScanningLine, expediciones, handleExpedirArticuloOptimizado]
  );

  const handleScanSuccess = useCallback(
    (decodedText) => {
      if (!procesarExpedicion(decodedText, currentScanningLine?.detalle)) {
        alert('Código escaneado no coincide con el artículo');
      }
      setShowCamera(false);
    },
    [procesarExpedicion, currentScanningLine]
  );

  const handleManualVerification = useCallback(() => {
    if (!manualCode) return;
    if (!procesarExpedicion(manualCode, currentScanningLine?.detalle)) {
      alert('Código introducido no coincide con el artículo');
    }
    setShowCamera(false);
    setManualCode('');
  }, [procesarExpedicion, manualCode, currentScanningLine]);

  const iniciarEscaneo = useCallback(
    (linea, pedido, detalle = null) => {
      if (!canPerformActions) return;
      setCurrentScanningLine({ linea, pedido, detalle });
      setShowCamera(true);
      setManualCode('');
    },
    [canPerformActions]
  );

  const handleExpedirVariante = useCallback(
    async (datosVariante) => {
      const { articulo, color, talla, cantidad, ubicacion, almacen, partida, unidadMedida, movPosicionLinea } =
        datosVariante;
      const { pedido, linea } = detallesModal;
      try {
        const response = await API.post(
          '/actualizarLineaPedido',
          {
            codigoEmpresa: pedido.codigoEmpresa,
            ejercicio: pedido.ejercicioPedido,
            serie: pedido.seriePedido || '',
            numeroPedido: pedido.numeroPedido,
            codigoArticulo: articulo,
            cantidadExpedida: cantidad,
            almacen,
            ubicacion,
            partida,
            unidadMedida,
            codigoColor: color,
            codigoTalla: talla,
            esZonaDescarga: ubicacion === 'Zona descarga',
            movPosicionLinea,
          },
          { headers: getAuthHeader() }
        );
        if (response.data.success) {
          setPedidos((prev) =>
            prev.map((p) => {
              if (p.numeroPedido !== pedido.numeroPedido) return p;
              const articulosActualizados = p.articulos.map((art) => {
                if (art.movPosicionLinea !== movPosicionLinea) return art;
                if (art.detalles && Array.isArray(art.detalles)) {
                  const detallesActualizados = art.detalles.map((variante) => {
                    if (variante.color?.codigo === color) {
                      const tallasActualizadas = { ...variante.tallas };
                      if (tallasActualizadas[talla]) {
                        tallasActualizadas[talla] = {
                          ...tallasActualizadas[talla],
                          unidades: Math.max(0, parseFloat(tallasActualizadas[talla].unidades) - cantidad),
                        };
                      }
                      return { ...variante, tallas: tallasActualizadas };
                    }
                    return variante;
                  });
                  let nuevasUnidadesPendientes = 0;
                  detallesActualizados.forEach((variante) => {
                    Object.values(variante.tallas || {}).forEach((tallaInfo) => {
                      nuevasUnidadesPendientes += parseFloat(tallaInfo.unidades) || 0;
                    });
                  });
                  return { ...art, detalles: detallesActualizados, unidadesPendientes: nuevasUnidadesPendientes };
                }
                return art;
              });
              return { ...p, articulos: articulosActualizados };
            })
          );
          setDetallesModal(null);
          alert(`Expedición realizada: ${cantidad} unidades de la variante`);
        }
      } catch (error) {
        console.error(error);
        alert('Error al expedir: ' + (error.response?.data?.mensaje || error.message));
      }
    },
    [detallesModal]
  );

  const generarAlbaranParcial = useCallback(
    async (pedido) => {
      if (!canPerformActionsInPedidos) return;
      try {
        setGenerandoAlbaran(true);
        const response = await API.post(
          '/generarAlbaranParcial',
          {
            codigoEmpresa: pedido.codigoEmpresa,
            ejercicio: pedido.ejercicioPedido,
            serie: pedido.seriePedido,
            numeroPedido: pedido.numeroPedido,
          },
          { headers: getAuthHeader() }
        );
        if (response.data.success) {
          setPedidos((prev) =>
            prev.map((p) =>
              p.numeroPedido === pedido.numeroPedido
                ? {
                    ...p,
                    Estado: response.data.statusPedido === 'Parcial' ? 4 : 2,
                    Status: response.data.statusPedido,
                  }
                : p
            )
          );
          const albaranInfo = response.data.albaran;
          mostrarNotificacionNavegador(
            'Albarán Generado',
            `✅ Albarán ${albaranInfo.esParcial ? 'parcial' : 'completo'} Nº: ${albaranInfo.serie || ''}${
              albaranInfo.numero
            }`,
            'success'
          );
          alert(`✅ Albarán generado correctamente\nNúmero: ${albaranInfo.serie || ''}${albaranInfo.numero}`);
        }
      } catch (error) {
        console.error(error);
        mostrarNotificacionNavegador('Error Generando Albarán', error.response?.data?.mensaje || error.message, 'error');
        alert('Error: ' + (error.response?.data?.mensaje || error.message));
      } finally {
        setGenerandoAlbaran(false);
      }
    },
    [canPerformActionsInPedidos, mostrarNotificacionNavegador]
  );

  const cargarPedidos = useCallback(
    async (forzarRecarga = false) => {
      if (abortControllerRef.current && !forzarRecarga) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      try {
        setLoading(true);
        setError('');
        if (forzarRecarga && !isScanning) {
          setUbicaciones({});
          setExpediciones({});
          setArticulosConUbicacionesCargadas(new Set());
          setArticulosCargandoUbicaciones(new Set());
        }
        const codigoEmpresa = userRef.current?.CodigoEmpresa;
        if (!codigoEmpresa) {
          setError('No se encontró código de empresa.');
          setLoading(false);
          return;
        }
        // ✅ Enviar el rango actual (incluyendo 'todos')
        const response = await API.get('/pedidosPendientes', {
          headers: getAuthHeader(),
          params: { codigoEmpresa, rango: rangoFechasRef.current },
          signal,
        });
        if (signal.aborted) return;
        const pedidosVisibles = response.data;
        setPedidos(pedidosVisibles);
        const initialModes = {};
        pedidosVisibles.forEach((pedido) => {
          initialModes[pedido.numeroPedido] = 'show';
        });
        setPedidoViewModes(initialModes);
      } catch (err) {
        if (err.name !== 'CanceledError') {
          console.error(err);
          setError('Error de conexión con el servidor');
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [isScanning]
  );

  useEffect(() => {
    cargarPedidos();
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [rangoFechas, cargarPedidos]);

  // Detectar cámaras
  useEffect(() => {
    if (showCamera) {
      const isHttp = window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      if (isHttp) {
        setCameraError('La cámara solo está disponible en HTTPS o localhost. Usa la entrada manual.');
        return;
      }
      const detectar = async () => {
        try {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('Navegador no soporta cámara');
          const { Html5Qrcode } = await import('html5-qrcode');
          const camerasList = await Html5Qrcode.getCameras();
          if (camerasList.length) {
            setCameras(camerasList);
            setSelectedCamera(camerasList[0].id);
          } else throw new Error('No se encontraron cámaras');
        } catch (err) {
          setCameraError(err.message);
        }
      };
      detectar();
    }
  }, [showCamera]);

  const togglePedidoView = useCallback((numeroPedido) => {
    setPedidoViewModes((prev) => ({ ...prev, [numeroPedido]: prev[numeroPedido] === 'show' ? 'hide' : 'show' }));
  }, []);

  const handleExpedicionChange = useCallback((key, field, value) => {
    if (!canPerformActions) return;
    setExpediciones((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }));
  }, [canPerformActions]);

  const cambiarPagina = useCallback((numeroPagina) => {
    setPaginaActual(numeroPagina);
    window.scrollTo(0, 0);
  }, []);

  const abrirModalDetalles = useCallback(async (detallesAnidados, linea, pedido) => {
    try {
      const detallesPlana = [];
      if (detallesAnidados && Array.isArray(detallesAnidados)) {
        detallesAnidados.forEach((variante) => {
          if (variante.tallas && typeof variante.tallas === 'object') {
            Object.entries(variante.tallas).forEach(([codigoTalla, talla]) => {
              if (talla && talla.unidades > 0) {
                detallesPlana.push({
                  codigoArticulo: linea.codigoArticulo,
                  codigoColor: variante.color?.codigo || '',
                  codigoTalla: codigoTalla,
                  cantidadPendiente: talla.unidades,
                  descripcionTalla: talla.descripcion || `Talla ${codigoTalla}`,
                  colorNombre: variante.color?.nombre || variante.color?.codigo || 'Sin color',
                });
              }
            });
          }
        });
      }
      setDetallesModal({ detalles: detallesPlana, linea, pedido });
    } catch (error) {
      console.error(error);
      alert('Error al obtener información del artículo');
    }
  }, []);

  // Filtrado y paginación
  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter((pedido) => {
      const searchText = debouncedFiltroBusqueda.toLowerCase();
      const coincideBusqueda =
        pedido.numeroPedido.toString().includes(searchText) ||
        pedido.razonSocial.toLowerCase().includes(searchText) ||
        (pedido.nombreObra && pedido.nombreObra.toLowerCase().includes(searchText)) ||
        (pedido.contacto && pedido.contacto.toLowerCase().includes(searchText));
      const coincideStatus = filtroStatus ? pedido.Status === filtroStatus : true;
      return coincideBusqueda && coincideStatus;
    });
  }, [pedidos, debouncedFiltroBusqueda, filtroStatus]);

  const pedidosOrdenados = useMemo(() => [...pedidosFiltrados], [pedidosFiltrados]);
  const indexUltimoPedido = paginaActual * pedidosPorPagina;
  const indexPrimerPedido = indexUltimoPedido - pedidosPorPagina;
  const pedidosActuales = pedidosOrdenados.slice(indexPrimerPedido, indexUltimoPedido);
  const totalPaginas = Math.ceil(pedidosOrdenados.length / pedidosPorPagina);

  if (!canViewAllOrders) {
    return (
      <Box className="ps-pedidos-screen">
        <PedidosStateView
          type="warning"
          title="Acceso restringido."
          message="No tienes permiso para ver esta sección."
          buttonLabel="Volver al inicio"
          onButtonClick={() => navigate('/')}
        />
        <Navbar />
      </Box>
    );
  }

  return (
    <Box className="ps-pedidos-screen">
      <Container maxWidth={false} sx={{ py: 3, px: { xs: 2, sm: 3 } }}>
        <PedidosFilters
          filtroBusqueda={filtroBusqueda}
          onFiltroBusquedaChange={setFiltroBusqueda}
          rangoFechas={rangoFechas}
          onRangoFechasChange={setRangoFechas}
          filtroStatus={filtroStatus}
          onFiltroStatusChange={setFiltroStatus}
          opcionesStatus={opcionesStatus}
        />

        <PedidosSummaryBar
          totalPedidos={pedidosOrdenados.length}
          pedidosPagina={pedidosActuales.length}
          paginaActual={paginaActual}
          totalPaginas={totalPaginas}
          voluminosos={pedidosOrdenados.filter((p) => p.EsVoluminoso).length}
        />

        <PedidosList>
          {error ? (
            <PedidosStateView
              type="error"
              title="Error al cargar pedidos."
              message={error}
              buttonLabel="Reintentar"
              onButtonClick={() => cargarPedidos(true)}
              buttonIcon={<FaSync />}
            />
          ) : loading ? (
            <PedidosStateView type="loading" message="Cargando pedidos..." />
          ) : pedidosOrdenados.length === 0 ? (
            <PedidosStateView
              type="info"
              title="No hay pedidos pendientes."
              message="Prueba a ajustar los filtros o espera a que lleguen nuevos pedidos."
            />
          ) : (
            pedidosActuales.map((pedido) => (
              <PedidoCard
                key={`${pedido.codigoEmpresa}-${pedido.ejercicioPedido}-${pedido.seriePedido || ''}-${pedido.numeroPedido}`}
                pedido={pedido}
                togglePedidoView={togglePedidoView}
                pedidoViewModes={pedidoViewModes}
                generarAlbaranParcial={generarAlbaranParcial}
                generandoAlbaran={generandoAlbaran}
                canPerformActionsInPedidos={canPerformActionsInPedidos}
                onActualizarVoluminoso={handleActualizarVoluminoso}
                onCargarUbicaciones={cargarUbicacionesParaArticulos}
                lineasContent={
                  <PedidoLineasTable>
                    {pedido.articulos.map((linea, idx) => (
                      <LineaPedido
                        key={`${pedido.codigoEmpresa}-${pedido.ejercicioPedido}-${pedido.seriePedido || ''}-${
                          pedido.numeroPedido
                        }-${linea.codigoArticulo}-${idx}`}
                        linea={linea}
                        pedido={pedido}
                        expediciones={expediciones}
                        handleExpedicionChange={handleExpedicionChange}
                        ubicaciones={ubicaciones}
                        ubicacionesCargadas={!!ubicaciones[linea.codigoArticulo]}
                        iniciarEscaneo={iniciarEscaneo}
                        abrirModalDetalles={abrirModalDetalles}
                        canPerformActions={canPerformActions}
                        isScanning={isScanning}
                        isProcesando={lineasProcesando[linea.movPosicionLinea] || false}
                      />
                    ))}
                  </PedidoLineasTable>
                }
              />
            ))
          )}
        </PedidosList>

        {detallesModal && (
          <DetallesArticuloModal
            detalles={detallesModal.detalles}
            linea={detallesModal.linea}
            pedido={detallesModal.pedido}
            onClose={() => setDetallesModal(null)}
            onExpedirVariante={handleExpedirVariante}
            canPerformActions={canPerformActions}
          />
        )}

        <CameraModal
          showCamera={showCamera}
          setShowCamera={setShowCamera}
          cameras={cameras}
          selectedCamera={selectedCamera}
          setSelectedCamera={setSelectedCamera}
          manualCode={manualCode}
          setManualCode={setManualCode}
          handleScanSuccess={handleScanSuccess}
          handleManualVerification={handleManualVerification}
          cameraError={cameraError}
        />
      </Container>
      <Navbar />
    </Box>
  );
};

export default PedidosScreen;