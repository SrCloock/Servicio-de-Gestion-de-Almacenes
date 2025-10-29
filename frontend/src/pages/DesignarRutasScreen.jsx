import React, { useState, useEffect } from 'react';
import API from '../helpers/api';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../PermissionsManager';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import '../styles/DesignarRutasScreen.css';

const DesignarRutasScreen = () => {
  const navigate = useNavigate();
  
  // Obtener permisos del usuario
  const { canAssignRoutes } = usePermissions();
  
  const [repartidores, setRepartidores] = useState([]);
  const [albaranes, setAlbaranes] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Si no tiene permiso para ver esta pantalla
  if (!canAssignRoutes) {
    return (
      <div className="designar-rutas-container">
        <div className="no-permission">
          <h2>Acceso restringido</h2>
          <p>No tienes permiso para acceder a esta sección.</p>
          <button onClick={() => navigate('/')} className="btn-volver">
            Volver al inicio
          </button>
        </div>
        <Navbar />
      </div>
    );
  }
  
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setLoading(true);
        const headers = getAuthHeader();
        
        // Obtener repartidores
        const repResponse = await API.get(
          '/repartidores',
          { headers }
        );
        
        // Obtener albaranes pendientes con IDs únicos
        const albResponse = await API.get(
          '/albaranesPendientesUnicos',
          { headers }
        );
        
        setRepartidores(repResponse.data);
        setAlbaranes(albResponse.data);
      } catch (err) {
        console.error('Error cargando datos:', err);
        setError('Error cargando datos: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    
    cargarDatos();
  }, []);

  const handleAsignar = (albaranId, repartidorId) => {
    setAsignaciones(prev => ({
      ...prev,
      [albaranId]: repartidorId
    }));
  };

  const guardarAsignaciones = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeader();
      
      // Transformar asignaciones para enviar al backend
      const asignacionesParaEnviar = Object.entries(asignaciones)
        .filter(([_, repartidorId]) => repartidorId) // Filtrar asignaciones válidas
        .map(([idUnico, repartidorId]) => {
          const [serie, numeroAlbaran] = idUnico.split('-');
          return {
            serieAlbaran: serie,
            numeroAlbaran: parseInt(numeroAlbaran),
            repartidorId
          };
        });
      
      if (asignacionesParaEnviar.length === 0) {
        alert('No hay asignaciones para guardar');
        return;
      }
      
      await API.post(
        '/designar-rutas',
        { asignaciones: asignacionesParaEnviar },
        { headers }
      );
      
      alert('Rutas asignadas correctamente');
      setAsignaciones({});
      
      // Recargar datos
      const albResponse = await API.get(
        '/albaranesPendientesUnicos',
        { headers }
      );
      setAlbaranes(albResponse.data);
    } catch (err) {
      console.error('Error guardando asignaciones:', err);
      setError('Error guardando asignaciones: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="designar-rutas-container">
      <div className="screen-header">
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
        <h2>Designar Albaranes a Repartidores</h2>
      </div>
      
      {error && <div className="error">{error}</div>}
      
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Cargando datos...</p>
        </div>
      ) : (
        <>
          <table className="designar-table">
            <thead>
              <tr>
                <th>Albarán</th>
                <th>Cliente</th>
                <th>Dirección</th>
                <th>Repartidor</th>
              </tr>
            </thead>
            <tbody>
              {albaranes.map(albaran => (
                <tr key={albaran.id}>
                  <td>{albaran.albaran}</td>
                  <td>{albaran.cliente}</td>
                  <td>{albaran.direccion}</td>
                  <td>
                    <select
                      value={asignaciones[albaran.id] || ''}
                      onChange={e => handleAsignar(albaran.id, e.target.value)}
                    >
                      <option value="">Seleccionar repartidor</option>
                      {repartidores.map(rep => (
                        <option key={rep.CodigoCliente} value={rep.CodigoCliente}>
                          {rep.Nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="actions-container">
            <button 
              onClick={guardarAsignaciones} 
              className="btn-guardar"
              disabled={Object.keys(asignaciones).length === 0}
            >
              Guardar Asignaciones
            </button>
            
            <button 
              onClick={() => navigate('/')} 
              className="btn-volver"
            >
              Volver al Inicio
            </button>
          </div>
        </>
      )}
      
      <Navbar />
    </div>
  );
};

export default DesignarRutasScreen;