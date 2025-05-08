// mockData.js
export const mockArticulos = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    nombre: `Artículo ${i + 1}`,
    cantidad: Math.floor(Math.random() * 91) + 10, // entre 10 y 100
  }));
  
  export const mockUbicaciones = [
    "Almacén Principal",
    "Estantería Central",
    "Pasillo 3",
    "Zona Exterior",
    "Contenedor A",
    "Altillo 1",
  ];
  