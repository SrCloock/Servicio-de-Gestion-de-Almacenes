import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { Html5Qrcode } from 'html5-qrcode';
import { usePermissions } from '../PermissionsManager';
import '../styles/PedidosScreen.css';
import { FaEllipsisV, FaCamera, FaQrcode, FaBarcode, FaCheck, FaTimes, FaExclamationTriangle, FaChevronDown, FaSearch, FaCalendarAlt, FaTruck, FaInfoCircle, FaSync, FaFilter, FaWeight, FaBox } from 'react-icons/fa';

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

// Función para formatear unidades (optimizada con useMemo)
const useFormatearUnidad = () => {
  return useMemo(() => (cantidad, unidad) => {
    if (!cantidad && cantidad !== 0) return '0 ud';
    if (!unidad || unidad.trim() === '') unidad = 'ud';
    
    let cantidadNum = typeof cantidad === 'string' ? parseFloat(cantidad) : cantidad;
    
    if (isNaN(cantidadNum)) return `${cantidad} ${unidad}`;
    
    const unidadesDecimales = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3'];
    const esUnidadDecimal = unidadesDecimales.includes(unidad.toLowerCase());
    
    if (!esUnidadDecimal) {
      cantidadNum = Math.round(cantidadNum);
    } else {
      cantidadNum = parseFloat(cantidadNum.toFixed(2));
    }
    
    const unidadesInvariables = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3'];
    const unidadLower = unidad.toLowerCase();
    
    if (unidadesInvariables.includes(unidadLower)) {
      return `${cantidadNum} ${unidad}`;
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
      if (unidadLower === 'unidad' || unidadLower === 'unidades') {
        return '1 unidad';
      }
      return `1 ${unidad}`;
    } else {
      if (unidadLower === 'unidad' || unidadLower === 'unidades') {
        return `${cantidadNum} unidades`;
      }
      
      if (pluralesIrregulares[unidadLower]) {
        return `${cantidadNum} ${pluralesIrregulares[unidadLower]}`;
      }
      
      const ultimaLetra = unidad.charAt(unidad.length - 1);
      const penultimaLetra = unidad.charAt(unidad.length - 2);
      
      if (['a', 'e', 'i', 'o', 'u'].includes(ultimaLetra)) {
        return `${cantidadNum} ${unidad}s`;
      } else {
        return `${cantidadNum} ${unidad}es`;
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
          const response = await axios.get(
            'http://localhost:3000/stock/por-variante',
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
          if (axios.isCancel(error)) {
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
                                  {ubic.CodigoAlmacen} - {ubic.Ubicacion} {ubic.Partida ? `(${ubic.Partida})` : ''} - 
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

// Componente Línea de Pedido
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
    
    let ubicacionesConStockReal = ubicacionesArticulo.filter(ubi => {
      const tieneStock = parseFloat(ubi.unidadSaldo) > 0;
      const unidadCoincide = ubi.unidadMedida === linea.unidadPedido;
      const noEsZonaDescarga = ubi.ubicacion !== "Zona descarga";
      
      return tieneStock && unidadCoincide && noEsZonaDescarga;
    });

    if (ubicacionesConStockReal.length === 0) {
      ubicacionesConStockReal = ubicacionesArticulo.filter(ubi => 
        ubi.ubicacion !== "Zona descarga" && ubi.unidadMedida === linea.unidadPedido
      );
    }

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

    const ubicacionesOrdenadas = ubicacionesConStockReal.sort((a, b) => {
      const stockA = a.unidadSaldo === Infinity ? 999999 : parseFloat(a.unidadSaldo);
      const stockB = b.unidadSaldo === Infinity ? 999999 : parseFloat(b.unidadSaldo);
      return stockB - stockA;
    });
    
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
      ubi => ubi.ubicacion === expedicion.ubicacion
    );
    
    let maxPermitido = unidadesPendientes;
    
    if (ubicacionSeleccionada && 
        ubicacionSeleccionada.ubicacion !== "Zona descarga" && 
        ubicacionSeleccionada.unidadSaldo !== Infinity) {
      // ✅ USAR EL STOCK ACTUALIZADO para la validación
      const stockDisponible = parseFloat(ubicacionSeleccionada.unidadSaldo) || 0;
      maxPermitido = Math.min(unidadesPendientes, stockDisponible);
    }
    
    if (cantidad > maxPermitido) {
      return maxPermitido.toString();
    }
    
    return newValue;
  }, [expedicion.ubicacion, linea.unidadesPendientes, ubicacionesConStock]);
  
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
      // ✅ USAR EL STOCK ACTUALIZADO para calcular la cantidad
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
    
    return `${stock} ${ubicacion.unidadMedida || 'ud'}`;
  }, []);

  return (<>
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
                  key={`${ubicacion.ubicacion}-${ubicacion.partida || 'no-partida'}-${locIndex}`}
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
                        key={`${ubicacion.ubicacion}-${ubicacion.partida || 'no-partida'}-${locIndex}`}
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
    </>);
});

// Componente Tarjeta de Pedido
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
            <span className={`ps-status-pedido ps-status-${pedido.Status?.toLowerCase() || 'revision'}`}>
              {pedido.Status || 'Revisión'}
            </span>
            {pedido.PesoTotal > 0 && (
              <span className="ps-peso-total">
                <FaWeight /> {pedido.PesoTotal.toFixed(2)} kg
              </span>
            )}
            {pedido.EsVoluminoso && (
              <span className="ps-voluminoso-badge">
                <FaBox /> VOLUMINOSO
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

            <div className="ps-pedido-detail-item">
              <strong>Forma de entrega:</strong> {pedido.formaEntrega}
            </div>
            <div className="ps-pedido-detail-item">
              <strong>Obra:</strong> {pedido.obra || 'Sin obra especificada'}
            </div>
            <div className="ps-pedido-detail-item">
              <strong>Dirección:</strong> {pedido.domicilio}
            </div>
            <div className="ps-pedido-detail-item">
              <strong>Municipio:</strong> {pedido.municipio}
            </div>
            
            <div className="ps-observaciones-container">
              <strong>Observaciones:</strong>
              <div className="ps-observaciones-content">
                {pedido.observaciones || 'Sin observaciones'}
              </div>
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

// Componente Principal PedidosScreen
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
  const [filtroFormaEntrega, setFiltroFormaEntrega] = useState('');
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
  const filtroFormaEntregaRef = useRef(filtroFormaEntrega);
  const userRef = useRef(user);

  // Actualizar refs cuando cambien los valores
  useEffect(() => {
    rangoFechasRef.current = rangoFechas;
  }, [rangoFechas]);

  useEffect(() => {
    filtroFormaEntregaRef.current = filtroFormaEntrega;
  }, [filtroFormaEntrega]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const formasEntrega = useMemo(() => [
    { id: 1, nombre: 'Recogida Guadalhorce' },
    { id: 3, nombre: 'Nuestros Medios' },
    { id: 4, nombre: 'Agencia' },
    { id: 5, nombre: 'Directo Fabrica' },
    { id: 6, nombre: 'Pedido Express' }
  ], []);

  // ✅ FUNCIÓN: Actualizar estado voluminoso
  const handleActualizarVoluminoso = useCallback(async (pedido, esVoluminoso) => {
    if (!canPerformActionsInPedidos) return;
    
    try {
      const headers = getAuthHeader();
      
      const response = await axios.post(
        'http://localhost:3000/pedidos/actualizar-voluminoso',
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

  // Función para cargar pedidos con cancelación
  const cargarPedidos = useCallback(async (forzarRecarga = false) => {
    if (abortControllerRef.current && !forzarRecarga) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    try {
      setLoading(true);
      setError('');
      
      // ✅ LIMPIAR ESTADOS ANTES DE RECARGAR
      if (forzarRecarga) {
        setUbicaciones({});
        setExpediciones({});
      }
      
      const codigoEmpresa = userRef.current?.CodigoEmpresa;
      const rango = rangoFechasRef.current;
      const formaEntrega = filtroFormaEntregaRef.current;
      
      if (!codigoEmpresa) {
        setError('No se encontró el código de empresa del usuario.');
        setLoading(false);
        return;
      }
      
      const headers = getAuthHeader();
      
      const response = await axios.get(`http://localhost:3000/pedidosPendientes`, { 
        headers,
        params: { 
          codigoEmpresa,
          rango: rango,
          formaEntrega: formaEntrega 
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
          
          const responseUbicaciones = await axios.post(
            'http://localhost:3000/ubicacionesMultiples',
            { articulos: articulosConUnidad },
            { headers, signal }
          );
          
          if (signal.aborted) return;
          
          console.log('[DEBUG] Ubicaciones cargadas:', Object.keys(responseUbicaciones.data).length, 'artículos con ubicaciones');
          
          setUbicaciones(responseUbicaciones.data);
          
          // 🔥 ACTUALIZAR EXPEDICIONES CON DATOS REALES DEL BACKEND
          const nuevasExpediciones = {};
          response.data.forEach(pedido => {
            pedido.articulos.forEach(linea => {
              const key = linea.movPosicionLinea;
              const ubicacionesArticulo = responseUbicaciones.data[linea.codigoArticulo] || [];
              
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
      if (axios.isCancel(err)) {
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
  }, []);

  // 🔥 FUNCIÓN handleExpedir COMPLETAMENTE CORREGIDA - CON ACTUALIZACIÓN DE UBICACIONES
  const handleExpedir = useCallback(async (codigoEmpresa, ejercicio, serie, numeroPedido, codigoArticulo, unidadesPendientes, linea, detalle = null) => {
    if (!canPerformActions || isScanning) return;
    
    setIsScanning(true);
    const key = linea.movPosicionLinea;
    
    console.log('[FRONTEND DEBUG EXPEDICIÓN] Iniciando expedición:', {
      articulo: codigoArticulo,
      unidad: linea.unidadPedido,
      movPosicionLinea: key,
      cantidad: expediciones[key]?.cantidad,
      ubicacion: expediciones[key]?.ubicacion,
      almacen: expediciones[key]?.almacen,
      unidadMedida: expediciones[key]?.unidadMedida,
      lineaCompleta: linea
    });

    const expedicion = expediciones[key];
    
    if (!expedicion) {
      console.error('[ERROR] No se encontró expedición para la línea:', key);
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
      const headers = getAuthHeader();
      
      // VERIFICACIÓN DE STOCK
      if (expedicion.ubicacion !== "Zona descarga") {
        const ubicacionesArticulo = ubicaciones[linea.codigoArticulo] || [];
        const ubicacionActual = ubicacionesArticulo.find(ubi => 
          ubi.ubicacion === expedicion.ubicacion && 
          ubi.codigoAlmacen === expedicion.almacen &&
          ubi.unidadMedida === expedicion.unidadMedida
        );
        
        if (!ubicacionActual) {
          alert("❌ La ubicación seleccionada ya no está disponible. Por favor, selecciona otra ubicación.");
          setIsScanning(false);
          return;
        }
        
        const stockActual = ubicacionActual.unidadSaldo;
        if (stockActual < cantidadExpedida) {
          alert(`❌ Stock insuficiente. Solo hay ${stockActual} unidades disponibles en ${expedicion.ubicacion}`);
          setIsScanning(false);
          return;
        }
      }

      if (expedicion.ubicacion !== "Zona descarga" && cantidadExpedida > unidadesPendientes) {
        alert(`No puedes expedir más de ${unidadesPendientes} unidades (pendientes)`);
        setIsScanning(false);
        return;
      }

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
        movPosicionLinea: key
      };

      console.log('[FRONTEND DEBUG] Enviando datos al backend:', datosExpedicion);

      if (detalle) {
        datosExpedicion.codigoColor = detalle.color;
        datosExpedicion.codigoTalla = detalle.talla;
      }

      const response = await axios.post(
        'http://localhost:3000/actualizarLineaPedido',
        datosExpedicion,
        { headers }
      );

      if (response.data.success) {
        console.log('[FRONTEND DEBUG] Expedición exitosa:', response.data);
        
        // ✅ CORRECCIÓN CRÍTICA: ACTUALIZAR EL ESTADO LOCAL DE EXPEDICIONES - RESETEAR A 0
        setExpediciones(prev => ({
          ...prev,
          [key]: {
            ...prev[key],
            cantidad: '0' // Resetear a 0 después de expedir
          }
        }));

        // ✅ CORRECCIÓN CRÍTICA: ACTUALIZAR EL STOCK EN LAS UBICACIONES
        if (expedicion.ubicacion !== "Zona descarga") {
          setUbicaciones(prev => {
            const nuevasUbicaciones = { ...prev };
            const ubicacionesArticulo = nuevasUbicaciones[linea.codigoArticulo] || [];
            
            const ubicacionesActualizadas = ubicacionesArticulo.map(ubic => {
              // 🔥 CORRECCIÓN: Comparación más estricta incluyendo unidad de medida
              if (ubic.ubicacion === expedicion.ubicacion && 
                  ubic.codigoAlmacen === expedicion.almacen &&
                  ubic.unidadMedida === expedicion.unidadMedida) {
                
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

        // RECARGAR COMPLETAMENTE LOS PEDIDOS
        await cargarPedidos(true);
        
        alert(`✅ Se expedieron ${cantidadExpedida} unidades correctamente. ${expedicion.ubicacion !== "Zona descarga" ? `Stock restante: ${response.data.detalles.stockRestante}` : 'Desde Zona de descarga'}`);
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
  }, [canPerformActions, isScanning, expediciones, ubicaciones, cargarPedidos]);

  useEffect(() => {
    cargarPedidos();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [rangoFechas, filtroFormaEntrega, cargarPedidos]);

  useEffect(() => {
    if (showCamera && Html5Qrcode) {
      Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length) {
          setCameras(devices);
          setSelectedCamera(devices[0].id);
          setCameraError('');
        } else {
          setCameraError('No se encontraron cámaras disponibles.');
        }
      }).catch(err => {
        console.error("Error al obtener cámaras:", err);
        setCameraError('No se pudo acceder a la cámara. Por favor, verifica los permisos.');
      });
    }
  }, [showCamera]);

  useEffect(() => {
    if (showCamera && selectedCamera && !scannerRef.current) {
      const scanner = new Html5QrcodeScanner(
        "ps-camera-container",
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          deviceId: selectedCamera
        },
        false
      );
      
      scanner.render(
        (decodedText) => handleScanSuccess(decodedText),
        (error) => console.error("Error al escanear:", error)
      );
      
      scannerRef.current = scanner;
    }
    
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(error => {
          console.error("Error al limpiar el escáner:", error);
        });
        scannerRef.current = null;
      }
    };
  }, [showCamera, selectedCamera]);

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

  const handleExpedirVariante = useCallback(async (datosVariante) => {
    const { articulo, color, talla, cantidad, ubicacion, almacen, partida, unidadMedida, movPosicionLinea } = datosVariante;
    const { pedido, linea } = detallesModal;

    try {
      const headers = getAuthHeader();
      
      const response = await axios.post(
        'http://localhost:3000/actualizarLineaPedido',
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
        await cargarPedidos(true);
        setDetallesModal(null);
        alert(`Expedición realizada: ${cantidad} unidades de la variante`);
        return Promise.resolve();
      }
    } catch (error) {
      console.error('Error al expedir variante:', error);
      alert('Error al expedir: ' + (error.response?.data?.mensaje || error.message));
      return Promise.reject(error);
    }
  }, [detallesModal, cargarPedidos]);

  const iniciarEscaneo = useCallback((linea, pedido, detalle = null) => {
    if (!canPerformActions) return;
    
    setCurrentScanningLine({ linea, pedido, detalle });
    setShowCamera(true);
    setManualCode('');
  }, [canPerformActions]);

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

      const response = await axios.post(
        'http://localhost:3000/generarAlbaranParcial',
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
      
      return (
        pedido.numeroPedido.toString().includes(searchText) ||
        pedido.razonSocial.toLowerCase().includes(searchText) ||
        pedido.domicilio.toLowerCase().includes(searchText) ||
        (pedido.obra && pedido.obra.toLowerCase().includes(searchText))
      );
    });
  }, [pedidos, debouncedFiltroBusqueda]);

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
                  placeholder="Nº pedido, cliente, dirección, obra..."
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
            <div className="ps-filtro-group ps-delivery-group">
              <label><FaTruck /> Forma de entrega:</label>
              <div className="ps-select-container">
                <select
                  value={filtroFormaEntrega}
                  onChange={e => setFiltroFormaEntrega(e.target.value)}
                  className="ps-sort-select"
                >
                  <option value="">Todas</option>
                  {formasEntrega.map(forma => (
                    <option key={forma.id} value={forma.id}>
                      {forma.nombre}
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