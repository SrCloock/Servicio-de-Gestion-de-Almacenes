// src/screens/AsignarPedidosScreen.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import { usePermissions } from '../PermissionsManager';
import '../styles/AsignarPedidosScreen.css';

const AsignarPedidosScreen = () => {
  const [pedidos, setPedidos] = useState([]);
  const [preparadores, setPreparadores] = useState([]);
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState('');
  const [pedidosSeleccionados, setPedidosSeleccionados] = useState({});
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);

  const { canAssignOrders } = usePermissions();

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setLoading(true);

        const headers = getAuthHeader();
        const [pedidosRes, preparadoresRes] = await Promise.all([
          axios.get('/pedidosPendientes?todos=true', { headers }),
          axios.get('/empleados-preparadores', { headers })
        ]);

        if (!Array.isArray(pedidosRes.data)) {
          console.error('Error: /pedidosPendientes no devolvió un array', pedidosRes.data);
          setPedidos([]);
          setLoading(false);
          return;
        }

        if (!Array.isArray(preparadoresRes.data)) {
          console.error('Error: /empleados-preparadores no devolvió un array', preparadoresRes.data);
          setPreparadores([]);
          setLoading(false);
          return;
        }

        setPedidos(pedidosRes.data);
        setPreparadores(preparadoresRes.data);

        // Inicializar selecciones vacías
        const seleccionesIniciales = {};
        pedidosRes.data.forEach(pedido => {
          seleccionesIniciales[pedido.numeroPedido] = false;
        });
        setPedidosSeleccionados(seleccionesIniciales);

        setLoading(false);
      } catch (error) {
        console.error('Error cargando datos:', error);
        setLoading(false);
      }
    };

    cargarDatos();
  }, []);

  const toggleSeleccionPedido = (numeroPedido) => {
    setPedidosSeleccionados(prev => ({
      ...prev,
      [numeroPedido]: !prev[numeroPedido]
    }));
  };

  const seleccionarTodos = () => {
    const todosSeleccionados = {};
    pedidos.forEach(pedido => {
      todosSeleccionados[pedido.numeroPedido] = true;
    });
    setPedidosSeleccionados(todosSeleccionados);
  };

  const deseleccionarTodos = () => {
    const ningunoSeleccionado = {};
    pedidos.forEach(pedido => {
      ningunoSeleccionado[pedido.numeroPedido] = false;
    });
    setPedidosSeleccionados(ningunoSeleccionado);
  };

  const asignarPedidos = async () => {
    if (!empleadoSeleccionado) {
      alert('Por favor, seleccione un preparador');
      return;
    }

    const pedidosParaAsignar = pedidos.filter(
      p => pedidosSeleccionados[p.numeroPedido]
    );

    if (pedidosParaAsignar.length === 0) {
      alert('Por favor, seleccione al menos un pedido');
      return;
    }

    try {
      setGuardando(true);
      await axios.post(
        '/asignarPedidoAPreparador',
        {
          pedidos: pedidosParaAsignar,
          empleado: empleadoSeleccionado
        },
        { headers: getAuthHeader() }
      );

      // Actualizar UI
      const nuevosPedidos = pedidos.map(pedido => {
        if (pedidosSeleccionados[pedido.numeroPedido]) {
          return { ...pedido, Preparador: empleadoSeleccionado };
        }
        return pedido;
      });

      setPedidos(nuevosPedidos);
      setExito(true);

      // Resetear después de éxito
      setTimeout(() => {
        setExito(false);
        deseleccionarTodos();
      }, 3000);
    } catch (error) {
      console.error('Error asignando pedidos:', error);
      alert('Error al asignar pedidos: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setGuardando(false);
    }
  };

  if (!canAssignOrders) {
    return (
      <div className="no-permission">
        <h2>Acceso restringido</h2>
        <p>No tienes permiso para acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="asignar-pedidos-container">
      <h1>Asignar Pedidos a Preparadores</h1>

      <div className="controles-superiores">
        <div className="selector-preparador">
          <label>Seleccionar preparador:</label>
          <select
            value={empleadoSeleccionado}
            onChange={e => setEmpleadoSeleccionado(e.target.value)}
            className="select-preparador"
          >
            <option value="">-- Seleccione un preparador --</option>
            {preparadores.map(prep => (
              <option key={prep.UsuarioLogicNet} value={prep.UsuarioLogicNet}>
                {prep.Nombre} ({prep.UsuarioLogicNet})
              </option>
            ))}
          </select>
        </div>

        <div className="controles-seleccion">
          <button onClick={seleccionarTodos} className="btn-seleccionar">
            Seleccionar todos
          </button>
          <button onClick={deseleccionarTodos} className="btn-deseleccionar">
            Deseleccionar todos
          </button>
        </div>

        <button 
          onClick={asignarPedidos}
          disabled={!empleadoSeleccionado || guardando}
          className="btn-asignar"
        >
          {guardando ? 'Asignando...' : 'Asignar Pedidos Seleccionados'}
        </button>
      </div>

      {exito && (
        <div className="mensaje-exito">
          <i className="fas fa-check-circle"></i> Pedidos asignados correctamente
        </div>
      )}

      <div className="lista-pedidos">
        {loading ? (
          <div className="cargando">
            <div className="spinner"></div>
            <p>Cargando pedidos...</p>
          </div>
        ) : pedidos.length === 0 ? (
          <div className="sin-pedidos">
            <p>No hay pedidos pendientes para asignar</p>
          </div>
        ) : (
          <table className="tabla-pedidos">
            <thead>
              <tr>
                <th></th>
                <th>N° Pedido</th>
                <th>Cliente</th>
                <th>Fecha Entrega</th>
                <th>Artículos</th>
                <th>Preparador Actual</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map(pedido => (
                <tr 
                  key={pedido.numeroPedido} 
                  className={pedidosSeleccionados[pedido.numeroPedido] ? 'seleccionado' : ''}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={!!pedidosSeleccionados[pedido.numeroPedido]}
                      onChange={() => toggleSeleccionPedido(pedido.numeroPedido)}
                      className="checkbox-seleccion"
                    />
                  </td>
                  <td>#{pedido.numeroPedido}</td>
                  <td>{pedido.razonSocial}</td>
                  <td>{pedido.fechaEntrega ? new Date(pedido.fechaEntrega).toLocaleDateString() : 'N/A'}</td>
                  <td>{pedido.articulos.length}</td>
                  <td>{pedido.Preparador || 'Sin asignar'}</td>
                  <td>
                    <span className={`badge-estado ${pedido.Status}`}>
                      {pedido.Status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AsignarPedidosScreen;
