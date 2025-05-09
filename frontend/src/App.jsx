﻿import './index.css';
import './styles/style.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import PedidosScreen from './pages/PedidosScreen';
import LoginPage from './pages/LoginPage';
import ClientesPage from './pages/ClientesPage';
import DashboardPage from './pages/DashboardPage';
import FichaClientePage from './pages/FichaClientePage';
import EstadisticasClientePage from './pages/EstadisticasClientePage';
import TraspasoAlmacenesScreen from './pages/TraspasoAlmacenesScreen';
import PreparacionPedidos from './pages/PreparacionPedidos';
import EntradaStockCompras from './pages/EntradaStockCompras';
import ConfirmacionEntrega from './pages/ConfirmacionEntrega';


function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/PedidosScreen" element={<PedidosScreen />} />
      <Route path="/clientes" element={<ClientesPage />} />
      <Route path="/clientes/ficha" element={<FichaClientePage />} />
      <Route path="/estadisticasCliente" element={<EstadisticasClientePage />} />
      <Route path="/traspaso" element={<TraspasoAlmacenesScreen />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/preparacion" element={<PreparacionPedidos />} />
      <Route path="/entrada" element={<EntradaStockCompras />} />
      <Route path="/confirmacion-entrega" element={<ConfirmacionEntrega />} />
    </Routes>
  );
}

export default App;
