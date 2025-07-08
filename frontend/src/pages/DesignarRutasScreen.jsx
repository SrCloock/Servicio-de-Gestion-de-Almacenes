import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/DesignarRutasScreen.css';
import Navbar from '../components/Navbar';
import { getAuthHeader } from '../helpers/authHelper';

const DesignarRutasScreen = () => {
  const [repartidores, setRepartidores] = useState([]);
  const [albaranes, setAlbaranes] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setLoading(true);
        const headers = getAuthHeader();
        
        // Obtener repartidores
        const repResponse = await axios.get(
          'http://localhost:3000/repartidores',
          { 
            headers
          }
        );
        
        // Obtener albaranes pendientes con IDs únicos
        const albResponse = await axios.get(
          `http://localhost:3000/albaranesPendientesUnicos`,
          { 
            headers
          }
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
      const asignacionesParaEnviar = Object.entries(asignaciones).map(([idUnico, repartidorId]) => {
        const [serie, numeroAlbaran] = idUnico.split('-');
        return {
          serieAlbaran: serie,
          numeroAlbaran: parseInt(numeroAlbaran),
          repartidorId
        };
      });
      
      await axios.post(
        'http://localhost:3000/designar-rutas',
        { 
          asignaciones: asignacionesParaEnviar
        },
        { headers }
      );
      
      alert('Rutas asignadas correctamente');
      setAsignaciones({});
    } catch (err) {
      console.error('Error guardando asignaciones:', err);
      setError('Error guardando asignaciones: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  return (
    <div className="designar-rutas-container">
      <div className="screen-header">
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
        <h2>Designar Albaranes a Repartidores</h2>
      </div>
      
      {error && <div className="error">{error}</div>}
      
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
      
      <button onClick={guardarAsignaciones} className="btn-guardar">
        Guardar Asignaciones
      </button>
      
      <Navbar />
    </div>
  );
};

export default DesignarRutasScreen;