import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  CircularProgress,
  Divider,
} from '@mui/material';
import { CheckCircle as CheckCircleIcon } from '@mui/icons-material';

const ConfirmacionEntrega = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();

  const [pedido, setPedido] = useState(null);
  const [datosCliente, setDatosCliente] = useState({
    nombre: '',
    dni: '',
    firma: '',
  });
  const [confirmado, setConfirmado] = useState(false);

  // Cargar pedido (desde state o localStorage)
  useEffect(() => {
    const loadPedido = () => {
      if (location.state?.pedido) {
        setPedido(location.state.pedido);
        return;
      }

      try {
        const savedData = JSON.parse(localStorage.getItem('preparacionPedidosData'));
        const foundPedido = savedData?.pedidos?.find(p => p.id.toString() === id);
        if (foundPedido) {
          setPedido(foundPedido);
        } else {
          navigate('/preparacion-pedidos');
        }
      } catch {
        navigate('/preparacion-pedidos');
      }
    };
    loadPedido();
  }, [id, location.state, navigate]);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setDatosCliente(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleConfirmar = useCallback(() => {
    const { nombre, dni } = datosCliente;
    if (!nombre.trim() || !dni.trim()) {
      // (Ya está deshabilitado el botón, pero por si acaso)
      return;
    }
    setConfirmado(true);
    setTimeout(() => {
      alert(`Resguardo enviado por correo a ${nombre}`);
    }, 1500);
  }, [datosCliente]);

  const volverAPedidos = useCallback(() => {
    navigate('/preparacion-pedidos');
  }, [navigate]);

  const formValido = useMemo(() => {
    const { nombre, dni, firma } = datosCliente;
    return nombre.trim() && dni.trim() && firma.trim();
  }, [datosCliente]);

  // Tabla de artículos
  const renderTablaArticulos = useMemo(() => {
    if (!pedido?.articulos?.length) return null;
    return (
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'rgba(0, 0, 0, 0.04)' }}>
              <TableCell sx={{ fontWeight: 700 }}>Código</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Descripción</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Cantidad</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pedido.articulos.map((articulo) => (
              <TableRow key={articulo.id}>
                <TableCell>{articulo.codigo}</TableCell>
                <TableCell>{articulo.descripcion}</TableCell>
                <TableCell align="right">{articulo.cantidad}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }, [pedido]);

  // Formulario de firma y datos
  const renderFormulario = useMemo(() => (
    <Stack spacing={2.5}>
      <TextField
        fullWidth
        label="Nombre completo"
        name="nombre"
        value={datosCliente.nombre}
        onChange={handleInputChange}
        placeholder="Nombre y apellidos"
        required
        size="small"
      />
      <TextField
        fullWidth
        label="DNI / NIF"
        name="dni"
        value={datosCliente.dni}
        onChange={handleInputChange}
        placeholder="Documento de identidad"
        required
        size="small"
      />
      <TextField
        fullWidth
        label="Firma (nombre)"
        name="firma"
        value={datosCliente.firma}
        onChange={handleInputChange}
        placeholder="Firme aquí escribiendo su nombre"
        required
        size="small"
        helperText="Escriba su nombre completo como firma digital"
      />
    </Stack>
  ), [datosCliente, handleInputChange]);

  // Mensaje de éxito
  const renderMensajeExito = useMemo(() => (
    <Paper
      elevation={0}
      sx={{
        p: 4,
        textAlign: 'center',
        borderRadius: 4,
        border: '1px solid',
        borderColor: 'success.main',
        bgcolor: 'success.lighter',
        maxWidth: 500,
        mx: 'auto',
      }}
    >
      <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
      <Typography variant="h5" gutterBottom fontWeight={700}>
        ¡Entrega Confirmada!
      </Typography>
      <Divider sx={{ my: 2 }} />
      <Stack spacing={1} alignItems="flex-start" sx={{ mb: 3 }}>
        <Typography variant="body2"><strong>Pedido:</strong> #{pedido.id}</Typography>
        <Typography variant="body2"><strong>Cliente:</strong> {pedido.cliente}</Typography>
        <Typography variant="body2"><strong>Fecha de entrega:</strong> {new Date().toLocaleDateString('es-ES')}</Typography>
        <Typography variant="body2"><strong>Responsable:</strong> {datosCliente.nombre}</Typography>
        <Typography variant="body2"><strong>DNI:</strong> {datosCliente.dni}</Typography>
      </Stack>
      <Alert severity="success" sx={{ mb: 3, textAlign: 'left' }}>
        El resguardo de entrega ha sido enviado por correo electrónico correctamente.
      </Alert>
      <Button variant="contained" onClick={volverAPedidos} size="large">
        Volver a Pedidos
      </Button>
    </Paper>
  ), [pedido, datosCliente, volverAPedidos]);

  if (!pedido) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Cargando pedido...</Typography>
      </Box>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4, px: { xs: 2, sm: 3 } }}>
      {!confirmado ? (
        <Paper elevation={2} sx={{ p: { xs: 2, sm: 3, md: 4 }, borderRadius: 3 }}>
          <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700, color: 'primary.main' }}>
            Confirmación de Entrega
          </Typography>

          {/* Datos del pedido */}
          <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom fontWeight={600}>
              Pedido #{pedido.id}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
              <Typography variant="body2"><strong>Cliente:</strong> {pedido.cliente}</Typography>
              <Typography variant="body2"><strong>Fecha:</strong> {pedido.fecha}</Typography>
            </Stack>
            {renderTablaArticulos}
          </Paper>

          {/* Sección de firma */}
          <Typography variant="h6" gutterBottom fontWeight={600} sx={{ mt: 2 }}>
            Datos de Confirmación
          </Typography>
          {renderFormulario}

          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleConfirmar}
            disabled={!formValido}
            sx={{ mt: 4, py: 1.2, fontSize: '1rem' }}
          >
            Confirmar Entrega
          </Button>
        </Paper>
      ) : (
        renderMensajeExito
      )}
    </Container>
  );
};

export default ConfirmacionEntrega;