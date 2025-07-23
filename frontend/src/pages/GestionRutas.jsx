﻿import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import '../styles/GestionRutas.css';

function GestionRutas() {
  const navigate = useNavigate();
  const [albaranes, setAlbaranes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Obtener permisos del usuario
  const { 
    canViewWaybills, 
    canPerformActions 
  } = usePermissions();
  
  useEffect(() => {
    const fetchAlbaranes = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Verificar permisos antes de cargar datos
        if (!canViewWaybills) return;
        
        const headers = getAuthHeader();
        
        if (!headers.usuario || !headers.codigoempresa) {
          throw new Error('Faltan cabeceras de autenticación. Vuelve a iniciar sesión.');
        }

        const response = await axios.get('http://localhost:3000/albaranesPendientes', { 
          headers: headers 
        });

        setAlbaranes(response.data);
      } catch (err) {
        console.error("Error cargando albaranes:", err);
        setError(err.message || 'No se pudieron cargar los albaranes');
      } finally {
        setLoading(false);
      }
    };

    fetchAlbaranes();
  }, [canViewWaybills]);

  const abrirDetalle = (albaran) => {
    if (!canPerformActions) return;
    navigate('/detalle-albaran', { state: { albaran } });
  };

  // Si no tiene permiso para ver esta pantalla
  if (!canViewWaybills) {
    return (
      <div className="gestion-rutas-screen">
        <div className="no-permission">
          <h2>Acceso restringido</h2>
          <p>No tienes permiso para ver esta sección.</p>
          <button onClick={() => navigate('/')} className="btn-volver">
            Volver al inicio
          </button>
        </div>
        <Navbar />
      </div>
    );
  }

  return (
    <div className="gestion-rutas-screen">
      <div className="rutas-content">
        <div className="rutas-header">
          <h2>Gestión de Rutas</h2>
          <div className="permiso-indicator">
            {canPerformActions ? (
              <span className="permiso-full">Acceso completo</span>
            ) : (
              <span className="permiso-readonly">Solo lectura</span>
            )}
          </div>
        </div>

        <h3>Entregas Asignadas a Tu Ruta</h3>

        {loading && (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Cargando albaranes...</p>
          </div>
        )}
        
        {error && <div className="error-message">{error}</div>}

        {!loading && albaranes.length === 0 && (
          <div className="no-albaranes">
            <p>No hay albaranes pendientes de entrega</p>
          </div>
        )}

        <div className="albaranes-grid">
          {albaranes.map((albaran) => (
            <div 
              key={`${albaran.id}-${albaran.albaran}`} 
              className={`ruta-card ${albaran.esParcial ? 'albaran-parcial' : ''} ${canPerformActions ? 'clickable' : ''}`}
              onClick={() => abrirDetalle(albaran)}
            >
              <div className="card-header">
                <h4>Albarán: {albaran.albaran}</h4>
                {albaran.esParcial && (
                  <span className="parcial-badge">Parcial</span>
                )}
                <span className="fecha-albaran">
                  {new Date(albaran.FechaAlbaran).toLocaleDateString('es-ES')}
                </span>
              </div>
              
              <div className="card-body">
                <p className="cliente-info">
                  <span className="icon">👤</span> 
                  <strong>{albaran.cliente}</strong>
                </p>
                <p className="direccion-info">
                  <span className="icon">📍</span> 
                  {albaran.direccion}
                </p>
              </div>
              
              <div className="card-footer">
                <div className="importe-info">
                  <span>Importe:</span>
                  <span className="importe-valor">{albaran.importeLiquido?.toFixed(2)} €</span>
                </div>
                <div className="articulos-info">
                  <span>Artículos:</span>
                  <span className="articulos-count">
                    {albaran.articulos?.length || 0}
                  </span>
                </div>
              </div>
              
              {!canPerformActions && (
                <div className="view-only-overlay">
                  Solo lectura
                </div>
              )}
            </div>
          ))}
        </div>
        <Navbar />
      </div>
    </div>
  );
}

export default GestionRutas;