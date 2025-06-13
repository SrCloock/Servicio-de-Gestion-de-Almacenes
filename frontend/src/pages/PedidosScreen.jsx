import React, { useState, useEffect } from 'react';
import '../styles/PedidosScreen.css';
import Navbar from '../components/Navbar';

const PedidosScreen = () => {
  const [pedidos, setPedidos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState({});
  const [lineaSeleccionada, setLineaSeleccionada] = useState(null);
  const [expediciones, setExpediciones] = useState({});
  const [pedidoViewModes, setPedidoViewModes] = useState({});
  const [loading, setLoading] = useState(true);
  const [expedicionLoading, setExpedicionLoading] = useState(false);
  const [filtroPedido, setFiltroPedido] = useState('');
  const [filtroArticulo, setFiltroArticulo] = useState('');
  const [orden, setOrden] = useState('fecha');

  useEffect(() => {
    const fetchPedidos = async () => {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:3000/pedidosPendientes');
        const data = await response.json();
        setPedidos(data);

        const codigosArticulos = [...new Set(data.flatMap(p => p.articulos.map(a => a.codigoArticulo)))];
        
        const responseUbicaciones = await fetch('http://localhost:3000/ubicacionesMultiples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articulos: codigosArticulos })
        });

        const ubicacionesJson = await responseUbicaciones.json();
        setUbicaciones(ubicacionesJson);

        const nuevasExpediciones = {};
        for (const art of codigosArticulos) {
          const ubicacionesConStock = ubicacionesJson[art] || [];
          if (ubicacionesConStock.length > 0) {
            nuevasExpediciones[art] = {
              ubicacion: ubicacionesConStock[0].ubicacion,
              partida: ubicacionesConStock[0].partida || null,
              cantidad: ubicacionesConStock[0].unidadSaldo.toString()
            };
          }
        }
        setExpediciones(nuevasExpediciones);

        const initialModes = {};
        data.forEach(pedido => {
          initialModes[pedido.numeroPedido] = 'show';
        });
        setPedidoViewModes(initialModes);
      } catch (error) {
        console.error('Error al obtener pedidos o ubicaciones:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPedidos();
  }, []);

  const handleLineaClick = async (codigoArticulo, unidadesPendientes) => {
    try {
      const response = await fetch(`http://localhost:3000/ubicacionesArticulo?codigoArticulo=${encodeURIComponent(codigoArticulo)}`);
      const data = await response.json();
      
      setUbicaciones(prev => ({
        ...prev,
        [codigoArticulo]: data
      }));
      
      setLineaSeleccionada(codigoArticulo);
    } catch (error) {
      console.error('Error al obtener ubicaciones:', error);
    }
  };

  const handleExpedir = async (codigoEmpresa, ejercicio, serie, numeroPedido, codigoArticulo, unidadesPendientes) => {
    const expedicion = expediciones[codigoArticulo];
    if (!expedicion) return;

    const cantidadExpedida = parseInt(expedicion.cantidad, 10);
    if (isNaN(cantidadExpedida)) return;

    try {
      setExpedicionLoading(true);
      const response = await fetch('http://localhost:3000/actualizarLineaPedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoEmpresa,
          ejercicio,
          serie,
          numeroPedido,
          codigoArticulo,
          cantidadExpedida,
          ubicacion: expedicion.ubicacion,
          partida: expedicion.partida
        })
      });

      const result = await response.json();
      if (result.success) {
        // Actualizar estado local
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

  const handleExpedicionChange = (codigoArticulo, field, value) => {
    setExpediciones(prev => ({
      ...prev,
      [codigoArticulo]: {
        ...prev[codigoArticulo],
        [field]: value
      }
    }));
  };

  // Filtrar pedidos
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

    return matchPedido && matchArticulo;
  });

  // Ordenar pedidos
  const pedidosOrdenados = [...pedidosFiltrados].sort((a, b) => {
    if (orden === 'fecha') return new Date(b.fechaPedido) - new Date(a.fechaPedido);
    return a.razonSocial.localeCompare(b.razonSocial);
  });

  return (
    <div className="pedidos-container">
      <div className="pedidos-header">
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
        <div className="header-content">
          <h2>Preparación de Pedidos</h2>
        </div>
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
        {loading ? (
          <div className="loading-pedidos">
            <div className="loader"></div>
            <p>Cargando pedidos...</p>
          </div>
        ) : pedidosOrdenados.length === 0 ? (
          <div className="no-pedidos">
            <p>No hay pedidos pendientes</p>
          </div>
        ) : (
          pedidosOrdenados.map(pedido => (
            <div key={pedido.numeroPedido} className="pedido-card">
              <div className="pedido-header">
                <span>Pedido: {pedido.seriePedido || ''}-{pedido.numeroPedido}</span>
                <span>{new Date(pedido.fechaPedido).toLocaleDateString()}</span>
              </div>
              
              <div className="pedido-info">
                <span className="numero-pedido">#{pedido.numeroPedido}</span>
                <span className="fecha-pedido">{new Date(pedido.fechaPedido).toLocaleDateString()}</span>
                <span>{pedido.razonSocial}</span>
              </div>
              
              <div className="pedido-details">
                <div><strong>Dirección:</strong> {pedido.domicilio}, {pedido.municipio}</div>
                <div><strong>Obra:</strong> {pedido.nombreObra || 'Sin obra especificada'}</div>
                {pedido.observacionesPedido && (
                  <div className="observaciones">
                    <strong>Observaciones:</strong> {pedido.observacionesPedido}
                  </div>
                )}
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
                        <th>Cantidad</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedido.articulos.map((linea, index) => {
                        const tieneStock = (ubicaciones[linea.codigoArticulo] || []).some(u => u.unidadSaldo > 0);
                        const stockNegativo = (ubicaciones[linea.codigoArticulo] || []).some(u => u.unidadSaldo < 0);
                        
                        return (
                          <tr 
                            key={index}
                            className={`linea-pedido ${tieneStock ? 'clickable' : 'no-stock'} ${stockNegativo ? 'negative-stock' : ''}`}
                            onClick={() => handleLineaClick(linea.codigoArticulo, linea.unidadesPendientes)}
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
                                  value={expediciones[linea.codigoArticulo]?.ubicacion || ''}
                                  onChange={e => handleExpedicionChange(
                                    linea.codigoArticulo, 
                                    'ubicacion', 
                                    e.target.value
                                  )}
                                  className={`ubicacion-select ${
                                    expediciones[linea.codigoArticulo]?.ubicacion === "Zona descarga" ? 
                                    'zona-descarga' : ''
                                  }`}
                                >
                                  {(ubicaciones[linea.codigoArticulo] || []).map((ubicacion, ubiIndex) => (
                                    <option 
                                      key={ubiIndex} 
                                      value={ubicacion.ubicacion}
                                      className={
                                        ubicacion.ubicacion === "Zona descarga" ? 
                                        'zona-descarga-option' : ''
                                      }
                                    >
                                      {ubicacion.ubicacion} {ubicacion.partida ? `(${ubicacion.partida})` : ''} - 
                                      Stock: {ubicacion.unidadSaldo}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                max={linea.unidadesPendientes}
                                value={expediciones[linea.codigoArticulo]?.cantidad || '0'}
                                onChange={e => handleExpedicionChange(
                                  linea.codigoArticulo, 
                                  'cantidad', 
                                  e.target.value
                                )}
                                className={
                                  expediciones[linea.codigoArticulo]?.ubicacion === "Zona descarga" ? 
                                  'zona-descarga-input' : ''
                                }
                              />
                            </td>
                            <td className="td-centrado">
                              <button
                                className="btn-expedir"
                                onClick={() => handleExpedir(
                                  pedido.codigoEmpresa,
                                  pedido.ejercicioPedido,
                                  pedido.seriePedido,
                                  pedido.numeroPedido,
                                  linea.codigoArticulo,
                                  linea.unidadesPendientes
                                )}
                                disabled={expedicionLoading || !expediciones[linea.codigoArticulo] || 
                                  parseInt(expediciones[linea.codigoArticulo]?.cantidad || 0) <= 0}
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
          ))
        )}
      </div>
      
      <Navbar />
    </div>
  );
};

export default PedidosScreen;