import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { Html5Qrcode, Html5QrcodeScanner } from 'html5-qrcode';
import { usePermissions } from '../PermissionsManager';
import '../styles/PedidosScreen.css';

const formatearUnidad = (cantidad, unidad) => {
  if (!unidad || unidad.trim().length < 2) return `${cantidad} ud`;
  
  const unidadesInvariables = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3'];
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

  if (unidadesInvariables.includes(unidad.toLowerCase())) {
    return `${cantidad} ${unidad}`;
  }

  if (cantidad === 1) {
    return `1 ${unidad}`;
  } else {
    return pluralesIrregulares[unidad.toLowerCase()] 
      ? `${cantidad} ${pluralesIrregulares[unidad.toLowerCase()]}`
      : `${cantidad} ${unidad}s`;
  }
};

const DetallesArticuloModal = ({ 
  detalles, 
  linea, 
  pedido, 
  onExpedir, 
  ubicacionesStock,
  scannedItems,
  setScannedItems,
  iniciarEscaneo,
  canPerformActions,
  cantidadesPorTalla,
  setCantidadesPorTalla,
  onExpedirTalla
}) => {
  const [selectedUbicacion, setSelectedUbicacion] = useState(
    ubicacionesStock.length > 0 ? ubicacionesStock[0].Ubicacion : ''
  );

  const handleCambioCantidad = (detalle, tallaCodigo, cantidad) => {
    const key = `${detalle.color.codigo}-${detalle.grupoTalla.codigo}-${tallaCodigo}`;
    setCantidadesPorTalla(prev => ({
      ...prev,
      [key]: Math.min(cantidad, detalle.tallas[tallaCodigo].unidades)
    }));
  };

  const expedirTalla = (detalle, tallaCodigo) => {
    const key = `${detalle.color.codigo}-${detalle.grupoTalla.codigo}-${tallaCodigo}`;
    const cantidad = cantidadesPorTalla[key] || 0;
    
    if (cantidad <= 0) {
      alert('La cantidad debe ser mayor que cero');
      return;
    }
    
    // Validar ubicación seleccionada
    const ubicacionObj = ubicacionesStock.find(ubi => ubi.Ubicacion === selectedUbicacion);
    
    if (!ubicacionObj) {
      alert('Debe seleccionar una ubicación válida');
      return;
    }
    
    onExpedirTalla(
      linea, 
      detalle, 
      tallaCodigo, 
      cantidad,
      ubicacionObj.Ubicacion,
      ubicacionObj.Partida
    );
  };

  return (
    <div className="modal-detalles">
      <div className="modal-contenido modal-detalles-contenido">
        <button className="cerrar-modal" onClick={() => onExpedir(0)}>&times;</button>
        <h3 className="modal-titulo">Artículo: {linea.descripcionArticulo}</h3>
        
        <div className="modal-subtitulo">Variantes</div>
        
        <div className="variantes-container">
          {detalles.map((detalle, index) => (
            <div key={`${index}-${detalle.color.codigo}-${detalle.grupoTalla.codigo}`} className="variante-item">
              <div className="variante-header">
                <div className="variante-color">
                  <strong>Color:</strong> {detalle.color.nombre}
                </div>
                <div className="variante-talla">
                  <strong>Grupo Talla:</strong> {detalle.grupoTalla.nombre}
                </div>
              </div>
              
              <div className="tallas-grid">
                {Object.entries(detalle.tallas).map(([codigoTalla, talla], idx) => {
                  const itemKey = `${detalle.color.codigo}-${detalle.grupoTalla.codigo}-${codigoTalla}`;
                  const escaneado = scannedItems[itemKey] || 0;
                  const completado = escaneado >= talla.unidades;
                  
                  return (
                    <div 
                      key={`${index}-${codigoTalla}`} 
                      className={`talla-item ${talla.unidades > 0 ? 'con-stock' : 'sin-stock'} ${completado ? 'completado' : ''}`}
                    >
                      <div className="talla-info">
                        <div className="talla-codigo">Talla {codigoTalla}</div>
                        <div className="talla-desc">{talla.descripcion}</div>
                        <div className="talla-stock">
                          {talla.unidades > 0 ? 
                            `${escaneado}/${formatearUnidad(talla.unidades, linea.unidadBase)}` : 
                            'Agotado'}
                        </div>
                      </div>
                      
                      {talla.unidades > 0 && !completado && canPerformActions && (
                        <div className="cantidad-control">
                          <input
                            type="number"
                            min="0"
                            max={talla.unidades}
                            value={cantidadesPorTalla[itemKey] || 0}
                            onChange={(e) => handleCambioCantidad(
                              detalle, 
                              codigoTalla, 
                              parseInt(e.target.value || 0)
                            )}
                            className="cantidad-input"
                          />
                          <button 
                            className="btn-expedir-talla"
                            onClick={() => expedirTalla(detalle, codigoTalla)}
                            disabled={!cantidadesPorTalla[itemKey]}
                          >
                            Expedir
                          </button>
                          <button 
                            className="btn-escanear"
                            onClick={() => iniciarEscaneo(linea, pedido, detalle, codigoTalla)}
                          >
                            <i className="fas fa-camera"></i>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        
        <div className="ubicacion-selector">
          <label>Ubicación:</label>
          <select
            value={selectedUbicacion}
            onChange={(e) => setSelectedUbicacion(e.target.value)}
            disabled={!canPerformActions}
          >
            {ubicacionesStock.map((ubi, idx) => (
              <option key={idx} value={ubi.Ubicacion}>
                {ubi.Ubicacion} {ubi.DescripcionUbicacion ? `(${ubi.DescripcionUbicacion})` : ''} - 
                Stock: {ubi.Cantidad} {linea.unidadBase}
              </option>
            ))}
          </select>
        </div>
        
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
  setPedidos,
  expedirArticulo
}) => {
  // Asegurar unidad: usar unidadPedido o unidadBase como respaldo
  const unidad = linea.unidadPedido || linea.unidadBase || 'ud';
  
  // Clave única con unidad
  const key = `${pedido.numeroPedido}-${linea.codigoArticulo}-${unidad}`;

  // Ubicaciones para esta combinación artículo-unidad
  let ubicacionesConStock = ubicaciones[`${linea.codigoArticulo}-${unidad}`] || [];
  
  if (ubicacionesConStock.length === 0) {
    ubicacionesConStock.push({
      ubicacion: "Zona descarga",
      partida: null,
      Cantidad: Infinity,
      UnidadMedida: unidad
    });
  }

  const tieneStock = ubicacionesConStock.some(u => u.Cantidad > 0);
  const stockNegativo = ubicacionesConStock.some(u => u.Cantidad < 0);
  
  const expedicion = expediciones[key] || {
    ubicacion: ubicacionesConStock[0]?.Ubicacion || '',
    partida: ubicacionesConStock[0]?.partida || null,
    cantidad: '0'
  };
  
  const unidadesExpedidas = linea.UnidadesExpedidas || 0;
  const unidadesPendientes = parseFloat(linea.unidadesPendientes) || 0;
  
  const formatearUnidades = () => {
    const unidadVenta = unidad;
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
  
  return (
    <tr 
      key={`${pedido.codigoEmpresa}-${pedido.ejercicioPedido}-${pedido.seriePedido || ''}-${pedido.numeroPedido}-${linea.codigoArticulo}-${linea.movPosicionLinea}`}
      className={`linea-pedido ${tieneStock ? 'clickable' : 'no-stock'} ${stockNegativo ? 'negative-stock' : ''} ${unidadesPendientes === 0 ? 'linea-expedida' : ''}`}
    >
      <td className="td-izquierda">
        <div className="codigo-articulo">{linea.codigoArticulo}</div>
        <div className="codigo-alternativo">{linea.codigoAlternativo}</div>
      </td>
      <td className="td-izquierda">
        <div className="descripcion-articulo">{linea.descripcionArticulo}</div>
        <div className="detalles-articulo">{linea.descripcion2Articulo}</div>
      </td>
      <td className="td-centrado">
        {unidadesPendientes > 0 ? (
          <div className="pendiente-container">
            <span>{formatted.pendiente}</span>
            {unidadesExpedidas > 0 && (
              <div className="expedido-info">
                Expedido: {formatearUnidad(unidadesExpedidas, unidad)}
              </div>
            )}
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
                ...
              </button>
            )}
          </div>
        ) : (
          <span className="completada-badge">COMPLETADA</span>
        )}
      </td>
      <td>
        <div className="ubicacion-select-container">
          <select
            value={expedicion.ubicacion}
            onChange={e => handleExpedicionChange(
              pedido.numeroPedido, 
              linea.codigoArticulo,
              unidad, 
              'ubicacion', 
              e.target.value
            )}
            className={`ubicacion-select ${expedicion.ubicacion === "Zona descarga" ? 'zona-descarga' : ''}`}
            disabled={!canPerformActions || unidadesPendientes === 0}
          >
            {ubicacionesConStock.map((ubicacion, locIndex) => (
              <option 
                key={`${ubicacion.Ubicacion}-${ubicacion.Partida || 'no-partida'}-${locIndex}`}
                value={ubicacion.Ubicacion}
                className={ubicacion.Ubicacion === "Zona descarga" ? 'zona-descarga-option' : ''}
              >
                {ubicacion.Ubicacion} {ubicacion.Partida ? `(${ubicacion.Partida})` : ''} - 
                Stock: {ubicacion.Cantidad} {unidad}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td>
        <div className="cantidad-container">
          <input
            type="number"
            min="0"
            max={unidadesPendientes}
            step="1"
            value={expedicion.cantidad}
            onChange={e => {
              let value = e.target.value;
              
              if (value === '') value = '0';
              let intValue = parseInt(value, 10);
              if (isNaN(intValue)) intValue = 0;
              
              intValue = Math.min(intValue, unidadesPendientes);
              intValue = Math.max(intValue, 0);
              
              handleExpedicionChange(
                pedido.numeroPedido, 
                linea.codigoArticulo,
                unidad,
                'cantidad', 
                intValue.toString()
              );
            }}
            className={expedicion.ubicacion === "Zona descarga" ? 'zona-descarga-input' : ''}
            disabled={!canPerformActions || unidadesPendientes === 0}
          />
          <span className="unidad-info">{unidad}</span>
        </div>
      </td>
      <td className="td-centrado">
        <button
          className="btn-expedir"
          onClick={(e) => {
            e.stopPropagation();
            if (canPerformActions && unidadesPendientes > 0) iniciarEscaneo(linea, pedido);
          }}
          disabled={!canPerformActions || unidadesPendientes === 0}
        >
          <i className="fas fa-camera"></i> Escanear
        </button>
      </td>
    </tr>
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
  setPedidos,
  expedirArticulo
}) => {
  const [modoVisualizacion, setModoVisualizacion] = useState('todas');
  const [menuAccionesAbierto, setMenuAccionesAbierto] = useState(false);

  const toggleMenuAcciones = () => {
    setMenuAccionesAbierto(!menuAccionesAbierto);
  };

  const actualizarVoluminoso = async (value) => {
    const newValue = value;
    setPedidos(prev => prev.map(p => 
      p.numeroPedido === pedido.numeroPedido 
        ? { ...p, EsVoluminoso: newValue } 
        : p
    ));
    
    try {
      await axios.patch(
        `http://localhost:3000/pedidos/${pedido.numeroPedido}/voluminoso`,
        { esVoluminoso: newValue },
        { headers: getAuthHeader() }
      );
    } catch (error) {
      console.error('Error al actualizar voluminoso', error);
      setPedidos(prev => prev.map(p => 
        p.numeroPedido === pedido.numeroPedido 
          ? { ...p, EsVoluminoso: !newValue } 
          : p
      ));
    }
  };

  // Filtramos las líneas según el modo de visualización
  const lineasFiltradas = pedido.articulos.filter(articulo => {
    if (modoVisualizacion === 'pendientes') {
      return parseFloat(articulo.unidadesPendientes) > 0;
    } else if (modoVisualizacion === 'completadas') {
      return parseFloat(articulo.unidadesPendientes) === 0;
    }
    return true;
  });

  const tieneLineasParciales = () => {
    return pedido.articulos.some(articulo => {
      const unidadesExpedidas = parseFloat(articulo.UnidadesExpedidas) || 0;
      const unidadesPedidas = parseFloat(articulo.unidadesPedidas) || 0;
      return unidadesExpedidas > 0 && unidadesExpedidas < unidadesPedidas;
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
    <div className={`pedido-card ${parcial ? 'pedido-parcial' : ''} ${completo ? 'pedido-completo' : ''}`}>
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
          <div className="estado-pedido">
            <span className="badge-estado">{pedido.Status}</span>
            {pedido.StatusAprobado === -1 && (
              <span className="badge-aprobado">Aprobado</span>
            )}
            {pedido.EsVoluminoso && (
              <span className="voluminoso-badge">Voluminoso</span>
            )}
          </div>
        </div>
        
        <div className="pedido-header-right">
          <div className="acciones-container">
            <button className="btn-acciones" onClick={toggleMenuAcciones}>
              <i className="fas fa-ellipsis-v"></i>
            </button>
            
            {menuAccionesAbierto && (
              <div className="menu-acciones">
                <div className="menu-item">
                  <label className="voluminoso-checkbox">
                    <input
                      type="checkbox"
                      checked={pedido.EsVoluminoso || false}
                      onChange={(e) => actualizarVoluminoso(e.target.checked)}
                    />
                    Pedido voluminoso
                  </label>
                </div>
                
                {parcial && !completo && (
                  <div className="menu-item">
                    <button 
                      onClick={() => generarAlbaranParcial(pedido)}
                      className="btn-albaran-parcial"
                      disabled={!canPerformActions || generandoAlbaran}
                    >
                      <i className="fas fa-file-invoice"></i> Generar Albarán Parcial
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="pedido-details">
        <div><strong>Vendedor:</strong> {pedido.Vendedor || 'No asignado'}</div>
        <div><strong>Contacto:</strong> {pedido.Contacto || 'No especificado'}</div>
        <div><strong>Teléfono:</strong> {pedido.TelefonoContacto || 'No especificado'}</div>
        <div><strong>Forma de entrega:</strong> {pedido.formaEntrega}</div>
        <div><strong>Preparador:</strong> {pedido.Preparador || 'Sin asignar'}</div>
        <div><strong>Obra:</strong> {pedido.obra || 'Sin obra especificada'}</div>
        <div><strong>Dirección:</strong> {pedido.domicilio}</div>
        <div><strong>Municipio:</strong> {pedido.municipio}</div>
        
        <div className="observaciones-container">
          <strong>Observaciones:</strong>
          <div className="observaciones-content">
            {pedido.observaciones || 'Sin observaciones'}
          </div>
        </div>
      </div>
      
      <div className="toggle-container">
        <div className="toggle-options">
          <button 
            className={`toggle-option ${modoVisualizacion === 'todas' ? 'active' : ''}`}
            onClick={() => setModoVisualizacion('todas')}
          >
            Todas las líneas
          </button>
          <button 
            className={`toggle-option ${modoVisualizacion === 'pendientes' ? 'active' : ''}`}
            onClick={() => setModoVisualizacion('pendientes')}
          >
            Pendientes
          </button>
          <button 
            className={`toggle-option ${modoVisualizacion === 'completadas' ? 'active' : ''}`}
            onClick={() => setModoVisualizacion('completadas')}
          >
            Completadas
          </button>
        </div>
        
        <button 
          onClick={() => togglePedidoView(pedido.numeroPedido)}
          className="btn-toggle"
        >
          {pedidoViewModes[pedido.numeroPedido] === 'show' ? 'Ocultar líneas' : 'Mostrar líneas'}
        </button>
      </div>
      
      {pedidoViewModes[pedido.numeroPedido] === 'show' && (
        <div className="lineas-table-container">
          <table className="lineas-table">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Descripción</th>
                <th>Pendiente</th>
                <th>Ubicación</th>
                <th>Cantidad a Expedir</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {lineasFiltradas.map((linea) => (
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
                  setPedidos={setPedidos}
                  expedirArticulo={expedirArticulo}
                />
              ))}
            </tbody>
          </table>
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
        <button className="cerrar-modal" onClick={() => setShowCamera(false)}>&times;</button>
        <h3>Verificar Artículo</h3>
        
        {cameraError ? (
          <div className="camera-error">
            <p>{cameraError}</p>
            <p>Por favor, introduce el código manualmente:</p>
            <div className="manual-verification">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Ingresa el código del artículo"
              />
              <button 
                className="btn-verificar-manual"
                onClick={handleManualVerification}
                disabled={!manualCode}
              >
                Verificar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="camera-selector">
              <label>Seleccionar cámara:</label>
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
            
            <div id="camera-container" className="camera-view"></div>
            
            <div className="manual-verification">
              <p>O introduce el código manualmente:</p>
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Ingresa el código del artículo"
              />
              <button 
                className="btn-verificar-manual"
                onClick={handleManualVerification}
                disabled={!manualCode}
              >
                Verificar
              </button>
            </div>
          </>
        )}
        
        <button className="btn-cerrar-camara" onClick={() => setShowCamera(false)}>
          <i className="fas fa-times"></i> Cancelar
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
    canViewPedidosScreen,
    canPerformActionsInPedidos,
    isPreparer
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
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [paginaActual, setPaginaActual] = useState(1);
  const [error, setError] = useState('');
  const [detallesModal, setDetallesModal] = useState(null);
  const [ubicacionesModal, setUbicacionesModal] = useState([]);
  const [showCamera, setShowCamera] = useState(false);
  const [currentScanningLine, setCurrentScanningLine] = useState(null);
  const [scannedItems, setScannedItems] = useState({});
  const [cameraError, setCameraError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const scannerRef = useRef(null);
  const [cantidadesPorTalla, setCantidadesPorTalla] = useState({});

  const formasEntrega = [
    { id: 1, nombre: 'Recogida Guadalhorce' },
    { id: 3, nombre: 'Nuestros Medios' },
    { id: 4, nombre: 'Agencia' },
    { id: 5, nombre: 'Directo Fabrica' },
    { id: 6, nombre: 'Pedido Express' }
  ];

  const estadosPedido = [
    { value: 'todos', label: 'Todos' },
    { value: 'FaltaStock', label: 'Falta Stock' },
    { value: 'Pendiente', label: 'Pendiente' },
    { value: 'RecibidoProveedor', label: 'Recibido Proveedor' },
    { value: 'Parcial', label: 'Parcial' }
  ];

  const expedirArticulo = async (linea, pedido, cantidad, ubicacion, partida) => {
    try {
      const headers = getAuthHeader();
      const response = await axios.post(
        'http://localhost:3000/actualizarLineaPedido',
        {
          codigoEmpresa: pedido.codigoEmpresa,
          ejercicio: pedido.ejercicioPedido,
          serie: pedido.seriePedido || '',
          numeroPedido: pedido.numeroPedido,
          codigoArticulo: linea.codigoArticulo,
          cantidadExpedida: cantidad,
          ubicacion: ubicacion,
          partida: partida || null,
          movPosicionLinea: linea.movPosicionLinea,
          unidadMedida: linea.unidadPedido || linea.unidadBase
        },
        { headers }
      );

      if (response.data.success) {
        // Actualizar estado de pedidos
        setPedidos(prev => prev.map(p => {
          if (p.numeroPedido !== pedido.numeroPedido) return p;
          return {
            ...p,
            articulos: p.articulos.map(a => {
              if (a.movPosicionLinea !== linea.movPosicionLinea) return a;
              return {
                ...a,
                unidadesPendientes: a.unidadesPendientes - cantidad,
                UnidadesExpedidas: (a.UnidadesExpedidas || 0) + cantidad
              };
            })
          };
        }));
        
        // Resetear cantidad
        const unidad = linea.unidadPedido || linea.unidadBase || 'ud';
        const key = `${pedido.numeroPedido}-${linea.codigoArticulo}-${unidad}`;
        setExpediciones(prev => ({
          ...prev,
          [key]: {
            ...prev[key],
            cantidad: '0'
          }
        }));

        alert(`Expedidas ${cantidad} unidades correctamente`);
      }
    } catch (error) {
      console.error('Error al expedir artículo:', error);
      alert('Error al expedir: ' + (error.response?.data?.mensaje || error.message));
    }
  };

  const onExpedirTalla = async (linea, detalle, tallaCodigo, cantidad, ubicacion, partida) => {
    if (!detallesModal) return;
    const pedido = detallesModal.pedido;
    
    try {
      const headers = getAuthHeader();
      const response = await axios.post(
        'http://localhost:3000/actualizarLineaPedido',
        {
          codigoEmpresa: pedido.codigoEmpresa,
          ejercicio: pedido.ejercicioPedido,
          serie: pedido.seriePedido || '',
          numeroPedido: pedido.numeroPedido,
          codigoArticulo: linea.codigoArticulo,
          cantidadExpedida: cantidad,
          ubicacion: ubicacion,
          partida: partida || null,
          movPosicionLinea: linea.movPosicionLinea,
          unidadMedida: linea.unidadPedido || linea.unidadBase,
          color: detalle.color.codigo,
          grupoTalla: detalle.grupoTalla.codigo,
          talla: tallaCodigo
        },
        { headers }
      );
      
      if (response.data.success) {
        // Actualizar estado de pedidos
        setPedidos(prev => prev.map(p => {
          if (p.numeroPedido !== pedido.numeroPedido) return p;
          return {
            ...p,
            articulos: p.articulos.map(a => {
              if (a.movPosicionLinea !== linea.movPosicionLinea) return a;
              return {
                ...a,
                unidadesPendientes: a.unidadesPendientes - cantidad,
                UnidadesExpedidas: (a.UnidadesExpedidas || 0) + cantidad
              };
            })
          };
        }));
        
        // Actualizar estado de escaneos
        const itemKey = `${detalle.color.codigo}-${detalle.grupoTalla.codigo}-${tallaCodigo}`;
        setScannedItems(prev => ({
          ...prev,
          [itemKey]: (prev[itemKey] || 0) + cantidad
        }));
        
        // Resetear cantidad
        setCantidadesPorTalla(prev => ({
          ...prev,
          [itemKey]: 0
        }));
        
        alert(`Expedidas ${cantidad} unidades correctamente`);
      }
    } catch (error) {
      console.error('Error al expedir artículo por talla:', error);
      
      let errorMessage = 'Error al procesar la expedición';
      if (error.response) {
        if (error.response.data && error.response.data.mensaje) {
          errorMessage = error.response.data.mensaje;
        } else {
          errorMessage = `Error ${error.response.status}: ${error.response.statusText}`;
        }
      } else {
        errorMessage = error.message;
      }
      
      alert(`Error: ${errorMessage}`);
    }
  };

  const handleScanSuccess = (decodedText) => {
    if (!currentScanningLine) return;
    
    const { linea, pedido, detalle, tallaCodigo, cantidad } = currentScanningLine;
    
    // Verificar coincidencia
    if (
      decodedText !== linea.codigoArticulo && 
      decodedText !== linea.codigoAlternativo
    ) {
      alert(`Código escaneado (${decodedText}) no coincide con el artículo (${linea.codigoArticulo})`);
      return;
    }

    // Expedición normal
    if (!detalle) {
      const unidad = linea.unidadPedido || linea.unidadBase || 'ud';
      const key = `${pedido.numeroPedido}-${linea.codigoArticulo}-${unidad}`;
      const expedicion = expediciones[key] || { cantidad: '0' };
      const cantidadExpedir = parseInt(expedicion.cantidad) || 0;
      
      if (cantidadExpedir <= 0) {
        alert('La cantidad debe ser mayor que cero');
        return;
      }
      
      expedirArticulo(
        linea, 
        pedido, 
        cantidadExpedir, 
        expedicion.ubicacion,
        expedicion.partida
      );
    }
    // Expedición desde modal de tallas
    else {
      const key = `${detalle.color.codigo}-${detalle.grupoTalla.codigo}-${tallaCodigo}`;
      const cantidadActual = cantidadesPorTalla[key] || 0;
      
      if (cantidadActual <= 0) {
        alert('La cantidad debe ser mayor que cero');
        return;
      }
      
      onExpedirTalla(
        linea, 
        detalle, 
        tallaCodigo, 
        cantidadActual,
        ubicacionesModal[0]?.Ubicacion, // Usar ubicación seleccionada (o podríamos tener un estado para la selección en el modal)
        ubicacionesModal[0]?.Partida
      );
    }

    setShowCamera(false);
  };

  const handleManualVerification = () => {
    if (!manualCode) return;
    handleScanSuccess(manualCode);
    setManualCode('');
  };

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
        
        const params = {
          codigoEmpresa,
          rango: rangoFechas,
          formaEntrega: filtroFormaEntrega,
          estados: filtroEstado === 'todos' ? '' : filtroEstado,
          soloAprobados: true
        };

        if (isPreparer) {
          params.empleado = user.UsuarioLogicNet;
        }

        const response = await axios.get(
          'http://localhost:3000/pedidosPendientes', 
          { headers, params }
        );
        
        setPedidos(response.data);
        
        // Cargar ubicaciones por artículo Y unidad
        const ubicacionesPromises = response.data.flatMap(pedido => 
          pedido.articulos.map(async articulo => {
            // Asegurar unidad: usar unidadPedido o unidadBase como respaldo
            const unidad = articulo.unidadPedido || articulo.unidadBase || 'ud';
            
            try {
              const responseUbicaciones = await axios.get(
                'http://localhost:3000/stock/por-articulo-unidad',
                {
                  headers,
                  params: { 
                    codigoArticulo: articulo.codigoArticulo,
                    unidadMedida: unidad
                  }
                }
              );
              
              return {
                key: `${articulo.codigoArticulo}-${unidad}`,
                data: responseUbicaciones.data
              };
            } catch (error) {
              console.error(`Error cargando ubicaciones para: ${articulo.codigoArticulo} - ${unidad}`, error);
              // Proporcionar ubicación por defecto en caso de error
              return {
                key: `${articulo.codigoArticulo}-${unidad}`,
                data: [{
                  Ubicacion: "Zona descarga",
                  Partida: null,
                  Cantidad: Infinity,
                  UnidadMedida: unidad
                }]
              };
            }
          })
        );

        const ubicacionesResults = await Promise.all(ubicacionesPromises);
        const nuevasUbicaciones = {};
        
        ubicacionesResults.forEach(result => {
          nuevasUbicaciones[result.key] = result.data;
        });
        
        setUbicaciones(nuevasUbicaciones);
        
        // Inicializar expediciones
        const nuevasExpediciones = {};
        response.data.forEach(pedido => {
          pedido.articulos.forEach(articulo => {
            const unidad = articulo.unidadPedido || articulo.unidadBase || 'ud';
            const key = `${pedido.numeroPedido}-${articulo.codigoArticulo}-${unidad}`;
            
            let ubicacionesConStock = nuevasUbicaciones[key] || [];
            if (ubicacionesConStock.length === 0) {
              ubicacionesConStock.push({
                Ubicacion: "Zona descarga",
                Partida: null,
                Cantidad: Infinity,
                UnidadMedida: unidad
              });
            }
            
            nuevasExpediciones[key] = {
              ubicacion: ubicacionesConStock[0].Ubicacion,
              partida: ubicacionesConStock[0].Partida || null,
              cantidad: '0'
            };
          });
        });
        setExpediciones(nuevasExpediciones);
        
        // Inicializar modos de vista
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
  }, [rangoFechas, filtroFormaEntrega, filtroEstado, isPreparer]);

  useEffect(() => {
    if (!canViewPedidosScreen) {
      navigate('/');
    }
  }, [canViewPedidosScreen, navigate]);

  useEffect(() => {
    if (showCamera && Html5Qrcode) {
      Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length) {
          setCameras(devices);
          setSelectedCamera(devices[0].id);
        } else {
          setCameraError('No se encontraron cámaras disponibles. Por favor, usa la entrada manual.');
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
      const headers = getAuthHeader();
      // Asegurar unidad para la consulta
      const unidad = linea.unidadPedido || linea.unidadBase || 'ud';
      
      const response = await axios.get(
        'http://localhost:3000/stock/por-articulo-unidad', 
        {
          headers,
          params: { 
            codigoArticulo: linea.codigoArticulo,
            unidadMedida: unidad
          }
        }
      );
      
      setUbicacionesModal(response.data);
      setDetallesModal({
        detalles,
        linea,
        pedido
      });
      
      // Resetear cantidades al abrir el modal
      const nuevasCantidades = {};
      detalles.forEach(detalle => {
        Object.keys(detalle.tallas).forEach(tallaCodigo => {
          const key = `${detalle.color.codigo}-${detalle.grupoTalla.codigo}-${tallaCodigo}`;
          nuevasCantidades[key] = 0;
        });
      });
      setCantidadesPorTalla(nuevasCantidades);
    } catch (error) {
      console.error('Error al obtener ubicaciones:', error);
      alert('Error al obtener ubicaciones para este artículo');
    }
  };

  const cerrarModalDetalles = () => {
    setDetallesModal(null);
    setScannedItems({});
    setCantidadesPorTalla({});
  };

  const iniciarEscaneo = (linea, pedido, detalle = null, tallaCodigo = null) => {
    if (!canPerformActionsInPedidos) return;
    
    // Si estamos en el modal de tallas, capturamos la cantidad actual para esa talla
    let cantidad = 0;
    if (detalle && tallaCodigo) {
      const key = `${detalle.color.codigo}-${detalle.grupoTalla.codigo}-${tallaCodigo}`;
      cantidad = cantidadesPorTalla[key] || 0;
    }
    
    setCurrentScanningLine({
      linea, 
      pedido,
      detalle,
      tallaCodigo,
      cantidad
    });
    setShowCamera(true);
    setManualCode('');
  };

  const togglePedidoView = (numeroPedido) => {
    setPedidoViewModes(prev => ({
      ...prev,
      [numeroPedido]: prev[numeroPedido] === 'show' ? 'hide' : 'show'
    }));
  };

  const handleExpedicionChange = (numeroPedido, codigoArticulo, unidadMedida, field, value) => {
    if (!canPerformActionsInPedidos) return;
    
    const key = `${numeroPedido}-${codigoArticulo}-${unidadMedida}`;
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
    if (!canPerformActionsInPedidos) return;
    
    try {
      setGenerandoAlbaran(true);
      const headers = getAuthHeader();
      
      const lineasExpedidas = pedido.articulos
        .map(articulo => {
          // Usar unidad de la línea
          const unidad = articulo.unidadPedido || articulo.unidadBase || 'ud';
          const key = `${pedido.numeroPedido}-${articulo.codigoArticulo}-${unidad}`;
          const expedicion = expediciones[key] || { cantidad: '0' };
          const cantidad = parseInt(expedicion.cantidad) || 0;
          
          if (cantidad > 0) {
            return {
              codigoArticulo: articulo.codigoArticulo,
              descripcionArticulo: articulo.descripcionArticulo,
              cantidad: cantidad,
              precio: articulo.precio || 0,
              codigoAlmacen: articulo.codigoAlmacen || '',
              partida: expedicion.partida || '',
              movPosicionLinea: articulo.movPosicionLinea,
              unidadMedida: unidad // Incluir unidad
            };
          }
          return null;
        })
        .filter(item => item !== null);
      
      if (lineasExpedidas.length === 0) {
        alert('No hay líneas con cantidades para expedir');
        return;
      }
      
      await axios.post(
        'http://localhost:3000/generarAlbaranParcial',
        {
          codigoEmpresa: pedido.codigoEmpresa,
          ejercicio: pedido.ejercicioPedido,
          serie: pedido.seriePedido || '',
          numeroPedido: pedido.numeroPedido,
          lineasExpedidas
        },
        { headers }
      );

      setPedidos(prev => 
        prev.filter(p => p.numeroPedido !== pedido.numeroPedido)
      );
      
      alert('Albarán parcial generado correctamente');
    } catch (error) {
      console.error('Error al completar pedido:', error);
      
      let errorMessage = 'Error al generar albarán parcial';
      if (error.response?.data?.mensaje) {
        errorMessage = error.response.data.mensaje;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    } finally {
      setGenerandoAlbaran(false);
    }
  };

  const pedidosFiltrados = pedidos.filter(pedido => {
    const textoBusqueda = filtroBusqueda.toLowerCase();
    return (
      pedido.numeroPedido.toString().includes(textoBusqueda) ||
      (pedido.razonSocial && pedido.razonSocial.toLowerCase().includes(textoBusqueda)) ||
      (pedido.domicilio && pedido.domicilio.toLowerCase().includes(textoBusqueda)) ||
      (pedido.obra && pedido.obra.toLowerCase().includes(textoBusqueda)) ||
      (pedido.municipio && pedido.municipio.toLowerCase().includes(textoBusqueda))
    );
  });

  const pedidosOrdenados = [...pedidosFiltrados];
  
  const indexUltimoPedido = paginaActual * pedidosPorPagina;
  const indexPrimerPedido = indexUltimoPedido - pedidosPorPagina;
  const pedidosActuales = pedidosOrdenados.slice(indexPrimerPedido, indexUltimoPedido);
  const totalPaginas = Math.ceil(pedidosOrdenados.length / pedidosPorPagina);

  if (!canViewPedidosScreen) {
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
            <div className="filtro-group">
              <label>Buscar pedido, cliente o dirección:</label>
              <input
                type="text"
                placeholder="Nº pedido, cliente, dirección..."
                value={filtroBusqueda}
                onChange={e => setFiltroBusqueda(e.target.value)}
                className="search-input"
              />
            </div>
            
            <div className="filtro-group">
              <label>Rango de fechas:</label>
              <select
                value={rangoFechas}
                onChange={e => setRangoFechas(e.target.value)}
                className="sort-select"
              >
                <option value="semana">Una semana</option>
                <option value="dia">Un día</option>
              </select>
            </div>
            
            <div className="filtro-group">
              <label>Forma de entrega:</label>
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
            
            <div className="filtro-group">
              <label>Estado del pedido:</label>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="sort-select"
              >
                {estadosPedido.map(estado => (
                  <option key={estado.value} value={estado.value}>
                    {estado.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
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
                  canPerformActions={canPerformActionsInPedidos}
                  setPedidos={setPedidos}
                  expedirArticulo={expedirArticulo}
                />
              ))}
              
              <Paginacion 
                totalPaginas={totalPaginas} 
                paginaActual={paginaActual} 
                cambiarPagina={cambiarPagina} 
              />
            </>
          )}
        </div>
        
        {detallesModal && (
          <DetallesArticuloModal 
            detalles={detallesModal.detalles}
            linea={detallesModal.linea}
            pedido={detallesModal.pedido}
            onExpedir={cerrarModalDetalles}
            ubicacionesStock={ubicacionesModal}
            scannedItems={scannedItems}
            setScannedItems={setScannedItems}
            iniciarEscaneo={iniciarEscaneo}
            canPerformActions={canPerformActionsInPedidos}
            cantidadesPorTalla={cantidadesPorTalla}
            setCantidadesPorTalla={setCantidadesPorTalla}
            onExpedirTalla={onExpedirTalla}
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