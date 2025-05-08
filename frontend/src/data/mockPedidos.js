// mockPedidos.js

export const mockPedidos = [
    {
      id: 33,
      cliente: 'Cliente A',
      lineas: [
        { id: 1, producto: 'Tornillos', cantidad: 15, ubicaciones: [{ nombre: 'Almacén Principal', stock: 10 }, { nombre: 'Estantería Central', stock: 7 }] },
        { id: 2, producto: 'Tuercas', cantidad: 23, ubicaciones: [{ nombre: 'Pasillo 3', stock: 25 }] },
        { id: 3, producto: 'Tubos de Aluminio', cantidad: 12, ubicaciones: [{ nombre: 'Zona Exterior', stock: 11 }] }, // incompleto
      ],
    },
  ];
  