// src/permisos.js
export const PERMISOS = {
  ADMINISTRADOR: {
    PEDIDOS: {
      VALIDAR_LINEAS: 'validar_lineas'
    },
    TRASPASOS: {
      HACER_TRASPASOS: 'hacer_traspasos'
    },
    INVENTARIO: {
      REGULARIZAR_INVENTARIO: 'regularizar_inventario'
    },
    RUTAS: {
      VER_ALBARANES_COMPLETO: 'ver_albaranes_completo'
    }
  },
  REPARTIDOR: {
    PEDIDOS: {
      VALIDAR_LINEAS: 'validar_lineas'
    },
    TRASPASOS: {
      HACER_TRASPASOS: 'hacer_traspasos'
    },
    INVENTARIO: {
      REGULARIZAR_INVENTARIO: 'regularizar_inventario'
    },
    RUTAS: {
      VER_ALBARANES_PARCIAL: 'ver_albaranes_parcial'
    }
  }
};

export const getPermisos = (categoria) => {
  if (categoria === 'Administrador') {
    return PERMISOS.ADMINISTRADOR;
  } else if (categoria === 'Repartidor') {
    return PERMISOS.REPARTIDOR;
  } else {
    return {};
  }
};