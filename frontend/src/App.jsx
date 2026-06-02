﻿import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box, Container } from '@mui/material';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import PedidosScreen from './pages/PedidosScreen/PedidosScreen';
import GestionRutas from './pages/GestionRutas';
import DetalleAlbaran from './pages/DetalleAlbaran';
import AsignarPedidosScreen from './pages/AsignarPedidosScreen';
import DesignarRutasScreen from './pages/DesignarRutasScreen';
import AlbaranesAsignadosScreen from './pages/AlbaranesAsignadosScreen';
import TraspasosPage from './pages/TraspasosScreen/TraspasosScreen';
import InventarioPage from './pages/inventario/InventarioPage';
import GestionDocumentalScreen from './pages/GestionDocumentalScreen';
import RecepcionPedidosCompra from './pages/RecepcionPedidosCompra/index';
import { PermissionsProvider, ProtectedRouteWithPermission } from './PermissionsManager';

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const userData = JSON.parse(localStorage.getItem('user'));
  if (!userData) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
};

function App() {
  const location = useLocation();
  const userData = JSON.parse(localStorage.getItem('user'));
  const showNavbar = userData && location.pathname !== '/login';

  return (
    <PermissionsProvider user={userData}>
      {showNavbar && <Navbar />}

      <Box
        component="main"
        sx={{
          pt: { xs: '56px', sm: '64px' },
          bgcolor: 'background.default',
          minHeight: '100vh',
          width: '100%',
          maxWidth: '100%',
          overflowX: 'hidden',
        }}
      >
        <Container maxWidth={false} disableGutters>
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Pedidos de venta — StatusTodosLosPedidos */}
            <Route path="/PedidosScreen" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewPedidosScreen">
                  <PedidosScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            {/* Asignación de pedidos — StatusVerPedidosAsignados */}
            <Route path="/pedidos-asignados" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewAsignacionPedidos">
                  <AsignarPedidosScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            {/* Albaranes / Gestión de rutas — StatusDesignarRutas */}
            <Route path="/rutas" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewGestionRutas">
                  <GestionRutas />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            {/* Detalle albarán — mismo permiso que rutas */}
            <Route path="/detalle-albaran" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewGestionRutas">
                  <DetalleAlbaran />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            {/* Asignar albaranes — StatusVerAlbaranesAsignados */}
            <Route path="/albaranes-asignados" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewAlbaranesAsignadosScreen">
                  <AlbaranesAsignadosScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            {/* Designar rutas — StatusVerAlbaranesAsignados (misma pantalla de asignación) */}
            <Route path="/designar-rutas" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewAlbaranesAsignadosScreen">
                  <DesignarRutasScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            {/* Gestión documental — StatusVerAlbaranesAsignados */}
            <Route path="/gestion-documental" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewDocumentManagement">
                  <GestionDocumentalScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            {/* Traspasos — StatusVerTraspasosAlmacen */}
            <Route path="/traspasos" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewTransfers">
                  <TraspasosPage />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            {/* Inventario — StatusVerInventarios */}
            <Route path="/inventario" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewInventory">
                  <InventarioPage />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            {/* Recepción de mercancía — StatusVerRecepcionMercancia */}
            <Route path="/recepcion-pedidos-compra" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewReceiving">
                  <RecepcionPedidosCompra />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />
          </Routes>
        </Container>
      </Box>
    </PermissionsProvider>
  );
}

export default App;