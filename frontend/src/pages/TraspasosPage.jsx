import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import { v4 as uuidv4 } from 'uuid';
import '../styles/TraspasosPage.css';

const TraspasosPage = () => {
  const [activeSection, setActiveSection] = useState('traspasos');
  const [activeTab, setActiveTab] = useState('articulo');
  const [loading, setLoading] = useState(false);
  const [almacenes, setAlmacenes] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [traspasosPendientes, setTraspasosPendientes] = useState([]);
  
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  
  const [articulosConStock, setArticulosConStock] = useState([]);
  const [pagination, setPagination] = useState({ 
    page: 1, 
    pageSize: 15,
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
  const [unidadMedida, setUnidadMedida] = useState('');
  const [partida, setPartida] = useState('');
  const [allArticulosLoaded, setAllArticulosLoaded] = useState(false);
  const [ubicacionesAgrupadas, setUbicacionesAgrupadas] = useState([]);
  const [ubicacionesFiltradas, setUbicacionesFiltradas] = useState([]);
  const [almacenExpandido, setAlmacenExpandido] = useState(null);
  const [ubicacionSeleccionada, setUbicacionSeleccionada] = useState(null);
  const [articulosUbicacion, setArticulosUbicacion] = useState([]);
  const [paginationUbicacion, setPaginationUbicacion] = useState({ 
    page: 1, 
    pageSize: 15,
    total: 0 
  });
  const [articuloUbicacionSeleccionado, setArticuloUbicacionSeleccionado] = useState(null);
  const [vistaUbicacion, setVistaUbicacion] = useState('seleccion');
  const [grupoUnicoOrigen, setGrupoUnicoOrigen] = useState('');
  const [busquedaUbicacion, setBusquedaUbicacion] = useState('');
  const [tallaOrigen, setTallaOrigen] = useState('');
  const [colorOrigen, setColorOrigen] = useState('');
  const [stockDisponibleInfo, setStockDisponibleInfo] = useState('');
  const [tipoUnidadMedida, setTipoUnidadMedida] = useState('');
  
  const searchTimer = useRef(null);
  const searchRef = useRef(null);
  const listaRef = useRef(null);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (terminoBusqueda.trim().length > 2) {
        buscarArticulos(terminoBusqueda);
      } else {
        setResultadosBusqueda([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [terminoBusqueda]);

  const buscarArticulos = async (termino) => {
    try {
      const headers = getAuthHeader();
      const response = await axios.get('http://localhost:3000/buscar-articulos', {
        headers,
        params: { termino }
      });
      setResultadosBusqueda(response.data);
    } catch (error) {
      console.error('Error buscando artículos:', error);
    }
  };

  useEffect(() => {
    const cargarDatosIniciales = async () => {
      try {
        const headers = getAuthHeader();
        const resAlmacenes = await axios.get('http://localhost:3000/almacenes', { headers });
        setAlmacenes(resAlmacenes.data);
        
        const resUbicaciones = await axios.get('http://localhost:3000/ubicaciones-agrupadas', { headers });
        setUbicacionesAgrupadas(resUbicaciones.data);
        setUbicacionesFiltradas(resUbicaciones.data);
      } catch (error) {
        console.error('Error cargando datos iniciales:', error);
        alert(`Error cargando datos iniciales: ${error.response?.data?.mensaje || error.message}`);
      }
    };
    
    cargarDatosIniciales();
    
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setMostrarResultados(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (busquedaUbicacion.trim() === '') {
      setUbicacionesFiltradas(ubicacionesAgrupadas);
      return;
    }
    
    const termino = busquedaUbicacion.toLowerCase();
    const filtradas = ubicacionesAgrupadas.map(almacen => ({
      ...almacen,
      ubicaciones: almacen.ubicaciones.filter(ubicacion => 
        ubicacion.codigo.toLowerCase().includes(termino)
      )
    })).filter(almacen => almacen.ubicaciones.length > 0);
    
    setUbicacionesFiltradas(filtradas);
  }, [busquedaUbicacion, ubicacionesAgrupadas]);

  const cargarArticulosConStock = async (page = 1, search = '', append = false) => {
    setLoadingArticulos(true);
    try {
      const headers = getAuthHeader();
      const response = await axios.get('http://localhost:3000/stock/articulos-con-stock', {
        headers,
        params: {
          page,
          pageSize: pagination.pageSize,
          searchTerm: search
        }
      });
      
      if (append) {
        setArticulosConStock(prev => [...prev, ...response.data.articulos]);
      } else {
        setArticulosConStock(response.data.articulos);
      }
      
      setPagination(response.data.pagination);
      setAllArticulosLoaded(page >= response.data.pagination.totalPages);
    } catch (error) {
      console.error('Error cargando artículos con stock:', error);
      setArticulosConStock([]);
      alert(`Error cargando artículos: ${error.response?.data?.mensaje || error.message}`);
    } finally {
      setLoadingArticulos(false);
    }
  };

  const handleScrollLista = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const isNearBottom = scrollHeight - scrollTop <= clientHeight * 1.2;
    
    if (isNearBottom && !loadingArticulos && !allArticulosLoaded) {
      cargarArticulosConStock(pagination.page + 1, terminoBusqueda, true);
    }
  };

  useEffect(() => {
    const cargarStock = async () => {
      if (!articuloSeleccionado) return;
      
      try {
        const headers = getAuthHeader();
        const response = await axios.get(
          `http://localhost:3000/stock/por-articulo?codigoArticulo=${articuloSeleccionado.CodigoArticulo}`,
          { headers }
        );
        
        const stockNormalizado = response.data.map(item => ({
          ...item,
          UnidadMedida: item.UnidadMedida || 'unidades',
          TipoUnidadMedida_: item.TipoUnidadMedida_ || item.UnidadMedida || 'unidades'
        }));
        
        setStockDisponible(stockNormalizado);
        
        if (stockNormalizado.length > 0) {
          const almacenConMasStock = stockNormalizado.reduce((max, item) => 
            item.Cantidad > max.Cantidad ? item : max
          );
          
          setAlmacenOrigen(almacenConMasStock.CodigoAlmacen);
          setUbicacionOrigen(almacenConMasStock.Ubicacion);
          setUnidadMedida(almacenConMasStock.UnidadMedida);
          setTipoUnidadMedida(almacenConMasStock.TipoUnidadMedida_);
          setPartida(almacenConMasStock.Partida || '');
          setTallaOrigen(almacenConMasStock.Talla || '');
          setColorOrigen(almacenConMasStock.CodigoColor_ || '');
          setStockDisponibleInfo(`${almacenConMasStock.Cantidad} ${almacenConMasStock.UnidadMedida}`);
        }
      } catch (error) {
        console.error('Error cargando stock:', error);
        setStockDisponible([]);
        alert(`Error cargando stock: ${error.response?.data?.mensaje || error.message}`);
      }
    };
    
    cargarStock();
  }, [articuloSeleccionado]);

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
      
      // Asegurarse de que todos los artículos tengan TipoUnidadMedida_
      const articulosConTipoUnidad = response.data.articulos.map(articulo => ({
        ...articulo,
        TipoUnidadMedida_: articulo.TipoUnidadMedida_ || articulo.UnidadMedida || 'unidades'
      }));
      
      setArticulosUbicacion(articulosConTipoUnidad);
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
      alert(`Error cargando artículos: ${error.response?.data?.mensaje || error.message}`);
    }
  }, [paginationUbicacion.pageSize]);

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
      alert(`Error cargando ubicaciones: ${error.response?.data?.mensaje || error.message}`);
    }
  }, [almacenDestino]);

  useEffect(() => {
    cargarUbicacionesDestino();
  }, [almacenDestino, cargarUbicacionesDestino]);

  const cargarHistorial = useCallback(async () => {
    try {
      const headers = getAuthHeader();
      const response = await axios.get('http://localhost:3000/historial-traspasos', { headers });
      setHistorial(response.data);
    } catch (error) {
      console.error('Error cargando historial:', error);
      alert(`Error cargando historial: ${error.response?.data?.mensaje || error.message}`);
    }
  }, []);

  const seleccionarArticulo = (articulo) => {
    setArticuloSeleccionado(articulo);
    setTerminoBusqueda('');
    setMostrarResultados(false);
    setAllArticulosLoaded(false);
  };

  const cambiarAlmacenOrigen = (codigoAlmacen) => {
    setAlmacenOrigen(codigoAlmacen);
    setUbicacionOrigen('');
    setUnidadMedida('');
    setTipoUnidadMedida('');
    setPartida('');
    setTallaOrigen('');
    setColorOrigen('');
    setStockDisponibleInfo('');
    
    const ubicacionesEnAlmacen = stockDisponible.filter(
      item => item.CodigoAlmacen === codigoAlmacen
    );
    
    if (ubicacionesEnAlmacen.length > 0) {
      const ubicacionConMasStock = ubicacionesEnAlmacen.reduce((max, item) => 
        item.Cantidad > max.Cantidad ? item : max
      );
      
      setUbicacionOrigen(ubicacionConMasStock.Ubicacion);
      setUnidadMedida(ubicacionConMasStock.UnidadMedida);
      setTipoUnidadMedida(ubicacionConMasStock.TipoUnidadMedida_);
      setPartida(ubicacionConMasStock.Partida || '');
      setTallaOrigen(ubicacionConMasStock.Talla || '');
      setColorOrigen(ubicacionConMasStock.CodigoColor_ || '');
      setStockDisponibleInfo(`${ubicacionConMasStock.Cantidad} ${ubicacionConMasStock.UnidadMedida}`);
    }
  };

  const seleccionarUbicacionOrigen = (item) => {
    setUbicacionOrigen(item.Ubicacion);
    setUnidadMedida(item.UnidadMedida);
    setTipoUnidadMedida(item.TipoUnidadMedida_);
    setPartida(item.Partida || '');
    setTallaOrigen(item.Talla || '');
    setColorOrigen(item.CodigoColor_ || '');
    setGrupoUnicoOrigen(item.GrupoUnico);
    setStockDisponibleInfo(`${item.Cantidad} ${item.UnidadMedida}`);
    cargarUbicacionesDestino(item.Ubicacion);
  };

  const handleCantidadChange = (e) => {
    const value = e.target.value;
    if (/^\d*\.?\d*$/.test(value)) {
      setCantidad(value);
      
      if (articuloSeleccionado && stockDisponible.length > 0) {
        const stockItem = stockDisponible.find(
          item => item.CodigoAlmacen === almacenOrigen && 
                  item.Ubicacion === ubicacionOrigen &&
                  item.TipoUnidadMedida_ === tipoUnidadMedida &&
                  item.Partida === partida &&
                  item.Talla === tallaOrigen &&
                  item.CodigoColor_ === colorOrigen
        );
        
        if (stockItem && parseFloat(value) > stockItem.Cantidad) {
          setCantidad(stockItem.Cantidad.toString());
        }
      }
    }
  };

  const agregarTraspasoArticulo = () => {
    const cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum)) {
      alert('La cantidad debe ser un número');
      return;
    }
    
    if (cantidadNum <= 0) {
      alert('La cantidad debe ser un número positivo');
      return;
    }

    if (!unidadMedida) {
      alert('Debe seleccionar una unidad de medida');
      return;
    }

    if (!articuloSeleccionado || !almacenOrigen || !ubicacionOrigen || !almacenDestino || !ubicacionDestino || !cantidad) {
      alert('Complete todos los campos');
      return;
    }
    
    const stockItem = stockDisponible.find(
      item => item.CodigoAlmacen === almacenOrigen && 
              item.Ubicacion === ubicacionOrigen &&
              item.TipoUnidadMedida_ === tipoUnidadMedida &&
              (item.Partida || '') === partida &&
              item.Talla === tallaOrigen &&
              item.CodigoColor_ === colorOrigen
    );
    
    if (!stockItem || cantidadNum > stockItem.Cantidad) {
      alert(`Cantidad supera el stock disponible (${stockItem?.Cantidad || 0})`);
      return;
    }
    
    const nuevoTraspaso = {
      id: uuidv4(),
      articulo: {
        ...articuloSeleccionado,
        unidadMedida: unidadMedida,
        tipoUnidadMedida: tipoUnidadMedida,
        partida: partida,
        talla: tallaOrigen,
        color: colorOrigen,
        nombreColor: stockItem?.NombreColor || ''
      },
      origen: {
        almacen: almacenOrigen,
        ubicacion: ubicacionOrigen,
        grupoUnico: grupoUnicoOrigen,
        tipoUnidadMedida: tipoUnidadMedida
      },
      destino: {
        almacen: almacenDestino,
        ubicacion: ubicacionDestino
      },
      cantidad: cantidadNum,
      unidadMedida: unidadMedida,
      tipoUnidadMedida: tipoUnidadMedida,
      partida: partida,
      talla: tallaOrigen,
      color: colorOrigen
    };
    
    setTraspasosPendientes(prev => [...prev, nuevoTraspaso]);
    
    setArticuloSeleccionado(null);
    setTerminoBusqueda('');
    setCantidad('');
    setStockDisponibleInfo('');
  };

  const agregarTraspasoUbicacion = () => {
    const cantidadNum = parseFloat(cantidad);
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
        unidadMedida: articuloUbicacionSeleccionado.UnidadMedida || 'unidades',
        tipoUnidadMedida: articuloUbicacionSeleccionado.TipoUnidadMedida_ || articuloUbicacionSeleccionado.UnidadMedida || 'unidades',
        partida: articuloUbicacionSeleccionado.Partida || '',
        talla: articuloUbicacionSeleccionado.Talla || '',
        color: articuloUbicacionSeleccionado.CodigoColor_ || '',
        nombreColor: articuloUbicacionSeleccionado.NombreColor || ''
      },
      origen: {
        almacen: ubicacionSeleccionada.almacen,
        ubicacion: ubicacionSeleccionada.ubicacion,
        tipoUnidadMedida: articuloUbicacionSeleccionado.TipoUnidadMedida_ || articuloUbicacionSeleccionado.UnidadMedida || 'unidades'
      },
      destino: {
        almacen: almacenDestino,
        ubicacion: ubicacionDestino
      },
      cantidad: cantidadNum,
      unidadMedida: articuloUbicacionSeleccionado.UnidadMedida || 'unidades',
      tipoUnidadMedida: articuloUbicacionSeleccionado.TipoUnidadMedida_ || articuloUbicacionSeleccionado.UnidadMedida || 'unidades',
      partida: articuloUbicacionSeleccionado.Partida || '',
      talla: articuloUbicacionSeleccionado.Talla || '',
      color: articuloUbicacionSeleccionado.CodigoColor_ || ''
    };
    
    setTraspasosPendientes(prev => [...prev, nuevoTraspaso]);
    
    setArticuloUbicacionSeleccionado(null);
    setCantidad('');
  };

  const confirmarTraspasos = async () => {
    if (traspasosPendientes.length === 0) {
      alert('No hay traspasos para confirmar');
      return;
    }
    
    setLoading(true);
    
    try {
      const headers = getAuthHeader();
      const user = JSON.parse(localStorage.getItem('user'));
      const empresa = user?.CodigoEmpresa;
      const ejercicio = new Date().getFullYear();
      
      const traspasosValidados = traspasosPendientes.map(traspaso => {
        const cantidadEntera = parseFloat(Number(traspaso.cantidad));
        
        // Asegurarse de que los campos de variantes se envíen correctamente
        const partida = traspaso.partida || '';
        const talla = traspaso.talla || '';
        const color = traspaso.color || '';
        const tipoUnidadMedida = traspaso.tipoUnidadMedida || traspaso.unidadMedida || 'unidades';
        
        return {
          articulo: traspaso.articulo.CodigoArticulo,
          origenAlmacen: traspaso.origen.almacen,
          origenUbicacion: traspaso.origen.ubicacion,
          destinoAlmacen: traspaso.destino.almacen,
          destinoUbicacion: traspaso.destino.ubicacion,
          cantidad: cantidadEntera,
          unidadMedida: traspaso.unidadMedida || 'unidades',
          TipoUnidadMedida_: tipoUnidadMedida,
          partida: partida,
          grupoTalla: talla ? 1 : 0,
          codigoTalla: talla,
          codigoColor: color,
          codigoEmpresa: empresa,
          ejercicio: ejercicio,
          // Campos adicionales para mejor trazabilidad
          grupoUnicoOrigen: traspaso.origen.grupoUnico || '',
          descripcionArticulo: traspaso.articulo.DescripcionArticulo || ''
        };
      });

      console.log('Datos a enviar:', JSON.stringify(traspasosValidados, null, 2));

      // Enviar los traspasos uno por uno para mejor control de errores
      const resultados = [];
      for (const [index, traspaso] of traspasosValidados.entries()) {
        try {
          const response = await axios.post('http://localhost:3000/traspaso', traspaso, { headers });
          resultados.push({ success: true, data: response.data });
          console.log('Traspaso realizado:', response.data);
        } catch (err) {
          console.error('Error en traspaso individual:', err.response?.data || err.message);
          resultados.push({ 
            success: false, 
            error: err.response?.data?.mensaje || err.response?.data?.error || err.message,
            articulo: traspaso.articulo,
            origen: {
              almacen: traspaso.origenAlmacen,
              ubicacion: traspaso.origenUbicacion
            },
            traspasoIndex: index
          });
        }
      }

      // Verificar si hubo errores
      const traspasosFallidos = resultados.filter(r => !r.success);
      if (traspasosFallidos.length > 0) {
        const mensajeError = traspasosFallidos.map(t => 
          `Artículo: ${t.articulo} - Origen: ${t.origen.almacen}/${t.origen.ubicacion}\nError: ${t.error}`
        ).join('\n\n');
        
        alert(`Algunos traspasos fallaron:\n\n${mensajeError}`);
        
        // Mantener solo los traspasos fallados en la lista de pendientes
        const indicesFallados = traspasosFallidos.map(t => t.traspasoIndex);
        setTraspasosPendientes(prev => prev.filter((_, index) => indicesFallados.includes(index)));
      } else {
        alert('Todos los traspasos realizados correctamente');
        setTraspasosPendientes([]);
      }

      await cargarHistorial();
      setActiveSection('historial');
    } catch (err) {
      console.error('Error confirmando traspasos:', err);
      
      let errorMsg = 'Error al realizar traspasos';
      if (err.response?.data) {
        errorMsg += `: ${err.response.data.mensaje || 'Error desconocido'}`;
        if (err.response.data.error) {
          errorMsg += ` (${err.response.data.error})`;
          if (err.response.data.error.includes('stock')) {
            errorMsg += '\nVerifique que el stock existe en la ubicación de origen';
          }
        }
      } else if (err.message) {
        errorMsg += `: ${err.message}`;
      }
      
      alert(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const getNombreAlmacen = (codigo) => {
    const almacen = almacenes.find(a => a.CodigoAlmacen === codigo);
    return almacen ? `${almacen.Almacen} (${codigo})` : codigo;
  };

  const formatFecha = (fechaStr) => {
    if (!fechaStr) return 'Fecha no disponible';
    
    try {
      if (typeof fechaStr === 'string' && fechaStr.includes('/')) {
        return fechaStr;
      }
      
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
      
      return fechaStr;
    } catch (e) {
      console.error('Error formateando fecha:', e);
      return fechaStr;
    }
  };

  const formatCantidad = (valor) => {
    const num = parseFloat(valor);
    return isNaN(num) ? '0' : num.toLocaleString('es-ES', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  const formatUnidadMedida = (unidad) => {
    return unidad || 'unidades';
  };

  const getColorStyle = (colorCode) => {
    const colorMap = {
      'A': { color: '#1E88E5', fontWeight: 'bold' },
      'V': { color: '#43A047', fontWeight: 'bold' },
      'R': { color: '#E53935', fontWeight: 'bold' },
      'N': { color: '#000000', fontWeight: 'bold' },
      'B': { color: '#FFFFFF', backgroundColor: '#333', padding: '2px 5px', borderRadius: '3px' },
    };
    return colorMap[colorCode] || {};
  };

  const formatTallaColor = (talla, colorCode) => {
    if (!talla && !colorCode) return null;
    let display = '';
    if (talla) display += talla;
    if (colorCode) display += colorCode;
    return display;
  };

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
                      value={terminoBusqueda}
                      onChange={(e) => {
                        setTerminoBusqueda(e.target.value);
                        setMostrarResultados(true);
                      }}
                      onFocus={() => setMostrarResultados(true)}
                      placeholder="Código or descripción..."
                      className="search-input"
                    />
                    
                    {mostrarResultados && resultadosBusqueda.length > 0 && (
                      <div 
                        className="resultados-busqueda"
                        ref={listaRef}
                      >
                        {resultadosBusqueda.map((articulo) => (
                          <div 
                            key={`${articulo.CodigoArticulo}-${articulo.DescripcionArticulo}`}
                            className="resultado-item"
                            onClick={() => seleccionarArticulo(articulo)}
                          >
                            <div className="articulo-codigo">{articulo.CodigoArticulo}</div>
                            <div className="articulo-descripcion">{articulo.DescripcionArticulo}</div>
                          </div>
                        ))}
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
                      <label>Ubicación y Variantes:</label>
                      <select 
                        className="form-control-enhanced"
                        value={`${ubicacionOrigen}-${tipoUnidadMedida}-${partida}-${tallaOrigen}-${colorOrigen}`}
                        onChange={(e) => {
                          const selectedOption = e.target.options[e.target.selectedIndex];
                          const itemId = selectedOption.getAttribute('data-item-id');
                          if (itemId) {
                            const item = stockDisponible.find(i => i.GrupoUnico === itemId);
                            if (item) {
                              seleccionarUbicacionOrigen(item);
                            }
                          }
                        }}
                        required
                        disabled={!almacenOrigen}
                      >
                        <option value="">Seleccionar ubicación y variante</option>
                        {stockDisponible
                          .filter(item => item.CodigoAlmacen === almacenOrigen)
                          .map((item) => {
                            const tallaColor = item.Talla && item.CodigoColor_ 
                              ? `${item.Talla}${item.CodigoColor_}` 
                              : '';
                            
                            return (
                              <option 
                                key={item.GrupoUnico} 
                                value={`${item.Ubicacion}-${item.TipoUnidadMedida_}-${item.Partida || ''}-${item.Talla || ''}-${item.CodigoColor_ || ''}`}
                                data-item-id={item.GrupoUnico}
                              >
                                {item.Ubicacion} - 
                                {tallaColor && ` ${tallaColor} -`}
                                {formatCantidad(item.Cantidad)} {item.UnidadMedida}
                                {item.Partida && ` (Lote: ${item.Partida})`}
                                {item.TipoUnidadMedida_ && item.TipoUnidadMedida_ !== item.UnidadMedida && ` [${item.TipoUnidadMedida_}]`}
                              </option>
                            );
                          })}
                      </select>
                    </div>
                    
                    {ubicacionOrigen && (
                      <div className="unidad-info">
                        <strong>Unidad seleccionada:</strong> {formatUnidadMedida(unidadMedida)}
                        {tipoUnidadMedida && tipoUnidadMedida !== unidadMedida && <span> ({tipoUnidadMedida})</span>}
                        {partida && <span>, <strong>Lote:</strong> {partida}</span>}
                        {(tallaOrigen || colorOrigen) && (
                          <span>, <strong>Talla/Color:</strong> 
                            <span 
                              className="talla-color-display"
                              style={getColorStyle(colorOrigen)}
                            >
                              {tallaOrigen}{colorOrigen}
                            </span>
                          </span>
                        )}
                        {stockDisponibleInfo && (
                          <div className="stock-disponible-info">
                            <strong>Stock disponible:</strong> {stockDisponibleInfo}
                          </div>
                        )}
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
                        step="any"
                      />
                      {stockDisponibleInfo && (
                        <div className="stock-info">
                          <strong>Stock disponible:</strong> {stockDisponibleInfo}
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
                  
                  <div className="form-control-group">
                    <label>Buscar ubicación:</label>
                    <input
                      type="text"
                      value={busquedaUbicacion}
                      onChange={(e) => setBusquedaUbicacion(e.target.value)}
                      placeholder="Escriba el código de ubicación..."
                      className="search-input"
                    />
                  </div>
                  
                  <div className="ubicaciones-agrupadas">
                    {ubicacionesFiltradas.map(almacen => (
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
                    
                    {ubicacionesFiltradas.length === 0 && (
                      <div className="no-results">No se encontraron ubicaciones</div>
                    )}
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
                              <th>Tipo Unidad</th>
                              <th>Talla y Color</th>
                              <th>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {articulosUbicacion.map((articulo) => {
                              const uniqueKey = [
                                articulo.CodigoArticulo,
                                ubicacionSeleccionada.ubicacion,
                                articulo.TipoUnidadMedida_,
                                articulo.Partida || '',
                                articulo.Talla || '',
                                articulo.CodigoColor_ || ''
                              ].join('|');
                              
                              const tallaColor = formatTallaColor(articulo.Talla, articulo.CodigoColor_);
                              
                              return (
                                <tr 
                                  key={uniqueKey}
                                  className={
                                    articuloUbicacionSeleccionado?.uniqueKey === uniqueKey 
                                      ? 'seleccionado' 
                                      : ''
                                  }
                                  onClick={() => setArticuloUbicacionSeleccionado({
                                    ...articulo,
                                    uniqueKey,
                                    tallaColorDisplay: tallaColor
                                  })}
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
                                  <td>{articulo.TipoUnidadMedida_ || 'unidades'}</td>
                                  <td>
                                    {tallaColor && (
                                      <span 
                                        className="talla-color-display"
                                        style={getColorStyle(articulo.CodigoColor_)}
                                      >
                                        {tallaColor}
                                      </span>
                                    )}
                                    {articulo.NombreColor && (
                                      <div className="nombre-color">
                                        {articulo.NombreColor}
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    <button className="btn-seleccionar">Seleccionar</button>
                                  </td>
                                </tr>
                              );
                            })}
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
                        {articuloUbicacionSeleccionado.TipoUnidadMedida_ && articuloUbicacionSeleccionado.TipoUnidadMedida_ !== articuloUbicacionSeleccionado.UnidadMedida && 
                          <span> ({articuloUbicacionSeleccionado.TipoUnidadMedida_})</span>
                        }
                        {articuloUbicacionSeleccionado.Partida && <span>, <strong>Lote:</strong> {articuloUbicacionSeleccionado.Partida}</span>}
                      </div>
                      
                      <div className="variantes-detalle">
                        {articuloUbicacionSeleccionado.tallaColorDisplay && (
                          <div>
                            <strong>Talla/Color:</strong> 
                            <span 
                              style={getColorStyle(articuloUbicacionSeleccionado.CodigoColor_)}
                              className="talla-color-display"
                            >
                              {articuloUbicacionSeleccionado.tallaColorDisplay}
                            </span>
                          </div>
                        )}
                        
                        {articuloUbicacionSeleccionado.NombreColor && (
                          <div>
                            <strong>Nombre Color:</strong> 
                            {articuloUbicacionSeleccionado.NombreColor}
                          </div>
                        )}
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
                        step="any"
                        max={articuloUbicacionSeleccionado.Cantidad}
                      />
                      <div className="stock-info">
                        <strong>Stock disponible:</strong> {formatCantidad(articuloUbicacionSeleccionado.Cantidad)} {formatUnidadMedida(articuloUbicacionSeleccionado.UnidadMedida)}
                        {articuloUbicacionSeleccionado.TipoUnidadMedida_ && articuloUbicacionSeleccionado.TipoUnidadMedida_ !== articuloUbicacionSeleccionado.UnidadMedida && 
                          <span> ({articuloUbicacionSeleccionado.TipoUnidadMedida_})</span>
                        }
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
          <h2>Traspasos Pendientes de Confirmación</h2>
          
          {traspasosPendientes.length === 0 ? (
            <div className="sin-traspasos">No hay traspasos pendientes</div>
          ) : (
            <>
              <div className="responsive-table-container">
                <table className="tabla-verificacion">
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th>Origen</th>
                      <th>Destino</th>
                      <th>Cantidad</th>
                      <th>Variantes</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traspasosPendientes.map(traspaso => (
                      <tr key={traspaso.id}>
                        <td>
                          <div className="articulo-info">
                            <strong>{traspaso.articulo.CodigoArticulo}</strong>
                            <div>{traspaso.articulo.DescripcionArticulo}</div>
                          </div>
                        </td>
                        <td>
                          {getNombreAlmacen(traspaso.origen.almacen)}
                          <br />{traspaso.origen.ubicacion}
                        </td>
                        <td>
                          {getNombreAlmacen(traspaso.destino.almacen)}
                          <br />{traspaso.destino.ubicacion}
                        </td>
                        <td className="cantidad-td">
                          {formatCantidad(traspaso.cantidad)}
                          <br />
                          <span className="unidad-medida">
                            {formatUnidadMedida(traspaso.unidadMedida)}
                            {traspaso.tipoUnidadMedida && traspaso.tipoUnidadMedida !== traspaso.unidadMedida && 
                              <span> ({traspaso.tipoUnidadMedida})</span>
                            }
                          </span>
                        </td>
                        <td>
                          <div className="variantes-info">
                            {traspaso.partida && <div><strong>Lote:</strong> {traspaso.partida}</div>}
                            {(traspaso.talla || traspaso.color) && (
                              <div>
                                <strong>Talla/Color:</strong> 
                                <span 
                                  className="talla-color-display"
                                  style={getColorStyle(traspaso.color)}
                                >
                                  {traspaso.talla}{traspaso.color}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <button 
                            className="btn-eliminar"
                            onClick={() => setTraspasosPendientes(
                              traspasosPendientes.filter(item => item.id !== traspaso.id)
                            )}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="acciones-verificacion">
                <button 
                  className="btn-confirmar" 
                  onClick={confirmarTraspasos}
                  disabled={loading}
                >
                  {loading ? 'Confirmando...' : 'Confirmar Todos los Traspasos'}
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
            <div className="sin-historial">No hay traspasos registrados</div>
          ) : (
            <div className="responsive-table-container">
              <table className="tabla-historial">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Artículo</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    <th>Cantidad</th>
                    <th>Variantes</th>
                    <th>Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((item, index) => {
                    const usuario = item.Comentario?.split(': ')[1] || 'Desconocido';
                    const tallaColor = item.CodigoTalla01_ && item.CodigoColor_ 
                      ? `${item.CodigoTalla01_}${item.CodigoColor_}` 
                      : '';
                    
                    return (
                      <tr key={`${item.FechaRegistro}-${index}-${item.CodigoArticulo}`}>
                        <td>{item.FechaFormateada || formatFecha(item.FechaRegistro)}</td>
                        <td>
                          <strong>{item.CodigoArticulo}</strong>
                          <div>{item.DescripcionArticulo}</div>
                        </td>
                        <td>
                          {item.OrigenAlmacen}<br />
                          {item.OrigenUbicacion}
                        </td>
                        <td>
                          {item.DestinoAlmacen}<br />
                          {item.DestinoUbicacion}
                        </td>
                        <td>
                          {formatCantidad(item.Cantidad)}
                          <div className="unidad-lote">
                            {formatUnidadMedida(item.UnidadMedida1_)}
                            {item.TipoUnidadMedida_ && item.TipoUnidadMedida_ !== item.UnidadMedida1_ && 
                              <span> ({item.TipoUnidadMedida_})</span>
                            }
                          </div>
                        </td>
                        <td>
                          <div className="variantes-info">
                            {item.Partida && <div><strong>Lote:</strong> {item.Partida}</div>}
                            {tallaColor && (
                              <div>
                                <strong>Talla/Color:</strong> 
                                <span 
                                  className="talla-color-display"
                                  style={getColorStyle(item.CodigoColor_)}
                                >
                                  {tallaColor}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td>{usuario}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TraspasosPage;