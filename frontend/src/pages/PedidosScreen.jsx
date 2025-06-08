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
  
  useEffect(() => {
    const fetchPedidos = async () => {
      try {
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
          setUbicaciones(prev => ({
            ...prev,
            [codigoArticulo]: ubicacionesConStock
          }));
          
          setLineaSeleccionada(codigoArticulo);
          setExpediciones(prev => {
            if (prev[codigoArticulo]) return prev;
            
            return {
              ...prev,
              [codigoArticulo]: {
                ubicacion: primeraUbicacion.ubicacion,
                partida: primeraUbicacion.partida || null,
                cantidad: Math.min(primeraUbicacion.unidadSaldo, unidadesPendientes).toString(),
                esZonaDescarga: primeraUbicacion.ubicacion === "Zona descarga"
              }
            };
          });
        } else {
          alert('No hay stock disponible para este artículo');
        }
      }
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

    const max = Math.min(
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
    const codigoEscaneado = prompt(`Escanea el código para ${linea.descripcionArticulo}`);
    
    if (codigoEscaneado !== linea.codigoAlternativo && 
        codigoEscaneado !== linea.codigoArticulo) {
      alert(`❌ Código incorrecto. Valores aceptados: 
            ${linea.codigoAlternativo} (barras) o 
            ${linea.codigoArticulo} (artículo)`);
      return;
    }

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
          ubicacion: ubicacion,
          partida: partida || null
        })
      });

      const result = await response.json();
      if (!result.success) {
        console.error(result);
        alert('Error al actualizar: ' + (result.mensaje || result.error || ''));
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

  const renderLineasPedido = (pedido, pedidoIndex) => {
    const lineasFiltradas = filterLineas(pedido);
    const viewMode = pedidoViewModes[pedido.numeroPedido] || 'show';
    
    if (viewMode === 'hide') {
      return null;
    }

    if (lineasFiltradas.length === 0) {
      return (
        <tr>
          <td colSpan="6" style={{ textAlign: 'center', padding: '15px', fontStyle: 'italic' }}>
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
          <td className="td-izquierda">
            {art.codigoArticulo}
            <div className="codigo-alternativo">
              Código: {art.codigoAlternativo || 'N/A'}
            </div>
          </td>
          <td className="td-izquierda">{art.codigoAlmacen || '-'}</td>
          <td className="td-izquierda">
            {art.descripcionArticulo}
            <div style={{ fontSize: '12px', color: '#666' }}>
              {art.unidadMedida} • {art.agrupacion}
            </div>
          </td>
          <td className="td-centrado">{art.unidadesPedidas}</td>
          <td className="td-centrado">
            {art.completada ? (
              '✔'
            ) : (
              <div style={{ marginTop: '4px' }}>
                <select
                  value={JSON.stringify({
                    ubicacion: expediciones[art.codigoArticulo]?.ubicacion || '',
                    partida: expediciones[art.codigoArticulo]?.partida || null,
                  })}
                  onChange={(e) => handleChangeUbicacion(art.codigoArticulo, e.target.value, art.unidadesPendientes)}
                  style={{ width: '100%', fontSize: '12px' }}
                >
                  {(ubicaciones[art.codigoArticulo] || []).map((ubi, idx) => {
                    const isZonaDescarga = ubi.ubicacion === "Zona descarga";
                    return (
                      <option
                        key={idx}
                        value={JSON.stringify({
                          ubicacion: ubi.ubicacion,
                          partida: ubi.partida || null
                        })}
                        style={isZonaDescarga ? { color: 'red' } : {}}
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
            {art.completada ? '✔' : art.unidadesPendientes}
          </td>
        </tr>
        {lineaSeleccionada === art.codigoArticulo && (
          <tr>
            <td colSpan="6" style={{ backgroundColor: '#f9f9f9' }}>
              <div style={{ padding: '10px' }}>
                <div>
                  <strong>Unidades a expedir:</strong>
                  <input
                    type="number"
                    min="1"
                    max={Math.min(
                      art.unidadesPendientes,
                      (ubicaciones[art.codigoArticulo] || []).find(
                        u => u.ubicacion === expediciones[art.codigoArticulo]?.ubicacion &&
                             (u.partida || null) === (expediciones[art.codigoArticulo]?.partida || null)
                      )?.unidadSaldo || 0
                    )}
                    value={expediciones[art.codigoArticulo]?.cantidad || ''}
                    onChange={(e) => handleChangeCantidad(art.codigoArticulo, e.target.value)}
                    style={{ 
                      marginLeft: '10px', 
                      width: '80px',
                      border: expediciones[art.codigoArticulo]?.esZonaDescarga ? '2px solid red' : '1px solid #ccc'
                    }}
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
        <h2>Pedidos Pendientes</h2>
        <button onClick={() => navigate('/rutas')} className="btn-rutas">
          📦 Gestión de Rutas
        </button>
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
      </div>

      <div className="pedidos-content">
        {pedidos.map((pedido, index) => (
          <div key={index} className="pedido-card" style={{ padding: '10px', marginBottom: '15px' }}>
            <div className="pedido-header">
              <div className="pedido-info">
                Empresa: {pedido.codigoEmpresa} | Ejercicio: {pedido.ejercicio} | Pedido: {pedido.numeroPedido} | Serie: {pedido.serie || '—'}
              </div>
            </div>
            <div className="pedido-details">
              <div><strong>Cliente:</strong> {pedido.razonSocial}</div>
              <div><strong>Obra:</strong> {pedido.Obra || 'No especificada'}</div>
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
        ))}
      </div>
    </div>
  );
}

export default PedidosScreen;