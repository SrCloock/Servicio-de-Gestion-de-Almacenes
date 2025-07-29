import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';

const AlbaranesAsignadosScreen = () => {
  const [albaranesPendientes, setAlbaranesPendientes] = useState([]);
  const [preparadores, setPreparadores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [albaranesRes, preparadoresRes] = await Promise.all([
          axios.get('/albaranesPendientes?todos=true', { headers: getAuthHeader() }),
          axios.get('/empleados-preparadores', { headers: getAuthHeader() })
        ]);
        
        // Filtrar solo albaranes sin asignar
        const albaranesSinAsignar = albaranesRes.data.filter(
          a => !a.usuarioAsignado
        );
        
        setAlbaranesPendientes(albaranesSinAsignar);
        setPreparadores(preparadoresRes.data);
      } catch (error) {
        console.error('Error cargando datos:', error);
      } finally {
        setLoading(false);
      }
    };
    
    cargarDatos();
  }, []);

  const handleAsignarPreparador = async (albaranId, usuarioAsignado) => {
    try {
      const albaran = albaranesPendientes.find(a => a.id === albaranId);
      
      await axios.post('/asignar-albaran', 
        {
          codigoEmpresa: albaran.codigoEmpresa,
          ejercicio: albaran.ejercicio,
          serie: albaran.serie,
          numeroAlbaran: albaran.numero,
          usuarioAsignado
        },
        { headers: getAuthHeader() }
      );
      
      // Actualizar UI
      setAlbaranesPendientes(prev => 
        prev.filter(a => a.id !== albaranId)
      );
      
      alert(`Albarán ${albaran.albaran} asignado correctamente`);
    } catch (error) {
      console.error('Error asignando albarán:', error);
      alert('Error al asignar albarán');
    }
  };

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div className="albaranes-asignados">
      <h2>Asignación de Albaranes a Preparadores</h2>
      
      <table className="asignacion-table">
        <thead>
          <tr>
            <th>Albarán</th>
            <th>Cliente</th>
            <th>Obra</th>
            <th>Fecha</th>
            <th>Artículos</th>
            <th>Asignar a Preparador</th>
          </tr>
        </thead>
        <tbody>
          {albaranesPendientes.map(albaran => (
            <tr key={albaran.id}>
              <td>{albaran.albaran}</td>
              <td>{albaran.cliente}</td>
              <td>{albaran.obra || 'N/A'}</td>
              <td>{new Date(albaran.FechaAlbaran).toLocaleDateString()}</td>
              <td>{albaran.articulos.length} artículos</td>
              <td>
                <select
                  onChange={(e) => handleAsignarPreparador(albaran.id, e.target.value)}
                  defaultValue=""
                >
                  <option value="" disabled>Seleccionar preparador</option>
                  {preparadores.map(prep => (
                    <option key={prep.UsuarioLogicNet} value={prep.UsuarioLogicNet}>
                      {prep.Nombre} ({prep.UsuarioLogicNet})
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {albaranesPendientes.length === 0 && (
        <div className="no-albaranes">
          <p>Todos los albaranes están asignados</p>
        </div>
      )}
    </div>
  );
};

export default AlbaranesAsignadosScreen;