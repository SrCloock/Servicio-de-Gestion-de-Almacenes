// src/helpers/api.js - VERSIÓN MEJORADA MULTI-ENTORNO
import axios from 'axios';
import { getAuthHeader } from './authHelper';

class ApiService {
  constructor() {
    this.baseURL = this.getBaseURL();
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 segundos para producción
      headers: {
        'Content-Type': 'application/json',
      }
    });

    this.setupInterceptors();
    
    console.log('🔧 API Configurada:', {
      baseURL: this.baseURL,
      environment: import.meta.env.MODE,
      apiUrl: import.meta.env.VITE_API_URL
    });
  }

  getBaseURL() {
    // Debug: mostrar todas las variables de entorno disponibles
    console.log('🔍 Variables de entorno:', {
      MODE: import.meta.env.MODE,
      VITE_API_URL: import.meta.env.VITE_API_URL,
      PROD: import.meta.env.PROD,
      DEV: import.meta.env.DEV,
      currentHost: window.location.host
    });

    // Si estamos en desarrollo y tenemos la variable VITE_API_URL
    if (import.meta.env.DEV) {
      return import.meta.env.VITE_API_URL || 'http://localhost:3000';
    }
    
    // En producción
    if (import.meta.env.PROD) {
      // Intentar usar la variable de entorno primero
      const envUrl = import.meta.env.VITE_API_URL;
      if (envUrl) {
        console.log('🎯 Usando VITE_API_URL:', envUrl);
        return envUrl;
      }
      
      // Fallback: usar la URL actual
      const currentUrl = window.location.origin;
      console.log('🔁 Fallback a current origin:', currentUrl);
      return currentUrl;
    }
    
    // Default
    console.log('⚡ Usando URL por defecto');
    return 'http://localhost:3000';
  }

  setupInterceptors() {
    // Request interceptor
    this.api.interceptors.request.use(
      (config) => {
        const authHeaders = getAuthHeader();
        if (authHeaders && authHeaders.usuario && authHeaders.codigoempresa) {
          config.headers.usuario = authHeaders.usuario;
          config.headers.codigoempresa = authHeaders.codigoempresa;
        }
        
        console.log(`🚀 [API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ [API Request Error]', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response) => {
        console.log(`✅ [API] ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('❌ [API Response Error]', {
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          status: error.response?.status,
          message: error.message,
          code: error.code
        });

        if (error.response?.status === 401) {
          console.warn('🔐 No autorizado, redirigiendo a login...');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        
        // Manejo específico para problemas de CORS/red
        if (error.code === 'NETWORK_ERROR' || error.code === 'ECONNREFUSED') {
          console.error('🌐 [Network Error] Verifica:', {
            baseURL: this.baseURL,
            currentHost: window.location.host,
            error: error.message
          });
          
          // Mostrar alerta amigable al usuario
          if (!window.location.pathname.includes('/login')) {
            alert('❌ Error de conexión. Verifica:\n1. El servidor está ejecutándose\n2. La IP y puerto son correctos\n3. No hay problemas de red');
          }
        }

        return Promise.reject(error);
      }
    );
  }

  getInstance() {
    return this.api;
  }
  
  // Método para diagnóstico
  async diagnostic() {
    try {
      const response = await this.api.get('/api/diagnostic');
      return response.data;
    } catch (error) {
      console.error('❌ Error en diagnóstico:', error);
      throw error;
    }
  }
}

// Singleton instance
const apiService = new ApiService();
export default apiService.getInstance();

// Exportar la clase para uso avanzado
export { ApiService };