import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/InventarioScreen.css';
import Navbar from '../components/Navbar';

const getAuthHeaders = () => {
  const user = JSON.parse(localStorage.getItem('user'));
  const token = localStorage.getItem('token');
  
  if (!user) return {};
  
  const headers = {
    usuario: user.CodigoCliente || '',
    codigoempresa: user.CodigoEmpresa || ''
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

const InventarioScreen = () => {
  const navigate = useNavigate();
  const [inventario, setInventario] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('');
  const [orden, setOrden] = useState({ campo: 'codigo', direccion: 'asc' });
  const [paginaActual, setPaginaActual] = useState(1);
  const [itemsPorPagina, setItemsPorPagina] = useState(20);
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
  const [almacenSeleccionado, setAlmacenSeleccionado] = useState('');
  const [viewMode, setViewMode] = useState('consolidado');

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
      navigate('/');
      return;
    }

    setUsuarioData(user);
    setUsuarioPermisos(user.permisos?.inventario_editar || false);
      
    const cargarCategorias = async () => {
      try {
        const headers = getAuthHeaders();
        const response = await axios.get(
          `http://localhost:3000/categorias-empleado?codigoEmpresa=${user.CodigoEmpresa}`,
          { headers }
        );
        setCategorias(response.data);
      } catch (error) {
        console.error('Error cargando categorías:', error);
        setError('Error al cargar las categorías: ' + (error.response?.data?.message || error.message));
      }
    };
      
    cargarCategorias();
  }, [navigate]);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
      navigate('/');
      return;
    }

    const cargarDatos = async () => {
      try {
        setLoading(true);
        setError('');
        
        const headers = getAuthHeaders();
        const codigoEmpresa = user.CodigoEmpresa;
        
        if (!headers.usuario || !headers.codigoempresa) {
          setError('Error de autenticación. Faltan datos de usuario');
          setLoading(false);
          return;
        }
        
        const responses = await Promise.all([
          axios.get(`http://localhost:3000/inventario?codigoEmpresa=${codigoEmpresa}`, { headers }),
          axios.get(`http://localhost:3000/almacenes?codigoEmpresa=${codigoEmpresa}`, { headers }),
          axios.get(`http://localhost:3000/inventario/ubicaciones?codigoEmpresa=${codigoEmpresa}`, { headers })
        ]);
        
        setInventario(responses[0].data);
        setAlmacenes(responses[1].data);
        setUbicaciones(responses[2].data);
        
        setResumen({
          totalArticulos: responses[0].data.length,
          conStock: responses[0].data.filter(item => item.stock > 0).length,
          sinStock: responses[0].data.filter(item => item.stock === 0).length,
          stockNegativo: responses[0].data.filter(item => item.stock < 0).length
        });
      } catch (error) {
        console.error('Error cargando inventario:', error);
        if (error.response) {
          if (error.response.status === 401) {
            setError('No autorizado. Por favor, inicia sesión de nuevo');
          } else {
            setError(`Error del servidor: ${error.response.status} ${error.response.statusText}`);
          }
        } else {
          setError('Error de conexión con el servidor');
        }
      } finally {
        setLoading(false);
      }
    };
    
    cargarDatos();
  }, [navigate]);

  const sincronizarInventario = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      await axios.post('http://localhost:3000/sincronizar-inventario', {}, { headers });
      window.location.reload();
    } catch (error) {
      console.error('Error sincronizando inventario:', error);
      setError('Error al sincronizar inventario: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

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

  const handleAjustarStock = async () => {
    if (ajustandoStock && nuevoStock !== null && usuarioData) {
      try {
        setLoading(true);
        const headers = getAuthHeaders();
        const response = await axios.post('http://localhost:3000/ajustar-stock', {
          codigoArticulo: ajustandoStock.codigo,
          nuevoStock: Number(nuevoStock),
          usuarioId: usuarioData.CodigoCliente,
          codigoEmpresa: usuarioData.CodigoEmpresa
        }, { headers });
        
        if (response.data.success) {
          setInventario(prev => prev.map(item => 
            item.codigo === ajustandoStock.codigo 
              ? { ...item, stock: Number(nuevoStock) } 
              : item
          ));
          
          setAjustandoStock(null);
          setNuevoStock(0);
        } else {
          throw new Error(response.data.mensaje || 'Error en la actualización');
        }
      } catch (error) {
        console.error('Error ajustando stock:', error);
        setError(`Error al actualizar el stock: ${error.message}`);
      } finally {
        setLoading(false);
      }
    }
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

  const inventarioFiltrado = inventario.filter(item => {
    const matchTexto = item.codigo.toLowerCase().includes(filtro.toLowerCase()) ||
      item.descripcion.toLowerCase().includes(filtro.toLowerCase());
    
    const matchAlmacen = almacenSeleccionado ? 
      ubicaciones.some(ubi => 
        ubi.codigo === item.codigo && ubi.almacen === almacenSeleccionado
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

  const inventarioPorAlmacen = almacenes.map(alm => {
    const itemsEnAlmacen = ubicaciones.filter(ubi => ubi.almacen === alm.codigo);
    const stockTotal = itemsEnAlmacen.reduce((sum, ubi) => sum + ubi.stock, 0);
    
    return {
      almacen: alm.nombre,
      codigoAlmacen: alm.codigo,
      cantidadArticulos: itemsEnAlmacen.length,
      stockTotal,
      items: itemsEnAlmacen
    };
  });

  const ubicacionesFiltradas = ubicaciones.filter(ubi => {
    const matchTexto = filtro 
      ? ubi.codigo.toLowerCase().includes(filtro.toLowerCase()) || 
        (ubi.descripcion && ubi.descripcion.toLowerCase().includes(filtro.toLowerCase()))
      : true;
    
    const matchAlmacen = almacenSeleccionado 
      ? ubi.almacen === almacenSeleccionado
      : true;
    
    return matchTexto && matchAlmacen;
  });

  const indexUltimoItem = paginaActual * itemsPorPagina;
  const indexPrimerItem = indexUltimoItem - itemsPorPagina;
  const itemsActuales = inventarioFiltrado.slice(indexPrimerItem, indexUltimoItem);
  const totalPaginas = Math.ceil(inventarioFiltrado.length / itemsPorPagina);

  const cambiarPagina = (numeroPagina) => setPaginaActual(numeroPagina);
  
  const getAlmacenesPorArticulo = (codigo) => {
    return ubicaciones
      .filter(ubi => ubi.codigo === codigo)
      .reduce((acc, ubi) => {
        const existing = acc.find(a => a.almacen === ubi.almacen);
        if (existing) {
          existing.stock += ubi.stock;
        } else {
          const almacen = almacenes.find(a => a.codigo === ubi.almacen);
          acc.push({
            codigo: ubi.codigo,
            almacen: ubi.almacen,
            nombreAlmacen: almacen ? almacen.nombre : ubi.almacen,
            stock: ubi.stock
          });
        }
        return acc;
      }, []);
  };

  const getUbicacionesPorArticuloAlmacen = (codigo, almacen) => {
    return ubicaciones
      .filter(ubi => ubi.codigo === codigo && ubi.almacen === almacen)
      .sort((a, b) => a.ubicacion.localeCompare(b.ubicacion));
  };

  const getNombreCategoria = (codigoCategoria) => {
    const categoria = categorias.find(c => c.codigo === codigoCategoria);
    return categoria ? categoria.nombre : 'Desconocida';
  };

  return (
    <div className="inventario-container">
      <div className="inventario-header">
        <h2>Gestión de Inventario</h2>
        <div className="view-toggle">
          <button 
            className={viewMode === 'consolidado' ? 'active' : ''}
            onClick={() => setViewMode('consolidado')}
          >
            Consolidado
          </button>
          <button 
            className={viewMode === 'almacenes' ? 'active' : ''}
            onClick={() => setViewMode('almacenes')}
          >
            Por Almacén
          </button>
          <button 
            className={viewMode === 'ubicaciones' ? 'active' : ''}
            onClick={() => setViewMode('ubicaciones')}
          >
            Por Ubicación
          </button>
        </div>
      </div>
      
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
      
      {error ? (
        <div className="error">
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Reintentar</button>
        </div>
      ) : loading ? (
        <div className="loading">
          <div className="loader"></div>
          <p>Cargando inventario...</p>
        </div>
      ) : (
        <div className="inventario-content">
          <div className="filtros-container">
            <div className="filtro-group">
              <label>Buscar artículo:</label>
              <input
                type="text"
                placeholder="Código o descripción..."
                value={filtro}
                onChange={e => {
                  setFiltro(e.target.value);
                  setPaginaActual(1);
                }}
                className="filtro-input"
              />
            </div>
            
            <div className="filtro-group">
              <label>Filtrar por almacén:</label>
              <select
                value={almacenSeleccionado}
                onChange={e => setAlmacenSeleccionado(e.target.value)}
                className="filtro-select"
              >
                <option value="">Todos los almacenes</option>
                {almacenes.map(alm => (
                  <option key={`alm-${alm.codigo}`} value={alm.codigo}>{alm.nombre}</option>
                ))}
              </select>
            </div>
            
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
          
          {viewMode === 'consolidado' && (
            <div className="inventario-section">
              <h3>Inventario Consolidado</h3>
              <div className="table-container">
                <table className="inventario-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Descripción</th>
                      <th>Stock Total</th>
                      <th>Estado</th>
                      {usuarioPermisos && <th>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {itemsActuales.map((item, index) => (
                      <tr key={`consolidado-${item.codigo}-${index}`} className={`estado-${getEstadoStock(item.stock)}`}>
                        <td>{item.codigo}</td>
                        <td>{item.descripcion}</td>
                        <td className="stock-cell">{item.stock}</td>
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
                    ))}
                  </tbody>
                </table>
              </div>
              
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
                      key={`pag-${num}`}
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
            </div>
          )}
          
          {viewMode === 'almacenes' && (
            <div className="inventario-almacenes">
              {inventarioPorAlmacen.map((almacen, almacenIndex) => (
                <div key={`almacen-${almacen.codigoAlmacen}-${almacenIndex}`} className="almacen-card">
                  <div className="almacen-header">
                    <h3>{almacen.almacen}</h3>
                    <div className="almacen-stats">
                      <span>Artículos: {almacen.cantidadArticulos}</span>
                      <span>Stock Total: {almacen.stockTotal}</span>
                    </div>
                  </div>
                  
                  <div className="table-container">
                    <table className="inventario-table">
                      <thead>
                        <tr>
                          <th>Artículo</th>
                          <th>Descripción</th>
                          <th>Ubicación</th>
                          <th>Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {almacen.items
                          .filter(ubi => 
                            filtro ? ubi.codigo.toLowerCase().includes(filtro.toLowerCase()) || 
                                    (ubi.descripcion && ubi.descripcion.toLowerCase().includes(filtro.toLowerCase())) : true
                          )
                          .map((ubi, ubiIndex) => (
                            <tr key={`almacen-item-${almacen.codigoAlmacen}-${ubi.codigo}-${ubi.ubicacion}-${ubiIndex}`}>
                              <td>{ubi.codigo}</td>
                              <td>{ubi.descripcion}</td>
                              <td>{ubi.ubicacion}</td>
                              <td className="stock-cell">{ubi.stock}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {viewMode === 'ubicaciones' && (
            <div className="inventario-section">
              <h3>Inventario por Ubicación</h3>
              <div className="table-container">
                <table className="inventario-table">
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th>Descripción</th>
                      <th>Almacén</th>
                      <th>Ubicación</th>
                      <th>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ubicacionesFiltradas.map((ubi, index) => (
                      <tr key={`ubicacion-${ubi.codigo}-${ubi.almacen}-${ubi.ubicacion}-${index}`}>
                        <td>{ubi.codigo}</td>
                        <td>{ubi.descripcion}</td>
                        <td>{almacenes.find(a => a.codigo === ubi.almacen)?.nombre || ubi.almacen}</td>
                        <td>{ubi.ubicacion}</td>
                        <td className="stock-cell">{ubi.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

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