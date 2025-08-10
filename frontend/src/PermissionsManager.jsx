import React, { createContext, useContext, useMemo } from 'react';
import { Navigate } from 'react-router-dom';

const PermissionsContext = createContext();

export const PermissionsProvider = ({ children, user }) => {
  const permissions = useMemo(() => {
    if (!user) return {};
    
    // 1. ROLES PRINCIPALES
    const isAdmin = user.StatusAdministrador === -1;
    const isAdvancedUser = user.StatusUsuarioAvanzado === -1;
    const isReadOnly = user.StatusUsuarioConsulta === -1;

    // 2. PERMISOS INDIVIDUALES
    const hasWaybillsPermission = user.StatusVerAlbaranesAsignados === -1;
    const hasOrdersPermission = user.StatusTodosLosPedidos === -1;
    const hasAssignedOrdersPermission = user.StatusVerPedidosAsignados === -1;
    const hasRoutesPermission = user.StatusDesignarRutas === -1;
    const hasTransfersPermission = user.StatusVerTraspasosAlmacen === -1;
    const hasInventoryPermission = user.StatusVerInventarios === -1;
    const hasReceivingPermission = user.StatusVerRecepcionMercancia === -1;

    // 3. ROLES ESPECÍFICOS
    const isPreparer = hasOrdersPermission && !isAdmin && !isAdvancedUser;
    const isDelivery = hasWaybillsPermission && !isAdmin && !isAdvancedUser;

    // 4. PERMISOS AGRUPADOS
    const canViewWaybills = isAdmin || isAdvancedUser || isReadOnly || hasWaybillsPermission;
    const canViewAllOrders = isAdmin || isAdvancedUser || isReadOnly || hasOrdersPermission;
    const canViewAssignedOrders = isAdmin || isAdvancedUser || isReadOnly || hasAssignedOrdersPermission;
    const canAssignRoutes = isAdmin || isAdvancedUser || isReadOnly || hasRoutesPermission;
    const canViewTransfers = isAdmin || isAdvancedUser || isReadOnly || hasTransfersPermission;
    const canViewInventory = isAdmin || isAdvancedUser || isReadOnly || hasInventoryPermission;
    const canViewReceiving = isAdmin || isAdvancedUser || isReadOnly || hasReceivingPermission;
    const canPerformActions = !isReadOnly && (isAdmin || isAdvancedUser || 
      hasWaybillsPermission ||
      hasOrdersPermission ||
      hasAssignedOrdersPermission ||
      hasRoutesPermission ||
      hasTransfersPermission ||
      hasInventoryPermission ||
      hasReceivingPermission);

    // 5. PERMISOS PARA PANTALLAS ESPECÍFICAS
    // Pantalla de Pedidos
    const canViewPedidosScreen = isAdmin || isAdvancedUser || isReadOnly || hasOrdersPermission;
    const canPerformActionsInPedidos = !isReadOnly && (isAdmin || isAdvancedUser || hasOrdersPermission);
    const canAssignOrders = isAdmin || isAdvancedUser;
    
    // Pantalla de Gestión de Rutas
    const canViewGestionRutas = canViewWaybills;
    const canPerformActionsInRutas = !isReadOnly && (isAdmin || isAdvancedUser || hasWaybillsPermission);
    
    // Pantalla de Albaranes Asignados
    const canViewAlbaranesAsignadosScreen = canAssignRoutes;
    
    // Permisos para asignación
    const canAssignWaybills = isAdmin || isAdvancedUser || hasRoutesPermission;

    // 6. NUEVO PERMISO: Gestión Documental (solo para admin y usuario avanzado)
    const canViewDocumentManagement = isAdmin || isAdvancedUser;

    return {
      // ROLES
      isAdmin,
      isAdvancedUser,
      isReadOnly,
      isPreparer,
      isDelivery,

      // PERMISOS GENERALES
      canViewWaybills,
      canViewAllOrders,
      canViewAssignedOrders,
      canAssignRoutes,
      canViewTransfers,
      canViewInventory,
      canViewReceiving,
      canPerformActions,
      
      // PERMISOS PARA PANTALLAS
      canViewPedidosScreen,
      canPerformActionsInPedidos,
      canAssignOrders,
      canViewGestionRutas,
      canPerformActionsInRutas,
      canViewAlbaranesAsignadosScreen,
      canAssignWaybills,

      // NUEVO PERMISO PARA GESTIÓN DOCUMENTAL
      canViewDocumentManagement
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