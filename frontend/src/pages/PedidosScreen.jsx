// src/screens/PedidosScreen.jsx
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
  canPerformActions
}) => {
  const [selectedUbicacion, setSelectedUbicacion] = useState(
    ubicacionesStock.length > 0 ? ubicacionesStock[0].Ubicacion : ''
  );

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
                  const itemKey = `${linea.codigoArticulo}-${detalle.color.codigo}-${detalle.grupoTalla.codigo}`;
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
                          {talla.unidades > 0 ? `${escaneado}/${formatearUnidad(talla.unidades, linea.unidadBase)}` : 'Agotado'}
                        </div>
                      </div>
                      
                      {talla.unidades > 0 && !completado && canPerformActions && (
                        <button 
                          className="btn-escanear"
                          onClick={() => iniciarEscaneo(linea, pedido, detalle)}
                        >
                          <i className="fas fa-camera"></i> Escanear
                        </button>
                      )}
                      
                      {completado && (
                        <div className="completado-badge">
                          <i className="fas fa-check"></i> Completado
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
                {ubi.Ubicacion} {ubi.DescripcionUbicacion ? `(${ubi.DescripcionUbicacion})` : ''}
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
  setPedidos
}) => {
  let ubicacionesConStock = ubicaciones[linea.codigoArticulo]?.filter(ubi => ubi.unidadSaldo > 0) || [];
  if (ubicacionesConStock.length === 0) {
    ubicacionesConStock.push({
      ubicacion: "Zona descarga",
      partida: null,
      unidadSaldo: Infinity,
      unidadMedida: linea.unidadBase || 'ud'
    });
  }

  const tieneStock = ubicacionesConStock.some(u => u.unidadSaldo > 0);
  const stockNegativo = ubicacionesConStock.some(u => u.unidadSaldo < 0);
  const key = `${pedido.numeroPedido}-${linea.codigoArticulo}`;
  const expedicion = expediciones[key] || {
    ubicacion: ubicacionesConStock[0]?.ubicacion || '',
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
  
  return (
    <tr 
      key={`${pedido.codigoEmpresa}-${pedido.ejercicioPedido}-${pedido.seriePedido || ''}-${pedido.numeroPedido}-${linea.codigoArticulo}-${linea.movPosicionLinea}`}
      className={`linea-pedido ${tieneStock ? 'clickable' : 'no-stock'} ${stockNegativo ? 'negative-stock' : ''} ${linea.unidadesPendientes === 0 ? 'linea-expedida' : ''}`}
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
        {linea.unidadesPendientes > 0 ? (
          <div className="pendiente-container">
            <span>{formatted.pendiente}</span>
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
              'ubicacion', 
              e.target.value
            )}
            className={`ubicacion-select ${expedicion.ubicacion === "Zona descarga" ? 'zona-descarga' : ''}`}
            disabled={!canPerformActions || linea.unidadesPendientes === 0}
          >
            {ubicacionesConStock.map((ubicacion, locIndex) => (
              <option 
                key={`${ubicacion.ubicacion}-${ubicacion.partida || 'no-partida'}-${locIndex}`}
                value={ubicacion.ubicacion}
                className={ubicacion.ubicacion === "Zona descarga" ? 'zona-descarga-option' : ''}
              >
                {ubicacion.ubicacion} {ubicacion.partida ? `(${ubicacion.partida})` : ''}
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
            max={linea.unidadesPendientes}
            step="1"
            value={expedicion.cantidad}
            onChange={e => {
              let value = e.target.value;
              
              if (value === '') value = '0';
              let intValue = parseInt(value, 10);
              if (isNaN(intValue)) intValue = 0;
              
              intValue = Math.min(intValue, linea.unidadesPendientes);
              intValue = Math.max(intValue, 0);
              
              handleExpedicionChange(
                pedido.numeroPedido, 
                linea.codigoArticulo, 
                'cantidad', 
                intValue.toString()
              );
            }}
            className={expedicion.ubicacion === "Zona descarga" ? 'zona-descarga-input' : ''}
            disabled={!canPerformActions || linea.unidadesPendientes === 0}
          />
          <span className="unidad-info">{linea.unidadBase || 'ud'}</span>
        </div>
      </td>
      <td className="td-centrado">
        <button
          className="btn-expedir"
          onClick={(e) => {
            e.stopPropagation();
            if (canPerformActions && linea.unidadesPendientes > 0) iniciarEscaneo(linea, pedido);
          }}
          disabled={!canPerformActions || linea.unidadesPendientes === 0}
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
  setPedidos
}) => {
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
    <div 
      className={`pedido-card ${parcial ? 'pedido-parcial' : ''} ${completo ? 'pedido-completo' : ''}`}
    >
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
          </div>
        </div>
        
        <div className="pedido-header-right">
          <label className="voluminoso-checkbox">
            <input
              type="checkbox"
              checked={pedido.EsVoluminoso || false}
              onChange={async (e) => {
                try {
                  await axios.patch(
                    `http://localhost:3000/pedidos/${pedido.numeroPedido}/voluminoso`,
                    { esVoluminoso: e.target.checked },
                    { headers: getAuthHeader() }
                  );
                  setPedidos(prev => prev.map(p => 
                    p.numeroPedido === pedido.numeroPedido 
                      ? { ...p, EsVoluminoso: e.target.checked } 
                      : p
                  ));
                } catch (error) {
                  console.error('Error al actualizar voluminoso', error);
                }
              }}
              disabled={!canPerformActions}
            />
            Pedido voluminoso
          </label>
          
          {parcial && !completo && (
            <button 
              onClick={() => generarAlbaranParcial(pedido)}
              className="btn-albaran-parcial"
              disabled={!canPerformActions || generandoAlbaran}
            >
              {generandoAlbaran ? 'Completando...' : 'Completar Pedido'}
            </button>
          )}
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
      
      <div className="toggle-button-container">
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
                  setPedidos={setPedidos}
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
  const [filtroPedido, setFiltroPedido] = useState('');
  const [filtroDireccion, setFiltroDireccion] = useState('');
  const [rangoFechas, setRangoFechas] = useState('semana');
  const [filtroFormaEntrega, setFiltroFormaEntrega] = useState('');
  const [filtroEstados, setFiltroEstados] = useState([]);
  const [soloAprobados, setSoloAprobados] = useState(true);
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

  const formasEntrega = [
    { id: 1, nombre: 'Recogida Guadalhorce' },
    { id: 3, nombre: 'Nuestros Medios' },
    { id: 4, nombre: 'Agencia' },
    { id: 5, nombre: 'Directo Fabrica' },
    { id: 6, nombre: 'Pedido Express' }
  ];

  const estadosPedido = [
    { value: 'FaltaStock', label: 'Falta Stock' },
    { value: 'Pendiente', label: 'Pendiente' },
    { value: 'RecibidoProveedor', label: 'Recibido Proveedor' },
    { value: 'Parcial', label: 'Parcial' }
  ];

  const handleExpedir = async (codigoEmpresa, ejercicio, serie, numeroPedido, codigoArticulo, unidadesPendientes, linea) => {
    const key = `${numeroPedido}-${codigoArticulo}`;
    const expedicion = expediciones[key] || { cantidad: '0', ubicacion: '' };
    
    if (!expedicion.cantidad || parseInt(expedicion.cantidad) <= 0) {
      alert('Por favor, introduce una cantidad válida para expedir');
      return;
    }
    
    if (!expedicion.ubicacion) {
      alert('Por favor, selecciona una ubicación');
      return;
    }
    
    try {
      const headers = getAuthHeader();
      const response = await axios.post(
        'http://localhost:3000/actualizarLineaPedido',
        {
          codigoEmpresa,
          ejercicio,
          serie,
          numeroPedido,
          codigoArticulo,
          cantidadExpedida: expedicion.cantidad,
          ubicacion: expedicion.ubicacion
        },
        { headers }
      );
      
      if (response.data.success) {
        // Actualizar estado local
        setPedidos(prev => prev.map(pedido => {
          if (pedido.numeroPedido !== numeroPedido) return pedido;
          
          return {
            ...pedido,
            articulos: pedido.articulos.map(articulo => {
              if (articulo.codigoArticulo !== codigoArticulo) return articulo;
              
              const nuevasUnidadesPendientes = parseFloat(articulo.unidadesPendientes) - parseFloat(expedicion.cantidad);
              
              return {
                ...articulo,
                unidadesPendientes: nuevasUnidadesPendientes
              };
            })
          };
        }));
        
        // Resetear expedición
        setExpediciones(prev => ({
          ...prev,
          [key]: {
            ubicacion: expedicion.ubicacion,
            cantidad: '0'
          }
        }));
        
        alert('Artículo expedido correctamente');
      } else {
        alert('Error al expedir artículo: ' + response.data.mensaje);
      }
    } catch (error) {
      console.error('Error al expedir artículo:', error);
      alert('Error al expedir artículo: ' + error.message);
    }
  };

  const handleScanSuccess = (decodedText) => {
    if (!currentScanningLine) return;
    
    const { linea, pedido } = currentScanningLine;
    
    // Validar que el código escaneado coincida con el artículo
    if (decodedText !== linea.codigoArticulo && decodedText !== linea.codigoAlternativo) {
      alert(`Código escaneado (${decodedText}) no coincide con el artículo (${linea.codigoArticulo})`);
      return;
    }
    
    // Obtener la expedición actual
    const key = `${pedido.numeroPedido}-${linea.codigoArticulo}`;
    const expedicion = expediciones[key] || { cantidad: '0' };
    let cantidad = parseInt(expedicion.cantidad) || 0;
    
    // Incrementar cantidad expedida
    cantidad += 1;
    
    // Actualizar estado local
    setExpediciones(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        cantidad: cantidad.toString()
      }
    }));
    
    // Si es una variante, actualizar scannedItems
    if (currentScanningLine.detalle) {
      const detalle = currentScanningLine.detalle;
      const itemKey = `${linea.codigoArticulo}-${detalle.color.codigo}-${detalle.grupoTalla.codigo}`;
      
      setScannedItems(prev => ({
        ...prev,
        [itemKey]: (prev[itemKey] || 0) + 1
      }));
    }
    
    alert(`Artículo ${linea.descripcionArticulo} escaneado correctamente. Cantidad: ${cantidad}`);
  };

  const handleManualVerification = () => {
    if (!manualCode || !currentScanningLine) return;
    
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
          estados: filtroEstados.join(','),
          soloAprobados: soloAprobados,
        };

        // Filtro para preparadores
        if (isPreparer) {
          params.empleado = user.UsuarioLogicNet;
        }

        const response = await axios.get(
          'http://localhost:3000/pedidosPendientes', 
          { headers, params }
        );
        
        setPedidos(response.data);
        
        // Obtener ubicaciones de stock para todos los artículos
        const codigosArticulos = [...new Set(response.data.flatMap(p => p.articulos.map(a => a.codigoArticulo)))];
        if (codigosArticulos.length > 0) {
          const responseUbicaciones = await axios.post(
            'http://localhost:3000/ubicacionesMultiples',
            { articulos: codigosArticulos },
            { headers }
          );
          setUbicaciones(responseUbicaciones.data);
        }
        
        // Inicializar expediciones
        const nuevasExpediciones = {};
        response.data.forEach(pedido => {
          pedido.articulos.forEach(linea => {
            const key = `${pedido.numeroPedido}-${linea.codigoArticulo}`;
            let ubicacionesConStock = ubicaciones[linea.codigoArticulo]?.filter(ubi => ubi.unidadSaldo > 0) || [];
            
            if (ubicacionesConStock.length === 0) {
              ubicacionesConStock.push({
                ubicacion: "Zona descarga",
                partida: null,
                unidadSaldo: Infinity,
                unidadMedida: linea.unidadBase || 'ud'
              });
            }
            
            nuevasExpediciones[key] = {
              ubicacion: ubicacionesConStock[0].ubicacion,
              partida: ubicacionesConStock[0].partida || null,
              cantidad: '0'
            };
          });
        });
        setExpediciones(nuevasExpediciones);
        
        // Inicializar modos de visualización
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
  }, [rangoFechas, filtroFormaEntrega, filtroEstados, soloAprobados, isPreparer]);

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
          setCameraError('No se encontraron cámaras disponibles');
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
      const response = await axios.get('http://localhost:3000/stock/por-articulo', {
        headers,
        params: { 
          codigoArticulo: linea.codigoArticulo,
          codigoEmpresa: user.CodigoEmpresa 
        }
      });
      
      setUbicacionesModal(response.data);
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

  const iniciarEscaneo = (linea, pedido, detalle = null) => {
    if (!canPerformActionsInPedidos) return;
    
    setCurrentScanningLine({ linea, pedido, detalle });
    setShowCamera(true);
    setManualCode('');
  };

  const togglePedidoView = (numeroPedido) => {
    setPedidoViewModes(prev => ({
      ...prev,
      [numeroPedido]: prev[numeroPedido] === 'show' ? 'hide' : 'show'
    }));
  };

  const handleExpedicionChange = (numeroPedido, codigoArticulo, field, value) => {
    if (!canPerformActionsInPedidos) return;
    
    const key = `${numeroPedido}-${codigoArticulo}`;
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
    const matchPedido = filtroPedido 
      ? pedido.numeroPedido.toString().includes(filtroPedido) || 
        pedido.razonSocial.toLowerCase().includes(filtroPedido.toLowerCase())
      : true;

    const matchDireccion = filtroDireccion
      ? `${pedido.domicilio} ${pedido.municipio} ${pedido.obra || ''}`.toLowerCase().includes(filtroDireccion.toLowerCase())
      : true;

    return matchPedido && matchDireccion;
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
              <label>Buscar pedido o cliente:</label>
              <input
                type="text"
                placeholder="Nº pedido, cliente..."
                value={filtroPedido}
                onChange={e => setFiltroPedido(e.target.value)}
                className="search-input"
              />
            </div>
            
            <div className="filtro-group">
              <label>Buscar dirección/obra:</label>
              <input
                type="text"
                placeholder="Dirección u obra..."
                value={filtroDireccion}
                onChange={e => setFiltroDireccion(e.target.value)}
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
                multiple
                value={filtroEstados}
                onChange={e => setFiltroEstados(
                  Array.from(e.target.selectedOptions, option => option.value)
                )}
                className="multi-select"
              >
                {estadosPedido.map(estado => (
                  <option key={estado.value} value={estado.value}>
                    {estado.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="filtro-group">
              <label>
                <input
                  type="checkbox"
                  checked={soloAprobados}
                  onChange={() => setSoloAprobados(!soloAprobados)}
                />
                Solo pedidos aprobados
              </label>
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