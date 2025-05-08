import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import '../styles/ConfirmacionEntrega.css';

function ConfirmacionEntrega() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [pedido, setPedido] = useState(null);
  const [datosCliente, setDatosCliente] = useState({
    nombre: '',
    dni: '',
    firma: ''
  });
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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setDatosCliente(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleConfirmar = () => {
    if (datosCliente.nombre.trim() && datosCliente.dni.trim()) {
      setConfirmado(true);
      
      // Simular envío del resguardo
      setTimeout(() => {
        alert(`Resguardo enviado por correo a ${datosCliente.nombre}`);
      }, 1500);
    } else {
      alert('Por favor, complete todos los datos requeridos');
    }
  };

  const volverAPedidos = () => {
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
            <h4>Datos de Confirmación</h4>
            
            <div className="formulario-firma">
              <div className="campo-formulario">
                <label htmlFor="nombre">Nombre completo:</label>
                <input
                  id="nombre"
                  type="text"
                  name="nombre"
                  value={datosCliente.nombre}
                  onChange={handleInputChange}
                  placeholder="Nombre y apellidos"
                  required
                />
              </div>
              
              <div className="campo-formulario">
                <label htmlFor="dni">DNI/NIF:</label>
                <input
                  id="dni"
                  type="text"
                  name="dni"
                  value={datosCliente.dni}
                  onChange={handleInputChange}
                  placeholder="Documento de identidad"
                  required
                />
              </div>
              
              <div className="campo-formulario">
                <label htmlFor="firma">Firma (nombre):</label>
                <input
                  id="firma"
                  type="text"
                  name="firma"
                  value={datosCliente.firma}
                  onChange={handleInputChange}
                  placeholder="Firme aquí escribiendo su nombre"
                  required
                />
              </div>
            </div>
            
            <button
              onClick={handleConfirmar}
              disabled={!datosCliente.nombre || !datosCliente.dni || !datosCliente.firma}
              className="btn-confirmar"
            >
              Confirmar Entrega
            </button>
          </div>
        </>
      ) : (
        <div className="mensaje-exito">
          <div className="icono-exito">✓</div>
          <h3>¡Entrega Confirmada!</h3>
          
          <div className="detalle-entrega">
            <p><strong>Pedido:</strong> #{pedido.id}</p>
            <p><strong>Cliente:</strong> {pedido.cliente}</p>
            <p><strong>Fecha de entrega:</strong> {new Date().toLocaleDateString('es-ES')}</p>
            <p><strong>Responsable:</strong> {datosCliente.nombre}</p>
            <p><strong>DNI:</strong> {datosCliente.dni}</p>
          </div>
          
          <p className="mensaje-resguardo">
            El resguardo de entrega ha sido enviado por correo electrónico correctamente.
          </p>
          
          <button
            onClick={volverAPedidos}
            className="btn-volver"
          >
            Volver a Pedidos
          </button>
        </div>
      )}
    </div>
  );
}

export default ConfirmacionEntrega;