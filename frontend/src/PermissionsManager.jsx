import React, { createContext, useContext, useMemo } from 'react';
import { Navigate } from 'react-router-dom';

const PermissionsContext = createContext();

// ============================================================
// LÓGICA DE PERMISOS
// ============================================================
//
// ROLES GLOBALES (override total — no hace falta ningún permiso individual):
//   isAdmin        → StatusAdministrador   = -1
//   isAdvancedUser → StatusUsuarioAvanzado = -1
//   → Ambos acceden a TODO, ven TODOS los registros, pueden hacer CUALQUIER acción.
//   → StatusUsuarioConsulta eliminado — ya no existe.
//
// PERMISOS INDIVIDUALES DE PANTALLA:
//   hasOrdersPermission         → StatusTodosLosPedidos        = -1
//     Pantalla: Pedidos de venta
//     Datos: solo ve los pedidos asignados a él (filtro backend por EmpleadoAsignado)
//
//   hasAssignedOrdersPermission → StatusVerPedidosAsignados    = -1
//     Pantalla: Asignar pedidos
//     Datos: ve TODOS los pedidos — puede asignarlos a trabajadores
//
//   hasRoutesPermission         → StatusDesignarRutas          = -1
//     Pantalla: Albaranes / Gestión de rutas
//     Datos: solo ve sus albaranes asignados (filtro backend)
//
//   hasWaybillsPermission       → StatusVerAlbaranesAsignados  = -1
//     Pantalla: Asignar albaranes + Gestión documental
//     Datos: ve TODOS los albaranes — puede asignarlos a repartidores
//
//   hasTransfersPermission      → StatusVerTraspasosAlmacen    = -1
//     Pantalla: Traspasos (sin permiso = pantalla oculta y bloqueada)
//
//   hasInventoryPermission      → StatusVerInventarios         = -1
//     Pantalla: Inventario (sin permiso = pantalla oculta y bloqueada)
//
//   hasReceivingPermission      → StatusVerRecepcionMercancia  = -1
//     Pantalla: Recepción de mercancía (sin permiso = pantalla oculta y bloqueada)

export const PermissionsProvider = ({ children, user }) => {
  const permissions = useMemo(() => {
    if (!user) return {};

    // ── 1. ROLES GLOBALES ──────────────────────────────────────
    const isAdmin        = user.StatusAdministrador   === -1;
    const isAdvancedUser = user.StatusUsuarioAvanzado === -1;

    // Cualquiera de los dos = acceso total sin restricciones
    const isSuperUser = isAdmin || isAdvancedUser;

    // ── 2. PERMISOS INDIVIDUALES ───────────────────────────────
    const hasOrdersPermission         = user.StatusTodosLosPedidos       === -1;
    const hasAssignedOrdersPermission = user.StatusVerPedidosAsignados   === -1;
    const hasRoutesPermission         = user.StatusDesignarRutas         === -1;
    const hasWaybillsPermission       = user.StatusVerAlbaranesAsignados === -1;
    const hasTransfersPermission      = user.StatusVerTraspasosAlmacen   === -1;
    const hasInventoryPermission      = user.StatusVerInventarios        === -1;
    const hasReceivingPermission      = user.StatusVerRecepcionMercancia === -1;

    // ── 3. ACCESO A PANTALLAS ──────────────────────────────────
    // isSuperUser hace override — si lo tiene, ve y usa todas las pantallas.
    const canViewPedidosScreen            = isSuperUser || hasOrdersPermission;
    const canViewAsignacionPedidos        = isSuperUser || hasAssignedOrdersPermission;
    const canViewGestionRutas             = isSuperUser || hasRoutesPermission;
    const canViewAlbaranesAsignadosScreen = isSuperUser || hasWaybillsPermission;
    const canViewDocumentManagement       = isSuperUser || hasWaybillsPermission;
    const canViewTransfers                = isSuperUser || hasTransfersPermission;
    const canViewInventory                = isSuperUser || hasInventoryPermission;
    const canViewReceiving                = isSuperUser || hasReceivingPermission;

    // Aliases legacy usados en algunos componentes
    const canViewAllOrders      = canViewPedidosScreen;
    const canViewWaybills       = canViewGestionRutas;
    const canViewAssignedOrders = canViewAsignacionPedidos;

    // ── 4. FILTRO DE DATOS ─────────────────────────────────────
    // Controla si el backend devuelve TODOS los registros o solo los del usuario.
    // true  → backend devuelve todo
    // false → backend filtra por EmpleadoAsignado = usuario actual
    const canViewAllPedidos   = isSuperUser || hasAssignedOrdersPermission;
    const canViewAllAlbaranes = isSuperUser || hasWaybillsPermission;
    const canViewAllRutas     = isSuperUser || hasWaybillsPermission;

    // ── 5. CAPACIDAD DE ACTUAR ─────────────────────────────────
    // Si tienes acceso a la pantalla, puedes actuar en ella.
    // No hay ReadOnly — ese permiso se elimina.
    const canPerformActions            = canViewPedidosScreen || canViewGestionRutas ||
                                         canViewAsignacionPedidos || canViewAlbaranesAsignadosScreen ||
                                         canViewTransfers || canViewInventory || canViewReceiving;

    const canPerformActionsInPedidos   = canViewPedidosScreen;
    const canPerformActionsInRutas     = canViewGestionRutas;
    const canPerformActionsInTransfers = canViewTransfers;
    const canPerformActionsInInventory = canViewInventory;
    const canPerformActionsInReceiving = canViewReceiving;

    // Asignar pedidos a trabajadores (pantalla de asignación)
    const canAssignOrders   = canViewAsignacionPedidos;
    // Asignar albaranes a repartidores (pantalla de asignación albaranes)
    const canAssignWaybills = canViewAlbaranesAsignadosScreen;
    // Gestionar rutas propias (repartidor — solo las suyas)
    const canManageOwnRoutes = canViewGestionRutas;
    // Asignar rutas a otros trabajadores (requiere permiso de asignación de albaranes)
    const canAssignRoutes   = canViewAlbaranesAsignadosScreen;

    // Revertir albarán: acción destructiva, solo admin/advanced
    const canRevertAlbaran      = isSuperUser;
    // Marcar pedido como completado: quien puede actuar en pedidos
    const canMarkOrderCompleted = canPerformActionsInPedidos;

    return {
      // ROLES
      isAdmin,
      isAdvancedUser,
      isSuperUser,

      // ACCESO A PANTALLAS
      canViewPedidosScreen,
      canViewAsignacionPedidos,
      canViewGestionRutas,
      canViewAlbaranesAsignadosScreen,
      canViewDocumentManagement,
      canViewTransfers,
      canViewInventory,
      canViewReceiving,

      // ALIASES LEGACY
      canViewAllOrders,
      canViewWaybills,
      canViewAssignedOrders,

      // FILTRO DE DATOS
      canViewAllPedidos,
      canViewAllAlbaranes,
      canViewAllRutas,

      // ACCIONES GENERALES
      canPerformActions,

      // ACCIONES POR PANTALLA
      canPerformActionsInPedidos,
      canPerformActionsInRutas,
      canPerformActionsInTransfers,
      canPerformActionsInInventory,
      canPerformActionsInReceiving,

      // ASIGNACIÓN
      canAssignOrders,
      canAssignWaybills,
      canAssignRoutes,
      canManageOwnRoutes,

      // PERMISOS ESPECÍFICOS
      canRevertAlbaran,
      canMarkOrderCompleted,

      // PERMISOS DIRECTOS (útiles para guards muy específicos o debug)
      _hasOrdersPermission:         hasOrdersPermission,
      _hasAssignedOrdersPermission: hasAssignedOrdersPermission,
      _hasRoutesPermission:         hasRoutesPermission,
      _hasWaybillsPermission:       hasWaybillsPermission,
      _hasTransfersPermission:      hasTransfersPermission,
      _hasInventoryPermission:      hasInventoryPermission,
      _hasReceivingPermission:      hasReceivingPermission,
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

// ── Protección de rutas ────────────────────────────────────────────────

export const ProtectedRoute = ({ children, requiredPermissions = [], anyPermission = false }) => {
  const permissions = usePermissions();
  if (requiredPermissions.length === 0) return children;
  if (anyPermission) {
    const hasAny = requiredPermissions.some(perm => permissions[perm]);
    return hasAny ? children : <Navigate to="/" replace />;
  }
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