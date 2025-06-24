import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/PedidosScreen.css';
import Navbar from '../components/Navbar';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import UserInfoBar from '../components/UserInfoBar';

const AlbaranesAsignadosScreen = () => {
  const [albaranes, setAlbaranes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));

  if (!user || user.CodigoCategoriaEmpleadoLc !== 'rep') {
    return (
      <div className="pedidos-container">
        <div className="error-pedidos">
          <p>No tienes permiso para acceder a esta página</p>
          <button onClick={() => navigate('/')}>Volver al inicio</button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    const fetchAlbaranesAsignados = async () => {
      try {
        setLoading(true);
        setError('');
        
        const headers = getAuthHeader();
        const repartidorId = user.CodigoCliente;
        
        const response = await axios.get(
          'http://localhost:3000/albaranes-asignados',
          { 
            headers,
            params: { repartidorId } 
          }
        );
        
        setAlbaranes(response.data);
        
      } catch (err) {
        setError('Error al cargar albaranes asignados');
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAlbaranesAsignados();
  }, [user]);

  const abrirDetalle = (albaran) => {
    navigate('/detalle-albaran', { state: { albaran } });
  };

  return (
    <div className="pedidos-container">
      <UserInfoBar />
      <BackButton />
      
      <div className="screen-header">
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
        <h2>Mis Albaranes Asignados</h2>
      </div>
      
      <div className="pedidos-content">
        {error ? (
          <div className="error-pedidos">
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>Reintentar</button>
          </div>
        ) : loading ? (
          <div className="loading-pedidos">
            <div className="loader"></div>
            <p>Cargando albaranes...</p>
          </div>
        ) : albaranes.length === 0 ? (
          <div className="no-pedidos">
            <p>No hay albaranes asignados</p>
          </div>
        ) : (
          <div className="albaranes-list">
            {albaranes.map(albaran => (
              <div key={`${albaran.id}-${albaran.albaran}`} className="pedido-card">
                <div className="pedido-info">
                  <span className="numero-pedido">#{albaran.albaran}</span>
                  <span className="cliente">{albaran.cliente}</span>
                  <span className="fecha-pedido">
                    {new Date(albaran.FechaAlbaran).toLocaleDateString()}
                  </span>
                </div>
                
                <div className="pedido-details">
                  <div><strong>Dirección:</strong> {albaran.direccion}</div>
                  <div><strong>Total:</strong> {albaran.importeLiquido?.toFixed(2)} €</div>
                  <div><strong>Artículos:</strong> {albaran.articulos?.length || 0}</div>
                </div>
                
                <div className="toggle-button-container">
                  <button 
                    onClick={() => abrirDetalle(albaran)}
                    className="btn-toggle"
                  >
                    Ver Detalles
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <Navbar />
    </div>
  );
};

export default AlbaranesAsignadosScreen;