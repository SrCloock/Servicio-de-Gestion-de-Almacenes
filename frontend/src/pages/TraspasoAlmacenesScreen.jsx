import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/TraspasoAlmacenesScreen.css';
import Navbar from '../components/Navbar';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import { FixedSizeList as List } from 'react-window';

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
  const [stockData, setStockData] = useState([]);
  const [articulosFiltrados, setArticulosFiltrados] = useState([]);
  const [isFetchingStock, setIsFetchingStock] = useState(false);
  const [stockDisponible, setStockDisponible] = useState(0);

  // Debounce para la búsqueda
  useEffect(() => {
    const handler = setTimeout(() => {
      if (busqueda.trim() === '') {
        setArticulosFiltrados([]);
      } else {
        const filtered = articulos.filter(art => 
          art.codigo.toLowerCase().includes(busqueda.toLowerCase()) || 
          (art.nombre && art.nombre.toLowerCase().includes(busqueda.toLowerCase()))
        );
        setArticulosFiltrados(filtered.slice(0, 100));
      }
    }, 300);
    
    return () => clearTimeout(handler);
  }, [busqueda, articulos]);

  // Obtener datos iniciales
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
          axios.get(`http://localhost:3000/movimientos-combinados?codigoEmpresa=${codigoEmpresa}&dias=30`, { headers })
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

  // Al seleccionar un artículo, obtener su stock
  const handleSelectArticulo = useCallback(async (codigo) => {
    setTraspasoData(prev => ({
      ...prev, 
      articulo: codigo,
      almacenOrigen: '',
      ubicacionOrigen: '',
      almacenDestino: '',
      ubicacionDestino: '',
      cantidad: ''
    }));
    setBusqueda(codigo);
    setShowArticleDropdown(false);
    
    setIsFetchingStock(true);
    try {
      const headers = getAuthHeader();
      const user = JSON.parse(localStorage.getItem('user'));
      const codigoEmpresa = user.CodigoEmpresa;
      
      // Obtener stock por ubicación usando el nuevo endpoint
      const response = await axios.get(
        `http://localhost:3000/stock-con-ubicacion?codigoEmpresa=${codigoEmpresa}&codigoArticulo=${codigo}`,
        { headers }
      );
      
      // Formatear los datos para el frontend
      const stockDataFormateado = response.data.map(item => ({
        almacen: item.CodigoAlmacen,
        ubicacion: item.Ubicacion,
        stock: parseFloat(item.UnidadSaldo)
      }));
      
      setStockData(stockDataFormateado);
      
      // Encontrar el almacén con mayor stock
      let maxStock = 0;
      let selectedAlmacen = '';
      let selectedUbicacion = '';
      
      // Agrupar por almacén para encontrar el con mayor stock
      const almacenesAgrupados = {};
      stockDataFormateado.forEach(item => {
        if (!almacenesAgrupados[item.almacen]) {
          almacenesAgrupados[item.almacen] = {
            stockTotal: 0,
            ubicaciones: []
          };
        }
        almacenesAgrupados[item.almacen].stockTotal += item.stock;
        almacenesAgrupados[item.almacen].ubicaciones.push(item);
      });
      
      // Encontrar almacén con mayor stock
      Object.entries(almacenesAgrupados).forEach(([almacen, data]) => {
        if (data.stockTotal > maxStock) {
          maxStock = data.stockTotal;
          selectedAlmacen = almacen;
          
          // Encontrar ubicación con mayor stock en este almacén
          let maxUbicacionStock = 0;
          data.ubicaciones.forEach(ubi => {
            if (ubi.stock > maxUbicacionStock) {
              maxUbicacionStock = ubi.stock;
              selectedUbicacion = ubi.ubicacion;
            }
          });
        }
      });
      
      // Si encontramos un almacén y ubicación, los seleccionamos
      if (selectedAlmacen && selectedUbicacion) {
        setTraspasoData(prev => ({
          ...prev,
          almacenOrigen: selectedAlmacen,
          ubicacionOrigen: selectedUbicacion
        }));
        
        // Actualizar stock disponible
        const stockUbicacion = stockDataFormateado.find(
          item => item.almacen === selectedAlmacen && 
                  item.ubicacion === selectedUbicacion
        )?.stock || 0;
        
        setStockDisponible(stockUbicacion);
      } else {
        setStockDisponible(0);
      }
      
    } catch (error) {
      console.error('Error al obtener stock del artículo:', error);
      setStockDisponible(0);
    } finally {
      setIsFetchingStock(false);
    }
  }, []);

  // Al cambiar el almacén de origen, actualizar las ubicaciones de origen
  useEffect(() => {
    if (traspasoData.articulo && traspasoData.almacenOrigen) {
      // Manejar zona de descarga como caso especial
      if (traspasoData.almacenOrigen === 'DESCARGA') {
        setUbicacionesOrigen([
          { ubicacion: 'Descarga', stock: Infinity }
        ]);
        setTraspasoData(prev => ({
          ...prev, 
          ubicacionOrigen: 'Descarga'
        }));
        setStockDisponible(Infinity);
      } else {
        // Filtrar ubicaciones para este almacén
        const ubicacionesFiltradas = stockData
          .filter(item => 
            item.almacen === traspasoData.almacenOrigen
          )
          .map(item => ({
            ubicacion: item.ubicacion,
            stock: item.stock
          }));
        
        setUbicacionesOrigen(ubicacionesFiltradas);
        
        // Si la ubicación actual no está en las nuevas ubicaciones, resetearla
        if (ubicacionesFiltradas.length > 0 && !ubicacionesFiltradas.some(u => u.ubicacion === traspasoData.ubicacionOrigen)) {
          setTraspasoData(prev => ({
            ...prev, 
            ubicacionOrigen: ubicacionesFiltradas[0].ubicacion
          }));
          
          // Actualizar stock disponible para la nueva ubicación
          setStockDisponible(ubicacionesFiltradas[0].stock);
        }
      }
    }
  }, [traspasoData.almacenOrigen, traspasoData.articulo, stockData]);

  // Al cambiar la ubicación de origen, actualizar el stock disponible
  useEffect(() => {
    if (traspasoData.almacenOrigen === 'DESCARGA') {
      setStockDisponible(Infinity);
    } else if (traspasoData.ubicacionOrigen && traspasoData.almacenOrigen) {
      const ubicacionData = stockData.find(
        item => item.almacen === traspasoData.almacenOrigen && 
                item.ubicacion === traspasoData.ubicacionOrigen
      );
      
      setStockDisponible(ubicacionData ? ubicacionData.stock : 0);
    }
  }, [traspasoData.ubicacionOrigen, traspasoData.almacenOrigen, stockData]);

  // Al cambiar el almacén de destino, obtener sus ubicaciones
  useEffect(() => {
    const fetchUbicacionesDestino = async () => {
      if (!traspasoData.almacenDestino) {
        setUbicacionesDestino([]);
        return;
      }
      
      try {
        const headers = getAuthHeader();
        const response = await axios.get(
          `http://localhost:3000/ubicaciones/almacen?almacen=${traspasoData.almacenDestino}`,
          { headers }
        );
        
        // Filtrar: si el almacén destino es igual al origen, quitar la ubicación de origen
        let ubicaciones = response.data;
        if (traspasoData.almacenDestino === traspasoData.almacenOrigen) {
          ubicaciones = ubicaciones.filter(ubi => ubi !== traspasoData.ubicacionOrigen);
        }
        
        setUbicacionesDestino(ubicaciones);
      } catch (error) {
        console.error('Error al obtener ubicaciones destino:', error);
        setUbicacionesDestino([]);
      }
    };
    
    fetchUbicacionesDestino();
  }, [traspasoData.almacenDestino, traspasoData.almacenOrigen, traspasoData.ubicacionOrigen]);

  const handleCantidadChange = (e) => {
    const value = e.target.value;
    if (value === '' || (Number(value) >= 0 && Number(value) <= 9999)) {
      setTraspasoData({ ...traspasoData, cantidad: value });
    }
  };

  const agregarTraspaso = () => {
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

    // Verificar stock disponible (excepto para descarga)
    if (almacenOrigen !== 'DESCARGA') {
      if (cantidadNum > stockDisponible) {
        alert(`Stock insuficiente. Disponible: ${stockDisponible} unidades`);
        return;
      }
    }
    
    const articuloInfo = articulos.find(a => a.codigo === articulo);
    
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
      
      // Recargar stock para este artículo
      handleSelectArticulo(traspaso.articulo);
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
      const usuario = user.CodigoCliente;
      
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
        
        // Actualizar movimientos
        const movResponse = await axios.get(
          `http://localhost:3000/movimientos-combinados?codigoEmpresa=${user.CodigoEmpresa}&dias=30`,
          { headers }
        );
        setMovimientos(movResponse.data);
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

  // Función para renderizar elementos de la lista de artículos
  const Row = ({ index, style }) => {
    const art = articulosFiltrados[index];
    return (
      <div 
        style={style} 
        className="dropdown-item"
        onClick={() => handleSelectArticulo(art.codigo)}
      >
        <div className="article-code">{art.codigo}</div>
        <div className="article-name">{art.nombre}</div>
        <div className="article-stock">Stock: {art.stock}</div>
      </div>
    );
  };

  return (
    <div className="traspaso-screen">
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
                  <div className="article-dropdown">
                    {articulosFiltrados.length > 0 ? (
                      <List
                        height={Math.min(200, articulosFiltrados.length * 50)}
                        itemCount={articulosFiltrados.length}
                        itemSize={50}
                        width="100%"
                      >
                        {Row}
                      </List>
                    ) : (
                      <div className="dropdown-item no-results">
                        {busqueda ? "No se encontraron artículos" : "Comience a escribir para buscar"}
                      </div>
                    )}
                  </div>
                )}
                {isFetchingStock && (
                  <div className="stock-loading">
                    <div className="mini-spinner"></div>
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
                  disabled={!traspasoData.articulo || isFetchingStock}
                  className="select-input"
                >
                  <option value="">Selecciona almacén</option>
                  {stockData
                    .filter((item, index, self) => 
                      index === self.findIndex(i => i.almacen === item.almacen)
                    )
                    .map(item => {
                      const almacenInfo = almacenes.find(a => a.codigo === item.almacen);
                      const stockTotal = stockData
                        .filter(i => i.almacen === item.almacen)
                        .reduce((sum, i) => sum + i.stock, 0);
                      
                      return (
                        <option key={item.almacen} value={item.almacen}>
                          {almacenInfo?.nombre || item.almacen} ({stockTotal} uds)
                        </option>
                      );
                    })}
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
                  disabled={!traspasoData.almacenOrigen || isFetchingStock || traspasoData.almacenOrigen === 'DESCARGA'}
                  className="select-input"
                >
                  <option value="">Selecciona ubicación</option>
                  {ubicacionesOrigen.map((ubi, index) => (
                    <option key={index} value={ubi.ubicacion}>
                      {ubi.ubicacion} {ubi.stock === Infinity ? '' : `(${ubi.stock} uds)`}
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
                  {traspasoData.almacenOrigen && (
                    <span className="stock-info">
                      {traspasoData.almacenOrigen === 'DESCARGA' 
                        ? ' (Stock ilimitado)' 
                        : ` (Disponible: ${stockDisponible} uds)`}
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  placeholder="0"
                  min="0"
                  max={traspasoData.almacenOrigen === 'DESCARGA' ? undefined : stockDisponible}
                  value={traspasoData.cantidad}
                  onChange={handleCantidadChange}
                  className="quantity-input"
                />
              </div>
              
              <div className="form-group button-group">
                <button 
                  onClick={agregarTraspaso} 
                  className="btn-add"
                  disabled={isFetchingStock}
                >
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
                  <table className="movimientos-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Artículo</th>
                        <th>Alm. Origen</th>
                        <th>Ubic. Origen</th>
                        <th>Alm. Destino</th>
                        <th>Ubic. Destino</th>
                        <th>Cantidad</th>
                        <th>Tipo</th>
                        <th>Usuario</th>
                        <th>Comentario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimientos.map((movimiento, index) => (
                        <tr key={`${movimiento.Fecha}-${index}`}>
                          <td>{new Date(movimiento.Fecha).toLocaleString()}</td>
                          <td>{movimiento.CodigoArticulo}</td>
                          <td>
                            {movimiento.Tipo === 'Traspaso' 
                              ? movimiento.AlmacenOrigen 
                              : movimiento.TipoMovimiento === 2 
                                ? movimiento.CodigoAlmacen 
                                : '-'}
                          </td>
                          <td>
                            {movimiento.Tipo === 'Traspaso' 
                              ? movimiento.UbicacionOrigen 
                              : movimiento.TipoMovimiento === 2 
                                ? movimiento.Ubicacion 
                                : '-'}
                          </td>
                          <td>
                            {movimiento.Tipo === 'Traspaso' 
                              ? movimiento.AlmacenDestino 
                              : movimiento.TipoMovimiento === 1 
                                ? movimiento.CodigoAlmacen 
                                : '-'}
                          </td>
                          <td>
                            {movimiento.Tipo === 'Traspaso' 
                              ? movimiento.UbicacionDestino 
                              : movimiento.TipoMovimiento === 1 
                                ? movimiento.Ubicacion 
                                : '-'}
                          </td>
                          <td>{movimiento.Unidades}</td>
                          <td>
                            {movimiento.Tipo === 'Traspaso' 
                              ? 'Traspaso' 
                              : movimiento.TipoMovimiento === 1 
                                ? 'Entrada' 
                                : 'Salida'}
                          </td>
                          <td>{movimiento.Usuario}</td>
                          <td>{movimiento.Comentario || '-'}</td>
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

export default TraspasoAlmacenesScreen;