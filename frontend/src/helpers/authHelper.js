import axios from 'axios';

// Cache para almacenar las empresas
let empresasCache = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

export const getAuthHeader = () => {
  const userString = localStorage.getItem('user');
  
  if (!userString) {
    console.error('No se encontraron datos de usuario en localStorage');
    return {};
  }
  
  try {
    const userData = JSON.parse(userString);
    
    // Verificar campos críticos
    if (!userData.UsuarioLogicNet || !userData.CodigoEmpresa) {
      console.error('Datos de usuario incompletos:', userData);
      return {};
    }
    
    return {
      usuario: userData.UsuarioLogicNet,
      codigoempresa: userData.CodigoEmpresa.toString()
    };
  } catch (e) {
    console.error('Error al parsear datos de usuario:', e);
    return {};
  }
};

// Función para obtener permisos del usuario actual
export const getUserPermisos = () => {
  const userString = localStorage.getItem('user');
  if (!userString) return {};
  
  try {
    const user = JSON.parse(userString);
    const categoria = user.CodigoCategoriaEmpleadoLc || 'Sin categoría';
    
    // Lógica simplificada para determinar permisos
    return {
      isAdmin: categoria === 'ADM' || categoria === 'Administrador',
      isRepartidor: categoria === 'rep' || categoria === 'Repartidor'
    };
  } catch (e) {
    console.error('Error al obtener permisos:', e);
    return {};
  }
};

export const isAuthenticated = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user'));
    return !!user && !!user.UsuarioLogicNet && !!user.CodigoEmpresa;
  } catch (e) {
    return false;
  }
};

export const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch (e) {
    return null;
  }
};

export const logout = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('permisos');
  window.location.href = '/login';
};

export const getEmpresas = async () => {
  // Devolver datos de caché si son recientes
  if (empresasCache && Date.now() - lastFetchTime < CACHE_DURATION) {
    return empresasCache;
  }

  try {
    const headers = getAuthHeader();
    if (!headers.usuario || !headers.codigoempresa) {
      return [];
    }

    const response = await axios.get('http://localhost:3000/empresas', {
      headers: headers
    });
    
    // Actualizar caché
    empresasCache = response.data;
    lastFetchTime = Date.now();
    
    return response.data;
  } catch (error) {
    console.error('Error al obtener empresas:', error);
    return [];
  }
};

// Limpiar caché cuando cambia el usuario
window.addEventListener('storage', (event) => {
  if (event.key === 'user') {
    empresasCache = null;
  }
});