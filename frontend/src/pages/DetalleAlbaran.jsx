import React, { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import '../styles/DetalleAlbaran.css';

function DetalleAlbaran() {
  const location = useLocation();
  const navigate = useNavigate();
  const { albaran } = location.state || {};
  
  const [firmaGuardadaCliente, setFirmaGuardadaCliente] = useState(false);
  const [firmaGuardadaRepartidor, setFirmaGuardadaRepartidor] = useState(false);
  
  const clienteRef = useRef(null);
  const repartidorRef = useRef(null);

  const limpiarFirmaCliente = () => {
    if (clienteRef.current) {
      clienteRef.current.clear();
      setFirmaGuardadaCliente(false);
    }
  };

  const limpiarFirmaRepartidor = () => {
    if (repartidorRef.current) {
      repartidorRef.current.clear();
      setFirmaGuardadaRepartidor(false);
    }
  };

  const guardarFirma = async () => {
    if (!albaran) {
      alert('No hay albarán para procesar');
      return;
    }

    if (!firmaGuardadaCliente || !firmaGuardadaRepartidor) {
      alert('Por favor, complete ambas firmas antes de enviar');
      return;
    }

    const firmaClienteURL = clienteRef.current?.getTrimmedCanvas().toDataURL('image/png');
    const firmaRepartidorURL = repartidorRef.current?.getTrimmedCanvas().toDataURL('image/png');

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    doc.setFontSize(18);
    doc.text(`Albarán: ${albaran.albaran}`, 20, 20);
    doc.setFontSize(12);
    doc.text(`Cliente: ${albaran.cliente}`, 20, 30);
    doc.text(`Dirección: ${albaran.direccion}`, 20, 38);
    doc.text(`Fecha: ${new Date(albaran.FechaAlbaran).toLocaleDateString('es-ES')}`, 20, 46);

    if (albaran.articulos && albaran.articulos.length > 0) {
      doc.text('Artículos entregados:', 20, 56);
      autoTable(doc, {
        startY: 60,
        head: [['Artículo', 'Cantidad', 'Precio', 'Total']],
        body: albaran.articulos.map(a => [
          a.nombre, 
          `${a.cantidad} uds`, 
          `${a.precioUnitario?.toFixed(2) || '0.00'} €`, 
          `${(a.cantidad * (a.precioUnitario || 0)).toFixed(2)} €`
        ]),
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [0, 150, 136] }
      });
    }

    let finalY = doc.lastAutoTable?.finalY || 70;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Total del albarán: ${albaran.importeLiquido?.toFixed(2) || '0.00'} €`, 20, finalY + 10);
    doc.setFont(undefined, 'normal');
    
    doc.setFontSize(12);
    if (firmaClienteURL) {
      doc.text('Firma Cliente:', 20, finalY + 30);
      doc.addImage(firmaClienteURL, 'PNG', 20, finalY + 35, 70, 30);
    }
    
    if (firmaRepartidorURL) {
      doc.text('Firma Repartidor:', 120, finalY + 30);
      doc.addImage(firmaRepartidorURL, 'PNG', 120, finalY + 35, 70, 30);
    }

    const pdfBlob = doc.output('blob');
    const formData = new FormData();
    formData.append('pdf', pdfBlob, `entrega_albaran_${albaran.albaran}.pdf`);
    formData.append('to', 'sergitaberner@hotmail.es');

    try {
      const res = await fetch('http://localhost:3000/enviar-pdf-albaran', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        alert('Correo enviado correctamente');
        navigate('/rutas');
      } else {
        alert('Error al enviar correo');
      }
    } catch (err) {
      console.error('Error al enviar PDF:', err);
      alert('Error al conectar con el servidor');
    }
  };

  if (!albaran) {
    return <div className="detalle-content">No se ha seleccionado ningún albarán.</div>;
  }

  return (
    <div className="detalle-albaran fade-in">
      <div className="detalle-header">
        <h2>Detalle del Albarán {albaran.albaran}</h2>
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
        <button className="btn-volver" onClick={() => navigate('/rutas')}>← Volver</button>
      </div>

      <div className="detalle-content">
        <div className="detalle-info">
          <div className="info-section">
            <h3>Datos del Cliente</h3>
            <p><strong>Cliente:</strong> {albaran.cliente}</p>
            <p><strong>Dirección:</strong> {albaran.direccion}</p>
            <p><strong>Fecha:</strong> {new Date(albaran.FechaAlbaran).toLocaleDateString('es-ES')}</p>
            <p><strong>Total:</strong> {albaran.importeLiquido?.toFixed(2)} €</p>
          </div>

          <div className="articulos-section">
            <h3>Líneas del Albarán</h3>
            {albaran.articulos && albaran.articulos.length > 0 ? (
              <table className="responsive-table">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Cantidad</th>
                    <th>Precio</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {albaran.articulos.map((art, idx) => (
                    <tr key={idx}>
                      <td>{art.nombre}</td>
                      <td>{art.cantidad} uds</td>
                      <td>{art.precioUnitario?.toFixed(2) || '0.00'} €</td>
                      <td>{(art.cantidad * (art.precioUnitario || 0)).toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No hay artículos registrados para este albarán</p>
            )}
          </div>
        </div>

        <div className="firmas-container">
          <div className="firma-section">
            <h4>Firma del Cliente:</h4>
            <SignatureCanvas
              penColor="black"
              minWidth={2}
              maxWidth={4}
              velocityFilterWeight={0.7}
              canvasProps={{
                width: 400,
                height: 200,
                className: 'sigCanvas',
                style: { 
                  border: '1px solid #ccc', 
                  borderRadius: '6px', 
                  backgroundColor: '#fff',
                  marginBottom: '10px'
                }
              }}
              ref={clienteRef}
              onEnd={() => setFirmaGuardadaCliente(true)}
            />
            <div className="firma-controls">
              <button className="btn-borrar" onClick={limpiarFirmaCliente}>Borrar Firma</button>
              {firmaGuardadaCliente && <span className="firma-status">✓ Firma guardada</span>}
            </div>
          </div>

          <div className="firma-section">
            <h4>Firma del Repartidor:</h4>
            <SignatureCanvas
              penColor="black"
              minWidth={2}
              maxWidth={4}
              velocityFilterWeight={0.7}
              canvasProps={{
                width: 400,
                height: 200,
                className: 'sigCanvas',
                style: { 
                  border: '1px solid #ccc', 
                  borderRadius: '6px', 
                  backgroundColor: '#fff',
                  marginBottom: '10px'
                }
              }}
              ref={repartidorRef}
              onEnd={() => setFirmaGuardadaRepartidor(true)}
            />
            <div className="firma-controls">
              <button className="btn-borrar" onClick={limpiarFirmaRepartidor}>Borrar Firma</button>
              {firmaGuardadaRepartidor && <span className="firma-status">✓ Firma guardada</span>}
            </div>
          </div>
        </div>

        <button 
          className="btn-guardar" 
          onClick={guardarFirma}
          disabled={!firmaGuardadaCliente || !firmaGuardadaRepartidor}
        >
          {firmaGuardadaCliente && firmaGuardadaRepartidor 
            ? 'Guardar y Enviar' 
            : 'Complete ambas firmas para enviar'}
        </button>
      </div>
    </div>
  );
}

export default React.memo(DetalleAlbaran);