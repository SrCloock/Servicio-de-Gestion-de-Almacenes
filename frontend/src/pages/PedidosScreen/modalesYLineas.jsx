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
  sinStock = false,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // FIX: Si no hay stock, mostrar alerta roja en lugar del select
  if (ubicacionesCargadas && sinStock) {
    return (
      <Alert
        severity="error"
        icon={<FaExclamationTriangle />}
        sx={{ py: 0.5, fontSize: '0.78rem' }}
      >
        Sin stock disponible
      </Alert>
    );
  }

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
        }}
      >
        {!ubicacionesCargadas ? (
          <MenuItem value="">Cargando ubicaciones...</MenuItem>
        ) : ubicacionesConStock.length === 0 ? (
          <MenuItem value="" disabled>Sin ubicaciones disponibles</MenuItem>
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
  sinStock = false,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const direction = mobile || isMobile ? 'column' : 'row';

  // FIX: Si no hay stock, deshabilitar todo el panel
  const disabledButton =
    sinStock ||
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
          disabled={sinStock || !canPerformActions || isProcesando || isUpdatingExpedicion || !ubicacionesCargadas}
          error={!isValid && helperText !== ''}
          helperText={helperText}
          sx={{
            width: direction === 'column' ? '100%' : 120,
            '& .MuiOutlinedInput-root': {
              '&:hover fieldset': { borderColor: colors.accent },
              '&.Mui-focused fieldset': { borderColor: colors.primary },
            },
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
// FIX PRINCIPAL: Elimina Zona descarga y SIN-UBICACION, alerta roja si no hay stock real
// ----------------------
export const LineaPedido = React.memo(({
  linea,
  pedido,
  expediciones,
  handleExpedicionChange,
  ubicaciones,
  ubicacionesCargadas,
  iniciarEscaneo,
  onExpedirDirecto, // FIX: nuevo callback para expedir desde ClickCounterModal
  abrirModalDetalles,
  canPerformActions,
  isScanning,
  isProcesando,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [isUpdatingExpedicion, setIsUpdatingExpedicion] = useState(false);
  const [showClickCounter, setShowClickCounter] = useState(false);
  // FIX BUG CANTIDAD: ref para saber si la ubicación ya fue inicializada para esta línea.
  // Evita que el useEffect de sincronización se dispare al cambiar la cantidad.
  const ubicacionInicializadaRef = useRef(false);

  // FIX: Solo ubicaciones reales con stock — sin Zona descarga, sin SIN-UBICACION
  const ubicacionesConStock = useMemo(() => {
    if (!ubicacionesCargadas) return [];
    const ubicacionesArticulo = ubicaciones[linea.codigoArticulo] || [];

    // Filtrar: solo reales, con stock > 0, unidad coincide, excluir explícitamente zona descarga y sin-ubicacion
    const ubicacionesReales = ubicacionesArticulo.filter((ubi) => {
      const tieneStock = parseFloat(ubi.unidadSaldo) > 0;
      const unidadUbicacion = normalizarUnidad(ubi.unidadMedida);
      const unidadPedido = normalizarUnidad(linea.unidadPedido);
      const unidadBase = normalizarUnidad(linea.unidadBase);
      const unidadCoincide = unidadUbicacion === unidadPedido || unidadUbicacion === unidadBase;
      // FIX: Excluir explícitamente zona descarga y sin-ubicacion
      const esZonaDescarga = ubi.ubicacion === 'Zona descarga';
      const esSinUbicacion = !ubi.ubicacion || ubi.ubicacion === 'SIN-UBICACION' || ubi.ubicacion.trim() === '';
      return tieneStock && unidadCoincide && !esZonaDescarga && !esSinUbicacion;
    });

    // Ordenar: la principal (primera en AcumuladoStockUbicacion suele tener más stock) primero
    return ubicacionesReales.sort((a, b) => {
      const stockA = parseFloat(a.unidadSaldo) || 0;
      const stockB = parseFloat(b.unidadSaldo) || 0;
      return stockB - stockA;
    });
  }, [ubicaciones, ubicacionesCargadas, linea.codigoArticulo, linea.unidadPedido, linea.unidadBase]);

  // FIX: solo bloquear expedición directa si hay variantes REALES con pendientes > 0
  // linea.detalles puede existir pero con todas las tallas a 0 (artículo con grupoTalla sin desglose)
  const tieneVariantesReales = useMemo(() => {
    if (!linea.detalles || !Array.isArray(linea.detalles)) return false;
    return linea.detalles.some((variante) =>
      variante.tallas &&
      Object.values(variante.tallas).some((t) => parseFloat(t.unidades) > 0)
    );
  }, [linea.detalles]);

  // FIX: sinStock se usa para alerta roja y deshabilitar controles
  const sinStock = ubicacionesCargadas && ubicacionesConStock.length === 0;

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

  // FIX BUG CANTIDAD: Este efecto SOLO se dispara cuando cambian las ubicaciones disponibles,
  // NO cuando cambia la cantidad ni otros campos de expedicion.
  // Caso 1: La ubicación aún no ha sido inicializada → asignar la primera disponible.
  // Caso 2: Las ubicaciones cambiaron (p.ej. tras expedir) y la ubicación actual ya no tiene stock → reasignar.
  // En ningún caso se debe disparar al escribir en el input de cantidad.
  useEffect(() => {
    if (ubicacionesConStock.length === 0 || isUpdatingExpedicion) return;

    // Leer el estado actual de expedicion a través de la ref para no añadirlo como dependencia
    const expedicionActual = expediciones[key];

    // Caso 1: No hay expedición inicializada aún para esta línea
    if (!expedicionActual || !expedicionActual.ubicacion) {
      if (ubicacionInicializadaRef.current) return; // Ya se inicializó antes, no volver a hacerlo
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
          const stock = parseFloat(primera.unidadSaldo) || 0;
          handleExpedicionChange(key, 'cantidad', Math.min(pendientes, stock).toString());
          ubicacionInicializadaRef.current = true;
        }
        setIsUpdatingExpedicion(false);
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    // Caso 2: Hay expedición pero la ubicación ya no existe en las disponibles (cambió el stock)
    const ubicacionSigueDisponible = ubicacionesConStock.find(
      (ubi) =>
        ubi.ubicacion === expedicionActual.ubicacion &&
        ubi.codigoAlmacen === expedicionActual.almacen &&
        (ubi.partida || '') === (expedicionActual.partida || '') &&
        (ubi.codigoColor || '') === (expedicionActual.codigoColor || '') &&
        (ubi.codigoTalla || '') === (expedicionActual.codigoTalla || '')
    );
    if (!ubicacionSigueDisponible) {
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
          const stock = parseFloat(primera.unidadSaldo) || 0;
          handleExpedicionChange(key, 'cantidad', Math.min(pendientes, stock).toString());
        }
        setIsUpdatingExpedicion(false);
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  // FIX: Solo depende de ubicacionesConStock — NO de expedicion.* para no dispararse al cambiar cantidad
  }, [ubicacionesConStock]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const pendientes = parseFloat(linea.unidadesPendientes) || 0;
      const stock = parseFloat(seleccionada.unidadSaldo) || 0;
      const nuevaCantidad = Math.min(pendientes, stock);
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
    if (sinStock) return { isValid: false, helperText: 'Sin stock disponible', cantidad: 0 };
    const cantidadTexto = sanitizarCantidadEntera(expedicion.cantidad);
    const cantidad = parseInt(cantidadTexto, 10);
    const pendientes = parseInt(parseFloat(linea.unidadesPendientes) || 0, 10);
    if (!ubicacionSeleccionada) return { isValid: false, helperText: 'Seleccione una ubicación válida', cantidad: 0 };
    if (!cantidadTexto || isNaN(cantidad) || cantidad < 1) return { isValid: false, helperText: 'Cantidad mínima: 1', cantidad: 0 };
    if (cantidad > pendientes) return { isValid: false, helperText: 'Supera pendiente', cantidad };
    const stock = parseInt(parseFloat(ubicacionSeleccionada.unidadSaldo) || 0, 10);
    if (cantidad > stock) return { isValid: false, helperText: 'Supera stock disponible', cantidad };
    return { isValid: true, helperText: '', cantidad };
  }, [expedicion.cantidad, linea.unidadesPendientes, ubicacionSeleccionada, sinStock]);

  // Vista móvil (tarjeta)
  if (isMobile) {
    return (
      <>
        <Card
          variant="outlined"
          sx={{
            borderRadius: 2,
            borderLeft: `3px solid ${sinStock ? colors.danger : colors.accent}`,
          }}
        >
        <CardContent>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="subtitle2" fontWeight={700} color={colors.primary}>
                {linea.codigoArticulo}
              </Typography>
              <Typography variant="body2">{linea.descripcionArticulo}</Typography>
              {linea.codigoAlternativo && <Typography variant="caption" color="text.secondary">{linea.codigoAlternativo}</Typography>}
            </Box>

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
              sinStock={sinStock}
            />

            {/* Si tiene variantes: solo mostrar botón de modal, no escanear/contar directo */}
            {tieneVariantesReales ? (
              <Button
                variant="contained"
                size="small"
                startIcon={<FaInfoCircle />}
                onClick={() => abrirModalDetalles(linea.detalles, linea, pedido)}
                sx={{ bgcolor: colors.accent, '&:hover': { bgcolor: colors.primary } }}
              >
                Expedir por variantes
              </Button>
            ) : (
              <>
                {!sinStock && (
                  <ExpedicionLineaPanel
                    value={expedicion.cantidad}
                    onChange={handleCambioCantidad}
                    unidad={linea.unidadBase || 'ud'}
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
                    sinStock={sinStock}
                  />
                )}
                {!sinStock && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setShowClickCounter(true)}
                    disabled={!canPerformActions || isProcesando || !ubicacionesCargadas || !ubicacionSeleccionada}
                    sx={{
                      borderColor: colors.accent,
                      color: colors.accent,
                      '&:hover': { borderColor: colors.primary, color: colors.primary },
                    }}
                  >
                    Contar unidades
                  </Button>
                )}
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* ClickCounterModal */}
      <ClickCounterModal
        open={showClickCounter}
        onClose={() => setShowClickCounter(false)}
        onConfirm={(cantidad) => {
          if (onExpedirDirecto) onExpedirDirecto(linea, pedido, { ...expedicion, cantidad: cantidad.toString() });
        }}
        totalUnidades={parseInt(parseFloat(linea.unidadesPendientes) || 0, 10)}
        unidad={linea.unidadBase || 'ud'}
        descripcionArticulo={linea.descripcionArticulo}
        codigoArticulo={linea.codigoArticulo}
      />
    </>
  );
  } // cierre if (isMobile)

  return (
    <>
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
            sinStock={sinStock}
          />
        </TableCell>
        <TableCell>
          {!sinStock && (
            <ExpedicionLineaPanel
              value={expedicion.cantidad}
              onChange={handleCambioCantidad}
              unidad={linea.unidadBase || 'ud'}
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
              sinStock={sinStock}
            />
          )}
        </TableCell>
        <TableCell>
          {sinStock ? (
            <Typography variant="caption" color="error">Sin stock</Typography>
          ) : tieneVariantesReales ? (
            // Con variantes reales: solo desde el modal
            <Button
              variant="contained"
              size="small"
              startIcon={<FaInfoCircle />}
              onClick={() => abrirModalDetalles(linea.detalles, linea, pedido)}
              disabled={!canPerformActions}
              sx={{ bgcolor: colors.accent, '&:hover': { bgcolor: colors.primary }, whiteSpace: 'nowrap' }}
            >
              Expedir por variantes
            </Button>
          ) : (
            <Stack spacing={0.5}>
              <Button
                variant="contained"
                size="small"
                startIcon={<FaCamera />}
                onClick={() => {
                  if (canPerformActions && cantidadValidacion.isValid) iniciarEscaneo(linea, pedido);
                }}
                disabled={!canPerformActions || !cantidadValidacion.isValid}
                sx={{ bgcolor: colors.accent, '&:hover': { bgcolor: colors.primary }, whiteSpace: 'nowrap' }}
              >
                Escanear
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setShowClickCounter(true)}
                disabled={!canPerformActions || isProcesando || !ubicacionesCargadas || !ubicacionSeleccionada}
                sx={{
                  borderColor: colors.accent,
                  color: colors.accent,
                  '&:hover': { borderColor: colors.primary, color: colors.primary },
                  whiteSpace: 'nowrap',
                }}
              >
                Contar
              </Button>
            </Stack>
          )}
        </TableCell>
      </TableRow>

      {/* ClickCounterModal */}
      <ClickCounterModal
        open={showClickCounter}
        onClose={() => setShowClickCounter(false)}
        onConfirm={(cantidad) => {
          if (onExpedirDirecto) onExpedirDirecto(linea, pedido, { ...expedicion, cantidad: cantidad.toString() });
        }}
        totalUnidades={parseInt(parseFloat(linea.unidadesPendientes) || 0, 10)}
        unidad={linea.unidadBase || 'ud'}
        descripcionArticulo={linea.descripcionArticulo}
        codigoArticulo={linea.codigoArticulo}
      />
    </>
  );
});

// ----------------------
// DetallesArticuloModal (modal de variantes) - RESPONSIVE
// FIX: buildUbicacionOptionValue funciona con campos en mayúscula de la API
// ----------------------
export const DetallesArticuloModal = React.memo(({
  detalles,
  linea,
  pedido,
  onClose,
  onExpedirVariante,
  canPerformActions,
  iniciarEscaneo, // para escanear desde el modal
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [ubicacionesPorDetalle, setUbicacionesPorDetalle] = useState({});
  const [selecciones, setSelecciones] = useState({});
  const [procesando, setProcesando] = useState(false);
  const [cargandoUbicaciones, setCargandoUbicaciones] = useState(true);
  const [erroresCarga, setErroresCarga] = useState({});
  // Para escanear/contar desde el modal de variantes
  const [clickCounterDetalle, setClickCounterDetalle] = useState(null); // { key, detalle }
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
          // FIX: Filtrar también Zona descarga y SIN-UBICACION en el modal
          const ubicacionesFiltradas = (Array.isArray(response.data) ? response.data : []).filter((ubic) => {
            const esZonaDescarga = ubic.Ubicacion === 'Zona descarga';
            const esSinUbicacion = !ubic.Ubicacion || ubic.Ubicacion === 'SIN-UBICACION' || ubic.Ubicacion.trim() === '';
            return !esZonaDescarga && !esSinUbicacion && parseFloat(ubic.Cantidad) > 0;
          });
          resultados[key] = ubicacionesFiltradas;
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

  // Autoseleccionar ubicación principal y cantidad cuando se cargan las ubicaciones
  // Mismas reglas que LineaPedido: primera ubicación con más stock, cantidad = min(pendiente, stock)
  useEffect(() => {
    if (cargandoUbicaciones) return;
    const nuevasSelecciones = {};
    detallesConPendientes.forEach((detalle) => {
      const key = `${detalle.codigoArticulo}-${detalle.codigoColor || 'SIN_COLOR'}-${detalle.codigoTalla || 'SIN_TALLA'}`;
      const ubicaciones = ubicacionesPorDetalle[key] || [];
      if (ubicaciones.length === 0) return;
      // Ordenar por stock descendente — la primera es la principal
      const ordenadas = [...ubicaciones].sort(
        (a, b) => parseFloat(b.Cantidad) - parseFloat(a.Cantidad)
      );
      const principal = ordenadas[0];
      const stockDisponible = parseFloat(principal.Cantidad) || 0;
      const pendiente = parseFloat(detalle.cantidadPendiente) || 0;
      // Reglas de cantidad: min(pendiente, stock)
      const cantidadAuto = Math.min(pendiente, stockDisponible);
      nuevasSelecciones[key] = {
        ubicacionKey: buildUbicacionOptionValue(principal),
        cantidad: cantidadAuto > 0 ? cantidadAuto.toString() : '',
      };
    });
    if (Object.keys(nuevasSelecciones).length > 0) {
      setSelecciones((prev) => ({ ...prev, ...nuevasSelecciones }));
    }
  }, [cargandoUbicaciones, ubicacionesPorDetalle]); // eslint-disable-line react-hooks/exhaustive-deps

  const detallesConPendientes = useMemo(() => detalles.filter((d) => parseFloat(d.cantidadPendiente) > 0), [detalles]);

  const formatearInfoUbicacionModal = useCallback((ubicacion) => {
    const stock = parseFloat(ubicacion.Cantidad);
    if (isNaN(stock)) return 'Stock no disponible';
    return formatearUnidad(stock, ubicacion.UnidadMedida);
  }, []);

  const getTextoOpcionUbicacion = useCallback(
    (ubicacion) => {
      let texto = `${ubicacion.CodigoAlmacen} - ${ubicacion.Ubicacion}`;
      if (ubicacion.Partida) texto += ` (${ubicacion.Partida})`;
      texto += ` - ${formatearInfoUbicacionModal(ubicacion)}`;
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

  // FIX: buildUbicacionOptionValue en el modal — los campos de la API vienen en PascalCase
  // Usamos la función helper que ya maneja ambos (codigoAlmacen y CodigoAlmacen)
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
        const ubicacionesDetalle = ubicacionesPorDetalle[detalleKey] || [];
        const ubicacionSeleccionada = ubicacionesDetalle.find(
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
              const ubicacionesDetalle = ubicacionesPorDetalle[key] || [];
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
                      ) : ubicacionesDetalle.length > 0 ? (
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
                            {ubicacionesDetalle.map((ubic, idx) => (
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
                        <Alert severity="error" icon={<FaExclamationTriangle />}>
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
                        disabled={!canPerformActions || ubicacionesDetalle.length === 0 || !!error}
                        size="small"
                        InputProps={{
                          endAdornment: (
                            <Typography variant="caption">{linea.unidadBase || 'ud'}</Typography>
                          ),
                        }}
                        fullWidth
                      />
                      {/* Solo Escanear y Contar — sin botón Expedir directo */}
                      {iniciarEscaneo && (
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<FaCamera />}
                          onClick={() => iniciarEscaneo(linea, pedido, { color: detalle.codigoColor, talla: detalle.codigoTalla })}
                          disabled={!canPerformActions || ubicacionesDetalle.length === 0 || !!error || !seleccion.ubicacionKey}
                          sx={{ bgcolor: colors.secondary, '&:hover': { bgcolor: colors.primary } }}
                        >
                          Escanear
                        </Button>
                      )}
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setClickCounterDetalle({ key, detalle })}
                        disabled={!canPerformActions || ubicacionesDetalle.length === 0 || !!error || !seleccion.ubicacionKey}
                        sx={{ borderColor: colors.accent, color: colors.accent }}
                      >
                        Contar unidades
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
                  const ubicacionesDetalle = ubicacionesPorDetalle[key] || [];
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
                        ) : ubicacionesDetalle.length > 0 ? (
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
                              {ubicacionesDetalle.map((ubic, idx) => (
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
                          <Alert severity="error" icon={<FaExclamationTriangle />}>
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
                          disabled={!canPerformActions || ubicacionesDetalle.length === 0 || !!error}
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
                        <Stack spacing={0.5}>
                          {/* Solo Escanear y Contar — sin botón Expedir directo */}
                          {iniciarEscaneo && (
                            <Button
                              variant="contained"
                              size="small"
                              startIcon={<FaCamera />}
                              onClick={() => iniciarEscaneo(linea, pedido, { color: detalle.codigoColor, talla: detalle.codigoTalla })}
                              disabled={!canPerformActions || ubicacionesDetalle.length === 0 || !!error || !seleccion.ubicacionKey}
                              sx={{ bgcolor: colors.secondary, '&:hover': { bgcolor: colors.primary }, whiteSpace: 'nowrap' }}
                            >
                              Escanear
                            </Button>
                          )}
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => setClickCounterDetalle({ key, detalle })}
                            disabled={!canPerformActions || ubicacionesDetalle.length === 0 || !!error || !seleccion.ubicacionKey}
                            sx={{ borderColor: colors.accent, color: colors.accent, whiteSpace: 'nowrap' }}
                          >
                            Contar
                          </Button>
                        </Stack>
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

      {/* ClickCounterModal para variantes */}
      {clickCounterDetalle && (
        <ClickCounterModal
          open={!!clickCounterDetalle}
          onClose={() => setClickCounterDetalle(null)}
          onConfirm={(cantidad) => {
            // FIX race condition: no usar setState + handleExpedir en el mismo tick.
            // Llamar directamente a onExpedirVariante con la cantidad contada.
            const { key: dKey, detalle: dDetalle } = clickCounterDetalle;
            const ubicacionesDetalle = ubicacionesPorDetalle[dKey] || [];
            const seleccion = selecciones[dKey] || {};
            const ubicacionSeleccionada = ubicacionesDetalle.find(
              (u) => buildUbicacionOptionValue(u) === seleccion.ubicacionKey
            );
            if (!ubicacionSeleccionada) {
              alert('Selecciona una ubicación antes de contar.');
              setClickCounterDetalle(null);
              return;
            }
            setProcesando(true);
            onExpedirVariante({
              articulo: dDetalle.codigoArticulo,
              color: dDetalle.codigoColor,
              talla: dDetalle.codigoTalla,
              cantidad,
              ubicacion: ubicacionSeleccionada.Ubicacion,
              almacen: ubicacionSeleccionada.CodigoAlmacen,
              partida: ubicacionSeleccionada.Partida || '',
              unidadMedida: ubicacionSeleccionada.UnidadMedida || linea.unidadBase,
              codigoColor: ubicacionSeleccionada.CodigoColor_ || '',
              codigoTalla: ubicacionSeleccionada.CodigoTalla01_ || '',
              movPosicionLinea: linea.movPosicionLinea,
            }).finally(() => setProcesando(false));
            setClickCounterDetalle(null);
          }}
          totalUnidades={parseInt(parseFloat(clickCounterDetalle.detalle.cantidadPendiente) || 0, 10)}
          unidad={linea.unidadBase || 'ud'}
          descripcionArticulo={`${clickCounterDetalle.detalle.colorNombre || ''} / ${clickCounterDetalle.detalle.descripcionTalla || ''}`}
          codigoArticulo={linea.codigoArticulo}
        />
      )}
    </Dialog>
  );
});

// ----------------------
// ClickCounterModal — nuevo método: clicks por unidad en lugar de entrada manual
// Reglas:
//   ≤ 100 unidades  → 1 clic = 1 unidad
//   101–500         → 1 clic = 10 unidades
//   > 500           → 1 clic = 100 unidades
// Al alcanzar el total → confirmación antes de expedir
// ----------------------
export const ClickCounterModal = React.memo(({
  open,
  onClose,
  onConfirm,
  totalUnidades,
  unidad,
  descripcionArticulo,
  codigoArticulo,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  // Calcular tamaño de lote según total
  const lotePorClic = useMemo(() => {
    if (totalUnidades <= 100) return 1;
    if (totalUnidades <= 500) return 10;
    return 100;
  }, [totalUnidades]);

  const [clicsDados, setClicsDados] = useState(0);
  const [confirmando, setConfirmando] = useState(false);

  // Resetear al abrir
  useEffect(() => {
    if (open) {
      setClicsDados(0);
      setConfirmando(false);
    }
  }, [open]);

  const unidadesContadas = useMemo(() => {
    return Math.min(clicsDados * lotePorClic, totalUnidades);
  }, [clicsDados, lotePorClic, totalUnidades]);

  const completado = unidadesContadas >= totalUnidades;
  const progreso = totalUnidades > 0 ? (unidadesContadas / totalUnidades) * 100 : 0;

  const handleClic = useCallback(() => {
    if (completado) return;
    setClicsDados((prev) => prev + 1);
  }, [completado]);

  const handleConfirmar = useCallback(() => {
    setConfirmando(true);
  }, []);

  const handleConfirmarFinal = useCallback(() => {
    onConfirm(unidadesContadas);
    onClose();
  }, [onConfirm, onClose, unidadesContadas]);

  const handleReset = useCallback(() => {
    setClicsDados(0);
    setConfirmando(false);
  }, []);

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ bgcolor: colors.primary, color: 'white' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            Contar unidades
          </Typography>
          <IconButton onClick={onClose} sx={{ color: 'white' }} size="small">
            <FaTimes />
          </IconButton>
        </Stack>
        <Typography variant="body2" sx={{ color: `${colors.accent}dd`, mt: 0.5, fontSize: '0.8rem' }}>
          {codigoArticulo} — {descripcionArticulo}
        </Typography>
      </DialogTitle>

      <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
        {!confirmando ? (
          <Stack spacing={2} alignItems="center">
            {/* Info de lote */}
            <Alert severity="info" sx={{ width: '100%', py: 0.5 }}>
              <Typography variant="caption">
                Total a servir: <strong>{totalUnidades} {unidad || 'ud'}</strong>
                {' · '}Cada clic cuenta: <strong>{lotePorClic} {unidad || 'ud'}</strong>
              </Typography>
            </Alert>

            {/* Contador grande — botón de clic */}
            <Box
              onClick={handleClic}
              sx={{
                width: { xs: 160, sm: 200 },
                height: { xs: 160, sm: 200 },
                borderRadius: '50%',
                bgcolor: completado ? colors.success : colors.primary,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: completado ? 'default' : 'pointer',
                userSelect: 'none',
                boxShadow: completado
                  ? `0 0 0 6px ${colors.success}40`
                  : `0 0 0 6px ${colors.accent}40`,
                transition: 'all 0.15s ease',
                '&:active': completado ? {} : {
                  transform: 'scale(0.95)',
                  boxShadow: `0 0 0 3px ${colors.accent}60`,
                },
              }}
            >
              <Typography variant="h2" sx={{ color: 'white', fontWeight: 700, lineHeight: 1, fontSize: { xs: '2.5rem', sm: '3.5rem' } }}>
                {unidadesContadas}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', mt: 0.5 }}>
                de {totalUnidades} {unidad || 'ud'}
              </Typography>
              {!completado && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', mt: 0.5, fontSize: '0.65rem' }}>
                  TAP para contar
                </Typography>
              )}
              {completado && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.9)', mt: 0.5, fontWeight: 700 }}>
                  ✓ COMPLETO
                </Typography>
              )}
            </Box>

            {/* Barra de progreso */}
            <Box sx={{ width: '100%', bgcolor: `${colors.secondary}30`, borderRadius: 1, height: 8, overflow: 'hidden' }}>
              <Box
                sx={{
                  width: `${progreso}%`,
                  height: '100%',
                  bgcolor: completado ? colors.success : colors.accent,
                  transition: 'width 0.2s ease',
                  borderRadius: 1,
                }}
              />
            </Box>

            <Typography variant="body2" color="text.secondary">
              {clicsDados} {clicsDados === 1 ? 'clic' : 'clics'} dados
              {completado ? '' : ` · Faltan ${totalUnidades - unidadesContadas} ${unidad || 'ud'}`}
            </Typography>

            <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
              <Button
                variant="outlined"
                onClick={handleReset}
                disabled={clicsDados === 0}
                sx={{ flex: 1, borderColor: colors.secondary, color: colors.secondary }}
              >
                Reiniciar
              </Button>
              <Button
                variant="contained"
                onClick={handleConfirmar}
                disabled={!completado}
                sx={{ flex: 2, bgcolor: colors.success, '&:hover': { bgcolor: '#2d8a57' } }}
              >
                Confirmar expedición
              </Button>
            </Stack>
          </Stack>
        ) : (
          // Pantalla de confirmación final
          <Stack spacing={2} alignItems="center">
            <Alert severity="warning" sx={{ width: '100%' }}>
              <Typography variant="body2">
                ¿Confirmas la expedición de <strong>{unidadesContadas} {unidad || 'ud'}</strong> del artículo <strong>{codigoArticulo}</strong>?
              </Typography>
            </Alert>
            <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
              <Button
                variant="outlined"
                onClick={() => setConfirmando(false)}
                sx={{ flex: 1, borderColor: colors.secondary, color: colors.secondary }}
              >
                Volver
              </Button>
              <Button
                variant="contained"
                startIcon={<FaCheck />}
                onClick={handleConfirmarFinal}
                sx={{ flex: 2, bgcolor: colors.success, '&:hover': { bgcolor: '#2d8a57' } }}
              >
                Sí, expedir
              </Button>
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: colors.secondary }}>Cancelar</Button>
      </DialogActions>
    </Dialog>
  );
});

// ----------------------
// CameraModal
// FIX: div del escáner fuera del árbol React (evita NotFoundError al desmontar)
// FIX: NotReadableError — esperar liberación de cámara antes de reiniciar
// FIX: Responsive — override de estilos inline de Html5Qrcode
// ----------------------

// Singleton global para rastrear si hay una cámara activa — evita NotReadableError
// al abrir el modal dos veces seguidas sin que el sistema libere el stream
let globalScannerInstance = null;

async function pararScannerGlobal() {
  if (!globalScannerInstance) return;
  const s = globalScannerInstance;
  globalScannerInstance = null;
  try { if (s.isScanning) await s.stop(); } catch (_) {}
  try { s.clear(); } catch (_) {}
  // Esperar un tick para que el navegador libere el stream de cámara
  await new Promise(r => setTimeout(r, 100));
}

export const CameraModal = React.memo(({
  showCamera,
  setShowCamera,
  cameras,
  selectedCamera,
  setSelectedCamera,
  handleScanSuccess,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const scanDivRef = useRef(null);
  const wrapperRef = useRef(null);
  const [cameraError, setCameraError] = useState('');
  const [ready, setReady] = useState(false);

  const detener = useCallback(async () => {
    await pararScannerGlobal();
    if (scanDivRef.current) {
      // Desconectar observer de estilos si existe
      if (scanDivRef.current._styleObserver) {
        scanDivRef.current._styleObserver.disconnect();
        scanDivRef.current._styleObserver = null;
      }
      if (wrapperRef.current && wrapperRef.current.contains(scanDivRef.current)) {
        wrapperRef.current.removeChild(scanDivRef.current);
      }
      scanDivRef.current = null;
    }
  }, []);

  const handleClose = useCallback(async () => {
    await detener();
    setCameraError('');
    setReady(false);
    setShowCamera(false);
  }, [detener, setShowCamera]);

  useEffect(() => {
    if (!showCamera || !selectedCamera) return;

    setCameraError('');
    setReady(false);

    const isHttp =
      window.location.protocol === 'http:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';
    if (isHttp) {
      setCameraError('La cámara solo está disponible en HTTPS o localhost.');
      return;
    }

    let cancelled = false;

    const timeoutId = setTimeout(async () => {
      if (cancelled || !wrapperRef.current) return;

      // Parar cualquier instancia previa antes de iniciar
      await pararScannerGlobal();
      if (cancelled) return;

      // Crear div hijo fuera del control de React
      const div = document.createElement('div');
      div.id = 'ps-qr-' + Date.now();
      // Estilos para que ocupe todo el wrapper — override de lo que Html5Qrcode inyecta
      div.style.cssText = 'width:100% !important;height:100% !important;';
      wrapperRef.current.appendChild(div);
      scanDivRef.current = div;

      try {
        const scanner = new Html5Qrcode(div.id, { verbose: false });

        // Calcular qrbox responsivo
        const wrapperW = wrapperRef.current?.offsetWidth || window.innerWidth;
        const boxSize = Math.min(wrapperW - 32, isMobile ? 260 : 300);

        await scanner.start(
          selectedCamera,
          {
            fps: 10,
            qrbox: { width: boxSize, height: boxSize },
            // aspectRatio en móvil: usar el aspecto de la pantalla para llenar más
            aspectRatio: isMobile ? (window.innerHeight / window.innerWidth) : 1.0,
          },
          async (decodedText) => {
            if (cancelled) return;
            globalScannerInstance = null;
            try { if (scanner.isScanning) await scanner.stop(); } catch (_) {}
            try { scanner.clear(); } catch (_) {}
            if (scanDivRef.current && wrapperRef.current?.contains(scanDivRef.current)) {
              wrapperRef.current.removeChild(scanDivRef.current);
              scanDivRef.current = null;
            }
            if (!cancelled) {
              handleScanSuccess(decodedText);
              setShowCamera(false);
            }
          },
          () => {}
        );

        if (!cancelled) {
          globalScannerInstance = scanner;
          setReady(true);

          // FIX RESPONSIVE: Html5Qrcode inyecta width/height en px via style inline.
          // Usamos MutationObserver para forzar 100% cada vez que los cambia.
          const forzarEstilos = () => {
            if (!div) return;
            // El div contenedor que Html5Qrcode controla
            div.style.setProperty('width', '100%', 'important');
            div.style.setProperty('height', '100%', 'important');
            // El primer hijo interno también tiene width/height en px
            const inner = div.firstElementChild;
            if (inner) {
              inner.style.setProperty('width', '100%', 'important');
              inner.style.setProperty('height', '100%', 'important');
            }
            // El video
            const video = div.querySelector('video');
            if (video) {
              video.style.setProperty('width', '100%', 'important');
              video.style.setProperty('height', '100%', 'important');
              video.style.setProperty('object-fit', 'cover', 'important');
            }
          };
          forzarEstilos();
          // Observer para re-aplicar si Html5Qrcode resetea los estilos
          const observer = new MutationObserver(forzarEstilos);
          observer.observe(div, { attributes: true, subtree: true, attributeFilter: ['style'] });
          // Guardar observer para desconectarlo al parar
          div._styleObserver = observer;
        } else {
          globalScannerInstance = null;
          try { if (scanner.isScanning) await scanner.stop(); } catch (_) {}
          try { scanner.clear(); } catch (_) {}
          if (div.parentNode) div.parentNode.removeChild(div);
        }
      } catch (err) {
        console.error('[CameraModal]', err.name, err.message);
        if (!cancelled) {
          const msg = err.name === 'NotReadableError'
            ? 'La cámara está siendo usada por otra aplicación. Cierra otras apps que usen la cámara y vuelve a intentarlo.'
            : (err.message || 'No se pudo acceder a la cámara.');
          setCameraError(msg);
        }
        if (div.parentNode) div.parentNode.removeChild(div);
        scanDivRef.current = null;
      }
    }, 300); // 300ms para que MUI Dialog y el navegador estén listos

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      // Cleanup async — no bloquea React
      pararScannerGlobal().then(() => {
        if (scanDivRef.current) {
          if (wrapperRef.current?.contains(scanDivRef.current)) {
            wrapperRef.current.removeChild(scanDivRef.current);
          }
          scanDivRef.current = null;
        }
      });
    };
  }, [showCamera, selectedCamera]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog
      open={showCamera}
      onClose={handleClose}
      fullScreen={fullScreen}
      maxWidth="sm"
      fullWidth
      keepMounted={false}
    >
      <DialogTitle sx={{ bgcolor: colors.primary, color: 'white', pb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            <FaQrcode style={{ marginRight: 8 }} /> Escanear Artículo
          </Typography>
          <IconButton onClick={handleClose} sx={{ color: 'white' }} size="small">
            <FaTimes />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{
          p: { xs: 0, sm: 1 },
          // En fullscreen quitar padding para que la cámara ocupe más espacio
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {cameraError ? (
          <Stack spacing={2} sx={{ p: 2 }}>
            <Alert severity="warning" icon={<FaExclamationTriangle />}>
              <strong>Problema con la cámara</strong>
              <br />
              {cameraError}
            </Alert>
            <Button
              variant="outlined"
              onClick={() => { setCameraError(''); setReady(false); }}
              sx={{ borderColor: colors.accent, color: colors.accent }}
            >
              Reintentar
            </Button>
            <Alert severity="info">
              Si el problema persiste, usa el método de conteo por clics (botón "Contar" en la línea).
            </Alert>
          </Stack>
        ) : (
          <Stack spacing={1} sx={{ p: { xs: 0.5, sm: 1 }, flex: 1 }}>
            {cameras.length > 1 && (
              <FormControl fullWidth size="small" sx={{ px: { xs: 1, sm: 0 } }}>
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
                  {cameras.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.label || `Cámara ${c.id}`}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Wrapper: React solo gestiona este Box (tamaño y fondo).
                Html5Qrcode trabaja en un div hijo insertado por el efecto. */}
            <Box
              ref={wrapperRef}
              sx={{
                bgcolor: 'black',
                borderRadius: { xs: 0, sm: 2 },
                overflow: 'hidden',
                width: '100%',
                // En móvil fullscreen: ocupar toda la altura disponible
                flex: fullScreen ? 1 : 'none',
                height: fullScreen ? 'auto' : 380,
                minHeight: { xs: 280, sm: 320 },
                position: 'relative',
              }}
            >
              {!ready && (
                <Stack
                  alignItems="center"
                  justifyContent="center"
                  sx={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
                >
                  <CircularProgress sx={{ color: colors.accent }} />
                  <Typography sx={{ mt: 2, color: 'white', fontSize: '0.9rem' }}>
                    Inicializando cámara...
                  </Typography>
                </Stack>
              )}
            </Box>

            {!fullScreen && (
              <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ pb: 0.5 }}>
                Apunta la cámara al código de barras o QR del artículo
              </Typography>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2 }}>
        <Button onClick={handleClose} sx={{ color: colors.secondary }}>
          Cancelar
        </Button>
      </DialogActions>
    </Dialog>
  );
});