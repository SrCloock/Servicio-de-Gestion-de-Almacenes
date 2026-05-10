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
    if (parseFloat(pedido.TotalUnidadesRecibidas) > 0) {
      agrupados[claveProveedor].tieneUnidadesParaAlbaran = true;
    }
  });
  return agrupados;
};

export const calcularPorcentajeRecepcion = (unidadesPedidas, unidadesRecibidas) => {
  if (!unidadesPedidas || unidadesPedidas === 0) return 0;
  return (unidadesRecibidas / unidadesPedidas) * 100;
};

export const renderEstadoLinea = (linea) => {
  const porcentaje = calcularPorcentajeRecepcion(
    parseFloat(linea.UnidadesPedidas),
    parseFloat(linea.UnidadesRecibidas)
  );
  if (porcentaje >= 100) return <span className="RPC-estado-chip RPC-estado-completado">✓ Completado</span>;
  if (porcentaje > 0) return <span className="RPC-estado-chip RPC-estado-parcial">{porcentaje.toFixed(0)}%</span>;
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