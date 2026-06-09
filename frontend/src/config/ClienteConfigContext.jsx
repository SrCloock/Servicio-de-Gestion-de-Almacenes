import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../helpers/api';

// ── Valores por defecto (mientras carga o si falla) ──────────
const DEFAULT_CONFIG = {
  nombreCliente:        '',
  usaMultipleUbicacion: false,
  usaLotes:             false,
  usaPartidas:          false,
  usaComponentes:       false,
  almacenesPermitidos:  [],
  pedidosVenta: {
    mostrarPrecio:          false,
    permitirCantidadParcial: true,
  },
  albaranes: {
    requiereFirma: false,
    requiereFoto:  false,
  },
  inventario: {
    habilitado:            true,
    permitirNuevoArticulo: false,
  },
  traspasos: {
    habilitado: true,
  },
  recepcionCompras: {
    habilitado: true,
  },
};

const ClienteConfigContext = createContext({
  config:  DEFAULT_CONFIG,
  loading: true,
  error:   null,
});

export const ClienteConfigProvider = ({ children }) => {
  const [config,  setConfig]  = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    api.get('/api/config')
      .then(res => {
        if (res.data?.success) {
          setConfig({ ...DEFAULT_CONFIG, ...res.data.config });
        }
      })
      .catch(err => {
        console.warn('[ClienteConfig] No se pudo cargar la config del servidor. Usando valores por defecto.', err.message);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <ClienteConfigContext.Provider value={{ config, loading, error }}>
      {children}
    </ClienteConfigContext.Provider>
  );
};

/**
 * Hook principal para consumir la configuración del cliente.
 *
 * Uso:
 *   const { config, loading } = useClienteConfig();
 *   if (config.usaLotes) { ... }
 */
export const useClienteConfig = () => useContext(ClienteConfigContext);