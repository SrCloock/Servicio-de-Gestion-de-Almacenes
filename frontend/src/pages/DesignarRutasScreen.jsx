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
  useTheme,
} from '@mui/material';
import { Save as SaveIcon, Home as HomeIcon } from '@mui/icons-material';
import API from '../helpers/api';
import { getAuthHeader } from '../helpers/authHelper';
import { usePermissions } from '../PermissionsManager';
import Navbar from '../components/Navbar';

const buildAlbaranKey = (albaran) =>
  `albaran-${albaran.EjercicioAlbaran}-${albaran.SerieAlbaran || ''}-${albaran.NumeroAlbaran}`;

const DesignarRutasScreen = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { canAssignRoutes } = usePermissions();

  const [repartidores, setRepartidores] = useState([]);
  const [albaranes, setAlbaranes] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const cargarDatos = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const headers = getAuthHeader();
      const [repResponse, albResponse] = await Promise.all([
        API.get('/repartidores', { headers }),
        API.get('/albaranes-asignacion', { headers }),
      ]);

      const albaranesNormalizados = albResponse.data.map((albaran) => ({
        ...albaran,
        id: buildAlbaranKey(albaran),
        cliente: albaran.RazonSocial,
        direccion: [albaran.Municipio, albaran.NombreObra].filter(Boolean).join(' - '),
      }));

      const asignacionesIniciales = {};
      albaranesNormalizados.forEach((albaran) => {
        asignacionesIniciales[albaran.id] = albaran.repartidorAsignado || '';
      });

      setRepartidores(repResponse.data);
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
        return asignado && asignado !== (albaran.repartidorAsignado || '');
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
              codigoEmpresa: albaran.CodigoEmpresa,
              ejercicio: albaran.EjercicioAlbaran,
              serie: albaran.SerieAlbaran || '',
              numeroAlbaran: albaran.NumeroAlbaran,
              codigoRepartidor: asignaciones[albaran.id],
            },
            { headers }
          )
        )
      );

      alert('Rutas asignadas correctamente');
      await cargarDatos();
    } catch (err) {
      setError(`Error guardando asignaciones: ${err.response?.data?.mensaje || err.message}`);
    } finally {
      setSaving(false);
    }
  }, [asignaciones, asignacionesPendientes, cargarDatos]);

  // Renderizado condicional de permisos
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

  // Carga inicial
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
          {/* Cabecera */}
          <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700, color: theme.palette.primary.main }}>
            Designar Albaranes a Repartidores
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          {/* Tabla responsiva */}
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, borderRadius: 2, overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 600 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'rgba(0, 0, 0, 0.04)' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Albarán</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Cliente</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Dirección</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Repartidor</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {albaranes.map((albaran) => (
                  <TableRow key={albaran.id}>
                    <TableCell>{albaran.albaran}</TableCell>
                    <TableCell>{albaran.cliente}</TableCell>
                    <TableCell>{albaran.direccion || '-'}</TableCell>
                    <TableCell>
                      <FormControl size="small" fullWidth>
                        <InputLabel id={`select-${albaran.id}`}>Repartidor</InputLabel>
                        <Select
                          labelId={`select-${albaran.id}`}
                          value={asignaciones[albaran.id] || ''}
                          label="Repartidor"
                          onChange={(e) => handleAsignar(albaran.id, e.target.value)}
                        >
                          <MenuItem value="">Seleccionar repartidor</MenuItem>
                          {repartidores.map((rep) => (
                            <MenuItem key={rep.id} value={rep.id}>
                              {rep.nombre}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Acciones */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
              onClick={guardarAsignaciones}
              disabled={!asignacionesPendientes.length || saving}
              sx={{ minWidth: 180 }}
            >
              {saving ? 'Guardando...' : 'Guardar Asignaciones'}
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