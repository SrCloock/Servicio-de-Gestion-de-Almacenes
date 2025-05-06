import './index.css';
import './styles/style.css'; // Estilos generales del proyecto
import { Routes, Route, Navigate } from 'react-router-dom';
import PedidosScreen from './pages/PedidosScreen';
import LoginPage from './pages/LoginPage';
import ClientesPage from './pages/ClientesPage';
import DashboardPage from './pages/DashboardPage';
import FichaClientePage from './pages/FichaClientePage'; // ⬅️ 🔥 Importar la nueva ficha
import EstadisticasClientePage from './pages/EstadisticasClientePage'; // 👈 Añade esta línea

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<LoginPage />} />
             <Route path="/PedidosScreen" element={<PedidosScreen />} />

      <Route path="/clientes" element={<ClientesPage />} />
      <Route path="/clientes/ficha" element={<FichaClientePage />} /> {/* 🔥 Nueva ruta para ficha */}
      <Route path="/estadisticasCliente" element={<EstadisticasClientePage />} /> {/* 👈 Nueva ruta */}
    </Routes>
  );
}

export default App;
