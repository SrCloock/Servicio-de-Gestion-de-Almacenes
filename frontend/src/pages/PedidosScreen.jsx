import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { Html5Qrcode, Html5QrcodeScanner } from 'html5-qrcode';
import '../styles/PedidosScreen.css';

const DetallesArticuloModal = ({ 
  detalles, 
  linea, 
  pedido, 
  onExpedir, 
  ubicacionesStock,
  scannedItems,
  setScannedItems,
  iniciarEscaneo
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
                          {talla.unidades > 0 ? `${escaneado}/${talla.unidades} unidades` : 'Agotado'}
                        </div>
                      </div>
                      
                      {talla.unidades > 0 && !completado && (
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
  abrirModalDetalles
}) => {
  let ubicacionesConStock = ubicaciones[linea.codigoArticulo]?.filter(ubi => ubi.unidadSaldo > 0) || [];
  if (ubicacionesConStock.length === 0) {
    ubicacionesConStock.push({
      ubicacion: "Zona descarga",
      partida: null,
      unidadSaldo: Infinity
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
    const equivalencia = unidadesPendientes / factor;
    
    return {
      pendiente: `${unidadesPendientes} ${unidadVenta}`,
      equivalencia: `${equivalencia % 1 === 0 ? equivalencia : equivalencia.toFixed(2)} ${unidadStock}`
    };
  };
  
  const formatted = formatearUnidades();
  
  return (
    <tr 
      key={`${pedido.codigoEmpresa}-${pedido.ejercicioPedido}-${pedido.seriePedido || ''}-${pedido.numeroPedido}-${linea.codigoArticulo}-${linea.movPosicionLinea}`}
      className={`linea-pedido ${tieneStock ? 'clickable' : 'no-stock'} ${stockNegativo ? 'negative-stock' : ''}`}
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
      <td className="td-centrado">
        {formatted.equivalencia ? (
          <span className="unidad-conversion">
            {formatted.equivalencia}
          </span>
        ) : (
          <span className="sin-conversion">-</span>
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
          >
            {ubicacionesConStock.map((ubicacion, locIndex) => (
              <option 
                key={`${ubicacion.ubicacion}-${ubicacion.partida || 'no-partida'}-${locIndex}`}
                value={ubicacion.ubicacion}
                className={ubicacion.ubicacion === "Zona descarga" ? 'zona-descarga-option' : ''}
              >
                {ubicacion.ubicacion} {ubicacion.partida ? `(${ubicacion.partida})` : ''} - 
                Stock: {ubicacion.unidadSaldo === Infinity ? 'Ilimitado' : ubicacion.unidadSaldo}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td>
        <input
          type="number"
          min="0"
          step="0.001"
          value={expedicion.cantidad}
          onChange={e => handleExpedicionChange(
            pedido.numeroPedido, 
            linea.codigoArticulo, 
            'cantidad', 
            e.target.value
          )}
          className={expedicion.ubicacion === "Zona descarga" ? 'zona-descarga-input' : ''}
        />
        <div className="unidad-info">en {linea.unidadAlternativa || 'ud'}</div>
      </td>
      <td className="td-centrado">
        <button
          className="btn-expedir"
          onClick={(e) => {
            e.stopPropagation();
            iniciarEscaneo(linea, pedido);
          }}
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
  setPedidoAsignando, 
  generarAlbaranParcial, 
  generandoAlbaran, 
  ubicaciones,
  expediciones,
  handleExpedicionChange,
  iniciarEscaneo,
  abrirModalDetalles
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
      className={`pedido-card ${parcial ? 'pedido-parcial' : ''}`}
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
        </div>
        
        <div className="pedido-header-right">
          <button 
            onClick={() => setPedidoAsignando(pedido)}
            className="btn-asignar"
          >
            Asignar Repartidor
          </button>
          
          {parcial && !completo && (
            <button 
              onClick={() => generarAlbaranParcial(pedido)}
              className="btn-albaran-parcial"
              disabled={generandoAlbaran}
            >
              {generandoAlbaran ? 'Generando...' : 'Crear Albarán Parcial'}
            </button>
          )}
        </div>
      </div>
      
      <div className="pedido-details">
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
                <th>Pendiente (Venta)</th>
                <th>Equivalencia (Stock)</th>
                <th>Ubicación</th>
                <th>Cantidad a Expedir (Stock)</th>
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

const AsignacionModal = ({ 
  pedidoAsignando, 
  setPedidoAsignando, 
  repartidores, 
  repartidorSeleccionado, 
  setRepartidorSeleccionado, 
  asignarPedido 
}) => {
  if (!pedidoAsignando) return null;

  return (
    <div className="modal-asignacion">
      <div className="modal-contenido">
        <button className="cerrar-modal" onClick={() => setPedidoAsignando(null)}>&times;</button>
        <h3>Asignar repartidor al pedido #{pedidoAsignando.numeroPedido}</h3>
        <select
          value={repartidorSeleccionado}
          onChange={(e) => setRepartidorSeleccionado(e.target.value)}
        >
          <option value="">Seleccionar repartidor</option>
          {repartidores.map(rep => (
            <option key={rep.CodigoCliente} value={rep.CodigoCliente}>
              {rep.Nombre}
            </option>
          ))}
        </select>
        <div className="modal-buttons">
          <button 
            onClick={asignarPedido}
            disabled={!repartidorSeleccionado}
            className="btn-confirmar"
          >
            Asignar
          </button>
          <button 
            onClick={() => setPedidoAsignando(null)}
            className="btn-cancelar"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
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
  
  const [pedidos, setPedidos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState({});
  const [expediciones, setExpediciones] = useState({});
  const [repartidores, setRepartidores] = useState([]);
  const [pedidoViewModes, setPedidoViewModes] = useState({});
  const [loading, setLoading] = useState(true);
  const [generandoAlbaran, setGenerandoAlbaran] = useState(false);
  const [filtroPedido, setFiltroPedido] = useState('');
  const [filtroArticulo, setFiltroArticulo] = useState('');
  const [filtroDireccion, setFiltroDireccion] = useState('');
  const [orden, setOrden] = useState('fecha');
  const [paginaActual, setPaginaActual] = useState(1);
  const [error, setError] = useState('');
  const [pedidoAsignando, setPedidoAsignando] = useState(null);
  const [repartidorSeleccionado, setRepartidorSeleccionado] = useState('');
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
        
        const repResponse = await axios.get('http://localhost:3000/repartidores', { 
          headers,
          params: { codigoEmpresa } 
        });
        setRepartidores(repResponse.data);
        
        const response = await axios.get(`http://localhost:3000/pedidosPendientes`, { 
          headers,
          params: { codigoEmpresa } 
        });
        setPedidos(response.data);
        
        const codigosArticulos = [...new Set(response.data.flatMap(p => p.articulos.map(a => a.codigoArticulo)))];
        const responseUbicaciones = await axios.post(
          'http://localhost:3000/ubicacionesMultiples',
          { articulos: codigosArticulos },
          { headers }
        );
        setUbicaciones(responseUbicaciones.data);
        
        const nuevasExpediciones = {};
        response.data.forEach(pedido => {
          pedido.articulos.forEach(linea => {
            const key = `${pedido.numeroPedido}-${linea.codigoArticulo}`;
            let ubicacionesConStock = responseUbicaciones.data[linea.codigoArticulo]?.filter(ubi => ubi.unidadSaldo > 0) || [];
            
            const unidadesPendientes = parseFloat(linea.unidadesPendientes) || 0;
            const factor = parseFloat(linea.factorConversion) || 1;
            let cantidadInicial = unidadesPendientes / factor;
            
            if (ubicacionesConStock.length > 0 && ubicacionesConStock[0].unidadSaldo !== Infinity) {
              cantidadInicial = Math.min(cantidadInicial, ubicacionesConStock[0].unidadSaldo);
            }
            
            if (!Number.isInteger(cantidadInicial)) {
              cantidadInicial = Math.ceil(cantidadInicial);
            }
            
            if (ubicacionesConStock.length === 0) {
              ubicacionesConStock.push({
                ubicacion: "Zona descarga",
                partida: null,
                unidadSaldo: Infinity
              });
            }
            
            nuevasExpediciones[key] = {
              ubicacion: ubicacionesConStock[0].ubicacion,
              partida: ubicacionesConStock[0].partida || null,
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
  }, []);

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

  const handleExpedir = async (codigoEmpresa, ejercicio, serie, numeroPedido, codigoArticulo, unidadesPendientes, linea) => {
    const key = `${numeroPedido}-${codigoArticulo}`;
    const expedicion = expediciones[key];
    if (!expedicion) return;

    let cantidadExpedida = parseFloat(expedicion.cantidad);
    const factor = parseFloat(linea.factorConversion) || 1;
    cantidadExpedida = cantidadExpedida * factor;

    if (isNaN(cantidadExpedida) || cantidadExpedida <= 0) return;

    try {
      const headers = getAuthHeader();
      
      await axios.post(
        'http://localhost:3000/actualizarLineaPedido',
        {
          codigoEmpresa,
          ejercicio,
          serie,
          numeroPedido,
          codigoArticulo,
          cantidadExpedida,
          ubicacion: expedicion.ubicacion,
          partida: expedicion.partida
        },
        { headers }
      );

      setPedidos(prev => prev.map(p => 
        p.numeroPedido === numeroPedido 
          ? { 
              ...p, 
              articulos: p.articulos.map(a => 
                a.codigoArticulo === codigoArticulo 
                  ? { ...a, unidadesPendientes: a.unidadesPendientes - cantidadExpedida }
                  : a
              )
            } 
          : p
      ));
    } catch (error) {
      console.error('Error al expedir artículo:', error);
      alert('Error al expedir artículo: ' + error.message);
    }
  };

  const iniciarEscaneo = (linea, pedido, detalle = null) => {
    setCurrentScanningLine({ linea, pedido, detalle });
    setShowCamera(true);
    setManualCode('');
  };

  const handleScanSuccess = (decodedText) => {
    if (!currentScanningLine) return;
    
    const { linea, pedido, detalle } = currentScanningLine;
    
    if (decodedText === linea.codigoArticulo || decodedText === linea.codigoAlternativo) {
      const key = `${pedido.numeroPedido}-${linea.codigoArticulo}`;
      const expedicionActual = expediciones[key] || { cantidad: '0' };
      const nuevaCantidad = parseInt(expedicionActual.cantidad) + 1;
      
      handleExpedicionChange(
        pedido.numeroPedido, 
        linea.codigoArticulo, 
        'cantidad', 
        nuevaCantidad.toString()
      );
      
      setTimeout(() => {
        handleExpedir(
          pedido.codigoEmpresa,
          pedido.ejercicioPedido,
          pedido.seriePedido,
          pedido.numeroPedido,
          linea.codigoArticulo,
          linea.unidadesPendientes,
          linea
        );
      }, 300);
      
      if (detalle) {
        const itemKey = `${linea.codigoArticulo}-${detalle.color.codigo}-${detalle.grupoTalla.codigo}`;
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
      const key = `${pedido.numeroPedido}-${linea.codigoArticulo}`;
      const expedicionActual = expediciones[key] || { cantidad: '0' };
      const nuevaCantidad = parseInt(expedicionActual.cantidad) + 1;
      
      handleExpedicionChange(
        pedido.numeroPedido, 
        linea.codigoArticulo, 
        'cantidad', 
        nuevaCantidad.toString()
      );
      
      setTimeout(() => {
        handleExpedir(
          pedido.codigoEmpresa,
          pedido.ejercicioPedido,
          pedido.seriePedido,
          pedido.numeroPedido,
          linea.codigoArticulo,
          linea.unidadesPendientes,
          linea
        );
      }, 300);
      
      if (detalle) {
        const itemKey = `${linea.codigoArticulo}-${detalle.color.codigo}-${detalle.grupoTalla.codigo}`;
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

  const handleExpedicionChange = (numeroPedido, codigoArticulo, field, value) => {
    const key = `${numeroPedido}-${codigoArticulo}`;
    setExpediciones(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: value }
    }));
  };

  const asignarPedido = async () => {
    if (!pedidoAsignando || !repartidorSeleccionado) return;
    
    try {
      await axios.post('http://localhost:3000/asignarPedido', {
        pedidoId: pedidoAsignando.numeroPedido,
        codigoRepartidor: repartidorSeleccionado,
        codigoEmpresa: user.CodigoEmpresa
      });
      alert(`Pedido #${pedidoAsignando.numeroPedido} asignado`);
      setPedidoAsignando(null);
    } catch (error) {
      console.error('Error al asignar pedido:', error);
      alert('Error al asignar pedido');
    }
  };

  const cambiarPagina = (numeroPagina) => {
    setPaginaActual(numeroPagina);
    window.scrollTo(0, 0);
  };

  const generarAlbaranParcial = async (pedido) => {
    try {
      setGenerandoAlbaran(true);
      const headers = getAuthHeader();
      
      await axios.post(
        'http://localhost:3000/generarAlbaranParcial',
        {
          codigoEmpresa: pedido.codigoEmpresa,
          ejercicio: pedido.ejercicioPedido,
          serie: pedido.seriePedido,
          numeroPedido: pedido.numeroPedido
        },
        { headers }
      );

      setPedidos(prev => prev.map(p => 
        p.numeroPedido === pedido.numeroPedido
          ? {
              ...p,
              articulos: p.articulos.map(a => ({
                ...a,
                unidadesPendientes: a.unidadesPendientes
              }))
            }
          : p
      ));
    } catch (error) {
      console.error('Error al generar albarán parcial:', error);
      alert('Error al generar albarán parcial: ' + error.message);
    } finally {
      setGenerandoAlbaran(false);
    }
  };

  const pedidosFiltrados = pedidos.filter(pedido => {
    const matchPedido = filtroPedido 
      ? pedido.numeroPedido.toString().includes(filtroPedido) || 
        pedido.razonSocial.toLowerCase().includes(filtroPedido.toLowerCase())
      : true;

    const matchArticulo = filtroArticulo
      ? pedido.articulos.some(art => 
          art.codigoArticulo.includes(filtroArticulo) || 
          art.descripcionArticulo.toLowerCase().includes(filtroArticulo.toLowerCase()))
      : true;

    const matchDireccion = filtroDireccion
      ? `${pedido.domicilio} ${pedido.municipio}`.toLowerCase().includes(filtroDireccion.toLowerCase())
      : true;

    return matchPedido && matchArticulo && matchDireccion;
  });

  const pedidosOrdenados = [...pedidosFiltrados].sort((a, b) => {
    return orden === 'fecha' 
      ? new Date(a.fechaPedido) - new Date(b.fechaPedido)
      : a.razonSocial.localeCompare(b.razonSocial);
  });
  
  const indexUltimoPedido = paginaActual * pedidosPorPagina;
  const indexPrimerPedido = indexUltimoPedido - pedidosPorPagina;
  const pedidosActuales = pedidosOrdenados.slice(indexPrimerPedido, indexUltimoPedido);
  const totalPaginas = Math.ceil(pedidosOrdenados.length / pedidosPorPagina);

  return (
    <div className="pedidos-screen">
      <div className="pedidos-container">
        <div className="pedidos-header">
          <h2>Preparación de Pedidos</h2>
        </div>
        
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
              <label>Buscar artículo:</label>
              <input
                type="text"
                placeholder="Código o descripción..."
                value={filtroArticulo}
                onChange={e => setFiltroArticulo(e.target.value)}
                className="search-input"
              />
            </div>

            <div className="filtro-group">
              <label>Buscar dirección:</label>
              <input
                type="text"
                placeholder="Dirección..."
                value={filtroDireccion}
                onChange={e => setFiltroDireccion(e.target.value)}
                className="search-input"
              />
            </div>
            
            <div className="filtro-group">
              <label>Ordenar por:</label>
              <select
                value={orden}
                onChange={e => setOrden(e.target.value)}
                className="sort-select"
              >
                <option value="fecha">Fecha más reciente</option>
                <option value="cliente">Nombre de cliente</option>
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
                  setPedidoAsignando={setPedidoAsignando}
                  generarAlbaranParcial={generarAlbaranParcial}
                  generandoAlbaran={generandoAlbaran}
                  ubicaciones={ubicaciones}
                  expediciones={expediciones}
                  handleExpedicionChange={handleExpedicionChange}
                  iniciarEscaneo={iniciarEscaneo}
                  abrirModalDetalles={abrirModalDetalles}
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
          />
        )}
        
        <AsignacionModal 
          pedidoAsignando={pedidoAsignando}
          setPedidoAsignando={setPedidoAsignando}
          repartidores={repartidores}
          repartidorSeleccionado={repartidorSeleccionado}
          setRepartidorSeleccionado={setRepartidorSeleccionado}
          asignarPedido={asignarPedido}
        />
        
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