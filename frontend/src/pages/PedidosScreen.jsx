import React, { useState, useEffect } from 'react';
import '../styles/PedidosScreen.css';
import { useNavigate } from 'react-router-dom';

function PedidosScreen() {
  const navigate = useNavigate();
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
        const nuevasExpediciones = {};

        for (const art of codigosArticulos) {
          const ubicacionesConStock = ubicacionesJson[art] || [];
          if (ubicacionesConStock.length > 0) {
            const primeraUbic = ubicacionesConStock[0];
            nuevasExpediciones[art] = {
              ubicacion: primeraUbic.ubicacion,
              partida: primeraUbic.partida || null,
              cantidad: Math.min(
                primeraUbic.unidadSaldo,
                data.flatMap(p => p.articulos)
                  .find(a => a.codigoArticulo === art)?.unidadesPendientes || 0
              ).toString(),
              esZonaDescarga: primeraUbic.ubicacion === "Zona descarga"
            };
          }
          // Forzar "Zona descarga" para artículos sin stock
          else {
            nuevasExpediciones[art] = {
              ubicacion: "Zona descarga",
              partida: null,
              cantidad: "0",
              esZonaDescarga: true
            };
            
            // Añadir manualmente la ubicación
            ubicacionesJson[art] = [{
              ubicacion: "Zona descarga",
              partida: null,
              unidadSaldo: 0
            }];
          }
        }

        setUbicaciones(ubicacionesJson);
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
      let data = await response.json();
      
      // Si no hay ubicaciones, forzar "Zona descarga"
      if (data.length === 0) {
        data = [{
          ubicacion: "Zona descarga",
          partida: null,
          unidadSaldo: 0
        }];
      }
      
      const ubicacionesConStock = data.filter(ubi => ubi.unidadSaldo > 0);
      
      setUbicaciones(prev => ({
        ...prev,
        [codigoArticulo]: data
      }));
      
      setLineaSeleccionada(codigoArticulo);
      setExpediciones(prev => {
        const stockDisponible = ubicacionesConStock.length > 0 
          ? Math.min(ubicacionesConStock[0].unidadSaldo, unidadesPendientes)
          : 0;
        
        return {
          ...prev,
          [codigoArticulo]: {
            ubicacion: data[0].ubicacion,
            partida: data[0].partida || null,
            cantidad: stockDisponible.toString(),
            esZonaDescarga: data[0].ubicacion === "Zona descarga"
          }
        };
      });
    } catch (error) {
      console.error('Error al obtener ubicaciones:', error);
    }
  };

  const handleChangeUbicacion = (codigoArticulo, value, unidadesPendientes) => {
    const { ubicacion, partida } = JSON.parse(value);
    const ubicacionesArticulo = ubicaciones[codigoArticulo] || [];
    const ubicacionSel = ubicacionesArticulo.find(u => 
      u.ubicacion === ubicacion && 
      (u.partida || null) === (partida || null)
    );

    // Calcular cantidad máxima (mínimo entre stock y pendientes)
    const stockDisponible = ubicacionSel?.unidadSaldo || 0;
    const cantidadMaxima = Math.min(stockDisponible, unidadesPendientes);
    
    setExpediciones({
      ...expediciones,
      [codigoArticulo]: {
        ubicacion,
        partida,
        cantidad: cantidadMaxima.toString(),
        esZonaDescarga: ubicacion === "Zona descarga"
      }
    });
  };

  const handleChangeCantidad = (codigoArticulo, cantidad) => {
    const ubicacionesArticulo = ubicaciones[codigoArticulo] || [];
    const ubicacionSel = ubicacionesArticulo.find(u =>
      u.ubicacion === expediciones[codigoArticulo]?.ubicacion &&
      (u.partida || null) === (expediciones[codigoArticulo]?.partida || null)
    );

    // Si es zona de descarga, permitir cualquier cantidad
    const isZonaDescarga = expediciones[codigoArticulo]?.esZonaDescarga;

    const max = isZonaDescarga
      ? Infinity
      : Math.min(
          pedidos.flatMap(p => p.articulos)
            .find(a => a.codigoArticulo === codigoArticulo)?.unidadesPendientes || 0,
          ubicacionSel?.unidadSaldo || 0
        );

    const value = Math.min(Number(cantidad), max);

    setExpediciones({
      ...expediciones,
      [codigoArticulo]: {
        ...expediciones[codigoArticulo],
        cantidad: value > 0 ? value.toString() : ''
      }
    });
  };


  const expedirLinea = async (pedidoIndex, lineaIndex, codigoArticulo) => {
    const { cantidad, ubicacion, partida } = expediciones[codigoArticulo] || {};
    const cantidadNum = parseFloat(cantidad);

    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      alert('Por favor ingrese una cantidad válida mayor que cero');
      return;
    }

    const pedido = pedidos[pedidoIndex];
    const linea = pedido.articulos[lineaIndex];

    // Validación modificada para aceptar ambos códigos
    const codigoEscaneado = prompt(`Escribe el codigo de articulo o escanea el código de barra para ${linea.descripcionArticulo}`);
    
    if (codigoEscaneado !== linea.codigoAlternativo && 
        codigoEscaneado !== linea.codigoArticulo) {
      alert(`❌ Código incorrecto. Valores aceptados: 
            ${linea.codigoAlternativo} (barras) o 
            ${linea.codigoArticulo} (artículo)`);
      return;
    }

    try {
      setExpedicionLoading(true);
      const response = await fetch('http://localhost:3000/actualizarLineaPedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigoEmpresa: pedido.codigoEmpresa,
          ejercicio: pedido.ejercicio,
          serie: pedido.serie,
          numeroPedido: pedido.numeroPedido,
          codigoArticulo: linea.codigoArticulo,
          cantidadExpedida: cantidadNum,
          ubicacion: ubicacion,
          partida: partida || null
        })
      });

      const result = await response.json();
      if (!result.success) {
        console.error(result);
        alert('Error al actualizar: ' + (result.mensaje || result.error || ''));
        return;
      }

      const updatedPedidos = [...pedidos];
      updatedPedidos[pedidoIndex].articulos[lineaIndex].unidadesPendientes -= cantidadNum;

      if (updatedPedidos[pedidoIndex].articulos[lineaIndex].unidadesPendientes <= 0) {
        updatedPedidos[pedidoIndex].articulos[lineaIndex].completada = true;
      }

      const pedidoFinalizado = updatedPedidos[pedidoIndex]?.articulos?.every(l => l.unidadesPendientes <= 0) ?? false;

      if (pedidoFinalizado) {
        const { codigoEmpresa, ejercicio, numeroPedido, serie } = pedido;
        await fetch('http://localhost:3000/marcarPedidoCompletado', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigoEmpresa, ejercicio, numeroPedido, serie })
        });
      }

      setPedidos(updatedPedidos);
      setLineaSeleccionada(null);
      setUbicaciones(prev => {
        const newUbicaciones = { ...prev };
        // Actualizar el stock en las ubicaciones
        const ubicacionesArt = [...(newUbicaciones[codigoArticulo] || [])];
        const ubicIndex = ubicacionesArt.findIndex(u => 
          u.ubicacion === ubicacion && 
          (u.partida || null) === (partida || null)
        );
        if (ubicIndex >= 0) {
          ubicacionesArt[ubicIndex].unidadSaldo -= cantidadNum;
          newUbicaciones[codigoArticulo] = ubicacionesArt;
        }
        return newUbicaciones;
      });
      setExpediciones(prev => {
        const newExpediciones = { ...prev };
        delete newExpediciones[codigoArticulo];
        return newExpediciones;
      });
      alert(`✅ ${cantidadNum} unidades expedidas correctamente`);
    } catch (error) {
      console.error('Error al actualizar línea:', error);
      alert('Error al conectar con el servidor');
    } finally {
      setExpedicionLoading(false);
    }
  };

  const togglePedidoViewMode = (pedidoId) => {
    setPedidoViewModes(prev => {
      const currentMode = prev[pedidoId] || 'show';
      let nextMode;
      
      switch(currentMode) {
        case 'show':
          nextMode = 'completed';
          break;
        case 'completed':
          nextMode = 'all';
          break;
        case 'all':
          nextMode = 'hide';
          break;
        case 'hide':
        default:
          nextMode = 'show';
      }
      
      return {
        ...prev,
        [pedidoId]: nextMode
      };
    });
  };

  const getButtonText = (mode) => {
    switch(mode) {
      case 'show':
        return 'Líneas Pendientes';
      case 'completed':
        return 'Líneas Completadas';
      case 'all':
        return 'Todas Las Lineas';
      case 'hide':
        return 'Ocultar Líneas';
      default:
        return 'Líneas Pendientes';
    }
  };

  const filterLineas = (pedido) => {
    const viewMode = pedidoViewModes[pedido.numeroPedido] || 'show';
    
    switch (viewMode) {
      case 'show':
        return pedido.articulos.filter(art => !art.completada);
      case 'completed':
        return pedido.articulos.filter(art => art.completada);
      case 'all':
        return [...pedido.articulos];
      case 'hide':
        return [];
      default:
        return [];
    }
  };

  // Filtrar y ordenar pedidos
  const pedidosFiltrados = pedidos
    .filter(pedido => {
      const matchesPedido = 
        (pedido.numeroPedido != null && pedido.numeroPedido.toString().includes(filtroPedido)) ||
        (pedido.razonSocial != null && pedido.razonSocial.toLowerCase().includes(filtroPedido.toLowerCase())) ||
        (pedido.Obra != null && pedido.Obra.toLowerCase().includes(filtroPedido.toLowerCase()));

      if (!matchesPedido) return false;
      
      if (filtroArticulo) {
        return pedido.articulos.some(art => 
          art.codigoArticulo.includes(filtroArticulo) ||
          art.descripcionArticulo.toLowerCase().includes(filtroArticulo.toLowerCase())
        );
      }
      
      return true;
    })
    .sort((a, b) => {
      if (orden === 'fecha') return new Date(b.fechaPedido) - new Date(a.fechaPedido);
      if (orden === 'numero') return a.numeroPedido - b.numeroPedido;
      if (orden === 'cliente') return a.razonSocial.localeCompare(b.razonSocial);
      return 0;
    });

  const renderLineasPedido = (pedido, pedidoIndex) => {
    const lineasFiltradas = filterLineas(pedido);
    const viewMode = pedidoViewModes[pedido.numeroPedido] || 'show';
    
    if (viewMode === 'hide') {
      return null;
    }

    if (lineasFiltradas.length === 0) {
      return (
        <tr>
          <td colSpan="6" className="no-results-linea">
            {viewMode === 'show' 
              ? 'No hay líneas pendientes en este pedido' 
              : viewMode === 'completed'
                ? 'No hay líneas completadas en este pedido'
                : 'No hay líneas para mostrar'}
          </td>
        </tr>
      );
    }

    return lineasFiltradas.map((art, i) => {
      const ubicacionesArt = ubicaciones[art.codigoArticulo] || [];
      const stockTotal = ubicacionesArt.reduce((sum, ubi) => sum + ubi.unidadSaldo, 0);
      const sinStock = stockTotal <= 0 && art.unidadesPendientes > 0;
      const stockNegativo = stockTotal < 0;
      
      return (
        <React.Fragment key={i}>
          <tr 
            onClick={() => art.unidadesPendientes > 0 && handleLineaClick(art.codigoArticulo, art.unidadesPendientes)} 
            className={`linea-pedido ${art.unidadesPendientes > 0 ? 'clickable' : ''} ${sinStock ? 'no-stock' : ''} ${stockNegativo ? 'negative-stock' : ''}`}
          >
            <td className="td-izquierda">
              <div className="codigo-articulo">{art.codigoArticulo}</div>
              <div className="codigo-alternativo">
                {art.codigoAlternativo || 'N/A'}
              </div>
            </td>
            <td className="td-izquierda">{art.codigoAlmacen || '-'}</td>
            <td className="td-izquierda">
              <div className="descripcion-articulo">{art.descripcionArticulo}</div>
              <div className="detalles-articulo">
                {art.unidadMedida} • {art.agrupacion}
              </div>
            </td>
            <td className="td-centrado">{art.unidadesPedidas}</td>
            <td className="td-centrado">
              {art.completada ? (
                <span className="completada-badge">Completada</span>
              ) : (
                <div className="ubicacion-select-container">
                  <select
                    value={JSON.stringify({
                      ubicacion: expediciones[art.codigoArticulo]?.ubicacion || '',
                      partida: expediciones[art.codigoArticulo]?.partida || null,
                    })}
                    onChange={(e) => handleChangeUbicacion(art.codigoArticulo, e.target.value, art.unidadesPendientes)}
                    className={`ubicacion-select ${expediciones[art.codigoArticulo]?.esZonaDescarga ? 'zona-descarga' : ''}`}
                  >
                    {(ubicacionesArt || []).map((ubi, idx) => {
                      const isZonaDescarga = ubi.ubicacion === "Zona descarga";
                      return (
                        <option
                          key={idx}
                          value={JSON.stringify({
                            ubicacion: ubi.ubicacion,
                            partida: ubi.partida || null
                          })}
                          className={isZonaDescarga ? 'zona-descarga-option' : ''}
                        >
                          {ubi.ubicacion}
                          {ubi.partida ? ` - Partida ${ubi.partida}` : ''} - {ubi.unidadSaldo} uds
                          {isZonaDescarga ? ' (Zona Descarga)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </td>
            <td className="td-centrado">
              {art.completada ? (
                <span className="completada-badge">✔</span>
              ) : (
                <span className={sinStock ? 'pendiente-sin-stock' : ''}>
                  {art.unidadesPendientes}
                </span>
              )}
            </td>
          </tr>
          {lineaSeleccionada === art.codigoArticulo && (
            <tr className="detalles-expedicion">
              <td colSpan="6">
                <div className="expedicion-container">
                  <div className="expedicion-form">
                    <label>
                      <strong>Unidades a expedir:</strong>
                      <input
                        type="number"
                        min="1"
                        value={expediciones[art.codigoArticulo]?.cantidad || ''}
                        onChange={(e) => handleChangeCantidad(art.codigoArticulo, e.target.value)}
                        className={expediciones[art.codigoArticulo]?.esZonaDescarga ? 'zona-descarga-input' : ''}
                      />
                    </label>
                    <button
                      onClick={() => expedirLinea(pedidoIndex, i, art.codigoArticulo)}
                      disabled={expedicionLoading}
                      className="btn-expedir"
                    >
                      {expedicionLoading ? 'Procesando...' : 'Validar Línea'}
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          )}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="pedidos-container">
      <div className="pedidos-header">
        <div className="header-content">
          <h2>Pedidos Pendientes</h2>
          <div className="navigation-buttons">
            <button onClick={() => navigate('/rutas')} className="btn-nav">
              📦 Rutas
            </button>
            <button onClick={() => navigate('/traspaso')} className="btn-nav">
              🔄 Traspasos
            </button>
            <button onClick={() => navigate('/inventario')} className="btn-nav">
              📊 Inventario
            </button>
            <button onClick={() => navigate('/')} className="btn-nav">
              🏠 Inicio
            </button>
          </div>
        </div>
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
      </div>

      <div className="pedidos-controls">
        <div className="filtros-container">
          <div className="filtro-group">
            <label>Filtrar pedidos:</label>
            <input
              type="text"
              placeholder="Nº pedido, cliente, obra..."
              value={filtroPedido}
              onChange={(e) => setFiltroPedido(e.target.value)}
              className="search-input"
            />
          </div>
          
          <div className="filtro-group">
            <label>Filtrar artículos:</label>
            <input
              type="text"
              placeholder="Código o descripción artículo..."
              value={filtroArticulo}
              onChange={(e) => setFiltroArticulo(e.target.value)}
              className="search-input"
            />
          </div>
          
          <div className="filtro-group">
            <label>Ordenar por:</label>
            <select
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              className="sort-select"
            >
              <option value="fecha">Fecha más reciente</option>
              <option value="numero">Número de pedido</option>
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
        ) : pedidosFiltrados.length === 0 ? (
          <div className="no-pedidos">
            <p>No hay pedidos que coincidan con los filtros</p>
          </div>
        ) : (
          pedidosFiltrados.map((pedido, index) => (
            <div key={index} className="pedido-card">
              <div className="pedido-header">
                <div className="pedido-info">
                  <span className="numero-pedido">Pedido: {pedido.numeroPedido}</span>
                  <span className="fecha-pedido">Fecha: {new Date(pedido.fechaPedido).toLocaleDateString()}</span>
                  <span>Empresa: {pedido.codigoEmpresa}</span>
                </div>
              </div>
              <div className="pedido-details">
                <div><strong>Cliente:</strong> {pedido.razonSocial}</div>
                <div><strong>Obra:</strong> {pedido.Obra || 'POR AHORA DESACTIVADA'}</div>
                <div><strong>Dirección:</strong> {pedido.domicilio}</div>
                <div><strong>Municipio:</strong> {pedido.municipio}</div>
                {pedido.observaciones && (
                  <div className="observaciones"><strong>Obs:</strong> {pedido.observaciones}</div>
                )}
              </div>
              
              <div className="toggle-button-container">
                <button
                  onClick={() => togglePedidoViewMode(pedido.numeroPedido)}
                  className={`btn-toggle ${pedidoViewModes[pedido.numeroPedido]}`}
                >
                  {getButtonText(pedidoViewModes[pedido.numeroPedido])}
                </button>
              </div>
              
              <div className="lineas-table-container">
                <table className="lineas-table">
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th>Almacén</th>
                      <th>Descripción</th>
                      <th>Pedidas</th>
                      <th>Ubicaciones</th>
                      <th>Pendientes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderLineasPedido(pedido, index)}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default PedidosScreen;