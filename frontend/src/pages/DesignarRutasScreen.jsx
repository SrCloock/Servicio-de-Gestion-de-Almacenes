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
        const user = JSON.parse(localStorage.getItem('user'));
        const codigoEmpresa = user.CodigoEmpresa;
        
        const repResponse = await axios.get(
          `http://localhost:3000/empleados?categoria=Repartidor&codigoEmpresa=${codigoEmpresa}`,
          { headers }
        );
        
        const albResponse = await axios.get(
          `http://localhost:3000/albaranesPendientes`,
          { headers }
        );
        
        setRepartidores(repResponse.data);
        setAlbaranes(albResponse.data);
      } catch (err) {
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
      
      await axios.post(
        'http://localhost:3000/designar-rutas',
        { asignaciones },
        { headers }
      );
      
      alert('Rutas asignadas correctamente');
    } catch (err) {
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
      <h2>Designar Albaranes a Repartidores</h2>
      
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
              <td>{albaran.numero}</td>
              <td>{albaran.cliente}</td>
              <td>{albaran.direccion}</td>
              <td>
                <select
                  value={asignaciones[albaran.id] || ''}
                  onChange={e => handleAsignar(albaran.id, e.target.value)}
                >
                  <option value="">Seleccionar repartidor</option>
                  {repartidores.map(rep => (
                    <option key={rep.id} value={rep.id}>
                      {rep.nombre}
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