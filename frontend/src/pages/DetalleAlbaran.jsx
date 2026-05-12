import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Container, Paper, Typography, TextField, Button, Stack, Box, Chip,
  Tabs, Tab, Alert, CircularProgress, Grid, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, useTheme, useMediaQuery,
  Tooltip, Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, Snackbar, Skeleton, Badge,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon, CheckCircle as CheckCircleIcon,
  Save as SaveIcon, Assignment as AssignmentIcon, Build as BuildIcon,
  Warning as WarningIcon, Clear as ClearIcon,
} from '@mui/icons-material';
import SignatureCanvas from 'react-signature-canvas';
import API from '../helpers/api';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

// Componente SignatureField mejorado
const SignatureField = ({ title, onClear, onEnd, disabled, isValid, infoText }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const canvasRef = useRef();

  const handleClear = () => {
    canvasRef.current?.clear();
    onClear?.(); // Notificamos al padre que se limpió
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle1" fontWeight={600}>
            Firma del {title}
          </Typography>
          {isValid && <CheckCircleIcon color="success" fontSize="small" />}
        </Stack>
        <Button size="small" startIcon={<ClearIcon />} onClick={handleClear} disabled={disabled}>
          Limpiar
        </Button>
      </Stack>
      <SignatureCanvas
        penColor="black"
        canvasProps={{
          width: 600,
          height: 240,
          style: {
            width: '100%',
            height: isMobile ? 140 : 180,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: theme.shape.borderRadius,
            backgroundColor: '#fff',
            cursor: 'crosshair',
            touchAction: 'none',
          },
          'aria-label': `Área de firma para ${title}`,
        }}
        ref={canvasRef}
        onEnd={onEnd}
        velocityFilterWeight={0.8}   // Suavizado del trazo
        minWidth={0.5}               // Grosor mínimo
        maxWidth={2.5}               // Grosor máximo
        throttle={16}                // Actualización a 60fps
        backgroundColor="white"
      />
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {infoText}
      </Typography>
    </Paper>
  );
};

const DetalleAlbaran = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const { state } = useLocation();
  const albaran = state?.albaran;

  const [cantidades, setCantidades] = useState({});
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [firmasValidas, setFirmasValidas] = useState({ cliente: false, repartidor: false });
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  const { canPerformActionsInRutas } = usePermissions();
  const sigCliente = useRef();
  const sigRepartidor = useRef();
  const mensajeFirmasObligatorias = 'Debes registrar ambas firmas antes de completar el albarán';

  // --- Inicialización ---
  useEffect(() => {
    if (albaran) setTimeout(() => setInitialLoading(false), 300);
    else setInitialLoading(false);
  }, [albaran]);

  useEffect(() => {
    if (albaran?.articulos) {
      const initial = {};
      albaran.articulos.forEach((art) => {
        initial[art.orden] = art.cantidadEntregada ?? art.cantidad ?? 0;
      });
      setCantidades(initial);
    }
  }, [albaran]);

  useEffect(() => {
    if (!albaran?.articulos) return;
    const hasAnyChange = albaran.articulos.some((art) => {
      const original = art.cantidadEntregada ?? art.cantidad ?? 0;
      const current = cantidades[art.orden] ?? 0;
      return Math.abs(original - current) > 0.001;
    });
    setHasChanges(hasAnyChange);
  }, [cantidades, albaran]);

  // --- Detección de firmas (usa el método isEmpty de la librería) ---
  const obtenerFirmaSegura = useCallback((ref) => {
    if (!ref.current) return null;
    if (ref.current.isEmpty()) return null; // ✅ No hay ningún trazo
    try {
      const canvas = ref.current.getTrimmedCanvas(); // Recorta márgenes, pero la imagen resultante es más limpia
      return canvas.toDataURL('image/png');
    } catch (err) {
      console.error('Error al obtener firma:', err);
      return null;
    }
  }, []);

  const actualizarEstadoFirmas = useCallback(() => {
    const firmaCliente = obtenerFirmaSegura(sigCliente);
    const firmaRepartidor = obtenerFirmaSegura(sigRepartidor);
    setFirmasValidas({
      cliente: firmaCliente !== null,
      repartidor: firmaRepartidor !== null,
    });
  }, [obtenerFirmaSegura]);

  const limpiarFirma = useCallback((ref) => {
    ref.current?.clear();
    actualizarEstadoFirmas(); // Actualizamos inmediatamente después de limpiar
  }, [actualizarEstadoFirmas]);

  // Al terminar de dibujar, actualizamos estado inmediatamente
  const handleFirmaEnd = useCallback(() => {
    actualizarEstadoFirmas();
  }, [actualizarEstadoFirmas]);

  // Refrescar estado al mostrar pestaña de firmas
  useEffect(() => {
    if (activeTab === 1) {
      actualizarEstadoFirmas();
    }
  }, [activeTab, actualizarEstadoFirmas]);

  // --- Manejadores de cantidades y completado ---
  const handleCantidadChange = useCallback((orden, value) => {
    const num = parseFloat(value);
    setCantidades(prev => ({ ...prev, [orden]: isNaN(num) ? 0 : num }));
  }, []);

  const handleActualizarCantidades = useCallback(async () => {
    if (!canPerformActionsInRutas || !albaran) return;
    try {
      setLoading(true);
      setError(null);
      const lineas = Object.entries(cantidades).map(([orden, unidades]) => ({
        orden: parseInt(orden),
        unidades: parseFloat(unidades) || 0,
      }));
      const response = await API.put('/actualizarCantidadesAlbaran', {
        codigoEmpresa: albaran.codigoEmpresa,
        ejercicio: albaran.ejercicio,
        serie: albaran.serie,
        numeroAlbaran: albaran.numero,
        lineas,
        observaciones,
      });
      if (response.data.success) {
        setSuccessMsg('Cantidades actualizadas correctamente');
        setHasChanges(false);
        setObservaciones('');
      } else {
        setError(response.data.mensaje);
      }
    } catch (err) {
      setError('Error al actualizar cantidades: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setLoading(false);
    }
  }, [albaran, cantidades, observaciones, canPerformActionsInRutas]);

  const handleCompletar = useCallback(() => {
    if (!firmasValidas.cliente || !firmasValidas.repartidor) {
      setError(mensajeFirmasObligatorias);
      setActiveTab(1);
      return;
    }
    setConfirmDialogOpen(true);
  }, [firmasValidas, mensajeFirmasObligatorias]);

  const confirmarCompletar = useCallback(async () => {
    setConfirmDialogOpen(false);
    try {
      setLoading(true);
      setError(null);
      const firmaCliente = obtenerFirmaSegura(sigCliente);
      const firmaRepartidor = obtenerFirmaSegura(sigRepartidor);

      if (!firmaCliente || !firmaRepartidor) {
        setError('Ambas firmas son obligatorias');
        return;
      }

      if (hasChanges) {
        const lineas = Object.entries(cantidades).map(([orden, unidades]) => ({
          orden: parseInt(orden),
          unidades: parseFloat(unidades) || 0,
        }));
        await API.put('/actualizarCantidadesAlbaran', {
          codigoEmpresa: albaran.codigoEmpresa,
          ejercicio: albaran.ejercicio,
          serie: albaran.serie,
          numeroAlbaran: albaran.numero,
          lineas,
          observaciones,
        });
      }

      const response = await API.post('/completarAlbaranConFirmas', {
        codigoEmpresa: albaran.codigoEmpresa,
        ejercicio: albaran.ejercicio,
        serie: albaran.serie,
        numeroAlbaran: albaran.numero,
        firmaCliente,
        firmaRepartidor,
        observaciones,
      });

      if (response.data.success) {
        alert(`Albarán ${albaran.albaran} completado correctamente`);
        navigate('/rutas');
      } else {
        setError(response.data.mensaje);
      }
    } catch (err) {
      setError('Error al completar albarán: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setLoading(false);
    }
  }, [albaran, cantidades, observaciones, navigate, obtenerFirmaSegura, hasChanges]);

  const formatFecha = (fecha) => {
    if (!fecha) return 'N/A';
    return new Date(fecha).toLocaleDateString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  };

  // --- Renderizado ---
  if (initialLoading) {
    return (
      <>
        <Container maxWidth="lg" sx={{ py: 3 }}>
          <Skeleton variant="rectangular" width="100%" height={200} sx={{ borderRadius: 2 }} />
          <Skeleton variant="text" sx={{ mt: 2 }} />
          <Skeleton variant="rectangular" width="100%" height={400} sx={{ mt: 2, borderRadius: 2 }} />
        </Container>
        <Navbar />
      </>
    );
  }

  if (!albaran) {
    return (
      <>
        <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
          <Alert severity="error">
            <Typography variant="h6">Error: Albarán no encontrado</Typography>
            <Typography>No se pudo cargar la información del albarán.</Typography>
          </Alert>
          <Button variant="contained" startIcon={<ArrowBackIcon />} onClick={() => navigate('/rutas')} sx={{ mt: 2 }}>
            Volver a Gestión de Rutas
          </Button>
        </Container>
        <Navbar />
      </>
    );
  }

  const headerBadges = (
    <Stack direction="row" spacing={1}>
      {albaran.esParcial && <Chip label="Parcial" color="warning" size="small" />}
      {albaran.esVoluminoso && <Chip label="Voluminoso" color="secondary" size="small" icon={<BuildIcon />} />}
    </Stack>
  );

  return (
    <>
      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 }, px: { xs: 1.5, sm: 2, md: 3 } }}>
        <Paper elevation={2} sx={{ p: { xs: 2, sm: 3, md: 4 }, borderRadius: 3 }}>
          {/* Cabecera */}
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate('/rutas')}>
                Volver
              </Button>
              <Typography variant="h4" component="h1" sx={{ fontWeight: 700, color: theme.palette.primary.main, fontSize: { xs: '1.5rem', sm: '2rem' } }}>
                Albarán {albaran.albaran}
              </Typography>
            </Stack>
            {headerBadges}
          </Stack>

          {/* Información del cliente */}
          <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: 'background.default' }}>
            <Typography variant="h6" gutterBottom fontWeight={600}>Información del Cliente</Typography>
            <Grid container spacing={2}>
              {[
                { label: 'Cliente', value: albaran.cliente },
                { label: 'Dirección', value: albaran.direccion },
                { label: 'Contacto', value: albaran.contacto || 'No especificado' },
                { label: 'Teléfono', value: albaran.telefonoContacto || 'No especificado' },
                { label: 'Obra', value: albaran.nombreObra || albaran.obra || 'No especificada' },
                { label: 'Fecha Albarán', value: formatFecha(albaran.FechaAlbaran) },
                { label: 'Repartidor Asignado', value: albaran.repartidor || 'Sin asignar' },
              ].map((item, idx) => (
                <Grid item xs={12} sm={6} md={4} key={idx}>
                  <Typography variant="body2"><strong>{item.label}:</strong> {item.value}</Typography>
                </Grid>
              ))}
            </Grid>
          </Paper>

          {/* Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={activeTab} onChange={(e, val) => setActiveTab(val)} variant={isMobile ? 'fullWidth' : 'standard'}>
              <Tab label="Artículos" icon={<AssignmentIcon />} iconPosition="start" />
              <Tab label="Firmas" icon={
                <Badge color="success" variant="dot" invisible={!(firmasValidas.cliente && firmasValidas.repartidor)} overlap="circular">
                  <CheckCircleIcon />
                </Badge>
              } iconPosition="start" />
            </Tabs>
          </Box>

          {/* Panel Artículos */}
          <TabPanel value={activeTab} index={0}>
            <Stack spacing={3}>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Artículo</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Cant. Original</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Cant. a Entregar</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {albaran.articulos?.map((art) => (
                      <TableRow key={art.orden}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{art.codigo}</Typography>
                          <Typography variant="caption" color="text.secondary">{art.nombre}</Typography>
                        </TableCell>
                        <TableCell align="right">{art.cantidadOriginal ?? art.cantidad ?? 0}</TableCell>
                        <TableCell align="right">
                          <TextField
                            type="number"
                            size="small"
                            value={cantidades[art.orden] ?? ''}
                            onChange={(e) => handleCantidadChange(art.orden, e.target.value)}
                            disabled={!canPerformActionsInRutas || loading}
                            inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                            sx={{ width: 100 }}
                            variant="outlined"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <TextField
                label="Observaciones"
                multiline
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                disabled={!canPerformActionsInRutas || loading}
                placeholder="Agregar observaciones sobre la entrega..."
                fullWidth
                helperText="Campo opcional"
              />

              {canPerformActionsInRutas && (
                <Stack direction="row" justifyContent="flex-end">
                  <Tooltip title={!hasChanges ? 'No hay cambios pendientes' : 'Actualizar cantidades y observaciones'}>
                    <span>
                      <Button
                        variant="contained"
                        startIcon={loading ? <CircularProgress size={18} /> : <SaveIcon />}
                        onClick={handleActualizarCantidades}
                        disabled={loading || !hasChanges}
                      >
                        Actualizar Cantidades
                      </Button>
                    </span>
                  </Tooltip>
                </Stack>
              )}
            </Stack>
          </TabPanel>

          {/* Panel Firmas */}
          <TabPanel value={activeTab} index={1}>
            <Stack spacing={3}>
              <Alert severity="info" icon={<WarningIcon />}>
                {mensajeFirmasObligatorias}
              </Alert>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <SignatureField
                    title="Cliente"
                    onClear={() => limpiarFirma(sigCliente)}
                    onEnd={handleFirmaEnd}
                    disabled={!canPerformActionsInRutas || loading}
                    isValid={firmasValidas.cliente}
                    infoText={`Nombre: ${albaran.contacto || albaran.cliente} · Fecha: ${new Date().toLocaleDateString('es-ES')}`}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <SignatureField
                    title="Repartidor"
                    onClear={() => limpiarFirma(sigRepartidor)}
                    onEnd={handleFirmaEnd}
                    disabled={!canPerformActionsInRutas || loading}
                    isValid={firmasValidas.repartidor}
                    infoText={`Nombre: ${albaran.repartidor || 'Repartidor'} · Fecha: ${new Date().toLocaleDateString('es-ES')}`}
                  />
                </Grid>
              </Grid>
            </Stack>
          </TabPanel>

          {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>{error}</Alert>}
          <Snackbar open={!!successMsg} autoHideDuration={4000} onClose={() => setSuccessMsg('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
            <Alert severity="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>
          </Snackbar>

          {canPerformActionsInRutas && (
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
              <Tooltip title={!firmasValidas.cliente || !firmasValidas.repartidor ? mensajeFirmasObligatorias : 'Marcar como entregado'}>
                <span>
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    startIcon={loading ? <CircularProgress size={20} /> : <CheckCircleIcon />}
                    onClick={handleCompletar}
                    disabled={loading || !firmasValidas.cliente || !firmasValidas.repartidor}
                    sx={{ minWidth: 220 }}
                  >
                    {loading ? 'Procesando...' : 'Completar Entrega con Firmas'}
                  </Button>
                </span>
              </Tooltip>
            </Box>
          )}
        </Paper>
      </Container>

      <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)}>
        <DialogTitle>Confirmar entrega</DialogTitle>
        <DialogContent>
          <DialogContentText>
            ¿Estás seguro de que quieres marcar el albarán <strong>{albaran.albaran}</strong> como entregado?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)}>Cancelar</Button>
          <Button onClick={confirmarCompletar} variant="contained" autoFocus>Confirmar</Button>
        </DialogActions>
      </Dialog>

      <Navbar />
    </>
  );
};

export default DetalleAlbaran;