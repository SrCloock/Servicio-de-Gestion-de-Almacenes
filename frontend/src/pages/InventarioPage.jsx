import React, { useState, useEffect, useCallback, useMemo } from 'react';
import API from '../helpers/api';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';

import { 
  FiChevronDown, FiChevronUp, 
  FiFilter, FiEdit, FiX, 
  FiCheck, FiClock, FiList, FiRefreshCw, FiPlus, FiMinus,
  FiMapPin, FiPackage, FiDatabase, FiLayers,
  FiAlertTriangle, FiPlusCircle
} from 'react-icons/fi';
import '../styles/InventarioPage.css';

const InventarioPage = () => {
  const [activeTab, setActiveTab] = useState('inventario');
  const [inventario, setInventario] = useState([]);
  const [historialAjustes, setHistorialAjustes] = useState([]);
  const [articulosExpandidos, setArticulosExpandidos] = useState({});
  const [fechasExpandidas, setFechasExpandidas] = useState({});
  const [loading, setLoading] = useState({ inventario: true, historial: true });
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    codigo: '',
    almacen: '',
    ubicacion: '',
    familia: '',
    subfamilia: ''
  });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [ajustesPendientes, setAjustesPendientes] = useState([]);
  const [editandoCantidad, setEditandoCantidad] = useState(null);
  const [nuevaCantidad, setNuevaCantidad] = useState('');
  const [detallesModal, setDetallesModal] = useState(null);
  const [cargandoDetalles, setCargandoDetalles] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  
  // Estados para el nuevo modal de ajuste
  const [modalNuevoAjuste, setModalNuevoAjuste] = useState(false);
  const [articuloBusqueda, setArticuloBusqueda] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState(null);
  const [almacenSeleccionado, setAlmacenSeleccionado] = useState('');
  const [ubicacionSeleccionada, setUbicacionSeleccionada] = useState('');
  const [ubicacionesDisponibles, setUbicacionesDisponibles] = useState([]);
  const [unidadMedidaSeleccionada, setUnidadMedidaSeleccionada] = useState('');
  const [tallaSeleccionada, setTallaSeleccionada] = useState('');
  const [colorSeleccionado, setColorSeleccionado] = useState('');
  const [cantidadNuevoAjuste, setCantidadNuevoAjuste] = useState('');

  // Estados para unidades, tallas y colores disponibles
  const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
  const [tallasDisponibles, setTallasDisponibles] = useState([]);
  const [coloresDisponibles, setColoresDisponibles] = useState([]);

  // Estados para edición de cantidad existente
  const [unidadesDisponiblesEdit, setUnidadesDisponiblesEdit] = useState(['unidades']);
  const [tallasDisponiblesEdit, setTallasDisponiblesEdit] = useState([]);
  const [coloresDisponiblesEdit, setColoresDisponiblesEdit] = useState([]);
  const [unidadMedidaSeleccionadaEdit, setUnidadMedidaSeleccionadaEdit] = useState('unidades');
  const [tallaSeleccionadaEdit, setTallaSeleccionadaEdit] = useState('');
  const [colorSeleccionadoEdit, setColorSeleccionadoEdit] = useState('');

  // 🔥 NUEVA FUNCIÓN: Buscar artículos para el nuevo ajuste
  const buscarArticulos = async (termino) => {
    if (!termino || termino.trim().length < 2) {
      setResultadosBusqueda([]);
      return;
    }

    try {
      const headers = getAuthHeader();
      const response = await API.get(
        `/buscar-articulos?termino=${termino}`,
        { headers }
      );
      setResultadosBusqueda(response.data);
    } catch (error) {
      console.error('Error buscando artículos:', error);
      setResultadosBusqueda([]);
    }
  };

  // 🔥 NUEVA FUNCIÓN: Cargar ubicaciones por almacén
  const cargarUbicacionesPorAlmacen = async (codigoAlmacen) => {
    try {
      const headers = getAuthHeader();
      const response = await API.get(
        `/ubicaciones-por-almacen/${codigoAlmacen}`,
        { headers }
      );
      setUbicacionesDisponibles(response.data);
    } catch (error) {
      console.error('Error cargando ubicaciones:', error);
      setUbicacionesDisponibles([]);
    }
  };

  // 🔥 NUEVA FUNCIÓN: Cargar información completa del artículo seleccionado
  const seleccionarArticulo = async (articulo) => {
    try {
      const headers = getAuthHeader();
      
      // Obtener información básica del artículo
      const response = await API.get(
        `/articulos/${articulo.CodigoArticulo}`,
        { headers }
      );
      
      setArticuloSeleccionado({
        ...articulo,
        ...response.data
      });

      // Cargar unidades de medida disponibles
      const unidades = [
        response.data.UnidadMedida2_,
        response.data.UnidadMedidaAlternativa_
      ].filter((unidad, index, self) => 
        unidad && 
        unidad.trim() !== '' && 
        self.indexOf(unidad) === index
      );
      
      if (unidades.length === 0) {
        unidades.push('unidades');
      }
      
      setUnidadesDisponibles(unidades);
      setUnidadMedidaSeleccionada(unidades[0]);

      // Cargar stock existente para extraer tallas y colores
      const stockResponse = await API.get(
        `/stock/por-articulo?codigoArticulo=${articulo.CodigoArticulo}&incluirSinUbicacion=true`,
        { headers }
      );
      
      const stockData = Array.isArray(stockResponse.data) ? stockResponse.data : [];
      
      // Extraer tallas únicas
      const tallasUnicas = [...new Set(stockData
        .filter(item => item.CodigoTalla01_ && item.CodigoTalla01_.trim() !== '')
        .map(item => item.CodigoTalla01_)
      )].sort();
      
      // Extraer colores únicos
      const coloresUnicos = [...new Set(stockData
        .filter(item => item.CodigoColor_ && item.CodigoColor_.trim() !== '')
        .map(item => item.CodigoColor_)
      )].sort();
      
      setTallasDisponibles(tallasUnicas);
      setColoresDisponibles(coloresUnicos);
      
      // Seleccionar primera talla y color por defecto si existen
      if (tallasUnicas.length > 0) {
        setTallaSeleccionada(tallasUnicas[0]);
      } else {
        setTallaSeleccionada('');
      }
      
      if (coloresUnicos.length > 0) {
        setColorSeleccionado(coloresUnicos[0]);
      } else {
        setColorSeleccionado('');
      }

      setResultadosBusqueda([]);
      setArticuloBusqueda(articulo.CodigoArticulo);
      
    } catch (error) {
      console.error('Error cargando artículo:', error);
      alert('Error al cargar la información del artículo');
    }
  };

  // 🔥 NUEVA FUNCIÓN: Guardar nuevo ajuste
  const guardarNuevoAjuste = async () => {
    if (!articuloSeleccionado || !almacenSeleccionado || !ubicacionSeleccionada || !cantidadNuevoAjuste) {
      alert('Por favor complete todos los campos obligatorios');
      return;
    }

    const cantidad = parseFloat(cantidadNuevoAjuste);
    if (isNaN(cantidad)) {
      alert("Por favor ingrese un número válido");
      return;
    }

    const nuevoAjuste = {
      articulo: articuloSeleccionado.CodigoArticulo,
      descripcionArticulo: articuloSeleccionado.DescripcionArticulo,
      codigoAlmacen: almacenSeleccionado,
      ubicacionStr: ubicacionSeleccionada,
      partida: '',
      unidadStock: (unidadMedidaSeleccionada === 'unidades' ? '' : unidadMedidaSeleccionada),
      nuevaCantidad: cantidad,
      codigoColor: colorSeleccionado || '',
      codigoTalla01: tallaSeleccionada || ''
    };

    try {
      const headers = getAuthHeader();
      const response = await API.post(
        '/inventario/ajustar-completo',
        { ajustes: [nuevoAjuste] },
        { headers }
      );
      
      if (response.data.success) {
        alert('Nuevo ajuste creado correctamente');
        setModalNuevoAjuste(false);
        resetearModalNuevoAjuste();
        cargarInventario();
      }
    } catch (error) {
      console.error('Error guardando nuevo ajuste:', error);
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.mensaje || 
                          error.message;
      alert(`Error al guardar el ajuste: ${errorMessage}`);
    }
  };

  // 🔥 NUEVA FUNCIÓN: Resetear modal de nuevo ajuste
  const resetearModalNuevoAjuste = () => {
    setArticuloBusqueda('');
    setResultadosBusqueda([]);
    setArticuloSeleccionado(null);
    setAlmacenSeleccionado('');
    setUbicacionSeleccionada('');
    setUbicacionesDisponibles([]);
    setUnidadMedidaSeleccionada('');
    setTallaSeleccionada('');
    setColorSeleccionado('');
    setCantidadNuevoAjuste('');
    setUnidadesDisponibles([]);
    setTallasDisponibles([]);
    setColoresDisponibles([]);
  };

  // Efecto para buscar artículos cuando cambia el término de búsqueda
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (articuloBusqueda.trim().length >= 2) {
        buscarArticulos(articuloBusqueda);
      } else {
        setResultadosBusqueda([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [articuloBusqueda]);

  // Efecto para cargar ubicaciones cuando cambia el almacén seleccionado
  useEffect(() => {
    if (almacenSeleccionado) {
      cargarUbicacionesPorAlmacen(almacenSeleccionado);
    } else {
      setUbicacionesDisponibles([]);
    }
  }, [almacenSeleccionado]);

  // 🔥 CORRECCIÓN: Función mejorada para manejar números negativos y cero
  const formatearUnidad = (cantidad, unidad) => {
    let cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum)) {
      cantidadNum = 0;
    }
    
    // Manejar números negativos y cero
    const esNegativo = cantidadNum < 0;
    const esCero = cantidadNum === 0;
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
      'paquete': 'paquetes',
      'cajetin': 'cajetines',
      'bidon': 'bidones',
      'palet': 'palets',
      'bobina': 'bobinas',
      'fardo': 'fardos',
      'cubeta': 'cubetas',
      'garrafa': 'garrafas',
      'tambor': 'tambores',
      'cubos': 'cubos',
      'pares': 'pares'
    };

    if (esCero) {
      return `0 ${unidad}`;
    }

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

  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return 'Fecha inválida';
    
    try {
      const fecha = new Date(fechaStr);
      
      return fecha.toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formateando fecha:', fechaStr, error);
      return 'Fecha inválida';
    }
  };

  const formatTallaColor = (talla, color) => {
    if (!talla && !color) return 'N/A';
    
    let result = '';
    if (talla && talla !== 'N/A') result += `T: ${talla}`;
    if (color && color !== 'N/A') result += `${result ? ' | ' : ''}C: ${color}`;
    
    return result || 'N/A';
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

  // 🔥 CORRECCIÓN: Estilos mejorados para números negativos y cero
  const getStockStyle = (cantidad) => {
    if (cantidad === 0) return { 
      color: '#ff9800', 
      fontWeight: 'bold', 
      backgroundColor: '#fff3e0', 
      padding: '2px 6px', 
      borderRadius: '4px',
      border: '1px solid #ffb74d'
    };
    if (cantidad < 0) return { 
      color: '#e67e22', 
      fontWeight: 'bold', 
      backgroundColor: '#fef9e7', 
      padding: '2px 6px', 
      borderRadius: '4px',
      border: '1px solid #f39c12'
    };
    return { color: '#27ae60' };
  };

  const getEstadoColor = (estado) => {
    switch (estado) {
      case 'positivo': return '#2ecc71';
      case 'negativo': return '#e67e22';
      case 'cero': return '#ff9800';
      case 'agotado': return '#e74c3c';
      default: return '#7f8c8d';
    }
  };

  const cargarVariantesArticulo = useCallback(async (codigoArticulo, unidadActual) => {
    try {
      const headers = getAuthHeader();
      
      // Obtener información del artículo para unidades de medida
      const infoArticulo = await obtenerInfoArticulo(codigoArticulo);
      if (infoArticulo) {
        const unidades = [
          infoArticulo.UnidadMedida2_,
          infoArticulo.UnidadMedidaAlternativa_
        ].filter((unidad, index, self) => 
          unidad && 
          unidad.trim() !== '' && 
          self.indexOf(unidad) === index
        );
        
        if (unidades.length === 0) {
          unidades.push('unidades');
        }
        
        setUnidadesDisponiblesEdit(unidades);
        
        if (!unidadActual) {
          setUnidadMedidaSeleccionadaEdit(unidades[0]);
        } else {
          setUnidadMedidaSeleccionadaEdit(unidadActual);
        }
      }

      // Obtener stock para extraer tallas y colores disponibles
      const response = await API.get(
        `/stock/por-articulo?codigoArticulo=${codigoArticulo}&incluirSinUbicacion=true`,
        { headers }
      );
      
      const stockData = Array.isArray(response.data) ? response.data : [];
      
      // Extraer tallas únicas
      const tallasUnicas = [...new Set(stockData
        .filter(item => item.CodigoTalla01_ && item.CodigoTalla01_.trim() !== '')
        .map(item => item.CodigoTalla01_)
      )].sort();
      
      // Extraer colores únicos
      const coloresUnicos = [...new Set(stockData
        .filter(item => item.CodigoColor_ && item.CodigoColor_.trim() !== '')
        .map(item => item.CodigoColor_)
      )].sort();
      
      setTallasDisponiblesEdit(tallasUnicas);
      setColoresDisponiblesEdit(coloresUnicos);
      
      // Seleccionar primera talla y color por defecto si existen
      if (tallasUnicas.length > 0) {
        setTallaSeleccionadaEdit(tallasUnicas[0]);
      }
      if (coloresUnicos.length > 0) {
        setColorSeleccionadoEdit(coloresUnicos[0]);
      }
      
    } catch (error) {
      console.error('Error cargando variantes del artículo:', error);
      setUnidadesDisponiblesEdit(['unidades']);
      setTallasDisponiblesEdit([]);
      setColoresDisponiblesEdit([]);
    }
  }, []);

  // 🔥 CORRECCIÓN: Función agruparPorArticulo que incluye negativos y cero
  const agruparPorArticulo = useCallback((data) => {
    const agrupado = {};
    
    data.forEach(item => {
      const almacenesPermitidos = ['CEN', 'BCN', 'N5', 'N1', 'PK', '5'];
      if (!almacenesPermitidos.includes(item.CodigoAlmacen)) {
        return;
      }
      
      // 🔥 CORRECCIÓN: Generar clave única que incluya TODOS los campos relevantes
      const claveUnica = `${item.CodigoArticulo}_${item.CodigoAlmacen}_${item.Ubicacion}_${item.UnidadStock || 'unidades'}_${item.Partida || ''}_${item.CodigoColor_ || ''}_${item.CodigoTalla01_ || ''}`;
      
      if (!agrupado[item.CodigoArticulo]) {
        agrupado[item.CodigoArticulo] = {
          CodigoArticulo: item.CodigoArticulo,
          DescripcionArticulo: item.DescripcionArticulo,
          Descripcion2Articulo: item.Descripcion2Articulo,
          CodigoFamilia: item.CodigoFamilia,
          CodigoSubfamilia: item.CodigoSubfamilia,
          UnidadBase: item.UnidadBase,
          UnidadAlternativa: item.UnidadAlternativa,
          FactorConversion: item.FactorConversion,
          ubicaciones: [],
          totalStockBase: 0,
          estado: 'positivo'
        };
      }
      
      let cantidadBase = parseFloat(item.CantidadBase);
      if (isNaN(cantidadBase)) {
        cantidadBase = 0;
      }
      
      let cantidad = parseFloat(item.Cantidad);
      if (isNaN(cantidad)) {
        cantidad = 0;
      }
      
      const ubicacion = {
        clave: claveUnica,
        CodigoAlmacen: item.CodigoAlmacen,
        NombreAlmacen: item.NombreAlmacen,
        Ubicacion: item.Ubicacion,
        DescripcionUbicacion: item.DescripcionUbicacion,
        Partida: item.Partida,
        Periodo: item.Periodo,
        UnidadStock: item.UnidadStock,
        Cantidad: cantidad,
        CantidadBase: cantidadBase,
        CodigoColor: item.CodigoColor_,
        CodigoTalla01: item.CodigoTalla01_,
        GrupoUnico: claveUnica,
        MovPosicionLinea: item.MovPosicionLinea,
        detalles: null,
        esSinUbicacion: item.EsSinUbicacion === 1 || item.TipoStock === 'SIN_UBICACION',
        TallaColorDisplay: formatTallaColor(item.CodigoTalla01_, item.CodigoColor_)
      };
      
      // 🔥 VERIFICAR DUPLICADOS ANTES DE AGREGAR
      const existeDuplicado = agrupado[item.CodigoArticulo].ubicaciones.some(
        u => u.clave === claveUnica
      );
      
      if (!existeDuplicado) {
        agrupado[item.CodigoArticulo].ubicaciones.push(ubicacion);
        agrupado[item.CodigoArticulo].totalStockBase += cantidadBase;
      } else {
        console.warn(`⚠️ Se evitó duplicado: ${claveUnica}`);
      }
    });
    
    Object.values(agrupado).forEach(articulo => {
      articulo.ubicaciones.sort((a, b) => {
        if (a.esSinUbicacion && !b.esSinUbicacion) return 1;
        if (!a.esSinUbicacion && b.esSinUbicacion) return -1;
        
        if (a.NombreAlmacen < b.NombreAlmacen) return -1;
        if (a.NombreAlmacen > b.NombreAlmacen) return 1;
        
        if (a.Ubicacion < b.Ubicacion) return -1;
        if (a.Ubicacion > b.Ubicacion) return 1;
        
        if (a.Partida && b.Partida) {
          if (a.Partida < b.Partida) return -1;
          if (a.Partida > b.Partida) return 1;
        }
        
        return 0;
      });
      
      if (isNaN(articulo.totalStockBase)) {
        articulo.totalStockBase = 0;
      }
      
      // 🔥 CORRECCIÓN: Determinar estado incluyendo negativos y cero
      if (articulo.totalStockBase === 0) {
        articulo.estado = 'cero';
      } else if (articulo.totalStockBase < 0) {
        articulo.estado = 'negativo';
      } else {
        articulo.estado = 'positivo';
      }
    });
    
    return Object.values(agrupado);
  }, []);

  const cargarInventario = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, inventario: true }));
      setError('');
      const headers = getAuthHeader();
      const response = await API.get(
        '/inventario/stock-total-completo',
        { headers }
      );
      
      setInventario(agruparPorArticulo(response.data));
      setLoading(prev => ({ ...prev, inventario: false }));
    } catch (error) {
      console.error('Error al obtener inventario:', error);
      setError('Error al cargar el inventario. Intente nuevamente.');
      setLoading(prev => ({ ...prev, inventario: false }));
    }
  }, [agruparPorArticulo]);

  const cargarHistorialAjustes = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, historial: true }));
      setError('');
      const headers = getAuthHeader();
      const response = await API.get(
        '/inventario/historial-ajustes',
        { headers }
      );
      
      setHistorialAjustes(response.data);
      setLoading(prev => ({ ...prev, historial: false }));
    } catch (error) {
      console.error('Error al obtener historial:', error);
      setError('Error al cargar el historial de ajustes. Intente nuevamente.');
      setLoading(prev => ({ ...prev, historial: false }));
    }
  }, []);

  const obtenerInfoArticulo = async (codigoArticulo) => {
    try {
      const headers = getAuthHeader();
      const response = await API.get(
        `/articulos/${codigoArticulo}`,
        { headers }
      );
      return response.data;
    } catch (error) {
      console.error('Error al obtener información del artículo:', error);
      return null;
    }
  };

  useEffect(() => {
    if (activeTab === 'inventario' && inventario.length === 0) {
      cargarInventario();
    } else if (activeTab === 'historial' && historialAjustes.length === 0) {
      cargarHistorialAjustes();
    }
  }, [activeTab, cargarInventario, cargarHistorialAjustes, inventario.length, historialAjustes.length]);

  const refreshInventario = useCallback(() => {
    if (activeTab === 'inventario') {
      cargarInventario();
    } else {
      cargarHistorialAjustes();
    }
  }, [activeTab, cargarInventario, cargarHistorialAjustes]);

  const toggleExpandirArticulo = (codigoArticulo) => {
    setArticulosExpandidos(prev => ({
      ...prev,
      [codigoArticulo]: !prev[codigoArticulo]
    }));
  };

  const toggleExpandirFecha = (fecha) => {
    setFechasExpandidas(prev => ({
      ...prev,
      [fecha]: !prev[fecha]
    }));
  };

  const toggleTodosArticulos = () => {
    if (Object.keys(articulosExpandidos).length === filteredInventario.length) {
      setArticulosExpandidos({});
    } else {
      const allExpanded = {};
      filteredInventario.forEach(art => {
        allExpanded[art.CodigoArticulo] = true;
      });
      setArticulosExpandidos(allExpanded);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1);
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const estadoOrden = { 'positivo': 1, 'negativo': 2, 'cero': 3, 'agotado': 4 };

  const filteredInventario = useMemo(() => {
    let result = [...inventario];
    
    if (filters.codigo) {
      const term = filters.codigo.toLowerCase();
      result = result.filter(articulo => 
        articulo.CodigoArticulo.toLowerCase().includes(term) ||
        articulo.DescripcionArticulo.toLowerCase().includes(term) ||
        (articulo.Descripcion2Articulo && articulo.Descripcion2Articulo.toLowerCase().includes(term))
      );
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(articulo => 
        articulo.CodigoArticulo.toLowerCase().includes(term) ||
        articulo.DescripcionArticulo.toLowerCase().includes(term) ||
        (articulo.Descripcion2Articulo && articulo.Descripcion2Articulo.toLowerCase().includes(term))
      );
    }
    
    if (filters.almacen) {
      const term = filters.almacen.toLowerCase();
      result = result.filter(articulo => 
        articulo.ubicaciones.some(ubic => 
          ubic.CodigoAlmacen.toLowerCase().includes(term) ||
          ubic.NombreAlmacen.toLowerCase().includes(term)
        )
      );
    }
    
    if (filters.ubicacion) {
      const term = filters.ubicacion.toLowerCase();
      result = result.filter(articulo => 
        articulo.ubicaciones.some(ubic => 
          ubic.Ubicacion.toLowerCase().includes(term) ||
          (ubic.DescripcionUbicacion && 
          ubic.DescripcionUbicacion.toLowerCase().includes(term))
        )
      );
    }
    
    if (filters.familia) {
      const term = filters.familia.toLowerCase();
      result = result.filter(articulo => 
        articulo.CodigoFamilia && 
        articulo.CodigoFamilia.toLowerCase().includes(term)
      );
    }
    
    if (filters.subfamilia) {
      const term = filters.subfamilia.toLowerCase();
      result = result.filter(articulo => 
        articulo.CodigoSubfamilia && 
        articulo.CodigoSubfamilia.toLowerCase().includes(term)
      );
    }
    
    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue, bValue;
        
        if (sortConfig.key === 'estado') {
          aValue = estadoOrden[a.estado];
          bValue = estadoOrden[b.estado];
        } else {
          aValue = a[sortConfig.key];
          bValue = b[sortConfig.key];
        }
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    } else {
      result.sort((a, b) => {
        if (estadoOrden[a.estado] < estadoOrden[b.estado]) return -1;
        if (estadoOrden[a.estado] > estadoOrden[b.estado]) return 1;
        
        if (a.CodigoArticulo < b.CodigoArticulo) return -1;
        if (a.CodigoArticulo > b.CodigoArticulo) return 1;
        return 0;
      });
    }
    
    return result;
  }, [inventario, searchTerm, filters, sortConfig]);

  const stats = useMemo(() => {
    const totalArticulos = filteredInventario.length;
    const totalUnidades = filteredInventario.reduce((total, art) => total + (art.totalStockBase || 0), 0);
    const totalUbicaciones = filteredInventario.reduce((total, art) => total + art.ubicaciones.length, 0);
    const stockSinUbicacion = filteredInventario.reduce((total, art) => 
      total + art.ubicaciones.filter(ubic => ubic.esSinUbicacion).reduce((sum, ubic) => sum + (ubic.CantidadBase || 0), 0), 0);
    
    // 🔥 NUEVO: Calcular stock negativo y cero
    const stockNegativo = filteredInventario.reduce((total, art) => 
      total + art.ubicaciones.filter(ubic => ubic.Cantidad < 0).reduce((sum, ubic) => sum + (ubic.Cantidad || 0), 0), 0);
    
    const stockCero = filteredInventario.reduce((total, art) => 
      total + art.ubicaciones.filter(ubic => ubic.Cantidad === 0).length, 0);
    
    return { 
      totalArticulos, 
      totalUnidades, 
      totalUbicaciones, 
      stockSinUbicacion, 
      stockNegativo,
      stockCero 
    };
  }, [filteredInventario]);

  const totalPages = Math.ceil(filteredInventario.length / pageSize);
  const paginatedInventario = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredInventario.slice(startIndex, startIndex + pageSize);
  }, [filteredInventario, currentPage, pageSize]);

  const goToPage = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const iniciarEdicionCantidad = async (articulo, nombreAlmacen, cantidadActual, clave, codigoAlmacen, ubicacionStr, partida, unidadStock, codigoColor, codigoTalla01, esSinUbicacion) => {
    const articuloCompleto = inventario.find(art => art.CodigoArticulo === articulo);
    
    await cargarVariantesArticulo(articulo, unidadStock);
    
    setEditandoCantidad({
      articulo,
      descripcionArticulo: articuloCompleto?.DescripcionArticulo || '',
      nombreAlmacen,
      cantidadActual,
      clave,
      codigoAlmacen,
      ubicacionStr: esSinUbicacion ? 'SIN UBICACIÓN' : ubicacionStr,
      partida: partida || '',
      unidadStock: unidadStock || 'unidades',
      codigoColor: codigoColor || '',
      codigoTalla01: codigoTalla01 || '',
      esSinUbicacion: esSinUbicacion || false
    });
    
    // Establecer valores actuales en los selects
    setUnidadMedidaSeleccionadaEdit(unidadStock || 'unidades');
    setTallaSeleccionadaEdit(codigoTalla01 || '');
    setColorSeleccionadoEdit(codigoColor || '');
    setNuevaCantidad(cantidadActual.toString());
  };

  const guardarAjustePendiente = () => {
    if (!editandoCantidad || !nuevaCantidad) return;
    
    const cantidad = parseFloat(nuevaCantidad);
    if (isNaN(cantidad)) {
      alert("Por favor ingrese un número válido");
      return;
    }
    
    const nuevoAjuste = {
      articulo: editandoCantidad.articulo,
      descripcionArticulo: editandoCantidad.descripcionArticulo,
      codigoAlmacen: editandoCantidad.codigoAlmacen,
      ubicacionStr: editandoCantidad.ubicacionStr,
      partida: editandoCantidad.partida || '',
      unidadStock: (unidadMedidaSeleccionadaEdit === 'unidades' ? '' : unidadMedidaSeleccionadaEdit),
      nuevaCantidad: cantidad,
      codigoColor: colorSeleccionadoEdit || '',
      codigoTalla01: tallaSeleccionadaEdit || ''
    };
    
    setAjustesPendientes(prev => [...prev, nuevoAjuste]);
    setEditandoCantidad(null);
    setNuevaCantidad('');
  };

  const eliminarAjustePendiente = (index) => {
    setAjustesPendientes(prev => prev.filter((_, i) => i !== index));
  };

  const verDetalles = async (movPosicionLinea) => {
    if (!movPosicionLinea) return;
    
    try {
      setCargandoDetalles(true);
      const headers = getAuthHeader();
      const response = await API.get(
        `/stock/detalles?movPosicionLinea=${movPosicionLinea}`,
        { headers }
      );
      
      setDetallesModal(response.data);
    } catch (error) {
      console.error('Error cargando detalles:', error);
      alert('Error al cargar los detalles');
    } finally {
      setCargandoDetalles(false);
    }
  };

  const confirmarAjustes = async () => {
    if (ajustesPendientes.length === 0) {
      alert('No hay ajustes para confirmar');
      return;
    }
    
    try {
      const headers = getAuthHeader();
      const response = await API.post(
        '/inventario/ajustar-completo',
        { ajustes: ajustesPendientes },
        { headers }
      );
      
      if (response.data.success) {
        refreshInventario();
        cargarHistorialAjustes();
        setAjustesPendientes([]);
        alert('Ajustes realizados correctamente y registrados en inventarios');
      }
    } catch (error) {
      console.error('Error al confirmar ajustes:', error);
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.mensaje || 
                          error.message;
      alert(`Error al confirmar ajustes: ${errorMessage}`);
    }
  };

  return (
    <div className="inventario-container">
      <Navbar />
      
      <div className="inventario-content">
        {/* 🔥 NUEVA BARRA DE HERRAMIENTAS MEJORADA */}
        <div className="inventario-toolbar">
          <h1 className="inventario-page-title">
            <FiPackage /> Gestión de Inventario
          </h1>
          <div className="inventario-toolbar-actions">
            <button 
              className="inventario-btn-nuevo-ajuste"
              onClick={() => setModalNuevoAjuste(true)}
              aria-label="Crear nuevo ajuste"
            >
              <FiPlusCircle /> Nuevo Ajuste
            </button>
            <button 
              className="inventario-refresh-btn" 
              onClick={refreshInventario} 
              aria-label="Actualizar"
            >
              <FiRefreshCw /> Actualizar
            </button>
          </div>
        </div>
        
        <div className="inventario-tabs-container">
          <button 
            className={`inventario-tab-btn ${activeTab === 'inventario' ? 'inventario-active' : ''}`}
            onClick={() => setActiveTab('inventario')}
          >
            <FiList /> Inventario Actual
          </button>
          <button 
            className={`inventario-tab-btn ${activeTab === 'historial' ? 'inventario-active' : ''}`}
            onClick={() => setActiveTab('historial')}
          >
            <FiClock /> Historial de Ajustes
          </button>
        </div>
        
        {activeTab === 'inventario' && (
          <div className="inventario-filters-container">
            <button 
              className="inventario-filters-toggle"
              onClick={() => setFiltrosAbiertos(!filtrosAbiertos)}
            >
              <FiFilter /> {filtrosAbiertos ? 'Ocultar Filtros' : 'Mostrar Filtros'}
            </button>
            
            {filtrosAbiertos && (
              <div className="inventario-filters-panel">
                <div className="inventario-filter-group">
                  <label>Artículo:</label>
                  <input
                    type="text"
                    name="codigo"
                    placeholder="Código, descripción o descripción2"
                    value={filters.codigo}
                    onChange={handleFilterChange}
                  />
                </div>
                
                <div className="inventario-filter-group">
                  <label>Almacén:</label>
                  <input
                    type="text"
                    name="almacen"
                    placeholder="Código o nombre de almacén"
                    value={filters.almacen}
                    onChange={handleFilterChange}
                  />
                </div>
                
                <div className="inventario-filter-group">
                  <label>Ubicación:</label>
                  <input
                    type="text"
                    name="ubicacion"
                    placeholder="Código o descripción de ubicación"
                    value={filters.ubicacion}
                    onChange={handleFilterChange}
                  />
                </div>
                
                <div className="inventario-filter-group">
                  <label>Familia:</label>
                  <input
                    type="text"
                    name="familia"
                    placeholder="Buscar por familia"
                    value={filters.familia}
                    onChange={handleFilterChange}
                  />
                </div>
                
                <div className="inventario-filter-group">
                  <label>Subfamilia:</label>
                  <input
                    type="text"
                    name="subfamilia"
                    placeholder="Buscar por subfamilia"
                    value={filters.subfamilia}
                    onChange={handleFilterChange}
                  />
                </div>
                
                <button 
                  className="inventario-btn-toggle-all"
                  onClick={toggleTodosArticulos}
                >
                  {Object.keys(articulosExpandidos).length > 0 ? (
                    <>
                      <FiMinus /> Contraer Todo
                    </>
                  ) : (
                    <>
                      <FiPlus /> Expandir Todo
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'inventario' && ajustesPendientes.length > 0 && (
          <div className="inventario-panel-ajustes">
            <div className="inventario-panel-header">
              <h3>Ajustes Pendientes <span className="inventario-badge">{ajustesPendientes.length}</span></h3>
              <div className="inventario-panel-actions">
                <button 
                  className="inventario-btn-confirmar"
                  onClick={confirmarAjustes}
                >
                  <FiCheck /> Confirmar Ajustes
                </button>
              </div>
            </div>
            
            <div className="inventario-lista-ajustes">
              {ajustesPendientes.map((ajuste, index) => (
                <div key={index} className="inventario-ajuste-item">
                  <div className="inventario-ajuste-info">
                    <div className="inventario-articulo">
                      <span className="inventario-label">Artículo:</span> 
                      <div className="inventario-value">
                        <div className="inventario-articulo-codigo">{ajuste.articulo}</div>
                        <div className="inventario-articulo-descripcion">{ajuste.descripcionArticulo}</div>
                      </div>
                    </div>
                    <div className="inventario-ubicacion">
                      <span className="inventario-label">Ubicación:</span> 
                      <span className="inventario-value">{ajuste.ubicacionStr}</span>
                    </div>
                    <div className="inventario-cantidad">
                      <span className="inventario-label">Nueva Cantidad:</span> 
                      <span className="inventario-value">
                        <strong style={getStockStyle(ajuste.nuevaCantidad)}>
                          {formatearUnidad(ajuste.nuevaCantidad, ajuste.unidadStock)}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <button 
                    className="inventario-btn-eliminar"
                    onClick={() => eliminarAjustePendiente(index)}
                  >
                    <FiX />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {activeTab === 'inventario' && (
          <div className="inventario-stats">
            <div className="inventario-stat-card">
              <div className="inventario-stat-icon">
                <FiPackage />
              </div>
              <div>
                <span className="inventario-stat-value">{stats.totalArticulos}</span>
                <span className="inventario-stat-label">Artículos</span>
              </div>
            </div>
            <div className="inventario-stat-card">
              <div className="inventario-stat-icon">
                <FiLayers />
              </div>
              <div>
                <span className="inventario-stat-value">
                  {stats.totalUnidades.toLocaleString()}
                </span>
                <span className="inventario-stat-label">Unidades</span>
              </div>
            </div>
            <div className="inventario-stat-card">
              <div className="inventario-stat-icon">
                <FiMapPin />
              </div>
              <div>
                <span className="inventario-stat-value">{stats.totalUbicaciones}</span>
                <span className="inventario-stat-label">Ubicaciones</span>
              </div>
            </div>
            <div className="inventario-stat-card inventario-stat-sin-ubicacion">
              <div className="inventario-stat-icon">
                <FiDatabase />
              </div>
              <div>
                <span className="inventario-stat-value">
                  {stats.stockSinUbicacion.toLocaleString()}
                </span>
                <span className="inventario-stat-label">Sin Ubicación</span>
              </div>
            </div>
            {/* 🔥 NUEVO: Estadística para stock negativo */}
            {stats.stockNegativo < 0 && (
              <div className="inventario-stat-card inventario-stat-negativo">
                <div className="inventario-stat-icon">
                  <FiAlertTriangle />
                </div>
                <div>
                  <span className="inventario-stat-value" style={{color: '#e67e22'}}>
                    {stats.stockNegativo.toLocaleString()}
                  </span>
                  <span className="inventario-stat-label">Stock Negativo</span>
                </div>
              </div>
            )}
            {/* 🔥 NUEVO: Estadística para registros cero */}
            {stats.stockCero > 0 && (
              <div className="inventario-stat-card inventario-stat-cero">
                <div className="inventario-stat-icon">
                  <FiMinus />
                </div>
                <div>
                  <span className="inventario-stat-value" style={{color: '#ff9800'}}>
                    {stats.stockCero}
                  </span>
                  <span className="inventario-stat-label">Registros Cero</span>
                </div>
              </div>
            )}
          </div>
        )}
        
        {cargandoDetalles && (
          <div className="inventario-cargando-detalles">
            <div className="inventario-spinner"></div>
            <p>Cargando detalles...</p>
          </div>
        )}
        
        <div className="inventario-main-content">
          {activeTab === 'inventario' ? (
            <>
              {error ? (
                <div className="inventario-error-container">
                  <div className="inventario-error-icon">⚠️</div>
                  <h3>Error al cargar datos</h3>
                  <p>{error}</p>
                  <button 
                    className="inventario-btn-reload"
                    onClick={() => window.location.reload()}
                  >
                    <FiRefreshCw /> Recargar Inventario
                  </button>
                </div>
              ) : loading.inventario ? (
                <div className="inventario-loading-container">
                  <div className="inventario-spinner"></div>
                  <p>Cargando inventario...</p>
                </div>
              ) : paginatedInventario.length === 0 ? (
                <div className="inventario-no-results">
                  <h3>No se encontraron artículos</h3>
                  <p>Intenta ajustar tus filtros de búsqueda</p>
                  <button 
                    className="inventario-btn-clear-filters"
                    onClick={() => {
                      setSearchTerm('');
                      setFilters({
                        codigo: '',
                        almacen: '',
                        ubicacion: '',
                        familia: '',
                        subfamilia: ''
                      });
                    }}
                  >
                    Limpiar Filtros
                  </button>
                </div>
              ) : (
                <div className="inventario-list">
                  {paginatedInventario.map(articulo => (
                    <div 
                      key={articulo.CodigoArticulo} 
                      className={`inventario-item ${
                        articulo.estado === 'agotado' ? 'inventario-estado-agotado' : ''
                      } ${
                        articulo.estado === 'negativo' ? 'inventario-estado-negativo' : ''
                      } ${
                        articulo.estado === 'cero' ? 'inventario-estado-cero' : ''
                      }`}
                      style={{ borderLeft: `5px solid ${getEstadoColor(articulo.estado)}` }}
                    >
                      <div 
                        className="inventario-articulo-header"
                        onClick={() => toggleExpandirArticulo(articulo.CodigoArticulo)}
                      >
                        <div className="inventario-articulo-info">
                          <span className="inventario-articulo-codigo">{articulo.CodigoArticulo}</span>
                          <span className="inventario-articulo-descripcion">{articulo.DescripcionArticulo}</span>
                          {articulo.Descripcion2Articulo && (
                            <span className="inventario-articulo-descripcion2">{articulo.Descripcion2Articulo}</span>
                          )}
                          <div className="inventario-articulo-categorias">
                            {articulo.CodigoFamilia && (
                              <span className="inventario-familia-tag">Familia: {articulo.CodigoFamilia}</span>
                            )}
                            {articulo.CodigoSubfamilia && (
                              <span className="inventario-subfamilia-tag">Subfamilia: {articulo.CodigoSubfamilia}</span>
                            )}
                          </div>
                        </div>
                        <div className="inventario-articulo-total">
                          <span className="inventario-total-unidades" style={getStockStyle(articulo.totalStockBase)}>
                            {formatearUnidad(articulo.totalStockBase, articulo.UnidadBase)}
                            {articulo.estado === 'negativo' && (
                              <span className="badge-negativo">
                                <FiAlertTriangle /> NEGATIVO
                              </span>
                            )}
                            {articulo.estado === 'cero' && (
                              <span className="badge-cero">
                                <FiMinus /> CERO
                              </span>
                            )}
                            <span className="inventario-ubicaciones-count">
                              ({articulo.ubicaciones.length} ubicaciones)
                            </span>
                          </span>
                          <span className={`inventario-expand-icon ${articulosExpandidos[articulo.CodigoArticulo] ? 'expanded' : ''}`}>
                            {articulosExpandidos[articulo.CodigoArticulo] ? <FiChevronUp /> : <FiChevronDown />}
                          </span>
                        </div>
                      </div>
                      
                      {articulosExpandidos[articulo.CodigoArticulo] && (
                        <div className="inventario-ubicaciones-list">
                          <div className="inventario-ubicaciones-header">
                            <div className="header-cell">Almacén</div>
                            <div className="header-cell">Ubicación</div>
                            <div className="header-cell">Descripción</div>
                            <div className="header-cell">Unidad</div>
                            <div className="header-cell">Talla/Color</div>
                            <div className="header-cell">Cantidad</div>
                            <div className="header-cell">Acciones</div>
                          </div>
                          
                          {articulo.ubicaciones.map(ubicacion => (
                            <div key={ubicacion.clave} className={`inventario-ubicacion-item ${
                              ubicacion.esSinUbicacion ? 'sin-ubicacion' : ''
                            } ${
                              ubicacion.Cantidad < 0 ? 'stock-negativo' : ''
                            } ${
                              ubicacion.Cantidad === 0 ? 'stock-cero' : ''
                            }`}>
                              <div className="desktop-ubicacion-fields">
                                <div className="data-cell inventario-ubicacion-almacen">
                                  {ubicacion.NombreAlmacen}
                                  {ubicacion.esSinUbicacion && (
                                    <span className="badge-sin-ubicacion">
                                      <FiMapPin /> SIN UBICACIÓN
                                    </span>
                                  )}
                                  {ubicacion.Cantidad < 0 && (
                                    <span className="badge-negativo-item">
                                      <FiAlertTriangle /> NEGATIVO
                                    </span>
                                  )}
                                  {ubicacion.Cantidad === 0 && (
                                    <span className="badge-cero-item">
                                      <FiMinus /> CERO
                                    </span>
                                  )}
                                </div>
                                <div className="data-cell inventario-ubicacion-codigo">
                                  {ubicacion.Ubicacion || 'N/A'}
                                </div>
                                <div className="data-cell inventario-ubicacion-desc">
                                  {ubicacion.DescripcionUbicacion || 'Stock sin ubicación asignada'}
                                </div>
                                <div className="data-cell inventario-ubicacion-unidad">
                                  {ubicacion.UnidadStock || 'unidades'}
                                </div>
                                
                                <div className="data-cell inventario-ubicacion-talla-color">
                                  {ubicacion.TallaColorDisplay && ubicacion.TallaColorDisplay !== 'N/A' ? (
                                    <span 
                                      className="talla-color-display"
                                      style={getColorStyle(ubicacion.CodigoColor)}
                                    >
                                      {ubicacion.TallaColorDisplay}
                                    </span>
                                  ) : (
                                    'N/A'
                                  )}
                                </div>
                                
                                <div className="data-cell inventario-ubicacion-cantidad" style={getStockStyle(ubicacion.Cantidad)}>
                                  {formatearUnidad(ubicacion.Cantidad, ubicacion.UnidadStock)}
                                  {articulo.UnidadAlternativa && 
                                  ubicacion.UnidadStock === articulo.UnidadAlternativa && (
                                    <span className="inventario-conversion-info">
                                      ({formatearUnidad(ubicacion.Cantidad * (articulo.FactorConversion || 1), articulo.UnidadBase)})
                                    </span>
                                  )}
                                </div>
                                <div className="data-cell inventario-acciones-ubicacion">
                                  <button 
                                    className="inventario-btn-editar"
                                    onClick={() => iniciarEdicionCantidad(
                                      articulo.CodigoArticulo,
                                      ubicacion.NombreAlmacen,
                                      ubicacion.Cantidad,
                                      ubicacion.clave,
                                      ubicacion.CodigoAlmacen,
                                      ubicacion.Ubicacion,
                                      ubicacion.Partida,
                                      ubicacion.UnidadStock,
                                      ubicacion.CodigoColor,
                                      ubicacion.CodigoTalla01,
                                      ubicacion.esSinUbicacion
                                    )}
                                    title="Editar cantidad"
                                  >
                                    <FiEdit /> Editar
                                  </button>
                                  {ubicacion.MovPosicionLinea && !ubicacion.esSinUbicacion && (
                                    <button 
                                      className="inventario-btn-detalles"
                                      onClick={() => verDetalles(ubicacion.MovPosicionLinea)}
                                    >
                                      Detalles
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {totalPages > 1 && (
                <div className="inventario-pagination">
                  <div className="inventario-pagination-controls">
                    <button 
                      onClick={() => goToPage(currentPage - 1)} 
                      disabled={currentPage === 1}
                      className="inventario-pagination-btn"
                    >
                      Anterior
                    </button>
                    
                    <span className="inventario-page-info">Página {currentPage} de {totalPages}</span>
                    
                    <button 
                      onClick={() => goToPage(currentPage + 1)} 
                      disabled={currentPage === totalPages}
                      className="inventario-pagination-btn"
                    >
                      Siguiente
                    </button>
                  </div>
                  
                  <div className="inventario-page-size-selector">
                    <label>Artículos por página:</label>
                    <select 
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="inventario-page-size-select"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={75}>75</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {error ? (
                <div className="inventario-error-container">
                  <div className="inventario-error-icon">⚠️</div>
                  <h3>Error al cargar datos</h3>
                  <p>{error}</p>
                  <button 
                    className="inventario-btn-reload"
                    onClick={cargarHistorialAjustes}
                  >
                    <FiRefreshCw /> Recargar Historial
                  </button>
                </div>
              ) : loading.historial ? (
                <div className="inventario-loading-container">
                  <div className="inventario-spinner"></div>
                  <p>Cargando historial de ajustes...</p>
                </div>
              ) : historialAjustes.length === 0 ? (
                <div className="inventario-no-results">
                  <h3>No se encontraron ajustes</h3>
                  <p>No hay registros en el historial de ajustes</p>
                </div>
              ) : (
                <div className="inventario-historial-list">
                  {historialAjustes.map(item => {
                    const expandido = fechasExpandidas[item.fecha];
                    
                    return (
                      <div key={`${item.fecha}-${item.totalAjustes}`} className="inventario-historial-item">
                        <div 
                          className="inventario-fecha-header"
                          onClick={() => toggleExpandirFecha(item.fecha)}
                          style={{ background: expandido ? '#f0f7ff' : '#f5f7fa' }}
                        >
                          <div className="inventario-fecha-info">
                            <span className="inventario-fecha">{formatearFecha(item.fecha)}</span>
                            <span className="inventario-resumen">
                              {item.totalAjustes} ajustes realizados
                            </span>
                          </div>
                          <span className={`inventario-expand-icon ${expandido ? 'expanded' : ''}`}>
                            {expandido ? <FiChevronUp /> : <FiChevronDown />}
                          </span>
                        </div>
                        
                        {expandido && (
                          <div className="inventario-detalles-ajustes">
                            {item.detalles.map((detalle, idx) => (
                              <div key={`${detalle.CodigoArticulo}-${detalle.FechaRegistro}-${idx}`} 
                                   className={`inventario-ajuste-detalle ${detalle.Diferencia > 0 ? 'ajuste-positivo' : 'ajuste-negativo'}`}>
                                <div className="inventario-ajuste-detalle-header">
                                  <span className="inventario-ajuste-articulo">
                                    <strong>{detalle.CodigoArticulo}</strong> - {detalle.DescripcionArticulo}
                                  </span>
                                  <span className="inventario-ajuste-cantidad">
                                    {detalle.Diferencia > 0 ? '+' : ''}{detalle.Diferencia}
                                  </span>
                                </div>
                                
                                <div className="inventario-ajuste-detalle-info">
                                  <div>
                                    <span className="inventario-ajuste-label">Almacén:</span>
                                    <span>{detalle.NombreAlmacen} ({detalle.CodigoAlmacen})</span>
                                  </div>
                                  <div>
                                    <span className="inventario-ajuste-label">Ubicación:</span>
                                    <span>{detalle.Ubicacion} - {detalle.DescripcionUbicacion || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="inventario-ajuste-label">Comentario:</span>
                                    <span>{detalle.Comentario || 'Sin comentario'}</span>
                                  </div>
                                  <div>
                                    <span className="inventario-ajuste-label">Tipo:</span>
                                    <span className={`badge-${detalle.TipoRegistro?.toLowerCase() || 'movimiento'}`}>
                                      {detalle.TipoRegistro || 'MOVIMIENTO'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="inventario-ajuste-label">Fecha y hora:</span>
                                    <span>
                                      {formatearFecha(detalle.FechaRegistro)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 🔥 NUEVO: Modal para Nuevo Ajuste */}
      {modalNuevoAjuste && (
        <div className="inventario-modal-edicion">
          <div className="inventario-modal-contenido inventario-modal-grande">
            <button 
              className="inventario-cerrar-modal" 
              onClick={() => {
                setModalNuevoAjuste(false);
                resetearModalNuevoAjuste();
              }}
            >
              &times;
            </button>
            
            <h3>
              <FiPlusCircle /> Nuevo Ajuste de Inventario
            </h3>
            
            <div className="inventario-modal-details">
              <p>Complete los siguientes campos para crear un nuevo ajuste de inventario:</p>
            </div>
            
            {/* Búsqueda de artículo */}
            <div className="inventario-form-group">
              <label>Buscar Artículo *:</label>
              <input 
                type="text" 
                value={articuloBusqueda}
                onChange={(e) => setArticuloBusqueda(e.target.value)}
                className="inventario-input"
                placeholder="Ingrese código o descripción del artículo..."
                autoFocus
              />
              
              {resultadosBusqueda.length > 0 && (
                <div className="inventario-resultados-busqueda">
                  {resultadosBusqueda.map(articulo => (
                    <div 
                      key={articulo.CodigoArticulo}
                      className="inventario-resultado-item"
                      onClick={() => seleccionarArticulo(articulo)}
                    >
                      <div className="inventario-articulo-codigo">{articulo.CodigoArticulo}</div>
                      <div className="inventario-articulo-descripcion">{articulo.DescripcionArticulo}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Información del artículo seleccionado */}
            {articuloSeleccionado && (
              <div className="inventario-articulo-seleccionado">
                <h4>Artículo Seleccionado:</h4>
                <div className="inventario-articulo-info">
                  <strong>{articuloSeleccionado.CodigoArticulo}</strong> - {articuloSeleccionado.DescripcionArticulo}
                </div>
              </div>
            )}

            {/* Selector de almacén */}
            <div className="inventario-form-group">
              <label>Almacén *:</label>
              <select 
                value={almacenSeleccionado}
                onChange={(e) => setAlmacenSeleccionado(e.target.value)}
                className="inventario-select"
              >
                <option value="">Seleccionar almacén</option>
                <option value="CEN">CEN - Almacén Central</option>
                <option value="BCN">BCN - Almacén Barcelona</option>
                <option value="N5">N5 - Almacén N5</option>
                <option value="N1">N1 - Almacén N1</option>
                <option value="PK">PK - Almacén PK</option>
                <option value="5">5 - Almacén 5</option>
              </select>
            </div>

            {/* Selector de ubicación */}
            {almacenSeleccionado && (
              <div className="inventario-form-group">
                <label>Ubicación *:</label>
                <select 
                  value={ubicacionSeleccionada}
                  onChange={(e) => setUbicacionSeleccionada(e.target.value)}
                  className="inventario-select"
                >
                  <option value="">Seleccionar ubicación</option>
                  {ubicacionesDisponibles.map(ubicacion => (
                    <option key={ubicacion.Ubicacion} value={ubicacion.Ubicacion}>
                      {ubicacion.Ubicacion} - {ubicacion.DescripcionUbicacion}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Selector de unidad de medida */}
            {articuloSeleccionado && (
              <div className="inventario-form-group">
                <label>Unidad de Medida:</label>
                <select 
                  value={unidadMedidaSeleccionada}
                  onChange={(e) => setUnidadMedidaSeleccionada(e.target.value)}
                  className="inventario-select"
                >
                  {unidadesDisponibles.map(unidad => (
                    <option key={unidad} value={unidad}>
                      {unidad}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Selector de talla (si hay tallas disponibles) */}
            {tallasDisponibles.length > 0 && (
              <div className="inventario-form-group">
                <label>Talla:</label>
                <select 
                  value={tallaSeleccionada}
                  onChange={(e) => setTallaSeleccionada(e.target.value)}
                  className="inventario-select"
                >
                  <option value="">Seleccionar talla</option>
                  {tallasDisponibles.map(talla => (
                    <option key={talla} value={talla}>
                      {talla}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Selector de color (si hay colores disponibles) */}
            {coloresDisponibles.length > 0 && (
              <div className="inventario-form-group">
                <label>Color:</label>
                <select 
                  value={colorSeleccionado}
                  onChange={(e) => setColorSeleccionado(e.target.value)}
                  className="inventario-select"
                >
                  <option value="">Seleccionar color</option>
                  {coloresDisponibles.map(color => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Campo para cantidad */}
            <div className="inventario-form-group">
              <label>Cantidad *:</label>
              <input 
                type="number" 
                value={cantidadNuevoAjuste}
                onChange={(e) => setCantidadNuevoAjuste(e.target.value)}
                className="inventario-input"
                placeholder="Ingrese la cantidad..."
                step="any"
                min="0"
              />
            </div>

            <div className="inventario-modal-acciones">
              <button 
                className="inventario-btn-cancelar"
                onClick={() => {
                  setModalNuevoAjuste(false);
                  resetearModalNuevoAjuste();
                }}
              >
                Cancelar
              </button>
              <button 
                className="inventario-btn-guardar"
                onClick={guardarNuevoAjuste}
                disabled={!articuloSeleccionado || !almacenSeleccionado || !ubicacionSeleccionada || !cantidadNuevoAjuste}
              >
                <FiPlusCircle /> Crear Ajuste
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para edición de cantidad existente */}
      {editandoCantidad && (
        <div className="inventario-modal-edicion">
          <div className="inventario-modal-contenido">
            <h3>Editar Cantidad</h3>
            <div className="inventario-modal-details">
              <div className="inventario-detail-item">
                <span>Artículo:</span>
                <span>
                  <strong>{editandoCantidad.articulo}</strong> - {editandoCantidad.descripcionArticulo}
                </span>
              </div>
              <div className="inventario-detail-item">
                <span>Almacén:</span>
                <span>{editandoCantidad.nombreAlmacen}</span>
              </div>
              <div className="inventario-detail-item">
                <span>Ubicación:</span>
                <span>{editandoCantidad.ubicacionStr}</span>
              </div>
              <div className="inventario-detail-item">
                <span>Partida/Lote:</span>
                <span>{editandoCantidad.partida || 'N/A'}</span>
              </div>
            </div>
            
            <div className="inventario-form-group">
              <label>Unidad de Medida:</label>
              <select 
                value={unidadMedidaSeleccionadaEdit}
                onChange={(e) => setUnidadMedidaSeleccionadaEdit(e.target.value)}
                className="inventario-select"
              >
                {unidadesDisponiblesEdit.map(unidad => (
                  <option key={unidad} value={unidad}>
                    {unidad}
                  </option>
                ))}
              </select>
            </div>

            {tallasDisponiblesEdit.length > 0 && (
              <div className="inventario-form-group">
                <label>Talla:</label>
                <select 
                  value={tallaSeleccionadaEdit}
                  onChange={(e) => setTallaSeleccionadaEdit(e.target.value)}
                  className="inventario-select"
                >
                  <option value="">Seleccionar talla</option>
                  {tallasDisponiblesEdit.map(talla => (
                    <option key={talla} value={talla}>
                      {talla}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {coloresDisponiblesEdit.length > 0 && (
              <div className="inventario-form-group">
                <label>Color:</label>
                <select 
                  value={colorSeleccionadoEdit}
                  onChange={(e) => setColorSeleccionadoEdit(e.target.value)}
                  className="inventario-select"
                >
                  <option value="">Seleccionar color</option>
                  {coloresDisponiblesEdit.map(color => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="inventario-form-group">
              <label>Cantidad Actual:</label>
              <input 
                type="text" 
                value={formatearUnidad(editandoCantidad.cantidadActual, editandoCantidad.unidadStock)} 
                disabled 
                className="inventario-cantidad-actual"
                style={getStockStyle(editandoCantidad.cantidadActual)}
              />
            </div>
            
            <div className="inventario-form-group">
              <label>Nueva Cantidad:</label>
              <input 
                type="number" 
                value={nuevaCantidad}
                onChange={(e) => setNuevaCantidad(e.target.value)}
                autoFocus
                className="inventario-nueva-cantidad"
                step="any"
                placeholder="Ingrese la nueva cantidad..."
              />
            </div>
            
            <div className="inventario-modal-acciones">
              <button 
                className="inventario-btn-cancelar"
                onClick={() => {
                  setEditandoCantidad(null);
                  setUnidadMedidaSeleccionadaEdit('unidades');
                  setTallaSeleccionadaEdit('');
                  setColorSeleccionadoEdit('');
                }}
              >
                Cancelar
              </button>
              <button 
                className="inventario-btn-guardar"
                onClick={guardarAjustePendiente}
              >
                Guardar Ajuste
              </button>
            </div>
          </div>
        </div>
      )}
      
      {detallesModal && (
        <div className="inventario-modal-detalles">
          <div className="inventario-modal-contenido">
            <button className="inventario-cerrar-modal" onClick={() => setDetallesModal(null)}>
              &times;
            </button>
            
            <h3>Detalles de Variantes</h3>
            
            <div className="inventario-detalles-container">
              {detallesModal.length === 0 ? (
                <p>No hay detalles de variantes para este artículo</p>
              ) : (
                detallesModal.map((detalle, index) => (
                  <div key={`${detalle.color.codigo}-${detalle.grupoTalla.codigo}-${index}`} className="inventario-variante-grupo">
                    <div className="inventario-variante-header">
                      <span className="inventario-color-variante">
                        <strong>Color:</strong> {detalle.color.nombre}
                      </span>
                      <span className="inventario-talla-grupo">
                        <strong>Grupo Talla:</strong> {detalle.grupoTalla.nombre}
                      </span>
                    </div>
                    
                    <table className="inventario-detalles-table">
                      <thead>
                        <tr>
                          <th>Talla</th>
                          <th>Descripcion</th>
                          <th>Unidades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(detalle.tallas)
                          .filter(([_, talla]) => talla.unidades > 0)
                          .map(([codigoTalla, talla], idx) => (
                            <tr key={`${codigoTalla}-${idx}`}>
                              <td>{codigoTalla}</td>
                              <td>{talla.descripcion}</td>
                              <td>{talla.unidades}</td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    <div className="inventario-variante-total">
                      <strong>Total unidades:</strong> {detalle.unidades}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventarioPage;