import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import '../styles/AlbaranesAsignadosScreen.css';

function AlbaranesAsignadosScreen() {
  const [pedidos, setPedidos] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [asignaciones, setAsignaciones] = useState({});
  
  const { canAssignWaybills } = usePermissions();

  useEffect(() => {
    if (!canAssignWaybills) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const headers = getAuthHeader();
        
        // Obtener pedidos preparados
        const pedidosResponse = await axios.get(
          'http://localhost:3000/pedidos-preparados', 
          { headers }
        );
        
        // Obtener repartidores
        const repartidoresResponse = await axios.get(
          'http://localhost:3000/repartidores', 
          { headers }
        );
        
        setPedidos(pedidosResponse.data);
        setRepartidores(repartidoresResponse.data);
        
        // Inicializar asignaciones
        const initialAsignaciones = {};
        pedidosResponse.data.forEach(pedido => {
          initialAsignaciones[pedido.NumeroPedido] = '';
        });
        setAsignaciones(initialAsignaciones);
        
      } catch (err) {
        console.error("Error cargando datos:", err);
        setError('Error al cargar datos: ' + (err.response?.data?.mensaje || err.message));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [canAssignWaybills]);

  const handleAsignarReparto = async (numeroPedido) => {
    const repartidorId = asignaciones[numeroPedido];
    
    if (!repartidorId) {
      alert('Selecciona un repartidor');
      return;
    }

    try {
      const headers = getAuthHeader();
      const pedido = pedidos.find(p => p.NumeroPedido === numeroPedido);
      
      await axios.post(
        'http://localhost:3000/asignarRepartoYGenerarAlbaran',
        {
          codigoEmpresa: pedido.CodigoEmpresa,
          numeroPedido: numeroPedido,
          codigoRepartidor: repartidorId
        },
        { headers }
      );

      // Actualizar lista
      setPedidos(prev => prev.filter(p => p.NumeroPedido !== numeroPedido));
      alert('Reparto asignado y albarán generado correctamente');
      
    } catch (error) {
      console.error('Error asignando reparto:', error);
      alert(`Error: ${error.response?.data?.mensaje || error.message}`);
    }
  };

  if (!canAssignWaybills) {
    return (
      <div className="no-permission">
        <h2>Acceso restringido</h2>
        <p>No tienes permiso para acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="albaranes-asignados-screen">
      <div className="asignaciones-content">
        <h2>Asignación de Repartos</h2>
        <p className="subtitle">Pedidos preparados para asignar a repartidores</p>

        {loading && (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Cargando pedidos...</p>
          </div>
        )}
        
        {error && <div className="error-message">{error}</div>}

        {!loading && pedidos.length === 0 && (
          <div className="no-pedidos">
            <p>No hay pedidos preparados para asignar</p>
          </div>
        )}

        <div className="pedidos-grid">
          {pedidos.map(pedido => (
            <div key={pedido.NumeroPedido} className="pedido-card">
              <div className="card-header">
                <h4>Pedido #{pedido.NumeroPedido}</h4>
                <span className="fecha-pedido">
                  {new Date(pedido.FechaPedido).toLocaleDateString('es-ES')}
                </span>
              </div>
              
              <div className="card-body">
                <p className="cliente-info">
                  <span className="icon">👤</span> 
                  <strong>Cliente:</strong> {pedido.RazonSocial}
                </p>
                <p className="direccion-info">
                  <span className="icon">📍</span> 
                  <strong>Dirección:</strong> {pedido.Domicilio}, {pedido.Municipio}
                </p>
                {pedido.obra && (
                  <p className="obra-info">
                    <span className="icon">🏗️</span> 
                    <strong>Obra:</strong> {pedido.obra}
                  </p>
                )}
                <p className="vendedor-info">
                  <span className="icon">👔</span> 
                  <strong>Vendedor:</strong> {pedido.Vendedor || 'No especificado'}
                </p>
              </div>
              
              <div className="card-footer">
                <div className="asignacion-control">
                  <select
                    value={asignaciones[pedido.NumeroPedido] || ''}
                    onChange={(e) => setAsignaciones({
                      ...asignaciones,
                      [pedido.NumeroPedido]: e.target.value
                    })}
                  >
                    <option value="">Seleccionar repartidor</option>
                    {repartidores.map(rep => (
                      <option key={rep.id} value={rep.id}>
                        {rep.nombre}
                      </option>
                    ))}
                  </select>
                  
                  <button
                    className="asignar-btn"
                    onClick={() => handleAsignarReparto(pedido.NumeroPedido)}
                    disabled={!asignaciones[pedido.NumeroPedido]}
                  >
                    Asignar Reparto
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <Navbar />
    </div>
  );
}

export default AlbaranesAsignadosScreen;