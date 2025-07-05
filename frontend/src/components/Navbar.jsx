import React, { useState, useEffect, useRef } from 'react';
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
  FaWarehouse,
  FaTimes,
  FaBars
} from 'react-icons/fa';
import '../styles/Navbar.css';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState(location.pathname);
  const [isScrolled, setIsScrolled] = useState(false);
  const menuRef = useRef(null);

  // Actualizar ruta activa cuando cambia la ubicación
  useEffect(() => {
    setActiveRoute(location.pathname);
  }, [location]);

  // Cerrar menú móvil al cambiar tamaño de ventana
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 992) {
        setIsMobileMenuOpen(false);
      }
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

  // Manejar clics fuera del menú para cerrarlo
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMobileMenuOpen && menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const goTo = (path) => {
    navigate(path);
    closeMobileMenu();
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
            className="mobile-toggle"
            onClick={toggleMobileMenu}
            aria-label={isMobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>

        <div 
          ref={menuRef}
          className={`navbar-links ${isMobileMenuOpen ? 'open' : ''}`}
          aria-hidden={!isMobileMenuOpen}
        >
          {navItems.map((item) => (
            <div 
              key={item.path}
              className={`nav-item ${activeRoute === item.path ? 'active' : ''}`}
              onClick={() => goTo(item.path)}
              tabIndex={isMobileMenuOpen ? 0 : -1}
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