const mockArticulos = [
  { codigo: 'TRN-6X50', nombre: 'Tornillo hexagonal 6x50 mm', almacenes: ['Principal', 'Secundario'], stock: 1500 },
  { codigo: 'TRC-M8', nombre: 'Tuerca M8 galvanizada', almacenes: ['Principal', 'Taller'], stock: 3200 },
  { codigo: 'TUB-ALU-20', nombre: 'Tubo aluminio 20mm', almacenes: ['Metales', 'Principal'], stock: 480 },
  { codigo: 'BRD-40', nombre: 'Brida de acero 40mm', almacenes: ['Principal', 'Taller'], stock: 250 },
  { codigo: 'VLV-1/2', nombre: 'Válvula de bola 1/2"', almacenes: ['Fontanería', 'Principal'], stock: 120 },
  { codigo: 'CNC-5M', nombre: 'Conector rápido para tubo 5mm', almacenes: ['Fontanería', 'Principal'], stock: 780 },
  { codigo: 'BRZ-1/4', nombre: 'Brida zincada 1/4"', almacenes: ['Taller', 'Secundario'], stock: 420 },
  { codigo: 'JUN-RED-32', nombre: 'Junta tórica roja 32mm', almacenes: ['Principal', 'Hidráulica'], stock: 950 },
  { codigo: 'TUB-PVC-40', nombre: 'Tubo PVC 40mm presión', almacenes: ['Fontanería', 'Plásticos'], stock: 350 },
  { codigo: 'VAL-RET-20', nombre: 'Válvula retención 20mm', almacenes: ['Fontanería', 'Principal'], stock: 180 },

  // Sin stock en Zona Descarga
  { codigo: 'MCK-ZD-01', nombre: 'Artículo sin stock 1', almacenes: ['Secundario'], stock: 1 },
  { codigo: 'MCK-ZD-02', nombre: 'Artículo sin stock 2', almacenes: ['Secundario'], stock: 0 },
  { codigo: 'MCK-ZD-03', nombre: 'Artículo sin stock 3', almacenes: ['Secundario'], stock: 0 },

  // Stock negativo
  { codigo: 'NEG-ART-01', nombre: 'Artículo negativo 1', almacenes: ['Principal'], stock: -3 },
  { codigo: 'NEG-ART-02', nombre: 'Artículo negativo 2', almacenes: ['Taller'], stock: -7 },
  { codigo: 'NEG-ART-03', nombre: 'Artículo negativo 3', almacenes: ['Metales'], stock: -1 }
];

export default mockArticulos;
