﻿import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import '../styles/GestionRutas.css';
import { FaSearch, FaBox, FaExclamationTriangle, FaSync, FaCheck } from 'react-icons/fa';

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
  
  const fetchAlbaranes = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const headers = getAuthHeader();
      const response = await axios.get('http://localhost:3000/albaranesPendientes', { 
        headers
      });

      // Procesar para incluir albaranes parciales y voluminosos
      const processedAlbaranes = response.data.map(albaran => ({
        ...albaran,
        repartidor: albaran.empleadoAsignado || 'Sin asignar',
        esParcial: albaran.EstadoPedido === 4, // Estado 4 = Parcial
        esVoluminoso: albaran.EsVoluminoso // ✅ NUEVO: Campo voluminoso
      }));

      setAlbaranes(processedAlbaranes);
    } catch (err) {
      console.error("Error cargando albaranes:", err);
      setError('Error al cargar albaranes: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canViewGestionRutas) {
      navigate('/');
      return;
    }
    fetchAlbaranes();
  }, [canViewGestionRutas, navigate]);

  // Filtrar albaranes por búsqueda y por usuario (si es repartidor)
  const albaranesFiltrados = albaranes
    .filter(albaran => isDelivery ? albaran.empleadoAsignado === user.UsuarioLogicNet : true)
    .filter(albaran => albaran.FormaEntrega === 3)  // Solo nuestros medios
    .filter(albaran => {
      const searchLower = searchTerm.toLowerCase();
      return (
        albaran.albaran?.toLowerCase().includes(searchLower) ||
        (albaran.obra && albaran.obra.toLowerCase().includes(searchLower)) ||
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
    
    // Opcional: Pedir observaciones al usuario
    const observaciones = prompt('¿Alguna observación sobre la entrega? (Opcional)') || '';
    
    if (!window.confirm(`¿Estás seguro de que quieres marcar el albarán ${albaran.albaran} como entregado?`)) {
      return;
    }
    
    try {
      const response = await axios.post(
        'http://localhost:3000/completar-albaran',
        {
          codigoEmpresa: albaran.codigoEmpresa,
          ejercicio: albaran.ejercicio,
          serie: albaran.serie,
          numeroAlbaran: albaran.numero,
          observaciones: observaciones
        },
        { headers: getAuthHeader() }
      );

      if (response.data.success) {
        // Actualizar la lista
        setAlbaranes(prev => prev.filter(a => 
          !(a.numero === albaran.numero && a.serie === albaran.serie && a.ejercicio === albaran.ejercicio)
        ));
        
        alert(`Albarán ${albaran.albaran} marcado como entregado correctamente`);
      } else {
        alert(`Error: ${response.data.mensaje}`);
      }
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

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    fetchAlbaranes();
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
          <h3>Entregas Asignadas a Tu Ruta (Solo Nuestros Medios)</h3>
        </div>

        <div className="search-and-pagination">
          <div className="search-bar">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por albarán, obra, cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
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
        
        {error && (
          <div className="error-message">
            <FaExclamationTriangle className="error-icon" />
            <p>{error}</p>
            <button onClick={handleRetry} className="retry-btn">
              <FaSync /> Reintentar
            </button>
          </div>
        )}

        {!loading && !error && albaranesFiltrados.length === 0 && (
          <div className="no-albaranes">
            <p>No hay albaranes pendientes de entrega (solo nuestros medios)</p>
          </div>
        )}

        <div className="albaranes-grid">
          {currentAlbaranes.map((albaran) => (
            <div 
              key={`${albaran.ejercicio}-${albaran.serie}-${albaran.numero}`} 
              className={`ruta-card ${albaran.esParcial ? 'albaran-parcial' : ''} ${albaran.esVoluminoso ? 'albaran-voluminoso' : ''}`}
              onClick={() => canPerformActionsInRutas && navigate('/detalle-albaran', { state: { albaran } })}
            >
              <div className="card-header">
                <h4>Albarán: {albaran.albaran}</h4>
                <div className="badges-container">
                  {albaran.esParcial && <span className="parcial-badge">Parcial</span>}
                  {albaran.esVoluminoso && (
                    <span className="voluminoso-badge">
                      <FaBox /> Voluminoso
                    </span>
                  )}
                </div>
                <span className="fecha-albaran">
                  {formatFecha(albaran.FechaAlbaran)}
                </span>
              </div>
              
              <div className="card-body">
                <p className="cliente-info">
                  <strong>Cliente:</strong> {albaran.cliente}
                </p>
                {albaran.obra && (
                  <p className="obra-info">
                    <strong>Obra:</strong> {albaran.obra}
                  </p>
                )}
                <p className="contacto-info">
                  <strong>Contacto:</strong> {albaran.contacto || 'No especificado'}
                </p>
                <p className="telefono-info">
                  <strong>Teléfono:</strong> {albaran.telefonoContacto || 'No especificado'}
                </p>
                
                <div className="asignado-info">
                  <strong>Repartidor asignado:</strong> 
                  {albaran.repartidor || 'Sin asignar'}
                </div>

                <div className="forma-entrega-info">
                  <strong>Forma de entrega:</strong> Nuestros medios
                </div>

                {albaran.articulos && albaran.articulos.length > 0 && (
                  <div className="articulos-info">
                    <strong>Artículos:</strong>
                    <div className="articulos-list">
                      {albaran.articulos.slice(0, 3).map((articulo, index) => (
                        <div key={index} className="articulo-item">
                          {articulo.nombre} - {articulo.cantidad} unidades
                        </div>
                      ))}
                      {albaran.articulos.length > 3 && (
                        <div className="mas-articulos">
                          +{albaran.articulos.length - 3} más...
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
                    <FaCheck /> Marcar como entregado
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="pagination-bottom">
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
          </div>
        )}
      </div>
      <Navbar />
    </div>
  );
}

export default GestionRutas;