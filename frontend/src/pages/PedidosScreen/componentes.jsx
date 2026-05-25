// componentes.jsx
import React, { useState, useMemo, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControlLabel,
  Grid,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Menu,
  useMediaQuery,
  useTheme,
  Pagination,
} from '@mui/material';
import {
  FaBox,
  FaCheck,
  FaChevronDown,
  FaExclamation,
  FaExclamationTriangle,
  FaEllipsisV,
  FaInfoCircle,
  FaPhone,
  FaSync,
  FaUser,
  FaWeight,
  FaSearch,
  FaCalendarAlt,
} from 'react-icons/fa';

// Colores personalizados
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
// Componentes visuales básicos
// ----------------------
export const LoadingSpinner = React.memo(({ message = "Cargando..." }) => (
  <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={4}>
    <CircularProgress size={48} sx={{ color: colors.accent }} />
    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
      {message}
    </Typography>
  </Box>
));

export const ErrorMessage = React.memo(({ message, onRetry }) => (
  <Box textAlign="center" py={4}>
    <Alert severity="error" icon={<FaExclamationTriangle />} sx={{ mb: 2 }}>
      {message}
    </Alert>
    {onRetry && (
      <Button variant="contained" startIcon={<FaSync />} onClick={onRetry} sx={{ bgcolor: colors.primary, '&:hover': { bgcolor: colors.primaryDark } }}>
        Reintentar
      </Button>
    )}
  </Box>
));

// ----------------------
// PedidosHeader
// ----------------------
export const PedidosHeader = ({ title, subtitle }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Paper elevation={0} sx={{ borderRadius: 3, p: isMobile ? 2 : 3, mb: 2, borderBottom: `3px solid ${colors.accent}` }}>
      <Typography variant="h4" component="h1" fontWeight={700} gutterBottom={!isMobile} sx={{ color: colors.primary }}>
        {title}
      </Typography>
      <Typography variant="subtitle1" color="text.secondary">
        {subtitle}
      </Typography>
    </Paper>
  );
};

// ----------------------
// PedidosFilters (MODIFICADO: AÑADIDA OPCIÓN "TODOS")
// ----------------------
export const PedidosFilters = ({
  filtroBusqueda,
  onFiltroBusquedaChange,
  rangoFechas,
  onRangoFechasChange,
  filtroStatus,
  onFiltroStatusChange,
  opcionesStatus,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Paper elevation={1} sx={{ borderRadius: 3, p: 2, mb: 3 }}>
      <Stack direction={isMobile ? 'column' : 'row'} spacing={2}>
        <TextField
          fullWidth
          size="small"
          placeholder="Nº pedido, cliente, obra, contacto..."
          value={filtroBusqueda}
          onChange={(e) => onFiltroBusquedaChange(e.target.value)}
          InputProps={{
            startAdornment: <FaSearch style={{ marginRight: 8, color: colors.accent }} />,
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              '&:hover fieldset': { borderColor: colors.accent },
              '&.Mui-focused fieldset': { borderColor: colors.primary },
            },
          }}
        />

        <FormControl fullWidth size="small">
          <InputLabel sx={{ color: colors.primary }}>Rango de fechas</InputLabel>
          <Select
            value={rangoFechas}
            onChange={(e) => onRangoFechasChange(e.target.value)}
            label="Rango de fechas"
            startAdornment={<FaCalendarAlt style={{ marginRight: 8, color: colors.accent }} />}
            sx={{
              '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.secondary },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: colors.accent },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: colors.primary },
            }}
          >
            <MenuItem value="todos">Todos</MenuItem>    {/* ✅ NUEVA OPCIÓN */}
            <MenuItem value="semana">Una semana</MenuItem>
            <MenuItem value="dia">Un día</MenuItem>
          </Select>
        </FormControl>

        <FormControl fullWidth size="small">
          <InputLabel sx={{ color: colors.primary }}>Estado</InputLabel>
          <Select
            value={filtroStatus}
            onChange={(e) => onFiltroStatusChange(e.target.value)}
            label="Estado"
            sx={{
              '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.secondary },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: colors.accent },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: colors.primary },
            }}
          >
            {opcionesStatus.map((estado) => (
              <MenuItem key={estado.id} value={estado.id}>
                {estado.nombre}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
    </Paper>
  );
};

// ----------------------
// SummaryCard y PedidosSummaryBar
// ----------------------
export const SummaryCard = ({ label, value }) => {
  return (
    <Card elevation={1} sx={{ borderRadius: 3, height: '100%', borderTop: `3px solid ${colors.accent}` }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={700} sx={{ color: colors.primary }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
};

export const PedidosSummaryBar = ({
  totalPedidos,
  pedidosPagina,
  paginaActual,
  totalPaginas,
  voluminosos,
}) => (
  <Grid container spacing={2} sx={{ mb: 3 }}>
    <Grid size={{ xs: 6, sm: 3 }}>
      <SummaryCard label="Pedidos filtrados" value={totalPedidos} />
    </Grid>
    <Grid size={{ xs: 6, sm: 3 }}>
      <SummaryCard label="En página" value={pedidosPagina} />
    </Grid>
    <Grid size={{ xs: 6, sm: 3 }}>
      <SummaryCard label="Página actual" value={`${paginaActual} / ${Math.max(totalPaginas, 1)}`} />
    </Grid>
    <Grid size={{ xs: 6, sm: 3 }}>
      <SummaryCard label="Voluminosos" value={voluminosos} />
    </Grid>
  </Grid>
);

// ----------------------
// PedidosList
// ----------------------
export const PedidosList = ({ topPagination, bottomPagination, children }) => (
  <>
    <Box sx={{ mb: 2 }}>{topPagination}</Box>
    <Stack spacing={2.5}>{children}</Stack>
    <Box sx={{ mt: 2 }}>{bottomPagination}</Box>
  </>
);

// ----------------------
// PedidosStateView
// ----------------------
export const PedidosStateView = ({
  type = 'info',
  title,
  message,
  buttonLabel,
  onButtonClick,
  buttonIcon,
}) => {
  if (type === 'loading') {
    return (
      <Paper elevation={1} sx={{ p: 5, borderRadius: 3, textAlign: 'center' }}>
        <CircularProgress size={60} sx={{ color: colors.accent }} />
        <Typography variant="body1" sx={{ mt: 2 }}>
          {message || 'Cargando...'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={1} sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
      <Alert
        severity={type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info'}
        sx={{ mb: 2, borderLeftColor: type === 'error' ? colors.danger : type === 'warning' ? colors.warning : colors.info }}
      >
        {title && <strong>{title}</strong>}
        {title && message ? ' ' : ''}
        {message}
      </Alert>
      {buttonLabel && onButtonClick && (
        <Button
          variant="contained"
          onClick={onButtonClick}
          startIcon={buttonIcon || null}
          sx={{ bgcolor: colors.primary, '&:hover': { bgcolor: colors.primaryDark } }}
        >
          {buttonLabel}
        </Button>
      )}
    </Paper>
  );
};

// ----------------------
// PedidoCard
// ----------------------
export const PedidoCard = ({
  pedido,
  togglePedidoView,
  pedidoViewModes,
  generarAlbaranParcial,
  generandoAlbaran,
  canPerformActionsInPedidos,
  onActualizarVoluminoso,
  onCargarUbicaciones,
  lineasContent,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchorEl, setAnchorEl] = useState(null);
  const [actualizandoVoluminoso, setActualizandoVoluminoso] = useState(false);
  const openMenu = Boolean(anchorEl);

  const tieneLineasParciales = useMemo(() => {
    return pedido.articulos.some((articulo) => {
      const expedidas = parseFloat(articulo.unidadesPedidas) - parseFloat(articulo.unidadesPendientes);
      return expedidas > 0 && expedidas < parseFloat(articulo.unidadesPedidas);
    });
  }, [pedido.articulos]);

  const estaCompletamenteExpedido = useMemo(() => {
    return pedido.articulos.every((articulo) => parseFloat(articulo.unidadesPendientes) === 0);
  }, [pedido.articulos]);

  const esParcialBackend = pedido.Estado === 4;
  const esServidoBackend = pedido.Estado === 2;
  const parcial = esParcialBackend || (tieneLineasParciales && !esServidoBackend);
  const completo = esServidoBackend || estaCompletamenteExpedido;
  const mostrarOpcionParcial = parcial && !completo && canPerformActionsInPedidos;

  const handleToggleVoluminoso = async () => {
    if (!canPerformActionsInPedidos || actualizandoVoluminoso) return;
    setActualizandoVoluminoso(true);
    try {
      await onActualizarVoluminoso(pedido, !pedido.EsVoluminoso);
    } finally {
      setActualizandoVoluminoso(false);
    }
  };

  useEffect(() => {
    if (pedidoViewModes[pedido.numeroPedido] === 'show' && onCargarUbicaciones) {
      const articulos = pedido.articulos.map((art) => art.codigoArticulo);
      onCargarUbicaciones(articulos);
    }
  }, [pedidoViewModes, pedido.numeroPedido, pedido.articulos, onCargarUbicaciones]);

  const handleMenuClick = (event) => setAnchorEl(event.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  return (
    <Card
      elevation={2}
      sx={{
        borderRadius: 3,
        overflow: 'hidden',
        borderLeft: `4px solid ${parcial ? colors.warning : completo ? colors.success : colors.secondary}`,
      }}
    >
      <CardContent sx={{ p: isMobile ? 2 : 3 }}>
        {/* Cabecera */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Stack spacing={1} sx={{ flex: 1 }}>
            <Stack direction={isMobile ? 'column' : 'row'} spacing={1} flexWrap="wrap" alignItems="center">
              <Typography variant="subtitle1" fontWeight={700} sx={{ color: colors.primary }}>
                #{pedido.numeroPedido}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {new Date(pedido.fechaPedido).toLocaleDateString()}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Entrega: {pedido.fechaEntrega ? new Date(pedido.fechaEntrega).toLocaleDateString() : 'Sin fecha'}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  bgcolor: parcial ? `${colors.warning}20` : completo ? `${colors.success}20` : `${colors.secondary}20`,
                  color: parcial ? colors.warning : completo ? colors.success : colors.secondary,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  fontWeight: 500,
                }}
              >
                {pedido.Status || 'Revisión'}
              </Typography>
              {pedido.PesoTotal > 0 && (
                <Typography variant="caption" display="flex" alignItems="center" gap={0.5}>
                  <FaWeight size={12} color={colors.accent} /> {pedido.PesoTotal.toFixed(2)} kg
                </Typography>
              )}
              {pedido.EsVoluminoso && (
                <Typography variant="caption" display="flex" alignItems="center" gap={0.5} sx={{ color: colors.warning, fontWeight: 700 }}>
                  <FaExclamation size={12} /> VOLUMINOSO
                </Typography>
              )}
            </Stack>
            <Typography variant="body2" sx={{ color: colors.primaryDark }}>
              {pedido.razonSocial}
            </Typography>
          </Stack>

          <IconButton size="small" onClick={handleMenuClick} sx={{ color: colors.secondary }}>
            <FaEllipsisV />
          </IconButton>
          <Menu anchorEl={anchorEl} open={openMenu} onClose={handleMenuClose}>
            {canPerformActionsInPedidos && (
              <MenuItem onClick={() => { handleToggleVoluminoso(); handleMenuClose(); }} disabled={actualizandoVoluminoso}>
                {actualizandoVoluminoso ? 'Actualizando...' : (pedido.EsVoluminoso ? 'Desmarcar voluminoso' : 'Marcar como voluminoso')}
              </MenuItem>
            )}
            {mostrarOpcionParcial && (
              <MenuItem onClick={() => { generarAlbaranParcial(pedido); handleMenuClose(); }} disabled={generandoAlbaran}>
                <FaCheck style={{ marginRight: 8, color: colors.success }} /> {generandoAlbaran ? 'Procesando...' : 'Generar albarán parcial'}
              </MenuItem>
            )}
            <MenuItem onClick={() => { togglePedidoView(pedido.numeroPedido); handleMenuClose(); }}>
              {pedidoViewModes[pedido.numeroPedido] === 'show' ? 'Ocultar líneas y detalles' : 'Mostrar líneas y detalles'}
            </MenuItem>
          </Menu>
        </Stack>

        {/* Detalles expandidos */}
        {pedidoViewModes[pedido.numeroPedido] === 'show' && (
          <>
            <Paper elevation={0} sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 2, border: `1px solid ${colors.secondary}20` }}>
              <Stack direction={isMobile ? 'column' : 'row'} spacing={2} flexWrap="wrap" justifyContent="space-between">
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="body2">
                    <strong><FaWeight size={12} /> Peso total:</strong> {pedido.PesoTotal ? `${pedido.PesoTotal.toFixed(2)} kg` : '0 kg'}
                  </Typography>
                  <Typography variant="body2">
                    <strong><FaBox size={12} /> Voluminoso:</strong> {pedido.EsVoluminoso ? 'SÍ' : 'NO'}
                  </Typography>
                  {canPerformActionsInPedidos && (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={!!pedido.EsVoluminoso}
                          onChange={handleToggleVoluminoso}
                          disabled={actualizandoVoluminoso}
                          color="warning"
                          size="small"
                        />
                      }
                      label={actualizandoVoluminoso ? 'Actualizando...' : (pedido.EsVoluminoso ? 'Marcado' : 'No marcado')}
                    />
                  )}
                </Stack>
              </Stack>

              <Grid container spacing={1.5} sx={{ mt: 1 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2"><strong><FaUser size={12} /> Contacto:</strong> {pedido.Contacto || 'No especificado'}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2"><strong><FaPhone size={12} /> Teléfono:</strong> {pedido.TelefonoContacto || 'No especificado'}</Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="body2"><strong><FaUser size={12} /> Vendedor:</strong> {pedido.NombreVendedor || pedido.Vendedor || 'No especificado'}</Typography>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Typography variant="body2"><strong><FaInfoCircle size={12} /> Observaciones Web:</strong> {pedido.observaciones || 'No hay observaciones'}</Typography>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Typography variant="body2"><strong>Obra:</strong> {pedido.nombreObra || 'Sin obra especificada'}</Typography>
                </Grid>
              </Grid>
            </Paper>
            {lineasContent}
          </>
        )}
      </CardContent>
    </Card>
  );
};

// ----------------------
// PedidoLineasTable
// ----------------------
export const PedidoLineasTable = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (isMobile) {
    return <Stack spacing={2} sx={{ mt: 2 }}>{children}</Stack>;
  }

  return (
    <TableContainer component={Paper} elevation={1} sx={{ borderRadius: 3, overflowX: 'auto', mt: 2 }}>
      <Table sx={{ minWidth: 800 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: `${colors.primary}10` }}>
            <TableCell sx={{ fontWeight: 700, color: colors.primary }}>Artículo</TableCell>
            <TableCell sx={{ fontWeight: 700, color: colors.primary }}>Descripción</TableCell>
            <TableCell sx={{ fontWeight: 700, color: colors.primary }}>Pendiente</TableCell>
            <TableCell sx={{ fontWeight: 700, color: colors.primary }}>Peso</TableCell>
            <TableCell sx={{ fontWeight: 700, color: colors.primary }}>Ubicación</TableCell>
            <TableCell sx={{ fontWeight: 700, color: colors.primary }}>Cantidad</TableCell>
            <TableCell sx={{ fontWeight: 700, color: colors.primary }}>Acción</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>{children}</TableBody>
      </Table>
    </TableContainer>
  );
};

// ----------------------
// Paginacion
// ----------------------
export const Paginacion = React.memo(({ totalPaginas, paginaActual, cambiarPagina }) => {
  if (totalPaginas <= 1) return null;
  return (
    <Box display="flex" justifyContent="center" mt={2} mb={2}>
      <Pagination
        count={totalPaginas}
        page={paginaActual}
        onChange={(_, page) => cambiarPagina(page)}
        color="primary"
        size="medium"
        siblingCount={1}
        boundaryCount={1}
        sx={{
          '& .MuiPaginationItem-root': {
            '&.Mui-selected': {
              backgroundColor: colors.primary,
              color: 'white',
              '&:hover': { backgroundColor: colors.primaryDark },
            },
          },
        }}
      />
    </Box>
  );
});