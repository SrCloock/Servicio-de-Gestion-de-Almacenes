import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import '../styles/GestionDocumentalScreen.css';

function GestionDocumentalScreen() {
  const [albaranes, setAlbaranes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAlbaranes = async () => {
      try {
        const headers = getAuthHeader();
        const response = await axios.get('http://localhost:3000/albaranes-completados', { headers });
        setAlbaranes(response.data);
        setLoading(false);
      } catch (err) {
        setError('Error: ' + (err.response?.data?.mensaje || err.message));
        setLoading(false);
      }
    };
    fetchAlbaranes();
  }, []);

  const handleDescargar = (albaran) => {
    // Aquí implementar la descarga del PDF
    // Por ahora, solo un placeholder
    alert(`Descargando albarán ${albaran.id}`);
  };

  const handleRevertir = async (albaran) => {
    // Validar que sea de nuestros medios
    if (albaran.FormaEntrega !== 3) {
      alert('Solo se pueden revertir albaranes de nuestros medios (forma de entrega 3)');
      return;
    }

    if (window.confirm('¿Revertir este albarán a pendiente? Se volverá a mostrar en las pantallas de gestión.')) {
      try {
        const headers = getAuthHeader();
        await axios.post('http://localhost:3000/revertir-albaran', {
          codigoEmpresa: albaran.CodigoEmpresa,
          ejercicio: albaran.EjercicioAlbaran,
          serie: albaran.SerieAlbaran,
          numeroAlbaran: albaran.NumeroAlbaran
        }, { headers });
        
        // Eliminar de la lista
        setAlbaranes(albaranes.filter(a => a.id !== albaran.id));
      } catch (error) {
        alert('Error al revertir: ' + error.message);
      }
    }
  };

  return (
    <div className="gestion-documental">
      <h2>Gestión Documental</h2>
      <p>Albaranes entregados y firmados (Solo nuestros medios - últimos 7 días)</p>
      
      {loading && (
        <div className="GD-loading">
          <div className="GD-spinner"></div>
          <p>Cargando albaranes...</p>
        </div>
      )}
      
      {error && <div className="GD-error">{error}</div>}

      {!loading && albaranes.length === 0 ? (
        <div className="GD-no-albaranes">
          <p>No hay albaranes completados (solo nuestros medios)</p>
        </div>
      ) : (
        <div className="GD-grid">
          {albaranes.map(albaran => (
            <div key={albaran.id} className="GD-card">
              <div className="GD-card-header">
                <h3>Albarán: {albaran.SerieAlbaran || ''}-{albaran.NumeroAlbaran}</h3>
                <span className="forma-entrega-tag">Nuestros medios</span>
              </div>
              <div className="GD-card-body">
                <p><strong>Cliente:</strong> {albaran.RazonSocial}</p>
                <p><strong>Obra:</strong> {albaran.obra || 'No especificada'}</p>
                <p><strong>Fecha:</strong> {new Date(albaran.FechaAlbaran).toLocaleDateString('es-ES')}</p>
              </div>
              <div className="GD-card-footer">
                <button 
                  className="GD-btn-descargar"
                  onClick={() => handleDescargar(albaran)}
                >
                  Descargar PDF
                </button>
                <button 
                  className="GD-btn-revertir"
                  onClick={() => handleRevertir(albaran)}
                >
                  Revertir Estado
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Navbar />
    </div>
  );
}

export default GestionDocumentalScreen;