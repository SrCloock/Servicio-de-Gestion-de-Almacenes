import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import '../styles/DetalleAlbaran.css';

function DetalleAlbaran() {
  const location = useLocation();
  const navigate = useNavigate();
  const { albaran } = location.state || {};

  const clienteRef = React.useRef();
  const repartidorRef = React.useRef();

  const limpiarFirmaCliente = () => clienteRef.current.clear();
  const limpiarFirmaRepartidor = () => repartidorRef.current.clear();

  const guardarFirma = async () => {
  const firmaClienteURL = clienteRef.current?.getCanvas().toDataURL('image/png');
const firmaRepartidorURL = repartidorRef.current?.getCanvas().toDataURL('image/png');


    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Albarán: ${albaran.albaran}`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Cliente: ${albaran.cliente}`, 14, 30);
    doc.text(`Dirección: ${albaran.direccion}`, 14, 38);

    doc.text('Artículos entregados:', 14, 48);
    autoTable(doc, {
      startY: 52,
      head: [['Artículo', 'Cantidad']],
      body: albaran.articulos.map(a => [a.nombre, `${a.cantidad} uds`]),
    });

    let finalY = doc.lastAutoTable.finalY || 70;

    if (firmaClienteURL) {
      doc.text('Firma Cliente:', 14, finalY + 10);
      doc.addImage(firmaClienteURL, 'PNG', 14, finalY + 15, 60, 20);
      finalY += 40;
    }

    if (firmaRepartidorURL) {
      doc.text('Firma Repartidor:', 14, finalY + 10);
      doc.addImage(firmaRepartidorURL, 'PNG', 14, finalY + 15, 60, 20);
      finalY += 40;
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
    <div className="detalle-albaran">
      <div className="detalle-header">
        <h2>Detalle del Albarán {albaran.albaran}</h2>
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
        <button className="btn-volver" onClick={() => navigate('/rutas')}>← Volver</button>
      </div>

      <div className="detalle-content">
        <h3>Datos del Cliente</h3>
        <p><strong>Cliente:</strong> {albaran.cliente}</p>
        <p><strong>Dirección:</strong> {albaran.direccion}</p>

        <h3>Líneas del Albarán</h3>
        <table>
          <thead>
            <tr>
              <th>Artículo</th>
              <th>Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {albaran.articulos.map((art, idx) => (
              <tr key={idx}>
                <td>{art.nombre}</td>
                <td>{art.cantidad} uds</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="firma-section">
          <h4>Firma del Cliente:</h4>
          <SignatureCanvas
            penColor="black"
            canvasProps={{
              width: 400,
              height: 150,
              className: 'sigCanvas',
              style: { border: '1px solid #ccc', borderRadius: '6px', backgroundColor: '#fff' }
            }}
            ref={clienteRef}
          />
          <button className="btn-borrar" onClick={limpiarFirmaCliente}>Borrar Firma Cliente</button>
        </div>

        <div className="firma-section">
          <h4>Firma del Repartidor:</h4>
          <SignatureCanvas
            penColor="black"
            canvasProps={{
              width: 400,
              height: 150,
              className: 'sigCanvas',
              style: { border: '1px solid #ccc', borderRadius: '6px', backgroundColor: '#fff' }
            }}
            ref={repartidorRef}
          />
          <button className="btn-borrar" onClick={limpiarFirmaRepartidor}>Borrar Firma Repartidor</button>
        </div>

        <button className="btn-guardar" onClick={guardarFirma}>Guardar y Enviar</button>
      </div>
    </div>
  );
}

export default DetalleAlbaran;