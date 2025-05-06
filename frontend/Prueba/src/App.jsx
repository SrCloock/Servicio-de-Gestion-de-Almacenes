import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import ClientesPage from './pages/ClientesPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
      </Routes>
    </Router>
  );
}

export default App;