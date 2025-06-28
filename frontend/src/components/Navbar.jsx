import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Navbar.css';
import { getUserPermisos } from '../helpers/authHelper';

// ============================================
// ✅ COMPONENTE: BARRA DE NAVEGACIÓN
// ============================================
/**
 * Componente de barra de navegación superior
 * 
 * @returns {React.ReactNode} Barra de navegación con enlaces a secciones de la app
 */
const Navbar = () => {
  const navigate = useNavigate();
  const permisos = getUserPermisos();
  const isAdmin = permisos.isAdmin;
  const isRepartidor = permisos.isRepartidor;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // ============================================
  // ✅ EFECTO: GESTIÓN DE REDIMENSIONAMIENTO
  // ============================================
  /**
   * Cierra menú móvil al cambiar tamaño de ventana
   */
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ============================================
  // ✅ FUNCIÓN: TOGGLE MENÚ MÓVIL
  // ============================================
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  // ============================================
  // ✅ FUNCIÓN: NAVEGACIÓN
  // ============================================
  /**
   * Navega a una ruta y cierra menú móvil
   * 
   * @param {string} path - Ruta destino
   */
  const goTo = (path) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  return (
    <nav className="navbar">
      <div className="navbar-header">
        <div className="navbar-logo">📦 App Pedidos</div>
        <button 
          className="hamburger" 
          onClick={toggleMobileMenu}
          aria-label={isMobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
        >
          ☰
        </button>
      </div>

      <div 
        className={`navbar-links ${isMobileMenuOpen ? 'open' : ''}`}
        aria-hidden={!isMobileMenuOpen}
      >
        {/* ============================================ */}
        {/* ✅ ENLACE: GESTIÓN DE RUTAS                  */}
        {/* ============================================ */}
        <button onClick={() => goTo('/rutas')} className="btn-nav">
          <span>📦</span> Rutas
        </button>

        {/* ============================================ */}
        {/* ✅ ENLACE: TODOS LOS PEDIDOS (ADMIN)         */}
        {/* ============================================ */}
        {isAdmin && (
          <button onClick={() => goTo('/PedidosScreen')} className="btn-nav">
            <span>📝</span> Todos los Pedidos
          </button>
        )}

        {/* ============================================ */}
        {/* ✅ ENLACE: PEDIDOS ASIGNADOS                 */}
        {/* ============================================ */}
        {(isAdmin || isRepartidor) && (
          <button onClick={() => goTo('/pedidos-asignados')} className="btn-nav">
            <span>📋</span> Pedidos Asignados
          </button>
        )}

        {/* ============================================ */}
        {/* ✅ ENLACE: TRASPASOS                         */}
        {/* ============================================ */}
        <button onClick={() => goTo('/traspasos')} className="btn-nav">
          <span>🔄</span> Traspasos
        </button>
        
        {/* ============================================ */}
        {/* ✅ ENLACE: INVENTARIO (NUEVO)                */}
        {/* ============================================ */}
        <button onClick={() => goTo('/inventario')} className="btn-nav">
          <span>📊</span> Inventario
        </button>

        {/* ============================================ */}
        {/* ✅ ENLACE: DESIGNAR RUTAS (ADMIN)            */}
        {/* ============================================ */}
        {isAdmin && (
          <button onClick={() => goTo('/designar-rutas')} className="btn-nav">
            <span>👥</span> Designar Rutas
          </button>
        )}

        {/* ============================================ */}
        {/* ✅ ENLACE: ALBARANES ASIGNADOS               */}
        {/* ============================================ */}
        {(isAdmin || isRepartidor) && (
          <button onClick={() => goTo('/albaranes-asignados')} className="btn-nav">
            {isAdmin ? <span>📑</span> : <span>📋</span>}
            {isAdmin ? ' Albaranes Asignados' : ' Mis Albaranes'}
          </button>
        )}

        {/* ============================================ */}
        {/* ✅ ENLACE: INICIO                            */}
        {/* ============================================ */}
        <button onClick={() => goTo('/')} className="btn-nav">
          <span>🏠</span> Inicio
        </button>
      </div>
    </nav>
  );
};

export default Navbar;