import React, { useState, useEffect } from 'react';
import '../styles/TraspasoAlmacenesScreen.css';
import { useNavigate } from 'react-router-dom';

function TraspasoAlmacenesScreen() {
  const navigate = useNavigate();
  const [articulos, setArticulos] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [ubicacionesOrigen, setUbicacionesOrigen] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [traspasosPendientes, setTraspasosPendientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  
  const [traspasoData, setTraspasoData] = useState({
    articulo: '',
    almacenOrigen: '',
    ubicacionOrigen: '',
    almacenDestino: '',
    ubicacionDestino: '',
    cantidad: ''
  });

  // Datos mock iniciales
  useEffect(() => {
    setArticulos([
      { codigo: 'TRN-6X50', nombre: 'Tornillo hexagonal 6x50 mm', almacenes: ['Principal', 'Secundario'] },
      { codigo: 'TRC-M8', nombre: 'Tuerca M8 galvanizada', almacenes: ['Principal', 'Taller'] },
      { codigo: 'TUB-ALU-20', nombre: 'Tubo aluminio 20mm', almacenes: ['Metales', 'Principal'] },
      { codigo: 'BRD-40', nombre: 'Brida de acero 40mm', almacenes: ['Principal', 'Taller'] },
      { codigo: 'VLV-1/2', nombre: 'Válvula de bola 1/2"', almacenes: ['Fontanería', 'Principal'] }
    ]);

    setAlmacenes(['Principal', 'Secundario', 'Taller', 'Metales', 'Fontanería']);
  }, []);

  // Filtrar artículos por búsqueda
  const articulosFiltrados = articulos.filter(art => 
    art.codigo.toLowerCase().includes(busqueda.toLowerCase()) || 
    art.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Cargar ubicaciones cuando se selecciona artículo y almacén origen
  useEffect(() => {
    if (traspasoData.articulo && traspasoData.almacenOrigen) {
      const ubicacionesMock = {
        'Principal': ['Pasillo 1', 'Pasillo 2', 'Pasillo 3', 'Mostrador'],
        'Secundario': ['Estantería A', 'Estantería B', 'Zona Carga'],
        'Taller': ['Banco 1', 'Banco 2', 'Almacén Taller'],
        'Metales': ['Rack 1', 'Rack 2', 'Zona Corte'],
        'Fontanería': ['Estante Fontanería', 'Mostrador']
      };
      setUbicacionesOrigen(ubicacionesMock[traspasoData.almacenOrigen] || []);
      setTraspasoData(prev => ({ ...prev, ubicacionOrigen: '' }));
    }
  }, [traspasoData.articulo, traspasoData.almacenOrigen]);

  // Cargar ubicaciones cuando se selecciona almacén destino
  useEffect(() => {
    if (traspasoData.almacenDestino) {
      const ubicacionesMock = {
        'Principal': ['Pasillo 1', 'Pasillo 2', 'Pasillo 3', 'Mostrador'],
        'Secundario': ['Estantería A', 'Estantería B', 'Zona Carga'],
        'Taller': ['Banco 1', 'Banco 2', 'Almacén Taller'],
        'Metales': ['Rack 1', 'Rack 2', 'Zona Corte'],
        'Fontanería': ['Estante Fontanería', 'Mostrador']
      };
      setUbicacionesDestino(ubicacionesMock[traspasoData.almacenDestino] || []);
      setTraspasoData(prev => ({ ...prev, ubicacionDestino: '' }));
    }
  }, [traspasoData.almacenDestino]);

  const agregarTraspaso = () => {
    const { articulo, almacenOrigen, ubicacionOrigen, almacenDestino, ubicacionDestino, cantidad } = traspasoData;
    
    if (!articulo || !almacenOrigen || !ubicacionOrigen || !almacenDestino || !ubicacionDestino || !cantidad) {
      alert('⚠️ Completa todos los campos');
      return;
    }

    const articuloInfo = articulos.find(a => a.codigo === articulo);
    
    setTraspasosPendientes([...traspasosPendientes, {
      ...traspasoData,
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

    try {
      const response = await fetch('http://localhost:3000/confirmarTraspasos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(traspasosPendientes)
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ ${traspasosPendientes.length} traspasos realizados correctamente`);
        setTraspasosPendientes([]);
      } else {
        alert('❌ Error al realizar los traspasos');
      }
    } catch (error) {
      console.error('Error al realizar traspasos:', error);
      alert('❌ Error de conexión con el servidor');
    }
  };

  return (
    <div className="traspaso-container">
      <div className="traspaso-header">
        <h2>🏭 Traspaso entre Almacenes</h2>
        <button className="btn-volver" onClick={() => navigate('/PedidosScreen')}>🔙 Volver</button>
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
      </div>

      <div className="traspaso-content">
        <div className="traspaso-form">
          <h3>Nuevo Traspaso</h3>
          
          <div className="search-box">
            <input
              type="text"
              placeholder="🔍 Buscar artículo..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          
          <select
            value={traspasoData.articulo}
            onChange={(e) => setTraspasoData({ ...traspasoData, articulo: e.target.value })}
          >
            <option value="">📦 Selecciona un artículo</option>
            {articulosFiltrados.map((art) => (
              <option key={art.codigo} value={art.codigo}>
                {art.codigo} - {art.nombre}
              </option>
            ))}
          </select>

          <div className="form-row">
            <div className="form-group">
              <label>Almacén Origen</label>
              <select
                value={traspasoData.almacenOrigen}
                onChange={(e) => setTraspasoData({ ...traspasoData, almacenOrigen: e.target.value })}
                disabled={!traspasoData.articulo}
              >
                <option value="">🏢 Selecciona almacén origen</option>
                {articulos.find(a => a.codigo === traspasoData.articulo)?.almacenes.map((alm, i) => (
                  <option key={i} value={alm}>{alm}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Ubicación Origen</label>
              <select
                value={traspasoData.ubicacionOrigen}
                onChange={(e) => setTraspasoData({ ...traspasoData, ubicacionOrigen: e.target.value })}
                disabled={!traspasoData.almacenOrigen}
              >
                <option value="">📍 Selecciona ubicación origen</option>
                {ubicacionesOrigen.map((ubi, i) => (
                  <option key={i} value={ubi}>{ubi}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Almacén Destino</label>
              <select
                value={traspasoData.almacenDestino}
                onChange={(e) => setTraspasoData({ ...traspasoData, almacenDestino: e.target.value })}
              >
                <option value="">🏢 Selecciona almacén destino</option>
                {almacenes.map((alm, i) => (
                  <option key={i} value={alm}>{alm}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Ubicación Destino</label>
              <select
                value={traspasoData.ubicacionDestino}
                onChange={(e) => setTraspasoData({ ...traspasoData, ubicacionDestino: e.target.value })}
                disabled={!traspasoData.almacenDestino}
              >
                <option value="">📍 Selecciona ubicación destino</option>
                {ubicacionesDestino.map((ubi, i) => (
                  <option key={i} value={ubi}>{ubi}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Cantidad</label>
              <input
                type="number"
                placeholder="0"
                value={traspasoData.cantidad}
                onChange={(e) => setTraspasoData({ ...traspasoData, cantidad: e.target.value })}
              />
            </div>
            
            <button 
              onClick={agregarTraspaso}
              className="btn-agregar"
            >
              ➕ Agregar a la lista
            </button>
          </div>
        </div>

        <div className="traspasos-pendientes">
          <h3>Traspasos Pendientes ({traspasosPendientes.length})</h3>
          
          {traspasosPendientes.length > 0 ? (
            <>
              <table className="traspasos-table">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    <th>Cantidad</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {traspasosPendientes.map((traspaso) => (
                    <tr key={traspaso.id}>
                      <td>{traspaso.nombreArticulo}</td>
                      <td>{traspaso.almacenOrigen} - {traspaso.ubicacionOrigen}</td>
                      <td>{traspaso.almacenDestino} - {traspaso.ubicacionDestino}</td>
                      <td>{traspaso.cantidad}</td>
                      <td>
                        <button 
                          onClick={() => modificarTraspaso(traspaso.id)}
                          className="btn-modificar"
                        >
                          ✏️ Modificar
                        </button>
                        <button 
                          onClick={() => eliminarTraspaso(traspaso.id)}
                          className="btn-eliminar"
                        >
                          🗑️ Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              <button 
                onClick={confirmarTraspasos}
                className="btn-confirmar"
              >
                ✅ Confirmar Todos los Traspasos
              </button>
            </>
          ) : (
            <p className="no-traspasos">No hay traspasos pendientes</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default TraspasoAlmacenesScreen;