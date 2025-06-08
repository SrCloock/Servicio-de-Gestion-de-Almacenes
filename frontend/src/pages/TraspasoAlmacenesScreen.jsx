import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/TraspasoAlmacenesScreen.css';

const Icon = ({ name }) => {
  const icons = {
    arrowLeft: '←',
    search: '🔍',
    plus: '➕',
    edit: '✏️',
    trash: '🗑️',
    check: '✅',
    box: '📦',
    warehouse: '🏭',
    mapMarker: '📍',
    hashtag: '#',
    spinner: '🔄',
    history: '📅'
  };
  
  return <span className="icon">{icons[name]}</span>;
};

const TraspasoAlmacenesScreen = () => {
  const navigate = useNavigate();
  const searchRef = useRef(null);
  const [articulos, setArticulos] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [ubicacionesOrigen, setUbicacionesOrigen] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [traspasosPendientes, setTraspasosPendientes] = useState([]);
  const [traspasosHistorial, setTraspasosHistorial] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('pendientes');
  const [showArticleDropdown, setShowArticleDropdown] = useState(false);
  const [articulosSinStock, setArticulosSinStock] = useState([]);
  const [articulosNegativos, setArticulosNegativos] = useState([]);
  
  const [traspasoData, setTraspasoData] = useState({
    articulo: '',
    almacenOrigen: '',
    ubicacionOrigen: '',
    almacenDestino: '',
    ubicacionDestino: '',
    cantidad: ''
  });

  // Obtener artículos reales del backend
  useEffect(() => {
    const fetchArticulos = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('http://localhost:3000/articulos');
        const data = await response.json();
        
        // Identificar artículos sin stock o en negativo
        const sinStock = [];
        const negativos = [];
        
        const articulosConEstado = data.map(art => {
          if (art.stock === 0) {
            sinStock.push(art.codigo);
            return { ...art, estado: 'sin-stock' };
          } else if (art.stock < 0) {
            negativos.push(art.codigo);
            return { ...art, estado: 'negativo' };
          }
          return { ...art, estado: 'normal' };
        });
        
        setArticulos(articulosConEstado);
        setArticulosSinStock(sinStock);
        setArticulosNegativos(negativos);
        
        // Obtener almacenes reales
        const almacenesResponse = await fetch('http://localhost:3000/almacenes');
        setAlmacenes(await almacenesResponse.json());
        
      } catch (error) {
        console.error("Error cargando datos", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchArticulos();
  }, []);

  // Obtener historial (últimos 30 días)
  useEffect(() => {
    const fetchHistorial = async () => {
      try {
        const response = await fetch('http://localhost:3000/traspasos/historial?dias=30');
        setTraspasosHistorial(await response.json());
      } catch (error) {
        console.error("Error cargando historial", error);
      }
    };
    
    fetchHistorial();
  }, []);

  // Filtrar artículos por búsqueda (mostrar max 10)
  const articulosFiltrados = busqueda 
    ? articulos.filter(art => 
        art.codigo.toLowerCase().includes(busqueda.toLowerCase()) || 
        art.nombre.toLowerCase().includes(busqueda.toLowerCase())
      ).slice(0, 10)
    : articulos.slice(0, 10);

  // Manejar selección de artículo (con manejo de artículos sin stock)
  const handleSelectArticulo = (codigo) => {
    const articulo = articulos.find(a => a.codigo === codigo);
    setTraspasoData({...traspasoData, articulo: codigo});
    setBusqueda(codigo);
    setShowArticleDropdown(false);
    
    // Si es un artículo sin stock, establecer ubicación por defecto
    if (articulosSinStock.includes(codigo)) {
      setTraspasoData(prev => ({
        ...prev,
        almacenOrigen: 'Principal',
        ubicacionOrigen: 'Zona descarga'
      }));
    }
  };

  // Cargar ubicaciones cuando se selecciona artículo y almacén origen
  useEffect(() => {
    if (traspasoData.articulo && traspasoData.almacenOrigen) {
      const fetchUbicacionesOrigen = async () => {
        try {
          const response = await fetch(
            `http://localhost:3000/ubicaciones?almacen=${traspasoData.almacenOrigen}`
          );
          const ubicaciones = await response.json();
          setUbicacionesOrigen(ubicaciones);
          
          // Mantener la ubicación si ya estaba seleccionada y sigue disponible
          if (!ubicaciones.includes(traspasoData.ubicacionOrigen)) {
            setTraspasoData(prev => ({ ...prev, ubicacionOrigen: 'Zona descarga' }));
          }
        } catch (error) {
          console.error("Error cargando ubicaciones", error);
        }
      };
      
      fetchUbicacionesOrigen();
    }
  }, [traspasoData.articulo, traspasoData.almacenOrigen]);

  // Cargar ubicaciones cuando se selecciona almacén destino
  useEffect(() => {
    if (traspasoData.almacenDestino) {
      const fetchUbicacionesDestino = async () => {
        try {
          const response = await fetch(
            `http://localhost:3000/ubicaciones?almacen=${traspasoData.almacenDestino}`
          );
          let ubicaciones = await response.json();
          
          // Filtrar para no permitir "Zona descarga" como destino
          ubicaciones = ubicaciones.filter(ubi => ubi !== "Zona descarga");
          setUbicacionesDestino(ubicaciones);
          
          if (!ubicaciones.includes(traspasoData.ubicacionDestino)) {
            setTraspasoData(prev => ({ ...prev, ubicacionDestino: '' }));
          }
        } catch (error) {
          console.error("Error cargando ubicaciones", error);
        }
      };
      
      fetchUbicacionesDestino();
    }
  }, [traspasoData.almacenDestino]);

  const handleCantidadChange = (e) => {
    let value = e.target.value;
    // Permitir números negativos
    if (value === '' || (Number(value) >= -9999 && Number(value) <= 9999)) {
      setTraspasoData({ ...traspasoData, cantidad: value });
    }
  };

  const agregarTraspaso = () => {
    const { articulo, almacenOrigen, ubicacionOrigen, almacenDestino, ubicacionDestino, cantidad } = traspasoData;
    const cantidadNum = parseInt(cantidad, 10);
    
    if (!articulo || !almacenOrigen || !ubicacionOrigen || !almacenDestino || !ubicacionDestino || !cantidad) {
      alert('Completa todos los campos. Cantidad debe ser un número válido');
      return;
    }
    
    // Validar que al menos la ubicación sea diferente
    if (almacenOrigen === almacenDestino && ubicacionOrigen === ubicacionDestino) {
      alert('La ubicación destino debe ser diferente a la origen');
      return;
    }

    const articuloInfo = articulos.find(a => a.codigo === articulo);
    
    // Permitir traspasos negativos sin confirmación
    setTraspasosPendientes([...traspasosPendientes, {
      ...traspasoData,
      cantidad: cantidadNum,
      nombreArticulo: articuloInfo.nombre,
      id: Date.now(),
      estado: articuloInfo.estado
    }]);

    setTraspasoData({
      articulo: '',
      almacenOrigen: '',
      ubicacionOrigen: '',
      almacenDestino: '',
      ubicacionDestino: '',
      cantidad: ''
    });
    
    setBusqueda('');
    setShowArticleDropdown(false);
  };

  const modificarTraspaso = (id) => {
    const traspaso = traspasosPendientes.find(t => t.id === id);
    if (traspaso) {
      setTraspasoData({
        articulo: traspaso.articulo,
        almacenOrigen: traspaso.almacenOrigen,
        ubicacionOrigen: traspaso.ubicacionOrigen,
        almacenDestino: traspaso.almacenDestino,
        ubicacionDestino: traspaso.ubicacionDestino,
        cantidad: traspaso.cantidad
      });
      setBusqueda(traspaso.articulo);
      setTraspasosPendientes(traspasosPendientes.filter(t => t.id !== id));
    }
  };

  const eliminarTraspaso = (id) => {
    setTraspasosPendientes(traspasosPendientes.filter(t => t.id !== id));
  };

  const confirmarTraspasos = async () => {
    if (traspasosPendientes.length === 0) {
      alert('No hay traspasos pendientes');
      return;
    }

    setIsLoading(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Enviar traspasos al backend
      const response = await fetch('http://localhost:3000/traspasos/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(traspasosPendientes)
      });
      
      if (!response.ok) throw new Error('Error al confirmar traspasos');

      // Agregar a historial
      const nuevosTraspasos = traspasosPendientes.map(t => ({
        ...t,
        id: Date.now() + Math.random(),
        fecha: new Date().toISOString().split('T')[0]
      }));
      
      setTraspasosHistorial([...nuevosTraspasos, ...traspasosHistorial]);
      
      setShowSuccess(true);
      setTraspasosPendientes([]);
      
      setTimeout(() => {
        setShowSuccess(false);
      }, 2000);
    } catch (error) {
      alert('Error al realizar traspasos');
    } finally {
      setIsLoading(false);
    }
  };

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowArticleDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="traspaso-screen">
      <div className="traspaso-container">
        {/* Header compacto */}
        <div className="header-card">
          <div>
            <h1 className="header-title">
              <Icon name="warehouse" />
              Traspaso entre Almacenes
            </h1>
          </div>
          
          <div className="navigation-buttons">
            <button onClick={() => navigate('/rutas')} className="btn-nav">
              📦 Rutas
            </button>
            <button onClick={() => navigate('/pedidos')} className="btn-nav">
              📝 Pedidos
            </button>
            <button onClick={() => navigate('/inventario')} className="btn-nav">
              📊 Inventario
            </button>
            <button onClick={() => navigate('/')} className="btn-nav">
              🏠 Inicio
            </button>
          </div>
        </div>
        
        {/* Contenido principal */}
        <div className="main-grid">
          {/* Formulario compacto */}
          <div className="form-card">
            <div className="card-header">
              <h2 className="card-title">
                <Icon name="plus" /> Nuevo Traspaso
              </h2>
            </div>
            
            {/* Selector de artículo con búsqueda integrada */}
            <div className="form-group">
              <label className="form-label">
                <Icon name="box" /> Artículo
              </label>
              <div className="search-container" ref={searchRef}>
                <input
                  type="text"
                  placeholder="Buscar artículo..."
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setShowArticleDropdown(true);
                  }}
                  onFocus={() => setShowArticleDropdown(true)}
                  className="search-input"
                />
                
                {showArticleDropdown && (
                  <div className="article-dropdown">
                    {articulosFiltrados.length > 0 ? (
                      articulosFiltrados.map((art) => {
                        const isSinStock = articulosSinStock.includes(art.codigo);
                        const isNegativo = articulosNegativos.includes(art.codigo);
                        
                        return (
                          <div 
                            key={art.codigo} 
                            className={`dropdown-item ${isSinStock ? 'no-stock' : ''} ${isNegativo ? 'negative-stock' : ''}`}
                            onClick={() => handleSelectArticulo(art.codigo)}
                          >
                            <div className="article-code">{art.codigo}</div>
                            <div className="article-name">{art.nombre}</div>
                            <div className="article-stock">
                              Stock: {art.stock}
                              {isSinStock && <span className="stock-warning"> (Sin ubicación)</span>}
                              {isNegativo && <span className="stock-warning"> (Stock negativo)</span>}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="dropdown-empty">No se encontraron artículos</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Campos compactos */}
            <div className="compact-grid">
              {/* Origen */}
              <div className="form-group">
                <label className="form-label">
                  <Icon name="mapMarker" /> Almacén Origen
                </label>
                <select
                  value={traspasoData.almacenOrigen}
                  onChange={(e) => setTraspasoData({ ...traspasoData, almacenOrigen: e.target.value })}
                  disabled={!traspasoData.articulo}
                  className="select-input"
                >
                  <option value="">Selecciona almacén</option>
                  {almacenes.map((alm, i) => (
                    <option key={i} value={alm.codigo}>{alm.nombre}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label className="form-label">
                  <Icon name="mapMarker" /> Ubicación Origen
                </label>
                <select
                  value={traspasoData.ubicacionOrigen}
                  onChange={(e) => setTraspasoData({ ...traspasoData, ubicacionOrigen: e.target.value })}
                  disabled={!traspasoData.almacenOrigen}
                  className="select-input"
                >
                  <option value="">Selecciona ubicación</option>
                  {ubicacionesOrigen.map((ubi, i) => (
                    <option key={i} value={ubi}>{ubi}</option>
                  ))}
                </select>
              </div>
              
              {/* Destino */}
              <div className="form-group">
                <label className="form-label">
                  <Icon name="mapMarker" /> Almacén Destino
                </label>
                <select
                  value={traspasoData.almacenDestino}
                  onChange={(e) => setTraspasoData({ ...traspasoData, almacenDestino: e.target.value })}
                  className="select-input"
                >
                  <option value="">Selecciona almacén</option>
                  {almacenes.map((alm, i) => (
                    <option key={i} value={alm.codigo}>{alm.nombre}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label className="form-label">
                  <Icon name="mapMarker" /> Ubicación Destino
                </label>
                <select
                  value={traspasoData.ubicacionDestino}
                  onChange={(e) => setTraspasoData({ ...traspasoData, ubicacionDestino: e.target.value })}
                  disabled={!traspasoData.almacenDestino}
                  className="select-input"
                >
                  <option value="">Selecciona ubicación</option>
                  {ubicacionesDestino.map((ubi, i) => (
                    <option key={i} value={ubi}>{ubi}</option>
                  ))}
                </select>
              </div>
              
              {/* Cantidad */}
              <div className="form-group quantity-group">
                <label className="form-label">
                  <Icon name="hashtag" /> Cantidad
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={traspasoData.cantidad}
                  onChange={handleCantidadChange}
                  className="quantity-input"
                />
              </div>
              
              <div className="form-group button-group">
                <button 
                  onClick={agregarTraspaso}
                  className="btn-add"
                >
                  <Icon name="plus" /> Agregar
                </button>
              </div>
            </div>
          </div>
          
          {/* Traspasos pendientes e historial */}
          <div className="pending-card">
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'pendientes' ? 'active' : ''}`}
                onClick={() => setActiveTab('pendientes')}
              >
                Pendientes
              </button>
              <button 
                className={`tab ${activeTab === 'historial' ? 'active' : ''}`}
                onClick={() => setActiveTab('historial')}
              >
                Historial
              </button>
            </div>
            
            {activeTab === 'pendientes' ? (
              <>
                <div className="table-container">
                  {traspasosPendientes.length > 0 ? (
                    <table className="pending-table compact-table">
                      <thead>
                        <tr>
                          <th>Artículo</th>
                          <th>Origen</th>
                          <th>Destino</th>
                          <th>Cant</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {traspasosPendientes.map((traspaso) => (
                          <tr 
                            key={traspaso.id} 
                            className={traspaso.estado === 'sin-stock' ? 'no-stock' : 
                                      traspaso.estado === 'negativo' ? 'negative-stock' : ''}
                          >
                            <td>
                              <div className="article-name">{traspaso.nombreArticulo}</div>
                              <div className="article-code">{traspaso.articulo}</div>
                            </td>
                            <td>
                              <div>{traspaso.almacenOrigen}</div>
                              <div className="location">{traspaso.ubicacionOrigen}</div>
                            </td>
                            <td>
                              <div>{traspaso.almacenDestino}</div>
                              <div className="location">{traspaso.ubicacionDestino}</div>
                            </td>
                            <td>
                              <span className="quantity-badge">{traspaso.cantidad}</span>
                            </td>
                            <td className="actions-cell">
                              <div className="actions-container">
                                <button 
                                  onClick={() => modificarTraspaso(traspaso.id)}
                                  className="btn-action btn-edit"
                                  title="Modificar"
                                >
                                  <Icon name="edit" />
                                </button>
                                <button 
                                  onClick={() => eliminarTraspaso(traspaso.id)}
                                  className="btn-action btn-delete"
                                  title="Eliminar"
                                >
                                  <Icon name="trash" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <Icon name="box" />
                      </div>
                      <p className="empty-description">No hay traspasos pendientes</p>
                    </div>
                  )}
                </div>
                
                {traspasosPendientes.length > 0 && (
                  <button 
                    onClick={confirmarTraspasos}
                    disabled={isLoading}
                    className="btn-confirm"
                  >
                    {isLoading ? (
                      <>
                        <Icon name="spinner" /> Procesando...
                      </>
                    ) : (
                      <>
                        <Icon name="check" /> Confirmar Traspasos
                      </>
                    )}
                  </button>
                )}
              </>
            ) : (
              <div className="table-container">
                {traspasosHistorial.length > 0 ? (
                  <table className="pending-table compact-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Artículo</th>
                        <th>Origen</th>
                        <th>Destino</th>
                        <th>Cant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traspasosHistorial.map((traspaso) => (
                        <tr 
                          key={traspaso.id} 
                          className={traspaso.estado === 'sin-stock' ? 'no-stock' : 
                                    traspaso.estado === 'negativo' ? 'negative-stock' : ''}
                        >
                          <td>{traspaso.fecha}</td>
                          <td>
                            <div className="article-name">{traspaso.nombreArticulo}</div>
                            <div className="article-code">{traspaso.articulo}</div>
                          </td>
                          <td>
                            <div>{traspaso.almacenOrigen}</div>
                            <div className="location">{traspaso.ubicacionOrigen}</div>
                          </td>
                          <td>
                            <div>{traspaso.almacenDestino}</div>
                            <div className="location">{traspaso.ubicacionDestino}</div>
                          </td>
                          <td>
                            <span className="quantity-badge">{traspaso.cantidad}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <Icon name="history" />
                    </div>
                    <p className="empty-description">No hay traspasos en el historial</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Notificación de éxito */}
      {showSuccess && (
        <div className="success-notification">
          <Icon name="check" />
          <div>Traspasos realizados: {traspasosPendientes.length} artículos</div>
        </div>
      )}
      
      {/* Overlay de carga */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-card">
            <div className="loading-spinner"></div>
            <p className="loading-text">Procesando traspasos...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TraspasoAlmacenesScreen;