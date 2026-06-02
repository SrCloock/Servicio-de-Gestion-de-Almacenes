import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  AssignmentInd as AssignmentIndIcon,
  Clear as ClearIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  FactCheck as FactCheckIcon,
  Inventory2 as Inventory2Icon,
  PersonOff as PersonOffIcon,
  Save as SaveIcon,
  ShoppingCart as ShoppingCartIcon,
} from '@mui/icons-material';
import API from '../helpers/api';
import { usePermissions } from '../PermissionsManager';

// ---------- Funciones auxiliares ----------
function descendingComparator(a, b, orderBy) {
  const valueA = a?.[orderBy] ?? '';
  const valueB = b?.[orderBy] ?? '';
  if (valueB < valueA) return -1;
  if (valueB > valueA) return 1;
  return 0;
}

function getComparator(order, orderBy) {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

function stableSort(array, comparator) {
  const stabilizedThis = array.map((el, index) => [el, index]);
  stabilizedThis.sort((a, b) => {
    const order = comparator(a[0], b[0]);
    if (order !== 0) return order;
    return a[1] - b[1];
  });
  return stabilizedThis.map((el) => el[0]);
}

const formatFecha = (fecha) => {
  if (!fecha) return 'Sin fecha';
  return new Date(fecha).toLocaleDateString('es-ES');
};

const formatPeso = (peso) => `${(parseFloat(peso) || 0).toFixed(2)} kg`;

// ---------- Componentes internos ----------

const AssignmentHeader = ({ title, subtitle, summary, onRefresh, onSave, loading, saveDisabled, saveLabel }) => {
  const theme = useTheme();
  return (
    <Paper elevation={2} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, mb: 3 }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
          spacing={2}
        >
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Box
              sx={{
                width: { xs: 44, sm: 52 },
                height: { xs: 44, sm: 52 },
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: theme.palette.primary.main,
                color: theme.palette.primary.contrastText,
              }}
            >
              <ShoppingCartIcon sx={{ fontSize: { xs: 24, sm: 28 } }} />
            </Box>
            <Stack spacing={0.5}>
              <Typography
                variant="h4"
                component="h1"
                sx={{
                  color: theme.palette.primary.main,
                  fontWeight: 700,
                  fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' },
                }}
              >
                {title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            </Stack>
          </Stack>

          <Chip
            label={summary}
            color="info"
            variant="outlined"
            sx={{ fontWeight: 700, px: 1, height: 'auto', py: 0.5 }}
          />
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button variant="outlined" onClick={onRefresh} disabled={loading} fullWidth={false}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </Button>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
            onClick={onSave}
            disabled={saveDisabled}
            fullWidth={false}
          >
            {saveLabel}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};

const FiltersPanel = ({ filtros, preparadores, onChange, onClear, onApplyOrder }) => {
  return (
    <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, mb: 3 }}>
      <Stack spacing={3}>
        <Typography variant="h6" component="h3" sx={{ fontWeight: 600 }}>
          Filtrar pedidos
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={4} lg={2.4}>
            <TextField
              label="Número pedido"
              value={filtros.numeroPedido}
              onChange={(e) => onChange('numeroPedido', e.target.value)}
              fullWidth
              size="small"
              InputProps={{
                endAdornment: filtros.numeroPedido ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => onChange('numeroPedido', '')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4} lg={2.4}>
            <TextField
              label="Cliente"
              value={filtros.cliente}
              onChange={(e) => onChange('cliente', e.target.value)}
              fullWidth
              size="small"
              InputProps={{
                endAdornment: filtros.cliente ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => onChange('cliente', '')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4} lg={2.4}>
            <FormControl fullWidth size="small">
              <InputLabel id="filtro-preparador-label">Asignado a</InputLabel>
              <Select
                labelId="filtro-preparador-label"
                value={filtros.empleadoAsignado}
                label="Asignado a"
                onChange={(e) => onChange('empleadoAsignado', e.target.value)}
              >
                <MenuItem value="todos">Todos los empleados</MenuItem>
                <MenuItem value="sin-asignar">Sin asignar</MenuItem>
                {preparadores.map((prep) => (
                  <MenuItem key={prep.codigo} value={prep.codigo}>
                    {prep.nombre}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={4} lg={2.4}>
            <FormControl fullWidth size="small">
              <InputLabel id="ordenar-pedidos-label">Ordenar por</InputLabel>
              <Select
                labelId="ordenar-pedidos-label"
                value={filtros.orderBy}
                label="Ordenar por"
                onChange={(e) => onApplyOrder('orderBy', e.target.value)}
              >
                <MenuItem value="numeroPedido">Número pedido</MenuItem>
                <MenuItem value="fechaEntrega">Fecha entrega</MenuItem>
                <MenuItem value="razonSocial">Cliente</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={4} lg={2.4}>
            <FormControl fullWidth size="small">
              <InputLabel id="sentido-pedidos-label">Sentido</InputLabel>
              <Select
                labelId="sentido-pedidos-label"
                value={filtros.order}
                label="Sentido"
                onChange={(e) => onApplyOrder('order', e.target.value)}
              >
                <MenuItem value="desc">Descendente</MenuItem>
                <MenuItem value="asc">Ascendente</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="flex-end">
          <Button variant="outlined" onClick={onClear}>
            Limpiar filtros
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};

const SummaryCards = ({ items }) => {
  const theme = useTheme();
  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {items.map((item) => (
        <Grid item xs={12} sm={6} md={3} key={item.label}>
          <Paper elevation={1} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3, height: '100%' }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box
                sx={{
                  width: { xs: 48, sm: 56 },
                  height: { xs: 48, sm: 56 },
                  borderRadius: '50%',
                  bgcolor: item.accent,
                  color: theme.palette.common.white,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </Box>
              <Box>
                <Typography variant="h5" fontWeight={800} component="div">
                  {item.value}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.label}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
};

const PaginationControls = ({
  page,
  totalPages,
  hasPrev,
  hasNext,
  rowsPerPage,
  onPrev,
  onNext,
  onRowsPerPageChange,
}) => (
  <Paper elevation={1} sx={{ p: 2, mt: 3, borderRadius: 3 }}>
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      justifyContent="space-between"
      alignItems={{ xs: 'stretch', sm: 'center' }}
    >
      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel id="rows-per-page-pedidos-label">Elementos por página</InputLabel>
        <Select
          labelId="rows-per-page-pedidos-label"
          value={rowsPerPage}
          label="Elementos por página"
          onChange={(e) => onRowsPerPageChange(e.target.value)}
        >
          <MenuItem value={15}>15</MenuItem>
          <MenuItem value={25}>25</MenuItem>
          <MenuItem value={50}>50</MenuItem>
          <MenuItem value={-1}>Todos</MenuItem>
        </Select>
      </FormControl>

      <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
        <Button variant="outlined" onClick={onPrev} disabled={!hasPrev} size="small">
          Anterior
        </Button>
        <Typography fontWeight={600} variant="body2">
          Página {page + 1} de {Math.max(totalPages, 1)}
        </Typography>
        <Button variant="outlined" onClick={onNext} disabled={!hasNext} size="small">
          Siguiente
        </Button>
      </Stack>
    </Stack>
  </Paper>
);

const DetailLineItem = ({ linea }) => {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography fontWeight={700} variant="body2">
            {linea.descripcionArticulo || linea.DescripcionArticulo || linea.codigoArticulo}
          </Typography>
          {(linea.descripcion2Articulo || linea.Descripcion2Articulo) && (
            <Typography variant="caption" color="text.secondary">
              {linea.descripcion2Articulo || linea.Descripcion2Articulo}
            </Typography>
          )}
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap>
          <Chip
            label={`Peso ${formatPeso(linea.pesoTotalLinea || linea.PesoTotalLinea)}`}
            size="small"
            variant="outlined"
          />
          <Chip
            label={`Unidades ${linea.unidadesPendientes ?? linea.UnidadesPendientes ?? linea.unidadesPedidas ?? linea.UnidadesPedidas ?? 0}`}
            size="small"
            variant="outlined"
          />
        </Stack>
      </Stack>
    </Paper>
  );
};

const PedidoCard = ({
  pedido,
  preparadores,
  preparadoresMap,
  expanded,
  onToggle,
  value,
  onAsignacionChange,
  disabled,
  assignmentOpen,
  onToggleAssignment,
}) => {
  const theme = useTheme();
  const asignadoActual = pedido.EmpleadoAsignado
    ? preparadoresMap[pedido.EmpleadoAsignado] || pedido.EmpleadoAsignado
    : 'Sin asignar';
  const hayCambio = (value || '') !== (pedido.EmpleadoAsignado || '');
  const lineas = Array.isArray(pedido.articulos) ? pedido.articulos : [];

  return (
    <Card elevation={2} sx={{ borderRadius: 3, overflow: 'hidden', mb: 2, transition: 'all 0.2s' }}>
      <Paper
        elevation={0}
        onClick={onToggle}
        sx={{
          px: { xs: 2, sm: 2.5 },
          py: { xs: 1.5, sm: 2 },
          cursor: 'pointer',
          bgcolor: expanded ? `${theme.palette.primary.main}08` : 'transparent',
          transition: 'background-color 0.2s',
        }}
      >
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', lg: 'center' }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              <Box sx={{ color: theme.palette.primary.main, display: 'flex', alignItems: 'center' }}>
                {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </Box>
              <Chip label={`Pedido #${pedido.numeroPedido}`} size="small" sx={{ fontWeight: 700 }} />
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`Entrega ${formatFecha(pedido.fechaEntrega)}`} size="small" variant="outlined" />
              <Chip
                label={asignadoActual}
                size="small"
                color={pedido.EmpleadoAsignado ? 'info' : 'default'}
                variant="outlined"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleAssignment();
                }}
                sx={{ cursor: 'pointer' }}
              />
              {hayCambio && <Chip label="Cambio pendiente" size="small" color="warning" />}
            </Stack>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap>
            <Typography variant="body2" color="text.secondary">
              <strong>Cliente:</strong> {pedido.razonSocial || pedido.RazonSocial || 'Sin cliente'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Contacto:</strong> {pedido.Contacto || 'Sin contacto'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Obra:</strong> {pedido.nombreObra || 'Sin obra'}
            </Typography>
          </Stack>
        </Stack>
      </Paper>

      {assignmentOpen && (
        <Box sx={{ px: { xs: 2, sm: 3 }, pb: expanded ? 0 : 3 }}>
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={700}>
                Asignación de preparador
              </Typography>
              <FormControl fullWidth size="small">
                <InputLabel id={`preparador-pedido-${pedido.numeroPedido}`}>Preparador</InputLabel>
                <Select
                  labelId={`preparador-pedido-${pedido.numeroPedido}`}
                  value={value || ''}
                  label="Preparador"
                  onChange={(e) => onAsignacionChange(pedido.numeroPedido, e.target.value)}
                  disabled={disabled}
                >
                  <MenuItem value="">Quitar asignación</MenuItem>
                  {preparadores.map((prep) => (
                    <MenuItem key={prep.codigo} value={prep.codigo}>
                      {prep.nombre}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Paper>
        </Box>
      )}

      {expanded && (
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>
              Líneas del pedido
            </Typography>
            {lineas.length === 0 ? (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                No se han recibido líneas para este pedido.
              </Alert>
            ) : (
              <Stack spacing={1.5}>
                {lineas.map((linea, index) => (
                  <DetailLineItem
                    key={`${pedido.numeroPedido}-${linea.movPosicionLinea || linea.codigoArticulo || index}`}
                    linea={linea}
                  />
                ))}
              </Stack>
            )}
          </Stack>
        </CardContent>
      )}
    </Card>
  );
};

// ---------- Componente principal ----------
const AsignarPedidosScreen = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [pedidos, setPedidos] = useState([]);
  const [preparadores, setPreparadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [asignaciones, setAsignaciones] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [cambiandoAsignaciones, setCambiandoAsignaciones] = useState(false);
  const [pedidosExpandidos, setPedidosExpandidos] = useState({});
  const [editoresAsignacion, setEditoresAsignacion] = useState({});

  const [filtroNumeroPedido, setFiltroNumeroPedido] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroEmpleadoAsignado, setFiltroEmpleadoAsignado] = useState('todos');

  const [order, setOrder] = useState('desc');
  const [orderBy, setOrderBy] = useState('numeroPedido');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  const { canAssignOrders } = usePermissions();

  const cargarDatos = useCallback(async () => {
    if (!canAssignOrders) return;
    try {
      setLoading(true);
      setError('');
      const [pedidosResponse, prepResponse] = await Promise.all([
        API.get('/pedidosPendientes', { params: { rango: 'todos', soloAsignacion: 'true' } }),
        // FIX: endpoint correcto para obtener preparadores
        API.get('/empleados/preparadores'),
      ]);

      setPedidos(pedidosResponse.data);

      // FIX: /empleados/preparadores ya devuelve {codigo, nombre} directamente
      setPreparadores(prepResponse.data);

      const inicialAsignaciones = {};
      pedidosResponse.data.forEach((pedido) => {
        inicialAsignaciones[pedido.numeroPedido] = pedido.EmpleadoAsignado || '';
      });
      setAsignaciones(inicialAsignaciones);
    } catch (err) {
      setError(`Error al cargar datos: ${err.response?.data?.mensaje || err.message}`);
    } finally {
      setLoading(false);
    }
  }, [canAssignOrders]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const preparadoresMap = useMemo(
    () =>
      preparadores.reduce((acc, prep) => {
        acc[prep.codigo] = prep.nombre;
        return acc;
      }, {}),
    [preparadores]
  );

  const hayCambiosPendientes = useMemo(
    () =>
      pedidos.some((pedido) => {
        const nuevoEmpleado = asignaciones[pedido.numeroPedido];
        const empleadoActual = pedido.EmpleadoAsignado || '';
        return nuevoEmpleado !== empleadoActual;
      }),
    [pedidos, asignaciones]
  );

  const handleAsignacionChange = (numeroPedido, codigoEmpleado) => {
    setAsignaciones((prev) => ({
      ...prev,
      [numeroPedido]: codigoEmpleado,
    }));
  };

  const asignarPedidos = async () => {
    try {
      setCambiandoAsignaciones(true);
      setError('');
      setSuccessMessage('');

      const cambios = [];
      pedidos.forEach((pedido) => {
        const nuevoEmpleado = asignaciones[pedido.numeroPedido];
        const empleadoActual = pedido.EmpleadoAsignado || '';
        if (nuevoEmpleado !== empleadoActual) {
          cambios.push({ pedido, nuevoEmpleado });
        }
      });

      if (!cambios.length) {
        setError('No hay cambios para guardar');
        return;
      }

      const asignacionesPorEmpleado = cambios.reduce((acc, { pedido, nuevoEmpleado }) => {
        if (!acc[nuevoEmpleado]) acc[nuevoEmpleado] = [];
        acc[nuevoEmpleado].push(pedido);
        return acc;
      }, {});

      await Promise.all(
        Object.entries(asignacionesPorEmpleado).map(([empleadoId, pedidosAsignar]) =>
          API.post('/asignarPedidosAEmpleado', {
            pedidos: pedidosAsignar.map((p) => ({
              codigoEmpresa:   p.codigoEmpresa,
              ejercicioPedido: p.ejercicioPedido,
              seriePedido:     p.seriePedido || '',
              numeroPedido:    p.numeroPedido,
            })),
            codigoEmpleado: empleadoId || null,
          })
        )
      );

      setPedidos((prev) =>
        prev.map((p) => ({
          ...p,
          EmpleadoAsignado: asignaciones[p.numeroPedido] || null,
        }))
      );
      setSuccessMessage(`${cambios.length} asignaciones guardadas correctamente`);
    } catch (err) {
      const errorData = err.response?.data;
      const errorMessage =
        errorData?.detalles || errorData?.mensaje || errorData?.error || err.message || 'Error desconocido';
      setError(`Error al guardar: ${errorMessage}`);
    } finally {
      setCambiandoAsignaciones(false);
    }
  };

  const limpiarFiltros = () => {
    setFiltroNumeroPedido('');
    setFiltroCliente('');
    setFiltroEmpleadoAsignado('todos');
    setOrder('desc');
    setOrderBy('numeroPedido');
    setPage(0);
  };

  const pedidosFiltrados = useMemo(
    () =>
      pedidos.filter((pedido) => {
        if (
          filtroNumeroPedido &&
          !pedido.numeroPedido.toString().toLowerCase().includes(filtroNumeroPedido.toLowerCase())
        ) {
          return false;
        }
        const razonSocial = pedido.razonSocial || pedido.RazonSocial || '';
        if (filtroCliente && !razonSocial.toLowerCase().includes(filtroCliente.toLowerCase())) {
          return false;
        }
        if (filtroEmpleadoAsignado !== 'todos') {
          if (filtroEmpleadoAsignado === 'sin-asignar') {
            if (pedido.EmpleadoAsignado) return false;
          } else if (pedido.EmpleadoAsignado !== filtroEmpleadoAsignado) {
            return false;
          }
        }
        return true;
      }),
    [pedidos, filtroNumeroPedido, filtroCliente, filtroEmpleadoAsignado]
  );

  const pedidosOrdenados = useMemo(
    () => stableSort(pedidosFiltrados, getComparator(order, orderBy)),
    [pedidosFiltrados, order, orderBy]
  );

  const totalPages = rowsPerPage === -1 ? 1 : Math.ceil(pedidosOrdenados.length / rowsPerPage);
  const paginatedPedidos = useMemo(() => {
    if (rowsPerPage === -1) return pedidosOrdenados;
    return pedidosOrdenados.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [pedidosOrdenados, page, rowsPerPage]);

  const resumen = useMemo(() => {
    const sinAsignar = pedidosFiltrados.filter((pedido) => !pedido.EmpleadoAsignado).length;
    const conAsignacion = pedidosFiltrados.length - sinAsignar;
    const pendientesGuardar = pedidosFiltrados.filter(
      (pedido) => (asignaciones[pedido.numeroPedido] || '') !== (pedido.EmpleadoAsignado || '')
    ).length;

    const colors = {
      primary: theme.palette.primary.main,
      warning: theme.palette.secondary.main,
      teal: '#0f766e',
      blue: '#2563eb',
    };
    return [
      { label: 'Pedidos visibles',   value: pedidosFiltrados.length, icon: <Inventory2Icon />,    accent: colors.primary },
      { label: 'Sin asignar',        value: sinAsignar,              icon: <PersonOffIcon />,     accent: colors.warning },
      { label: 'Con preparador',     value: conAsignacion,           icon: <AssignmentIndIcon />, accent: colors.teal },
      { label: 'Cambios pendientes', value: pendientesGuardar,       icon: <FactCheckIcon />,     accent: colors.blue },
    ];
  }, [pedidosFiltrados, asignaciones, theme]);

  const summaryLabel = `${pedidosFiltrados.length} pedidos · ${preparadores.length} preparadores`;

  if (!canAssignOrders) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center', px: { xs: 2, sm: 3 } }}>
        <Alert severity="warning" sx={{ maxWidth: 500, mx: 'auto' }}>
          <Typography variant="h6">Acceso restringido</Typography>
          <Typography>No tienes permiso para asignar pedidos.</Typography>
        </Alert>
      </Container>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
        <Typography variant="body2" sx={{ ml: 2 }}>
          Cargando pedidos...
        </Typography>
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" disableGutters sx={{ px: { xs: 1.25, sm: 2, md: 3, lg: 4 }, py: { xs: 2, sm: 3 } }}>
      <AssignmentHeader
        title="Asignación de pedidos"
        subtitle="Vista compacta para revisar, desplegar líneas y asignar preparadores desde el estado de asignación."
        summary={summaryLabel}
        onRefresh={cargarDatos}
        onSave={asignarPedidos}
        loading={cambiandoAsignaciones}
        saveDisabled={!hayCambiosPendientes || cambiandoAsignaciones}
        saveLabel={cambiandoAsignaciones ? 'Guardando...' : 'Guardar cambios'}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError('')}>
          <AlertTitle>Error</AlertTitle>
          {error}
        </Alert>
      )}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setSuccessMessage('')}>
          <AlertTitle>Correcto</AlertTitle>
          {successMessage}
        </Alert>
      )}

      <FiltersPanel
        filtros={{
          numeroPedido: filtroNumeroPedido,
          cliente: filtroCliente,
          empleadoAsignado: filtroEmpleadoAsignado,
          order,
          orderBy,
        }}
        preparadores={preparadores}
        onChange={(field, value) => {
          if (field === 'numeroPedido') setFiltroNumeroPedido(value);
          if (field === 'cliente') setFiltroCliente(value);
          if (field === 'empleadoAsignado') setFiltroEmpleadoAsignado(value);
          setPage(0);
        }}
        onApplyOrder={(field, value) => {
          if (field === 'order') setOrder(value);
          if (field === 'orderBy') setOrderBy(value);
          setPage(0);
        }}
        onClear={limpiarFiltros}
      />

      <SummaryCards items={resumen} />

      {pedidos.length === 0 && (
        <Paper elevation={1} sx={{ p: 4, borderRadius: 3 }}>
          <Alert severity="info">No hay pedidos pendientes en este momento.</Alert>
        </Paper>
      )}

      {pedidos.length > 0 && pedidosFiltrados.length === 0 && (
        <Paper elevation={1} sx={{ p: 4, borderRadius: 3 }}>
          <Alert severity="warning">No se encontraron pedidos con los filtros aplicados.</Alert>
        </Paper>
      )}

      {paginatedPedidos.map((pedido) => {
        const clavePedido = String(pedido.numeroPedido);
        return (
          <PedidoCard
            key={clavePedido}
            pedido={pedido}
            preparadores={preparadores}
            preparadoresMap={preparadoresMap}
            expanded={!!pedidosExpandidos[clavePedido]}
            assignmentOpen={!!editoresAsignacion[clavePedido]}
            onToggle={() =>
              setPedidosExpandidos((prev) => ({
                ...prev,
                [clavePedido]: !prev[clavePedido],
              }))
            }
            onToggleAssignment={() =>
              setEditoresAsignacion((prev) => ({
                ...prev,
                [clavePedido]: !prev[clavePedido],
              }))
            }
            value={asignaciones[pedido.numeroPedido] || ''}
            onAsignacionChange={handleAsignacionChange}
            disabled={cambiandoAsignaciones}
          />
        );
      })}

      {pedidosFiltrados.length > 0 && (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          hasPrev={page > 0}
          hasNext={rowsPerPage !== -1 && page < totalPages - 1}
          rowsPerPage={rowsPerPage}
          onPrev={() => setPage((prev) => Math.max(prev - 1, 0))}
          onNext={() => setPage((prev) => Math.min(prev + 1, Math.max(totalPages - 1, 0)))}
          onRowsPerPageChange={(value) => {
            setRowsPerPage(parseInt(value, 10));
            setPage(0);
          }}
        />
      )}
    </Container>
  );
};

export default AsignarPedidosScreen;