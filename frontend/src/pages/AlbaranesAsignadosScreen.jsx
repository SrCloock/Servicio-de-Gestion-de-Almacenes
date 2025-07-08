// AsignacionAlbaranesScreen.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';

function AsignacionAlbaranesScreen() {
  const [albaranes, setAlbaranes] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      const headers = getAuthHeader();
      
      // Obtener albaranes sin filtrar
      const albResponse = await axios.get(
        'http://localhost:3000/albaranesPendientes?todos=true', 
        { headers }
      );
      
      // Obtener empleados
      const empResponse = await axios.get(
        'http://localhost:3000/empleados', 
        { headers }
      );
      
      setAlbaranes(albResponse.data);
      setEmpleados(empResponse.data);
    };
    
    fetchData();
  }, []);

  const handleAsignar = async (albaranId) => {
    const usuarioAsignado = asignaciones[albaranId];
    
    try {
      const headers = getAuthHeader();
      await axios.post('http://localhost:3000/asignarAlbaran', {
        numeroAlbaran: albaranId,
        usuarioAsignado
      }, { headers });
      
      alert('Asignación guardada');
    } catch (error) {
      alert('Error al guardar asignación');
    }
  };

  return (
    <div className="asignacion-container">
      <h2>Asignar Albaranes</h2>
      
      <table>
        <thead>
          <tr>
            <th>Albarán</th>
            <th>Cliente</th>
            <th>Asignar a</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {albaranes.map(albaran => (
            <tr key={albaran.id}>
              <td>{albaran.albaran}</td>
              <td>{albaran.cliente}</td>
              <td>
                <select 
                  value={asignaciones[albaran.id] || ''}
                  onChange={(e) => setAsignaciones({
                    ...asignaciones,
                    [albaran.id]: e.target.value
                  })}
                >
                  <option value="">Seleccionar</option>
                  {empleados.map(emp => (
                    <option key={emp.CodigoCliente} value={emp.UsuarioLogicNet}>
                      {emp.Nombre}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button onClick={() => handleAsignar(albaran.id)}>
                  Asignar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AsignacionAlbaranesScreen;