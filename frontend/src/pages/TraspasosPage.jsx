import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import '../styles/TraspasosPage.css';

const TraspasosPage = () => {
  const [activeSection, setActiveSection] = useState('movimientos');
  const [activeTab, setActiveTab] = useState('articulo');
  const [almacenes, setAlmacenes] = useState([]);
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState(null);
  const [stockDisponible, setStockDisponible] = useState([]);
  const [ubicacionesOrigen, setUbicacionesOrigen] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [form, setForm] = useState({
    origenAlmacen: '',
    origenUbicacion: '',
    destinoAlmacen: '',
    destinoUbicacion: '',
    cantidad: ''
  });
  const [loading, setLoading] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [cargandoUbicaciones, setCargandoUbicaciones] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [articulosUbicacion, setArticulosUbicacion] = useState([]);
  const [ubicacionSeleccionada, setUbicacionSeleccionada] = useState(null);
  const user = JSON.parse(localStorage.getItem('user'));
  const timerRef = useRef(null);

  // Cargar almacenes al inicio
  useEffect(() => {
    const cargarDatosIniciales = async () => {
      try {
        const headers = getAuthHeader();
        const almacenesResponse = await axios.get(
          'http://localhost:3000/almacenes',
          { headers }
        );
        setAlmacenes(almacenesResponse.data);
      } catch (error) {
        console.error('Error cargando datos iniciales:', error);
      }
    };
    cargarDatosIniciales();
  }, []);

  // Buscar artículos con debounce
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    if (!terminoBusqueda || terminoBusqueda.trim() === '') {
      setResultadosBusqueda([]);
      setErrorBusqueda('');
      return;
    }
    
    setBuscando(true);
    setErrorBusqueda('');
    
    timerRef.current = setTimeout(async () => {
      try {
        const headers = getAuthHeader();
        const response = await axios.get(
          `http://localhost:3000/buscar-articulos?termino=${encodeURIComponent(terminoBusqueda)}`,
          { headers }
        );
        setResultadosBusqueda(response.data);
        setErrorBusqueda(response.data.length === 0 ? 'No se encontraron artículos' : '');
      } catch (error) {
        console.error('Error buscando artículos:', error);
        setErrorBusqueda('Error al buscar artículos. Intente nuevamente.');
        setResultadosBusqueda([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [terminoBusqueda]);

  // Cargar stock del artículo
  const cargarStockArticulo = async (codigoArticulo) => {
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/stock/por-articulo?codigoArticulo=${codigoArticulo}`,
        { headers }
      );
      setStockDisponible(response.data);
      
      if (response.data.length > 0) {
        const primerStock = response.data[0];
        setForm(prev => ({
          ...prev,
          origenAlmacen: primerStock.CodigoAlmacen,
          origenUbicacion: primerStock.Ubicacion
        }));
      }
    } catch (error) {
      console.error('Error cargando stock del artículo:', error);
      setStockDisponible([]);
    }
  };

  // Cargar ubicaciones
  const cargarUbicaciones = async (codigoAlmacen, setter, excluirUbicacion = null) => {
    setCargandoUbicaciones(true);
    try {
      const headers = getAuthHeader();
      const params = {
        codigoAlmacen,
        ...(excluirUbicacion && { excluirUbicacion })
      };
      const response = await axios.get(
        'http://localhost:3000/ubicaciones',
        { headers, params }
      );
      setter(response.data);
    } catch (error) {
      console.error('Error cargando ubicaciones:', error);
      setter([]);
    } finally {
      setCargandoUbicaciones(false);
    }
  };

  // Efecto para ubicaciones de origen
  useEffect(() => {
    if (ubicacionSeleccionada?.almacen) {
      cargarUbicaciones(ubicacionSeleccionada.almacen, setUbicacionesOrigen);
    }
  }, [ubicacionSeleccionada?.almacen]);

  // Efecto para ubicaciones de destino - CORREGIDO
  useEffect(() => {
    if (form.destinoAlmacen) {
      const excluirUbicacion = form.destinoAlmacen === form.origenAlmacen ? form.origenUbicacion : null;
      cargarUbicaciones(form.destinoAlmacen, setUbicacionesDestino, excluirUbicacion);
    } else {
      setUbicacionesDestino([]);
      setForm(prev => ({ ...prev, destinoUbicacion: '' }));
    }
  }, [form.destinoAlmacen, form.origenAlmacen, form.origenUbicacion]);

  // Cargar artículos por ubicación
  const cargarArticulosPorUbicacion = async (codigoAlmacen, ubicacion) => {
    try {
      setCargandoUbicaciones(true);
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/stock/por-ubicacion?codigoAlmacen=${codigoAlmacen}&ubicacion=${ubicacion}`,
        { headers }
      );
      setArticulosUbicacion(response.data);
    } catch (error) {
      console.error('Error cargando artículos por ubicación:', error);
      setArticulosUbicacion([]);
    } finally {
      setCargandoUbicaciones(false);
    }
  };

  // Cargar historial de traspasos
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
      setHistorial([]);
    } finally {
      setCargandoHistorial(false);
    }
  };

  // Formatear fecha
  const formatFecha = (fechaStr) => {
    if (!fechaStr) return 'Fecha no disponible';
    try {
      const fecha = new Date(fechaStr);
      if (isNaN(fecha.getTime())) return fechaStr;
      return fecha.toLocaleString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formateando fecha:', error);
      return fechaStr;
    }
  };

  // Seleccionar artículo
  const seleccionarArticulo = (articulo) => {
    setArticuloSeleccionado(articulo);
    setTerminoBusqueda(articulo.DescripcionArticulo);
    setResultadosBusqueda([]);
    setErrorBusqueda('');
    cargarStockArticulo(articulo.CodigoArticulo);
  };

  // Seleccionar ubicación
  const seleccionarUbicacion = (almacen, ubicacion) => {
    setUbicacionSeleccionada({ almacen, ubicacion });
    setForm(prev => ({
      ...prev,
      origenAlmacen: almacen,
      origenUbicacion: ubicacion
    }));
    cargarArticulosPorUbicacion(almacen, ubicacion);
  };

  // Seleccionar artículo en modo ubicación
  const seleccionarArticuloUbicacion = async (articulo) => {
    setArticuloSeleccionado(articulo);
    await cargarStockArticulo(articulo.CodigoArticulo);
  };

  // Manejar cambios en el formulario
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'destinoAlmacen') {
      setForm(prev => ({ 
        ...prev, 
        [name]: value,
        destinoUbicacion: ''
      }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  // Validar formulario
  const validarFormulario = () => {
    if (!articuloSeleccionado) return 'Seleccione un artículo';
    if (!form.origenAlmacen) return 'Seleccione almacén de origen';
    if (!form.origenUbicacion) return 'Seleccione ubicación de origen';
    if (!form.destinoAlmacen) return 'Seleccione almacén de destino';
    if (!form.destinoUbicacion) return 'Seleccione ubicación de destino';
    if (!form.cantidad || form.cantidad <= 0) return 'Cantidad inválida';
    
    if (form.origenAlmacen === form.destinoAlmacen && 
        form.origenUbicacion === form.destinoUbicacion) {
      return 'No puede seleccionar la misma ubicación de origen y destino';
    }
    
    const stockEnOrigen = stockDisponible.find(
      s => s.CodigoAlmacen === form.origenAlmacen && 
            s.Ubicacion === form.origenUbicacion
    )?.Cantidad || 0;
    
    if (parseFloat(form.cantidad) > stockEnOrigen) {
      return `La cantidad supera el stock disponible (${stockEnOrigen})`;
    }
    
    return null;
  };

  // Preparar traspaso
  const prepararTraspaso = () => {
    const error = validarFormulario();
    if (error) {
      alert(error);
      return;
    }
    setActiveSection('verificacion');
  };

  // Confirmar traspaso
  const confirmarTraspaso = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeader();
      await axios.post(
        'http://localhost:3000/traspaso',
        {
          codigoEmpresa: user.CodigoEmpresa,
          articulo: articuloSeleccionado.CodigoArticulo,
          origenAlmacen: form.origenAlmacen,
          origenUbicacion: form.origenUbicacion,
          destinoAlmacen: form.destinoAlmacen,
          destinoUbicacion: form.destinoUbicacion,
          cantidad: parseFloat(form.cantidad),
          usuario: user.UsuarioLogicNet
        },
        { headers }
      );
      
      alert('Traspaso realizado con éxito');
      setArticuloSeleccionado(null);
      setTerminoBusqueda('');
      setStockDisponible([]);
      setForm({
        origenAlmacen: '',
        origenUbicacion: '',
        destinoAlmacen: '',
        destinoUbicacion: '',
        cantidad: ''
      });
      setResultadosBusqueda([]);
      setUbicacionSeleccionada(null);
      setArticulosUbicacion([]);
      cargarHistorial();
      setActiveSection('movimientos');
    } catch (error) {
      console.error('Error realizando traspaso:', error);
      alert('Error: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Obtener stock disponible
  const stockEnOrigen = stockDisponible.find(
    item => item.CodigoAlmacen === form.origenAlmacen && 
            item.Ubicacion === form.origenUbicacion
  )?.Cantidad || 0;

  // Obtener nombre del almacén
  const getNombreAlmacen = (codigo) => {
    const almacen = almacenes.find(a => a.CodigoAlmacen === codigo);
    return almacen ? almacen.Almacen : codigo;
  };

  // Obtener descripción de la ubicación
  const getDescripcionUbicacion = (codigoAlmacen, ubicacion) => {
    const ubic = [...ubicacionesOrigen, ...ubicacionesDestino].find(
      u => u.CodigoAlmacen === codigoAlmacen && u.Ubicacion === ubicacion
    );
    return ubic ? (ubic.DescripcionUbicacion || ubicacion) : ubicacion;
  };

  return (
    <div className="traspasos-container">
      <h1>Traspaso entre Ubicaciones</h1>
      
      <div className="section-selector">
        <button 
          className={`section-btn ${activeSection === 'movimientos' ? 'active' : ''}`}
          onClick={() => setActiveSection('movimientos')}
        >
          Movimientos
        </button>
        <button 
          className={`section-btn ${activeSection === 'verificacion' ? 'active' : ''}`}
          onClick={() => articuloSeleccionado ? setActiveSection('verificacion') : alert('Primero debe preparar un traspaso')}
        >
          Verificación
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
      
      {activeSection === 'movimientos' && (
        <div className="movimientos-section">
          <div className="tabs-container">
            <button 
              className={`tab-btn ${activeTab === 'articulo' ? 'active' : ''}`}
              onClick={() => setActiveTab('articulo')}
            >
              Por Artículo
            </button>
            <button 
              className={`tab-btn ${activeTab === 'ubicacion' ? 'active' : ''}`}
              onClick={() => setActiveTab('ubicacion')}
            >
              Por Ubicación
            </button>
          </div>
          
          {activeTab === 'articulo' ? (
            <div className="modo-articulo">
              <div className="form-section">
                <h2>Artículo</h2>
                <div className="form-group">
                  <label>Buscar artículo:</label>
                  <div className="search-container">
                    <input
                      type="text"
                      value={terminoBusqueda}
                      onChange={(e) => setTerminoBusqueda(e.target.value)}
                      placeholder="Código o descripción del artículo..."
                      className="search-input"
                    />
                    {buscando && <div className="search-loading">Buscando...</div>}
                  </div>
                  
                  {errorBusqueda && <div className="error-message">{errorBusqueda}</div>}
                  
                  {resultadosBusqueda.length > 0 && (
                    <div className="resultados-busqueda">
                      {resultadosBusqueda.map((articulo, index) => (
                        <div 
                          key={`${articulo.CodigoArticulo}-${index}`}
                          className="resultado-item"
                          onClick={() => seleccionarArticulo(articulo)}
                        >
                          <div className="articulo-codigo">{articulo.CodigoArticulo}</div>
                          <div className="articulo-descripcion">{articulo.DescripcionArticulo}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {articuloSeleccionado && (
                    <div className="articulo-seleccionado">
                      <span className="articulo-label">Artículo seleccionado:</span>
                      <span className="articulo-nombre">
                        {articuloSeleccionado.DescripcionArticulo} ({articuloSeleccionado.CodigoArticulo})
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {articuloSeleccionado && (
                <>
                  <div className="form-section">
                    <h2>Origen</h2>
                    <div className="form-group">
                      <label>Almacén:</label>
                      <select 
                        name="origenAlmacen" 
                        value={form.origenAlmacen} 
                        onChange={handleChange}
                        required
                      >
                        <option value="">Seleccionar almacén</option>
                        {Array.from(new Set(stockDisponible.map(item => item.CodigoAlmacen))).map((codigo, index) => (
                          <option key={`${codigo}-${index}`} value={codigo}>
                            {getNombreAlmacen(codigo)} ({codigo})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Ubicación:</label>
                      <select 
                        name="origenUbicacion" 
                        value={form.origenUbicacion} 
                        onChange={handleChange}
                        required
                        disabled={!form.origenAlmacen}
                      >
                        <option value="">{form.origenAlmacen ? 'Seleccionar ubicación' : 'Primero seleccione un almacén'}</option>
                        {form.origenAlmacen && stockDisponible
                          .filter(item => item.CodigoAlmacen === form.origenAlmacen)
                          .map((item, index) => (
                            <option key={`${item.Ubicacion}-${index}`} value={item.Ubicacion}>
                              {getDescripcionUbicacion(item.CodigoAlmacen, item.Ubicacion)} 
                              (Disponible: {item.Cantidad})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-section">
                    <h2>Destino</h2>
                    <div className="form-group">
                      <label>Almacén:</label>
                      <select 
                        name="destinoAlmacen" 
                        value={form.destinoAlmacen} 
                        onChange={handleChange}
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
                      <label>Ubicación:</label>
                      <select 
                        name="destinoUbicacion" 
                        value={form.destinoUbicacion} 
                        onChange={handleChange}
                        required
                        disabled={!form.destinoAlmacen || cargandoUbicaciones}
                      >
                        <option value="">
                          {cargandoUbicaciones 
                            ? 'Cargando ubicaciones...' 
                            : (form.destinoAlmacen ? 'Seleccionar ubicación' : 'Primero seleccione un almacén')}
                        </option>
                        {ubicacionesDestino.map((ubicacion, index) => (
                          <option 
                            key={`${ubicacion.Ubicacion}-${index}`} 
                            value={ubicacion.Ubicacion}
                          >
                            {ubicacion.DescripcionUbicacion || ubicacion.Ubicacion}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-section">
                    <h2>Cantidad</h2>
                    <div className="form-group">
                      <label>Cantidad a traspasar:</label>
                      <input 
                        type="number" 
                        name="cantidad" 
                        value={form.cantidad} 
                        onChange={handleChange}
                        required
                        min="0.01"
                        step="any"
                        placeholder="Ingrese la cantidad"
                        max={stockEnOrigen}
                        disabled={!form.origenUbicacion}
                      />
                      <div className={`stock-info ${parseFloat(form.cantidad) > stockEnOrigen ? 'stock-warning' : ''}`}>
                        {form.origenUbicacion && `Stock disponible en origen: ${stockEnOrigen}`}
                      </div>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button 
                      type="button" 
                      className="btn-cancelar"
                      onClick={() => {
                        setArticuloSeleccionado(null);
                        setTerminoBusqueda('');
                        setStockDisponible([]);
                        setForm({
                          origenAlmacen: '',
                          origenUbicacion: '',
                          destinoAlmacen: '',
                          destinoUbicacion: '',
                          cantidad: ''
                        });
                        setResultadosBusqueda([]);
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
                      {loading ? (
                        <>
                          <span className="loading-indicator"></span>
                          Procesando...
                        </>
                      ) : 'Verificar Traspaso'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="modo-ubicacion">
              <div className="form-section">
                <h2>Ubicación de Origen</h2>
                <div className="form-group">
                  <label>Almacén:</label>
                  <select 
                    value={ubicacionSeleccionada?.almacen || ''}
                    onChange={(e) => {
                      const almacen = e.target.value;
                      setUbicacionSeleccionada(prev => ({
                        almacen,
                        ubicacion: prev?.ubicacion || ''
                      }));
                    }}
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
                  <label>Ubicación:</label>
                  <select 
                    value={ubicacionSeleccionada?.ubicacion || ''}
                    onChange={(e) => {
                      const ubicacion = e.target.value;
                      setUbicacionSeleccionada(prev => ({
                        almacen: prev?.almacen || '',
                        ubicacion
                      }));
                    }}
                    disabled={!ubicacionSeleccionada?.almacen}
                  >
                    <option value="">Seleccionar ubicación</option>
                    {ubicacionSeleccionada?.almacen && ubicacionesOrigen.map((ubicacion, index) => (
                      <option key={`${ubicacion.Ubicacion}-${index}`} value={ubicacion.Ubicacion}>
                        {ubicacion.DescripcionUbicacion || ubicacion.Ubicacion}
                      </option>
                    ))}
                  </select>
                </div>

                <button 
                  className="btn-cargar"
                  onClick={() => {
                    if (ubicacionSeleccionada?.almacen && ubicacionSeleccionada?.ubicacion) {
                      cargarArticulosPorUbicacion(
                        ubicacionSeleccionada.almacen, 
                        ubicacionSeleccionada.ubicacion
                      );
                    }
                  }}
                  disabled={!ubicacionSeleccionada?.almacen || !ubicacionSeleccionada?.ubicacion}
                >
                  Cargar Artículos
                </button>
              </div>

              {articulosUbicacion.length > 0 && (
                <div className="form-section">
                  <h2>Artículos Disponibles</h2>
                  <div className="articulos-ubicacion">
                    {articulosUbicacion.map((articulo, index) => (
                      <div 
                        key={`${articulo.CodigoArticulo}-${index}`}
                        className={`articulo-item ${articuloSeleccionado?.CodigoArticulo === articulo.CodigoArticulo ? 'seleccionado' : ''}`}
                        onClick={() => seleccionarArticuloUbicacion(articulo)}
                      >
                        <div className="articulo-codigo">{articulo.CodigoArticulo}</div>
                        <div className="articulo-descripcion">{articulo.DescripcionArticulo}</div>
                        <div className="articulo-cantidad">Stock: {articulo.Cantidad}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {articuloSeleccionado && (
                <div className="form-section">
                  <h2>Detalles del Traspaso</h2>
                  
                  <div className="articulo-seleccionado">
                    <span className="articulo-label">Artículo seleccionado:</span>
                    <span className="articulo-nombre">
                      {articuloSeleccionado.DescripcionArticulo} ({articuloSeleccionado.CodigoArticulo})
                    </span>
                  </div>
                  
                  <div className="form-group">
                    <label>Almacén de destino:</label>
                    <select 
                      name="destinoAlmacen" 
                      value={form.destinoAlmacen} 
                      onChange={handleChange}
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
                    <label>Ubicación de destino:</label>
                    <select 
                      name="destinoUbicacion" 
                      value={form.destinoUbicacion} 
                      onChange={handleChange}
                      required
                      disabled={!form.destinoAlmacen || cargandoUbicaciones}
                    >
                      <option value="">
                        {cargandoUbicaciones 
                          ? 'Cargando ubicaciones...' 
                          : (form.destinoAlmacen ? 'Seleccionar ubicación' : 'Primero seleccione un almacén')}
                      </option>
                      {ubicacionesDestino.map((ubicacion, index) => (
                        <option 
                          key={`${ubicacion.Ubicacion}-${index}`} 
                          value={ubicacion.Ubicacion}
                        >
                          {ubicacion.DescripcionUbicacion || ubicacion.Ubicacion}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Cantidad a traspasar:</label>
                    <input 
                      type="number" 
                      name="cantidad" 
                      value={form.cantidad} 
                      onChange={handleChange}
                      required
                      min="0.01"
                      step="any"
                      placeholder="Ingrese la cantidad"
                      max={articuloSeleccionado.Cantidad}
                    />
                    <div className="stock-info">
                      Stock disponible: {articuloSeleccionado.Cantidad}
                    </div>
                  </div>

                  <div className="form-actions">
                    <button 
                      type="button" 
                      className="btn-cancelar"
                      onClick={() => {
                        setArticuloSeleccionado(null);
                        setForm({
                          origenAlmacen: '',
                          origenUbicacion: '',
                          destinoAlmacen: '',
                          destinoUbicacion: '',
                          cantidad: ''
                        });
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
                      {loading ? (
                        <>
                          <span className="loading-indicator"></span>
                          Procesando...
                        </>
                      ) : 'Verificar Traspaso'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {activeSection === 'verificacion' && (
        <div className="verificacion-section">
          <h2>Verificación de Traspaso</h2>
          
          {articuloSeleccionado ? (
            <div className="detalle-traspaso">
              <div className="detalle-item">
                <span>Artículo:</span>
                <span>{articuloSeleccionado.DescripcionArticulo} ({articuloSeleccionado.CodigoArticulo})</span>
              </div>
              <div className="detalle-item">
                <span>Origen:</span>
                <span>
                  {getNombreAlmacen(form.origenAlmacen)} - {getDescripcionUbicacion(form.origenAlmacen, form.origenUbicacion)}
                </span>
              </div>
              <div className="detalle-item">
                <span>Destino:</span>
                <span>
                  {getNombreAlmacen(form.destinoAlmacen)} - {getDescripcionUbicacion(form.destinoAlmacen, form.destinoUbicacion)}
                </span>
              </div>
              <div className="detalle-item">
                <span>Cantidad:</span>
                <span>{form.cantidad}</span>
              </div>
              
              <div className="acciones-verificacion">
                <button 
                  className="btn-editar"
                  onClick={() => setActiveSection('movimientos')}
                >
                  Editar
                </button>
                <button 
                  className="btn-confirmar"
                  onClick={confirmarTraspaso}
                  disabled={loading}
                >
                  {loading ? 'Confirmando...' : 'Confirmar Traspaso'}
                </button>
                <button 
                  className="btn-cancelar"
                  onClick={() => setActiveSection('movimientos')}
                >
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
      
      {activeSection === 'historial' && (
        <div className="historial-section">
          <h2>Historial de Traspasos</h2>
          
          {cargandoHistorial ? (
            <div className="cargando-historial">
              <div className="loading-spinner"></div>
              Cargando historial...
            </div>
          ) : historial.length > 0 ? (
            <div className="lista-historial">
              {historial.map((item, index) => (
                <div key={`${item.FechaRegistro}-${index}`} className="historial-item">
                  <div className="historial-header">
                    <div className="historial-fecha">
                      {formatFecha(item.FechaRegistro)}
                    </div>
                    <div className={`historial-tipo ${item.TipoMovimiento === 3 ? 'salida' : 'entrada'}`}>
                      {item.TipoMovimiento === 3 ? 'Salida' : 'Entrada'}
                    </div>
                  </div>
                  
                  <div className="historial-articulo">
                    <span className="historial-label">Artículo:</span>
                    {item.DescripcionArticulo} ({item.CodigoArticulo})
                  </div>
                  
                  <div className="historial-detalle">
                    <div>
                      <span className="historial-label">Origen:</span> 
                      {item.NombreOrigenAlmacen} - {item.Ubicacion}
                    </div>
                    <div>
                      <span className="historial-label">Destino:</span> 
                      {item.NombreDestinoAlmacen} - {item.UbicacionContrapartida}
                    </div>
                  </div>
                  
                  <div className="historial-info">
                    <div className="historial-cantidad">
                      <span className="historial-label">Cantidad:</span> {item.Unidades}
                    </div>
                    <div className="historial-usuario">
                      <span className="historial-label">Usuario:</span> {item.Comentario.split(': ')[1]}
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