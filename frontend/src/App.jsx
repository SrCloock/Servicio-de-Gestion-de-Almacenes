﻿// src/App.jsx
import React from 'react';
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
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <PermissionsProvider user={userData}>
        {showNavbar && <Navbar />}
        <Container
          component="main"
          maxWidth={false}
          sx={{
            flexGrow: 1,
            py: showNavbar ? 3 : 0,
            px: { xs: 2, sm: 3, md: 4 },
            mt: showNavbar ? '70px' : 0, // altura de la navbar fija
          }}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Pedidos */}
            <Route
              path="/PedidosScreen"
              element={
                <ProtectedRoute>
                  <ProtectedRouteWithPermission requiredPermission="canViewPedidosScreen">
                    <PedidosScreen />
                  </ProtectedRouteWithPermission>
                </ProtectedRoute>
              }
            />

            {/* Designar rutas */}
            <Route
              path="/designar-rutas"
              element={
                <ProtectedRoute>
                  <ProtectedRouteWithPermission requiredPermission="canAssignRoutes">
                    <DesignarRutasScreen />
                  </ProtectedRouteWithPermission>
                </ProtectedRoute>
              }
            />

            {/* Gestión de rutas */}
            <Route
              path="/rutas"
              element={
                <ProtectedRoute>
                  <ProtectedRouteWithPermission requiredPermission="canViewWaybills">
                    <GestionRutas />
                  </ProtectedRouteWithPermission>
                </ProtectedRoute>
              }
            />

            {/* Confirmación de entrega */}
            <Route
              path="/confirmacion-entrega"
              element={
                <ProtectedRoute>
                  <ProtectedRouteWithPermission requiredPermission="canViewWaybills">
                    <ConfirmacionEntrega />
                  </ProtectedRouteWithPermission>
                </ProtectedRoute>
              }
            />

            {/* Detalle de albarán */}
            <Route
              path="/detalle-albaran"
              element={
                <ProtectedRoute>
                  <ProtectedRouteWithPermission requiredPermission="canViewWaybills">
                    <DetalleAlbaran />
                  </ProtectedRouteWithPermission>
                </ProtectedRoute>
              }
            />

            {/* Pedidos asignados */}
            <Route
              path="/pedidos-asignados"
              element={
                <ProtectedRoute>
                  <ProtectedRouteWithPermission requiredPermission="canViewAssignedOrders">
                    <AsignarPedidosScreen />
                  </ProtectedRouteWithPermission>
                </ProtectedRoute>
              }
            />

            {/* Albaranes asignados */}
            <Route
              path="/albaranes-asignados"
              element={
                <ProtectedRoute>
                  <ProtectedRouteWithPermission requiredPermission="canViewWaybills">
                    <AlbaranesAsignadosScreen />
                  </ProtectedRouteWithPermission>
                </ProtectedRoute>
              }
            />

            {/* Traspasos */}
            <Route
              path="/traspasos"
              element={
                <ProtectedRoute>
                  <ProtectedRouteWithPermission requiredPermission="canViewTransfers">
                    <TraspasosPage />
                  </ProtectedRouteWithPermission>
                </ProtectedRoute>
              }
            />

            {/* Inventario */}
            <Route
              path="/inventario"
              element={
                <ProtectedRoute>
                  <ProtectedRouteWithPermission requiredPermission="canViewInventory">
                    <InventarioPage />
                  </ProtectedRouteWithPermission>
                </ProtectedRoute>
              }
            />

            {/* Gestión Documental */}
            <Route
              path="/gestion-documental"
              element={
                <ProtectedRoute>
                  <ProtectedRouteWithPermission requiredPermission="canViewDocumentManagement">
                    <GestionDocumentalScreen />
                  </ProtectedRouteWithPermission>
                </ProtectedRoute>
              }
            />

            {/* Recepción de Pedidos de Compra */}
            <Route
              path="/recepcion-pedidos-compra"
              element={
                <ProtectedRoute>
                  <ProtectedRouteWithPermission requiredPermission="canViewInventory">
                    <RecepcionPedidosCompra />
                  </ProtectedRouteWithPermission>
                </ProtectedRoute>
              }
            />
          </Routes>
        </Container>
      </PermissionsProvider>
    </Box>
  );
}

export default App;