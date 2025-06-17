import React, { useState, useEffect } from 'react';
import '../styles/GestionRutas.css';
import { useNavigate } from 'react-router-dom';

function GestionRutas() {
  const [albaranes, setAlbaranes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const getAuthHeaders = () => {
    const user = JSON.parse(localStorage.getItem('user'));
    const token = localStorage.getItem('token');
    
    if (!user) return {};
    
    const headers = {
      usuario: user.CodigoCliente || '',
      codigoempresa: user.CodigoEmpresa || ''
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  };

  useEffect(() => {
    const fetchAlbaranes = async () => {
      try {
        const headers = getAuthHeaders();
        
        const response = await fetch('http://localhost:3000/albaranesPendientes', {
          headers
        });
        
        if (!response.ok) throw new Error('Error al cargar albaranes');

        const data = await response.json();
        console.log("✅ Albaranes reales:", data);
        setAlbaranes(data);
      } catch (err) {
        console.error("❌ Error cargando albaranes:", err);
        setError('No se pudieron cargar los albaranes: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAlbaranes();
  }, []);

  const abrirDetalle = (albaran) => {
    navigate('/detalle-albaran', { state: { albaran } });
  };

  return (
    <div className="rutas-content">
      <div className="rutas-header">
        <h2>Gestión de Rutas</h2>
        <button className="btn-volver-rutas" onClick={() => navigate('/PedidosScreen')}>
          ← Volver a Pedidos
        </button>
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
      </div>

      <h3>Entregas Asignadas a Tu Ruta</h3>

      {loading && <div>Cargando albaranes...</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}

      {!loading && albaranes.length === 0 && <div>No hay albaranes para mostrar.</div>}

      {albaranes.map((ruta) => (
        <div key={ruta.id || ruta.albaran} className="ruta-card" onClick={() => abrirDetalle(ruta)}>
          <h4>Albarán: {ruta.albaran}</h4>
          <p><strong>Cliente:</strong> {ruta.cliente}</p>
          <p><strong>Dirección:</strong> {ruta.direccion}</p>
        <p><strong>Fecha:</strong> {new Date(ruta.FechaAlbaran).toLocaleDateString('es-ES')}</p>

          <p><strong>Importe:</strong> {ruta.importeLiquido?.toFixed(2)} €</p>
        </div>
      ))}
    </div>
  );
}

export default GestionRutas;