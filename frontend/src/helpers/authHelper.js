// src/helpers/authHelper.js - SE MANTIENE EXACTAMENTE IGUAL
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

export const getUserPermisos = () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user) return {};
  
  const categoria = user.CodigoCategoriaEmpleadoLc || 'Sin categoría';
  const esEmpleado = user.CodigoCategoriaCliente_ === 'EMP';
  
  const isAdmin = esEmpleado && (categoria === 'ADM' || categoria === 'Administrador');
  const isRepartidor = esEmpleado && categoria === 'REP';
  
  return {
    CodigoCliente: user.CodigoCliente,
    CodigoCategoriaEmpleadoLc: categoria,
    isAdmin,
    isRepartidor,
    permisos: {
      verPedidos: isAdmin || isRepartidor,
      verTraspasos: true,
      verInventario: true,
      verRutas: true,
      designarRutas: isAdmin,
      verAlbaranesAsignados: isAdmin || isRepartidor,
      verPedidosAsignados: isAdmin || isRepartidor
    }
  };
};