import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Navbar.css';

const Navbar = () => {
  const navigate = useNavigate();

  return (
    <div className="navigation-buttons">
      <button onClick={() => navigate('/rutas')} className="btn-nav">
        <span>📦</span> Rutas
      </button>
      <button onClick={() => navigate('/PedidosScreen')} className="btn-nav">
        <span>📝</span> Pedidos
      </button>
      <button onClick={() => navigate('/traspaso')} className="btn-nav">
        <span>🔄</span> Traspasos
      </button>
      <button onClick={() => navigate('/inventario')} className="btn-nav">
        <span>📊</span> Inventario
      </button>
      <button onClick={() => navigate('/')} className="btn-nav">
        <span>🏠</span> Inicio
      </button>
    </div>
  );
};

export default Navbar;