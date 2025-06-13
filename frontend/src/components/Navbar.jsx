import React from 'react';
import { useNavigate } from 'react-router-dom';

const Navbar = () => {
  const navigate = useNavigate();

  return (
    <div className="navigation-buttons">
      <button onClick={() => navigate('/rutas')} className="btn-nav">
        📦 Rutas
      </button>
      <button onClick={() => navigate('/PedidosScreen')} className="btn-nav">
        📝 Pedidos
      </button>
      <button onClick={() => navigate('/traspaso')} className="btn-nav">
        🔄 Traspasos
      </button>
      <button onClick={() => navigate('/inventario')} className="btn-nav">
        📊 Inventario
      </button>
      <button onClick={() => navigate('/')} className="btn-nav">
        🏠 Inicio
      </button>
    </div>
  );
};

export default Navbar;