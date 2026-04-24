﻿import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box, Container } from '@mui/material';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import PedidosScreen from './pages/PedidosScreen';
import ConfirmacionEntrega from './pages/ConfirmacionEntrega';
import GestionRutas from './pages/GestionRutas';
import DetalleAlbaran from './pages/DetalleAlbaran';
import AsignarPedidosScreen from './pages/AsignarPedidosScreen';
import DesignarRutasScreen from './pages/DesignarRutasScreen';
import AlbaranesAsignadosScreen from './pages/AlbaranesAsignadosScreen';
import TraspasosPage from './pages/TraspasosPage';
import InventarioPage from './pages/InventarioPage';
import GestionDocumentalScreen from './pages/GestionDocumentalScreen';
import RecepcionPedidosCompra from './pages/RecepcionPedidosCompra';
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
      
      {/* Contenido principal con padding superior para compensar el AppBar fijo */}
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

            <Route path="/PedidosScreen" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewPedidosScreen">
                  <PedidosScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            <Route path="/designar-rutas" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canAssignRoutes">
                  <DesignarRutasScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            <Route path="/rutas" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewWaybills">
                  <GestionRutas />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            <Route path="/confirmacion-entrega" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewWaybills">
                  <ConfirmacionEntrega />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            <Route path="/detalle-albaran" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewWaybills">
                  <DetalleAlbaran />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            <Route path="/pedidos-asignados" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewAssignedOrders">
                  <AsignarPedidosScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            <Route path="/albaranes-asignados" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewWaybills">
                  <AlbaranesAsignadosScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            <Route path="/traspasos" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewTransfers">
                  <TraspasosPage />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            <Route path="/inventario" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewInventory">
                  <InventarioPage />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            <Route path="/gestion-documental" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewDocumentManagement">
                  <GestionDocumentalScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            <Route path="/recepcion-pedidos-compra" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewInventory">
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
