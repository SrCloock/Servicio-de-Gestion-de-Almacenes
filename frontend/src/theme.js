// src/theme.js
import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: {
      main: '#1a365d',      // color primario (navbar, headers)
      dark: '#0d1e3a',
      light: '#2c5282',
      contrastText: '#f8f9fa',
    },
    secondary: {
      main: '#4299e1',      // acento (botones, enlaces)
      contrastText: '#ffffff',
    },
    success: {
      main: '#38a169',
    },
    warning: {
      main: '#ed8936',
    },
    error: {
      main: '#e53e3e',
    },
    info: {
      main: '#4299e1',
    },
    background: {
      default: '#f5f7fa',   // fondo general
      paper: '#ffffff',
    },
    text: {
      primary: '#2d3748',
      secondary: '#495057',
    },
  },
  typography: {
    fontFamily: [
      'Segoe UI',
      'Roboto',
      'system-ui',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Helvetica Neue"',
      'sans-serif',
    ].join(','),
    h2: {
      fontSize: '1.8rem',
      fontWeight: 600,
      color: '#1a365d',
    },
    h3: {
      fontSize: '1.4rem',
      fontWeight: 600,
    },
    body1: {
      fontSize: '0.95rem',
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(to bottom, #1a365d, #0d1e3a)',
          '&:hover': {
            background: 'linear-gradient(to bottom, #2c5282, #1a365d)',
          },
        },
        containedSuccess: {
          background: 'linear-gradient(to bottom, #38a169, #2f855a)',
          '&:hover': {
            background: 'linear-gradient(to bottom, #2f855a, #276749)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          borderRadius: 8,
          transition: 'transform 0.2s, box-shadow 0.2s',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
});