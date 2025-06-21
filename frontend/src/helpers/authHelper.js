import axios from 'axios';

let empresasCache = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

export const getAuthHeader = () => {
  const userString = localStorage.getItem('user');
  
  if (!userString) {
    console.error('No se encontraron datos de usuario en localStorage');
    return {};
  }
  
  try {
    const userData = JSON.parse(userString);
    
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

export const getUserPermisos = () => {
  const userString = localStorage.getItem('user');
  if (!userString) return {};
  
  try {
    const user = JSON.parse(userString);
    const categoria = user.CodigoCategoriaEmpleadoLc || 'Sin categoría';
    
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
    
    empresasCache = response.data;
    lastFetchTime = Date.now();
    
    return response.data;
  } catch (error) {
    console.error('Error al obtener empresas:', error);
    return [];
  }
};

window.addEventListener('storage', (event) => {
  if (event.key === 'user') {
    empresasCache = null;
  }
});