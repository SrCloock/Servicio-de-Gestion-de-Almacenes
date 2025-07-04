﻿import React from 'react';
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
      {showNavbar && <Navbar />}
      
      <div className="content-container">
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<LoginPage />} />

          <Route path="/PedidosScreen" element={
            <ProtectedRoute>
              <PedidosScreen />
            </ProtectedRoute>
          } />
          
          <Route path="/designar-rutas" element={
            <ProtectedRoute>
              <DesignarRutasScreen />
            </ProtectedRoute>
          } />
          
          <Route path="/rutas" element={
            <ProtectedRoute>
              <GestionRutas />
            </ProtectedRoute>
          } />
          
          <Route path="/confirmacion-entrega" element={
            <ProtectedRoute>
              <ConfirmacionEntrega />
            </ProtectedRoute>
          } />
          
          <Route path="/detalle-albaran" element={
            <ProtectedRoute>
              <DetalleAlbaran />
            </ProtectedRoute>
          } />
          
          <Route path="/pedidos-asignados" element={
            <ProtectedRoute>
              <PedidosAsignadosScreen />
            </ProtectedRoute>
          } />
          
          <Route path="/albaranes-asignados" element={
            <ProtectedRoute>
              <AlbaranesAsignadosScreen />
            </ProtectedRoute>
          } />

          <Route path="/traspasos" element={
            <ProtectedRoute>
              <TraspasosPage />
            </ProtectedRoute>
          } />

          <Route path="/inventario" element={
            <ProtectedRoute>
              <InventarioPage />
            </ProtectedRoute>
          } />
        </Routes>
      </div>
    </div>
  );
}

export default App;