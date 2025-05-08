import './index.css';
import './styles/style.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import PedidosScreen from './pages/PedidosScreen';
import LoginPage from './pages/LoginPage';
import ClientesPage from './pages/ClientesPage';
import DashboardPage from './pages/DashboardPage';
import FichaClientePage from './pages/FichaClientePage';
import EstadisticasClientePage from './pages/EstadisticasClientePage';
import EntradaStockCompras from './pages/EntradaStockCompras';
import PreparacionPedidos from './pages/PreparacionPedidos';
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
      <Route path="/entrada-stock" element={<EntradaStockCompras />} />
      <Route path="/preparacion-pedidos" element={<PreparacionPedidos />} />
      <Route path="/confirmar-entrega/:id" element={<ConfirmacionEntrega />} />
    </Routes>
  );
}

export default App;