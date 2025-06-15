import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/TraspasoAlmacenesScreen.css';
import Navbar from '../components/Navbar';
import axios from 'axios';

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
    history: '📅',
    user: '👤',
    download: '⬇️'
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
  const [filtroAlmacen, setFiltroAlmacen] = useState('');
  const [usuario] = useState('admin');

  const [traspasoData, setTraspasoData] = useState({
    articulo: '',
    almacenOrigen: '',
    ubicacionOrigen: '',
    almacenDestino: '',
    ubicacionDestino: '',
    cantidad: ''
  });

  // Obtener datos iniciales
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/');
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [artResponse, almResponse, histResponse] = await Promise.all([
          axios.get('http://localhost:3000/articulos', {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get('http://localhost:3000/almacenes', {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get('http://localhost:3000/traspasos/historial', {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        
        setArticulos(artResponse.data);
        setAlmacenes(almResponse.data);
        setTraspasosHistorial(histResponse.data);
      } catch (error) {
        console.error('Error al obtener datos:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [navigate]);

  // Filtrar artículos con filtro de almacén
  const articulosFiltrados = busqueda 
    ? articulos.filter(art => 
        art.codigo.toLowerCase().includes(busqueda.toLowerCase()) || 
        art.nombre.toLowerCase().includes(busqueda.toLowerCase())
      ).slice(0, 10)
    : articulos.slice(0, 10);
    
  const articulosFiltradosPorAlmacen = filtroAlmacen
    ? articulosFiltrados.filter(art => 
        inventarioAlmacenes.some(a => 
          a.codigo === art.codigo && a.almacen === filtroAlmacen
        )
      )
    : articulosFiltrados;

  const handleSelectArticulo = (codigo) => {
    setTraspasoData({...traspasoData, articulo: codigo});
    setBusqueda(codigo);
    setShowArticleDropdown(false);
  };

  // Cargar ubicaciones de origen
  useEffect(() => {
    const fetchUbicacionesOrigen = async () => {
      if (!traspasoData.articulo || !traspasoData.almacenOrigen) return;
      
      try {
        if (traspasoData.almacenOrigen === 'DESCARGA') {
          setUbicacionesOrigen([
            { ubicacion: 'Muelle 1', stock: 0 },
            { ubicacion: 'Muelle 2', stock: 0 },
            { ubicacion: 'Zona Recepción', stock: 0 },
            { ubicacion: 'Cuarentena', stock: 0 }
          ]);
        } else {
          const response = await axios.get(
            `http://localhost:3000/ubicaciones/stock?articulo=${traspasoData.articulo}&almacen=${traspasoData.almacenOrigen}`,
            {
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            }
          );
          setUbicacionesOrigen(response.data);
        }
      } catch (error) {
        console.error('Error al obtener ubicaciones origen:', error);
        setUbicacionesOrigen([]);
      }
    };
    
    fetchUbicacionesOrigen();
  }, [traspasoData.articulo, traspasoData.almacenOrigen]);

  // Cargar ubicaciones de destino
  useEffect(() => {
    const fetchUbicacionesDestino = async () => {
      if (!traspasoData.almacenDestino) return;
      
      try {
        const response = await axios.get(
          `http://localhost:3000/ubicaciones/almacen?almacen=${traspasoData.almacenDestino}`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          }
        );
        setUbicacionesDestino(response.data);
      } catch (error) {
        console.error('Error al obtener ubicaciones destino:', error);
        setUbicacionesDestino([]);
      }
    };
    
    fetchUbicacionesDestino();
  }, [traspasoData.almacenDestino]);

  const handleCantidadChange = (e) => {
    const value = e.target.value;
    if (value === '' || (Number(value) >= 0 && Number(value) <= 9999)) {
      setTraspasoData({ ...traspasoData, cantidad: value });
    }
  };

  const agregarTraspaso = async () => {
    const { articulo, almacenOrigen, ubicacionOrigen, almacenDestino, ubicacionDestino, cantidad } = traspasoData;
    const cantidadNum = parseInt(cantidad, 10);
    
    // Validaciones
    if (!articulo || !almacenOrigen || !ubicacionOrigen || !almacenDestino || !ubicacionDestino || !cantidad || cantidadNum <= 0) {
      alert('Completa todos los campos. Cantidad debe ser mayor que 0');
      return;
    }
    
    if (almacenOrigen === almacenDestino && ubicacionOrigen === ubicacionDestino) {
      alert('La ubicación destino debe ser diferente a la origen');
      return;
    }

    const articuloInfo = articulos.find(a => a.codigo === articulo);
    
    // Verificar stock (excepto para descarga)
    if (almacenOrigen !== 'DESCARGA') {
      try {
        const stockResponse = await axios.get(
          `http://localhost:3000/stock?articulo=${articulo}&almacen=${almacenOrigen}&ubicacion=${ubicacionOrigen}`,
          {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          }
        );
        
        if (cantidadNum > stockResponse.data.cantidad) {
          alert(`Stock insuficiente. Disponible: ${stockResponse.data.cantidad} unidades`);
          return;
        }
      } catch (error) {
        console.error('Error al verificar stock:', error);
        alert('Error al verificar stock disponible');
        return;
      }
    }
    
    // Agregar a pendientes
    setTraspasosPendientes([...traspasosPendientes, {
      ...traspasoData,
      cantidad: cantidadNum,
      nombreArticulo: articuloInfo.nombre,
      id: Date.now(),
      esDescarga: almacenOrigen === 'DESCARGA'
    }]);

    // Resetear formulario
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
      const response = await axios.post('http://localhost:3000/traspasos/confirmar', {
        traspasos: traspasosPendientes.map(t => ({
          articulo: t.articulo,
          almacenOrigen: t.almacenOrigen,
          ubicacionOrigen: t.ubicacionOrigen,
          almacenDestino: t.almacenDestino,
          ubicacionDestino: t.ubicacionDestino,
          cantidad: t.cantidad,
          usuario: usuario
        }))
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (response.data.success) {
        setTraspasosHistorial([...response.data.historial, ...traspasosHistorial]);
        setShowSuccess(true);
        setTraspasosPendientes([]);
        
        setTimeout(() => setShowSuccess(false), 2000);
      } else {
        throw new Error(response.data.mensaje || 'Error al confirmar traspasos');
      }
    } catch (error) {
      alert('Error: ' + error.message);
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
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="traspaso-screen">
      <div className="traspaso-container">
        <div className="header-card">
          <h1 className="header-title">
            <Icon name="warehouse" />
            Traspaso entre Almacenes
          </h1>
          <button onClick={() => navigate('/')} className="btn-volver">
            <Icon name="arrowLeft" /> Menú
          </button>
        </div>
        
        <Navbar />
        
        {/* Filtro por almacén */}
        <div className="filtro-almacen-container">
          <label>Filtrar por almacén:</label>
          <select
            value={filtroAlmacen}
            onChange={(e) => setFiltroAlmacen(e.target.value)}
            className="filtro-almacen"
          >
            <option value="">Todos los almacenes</option>
            {almacenes.map(alm => (
              <option key={alm.codigo} value={alm.codigo}>
                {alm.nombre}
              </option>
            ))}
          </select>
        </div>
        
        <div className="main-grid">
          <div className="form-card">
            <div className="card-header">
              <h2 className="card-title">
                <Icon name="plus" /> Nuevo Traspaso
              </h2>
            </div>
            
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
                    {articulosFiltradosPorAlmacen.length > 0 ? (
                      articulosFiltradosPorAlmacen.map((art) => (
                        <div 
                          key={art.codigo} 
                          className="dropdown-item"
                          onClick={() => handleSelectArticulo(art.codigo)}
                        >
                          <div className="article-code">{art.codigo}</div>
                          <div className="article-name">{art.nombre}</div>
                          <div className="article-stock">Stock: {art.stock}</div>
                        </div>
                      ))
                    ) : (
                      <div className="dropdown-empty">No se encontraron artículos</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="compact-grid">
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
                  {almacenes.map((alm) => (
                    <option key={alm.codigo} value={alm.codigo}>{alm.nombre}</option>
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
                  {ubicacionesOrigen.map((ubi) => (
                    <option key={ubi.ubicacion} value={ubi.ubicacion}>
                      {ubi.ubicacion} {ubi.stock > 0 && `(${ubi.stock} uds)`}
                      {traspasoData.almacenOrigen === 'DESCARGA' && ' [Descarga]'}
                    </option>
                  ))}
                </select>
              </div>
              
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
                  {almacenes.map((alm) => (
                    <option key={alm.codigo} value={alm.codigo}>{alm.nombre}</option>
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
                  {ubicacionesDestino.map((ubi) => (
                    <option key={ubi} value={ubi}>{ubi}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group quantity-group">
                <label className="form-label">
                  <Icon name="hashtag" /> Cantidad
                </label>
                <input
                  type="number"
                  placeholder="0"
                  min="0"
                  value={traspasoData.cantidad}
                  onChange={handleCantidadChange}
                  className="quantity-input"
                />
              </div>
              
              <div className="form-group button-group">
                <button onClick={agregarTraspaso} className="btn-add">
                  <Icon name="plus" /> Agregar
                </button>
              </div>
            </div>
          </div>
          
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
                          <tr key={traspaso.id}>
                            <td>
                              <div className="article-name">{traspaso.nombreArticulo}</div>
                              <div className="article-code">{traspaso.articulo}</div>
                              {traspaso.esDescarga && (
                                <div className="descarga-tag">
                                  <Icon name="download" /> Descarga
                                </div>
                              )}
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
                        <th>Usuario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traspasosHistorial.map((traspaso) => (
                        <tr key={traspaso.id}>
                          <td>{new Date(traspaso.fecha).toLocaleDateString()}</td>
                          <td>
                            <div className="article-name">{traspaso.nombreArticulo}</div>
                            <div className="article-code">{traspaso.articulo}</div>
                            {traspaso.almacenOrigen === 'DESCARGA' && (
                              <div className="descarga-tag">
                                <Icon name="download" /> Descarga
                              </div>
                            )}
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
                          <td>
                            <div className="user-info">
                              <Icon name="user" /> {traspaso.usuario}
                            </div>
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
      
      {showSuccess && (
        <div className="success-notification">
          <Icon name="check" />
          <div>Traspasos realizados: {traspasosPendientes.length} artículos</div>
        </div>
      )}
      
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