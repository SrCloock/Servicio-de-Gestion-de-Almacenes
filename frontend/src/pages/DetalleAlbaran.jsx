import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import SignatureCanvas from 'react-signature-canvas';
import '../styles/DetalleAlbaran.css';
import { FaArrowLeft, FaCheck, FaBox, FaExclamationTriangle, FaSignature, FaEraser } from 'react-icons/fa';

function DetalleAlbaran() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const albaran = state?.albaran;
  
  const [cantidades, setCantidades] = useState({});
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('articulos');
  const [firmasValidas, setFirmasValidas] = useState({
    cliente: false,
    repartidor: false
  });
  
  const { canPerformActionsInRutas } = usePermissions();

  // Referencias para los canvas de firma
  const sigCliente = useRef();
  const sigRepartidor = useRef();

  useEffect(() => {
    if (albaran && albaran.articulos) {
      const initialCantidades = {};
      albaran.articulos.forEach(articulo => {
        initialCantidades[articulo.orden] = articulo.cantidadEntregada || articulo.cantidad;
      });
      setCantidades(initialCantidades);
    }
  }, [albaran]);

  // Función segura para obtener la firma como base64
  const obtenerFirmaSegura = (signatureRef) => {
    try {
      if (!signatureRef.current) {
        return null;
      }

      // Método 1: Intentar con getTrimmedCanvas
      try {
        const canvas = signatureRef.current.getTrimmedCanvas();
        if (canvas && canvas.toDataURL) {
          return canvas.toDataURL('image/png');
        }
      } catch (error) {
        console.warn('Error con getTrimmedCanvas:', error);
      }

      // Método 2: Intentar con getCanvas
      try {
        const canvas = signatureRef.current.getCanvas();
        if (canvas && canvas.toDataURL) {
          return canvas.toDataURL('image/png');
        }
      } catch (error) {
        console.warn('Error con getCanvas:', error);
      }

      // Método 3: Usar el elemento canvas directamente
      const canvasElement = signatureRef.current._canvas;
      if (canvasElement && canvasElement.toDataURL) {
        return canvasElement.toDataURL('image/png');
      }

      return null;
    } catch (error) {
      console.error('Error obteniendo firma:', error);
      return null;
    }
  };

  // Verificar si una firma está vacía
  const firmaEstaVacia = (firmaDataURL) => {
    if (!firmaDataURL) return true;
    
    // Una firma vacía suele tener una longitud específica o ser null/undefined
    // Las data URLs de canvas vacíos suelen tener una longitud característica
    return firmaDataURL.length < 1000 || 
           firmaDataURL === 'data:,' || 
           !firmaDataURL.startsWith('data:image/png');
  };

  // Actualizar estado de firmas válidas
  const actualizarEstadoFirmas = () => {
    const firmaCliente = obtenerFirmaSegura(sigCliente);
    const firmaRepartidor = obtenerFirmaSegura(sigRepartidor);
    
    setFirmasValidas({
      cliente: !firmaEstaVacia(firmaCliente),
      repartidor: !firmaEstaVacia(firmaRepartidor)
    });
  };

  const handleCantidadChange = (orden, nuevaCantidad) => {
    setCantidades(prev => ({
      ...prev,
      [orden]: parseFloat(nuevaCantidad) || 0
    }));
  };

  const handleActualizarCantidades = async () => {
    if (!canPerformActionsInRutas) return;

    try {
      setLoading(true);
      setError(null);

      const lineas = Object.entries(cantidades).map(([orden, unidades]) => ({
        orden: parseInt(orden),
        unidades: parseFloat(unidades) || 0
      }));

      const response = await axios.put(
        'http://localhost:3000/actualizarCantidadesAlbaran',
        {
          codigoEmpresa: albaran.codigoEmpresa,
          ejercicio: albaran.ejercicio,
          serie: albaran.serie,
          numeroAlbaran: albaran.numero,
          lineas: lineas,
          observaciones: observaciones
        },
        { headers: getAuthHeader() }
      );

      if (response.data.success) {
        alert('Cantidades actualizadas correctamente');
        setObservaciones('');
      } else {
        setError(response.data.mensaje);
      }
    } catch (error) {
      console.error('Error actualizando cantidades:', error);
      setError('Error al actualizar cantidades: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setLoading(false);
    }
  };

  const limpiarFirmaCliente = () => {
    if (sigCliente.current) {
      sigCliente.current.clear();
      actualizarEstadoFirmas();
    }
  };

  const limpiarFirmaRepartidor = () => {
    if (sigRepartidor.current) {
      sigRepartidor.current.clear();
      actualizarEstadoFirmas();
    }
  };

  // Manejar el final del dibujo en las firmas
  const manejarFinFirma = () => {
    actualizarEstadoFirmas();
  };

  const handleCompletarAlbaran = async () => {
    if (!canPerformActionsInRutas) return;

    // Obtener firmas de forma segura
    const firmaCliente = obtenerFirmaSegura(sigCliente);
    const firmaRepartidor = obtenerFirmaSegura(sigRepartidor);

    // Validar firmas
    if (firmaEstaVacia(firmaCliente)) {
      alert('Por favor, capture la firma del cliente antes de completar la entrega');
      setActiveTab('firmas');
      return;
    }

    if (firmaEstaVacia(firmaRepartidor)) {
      alert('Por favor, capture la firma del repartidor antes de completar la entrega');
      setActiveTab('firmas');
      return;
    }

    const confirmacion = window.confirm(
      `¿Estás seguro de que quieres marcar el albarán ${albaran.albaran} como entregado?\n\nEsta acción no se puede deshacer.`
    );

    if (!confirmacion) return;

    try {
      setLoading(true);
      setError(null);

      // 1. Primero actualizar cantidades si hay cambios
      if (Object.keys(cantidades).length > 0) {
        const lineas = Object.entries(cantidades).map(([orden, unidades]) => ({
          orden: parseInt(orden),
          unidades: parseFloat(unidades) || 0
        }));

        await axios.put(
          'http://localhost:3000/actualizarCantidadesAlbaran',
          {
            codigoEmpresa: albaran.codigoEmpresa,
            ejercicio: albaran.ejercicio,
            serie: albaran.serie,
            numeroAlbaran: albaran.numero,
            lineas: lineas,
            observaciones: observaciones
          },
          { headers: getAuthHeader() }
        );
      }

      // 2. Luego completar el albarán con las firmas
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
        setError(response.data.mensaje);
      }
    } catch (error) {
      console.error('Error completando albarán:', error);
      setError('Error al completar albarán: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setLoading(false);
    }
  };

  const formatFecha = (fechaString) => {
    const fecha = new Date(fechaString);
    return fecha.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!albaran) {
    return (
      <div className="detalle-albaran-screen">
        <div className="error-container">
          <FaExclamationTriangle className="error-icon" />
          <h2>Error: Albarán no encontrado</h2>
          <p>No se pudo cargar la información del albarán.</p>
          <button onClick={() => navigate('/rutas')} className="btn-volver">
            <FaArrowLeft /> Volver a Gestión de Rutas
          </button>
        </div>
        <Navbar />
      </div>
    );
  }

  return (
    <div className="detalle-albaran-screen">
      <div className="detalle-content">
        <div className="detalle-header">
          <button onClick={() => navigate('/rutas')} className="btn-volver">
            <FaArrowLeft /> Volver
          </button>
          <h2>Detalle del Albarán: {albaran.albaran}</h2>
          <div className="header-badges">
            {albaran.esParcial && <span className="parcial-badge">Parcial</span>}
            {albaran.esVoluminoso && (
              <span className="voluminoso-badge">
                <FaBox /> Voluminoso
              </span>
            )}
          </div>
        </div>

        <div className="albaran-info">
          <div className="info-section">
            <h3>Información del Cliente</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Cliente:</label>
                <span>{albaran.cliente}</span>
              </div>
              <div className="info-item">
                <label>Dirección:</label>
                <span>{albaran.direccion}</span>
              </div>
              <div className="info-item">
                <label>Contacto:</label>
                <span>{albaran.contacto || 'No especificado'}</span>
              </div>
              <div className="info-item">
                <label>Teléfono:</label>
                <span>{albaran.telefonoContacto || 'No especificado'}</span>
              </div>
              <div className="info-item">
                <label>Obra:</label>
                <span>{albaran.nombreObra || albaran.obra || 'No especificada'}</span>
              </div>
              <div className="info-item">
                <label>Fecha Albarán:</label>
                <span>{formatFecha(albaran.FechaAlbaran)}</span>
              </div>
              <div className="info-item">
                <label>Repartidor Asignado:</label>
                <span>{albaran.repartidor || 'Sin asignar'}</span>
              </div>
            </div>
          </div>

          {/* Pestañas para Artículos y Firmas */}
          <div className="tabs-section">
            <div className="tabs-header">
              <button 
                className={`tab-button ${activeTab === 'articulos' ? 'active' : ''}`}
                onClick={() => setActiveTab('articulos')}
              >
                Artículos
              </button>
              <button 
                className={`tab-button ${activeTab === 'firmas' ? 'active' : ''}`}
                onClick={() => setActiveTab('firmas')}
              >
                <FaSignature /> Firmas
                {firmasValidas.cliente && firmasValidas.repartidor && (
                  <span className="firmas-completas-badge">✓</span>
                )}
              </button>
            </div>

            <div className="tabs-content">
              {activeTab === 'articulos' && (
                <div className="articulos-section">
                  <h3>Artículos del Albarán</h3>
                  <div className="articulos-table">
                    <div className="table-header">
                      <div>Artículo</div>
                      <div>Cantidad Original</div>
                      <div>Cantidad a Entregar</div>
                    </div>
                    {albaran.articulos && albaran.articulos.map((articulo) => (
                      <div key={articulo.orden} className="table-row">
                        <div className="articulo-info">
                          <div className="articulo-codigo">{articulo.codigo}</div>
                          <div className="articulo-nombre">{articulo.nombre}</div>
                        </div>
                        <div className="cantidad-original">
                          {articulo.cantidadOriginal}
                        </div>
                        <div className="cantidad-input">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={cantidades[articulo.orden] || ''}
                            onChange={(e) => handleCantidadChange(articulo.orden, e.target.value)}
                            disabled={!canPerformActionsInRutas}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="observaciones-section">
                    <h3>Observaciones</h3>
                    <textarea
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      placeholder="Agregar observaciones sobre la entrega..."
                      disabled={!canPerformActionsInRutas}
                      rows="4"
                    />
                  </div>

                  {canPerformActionsInRutas && (
                    <div className="actions-section">
                      <button
                        onClick={handleActualizarCantidades}
                        disabled={loading}
                        className="btn-actualizar"
                      >
                        {loading ? 'Actualizando...' : 'Actualizar Cantidades'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'firmas' && (
                <div className="firmas-section">
                  <h3>Registro de Firmas</h3>
                  <p className="firmas-instructions">
                    Ambas firmas son obligatorias para completar la entrega
                  </p>

                  <div className="firmas-container">
                    <div className="firma-item">
                      <div className="firma-header">
                        <h4>Firma del Cliente {firmasValidas.cliente && <span className="firma-ok">✓</span>}</h4>
                        <button 
                          onClick={limpiarFirmaCliente}
                          className="btn-limpiar"
                          disabled={loading}
                        >
                          <FaEraser /> Limpiar
                        </button>
                      </div>
                      <SignatureCanvas 
                        penColor="black" 
                        canvasProps={{ 
                          className: 'firma-canvas',
                          'data-testid': 'firma-cliente'
                        }} 
                        ref={sigCliente}
                        onEnd={manejarFinFirma}
                      />
                      <div className="firma-info">
                        <p><strong>Nombre:</strong> {albaran.contacto || albaran.cliente}</p>
                        <p><strong>Fecha:</strong> {new Date().toLocaleDateString('es-ES')}</p>
                      </div>
                    </div>

                    <div className="firma-item">
                      <div className="firma-header">
                        <h4>Firma del Repartidor {firmasValidas.repartidor && <span className="firma-ok">✓</span>}</h4>
                        <button 
                          onClick={limpiarFirmaRepartidor}
                          className="btn-limpiar"
                          disabled={loading}
                        >
                          <FaEraser /> Limpiar
                        </button>
                      </div>
                      <SignatureCanvas 
                        penColor="black" 
                        canvasProps={{ 
                          className: 'firma-canvas',
                          'data-testid': 'firma-repartidor'
                        }} 
                        ref={sigRepartidor}
                        onEnd={manejarFinFirma}
                      />
                      <div className="firma-info">
                        <p><strong>Nombre:</strong> {albaran.repartidor || 'Repartidor'}</p>
                        <p><strong>Fecha:</strong> {new Date().toLocaleDateString('es-ES')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="firmas-warning">
                    <FaExclamationTriangle />
                    <p>Ambas firmas son necesarias para completar el proceso de entrega</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="error-message">
              <FaExclamationTriangle className="error-icon" />
              <p>{error}</p>
            </div>
          )}

          {canPerformActionsInRutas && (
            <div className="actions-section main-actions">
              <button
                onClick={handleCompletarAlbaran}
                disabled={loading || !firmasValidas.cliente || !firmasValidas.repartidor}
                className="btn-completar"
              >
                <FaCheck /> {loading ? 'Completando...' : 'Completar Entrega con Firmas'}
              </button>
            </div>
          )}
        </div>
      </div>
      <Navbar />
    </div>
  );
}

export default DetalleAlbaran;