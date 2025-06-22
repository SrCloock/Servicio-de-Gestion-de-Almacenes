import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import UserInfoBar from './components/UserInfoBar';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner';
import './styles/GlobalStyles.css';

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const PedidosScreen = React.lazy(() => import('./pages/PedidosScreen'));
const PedidosAsignadosScreen = React.lazy(() => import('./pages/PedidosAsignadosScreen'));
const InventarioScreen = React.lazy(() => import('./pages/InventarioScreen'));
const GestionRutas = React.lazy(() => import('./pages/GestionRutas'));
const DetalleAlbaran = React.lazy(() => import('./pages/DetalleAlbaran'));
const TraspasoAlmacenesScreen = React.lazy(() => import('./pages/TraspasoAlmacenesScreen'));

function App() {
  return (
    <Router>
      <div className="app-container">
        <UserInfoBar />
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={
              <Suspense fallback={<LoadingSpinner />}>
                <Dashboard />
              </Suspense>
            } />
            <Route path="/PedidosScreen" element={
              <Suspense fallback={<LoadingSpinner />}>
                <PedidosScreen />
              </Suspense>
            } />
            <Route path="/pedidos-asignados" element={
              <Suspense fallback={<LoadingSpinner />}>
                <PedidosAsignadosScreen />
              </Suspense>
            } />
            <Route path="/inventario" element={
              <Suspense fallback={<LoadingSpinner />}>
                <InventarioScreen />
              </Suspense>
            } />
            <Route path="/rutas" element={
              <Suspense fallback={<LoadingSpinner />}>
                <GestionRutas />
              </Suspense>
            } />
            <Route path="/detalle-albaran" element={
              <Suspense fallback={<LoadingSpinner />}>
                <DetalleAlbaran />
              </Suspense>
            } />
            <Route path="/traspaso" element={
              <Suspense fallback={<LoadingSpinner />}>
                <TraspasoAlmacenesScreen />
              </Suspense>
            } />
          </Route>
        </Routes>
        <Navbar />
      </div>
    </Router>
  );
}

export default App;