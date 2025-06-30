import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import '../styles/TraspasosPage.css';

const TraspasosPage = () => {
  const [activeSection, setActiveSection] = useState('movimientos');
  const [activeTab, setActiveTab] = useState('articulo');
  const [almacenes, setAlmacenes] = useState([]);
  const [ubicacionesOrigen, setUbicacionesOrigen] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cargandoUbicaciones, setCargandoUbicaciones] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  
  // Estados independientes para cada modo
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
    errorBusqueda: ''
  });
  
  const [modoUbicacion, setModoUbicacion] = useState({
    ubicacionSeleccionada: null,
    articulosUbicacion: [],
    articuloSeleccionado: null,
    form: {
      destinoAlmacen: '',
      destinoUbicacion: '',
      cantidad: ''
    }
  });
  
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

  // Buscar artículos con debounce (modo Artículo)
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    const termino = modoArticulo.terminoBusqueda;
    if (!termino || termino.trim() === '') {
      setModoArticulo(prev => ({ ...prev, resultadosBusqueda: [], errorBusqueda: '' }));
      return;
    }
    
    setModoArticulo(prev => ({ ...prev, buscando: true, errorBusqueda: '' }));
    
    timerRef.current = setTimeout(async () => {
      try {
        const headers = getAuthHeader();
        const response = await axios.get(
          `http://localhost:3000/buscar-articulos?termino=${encodeURIComponent(termino)}`,
          { headers }
        );
        setModoArticulo(prev => ({ 
          ...prev, 
          resultadosBusqueda: response.data,
          errorBusqueda: response.data.length === 0 ? 'No se encontraron artículos' : '',
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
    }, 300);
    
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [modoArticulo.terminoBusqueda]);

  // Cargar stock del artículo (modo Artículo)
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
          origenAlmacen: response.data.length > 0 ? response.data[0].CodigoAlmacen : '',
          origenUbicacion: response.data.length > 0 ? response.data[0].Ubicacion : ''
        }
      }));
    } catch (error) {
      console.error('Error cargando stock del artículo:', error);
      setModoArticulo(prev => ({ ...prev, stockDisponible: [] }));
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

  // Efecto para ubicaciones de origen (modo Ubicación)
  useEffect(() => {
    if (modoUbicacion.ubicacionSeleccionada?.almacen) {
      cargarUbicaciones(modoUbicacion.ubicacionSeleccionada.almacen, setUbicacionesOrigen);
    }
  }, [modoUbicacion.ubicacionSeleccionada?.almacen]);

  // Efecto para ubicaciones de destino
  useEffect(() => {
    const destinoAlmacen = activeTab === 'articulo' 
      ? modoArticulo.form.destinoAlmacen 
      : modoUbicacion.form.destinoAlmacen;
    
    if (destinoAlmacen) {
      let excluirUbicacion = null;
      if (activeTab === 'articulo') {
        if (modoArticulo.form.origenAlmacen === destinoAlmacen) {
          excluirUbicacion = modoArticulo.form.origenUbicacion;
        }
      } else {
        if (modoUbicacion.ubicacionSeleccionada?.almacen === destinoAlmacen) {
          excluirUbicacion = modoUbicacion.ubicacionSeleccionada.ubicacion;
        }
      }
      cargarUbicaciones(destinoAlmacen, setUbicacionesDestino, excluirUbicacion);
    } else {
      setUbicacionesDestino([]);
      if (activeTab === 'articulo') {
        setModoArticulo(prev => ({ ...prev, form: { ...prev.form, destinoUbicacion: '' } }));
      } else {
        setModoUbicacion(prev => ({ ...prev, form: { ...prev.form, destinoUbicacion: '' } }));
      }
    }
  }, [
    activeTab,
    modoArticulo.form.destinoAlmacen,
    modoArticulo.form.origenAlmacen,
    modoArticulo.form.origenUbicacion,
    modoUbicacion.form.destinoAlmacen,
    modoUbicacion.ubicacionSeleccionada
  ]);

  // Cargar artículos por ubicación (modo Ubicación)
  const cargarArticulosPorUbicacion = async (codigoAlmacen, ubicacion) => {
    try {
      setCargandoUbicaciones(true);
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/stock/por-ubicacion?codigoAlmacen=${codigoAlmacen}&ubicacion=${ubicacion}`,
        { headers }
      );
      setModoUbicacion(prev => ({ ...prev, articulosUbicacion: response.data }));
    } catch (error) {
      console.error('Error cargando artículos por ubicación:', error);
      setModoUbicacion(prev => ({ ...prev, articulosUbicacion: [] }));
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

  // Formatear fecha (CORREGIDO)
  const formatFecha = (fechaStr) => {
    if (!fechaStr) return 'Fecha no disponible';
    
    // Intentar parsear como ISO (formato que viene del backend)
    try {
      // Si tiene formato ISO (contiene 'T' o tiene el formato YYYY-MM-DD)
      if (fechaStr.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(fechaStr)) {
        const fecha = new Date(fechaStr);
        if (isNaN(fecha.getTime())) return fechaStr; // Fallback si es inválida
        
        return fecha.toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      // Si ya es un string formateado
      return fechaStr;
    } catch (error) {
      console.error('Error formateando fecha:', error);
      return fechaStr; // Devolver original si falla
    }
  };

  // ✅ Función corregida para formatear cantidades
  const formatCantidad = (valor) => {
    // Convertir a número
    const cantidad = parseFloat(valor);
    
    // Si no es número válido
    if (isNaN(cantidad)) return "0";
    
    // Redondear a máximo 2 decimales
    const rounded = Math.round(cantidad * 100) / 100;
    
    // Eliminar ceros innecesarios
    return rounded % 1 === 0 
      ? rounded.toString() 
      : rounded.toFixed(2).replace(/\.?0+$/, '');
  };

  // Seleccionar artículo en modo Artículo
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

  // Seleccionar artículo en modo Ubicación
  const seleccionarArticuloModoUbicacion = (articulo) => {
    setModoUbicacion(prev => ({ ...prev, articuloSeleccionado: articulo }));
  };

  // Manejar cambios en el formulario del modo Artículo
  const handleChangeModoArticulo = (e) => {
    const { name, value } = e.target;
    setModoArticulo(prev => ({
      ...prev,
      form: {
        ...prev.form,
        [name]: value
      }
    }));
  };

  // Manejar cambios en el formulario del modo Ubicación
  const handleChangeModoUbicacion = (e) => {
    const { name, value } = e.target;
    setModoUbicacion(prev => ({
      ...prev,
      form: {
        ...prev.form,
        [name]: value
      }
    }));
  };

  // Validar formulario
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
        return 'No puede seleccionar la misma ubicación de origen y destino';
      }
      
      const stockEnOrigen = modoArticulo.stockDisponible.find(
        s => s.CodigoAlmacen === form.origenAlmacen && 
              s.Ubicacion === form.origenUbicacion
      )?.Cantidad || 0;
      
      if (parseFloat(form.cantidad) > stockEnOrigen) {
        return `La cantidad supera el stock disponible (${stockEnOrigen})`;
      }
      
      return null;
    } else {
      const { articuloSeleccionado, form, ubicacionSeleccionada } = modoUbicacion;
      if (!ubicacionSeleccionada) return 'Seleccione una ubicación de origen';
      if (!articuloSeleccionado) return 'Seleccione un artículo';
      if (!form.destinoAlmacen) return 'Seleccione almacén de destino';
      if (!form.destinoUbicacion) return 'Seleccione ubicación de destino';
      if (!form.cantidad || form.cantidad <= 0) return 'Cantidad inválida';
      
      if (ubicacionSeleccionada.almacen === form.destinoAlmacen && 
          ubicacionSeleccionada.ubicacion === form.destinoUbicacion) {
        return 'No puede seleccionar la misma ubicación de origen y destino';
      }
      
      if (parseFloat(form.cantidad) > articuloSeleccionado.Cantidad) {
        return `La cantidad supera el stock disponible (${articuloSeleccionado.Cantidad})`;
      }
      
      return null;
    }
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
      let body;
      if (activeTab === 'articulo') {
        const { articuloSeleccionado, form } = modoArticulo;
        body = {
          codigoEmpresa: user.CodigoEmpresa,
          articulo: articuloSeleccionado.CodigoArticulo,
          origenAlmacen: form.origenAlmacen,
          origenUbicacion: form.origenUbicacion,
          destinoAlmacen: form.destinoAlmacen,
          destinoUbicacion: form.destinoUbicacion,
          cantidad: parseFloat(form.cantidad),
          usuario: user.UsuarioLogicNet
        };
      } else {
        const { articuloSeleccionado, form, ubicacionSeleccionada } = modoUbicacion;
        body = {
          codigoEmpresa: user.CodigoEmpresa,
          articulo: articuloSeleccionado.CodigoArticulo,
          origenAlmacen: ubicacionSeleccionada.almacen,
          origenUbicacion: ubicacionSeleccionada.ubicacion,
          destinoAlmacen: form.destinoAlmacen,
          destinoUbicacion: form.destinoUbicacion,
          cantidad: parseFloat(form.cantidad),
          usuario: user.UsuarioLogicNet
        };
      }
      
      await axios.post(
        'http://localhost:3000/traspaso',
        body,
        { headers }
      );
      
      alert('Traspaso realizado con éxito');
      // Resetear estados
      if (activeTab === 'articulo') {
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
      } else {
        setModoUbicacion({
          ubicacionSeleccionada: null,
          articulosUbicacion: [],
          articuloSeleccionado: null,
          form: {
            destinoAlmacen: '',
            destinoUbicacion: '',
            cantidad: ''
          }
        });
      }
      setUbicacionesDestino([]);
      setUbicacionesOrigen([]);
      cargarHistorial();
      setActiveSection('movimientos');
    } catch (error) {
      console.error('Error realizando traspaso:', error);
      alert('Error: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Obtener stock disponible en modo Artículo
  const stockEnOrigenModoArticulo = modoArticulo.stockDisponible.find(
    item => item.CodigoAlmacen === modoArticulo.form.origenAlmacen && 
            item.Ubicacion === modoArticulo.form.origenUbicacion
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

  // Limpiar estados al cambiar de pestaña
  useEffect(() => {
    setUbicacionesOrigen([]);
    setUbicacionesDestino([]);
  }, [activeTab]);

  return (
    <div className="traspasos-container">
      <h1>Traspaso entre Ubicaciones</h1>
      
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
      
      {activeSection === 'movimientos' && (
        <div className="movimientos-section">
          <div className="tabs-container" role="tablist">
            <button 
              className={`tab-btn ${activeTab === 'articulo' ? 'active' : ''}`}
              onClick={() => setActiveTab('articulo')}
              role="tab"
              aria-selected={activeTab === 'articulo'}
              aria-controls="modo-articulo"
            >
              Por Artículo
            </button>
            <button 
              className={`tab-btn ${activeTab === 'ubicacion' ? 'active' : ''}`}
              onClick={() => setActiveTab('ubicacion')}
              role="tab"
              aria-selected={activeTab === 'ubicacion'}
              aria-controls="modo-ubicacion"
            >
              Por Ubicación
            </button>
          </div>
          
          {activeTab === 'articulo' ? (
            <div className="modo-articulo" id="modo-articulo" role="tabpanel">
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
                      placeholder="Código o descripción del artículo..."
                      className="search-input"
                      aria-label="Buscar artículo"
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
                          onKeyDown={(e) => e.key === 'Enter' && seleccionarArticuloModoArticulo(articulo)}
                        >
                          <div className="articulo-codigo">{articulo.CodigoArticulo}</div>
                          <div className="articulo-descripcion">{articulo.DescripcionArticulo}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {modoArticulo.articuloSeleccionado && (
                    <div className="articulo-seleccionado" aria-live="polite">
                      <span className="articulo-label">Artículo seleccionado:</span>
                      <span className="articulo-nombre">
                        {modoArticulo.articuloSeleccionado.DescripcionArticulo} ({modoArticulo.articuloSeleccionado.CodigoArticulo})
                      </span>
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
                        aria-required="true"
                      >
                        <option value="">Seleccionar almacén</option>
                        {Array.from(new Set(modoArticulo.stockDisponible.map(item => item.CodigoAlmacen))).map((codigo, index) => (
                          <option key={`${codigo}-${index}`} value={codigo}>
                            {getNombreAlmacen(codigo)} ({codigo})
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
                        aria-required="true"
                        disabled={!modoArticulo.form.origenAlmacen}
                      >
                        <option value="">{modoArticulo.form.origenAlmacen ? 'Seleccionar ubicación' : 'Primero seleccione un almacén'}</option>
                        {modoArticulo.form.origenAlmacen && modoArticulo.stockDisponible
                          .filter(item => item.CodigoAlmacen === modoArticulo.form.origenAlmacen)
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
                      <label htmlFor="destino-almacen">Almacén:</label>
                      <select 
                        id="destino-almacen"
                        name="destinoAlmacen" 
                        value={modoArticulo.form.destinoAlmacen} 
                        onChange={handleChangeModoArticulo}
                        required
                        aria-required="true"
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
                        aria-required="true"
                        disabled={!modoArticulo.form.destinoAlmacen || cargandoUbicaciones}
                        aria-busy={cargandoUbicaciones}
                      >
                        <option value="">
                          {cargandoUbicaciones 
                            ? 'Cargando ubicaciones...' 
                            : (modoArticulo.form.destinoAlmacen ? 'Seleccionar ubicación' : 'Primero seleccione un almacén')}
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
                        placeholder="Ingrese la cantidad"
                        max={stockEnOrigenModoArticulo}
                        disabled={!modoArticulo.form.origenUbicacion}
                        aria-required="true"
                      />
                      <div 
                        className={`stock-info ${parseFloat(modoArticulo.form.cantidad) > stockEnOrigenModoArticulo ? 'stock-warning' : ''}`}
                        aria-live="polite"
                      >
                        {modoArticulo.form.origenUbicacion && `Stock disponible en origen: ${stockEnOrigenModoArticulo}`}
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
                      aria-busy={loading}
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
            <div className="modo-ubicacion" id="modo-ubicacion" role="tabpanel">
              <div className="form-section">
                <h2>Ubicación de Origen</h2>
                <div className="form-group">
                  <label htmlFor="ubicacion-almacen">Almacén:</label>
                  <select 
                    id="ubicacion-almacen"
                    value={modoUbicacion.ubicacionSeleccionada?.almacen || ''}
                    onChange={(e) => {
                      const almacen = e.target.value;
                      setModoUbicacion(prev => ({
                        ...prev,
                        ubicacionSeleccionada: { ...prev.ubicacionSeleccionada, almacen }
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
                  <label htmlFor="ubicacion-ubicacion">Ubicación:</label>
                  <select 
                    id="ubicacion-ubicacion"
                    value={modoUbicacion.ubicacionSeleccionada?.ubicacion || ''}
                    onChange={(e) => {
                      const ubicacion = e.target.value;
                      setModoUbicacion(prev => ({
                        ...prev,
                        ubicacionSeleccionada: { ...prev.ubicacionSeleccionada, ubicacion }
                      }));
                    }}
                    disabled={!modoUbicacion.ubicacionSeleccionada?.almacen}
                  >
                    <option value="">Seleccionar ubicación</option>
                    {modoUbicacion.ubicacionSeleccionada?.almacen && ubicacionesOrigen.map((ubicacion, index) => (
                      <option key={`${ubicacion.Ubicacion}-${index}`} value={ubicacion.Ubicacion}>
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
                        onKeyDown={(e) => e.key === 'Enter' && seleccionarArticuloModoUbicacion(articulo)}
                        aria-pressed={modoUbicacion.articuloSeleccionado?.CodigoArticulo === articulo.CodigoArticulo}
                      >
                        <div className="articulo-codigo">{articulo.CodigoArticulo}</div>
                        <div className="articulo-descripcion">{articulo.DescripcionArticulo}</div>
                        <div className="articulo-cantidad">Stock: {articulo.Cantidad}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {modoUbicacion.articuloSeleccionado && (
                <div className="form-section">
                  <h2>Detalles del Traspaso</h2>
                  
                  <div className="articulo-seleccionado" aria-live="polite">
                    <span className="articulo-label">Artículo seleccionado:</span>
                    <span className="articulo-nombre">
                      {modoUbicacion.articuloSeleccionado.DescripcionArticulo} ({modoUbicacion.articuloSeleccionado.CodigoArticulo})
                    </span>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="destino-almacen-ubic">Almacén de destino:</label>
                    <select 
                      id="destino-almacen-ubic"
                      name="destinoAlmacen" 
                      value={modoUbicacion.form.destinoAlmacen} 
                      onChange={handleChangeModoUbicacion}
                      required
                      aria-required="true"
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
                    <label htmlFor="destino-ubicacion-ubic">Ubicación de destino:</label>
                    <select 
                      id="destino-ubicacion-ubic"
                      name="destinoUbicacion" 
                      value={modoUbicacion.form.destinoUbicacion} 
                      onChange={handleChangeModoUbicacion}
                      required
                      aria-required="true"
                      disabled={!modoUbicacion.form.destinoAlmacen || cargandoUbicaciones}
                      aria-busy={cargandoUbicaciones}
                    >
                      <option value="">
                        {cargandoUbicaciones 
                          ? 'Cargando ubicaciones...' 
                          : (modoUbicacion.form.destinoAlmacen ? 'Seleccionar ubicación' : 'Primero seleccione un almacén')}
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
                      placeholder="Ingrese la cantidad"
                      max={modoUbicacion.articuloSeleccionado.Cantidad}
                      aria-required="true"
                    />
                    <div className="stock-info" aria-live="polite">
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
                      aria-busy={loading}
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
                  aria-busy={loading}
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
            <div className="sin-traspaso" aria-live="polite">
              No hay traspaso pendiente de verificación
            </div>
          )}
        </div>
      )}
      
      {activeSection === 'historial' && (
        <div className="historial-section">
          <h2>Historial de Traspasos</h2>
          
          {cargandoHistorial ? (
            <div className="cargando-historial" aria-live="polite">
              <div className="loading-spinner" aria-hidden="true"></div>
              Cargando historial...
            </div>
          ) : historial.length > 0 ? (
            <div className="lista-historial" role="list">
              {historial.map((item, index) => {
                const fechaFormateada = formatFecha(item.Fecha);
                
                return (
                  <div 
                    key={`${item.Fecha}-${index}`} 
                    className="historial-item"
                    role="listitem"
                  >
                    <div className="historial-header">
                      <div className="historial-fecha">
                        {fechaFormateada}
                      </div>
                      <div 
                        className={`historial-tipo ${item.TipoMovimiento === 'Salida' ? 'salida' : 'entrada'}`}
                        aria-label={item.TipoMovimiento}
                      >
                        {item.TipoMovimiento}
                      </div>
                    </div>
                    
                    <div className="historial-articulo">
                      <span className="historial-label">Artículo:</span>
                      {item.DescripcionArticulo} ({item.CodigoArticulo})
                    </div>
                    
                    <div className="historial-detalle">
                      <div>
                        <span className="historial-label">Origen:</span> 
                        {item.NombreOrigenAlmacen} - {item.OrigenUbicacion}
                      </div>
                      <div>
                        <span className="historial-label">Destino:</span> 
                        {item.NombreDestinoAlmacen} - {item.DestinoUbicacion}
                      </div>
                    </div>
                    
                    <div className="historial-info">
                      <div className="historial-cantidad">
                        <span className="historial-label">Cantidad:</span> 
                        {formatCantidad(item.Cantidad)}
                      </div>
                      <div className="historial-usuario">
                        <span className="historial-label">Usuario:</span> 
                        {item.Comentario?.split(': ')[1] || 'Desconocido'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="sin-historial" aria-live="polite">
              No hay traspasos registrados
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TraspasosPage;