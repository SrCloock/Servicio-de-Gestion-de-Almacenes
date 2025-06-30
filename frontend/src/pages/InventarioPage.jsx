import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import UserInfoBar from '../components/UserInfoBar';
import Navbar from '../components/Navbar';
import { FiSearch, FiChevronDown, FiChevronUp, FiDownload, FiFilter, FiEdit, FiX, FiCheck } from 'react-icons/fi';
import '../styles/InventarioPage.css';

const PAGE_SIZE = 30;

const InventarioPage = () => {
  const [inventario, setInventario] = useState([]);
  const [articulosExpandidos, setArticulosExpandidos] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    almacen: '',
    ubicacion: '',
    minStock: '',
    maxStock: ''
  });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [ajustesPendientes, setAjustesPendientes] = useState([]);
  const [editandoCantidad, setEditandoCantidad] = useState(null);
  const [nuevaCantidad, setNuevaCantidad] = useState('');
  
  const user = JSON.parse(localStorage.getItem('user'));
  const codigoEmpresa = user?.CodigoEmpresa;
  const nombreEmpresa = user?.Empresa || 'Demos';

  // Agrupar inventario por artículo con claves únicas
  const agruparPorArticulo = useCallback((data) => {
    const agrupado = {};
    let claveCounter = {};
    
    data.forEach(item => {
      const baseClave = `${item.CodigoArticulo}-${item.CodigoAlmacen}-${item.Ubicacion}`;
      
      // Contador para garantizar claves únicas
      if (!claveCounter[baseClave]) {
        claveCounter[baseClave] = 0;
      }
      claveCounter[baseClave]++;
      
      const claveUnica = `${baseClave}-${claveCounter[baseClave]}`;
      
      if (!agrupado[item.CodigoArticulo]) {
        agrupado[item.CodigoArticulo] = {
          CodigoArticulo: item.CodigoArticulo,
          DescripcionArticulo: item.DescripcionArticulo,
          ubicaciones: [],
          totalStock: 0,
          estado: 'positivo'
        };
      }
      
      const ubicacion = {
        clave: claveUnica,
        CodigoAlmacen: item.CodigoAlmacen,
        NombreAlmacen: item.NombreAlmacen,
        Ubicacion: item.Ubicacion,
        DescripcionUbicacion: item.DescripcionUbicacion,
        Cantidad: item.Cantidad
      };
      
      agrupado[item.CodigoArticulo].ubicaciones.push(ubicacion);
      agrupado[item.CodigoArticulo].totalStock += item.Cantidad;
    });
    
    // Determinar estado del artículo
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
    if (!codigoEmpresa) return;

    try {
      setLoading(true);
      setError('');
      const headers = getAuthHeader();
      const response = await axios.get(
        'http://localhost:3000/inventario/stock-total',
        { headers }
      );
      
      setInventario(agruparPorArticulo(response.data));
      setLoading(false);
    } catch (error) {
      console.error('Error al obtener inventario:', error);
      setError('Error al cargar el inventario. Intente nuevamente.');
      setLoading(false);
    }
  }, [codigoEmpresa, agruparPorArticulo]);

  useEffect(() => {
    cargarInventario();
  }, [cargarInventario]);

  // Alternar vista expandida
  const toggleExpandirArticulo = (codigoArticulo) => {
    setArticulosExpandidos(prev => ({
      ...prev,
      [codigoArticulo]: !prev[codigoArticulo]
    }));
  };

  // Expandir/contraer todos
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

  // Manejar cambio de filtros
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1);
  };

  // Solicitar ordenamiento
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Inventario filtrado y ordenado
  const filteredInventario = useMemo(() => {
    let result = [...inventario];
    
    // Aplicar filtros
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
          ubic.Ubicacion.toLowerCase().includes(filters.ubicacion.toLowerCase())
        )
      );
    }
    
    if (filters.minStock) {
      const min = Number(filters.minStock);
      result = result.filter(articulo => articulo.totalStock >= min);
    }
    
    if (filters.maxStock) {
      const max = Number(filters.maxStock);
      result = result.filter(articulo => articulo.totalStock <= max);
    }
    
    // Ordenamiento personalizado
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

  // Calcular estadísticas
  const stats = useMemo(() => {
    const totalArticulos = filteredInventario.length;
    const totalUnidades = filteredInventario.reduce((total, art) => total + art.totalStock, 0);
    const totalUbicaciones = filteredInventario.reduce((total, art) => total + art.ubicaciones.length, 0);
    
    return { totalArticulos, totalUnidades, totalUbicaciones };
  }, [filteredInventario]);

  // Paginación
  const totalPages = Math.ceil(filteredInventario.length / PAGE_SIZE);
  const paginatedInventario = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredInventario.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredInventario, currentPage]);

  // Cambiar página
  const goToPage = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  // Exportar a CSV
  const exportToCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Código Artículo,Descripción,Almacén,Ubicación,Stock\n";
    
    filteredInventario.forEach(articulo => {
      articulo.ubicaciones.forEach(ubicacion => {
        csvContent += `${articulo.CodigoArticulo},"${articulo.DescripcionArticulo}",${ubicacion.NombreAlmacen},${ubicacion.Ubicacion},${ubicacion.Cantidad}\n`;
      });
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `inventario_${nombreEmpresa}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Estilo para cantidad
  const getStockStyle = (cantidad) => {
    if (cantidad === 0) return { color: '#e74c3c', fontWeight: 'bold' };
    if (cantidad < 0) return { color: '#f39c12', fontWeight: '600' };
    return { color: '#27ae60' };
  };

  // Color de estado
  const getEstadoColor = (estado) => {
    switch (estado) {
      case 'positivo': return '#2ecc71';
      case 'negativo': return '#f39c12';
      case 'agotado': return '#e74c3c';
      default: return '#7f8c8d';
    }
  };

  // Iniciar edición de una cantidad
  const iniciarEdicionCantidad = (articulo, ubicacionInfo, cantidadActual, clave, codigoAlmacen, ubicacionStr) => {
    setEditandoCantidad({
      articulo,
      ubicacion: `${ubicacionInfo} (${codigoAlmacen}) - ${ubicacionStr}`,
      cantidadActual,
      clave,
      codigoAlmacen,
      ubicacionStr
    });
    setNuevaCantidad(cantidadActual.toString());
  };

  // Guardar ajuste pendiente
  const guardarAjustePendiente = () => {
    if (!editandoCantidad || !nuevaCantidad) return;
    
    const nuevoAjuste = {
      ...editandoCantidad,
      nuevaCantidad: parseFloat(nuevaCantidad),
      fecha: new Date().toISOString(),
      estado: 'pendiente'
    };
    
    // Actualizar lista de ajustes pendientes
    setAjustesPendientes(prev => [...prev, nuevoAjuste]);
    
    // Cerrar modal
    setEditandoCantidad(null);
    setNuevaCantidad('');
  };

  // Confirmar todos los ajustes
  const confirmarAjustes = async () => {
    try {
      const headers = getAuthHeader();
      const response = await axios.post(
        'http://localhost:3000/inventario/ajustar',
        { ajustes: ajustesPendientes },
        { headers }
      );
      
      if (response.data.success) {
        // Recargar inventario después de ajustar
        cargarInventario();
        // Limpiar ajustes pendientes
        setAjustesPendientes([]);
        alert('Ajustes realizados correctamente');
      }
    } catch (error) {
      console.error('Error al confirmar ajustes:', error);
      alert('Error al confirmar ajustes: ' + error.message);
    }
  };

  // Eliminar un ajuste pendiente
  const eliminarAjustePendiente = (index) => {
    setAjustesPendientes(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="inventario-container">
      <Navbar />
      <UserInfoBar />
      
      <div className="inventario-header">
        <div>
          <h1>Inventario de {nombreEmpresa}</h1>
          <p className="subtitle">Visión completa del stock en todas las ubicaciones</p>
        </div>
        
        <div className="header-actions">
          <div className="search-container">
            <input
              type="text"
              placeholder="Buscar artículo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <FiSearch className="search-icon" />
          </div>
          
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
          
          <button 
            className="btn-export"
            onClick={exportToCSV}
            title="Exportar a CSV"
          >
            <FiDownload /> Exportar
          </button>
        </div>
      </div>

      {/* Panel de Filtros */}
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
          <label htmlFor="minStock">Stock Mín:</label>
          <input
            type="number"
            id="minStock"
            name="minStock"
            placeholder="Mínimo"
            value={filters.minStock}
            onChange={handleFilterChange}
            min="0"
          />
        </div>
        
        <div className="filter-group">
          <label htmlFor="maxStock">Stock Máx:</label>
          <input
            type="number"
            id="maxStock"
            name="maxStock"
            placeholder="Máximo"
            value={filters.maxStock}
            onChange={handleFilterChange}
            min="0"
          />
        </div>
        
        <button 
          className="btn-toggle-all"
          onClick={toggleTodosArticulos}
        >
          {Object.keys(articulosExpandidos).length > 0 ? 'Contraer Todo' : 'Expandir Todo'}
        </button>
      </div>

      {/* Panel de Ajustes Pendientes */}
      {ajustesPendientes.length > 0 && (
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
                    <span className="value">{ajuste.ubicacion}</span>
                  </div>
                  <div className="cantidad">
                    <span className="label">Cantidad:</span> 
                    <span className="value">
                      {ajuste.cantidadActual} → <strong>{ajuste.nuevaCantidad}</strong>
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
      )}

      {/* Modal de Edición */}
      {editandoCantidad && (
        <div className="modal-edicion">
          <div className="modal-contenido">
            <h3>Editar Cantidad</h3>
            <div className="modal-details">
              <div className="detail-item">
                <span className="label">Artículo:</span>
                <span className="value">{editandoCantidad.articulo}</span>
              </div>
              <div className="detail-item">
                <span className="label">Ubicación:</span>
                <span className="value">{editandoCantidad.ubicacion}</span>
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
      )}

      {error ? (
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
      ) : loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Cargando inventario...</p>
        </div>
      ) : (
        <>
          <div className="inventario-list">
            {paginatedInventario.length === 0 ? (
              <div className="no-results">
                <p>No se encontraron artículos con los filtros seleccionados</p>
                <button 
                  className="btn-clear-filters"
                  onClick={() => {
                    setSearchTerm('');
                    setFilters({
                      almacen: '',
                      ubicacion: '',
                      minStock: '',
                      maxStock: ''
                    });
                  }}
                >
                  Limpiar Filtros
                </button>
              </div>
            ) : (
              paginatedInventario.map(articulo => (
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
                            {ubicacion.NombreAlmacen} <span className="codigo">({ubicacion.CodigoAlmacen})</span>
                          </span>
                          <span className="ubicacion-codigo">{ubicacion.Ubicacion}</span>
                          <span className="ubicacion-desc">{ubicacion.DescripcionUbicacion || 'Sin descripción'}</span>
                          <span 
                            className="ubicacion-cantidad" 
                            style={getStockStyle(ubicacion.Cantidad)}
                          >
                            {ubicacion.Cantidad.toLocaleString()}
                          </span>
                          <button 
                            className="btn-editar"
                            onClick={() => iniciarEdicionCantidad(
                              articulo.CodigoArticulo,
                              ubicacion.NombreAlmacen,
                              ubicacion.Cantidad,
                              ubicacion.clave,
                              ubicacion.CodigoAlmacen,
                              ubicacion.Ubicacion
                            )}
                          >
                            <FiEdit /> Editar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
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
          )}
        </>
      )}
    </div>
  );
};

export default InventarioPage;