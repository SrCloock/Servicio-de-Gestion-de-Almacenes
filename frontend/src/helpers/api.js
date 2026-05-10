import axios from 'axios';
import { getAuthHeader } from './authHelper';

class ApiService {
  constructor() {
    this.baseURL = this.getBaseURL();
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  getBaseURL() {
    const configuredApiUrl = (import.meta.env.VITE_API_URL || '').trim();

    if (configuredApiUrl) {
      return configuredApiUrl;
    }

    return window.location.origin;
  }

  setupInterceptors() {
    this.api.interceptors.request.use(
      (config) => {
        const authHeaders = getAuthHeader();
        if (authHeaders && authHeaders.usuario && authHeaders.codigoempresa) {
          config.headers.usuario = authHeaders.usuario;
          config.headers.codigoempresa = authHeaders.codigoempresa;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.code === 'ERR_CANCELED' || error.message === 'canceled') {
          return Promise.reject(error);
        }

        console.error('[API Response Error]', {
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          status: error.response?.status,
          message: error.message,
          code: error.code
        });

        if (error.response?.status === 401) {
          localStorage.removeItem('user');
          window.location.href = '/login';
        }

        if (error.code === 'NETWORK_ERROR' || error.code === 'ECONNREFUSED') {
          console.error('[Network Error]', {
            baseURL: this.baseURL,
            currentHost: window.location.host,
            error: error.message
          });
        }

        return Promise.reject(error);
      }
    );
  }

  getInstance() {
    return this.api;
  }

  async diagnostic() {
    try {
      const response = await this.api.get('/diagnostic');
      return response.data;
    } catch (error) {
      console.error('Error en diagnostico:', error);
      throw error;
    }
  }
}

const apiService = new ApiService();
export default apiService.getInstance();
export { ApiService };
