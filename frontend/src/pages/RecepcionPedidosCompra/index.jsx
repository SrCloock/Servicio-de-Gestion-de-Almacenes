// src/pages/RecepcionPedidosCompra/index.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { usePermissions } from '../../PermissionsManager';
import {
  RecepcionHeader,
  RecepcionFilters,
  RecepcionPagination,
  RecepcionStateView,
  ProveedorGroupCard,
  PedidoCompraCard,
  RecepcionLineasTable,
  RecepcionVariantesPanel,
  GenerarAlbaranDialog,
  FinalizarPedidoDialog,
  RecepcionDialog
} from './components';
import {
  usePedidosCompra,
  useRecepcionModal,
  useAlbaranModal,
  useFinalizarPedido
} from './hooks';
import {
  renderEstadoLinea,
  renderVarianteBadge,
  calcularPorcentajeRecepcion
} from './utils';
import '../../styles/RecepcionPedidosCompra.css';

// ── Notificación persistente ──────────────────────────────────────────────────
// No desaparece sola. El usuario debe cerrarla manualmente.
const PersistentAlert = ({ alerts, onDismiss }) => {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="RPC-persistent-alerts">
      {alerts.map((alert) => (
        <div key={alert.id} className={`RPC-persistent-alert RPC-alert-${alert.type}`}>
          <div className="RPC-alert-icon">
            {alert.type === 'success' ? '✅' : alert.type === 'error' ? '❌' : 'ℹ️'}
          </div>
          <div className="RPC-alert-body">
            <strong className="RPC-alert-title">
              {alert.type === 'success' ? 'Operación completada' : alert.type === 'error' ? 'Error' : 'Aviso'}
            </strong>
            <p className="RPC-alert-message">{alert.message}</p>
          </div>
          <button className="RPC-alert-close" onClick={() => onDismiss(alert.id)} title="Cerrar">✕</button>
        </div>
      ))}
    </div>
  );
};

// ── Hook para alertas persistentes ───────────────────────────────────────────
let _alertCounter = 0;
const usePersistentAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const addAlert = useCallback((message, type = 'success') => {
    const id = ++_alertCounter;
    setAlerts(prev => [...prev, { id, message, type }]);
    return id;
  }, []);
  const dismissAlert = useCallback((id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);
  const dismissAll = useCallback(() => setAlerts([]), []);
  return { alerts, addAlert, dismissAlert, dismissAll };
};

// ── Componente principal ──────────────────────────────────────────────────────
const RecepcionPedidosCompra = () => {
  const permissions = usePermissions();
  const userData = JSON.parse(localStorage.getItem('user'));
  const user = userData || {};
  const { canViewReceiving } = permissions;

  const [proveedoresExpandidos, setProveedoresExpandidos] = useState({});
  const [pedidosExpandidos, setPedidosExpandidos] = useState({});
  const [lineasExpandidas, setLineasExpandidas] = useState({});
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [pedidosDatos, setPedidosDatos] = useState({});

  const { alerts, addAlert, dismissAlert } = usePersistentAlerts();

  const {
    pedidosAgrupados,
    detallesPedidos,
    loading,
    loadingDetalle,
    error,
    setError,
    pagination,
    setPagination,
    filtros,
    setFiltros,
    cargarPedidos,
    cargarDetallesPedido
  } = usePedidosCompra(user);

  // Errores del hook se muestran como alerta persistente de error
  useEffect(() => {
    if (error) {
      addAlert(error, 'error');
      setError(null);
    }
  }, [error]);

  const guardarDatosPedido = (clavePedido, suAlbaranNo, fechaSuAlbaran) => {
    if (!suAlbaranNo || !fechaSuAlbaran) {
      addAlert('Debe completar el Nº de Albarán del Proveedor y la Fecha para este pedido.', 'error');
      return;
    }
    setPedidosDatos(prev => ({
      ...prev,
      [clavePedido]: { suAlbaranNo, fechaSuAlbaran, fijado: true }
    }));
    addAlert(`Datos del albarán guardados para pedido ${clavePedido}`, 'success');
  };

  const obtenerDatosPedido = (clavePedido) => pedidosDatos[clavePedido] || null;

  const {
    modalRecepcion,
    lineaARecepcionar,
    almacenes,
    ubicaciones,
    selectedAlmacen,
    setSelectedAlmacen,
    selectedUbicacion,
    setSelectedUbicacion,
    unidadesARecepcionar,
    setUnidadesARecepcionar,
    maxUnidadesModal,
    variantesDistribucion,
    setVariantesDistribucion,
    loadingVariantes,
    loadingRecepcion,
    abrirModalRecepcion,
    cerrarModalRecepcion,
    procesarRecepcionLinea: _procesarRecepcion
  } = useRecepcionModal({
    user,
    cargarDetallesPedido,
    cargarPedidos,
    pagination,
    setError,
    setSuccess: (msg) => addAlert(msg, 'success')
  });

  // Wrapper para recepción que genera albarán automático con alerta persistente
  const procesarRecepcionLinea = async () => {
    await _procesarRecepcion();
  };

  const {
    modalGenerarAlbaran,
    pedidoAAlbaran,
    lineasConRecepcion,
    totalUnidadesAlbaran,
    importeTotalAlbaran,
    loadingAlbaran,
    prepararGenerarAlbaran,
    generarAlbaran: _generarAlbaran,
    cerrarModalAlbaran
  } = useAlbaranModal({
    user,
    detallesPedidos,
    cargarDetallesPedido,
    cargarPedidos,
    pagination,
    setError,
    setSuccess: (msg) => addAlert(msg, 'success')
  });

  const generarAlbaran = async () => {
    await _generarAlbaran();
  };

  const {
    modalFinalizarPedido,
    pedidoAFinalizar,
    loadingFinalizar,
    prepararFinalizarPedido,
    finalizarPedido: _finalizarPedido,
    cerrarModalFinalizar
  } = useFinalizarPedido({
    user,
    cargarPedidos,
    pagination,
    setError,
    setSuccess: (msg) => addAlert(msg, 'success')
  });

  const finalizarPedido = async () => {
    await _finalizarPedido();
  };

  const aplicarFiltros = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    cargarPedidos(1, true);
    setMostrarFiltros(false);
  };

  const limpiarFiltros = () => {
    setFiltros({ proveedor: '', fechaDesde: '', fechaHasta: '', numeroPedido: '' });
    cargarPedidos(1, false);
    setMostrarFiltros(false);
  };

  const cambiarPagina = (nuevaPagina) => {
    if (nuevaPagina < 1 || nuevaPagina > pagination.totalPages) return;
    setPagination(prev => ({ ...prev, page: nuevaPagina }));
    cargarPedidos(nuevaPagina, true);
  };

  const toggleProveedorExpandido = (claveProveedor) => {
    setProveedoresExpandidos(prev => ({ ...prev, [claveProveedor]: !prev[claveProveedor] }));
  };

  const toggleLineaExpandida = (clavePedido, lineaIndex) => {
    const clave = `${clavePedido}_${lineaIndex}`;
    setLineasExpandidas(prev => ({ ...prev, [clave]: !prev[clave] }));
  };

  useEffect(() => {
    if (user && user.UsuarioLogicNet && canViewReceiving) {
      cargarPedidos(1, false);
    }
  }, []);

  if (!canViewReceiving) {
    return (
      <div className="RPC-container">
        <RecepcionStateView
          type="warning"
          title="Acceso denegado"
          message="No tiene permisos para acceder a la recepción de pedidos de compra."
        />
      </div>
    );
  }

  return (
    <div className="RPC-container">

      {/* ── Alertas persistentes ── */}
      <PersistentAlert alerts={alerts} onDismiss={dismissAlert} />

      {/* ── Cabecera ── */}
      <RecepcionHeader
        title="Recepción de Pedidos de Compra"
        subtitle="Recepcione artículos y genere albaranes de proveedor."
        summary={`${pagination.total} pedidos · ${Object.keys(pedidosAgrupados).length} proveedores · Página ${pagination.page}/${pagination.totalPages}`}
        mostrarFiltros={mostrarFiltros}
        onToggleFiltros={() => setMostrarFiltros(!mostrarFiltros)}
        onRefresh={() => cargarPedidos(pagination.page, true)}
        loading={loading}
      />

      {/* ── Filtros ── */}
      <RecepcionFilters
        visible={mostrarFiltros}
        filtros={filtros}
        onFiltrosChange={setFiltros}
        onClear={limpiarFiltros}
        onApply={aplicarFiltros}
      />

      {/* ── Contenido principal ── */}
      {loading && Object.keys(pedidosAgrupados).length === 0 ? (
        <RecepcionStateView type="loading" message="Cargando pedidos..." />
      ) : Object.keys(pedidosAgrupados).length === 0 ? (
        <RecepcionStateView
          type="info"
          title="No hay pedidos pendientes"
          message="No se encontraron pedidos de compra con los filtros actuales."
          buttonLabel="Limpiar filtros"
          onButtonClick={limpiarFiltros}
        />
      ) : (
        <div className="RPC-proveedores-container">
          {Object.keys(pedidosAgrupados).map(claveProveedor => {
            const grupo = pedidosAgrupados[claveProveedor];
            const proveedorExpandido = proveedoresExpandidos[claveProveedor] || false;

            return (
              <ProveedorGroupCard
                key={claveProveedor}
                grupo={grupo}
                expandido={proveedorExpandido}
                onToggle={() => toggleProveedorExpandido(claveProveedor)}
                loading={loading}
              >
                <div className={`RPC-pedidos-container ${proveedorExpandido ? 'visible' : 'hidden'}`}>
                  {grupo.pedidos.map(pedido => {
                    const clavePedido = `${pedido.EjercicioPedido}_${pedido.SeriePedido || '0'}_${pedido.NumeroPedido}`;
                    const pedidoExpandido = pedidosExpandidos[clavePedido] || false;
                    const detalles = detallesPedidos[clavePedido];
                    const tieneUnidadesRecibidas = parseFloat(pedido.TotalUnidadesRecibidas) > 0;
                    const datosPedido = obtenerDatosPedido(clavePedido);
                    const datosFijados = datosPedido && datosPedido.fijado;

                    const handleAbrirModalRecepcion = (linea, variante = null, talla = null) => {
                      if (!datosFijados) {
                        addAlert('Debe guardar los datos del albarán del proveedor para este pedido antes de recepcionar.', 'error');
                        return;
                      }
                      abrirModalRecepcion(linea, clavePedido, variante, talla, datosPedido);
                    };

                    const handlePrepararGenerarAlbaran = async () => {
                      if (!datosFijados) {
                        addAlert('Debe guardar los datos del albarán del proveedor para este pedido antes de generar albarán.', 'error');
                        return;
                      }
                      let det = detalles;
                      if (!det) {
                        det = await cargarDetallesPedido(pedido.EjercicioPedido, pedido.SeriePedido || '0', pedido.NumeroPedido, false);
                        if (!det) return;
                      }
                      await prepararGenerarAlbaran(pedido, datosPedido);
                    };

                    return (
                      <PedidoCompraCard
                        key={clavePedido}
                        pedido={pedido}
                        expandido={pedidoExpandido}
                        loading={loading || loadingDetalle}
                        tieneUnidadesRecibidas={tieneUnidadesRecibidas}
                        onToggle={async () => {
                          if (!detalles) {
                            await cargarDetallesPedido(pedido.EjercicioPedido, pedido.SeriePedido || '0', pedido.NumeroPedido);
                            setPedidosExpandidos(prev => ({ ...prev, [clavePedido]: true }));
                          } else {
                            setPedidosExpandidos(prev => ({ ...prev, [clavePedido]: !prev[clavePedido] }));
                          }
                        }}
                        onGenerarAlbaran={handlePrepararGenerarAlbaran}
                        onFinalizar={() => prepararFinalizarPedido(pedido)}
                        datosPedido={datosPedido}
                        onGuardarDatos={(suAlbaranNo, fechaSuAlbaran) => guardarDatosPedido(clavePedido, suAlbaranNo, fechaSuAlbaran)}
                        disabledAlbaran={!datosFijados}
                        disabledFinalizar={!datosFijados}
                      >
                        {detalles && (
                          <RecepcionLineasTable title={`Líneas del Pedido (${detalles.lineas.length})`}>
                            <table className="modal-table">
                              <thead>
                                <tr>
                                  <th width="32px"></th>
                                  <th width="56px">Orden</th>
                                  <th>Artículo</th>
                                  <th>Descripción</th>
                                  <th className="RPC-text-right">Pedidas</th>
                                  <th className="RPC-text-right">Recibidas</th>
                                  <th className="RPC-text-right">Pendientes</th>
                                  <th width="100px">Estado</th>
                                  <th className="RPC-text-center" width="110px">Acción</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detalles.lineas.map((linea, index) => {
                                  const claveLinea = `${clavePedido}_${index}`;
                                  const lineaExpandida = lineasExpandidas[claveLinea] || false;
                                  const tieneVariantes = linea.variantes && linea.variantes.length > 0;
                                  const pendientes = parseFloat(linea.UnidadesPendientes) || 0;
                                  const recibidas = parseFloat(linea.UnidadesRecibidas) || 0;
                                  const completada = pendientes === 0 && recibidas > 0;

                                  return (
                                    <React.Fragment key={linea.Orden}>
                                      <tr className={`RPC-linea ${completada ? 'completada' : ''}`}>
                                        {/* Expandir variantes — solo si tiene variantes Y no está completada */}
                                        <td>
                                          {tieneVariantes && !completada && (
                                            <button
                                              className="RPC-expand-linea-btn"
                                              onClick={() => toggleLineaExpandida(clavePedido, index)}
                                              disabled={loadingDetalle}
                                              title={lineaExpandida ? 'Ocultar desglose' : 'Ver desglose por talla/color'}
                                            >
                                              {lineaExpandida ? '▼' : '▶'}
                                            </button>
                                          )}
                                        </td>
                                        <td className="RPC-orden">{linea.Orden}</td>
                                        <td>
                                          <div className="RPC-articulo-cell">
                                            <strong>{linea.CodigoArticulo}</strong>
                                            {linea.tipoVariante && renderVarianteBadge(linea.tipoVariante)}
                                          </div>
                                        </td>
                                        <td className="RPC-descripcion">{linea.DescripcionArticulo}</td>
                                        <td className="RPC-text-right">{parseFloat(linea.UnidadesPedidas).toLocaleString()}</td>
                                        <td className="RPC-text-right RPC-text-success">{recibidas.toLocaleString()}</td>
                                        <td className="RPC-text-right RPC-text-warning">{pendientes.toLocaleString()}</td>
                                        <td>{renderEstadoLinea(linea)}</td>
                                        <td className="RPC-text-center">
                                          {completada ? (
                                            // Completada: solo chip, sin botón
                                            <span className="RPC-estado-chip RPC-estado-completado">✓</span>
                                          ) : tieneVariantes ? (
                                            // Con variantes: botón expandir (la acción está en el desglose)
                                            <button
                                              className="RPC-btn RPC-btn-outline RPC-btn-xs"
                                              onClick={() => toggleLineaExpandida(clavePedido, index)}
                                              disabled={loadingDetalle || !datosFijados}
                                              title={!datosFijados ? 'Guarde los datos del proveedor primero' : 'Ver/ocultar desglose'}
                                            >
                                              {lineaExpandida ? 'Ocultar' : 'Desglose'}
                                            </button>
                                          ) : pendientes > 0 ? (
                                            // Sin variantes y con pendientes: botón recepcionar directo
                                            <button
                                              className="RPC-btn RPC-btn-primary RPC-btn-xs"
                                              onClick={() => handleAbrirModalRecepcion(linea)}
                                              disabled={loading || !datosFijados}
                                              title={!datosFijados ? 'Guarde los datos del proveedor primero' : ''}
                                            >
                                              + Recibir
                                            </button>
                                          ) : null}
                                        </td>
                                      </tr>

                                      {/* Desglose de variantes — solo si expandida y no completada */}
                                      {tieneVariantes && lineaExpandida && !completada && (
                                        <tr className="RPC-variantes-row">
                                          <td colSpan="9">
                                            <RecepcionVariantesPanel title={`Desglose: ${linea.CodigoArticulo} · ${linea.DescripcionArticulo}`}>
                                              <table className="modal-table RPC-variantes-table">
                                                <thead>
                                                  <tr>
                                                    <th>Color</th>
                                                    <th>Tallas pendientes</th>
                                                    <th className="RPC-text-right">Total pendiente</th>
                                                    <th className="RPC-text-center" width="100px">Recibir</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {linea.variantes.map((variante, idx) => {
                                                    const totalVariante = parseFloat(variante.unidadesTotal) || 0;
                                                    if (totalVariante <= 0) return null; // ocultar variantes ya completadas
                                                    return (
                                                      <tr key={idx} className="RPC-variante-fila">
                                                        <td>
                                                          {variante.nombreColor ? (
                                                            <div className="RPC-color-item">
                                                              <span className="RPC-color-dot" style={{
                                                                backgroundColor:
                                                                  variante.nombreColor.toLowerCase().includes('azul') ? '#3b82f6' :
                                                                  variante.nombreColor.toLowerCase().includes('rojo') || variante.nombreColor.toLowerCase().includes('red') ? '#ef4444' :
                                                                  variante.nombreColor.toLowerCase().includes('verde') ? '#22c55e' :
                                                                  variante.nombreColor.toLowerCase().includes('negro') || variante.nombreColor.toLowerCase().includes('black') ? '#1f2937' :
                                                                  variante.nombreColor.toLowerCase().includes('blanc') || variante.nombreColor.toLowerCase().includes('white') ? '#f3f4f6' :
                                                                  variante.nombreColor.toLowerCase().includes('amaril') || variante.nombreColor.toLowerCase().includes('yellow') ? '#eab308' :
                                                                  '#6b7280'
                                                              }} />
                                                              <span>{variante.nombreColor}</span>
                                                            </div>
                                                          ) : <span className="RPC-text-muted">—</span>}
                                                        </td>
                                                        <td>
                                                          {variante.unidadesPorTalla ? (
                                                            <div className="RPC-tallas-chips">
                                                              {Object.values(variante.unidadesPorTalla)
                                                                .filter(t => parseFloat(t.unidades) > 0)
                                                                .map((talla, tIdx) => (
                                                                  <button
                                                                    key={tIdx}
                                                                    className="RPC-talla-chip"
                                                                    onClick={() => handleAbrirModalRecepcion(linea, variante, talla)}
                                                                    disabled={loading || !datosFijados}
                                                                    title={`Recibir talla ${talla.nombre}: ${parseFloat(talla.unidades).toLocaleString()} uds.`}
                                                                  >
                                                                    <span className="RPC-talla-chip-nombre">{talla.nombre}</span>
                                                                    <span className="RPC-talla-chip-qty">{parseFloat(talla.unidades).toLocaleString()}</span>
                                                                  </button>
                                                                ))}
                                                            </div>
                                                          ) : <span className="RPC-text-muted">Sin desglose</span>}
                                                        </td>
                                                        <td className="RPC-text-right">
                                                          <strong>{totalVariante.toLocaleString()}</strong>
                                                        </td>
                                                        <td className="RPC-text-center">
                                                          {/* Un solo botón: recibir todo el color de una vez */}
                                                          <button
                                                            className="RPC-btn RPC-btn-primary RPC-btn-xs"
                                                            onClick={() => handleAbrirModalRecepcion(linea, variante, null)}
                                                            disabled={loading || !datosFijados}
                                                            title={`Recibir todo el color ${variante.nombreColor || ''}`}
                                                          >
                                                            + Todo
                                                          </button>
                                                        </td>
                                                      </tr>
                                                    );
                                                  })}
                                                </tbody>
                                              </table>
                                            </RecepcionVariantesPanel>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </RecepcionLineasTable>
                        )}
                      </PedidoCompraCard>
                    );
                  })}
                </div>
              </ProveedorGroupCard>
            );
          })}
        </div>
      )}

      {/* ── Paginación ── */}
      <RecepcionPagination
        visible={Object.keys(pedidosAgrupados).length > 0}
        page={pagination.page}
        totalPages={pagination.totalPages}
        hasPrev={pagination.hasPrev}
        hasNext={pagination.hasNext}
        loading={loading}
        onPrev={() => cambiarPagina(pagination.page - 1)}
        onNext={() => cambiarPagina(pagination.page + 1)}
      />

      {/* ── Modal Recepción ── */}
      {modalRecepcion && lineaARecepcionar && (
        <RecepcionDialog
          open={modalRecepcion}
          onClose={cerrarModalRecepcion}
          title="Recepcionar Artículo"
          subtitle={`${lineaARecepcionar.linea.CodigoArticulo} · ${lineaARecepcionar.linea.DescripcionArticulo}`}
          maxWidth="md"
          footer={
            <>
              <button className="RPC-btn RPC-btn-secondary" onClick={cerrarModalRecepcion} disabled={loadingRecepcion}>
                Cancelar
              </button>
              <button
                className="RPC-btn RPC-btn-primary"
                onClick={procesarRecepcionLinea}
                disabled={!selectedAlmacen || !selectedUbicacion || loadingRecepcion}
              >
                {loadingRecepcion ? '⏳ Procesando...' : '✓ Confirmar Recepción'}
              </button>
            </>
          }
        >
          {/* Info variante específica */}
          {lineaARecepcionar.variante && (
            <div className="RPC-modal-section">
              <div className="RPC-modal-variante-info">
                {lineaARecepcionar.variante.nombreColor && (
                  <div className="RPC-info-badge">
                    <span className="RPC-info-badge-label">Color</span>
                    <span className="RPC-info-badge-value">{lineaARecepcionar.variante.nombreColor}</span>
                  </div>
                )}
                {lineaARecepcionar.talla && (
                  <div className="RPC-info-badge">
                    <span className="RPC-info-badge-label">Talla</span>
                    <span className="RPC-info-badge-value">{lineaARecepcionar.talla.nombre}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Resumen línea */}
          <div className="RPC-modal-section">
            <h4 className="RPC-modal-section-title">Información de la línea</h4>
            <div className="RPC-info-grid-compact">
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Pedidas</span>
                <span className="RPC-info-v">{parseFloat(lineaARecepcionar.linea.UnidadesPedidas).toLocaleString()}</span>
              </div>
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Recibidas</span>
                <span className="RPC-info-v RPC-text-success">{parseFloat(lineaARecepcionar.linea.UnidadesRecibidas).toLocaleString()}</span>
              </div>
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Pendientes</span>
                <span className="RPC-info-v RPC-text-warning">{maxUnidadesModal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Almacén y ubicación (fijos, no editables) */}
          <div className="RPC-modal-section">
            <h4 className="RPC-modal-section-title">Destino del stock</h4>
            <div className="RPC-destino-fijo">
              <div className="RPC-destino-item">
                <span className="RPC-destino-icon">🏭</span>
                <div>
                  <span className="RPC-destino-label">Almacén</span>
                  <span className="RPC-destino-value">{selectedAlmacen} — Recepción temporal</span>
                </div>
              </div>
              <div className="RPC-destino-item">
                <span className="RPC-destino-icon">📍</span>
                <div>
                  <span className="RPC-destino-label">Ubicación</span>
                  <span className="RPC-destino-value">{selectedUbicacion} — Recepción temporal</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cantidad */}
          <div className="RPC-modal-section">
            <h4 className="RPC-modal-section-title">Cantidad a recepcionar</h4>
            <div className="RPC-cantidad-wrapper">
              <input
                type="number"
                className="RPC-cantidad-input"
                value={unidadesARecepcionar}
                onChange={(e) => setUnidadesARecepcionar(e.target.value)}
                min="1"
                max={maxUnidadesModal}
                step="1"
                disabled={loadingRecepcion}
              />
              <span className="RPC-cantidad-max">máx. {maxUnidadesModal.toLocaleString()}</span>
            </div>
          </div>

          {/* Distribución por variantes (solo si no es una variante específica) */}
          {!lineaARecepcionar.variante && variantesDistribucion.length > 0 && (
            <div className="RPC-modal-section">
              <h4 className="RPC-modal-section-title">
                Distribuir por variante
                <span className="RPC-modal-section-hint">
                  Total: {variantesDistribucion.reduce((s, v) => s + (parseFloat(v.unidades) || 0), 0)} / {unidadesARecepcionar}
                  {Math.abs(variantesDistribucion.reduce((s, v) => s + (parseFloat(v.unidades) || 0), 0) - parseFloat(unidadesARecepcionar)) > 0.001 && (
                    <span className="RPC-aviso-suma"> ⚠️ no coincide</span>
                  )}
                </span>
              </h4>
              {loadingVariantes ? (
                <div className="RPC-loading-inline">⏳ Cargando variantes...</div>
              ) : (
                <div className="RPC-variantes-dist">
                  {variantesDistribucion.map((v, index) => (
                    <div key={index} className="RPC-dist-row">
                      <div className="RPC-dist-label">
                        {v.nombreColor && <span className="RPC-dist-color">{v.nombreColor}</span>}
                        {v.nombreTalla && <span className="RPC-dist-talla">{v.nombreTalla}</span>}
                        {!v.nombreColor && !v.nombreTalla && <span className="RPC-text-muted">Sin variante</span>}
                        <span className="RPC-dist-max">(máx {v.maxUnidades})</span>
                      </div>
                      <div className="RPC-dist-controls">
                        <button
                          className="RPC-qty-btn"
                          onClick={() => {
                            const nd = [...variantesDistribucion];
                            nd[index].unidades = Math.max(0, nd[index].unidades - 1);
                            setVariantesDistribucion(nd);
                          }}
                          disabled={v.unidades <= 0 || loadingRecepcion}
                        >−</button>
                        <input
                          type="number"
                          className="RPC-dist-input"
                          value={v.unidades}
                          onChange={(e) => {
                            const val = Math.min(parseFloat(e.target.value) || 0, v.maxUnidades);
                            const nd = [...variantesDistribucion];
                            nd[index].unidades = val;
                            setVariantesDistribucion(nd);
                          }}
                          min="0"
                          max={v.maxUnidades}
                          disabled={loadingRecepcion}
                        />
                        <button
                          className="RPC-qty-btn"
                          onClick={() => {
                            const nd = [...variantesDistribucion];
                            nd[index].unidades = Math.min(nd[index].unidades + 1, v.maxUnidades);
                            setVariantesDistribucion(nd);
                          }}
                          disabled={v.unidades >= v.maxUnidades || loadingRecepcion}
                        >+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </RecepcionDialog>
      )}

      {/* ── Modal Generar Albarán ── */}
      {modalGenerarAlbaran && pedidoAAlbaran && (
        <GenerarAlbaranDialog
          open={modalGenerarAlbaran}
          onClose={cerrarModalAlbaran}
          footer={
            <>
              <button className="RPC-btn RPC-btn-secondary" onClick={cerrarModalAlbaran} disabled={loadingAlbaran}>
                Cancelar
              </button>
              <button className="RPC-btn RPC-btn-success" onClick={generarAlbaran} disabled={loadingAlbaran}>
                {loadingAlbaran ? '⏳ Generando...' : '📄 Generar Albarán'}
              </button>
            </>
          }
        >
          <div className="RPC-albaran-info">
            <div className="RPC-albaran-resumen">
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Pedido</span>
                <span className="RPC-info-v">#{pedidoAAlbaran.NumeroPedido} · {pedidoAAlbaran.NombreProveedor}</span>
              </div>
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Ejercicio</span>
                <span className="RPC-info-v">{pedidoAAlbaran.EjercicioPedido}</span>
              </div>
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Líneas a albaranar</span>
                <span className="RPC-info-v">{lineasConRecepcion.length}</span>
              </div>
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Unidades recibidas</span>
                <span className="RPC-info-v RPC-text-success">{totalUnidadesAlbaran.toLocaleString()}</span>
              </div>
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Importe estimado</span>
                <span className="RPC-info-v">{importeTotalAlbaran.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
              </div>
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Pendientes de recepcionar</span>
                <span className="RPC-info-v RPC-text-warning">{parseFloat(pedidoAAlbaran.TotalUnidadesPendientes).toLocaleString()}</span>
              </div>
            </div>

            <div className="RPC-albaran-nota">
              <span className="RPC-albaran-nota-icon">ℹ️</span>
              <span>
                Solo se incluyen las unidades <strong>no albaranadas previamente</strong>.
                {parseFloat(pedidoAAlbaran.TotalUnidadesPendientes) > 0
                  ? ' El pedido seguirá activo porque quedan unidades sin recepcionar.'
                  : ' El pedido se marcará como servido automáticamente.'}
              </span>
            </div>

            {lineasConRecepcion.length > 0 && (
              <div className="RPC-albaran-lineas">
                <table className="modal-table">
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th>Descripción</th>
                      <th className="RPC-text-right">Recibidas</th>
                      <th className="RPC-text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasConRecepcion.slice(0, 10).map((linea, i) => {
                      const pct = calcularPorcentajeRecepcion(parseFloat(linea.UnidadesPedidas), parseFloat(linea.UnidadesRecibidas));
                      return (
                        <tr key={i}>
                          <td><strong>{linea.CodigoArticulo}</strong></td>
                          <td>{linea.DescripcionArticulo}</td>
                          <td className="RPC-text-right RPC-text-success">{parseFloat(linea.UnidadesRecibidas).toLocaleString()}</td>
                          <td className="RPC-text-right">
                            <span className={pct >= 100 ? 'RPC-text-success' : 'RPC-text-warning'}>{Math.round(pct)}%</span>
                          </td>
                        </tr>
                      );
                    })}
                    {lineasConRecepcion.length > 10 && (
                      <tr><td colSpan={4} className="RPC-text-center RPC-text-muted">… y {lineasConRecepcion.length - 10} líneas más</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </GenerarAlbaranDialog>
      )}

      {/* ── Modal Finalizar Pedido ── */}
      {modalFinalizarPedido && pedidoAFinalizar && (
        <FinalizarPedidoDialog
          open={modalFinalizarPedido}
          onClose={cerrarModalFinalizar}
          footer={
            <>
              <button className="RPC-btn RPC-btn-secondary" onClick={cerrarModalFinalizar} disabled={loadingFinalizar}>
                Cancelar
              </button>
              <button className="RPC-btn RPC-btn-warning" onClick={finalizarPedido} disabled={loadingFinalizar}>
                {loadingFinalizar ? '⏳ Finalizando...' : '✅ Confirmar Finalización'}
              </button>
            </>
          }
        >
          <div className="RPC-finalizar-info">
            <div className="RPC-albaran-resumen">
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Pedido</span>
                <span className="RPC-info-v">#{pedidoAFinalizar.NumeroPedido}</span>
              </div>
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Proveedor</span>
                <span className="RPC-info-v">{pedidoAFinalizar.NombreProveedor}</span>
              </div>
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Fecha</span>
                <span className="RPC-info-v">{new Date(pedidoAFinalizar.FechaPedido).toLocaleDateString()}</span>
              </div>
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Pedidas</span>
                <span className="RPC-info-v">{parseFloat(pedidoAFinalizar.TotalUnidadesPedidas).toLocaleString()}</span>
              </div>
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Recibidas</span>
                <span className="RPC-info-v RPC-text-success">{parseFloat(pedidoAFinalizar.TotalUnidadesRecibidas).toLocaleString()}</span>
              </div>
              <div className="RPC-info-kv">
                <span className="RPC-info-k">Pendientes</span>
                <span className="RPC-info-v RPC-text-warning">{parseFloat(pedidoAFinalizar.TotalUnidadesPendientes).toLocaleString()}</span>
              </div>
            </div>

            {parseFloat(pedidoAFinalizar.TotalUnidadesPendientes) > 0 && (
              <div className="RPC-albaran-nota RPC-nota-danger">
                <span className="RPC-albaran-nota-icon">🚨</span>
                <span>
                  Este pedido tiene <strong>{parseFloat(pedidoAFinalizar.TotalUnidadesPendientes).toLocaleString()} unidades pendientes</strong>.
                  Al finalizar se marcará como servido y desaparecerá de la lista.
                </span>
              </div>
            )}
          </div>
        </FinalizarPedidoDialog>
      )}
    </div>
  );
};

export default RecepcionPedidosCompra;