import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Button,
  Stack,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Chip,
  useTheme,
} from '@mui/material';
import { Save as SaveIcon, Home as HomeIcon, Refresh as RefreshIcon, OpenInNew as OpenInNewIcon } from '@mui/icons-material';
import API from '../helpers/api';
import { getAuthHeader } from '../helpers/authHelper';
import { usePermissions } from '../PermissionsManager';
import Navbar from '../components/Navbar';

const buildAlbaranKey = (albaran) =>
  `albaran-${albaran.ejercicio}-${albaran.serie || ''}-${albaran.numero}`;

const DesignarRutasScreen = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  // canAssignRoutes → puede ver esta pantalla y asignar repartidores
  const { canAssignRoutes } = usePermissions();

  const [repartidores, setRepartidores] = useState([]);
  const [albaranes, setAlbaranes] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const cargarDatos = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const headers = getAuthHeader();

      const [repResponse, albResponse] = await Promise.all([
        API.get('/repartidores', { headers }),
        API.get('/api/albaranesPendientes', { headers }),
      ]);

      const albaranesNormalizados = albResponse.data.map((albaran) => ({
        ...albaran,
        id: buildAlbaranKey(albaran),
        direccion: [albaran.municipio, albaran.nombreObra].filter(Boolean).join(' - '),
      }));

      const asignacionesIniciales = {};
      albaranesNormalizados.forEach((albaran) => {
        asignacionesIniciales[albaran.id] = albaran.empleadoAsignado || '';
      });

      const repartidoresNormalizados = repResponse.data.map((rep) => ({
        id:     rep.id     || rep.CodigoCliente || rep.codigo || rep.CodigoRepartidor,
        nombre: rep.nombre || rep.Nombre        || rep.NombreCompleto || rep.RazonSocial,
      }));

      setRepartidores(repartidoresNormalizados);
      setAlbaranes(albaranesNormalizados);
      setAsignaciones(asignacionesIniciales);
    } catch (err) {
      setError(`Error cargando datos: ${err.response?.data?.mensaje || err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const handleAsignar = useCallback((albaranId, repartidorId) => {
    setAsignaciones((prev) => ({ ...prev, [albaranId]: repartidorId }));
  }, []);

  const asignacionesPendientes = useMemo(
    () =>
      albaranes.filter((albaran) => {
        const asignado = asignaciones[albaran.id] || '';
        const original = albaran.empleadoAsignado || '';
        return asignado && asignado !== original;
      }),
    [albaranes, asignaciones]
  );

  const guardarAsignaciones = useCallback(async () => {
    if (!asignacionesPendientes.length) {
      alert('No hay cambios pendientes de guardar');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const headers = getAuthHeader();
      await Promise.all(
        asignacionesPendientes.map((albaran) =>
          API.post(
            '/asignarAlbaranExistente',
            {
              codigoEmpresa:    albaran.codigoEmpresa,
              ejercicio:        albaran.ejercicio,
              serie:            albaran.serie || '',
              numeroAlbaran:    albaran.numero,
              codigoRepartidor: asignaciones[albaran.id],
            },
            { headers }
          )
        )
      );
      setSuccessMsg('Rutas asignadas correctamente');
      await cargarDatos();
    } catch (err) {
      setError(`Error guardando asignaciones: ${err.response?.data?.mensaje || err.message}`);
    } finally {
      setSaving(false);
    }
  }, [asignaciones, asignacionesPendientes, cargarDatos]);

  if (!canAssignRoutes) {
    return (
      <>
        <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="h6">Acceso restringido</Typography>
            <Typography>No tienes permiso para acceder a esta sección.</Typography>
          </Alert>
          <Button variant="contained" onClick={() => navigate('/')} startIcon={<HomeIcon />}>
            Volver al inicio
          </Button>
        </Container>
        <Navbar />
      </>
    );
  }

  if (loading && !saving) {
    return (
      <>
        <Container maxWidth="xl" sx={{ py: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
            <CircularProgress />
            <Typography sx={{ ml: 2 }}>Cargando albaranes y repartidores...</Typography>
          </Box>
        </Container>
        <Navbar />
      </>
    );
  }

  return (
    <>
      <Container maxWidth="xl" sx={{ py: 3, px: { xs: 1.5, sm: 2, md: 3 } }}>
        <Paper elevation={2} sx={{ p: { xs: 2, sm: 3, md: 4 }, borderRadius: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700, color: theme.palette.primary.main }}>
              Designar Albaranes a Repartidores
            </Typography>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={cargarDatos} disabled={loading}>
              Actualizar
            </Button>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>
          )}
          {successMsg && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg('')}>{successMsg}</Alert>
          )}

          {albaranes.length === 0 ? (
            <Alert severity="info">No hay albaranes pendientes de asignar en este momento.</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, borderRadius: 2, overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 600 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'rgba(0,0,0,0.04)' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Albarán</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Cliente</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Dirección / Obra</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Estado Pedido</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Repartidor</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Acción</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {albaranes.map((albaran) => {
                    const asignadoActual = asignaciones[albaran.id] || '';
                    const original       = albaran.empleadoAsignado || '';
                    const hayCambio      = asignadoActual && asignadoActual !== original;

                    return (
                      <TableRow
                        key={albaran.id}
                        sx={{ bgcolor: hayCambio ? 'action.selected' : 'inherit' }}
                      >
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" fontWeight={500}>
                              {albaran.albaran}
                            </Typography>
                            {albaran.esParcial && (
                              <Chip label="Parcial" color="warning" size="small" />
                            )}
                            {(albaran.EsVoluminoso || albaran.esVoluminoso) && (
                              <Chip label="Voluminoso" color="secondary" size="small" />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{albaran.cliente}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {albaran.direccion || albaran.municipio || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={albaran.StatusPedido || 'Desconocido'}
                            size="small"
                            color={
                              albaran.StatusPedido === 'Servido'    ? 'success' :
                              albaran.StatusPedido === 'Parcial'    ? 'warning' :
                              albaran.StatusPedido === 'Preparando' ? 'info'    : 'default'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <FormControl size="small" fullWidth>
                            <InputLabel id={`select-${albaran.id}`}>Repartidor</InputLabel>
                            <Select
                              labelId={`select-${albaran.id}`}
                              value={asignadoActual}
                              label="Repartidor"
                              onChange={(e) => handleAsignar(albaran.id, e.target.value)}
                            >
                              <MenuItem value="">Sin asignar</MenuItem>
                              {repartidores.map((rep) => (
                                <MenuItem key={rep.id} value={rep.id}>
                                  {rep.nombre}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<OpenInNewIcon />}
                            onClick={() => navigate('/detalle-albaran', { state: { albaran } })}
                          >
                            Abrir
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
              onClick={guardarAsignaciones}
              disabled={!asignacionesPendientes.length || saving}
              sx={{ minWidth: 180 }}
            >
              {saving ? 'Guardando...' : `Guardar (${asignacionesPendientes.length} cambios)`}
            </Button>
            <Button variant="outlined" startIcon={<HomeIcon />} onClick={() => navigate('/')}>
              Volver al Inicio
            </Button>
          </Stack>
        </Paper>
      </Container>
      <Navbar />
    </>
  );
};

export default DesignarRutasScreen;