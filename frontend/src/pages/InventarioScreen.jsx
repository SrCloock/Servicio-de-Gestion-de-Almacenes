import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/InventarioScreen.css';
import Navbar from '../components/Navbar';
import axios from 'axios';

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
  const [almacenes, setAlmacenes] = useState([]);
  const [almacenSeleccionado, setAlmacenSeleccionado] = useState('');

  // Obtener datos del usuario logueado
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/');
      return;
    }

    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
      setUsuarioData(user);
      setUsuarioPermisos(user.permisos?.inventario_editar || false);
      
      // Cargar categorías de empleado para la empresa del usuario
      const cargarCategorias = async () => {
        try {
          const response = await axios.get(
            `http://localhost:3000/categorias-empleado?codigoEmpresa=${user.CodigoEmpresa}`,
            {
              headers: { Authorization: `Bearer ${token}` }
            }
          );
          setCategorias(response.data);
        } catch (error) {
          console.error('Error cargando categorías:', error);
        }
      };
      
      cargarCategorias();
    }
  }, [navigate]);

  // Cargar inventario y almacenes
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const cargarDatos = async () => {
      try {
        setLoading(true);
        
        const [resGlobal, resAlmacenes, resUbicaciones] = await Promise.all([
          axios.get('http://localhost:3000/inventario', {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get('http://localhost:3000/almacenes', {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get('http://localhost:3000/inventario/ubicaciones', {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        
        setInventario(resGlobal.data);
        setAlmacenes(resAlmacenes.data);
        setInventarioUbicaciones(resUbicaciones.data);
        
        setResumen({
          totalArticulos: resGlobal.data.length,
          conStock: resGlobal.data.filter(item => item.stock > 0).length,
          sinStock: resGlobal.data.filter(item => item.stock === 0).length,
          stockNegativo: resGlobal.data.filter(item => item.stock < 0).length
        });
      } catch (error) {
        console.error('Error cargando inventario:', error);
      } finally {
        setLoading(false);
      }
    };
    
    cargarDatos();
  }, []);

  // Función para sincronizar inventario
  const sincronizarInventario = async () => {
    const token = localStorage.getItem('token');
    try {
      await axios.post('http://localhost:3000/sincronizar-inventario', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Inventario sincronizado correctamente con Sage');
      // Recargar datos
      window.location.reload();
    } catch (error) {
      console.error('Error sincronizando inventario:', error);
      alert('Error al sincronizar inventario');
    }
  };

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
    const token = localStorage.getItem('token');
    if (ajustandoStock && nuevoStock !== null && usuarioData) {
      try {
        const response = await axios.post('http://localhost:3000/ajustar-stock', {
          codigoArticulo: ajustandoStock.codigo,
          nuevoStock: Number(nuevoStock),
          usuarioId: usuarioData.CodigoCliente,
          codigoEmpresa: usuarioData.CodigoEmpresa
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.success) {
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
          throw new Error(response.data.mensaje || 'Error en la actualización');
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

  // Filtrar y ordenar inventario con filtro de almacén
  const inventarioFiltrado = inventario
    .filter(item => {
      const matchTexto = item.codigo.toLowerCase().includes(filtro.toLowerCase()) ||
        item.descripcion.toLowerCase().includes(filtro.toLowerCase());
      
      const matchAlmacen = almacenSeleccionado ? 
        inventarioAlmacenes.some(a => 
          a.codigo === item.codigo && a.almacen === almacenSeleccionado
        ) : true;
      
      return matchTexto && matchAlmacen;
    })
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
            Empresa: <strong>{usuarioData.CodigoEmpresa}</strong> | 
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
        
        {/* Filtro por almacén */}
        <select
          value={almacenSeleccionado}
          onChange={(e) => setAlmacenSeleccionado(e.target.value)}
          className="filtro-almacen"
        >
          <option value="">Todos los almacenes</option>
          {almacenes.map(alm => (
            <option key={alm.codigo} value={alm.codigo}>
              {alm.nombre}
            </option>
          ))}
        </select>
        
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
          
          {/* Botón de sincronización */}
          {usuarioPermisos && (
            <button 
              onClick={sincronizarInventario}
              className="btn-sincronizar"
            >
              Regularizar Inventario
            </button>
          )}
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