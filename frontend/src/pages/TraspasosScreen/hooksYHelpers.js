import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import API from '../../helpers/api';
import { getAuthHeader } from '../../helpers/authHelper';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// ESTILOS COMUNES react-select
// ============================================================
export const commonSelectStyles = {
  control: (base) => ({
    ...base,
    minHeight: '44px',
    borderColor: '#ddd',
    '&:hover': { borderColor: '#aaa' },
    boxShadow: 'none',
  }),
  menu: (base) => ({ ...base, zIndex: 9999 }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? '#e6f0ff' : 'white',
    color: '#1a365d',
    padding: '10px 12px',
  }),
};

// ============================================================
// UTILIDADES PURAS
// ============================================================
export function formatearUnidad(cantidad, unidad) {
  let cantidadNum = parseFloat(cantidad);
  if (isNaN(cantidadNum)) cantidadNum = 0;

  const esNegativo = cantidadNum < 0;
  const cantidadAbs = Math.abs(cantidadNum);
  let unidadStr = String(unidad || '');
  if (!unidadStr.trim()) unidadStr = 'unidad';

  let cantidadFormateada = cantidadAbs;
  if (!Number.isInteger(cantidadAbs)) {
    cantidadFormateada = parseFloat(cantidadAbs.toFixed(2));
  }

  const unidadesInvariables = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3', 'barra', 'metro'];
  const unidadLower = unidadStr.toLowerCase();

  if (unidadesInvariables.includes(unidadLower)) {
    return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidadStr}`;
  }

  const pluralesIrregulares = {
    'ud': 'uds', 'par': 'pares', 'metro': 'metros', 'pack': 'packs',
    'saco': 'sacos', 'barra': 'barras', 'caja': 'cajas', 'rollo': 'rollos',
    'lata': 'latas', 'bote': 'botes', 'tubo': 'tubos', 'unidad': 'unidades',
    'juego': 'juegos', 'kit': 'kits', 'paquete': 'paquetes'
  };

  if (cantidadFormateada === 1) {
    if (unidadLower === 'unidad' || unidadLower === 'unidades') return `${esNegativo ? '-' : ''}1 unidad`;
    return `${esNegativo ? '-' : ''}1 ${unidadStr}`;
  } else {
    if (unidadLower === 'unidad' || unidadLower === 'unidades') return `${esNegativo ? '-' : ''}${cantidadFormateada} unidades`;
    if (pluralesIrregulares[unidadLower]) return `${esNegativo ? '-' : ''}${cantidadFormateada} ${pluralesIrregulares[unidadLower]}`;
    const ultimaLetra = unidadStr.charAt(unidadStr.length - 1);
    if (['a', 'e', 'i', 'o', 'u'].includes(ultimaLetra)) return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidadStr}s`;
    return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidadStr}es`;
  }
}

export function mostrarUnidadMedida(unidad) {
  if (!unidad || unidad === '') return 'unidades';
  return unidad;
}

export function normalizarUnidadMedida(unidad) {
  if (!unidad || unidad === 'unidades' || unidad.trim() === '') return '';
  return unidad;
}

export function formatTallaColor(talla, colorCode) {
  if (!talla && !colorCode) return null;
  let display = '';
  if (talla) display += talla;
  if (colorCode) display += colorCode;
  return display;
}

export function getColorStyle(colorCode) {
  const colorMap = {
    'A': { color: '#1E88E5', fontWeight: 'bold' },
    'V': { color: '#43A047', fontWeight: 'bold' },
    'R': { color: '#E53935', fontWeight: 'bold' },
    'N': { color: '#000000', fontWeight: 'bold' },
    'B': { color: '#FFFFFF', backgroundColor: '#333', padding: '2px 5px', borderRadius: '3px' },
  };
  return colorMap[colorCode] || {};
}

export function formatUbicacionDisplay(ubicacion, esSinUbicacion) {
  if (esSinUbicacion || ubicacion === 'SIN-UBICACION') return 'Stock Sin Ubicación';
  return ubicacion;
}

export function getCantidadBase(item) {
  const cantidadBase = parseFloat(item?.CantidadBase);
  if (!isNaN(cantidadBase)) return cantidadBase;
  const cantidad = parseFloat(item?.Cantidad);
  const factorConversion = parseFloat(item?.FactorConversion);
  const unidadMedida = String(item?.UnidadMedida || '').trim();
  const unidadAlternativa = String(item?.UnidadAlternativa || '').trim();
  if (unidadMedida && unidadAlternativa && unidadMedida === unidadAlternativa &&
    !isNaN(cantidad) && !isNaN(factorConversion) && factorConversion > 0) {
    return cantidad * factorConversion;
  }
  return isNaN(cantidad) ? 0 : cantidad;
}

export function formatStockDisponible(item) {
  const cantidad = parseFloat(item?.Cantidad || 0);
  const unidad = item?.UnidadMedida || '';
  const unidadBase = item?.UnidadBase || '';
  const cantidadBase = getCantidadBase(item);
  if (unidadBase && unidad && unidad !== unidadBase) {
    return `${formatearUnidad(cantidad, unidad)} (${formatearUnidad(cantidadBase, unidadBase)})`;
  }
  return formatearUnidad(cantidad, unidad);
}

export function formatFecha(fechaStr) {
  if (!fechaStr) return 'Fecha no disponible';
  try {
    if (typeof fechaStr === 'string' && fechaStr.includes('/')) return fechaStr;
    const fecha = new Date(fechaStr);
    if (!isNaN(fecha.getTime())) {
      return fecha.toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    return fechaStr;
  } catch (e) {
    return fechaStr;
  }
}

// ============================================================
// HOOK PRINCIPAL
// ============================================================
export function useTraspasosPage() {
  const [activeSection, setActiveSection] = useState('traspasos');
  const [activeTab, setActiveTab] = useState('articulo');
  const [loading, setLoading] = useState(false);
  const [almacenes, setAlmacenes] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [traspasosPendientes, setTraspasosPendientes] = useState([]);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState(null);
  const [stockDisponible, setStockDisponible] = useState([]);
  const [almacenOrigen, setAlmacenOrigen] = useState('');
  const [ubicacionOrigen, setUbicacionOrigen] = useState('');
  const [almacenDestino, setAlmacenDestino] = useState('');
  const [ubicacionDestino, setUbicacionDestino] = useState('');
  const [ubicacionDestinoBusqueda, setUbicacionDestinoBusqueda] = useState('');
  const [cargandoUbicacionesDestino, setCargandoUbicacionesDestino] = useState(false);
  const [ubicacionesDestinoHasMore, setUbicacionesDestinoHasMore] = useState(false);
  const [ubicacionesDestinoNextOffset, setUbicacionesDestinoNextOffset] = useState(0);
  const [cantidad, setCantidad] = useState('');
  const [unidadMedida, setUnidadMedida] = useState('');
  const [partida, setPartida] = useState('');
  const [tallaOrigen, setTallaOrigen] = useState('');
  const [colorOrigen, setColorOrigen] = useState('');
  const [stockDisponibleInfo, setStockDisponibleInfo] = useState('');
  const [tipoUnidadMedida, setTipoUnidadMedida] = useState('');
  const [grupoUnicoOrigen, setGrupoUnicoOrigen] = useState('');
  const [almacenesExpandidos, setAlmacenesExpandidos] = useState({});
  const [ubicacionesCargadas, setUbicacionesCargadas] = useState({});
  const [ubicacionSeleccionada, setUbicacionSeleccionada] = useState(null);
  const [articulosUbicacion, setArticulosUbicacion] = useState([]);
  const [paginationUbicacion, setPaginationUbicacion] = useState({ page: 1, pageSize: 15, total: 0 });
  const [articuloUbicacionSeleccionado, setArticuloUbicacionSeleccionado] = useState(null);
  const [vistaUbicacion, setVistaUbicacion] = useState('seleccion');

  const ubicacionesDestinoRequestRef = useRef(0);
  const UBICACIONES_DESTINO_BATCH_SIZE = 50;

  // ── Almacenes ─────────────────────────────────────────────
  const getNombreAlmacen = useCallback((codigo) => {
    if (!codigo || codigo === 'undefined') return 'Almacén no disponible';
    if (codigo === 'SIN-UBICACION') return 'Stock Sin Ubicación';
    const almacen = almacenes.find(a => a.CodigoAlmacen === codigo);
    return almacen ? `${almacen.Almacen} (${codigo})` : `${codigo}`;
  }, [almacenes]);

  const opcionesAlmacenes = useMemo(() =>
    almacenes.map(a => ({ value: a.CodigoAlmacen, label: `${a.Almacen} (${a.CodigoAlmacen})` }))
  , [almacenes]);

  // ✅ Almacén R excluido del destino (solo es de recepción, no puede recibir traspasos)
  const opcionesAlmacenesDestino = useMemo(() =>
    almacenes
      .filter(a => a.CodigoAlmacen !== 'R')
      .map(a => ({ value: a.CodigoAlmacen, label: `${a.Almacen} (${a.CodigoAlmacen})` }))
  , [almacenes]);

  const opcionesUbicacionesDestino = useMemo(() =>
    ubicacionesDestino.map(u => ({
      value: u.Ubicacion,
      label: `${u.Ubicacion === 'SIN-UBICACION' ? '[SIN UBICACIÓN] ' : ''}${formatUbicacionDisplay(u.Ubicacion, u.Ubicacion === 'SIN-UBICACION')}${u.DescripcionUbicacion ? ` - ${u.DescripcionUbicacion}` : ''}`,
      data: u
    }))
  , [ubicacionesDestino]);

  const opcionesUbicacionesStock = useMemo(() => {
    if (!Array.isArray(stockDisponible) || !almacenOrigen) return [];
    return stockDisponible
      .filter(item => item && item.CodigoAlmacen === almacenOrigen)
      .map(item => {
        const tallaColor = formatTallaColor(item.Talla || '', item.CodigoColor_ || '');
        let label = '';
        if (item.EsSinUbicacion) label += '[SIN UBICACIÓN] ';
        label += formatUbicacionDisplay(item.Ubicacion || '', item.EsSinUbicacion);
        if (tallaColor) label += ` - ${tallaColor}`;
        label += ` - ${formatStockDisponible(item)}`;
        if (item.Partida) label += ` (Lote: ${item.Partida})`;
        return { value: item.GrupoUnico || '', label, data: item };
      })
      .filter(Boolean);
  }, [stockDisponible, almacenOrigen]);

  // ── Carga de datos ────────────────────────────────────────
  const cargarUbicacionesDestino = useCallback(async ({
    search = '', offset = 0, append = false
  } = {}) => {
    if (!almacenDestino) return;
    const requestId = Date.now() + Math.random();
    ubicacionesDestinoRequestRef.current = requestId;
    setCargandoUbicacionesDestino(true);
    try {
      const headers = getAuthHeader();
      const response = await API.get('/ubicaciones-completas', {
        headers,
        params: {
          codigoAlmacen: almacenDestino,
          incluirSinUbicacion: 'true',
          search,
          offset,
          limit: UBICACIONES_DESTINO_BATCH_SIZE
        }
      });
      if (ubicacionesDestinoRequestRef.current !== requestId) return;
      const payload = response.data || {};
      const items = Array.isArray(payload.items) ? payload.items : [];
      setUbicacionesDestino(prev => {
        if (!append) return items;
        const existentes = new Set(prev.map(u => u.Ubicacion));
        return [...prev, ...items.filter(u => !existentes.has(u.Ubicacion))];
      });
      setUbicacionesDestinoHasMore(Boolean(payload.hasMore));
      setUbicacionesDestinoNextOffset(Number(payload.nextOffset) || 0);
    } catch (err) {
      console.error('[TRASPASOS] Error cargando ubicaciones destino:', err);
      setUbicacionesDestino([]);
    } finally {
      setCargandoUbicacionesDestino(false);
    }
  }, [almacenDestino]);

  const cargarStockArticulo = useCallback(async (articulo) => {
    if (!articulo) return;
    try {
      const headers = getAuthHeader();
      const response = await API.get('/traspasos/stock-por-articulo', {
        headers,
        params: { codigoArticulo: articulo.CodigoArticulo }
      });

      // ✅ Incluir EsUbicacionPrincipal y UbicacionPrincipalAlmacen del backend
      const stockNormalizado = response.data.map(item => ({
        CodigoAlmacen: item.CodigoAlmacen,
        NombreAlmacen: item.NombreAlmacen,
        Ubicacion: item.Ubicacion,
        DescripcionUbicacion: item.DescripcionUbicacion,
        Cantidad: item.Cantidad,
        UnidadMedida: item.UnidadStock,
        TipoUnidadMedida_: item.UnidadStock,
        Partida: item.Partida || '',
        CodigoColor_: item.CodigoColor_ || '',
        Talla: item.Talla || '',
        EsSinUbicacion: item.EsSinUbicacion === 1,
        EsUbicacionPrincipal: item.EsUbicacionPrincipal === 1,
        UbicacionPrincipalAlmacen: item.UbicacionPrincipalAlmacen || '',
        GrupoUnico: `${item.CodigoAlmacen}_${item.Ubicacion}_${item.UnidadStock || ''}_${item.Partida || ''}_${item.Talla || ''}_${item.CodigoColor_ || ''}`,
        UnidadBase: item.UnidadBase,
        UnidadAlternativa: item.UnidadAlternativa,
        FactorConversion: item.FactorConversion,
      }));

      setStockDisponible(stockNormalizado);

      // ✅ Origen por defecto = ubicación principal del almacén con más stock
      const ubicacionPorDefecto = stockNormalizado.find(item => item.EsUbicacionPrincipal)
        || stockNormalizado[0];

      if (ubicacionPorDefecto) {
        setAlmacenOrigen(ubicacionPorDefecto.CodigoAlmacen);
        setUbicacionOrigen(ubicacionPorDefecto.Ubicacion);
        setUnidadMedida(ubicacionPorDefecto.UnidadMedida);
        setTipoUnidadMedida(ubicacionPorDefecto.UnidadMedida);
        setPartida(ubicacionPorDefecto.Partida || '');
        setTallaOrigen(ubicacionPorDefecto.Talla || '');
        setColorOrigen(ubicacionPorDefecto.CodigoColor_ || '');
        setGrupoUnicoOrigen(ubicacionPorDefecto.GrupoUnico || '');
        setStockDisponibleInfo(formatStockDisponible(ubicacionPorDefecto));
      }
    } catch (err) {
      console.error('[TRASPASOS] Error cargando stock:', err);
      setStockDisponible([]);
      alert(`Error cargando stock: ${err.response?.data?.mensaje || err.message}`);
    }
  }, []);

  const cargarHistorial = useCallback(async () => {
    try {
      const headers = getAuthHeader();
      const response = await API.get('/historial-traspasos', {
        headers,
        params: { page: 1, pageSize: 50 }
      });
      setHistorial(response.data?.success ? (response.data.traspasos || []) : []);
    } catch (err) {
      console.error('[TRASPASOS] Error cargando historial:', err);
      setHistorial([]);
      alert(`Error cargando historial: ${err.response?.data?.mensaje || err.message}`);
    }
  }, []);

  const cargarArticulosUbicacion = useCallback(async (almacen, ubicacion, page = 1) => {
    try {
      const headers = getAuthHeader();
      const response = await API.get('/stock/por-ubicacion', {
        headers,
        params: { codigoAlmacen: almacen, ubicacion, page, pageSize: paginationUbicacion.pageSize }
      });
      const articulos = response.data.articulos.map(a => ({
        ...a,
        TipoUnidadMedida_: a.TipoUnidadMedida_ || a.UnidadMedida || 'unidades'
      }));
      setArticulosUbicacion(articulos);
      setPaginationUbicacion({ page, pageSize: response.data.pageSize, total: response.data.total });
      setUbicacionSeleccionada({ almacen, ubicacion });
      setVistaUbicacion('detalle');
    } catch (err) {
      console.error('[TRASPASOS] Error cargando artículos ubicación:', err);
      setArticulosUbicacion([]);
      alert(`Error: ${err.response?.data?.mensaje || err.message}`);
    }
  }, [paginationUbicacion.pageSize]);

  // ── Handlers ──────────────────────────────────────────────
  const handleAlmacenDestinoChange = useCallback(async (selectedOption) => {
    if (!selectedOption) return;
    const codigoAlmacenDestino = selectedOption.value;
    setAlmacenDestino(codigoAlmacenDestino);
    setUbicacionDestinoBusqueda('');
    setUbicacionesDestinoHasMore(false);
    setUbicacionesDestinoNextOffset(0);
    setCargandoUbicacionesDestino(true);

    try {
      const headers = getAuthHeader();

      // Cargar ubicaciones y ubicación principal en paralelo
      const [ubicacionesRes, principalRes] = await Promise.all([
        API.get('/ubicaciones-completas', {
          headers,
          params: { codigoAlmacen: codigoAlmacenDestino, incluirSinUbicacion: 'true', offset: 0, limit: 50 }
        }),
        articuloSeleccionado?.CodigoArticulo
          ? API.get('/traspasos/ubicacion-principal', {
              headers,
              params: { codigoArticulo: articuloSeleccionado.CodigoArticulo, codigoAlmacen: codigoAlmacenDestino }
            })
          : Promise.resolve({ data: { ubicacion: null } })
      ]);

      const items = Array.isArray(ubicacionesRes.data?.items) ? ubicacionesRes.data.items : [];
      setUbicacionesDestino(items);
      setUbicacionesDestinoHasMore(Boolean(ubicacionesRes.data?.hasMore));
      setUbicacionesDestinoNextOffset(Number(ubicacionesRes.data?.nextOffset) || 0);

      // ✅ Preseleccionar ubicación principal si existe en la lista cargada
      const ubicacionPrincipal = principalRes.data?.ubicacion || null;
      if (ubicacionPrincipal) {
        setUbicacionDestino(ubicacionPrincipal);
      } else {
        setUbicacionDestino('');
      }
    } catch (err) {
      console.error('[TRASPASOS] Error cargando destino:', err.message);
      setUbicacionesDestino([]);
      setUbicacionDestino('');
    } finally {
      setCargandoUbicacionesDestino(false);
    }
  }, [articuloSeleccionado]);

  const handleUbicacionDestinoInputChange = useCallback((inputValue, meta) => {
    if (meta.action === 'input-change') {
      setUbicacionDestino('');
      setUbicacionDestinoBusqueda(inputValue);
    }
    if (meta.action === 'menu-close') return '';
    return inputValue;
  }, []);

  const handleUbicacionesDestinoMenuOpen = useCallback(() => {
    if (!almacenDestino || ubicacionesDestino.length > 0 || cargandoUbicacionesDestino) return;
    cargarUbicacionesDestino({ search: ubicacionDestinoBusqueda.trim(), offset: 0, append: false });
  }, [almacenDestino, ubicacionesDestino.length, cargandoUbicacionesDestino, cargarUbicacionesDestino, ubicacionDestinoBusqueda]);

  const handleUbicacionesDestinoScroll = useCallback(() => {
    if (!almacenDestino || cargandoUbicacionesDestino || !ubicacionesDestinoHasMore) return;
    cargarUbicacionesDestino({
      search: ubicacionDestinoBusqueda.trim(),
      offset: ubicacionesDestinoNextOffset,
      append: true
    });
  }, [almacenDestino, cargandoUbicacionesDestino, ubicacionesDestinoHasMore, ubicacionesDestinoNextOffset, ubicacionDestinoBusqueda, cargarUbicacionesDestino]);

  const cambiarAlmacenOrigen = useCallback((codigoAlmacen) => {
    setAlmacenOrigen(codigoAlmacen);
    setUbicacionOrigen('');
    setGrupoUnicoOrigen('');
    setUnidadMedida('');
    setTipoUnidadMedida('');
    setPartida('');
    setTallaOrigen('');
    setColorOrigen('');
    setStockDisponibleInfo('');
    const ubicacionesEnAlmacen = stockDisponible.filter(item => item.CodigoAlmacen === codigoAlmacen);
    if (ubicacionesEnAlmacen.length > 0) {
      const por = ubicacionesEnAlmacen.find(i => i.EsUbicacionPrincipal) || ubicacionesEnAlmacen[0];
      setUbicacionOrigen(por.Ubicacion);
      setUnidadMedida(por.UnidadMedida);
      setTipoUnidadMedida(por.UnidadMedida);
      setPartida(por.Partida || '');
      setTallaOrigen(por.Talla || '');
      setColorOrigen(por.CodigoColor_ || '');
      setGrupoUnicoOrigen(por.GrupoUnico || '');
      setStockDisponibleInfo(formatStockDisponible(por));
    }
  }, [stockDisponible]);

  const seleccionarUbicacionOrigen = useCallback((item) => {
    setUbicacionOrigen(item.Ubicacion);
    setUnidadMedida(item.UnidadMedida);
    setTipoUnidadMedida(item.UnidadMedida);
    setPartida(item.Partida || '');
    setTallaOrigen(item.Talla || '');
    setColorOrigen(item.CodigoColor_ || '');
    setGrupoUnicoOrigen(item.GrupoUnico || '');
    setStockDisponibleInfo(formatStockDisponible(item));
  }, []);

  const handleCantidadChange = useCallback((e) => {
    const value = e.target.value;
    if (/^\d*\.?\d*$/.test(value)) {
      const stockItem = stockDisponible.find(
        item => item.CodigoAlmacen === almacenOrigen &&
          item.Ubicacion === ubicacionOrigen &&
          item.UnidadMedida === unidadMedida &&
          (item.Partida || '') === partida &&
          item.Talla === tallaOrigen &&
          item.CodigoColor_ === colorOrigen
      );
      if (stockItem && parseFloat(value) > stockItem.Cantidad) {
        setCantidad(stockItem.Cantidad.toString());
      } else {
        setCantidad(value);
      }
    }
  }, [stockDisponible, almacenOrigen, ubicacionOrigen, unidadMedida, partida, tallaOrigen, colorOrigen]);

  const agregarTraspasoArticulo = useCallback(() => {
    const cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum) || cantidadNum <= 0) { alert('La cantidad debe ser un número positivo'); return; }
    if (!articuloSeleccionado || !almacenOrigen || !ubicacionOrigen || !almacenDestino || !ubicacionDestino) {
      alert('Complete todos los campos'); return;
    }
    const stockItem = stockDisponible.find(
      item => item.CodigoAlmacen === almacenOrigen && item.Ubicacion === ubicacionOrigen &&
        item.UnidadMedida === unidadMedida && (item.Partida || '') === partida &&
        item.Talla === tallaOrigen && item.CodigoColor_ === colorOrigen
    );
    if (!stockItem || cantidadNum > stockItem.Cantidad) {
      alert(`Cantidad supera el stock disponible (${stockItem?.Cantidad || 0})`); return;
    }
    const unidadNormalizada = normalizarUnidadMedida(unidadMedida);
    setTraspasosPendientes(prev => [...prev, {
      id: uuidv4(),
      articulo: { ...articuloSeleccionado, unidadMedida: unidadNormalizada, partida, talla: tallaOrigen, color: colorOrigen },
      origen: { almacen: almacenOrigen, ubicacion: ubicacionOrigen, grupoUnico: grupoUnicoOrigen, esSinUbicacion: stockItem?.EsSinUbicacion || false },
      destino: { almacen: almacenDestino, ubicacion: ubicacionDestino },
      cantidad: cantidadNum, unidadMedida: unidadNormalizada,
      partida, talla: tallaOrigen, color: colorOrigen
    }]);
    setArticuloSeleccionado(null);
    setCantidad('');
    setStockDisponibleInfo('');
  }, [cantidad, articuloSeleccionado, almacenOrigen, ubicacionOrigen, almacenDestino, ubicacionDestino,
    stockDisponible, unidadMedida, partida, tallaOrigen, colorOrigen, grupoUnicoOrigen]);

  const agregarTraspasoUbicacion = useCallback(() => {
    const cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum) || cantidadNum <= 0) { alert('La cantidad debe ser un número positivo'); return; }
    if (!articuloUbicacionSeleccionado || !almacenDestino || !ubicacionDestino) {
      alert('Complete todos los campos'); return;
    }
    if (cantidadNum > articuloUbicacionSeleccionado.Cantidad) {
      alert(`Cantidad supera el stock disponible (${articuloUbicacionSeleccionado.Cantidad})`); return;
    }
    const unidadNormalizada = normalizarUnidadMedida(articuloUbicacionSeleccionado.UnidadMedida);
    setTraspasosPendientes(prev => [...prev, {
      id: uuidv4(),
      articulo: { ...articuloUbicacionSeleccionado, unidadMedida: unidadNormalizada, partida: articuloUbicacionSeleccionado.Partida || '', talla: articuloUbicacionSeleccionado.Talla || '', color: articuloUbicacionSeleccionado.CodigoColor_ || '' },
      origen: { almacen: ubicacionSeleccionada.almacen, ubicacion: ubicacionSeleccionada.ubicacion, esSinUbicacion: ubicacionSeleccionada.ubicacion === 'SIN-UBICACION' },
      destino: { almacen: almacenDestino, ubicacion: ubicacionDestino },
      cantidad: cantidadNum, unidadMedida: unidadNormalizada,
      partida: articuloUbicacionSeleccionado.Partida || '',
      talla: articuloUbicacionSeleccionado.Talla || '',
      color: articuloUbicacionSeleccionado.CodigoColor_ || ''
    }]);
    setArticuloUbicacionSeleccionado(null);
    setCantidad('');
  }, [cantidad, articuloUbicacionSeleccionado, almacenDestino, ubicacionDestino, ubicacionSeleccionada]);

  const confirmarTraspasos = useCallback(async () => {
    if (traspasosPendientes.length === 0) { alert('No hay traspasos para confirmar'); return; }
    setLoading(true);
    const resultados = [];
    try {
      const headers = getAuthHeader();
      for (let index = 0; index < traspasosPendientes.length; index++) {
        const traspaso = traspasosPendientes[index];
        let unidadNormalizada = traspaso.unidadMedida || '';
        if (unidadNormalizada.toLowerCase() === 'unidades') unidadNormalizada = '';
        const payload = {
          articulo: traspaso.articulo.CodigoArticulo,
          origenAlmacen: traspaso.origen.almacen,
          origenUbicacion: traspaso.origen.esSinUbicacion ? 'SIN-UBICACION' : traspaso.origen.ubicacion,
          destinoAlmacen: traspaso.destino.almacen,
          destinoUbicacion: traspaso.destino.ubicacion,
          cantidad: parseFloat(Number(traspaso.cantidad)),
          unidadMedida: unidadNormalizada,
          partida: traspaso.partida || '',
          codigoTalla: traspaso.talla || '',
          codigoColor: traspaso.color || '',
          esSinUbicacion: traspaso.origen.esSinUbicacion || false
        };
        try {
          await API.post('/traspaso', payload, { headers });
          resultados.push({ ok: true, articulo: payload.articulo, traspasoIndex: index });
        } catch (err) {
          resultados.push({ ok: false, articulo: payload.articulo, error: err.response?.data?.mensaje || err.message, traspasoIndex: index });
        }
      }
      const ok = resultados.filter(r => r.ok);
      const fallidos = resultados.filter(r => !r.ok);
      if (fallidos.length === 0) {
        alert(`✅ Todos los traspasos realizados correctamente (${ok.length}).`);
        setTraspasosPendientes([]);
        await cargarHistorial();
        setActiveSection('historial');
      } else {
        alert(`❌ Fallaron ${fallidos.length} de ${resultados.length}:\n\n` +
          fallidos.map(f => `• ${f.articulo}: ${f.error}`).join('\n') +
          `\n\n✅ ${ok.length} realizados correctamente.`);
        const indicesExitosos = new Set(ok.map(r => r.traspasoIndex));
        setTraspasosPendientes(prev => prev.filter((_, idx) => !indicesExitosos.has(idx)));
        if (ok.length > 0) { await cargarHistorial(); setActiveSection('historial'); }
      }
    } catch (err) {
      alert('Error inesperado: ' + (err.message || 'Intente nuevamente'));
    } finally {
      setLoading(false);
    }
  }, [traspasosPendientes, cargarHistorial]);

  const toggleAlmacenExpandido = useCallback(async (codigoAlmacen) => {
    if (almacenesExpandidos[codigoAlmacen]) {
      setAlmacenesExpandidos(prev => ({ ...prev, [codigoAlmacen]: false }));
      return;
    }
    if (!ubicacionesCargadas[codigoAlmacen]) {
      setLoading(true);
      try {
        const headers = getAuthHeader();
        const response = await API.get(`/ubicaciones-por-almacen/${codigoAlmacen}`, { headers, timeout: 10000 });
        setUbicacionesCargadas(prev => ({
          ...prev,
          [codigoAlmacen]: [
            { Ubicacion: 'SIN-UBICACION', DescripcionUbicacion: 'Stock sin ubicación asignada', CantidadArticulos: 'Varios' },
            ...response.data
          ]
        }));
      } catch {
        setUbicacionesCargadas(prev => ({
          ...prev,
          [codigoAlmacen]: [{ Ubicacion: 'SIN-UBICACION', DescripcionUbicacion: 'Stock sin ubicación asignada', CantidadArticulos: 'Varios' }]
        }));
      } finally {
        setLoading(false);
      }
    }
    setAlmacenesExpandidos(prev => ({ ...prev, [codigoAlmacen]: true }));
  }, [almacenesExpandidos, ubicacionesCargadas]);

  const cargarOpcionesArticulos = useCallback(async (inputValue) => {
    if (!inputValue || inputValue.length < 2) return [];
    try {
      const headers = getAuthHeader();
      const response = await API.get('/buscar-articulos', { headers, params: { termino: inputValue } });
      return (Array.isArray(response.data) ? response.data : []).map(a => ({
        value: a.CodigoArticulo || '',
        label: `${a.CodigoArticulo || ''} - ${a.DescripcionArticulo || ''}`,
        data: a
      }));
    } catch { return []; }
  }, []);

  const cargarOpcionesUbicaciones = useCallback(async (inputValue) => {
    if (!inputValue || inputValue.length < 2) return [];
    try {
      const headers = getAuthHeader();
      const response = await API.get('/buscar-ubicaciones', { headers, params: { termino: inputValue } });
      return response.data.map(u => ({
        value: `${u.CodigoAlmacen}|${u.Ubicacion}`,
        label: `${getNombreAlmacen(u.CodigoAlmacen)} → ${formatUbicacionDisplay(u.Ubicacion, u.Ubicacion === 'SIN-UBICACION')} (${u.CantidadArticulos} artículos)`,
        data: u
      }));
    } catch { return []; }
  }, [getNombreAlmacen]);

  // ── Effects ───────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const headers = getAuthHeader();
        const res = await API.get('/almacenes', { headers });
        setAlmacenes(res.data);
      } catch (err) {
        console.error('[TRASPASOS] Error cargando almacenes:', err);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (articuloSeleccionado) cargarStockArticulo(articuloSeleccionado);
  }, [articuloSeleccionado, cargarStockArticulo]);

  // El scroll/búsqueda en el select de destino sigue usando cargarUbicacionesDestino
  // La carga inicial y preselección se hacen en handleAlmacenDestinoChange

  return {
    // estado
    activeSection, setActiveSection,
    activeTab, setActiveTab,
    loading,
    almacenes,
    historial,
    traspasosPendientes, setTraspasosPendientes,
    articuloSeleccionado, setArticuloSeleccionado,
    stockDisponible,
    almacenOrigen, ubicacionOrigen,
    almacenDestino, ubicacionDestino, setUbicacionDestino,
    ubicacionDestinoBusqueda,
    cargandoUbicacionesDestino,
    cantidad, setCantidad,
    unidadMedida, partida,
    tallaOrigen, colorOrigen,
    stockDisponibleInfo,
    grupoUnicoOrigen,
    almacenesExpandidos, ubicacionesCargadas,
    ubicacionSeleccionada, setUbicacionSeleccionada,
    articulosUbicacion,
    paginationUbicacion,
    articuloUbicacionSeleccionado, setArticuloUbicacionSeleccionado,
    vistaUbicacion, setVistaUbicacion,
    // opciones
    opcionesAlmacenes, opcionesAlmacenesDestino,
    opcionesUbicacionesDestino, opcionesUbicacionesStock,
    // handlers
    getNombreAlmacen,
    handleAlmacenDestinoChange,
    handleUbicacionDestinoInputChange,
    handleUbicacionesDestinoMenuOpen,
    handleUbicacionesDestinoScroll,
    cambiarAlmacenOrigen,
    seleccionarUbicacionOrigen,
    handleCantidadChange,
    agregarTraspasoArticulo,
    agregarTraspasoUbicacion,
    confirmarTraspasos,
    toggleAlmacenExpandido,
    cargarHistorial,
    cargarArticulosUbicacion,
    cargarOpcionesArticulos,
    cargarOpcionesUbicaciones,
  };
}