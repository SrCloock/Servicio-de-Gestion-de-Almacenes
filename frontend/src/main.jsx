import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import App from './App';
import { ClienteConfigProvider } from './config/ClienteConfigContext';

// Tema profesional, claro y limpio
const theme = createTheme({
  palette: {
    primary: {
      main: '#2c7da0',
      light: '#61a5c2',
      dark: '#1f5068',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#f4a261',
      light: '#f6b87e',
      dark: '#e76f51',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
    text: {
      primary: '#0f172a',
      secondary: '#475569',
    },
    divider: '#e2e8f0',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
    htmlFontSize: 16,
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
    h1: { fontSize: '1.8rem', fontWeight: 600 },
    h2: { fontSize: '1.5rem', fontWeight: 600 },
    h3: { fontSize: '1.3rem', fontWeight: 600 },
    h4: { fontSize: '1.1rem', fontWeight: 500 },
    h5: { fontSize: '1rem',   fontWeight: 500 },
    h6: { fontSize: '0.9rem', fontWeight: 500 },
    body1: { fontSize: '0.875rem', lineHeight: 1.5 },
    body2: { fontSize: '0.8rem',   lineHeight: 1.5 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { padding: '8px 16px', fontSize: '0.8rem', borderRadius: 10, minHeight: 40 },
        sizeSmall: { padding: '6px 12px', fontSize: '0.7rem', minHeight: 32 },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#2c7da0',
          backgroundImage: 'linear-gradient(135deg, #2c7da0 0%, #1f5068 100%)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded:    { borderRadius: 16 },
        outlined:   { borderColor: '#e2e8f0' },
        elevation1: { boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)' },
      },
    },
    MuiCard: {
      styleOverrides: { root: { borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 18, width: 'min(100%, 960px)', maxWidth: 'calc(100vw - 24px)', margin: 12 },
      },
    },
    MuiDialogTitle:   { styleOverrides: { root: { padding: '20px 24px 12px' } } },
    MuiDialogContent: { styleOverrides: { root: { padding: '20px 24px' } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px 20px' } } },
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
      styleOverrides: { root: { '& .MuiOutlinedInput-root': { borderRadius: 10 } } },
    },
    MuiFormControl: { defaultProps: { size: 'small' } },
    MuiSelect: {
      styleOverrides: { root: { backgroundColor: '#fff', borderRadius: 10 } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { padding: '8px 12px', fontSize: '0.8rem', borderBottomColor: '#e2e8f0' },
        head: { fontWeight: 700, backgroundColor: '#f1f5f9', color: '#0f172a' },
      },
    },
    MuiTableContainer: {
      styleOverrides: { root: { borderRadius: 14, width: '100%', maxWidth: '100%' } },
    },
    MuiToolbar: {
      styleOverrides: {
        regular: { minHeight: 56, '@media (min-width:600px)': { minHeight: 56 } },
      },
    },
    MuiIconButton: { styleOverrides: { root: { padding: 6 } } },
    MuiAlert:      { styleOverrides: { root: { borderRadius: 12 } } },
    MuiChip:       { styleOverrides: { root: { fontWeight: 600, maxWidth: '100%', borderRadius: 8 } } },
    MuiCssBaseline: {
      styleOverrides: {
        html:  { width: '100%', maxWidth: '100%', overflowX: 'hidden' },
        body:  { width: '100%', maxWidth: '100%', overflowX: 'hidden', backgroundColor: '#f8fafc' },
        '#root': { width: '100%', maxWidth: '100%', overflowX: 'hidden' },
        img:   { maxWidth: '100%', height: 'auto' },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        {/* ClienteConfigProvider envuelve toda la app para que cualquier
            componente pueda usar useClienteConfig() */}
        <ClienteConfigProvider>
          <App />
        </ClienteConfigProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);