import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/InventarioScreen.css';

const InventarioScreen = () => {
  const navigate = useNavigate();
  const [inventario, setInventario] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [orden, setOrden] = useState('codigo');

  useEffect(() => {
    const fetchInventario = async () => {
      try {
        const response = await fetch('http://localhost:3000/inventario');
        const data = await response.json();
        setInventario(data);
      } catch (error) {
        console.error('Error cargando inventario:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInventario();
  }, []);

  const getEstadoStock = (stock) => {
    if (stock === 0) return 'sin-stock';
    if (stock < 0) return 'negativo';
    return 'normal';
  };

  const inventarioFiltrado = inventario
    .filter(item => 
      item.codigo.toLowerCase().includes(filtro.toLowerCase()) ||
      item.descripcion.toLowerCase().includes(filtro.toLowerCase())
    )
    .sort((a, b) => {
      if (orden === 'codigo') return a.codigo.localeCompare(b.codigo);
      if (orden === 'descripcion') return a.descripcion.localeCompare(b.descripcion);
      if (orden === 'stock') return a.stock - b.stock;
      return 0;
    });

  return (
    <div className="inventario-container">
      <h1>Inventario Global</h1>
      
      <div className="navigation-buttons">
        <button onClick={() => navigate('/rutas')} className="btn-nav">
          📦 Rutas
        </button>
        <button onClick={() => navigate('/pedidos')} className="btn-nav">
          📝 Pedidos
        </button>
        <button onClick={() => navigate('/traspaso')} className="btn-nav">
          🔄 Traspasos
        </button>
        <button onClick={() => navigate('/')} className="btn-nav">
          🏠 Inicio
        </button>
      </div>
      
      <div className="inventario-controls">
        <input
          type="text"
          placeholder="Buscar por código o descripción..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="search-input"
        />
        
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          className="sort-select"
        >
          <option value="codigo">Ordenar por Código</option>
          <option value="descripcion">Ordenar por Descripción</option>
          <option value="stock">Ordenar por Stock</option>
        </select>
      </div>
      
      {loading ? (
        <div className="loading">Cargando inventario...</div>
      ) : (
        <table className="inventario-table">
          <thead>
            <tr>
              <th>Código Artículo</th>
              <th>Descripción</th>
              <th>Stock Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {inventarioFiltrado.map((item, index) => (
              <tr 
                key={index} 
                className={`estado-${getEstadoStock(item.stock)}`}
              >
                <td>{item.codigo}</td>
                <td>{item.descripcion}</td>
                <td>{item.stock}</td>
                <td>
                  {getEstadoStock(item.stock) === 'sin-stock' && 'Sin stock'}
                  {getEstadoStock(item.stock) === 'negativo' && 'Stock negativo'}
                  {getEstadoStock(item.stock) === 'normal' && 'En stock'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      
      {!loading && inventarioFiltrado.length === 0 && (
        <div className="no-results">No se encontraron artículos</div>
      )}
    </div>
  );
};

export default InventarioScreen;