﻿import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import '../styles/GestionRutas.css';

function GestionRutas() {
  const navigate = useNavigate();
  const [albaranes, setAlbaranes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const { 
    canViewWaybills, 
    canPerformActions,
    isReadOnly
  } = usePermissions();
  
  if (!canViewWaybills) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    const fetchAlbaranes = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const headers = getAuthHeader();
        
        if (!headers.usuario || !headers.codigoempresa) {
          throw new Error('Faltan cabeceras de autenticación. Vuelve a iniciar sesión.');
        }

        const response = await axios.get('http://localhost:3000/albaranesPendientes', { 
          headers: headers 
        });

        // Asegurar que cada artículo tenga cantidadEntregada
        const albaranesConCantidad = response.data.map(albaran => ({
          ...albaran,
          articulos: albaran.articulos.map(articulo => ({
            ...articulo,
            cantidadEntregada: articulo.cantidadEntregada || articulo.cantidad
          }))
        }));

        setAlbaranes(albaranesConCantidad);
      } catch (err) {
        console.error("Error cargando albaranes:", err);
        setError(err.message || 'No se pudieron cargar los albaranes');
      } finally {
        setLoading(false);
      }
    };

    fetchAlbaranes();
  }, []);

  const abrirDetalle = (albaran) => {
    if (!canPerformActions) return;
    navigate('/detalle-albaran', { state: { albaran } });
  };

  const handleCompletarAlbaran = async (albaran) => {
    try {
      const response = await axios.post('/completar-albaran', {
        codigoEmpresa: albaran.codigoEmpresa,
        ejercicio: albaran.ejercicio,
        serie: albaran.serie,
        numeroAlbaran: albaran.numero
      }, {
        headers: getAuthHeader()
      });

      // Actualizar la lista de albaranes
      setAlbaranes(prev => prev.filter(a => a.id !== albaran.id));
      alert(`Albarán ${albaran.albaran} marcado como entregado`);
    } catch (error) {
      console.error('Error completando albarán:', error);
      alert(`Error: ${error.response?.data?.mensaje || error.message}`);
    }
  };

  const filteredAlbaranes = albaranes.filter(albaran => {
    const searchLower = searchTerm.toLowerCase();
    return (
      albaran.albaran.toLowerCase().includes(searchLower) ||
      (albaran.obra && albaran.obra.toLowerCase().includes(searchLower)) ||
      (albaran.direccion && albaran.direccion.toLowerCase().includes(searchLower)) ||
      (albaran.cliente && albaran.cliente.toLowerCase().includes(searchLower)) ||
      (albaran.contacto && albaran.contacto.toLowerCase().includes(searchLower)) ||
      (albaran.telefonoContacto && albaran.telefonoContacto.includes(searchTerm)) ||
      (albaran.vendedor && albaran.vendedor.toLowerCase().includes(searchLower))
    );
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentAlbaranes = filteredAlbaranes.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredAlbaranes.length / itemsPerPage);

  return (
    <div className="gestion-rutas-screen">
      <div className="rutas-content">
        <div className="rutas-header">
          <h2>Gestión de Rutas</h2>
          <div className="permiso-indicator">
            {isReadOnly ? (
              <span className="permiso-readonly">Solo lectura</span>
            ) : canPerformActions ? (
              <span className="permiso-full">Acceso completo</span>
            ) : (
              <span className="permiso-limited">Acceso limitado</span>
            )}
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

        {!loading && albaranes.length === 0 && (
          <div className="no-albaranes">
            <p>No hay albaranes pendientes de entrega</p>
          </div>
        )}

        <div className="albaranes-grid">
          {currentAlbaranes.map((albaran) => (
            <div 
              key={`${albaran.id}-${albaran.albaran}`} 
              className={`ruta-card ${albaran.esAntiguo ? 'albaran-antiguo' : ''} ${canPerformActions ? 'clickable' : ''}`}
              onClick={() => abrirDetalle(albaran)}
            >
              <div className="card-header">
                <h4>Albarán: {albaran.albaran}</h4>
                {albaran.esAntiguo && (
                  <span className="antiguo-badge">Antiguo</span>
                )}
                <span className="fecha-albaran">
                  {new Date(albaran.FechaAlbaran).toLocaleDateString('es-ES')}
                </span>
              </div>
              
              <div className="card-body">
                <p className="vendedor-info">
                  <span className="icon">👤</span> 
                  <strong>Vendedor:</strong> {albaran.vendedor || 'No especificado'}
                </p>
                <p className="obra-info">
                  <span className="icon">🏗️</span> 
                  <strong>Obra:</strong> {albaran.obra || 'No especificada'}
                </p>
                <p className="contacto-info">
                  <span className="icon">📇</span> 
                  <strong>Contacto:</strong> {albaran.contacto || 'No especificado'}
                </p>
                <p className="telefono-info">
                  <span className="icon">📞</span> 
                  <strong>Teléfono:</strong> {albaran.telefonoContacto || 'No especificado'}
                </p>
                
                <div className="articulos-list">
                  <strong>Artículos a entregar:</strong>
                  <ul>
                    {albaran.articulos.slice(0, 3).map((art, idx) => (
                      <li key={idx}>
                        {art.nombre} - {art.cantidad} uds
                      </li>
                    ))}
                  </ul>
                  {albaran.articulos.length > 3 && (
                    <p className="more-items">+ {albaran.articulos.length - 3} artículos más...</p>
                  )}
                </div>
              </div>
              
              <div className="card-footer">
                <div className="importe-info">
                  <span>Importe:</span>
                  <span className="importe-valor">{albaran.importeLiquido?.toFixed(2)} €</span>
                </div>
                <div className="articulos-info">
                  <span>Artículos:</span>
                  <span className="articulos-count">
                    {albaran.articulos?.length || 0}
                  </span>
                </div>
                
                {canPerformActions && (
                  <button 
                    className="completar-btn"
                    onClick={(e) => {
                      e.stopPropagation(); // Evitar que se abra el detalle
                      handleCompletarAlbaran(albaran);
                    }}
                  >
                    <span className="icon">✓</span> Marcar como entregado
                  </button>
                )}
              </div>
              
              {!canPerformActions && (
                <div className="view-only-overlay">
                  Solo lectura
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <Navbar />
    </div>
  );
}

export default GestionRutas;