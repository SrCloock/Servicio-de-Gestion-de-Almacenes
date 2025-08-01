import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import '../styles/AsignarPedidosScreen.css';

const AsignarPedidosScreen = () => {
  const [pedidos, setPedidos] = useState([]);
  const [preparadores, setPreparadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { canAssignOrders } = usePermissions();
  const [asignaciones, setAsignaciones] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!canAssignOrders) return;

    const cargarDatos = async () => {
      try {
        setLoading(true);
        const headers = getAuthHeader();

        // Obtener TODOS los pedidos pendientes (asignados o no)
        const pedidosResponse = await axios.get('http://localhost:3000/pedidosPendientes', { 
          headers,
          params: { 
            soloAprobados: false
          }
        });
        setPedidos(pedidosResponse.data);

        // Obtener preparadores
        const prepResponse = await axios.get('http://localhost:3000/empleados/preparadores', { headers });
        setPreparadores(prepResponse.data);

        // Inicializar asignaciones con los valores actuales
        const inicialAsignaciones = {};
        pedidosResponse.data.forEach(pedido => {
          inicialAsignaciones[pedido.numeroPedido] = pedido.EmpleadoAsignado || '';
        });
        setAsignaciones(inicialAsignaciones);

        setLoading(false);
      } catch (err) {
        setError('Error al cargar datos: ' + err.message);
        setLoading(false);
      }
    };

    cargarDatos();
  }, [canAssignOrders]);

  const handleAsignacionChange = (numeroPedido, codigoEmpleado) => {
    setAsignaciones(prev => ({
      ...prev,
      [numeroPedido]: codigoEmpleado
    }));
  };

  const asignarPedidos = async () => {
    try {
      const headers = getAuthHeader();
      
      // Preparar datos para enviar: solo los que han cambiado
      const asignacionesParaEnviar = [];
      for (const numeroPedido in asignaciones) {
        const empleado = asignaciones[numeroPedido];
        const pedido = pedidos.find(p => p.numeroPedido == numeroPedido);
        
        // Solo enviar si la asignación es diferente al valor original
        if (empleado !== pedido.EmpleadoAsignado) {
          asignacionesParaEnviar.push({
            codigoEmpresa: pedido.codigoEmpresa,
            ejercicioPedido: pedido.ejercicioPedido,
            seriePedido: pedido.seriePedido || '',
            numeroPedido: parseInt(numeroPedido),
            empleado: empleado
          });
        }
      }

      if (asignacionesParaEnviar.length === 0) {
        setError('No hay cambios para guardar');
        return;
      }

      // Enviar asignaciones
      await axios.post('http://localhost:3000/asignarEmpleado', {
        asignaciones: asignacionesParaEnviar
      }, { headers });

      // Actualizar el estado de los pedidos con las nuevas asignaciones
      setPedidos(prev => prev.map(pedido => {
        const nuevaAsignacion = asignaciones[pedido.numeroPedido];
        if (nuevaAsignacion !== undefined) {
          return { ...pedido, EmpleadoAsignado: nuevaAsignacion };
        }
        return pedido;
      }));

      // Mostrar mensaje de éxito
      setSuccessMessage(`Se actualizaron ${asignacionesParaEnviar.length} asignaciones correctamente`);
      setError('');
      
      // Limpiar mensaje después de 3 segundos
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error al asignar pedidos:', err);
      setError('Error al asignar pedidos: ' + (err.response?.data?.mensaje || err.message));
    }
  };

  if (!canAssignOrders) {
    return (
      <div className="AP-container">
        <div className="AP-no-permission">
          <h2>Acceso restringido</h2>
          <p>No tienes permiso para asignar pedidos.</p>
        </div>
        <Navbar />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="AP-container">
        <div className="AP-loading">
          <div className="AP-spinner"></div>
          <p>Cargando datos de pedidos...</p>
        </div>
        <Navbar />
      </div>
    );
  }

  return (
    <div className="AP-container">
      <h2 className="AP-header">Asignar Pedidos a Preparadores</h2>
      
      {error && <div className="AP-error">{error}</div>}
      {successMessage && <div className="AP-success">{successMessage}</div>}

      <div className="AP-controls">
        <div className="AP-info-box">
          <p>Se muestran todos los pedidos pendientes del rango actual (última semana y próxima semana).</p>
          <p>Puedes asignar o reasignar pedidos seleccionando un preparador en la lista.</p>
        </div>
      </div>

      <div className="AP-pedidos-table-container">
        <table className="AP-pedidos-table">
          <thead>
            <tr>
              <th>N° Pedido</th>
              <th>Cliente</th>
              <th>Fecha Entrega</th>
              <th>Estado</th>
              <th>Asignado a</th>
              <th>Cambiar asignación</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map(pedido => (
              <tr key={pedido.numeroPedido}>
                <td>{pedido.numeroPedido}</td>
                <td>{pedido.razonSocial}</td>
                <td>
                  {pedido.fechaEntrega 
                    ? new Date(pedido.fechaEntrega).toLocaleDateString() 
                    : 'Sin fecha'}
                </td>
                <td>
                  <span className={`AP-badge-estado ${pedido.Status || ''}`}>
                    {pedido.Status || 'Pendiente'}
                  </span>
                </td>
                <td className="AP-asignado-actual">
                  {pedido.EmpleadoAsignado 
                    ? (preparadores.find(p => p.codigo === pedido.EmpleadoAsignado)?.nombre || pedido.EmpleadoAsignado)
                    : 'Sin asignar'}
                </td>
                <td>
                  <select
                    value={asignaciones[pedido.numeroPedido] || ''}
                    onChange={(e) => handleAsignacionChange(pedido.numeroPedido, e.target.value)}
                    className="AP-asignacion-select"
                  >
                    <option value="">Seleccionar preparador...</option>
                    {preparadores.map(prep => (
                      <option key={prep.codigo} value={prep.codigo}>
                        {prep.nombre}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pedidos.length === 0 && (
        <div className="AP-no-pedidos">
          <p>No hay pedidos pendientes en este rango</p>
        </div>
      )}

      <div className="AP-actions">
        <button 
          onClick={asignarPedidos} 
          className="AP-btn-asignar"
          disabled={pedidos.length === 0}
        >
          Guardar Cambios
        </button>
      </div>
      <Navbar />
    </div>
  );
};

export default AsignarPedidosScreen;