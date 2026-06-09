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

  const permissions = usePermissions();
  const {
    canViewAllOrders,
    canPerformActions,
    canPerformActionsInPedidos,
    isSuperUser,
    _hasAssignedOrdersPermission,
  } = permissions;

  // Estados principales
  const [pedidos, setPedidos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState({});
  const [expediciones, setExpediciones] = useState({});
  const [pedidoViewModes, setPedidoViewModes] = useState({});
  const [loading, setLoading] = useState(true);
  const [generandoAlbaran, setGenerandoAlbaran] = useState(false);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const debouncedFiltroBusqueda = useDebounce(filtroBusqueda, 500);
  const [rangoFechas, setRangoFechas] = useState('semana');
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
  // FIX: ref de permisos para usarlos dentro de cargarPedidos sin añadirlos como dependencia
  const permissionsRef = useRef(permissions);

  // Sincronizar refs
  useEffect(() => {
    rangoFechasRef.current = rangoFechas;
  }, [rangoFechas]);

  useEffect(() => {
    permissionsRef.current = permissions;
  }, [permissions]);

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
            esZonaDescarga: false,
            movPosicionLinea: key,
          },
          { headers: getAuthHeader() }
        );
        if (response.data.success) {
          if (response.data.detalles?.albaranGenerado) {
            const albInfo = response.data.detalles.albaran;
            const numAlbaran = albInfo
              ? `${albInfo.serie || ''}${albInfo.numero}`
              : '—';
            setTimeout(() => {
              mostrarToastEnPagina(
                '✅ Albarán automático generado',
                `Albarán automático generado #${numAlbaran}\nPedido #${pedido.numeroPedido} servido completamente.`,
                'success',
                0 // solo cierre manual
              );
            }, 800);
          }
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
                if (!tieneLineasPendientes) return null;
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
          setExpediciones((prev) => ({ ...prev, [key]: { ...prev[key], cantidad: '0' } }));
          mostrarToastEnPagina(
            'Servicio registrado',
            `Servidas ${validacion.cantidad} ${linea.unidadBase || 'ud'} desde ${expedicion.almacen} - ${expedicion.ubicacion}`,
            'success'
          );
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
      setLineasProcesando((prev) => ({ ...prev, [movPosicionLinea]: true }));
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
            esZonaDescarga: false,
            movPosicionLinea,
          },
          { headers: getAuthHeader() }
        );
        if (response.data.success) {
          // Notificación si el pedido quedó completado y se generó albarán
          if (response.data.detalles?.albaranGenerado) {
            const albInfo = response.data.detalles.albaran;
            const numAlbaran = albInfo
              ? `${albInfo.serie || ''}${albInfo.numero}`
              : '—';
            setTimeout(() => {
              mostrarToastEnPagina(
                '✅ Albarán automático generado',
                `Albarán automático generado #${numAlbaran}\nPedido #${pedido.numeroPedido} servido completamente.`,
                'success',
                0 // solo cierre manual
              );
            }, 800);
          }
          setPedidos((prev) =>
            prev
              .map((p) => {
                if (p.numeroPedido !== pedido.numeroPedido) return p;
                const articulosActualizados = p.articulos.map((art) => {
                  if (art.movPosicionLinea !== movPosicionLinea) return art;
                  const nuevasPendientes = Math.max(0, parseFloat(art.unidadesPendientes) - cantidad);
                  let detallesActualizados = art.detalles;
                  if (art.detalles && Array.isArray(art.detalles)) {
                    detallesActualizados = art.detalles.map((variante) => {
                      const mismoColor = (variante.color?.codigo || '') === (color || '');
                      if (!mismoColor) return variante;
                      const tallasActualizadas = { ...variante.tallas };
                      if (tallasActualizadas[talla]) {
                        tallasActualizadas[talla] = {
                          ...tallasActualizadas[talla],
                          unidades: Math.max(0, parseFloat(tallasActualizadas[talla].unidades) - cantidad),
                        };
                      }
                      return { ...variante, tallas: tallasActualizadas };
                    });
                  }
                  return {
                    ...art,
                    unidadesPendientes: nuevasPendientes,
                    detalles: detallesActualizados,
                  };
                });
                const tieneLineasPendientes = articulosActualizados.some(
                  (art) => parseFloat(art.unidadesPendientes) > 0
                );
                if (!tieneLineasPendientes) return null;
                return {
                  ...p,
                  Estado: response.data.detalles?.pedidoParcial ? 4 : p.Estado,
                  Status: response.data.detalles?.statusPedido ||
                    (response.data.detalles?.pedidoParcial ? 'Parcial' : p.Status),
                  articulos: articulosActualizados,
                };
              })
              .filter(Boolean)
          );
          // Actualizar stock local de ubicaciones igual que en handleExpedirArticuloOptimizado
          setUbicaciones((prev) => {
            const nuevas = { ...prev };
            const ubicacionActualizada = (nuevas[articulo] || []).map((ubic) =>
              ubic.ubicacion === ubicacion &&
              ubic.codigoAlmacen === almacen &&
              (ubic.partida || '') === (partida || '') &&
              (ubic.codigoColor || '') === (color || '') &&
              (ubic.codigoTalla || '') === (talla || '')
                ? { ...ubic, unidadSaldo: Math.max(0, parseFloat(ubic.unidadSaldo) - cantidad) }
                : ubic
            );
            nuevas[articulo] = ubicacionActualizada;
            return nuevas;
          });
          setDetallesModal(null);
          mostrarToastEnPagina(
            'Expedición realizada',
            `${cantidad} unidades expedidas correctamente`,
            'success'
          );
        }
      } catch (error) {
        console.error(error);
        mostrarNotificacionNavegador('Error al Expedir', error.response?.data?.mensaje || error.message, 'error');
        alert('Error al expedir: ' + (error.response?.data?.mensaje || error.message));
      } finally {
        setLineasProcesando((prev) => ({ ...prev, [movPosicionLinea]: false }));
      }
    },
    [detallesModal, mostrarNotificacionNavegador]
  );

  const generarAlbaranParcial = useCallback(
    async (pedido) => {
      if (!canPerformActionsInPedidos) return;
      try {
        setGenerandoAlbaran(true);
        const lineasExpedidas = [];
        pedido.articulos.forEach((articulo) => {
          const unidadesPedidas = parseFloat(articulo.unidadesPedidas) || 0;
          const unidadesPendientes = parseFloat(articulo.unidadesPendientes) || 0;
          const unidadesExpedidas = unidadesPedidas - unidadesPendientes;
          if (unidadesExpedidas > 0) {
            lineasExpedidas.push({
              codigoArticulo: articulo.codigoArticulo,
              descripcionArticulo: articulo.descripcionArticulo,
              cantidad: unidadesExpedidas,
              precio: articulo.precio || 0,
              codigoAlmacen: articulo.codigoAlmacen || 'CEN',
              partida: articulo.partida || '',
            });
          }
        });
        if (lineasExpedidas.length === 0) {
          alert('No hay líneas con cantidades expedidas para generar albarán parcial.');
          return;
        }
        const response = await API.post(
          '/generarAlbaranParcial',
          {
            codigoEmpresa: pedido.codigoEmpresa,
            ejercicio: pedido.ejercicioPedido,
            serie: pedido.seriePedido,
            numeroPedido: pedido.numeroPedido,
            lineasExpedidas,
          },
          { headers: getAuthHeader() }
        );
        if (response.data.success) {
          // Marcar las líneas ya albaranadas como servidas (unidadesPendientes = unidadesPedidas)
          // y eliminar el pedido del estado si ya no tiene pendientes reales
          setPedidos((prev) =>
            prev
              .map((p) => {
                if (p.numeroPedido !== pedido.numeroPedido) return p;
                const articulosActualizados = p.articulos.map((art) => {
                  const expedida = lineasExpedidas.find(
                    (l) => l.codigoArticulo === art.codigoArticulo
                  );
                  if (!expedida) return art;
                  // Restar las unidades que acabamos de albaranar
                  const nuevasPendientes = Math.max(
                    0,
                    parseFloat(art.unidadesPendientes) - expedida.cantidad
                  );
                  return { ...art, unidadesPendientes: nuevasPendientes };
                });
                const tieneLineasPendientes = articulosActualizados.some(
                  (art) => parseFloat(art.unidadesPendientes) > 0
                );
                if (!tieneLineasPendientes) return null;
                return {
                  ...p,
                  Estado: response.data.statusPedido === 'Parcial' ? 4 : 2,
                  Status: response.data.statusPedido,
                  articulos: articulosActualizados,
                };
              })
              .filter(Boolean)
          );
          const albaranInfo = response.data.albaran;
          mostrarNotificacionNavegador(
            'Albarán Generado',
            `✅ Albarán ${albaranInfo.esParcial ? 'parcial' : 'completo'} Nº: ${albaranInfo.serie || ''}${albaranInfo.numero}`,
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

  // FIX: cargarPedidos usa permissionsRef para no añadir permissions como dependencia
  // y evitar recargas innecesarias. Filtra por EmpleadoAsignado cuando el usuario
  // no es superUser ni tiene permiso de asignación de pedidos.
  const cargarPedidos = useCallback(
    async (forzarRecarga = false) => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      try {
        setLoading(true);
        setError('');
        if (forzarRecarga) {
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

        // FIX: si el usuario no es superUser ni tiene permiso de asignación,
        // filtrar por su CodigoCliente (= EmpleadoAsignado en BD)
        const { isSuperUser: superUser } = permissionsRef.current;
        const debeFiltrarPorEmpleado = !superUser;

        const params = { codigoEmpresa, rango: rangoFechasRef.current };
        if (debeFiltrarPorEmpleado && userRef.current?.UsuarioLogicNet) {
          params.empleadoAsignado = userRef.current.UsuarioLogicNet;
        }

        const response = await API.get('/pedidosPendientes', {
          headers: getAuthHeader(),
          params,
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
    []
  );

  useEffect(() => {
    cargarPedidos();
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [rangoFechas, cargarPedidos]); // eslint-disable-line react-hooks/exhaustive-deps

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

      if (detallesPlana.length === 0) {
        setPedidos((prev) =>
          prev.map((p) => {
            if (p.numeroPedido !== pedido.numeroPedido) return p;
            return {
              ...p,
              articulos: p.articulos.map((art) =>
                art.movPosicionLinea === linea.movPosicionLinea
                  ? { ...art, detalles: null }
                  : art
              ),
            };
          })
        );
        mostrarToastEnPagina(
          'Sin variantes reales',
          'Este artículo no tiene desglose por talla/color. Puedes expedirlo directamente.',
          'info'
        );
        return;
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

  const paginacionComponente = (
    <Paginacion
      totalPaginas={totalPaginas}
      paginaActual={paginaActual}
      cambiarPagina={cambiarPagina}
    />
  );

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

        <PedidosList
          topPagination={paginacionComponente}
          bottomPagination={paginacionComponente}
        >
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
                    {pedido.articulos.filter((linea) => parseFloat(linea.unidadesPendientes) > 0).map((linea, idx) => (
                      <LineaPedido
                        key={`${pedido.codigoEmpresa}-${pedido.ejercicioPedido}-${pedido.seriePedido || ''}-${pedido.numeroPedido}-${linea.codigoArticulo}-${idx}`}
                        linea={linea}
                        pedido={pedido}
                        expediciones={expediciones}
                        handleExpedicionChange={handleExpedicionChange}
                        ubicaciones={ubicaciones}
                        ubicacionesCargadas={!!ubicaciones[linea.codigoArticulo]}
                        iniciarEscaneo={iniciarEscaneo}
                        onExpedirDirecto={handleExpedirArticuloOptimizado}
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
            iniciarEscaneo={iniciarEscaneo}
          />
        )}

        <CameraModal
          showCamera={showCamera}
          setShowCamera={setShowCamera}
          cameras={cameras}
          selectedCamera={selectedCamera}
          setSelectedCamera={setSelectedCamera}
          handleScanSuccess={handleScanSuccess}
        />
      </Container>
      <Navbar />
    </Box>
  );
};

export default PedidosScreen;