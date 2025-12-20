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
  FaBuilding,
  FaUser,
  FaPhone,
  FaMapMarkerAlt
} from 'react-icons/fa';

function GestionRutas() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));
  const [albaranes, setAlbaranes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const itemsPerPage = 10;
  
  // Estados para los filtros de búsqueda
  const [filtros, setFiltros] = useState({
    numeroAlbaran: '',
    nombreObra: '',
    repartidor: '',
    cliente: '',
    contacto: '',
    telefono: '',
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
        esVoluminoso: albaran.EsVoluminoso || albaran.EsVoluminosoPedido,
        // Normalizar campos para búsqueda
        albaranLower: albaran.albaran?.toLowerCase() || '',
        nombreObraLower: (albaran.nombreObra || albaran.obra || '').toLowerCase(),
        repartidorLower: (albaran.empleadoAsignado || '').toLowerCase(),
        clienteLower: (albaran.cliente || '').toLowerCase(),
        contactoLower: (albaran.contacto || '').toLowerCase(),
        telefonoLower: (albaran.telefonoContacto || '').toString().toLowerCase(),
        municipioLower: (albaran.municipio || '').toLowerCase()
      }));

      setAlbaranes(processedAlbaranes);
      setCurrentPage(1);
    } catch (err) {
      console.error("Error cargando albaranes:", err);
      setError('Error al cargar albaranes: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!canViewGestionRutas) {
      navigate('/');
      return;
    }
    fetchAlbaranes();
  }, [canViewGestionRutas, navigate, fetchAlbaranes]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAlbaranes();
  };

  // Filtrar albaranes con useMemo para mejor rendimiento
  const albaranesFiltrados = useMemo(() => {
    let filtered = albaranes.filter(albaran => 
      isDelivery ? albaran.empleadoAsignado === user?.UsuarioLogicNet : true
    );

    // Búsqueda general
    if (filtros.busquedaGeneral) {
      const searchLower = filtros.busquedaGeneral.toLowerCase().trim();
      filtered = filtered.filter(albaran => 
        albaran.albaranLower.includes(searchLower) ||
        albaran.nombreObraLower.includes(searchLower) ||
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

    if (filtros.cliente) {
      const searchCliente = filtros.cliente.toLowerCase().trim();
      filtered = filtered.filter(albaran => 
        albaran.clienteLower.includes(searchCliente)
      );
    }

    if (filtros.contacto) {
      const searchContacto = filtros.contacto.toLowerCase().trim();
      filtered = filtered.filter(albaran => 
        albaran.contactoLower.includes(searchContacto)
      );
    }

    if (filtros.telefono) {
      const searchTelefono = filtros.telefono.toLowerCase().trim();
      filtered = filtered.filter(albaran => 
        albaran.telefonoLower.includes(searchTelefono)
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
    if (!canPerformActionsInRutas) {
      alert('No tienes permiso para completar albaranes');
      return;
    }
    
    // Verificar que el albarán esté asignado al usuario actual si es repartidor
    if (isDelivery && albaran.empleadoAsignado !== user?.UsuarioLogicNet) {
      alert('Solo puedes completar albaranes asignados a ti');
      return;
    }
    
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
        // Actualizar lista eliminando el albarán completado
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
      nombreObra: '',
      repartidor: '',
      cliente: '',
      contacto: '',
      telefono: '',
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

  const getEstadoText = (estadoPedido) => {
    switch(estadoPedido) {
      case 4: return 'Parcial';
      case 2: return 'Servido';
      case 1: return 'Completado';
      case 0: return 'Pendiente';
      default: return 'Desconocido';
    }
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
          <div className="rutas-title">
            <h2>Gestión de Rutas</h2>
            <div className="permiso-indicator">
              {isDelivery ? 'Repartidor' : canPerformActionsInRutas ? 'Acceso completo' : 'Acceso limitado'}
            </div>
          </div>
          <button 
            onClick={handleRefresh} 
            className="refresh-btn"
            disabled={refreshing || loading}
          >
            <FaSync className={refreshing ? 'refresh-spin' : ''} />
            {refreshing ? ' Actualizando...' : ' Actualizar'}
          </button>
        </div>

        <div className="subtitle-container">
          <h3>Albaranes Pendientes de Entrega (Solo Nuestros Medios)</h3>
          {isDelivery && (
            <p className="user-notice">
              <FaUser /> Solo ves los albaranes asignados a tu usuario
            </p>
          )}
        </div>

        {/* Panel de filtros */}
        <div className="filters-panel">
          <div className="filters-header">
            <FaFilter className="filter-icon" />
            <h4>Filtros de búsqueda</h4>
            {getActiveFiltersCount() > 0 && (
              <span className="active-filters-badge">
                {getActiveFiltersCount()} filtro{getActiveFiltersCount() !== 1 ? 's' : ''}
              </span>
            )}
            <button 
              onClick={resetFilters} 
              className="clear-filters-btn"
              disabled={getActiveFiltersCount() === 0}
            >
              <FaTimes /> Limpiar filtros
            </button>
          </div>
          
          {/* Búsqueda general */}
          <div className="search-bar">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Busqueda general: albarán, obra, cliente, contacto, teléfono, municipio..."
              value={filtros.busquedaGeneral}
              onChange={(e) => handleFilterChange('busquedaGeneral', e.target.value)}
            />
          </div>
          
          {/* Filtros específicos */}
          <div className="filters-grid">
            <div className="filter-group">
              <label>
                <FaSearch /> Número de Albarán
              </label>
              <input
                type="text"
                placeholder="Ej: ALB-2024-00123"
                value={filtros.numeroAlbaran}
                onChange={(e) => handleFilterChange('numeroAlbaran', e.target.value)}
              />
            </div>
            
            <div className="filter-group">
              <label>
                <FaBuilding /> Nombre de Obra
              </label>
              <input
                type="text"
                placeholder="Buscar por obra"
                value={filtros.nombreObra}
                onChange={(e) => handleFilterChange('nombreObra', e.target.value)}
              />
            </div>
            
            <div className="filter-group">
              <label>
                <FaUser /> Cliente
              </label>
              <input
                type="text"
                placeholder="Buscar por cliente"
                value={filtros.cliente}
                onChange={(e) => handleFilterChange('cliente', e.target.value)}
              />
            </div>
            
            <div className="filter-group">
              <label>
                <FaUser /> Contacto
              </label>
              <input
                type="text"
                placeholder="Buscar por contacto"
                value={filtros.contacto}
                onChange={(e) => handleFilterChange('contacto', e.target.value)}
              />
            </div>
            
            <div className="filter-group">
              <label>
                <FaPhone /> Teléfono
              </label>
              <input
                type="text"
                placeholder="Buscar por teléfono"
                value={filtros.telefono}
                onChange={(e) => handleFilterChange('telefono', e.target.value)}
              />
            </div>
            
            {!isDelivery && (
              <div className="filter-group">
                <label>
                  <FaUser /> Repartidor
                </label>
                <input
                  type="text"
                  placeholder="Buscar por repartidor"
                  value={filtros.repartidor}
                  onChange={(e) => handleFilterChange('repartidor', e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="search-and-pagination">
          <div className="pagination-controls">
            <button 
              disabled={currentPage === 1 || totalPages === 0}
              onClick={() => setCurrentPage(currentPage - 1)}
              className="pagination-btn"
            >
              &lt;
            </button>
            <span className="pagination-info">
              {totalPages === 0 
                ? '0 resultados' 
                : `Página ${currentPage} de ${totalPages} (${albaranesFiltrados.length} resultados)`
              }
            </span>
            <button 
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(currentPage + 1)}
              className="pagination-btn"
            >
              &gt;
            </button>
          </div>
          
          <div className="view-info">
            {isDelivery ? (
              <span className="delivery-view">
                <FaUser /> Vista de repartidor: solo tus albaranes
              </span>
            ) : (
              <span className="admin-view">
                Vista completa: todos los albaranes
              </span>
            )}
          </div>
        </div>

        {loading && !refreshing && (
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
                <button onClick={resetFilters} className="clear-filters-small">
                  Limpiar filtros
                </button>
              </>
            ) : albaranes.length === 0 ? (
              <p>No hay albaranes pendientes de entrega</p>
            ) : isDelivery ? (
              <p>No tienes albaranes asignados actualmente</p>
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
              onClick={() => navigate('/detalle-albaran', { state: { albaran } })}
            >
              <div className="card-header">
                <div className="card-header-top">
                  <div className="card-title-section">
                    <h4>Albarán: {albaran.albaran}</h4>
                    <div className="card-badges">
                      {albaran.esParcial && (
                        <span className="badge badge-parcial">Parcial</span>
                      )}
                      {albaran.esVoluminoso && (
                        <span className="badge badge-voluminoso">
                          <FaBox /> Voluminoso
                        </span>
                      )}
                      <span className="estado-badge estado-{getEstadoText(albaran.EstadoPedido).toLowerCase()}">
                        {getEstadoText(albaran.EstadoPedido)}
                      </span>
                    </div>
                  </div>
                  <span className="fecha-albaran">
                    {formatFecha(albaran.FechaAlbaran)}
                  </span>
                </div>
              </div>
              
              <div className="card-body">
                <div className="info-row">
                  <strong>Cliente:</strong>
                  <span>{albaran.cliente}</span>
                </div>
                
                {albaran.nombreObra && (
                  <div className="info-row">
                    <strong>Obra:</strong>
                    <span>{albaran.nombreObra}</span>
                  </div>
                )}
                
                {albaran.municipio && (
                  <div className="info-row">
                    <strong><FaMapMarkerAlt /> Municipio:</strong>
                    <span>{albaran.municipio}</span>
                  </div>
                )}
                
                <div className="info-row">
                  <strong>Contacto:</strong>
                  <span>{albaran.contacto || 'No especificado'}</span>
                </div>
                
                <div className="info-row">
                  <strong><FaPhone /> Teléfono:</strong>
                  <span>{albaran.telefonoContacto || 'No especificado'}</span>
                </div>
                
                <div className="info-row">
                  <strong>Repartidor:</strong>
                  <span className={albaran.empleadoAsignado ? 'repartidor-asignado' : 'sin-repartidor'}>
                    {albaran.repartidor}
                  </span>
                </div>

                {albaran.articulos && albaran.articulos.length > 0 && (
                  <div className="articulos-section">
                    <strong>Artículos ({albaran.articulos.length}):</strong>
                    <div className="articulos-list">
                      {albaran.articulos.slice(0, 3).map((articulo, index) => (
                        <div key={index} className="articulo-item">
                          <span className="articulo-nombre">{articulo.nombre}</span>
                          <span className="articulo-cantidad">{articulo.cantidad} uds</span>
                        </div>
                      ))}
                      {albaran.articulos.length > 3 && (
                        <div className="articulo-mas">
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
                      disabled={isDelivery && albaran.empleadoAsignado !== user?.UsuarioLogicNet}
                      title={isDelivery && albaran.empleadoAsignado !== user?.UsuarioLogicNet ? 
                        "Solo puedes completar tus albaranes" : 
                        "Marcar como entregado"}
                    >
                      <FaCheck /> Marcar como entregado
                    </button>
                    
                    <button 
                      className="detalle-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/detalle-albaran', { state: { albaran } });
                      }}
                    >
                      Ver detalle completo
                    </button>
                  </>
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
                className="pagination-btn"
              >
                &lt;
              </button>
              <span className="pagination-info">Página {currentPage} de {totalPages}</span>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                className="pagination-btn"
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