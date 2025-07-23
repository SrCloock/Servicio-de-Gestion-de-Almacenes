// src/components/Navbar.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  FaBars,
  FaBuilding,
  FaChevronDown
} from 'react-icons/fa';
import { getAuthHeader } from '../helpers/authHelper';
import { usePermissions } from '../PermissionsManager';
import '../styles/Navbar.css';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const permissions = usePermissions();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState(location.pathname);
  const [isScrolled, setIsScrolled] = useState(false);
  const [empresas, setEmpresas] = useState([]);
  const [user, setUser] = useState(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const menuRef = useRef(null);
  const mobileToggleRef = useRef(null);
  const selectorRef = useRef(null);

  // Cargar usuario al montar
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  // Actualizar ruta activa cuando cambia la ubicación
  useEffect(() => {
    setActiveRoute(location.pathname);
  }, [location]);

  // Cerrar menú móvil y selector al cambiar tamaño de ventana
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 992) {
        closeMobileMenu();
      } else {
        setIsSelectorOpen(false);
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

  // Manejar clics fuera del menú
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Cerrar menú móvil
      if (isMobileMenuOpen && menuRef.current && !menuRef.current.contains(event.target) && 
          event.target !== mobileToggleRef.current) {
        closeMobileMenu();
      }
      
      // Cerrar selector de empresa
      if (isSelectorOpen && selectorRef.current && !selectorRef.current.contains(event.target)) {
        setIsSelectorOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen, isSelectorOpen]);

  // Obtener lista de empresas
  useEffect(() => {
    const fetchEmpresas = async () => {
      if (!user) return;
      
      try {
        const headers = getAuthHeader();
        const response = await axios.get(
          'http://localhost:3000/empresas',
          { headers }
        );
        setEmpresas(response.data);
      } catch (error) {
        console.error('Error al obtener empresas:', error);
      }
    };
    
    if (user) {
      fetchEmpresas();
    }
  }, [user]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
    setIsSelectorOpen(false);
  };

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
    setTimeout(() => {
      if (mobileToggleRef.current) {
        mobileToggleRef.current.focus();
      }
    }, 10);
  }, []);

  const goTo = (path) => {
    navigate(path);
    closeMobileMenu();
  };

  const toggleSelector = () => {
    setIsSelectorOpen(!isSelectorOpen);
  };

  const handleEmpresaChange = (empresa) => {
    const updatedUser = {...user, CodigoEmpresa: empresa.CodigoEmpresa};
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
    setIsSelectorOpen(false);
    window.location.reload();
  };

  // Definición de elementos de navegación con permisos
  const navItems = [
    { 
      path: '/', 
      label: 'Inicio', 
      icon: <FaHome />,
      visible: true // Siempre visible
    },
    { 
      path: '/rutas', 
      label: 'Albaranes', 
      icon: <FaRoute />,
      visible: permissions.canViewWaybills
    },
    { 
      path: '/PedidosScreen', 
      label: 'Todos los Pedidos', 
      icon: <FaClipboardList />,
      visible: permissions.canViewAllOrders
    },
    { 
      path: '/pedidos-asignados', 
      label: 'Pedidos Asignados', 
      icon: <FaTruckLoading />,
      visible: permissions.canViewAssignedOrders
    },
    { 
      path: '/traspasos', 
      label: 'Traspasos', 
      icon: <FaExchangeAlt />,
      visible: permissions.canViewTransfers
    },
    { 
      path: '/inventario', 
      label: 'Inventario', 
      icon: <FaBoxes />,
      visible: permissions.canViewInventory
    },
    { 
      path: '/designar-rutas', 
      label: 'Designar Rutas', 
      icon: <FaUserFriends />,
      visible: permissions.canAssignRoutes
    },
    { 
      path: '/albaranes-asignados', 
      label: 'Albaranes Asignados', 
      icon: <FaFileInvoice />,
      visible: permissions.canViewWaybills
    },
  ];

  // Filtrar elementos visibles según permisos
  const visibleNavItems = navItems.filter(item => item.visible);
  
  // Mostrar solo si hay al menos 2 elementos visibles
  if (visibleNavItems.length < 2) return null;

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
          
          <div className="navbar-center">
            <div className="nav-items-container">
              {visibleNavItems.map((item) => (
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
          
          <div className="navbar-right">
            {/* Selector de empresa */}
            {user && (
              <div className="empresa-selector-container" ref={selectorRef}>
                <div 
                  className="selector-header"
                  onClick={toggleSelector}
                >
                  <FaBuilding className="empresa-icon" />
                  <span className="selected-empresa">
                    {user.CodigoEmpresa || 'Seleccionar'}
                  </span>
                  <FaChevronDown className={`selector-arrow ${isSelectorOpen ? 'open' : ''}`} />
                </div>
                
                {isSelectorOpen && (
                  <div className="empresa-selector-dropdown">
                    {empresas.map(empresa => (
                      <div 
                        key={empresa.CodigoEmpresa}
                        className={`empresa-option ${user.CodigoEmpresa === empresa.CodigoEmpresa ? 'selected' : ''}`}
                        onClick={() => handleEmpresaChange(empresa)}
                      >
                        <span className="empresa-codigo">{empresa.CodigoEmpresa}</span>
                        <span className="empresa-nombre">{empresa.Empresa}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <button 
              ref={mobileToggleRef}
              className="mobile-toggle"
              onClick={toggleMobileMenu}
              aria-label={isMobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <FaTimes /> : <FaBars />}
            </button>
          </div>
        </div>

        {/* Menú móvil */}
        <div 
          ref={menuRef}
          className={`mobile-menu ${isMobileMenuOpen ? 'open' : ''}`}
          aria-hidden={!isMobileMenuOpen}
        >
          {visibleNavItems.map((item) => (
            <div 
              key={item.path}
              className={`mobile-nav-item ${activeRoute === item.path ? 'active' : ''}`}
              onClick={() => goTo(item.path)}
              tabIndex={isMobileMenuOpen ? 0 : -1}
            >
              <div className="mobile-nav-icon">{item.icon}</div>
              <span className="mobile-nav-label">{item.label}</span>
            </div>
          ))}
          
          {user && (
            <div className="mobile-user-section">
              <div className="mobile-empresa-selector-container">
                <FaBuilding className="mobile-empresa-icon" />
                <select 
                  value={user.CodigoEmpresa || ''} 
                  onChange={(e) => handleEmpresaChange({CodigoEmpresa: e.target.value})}
                  className="mobile-empresa-selector"
                  aria-label="Seleccionar empresa"
                >
                  {empresas.map(empresa => (
                    <option key={empresa.CodigoEmpresa} value={empresa.CodigoEmpresa}>
                      {empresa.CodigoEmpresa}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;