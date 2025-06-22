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
  const [filtroTipoVista, setFiltroTipoVista] = useState('consolidado');
  const [ajusteTemporal, setAjusteTemporal] = useState({});
  const [detallesStock, setDetallesStock] = useState({});

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

  const toggleDetalleStock = (codigo) => {
    setDetallesStock(prev => ({
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

  const handleRegularizar = async (codigo) => {
    const nuevoValor = ajusteTemporal[codigo];
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const response = await axios.post('http://localhost:3000/ajustar-stock', {
        codigoArticulo: codigo,
        nuevoStock: Number(nuevoValor),
        usuarioId: usuarioData.CodigoCliente,
        codigoEmpresa: usuarioData.CodigoEmpresa
      }, { headers });
      
      if (response.data.success) {
        setInventario(prev => prev.map(item => 
          item.codigo === codigo 
            ? { ...item, stock: Number(nuevoValor) } 
            : item
        ));
        
        const nuevosAjustes = {...ajusteTemporal};
        delete nuevosAjustes[codigo];
        setAjusteTemporal(nuevosAjustes);
      } else {
        throw new Error(response.data.mensaje || 'Error en la actualización');
      }
    } catch (error) {
      console.error('Error ajustando stock:', error);
      setError(`Error al actualizar el stock: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getEstadoStockClass = (stock) => {
    if (stock === 0) return 'estado-sin-stock';
    if (stock < 0) return 'estado-negativo';
    return 'estado-normal';
  };

  return (
    <div className="inventario-container fade-in">
      <div className="inventario-header">
        <h2>Gestión de Inventario</h2>
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
          <span>Artículos Totales</span>
          <strong>{resumen.totalArticulos}</strong>
        </div>
        <div className="resumen-item con-stock">
          <span>Con Stock</span>
          <strong>{resumen.conStock}</strong>
        </div>
        <div className="resumen-item sin-stock">
          <span>Sin Stock</span>
          <strong>{resumen.sinStock}</strong>
        </div>
        <div className="resumen-item negativo">
          <span>Stock Negativo</span>
          <strong>{resumen.stockNegativo}</strong>
        </div>
      </div>

      <div className="filtros-container">
        <div className="filtro-group">
          <label>Buscar artículo:</label>
          <input
            type="text"
            placeholder="Código o descripción..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
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
              <option key={alm.codigo} value={alm.codigo}>{alm.nombre}</option>
            ))}
          </select>
        </div>
        
        <div className="filtro-group">
          <label>Tipo de vista:</label>
          <select
            value={filtroTipoVista}
            onChange={e => setFiltroTipoVista(e.target.value)}
            className="filtro-select"
          >
            <option value="consolidado">Consolidado</option>
            <option value="almacenes">Por Almacén</option>
            <option value="ubicaciones">Por Ubicación</option>
          </select>
        </div>
        
        <div className="filtro-group">
          <label>Acciones:</label>
          <button 
            onClick={sincronizarInventario}
            className="btn-ajustar"
            disabled={loading}
          >
            Sincronizar Inventario
          </button>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div className="loading">
            <p>Cargando inventario...</p>
          </div>
        ) : error ? (
          <div className="error">
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>Reintentar</button>
          </div>
        ) : filtroTipoVista === 'consolidado' ? (
          <table className="inventario-table responsive-table">
            <thead>
              <tr>
                <th onClick={() => handleOrdenar('codigo')}>Código {orden.campo === 'codigo' && (orden.direccion === 'asc' ? '↑' : '↓')}</th>
                <th onClick={() => handleOrdenar('descripcion')}>Descripción {orden.campo === 'descripcion' && (orden.direccion === 'asc' ? '↑' : '↓')}</th>
                <th onClick={() => handleOrdenar('stock')}>Stock {orden.campo === 'stock' && (orden.direccion === 'asc' ? '↑' : '↓')}</th>
                <th>Estado</th>
                <th>Detalle</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {itemsActuales.map(item => (
                <React.Fragment key={item.codigo}>
                  <tr className={`estado-${getEstadoStock(item.stock)}`}>
                    <td>{item.codigo}</td>
                    <td>{item.descripcion}</td>
                    <td>
                      <input 
                        type="number"
                        value={ajusteTemporal[item.codigo] ?? item.stock}
                        onChange={e => setAjusteTemporal({
                          ...ajusteTemporal,
                          [item.codigo]: Number(e.target.value)
                        })}
                        className="stock-input"
                      />
                    </td>
                    <td>
                      <span className="estado-badge">{getEstadoTexto(item.stock)}</span>
                    </td>
                    <td>
                      <button 
                        onClick={() => toggleDetalleStock(item.codigo)}
                        className="btn-expand"
                      >
                        {detallesStock[item.codigo] ? '▲' : '▼'}
                      </button>
                    </td>
                    <td>
                      <button
                        className="btn-ajustar"
                        onClick={() => {
                          setAjustandoStock(item);
                          setNuevoStock(item.stock);
                        }}
                        disabled={!usuarioPermisos}
                      >
                        Ajustar
                      </button>
                    </td>
                  </tr>
                  {detallesStock[item.codigo] && (
                    <tr>
                      <td colSpan="6">
                        {getAlmacenesPorArticulo(item.codigo).map((almacen, idx) => (
                          <div key={idx} className="ubicacion-detalle">
                            <strong>{almacen.nombreAlmacen}</strong>
                            <span>{almacen.stock} unidades</span>
                            
                            {getUbicacionesPorArticuloAlmacen(item.codigo, almacen.almacen).map((ubicacion, ubiIdx) => (
                              <div key={ubiIdx} className="ubicacion-detalle">
                                <span>{ubicacion.ubicacion}</span>
                                <span>{ubicacion.stock} unidades</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        ) : filtroTipoVista === 'almacenes' ? (
          <table className="inventario-table responsive-table">
            <thead>
              <tr>
                <th>Almacén</th>
                <th>Artículos</th>
                <th>Stock Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {inventarioPorAlmacen.map(alm => (
                <tr key={alm.codigoAlmacen} className="almacen-row">
                  <td>{alm.almacen}</td>
                  <td>{alm.cantidadArticulos}</td>
                  <td>{alm.stockTotal}</td>
                  <td className={getEstadoStockClass(alm.stockTotal)}>
                    <span className="estado-badge">{getEstadoTexto(alm.stockTotal)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="inventario-table responsive-table">
            <thead>
              <tr>
                <th>Ubicación</th>
                <th>Artículo</th>
                <th>Stock</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {ubicacionesFiltradas.map(ubi => (
                <tr key={`${ubi.almacen}-${ubi.ubicacion}-${ubi.codigo}`} className="ubicacion-row">
                  <td>{ubi.almacen} - {ubi.ubicacion}</td>
                  <td>{ubi.codigo}</td>
                  <td>{ubi.stock}</td>
                  <td className={getEstadoStockClass(ubi.stock)}>
                    <span className="estado-badge">{getEstadoTexto(ubi.stock)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPaginas > 1 && (
          <div className="paginacion">
            <button 
              onClick={() => cambiarPagina(1)} 
              disabled={paginaActual === 1}
            >
              &laquo;
            </button>
            
            {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(numero => (
              <button
                key={numero}
                onClick={() => cambiarPagina(numero)}
                className={paginaActual === numero ? 'active' : ''}
              >
                {numero}
              </button>
            ))}
            
            <button 
              onClick={() => cambiarPagina(totalPaginas)} 
              disabled={paginaActual === totalPaginas}
            >
              &raquo;
            </button>
          </div>
        )}
      </div>
      
      <Navbar />
    </div>
  );
};

export default React.memo(InventarioScreen);