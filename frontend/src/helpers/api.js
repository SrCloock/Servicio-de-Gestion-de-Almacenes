// src/helpers/api.js
import axios from 'axios';
import { getAuthHeader } from './authHelper';

// Determinar la URL base según el entorno
const getBaseURL = () => {
  // En desarrollo: usar localhost
  // En producción: usar la URL del servidor o ruta relativa
  if (import.meta.env.DEV) {
    return 'http://localhost:3000';
  } else {
    // En producción, puedes usar una variable de entorno o una ruta relativa
    return import.meta.env.VITE_API_URL || '/api';
  }
};

// Crear instancia de Axios configurada
const API = axios.create({
  baseURL: getBaseURL(),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Interceptor para agregar automáticamente los headers de autenticación (usando TU sistema)
API.interceptors.request.use(
  (config) => {
    const authHeaders = getAuthHeader();
    if (authHeaders && authHeaders.usuario && authHeaders.codigoempresa) {
      config.headers.usuario = authHeaders.usuario;
      config.headers.codigoempresa = authHeaders.codigoempresa;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores globalmente
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado o inválido - redirigir al login
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default API;