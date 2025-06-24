import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './styles/style.css';
import './styles/PedidosScreen.css';
import './styles/TraspasoAlmacenesScreen.css';
import './styles/InventarioScreen.css';
import './styles/DesignarRutasScreen.css';
import LoginPage from './pages/LoginPage';
import PedidosScreen from './pages/PedidosScreen';
import TraspasoAlmacenesScreen from './pages/TraspasoAlmacenesScreen';
import ConfirmacionEntrega from './pages/ConfirmacionEntrega';
import GestionRutas from './pages/GestionRutas';
import DetalleAlbaran from './pages/DetalleAlbaran';
import InventarioScreen from './pages/InventarioScreen';
import PedidosAsignadosScreen from './pages/PedidosAsignadosScreen';
import DesignarRutasScreen from './pages/DesignarRutasScreen';
import AlbaranesAsignadosScreen from './pages/AlbaranesAsignadosScreen';
import { getUserPermisos } from './helpers/authHelper';

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const userData = JSON.parse(localStorage.getItem('user'));
  
  if (!userData) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return children;
};

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<LoginPage />} />
      
      {/* Rutas para todos los usuarios autenticados */}
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
      
      <Route path="/traspaso" element={
        <ProtectedRoute>
          <TraspasoAlmacenesScreen />
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
      
      <Route path="/inventario" element={
        <ProtectedRoute>
          <InventarioScreen />
        </ProtectedRoute>
      } />
      
      <Route path="/pedidos-asignados" element={
        <ProtectedRoute>
          <PedidosAsignadosScreen  />
        </ProtectedRoute>
      } />
      
      <Route path="/albaranes-asignados" element={
        <ProtectedRoute>
          <AlbaranesAsignadosScreen />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default App;