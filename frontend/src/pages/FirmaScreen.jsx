import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePermissions } from '../PermissionsManager';
import Navbar from '../components/Navbar';
import './FirmaScreen.css';

function FirmaScreen() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const ruta = state?.ruta;
  
  // Obtener permisos del usuario
  const { 
    canViewWaybills, 
    canPerformActions 
  } = usePermissions();
  
  const sigCliente = useRef();
  const sigRepartidor = useRef();

  // Verificar permisos
  if (!canViewWaybills || !canPerformActions) {
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

  // Verificar si se recibió el albarán
  if (!ruta) {
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

  const finalizarFirma = () => {
    const firmaCliente = sigCliente.current.getTrimmedCanvas().toDataURL('image/png');
    const firmaRepartidor = sigRepartidor.current.getTrimmedCanvas().toDataURL('image/png');

    navigate('/GestionRutas', {
      state: {
        ...ruta,
        firmaCliente,
        firmaRepartidor
      }
    });
  };

  return (
    <div className="firma-screen">
      <div className="firma-header">
        <h2>Registro de Entrega - Albarán {ruta.albaran}</h2>
        <p>Cliente: {ruta.cliente}</p>
        <p>Dirección: {ruta.direccion}</p>
      </div>

      <div className="firma-content">
        <div className="firma-section">
          <div className="firma-title-container">
            <h3>Firma del Cliente</h3>
            <button 
              onClick={limpiarFirmaCliente}
              className="btn-limpiar"
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
        
        <div className="firma-actions">
          <button 
            onClick={() => navigate('/rutas')}
            className="btn-cancelar"
          >
            Cancelar
          </button>
          <button 
            onClick={finalizarFirma}
            className="btn-guardar"
          >
            Guardar Firmas y Finalizar
          </button>
        </div>
      </div>
      
      <Navbar />
    </div>
  );
}

export default FirmaScreen;