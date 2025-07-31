import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import { usePermissions } from '../PermissionsManager';
import '../styles/AlbaranesAsignadosScreen.css';

const AlbaranesAsignadosScreen = () => {
  const [albaranes, setAlbaranes] = useState([]);
  const [preparadores, setPreparadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState({});
  
  const { canAssignWaybills } = usePermissions();
  
  if (!canAssignWaybills) {
    return <div className="no-permission">No tienes permiso para acceder a esta sección</div>;
  }

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setLoading(true);
        
        const [albaranesRes, preparadoresRes] = await Promise.all([
          axios.get('/albaranesPendientes?todos=true', { headers: getAuthHeader() }),
          axios.get('/empleados-preparadores', { headers: getAuthHeader() })
        ]);
        
        setAlbaranes(albaranesRes.data);
        setPreparadores(preparadoresRes.data);
        
        // Inicializar estado de guardado
        const initialSaveStatus = {};
        albaranesRes.data.forEach(albaran => {
          initialSaveStatus[albaran.id] = { 
            status: 'idle', 
            message: '' 
          };
        });
        setSaveStatus(initialSaveStatus);
      } catch (error) {
        console.error('Error cargando datos:', error);
      } finally {
        setLoading(false);
      }
    };
    
    cargarDatos();
  }, []);

  const handleAsignacionChange = async (albaran, nuevoUsuario) => {
    try {
      setSaving(true);
      setSaveStatus(prev => ({
        ...prev,
        [albaran.id]: { status: 'saving', message: 'Guardando...' }
      }));
      
      await axios.put('/actualizar-asignacion-albaran', 
        {
          codigoEmpresa: albaran.codigoEmpresa,
          ejercicio: albaran.ejercicio,
          serie: albaran.serie,
          numeroAlbaran: albaran.numero,
          usuarioAsignado: nuevoUsuario || null
        },
        { headers: getAuthHeader() }
      );
      
      // Actualizar UI
      setAlbaranes(prev => 
        prev.map(a => 
          a.id === albaran.id 
            ? { ...a, usuarioAsignado: nuevoUsuario } 
            : a
        )
      );
      
      setSaveStatus(prev => ({
        ...prev,
        [albaran.id]: { 
          status: 'success', 
          message: 'Guardado ✓',
          timestamp: Date.now()
        }
      }));
      
      // Limpiar mensaje después de 3 segundos
      setTimeout(() => {
        setSaveStatus(prev => ({
          ...prev,
          [albaran.id]: { status: 'idle', message: '' }
        }));
      }, 3000);
    } catch (error) {
      console.error('Error asignando albarán:', error);
      setSaveStatus(prev => ({
        ...prev,
        [albaran.id]: { 
          status: 'error', 
          message: 'Error al guardar',
          error: error.response?.data?.mensaje || error.message
        }
      }));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Cargando albaranes...</div>;

  return (
    <div className="albaranes-asignados-container">
      <h1>Asignación de Albaranes a Preparadores</h1>
      <p className="subtitle">Asigna o cambia el preparador responsable de cada albarán pendiente</p>
      
      <div className="albaranes-table-container">
        <table className="albaranes-table">
          <thead>
            <tr>
              <th>Albarán</th>
              <th>Cliente</th>
              <th>Obra</th>
              <th>Fecha</th>
              <th>Artículos</th>
              <th>Vendedor</th>
              <th>Preparador Asignado</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {albaranes.map(albaran => (
              <tr key={albaran.id} className={albaran.usuarioAsignado ? 'asignado' : 'sin-asignar'}>
                <td>{albaran.albaran}</td>
                <td>{albaran.cliente}</td>
                <td>{albaran.obra || 'N/A'}</td>
                <td>{new Date(albaran.FechaAlbaran).toLocaleDateString('es-ES')}</td>
                <td>{albaran.articulos.length}</td>
                <td>{albaran.vendedor || 'N/A'}</td>
                <td>
                  <div className="asignacion-container">
                    <select
                      value={albaran.usuarioAsignado || ''}
                      onChange={(e) => handleAsignacionChange(albaran, e.target.value || null)}
                      disabled={saving}
                      className="asignacion-select"
                    >
                      <option value="">Sin asignar</option>
                      {preparadores.map(prep => (
                        <option key={prep.UsuarioLogicNet} value={prep.UsuarioLogicNet}>
                          {prep.Nombre} ({prep.UsuarioLogicNet})
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
                <td>
                  <div className={`status-indicator ${saveStatus[albaran.id]?.status || 'idle'}`}>
                    {saveStatus[albaran.id]?.message}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {albaranes.length === 0 && !loading && (
        <div className="no-albaranes">
          <p>No hay albaranes pendientes</p>
        </div>
      )}
    </div>
  );
};

export default AlbaranesAsignadosScreen;