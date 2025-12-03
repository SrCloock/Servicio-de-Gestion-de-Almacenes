import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import API from '../helpers/api';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import SignatureCanvas from 'react-signature-canvas';
import '../styles/DetalleAlbaran.css';
import { FaArrowLeft, FaCheck, FaBox, FaExclamationTriangle, FaSignature, FaEraser } from 'react-icons/fa';

const DetalleAlbaran = () => {
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
  const sigCliente = useRef();
  const sigRepartidor = useRef();

  useEffect(() => {
    if (albaran?.articulos) {
      const initialCantidades = {};
      albaran.articulos.forEach(articulo => {
        initialCantidades[articulo.orden] = articulo.cantidadEntregada || articulo.cantidad;
      });
      setCantidades(initialCantidades);
    }
  }, [albaran]);

  const obtenerFirmaSegura = useCallback((signatureRef) => {
    if (!signatureRef.current) return null;

    const tryMethods = [
      () => signatureRef.current.getTrimmedCanvas()?.toDataURL('image/png'),
      () => signatureRef.current.getCanvas()?.toDataURL('image/png'),
      () => signatureRef.current._canvas?.toDataURL('image/png')
    ];

    for (const method of tryMethods) {
      try {
        const result = method();
        if (result?.startsWith('data:image/png')) return result;
      } catch {}
    }

    return null;
  }, []);

  const firmaEstaVacia = useCallback((firmaDataURL) => {
    return !firmaDataURL || 
           firmaDataURL.length < 1000 || 
           firmaDataURL === 'data:,' || 
           !firmaDataURL.startsWith('data:image/png');
  }, []);

  const actualizarEstadoFirmas = useCallback(() => {
    const firmaCliente = obtenerFirmaSegura(sigCliente);
    const firmaRepartidor = obtenerFirmaSegura(sigRepartidor);
    
    setFirmasValidas({
      cliente: !firmaEstaVacia(firmaCliente),
      repartidor: !firmaEstaVacia(firmaRepartidor)
    });
  }, [obtenerFirmaSegura, firmaEstaVacia]);

  const handleCantidadChange = useCallback((orden, nuevaCantidad) => {
    setCantidades(prev => ({
      ...prev,
      [orden]: parseFloat(nuevaCantidad) || 0
    }));
  }, []);

  const handleActualizarCantidades = useCallback(async () => {
    if (!canPerformActionsInRutas || !albaran) return;

    try {
      setLoading(true);
      setError(null);

      const lineas = Object.entries(cantidades).map(([orden, unidades]) => ({
        orden: parseInt(orden),
        unidades: parseFloat(unidades) || 0
      }));

      const response = await API.put('/actualizarCantidadesAlbaran', {
        codigoEmpresa: albaran.codigoEmpresa,
        ejercicio: albaran.ejercicio,
        serie: albaran.serie,
        numeroAlbaran: albaran.numero,
        lineas,
        observaciones
      });

      if (response.data.success) {
        alert('Cantidades actualizadas correctamente');
        setObservaciones('');
      } else {
        setError(response.data.mensaje);
      }
    } catch (err) {
      setError('Error al actualizar cantidades: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setLoading(false);
    }
  }, [albaran, cantidades, observaciones, canPerformActionsInRutas]);

  const limpiarFirma = useCallback((signatureRef) => {
    signatureRef.current?.clear();
    actualizarEstadoFirmas();
  }, [actualizarEstadoFirmas]);

  const manejarFinFirma = useCallback(() => {
    actualizarEstadoFirmas();
  }, [actualizarEstadoFirmas]);

  const handleCompletarAlbaran = useCallback(async () => {
    if (!canPerformActionsInRutas || !albaran) return;

    const firmaCliente = obtenerFirmaSegura(sigCliente);
    const firmaRepartidor = obtenerFirmaSegura(sigRepartidor);

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

    if (!window.confirm(`¿Estás seguro de que quieres marcar el albarán ${albaran.albaran} como entregado?\n\nEsta acción no se puede deshacer.`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const lineas = Object.entries(cantidades).map(([orden, unidades]) => ({
        orden: parseInt(orden),
        unidades: parseFloat(unidades) || 0
      }));

      if (lineas.length > 0) {
        await API.put('/actualizarCantidadesAlbaran', {
          codigoEmpresa: albaran.codigoEmpresa,
          ejercicio: albaran.ejercicio,
          serie: albaran.serie,
          numeroAlbaran: albaran.numero,
          lineas,
          observaciones
        });
      }

      const response = await API.post('/completarAlbaranConFirmas', {
        codigoEmpresa: albaran.codigoEmpresa,
        ejercicio: albaran.ejercicio,
        serie: albaran.serie,
        numeroAlbaran: albaran.numero,
        firmaCliente,
        firmaRepartidor,
        observaciones
      });

      if (response.data.success) {
        alert(`Albarán ${albaran.albaran} completado correctamente con firmas`);
        navigate('/rutas');
      } else {
        setError(response.data.mensaje);
      }
    } catch (err) {
      setError('Error al completar albarán: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setLoading(false);
    }
  }, [albaran, cantidades, observaciones, canPerformActionsInRutas, navigate, obtenerFirmaSegura, firmaEstaVacia]);

  const formatFecha = useCallback((fechaString) => {
    const fecha = new Date(fechaString);
    return fecha.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const headerBadges = useMemo(() => (
    <div className="header-badges">
      {albaran?.esParcial && <span className="parcial-badge">Parcial</span>}
      {albaran?.esVoluminoso && (
        <span className="voluminoso-badge">
          <FaBox /> Voluminoso
        </span>
      )}
    </div>
  ), [albaran]);

  const renderArticulos = useMemo(() => (
    <div className="articulos-section">
      <h3>Artículos del Albarán</h3>
      <div className="articulos-table">
        <div className="table-header">
          <div>Artículo</div>
          <div>Cantidad Original</div>
          <div>Cantidad a Entregar</div>
        </div>
        {albaran?.articulos?.map((articulo) => (
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
  ), [albaran, cantidades, observaciones, loading, canPerformActionsInRutas, handleCantidadChange, handleActualizarCantidades]);

  const renderFirmas = useMemo(() => (
    <div className="firmas-section">
      <h3>Registro de Firmas</h3>
      <p className="firmas-instructions">
        Ambas firmas son obligatorias para completar la entrega
      </p>

      <div className="firmas-container">
        {[
          { title: 'Cliente', ref: sigCliente, limpiar: () => limpiarFirma(sigCliente), 
            info: { nombre: albaran?.contacto || albaran?.cliente, fecha: new Date().toLocaleDateString('es-ES') } },
          { title: 'Repartidor', ref: sigRepartidor, limpiar: () => limpiarFirma(sigRepartidor),
            info: { nombre: albaran?.repartidor || 'Repartidor', fecha: new Date().toLocaleDateString('es-ES') } }
        ].map(({ title, ref, limpiar, info }, index) => (
          <div key={index} className="firma-item">
            <div className="firma-header">
              <h4>Firma del {title} {firmasValidas[title.toLowerCase()] && <span className="firma-ok">✓</span>}</h4>
              <button 
                onClick={limpiar}
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
                'data-testid': `firma-${title.toLowerCase()}`
              }} 
              ref={ref}
              onEnd={manejarFinFirma}
            />
            <div className="firma-info">
              <p><strong>Nombre:</strong> {info.nombre}</p>
              <p><strong>Fecha:</strong> {info.fecha}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="firmas-warning">
        <FaExclamationTriangle />
        <p>Ambas firmas son necesarias para completar el proceso de entrega</p>
      </div>
    </div>
  ), [firmasValidas, loading, albaran, limpiarFirma, manejarFinFirma]);

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
          {headerBadges}
        </div>

        <div className="albaran-info">
          <div className="info-section">
            <h3>Información del Cliente</h3>
            <div className="info-grid">
              {[
                { label: 'Cliente:', value: albaran.cliente },
                { label: 'Dirección:', value: albaran.direccion },
                { label: 'Contacto:', value: albaran.contacto || 'No especificado' },
                { label: 'Teléfono:', value: albaran.telefonoContacto || 'No especificado' },
                { label: 'Obra:', value: albaran.nombreObra || albaran.obra || 'No especificada' },
                { label: 'Fecha Albarán:', value: formatFecha(albaran.FechaAlbaran) },
                { label: 'Repartidor Asignado:', value: albaran.repartidor || 'Sin asignar' }
              ].map((item, index) => (
                <div key={index} className="info-item">
                  <label>{item.label}</label>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

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
              {activeTab === 'articulos' ? renderArticulos : renderFirmas}
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
};

export default DetalleAlbaran;