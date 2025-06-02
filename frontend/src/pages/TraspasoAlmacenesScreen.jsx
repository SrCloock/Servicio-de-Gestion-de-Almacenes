// src/pages/TraspasoAlmacenesScreen.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSearch, FaPlus, FaEdit, FaTrash, FaCheck, FaBox, FaWarehouse, FaMapMarkerAlt, FaHashtag } from 'react-icons/fa';

const TraspasoAlmacenesScreen = () => {
  const navigate = useNavigate();
  const [articulos, setArticulos] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [ubicacionesOrigen, setUbicacionesOrigen] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [traspasosPendientes, setTraspasosPendientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const [traspasoData, setTraspasoData] = useState({
    articulo: '',
    almacenOrigen: '',
    ubicacionOrigen: '',
    almacenDestino: '',
    ubicacionDestino: '',
    cantidad: ''
  });

  // Datos mock mejorados con más artículos
  useEffect(() => {
    setIsLoading(true);
    
    // Simular carga de datos
    setTimeout(() => {
      setArticulos([
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
        { codigo: 'CRT-EST-500', nombre: 'Cartucho estanco 500ml', almacenes: ['Químicos', 'Taller'], stock: 90 },
        { codigo: 'BND-INOX', nombre: 'Banda inoxidable 10mm', almacenes: ['Metales', 'Principal'], stock: 210 },
        { codigo: 'PNL-ACR-100', nombre: 'Panel acrílico 100x200cm', almacenes: ['Plásticos', 'Principal'], stock: 45 },
        { codigo: 'BRD-PVC-32', nombre: 'Brida PVC 32mm', almacenes: ['Fontanería', 'Plásticos'], stock: 320 },
        { codigo: 'JGO-HRL-1/2', nombre: 'Juego de herrajes 1/2"', almacenes: ['Taller', 'Principal'], stock: 85 },
        { codigo: 'TUB-CPR-25', nombre: 'Tubo cobre 25mm', almacenes: ['Metales', 'Fontanería'], stock: 270 },
        { codigo: 'CNC-RAP-15', nombre: 'Conector rápido 15mm', almacenes: ['Fontanería', 'Principal'], stock: 550 },
        { codigo: 'VAL-ESF-3/4', nombre: 'Válvula esférica 3/4"', almacenes: ['Fontanería', 'Principal'], stock: 140 }
      ]);

      setAlmacenes(['Principal', 'Secundario', 'Taller', 'Metales', 'Fontanería', 'Plásticos', 'Hidráulica', 'Químicos']);
      setIsLoading(false);
    }, 800);
  }, []);

  // Filtrar artículos por búsqueda
  const articulosFiltrados = busqueda 
    ? articulos.filter(art => 
        art.codigo.toLowerCase().includes(busqueda.toLowerCase()) || 
        art.nombre.toLowerCase().includes(busqueda.toLowerCase())
      )
    : articulos;

  // Cargar ubicaciones cuando se selecciona artículo y almacén origen
  useEffect(() => {
    if (traspasoData.articulo && traspasoData.almacenOrigen) {
      const ubicacionesMock = {
        'Principal': ['Pasillo 1 - Estante A', 'Pasillo 2 - Estante B', 'Pasillo 3 - Estante C', 'Mostrador Norte', 'Estantería Alta'],
        'Secundario': ['Estantería A - Nivel 1', 'Estantería B - Nivel 2', 'Zona Carga - Palet 3', 'Sector 5 - Rack 4'],
        'Taller': ['Banco 1 - Cajón 2', 'Banco 2 - Cajón 4', 'Almacén Taller - Estante 3', 'Herramientas - Rack 1'],
        'Metales': ['Rack 1 - Nivel 3', 'Rack 2 - Nivel 1', 'Zona Corte - Área 2', 'Perfiles - Estante 5'],
        'Fontanería': ['Estante Fontanería - Cajón 3', 'Mostrador Central', 'Cajón 5 - Accesorios'],
        'Plásticos': ['Zona PVC - Estantería C', 'Estantería B - Nivel 4', 'Rack 3 - Área 1'],
        'Hidráulica': ['Estante H1 - Cajón 2', 'Estante H2 - Cajón 4', 'Cajones Principales'],
        'Químicos': ['Armario Seguro - Sector 1', 'Estante Q1 - Nivel 2', 'Zona Ventilada - Área 3']
      };
      setUbicacionesOrigen(ubicacionesMock[traspasoData.almacenOrigen] || []);
      setTraspasoData(prev => ({ ...prev, ubicacionOrigen: '' }));
    }
  }, [traspasoData.articulo, traspasoData.almacenOrigen]);

  // Cargar ubicaciones cuando se selecciona almacén destino
  useEffect(() => {
    if (traspasoData.almacenDestino) {
      const ubicacionesMock = {
        'Principal': ['Pasillo 1 - Estante A', 'Pasillo 2 - Estante B', 'Pasillo 3 - Estante C', 'Mostrador Norte', 'Estantería Alta'],
        'Secundario': ['Estantería A - Nivel 1', 'Estantería B - Nivel 2', 'Zona Carga - Palet 3', 'Sector 5 - Rack 4'],
        'Taller': ['Banco 1 - Cajón 2', 'Banco 2 - Cajón 4', 'Almacén Taller - Estante 3', 'Herramientas - Rack 1'],
        'Metales': ['Rack 1 - Nivel 3', 'Rack 2 - Nivel 1', 'Zona Corte - Área 2', 'Perfiles - Estante 5'],
        'Fontanería': ['Estante Fontanería - Cajón 3', 'Mostrador Central', 'Cajón 5 - Accesorios'],
        'Plásticos': ['Zona PVC - Estantería C', 'Estantería B - Nivel 4', 'Rack 3 - Área 1'],
        'Hidráulica': ['Estante H1 - Cajón 2', 'Estante H2 - Cajón 4', 'Cajones Principales'],
        'Químicos': ['Armario Seguro - Sector 1', 'Estante Q1 - Nivel 2', 'Zona Ventilada - Área 3']
      };
      setUbicacionesDestino(ubicacionesMock[traspasoData.almacenDestino] || []);
      setTraspasoData(prev => ({ ...prev, ubicacionDestino: '' }));
    }
  }, [traspasoData.almacenDestino]);

  const agregarTraspaso = () => {
    const { articulo, almacenOrigen, ubicacionOrigen, almacenDestino, ubicacionDestino, cantidad } = traspasoData;
    const cantidadNum = parseInt(cantidad, 10);
    
    if (!articulo || !almacenOrigen || !ubicacionOrigen || !almacenDestino || !ubicacionDestino || !cantidad || cantidadNum <= 0) {
      alert('⚠️ Completa todos los campos correctamente. La cantidad debe ser mayor que 0.');
      return;
    }
    
    // Verificar si el almacén destino es igual al origen
    if (almacenOrigen === almacenDestino) {
      alert('El almacén destino debe ser diferente al almacén origen');
      return;
    }

    const articuloInfo = articulos.find(a => a.codigo === articulo);
    
    // Verificar stock disponible
    if (cantidadNum > articuloInfo.stock) {
      alert(`⚠️ Stock insuficiente. Disponible: ${articuloInfo.stock} unidades`);
      return;
    }
    
    setTraspasosPendientes([...traspasosPendientes, {
      ...traspasoData,
      cantidad: cantidadNum,
      nombreArticulo: articuloInfo.nombre,
      id: Date.now()
    }]);

    setTraspasoData({
      articulo: '',
      almacenOrigen: '',
      ubicacionOrigen: '',
      almacenDestino: '',
      ubicacionDestino: '',
      cantidad: ''
    });
  };

  const modificarTraspaso = (id) => {
    const traspaso = traspasosPendientes.find(t => t.id === id);
    if (traspaso) {
      setTraspasoData({
        articulo: traspaso.articulo,
        almacenOrigen: traspaso.almacenOrigen,
        ubicacionOrigen: traspaso.ubicacionOrigen,
        almacenDestino: traspaso.almacenDestino,
        ubicacionDestino: traspaso.ubicacionDestino,
        cantidad: traspaso.cantidad
      });
      
      setTraspasosPendientes(traspasosPendientes.filter(t => t.id !== id));
    }
  };

  const eliminarTraspaso = (id) => {
    setTraspasosPendientes(traspasosPendientes.filter(t => t.id !== id));
  };

  const confirmarTraspasos = async () => {
    if (traspasosPendientes.length === 0) {
      alert('⚠️ No hay traspasos pendientes');
      return;
    }

    setIsLoading(true);
    
    try {
      // Simular llamada a API
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setShowSuccess(true);
      setTraspasosPendientes([]);
      
      setTimeout(() => {
        setShowSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error al realizar traspasos:', error);
      alert('❌ Error de conexión con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
              <FaWarehouse className="text-indigo-600" />
              Traspaso entre Almacenes
            </h1>
            <p className="text-gray-600 mt-1">Gestiona movimientos de inventario entre diferentes almacenes</p>
          </div>
          
          <button 
            onClick={() => navigate('/PedidosScreen')}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg"
          >
            <FaArrowLeft />
            Volver al Menú
          </button>
          
          {/* Elementos decorativos */}
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-indigo-100 opacity-50"></div>
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-blue-100 opacity-50"></div>
        </div>
        
        {/* Contenido principal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Formulario de nuevo traspaso */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-100 p-3 rounded-lg">
                <FaPlus className="text-blue-600 text-xl" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Nuevo Traspaso</h2>
            </div>
            
            {/* Búsqueda de artículo */}
            <div className="mb-6">
              <label className="block text-gray-700 font-medium mb-2 flex items-center gap-2">
                <FaSearch className="text-gray-500" />
                Buscar artículo
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar por código o nombre..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
              </div>
            </div>
            
            {/* Selección de artículo */}
            <div className="mb-6">
              <label className="block text-gray-700 font-medium mb-2 flex items-center gap-2">
                <FaBox className="text-indigo-500" />
                Artículo
              </label>
              <select
                value={traspasoData.articulo}
                onChange={(e) => setTraspasoData({ ...traspasoData, articulo: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              >
                <option value="">Selecciona un artículo</option>
                {articulosFiltrados.map((art) => (
                  <option key={art.codigo} value={art.codigo}>
                {art.codigo} - {art.nombre} {art.stock > 0 ? `(Stock: ${art.stock})` : '(Sin stock)'}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Origen */}
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <h3 className="font-bold text-blue-800 mb-4 flex items-center gap-2">
                <FaMapMarkerAlt className="text-blue-600" />
                Origen
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-2">Almacén</label>
                  <select
                    value={traspasoData.almacenOrigen}
                    onChange={(e) => setTraspasoData({ ...traspasoData, almacenOrigen: e.target.value })}
                    disabled={!traspasoData.articulo}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    <option value="">Selecciona almacén</option>
                    {articulos.find(a => a.codigo === traspasoData.articulo)?.almacenes.map((alm, i) => (
                      <option key={i} value={alm}>{alm}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-gray-700 font-medium mb-2">Ubicación</label>
                  <select
                    value={traspasoData.ubicacionOrigen}
                    onChange={(e) => setTraspasoData({ ...traspasoData, ubicacionOrigen: e.target.value })}
                    disabled={!traspasoData.almacenOrigen}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    <option value="">Selecciona ubicación</option>
                    {ubicacionesOrigen.map((ubi, i) => (
                      <option key={i} value={ubi}>{ubi}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            {/* Destino */}
            <div className="bg-green-50 rounded-lg p-4 mb-6">
              <h3 className="font-bold text-green-800 mb-4 flex items-center gap-2">
                <FaMapMarkerAlt className="text-green-600" />
                Destino
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-2">Almacén</label>
                  <select
                    value={traspasoData.almacenDestino}
                    onChange={(e) => setTraspasoData({ ...traspasoData, almacenDestino: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    <option value="">Selecciona almacén</option>
                    {almacenes.map((alm, i) => (
                      <option key={i} value={alm}>{alm}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-gray-700 font-medium mb-2">Ubicación</label>
                  <select
                    value={traspasoData.ubicacionDestino}
                    onChange={(e) => setTraspasoData({ ...traspasoData, ubicacionDestino: e.target.value })}
                    disabled={!traspasoData.almacenDestino}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    <option value="">Selecciona ubicación</option>
                    {ubicacionesDestino.map((ubi, i) => (
                      <option key={i} value={ubi}>{ubi}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            {/* Cantidad y botón */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-gray-700 font-medium mb-2 flex items-center gap-2">
                  <FaHashtag className="text-purple-500" />
                  Cantidad
                </label>
                <input
                  type="number"
                  placeholder="0"
                  min="1"
                  value={traspasoData.cantidad}
                  onChange={(e) => setTraspasoData({ ...traspasoData, cantidad: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div className="flex items-end">
                <button 
                  onClick={agregarTraspaso}
                  className="w-full sm:w-auto flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-6 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg font-medium"
                >
                  <FaPlus />
                  Agregar a la lista
                </button>
              </div>
            </div>
          </div>
          
          {/* Traspasos pendientes */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-yellow-100 p-3 rounded-lg">
                  <FaBox className="text-yellow-600 text-xl" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Traspasos Pendientes</h2>
              </div>
              <span className="bg-indigo-100 text-indigo-800 py-1 px-3 rounded-full font-medium">
                {traspasosPendientes.length} items
              </span>
            </div>
            
            {traspasosPendientes.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Artículo</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Origen</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Destino</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cantidad</th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {traspasosPendientes.map((traspaso) => (
                        <tr key={traspaso.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium text-gray-900">{traspaso.nombreArticulo}</div>
                            <div className="text-sm text-gray-500">{traspaso.articulo}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-900">{traspaso.almacenOrigen}</div>
                            <div className="text-sm text-gray-500">{traspaso.ubicacionOrigen}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-green-700">{traspaso.almacenDestino}</div>
                            <div className="text-sm text-green-600">{traspaso.ubicacionDestino}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full bg-indigo-100 text-indigo-800">
                              {traspaso.cantidad}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => modificarTraspaso(traspaso.id)}
                                className="flex items-center gap-1 text-blue-600 hover:text-blue-900"
                              >
                                <FaEdit />
                                <span className="hidden md:inline">Editar</span>
                              </button>
                              <button 
                                onClick={() => eliminarTraspaso(traspaso.id)}
                                className="flex items-center gap-1 text-red-600 hover:text-red-900"
                              >
                                <FaTrash />
                                <span className="hidden md:inline">Eliminar</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="mt-6">
                  <button 
                    onClick={confirmarTraspasos}
                    disabled={isLoading}
                    className="w-full flex justify-center items-center gap-2 bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg font-medium disabled:opacity-70"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Procesando...
                      </>
                    ) : (
                      <>
                        <FaCheck />
                        Confirmar Todos los Traspasos
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <div className="mx-auto bg-gray-100 rounded-full p-4 w-16 h-16 flex items-center justify-center mb-4">
                  <FaBox className="text-gray-400 text-2xl" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">No hay traspasos pendientes</h3>
                <p className="text-gray-500">Agrega artículos usando el formulario</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Notificación de éxito */}
      {showSuccess && (
        <div className="fixed bottom-6 right-6 bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 animate-fade-in">
          <FaCheck className="text-xl" />
          <div>
            <p className="font-medium">¡Traspasos realizados con éxito!</p>
            <p className="text-sm opacity-90">{traspasosPendientes.length} artículos transferidos</p>
          </div>
        </div>
      )}
      
      {/* Overlay de carga */}
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full mx-4">
            <div className="flex justify-center mb-6">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
            </div>
            <h3 className="text-lg font-medium text-center text-gray-900 mb-2">Procesando traspasos</h3>
            <p className="text-gray-600 text-center">Por favor, espera mientras se completan los movimientos de inventario</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TraspasoAlmacenesScreen;