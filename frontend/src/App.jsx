import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import PedidosAsignadosScreen from './pages/PedidosAsignadosScreen';
import DesignarRutasScreen from './pages/DesignarRutasScreen';
import { isAuthenticated, getCurrentUser } from './helpers/authHelper';
import Navbar from './components/Navbar';
import UserInfoBar from './components/UserInfoBar';

const ProtectedRoute = ({ children, requiredRole = null }) => {
  const location = useLocation();
  
  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  const user = getCurrentUser();
  
  if (requiredRole) {
    const categoria = user?.CodigoCategoriaEmpleadoLc || '';
    const roleMatches = 
      (requiredRole === 'admin' && (categoria === 'ADM' || categoria === 'Administrador')) ||
      (requiredRole === 'repartidor' && (categoria === 'rep' || categoria === 'Repartidor'));
    
    if (!roleMatches) {
      return <Navigate to="/" replace />;
    }
  }
  
  return (
    <div className="app-layout">
      <UserInfoBar />
      <div className="main-content">
        {children}
      </div>
      <Navbar />
    </div>
  );
};

function App() {
  useEffect(() => {
    const handleEmpresaChange = () => {
      console.log("Empresa cambiada - actualizando contexto de la app");
    };

    window.addEventListener('empresaChanged', handleEmpresaChange);
    
    return () => {
      window.removeEventListener('empresaChanged', handleEmpresaChange);
    };
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<LoginPage />} />
      
      <Route path="/PedidosScreen" element={
        <ProtectedRoute>
          <PedidosScreen />
        </ProtectedRoute>
      } />
      
      <Route path="/pedidos-asignados" element={
        <ProtectedRoute requiredRole="repartidor">
          <PedidosAsignadosScreen />
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
      
      <Route path="/designar-rutas" element={
        <ProtectedRoute>
          <DesignarRutasScreen />
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
        <ProtectedRoute requiredRole="admin">
          <InventarioScreen />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default App;