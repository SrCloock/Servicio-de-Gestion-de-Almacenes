import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import '../styles/TraspasosPage.css';

const TraspasosPage = () => {
  // Estados principales
  const [activeSection, setActiveSection] = useState('movimientos');
  const [activeTab, setActiveTab] = useState('articulo');
  const [almacenes, setAlmacenes] = useState([]);
  const [ubicacionesOrigen, setUbicacionesOrigen] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cargandoUbicaciones, setCargandoUbicaciones] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  
  // Estados para modos de operación
  const [modoArticulo, setModoArticulo] = useState({
    terminoBusqueda: '',
    resultadosBusqueda: [],
    articuloSeleccionado: null,
    stockDisponible: [],
    form: {
      origenAlmacen: '',
      origenUbicacion: '',
      destinoAlmacen: '',
      destinoUbicacion: '',
      cantidad: ''
    },
    buscando: false,
    errorBusqueda: '',
    detalles: null
  });
  
  const [modoUbicacion, setModoUbicacion] = useState({
    ubicacionSeleccionada: null,
    articulosUbicacion: [],
    articuloSeleccionado: null,
    form: {
      destinoAlmacen: '',
      destinoUbicacion: '',
      cantidad: ''
    },
    detalles: null
  });
  
  // Referencias y datos de usuario
  const user = JSON.parse(localStorage.getItem('user'));
  const timerRef = useRef(null);

  // ======================= EFECTOS ======================= //
  useEffect(() => {
    const cargarAlmacenes = async () => {
      try {
        const headers = getAuthHeader();
        const response = await axios.get('http://localhost:3000/almacenes', { headers });
        setAlmacenes(response.data);
      } catch (error) {
        console.error('Error cargando almacenes:', error);
      }
    };
    cargarAlmacenes();
  }, []);

  useEffect(() => {
    // Debounce para búsqueda de artículos
    if (timerRef.current) clearTimeout(timerRef.current);
    
    const buscarArticulos = async () => {
      const termino = modoArticulo.terminoBusqueda.trim();
      if (!termino) {
        setModoArticulo(prev => ({ ...prev, resultadosBusqueda: [], errorBusqueda: '' }));
        return;
      }
      
      setModoArticulo(prev => ({ ...prev, buscando: true, errorBusqueda: '' }));
      
      try {
        const headers = getAuthHeader();
        const response = await axios.get(
          `http://localhost:3000/buscar-articulos?termino=${encodeURIComponent(termino)}`,
          { headers }
        );
        setModoArticulo(prev => ({ 
          ...prev, 
          resultadosBusqueda: response.data,
          errorBusqueda: response.data.length ? '' : 'No se encontraron artículos',
          buscando: false
        }));
      } catch (error) {
        console.error('Error buscando artículos:', error);
        setModoArticulo(prev => ({ 
          ...prev, 
          errorBusqueda: 'Error al buscar artículos. Intente nuevamente.',
          resultadosBusqueda: [],
          buscando: false
        }));
      }
    };
    
    timerRef.current = setTimeout(buscarArticulos, 300);
    return () => clearTimeout(timerRef.current);
  }, [modoArticulo.terminoBusqueda]);

  useEffect(() => {
    // Cargar ubicaciones de origen (modo Ubicación)
    if (modoUbicacion.ubicacionSeleccionada?.almacen) {
      cargarUbicaciones(modoUbicacion.ubicacionSeleccionada.almacen, setUbicacionesOrigen);
    }
  }, [modoUbicacion.ubicacionSeleccionada?.almacen]);

  useEffect(() => {
    // Cargar ubicaciones de destino
    const destinoAlmacen = activeTab === 'articulo' 
      ? modoArticulo.form.destinoAlmacen 
      : modoUbicacion.form.destinoAlmacen;
    
    if (!destinoAlmacen) {
      setUbicacionesDestino([]);
      return;
    }
    
    let excluirUbicacion = null;
    if (activeTab === 'articulo' && modoArticulo.form.origenAlmacen === destinoAlmacen) {
      excluirUbicacion = modoArticulo.form.origenUbicacion;
    } else if (modoUbicacion.ubicacionSeleccionada?.almacen === destinoAlmacen) {
      excluirUbicacion = modoUbicacion.ubicacionSeleccionada.ubicacion;
    }
    
    cargarUbicaciones(destinoAlmacen, setUbicacionesDestino, excluirUbicacion);
  }, [
    activeTab,
    modoArticulo.form.destinoAlmacen,
    modoArticulo.form.origenAlmacen,
    modoArticulo.form.origenUbicacion,
    modoUbicacion.form.destinoAlmacen,
    modoUbicacion.ubicacionSeleccionada
  ]);

  useEffect(() => {
    // Resetear estados al cambiar pestaña
    setUbicacionesOrigen([]);
    setUbicacionesDestino([]);
  }, [activeTab]);

  // ======================= FUNCIONES ======================= //
  const cargarStockArticulo = async (codigoArticulo) => {
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/stock/por-articulo?codigoArticulo=${codigoArticulo}`,
        { headers }
      );
      
      setModoArticulo(prev => ({
        ...prev,
        stockDisponible: response.data,
        form: {
          ...prev.form,
          origenAlmacen: response.data[0]?.CodigoAlmacen || '',
          origenUbicacion: response.data[0]?.Ubicacion || ''
        },
        detalles: null
      }));
    } catch (error) {
      console.error('Error cargando stock:', error);
    }
  };

  const cargarUbicaciones = async (codigoAlmacen, setter, excluirUbicacion = null) => {
    setCargandoUbicaciones(true);
    try {
      const headers = getAuthHeader();
      const params = { codigoAlmacen, ...(excluirUbicacion && { excluirUbicacion }) };
      const response = await axios.get('http://localhost:3000/ubicaciones', { headers, params });
      setter(response.data);
    } catch (error) {
      console.error('Error cargando ubicaciones:', error);
      setter([]);
    } finally {
      setCargandoUbicaciones(false);
    }
  };

  const cargarArticulosPorUbicacion = async (codigoAlmacen, ubicacion) => {
    setCargandoUbicaciones(true);
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/stock/por-ubicacion?codigoAlmacen=${codigoAlmacen}&ubicacion=${ubicacion}`,
        { headers }
      );
      setModoUbicacion(prev => ({ 
        ...prev, 
        articulosUbicacion: response.data,
        detalles: null
      }));
    } catch (error) {
      console.error('Error cargando artículos:', error);
    } finally {
      setCargandoUbicaciones(false);
    }
  };

  const cargarHistorial = async () => {
    setCargandoHistorial(true);
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/historial-traspasos?codigoEmpresa=${user.CodigoEmpresa}&usuario=${user.UsuarioLogicNet}`,
        { headers }
      );
      setHistorial(response.data);
    } catch (error) {
      console.error('Error cargando historial:', error);
    } finally {
      setCargandoHistorial(false);
    }
  };

  const formatFecha = (fechaStr) => {
    if (!fechaStr) return 'Fecha no disponible';
    try {
      const fecha = new Date(fechaStr);
      return isNaN(fecha) ? fechaStr : fecha.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return fechaStr;
    }
  };

  const formatCantidad = (valor) => {
    const cantidad = parseFloat(valor);
    if (isNaN(cantidad)) return "0";
    const rounded = Math.round(cantidad * 100) / 100;
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/\.?0+$/, '');
  };

  const seleccionarArticuloModoArticulo = (articulo) => {
    setModoArticulo(prev => ({
      ...prev,
      articuloSeleccionado: articulo,
      terminoBusqueda: articulo.DescripcionArticulo,
      resultadosBusqueda: [],
      errorBusqueda: ''
    }));
    cargarStockArticulo(articulo.CodigoArticulo);
  };

  const seleccionarArticuloModoUbicacion = (articulo) => {
    setModoUbicacion(prev => ({ ...prev, articuloSeleccionado: articulo }));
  };

  const handleChangeModoArticulo = (e) => {
    const { name, value } = e.target;
    setModoArticulo(prev => ({ ...prev, form: { ...prev.form, [name]: value } }));
  };

  const handleChangeModoUbicacion = (e) => {
    const { name, value } = e.target;
    setModoUbicacion(prev => ({ ...prev, form: { ...prev.form, [name]: value } }));
  };

  const validarFormulario = () => {
    if (activeTab === 'articulo') {
      const { articuloSeleccionado, form } = modoArticulo;
      if (!articuloSeleccionado) return 'Seleccione un artículo';
      if (!form.origenAlmacen) return 'Seleccione almacén de origen';
      if (!form.origenUbicacion) return 'Seleccione ubicación de origen';
      if (!form.destinoAlmacen) return 'Seleccione almacén de destino';
      if (!form.destinoUbicacion) return 'Seleccione ubicación de destino';
      if (!form.cantidad || form.cantidad <= 0) return 'Cantidad inválida';
      
      if (form.origenAlmacen === form.destinoAlmacen && 
          form.origenUbicacion === form.destinoUbicacion) {
        return 'No puede seleccionar la misma ubicación';
      }
      
      const stockEnOrigen = modoArticulo.stockDisponible.find(
        s => s.CodigoAlmacen === form.origenAlmacen && s.Ubicacion === form.origenUbicacion
      )?.Cantidad || 0;
      
      if (parseFloat(form.cantidad) > stockEnOrigen) {
        return `La cantidad supera el stock disponible (${stockEnOrigen})`;
      }
      
      return null;
    } else {
      const { articuloSeleccionado, form, ubicacionSeleccionada } = modoUbicacion;
      if (!ubicacionSeleccionada) return 'Seleccione ubicación de origen';
      if (!articuloSeleccionado) return 'Seleccione un artículo';
      if (!form.destinoAlmacen) return 'Seleccione almacén de destino';
      if (!form.destinoUbicacion) return 'Seleccione ubicación de destino';
      if (!form.cantidad || form.cantidad <= 0) return 'Cantidad inválida';
      
      if (ubicacionSeleccionada.almacen === form.destinoAlmacen && 
          ubicacionSeleccionada.ubicacion === form.destinoUbicacion) {
        return 'No puede seleccionar la misma ubicación';
      }
      
      if (parseFloat(form.cantidad) > articuloSeleccionado.Cantidad) {
        return `La cantidad supera el stock disponible (${articuloSeleccionado.Cantidad})`;
      }
      
      return null;
    }
  };

  const prepararTraspaso = () => {
    const error = validarFormulario();
    if (error) return alert(error);
    setActiveSection('verificacion');
  };

  const confirmarTraspaso = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeader();
      const body = activeTab === 'articulo' 
        ? {
            codigoEmpresa: user.CodigoEmpresa,
            articulo: modoArticulo.articuloSeleccionado.CodigoArticulo,
            origenAlmacen: modoArticulo.form.origenAlmacen,
            origenUbicacion: modoArticulo.form.origenUbicacion,
            destinoAlmacen: modoArticulo.form.destinoAlmacen,
            destinoUbicacion: modoArticulo.form.destinoUbicacion,
            cantidad: parseFloat(modoArticulo.form.cantidad),
            usuario: user.UsuarioLogicNet
          }
        : {
            codigoEmpresa: user.CodigoEmpresa,
            articulo: modoUbicacion.articuloSeleccionado.CodigoArticulo,
            origenAlmacen: modoUbicacion.ubicacionSeleccionada.almacen,
            origenUbicacion: modoUbicacion.ubicacionSeleccionada.ubicacion,
            destinoAlmacen: modoUbicacion.form.destinoAlmacen,
            destinoUbicacion: modoUbicacion.form.destinoUbicacion,
            cantidad: parseFloat(modoUbicacion.form.cantidad),
            usuario: user.UsuarioLogicNet
          };
      
      await axios.post('http://localhost:3000/traspaso', body, { headers });
      alert('Traspaso realizado con éxito');
      
      // Resetear estados
      if (activeTab === 'articulo') {
        setModoArticulo({
          terminoBusqueda: '',
          resultadosBusqueda: [],
          articuloSeleccionado: null,
          stockDisponible: [],
          form: { origenAlmacen: '', origenUbicacion: '', destinoAlmacen: '', destinoUbicacion: '', cantidad: '' },
          buscando: false,
          errorBusqueda: ''
        });
      } else {
        setModoUbicacion({
          ubicacionSeleccionada: null,
          articulosUbicacion: [],
          articuloSeleccionado: null,
          form: { destinoAlmacen: '', destinoUbicacion: '', cantidad: '' }
        });
      }
      
      setUbicacionesDestino([]);
      setUbicacionesOrigen([]);
      cargarHistorial();
      setActiveSection('movimientos');
    } catch (error) {
      console.error('Error en traspaso:', error);
      alert('Error: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setLoading(false);
    }
  };

  const cargarDetalles = async (movPosicionLinea) => {
    if (!movPosicionLinea) return;
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/stock/detalles?movPosicionLinea=${movPosicionLinea}`,
        { headers }
      );
      activeTab === 'articulo' 
        ? setModoArticulo(prev => ({ ...prev, detalles: response.data }))
        : setModoUbicacion(prev => ({ ...prev, detalles: response.data }));
    } catch (error) {
      console.error('Error cargando detalles:', error);
    }
  };

  // Helpers
  const stockEnOrigenModoArticulo = modoArticulo.stockDisponible.find(
    item => item.CodigoAlmacen === modoArticulo.form.origenAlmacen && 
            item.Ubicacion === modoArticulo.form.origenUbicacion
  )?.Cantidad || 0;

  const getNombreAlmacen = (codigo) => {
    const almacen = almacenes.find(a => a.CodigoAlmacen === codigo);
    return almacen ? `${almacen.Almacen} (${codigo})` : codigo;
  };

  const getDescripcionUbicacion = (codigoAlmacen, ubicacion) => {
    const ubic = [...ubicacionesOrigen, ...ubicacionesDestino].find(
      u => u.CodigoAlmacen === codigoAlmacen && u.Ubicacion === ubicacion
    );
    return ubic ? (ubic.DescripcionUbicacion || ubicacion) : ubicacion;
  };

  // Componente: Modal de detalles
  const DetallesModal = () => {
    const detalles = activeTab === 'articulo' 
      ? modoArticulo.detalles 
      : modoUbicacion.detalles;
    
    if (!detalles) return null;

    return (
      <div className="modal-detalles">
        <div className="modal-contenido">
          <button className="cerrar-modal" onClick={() => {
            activeTab === 'articulo' 
              ? setModoArticulo(prev => ({ ...prev, detalles: null }))
              : setModoUbicacion(prev => ({ ...prev, detalles: null }));
          }}>&times;</button>
          
          <h3>Detalles de Variantes</h3>
          
          <div className="detalles-container">
            {detalles.length === 0 ? (
              <p>No hay detalles de variantes</p>
            ) : (
              detalles.map((detalle, index) => (
                <div key={index} className="variante-grupo">
                  <div className="variante-header">
                    <span><strong>Color:</strong> {detalle.color.nombre}</span>
                    <span><strong>Grupo Talla:</strong> {detalle.grupoTalla.nombre}</span>
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

  // ======================= RENDERIZADO ======================= //
  return (
    <div className="traspasos-container">
      <h1>Traspaso entre Ubicaciones</h1>
      
      {/* Selector de secciones */}
      <div className="section-selector">
        <button 
          className={`section-btn ${activeSection === 'movimientos' ? 'active' : ''}`}
          onClick={() => setActiveSection('movimientos')}
          aria-pressed={activeSection === 'movimientos'}
        >
          Movimientos
        </button>
        
        <button 
          className={`section-btn ${activeSection === 'verificacion' ? 'active' : ''}`}
          onClick={() => {
            if ((activeTab === 'articulo' && modoArticulo.articuloSeleccionado) || 
                (activeTab === 'ubicacion' && modoUbicacion.articuloSeleccionado)) {
              setActiveSection('verificacion');
            } else {
              alert('Primero debe preparar un traspaso');
            }
          }}
          aria-pressed={activeSection === 'verificacion'}
        >
          Verificación
        </button>
        
        <button 
          className={`section-btn ${activeSection === 'historial' ? 'active' : ''}`}
          onClick={() => {
            setActiveSection('historial');
            cargarHistorial();
          }}
          aria-pressed={activeSection === 'historial'}
        >
          Historial
        </button>
      </div>
      
      {/* Sección: Movimientos */}
      {activeSection === 'movimientos' && (
        <div className="movimientos-section">
          <div className="tabs-container" role="tablist">
            <button 
              className={`tab-btn ${activeTab === 'articulo' ? 'active' : ''}`}
              onClick={() => setActiveTab('articulo')}
              role="tab"
              aria-selected={activeTab === 'articulo'}
            >
              Por Artículo
            </button>
            
            <button 
              className={`tab-btn ${activeTab === 'ubicacion' ? 'active' : ''}`}
              onClick={() => setActiveTab('ubicacion')}
              role="tab"
              aria-selected={activeTab === 'ubicacion'}
            >
              Por Ubicación
            </button>
          </div>
          
          {/* Modo Artículo */}
          {activeTab === 'articulo' ? (
            <div className="modo-articulo" role="tabpanel">
              <div className="form-section">
                <h2>Artículo</h2>
                <div className="form-group">
                  <label htmlFor="buscar-articulo">Buscar artículo:</label>
                  <div className="search-container">
                    <input
                      id="buscar-articulo"
                      type="text"
                      value={modoArticulo.terminoBusqueda}
                      onChange={(e) => setModoArticulo(prev => ({ ...prev, terminoBusqueda: e.target.value }))}
                      placeholder="Código o descripción..."
                      className="search-input"
                    />
                    {modoArticulo.buscando && <div className="search-loading">Buscando...</div>}
                  </div>
                  
                  {modoArticulo.errorBusqueda && 
                    <div className="error-message" role="alert">{modoArticulo.errorBusqueda}</div>
                  }
                  
                  {modoArticulo.resultadosBusqueda.length > 0 && (
                    <div className="resultados-busqueda" role="listbox">
                      {modoArticulo.resultadosBusqueda.map((articulo, index) => (
                        <div 
                          key={`${articulo.CodigoArticulo}-${index}`}
                          className="resultado-item"
                          onClick={() => seleccionarArticuloModoArticulo(articulo)}
                          role="option"
                          tabIndex="0"
                        >
                          <div className="articulo-codigo">{articulo.CodigoArticulo}</div>
                          <div className="articulo-descripcion">{articulo.DescripcionArticulo}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {modoArticulo.articuloSeleccionado && (
                    <div className="articulo-seleccionado" aria-live="polite">
                      <span>Artículo seleccionado: </span>
                      {modoArticulo.articuloSeleccionado.DescripcionArticulo} 
                      ({modoArticulo.articuloSeleccionado.CodigoArticulo})
                    </div>
                  )}
                </div>
              </div>

              {modoArticulo.articuloSeleccionado && (
                <>
                  <div className="form-section">
                    <h2>Origen</h2>
                    <div className="form-group">
                      <label htmlFor="origen-almacen">Almacén:</label>
                      <select 
                        id="origen-almacen"
                        name="origenAlmacen" 
                        value={modoArticulo.form.origenAlmacen} 
                        onChange={handleChangeModoArticulo}
                        required
                      >
                        <option value="">Seleccionar almacén</option>
                        {Array.from(new Set(modoArticulo.stockDisponible.map(item => item.CodigoAlmacen)))
                          .map((codigo, index) => (
                            <option key={`${codigo}-${index}`} value={codigo}>
                              {getNombreAlmacen(codigo)}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="origen-ubicacion">Ubicación:</label>
                      <select 
                        id="origen-ubicacion"
                        name="origenUbicacion" 
                        value={modoArticulo.form.origenUbicacion} 
                        onChange={handleChangeModoArticulo}
                        required
                        disabled={!modoArticulo.form.origenAlmacen}
                      >
                        <option value="">{modoArticulo.form.origenAlmacen ? 'Seleccionar ubicación' : 'Seleccione almacén primero'}</option>
                        {modoArticulo.form.origenAlmacen && modoArticulo.stockDisponible
                          .filter(item => item.CodigoAlmacen === modoArticulo.form.origenAlmacen)
                          .map((item, index) => (
                            <option key={`${item.Ubicacion}-${index}`} value={item.Ubicacion}>
                              {getDescripcionUbicacion(item.CodigoAlmacen, item.Ubicacion)} 
                              (Disponible: {item.Cantidad})
                              {item.MovPosicionLinea && (
                                <button 
                                  className="btn-detalles"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cargarDetalles(item.MovPosicionLinea);
                                  }}
                                >
                                  ...
                                </button>
                              )}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-section">
                    <h2>Destino</h2>
                    <div className="form-group">
                      <label htmlFor="destino-almacen">Almacén:</label>
                      <select 
                        id="destino-almacen"
                        name="destinoAlmacen" 
                        value={modoArticulo.form.destinoAlmacen} 
                        onChange={handleChangeModoArticulo}
                        required
                      >
                        <option value="">Seleccionar almacén</option>
                        {almacenes.map((almacen, index) => (
                          <option key={`${almacen.CodigoAlmacen}-${index}`} value={almacen.CodigoAlmacen}>
                            {almacen.Almacen} ({almacen.CodigoAlmacen})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="destino-ubicacion">Ubicación:</label>
                      <select 
                        id="destino-ubicacion"
                        name="destinoUbicacion" 
                        value={modoArticulo.form.destinoUbicacion} 
                        onChange={handleChangeModoArticulo}
                        required
                        disabled={!modoArticulo.form.destinoAlmacen || cargandoUbicaciones}
                      >
                        <option value="">
                          {cargandoUbicaciones 
                            ? 'Cargando ubicaciones...' 
                            : (modoArticulo.form.destinoAlmacen ? 'Seleccionar ubicación' : 'Seleccione almacén primero')}
                        </option>
                        {ubicacionesDestino.map((ubicacion, index) => (
                          <option key={`${ubicacion.Ubicacion}-${index}`} value={ubicacion.Ubicacion}>
                            {ubicacion.DescripcionUbicacion || ubicacion.Ubicacion}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-section">
                    <h2>Cantidad</h2>
                    <div className="form-group">
                      <label htmlFor="cantidad">Cantidad a traspasar:</label>
                      <input 
                        id="cantidad"
                        type="number" 
                        name="cantidad" 
                        value={modoArticulo.form.cantidad} 
                        onChange={handleChangeModoArticulo}
                        required
                        min="0.01"
                        step="any"
                        max={stockEnOrigenModoArticulo}
                        disabled={!modoArticulo.form.origenUbicacion}
                      />
                      <div className={`stock-info ${parseFloat(modoArticulo.form.cantidad) > stockEnOrigenModoArticulo ? 'stock-warning' : ''}`}>
                        {modoArticulo.form.origenUbicacion && `Stock disponible: ${stockEnOrigenModoArticulo}`}
                      </div>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button 
                      type="button" 
                      className="btn-cancelar"
                      onClick={() => {
                        setModoArticulo({
                          terminoBusqueda: '',
                          resultadosBusqueda: [],
                          articuloSeleccionado: null,
                          stockDisponible: [],
                          form: {
                            origenAlmacen: '',
                            origenUbicacion: '',
                            destinoAlmacen: '',
                            destinoUbicacion: '',
                            cantidad: ''
                          },
                          buscando: false,
                          errorBusqueda: ''
                        });
                      }}
                    >
                      Limpiar
                    </button>
                    
                    <button 
                      type="button" 
                      className="btn-enviar"
                      onClick={prepararTraspaso}
                      disabled={loading}
                    >
                      {loading ? 'Procesando...' : 'Verificar Traspaso'}
                    </button>
                  </div>
                </>
              )}
              <DetallesModal />
            </div>
          ) : (
            // Modo Ubicación
            <div className="modo-ubicacion" role="tabpanel">
              <div className="form-section">
                <h2>Ubicación de Origen</h2>
                <div className="form-group">
                  <label htmlFor="ubicacion-almacen">Almacén:</label>
                  <select 
                    id="ubicacion-almacen"
                    value={modoUbicacion.ubicacionSeleccionada?.almacen || ''}
                    onChange={(e) => setModoUbicacion(prev => ({
                      ...prev,
                      ubicacionSeleccionada: { ...prev.ubicacionSeleccionada, almacen: e.target.value }
                    }))}
                  >
                    <option value="">Seleccionar almacén</option>
                    {almacenes.map(almacen => (
                      <option key={almacen.CodigoAlmacen} value={almacen.CodigoAlmacen}>
                        {almacen.Almacen} ({almacen.CodigoAlmacen})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="ubicacion-ubicacion">Ubicación:</label>
                  <select 
                    id="ubicacion-ubicacion"
                    value={modoUbicacion.ubicacionSeleccionada?.ubicacion || ''}
                    onChange={(e) => setModoUbicacion(prev => ({
                      ...prev,
                      ubicacionSeleccionada: { ...prev.ubicacionSeleccionada, ubicacion: e.target.value }
                    }))}
                    disabled={!modoUbicacion.ubicacionSeleccionada?.almacen}
                  >
                    <option value="">Seleccionar ubicación</option>
                    {modoUbicacion.ubicacionSeleccionada?.almacen && 
                      ubicacionesOrigen.map(ubicacion => (
                        <option key={ubicacion.Ubicacion} value={ubicacion.Ubicacion}>
                          {ubicacion.DescripcionUbicacion || ubicacion.Ubicacion}
                        </option>
                      ))}
                  </select>
                </div>

                <button 
                  className="btn-cargar"
                  onClick={() => {
                    if (modoUbicacion.ubicacionSeleccionada?.almacen && modoUbicacion.ubicacionSeleccionada?.ubicacion) {
                      cargarArticulosPorUbicacion(
                        modoUbicacion.ubicacionSeleccionada.almacen, 
                        modoUbicacion.ubicacionSeleccionada.ubicacion
                      );
                    }
                  }}
                  disabled={!modoUbicacion.ubicacionSeleccionada?.almacen || !modoUbicacion.ubicacionSeleccionada?.ubicacion}
                >
                  Cargar Artículos
                </button>
              </div>

              {modoUbicacion.articulosUbicacion.length > 0 && (
                <div className="form-section">
                  <h2>Artículos Disponibles</h2>
                  <div className="articulos-ubicacion">
                    {modoUbicacion.articulosUbicacion.map((articulo, index) => (
                      <div 
                        key={`${articulo.CodigoArticulo}-${index}`}
                        className={`articulo-item ${modoUbicacion.articuloSeleccionado?.CodigoArticulo === articulo.CodigoArticulo ? 'seleccionado' : ''}`}
                        onClick={() => seleccionarArticuloModoUbicacion(articulo)}
                        role="button"
                        tabIndex="0"
                      >
                        <div className="articulo-codigo">{articulo.CodigoArticulo}</div>
                        <div className="articulo-descripcion">{articulo.DescripcionArticulo}</div>
                        <div className="articulo-cantidad">Stock: {articulo.Cantidad}</div>
                        {articulo.MovPosicionLinea && (
                          <button 
                            className="btn-detalles"
                            onClick={(e) => {
                              e.stopPropagation();
                              cargarDetalles(articulo.MovPosicionLinea);
                            }}
                          >
                            ...
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modoUbicacion.articuloSeleccionado && (
                <div className="form-section">
                  <h2>Detalles del Traspaso</h2>
                  <div className="articulo-seleccionado">
                    <span>Artículo seleccionado: </span>
                    {modoUbicacion.articuloSeleccionado.DescripcionArticulo} 
                    ({modoUbicacion.articuloSeleccionado.CodigoArticulo})
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="destino-almacen-ubic">Almacén de destino:</label>
                    <select 
                      id="destino-almacen-ubic"
                      name="destinoAlmacen" 
                      value={modoUbicacion.form.destinoAlmacen} 
                      onChange={handleChangeModoUbicacion}
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

                  <div className="form-group">
                    <label htmlFor="destino-ubicacion-ubic">Ubicación de destino:</label>
                    <select 
                      id="destino-ubicacion-ubic"
                      name="destinoUbicacion" 
                      value={modoUbicacion.form.destinoUbicacion} 
                      onChange={handleChangeModoUbicacion}
                      required
                      disabled={!modoUbicacion.form.destinoAlmacen || cargandoUbicaciones}
                    >
                      <option value="">
                        {cargandoUbicaciones 
                          ? 'Cargando ubicaciones...' 
                          : (modoUbicacion.form.destinoAlmacen ? 'Seleccionar ubicación' : 'Seleccione almacén primero')}
                      </option>
                      {ubicacionesDestino.map(ubicacion => (
                        <option key={ubicacion.Ubicacion} value={ubicacion.Ubicacion}>
                          {ubicacion.DescripcionUbicacion || ubicacion.Ubicacion}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="cantidad-ubic">Cantidad a traspasar:</label>
                    <input 
                      id="cantidad-ubic"
                      type="number" 
                      name="cantidad" 
                      value={modoUbicacion.form.cantidad} 
                      onChange={handleChangeModoUbicacion}
                      required
                      min="0.01"
                      step="any"
                      max={modoUbicacion.articuloSeleccionado.Cantidad}
                    />
                    <div className="stock-info">
                      Stock disponible: {modoUbicacion.articuloSeleccionado.Cantidad}
                    </div>
                  </div>

                  <div className="form-actions">
                    <button 
                      type="button" 
                      className="btn-cancelar"
                      onClick={() => {
                        setModoUbicacion(prev => ({
                          ...prev,
                          articuloSeleccionado: null,
                          form: {
                            destinoAlmacen: '',
                            destinoUbicacion: '',
                            cantidad: ''
                          }
                        }));
                      }}
                    >
                      Cancelar
                    </button>
                    
                    <button 
                      type="button" 
                      className="btn-enviar"
                      onClick={prepararTraspaso}
                      disabled={loading}
                    >
                      {loading ? 'Procesando...' : 'Verificar Traspaso'}
                    </button>
                  </div>
                </div>
              )}
              <DetallesModal />
            </div>
          )}
        </div>
      )}
      
      {/* Sección: Verificación */}
      {activeSection === 'verificacion' && (
        <div className="verificacion-section">
          <h2>Verificación de Traspaso</h2>
          
          {(activeTab === 'articulo' && modoArticulo.articuloSeleccionado) || 
          (activeTab === 'ubicacion' && modoUbicacion.articuloSeleccionado) ? (
            <div className="detalle-traspaso">
              <div className="detalle-item">
                <span>Artículo:</span>
                <span>
                  {activeTab === 'articulo' 
                    ? `${modoArticulo.articuloSeleccionado.DescripcionArticulo} (${modoArticulo.articuloSeleccionado.CodigoArticulo})`
                    : `${modoUbicacion.articuloSeleccionado.DescripcionArticulo} (${modoUbicacion.articuloSeleccionado.CodigoArticulo})`}
                </span>
              </div>
              
              <div className="detalle-item">
                <span>Origen:</span>
                <span>
                  {activeTab === 'articulo' 
                    ? `${getNombreAlmacen(modoArticulo.form.origenAlmacen)} - ${getDescripcionUbicacion(modoArticulo.form.origenAlmacen, modoArticulo.form.origenUbicacion)}`
                    : `${getNombreAlmacen(modoUbicacion.ubicacionSeleccionada.almacen)} - ${getDescripcionUbicacion(modoUbicacion.ubicacionSeleccionada.almacen, modoUbicacion.ubicacionSeleccionada.ubicacion)}`}
                </span>
              </div>
              
              <div className="detalle-item">
                <span>Destino:</span>
                <span>
                  {activeTab === 'articulo' 
                    ? `${getNombreAlmacen(modoArticulo.form.destinoAlmacen)} - ${getDescripcionUbicacion(modoArticulo.form.destinoAlmacen, modoArticulo.form.destinoUbicacion)}`
                    : `${getNombreAlmacen(modoUbicacion.form.destinoAlmacen)} - ${getDescripcionUbicacion(modoUbicacion.form.destinoAlmacen, modoUbicacion.form.destinoUbicacion)}`}
                </span>
              </div>
              
              <div className="detalle-item">
                <span>Cantidad:</span>
                <span>
                  {activeTab === 'articulo' 
                    ? modoArticulo.form.cantidad
                    : modoUbicacion.form.cantidad}
                </span>
              </div>
              
              <div className="acciones-verificacion">
                <button className="btn-editar" onClick={() => setActiveSection('movimientos')}>
                  Editar
                </button>
                
                <button 
                  className="btn-confirmar" 
                  onClick={confirmarTraspaso}
                  disabled={loading}
                >
                  {loading ? 'Confirmando...' : 'Confirmar Traspaso'}
                </button>
                
                <button className="btn-cancelar" onClick={() => setActiveSection('movimientos')}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="sin-traspaso">
              No hay traspaso pendiente de verificación
            </div>
          )}
        </div>
      )}
      
      {/* Sección: Historial */}
      {activeSection === 'historial' && (
        <div className="historial-section">
          <h2>Historial de Traspasos</h2>
          
          {cargandoHistorial ? (
            <div className="cargando-historial">
              Cargando historial...
            </div>
          ) : historial.length > 0 ? (
            <div className="lista-historial">
              {historial.map((item, index) => (
                <div key={`${item.Fecha}-${index}`} className="historial-item">
                  <div className="historial-header">
                    <div className="historial-fecha">{formatFecha(item.Fecha)}</div>
                    <div className={`historial-tipo ${item.TipoMovimiento === 'Salida' ? 'salida' : 'entrada'}`}>
                      {item.TipoMovimiento}
                    </div>
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
                      {item.NombreDestinoAlmacen} - {item.DestinoUbicacion}
                    </div>
                  </div>
                  
                  <div className="historial-info">
                    <div className="historial-cantidad">
                      <span>Cantidad:</span> {formatCantidad(item.Cantidad)}
                    </div>
                    <div className="historial-usuario">
                      <span>Usuario:</span> 
                      {item.Comentario?.split(': ')[1] || 'Desconocido'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="sin-historial">
              No hay traspasos registrados
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TraspasosPage;