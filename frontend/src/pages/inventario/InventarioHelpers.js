// ── InventarioHelpers.js ──────────────────────────────────────────────────────
// Funciones puras, utilidades y constantes compartidas

export const getDefaultHistoryFilters = () => {
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(hoy.getDate() - 30);
  return {
    fechaDesde: desde.toISOString().split('T')[0],
    fechaHasta: hoy.toISOString().split('T')[0]
  };
};

export function normalizarTexto(valor) {
  if (valor === null || valor === undefined) return '';
  let texto = String(valor).trim();
  const reemplazos = [
    [/Ã³/g, 'ó'], [/Ã©/g, 'é'], [/Ã¡/g, 'á'], [/Ã­/g, 'í'], [/Ãº/g, 'ú'],
    [/Ã"/g, 'Ó'], [/Ã‰/g, 'É'], [/Ã/g, 'Á'], [/Ã/g, 'Í'], [/Ãš/g, 'Ú'],
    [/Ã±/g, 'ñ'], [/Ã'/g, 'Ñ'], [/Ã¼/g, 'ü'], [/Ãœ/g, 'Ü'],
    [/â€œ/g, '"'], [/â€/g, '"'], [/â€™/g, "'"], [/â€¦/g, '…'],
    [/SIN UBICACI[ÃƒÆ'Ã‚Â´Ã"Ã"ï¿½?]+N/gi, 'SIN UBICACIÓN'],
    [/SIN-UBICACION/g, 'SIN UBICACIÓN'],
  ];
  reemplazos.forEach(([patron, reemplazo]) => { texto = texto.replace(patron, reemplazo); });
  return texto;
}

export function normalizarUbicacionDisplay(ubicacion) {
  if (!ubicacion) return '';
  const u = String(ubicacion).trim().toUpperCase();
  if (u === 'SIN-UBICACION' || u === 'SIN UBICACION' || u === 'SIN UBICACIÓN') return 'SIN UBICACIÓN';
  return normalizarTexto(ubicacion);
}

export const normalizarUbicacionOption = (ubicacion) => {
  if (!ubicacion) return null;
  const codigo = String(ubicacion.Ubicacion ?? ubicacion.CodigoUbicacion ?? ubicacion.value ?? '').trim();
  if (!codigo) return null;
  const descripcion = String(ubicacion.DescripcionUbicacion ?? ubicacion.descripcion ?? ubicacion.label ?? '').trim();
  return { ...ubicacion, Ubicacion: codigo, DescripcionUbicacion: descripcion };
};

export const formatUbicacionLabel = (ubicacion) =>
  [ubicacion?.Ubicacion, ubicacion?.DescripcionUbicacion].filter(Boolean).join(' - ');

export const formatTallaColor = (talla, color) => {
  if (!talla && !color) return 'N/A';
  let result = '';
  if (talla && talla !== 'N/A') result += `T: ${normalizarTexto(talla)}`;
  if (color && color !== 'N/A') result += `${result ? ' | ' : ''}C: ${normalizarTexto(color)}`;
  return result || 'N/A';
};

export const formatearUnidad = (cantidad, unidad) => {
  let cantidadNum = parseFloat(cantidad);
  if (isNaN(cantidadNum)) cantidadNum = 0;
  const esNegativo = cantidadNum < 0;
  const esCero = cantidadNum === 0;
  const cantidadAbs = Math.abs(cantidadNum);
  if (!unidad || unidad.trim() === '') unidad = 'unidad';
  let cantidadFormateada = Number.isInteger(cantidadAbs) ? cantidadAbs : parseFloat(cantidadAbs.toFixed(2));
  const unidadesInvariables = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3', 'barra', 'metro', 'rollo'];
  const unidadLower = unidad.toLowerCase();
  if (unidadesInvariables.includes(unidadLower)) return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidad}`;
  const pluralesIrregulares = {
    'ud': 'uds', 'par': 'pares', 'metro': 'metros', 'pack': 'packs',
    'saco': 'sacos', 'barra': 'barras', 'caja': 'cajas', 'rollo': 'rollos',
    'lata': 'latas', 'bote': 'botes', 'tubo': 'tubos', 'unidad': 'unidades',
    'juego': 'juegos', 'kit': 'kits', 'paquete': 'paquetes', 'cajetin': 'cajetines',
    'bidon': 'bidones', 'palet': 'palets', 'bobina': 'bobinas', 'fardo': 'fardos',
    'cubeta': 'cubetas', 'garrafa': 'garrafas', 'tambor': 'tambores', 'cubos': 'cubos', 'pares': 'pares'
  };
  if (esCero) return `0 ${unidad}`;
  if (cantidadFormateada === 1) {
    if (unidadLower === 'unidad' || unidadLower === 'unidades') return `${esNegativo ? '-' : ''}1 unidad`;
    return `${esNegativo ? '-' : ''}1 ${unidad}`;
  } else {
    if (unidadLower === 'unidad' || unidadLower === 'unidades') return `${esNegativo ? '-' : ''}${cantidadFormateada} unidades`;
    if (pluralesIrregulares[unidadLower]) return `${esNegativo ? '-' : ''}${cantidadFormateada} ${pluralesIrregulares[unidadLower]}`;
    const ultimaLetra = unidad.charAt(unidad.length - 1);
    if (['a', 'e', 'i', 'o', 'u'].includes(ultimaLetra)) return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidad}s`;
    return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidad}es`;
  }
};

export const formatearFecha = (fechaStr) => {
  if (!fechaStr) return 'Fecha inválida';
  try {
    return new Date(fechaStr).toLocaleString('es-ES', {
      timeZone: 'Europe/Madrid', weekday: 'long', year: 'numeric',
      month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch { return 'Fecha inválida'; }
};

export const getColorStyle = (colorCode) => {
  const colorMap = {
    'A': { color: '#1E88E5', fontWeight: 'bold' },
    'V': { color: '#43A047', fontWeight: 'bold' },
    'R': { color: '#E53935', fontWeight: 'bold' },
    'N': { color: '#000000', fontWeight: 'bold' },
    'B': { color: '#FFFFFF', backgroundColor: '#333', padding: '2px 5px', borderRadius: '3px' },
  };
  return colorMap[colorCode] || {};
};

export const getStockStyle = (cantidad) => {
  if (cantidad === 0) return { color: '#ff9800', fontWeight: 'bold', backgroundColor: '#fff3e0', padding: '2px 6px', borderRadius: '4px', border: '1px solid #ffb74d' };
  if (cantidad < 0) return { color: '#e67e22', fontWeight: 'bold', backgroundColor: '#fef9e7', padding: '2px 6px', borderRadius: '4px', border: '1px solid #f39c12' };
  return { color: '#27ae60' };
};

export const getEstadoColor = (estado) => {
  switch (estado) {
    case 'positivo': return '#2ecc71';
    case 'negativo': return '#e67e22';
    case 'cero': return '#ff9800';
    case 'agotado': return '#e74c3c';
    default: return '#7f8c8d';
  }
};

export const estadoOrden = { positivo: 1, negativo: 2, cero: 3, agotado: 4 };

export const construirResumenAjustePendiente = (ajuste) => {
  const resumen = [];
  const ubicacion = [ajuste.codigoAlmacen, normalizarUbicacionDisplay(ajuste.ubicacionStr)].filter(Boolean).join(' / ');
  if (ubicacion) resumen.push({ label: 'Ubicación', value: ubicacion });
  if (ajuste.codigoTalla01) resumen.push({ label: 'Talla', value: ajuste.codigoTalla01 });
  if (ajuste.codigoColor) resumen.push({ label: 'Color', value: ajuste.codigoColor });
  if (ajuste.unidadStock && ajuste.unidadStock !== 'unidades') resumen.push({ label: 'Unidad', value: ajuste.unidadStock });
  if (ajuste.partida) resumen.push({ label: 'Partida/Lote', value: ajuste.partida });
  return resumen;
};