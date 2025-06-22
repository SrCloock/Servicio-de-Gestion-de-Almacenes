import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/Navbar.css';

const Navbar = () => {
  const location = useLocation();
  
  const navItems = [
    { path: '/dashboard', label: 'Inicio', icon: '🏠' },
    { path: '/PedidosScreen', label: 'Pedidos', icon: '📋' },
    { path: '/pedidos-asignados', label: 'Mis Pedidos', icon: '📦' },
    { path: '/inventario', label: 'Inventario', icon: '📊' },
    { path: '/traspaso', label: 'Traspasos', icon: '🔄' },
    { path: '/rutas', label: 'Rutas', icon: '🗺️' },
    { path: '/designar-rutas', label: 'Designar', icon: '👤' },
    { path: '/confirmacion-entrega', label: 'Entregas', icon: '✅' },
  ];

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {navItems.map((item) => (
          <Link 
            key={item.path}
            to={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            aria-label={item.label}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
};

export default React.memo(Navbar);