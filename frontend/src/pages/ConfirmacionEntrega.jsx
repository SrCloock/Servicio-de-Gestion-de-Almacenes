import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
} from '@mui/material';
import { CheckCircle as CheckIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';

const ConfirmacionEntrega = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const theme = useTheme();

  const [pedido, setPedido] = useState(null);
  const [datosCliente, setDatosCliente] = useState({
    nombre: '',
    dni: '',
    firma: '',
  });
  const [confirmado, setConfirmado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Cargar el pedido desde location.state o localStorage
  useEffect(() => {
    const loadPedido = () => {
      if (location.state?.pedido) {
        setPedido(location.state.pedido);
        setLoading(false);
        return;
      }

      try {
        const savedData = JSON.parse(localStorage.getItem('preparacionPedidosData'));
        const foundPedido = savedData?.pedidos?.find(p => p.id?.toString() === id);
        if (foundPedido) {
          setPedido(foundPedido);
        } else {
          setError('Pedido no encontrado');
          setTimeout(() => navigate('/preparacion-pedidos'), 2000);
        }
      } catch {
        setError('Error al cargar el pedido');
        setTimeout(() => navigate('/preparacion-pedidos'), 2000);
      } finally {
        setLoading(false);
      }
    };

    loadPedido();
  }, [id, location.state, navigate]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setDatosCliente(prev => ({ ...prev, [name]: value }));
  };

  const handleConfirmar = () => {
    const { nombre, dni } = datosCliente;
    if (!nombre.trim() || !dni.trim()) {
      alert('Por favor, complete todos los datos requeridos');
      return;
    }

    setConfirmado(true);

    // Simular envío de email (igual que original)
    setTimeout(() => {
      alert(`Resguardo enviado por correo a ${nombre}`);
    }, 1500);
  };

  const volverAPedidos = () => {
    navigate('/preparacion-pedidos');
  };

  const formValido = useMemo(() => {
    const { nombre, dni, firma } = datosCliente;
    return nombre.trim() && dni.trim() && firma.trim();
  }, [datosCliente]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Cargando pedido...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
        <Alert severity="error">{error}</Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/preparacion-pedidos')}
          sx={{ mt: 2 }}
        >
          Volver a Pedidos
        </Button>
      </Box>
    );
  }

  if (!pedido) return null;

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', py: 4, px: { xs: 2, sm: 3 } }}>
      {!confirmado ? (
        <>
          <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
            Confirmación de Entrega
          </Typography>

          <Paper elevation={2} sx={{ p: 3, mb: 4 }}>
            <Typography variant="h6" gutterBottom>Pedido #{pedido.id}</Typography>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">
                  <strong>Cliente:</strong> {pedido.cliente}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">
                  <strong>Fecha:</strong> {pedido.fecha}
                </Typography>
              </Grid>
            </Grid>

            <Typography variant="subtitle1" gutterBottom>Artículos</Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Código</TableCell>
                    <TableCell>Descripción</TableCell>
                    <TableCell align="right">Cantidad</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pedido.articulos?.map((articulo) => (
                    <TableRow key={articulo.id}>
                      <TableCell>{articulo.codigo}</TableCell>
                      <TableCell>{articulo.descripcion}</TableCell>
                      <TableCell align="right">{articulo.cantidad}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper elevation={2} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Datos de Confirmación</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Nombre completo"
                  name="nombre"
                  value={datosCliente.nombre}
                  onChange={handleInputChange}
                  required
                  helperText="Nombre y apellidos del receptor"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="DNI/NIF"
                  name="dni"
                  value={datosCliente.dni}
                  onChange={handleInputChange}
                  required
                  helperText="Documento de identidad"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Firma (nombre)"
                  name="firma"
                  value={datosCliente.firma}
                  onChange={handleInputChange}
                  required
                  helperText="Escriba su nombre como firma"
                />
              </Grid>
            </Grid>

            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={handleConfirmar}
              disabled={!formValido}
              sx={{ mt: 4 }}
            >
              Confirmar Entrega
            </Button>
          </Paper>
        </>
      ) : (
        <Paper
          elevation={3}
          sx={{
            p: 5,
            textAlign: 'center',
            borderLeft: `5px solid ${theme.palette.success.main}`,
          }}
        >
          <CheckIcon sx={{ fontSize: 60, color: theme.palette.success.main, mb: 2 }} />
          <Typography variant="h4" gutterBottom>¡Entrega Confirmada!</Typography>

          <Box sx={{ maxWidth: 400, mx: 'auto', textAlign: 'left', mt: 3 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Pedido:</strong> #{pedido.id}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Cliente:</strong> {pedido.cliente}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Fecha de entrega:</strong> {new Date().toLocaleDateString('es-ES')}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Responsable:</strong> {datosCliente.nombre}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>DNI:</strong> {datosCliente.dni}
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 3, fontStyle: 'italic' }}>
            El resguardo de entrega ha sido enviado por correo electrónico correctamente.
          </Typography>

          <Button variant="outlined" onClick={volverAPedidos} sx={{ mt: 4 }}>
            Volver a Pedidos
          </Button>
        </Paper>
      )}
    </Box>
  );
};

export default ConfirmacionEntrega;