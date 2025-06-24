import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/Navbar';
import '../styles/InventarioScreen.css';

// Componentes separados para mejorar la modularidad
const ResumenInventario = ({ resumen, cambiosPendientes }) => (
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
    {cambiosPendientes > 0 && (
      <div className="resumen-item cambios">
        <span>Cambios Pendientes</span>
        <strong>{cambiosPendientes}</strong>
      </div>
    )}
  </div>
);

const Filtros = ({
  filtro,
  setFiltro,
  almacenSeleccionado,
  setAlmacenSeleccionado,
  filtroTipoVista,
  setFiltroTipoVista,
  almacenes,
  sincronizarInventario,
  cargarDatos,
  loading,
  cambiosPendientes
}) => (
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
    
    <div className="filtro-group acciones-group">
      <label>Acciones:</label>
      <div className="botones-accion">
        {cambiosPendientes > 0 && (
          <button 
            onClick={sincronizarInventario}
            className="btn-sincronizar"
            disabled={loading}
          >
            Sincronizar Cambios ({cambiosPendientes})
          </button>
        )}
        <button 
          onClick={cargarDatos}
          className="btn-actualizar"
          disabled={loading}
          title="Recargar datos del servidor sin aplicar cambios locales"
        >
          Actualizar Datos
        </button>
      </div>
    </div>
  </div>
);

const DetalleUbicacion = ({ 
  item, 
  ubicacion, 
  usuarioPermisos, 
  ediciones, 
  handleCambioStock 
}) => {
  const clave = `${item.codigo}|${ubicacion.almacen}|${ubicacion.ubicacion}|${ubicacion.partida || ''}`;
  const valorEditado = ediciones[clave];
  const modificado = valorEditado !== undefined;

  return (
    <div key={`${ubicacion.ubicacion}-${ubicacion.partida}`} className="ubicacion-ajuste">
      <div className="ubicacion-info">
        <div className="ubicacion-datos">
          <span className="ubicacion-nombre">Ubicación: {ubicacion.ubicacion}</span>
          {ubicacion.partida && (
            <span className="partida">Partida: {ubicacion.partida}</span>
          )}
        </div>
        <span className="stock-actual">
          Stock actual: {modificado ? (
            <span className="valor-modificado">{ubicacion.stock} → {valorEditado}</span>
          ) : (
            ubicacion.stock
          )}
        </span>
      </div>
      
      {usuarioPermisos && (
        <div className="ajuste-form">
          <input
            type="number"
            value={modificado ? valorEditado : ubicacion.stock}
            onChange={e => handleCambioStock(
              item.codigo,
              ubicacion.almacen,
              ubicacion.ubicacion,
              ubicacion.partida,
              e.target.value
            )}
            className={`stock-input ${modificado ? 'input-modificado' : ''}`}
          />
        </div>
      )}
    </div>
  );
};

const DetalleAlmacen = ({ item, almacen, ubicaciones, usuarioPermisos, ediciones, handleCambioStock }) => (
  <div className="ubicacion-detalle">
    <div className="almacen-header">
      <strong>{almacen.nombreAlmacen}</strong>
      <span>Stock total: {almacen.stock} unidades</span>
    </div>
    
    {getUbicacionesPorArticuloAlmacen(item.codigo, almacen.almacen, ubicaciones).map(ubicacion => (
      <DetalleUbicacion 
        key={`${ubicacion.ubicacion}-${ubicacion.partida}`}
        item={item}
        ubicacion={ubicacion}
        usuarioPermisos={usuarioPermisos}
        ediciones={ediciones}
        handleCambioStock={handleCambioStock}
      />
    ))}
  </div>
);

const TablaConsolidado = ({ 
  items, 
  detallesStock, 
  toggleDetalleStock, 
  getEstadoStock, 
  getEstadoTexto,
  ubicaciones,
  almacenes,
  usuarioPermisos,
  ediciones,
  handleCambioStock
}) => (
  <table className="inventario-table">
    <thead>
      <tr>
        <th>Código</th>
        <th>Descripción</th>
        <th>Stock</th>
        <th>Estado</th>
        <th>Detalle</th>
      </tr>
    </thead>
    <tbody>
      {items.map(item => (
        <React.Fragment key={item.codigo}>
          <tr className={`estado-${getEstadoStock(item.stock)}`}>
            <td>{item.codigo}</td>
            <td>{item.descripcion}</td>
            <td>{item.stock}</td>
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
          </tr>
          {detallesStock[item.codigo] && (
            <tr>
              <td colSpan="5" className="detalle-ubicaciones">
                {getAlmacenesPorArticulo(item.codigo, almacenes, ubicaciones).map(almacen => (
                  <DetalleAlmacen 
                    key={almacen.almacen}
                    item={item}
                    almacen={almacen}
                    ubicaciones={ubicaciones}
                    usuarioPermisos={usuarioPermisos}
                    ediciones={ediciones}
                    handleCambioStock={handleCambioStock}
                  />
                ))}
              </td>
            </tr>
          )}
        </React.Fragment>
      ))}
    </tbody>
  </table>
);

const TablaAlmacenes = ({ almacenes, ubicaciones, getEstadoStockClass, getEstadoTexto }) => (
  <table className="inventario-table">
    <thead>
      <tr>
        <th>Almacén</th>
        <th>Artículos</th>
        <th>Stock Total</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      {almacenes.map(alm => {
        const itemsEnAlmacen = ubicaciones.filter(ubi => ubi.almacen === alm.codigo);
        const stockTotal = itemsEnAlmacen.reduce((sum, ubi) => sum + ubi.stock, 0);
        
        return (
          <tr key={alm.codigo} className="almacen-row">
            <td>{alm.nombre}</td>
            <td>{itemsEnAlmacen.length}</td>
            <td>{stockTotal}</td>
            <td className={getEstadoStockClass(stockTotal)}>
              <span className="estado-badge">{getEstadoTexto(stockTotal)}</span>
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

const TablaUbicaciones = ({ ubicaciones, getEstadoStockClass, getEstadoTexto }) => (
  <table className="inventario-table">
    <thead>
      <tr>
        <th>Ubicación</th>
        <th>Artículo</th>
        <th>Stock</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      {ubicaciones.map(ubi => (
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
);

const Paginacion = ({ totalPaginas, paginaActual, cambiarPagina }) => (
  totalPaginas > 1 && (
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
  )
);

// Funciones helper fuera del componente principal
const getAuthHeaders = () => {
  const user = JSON.parse(localStorage.getItem('user'));
  return user ? {
    usuario: user.CodigoCliente || '',
    codigoempresa: user.CodigoEmpresa || ''
  } : {};
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

const getEstadoStockClass = (stock) => {
  if (stock === 0) return 'estado-sin-stock';
  if (stock < 0) return 'estado-negativo';
  return 'estado-normal';
};

const getAlmacenesPorArticulo = (codigo, almacenes, ubicaciones) => {
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

const getUbicacionesPorArticuloAlmacen = (codigo, almacen, ubicaciones) => {
  return ubicaciones
    .filter(ubi => ubi.codigo === codigo && ubi.almacen === almacen)
    .sort((a, b) => a.ubicacion.localeCompare(b.ubicacion));
};

const getNombreCategoria = (codigoCategoria, categorias) => {
  const categoria = categorias.find(c => c.codigo === codigoCategoria);
  return categoria ? categoria.nombre : 'Desconocida';
};

const InventarioScreen = () => {
  const navigate = useNavigate();
  const [state, setState] = useState({
    inventario: [],
    categorias: [],
    almacenes: [],
    ubicaciones: [],
    loading: true,
    error: '',
    filtro: '',
    paginaActual: 1,
    resumen: {
      totalArticulos: 0,
      conStock: 0,
      sinStock: 0,
      stockNegativo: 0
    },
    usuarioPermisos: false,
    usuarioData: null,
    almacenSeleccionado: '',
    filtroTipoVista: 'consolidado',
    detallesStock: {},
    ediciones: {}
  });

  const itemsPorPagina = 20;

  // Destructuring para simplificar el acceso
  const {
    inventario,
    categorias,
    almacenes,
    ubicaciones,
    loading,
    error,
    filtro,
    paginaActual,
    resumen,
    usuarioPermisos,
    usuarioData,
    almacenSeleccionado,
    filtroTipoVista,
    detallesStock,
    ediciones
  } = state;

  // Memoized values
  const inventarioFiltrado = useMemo(() => {
    return inventario
      .filter(item => {
        const matchTexto = item.codigo.toLowerCase().includes(filtro.toLowerCase()) ||
          item.descripcion.toLowerCase().includes(filtro.toLowerCase());
        
        const matchAlmacen = almacenSeleccionado ? 
          ubicaciones.some(ubi => 
            ubi.codigo === item.codigo && ubi.almacen === almacenSeleccionado
          ) : true;
        
        return matchTexto && matchAlmacen;
      })
      .sort((a, b) => {
        const estadoA = a.stock > 0 ? 0 : (a.stock < 0 ? 1 : 2);
        const estadoB = b.stock > 0 ? 0 : (b.stock < 0 ? 1 : 2);
        return estadoA !== estadoB ? estadoA - estadoB : a.codigo.localeCompare(b.codigo);
      });
  }, [inventario, filtro, almacenSeleccionado, ubicaciones]);

  const itemsActuales = useMemo(() => {
    const indexUltimoItem = paginaActual * itemsPorPagina;
    const indexPrimerItem = indexUltimoItem - itemsPorPagina;
    return inventarioFiltrado.slice(indexPrimerItem, indexUltimoItem);
  }, [inventarioFiltrado, paginaActual]);

  const totalPaginas = useMemo(() => {
    return Math.ceil(inventarioFiltrado.length / itemsPorPagina);
  }, [inventarioFiltrado, itemsPorPagina]);

  const cambiosPendientes = useMemo(() => Object.keys(ediciones).length, [ediciones]);

  // Carga inicial de datos
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
      navigate('/');
      return;
    }

    setState(prev => ({
      ...prev,
      usuarioData: user,
      usuarioPermisos: user.permisos?.inventario_editar || false
    }));
      
    const cargarCategorias = async () => {
      try {
        const headers = getAuthHeaders();
        const response = await axios.get(
          `http://localhost:3000/categorias-empleado?codigoEmpresa=${user.CodigoEmpresa}`,
          { headers }
        );
        setState(prev => ({ ...prev, categorias: response.data }));
      } catch (error) {
        console.error('Error cargando categorías:', error);
        setState(prev => ({ 
          ...prev, 
          error: 'Error al cargar las categorías: ' + (error.response?.data?.message || error.message)
        }));
      }
    };
      
    cargarCategorias();
    cargarDatos();
  }, [navigate]);

  const cargarDatos = useCallback(async () => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    
    try {
      setState(prev => ({ ...prev, loading: true, error: '' }));
      
      const headers = getAuthHeaders();
      const codigoEmpresa = user.CodigoEmpresa;
      
      const responses = await Promise.all([
        axios.get(`http://localhost:3000/inventario?codigoEmpresa=${codigoEmpresa}`, { headers }),
        axios.get(`http://localhost:3000/almacenes?codigoEmpresa=${codigoEmpresa}`, { headers }),
        axios.get(`http://localhost:3000/inventario/ubicaciones?codigoEmpresa=${codigoEmpresa}`, { headers })
      ]);
      
      const ubicacionesData = responses[2].data.map(ubi => ({
        ...ubi,
        stock: Number(ubi.stock)
      }));

      const inventarioData = responses[0].data;
      
      setState(prev => ({
        ...prev,
        inventario: inventarioData,
        almacenes: responses[1].data,
        ubicaciones: ubicacionesData,
        resumen: {
          totalArticulos: inventarioData.length,
          conStock: inventarioData.filter(item => item.stock > 0).length,
          sinStock: inventarioData.filter(item => item.stock === 0).length,
          stockNegativo: inventarioData.filter(item => item.stock < 0).length
        },
        loading: false
      }));
    } catch (error) {
      console.error('Error cargando inventario:', error);
      const errorMsg = error.response?.status === 401 
        ? 'No autorizado. Por favor, inicia sesión de nuevo' 
        : 'Error de conexión con el servidor';
      
      setState(prev => ({ ...prev, error: errorMsg, loading: false }));
    }
  }, []);

  const sincronizarInventario = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true }));
      
      const ajustesPendientes = Object.keys(ediciones).map(key => {
        const [codigoArticulo, almacen, ubicacion, partida] = key.split('|');
        return {
          codigoArticulo,
          codigoAlmacen: almacen,
          ubicacion,
          partida: partida || '',
          nuevoStock: ediciones[key]
        };
      });

      if (ajustesPendientes.length === 0) {
        setState(prev => ({ ...prev, error: 'No hay cambios pendientes para sincronizar' }));
        return;
      }

      const headers = getAuthHeaders();
      await axios.post(
        'http://localhost:3000/ajustar-stock-multiple', 
        { ajustes: ajustesPendientes }, 
        { headers }
      );
      
      await cargarDatos();
      
      setState(prev => ({
        ...prev,
        ediciones: {},
        error: 'Sincronización completada exitosamente'
      }));
    } catch (error) {
      console.error('Error sincronizando inventario:', error);
      setState(prev => ({
        ...prev,
        error: 'Error al sincronizar inventario: ' + (error.response?.data?.mensaje || error.message)
      }));
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [ediciones, cargarDatos]);

  // Handlers
  const toggleDetalleStock = useCallback(codigo => {
    setState(prev => ({
      ...prev,
      detallesStock: {
        ...prev.detallesStock,
        [codigo]: !prev.detallesStock[codigo]
      }
    }));
  }, []);

  const handleCambioStock = useCallback((codigoArticulo, almacen, ubicacion, partida, nuevoValor) => {
    const clave = `${codigoArticulo}|${almacen}|${ubicacion}|${partida || ''}`;
    setState(prev => ({
      ...prev,
      ediciones: {
        ...prev.ediciones,
        [clave]: Number(nuevoValor)
      }
    }));
  }, []);

  const cambiarPagina = useCallback(numeroPagina => {
    setState(prev => ({ ...prev, paginaActual: numeroPagina }));
  }, []);

  const handleStateChange = useCallback((key, value) => {
    setState(prev => ({ ...prev, [key]: value }));
  }, []);

  return (
    <div className="inventario-container">
      <div className="inventario-header">
        <h2>Gestión de Inventario</h2>
      </div>
      
      {usuarioData && (
        <div className="user-info">
          <span>
            Usuario: <strong>{usuarioData.Nombre}</strong> | 
            Empresa: <strong>{usuarioData.CodigoEmpresa}</strong> | 
            Categoría: <strong>{getNombreCategoria(usuarioData.CodigoCategoriaEmpleadoLc, categorias)}</strong> | 
            Permisos: <strong>{usuarioPermisos ? 'Administrador' : 'Consulta'}</strong>
          </span>
        </div>
      )}

      <ResumenInventario 
        resumen={resumen} 
        cambiosPendientes={cambiosPendientes} 
      />

      <Filtros
        filtro={filtro}
        setFiltro={value => handleStateChange('filtro', value)}
        almacenSeleccionado={almacenSeleccionado}
        setAlmacenSeleccionado={value => handleStateChange('almacenSeleccionado', value)}
        filtroTipoVista={filtroTipoVista}
        setFiltroTipoVista={value => handleStateChange('filtroTipoVista', value)}
        almacenes={almacenes}
        sincronizarInventario={sincronizarInventario}
        cargarDatos={cargarDatos}
        loading={loading}
        cambiosPendientes={cambiosPendientes}
      />

      {error && (
        <div className={`error-message ${error.includes('completada') ? 'success' : ''}`}>
          {error}
        </div>
      )}

      <div className="table-container">
        {loading ? (
          <div className="loading">
            <p>Cargando inventario...</p>
          </div>
        ) : filtroTipoVista === 'consolidado' ? (
          <TablaConsolidado 
            items={itemsActuales}
            detallesStock={detallesStock}
            toggleDetalleStock={toggleDetalleStock}
            getEstadoStock={getEstadoStock}
            getEstadoTexto={getEstadoTexto}
            ubicaciones={ubicaciones}
            almacenes={almacenes}
            usuarioPermisos={usuarioPermisos}
            ediciones={ediciones}
            handleCambioStock={handleCambioStock}
          />
        ) : filtroTipoVista === 'almacenes' ? (
          <TablaAlmacenes 
            almacenes={almacenes}
            ubicaciones={ubicaciones}
            getEstadoStockClass={getEstadoStockClass}
            getEstadoTexto={getEstadoTexto}
          />
        ) : (
          <TablaUbicaciones 
            ubicaciones={ubicaciones}
            getEstadoStockClass={getEstadoStockClass}
            getEstadoTexto={getEstadoTexto}
          />
        )}

        <Paginacion 
          totalPaginas={totalPaginas}
          paginaActual={paginaActual}
          cambiarPagina={cambiarPagina}
        />
      </div>
      
      <Navbar />
    </div>
  );
};

export default InventarioScreen;