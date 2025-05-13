import React, { useState, useEffect } from 'react';
import '../styles/PedidosScreen.css';
import { useNavigate } from 'react-router-dom';

function PedidosScreen() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [lineaSeleccionada, setLineaSeleccionada] = useState(null);
  const [expediciones, setExpediciones] = useState({});
  const [mostrarRutas, setMostrarRutas] = useState(false);
  const [pedidoViewModes, setPedidoViewModes] = useState({});

  useEffect(() => {
    const fetchPedidos = async () => {
      try {
        const response = await fetch('http://localhost:3000/pedidosPendientes');
        const data = await response.json();
        setPedidos(data);
        
        // Inicializar todos los pedidos para mostrar las líneas pendientes por defecto
        const initialModes = {};
        data.forEach(pedido => {
          initialModes[pedido.numeroPedido] = 'show';
        });
        setPedidoViewModes(initialModes);
      } catch (error) {
        console.error('Error al obtener pedidos:', error);
      }
    };
    fetchPedidos();
  }, []);

  const handleLineaClick = async (codigoArticulo, unidadesPendientes) => {
    try {
      const response = await fetch(`http://localhost:3000/ubicacionesArticulo?codigoArticulo=${encodeURIComponent(codigoArticulo)}`);
      const data = await response.json();
      
      if (data.length > 0) {
        const ubicacionesConStock = data.filter(ubi => ubi.unidadSaldo > 0);
        
        if (ubicacionesConStock.length > 0) {
          const primeraUbicacion = ubicacionesConStock[0];
          setUbicaciones(ubicacionesConStock);
          setLineaSeleccionada(codigoArticulo);
          setExpediciones({
            ...expediciones,
            [codigoArticulo]: {
              ubicacion: primeraUbicacion.ubicacion,
              cantidad: Math.min(primeraUbicacion.unidadSaldo, unidadesPendientes).toString()
            }
          });
        } else {
          alert('No hay stock disponible para este artículo');
        }
      }
    } catch (error) {
      console.error('Error al obtener ubicaciones:', error);
    }
  };

  const handleChangeUbicacion = (codigoArticulo, ubicacion) => {
    const ubicacionSel = ubicaciones.find(u => u.ubicacion === ubicacion);
    setExpediciones({
      ...expediciones,
      [codigoArticulo]: {
        ubicacion: ubicacion,
        cantidad: ubicacionSel 
          ? Math.min(ubicacionSel.unidadSaldo, 
              pedidos.flatMap(p => p.articulos)
                .find(a => a.codigoArticulo === codigoArticulo)?.unidadesPendientes || 0).toString()
          : '0'
      }
    });
  };

  const handleChangeCantidad = (codigoArticulo, cantidad) => {
    const max = Math.min(
      pedidos.flatMap(p => p.articulos)
        .find(a => a.codigoArticulo === codigoArticulo)?.unidadesPendientes || 0,
      ubicaciones.find(u => u.ubicacion === expediciones[codigoArticulo]?.ubicacion)?.unidadSaldo || 0
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
    const { cantidad, ubicacion } = expediciones[codigoArticulo] || {};
    const cantidadNum = parseFloat(cantidad);

    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      alert('Por favor ingrese una cantidad válida mayor que cero');
      return;
    }

    const pedido = pedidos[pedidoIndex];
    const linea = pedido.articulos[lineaIndex];

    try {
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
          ubicacion: ubicacion
        })
      });

      const result = await response.json();
      if (!result.success) {
        alert('Error al actualizar: ' + (result.error || ''));
        return;
      }

      const updatedPedidos = [...pedidos];
      updatedPedidos[pedidoIndex].articulos[lineaIndex].unidadesPendientes -= cantidadNum;

      if (updatedPedidos[pedidoIndex].articulos[lineaIndex].unidadesPendientes <= 0) {
        updatedPedidos[pedidoIndex].articulos.splice(lineaIndex, 1);
      }

      if (updatedPedidos[pedidoIndex].articulos.length === 0) {
        updatedPedidos.splice(pedidoIndex, 1);
      }

      setPedidos(updatedPedidos);
      setLineaSeleccionada(null);
      setUbicaciones([]);
      setExpediciones({});
    } catch (error) {
      console.error('Error al actualizar línea:', error);
      alert('Error al conectar con el servidor');
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
        return 'Mostrar Líneas (Pendientes)';
      case 'completed':
        return 'Ver Líneas Completadas';
      case 'all':
        return 'Ver Todas (Pendientes + Completadas)';
      case 'hide':
        return 'Ocultar Líneas';
      default:
        return 'Mostrar Líneas (Pendientes)';
    }
  };

  const filterLineas = (pedido) => {
    const viewMode = pedidoViewModes[pedido.numeroPedido] || 'show';
    
    switch(viewMode) {
      case 'show':
        return pedido.articulos.filter(art => art.unidadesPendientes > 0);
      case 'completed':
        return pedido.articulos.filter(art => art.unidadesPendientes <= 0);
      case 'all':
        return [...pedido.articulos];
      case 'hide':
      default:
        return [];
    }
  };

  const renderLineasPedido = (pedido, pedidoIndex) => {
    const lineasFiltradas = filterLineas(pedido);
    const viewMode = pedidoViewModes[pedido.numeroPedido] || 'show';
    
    if (viewMode === 'hide') {
      return null;
    }

    if (lineasFiltradas.length === 0) {
      return (
        <tr>
          <td colSpan="4" style={{ textAlign: 'center', padding: '15px', fontStyle: 'italic' }}>
            {viewMode === 'show' 
              ? 'No hay líneas pendientes en este pedido' 
              : viewMode === 'completed'
                ? 'No hay líneas completadas en este pedido'
                : 'No hay líneas para mostrar'}
          </td>
        </tr>
      );
    }

    return lineasFiltradas.map((art, i) => (
      <React.Fragment key={i}>
        <tr onClick={() => art.unidadesPendientes > 0 && handleLineaClick(art.codigoArticulo, art.unidadesPendientes)} 
            style={{ cursor: art.unidadesPendientes > 0 ? 'pointer' : 'default' }}>
          <td className="td-izquierda">{art.codigoArticulo}</td>
          <td className="td-izquierda">
            {art.descripcionArticulo}
            <div style={{ fontSize: '12px', color: '#666' }}>
              {art.unidadMedida} • {art.agrupacion}
            </div>
          </td>
          <td className="td-centrado">{art.unidadesPedidas}</td>
          <td className="td-centrado">{art.unidadesPendientes > 0 ? art.unidadesPendientes : '✔'}</td>
        </tr>
        {lineaSeleccionada === art.codigoArticulo && (
          <tr>
            <td colSpan="4" style={{ backgroundColor: '#f9f9f9' }}>
              <div style={{ padding: '10px' }}>
                <div style={{ marginBottom: '10px' }}>
                  <strong>Ubicación:</strong>
                  <select
                    value={expediciones[art.codigoArticulo]?.ubicacion || ''}
                    onChange={(e) => handleChangeUbicacion(art.codigoArticulo, e.target.value)}
                    style={{ marginLeft: '10px', width: '60%' }}
                  >
                    {ubicaciones.map((ubi, idx) => (
                      <option key={idx} value={ubi.ubicacion}>
                        {ubi.ubicacion} - {ubi.unidadSaldo} uds
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <strong>Unidades a expedir:</strong>
                  <input
                    type="number"
                    min="1"
                    max={Math.min(
                      art.unidadesPendientes,
                      ubicaciones.find(u => u.ubicacion === expediciones[art.codigoArticulo]?.ubicacion)?.unidadSaldo || 0
                    )}
                    value={expediciones[art.codigoArticulo]?.cantidad || ''}
                    onChange={(e) => handleChangeCantidad(art.codigoArticulo, e.target.value)}
                    style={{ marginLeft: '10px', width: '80px' }}
                  />
                  <button
                    onClick={() => expedirLinea(pedidoIndex, i, art.codigoArticulo)}
                    style={{
                      marginLeft: '20px',
                      backgroundColor: '#4CAF50',
                      color: 'white',
                      border: 'none',
                      padding: '5px 15px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Validar Línea
                  </button>
                </div>
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    ));
  };

  return (
    <div className="pedidos-container" style={{ maxWidth: '95%', margin: '0 auto' }}>
      <div className="pedidos-header">
        <h2>Pedidos Activos</h2>
        <button onClick={() => setMostrarRutas(!mostrarRutas)} className="btn-rutas">
          {mostrarRutas ? '🔙 Volver a Pedidos' : '📦 Gestión de Rutas'}
        </button>
        <button onClick={() => navigate('/traspaso')} className="btn-traspaso">
          🏭 Traspaso entre Almacenes
        </button>
        <button onClick={() => navigate('/preparacion')} className="btn-opcion">
          📋 Preparación de Pedidos
        </button>
        <button onClick={() => navigate('/entrada')} className="btn-opcion">
          📥 Entrada de Stock
        </button>
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
      </div>

      <div className="pedidos-content">
        {pedidos.map((pedido, index) => (
          <div key={index} className="pedido-card" style={{ padding: '10px', marginBottom: '15px' }}>
            <div className="pedido-header">
              <span>Pedido: {pedido.numeroPedido}</span>
              <span>Serie: {pedido.serie}</span>
            </div>
            <div className="pedido-details">
              <div><strong>Cliente:</strong> {pedido.razonSocial}</div>
              <div><strong>Dirección:</strong> {pedido.domicilio}</div>
              <div><strong>Municipio:</strong> {pedido.municipio}</div>
              {pedido.observaciones && (
                <div><strong>Obs:</strong> {pedido.observaciones}</div>
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                onClick={() => togglePedidoViewMode(pedido.numeroPedido)}
                style={{
                  padding: '5px 10px',
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  minWidth: '250px'
                }}
              >
                {getButtonText(pedidoViewModes[pedido.numeroPedido])}
              </button>
            </div>
            
            <table className="lineas-table">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th>Descripción</th>
                  <th>Pedidas</th>
                  <th>Pendientes</th>
                </tr>
              </thead>
              <tbody>
                {renderLineasPedido(pedido, index)}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PedidosScreen;