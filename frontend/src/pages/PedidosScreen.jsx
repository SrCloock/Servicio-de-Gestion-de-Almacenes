import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../helpers/api';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { Html5Qrcode, Html5QrcodeScanner } from 'html5-qrcode';
import { usePermissions } from '../PermissionsManager';
import '../styles/PedidosScreen.css';
import { FaEllipsisV, FaCamera, FaQrcode, FaBarcode, FaCheck, FaTimes, FaExclamationTriangle, FaChevronDown, FaSearch, FaCalendarAlt, FaTruck, FaInfoCircle, FaSync, FaFilter, FaWeight, FaBox, FaUser, FaPhone, FaExclamation } from 'react-icons/fa';

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

// Función para formatear unidades (optimizada con useMemo)
const useFormatearUnidad = () => {
  return useMemo(() => (cantidad, unidad) => {
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
  }, []);
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

// Componente Modal de Detalles de Artículo
const DetallesArticuloModal = React.memo(({ 
  detalles, 
  linea, 
  pedido, 
  onClose, 
  onExpedirVariante,
  canPerformActions
}) => {
  const formatearUnidad = useFormatearUnidad();
  const [ubicacionesPorDetalle, setUbicacionesPorDetalle] = useState({});
  const [selecciones, setSelecciones] = useState({});
  const [procesando, setProcesando] = useState(false);
  const [cargandoUbicaciones, setCargandoUbicaciones] = useState(true);
  const [erroresCarga, setErroresCarga] = useState({});
  const abortControllers = useRef({});

  // Cancelar todas las peticiones al desmontar
  useEffect(() => {
    return () => {
      Object.values(abortControllers.current).forEach(controller => {
        if (controller) controller.abort();
      });
    };
  }, []);

  // Cargar stock cuando abrimos el modal - SOLO para variantes con unidades pendientes
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
        const key = `${detalle.codigoArticulo}-${detalle.codigoColor}-${detalle.codigoTalla}`;
        
        // Cancelar petición anterior si existe
        if (abortControllers.current[key]) {
          abortControllers.current[key].abort();
        }
        
        // Crear nuevo abort controller para esta petición
        abortControllers.current[key] = new AbortController();
        
        try {
          const response = await API.get(
            '/stock/por-variante',
            {
              headers: getAuthHeader(),
              params: {
                codigoArticulo: detalle.codigoArticulo,
                codigoColor: detalle.codigoColor,
                codigoTalla: detalle.codigoTalla
              },
              signal: abortControllers.current[key].signal
            }
          );

          resultados[key] = Array.isArray(response.data) ? response.data : [];
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
  }, [detalles]);

  const detallesConPendientes = useMemo(() => 
    detalles.filter(detalle => parseFloat(detalle.cantidadPendiente) > 0),
    [detalles]
  );

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
    const detalleKey = `${detalle.codigoArticulo}-${detalle.codigoColor}-${detalle.codigoTalla}`;
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
          <LoadingSpinner message="Cargando información de stock..." />
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
                  const key = `${detalle.codigoArticulo}-${detalle.codigoColor}-${detalle.codigoTalla}`;
                  const ubicaciones = ubicacionesPorDetalle[key] || [];
                  const seleccion = selecciones[key] || {};
                  const error = erroresCarga[key];

                  return (
                    <tr key={index} className={ubicaciones.length === 0 ? 'ps-sin-stock-row' : ''}>
                      <td>{detalle.colorNombre || detalle.codigoColor}</td>
                      <td>{detalle.descripcionTalla || detalle.codigoTalla}</td>
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
                            >
                              <option value="">Selecciona ubicación</option>
                              {ubicaciones.map((ubic, idx) => (
                                <option key={idx} value={ubic.Ubicacion}>
                                  {ubic.CodigoAlmacen} - {ubic.Ubicacion} 
                                  {ubic.Partida ? `(${ubic.Partida})` : ''} - 
                                  Stock: {formatearUnidad(ubic.Cantidad, ubic.UnidadMedida)}
                                </option>
                              ))}
                            </select>
                            <div className="ps-select-arrow"><FaChevronDown /></div>
                          </div>
                        ) : (
                          <span className="ps-sin-stock">Sin stock disponible</span>
                        )}
                      </td>
                      <td>
                        <div className="ps-cantidad-input-container">
                          <input
                            type="number"
                            value={seleccion.cantidad || ""}
                            min={0}
                            max={detalle.cantidadPendiente}
                            onChange={(e) => {
                              const nuevaCantidad = Math.min(
                                parseFloat(e.target.value) || 0, 
                                detalle.cantidadPendiente
                              );
                              handleCambioSeleccion(key, "cantidad", nuevaCantidad.toString());
                            }}
                            disabled={!canPerformActions || ubicaciones.length === 0 || !!error || detalle.cantidadPendiente <= 0}
                            placeholder="0"
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
                            detalle.cantidadPendiente <= 0
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

// Componente Línea de Pedido - VERSIÓN CORREGIDA
const LineaPedido = React.memo(({ 
  linea, 
  pedido, 
  expediciones, 
  handleExpedicionChange, 
  ubicaciones,
  iniciarEscaneo,
  abrirModalDetalles,
  canPerformActions,
  isScanning
}) => {
  const formatearUnidad = useFormatearUnidad();
  
  const ubicacionesConStock = useMemo(() => {
    const ubicacionesArticulo = ubicaciones[linea.codigoArticulo] || [];
    
    console.log(`[FRONTEND DEBUG] Ubicaciones para artículo ${linea.codigoArticulo}:`, ubicacionesArticulo);
    console.log(`[FRONTEND DEBUG] Buscando unidad: "${linea.unidadPedido}" en pedido`);

    // 🔥 CORRECCIÓN: Filtrar considerando unidades normalizadas
    let ubicacionesConStockReal = ubicacionesArticulo.filter(ubi => {
      const tieneStock = parseFloat(ubi.unidadSaldo) > 0;
      
      // Normalizar unidades para comparación
      const unidadUbicacionNormalizada = normalizarUnidad(ubi.unidadMedida);
      const unidadPedidoNormalizada = normalizarUnidad(linea.unidadPedido);
      const unidadBaseNormalizada = normalizarUnidad(linea.unidadBase);
      
      // 🔥 COMPARACIÓN MEJORADA: Considerar unidades normalizadas
      const unidadCoincide = 
        unidadUbicacionNormalizada === unidadPedidoNormalizada || 
        unidadUbicacionNormalizada === unidadBaseNormalizada;
      
      const noEsZonaDescarga = ubi.ubicacion !== "Zona descarga";
      
      console.log(`[FRONTEND DEBUG] Ubicación ${ubi.ubicacion}:`, {
        unidadMedida: ubi.unidadMedida,
        unidadUbicacionNormalizada,
        unidadPedido: linea.unidadPedido,
        unidadPedidoNormalizada,
        unidadBase: linea.unidadBase,
        unidadBaseNormalizada,
        tieneStock,
        unidadCoincide,
        noEsZonaDescarga
      });
      
      return tieneStock && unidadCoincide && noEsZonaDescarga;
    });

    console.log(`[FRONTEND DEBUG] Ubicaciones con stock real para ${linea.codigoArticulo}:`, ubicacionesConStockReal);

    // Si no hay ubicaciones con stock, mostrar todas las disponibles (incluyendo sin stock)
    if (ubicacionesConStockReal.length === 0) {
      ubicacionesConStockReal = ubicacionesArticulo.filter(ubi => {
        // Normalizar unidades para comparación
        const unidadUbicacionNormalizada = normalizarUnidad(ubi.unidadMedida);
        const unidadPedidoNormalizada = normalizarUnidad(linea.unidadPedido);
        const unidadBaseNormalizada = normalizarUnidad(linea.unidadBase);
        
        const unidadCoincide = 
          unidadUbicacionNormalizada === unidadPedidoNormalizada || 
          unidadUbicacionNormalizada === unidadBaseNormalizada;
        
        const noEsZonaDescarga = ubi.ubicacion !== "Zona descarga";
        
        return unidadCoincide && noEsZonaDescarga;
      });
      
      console.log(`[FRONTEND DEBUG] Ubicaciones sin stock pero con unidad correcta:`, ubicacionesConStockReal);
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
    const ubicacionesOrdenadas = ubicacionesConStockReal.sort((a, b) => {
      const stockA = a.unidadSaldo === Infinity ? 999999 : parseFloat(a.unidadSaldo);
      const stockB = b.unidadSaldo === Infinity ? 999999 : parseFloat(b.unidadSaldo);
      return stockB - stockA;
    });
    
    console.log(`[FRONTEND DEBUG] Ubicaciones finales ordenadas:`, ubicacionesOrdenadas);
    
    return ubicacionesOrdenadas;
  }, [ubicaciones, linea.codigoArticulo, linea.unidadPedido, linea.codigoAlmacen, linea.unidadBase]);

  const key = linea.movPosicionLinea;
  const expedicion = expediciones[key] || {
    almacen: ubicacionesConStock[0]?.codigoAlmacen || '',
    ubicacion: ubicacionesConStock[0]?.ubicacion || '',
    partida: ubicacionesConStock[0]?.partida || null,
    unidadMedida: ubicacionesConStock[0]?.unidadMedida || linea.unidadPedido,
    cantidad: '0'
  };
  
  // 🔥 CORRECCIÓN CRÍTICA: Verificar que la expedición actual coincide con las ubicaciones disponibles
  useEffect(() => {
    const ubicacionActual = ubicacionesConStock.find(
      ubi => ubi.ubicacion === expedicion.ubicacion && ubi.codigoAlmacen === expedicion.almacen
    );
    
    if (!ubicacionActual && ubicacionesConStock.length > 0) {
      console.log(`[FRONTEND DEBUG] Corrigiendo expedición automáticamente para ${linea.codigoArticulo}`);
      console.log(`[FRONTEND DEBUG] Expedición actual:`, expedicion);
      console.log(`[FRONTEND DEBUG] Primera ubicación disponible:`, ubicacionesConStock[0]);
      
      // Corregir automáticamente la expedición si no coincide
      handleExpedicionChange(key, 'ubicacion', ubicacionesConStock[0].ubicacion);
      handleExpedicionChange(key, 'almacen', ubicacionesConStock[0].codigoAlmacen);
      handleExpedicionChange(key, 'partida', ubicacionesConStock[0].partida || '');
      handleExpedicionChange(key, 'unidadMedida', ubicacionesConStock[0].unidadMedida || linea.unidadPedido);
      
      const unidadesPendientes = parseFloat(linea.unidadesPendientes) || 0;
      let nuevaCantidad = 0;
      
      if (ubicacionesConStock[0].ubicacion === "Zona descarga") {
        nuevaCantidad = unidadesPendientes;
      } else {
        const stockDisponible = parseFloat(ubicacionesConStock[0].unidadSaldo) || 0;
        nuevaCantidad = Math.min(unidadesPendientes, stockDisponible);
      }
      
      handleExpedicionChange(key, 'cantidad', nuevaCantidad.toString());
    }
  }, [ubicacionesConStock, expedicion, key, linea.unidadesPendientes, linea.unidadPedido, handleExpedicionChange]);

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
  }, [linea.unidadesPendientes, linea.unidadBase, linea.unidadAlternativa, linea.factorConversion, formatearUnidad]);
  
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
    console.log(`[FRONTEND DEBUG] Cambiando ubicación a: ${nuevaUbicacion}`);
    
    const ubicacionSeleccionada = ubicacionesConStock.find(
      ubi => ubi.ubicacion === nuevaUbicacion
    );
    
    if (!ubicacionSeleccionada) {
      console.error('[FRONTEND ERROR] No se encontró la ubicación seleccionada:', nuevaUbicacion);
      return;
    }
    
    console.log(`[FRONTEND DEBUG] Ubicación seleccionada:`, ubicacionSeleccionada);
    
    let nuevaCantidad = 0;
    const unidadesPendientes = parseFloat(linea.unidadesPendientes) || 0;
    
    if (ubicacionSeleccionada.ubicacion === "Zona descarga") {
      nuevaCantidad = unidadesPendientes;
    } else {
      const stockDisponible = parseFloat(ubicacionSeleccionada.unidadSaldo) || 0;
      nuevaCantidad = Math.min(unidadesPendientes, stockDisponible);
    }
    
    // 🔥 CORRECCIÓN: Actualizar TODOS los campos necesarios
    handleExpedicionChange(key, 'ubicacion', nuevaUbicacion);
    handleExpedicionChange(key, 'almacen', ubicacionSeleccionada.codigoAlmacen);
    handleExpedicionChange(key, 'partida', ubicacionSeleccionada.partida || '');
    handleExpedicionChange(key, 'unidadMedida', ubicacionSeleccionada.unidadMedida || linea.unidadPedido);
    handleExpedicionChange(key, 'cantidad', nuevaCantidad.toString());
    
    console.log(`[FRONTEND DEBUG] Expedición actualizada:`, {
      ubicacion: nuevaUbicacion,
      almacen: ubicacionSeleccionada.codigoAlmacen,
      cantidad: nuevaCantidad,
      unidadMedida: ubicacionSeleccionada.unidadMedida
    });
  }, [handleExpedicionChange, key, linea.unidadesPendientes, linea.unidadPedido, ubicacionesConStock]);
  
  const formatearInfoStock = useCallback((ubicacion) => {
    if (ubicacion.ubicacion === "Zona descarga") {
      return "Stock disponible";
    }
    
    const stock = parseFloat(ubicacion.unidadSaldo);
    if (isNaN(stock)) return "Stock no disponible";
    
    return formatearUnidad(stock, ubicacion.unidadMedida);
  }, [formatearUnidad]);

  // 🔥 DEBUG: Verificar qué se está enviando
  console.log(`[FRONTEND DEBUG] ${linea.codigoArticulo} - Expedición actual:`, expedicion);
  console.log(`[FRONTEND DEBUG] Ubicaciones disponibles:`, ubicacionesConStock);

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
              disabled={!canPerformActions}
            >
              {ubicacionesConStock.map((ubicacion, locIndex) => (
                <option 
                  key={`${ubicacion.codigoAlmacen}-${ubicacion.ubicacion}-${ubicacion.partida || 'no-partida'}-${locIndex}`}
                  value={ubicacion.ubicacion}
                  className={ubicacion.ubicacion === "Zona descarga" ? 'ps-zona-descarga-option' : ''}
                >
                  {ubicacion.codigoAlmacen} - {ubicacion.ubicacion} 
                  {ubicacion.partida ? ` (${ubicacion.partida})` : ''} - 
                  {formatearInfoStock(ubicacion)}
                </option>
              ))}
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
              disabled={!canPerformActions}
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
              console.log(`[FRONTEND DEBUG] Iniciando escaneo para:`, {
                articulo: linea.codigoArticulo,
                expedicion: expedicion,
                ubicacionesDisponibles: ubicacionesConStock
              });
              if (canPerformActions) iniciarEscaneo(linea, pedido);
            }}
            disabled={!canPerformActions || parseFloat(expedicion.cantidad) <= 0 || isScanning}
          >
            <FaCamera /> {isScanning ? 'Procesando...' : 'Escanear'}
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
                    disabled={!canPerformActions}
                  >
                    {ubicacionesConStock.map((ubicacion, locIndex) => (
                      <option 
                        key={`${ubicacion.codigoAlmacen}-${ubicacion.ubicacion}-${ubicacion.partida || 'no-partida'}-${locIndex}`}
                        value={ubicacion.ubicacion}
                      >
                        {ubicacion.codigoAlmacen} - {ubicacion.ubicacion} 
                        {ubicacion.partida ? ` (${ubicacion.partida})` : ''} - 
                        {formatearInfoStock(ubicacion)}
                      </option>
                    ))}
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
                    disabled={!canPerformActions}
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
                    console.log(`[FRONTEND DEBUG] Iniciando escaneo para:`, {
                      articulo: linea.codigoArticulo,
                      expedicion: expedicion,
                      ubicacionesDisponibles: ubicacionesConStock
                    });
                    if (canPerformActions) iniciarEscaneo(linea, pedido);
                  }}
                  disabled={!canPerformActions || parseFloat(expedicion.cantidad) <= 0 || isScanning}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <FaCamera /> {isScanning ? 'Procesando...' : 'Escanear'}
                </button>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
});

// Componente Tarjeta de Pedido - VERSIÓN ACTUALIZADA CON NUEVOS CAMPOS
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
  onActualizarVoluminoso
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [actualizandoVoluminoso, setActualizandoVoluminoso] = useState(false);
  
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
            
            {/* ✅ NUEVO: Estado del pedido usando la columna Status */}
            <span className={`ps-status-pedido ps-status-${pedido.Status?.toLowerCase() || 'revision'}`}>
              {pedido.Status || 'Revisión'}
            </span>
            
            {pedido.PesoTotal > 0 && (
              <span className="ps-peso-total">
                <FaWeight /> {pedido.PesoTotal.toFixed(2)} kg
              </span>
            )}
            
            {/* ✅ MEJORADO: Indicador voluminoso más visible */}
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

            {/* ✅ NUEVA SECCIÓN: Información de contacto y observaciones web */}
            <div className="ps-contacto-info-grid">
              <div className="ps-contacto-item">
                <div className="ps-contacto-label">
                  <FaUser /> Contacto:
                </div>
                <div className="ps-contacto-value">
                  {pedido.contacto || 'CARLOS SÁNCHEZ'}
                </div>
              </div>
              
              <div className="ps-contacto-item">
                <div className="ps-contacto-label">
                  <FaPhone /> Teléfono:
                </div>
                <div className="ps-contacto-value">
                  {pedido.telefono || '660 333 000'}
                </div>
              </div>
              
              <div className="ps-contacto-item ps-observaciones-web">
                <div className="ps-contacto-label">
                  <FaInfoCircle /> Observaciones Web:
                </div>
                <div className="ps-contacto-value">
                  {pedido.observacionesWeb || 'LLEVAR JUNTO CON PEDIDO 19346'}
                </div>
              </div>
            </div>

            {/* ✅ MANTENEMOS SOLO LA OBRA - ELIMINAMOS DIRECCIÓN Y MUNICIPIO */}
            <div className="ps-pedido-detail-item ps-obra-item">
              <strong>Obra:</strong> {pedido.nombreObra || pedido.obra || 'Sin obra especificada'}
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
                      iniciarEscaneo={iniciarEscaneo}
                      abrirModalDetalles={abrirModalDetalles}
                      canPerformActions={canPerformActions}
                      isScanning={isScanning}
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

// Componente Modal de Cámara
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
        
        {cameraError ? (
          <div className="ps-camera-error">
            <div className="ps-error-icon">
              <FaExclamationTriangle />
            </div>
            <p>{cameraError}</p>
            <p>Por favor, introduce el código manualmente:</p>
            <div className="ps-manual-verification">
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
            <div className="ps-camera-selector">
              <label><FaCamera /> Seleccionar cámara:</label>
              <select 
                value={selectedCamera} 
                onChange={(e) => setSelectedCamera(e.target.value)}
                disabled={cameras.length === 0}
              >
                {cameras.map(camera => (
                  <option key={camera.id} value={camera.id}>
                    {camera.label || `Cámara ${camera.id}`}
                  </option>
                ))}
              </select>
            </div>
            
            <div id="ps-camera-container" className="ps-camera-view">
              <div className="ps-scan-frame">
                <div className="ps-frame-line top-left"></div>
                <div className="ps-frame-line top-right"></div>
                <div className="ps-frame-line bottom-left"></div>
                <div className="ps-frame-line bottom-right"></div>
              </div>
            </div>
            
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

// Componente Principal PedidosScreen - VERSIÓN ACTUALIZADA
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
  
  // ✅ NUEVO: Estado para el filtro de Status
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
  const scannerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Refs para evitar bucles en efectos
  const rangoFechasRef = useRef(rangoFechas);
  const userRef = useRef(user);

  // Actualizar refs cuando cambien los valores
  useEffect(() => {
    rangoFechasRef.current = rangoFechas;
  }, [rangoFechas]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // ✅ NUEVO: Opciones para el filtro de Status
  const opcionesStatus = useMemo(() => [
    { id: '', nombre: 'Todos los estados' },
    { id: 'PendienteProveedor', nombre: 'Pendiente Proveedor' },
    { id: 'Parcial', nombre: 'Parcial' },
    { id: 'Pendiente', nombre: 'Pendiente' }
  ], []);

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

  // Función para cargar pedidos con cancelación - MODIFICADA
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
      }
      
      const codigoEmpresa = userRef.current?.CodigoEmpresa;
      const rango = rangoFechasRef.current;
      
      if (!codigoEmpresa) {
        setError('No se encontró el código de empresa del usuario.');
        setLoading(false);
        return;
      }
      
      const headers = getAuthHeader();
      
      // ✅ ACTUALIZADO: Eliminamos el parámetro formaEntrega
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
      
      const articulosConUnidad = response.data.flatMap(pedido => 
        pedido.articulos.map(articulo => ({
          codigo: articulo.codigoArticulo,
          unidad: articulo.unidadPedido
        }))
      );

      // 🔥 FORZAR RECARGA COMPLETA DE UBICACIONES CON DATOS REALES
      if (articulosConUnidad.length > 0) {
        try {
          console.log('[DEBUG] Recargando ubicaciones para', articulosConUnidad.length, 'artículos');
          
          const ubicacionesPorArticulo = {};
          
          // Usar el endpoint de traspasos que sabemos que funciona
          for (const articulo of articulosConUnidad) {
            try {
              const response = await API.get(
                '/traspasos/stock-por-articulo',
                {
                  headers,
                  params: { codigoArticulo: articulo.codigo },
                  signal
                }
              );
              
              // Normalizar los datos al formato esperado
              ubicacionesPorArticulo[articulo.codigo] = response.data.map(item => ({
                codigoAlmacen: item.CodigoAlmacen,
                ubicacion: item.Ubicacion,
                partida: item.Partida || null,
                unidadSaldo: item.Cantidad,
                unidadMedida: item.UnidadStock || 'unidades',
                descripcionUbicacion: item.DescripcionUbicacion
              }));
              
              console.log(`[DEBUG] ${articulo.codigo}: ${response.data.length} ubicaciones`);
            } catch (error) {
              console.error(`[ERROR] Al cargar ubicaciones para ${articulo.codigo}:`, error);
              ubicacionesPorArticulo[articulo.codigo] = [];
            }
          }
          
          if (signal.aborted) return;
          setUbicaciones(ubicacionesPorArticulo);
          
          // 🔥 ACTUALIZAR EXPEDICIONES CON DATOS REALES DEL BACKEND
          const nuevasExpediciones = {};
          response.data.forEach(pedido => {
            pedido.articulos.forEach(linea => {
              const key = linea.movPosicionLinea;
              const ubicacionesArticulo = ubicacionesPorArticulo[linea.codigoArticulo] || [];
              
              // Buscar la mejor ubicación disponible (ya viene ordenado por stock DESC del backend)
              let mejorUbicacion = ubicacionesArticulo[0];
              
              let cantidadInicial = 0;
              if (mejorUbicacion) {
                const unidadesPendientes = parseFloat(linea.unidadesPendientes) || 0;
                
                if (mejorUbicacion.ubicacion === "Zona descarga") {
                  cantidadInicial = unidadesPendientes;
                } else {
                  const stockDisponible = parseFloat(mejorUbicacion.unidadSaldo) || 0;
                  cantidadInicial = Math.min(unidadesPendientes, stockDisponible);
                }
              }

              if (isNaN(cantidadInicial)) cantidadInicial = 0;
              
              nuevasExpediciones[key] = {
                almacen: mejorUbicacion?.codigoAlmacen || "CEN",
                ubicacion: mejorUbicacion?.ubicacion || "Zona descarga",
                partida: mejorUbicacion?.partida || null,
                unidadMedida: mejorUbicacion?.unidadMedida || linea.unidadPedido,
                cantidad: cantidadInicial.toString()
              };
            });
          });
          
          if (signal.aborted) return;
          setExpediciones(nuevasExpediciones);
          
        } catch (error) {
          console.error('[ERROR] Al cargar ubicaciones:', error);
        }
      }
      
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
  }, [isScanning]); // 🔥 Añadimos isScanning como dependencia

  // 🔥 FUNCIÓN handleExpedir COMPLETAMENTE CORREGIDA - SIN REINICIO COMPLETO
  const handleExpedir = useCallback(async (codigoEmpresa, ejercicio, serie, numeroPedido, codigoArticulo, unidadesPendientes, linea, detalle = null) => {
    if (!canPerformActions || isScanning) return;
    
    setIsScanning(true);
    const key = linea.movPosicionLinea;
    
    const expedicion = expediciones[key];
    
    // 🔥 VERIFICACIÓN CRÍTICA: Asegurar que tenemos los datos correctos
    if (!expedicion) {
      console.error('[FRONTEND ERROR] No se encontró expedición para la línea:', key);
      setIsScanning(false);
      return;
    }

    console.log('[FRONTEND DEBUG EXPEDICIÓN] Datos a enviar al backend:', {
      articulo: codigoArticulo,
      expedicion: expedicion,
      linea: linea
    });

    let cantidadExpedida = parseFloat(expedicion.cantidad);
    if (isNaN(cantidadExpedida) || cantidadExpedida <= 0) {
      alert("La cantidad debe ser mayor a cero");
      setIsScanning(false);
      return;
    }

    try {
      const headers = getAuthHeader();
      
      const datosExpedicion = {
        codigoEmpresa,
        ejercicio,
        serie: serie || '',
        numeroPedido,
        codigoArticulo,
        cantidadExpedida,
        almacen: expedicion.almacen,
        ubicacion: expedicion.ubicacion,
        partida: expedicion.partida || '',
        unidadMedida: expedicion.unidadMedida || linea.unidadPedido,
        esZonaDescarga: expedicion.ubicacion === "Zona descarga",
        movPosicionLinea: key,
        codigoColor: detalle?.codigoColor || '',
        codigoTalla: detalle?.codigoTalla || ''
      };

      console.log('[FRONTEND DEBUG] Enviando datos al backend:', datosExpedicion);

      const response = await API.post(
        '/actualizarLineaPedido',
        datosExpedicion,
        { headers }
      );

      if (response.data.success) {
        console.log('[FRONTEND DEBUG] Expedición exitosa:', response.data);
        
        // ✅ CORRECCIÓN CRÍTICA: ACTUALIZACIÓN LOCAL SIN RECARGAR TODO
        
        // 1. Actualizar expediciones (resetear cantidad a 0)
        setExpediciones(prev => ({
          ...prev,
          [key]: {
            ...prev[key],
            cantidad: '0' // Resetear a 0 después de expedir
          }
        }));

        // 2. Actualizar ubicaciones (reducir stock)
        if (expedicion.ubicacion !== "Zona descarga") {
          setUbicaciones(prev => {
            const nuevasUbicaciones = { ...prev };
            const ubicacionesArticulo = nuevasUbicaciones[linea.codigoArticulo] || [];
            
            const ubicacionesActualizadas = ubicacionesArticulo.map(ubic => {
              // 🔥 CORRECCIÓN: Comparación más estricta incluyendo unidad de medida normalizada
              if (ubic.ubicacion === expedicion.ubicacion && 
                  ubic.codigoAlmacen === expedicion.almacen &&
                  normalizarUnidad(ubic.unidadMedida) === normalizarUnidad(expedicion.unidadMedida)) {
                
                // Restar la cantidad expedida del stock
                const stockActual = parseFloat(ubic.unidadSaldo) || 0;
                const nuevoStock = Math.max(0, stockActual - cantidadExpedida);
                
                console.log(`[DEBUG STOCK] Actualizando stock de ${ubic.ubicacion}: ${stockActual} -> ${nuevoStock} ${ubic.unidadMedida}`);
                
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

        // 3. Actualizar pedidos localmente (solo la línea afectada)
        setPedidos(prev => prev.map(pedido => {
          if (pedido.numeroPedido === numeroPedido) {
            const articulosActualizados = pedido.articulos.map(articulo => {
              if (articulo.movPosicionLinea === key) {
                const nuevasUnidadesPendientes = Math.max(0, parseFloat(articulo.unidadesPendientes) - cantidadExpedida);
                
                return {
                  ...articulo,
                  unidadesPendientes: nuevasUnidadesPendientes
                };
              }
              return articulo;
            });
            
            return {
              ...pedido,
              articulos: articulosActualizados
            };
          }
          return pedido;
        }));

        alert(`✅ Se expedieron ${cantidadExpedida} unidades correctamente.`);
      }
    } catch (error) {
      console.error('[FRONTEND ERROR] Error al expedir artículo:', error);
      console.error('Respuesta del servidor:', error.response?.data);
      
      if (error.response?.data?.mensaje) {
        alert('❌ Error al expedir artículo: ' + error.response.data.mensaje);
      } else {
        alert('❌ Error al expedir artículo: ' + error.message);
      }
    } finally {
      setIsScanning(false);
    }
  }, [canPerformActions, isScanning, expediciones, ubicaciones]);
  // 🔥 QUITAMOS cargarPedidos DE LAS DEPENDENCIAS

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
  // 🔥 QUITAMOS cargarPedidos DE LAS DEPENDENCIAS

  // ✅ MOVER handleScanSuccess ANTES de los efectos que lo usan
  const handleScanSuccess = useCallback((decodedText) => {
    if (!currentScanningLine) return;
    
    const { linea, pedido, detalle } = currentScanningLine;
    
    if (decodedText === linea.codigoArticulo || decodedText === linea.codigoAlternativo) {
      handleExpedir(
        pedido.codigoEmpresa,
        pedido.ejercicioPedido,
        pedido.seriePedido,
        pedido.numeroPedido,
        linea.codigoArticulo,
        linea.unidadesPendientes,
        linea,
        detalle
      );
      
      if (detalle) {
        const itemKey = `${linea.codigoArticulo}-${detalle.talla}-${detalle.color}`;
        setScannedItems(prev => ({
          ...prev,
          [itemKey]: (prev[itemKey] || 0) + 1
        }));
      }
    } else {
      alert('Código escaneado no coincide con el artículo');
    }
    
    setShowCamera(false);
  }, [currentScanningLine, handleExpedir]);

  // ✅ MOVER handleManualVerification ANTES de los efectos que lo usan
  const handleManualVerification = useCallback(() => {
    if (!currentScanningLine || !manualCode) return;
    
    const { linea, pedido, detalle } = currentScanningLine;
    
    if (manualCode === linea.codigoArticulo || manualCode === linea.codigoAlternativo) {
      handleExpedir(
        pedido.codigoEmpresa,
        pedido.ejercicioPedido,
        pedido.seriePedido,
        pedido.numeroPedido,
        linea.codigoArticulo,
        linea.unidadesPendientes,
        linea,
        detalle
      );
      
      if (detalle) {
        const itemKey = `${linea.codigoArticulo}-${detalle.talla}-${detalle.color}`;
        setScannedItems(prev => ({
          ...prev,
          [itemKey]: (prev[itemKey] || 0) + 1
        }));
      }
    } else {
      alert('Código introducido no coincide con el artículo');
    }
    
    setShowCamera(false);
    setManualCode('');
  }, [currentScanningLine, manualCode, handleExpedir]);

  // ✅ MOVER iniciarEscaneo ANTES de los efectos que lo usan
  const iniciarEscaneo = useCallback((linea, pedido, detalle = null) => {
    if (!canPerformActions) return;
    
    setCurrentScanningLine({ linea, pedido, detalle });
    setShowCamera(true);
    setManualCode('');
  }, [canPerformActions]);

  useEffect(() => {
    cargarPedidos();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [rangoFechas, cargarPedidos]);

  // ✅ EFECTO MEJORADO: Detectar cámaras disponibles con Html5Qrcode
  useEffect(() => {
    if (showCamera) {
      const detectarCamaras = async () => {
        try {
          setCameraError('');
          console.log('🔍 Detectando cámaras disponibles...');
          
          // Usar Html5Qrcode para detectar cámaras
          const dispositivos = await Html5Qrcode.getCameras();
          
          if (dispositivos && dispositivos.length > 0) {
            console.log(`📷 Se encontraron ${dispositivos.length} cámaras:`, dispositivos);
            setCameras(dispositivos);
            setSelectedCamera(dispositivos[0].id);
          } else {
            setCameraError('No se encontraron cámaras disponibles en el dispositivo.');
          }
        } catch (error) {
          console.error('❌ Error al detectar cámaras:', error);
          
          if (error.includes('NotAllowedError') || error.includes('Permission denied')) {
            setCameraError('Permiso de cámara denegado. Por favor, permite el acceso a la cámara en la configuración de tu navegador.');
          } else if (error.includes('NotFoundError') || error.includes('No camera found')) {
            setCameraError('No se encontró ninguna cámara en el dispositivo.');
          } else {
            setCameraError('Error al acceder a la cámara: ' + error);
          }
        }
      };

      detectarCamaras();
    }
  }, [showCamera]);

  // ✅ EFECTO MEJORADO: Inicializar escáner cuando se selecciona una cámara
  useEffect(() => {
    let scanner = null;

    const inicializarEscaner = async () => {
      if (showCamera && selectedCamera && document.getElementById('ps-camera-container')) {
        try {
          console.log('🚀 Inicializando escáner con cámara:', selectedCamera);
          
          scanner = new Html5QrcodeScanner(
            "ps-camera-container",
            { 
              fps: 10, 
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
              deviceId: selectedCamera
            },
            false
          );
          
          await scanner.render(
            (decodedText) => {
              console.log('✅ Código escaneado:', decodedText);
              handleScanSuccess(decodedText);
            },
            (error) => {
              // Ignorar errores de escaneo (son normales mientras se busca el código)
              if (!error.includes('No MultiFormat Readers')) {
                console.log('🔍 Escaneando...', error);
              }
            }
          );
          
          scannerRef.current = scanner;
          console.log('📱 Escáner inicializado correctamente');
        } catch (error) {
          console.error('❌ Error al inicializar el escáner:', error);
          setCameraError('Error al inicializar la cámara: ' + error);
        }
      }
    };

    inicializarEscaner();

    // Cleanup function
    return () => {
      if (scanner) {
        console.log('🧹 Limpiando escáner...');
        scanner.clear().catch(error => {
          console.log('⚠️ Error al limpiar escáner (normal durante desarrollo):', error);
        });
        scanner = null;
        scannerRef.current = null;
      }
    };
  }, [showCamera, selectedCamera, handleScanSuccess]);

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
        
        alert(`✅ Albarán parcial generado correctamente\nNúmero: ${response.data.albaran.serie}${response.data.albaran.numero}\nEstado del pedido: ${response.data.statusPedido}`);
      }
    } catch (error) {
      console.error('Error al generar albarán parcial:', error);
      
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
  }, [canPerformActionsInPedidos]);

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