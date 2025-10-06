import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import { usePermissions } from '../PermissionsManager';
import Navbar from '../components/Navbar';
import './FirmaScreen.css';

function FirmaScreen() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const albaran = state?.albaran;
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { canPerformActions } = usePermissions();
  
  const sigCliente = useRef();
  const sigRepartidor = useRef();

  if (!canPerformActions) {
    return (
      <div className="firma-screen">
        <div className="no-permission">
          <h2>Acceso restringido</h2>
          <p>No tienes permiso para acceder a esta sección.</p>
          <button onClick={() => navigate('/rutas')} className="btn-volver">
            Volver a gestión de rutas
          </button>
        </div>
        <Navbar />
      </div>
    );
  }

  if (!albaran) {
    return (
      <div className="firma-screen">
        <div className="no-albaran">
          <h2>Error: Albarán no encontrado</h2>
          <p>No se encontró información del albarán para firmar.</p>
          <button onClick={() => navigate('/rutas')} className="btn-volver">
            Volver a gestión de rutas
          </button>
        </div>
        <Navbar />
      </div>
    );
  }

  const limpiarFirmaCliente = () => {
    if (sigCliente.current) {
      sigCliente.current.clear();
    }
  };

  const limpiarFirmaRepartidor = () => {
    if (sigRepartidor.current) {
      sigRepartidor.current.clear();
    }
  };

  const finalizarFirma = async () => {
    const firmaCliente = sigCliente.current.getTrimmedCanvas().toDataURL('image/png');
    const firmaRepartidor = sigRepartidor.current.getTrimmedCanvas().toDataURL('image/png');

    // Validar que ambas firmas estén presentes
    if (firmaCliente.length < 1000) {
      alert('Por favor, capture la firma del cliente');
      return;
    }

    if (firmaRepartidor.length < 1000) {
      alert('Por favor, capture la firma del repartidor');
      return;
    }

    setLoading(true);
    
    try {
      const response = await axios.post(
        'http://localhost:3000/completarAlbaranConFirmas',
        {
          codigoEmpresa: albaran.codigoEmpresa,
          ejercicio: albaran.ejercicio,
          serie: albaran.serie,
          numeroAlbaran: albaran.numero,
          firmaCliente: firmaCliente,
          firmaRepartidor: firmaRepartidor,
          observaciones: observaciones
        },
        { headers: getAuthHeader() }
      );

      if (response.data.success) {
        alert(`Albarán ${albaran.albaran} completado correctamente con firmas`);
        navigate('/rutas');
      } else {
        alert(`Error: ${response.data.mensaje}`);
      }
    } catch (error) {
      console.error('Error completando albarán con firmas:', error);
      alert(`Error: ${error.response?.data?.mensaje || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="firma-screen">
      <div className="firma-header">
        <h2>Registro de Entrega - Albarán {albaran.albaran}</h2>
        <div className="albaran-info">
          <p><strong>Cliente:</strong> {albaran.cliente}</p>
          <p><strong>Dirección:</strong> {albaran.direccion}</p>
          <p><strong>Obra:</strong> {albaran.obra || 'No especificada'}</p>
          <p><strong>Contacto:</strong> {albaran.contacto || 'No especificado'}</p>
        </div>
      </div>

      <div className="firma-content">
        <div className="firma-section">
          <div className="firma-title-container">
            <h3>Firma del Cliente</h3>
            <button 
              onClick={limpiarFirmaCliente}
              className="btn-limpiar"
              disabled={loading}
            >
              Limpiar Firma
            </button>
          </div>
          <SignatureCanvas 
            penColor="black" 
            canvasProps={{ 
              className: 'firma-canvas',
              'data-testid': 'firma-cliente'
            }} 
            ref={sigCliente} 
          />
        </div>
        
        <div className="firma-section">
          <div className="firma-title-container">
            <h3>Firma del Repartidor</h3>
            <button 
              onClick={limpiarFirmaRepartidor}
              className="btn-limpiar"
              disabled={loading}
            >
              Limpiar Firma
            </button>
          </div>
          <SignatureCanvas 
            penColor="black" 
            canvasProps={{ 
              className: 'firma-canvas',
              'data-testid': 'firma-repartidor'
            }} 
            ref={sigRepartidor} 
          />
        </div>

        <div className="observaciones-section">
          <h3>Observaciones de la Entrega</h3>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Ingrese cualquier observación sobre la entrega (opcional)"
            rows="3"
            disabled={loading}
          />
        </div>
        
        <div className="firma-actions">
          <button 
            onClick={() => navigate('/rutas')}
            className="btn-cancelar"
            disabled={loading}
          >
            Cancelar
          </button>
          <button 
            onClick={finalizarFirma}
            className="btn-guardar"
            disabled={loading}
          >
            {loading ? 'Guardando...' : 'Guardar Firmas y Completar Entrega'}
          </button>
        </div>
      </div>
      
      <Navbar />
    </div>
  );
}

export default FirmaScreen;