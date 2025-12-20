import React, { useState, useEffect, useMemo } from 'react';
import API from '../helpers/api';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import '../styles/AlbaranesAsignadosScreen.css';
import { FaSearch, FaFilter, FaTimes, FaSync } from 'react-icons/fa';

function AlbaranesAsignadosScreen() {
  const [albaranes, setAlbaranes] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [asignaciones, setAsignaciones] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  
  // Estados para los filtros de búsqueda
  const [filtroAlbaran, setFiltroAlbaran] = useState('');
  const [filtroObra, setFiltroObra] = useState('');
  const [filtroRepartidor, setFiltroRepartidor] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');

  const permissions = usePermissions();
  const { canAssignWaybills } = permissions;

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const headers = getAuthHeader();
      
      const [albaranesResponse, repartidoresResponse] = await Promise.all([
        API.get('/albaranes-asignacion', { headers }),
        API.get('/repartidores', { headers })
      ]);
      
      // Procesar para incluir albaranes parciales y voluminosos
      const albaranesConStatus = albaranesResponse.data.map(albaran => ({
        ...albaran,
        esParcial: albaran.EstadoPedido === 4,
        esVoluminoso: albaran.EsVoluminoso || albaran.EsVoluminosoPedido,
        repartidorLower: (albaran.repartidorAsignado || '').toLowerCase(),
        albaranLower: (albaran.albaran || '').toLowerCase(),
        obraLower: (albaran.NombreObra || albaran.obra || '').toLowerCase(),
        clienteLower: (albaran.RazonSocial || '').toLowerCase(),
        municipioLower: (albaran.Municipio || '').toLowerCase()
      }));
      
      setAlbaranes(albaranesConStatus);
      setRepartidores(repartidoresResponse.data);
      
      // Inicializar asignaciones
      const initialAsignaciones = {};
      albaranesConStatus.forEach(albaran => {
        const key = `albaran-${albaran.EjercicioAlbaran}-${albaran.SerieAlbaran || ''}-${albaran.NumeroAlbaran}`;
        initialAsignaciones[key] = albaran.repartidorAsignado || '';
      });
      
      setAsignaciones(initialAsignaciones);
      
    } catch (err) {
      setError('Error: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Filtrar albaranes basado en los criterios de búsqueda
  const albaranesFiltrados = useMemo(() => {
    return albaranes.filter(albaran => {
      // Filtro por número de albarán
      const matchAlbaran = !filtroAlbaran || 
        albaran.albaranLower.includes(filtroAlbaran.toLowerCase()) ||
        albaran.NumeroAlbaran.toString().includes(filtroAlbaran);
      
      // Filtro por obra
      const matchObra = !filtroObra || 
        albaran.obraLower.includes(filtroObra.toLowerCase());
      
      // Filtro por cliente
      const matchCliente = !filtroCliente || 
        albaran.clienteLower.includes(filtroCliente.toLowerCase());
      
      // Filtro por repartidor
      const matchRepartidor = !filtroRepartidor || 
        (filtroRepartidor === 'sin-asignar' 
          ? !albaran.repartidorAsignado
          : albaran.repartidorLower.includes(filtroRepartidor.toLowerCase()));
      
      return matchAlbaran && matchObra && matchCliente && matchRepartidor;
    });
  }, [albaranes, filtroAlbaran, filtroObra, filtroCliente, filtroRepartidor]);

  const handleAsignarAlbaran = async (albaran) => {
    const key = `albaran-${albaran.EjercicioAlbaran}-${albaran.SerieAlbaran || ''}-${albaran.NumeroAlbaran}`;
    const repartidorId = asignaciones[key];
    
    if (!repartidorId) {
      alert('Selecciona un repartidor');
      return;
    }

    if (repartidorId === albaran.repartidorAsignado) {
      alert('Este albarán ya está asignado a este repartidor');
      return;
    }

    try {
      const headers = getAuthHeader();
      const response = await API.post(
        '/asignarAlbaranExistente',
        {
          codigoEmpresa: albaran.CodigoEmpresa,
          ejercicio: albaran.EjercicioAlbaran,
          serie: albaran.SerieAlbaran,
          numeroAlbaran: albaran.NumeroAlbaran,
          codigoRepartidor: repartidorId
        },
        { headers }
      );

      if (response.data.success) {
        // Actualizar el albarán en el estado
        setAlbaranes(prev => prev.map(a => 
          a.EjercicioAlbaran === albaran.EjercicioAlbaran &&
          (a.SerieAlbaran || '') === (albaran.SerieAlbaran || '') &&
          a.NumeroAlbaran === albaran.NumeroAlbaran
            ? { 
                ...a, 
                repartidorAsignado: repartidorId,
                repartidorLower: repartidorId.toLowerCase()
              }
            : a
        ));
        alert('Albarán asignado correctamente');
      }
      
    } catch (error) {
      console.error('Error asignando albarán:', error);
      setError(`Error: ${error.response?.data?.mensaje || error.message}`);
    }
  };

  const formatFecha = (fechaString) => {
    if (!fechaString) return 'N/A';
    const fecha = new Date(fechaString);
    return fecha.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
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

  // Función para limpiar todos los filtros
  const limpiarFiltros = () => {
    setFiltroAlbaran('');
    setFiltroObra('');
    setFiltroRepartidor('');
    setFiltroCliente('');
  };

  const getActiveFiltersCount = () => {
    return [filtroAlbaran, filtroObra, filtroRepartidor, filtroCliente]
      .filter(value => value.trim() !== '').length;
  };

  if (!canAssignWaybills) {
    return (
      <div className="AA-no-permission">
        <h2>Acceso restringido</h2>
        <p>No tienes permiso para acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="AA-container">
      <div className="AA-content">
        <div className="AA-header-container">
          <h2 className="AA-header">Asignación de Repartos</h2>
          <button 
            onClick={handleRefresh} 
            className="AA-refresh-btn"
            disabled={refreshing}
          >
            <FaSync className={refreshing ? 'AA-refresh-spin' : ''} />
            {refreshing ? ' Actualizando...' : ' Actualizar'}
          </button>
        </div>
        
        {loading && !refreshing && (
          <div className="AA-loading">
            <div className="AA-spinner"></div>
            <p>Cargando datos...</p>
          </div>
        )}
        
        {error && <div className="AA-error">{error}</div>}

        {/* Sección de filtros de búsqueda */}
        <div className="AA-filtros">
          <div className="AA-filtros-header">
            <div className="AA-filtros-title">
              <FaFilter className="AA-filtros-icon" />
              <h4>Filtros de búsqueda</h4>
            </div>
            <div className="AA-filtros-stats">
              {getActiveFiltersCount() > 0 && (
                <span className="AA-filtros-badge">
                  {getActiveFiltersCount()} filtro{getActiveFiltersCount() !== 1 ? 's' : ''}
                </span>
              )}
              <button
                onClick={limpiarFiltros}
                className="AA-btn-limpiar"
                disabled={getActiveFiltersCount() === 0}
              >
                <FaTimes /> Limpiar filtros
              </button>
            </div>
          </div>
          
          <div className="AA-filtros-grid">
            <div className="AA-filtro-item">
              <label htmlFor="filtro-albaran">
                <FaSearch /> Número de Albarán
              </label>
              <input
                id="filtro-albaran"
                type="text"
                placeholder="Ej: 12345 o A-2023-123"
                value={filtroAlbaran}
                onChange={(e) => setFiltroAlbaran(e.target.value)}
                className="AA-input-filtro"
              />
            </div>
            
            <div className="AA-filtro-item">
              <label htmlFor="filtro-cliente">Cliente</label>
              <input
                id="filtro-cliente"
                type="text"
                placeholder="Nombre del cliente..."
                value={filtroCliente}
                onChange={(e) => setFiltroCliente(e.target.value)}
                className="AA-input-filtro"
              />
            </div>
            
            <div className="AA-filtro-item">
              <label htmlFor="filtro-obra">Obra</label>
              <input
                id="filtro-obra"
                type="text"
                placeholder="Nombre de la obra..."
                value={filtroObra}
                onChange={(e) => setFiltroObra(e.target.value)}
                className="AA-input-filtro"
              />
            </div>
            
            <div className="AA-filtro-item">
              <label htmlFor="filtro-repartidor">Repartidor</label>
              <select
                id="filtro-repartidor"
                value={filtroRepartidor}
                onChange={(e) => setFiltroRepartidor(e.target.value)}
                className="AA-select-filtro"
              >
                <option value="">Todos los repartidores</option>
                <option value="sin-asignar">Sin asignar</option>
                {repartidores.map(rep => (
                  <option key={rep.id} value={rep.id}>
                    {rep.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="AA-filtro-info">
            <span className="AA-contador">
              Mostrando {albaranesFiltrados.length} de {albaranes.length} albaranes
            </span>
            <span className="AA-filtro-nota">
              * Solo albaranes de "Nuestros Medios"
            </span>
          </div>
        </div>

        <div className="AA-main-content">
          <h3>Albaranes Pendientes de Asignación</h3>
          {albaranesFiltrados.length === 0 ? (
            <div className="AA-no-items">
              {albaranes.length === 0 
                ? "No hay albaranes pendientes de asignación" 
                : "No se encontraron albaranes con los filtros actuales"}
            </div>
          ) : (
            <div className="AA-table-container">
              <table className="AA-pedidos-table">
                <thead>
                  <tr>
                    <th>Albarán</th>
                    <th>Fecha</th>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Obra</th>
                    <th>Municipio</th>
                    <th>Estado</th>
                    <th>Repartidor</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {albaranesFiltrados.map(albaran => {
                    const key = `albaran-${albaran.EjercicioAlbaran}-${albaran.SerieAlbaran || ''}-${albaran.NumeroAlbaran}`;
                    const repartidorActual = albaran.repartidorAsignado;
                    const repartidorSeleccionado = asignaciones[key];
                    
                    return (
                      <tr 
                        key={key} 
                        className={`
                          ${albaran.esParcial ? 'AA-fila-parcial' : ''}
                          ${albaran.esVoluminoso ? 'AA-fila-voluminoso' : ''}
                        `}
                      >
                        <td className="AA-cell-albaran">
                          <div className="AA-albaran-info">
                            <span>{albaran.albaran}</span>
                            <div className="AA-badges">
                              {albaran.esParcial && (
                                <span className="AA-badge AA-badge-parcial">Parcial</span>
                              )}
                              {albaran.esVoluminoso && (
                                <span className="AA-badge AA-badge-voluminoso">Voluminoso</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>{formatFecha(albaran.FechaAlbaran)}</td>
                        <td>{albaran.NumeroPedido || 'N/A'}</td>
                        <td className="AA-cell-cliente">{albaran.RazonSocial}</td>
                        <td>{albaran.NombreObra || albaran.obra || 'No especificada'}</td>
                        <td>{albaran.Municipio || ''}</td>
                        <td>
                          <span className={`AA-estado AA-estado-${getEstadoText(albaran.EstadoPedido).toLowerCase()}`}>
                            {getEstadoText(albaran.EstadoPedido)}
                          </span>
                        </td>
                        <td>
                          <select
                            value={asignaciones[key] || ''}
                            onChange={(e) => setAsignaciones({
                              ...asignaciones,
                              [key]: e.target.value
                            })}
                            className="AA-select"
                          >
                            <option value="">Sin asignar</option>
                            {repartidores.map(rep => (
                              <option key={rep.id} value={rep.id}>
                                {rep.nombre}
                              </option>
                            ))}
                          </select>
                          {repartidorActual && (
                            <div className="AA-repartidor-actual">
                              Actual: {repartidores.find(r => r.id === repartidorActual)?.nombre || repartidorActual}
                            </div>
                          )}
                        </td>
                        <td>
                          <button
                            className="AA-btn-asignar"
                            onClick={() => handleAsignarAlbaran(albaran)}
                            disabled={!repartidorSeleccionado || repartidorSeleccionado === repartidorActual}
                            title={repartidorSeleccionado === repartidorActual ? "Ya asignado a este repartidor" : ""}
                          >
                            {repartidorActual ? 'Reasignar' : 'Asignar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <Navbar />
    </div>
  );
}

export default AlbaranesAsignadosScreen;