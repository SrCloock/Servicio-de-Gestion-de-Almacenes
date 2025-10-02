import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { usePermissions } from '../PermissionsManager';
import '../styles/DetalleAlbaran.css';
import { FaArrowLeft, FaCheck, FaBox, FaExclamationTriangle } from 'react-icons/fa';

function DetalleAlbaran() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const albaran = state?.albaran;
  
  const [cantidades, setCantidades] = useState({});
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { canPerformActionsInRutas } = usePermissions();

  useEffect(() => {
    if (albaran && albaran.articulos) {
      const initialCantidades = {};
      albaran.articulos.forEach(articulo => {
        initialCantidades[articulo.orden] = articulo.cantidadEntregada || articulo.cantidad;
      });
      setCantidades(initialCantidades);
    }
  }, [albaran]);

  if (!albaran) {
    return (
      <div className="detalle-albaran-screen">
        <div className="error-container">
          <FaExclamationTriangle className="error-icon" />
          <h2>Error: Albarán no encontrado</h2>
          <p>No se pudo cargar la información del albarán.</p>
          <button onClick={() => navigate('/gestion-rutas')} className="btn-volver">
            <FaArrowLeft /> Volver a Gestión de Rutas
          </button>
        </div>
        <Navbar />
      </div>
    );
  }

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

  const handleCompletarAlbaran = async () => {
    if (!canPerformActionsInRutas) return;

    const confirmacion = window.confirm(
      `¿Estás seguro de que quieres marcar el albarán ${albaran.albaran} como entregado?`
    );

    if (!confirmacion) return;

    try {
      setLoading(true);
      setError(null);

      // Primero actualizar cantidades si hay cambios
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

      // Luego completar el albarán
      const response = await axios.post(
        'http://localhost:3000/completar-albaran',
        {
          codigoEmpresa: albaran.codigoEmpresa,
          ejercicio: albaran.ejercicio,
          serie: albaran.serie,
          numeroAlbaran: albaran.numero,
          observaciones: observaciones
        },
        { headers: getAuthHeader() }
      );

      if (response.data.success) {
        alert(`Albarán ${albaran.albaran} marcado como entregado correctamente`);
        navigate('/gestion-rutas');
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

  return (
    <div className="detalle-albaran-screen">
      <div className="detalle-content">
        <div className="detalle-header">
          <button onClick={() => navigate('/gestion-rutas')} className="btn-volver">
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
                <span>{albaran.obra || 'No especificada'}</span>
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

          {error && (
            <div className="error-message">
              <FaExclamationTriangle className="error-icon" />
              <p>{error}</p>
            </div>
          )}

          {canPerformActionsInRutas && (
            <div className="actions-section">
              <button
                onClick={handleActualizarCantidades}
                disabled={loading}
                className="btn-actualizar"
              >
                {loading ? 'Actualizando...' : 'Actualizar Cantidades'}
              </button>
              <button
                onClick={handleCompletarAlbaran}
                disabled={loading}
                className="btn-completar"
              >
                <FaCheck /> {loading ? 'Completando...' : 'Marcar como Entregado'}
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