import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/InventarioScreen.css';
import Navbar from '../components/Navbar';

const InventarioScreen = () => {
  const navigate = useNavigate();
  const [inventario, setInventario] = useState([]);
  const [inventarioAlmacenes, setInventarioAlmacenes] = useState([]);
  const [inventarioUbicaciones, setInventarioUbicaciones] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [orden, setOrden] = useState({ campo: 'codigo', direccion: 'asc' });
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
  const [ajustandoStock, setAjustandoStock] = useState(null);
  const [nuevoStock, setNuevoStock] = useState(0);
  const [usuarioPermisos, setUsuarioPermisos] = useState(false);
  const [usuarioData, setUsuarioData] = useState(null);

  // Obtener datos del usuario logueado
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
      setUsuarioData(user.datos);
      setUsuarioPermisos(user.permisos?.inventario_editar || false);
      
      // Cargar categorías de empleado para la empresa del usuario
      const cargarCategorias = async () => {
        try {
          const response = await fetch(
            `http://localhost:3000/categorias-empleado?codigoEmpresa=${user.datos.CodigoEmpresa}`
          );
          const data = await response.json();
          setCategorias(data);
        } catch (error) {
          console.error('Error cargando categorías:', error);
        }
      };
      
      cargarCategorias();
    }
  }, []);

  // Cargar inventario
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setLoading(true);
        
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
        
        setResumen({
          totalArticulos: dataGlobal.length,
          conStock: dataGlobal.filter(item => item.stock > 0).length,
          sinStock: dataGlobal.filter(item => item.stock === 0).length,
          stockNegativo: dataGlobal.filter(item => item.stock < 0).length
        });
      } catch (error) {
        console.error('Error cargando inventario:', error);
      } finally {
        setLoading(false);
      }
    };
    
    cargarDatos();
  }, []);

  // Función para manejar la ordenación
  const handleOrdenar = (campo) => {
    setOrden(prev => {
      if (prev.campo === campo) {
        return {
          campo,
          direccion: prev.direccion === 'asc' ? 'desc' : 'asc'
        };
      }
      return {
        campo,
        direccion: 'asc'
      };
    });
  };

  // Función para ajustar stock
  const handleAjustarStock = async () => {
    if (ajustandoStock && nuevoStock !== null && usuarioData) {
      try {
        const response = await fetch('http://localhost:3000/ajustar-stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigoArticulo: ajustandoStock.codigo,
            nuevoStock: Number(nuevoStock),
            usuarioId: usuarioData.CodigoCliente,
            codigoEmpresa: usuarioData.CodigoEmpresa
          })
        });

        const result = await response.json();
        
        if (response.ok) {
          // Actualizar vista
          setInventario(prev => prev.map(item => 
            item.codigo === ajustandoStock.codigo 
              ? { ...item, stock: Number(nuevoStock) } 
              : item
          ));
          
          setAjustandoStock(null);
          setNuevoStock(0);
          alert('Stock actualizado correctamente');
        } else {
          throw new Error(result.mensaje || 'Error en la actualización');
        }
      } catch (error) {
        console.error('Error ajustando stock:', error);
        alert(`Error al actualizar el stock: ${error.message}`);
      }
    }
  };

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
      let comparacion = 0;
      
      if (orden.campo === 'codigo') {
        comparacion = a.codigo.localeCompare(b.codigo);
      } else if (orden.campo === 'descripcion') {
        comparacion = a.descripcion.localeCompare(b.descripcion);
      } else if (orden.campo === 'stock') {
        comparacion = a.stock - b.stock;
      }
      
      return orden.direccion === 'asc' ? comparacion : -comparacion;
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

  // Obtener nombre de categoría por código
  const getNombreCategoria = (codigoCategoria) => {
    const categoria = categorias.find(c => c.codigo === codigoCategoria);
    return categoria ? categoria.nombre : 'Desconocida';
  };

  return (
    <div className="inventario-container">
      <h1>Inventario Global</h1>
      
      {/* Mostrar información del usuario y categoría */}
      {usuarioData && (
        <div className="user-info">
          <span>
            Usuario: <strong>{usuarioData.Nombre}</strong> | 
            Categoría: <strong>{getNombreCategoria(usuarioData.CodigoCategoriaEmpleadoLc)}</strong> | 
            Permisos: <strong>{usuarioPermisos ? 'Administrador' : 'Consulta'}</strong>
          </span>
        </div>
      )}
      
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
      
      <Navbar />
      
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
                <th 
                  className="sortable-header"
                  onClick={() => handleOrdenar('codigo')}
                >
                  Código Artículo 
                  {orden.campo === 'codigo' && (
                    <span>{orden.direccion === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th 
                  className="sortable-header"
                  onClick={() => handleOrdenar('descripcion')}
                >
                  Descripción
                  {orden.campo === 'descripcion' && (
                    <span>{orden.direccion === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th 
                  className="sortable-header"
                  onClick={() => handleOrdenar('stock')}
                >
                  Stock Total
                  {orden.campo === 'stock' && (
                    <span>{orden.direccion === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
                <th>Estado</th>
                {usuarioPermisos && <th>Acciones</th>}
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
                    {usuarioPermisos && (
                      <td>
                        <button
                          className="btn-ajustar"
                          onClick={() => {
                            setAjustandoStock(item);
                            setNuevoStock(item.stock);
                          }}
                        >
                          Ajustar stock
                        </button>
                      </td>
                    )}
                  </tr>
                  
                  {vistaDetallada && expandedRows[item.codigo] && (
                    <>
                      {getAlmacenesPorArticulo(item.codigo).map(almacen => (
                        <React.Fragment key={`${item.codigo}-${almacen.almacen}`}>
                          <tr className="almacen-row">
                            <td></td>
                            <td colSpan={usuarioPermisos ? 4 : 3}>
                              <span className="almacen-info">
                                <strong>{almacen.nombreAlmacen}</strong> ({almacen.almacen})
                              </span>
                            </td>
                            <td>{almacen.stock}</td>
                          </tr>
                          
                          {getUbicacionesPorArticuloAlmacen(item.codigo, almacen.almacen).map(ubicacion => (
                            <tr key={`${item.codigo}-${almacen.almacen}-${ubicacion.ubicacion}`} className="ubicacion-row">
                              <td></td>
                              <td colSpan={usuarioPermisos ? 4 : 3}>
                                <span className="ubicacion-info">
                                  {ubicacion.ubicacion}
                                </span>
                              </td>
                              <td>{ubicacion.stock}</td>
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

      {/* Modal para ajustar stock */}
      {ajustandoStock && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Ajustar stock</h2>
            <p>
              Artículo: <strong>{ajustandoStock.codigo}</strong> - {ajustandoStock.descripcion}
            </p>
            <p>Stock actual: {ajustandoStock.stock}</p>
            
            <div className="modal-control">
              <label>Nuevo stock:</label>
              <input
                type="number"
                value={nuevoStock}
                onChange={(e) => setNuevoStock(e.target.value)}
                min="0"
              />
            </div>
            
            <div className="modal-buttons">
              <button 
                className="btn-cancel"
                onClick={() => setAjustandoStock(null)}
              >
                Cancelar
              </button>
              <button 
                className="btn-confirm"
                onClick={handleAjustarStock}
              >
                Confirmar ajuste
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventarioScreen;