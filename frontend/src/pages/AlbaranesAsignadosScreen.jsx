import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';

function AsignacionAlbaranesScreen() {
  const [albaranes, setAlbaranes] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setCargando(true);
        const headers = getAuthHeader();
        
        // Obtener albaranes pendientes de asignación
        const albResponse = await axios.get(
          'http://localhost:3000/albaranesPendientes?todos=true', 
          { headers }
        );
        
        // Obtener empleados repartidores
        const empResponse = await axios.get(
          'http://localhost:3000/empleados', 
          { headers }
        );
        
        setAlbaranes(albResponse.data);
        setEmpleados(empResponse.data);
        setError(null);
      } catch (err) {
        console.error('Error cargando datos:', err);
        setError('Error al cargar datos. Intente nuevamente.');
      } finally {
        setCargando(false);
      }
    };
    
    cargarDatos();
  }, []);

  const handleAsignar = async (albaran) => {
    const usuarioAsignado = asignaciones[albaran.id];
    
    if (!usuarioAsignado) {
      alert('Seleccione un repartidor');
      return;
    }
    
    try {
      const headers = getAuthHeader();
      await axios.post('http://localhost:3000/asignarAlbaran', {
        codigoEmpresa: albaran.codigoEmpresa,
        ejercicio: albaran.ejercicio,
        serie: albaran.serie,
        numeroAlbaran: albaran.numero,
        usuarioAsignado
      }, { headers });
      
      // Eliminar albarán asignado de la lista
      setAlbaranes(albaranes.filter(a => a.id !== albaran.id));
      
      alert('Albarán asignado correctamente');
    } catch (error) {
      console.error('Error asignando albarán:', error);
      alert('Error al asignar albarán: ' + (error.response?.data?.mensaje || error.message));
    }
  };

  if (cargando) {
    return <div className="cargando">Cargando...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="asignacion-container">
      <h2>Asignar Albaranes a Repartidores</h2>
      
      {albaranes.length === 0 ? (
        <div className="no-albaranes">
          <p>No hay albaranes pendientes de asignación</p>
        </div>
      ) : (
        <table className="tabla-asignacion">
          <thead>
            <tr>
              <th>Albarán</th>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Artículos</th>
              <th>Asignar a</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {albaranes.map(albaran => (
              <tr key={albaran.id}>
                <td>{albaran.albaran}</td>
                <td>{albaran.cliente}</td>
                <td>{new Date(albaran.FechaAlbaran).toLocaleDateString()}</td>
                <td>
                  <ul className="lista-articulos">
                    {albaran.articulos.map((articulo, idx) => (
                      <li key={idx}>
                        {articulo.nombre} - {articulo.cantidad} und
                      </li>
                    ))}
                  </ul>
                </td>
                <td>
                  <select 
                    value={asignaciones[albaran.id] || ''}
                    onChange={(e) => setAsignaciones({
                      ...asignaciones,
                      [albaran.id]: e.target.value
                    })}
                    className="selector-repartidor"
                  >
                    <option value="">Seleccionar repartidor</option>
                    {empleados.map(emp => (
                      <option key={emp.CodigoCliente} value={emp.UsuarioLogicNet}>
                        {emp.Nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button 
                    onClick={() => handleAsignar(albaran)}
                    className="btn-asignar"
                  >
                    Asignar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AsignacionAlbaranesScreen;