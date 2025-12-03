import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import '../styles/ConfirmacionEntrega.css';

const ConfirmacionEntrega = () => {
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
    const loadPedido = () => {
      if (location.state?.pedido) {
        setPedido(location.state.pedido);
        return;
      }

      try {
        const savedData = JSON.parse(localStorage.getItem('preparacionPedidosData'));
        const foundPedido = savedData?.pedidos?.find(p => p.id.toString() === id);
        
        if (foundPedido) {
          setPedido(foundPedido);
        } else {
          navigate('/preparacion-pedidos');
        }
      } catch {
        navigate('/preparacion-pedidos');
      }
    };

    loadPedido();
  }, [id, location.state, navigate]);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setDatosCliente(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleConfirmar = useCallback(() => {
    const { nombre, dni } = datosCliente;
    
    if (!nombre.trim() || !dni.trim()) {
      alert('Por favor, complete todos los datos requeridos');
      return;
    }

    setConfirmado(true);
    
    setTimeout(() => {
      alert(`Resguardo enviado por correo a ${nombre}`);
    }, 1500);
  }, [datosCliente]);

  const volverAPedidos = useCallback(() => {
    navigate('/preparacion-pedidos');
  }, [navigate]);

  const formValido = useMemo(() => {
    const { nombre, dni, firma } = datosCliente;
    return nombre.trim() && dni.trim() && firma.trim();
  }, [datosCliente]);

  const renderTablaArticulos = useMemo(() => (
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
  ), [pedido]);

  const renderFormulario = useMemo(() => (
    <div className="formulario-firma">
      {[
        { id: 'nombre', label: 'Nombre completo:', placeholder: 'Nombre y apellidos' },
        { id: 'dni', label: 'DNI/NIF:', placeholder: 'Documento de identidad' },
        { id: 'firma', label: 'Firma (nombre):', placeholder: 'Firme aquí escribiendo su nombre' }
      ].map(({ id, label, placeholder }) => (
        <div key={id} className="campo-formulario">
          <label htmlFor={id}>{label}</label>
          <input
            id={id}
            type="text"
            name={id}
            value={datosCliente[id]}
            onChange={handleInputChange}
            placeholder={placeholder}
            required
          />
        </div>
      ))}
    </div>
  ), [datosCliente, handleInputChange]);

  const renderMensajeExito = useMemo(() => (
    <div className="mensaje-exito">
      <div className="icono-exito">✓</div>
      <h3>¡Entrega Confirmada!</h3>
      
      <div className="detalle-entrega">
        {[
          ['Pedido:', `#${pedido.id}`],
          ['Cliente:', pedido.cliente],
          ['Fecha de entrega:', new Date().toLocaleDateString('es-ES')],
          ['Responsable:', datosCliente.nombre],
          ['DNI:', datosCliente.dni]
        ].map(([label, value]) => (
          <p key={label}><strong>{label}</strong> {value}</p>
        ))}
      </div>
      
      <p className="mensaje-resguardo">
        El resguardo de entrega ha sido enviado por correo electrónico correctamente.
      </p>
      
      <button onClick={volverAPedidos} className="btn-volver">
        Volver a Pedidos
      </button>
    </div>
  ), [pedido, datosCliente, volverAPedidos]);

  if (!pedido) {
    return <div className="cargando">Cargando...</div>;
  }

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
            
            {renderTablaArticulos}
          </div>
          
          <div className="seccion-firma">
            <h4>Datos de Confirmación</h4>
            {renderFormulario}
            
            <button
              onClick={handleConfirmar}
              disabled={!formValido}
              className="btn-confirmar"
            >
              Confirmar Entrega
            </button>
          </div>
        </>
      ) : renderMensajeExito}
    </div>
  );
};

export default ConfirmacionEntrega;