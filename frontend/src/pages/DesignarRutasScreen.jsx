import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  Select,
  MenuItem,
  Button,
  CircularProgress,
  Alert,
  Stack,
} from '@mui/material';
import { Save as SaveIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import API from '../helpers/api';
import { getAuthHeader } from '../helpers/authHelper';
import { usePermissions } from '../PermissionsManager';

const DesignarRutasScreen = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { canAssignRoutes } = usePermissions();

  const [repartidores, setRepartidores] = useState([]);
  const [albaranes, setAlbaranes] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const cargarDatos = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const headers = getAuthHeader();

      const [repResponse, albResponse] = await Promise.all([
        API.get('/repartidores', { headers }),
        API.get('/albaranesPendientesUnicos', { headers }),
      ]);

      setRepartidores(repResponse.data);
      setAlbaranes(albResponse.data);
      // Inicializar asignaciones vacías (sin cambios)
      setAsignaciones({});
    } catch (err) {
      setError('Error cargando datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const handleAsignar = useCallback((albaranId, repartidorId) => {
    setAsignaciones(prev => ({ ...prev, [albaranId]: repartidorId }));
  }, []);

  const guardarAsignaciones = useCallback(async () => {
    try {
      setSaving(true);
      setError('');

      const asignacionesParaEnviar = Object.entries(asignaciones)
        .filter(([_, repartidorId]) => repartidorId)
        .map(([idUnico, repartidorId]) => {
          const [serie, numeroAlbaran] = idUnico.split('-');
          return {
            serieAlbaran: serie,
            numeroAlbaran: parseInt(numeroAlbaran, 10),
            repartidorId,
          };
        });

      if (asignacionesParaEnviar.length === 0) {
        alert('No hay asignaciones para guardar');
        return;
      }

      const headers = getAuthHeader();
      await API.post('/designar-rutas', { asignaciones: asignacionesParaEnviar }, { headers });

      alert('Rutas asignadas correctamente');
      // Recargar datos para refrescar la lista
      await cargarDatos();
    } catch (err) {
      setError('Error guardando asignaciones: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [asignaciones, cargarDatos]);

  const hayAsignacionesPendientes = useMemo(() => Object.keys(asignaciones).length > 0, [asignaciones]);

  if (!canAssignRoutes) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          No tienes permiso para acceder a esta sección.
        </Alert>
        <Button variant="contained" onClick={() => navigate('/')}>
          Volver al inicio
        </Button>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Cargando datos...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', py: 4, px: { xs: 2, sm: 3, md: 4 } }}>
      <Paper elevation={2} sx={{ overflow: 'hidden' }}>
        {/* Header con gradiente similar al original */}
        <Box
          sx={{
            position: 'relative',
            py: 3,
            px: 3,
            background: `linear-gradient(135deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
            color: theme.palette.primary.contrastText,
          }}
        >
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600, position: 'relative', zIndex: 2 }}>
            Designar Albaranes a Repartidores
          </Typography>
          {/* Burbujas decorativas */}
          <Box
            sx={{
              position: 'absolute',
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
              top: -30,
              left: -30,
              zIndex: 1,
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
              bottom: -20,
              right: -20,
              zIndex: 1,
            }}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ m: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <TableContainer component={Paper} sx={{ boxShadow: 'none' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: theme.palette.grey[100] }}>
                <TableCell sx={{ fontWeight: 600 }}>Albarán</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Cliente</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Dirección</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Repartidor</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {albaranes.map((albaran) => (
                <TableRow key={albaran.id} hover>
                  <TableCell>{albaran.albaran}</TableCell>
                  <TableCell>{albaran.cliente}</TableCell>
                  <TableCell>{albaran.direccion}</TableCell>
                  <TableCell>
                    <FormControl fullWidth size="small">
                      <Select
                        value={asignaciones[albaran.id] || ''}
                        onChange={(e) => handleAsignar(albaran.id, e.target.value)}
                        displayEmpty
                        sx={{ minWidth: 150 }}
                      >
                        <MenuItem value="">Seleccionar repartidor</MenuItem>
                        {repartidores.map((rep) => (
                          <MenuItem key={rep.CodigoCliente} value={rep.CodigoCliente}>
                            {rep.Nombre}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                </TableRow>
              ))}
              {albaranes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                    No hay albaranes pendientes de asignación
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ p: 3, justifyContent: 'center', borderTop: 1, borderColor: 'divider' }}
        >
          <Button
            variant="contained"
            color="success"
            startIcon={<SaveIcon />}
            onClick={guardarAsignaciones}
            disabled={!hayAsignacionesPendientes || saving}
            sx={{ minWidth: 200 }}
          >
            {saving ? <CircularProgress size={24} color="inherit" /> : 'Guardar Asignaciones'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/')}
          >
            Volver al Inicio
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
};

export default DesignarRutasScreen;