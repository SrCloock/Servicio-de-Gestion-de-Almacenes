import React, { createContext, useContext, useMemo } from 'react';
import { Navigate } from 'react-router-dom';

const PermissionsContext = createContext();

export const PermissionsProvider = ({ children, user }) => {
  const permissions = useMemo(() => {
    // Roles principales
    const isAdmin = user?.StatusAdministrador === -1;
    const isAdvancedUser = user?.StatusUsuarioAvanzado === -1;
    const isReadOnly = user?.StatusUsuarioConsulta === -1;

    // Permisos individuales
    const hasWaybillsPermission = user?.StatusVerAlbaranesAsignados === -1;
    const hasOrdersPermission = user?.StatusTodosLosPedidos === -1;
    const hasAssignedOrdersPermission = user?.StatusVerPedidosAsignados === -1;
    const hasRoutesPermission = user?.StatusDesignarRutas === -1;
    const hasTransfersPermission = user?.StatusVerTraspasosAlmacen === -1;
    const hasInventoryPermission = user?.StatusVerInventarios === -1;
    const hasReceivingPermission = user?.StatusVerRecepcionMercancia === -1;

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

    // Permiso genérico para acciones (sin ser solo lectura)
    const canPerformActions = (isAdmin || isAdvancedUser ||
                                hasWaybillsPermission ||
                                hasOrdersPermission ||
                                hasAssignedOrdersPermission ||
                                hasRoutesPermission ||
                                hasTransfersPermission ||
                                hasInventoryPermission ||
                                hasReceivingPermission) && !isReadOnly;

    return {
      // Roles
      isAdmin,
      isAdvancedUser,
      isReadOnly,

      // Permisos generales
      canViewWaybills,
      canViewAllOrders,
      canViewAssignedOrders,
      canAssignRoutes,
      canViewTransfers,
      canViewInventory,
      canViewReceiving,
      canPerformActions,

      // Permisos específicos para Pedidos
      canViewPedidosScreen,
      canPerformActionsInPedidos,
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
