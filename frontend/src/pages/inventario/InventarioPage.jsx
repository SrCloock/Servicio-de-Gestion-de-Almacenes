// ── InventarioPage.jsx ────────────────────────────────────────────────────────
import '../../styles/InventarioPage.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API from '../../helpers/api';
import { getAuthHeader } from '../../helpers/authHelper';
import Navbar from '../../components/Navbar';
import { MenuItem, Pagination, Paper, Stack, TextField, Typography } from '@mui/material';
import { FiCheck, FiChevronDown, FiChevronUp, FiClock, FiDatabase, FiEdit, FiFilter, FiLayers, FiList, FiMapPin, FiMinus, FiPackage, FiPlus, FiPlusCircle, FiRefreshCw, FiX } from 'react-icons/fi';

import {
  getDefaultHistoryFilters, normalizarTexto, normalizarUbicacionDisplay,
  normalizarUbicacionOption, formatTallaColor, formatearUnidad, formatearFecha,
  getColorStyle, getStockStyle, getEstadoColor, estadoOrden, construirResumenAjustePendiente
} from './InventarioHelpers';

import {
  InventarioHeader, InventarioTabs, InventarioFilters,
  InventarioResumenCards, InventarioList, InventarioStateView
} from './InventarioComponents';

import {
  NuevoAjusteDialog, EditarCantidadDialog, InventarioDetallesDialog
} from './InventarioDialogs';

// FIX: import de permisos
import { usePermissions } from '../../PermissionsManager';

const INVENTARIO_BATCH_SIZE = 30;
const UBICACIONES_BATCH_SIZE = 50;

const InventarioPage = () => {
  // FIX: guard de permisos — debe ir antes que cualquier lógica de negocio
  const { canViewInventory } = usePermissions();

  const [activeTab, setActiveTab] = useState('inventario');
  const [inventario, setInventario] = useState([]);
  const [historialAjustes, setHistorialAjustes] = useState([]);
  const [articulosExpandidos, setArticulosExpandidos] = useState({});
  const [fechasExpandidas, setFechasExpandidas] = useState({});
  const [historialPage, setHistorialPage] = useState(1);
  const [historialLimit, setHistorialLimit] = useState(20);
  const [historialPagination, setHistorialPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1, hasPrev: false, hasNext: false });
  const [historialFilters, setHistorialFilters] = useState(getDefaultHistoryFilters);
  const [loading, setLoading] = useState({ inventario: true, historial: true });
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ codigo: '', almacen: '', ubicacion: '', familia: '', subfamilia: '' });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [inventarioHasMore, setInventarioHasMore] = useState(false);
  const [inventarioNextOffset, setInventarioNextOffset] = useState(0);
  const [inventarioLoadingMore, setInventarioLoadingMore] = useState(false);
  const [ajustesPendientes, setAjustesPendientes] = useState([]);
  const [editandoCantidad, setEditandoCantidad] = useState(null);
  const [nuevaCantidad, setNuevaCantidad] = useState('');
  const [detallesModal, setDetallesModal] = useState(null);
  const [cargandoDetalles, setCargandoDetalles] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [modalNuevoAjuste, setModalNuevoAjuste] = useState(false);
  const [articuloBusqueda, setArticuloBusqueda] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState(null);
  const [almacenSeleccionado, setAlmacenSeleccionado] = useState('');
  const [almacenesDisponibles, setAlmacenesDisponibles] = useState([]);
  const [ubicacionSeleccionada, setUbicacionSeleccionada] = useState('');
  const [ubicacionesDisponibles, setUbicacionesDisponibles] = useState([]);
  const [ubicacionBusqueda, setUbicacionBusqueda] = useState('');
  const [cargandoUbicaciones, setCargandoUbicaciones] = useState(false);
  const [ubicacionesHasMore, setUbicacionesHasMore] = useState(false);
  const [ubicacionesNextOffset, setUbicacionesNextOffset] = useState(0);
  const [unidadMedidaSeleccionada, setUnidadMedidaSeleccionada] = useState('');
  const [tallaSeleccionada, setTallaSeleccionada] = useState('');
  const [colorSeleccionado, setColorSeleccionado] = useState('');
  const [cantidadNuevoAjuste, setCantidadNuevoAjuste] = useState('');
  const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
  const [tallasDisponibles, setTallasDisponibles] = useState([]);
  const [coloresDisponibles, setColoresDisponibles] = useState([]);
  const [mostrarSelectorTalla, setMostrarSelectorTalla] = useState(false);
  const [mostrarSelectorColor, setMostrarSelectorColor] = useState(false);
  const [unidadesDisponiblesEdit, setUnidadesDisponiblesEdit] = useState(['unidades']);
  const [tallasDisponiblesEdit, setTallasDisponiblesEdit] = useState([]);
  const [coloresDisponiblesEdit, setColoresDisponiblesEdit] = useState([]);
  const [unidadMedidaSeleccionadaEdit, setUnidadMedidaSeleccionadaEdit] = useState('unidades');
  const [tallaSeleccionadaEdit, setTallaSeleccionadaEdit] = useState('');
  const [colorSeleccionadoEdit, setColorSeleccionadoEdit] = useState('');

  const ubicacionesRequestRef = useRef(0);
  const omitirSiguienteBusquedaUbicacionRef = useRef(false);
  const inventarioRequestRef = useRef(0);

  // FIX: render del guard — después de todos los hooks (reglas de hooks de React)
  // Los hooks deben llamarse siempre, el return condicional va después
  if (!canViewInventory) {
    return (
      <div className="inventario-container">
        <Navbar />
        <div className="inventario-content">
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>Acceso restringido</p>
            <p style={{ color: '#666' }}>No tienes permiso para acceder a esta sección.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── API calls ───────────────────────────────────────────────────────────────
  const buscarArticulos = async (termino) => {
    if (!termino || termino.trim().length < 2) { setResultadosBusqueda([]); return; }
    try {
      const response = await API.get(`/buscar-articulos?termino=${termino}`, { headers: getAuthHeader() });
      setResultadosBusqueda(response.data);
    } catch { setResultadosBusqueda([]); }
  };

  const cargarAlmacenesNuevoAjuste = async () => {
    try {
      const response = await API.get('/inventario/almacenes-ajuste', { headers: getAuthHeader() });
      setAlmacenesDisponibles(Array.isArray(response.data) ? response.data : []);
    } catch { setAlmacenesDisponibles([]); }
  };

  const cargarUbicacionesPorAlmacen = async (params) => {
    const { codigoAlmacen, search = '', offset = 0, append = false } =
      typeof params === 'string' ? { codigoAlmacen: params } : (params || {});
    if (!codigoAlmacen) { setUbicacionesDisponibles([]); setUbicacionesHasMore(false); setUbicacionesNextOffset(0); return; }
    const requestId = Date.now() + Math.random();
    ubicacionesRequestRef.current = requestId;
    try {
      setCargandoUbicaciones(true);
      const response = await API.get('/inventario/ubicaciones-ajuste', {
        headers: getAuthHeader(),
        params: { codigoAlmacen, search, offset, limit: UBICACIONES_BATCH_SIZE }
      });
      if (ubicacionesRequestRef.current !== requestId) return;
      const payload = response.data || {};
      const items = Array.isArray(payload.items) ? payload.items.map(normalizarUbicacionOption).filter(Boolean) : [];
      setUbicacionesDisponibles((prev) => {
        if (!append) return items;
        const existentes = new Set(prev.map((u) => u.Ubicacion));
        return [...prev, ...items.filter((u) => !existentes.has(u.Ubicacion))];
      });
      setUbicacionesHasMore(Boolean(payload.hasMore));
      setUbicacionesNextOffset(Number(payload.nextOffset) || 0);
    } catch { setUbicacionesDisponibles([]); setUbicacionesHasMore(false); setUbicacionesNextOffset(0); }
    finally { if (ubicacionesRequestRef.current === requestId) setCargandoUbicaciones(false); }
  };

  const handleAlmacenNuevoAjusteChange = (codigoAlmacen) => {
    setAlmacenSeleccionado(codigoAlmacen);
    setUbicacionSeleccionada('');
    setUbicacionBusqueda('');
    setUbicacionesDisponibles([]);
    setUbicacionesHasMore(false);
    setUbicacionesNextOffset(0);
  };

  const handleUbicacionesScroll = (event) => {
    const listboxNode = event.currentTarget;
    const reachedBottom = listboxNode.scrollTop + listboxNode.clientHeight >= listboxNode.scrollHeight - 48;
    if (!reachedBottom || cargandoUbicaciones || !ubicacionesHasMore || !almacenSeleccionado) return;
    cargarUbicacionesPorAlmacen({ codigoAlmacen: almacenSeleccionado, search: ubicacionBusqueda.trim(), offset: ubicacionesNextOffset, append: true });
  };

  const seleccionarArticulo = async (articulo) => {
    try {
      const response = await API.get(`/articulos/${articulo.CodigoArticulo}/variantes-contexto`, { headers: getAuthHeader() });
      const contexto = response.data;
      const articuloContexto = contexto.articulo || {};
      setArticuloSeleccionado({ ...articulo, ...articuloContexto });
      const unidades = [articuloContexto.UnidadMedida2_, articuloContexto.UnidadMedidaAlternativa_]
        .filter((u, i, self) => u && u.trim() !== '' && self.indexOf(u) === i);
      if (unidades.length === 0) unidades.push('unidades');
      setUnidadesDisponibles(unidades);
      setUnidadMedidaSeleccionada(unidades[0]);
      const tallasContexto = Array.isArray(contexto.tallas) ? contexto.tallas : [];
      const coloresContexto = Array.isArray(contexto.colores) ? contexto.colores : [];
      const debeMostrarTalla = Boolean(contexto.usaTallas && tallasContexto.length > 0);
      const debeMostrarColor = Boolean(contexto.usaColores && coloresContexto.length > 0);
      setTallasDisponibles(tallasContexto);
      setColoresDisponibles(coloresContexto);
      setMostrarSelectorTalla(debeMostrarTalla);
      setMostrarSelectorColor(debeMostrarColor);
      setTallaSeleccionada(debeMostrarTalla && tallasContexto.length === 1 ? tallasContexto[0].codigo : '');
      setColorSeleccionado(debeMostrarColor && coloresContexto.length === 1 ? coloresContexto[0].codigo : '');
      setResultadosBusqueda([]);
      setArticuloBusqueda(articulo.CodigoArticulo);
    } catch { alert('Error al cargar la información del artículo'); }
  };

  const guardarNuevoAjuste = async () => {
    if (!articuloSeleccionado || !almacenSeleccionado || !ubicacionSeleccionada || !cantidadNuevoAjuste) {
      alert('Por favor complete todos los campos obligatorios'); return;
    }
    const cantidad = parseFloat(cantidadNuevoAjuste);
    if (isNaN(cantidad)) { alert('Por favor ingrese un número válido'); return; }
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
      const response = await API.post('/inventario/ajustar-completo', { ajustes: [nuevoAjuste] }, { headers: getAuthHeader() });
      if (response.data.success) {
        alert('Nuevo ajuste creado correctamente');
        setModalNuevoAjuste(false);
        resetearModalNuevoAjuste();
        cargarInventario({ reset: true });
        cargarHistorialAjustes();
      }
    } catch (error) {
      const msg = error.response?.data?.error || error.response?.data?.mensaje || error.message;
      alert(`Error al guardar el ajuste: ${msg}`);
    }
  };

  const resetearModalNuevoAjuste = () => {
    setArticuloBusqueda(''); setResultadosBusqueda([]); setArticuloSeleccionado(null);
    setAlmacenSeleccionado(''); setUbicacionSeleccionada(''); setUbicacionBusqueda('');
    setUbicacionesDisponibles([]); setCargandoUbicaciones(false);
    setUbicacionesHasMore(false); setUbicacionesNextOffset(0);
    setUnidadMedidaSeleccionada(''); setTallaSeleccionada(''); setColorSeleccionado('');
    setCantidadNuevoAjuste(''); setUnidadesDisponibles([]);
    setTallasDisponibles([]); setColoresDisponibles([]);
    setMostrarSelectorTalla(false); setMostrarSelectorColor(false);
  };

  const cerrarNuevoAjuste = () => { setModalNuevoAjuste(false); resetearModalNuevoAjuste(); };
  const cerrarEdicionCantidad = () => { setEditandoCantidad(null); setUnidadMedidaSeleccionadaEdit('unidades'); setTallaSeleccionadaEdit(''); setColorSeleccionadoEdit(''); };

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      if (articuloBusqueda.trim().length >= 2) buscarArticulos(articuloBusqueda);
      else setResultadosBusqueda([]);
    }, 300);
    return () => clearTimeout(t);
  }, [articuloBusqueda]);

  useEffect(() => {
    if (!almacenSeleccionado) { setUbicacionesDisponibles([]); setUbicacionesHasMore(false); setUbicacionesNextOffset(0); return; }
    if (omitirSiguienteBusquedaUbicacionRef.current) { omitirSiguienteBusquedaUbicacionRef.current = false; return; }
    const t = setTimeout(() => {
      cargarUbicacionesPorAlmacen({ codigoAlmacen: almacenSeleccionado, search: ubicacionBusqueda.trim(), offset: 0, append: false });
    }, 300);
    return () => clearTimeout(t);
  }, [almacenSeleccionado, ubicacionBusqueda]);

  useEffect(() => { if (modalNuevoAjuste) cargarAlmacenesNuevoAjuste(); }, [modalNuevoAjuste]);

  // ── Agrupaciones ─────────────────────────────────────────────────────────────
  const agruparHistorialPorFecha = useCallback((items = []) => {
    const agrupado = items.reduce((acc, item) => {
      const fechaKey = new Date(item.FechaRegistro).toISOString().split('T')[0];
      if (!acc[fechaKey]) acc[fechaKey] = { fecha: fechaKey, totalAjustes: 0, detalles: [] };
      acc[fechaKey].detalles.push(item);
      acc[fechaKey].totalAjustes += 1;
      return acc;
    }, {});
    return Object.values(agrupado).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, []);

  const agruparPorArticulo = useCallback((data) => {
    const agrupado = {};
    data.forEach(item => {
      const codigoArticuloStock = item.CodigoArticuloStock || item.CodigoArticulo;
      const claveUnica = `${codigoArticuloStock}_${item.CodigoAlmacen}_${item.Ubicacion}_${item.UnidadStock || 'unidades'}_${item.Partida || ''}_${item.CodigoColor_ || ''}_${item.CodigoTalla01_ || ''}`;
      if (!agrupado[item.CodigoArticulo]) {
        agrupado[item.CodigoArticulo] = {
          CodigoArticulo: item.CodigoArticulo,
          CodigoArticuloStock: codigoArticuloStock,
          DescripcionArticulo: item.DescripcionArticulo,
          Descripcion2Articulo: item.Descripcion2Articulo,
          CodigoFamilia: item.CodigoFamilia,
          CodigoSubfamilia: item.CodigoSubfamilia,
          UnidadBase: item.UnidadBase,
          UnidadAlternativa: item.UnidadAlternativa,
          FactorConversion: item.FactorConversion,
          ubicacionPrincipalPorAlmacen: {},
          ubicaciones: [],
          totalStockBase: 0,
          estado: 'positivo'
        };
      }
      let cantidadBase = parseFloat(item.CantidadBase);
      if (isNaN(cantidadBase)) cantidadBase = 0;
      let cantidad = parseFloat(item.Cantidad);
      if (isNaN(cantidad)) cantidad = 0;
      const existeDuplicado = agrupado[item.CodigoArticulo].ubicaciones.some(u => u.clave === claveUnica);
      if (!existeDuplicado) {
        agrupado[item.CodigoArticulo].ubicaciones.push({
          clave: claveUnica,
          CodigoArticuloStock: codigoArticuloStock,
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
          MovPosicionLinea: item.MovPosicionLinea,
          detalles: null,
          esSinUbicacion: item.EsSinUbicacion === 1,
          sinRegistrosAcumuladoStock: item.SinRegistrosAcumuladoStock === 1,
          TallaColorDisplay: formatTallaColor(item.CodigoTalla01_, item.CodigoColor_),
          esPrincipal: false
        });
        agrupado[item.CodigoArticulo].totalStockBase += cantidadBase;
      }
    });

    Object.values(agrupado).forEach(articulo => {
      const almacenes = [...new Set(articulo.ubicaciones.map(u => u.CodigoAlmacen))];
      almacenes.forEach(alm => {
        const ubsAlm = articulo.ubicaciones.filter(u => u.CodigoAlmacen === alm && !u.esSinUbicacion);
        if (ubsAlm.length === 1) {
          ubsAlm[0].esPrincipal = true;
        } else if (ubsAlm.length > 1) {
          const principal = ubsAlm.reduce((a, b) => Math.abs(a.CantidadBase) >= Math.abs(b.CantidadBase) ? a : b);
          principal.esPrincipal = true;
        }
      });
      articulo.ubicaciones.sort((a, b) => {
        if (a.esPrincipal && !b.esPrincipal) return -1;
        if (!a.esPrincipal && b.esPrincipal) return 1;
        if (a.esSinUbicacion && !b.esSinUbicacion) return 1;
        if (!a.esSinUbicacion && b.esSinUbicacion) return -1;
        if (a.NombreAlmacen < b.NombreAlmacen) return -1;
        if (a.NombreAlmacen > b.NombreAlmacen) return 1;
        return a.Ubicacion < b.Ubicacion ? -1 : a.Ubicacion > b.Ubicacion ? 1 : 0;
      });
      if (isNaN(articulo.totalStockBase)) articulo.totalStockBase = 0;
      if (articulo.totalStockBase === 0) articulo.estado = 'cero';
      else if (articulo.totalStockBase < 0) articulo.estado = 'negativo';
      else articulo.estado = 'positivo';
    });

    return Object.values(agrupado);
  }, []);

  const inventarioFilters = useMemo(() => ({
    codigo: String(filters.codigo || '').trim(),
    almacen: String(filters.almacen || '').trim(),
    ubicacion: String(filters.ubicacion || '').trim(),
    familia: String(filters.familia || '').trim(),
    subfamilia: String(filters.subfamilia || '').trim()
  }), [filters]);

  const mergeInventarioItems = useCallback((prevItems, nextItems) => {
    const mergedMap = new Map(prevItems.map((item) => [item.CodigoArticulo, item]));
    nextItems.forEach((item) => mergedMap.set(item.CodigoArticulo, item));
    return Array.from(mergedMap.values());
  }, []);

  // ── Carga datos ──────────────────────────────────────────────────────────────
  const cargarInventario = useCallback(async ({ reset = false, offset = 0, filtros = inventarioFilters } = {}) => {
    const requestId = inventarioRequestRef.current + 1;
    inventarioRequestRef.current = requestId;
    try {
      if (reset) { setLoading(prev => ({ ...prev, inventario: true })); setInventarioLoadingMore(false); }
      else setInventarioLoadingMore(true);
      setError('');
      const response = await API.get('/inventario/stock-total-lote', {
        headers: getAuthHeader(),
        params: { offset, limit: INVENTARIO_BATCH_SIZE, ...filtros }
      });
      if (inventarioRequestRef.current !== requestId) return;
      const payload = response.data || {};
      const items = Array.isArray(payload) ? payload : (payload.items || []);
      const groupedItems = agruparPorArticulo(items);
      const hasMore = Array.isArray(payload) ? false : Boolean(payload.hasMore);
      const nextOffset = Array.isArray(payload) ? groupedItems.length : Number(payload.nextOffset || 0);
      setInventario((prev) => (reset ? groupedItems : mergeInventarioItems(prev, groupedItems)));
      setInventarioHasMore(hasMore);
      setInventarioNextOffset(nextOffset);
      setLoading(prev => ({ ...prev, inventario: false }));
      setInventarioLoadingMore(false);
    } catch (error) {
      if (inventarioRequestRef.current !== requestId) return;
      setError(error?.response?.data?.mensaje || error?.message || 'Error al cargar el inventario.');
      setLoading(prev => ({ ...prev, inventario: false }));
      setInventarioLoadingMore(false);
    }
  }, [agruparPorArticulo, inventarioFilters, mergeInventarioItems]);

  const cargarHistorialAjustes = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, historial: true }));
      setError('');
      const response = await API.get('/inventario/historial-ajustes-v2', {
        headers: getAuthHeader(),
        params: { page: historialPage, limit: historialLimit, fechaDesde: historialFilters.fechaDesde, fechaHasta: historialFilters.fechaHasta }
      });
      const items = response.data?.items || [];
      setHistorialAjustes(agruparHistorialPorFecha(items));
      setHistorialPagination(response.data?.pagination || { page: historialPage, limit: historialLimit, total: items.length, totalPages: 1, hasPrev: false, hasNext: false });
      setLoading(prev => ({ ...prev, historial: false }));
    } catch {
      setError('Error al cargar el historial de ajustes.');
      setLoading(prev => ({ ...prev, historial: false }));
    }
  }, [agruparHistorialPorFecha, historialFilters.fechaDesde, historialFilters.fechaHasta, historialLimit, historialPage]);

  useEffect(() => { if (activeTab === 'historial') cargarHistorialAjustes(); }, [activeTab, cargarHistorialAjustes]);

  useEffect(() => {
    if (activeTab !== 'inventario') return;
    setArticulosExpandidos({});
    setInventario([]);
    setInventarioHasMore(false);
    setInventarioNextOffset(0);
    cargarInventario({ reset: true, offset: 0, filtros: inventarioFilters });
  }, [activeTab, cargarInventario, inventarioFilters]);

  const refreshInventario = useCallback(() => {
    if (activeTab === 'inventario') {
      setArticulosExpandidos({});
      setInventario([]);
      setInventarioHasMore(false);
      setInventarioNextOffset(0);
      cargarInventario({ reset: true, offset: 0, filtros: inventarioFilters });
    } else {
      cargarHistorialAjustes();
    }
  }, [activeTab, cargarHistorialAjustes, cargarInventario, inventarioFilters]);

  const cargarMasInventario = useCallback(() => {
    if (!inventarioHasMore || inventarioLoadingMore || loading.inventario) return;
    cargarInventario({ reset: false, offset: inventarioNextOffset, filtros: inventarioFilters });
  }, [cargarInventario, inventarioFilters, inventarioHasMore, inventarioLoadingMore, inventarioNextOffset, loading.inventario]);

  // ── Variantes ─────────────────────────────────────────────────────────────
  const cargarVariantesArticulo = useCallback(async (codigoArticulo, unidadActual, tallaActual = '', colorActual = '') => {
    try {
      const response = await API.get(`/articulos/${codigoArticulo}/variantes-contexto`, { headers: getAuthHeader() });
      const contexto = response.data || {};
      const articuloContexto = contexto.articulo || {};
      const unidades = [articuloContexto.UnidadMedida2_, articuloContexto.UnidadMedidaAlternativa_]
        .filter((u, i, self) => u && u.trim() !== '' && self.indexOf(u) === i);
      if (unidades.length === 0) unidades.push('unidades');
      setUnidadesDisponiblesEdit(unidades);
      setUnidadMedidaSeleccionadaEdit(unidadActual || unidades[0]);
      setTallasDisponiblesEdit(Array.isArray(contexto.tallas) ? contexto.tallas.map((t) => t.codigo) : []);
      setColoresDisponiblesEdit(Array.isArray(contexto.colores) ? contexto.colores.map((c) => c.codigo) : []);
      setTallaSeleccionadaEdit(tallaActual || '');
      setColorSeleccionadoEdit(colorActual || '');
    } catch {
      setUnidadesDisponiblesEdit(['unidades']);
      setTallasDisponiblesEdit([]);
      setColoresDisponiblesEdit([]);
    }
  }, []);

  // ── Handlers UI ──────────────────────────────────────────────────────────────
  const toggleExpandirArticulo = (codigoArticulo) => setArticulosExpandidos(prev => ({ ...prev, [codigoArticulo]: !prev[codigoArticulo] }));
  const toggleExpandirFecha = (fecha) => setFechasExpandidas(prev => ({ ...prev, [fecha]: !prev[fecha] }));

  const handleHistorialFilterChange = (event) => {
    const { name, value } = event.target;
    setHistorialPage(1);
    setHistorialFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleHistorialLimitChange = (event) => { setHistorialLimit(parseInt(event.target.value, 10) || 20); setHistorialPage(1); };

  const toggleTodosArticulos = () => {
    if (Object.keys(articulosExpandidos).length === inventario.length) {
      setArticulosExpandidos({});
    } else {
      const allExpanded = {};
      inventario.forEach(art => { allExpanded[art.CodigoArticulo] = true; });
      setArticulosExpandidos(allExpanded);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const resetFilters = useCallback(() => setFilters({ codigo: '', almacen: '', ubicacion: '', familia: '', subfamilia: '' }), []);

  // ── Ajustes ───────────────────────────────────────────────────────────────
  const iniciarEdicionCantidad = async (articulo, nombreAlmacen, cantidadActual, clave, codigoAlmacen, ubicacionStr, partida, unidadStock, codigoColor, codigoTalla01, esSinUbicacion, sinRegistrosAcumuladoStock = false) => {
    const articuloCompleto = inventario.find(art => art.CodigoArticulo === articulo || art.CodigoArticuloStock === articulo);
    if (sinRegistrosAcumuladoStock && esSinUbicacion && Number(cantidadActual) === 0) {
      alert('Aviso: no hay registros previos en AcumuladoStock para este artículo.');
    }
    await cargarVariantesArticulo(articulo, unidadStock, codigoTalla01 || '', codigoColor || '');
    setEditandoCantidad({
      articulo, descripcionArticulo: articuloCompleto?.DescripcionArticulo || '',
      nombreAlmacen, cantidadActual, clave, codigoAlmacen,
      ubicacionStr: esSinUbicacion ? 'SIN-UBICACION' : ubicacionStr,
      partida: partida || '', unidadStock: unidadStock || 'unidades',
      codigoColor: codigoColor || '', codigoTalla01: codigoTalla01 || '',
      esSinUbicacion: esSinUbicacion || false
    });
    setUnidadMedidaSeleccionadaEdit(unidadStock || 'unidades');
    setTallaSeleccionadaEdit(codigoTalla01 || '');
    setColorSeleccionadoEdit(codigoColor || '');
    setNuevaCantidad(cantidadActual.toString());
  };

  const guardarAjustePendiente = () => {
    if (!editandoCantidad || !nuevaCantidad) return;
    const cantidad = parseFloat(nuevaCantidad);
    if (isNaN(cantidad)) { alert('Por favor ingrese un número válido'); return; }
    setAjustesPendientes(prev => [...prev, {
      articulo: editandoCantidad.articulo,
      descripcionArticulo: editandoCantidad.descripcionArticulo,
      codigoAlmacen: editandoCantidad.codigoAlmacen,
      ubicacionStr: editandoCantidad.ubicacionStr,
      partida: editandoCantidad.partida || '',
      unidadStock: (unidadMedidaSeleccionadaEdit === 'unidades' ? '' : unidadMedidaSeleccionadaEdit),
      nuevaCantidad: cantidad,
      codigoColor: colorSeleccionadoEdit || '',
      codigoTalla01: tallaSeleccionadaEdit || '',
      combinacionOriginal: {
        articulo: editandoCantidad.articulo,
        codigoAlmacen: editandoCantidad.codigoAlmacen,
        ubicacionStr: editandoCantidad.ubicacionStr,
        partida: editandoCantidad.partida || '',
        unidadStock: editandoCantidad.unidadStock || '',
        codigoColor: editandoCantidad.codigoColor || '',
        codigoTalla01: editandoCantidad.codigoTalla01 || '',
        nuevaCantidad: editandoCantidad.cantidadActual
      }
    }]);
    setEditandoCantidad(null);
    setNuevaCantidad('');
  };

  const eliminarAjustePendiente = (index) => setAjustesPendientes(prev => prev.filter((_, i) => i !== index));

  const verDetalles = async (movPosicionLinea) => {
    if (!movPosicionLinea) return;
    try {
      setCargandoDetalles(true);
      const response = await API.get(`/stock/detalles?movPosicionLinea=${movPosicionLinea}`, { headers: getAuthHeader() });
      setDetallesModal(response.data);
    } catch { alert('Error al cargar los detalles'); }
    finally { setCargandoDetalles(false); }
  };

  const confirmarAjustes = async () => {
    if (ajustesPendientes.length === 0) { alert('No hay ajustes para confirmar'); return; }
    try {
      const response = await API.post('/inventario/ajustar-completo', { ajustes: ajustesPendientes }, { headers: getAuthHeader() });
      if (response.data.success) {
        refreshInventario();
        cargarHistorialAjustes();
        setAjustesPendientes([]);
        alert('Ajustes realizados correctamente');
      }
    } catch (error) {
      const msg = error.response?.data?.error || error.response?.data?.mensaje || error.message;
      alert(`Error al confirmar ajustes: ${msg}`);
    }
  };

  // ── Derivados ──────────────────────────────────────────────────────────────
  const visibleInventario = useMemo(() => {
    const result = [...inventario];
    if (sortConfig.key) {
      result.sort((a, b) => {
        const aValue = sortConfig.key === 'estado' ? estadoOrden[a.estado] : a[sortConfig.key];
        const bValue = sortConfig.key === 'estado' ? estadoOrden[b.estado] : b[sortConfig.key];
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      result.sort((a, b) => {
        if (estadoOrden[a.estado] !== estadoOrden[b.estado]) return estadoOrden[a.estado] - estadoOrden[b.estado];
        return a.CodigoArticulo < b.CodigoArticulo ? -1 : a.CodigoArticulo > b.CodigoArticulo ? 1 : 0;
      });
    }
    return result;
  }, [inventario, sortConfig]);

  const stats = useMemo(() => ({
    totalArticulos: visibleInventario.length,
    totalUnidades: visibleInventario.reduce((t, art) => t + (art.totalStockBase || 0), 0),
    totalUbicaciones: visibleInventario.reduce((t, art) => {
      const s = new Set(art.ubicaciones.map(u => `${u.CodigoAlmacen}_${u.Ubicacion}`));
      return t + s.size;
    }, 0),
    stockSinUbicacion: visibleInventario.reduce((t, art) =>
      t + art.ubicaciones.filter(u => u.esSinUbicacion).reduce((s, u) => s + (u.CantidadBase || 0), 0), 0)
  }), [visibleInventario]);

  const inventarioIcons = useMemo(() => ({
    title: <FiPackage />, refresh: <FiRefreshCw />, add: <FiPlusCircle />,
    inventarioTab: <FiList />, historialTab: <FiClock />, filter: <FiFilter />,
    minus: <FiMinus />, plus: <FiPlus />, package: <FiPackage />, layers: <FiLayers />,
    mapPin: <FiMapPin />, database: <FiDatabase />, alert: <FiCheck />,
    chevronUp: <FiChevronUp />, chevronDown: <FiChevronDown />, edit: <FiEdit />, clear: <FiX />
  }), []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="inventario-container">
      <Navbar />
      <div className="inventario-content">
        <InventarioHeader onNuevoAjuste={() => setModalNuevoAjuste(true)} onRefresh={refreshInventario}
          titleIcon={inventarioIcons.title} refreshIcon={inventarioIcons.refresh} addIcon={inventarioIcons.add} />

        <InventarioTabs activeTab={activeTab} onChange={setActiveTab}
          inventarioIcon={inventarioIcons.inventarioTab} historialIcon={inventarioIcons.historialTab} />

        {activeTab === 'inventario' && (
          <InventarioFilters open={filtrosAbiertos} onToggle={() => setFiltrosAbiertos(!filtrosAbiertos)}
            filters={filters} onFilterChange={handleFilterChange} onToggleAll={toggleTodosArticulos}
            onResetFilters={resetFilters} hasExpandedArticles={Object.keys(articulosExpandidos).length > 0}
            filterIcon={inventarioIcons.filter} minusIcon={inventarioIcons.minus}
            plusIcon={inventarioIcons.plus} clearIcon={inventarioIcons.clear} />
        )}

        {activeTab === 'inventario' && ajustesPendientes.length > 0 && (
          <div className="inventario-panel-ajustes">
            <div className="inventario-panel-header">
              <h3>Ajustes Pendientes <span className="inventario-badge">{ajustesPendientes.length}</span></h3>
              <div className="inventario-panel-actions">
                <button className="inventario-btn-confirmar" onClick={confirmarAjustes}>
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
                        <div className="inventario-articulo-codigo">{normalizarTexto(ajuste.articulo)}</div>
                        <div className="inventario-articulo-descripcion">{normalizarTexto(ajuste.descripcionArticulo)}</div>
                      </div>
                    </div>
                    <div className="inventario-ubicacion">
                      <span className="inventario-label">Ubicación:</span>
                      <div className="inventario-value">
                        <div>{[ajuste.codigoAlmacen, normalizarUbicacionDisplay(ajuste.ubicacionStr)].filter(Boolean).join(' / ')}</div>
                        {construirResumenAjustePendiente(ajuste)
                          .filter((d) => d.label !== 'Ubicación')
                          .map((d) => (
                            <div key={`${index}-${d.label}`}><strong>{d.label}:</strong> {normalizarTexto(d.value)}</div>
                          ))}
                      </div>
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
                  <button className="inventario-btn-eliminar" onClick={() => eliminarAjustePendiente(index)}>
                    <FiX />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'inventario' && <InventarioResumenCards stats={stats} icons={inventarioIcons} />}

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
                <InventarioStateView type="error" title="Error al cargar datos" message={error}
                  buttonLabel="Recargar Inventario" onButtonClick={refreshInventario} buttonIcon={inventarioIcons.refresh} />
              ) : loading.inventario && visibleInventario.length === 0 ? (
                <InventarioStateView type="loading" message="Cargando primeros artículos..." />
              ) : visibleInventario.length === 0 ? (
                <InventarioStateView type="empty" title="No se encontraron artículos"
                  message="Intenta ajustar tus filtros de búsqueda" buttonLabel="Limpiar Filtros" onButtonClick={resetFilters} />
              ) : (
                <InventarioList items={visibleInventario} expandedItems={articulosExpandidos}
                  onToggleItem={toggleExpandirArticulo} getEstadoColor={getEstadoColor}
                  getStockStyle={getStockStyle} formatearUnidad={formatearUnidad} getColorStyle={getColorStyle}
                  icons={inventarioIcons} onEditarCantidad={iniciarEdicionCantidad} onVerDetalles={verDetalles}
                  hasMore={inventarioHasMore} loadingMore={inventarioLoadingMore} onLoadMore={cargarMasInventario} />
              )}
            </>
          ) : (
            <>
              {error ? (
                <InventarioStateView type="error" title="Error al cargar datos" message={error}
                  buttonLabel="Recargar Historial" onButtonClick={cargarHistorialAjustes} buttonIcon={inventarioIcons.refresh} />
              ) : loading.historial ? (
                <InventarioStateView type="loading" message="Cargando historial de ajustes..." />
              ) : historialAjustes.length === 0 ? (
                <InventarioStateView type="empty" title="No se encontraron ajustes" message="No hay registros en el historial de ajustes" />
              ) : (
                <>
                  <Paper elevation={1} sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField label="Desde" name="fechaDesde" type="date" value={historialFilters.fechaDesde}
                          onChange={handleHistorialFilterChange} InputLabelProps={{ shrink: true }} size="small" />
                        <TextField label="Hasta" name="fechaHasta" type="date" value={historialFilters.fechaHasta}
                          onChange={handleHistorialFilterChange} InputLabelProps={{ shrink: true }} size="small" />
                        <TextField select label="Tamaño" value={historialLimit} onChange={handleHistorialLimitChange}
                          size="small" sx={{ minWidth: 120 }}>
                          <MenuItem value={20}>20</MenuItem>
                          <MenuItem value={25}>25</MenuItem>
                          <MenuItem value={50}>50</MenuItem>
                          <MenuItem value={100}>100</MenuItem>
                        </TextField>
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {historialPagination.total} movimientos en el rango seleccionado
                      </Typography>
                    </Stack>
                  </Paper>

                  <div className="inventario-historial-list">
                    {historialAjustes.map(item => {
                      const expandido = fechasExpandidas[item.fecha];
                      return (
                        <div key={`${item.fecha}-${item.totalAjustes}`} className="inventario-historial-item">
                          <div className="inventario-fecha-header" onClick={() => toggleExpandirFecha(item.fecha)}
                            style={{ background: expandido ? '#f0f7ff' : '#f5f7fa' }}>
                            <div className="inventario-fecha-info">
                              <span className="inventario-fecha">{formatearFecha(item.fecha)}</span>
                              <span className="inventario-resumen">{item.totalAjustes} ajustes realizados</span>
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
                                      <strong>{normalizarTexto(detalle.CodigoArticulo)}</strong> — {normalizarTexto(detalle.DescripcionArticulo)}
                                    </span>
                                    <span className="inventario-ajuste-cantidad">
                                      {detalle.Diferencia > 0 ? '+' : ''}{detalle.Diferencia}
                                    </span>
                                  </div>
                                  <div className="inventario-ajuste-detalle-info">
                                    <div><span className="inventario-ajuste-label">Almacén:</span><span>{normalizarTexto(detalle.NombreAlmacen)} ({detalle.CodigoAlmacen})</span></div>
                                    <div><span className="inventario-ajuste-label">Ubicación:</span><span>{normalizarUbicacionDisplay(detalle.Ubicacion)} — {normalizarTexto(detalle.DescripcionUbicacion) || 'Sin descripción'}</span></div>
                                    <div><span className="inventario-ajuste-label">Comentario:</span><span>{normalizarTexto(detalle.Comentario) || 'Sin comentario'}</span></div>
                                    <div><span className="inventario-ajuste-label">Usuario:</span><span>{normalizarTexto(detalle.Usuario) || 'No disponible'}</span></div>
                                    {(detalle.UnidadMedida || detalle.CodigoColor || detalle.CodigoTalla01 || detalle.Partida) && (
                                      <div>
                                        <span className="inventario-ajuste-label">Variante:</span>
                                        <span>
                                          {[
                                            detalle.UnidadMedida ? `Unidad ${normalizarTexto(detalle.UnidadMedida)}` : '',
                                            detalle.CodigoColor ? `Color ${normalizarTexto(detalle.CodigoColor)}` : '',
                                            detalle.CodigoTalla01 ? `Talla ${normalizarTexto(detalle.CodigoTalla01)}` : '',
                                            detalle.Partida ? `Partida ${normalizarTexto(detalle.Partida)}` : ''
                                          ].filter(Boolean).join(' | ')}
                                        </span>
                                      </div>
                                    )}
                                    <div><span className="inventario-ajuste-label">Tipo:</span><span className={`badge-${detalle.TipoRegistro?.toLowerCase() || 'movimiento'}`}>{detalle.TipoRegistro || 'MOVIMIENTO'}</span></div>
                                    <div><span className="inventario-ajuste-label">Fecha y hora:</span><span>{formatearFecha(detalle.FechaRegistro)}</span></div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <Paper elevation={1} sx={{ mt: 2, p: 2, borderRadius: 3 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        Página {historialPagination.page} de {historialPagination.totalPages}
                      </Typography>
                      <Pagination page={historialPage} count={historialPagination.totalPages}
                        color="primary" onChange={(_, value) => setHistorialPage(value)} />
                    </Stack>
                  </Paper>
                </>
              )}
            </>
          )}
        </div>

        <NuevoAjusteDialog
          open={modalNuevoAjuste} onClose={cerrarNuevoAjuste}
          articuloBusqueda={articuloBusqueda} onArticuloBusquedaChange={setArticuloBusqueda}
          resultadosBusqueda={resultadosBusqueda} onSeleccionarArticulo={seleccionarArticulo}
          articuloSeleccionado={articuloSeleccionado} almacenSeleccionado={almacenSeleccionado}
          almacenesDisponibles={almacenesDisponibles} onAlmacenChange={handleAlmacenNuevoAjusteChange}
          ubicacionSeleccionada={ubicacionSeleccionada} onUbicacionChange={setUbicacionSeleccionada}
          ubicacionBusqueda={ubicacionBusqueda} onUbicacionBusquedaChange={setUbicacionBusqueda}
          ubicacionesDisponibles={ubicacionesDisponibles} cargandoUbicaciones={cargandoUbicaciones}
          onUbicacionesScroll={handleUbicacionesScroll} unidadesDisponibles={unidadesDisponibles}
          unidadMedidaSeleccionada={unidadMedidaSeleccionada} onUnidadMedidaChange={setUnidadMedidaSeleccionada}
          mostrarSelectorTalla={mostrarSelectorTalla} tallasDisponibles={tallasDisponibles}
          tallaSeleccionada={tallaSeleccionada} onTallaChange={setTallaSeleccionada}
          mostrarSelectorColor={mostrarSelectorColor} coloresDisponibles={coloresDisponibles}
          colorSeleccionado={colorSeleccionado} onColorChange={setColorSeleccionado}
          cantidadNuevoAjuste={cantidadNuevoAjuste} onCantidadChange={setCantidadNuevoAjuste}
          onGuardar={guardarNuevoAjuste} omitirSiguienteBusquedaUbicacionRef={omitirSiguienteBusquedaUbicacionRef} />

        <EditarCantidadDialog
          open={Boolean(editandoCantidad)} editandoCantidad={editandoCantidad} onClose={cerrarEdicionCantidad}
          unidadesDisponiblesEdit={unidadesDisponiblesEdit} unidadMedidaSeleccionadaEdit={unidadMedidaSeleccionadaEdit}
          onUnidadMedidaChange={setUnidadMedidaSeleccionadaEdit} tallasDisponiblesEdit={tallasDisponiblesEdit}
          tallaSeleccionadaEdit={tallaSeleccionadaEdit} onTallaChange={setTallaSeleccionadaEdit}
          coloresDisponiblesEdit={coloresDisponiblesEdit} colorSeleccionadoEdit={colorSeleccionadoEdit}
          onColorChange={setColorSeleccionadoEdit} formatearUnidad={formatearUnidad} getStockStyle={getStockStyle}
          nuevaCantidad={nuevaCantidad} onNuevaCantidadChange={setNuevaCantidad} onGuardar={guardarAjustePendiente} />

        <InventarioDetallesDialog open={Boolean(detallesModal)} detallesModal={detallesModal} onClose={() => setDetallesModal(null)} />
      </div>
    </div>
  );
};

export default InventarioPage;