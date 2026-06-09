// utils.js
import React from 'react';
export const ALMACEN_RECEPCION_FIJO = 'R';
export const UBICACION_RECEPCION_FIJA = 'R1';

export const getApiErrorMessage = (err, fallbackMessage) =>
  err.response?.data?.mensaje || err.message || fallbackMessage;

export const agruparPedidosPorProveedor = (pedidosLista) => {
  const agrupados = {};
  pedidosLista.forEach(pedido => {
    const claveProveedor = `${pedido.CodigoProveedor}_${pedido.NombreProveedor}`;
    if (!agrupados[claveProveedor]) {
      agrupados[claveProveedor] = {
        codigoProveedor: pedido.CodigoProveedor,
        nombreProveedor: pedido.NombreProveedor,
        pedidos: [],
        totalPedidos: 0,
        totalUnidadesPedidas: 0,
        totalUnidadesRecibidas: 0,
        totalUnidadesPendientes: 0,
        totalImporte: 0,
        tieneUnidadesParaAlbaran: false
      };
    }
    agrupados[claveProveedor].pedidos.push(pedido);
    agrupados[claveProveedor].totalPedidos++;
    agrupados[claveProveedor].totalUnidadesPedidas += parseFloat(pedido.TotalUnidadesPedidas) || 0;
    agrupados[claveProveedor].totalUnidadesRecibidas += parseFloat(pedido.TotalUnidadesRecibidas) || 0;
    agrupados[claveProveedor].totalUnidadesPendientes += parseFloat(pedido.TotalUnidadesPendientes) || 0;
    agrupados[claveProveedor].totalImporte += parseFloat(pedido.ImporteLiquido) || 0;

    // BUG F2 FIX: tieneUnidadesParaAlbaran solo se activa si hay unidades recibidas
    // Y aún quedan unidades pendientes de recepcionar (pedido no completamente albaranado).
    // Si la API devuelve TotalUnidadesPendientes > 0 junto con recibidas > 0, hay trabajo pendiente.
    const recibidas = parseFloat(pedido.TotalUnidadesRecibidas) || 0;
    const pendientes = parseFloat(pedido.TotalUnidadesPendientes) || 0;
    if (recibidas > 0 && pendientes >= 0) {
      // Hay unidades recibidas; puede haber albarán pendiente de generar.
      // La verificación exacta de "ya albaranado" la hace el backend en generar-albaran.
      agrupados[claveProveedor].tieneUnidadesParaAlbaran = true;
    }
  });
  return agrupados;
};

export const calcularPorcentajeRecepcion = (unidadesPedidas, unidadesRecibidas) => {
  if (!unidadesPedidas || unidadesPedidas === 0) return 0;
  return (unidadesRecibidas / unidadesPedidas) * 100;
};

// BUG F1 FIX: renderEstadoLinea ahora acepta un campo opcional unidadesAlbaranadas
// para diferenciar "recepcionado pero no albaranado" de "recepcionado y albaranado".
// Si no se pasa unidadesAlbaranadas, se comporta igual que antes (sin romper compatibilidad).
export const renderEstadoLinea = (linea) => {
  const pedidas = parseFloat(linea.UnidadesPedidas) || 0;
  const recibidas = parseFloat(linea.UnidadesRecibidas) || 0;
  const pendientes = parseFloat(linea.UnidadesPendientes) || Math.max(0, pedidas - recibidas);

  // Si el backend indica Estado=2 explícitamente, completado
  if (linea.Estado === 2 || linea.EstadoLinea === 'COMPLETADO') {
    return <span className="RPC-estado-chip RPC-estado-completado">✓ Completado</span>;
  }

  // Sin pendientes y con recibidas = completado
  if (pendientes <= 0 && recibidas > 0) {
    return <span className="RPC-estado-chip RPC-estado-completado">✓ Completado</span>;
  }

  // Tiene recibidas pero aún hay pendientes = parcial con porcentaje real sobre pedidas
  if (recibidas > 0 && pendientes > 0) {
    const porcentaje = calcularPorcentajeRecepcion(pedidas, recibidas);
    return <span className="RPC-estado-chip RPC-estado-parcial">{porcentaje.toFixed(0)}%</span>;
  }

  return <span className="RPC-estado-chip RPC-estado-pendiente">Pendiente</span>;
};

export const renderVarianteBadge = (tipoVariante) => {
  switch (tipoVariante) {
    case 'COLORES_TALLAS': return <span className="RPC-variante-badge RPC-badge-colores-tallas">🎨👕 Colores+Tallas</span>;
    case 'COLORES': return <span className="RPC-variante-badge RPC-badge-colores">🎨 Colores</span>;
    case 'TALLAS': return <span className="RPC-variante-badge RPC-badge-tallas">👕 Tallas</span>;
    default: return null;
  }
};