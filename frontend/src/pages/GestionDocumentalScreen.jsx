import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import '../styles/GestionDocumentalScreen.css';
import { FaUndo, FaFileSignature, FaExclamationTriangle, FaEye, FaTimes } from 'react-icons/fa';

function GestionDocumentalScreen() {
  const [albaranes, setAlbaranes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalFirmas, setModalFirmas] = useState({
    isOpen: false,
    albaran: null,
    firmaCliente: null,
    firmaRepartidor: null
  });
  const { isAdmin } = usePermissions();

  useEffect(() => {
    fetchAlbaranesCompletados();
  }, []);

  const fetchAlbaranesCompletados = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeader();
      const response = await axios.get('http://localhost:3000/albaranesCompletados', { headers });
      setAlbaranes(response.data);
      setLoading(false);
    } catch (err) {
      setError('Error: ' + (err.response?.data?.mensaje || err.message));
      setLoading(false);
    }
  };

  const handleRevertir = async (albaran) => {
    if (!isAdmin) {
      alert('Solo los administradores pueden revertir albaranes');
      return;
    }

    if (!window.confirm(`¿Está seguro de que desea revertir el albarán ${albaran.albaran}? \n\nEsta acción hará que el albarán vuelva a aparecer en la pantalla de gestión de rutas.`)) {
      return;
    }

    try {
      const headers = getAuthHeader();
      const response = await axios.post('http://localhost:3000/revertirAlbaran', {
        codigoEmpresa: albaran.codigoEmpresa,
        ejercicio: albaran.ejercicio,
        serie: albaran.serie,
        numeroAlbaran: albaran.numero
      }, { headers });
      
      if (response.data.success) {
        // Eliminar de la lista
        setAlbaranes(albaranes.filter(a => a.id !== albaran.id));
        alert('Albarán revertido correctamente');
      } else {
        alert('Error al revertir: ' + response.data.mensaje);
      }
    } catch (error) {
      alert('Error al revertir: ' + (error.response?.data?.mensaje || error.message));
    }
  };

  const handleVerFirmas = (albaran) => {
    setModalFirmas({
      isOpen: true,
      albaran: albaran,
      firmaCliente: albaran.firmaCliente,
      firmaRepartidor: albaran.firmaRepartidor
    });
  };

  const closeModalFirmas = () => {
    setModalFirmas({
      isOpen: false,
      albaran: null,
      firmaCliente: null,
      firmaRepartidor: null
    });
  };

  const formatFecha = (fechaString) => {
    if (!fechaString) return 'No entregado';
    const fecha = new Date(fechaString);
    return fecha.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="gestion-documental">
      <div className="GD-header">
        <h2>Gestión Documental</h2>
        <p>Albaranes entregados y firmados (Solo nuestros medios - últimos 30 días)</p>
      </div>
      
      {loading && (
        <div className="GD-loading">
          <div className="GD-spinner"></div>
          <p>Cargando albaranes completados...</p>
        </div>
      )}
      
      {error && (
        <div className="GD-error">
          <FaExclamationTriangle />
          <p>{error}</p>
          <button onClick={fetchAlbaranesCompletados} className="GD-retry-btn">
            Reintentar
          </button>
        </div>
      )}

      {!loading && !error && albaranes.length === 0 ? (
        <div className="GD-no-albaranes">
          <p>No hay albaranes completados en los últimos 30 días</p>
        </div>
      ) : (
        <div className="GD-grid">
          {albaranes.map(albaran => (
            <div key={albaran.id} className="GD-card">
              <div className="GD-card-header">
                <h3>Albarán: {albaran.albaran}</h3>
                <div className="GD-badges">
                  <span className="GD-badge-completado">Completado</span>
                  {albaran.tieneFirmaCliente && albaran.tieneFirmaRepartidor && (
                    <span className="GD-badge-firmado">
                      <FaFileSignature /> Firmado
                    </span>
                  )}
                  {albaran.EsVoluminoso && (
                    <span className="GD-badge-voluminoso">Voluminoso</span>
                  )}
                </div>
              </div>
              
              <div className="GD-card-body">
                <p><strong>Cliente:</strong> {albaran.cliente}</p>
                <p><strong>Dirección:</strong> {albaran.direccion}</p>
                {albaran.obra && <p><strong>Obra:</strong> {albaran.obra}</p>}
                <p><strong>Fecha Albarán:</strong> {formatFecha(albaran.FechaAlbaran)}</p>
                <p><strong>Repartidor:</strong> {albaran.empleadoAsignado || 'No asignado'}</p>
                
                {/* Estado de las firmas */}
                <div className="GD-estado-firmas">
                  <strong>Estado de firmas:</strong>
                  <div className="GD-firmas-status">
                    <span className={`GD-firma-status ${albaran.tieneFirmaCliente ? 'firmada' : 'pendiente'}`}>
                      Cliente: {albaran.tieneFirmaCliente ? '✓ Firmado' : '✗ Pendiente'}
                    </span>
                    <span className={`GD-firma-status ${albaran.tieneFirmaRepartidor ? 'firmada' : 'pendiente'}`}>
                      Repartidor: {albaran.tieneFirmaRepartidor ? '✓ Firmado' : '✗ Pendiente'}
                    </span>
                  </div>
                </div>

                {albaran.observaciones && (
                  <div className="GD-observaciones">
                    <strong>Observaciones:</strong>
                    <p>{albaran.observaciones}</p>
                  </div>
                )}

                {albaran.articulos && albaran.articulos.length > 0 && (
                  <div className="GD-articulos">
                    <strong>Artículos entregados:</strong>
                    <div className="GD-articulos-list">
                      {albaran.articulos.slice(0, 3).map((articulo, index) => (
                        <div key={index} className="GD-articulo-item">
                          {articulo.nombre} - {articulo.cantidad} unidades
                        </div>
                      ))}
                      {albaran.articulos.length > 3 && (
                        <div className="GD-mas-articulos">
                          +{albaran.articulos.length - 3} más...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="GD-card-footer">
                {(albaran.tieneFirmaCliente || albaran.tieneFirmaRepartidor) && (
                  <button 
                    className="GD-btn-ver-firmas"
                    onClick={() => handleVerFirmas(albaran)}
                  >
                    <FaEye /> Ver Firmas
                  </button>
                )}
                {isAdmin && (
                  <button 
                    className="GD-btn-revertir"
                    onClick={() => handleRevertir(albaran)}
                    title="Revertir albarán a pendiente"
                  >
                    <FaUndo /> Revertir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal para mostrar firmas */}
      {modalFirmas.isOpen && (
        <div className="GD-modal-overlay">
          <div className="GD-modal">
            <div className="GD-modal-header">
              <h3>Firmas - Albarán {modalFirmas.albaran?.albaran}</h3>
              <button onClick={closeModalFirmas} className="GD-modal-close">
                <FaTimes />
              </button>
            </div>
            <div className="GD-modal-body">
              <div className="GD-firmas-container">
                <div className="GD-firma-section">
                  <h4>Firma del Cliente</h4>
                  {modalFirmas.firmaCliente && modalFirmas.firmaCliente.length > 10 ? (
                    <img 
                      src={modalFirmas.firmaCliente} 
                      alt="Firma del cliente" 
                      className="GD-firma-img"
                    />
                  ) : (
                    <div className="GD-firma-no-disponible">
                      <FaExclamationTriangle />
                      <p>Firma no disponible</p>
                    </div>
                  )}
                  <div className="GD-firma-info">
                    <p><strong>Cliente:</strong> {modalFirmas.albaran?.contacto || modalFirmas.albaran?.cliente}</p>
                  </div>
                </div>
                
                <div className="GD-firma-section">
                  <h4>Firma del Repartidor</h4>
                  {modalFirmas.firmaRepartidor && modalFirmas.firmaRepartidor.length > 10 ? (
                    <img 
                      src={modalFirmas.firmaRepartidor} 
                      alt="Firma del repartidor" 
                      className="GD-firma-img"
                    />
                  ) : (
                    <div className="GD-firma-no-disponible">
                      <FaExclamationTriangle />
                      <p>Firma no disponible</p>
                    </div>
                  )}
                  <div className="GD-firma-info">
                    <p><strong>Repartidor:</strong> {modalFirmas.albaran?.empleadoAsignado || 'No asignado'}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="GD-modal-footer">
              <button onClick={closeModalFirmas} className="GD-btn-cerrar">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <Navbar />
    </div>
  );
}

export default GestionDocumentalScreen;