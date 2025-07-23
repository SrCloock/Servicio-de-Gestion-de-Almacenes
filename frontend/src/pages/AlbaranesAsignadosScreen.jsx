import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '../PermissionsManager';
import { getAuthHeader } from '../helpers/authHelper';
import '../styles/AlbaranesAsignadosScreen.css';

function AlbaranesAsignadosScreen() {
  const permissions = usePermissions();
  const [albaranes, setAlbaranes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Verificar permisos
  const hasPermission = 
    permissions.isAdmin || 
    permissions.isAdvancedUser || 
    permissions.isReadOnly || 
    permissions.canAssignRoutes;
  
  if (!hasPermission) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    const cargarAlbaranes = async () => {
      try {
        setCargando(true);
        const headers = getAuthHeader();
        const response = await axios.get(
          'http://localhost:3000/albaranesPendientes', 
          { headers }
        );
        setAlbaranes(response.data);
        setError(null);
      } catch (err) {
        console.error('Error cargando albaranes:', err);
        setError('Error al cargar los albaranes. Intente nuevamente.');
      } finally {
        setCargando(false);
      }
    };
    
    cargarAlbaranes();
  }, []);

  const marcarComoEntregado = async (albaranId) => {
    try {
      const headers = getAuthHeader();
      await axios.post(
        'http://localhost:3000/marcarAlbaranEntregado',
        { albaranId },
        { headers }
      );
      setAlbaranes(albaranes.filter(a => a.id !== albaranId));
    } catch (error) {
      console.error('Error marcando albarán:', error);
      alert('Error al marcar albarán como entregado');
    }
  };

  if (cargando) {
    return <div className="cargando">Cargando albaranes...</div>;
  }

  if (error) {
    return <div className="error-albaranes">{error}</div>;
  }

  return (
    <div className="albaranes-container">
      <h2>Albaranes Asignados</h2>
      
      {albaranes.length === 0 ? (
        <div className="sin-albaranes">
          No hay albaranes asignados pendientes
        </div>
      ) : (
        <div className="lista-albaranes">
          {albaranes.map(albaran => (
            <div key={albaran.id} className="tarjeta-albaran">
              <div className="cabecera-albaran">
                <span className="numero-albaran">{albaran.albaran}</span>
                <span className="fecha-albaran">
                  {new Date(albaran.FechaAlbaran).toLocaleDateString()}
                </span>
              </div>
              
              <div className="cliente-albaran">
                <strong>Cliente:</strong> {albaran.cliente}
              </div>
              
              <div className="direccion-albaran">
                <strong>Dirección:</strong> {albaran.direccion}
              </div>
              
              <div className="articulos-albaran">
                <strong>Artículos:</strong>
                <ul>
                  {albaran.articulos.map((articulo, idx) => (
                    <li key={idx}>
                      {articulo.cantidad} x {articulo.nombre}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="acciones-albaran">
                <button 
                  onClick={() => marcarComoEntregado(albaran.id)}
                  className="btn-entregado"
                >
                  Marcar como entregado
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AlbaranesAsignadosScreen;