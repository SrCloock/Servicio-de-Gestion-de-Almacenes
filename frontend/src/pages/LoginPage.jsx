// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  CircularProgress,
  Alert,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Visibility, VisibilityOff, Login as LoginIcon } from '@mui/icons-material';
import API from '../helpers/api';

const LoginPage = () => {
  const navigate = useNavigate();
  const [credenciales, setCredenciales] = useState({ usuario: '', contrasena: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (campo, valor) => {
    setCredenciales(prev => ({ ...prev, [campo]: valor }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await API.post('/login', credenciales);
      if (data.success) {
        localStorage.setItem('user', JSON.stringify(data.datos));
        navigate('/PedidosScreen');
      } else {
        setError('Usuario o contraseña incorrectos');
      }
    } catch (err) {
      setError('Error de conexión al servidor. Intente más tarde.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Container maxWidth="xs">
        <Paper
          elevation={0}
          variant="outlined"
          sx={{
            p: 3,
            borderRadius: 2,
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <img
              src="/img/logo-ferreteria-luque.png"
              alt="Ferretería Luque"
              style={{ maxWidth: '180px', height: 'auto', marginBottom: '16px' }}
            />
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
              Sistema de Gestión de Almacenes
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} autoComplete="off">
            <TextField
              fullWidth
              size="small"
              label="Usuario"
              variant="outlined"
              margin="normal"
              value={credenciales.usuario}
              onChange={(e) => handleChange('usuario', e.target.value)}
              required
              autoFocus
              sx={{ mb: 1.5 }}
            />

            <TextField
              fullWidth
              size="small"
              label="Contraseña"
              type={showPassword ? 'text' : 'password'}
              variant="outlined"
              margin="normal"
              value={credenciales.contrasena}
              onChange={(e) => handleChange('contrasena', e.target.value)}
              required
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 2 }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={18} /> : <LoginIcon />}
              sx={{
                textTransform: 'none',
                fontSize: '0.85rem',
                py: 0.8,
                mt: 1,
              }}
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión →'}
            </Button>
          </form>
        </Paper>
      </Container>
    </Box>
  );
};

export default LoginPage;