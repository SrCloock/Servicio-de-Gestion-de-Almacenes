import React, { createContext, useContext, useMemo } from 'react';
import { Navigate } from 'react-router-dom';

const PermissionsContext = createContext();

export const PermissionsProvider = ({ children, user }) => {
  const permissions = useMemo(() => {
    if (!user) return {};
    
    // Roles principales
    const isAdmin = user.StatusAdministrador === -1;
    const isAdvancedUser = user.StatusUsuarioAvanzado === -1;
    const isReadOnly = user.StatusUsuarioConsulta === -1;

    // Permisos individuales
    const hasWaybillsPermission = user.StatusVerAlbaranesAsignados === -1;
    const hasOrdersPermission = user.StatusTodosLosPedidos === -1;
    const hasAssignedOrdersPermission = user.StatusVerPedidosAsignados === -1;
    const hasRoutesPermission = user.StatusDesignarRutas === -1;
    const hasTransfersPermission = user.StatusVerTraspasosAlmacen === -1;
    const hasInventoryPermission = user.StatusVerInventarios === -1;
    const hasReceivingPermission = user.StatusVerRecepcionMercancia === -1;

    // Definición de roles específicos
    const isPreparer = hasOrdersPermission && !isAdmin && !isAdvancedUser;
    const isDelivery = hasWaybillsPermission && !isAdmin && !isAdvancedUser;

    // Permisos agrupados
    const canViewWaybills = isAdmin || isAdvancedUser || isReadOnly || hasWaybillsPermission;
    const canViewAllOrders = isAdmin || isAdvancedUser || isReadOnly || hasOrdersPermission;
    const canViewAssignedOrders = isAdmin || isAdvancedUser || isReadOnly || hasAssignedOrdersPermission;
    const canAssignRoutes = isAdmin || isAdvancedUser || isReadOnly || hasRoutesPermission;
    const canViewTransfers = isAdmin || isAdvancedUser || isReadOnly || hasTransfersPermission;
    const canViewInventory = isAdmin || isAdvancedUser || isReadOnly || hasInventoryPermission;
    const canViewReceiving = isAdmin || isAdvancedUser || isReadOnly || hasReceivingPermission;

    // Permisos específicos para pantalla de pedidos
    const canViewPedidosScreen = isAdmin || isAdvancedUser || isReadOnly || hasOrdersPermission;
    const canPerformActionsInPedidos = !isReadOnly && (isAdmin || isAdvancedUser || hasOrdersPermission);

    // Permiso para asignar pedidos (solo admin y avanzado)
    const canAssignOrders = isAdmin || isAdvancedUser;

    // Nuevos permisos para gestión de albaranes
    const canAssignWaybills = isAdmin || isAdvancedUser || hasRoutesPermission;
    const canManageWaybills = isAdmin || isAdvancedUser || hasWaybillsPermission;

    return {
      // Roles
      isAdmin,
      isAdvancedUser,
      isReadOnly,
      isPreparer,
      isDelivery,

      // Permisos generales
      canViewWaybills,
      canViewAllOrders,
      canViewAssignedOrders,
      canAssignRoutes,
      canViewTransfers,
      canViewInventory,
      canViewReceiving,
      canAssignWaybills,
      canManageWaybills,
      canPerformActions: !isReadOnly && (isAdmin || isAdvancedUser || 
        hasWaybillsPermission ||
        hasOrdersPermission ||
        hasAssignedOrdersPermission ||
        hasRoutesPermission ||
        hasTransfersPermission ||
        hasInventoryPermission ||
        hasReceivingPermission),

      // Permisos específicos para Pedidos
      canViewPedidosScreen,
      canPerformActionsInPedidos,
      canAssignOrders,

      // Nuevos permisos específicos
      canViewGestionRutas: canViewWaybills,
      canPerformActionsInRutas: !isReadOnly && (isAdmin || isAdvancedUser || hasWaybillsPermission),
      canViewPedidosAsignadosScreen: isAdmin || isAdvancedUser,
      canViewAlbaranesAsignadosScreen: isAdmin || isAdvancedUser,
    };
  }, [user]);

  return (
    <PermissionsContext.Provider value={permissions}>
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions debe usarse dentro de un PermissionsProvider');
  }
  return context;
};

export const ProtectedRoute = ({ children, requiredPermissions = [], anyPermission = false }) => {
  const permissions = usePermissions();
  
  // Si no se especifican permisos, permitir acceso
  if (requiredPermissions.length === 0) return children;
  
  // Verificar si se requiere cualquier permiso (OR)
  if (anyPermission) {
    const hasAny = requiredPermissions.some(perm => permissions[perm]);
    return hasAny ? children : <Navigate to="/" replace />;
  }
  
  // Verificar si se requieren todos los permisos (AND)
  const hasAll = requiredPermissions.every(perm => permissions[perm]);
  return hasAll ? children : <Navigate to="/" replace />;
};

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