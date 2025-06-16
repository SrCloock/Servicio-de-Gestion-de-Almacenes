import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './styles/style.css';
import './styles/PedidosScreen.css';
import './styles/TraspasoAlmacenesScreen.css';
import './styles/InventarioScreen.css';
import LoginPage from './pages/LoginPage';
import PedidosScreen from './pages/PedidosScreen';
import ClientesPage from './pages/ClientesPage';
import DashboardPage from './pages/DashboardPage';
import FichaClientePage from './pages/FichaClientePage';
import EstadisticasClientePage from './pages/EstadisticasClientePage';
import TraspasoAlmacenesScreen from './pages/TraspasoAlmacenesScreen';
import PreparacionPedidos from './pages/PreparacionPedidos';
import EntradaStockCompras from './pages/EntradaStockCompras';
import ConfirmacionEntrega from './pages/ConfirmacionEntrega';
import GestionRutas from './pages/GestionRutas';
import DetalleAlbaran from './pages/DetalleAlbaran';
import InventarioScreen from './pages/InventarioScreen';

// Componente para proteger rutas
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
      
      {/* Rutas protegidas */}
      <Route path="/PedidosScreen" element={
        <ProtectedRoute>
          <PedidosScreen />
        </ProtectedRoute>
      } />
      <Route path="/clientes" element={
        <ProtectedRoute>
          <ClientesPage />
        </ProtectedRoute>
      } />
      <Route path="/clientes/ficha" element={
        <ProtectedRoute>
          <FichaClientePage />
        </ProtectedRoute>
      } />
      <Route path="/estadisticasCliente" element={
        <ProtectedRoute>
          <EstadisticasClientePage />
        </ProtectedRoute>
      } />
      <Route path="/traspaso" element={
        <ProtectedRoute>
          <TraspasoAlmacenesScreen />
        </ProtectedRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <DashboardPage />
        </ProtectedRoute>
      } />
      <Route path="/preparacion" element={
        <ProtectedRoute>
          <PreparacionPedidos />
        </ProtectedRoute>
      } />
      <Route path="/entrada" element={
        <ProtectedRoute>
          <EntradaStockCompras />
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
    </Routes>
  );
}

export default App;