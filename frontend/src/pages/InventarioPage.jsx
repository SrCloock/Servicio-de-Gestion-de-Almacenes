import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { 
  FiSearch, FiChevronDown, FiChevronUp, 
  FiFilter, FiEdit, FiX, 
  FiCheck, FiClock, FiList, FiRefreshCw, FiPlus, FiMinus,
  FiMapPin, FiPackage, FiDatabase, FiLayers, FiBox
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
  
  // Estados para nuevo inventario
  const [nuevoInventarioModal, setNuevoInventarioModal] = useState(false);
  const [articuloBuscado, setArticuloBuscado] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState(null);
  const [almacenes, setAlmacenes] = useState([]);
  const [almacenSeleccionado, setAlmacenSeleccionado] = useState('');
  const [ubicaciones, setUbicaciones] = useState([]);
  const [ubicacionSeleccionada, setUbicacionSeleccionada] = useState('');
  const [unidadMedidaSeleccionada, setUnidadMedidaSeleccionada] = useState('unidades');
  const [cantidadNuevoInventario, setCantidadNuevoInventario] = useState('');
  const [unidadesMedidaDisponibles, setUnidadesMedidaDisponibles] = useState(['unidades']);

  const formatearUnidad = (cantidad, unidad) => {
    // Validar y convertir cantidad
    let cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum)) {
      cantidadNum = 0;
    }
    
    if (!unidad || unidad.trim() === '') {
      unidad = 'unidad';
    }
    
    let cantidadFormateada = cantidadNum;
    if (!Number.isInteger(cantidadNum)) {
      cantidadFormateada = parseFloat(cantidadNum.toFixed(2));
    }

    const unidadesInvariables = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3', 'barra', 'metro'];
    
    const unidadLower = unidad.toLowerCase();
    
    if (unidadesInvariables.includes(unidadLower)) {
      return `${cantidadFormateada} ${unidad}`;
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

    if (cantidadFormateada === 1) {
      if (unidadLower === 'unidad' || unidadLower === 'unidades') {
        return '1 unidad';
      }
      return `1 ${unidad}`;
    } else {
      if (unidadLower === 'unidad' || unidadLower === 'unidades') {
        return `${cantidadFormateada} unidades`;
      }
      
      if (pluralesIrregulares[unidadLower]) {
        return `${cantidadFormateada} ${pluralesIrregulares[unidadLower]}`;
      }
      
      const ultimaLetra = unidad.charAt(unidad.length - 1);
      const penultimaLetra = unidad.charAt(unidad.length - 2);
      
      if (['a', 'e', 'i', 'o', 'u'].includes(ultimaLetra)) {
        return `${cantidadFormateada} ${unidad}s`;
      } else {
        return `${cantidadFormateada} ${unidad}es`;
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

  const agruparPorArticulo = useCallback((data) => {
    const agrupado = {};
    
    data.forEach(item => {
      // Filtrar solo los almacenes permitidos
      const almacenesPermitidos = ['CEN', 'BCN', 'N5', 'N1', 'PK', '5'];
      if (!almacenesPermitidos.includes(item.CodigoAlmacen)) {
        return;
      }
      
      const clave = item.ClaveUnica;
      
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
      
      // Validar y convertir CantidadBase
      let cantidadBase = parseFloat(item.CantidadBase);
      if (isNaN(cantidadBase)) {
        cantidadBase = 0;
      }
      
      // Validar y convertir Cantidad
      let cantidad = parseFloat(item.Cantidad);
      if (isNaN(cantidad)) {
        cantidad = 0;
      }
      
      const ubicacion = {
        clave,
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
        GrupoUnico: clave,
        MovPosicionLinea: item.MovPosicionLinea,
        detalles: null,
        esSinUbicacion: item.EsSinUbicacion === 1 || item.TipoStock === 'SIN_UBICACION'
      };
      
      agrupado[item.CodigoArticulo].ubicaciones.push(ubicacion);
      agrupado[item.CodigoArticulo].totalStockBase += cantidadBase;
    });
    
    Object.values(agrupado).forEach(articulo => {
      // Ordenar ubicaciones: primero las con ubicación, luego las sin ubicación
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
      
      // Validar totalStockBase
      if (isNaN(articulo.totalStockBase)) {
        articulo.totalStockBase = 0;
      }
      
      if (articulo.totalStockBase === 0) {
        articulo.estado = 'agotado';
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
      const response = await axios.get(
        'http://localhost:3000/inventario/stock-total-completo',
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
      const response = await axios.get(
        'http://localhost:3000/inventario/historial-ajustes',
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

  // Función para buscar artículos
  const buscarArticulos = async (termino) => {
    if (termino.length < 2) {
      setResultadosBusqueda([]);
      return;
    }
    
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/buscar-articulos?termino=${termino}`,
        { headers }
      );
      setResultadosBusqueda(response.data);
    } catch (error) {
      console.error('Error al buscar artículos:', error);
      setResultadosBusqueda([]);
    }
  };

  // Función para cargar almacenes
  const cargarAlmacenes = async () => {
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        'http://localhost:3000/almacenes',
        { headers }
      );
      setAlmacenes(response.data);
    } catch (error) {
      console.error('Error al cargar almacenes:', error);
    }
  };

  // Función para cargar ubicaciones de un almacén
  const cargarUbicaciones = async (codigoAlmacen) => {
    if (!codigoAlmacen) return;
    
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/ubicaciones/${codigoAlmacen}`,
        { headers }
      );
      setUbicaciones(response.data);
    } catch (error) {
      console.error('Error al cargar ubicaciones:', error);
      setUbicaciones([]);
    }
  };

  // Función para obtener información detallada del artículo
  const obtenerInfoArticulo = async (codigoArticulo) => {
    try {
      const headers = getAuthHeader();
      const response = await axios.get(
        `http://localhost:3000/articulos/${codigoArticulo}`,
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

  useEffect(() => {
    if (nuevoInventarioModal) {
      cargarAlmacenes();
    }
  }, [nuevoInventarioModal]);

  useEffect(() => {
    if (almacenSeleccionado) {
      cargarUbicaciones(almacenSeleccionado);
    }
  }, [almacenSeleccionado]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (articuloBuscado.length >= 2) {
        buscarArticulos(articuloBuscado);
      } else {
        setResultadosBusqueda([]);
      }
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [articuloBuscado]);

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

  const estadoOrden = { 'positivo': 1, 'negativo': 2, 'agotado': 3 };

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
    
    return { totalArticulos, totalUnidades, totalUbicaciones, stockSinUbicacion };
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

  const getStockStyle = (cantidad) => {
    if (cantidad === 0) return { color: '#e74c3c', fontWeight: 'bold' };
    if (cantidad < 0) return { color: '#f39c12', fontWeight: '600' };
    return { color: '#27ae60' };
  };

  const getEstadoColor = (estado) => {
    switch (estado) {
      case 'positivo': return '#2ecc71';
      case 'negativo': return '#f39c12';
      case 'agotado': return '#e74c3c';
      default: return '#7f8c8d';
    }
  };

  const iniciarEdicionCantidad = (articulo, nombreAlmacen, cantidadActual, clave, codigoAlmacen, ubicacionStr, partida, unidadStock, codigoColor, codigoTalla01, esSinUbicacion) => {
    const articuloCompleto = inventario.find(art => art.CodigoArticulo === articulo);
    
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
      unidadStock: editandoCantidad.unidadStock || 'unidades',
      nuevaCantidad: cantidad,
      codigoColor: editandoCantidad.codigoColor || '',
      codigoTalla01: editandoCantidad.codigoTalla01 || ''
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
      const response = await axios.get(
        `http://localhost:3000/stock/detalles?movPosicionLinea=${movPosicionLinea}`,
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
      const response = await axios.post(
        'http://localhost:3000/inventario/ajustar-completo',
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

  // Función para seleccionar artículo en el nuevo inventario
  const seleccionarArticulo = async (articulo) => {
    setArticuloSeleccionado(articulo);
    setArticuloBuscado(`${articulo.CodigoArticulo} - ${articulo.DescripcionArticulo}`);
    setResultadosBusqueda([]);
    
    // Obtener información detallada del artículo para las unidades de medida
    const infoArticulo = await obtenerInfoArticulo(articulo.CodigoArticulo);
    if (infoArticulo) {
      // Crear array de unidades disponibles (eliminar duplicados y valores nulos)
      const unidades = [
        infoArticulo.UnidadMedida2_,
        infoArticulo.UnidadMedidaAlternativa_
      ].filter((unidad, index, self) => 
        unidad && 
        unidad.trim() !== '' && 
        self.indexOf(unidad) === index
      );
      
      // Si no hay unidades, usar 'unidades' por defecto
      if (unidades.length === 0) {
        unidades.push('unidades');
      }
      
      setUnidadesMedidaDisponibles(unidades);
      setUnidadMedidaSeleccionada(unidades[0]); // Seleccionar la primera unidad por defecto
    }
  };

  // Función para guardar el nuevo inventario
  const guardarNuevoInventario = async () => {
    if (!articuloSeleccionado || !almacenSeleccionado || !cantidadNuevoInventario) {
      alert('Por favor, complete todos los campos obligatorios');
      return;
    }

    const cantidad = parseFloat(cantidadNuevoInventario);
    if (isNaN(cantidad) || cantidad < 0) {
      alert('Por favor ingrese una cantidad válida');
      return;
    }

    const nuevoAjuste = {
      articulo: articuloSeleccionado.CodigoArticulo,
      descripcionArticulo: articuloSeleccionado.DescripcionArticulo,
      codigoAlmacen: almacenSeleccionado,
      ubicacionStr: ubicacionSeleccionada || 'SIN UBICACIÓN',
      partida: '',
      unidadStock: unidadMedidaSeleccionada,
      nuevaCantidad: cantidad,
      codigoColor: '',
      codigoTalla01: ''
    };

    try {
      const headers = getAuthHeader();
      const response = await axios.post(
        'http://localhost:3000/inventario/ajustar-completo',
        { ajustes: [nuevoAjuste] },
        { headers }
      );

      if (response.data.success) {
        alert('Nuevo inventario creado correctamente');
        setNuevoInventarioModal(false);
        // Limpiar formulario
        setArticuloBuscado('');
        setArticuloSeleccionado(null);
        setAlmacenSeleccionado('');
        setUbicacionSeleccionada('');
        setUnidadMedidaSeleccionada('unidades');
        setUnidadesMedidaDisponibles(['unidades']);
        setCantidadNuevoInventario('');
        // Recargar inventario
        cargarInventario();
      }
    } catch (error) {
      console.error('Error al crear nuevo inventario:', error);
      alert('Error al crear nuevo inventario: ' + (error.response?.data?.mensaje || error.message));
    }
  };

  // Función para limpiar el formulario de nuevo inventario
  const limpiarFormularioNuevoInventario = () => {
    setArticuloBuscado('');
    setArticuloSeleccionado(null);
    setAlmacenSeleccionado('');
    setUbicacionSeleccionada('');
    setUnidadMedidaSeleccionada('unidades');
    setUnidadesMedidaDisponibles(['unidades']);
    setCantidadNuevoInventario('');
    setResultadosBusqueda([]);
    setNuevoInventarioModal(false);
  };

  return (
    <div className="inventario-container">
      <Navbar />
      
      <div className="inventario-content">
        <div className="inventario-search-and-refresh">
          <div className="inventario-search-container">
            <input
              type="text"
              placeholder={activeTab === 'inventario' ? "Buscar artículo..." : "Buscar en historial..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="inventario-search-input"
              aria-label="Buscar"
            />
          </div>
          <div className="inventario-action-buttons">
            <button className="inventario-refresh-btn" onClick={refreshInventario} aria-label="Actualizar">
              <FiRefreshCw /> Actualizar
            </button>
            {activeTab === 'inventario' && (
              <button 
                className="inventario-nuevo-btn" 
                onClick={() => setNuevoInventarioModal(true)}
              >
                <FiPlus /> Nuevo Inventario
              </button>
            )}
          </div>
        </div>

        <div className="inventario-tabs-container">
          <button 
            className={`inventario-tab-btn ${activeTab === 'inventario' ? 'inventario-active' : ''}`}
            onClick={() => setActiveTab('inventario')}
            aria-label="Ver inventario actual"
          >
            <FiList /> Inventario Actual
          </button>
          <button 
            className={`inventario-tab-btn ${activeTab === 'historial' ? 'inventario-active' : ''}`}
            onClick={() => setActiveTab('historial')}
            aria-label="Ver historial de ajustes"
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
                        <strong>{formatearUnidad(ajuste.nuevaCantidad, ajuste.unidadStock)}</strong>
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
                      className={`inventario-item ${articulo.estado === 'agotado' ? 'inventario-estado-agotado' : ''} ${articulo.estado === 'negativo' ? 'inventario-estado-negativo' : ''}`}
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
                          <span className="inventario-total-unidades">
                            {formatearUnidad(articulo.totalStockBase, articulo.UnidadBase)}
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
                            <div className="header-cell">Cantidad</div>
                            <div className="header-cell">Acciones</div>
                          </div>
                          
                          {articulo.ubicaciones.map(ubicacion => (
                            <div key={ubicacion.clave} className={`inventario-ubicacion-item ${ubicacion.esSinUbicacion ? 'sin-ubicacion' : ''}`}>
                              <div className="desktop-ubicacion-fields">
                                <div className="data-cell inventario-ubicacion-almacen">
                                  {ubicacion.NombreAlmacen}
                                  {ubicacion.esSinUbicacion && (
                                    <span className="badge-sin-ubicacion">
                                      <FiMapPin /> SIN UBICACIÓN
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
                                <div className="data-cell inventario-ubicacion-cantidad" style={getStockStyle(ubicacion.Cantidad)}>
                                  {formatearUnidad(ubicacion.Cantidad, ubicacion.UnidadStock)}
                                  {articulo.UnidadAlternativa && 
                                  ubicacion.UnidadStock === articulo.UnidadAlternativa && (
                                    <span className="inventario-conversion-info">
                                      ({formatearUnidad(ubicacion.CantidadBase, articulo.UnidadBase)})
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
                <span>Unidad:</span>
                <span>{editandoCantidad.unidadStock || 'unidades'}</span>
              </div>
            </div>
            
            <div className="inventario-form-group">
              <label>Cantidad Actual:</label>
              <input 
                type="text" 
                value={formatearUnidad(editandoCantidad.cantidadActual, editandoCantidad.unidadStock)} 
                disabled 
                className="inventario-cantidad-actual"
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
              />
            </div>
            
            <div className="inventario-modal-acciones">
              <button 
                className="inventario-btn-cancelar"
                onClick={() => setEditandoCantidad(null)}
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
      
      {nuevoInventarioModal && (
        <div className="inventario-modal-edicion">
          <div className="inventario-modal-contenido">
            <h3><FiBox /> Nuevo Inventario</h3>
            
            <div className="inventario-form-group">
              <label>Artículo *:</label>
              <div className="inventario-buscador-container">
                <input 
                  type="text"
                  placeholder="Buscar artículo por código o descripción..."
                  value={articuloBuscado}
                  onChange={(e) => setArticuloBuscado(e.target.value)}
                  className="inventario-buscador-input"
                />
                {resultadosBusqueda.length > 0 && (
                  <div className="inventario-resultados-busqueda">
                    {resultadosBusqueda.map(articulo => (
                      <div 
                        key={articulo.CodigoArticulo}
                        className="inventario-resultado-item"
                        onClick={() => seleccionarArticulo(articulo)}
                      >
                        <strong>{articulo.CodigoArticulo}</strong> - {articulo.DescripcionArticulo}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="inventario-form-group">
              <label>Almacén *:</label>
              <select 
                value={almacenSeleccionado}
                onChange={(e) => setAlmacenSeleccionado(e.target.value)}
                className="inventario-select"
              >
                <option value="">Seleccionar almacén</option>
                {almacenes.map(almacen => (
                  <option key={almacen.CodigoAlmacen} value={almacen.CodigoAlmacen}>
                    {almacen.NombreAlmacen} ({almacen.CodigoAlmacen})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="inventario-form-group">
              <label>Ubicación:</label>
              <select 
                value={ubicacionSeleccionada}
                onChange={(e) => setUbicacionSeleccionada(e.target.value)}
                className="inventario-select"
                disabled={!almacenSeleccionado}
              >
                <option value="">Seleccionar ubicación</option>
                {ubicaciones.map(ubicacion => (
                  <option key={ubicacion.Ubicacion} value={ubicacion.Ubicacion}>
                    {ubicacion.Ubicacion} - {ubicacion.DescripcionUbicacion}
                  </option>
                ))}
                <option value="SIN UBICACIÓN">SIN UBICACIÓN</option>
              </select>
            </div>
            
            <div className="inventario-form-group">
              <label>Unidad de Medida *:</label>
              <select 
                value={unidadMedidaSeleccionada}
                onChange={(e) => setUnidadMedidaSeleccionada(e.target.value)}
                className="inventario-select"
              >
                {unidadesMedidaDisponibles.map(unidad => (
                  <option key={unidad} value={unidad}>
                    {unidad}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="inventario-form-group">
              <label>Cantidad *:</label>
              <input 
                type="number"
                value={cantidadNuevoInventario}
                onChange={(e) => setCantidadNuevoInventario(e.target.value)}
                className="inventario-input"
                placeholder="0"
                step="any"
                min="0"
              />
            </div>
            
            <div className="inventario-modal-acciones">
              <button 
                className="inventario-btn-cancelar"
                onClick={limpiarFormularioNuevoInventario}
              >
                Cancelar
              </button>
              <button 
                className="inventario-btn-guardar"
                onClick={guardarNuevoInventario}
                disabled={!articuloSeleccionado || !almacenSeleccionado || !cantidadNuevoInventario}
              >
                <FiCheck /> Crear Inventario
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