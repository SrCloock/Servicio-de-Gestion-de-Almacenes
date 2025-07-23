// src/PermissionsManager.js
import React, { createContext, useContext, useMemo } from 'react';

// Crear contexto de permisos
const PermissionsContext = createContext();

export const PermissionsProvider = ({ children, user }) => {
  // Calcular permisos basados en campos del usuario
  const permissions = useMemo(() => {
    const isAdmin = user?.StatusAdministrador === -1;
    const isAdvancedUser = user?.StatusUsuarioAvanzado === -1;
    const isReadOnly = user?.StatusUsuarioConsulta === -1;
    
    return {
      // Permisos de roles principales
      isAdmin,
      isAdvancedUser,
      isReadOnly,
      
      // Permisos específicos
      canViewAllOrders: isAdmin || isAdvancedUser || user?.StatusTodosLosPedidos === -1,
      canViewAssignedOrders: isAdmin || isAdvancedUser || user?.StatusVerPedidosAsignados === -1,
      canAssignRoutes: isAdmin || isAdvancedUser || user?.StatusDesignarRutas === -1,
      canViewWaybills: isAdmin || isAdvancedUser || user?.StatusVerAlbaranesAsignados === -1,
      canViewTransfers: isAdmin || isAdvancedUser || user?.StatusVerTraspasosAlmacen === -1,
      canViewInventory: isAdmin || isAdvancedUser || user?.StatusVerInventarios === -1,
      canViewReceiving: isAdmin || isAdvancedUser || user?.StatusVerRecepcionMercancia === -1,
      
      // Permisos para acciones específicas
      canPerformActions: !isReadOnly && (isAdmin || isAdvancedUser)
    };
  }, [user]);

  return (
    <PermissionsContext.Provider value={permissions}>
      {children}
    </PermissionsContext.Provider>
  );
};

// Hook para acceder a los permisos
export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions debe usarse dentro de un PermissionsProvider');
  }
  return context;
};

// Componente para proteger rutas basadas en permisos
export const ProtectedRouteWithPermission = ({ children, requiredPermission }) => {
  const permissions = usePermissions();
  
  if (requiredPermission && !permissions[requiredPermission]) {
    return (
      <div className="no-permission">
        <h2>Acceso restringido</h2>
        <p>No tienes permiso para acceder a esta sección.</p>
      </div>
    );
  }
  
  return children;
};