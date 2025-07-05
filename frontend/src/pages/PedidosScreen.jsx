import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import UserInfoBar from '../components/UserInfoBar';
import Navbar from '../components/Navbar';
import '../styles/PedidosScreen.css';

const PedidosScreen = () => {
  // Estados principales
  const [pedidos, setPedidos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState({});
  const [lineaSeleccionada, setLineaSeleccionada] = useState(null);
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
  const [repartidores, setRepartidores] = useState([]);
  const [pedidoAsignando, setPedidoAsignando] = useState(null);
  const [repartidorSeleccionado, setRepartidorSeleccionado] = useState('');
  const [codigoVerificacion, setCodigoVerificacion] = useState('');
  const [lineaVerificando, setLineaVerificando] = useState(null);
  const [detallesModal, setDetallesModal] = useState(null);
  
  // Constantes y hooks
  const pedidosPorPagina = 20;
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));

  // ======================= EFECTOS =======================
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
        
        if (!headers.usuario || !headers.codigoempresa) {
          setError('Error de autenticación. Vuelve a iniciar sesión');
          setLoading(false);
          return;
        }
        
        // Cargar repartidores
        const repResponse = await axios.get('http://localhost:3000/repartidores', { 
          headers,
          params: { codigoEmpresa, categoria: 'REP' } 
        });
        setRepartidores(repResponse.data);
        
        // Cargar pedidos pendientes
        const response = await axios.get(`http://localhost:3000/pedidosPendientes`, { 
          headers,
          params: { codigoEmpresa } 
        });
        setPedidos(response.data);
        
        // Cargar ubicaciones de artículos
        const codigosArticulos = [...new Set(response.data.flatMap(p => p.articulos.map(a => a.codigoArticulo)))];
        const responseUbicaciones = await axios.post(
          'http://localhost:3000/ubicacionesMultiples',
          { articulos: codigosArticulos },
          { headers }
        );
        setUbicaciones(responseUbicaciones.data);
        
        // Inicializar expediciones
        const nuevasExpediciones = {};
        response.data.forEach(pedido => {
          pedido.articulos.forEach(linea => {
            const key = `${pedido.numeroPedido}-${linea.codigoArticulo}`;
            let ubicacionesConStock = responseUbicaciones.data[linea.codigoArticulo]?.filter(ubi => ubi.unidadSaldo > 0) || [];
            
            // Calcular cantidad inicial
            const unidadesPendientes = parseFloat(linea.unidadesPendientes) || 0;
            const factor = parseFloat(linea.factorConversion) || 1;
            let cantidadInicial = unidadesPendientes / factor;
            
            if (ubicacionesConStock.length > 0 && ubicacionesConStock[0].unidadSaldo !== Infinity) {
              cantidadInicial = Math.min(cantidadInicial, ubicacionesConStock[0].unidadSaldo);
            }
            
            if (!Number.isInteger(cantidadInicial)) {
              cantidadInicial = Math.ceil(cantidadInicial);
            }
            
            // Si no hay stock, usar "Zona descarga"
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
  }, []);

  // ======================= FUNCIONES =======================
  const abrirModalDetalles = (detalles) => setDetallesModal(detalles);
  const cerrarModalDetalles = () => setDetallesModal(null);

  const handleLineaClick = async (codigoArticulo) => {
    try {
      const headers = getAuthHeader();
      const response = await axios.get(`http://localhost:3000/stock/por-articulo`, {
        headers,
        params: { codigoArticulo, codigoEmpresa: user.CodigoEmpresa }
      });
      
      let ubicacionesConStock = response.data.filter(ubi => ubi.Cantidad > 0);
      if (ubicacionesConStock.length === 0) {
        ubicacionesConStock.push({
          ubicacion: "Zona descarga",
          partida: null,
          unidadSaldo: Infinity
        });
      }

      setUbicaciones(prev => ({
        ...prev,
        [codigoArticulo]: ubicacionesConStock
      }));
      
      setLineaSeleccionada(codigoArticulo);
    } catch (error) {
      console.error('Error al obtener ubicaciones:', error);
    }
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
      }
    } catch (error) {
      console.error('Error al expedir artículo:', error);
      alert('Error al expedir artículo: ' + error.message);
    } finally {
      setExpedicionLoading(false);
    }
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

  const formatearUnidades = (linea) => {
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

  const verificarYExpedir = (linea, pedido) => setLineaVerificando({ linea, pedido });

  const confirmarVerificacion = () => {
    if (!lineaVerificando) return;
    
    const { linea, pedido } = lineaVerificando;
    if (codigoVerificacion === linea.codigoArticulo || codigoVerificacion === linea.codigoAlternativo) {
      handleExpedir(
        pedido.codigoEmpresa,
        pedido.ejercicioPedido,
        pedido.seriePedido,
        pedido.numeroPedido,
        linea.codigoArticulo,
        linea.unidadesPendientes,
        linea
      );
      setLineaVerificando(null);
      setCodigoVerificacion('');
    } else {
      alert('Código incorrecto');
    }
  };

  const cambiarPagina = (numeroPagina) => {
    setPaginaActual(numeroPagina);
    window.scrollTo(0, 0);
  };

  // ======================= COMPONENTES =======================
  const DetallesArticuloModal = ({ detalles }) => {
    if (!detalles?.length) return null;

    return (
      <div className="modal-detalles">
        <div className="modal-contenido">
          <button className="cerrar-modal" onClick={cerrarModalDetalles}>&times;</button>
          <h3>Detalles de Variantes</h3>
          
          <div className="detalles-container">
            {detalles.map((detalle, index) => (
              <div key={index} className="variante-grupo">
                <div className="variante-header">
                  <span className="color-variante">
                    <strong>Color:</strong> {detalle.color.nombre}
                  </span>
                </div>
                
                <table className="detalles-table">
                  <thead>
                    <tr>
                      <th>Talla</th>
                      <th>Descripción</th>
                      <th>Unidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(detalle.tallas)
                      .filter(([_, talla]) => talla.unidades > 0)
                      .map(([codigoTalla, talla], idx) => (
                        <tr key={idx}>
                          <td>{codigoTalla}</td>
                          <td>{talla.descripcion}</td>
                          <td>{talla.unidades}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                
                <div className="variante-total">
                  <strong>Total unidades:</strong> {detalle.unidades}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const LineaPedido = ({ linea, pedido, index }) => {
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
    
    const formatted = formatearUnidades(linea);
    const factor = parseFloat(linea.factorConversion) || 1;
    const unidadStock = linea.unidadAlternativa || 'ud';
    const unidadVenta = linea.unidadBase || 'ud';
    
    return (
      <tr 
        key={`${pedido.numeroPedido}-${linea.codigoArticulo}-${index}`}
        className={`linea-pedido ${tieneStock ? 'clickable' : 'no-stock'} ${stockNegativo ? 'negative-stock' : ''}`}
        onClick={() => handleLineaClick(linea.codigoArticulo)}
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
                    abrirModalDetalles(linea.detalles);
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
          <div className="unidad-info">en {unidadStock}</div>
        </td>
        <td className="td-centrado">
          <button
            className="btn-expedir"
            onClick={(e) => {
              e.stopPropagation();
              verificarYExpedir(linea, pedido);
            }}
            disabled={expedicionLoading || !expediciones[key] || parseFloat(expedicion.cantidad || 0) <= 0}
          >
            Expedir
          </button>
        </td>
      </tr>
    );
  };

  const PedidoCard = ({ pedido }) => (
    <div key={`${pedido.numeroPedido}-${pedido.codigoEmpresa}`} className="pedido-card">
      {/* Encabezado del pedido */}
      <div className="pedido-info">
        <span className="numero-pedido">#{pedido.numeroPedido}</span>
        <span className="cliente">{pedido.razonSocial}</span>
        <span className="fecha-pedido">{new Date(pedido.fechaPedido).toLocaleDateString()}</span>
        <span className="fecha-entrega">
          Entrega: {pedido.fechaEntrega ? new Date(pedido.fechaEntrega).toLocaleDateString() : 'Sin fecha'}
        </span>
        <button 
          onClick={() => setPedidoAsignando(pedido)}
          className="btn-asignar"
        >
          Asignar Repartidor
        </button>
      </div>
      
      {/* Detalles del pedido */}
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
      
      {/* Botón para mostrar/ocultar líneas */}
      <div className="toggle-button-container">
        <button 
          onClick={() => togglePedidoView(pedido.numeroPedido)}
          className="btn-toggle"
        >
          {pedidoViewModes[pedido.numeroPedido] === 'show' ? 'Ocultar líneas' : 'Mostrar líneas'}
        </button>
      </div>
      
      {/* Tabla de líneas de pedido */}
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
              {pedido.articulos.map((linea, index) => (
                <LineaPedido 
                  key={`${pedido.numeroPedido}-${linea.codigoArticulo}-${index}`} 
                  linea={linea} 
                  pedido={pedido} 
                  index={index} 
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const Paginacion = () => (
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

  const AsignacionModal = () => (
    pedidoAsignando && (
      <div className="modal-asignacion">
        <div className="modal-contenido">
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
          <button 
            onClick={asignarPedido}
            disabled={!repartidorSeleccionado}
          >
            Asignar
          </button>
          <button onClick={() => setPedidoAsignando(null)}>Cancelar</button>
        </div>
      </div>
    )
  );

  const VerificacionModal = () => (
    lineaVerificando && (
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
    )
  );

  // ======================= DATOS PARA UI =======================
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
      ? new Date(b.fechaPedido) - new Date(a.fechaPedido) 
      : a.razonSocial.localeCompare(b.razonSocial);
  });
  
  const indexUltimoPedido = paginaActual * pedidosPorPagina;
  const indexPrimerPedido = indexUltimoPedido - pedidosPorPagina;
  const pedidosActuales = pedidosOrdenados.slice(indexPrimerPedido, indexUltimoPedido);
  const totalPaginas = Math.ceil(pedidosOrdenados.length / pedidosPorPagina);

  // ======================= RENDERIZADO PRINCIPAL =======================
  return (
    <div className="pedidos-container">
      <UserInfoBar />
      
      <div className="screen-header">
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
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
              <PedidoCard key={pedido.numeroPedido} pedido={pedido} />
            ))}
            
            <Paginacion />
          </>
        )}
      </div>
      
      {/* Modales */}
      {detallesModal && <DetallesArticuloModal detalles={detallesModal} />}
      <AsignacionModal />
      <VerificacionModal />

      <Navbar />
    </div>
  );
};

export default PedidosScreen;