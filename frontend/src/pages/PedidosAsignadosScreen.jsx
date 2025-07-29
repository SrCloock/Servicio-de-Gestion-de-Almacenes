import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import { usePermissions } from '../PermissionsManager';
import Navbar from '../components/Navbar';

const PedidosAsignadosScreen = () => {
  const [pedidos, setPedidos] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [asignando, setAsignando] = useState({});
  const [error, setError] = useState('');
  const { canAssignOrders } = usePermissions();

  useEffect(() => {
    if (!canAssignOrders) return;

    const cargarDatos = async () => {
      try {
        setLoading(true);
        setError('');
        
        const headers = getAuthHeader();
        const [pedidosRes, empleadosRes] = await Promise.all([
          axios.get('http://localhost:3000/pedidos-sin-asignar', { headers }),
          axios.get('http://localhost:3000/empleados-preparadores', { headers })
        ]);
        
        setPedidos(pedidosRes.data);
        setEmpleados(empleadosRes.data);
      } catch (err) {
        console.error('Error cargando datos:', err);
        setError('Error al cargar los datos. Por favor, inténtalo de nuevo.');
      } finally {
        setLoading(false);
      }
    };
    
    cargarDatos();
  }, [canAssignOrders]);

  const handleAsignar = async (pedidoId, empleadoId) => {
    try {
      setAsignando(prev => ({ ...prev, [pedidoId]: true }));
      setError('');
      
      await axios.post(
        'http://localhost:3000/asignar-pedido', 
        { pedidoId, empleadoId },
        { headers: getAuthHeader() }
      );
      
      // Actualizar UI eliminando el pedido asignado
      setPedidos(prev => prev.filter(p => p.NumeroPedido !== pedidoId));
    } catch (err) {
      console.error('Error asignando pedido:', err);
      setError('Error al asignar pedido: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setAsignando(prev => ({ ...prev, [pedidoId]: false }));
    }
  };

  if (!canAssignOrders) {
    return (
      <div className="pedidos-asignados-container">
        <div className="no-permission">
          <h2>Acceso restringido</h2>
          <p>No tienes permiso para acceder a esta sección.</p>
        </div>
        <Navbar />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="pedidos-asignados-container">
        <div className="loading">
          <div className="loader"></div>
          <p>Cargando asignaciones...</p>
        </div>
        <Navbar />
      </div>
    );
  }

  return (
    <div className="pedidos-asignados-container">
      <h2>Asignación de Pedidos a Preparadores</h2>
      
      {error && <div className="error-message">{error}</div>}
      
      {pedidos.length === 0 ? (
        <div className="no-pedidos">
          <i className="fas fa-check-circle"></i>
          <p>Todos los pedidos están asignados</p>
        </div>
      ) : (
        <div className="asignacion-container">
          <table className="asignacion-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Asignar a</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map(pedido => (
                <tr key={pedido.NumeroPedido}>
                  <td>#{pedido.NumeroPedido}</td>
                  <td>{pedido.RazonSocial}</td>
                  <td>{new Date(pedido.FechaPedido).toLocaleDateString()}</td>
                  <td>
                    <select
                      id={`select-${pedido.NumeroPedido}`}
                      className="empleado-select"
                      disabled={asignando[pedido.NumeroPedido]}
                    >
                      <option value="">Seleccionar preparador</option>
                      {empleados.map(emp => (
                        <option key={emp.CodigoCliente} value={emp.CodigoCliente}>
                          {emp.Nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      onClick={() => {
                        const select = document.getElementById(`select-${pedido.NumeroPedido}`);
                        const empleadoId = select.value;
                        if (empleadoId) {
                          handleAsignar(pedido.NumeroPedido, empleadoId);
                        } else {
                          setError('Selecciona un preparador primero');
                        }
                      }}
                      disabled={asignando[pedido.NumeroPedido]}
                      className={`btn-asignar ${asignando[pedido.NumeroPedido] ? 'disabled' : ''}`}
                    >
                      {asignando[pedido.NumeroPedido] ? (
                        <><i className="fas fa-spinner fa-spin"></i> Asignando...</>
                      ) : (
                        <><i className="fas fa-user-check"></i> Asignar</>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Navbar />
    </div>
  );
};

export default PedidosAsignadosScreen;