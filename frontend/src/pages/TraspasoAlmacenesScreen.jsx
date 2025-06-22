import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/TraspasoAlmacenesScreen.css';
import Navbar from '../components/Navbar';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';

const TraspasoAlmacenesScreen = () => {
  const navigate = useNavigate();
  const searchRef = useRef(null);
  const [articulos, setArticulos] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [ubicacionesOrigen, setUbicacionesOrigen] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [traspasosPendientes, setTraspasosPendientes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState('pendientes');
  const [showArticleDropdown, setShowArticleDropdown] = useState(false);
  const [filtroAlmacen, setFiltroAlmacen] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [movimientos, setMovimientos] = useState([]);
  const [traspasoData, setTraspasoData] = useState({
    articulo: '',
    almacenOrigen: '',
    ubicacionOrigen: '',
    almacenDestino: '',
    ubicacionDestino: '',
    cantidad: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const headers = getAuthHeader();
        const user = JSON.parse(localStorage.getItem('user'));
        const codigoEmpresa = user.CodigoEmpresa;
        
        const [artResponse, almResponse, movResponse] = await Promise.all([
          axios.get(`http://localhost:3000/inventario?codigoEmpresa=${codigoEmpresa}`, { headers }),
          axios.get(`http://localhost:3000/almacenes?codigoEmpresa=${codigoEmpresa}`, { headers }),
          axios.get(`http://localhost:3000/movimientos?codigoEmpresa=${codigoEmpresa}&dias=30`, { headers })
        ]);
        
        setArticulos(artResponse.data);
        setAlmacenes(almResponse.data);
        setMovimientos(movResponse.data);
        
      } catch (error) {
        console.error('Error al obtener datos:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [navigate]);

  const articulosFiltrados = busqueda 
    ? articulos.filter(art => 
        art.codigo.toLowerCase().includes(busqueda.toLowerCase())) || 
        (art.nombre && art.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : articulos;
      
  const handleSelectArticulo = (codigo) => {
    setTraspasoData({...traspasoData, articulo: codigo});
    setBusqueda(codigo);
    setShowArticleDropdown(false);
  };

  useEffect(() => {
    const fetchUbicacionesOrigen = async () => {
      if (!traspasoData.articulo || !traspasoData.almacenOrigen) return;
      
      try {
        const headers = getAuthHeader();
        if (traspasoData.almacenOrigen === 'DESCARGA') {
          setUbicacionesOrigen([
            { ubicacion: 'Muelle 1', stock: 0 },
            { ubicacion: 'Muelle 2', stock: 0 },
            { ubicacion: 'Zona Recepción', stock: 0 },
            { ubicacion: 'Cuarentena', stock: 0 }
          ]);
        } else {
          const response = await axios.get(
            `http://localhost:3000/stock?articulo=${traspasoData.articulo}&almacen=${traspasoData.almacenOrigen}`,
            { headers }
          );
          
          if (Array.isArray(response.data)) {
            setUbicacionesOrigen(response.data);
          } else {
            setUbicacionesOrigen([]);
          }
        }
      } catch (error) {
        console.error('Error al obtener ubicaciones origen:', error);
        setUbicacionesOrigen([]);
      }
    };
    
    fetchUbicacionesOrigen();
  }, [traspasoData.articulo, traspasoData.almacenOrigen]);

  useEffect(() => {
    const fetchUbicacionesDestino = async () => {
      if (!traspasoData.almacenDestino) return;
      
      try {
        const headers = getAuthHeader();
        const response = await axios.get(
          `http://localhost:3000/ubicaciones/almacen?almacen=${traspasoData.almacenDestino}`,
          { headers }
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
    
    if (!articulo || !almacenOrigen || !ubicacionOrigen || !almacenDestino || !ubicacionDestino || !cantidad || cantidadNum <= 0) {
      alert('Completa todos los campos. Cantidad debe ser mayor que 0');
      return;
    }
    
    if (almacenOrigen === almacenDestino && ubicacionOrigen === ubicacionDestino) {
      alert('La ubicación destino debe ser diferente a la origen');
      return;
    }

    const articuloInfo = articulos.find(a => a.codigo === articulo);
    
    if (almacenOrigen !== 'DESCARGA') {
      try {
        const headers = getAuthHeader();
        const stockResponse = await axios.get(
          `http://localhost:3000/stock?articulo=${articulo}&almacen=${almacenOrigen}&ubicacion=${ubicacionOrigen}`,
          { headers }
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
    
    setTraspasosPendientes([...traspasosPendientes, {
      ...traspasoData,
      cantidad: cantidadNum,
      nombreArticulo: articuloInfo.nombre,
      id: Date.now(),
      esDescarga: almacenOrigen === 'DESCARGA'
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

    const valido = traspasosPendientes.every(t => 
      t.articulo && t.almacenOrigen && t.ubicacionOrigen && 
      t.almacenDestino && t.ubicacionDestino && t.cantidad > 0
    );
    
    if (!valido) {
      alert('Hay traspasos con datos incompletos. Revísalos antes de confirmar.');
      return;
    }

    setIsLoading(true);
    
    try {
      const headers = getAuthHeader();
      const user = JSON.parse(localStorage.getItem('user'));
      const usuario = user.Nombre;
      
      const response = await axios.post(
        'http://localhost:3000/traspasos/confirmar', 
        {
          traspasos: traspasosPendientes.map(t => ({
            articulo: t.articulo,
            almacenOrigen: t.almacenOrigen,
            ubicacionOrigen: t.ubicacionOrigen,
            almacenDestino: t.almacenDestino,
            ubicacionDestino: t.ubicacionDestino,
            cantidad: t.cantidad,
            usuario: usuario
          }))
        },
        { headers }
      );
      
      if (response.data.success) {
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
    <div className="traspaso-screen fade-in">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-card">
            <div className="loading-spinner"></div>
            <p className="loading-text">Procesando...</p>
          </div>
        </div>
      )}
      
      {showSuccess && (
        <div className="success-notification">
          <span>✓</span> Traspasos confirmados correctamente
        </div>
      )}
      
      <div className="traspaso-container">
        <div className="header-card">
          <h1 className="header-title">
            <span className="icon">🏭</span>
            Traspaso entre Almacenes
          </h1>
        </div>
        
        <Navbar />
        
        <div className="filtro-almacen-container">
          <label>Filtrar por almacén:</label>
          <select
            value={filtroAlmacen}
            onChange={(e) => setFiltroAlmacen(e.target.value)}
            className="filtro-almacen"
          >
            <option value="">Todos los almacenes</option>
            {almacenes.map(alm => (
              <option key={alm.codigo} value={alm.codigo}>{alm.nombre}</option>
            ))}
          </select>
        </div>
        
        <div className="main-grid">
          <div className="form-card">
            <div className="card-header">
              <h2 className="card-title">
                <span className="icon">➕</span> Nuevo Traspaso
              </h2>
            </div>
            
            <div className="form-group">
              <label className="form-label">
                <span className="icon">📦</span> Artículo
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
                  <div className="article-dropdown" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {articulosFiltrados.map((art) => (
                      <div 
                        key={art.codigo} 
                        className="dropdown-item"
                        onClick={() => handleSelectArticulo(art.codigo)}
                      >
                        <div className="article-code">{art.codigo}</div>
                        <div className="article-name">{art.nombre}</div>
                        <div className="article-stock">Stock: {art.stock}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="compact-grid">
              <div className="form-group">
                <label className="form-label">
                  <span className="icon">📍</span> Almacén Origen
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
                  <option value="DESCARGA">Zona de Descarga</option>
                </select>
              </div>
              
              <div className="form-group">
                <label className="form-label">
                  <span className="icon">📌</span> Ubicación Origen
                </label>
                <select
                  value={traspasoData.ubicacionOrigen}
                  onChange={(e) => setTraspasoData({ ...traspasoData, ubicacionOrigen: e.target.value })}
                  disabled={!traspasoData.almacenOrigen}
                  className="select-input"
                >
                  <option value="">Selecciona ubicación</option>
                  {ubicacionesOrigen.map((ubi, index) => (
                    <option key={index} value={ubi.ubicacion}>
                      {ubi.ubicacion} {ubi.stock > 0 && `(${ubi.stock} uds)`}
                      {traspasoData.almacenOrigen === 'DESCARGA' && ' [Descarga]'}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label className="form-label">
                  <span className="icon">📍</span> Almacén Destino
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
                  <span className="icon">📌</span> Ubicación Destino
                </label>
                <select
                  value={traspasoData.ubicacionDestino}
                  onChange={(e) => setTraspasoData({ ...traspasoData, ubicacionDestino: e.target.value })}
                  disabled={!traspasoData.almacenDestino}
                  className="select-input"
                >
                  <option value="">Selecciona ubicación</option>
                  {ubicacionesDestino.map((ubi, index) => (
                    <option key={index} value={ubi}>{ubi}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group quantity-group">
                <label className="form-label">
                  <span className="icon">🔢</span> Cantidad
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
                  <span className="icon">➕</span> Agregar
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
                                  <span className="icon">⬇️</span> Descarga
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
                                  <span className="icon">✏️</span>
                                </button>
                                <button 
                                  onClick={() => eliminarTraspaso(traspaso.id)}
                                  className="btn-action btn-delete"
                                  title="Eliminar"
                                >
                                  <span className="icon">🗑️</span>
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
                        <span className="icon">📦</span>
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
                    <span className="icon">✅</span> Confirmar Traspasos
                  </button>
                )}
              </>
            ) : (
              <div className="table-container">
                {movimientos.length > 0 ? (
                  <table className="movimientos-table responsive-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Artículo</th>
                        <th>Almacén</th>
                        <th>Ubicación</th>
                        <th>Cantidad</th>
                        <th>Tipo</th>
                        <th>Usuario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimientos.map((movimiento) => (
                        <tr key={movimiento.id}>
                          <td>{new Date(movimiento.Fecha).toLocaleString()}</td>
                          <td>{movimiento.CodigoArticulo}</td>
                          <td>{movimiento.CodigoAlmacen}</td>
                          <td>{movimiento.Ubicacion}</td>
                          <td>{movimiento.Unidades}</td>
                          <td>{movimiento.TipoMovimiento === 1 ? 'Entrada' : 'Salida'}</td>
                          <td>{movimiento.Usuario || 'Sistema'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <span className="icon">📅</span>
                    </div>
                    <p className="empty-description">No hay movimientos registrados</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(TraspasoAlmacenesScreen);