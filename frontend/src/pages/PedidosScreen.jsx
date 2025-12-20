import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../helpers/api';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { Html5Qrcode } from 'html5-qrcode';
import { usePermissions } from '../PermissionsManager';
import '../styles/PedidosScreen.css';
import { 
  FaEllipsisV, FaCamera, FaQrcode, FaBarcode, FaCheck, FaTimes, 
  FaExclamationTriangle, FaChevronDown, FaSearch, FaCalendarAlt, 
  FaTruck, FaInfoCircle, FaSync, FaFilter, FaWeight, FaBox, 
  FaUser, FaPhone, FaExclamation, FaBell 
} from 'react-icons/fa';

// Custom hook para debounce
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  
  return debouncedValue;
};

// Función para normalizar unidades (para comparación)
const normalizarUnidad = (unidad) => {
  if (!unidad || unidad.trim() === '' || unidad === 'unidades' || unidad === 'unidad' || unidad === 'ud') {
    return 'unidades';
  }
  return unidad.toLowerCase().trim();
};

// Función para formatear unidades (convertida de hook a función normal)
const formatearUnidad = (cantidad, unidad) => {
  if (!cantidad && cantidad !== 0) return '0 ud';
  
  // Normalizar unidad para display
  let unidadDisplay = unidad;
  if (!unidadDisplay || unidadDisplay.trim() === '' || unidadDisplay === 'unidades') {
    unidadDisplay = 'ud';
  }
  
  let cantidadNum = typeof cantidad === 'string' ? parseFloat(cantidad) : cantidad;
  
  if (isNaN(cantidadNum)) return `${cantidad} ${unidadDisplay}`;
  
  const unidadesDecimales = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3'];
  const esUnidadDecimal = unidadesDecimales.includes(unidadDisplay.toLowerCase());
  
  if (!esUnidadDecimal) {
    cantidadNum = Math.round(cantidadNum);
  } else {
    cantidadNum = parseFloat(cantidadNum.toFixed(2));
  }
  
  const unidadesInvariables = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3'];
  const unidadLower = unidadDisplay.toLowerCase();
  
  if (unidadesInvariables.includes(unidadLower)) {
    return `${cantidadNum} ${unidadDisplay}`;
  }
  
  const pluralesIrregulares = {
    'ud': 'uds',
    'par': 'pares',
    'metro': 'metros',
    'pack': 'packs',
    'saco': 'sacos',
    'barra': 'barras',
    'caja': 'cajas',
    'rollo': 'rollos',
    'lata': 'latas',
    'bote': 'botes',
    'tubo': 'tubos',
    'unidad': 'unidades',
    'juego': 'juegos',
    'kit': 'kits',
    'paquete': 'paquetes',
    'cajetin': 'cajetines',
    'bidon': 'bidones',
    'palet': 'palets',
    'bobina': 'bobinas',
    'fardo': 'fardos',
    'cubeta': 'cubetas',
    'garrafa': 'garrafas',
    'tambor': 'tambores',
    'cubos': 'cubos',
    'pares': 'pares'
  };

  if (cantidadNum === 1) {
    if (unidadLower === 'unidad' || unidadLower === 'unidades' || unidadLower === 'ud') {
      return '1 unidad';
    }
    return `1 ${unidadDisplay}`;
  } else {
    if (unidadLower === 'unidad' || unidadLower === 'unidades' || unidadLower === 'ud') {
      return `${cantidadNum} unidades`;
    }
    
    if (pluralesIrregulares[unidadLower]) {
      return `${cantidadNum} ${pluralesIrregulares[unidadLower]}`;
    }
    
    const ultimaLetra = unidadDisplay.charAt(unidadDisplay.length - 1);
    const penultimaLetra = unidadDisplay.charAt(unidadDisplay.length - 2);
    
    if (['a', 'e', 'i', 'o', 'u'].includes(ultimaLetra)) {
      return `${cantidadNum} ${unidadDisplay}s`;
    } else {
      return `${cantidadNum} ${unidadDisplay}es`;
    }
  }
};

// Componente de carga mejorado
const LoadingSpinner = React.memo(({ message = "Cargando..." }) => (
  <div className="ps-loading-container">
    <div className="ps-spinner"></div>
    <p>{message}</p>
  </div>
));

// Componente de error mejorado
const ErrorMessage = React.memo(({ message, onRetry }) => (
  <div className="ps-error-message">
    <FaExclamationTriangle className="ps-error-icon" />
    <p>{message}</p>
    {onRetry && (
      <button onClick={onRetry} className="ps-btn-retry">
        <FaSync /> Reintentar
      </button>
    )}
  </div>
));

// Componente Modal de Detalles de Artículo - VERSIÓN CORREGIDA
const DetallesArticuloModal = React.memo(({ 
  detalles, 
  linea, 
  pedido, 
  onClose, 
  onExpedirVariante,
  canPerformActions
}) => {
  const [ubicacionesPorDetalle, setUbicacionesPorDetalle] = useState({});
  const [selecciones, setSelecciones] = useState({});
  const [procesando, setProcesando] = useState(false);
  const [cargandoUbicaciones, setCargandoUbicaciones] = useState(true);
  const [erroresCarga, setErroresCarga] = useState({});
  const abortControllers = useRef({});

  // Cancelar todas las peticiones al desmontar o cambiar detalles
  useEffect(() => {
    return () => {
      Object.entries(abortControllers.current).forEach(([key, controller]) => {
        if (controller) {
          controller.abort();
          delete abortControllers.current[key];
        }
      });
    };
  }, [detalles]);

  // 🔥 CORRECCIÓN CRÍTICA: Cargar stock con filtros específicos por color y talla
  useEffect(() => {
    const detallesConStock = detalles.filter(detalle => 
      parseFloat(detalle.cantidadPendiente) > 0
    );

    if (!detallesConStock || detallesConStock.length === 0) {
      setCargandoUbicaciones(false);
      return;
    }

    const cargarUbicaciones = async () => {
      setCargandoUbicaciones(true);
      setErroresCarga({});
      const resultados = {};
      const nuevosErrores = {};

      for (const detalle of detallesConStock) {
        const key = `${detalle.codigoArticulo}-${detalle.codigoColor || 'SIN_COLOR'}-${detalle.codigoTalla || 'SIN_TALLA'}`;
        
        // Cancelar petición anterior si existe
        if (abortControllers.current[key]) {
          abortControllers.current[key].abort();
        }
        
        // Crear nuevo abort controller para esta petición
        abortControllers.current[key] = new AbortController();
        
        try {
          console.log('[MODAL DETALLES] Solicitando stock para:', {
            articulo: detalle.codigoArticulo,
            color: detalle.codigoColor || 'Sin color',
            talla: detalle.codigoTalla || 'Sin talla',
            key: key
          });

          // 🔥 USAR PARÁMETROS ESPECÍFICOS PARA CADA VARIANTE
          const params = {
            codigoArticulo: detalle.codigoArticulo
          };

          // Solo agregar color si tiene valor
          if (detalle.codigoColor && detalle.codigoColor !== '' && detalle.codigoColor !== 'null') {
            params.codigoColor = detalle.codigoColor;
          }

          // Solo agregar talla si tiene valor
          if (detalle.codigoTalla && detalle.codigoTalla !== '' && detalle.codigoTalla !== 'null') {
            params.codigoTalla = detalle.codigoTalla;
          }

          const response = await API.get(
            '/stock/por-variante',
            {
              headers: getAuthHeader(),
              params: params,
              signal: abortControllers.current[key].signal
            }
          );

          resultados[key] = Array.isArray(response.data) ? response.data : [];
          
          console.log(`[MODAL DETALLES] Respuesta para ${key}:`, {
            ubicacionesEncontradas: resultados[key].length,
            ubicaciones: resultados[key].map(u => ({
              almacen: u.CodigoAlmacen,
              ubicacion: u.Ubicacion,
              color: u.CodigoColor_,
              talla: u.CodigoTalla01_,
              cantidad: u.Cantidad
            }))
          });

        } catch (error) {
          if (error.name === 'CanceledError') {
            console.log('Petición cancelada:', key);
          } else {
            console.error('Error al consultar stock:', error);
            nuevosErrores[key] = error.message;
            resultados[key] = [];
          }
        }
      }

      setUbicacionesPorDetalle(resultados);
      setErroresCarga(nuevosErrores);
      setCargandoUbicaciones(false);
    };

    cargarUbicaciones();

    // Cleanup: abortar todas las peticiones al desmontar
    return () => {
      Object.values(abortControllers.current).forEach(controller => {
        if (controller) controller.abort();
      });
    };
  }, [detalles]);

  const detallesConPendientes = useMemo(() => 
    detalles.filter(detalle => parseFloat(detalle.cantidadPendiente) > 0),
    [detalles]
  );

  // 🔥 FUNCIÓN PARA FORMATAR INFORMACIÓN DE UBICACIÓN EN EL MODAL
  const formatearInfoUbicacionModal = useCallback((ubicacion) => {
    if (ubicacion.ubicacion === "Zona descarga") {
      return "Stock disponible";
    }
    
    const stock = parseFloat(ubicacion.Cantidad);
    if (isNaN(stock)) return "Stock no disponible";
    
    return `${formatearUnidad(stock, ubicacion.UnidadMedida)}`;
  }, []);

  // 🔥 FUNCIÓN PARA MOSTRAR TEXTO DE UBICACIÓN EN EL SELECT
  const getTextoOpcionUbicacion = useCallback((ubicacion) => {
    let texto = `${ubicacion.CodigoAlmacen} - ${ubicacion.Ubicacion}`;
    
    if (ubicacion.Partida && ubicacion.Partida.trim() !== '') {
      texto += ` (${ubicacion.Partida})`;
    }
    
    texto += ` - Stock: ${formatearInfoUbicacionModal(ubicacion)}`;
    
    // 🔥 MOSTRAR COLOR Y TALLA DE LA UBICACIÓN (PARA DEBUG)
    if (ubicacion.CodigoColor_ || ubicacion.CodigoTalla01_) {
      const infoVariante = [];
      if (ubicacion.CodigoColor_) infoVariante.push(`Color: ${ubicacion.CodigoColor_}`);
      if (ubicacion.CodigoTalla01_) infoVariante.push(`Talla: ${ubicacion.CodigoTalla01_}`);
      if (infoVariante.length > 0) {
        texto += ` [${infoVariante.join(', ')}]`;
      }
    }
    
    return texto;
  }, [formatearInfoUbicacionModal]);

  // Guardar selección de ubicación y cantidad
  const handleCambioSeleccion = useCallback((detalleKey, field, value) => {
    setSelecciones((prev) => ({
      ...prev,
      [detalleKey]: {
        ...prev[detalleKey],
        [field]: value,
      },
    }));
  }, []);

  // Confirmar expedición de una sublínea
  const handleExpedir = useCallback(async (detalle) => {
    const detalleKey = `${detalle.codigoArticulo}-${detalle.codigoColor || 'SIN_COLOR'}-${detalle.codigoTalla || 'SIN_TALLA'}`;
    const seleccion = selecciones[detalleKey];

    if (!seleccion || !seleccion.ubicacion || !seleccion.cantidad) {
      alert("Debes seleccionar ubicación y cantidad.");
      return;
    }

    const cantidad = parseFloat(seleccion.cantidad);
    if (cantidad <= 0) {
      alert("La cantidad debe ser mayor a cero.");
      return;
    }

    if (cantidad > detalle.cantidadPendiente) {
      alert(`No puedes expedir más de ${detalle.cantidadPendiente} unidades (pendientes para esta variante).`);
      return;
    }

    setProcesando(true);
    
    try {
      const ubicaciones = ubicacionesPorDetalle[detalleKey] || [];
      const ubicacionSeleccionada = ubicaciones.find(ubic => ubic.Ubicacion === seleccion.ubicacion);
      
      if (!ubicacionSeleccionada) {
        alert("Error: No se encontró la ubicación seleccionada.");
        setProcesando(false);
        return;
      }

      console.log('[MODAL DETALLES] Expediendo variante:', {
        articulo: detalle.codigoArticulo,
        color: detalle.codigoColor,
        talla: detalle.codigoTalla,
        cantidad: cantidad,
        ubicacion: seleccion.ubicacion,
        almacen: ubicacionSeleccionada.CodigoAlmacen,
        ubicacionData: ubicacionSeleccionada
      });

      await onExpedirVariante({
        articulo: detalle.codigoArticulo,
        color: detalle.codigoColor,
        talla: detalle.codigoTalla,
        cantidad: cantidad,
        ubicacion: seleccion.ubicacion,
        almacen: ubicacionSeleccionada.CodigoAlmacen,
        partida: ubicacionSeleccionada.Partida || '',
        unidadMedida: ubicacionSeleccionada.UnidadMedida || linea.unidadBase,
        movPosicionLinea: linea.movPosicionLinea
      });

      alert("Expedición confirmada ✅");
      
      // Limpiar la selección después de expedir
      handleCambioSeleccion(detalleKey, "cantidad", "");
    } catch (error) {
      console.error('Error al expedir:', error);
      alert("Error al expedir: " + (error.response?.data?.mensaje || error.message));
    } finally {
      setProcesando(false);
    }
  }, [selecciones, ubicacionesPorDetalle, onExpedirVariante, linea, handleCambioSeleccion]);

  if (!detalles || detallesConPendientes.length === 0) {
    return (
      <div className="ps-modal-detalles" onClick={onClose}>
        <div className="ps-modal-contenido ps-modal-detalles-contenido" onClick={e => e.stopPropagation()}>
          <button className="ps-cerrar-modal" onClick={onClose}><FaTimes /></button>
          <h3 className="ps-modal-titulo">Artículo: {linea.descripcionArticulo}</h3>
          <div className="ps-modal-no-variantes">
            <p>No hay variantes con unidades pendientes para este artículo.</p>
            <button className="ps-btn-cerrar-modal" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-modal-detalles" onClick={onClose}>
      <div className="ps-modal-contenido ps-modal-detalles-contenido" onClick={e => e.stopPropagation()}>
        <button className="ps-cerrar-modal" onClick={onClose}><FaTimes /></button>
        <h3 className="ps-modal-titulo">Artículo: {linea.descripcionArticulo}</h3>
        <div className="ps-modal-subtitulo">
          <span>Código: {linea.codigoArticulo}</span>
          <span>Unidad: {linea.unidadBase || 'ud'}</span>
        </div>

        {cargandoUbicaciones ? (
          <LoadingSpinner message="Cargando información de stock por variante..." />
        ) : (
          <div className="ps-tabla-detalles-container">
            <table className="ps-tabla-detalles">
              <thead>
                <tr>
                  <th>Color</th>
                  <th>Talla</th>
                  <th>Pendiente</th>
                  <th>Ubicación</th>
                  <th>Cantidad</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {detallesConPendientes.map((detalle, index) => {
                  const key = `${detalle.codigoArticulo}-${detalle.codigoColor || 'SIN_COLOR'}-${detalle.codigoTalla || 'SIN_TALLA'}`;
                  const ubicaciones = ubicacionesPorDetalle[key] || [];
                  const seleccion = selecciones[key] || {};
                  const error = erroresCarga[key];

                  console.log(`[MODAL DETALLES] Renderizando fila ${index}:`, {
                    key,
                    ubicaciones: ubicaciones.length,
                    detalle
                  });

                  return (
                    <tr key={key} className={ubicaciones.length === 0 ? 'ps-sin-stock-row' : ''}>
                      <td>{detalle.colorNombre || detalle.codigoColor || 'Sin color'}</td>
                      <td>{detalle.descripcionTalla || detalle.codigoTalla || 'Sin talla'}</td>
                      <td>{formatearUnidad(detalle.cantidadPendiente, linea.unidadBase)}</td>
                      <td>
                        {error ? (
                          <ErrorMessage message="Error al cargar ubicaciones" />
                        ) : ubicaciones.length > 0 ? (
                          <div className="ps-ubicacion-select-container">
                            <select
                              value={seleccion.ubicacion || ""}
                              onChange={(e) => handleCambioSeleccion(key, "ubicacion", e.target.value)}
                              disabled={!canPerformActions}
                              className="ps-ubicacion-select-detalle"
                            >
                              <option value="">Selecciona ubicación</option>
                              {ubicaciones.map((ubic, idx) => (
                                <option key={`${ubic.CodigoAlmacen}-${ubic.Ubicacion}-${ubic.Partida || 'no-partida'}-${idx}`}
                                        value={ubic.Ubicacion}>
                                  {getTextoOpcionUbicacion(ubic)}
                                </option>
                              ))}
                            </select>
                            <div className="ps-select-arrow"><FaChevronDown /></div>
                          </div>
                        ) : (
                          <div className="ps-sin-stock-detalle">
                            <FaExclamationTriangle className="ps-sin-stock-icon" />
                            <span>Sin stock disponible para esta variante</span>
                            <div className="ps-sin-stock-info">
                              (Color: {detalle.codigoColor || 'N/A'}, Talla: {detalle.codigoTalla || 'N/A'})
                            </div>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="ps-cantidad-input-container-detalle">
                          <input
                            type="number"
                            value={seleccion.cantidad || ""}
                            min={0}
                            max={detalle.cantidadPendiente}
                            step={linea.unidadBase === 'kg' ? '0.01' : '1'}
                            onChange={(e) => {
                              let nuevaCantidad = parseFloat(e.target.value) || 0;
                              // Limitar a las unidades pendientes
                              nuevaCantidad = Math.min(nuevaCantidad, detalle.cantidadPendiente);
                              handleCambioSeleccion(key, "cantidad", nuevaCantidad.toString());
                            }}
                            disabled={!canPerformActions || ubicaciones.length === 0 || !!error || detalle.cantidadPendiente <= 0}
                            placeholder="0"
                            className="ps-cantidad-input-detalle"
                          />
                          <span className="ps-unidad-info">{linea.unidadBase || 'ud'}</span>
                        </div>
                      </td>
                      <td>
                        <button
                          className="ps-btn-expedir-variante"
                          onClick={() => handleExpedir(detalle)}
                          disabled={
                            !canPerformActions || 
                            !seleccion.ubicacion || 
                            !seleccion.cantidad || 
                            parseFloat(seleccion.cantidad) <= 0 || 
                            parseFloat(seleccion.cantidad) > detalle.cantidadPendiente ||
                            procesando || 
                            !!error ||
                            detalle.cantidadPendiente <= 0 ||
                            ubicaciones.length === 0
                          }
                        >
                          {procesando ? "Procesando..." : "Expedir"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="ps-modal-actions">
          <button 
            className="ps-btn-cerrar-modal"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
});

// Componente Línea de Pedido - VERSIÓN OPTIMIZADA
const LineaPedido = React.memo(({ 
  linea, 
  pedido, 
  expediciones, 
  handleExpedicionChange, 
  ubicaciones,
  ubicacionesCargadas,
  iniciarEscaneo,
  abrirModalDetalles,
  canPerformActions,
  isScanning,
  isProcesando
}) => {
  const [isUpdatingExpedicion, setIsUpdatingExpedicion] = useState(false);
  
  const ubicacionesConStock = useMemo(() => {
    // Si las ubicaciones no están cargadas, retornar array vacío
    if (!ubicacionesCargadas) {
      return [];
    }
    
    const ubicacionesArticulo = ubicaciones[linea.codigoArticulo] || [];
    
    let ubicacionesConStockReal = ubicacionesArticulo.filter(ubi => {
      const tieneStock = parseFloat(ubi.unidadSaldo) > 0;
      
      // Normalizar unidades para comparación
      const unidadUbicacionNormalizada = normalizarUnidad(ubi.unidadMedida);
      const unidadPedidoNormalizada = normalizarUnidad(linea.unidadPedido);
      const unidadBaseNormalizada = normalizarUnidad(linea.unidadBase);
      
      const unidadCoincide = 
        unidadUbicacionNormalizada === unidadPedidoNormalizada || 
        unidadUbicacionNormalizada === unidadBaseNormalizada;
      
      const noEsZonaDescarga = ubi.ubicacion !== "Zona descarga";
      
      return tieneStock && unidadCoincide && noEsZonaDescarga;
    });

    // Si no hay ubicaciones con stock, mostrar todas las disponibles (incluyendo sin stock)
    if (ubicacionesConStockReal.length === 0) {
      ubicacionesConStockReal = ubicacionesArticulo.filter(ubi => {
        const unidadUbicacionNormalizada = normalizarUnidad(ubi.unidadMedida);
        const unidadPedidoNormalizada = normalizarUnidad(linea.unidadPedido);
        const unidadBaseNormalizada = normalizarUnidad(linea.unidadBase);
        
        const unidadCoincide = 
          unidadUbicacionNormalizada === unidadPedidoNormalizada || 
          unidadUbicacionNormalizada === unidadBaseNormalizada;
        
        const noEsZonaDescarga = ubi.ubicacion !== "Zona descarga";
        
        return unidadCoincide && noEsZonaDescarga;
      });
    }

    // Si aún no hay ubicaciones, usar zona descarga
    if (ubicacionesConStockReal.length === 0) {
      ubicacionesConStockReal = [{
        codigoAlmacen: linea.codigoAlmacen || "CEN",
        ubicacion: "Zona descarga",
        partida: null,
        unidadSaldo: Infinity,
        unidadMedida: linea.unidadPedido || linea.unidadBase || 'ud',
        descripcionUbicacion: "Stock disponible para expedición directa"
      }];
    }

    // Ordenar por stock descendente
    return ubicacionesConStockReal.sort((a, b) => {
      const stockA = a.unidadSaldo === Infinity ? 999999 : parseFloat(a.unidadSaldo);
      const stockB = b.unidadSaldo === Infinity ? 999999 : parseFloat(b.unidadSaldo);
      return stockB - stockA;
    });
  }, [ubicaciones, ubicacionesCargadas, linea.codigoArticulo, linea.unidadPedido, linea.codigoAlmacen, linea.unidadBase]);

  const key = linea.movPosicionLinea;
  const expedicion = expediciones[key] || {
    almacen: ubicacionesConStock[0]?.codigoAlmacen || '',
    ubicacion: ubicacionesConStock[0]?.ubicacion || '',
    partida: ubicacionesConStock[0]?.partida || null,
    unidadMedida: ubicacionesConStock[0]?.unidadMedida || linea.unidadPedido,
    cantidad: '0'
  };
  
  // 🔥 CORRECCIÓN: Verificar que la expedición actual coincide con las ubicaciones disponibles
  useEffect(() => {
    if (ubicacionesConStock.length === 0 || isUpdatingExpedicion) return;

    const ubicacionActual = ubicacionesConStock.find(
      ubi => ubi.ubicacion === expedicion.ubicacion && ubi.codigoAlmacen === expedicion.almacen
    );
    
    if (!ubicacionActual) {
      setIsUpdatingExpedicion(true);
      
      // Usar timeout para evitar actualización inmediata en el mismo ciclo
      const timeoutId = setTimeout(() => {
        const primeraUbicacion = ubicacionesConStock[0];
        
        if (primeraUbicacion) {
          handleExpedicionChange(key, 'ubicacion', primeraUbicacion.ubicacion);
          handleExpedicionChange(key, 'almacen', primeraUbicacion.codigoAlmacen);
          handleExpedicionChange(key, 'partida', primeraUbicacion.partida || '');
          handleExpedicionChange(key, 'unidadMedida', primeraUbicacion.unidadMedida || linea.unidadPedido);
          
          const unidadesPendientes = parseFloat(linea.unidadesPendientes) || 0;
          let nuevaCantidad = 0;
          
          if (primeraUbicacion.ubicacion === "Zona descarga") {
            nuevaCantidad = unidadesPendientes;
          } else {
            const stockDisponible = parseFloat(primeraUbicacion.unidadSaldo) || 0;
            nuevaCantidad = Math.min(unidadesPendientes, stockDisponible);
          }
          
          handleExpedicionChange(key, 'cantidad', nuevaCantidad.toString());
        }
        
        setIsUpdatingExpedicion(false);
      }, 0);

      return () => clearTimeout(timeoutId);
    }
  }, [ubicacionesConStock, expedicion.ubicacion, expedicion.almacen, handleExpedicionChange, key, linea.unidadesPendientes, linea.unidadPedido, isUpdatingExpedicion]);

  const formatted = useMemo(() => {
    const unidadesPendientes = parseFloat(linea.unidadesPendientes) || 0;
    const unidadVenta = linea.unidadBase || 'ud';
    const unidadStock = linea.unidadAlternativa || 'ud';
    const factor = parseFloat(linea.factorConversion) || 1;
    
    const equivalencia = unidadesPendientes * factor;
    
    const mostrarEquivalencia = factor !== 1 || unidadStock !== unidadVenta;
    
    return {
      pendiente: formatearUnidad(unidadesPendientes, unidadVenta),
      equivalencia: mostrarEquivalencia 
        ? formatearUnidad(equivalencia, unidadStock) 
        : null
    };
  }, [linea.unidadesPendientes, linea.unidadBase, linea.unidadAlternativa, linea.factorConversion]);
  
  const infoPeso = useMemo(() => {
    const pesoUnitario = parseFloat(linea.pesoUnitario) || 0;
    const unidadesPendientes = parseFloat(linea.unidadesPendientes) || 0;
    const pesoTotalLinea = pesoUnitario * unidadesPendientes;
    
    return {
      pesoUnitario,
      pesoTotalLinea,
      tienePeso: pesoUnitario > 0
    };
  }, [linea.pesoUnitario, linea.unidadesPendientes]);
  
  const validarCantidad = useCallback((value) => {
    if (value === '') return '0';
    
    let newValue = value.replace(/[^\d.]/g, '');
    
    const parts = newValue.split('.');
    if (parts.length > 2) {
      newValue = parts[0] + '.' + parts.slice(1).join('');
    }
    
    const cantidad = parseFloat(newValue) || 0;
    const unidadesPendientes = parseFloat(linea.unidadesPendientes) || 0;
    
    const ubicacionSeleccionada = ubicacionesConStock.find(
      ubi => ubi.ubicacion === expedicion.ubicacion && ubi.codigoAlmacen === expedicion.almacen
    );
    
    let maxPermitido = unidadesPendientes;
    
    if (ubicacionSeleccionada && 
        ubicacionSeleccionada.ubicacion !== "Zona descarga" && 
        ubicacionSeleccionada.unidadSaldo !== Infinity) {
      const stockDisponible = parseFloat(ubicacionSeleccionada.unidadSaldo) || 0;
      maxPermitido = Math.min(unidadesPendientes, stockDisponible);
    }
    
    if (cantidad > maxPermitido) {
      return maxPermitido.toString();
    }
    
    return newValue;
  }, [expedicion.ubicacion, expedicion.almacen, linea.unidadesPendientes, ubicacionesConStock]);
  
  const handleCambioCantidad = useCallback((e) => {
    const nuevaCantidad = validarCantidad(e.target.value);
    handleExpedicionChange(
      key, 
      'cantidad', 
      nuevaCantidad
    );
  }, [validarCantidad, handleExpedicionChange, key]);
  
  const handleCambioUbicacion = useCallback((e) => {
    const nuevaUbicacion = e.target.value;
    
    const ubicacionSeleccionada = ubicacionesConStock.find(
      ubi => ubi.ubicacion === nuevaUbicacion
    );
    
    if (!ubicacionSeleccionada) return;
    
    let nuevaCantidad = 0;
    const unidadesPendientes = parseFloat(linea.unidadesPendientes) || 0;
    
    if (ubicacionSeleccionada.ubicacion === "Zona descarga") {
      nuevaCantidad = unidadesPendientes;
    } else {
      const stockDisponible = parseFloat(ubicacionSeleccionada.unidadSaldo) || 0;
      nuevaCantidad = Math.min(unidadesPendientes, stockDisponible);
    }
    
    handleExpedicionChange(key, 'ubicacion', nuevaUbicacion);
    handleExpedicionChange(key, 'almacen', ubicacionSeleccionada.codigoAlmacen);
    handleExpedicionChange(key, 'partida', ubicacionSeleccionada.partida || '');
    handleExpedicionChange(key, 'unidadMedida', ubicacionSeleccionada.unidadMedida || linea.unidadPedido);
    handleExpedicionChange(key, 'cantidad', nuevaCantidad.toString());
  }, [handleExpedicionChange, key, linea.unidadesPendientes, linea.unidadPedido, ubicacionesConStock]);
  
  const formatearInfoStock = useCallback((ubicacion) => {
    if (ubicacion.ubicacion === "Zona descarga") {
      return "Stock disponible";
    }
    
    const stock = parseFloat(ubicacion.unidadSaldo);
    if (isNaN(stock)) return "Stock no disponible";
    
    return formatearUnidad(stock, ubicacion.unidadMedida);
  }, []);

  return (
    <>
      <tr className="ps-desktop-view">
        <td className="ps-td-izquierda">
          <div className="ps-codigo-articulo">{linea.codigoArticulo}</div>
          <div className="ps-codigo-alternativo">{linea.codigoAlternativo}</div>
        </td>
        <td className="ps-td-izquierda">
          <div className="ps-descripcion-articulo">{linea.descripcionArticulo}</div>
          <div className="ps-detalles-articulo">{linea.descripcion2Articulo}</div>
        </td>
        <td className="ps-td-centrado">
          <div className="ps-pendiente-container">
            {linea.unidadesPendientes > 0 ? (<>
                <span className="ps-pendiente-valor">{formatted.pendiente}</span>
                {formatted.equivalencia && (
                  <div className="ps-equivalencia-stock">
                    {formatted.equivalencia}
                  </div>
                )}
                {linea.detalles && linea.movPosicionLinea && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirModalDetalles(linea.detalles, linea, pedido);
                    }}
                    className="ps-btn-detalles"
                  >
                    <FaInfoCircle />
                  </button>
                )}
              </>) : (
              <span className="ps-completada-badge">COMPLETADA</span>
            )}
          </div>
        </td>
        <td className="ps-td-centrado">
          <div className="ps-peso-linea">
            {infoPeso.tienePeso ? (<>
                <div className="ps-peso-unitario">
                  <FaWeight /> {infoPeso.pesoUnitario.toFixed(2)} kg/u
                </div>
                <div className="ps-peso-total-linea">
                  {infoPeso.pesoTotalLinea.toFixed(2)} kg
                </div>
              </>) : (
              <span className="ps-sin-peso">Sin peso</span>
            )}
          </div>
        </td>
        <td>
          <div className="ps-ubicacion-select-container">
            <select
              value={expedicion.ubicacion}
              onChange={handleCambioUbicacion}
              className={`ps-ubicacion-select ${expedicion.ubicacion === "Zona descarga" ? 'ps-zona-descarga' : ''}`}
              disabled={!canPerformActions || isProcesando || isUpdatingExpedicion || !ubicacionesCargadas}
            >
              {!ubicacionesCargadas ? (
                <option value="">Cargando ubicaciones...</option>
              ) : ubicacionesConStock.length === 0 ? (
                <option value="">Sin ubicaciones disponibles</option>
              ) : (
                ubicacionesConStock.map((ubicacion, locIndex) => (
                  <option 
                    key={`${ubicacion.codigoAlmacen}-${ubicacion.ubicacion}-${ubicacion.partida || 'no-partida'}-${locIndex}`}
                    value={ubicacion.ubicacion}
                    className={ubicacion.ubicacion === "Zona descarga" ? 'ps-zona-descarga-option' : ''}
                  >
                    {ubicacion.codigoAlmacen} - {ubicacion.ubicacion} 
                    {ubicacion.partida ? ` (${ubicacion.partida})` : ''} - 
                    {formatearInfoStock(ubicacion)}
                  </option>
                ))
              )}
            </select>
            <div className="ps-select-arrow"><FaChevronDown /></div>
          </div>
        </td>
        <td>
          <div className="ps-cantidad-container">
            <input
              type="text"
              value={expedicion.cantidad}
              onChange={handleCambioCantidad}
              className={expedicion.ubicacion === "Zona descarga" ? 'ps-zona-descarga-input' : ''}
              disabled={!canPerformActions || isProcesando || isUpdatingExpedicion || !ubicacionesCargadas}
              placeholder="0"
            />
            <div className="ps-unidad-info">{linea.unidadBase || 'ud'}</div>
          </div>
        </td>
        <td className="ps-td-centrado">
          <button
            className="ps-btn-expedir"
            onClick={(e) => {
              e.stopPropagation();
              if (canPerformActions) iniciarEscaneo(linea, pedido);
            }}
            disabled={!canPerformActions || parseFloat(expedicion.cantidad) <= 0 || isScanning || isProcesando || isUpdatingExpedicion || !ubicacionesCargadas}
          >
            <FaCamera /> 
            {isProcesando ? 'Procesando...' : (isScanning ? 'Procesando...' : 'Escanear')}
          </button>
        </td>
      </tr>
      <tr className="ps-mobile-view">
        <td colSpan="7">
          <div className="ps-linea-mobile">
            <div className="ps-mobile-header">
              <div className="ps-mobile-articulo">
                <div className="ps-codigo-articulo">{linea.codigoArticulo}</div>
                <div className="ps-codigo-alternativo">{linea.codigoAlternativo}</div>
              </div>
              <div className="ps-mobile-descripcion">
                <div className="ps-descripcion-articulo">{linea.descripcionArticulo}</div>
              </div>
            </div>
            <div className="ps-mobile-details">
              <div className="ps-detail-item">
                <span className="ps-detail-label">Pendiente:</span>
                <div className="ps-detail-value">
                  <span>{formatted.pendiente}</span>
                  {linea.detalles && linea.movPosicionLinea && (
                    <button 
                      className="ps-btn-detalles"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirModalDetalles(linea.detalles, linea, pedido);
                      }}
                    >
                      <FaInfoCircle />
                    </button>
                  )}
                </div>
              </div>
              <div className="ps-detail-item">
                <span className="ps-detail-label">Peso:</span>
                <div className="ps-detail-value">
                  {infoPeso.tienePeso ? (<>
                      <span>{infoPeso.pesoTotalLinea.toFixed(2)} kg</span>
                      <small>({infoPeso.pesoUnitario.toFixed(2)} kg/u)</small>
                    </>) : (
                    <span>Sin peso</span>
                  )}
                </div>
              </div>
              <div className="ps-detail-item">
                <span className="ps-detail-label">Ubicación:</span>
                <div className="ps-ubicacion-select-container">
                  <select
                    value={expedicion.ubicacion}
                    onChange={handleCambioUbicacion}
                    className={`ps-ubicacion-select ${expedicion.ubicacion === "Zona descarga" ? 'ps-zona-descarga' : ''}`}
                    disabled={!canPerformActions || isProcesando || isUpdatingExpedicion || !ubicacionesCargadas}
                  >
                    {!ubicacionesCargadas ? (
                      <option value="">Cargando ubicaciones...</option>
                    ) : ubicacionesConStock.length === 0 ? (
                      <option value="">Sin ubicaciones disponibles</option>
                    ) : (
                      ubicacionesConStock.map((ubicacion, locIndex) => (
                        <option 
                          key={`${ubicacion.codigoAlmacen}-${ubicacion.ubicacion}-${ubicacion.partida || 'no-partida'}-${locIndex}`}
                          value={ubicacion.ubicacion}
                        >
                          {ubicacion.codigoAlmacen} - {ubicacion.ubicacion} 
                          {ubicacion.partida ? ` (${ubicacion.partida})` : ''} - 
                          {formatearInfoStock(ubicacion)}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="ps-select-arrow"><FaChevronDown /></div>
                </div>
              </div>
              <div className="ps-detail-item">
                <span className="ps-detail-label">Cantidad:</span>
                <div className="ps-cantidad-container">
                  <input
                    type="text"
                    value={expedicion.cantidad}
                    onChange={handleCambioCantidad}
                    className={expedicion.ubicacion === "Zona descarga" ? 'ps-zona-descarga-input' : ''}
                    disabled={!canPerformActions || isProcesando || isUpdatingExpedicion || !ubicacionesCargadas}
                    placeholder="0"
                  />
                  <div className="ps-unidad-info">{linea.unidadBase || 'ud'}</div>
                </div>
              </div>
              <div className="ps-detail-item ps-acciones">
                <button
                  className="ps-btn-expedir"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canPerformActions) iniciarEscaneo(linea, pedido);
                  }}
                  disabled={!canPerformActions || parseFloat(expedicion.cantidad) <= 0 || isScanning || isProcesando || isUpdatingExpedicion || !ubicacionesCargadas}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <FaCamera /> 
                  {isProcesando ? 'Procesando...' : (isScanning ? 'Procesando...' : 'Escanear')}
                </button>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
});

// Componente Tarjeta de Pedido - VERSIÓN OPTIMIZADA
const PedidoCard = React.memo(({ 
  pedido, 
  togglePedidoView, 
  pedidoViewModes, 
  generarAlbaranParcial, 
  generandoAlbaran, 
  ubicaciones,
  expediciones,
  handleExpedicionChange,
  iniciarEscaneo,
  abrirModalDetalles,
  canPerformActions,
  canPerformActionsInPedidos,
  isScanning,
  onActualizarVoluminoso,
  lineasProcesando,
  onCargarUbicaciones
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [actualizandoVoluminoso, setActualizandoVoluminoso] = useState(false);
  const [ubicacionesCargando, setUbicacionesCargando] = useState(false);
  
  const tieneLineasParciales = useMemo(() => {
    return pedido.articulos.some(articulo => {
      const unidadesExpedidas = parseFloat(articulo.unidadesPedidas) - parseFloat(articulo.unidadesPendientes);
      return unidadesExpedidas > 0 && unidadesExpedidas < parseFloat(articulo.unidadesPedidas);
    });
  }, [pedido.articulos]);

  const estaCompletamenteExpedido = useMemo(() => {
    return pedido.articulos.every(articulo => 
      parseFloat(articulo.unidadesPendientes) === 0
    );
  }, [pedido.articulos]);

  const esParcialBackend = pedido.Estado === 4;
  const esServidoBackend = pedido.Estado === 2;
  
  const parcial = esParcialBackend || (tieneLineasParciales && !esServidoBackend);
  const completo = esServidoBackend || estaCompletamenteExpedido;

  const mostrarOpcionParcial = parcial && !completo && canPerformActionsInPedidos;

  const handleToggleVoluminoso = async () => {
    if (!canPerformActionsInPedidos || actualizandoVoluminoso) return;
    
    setActualizandoVoluminoso(true);
    try {
      await onActualizarVoluminoso(pedido, !pedido.EsVoluminoso);
    } catch (error) {
      console.error('Error al actualizar estado voluminoso:', error);
    } finally {
      setActualizandoVoluminoso(false);
    }
  };

  // Cargar ubicaciones cuando se despliegue el pedido
  useEffect(() => {
    if (pedidoViewModes[pedido.numeroPedido] === 'show' && onCargarUbicaciones) {
      const articulos = pedido.articulos.map(art => art.codigoArticulo);
      onCargarUbicaciones(articulos);
    }
  }, [pedidoViewModes[pedido.numeroPedido], pedido.numeroPedido, pedido.articulos, onCargarUbicaciones]);

  return (
    <div className={`ps-pedido-card ${parcial ? 'ps-pedido-parcial' : ''} ${pedido.EsVoluminoso ? 'ps-pedido-voluminoso' : ''}`}>
      <div className="ps-pedido-header">
        <div className="ps-pedido-header-left">
          <div className="ps-pedido-info-top">
            <span className="ps-numero-pedido">#{pedido.numeroPedido}</span>
            <span className="ps-fecha-pedido">{new Date(pedido.fechaPedido).toLocaleDateString()}</span>
            <span className="ps-fecha-entrega">
              Entrega: {pedido.fechaEntrega ? new Date(pedido.fechaEntrega).toLocaleDateString() : 'Sin fecha'}
            </span>
            
            {/* ✅ Estado del pedido usando la columna Status */}
            <span className={`ps-status-pedido ps-status-${pedido.Status?.toLowerCase() || 'revision'}`}>
              {pedido.Status || 'Revisión'}
            </span>
            
            {pedido.PesoTotal > 0 && (
              <span className="ps-peso-total">
                <FaWeight /> {pedido.PesoTotal.toFixed(2)} kg
              </span>
            )}
            
            {/* ✅ Indicador voluminoso más visible */}
            {pedido.EsVoluminoso && (
              <span className="ps-voluminoso-badge ps-voluminoso-badge-prominente">
                <FaExclamation /> VOLUMINOSO
              </span>
            )}
          </div>
          <div className="ps-cliente-info">
            <span className="ps-cliente">{pedido.razonSocial}</span>
          </div>
        </div>
        
        <div className="ps-pedido-header-right">
          <div className="ps-pedido-actions">
            <button 
              className="ps-btn-menu"
              onClick={() => setShowMenu(!showMenu)}
            >
              <FaEllipsisV />
            </button>
            
            {showMenu && (
              <div className="ps-dropdown-menu">
                {canPerformActionsInPedidos && (
                  <button 
                    onClick={() => {
                      handleToggleVoluminoso();
                      setShowMenu(false);
                    }}
                    className="ps-menu-item"
                    disabled={actualizandoVoluminoso}
                  >
                    {actualizandoVoluminoso ? 'Actualizando...' : 
                     pedido.EsVoluminoso ? '❌ Desmarcar Voluminoso' : '⚠️ Marcar como Voluminoso'}
                  </button>
                )}
                {mostrarOpcionParcial && (
                  <button 
                    onClick={() => {
                      generarAlbaranParcial(pedido);
                      setShowMenu(false);
                    }}
                    className="ps-menu-item"
                    disabled={generandoAlbaran}
                  >
                    <FaCheck /> {generandoAlbaran ? 'Procesando...' : 'Generar Albarán Parcial'}
                  </button>
                )}
                <button 
                    className="ps-menu-item"
                    onClick={() => {
                      togglePedidoView(pedido.numeroPedido);
                      setShowMenu(false);
                    }}
                >
                  <FaEllipsisV /> 
                  {pedidoViewModes[pedido.numeroPedido] === 'show' ? ' Ocultar líneas y detalles' : ' Mostrar líneas y detalles'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {pedidoViewModes[pedido.numeroPedido] === 'show' && (<>
          <div className="ps-pedido-details">
            <div className="ps-peso-voluminoso-info">
              <div className="ps-peso-info">
                <strong><FaWeight /> Peso total estimado:</strong> {pedido.PesoTotal ? `${pedido.PesoTotal.toFixed(2)} kg` : '0 kg'}
              </div>
              <div className="ps-voluminoso-info">
                <strong><FaBox /> Pedido voluminoso:</strong> 
                <span className={`ps-voluminoso-estado ${pedido.EsVoluminoso ? 'activo' : 'inactivo'}`}>
                  {pedido.EsVoluminoso ? 'SÍ' : 'NO'}
                </span>
                {canPerformActionsInPedidos && (
                  <button 
                    className={`ps-btn-voluminoso ${pedido.EsVoluminoso ? 'activo' : ''}`}
                    onClick={handleToggleVoluminoso}
                    disabled={actualizandoVoluminoso}
                  >
                    {actualizandoVoluminoso ? '...' : (pedido.EsVoluminoso ? 'Desmarcar' : 'Marcar')}
                  </button>
                )}
              </div>
            </div>

            {/* ✅ SECCIÓN CORREGIDA: Información de contacto con datos reales */}
            <div className="ps-contacto-info-grid">
              <div className="ps-contacto-item">
                <div className="ps-contacto-label">
                  <FaUser /> Contacto:
                </div>
                <div className="ps-contacto-value">
                  {pedido.Contacto || 'No especificado'}
                </div>
              </div>
              
              <div className="ps-contacto-item">
                <div className="ps-contacto-label">
                  <FaPhone /> Teléfono:
                </div>
                <div className="ps-contacto-value">
                  {pedido.TelefonoContacto || 'No especificado'}
                </div>
              </div>

              <div className="ps-contacto-item">
                <div className="ps-contacto-label">
                  <FaUser /> Vendedor:
                </div>
                <div className="ps-contacto-value">
                  {pedido.NombreVendedor || pedido.Vendedor || 'No especificado'}
                </div>
              </div>
              
              <div className="ps-contacto-item ps-observaciones-web">
                <div className="ps-contacto-label">
                  <FaInfoCircle /> Observaciones Web:
                </div>
                <div className="ps-contacto-value">
                  {pedido.observaciones || 'No hay observaciones'}
                </div>
              </div>
            </div>

            {/* ✅ SECCIÓN CORREGIDA: Solo mostrar obra con datos reales */}
            <div className="ps-pedido-detail-item ps-obra-item">
              <strong>Obra:</strong> {pedido.nombreObra || 'Sin obra especificada'}
            </div>
          </div>
          
          <div className="ps-lineas-container">
            <div className="ps-table-responsive">
              <table className="ps-lineas-table">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Descripcion</th>
                    <th>Pendiente</th>
                    <th>Peso</th>
                    <th>Ubicación</th>
                    <th>Cantidad</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pedido.articulos.map((linea, index) => (
                    <LineaPedido 
                      key={`${pedido.codigoEmpresa}-${pedido.ejercicioPedido}-${pedido.seriePedido || ''}-${pedido.numeroPedido}-${linea.codigoArticulo}-${linea.unidadPedido}-${index}`}
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
                </tbody>
              </table>
            </div>
          </div>
        </>)}
    </div>
  );
});

// Componente de Paginación
const Paginacion = React.memo(({ totalPaginas, paginaActual, cambiarPagina }) => {
  const paginas = useMemo(() => {
    const paginas = [];
    const maxPaginasVisibles = 5;
    let inicio = Math.max(1, paginaActual - Math.floor(maxPaginasVisibles / 2));
    let fin = Math.min(totalPaginas, inicio + maxPaginasVisibles - 1);
    
    if (fin - inicio + 1 < maxPaginasVisibles) {
      inicio = Math.max(1, fin - maxPaginasVisibles + 1);
    }
    
    for (let i = inicio; i <= fin; i++) {
      paginas.push(i);
    }
    
    return paginas;
  }, [totalPaginas, paginaActual]);
  
  return (
    totalPaginas > 1 && (
      <div className="ps-pagination">
        <button 
          onClick={() => cambiarPagina(1)} 
          disabled={paginaActual === 1}
          className="ps-pagination-btn"
        >
          &laquo;
        </button>
        <button 
          onClick={() => cambiarPagina(paginaActual - 1)} 
          disabled={paginaActual === 1}
          className="ps-pagination-btn"
        >
          &lsaquo;
        </button>
        {paginas.map(numero => (
          <button
            key={numero}
            onClick={() => cambiarPagina(numero)}
            className={`ps-pagination-btn ${paginaActual === numero ? 'active' : ''}`}
          >
            {numero}
          </button>
        ))}
        <button 
          onClick={() => cambiarPagina(paginaActual + 1)} 
          disabled={paginaActual === totalPaginas}
          className="ps-pagination-btn"
        >
          &rsaquo;
        </button>
        <button 
          onClick={() => cambiarPagina(totalPaginas)} 
          disabled={paginaActual === totalPaginas}
          className="ps-pagination-btn"
        >
          &raquo;
        </button>
      </div>
    )
  );
});

// Componente Modal de Cámara - VERSIÓN COMPATIBLE CON HTTP
const CameraModal = React.memo(({ 
  showCamera, 
  setShowCamera, 
  cameras, 
  selectedCamera, 
  setSelectedCamera, 
  manualCode, 
  setManualCode, 
  handleScanSuccess, 
  handleManualVerification,
  cameraError
}) => {
  if (!showCamera) return null;

  return (
    <div className="ps-camera-overlay">
      <div className="ps-camera-container">
        <button className="ps-cerrar-modal" onClick={() => setShowCamera(false)}>
          <FaTimes />
        </button>
        <div className="ps-camera-header">
          <FaQrcode />
          <h3>Escanear Artículo</h3>
        </div>
        
        {/* 🔥 MOSTRAR ERROR DE CÁMARA CON MÁS INFORMACIÓN */}
        {cameraError ? (
          <div className="ps-camera-error">
            <div className="ps-error-icon">
              <FaExclamationTriangle />
            </div>
            <h4>No se pudo acceder a la cámara</h4>
            <p>{cameraError}</p>
            
            <div className="ps-camera-troubleshoot">
              <h5>⚠️ Cámara no disponible en HTTP:</h5>
              <p>Para usar la cámara necesitas:</p>
              <ul>
                <li>✅ Usar HTTPS en lugar de HTTP</li>
                <li>✅ O acceder desde localhost</li>
                <li>✅ O usar la entrada manual de código</li>
              </ul>
            </div>
            
            <div className="ps-manual-verification">
              <p><strong>Introduce el código manualmente:</strong></p>
              <div className="ps-input-group">
                <FaBarcode />
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Ingresa el código del artículo"
                  autoFocus
                />
              </div>
              <button 
                className="ps-btn-verificar-manual"
                onClick={handleManualVerification}
                disabled={!manualCode}
              >
                <FaCheck /> Verificar
              </button>
            </div>
            
            <button className="ps-btn-cerrar-camara" onClick={() => setShowCamera(false)}>
              <FaTimes /> Cancelar
            </button>
          </div>
        ) : (<>
            {/* Selector de cámara */}
            {cameras.length > 0 && (
              <div className="ps-camera-selector">
                <label><FaCamera /> Seleccionar cámara:</label>
                <select 
                  value={selectedCamera} 
                  onChange={(e) => setSelectedCamera(e.target.value)}
                >
                  {cameras.map(camera => (
                    <option key={camera.id} value={camera.id}>
                      {camera.label || `Cámara ${camera.id}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {/* Contenedor de la cámara */}
            <div id="ps-camera-container" className="ps-camera-view">
              {cameras.length === 0 && !cameraError && (
                <div className="ps-camera-loading">
                  <div className="ps-spinner"></div>
                  <p>Inicializando cámara...</p>
                </div>
              )}
              <div className="ps-scan-frame">
                <div className="ps-frame-line top-left"></div>
                <div className="ps-frame-line top-right"></div>
                <div className="ps-frame-line bottom-left"></div>
                <div className="ps-frame-line bottom-right"></div>
              </div>
            </div>
            
            {/* Entrada manual */}
            <div className="ps-manual-verification">
              <p>O introduce el código manualmente:</p>
              <div className="ps-input-group">
                <FaBarcode />
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Ingresa el código del artículo"
                />
              </div>
              <button 
                className="ps-btn-verificar-manual"
                onClick={handleManualVerification}
                disabled={!manualCode}
              >
                <FaCheck /> Verificar
              </button>
            </div>
            
            <button className="ps-btn-cerrar-camara" onClick={() => setShowCamera(false)}>
              <FaTimes /> Cancelar
            </button>
          </>)}
      </div>
    </div>
  );
});

// Componente Principal PedidosScreen - VERSIÓN COMPLETA
const PedidosScreen = () => {
  const navigate = useNavigate();
  const [user] = useState(() => {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  });
  const pedidosPorPagina = 20;
  
  const { 
    canViewAllOrders, 
    canPerformActions,
    canPerformActionsInPedidos
  } = usePermissions();
  
  const [pedidos, setPedidos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState({});
  const [expediciones, setExpediciones] = useState({});
  const [pedidoViewModes, setPedidoViewModes] = useState({});
  const [loading, setLoading] = useState(true);
  const [generandoAlbaran, setGenerandoAlbaran] = useState(false);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const debouncedFiltroBusqueda = useDebounce(filtroBusqueda, 500);
  const [rangoFechas, setRangoFechas] = useState('semana');
  
  // Estado para el filtro de Status
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
  
  // Estado para controlar líneas en procesamiento
  const [lineasProcesando, setLineasProcesando] = useState({});
  
  // Cache para ubicaciones ya cargadas
  const [articulosConUbicacionesCargadas, setArticulosConUbicacionesCargadas] = useState(new Set());
  const [articulosCargandoUbicaciones, setArticulosCargandoUbicaciones] = useState(new Set());
  
  const scannerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Refs para evitar bucles en efectos
  const rangoFechasRef = useRef(rangoFechas);
  const userRef = useRef(user);

  // Opciones para el filtro de Status
  const opcionesStatus = useMemo(() => [
    { id: '', nombre: 'Todos los estados' },
    { id: 'PendienteProveedor', nombre: 'Pendiente Proveedor' },
    { id: 'Parcial', nombre: 'Parcial' },
    { id: 'Pendiente', nombre: 'Pendiente' }
  ], []);

  // 🔔 FUNCIÓN PARA MOSTRAR NOTIFICACIONES DEL NAVEGADOR
  const mostrarNotificacionNavegador = useCallback((titulo, cuerpo, tipo = 'info') => {
    // Verificar si el navegador soporta notificaciones
    if (!("Notification" in window)) {
      console.log("Este navegador no soporta notificaciones del sistema");
      
      // Fallback: mostrar toast en la página
      mostrarToastEnPagina(titulo, cuerpo, tipo);
      return false;
    }

    // Configurar icono según tipo
    let icono = '/favicon.ico';
    let badge = '/favicon.ico';
    
    switch(tipo) {
      case 'success':
        icono = '/icons/success-icon.png'; // Cambia por tu ruta
        break;
      case 'error':
        icono = '/icons/error-icon.png'; // Cambia por tu ruta
        break;
      case 'warning':
        icono = '/icons/warning-icon.png'; // Cambia por tu ruta
        break;
    }

    // Verificar si ya tenemos permiso
    if (Notification.permission === "granted") {
      // Crear notificación con vibración si está soportada
      const options = {
        body: cuerpo,
        icon: icono,
        badge: badge,
        tag: 'albaran-generado', // Para agrupar notificaciones similares
        renotify: true,
        silent: false,
        requireInteraction: false // Cambia a true si quieres que el usuario interactúe
      };

      // Intentar usar vibración en dispositivos móviles
      if ('vibrate' in navigator) {
        // Vibración corta para éxito, larga para error
        navigator.vibrate(tipo === 'error' ? [200, 100, 200] : [100]);
      }

      const notificacion = new Notification(titulo, options);
      
      // Agregar click handler para enfocar la ventana
      notificacion.onclick = function() {
        window.focus();
        this.close();
      };
      
      // Cerrar automáticamente después de 5 segundos
      setTimeout(() => {
        notificacion.close();
      }, 5000);
      
      return true;
      
    } else if (Notification.permission !== "denied") {
      // Pedir permiso de manera más amigable
      const pedirPermiso = () => {
        Notification.requestPermission().then(permission => {
          if (permission === "granted") {
            // Repetir la notificación ahora que tenemos permiso
            mostrarNotificacionNavegador(titulo, cuerpo, tipo);
          } else {
            // Fallback a toast si se niega el permiso
            mostrarToastEnPagina(titulo, cuerpo, tipo);
          }
        });
      };
      
      // Mostrar mensaje amigable antes de pedir permiso
      if (window.confirm('¿Deseas recibir notificaciones cuando se generen albaranes? Esto te permitirá ver el número de albarán sin interrumpir tu trabajo.')) {
        pedirPermiso();
      }
      
      return false;
    } else {
      // Permiso denegado, usar fallback
      mostrarToastEnPagina(titulo, cuerpo, tipo);
      return false;
    }
  }, []);

  // Función de fallback para mostrar toast en la página
  const mostrarToastEnPagina = useCallback((titulo, cuerpo, tipo) => {
    // Crear elemento toast
    const toast = document.createElement('div');
    toast.className = `ps-toast ps-toast-${tipo}`;
    toast.innerHTML = `
      <div class="ps-toast-header">
        <strong>${titulo}</strong>
        <button class="ps-toast-close">&times;</button>
      </div>
      <div class="ps-toast-body">${cuerpo.replace(/\n/g, '<br>')}</div>
    `;
    
    // Estilos inline para el toast
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      min-width: 300px;
      max-width: 400px;
      background: ${tipo === 'success' ? '#4CAF50' : tipo === 'error' ? '#F44336' : '#2196F3'};
      color: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
      animation: slideInNotification 0.3s ease-out;
    `;
    
    // Agregar evento de cierre
    const closeBtn = toast.querySelector('.ps-toast-close');
    closeBtn.onclick = () => {
      toast.style.animation = 'slideOutNotification 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    };
    
    // Auto cerrar después de 5 segundos
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = 'slideOutNotification 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
    
    document.body.appendChild(toast);
  }, []);

  // ✅ FUNCIÓN: Actualizar estado voluminoso
  const handleActualizarVoluminoso = useCallback(async (pedido, esVoluminoso) => {
    if (!canPerformActionsInPedidos) return;
    
    try {
      const headers = getAuthHeader();
      
      const response = await API.post(
        '/pedidos/actualizar-voluminoso',
        {
          codigoEmpresa: pedido.codigoEmpresa,
          ejercicio: pedido.ejercicioPedido,
          serie: pedido.seriePedido,
          numeroPedido: pedido.numeroPedido,
          esVoluminoso: esVoluminoso
        },
        { headers }
      );

      if (response.data.success) {
        // Actualizar el estado local
        setPedidos(prev => 
          prev.map(p => 
            p.numeroPedido === pedido.numeroPedido 
              ? { ...p, EsVoluminoso: esVoluminoso }
              : p
          )
        );
        
        alert(response.data.mensaje);
      }
    } catch (error) {
      console.error('Error al actualizar estado voluminoso:', error);
      alert('Error: ' + (error.response?.data?.mensaje || error.message));
      throw error;
    }
  }, [canPerformActionsInPedidos]);

  // 🔥 FUNCIÓN OPTIMIZADA: Cargar ubicaciones para múltiples artículos (BATCH)
  const cargarUbicacionesParaArticulos = useCallback(async (codigosArticulos) => {
    // Filtrar artículos que ya están cargados o en proceso de carga
    const codigosParaCargar = codigosArticulos.filter(codigo => 
      !articulosConUbicacionesCargadas.has(codigo) && !articulosCargandoUbicaciones.has(codigo)
    );

    if (codigosParaCargar.length === 0) return;

    // Marcar como cargando
    setArticulosCargandoUbicaciones(prev => {
      const nuevo = new Set(prev);
      codigosParaCargar.forEach(codigo => nuevo.add(codigo));
      return nuevo;
    });

    const headers = getAuthHeader();
    const nuevasUbicaciones = {};

    try {
      // 🔥 OPTIMIZACIÓN: Cargar en lotes de 10 artículos
      const batchSize = 10;
      for (let i = 0; i < codigosParaCargar.length; i += batchSize) {
        const batch = codigosParaCargar.slice(i, i + batchSize);
        
        // Cargar en paralelo con Promise.allSettled para manejar errores individuales
        const resultados = await Promise.allSettled(
          batch.map(async (codigo) => {
            try {
              const response = await API.get(
                '/traspasos/stock-por-articulo',
                {
                  headers,
                  params: { codigoArticulo: codigo }
                }
              );

              return {
                codigo,
                data: response.data.map(item => ({
                  codigoAlmacen: item.CodigoAlmacen,
                  ubicacion: item.Ubicacion,
                  partida: item.Partida || null,
                  unidadSaldo: item.Cantidad,
                  unidadMedida: item.UnidadStock || 'unidades',
                  descripcionUbicacion: item.DescripcionUbicacion
                }))
              };
            } catch (error) {
              console.error(`[ERROR] Al cargar ubicaciones para ${codigo}:`, error);
              return {
                codigo,
                data: [],
                error: true
              };
            }
          })
        );

        // Procesar resultados
        resultados.forEach(resultado => {
          if (resultado.status === 'fulfilled') {
            nuevasUbicaciones[resultado.value.codigo] = resultado.value.data;
          }
        });

        // Actualizar estado parcialmente para mejor UX
        setUbicaciones(prev => ({
          ...prev,
          ...nuevasUbicaciones
        }));
      }
    } finally {
      // Actualizar cache de artículos cargados
      setArticulosConUbicacionesCargadas(prev => {
        const nuevo = new Set(prev);
        codigosParaCargar.forEach(codigo => nuevo.add(codigo));
        return nuevo;
      });

      // Limpiar estado de carga
      setArticulosCargandoUbicaciones(prev => {
        const nuevo = new Set(prev);
        codigosParaCargar.forEach(codigo => nuevo.delete(codigo));
        return nuevo;
      });
    }
  }, [articulosConUbicacionesCargadas, articulosCargandoUbicaciones]);

  // 🔥 FUNCIÓN OPTIMIZADA: Expedir artículo sin recarga completa
  const handleExpedirArticuloOptimizado = useCallback(async (linea, pedido, expedicion) => {
    if (!canPerformActions || isScanning) return;
    
    const key = linea.movPosicionLinea;
    
    // Mostrar estado de carga en la línea específica
    setLineasProcesando(prev => ({
      ...prev,
      [key]: true
    }));

    try {
      const response = await API.post('/actualizarLineaPedido', {
        codigoEmpresa: pedido.codigoEmpresa,
        ejercicio: pedido.ejercicioPedido,
        serie: pedido.seriePedido || '',
        numeroPedido: pedido.numeroPedido,
        codigoArticulo: linea.codigoArticulo,
        cantidadExpedida: parseFloat(expedicion.cantidad),
        almacen: expedicion.almacen,
        ubicacion: expedicion.ubicacion,
        partida: expedicion.partida || '',
        unidadMedida: expedicion.unidadMedida || linea.unidadPedido,
        esZonaDescarga: expedicion.ubicacion === "Zona descarga",
        movPosicionLinea: key
      }, { headers: getAuthHeader() });

      if (response.data.success) {
        // 🔔 Verificar si se generó albarán automático
        if (response.data.detalles?.albaranProgramado || 
            response.data.detalles?.pedidoCompletado) {
          
          // Si el pedido se completó y se programó albarán
          if (response.data.detalles.pedidoCompletado) {
            // Esperar un momento para dar tiempo a que el backend genere el albarán
            setTimeout(() => {
              mostrarNotificacionNavegador(
                'Pedido Completado',
                `El pedido #${pedido.numeroPedido} se ha completado.\n` +
                `Se generará albarán automáticamente en segundo plano.`
              );
            }, 1500);
          }
        }

        // 🔥 ACTUALIZACIÓN LOCAL SIN RECARGAR TODO
        
        // 1. Actualizar pedidos localmente
        setPedidos(prev => 
          prev.map(p => {
            if (p.numeroPedido === pedido.numeroPedido) {
              const articulosActualizados = p.articulos.map(art => {
                if (art.movPosicionLinea === key) {
                  const nuevasUnidadesPendientes = Math.max(0, parseFloat(art.unidadesPendientes) - parseFloat(expedicion.cantidad));
                  return {
                    ...art,
                    unidadesPendientes: nuevasUnidadesPendientes
                  };
                }
                return art;
              });

              // Verificar si el pedido aún tiene líneas pendientes
              const tieneLineasPendientes = articulosActualizados.some(art => parseFloat(art.unidadesPendientes) > 0);

              // Si no tiene pendientes, filtrar el pedido
              if (!tieneLineasPendientes) {
                return null;
              }

              return {
                ...p,
                articulos: articulosActualizados
              };
            }
            return p;
          }).filter(Boolean) // Eliminar pedidos null (completados)
        );

        // 2. Actualizar ubicaciones (reducir stock)
        if (expedicion.ubicacion !== "Zona descarga") {
          setUbicaciones(prev => {
            const nuevasUbicaciones = { ...prev };
            const ubicacionesArticulo = nuevasUbicaciones[linea.codigoArticulo] || [];
            
            const ubicacionesActualizadas = ubicacionesArticulo.map(ubic => {
              if (ubic.ubicacion === expedicion.ubicacion && 
                  ubic.codigoAlmacen === expedicion.almacen &&
                  normalizarUnidad(ubic.unidadMedida) === normalizarUnidad(expedicion.unidadMedida)) {
                
                const stockActual = parseFloat(ubic.unidadSaldo) || 0;
                const nuevoStock = Math.max(0, stockActual - parseFloat(expedicion.cantidad));
                
                return {
                  ...ubic,
                  unidadSaldo: nuevoStock
                };
              }
              return ubic;
            });
            
            nuevasUbicaciones[linea.codigoArticulo] = ubicacionesActualizadas;
            return nuevasUbicaciones;
          });
        }

        // 3. Limpiar expedición de esta línea
        setExpediciones(prev => {
          const nuevasExpediciones = { ...prev };
          if (nuevasExpediciones[key]) {
            nuevasExpediciones[key] = {
              ...nuevasExpediciones[key],
              cantidad: '0'
            };
          }
          return nuevasExpediciones;
        });

        alert(`✅ Artículo expedido correctamente: ${expedicion.cantidad} ${linea.unidadBase || 'ud'}`);
      }
    } catch (error) {
      console.error('Error al expedir artículo:', error);
      
      // 🔔 Notificación de error
      mostrarNotificacionNavegador(
        'Error al Expedir',
        error.response?.data?.mensaje || 'Error al expedir artículo',
        'error'
      );
      
      alert('❌ Error al expedir artículo: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      // Quitar estado de carga
      setLineasProcesando(prev => ({
        ...prev,
        [key]: false
      }));
    }
  }, [canPerformActions, isScanning, mostrarNotificacionNavegador]);

  // Función para procesar expedición (común para escaneo y manual)
  const procesarExpedicion = useCallback((codigoVerificado, detalle = null) => {
    if (!currentScanningLine) return false;
    
    const { linea, pedido } = currentScanningLine;
    
    if (codigoVerificado === linea.codigoArticulo || codigoVerificado === linea.codigoAlternativo) {
      const key = linea.movPosicionLinea;
      const expedicion = expediciones[key];
      
      if (!expedicion) {
        console.error('[FRONTEND ERROR] No se encontró expedición para la línea:', key);
        return false;
      }

      handleExpedirArticuloOptimizado(linea, pedido, expedicion);
      
      if (detalle) {
        const itemKey = `${linea.codigoArticulo}-${detalle.talla}-${detalle.color}`;
        setScannedItems(prev => ({
          ...prev,
          [itemKey]: (prev[itemKey] || 0) + 1
        }));
      }
      return true;
    }
    return false;
  }, [currentScanningLine, expediciones, handleExpedirArticuloOptimizado]);

  // 🔥 FUNCIÓN handleExpedir COMPLETAMENTE CORREGIDA
  const handleExpedir = useCallback(async (codigoEmpresa, ejercicio, serie, numeroPedido, codigoArticulo, unidadesPendientes, linea, detalle = null) => {
    if (!canPerformActions || isScanning) return;
    
    setIsScanning(true);
    const key = linea.movPosicionLinea;
    
    const expedicion = expediciones[key];
    
    if (!expedicion) {
      console.error('[FRONTEND ERROR] No se encontró expedición para la línea:', key);
      setIsScanning(false);
      return;
    }

    let cantidadExpedida = parseFloat(expedicion.cantidad);
    if (isNaN(cantidadExpedida) || cantidadExpedida <= 0) {
      alert("La cantidad debe ser mayor a cero");
      setIsScanning(false);
      return;
    }

    try {
      await handleExpedirArticuloOptimizado(linea, { codigoEmpresa, ejercicioPedido: ejercicio, seriePedido: serie, numeroPedido }, expedicion);
    } catch (error) {
      console.error('[FRONTEND ERROR] Error al expedir artículo:', error);
      
      if (error.response?.data?.mensaje) {
        alert('❌ Error al expedir artículo: ' + error.response.data.mensaje);
      } else {
        alert('❌ Error al expedir artículo: ' + error.message);
      }
    } finally {
      setIsScanning(false);
    }
  }, [canPerformActions, isScanning, expediciones, handleExpedirArticuloOptimizado]);

  // 🔥 FUNCIÓN handleExpedirVariante CORREGIDA - SIN REINICIO COMPLETO
  const handleExpedirVariante = useCallback(async (datosVariante) => {
    const { articulo, color, talla, cantidad, ubicacion, almacen, partida, unidadMedida, movPosicionLinea } = datosVariante;
    const { pedido, linea } = detallesModal;

    try {
      const headers = getAuthHeader();
      
      const response = await API.post(
        '/actualizarLineaPedido',
        {
          codigoEmpresa: pedido.codigoEmpresa,
          ejercicio: pedido.ejercicioPedido,
          serie: pedido.seriePedido || '',
          numeroPedido: pedido.numeroPedido,
          codigoArticulo: articulo,
          cantidadExpedida: cantidad,
          almacen: almacen,
          ubicacion: ubicacion,
          partida: partida,
          unidadMedida: unidadMedida,
          codigoColor: color,
          codigoTalla: talla,
          esZonaDescarga: ubicacion === "Zona descarga",
          movPosicionLinea: movPosicionLinea
        },
        { headers }
      );

      if (response.data.success) {
        // ✅ ACTUALIZACIÓN LOCAL SIN RECARGAR TODO
        
        // 1. Actualizar pedidos localmente
        setPedidos(prev => prev.map(p => {
          if (p.numeroPedido === pedido.numeroPedido) {
            const articulosActualizados = p.articulos.map(art => {
              if (art.movPosicionLinea === movPosicionLinea) {
                // Buscar en los detalles para actualizar la variante específica
                if (art.detalles && Array.isArray(art.detalles)) {
                  const detallesActualizados = art.detalles.map(variante => {
                    if (variante.color?.codigo === color) {
                      const tallasActualizadas = { ...variante.tallas };
                      if (tallasActualizadas[talla]) {
                        const nuevasUnidades = Math.max(0, parseFloat(tallasActualizadas[talla].unidades) - cantidad);
                        tallasActualizadas[talla] = {
                          ...tallasActualizadas[talla],
                          unidades: nuevasUnidades
                        };
                      }
                      return {
                        ...variante,
                        tallas: tallasActualizadas
                      };
                    }
                    return variante;
                  });
                  
                  // Recalcular unidades pendientes totales
                  let nuevasUnidadesPendientes = 0;
                  detallesActualizados.forEach(variante => {
                    Object.values(variante.tallas || {}).forEach(tallaInfo => {
                      nuevasUnidadesPendientes += parseFloat(tallaInfo.unidades) || 0;
                    });
                  });
                  
                  return {
                    ...art,
                    detalles: detallesActualizados,
                    unidadesPendientes: nuevasUnidadesPendientes
                  };
                }
              }
              return art;
            });
            
            return {
              ...p,
              articulos: articulosActualizados
            };
          }
          return p;
        }));

        // 2. Cerrar modal
        setDetallesModal(null);
        alert(`Expedición realizada: ${cantidad} unidades de la variante`);
        return Promise.resolve();
      }
    } catch (error) {
      console.error('Error al expedir variante:', error);
      alert('Error al expedir: ' + (error.response?.data?.mensaje || error.message));
      return Promise.reject(error);
    }
  }, [detallesModal]);

  const handleScanSuccess = useCallback((decodedText) => {
    if (!procesarExpedicion(decodedText, currentScanningLine?.detalle)) {
      alert('Código escaneado no coincide con el artículo');
    }
    setShowCamera(false);
  }, [procesarExpedicion, currentScanningLine]);

  const handleManualVerification = useCallback(() => {
    if (!manualCode) return;
    
    if (!procesarExpedicion(manualCode, currentScanningLine?.detalle)) {
      alert('Código introducido no coincide con el artículo');
    }
    
    setShowCamera(false);
    setManualCode('');
  }, [procesarExpedicion, manualCode, currentScanningLine]);

  const iniciarEscaneo = useCallback((linea, pedido, detalle = null) => {
    if (!canPerformActions) return;
    
    setCurrentScanningLine({ linea, pedido, detalle });
    setShowCamera(true);
    setManualCode('');
  }, [canPerformActions]);

  // ✅ Función para cargar pedidos con cancelación
  const cargarPedidos = useCallback(async (forzarRecarga = false) => {
    if (abortControllerRef.current && !forzarRecarga) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    try {
      setLoading(true);
      setError('');
      
      // ✅ SOLO LIMPIAR ESTADOS SI ES UNA RECARGA MANUAL, NO DESPUÉS DE EXPEDIR
      if (forzarRecarga && !isScanning) {
        setUbicaciones({});
        setExpediciones({});
        setArticulosConUbicacionesCargadas(new Set());
        setArticulosCargandoUbicaciones(new Set());
      }
      
      const codigoEmpresa = userRef.current?.CodigoEmpresa;
      const rango = rangoFechasRef.current;
      
      if (!codigoEmpresa) {
        setError('No se encontró el código de empresa del usuario.');
        setLoading(false);
        return;
      }
      
      const headers = getAuthHeader();
      
      const response = await API.get(`/pedidosPendientes`, { 
        headers,
        params: { 
          codigoEmpresa,
          rango: rango
        },
        signal
      });
      
      if (signal.aborted) return;
      
      setPedidos(response.data);
      
      // 🔥 NO CARGAR UBICACIONES AQUÍ - Se cargarán bajo demanda
      
      const initialModes = {};
      response.data.forEach(pedido => {
        initialModes[pedido.numeroPedido] = 'show';
      });
      
      if (signal.aborted) return;
      setPedidoViewModes(initialModes);
    } catch (err) {
      if (err.name === 'CanceledError') {
        console.log('Solicitud cancelada');
      } else {
        console.error('Error al obtener pedidos:', err);
        if (err.response?.status === 500) {
          setError('Error interno del servidor. Inténtalo más tarde');
        } else if (err.response?.status === 401) {
          setError('Error de autenticación. Vuelve a iniciar sesión');
        } else {
          setError('Error de conexión con el servidor');
        }
      }
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [isScanning]);

  useEffect(() => {
    cargarPedidos();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [rangoFechas, cargarPedidos]);

  // 🔧 EFECTO CORREGIDO: Detectar cámaras con compatibilidad HTTP
  useEffect(() => {
    if (showCamera) {
      const detectarCamaras = async () => {
        try {
          setCameraError('');
          setCameras([]);
          setSelectedCamera('');

          // 🔥 VERIFICAR SI ESTAMOS EN HTTP (no localhost)
          const isHttp = window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
          
          if (isHttp) {
            // Estamos en HTTP (no localhost), la cámara no funcionará
            throw new Error('La cámara solo está disponible en HTTPS o localhost. Usa la entrada manual.');
          }

          // Verificar si el navegador soporta mediaDevices
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('El navegador no soporta acceso a la cámara.');
          }

          // 🔥 INTENTAR USAR Html5Qrcode primero (más compatible)
          try {
            const html5QrCode = new Html5Qrcode("ps-camera-container");
            const camaras = await Html5Qrcode.getCameras();
            
            if (camaras && camaras.length > 0) {
              setCameras(camaras);
              setSelectedCamera(camaras[0].id);
              console.log('✅ Cámaras detectadas con Html5Qrcode:', camaras.length);
              return;
            }
          } catch (html5Error) {
            console.log('Html5Qrcode no pudo detectar cámaras, intentando método nativo...');
          }

          // 🔥 INTENTAR MÉTODO NATIVO
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
              video: { facingMode: 'environment' } 
            });
            
            if (stream) {
              const dispositivos = await navigator.mediaDevices.enumerateDevices();
              const camaras = dispositivos
                .filter(dispositivo => dispositivo.kind === 'videoinput')
                .map((camara, index) => ({
                  id: camara.deviceId,
                  label: camara.label || `Cámara ${index + 1}`
                }));
              
              if (camaras.length > 0) {
                setCameras(camaras);
                setSelectedCamera(camaras[0].id);
                
                // Detener el stream temporal
                stream.getTracks().forEach(track => track.stop());
                console.log('✅ Cámaras detectadas con método nativo:', camaras.length);
              } else {
                throw new Error('No se encontraron cámaras disponibles.');
              }
            }
          } catch (nativeError) {
            console.error('Error con método nativo:', nativeError);
            throw nativeError;
          }

        } catch (error) {
          console.error('❌ Error al detectar cámaras:', error);
          
          // 🔥 MENSAJES DE ERROR ESPECÍFICOS
          if (error.message.includes('HTTPS') || error.message.includes('secure context')) {
            setCameraError('La cámara solo está disponible en HTTPS o localhost. Por favor, usa la entrada manual.');
          } else if (error.name === 'NotAllowedError' || error.message.includes('Permission denied')) {
            setCameraError('Permiso de cámara denegado. Por favor, permite el acceso a la cámara en la configuración de tu navegador.');
          } else if (error.name === 'NotFoundError' || error.message.includes('No camera found')) {
            setCameraError('No se encontró ninguna cámara en el dispositivo.');
          } else if (error.name === 'NotSupportedError') {
            setCameraError('Tu navegador no soporta el acceso a la cámara.');
          } else if (error.name === 'NotReadableError') {
            setCameraError('La cámara está siendo usada por otra aplicación.');
          } else {
            setCameraError('Error al acceder a la cámara: ' + error.message);
          }
        }
      };

      detectarCamaras();
    }
  }, [showCamera]);

  // ✅ EFECTO MEJORADO: Inicializar escáner solo si hay cámara disponible
  useEffect(() => {
    let scanner = null;
    let stream = null;

    const inicializarEscaner = async () => {
      // 🔥 NO INTENTAR INICIALIZAR SI HAY ERROR O NO HAY CÁMARA
      if (cameraError || !selectedCamera || !showCamera || !document.getElementById('ps-camera-container')) {
        return;
      }

      try {
        // 🔥 LIMPIAR CONTENEDOR PRIMERO
        const container = document.getElementById('ps-camera-container');
        container.innerHTML = '';
        
        // 🔥 USAR Html5Qrcode (más compatible)
        scanner = new Html5Qrcode(
          "ps-camera-container",
          { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            verbose: false
          }
        );
        
        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          deviceId: selectedCamera
        };
        
        await scanner.start(
          selectedCamera,
          config,
          (decodedText) => {
            console.log('✅ Código escaneado:', decodedText);
            handleScanSuccess(decodedText);
          },
          (error) => {
            // Ignorar errores normales de escaneo
            if (error && !error.includes('No MultiFormat Readers')) {
              console.log('🔍 Escaneando...');
            }
          }
        );
        
        scannerRef.current = scanner;
        console.log('✅ Escáner Html5Qrcode iniciado correctamente');
        
      } catch (error) {
        console.error('❌ Error al inicializar el escáner:', error);
        setCameraError('Error al inicializar la cámara. Por favor, usa la entrada manual.');
      }
    };

    inicializarEscaner();

    // Cleanup function
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop();
        });
        stream = null;
      }
      
      if (scanner) {
        try {
          scanner.stop().then(() => {
            console.log('✅ Escáner detenido correctamente');
            scanner.clear();
          }).catch(error => {
            console.log('⚠️ Error al detener escáner:', error);
          });
        } catch (error) {
          console.log('⚠️ Error en cleanup:', error);
        }
        scanner = null;
        scannerRef.current = null;
      }
    };
  }, [showCamera, selectedCamera, handleScanSuccess, cameraError]);

  const abrirModalDetalles = useCallback(async (detallesAnidados, linea, pedido) => {
    try {
      const detallesPlana = [];
      
      if (detallesAnidados && Array.isArray(detallesAnidados)) {
        detallesAnidados.forEach(variante => {
          if (variante.tallas && typeof variante.tallas === 'object') {
            Object.entries(variante.tallas).forEach(([codigoTalla, talla]) => {
              if (talla && typeof talla === 'object' && talla.unidades > 0) {
                let codigoTallaReal = codigoTalla;
                
                if (talla.descripcion && talla.descripcion.includes('Talla ')) {
                  codigoTallaReal = talla.descripcion.replace('Talla ', '');
                }
                
                if (parseFloat(talla.unidades) > 0) {
                  detallesPlana.push({
                    codigoArticulo: linea.codigoArticulo,
                    codigoColor: variante.color?.codigo || '',
                    codigoTalla: codigoTallaReal,
                    cantidadPendiente: talla.unidades || 0,
                    descripcionTalla: talla.descripcion || `Talla ${codigoTalla}`,
                    colorNombre: variante.color?.nombre || variante.color?.codigo || 'Sin color'
                  });
                }
              }
            });
          }
        });
      }

      setDetallesModal({
        detalles: detallesPlana,
        linea,
        pedido
      });
    } catch (error) {
      console.error('Error al procesar detalles del artículo:', error);
      alert('Error al obtener información para este artículo');
    }
  }, []);

  const togglePedidoView = useCallback((numeroPedido) => {
    setPedidoViewModes(prev => ({
      ...prev,
      [numeroPedido]: prev[numeroPedido] === 'show' ? 'hide' : 'show'
    }));
  }, []);

  const handleExpedicionChange = useCallback((key, field, value) => {
    if (!canPerformActions) return;
    
    setExpediciones(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: value }
    }));
  }, [canPerformActions]);

  const cambiarPagina = useCallback((numeroPagina) => {
    setPaginaActual(numeroPagina);
    window.scrollTo(0, 0);
  }, []);

  // 🔔 FUNCIÓN MODIFICADA: Generar albarán parcial con notificaciones
  const generarAlbaranParcial = useCallback(async (pedido) => {
    if (!canPerformActionsInPedidos) return;
    
    try {
      setGenerandoAlbaran(true);
      const headers = getAuthHeader();
      
      const lineasExpedidas = [];
      
      pedido.articulos.forEach(articulo => {
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
            partida: articulo.partida || ''
          });
        }
      });

      if (lineasExpedidas.length === 0) {
        alert('No hay líneas con cantidades expedidas para generar albarán parcial.');
        setGenerandoAlbaran(false);
        return;
      }

      const response = await API.post(
        '/generarAlbaranParcial',
        {
          codigoEmpresa: pedido.codigoEmpresa,
          ejercicio: pedido.ejercicioPedido,
          serie: pedido.seriePedido,
          numeroPedido: pedido.numeroPedido,
          lineasExpedidas: lineasExpedidas
        },
        { headers }
      );

      if (response.data.success) {
        setPedidos(prev => 
          prev.map(p => 
            p.numeroPedido === pedido.numeroPedido 
              ? { 
                  ...p, 
                  Estado: response.data.statusPedido === 'Parcial' ? 4 : 2,
                  Status: response.data.statusPedido
                }
              : p
          )
        );
        
        // 🔔 MOSTRAR NOTIFICACIÓN DEL NAVEGADOR CON EL NÚMERO DE ALBARÁN
        const albaranInfo = response.data.albaran;
        const mensajeNotificacion = 
          `✅ Albarán ${albaranInfo.esParcial ? 'parcial' : 'completo'} generado\n` +
          `Número: ${albaranInfo.serie || ''}${albaranInfo.numero}\n` +
          `Líneas: ${albaranInfo.lineasProcesadas}\n` +
          `Unidades: ${albaranInfo.unidadesServidas}`;
        
        mostrarNotificacionNavegador(
          'Albarán Generado',
          mensajeNotificacion,
          'success'
        );
        
        // También mostrar alert tradicional (como fallback)
        alert(`✅ Albarán generado correctamente\n` +
              `Número: ${albaranInfo.serie || ''}${albaranInfo.numero}\n` +
              `Estado: ${response.data.statusPedido}`);
      }
    } catch (error) {
      console.error('Error al generar albarán parcial:', error);
      
      // 🔔 Notificación de error
      mostrarNotificacionNavegador(
        'Error Generando Albarán',
        error.response?.data?.mensaje || 'Error al generar albarán',
        'error'
      );
      
      if (error.response?.status === 403) {
        alert('Error de permisos: ' + (error.response.data?.mensaje || 'No tienes permiso para realizar esta acción.'));
      } else if (error.response?.data?.mensaje) {
        alert('Error al generar albarán parcial: ' + error.response.data.mensaje);
      } else if (error.request) {
        alert('Error de conexión: No se pudo contactar al servidor.');
      } else {
        alert('Error inesperado: ' + error.message);
      }
    } finally {
      setGenerandoAlbaran(false);
    }
  }, [canPerformActionsInPedidos, mostrarNotificacionNavegador]);

  // Filtrar pedidos con useMemo para evitar recálculos innecesarios
  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter(pedido => {
      const searchText = debouncedFiltroBusqueda.toLowerCase();
      
      const coincideBusqueda = (
        pedido.numeroPedido.toString().includes(searchText) ||
        pedido.razonSocial.toLowerCase().includes(searchText) ||
        (pedido.nombreObra && pedido.nombreObra.toLowerCase().includes(searchText)) ||
        (pedido.obra && pedido.obra.toLowerCase().includes(searchText)) ||
        (pedido.contacto && pedido.contacto.toLowerCase().includes(searchText))
      );

      // ✅ NUEVO: Filtro por Status
      const coincideStatus = filtroStatus ? pedido.Status === filtroStatus : true;
      
      return coincideBusqueda && coincideStatus;
    });
  }, [pedidos, debouncedFiltroBusqueda, filtroStatus]);

  const pedidosOrdenados = useMemo(() => [...pedidosFiltrados], [pedidosFiltrados]);
  
  const indexUltimoPedido = paginaActual * pedidosPorPagina;
  const indexPrimerPedido = indexUltimoPedido - pedidosPorPagina;
  const pedidosActuales = useMemo(() => 
    pedidosOrdenados.slice(indexPrimerPedido, indexUltimoPedido),
    [pedidosOrdenados, indexPrimerPedido, indexUltimoPedido]
  );
  
  const totalPaginas = useMemo(() => 
    Math.ceil(pedidosOrdenados.length / pedidosPorPagina),
    [pedidosOrdenados.length, pedidosPorPagina]
  );

  if (!canViewAllOrders) {
    return (
      <div className="ps-pedidos-screen">
        <div className="ps-no-permission">
          <h2>Acceso restringido</h2>
          <p>No tienes permiso para ver esta sección.</p>
          <button onClick={() => navigate('/')} className="ps-btn-volver">
            Volver al inicio
          </button>
        </div>
        <Navbar />
      </div>
    );
  }
  
  return (
    <div className="ps-pedidos-screen">
      <div className="ps-pedidos-container">
        <div className="ps-pedidos-controls">
          <div className="ps-filtros-container">
            <div className="ps-filtro-group ps-search-group">
              <label><FaSearch /> Buscar:</label>
              <div className="ps-search-input-container">
                <input
                  type="text"
                  placeholder="Nº pedido, cliente, obra, contacto..."
                  value={filtroBusqueda}
                  onChange={e => setFiltroBusqueda(e.target.value)}
                  className="ps-search-input"
                />
              </div>
            </div>
            <div className="ps-filtro-group ps-date-group">
              <label><FaCalendarAlt /> Rango de fechas:</label>
              <div className="ps-select-container">
                <select
                  value={rangoFechas}
                  onChange={e => setRangoFechas(e.target.value)}
                  className="ps-sort-select"
                >
                  <option value="semana">Una semana</option>
                  <option value="dia">Un día</option>
                </select>
                <div className="ps-select-arrow"><FaChevronDown /></div>
              </div>
            </div>
            
            {/* ✅ NUEVO: Filtro por Estado del pedido */}
            <div className="ps-filtro-group ps-status-group">
              <label>Estado:</label>
              <div className="ps-select-container">
                <select
                  value={filtroStatus}
                  onChange={e => setFiltroStatus(e.target.value)}
                  className="ps-sort-select"
                >
                  {opcionesStatus.map(estado => (
                    <option key={estado.id} value={estado.id}>
                      {estado.nombre}
                    </option>
                  ))}
                </select>
                <div className="ps-select-arrow"><FaChevronDown /></div>
              </div>
            </div>
          </div>
        </div>
        <div className="ps-pagination-container">
          <Paginacion 
            totalPaginas={totalPaginas} 
            paginaActual={paginaActual} 
            cambiarPagina={cambiarPagina} 
          />
        </div>
        <div className="ps-pedidos-content">
          {error ? (
            <ErrorMessage 
              message={error} 
              onRetry={cargarPedidos}
            />
          ) : loading ? (
            <LoadingSpinner message="Cargando pedidos..." />
          ) : pedidosOrdenados.length === 0 ? (
            <div className="ps-no-pedidos">
              <p>No hay pedidos pendientes</p>
            </div>
          ) : (<>
              {pedidosActuales.map(pedido => (
                <PedidoCard 
                  key={`${pedido.codigoEmpresa}-${pedido.ejercicioPedido}-${pedido.seriePedido || ''}-${pedido.numeroPedido}`}
                  pedido={pedido} 
                  togglePedidoView={togglePedidoView}
                  pedidoViewModes={pedidoViewModes}
                  generarAlbaranParcial={generarAlbaranParcial}
                  generandoAlbaran={generandoAlbaran}
                  ubicaciones={ubicaciones}
                  expediciones={expediciones}
                  handleExpedicionChange={handleExpedicionChange}
                  iniciarEscaneo={iniciarEscaneo}
                  abrirModalDetalles={abrirModalDetalles}
                  canPerformActions={canPerformActions}
                  canPerformActionsInPedidos={canPerformActionsInPedidos}
                  isScanning={isScanning}
                  onActualizarVoluminoso={handleActualizarVoluminoso}
                  lineasProcesando={lineasProcesando}
                  onCargarUbicaciones={cargarUbicacionesParaArticulos}
                />
              ))}
            </>)}
        </div>
        <div className="ps-pagination-container">
          <Paginacion 
            totalPaginas={totalPaginas} 
            paginaActual={paginaActual} 
            cambiarPagina={cambiarPagina} 
          />
        </div>
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
        <Navbar />
      </div>
    </div>
  );
};

export default PedidosScreen;