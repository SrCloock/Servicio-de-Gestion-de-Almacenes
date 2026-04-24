import '../styles/RecepcionPedidosCompra.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePermissions } from '../PermissionsManager';
import API from '../helpers/api';
import { Alert, AlertTitle, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Stack, TableContainer, TextField, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const ALMACEN_RECEPCION_FIJO = 'PTO';
const UBICACION_RECEPCION_FIJA = 'RECEPCION';

const RecepcionHeader = ({
  title,
  subtitle,
  summary,
  mostrarFiltros,
  onToggleFiltros,
  onRefresh,
  loading
}) => {
  return (
    <Paper elevation={2} className="RPC-header" sx={{ p: 3, borderRadius: 3 }}>
      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
        >
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Box className="RPC-title-icon">📋</Box>
            <Stack spacing={0.5}>
              <Typography variant="h4" component="h1" sx={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                {title}
              </Typography>
              <Typography variant="body2" className="RPC-header-subtitle">
                {subtitle}
              </Typography>
            </Stack>
          </Stack>

          <Box className="RPC-badge RPC-badge-info">{summary}</Box>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} className="RPC-action-buttons">
          <Button variant="outlined" color="secondary" onClick={onToggleFiltros}>
            {mostrarFiltros ? 'Ocultar filtros' : 'Filtrar pedidos'}
          </Button>
          <Button variant="contained" onClick={onRefresh} disabled={loading}>
            {loading ? 'Cargando...' : 'Actualizar'}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};


const RecepcionFilters = ({ visible, filtros, onFiltrosChange, onClear, onApply }) => {
  if (!visible) return null;

  const updateField = (field, value) => {
    onFiltrosChange({
      ...filtros,
      [field]: value
    });
  };

  return (
    <Paper elevation={1} className="RPC-filtros-panel" sx={{ p: 3, borderRadius: 3, mb: 3 }}>
      <Stack spacing={3}>
        <Typography variant="h6" component="h3">
          Filtrar pedidos
        </Typography>

        <Box
          className="RPC-filtros-grid"
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' },
            gap: 2
          }}
        >
          <TextField
            label="Proveedor"
            placeholder="Código o nombre"
            value={filtros.proveedor}
            onChange={(e) => updateField('proveedor', e.target.value)}
            fullWidth
          />
          <TextField
            label="Número pedido"
            type="number"
            placeholder="Número exacto"
            value={filtros.numeroPedido}
            onChange={(e) => updateField('numeroPedido', e.target.value)}
            fullWidth
          />
          <TextField
            label="Desde"
            type="date"
            value={filtros.fechaDesde}
            onChange={(e) => updateField('fechaDesde', e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Hasta"
            type="date"
            value={filtros.fechaHasta}
            onChange={(e) => updateField('fechaHasta', e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="flex-end">
          <Button variant="outlined" onClick={onClear}>
            Limpiar filtros
          </Button>
          <Button variant="contained" onClick={onApply}>
            Aplicar filtros
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};


const RecepcionAlerts = ({ error, success, onCloseError, onCloseSuccess }) => {
  if (!error && !success) return null;

  return (
    <Stack spacing={2} sx={{ mb: 3 }}>
      {error && (
        <Alert severity="error" onClose={onCloseError}>
          <AlertTitle>Error</AlertTitle>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={onCloseSuccess}>
          <AlertTitle>Correcto</AlertTitle>
          {success}
        </Alert>
      )}
    </Stack>
  );
};


const RecepcionPagination = ({ visible, page, totalPages, hasPrev, hasNext, loading, onPrev, onNext }) => {
  if (!visible) return null;

  return (
    <Paper elevation={1} className="RPC-paginacion-controls" sx={{ p: 2, mt: 3, borderRadius: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" alignItems="center">
        <Button variant="outlined" onClick={onPrev} disabled={!hasPrev || loading}>
          Anterior
        </Button>
        <Typography className="RPC-pagina-actual" fontWeight={600}>
          Página {page} de {totalPages}
        </Typography>
        <Button variant="outlined" onClick={onNext} disabled={!hasNext || loading}>
          Siguiente
        </Button>
      </Stack>
    </Paper>
  );
};


const RecepcionStateView = ({ type = 'info', title, message, buttonLabel, onButtonClick, buttonVariant = 'outlined' }) => {
  if (type === 'loading') {
    return (
      <Paper elevation={1} sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
        <Stack spacing={2} alignItems="center">
          <CircularProgress />
          <Typography>{message || 'Cargando...'}</Typography>
        </Stack>
      </Paper>
    );
  }

  const severity = type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info';

  return (
    <Paper elevation={1} sx={{ p: 4, borderRadius: 3 }}>
      <Alert severity={severity}>
        {title && <AlertTitle>{title}</AlertTitle>}
        {message}
      </Alert>
      {buttonLabel && onButtonClick && (
        <Box sx={{ mt: 2 }}>
          <Button variant={buttonVariant} onClick={onButtonClick}>
            {buttonLabel}
          </Button>
        </Box>
      )}
    </Paper>
  );
};


const ProveedorGroupCard = ({
  grupo,
  expandido,
  onToggle,
  loading,
  onGenerarAlbaran,
  children
}) => {
  return (
    <Card elevation={2} className="RPC-grupo-proveedor" sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Paper
        elevation={0}
        className={`RPC-proveedor-header ${expandido ? 'expanded' : ''}`}
        onClick={onToggle}
        sx={{ borderRadius: 0, cursor: 'pointer' }}
      >
        <div className="RPC-proveedor-header-content">
          <div className="RPC-proveedor-info">
            <div className="RPC-proveedor-expand">{expandido ? '▼' : '▶'}</div>
            <div className="RPC-proveedor-codigo">{grupo.codigoProveedor}</div>
            <div className="RPC-proveedor-nombre">{grupo.nombreProveedor}</div>
            <div className="RPC-proveedor-stats">
              <Chip className="RPC-stat-badge" label={`${grupo.totalPedidos} pedidos`} size="small" />
              <Chip className="RPC-stat-badge RPC-stat-recepcionados" label={`${grupo.totalUnidadesRecibidas.toLocaleString()} recibidas`} size="small" />
              <Chip className="RPC-stat-badge RPC-stat-pendientes" label={`${grupo.totalUnidadesPendientes.toLocaleString()} pendientes`} size="small" />
              <Chip
                className="RPC-stat-badge RPC-stat-importe"
                label={grupo.totalImporte.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                size="small"
              />
            </div>
          </div>

          <div className="RPC-proveedor-acciones">
            {grupo.tieneUnidadesParaAlbaran && (
              <Button
                variant="contained"
                color="success"
                size="small"
                className="RPC-btn RPC-btn-success RPC-btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerarAlbaran();
                }}
                disabled={loading}
              >
                Generar albarán
              </Button>
            )}
          </div>
        </div>
      </Paper>

      <CardContent sx={{ p: 0 }}>{children}</CardContent>
    </Card>
  );
};


const PedidoCompraCard = ({
  pedido,
  expandido,
  loading,
  tieneUnidadesRecibidas,
  onToggle,
  onGenerarAlbaran,
  onFinalizar,
  children
}) => {
  return (
    <Card elevation={1} className="RPC-pedido-item" sx={{ borderRadius: 3, overflow: 'hidden', mb: 2 }}>
      <Paper
        elevation={0}
        className={`RPC-pedido-header ${expandido ? 'expanded' : ''}`}
        onClick={onToggle}
        sx={{ borderRadius: 0, cursor: 'pointer' }}
      >
        <div className="RPC-pedido-info">
          <div className="RPC-pedido-expand">{expandido ? '▼' : '▶'}</div>
          <div className="RPC-pedido-numero">
            <strong>Pedido #{pedido.NumeroPedido}</strong>
            <div className="RPC-pedido-fecha">
              {new Date(pedido.FechaPedido).toLocaleDateString()} - Ejercicio: {pedido.EjercicioPedido}
              {pedido.SeriePedido && pedido.SeriePedido !== '0' && ` - Serie: ${pedido.SeriePedido}`}
            </div>
          </div>
          <div className="RPC-pedido-stats">
            <div className="RPC-pedido-stat">
              <span className="RPC-stat-label">Líneas:</span>
              <span className="RPC-stat-value">{pedido.TotalLineas}</span>
            </div>
            <div className="RPC-pedido-stat">
              <span className="RPC-stat-label">Pedidas:</span>
              <span className="RPC-stat-value">{parseFloat(pedido.TotalUnidadesPedidas).toLocaleString()}</span>
            </div>
            <div className="RPC-pedido-stat">
              <span className="RPC-stat-label">Recibidas:</span>
              <span className="RPC-stat-value RPC-text-success">{parseFloat(pedido.TotalUnidadesRecibidas).toLocaleString()}</span>
            </div>
            <div className="RPC-pedido-stat">
              <span className="RPC-stat-label">Pendientes:</span>
              <span className="RPC-stat-value RPC-text-warning">{parseFloat(pedido.TotalUnidadesPendientes).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="RPC-pedido-acciones">
          {tieneUnidadesRecibidas ? (
            <Button
              variant="contained"
              color="success"
              size="small"
              className="RPC-btn RPC-btn-success RPC-btn-xs"
              onClick={(e) => {
                e.stopPropagation();
                onGenerarAlbaran();
              }}
              disabled={loading}
            >
              Albarán
            </Button>
          ) : (
            <Chip className="RPC-estado-chip RPC-estado-pendiente" label="Pendiente" size="small" />
          )}

          <Button
            variant="contained"
            color="warning"
            size="small"
            className="RPC-btn RPC-btn-warning RPC-btn-xs"
            onClick={(e) => {
              e.stopPropagation();
              onFinalizar();
            }}
            disabled={loading}
          >
            Finalizar
          </Button>
        </div>
      </Paper>

      {expandido && <CardContent className="RPC-pedido-detalles">{children}</CardContent>}
    </Card>
  );
};


const RecepcionLineasTable = ({ title, children }) => {
  return (
    <div className="RPC-lineas-container">
      <Typography variant="h6" component="h4" sx={{ mb: 2 }}>
        {title}
      </Typography>
      <TableContainer component={Paper} elevation={1} className="modal-table-container" sx={{ borderRadius: 2 }}>
        {children}
      </TableContainer>
    </div>
  );
};


const RecepcionVariantesPanel = ({ title = 'Desglose de Variantes', children }) => {
  return (
    <Paper elevation={0} className="RPC-variantes-detalle" sx={{ p: 2, borderRadius: 2 }}>
      <Typography variant="subtitle1" component="h5" sx={{ mb: 2, fontWeight: 700 }}>
        {title}
      </Typography>
      <TableContainer component={Paper} elevation={1} className="modal-table-container" sx={{ borderRadius: 2 }}>
        {children}
      </TableContainer>
    </Paper>
  );
};


const RecepcionDialog = ({ open, title, subtitle, onClose, maxWidth = 'md', footer, children }) => {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={maxWidth}>
      <DialogTitle component="div" sx={{ pb: subtitle ? 1 : 2, pr: 7 }}>
        <Typography variant="h6" component="div" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" component="div" color="text.secondary" sx={{ mt: 0.75, maxWidth: 'calc(100% - 24px)' }}>
            {subtitle}
          </Typography>
        )}
        <IconButton
          aria-label="cerrar"
          onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ '& .RPC-modal-section:first-of-type': { mt: 0 } }}>
        {children}
      </DialogContent>
      {footer && (
        <DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap' }}>
          {footer}
        </DialogActions>
      )}
    </Dialog>
  );
};


const GenerarAlbaranDialog = ({ open, onClose, footer, children }) => {
  return (
    <RecepcionDialog
      open={open}
      onClose={onClose}
      title="Generar Albarán NO ACUMULATIVO"
      maxWidth="lg"
      footer={footer}
    >
      {children}
    </RecepcionDialog>
  );
};


const FinalizarPedidoDialog = ({ open, onClose, footer, children }) => {
  return (
    <RecepcionDialog
      open={open}
      onClose={onClose}
      title="Finalizar Pedido"
      maxWidth="md"
      footer={footer}
    >
      {children}
    </RecepcionDialog>
  );
};


const RecepcionPedidosCompra = () => {
  const permissions = usePermissions();
  const userData = JSON.parse(localStorage.getItem('user'));
  const user = userData || {};
  
  // Referencias
  const mountedRef = useRef(false);
  const cargarPedidosRef = useRef(false);
  
  // Estados principales
  const [pedidos, setPedidos] = useState([]);
  const [pedidosAgrupados, setPedidosAgrupados] = useState({});
  const [detallesPedidos, setDetallesPedidos] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Estados para paginación
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  });
  
  // Estados para filtros
  const [filtros, setFiltros] = useState({
    proveedor: '',
    fechaDesde: '',
    fechaHasta: '',
    numeroPedido: ''
  });
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  
  // Estados para expansión
  const [proveedoresExpandidos, setProveedoresExpandidos] = useState({});
  const [pedidosExpandidos, setPedidosExpandidos] = useState({});
  const [lineasExpandidas, setLineasExpandidas] = useState({});
  
  // Estados para recepción (MODAL)
  const [modalRecepcion, setModalRecepcion] = useState(false);
  const [lineaARecepcionar, setLineaARecepcionar] = useState(null);
  const [almacenes, setAlmacenes] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [selectedAlmacen, setSelectedAlmacen] = useState('');
  const [selectedUbicacion, setSelectedUbicacion] = useState('');
  const [unidadesARecepcionar, setUnidadesARecepcionar] = useState('');
  const [variantesDistribucion, setVariantesDistribucion] = useState([]);
  const [loadingVariantes, setLoadingVariantes] = useState(false);
  
  // Estados para albarán
  const [modalGenerarAlbaran, setModalGenerarAlbaran] = useState(false);
  const [pedidoAAlbaran, setPedidoAAlbaran] = useState(null);
  const [lineasConRecepcion, setLineasConRecepcion] = useState([]);
  const [totalUnidadesAlbaran, setTotalUnidadesAlbaran] = useState(0);
  const [importeTotalAlbaran, setImporteTotalAlbaran] = useState(0);
  
  // Estados para finalizar pedido
  const [modalFinalizarPedido, setModalFinalizarPedido] = useState(false);
  const [pedidoAFinalizar, setPedidoAFinalizar] = useState(null);

  // Verificar permisos
  const canViewInventory = permissions.canViewInventory;
  const canReceivePurchaseOrders = permissions.canViewInventory || 
    permissions.isAdmin || 
    permissions.isAdvancedUser;

  const getApiErrorMessage = (err, fallbackMessage) =>
    err.response?.data?.mensaje || err.message || fallbackMessage;

  // ========== FUNCIONES PRINCIPALES ==========

  // Función para agrupar pedidos por proveedor
  const agruparPedidosPorProveedor = (pedidosLista) => {
    const agrupados = {};
    
    pedidosLista.forEach(pedido => {
      const claveProveedor = `${pedido.CodigoProveedor}_${pedido.NombreProveedor}`;
      
      if (!agrupados[claveProveedor]) {
        agrupados[claveProveedor] = {
          codigoProveedor: pedido.CodigoProveedor,
          nombreProveedor: pedido.NombreProveedor,
          pedidos: [],
          totalPedidos: 0,
          totalUnidadesPedidas: 0,
          totalUnidadesRecibidas: 0,
          totalUnidadesPendientes: 0,
          totalImporte: 0,
          tieneUnidadesParaAlbaran: false
        };
      }
      
      agrupados[claveProveedor].pedidos.push(pedido);
      agrupados[claveProveedor].totalPedidos++;
      agrupados[claveProveedor].totalUnidadesPedidas += parseFloat(pedido.TotalUnidadesPedidas) || 0;
      agrupados[claveProveedor].totalUnidadesRecibidas += parseFloat(pedido.TotalUnidadesRecibidas) || 0;
      agrupados[claveProveedor].totalUnidadesPendientes += parseFloat(pedido.TotalUnidadesPendientes) || 0;
      agrupados[claveProveedor].totalImporte += parseFloat(pedido.ImporteLiquido) || 0;
      
      if (parseFloat(pedido.TotalUnidadesRecibidas) > 0) {
        agrupados[claveProveedor].tieneUnidadesParaAlbaran = true;
      }
    });
    
    return agrupados;
  };

  // Cargar pedidos de compra con paginación
  const cargarPedidos = useCallback(async (pagina = 1, usarFiltros = false) => {
    if (cargarPedidosRef.current) return;
    cargarPedidosRef.current = true;
    
    if (!user.CodigoEmpresa) {
      setError('No se ha configurado la empresa del usuario');
      cargarPedidosRef.current = false;
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log('🔍 Cargando pedidos...');
      
      let url = '/pedidos-compra';
      const params = new URLSearchParams({
        page: pagina,
        limit: pagination.limit
      });
      
      // Si hay filtros activos, usar endpoint de búsqueda
      if (usarFiltros && (filtros.proveedor || filtros.fechaDesde || filtros.fechaHasta || filtros.numeroPedido)) {
        url = '/pedidos-compra/buscar';
        if (filtros.proveedor) params.append('proveedor', filtros.proveedor);
        if (filtros.fechaDesde) params.append('fechaDesde', filtros.fechaDesde);
        if (filtros.fechaHasta) params.append('fechaHasta', filtros.fechaHasta);
        if (filtros.numeroPedido) params.append('numeroPedido', filtros.numeroPedido);
        params.append('estado', '0'); // Solo pendientes
      }
      
      const { data } = await API.get(url, {
        params: Object.fromEntries(params.entries())
      });
      
      if (data.success) {
        console.log(`✅ ${data.pedidos.length} pedidos cargados`);
        setPedidos(data.pedidos);
        setPagination(data.pagination);
        
        // Agrupar pedidos por proveedor
        const agrupados = agruparPedidosPorProveedor(data.pedidos);
        setPedidosAgrupados(agrupados);
        
        // Limpiar estados de expansión
        setProveedoresExpandidos({});
        setPedidosExpandidos({});
        setLineasExpandidas({});
      } else {
        throw new Error(data.mensaje || 'Error desconocido');
      }
    } catch (err) {
      console.error('❌ Error cargando pedidos:', err);
      setError(getApiErrorMessage(err, 'Error al cargar pedidos'));
    } finally {
      setLoading(false);
      setTimeout(() => {
        cargarPedidosRef.current = false;
      }, 1000);
    }
  }, [user, pagination.limit, filtros]);

  // Cargar detalles completos de un pedido específico
  const cargarDetallesPedido = async (ejercicio, serie, numero, forzarRecarga = false) => {
    const clave = `${ejercicio}_${serie || '0'}_${numero}`;
    
    // Si ya está cargado y no forzamos recarga
    if (detallesPedidos[clave] && !forzarRecarga) {
      // Solo cambiar estado de expansión
      setPedidosExpandidos(prev => ({
        ...prev,
        [clave]: !prev[clave]
      }));
      return;
    }
    
    setLoading(true);
    
    try {
      const serieParam = serie || '0';
      
      console.log(`🔍 Cargando detalles del pedido ${clave}...`);
      const { data } = await API.get(`/pedidos-compra/${ejercicio}/${serieParam}/${numero}/detalle`);
      
      if (data.success) {
        console.log(`✅ Detalles cargados: ${data.lineas.length} líneas`);
        
        setDetallesPedidos(prev => ({
          ...prev,
          [clave]: data
        }));
        
        // Expandir el pedido automáticamente
        setPedidosExpandidos(prev => ({
          ...prev,
          [clave]: true
        }));
        
        // Inicializar estado de líneas expandidas
        const nuevasLineasExpandidas = {};
        data.lineas.forEach((linea, index) => {
          if (linea.variantes && linea.variantes.length > 0) {
            nuevasLineasExpandidas[`${clave}_${index}`] = false;
          }
        });
        setLineasExpandidas(prev => ({ ...prev, ...nuevasLineasExpandidas }));
      }
    } catch (err) {
      console.error(`❌ Error cargando detalles del pedido ${clave}:`, err);
      setError(`Error cargando detalles: ${getApiErrorMessage(err, 'Error al cargar detalles del pedido')}`);
    } finally {
      setLoading(false);
    }
  };

  // Toggle expansión de proveedor
  const toggleProveedorExpandido = (claveProveedor) => {
    setProveedoresExpandidos(prev => ({
      ...prev,
      [claveProveedor]: !prev[claveProveedor]
    }));
  };

  // Toggle expansión de línea con variantes
  const toggleLineaExpandida = (clavePedido, lineaIndex) => {
    const clave = `${clavePedido}_${lineaIndex}`;
    setLineasExpandidas(prev => ({
      ...prev,
      [clave]: !prev[clave]
    }));
  };

  // Abrir modal para recepcionar una línea
  const abrirModalRecepcion = async (linea, pedidoKey, variante = null, talla = null) => {
    const detalles = detallesPedidos[pedidoKey];
    if (!detalles) {
      setError('No se encontraron detalles del pedido');
      return;
    }

    let unidadesPendientes;
    
    if (variante && talla) {
      unidadesPendientes = parseFloat(talla.unidades) || 0;
    } else if (variante) {
      unidadesPendientes = parseFloat(variante.unidadesTotal) || 0;
    } else {
      unidadesPendientes = parseFloat(linea.UnidadesPendientes) || 0;
    }

    if (unidadesPendientes <= 0) {
      setError('No hay unidades pendientes para recepcionar');
      return;
    }

    setLineaARecepcionar({ linea, variante, talla, pedidoKey });
    setUnidadesARecepcionar(unidadesPendientes.toString());
    setSelectedAlmacen(ALMACEN_RECEPCION_FIJO);
    setSelectedUbicacion(UBICACION_RECEPCION_FIJA);
    setAlmacenes([{
      CodigoAlmacen: ALMACEN_RECEPCION_FIJO,
      Almacen: 'Recepción temporal'
    }]);
    setUbicaciones([{
      Ubicacion: UBICACION_RECEPCION_FIJA,
      DescripcionUbicacion: 'Recepción temporal'
    }]);
    setVariantesDistribucion([]);
    
    // Si es recepción de línea completa y tiene variantes
    if (!variante && !talla && linea.variantes && linea.variantes.length > 0) {
      // Crear distribución basada en las variantes del pedido
      const distribucion = [];
      linea.variantes.forEach(variante => {
        if (variante.unidadesPorTalla) {
          Object.values(variante.unidadesPorTalla).forEach(talla => {
            if (parseFloat(talla.unidades) > 0) {
              distribucion.push({
                codigoColor: variante.codigoColor,
                nombreColor: variante.nombreColor,
                codigoTalla: talla.codigo,
                nombreTalla: talla.nombre,
                grupoTalla: variante.grupoTalla,
                unidades: 0,
                maxUnidades: parseFloat(talla.unidades) || 0
              });
            }
          });
        } else if (variante.unidadesTotal > 0) {
          distribucion.push({
            codigoColor: variante.codigoColor || '',
            nombreColor: variante.nombreColor || '',
            codigoTalla: '',
            nombreTalla: '',
            grupoTalla: variante.grupoTalla || '',
            unidades: 0,
            maxUnidades: parseFloat(variante.unidadesTotal) || 0
          });
        }
      });
      
      if (distribucion.length > 0) {
        setVariantesDistribucion(distribucion);
      } else {
        // Cargar variantes del artículo
        await cargarVariantesArticulo(linea.CodigoArticulo);
      }
    } else if (!variante && !talla && linea.tipoVariante !== 'NORMAL') {
      await cargarVariantesArticulo(linea.CodigoArticulo);
    }
    
    setModalRecepcion(true);
  };

  // Cargar variantes para un artículo
  const cargarVariantesArticulo = async (codigoArticulo) => {
    setLoadingVariantes(true);
    try {
      const { data } = await API.get(`/articulos/${encodeURIComponent(codigoArticulo)}/variantes`);
      
      if (data.success) {
        if (data.combinaciones && data.combinaciones.length > 0) {
          const distribucion = data.combinaciones.map(comb => ({
            codigoColor: comb.codigoColor || '',
            nombreColor: comb.nombreColor || '',
            codigoTalla: comb.codigoTalla || '',
            nombreTalla: comb.nombreTalla || '',
            grupoTalla: comb.grupoTalla || '',
            unidades: 0,
            maxUnidades: parseFloat(unidadesARecepcionar) || 0
          }));
          setVariantesDistribucion(distribucion);
        } else if (data.colores && data.colores.length > 0) {
          const distribucion = data.colores.map(color => ({
            codigoColor: color.codigo,
            nombreColor: color.nombre,
            codigoTalla: '',
            nombreTalla: '',
            grupoTalla: '',
            unidades: 0,
            maxUnidades: parseFloat(unidadesARecepcionar) || 0
          }));
          setVariantesDistribucion(distribucion);
        } else if (data.tallas && data.tallas.length > 0) {
          const distribucion = data.tallas.map(talla => ({
            codigoColor: '',
            nombreColor: '',
            codigoTalla: talla.codigo,
            nombreTalla: talla.nombre,
            grupoTalla: talla.grupo || '',
            unidades: 0,
            maxUnidades: parseFloat(unidadesARecepcionar) || 0
          }));
          setVariantesDistribucion(distribucion);
        }
      }
    } catch (err) {
      console.error('Error cargando variantes:', err);
    } finally {
      setLoadingVariantes(false);
    }
  };

  // Cargar almacenes disponibles
  const cargarAlmacenes = async () => {
    setAlmacenes([{
      CodigoAlmacen: ALMACEN_RECEPCION_FIJO,
      Almacen: 'Recepción temporal'
    }]);
  };

  // Cargar ubicaciones para el almacén seleccionado
  const cargarUbicaciones = async (almacen) => {
    if (!almacen) {
      setUbicaciones([]);
      setSelectedUbicacion('');
      return;
    }

    setUbicaciones([{
      Ubicacion: UBICACION_RECEPCION_FIJA,
      DescripcionUbicacion: 'Recepción temporal'
    }]);
    setSelectedUbicacion(UBICACION_RECEPCION_FIJA);
  };

  // Procesar recepción de línea
  const procesarRecepcionLinea = async () => {
    if (!lineaARecepcionar) return;

    if (!selectedAlmacen || !selectedUbicacion) {
      setError('Debe seleccionar un almacén y ubicación');
      return;
    }

    const unidades = parseFloat(unidadesARecepcionar) || 0;
    if (unidades <= 0) {
      setError('Debe especificar unidades a recepcionar');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { linea, variante, talla, pedidoKey } = lineaARecepcionar;
      
      // Preparar el body según el tipo de recepción
      const body = {
        almacen: selectedAlmacen,
        ubicacion: selectedUbicacion,
        lineasRecepcion: [{
          Orden: linea.Orden || 0,
          codigoArticulo: linea.CodigoArticulo,
          unidadesRecepcionar: unidades,
          variantes: variante ? [
            {
              codigoColor: variante.codigoColor || '',
              codigoTalla: talla ? talla.codigo : '',
              unidades: unidades
            }
          ] : variantesDistribucion
            .filter(v => parseFloat(v.unidades) > 0)
            .map(v => ({
              codigoColor: v.codigoColor || '',
              codigoTalla: v.codigoTalla || '',
              unidades: v.unidades
            }))
        }],
        comentarioRecepcion: `Recepción manual por ${user.UsuarioLogicNet}`
      };

      const { data } = await API.post(
        `/pedidos-compra/${linea.EjercicioPedido}/${linea.SeriePedido || '0'}/${linea.NumeroPedido}/recepcionar`,
        body
      );


      if (data.success) {
        let mensajeExito = `Recepción exitosa: ${unidades} unidades de ${linea.CodigoArticulo} añadidas a ${selectedAlmacen} - ${selectedUbicacion}`;
        if (variante) {
          mensajeExito += ` (${variante.nombreColor}${talla ? ' - ' + talla.nombre : ''})`;
        }

        if (data.autoGenerarAlbaran) {
          try {
            const { data: albaranData } = await API.post(
              `/pedidos-compra/${linea.EjercicioPedido}/${linea.SeriePedido || '0'}/${linea.NumeroPedido}/generar-albaran`,
              {}
            );

            if (albaranData?.success && albaranData?.albaran) {
              mensajeExito += `. Albarán generado automáticamente: ${albaranData.albaran.numero} (Ejercicio ${albaranData.albaran.ejercicio})`;
            }
          } catch (autoAlbaranError) {
            mensajeExito += '. La recepción se guardó, pero la generación automática del albarán ha fallado.';
            setError(getApiErrorMessage(autoAlbaranError, 'Error al generar el albarán automáticamente.'));
          }
        }

        setSuccess(mensajeExito);
        
        // Recargar detalles del pedido
        await cargarDetallesPedido(linea.EjercicioPedido, linea.SeriePedido || '0', linea.NumeroPedido, true);
        
        // Recargar la lista de pedidos
        cargarPedidos(pagination.page, true);
        
        // Cerrar modal
        setModalRecepcion(false);
        setLineaARecepcionar(null);
      }
    } catch (err) {
      setError(`Error en recepción: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ✅ **FUNCIÓN CORREGIDA**: Preparar generación de albarán por proveedor (NO ACUMULATIVO)
  const prepararGenerarAlbaranPorProveedor = async (claveProveedor) => {
    const grupo = pedidosAgrupados[claveProveedor];
    
    if (!grupo || !grupo.tieneUnidadesParaAlbaran) {
      setError('Este proveedor no tiene unidades recepcionadas para generar albarán');
      return;
    }
    
    // Obtener detalles de TODOS los pedidos del proveedor
    const lineasConRecepcionAgrupadas = [];
    let totalUnidadesAlbaran = 0;
    let importeTotalAlbaran = 0;
    
    for (const pedido of grupo.pedidos) {
      if (parseFloat(pedido.TotalUnidadesRecibidas) <= 0) continue;
      
      const clavePedido = `${pedido.EjercicioPedido}_${pedido.SeriePedido || '0'}_${pedido.NumeroPedido}`;
      
      // Si no tenemos los detalles, cargarlos
      if (!detallesPedidos[clavePedido]) {
        await cargarDetallesPedido(pedido.EjercicioPedido, pedido.SeriePedido || '0', pedido.NumeroPedido, false);
        // Esperar un momento para que carguen los detalles
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      const detalles = detallesPedidos[clavePedido];
      if (detalles && detalles.lineas) {
        // ✅ SOLO FILTRAR LÍNEAS CON UNIDADES RECIBIDAS
        const lineasConUnidades = detalles.lineas.filter(l => 
          parseFloat(l.UnidadesRecibidas) > 0
        );
        
        // ✅ AGREGAR INFORMACIÓN DEL PEDIDO A CADA LÍNEA
        const lineasConPedido = lineasConUnidades.map(linea => ({
          ...linea,
          ejercicioPedido: pedido.EjercicioPedido,
          seriePedido: pedido.SeriePedido || '0',
          numeroPedido: pedido.NumeroPedido,
          proveedor: pedido.NombreProveedor,
          codigoProveedor: pedido.CodigoProveedor
        }));
        
        lineasConRecepcionAgrupadas.push(...lineasConPedido);
        
        // ✅ CALCULAR TOTALES (PERO NO ACUMULAR CON ALBARANES ANTERIORES)
        // El backend se encargará de descontar lo ya albaranado
        totalUnidadesAlbaran += lineasConUnidades.reduce((sum, l) => 
          sum + parseFloat(l.UnidadesRecibidas), 0
        );
        
        importeTotalAlbaran += lineasConUnidades.reduce((sum, l) => 
          sum + (parseFloat(l.UnidadesRecibidas) * parseFloat(l.Precio || 0)), 0
        );
      }
    }
    
    if (lineasConRecepcionAgrupadas.length === 0) {
      setError('No hay líneas con unidades recepcionadas');
      return;
    }
    
    setPedidoAAlbaran({
      tipo: 'PROVEEDOR',
      codigoProveedor: grupo.codigoProveedor,
      nombreProveedor: grupo.nombreProveedor,
      pedidos: grupo.pedidos
        .filter(p => parseFloat(p.TotalUnidadesRecibidas) > 0)
        .map(p => ({
          ejercicio: p.EjercicioPedido,
          serie: p.SeriePedido || '0',
          numero: p.NumeroPedido
        }))
    });
    
    setLineasConRecepcion(lineasConRecepcionAgrupadas);
    setTotalUnidadesAlbaran(totalUnidadesAlbaran);
    setImporteTotalAlbaran(importeTotalAlbaran);
    setModalGenerarAlbaran(true);
  };

  // ✅ **FUNCIÓN CORREGIDA**: Preparar generación de albarán por pedido individual (NO ACUMULATIVO)
  const prepararGenerarAlbaran = (pedido) => {
    const clave = `${pedido.EjercicioPedido}_${pedido.SeriePedido || '0'}_${pedido.NumeroPedido}`;
    const detalles = detallesPedidos[clave];
    
    if (!detalles) {
      cargarDetallesPedido(pedido.EjercicioPedido, pedido.SeriePedido || '0', pedido.NumeroPedido, false);
      setTimeout(() => {
        const detallesActuales = detallesPedidos[clave];
        if (detallesActuales) {
          calcularLineasParaAlbaran(detallesActuales, pedido);
        }
      }, 500);
    } else {
      calcularLineasParaAlbaran(detalles, pedido);
    }
  };

  const calcularLineasParaAlbaran = (detalles, pedido) => {
    // ✅ SOLO FILTRAR LÍNEAS CON UNIDADES RECIBIDAS
    const lineasConUnidadesRecibidas = detalles.lineas.filter(l => 
      parseFloat(l.UnidadesRecibidas) > 0
    );
    
    if (lineasConUnidadesRecibidas.length === 0) {
      setError('No hay líneas con unidades recibidas para generar albarán');
      return;
    }
    
    const totalUnidades = lineasConUnidadesRecibidas.reduce((sum, l) => 
      sum + parseFloat(l.UnidadesRecibidas), 0
    );
    
    const importeTotal = lineasConUnidadesRecibidas.reduce((sum, l) => 
      sum + (parseFloat(l.UnidadesRecibidas) * parseFloat(l.Precio || 0)), 0
    );
    
    setPedidoAAlbaran({
      tipo: 'PEDIDO',
      ...pedido
    });
    
    setLineasConRecepcion(lineasConUnidadesRecibidas);
    setTotalUnidadesAlbaran(totalUnidades);
    setImporteTotalAlbaran(importeTotal);
    setModalGenerarAlbaran(true);
  };

  // ✅ **FUNCIÓN CORREGIDA**: Generar albarán (NO ACUMULATIVO)
  const generarAlbaran = async () => {
    if (!pedidoAAlbaran) return;

    setLoading(true);
    setError(null);

    try {
      if (pedidoAAlbaran.tipo === 'PROVEEDOR') {
        // ✅ GENERAR ALBARÁN PARA PROVEEDOR (NO ACUMULATIVO)
        console.log(`📦 Generando albarán NO ACUMULATIVO para proveedor ${pedidoAAlbaran.nombreProveedor}...`);
        
        const { data } = await API.post(
          `/proveedores/${pedidoAAlbaran.codigoProveedor}/generar-albaran`,
          {
            pedidos: pedidoAAlbaran.pedidos
            // ✅ NO ENVIAMOS LINEAS - EL BACKEND CALCULARÁ UNIDADES PENDIENTES
          }
        );

        if (data.success) {
          setSuccess(`✅ Albarán NO ACUMULATIVO generado correctamente para ${pedidoAAlbaran.nombreProveedor}. Número: ${data.albaran.numero}`);
          
          // ✅ RECARGAR TODOS LOS DATOS
          cargarPedidos(pagination.page, true);
          
          // ✅ LIMPIAR ESTADOS
          setModalGenerarAlbaran(false);
          setPedidoAAlbaran(null);
          setLineasConRecepcion([]);
          setTotalUnidadesAlbaran(0);
          setImporteTotalAlbaran(0);
        }
      } else {
        // ✅ GENERAR ALBARÁN PARA PEDIDO INDIVIDUAL (NO ACUMULATIVO)
        console.log(`📦 Generando albarán NO ACUMULATIVO para pedido ${pedidoAAlbaran.NumeroPedido}...`);
        
        const { data } = await API.post(
          `/pedidos-compra/${pedidoAAlbaran.EjercicioPedido}/${pedidoAAlbaran.SeriePedido || '0'}/${pedidoAAlbaran.NumeroPedido}/generar-albaran`
        );

        if (data.success) {
          setSuccess(`✅ Albarán NO ACUMULATIVO generado correctamente. Número: ${data.albaran.numero} (Ejercicio: ${data.albaran.ejercicio})`);
          
          // ✅ RECARGAR LA LISTA DE PEDIDOS
          cargarPedidos(pagination.page, true);
          
          // ✅ LIMPIAR ESTADOS
          setModalGenerarAlbaran(false);
          setPedidoAAlbaran(null);
          setLineasConRecepcion([]);
          setTotalUnidadesAlbaran(0);
          setImporteTotalAlbaran(0);
        }
      }
    } catch (err) {
      console.error('[ERROR GENERAR ALBARÁN]', err);
      setError(`Error al generar albarán: ${getApiErrorMessage(err, 'Error al generar albarán')}`);
    } finally {
      setLoading(false);
    }
  };

  // Preparar finalización de pedido
  const prepararFinalizarPedido = (pedido) => {
    setPedidoAFinalizar(pedido);
    setModalFinalizarPedido(true);
  };

  // Finalizar pedido (marcar como servido)
  const finalizarPedido = async () => {
    if (!pedidoAFinalizar) return;

    setLoading(true);
    setError(null);

    try {
      const { data } = await API.post(
        `/pedidos-compra/${pedidoAFinalizar.EjercicioPedido}/${pedidoAFinalizar.SeriePedido || '0'}/${pedidoAFinalizar.NumeroPedido}/finalizar`,
        {
          motivo: `Finalizado manualmente por ${user.UsuarioLogicNet}`
        }
      );

      if (data.success) {
        setSuccess(`✅ Pedido #${pedidoAFinalizar.NumeroPedido} finalizado correctamente como servido.`);
        
        // Recargar la lista de pedidos
        cargarPedidos(pagination.page, true);
        
        // Limpiar estados
        setModalFinalizarPedido(false);
        setPedidoAFinalizar(null);
      }
    } catch (err) {
      console.error('[ERROR FINALIZAR PEDIDO]', err);
      setError(`Error al finalizar pedido: ${getApiErrorMessage(err, 'Error al finalizar pedido')}`);
    } finally {
      setLoading(false);
    }
  };

  // Aplicar filtros
  const aplicarFiltros = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    cargarPedidos(1, true);
    setMostrarFiltros(false);
  };

  // Limpiar filtros
  const limpiarFiltros = () => {
    setFiltros({
      proveedor: '',
      fechaDesde: '',
      fechaHasta: '',
      numeroPedido: ''
    });
    cargarPedidos(1, false);
    setMostrarFiltros(false);
  };

  // Navegación de páginas
  const cambiarPagina = (nuevaPagina) => {
    if (nuevaPagina < 1 || nuevaPagina > pagination.totalPages) return;
    
    setPagination(prev => ({ ...prev, page: nuevaPagina }));
    cargarPedidos(nuevaPagina, true);
  };

  // Efecto inicial
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      
      if (user && user.UsuarioLogicNet && canViewInventory) {
        cargarPedidos(1, false);
      }
    }
  }, []);

  // Cargar ubicaciones cuando cambia el almacén seleccionado
  useEffect(() => {
    if (modalRecepcion) {
      cargarAlmacenes();
      if (selectedAlmacen) {
        cargarUbicaciones(selectedAlmacen);
      }
    }
  }, [selectedAlmacen, modalRecepcion]);

  // Función para calcular porcentaje de recepción
  const calcularPorcentajeRecepcion = (unidadesPedidas, unidadesRecibidas) => {
    if (!unidadesPedidas || unidadesPedidas === 0) return 0;
    return (unidadesRecibidas / unidadesPedidas) * 100;
  };

  // Renderizar estado de línea
  const renderEstadoLinea = (linea) => {
    const porcentaje = calcularPorcentajeRecepcion(
      parseFloat(linea.UnidadesPedidas),
      parseFloat(linea.UnidadesRecibidas)
    );
    
    if (porcentaje >= 100) {
      return <span className="RPC-estado-chip RPC-estado-completado">✓ Completado</span>;
    } else if (porcentaje > 0) {
      return <span className="RPC-estado-chip RPC-estado-parcial">{porcentaje.toFixed(0)}%</span>;
    } else {
      return <span className="RPC-estado-chip RPC-estado-pendiente">Pendiente</span>;
    }
  };

  // Renderizar badge de tipo de variante
  const renderVarianteBadge = (tipoVariante) => {
    switch (tipoVariante) {
      case 'COLORES_TALLAS':
        return <span className="RPC-variante-badge RPC-badge-colores-tallas">🎨👕 Colores+Tallas</span>;
      case 'COLORES':
        return <span className="RPC-variante-badge RPC-badge-colores">🎨 Colores</span>;
      case 'TALLAS':
        return <span className="RPC-variante-badge RPC-badge-tallas">👕 Tallas</span>;
      default:
        return null;
    }
  };

  // Si no tiene permisos
  if (!canViewInventory || !canReceivePurchaseOrders) {
    return (
      <div className="RPC-container">
        <RecepcionStateView
          type="warning"
          title="Acceso denegado"
          message="No tiene permisos para acceder a la recepción de pedidos de compra."
        />
      </div>
    );
  }

  return (
    <div className="RPC-container">
      <RecepcionHeader
        title="Recepción de Pedidos de Compra"
        subtitle="Visualice los pedidos agrupados por proveedor y recepcione artículos seleccionando almacén y ubicación."
        summary={`${pagination.total} pedidos • ${Object.keys(pedidosAgrupados).length} proveedores • Página ${pagination.page}/${pagination.totalPages}`}
        mostrarFiltros={mostrarFiltros}
        onToggleFiltros={() => setMostrarFiltros(!mostrarFiltros)}
        onRefresh={() => cargarPedidos(pagination.page, true)}
        loading={loading}
      />

      <RecepcionFilters
        visible={mostrarFiltros}
        filtros={filtros}
        onFiltrosChange={setFiltros}
        onClear={limpiarFiltros}
        onApply={aplicarFiltros}
      />

      <RecepcionAlerts
        error={error}
        success={success}
        onCloseError={() => setError(null)}
        onCloseSuccess={() => setSuccess(null)}
      />

      {/* Lista de proveedores agrupados */}
      {loading && Object.keys(pedidosAgrupados).length === 0 ? (
        <RecepcionStateView type="loading" message="Cargando pedidos..." />
      ) : Object.keys(pedidosAgrupados).length === 0 ? (
        <RecepcionStateView
          type="info"
          title="No hay pedidos pendientes"
          message="No se encontraron pedidos de compra con los filtros actuales."
          buttonLabel="Limpiar filtros"
          onButtonClick={limpiarFiltros}
        />
      ) : (
        <div className="RPC-proveedores-container">
          {Object.keys(pedidosAgrupados).map(claveProveedor => {
            const grupo = pedidosAgrupados[claveProveedor];
            const proveedorExpandido = proveedoresExpandidos[claveProveedor] || false;
            
            return (
              <ProveedorGroupCard
                key={claveProveedor}
                grupo={grupo}
                expandido={proveedorExpandido}
                onToggle={() => toggleProveedorExpandido(claveProveedor)}
                loading={loading}
                onGenerarAlbaran={() => prepararGenerarAlbaranPorProveedor(claveProveedor)}
              >
                <div className={`RPC-pedidos-container ${proveedorExpandido ? 'visible' : 'hidden'}`}>
                  {grupo.pedidos.map((pedido) => {
                    const clavePedido = `${pedido.EjercicioPedido}_${pedido.SeriePedido || '0'}_${pedido.NumeroPedido}`;
                    const pedidoExpandido = pedidosExpandidos[clavePedido] || false;
                    const detalles = detallesPedidos[clavePedido];
                    const tieneUnidadesRecibidas = parseFloat(pedido.TotalUnidadesRecibidas) > 0;
                    
                    return (
                      <PedidoCompraCard
                        key={clavePedido}
                        pedido={pedido}
                        expandido={pedidoExpandido}
                        loading={loading}
                        tieneUnidadesRecibidas={tieneUnidadesRecibidas}
                        onToggle={() => cargarDetallesPedido(
                          pedido.EjercicioPedido,
                          pedido.SeriePedido || '0',
                          pedido.NumeroPedido
                        )}
                        onGenerarAlbaran={() => prepararGenerarAlbaran(pedido)}
                        onFinalizar={() => prepararFinalizarPedido(pedido)}
                      >
                        {detalles && (
                          <RecepcionLineasTable title={`Líneas del Pedido (${detalles.lineas.length})`}>
                            <table className="modal-table">
                                  <thead>
                                    <tr>
                                      <th width="40px"></th>
                                      <th width="60px">Orden</th>
                                      <th>Artículo</th>
                                      <th>Descripción</th>
                                      <th className="RPC-text-right">Pedidas</th>
                                      <th className="RPC-text-right">Recibidas</th>
                                      <th className="RPC-text-right">Pendientes</th>
                                      <th>Estado</th>
                                      <th className="RPC-text-center" width="120px">Acciones</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detalles.lineas.map((linea, index) => {
                                      const claveLinea = `${clavePedido}_${index}`;
                                      const lineaExpandida = lineasExpandidas[claveLinea] || false;
                                      const tieneVariantes = linea.variantes && linea.variantes.length > 0;
                                      const pendientes = parseFloat(linea.UnidadesPendientes) || 0;
                                      const recibidas = parseFloat(linea.UnidadesRecibidas) || 0;
                                      
                                      return (
                                        <React.Fragment key={linea.Orden}>
                                          <tr className={`RPC-linea ${pendientes === 0 ? 'completada' : ''}`}>
                                            <td>
                                              {tieneVariantes && (
                                                <button
                                                  className="RPC-expand-linea-btn"
                                                  onClick={() => toggleLineaExpandida(clavePedido, index)}
                                                  disabled={loading}
                                                >
                                                  {lineaExpandida ? '▼' : '►'}
                                                </button>
                                              )}
                                            </td>
                                            <td>{linea.Orden}</td>
                                            <td>
                                              <div>
                                                <strong>{linea.CodigoArticulo}</strong>
                                                {linea.tipoVariante && renderVarianteBadge(linea.tipoVariante)}
                                              </div>
                                            </td>
                                            <td>{linea.DescripcionArticulo}</td>
                                            <td className="RPC-text-right">
                                              {parseFloat(linea.UnidadesPedidas).toLocaleString()}
                                            </td>
                                            <td className="RPC-text-right RPC-text-success">
                                              {recibidas.toLocaleString()}
                                            </td>
                                            <td className="RPC-text-right RPC-text-warning">
                                              {pendientes.toLocaleString()}
                                            </td>
                                            <td>{renderEstadoLinea(linea)}</td>
                                            <td className="RPC-text-center">
                                              {pendientes > 0 ? (
                                                <button
                                                  className="RPC-btn RPC-btn-primary RPC-btn-xs"
                                                  onClick={() => abrirModalRecepcion(linea, clavePedido)}
                                                  disabled={loading}
                                                  title="Recepcionar unidades"
                                                >
                                                  + Recepcionar
                                                </button>
                                              ) : recibidas > 0 ? (
                                                <span className="RPC-estado-chip RPC-estado-completado">✓ Completado</span>
                                              ) : null}
                                            </td>
                                          </tr>
                                          
                                          {/* Variantes */}
                                          {tieneVariantes && lineaExpandida && (
                                            <tr className="RPC-variantes-row">
                                              <td colSpan="9">
                                                <RecepcionVariantesPanel>
                                                    <table className="modal-table">
                                                      <thead>
                                                        <tr>
                                                          <th>Color</th>
                                                          <th>Talla</th>
                                                          <th>Grupo Talla</th>
                                                          <th className="RPC-text-right">Unidades Total</th>
                                                          <th className="RPC-text-center">Desglose por Talla</th>
                                                          <th className="RPC-text-center">Acciones</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody>
                                                        {linea.variantes.map((variante, idx) => (
                                                          <tr key={idx}>
                                                            <td>
                                                              {variante.nombreColor ? (
                                                                <div className="RPC-color-item">
                                                                  <span className="RPC-color-circle" style={{
                                                                    backgroundColor: variante.nombreColor.toLowerCase().includes('azul') ? '#007bff' :
                                                                                     variante.nombreColor.toLowerCase().includes('rojo') ? '#dc3545' :
                                                                                     variante.nombreColor.toLowerCase().includes('verde') ? '#28a745' :
                                                                                     '#6c757d'
                                                                  }}></span>
                                                                  {variante.nombreColor}
                                                                </div>
                                                              ) : 'N/A'}
                                                            </td>
                                                            <td>
                                                              {variante.unidadesPorTalla ? (
                                                                <div>
                                                                  {Object.values(variante.unidadesPorTalla)
                                                                    .filter(t => parseFloat(t.unidades) > 0)
                                                                    .map(t => t.nombre)
                                                                    .join(', ')}
                                                                </div>
                                                              ) : variante.descripcionGrupoTalla || 'N/A'}
                                                            </td>
                                                            <td>{variante.grupoTalla || 'N/A'}</td>
                                                            <td className="RPC-text-right">
                                                              <strong>{parseFloat(variante.unidadesTotal).toLocaleString()}</strong>
                                                            </td>
                                                            <td>
                                                              {variante.unidadesPorTalla ? (
                                                                <div className="RPC-tallas-grid">
                                                                  {Object.values(variante.unidadesPorTalla)
                                                                    .filter(t => parseFloat(t.unidades) > 0)
                                                                    .map((talla, tIdx) => (
                                                                      <div key={tIdx} className="RPC-talla-item">
                                                                        <span className="RPC-talla-nombre">{talla.nombre}:</span>
                                                                        <span className="RPC-talla-cantidad">{parseFloat(talla.unidades).toLocaleString()}</span>
                                                                        <button
                                                                          className="RPC-btn RPC-btn-primary RPC-btn-xxs"
                                                                          onClick={() => {
                                                                            abrirModalRecepcion(linea, clavePedido, variante, talla);
                                                                          }}
                                                                          disabled={loading || parseFloat(talla.unidades) <= 0}
                                                                          title={`Recepcionar ${talla.nombre}`}
                                                                        >
                                                                          +
                                                                        </button>
                                                                      </div>
                                                                    ))}
                                                                </div>
                                                              ) : (
                                                                <div className="RPC-text-center">
                                                                  <button
                                                                    className="RPC-btn RPC-btn-primary RPC-btn-xs"
                                                                    onClick={() => {
                                                                      abrirModalRecepcion(linea, clavePedido, variante, null);
                                                                    }}
                                                                    disabled={loading || parseFloat(variante.unidadesTotal) <= 0}
                                                                    title="Recepcionar todas las unidades de esta variante"
                                                                  >
                                                                    + Recepcionar
                                                                  </button>
                                                                </div>
                                                              )}
                                                            </td>
                                                            <td className="RPC-text-center">
                                                              <button
                                                                className="RPC-btn RPC-btn-primary RPC-btn-xs"
                                                                onClick={() => {
                                                                  abrirModalRecepcion(linea, clavePedido, variante, null);
                                                                }}
                                                                disabled={loading || parseFloat(variante.unidadesTotal) <= 0}
                                                                title="Recepcionar todas las unidades de esta variante"
                                                              >
                                                                + Recepcionar Todo
                                                              </button>
                                                            </td>
                                                          </tr>
                                                        ))}
                                                      </tbody>
                                                    </table>
                                                </RecepcionVariantesPanel>
                                              </td>
                                            </tr>
                                          )}
                                        </React.Fragment>
                                      );
                                    })}
                                  </tbody>
                                </table>
                          </RecepcionLineasTable>
                        )}
                      </PedidoCompraCard>
                    );
                  })}
                </div>
              </ProveedorGroupCard>
            );
          })}
        </div>
      )}

      {/* Paginación */}
      <RecepcionPagination
        visible={Object.keys(pedidosAgrupados).length > 0}
        page={pagination.page}
        totalPages={pagination.totalPages}
        hasPrev={pagination.hasPrev}
        hasNext={pagination.hasNext}
        loading={loading}
        onPrev={() => cambiarPagina(pagination.page - 1)}
        onNext={() => cambiarPagina(pagination.page + 1)}
      />

      {/* ============================================
         MODALES CENTRADOS
         ============================================ */}

      {/* Modal para recepción de línea */}
      {modalRecepcion && lineaARecepcionar && (
        <RecepcionDialog
          open={modalRecepcion && !!lineaARecepcionar}
          onClose={() => setModalRecepcion(false)}
          title="Recepcionar Artículo"
          subtitle={`${lineaARecepcionar.linea.CodigoArticulo} - ${lineaARecepcionar.linea.DescripcionArticulo}`}
          maxWidth="md"
          footer={
            <>
              <button
                className="RPC-btn RPC-btn-secondary"
                onClick={() => setModalRecepcion(false)}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                className="RPC-btn RPC-btn-primary"
                onClick={procesarRecepcionLinea}
                disabled={!selectedAlmacen || !selectedUbicacion || loading}
              >
                {loading ? 'Procesando...' : '✓ Confirmar Recepción'}
              </button>
            </>
          }
        >
              {/* Información de variante específica (si aplica) */}
              {lineaARecepcionar.variante && (
                <div className="RPC-modal-section">
                  <h4>Variante específica a recepcionar</h4>
                  <div className="RPC-info-grid">
                    {lineaARecepcionar.variante.nombreColor && (
                      <div className="RPC-info-item">
                        <span className="RPC-info-label">Color:</span>
                        <span className="RPC-info-value">{lineaARecepcionar.variante.nombreColor}</span>
                      </div>
                    )}
                    {lineaARecepcionar.talla && lineaARecepcionar.talla.nombre && (
                      <div className="RPC-info-item">
                        <span className="RPC-info-label">Talla:</span>
                        <span className="RPC-info-value">{lineaARecepcionar.talla.nombre}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="RPC-modal-section">
                <h4>Información de la línea</h4>
                <div className="RPC-info-grid">
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Unidades pedidas:</span>
                    <span className="RPC-info-value">{parseFloat(lineaARecepcionar.linea.UnidadesPedidas).toLocaleString()}</span>
                  </div>
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Unidades recibidas:</span>
                    <span className="RPC-info-value RPC-text-success">{parseFloat(lineaARecepcionar.linea.UnidadesRecibidas).toLocaleString()}</span>
                  </div>
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Unidades pendientes:</span>
                    <span className="RPC-info-value RPC-text-warning">{parseFloat(lineaARecepcionar.linea.UnidadesPendientes).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              
              <div className="RPC-modal-section">
                <h4>Destino del Stock</h4>
                <div className="modal-form-grid">
                  <div className="modal-form-group">
                    <label htmlFor="almacen-select">Almacén *</label>
                    <select
                      id="almacen-select"
                      value={selectedAlmacen}
                      onChange={(e) => setSelectedAlmacen(e.target.value)}
                      className="modal-form-control"
                      disabled
                    >
                      {almacenes.map((almacen) => (
                        <option key={almacen.CodigoAlmacen} value={almacen.CodigoAlmacen}>
                          {almacen.CodigoAlmacen} - {almacen.Almacen}
                        </option>
                      ))}
                    </select>
                    <small className="RPC-form-text">Almacén temporal fijado para recepción: PTO</small>
                  </div>
                  
                  <div className="modal-form-group">
                    <label htmlFor="ubicacion-select">Ubicación *</label>
                    <select
                      id="ubicacion-select"
                      value={selectedUbicacion}
                      onChange={(e) => setSelectedUbicacion(e.target.value)}
                      className="modal-form-control"
                      disabled
                    >
                      {ubicaciones.map((ubicacion) => (
                        <option key={ubicacion.Ubicacion} value={ubicacion.Ubicacion}>
                          {ubicacion.Ubicacion} - {ubicacion.DescripcionUbicacion}
                        </option>
                      ))}
                    </select>
                    <small className="RPC-form-text">Ubicación temporal fijada para recepción: RECEPCION</small>
                  </div>
                </div>
              </div>
              
              <div className="RPC-modal-section">
                <h4>Cantidad a Recepcionar</h4>
                <div className="modal-form-group">
                  <input
                    type="number"
                    className="modal-form-control"
                    value={unidadesARecepcionar}
                    onChange={(e) => setUnidadesARecepcionar(e.target.value)}
                    min="0"
                    max={parseFloat(lineaARecepcionar.linea.UnidadesPendientes)}
                    step="1"
                    disabled={loading}
                  />
                  <small className="RPC-form-text">
                    Máximo disponible: {parseFloat(lineaARecepcionar.linea.UnidadesPendientes).toLocaleString()} unidades
                  </small>
                </div>
              </div>
              
              {/* Sección de variantes (solo para recepción de línea completa) */}
              {!lineaARecepcionar.variante && variantesDistribucion.length > 0 && (
                <div className="RPC-modal-section">
                  <h4>Distribución por Variantes</h4>
                  <div className="RPC-variantes-container">
                    <div className="modal-alert modal-alert-info">
                      <div className="modal-alert-icon">ℹ️</div>
                      <div className="modal-alert-content">
                        <h5>Distribución de unidades</h5>
                        <p>Distribuya las <strong>{unidadesARecepcionar} unidades</strong> entre las variantes disponibles</p>
                      </div>
                    </div>
                    
                    {loadingVariantes ? (
                      <div className="modal-loading">
                        <div className="modal-loading-spinner"></div>
                        <p>Cargando variantes...</p>
                      </div>
                    ) : (
                      <>
                        <div className="modal-table-container">
                          <table className="modal-table">
                            <thead>
                              <tr>
                                <th>Color</th>
                                <th>Talla</th>
                                <th>Grupo Talla</th>
                                <th className="RPC-text-right">Máximo</th>
                                <th className="RPC-text-right">Unidades</th>
                                <th width="80px"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {variantesDistribucion.map((variante, index) => (
                                <tr key={index} className="RPC-variante-row">
                                  <td>
                                    {variante.nombreColor ? (
                                      <div className="RPC-color-item">
                                        <span className="RPC-color-circle" style={{
                                          backgroundColor: variante.nombreColor.toLowerCase().includes('azul') ? '#007bff' :
                                                           variante.nombreColor.toLowerCase().includes('rojo') ? '#dc3545' :
                                                           variante.nombreColor.toLowerCase().includes('verde') ? '#28a745' :
                                                           '#6c757d'
                                        }}></span>
                                        {variante.nombreColor}
                                      </div>
                                    ) : 'Sin color'}
                                  </td>
                                  <td>{variante.nombreTalla || 'Sin talla'}</td>
                                  <td>{variante.grupoTalla || 'N/A'}</td>
                                  <td className="RPC-text-right">
                                    <span className="RPC-max-unidades">{parseFloat(variante.maxUnidades).toLocaleString()}</span>
                                  </td>
                                  <td className="RPC-text-right">
                                    <input
                                      type="number"
                                      className="RPC-input-cantidad"
                                      value={variante.unidades}
                                      onChange={(e) => {
                                        const nuevasUnidades = parseFloat(e.target.value) || 0;
                                        if (nuevasUnidades <= variante.maxUnidades) {
                                          const nuevaDistribucion = [...variantesDistribucion];
                                          nuevaDistribucion[index].unidades = nuevasUnidades;
                                          setVariantesDistribucion(nuevaDistribucion);
                                        }
                                      }}
                                      min="0"
                                      max={variante.maxUnidades}
                                      step="1"
                                      disabled={loading}
                                    />
                                  </td>
                                  <td>
                                    <div className="RPC-variante-controls">
                                      <button
                                        className="RPC-btn-icon"
                                        onClick={() => {
                                          const nuevasUnidades = Math.min(variante.unidades + 1, variante.maxUnidades);
                                          const nuevaDistribucion = [...variantesDistribucion];
                                          nuevaDistribucion[index].unidades = nuevasUnidades;
                                          setVariantesDistribucion(nuevaDistribucion);
                                        }}
                                        disabled={variante.unidades >= variante.maxUnidades || loading}
                                      >
                                        +
                                      </button>
                                      <button
                                        className="RPC-btn-icon"
                                        onClick={() => {
                                          const nuevasUnidades = Math.max(variante.unidades - 1, 0);
                                          const nuevaDistribucion = [...variantesDistribucion];
                                          nuevaDistribucion[index].unidades = nuevasUnidades;
                                          setVariantesDistribucion(nuevaDistribucion);
                                        }}
                                        disabled={variante.unidades <= 0 || loading}
                                      >
                                        -
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        <div className="validation-message">
                          <span className="validation-icon">📊</span>
                          <span>
                            <strong>Total distribuido:</strong> 
                            <span className="RPC-total-numero">
                              {variantesDistribucion.reduce((sum, v) => sum + (parseFloat(v.unidades) || 0), 0)} 
                            </span>
                            <span className="RPC-total-divisor"> / {unidadesARecepcionar} unidades</span>
                            {Math.abs(variantesDistribucion.reduce((sum, v) => sum + (parseFloat(v.unidades) || 0), 0) - parseFloat(unidadesARecepcionar)) > 0.001 && (
                              <span className="RPC-total-error"> ⚠️ Las unidades no coinciden</span>
                            )}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
        </RecepcionDialog>
      )}

      {/* Modal para generar albarán */}
      {modalGenerarAlbaran && pedidoAAlbaran && (
        <GenerarAlbaranDialog
          open={modalGenerarAlbaran && !!pedidoAAlbaran}
          onClose={() => setModalGenerarAlbaran(false)}
          footer={
            <>
              <button
                className="RPC-btn RPC-btn-secondary"
                onClick={() => setModalGenerarAlbaran(false)}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                className="RPC-btn RPC-btn-success"
                onClick={generarAlbaran}
                disabled={loading}
              >
                {loading ? 'Generando...' : '📄 Generar Albarán Cerrado'}
              </button>
            </>
          }
        >
              <div className="modal-alert modal-alert-info">
                <div className="modal-alert-icon">ℹ️</div>
                <div className="modal-alert-content">
                  <h5>Información del albarán NO ACUMULATIVO</h5>
                  {pedidoAAlbaran.tipo === 'PROVEEDOR' ? (
                    <p>
                      <strong>Proveedor:</strong> {pedidoAAlbaran.nombreProveedor} ({pedidoAAlbaran.codigoProveedor})<br/>
                      <strong>Pedidos incluidos:</strong> {pedidoAAlbaran.pedidos.length} pedidos<br/>
                      <strong>Tipo:</strong> Solo unidades no albaranadas previamente
                    </p>
                  ) : (
                    <p>
                      <strong>Pedido:</strong> #{pedidoAAlbaran.NumeroPedido} - {pedidoAAlbaran.NombreProveedor}<br/>
                      <strong>Ejercicio:</strong> {pedidoAAlbaran.EjercicioPedido}<br/>
                      <strong>Tipo:</strong> Solo unidades no albaranadas previamente
                    </p>
                  )}
                </div>
              </div>
              
              <div className="RPC-modal-section">
                <h4>Resumen del Albarán a generar</h4>
                <div className="RPC-info-grid">
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Líneas con recepción:</span>
                    <span className="RPC-info-value">{lineasConRecepcion.length}</span>
                  </div>
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Unidades recibidas:</span>
                    <span className="RPC-info-value RPC-text-success">
                      {totalUnidadesAlbaran.toLocaleString()}
                    </span>
                  </div>
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Importe estimado:</span>
                    <span className="RPC-info-value RPC-text-success">
                      {importeTotalAlbaran.toLocaleString('es-ES', {
                        style: 'currency',
                        currency: 'EUR'
                      })}
                    </span>
                  </div>
                  {pedidoAAlbaran.tipo === 'PEDIDO' && (
                    <div className="RPC-info-item">
                      <span className="RPC-info-label">Unidades pendientes:</span>
                      <span className="RPC-info-value RPC-text-warning">
                        {parseFloat(pedidoAAlbaran.TotalUnidadesPendientes).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              {lineasConRecepcion.length > 0 && (
                <div className="RPC-modal-section">
                  <h4>Detalle de líneas para el albarán</h4>
                  <div className="modal-table-container">
                    <table className="modal-table">
                      <thead>
                        <tr>
                          <th>Artículo</th>
                          <th>Descripción</th>
                          {pedidoAAlbaran.tipo === 'PROVEEDOR' && <th>Pedido</th>}
                          <th className="RPC-text-right">Pedidas</th>
                          <th className="RPC-text-right">Recibidas</th>
                          <th className="RPC-text-right">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineasConRecepcion.slice(0, 10).map((linea, index) => {
                          const porcentaje = calcularPorcentajeRecepcion(
                            parseFloat(linea.UnidadesPedidas),
                            parseFloat(linea.UnidadesRecibidas)
                          );
                          
                          return (
                            <tr key={index}>
                              <td>{linea.CodigoArticulo}</td>
                              <td>{linea.DescripcionArticulo}</td>
                              {pedidoAAlbaran.tipo === 'PROVEEDOR' && (
                                <td>#{linea.numeroPedido || linea.NumeroPedido}</td>
                              )}
                              <td className="RPC-text-right">{parseFloat(linea.UnidadesPedidas).toLocaleString()}</td>
                              <td className="RPC-text-right RPC-text-success">
                                {parseFloat(linea.UnidadesRecibidas).toLocaleString()}
                              </td>
                              <td className="RPC-text-right">
                                <span className={porcentaje >= 100 ? "RPC-text-success" : "RPC-text-warning"}>
                                  {Math.round(porcentaje)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {lineasConRecepcion.length > 10 && (
                          <tr>
                            <td colSpan={pedidoAAlbaran.tipo === 'PROVEEDOR' ? 6 : 5} className="RPC-text-center">
                              <em>... y {lineasConRecepcion.length - 10} líneas más</em>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              <div className="modal-alert modal-alert-warning">
                <div className="modal-alert-icon">⚠️</div>
                <div className="modal-alert-content">
                  <h5>Importante - Albarán NO ACUMULATIVO</h5>
                  <p>
                    El albarán se generará automáticamente con un número único y será <strong>cerrado</strong>.
                    <strong> SOLO INCLUIRÁ las unidades que no hayan sido albaranadas previamente.</strong>
                    {pedidoAAlbaran.tipo === 'PROVEEDOR' ? (
                      <span> El sistema calculará automáticamente las unidades pendientes de cada pedido del proveedor {pedidoAAlbaran.nombreProveedor}.</span>
                    ) : (
                      <span>
                        {parseFloat(pedidoAAlbaran.TotalUnidadesPendientes) > 0 ? (
                          <span> El pedido seguirá pendiente porque hay unidades sin recepcionar.</span>
                        ) : (
                          <span> El pedido se marcará como <strong>servido</strong> automáticamente.</span>
                        )}
                      </span>
                    )}
                  </p>
                </div>
              </div>
        </GenerarAlbaranDialog>
      )}

      {/* Modal para finalizar pedido */}
      {modalFinalizarPedido && pedidoAFinalizar && (
        <FinalizarPedidoDialog
          open={modalFinalizarPedido && !!pedidoAFinalizar}
          onClose={() => setModalFinalizarPedido(false)}
          footer={
            <>
              <button
                className="RPC-btn RPC-btn-secondary"
                onClick={() => setModalFinalizarPedido(false)}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                className="RPC-btn RPC-btn-warning"
                onClick={finalizarPedido}
                disabled={loading}
              >
                {loading ? 'Finalizando...' : '✅ Confirmar Finalización'}
              </button>
            </>
          }
        >
              <div className="modal-alert modal-alert-warning">
                <div className="modal-alert-icon">⚠️</div>
                <div className="modal-alert-content">
                  <h5>¿Está seguro que desea finalizar este pedido?</h5>
                  <p>El pedido se marcará como <strong>SERVIDO (Estado 2)</strong> y desaparecerá de la lista de pedidos pendientes.</p>
                </div>
              </div>
              
              <div className="RPC-modal-section">
                <h4>Información del Pedido</h4>
                <div className="RPC-info-grid">
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Número:</span>
                    <span className="RPC-info-value">#{pedidoAFinalizar.NumeroPedido}</span>
                  </div>
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Proveedor:</span>
                    <span className="RPC-info-value">{pedidoAFinalizar.NombreProveedor}</span>
                  </div>
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Fecha:</span>
                    <span className="RPC-info-value">
                      {new Date(pedidoAFinalizar.FechaPedido).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Ejercicio:</span>
                    <span className="RPC-info-value">{pedidoAFinalizar.EjercicioPedido}</span>
                  </div>
                </div>
              </div>
              
              <div className="RPC-modal-section">
                <h4>Estado Actual</h4>
                <div className="RPC-info-grid">
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Unidades pedidas:</span>
                    <span className="RPC-info-value">{parseFloat(pedidoAFinalizar.TotalUnidadesPedidas).toLocaleString()}</span>
                  </div>
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Unidades recibidas:</span>
                    <span className="RPC-info-value RPC-text-success">
                      {parseFloat(pedidoAFinalizar.TotalUnidadesRecibidas).toLocaleString()}
                    </span>
                  </div>
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Unidades pendientes:</span>
                    <span className="RPC-info-value RPC-text-warning">
                      {parseFloat(pedidoAFinalizar.TotalUnidadesPendientes).toLocaleString()}
                    </span>
                  </div>
                  <div className="RPC-info-item">
                    <span className="RPC-info-label">Líneas:</span>
                    <span className="RPC-info-value">{pedidoAFinalizar.TotalLineas}</span>
                  </div>
                </div>
                
                {parseFloat(pedidoAFinalizar.TotalUnidadesPendientes) > 0 && (
                  <div className="modal-alert modal-alert-danger">
                    <div className="modal-alert-icon">🚨</div>
                    <div className="modal-alert-content">
                      <h5>Atención</h5>
                      <p>Este pedido tiene 
                        <strong> {parseFloat(pedidoAFinalizar.TotalUnidadesPendientes).toLocaleString()} unidades pendientes</strong>.
                        ¿Desea finalizarlo igualmente?
                      </p>
                    </div>
                  </div>
                )}
              </div>
        </FinalizarPedidoDialog>
      )}
    </div>
  );
};

export default RecepcionPedidosCompra;
