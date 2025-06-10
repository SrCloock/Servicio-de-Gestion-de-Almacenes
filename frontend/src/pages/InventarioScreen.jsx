import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/InventarioScreen.css';

const InventarioScreen = () => {
  const navigate = useNavigate();
  const [inventario, setInventario] = useState([]);
  const [inventarioAlmacenes, setInventarioAlmacenes] = useState([]);
  const [inventarioUbicaciones, setInventarioUbicaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [orden, setOrden] = useState('codigo');
  const [paginaActual, setPaginaActual] = useState(1);
  const [itemsPorPagina, setItemsPorPagina] = useState(20);
  const [vistaDetallada, setVistaDetallada] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [resumen, setResumen] = useState({
    totalArticulos: 0,
    conStock: 0,
    sinStock: 0,
    stockNegativo: 0
  });

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setLoading(true);
        
        // Cargar datos principales
        const [resGlobal, resAlmacenes, resUbicaciones] = await Promise.all([
          fetch('http://localhost:3000/inventario'),
          fetch('http://localhost:3000/inventario/almacenes'),
          fetch('http://localhost:3000/inventario/ubicaciones')
        ]);
        
        const dataGlobal = await resGlobal.json();
        const dataAlmacenes = await resAlmacenes.json();
        const dataUbicaciones = await resUbicaciones.json();
        
        setInventario(dataGlobal);
        setInventarioAlmacenes(dataAlmacenes);
        setInventarioUbicaciones(dataUbicaciones);
        
        // Calcular resumen
        const conStock = dataGlobal.filter(item => item.stock > 0).length;
        const sinStock = dataGlobal.filter(item => item.stock === 0).length;
        const stockNegativo = dataGlobal.filter(item => item.stock < 0).length;
        
        setResumen({
          totalArticulos: dataGlobal.length,
          conStock,
          sinStock,
          stockNegativo
        });
        
      } catch (error) {
        console.error('Error cargando inventario:', error);
      } finally {
        setLoading(false);
      }
    };
    
    cargarDatos();
  }, []);

  const toggleVistaDetallada = () => {
    setVistaDetallada(!vistaDetallada);
    setExpandedRows({});
  };

  const toggleExpandRow = (codigo) => {
    setExpandedRows(prev => ({
      ...prev,
      [codigo]: !prev[codigo]
    }));
  };

  const getEstadoStock = (stock) => {
    if (stock === 0) return 'sin-stock';
    if (stock < 0) return 'negativo';
    return 'normal';
  };

  const getEstadoTexto = (stock) => {
    if (stock === 0) return 'Sin stock';
    if (stock < 0) return 'Stock negativo';
    return 'En stock';
  };

  // Filtrar y ordenar inventario
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

  // Paginación
  const indexUltimoItem = paginaActual * itemsPorPagina;
  const indexPrimerItem = indexUltimoItem - itemsPorPagina;
  const itemsActuales = inventarioFiltrado.slice(indexPrimerItem, indexUltimoItem);
  const totalPaginas = Math.ceil(inventarioFiltrado.length / itemsPorPagina);

  const cambiarPagina = (numeroPagina) => setPaginaActual(numeroPagina);
  
  const getAlmacenesPorArticulo = (codigo) => {
    return inventarioAlmacenes
      .filter(item => item.codigo === codigo)
      .sort((a, b) => a.almacen.localeCompare(b.almacen));
  };

  const getUbicacionesPorArticuloAlmacen = (codigo, almacen) => {
    return inventarioUbicaciones
      .filter(item => item.codigo === codigo && item.almacen === almacen)
      .sort((a, b) => a.ubicacion.localeCompare(b.ubicacion));
  };

  return (
    <div className="inventario-container">
      <h1>Inventario Global</h1>
      
      <div className="resumen-inventario">
        <div className="resumen-item total">
          <span>Artículos</span>
          <strong>{resumen.totalArticulos}</strong>
        </div>
        <div className="resumen-item con-stock">
          <span>Con stock</span>
          <strong>{resumen.conStock}</strong>
        </div>
        <div className="resumen-item sin-stock">
          <span>Sin stock</span>
          <strong>{resumen.sinStock}</strong>
        </div>
        <div className="resumen-item negativo">
          <span>Stock negativo</span>
          <strong>{resumen.stockNegativo}</strong>
        </div>
      </div>
      
      <div className="navigation-buttons">
        <button onClick={() => navigate('/rutas')} className="btn-nav">
          📦 Rutas
        </button>
        <button onClick={() => navigate('/PedidosScreen')} className="btn-nav">
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
          onChange={(e) => {
            setFiltro(e.target.value);
            setPaginaActual(1);
          }}
          className="search-input-large"
        />
        
        <div className="control-group">
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
            className="sort-select"
          >
            <option value="codigo">Ordenar por Código</option>
            <option value="descripcion">Ordenar por Descripción</option>
            <option value="stock">Ordenar por Stock</option>
          </select>
          
          <select
            value={itemsPorPagina}
            onChange={(e) => setItemsPorPagina(Number(e.target.value))}
            className="page-select"
          >
            <option value={10}>10 items/pág</option>
            <option value={20}>20 items/pág</option>
            <option value={50}>50 items/pág</option>
            <option value={100}>100 items/pág</option>
          </select>
          
          <button 
            onClick={toggleVistaDetallada}
            className={`btn-view ${vistaDetallada ? 'active' : ''}`}
          >
            {vistaDetallada ? 'Ocultar detalles' : 'Ver detalles'}
          </button>
        </div>
      </div>
      
      {loading ? (
        <div className="loading">Cargando inventario...</div>
      ) : (
        <>
          <table className="inventario-table">
            <thead>
              <tr>
                <th style={{ width: '50px' }}></th>
                <th>Código Artículo</th>
                <th>Descripción</th>
                <th>Stock Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {itemsActuales.map((item) => (
                <React.Fragment key={item.codigo}>
                  <tr className={`estado-${getEstadoStock(item.stock)}`}>
                    <td>
                      {vistaDetallada && (
                        <button 
                          onClick={() => toggleExpandRow(item.codigo)} 
                          className="btn-expand"
                        >
                          {expandedRows[item.codigo] ? '▼' : '►'}
                        </button>
                      )}
                    </td>
                    <td>{item.codigo}</td>
                    <td>{item.descripcion}</td>
                    <td>{item.stock}</td>
                    <td>
                      <span className="estado-badge">
                        {getEstadoTexto(item.stock)}
                      </span>
                    </td>
                  </tr>
                  
                  {vistaDetallada && expandedRows[item.codigo] && (
                    <>
                      {getAlmacenesPorArticulo(item.codigo).map(almacen => (
                        <React.Fragment key={`${item.codigo}-${almacen.almacen}`}>
                          <tr className="almacen-row">
                            <td></td>
                            <td colSpan="2">
                              <span className="almacen-info">
                                <strong>{almacen.nombreAlmacen}</strong> ({almacen.almacen})
                              </span>
                            </td>
                            <td>{almacen.stock}</td>
                            <td>Almacén</td>
                          </tr>
                          
                          {getUbicacionesPorArticuloAlmacen(item.codigo, almacen.almacen).map(ubicacion => (
                            <tr key={`${item.codigo}-${almacen.almacen}-${ubicacion.ubicacion}`} className="ubicacion-row">
                              <td></td>
                              <td colSpan="2">
                                <span className="ubicacion-info">
                                  {ubicacion.ubicacion}
                                </span>
                              </td>
                              <td>{ubicacion.stock}</td>
                              <td>Ubicación</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          
          {!loading && inventarioFiltrado.length === 0 && (
            <div className="no-results">No se encontraron artículos</div>
          )}
          
          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="paginacion">
              <button 
                onClick={() => cambiarPagina(1)} 
                disabled={paginaActual === 1}
              >
                ◀◀
              </button>
              <button 
                onClick={() => cambiarPagina(paginaActual - 1)} 
                disabled={paginaActual === 1}
              >
                ◀
              </button>
              
              {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                let paginaInicio = Math.max(1, Math.min(paginaActual - 2, totalPaginas - 4));
                if (totalPaginas <= 5) paginaInicio = 1;
                return paginaInicio + i;
              })
              .filter(num => num <= totalPaginas)
              .map(num => (
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
                ▶
              </button>
              <button 
                onClick={() => cambiarPagina(totalPaginas)} 
                disabled={paginaActual === totalPaginas}
              >
                ▶▶
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default InventarioScreen;