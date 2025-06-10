import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useLocation, useNavigate } from 'react-router-dom';
import './FirmaScreen.css';

function FirmaScreen() {
  const sigCliente = useRef();
  const sigRepartidor = useRef();
  const navigate = useNavigate();
  const { state } = useLocation();
  const ruta = state?.ruta;

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
      <h2>Firma de Cliente</h2>
      <SignatureCanvas penColor="black" canvasProps={{ className: 'firma-canvas' }} ref={sigCliente} />
      
      <h2>Firma de Repartidor</h2>
      <SignatureCanvas penColor="black" canvasProps={{ className: 'firma-canvas' }} ref={sigRepartidor} />

      <button onClick={finalizarFirma}>Guardar Firmas</button>
    </div>
  );
}

export default FirmaScreen;
