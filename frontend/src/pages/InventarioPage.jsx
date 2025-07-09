import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { 
  FiSearch, FiChevronDown, FiChevronUp, 
  FiFilter, FiEdit, FiX, 
  FiCheck, FiClock, FiList 
} from 'react-icons/fi';
import '../styles/InventarioPage.css';

const PAGE_SIZE = 30;

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
  const [ajustesPendientes, setAjustesPendientes] = useState([]);
  const [editandoCantidad, setEditandoCantidad] = useState(null);
  const [nuevaCantidad, setNuevaCantidad] = useState('');
  const [detallesModal, setDetallesModal] = useState(null);
  const [cargandoDetalles, setCargandoDetalles] = useState(false);
  
  const nombreEmpresa = 'Demos';

  // Función de agrupación con soporte para partidas
  const agruparPorArticulo = useCallback((data) => {
    const agrupado = {};
    
    data.forEach(item => {
      const clave = item.Partida 
        ? `${item.CodigoArticulo}-${item.CodigoAlmacen}-${item.Ubicacion}-${item.Partida}`
        : `${item.CodigoArticulo}-${item.CodigoAlmacen}-${item.Ubicacion}`;
      
      if (!agrupado[item.CodigoArticulo]) {
        agrupado[item.CodigoArticulo] = {
          CodigoArticulo: item.CodigoArticulo,
          DescripcionArticulo: item.DescripcionArticulo,
          CodigoFamilia: item.CodigoFamilia,
          CodigoSubfamilia: item.CodigoSubfamilia,
          ubicaciones: [],
          totalStock: 0,
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
        Cantidad: item.Cantidad,
        MovPosicionLinea: item.MovPosicionLinea,
        detalles: item.detalles
      };
      
      agrupado[item.CodigoArticulo].ubicaciones.push(ubicacion);
      agrupado[item.CodigoArticulo].totalStock += item.Cantidad;
    });
    
    Object.values(agrupado).forEach(articulo => {
      if (articulo.totalStock === 0) {
        articulo.estado = 'agotado';
      } else if (articulo.totalStock < 0) {
        articulo.estado = 'negativo';
      } else {
        articulo.estado = 'positivo';
      }
    });
    
    return Object.values(agrupado);
  }, []);

  // Cargar inventario
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

  // Cargar historial de ajustes
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
    if (activeTab === 'inventario') {
      cargarInventario();
    } else if (activeTab === 'historial') {
      cargarHistorialAjustes();
    }
  }, [activeTab, cargarInventario, cargarHistorialAjustes]);

  const refreshInventario = useCallback(() => {
    if (activeTab === 'inventario') {
      cargarInventario();
    }
  }, [activeTab, cargarInventario]);

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
    if (Object.keys(articulosExpandidos).length > 0) {
      setArticulosExpandidos({});
    } else {
      const allExpanded = {};
      paginatedInventario.forEach(art => {
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
    
    result.sort((a, b) => {
      const estadoOrden = { 'positivo': 1, 'negativo': 2, 'agotado': 3 };
      if (estadoOrden[a.estado] < estadoOrden[b.estado]) return -1;
      if (estadoOrden[a.estado] > estadoOrden[b.estado]) return 1;
      
      if (a.CodigoArticulo < b.CodigoArticulo) return -1;
      if (a.CodigoArticulo > b.CodigoArticulo) return 1;
      return 0;
    });
    
    return result;
  }, [inventario, searchTerm, filters, sortConfig]);

  const stats = useMemo(() => {
    const totalArticulos = filteredInventario.length;
    const totalUnidades = filteredInventario.reduce((total, art) => total + art.totalStock, 0);
    const totalUbicaciones = filteredInventario.reduce((total, art) => total + art.ubicaciones.length, 0);
    
    return { totalArticulos, totalUnidades, totalUbicaciones };
  }, [filteredInventario]);

  const totalPages = Math.ceil(filteredInventario.length / PAGE_SIZE);
  const paginatedInventario = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredInventario.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredInventario, currentPage]);

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

  const iniciarEdicionCantidad = (articulo, nombreAlmacen, cantidadActual, clave, codigoAlmacen, ubicacionStr, partida) => {
    setEditandoCantidad({
      articulo,
      nombreAlmacen,
      cantidadActual,
      clave,
      codigoAlmacen,
      ubicacionStr,
      partida
    });
    setNuevaCantidad(cantidadActual.toString());
  };

  const guardarAjustePendiente = () => {
    if (!editandoCantidad || !nuevaCantidad) return;
    
    const nuevoAjuste = {
      articulo: editandoCantidad.articulo,
      codigoAlmacen: editandoCantidad.codigoAlmacen,
      ubicacionStr: editandoCantidad.ubicacionStr,
      partida: editandoCantidad.partida || '',
      nuevaCantidad: parseFloat(nuevaCantidad)
    };
    
    setAjustesPendientes(prev => [...prev, nuevoAjuste]);
    setEditandoCantidad(null);
    setNuevaCantidad('');
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

  const formatearFecha = (fechaStr) => {
    const fecha = new Date(fechaStr);
    return fecha.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const InventarioHeader = () => (
    <div className="inventario-header">
      <div>
        <h1>Inventario de {nombreEmpresa}</h1>
        <p className="subtitle">Gestión completa de stock y ajustes</p>
      </div>
      
      <div className="header-actions">
        <div className="search-container">
          <input
            type="text"
            placeholder={activeTab === 'inventario' 
              ? "Buscar artículo..." 
              : "Buscar en historial..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <FiSearch className="search-icon" />
        </div>
        
        {activeTab === 'inventario' && (
          <div className="inventario-stats">
            <div className="stat-card">
              <span className="stat-value">{stats.totalArticulos}</span>
              <span className="stat-label">Artículos</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {stats.totalUnidades.toLocaleString()}
              </span>
              <span className="stat-label">Unidades</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{stats.totalUbicaciones}</span>
              <span className="stat-label">Ubicaciones</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const FiltersPanel = () => (
    activeTab === 'inventario' && (
      <div className="filters-panel">
        <div className="filter-group">
          <label htmlFor="almacen-filter">
            <FiFilter /> Almacén:
          </label>
          <input
            type="text"
            id="almacen-filter"
            name="almacen"
            placeholder="Filtrar por almacén"
            value={filters.almacen}
            onChange={handleFilterChange}
          />
        </div>
        
        <div className="filter-group">
          <label htmlFor="ubicacion-filter">
            <FiFilter /> Ubicación:
          </label>
          <input
            type="text"
            id="ubicacion-filter"
            name="ubicacion"
            placeholder="Filtrar por ubicación"
            value={filters.ubicacion}
            onChange={handleFilterChange}
          />
        </div>
        
        <div className="filter-group">
          <label htmlFor="familia-filter">
            <FiFilter /> Familia:
          </label>
          <input
            type="text"
            id="familia-filter"
            name="familia"
            placeholder="Buscar por familia"
            value={filters.familia}
            onChange={handleFilterChange}
          />
        </div>
        
        <div className="filter-group">
          <label htmlFor="subfamilia-filter">
            <FiFilter /> Subfamilia:
          </label>
          <input
            type="text"
            id="subfamilia-filter"
            name="subfamilia"
            placeholder="Buscar por subfamilia"
            value={filters.subfamilia}
            onChange={handleFilterChange}
          />
        </div>
        
        <button 
          className="btn-toggle-all"
          onClick={toggleTodosArticulos}
          aria-label={Object.keys(articulosExpandidos).length > 0 
            ? 'Contraer todos los artículos' 
            : 'Expandir todos los artículos'}
        >
          {Object.keys(articulosExpandidos).length > 0 ? (
            <>
              <FiChevronUp /> Contraer Todo
            </>
          ) : (
            <>
              <FiChevronDown /> Expandir Todo
            </>
          )}
        </button>
      </div>
    )
  );

  const PendingAdjustmentsPanel = () => (
    activeTab === 'inventario' && ajustesPendientes.length > 0 && (
      <div className="panel-ajustes">
        <div className="panel-header">
          <h3>Ajustes Pendientes</h3>
          <div className="panel-actions">
            <span className="badge">{ajustesPendientes.length} pendientes</span>
            <button 
              className="btn-confirmar"
              onClick={confirmarAjustes}
            >
              <FiCheck /> Confirmar Ajustes
            </button>
          </div>
        </div>
        
        <div className="lista-ajustes">
          {ajustesPendientes.map((ajuste, index) => (
            <div key={index} className="ajuste-item">
              <div className="ajuste-info">
                <div className="articulo">
                  <span className="label">Artículo:</span> 
                  <span className="value">{ajuste.articulo}</span>
                </div>
                <div className="ubicacion">
                  <span className="label">Ubicación:</span> 
                  <span className="value">{ajuste.ubicacionStr}</span>
                </div>
                <div className="partida">
                  <span className="label">Partida:</span> 
                  <span className="value">{ajuste.partida || 'N/A'}</span>
                </div>
                <div className="cantidad">
                  <span className="label">Nueva Cantidad:</span> 
                  <span className="value">
                    <strong>{ajuste.nuevaCantidad}</strong>
                  </span>
                </div>
              </div>
              <button 
                className="btn-eliminar"
                onClick={() => eliminarAjustePendiente(index)}
              >
                <FiX /> Eliminar
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  );

  const EditModal = () => (
    editandoCantidad && (
      <div className="modal-edicion">
        <div className="modal-contenido">
          <h3>Editar Cantidad</h3>
          <div className="modal-details">
            <div className="detail-item">
              <span>Artículo:</span>
              <span>{editandoCantidad.articulo}</span>
            </div>
            <div className="detail-item">
              <span>Almacén:</span>
              <span>{editandoCantidad.nombreAlmacen}</span>
            </div>
            <div className="detail-item">
              <span>Ubicación:</span>
              <span>{editandoCantidad.ubicacionStr}</span>
            </div>
            <div className="detail-item">
              <span>Partida:</span>
              <span>{editandoCantidad.partida || 'N/A'}</span>
            </div>
          </div>
          
          <div className="form-group">
            <label>Cantidad Actual:</label>
            <input 
              type="text" 
              value={editandoCantidad.cantidadActual} 
              disabled 
              className="cantidad-actual"
            />
          </div>
          
          <div className="form-group">
            <label>Nueva Cantidad:</label>
            <input 
              type="number" 
              value={nuevaCantidad}
              onChange={(e) => setNuevaCantidad(e.target.value)}
              autoFocus
              className="nueva-cantidad"
            />
          </div>
          
          <div className="modal-acciones">
            <button 
              className="btn-cancelar"
              onClick={() => setEditandoCantidad(null)}
            >
              Cancelar
            </button>
            <button 
              className="btn-guardar"
              onClick={guardarAjustePendiente}
            >
              Guardar Ajuste
            </button>
          </div>
        </div>
      </div>
    )
  );

  const DetallesModalComponent = () => {
    if (!detallesModal) return null;

    return (
      <div className="modal-detalles">
        <div className="modal-contenido">
          <button className="cerrar-modal" onClick={() => setDetallesModal(null)}>
            &times;
          </button>
          
          <h3>Detalles de Variantes</h3>
          
          <div className="detalles-container">
            {detallesModal.length === 0 ? (
              <p>No hay detalles de variantes para este artículo</p>
            ) : (
              detallesModal.map((detalle, index) => (
                <div key={index} className="variante-grupo">
                  <div className="variante-header">
                    <span className="color-variante">
                      <strong>Color:</strong> {detalle.color.nombre}
                    </span>
                    <span className="talla-grupo">
                      <strong>Grupo Talla:</strong> {detalle.grupoTalla.nombre}
                    </span>
                  </div>
                  
                  <table className="detalles-table">
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
                          <tr key={idx}>
                            <td>{codigoTalla}</td>
                            <td>{talla.descripcion}</td>
                            <td>{talla.unidades}</td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  <div className="variante-total">
                    <strong>Total unidades:</strong> {detalle.unidades}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const InventoryList = () => {
    if (error) {
      return (
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <p>{error}</p>
          <button 
            className="btn-reload"
            onClick={() => window.location.reload()}
          >
            Recargar Inventario
          </button>
        </div>
      );
    }

    if (loading.inventario) {
      return (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Cargando inventario...</p>
        </div>
      );
    }

    if (paginatedInventario.length === 0) {
      return (
        <div className="no-results">
          <p>No se encontraron artículos con los filtros seleccionados</p>
          <button 
            className="btn-clear-filters"
            onClick={() => {
              setSearchTerm('');
              setFilters({
                almacen: '',
                ubicacion: '',
                familia: '',
                subfamilia: ''
              });
            }}
          >
            Limpiar Filtros
          </button>
        </div>
      );
    }

    return (
      <div className="inventario-list">
        {paginatedInventario.map(articulo => (
          <div 
            key={articulo.CodigoArticulo} 
            className={`inventario-item ${articulo.estado === 'agotado' ? 'estado-agotado' : ''} ${articulo.estado === 'negativo' ? 'estado-negativo' : ''}`}
            style={{ borderLeft: `5px solid ${getEstadoColor(articulo.estado)}` }}
          >
            <div 
              className="articulo-header"
              onClick={() => toggleExpandirArticulo(articulo.CodigoArticulo)}
            >
              <div className="articulo-info">
                <span className="articulo-codigo">{articulo.CodigoArticulo}</span>
                <span className="articulo-descripcion">{articulo.DescripcionArticulo}</span>
                <div className="articulo-categorias">
                  {articulo.CodigoFamilia && (
                    <span className="familia-tag">Familia: {articulo.CodigoFamilia}</span>
                  )}
                  {articulo.CodigoSubfamilia && (
                    <span className="subfamilia-tag">Subfamilia: {articulo.CodigoSubfamilia}</span>
                  )}
                </div>
              </div>
              <div className="articulo-total">
                <span className="total-unidades">
                  {articulo.totalStock.toLocaleString()} unidades
                  <span className="ubicaciones-count">
                    ({articulo.ubicaciones.length} ubicaciones)
                  </span>
                </span>
                <span className={`expand-icon ${articulosExpandidos[articulo.CodigoArticulo] ? 'expanded' : ''}`}>
                  {articulosExpandidos[articulo.CodigoArticulo] ? <FiChevronUp /> : <FiChevronDown />}
                </span>
              </div>
            </div>
            
            {articulosExpandidos[articulo.CodigoArticulo] && (
              <div className="ubicaciones-list">
                <div className="ubicaciones-header">
                  <span onClick={() => requestSort('NombreAlmacen')}>
                    Almacén {sortConfig.key === 'NombreAlmacen' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </span>
                  <span onClick={() => requestSort('Ubicacion')}>
                    Ubicación {sortConfig.key === 'Ubicacion' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </span>
                  <span>Descripción</span>
                  <span>Partida</span>
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
                    className="ubicacion-item"
                  >
                    <span className="ubicacion-almacen">
                      {ubicacion.NombreAlmacen}
                    </span>
                    <span className="ubicacion-codigo">{ubicacion.Ubicacion}</span>
                    <span className="ubicacion-desc">{ubicacion.DescripcionUbicacion || 'Sin descripción'}</span>
                    <span className="ubicacion-partida">{ubicacion.Partida || 'N/A'}</span>
                    <span 
                      className="ubicacion-cantidad" 
                      style={getStockStyle(ubicacion.Cantidad)}
                    >
                      {ubicacion.Cantidad.toLocaleString()}
                    </span>
                    <div className="acciones-ubicacion">
                      <button 
                        className="btn-editar"
                        onClick={() => iniciarEdicionCantidad(
                          articulo.CodigoArticulo,
                          ubicacion.NombreAlmacen,
                          ubicacion.Cantidad,
                          ubicacion.clave,
                          ubicacion.CodigoAlmacen,
                          ubicacion.Ubicacion,
                          ubicacion.Partida
                        )}
                      >
                        <FiEdit />
                      </button>
                      
                      {ubicacion.detalles && (
                        <button 
                          className="btn-detalles"
                          onClick={() => verDetalles(ubicacion.MovPosicionLinea)}
                        >
                          ...
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
    );
  };

  const HistorialAjustesList = () => {
    if (error) {
      return (
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <p>{error}</p>
          <button 
            className="btn-reload"
            onClick={cargarHistorialAjustes}
          >
            Recargar Historial
          </button>
        </div>
      );
    }

    if (loading.historial) {
      return (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Cargando historial de ajustes...</p>
        </div>
      );
    }

    if (historialAjustes.length === 0) {
      return (
        <div className="no-results">
          <p>No se encontraron ajustes en el historial</p>
        </div>
      );
    }

    return (
      <div className="historial-list">
        {historialAjustes.map(item => {
          const expandido = fechasExpandidas[item.fecha];
          
          return (
            <div key={item.fecha} className="historial-item">
              <div 
                className="fecha-header"
                onClick={() => toggleExpandirFecha(item.fecha)}
              >
                <div className="fecha-info">
                  <span className="fecha">{formatearFecha(item.fecha)}</span>
                  <span className="resumen">
                    {item.totalAjustes} ajustes realizados
                  </span>
                </div>
                <span className={`expand-icon ${expandido ? 'expanded' : ''}`}>
                  {expandido ? <FiChevronUp /> : <FiChevronDown />}
                </span>
              </div>
              
              {expandido && (
                <div className="detalles-ajustes">
                  <table className="detalles-table">
                    <thead>
                      <tr>
                        <th>Artículo</th>
                        <th>Almacén</th>
                        <th>Ubicación</th>
                        <th>Partida</th>
                        <th>Ajuste</th>
                        <th>Comentario</th>
                        <th>Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.detalles.map(detalle => (
                        <tr key={`${detalle.CodigoArticulo}-${detalle.FechaRegistro}`}>
                          <td>
                            <div className="articulo-info">
                              <span className="codigo">{detalle.CodigoArticulo}</span>
                              <span className="descripcion">{detalle.DescripcionArticulo}</span>
                            </div>
                          </td>
                          <td>
                            <span className="almacen">{detalle.NombreAlmacen}</span>
                            <span className="codigo-almacen">({detalle.CodigoAlmacen})</span>
                          </td>
                          <td>
                            <span className="ubicacion">{detalle.Ubicacion}</span>
                            <span className="desc-ubicacion">{detalle.DescripcionUbicacion || 'N/A'}</span>
                          </td>
                          <td>{detalle.Partida || '-'}</td>
                          <td className={detalle.Diferencia > 0 ? 'positivo' : 'negativo'}>
                            {detalle.Diferencia > 0 ? '+' : ''}{detalle.Diferencia}
                          </td>
                          <td>{detalle.Comentario}</td>
                          <td>
                            {new Date(detalle.FechaRegistro).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const PaginationComponent = () => (
    activeTab === 'inventario' && totalPages > 1 && (
      <div className="pagination">
        <button 
          onClick={() => goToPage(currentPage - 1)} 
          disabled={currentPage === 1}
          className="pagination-btn"
        >
          Anterior
        </button>
        
        <span>Página {currentPage} de {totalPages}</span>
        
        <button 
          onClick={() => goToPage(currentPage + 1)} 
          disabled={currentPage === totalPages}
          className="pagination-btn"
        >
          Siguiente
        </button>
      </div>
    )
  );

  return (
    <div className="inventario-container">
      <Navbar />
      
      <InventarioHeader />
      
      <div className="tabs-container">
        <button 
          className={`tab-btn ${activeTab === 'inventario' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventario')}
        >
          <FiList /> Inventario Actual
        </button>
        <button 
          className={`tab-btn ${activeTab === 'historial' ? 'active' : ''}`}
          onClick={() => setActiveTab('historial')}
        >
          <FiClock /> Historial de Ajustes
        </button>
      </div>
      
      <FiltersPanel />
      <PendingAdjustmentsPanel />
      
      {cargandoDetalles && (
        <div className="cargando-detalles">
          <div className="spinner"></div>
          <p>Cargando detalles...</p>
        </div>
      )}
      
      {activeTab === 'inventario' ? (
        <>
          <InventoryList />
          <PaginationComponent />
        </>
      ) : (
        <HistorialAjustesList />
      )}
      
      <EditModal />
      <DetallesModalComponent />
    </div>
  );
};

export default InventarioPage;