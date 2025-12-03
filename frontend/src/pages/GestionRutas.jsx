﻿import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../helpers/api';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import '../styles/GestionRutas.css';
import { 
  FaSearch, 
  FaBox, 
  FaExclamationTriangle, 
  FaSync, 
  FaCheck, 
  FaFilter,
  FaTimes,
  FaMapMarkerAlt,
  FaBuilding
} from 'react-icons/fa';

function GestionRutas() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));
  const [albaranes, setAlbaranes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Estados para los filtros de búsqueda
  const [filtros, setFiltros] = useState({
    numeroAlbaran: '',
    municipio: '',
    nombreObra: '',
    repartidor: '',
    busquedaGeneral: ''
  });
  
  const { 
    canViewGestionRutas,
    canPerformActionsInRutas,
    isDelivery
  } = usePermissions();
  
  const fetchAlbaranes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const headers = getAuthHeader();
      const response = await API.get('/api/albaranesPendientes', { 
        headers
      });

      const processedAlbaranes = response.data.map(albaran => ({
        ...albaran,
        repartidor: albaran.empleadoAsignado || 'Sin asignar',
        esParcial: albaran.EstadoPedido === 4,
        esVoluminoso: albaran.EsVoluminoso,
        // Normalizar campos para búsqueda
        albaranLower: albaran.albaran?.toLowerCase() || '',
        municipioLower: albaran.municipio?.toLowerCase() || '',
        nombreObraLower: (albaran.nombreObra || albaran.obra || '').toLowerCase(),
        repartidorLower: (albaran.empleadoAsignado || '').toLowerCase(),
        clienteLower: (albaran.cliente || '').toLowerCase(),
        contactoLower: (albaran.contacto || '').toLowerCase(),
        telefonoLower: (albaran.telefonoContacto || '').toString()
      }));

      setAlbaranes(processedAlbaranes);
      setCurrentPage(1);
    } catch (err) {
      console.error("Error cargando albaranes:", err);
      setError('Error al cargar albaranes: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canViewGestionRutas) {
      navigate('/');
      return;
    }
    fetchAlbaranes();
  }, [canViewGestionRutas, navigate, fetchAlbaranes]);

  // Filtrar albaranes con useMemo para mejor rendimiento
  const albaranesFiltrados = useMemo(() => {
    let filtered = albaranes.filter(albaran => 
      isDelivery ? albaran.empleadoAsignado === user?.UsuarioLogicNet : true
    ).filter(albaran => 
      albaran.formaentrega === 3
    );

    // Búsqueda general (mismo comportamiento original)
    if (filtros.busquedaGeneral) {
      const searchLower = filtros.busquedaGeneral.toLowerCase().trim();
      filtered = filtered.filter(albaran => 
        albaran.albaranLower.includes(searchLower) ||
        albaran.nombreObraLower.includes(searchLower) ||
        (albaran.obra && albaran.obra.toLowerCase().includes(searchLower)) ||
        albaran.clienteLower.includes(searchLower) ||
        albaran.contactoLower.includes(searchLower) ||
        albaran.telefonoLower.includes(searchLower) ||
        albaran.repartidorLower.includes(searchLower) ||
        albaran.municipioLower.includes(searchLower)
      );
    }

    // Filtros específicos
    if (filtros.numeroAlbaran) {
      const searchNum = filtros.numeroAlbaran.toLowerCase().trim();
      filtered = filtered.filter(albaran => 
        albaran.albaranLower.includes(searchNum)
      );
    }

    if (filtros.municipio) {
      const searchMun = filtros.municipio.toLowerCase().trim();
      filtered = filtered.filter(albaran => 
        albaran.municipioLower.includes(searchMun)
      );
    }

    if (filtros.nombreObra) {
      const searchObra = filtros.nombreObra.toLowerCase().trim();
      filtered = filtered.filter(albaran => 
        albaran.nombreObraLower.includes(searchObra)
      );
    }

    if (filtros.repartidor) {
      const searchRep = filtros.repartidor.toLowerCase().trim();
      filtered = filtered.filter(albaran => 
        albaran.repartidorLower.includes(searchRep)
      );
    }

    return filtered;
  }, [albaranes, isDelivery, user, filtros]);

  const currentAlbaranes = useMemo(() => {
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    return albaranesFiltrados.slice(indexOfFirstItem, indexOfLastItem);
  }, [albaranesFiltrados, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(albaranesFiltrados.length / itemsPerPage);

  const handleCompletarAlbaran = async (albaran) => {
    if (!canPerformActionsInRutas) return;
    
    const observaciones = prompt('¿Alguna observación sobre la entrega? (Opcional)') || '';
    
    if (!window.confirm(`¿Estás seguro de que quieres marcar el albarán ${albaran.albaran} como entregado?`)) {
      return;
    }
    
    try {
      const response = await API.post(
        '/api/completar-albaran',
        {
          codigoEmpresa: albaran.codigoEmpresa,
          ejercicio: albaran.ejercicio,
          serie: albaran.serie,
          numeroAlbaran: albaran.numero,
          observaciones: observaciones
        });

      if (response.data.success) {
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

  const handleFilterChange = (filterName, value) => {
    setFiltros(prev => ({
      ...prev,
      [filterName]: value
    }));
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setFiltros({
      numeroAlbaran: '',
      municipio: '',
      nombreObra: '',
      repartidor: '',
      busquedaGeneral: ''
    });
    setCurrentPage(1);
  };

  const formatFecha = (fechaString) => {
    if (!fechaString) return 'Fecha no disponible';
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

  const getActiveFiltersCount = () => {
    const { busquedaGeneral, ...specificFilters } = filtros;
    return Object.values(specificFilters).filter(value => value.trim() !== '').length;
  };

  if (!canViewGestionRutas) {
    return (
      <div className="gestion-rutas-screen">
        <div className="no-permission">
          <h2>Acceso restringido</h2>
          <p>No tienes permiso para acceder a esta sección.</p>
          <button onClick={() => navigate('/')} className="btn-volver">
            Volver al inicio
          </button>
        </div>
        <Navbar />
      </div>
    );
  }

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

        {/* Panel de filtros */}
        <div className="filters-panel" style={{
          backgroundColor: 'var(--light-bg)',
          borderRadius: 'var(--border-radius)',
          padding: '20px',
          marginBottom: '25px',
          boxShadow: 'var(--shadow)',
          border: '1px solid var(--gray-300)'
        }}>
          <div className="filters-header" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px',
            paddingBottom: '10px',
            borderBottom: '2px solid var(--gray-200)'
          }}>
            <FaFilter style={{ color: 'var(--primary-color)' }} />
            <h4 style={{ margin: 0, color: 'var(--dark-text)' }}>Filtros de búsqueda</h4>
            {getActiveFiltersCount() > 0 && (
              <span style={{
                background: 'var(--accent-color)',
                color: 'white',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}>
                {getActiveFiltersCount()} filtro{getActiveFiltersCount() !== 1 ? 's' : ''} activo{getActiveFiltersCount() !== 1 ? 's' : ''}
              </span>
            )}
            <button 
              onClick={resetFilters} 
              style={{
                marginLeft: 'auto',
                padding: '8px 15px',
                background: 'var(--gray-700)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.9rem',
                opacity: getActiveFiltersCount() === 0 ? 0.5 : 1
              }}
              disabled={getActiveFiltersCount() === 0}
            >
              <FaTimes /> Limpiar filtros
            </button>
          </div>
          
          {/* Búsqueda general */}
          <div className="search-bar" style={{ marginBottom: '20px' }}>
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Busqueda general: albarán, obra, cliente, contacto..."
              value={filtros.busquedaGeneral}
              onChange={(e) => handleFilterChange('busquedaGeneral', e.target.value)}
            />
          </div>
          
          {/* Filtros específicos */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '15px'
          }}>
            <div className="filter-group">
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: '600',
                color: 'var(--gray-700)',
                fontSize: '0.9rem',
                marginBottom: '5px'
              }}>
                <FaSearch /> Número de Albarán
              </label>
              <input
                type="text"
                placeholder="Ej: ALB-2024-00123"
                value={filtros.numeroAlbaran}
                onChange={(e) => handleFilterChange('numeroAlbaran', e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 15px',
                  border: '2px solid var(--gray-300)',
                  borderRadius: '6px',
                  fontSize: '0.95rem',
                  transition: 'border-color 0.2s'
                }}
              />
            </div>
            
            <div className="filter-group">
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: '600',
                color: 'var(--gray-700)',
                fontSize: '0.9rem',
                marginBottom: '5px'
              }}>
                <FaMapMarkerAlt /> Municipio
              </label>
              <input
                type="text"
                placeholder="Buscar por municipio"
                value={filtros.municipio}
                onChange={(e) => handleFilterChange('municipio', e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 15px',
                  border: '2px solid var(--gray-300)',
                  borderRadius: '6px',
                  fontSize: '0.95rem',
                  transition: 'border-color 0.2s'
                }}
              />
            </div>
            
            <div className="filter-group">
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: '600',
                color: 'var(--gray-700)',
                fontSize: '0.9rem',
                marginBottom: '5px'
              }}>
                <FaBuilding /> Nombre de Obra
              </label>
              <input
                type="text"
                placeholder="Buscar por obra"
                value={filtros.nombreObra}
                onChange={(e) => handleFilterChange('nombreObra', e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 15px',
                  border: '2px solid var(--gray-300)',
                  borderRadius: '6px',
                  fontSize: '0.95rem',
                  transition: 'border-color 0.2s'
                }}
              />
            </div>
            
            <div className="filter-group">
              <label style={{
                fontWeight: '600',
                color: 'var(--gray-700)',
                fontSize: '0.9rem',
                marginBottom: '5px'
              }}>
                Repartidor
              </label>
              <input
                type="text"
                placeholder="Buscar por repartidor"
                value={filtros.repartidor}
                onChange={(e) => handleFilterChange('repartidor', e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 15px',
                  border: '2px solid var(--gray-300)',
                  borderRadius: '6px',
                  fontSize: '0.95rem',
                  transition: 'border-color 0.2s'
                }}
              />
            </div>
          </div>
        </div>

        <div className="search-and-pagination">
          <div className="pagination-controls">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
            >
              &lt;
            </button>
            <span>Página {currentPage} de {totalPages} ({albaranesFiltrados.length} resultados)</span>
            <button 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(currentPage + 1)}
            >
              &gt;
            </button>
          </div>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <button 
              onClick={fetchAlbaranes} 
              className="refresh-btn"
              disabled={loading}
              style={{
                padding: '10px 20px',
                background: 'var(--success-color)',
                color: 'white',
                border: 'none',
                borderRadius: '30px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <FaSync /> {loading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
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
            {getActiveFiltersCount() > 0 ? (
              <>
                <p>No se encontraron albaranes con los filtros aplicados</p>
                <button onClick={resetFilters} style={{
                  marginTop: '15px',
                  padding: '10px 20px',
                  background: 'var(--gray-700)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}>
                  Limpiar filtros
                </button>
              </>
            ) : (
              <p>No hay albaranes pendientes de entrega (solo nuestros medios)</p>
            )}
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
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  flexWrap: 'wrap'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap'
                  }}>
                    <h4 style={{ margin: 0 }}>Albarán: {albaran.albaran}</h4>
                    <div style={{
                      display: 'flex',
                      gap: '5px',
                      flexWrap: 'wrap'
                    }}>
                      {albaran.esParcial && <span style={{
                        background: '#ff9800',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.8em'
                      }}>Parcial</span>}
                      {albaran.esVoluminoso && (
                        <span className="voluminoso-badge">
                          <FaBox /> Voluminoso
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="fecha-albaran">
                    {formatFecha(albaran.FechaAlbaran)}
                  </span>
                </div>
              </div>
              
              <div className="card-body">
                <div className="cliente-info">
                  <strong style={{ minWidth: '80px', display: 'inline-block' }}>Cliente:</strong>
                  <span style={{ color: 'var(--gray-700)' }}>{albaran.cliente}</span>
                </div>
                
                {(albaran.nombreObra || albaran.obra) && (
                  <div className="obra-info">
                    <strong style={{ minWidth: '80px', display: 'inline-block' }}>Obra:</strong>
                    <span style={{ color: 'var(--gray-700)' }}>{albaran.nombreObra || albaran.obra}</span>
                  </div>
                )}
                
                {albaran.municipio && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '15px' }}>
                    <strong style={{ minWidth: '80px', display: 'inline-block' }}>Municipio:</strong>
                    <span style={{ color: 'var(--gray-700)' }}>{albaran.municipio}</span>
                  </div>
                )}
                
                <div className="contacto-info">
                  <strong style={{ minWidth: '80px', display: 'inline-block' }}>Contacto:</strong>
                  <span style={{ color: 'var(--gray-700)' }}>{albaran.contacto || 'No especificado'}</span>
                </div>
                
                <div className="telefono-info">
                  <strong style={{ minWidth: '80px', display: 'inline-block' }}>Teléfono:</strong>
                  <span style={{ color: 'var(--gray-700)' }}>{albaran.telefonoContacto || 'No especificado'}</span>
                </div>
                
                <div className="asignado-info">
                  <strong style={{ minWidth: '80px', display: 'inline-block' }}>Repartidor:</strong>
                  <span style={{ 
                    color: albaran.repartidor ? 'var(--gray-700)' : 'var(--danger-color)',
                    fontStyle: albaran.repartidor ? 'normal' : 'italic'
                  }}>
                    {albaran.repartidor || 'Sin asignar'}
                  </span>
                </div>

                {albaran.articulos && albaran.articulos.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <strong style={{ display: 'block', marginBottom: '5px' }}>Artículos:</strong>
                    <div style={{ 
                      maxHeight: '80px',
                      overflowY: 'auto',
                      padding: '5px',
                      background: 'var(--gray-100)',
                      borderRadius: '4px'
                    }}>
                      {albaran.articulos.slice(0, 3).map((articulo, index) => (
                        <div key={index} style={{ 
                          fontSize: '0.9rem',
                          padding: '2px 0',
                          borderBottom: '1px solid var(--gray-200)',
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}>
                          <span>{articulo.nombre}</span>
                          <span>{articulo.cantidad} uds</span>
                        </div>
                      ))}
                      {albaran.articulos.length > 3 && (
                        <div style={{ 
                          fontSize: '0.8rem',
                          color: 'var(--gray-500)',
                          padding: '2px 0',
                          textAlign: 'center'
                        }}>
                          +{albaran.articulos.length - 3} más...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="card-footer">
                {canPerformActionsInRutas && (
                  <>
                    <button 
                      className="completar-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCompletarAlbaran(albaran);
                      }}
                    >
                      <FaCheck /> Marcar como entregado
                    </button>
                    
                    <button 
                      className="detalle-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/detalle-albaran', { state: { albaran } });
                      }}
                      style={{
                        width: '100%',
                        marginTop: '10px',
                        padding: '10px 15px',
                        background: 'var(--accent-color)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Ver detalle
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="pagination-bottom" style={{ marginTop: '20px' }}>
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