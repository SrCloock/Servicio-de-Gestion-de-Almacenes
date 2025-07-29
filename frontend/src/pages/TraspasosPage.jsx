import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import { v4 as uuidv4 } from 'uuid';
import '../styles/TraspasosPage.css';

const TraspasosPage = () => {
  // Estados de la aplicación
  const [activeSection, setActiveSection] = useState('traspasos');
  const [activeTab, setActiveTab] = useState('articulo');
  const [loading, setLoading] = useState(false);
  const [almacenes, setAlmacenes] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [traspasosPendientes, setTraspasosPendientes] = useState([]);
  const [articuloBusqueda, setArticuloBusqueda] = useState('');
  const [articulosConStock, setArticulosConStock] = useState([]);
  const [articulosFiltrados, setArticulosFiltrados] = useState([]);
  const [pagination, setPagination] = useState({ 
    page: 1, 
    pageSize: 15,  // Changed to 15 items per page
    total: 0, 
    totalPages: 1 
  });
  const [loadingArticulos, setLoadingArticulos] = useState(false);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState(null);
  const [stockDisponible, setStockDisponible] = useState([]);
  const [almacenOrigen, setAlmacenOrigen] = useState('');
  const [ubicacionOrigen, setUbicacionOrigen] = useState('');
  const [almacenDestino, setAlmacenDestino] = useState('');
  const [ubicacionDestino, setUbicacionDestino] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [unidadMedida, setUnidadMedida] = useState(null);
  const [partida, setPartida] = useState('');
  const [showListaArticulos, setShowListaArticulos] = useState(false);
  const [allArticulosLoaded, setAllArticulosLoaded] = useState(false);
  const [ubicacionesAgrupadas, setUbicacionesAgrupadas] = useState([]);
  const [almacenExpandido, setAlmacenExpandido] = useState(null);
  const [ubicacionSeleccionada, setUbicacionSeleccionada] = useState(null);
  const [articulosUbicacion, setArticulosUbicacion] = useState([]);
  const [paginationUbicacion, setPaginationUbicacion] = useState({ 
    page: 1, 
    pageSize: 15,  // Changed to 15 items per page
    total: 0 
  });
  const [articuloUbicacionSeleccionado, setArticuloUbicacionSeleccionado] = useState(null);
  const [vistaUbicacion, setVistaUbicacion] = useState('seleccion');
  const [grupoUnicoOrigen, setGrupoUnicoOrigen] = useState('');
  
  // Referencias para manejar clics fuera del área de búsqueda
  const searchTimer = useRef(null);
  const searchRef = useRef(null);
  const listaRef = useRef(null);

  // Cargar datos iniciales al montar el componente
  useEffect(() => {
    const cargarDatosIniciales = async () => {
      try {
        const headers = getAuthHeader();
        const resAlmacenes = await axios.get('http://localhost:3000/almacenes', { headers });
        setAlmacenes(resAlmacenes.data);
        
        const resUbicaciones = await axios.get(
          'http://localhost:3000/ubicaciones-agrupadas', 
          { headers }
        );
        setUbicacionesAgrupadas(resUbicaciones.data);
      } catch (error) {
        console.error('Error cargando datos iniciales:', error);
      }
    };
    
    cargarDatosIniciales();
    
    // Manejador para cerrar la lista de artículos al hacer clic fuera
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowListaArticulos(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cargar artículos con stock
  const cargarArticulosConStock = async (page = 1, search = '', append = false) => {
    setLoadingArticulos(true);
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        'http://localhost:3000/stock/articulos-con-stock', 
        {
          headers,
          params: {
            page,
            pageSize: pagination.pageSize,
            searchTerm: search
          }
        }
      );
      
      if (append) {
        setArticulosConStock(prev => [...prev, ...response.data.articulos]);
      } else {
        setArticulosConStock(response.data.articulos);
      }
      
      setPagination(response.data.pagination);
      setArticulosFiltrados(response.data.articulos);
      setAllArticulosLoaded(page >= response.data.pagination.totalPages);
    } catch (error) {
      console.error('Error cargando artículos con stock:', error);
      setArticulosConStock([]);
      setArticulosFiltrados([]);
    } finally {
      setLoadingArticulos(false);
    }
  };

  // Filtrar artículos según término de búsqueda
  useEffect(() => {
    if (articuloBusqueda.trim() === '') {
      setArticulosFiltrados(articulosConStock);
      return;
    }
    
    const termino = articuloBusqueda.toLowerCase();
    const filtrados = articulosConStock.filter(articulo => 
      articulo.CodigoArticulo.toLowerCase().includes(termino) || 
      articulo.DescripcionArticulo.toLowerCase().includes(termino)
    );
    
    setArticulosFiltrados(filtrados);
  }, [articuloBusqueda, articulosConStock]);

  // Manejar scroll infinito en la lista de artículos
  const handleScrollLista = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const isNearBottom = scrollHeight - scrollTop <= clientHeight * 1.2;
    
    if (isNearBottom && !loadingArticulos && !allArticulosLoaded) {
      cargarArticulosConStock(pagination.page + 1, articuloBusqueda, true);
    }
  };

  // Cargar stock cuando se selecciona un artículo
  useEffect(() => {
    const cargarStock = async () => {
      if (!articuloSeleccionado) return;
      
      try {
        const headers = getAuthHeader();
        const response = await axios.get(
          `http://localhost:3000/stock/por-articulo?codigoArticulo=${articuloSeleccionado.CodigoArticulo}`,
          { headers }
        );
        
        setStockDisponible(response.data);
        
        if (response.data.length > 0) {
          const almacenConMasStock = response.data.reduce((max, item) => 
            item.Cantidad > max.Cantidad ? item : max
          );
          
          setAlmacenOrigen(almacenConMasStock.CodigoAlmacen);
          setUbicacionOrigen(almacenConMasStock.Ubicacion);
          setUnidadMedida(almacenConMasStock.UnidadMedida || null);
          setPartida(almacenConMasStock.Partida || '');
        }
      } catch (error) {
        console.error('Error cargando stock:', error);
        setStockDisponible([]);
      }
    };
    
    cargarStock();
  }, [articuloSeleccionado]);

  // Cargar artículos por ubicación
  const cargarArticulosUbicacion = useCallback(async (almacen, ubicacion, page = 1) => {
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/stock/por-ubicacion`,
        { 
          headers,
          params: {
            codigoAlmacen: almacen,
            ubicacion: ubicacion,
            page,
            pageSize: paginationUbicacion.pageSize
          }
        }
      );
      
      setArticulosUbicacion(response.data.articulos);
      setPaginationUbicacion({
        page,
        pageSize: response.data.pageSize,
        total: response.data.total
      });
      
      setUbicacionSeleccionada({ almacen, ubicacion });
      setVistaUbicacion('detalle');
    } catch (error) {
      console.error('Error cargando artículos:', error);
      setArticulosUbicacion([]);
    }
  }, [paginationUbicacion.pageSize]);

  // Cargar ubicaciones de destino
  const cargarUbicacionesDestino = useCallback(async (excluirUbicacion = '') => {
    if (!almacenDestino) return;
    
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        'http://localhost:3000/ubicaciones',
        { 
          headers,
          params: {
            codigoAlmacen: almacenDestino,
            excluirUbicacion
          }
        }
      );
      
      setUbicacionesDestino(response.data);
    } catch (error) {
      console.error('Error cargando ubicaciones destino:', error);
      setUbicacionesDestino([]);
    }
  }, [almacenDestino]);

  useEffect(() => {
    cargarUbicacionesDestino();
  }, [almacenDestino, cargarUbicacionesDestino]);

  // Cargar historial de traspasos
  const cargarHistorial = useCallback(async () => {
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        'http://localhost:3000/historial-traspasos',
        { headers }
      );
      setHistorial(response.data);
    } catch (error) {
      console.error('Error cargando historial:', error);
    }
  }, []);

  // Seleccionar artículo de la lista
  const seleccionarArticulo = (articulo) => {
    setArticuloSeleccionado(articulo);
    setArticuloBusqueda(''); // Clear search input
    setShowListaArticulos(false);
    setAllArticulosLoaded(false);
  };

  // Cambiar almacén de origen
  const cambiarAlmacenOrigen = (codigoAlmacen) => {
    setAlmacenOrigen(codigoAlmacen);
    setUbicacionOrigen('');
    setUnidadMedida(null);
    setPartida('');
    
    const ubicacionesEnAlmacen = stockDisponible.filter(
      item => item.CodigoAlmacen === codigoAlmacen
    );
    
    if (ubicacionesEnAlmacen.length > 0) {
      const ubicacionConMasStock = ubicacionesEnAlmacen.reduce((max, item) => 
        item.Cantidad > max.Cantidad ? item : max
      );
      
      setUbicacionOrigen(ubicacionConMasStock.Ubicacion);
      setUnidadMedida(ubicacionConMasStock.UnidadMedida || null);
      setPartida(ubicacionConMasStock.Partida || '');
    }
  };

  // Cambiar ubicación de origen
  const cambiarUbicacionOrigen = (ubicacion, unidad, grupoUnico, partida) => {
    setUbicacionOrigen(ubicacion);
    setUnidadMedida(unidad || null);
    setGrupoUnicoOrigen(grupoUnico);
    setPartida(partida || '');
    cargarUbicacionesDestino(ubicacion);
  };

  // Manejar cambio de cantidad
  const handleCantidadChange = (e) => {
    const value = e.target.value;
    if (/^\d*$/.test(value)) {
      setCantidad(value);
      
      if (articuloSeleccionado && stockDisponible.length > 0) {
        const stockItem = stockDisponible.find(
          item => item.CodigoAlmacen === almacenOrigen && 
                  item.Ubicacion === ubicacionOrigen &&
                  item.UnidadMedida === unidadMedida &&
                  item.Partida === partida
        );
        
        if (stockItem && parseInt(value) > stockItem.Cantidad) {
          setCantidad(stockItem.Cantidad.toString());
        }
      }
    }
  };

  // Agregar traspaso desde modo artículo
  const agregarTraspasoArticulo = () => {
    const cantidadNum = parseInt(cantidad);
    if (isNaN(cantidadNum)) {
      alert('La cantidad debe ser un número');
      return;
    }
    
    if (cantidadNum <= 0) {
      alert('La cantidad debe ser un número positivo');
      return;
    }

    if (!articuloSeleccionado || !almacenOrigen || !ubicacionOrigen || !almacenDestino || !ubicacionDestino || !cantidad || !unidadMedida) {
      alert('Complete todos los campos');
      return;
    }
    
    const stockItem = stockDisponible.find(
      item => item.CodigoAlmacen === almacenOrigen && 
              item.Ubicacion === ubicacionOrigen &&
              item.UnidadMedida === unidadMedida &&
              (item.Partida || '') === partida
    );
    
    if (!stockItem || cantidadNum > stockItem.Cantidad) {
      alert(`Cantidad supera el stock disponible (${stockItem?.Cantidad || 0})`);
      return;
    }
    
    const nuevoTraspaso = {
      id: uuidv4(),
      articulo: {
        ...articuloSeleccionado,
        unidadMedida: stockItem?.UnidadMedida || null,
        partida: stockItem?.Partida || ''
      },
      origen: {
        almacen: almacenOrigen,
        ubicacion: ubicacionOrigen,
        grupoUnico: grupoUnicoOrigen
      },
      destino: {
        almacen: almacenDestino,
        ubicacion: ubicacionDestino
      },
      cantidad: cantidadNum,
      unidadMedida: stockItem?.UnidadMedida || null,
      partida: stockItem?.Partida || ''
    };
    
    setTraspasosPendientes([...traspasosPendientes, nuevoTraspaso]);
    
    setArticuloSeleccionado(null);
    setArticuloBusqueda('');
    setAlmacenOrigen('');
    setUbicacionOrigen('');
    setAlmacenDestino('');
    setUbicacionDestino('');
    setCantidad('');
    setUnidadMedida(null);
    setPartida('');
  };

  // Agregar traspaso desde modo ubicación
  const agregarTraspasoUbicacion = () => {
    const cantidadNum = parseInt(cantidad);
    if (isNaN(cantidadNum)) {
      alert('La cantidad debe ser un número');
      return;
    }
    
    if (cantidadNum <= 0) {
      alert('La cantidad debe ser un número positivo');
      return;
    }

    if (!articuloUbicacionSeleccionado || !almacenDestino || !ubicacionDestino || !cantidad) {
      alert('Complete todos los campos');
      return;
    }
    
    if (cantidadNum > articuloUbicacionSeleccionado.Cantidad) {
      alert(`Cantidad supera el stock disponible (${articuloUbicacionSeleccionado.Cantidad})`);
      return;
    }
    
    const nuevoTraspaso = {
      id: uuidv4(),
      articulo: {
        ...articuloUbicacionSeleccionado,
        unidadMedida: articuloUbicacionSeleccionado.UnidadMedida || null,
        partida: articuloUbicacionSeleccionado.Partida || ''
      },
      origen: {
        almacen: ubicacionSeleccionada.almacen,
        ubicacion: ubicacionSeleccionada.ubicacion
      },
      destino: {
        almacen: almacenDestino,
        ubicacion: ubicacionDestino
      },
      cantidad: cantidadNum,
      unidadMedida: articuloUbicacionSeleccionado.UnidadMedida || null,
      partida: articuloUbicacionSeleccionado.Partida || ''
    };
    
    setTraspasosPendientes([...traspasosPendientes, nuevoTraspaso]);
    
    setArticuloUbicacionSeleccionado(null);
    setAlmacenDestino('');
    setUbicacionDestino('');
    setCantidad('');
  };

  // Confirmar traspasos pendientes
  const confirmarTraspasos = async () => {
    if (traspasosPendientes.length === 0) {
      alert('No hay traspasos para confirmar');
      return;
    }
    
    setLoading(true);
    
    try {
      const headers = getAuthHeader();
      const empresa = JSON.parse(localStorage.getItem('user')).CodigoEmpresa;
      
      await Promise.all(traspasosPendientes.map(traspaso => 
        axios.post('http://localhost:3000/traspaso', {
          articulo: traspaso.articulo.CodigoArticulo,
          origenAlmacen: traspaso.origen.almacen,
          origenUbicacion: traspaso.origen.ubicacion,
          destinoAlmacen: traspaso.destino.almacen,
          destinoUbicacion: traspaso.destino.ubicacion,
          cantidad: traspaso.cantidad,
          unidadMedida: traspaso.unidadMedida,
          partida: traspaso.partida,
          codigoEmpresa: empresa
        }, { headers }))
      );

      await cargarHistorial();
      setTraspasosPendientes([]);
      setActiveSection('historial');
    } catch (err) {
      console.error('Error confirmando traspasos:', err);
      const errorMsg = err.response?.data?.mensaje || err.message;
      alert(`Error al realizar traspasos: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  // Obtener nombre del almacén
  const getNombreAlmacen = (codigo) => {
    const almacen = almacenes.find(a => a.CodigoAlmacen === codigo);
    return almacen ? `${almacen.Almacen} (${codigo})` : codigo;
  };

  // Formatear fecha para mostrar
  const formatFecha = (fechaStr) => {
    if (!fechaStr) return 'Fecha no disponible';
    
    try {
      // Si ya viene formateada desde el backend
      if (typeof fechaStr === 'string' && fechaStr.includes('/')) {
        return fechaStr;
      }
      
      // Si es un objeto Date
      if (fechaStr instanceof Date) {
        return fechaStr.toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }
      
      // Si es una cadena ISO
      const fecha = new Date(fechaStr);
      if (!isNaN(fecha.getTime())) {
        return fecha.toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }
      
      return fechaStr; // Devolver original si no se puede parsear
    } catch (e) {
      console.error('Error formateando fecha:', e);
      return fechaStr;
    }
  };

  // Formatear cantidad para mostrar
  const formatCantidad = (valor) => {
    const num = parseFloat(valor);
    return isNaN(num) ? '0' : num.toLocaleString('es-ES', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  // Formatear unidad de medida
  const formatUnidadMedida = (unidad) => {
    return unidad || 'unidades';
  };

  // Renderizado completo del componente
  return (
    <div className="traspasos-container">
      <h1>Traspaso entre Ubicaciones</h1>
      
      <div className="section-selector">
        <button 
          className={`section-btn ${activeSection === 'traspasos' ? 'active' : ''}`}
          onClick={() => setActiveSection('traspasos')}
        >
          Traspasos
        </button>
        
        <button 
          className={`section-btn ${activeSection === 'verificacion' ? 'active' : ''}`}
          onClick={() => traspasosPendientes.length > 0 
            ? setActiveSection('verificacion') 
            : alert('Agregue traspasos primero')
          }
        >
          Verificación
          {traspasosPendientes.length > 0 && (
            <span className="badge">{traspasosPendientes.length}</span>
          )}
        </button>
        
        <button 
          className={`section-btn ${activeSection === 'historial' ? 'active' : ''}`}
          onClick={() => {
            setActiveSection('historial');
            cargarHistorial();
          }}
        >
          Historial
        </button>
      </div>
      
      {activeSection === 'traspasos' && (
        <div className="traspasos-section">
          <div className="tabs-container">
            <button 
              className={`tab-btn ${activeTab === 'articulo' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('articulo');
                setVistaUbicacion('seleccion');
              }}
            >
              Por Artículo
            </button>
            
            <button 
              className={`tab-btn ${activeTab === 'ubicacion' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('ubicacion');
                setVistaUbicacion('seleccion');
              }}
            >
              Por Ubicación
            </button>
          </div>
          
          {activeTab === 'articulo' && (
            <div className="modo-articulo">
              <div className="form-section">
                <h2>Artículos con Stock</h2>
                <div className="form-group">
                  <label>Buscar artículo:</label>
                  <div className="search-container" ref={searchRef}>
                    <input
                      type="text"
                      value={articuloBusqueda}
                      onChange={(e) => setArticuloBusqueda(e.target.value)}
                      onFocus={() => {
                        setShowListaArticulos(true);
                        if (articulosConStock.length === 0) {
                          cargarArticulosConStock();
                        }
                      }}
                      placeholder="Código o descripción..."
                      className="search-input"
                    />
                    
                    {showListaArticulos && (
                      <div 
                        className="resultados-busqueda"
                        ref={listaRef}
                        onScroll={handleScrollLista}
                      >
                        {articulosFiltrados.map((articulo) => (
                          <div 
                            key={`${articulo.CodigoArticulo}-${articulo.DescripcionArticulo}`}
                            className="resultado-item"
                            onClick={() => seleccionarArticulo(articulo)}
                          >
                            <div className="articulo-codigo">{articulo.CodigoArticulo}</div>
                            <div className="articulo-descripcion">{articulo.DescripcionArticulo}</div>
                            <div className="articulo-stock">Stock: {formatCantidad(articulo.StockTotal)}</div>
                          </div>
                        ))}
                        
                        {loadingArticulos && (
                          <div className="loading-indicator">Cargando más artículos...</div>
                        )}
                        
                        {allArticulosLoaded && articulosFiltrados.length > 0 && (
                          <div className="no-more-results">Fin de los resultados</div>
                        )}
                        
                        {articulosFiltrados.length === 0 && !loadingArticulos && (
                          <div className="no-results">No se encontraron artículos</div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {articuloSeleccionado && (
                    <div className="articulo-seleccionado">
                      <span>Artículo seleccionado: </span>
                      {articuloSeleccionado.DescripcionArticulo} 
                      ({articuloSeleccionado.CodigoArticulo})
                    </div>
                  )}
                </div>
              </div>

              {articuloSeleccionado && stockDisponible.length > 0 && (
                <>
                  <div className="form-section">
                    <h2>Origen</h2>
                    <div className="form-control-group">
                      <label>Almacén:</label>
                      <select 
                        className="form-control-enhanced"
                        value={almacenOrigen}
                        onChange={(e) => cambiarAlmacenOrigen(e.target.value)}
                        required
                      >
                        <option value="">Seleccionar almacén</option>
                        {[...new Set(stockDisponible.map(item => item.CodigoAlmacen))]
                          .map((codigo) => (
                            <option key={codigo} value={codigo}>
                              {getNombreAlmacen(codigo)}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="form-control-group">
                      <label>Ubicación:</label>
                      <select 
                        className="form-control-enhanced"
                        value={ubicacionOrigen}
                        onChange={(e) => {
                          const selectedOption = e.target.options[e.target.selectedIndex];
                          const unidad = selectedOption.getAttribute('data-unidad');
                          const grupoUnico = selectedOption.getAttribute('data-grupounico');
                          const partida = selectedOption.getAttribute('data-partida');
                          cambiarUbicacionOrigen(e.target.value, unidad, grupoUnico, partida);
                        }}
                        required
                        disabled={!almacenOrigen}
                      >
                        <option value="">Seleccionar ubicación</option>
                        {stockDisponible
                          .filter(item => item.CodigoAlmacen === almacenOrigen)
                          .map((item) => (
                            <option 
                              key={`${item.Ubicacion}-${item.UnidadMedida}-${item.Partida || ''}`} 
                              value={item.Ubicacion}
                              data-unidad={item.UnidadMedida}
                              data-grupounico={`${item.CodigoAlmacen}-${item.Ubicacion}-${item.UnidadMedida}-${item.Partida || ''}`}
                              data-partida={item.Partida || ''}
                            >
                              {item.Ubicacion} - 
                              {formatCantidad(item.Cantidad)} {item.UnidadMedida || 'unidades'}
                              {item.Partida && ` (Lote: ${item.Partida})`}
                            </option>
                          ))}
                      </select>
                    </div>
                    
                    {ubicacionOrigen && (
                      <div className="unidad-info">
                        <strong>Unidad seleccionada:</strong> {formatUnidadMedida(unidadMedida)}
                        {partida && <span>, <strong>Lote:</strong> {partida}</span>}
                      </div>
                    )}
                  </div>

                  <div className="form-section">
                    <h2>Destino</h2>
                    <div className="form-control-group">
                      <label>Almacén:</label>
                      <select 
                        className="form-control-enhanced"
                        value={almacenDestino}
                        onChange={(e) => {
                          setAlmacenDestino(e.target.value);
                          setUbicacionDestino('');
                        }}
                        required
                      >
                        <option value="">Seleccionar almacén</option>
                        {almacenes.map((almacen) => (
                          <option key={almacen.CodigoAlmacen} value={almacen.CodigoAlmacen}>
                            {almacen.Almacen} ({almacen.CodigoAlmacen})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-control-group">
                      <label>Ubicación:</label>
                      <select 
                        className="form-control-enhanced"
                        value={ubicacionDestino}
                        onChange={(e) => setUbicacionDestino(e.target.value)}
                        required
                        disabled={!almacenDestino}
                      >
                        <option value="">Seleccionar ubicación</option>
                        {ubicacionesDestino
                          .filter(ubicacion => 
                            almacenDestino !== almacenOrigen || ubicacion.Ubicacion !== ubicacionOrigen
                          )
                          .map((ubicacion) => (
                            <option key={ubicacion.Ubicacion} value={ubicacion.Ubicacion}>
                              {ubicacion.Ubicacion}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-section">
                    <h2>Cantidad</h2>
                    <div className="form-control-group">
                      <label>Cantidad a traspasar:</label>
                      <input 
                        className="form-control-enhanced"
                        type="number" 
                        value={cantidad}
                        onChange={handleCantidadChange}
                        required
                        min="1"
                        step="1"
                      />
                      {ubicacionOrigen && (
                        <div className="stock-info">
                          <strong>Stock disponible:</strong> {formatCantidad(
                            stockDisponible.find(
                              item => item.CodigoAlmacen === almacenOrigen && 
                                      item.Ubicacion === ubicacionOrigen &&
                                      item.UnidadMedida === unidadMedida &&
                                      (item.Partida || '') === partida
                            )?.Cantidad || 0
                          )} {formatUnidadMedida(unidadMedida)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="form-actions">
                    <button 
                      className="btn-enviar"
                      onClick={agregarTraspasoArticulo}
                      disabled={loading}
                    >
                      {loading ? 'Agregando...' : 'Agregar Traspaso'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          
          {activeTab === 'ubicacion' && (
            <div className="modo-ubicacion">
              {vistaUbicacion === 'seleccion' ? (
                <div className="form-section">
                  <h2>Seleccionar Ubicación de Origen</h2>
                  <div className="ubicaciones-agrupadas">
                    {ubicacionesAgrupadas.map(almacen => (
                      <div key={almacen.codigo} className="almacen-item">
                        <div 
                          className="almacen-header"
                          onClick={() => setAlmacenExpandido(
                            almacenExpandido === almacen.codigo ? null : almacen.codigo
                          )}
                        >
                          <span>{almacen.nombre} ({almacen.codigo})</span>
                          <span>{almacenExpandido === almacen.codigo ? '▲' : '▼'}</span>
                        </div>
                        
                        {almacenExpandido === almacen.codigo && (
                          <div className="ubicaciones-list">
                            {almacen.ubicaciones.map(ubicacion => (
                              <div 
                                key={`${almacen.codigo}-${ubicacion.codigo}`}
                                className={`ubicacion-item ${
                                  ubicacionSeleccionada?.almacen === almacen.codigo && 
                                  ubicacionSeleccionada?.ubicacion === ubicacion.codigo 
                                    ? 'seleccionada' 
                                    : ''
                                }`}
                                onClick={() => cargarArticulosUbicacion(almacen.codigo, ubicacion.codigo)}
                              >
                                <span className="ubicacion-codigo">{ubicacion.codigo}</span>
                                <span className="ubicacion-stock">
                                  {ubicacion.cantidadArticulos} artículos
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-section-header">
                    <button 
                      className="btn-volver"
                      onClick={() => {
                        setVistaUbicacion('seleccion');
                        setUbicacionSeleccionada(null);
                        setArticulosUbicacion([]);
                      }}
                    >
                      &larr; Volver a ubicaciones
                    </button>
                    <h2>Artículos en {ubicacionSeleccionada.ubicacion}</h2>
                  </div>
                  
                  <div className="form-section">
                    <div className="ubicacion-seleccionada-info">
                      <span>Almacén: {getNombreAlmacen(ubicacionSeleccionada.almacen)}</span>
                      <span>Ubicación: {ubicacionSeleccionada.ubicacion}</span>
                    </div>
                    
                    <div className="articulos-ubicacion">
                      <div className="responsive-table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>Código</th>
                              <th>Descripción</th>
                              <th>Stock</th>
                              <th>Unidad</th>
                              <th>Lote</th>
                              <th>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {articulosUbicacion.map((articulo) => (
                              <tr 
                                key={`${articulo.CodigoArticulo}-${ubicacionSeleccionada.almacen}-${ubicacionSeleccionada.ubicacion}`}
                                className={articuloUbicacionSeleccionado?.CodigoArticulo === articulo.CodigoArticulo ? 'seleccionado' : ''}
                                onClick={() => setArticuloUbicacionSeleccionado(articulo)}
                              >
                                <td>{articulo.CodigoArticulo}</td>
                                <td>{articulo.DescripcionArticulo}</td>
                                <td>
                                  {formatCantidad(articulo.Cantidad)} 
                                  {articulo.UnidadMedida !== articulo.UnidadBase && articulo.FactorConversion && (
                                    <span className="unidad-base">
                                      ({formatCantidad(articulo.Cantidad * articulo.FactorConversion)} {articulo.UnidadBase})
                                    </span>
                                  )}
                                </td>
                                <td>{articulo.UnidadMedida || 'unidades'}</td>
                                <td>{articulo.Partida || '-'}</td>
                                <td>
                                  <button className="btn-seleccionar">
                                    Seleccionar
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {paginationUbicacion.totalPages > 1 && (
                        <div className="pagination-controls">
                          <button
                            disabled={paginationUbicacion.page === 1}
                            onClick={() => cargarArticulosUbicacion(
                              ubicacionSeleccionada.almacen, 
                              ubicacionSeleccionada.ubicacion, 
                              paginationUbicacion.page - 1
                            )}
                          >
                            &larr; Anterior
                          </button>
                          
                          <span>Página {paginationUbicacion.page} de {Math.ceil(paginationUbicacion.total / paginationUbicacion.pageSize)}</span>
                          
                          <button
                            disabled={paginationUbicacion.page * paginationUbicacion.pageSize >= paginationUbicacion.total}
                            onClick={() => cargarArticulosUbicacion(
                              ubicacionSeleccionada.almacen, 
                              ubicacionSeleccionada.ubicacion, 
                              paginationUbicacion.page + 1
                            )}
                          >
                            Siguiente &rarr;
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {articuloUbicacionSeleccionado && (
                <div className="detail-card">
                  <div className="card-header">Detalles del Traspaso</div>
                  <div className="card-body">
                    <div className="articulo-seleccionado">
                      <span>Artículo seleccionado: </span>
                      {articuloUbicacionSeleccionado.DescripcionArticulo} 
                      ({articuloUbicacionSeleccionado.CodigoArticulo})
                      <div className="unidad-info">
                        <strong>Unidad:</strong> {formatUnidadMedida(articuloUbicacionSeleccionado.UnidadMedida)}
                        {articuloUbicacionSeleccionado.Partida && <span>, <strong>Lote:</strong> {articuloUbicacionSeleccionado.Partida}</span>}
                      </div>
                    </div>
                    
                    <div className="form-control-group">
                      <label>Almacén de destino:</label>
                      <select 
                        className="form-control-enhanced"
                        value={almacenDestino}
                        onChange={(e) => {
                          setAlmacenDestino(e.target.value);
                          setUbicacionDestino('');
                        }}
                        required
                      >
                        <option value="">Seleccionar almacén</option>
                        {almacenes.map(almacen => (
                          <option key={almacen.CodigoAlmacen} value={almacen.CodigoAlmacen}>
                            {almacen.Almacen} ({almacen.CodigoAlmacen})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-control-group">
                      <label>Ubicación de destino:</label>
                      <select 
                        className="form-control-enhanced"
                        value={ubicacionDestino}
                        onChange={(e) => setUbicacionDestino(e.target.value)}
                        required
                        disabled={!almacenDestino}
                      >
                        <option value="">Seleccionar ubicación</option>
                        {ubicacionesDestino
                          .filter(ubicacion => 
                            almacenDestino !== ubicacionSeleccionada.almacen || 
                            ubicacion.Ubicacion !== ubicacionSeleccionada.ubicacion
                          )
                          .map((ubicacion) => (
                            <option key={ubicacion.Ubicacion} value={ubicacion.Ubicacion}>
                              {ubicacion.Ubicacion}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="form-control-group">
                      <label>Cantidad a traspasar:</label>
                      <input 
                        className="form-control-enhanced"
                        type="number" 
                        value={cantidad}
                        onChange={handleCantidadChange}
                        required
                        min="1"
                        step="1"
                        max={articuloUbicacionSeleccionado.Cantidad}
                      />
                      <div className="stock-info">
                        <strong>Stock disponible:</strong> {formatCantidad(articuloUbicacionSeleccionado.Cantidad)} {formatUnidadMedida(articuloUbicacionSeleccionado.UnidadMedida)}
                      </div>
                    </div>

                    <div className="form-actions">
                      <button 
                        className="btn-agregar"
                        onClick={agregarTraspasoUbicacion}
                        disabled={loading}
                      >
                        {loading ? 'Agregando...' : 'Agregar Traspaso'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {activeSection === 'verificacion' && (
        <div className="verificacion-section">
          <h2>Verificación de Traspasos</h2>
          
          {traspasosPendientes.length === 0 ? (
            <div className="sin-traspasos">
              No hay traspasos pendientes de verificación
            </div>
          ) : (
            <>
              <div className="lista-traspasos">
                {traspasosPendientes.map(traspaso => (
                  <div key={traspaso.id} className="traspaso-item">
                    <div className="traspaso-info">
                      <div>
                        <strong>Artículo:</strong> {traspaso.articulo.DescripcionArticulo} 
                        ({traspaso.articulo.CodigoArticulo})
                      </div>
                      <div>
                        <strong>Unidad:</strong> {formatUnidadMedida(traspaso.unidadMedida)}
                        {traspaso.partida && <span>, <strong>Lote:</strong> {traspaso.partida}</span>}
                      </div>
                      <div>
                        <strong>Origen:</strong> {getNombreAlmacen(traspaso.origen.almacen)} - 
                        {traspaso.origen.ubicacion}
                      </div>
                      <div>
                        <strong>Destino:</strong> {getNombreAlmacen(traspaso.destino.almacen)} - 
                        {traspaso.destino.ubicacion}
                      </div>
                      <div>
                        <strong>Cantidad:</strong> {formatCantidad(traspaso.cantidad)} {formatUnidadMedida(traspaso.unidadMedida)}
                      </div>
                    </div>
                    <button 
                      className="btn-eliminar"
                      onClick={() => setTraspasosPendientes(
                        traspasosPendientes.filter(item => item.id !== traspaso.id)
                      )}
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="acciones-verificacion">
                <button 
                  className="btn-confirmar" 
                  onClick={confirmarTraspasos}
                  disabled={loading}
                >
                  {loading ? 'Confirmando...' : 'Confirmar Traspasos'}
                </button>
                
                <button 
                  className="btn-cancelar" 
                  onClick={() => setActiveSection('traspasos')}
                >
                  Volver a Traspasos
                </button>
              </div>
            </>
          )}
        </div>
      )}
      
      {activeSection === 'historial' && (
        <div className="historial-section">
          <h2>Historial de Traspasos</h2>
          
          {historial.length === 0 ? (
            <div className="sin-historial">
              No hay traspasos registrados
            </div>
          ) : (
            <div className="lista-historial">
              {historial.map((item, index) => (
                <div key={`${item.FechaRegistro}-${index}-${item.CodigoArticulo}`} className="historial-item">
                  <div className="historial-header">
                    <div className="historial-fecha">
                      {item.FechaFormateada || formatFecha(item.FechaRegistro)}
                    </div>
                    <div className="historial-tipo">{item.TipoMovimiento}</div>
                  </div>
                  
                  <div className="historial-articulo">
                    <span>Artículo:</span> 
                    {item.DescripcionArticulo} ({item.CodigoArticulo})
                  </div>
                  
                  <div className="historial-detalle">
                    <div>
                      <span>Origen:</span> 
                      {item.NombreOrigenAlmacen} - {item.OrigenUbicacion}
                    </div>
                    <div>
                      <span>Destino:</span> 
                      {item.NombreDestinoAlmacen || 'N/A'} - {item.DestinoUbicacion || 'N/A'}
                    </div>
                  </div>
                  
                  <div className="historial-info">
                    <div className="historial-cantidad">
                      <span>Cantidad:</span> {formatCantidad(item.Cantidad)} {formatUnidadMedida(item.UnidadMedida)}
                    </div>
                    <div className="historial-usuario">
                      <span>Usuario:</span> 
                      {item.Comentario?.split(': ')[1] || 'Desconocido'}
                    </div>
                    <div className="historial-lote">
                      <span>Lote:</span> 
                      {item.Partida || 'N/A'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TraspasosPage;