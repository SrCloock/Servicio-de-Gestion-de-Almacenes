import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Box,
  CircularProgress,
  Alert,
  Grid,
  useTheme,
} from '@mui/material';
import { Clear as ClearIcon, Save as SaveIcon, Cancel as CancelIcon } from '@mui/icons-material';
import API from '../helpers/api';
import { usePermissions } from '../PermissionsManager';
import Navbar from '../components/Navbar';

function FirmaScreen() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { state } = useLocation();
  const albaran = state?.albaran;
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [firmasValidas, setFirmasValidas] = useState({
    cliente: false,
    repartidor: false,
  });
  const mensajeFirmasObligatorias = 'Debes registrar ambas firmas antes de completar el albarán';

  const { canPerformActions } = usePermissions();

  const sigCliente = useRef();
  const sigRepartidor = useRef();

  const obtenerFirmaSegura = (signatureRef) => {
    if (!signatureRef.current) return null;
    try {
      return signatureRef.current.getTrimmedCanvas().toDataURL('image/png');
    } catch {
      return null;
    }
  };

  const firmaEstaVacia = (firmaDataURL) => {
    return (
      !firmaDataURL ||
      firmaDataURL.length < 1000 ||
      firmaDataURL === 'data:,' ||
      !firmaDataURL.startsWith('data:image/png')
    );
  };

  const actualizarEstadoFirmas = () => {
    setFirmasValidas({
      cliente: !firmaEstaVacia(obtenerFirmaSegura(sigCliente)),
      repartidor: !firmaEstaVacia(obtenerFirmaSegura(sigRepartidor)),
    });
  };

  const limpiarFirmaCliente = () => {
    if (sigCliente.current) {
      sigCliente.current.clear();
      actualizarEstadoFirmas();
    }
  };

  const limpiarFirmaRepartidor = () => {
    if (sigRepartidor.current) {
      sigRepartidor.current.clear();
      actualizarEstadoFirmas();
    }
  };

  const finalizarFirma = async () => {
    const firmaCliente = obtenerFirmaSegura(sigCliente);
    const firmaRepartidor = obtenerFirmaSegura(sigRepartidor);

    if (firmaEstaVacia(firmaCliente) || firmaEstaVacia(firmaRepartidor)) {
      alert(mensajeFirmasObligatorias);
      return;
    }

    setLoading(true);
    try {
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
        alert(`Albarán ${albaran.albaran} completado correctamente con firmas`);
        navigate('/rutas');
      } else {
        alert(`Error: ${response.data.mensaje}`);
      }
    } catch (error) {
      console.error('Error completando albarán con firmas:', error);
      alert(`Error: ${error.response?.data?.mensaje || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Renderizado condicional por permisos
  if (!canPerformActions) {
    return (
      <>
        <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="h6">Acceso restringido</Typography>
            <Typography>No tienes permiso para acceder a esta sección.</Typography>
          </Alert>
          <Button variant="contained" onClick={() => navigate('/rutas')} startIcon={<CancelIcon />}>
            Volver a gestión de rutas
          </Button>
        </Container>
        <Navbar />
      </>
    );
  }

  if (!albaran) {
    return (
      <>
        <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="h6">Error: Albarán no encontrado</Typography>
            <Typography>No se encontró información del albarán para firmar.</Typography>
          </Alert>
          <Button variant="contained" onClick={() => navigate('/rutas')} startIcon={<CancelIcon />}>
            Volver a gestión de rutas
          </Button>
        </Container>
        <Navbar />
      </>
    );
  }

  return (
    <>
      <Container maxWidth="lg" sx={{ py: 4, px: { xs: 1.5, sm: 2, md: 3 } }}>
        <Paper elevation={2} sx={{ p: { xs: 2, sm: 3, md: 4 }, borderRadius: 3 }}>
          {/* Cabecera */}
          <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700, color: theme.palette.primary.main }}>
            Registro de Entrega - Albarán {albaran.albaran}
          </Typography>

          {/* Información del albarán */}
          <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.02)' }}>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2"><strong>Cliente:</strong> {albaran.cliente}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2"><strong>Dirección:</strong> {albaran.direccion}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2"><strong>Obra:</strong> {albaran.obra || 'No especificada'}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2"><strong>Contacto:</strong> {albaran.contacto || 'No especificado'}</Typography>
              </Grid>
            </Grid>
          </Paper>

          {/* Sección de firmas (responsive: apiladas en móvil, lado a lado en escritorio) */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            {/* Firma Cliente */}
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="h6" fontWeight={600}>
                    Firma del Cliente
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<ClearIcon />}
                    onClick={limpiarFirmaCliente}
                    disabled={loading}
                    variant="outlined"
                  >
                    Limpiar
                  </Button>
                </Stack>
                <SignatureCanvas
                  penColor="black"
                  canvasProps={{
                    style: {
                      width: '100%',
                      height: 180,
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: theme.shape.borderRadius,
                      backgroundColor: '#fff',
                    },
                  }}
                  ref={sigCliente}
                  onEnd={actualizarEstadoFirmas}
                />
              </Paper>
            </Grid>

            {/* Firma Repartidor */}
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="h6" fontWeight={600}>
                    Firma del Repartidor
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<ClearIcon />}
                    onClick={limpiarFirmaRepartidor}
                    disabled={loading}
                    variant="outlined"
                  >
                    Limpiar
                  </Button>
                </Stack>
                <SignatureCanvas
                  penColor="black"
                  canvasProps={{
                    style: {
                      width: '100%',
                      height: 180,
                      border: `1px solid ${theme.palette.divider}`,
                      borderRadius: theme.shape.borderRadius,
                      backgroundColor: '#fff',
                    },
                  }}
                  ref={sigRepartidor}
                  onEnd={actualizarEstadoFirmas}
                />
              </Paper>
            </Grid>
          </Grid>

          {/* Observaciones */}
          <TextField
            fullWidth
            label="Observaciones de la Entrega"
            multiline
            rows={3}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Ingrese cualquier observación sobre la entrega (opcional)"
            disabled={loading}
            sx={{ mb: 3 }}
          />

          {/* Alerta si faltan firmas */}
          {(!firmasValidas.cliente || !firmasValidas.repartidor) && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {mensajeFirmasObligatorias}
            </Alert>
          )}

          {/* Botones de acción */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
            <Button
              variant="outlined"
              startIcon={<CancelIcon />}
              onClick={() => navigate('/rutas')}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
              onClick={finalizarFirma}
              disabled={loading || !firmasValidas.cliente || !firmasValidas.repartidor}
              sx={{ minWidth: 180 }}
            >
              {loading ? 'Guardando...' : 'Guardar Firmas y Completar Entrega'}
            </Button>
          </Stack>
        </Paper>
      </Container>
      <Navbar />
    </>
  );
}

export default FirmaScreen;