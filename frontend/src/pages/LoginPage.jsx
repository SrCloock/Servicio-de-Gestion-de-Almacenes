// src/pages/LoginPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  CircularProgress,
  useTheme,
} from '@mui/material';
import { keyframes } from '@emotion/react';
import API from '../helpers/api';

// Animaciones (sin cambios)
const gradientMove = keyframes`
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
`;
const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(40px); }
  to { opacity: 1; transform: translateY(0); }
`;
const float = keyframes`
  0% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-20px) rotate(180deg); }
  100% { transform: translateY(0px) rotate(360deg); }
`;
const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const LoginPage = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const [credenciales, setCredenciales] = useState({ usuario: '', contrasena: '' });
  const [loading, setLoading] = useState(false);

  // Generar partículas flotantes (igual)
  useEffect(() => {
    const container = document.querySelector('.particles-container');
    if (!container) return;
    const numParticles = 30;
    const particles = [];
    for (let i = 0; i < numParticles; i++) {
      const particle = document.createElement('div');
      const size = Math.random() * 8 + 4;
      particle.style.position = 'absolute';
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.backgroundColor = `rgba(255, 255, 255, ${Math.random() * 0.3 + 0.1})`;
      particle.style.borderRadius = '50%';
      particle.style.top = `${Math.random() * 100}%`;
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.animation = `${float} ${Math.random() * 15 + 8}s infinite ease-in-out`;
      particle.style.animationDelay = `${Math.random() * 5}s`;
      container.appendChild(particle);
      particles.push(particle);
    }
    return () => particles.forEach(p => p.remove());
  }, []);

  const handleChange = (campo, valor) => {
    setCredenciales(prev => ({ ...prev, [campo]: valor }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await API.post('/login', credenciales);
      if (data.success) {
        localStorage.setItem('user', JSON.stringify(data.datos));
        navigate('/PedidosScreen');
      } else {
        alert('Usuario o contraseña incorrectos');
      }
    } catch {
      alert('Error de conexión al servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        position: 'fixed',  // Ocupa toda la pantalla sin márgenes
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 40%, ${theme.palette.secondary.main} 100%)`,
        backgroundSize: '200% 200%',
        animation: `${gradientMove} 12s ease infinite`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: { xs: 2, sm: 3, md: 4 },
      }}
    >
      {/* Contenedor de partículas */}
      <Box
        className="particles-container"
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      />

      <Paper
        elevation={24}
        sx={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          maxWidth: { xs: '90%', sm: 450, md: 480 },
          padding: { xs: 3, sm: 4, md: 5 },
          borderRadius: 4,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          transition: 'transform 0.3s, box-shadow 0.3s',
          '&:hover': {
            transform: 'translateY(-5px)',
            boxShadow: '0 30px 50px rgba(0,0,0,0.3)',
          },
          animation: `${fadeInUp} 0.8s cubic-bezier(0.2, 0.9, 0.4, 1.1) forwards`,
          textAlign: 'center',
        }}
      >
        <Box
          sx={{
            mb: 2,
            position: 'relative',
            '&::after': {
              content: '""',
              position: 'absolute',
              bottom: -10,
              left: '20%',
              width: '60%',
              height: 3,
              background: `linear-gradient(90deg, transparent, ${theme.palette.primary.main}, transparent)`,
              borderRadius: 3,
            },
          }}
        >
          <img
            src="/img/logo-ferreteria-luque.png"
            alt="Ferretería Luque"
            style={{
              maxWidth: '180px',
              width: '70%',
              height: 'auto',
              marginBottom: '8px',
            }}
          />
          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              color: theme.palette.primary.main,
              mb: 0.5,
            }}
          >
            Bienvenido
          </Typography>
        </Box>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 4, fontSize: '0.9rem' }}
        >
          Ingresa tus credenciales para acceder al sistema
        </Typography>

        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            margin="normal"
            label="Usuario"
            variant="outlined"
            value={credenciales.usuario}
            onChange={(e) => handleChange('usuario', e.target.value)}
            required
            autoFocus
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                transition: 'all 0.2s',
                '&:hover fieldset': {
                  borderColor: theme.palette.primary.main,
                },
              },
              animation: `${fadeInUp} 0.6s 0.2s forwards`,
              opacity: 0,
              animationFillMode: 'forwards',
            }}
          />
          <TextField
            fullWidth
            margin="normal"
            label="Contraseña"
            type="password"
            variant="outlined"
            value={credenciales.contrasena}
            onChange={(e) => handleChange('contrasena', e.target.value)}
            required
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                transition: 'all 0.2s',
                '&:hover fieldset': {
                  borderColor: theme.palette.primary.main,
                },
              },
              animation: `${fadeInUp} 0.6s 0.3s forwards`,
              opacity: 0,
              animationFillMode: 'forwards',
            }}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={loading}
            sx={{
              mt: 4,
              py: 1.2,
              fontSize: '1rem',
              fontWeight: 600,
              borderRadius: 2,
              background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              backgroundSize: '200% auto',
              animation: `${shimmer} 3s linear infinite`,
              transition: 'transform 0.2s',
              '&:hover': {
                transform: 'scale(1.02)',
                background: `linear-gradient(90deg, ${theme.palette.primary.dark}, ${theme.palette.secondary.dark})`,
              },
              animationDelay: '0.5s',
              opacity: 0,
              animationFillMode: 'forwards',
            }}
          >
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              'Iniciar Sesión →'
            )}
          </Button>
        </form>

        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Sistema de Gestión de Almacenes v2.0
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};

export default LoginPage;