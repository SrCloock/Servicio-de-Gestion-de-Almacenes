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
  const [almacenesExpandidos, setAlmacenesExpandidos] = useState({});
  const [ubicacionesCargadas, setUbicacionesCargadas] = useState({});
  const [cargandoBusquedaUbicacion, setCargandoBusquedaUbicacion] = useState(false);
  const [ubicacionesBuscadas, setUbicacionesBuscadas] = useState([]);

  const searchTimer = useRef(null);
  const searchRef = useRef(null);
  const listaRef = useRef(null);

  // 🔥 MISMAS FUNCIONES DE FORMATEO QUE INVENTARIO
  const formatearUnidad = (cantidad, unidad) => {
    let cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum)) {
      cantidadNum = 0;
    }
    
    const esNegativo = cantidadNum < 0;
    const cantidadAbs = Math.abs(cantidadNum);
    
    if (!unidad || unidad.trim() === '') {
      unidad = 'unidad';
    }
    
    let cantidadFormateada = cantidadAbs;
    if (!Number.isInteger(cantidadAbs)) {
      cantidadFormateada = parseFloat(cantidadAbs.toFixed(2));
    }

    const unidadesInvariables = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3', 'barra', 'metro'];
    
    const unidadLower = unidad.toLowerCase();
    
    if (unidadesInvariables.includes(unidadLower)) {
      return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidad}`;
    }
    
    const pluralesIrregulares = {
      'ud': 'uds',
      'par': 'pares',
      'metro': 'metros',
      'pack': 'packs',
      'saco': 'sacos',
      'barra': 'barras',
      'caja': 'cajas',
      'rollo': 'rollos',
      'lata': 'latas',
      'bote': 'botes',
      'tubo': 'tubos',
      'unidad': 'unidades',
      'juego': 'juegos',
      'kit': 'kits',
      'paquete': 'paquetes'
    };

    if (cantidadFormateada === 1) {
      if (unidadLower === 'unidad' || unidadLower === 'unidades') {
        return `${esNegativo ? '-' : ''}1 unidad`;
      }
      return `${esNegativo ? '-' : ''}1 ${unidad}`;
    } else {
      if (unidadLower === 'unidad' || unidadLower === 'unidades') {
        return `${esNegativo ? '-' : ''}${cantidadFormateada} unidades`;
      }
      
      if (pluralesIrregulares[unidadLower]) {
        return `${esNegativo ? '-' : ''}${cantidadFormateada} ${pluralesIrregulares[unidadLower]}`;
      }
      
      const ultimaLetra = unidad.charAt(unidad.length - 1);
      const penultimaLetra = unidad.charAt(unidad.length - 2);
      
      if (['a', 'e', 'i', 'o', 'u'].includes(ultimaLetra)) {
        return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidad}s`;
      } else {
        return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidad}es`;
      }
    }
  };

  const formatCantidad = (valor) => {
    const num = parseFloat(valor);
    return isNaN(num) ? '0' : num.toLocaleString('es-ES', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  // 🔥 CORRECCIÓN: Funciones para normalizar y mostrar unidad de medida
  const normalizarUnidadMedida = (unidad) => {
    // Si es 'unidades' o está vacío, enviar vacío (el backend lo espera así)
    if (!unidad || unidad === 'unidades' || unidad.trim() === '') {
      return '';
    }
    return unidad;
  };

  const mostrarUnidadMedida = (unidad) => {
    if (!unidad || unidad === '') {
      return 'unidades';
    }
    return unidad;
  };

  // Función mejorada para obtener nombre de almacén
  const getNombreAlmacen = (codigo) => {
    if (!codigo || codigo === 'undefined') return 'Almacén no disponible';
    if (codigo === 'SIN-UBICACION') return 'Stock Sin Ubicación';
    
    const almacen = almacenes.find(a => a.CodigoAlmacen === codigo);
    return almacen ? `${almacen.Almacen} (${codigo})` : `${codigo}`;
  };

  // Función para formatear ubicación
  const formatUbicacionDisplay = (ubicacion, esSinUbicacion) => {
    if (esSinUbicacion || ubicacion === 'SIN-UBICACION') {
      return 'Stock Sin Ubicación';
    }
    return ubicacion;
  };

  // Función corregida para cargar historial
  const cargarHistorial = useCallback(async () => {
    try {
      const headers = getAuthHeader();
      const response = await axios.get('http://localhost:3000/historial-traspasos', { 
        headers,
        params: { page: 1, pageSize: 50 }
      });
      
      if (response.data && response.data.success) {
        setHistorial(response.data.traspasos || []);
      } else {
        setHistorial([]);
      }
    } catch (error) {
      console.error('Error cargando historial:', error);
      
      let errorMsg = 'Error al cargar historial';
      if (error.response?.data?.mensaje) {
        errorMsg += `: ${error.response.data.mensaje}`;
      } else if (error.message) {
        errorMsg += `: ${error.message}`;
      }
      
      alert(errorMsg);
      setHistorial([]);
    }
  }, []);

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

  // Efecto para buscar ubicaciones
  useEffect(() => {
    const buscarUbicaciones = async () => {
      if (busquedaUbicacion.trim().length < 2) {
        setUbicacionesBuscadas([]);
        return;
      }

      setCargandoBusquedaUbicacion(true);
      try {
        const headers = getAuthHeader();
        const response = await axios.get(
          'http://localhost:3000/buscar-ubicaciones',
          {
            headers,
            params: { termino: busquedaUbicacion }
          }
        );
        
        const resultados = response.data;
        if (busquedaUbicacion.toUpperCase().includes('SIN') || 
            busquedaUbicacion.toUpperCase().includes('UBICACION')) {
          resultados.unshift({
            CodigoAlmacen: 'TODOS',
            NombreAlmacen: 'Stock Sin Ubicación',
            Ubicacion: 'SIN-UBICACION',
            DescripcionUbicacion: 'Stock sin ubicación asignada',
            CantidadArticulos: 'Varios'
          });
        }
        
        setUbicacionesBuscadas(resultados);
      } catch (error) {
        console.error('Error buscando ubicaciones:', error);
        setUbicacionesBuscadas([]);
      } finally {
        setCargandoBusquedaUbicacion(false);
      }
    };

    const delayDebounceFn = setTimeout(buscarUbicaciones, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [busquedaUbicacion]);

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

  // 🔥 CORRECCIÓN: Función mejorada para cargar stock usando el nuevo endpoint
  const cargarStock = async () => {
    if (!articuloSeleccionado) return;
    
    try {
      await cargarStockAlternativo();
    } catch (error) {
      console.error('Error cargando stock:', error);
      setStockDisponible([]);
      alert(`Error cargando stock: No se pudo obtener información del stock para este artículo`);
    }
  };

  // 🔥 CORRECCIÓN: Usar el nuevo endpoint específico para traspasos
  const cargarStockAlternativo = async () => {
    try {
      const headers = getAuthHeader();
      
      // 🔥 USAR EL NUEVO ENDPOINT ESPECÍFICO PARA TRASPASOS
      const response = await axios.get(
        `http://localhost:3000/traspasos/stock-por-articulo`,
        { 
          headers,
          params: { codigoArticulo: articuloSeleccionado.CodigoArticulo }
        }
      );
      
      const stockData = response.data;
      
      console.log('✅ [TRASPASOS] Datos de stock recibidos:', stockData);
      
      const stockNormalizado = stockData.map(item => ({
        CodigoAlmacen: item.CodigoAlmacen,
        NombreAlmacen: item.NombreAlmacen,
        Ubicacion: item.Ubicacion,
        DescripcionUbicacion: item.DescripcionUbicacion,
        Cantidad: item.Cantidad,
        UnidadMedida: item.UnidadStock,
        TipoUnidadMedida_: item.UnidadStock,
        Partida: item.Partida || '',
        CodigoColor_: item.CodigoColor_ || '',
        Talla: item.CodigoTalla01_ || '',
        EsSinUbicacion: item.EsSinUbicacion === 1 || item.TipoStock === 'SIN_UBICACION',
        GrupoUnico: item.ClaveUnica,
        // 🔥 INCLUIR INFORMACIÓN DE CONVERSIÓN PARA CONSISTENCIA
        UnidadBase: item.UnidadBase,
        UnidadAlternativa: item.UnidadAlternativa,
        FactorConversion: item.FactorConversion,
        CantidadBase: item.CantidadBase
      }));
      
      setStockDisponible(stockNormalizado);
      
      if (stockNormalizado.length > 0) {
        const almacenConMasStock = stockNormalizado.reduce((max, item) => 
          item.Cantidad > max.Cantidad ? item : max
        );
        
        setAlmacenOrigen(almacenConMasStock.CodigoAlmacen);
        setUbicacionOrigen(almacenConMasStock.Ubicacion);
        setUnidadMedida(almacenConMasStock.UnidadMedida);
        setTipoUnidadMedida(almacenConMasStock.UnidadMedida);
        setPartida(almacenConMasStock.Partida || '');
        setTallaOrigen(almacenConMasStock.Talla || '');
        setColorOrigen(almacenConMasStock.CodigoColor_ || '');
        setStockDisponibleInfo(`${almacenConMasStock.Cantidad} ${almacenConMasStock.UnidadMedida}`);
      }
    } catch (error) {
      console.error('❌ [TRASPASOS] Error cargando stock:', error);
      
      // 🔥 FALLBACK: Intentar con el método anterior si el nuevo falla
      try {
        console.log('🔄 [TRASPASOS] Intentando fallback con ubicacionesMultiples...');
        const headers = getAuthHeader();
        
        const response = await axios.post(
          'http://localhost:3000/ubicacionesMultiples',
          {
            articulos: [{ codigo: articuloSeleccionado.CodigoArticulo }]
          },
          { headers }
        );
        
        const stockData = response.data[articuloSeleccionado.CodigoArticulo] || [];
        
        const stockNormalizado = stockData.map(item => ({
          CodigoAlmacen: item.codigoAlmacen,
          NombreAlmacen: item.nombreAlmacen,
          Ubicacion: item.ubicacion,
          DescripcionUbicacion: item.descripcionUbicacion,
          Cantidad: item.unidadSaldo,
          UnidadMedida: item.unidadMedida || 'unidades',
          TipoUnidadMedida_: item.unidadMedida || 'unidades',
          Partida: item.partida || '',
          CodigoColor_: item.codigoColor || '',
          Talla: item.codigoTalla || '',
          EsSinUbicacion: false,
          GrupoUnico: `${item.codigoAlmacen}_${item.ubicacion}_${item.unidadMedida}_${item.partida || ''}_${item.codigoTalla || ''}_${item.codigoColor || ''}`
        }));
        
        setStockDisponible(stockNormalizado);
        
        if (stockNormalizado.length > 0) {
          const almacenConMasStock = stockNormalizado.reduce((max, item) => 
            item.Cantidad > max.Cantidad ? item : max
          );
          
          setAlmacenOrigen(almacenConMasStock.CodigoAlmacen);
          setUbicacionOrigen(almacenConMasStock.Ubicacion);
          setUnidadMedida(almacenConMasStock.UnidadMedida);
          setTipoUnidadMedida(almacenConMasStock.UnidadMedida);
          setPartida(almacenConMasStock.Partida || '');
          setTallaOrigen(almacenConMasStock.Talla || '');
          setColorOrigen(almacenConMasStock.CodigoColor_ || '');
          setStockDisponibleInfo(`${almacenConMasStock.Cantidad} ${almacenConMasStock.UnidadMedida}`);
        }
      } catch (fallbackError) {
        console.error('❌ [TRASPASOS] Error en fallback:', fallbackError);
        throw error;
      }
    }
  };

  useEffect(() => {
    if (articuloSeleccionado) {
      cargarStock();
    }
  }, [articuloSeleccionado]);

  const cargarUbicacionesConResiliencia = async (codigoAlmacen) => {
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/ubicaciones-por-almacen/${codigoAlmacen}`,
        { headers, timeout: 10000 }
      );
      return response.data;
    } catch (error) {
      console.warn(`No se pudieron cargar las ubicaciones para ${codigoAlmacen}, usando valor por defecto`);
      return [
        { 
          Ubicacion: 'SIN-UBICACION', 
          DescripcionUbicacion: 'Stock sin ubicación asignada',
          CantidadArticulos: 'Varios'
        }
      ];
    }
  };

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
        'http://localhost:3000/ubicaciones-completas',
        { 
          headers,
          params: {
            codigoAlmacen: almacenDestino,
            excluirUbicacion,
            incluirSinUbicacion: 'true'
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

  const toggleAlmacenExpandido = async (codigoAlmacen) => {
    if (almacenesExpandidos[codigoAlmacen]) {
      setAlmacenesExpandidos(prev => ({ ...prev, [codigoAlmacen]: false }));
      return;
    }

    if (!ubicacionesCargadas[codigoAlmacen]) {
      try {
        setLoading(true);
        const ubicacionesData = await cargarUbicacionesConResiliencia(codigoAlmacen);
        
        const ubicacionesConSinUbicacion = [
          { 
            Ubicacion: 'SIN-UBICACION', 
            DescripcionUbicacion: 'Stock sin ubicación asignada',
            CantidadArticulos: 'Varios'
          },
          ...ubicacionesData
        ];
        
        setUbicacionesCargadas(prev => ({
          ...prev,
          [codigoAlmacen]: ubicacionesConSinUbicacion
        }));
      } catch (error) {
        console.error('Error cargando ubicaciones:', error);
        setUbicacionesCargadas(prev => ({
          ...prev,
          [codigoAlmacen]: [
            { 
              Ubicacion: 'SIN-UBICACION', 
              DescripcionUbicacion: 'Stock sin ubicación asignada',
              CantidadArticulos: 'Varios'
            }
          ]
        }));
      } finally {
        setLoading(false);
      }
    }

    setAlmacenesExpandidos(prev => ({ ...prev, [codigoAlmacen]: true }));
  };

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
      setStockDisponibleInfo(`${almacenConMasStock.Cantidad} ${almacenConMasStock.UnidadMedida}`);
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

    // 🔥 CORRECCIÓN: No validar que unidadMedida esté lleno, ya que puede ser vacío para "unidades"
    // if (!unidadMedida) {
    //   alert('Debe seleccionar una unidad de medida');
    //   return;
    // }

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
    
    // 🔥 CORRECCIÓN: Normalizar unidad de medida para el backend
    const unidadMedidaNormalizada = normalizarUnidadMedida(unidadMedida);
    const tipoUnidadMedidaNormalizada = normalizarUnidadMedida(tipoUnidadMedida);
    
    const nuevoTraspaso = {
      id: uuidv4(),
      articulo: {
        ...articuloSeleccionado,
        unidadMedida: unidadMedidaNormalizada,
        tipoUnidadMedida: tipoUnidadMedidaNormalizada,
        partida: partida,
        talla: tallaOrigen,
        color: colorOrigen
      },
      origen: {
        almacen: almacenOrigen,
        ubicacion: ubicacionOrigen,
        grupoUnico: grupoUnicoOrigen,
        tipoUnidadMedida: tipoUnidadMedidaNormalizada,
        esSinUbicacion: stockItem?.EsSinUbicacion || false
      },
      destino: {
        almacen: almacenDestino,
        ubicacion: ubicacionDestino
      },
      cantidad: cantidadNum,
      unidadMedida: unidadMedidaNormalizada, // 🔥 Usar la versión normalizada
      tipoUnidadMedida: tipoUnidadMedidaNormalizada, // 🔥 Usar la versión normalizada
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
    
    // 🔥 CORRECCIÓN: Normalizar unidad de medida
    const unidadMedidaNormalizada = normalizarUnidadMedida(articuloUbicacionSeleccionado.UnidadMedida);
    const tipoUnidadMedidaNormalizada = normalizarUnidadMedida(articuloUbicacionSeleccionado.TipoUnidadMedida_);
    
    const nuevoTraspaso = {
      id: uuidv4(),
      articulo: {
        ...articuloUbicacionSeleccionado,
        unidadMedida: unidadMedidaNormalizada,
        tipoUnidadMedida: tipoUnidadMedidaNormalizada,
        partida: articuloUbicacionSeleccionado.Partida || '',
        talla: articuloUbicacionSeleccionado.Talla || '',
        color: articuloUbicacionSeleccionado.CodigoColor_ || ''
      },
      origen: {
        almacen: ubicacionSeleccionada.almacen,
        ubicacion: ubicacionSeleccionada.ubicacion,
        tipoUnidadMedida: tipoUnidadMedidaNormalizada,
        esSinUbicacion: ubicacionSeleccionada.ubicacion === 'SIN-UBICACION'
      },
      destino: {
        almacen: almacenDestino,
        ubicacion: ubicacionDestino
      },
      cantidad: cantidadNum,
      unidadMedida: unidadMedidaNormalizada, // 🔥 Usar versión normalizada
      tipoUnidadMedida: tipoUnidadMedidaNormalizada, // 🔥 Usar versión normalizada
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
        
        const partida = traspaso.partida || '';
        const talla = traspaso.talla || '';
        const color = traspaso.color || '';
        
        // 🔥 CORRECCIÓN: El backend ya normaliza 'unidades' a vacío, pero por consistencia
        // también normalizamos aquí
        const tipoUnidadMedida = normalizarUnidadMedida(traspaso.tipoUnidadMedida);
        
        const ubicacionOrigenFinal = traspaso.origen.esSinUbicacion ? 'SIN-UBICACION' : traspaso.origen.ubicacion;
        
        return {
          articulo: traspaso.articulo.CodigoArticulo,
          origenAlmacen: traspaso.origen.almacen,
          origenUbicacion: ubicacionOrigenFinal,
          destinoAlmacen: traspaso.destino.almacen,
          destinoUbicacion: traspaso.destino.ubicacion,
          cantidad: cantidadEntera,
          unidadMedida: tipoUnidadMedida, // 🔥 Ya normalizada
          partida: partida,
          grupoTalla: talla ? 1 : 0,
          codigoTalla: talla,
          codigoColor: color,
          codigoEmpresa: empresa,
          ejercicio: ejercicio,
          grupoUnicoOrigen: traspaso.origen.grupoUnico || '',
          descripcionArticulo: traspaso.articulo.DescripcionArticulo || '',
          esSinUbicacion: traspaso.origen.esSinUbicacion || false
        };
      });

      console.log('Datos a enviar:', JSON.stringify(traspasosValidados, null, 2));

      // Enviar los traspasos uno por uno
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

      const traspasosFallidos = resultados.filter(r => !r.success);
      if (traspasosFallidos.length > 0) {
        const mensajeError = traspasosFallidos.map(t => 
          `Artículo: ${t.articulo} - Origen: ${t.origen.almacen}/${t.origen.ubicacion}\nError: ${t.error}`
        ).join('\n\n');
        
        alert(`Algunos traspasos fallaron:\n\n${mensajeError}`);
        
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

  const formatUnidadMedida = (unidad) => {
    return mostrarUnidadMedida(unidad);
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
                          .map((item, index) => {
                            const tallaColor = formatTallaColor(item.Talla, item.CodigoColor_);
                            
                            const uniqueKey = `${item.GrupoUnico}_${index}`;
                            
                            // Texto mejorado para el selector
                            let optionText = '';
                            
                            if (item.EsSinUbicacion) {
                              optionText += '[SIN UBICACIÓN] ';
                            }
                            
                            optionText += formatUbicacionDisplay(item.Ubicacion, item.EsSinUbicacion);
                            
                            // Agregar Talla/Color de manera prominente
                            if (tallaColor) {
                              optionText += ` - Talla/Color: ${tallaColor}`;
                            }
                            
                            // 🔥 USAR EL MISMO FORMATEO QUE INVENTARIO
                            optionText += ` - ${formatearUnidad(item.Cantidad, item.UnidadMedida)}`;
                            
                            if (item.Partida) {
                              optionText += ` (Lote: ${item.Partida})`;
                            }
                            
                            return (
                              <option 
                                key={uniqueKey}
                                value={`${item.Ubicacion}-${item.TipoUnidadMedida_}-${item.Partida || ''}-${item.Talla || ''}-${item.CodigoColor_ || ''}`}
                                data-item-id={item.GrupoUnico}
                              >
                                {optionText}
                              </option>
                            );
                          })}
                      </select>
                    </div>
                    
                    {ubicacionOrigen && (
                      <div className="unidad-info">
                        <strong>Unidad seleccionada:</strong> {mostrarUnidadMedida(unidadMedida)}
                        {partida && <span>, <strong>Lote:</strong> {partida}</span>}
                        {(tallaOrigen || colorOrigen) && (
                          <span>, 
                            <strong>Talla/Color:</strong> 
                            <span 
                              className="talla-color-display destacado"
                              style={getColorStyle(colorOrigen)}
                            >
                              {tallaOrigen}{colorOrigen}
                            </span>
                          </span>
                        )}
                        {stockDisponibleInfo && (
                          <div className="stock-disponible-info">
                            <strong>Stock disponible:</strong> {stockDisponibleInfo}
                            {ubicacionOrigen === 'SIN-UBICACION' && (
                              <span className="sin-ubicacion-badge"> - Stock Sin Ubicación</span>
                            )}
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
                              {ubicacion.Ubicacion === 'SIN-UBICACION' ? '[SIN UBICACIÓN] ' : ''}
                              {formatUbicacionDisplay(ubicacion.Ubicacion, ubicacion.Ubicacion === 'SIN-UBICACION')}
                              {ubicacion.DescripcionUbicacion && ` - ${ubicacion.DescripcionUbicacion}`}
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
                    {cargandoBusquedaUbicacion && <div className="cargando">Buscando...</div>}
                  </div>
                  
                  {busquedaUbicacion ? (
                    <div className="resultados-busqueda-ubicacion">
                      {ubicacionesBuscadas.map(ubicacion => (
                        <div 
                          key={`${ubicacion.CodigoAlmacen}-${ubicacion.Ubicacion}`}
                          className="ubicacion-item"
                          onClick={() => cargarArticulosUbicacion(ubicacion.CodigoAlmacen, ubicacion.Ubicacion)}
                        >
                          <span className="almacen-ubicacion">
                            {getNombreAlmacen(ubicacion.CodigoAlmacen)} → {formatUbicacionDisplay(ubicacion.Ubicacion, ubicacion.Ubicacion === 'SIN-UBICACION')}
                          </span>
                          <span className="cantidad-articulos">
                            {ubicacion.CantidadArticulos} artículos
                          </span>
                        </div>
                      ))}
                      {busquedaUbicacion && ubicacionesBuscadas.length === 0 && !cargandoBusquedaUbicacion && (
                        <div className="sin-resultados">No se encontraron ubicaciones</div>
                      )}
                    </div>
                  ) : (
                    <div className="almacenes-container">
                      {almacenes.map(almacen => (
                        <div key={almacen.CodigoAlmacen} className="almacen-item">
                          <div 
                            className="almacen-header"
                            onClick={() => toggleAlmacenExpandido(almacen.CodigoAlmacen)}
                          >
                            <span>{almacen.Almacen} ({almacen.CodigoAlmacen})</span>
                            <span>{almacenesExpandidos[almacen.CodigoAlmacen] ? '▲' : '▼'}</span>
                          </div>
                          
                          {almacenesExpandidos[almacen.CodigoAlmacen] && (
                            <div className="ubicaciones-list">
                              {loading ? (
                                <div className="cargando-ubicaciones">Cargando ubicaciones...</div>
                              ) : (
                                ubicacionesCargadas[almacen.CodigoAlmacen]?.map((ubicacion, index) => (
                                  <div 
                                    key={`${almacen.CodigoAlmacen}-${ubicacion.Ubicacion}-${index}`}
                                    className={`ubicacion-item ${ubicacion.Ubicacion === 'SIN-UBICACION' ? 'sin-ubicacion-option' : ''}`}
                                    onClick={() => cargarArticulosUbicacion(almacen.CodigoAlmacen, ubicacion.Ubicacion)}
                                  >
                                    <span className="ubicacion-codigo">
                                      {ubicacion.Ubicacion === 'SIN-UBICACION' ? '[SIN UBICACIÓN]' : ubicacion.Ubicacion}
                                    </span>
                                    <span className="ubicacion-stock">
                                      {ubicacion.CantidadArticulos} artículos
                                    </span>
                                  </div>
                                )) || <div className="sin-ubicaciones">No hay ubicaciones disponibles</div>
                              )}
                            </div>
                          )}
                        </div>
                      ))},
                    </div>
                  )}
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
                    <h2>Artículos en {formatUbicacionDisplay(ubicacionSeleccionada.ubicacion, ubicacionSeleccionada.ubicacion === 'SIN-UBICACION')}</h2>
                  </div>
                  
                  <div className="form-section">
                    <div className="ubicacion-seleccionada-info">
                      <span>Almacén: {getNombreAlmacen(ubicacionSeleccionada.almacen)}</span>
                      <span>Ubicación: {formatUbicacionDisplay(ubicacionSeleccionada.ubicacion, ubicacionSeleccionada.ubicacion === 'SIN-UBICACION')}</span>
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
                              <th>Talla y Color</th>
                              <th>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {articulosUbicacion.map((articulo, index) => {
                              const uniqueKey = [
                                articulo.CodigoArticulo,
                                ubicacionSeleccionada.ubicacion,
                                articulo.TipoUnidadMedida_,
                                articulo.Partida || '',
                                articulo.Talla || '',
                                articulo.CodigoColor_ || '',
                                index
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
                                    {/* 🔥 USAR EL MISMO FORMATEO QUE INVENTARIO */}
                                    {formatearUnidad(articulo.Cantidad, articulo.UnidadMedida)} 
                                    {articulo.UnidadMedida !== articulo.UnidadBase && articulo.FactorConversion && (
                                      <span className="unidad-base">
                                        ({formatearUnidad(articulo.Cantidad * articulo.FactorConversion, articulo.UnidadBase)})
                                      </span>
                                    )}
                                  </td>
                                  <td>{mostrarUnidadMedida(articulo.UnidadMedida)}</td>
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
                        <strong>Unidad:</strong> {mostrarUnidadMedida(articuloUbicacionSeleccionado.UnidadMedida)}
                        {articuloUbicacionSeleccionado.Partida && <span>, <strong>Lote:</strong> {articuloUbicacionSeleccionado.Partida}</span>}
                      </div>
                      
                      <div className="variantes-detalle">
                        {articuloUbicacionSeleccionado.tallaColorDisplay && (
                          <div>
                            <strong>Talla/Color:</strong> 
                            <span 
                              style={getColorStyle(articuloUbicacionSeleccionado.CodigoColor_)}
                              className="talla-color-display destacado"
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
                              {ubicacion.Ubicacion === 'SIN-UBICACION' ? '[SIN UBICACIÓN] ' : ''}
                              {formatUbicacionDisplay(ubicacion.Ubicacion, ubicacion.Ubicacion === 'SIN-UBICACION')}
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
                        <strong>Stock disponible:</strong> {formatearUnidad(articuloUbicacionSeleccionado.Cantidad, articuloUbicacionSeleccionado.UnidadMedida)}
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
                          <br />
                          {traspaso.origen.esSinUbicacion ? '[SIN UBICACIÓN]' : traspaso.origen.ubicacion}
                        </td>
                        <td>
                          {getNombreAlmacen(traspaso.destino.almacen)}
                          <br />{traspaso.destino.ubicacion}
                        </td>
                        <td className="cantidad-td">
                          {/* 🔥 USAR EL MISMO FORMATEO QUE INVENTARIO */}
                          {formatearUnidad(traspaso.cantidad, mostrarUnidadMedida(traspaso.unidadMedida))}
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
                          {item.OrigenUbicacion === 'SIN-UBICACION' ? '[SIN UBICACIÓN]' : item.OrigenUbicacion}
                        </td>
                        <td>
                          {item.DestinoAlmacen}<br />
                          {item.DestinoUbicacion}
                        </td>
                        <td>
                          {/* 🔥 USAR EL MISMO FORMATEO QUE INVENTARIO */}
                          {formatearUnidad(item.Cantidad, mostrarUnidadMedida(item.UnidadMedida))}
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