export const getAuthHeader = () => {
  const userData = JSON.parse(localStorage.getItem('user'));
  
  if (!userData) {
    console.error('No se encontraron datos de usuario en localStorage');
    return {};
  }
  
  // Verificar campos críticos
  if (!userData.UsuarioLogicNet || !userData.CodigoEmpresa) {
    console.error('Datos de usuario incompletos:', userData);
    return {};
  }
  
  return {
    usuario: userData.UsuarioLogicNet,
    codigoempresa: userData.CodigoEmpresa.toString()
  };
};