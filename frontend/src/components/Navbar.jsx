import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Navbar.css';
import { getUserPermisos } from '../helpers/authHelper';

const Navbar = () => {
  const navigate = useNavigate();
  const permisos = getUserPermisos();
  const isAdmin = permisos.isAdmin;
  const isRepartidor = permisos.isRepartidor;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Cierra menú al cambiar ruta
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const goTo = (path) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  return (
    <nav className="navbar">
      <div className="navbar-header">
        <div className="navbar-logo">📦 App Pedidos</div>
        <button className="hamburger" onClick={toggleMobileMenu}>
          ☰
        </button>
      </div>

      <div className={`navbar-links ${isMobileMenuOpen ? 'open' : ''}`}>
        <button onClick={() => goTo('/rutas')} className="btn-nav"><span>📦</span> Rutas</button>

        {isAdmin && (
          <button onClick={() => goTo('/PedidosScreen')} className="btn-nav"><span>📝</span> Todos los Pedidos</button>
        )}

        {(isAdmin || isRepartidor) && (
          <button onClick={() => goTo('/pedidos-asignados')} className="btn-nav"><span>📋</span> Pedidos Asignados</button>
        )}

        <button onClick={() => goTo('/traspaso')} className="btn-nav"><span>🔄</span> Traspasos</button>
        <button onClick={() => goTo('/inventario')} className="btn-nav"><span>📊</span> Inventario</button>

        {isAdmin && (
          <button onClick={() => goTo('/designar-rutas')} className="btn-nav"><span>👥</span> Designar Rutas</button>
        )}

        {(isAdmin || isRepartidor) && (
          <button onClick={() => goTo('/albaranes-asignados')} className="btn-nav">
            {isAdmin ? <span>📑</span> : <span>📋</span>}
            {isAdmin ? ' Albaranes Asignados' : ' Mis Albaranes'}
          </button>
        )}

        <button onClick={() => goTo('/')} className="btn-nav"><span>🏠</span> Inicio</button>
      </div>
    </nav>
  );
};

export default Navbar;
