import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { Html5Qrcode } from 'html5-qrcode';
import { usePermissions } from '../PermissionsManager';
import '../styles/PedidosScreen.css';
import { FaEllipsisV, FaCamera, FaQrcode, FaBarcode, FaCheck, FaTimes, FaExclamationTriangle, FaChevronDown, FaSearch, FaCalendarAlt, FaTruck, FaInfoCircle, FaSync, FaFilter } from 'react-icons/fa';

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
  <div className="loading-container">
    <div className="spinner"></div>
    <p>{message}</p>
  </div>
));

// Componente de error mejorado
const ErrorMessage = React.memo(({ message, onRetry }) => (
  <div className="error-message">
    <FaExclamationTriangle className="error-icon" />
    <p>{message}</p>
    {onRetry && (
      <button onClick={onRetry} className="btn-retry">
        <FaSync /> Reintentar
      </button>
    )}
  </div>
));

// Componente Modal de Detalles de Artículo (Optimizado)
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

  // Cargar stock cuando abrimos el modal
  useEffect(() => {
    if (!detalles || detalles.length === 0) {
      setCargandoUbicaciones(false);
      return;
    }

    const cargarUbicaciones = async () => {
      setCargandoUbicaciones(true);
      setErroresCarga({});
      const resultados = {};
      const nuevosErrores = {};

      for (const detalle of detalles) {
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

    if (parseFloat(seleccion.cantidad) <= 0) {
      alert("La cantidad debe ser mayor a cero.");
      return;
    }

    setProcesando(true);
    
    try {
      // Buscar la ubicación seleccionada para obtener todos los datos necesarios
      const ubicaciones = ubicacionesPorDetalle[detalleKey] || [];
      const ubicacionSeleccionada = ubicaciones.find(ubic => ubic.Ubicacion === seleccion.ubicacion);
      
      if (!ubicacionSeleccionada) {
        alert("Error: No se encontró la ubicación seleccionada.");
        setProcesando(false);
        return;
      }

      // Llamar a la función de expedición con todos los datos necesarios
      await onExpedirVariante({
        articulo: detalle.codigoArticulo,
        color: detalle.codigoColor,
        talla: detalle.codigoTalla,
        cantidad: parseFloat(seleccion.cantidad),
        ubicacion: seleccion.ubicacion,
        almacen: ubicacionSeleccionada.CodigoAlmacen,
        partida: ubicacionSeleccionada.Partida || '',
        unidadMedida: ubicacionSeleccionada.UnidadMedida || linea.unidadBase
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

  if (!detalles || detalles.length === 0) {
    return (
      <div className="modal-detalles" onClick={onClose}>
        <div className="modal-contenido modal-detalles-contenido" onClick={e => e.stopPropagation()}>
          <button className="cerrar-modal" onClick={onClose}><FaTimes /></button>
          <h3 className="modal-titulo">Artículo: {linea.descripcionArticulo}</h3>
          <div className="modal-no-variantes">
            <p>No hay variantes disponibles para este artículo.</p>
            <button className="btn-cerrar-modal" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-detalles" onClick={onClose}>
      <div className="modal-contenido modal-detalles-contenido" onClick={e => e.stopPropagation()}>
        <button className="cerrar-modal" onClick={onClose}><FaTimes /></button>
        <h3 className="modal-titulo">Artículo: {linea.descripcionArticulo}</h3>
        <div className="modal-subtitulo">
          <span>Código: {linea.codigoArticulo}</span>
          <span>Unidad: {linea.unidadBase || 'ud'}</span>
        </div>

        {cargandoUbicaciones ? (
          <LoadingSpinner message="Cargando información de stock..." />
        ) : (
          <div className="tabla-detalles-container">
            <table className="tabla-detalles">
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
                {detalles.map((detalle, index) => {
                  const key = `${detalle.codigoArticulo}-${detalle.codigoColor}-${detalle.codigoTalla}`;
                  const ubicaciones = ubicacionesPorDetalle[key] || [];
                  const seleccion = selecciones[key] || {};
                  const error = erroresCarga[key];

                  return (
                    <tr key={index} className={ubicaciones.length === 0 ? 'sin-stock-row' : ''}>
                      <td>{detalle.colorNombre || detalle.codigoColor}</td>
                      <td>{detalle.descripcionTalla || detalle.codigoTalla}</td>
                      <td>{formatearUnidad(detalle.cantidadPendiente, linea.unidadBase)}</td>
                      <td>
                        {error ? (
                          <ErrorMessage message="Error al cargar ubicaciones" />
                        ) : ubicaciones.length > 0 ? (
                          <div className="ubicacion-select-container">
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
                            <div className="select-arrow"><FaChevronDown /></div>
                          </div>
                        ) : (
                          <span className="sin-stock">Sin stock disponible</span>
                        )}
                      </td>
                      <td>
                        <div className="cantidad-input-container">
                          <input
                            type="number"
                            value={seleccion.cantidad || ""}
                            min={0}
                            max={detalle.cantidadPendiente}
                            onChange={(e) => handleCambioSeleccion(key, "cantidad", e.target.value)}
                            disabled={!canPerformActions || ubicaciones.length === 0 || !!error}
                            placeholder="0"
                          />
                          <span className="unidad-info">{linea.unidadBase || 'ud'}</span>
                        </div>
                      </td>
                      <td>
                        <button
                          className="btn-expedir-variante"
                          onClick={() => handleExpedir(detalle)}
                          disabled={!canPerformActions || !seleccion.ubicacion || !seleccion.cantidad || parseFloat(seleccion.cantidad) <= 0 || procesando || !!error}
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

        <div className="modal-actions">
          <button 
            className="btn-cerrar-modal"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
});

// Componente Línea de Pedido (Optimizado)
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
    let ubicacionesStock = ubicaciones[linea.codigoArticulo]?.filter(ubi => 
      ubi.unidadSaldo > 0 && 
      ubi.unidadMedida === linea.unidadPedido
    ) || [];
    
    if (ubicacionesStock.length === 0) {
      ubicacionesStock.push({
        codigoAlmacen: "N/A",
        ubicacion: "Zona descarga",
        partida: null,
        unidadSaldo: Infinity,
        unidadMedida: linea.unidadBase || 'ud'
      });
    }
    
    return ubicacionesStock;
  }, [ubicaciones, linea.codigoArticulo, linea.unidadPedido, linea.unidadBase]);

  const key = linea.movPosicionLinea;
  const expedicion = expediciones[key] || {
    almacen: ubicacionesConStock[0]?.codigoAlmacen || '',
    ubicacion: ubicacionesConStock[0]?.ubicacion || '',
    partida: ubicacionesConStock[0]?.partida || null,
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
  
  const validarCantidad = useCallback((value) => {
    if (value === '') return '0';
    
    // Permitir decimales
    let newValue = value.replace(/[^\d.]/g, '');
    
    // Limitar a un punto decimal
    const parts = newValue.split('.');
    if (parts.length > 2) {
      newValue = parts[0] + '.' + parts.slice(1).join('');
    }
    
    const cantidad = parseFloat(newValue) || 0;
    
    const ubicacionSeleccionada = ubicacionesConStock.find(
      ubi => ubi.ubicacion === expedicion.ubicacion
    );
    
    let maxPermitido = parseFloat(linea.unidadesPendientes);
    
    if (ubicacionSeleccionada && ubicacionSeleccionada.unidadSaldo !== Infinity) {
      maxPermitido = Math.min(maxPermitido, ubicacionSeleccionada.unidadSaldo);
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
    
    handleExpedicionChange(
      key, 
      'ubicacion', 
      nuevaUbicacion
    );
    
    if (ubicacionSeleccionada) {
      handleExpedicionChange(
        key, 
        'almacen', 
        ubicacionSeleccionada.codigoAlmacen
      );
      
      const cantidadActual = parseFloat(expedicion.cantidad) || 0;
      let maxPermitido = parseFloat(linea.unidadesPendientes);
      
      if (ubicacionSeleccionada.unidadSaldo !== Infinity) {
        maxPermitido = Math.min(maxPermitido, ubicacionSeleccionada.unidadSaldo);
      }
      
      if (cantidadActual > maxPermitido) {
        handleExpedicionChange(
          key, 
          'cantidad', 
          maxPermitido.toString()
        );
      }
    }
  }, [expedicion.cantidad, handleExpedicionChange, key, linea.unidadesPendientes, ubicacionesConStock]);
  
  return (
    <>
      <tr className="desktop-view">
        <td className="td-izquierda">
          <div className="codigo-articulo">{linea.codigoArticulo}</div>
          <div className="codigo-alternativo">{linea.codigoAlternativo}</div>
        </td>
        <td className="td-izquierda">
          <div className="descripcion-articulo">{linea.descripcionArticulo}</div>
          <div className="detalles-articulo">{linea.descripcion2Articulo}</div>
        </td>
        <td className="td-centrado">
          <div className="pendiente-container">
            {linea.unidadesPendientes > 0 ? (
              <>
                <span className="pendiente-valor">{formatted.pendiente}</span>
                {formatted.equivalencia && (
                  <div className="equivalencia-stock">
                    {formatted.equivalencia}
                  </div>
                )}
                {linea.detalles && linea.movPosicionLinea && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirModalDetalles(linea.detalles, linea, pedido);
                    }}
                    className="btn-detalles"
                  >
                    <FaInfoCircle />
                  </button>
                )}
              </>
            ) : (
              <span className="completada-badge">COMPLETADA</span>
            )}
          </div>
        </td>
        <td>
          <div className="ubicacion-select-container">
            <select
              value={expedicion.ubicacion}
              onChange={handleCambioUbicacion}
              className={`ubicacion-select ${expedicion.ubicacion === "Zona descarga" ? 'zona-descarga' : ''}`}
              disabled={!canPerformActions}
            >
              {ubicacionesConStock.map((ubicacion, locIndex) => {
                const mostrarUnidad = ubicacion.unidadMedida !== linea.unidadBase;
                
                return (
                  <option 
                    key={`${ubicacion.ubicacion}-${ubicacion.partida || 'no-partida'}-${locIndex}`}
                    value={ubicacion.ubicacion}
                    className={ubicacion.ubicacion === "Zona descarga" ? 'zona-descarga-option' : ''}
                  >
                    {ubicacion.codigoAlmacen} - {ubicacion.ubicacion} {ubicacion.partida ? `(${ubicacion.partida})` : ''} - 
                    Stock: {ubicacion.unidadSaldo === Infinity 
                      ? 'Ilimitado' 
                      : `${ubicacion.unidadSaldo}${mostrarUnidad ? ` ${ubicacion.unidadMedida}` : ''}`}
                  </option>
                );
              })}
            </select>
            <div className="select-arrow"><FaChevronDown /></div>
          </div>
        </td>
        <td>
          <div className="cantidad-container">
            <input
              type="text"
              value={expedicion.cantidad}
              onChange={handleCambioCantidad}
              className={expedicion.ubicacion === "Zona descarga" ? 'zona-descarga-input' : ''}
              disabled={!canPerformActions}
            />
            <div className="unidad-info">{linea.unidadBase || 'ud'}</div>
          </div>
        </td>
        <td className="td-centrado">
          <button
            className="btn-expedir"
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
      
      <tr className="mobile-view">
        <td colSpan="6">
          <div className="linea-mobile">
            <div className="mobile-header">
              <div className="mobile-articulo">
                <div className="codigo-articulo">{linea.codigoArticulo}</div>
                <div className="codigo-alternativo">{linea.codigoAlternativo}</div>
              </div>
              <div className="mobile-descripcion">
                <div className="descripcion-articulo">{linea.descripcionArticulo}</div>
              </div>
            </div>
            
            <div className="mobile-details">
              <div className="detail-item">
                <span className="detail-label">Pendiente:</span>
                <div className="detail-value">
                  <span>{formatted.pendiente}</span>
                  {linea.detalles && linea.movPosicionLinea && (
                    <button 
                      className="btn-detalles"
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
              
              <div className="detail-item">
                <span className="detail-label">Ubicación:</span>
                <div className="ubicacion-select-container">
                  <select
                    value={expedicion.ubicacion}
                    onChange={handleCambioUbicacion}
                    className={`ubicacion-select ${expedicion.ubicacion === "Zona descarga" ? 'zona-descarga' : ''}`}
                    disabled={!canPerformActions}
                  >
                    {ubicacionesConStock.map((ubicacion, locIndex) => (
                      <option 
                        key={`${ubicacion.ubicacion}-${ubicacion.partida || 'no-partida'}-${locIndex}`}
                        value={ubicacion.ubicacion}
                      >
                        {ubicacion.codigoAlmacen} - {ubicacion.ubicacion} {ubicacion.partida ? `(${ubicacion.partida})` : ''}
                      </option>
                    ))}
                  </select>
                  <div className="select-arrow"><FaChevronDown /></div>
                </div>
              </div>
              
              <div className="detail-item">
                <span className="detail-label">Cantidad:</span>
                <div className="cantidad-container">
                  <input
                    type="text"
                    value={expedicion.cantidad}
                    onChange={handleCambioCantidad}
                    className={expedicion.ubicacion === "Zona descarga" ? 'zona-descarga-input' : ''}
                    disabled={!canPerformActions}
                  />
                  <div className="unidad-info">{linea.unidadBase || 'ud'}</div>
                </div>
              </div>
              
              <div className="detail-item acciones">
                <button
                  className="btn-expedir"
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
    </>
  );
});

// Componente Tarjeta de Pedido (Optimizado)
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
  isScanning
}) => {
  const [showMenu, setShowMenu] = useState(false);
  
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
  
  const parcial = tieneLineasParciales;
  const completo = estaCompletamenteExpedido;
  
  return (
    <div className={`pedido-card ${parcial ? 'pedido-parcial' : ''}`}>
      <div className="pedido-header">
        <div className="pedido-header-left">
          <div className="pedido-info-top">
            <span className="numero-pedido">#{pedido.numeroPedido}</span>
            <span className="fecha-pedido">{new Date(pedido.fechaPedido).toLocaleDateString()}</span>
            <span className="fecha-entrega">
              Entrega: {pedido.fechaEntrega ? new Date(pedido.fechaEntrega).toLocaleDateString() : 'Sin fecha'}
            </span>
          </div>
          <div className="cliente-info">
            <span className="cliente">{pedido.razonSocial}</span>
          </div>
        </div>
        
        <div className="pedido-header-right">
          <div className="pedido-actions">
            <button 
              className="btn-menu"
              onClick={() => setShowMenu(!showMenu)}
            >
              <FaEllipsisV />
            </button>
            
            {showMenu && (
              <div className="dropdown-menu">
                {parcial && !completo && (
                  <button 
                    onClick={() => {
                      generarAlbaranParcial(pedido);
                      setShowMenu(false);
                    }}
                    className="menu-item"
                    disabled={generandoAlbaran}
                  >
                    <FaCheck /> {generandoAlbaran ? 'Procesando...' : 'Completar Pedido'}
                  </button>
                )}
                <button 
                    className="menu-item"
                    onClick={() => {
                      togglePedidoView(pedido.numeroPedido);
                      setShowMenu(false);
                    }}
                >
                  <FaEllipsisV /> 
                  {pedidoViewModes[pedido.numeroPedido] === 'show' ? ' Ocultar líneas' : ' Mostrar líneas'}
                </button>
                <button className="menu-item">
                  <FaBarcode /> Exportar PDF
                </button>
                <button className="menu-item">
                  <FaBarcode /> Imprimir
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="pedido-details">
        <div className="pedido-detail-item">
          <strong>Forma de entrega:</strong> {pedido.formaEntrega}
        </div>
        <div className="pedido-detail-item">
          <strong>Obra:</strong> {pedido.obra || 'Sin obra especificada'}
        </div>
        <div className="pedido-detail-item">
          <strong>Dirección:</strong> {pedido.domicilio}
        </div>
        <div className="pedido-detail-item">
          <strong>Municipio:</strong> {pedido.municipio}
        </div>
        
        <div className="observaciones-container">
          <strong>Observaciones:</strong>
          <div className="observaciones-content">
            {pedido.observaciones || 'Sin observaciones'}
          </div>
        </div>
      </div>
      
      {pedidoViewModes[pedido.numeroPedido] === 'show' && (
        <div className="lineas-container">
          <div className="table-responsive">
            <table className="lineas-table">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th>Descripcion</th>
                  <th>Pendiente</th>
                  <th>Ubicación</th>
                  <th>Cantidad</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {pedido.articulos.map((linea) => (
                  <LineaPedido 
                    key={`${pedido.codigoEmpresa}-${pedido.ejercicioPedido}-${pedido.seriePedido || ''}-${pedido.numeroPedido}-${linea.codigoArticulo}-${linea.movPosicionLinea}`}
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
      )}
    </div>
  );
});

// Componente de Paginación (Optimizado)
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
      <div className="pagination">
        <button 
          onClick={() => cambiarPagina(1)} 
          disabled={paginaActual === 1}
          className="pagination-btn"
        >
          &laquo;
        </button>
        
        <button 
          onClick={() => cambiarPagina(paginaActual - 1)} 
          disabled={paginaActual === 1}
          className="pagination-btn"
        >
          &lsaquo;
        </button>
        
        {paginas.map(numero => (
          <button
            key={numero}
            onClick={() => cambiarPagina(numero)}
            className={`pagination-btn ${paginaActual === numero ? 'active' : ''}`}
          >
            {numero}
          </button>
        ))}
        
        <button 
          onClick={() => cambiarPagina(paginaActual + 1)} 
          disabled={paginaActual === totalPaginas}
          className="pagination-btn"
        >
          &rsaquo;
        </button>
        
        <button 
          onClick={() => cambiarPagina(totalPaginas)} 
          disabled={paginaActual === totalPaginas}
          className="pagination-btn"
        >
          &raquo;
        </button>
      </div>
    )
  );
});

// Componente Modal de Cámara (Optimizado)
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
    <div className="camera-overlay">
      <div className="camera-container">
        <button className="cerrar-modal" onClick={() => setShowCamera(false)}>
          <FaTimes />
        </button>
        <div className="camera-header">
          <FaQrcode />
          <h3>Escanear Artículo</h3>
        </div>
        
        {cameraError ? (
          <div className="camera-error">
            <div className="error-icon">
              <FaExclamationTriangle />
            </div>
            <p>{cameraError}</p>
            <p>Por favor, introduce el código manualmente:</p>
            <div className="manual-verification">
              <div className="input-group">
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
                className="btn-verificar-manual"
                onClick={handleManualVerification}
                disabled={!manualCode}
              >
                <FaCheck /> Verificar
              </button>
            </div>
            <button className="btn-cerrar-camara" onClick={() => setShowCamera(false)}>
              <FaTimes /> Cancelar
            </button>
          </div>
        ) : (
          <>
            <div className="camera-selector">
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
            
            <div id="camera-container" className="camera-view">
              <div className="scan-frame">
                <div className="frame-line top-left"></div>
                <div className="frame-line top-right"></div>
                <div className="frame-line bottom-left"></div>
                <div className="frame-line bottom-right"></div>
              </div>
            </div>
            
            <div className="manual-verification">
              <p>O introduce el código manualmente:</p>
              <div className="input-group">
                <FaBarcode />
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Ingresa el código del artículo"
                />
              </div>
              <button 
                className="btn-verificar-manual"
                onClick={handleManualVerification}
                disabled={!manualCode}
              >
                <FaCheck /> Verificar
              </button>
            </div>
            
            <button className="btn-cerrar-camara" onClick={() => setShowCamera(false)}>
              <FaTimes /> Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  );
});

// Componente Principal PedidosScreen (Optimizado)
const PedidosScreen = () => {
  const navigate = useNavigate();
  const [user] = useState(() => {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
  });
  const pedidosPorPagina = 20;
  
  const { 
    canViewAllOrders, 
    canPerformActions 
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

  const formasEntrega = useMemo(() => [
    { id: 1, nombre: 'Recogida Guadalhorce' },
    { id: 3, nombre: 'Nuestros Medios' },
    { id: 4, nombre: 'Agencia' },
    { id: 5, nombre: 'Directo Fabrica' },
    { id: 6, nombre: 'Pedido Express' }
  ], []);

  // Función para cargar pedidos con cancelación
  const cargarPedidos = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    try {
      setLoading(true);
      setError('');
      
      const codigoEmpresa = user?.CodigoEmpresa;
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
          rango: rangoFechas,
          formaEntrega: filtroFormaEntrega 
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

      if (articulosConUnidad.length > 0) {
        const responseUbicaciones = await axios.post(
          'http://localhost:3000/ubicacionesMultiples',
          { articulos: articulosConUnidad },
          { headers, signal }
        );
        
        if (signal.aborted) return;
        setUbicaciones(responseUbicaciones.data);
      }
      
      const nuevasExpediciones = {};
      response.data.forEach(pedido => {
        pedido.articulos.forEach(linea => {
          const key = linea.movPosicionLinea;
          
          let ubicacionesConStock = ubicaciones[linea.codigoArticulo]?.filter(ubi => 
            ubi.unidadSaldo > 0 && 
            ubi.unidadMedida === linea.unidadPedido
          ) || [];
          
          let cantidadInicial = Math.min(
            parseFloat(linea.unidadesPendientes) || 0,
            ubicacionesConStock[0]?.unidadSaldo !== Infinity ? 
              parseFloat(ubicacionesConStock[0]?.unidadSaldo) || 0 : 
              parseFloat(linea.unidadesPendientes) || 0
          );

          if (isNaN(cantidadInicial)) cantidadInicial = 0;
          
          if (ubicacionesConStock.length === 0) {
            ubicacionesConStock.push({
              codigoAlmacen: "N/A",
              ubicacion: "Zona descarga",
              partida: null,
              unidadSaldo: Infinity,
              unidadMedida: linea.unidadBase || 'ud'
            });
          }
          
          nuevasExpediciones[key] = {
            almacen: ubicacionesConStock[0]?.codigoAlmacen || '',
            ubicacion: ubicacionesConStock[0]?.ubicacion || "Zona descarga",
            partida: ubicacionesConStock[0]?.partida || null,
            cantidad: cantidadInicial.toString()
          };
        });
      });
      
      if (signal.aborted) return;
      setExpediciones(nuevasExpediciones);
      
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
  }, [rangoFechas, filtroFormaEntrega, user?.CodigoEmpresa]);

  useEffect(() => {
    cargarPedidos();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [cargarPedidos]);

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
        "camera-container",
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
      // Transformar la estructura anidada a plana
      const detallesPlana = [];
      
      if (detallesAnidados && Array.isArray(detallesAnidados)) {
        detallesAnidados.forEach(variante => {
          if (variante.tallas && typeof variante.tallas === 'object') {
            Object.entries(variante.tallas).forEach(([codigoTalla, talla]) => {
              if (talla && typeof talla === 'object') {
                // Extraer el código real de la talla de la descripción
                let codigoTallaReal = codigoTalla;
                
                // Si la descripción contiene el código real, extraerlo
                if (talla.descripcion && talla.descripcion.includes('Talla ')) {
                  codigoTallaReal = talla.descripcion.replace('Talla ', '');
                }
                
                detallesPlana.push({
                  codigoArticulo: linea.codigoArticulo,
                  codigoColor: variante.color?.codigo || '',
                  codigoTalla: codigoTallaReal,
                  cantidadPendiente: talla.unidades || 0,
                  descripcionTalla: talla.descripcion || `Talla ${codigoTalla}`,
                  colorNombre: variante.color?.nombre || variante.color?.codigo || 'Sin color'
                });
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
    const { articulo, color, talla, cantidad, ubicacion, almacen, partida, unidadMedida } = datosVariante;
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
          codigoTalla: talla
        },
        { headers }
      );

      if (response.data.success) {
        // Actualizar el estado local para reflejar la expedición
        setPedidos(prev => prev.map(p => 
          p.numeroPedido === pedido.numeroPedido 
            ? { 
                ...p, 
                articulos: p.articulos.map(a => 
                  a.codigoArticulo === linea.codigoArticulo 
                    ? { 
                        ...a, 
                        unidadesPendientes: a.unidadesPendientes - cantidad 
                      }
                    : a
                )
              } 
            : p
        ));

        // Actualizar las ubicaciones (refrescar datos de stock)
        const articulosConUnidad = pedidos.flatMap(pedido => 
          pedido.articulos.map(articulo => ({
            codigo: articulo.codigoArticulo,
            unidad: articulo.unidadPedido
          }))
        );

        const responseUbicaciones = await axios.post(
          'http://localhost:3000/ubicacionesMultiples',
          { articulos: articulosConUnidad },
          { headers }
        );
        setUbicaciones(responseUbicaciones.data);

        alert(`Expedición realizada: ${cantidad} unidades de la variante`);
        
        return Promise.resolve();
      }
    } catch (error) {
      console.error('Error al expedir variante:', error);
      alert('Error al expedir: ' + (error.response?.data?.mensaje || error.message));
      return Promise.reject(error);
    }
  }, [detallesModal, pedidos]);

  const handleExpedir = useCallback(async (codigoEmpresa, ejercicio, serie, numeroPedido, codigoArticulo, unidadesPendientes, linea, detalle = null) => {
    if (!canPerformActions || isScanning) return;
    
    setIsScanning(true);
    const key = linea.movPosicionLinea;
    const expedicion = expediciones[key];
    
    if (!expedicion) {
      setIsScanning(false);
      return;
    }

    let cantidadExpedida = parseFloat(expedicion.cantidad);
    if (isNaN(cantidadExpedida) || cantidadExpedida <= 0) {
      setIsScanning(false);
      return;
    }

    try {
      const headers = getAuthHeader();
      
      // Validación básica en frontend
      if (cantidadExpedida > unidadesPendientes) {
        alert(`No puedes expedir más de ${unidadesPendientes} unidades (pendientes)`);
        setIsScanning(false);
        return;
      }

      // Preparar datos para enviar
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
      };

      // Si hay detalle (variante con talla y color), añadimos esos campos
      if (detalle) {
        datosExpedicion.codigoColor = detalle.color;
        datosExpedicion.codigoTalla = detalle.talla;
      }

      const response = await axios.post(
        'http://localhost:3000/actualizarLineaPedido',
        datosExpedicion,
        { headers }
      );

      // Actualizar estado local con la respuesta del backend
      if (response.data.success) {
        setPedidos(prev => prev.map(p => 
          p.numeroPedido === numeroPedido 
            ? { 
                ...p, 
                articulos: p.articulos.map(a => 
                  a.movPosicionLinea === linea.movPosicionLinea 
                    ? { 
                        ...a, 
                        unidadesPendientes: response.data.detalles.unidadesPendientesRestantes 
                      }
                    : a
                )
              } 
            : p
        ));

        // Actualizar ubicaciones (refrescar datos de stock)
        const articulosConUnidad = pedidos.flatMap(pedido => 
          pedido.articulos.map(articulo => ({
            codigo: articulo.codigoArticulo,
            unidad: articulo.unidadPedido
          }))
        );

        const responseUbicaciones = await axios.post(
          'http://localhost:3000/ubicacionesMultiples',
          { articulos: articulosConUnidad },
          { headers }
        );
        setUbicaciones(responseUbicaciones.data);

        alert(`Se expedieron ${cantidadExpedida} unidades correctamente. Stock restante: ${response.data.detalles.stockRestante}`);
      }
    } catch (error) {
      console.error('Error al expedir artículo:', error);
      if (error.response?.data?.mensaje) {
        alert('Error al expedir artículo: ' + error.response.data.mensaje);
      } else {
        alert('Error al expedir artículo: ' + error.message);
      }
    } finally {
      setIsScanning(false);
    }
  }, [canPerformActions, isScanning, expediciones, pedidos]);

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
    if (!canPerformActions) return;
    
    try {
      setGenerandoAlbaran(true);
      const headers = getAuthHeader();
      
      await axios.post(
        'http://localhost:3000/marcarPedidoCompletado',
        {
          codigoEmpresa: pedido.codigoEmpresa,
          ejercicio: pedido.ejercicioPedido,
          serie: pedido.seriePedido,
          numeroPedido: pedido.numeroPedido
        },
        { headers }
      );

      setPedidos(prev => 
        prev.filter(p => p.numeroPedido !== pedido.numeroPedido)
      );
      
      alert('Pedido marcado como completado. Ahora debe ser asignado a un empleado para generar el albarán.');
    } catch (error) {
      console.error('Error al completar pedido:', error);
      alert('Error al completar pedido: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setGenerandoAlbaran(false);
    }
  }, [canPerformActions]);

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
      <div className="pedidos-screen">
        <div className="no-permission">
          <h2>Acceso restringido</h2>
          <p>No tienes permiso para ver esta sección.</p>
          <button onClick={() => navigate('/')} className="btn-volver">
            Volver al inicio
          </button>
        </div>
        <Navbar />
      </div>
    );
  }
  
  return (
    <div className="pedidos-screen">
      <div className="pedidos-container">
        
        <div className="pedidos-controls">
          <div className="filtros-container">
            <div className="filtro-group search-group">
              <label><FaSearch /> Buscar:</label>
              <div className="search-input-container">
                <input
                  type="text"
                  placeholder="Nº pedido, cliente, dirección, obra..."
                  value={filtroBusqueda}
                  onChange={e => setFiltroBusqueda(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>
            
            <div className="filtro-group date-group">
              <label><FaCalendarAlt /> Rango de fechas:</label>
              <div className="select-container">
                <select
                  value={rangoFechas}
                  onChange={e => setRangoFechas(e.target.value)}
                  className="sort-select"
                >
                  <option value="semana">Una semana</option>
                  <option value="dia">Un día</option>
                </select>
                <div className="select-arrow"><FaChevronDown /></div>
              </div>
            </div>
            
            <div className="filtro-group delivery-group">
              <label><FaTruck /> Forma de entrega:</label>
              <div className="select-container">
                <select
                  value={filtroFormaEntrega}
                  onChange={e => setFiltroFormaEntrega(e.target.value)}
                  className="sort-select"
                >
                  <option value="">Todas</option>
                  {formasEntrega.map(forma => (
                    <option key={forma.id} value={forma.id}>
                      {forma.nombre}
                    </option>
                  ))}
                </select>
                <div className="select-arrow"><FaChevronDown /></div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="pagination-container">
          <Paginacion 
            totalPaginas={totalPaginas} 
            paginaActual={paginaActual} 
            cambiarPagina={cambiarPagina} 
          />
        </div>
        
        <div className="pedidos-content">
          {error ? (
            <ErrorMessage 
              message={error} 
              onRetry={cargarPedidos}
            />
          ) : loading ? (
            <LoadingSpinner message="Cargando pedidos..." />
          ) : pedidosOrdenados.length === 0 ? (
            <div className="no-pedidos">
              <p>No hay pedidos pendientes</p>
            </div>
          ) : (
            <>
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
                  isScanning={isScanning}
                />
              ))}
            </>
          )}
        </div>
        
        <div className="pagination-container">
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