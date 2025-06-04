// src/pages/TraspasoAlmacenesScreen.jsx
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
  const [activeTab, setActiveTab] = useState('pendientes'); // 'pendientes' o 'historial'
  const [showArticleDropdown, setShowArticleDropdown] = useState(false);
  
  const [traspasoData, setTraspasoData] = useState({
    articulo: '',
    almacenOrigen: '',
    ubicacionOrigen: '',
    almacenDestino: '',
    ubicacionDestino: '',
    cantidad: ''
  });

  // Datos mock
  useEffect(() => {
    setIsLoading(true);
    setTimeout(() => {
      setArticulos([
        { codigo: 'TRN-6X50', nombre: 'Tornillo hexagonal 6x50 mm', almacenes: ['Principal', 'Secundario'], stock: 1500 },
        { codigo: 'TRC-M8', nombre: 'Tuerca M8 galvanizada', almacenes: ['Principal', 'Taller'], stock: 3200 },
        { codigo: 'TUB-ALU-20', nombre: 'Tubo aluminio 20mm', almacenes: ['Metales', 'Principal'], stock: 480 },
        { codigo: 'BRD-40', nombre: 'Brida de acero 40mm', almacenes: ['Principal', 'Taller'], stock: 250 },
        { codigo: 'VLV-1/2', nombre: 'Válvula de bola 1/2"', almacenes: ['Fontanería', 'Principal'], stock: 120 },
        { codigo: 'CNC-5M', nombre: 'Conector rápido para tubo 5mm', almacenes: ['Fontanería', 'Principal'], stock: 780 },
        { codigo: 'BRZ-1/4', nombre: 'Brida zincada 1/4"', almacenes: ['Taller', 'Secundario'], stock: 420 },
        { codigo: 'JUN-RED-32', nombre: 'Junta tórica roja 32mm', almacenes: ['Principal', 'Hidráulica'], stock: 950 },
        { codigo: 'TUB-PVC-40', nombre: 'Tubo PVC 40mm presión', almacenes: ['Fontanería', 'Plásticos'], stock: 350 },
        { codigo: 'VAL-RET-20', nombre: 'Válvula retención 20mm', almacenes: ['Fontanería', 'Principal'], stock: 180 }
      ]);

      setAlmacenes(['Principal', 'Secundario', 'Taller', 'Metales', 'Fontanería', 'Plásticos', 'Hidráulica', 'Químicos']);
      
      // Mock de historial
      setTraspasosHistorial([
        {
          id: 1,
          fecha: '2023-05-15',
          articulo: 'TRN-6X50',
          nombreArticulo: 'Tornillo hexagonal 6x50 mm',
          almacenOrigen: 'Principal',
          ubicacionOrigen: 'Pasillo 1-Est.A',
          almacenDestino: 'Taller',
          ubicacionDestino: 'Banco 1-C2',
          cantidad: 100
        },
        {
          id: 2,
          fecha: '2023-05-10',
          articulo: 'VLV-1/2',
          nombreArticulo: 'Válvula de bola 1/2"',
          almacenOrigen: 'Fontanería',
          ubicacionOrigen: 'Mostrador',
          almacenDestino: 'Principal',
          ubicacionDestino: 'Pasillo 3-Est.C',
          cantidad: 50
        }
      ]);
      
      setIsLoading(false);
    }, 300);
  }, []);

  // Filtrar artículos por búsqueda (mostrar max 10)
  const articulosFiltrados = busqueda 
    ? articulos.filter(art => 
        art.codigo.toLowerCase().includes(busqueda.toLowerCase()) || 
        art.nombre.toLowerCase().includes(busqueda.toLowerCase())
      ).slice(0, 10)
    : articulos.slice(0, 10);

  // Manejar selección de artículo
  const handleSelectArticulo = (codigo) => {
    setTraspasoData({...traspasoData, articulo: codigo});
    setBusqueda(codigo);
    setShowArticleDropdown(false);
  };

  // Cargar ubicaciones cuando se selecciona artículo y almacén origen
  useEffect(() => {
    if (traspasoData.articulo && traspasoData.almacenOrigen) {
      const ubicacionesMock = {
        'Principal': ['Pasillo 1-Est.A', 'Pasillo 2-Est.B', 'Pasillo 3-Est.C', 'Mostrador N'],
        'Secundario': ['Est.A-N1', 'Est.B-N2', 'Zona Carga-P3', 'Sector 5-R4'],
        'Taller': ['Banco 1-C2', 'Banco 2-C4', 'Alm. Taller', 'Herramientas'],
        'Metales': ['Rack 1-N3', 'Rack 2-N1', 'Zona Corte', 'Perfiles'],
        'Fontanería': ['Est. Font-C3', 'Mostrador', 'Cajón 5'],
        'Plásticos': ['Zona PVC', 'Est. C-N4', 'Rack 3-A1'],
        'Hidráulica': ['Est. H1-C2', 'Est. H2-C4', 'Cajones'],
        'Químicos': ['Armario Seguro', 'Est. Q1-N2', 'Zona Ventilada']
      };
      setUbicacionesOrigen(ubicacionesMock[traspasoData.almacenOrigen] || []);
      // Mantener la ubicación si ya estaba seleccionada y sigue disponible
      if (!ubicacionesMock[traspasoData.almacenOrigen]?.includes(traspasoData.ubicacionOrigen)) {
        setTraspasoData(prev => ({ ...prev, ubicacionOrigen: '' }));
      }
    }
  }, [traspasoData.articulo, traspasoData.almacenOrigen]);

  // Cargar ubicaciones cuando se selecciona almacén destino
  useEffect(() => {
    if (traspasoData.almacenDestino) {
      const ubicacionesMock = {
        'Principal': ['Pasillo 1-Est.A', 'Pasillo 2-Est.B', 'Pasillo 3-Est.C', 'Mostrador N'],
        'Secundario': ['Est.A-N1', 'Est.B-N2', 'Zona Carga-P3', 'Sector 5-R4'],
        'Taller': ['Banco 1-C2', 'Banco 2-C4', 'Alm. Taller', 'Herramientas'],
        'Metales': ['Rack 1-N3', 'Rack 2-N1', 'Zona Corte', 'Perfiles'],
        'Fontanería': ['Est. Font-C3', 'Mostrador', 'Cajón 5'],
        'Plásticos': ['Zona PVC', 'Est. C-N4', 'Rack 3-A1'],
        'Hidráulica': ['Est. H1-C2', 'Est. H2-C4', 'Cajones'],
        'Químicos': ['Armario Seguro', 'Est. Q1-N2', 'Zona Ventilada']
      };
      setUbicacionesDestino(ubicacionesMock[traspasoData.almacenDestino] || []);
      // Mantener la ubicación si ya estaba seleccionada y sigue disponible
      if (!ubicacionesMock[traspasoData.almacenDestino]?.includes(traspasoData.ubicacionDestino)) {
        setTraspasoData(prev => ({ ...prev, ubicacionDestino: '' }));
      }
    }
  }, [traspasoData.almacenDestino]);

  const handleCantidadChange = (e) => {
    let value = e.target.value;
    // Permitir solo números positivos
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
    
    // Validar que al menos la ubicación sea diferente
    if (almacenOrigen === almacenDestino && ubicacionOrigen === ubicacionDestino) {
      alert('La ubicación destino debe ser diferente a la origen');
      return;
    }

    const articuloInfo = articulos.find(a => a.codigo === articulo);
    
    if (cantidadNum > articuloInfo.stock) {
      alert(`Stock insuficiente. Disponible: ${articuloInfo.stock} unidades`);
      return;
    }
    
    setTraspasosPendientes([...traspasosPendientes, {
      ...traspasoData,
      cantidad: cantidadNum,
      nombreArticulo: articuloInfo.nombre,
      id: Date.now()
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
          
          <button 
            onClick={() => navigate('/PedidosScreen')}
            className="btn-volver"
          >
            <Icon name="arrowLeft" /> Menú
          </button>
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
                      articulosFiltrados.map((art) => (
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
                  {articulos.find(a => a.codigo === traspasoData.articulo)?.almacenes.map((alm, i) => (
                    <option key={i} value={alm}>{alm}</option>
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
                    <option key={i} value={alm}>{alm}</option>
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
                  min="0"
                  value={traspasoData.cantidad}
                  onChange={handleCantidadChange}
                  className="quantity-input"
                  onKeyDown={(e) => {
                    // Bloquear caracteres no numéricos
                    if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
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
                          <tr key={traspaso.id}>
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
                        <tr key={traspaso.id}>
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