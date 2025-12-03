import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../helpers/api';
import { getAuthHeader } from '../helpers/authHelper';
import { usePermissions } from '../PermissionsManager';
import Navbar from '../components/Navbar';
import '../styles/DesignarRutasScreen.css';

const DesignarRutasScreen = () => {
  const navigate = useNavigate();
  const { canAssignRoutes } = usePermissions();
  
  const [repartidores, setRepartidores] = useState([]);
  const [albaranes, setAlbaranes] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const cargarDatos = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const headers = getAuthHeader();
      
      const [repResponse, albResponse] = await Promise.all([
        API.get('/repartidores', { headers }),
        API.get('/albaranesPendientesUnicos', { headers })
      ]);
      
      setRepartidores(repResponse.data);
      setAlbaranes(albResponse.data);
    } catch (err) {
      setError('Error cargando datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const handleAsignar = useCallback((albaranId, repartidorId) => {
    setAsignaciones(prev => ({ ...prev, [albaranId]: repartidorId }));
  }, []);

  const guardarAsignaciones = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const headers = getAuthHeader();
      
      const asignacionesParaEnviar = Object.entries(asignaciones)
        .filter(([_, repartidorId]) => repartidorId)
        .map(([idUnico, repartidorId]) => {
          const [serie, numeroAlbaran] = idUnico.split('-');
          return {
            serieAlbaran: serie,
            numeroAlbaran: parseInt(numeroAlbaran),
            repartidorId
          };
        });
      
      if (!asignacionesParaEnviar.length) {
        alert('No hay asignaciones para guardar');
        return;
      }
      
      await API.post('/designar-rutas', { asignaciones: asignacionesParaEnviar }, { headers });
      
      alert('Rutas asignadas correctamente');
      setAsignaciones({});
      
      const albResponse = await API.get('/albaranesPendientesUnicos', { headers });
      setAlbaranes(albResponse.data);
    } catch (err) {
      setError('Error guardando asignaciones: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [asignaciones]);

  const hayAsignacionesPendientes = useMemo(() => 
    Object.keys(asignaciones).length > 0,
  [asignaciones]);

  const renderHeader = useMemo(() => (
    <div className="screen-header">
      <div className="bubble bubble1"></div>
      <div className="bubble bubble2"></div>
      <h2>Designar Albaranes a Repartidores</h2>
    </div>
  ), []);

  const renderTabla = useMemo(() => (
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
  ), [albaranes, asignaciones, repartidores, handleAsignar]);

  const renderAcciones = useMemo(() => (
    <div className="actions-container">
      <button 
        onClick={guardarAsignaciones} 
        className="btn-guardar"
        disabled={!hayAsignacionesPendientes}
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
  ), [guardarAsignaciones, hayAsignacionesPendientes, navigate]);

  const renderContenido = useMemo(() => {
    if (loading) {
      return (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Cargando datos...</p>
        </div>
      );
    }

    return (
      <>
        {renderTabla}
        {renderAcciones}
      </>
    );
  }, [loading, renderTabla, renderAcciones]);

  const renderSinPermiso = useMemo(() => (
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
  ), [navigate]);

  if (!canAssignRoutes) {
    return renderSinPermiso;
  }

  return (
    <div className="designar-rutas-container">
      {renderHeader}
      {error && <div className="error">{error}</div>}
      {renderContenido}
      <Navbar />
    </div>
  );
};

export default DesignarRutasScreen;