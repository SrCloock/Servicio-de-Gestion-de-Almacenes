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
  const [cambiandoAsignaciones, setCambiandoAsignaciones] = useState(false);

  useEffect(() => {
    if (!canAssignOrders) return;

    const cargarDatos = async () => {
      try {
        setLoading(true);
        const headers = getAuthHeader();

        // Obtener TODOS los pedidos pendientes
        const pedidosResponse = await axios.get('http://localhost:3000/pedidosPendientes', { 
          headers,
          params: { 
            soloAprobados: false,
            rango: 'todo'
          }
        });
        setPedidos(pedidosResponse.data);

        // Obtener preparadores
        const prepResponse = await axios.get('http://localhost:3000/empleados/preparadores', { headers });
        setPreparadores(prepResponse.data);

        // Inicializar asignaciones con valores actuales
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
      setCambiandoAsignaciones(true);
      setError('');
      const headers = getAuthHeader();
      
      // Preparar cambios: solo los que han sido modificados
      const cambios = [];
      for (const numeroPedido in asignaciones) {
        const nuevoEmpleado = asignaciones[numeroPedido];
        const pedidoOriginal = pedidos.find(p => p.numeroPedido == numeroPedido);
        
        // Solo enviar si hay cambio real
        if (nuevoEmpleado !== (pedidoOriginal?.EmpleadoAsignado || '')) {
          cambios.push({
            numeroPedido: parseInt(numeroPedido),
            pedido: pedidoOriginal,
            nuevoEmpleado: nuevoEmpleado
          });
        }
      }

      if (cambios.length === 0) {
        setError('No hay cambios para guardar');
        setCambiandoAsignaciones(false);
        return;
      }

      // Agrupar cambios por empleado
      const asignacionesPorEmpleado = {};
      cambios.forEach(cambio => {
        const empleadoId = cambio.nuevoEmpleado;
        if (!asignacionesPorEmpleado[empleadoId]) {
          asignacionesPorEmpleado[empleadoId] = [];
        }
        asignacionesPorEmpleado[empleadoId].push(cambio.pedido);
      });

      // Enviar cada grupo de asignaciones
      for (const [empleadoId, pedidosAsignar] of Object.entries(asignacionesPorEmpleado)) {
        const payload = {
          pedidos: pedidosAsignar.map(p => ({
            codigoEmpresa: p.codigoEmpresa,
            ejercicioPedido: p.ejercicioPedido,
            seriePedido: p.seriePedido || '',
            numeroPedido: p.numeroPedido
          })),
          codigoEmpleado: empleadoId === '' ? null : empleadoId
        };

        await axios.post('http://localhost:3000/asignarPedidosAEmpleado', payload, { headers });
      }

      // Actualizar estado local
      setPedidos(prev => 
        prev.map(p => ({
          ...p, 
          EmpleadoAsignado: asignaciones[p.numeroPedido] !== undefined ? 
            (asignaciones[p.numeroPedido] || null) : 
            p.EmpleadoAsignado
        }))
      );

      // Mostrar éxito
      setSuccessMessage(`✅ ${cambios.length} asignaciones guardadas correctamente`);
    } catch (err) {
      const errorMessage = err.response?.data?.detalles || 
                          err.response?.data?.mensaje || 
                          err.response?.data?.error || 
                          err.message || 
                          'Error desconocido';
      setError(`Error al guardar: ${errorMessage}`);
    } finally {
      setCambiandoAsignaciones(false);
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
          <p>Se muestran todos los pedidos pendientes de preparación</p>
          <p>Selecciona un preparador para cada pedido y guarda los cambios</p>
          <p className="AP-note">Nota: Selecciona "Quitar asignación" para remover al preparador asignado</p>
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
              <th>Asignado actualmente</th>
              <th>Reasignar a</th>
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
                    disabled={cambiandoAsignaciones}
                  >
                    <option value="">-- Seleccionar --</option>
                    {preparadores.map(prep => (
                      <option key={prep.codigo} value={prep.codigo}>
                        {prep.nombre}
                      </option>
                    ))}
                    <option value="">Quitar asignación</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pedidos.length === 0 && (
        <div className="AP-no-pedidos">
          <p>No hay pedidos pendientes en este momento</p>
        </div>
      )}

      <div className="AP-actions">
        <button 
          onClick={asignarPedidos} 
          className="AP-btn-asignar"
          disabled={pedidos.length === 0 || cambiandoAsignaciones}
        >
          {cambiandoAsignaciones ? (
            <>
              <span className="AP-spinner-btn"></span> Guardando...
            </>
          ) : (
            'Guardar Cambios'
          )}
        </button>
      </div>
      <Navbar />
    </div>
  );
};

export default AsignarPedidosScreen;