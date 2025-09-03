import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { Html5Qrcode } from 'html5-qrcode';
import { usePermissions } from '../PermissionsManager';
import '../styles/PedidosScreen.css';
import { FaEllipsisV, FaCamera, FaQrcode, FaBarcode, FaCheck, FaTimes, FaExclamationTriangle, FaChevronDown, FaSearch, FaCalendarAlt, FaTruck, FaInfoCircle } from 'react-icons/fa';

const formatearUnidad = (cantidad, unidad) => {
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
};

const DetallesArticuloModal = ({ 
  detalles, 
  linea, 
  pedido, 
  onExpedir, 
  scannedItems,
  setScannedItems,
  iniciarEscaneo,
  canPerformActions
}) => {
  const [stockPorVariante, setStockPorVariante] = useState({});
  const [loadingStock, setLoadingStock] = useState(false);
  const [ubicacionesSeleccionadas, setUbicacionesSeleccionadas] = useState({});

  const obtenerCombinaciones = () => {
    const combinaciones = [];
    
    detalles.forEach(variante => {
      const { color, grupoTalla } = variante;
      
      Object.entries(variante.tallas).forEach(([codigoTalla, talla]) => {
        if (talla.unidades > 0) {
          combinaciones.push({
            codigoTalla,
            descripcionTalla: talla.descripcion,
            color: {
              codigo: color.codigo,
              nombre: color.nombre
            },
            grupoTalla: {
              codigo: grupoTalla.codigo,
              nombre: grupoTalla.nombre
            },
            unidades: talla.unidades
          });
        }
      });
    });
    
    return combinaciones;
  };

  useEffect(() => {
    const fetchStockForVariantes = async () => {
      setLoadingStock(true);
      const stockData = {};
      const nuevasUbicacionesSeleccionadas = {};

      for (const variante of detalles) {
        const { color, grupoTalla } = variante;
        
        for (const [codigoTalla, talla] of Object.entries(variante.tallas)) {
          if (talla.unidades > 0) {
            try {
              const response = await axios.get('http://localhost:3000/stock/por-variante', {
                headers: getAuthHeader(),
                params: {
                  codigoArticulo: linea.codigoArticulo,
                  codigoColor: color.codigo,
                  codigoTalla: codigoTalla
                }
              });

              const key = `${color.codigo}-${codigoTalla}`;
              stockData[key] = response.data;
              
              // Establecer la primera ubicación como seleccionada por defecto
              if (response.data.length > 0) {
                nuevasUbicacionesSeleccionadas[key] = response.data[0].Ubicacion;
              }
            } catch (error) {
              console.error('Error fetching stock for variant:', error);
              const key = `${color.codigo}-${codigoTalla}`;
              stockData[key] = [];
            }
          }
        }
      }

      setStockPorVariante(stockData);
      setUbicacionesSeleccionadas(nuevasUbicacionesSeleccionadas);
      setLoadingStock(false);
    };

    fetchStockForVariantes();
  }, [detalles, linea.codigoArticulo]);

  const handleCambioUbicacion = (key, ubicacion) => {
    setUbicacionesSeleccionadas(prev => ({
      ...prev,
      [key]: ubicacion
    }));
  };

  const obtenerUbicacionSeleccionada = (key) => {
    return ubicacionesSeleccionadas[key] || '';
  };

  const obtenerStockDisponible = (key, ubicacion) => {
    if (!stockPorVariante[key]) return 0;
    
    const ubicacionData = stockPorVariante[key].find(ubi => ubi.Ubicacion === ubicacion);
    return ubicacionData ? ubicacionData.Cantidad : 0;
  };

  const combinaciones = obtenerCombinaciones();

  return (
    <div className="modal-detalles" onClick={(e) => {
      if (e.target.classList.contains('modal-detalles')) {
        onExpedir(0);
      }
    }}>
      <div className="modal-contenido modal-detalles-contenido" onClick={e => e.stopPropagation()}>
        <button className="cerrar-modal" onClick={() => onExpedir(0)}><FaTimes /></button>
        <h3 className="modal-titulo">Artículo: {linea.descripcionArticulo}</h3>
        <div className="modal-subtitulo">
          <span>Código: {linea.codigoArticulo}</span>
          <span>Unidad: {linea.unidadBase || 'ud'}</span>
        </div>
        
        {loadingStock ? (
          <div className="loading-stock">
            <div className="loader"></div>
            <p>Cargando información de stock...</p>
          </div>
        ) : (
          <div className="tabla-detalles-container">
            <table className="tabla-detalles">
              <thead>
                <tr>
                  <th>Talla</th>
                  <th>Color</th>
                  <th>Pendiente</th>
                  <th>Ubicación</th>
                  <th>Cantidad</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {combinaciones.map((combinacion, index) => {
                  const key = `${combinacion.color.codigo}-${combinacion.codigoTalla}`;
                  const ubicacionesStock = stockPorVariante[key] || [];
                  const ubicacionSeleccionada = obtenerUbicacionSeleccionada(key);
                  const stockDisponible = obtenerStockDisponible(key, ubicacionSeleccionada);
                  
                  const itemKey = `${linea.codigoArticulo}-${combinacion.codigoTalla}-${combinacion.color.codigo}`;
                  const escaneado = scannedItems[itemKey] || 0;
                  const completado = escaneado >= combinacion.unidades;
                  
                  return (
                    <tr key={index} className={combinacion.unidades > 0 ? (completado ? 'completado' : 'pendiente') : 'agotado'}>
                      <td>{combinacion.descripcionTalla}</td>
                      <td>{combinacion.color.nombre}</td>
                      <td>{formatearUnidad(combinacion.unidades, linea.unidadBase)}</td>
                      <td>
                        {ubicacionesStock.length > 0 ? (
                          <div className="ubicacion-select-container">
                            <select
                              value={ubicacionSeleccionada}
                              onChange={(e) => handleCambioUbicacion(key, e.target.value)}
                              disabled={!canPerformActions || completado}
                            >
                              {ubicacionesStock.map((ubi, idx) => (
                                <option key={idx} value={ubi.Ubicacion}>
                                  {ubi.CodigoAlmacen} - {ubi.Ubicacion} {ubi.Partida ? `(${ubi.Partida})` : ''} - 
                                  Stock: {formatearUnidad(ubi.Cantidad, ubi.UnidadMedida)}
                                </option>
                              ))}
                            </select>
                            <div className="select-arrow"><FaChevronDown /></div>
                          </div>
                        ) : (
                          <span className="sin-stock">Sin Nada</span>
                        )}
                      </td>
                      <td>
                        <input 
                          type="text" 
                          value={escaneado}
                          onChange={(e) => {
                            const nuevoValor = Math.max(0, Math.min(combinacion.unidades, parseInt(e.target.value) || 0));
                            setScannedItems(prev => ({
                              ...prev,
                              [itemKey]: nuevoValor
                            }));
                          }}
                          disabled={!canPerformActions || completado || ubicacionesStock.length === 0}
                        />
                        <span className="unidad-info">{linea.unidadBase || 'ud'}</span>
                      </td>
                      <td>
                        {combinacion.unidades > 0 && !completado && canPerformActions && ubicacionesStock.length > 0 && (
                          <button 
                            className="btn-escanear"
                            onClick={() => {
                              const ubicacionData = ubicacionesStock.find(ubi => ubi.Ubicacion === ubicacionSeleccionada);
                              iniciarEscaneo(linea, pedido, {
                                color: combinacion.color.codigo,
                                talla: combinacion.codigoTalla,
                                ubicacion: ubicacionSeleccionada,
                                almacen: ubicacionData?.CodigoAlmacen,
                                partida: ubicacionData?.Partida
                              });
                            }}
                          >
                            <FaCamera /> Escanear
                          </button>
                        )}
                        {completado && <span className="completado-badge"><FaCheck /> Completado</span>}
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
            onClick={() => onExpedir(0)}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

const LineaPedido = ({ 
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
  let ubicacionesConStock = ubicaciones[linea.codigoArticulo]?.filter(ubi => 
    ubi.unidadSaldo > 0 && 
    ubi.unidadMedida === linea.unidadPedido
  ) || [];
  
  if (ubicacionesConStock.length === 0) {
    ubicacionesConStock.push({
      codigoAlmacen: "N/A",
      ubicacion: "Zona descarga",
      partida: null,
      unidadSaldo: Infinity,
      unidadMedida: linea.unidadBase || 'ud'
    });
  }

  const key = linea.movPosicionLinea;
  const expedicion = expediciones[key] || {
    almacen: ubicacionesConStock[0]?.codigoAlmacen || '',
    ubicacion: ubicacionesConStock[0]?.ubicacion || '',
    partida: ubicacionesConStock[0]?.partida || null,
    cantidad: '0'
  };
  
  const formatearUnidades = () => {
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
  };
  
  const formatted = formatearUnidades();
  
  const validarCantidad = (value) => {
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
  };
  
  const handleCambioCantidad = (e) => {
    const nuevaCantidad = validarCantidad(e.target.value);
    handleExpedicionChange(
      key, 
      'cantidad', 
      nuevaCantidad
    );
  };
  
  const handleCambioUbicacion = (e) => {
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
  };
  
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
};

const PedidoCard = ({ 
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
  
  const tieneLineasParciales = () => {
    return pedido.articulos.some(articulo => {
      const unidadesExpedidas = parseFloat(articulo.unidadesPedidas) - parseFloat(articulo.unidadesPendientes);
      return unidadesExpedidas > 0 && unidadesExpedidas < parseFloat(articulo.unidadesPedidas);
    });
  };

  const estaCompletamenteExpedido = () => {
    return pedido.articulos.every(articulo => 
      parseFloat(articulo.unidadesPendientes) === 0
    );
  };
  
  const parcial = tieneLineasParciales();
  const completo = estaCompletamenteExpedido();
  
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
                  >
                    <FaCheck /> Completar Pedido
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
};

const Paginacion = ({ totalPaginas, paginaActual, cambiarPagina }) => {
  return (
    totalPaginas > 1 && (
      <div className="pagination">
        <button 
          onClick={() => cambiarPagina(1)} 
          disabled={paginaActual === 1}
        >
          &laquo;
        </button>
        
        {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(numero => (
          <button
            key={numero}
            onClick={() => cambiarPagina(numero)}
            className={paginaActual === numero ? 'active' : ''}
          >
            {numero}
          </button>
        ))}
        
        <button 
          onClick={() => cambiarPagina(totalPaginas)} 
          disabled={paginaActual === totalPaginas}
        >
          &raquo;
        </button>
      </div>
    )
  );
};

const CameraModal = ({ 
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
          </>
        )}
        
        <button className="btn-cerrar-camara" onClick={() => setShowCamera(false)}>
          <FaTimes /> Cancelar
        </button>
      </div>
    </div>
  );
};

const PedidosScreen = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));
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

  const formasEntrega = [
    { id: 1, nombre: 'Recogida Guadalhorce' },
    { id: 3, nombre: 'Nuestros Medios' },
    { id: 4, nombre: 'Agencia' },
    { id: 5, nombre: 'Directo Fabrica' },
    { id: 6, nombre: 'Pedido Express' }
  ];

  useEffect(() => {
    const cargarPedidos = async () => {
      try {
        setLoading(true);
        setError('');
        
        if (!user?.CodigoEmpresa) {
          setError('No se encontró el código de empresa del usuario.');
          setLoading(false);
          return;
        }
        
        const codigoEmpresa = user.CodigoEmpresa;
        const headers = getAuthHeader();
        
        const response = await axios.get(`http://localhost:3000/pedidosPendientes`, { 
          headers,
          params: { 
            codigoEmpresa,
            rango: rangoFechas,
            formaEntrega: filtroFormaEntrega 
          } 
        });
        setPedidos(response.data);
        
        const articulosConUnidad = response.data.flatMap(pedido => 
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
        
        const nuevasExpediciones = {};
        response.data.forEach(pedido => {
          pedido.articulos.forEach(linea => {
            const key = linea.movPosicionLinea;
            
            let ubicacionesConStock = responseUbicaciones.data[linea.codigoArticulo]?.filter(ubi => 
              ubi.unidadSaldo > 0 && 
              ubi.unidadMedida === linea.unidadPedido
            ) || [];
            
            // Calcular la cantidad inicial como el mínimo entre unidades pendientes y stock disponible
            let cantidadInicial = Math.min(
              parseFloat(linea.unidadesPendientes) || 0,
              ubicacionesConStock[0]?.unidadSaldo !== Infinity ? 
                parseFloat(ubicacionesConStock[0]?.unidadSaldo) || 0 : 
                parseFloat(linea.unidadesPendientes) || 0
            );

            // Asegurar que es un número válido
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
        setExpediciones(nuevasExpediciones);
        
        const initialModes = {};
        response.data.forEach(pedido => {
          initialModes[pedido.numeroPedido] = 'show';
        });
        setPedidoViewModes(initialModes);
      } catch (err) {
        console.error('Error al obtener pedidos:', err);
        if (err.response) {
          if (err.response.status === 500) {
            setError('Error interno del servidor. Inténtalo más tarde');
          } else if (err.response.status === 401) {
            setError('Error de autenticación. Vuelve a iniciar sesión');
          } else {
            setError(`Error del servidor: ${err.response.status} ${err.response.statusText}`);
          }
        } else {
          setError('Error de conexión con el servidor');
        }
      } finally {
        setLoading(false);
      }
    };
    
    cargarPedidos();
  }, [rangoFechas, filtroFormaEntrega]);

  useEffect(() => {
    if (showCamera && Html5Qrcode) {
      Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length) {
          setCameras(devices);
          setSelectedCamera(devices[0].id);
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

  const abrirModalDetalles = async (detalles, linea, pedido) => {
    try {
      setDetallesModal({
        detalles,
        linea,
        pedido
      });
    } catch (error) {
      console.error('Error al obtener ubicaciones:', error);
      alert('Error al obtener ubicaciones para este artículo');
    }
  };

  const cerrarModalDetalles = (totalExpedido = 0) => {
    if (totalExpedido > 0 && detallesModal) {
      const { pedido, linea } = detallesModal;
      
      setPedidos(prev => prev.map(p => {
        if (p.numeroPedido !== pedido.numeroPedido) return p;
        
        return {
          ...p,
          articulos: p.articulos.map(a => {
            if (a.codigoArticulo !== linea.codigoArticulo) return a;
            
            return {
              ...a,
              unidadesPendientes: a.unidadesPendientes - totalExpedido
            };
          })
        };
      }));
    }
    
    setDetallesModal(null);
    setScannedItems({});
  };

  const handleExpedir = async (codigoEmpresa, ejercicio, serie, numeroPedido, codigoArticulo, unidadesPendientes, linea) => {
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

      const response = await axios.post(
        'http://localhost:3000/actualizarLineaPedido',
        {
          codigoEmpresa,
          ejercicio,
          serie,
          numeroPedido,
          codigoArticulo,
          cantidadExpedida,
          almacen: expedicion.almacen,
          ubicacion: expedicion.ubicacion,
          partida: expedicion.partida,
          unidadMedida: linea.unidadPedido
        },
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
  };

  const iniciarEscaneo = (linea, pedido, detalle = null) => {
    if (!canPerformActions) return;
    
    setCurrentScanningLine({ linea, pedido, detalle });
    setShowCamera(true);
    setManualCode('');
  };

  const handleScanSuccess = (decodedText) => {
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
        linea
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
  };

  const handleManualVerification = () => {
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
        linea
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
  };

  const togglePedidoView = (numeroPedido) => {
    setPedidoViewModes(prev => ({
      ...prev,
      [numeroPedido]: prev[numeroPedido] === 'show' ? 'hide' : 'show'
    }));
  };

  const handleExpedicionChange = (key, field, value) => {
    if (!canPerformActions) return;
    
    setExpediciones(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: value }
    }));
  };

  const cambiarPagina = (numeroPagina) => {
    setPaginaActual(numeroPagina);
    window.scrollTo(0, 0);
  };

  const generarAlbaranParcial = async (pedido) => {
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
  };

  const pedidosFiltrados = pedidos.filter(pedido => {
    const searchText = filtroBusqueda.toLowerCase();
    
    return (
      pedido.numeroPedido.toString().includes(searchText) ||
      pedido.razonSocial.toLowerCase().includes(searchText) ||
      pedido.domicilio.toLowerCase().includes(searchText) ||
      (pedido.obra && pedido.obra.toLowerCase().includes(searchText))
    );
  });

  const pedidosOrdenados = [...pedidosFiltrados];
  
  const indexUltimoPedido = paginaActual * pedidosPorPagina;
  const indexPrimerPedido = indexUltimoPedido - pedidosPorPagina;
  const pedidosActuales = pedidosOrdenados.slice(indexPrimerPedido, indexUltimoPedido);
  const totalPaginas = Math.ceil(pedidosOrdenados.length / pedidosPorPagina);

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
              <label>Buscar:</label>
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
              <label>Rango de fechas:</label>
              <div className="select-container">
                <FaCalendarAlt className="select-icon" />
                <select
                  value={rangoFechas}
                  onChange={e => setRangoFechas(e.target.value)}
                  className="sort-select"
                >
                  <option value="semana">Una semana</option>
                  <option value="dia">Un día</option>
                </select>
              </div>
            </div>
            
            <div className="filtro-group delivery-group">
              <label>Forma de entrega:</label>
              <div className="select-container">
                <FaTruck className="select-icon" />
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
            <div className="error-pedidos">
              <p>{error}</p>
              <button onClick={() => window.location.reload()}>Reintentar</button>
            </div>
          ) : loading ? (
            <div className="loading-pedidos">
              <div className="loader"></div>
              <p>Cargando pedidos...</p>
            </div>
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
            onExpedir={cerrarModalDetalles}
            scannedItems={scannedItems}
            setScannedItems={setScannedItems}
            iniciarEscaneo={iniciarEscaneo}
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