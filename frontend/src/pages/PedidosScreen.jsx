import React, { useState, useEffect } from 'react';
import '../styles/PedidosScreen.css';
import { useNavigate, useLocation } from 'react-router-dom';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

function PedidosScreen() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [lineaSeleccionada, setLineaSeleccionada] = useState(null);
  const [expediciones, setExpediciones] = useState({});
  const [mostrarRutas, setMostrarRutas] = useState(false);

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
        alert('Error al actualizar en la base de datos: ' + (result.error || ''));
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

  const rutasDemo = [
    {
      id: 1,
      cliente: 'Ferretería El Clavo',
      direccion: 'Calle Herramientas 12',
      albaran: 'ALB0001',
      articulos: [
        { nombre: 'Tornillos', cantidad: 100 },
        { nombre: 'Tuercas', cantidad: 50 }
      ]
    },
    {
      id: 2,
      cliente: 'Construcciones López',
      direccion: 'Av. Cemento 45',
      albaran: 'ALB0002',
      articulos: [
        { nombre: 'Cemento 25kg', cantidad: 10 }
      ]
    }
  ];

  return (
    <div className="pedidos-container">
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

      {!mostrarRutas && (
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
                        <tr onClick={() => handleLineaClick(art.codigoArticulo)} style={{ cursor: 'pointer' }}>
                          <td className="td-izquierda">{art.codigoArticulo}</td>
                          <td className="td-izquierda">{art.descripcionArticulo}</td>
                          <td className="td-centrado">{art.unidadesPedidas}</td>
                          <td className="td-centrado">{art.unidadesPendientes}</td>
                        </tr>
                        {lineaSeleccionada === art.codigoArticulo && (
                          <tr>
                            <td colSpan="4">
                              <strong>Ubicación:</strong>
                              <select value={expediciones[art.codigoArticulo]?.ubicacion || ''} onChange={(e) => handleChangeUbicacion(art.codigoArticulo, e.target.value)}>
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
                                <button onClick={() => expedirLinea(index, i, art.codigoArticulo)} style={{ marginLeft: '20px' }}>
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
      )}

      {mostrarRutas && <GestionRutas rutas={rutasDemo} />}
    </div>
  );
}

// --------------------- GESTIÓN DE RUTAS ---------------------
function GestionRutas({ rutas }) {
  const navigate = useNavigate();
  const location = useLocation();

  const firmaCliente = location.state?.firmaCliente || '';
  const firmaRepartidor = location.state?.firmaRepartidor || '';
  const rutaFirmada = location.state?.rutaFirmada || null;

  const generarPDF = (ruta) => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text(`Albarán: ${ruta.albaran}`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Cliente: ${ruta.cliente}`, 14, 30);
    doc.text(`Dirección: ${ruta.direccion}`, 14, 38);
    doc.text('Artículos entregados:', 14, 48);

    doc.autoTable({
      startY: 52,
      head: [['Artículo', 'Cantidad']],
      body: ruta.articulos.map(a => [a.nombre, a.cantidad])
    });

    const finalY = doc.lastAutoTable.finalY || 70;

    if (firmaCliente) {
      doc.text(`Firma Cliente:`, 14, finalY + 20);
      doc.addImage(firmaCliente, 'PNG', 14, finalY + 25, 60, 20);
    }

    if (firmaRepartidor) {
      doc.text(`Firma Repartidor:`, 14, finalY + 50);
      doc.addImage(firmaRepartidor, 'PNG', 14, finalY + 55, 60, 20);
    }

    doc.save(`Entrega_${ruta.albaran}.pdf`);
  };

  const abrirPantallaFirmas = (ruta) => {
    navigate('/Firmar', { state: { ruta } });
  };

  return (
    <div className="rutas-content">
      <h3>Entregas Asignadas a Tu Ruta</h3>
      {rutas.map((ruta) => (
        <div key={ruta.id} className="ruta-card">
          <h4>Albarán: {ruta.albaran}</h4>
          <p><strong>Cliente:</strong> {ruta.cliente}</p>
          <p><strong>Dirección:</strong> {ruta.direccion}</p>
          <ul>
            {ruta.articulos.map((a, idx) => (
              <li key={idx}>{a.nombre} - {a.cantidad} uds</li>
            ))}
          </ul>

          {rutaFirmada?.id === ruta.id && (
            <>
              <div>
                <strong>Firma Cliente:</strong>
                <br />
                <img src={firmaCliente} alt="Firma Cliente" style={{ border: '1px solid #ccc', width: 200, height: 80 }} />
              </div>
              <div>
                <strong>Firma Repartidor:</strong>
                <br />
                <img src={firmaRepartidor} alt="Firma Repartidor" style={{ border: '1px solid #ccc', width: 200, height: 80 }} />
              </div>
              <button onClick={() => generarPDF(ruta)}>📄 Generar PDF</button>
            </>
          )}

          {rutaFirmada?.id !== ruta.id && (
            <button onClick={() => abrirPantallaFirmas(ruta)}>✍ Firmar Entrega</button>
          )}
        </div>
      ))}
    </div>
  );
}

export default PedidosScreen;
