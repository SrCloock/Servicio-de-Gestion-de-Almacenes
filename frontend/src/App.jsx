// src/App.js
import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import PedidosScreen from './pages/PedidosScreen';
import ConfirmacionEntrega from './pages/ConfirmacionEntrega';
import GestionRutas from './pages/GestionRutas';
import DetalleAlbaran from './pages/DetalleAlbaran';
import PedidosAsignadosScreen from './pages/PedidosAsignadosScreen';
import DesignarRutasScreen from './pages/DesignarRutasScreen';
import AlbaranesAsignadosScreen from './pages/AlbaranesAsignadosScreen';
import TraspasosPage from './pages/TraspasosPage';
import InventarioPage from './pages/InventarioPage';
import { PermissionsProvider, ProtectedRouteWithPermission, usePermissions } from './PermissionsManager';

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
    <div className="app-container">
      <PermissionsProvider user={userData}>
        {showNavbar && <Navbar />}
        
        <div className="content-container">
          <Routes>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Pantalla de Pedidos */}
            <Route path="/PedidosScreen" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewAllOrders">
                  <PedidosScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />
            
            {/* Designar rutas */}
            <Route path="/designar-rutas" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canAssignRoutes">
                  <DesignarRutasScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />
            
            {/* Gestión de rutas */}
            <Route path="/rutas" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewWaybills">
                  <GestionRutas />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />
            
            {/* Confirmación de entrega */}
            <Route path="/confirmacion-entrega" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewWaybills">
                  <ConfirmacionEntrega />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />
            
            {/* Detalle de albarán */}
            <Route path="/detalle-albaran" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewWaybills">
                  <DetalleAlbaran />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />
            
            {/* Pedidos asignados */}
            <Route path="/pedidos-asignados" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewAssignedOrders">
                  <PedidosAsignadosScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />
            
            {/* Albaranes asignados */}
            <Route path="/albaranes-asignados" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewWaybills">
                  <AlbaranesAsignadosScreen />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            {/* Traspasos */}
            <Route path="/traspasos" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewTransfers">
                  <TraspasosPage />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />

            {/* Inventario */}
            <Route path="/inventario" element={
              <ProtectedRoute>
                <ProtectedRouteWithPermission requiredPermission="canViewInventory">
                  <InventarioPage />
                </ProtectedRouteWithPermission>
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </PermissionsProvider>
    </div>
  );
}

export default App;