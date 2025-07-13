import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import { v4 as uuidv4 } from 'uuid';
import '../styles/TraspasosPage.css';

const TraspasosPage = () => {
  // Estados principales
  const [activeSection, setActiveSection] = useState('movimientos');
  const [activeTab, setActiveTab] = useState('articulo');
  const [almacenes, setAlmacenes] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cargandoUbicaciones, setCargandoUbicaciones] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [ubicacionesAgrupadas, setUbicacionesAgrupadas] = useState([]);
  const [almacenExpandido, setAlmacenExpandido] = useState(null);
  const [traspasosPendientes, setTraspasosPendientes] = useState([]);
  
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
      cantidad: '',
      unidadMedidaOrigen: '',
      factorConversion: 1
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
      cantidad: '',
      unidadMedidaOrigen: '',
      factorConversion: 1
    },
    detalles: null,
    pagination: {
      page: 1,
      pageSize: 100,
      totalItems: 0
    },
    searchTerm: '',
    filteredArticulos: []
  });

  // Referencias
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
    // Debounce para búsqueda de artículos (modo artículo)
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

  // Efecto para cargar ubicaciones agrupadas
  useEffect(() => {
    if (activeTab === 'ubicacion') {
      const cargarUbicacionesAgrupadas = async () => {
        try {
          const headers = getAuthHeader();
          const response = await axios.get(
            'http://localhost:3000/ubicaciones-agrupadas', 
            { headers }
          );
          setUbicacionesAgrupadas(response.data);
        } catch (error) {
          console.error('Error cargando ubicaciones agrupadas:', error);
        }
      };
      cargarUbicacionesAgrupadas();
    }
  }, [activeTab]);

  // Efecto para cargar ubicaciones de destino
  useEffect(() => {
    const destinoAlmacen = activeTab === 'articulo' 
      ? modoArticulo.form.destinoAlmacen 
      : modoUbicacion.form.destinoAlmacen;
    
    if (!destinoAlmacen) {
      setUbicacionesDestino([]);
      return;
    }
    
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
  }, [
    activeTab,
    modoArticulo.form.destinoAlmacen,
    modoArticulo.form.origenAlmacen,
    modoArticulo.form.origenUbicacion,
    modoUbicacion.form.destinoAlmacen,
    modoUbicacion.ubicacionSeleccionada
  ]);

  // Filtrar artículos en modo ubicación
  useEffect(() => {
    if (modoUbicacion.searchTerm) {
      const term = modoUbicacion.searchTerm.toLowerCase();
      const filtered = modoUbicacion.articulosUbicacion.filter(art => 
        art.CodigoArticulo.toLowerCase().includes(term) || 
        art.DescripcionArticulo.toLowerCase().includes(term)
      );
      setModoUbicacion(prev => ({ ...prev, filteredArticulos: filtered }));
    } else {
      setModoUbicacion(prev => ({ ...prev, filteredArticulos: prev.articulosUbicacion }));
    }
  }, [modoUbicacion.searchTerm, modoUbicacion.articulosUbicacion]);

  // Resetear estados al cambiar pestaña
  useEffect(() => {
    setUbicacionesDestino([]);
    setAlmacenExpandido(null);
    setTraspasosPendientes([]);
    setModoUbicacion({
      ubicacionSeleccionada: null,
      articulosUbicacion: [],
      articuloSeleccionado: null,
      form: {
        destinoAlmacen: '',
        destinoUbicacion: '',
        cantidad: '',
        unidadMedidaOrigen: '',
        factorConversion: 1
      },
      detalles: null,
      pagination: {
        page: 1,
        pageSize: 100,
        totalItems: 0
      },
      searchTerm: '',
      filteredArticulos: []
    });
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
          origenUbicacion: '',
          unidadMedidaOrigen: '',
          factorConversion: 1
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

  const cargarArticulosPorUbicacion = async (almacen, ubicacion, page = 1) => {
    setCargandoUbicaciones(true);
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/stock/por-ubicacion`,
        { 
          headers,
          params: {
            codigoAlmacen: almacen,
            ubicacion: ubicacion,
            page: page,
            pageSize: modoUbicacion.pagination.pageSize
          }
        }
      );
      
      setModoUbicacion(prev => ({ 
        ...prev, 
        articulosUbicacion: response.data.articulos,
        filteredArticulos: response.data.articulos,
        pagination: {
          ...prev.pagination,
          page: page,
          totalItems: response.data.total
        },
        detalles: null,
        articuloSeleccionado: null
      }));
    } catch (error) {
      console.error('Error cargando artículos:', error);
      alert('Error al cargar artículos: ' + error.message);
    } finally {
      setCargandoUbicaciones(false);
    }
  };

  const cargarHistorial = async () => {
    setCargandoHistorial(true);
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/historial-traspasos`,
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
      const fechaUTC = new Date(fechaStr);
      
      // Convertir UTC a hora local de España (CEST = UTC+2)
      const fechaLocal = new Date(fechaUTC);
      fechaLocal.setHours(fechaLocal.getHours() + 2);
      
      return fechaLocal.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (error) {
      console.error('Error formateando fecha:', error);
      return fechaStr;
    }
  };

  const formatCantidad = (valor) => {
    const cantidad = parseFloat(valor);
    if (isNaN(cantidad)) return "0";
    const rounded = Math.round(cantidad * 100) / 100;
    return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2).replace(/\.?0+$/, '');
  };

  // Función corregida para mostrar el stock
  const mostrarStock = (item) => {
    if (!item) return '';
    
    const cantidad = item.Cantidad;
    const unidadStock = item.UnidadMedida || '';
    const unidadBase = item.UnidadBase || '';
    const factor = item.FactorConversion || 1;

    // Solo convertir si la unidad de stock no es la unidad base
    if (unidadStock !== unidadBase) {
      const cantidadBase = cantidad * factor;
      return `${formatCantidad(cantidad)} ${unidadStock} (${formatCantidad(cantidadBase)} ${unidadBase})`;
    }
    
    return `${formatCantidad(cantidad)} ${unidadStock}`;
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
    setModoUbicacion(prev => ({ 
      ...prev, 
      articuloSeleccionado: articulo,
      form: {
        ...prev.form,
        unidadMedidaOrigen: articulo.UnidadMedida || '',
        factorConversion: articulo.FactorConversion || 1
      }
    }));
  };

  const handleChangeModoArticulo = (e) => {
    const { name, value } = e.target;
    
    // Si estamos cambiando la ubicación de origen, actualizamos unidad de medida
    if (name === 'origenUbicacion') {
      const ubicacionSeleccionada = modoArticulo.stockDisponible.find(
        item => item.CodigoAlmacen === modoArticulo.form.origenAlmacen && 
                item.Ubicacion === value
      );
      
      setModoArticulo(prev => ({
        ...prev,
        form: {
          ...prev.form,
          [name]: value,
          unidadMedidaOrigen: ubicacionSeleccionada?.UnidadMedida || '',
          factorConversion: ubicacionSeleccionada?.FactorConversion || 1
        }
      }));
    } else if (name === 'origenAlmacen') {
      // CAMBIO IMPORTANTE: Al cambiar el almacén, resetear la ubicación
      setModoArticulo(prev => ({
        ...prev,
        form: {
          ...prev.form,
          [name]: value,
          origenUbicacion: '',
          unidadMedidaOrigen: '',
          factorConversion: 1
        }
      }));
    } else {
      setModoArticulo(prev => ({ ...prev, form: { ...prev.form, [name]: value } }));
    }
  };

  const handleChangeModoUbicacion = (e) => {
    const { name, value } = e.target;
    setModoUbicacion(prev => ({ ...prev, form: { ...prev.form, [name]: value } }));
  };

  const handleSearchChangeModoUbicacion = (e) => {
    setModoUbicacion(prev => ({ ...prev, searchTerm: e.target.value }));
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
        s => s.CodigoAlmacen === form.origenAlmacen && 
             s.Ubicacion === form.origenUbicacion
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

  const agregarTraspaso = () => {
    const error = validarFormulario();
    if (error) return alert(error);

    const nuevoTraspaso = {
      id: uuidv4(),
      articulo: modoUbicacion.articuloSeleccionado,
      origen: modoUbicacion.ubicacionSeleccionada,
      destino: {
        almacen: modoUbicacion.form.destinoAlmacen,
        ubicacion: modoUbicacion.form.destinoUbicacion
      },
      cantidad: parseFloat(modoUbicacion.form.cantidad),
      unidadMedida: modoUbicacion.form.unidadMedidaOrigen,
      factorConversion: modoUbicacion.form.factorConversion
    };

    setTraspasosPendientes([...traspasosPendientes, nuevoTraspaso]);

    // Limpiar formulario después de agregar
    setModoUbicacion(prev => ({
      ...prev,
      articuloSeleccionado: null,
      form: {
        destinoAlmacen: '',
        destinoUbicacion: '',
        cantidad: '',
        unidadMedidaOrigen: '',
        factorConversion: 1
      }
    }));
  };

  const eliminarTraspaso = (id) => {
    setTraspasosPendientes(traspasosPendientes.filter(item => item.id !== id));
  };

  const prepararTraspaso = () => {
    if (activeTab === 'articulo') {
      const error = validarFormulario();
      if (error) return alert(error);
      setActiveSection('verificacion');
    } else {
      if (traspasosPendientes.length === 0) {
        return alert('Agregue al menos un traspaso');
      }
      setActiveSection('verificacion');
    }
  };

  const confirmarTraspasos = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeader();
      
      // Si es modo artículo, solo hay un traspaso
      if (activeTab === 'articulo') {
        const body = {
          articulo: modoArticulo.articuloSeleccionado.CodigoArticulo,
          origenAlmacen: modoArticulo.form.origenAlmacen,
          origenUbicacion: modoArticulo.form.origenUbicacion,
          destinoAlmacen: modoArticulo.form.destinoAlmacen,
          destinoUbicacion: modoArticulo.form.destinoUbicacion,
          cantidad: parseFloat(modoArticulo.form.cantidad),
          unidadMedidaOrigen: modoArticulo.form.unidadMedidaOrigen,
          factorConversionOrigen: modoArticulo.form.factorConversion
        };
        await axios.post('http://localhost:3000/traspaso', body, { headers });
        alert('Traspaso realizado con éxito');
        // Resetear modo artículo
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
            cantidad: '',
            unidadMedidaOrigen: '',
            factorConversion: 1
          },
          buscando: false,
          errorBusqueda: ''
        });
      } else {
        // Modo ubicación: múltiples traspasos
        const promises = traspasosPendientes.map(traspaso => 
          axios.post('http://localhost:3000/traspaso', {
            articulo: traspaso.articulo.CodigoArticulo,
            origenAlmacen: traspaso.origen.almacen,
            origenUbicacion: traspaso.origen.ubicacion,
            destinoAlmacen: traspaso.destino.almacen,
            destinoUbicacion: traspaso.destino.ubicacion,
            cantidad: traspaso.cantidad,
            unidadMedidaOrigen: traspaso.unidadMedida,
            factorConversionOrigen: traspaso.factorConversion
          }, { headers })
        );

        await Promise.all(promises);
        alert('Traspasos realizados con éxito');
        setTraspasosPendientes([]);
      }

      cargarHistorial();
      setActiveSection('movimientos');
    } catch (error) {
      console.error('Error en traspaso:', error);
      let errorMsg = 'Error en el traspaso';
      if (error.response && error.response.data && error.response.data.mensaje) {
        errorMsg = error.response.data.mensaje;
      }
      alert(errorMsg);
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
    const ubic = [...ubicacionesDestino].find(
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
                (activeTab === 'ubicacion' && traspasosPendientes.length > 0)) {
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
                        <option value="">Seleccione ubicación</option>
                        {modoArticulo.stockDisponible
                          .filter(item => item.CodigoAlmacen === modoArticulo.form.origenAlmacen)
                          .map((item, index) => (
                            <option key={`${item.Ubicacion}-${index}`} value={item.Ubicacion}>
                              {getDescripcionUbicacion(item.CodigoAlmacen, item.Ubicacion)} - {mostrarStock(item)}
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
                        {modoArticulo.form.origenUbicacion && `Stock disponible: ${stockEnOrigenModoArticulo} ${modoArticulo.form.unidadMedidaOrigen}`}
                      </div>
                    </div>
                  </div>

                  <div className="form-actions">
                    <button className="btn-cancelar" onClick={() => {
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
                          cantidad: '',
                          unidadMedidaOrigen: '',
                          factorConversion: 1
                        },
                        buscando: false,
                        errorBusqueda: ''
                      });
                    }}>
                      Limpiar
                    </button>
                    
                    <button 
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
                                modoUbicacion.ubicacionSeleccionada?.almacen === almacen.codigo && 
                                modoUbicacion.ubicacionSeleccionada?.ubicacion === ubicacion.codigo 
                                  ? 'seleccionada' 
                                  : ''
                              }`}
                              onClick={() => {
                                setModoUbicacion(prev => ({
                                  ...prev,
                                  ubicacionSeleccionada: {
                                    almacen: almacen.codigo,
                                    nombreAlmacen: almacen.nombre,
                                    ubicacion: ubicacion.codigo,
                                    descripcion: ubicacion.descripcion
                                  },
                                  pagination: {
                                    ...prev.pagination,
                                    page: 1
                                  },
                                  articuloSeleccionado: null,
                                  searchTerm: ''
                                }));
                                cargarArticulosPorUbicacion(almacen.codigo, ubicacion.codigo, 1);
                              }}
                            >
                              <span className="ubicacion-codigo">{ubicacion.codigo}</span>
                              <span className="ubicacion-descripcion">{ubicacion.descripcion}</span>
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

              {modoUbicacion.ubicacionSeleccionada && (
                <div className="form-section">
                  <h2>Artículos en {modoUbicacion.ubicacionSeleccionada.descripcion}</h2>
                  <div className="ubicacion-seleccionada-info">
                    <span>Almacén: {modoUbicacion.ubicacionSeleccionada.nombreAlmacen}</span>
                    <span>Ubicación: {modoUbicacion.ubicacionSeleccionada.descripcion}</span>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="buscar-articulo-ubic">Buscar artículo:</label>
                    <input
                      id="buscar-articulo-ubic"
                      type="text"
                      value={modoUbicacion.searchTerm}
                      onChange={handleSearchChangeModoUbicacion}
                      placeholder="Buscar por código o descripción..."
                      className="search-input"
                    />
                  </div>
                  
                  <div className="articulos-ubicacion">
                    {modoUbicacion.articulosUbicacion.length === 0 ? (
                      <div className="no-articulos">
                        No hay artículos en esta ubicación
                      </div>
                    ) : (
                      <div className="tabla-articulos">
                        <table>
                          <thead>
                            <tr>
                              <th>Código</th>
                              <th>Descripción</th>
                              <th>Stock Disponible</th>
                              <th>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {modoUbicacion.filteredArticulos.map(articulo => (
                              <tr 
                                key={`${articulo.CodigoArticulo}-${articulo.Partida || 'sin-partida'}`}
                                className={modoUbicacion.articuloSeleccionado?.CodigoArticulo === articulo.CodigoArticulo ? 'seleccionado' : ''}
                                onClick={() => seleccionarArticuloModoUbicacion(articulo)}
                              >
                                <td>{articulo.CodigoArticulo}</td>
                                <td>{articulo.DescripcionArticulo}</td>
                                <td>{mostrarStock(articulo)}</td>
                                <td>
                                  <button 
                                    className="btn-detalles"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      cargarDetalles(articulo.MovPosicionLinea);
                                    }}
                                  >
                                    Detalles
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  
                  {/* Paginación */}
                  <div className="pagination-controls">
                    <button 
                      disabled={modoUbicacion.pagination.page === 1}
                      onClick={() => cargarArticulosPorUbicacion(
                        modoUbicacion.ubicacionSeleccionada.almacen,
                        modoUbicacion.ubicacionSeleccionada.ubicacion,
                        modoUbicacion.pagination.page - 1
                      )}
                    >
                      Anterior
                    </button>
                    
                    <span>Página {modoUbicacion.pagination.page} de {Math.ceil(modoUbicacion.pagination.totalItems / modoUbicacion.pagination.pageSize)}</span>
                    
                    <button 
                      disabled={(modoUbicacion.pagination.page * modoUbicacion.pagination.pageSize) >= modoUbicacion.pagination.totalItems}
                      onClick={() => cargarArticulosPorUbicacion(
                        modoUbicacion.ubicacionSeleccionada.almacen,
                        modoUbicacion.ubicacionSeleccionada.ubicacion,
                        modoUbicacion.pagination.page + 1
                      )}
                    >
                      Siguiente
                    </button>
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
                      Stock disponible: {mostrarStock(modoUbicacion.articuloSeleccionado)}
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
                            cantidad: '',
                            unidadMedidaOrigen: '',
                            factorConversion: 1
                          }
                        }));
                      }}
                    >
                      Cancelar
                    </button>
                    
                    <button 
                      type="button" 
                      className="btn-agregar"
                      onClick={agregarTraspaso}
                      disabled={loading}
                    >
                      {loading ? 'Agregando...' : 'Agregar Traspaso'}
                    </button>
                  </div>
                </div>
              )}

              {traspasosPendientes.length > 0 && (
                <div className="form-section">
                  <h2>Traspasos Pendientes</h2>
                  <div className="lista-traspasos">
                    {traspasosPendientes.map(traspaso => (
                      <div key={traspaso.id} className="traspaso-item">
                        <div className="traspaso-info">
                          <div><strong>Artículo:</strong> {traspaso.articulo.DescripcionArticulo} ({traspaso.articulo.CodigoArticulo})</div>
                          <div><strong>Origen:</strong> {traspaso.origen.nombreAlmacen} - {traspaso.origen.descripcion}</div>
                          <div><strong>Destino:</strong> {getNombreAlmacen(traspaso.destino.almacen)} - {getDescripcionUbicacion(traspaso.destino.almacen, traspaso.destino.ubicacion)}</div>
                          <div>
                            <strong>Cantidad:</strong> {traspaso.cantidad} {traspaso.unidadMedida}
                            {traspaso.factorConversion && traspaso.factorConversion !== 1 && (
                              <span> ({traspaso.cantidad * traspaso.factorConversion} {traspaso.articulo.UnidadBase})</span>
                            )}
                          </div>
                        </div>
                        <button 
                          className="btn-eliminar"
                          onClick={() => eliminarTraspaso(traspaso.id)}
                        >
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="form-actions">
                    <button 
                      type="button" 
                      className="btn-enviar"
                      onClick={prepararTraspaso}
                      disabled={loading}
                    >
                      {loading ? 'Procesando...' : 'Verificar Traspasos'}
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
          <h2>Verificación de Traspasos</h2>
          
          {activeTab === 'articulo' && modoArticulo.articuloSeleccionado ? (
            <div className="detalle-traspaso">
              <div className="detalle-item">
                <span>Artículo:</span>
                <span>
                  {modoArticulo.articuloSeleccionado.DescripcionArticulo} 
                  ({modoArticulo.articuloSeleccionado.CodigoArticulo})
                </span>
              </div>
              
              <div className="detalle-item">
                <span>Origen:</span>
                <span>
                  {getNombreAlmacen(modoArticulo.form.origenAlmacen)} - 
                  {getDescripcionUbicacion(modoArticulo.form.origenAlmacen, modoArticulo.form.origenUbicacion)}
                </span>
              </div>
              
              <div className="detalle-item">
                <span>Destino:</span>
                <span>
                  {getNombreAlmacen(modoArticulo.form.destinoAlmacen)} - 
                  {getDescripcionUbicacion(modoArticulo.form.destinoAlmacen, modoArticulo.form.destinoUbicacion)}
                </span>
              </div>
              
              <div className="detalle-item">
                <span>Cantidad:</span>
                <span>
                  {modoArticulo.form.cantidad} {modoArticulo.form.unidadMedidaOrigen}
                  {modoArticulo.form.factorConversion && modoArticulo.form.factorConversion !== 1 && (
                    <span> (Equivale a {modoArticulo.form.cantidad * modoArticulo.form.factorConversion} metros)</span>
                  )}
                </span>
              </div>
              
              <div className="acciones-verificacion">
                <button className="btn-editar" onClick={() => setActiveSection('movimientos')}>
                  Editar
                </button>
                
                <button 
                  className="btn-confirmar" 
                  onClick={confirmarTraspasos}
                  disabled={loading}
                >
                  {loading ? 'Confirmando...' : 'Confirmar Traspaso'}
                </button>
                
                <button className="btn-cancelar" onClick={() => setActiveSection('movimientos')}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : activeTab === 'ubicacion' && traspasosPendientes.length > 0 ? (
            <div>
              <h3>Lista de Traspasos a Confirmar</h3>
              {traspasosPendientes.map(traspaso => (
                <div key={traspaso.id} className="detalle-traspaso">
                  <div className="detalle-item">
                    <span>Artículo:</span>
                    <span>
                      {traspaso.articulo.DescripcionArticulo} 
                      ({traspaso.articulo.CodigoArticulo})
                    </span>
                  </div>
                  
                  <div className="detalle-item">
                    <span>Origen:</span>
                    <span>
                      {traspaso.origen.nombreAlmacen} - 
                      {traspaso.origen.descripcion}
                    </span>
                  </div>
                  
                  <div className="detalle-item">
                    <span>Destino:</span>
                    <span>
                      {getNombreAlmacen(traspaso.destino.almacen)} - 
                      {getDescripcionUbicacion(traspaso.destino.almacen, traspaso.destino.ubicacion)}
                    </span>
                  </div>
                  
                  <div className="detalle-item">
                    <span>Cantidad:</span>
                    <span>
                      {traspaso.cantidad} {traspaso.unidadMedida}
                      {traspaso.factorConversion && traspaso.factorConversion !== 1 && (
                        <span> (Equivale a {traspaso.cantidad * traspaso.factorConversion} {traspaso.articulo.UnidadBase})</span>
                      )}
                    </span>
                  </div>
                </div>
              ))}
              
              <div className="acciones-verificacion">
                <button className="btn-editar" onClick={() => setActiveSection('movimientos')}>
                  Editar
                </button>
                
                <button 
                  className="btn-confirmar" 
                  onClick={confirmarTraspasos}
                  disabled={loading}
                >
                  {loading ? 'Confirmando...' : 'Confirmar Traspasos'}
                </button>
                
                <button className="btn-cancelar" onClick={() => setActiveSection('movimientos')}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="sin-traspaso">
              No hay traspasos pendientes de verificación
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
                      {item.UnidadMedidaOrigen && ` ${item.UnidadMedidaOrigen}`}
                      {item.FactorConversion_ && item.FactorConversion_ !== 1 && (
                        <span> ({formatCantidad(item.Cantidad * item.FactorConversion_)} metros)</span>
                      )}
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