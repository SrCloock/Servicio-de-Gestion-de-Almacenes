import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import axios from 'axios';
import '../styles/DetalleAlbaran.css';
import Navbar from '../components/Navbar';
import { getAuthHeader } from '../helpers/authHelper';
import { usePermissions } from '../PermissionsManager';

function DetalleAlbaran() {
  const location = useLocation();
  const navigate = useNavigate();
  const { albaran: initialAlbaran } = location.state || {};
  
  const { 
    canViewWaybills, 
    canPerformActions 
  } = usePermissions();
  
  const [firmaGuardadaCliente, setFirmaGuardadaCliente] = useState(false);
  const [firmaGuardadaRepartidor, setFirmaGuardadaRepartidor] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [albaran, setAlbaran] = useState(initialAlbaran);
  const [totalAlbaran, setTotalAlbaran] = useState(0);
  
  const clienteRef = useRef(null);
  const repartidorRef = useRef(null);

  useEffect(() => {
    if (initialAlbaran) {
      // Inicializar con cantidades persistentes
      const articulosConEntregada = initialAlbaran.articulos.map(art => ({
        ...art,
        cantidadEntregada: art.cantidadEntregada || art.cantidad,
        cantidadOriginal: art.cantidadOriginal || art.cantidad
      }));
      
      // Calcular total inicial
      const nuevoTotal = articulosConEntregada.reduce((total, art) => {
        return total + (art.cantidadEntregada * (art.precioUnitario || 0));
      }, 0);
      
      setAlbaran({...initialAlbaran, articulos: articulosConEntregada});
      setTotalAlbaran(nuevoTotal);
    }
  }, [initialAlbaran]);

  if (!canViewWaybills) {
    return (
      <div className="DA-container">
        <div className="DA-no-permission">
          <h2>Acceso restringido</h2>
          <p>No tienes permiso para ver esta sección.</p>
          <button onClick={() => navigate('/')} className="DA-btn-volver">
            Volver al inicio
          </button>
        </div>
        <Navbar />
      </div>
    );
  }

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

  const handleCantidadChange = (index, newCantidad) => {
    if (!albaran || !albaran.articulos) return;
    
    const updatedArticulos = [...albaran.articulos];
    // Limitar a la cantidad original
    const cantidad = Math.min(parseFloat(newCantidad) || 0, updatedArticulos[index].cantidadOriginal);
    
    updatedArticulos[index] = {
      ...updatedArticulos[index],
      cantidadEntregada: cantidad
    };
    
    const nuevoTotal = updatedArticulos.reduce((total, art) => {
      return total + (art.cantidadEntregada * (art.precioUnitario || 0));
    }, 0);
    
    setAlbaran({...albaran, articulos: updatedArticulos});
    setTotalAlbaran(nuevoTotal);
  };

  const guardarCambios = async () => {
    try {
      const headers = getAuthHeader();
      const lineas = albaran.articulos.map(art => ({
        orden: art.orden,
        unidades: art.cantidadEntregada
      }));
      
      await axios.put('http://localhost:3000/actualizarCantidadesAlbaran', {
        codigoEmpresa: albaran.codigoEmpresa,
        ejercicio: albaran.ejercicio,
        serie: albaran.serie,
        numeroAlbaran: albaran.numero,
        lineas
      }, { headers });
      
      setEditMode(false);
      alert('Cambios guardados correctamente');
    } catch (error) {
      console.error('Error guardando cambios:', error);
      alert('Error al guardar cambios');
    }
  };

  const guardarFirma = async () => {
    const to = 'sergitaberner@hotmail.es';
    const pdfName = `entrega_albaran_${albaran.albaran}.pdf`;

    if (!albaran) {
      alert('No hay albarán para procesar');
      return;
    }

    if (!firmaGuardadaCliente || !firmaGuardadaRepartidor) {
      alert('Por favor, complete ambas firmas antes de enviar');
      return;
    }

    const firmaClienteURL = clienteRef.current?.getCanvas().toDataURL('image/png');
    const firmaRepartidorURL = repartidorRef.current?.getCanvas().toDataURL('image/png');

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
    doc.text(`Obra: ${albaran.obra || 'No especificada'}`, 20, 46);
    doc.text(`Contacto: ${albaran.contacto || 'No especificado'}`, 20, 54);
    doc.text(`Teléfono: ${albaran.telefonoContacto || 'No especificado'}`, 20, 62);
    doc.text(`Fecha: ${new Date(albaran.FechaAlbaran).toLocaleDateString('es-ES')}`, 20, 70);

    if (albaran.articulos?.length > 0) {
      doc.text('Artículos entregados:', 20, 80);
      autoTable(doc, {
        startY: 85,
        head: [['Artículo', 'Cantidad', 'Precio', 'Total']],
        body: albaran.articulos.map(a => [
          a.nombre, 
          `${a.cantidadEntregada} uds`, 
          `${a.precioUnitario?.toFixed(2) || '0.00'} €`, 
          `${(a.cantidadEntregada * (a.precioUnitario || 0)).toFixed(2)} €`
        ]),
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [0, 150, 136] }
      });
    }

    let finalY = doc.lastAutoTable?.finalY || 95;
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Total del albarán: ${totalAlbaran.toFixed(2)} €`, 20, finalY + 10);
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
    formData.append('pdf', pdfBlob, pdfName);
    formData.append('to', to);

    try {
      await axios.post(
        'http://localhost:3000/completar-albaran',
        {
          codigoEmpresa: albaran.codigoEmpresa,
          ejercicio: albaran.ejercicio,
          serie: albaran.serie,
          numeroAlbaran: albaran.numero
        },
        { headers: getAuthHeader() }
      );

      const authHeaders = getAuthHeader();
      const res = await fetch('http://localhost:3000/enviar-pdf-albaran', {
        method: 'POST',
        body: formData,
        headers: {
          'usuario': authHeaders.usuario,
          'codigoempresa': authHeaders.codigoempresa
        }
      });
      
      const data = await res.json();

      if (data.success) {
        alert('Albarán completado y correo enviado correctamente');
        navigate('/rutas');
      } else {
        alert('Error al enviar correo');
      }
    } catch (err) {
      console.error('Error al completar albarán o enviar PDF:', err);
      alert('Error al conectar con el servidor');
    }
  };

  if (!albaran) {
    return (
      <div className="DA-container">
        <div className="DA-no-albaran">
          <p>No se ha seleccionado ningún albarán.</p>
          <button className="DA-btn-volver" onClick={() => navigate('/rutas')}>
            Volver a Rutas
          </button>
        </div>
        <Navbar />
      </div>
    );
  }

  return (
    <div className="DA-container">
      <div className="DA-header">
        <button className="DA-btn-volver" onClick={() => navigate('/rutas')}>
          ← Volver a Rutas
        </button>
        <h2 className="DA-title">Detalle del Albarán {albaran.albaran}</h2>
      </div>

      <div className="DA-content">
        <div className="DA-panel">
          <div className="DA-panel-header">
            <h3 className="DA-panel-title">Datos del Cliente</h3>
          </div>
          <div className="DA-panel-body">
            <div className="DA-info-grid">
              <div className="DA-info-item">
                <span className="DA-info-label">Cliente</span>
                <span className="DA-info-value">{albaran.cliente}</span>
              </div>
              <div className="DA-info-item">
                <span className="DA-info-label">Dirección</span>
                <span className="DA-info-value">{albaran.direccion}</span>
              </div>
              <div className="DA-info-item">
                <span className="DA-info-label">Obra</span>
                <span className="DA-info-value">{albaran.obra || 'No especificada'}</span>
              </div>
              <div className="DA-info-item">
                <span className="DA-info-label">Contacto</span>
                <span className="DA-info-value">{albaran.contacto || 'No especificado'}</span>
              </div>
              <div className="DA-info-item">
                <span className="DA-info-label">Teléfono</span>
                <span className="DA-info-value">{albaran.telefonoContacto || 'No especificado'}</span>
              </div>
              <div className="DA-info-item">
                <span className="DA-info-label">Fecha</span>
                <span className="DA-info-value">
                  {new Date(albaran.FechaAlbaran).toLocaleDateString('es-ES')}
                </span>
              </div>
              <div className="DA-info-item">
                <span className="DA-info-label">Total</span>
                <span className="DA-info-value">{totalAlbaran.toFixed(2)} €</span>
              </div>
            </div>
          </div>
        </div>

        <div className="DA-panel">
          <div className="DA-panel-header">
            <h3 className="DA-panel-title">Líneas del Albarán</h3>
            {canPerformActions && (
              <button 
                className={`DA-edit-button ${editMode ? 'editing' : ''}`}
                onClick={() => editMode ? guardarCambios() : setEditMode(true)}
              >
                {editMode ? 'Guardar Cambios' : 'Editar Cantidades'}
              </button>
            )}
          </div>
          <div className="DA-panel-body">
            {albaran.articulos?.length > 0 ? (
              <table className="DA-items-table">
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
                      <td>
                        {editMode ? (
                          <div className="DA-quantity-edit">
                            <span className="DA-original-quantity">{art.cantidadOriginal}</span>
                            <input
                              type="number"
                              min="0"
                              max={art.cantidadOriginal}
                              value={art.cantidadEntregada}
                              onChange={(e) => handleCantidadChange(idx, e.target.value)}
                              className="DA-quantity-input"
                            />
                          </div>
                        ) : art.cantidadEntregada !== art.cantidadOriginal ? (
                          <div className="DA-modified-quantity">
                            <del>{art.cantidadOriginal}</del>
                            <span className="DA-delivered-quantity">{art.cantidadEntregada}</span>
                          </div>
                        ) : (
                          art.cantidadOriginal
                        )}
                      </td>
                      <td>{art.precioUnitario?.toFixed(2) || '0.00'} €</td>
                      <td>{(art.cantidadEntregada * (art.precioUnitario || 0)).toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No hay artículos registrados para este albarán</p>
            )}
          </div>
        </div>

        <div className="DA-panel DA-signatures-panel">
          <div className="DA-panel-header">
            <h3 className="DA-panel-title">Firmas</h3>
          </div>
          <div className="DA-panel-body">
            <div className="DA-signatures-container">
              <div className="DA-signature-box">
                <h4 className="DA-signature-title">Firma del Cliente:</h4>
                <SignatureCanvas
                  penColor="black"
                  minWidth={2}
                  maxWidth={4}
                  velocityFilterWeight={0.7}
                  canvasProps={{
                    width: 400,
                    height: 200,
                    className: 'DA-signature-canvas',
                  }}
                  ref={clienteRef}
                  onEnd={() => setFirmaGuardadaCliente(true)}
                />
                <div className="DA-signature-controls">
                  <button 
                    className="DA-clear-button" 
                    onClick={limpiarFirmaCliente}
                    disabled={!canPerformActions}
                  >
                    Borrar Firma
                  </button>
                  {firmaGuardadaCliente && <span className="DA-signature-status">✓ Firma guardada</span>}
                </div>
              </div>

              <div className="DA-signature-box">
                <h4 className="DA-signature-title">Firma del Repartidor:</h4>
                <SignatureCanvas
                  penColor="black"
                  minWidth={2}
                  maxWidth={4}
                  velocityFilterWeight={0.7}
                  canvasProps={{
                    width: 400,
                    height: 200,
                    className: 'DA-signature-canvas',
                  }}
                  ref={repartidorRef}
                  onEnd={() => setFirmaGuardadaRepartidor(true)}
                />
                <div className="DA-signature-controls">
                  <button 
                    className="DA-clear-button" 
                    onClick={limpiarFirmaRepartidor}
                    disabled={!canPerformActions}
                  >
                    Borrar Firma
                  </button>
                  {firmaGuardadaRepartidor && <span className="DA-signature-status">✓ Firma guardada</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <button 
          className="DA-action-button" 
          onClick={guardarFirma}
          disabled={!canPerformActions || (!firmaGuardadaCliente || !firmaGuardadaRepartidor)}
        >
          {firmaGuardadaCliente && firmaGuardadaRepartidor 
            ? 'Guardar y Enviar' 
            : 'Complete ambas firmas para enviar'}
        </button>
      </div>
      <Navbar />
    </div>
  );
}

export default DetalleAlbaran;