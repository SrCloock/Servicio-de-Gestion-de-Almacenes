import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/PedidosScreen.css';
import Navbar from '../components/Navbar';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';

const PedidosAsignadosScreen = () => {
  const [pedidos, setPedidos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState({});
  const [expediciones, setExpediciones] = useState({});
  const [pedidoViewModes, setPedidoViewModes] = useState({});
  const [loading, setLoading] = useState(true);
  const [expedicionLoading, setExpedicionLoading] = useState(false);
  const [filtroPedido, setFiltroPedido] = useState('');
  const [filtroArticulo, setFiltroArticulo] = useState('');
  const [filtroDireccion, setFiltroDireccion] = useState('');
  const [orden, setOrden] = useState('fecha');
  const [error, setError] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const pedidosPorPagina = 20;
  const [retryCount, setRetryCount] = useState(0);
  
  const [codigoVerificacion, setCodigoVerificacion] = useState('');
  const [lineaVerificando, setLineaVerificando] = useState(null);

  const navigate = useNavigate();

  const fetchPedidosAsignados = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      const headers = getAuthHeader();
      const response = await axios.get(
        'http://localhost:3000/pedidosAsignados',
        { headers }
      );
      
      const pedidosNormalizados = response.data.map((pedido, index) => ({
        ...pedido,
        id: pedido.numeroPedido || `pedido-${index}-${Date.now()}`,
        articulos: (pedido.articulos || []).map(art => ({
          ...art,
          id: art.codigoArticulo || `art-${Math.random().toString(36).substr(2, 9)}`
        }))
      }));
      
      setPedidos(pedidosNormalizados);
      
      const todosLosArticulos = pedidosNormalizados.flatMap(pedido => 
        pedido.articulos.map(art => art.codigoArticulo)
      );
      
      const codigosArticulos = [...new Set(todosLosArticulos)].filter(cod => cod);
      
      if (codigosArticulos.length > 0) {
        const responseUbicaciones = await axios.post(
          'http://localhost:3000/ubicacionesMultiples',
          { articulos: codigosArticulos },
          { headers }
        );
        
        setUbicaciones(responseUbicaciones.data);
      } else {
        setUbicaciones({});
      }
      
      const nuevasExpediciones = {};
      pedidosNormalizados.forEach(pedido => {
        pedido.articulos.forEach(linea => {
          const key = `${pedido.id}-${linea.id}`;
          let ubicacionesConStock = [];
          
          if (ubicaciones[linea.codigoArticulo]) {
            ubicacionesConStock = ubicaciones[linea.codigoArticulo].filter(ubi => ubi.unidadSaldo > 0);
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
            cantidad: Math.min(
              ubicacionesConStock[0].unidadSaldo,
              linea.unidadesPendientes
            ).toString()
          };
        });
      });
      setExpediciones(nuevasExpediciones);
      
      const initialModes = {};
      pedidosNormalizados.forEach(pedido => {
        initialModes[pedido.id] = 'show';
      });
      setPedidoViewModes(initialModes);
    } catch (err) {
      console.error('Error al obtener pedidos asignados:', err);
      
      let errorMessage = 'Error al cargar los pedidos asignados';
      
      if (err.response) {
        if (err.response.status === 500) {
          errorMessage = 'Error interno del servidor. Inténtalo más tarde';
        } else if (err.response.status === 401) {
          errorMessage = 'Error de autenticación. Vuelve a iniciar sesión';
        } else {
          errorMessage = `Error del servidor: ${err.response.status} ${err.response.statusText}`;
        }
      } else if (err.code === 'ECONNABORTED') {
        errorMessage = 'El servidor está tardando demasiado en responder';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      
      if (retryCount < 3) {
        setRetryCount(prev => prev + 1);
      }
    } finally {
      setLoading(false);
    }
  }, [retryCount]);

  useEffect(() => {
    fetchPedidosAsignados();
  }, [fetchPedidosAsignados]);

  const handleExpedir = async (codigoEmpresa, ejercicio, serie, numeroPedido, codigoArticulo, unidadesPendientes) => {
    const pedido = pedidos.find(p => p.numeroPedido === numeroPedido);
    const linea = pedido?.articulos?.find(a => a.codigoArticulo === codigoArticulo);
    const key = `${pedido?.id}-${linea?.id}`;
    
    const expedicion = expediciones[key];
    if (!expedicion) return;

    const cantidadExpedida = parseInt(expedicion.cantidad, 10);
    if (isNaN(cantidadExpedida) || cantidadExpedida <= 0) return;

    try {
      setExpedicionLoading(true);
      const headers = getAuthHeader();
      const result = await axios.post(
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

      if (result.data.success) {
        const newPedidos = [...pedidos];
        const pedidoIndex = newPedidos.findIndex(p => p.numeroPedido === numeroPedido);
        if (pedidoIndex !== -1) {
          const articuloIndex = newPedidos[pedidoIndex].articulos.findIndex(a => a.codigoArticulo === codigoArticulo);
          if (articuloIndex !== -1) {
            newPedidos[pedidoIndex].articulos[articuloIndex].unidadesPendientes -= cantidadExpedida;
            setPedidos(newPedidos);
          }
        }
      }
    } catch (error) {
      console.error('Error al expedir artículo:', error);
      alert('Error al expedir artículo: ' + error.message);
    } finally {
      setExpedicionLoading(false);
    }
  };

  const togglePedidoView = (pedidoId) => {
    setPedidoViewModes(prev => ({
      ...prev,
      [pedidoId]: prev[pedidoId] === 'show' ? 'hide' : 'show'
    }));
  };

  const handleExpedicionChange = (pedidoId, lineaId, field, value) => {
    const key = `${pedidoId}-${lineaId}`;
    setExpediciones(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
  };

  const pedidosFiltrados = pedidos.filter(pedido => {
    const matchPedido = filtroPedido 
      ? (pedido.numeroPedido?.toString().includes(filtroPedido) || 
         pedido.razonSocial?.toLowerCase().includes(filtroPedido.toLowerCase()))
      : true;

    const matchArticulo = filtroArticulo
      ? pedido.articulos?.some(art => 
          art.codigoArticulo?.includes(filtroArticulo) || 
          art.descripcionArticulo?.toLowerCase().includes(filtroArticulo.toLowerCase()))
      : true;

    const matchDireccion = filtroDireccion
      ? `${pedido.domicilio || ''} ${pedido.municipio || ''}`.toLowerCase().includes(filtroDireccion.toLowerCase())
      : true;

    return matchPedido && matchArticulo && matchDireccion;
  });

  const pedidosOrdenados = [...pedidosFiltrados].sort((a, b) => {
    if (orden === 'fecha') {
      const dateA = a.fechaPedido ? new Date(a.fechaPedido) : new Date(0);
      const dateB = b.fechaPedido ? new Date(b.fechaPedido) : new Date(0);
      return dateB - dateA;
    }
    return (a.razonSocial || '').localeCompare(b.razonSocial || '');
  });
  
  const indexUltimoPedido = paginaActual * pedidosPorPagina;
  const indexPrimerPedido = indexUltimoPedido - pedidosPorPagina;
  const pedidosActuales = pedidosOrdenados.slice(indexPrimerPedido, indexUltimoPedido);
  const totalPaginas = Math.ceil(pedidosOrdenados.length / pedidosPorPagina);

  const cambiarPagina = (numeroPagina) => {
    setPaginaActual(numeroPagina);
    window.scrollTo(0, 0);
  };

  const verificarYExpedir = (linea, pedido) => {
    setLineaVerificando({ linea, pedido });
  };

  const confirmarVerificacion = () => {
    if (!lineaVerificando) return;
    
    const { linea, pedido } = lineaVerificando;
    if (codigoVerificacion === linea.codigoArticulo || 
        codigoVerificacion === linea.codigoAlternativo) {
      handleExpedir(
        pedido.codigoEmpresa,
        pedido.ejercicioPedido,
        pedido.seriePedido,
        pedido.numeroPedido,
        linea.codigoArticulo,
        linea.unidadesPendientes
      );
      setLineaVerificando(null);
      setCodigoVerificacion('');
    } else {
      alert('Código incorrecto');
    }
  };

  return (
    <div className="pedidos-container">
      <div className="screen-header">
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
        <h2>Pedidos Asignados</h2>
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
            {retryCount <= 3 ? (
              <button onClick={() => setRetryCount(0)}>Reintentar</button>
            ) : (
              <>
                <p>Demasiados intentos fallidos</p>
                <button onClick={() => window.location.reload()}>Recargar página</button>
              </>
            )}
          </div>
        ) : loading ? (
          <div className="loading-pedidos">
            <div className="loader"></div>
            <p>Cargando pedidos asignados...</p>
            {retryCount > 0 && <p>Intento {retryCount} de 3</p>}
          </div>
        ) : pedidosOrdenados.length === 0 ? (
          <div className="no-pedidos">
            <p>No hay pedidos asignados</p>
            <button onClick={() => setRetryCount(0)}>Reintentar búsqueda</button>
          </div>
        ) : (
          <>
            {pedidosActuales.map(pedido => (
              <div key={pedido.id} className="pedido-card">
                <div className="pedido-info">
                  <span className="numero-pedido">#{pedido.numeroPedido}</span>
                  <span className="cliente">{pedido.razonSocial}</span>
                  <span className="fecha-pedido">{pedido.fechaPedido ? new Date(pedido.fechaPedido).toLocaleDateString() : 'Sin fecha'}</span>
                  <span className="fecha-entrega">
                    Entrega: {pedido.fechaEntrega ? new Date(pedido.fechaEntrega).toLocaleDateString() : 'Sin fecha'}
                  </span>
                </div>
                
                <div className="pedido-details">
                  <div><strong>Obra:</strong> {pedido.NombreObra || 'Sin obra especificada'}</div>
                  <div><strong>Dirección:</strong> {pedido.domicilio}</div>
                  <div><strong>Municipio:</strong> {pedido.municipio}</div>
                  
                  <div className="observaciones-container">
                    <strong>Observaciones:</strong>
                    <div className="observaciones-content">
                      {pedido.ObservacionesWeb || 'Sin observaciones'}
                    </div>
                  </div>
                </div>
                
                <div className="toggle-button-container">
                  <button 
                    onClick={() => togglePedidoView(pedido.id)}
                    className="btn-toggle"
                  >
                    {pedidoViewModes[pedido.id] === 'show' ? 'Ocultar líneas' : 'Mostrar líneas'}
                  </button>
                </div>
                
                {pedidoViewModes[pedido.id] === 'show' && (
                  <div className="lineas-table-container">
                    <table className="lineas-table">
                      <thead>
                        <tr>
                          <th>Artículo</th>
                          <th>Descripción</th>
                          <th>Pendiente</th>
                          <th>Ubicación</th>
                          <th>Cantidad</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(pedido.articulos || []).map(linea => {
                          let ubicacionesConStock = ubicaciones[linea.codigoArticulo] || [];
                          ubicacionesConStock = ubicacionesConStock.filter(ubi => ubi.unidadSaldo > 0);
                          if (ubicacionesConStock.length === 0) {
                            ubicacionesConStock.push({
                              ubicacion: "Zona descarga",
                              partida: null,
                              unidadSaldo: Infinity
                            });
                          }

                          const tieneStock = ubicacionesConStock.some(u => u.unidadSaldo > 0);
                          const stockNegativo = ubicacionesConStock.some(u => u.unidadSaldo < 0);
                          const key = `${pedido.id}-${linea.id}`;
                          const expedicion = expediciones[key] || {
                            ubicacion: ubicacionesConStock[0]?.ubicacion || '',
                            cantidad: '0'
                          };
                          
                          return (
                            <tr 
                              key={key}
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
                                  <span>{linea.unidadesPendientes}</span>
                                ) : (
                                  <span className="completada-badge">COMPLETADA</span>
                                )}
                              </td>
                              <td>
                                <div className="ubicacion-select-container">
                                  <select
                                    value={expedicion.ubicacion}
                                    onChange={e => handleExpedicionChange(
                                      pedido.id, 
                                      linea.id, 
                                      'ubicacion', 
                                      e.target.value
                                    )}
                                    className={`ubicacion-select ${expedicion.ubicacion === "Zona descarga" ? 'zona-descarga' : ''}`}
                                  >
                                    {ubicacionesConStock.map((ubicacion, ubiIndex) => (
                                      <option 
                                        key={ubiIndex} 
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
                                  max={Math.min(
                                    linea.unidadesPendientes,
                                    expedicion.ubicacion === "Zona descarga" 
                                      ? linea.unidadesPendientes 
                                      : (ubicacionesConStock.find(ubi => ubi.ubicacion === expedicion.ubicacion)?.unidadSaldo || 0))
                                  }
                                  value={expedicion.cantidad}
                                  onChange={e => handleExpedicionChange(
                                    pedido.id, 
                                    linea.id, 
                                    'cantidad', 
                                    e.target.value
                                  )}
                                  className={expedicion.ubicacion === "Zona descarga" ? 'zona-descarga-input' : ''}
                                />
                              </td>
                              <td className="td-centrado">
                                <button
                                  className="btn-expedir"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    verificarYExpedir(linea, pedido);
                                  }}
                                  disabled={expedicionLoading || !expediciones[key] || 
                                    parseInt(expedicion.cantidad || 0) <= 0}
                                >
                                  Expedir
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            
            {totalPaginas > 1 && (
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
            )}
          </>
        )}
      </div>
      
      <Navbar />

      {lineaVerificando && (
        <div className="modal-verificacion">
          <div className="modal-contenido">
            <h3>Verificar Artículo</h3>
            <input
              type="text"
              value={codigoVerificacion}
              onChange={(e) => setCodigoVerificacion(e.target.value)}
              placeholder="Ingrese código"
            />
            <button onClick={confirmarVerificacion}>Confirmar</button>
            <button onClick={() => setLineaVerificando(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PedidosAsignadosScreen;