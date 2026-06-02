// src/pages/RecepcionPedidosCompra/index.js
import React, { useEffect, useState } from 'react';
import { usePermissions } from '../../PermissionsManager';
import {
  RecepcionHeader,
  RecepcionFilters,
  RecepcionAlerts,
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
import { Paper, Stack, Typography, TextField, Button, Alert } from '@mui/material';

const RecepcionPedidosCompra = () => {
  const permissions = usePermissions();
  const userData = JSON.parse(localStorage.getItem('user'));
  const user = userData || {};

  // FIX: usar canViewReceiving (StatusVerRecepcionMercancia) en lugar de canViewInventory
  const { canViewReceiving } = permissions;

  // Estados de UI locales (expansiones)
  const [proveedoresExpandidos, setProveedoresExpandidos] = useState({});
  const [pedidosExpandidos, setPedidosExpandidos] = useState({});
  const [lineasExpandidas, setLineasExpandidas] = useState({});
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  
  const [pedidosDatos, setPedidosDatos] = useState({});

  const {
    pedidosAgrupados,
    detallesPedidos,
    loading,
    error,
    setError,
    success,
    setSuccess,
    pagination,
    setPagination,
    filtros,
    setFiltros,
    cargarPedidos,
    cargarDetallesPedido
  } = usePedidosCompra(user);

  const guardarDatosPedido = (clavePedido, suAlbaranNo, fechaSuAlbaran) => {
    if (!suAlbaranNo || !fechaSuAlbaran) {
      setError('Debe completar el Nº de Albarán del Proveedor y la Fecha para este pedido.');
      return;
    }
    setPedidosDatos(prev => ({
      ...prev,
      [clavePedido]: { suAlbaranNo, fechaSuAlbaran, fijado: true }
    }));
    setSuccess(`Datos guardados para el pedido ${clavePedido}`);
  };

  const obtenerDatosPedido = (clavePedido) => {
    return pedidosDatos[clavePedido] || null;
  };

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
    variantesDistribucion,
    setVariantesDistribucion,
    loadingVariantes,
    loadingRecepcion,
    abrirModalRecepcion,
    cerrarModalRecepcion,
    procesarRecepcionLinea
  } = useRecepcionModal({
    user,
    cargarDetallesPedido,
    cargarPedidos,
    pagination,
    setError,
    setSuccess
  });

  const {
    modalGenerarAlbaran,
    pedidoAAlbaran,
    lineasConRecepcion,
    totalUnidadesAlbaran,
    importeTotalAlbaran,
    loadingAlbaran,
    prepararGenerarAlbaran,
    generarAlbaran,
    cerrarModalAlbaran
  } = useAlbaranModal({
    user,
    detallesPedidos,
    cargarDetallesPedido,
    cargarPedidos,
    pagination,
    setError,
    setSuccess
  });

  const {
    modalFinalizarPedido,
    pedidoAFinalizar,
    loadingFinalizar,
    prepararFinalizarPedido,
    finalizarPedido,
    cerrarModalFinalizar
  } = useFinalizarPedido({
    user,
    cargarPedidos,
    pagination,
    setError,
    setSuccess
  });

  const aplicarFiltros = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    cargarPedidos(1, true);
    setMostrarFiltros(false);
  };

  const limpiarFiltros = () => {
    setFiltros({
      proveedor: '',
      fechaDesde: '',
      fechaHasta: '',
      numeroPedido: ''
    });
    cargarPedidos(1, false);
    setMostrarFiltros(false);
  };

  const cambiarPagina = (nuevaPagina) => {
    if (nuevaPagina < 1 || nuevaPagina > pagination.totalPages) return;
    setPagination(prev => ({ ...prev, page: nuevaPagina }));
    cargarPedidos(nuevaPagina, true);
  };

  const toggleProveedorExpandido = (claveProveedor) => {
    setProveedoresExpandidos(prev => ({
      ...prev,
      [claveProveedor]: !prev[claveProveedor]
    }));
  };

  const toggleLineaExpandida = (clavePedido, lineaIndex) => {
    const clave = `${clavePedido}_${lineaIndex}`;
    setLineasExpandidas(prev => ({
      ...prev,
      [clave]: !prev[clave]
    }));
  };

  // FIX: guard correcto — solo cargar si tiene permiso de recepción
  useEffect(() => {
    if (user && user.UsuarioLogicNet && canViewReceiving) {
      cargarPedidos(1, false);
    }
  }, []);

  // FIX: guard de acceso con el permiso correcto
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
      <RecepcionHeader
        title="Recepción de Pedidos de Compra"
        subtitle="Visualice los pedidos agrupados por proveedor y recepcione artículos seleccionando almacén y ubicación."
        summary={`${pagination.total} pedidos • ${Object.keys(pedidosAgrupados).length} proveedores • Página ${pagination.page}/${pagination.totalPages}`}
        mostrarFiltros={mostrarFiltros}
        onToggleFiltros={() => setMostrarFiltros(!mostrarFiltros)}
        onRefresh={() => cargarPedidos(pagination.page, true)}
        loading={loading}
      />

      <RecepcionFilters
        visible={mostrarFiltros}
        filtros={filtros}
        onFiltrosChange={setFiltros}
        onClear={limpiarFiltros}
        onApply={aplicarFiltros}
      />

      <RecepcionAlerts
        error={error}
        success={success}
        onCloseError={() => setError(null)}
        onCloseSuccess={() => setSuccess(null)}
      />

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

                    const handleAbrirModalRecepcion = (linea, clavePedido, variante = null, talla = null) => {
                      if (!datosFijados) {
                        setError('Debe guardar los datos del albarán del proveedor para este pedido antes de recepcionar.');
                        return;
                      }
                      abrirModalRecepcion(linea, clavePedido, variante, talla, datosPedido);
                    };

                    const handlePrepararGenerarAlbaran = async (pedido) => {
                      if (!datosFijados) {
                        setError('Debe guardar los datos del albarán del proveedor para este pedido antes de generar albarán.');
                        return;
                      }
                      const clave = `${pedido.EjercicioPedido}_${pedido.SeriePedido || '0'}_${pedido.NumeroPedido}`;
                      let detalles = detallesPedidos[clave];
                      if (!detalles) {
                        detalles = await cargarDetallesPedido(pedido.EjercicioPedido, pedido.SeriePedido || '0', pedido.NumeroPedido, false);
                        if (!detalles) return;
                      }
                      await prepararGenerarAlbaran(pedido, datosPedido);
                    };

                    return (
                      <PedidoCompraCard
                        key={clavePedido}
                        pedido={pedido}
                        expandido={pedidoExpandido}
                        loading={loading}
                        tieneUnidadesRecibidas={tieneUnidadesRecibidas}
                        onToggle={async () => {
                          if (!detalles) {
                            await cargarDetallesPedido(
                              pedido.EjercicioPedido,
                              pedido.SeriePedido || '0',
                              pedido.NumeroPedido
                            );
                            setPedidosExpandidos(prev => ({ ...prev, [clavePedido]: true }));
                          } else {
                            setPedidosExpandidos(prev => ({ ...prev, [clavePedido]: !prev[clavePedido] }));
                          }
                        }}
                        onGenerarAlbaran={() => handlePrepararGenerarAlbaran(pedido)}
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
                                  <th width="40px"></th>
                                  <th width="60px">Orden</th>
                                  <th>Artículo</th>
                                  <th>Descripción</th>
                                  <th className="RPC-text-right">Pedidas</th>
                                  <th className="RPC-text-right">Recibidas</th>
                                  <th className="RPC-text-right">Pendientes</th>
                                  <th>Estado</th>
                                  <th className="RPC-text-center" width="120px">Acciones</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detalles.lineas.map((linea, index) => {
                                  const claveLinea = `${clavePedido}_${index}`;
                                  const lineaExpandida = lineasExpandidas[claveLinea] || false;
                                  const tieneVariantes = linea.variantes && linea.variantes.length > 0;
                                  const pendientes = parseFloat(linea.UnidadesPendientes) || 0;
                                  const recibidas = parseFloat(linea.UnidadesRecibidas) || 0;

                                  return (
                                    <React.Fragment key={linea.Orden}>
                                      <tr className={`RPC-linea ${pendientes === 0 ? 'completada' : ''}`}>
                                        <td>
                                          {tieneVariantes && (
                                            <button
                                              className="RPC-expand-linea-btn"
                                              onClick={() => toggleLineaExpandida(clavePedido, index)}
                                              disabled={loading}
                                            >
                                              {lineaExpandida ? '▼' : '►'}
                                            </button>
                                          )}
                                        </td>
                                        <td>{linea.Orden}</td>
                                        <td>
                                          <div>
                                            <strong>{linea.CodigoArticulo}</strong>
                                            {linea.tipoVariante && renderVarianteBadge(linea.tipoVariante)}
                                          </div>
                                        </td>
                                        <td>{linea.DescripcionArticulo}</td>
                                        <td className="RPC-text-right">{parseFloat(linea.UnidadesPedidas).toLocaleString()}</td>
                                        <td className="RPC-text-right RPC-text-success">{recibidas.toLocaleString()}</td>
                                        <td className="RPC-text-right RPC-text-warning">{pendientes.toLocaleString()}</td>
                                        <td>{renderEstadoLinea(linea)}</td>
                                        <td className="RPC-text-center">
                                          {pendientes > 0 ? (
                                            <button
                                              className="RPC-btn RPC-btn-primary RPC-btn-xs"
                                              onClick={() => handleAbrirModalRecepcion(linea, clavePedido)}
                                              disabled={loading || !datosFijados}
                                              title={!datosFijados ? "Debe guardar los datos del proveedor primero" : ""}
                                            >
                                              + Recepcionar
                                            </button>
                                          ) : recibidas > 0 ? (
                                            <span className="RPC-estado-chip RPC-estado-completado">✓ Completado</span>
                                          ) : null}
                                        </td>
                                      </tr>
                                      {tieneVariantes && lineaExpandida && (
                                        <tr className="RPC-variantes-row">
                                          <td colSpan="9">
                                            <RecepcionVariantesPanel>
                                              <table className="modal-table">
                                                <thead>
                                                  <tr>
                                                    <th>Color</th>
                                                    <th>Talla</th>
                                                    <th>Grupo Talla</th>
                                                    <th className="RPC-text-right">Unidades Total</th>
                                                    <th className="RPC-text-center">Desglose por Talla</th>
                                                    <th className="RPC-text-center">Acciones</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {linea.variantes.map((variante, idx) => (
                                                    <tr key={idx}>
                                                      <td>
                                                        {variante.nombreColor ? (
                                                          <div className="RPC-color-item">
                                                            <span className="RPC-color-circle" style={{
                                                              backgroundColor: variante.nombreColor.toLowerCase().includes('azul') ? '#007bff' :
                                                                               variante.nombreColor.toLowerCase().includes('rojo') ? '#dc3545' :
                                                                               variante.nombreColor.toLowerCase().includes('verde') ? '#28a745' :
                                                                               '#6c757d'
                                                            }}></span>
                                                            {variante.nombreColor}
                                                          </div>
                                                        ) : 'N/A'}
                                                      </td>
                                                      <td>
                                                        {variante.unidadesPorTalla ? (
                                                          <div>
                                                            {Object.values(variante.unidadesPorTalla)
                                                              .filter(t => parseFloat(t.unidades) > 0)
                                                              .map(t => t.nombre)
                                                              .join(', ')}
                                                          </div>
                                                        ) : variante.descripcionGrupoTalla || 'N/A'}
                                                      </td>
                                                      <td>{variante.grupoTalla || 'N/A'}</td>
                                                      <td className="RPC-text-right">
                                                        <strong>{parseFloat(variante.unidadesTotal).toLocaleString()}</strong>
                                                      </td>
                                                      <td>
                                                        {variante.unidadesPorTalla ? (
                                                          <div className="RPC-tallas-grid">
                                                            {Object.values(variante.unidadesPorTalla)
                                                              .filter(t => parseFloat(t.unidades) > 0)
                                                              .map((talla, tIdx) => (
                                                                <div key={tIdx} className="RPC-talla-item">
                                                                  <span className="RPC-talla-nombre">{talla.nombre}:</span>
                                                                  <span className="RPC-talla-cantidad">{parseFloat(talla.unidades).toLocaleString()}</span>
                                                                  <button
                                                                    className="RPC-btn RPC-btn-primary RPC-btn-xxs"
                                                                    onClick={() => handleAbrirModalRecepcion(linea, clavePedido, variante, talla)}
                                                                    disabled={loading || !datosFijados}
                                                                  >
                                                                    +
                                                                  </button>
                                                                </div>
                                                              ))}
                                                          </div>
                                                        ) : (
                                                          <div className="RPC-text-center">
                                                            <button
                                                              className="RPC-btn RPC-btn-primary RPC-btn-xs"
                                                              onClick={() => handleAbrirModalRecepcion(linea, clavePedido, variante, null)}
                                                              disabled={loading || !datosFijados}
                                                            >
                                                              + Recepcionar
                                                            </button>
                                                          </div>
                                                        )}
                                                      </td>
                                                      <td className="RPC-text-center">
                                                        <button
                                                          className="RPC-btn RPC-btn-primary RPC-btn-xs"
                                                          onClick={() => handleAbrirModalRecepcion(linea, clavePedido, variante, null)}
                                                          disabled={loading || !datosFijados}
                                                        >
                                                          + Todo
                                                        </button>
                                                      </td>
                                                    </tr>
                                                  ))}
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

      {modalRecepcion && lineaARecepcionar && (
        <RecepcionDialog
          open={modalRecepcion}
          onClose={cerrarModalRecepcion}
          title="Recepcionar Artículo"
          subtitle={`${lineaARecepcionar.linea.CodigoArticulo} - ${lineaARecepcionar.linea.DescripcionArticulo}`}
          maxWidth="md"
          footer={
            <>
              <button
                className="RPC-btn RPC-btn-secondary"
                onClick={cerrarModalRecepcion}
                disabled={loadingRecepcion}
              >
                Cancelar
              </button>
              <button
                className="RPC-btn RPC-btn-primary"
                onClick={procesarRecepcionLinea}
                disabled={!selectedAlmacen || !selectedUbicacion || loadingRecepcion}
              >
                {loadingRecepcion ? 'Procesando...' : '✓ Confirmar Recepción'}
              </button>
            </>
          }
        >
          {lineaARecepcionar.variante && (
            <div className="RPC-modal-section">
              <h4>Variante específica a recepcionar</h4>
              <div className="RPC-info-grid">
                {lineaARecepcionar.variante.nombreColor && (
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Color:</span>
                    <span className="RPC-info-value">{lineaARecepcionar.variante.nombreColor}</span>
                  </div>
                )}
                {lineaARecepcionar.talla && lineaARecepcionar.talla.nombre && (
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Talla:</span>
                    <span className="RPC-info-value">{lineaARecepcionar.talla.nombre}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="RPC-modal-section">
            <h4>Información de la línea</h4>
            <div className="RPC-info-grid">
              <div className="RPC-info-item">
                <span className="RPC-info-label">Unidades pedidas:</span>
                <span className="RPC-info-value">{parseFloat(lineaARecepcionar.linea.UnidadesPedidas).toLocaleString()}</span>
              </div>
              <div className="RPC-info-item">
                <span className="RPC-info-label">Unidades recibidas:</span>
                <span className="RPC-info-value RPC-text-success">{parseFloat(lineaARecepcionar.linea.UnidadesRecibidas).toLocaleString()}</span>
              </div>
              <div className="RPC-info-item">
                <span className="RPC-info-label">Unidades pendientes:</span>
                <span className="RPC-info-value RPC-text-warning">{parseFloat(lineaARecepcionar.linea.UnidadesPendientes).toLocaleString()}</span>
              </div>
            </div>
          </div>
          
          <div className="RPC-modal-section">
            <h4>Destino del Stock</h4>
            <div className="modal-form-grid">
              <div className="modal-form-group">
                <label htmlFor="almacen-select">Almacén *</label>
                <select
                  id="almacen-select"
                  value={selectedAlmacen}
                  onChange={(e) => setSelectedAlmacen(e.target.value)}
                  className="modal-form-control"
                  disabled
                >
                  {almacenes.map((almacen) => (
                    <option key={almacen.CodigoAlmacen} value={almacen.CodigoAlmacen}>
                      {almacen.CodigoAlmacen} - {almacen.Almacen}
                    </option>
                  ))}
                </select>
                <small className="RPC-form-text">Almacén temporal fijado para recepción: R</small>
              </div>
              
              <div className="modal-form-group">
                <label htmlFor="ubicacion-select">Ubicación *</label>
                <select
                  id="ubicacion-select"
                  value={selectedUbicacion}
                  onChange={(e) => setSelectedUbicacion(e.target.value)}
                  className="modal-form-control"
                  disabled
                >
                  {ubicaciones.map((ubicacion) => (
                    <option key={ubicacion.Ubicacion} value={ubicacion.Ubicacion}>
                      {ubicacion.Ubicacion} - {ubicacion.DescripcionUbicacion}
                    </option>
                  ))}
                </select>
                <small className="RPC-form-text">Ubicación temporal fijada para recepción: R1</small>
              </div>
            </div>
          </div>
          
          <div className="RPC-modal-section">
            <h4>Cantidad a Recepcionar</h4>
            <div className="modal-form-group">
              <input
                type="number"
                className="modal-form-control"
                value={unidadesARecepcionar}
                onChange={(e) => setUnidadesARecepcionar(e.target.value)}
                min="0"
                max={parseFloat(lineaARecepcionar.linea.UnidadesPendientes)}
                step="1"
                disabled={loadingRecepcion}
              />
              <small className="RPC-form-text">
                Máximo disponible: {parseFloat(lineaARecepcionar.linea.UnidadesPendientes).toLocaleString()} unidades
              </small>
            </div>
          </div>
          
          {!lineaARecepcionar.variante && variantesDistribucion.length > 0 && (
            <div className="RPC-modal-section">
              <h4>Distribución por Variantes</h4>
              <div className="RPC-variantes-container">
                <div className="modal-alert modal-alert-info">
                  <div className="modal-alert-icon">ℹ️</div>
                  <div className="modal-alert-content">
                    <h5>Distribución de unidades</h5>
                    <p>Distribuya las <strong>{unidadesARecepcionar} unidades</strong> entre las variantes disponibles</p>
                  </div>
                </div>
                
                {loadingVariantes ? (
                  <div className="modal-loading">
                    <div className="modal-loading-spinner"></div>
                    <p>Cargando variantes...</p>
                  </div>
                ) : (
                  <>
                    <div className="modal-table-container">
                      <table className="modal-table">
                        <thead>
                          <tr>
                            <th>Color</th>
                            <th>Talla</th>
                            <th>Grupo Talla</th>
                            <th className="RPC-text-right">Máximo</th>
                            <th className="RPC-text-right">Unidades</th>
                            <th width="80px"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {variantesDistribucion.map((variante, index) => (
                            <tr key={index} className="RPC-variante-row">
                              <td>
                                {variante.nombreColor ? (
                                  <div className="RPC-color-item">
                                    <span className="RPC-color-circle" style={{
                                      backgroundColor: variante.nombreColor.toLowerCase().includes('azul') ? '#007bff' :
                                                       variante.nombreColor.toLowerCase().includes('rojo') ? '#dc3545' :
                                                       variante.nombreColor.toLowerCase().includes('verde') ? '#28a745' :
                                                       '#6c757d'
                                    }}></span>
                                    {variante.nombreColor}
                                  </div>
                                ) : 'Sin color'}
                              </td>
                              <td>{variante.nombreTalla || 'Sin talla'}</td>
                              <td>{variante.grupoTalla || 'N/A'}</td>
                              <td className="RPC-text-right">
                                <span className="RPC-max-unidades">{parseFloat(variante.maxUnidades).toLocaleString()}</span>
                              </td>
                              <td className="RPC-text-right">
                                <input
                                  type="number"
                                  className="RPC-input-cantidad"
                                  value={variante.unidades}
                                  onChange={(e) => {
                                    const nuevasUnidades = parseFloat(e.target.value) || 0;
                                    if (nuevasUnidades <= variante.maxUnidades) {
                                      const nuevaDistribucion = [...variantesDistribucion];
                                      nuevaDistribucion[index].unidades = nuevasUnidades;
                                      setVariantesDistribucion(nuevaDistribucion);
                                    }
                                  }}
                                  min="0"
                                  max={variante.maxUnidades}
                                  step="1"
                                  disabled={loadingRecepcion}
                                />
                              </td>
                              <td>
                                <div className="RPC-variante-controls">
                                  <button
                                    className="RPC-btn-icon"
                                    onClick={() => {
                                      const nuevasUnidades = Math.min(variante.unidades + 1, variante.maxUnidades);
                                      const nuevaDistribucion = [...variantesDistribucion];
                                      nuevaDistribucion[index].unidades = nuevasUnidades;
                                      setVariantesDistribucion(nuevaDistribucion);
                                    }}
                                    disabled={variante.unidades >= variante.maxUnidades || loadingRecepcion}
                                  >
                                    +
                                  </button>
                                  <button
                                    className="RPC-btn-icon"
                                    onClick={() => {
                                      const nuevasUnidades = Math.max(variante.unidades - 1, 0);
                                      const nuevaDistribucion = [...variantesDistribucion];
                                      nuevaDistribucion[index].unidades = nuevasUnidades;
                                      setVariantesDistribucion(nuevaDistribucion);
                                    }}
                                    disabled={variante.unidades <= 0 || loadingRecepcion}
                                  >
                                    -
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    <div className="validation-message">
                      <span className="validation-icon">📊</span>
                      <span>
                        <strong>Total distribuido:</strong> 
                        <span className="RPC-total-numero">
                          {variantesDistribucion.reduce((sum, v) => sum + (parseFloat(v.unidades) || 0), 0)} 
                        </span>
                        <span className="RPC-total-divisor"> / {unidadesARecepcionar} unidades</span>
                        {Math.abs(variantesDistribucion.reduce((sum, v) => sum + (parseFloat(v.unidades) || 0), 0) - parseFloat(unidadesARecepcionar)) > 0.001 && (
                          <span className="RPC-total-error"> ⚠️ Las unidades no coinciden</span>
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </RecepcionDialog>
      )}

      {modalGenerarAlbaran && pedidoAAlbaran && (
        <GenerarAlbaranDialog
          open={modalGenerarAlbaran}
          onClose={cerrarModalAlbaran}
          footer={
            <>
              <button
                className="RPC-btn RPC-btn-secondary"
                onClick={cerrarModalAlbaran}
                disabled={loadingAlbaran}
              >
                Cancelar
              </button>
              <button
                className="RPC-btn RPC-btn-success"
                onClick={generarAlbaran}
                disabled={loadingAlbaran}
              >
                {loadingAlbaran ? 'Generando...' : '📄 Generar Albarán Cerrado'}
              </button>
            </>
          }
        >
          <div className="modal-alert modal-alert-info">
            <div className="modal-alert-icon">ℹ️</div>
            <div className="modal-alert-content">
              <h5>Información del albarán NO ACUMULATIVO</h5>
              <p>
                <strong>Pedido:</strong> #{pedidoAAlbaran.NumeroPedido} - {pedidoAAlbaran.NombreProveedor}<br/>
                <strong>Ejercicio:</strong> {pedidoAAlbaran.EjercicioPedido}<br/>
                <strong>Tipo:</strong> Solo unidades no albaranadas previamente
              </p>
            </div>
          </div>
          
          <div className="RPC-modal-section">
            <h4>Resumen del Albarán a generar</h4>
            <div className="RPC-info-grid">
              <div className="RPC-info-item">
                <span className="RPC-info-label">Líneas con recepción:</span>
                <span className="RPC-info-value">{lineasConRecepcion.length}</span>
              </div>
              <div className="RPC-info-item">
                <span className="RPC-info-label">Unidades recibidas:</span>
                <span className="RPC-info-value RPC-text-success">
                  {totalUnidadesAlbaran.toLocaleString()}
                </span>
              </div>
              <div className="RPC-info-item">
                <span className="RPC-info-label">Importe estimado:</span>
                <span className="RPC-info-value RPC-text-success">
                  {importeTotalAlbaran.toLocaleString('es-ES', {
                    style: 'currency',
                    currency: 'EUR'
                  })}
                </span>
              </div>
              <div className="RPC-info-item">
                <span className="RPC-info-label">Unidades pendientes:</span>
                <span className="RPC-info-value RPC-text-warning">
                  {parseFloat(pedidoAAlbaran.TotalUnidadesPendientes).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          
          {lineasConRecepcion.length > 0 && (
            <div className="RPC-modal-section">
              <h4>Detalle de líneas para el albarán</h4>
              <div className="modal-table-container">
                <table className="modal-table">
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th>Descripción</th>
                      <th className="RPC-text-right">Pedidas</th>
                      <th className="RPC-text-right">Recibidas</th>
                      <th className="RPC-text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasConRecepcion.slice(0, 10).map((linea, index) => {
                      const porcentaje = calcularPorcentajeRecepcion(
                        parseFloat(linea.UnidadesPedidas),
                        parseFloat(linea.UnidadesRecibidas)
                      );
                      return (
                        <tr key={index}>
                          <td>{linea.CodigoArticulo}</td>
                          <td>{linea.DescripcionArticulo}</td>
                          <td className="RPC-text-right">{parseFloat(linea.UnidadesPedidas).toLocaleString()}</td>
                          <td className="RPC-text-right RPC-text-success">
                            {parseFloat(linea.UnidadesRecibidas).toLocaleString()}
                          </td>
                          <td className="RPC-text-right">
                            <span className={porcentaje >= 100 ? "RPC-text-success" : "RPC-text-warning"}>
                              {Math.round(porcentaje)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {lineasConRecepcion.length > 10 && (
                      <tr>
                        <td colSpan={5} className="RPC-text-center">
                          <em>... y {lineasConRecepcion.length - 10} líneas más</em>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          <div className="modal-alert modal-alert-warning">
            <div className="modal-alert-icon">⚠️</div>
            <div className="modal-alert-content">
              <h5>Importante - Albarán NO ACUMULATIVO</h5>
              <p>
                El albarán se generará automáticamente con un número único y será <strong>cerrado</strong>.
                <strong> SOLO INCLUIRÁ las unidades que no hayan sido albaranadas previamente.</strong>
                {parseFloat(pedidoAAlbaran.TotalUnidadesPendientes) > 0 ? (
                  <span> El pedido seguirá pendiente porque hay unidades sin recepcionar.</span>
                ) : (
                  <span> El pedido se marcará como <strong>servido</strong> automáticamente.</span>
                )}
              </p>
            </div>
          </div>
        </GenerarAlbaranDialog>
      )}

      {modalFinalizarPedido && pedidoAFinalizar && (
        <FinalizarPedidoDialog
          open={modalFinalizarPedido}
          onClose={cerrarModalFinalizar}
          footer={
            <>
              <button
                className="RPC-btn RPC-btn-secondary"
                onClick={cerrarModalFinalizar}
                disabled={loadingFinalizar}
              >
                Cancelar
              </button>
              <button
                className="RPC-btn RPC-btn-warning"
                onClick={finalizarPedido}
                disabled={loadingFinalizar}
              >
                {loadingFinalizar ? 'Finalizando...' : '✅ Confirmar Finalización'}
              </button>
            </>
          }
        >
          <div className="modal-alert modal-alert-warning">
            <div className="modal-alert-icon">⚠️</div>
            <div className="modal-alert-content">
              <h5>¿Está seguro que desea finalizar este pedido?</h5>
              <p>El pedido se marcará como <strong>SERVIDO (Estado 2)</strong> y desaparecerá de la lista de pedidos pendientes.</p>
            </div>
          </div>
          
          <div className="RPC-modal-section">
            <h4>Información del Pedido</h4>
            <div className="RPC-info-grid">
              <div className="RPC-info-item">
                <span className="RPC-info-label">Número:</span>
                <span className="RPC-info-value">#{pedidoAFinalizar.NumeroPedido}</span>
              </div>
              <div className="RPC-info-item">
                <span className="RPC-info-label">Proveedor:</span>
                <span className="RPC-info-value">{pedidoAFinalizar.NombreProveedor}</span>
              </div>
              <div className="RPC-info-item">
                <span className="RPC-info-label">Fecha:</span>
                <span className="RPC-info-value">
                  {new Date(pedidoAFinalizar.FechaPedido).toLocaleDateString()}
                </span>
              </div>
              <div className="RPC-info-item">
                <span className="RPC-info-label">Ejercicio:</span>
                <span className="RPC-info-value">{pedidoAFinalizar.EjercicioPedido}</span>
              </div>
            </div>
          </div>
          
          <div className="RPC-modal-section">
            <h4>Estado Actual</h4>
            <div className="RPC-info-grid">
              <div className="RPC-info-item">
                <span className="RPC-info-label">Unidades pedidas:</span>
                <span className="RPC-info-value">{parseFloat(pedidoAFinalizar.TotalUnidadesPedidas).toLocaleString()}</span>
              </div>
              <div className="RPC-info-item">
                <span className="RPC-info-label">Unidades recibidas:</span>
                <span className="RPC-info-value RPC-text-success">
                  {parseFloat(pedidoAFinalizar.TotalUnidadesRecibidas).toLocaleString()}
                </span>
              </div>
              <div className="RPC-info-item">
                <span className="RPC-info-label">Unidades pendientes:</span>
                <span className="RPC-info-value RPC-text-warning">
                  {parseFloat(pedidoAFinalizar.TotalUnidadesPendientes).toLocaleString()}
                </span>
              </div>
              <div className="RPC-info-item">
                <span className="RPC-info-label">Líneas:</span>
                <span className="RPC-info-value">{pedidoAFinalizar.TotalLineas}</span>
              </div>
            </div>
            
            {parseFloat(pedidoAFinalizar.TotalUnidadesPendientes) > 0 && (
              <div className="modal-alert modal-alert-danger">
                <div className="modal-alert-icon">🚨</div>
                <div className="modal-alert-content">
                  <h5>Atención</h5>
                  <p>Este pedido tiene 
                    <strong> {parseFloat(pedidoAFinalizar.TotalUnidadesPendientes).toLocaleString()} unidades pendientes</strong>.
                    ¿Desea finalizarlo igualmente?
                  </p>
                </div>
              </div>
            )}
          </div>
        </FinalizarPedidoDialog>
      )}
    </div>
  );
};

export default RecepcionPedidosCompra;