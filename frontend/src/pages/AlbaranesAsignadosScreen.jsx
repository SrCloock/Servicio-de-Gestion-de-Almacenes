import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import '../styles/AlbaranesAsignadosScreen.css';

function AlbaranesAsignadosScreen() {
  const [albaranes, setAlbaranes] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [asignaciones, setAsignaciones] = useState({});

  const permissions = usePermissions();
  const { canAssignWaybills } = permissions;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const headers = getAuthHeader();
        
        const [albaranesResponse, repartidoresResponse] = await Promise.all([
          axios.get('http://localhost:3000/albaranes-asignacion', { headers }),
          axios.get('http://localhost:3000/repartidores', { headers })
        ]);
        
        setAlbaranes(albaranesResponse.data);
        setRepartidores(repartidoresResponse.data);
        
        // Inicializar asignaciones
        const initialAsignaciones = {};
        albaranesResponse.data.forEach(albaran => {
          const key = `albaran-${albaran.EjercicioAlbaran}-${albaran.SerieAlbaran || ''}-${albaran.NumeroAlbaran}`;
          initialAsignaciones[key] = albaran.repartidorAsignado || '';
        });
        
        setAsignaciones(initialAsignaciones);
        
      } catch (err) {
        setError('Error: ' + (err.response?.data?.mensaje || err.message));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleAsignarAlbaran = async (albaran) => {
    const key = `albaran-${albaran.EjercicioAlbaran}-${albaran.SerieAlbaran || ''}-${albaran.NumeroAlbaran}`;
    const repartidorId = asignaciones[key];
    
    if (!repartidorId) {
      alert('Selecciona un repartidor');
      return;
    }

    try {
      const headers = getAuthHeader();
      const response = await axios.post(
        'http://localhost:3000/asignarAlbaranExistente',
        {
          codigoEmpresa: albaran.CodigoEmpresa,
          ejercicio: albaran.EjercicioAlbaran,
          serie: albaran.SerieAlbaran,
          numeroAlbaran: albaran.NumeroAlbaran,
          codigoRepartidor: repartidorId
        },
        { headers }
      );

      if (response.data.success) {
        // Actualizar el albarán en el estado (solo el repartidor)
        setAlbaranes(prev => prev.map(a => 
          a.EjercicioAlbaran === albaran.EjercicioAlbaran &&
          (a.SerieAlbaran || '') === (albaran.SerieAlbaran || '') &&
          a.NumeroAlbaran === albaran.NumeroAlbaran
            ? { ...a, repartidorAsignado: repartidorId }
            : a
        ));
        alert('Albarán asignado correctamente');
      }
      
    } catch (error) {
      console.error('Error asignando albarán:', error);
      setError(`Error: ${error.response?.data?.mensaje || error.message}`);
    }
  };

  const formatFecha = (fechaString) => {
    const fecha = new Date(fechaString);
    return fecha.toLocaleDateString('es-ES');
  };

  if (!canAssignWaybills) {
    return (
      <div className="AA-no-permission">
        <h2>Acceso restringido</h2>
        <p>No tienes permiso para acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="AA-container">
      <div className="AA-content">
        <h2 className="AA-header">Asignación de Repartos</h2>
        
        {loading && (
          <div className="AA-loading">
            <div className="AA-spinner"></div>
            <p>Cargando datos...</p>
          </div>
        )}
        
        {error && <div className="AA-error">{error}</div>}

        <div>
          <h3>Albaranes Pendientes ({albaranes.length})</h3>
          {albaranes.length === 0 ? (
            <div className="AA-no-items">No hay albaranes pendientes</div>
          ) : (
            <div className="AA-table-container">
              <table className="AA-pedidos-table">
                <thead>
                  <tr>
                    <th>Albarán</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Dirección</th>
                    <th>Repartidor</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {albaranes.map(albaran => {
                    const key = `albaran-${albaran.EjercicioAlbaran}-${albaran.SerieAlbaran || ''}-${albaran.NumeroAlbaran}`;
                    return (
                      <tr key={key}>
                        <td>{albaran.albaran}</td>
                        <td>{formatFecha(albaran.FechaAlbaran)}</td>
                        <td>{albaran.RazonSocial}</td>
                        <td>{albaran.Domicilio}, {albaran.Municipio}</td>
                        <td>
                          <select
                            value={asignaciones[key] || ''}
                            onChange={(e) => setAsignaciones({
                              ...asignaciones,
                              [key]: e.target.value
                            })}
                            className="AA-select"
                          >
                            <option value="">Sin asignar</option>
                            {repartidores.map(rep => (
                              <option key={rep.id} value={rep.id}>
                                {rep.nombre}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            className="AA-btn-asignar"
                            onClick={() => handleAsignarAlbaran(albaran)}
                            disabled={!asignaciones[key] || asignaciones[key] === albaran.repartidorAsignado}
                          >
                            {albaran.repartidorAsignado ? 'Reasignar' : 'Asignar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <Navbar />
    </div>
  );
}

export default AlbaranesAsignadosScreen;