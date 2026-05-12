// modalesYLineas.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Box,
  Grid,
  Card,
  CardContent,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  FaCamera,
  FaChevronDown,
  FaExclamationTriangle,
  FaQrcode,
  FaBarcode,
  FaCheck,
  FaTimes,
  FaInfoCircle,
  FaWeight,
} from 'react-icons/fa';
import { Html5Qrcode } from 'html5-qrcode';
import API from '../../helpers/api';
import { getAuthHeader } from '../../helpers/authHelper';
import {
  normalizarUnidad,
  formatearUnidad,
  sanitizarCantidadEntera,
  buildUbicacionOptionValue,
  validarExpedicionLinea,
  mostrarToastEnPagina,
} from './hooksYHelpers';
import { LoadingSpinner, ErrorMessage } from './componentes';

// Paleta de colores
const colors = {
  primary: '#1a365d',
  primaryDark: '#0d1e3a',
  secondary: '#2c5282',
  accent: '#4299e1',
  success: '#38a169',
  warning: '#dd6b20',
  danger: '#e53e3e',
  info: '#3182ce',
};

// ----------------------
// UbicacionesSelect
// ----------------------
export const UbicacionesSelect = ({
  value,
  onChange,
  canPerformActions,
  isProcesando,
  isUpdatingExpedicion,
  ubicacionesCargadas,
  ubicacionesConStock,
  formatearInfoStock,
  zonaDescargaClass = '',
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <FormControl
      fullWidth
      size="small"
      disabled={!canPerformActions || isProcesando || isUpdatingExpedicion || !ubicacionesCargadas}
    >
      <Select
        value={value}
        onChange={onChange}
        displayEmpty
        IconComponent={() => <FaChevronDown style={{ marginRight: 8, color: colors.accent }} />}
        sx={{
          '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.secondary },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: colors.accent },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: colors.primary },
          ...(zonaDescargaClass === 'ps-zona-descarga' && { backgroundColor: `${colors.success}10` }),
        }}
      >
        {!ubicacionesCargadas ? (
          <MenuItem value="">Cargando ubicaciones...</MenuItem>
        ) : ubicacionesConStock.length === 0 ? (
          <MenuItem value="">Sin ubicaciones disponibles</MenuItem>
        ) : (
          ubicacionesConStock.map((ubicacion, locIndex) => (
            <MenuItem
              key={`${ubicacion.codigoAlmacen}-${ubicacion.ubicacion}-${ubicacion.partida || 'no-partida'}-${locIndex}`}
              value={buildUbicacionOptionValue(ubicacion)}
              sx={{
                whiteSpace: isMobile ? 'normal' : 'nowrap',
                borderBottom: `1px solid ${colors.secondary}20`,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2">
                  {ubicacion.codigoAlmacen} - {ubicacion.ubicacion}
                  {ubicacion.partida ? ` (${ubicacion.partida})` : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  - {formatearInfoStock(ubicacion)}
                </Typography>
              </Stack>
            </MenuItem>
          ))
        )}
      </Select>
    </FormControl>
  );
};

// ----------------------
// ExpedicionLineaPanel
// ----------------------
export const ExpedicionLineaPanel = ({
  value,
  onChange,
  unidad,
  zonaDescarga,
  canPerformActions,
  isProcesando,
  isUpdatingExpedicion,
  ubicacionesCargadas,
  isScanning,
  onEscanear,
  cameraIcon,
  mobile = false,
  showInput = true,
  showButton = true,
  isValid = true,
  helperText = '',
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const direction = mobile || isMobile ? 'column' : 'row';

  const disabledButton =
    !canPerformActions ||
    !isValid ||
    parseFloat(value) <= 0 ||
    isScanning ||
    isProcesando ||
    isUpdatingExpedicion ||
    !ubicacionesCargadas;

  return (
    <Stack direction={direction} spacing={1} alignItems={direction === 'column' ? 'stretch' : 'center'}>
      {showInput && (
        <TextField
          type="text"
          value={value}
          onChange={onChange}
          size="small"
          placeholder="1"
          InputProps={{
            endAdornment: (
              <Typography variant="caption" sx={{ ml: 1, color: colors.accent }}>
                {unidad || 'ud'}
              </Typography>
            ),
          }}
          disabled={!canPerformActions || isProcesando || isUpdatingExpedicion || !ubicacionesCargadas}
          error={!isValid && helperText !== ''}
          helperText={helperText}
          sx={{
            width: direction === 'column' ? '100%' : 120,
            '& .MuiOutlinedInput-root': {
              '&:hover fieldset': { borderColor: colors.accent },
              '&.Mui-focused fieldset': { borderColor: colors.primary },
            },
            ...(zonaDescarga && { '& .MuiInputBase-root': { backgroundColor: `${colors.success}10` } }),
          }}
        />
      )}
      {showButton && (
        <Button
          variant="contained"
          startIcon={cameraIcon}
          onClick={onEscanear}
          disabled={disabledButton}
          sx={{
            whiteSpace: 'nowrap',
            bgcolor: colors.accent,
            '&:hover': { bgcolor: colors.primary },
            width: direction === 'column' ? '100%' : 'auto',
          }}
        >
          {isProcesando ? 'Procesando...' : isScanning ? 'Escaneando...' : 'Escanear'}
        </Button>
      )}
    </Stack>
  );
};

// ----------------------
// LineaPedido (responsive: escritorio tabla, móvil tarjeta)
// ----------------------
export const LineaPedido = React.memo(({
  linea,
  pedido,
  expediciones,
  handleExpedicionChange,
  ubicaciones,
  ubicacionesCargadas,
  iniciarEscaneo,
  abrirModalDetalles,
  canPerformActions,
  isScanning,
  isProcesando,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [isUpdatingExpedicion, setIsUpdatingExpedicion] = useState(false);

  const ubicacionesConStock = useMemo(() => {
    if (!ubicacionesCargadas) return [];
    const ubicacionesArticulo = ubicaciones[linea.codigoArticulo] || [];
    let ubicacionesConStockReal = ubicacionesArticulo.filter((ubi) => {
      const tieneStock = parseFloat(ubi.unidadSaldo) > 0;
      const unidadUbicacion = normalizarUnidad(ubi.unidadMedida);
      const unidadPedido = normalizarUnidad(linea.unidadPedido);
      const unidadBase = normalizarUnidad(linea.unidadBase);
      const unidadCoincide = unidadUbicacion === unidadPedido || unidadUbicacion === unidadBase;
      const noEsZonaDescarga = ubi.ubicacion !== 'Zona descarga';
      return tieneStock && unidadCoincide && noEsZonaDescarga;
    });
    if (ubicacionesConStockReal.length === 0) {
      ubicacionesConStockReal = [
        {
          codigoAlmacen: linea.codigoAlmacen || 'CEN',
          ubicacion: 'Zona descarga',
          partida: null,
          unidadSaldo: Infinity,
          unidadMedida: linea.unidadPedido || linea.unidadBase || 'ud',
          codigoColor: '',
          codigoTalla: '',
          descripcionUbicacion: 'Stock disponible para expedición directa',
        },
      ];
    }
    return ubicacionesConStockReal.sort((a, b) => {
      const stockA = a.unidadSaldo === Infinity ? 999999 : parseFloat(a.unidadSaldo);
      const stockB = b.unidadSaldo === Infinity ? 999999 : parseFloat(b.unidadSaldo);
      return stockB - stockA;
    });
  }, [ubicaciones, ubicacionesCargadas, linea.codigoArticulo, linea.unidadPedido, linea.codigoAlmacen, linea.unidadBase]);

  const key = linea.movPosicionLinea;
  const expedicion = expediciones[key] || {
    almacen: ubicacionesConStock[0]?.codigoAlmacen || '',
    ubicacion: ubicacionesConStock[0]?.ubicacion || '',
    partida: ubicacionesConStock[0]?.partida || null,
    unidadMedida: ubicacionesConStock[0]?.unidadMedida || linea.unidadPedido,
    codigoColor: ubicacionesConStock[0]?.codigoColor || '',
    codigoTalla: ubicacionesConStock[0]?.codigoTalla || '',
    cantidad: '0',
  };

  // Sincronizar expedición si la ubicación actual ya no está disponible
  useEffect(() => {
    if (ubicacionesConStock.length === 0 || isUpdatingExpedicion) return;
    const ubicacionActual = ubicacionesConStock.find(
      (ubi) =>
        ubi.ubicacion === expedicion.ubicacion &&
        ubi.codigoAlmacen === expedicion.almacen &&
        (ubi.partida || '') === (expedicion.partida || '') &&
        (ubi.codigoColor || '') === (expedicion.codigoColor || '') &&
        (ubi.codigoTalla || '') === (expedicion.codigoTalla || '')
    );
    if (!ubicacionActual) {
      setIsUpdatingExpedicion(true);
      const timeoutId = setTimeout(() => {
        const primera = ubicacionesConStock[0];
        if (primera) {
          handleExpedicionChange(key, 'ubicacion', primera.ubicacion);
          handleExpedicionChange(key, 'almacen', primera.codigoAlmacen);
          handleExpedicionChange(key, 'partida', primera.partida || '');
          handleExpedicionChange(key, 'unidadMedida', primera.unidadMedida || linea.unidadPedido);
          handleExpedicionChange(key, 'codigoColor', primera.codigoColor || '');
          handleExpedicionChange(key, 'codigoTalla', primera.codigoTalla || '');
          const pendientes = parseFloat(linea.unidadesPendientes) || 0;
          let nuevaCantidad = 0;
          if (primera.ubicacion === 'Zona descarga') nuevaCantidad = pendientes;
          else {
            const stock = parseFloat(primera.unidadSaldo) || 0;
            nuevaCantidad = Math.min(pendientes, stock);
          }
          handleExpedicionChange(key, 'cantidad', nuevaCantidad.toString());
        }
        setIsUpdatingExpedicion(false);
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [
    ubicacionesConStock,
    expedicion.ubicacion,
    expedicion.almacen,
    expedicion.partida,
    expedicion.codigoColor,
    expedicion.codigoTalla,
    handleExpedicionChange,
    key,
    linea.unidadesPendientes,
    linea.unidadPedido,
    isUpdatingExpedicion,
  ]);

  const formatted = useMemo(() => {
    const pendientes = parseFloat(linea.unidadesPendientes) || 0;
    const unidadVenta = linea.unidadBase || 'ud';
    const unidadStock = linea.unidadAlternativa || 'ud';
    const factor = parseFloat(linea.factorConversion) || 1;
    const equivalencia = pendientes * factor;
    const mostrarEquivalencia = factor !== 1 || unidadStock !== unidadVenta;
    return {
      pendiente: formatearUnidad(pendientes, unidadVenta),
      equivalencia: mostrarEquivalencia ? formatearUnidad(equivalencia, unidadStock) : null,
    };
  }, [linea.unidadesPendientes, linea.unidadBase, linea.unidadAlternativa, linea.factorConversion]);

  const infoPeso = useMemo(() => {
    const pesoUnitario = parseFloat(linea.pesoUnitario) || 0;
    const pendientes = parseFloat(linea.unidadesPendientes) || 0;
    const total = pesoUnitario * pendientes;
    return { pesoUnitario, total, tienePeso: pesoUnitario > 0 };
  }, [linea.pesoUnitario, linea.unidadesPendientes]);

  const handleCambioCantidad = useCallback(
    (e) => {
      const nueva = sanitizarCantidadEntera(e.target.value);
      handleExpedicionChange(key, 'cantidad', nueva);
    },
    [handleExpedicionChange, key]
  );

  const handleCambioUbicacion = useCallback(
    (e) => {
      const valor = e.target.value;
      const seleccionada = ubicacionesConStock.find((ubi) => buildUbicacionOptionValue(ubi) === valor);
      if (!seleccionada) return;
      let nuevaCantidad = 0;
      const pendientes = parseFloat(linea.unidadesPendientes) || 0;
      if (seleccionada.ubicacion === 'Zona descarga') nuevaCantidad = pendientes;
      else {
        const stock = parseFloat(seleccionada.unidadSaldo) || 0;
        nuevaCantidad = Math.min(pendientes, stock);
      }
      handleExpedicionChange(key, 'ubicacion', seleccionada.ubicacion);
      handleExpedicionChange(key, 'almacen', seleccionada.codigoAlmacen);
      handleExpedicionChange(key, 'partida', seleccionada.partida || '');
      handleExpedicionChange(key, 'unidadMedida', seleccionada.unidadMedida || linea.unidadPedido);
      handleExpedicionChange(key, 'codigoColor', seleccionada.codigoColor || '');
      handleExpedicionChange(key, 'codigoTalla', seleccionada.codigoTalla || '');
      handleExpedicionChange(key, 'cantidad', nuevaCantidad.toString());
    },
    [handleExpedicionChange, key, linea.unidadesPendientes, linea.unidadPedido, ubicacionesConStock]
  );

  const formatearInfoStock = useCallback((ubicacion) => {
    if (ubicacion.ubicacion === 'Zona descarga') return 'Stock disponible';
    const stock = parseFloat(ubicacion.unidadSaldo);
    if (isNaN(stock)) return 'Stock no disponible';
    return `Stock: ${formatearUnidad(stock, ubicacion.unidadMedida)}`;
  }, []);

  const ubicacionSeleccionada = useMemo(
    () =>
      ubicacionesConStock.find(
        (ubi) =>
          ubi.ubicacion === expedicion.ubicacion &&
          ubi.codigoAlmacen === expedicion.almacen &&
          (ubi.partida || '') === (expedicion.partida || '') &&
          (ubi.codigoColor || '') === (expedicion.codigoColor || '') &&
          (ubi.codigoTalla || '') === (expedicion.codigoTalla || '')
      ) || null,
    [ubicacionesConStock, expedicion]
  );

  const cantidadValidacion = useMemo(() => {
    const cantidadTexto = sanitizarCantidadEntera(expedicion.cantidad);
    const cantidad = parseInt(cantidadTexto, 10);
    const pendientes = parseInt(parseFloat(linea.unidadesPendientes) || 0, 10);
    if (!ubicacionSeleccionada) return { isValid: false, helperText: 'Seleccione una ubicación válida', cantidad: 0 };
    if (!cantidadTexto || isNaN(cantidad) || cantidad < 1) return { isValid: false, helperText: 'Cantidad mínima: 1', cantidad: 0 };
    if (cantidad > pendientes) return { isValid: false, helperText: 'Supera pendiente', cantidad };
    if (ubicacionSeleccionada.ubicacion !== 'Zona descarga' && ubicacionSeleccionada.unidadSaldo !== Infinity) {
      const stock = parseInt(parseFloat(ubicacionSeleccionada.unidadSaldo) || 0, 10);
      if (cantidad > stock) return { isValid: false, helperText: 'Supera stock disponible', cantidad };
    }
    return { isValid: true, helperText: '', cantidad };
  }, [expedicion.cantidad, linea.unidadesPendientes, ubicacionSeleccionada]);

  // Vista móvil (tarjeta) - CON GRID CORREGIDO
  if (isMobile) {
    return (
      <Card variant="outlined" sx={{ borderRadius: 2, borderLeft: `3px solid ${colors.accent}` }}>
        <CardContent>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="subtitle2" fontWeight={700} color={colors.primary}>
                {linea.codigoArticulo}
              </Typography>
              <Typography variant="body2">{linea.descripcionArticulo}</Typography>
              {linea.codigoAlternativo && <Typography variant="caption" color="text.secondary">{linea.codigoAlternativo}</Typography>}
            </Box>

            {/* Grid corregido: size={{ xs: 6 }} en lugar de item xs={6} */}
            <Grid container spacing={1}>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary">Pendiente:</Typography>
                <Typography variant="body2">{formatted.pendiente}</Typography>
                {formatted.equivalencia && <Typography variant="caption">({formatted.equivalencia})</Typography>}
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography variant="caption" color="text.secondary">Peso:</Typography>
                <Typography variant="body2">
                  {infoPeso.tienePeso ? `${infoPeso.total.toFixed(2)} kg` : 'Sin peso'}
                </Typography>
              </Grid>
            </Grid>

            <UbicacionesSelect
              value={ubicacionSeleccionada ? buildUbicacionOptionValue(ubicacionSeleccionada) : ''}
              onChange={handleCambioUbicacion}
              canPerformActions={canPerformActions}
              isProcesando={isProcesando}
              isUpdatingExpedicion={isUpdatingExpedicion}
              ubicacionesCargadas={ubicacionesCargadas}
              ubicacionesConStock={ubicacionesConStock}
              formatearInfoStock={formatearInfoStock}
              zonaDescargaClass={expedicion.ubicacion === 'Zona descarga' ? 'ps-zona-descarga' : ''}
            />

            <ExpedicionLineaPanel
              value={expedicion.cantidad}
              onChange={handleCambioCantidad}
              unidad={linea.unidadBase || 'ud'}
              zonaDescarga={expedicion.ubicacion === 'Zona descarga'}
              canPerformActions={canPerformActions}
              isProcesando={isProcesando}
              isUpdatingExpedicion={isUpdatingExpedicion}
              ubicacionesCargadas={ubicacionesCargadas}
              isScanning={isScanning}
              onEscanear={() => {
                if (canPerformActions && cantidadValidacion.isValid) iniciarEscaneo(linea, pedido);
              }}
              cameraIcon={<FaCamera />}
              mobile
              isValid={cantidadValidacion.isValid}
              helperText={cantidadValidacion.helperText}
            />

            {linea.detalles && (
              <Button
                size="small"
                startIcon={<FaInfoCircle />}
                onClick={() => abrirModalDetalles(linea.detalles, linea, pedido)}
                sx={{ alignSelf: 'flex-start', color: colors.info }}
              >
                Ver variantes
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>
    );
  }

  // Vista escritorio (fila de tabla)
  return (
    <TableRow sx={{ '&:hover': { bgcolor: `${colors.secondary}08` } }}>
      <TableCell>
        <Typography variant="body2" fontWeight={500}>{linea.codigoArticulo}</Typography>
        {linea.codigoAlternativo && <Typography variant="caption" color="text.secondary">{linea.codigoAlternativo}</Typography>}
      </TableCell>
      <TableCell>
        <Typography variant="body2">{linea.descripcionArticulo}</Typography>
        <Typography variant="caption" color="text.secondary">{linea.descripcion2Articulo}</Typography>
      </TableCell>
      <TableCell>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2">{formatted.pendiente}</Typography>
          {formatted.equivalencia && <Typography variant="caption" color="text.secondary">{formatted.equivalencia}</Typography>}
          {linea.detalles && (
            <IconButton size="small" onClick={() => abrirModalDetalles(linea.detalles, linea, pedido)} sx={{ color: colors.info }}>
              <FaInfoCircle size={14} />
            </IconButton>
          )}
        </Stack>
      </TableCell>
      <TableCell>
        {infoPeso.tienePeso ? (
          <>
            <Typography variant="caption">Unit.: {infoPeso.pesoUnitario.toFixed(2)} kg</Typography>
            <Typography variant="body2">Total: {infoPeso.total.toFixed(2)} kg</Typography>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">Sin peso</Typography>
        )}
      </TableCell>
      <TableCell>
        <UbicacionesSelect
          value={ubicacionSeleccionada ? buildUbicacionOptionValue(ubicacionSeleccionada) : ''}
          onChange={handleCambioUbicacion}
          canPerformActions={canPerformActions}
          isProcesando={isProcesando}
          isUpdatingExpedicion={isUpdatingExpedicion}
          ubicacionesCargadas={ubicacionesCargadas}
          ubicacionesConStock={ubicacionesConStock}
          formatearInfoStock={formatearInfoStock}
          zonaDescargaClass={expedicion.ubicacion === 'Zona descarga' ? 'ps-zona-descarga' : ''}
        />
      </TableCell>
      <TableCell>
        <ExpedicionLineaPanel
          value={expedicion.cantidad}
          onChange={handleCambioCantidad}
          unidad={linea.unidadBase || 'ud'}
          zonaDescarga={expedicion.ubicacion === 'Zona descarga'}
          canPerformActions={canPerformActions}
          isProcesando={isProcesando}
          isUpdatingExpedicion={isUpdatingExpedicion}
          ubicacionesCargadas={ubicacionesCargadas}
          isScanning={isScanning}
          onEscanear={() => {
            if (canPerformActions && cantidadValidacion.isValid) iniciarEscaneo(linea, pedido);
          }}
          cameraIcon={<FaCamera />}
          showButton={false}
          isValid={cantidadValidacion.isValid}
          helperText={cantidadValidacion.helperText}
        />
      </TableCell>
      <TableCell>
        <Button
          variant="contained"
          startIcon={<FaCamera />}
          onClick={() => {
            if (canPerformActions && cantidadValidacion.isValid) iniciarEscaneo(linea, pedido);
          }}
          disabled={!canPerformActions || !cantidadValidacion.isValid}
          sx={{ bgcolor: colors.accent, '&:hover': { bgcolor: colors.primary } }}
        >
          Escanear
        </Button>
      </TableCell>
    </TableRow>
  );
});

// ----------------------
// DetallesArticuloModal (modal de variantes) - RESPONSIVE
// ----------------------
export const DetallesArticuloModal = React.memo(({
  detalles,
  linea,
  pedido,
  onClose,
  onExpedirVariante,
  canPerformActions,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [ubicacionesPorDetalle, setUbicacionesPorDetalle] = useState({});
  const [selecciones, setSelecciones] = useState({});
  const [procesando, setProcesando] = useState(false);
  const [cargandoUbicaciones, setCargandoUbicaciones] = useState(true);
  const [erroresCarga, setErroresCarga] = useState({});
  const abortControllers = useRef({});

  useEffect(() => {
    return () => {
      Object.values(abortControllers.current).forEach((ctrl) => ctrl?.abort());
    };
  }, []);

  useEffect(() => {
    const detallesConStock = detalles.filter((d) => parseFloat(d.cantidadPendiente) > 0);
    if (!detallesConStock.length) {
      setCargandoUbicaciones(false);
      return;
    }
    const cargar = async () => {
      setCargandoUbicaciones(true);
      setErroresCarga({});
      const resultados = {};
      const nuevosErrores = {};
      for (const detalle of detallesConStock) {
        const key = `${detalle.codigoArticulo}-${detalle.codigoColor || 'SIN_COLOR'}-${detalle.codigoTalla || 'SIN_TALLA'}`;
        if (abortControllers.current[key]) abortControllers.current[key].abort();
        abortControllers.current[key] = new AbortController();
        try {
          const params = { codigoArticulo: detalle.codigoArticulo };
          if (detalle.codigoColor && detalle.codigoColor !== '' && detalle.codigoColor !== 'null')
            params.codigoColor = detalle.codigoColor;
          if (detalle.codigoTalla && detalle.codigoTalla !== '' && detalle.codigoTalla !== 'null')
            params.codigoTalla = detalle.codigoTalla;
          const response = await API.get('/stock/por-variante', {
            headers: getAuthHeader(),
            params,
            signal: abortControllers.current[key].signal,
          });
          resultados[key] = Array.isArray(response.data) ? response.data : [];
        } catch (error) {
          if (error.name !== 'CanceledError') {
            nuevosErrores[key] = error.message;
            resultados[key] = [];
          }
        }
      }
      setUbicacionesPorDetalle(resultados);
      setErroresCarga(nuevosErrores);
      setCargandoUbicaciones(false);
    };
    cargar();
    return () => {
      Object.values(abortControllers.current).forEach((ctrl) => ctrl?.abort());
    };
  }, [detalles]);

  const detallesConPendientes = useMemo(() => detalles.filter((d) => parseFloat(d.cantidadPendiente) > 0), [detalles]);

  const formatearInfoUbicacionModal = useCallback((ubicacion) => {
    if (ubicacion.ubicacion === 'Zona descarga') return 'Stock disponible';
    const stock = parseFloat(ubicacion.Cantidad);
    if (isNaN(stock)) return 'Stock no disponible';
    return formatearUnidad(stock, ubicacion.UnidadMedida);
  }, []);

  const getTextoOpcionUbicacion = useCallback(
    (ubicacion) => {
      let texto = `${ubicacion.CodigoAlmacen} - ${ubicacion.Ubicacion}`;
      if (ubicacion.Partida) texto += ` (${ubicacion.Partida})`;
      texto += ` - ${formatearInfoUbicacionModal(ubicacion)}`;
      if (ubicacion.CodigoColor_ || ubicacion.CodigoTalla01_) {
        const extras = [];
        if (ubicacion.CodigoColor_) extras.push(`Color: ${ubicacion.CodigoColor_}`);
        if (ubicacion.CodigoTalla01_) extras.push(`Talla: ${ubicacion.CodigoTalla01_}`);
        if (extras.length) texto += ` [${extras.join(', ')}]`;
      }
      return texto;
    },
    [formatearInfoUbicacionModal]
  );

  const handleCambioSeleccion = useCallback((detalleKey, field, value) => {
    setSelecciones((prev) => ({
      ...prev,
      [detalleKey]: { ...prev[detalleKey], [field]: value },
    }));
  }, []);

  const handleExpedir = useCallback(
    async (detalle) => {
      const detalleKey = `${detalle.codigoArticulo}-${detalle.codigoColor || 'SIN_COLOR'}-${detalle.codigoTalla || 'SIN_TALLA'}`;
      const seleccion = selecciones[detalleKey];
      if (!seleccion?.ubicacionKey || !seleccion?.cantidad) {
        alert('Debes seleccionar ubicación y cantidad.');
        return;
      }
      const cantidad = parseFloat(seleccion.cantidad);
      if (cantidad <= 0 || cantidad > detalle.cantidadPendiente) {
        alert(`Cantidad no válida (máximo ${detalle.cantidadPendiente})`);
        return;
      }
      setProcesando(true);
      try {
        const ubicaciones = ubicacionesPorDetalle[detalleKey] || [];
        const ubicacionSeleccionada = ubicaciones.find(
          (ubic) => buildUbicacionOptionValue(ubic) === seleccion.ubicacionKey
        );
        if (!ubicacionSeleccionada) throw new Error('Ubicación no encontrada');
        await onExpedirVariante({
          articulo: detalle.codigoArticulo,
          color: detalle.codigoColor,
          talla: detalle.codigoTalla,
          cantidad,
          ubicacion: ubicacionSeleccionada.Ubicacion,
          almacen: ubicacionSeleccionada.CodigoAlmacen,
          partida: ubicacionSeleccionada.Partida || '',
          unidadMedida: ubicacionSeleccionada.UnidadMedida || linea.unidadBase,
          codigoColor: ubicacionSeleccionada.CodigoColor_ || '',
          codigoTalla: ubicacionSeleccionada.CodigoTalla01_ || '',
          movPosicionLinea: linea.movPosicionLinea,
        });
        alert('Expedición confirmada ✅');
        handleCambioSeleccion(detalleKey, 'cantidad', '');
      } catch (error) {
        console.error(error);
        alert('Error al expedir: ' + (error.response?.data?.mensaje || error.message));
      } finally {
        setProcesando(false);
      }
    },
    [selecciones, ubicacionesPorDetalle, onExpedirVariante, linea, handleCambioSeleccion]
  );

  if (!detalles || !detallesConPendientes.length) {
    return (
      <Dialog open fullScreen={fullScreen} onClose={onClose} maxWidth="md">
        <DialogTitle sx={{ bgcolor: colors.primary, color: 'white' }}>
          Artículo: {linea.descripcionArticulo}
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mt: 2 }}>
            No hay variantes con unidades pendientes para este artículo.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open fullScreen={fullScreen} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ bgcolor: colors.primary, color: 'white' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Artículo: {linea.descripcionArticulo}</Typography>
          <IconButton onClick={onClose} sx={{ color: 'white' }}>
            <FaTimes />
          </IconButton>
        </Stack>
        <Typography variant="body2" sx={{ color: `${colors.accent}dd`, mt: 0.5 }}>
          Código: {linea.codigoArticulo} | Unidad: {linea.unidadBase || 'ud'}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {cargandoUbicaciones ? (
          <LoadingSpinner message="Cargando información de stock por variante..." />
        ) : isMobile ? (
          // Vista móvil: tarjetas
          <Stack spacing={2}>
            {detallesConPendientes.map((detalle) => {
              const key = `${detalle.codigoArticulo}-${detalle.codigoColor || 'SIN_COLOR'}-${detalle.codigoTalla || 'SIN_TALLA'}`;
              const ubicaciones = ubicacionesPorDetalle[key] || [];
              const seleccion = selecciones[key] || {};
              const error = erroresCarga[key];
              return (
                <Card key={key} variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Box>
                        <Typography variant="subtitle2" fontWeight={700} color={colors.primary}>
                          Color: {detalle.colorNombre || detalle.codigoColor || 'Sin color'}
                        </Typography>
                        <Typography variant="body2">
                          Talla: {detalle.descripcionTalla || detalle.codigoTalla || 'Sin talla'}
                        </Typography>
                      </Box>
                      <Typography variant="body2">
                        Pendiente: {formatearUnidad(detalle.cantidadPendiente, linea.unidadBase)}
                      </Typography>
                      {error ? (
                        <ErrorMessage message="Error al cargar ubicaciones" />
                      ) : ubicaciones.length > 0 ? (
                        <FormControl fullWidth size="small">
                          <InputLabel sx={{ color: colors.primary }}>Ubicación</InputLabel>
                          <Select
                            value={seleccion.ubicacionKey || ''}
                            onChange={(e) => handleCambioSeleccion(key, 'ubicacionKey', e.target.value)}
                            disabled={!canPerformActions}
                            label="Ubicación"
                            sx={{
                              '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.secondary },
                              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: colors.accent },
                            }}
                          >
                            <MenuItem value="">Selecciona ubicación</MenuItem>
                            {ubicaciones.map((ubic, idx) => (
                              <MenuItem
                                key={`${ubic.CodigoAlmacen}-${ubic.Ubicacion}-${idx}`}
                                value={buildUbicacionOptionValue(ubic)}
                              >
                                {getTextoOpcionUbicacion(ubic)}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ) : (
                        <Alert severity="warning" icon={<FaExclamationTriangle />}>
                          Sin stock disponible
                        </Alert>
                      )}
                      <TextField
                        type="number"
                        label="Cantidad"
                        value={seleccion.cantidad || ''}
                        onChange={(e) => {
                          let val = parseFloat(e.target.value) || 0;
                          val = Math.min(val, detalle.cantidadPendiente);
                          handleCambioSeleccion(key, 'cantidad', val.toString());
                        }}
                        disabled={!canPerformActions || ubicaciones.length === 0 || !!error}
                        size="small"
                        InputProps={{
                          endAdornment: (
                            <Typography variant="caption">{linea.unidadBase || 'ud'}</Typography>
                          ),
                        }}
                        fullWidth
                      />
                      <Button
                        variant="contained"
                        onClick={() => handleExpedir(detalle)}
                        disabled={
                          !canPerformActions ||
                          !seleccion.ubicacionKey ||
                          !seleccion.cantidad ||
                          parseFloat(seleccion.cantidad) <= 0 ||
                          procesando ||
                          !!error
                        }
                        sx={{
                          bgcolor: colors.accent,
                          '&:hover': { bgcolor: colors.primary },
                          mt: 1,
                        }}
                      >
                        {procesando ? 'Procesando...' : 'Expedir'}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        ) : (
          // Vista escritorio: tabla
          <TableContainer component={Paper} sx={{ borderRadius: 2, overflowX: 'auto' }}>
            <Table sx={{ minWidth: 700 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: `${colors.secondary}20` }}>
                  <TableCell sx={{ fontWeight: 700, color: colors.primary }}>Color</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: colors.primary }}>Talla</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: colors.primary }}>Pendiente</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: colors.primary }}>Ubicación</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: colors.primary }}>Cantidad</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: colors.primary }}>Acción</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {detallesConPendientes.map((detalle) => {
                  const key = `${detalle.codigoArticulo}-${detalle.codigoColor || 'SIN_COLOR'}-${detalle.codigoTalla || 'SIN_TALLA'}`;
                  const ubicaciones = ubicacionesPorDetalle[key] || [];
                  const seleccion = selecciones[key] || {};
                  const error = erroresCarga[key];
                  return (
                    <TableRow key={key}>
                      <TableCell>{detalle.colorNombre || detalle.codigoColor || 'Sin color'}</TableCell>
                      <TableCell>{detalle.descripcionTalla || detalle.codigoTalla || 'Sin talla'}</TableCell>
                      <TableCell>{formatearUnidad(detalle.cantidadPendiente, linea.unidadBase)}</TableCell>
                      <TableCell>
                        {error ? (
                          <ErrorMessage message="Error al cargar ubicaciones" />
                        ) : ubicaciones.length > 0 ? (
                          <FormControl fullWidth size="small">
                            <Select
                              value={seleccion.ubicacionKey || ''}
                              onChange={(e) => handleCambioSeleccion(key, 'ubicacionKey', e.target.value)}
                              disabled={!canPerformActions}
                              sx={{
                                '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.secondary },
                                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: colors.accent },
                              }}
                            >
                              <MenuItem value="">Selecciona ubicación</MenuItem>
                              {ubicaciones.map((ubic, idx) => (
                                <MenuItem
                                  key={`${ubic.CodigoAlmacen}-${ubic.Ubicacion}-${idx}`}
                                  value={buildUbicacionOptionValue(ubic)}
                                >
                                  {getTextoOpcionUbicacion(ubic)}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        ) : (
                          <Alert severity="warning" icon={<FaExclamationTriangle />}>
                            Sin stock disponible
                          </Alert>
                        )}
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          value={seleccion.cantidad || ''}
                          onChange={(e) => {
                            let val = parseFloat(e.target.value) || 0;
                            val = Math.min(val, detalle.cantidadPendiente);
                            handleCambioSeleccion(key, 'cantidad', val.toString());
                          }}
                          disabled={!canPerformActions || ubicaciones.length === 0 || !!error}
                          size="small"
                          InputProps={{
                            endAdornment: (
                              <Typography variant="caption">{linea.unidadBase || 'ud'}</Typography>
                            ),
                          }}
                          sx={{ width: 120 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="contained"
                          onClick={() => handleExpedir(detalle)}
                          disabled={
                            !canPerformActions ||
                            !seleccion.ubicacionKey ||
                            !seleccion.cantidad ||
                            parseFloat(seleccion.cantidad) <= 0 ||
                            procesando ||
                            !!error
                          }
                          sx={{
                            bgcolor: colors.accent,
                            '&:hover': { bgcolor: colors.primary },
                          }}
                        >
                          {procesando ? 'Procesando...' : 'Expedir'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
});

// ----------------------
// CameraModal
// ----------------------
export const CameraModal = React.memo(({
  showCamera,
  setShowCamera,
  cameras,
  selectedCamera,
  setSelectedCamera,
  manualCode,
  setManualCode,
  handleScanSuccess,
  handleManualVerification,
  cameraError,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const scannerRef = useRef(null);

  useEffect(() => {
    let scanner = null;
    const container = document.getElementById('ps-camera-container');
    if (!showCamera || cameraError || !selectedCamera || !container) return;
    const iniciar = async () => {
      try {
        container.innerHTML = '';
        scanner = new Html5Qrcode('ps-camera-container', { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 });
        await scanner.start(
          selectedCamera,
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
          (decodedText) => {
            handleScanSuccess(decodedText);
            setShowCamera(false);
          },
          (err) => {}
        );
        scannerRef.current = scanner;
      } catch (err) {
        console.error('Error iniciando escáner:', err);
      }
    };
    iniciar();
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    };
  }, [showCamera, selectedCamera, handleScanSuccess, setShowCamera, cameraError]);

  return (
    <Dialog open={showCamera} onClose={() => setShowCamera(false)} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: colors.primary, color: 'white' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            <FaQrcode style={{ marginRight: 8 }} /> Escanear Artículo
          </Typography>
          <IconButton onClick={() => setShowCamera(false)} sx={{ color: 'white' }}>
            <FaTimes />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {cameraError ? (
          <Stack spacing={2}>
            <Alert severity="error" icon={<FaExclamationTriangle />}>
              <strong>No se pudo acceder a la cámara</strong>
              <br />
              {cameraError}
            </Alert>
            <Alert severity="info">
              <strong>⚠️ Cámara no disponible en HTTP:</strong>
              <br />
              Para usar la cámara necesitas:
              <ul>
                <li>Usar HTTPS en lugar de HTTP</li>
                <li>O acceder desde localhost</li>
                <li>O usar la entrada manual de código</li>
              </ul>
            </Alert>
            <Box>
              <Typography variant="subtitle2">Introduce el código manualmente:</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Código del artículo"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  autoFocus
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      '&:hover fieldset': { borderColor: colors.accent },
                      '&.Mui-focused fieldset': { borderColor: colors.primary },
                    },
                  }}
                />
                <Button
                  variant="contained"
                  onClick={handleManualVerification}
                  disabled={!manualCode}
                  startIcon={<FaCheck />}
                  sx={{ bgcolor: colors.accent, '&:hover': { bgcolor: colors.primary } }}
                >
                  Verificar
                </Button>
              </Stack>
            </Box>
          </Stack>
        ) : (
          <Stack spacing={2}>
            {cameras.length > 0 && (
              <FormControl fullWidth size="small">
                <InputLabel sx={{ color: colors.primary }}>Cámara</InputLabel>
                <Select
                  value={selectedCamera}
                  onChange={(e) => setSelectedCamera(e.target.value)}
                  label="Cámara"
                  startAdornment={<FaCamera style={{ marginRight: 8, color: colors.accent }} />}
                  sx={{
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.secondary },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: colors.accent },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: colors.primary },
                  }}
                >
                  {cameras.map((camera) => (
                    <MenuItem key={camera.id} value={camera.id}>
                      {camera.label || `Cámara ${camera.id}`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <Box
              id="ps-camera-container"
              sx={{
                bgcolor: 'black',
                borderRadius: 2,
                overflow: 'hidden',
                minHeight: 300,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {cameras.length === 0 && !cameraError && (
                <Stack alignItems="center" justifyContent="center" sx={{ height: 300 }}>
                  <CircularProgress sx={{ color: colors.accent }} />
                  <Typography sx={{ mt: 2, color: 'white' }}>Inicializando cámara...</Typography>
                </Stack>
              )}
            </Box>
            <Box>
              <Typography variant="subtitle2">O introduce el código manualmente:</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Código del artículo"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      '&:hover fieldset': { borderColor: colors.accent },
                      '&.Mui-focused fieldset': { borderColor: colors.primary },
                    },
                  }}
                />
                <Button
                  variant="contained"
                  onClick={handleManualVerification}
                  disabled={!manualCode}
                  startIcon={<FaCheck />}
                  sx={{ bgcolor: colors.accent, '&:hover': { bgcolor: colors.primary } }}
                >
                  Verificar
                </Button>
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowCamera(false)}>Cancelar</Button>
      </DialogActions>
    </Dialog>
  );
});