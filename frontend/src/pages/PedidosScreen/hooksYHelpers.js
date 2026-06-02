// hooksYHelpers.js
import { useState, useEffect } from 'react';

// ----------------------
// Custom Hooks
// ----------------------

/**
 * Hook para debounce de valores (útil para búsquedas)
 * @param {any} value - Valor a debouncear
 * @param {number} delay - Milisegundos de retraso
 * @returns {any} Valor debounceado
 */
export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

// ----------------------
// Constantes
// ----------------------

// FIX: Añadido "Todos" al rango de fechas
export const opcionesRangoFechas = [
  { value: 'semana', label: 'Una semana' },
  { value: 'dia', label: 'Un día' },
  { value: 'todos', label: 'Todos' },
];

export const opcionesStatus = [
  { id: '', nombre: 'Todos los estados' },
  { id: 'PendienteProveedor', nombre: 'Pendiente Proveedor' },
  { id: 'Parcial', nombre: 'Parcial' },
  { id: 'Pendiente', nombre: 'Pendiente' }
];

// ----------------------
// Helpers de unidades
// ----------------------

/**
 * Normaliza el nombre de la unidad para comparaciones
 * @param {string} unidad - Unidad a normalizar
 * @returns {string} Unidad normalizada en minúsculas
 */
export const normalizarUnidad = (unidad) => {
  if (!unidad || unidad.trim() === '' || unidad === 'unidades' || unidad === 'unidad' || unidad === 'ud') {
    return 'unidades';
  }
  return unidad.toLowerCase().trim();
};

/**
 * Formatea una cantidad con su unidad (plurales, decimales, etc.)
 * @param {number|string} cantidad - Cantidad a formatear
 * @param {string} unidad - Unidad de medida
 * @returns {string} Cantidad formateada con su unidad
 */
export const formatearUnidad = (cantidad, unidad) => {
  if (!cantidad && cantidad !== 0) return '0 ud';

  let unidadDisplay = unidad;
  if (!unidadDisplay || unidadDisplay.trim() === '' || unidadDisplay === 'unidades') {
    unidadDisplay = 'ud';
  }

  let cantidadNum = typeof cantidad === 'string' ? parseFloat(cantidad) : cantidad;

  if (isNaN(cantidadNum)) return `${cantidad} ${unidadDisplay}`;

  const unidadesDecimales = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3'];
  const esUnidadDecimal = unidadesDecimales.includes(unidadDisplay.toLowerCase());

  if (!esUnidadDecimal) {
    cantidadNum = Math.round(cantidadNum);
  } else {
    cantidadNum = parseFloat(cantidadNum.toFixed(2));
  }

  const unidadesInvariables = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3'];
  const unidadLower = unidadDisplay.toLowerCase();

  if (unidadesInvariables.includes(unidadLower)) {
    return `${cantidadNum} ${unidadDisplay}`;
  }

  const pluralesIrregulares = {
    ud: 'uds',
    par: 'pares',
    metro: 'metros',
    pack: 'packs',
    saco: 'sacos',
    barra: 'barras',
    caja: 'cajas',
    rollo: 'rollos',
    lata: 'latas',
    bote: 'botes',
    tubo: 'tubos',
    unidad: 'unidades',
    juego: 'juegos',
    kit: 'kits',
    paquete: 'paquetes',
    cajetin: 'cajetines',
    bidon: 'bidones',
    palet: 'palets',
    bobina: 'bobinas',
    fardo: 'fardos',
    cubeta: 'cubetas',
    garrafa: 'garrafas',
    tambor: 'tambores',
    cubos: 'cubos',
    pares: 'pares'
  };

  if (cantidadNum === 1) {
    if (unidadLower === 'unidad' || unidadLower === 'unidades' || unidadLower === 'ud') {
      return '1 unidad';
    }
    return `1 ${unidadDisplay}`;
  } else {
    if (unidadLower === 'unidad' || unidadLower === 'unidades' || unidadLower === 'ud') {
      return `${cantidadNum} unidades`;
    }

    if (pluralesIrregulares[unidadLower]) {
      return `${cantidadNum} ${pluralesIrregulares[unidadLower]}`;
    }

    const ultimaLetra = unidadDisplay.charAt(unidadDisplay.length - 1);
    if (['a', 'e', 'i', 'o', 'u'].includes(ultimaLetra)) {
      return `${cantidadNum} ${unidadDisplay}s`;
    } else {
      return `${cantidadNum} ${unidadDisplay}es`;
    }
  }
};

/**
 * Limpia y valida cantidades enteras positivas (elimina decimales, negativos, etc.)
 * @param {string} value - Valor a sanitizar
 * @returns {string} Número entero como string, o cadena vacía si no es válido
 */
export const sanitizarCantidadEntera = (value) => {
  if (value === null || value === undefined) return '';

  const texto = String(value).trim();
  if (texto === '') return '';
  if (texto.includes('-')) return '';

  const [parteEntera] = texto.split(/[.,]/);
  const soloDigitos = (parteEntera || '').replace(/\D/g, '');

  if (!soloDigitos) return '';

  const normalizado = soloDigitos.replace(/^0+(?=\d)/, '');
  return normalizado;
};

/**
 * Construye el value para selects de ubicación (une varios campos)
 * @param {Object} ubicacion - Objeto con datos de ubicación
 * @returns {string} Valor concatenado con separador '||'
 */
export const buildUbicacionOptionValue = (ubicacion) => [
  ubicacion?.codigoAlmacen ?? ubicacion?.CodigoAlmacen ?? '',
  ubicacion?.ubicacion ?? ubicacion?.Ubicacion ?? '',
  ubicacion?.partida ?? ubicacion?.Partida ?? '',
  ubicacion?.unidadMedida ?? ubicacion?.UnidadMedida ?? '',
  ubicacion?.codigoColor ?? ubicacion?.CodigoColor_ ?? '',
  ubicacion?.codigoTalla ?? ubicacion?.CodigoTalla01_ ?? ''
].join('||');

// ----------------------
// Validación de expedición
// FIX: Eliminada validación de 'Zona descarga' y 'SIN-UBICACION' — ya no se muestran
// ----------------------

/**
 * Valida si una expedición es correcta (cantidad, stock, ubicación)
 * @param {Object} linea - Línea del pedido (contiene unidadesPendientes, etc.)
 * @param {Object} expedicion - Datos de expedición seleccionada (ubicacion, almacen, cantidad, etc.)
 * @param {Object} ubicaciones - Objeto con stock por artículo (clave: códigoArtículo, valor: array de ubicaciones)
 * @returns {{ isValid: boolean, message?: string, cantidad?: number }} Resultado de la validación
 */
export const validarExpedicionLinea = (linea, expedicion, ubicaciones) => {
  const cantidadTexto = sanitizarCantidadEntera(expedicion?.cantidad);
  const cantidad = parseInt(cantidadTexto, 10);

  if (!cantidadTexto || Number.isNaN(cantidad) || cantidad < 1) {
    return { isValid: false, message: 'Cantidad mínima: 1' };
  }

  const unidadesPendientes = parseInt(parseFloat(linea.unidadesPendientes) || 0, 10);
  if (cantidad > unidadesPendientes) {
    return { isValid: false, message: 'Supera pendiente' };
  }

  if (!expedicion?.ubicacion || !expedicion?.almacen) {
    return { isValid: false, message: 'Seleccione una ubicación válida' };
  }

  // FIX: Solo ubicaciones reales — se valida siempre el stock
  const ubicacionActual = (ubicaciones[linea.codigoArticulo] || []).find(
    (ubi) =>
      ubi.ubicacion === expedicion.ubicacion &&
      ubi.codigoAlmacen === expedicion.almacen &&
      (ubi.partida || '') === (expedicion.partida || '') &&
      (ubi.codigoColor || '') === (expedicion.codigoColor || '') &&
      (ubi.codigoTalla || '') === (expedicion.codigoTalla || '') &&
      normalizarUnidad(ubi.unidadMedida) === normalizarUnidad(expedicion.unidadMedida || linea.unidadPedido)
  );

  const stockDisponible = parseInt(parseFloat(ubicacionActual?.unidadSaldo) || 0, 10);
  if (!ubicacionActual || stockDisponible <= 0) {
    return { isValid: false, message: 'La ubicación no tiene stock disponible' };
  }

  if (cantidad > stockDisponible) {
    return { isValid: false, message: 'Supera stock disponible' };
  }

  return { isValid: true, cantidad };
};

// ----------------------
// Toast / Notificación fallback (sin MUI)
// ----------------------

/**
 * Muestra un toast visual en la página (fallback cuando no hay notificaciones del sistema)
 * @param {string} titulo - Título del mensaje
 * @param {string} cuerpo - Cuerpo del mensaje (puede incluir saltos de línea)
 * @param {'success'|'error'|'info'} tipo - Tipo de notificación (influye en el color)
 */
export const mostrarToastEnPagina = (titulo, cuerpo, tipo = 'info') => {
  const toast = document.createElement('div');
  toast.className = `ps-toast ps-toast-${tipo}`;
  toast.innerHTML = `
    <div class="ps-toast-header">
      <strong>${titulo}</strong>
      <button class="ps-toast-close">&times;</button>
    </div>
    <div class="ps-toast-body">${cuerpo.replace(/\n/g, '<br>')}</div>
  `;

  const bgColor = tipo === 'success' ? '#38a169' : tipo === 'error' ? '#e53e3e' : '#3182ce';
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    min-width: 300px;
    max-width: 400px;
    background: ${bgColor};
    color: white;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 9999;
    animation: slideInNotification 0.3s ease-out;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  `;

  const closeBtn = toast.querySelector('.ps-toast-close');
  closeBtn.onclick = () => {
    toast.style.animation = 'slideOutNotification 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  };

  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.animation = 'slideOutNotification 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);

  document.body.appendChild(toast);
};