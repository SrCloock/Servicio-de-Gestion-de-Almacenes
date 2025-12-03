import React, { useState, useEffect, useCallback, useMemo } from 'react';
import API from '../helpers/api';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import '../styles/AsignarPedidosScreen.css';

const AsignarPedidosScreen = () => {
  const [pedidos, setPedidos] = useState([]);
  const [preparadores, setPreparadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [asignaciones, setAsignaciones] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [cambiandoAsignaciones, setCambiandoAsignaciones] = useState(false);
  
  const { canAssignOrders } = usePermissions();

  const cargarDatos = useCallback(async () => {
    if (!canAssignOrders) return;

    try {
      setLoading(true);
      const headers = getAuthHeader();

      const [pedidosResponse, prepResponse] = await Promise.all([
        API.get('/pedidosPendientes', { 
          headers,
          params: { soloAprobados: false, rango: 'todo' }
        }),
        API.get('/empleados/preparadores', { headers })
      ]);

      setPedidos(pedidosResponse.data);
      setPreparadores(prepResponse.data);

      const inicialAsignaciones = {};
      pedidosResponse.data.forEach(pedido => {
        inicialAsignaciones[pedido.numeroPedido] = pedido.EmpleadoAsignado || '';
      });
      setAsignaciones(inicialAsignaciones);
    } catch (err) {
      setError('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [canAssignOrders]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

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
      setSuccessMessage('');
      
      const headers = getAuthHeader();
      const cambios = [];

      pedidos.forEach(pedido => {
        const nuevoEmpleado = asignaciones[pedido.numeroPedido];
        const empleadoActual = pedido.EmpleadoAsignado || '';
        if (nuevoEmpleado !== empleadoActual) {
          cambios.push({ pedido, nuevoEmpleado });
        }
      });

      if (!cambios.length) {
        setError('No hay cambios para guardar');
        return;
      }

      const asignacionesPorEmpleado = cambios.reduce((acc, { pedido, nuevoEmpleado }) => {
        if (!acc[nuevoEmpleado]) acc[nuevoEmpleado] = [];
        acc[nuevoEmpleado].push(pedido);
        return acc;
      }, {});

      await Promise.all(
        Object.entries(asignacionesPorEmpleado).map(([empleadoId, pedidosAsignar]) =>
          API.post('/asignarPedidosAEmpleado', {
            pedidos: pedidosAsignar.map(p => ({
              codigoEmpresa: p.codigoEmpresa,
              ejercicioPedido: p.ejercicioPedido,
              seriePedido: p.seriePedido || '',
              numeroPedido: p.numeroPedido
            })),
            codigoEmpleado: empleadoId || null
          }, { headers })
        )
      );

      setPedidos(prev => prev.map(p => ({
        ...p,
        EmpleadoAsignado: asignaciones[p.numeroPedido] || null
      })));

      setSuccessMessage(`✅ ${cambios.length} asignaciones guardadas correctamente`);
    } catch (err) {
      const errorData = err.response?.data;
      const errorMessage = errorData?.detalles || errorData?.mensaje || 
                          errorData?.error || err.message || 'Error desconocido';
      setError(`Error al guardar: ${errorMessage}`);
    } finally {
      setCambiandoAsignaciones(false);
    }
  };

  const preparadoresMap = useMemo(() => 
    preparadores.reduce((acc, prep) => {
      acc[prep.codigo] = prep.nombre;
      return acc;
    }, {}),
  [preparadores]);

  const hayCambiosPendientes = useMemo(() =>
    pedidos.some(pedido => {
      const nuevoEmpleado = asignaciones[pedido.numeroPedido];
      const empleadoActual = pedido.EmpleadoAsignado || '';
      return nuevoEmpleado !== empleadoActual;
    }),
  [pedidos, asignaciones]);

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
                    ? (preparadoresMap[pedido.EmpleadoAsignado] || pedido.EmpleadoAsignado)
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

      {!pedidos.length && (
        <div className="AP-no-pedidos">
          <p>No hay pedidos pendientes en este momento</p>
        </div>
      )}

      {!!pedidos.length && (
        <div className="AP-actions">
          <button 
            onClick={asignarPedidos} 
            className="AP-btn-asignar"
            disabled={!hayCambiosPendientes || cambiandoAsignaciones}
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
      )}
      <Navbar />
    </div>
  );
};

export default AsignarPedidosScreen;