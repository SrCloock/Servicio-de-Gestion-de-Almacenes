import React, { useState, useEffect, useMemo } from 'react';
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
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  Assignment as AssignmentIcon,
  AssignmentInd as AssignmentIndIcon,
  Clear as ClearIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Inventory2 as Inventory2Icon,
  LocalShipping as LocalShippingIcon,
  PersonOff as PersonOffIcon,
  Refresh as RefreshIcon,
  ViewList as ViewListIcon,
} from '@mui/icons-material';
import API from '../helpers/api';
import { usePermissions } from '../PermissionsManager';

// ---------- Funciones auxiliares (sin cambios) ----------
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

const formatFecha = (fechaString) => {
  if (!fechaString) return 'Sin fecha';
  return new Date(fechaString).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const formatPeso = (peso) => `${(parseFloat(peso) || 0).toFixed(2)} kg`;

// ---------- Subcomponentes refactorizados ----------
const AssignmentHeader = ({ title, subtitle, summary, onRefresh, loading }) => {
  const theme = useTheme();
  return (
    <Paper elevation={2} sx={{ p: 3, borderRadius: 3, mb: 3 }}>
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
                width: 52,
                height: 52,
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: theme.palette.primary.main,
                color: theme.palette.primary.contrastText,
              }}
            >
              <LocalShippingIcon />
            </Box>
            <Stack spacing={0.5}>
              <Typography variant="h4" component="h1" sx={{ color: theme.palette.primary.main, fontWeight: 700 }}>
                {title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            </Stack>
          </Stack>

          <Chip label={summary} color="info" variant="outlined" sx={{ fontWeight: 700, px: 1 }} />
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRefresh} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};

const FiltersPanel = ({ filtros, repartidores, onChange, onOrderChange, onClear, activeFiltersCount, total, filtered }) => {
  const theme = useTheme();
  return (
    <Paper elevation={1} sx={{ p: 3, borderRadius: 3, mb: 3 }}>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
          spacing={2}
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="h6" component="h3">
              Filtrar albaranes
            </Typography>
            {activeFiltersCount > 0 && <Chip label={`${activeFiltersCount} filtros activos`} size="small" />}
          </Stack>
          <Button variant="outlined" onClick={onClear} disabled={activeFiltersCount === 0}>
            Limpiar filtros
          </Button>
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)', xl: 'repeat(6, 1fr)' },
            gap: 2,
          }}
        >
          <TextField
            label="Nº Albarán"
            value={filtros.albaran}
            onChange={(e) => onChange('albaran', e.target.value)}
            fullWidth
            InputProps={{
              endAdornment: filtros.albaran ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => onChange('albaran', '')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          <TextField
            label="Cliente"
            value={filtros.cliente}
            onChange={(e) => onChange('cliente', e.target.value)}
            fullWidth
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
          <TextField
            label="Obra"
            value={filtros.obra}
            onChange={(e) => onChange('obra', e.target.value)}
            fullWidth
            InputProps={{
              endAdornment: filtros.obra ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => onChange('obra', '')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          <FormControl fullWidth>
            <InputLabel id="filtro-repartidor-albaranes-label">Repartidor</InputLabel>
            <Select
              labelId="filtro-repartidor-albaranes-label"
              value={filtros.repartidor}
              label="Repartidor"
              onChange={(e) => onChange('repartidor', e.target.value)}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="sin-asignar">Sin asignar</MenuItem>
              {repartidores.map((rep) => (
                <MenuItem key={rep.id} value={rep.id}>
                  {rep.nombre}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel id="ordenar-albaranes-label">Ordenar por</InputLabel>
            <Select
              labelId="ordenar-albaranes-label"
              value={filtros.orderBy}
              label="Ordenar por"
              onChange={(e) => onOrderChange('orderBy', e.target.value)}
            >
              <MenuItem value="albaran">Albarán</MenuItem>
              <MenuItem value="fechaSort">Fecha</MenuItem>
              <MenuItem value="clienteLower">Cliente</MenuItem>
              <MenuItem value="obraLower">Obra</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel id="sentido-albaranes-label">Sentido</InputLabel>
            <Select
              labelId="sentido-albaranes-label"
              value={filtros.order}
              label="Sentido"
              onChange={(e) => onOrderChange('order', e.target.value)}
            >
              <MenuItem value="asc">Ascendente</MenuItem>
              <MenuItem value="desc">Descendente</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.25}>
          <Typography variant="body2" color="text.secondary">
            Mostrando {filtered} de {total} albaranes
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Solo albaranes de nuestros medios
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
};

const SummaryCards = ({ items }) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
        gap: 2,
        mb: 3,
      }}
    >
      {items.map((item) => (
        <Paper key={item.label} elevation={1} sx={{ p: 2.5, borderRadius: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                bgcolor: item.accent,
                color: theme.palette.common.white,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {item.icon}
            </Box>
            <Box>
              <Typography variant="h5" fontWeight={800}>
                {item.value}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {item.label}
              </Typography>
            </Box>
          </Stack>
        </Paper>
      ))}
    </Box>
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
      direction={{ xs: 'column', md: 'row' }}
      spacing={2}
      justifyContent="space-between"
      alignItems={{ xs: 'stretch', md: 'center' }}
    >
      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel id="rows-per-page-albaranes-label">Elementos por página</InputLabel>
        <Select
          labelId="rows-per-page-albaranes-label"
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

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
        <Button variant="outlined" onClick={onPrev} disabled={!hasPrev}>
          Anterior
        </Button>
        <Typography fontWeight={600}>
          Página {page + 1} de {Math.max(totalPages, 1)}
        </Typography>
        <Button variant="outlined" onClick={onNext} disabled={!hasNext}>
          Siguiente
        </Button>
      </Stack>
    </Stack>
  </Paper>
);

const DetailLineItem = ({ linea }) => {
  const theme = useTheme();
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={700}>{linea.nombre || linea.DescripcionArticulo || linea.codigo}</Typography>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap>
          <Chip label={`Peso ${formatPeso(linea.pesoTotal || linea.PesoTotal)}`} size="small" variant="outlined" />
          <Chip label={`Unidades ${linea.cantidad ?? linea.Unidades ?? 0}`} size="small" variant="outlined" />
        </Stack>
      </Stack>
    </Paper>
  );
};

const AlbaranCard = ({
  albaran,
  expanded,
  onToggle,
  repartidores,
  asignacion,
  onAsignacionChange,
  onAsignar,
  assignmentOpen,
  onToggleAssignment,
}) => {
  const theme = useTheme();
  // FIX 5: usar campos camelCase que devuelve /api/albaranesPendientes
  const key = albaran.id || `albaran-${albaran.ejercicio}-${albaran.serie || ''}-${albaran.numero}`;
  const repartidorActual = albaran.empleadoAsignado || '';
  const repartidorSeleccionado = asignacion;
  const nombreRepartidorActual = repartidores.find((rep) => rep.id === repartidorActual)?.nombre || repartidorActual || 'Sin asignar';
  const accionLabel = repartidorActual ? 'Reasignar' : 'Asignar';
  const lineas = Array.isArray(albaran.articulos) ? albaran.articulos : [];

  return (
    <Card elevation={2} sx={{ borderRadius: 3, overflow: 'hidden', mb: 2 }}>
      <Paper
        elevation={0}
        onClick={onToggle}
        sx={{
          px: 2.5,
          py: 2,
          cursor: 'pointer',
          bgcolor: expanded ? `${theme.palette.primary.main}08` : 'transparent',
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
              <Chip label={albaran.albaran} size="small" sx={{ fontWeight: 700 }} />
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`Fecha ${formatFecha(albaran.FechaAlbaran)}`} size="small" variant="outlined" />
              <Chip
                label={nombreRepartidorActual}
                size="small"
                color={repartidorActual ? 'success' : 'default'}
                variant="outlined"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleAssignment();
                }}
                sx={{ cursor: 'pointer' }}
              />
              {albaran.esVoluminoso && (
                <Chip
                  label="Voluminoso"
                  size="small"
                  sx={{
                    fontWeight: 700,
                    bgcolor: `${theme.palette.secondary.main}20`,
                    color: theme.palette.secondary.dark,
                    border: `1px solid ${theme.palette.secondary.main}40`,
                  }}
                />
              )}
              {albaran.esParcial && <Chip label="Parcial" size="small" color="warning" />}
            </Stack>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap>
            {/* FIX 5: campos camelCase del backend */}
            <Typography variant="body2" color="text.secondary">
              <strong>Cliente:</strong> {albaran.cliente || albaran.RazonSocial || 'Sin cliente'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Contacto:</strong> {albaran.contacto || albaran.Contacto || 'Sin contacto'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Obra:</strong> {albaran.nombreObra || albaran.NombreObra || albaran.obra || 'Sin obra'}
            </Typography>
          </Stack>
        </Stack>
      </Paper>

      {assignmentOpen && (
        <Box sx={{ px: 3, pb: expanded ? 0 : 3 }}>
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={700}>
                Asignación de reparto
              </Typography>

              <FormControl fullWidth>
                <InputLabel id={`repartidor-${key}`}>Repartidor / conductor</InputLabel>
                <Select
                  labelId={`repartidor-${key}`}
                  value={repartidorSeleccionado || ''}
                  label="Repartidor / conductor"
                  onChange={(e) => onAsignacionChange(key, e.target.value)}
                >
                  <MenuItem value="">Sin asignar</MenuItem>
                  {repartidores.map((rep) => (
                    <MenuItem key={rep.id} value={rep.id}>
                      {rep.nombre}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Asignado actual: <strong>{nombreRepartidorActual}</strong>
                </Typography>

                <Tooltip title={repartidorSeleccionado === repartidorActual ? 'Ya está asignado a ese repartidor' : ''}>
                  <span>
                    <Button
                      variant="contained"
                      startIcon={<AssignmentIcon />}
                      onClick={onAsignar}
                      disabled={!repartidorSeleccionado || repartidorSeleccionado === repartidorActual}
                    >
                      {accionLabel}
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Stack>
          </Paper>
        </Box>
      )}

      {expanded && (
        <CardContent sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>
              Líneas del albarán
            </Typography>
            {lineas.length === 0 ? (
              <Alert severity="warning">No se han recibido líneas para este albarán.</Alert>
            ) : (
              lineas.map((linea, index) => (
                <DetailLineItem key={`${key}-${linea.orden || linea.codigo || index}`} linea={linea} />
              ))
            )}
          </Stack>
        </CardContent>
      )}
    </Card>
  );
};

// ---------- Componente principal ----------
function AlbaranesAsignadosScreen() {
  const [albaranes, setAlbaranes] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [asignaciones, setAsignaciones] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [albaranesExpandidos, setAlbaranesExpandidos] = useState({});
  const [editoresAsignacion, setEditoresAsignacion] = useState({});

  const [filtroAlbaran, setFiltroAlbaran] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroObra, setFiltroObra] = useState('');
  const [filtroRepartidor, setFiltroRepartidor] = useState('');

  const [order, setOrder] = useState('asc');
  const [orderBy, setOrderBy] = useState('albaran');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  const { canAssignWaybills } = usePermissions();

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [albaranesResponse, repartidoresResponse] = await Promise.all([
        // FIX 3: endpoint correcto — /api/albaranesPendientes
        // El backend ya filtra por EmpleadoAsignado según permisos del usuario
        API.get('/api/albaranesPendientes'),
        API.get('/repartidores'),
      ]);

      // FIX 5: normalizar campos — /api/albaranesPendientes devuelve camelCase
      // Añadimos campos auxiliares para ordenación y filtrado
      const albaranesNormalizados = albaranesResponse.data.map((albaran) => ({
        ...albaran,
        // id ya viene del backend, pero lo aseguramos
        id: albaran.id || `${albaran.ejercicio}-${albaran.serie || ''}-${albaran.numero}`,
        esParcial:    albaran.esParcial    || albaran.EstadoPedido === 4,
        esVoluminoso: albaran.EsVoluminoso || albaran.EsVoluminosoPedido,
        // Campos auxiliares para ordenación/filtrado (camelCase)
        repartidorLower: (albaran.empleadoAsignado || '').toLowerCase(),
        albaranLower:    (albaran.albaran    || '').toLowerCase(),
        obraLower:       (albaran.nombreObra || albaran.NombreObra || '').toLowerCase(),
        clienteLower:    (albaran.cliente    || albaran.RazonSocial || '').toLowerCase(),
        fechaSort:       albaran.FechaAlbaran ? new Date(albaran.FechaAlbaran).getTime() : 0,
      }));

      // FIX 3: normalizar repartidores
      const repartidoresNormalizados = repartidoresResponse.data.map((rep) => ({
        id:     rep.id     || rep.CodigoCliente || rep.codigo,
        nombre: rep.nombre || rep.Nombre        || rep.RazonSocial,
      }));

      setAlbaranes(albaranesNormalizados);
      setRepartidores(repartidoresNormalizados);

      const initialAsignaciones = {};
      albaranesNormalizados.forEach((albaran) => {
        initialAsignaciones[albaran.id] = albaran.empleadoAsignado || '';
      });
      setAsignaciones(initialAsignaciones);
    } catch (err) {
      setError(`Error: ${err.response?.data?.mensaje || err.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleAsignarAlbaran = async (albaran) => {
    const repartidorId = asignaciones[albaran.id];

    if (!repartidorId) {
      setError('Selecciona un repartidor');
      return;
    }
    if (repartidorId === albaran.empleadoAsignado) {
      setError('Este albarán ya está asignado a este repartidor');
      return;
    }

    try {
      const response = await API.post('/asignarAlbaranExistente', {
        // FIX 5: campos camelCase
        codigoEmpresa: albaran.codigoEmpresa,
        ejercicio:     albaran.ejercicio,
        serie:         albaran.serie || '',
        numeroAlbaran: albaran.numero,
        codigoRepartidor: repartidorId,
      });

      if (response.data.success) {
        setAlbaranes((prev) =>
          prev.map((a) =>
            a.id === albaran.id
              ? { ...a, empleadoAsignado: repartidorId, repartidorLower: repartidorId.toLowerCase() }
              : a
          )
        );
        setSuccessMessage('Albarán asignado correctamente');
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (assignError) {
      setError(`Error: ${assignError.response?.data?.mensaje || assignError.message}`);
    }
  };

  const limpiarFiltros = () => {
    setFiltroAlbaran('');
    setFiltroCliente('');
    setFiltroObra('');
    setFiltroRepartidor('');
    setOrder('asc');
    setOrderBy('albaran');
    setPage(0);
  };

  const albaranesFiltrados = useMemo(
    () =>
      albaranes.filter((albaran) => {
        const matchAlbaran =
          !filtroAlbaran ||
          albaran.albaranLower.includes(filtroAlbaran.toLowerCase()) ||
          (albaran.numero || '').toString().includes(filtroAlbaran);
        const matchCliente = !filtroCliente || albaran.clienteLower.includes(filtroCliente.toLowerCase());
        const matchObra = !filtroObra || albaran.obraLower.includes(filtroObra.toLowerCase());
        const matchRepartidor =
          !filtroRepartidor ||
          (filtroRepartidor === 'sin-asignar'
            ? !albaran.empleadoAsignado
            : albaran.repartidorLower.includes(filtroRepartidor.toLowerCase()));
        return matchAlbaran && matchCliente && matchObra && matchRepartidor;
      }),
    [albaranes, filtroAlbaran, filtroCliente, filtroObra, filtroRepartidor]
  );

  const albaranesOrdenados = useMemo(() => stableSort(albaranesFiltrados, getComparator(order, orderBy)), [albaranesFiltrados, order, orderBy]);

  const totalPages = rowsPerPage === -1 ? 1 : Math.ceil(albaranesOrdenados.length / rowsPerPage);
  const paginatedAlbaranes = useMemo(() => {
    if (rowsPerPage === -1) return albaranesOrdenados;
    return albaranesOrdenados.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [albaranesOrdenados, page, rowsPerPage]);

  const activeFiltersCount = [filtroAlbaran, filtroCliente, filtroObra, filtroRepartidor].filter(Boolean).length;
  const summaryLabel = `${albaranesFiltrados.length} albaranes · ${repartidores.length} conductores`;

  const themeColors = {
    primary: '#2c7da0',
    warning: '#f4a261',
    teal: '#0f766e',
    purple: '#7c3aed',
  };

  const resumen = useMemo(() => {
    // FIX 5: usar empleadoAsignado (camelCase)
    const sinAsignar = albaranesFiltrados.filter((item) => !item.empleadoAsignado).length;
    const parciales = albaranesFiltrados.filter((item) => item.esParcial).length;
    const voluminosos = albaranesFiltrados.filter((item) => item.esVoluminoso).length;

    return [
      { label: 'Albaranes visibles', value: albaranesFiltrados.length, icon: <ViewListIcon />, accent: themeColors.primary },
      { label: 'Sin asignar', value: sinAsignar, icon: <PersonOffIcon />, accent: themeColors.warning },
      { label: 'Parciales', value: parciales, icon: <Inventory2Icon />, accent: themeColors.teal },
      { label: 'Voluminosos', value: voluminosos, icon: <AssignmentIndIcon />, accent: themeColors.purple },
    ];
  }, [albaranesFiltrados]);

  if (!canAssignWaybills) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center', px: { xs: 2, sm: 3 } }}>
        <Alert severity="warning" sx={{ maxWidth: 500, mx: 'auto' }}>
          <Typography variant="h6">Acceso restringido</Typography>
          <Typography>No tienes permiso para acceder a esta sección.</Typography>
        </Alert>
      </Container>
    );
  }

  if (loading && !refreshing) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
        <Typography variant="body2" sx={{ ml: 2 }}>
          Cargando albaranes...
        </Typography>
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" disableGutters sx={{ px: { xs: 1.25, sm: 2, md: 3, lg: 4 }, py: { xs: 2, sm: 3 } }}>
      <AssignmentHeader
        title="Asignación de albaranes"
        subtitle="Vista compacta para revisar, desplegar líneas y asignar repartidores desde el estado de asignación."
        summary={summaryLabel}
        onRefresh={handleRefresh}
        loading={refreshing}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          <AlertTitle>Error</AlertTitle>
          {error}
        </Alert>
      )}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccessMessage('')}>
          <AlertTitle>Correcto</AlertTitle>
          {successMessage}
        </Alert>
      )}

      <FiltersPanel
        filtros={{
          albaran: filtroAlbaran,
          cliente: filtroCliente,
          obra: filtroObra,
          repartidor: filtroRepartidor,
          order,
          orderBy,
        }}
        repartidores={repartidores}
        onChange={(field, value) => {
          if (field === 'albaran') setFiltroAlbaran(value);
          if (field === 'cliente') setFiltroCliente(value);
          if (field === 'obra') setFiltroObra(value);
          if (field === 'repartidor') setFiltroRepartidor(value);
          setPage(0);
        }}
        onOrderChange={(field, value) => {
          if (field === 'order') setOrder(value);
          if (field === 'orderBy') setOrderBy(value);
          setPage(0);
        }}
        onClear={limpiarFiltros}
        activeFiltersCount={activeFiltersCount}
        total={albaranes.length}
        filtered={albaranesFiltrados.length}
      />

      <SummaryCards items={resumen} />

      {albaranes.length === 0 && (
        <Paper elevation={1} sx={{ p: 4, borderRadius: 3 }}>
          <Alert severity="info">No hay albaranes pendientes de asignación.</Alert>
        </Paper>
      )}

      {albaranes.length > 0 && albaranesFiltrados.length === 0 && (
        <Paper elevation={1} sx={{ p: 4, borderRadius: 3 }}>
          <Alert severity="warning">No se encontraron albaranes con los filtros actuales.</Alert>
        </Paper>
      )}

      {paginatedAlbaranes.map((albaran) => {
        return (
          <AlbaranCard
            key={albaran.id}
            albaran={albaran}
            expanded={!!albaranesExpandidos[albaran.id]}
            assignmentOpen={!!editoresAsignacion[albaran.id]}
            onToggle={() =>
              setAlbaranesExpandidos((prev) => ({
                ...prev,
                [albaran.id]: !prev[albaran.id],
              }))
            }
            onToggleAssignment={() =>
              setEditoresAsignacion((prev) => ({
                ...prev,
                [albaran.id]: !prev[albaran.id],
              }))
            }
            repartidores={repartidores}
            asignacion={asignaciones[albaran.id] || ''}
            onAsignacionChange={(cardKey, value) => setAsignaciones((prev) => ({ ...prev, [cardKey]: value }))}
            onAsignar={() => handleAsignarAlbaran(albaran)}
          />
        );
      })}

      {albaranesFiltrados.length > 0 && (
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
}

export default AlbaranesAsignadosScreen;