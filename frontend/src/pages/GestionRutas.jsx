﻿import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import '../styles/GestionRutas.css';

function GestionRutas() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));
  const [albaranes, setAlbaranes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const { 
    canViewGestionRutas,
    canPerformActionsInRutas,
    isDelivery
  } = usePermissions();
  
  useEffect(() => {
    if (!canViewGestionRutas) {
      navigate('/');
      return;
    }

    const fetchAlbaranes = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const headers = getAuthHeader();
        const response = await axios.get('http://localhost:3000/albaranesPendientes', { 
          headers
        });

        const processedAlbaranes = response.data.map(albaran => ({
          ...albaran,
          repartidor: albaran.empleadoAsignado || 'Sin asignar'
        }));

        setAlbaranes(processedAlbaranes);
      } catch (err) {
        console.error("Error cargando albaranes:", err);
        setError('Error al cargar albaranes: ' + (err.response?.data?.mensaje || err.message));
      } finally {
        setLoading(false);
      }
    };

    fetchAlbaranes();
  }, [canViewGestionRutas, navigate]);

  // Filtrar albaranes por búsqueda y por usuario (si es repartidor)
  const albaranesFiltrados = albaranes
    .filter(albaran => isDelivery ? albaran.empleadoAsignado === user.UsuarioLogicNet : true)
    .filter(albaran => {
      const searchLower = searchTerm.toLowerCase();
      return (
        albaran.albaran?.toLowerCase().includes(searchLower) ||
        (albaran.obra && albaran.obra.toLowerCase().includes(searchLower)) ||
        (albaran.direccion && albaran.direccion.toLowerCase().includes(searchLower)) ||
        (albaran.cliente && albaran.cliente.toLowerCase().includes(searchLower)) ||
        (albaran.contacto && albaran.contacto.toLowerCase().includes(searchLower)) ||
        (albaran.telefonoContacto && albaran.telefonoContacto.includes(searchTerm)) ||
        (albaran.repartidor && albaran.repartidor.toLowerCase().includes(searchLower))
      );
    });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentAlbaranes = albaranesFiltrados.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(albaranesFiltrados.length / itemsPerPage);

  const handleCompletarAlbaran = async (albaran) => {
    if (!canPerformActionsInRutas) return;
    
    try {
      await axios.post(
        'http://localhost:3000/completar-albaran',
        {
          codigoEmpresa: albaran.codigoEmpresa,
          ejercicio: albaran.ejercicio,
          serie: albaran.serie,
          numeroAlbaran: albaran.numero
        },
        { headers: getAuthHeader() }
      );

      // Actualizar la lista
      setAlbaranes(prev => prev.filter(a => 
        !(a.numero === albaran.numero && a.serie === albaran.serie && a.ejercicio === albaran.ejercicio)
      ));
    } catch (error) {
      console.error('Error completando albarán:', error);
      alert(`Error: ${error.response?.data?.mensaje || error.message}`);
    }
  };

  // Formatear fecha
  const formatFecha = (fechaString) => {
    const fecha = new Date(fechaString);
    return fecha.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="gestion-rutas-screen">
      <div className="rutas-content">
        <div className="rutas-header">
          <h2>Gestión de Rutas</h2>
          <div className="permiso-indicator">
            {canPerformActionsInRutas ? 'Acceso completo' : 'Acceso limitado'}
          </div>
        </div>

        <div className="subtitle-container">
          <h3>Entregas Asignadas a Tu Ruta</h3>
        </div>

        <div className="search-and-pagination">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Buscar por albarán, obra, dirección, cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <span className="search-icon">🔍</span>
          </div>
          
          {totalPages > 1 && (
            <div className="pagination-controls">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                &lt;
              </button>
              <span>Página {currentPage} de {totalPages}</span>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                &gt;
              </button>
            </div>
          )}
        </div>

        {loading && (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Cargando albaranes...</p>
          </div>
        )}
        
        {error && <div className="error-message">{error}</div>}

        {!loading && albaranesFiltrados.length === 0 && (
          <div className="no-albaranes">
            <p>No hay albaranes pendientes de entrega</p>
          </div>
        )}

        <div className="albaranes-grid">
          {currentAlbaranes.map((albaran) => (
            <div 
              key={`${albaran.ejercicio}-${albaran.serie}-${albaran.numero}`} 
              className="ruta-card"
              onClick={() => canPerformActionsInRutas && navigate('/detalle-albaran', { state: { albaran } })}
            >
              <div className="card-header">
                <h4>Albarán: {albaran.albaran}</h4>
                <span className="fecha-albaran">
                  {formatFecha(albaran.FechaAlbaran)}
                </span>
              </div>
              
              <div className="card-body">
                <p className="cliente-info">
                  <span className="icon">👤</span> 
                  <strong>Cliente:</strong> {albaran.cliente}
                </p>
                {albaran.obra && (
                  <p className="obra-info">
                    <span className="icon">🏗️</span> 
                    <strong>Obra:</strong> {albaran.obra}
                  </p>
                )}
                <p className="direccion-info">
                  <span className="icon">📍</span> 
                  <strong>Dirección:</strong> {albaran.direccion}
                </p>
                <p className="contacto-info">
                  <span className="icon">📇</span> 
                  <strong>Contacto:</strong> {albaran.contacto || 'No especificado'}
                </p>
                <p className="telefono-info">
                  <span className="icon">📞</span> 
                  <strong>Teléfono:</strong> {albaran.telefonoContacto || 'No especificado'}
                </p>
                
                <div className="asignado-info">
                  <span className="icon">🚚</span>
                  <strong>Repartidor asignado:</strong> 
                  {albaran.repartidor || 'Sin asignar'}
                </div>
              </div>
              
              <div className="card-footer">
                {canPerformActionsInRutas && (
                  <button 
                    className="completar-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCompletarAlbaran(albaran);
                    }}
                  >
                    <span className="icon">✓</span> Marcar como entregado
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Navbar />
    </div>
  );
}

export default GestionRutas;