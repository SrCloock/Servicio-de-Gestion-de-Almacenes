// =========================================================
// ✅ src/helpers/api.js - VERSIÓN CORREGIDA PARA PRODUCCIÓN
// =========================================================

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
    
    console.log('🔧 API configurada para PRODUCCIÓN:', {
      baseURL: this.baseURL
    });
  }

  getBaseURL() {
    // ✅ EN PRODUCCIÓN: Usar siempre la IP pública
    return 'http://84.120.61.159:3000';
  }

  setupInterceptors() {
    this.api.interceptors.request.use(
      (config) => {
        const authHeaders = getAuthHeader();
        if (authHeaders?.usuario && authHeaders?.codigoempresa) {
          config.headers.usuario = authHeaders.usuario;
          config.headers.codigoempresa = authHeaders.codigoempresa;
        }
        return config;
      },
      (error) => {
        console.error('❌ [API Request Error]', error);
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        console.error('❌ [API Response Error]', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message
        });

        if (error.response?.status === 401) {
          localStorage.removeItem('user');
          window.location.href = '/login';
        }

        if (error.code === 'ERR_NETWORK') {
          console.error('🌐 Error de conexión con el backend');
          alert('❌ Error de conexión con el servidor. Verifica que el backend esté ejecutándose.');
        }

        return Promise.reject(error);
      }
    );
  }

  getInstance() {
    return this.api;
  }
}

// =========================================================
// ✅ EXPORTACIÓN CORREGIDA - Singleton con export default
// =========================================================
const apiService = new ApiService();
const API = apiService.getInstance();

export default API;

// También exportamos la clase si se necesita en otros lugares
export { ApiService };