import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import '../styles/ConfirmacionEntrega.css';

function ConfirmacionEntrega() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [pedido, setPedido] = useState(null);
  const [firma, setFirma] = useState('');
  const [confirmado, setConfirmado] = useState(false);

  useEffect(() => {
    if (location.state?.pedido) {
      setPedido(location.state.pedido);
    } else {
      const savedPedidos = JSON.parse(localStorage.getItem('preparacionPedidosData'))?.pedidos || [];
      const foundPedido = savedPedidos.find(p => p.id.toString() === id);
      if (foundPedido) {
        setPedido(foundPedido);
      } else {
        navigate('/preparacion-pedidos');
      }
    }
  }, [id, location, navigate]);

  const handleConfirmar = () => {
    if (firma.trim()) {
      setConfirmado(true);
    } else {
      alert('Por favor, introduce tu nombre para confirmar la entrega');
    }
  };

  const generarFactura = () => {
    alert('Factura generada en PDF');
    navigate('/preparacion-pedidos');
  };

  if (!pedido) return <div className="cargando">Cargando...</div>;

  return (
    <div className="confirmacion-entrega-container">
      {!confirmado ? (
        <>
          <h2>Confirmación de Entrega</h2>
          
          <div className="detalle-pedido">
            <h3>Pedido #{pedido.id}</h3>
            <div className="info-cliente">
              <p><strong>Cliente:</strong> {pedido.cliente}</p>
              <p><strong>Fecha:</strong> {pedido.fecha}</p>
            </div>
            
            <table className="tabla-articulos">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {pedido.articulos.map(articulo => (
                  <tr key={articulo.id}>
                    <td>{articulo.codigo}</td>
                    <td>{articulo.descripcion}</td>
                    <td>{articulo.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="seccion-firma">
            <h4>Firma de Confirmación</h4>
            
            <div className="firma-container">
              <label htmlFor="firma">Nombre del responsable:</label>
              <input
                id="firma"
                type="text"
                value={firma}
                onChange={(e) => setFirma(e.target.value)}
                placeholder="Introduce tu nombre completo"
              />
            </div>
            
            <button
              onClick={handleConfirmar}
              disabled={!firma.trim()}
              className="btn-confirmar"
            >
              Confirmar Entrega
            </button>
          </div>
        </>
      ) : (
        <div className="mensaje-exito">
          <h3>¡Entrega Confirmada!</h3>
          <div className="detalle-entrega">
            <p><strong>Pedido:</strong> #{pedido.id}</p>
            <p><strong>Cliente:</strong> {pedido.cliente}</p>
            <p><strong>Fecha de entrega:</strong> {new Date().toLocaleDateString('es-ES')}</p>
            <p><strong>Responsable:</strong> {firma}</p>
          </div>
          
          <button
            onClick={generarFactura}
            className="btn-generar-factura"
          >
            Generar Factura PDF
          </button>
        </div>
      )}
    </div>
  );
}

export default ConfirmacionEntrega;