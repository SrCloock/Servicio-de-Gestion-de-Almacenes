// ── InventarioComponents.jsx ──────────────────────────────────────────────────
// Componentes de presentación: Header, Tabs, StatCards, Filtros, Lista, Tabla

import React from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Collapse, Grid, Paper, Stack, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tabs, TextField, Typography
} from '@mui/material';
import {
  FiAlertTriangle, FiMapPin, FiMinus, FiStar
} from 'react-icons/fi';
import { normalizarTexto, normalizarUbicacionDisplay, getStockStyle, formatearUnidad as fu } from './InventarioHelpers';

// ── Header ────────────────────────────────────────────────────────────────────
export const InventarioHeader = ({ onNuevoAjuste, onRefresh, titleIcon, refreshIcon, addIcon }) => (
  <Paper elevation={2} sx={{ p: 3, borderRadius: 3 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ display: 'flex', alignItems: 'center', color: 'primary.main', fontSize: 32 }}>{titleIcon}</Box>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>Gestión de Inventario</Typography>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button variant="contained" color="success" onClick={onNuevoAjuste} startIcon={addIcon}
          sx={{ borderRadius: 2, px: 3, py: 1.25, fontWeight: 700 }}>
          Nuevo Ajuste
        </Button>
        <Button variant="contained" onClick={onRefresh} startIcon={refreshIcon}
          sx={{ borderRadius: 2, px: 3, py: 1.25, fontWeight: 700 }}>
          Actualizar
        </Button>
      </Stack>
    </Stack>
  </Paper>
);

// ── Tabs ──────────────────────────────────────────────────────────────────────
export const InventarioTabs = ({ activeTab, onChange, inventarioIcon, historialIcon }) => (
  <Paper elevation={1} sx={{ borderRadius: 3, overflow: 'hidden' }}>
    <Tabs value={activeTab} onChange={(_, value) => onChange(value)} variant="fullWidth"
      sx={{ minHeight: 64, '& .MuiTab-root': { minHeight: 64, fontWeight: 700, textTransform: 'none' } }}>
      <Tab icon={inventarioIcon} iconPosition="start" label="Inventario Actual" value="inventario" />
      <Tab icon={historialIcon} iconPosition="start" label="Historial de Ajustes" value="historial" />
    </Tabs>
  </Paper>
);

// ── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ icon, value, label, color, backgroundColor }) => (
  <Card sx={{ height: '100%', borderRadius: 3, boxShadow: 2 }}>
    <CardContent>
      <Stack direction="row" spacing={2} alignItems="center">
        <Box sx={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', backgroundColor: backgroundColor || 'primary.main',
          color: '#fff', fontSize: 28, flexShrink: 0
        }}>{icon}</Box>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: color || 'text.primary', lineHeight: 1.1 }}>{value}</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 600 }}>{label}</Typography>
        </Box>
      </Stack>
    </CardContent>
  </Card>
);

export const InventarioResumenCards = ({ stats, icons }) => {
  const cards = [
    { key: 'articulos', value: stats.totalArticulos, label: 'Artículos', icon: icons.package },
    { key: 'unidades', value: stats.totalUnidades.toLocaleString(), label: 'Unidades', icon: icons.layers },
    { key: 'ubicaciones', value: stats.totalUbicaciones, label: 'Ubicaciones', icon: icons.mapPin },
    { key: 'sinUbicacion', value: stats.stockSinUbicacion.toLocaleString(), label: 'Sin Ubicación', icon: icons.database }
  ];
  return (
    <Grid container spacing={2.5}>
      {cards.map(({ key, ...card }) => (
        <Grid item xs={12} sm={6} lg={4} key={key}><StatCard {...card} /></Grid>
      ))}
    </Grid>
  );
};

// ── Filtros ───────────────────────────────────────────────────────────────────
const filterFields = [
  { name: 'codigo', label: 'Artículo', placeholder: 'Código, descripción o descripción2' },
  { name: 'almacen', label: 'Almacén', placeholder: 'Código o nombre de almacén' },
  { name: 'ubicacion', label: 'Ubicación', placeholder: 'Código o descripción de ubicación' },
  { name: 'familia', label: 'Familia', placeholder: 'Buscar por familia' },
  { name: 'subfamilia', label: 'Subfamilia', placeholder: 'Buscar por subfamilia' }
];

export const InventarioFilters = ({ open, onToggle, filters, onFilterChange, onToggleAll, onResetFilters, hasExpandedArticles, filterIcon, minusIcon, plusIcon, clearIcon }) => (
  <Paper elevation={1} sx={{ p: 2.5, borderRadius: 3 }}>
    <Stack spacing={2}>
      <Box>
        <Button variant="outlined" onClick={onToggle} startIcon={filterIcon} sx={{ borderRadius: 2, fontWeight: 700 }}>
          {open ? 'Ocultar Filtros' : 'Mostrar Filtros'}
        </Button>
      </Box>
      <Collapse in={open}>
        <Stack spacing={2.5}>
          <Grid container spacing={2}>
            {filterFields.map((field) => (
              <Grid item xs={12} sm={6} lg={4} key={field.name}>
                <TextField fullWidth size="small" label={field.label} name={field.name}
                  placeholder={field.placeholder} value={filters[field.name]} onChange={onFilterChange} />
              </Grid>
            ))}
          </Grid>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button variant="contained" onClick={onToggleAll}
              startIcon={hasExpandedArticles ? minusIcon : plusIcon}
              sx={{ borderRadius: 2, fontWeight: 700 }}>
              {hasExpandedArticles ? 'Contraer Todo' : 'Expandir Todo'}
            </Button>
            <Button variant="outlined" color="inherit" onClick={onResetFilters} startIcon={clearIcon}
              sx={{ borderRadius: 2, fontWeight: 700 }}>
              Limpiar Filtros
            </Button>
          </Stack>
        </Stack>
      </Collapse>
    </Stack>
  </Paper>
);

// ── Tabla de ubicaciones ──────────────────────────────────────────────────────
export const InventarioUbicacionesTable = ({ articulo, getStockStyle, formatearUnidad, getColorStyle, icons, onEditarCantidad, onVerDetalles }) => (
  <TableContainer component={Paper} elevation={0} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
    <Table size="small">
      <TableHead>
        <TableRow sx={{ backgroundColor: 'rgba(44, 62, 80, 0.05)' }}>
          <TableCell>Almacén</TableCell>
          <TableCell>Ubicación</TableCell>
          <TableCell>Descripción</TableCell>
          <TableCell>Unidad</TableCell>
          <TableCell>Talla/Color</TableCell>
          <TableCell align="right">Cantidad</TableCell>
          <TableCell align="right">Acciones</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {articulo.ubicaciones.map((ubicacion) => (
          <TableRow
            key={ubicacion.clave}
            hover
            sx={{
              borderLeft: ubicacion.esPrincipal
                ? '3px solid #f39c12'
                : ubicacion.esSinUbicacion
                  ? '3px solid #e67e22'
                  : '3px solid transparent',
              backgroundColor: ubicacion.esPrincipal
                ? 'rgba(243, 156, 18, 0.04)'
                : ubicacion.esSinUbicacion
                  ? 'rgba(241, 196, 15, 0.08)'
                  : ubicacion.Cantidad < 0
                    ? 'rgba(231, 76, 60, 0.06)'
                    : ubicacion.Cantidad === 0
                      ? 'rgba(243, 156, 18, 0.06)'
                      : 'inherit'
            }}
          >
            <TableCell sx={{ minWidth: 180 }}>
              <Stack spacing={0.75}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  {ubicacion.esPrincipal && (
                    <Box component="span" sx={{ color: '#f39c12', fontSize: 13, display: 'flex', alignItems: 'center' }} title="Ubicación principal">
                      <FiStar />
                    </Box>
                  )}
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {normalizarTexto(ubicacion.NombreAlmacen)}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  {ubicacion.esPrincipal && (
                    <Chip size="small" label="PRINCIPAL" sx={{
                      fontSize: '0.68rem', height: 20, fontWeight: 700,
                      backgroundColor: 'rgba(243,156,18,0.12)',
                      color: '#b7770d',
                      border: '1px solid rgba(243,156,18,0.35)'
                    }} />
                  )}
                  {ubicacion.esSinUbicacion && !ubicacion.esPrincipal && (
                    <Chip size="small" icon={<FiMapPin style={{ fontSize: 11 }} />}
                      label="SIN UBICACIÓN" color="warning" variant="outlined"
                      sx={{ fontSize: '0.68rem', height: 20 }} />
                  )}
                  {ubicacion.Cantidad < 0 && (
                    <Chip size="small" icon={<FiAlertTriangle style={{ fontSize: 11 }} />}
                      label="NEGATIVO" color="error" variant="outlined"
                      sx={{ fontSize: '0.68rem', height: 20 }} />
                  )}
                  {ubicacion.Cantidad === 0 && (
                    <Chip size="small" icon={<FiMinus style={{ fontSize: 11 }} />}
                      label="CERO" color="warning" variant="outlined"
                      sx={{ fontSize: '0.68rem', height: 20 }} />
                  )}
                </Stack>
              </Stack>
            </TableCell>
            <TableCell>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: ubicacion.esPrincipal ? 600 : 400 }}>
                {normalizarUbicacionDisplay(ubicacion.Ubicacion)}
              </Typography>
            </TableCell>
            <TableCell>
              <Typography variant="body2" color="text.secondary">
                {normalizarTexto(ubicacion.DescripcionUbicacion) || 'Stock sin ubicación asignada'}
              </Typography>
            </TableCell>
            <TableCell>
              <Typography variant="body2">{normalizarTexto(ubicacion.UnidadStock) || 'unidades'}</Typography>
            </TableCell>
            <TableCell>
              {ubicacion.TallaColorDisplay && ubicacion.TallaColorDisplay !== 'N/A' ? (
                <Box component="span" sx={{
                  display: 'inline-flex', alignItems: 'center',
                  px: 1.25, py: 0.5, borderRadius: 999,
                  fontWeight: 600, fontSize: '0.82rem',
                  ...getColorStyle(ubicacion.CodigoColor)
                }}>
                  {normalizarTexto(ubicacion.TallaColorDisplay)}
                </Box>
              ) : (
                <Typography variant="body2" color="text.disabled">—</Typography>
              )}
            </TableCell>
            <TableCell align="right" sx={{ minWidth: 150 }}>
              <Stack spacing={0.5} alignItems="flex-end">
                <Typography variant="body2" sx={{ fontWeight: 700, ...getStockStyle(ubicacion.Cantidad) }}>
                  {formatearUnidad(ubicacion.Cantidad, ubicacion.UnidadStock)}
                </Typography>
                {articulo.UnidadAlternativa && ubicacion.UnidadStock === articulo.UnidadAlternativa && (
                  <Typography variant="caption" color="text.secondary">
                    ({formatearUnidad(ubicacion.Cantidad * (articulo.FactorConversion || 1), articulo.UnidadBase)})
                  </Typography>
                )}
              </Stack>
            </TableCell>
            <TableCell align="right" sx={{ minWidth: 190 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end">
                <Button size="small" variant="contained" startIcon={icons.edit}
                  onClick={() => onEditarCantidad(
                    ubicacion.CodigoArticuloStock || articulo.CodigoArticuloStock || articulo.CodigoArticulo,
                    ubicacion.NombreAlmacen, ubicacion.Cantidad, ubicacion.clave,
                    ubicacion.CodigoAlmacen, ubicacion.Ubicacion, ubicacion.Partida,
                    ubicacion.UnidadStock, ubicacion.CodigoColor, ubicacion.CodigoTalla01,
                    ubicacion.esSinUbicacion, ubicacion.sinRegistrosAcumuladoStock
                  )}>
                  Editar
                </Button>
                {ubicacion.MovPosicionLinea && !ubicacion.esSinUbicacion && (
                  <Button size="small" variant="outlined" onClick={() => onVerDetalles(ubicacion.MovPosicionLinea)}>
                    Detalles
                  </Button>
                )}
              </Stack>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
);

// ── Artículo card ─────────────────────────────────────────────────────────────
export const InventarioArticleCard = ({ articulo, expanded, onToggle, getEstadoColor, getStockStyle, formatearUnidad, getColorStyle, icons, onEditarCantidad, onVerDetalles }) => (
  <Paper elevation={2}
    className={`inventario-item ${articulo.estado === 'agotado' ? 'inventario-estado-agotado' : ''} ${articulo.estado === 'negativo' ? 'inventario-estado-negativo' : ''} ${articulo.estado === 'cero' ? 'inventario-estado-cero' : ''}`}
    sx={{ borderRadius: 3, overflow: 'hidden', borderLeft: `5px solid ${getEstadoColor(articulo.estado)}` }}>
    <Box className="inventario-articulo-header" onClick={onToggle} sx={{ cursor: 'pointer' }}>
      <Box className="inventario-articulo-info">
        <span className="inventario-articulo-codigo">{normalizarTexto(articulo.CodigoArticulo)}</span>
        <span className="inventario-articulo-descripcion">{normalizarTexto(articulo.DescripcionArticulo)}</span>
        {articulo.Descripcion2Articulo && (
          <span className="inventario-articulo-descripcion2">{normalizarTexto(articulo.Descripcion2Articulo)}</span>
        )}
        <div className="inventario-articulo-categorias">
          {articulo.CodigoFamilia && (
            <span className="inventario-familia-tag">Familia: {normalizarTexto(articulo.CodigoFamilia)}</span>
          )}
          {articulo.CodigoSubfamilia && (
            <span className="inventario-subfamilia-tag">Subfamilia: {normalizarTexto(articulo.CodigoSubfamilia)}</span>
          )}
        </div>
      </Box>
      <Box className="inventario-articulo-total">
        <span className="inventario-total-unidades" style={getStockStyle(articulo.totalStockBase)}>
          {formatearUnidad(articulo.totalStockBase, articulo.UnidadBase)}
          {articulo.estado === 'negativo' && (
            <span className="badge-negativo">{icons.alert} NEGATIVO</span>
          )}
          {articulo.estado === 'cero' && (
            <span className="badge-cero">{icons.minus} CERO</span>
          )}
          <span className="inventario-ubicaciones-count">({articulo.ubicaciones.length} ubicaciones)</span>
        </span>
        <span className={`inventario-expand-icon ${expanded ? 'expanded' : ''}`}>
          {expanded ? icons.chevronUp : icons.chevronDown}
        </span>
      </Box>
    </Box>
    {expanded && (
      <InventarioUbicacionesTable
        articulo={articulo} getStockStyle={getStockStyle} formatearUnidad={formatearUnidad}
        getColorStyle={getColorStyle} icons={icons} onEditarCantidad={onEditarCantidad} onVerDetalles={onVerDetalles}
      />
    )}
  </Paper>
);

// ── Lista inventario ──────────────────────────────────────────────────────────
export const InventarioList = ({ items, expandedItems, onToggleItem, getEstadoColor, getStockStyle, formatearUnidad, getColorStyle, icons, onEditarCantidad, onVerDetalles, hasMore, loadingMore, onLoadMore }) => (
  <Stack spacing={2.5}>
    <Box className="inventario-list">
      <Stack spacing={2.5}>
        {items.map((articulo) => (
          <InventarioArticleCard
            key={articulo.CodigoArticulo} articulo={articulo}
            expanded={Boolean(expandedItems[articulo.CodigoArticulo])}
            onToggle={() => onToggleItem(articulo.CodigoArticulo)}
            getEstadoColor={getEstadoColor} getStockStyle={getStockStyle}
            formatearUnidad={formatearUnidad} getColorStyle={getColorStyle}
            icons={icons} onEditarCantidad={onEditarCantidad} onVerDetalles={onVerDetalles}
          />
        ))}
      </Stack>
    </Box>
    {(hasMore || loadingMore) && (
      <Paper elevation={1} sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
          <Stack spacing={0.5}>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>Carga progresiva activa</Typography>
            <Typography variant="body2" color="text.secondary">El resto de artículos se solicita bajo demanda.</Typography>
          </Stack>
          <Button variant="contained" onClick={onLoadMore} disabled={!hasMore || loadingMore}
            startIcon={loadingMore ? <CircularProgress size={18} color="inherit" /> : icons.plus}
            sx={{ borderRadius: 2, fontWeight: 700, alignSelf: { xs: 'stretch', sm: 'center' } }}>
            {loadingMore ? 'Cargando más artículos...' : 'Cargar más'}
          </Button>
        </Stack>
      </Paper>
    )}
  </Stack>
);

// ── State views ───────────────────────────────────────────────────────────────
export const InventarioStateView = ({ type, title, message, buttonLabel, onButtonClick, buttonIcon }) => {
  if (type === 'loading') return (
    <Paper elevation={1} sx={{ p: 6, borderRadius: 3 }}>
      <Stack spacing={2} alignItems="center">
        <CircularProgress />
        <Typography variant="body1">{message}</Typography>
      </Stack>
    </Paper>
  );
  if (type === 'error') return (
    <Paper elevation={1} sx={{ p: 4, borderRadius: 3 }}>
      <Stack spacing={2} alignItems="center">
        <Alert severity="error" sx={{ width: '100%' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</Typography>
          <Typography variant="body2">{message}</Typography>
        </Alert>
        {onButtonClick && (
          <Button variant="contained" onClick={onButtonClick} startIcon={buttonIcon}>{buttonLabel}</Button>
        )}
      </Stack>
    </Paper>
  );
  return (
    <Paper elevation={1} sx={{ p: 6, borderRadius: 3 }}>
      <Stack spacing={2} alignItems="center">
        <Box textAlign="center">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
          <Typography variant="body1" color="text.secondary">{message}</Typography>
        </Box>
        {onButtonClick && <Button variant="outlined" onClick={onButtonClick}>{buttonLabel}</Button>}
      </Stack>
    </Paper>
  );
};