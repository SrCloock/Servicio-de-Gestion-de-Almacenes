import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { 
  FiSearch, FiChevronDown, FiChevronUp, 
  FiFilter, FiEdit, FiX, 
  FiCheck, FiClock, FiList, FiRefreshCw, FiPlus, FiMinus
} from 'react-icons/fi';
import '../styles/InventarioPage.css';

const InventarioPage = () => {
  const [activeTab, setActiveTab] = useState('inventario');
  const [inventario, setInventario] = useState([]);
  const [historialAjustes, setHistorialAjustes] = useState([]);
  const [articulosExpandidos, setArticulosExpandidos] = useState({});
  const [fechasExpandidas, setFechasExpandidas] = useState({});
  const [loading, setLoading] = useState({ inventario: true, historial: true });
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    almacen: '',
    ubicacion: '',
    familia: '',
    subfamilia: ''
  });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [ajustesPendientes, setAjustesPendientes] = useState([]);
  const [editandoCantidad, setEditandoCantidad] = useState(null);
  const [nuevaCantidad, setNuevaCantidad] = useState('');
  const [detallesModal, setDetallesModal] = useState(null);
  const [cargandoDetalles, setCargandoDetalles] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  const formatearUnidad = (cantidad, unidad) => {
    if (!unidad || unidad.trim() === '') {
      unidad = 'unidad';
    }
    
    let cantidadFormateada = cantidad;
    if (!Number.isInteger(cantidad)) {
      cantidadFormateada = parseFloat(cantidad.toFixed(2));
    }

    const unidadesInvariables = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3'];
    
    const unidadLower = unidad.toLowerCase();
    
    if (unidadesInvariables.includes(unidadLower)) {
      return `${cantidadFormateada} ${unidad}`;
    }
    
    const pluralesIrregulares = {
      'ud': 'uds',
      'par': 'pares',
      'metro': 'metros',
      'pack': 'packs',
      'saco': 'sacos',
      'barra': 'barras',
      'caja': 'cajas',
      'rollo': 'rollos',
      'lata': 'latas',
      'bote': 'botes',
      'tubo': 'tubos',
      'unidad': 'unidades',
      'juego': 'juegos',
      'kit': 'kits',
      'paquete': 'paquetes',
      'cajetin': 'cajetines',
      'bidon': 'bidones',
      'palet': 'palets',
      'bobina': 'bobinas',
      'fardo': 'fardos',
      'cubeta': 'cubetas',
      'garrafa': 'garrafas',
      'tambor': 'tambores',
      'cubos': 'cubos',
      'pares': 'pares'
    };

    if (cantidadFormateada === 1) {
      if (unidadLower === 'unidad' || unidadLower === 'unidades') {
        return '1 unidad';
      }
      return `1 ${unidad}`;
    } else {
      if (unidadLower === 'unidad' || unidadLower === 'unidades') {
        return `${cantidadFormateada} unidades`;
      }
      
      if (pluralesIrregulares[unidadLower]) {
        return `${cantidadFormateada} ${pluralesIrregulares[unidadLower]}`;
      }
      
      const ultimaLetra = unidad.charAt(unidad.length - 1);
      const penultimaLetra = unidad.charAt(unidad.length - 2);
      
      if (['a', 'e', 'i', 'o', 'u'].includes(ultimaLetra)) {
        return `${cantidadFormateada} ${unidad}s`;
      } else {
        return `${cantidadFormateada} ${unidad}es`;
      }
    }
  };

  // Función corregida para mostrar fecha en hora de Madrid
  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return 'Fecha inválida';
    
    try {
      // Convertir a objeto Date
      const fecha = new Date(fechaStr);
      
      // Formatear en hora de Madrid
      return fecha.toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formateando fecha:', fechaStr, error);
      return 'Fecha inválida';
    }
  };

  const agruparPorArticulo = useCallback((data) => {
    const agrupado = {};
    
    data.forEach(item => {
      const clave = `${item.CodigoAlmacen}-${item.Ubicacion}-${item.UnidadStock}-${item.Partida || ''}`;
      
      if (!agrupado[item.CodigoArticulo]) {
        agrupado[item.CodigoArticulo] = {
          CodigoArticulo: item.CodigoArticulo,
          DescripcionArticulo: item.DescripcionArticulo,
          CodigoFamilia: item.CodigoFamilia,
          CodigoSubfamilia: item.CodigoSubfamilia,
          UnidadBase: item.UnidadBase,
          UnidadAlternativa: item.UnidadAlternativa,
          FactorConversion: item.FactorConversion,
          ubicaciones: [],
          totalStockBase: 0,
          estado: 'positivo'
        };
      }
      
      const ubicacion = {
        clave,
        CodigoAlmacen: item.CodigoAlmacen,
        NombreAlmacen: item.NombreAlmacen,
        Ubicacion: item.Ubicacion,
        DescripcionUbicacion: item.DescripcionUbicacion,
        Partida: item.Partida,
        UnidadStock: item.UnidadStock,
        Cantidad: item.Cantidad,
        CantidadBase: item.Cantidad * (item.FactorConversion || 1),
        GrupoUnico: clave
      };
      
      agrupado[item.CodigoArticulo].ubicaciones.push(ubicacion);
      agrupado[item.CodigoArticulo].totalStockBase += ubicacion.CantidadBase;
    });
    
    Object.values(agrupado).forEach(articulo => {
      articulo.ubicaciones.sort((a, b) => {
        if (a.NombreAlmacen < b.NombreAlmacen) return -1;
        if (a.NombreAlmacen > b.NombreAlmacen) return 1;
        
        if (a.Ubicacion < b.Ubicacion) return -1;
        if (a.Ubicacion > b.Ubicacion) return 1;
        
        if (a.Partida && b.Partida) {
          if (a.Partida < b.Partida) return -1;
          if (a.Partida > b.Partida) return 1;
        }
        
        return 0;
      });
      
      if (articulo.totalStockBase === 0) {
        articulo.estado = 'agotado';
      } else if (articulo.totalStockBase < 0) {
        articulo.estado = 'negativo';
      } else {
        articulo.estado = 'positivo';
      }
    });
    
    return Object.values(agrupado);
  }, []);

  const cargarInventario = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, inventario: true }));
      setError('');
      const headers = getAuthHeader();
      const response = await axios.get(
        'http://localhost:3000/inventario/stock-total',
        { headers }
      );
      
      setInventario(agruparPorArticulo(response.data));
      setLoading(prev => ({ ...prev, inventario: false }));
    } catch (error) {
      console.error('Error al obtener inventario:', error);
      setError('Error al cargar el inventario. Intente nuevamente.');
      setLoading(prev => ({ ...prev, inventario: false }));
    }
  }, [agruparPorArticulo]);

  const cargarHistorialAjustes = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, historial: true }));
      setError('');
      const headers = getAuthHeader();
      const response = await axios.get(
        'http://localhost:3000/inventario/historial-ajustes',
        { headers }
      );
      
      setHistorialAjustes(response.data);
      setLoading(prev => ({ ...prev, historial: false }));
    } catch (error) {
      console.error('Error al obtener historial:', error);
      setError('Error al cargar el historial de ajustes. Intente nuevamente.');
      setLoading(prev => ({ ...prev, historial: false }));
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'inventario' && inventario.length === 0) {
      cargarInventario();
    } else if (activeTab === 'historial' && historialAjustes.length === 0) {
      cargarHistorialAjustes();
    }
  }, [activeTab, cargarInventario, cargarHistorialAjustes, inventario.length, historialAjustes.length]);

  const refreshInventario = useCallback(() => {
    if (activeTab === 'inventario') {
      cargarInventario();
    } else {
      cargarHistorialAjustes();
    }
  }, [activeTab, cargarInventario, cargarHistorialAjustes]);

  const toggleExpandirArticulo = (codigoArticulo) => {
    setArticulosExpandidos(prev => ({
      ...prev,
      [codigoArticulo]: !prev[codigoArticulo]
    }));
  };

  const toggleExpandirFecha = (fecha) => {
    setFechasExpandidas(prev => ({
      ...prev,
      [fecha]: !prev[fecha]
    }));
  };

  const toggleTodosArticulos = () => {
    if (Object.keys(articulosExpandidos).length === filteredInventario.length) {
      setArticulosExpandidos({});
    } else {
      const allExpanded = {};
      filteredInventario.forEach(art => {
        allExpanded[art.CodigoArticulo] = true;
      });
      setArticulosExpandidos(allExpanded);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1);
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const estadoOrden = { 'positivo': 1, 'negativo': 2, 'agotado': 3 };

  const filteredInventario = useMemo(() => {
    let result = [...inventario];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(articulo => 
        articulo.CodigoArticulo.toLowerCase().includes(term) ||
        articulo.DescripcionArticulo.toLowerCase().includes(term)
      );
    }
    
    if (filters.almacen) {
      result = result.filter(articulo => 
        articulo.ubicaciones.some(ubic => 
          ubic.NombreAlmacen.toLowerCase().includes(filters.almacen.toLowerCase())
        )
      );
    }
    
    if (filters.ubicacion) {
      result = result.filter(articulo => 
        articulo.ubicaciones.some(ubic => 
          ubic.Ubicacion.toLowerCase().includes(filters.ubicacion.toLowerCase()) ||
          (ubic.DescripcionUbicacion && 
          ubic.DescripcionUbicacion.toLowerCase().includes(filters.ubicacion.toLowerCase()))
        )
      );
    }
    
    if (filters.familia) {
      const term = filters.familia.toLowerCase();
      result = result.filter(articulo => 
        articulo.CodigoFamilia && 
        articulo.CodigoFamilia.toLowerCase().includes(term)
      );
    }
    
    if (filters.subfamilia) {
      const term = filters.subfamilia.toLowerCase();
      result = result.filter(articulo => 
        articulo.CodigoSubfamilia && 
        articulo.CodigoSubfamilia.toLowerCase().includes(term)
      );
    }
    
    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue, bValue;
        
        if (sortConfig.key === 'estado') {
          aValue = estadoOrden[a.estado];
          bValue = estadoOrden[b.estado];
        } else {
          aValue = a[sortConfig.key];
          bValue = b[sortConfig.key];
        }
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    } else {
      result.sort((a, b) => {
        if (estadoOrden[a.estado] < estadoOrden[b.estado]) return -1;
        if (estadoOrden[a.estado] > estadoOrden[b.estado]) return 1;
        
        if (a.CodigoArticulo < b.CodigoArticulo) return -1;
        if (a.CodigoArticulo > b.CodigoArticulo) return 1;
        return 0;
      });
    }
    
    return result;
  }, [inventario, searchTerm, filters, sortConfig]);

  const stats = useMemo(() => {
    const totalArticulos = filteredInventario.length;
    const totalUnidades = filteredInventario.reduce((total, art) => total + art.totalStockBase, 0);
    const totalUbicaciones = filteredInventario.reduce((total, art) => total + art.ubicaciones.length, 0);
    
    return { totalArticulos, totalUnidades, totalUbicaciones };
  }, [filteredInventario]);

  const totalPages = Math.ceil(filteredInventario.length / pageSize);
  const paginatedInventario = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredInventario.slice(startIndex, startIndex + pageSize);
  }, [filteredInventario, currentPage, pageSize]);

  const goToPage = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const getStockStyle = (cantidad) => {
    if (cantidad === 0) return { color: '#e74c3c', fontWeight: 'bold' };
    if (cantidad < 0) return { color: '#f39c12', fontWeight: '600' };
    return { color: '#27ae60' };
  };

  const getEstadoColor = (estado) => {
    switch (estado) {
      case 'positivo': return '#2ecc71';
      case 'negativo': return '#f39c12';
      case 'agotado': return '#e74c3c';
      default: return '#7f8c8d';
    }
  };

  const iniciarEdicionCantidad = (articulo, nombreAlmacen, cantidadActual, clave, codigoAlmacen, ubicacionStr, partida, unidadStock) => {
    setEditandoCantidad({
      articulo,
      nombreAlmacen,
      cantidadActual,
      clave,
      codigoAlmacen,
      ubicacionStr,
      partida,
      unidadStock  // Asegurarnos de pasar la unidad
    });
    setNuevaCantidad(cantidadActual.toString());
  };

  const guardarAjustePendiente = () => {
    if (!editandoCantidad || !nuevaCantidad) return;
    
    const cantidad = parseFloat(nuevaCantidad);
    if (isNaN(cantidad)) {
      alert("Por favor ingrese un número válido");
      return;
    }
    
    const nuevoAjuste = {
      articulo: editandoCantidad.articulo,
      codigoAlmacen: editandoCantidad.codigoAlmacen,
      ubicacionStr: editandoCantidad.ubicacionStr,
      partida: editandoCantidad.partida || '',
      unidadStock: editandoCantidad.unidadStock || 'unidades', // ENVIAR UNIDAD AL BACKEND
      nuevaCantidad: cantidad
    };
    
    setAjustesPendientes(prev => [...prev, nuevoAjuste]);
    setEditandoCantidad(null);
    setNuevaCantidad('');
  };

  const eliminarAjustePendiente = (index) => {
    setAjustesPendientes(prev => prev.filter((_, i) => i !== index));
  };

  const verDetalles = async (movPosicionLinea) => {
    if (!movPosicionLinea) return;
    
    try {
      setCargandoDetalles(true);
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/stock/detalles?movPosicionLinea=${movPosicionLinea}`,
        { headers }
      );
      
      setDetallesModal(response.data);
    } catch (error) {
      console.error('Error cargando detalles:', error);
      alert('Error al cargar los detalles');
    } finally {
      setCargandoDetalles(false);
    }
  };

  const confirmarAjustes = async () => {
    try {
      const headers = getAuthHeader();
      const response = await axios.post(
        'http://localhost:3000/inventario/ajustar',
        { ajustes: ajustesPendientes },
        { headers }
      );
      
      if (response.data.success) {
        refreshInventario();
        cargarHistorialAjustes();
        setAjustesPendientes([]);
        alert('Ajustes realizados correctamente');
      }
    } catch (error) {
      console.error('Error al confirmar ajustes:', error);
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.mensaje || 
                          error.message;
      alert(`Error al confirmar ajustes: ${errorMessage}`);
    }
  };

  return (
    <div className="inventario-container">
      <Navbar />
      
      <div className="inventario-content">
        <div className="inventario-search-and-refresh">
          <div className="inventario-search-container">
            <input
              type="text"
              placeholder={activeTab === 'inventario' ? "Buscar artículo..." : "Buscar en historial..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="inventario-search-input"
              aria-label="Buscar"
            />
          </div>
          <button className="inventario-refresh-btn" onClick={refreshInventario} aria-label="Actualizar">
            <FiRefreshCw /> Actualizar
          </button>
        </div>

        <div className="inventario-tabs-container">
          <button 
            className={`inventario-tab-btn ${activeTab === 'inventario' ? 'inventario-active' : ''}`}
            onClick={() => setActiveTab('inventario')}
            aria-label="Ver inventario actual"
          >
            <FiList /> Inventario Actual
          </button>
          <button 
            className={`inventario-tab-btn ${activeTab === 'historial' ? 'inventario-active' : ''}`}
            onClick={() => setActiveTab('historial')}
            aria-label="Ver historial de ajustes"
          >
            <FiClock /> Historial de Ajustes
          </button>
        </div>
        
        {activeTab === 'inventario' && (
          <div className="inventario-filters-container">
            <button 
              className="inventario-filters-toggle"
              onClick={() => setFiltrosAbiertos(!filtrosAbiertos)}
              aria-expanded={filtrosAbiertos}
              aria-label={filtrosAbiertos ? 'Ocultar filtros' : 'Mostrar filtros'}
            >
              <FiFilter /> {filtrosAbiertos ? 'Ocultar Filtros' : 'Mostrar Filtros'}
            </button>
            
            {filtrosAbiertos && (
              <div className="inventario-filters-panel">
                <div className="inventario-filter-group">
                  <label htmlFor="almacen-filter">
                    Almacén:
                  </label>
                  <input
                    type="text"
                    id="almacen-filter"
                    name="almacen"
                    placeholder="Filtrar por almacén"
                    value={filters.almacen}
                    onChange={handleFilterChange}
                    aria-label="Filtrar por almacén"
                  />
                </div>
                
                <div className="inventario-filter-group">
                  <label htmlFor="ubicacion-filter">
                    Ubicación:
                  </label>
                  <input
                    type="text"
                    id="ubicacion-filter"
                    name="ubicacion"
                    placeholder="Filtrar por ubicación"
                    value={filters.ubicacion}
                    onChange={handleFilterChange}
                    aria-label="Filtrar por ubicación"
                  />
                </div>
                
                <div className="inventario-filter-group">
                  <label htmlFor="familia-filter">
                    Familia:
                  </label>
                  <input
                    type="text"
                    id="familia-filter"
                    name="familia"
                    placeholder="Buscar por familia"
                    value={filters.familia}
                    onChange={handleFilterChange}
                    aria-label="Buscar por familia"
                  />
                </div>
                
                <div className="inventario-filter-group">
                  <label htmlFor="subfamilia-filter">
                    Subfamilia:
                  </label>
                  <input
                    type="text"
                    id="subfamilia-filter"
                    name="subfamilia"
                    placeholder="Buscar por subfamilia"
                    value={filters.subfamilia}
                    onChange={handleFilterChange}
                    aria-label="Buscar por subfamilia"
                  />
                </div>
                
                <button 
                  className="inventario-btn-toggle-all"
                  onClick={toggleTodosArticulos}
                  aria-label={Object.keys(articulosExpandidos).length > 0 
                    ? 'Contraer todos los artículos' 
                    : 'Expandir todos los artículos'}
                >
                  {Object.keys(articulosExpandidos).length > 0 ? (
                    <>
                      <FiMinus /> Contraer Todo
                    </>
                  ) : (
                    <>
                      <FiPlus /> Expandir Todo
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'inventario' && ajustesPendientes.length > 0 && (
          <div className="inventario-panel-ajustes">
            <div className="inventario-panel-header">
              <h3>Ajustes Pendientes <span className="inventario-badge">{ajustesPendientes.length}</span></h3>
              <div className="inventario-panel-actions">
                <button 
                  className="inventario-btn-confirmar"
                  onClick={confirmarAjustes}
                  aria-label="Confirmar todos los ajustes pendientes"
                >
                  <FiCheck /> Confirmar Ajustes
                </button>
              </div>
            </div>
            
            <div className="inventario-lista-ajustes">
              {ajustesPendientes.map((ajuste, index) => (
                <div key={index} className="inventario-ajuste-item">
                  <div className="inventario-ajuste-info">
                    <div className="inventario-articulo">
                      <span className="inventario-label">Artículo:</span> 
                      <span className="inventario-value">{ajuste.articulo}</span>
                    </div>
                    <div className="inventario-ubicacion">
                      <span className="inventario-label">Ubicación:</span> 
                      <span className="inventario-value">{ajuste.ubicacionStr}</span>
                    </div>
                    <div className="inventario-cantidad">
                      <span className="inventario-label">Nueva Cantidad:</span> 
                      <span className="inventario-value">
                        <strong>{formatearUnidad(ajuste.nuevaCantidad, ajuste.unidadStock)}</strong>
                      </span>
                    </div>
                  </div>
                  <button 
                    className="inventario-btn-eliminar"
                    onClick={() => eliminarAjustePendiente(index)}
                    aria-label="Eliminar ajuste pendiente"
                  >
                    <FiX />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {activeTab === 'inventario' && (
          <div className="inventario-stats">
            <div className="inventario-stat-card">
              <div className="inventario-stat-icon">
                <FiList />
              </div>
              <div>
                <span className="inventario-stat-value">{stats.totalArticulos}</span>
                <span className="inventario-stat-label">Artículos</span>
              </div>
            </div>
            <div className="inventario-stat-card">
              <div className="inventario-stat-icon">
                <FiCheck />
              </div>
              <div>
                <span className="inventario-stat-value">
                  {stats.totalUnidades.toLocaleString()}
                </span>
                <span className="inventario-stat-label">Unidades</span>
              </div>
            </div>
            <div className="inventario-stat-card">
              <div className="inventario-stat-icon">
                <FiFilter />
              </div>
              <div>
                <span className="inventario-stat-value">{stats.totalUbicaciones}</span>
                <span className="inventario-stat-label">Ubicaciones</span>
              </div>
            </div>
          </div>
        )}
        
        {cargandoDetalles && (
          <div className="inventario-cargando-detalles">
            <div className="inventario-spinner"></div>
            <p>Cargando detalles...</p>
          </div>
        )}
        
        <div className="inventario-main-content">
          {activeTab === 'inventario' ? (
            <>
              {error ? (
                <div className="inventario-error-container">
                  <div className="inventario-error-icon">⚠️</div>
                  <h3>Error al cargar datos</h3>
                  <p>{error}</p>
                  <button 
                    className="inventario-btn-reload"
                    onClick={() => window.location.reload()}
                    aria-label="Recargar página"
                  >
                    <FiRefreshCw /> Recargar Inventario
                  </button>
                </div>
              ) : loading.inventario ? (
                <div className="inventario-loading-container">
                  <div className="inventario-spinner"></div>
                  <p>Cargando inventario...</p>
                </div>
              ) : paginatedInventario.length === 0 ? (
                <div className="inventario-no-results">
                  <h3>No se encontraron artículos</h3>
                  <p>Intenta ajustar tus filtros de búsqueda</p>
                  <button 
                    className="inventario-btn-clear-filters"
                    onClick={() => {
                      setSearchTerm('');
                      setFilters({
                        almacen: '',
                        ubicacion: '',
                        familia: '',
                        subfamilia: ''
                      });
                    }}
                    aria-label="Limpiar todos los filtros"
                  >
                    Limpiar Filtros
                  </button>
                </div>
              ) : (
                <div className="inventario-list">
                  {paginatedInventario.map(articulo => (
                    <div 
                      key={articulo.CodigoArticulo} 
                      className={`inventario-item ${articulo.estado === 'agotado' ? 'inventario-estado-agotado' : ''} ${articulo.estado === 'negativo' ? 'inventario-estado-negativo' : ''}`}
                      style={{ borderLeft: `5px solid ${getEstadoColor(articulo.estado)}` }}
                    >
                      <div 
                        className="inventario-articulo-header"
                        onClick={() => toggleExpandirArticulo(articulo.CodigoArticulo)}
                        aria-expanded={!!articulosExpandidos[articulo.CodigoArticulo]}
                      >
                        <div className="inventario-articulo-info">
                          <span className="inventario-articulo-codigo">{articulo.CodigoArticulo}</span>
                          <span className="inventario-articulo-descripcion">{articulo.DescripcionArticulo}</span>
                          <div className="inventario-articulo-categorias">
                            {articulo.CodigoFamilia && (
                              <span className="inventario-familia-tag">Familia: {articulo.CodigoFamilia}</span>
                            )}
                            {articulo.CodigoSubfamilia && (
                              <span className="inventario-subfamilia-tag">Subfamilia: {articulo.CodigoSubfamilia}</span>
                            )}
                          </div>
                        </div>
                        <div className="inventario-articulo-total">
                          <span className="inventario-total-unidades">
                            {formatearUnidad(articulo.totalStockBase, articulo.UnidadBase)}
                            <span className="inventario-ubicaciones-count">
                              ({articulo.ubicaciones.length} ubicaciones)
                            </span>
                          </span>
                          <span className={`inventario-expand-icon ${articulosExpandidos[articulo.CodigoArticulo] ? 'expanded' : ''}`}>
                            {articulosExpandidos[articulo.CodigoArticulo] ? <FiChevronUp /> : <FiChevronDown />}
                          </span>
                        </div>
                      </div>
                      
                      {articulosExpandidos[articulo.CodigoArticulo] && (
                        <div className="inventario-ubicaciones-list">
                          <div className="inventario-ubicaciones-header">
                            <span onClick={() => requestSort('NombreAlmacen')}>
                              Almacén {sortConfig.key === 'NombreAlmacen' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </span>
                            <span onClick={() => requestSort('Ubicacion')}>
                              Ubicación {sortConfig.key === 'Ubicacion' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </span>
                            <span>Descripción</span>
                            <span>Partida</span>
                            <span>Unidad</span>
                            <span onClick={() => requestSort('Cantidad')}>
                              Cantidad {sortConfig.key === 'Cantidad' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </span>
                            <span>Acciones</span>
                          </div>
                          
                          {articulo.ubicaciones
                            .sort((a, b) => {
                              if (!sortConfig.key) return 0;
                              if (a[sortConfig.key] < b[sortConfig.key]) {
                                return sortConfig.direction === 'asc' ? -1 : 1;
                              }
                              if (a[sortConfig.key] > b[sortConfig.key]) {
                                return sortConfig.direction === 'asc' ? 1 : -1;
                              }
                              return 0;
                            })
                            .map(ubicacion => (
                            <div 
                              key={ubicacion.clave} 
                              className="inventario-ubicacion-item"
                            >
                              <span className="inventario-ubicacion-almacen">
                                {ubicacion.NombreAlmacen}
                              </span>
                              <span className="inventario-ubicacion-codigo">{ubicacion.Ubicacion}</span>
                              <span className="inventario-ubicacion-desc">{ubicacion.DescripcionUbicacion || 'Sin descripción'}</span>
                              <span className="inventario-ubicacion-partida">{ubicacion.Partida || 'N/A'}</span>
                              <span className="inventario-ubicacion-unidad">
                                {ubicacion.UnidadStock || 'unidades'}
                              </span>
                              <span 
                                className="inventario-ubicacion-cantidad" 
                                style={getStockStyle(ubicacion.Cantidad)}
                              >
                                {formatearUnidad(ubicacion.Cantidad, ubicacion.UnidadStock)}
                                
                                {articulo.UnidadAlternativa && 
                                 ubicacion.UnidadStock === articulo.UnidadAlternativa && (
                                  <span className="inventario-conversion-info">
                                    ({formatearUnidad(ubicacion.CantidadBase, articulo.UnidadBase)})
                                  </span>
                                )}
                              </span>
                              <div className="inventario-acciones-ubicacion">
                                <button 
                                  className="inventario-btn-editar"
                                  onClick={() => iniciarEdicionCantidad(
                                    articulo.CodigoArticulo,
                                    ubicacion.NombreAlmacen,
                                    ubicacion.Cantidad,
                                    ubicacion.clave,
                                    ubicacion.CodigoAlmacen,
                                    ubicacion.Ubicacion,
                                    ubicacion.Partida,
                                    ubicacion.UnidadStock
                                  )}
                                  aria-label={`Editar cantidad de ${articulo.CodigoArticulo} en ${ubicacion.NombreAlmacen}`}
                                >
                                  <FiEdit /> Editar
                                </button>
                                
                                {ubicacion.detalles && (
                                  <button 
                                    className="inventario-btn-detalles"
                                    onClick={() => verDetalles(ubicacion.MovPosicionLinea)}
                                    aria-label={`Ver detalles de ${articulo.CodigoArticulo} en ${ubicacion.Ubicacion}`}
                                  >
                                    Detalles
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {totalPages > 1 && (
                <div className="inventario-pagination">
                  <div className="inventario-pagination-controls">
                    <button 
                      onClick={() => goToPage(currentPage - 1)} 
                      disabled={currentPage === 1}
                      className="inventario-pagination-btn"
                      aria-label="Página anterior"
                    >
                      Anterior
                    </button>
                    
                    <span className="inventario-page-info">Página {currentPage} de {totalPages}</span>
                    
                    <button 
                      onClick={() => goToPage(currentPage + 1)} 
                      disabled={currentPage === totalPages}
                      className="inventario-pagination-btn"
                      aria-label="Página siguiente"
                    >
                      Siguiente
                    </button>
                  </div>
                  
                  <div className="inventario-page-size-selector">
                    <label>Artículos por página:</label>
                    <select 
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="inventario-page-size-select"
                      aria-label="Cambiar número de artículos por página"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={75}>75</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {error ? (
                <div className="inventario-error-container">
                  <div className="inventario-error-icon">⚠️</div>
                  <h3>Error al cargar datos</h3>
                  <p>{error}</p>
                  <button 
                    className="inventario-btn-reload"
                    onClick={cargarHistorialAjustes}
                    aria-label="Recargar historial"
                  >
                    <FiRefreshCw /> Recargar Historial
                  </button>
                </div>
              ) : loading.historial ? (
                <div className="inventario-loading-container">
                  <div className="inventario-spinner"></div>
                  <p>Cargando historial de ajustes...</p>
                </div>
              ) : historialAjustes.length === 0 ? (
                <div className="inventario-no-results">
                  <h3>No se encontraron ajustes</h3>
                  <p>No hay registros en el historial de ajustes</p>
                </div>
              ) : (
                <div className="inventario-historial-list">
                  {historialAjustes.map(item => {
                    const expandido = fechasExpandidas[item.fecha];
                    
                    return (
                      <div key={`${item.fecha}-${item.totalAjustes}`} className="inventario-historial-item">
                        <div 
                          className="inventario-fecha-header"
                          onClick={() => toggleExpandirFecha(item.fecha)}
                          style={{ background: expandido ? '#f0f7ff' : '#f5f7fa' }}
                          aria-expanded={expandido}
                        >
                          <div className="inventario-fecha-info">
                            <span className="inventario-fecha">{formatearFecha(item.fecha)}</span>
                            <span className="inventario-resumen">
                              {item.totalAjustes} ajustes realizados
                            </span>
                          </div>
                          <span className={`inventario-expand-icon ${expandido ? 'expanded' : ''}`}>
                            {expandido ? <FiChevronUp /> : <FiChevronDown />}
                          </span>
                        </div>
                        
                        {expandido && (
                          <div className="inventario-detalles-ajustes">
                            {item.detalles.map((detalle, idx) => (
                              <div key={`${detalle.CodigoArticulo}-${detalle.FechaRegistro}`} 
                                   className={`inventario-ajuste-detalle ${detalle.Diferencia > 0 ? 'ajuste-positivo' : 'ajuste-negativo'}`}>
                                <div className="inventario-ajuste-detalle-header">
                                  <span className="inventario-ajuste-articulo">
                                    <strong>{detalle.CodigoArticulo}</strong> - {detalle.DescripcionArticulo}
                                  </span>
                                  <span className="inventario-ajuste-cantidad">
                                    {detalle.Diferencia > 0 ? '+' : ''}{detalle.Diferencia}
                                  </span>
                                </div>
                                
                                <div className="inventario-ajuste-detalle-info">
                                  <div>
                                    <span className="inventario-ajuste-label">Almacén:</span>
                                    <span>{detalle.NombreAlmacen} ({detalle.CodigoAlmacen})</span>
                                  </div>
                                  <div>
                                    <span className="inventario-ajuste-label">Ubicación:</span>
                                    <span>{detalle.Ubicacion} - {detalle.DescripcionUbicacion || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="inventario-ajuste-label">Partida:</span>
                                    <span>{detalle.Partida || '-'}</span>
                                  </div>
                                  <div>
                                    <span className="inventario-ajuste-label">Comentario:</span>
                                    <span>{detalle.Comentario || 'Sin comentario'}</span>
                                  </div>
                                  <div>
                                    <span className="inventario-ajuste-label">Fecha y hora:</span>
                                    <span>
                                      {formatearFecha(detalle.FechaRegistro)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      
      {editandoCantidad && (
        <div className="inventario-modal-edicion">
          <div className="inventario-modal-contenido">
            <h3>Editar Cantidad</h3>
            <div className="inventario-modal-details">
              <div className="inventario-detail-item">
                <span>Artículo:</span>
                <span>{editandoCantidad.articulo}</span>
              </div>
              <div className="inventario-detail-item">
                <span>Almacén:</span>
                <span>{editandoCantidad.nombreAlmacen}</span>
              </div>
              <div className="inventario-detail-item">
                <span>Ubicación:</span>
                <span>{editandoCantidad.ubicacionStr}</span>
              </div>
              <div className="inventario-detail-item">
                <span>Partida:</span>
                <span>{editandoCantidad.partida || 'N/A'}</span>
              </div>
              {/* MOSTRAR UNIDAD EN EL MODAL */}
              <div className="inventario-detail-item">
                <span>Unidad:</span>
                <span>{editandoCantidad.unidadStock || 'unidades'}</span>
              </div>
            </div>
            
            <div className="inventario-form-group">
              <label>Cantidad Actual:</label>
              <input 
                type="text" 
                value={formatearUnidad(editandoCantidad.cantidadActual, editandoCantidad.unidadStock)} 
                disabled 
                className="inventario-cantidad-actual"
              />
            </div>
            
            <div className="inventario-form-group">
              <label>Nueva Cantidad:</label>
              <input 
                type="number" 
                value={nuevaCantidad}
                onChange={(e) => setNuevaCantidad(e.target.value)}
                autoFocus
                className="inventario-nueva-cantidad"
                step="any"
              />
            </div>
            
            <div className="inventario-modal-acciones">
              <button 
                className="inventario-btn-cancelar"
                onClick={() => setEditandoCantidad(null)}
                aria-label="Cancelar edición"
              >
                Cancelar
              </button>
              <button 
                className="inventario-btn-guardar"
                onClick={guardarAjustePendiente}
                aria-label="Guardar ajuste"
              >
                Guardar Ajuste
              </button>
            </div>
          </div>
        </div>
      )}
      
      {detallesModal && (
        <div className="inventario-modal-detalles">
          <div className="inventario-modal-contenido">
            <button className="inventario-cerrar-modal" onClick={() => setDetallesModal(null)} aria-label="Cerrar modal">
              &times;
            </button>
            
            <h3>Detalles de Variantes</h3>
            
            <div className="inventario-detalles-container">
              {detallesModal.length === 0 ? (
                <p>No hay detalles de variantes para este artículo</p>
              ) : (
                detallesModal.map((detalle, index) => (
                  <div key={`${detalle.color.codigo}-${detalle.grupoTalla.codigo}-${index}`} className="inventario-variante-grupo">
                    <div className="inventario-variante-header">
                      <span className="inventario-color-variante">
                        <strong>Color:</strong> {detalle.color.nombre}
                      </span>
                      <span className="inventario-talla-grupo">
                        <strong>Grupo Talla:</strong> {detalle.grupoTalla.nombre}
                      </span>
                    </div>
                    
                    <table className="inventario-detalles-table">
                      <thead>
                        <tr>
                          <th>Talla</th>
                          <th>Descripción</th>
                          <th>Unidades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(detalle.tallas)
                          .filter(([_, talla]) => talla.unidades > 0)
                          .map(([codigoTalla, talla], idx) => (
                            <tr key={`${codigoTalla}-${idx}`}>
                              <td>{codigoTalla}</td>
                              <td>{talla.descripcion}</td>
                              <td>{talla.unidades}</td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    <div className="inventario-variante-total">
                      <strong>Total unidades:</strong> {detalle.unidades}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventarioPage;