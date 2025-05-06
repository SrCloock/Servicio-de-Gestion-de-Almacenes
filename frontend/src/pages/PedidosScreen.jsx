import React, { useState, useEffect } from 'react';
import '../styles/PedidosScreen.css';

function PedidosScreen() {
  const [pedidos, setPedidos] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [lineaSeleccionada, setLineaSeleccionada] = useState(null);
  const [expediciones, setExpediciones] = useState({});

  useEffect(() => {
    const fetchPedidos = async () => {
      try {
        const response = await fetch('http://localhost:3000/pedidosPendientes');
        const data = await response.json();
        setPedidos(data);
      } catch (error) {
        console.error('❌ Error al obtener pedidos:', error);
      }
    };

    fetchPedidos();
  }, []);

  const toggleExpand = (index) => {
    setExpanded(expanded === index ? null : index);
    setLineaSeleccionada(null);
    setUbicaciones([]);
  };

  const handleLineaClick = async (codigoArticulo) => {
    try {
      const response = await fetch(`http://localhost:3000/ubicacionesArticulo?codigoArticulo=${encodeURIComponent(codigoArticulo)}`);
      const data = await response.json();
      setUbicaciones(data);
      setLineaSeleccionada(codigoArticulo);
      setExpediciones((prev) => ({
        ...prev,
        [codigoArticulo]: {
          ubicacion: data.length > 0 ? data[0].ubicacion : '',
          cantidad: ''
        }
      }));
    } catch (error) {
      console.error('❌ Error al obtener ubicaciones:', error);
    }
  };

  const handleChangeUbicacion = (codigoArticulo, ubicacion) => {
    setExpediciones((prev) => ({
      ...prev,
      [codigoArticulo]: {
        ...prev[codigoArticulo],
        ubicacion
      }
    }));
  };

  const handleChangeCantidad = (codigoArticulo, cantidad) => {
    setExpediciones((prev) => ({
      ...prev,
      [codigoArticulo]: {
        ...prev[codigoArticulo],
        cantidad
      }
    }));
  };

  const expedirLinea = async (pedidoIndex, lineaIndex, codigoArticulo) => {
    const { cantidad, ubicacion } = expediciones[codigoArticulo];
    const cantidadNum = parseFloat(cantidad);

    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      alert('Cantidad no válida.');
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
        alert('Error al actualizar en la base de datos.');
        return;
      }

      const updatedPedidos = [...pedidos];
      linea.unidadesPendientes -= cantidadNum;

      if (linea.unidadesPendientes <= 0) {
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
      console.error('❌ Error al actualizar línea:', error);
      alert('Error al actualizar la base de datos.');
    }
  };

  return (
    <div className="pedidos-container">
      <div className="pedidos-header">
        <h2>Pedidos Activos</h2>
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
      </div>

      <div className="pedidos-content">
        {pedidos.map((pedido, index) => (
          <div key={index} className="pedido-card">
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

            <div className="toggle-button">
              <button onClick={() => toggleExpand(index)}>
                {expanded === index ? '▲ Ocultar líneas' : '▼ Ver líneas'}
              </button>
            </div>

            {expanded === index && (
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
                  {pedido.articulos.map((art, i) => (
                    <React.Fragment key={i}>
                      <tr
                        onClick={() => handleLineaClick(art.codigoArticulo)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="td-izquierda">{art.codigoArticulo}</td>
                        <td className="td-izquierda">{art.descripcionArticulo}</td>
                        <td className="td-centrado">{art.unidadesPedidas}</td>
                        <td className="td-centrado">{art.unidadesPendientes}</td>
                      </tr>

                      {lineaSeleccionada === art.codigoArticulo && (
                        <tr>
                          <td colSpan="4">
                            <strong>Ubicación:</strong>
                            <select
                              value={expediciones[art.codigoArticulo]?.ubicacion || ''}
                              onChange={(e) => handleChangeUbicacion(art.codigoArticulo, e.target.value)}
                            >
                              {ubicaciones.map((ubi, idx) => (
                                <option key={idx} value={ubi.ubicacion}>
                                  {ubi.ubicacion} - {ubi.unidadSaldo} uds
                                </option>
                              ))}
                            </select>

                            <div style={{ marginTop: '10px' }}>
                              <strong>Unidades a expedir:</strong>
                              <input
                                type="number"
                                min="1"
                                value={expediciones[art.codigoArticulo]?.cantidad || ''}
                                onChange={(e) => handleChangeCantidad(art.codigoArticulo, e.target.value)}
                                style={{ marginLeft: '10px', width: '80px' }}
                              />
                              <button
                                onClick={() => expedirLinea(index, i, art.codigoArticulo)}
                                style={{ marginLeft: '20px' }}
                              >
                                Validar Expedición
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default PedidosScreen;
