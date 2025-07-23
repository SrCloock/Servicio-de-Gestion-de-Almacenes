import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import '../styles/PedidosAsignadosScreen.css';

function PedidosAsignadosScreen() {
  const navigate = useNavigate();
  const [pedidosCompletados, setPedidosCompletados] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [asignandoEmpleado, setAsignandoEmpleado] = useState(null);
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Obtener permisos del usuario
  const { 
    canViewAssignedOrders, 
    canPerformActions 
  } = usePermissions();

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setLoading(true);
        const headers = getAuthHeader();
        
        // Obtener pedidos completados pero no asignados
        const responsePedidos = await axios.get('http://localhost:3000/pedidosCompletados', { 
          headers 
        });
        
        // Obtener empleados
        const responseEmpleados = await axios.get('http://localhost:3000/empleados', { 
          headers 
        });
        
        setPedidosCompletados(responsePedidos.data);
        setEmpleados(responseEmpleados.data);
      } catch (err) {
        console.error('Error cargando datos:', err);
        setError(err.message || 'Error al cargar los datos');
      } finally {
        setLoading(false);
      }
    };
    
    if (canViewAssignedOrders) {
      cargarDatos();
    }
  }, [canViewAssignedOrders]);

  const asignarEmpleadoAPedido = async (pedido, codigoEmpleado) => {
    if (!canPerformActions) return;
    
    try {
      const headers = getAuthHeader();
      
      await axios.post('http://localhost:3000/asignarEmpleadoAPedido', {
        codigoEmpresa: pedido.codigoEmpresa,
        ejercicio: pedido.ejercicioPedido,
        serie: pedido.seriePedido,
        numeroPedido: pedido.numeroPedido,
        codigoEmpleado
      }, { headers });

      // Actualizar el estado local para reflejar la asignación
      setPedidosCompletados(prev => 
        prev.map(p => 
          p.numeroPedido === pedido.numeroPedido 
            ? { ...p, CodigoEmpleadoAsignado: codigoEmpleado } 
            : p
        )
      );
      
      return true;
    } catch (err) {
      console.error('Error asignando empleado:', err);
      alert('Error al asignar empleado: ' + (err.response?.data?.mensaje || err.message));
      return false;
    }
  };

  const generarAlbaranParaPedido = async (pedido) => {
    if (!canPerformActions) return;
    
    try {
      const headers = getAuthHeader();
      
      const response = await axios.post('http://localhost:3000/asignarPedidoYGenerarAlbaran', {
        codigoEmpresa: pedido.codigoEmpresa,
        ejercicio: pedido.ejercicioPedido,
        serie: pedido.seriePedido,
        numeroPedido: pedido.numeroPedido
      }, { headers });

      // Eliminar el pedido de la lista
      setPedidosCompletados(prev => 
        prev.filter(p => p.numeroPedido !== pedido.numeroPedido)
      );
      
      alert(`Albarán ${response.data.serieAlbaran}${response.data.numeroAlbaran} generado correctamente`);
    } catch (err) {
      console.error('Error generando albarán:', err);
      alert('Error al generar albarán: ' + (err.response?.data?.mensaje || err.message));
    }
  };

  const verDetallePedido = (pedido) => {
    navigate('/detalle-pedido', { state: { pedido } });
  };

  // Si no tiene permiso para ver esta pantalla
  if (!canViewAssignedOrders) {
    return (
      <div className="pedidos-asignados-screen">
        <div className="no-permission">
          <h2>Acceso restringido</h2>
          <p>No tienes permiso para ver esta sección.</p>
          <button onClick={() => navigate('/')} className="btn-volver">
            Volver al inicio
          </button>
        </div>
        <Navbar />
      </div>
    );
  }

  return (
    <div className="pedidos-asignados-screen">
      <div className="pedidos-asignados-container">
        <h2>Pedidos Completados para Asignar</h2>
        
        {loading && (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Cargando pedidos...</p>
          </div>
        )}
        
        {error && <div className="error-message">{error}</div>}
        
        {!loading && pedidosCompletados.length === 0 && (
          <div className="no-pedidos">
            <p>No hay pedidos completados pendientes de asignación</p>
          </div>
        )}
        
        {!loading && pedidosCompletados.length > 0 && (
          <div className="pedidos-table-container">
            <table className="pedidos-table">
              <thead>
                <tr>
                  <th>Nº Pedido</th>
                  <th>Cliente</th>
                  <th>Fecha Completado</th>
                  <th>Dirección</th>
                  <th>Artículos</th>
                  <th>Empleado Asignado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidosCompletados.map((pedido, index) => {
                  // Crear una clave única robusta con valores por defecto
                  const keyParts = [
                    pedido.codigoEmpresa || 'emp-nd',
                    pedido.ejercicioPedido || 'ej-nd',
                    pedido.seriePedido || 'ser-nd',
                    pedido.numeroPedido || `num-nd-${index}`
                  ];
                  
                  const uniqueKey = keyParts.join('-');
                  
                  return (
                    <tr key={uniqueKey}>
                      <td>{pedido.numeroPedido || 'N/D'}</td>
                      <td>{pedido.razonSocial || 'Cliente desconocido'}</td>
                      <td>
                        {pedido.fechaCompletado 
                          ? new Date(pedido.fechaCompletado).toLocaleDateString() 
                          : 'N/D'}
                      </td>
                      <td>
                        {pedido.domicilio || 'N/D'}, {pedido.municipio || 'N/D'}
                      </td>
                      <td>{pedido.articulos?.length || 0}</td>
                      <td>
                        {pedido.CodigoEmpleadoAsignado 
                          ? (empleados.find(e => e.CodigoCliente === pedido.CodigoEmpleadoAsignado)?.Nombre || 'Empleado desconocido')
                          : 'Sin asignar'}
                      </td>
                      <td>
                        <button 
                          onClick={() => verDetallePedido(pedido)}
                          className="btn-detalle"
                        >
                          Ver Detalle
                        </button>
                        {!pedido.CodigoEmpleadoAsignado ? (
                          <button 
                            onClick={() => setAsignandoEmpleado(pedido)}
                            className="btn-asignar"
                            disabled={!canPerformActions}
                          >
                            Asignar Empleado
                          </button>
                        ) : (
                          <button 
                            onClick={() => generarAlbaranParaPedido(pedido)}
                            className="btn-generar"
                            disabled={!canPerformActions}
                          >
                            Generar Albarán
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Modal para asignar empleado */}
        {asignandoEmpleado && (
          <div className="modal-asignacion">
            <div className="modal-contenido">
              <button 
                className="cerrar-modal" 
                onClick={() => {
                  setAsignandoEmpleado(null);
                  setEmpleadoSeleccionado('');
                }}
              >
                &times;
              </button>
              <h3>Asignar Empleado al Pedido #{asignandoEmpleado.numeroPedido || 'N/D'}</h3>
              
              <div className="form-group">
                <label>Seleccionar Empleado:</label>
                <select
                  value={empleadoSeleccionado}
                  onChange={(e) => setEmpleadoSeleccionado(e.target.value)}
                  className="empleado-select"
                >
                  <option value="">Seleccione un empleado</option>
                  {empleados.map(emp => (
                    <option key={emp.CodigoCliente} value={emp.CodigoCliente}>
                      {emp.Nombre} ({emp.UsuarioLogicNet})
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="modal-actions">
                <button 
                  onClick={async () => {
                    if (await asignarEmpleadoAPedido(asignandoEmpleado, empleadoSeleccionado)) {
                      setAsignandoEmpleado(null);
                      setEmpleadoSeleccionado('');
                    }
                  }}
                  disabled={!empleadoSeleccionado}
                  className="btn-confirmar"
                >
                  Asignar
                </button>
                <button 
                  onClick={() => {
                    setAsignandoEmpleado(null);
                    setEmpleadoSeleccionado('');
                  }}
                  className="btn-cancelar"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
        
        <Navbar />
      </div>
    </div>
  );
}

export default PedidosAsignadosScreen;