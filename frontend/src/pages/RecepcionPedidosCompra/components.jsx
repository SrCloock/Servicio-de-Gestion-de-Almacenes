// components.jsx
import React from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TableContainer,
  TextField,
  Typography
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

// ==================== RecepcionHeader ====================
export const RecepcionHeader = ({
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

// ==================== RecepcionFilters ====================
export const RecepcionFilters = ({ visible, filtros, onFiltrosChange, onClear, onApply }) => {
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

// ==================== RecepcionAlerts ====================
export const RecepcionAlerts = ({ error, success, onCloseError, onCloseSuccess }) => {
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

// ==================== RecepcionPagination ====================
export const RecepcionPagination = ({ visible, page, totalPages, hasPrev, hasNext, loading, onPrev, onNext }) => {
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

// ==================== RecepcionStateView ====================
export const RecepcionStateView = ({ type = 'info', title, message, buttonLabel, onButtonClick, buttonVariant = 'outlined' }) => {
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

// ==================== ProveedorGroupCard ====================
export const ProveedorGroupCard = ({
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

// ==================== PedidoCompraCard ====================
export const PedidoCompraCard = ({
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

// ==================== RecepcionLineasTable ====================
export const RecepcionLineasTable = ({ title, children }) => {
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

// ==================== RecepcionVariantesPanel ====================
export const RecepcionVariantesPanel = ({ title = 'Desglose de Variantes', children }) => {
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

// ==================== RecepcionDialog ====================
export const RecepcionDialog = ({ open, title, subtitle, onClose, maxWidth = 'md', footer, children }) => {
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

// ==================== GenerarAlbaranDialog ====================
export const GenerarAlbaranDialog = ({ open, onClose, footer, children }) => {
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

// ==================== FinalizarPedidoDialog ====================
export const FinalizarPedidoDialog = ({ open, onClose, footer, children }) => {
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