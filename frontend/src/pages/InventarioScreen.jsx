import React, { useState, useEffect } from 'react';
import '../styles/InventarioScreen.css';

const InventarioScreen = () => {
  const [inventario, setInventario] = useState([]);
  const [conStock, setConStock] = useState([]);
  const [sinStock, setSinStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [orden, setOrden] = useState({ campo: 'codigo', direccion: 'asc' });
  const [paginaActual, setPaginaActual] = useState(1);
  const articulosPorPagina = 30;

  useEffect(() => {
    const fetchInventario = async () => {
      try {
        const response = await fetch('http://localhost:3000/inventario');
        const data = await response.json();
        
        // Filtrar y clasificar
        const conStockTemp = [];
        const sinStockTemp = [];
        
        data.forEach(item => {
          if (item.stock === 0) {
            sinStockTemp.push(item);
          } else {
            conStockTemp.push(item);
          }
        });
        
        setInventario(data);
        setConStock(conStockTemp);
        setSinStock(sinStockTemp);
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

  // Filtrar y ordenar
  const conStockFiltrado = conStock
    .filter(item => 
      item.codigo.toLowerCase().includes(filtro.toLowerCase()) ||
      item.descripcion.toLowerCase().includes(filtro.toLowerCase())
    )
    .sort((a, b) => {
      let cmp = 0;
      if (orden.campo === 'codigo') {
        cmp = a.codigo.localeCompare(b.codigo);
      } else if (orden.campo === 'descripcion') {
        cmp = a.descripcion.localeCompare(b.descripcion);
      } else if (orden.campo === 'stock') {
        cmp = a.stock - b.stock;
      }
      return orden.direccion === 'asc' ? cmp : -cmp;
    });

  const sinStockFiltrado = sinStock
    .filter(item => 
      item.codigo.toLowerCase().includes(filtro.toLowerCase()) ||
      item.descripcion.toLowerCase().includes(filtro.toLowerCase())
    );

  // Paginación
  const indexUltimoArticulo = paginaActual * articulosPorPagina;
  const indexPrimerArticulo = indexUltimoArticulo - articulosPorPagina;
  const articulosActuales = conStockFiltrado.slice(indexPrimerArticulo, indexUltimoArticulo);
  const totalPaginas = Math.ceil(conStockFiltrado.length / articulosPorPagina);

  const cambiarPagina = (numeroPagina) => setPaginaActual(numeroPagina);

  const cambiarOrden = (campo) => {
    setOrden(prev => ({
      campo,
      direccion: prev.campo === campo && prev.direccion === 'asc' ? 'desc' : 'asc'
    }));
  };

  return (
    <div className="inventario-container">
      <h1>Inventario Global</h1>
      
      <div className="inventario-controls">
        <input
          type="text"
          placeholder="Buscar por código o descripción..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="search-input-large"
        />
      </div>
      
      {loading ? (
        <div className="loading">Cargando inventario...</div>
      ) : (
        <>
          <div className="inventario-seccion">
            <h2>Artículos con Stock ({conStockFiltrado.length})</h2>
            <table className="inventario-table">
              <thead>
                <tr>
                  <th onClick={() => cambiarOrden('codigo')}>
                    Código {orden.campo === 'codigo' && (orden.direccion === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => cambiarOrden('descripcion')}>
                    Descripción {orden.campo === 'descripcion' && (orden.direccion === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => cambiarOrden('stock')}>
                    Stock {orden.campo === 'stock' && (orden.direccion === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {articulosActuales.map((item, index) => (
                  <tr 
                    key={index} 
                    className={`estado-${getEstadoStock(item.stock)}`}
                  >
                    <td>{item.codigo}</td>
                    <td>{item.descripcion}</td>
                    <td>{item.stock}</td>
                    <td>
                      {getEstadoStock(item.stock) === 'negativo' ? 'Stock negativo' : 'En stock'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Paginación */}
            <div className="paginacion">
              <button 
                onClick={() => cambiarPagina(paginaActual - 1)} 
                disabled={paginaActual === 1}
              >
                &lt; Anterior
              </button>
              
              {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                const start = Math.max(1, paginaActual - 2);
                return start + i;
              }).map(num => (
                <button
                  key={num}
                  onClick={() => cambiarPagina(num)}
                  className={paginaActual === num ? 'active' : ''}
                >
                  {num}
                </button>
              ))}
              
              <button 
                onClick={() => cambiarPagina(paginaActual + 1)} 
                disabled={paginaActual === totalPaginas}
              >
                Siguiente &gt;
              </button>
            </div>
          </div>
          
          <div className="inventario-seccion">
            <h2>Artículos sin Stock ({sinStockFiltrado.length})</h2>
            <table className="inventario-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Stock</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {sinStockFiltrado.map((item, index) => (
                  <tr 
                    key={index} 
                    className="estado-sin-stock"
                  >
                    <td>{item.codigo}</td>
                    <td>{item.descripcion}</td>
                    <td>{item.stock}</td>
                    <td>Sin stock</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default InventarioScreen;