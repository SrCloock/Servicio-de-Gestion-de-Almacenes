// src/helpers/api.js - VERSIÓN CORREGIDA PARA PRODUCCIÓN
import axios from 'axios';
import { getAuthHeader } from './authHelper';

class ApiService {
  constructor() {
    this.baseURL = this.getBaseURL();
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
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
    // DEBUG: Mostrar todas las variables disponibles
    console.log('🔍 Variables de entorno disponibles:', {
      MODE: import.meta.env.MODE,
      VITE_API_URL: import.meta.env.VITE_API_URL,
      VITE_PUBLIC_IP: import.meta.env.VITE_PUBLIC_IP,
      PROD: import.meta.env.PROD,
      DEV: import.meta.env.DEV,
      currentHost: window.location.host,
      currentOrigin: window.location.origin
    });

    // ✅ SIEMPRE usar la IP pública en producción
    if (import.meta.env.PROD) {
      const publicIP = import.meta.env.VITE_PUBLIC_IP || '80.24.244.68';
      const port = '3000';
      const productionURL = `http://${publicIP}:${port}`;
      
      console.log('🎯 PRODUCCIÓN - Usando URL:', productionURL);
      return productionURL;
    }
    
    // ✅ Desarrollo: usar variable de entorno o localhost
    if (import.meta.env.DEV) {
      const devURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      console.log('🛠️ DESARROLLO - Usando URL:', devURL);
      return devURL;
    }
    
    // ✅ Fallback seguro
    console.log('⚡ Usando URL por defecto (origen actual)');
    return window.location.origin;
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
            alert('❌ Error de conexión. Verifica:\n1. El servidor backend está ejecutándose\n2. La IP y puerto son correctos\n3. No hay problemas de red o firewall');
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