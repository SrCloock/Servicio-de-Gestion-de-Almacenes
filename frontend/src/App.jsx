import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './styles/style.css';
import './styles/PedidosScreen.css';
import './styles/DesignarRutasScreen.css';
import LoginPage from './pages/LoginPage';
import PedidosScreen from './pages/PedidosScreen';
import ConfirmacionEntrega from './pages/ConfirmacionEntrega';
import GestionRutas from './pages/GestionRutas';
import DetalleAlbaran from './pages/DetalleAlbaran';
import PedidosAsignadosScreen from './pages/PedidosAsignadosScreen';
import DesignarRutasScreen from './pages/DesignarRutasScreen';
import AlbaranesAsignadosScreen from './pages/AlbaranesAsignadosScreen';
import TraspasosPage from './pages/TraspasosPage';
import InventarioPage from './pages/InventarioPage'; // Nueva página de inventario
import { getUserPermisos } from './helpers/authHelper';

// ============================================
// ✅ COMPONENTE: RUTA PROTEGIDA
// ============================================
/**
 * Componente que protege rutas requiriendo autenticación
 * 
 * @param {Object} props - Propiedades del componente
 * @param {React.ReactNode} props.children - Componentes hijos a renderizar
 * @returns {React.ReactNode} Componente protegido o redirección a login
 */
const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const userData = JSON.parse(localStorage.getItem('user'));
  
  if (!userData) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return children;
};

// ============================================
// ✅ COMPONENTE PRINCIPAL: APP
// ============================================
/**
 * Componente principal de la aplicación que define las rutas
 * 
 * @returns {React.ReactNode} Estructura de rutas de la aplicación
 */
function App() {
  return (
    <Routes>
      {/* ============================================ */}
      {/* ✅ RUTAS PÚBLICAS                            */}
      {/* ============================================ */}
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<LoginPage />} />

      {/* ============================================ */}
      {/* ✅ RUTAS PROTEGIDAS                          */}
      {/* ============================================ */}
      {/* --- PEDIDOS --- */}
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

      {/* --- TRASPASOS --- */}
      <Route path="/traspasos" element={
        <ProtectedRoute>
          <TraspasosPage />
        </ProtectedRoute>
      } />

      {/* --- INVENTARIO --- */}
      <Route path="/inventario" element={
        <ProtectedRoute>
          <InventarioPage /> {/* Nueva página de inventario */}
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default App;