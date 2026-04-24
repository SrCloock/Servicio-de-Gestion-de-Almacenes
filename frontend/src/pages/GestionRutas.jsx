﻿// src/pages/GestionRutas.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Stack,
  Alert,
  CircularProgress,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  FilterAlt as FilterIcon,
  CheckCircle as CheckCircleIcon,
  Visibility as VisibilityIcon,
  Business as BusinessIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  Inventory as InventoryIcon,
} from '@mui/icons-material';
import API from '../helpers/api';
import { usePermissions } from '../PermissionsManager';

// Componente auxiliar para mostrar una fila de información dentro de la tarjeta
const CardInfoRow = ({ icon, label, value, color = 'text.primary' }) => {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ minWidth: 0 }}>
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: 1.5,
          bgcolor: 'rgba(15, 23, 42, 0.05)',
          color: 'text.secondary',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          mt: 0.125,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
        <Typography
          sx={{
            color: 'text.secondary',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            lineHeight: 1.1,
          }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            color,
            fontSize: '0.9rem',
            fontWeight: 500,
            lineHeight: 1.25,
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
          }}
        >
          {value || 'No especificado'}
        </Typography>
      </Box>
    </Stack>
  );
};

// Componente principal
function GestionRutas() {
  const navigate = useNavigate();
  const theme = useTheme();
  const mensajeFirmasObligatorias = 'Debes registrar ambas firmas antes de completar el albarán';
  const user = JSON.parse(localStorage.getItem('user'));
  const [albaranes, setAlbaranes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [rangoFechas, setRangoFechas] = useState('mes');

  // Filtros
  const [filtros, setFiltros] = useState({
    numeroAlbaran: '',
    nombreObra: '',
    repartidor: '',
    cliente: '',
    contacto: '',
    telefono: '',
    busquedaGeneral: '',
  });

  // Orden y paginación
  const [orderBy, setOrderBy] = useState('fechaAlbaran');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const {
    canViewGestionRutas,
    canPerformActionsInRutas,
    isDelivery,
    isAdmin,
    isAdvancedUser,
  } = usePermissions();

  // Carga de datos
  const fetchAlbaranes = useCallback(async () => {
    if (!canViewGestionRutas) return;
    try {
      setLoading(true);
      setError(null);
      const response = await API.get('/api/albaranesPendientes', {
        params: { rango: rangoFechas },
      });
      const processed = response.data.map((albaran) => ({
        ...albaran,
        repartidor: albaran.empleadoAsignado || 'Sin asignar',
        esParcial: albaran.EstadoPedido === 4,
        esVoluminoso: albaran.EsVoluminoso || albaran.EsVoluminosoPedido,
        albaranLower: (albaran.albaran || '').toLowerCase(),
        nombreObraLower: (albaran.nombreObra || albaran.obra || '').toLowerCase(),
        repartidorLower: (albaran.empleadoAsignado || '').toLowerCase(),
        clienteLower: (albaran.cliente || '').toLowerCase(),
        contactoLower: (albaran.contacto || '').toLowerCase(),
        telefonoLower: (albaran.telefonoContacto || '').toString().toLowerCase(),
        municipioLower: (albaran.municipio || '').toLowerCase(),
        fechaSort: albaran.FechaAlbaran ? new Date(albaran.FechaAlbaran).getTime() : 0,
      }));
      setAlbaranes(processed);
      setPage(1);
    } catch (err) {
      setError('Error al cargar albaranes: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canViewGestionRutas, rangoFechas]);

  useEffect(() => {
    if (!canViewGestionRutas) {
      navigate('/');
      return;
    }
    fetchAlbaranes();
  }, [canViewGestionRutas, navigate, fetchAlbaranes]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAlbaranes();
  };

  const handleFilterChange = (filterName, value) => {
    setFiltros((prev) => ({ ...prev, [filterName]: value }));
    setPage(1);
  };

  const resetFilters = () => {
    setFiltros({
      numeroAlbaran: '',
      nombreObra: '',
      repartidor: '',
      cliente: '',
      contacto: '',
      telefono: '',
      busquedaGeneral: '',
    });
    setPage(1);
  };

  const handleSort = (field) => {
    if (orderBy === field) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setOrderBy(field);
      setOrder('desc');
    }
    setPage(1);
  };

  // Filtrar albaranes
  const albaranesFiltrados = useMemo(() => {
    let filtered = albaranes.filter(
      (albaran) =>
        !isAdmin && !isAdvancedUser
          ? albaran.empleadoAsignado === user?.UsuarioLogicNet
          : true
    );

    // Búsqueda general
    if (filtros.busquedaGeneral) {
      const search = filtros.busquedaGeneral.toLowerCase().trim();
      filtered = filtered.filter(
        (a) =>
          a.albaranLower.includes(search) ||
          a.nombreObraLower.includes(search) ||
          a.clienteLower.includes(search) ||
          a.contactoLower.includes(search) ||
          a.telefonoLower.includes(search) ||
          a.repartidorLower.includes(search) ||
          a.municipioLower.includes(search)
      );
    }
    // Filtros específicos
    if (filtros.numeroAlbaran) {
      const val = filtros.numeroAlbaran.toLowerCase().trim();
      filtered = filtered.filter((a) => a.albaranLower.includes(val));
    }
    if (filtros.nombreObra) {
      const val = filtros.nombreObra.toLowerCase().trim();
      filtered = filtered.filter((a) => a.nombreObraLower.includes(val));
    }
    if (filtros.repartidor && !isDelivery) {
      const val = filtros.repartidor.toLowerCase().trim();
      filtered = filtered.filter((a) => a.repartidorLower.includes(val));
    }
    if (filtros.cliente) {
      const val = filtros.cliente.toLowerCase().trim();
      filtered = filtered.filter((a) => a.clienteLower.includes(val));
    }
    if (filtros.contacto) {
      const val = filtros.contacto.toLowerCase().trim();
      filtered = filtered.filter((a) => a.contactoLower.includes(val));
    }
    if (filtros.telefono) {
      const val = filtros.telefono.toLowerCase().trim();
      filtered = filtered.filter((a) => a.telefonoLower.includes(val));
    }
    return filtered;
  }, [albaranes, isDelivery, isAdmin, isAdvancedUser, user, filtros]);

  // Ordenar
  const albaranesOrdenados = useMemo(() => {
    const sorted = [...albaranesFiltrados];
    sorted.sort((a, b) => {
      let aVal, bVal;
      if (orderBy === 'fechaAlbaran') {
        aVal = a.fechaSort;
        bVal = b.fechaSort;
      } else {
        aVal = a.albaranLower;
        bVal = b.albaranLower;
      }
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [albaranesFiltrados, orderBy, order]);

  // Paginación
  const totalPages = Math.ceil(albaranesOrdenados.length / itemsPerPage);
  const paginatedAlbaranes = albaranesOrdenados.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );

  const handleCompletarAlbaran = async (albaran, e) => {
    e.stopPropagation();
    if (!canPerformActionsInRutas) {
      alert('No tienes permiso para completar albaranes');
      return;
    }
    if (isDelivery && albaran.empleadoAsignado !== user?.UsuarioLogicNet) {
      alert('Solo puedes completar albaranes asignados a ti');
      return;
    }
    if (!albaran.tieneFirmaCliente || !albaran.tieneFirmaRepartidor) {
      alert(mensajeFirmasObligatorias);
      return;
    }
    const observaciones = prompt('¿Alguna observación sobre la entrega? (Opcional)') || '';
    if (!window.confirm(`¿Marcar albarán ${albaran.albaran} como entregado?`)) return;
    try {
      const response = await API.post('/completar-albaran', {
        codigoEmpresa: albaran.codigoEmpresa,
        ejercicio: albaran.ejercicio,
        serie: albaran.serie,
        numeroAlbaran: albaran.numero,
        observaciones,
      });
      if (response.data.success) {
        setAlbaranes((prev) =>
          prev.filter(
            (a) =>
              !(
                a.numero === albaran.numero &&
                a.serie === albaran.serie &&
                a.ejercicio === albaran.ejercicio
              )
          )
        );
        alert(`Albarán ${albaran.albaran} completado`);
      } else {
        alert(`Error: ${response.data.mensaje}`);
      }
    } catch (error) {
      alert(`Error: ${error.response?.data?.mensaje || error.message}`);
    }
  };

  const formatFecha = (fechaString) => {
    if (!fechaString) return 'N/A';
    return new Date(fechaString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getEstadoText = (statusFacturado) => {
    return statusFacturado === -1 ? 'Servido' : 'Pendiente';
  };

  const getEstadoColor = (statusFacturado) => {
    return statusFacturado === -1 ? 'success' : 'default';
  };

  const activeFiltersCount = Object.entries(filtros)
    .filter(([key, val]) => key !== 'busquedaGeneral' && val.trim() !== '')
    .length;

  if (!canViewGestionRutas) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center', px: { xs: 2, sm: 3 } }}>
        <Alert severity="warning" sx={{ maxWidth: 500, mx: 'auto' }}>
          <Typography variant="h6">Acceso restringido</Typography>
          <Typography>No tienes permiso para acceder a esta sección.</Typography>
          <Button onClick={() => navigate('/')} sx={{ mt: 1 }}>
            Volver al inicio
          </Button>
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} disableGutters sx={{ px: { xs: 1.5, sm: 2, md: 3 }, py: 2 }}>
      {/* Cabecera */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
            Gestión de Rutas
          </Typography>
          <Chip
            label={isDelivery ? 'Repartidor' : canPerformActionsInRutas ? 'Acceso completo' : 'Acceso limitado'}
            size="small"
            color={isDelivery ? 'primary' : 'info'}
            variant="outlined"
          />
        </Stack>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Actualizando...' : 'Actualizar'}
        </Button>
      </Stack>

      {/* Subtítulo */}
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
        Albaranes Pendientes de Entrega (Solo Nuestros Medios)
        {isDelivery && (
          <Chip icon={<PersonIcon />} label="Solo tus albaranes" size="small" sx={{ ml: 1 }} />
        )}
      </Typography>

      {/* Panel de filtros */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <FilterIcon fontSize="small" color="action" />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Filtros
            </Typography>
            {activeFiltersCount > 0 && (
              <Chip
                label={`${activeFiltersCount} activo${activeFiltersCount !== 1 ? 's' : ''}`}
                size="small"
              />
            )}
          </Stack>
          <Button
            size="small"
            onClick={resetFilters}
            disabled={activeFiltersCount === 0}
            startIcon={<ClearIcon />}
          >
            Limpiar
          </Button>
        </Stack>

        {/* Búsqueda general */}
        <TextField
          fullWidth
          size="small"
          placeholder="Búsqueda general: albarán, obra, cliente, contacto, teléfono, municipio..."
          value={filtros.busquedaGeneral}
          onChange={(e) => handleFilterChange('busquedaGeneral', e.target.value)}
          sx={{ mb: 1.5 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: filtros.busquedaGeneral && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={() => handleFilterChange('busquedaGeneral', '')}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        {/* Filtros específicos */}
        <Grid container spacing={1.5}>
          <Grid item xs={12} sm={6} md={4}>
            <FormControl size="small" fullWidth>
              <InputLabel>Rango fechas</InputLabel>
              <Select
                label="Rango fechas"
                value={rangoFechas}
                onChange={(e) => {
                  setRangoFechas(e.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="dia">Hoy</MenuItem>
                <MenuItem value="semana">Últimos 7 días</MenuItem>
                <MenuItem value="mes">Últimos 30 días</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              size="small"
              label="Nº Albarán"
              fullWidth
              value={filtros.numeroAlbaran}
              onChange={(e) => handleFilterChange('numeroAlbaran', e.target.value)}
              InputProps={{
                endAdornment: filtros.numeroAlbaran && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => handleFilterChange('numeroAlbaran', '')}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              size="small"
              label="Obra"
              fullWidth
              value={filtros.nombreObra}
              onChange={(e) => handleFilterChange('nombreObra', e.target.value)}
              InputProps={{
                endAdornment: filtros.nombreObra && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => handleFilterChange('nombreObra', '')}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              size="small"
              label="Cliente"
              fullWidth
              value={filtros.cliente}
              onChange={(e) => handleFilterChange('cliente', e.target.value)}
              InputProps={{
                endAdornment: filtros.cliente && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => handleFilterChange('cliente', '')}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              size="small"
              label="Contacto"
              fullWidth
              value={filtros.contacto}
              onChange={(e) => handleFilterChange('contacto', e.target.value)}
              InputProps={{
                endAdornment: filtros.contacto && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => handleFilterChange('contacto', '')}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              size="small"
              label="Teléfono"
              fullWidth
              value={filtros.telefono}
              onChange={(e) => handleFilterChange('telefono', e.target.value)}
              InputProps={{
                endAdornment: filtros.telefono && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => handleFilterChange('telefono', '')}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          {!isDelivery && (
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                size="small"
                label="Repartidor"
                fullWidth
                value={filtros.repartidor}
                onChange={(e) => handleFilterChange('repartidor', e.target.value)}
                InputProps={{
                  endAdornment: filtros.repartidor && (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => handleFilterChange('repartidor', '')}
                      >
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
          )}
        </Grid>
      </Paper>

      {/* Controles de orden y paginación superior */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        sx={{ mb: 2 }}
        spacing={1}
      >
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant={orderBy === 'fechaAlbaran' ? 'contained' : 'outlined'}
            onClick={() => handleSort('fechaAlbaran')}
          >
            Fecha {orderBy === 'fechaAlbaran' && (order === 'asc' ? '↑' : '↓')}
          </Button>
          <Button
            size="small"
            variant={orderBy === 'albaran' ? 'contained' : 'outlined'}
            onClick={() => handleSort('albaran')}
          >
            Albarán {orderBy === 'albaran' && (order === 'asc' ? '↑' : '↓')}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {albaranesOrdenados.length} resultados
        </Typography>
      </Stack>

      {/* Estado de carga/error */}
      {loading && !refreshing && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>Cargando albaranes...</Typography>
        </Box>
      )}

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => fetchAlbaranes()}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {!loading && !error && albaranesOrdenados.length === 0 && (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {activeFiltersCount > 0
              ? 'No se encontraron albaranes con los filtros aplicados'
              : albaranes.length === 0
              ? 'No hay albaranes pendientes de entrega'
              : isDelivery
              ? 'No tienes albaranes asignados actualmente'
              : 'No hay albaranes pendientes de entrega (solo nuestros medios)'}
          </Typography>
          {activeFiltersCount > 0 && (
            <Button onClick={resetFilters} sx={{ mt: 1 }}>
              Limpiar filtros
            </Button>
          )}
        </Paper>
      )}

      {/* Grid de tarjetas */}
      {!loading && !error && albaranesOrdenados.length > 0 && (
        <>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
              },
              alignItems: 'stretch',
            }}
          >
            {paginatedAlbaranes.map((albaran) => (
              <Card
                key={`${albaran.ejercicio}-${albaran.serie}-${albaran.numero}`}
                variant="outlined"
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  borderRadius: 3,
                  borderTop: `4px solid ${
                    albaran.esParcial
                      ? theme.palette.warning.main
                      : albaran.esVoluminoso
                      ? theme.palette.secondary.main
                      : theme.palette.primary.light
                  }`,
                  cursor: 'pointer',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: theme.shadows[4],
                  },
                }}
                onClick={() => navigate('/detalle-albaran', { state: { albaran } })}
              >
                {/* Cabecera de la tarjeta */}
                <CardContent sx={{ p: 2, pb: 1 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontWeight: 700, lineHeight: 1.2, wordBreak: 'break-word' }}
                        >
                          {albaran.albaran}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                          {formatFecha(albaran.FechaAlbaran)}
                        </Typography>
                      </Box>
                      <Chip
                        label={getEstadoText(albaran.StatusFacturado)}
                        size="small"
                        color={getEstadoColor(albaran.StatusFacturado)}
                        variant="outlined"
                        sx={{ flexShrink: 0, fontWeight: 700 }}
                      />
                    </Stack>

                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      {albaran.esParcial && (
                        <Chip label="Parcial" size="small" color="warning" variant="outlined" />
                      )}
                      {albaran.esVoluminoso && (
                        <Chip
                          icon={<InventoryIcon />}
                          label="Voluminoso"
                          size="small"
                          color="secondary"
                          variant="outlined"
                        />
                      )}
                      {albaran.municipio && (
                        <Chip
                          icon={<LocationIcon />}
                          label={albaran.municipio}
                          size="small"
                          variant="outlined"
                          sx={{ maxWidth: '100%' }}
                        />
                      )}
                    </Stack>
                  </Stack>
                </CardContent>

                {/* Datos principales */}
                <CardContent sx={{ p: 2, pt: 0, pb: 1 }}>
                  <Typography
                    sx={{
                      color: 'text.secondary',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      mb: 1,
                    }}
                  >
                    Datos principales
                  </Typography>
                  <Stack spacing={0.75}>
                    <CardInfoRow icon={<BusinessIcon fontSize="small" />} label="Cliente" value={albaran.cliente} />
                    <CardInfoRow icon={<LocationIcon fontSize="small" />} label="Obra" value={albaran.nombreObra} />
                    <CardInfoRow icon={<PersonIcon fontSize="small" />} label="Contacto" value={albaran.contacto} />
                    <CardInfoRow icon={<PhoneIcon fontSize="small" />} label="Teléfono" value={albaran.telefonoContacto} />
                    <CardInfoRow
                      icon={<PersonIcon fontSize="small" />}
                      label="Repartidor"
                      value={albaran.repartidor}
                      color={albaran.empleadoAsignado ? 'text.primary' : theme.palette.warning.main}
                    />
                  </Stack>
                </CardContent>

                {/* Artículos */}
                <CardContent sx={{ p: 2, pt: 0, pb: 1 }}>
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: 2,
                      bgcolor: 'rgba(15, 23, 42, 0.03)',
                      border: `1px solid rgba(15, 23, 42, 0.06)`,
                    }}
                  >
                    <Stack spacing={0.75}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography
                          sx={{
                            color: 'text.secondary',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                          }}
                        >
                          Artículos
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {albaran.articulos?.length || 0}
                        </Typography>
                      </Stack>
                      {albaran.articulos && albaran.articulos.length > 0 ? (
                        <Stack direction="row" flexWrap="wrap" gap={0.5}>
                          {albaran.articulos.slice(0, 1).map((art, idx) => (
                            <Chip
                              key={idx}
                              label={`${art.nombre} (${art.cantidad})`}
                              size="small"
                              variant="outlined"
                              sx={{
                                maxWidth: '100%',
                                '& .MuiChip-label': {
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                },
                              }}
                            />
                          ))}
                          {albaran.articulos.length > 1 && (
                            <Chip
                              label={`+${albaran.articulos.length - 1}`}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          )}
                        </Stack>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Sin artículos visibles
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                </CardContent>

                {/* Aviso de firmas pendientes o espacio reservado */}
                <Box sx={{ px: 2, pb: 1 }}>
                  {(!albaran.tieneFirmaCliente || !albaran.tieneFirmaRepartidor) ? (
                    <Alert
                      severity="warning"
                      sx={{
                        py: 0,
                        alignItems: 'center',
                        '& .MuiAlert-icon': { py: 0.5 },
                        '& .MuiAlert-message': { fontSize: '0.75rem', lineHeight: 1.2 },
                      }}
                    >
                      {mensajeFirmasObligatorias}
                    </Alert>
                  ) : (
                    <Box
                      sx={{
                        height: 40,
                        borderRadius: 2,
                        border: '1px dashed rgba(15, 23, 42, 0.08)',
                        bgcolor: 'rgba(248, 250, 252, 0.45)',
                      }}
                    />
                  )}
                </Box>

                {/* Acciones */}
                {canPerformActionsInRutas && (
                  <CardActions
                    sx={{
                      p: 2,
                      pt: 0,
                      justifyContent: 'space-between',
                      borderTop: `1px solid ${theme.palette.divider}`,
                      bgcolor: 'rgba(248, 250, 252, 0.8)',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {albaran.esVoluminoso ? 'Entrega especial' : 'Acciones'}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Tooltip
                        title={
                          isDelivery && albaran.empleadoAsignado !== user?.UsuarioLogicNet
                            ? 'Solo tus albaranes'
                            : !albaran.tieneFirmaCliente || !albaran.tieneFirmaRepartidor
                            ? mensajeFirmasObligatorias
                            : 'Marcar como entregado'
                        }
                      >
                        <span>
                          <Button
                            size="small"
                            startIcon={<CheckCircleIcon />}
                            onClick={(e) => handleCompletarAlbaran(albaran, e)}
                            disabled={
                              (isDelivery && albaran.empleadoAsignado !== user?.UsuarioLogicNet) ||
                              !albaran.tieneFirmaCliente ||
                              !albaran.tieneFirmaRepartidor
                            }
                          >
                            Completar
                          </Button>
                        </span>
                      </Tooltip>
                      <Button
                        size="small"
                        startIcon={<VisibilityIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/detalle-albaran', { state: { albaran } });
                        }}
                      >
                        Detalle
                      </Button>
                    </Stack>
                  </CardActions>
                )}
              </Card>
            ))}
          </Box>

          {/* Paginación */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(e, value) => setPage(value)}
                color="primary"
                size="small"
              />
            </Box>
          )}
        </>
      )}
    </Container>
  );
}

export default GestionRutas;