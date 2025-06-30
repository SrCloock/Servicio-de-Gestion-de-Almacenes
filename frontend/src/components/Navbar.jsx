import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FaRoute, 
  FaClipboardList, 
  FaTruckLoading, 
  FaExchangeAlt, 
  FaBoxes, 
  FaUserFriends, 
  FaFileInvoice, 
  FaHome,
  FaWarehouse
} from 'react-icons/fa';
import '../styles/Navbar.css';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState(location.pathname);
  const [isScrolled, setIsScrolled] = useState(false);

  // Actualizar ruta activa cuando cambia la ubicación
  useEffect(() => {
    setActiveRoute(location.pathname);
  }, [location]);

  // Cerrar menú móvil al cambiar tamaño de ventana
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Efecto de scroll para sombra
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const goTo = (path) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  const navItems = [
    { path: '/rutas', label: 'Rutas', icon: <FaRoute /> },
    { path: '/PedidosScreen', label: 'Todos los Pedidos', icon: <FaClipboardList /> },
    { path: '/pedidos-asignados', label: 'Pedidos Asignados', icon: <FaTruckLoading /> },
    { path: '/traspasos', label: 'Traspasos', icon: <FaExchangeAlt /> },
    { path: '/inventario', label: 'Inventario', icon: <FaBoxes /> },
    { path: '/designar-rutas', label: 'Designar Rutas', icon: <FaUserFriends /> },
    { path: '/albaranes-asignados', label: 'Albaranes Asignados', icon: <FaFileInvoice /> },
    { path: '/', label: 'Inicio', icon: <FaHome /> },
  ];

  return (
    <nav className={`navbar ${isScrolled ? 'scrolled' : ''}`}>
      <div className="navbar-container">
        <div className="navbar-header">
          <div className="navbar-brand" onClick={() => goTo('/')}>
            <div className="logo-icon">
              <FaWarehouse />
            </div>
            <span className="app-name">Gestión de Almacén</span>
          </div>
          
          <button 
            className={`mobile-toggle ${isMobileMenuOpen ? 'open' : ''}`}
            onClick={toggleMobileMenu}
            aria-label={isMobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
          >
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
            <span className="hamburger-line"></span>
          </button>
        </div>

        <div 
          className={`navbar-links ${isMobileMenuOpen ? 'open' : ''}`}
          aria-hidden={!isMobileMenuOpen}
        >
          {navItems.map((item) => (
            <div 
              key={item.path}
              className={`nav-item ${activeRoute === item.path ? 'active' : ''}`}
              onClick={() => goTo(item.path)}
            >
              <div className="nav-icon">{item.icon}</div>
              <span className="nav-label">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;