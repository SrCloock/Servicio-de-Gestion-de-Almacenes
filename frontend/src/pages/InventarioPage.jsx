import '../styles/InventarioPage.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API from '../helpers/api';
import { getAuthHeader } from '../helpers/authHelper';
import Navbar from '../components/Navbar';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography } from '@mui/material';
import { FiAlertTriangle, FiCheck, FiChevronDown, FiChevronUp, FiClock, FiDatabase, FiEdit, FiFilter, FiLayers, FiList, FiMapPin, FiMinus, FiPackage, FiPlus, FiPlusCircle, FiRefreshCw, FiX } from 'react-icons/fi';

const getDefaultHistoryFilters = () => {
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(hoy.getDate() - 30);

  return {
    fechaDesde: desde.toISOString().split('T')[0],
    fechaHasta: hoy.toISOString().split('T')[0]
  };
};

const InventarioHeader = ({ onNuevoAjuste, onRefresh, titleIcon, refreshIcon, addIcon }) => {
  return (
    <Paper elevation={2} sx={{ p: 3, borderRadius: 3 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ display: 'flex', alignItems: 'center', color: 'primary.main', fontSize: 32 }}>
            {titleIcon}
          </Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            GestiÃ³n de Inventario
          </Typography>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button
            variant="contained"
            color="success"
            onClick={onNuevoAjuste}
            startIcon={addIcon}
            sx={{ borderRadius: 2, px: 3, py: 1.25, fontWeight: 700 }}
          >
            Nuevo Ajuste
          </Button>
          <Button
            variant="contained"
            onClick={onRefresh}
            startIcon={refreshIcon}
            sx={{ borderRadius: 2, px: 3, py: 1.25, fontWeight: 700 }}
          >
            Actualizar
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};


const InventarioTabs = ({ activeTab, onChange, inventarioIcon, historialIcon }) => {
  return (
    <Paper elevation={1} sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Tabs
        value={activeTab}
        onChange={(_, value) => onChange(value)}
        variant="fullWidth"
        sx={{
          minHeight: 64,
          '& .MuiTab-root': {
            minHeight: 64,
            fontWeight: 700,
            textTransform: 'none'
          }
        }}
      >
        <Tab icon={inventarioIcon} iconPosition="start" label="Inventario Actual" value="inventario" />
        <Tab icon={historialIcon} iconPosition="start" label="Historial de Ajustes" value="historial" />
      </Tabs>
    </Paper>
  );
};


const StatCard = ({ icon, value, label, color, backgroundColor }) => (
  <Card sx={{ height: '100%', borderRadius: 3, boxShadow: 2 }}>
    <CardContent>
      <Stack direction="row" spacing={2} alignItems="center">
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: backgroundColor || 'primary.main',
            color: '#fff',
            fontSize: 28,
            flexShrink: 0
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: color || 'text.primary', lineHeight: 1.1 }}>
            {value}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 600 }}>
            {label}
          </Typography>
        </Box>
      </Stack>
    </CardContent>
  </Card>
);

const InventarioResumenCards = ({ stats, icons }) => {
  const cards = [
    {
      key: 'articulos',
      value: stats.totalArticulos,
      label: 'Artículos',
      icon: icons.package
    },
    {
      key: 'unidades',
      value: stats.totalUnidades.toLocaleString(),
      label: 'Unidades',
      icon: icons.layers
    },
    {
      key: 'ubicaciones',
      value: stats.totalUbicaciones,
      label: 'Ubicaciones',
      icon: icons.mapPin
    },
    {
      key: 'sinUbicacion',
      value: stats.stockSinUbicacion.toLocaleString(),
      label: 'Sin Ubicación',
      icon: icons.database
    }
  ];

  return (
    <Grid container spacing={2.5}>
      {cards.map(({ key, ...card }) => (
        <Grid item xs={12} sm={6} lg={4} key={key}>
          <StatCard {...card} />
        </Grid>
      ))}
    </Grid>
  );
};


const filterFields = [
  { name: 'codigo', label: 'Artículo', placeholder: 'Código, descripción o descripción2' },
  { name: 'almacen', label: 'Almacén', placeholder: 'Código o nombre de almacén' },
  { name: 'ubicacion', label: 'Ubicación', placeholder: 'Código o descripción de ubicación' },
  { name: 'familia', label: 'Familia', placeholder: 'Buscar por familia' },
  { name: 'subfamilia', label: 'Subfamilia', placeholder: 'Buscar por subfamilia' }
];

const InventarioFilters = ({
  open,
  onToggle,
  filters,
  onFilterChange,
  onToggleAll,
  onResetFilters,
  hasExpandedArticles,
  filterIcon,
  minusIcon,
  plusIcon,
  clearIcon
}) => {
  return (
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
                  <TextField
                    fullWidth
                    size="small"
                    label={field.label}
                    name={field.name}
                    placeholder={field.placeholder}
                    value={filters[field.name]}
                    onChange={onFilterChange}
                  />
                </Grid>
              ))}
            </Grid>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="contained"
                onClick={onToggleAll}
                startIcon={hasExpandedArticles ? minusIcon : plusIcon}
                sx={{ borderRadius: 2, fontWeight: 700 }}
              >
                {hasExpandedArticles ? 'Contraer Todo' : 'Expandir Todo'}
              </Button>
              <Button
                variant="outlined"
                color="inherit"
                onClick={onResetFilters}
                startIcon={clearIcon}
                sx={{ borderRadius: 2, fontWeight: 700 }}
              >
                Limpiar Filtros
              </Button>
            </Stack>
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
};


const InventarioUbicacionesTable = ({
  articulo,
  getStockStyle,
  formatearUnidad,
  getColorStyle,
  icons,
  onEditarCantidad,
  onVerDetalles
}) => {
  return (
    <TableContainer component={Paper} elevation={0} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ backgroundColor: 'rgba(44, 62, 80, 0.05)' }}>
            <TableCell>AlmacÃ©n</TableCell>
            <TableCell>UbicaciÃ³n</TableCell>
            <TableCell>DescripciÃ³n</TableCell>
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
                backgroundColor: ubicacion.esSinUbicacion
                  ? 'rgba(241, 196, 15, 0.08)'
                  : ubicacion.Cantidad < 0
                    ? 'rgba(231, 76, 60, 0.06)'
                    : ubicacion.Cantidad === 0
                      ? 'rgba(243, 156, 18, 0.06)'
                      : 'inherit'
              }}
            >
              <TableCell sx={{ minWidth: 170 }}>
                <Stack spacing={1}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {ubicacion.NombreAlmacen}
                  </Typography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {ubicacion.esSinUbicacion && (
                      <Chip
                        size="small"
                        icon={icons.mapPin}
                        label="SIN UBICACIÃ“N"
                        color="warning"
                        variant="outlined"
                      />
                    )}
                    {ubicacion.Cantidad < 0 && (
                      <Chip
                        size="small"
                        icon={icons.alert}
                        label="NEGATIVO"
                        color="error"
                        variant="outlined"
                      />
                    )}
                    {ubicacion.Cantidad === 0 && (
                      <Chip
                        size="small"
                        icon={icons.minus}
                        label="CERO"
                        color="warning"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                </Stack>
              </TableCell>
              <TableCell>{ubicacion.Ubicacion || 'N/A'}</TableCell>
              <TableCell>{ubicacion.DescripcionUbicacion || 'Stock sin ubicaciÃ³n asignada'}</TableCell>
              <TableCell>{ubicacion.UnidadStock || 'unidades'}</TableCell>
              <TableCell>
                {ubicacion.TallaColorDisplay && ubicacion.TallaColorDisplay !== 'N/A' ? (
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      px: 1.25,
                      py: 0.5,
                      borderRadius: 999,
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      ...getColorStyle(ubicacion.CodigoColor)
                    }}
                  >
                    {ubicacion.TallaColorDisplay}
                  </Box>
                ) : (
                  'N/A'
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
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={icons.edit}
                    onClick={() =>
                      onEditarCantidad(
                        ubicacion.CodigoArticuloStock || articulo.CodigoArticuloStock || articulo.CodigoArticulo,
                        ubicacion.NombreAlmacen,
                        ubicacion.Cantidad,
                        ubicacion.clave,
                        ubicacion.CodigoAlmacen,
                        ubicacion.Ubicacion,
                        ubicacion.Partida,
                        ubicacion.UnidadStock,
                        ubicacion.CodigoColor,
                        ubicacion.CodigoTalla01,
                        ubicacion.esSinUbicacion,
                        ubicacion.sinRegistrosAcumuladoStock
                      )
                    }
                  >
                    Editar
                  </Button>
                  {ubicacion.MovPosicionLinea && !ubicacion.esSinUbicacion && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => onVerDetalles(ubicacion.MovPosicionLinea)}
                    >
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
};


const InventarioArticleCard = ({
  articulo,
  expanded,
  onToggle,
  getEstadoColor,
  getStockStyle,
  formatearUnidad,
  getColorStyle,
  icons,
  onEditarCantidad,
  onVerDetalles
}) => {
  return (
    <Paper
      elevation={2}
      className={`inventario-item ${
        articulo.estado === 'agotado' ? 'inventario-estado-agotado' : ''
      } ${
        articulo.estado === 'negativo' ? 'inventario-estado-negativo' : ''
      } ${
        articulo.estado === 'cero' ? 'inventario-estado-cero' : ''
      }`}
      sx={{
        borderRadius: 3,
        overflow: 'hidden',
        borderLeft: `5px solid ${getEstadoColor(articulo.estado)}`
      }}
    >
      <Box className="inventario-articulo-header" onClick={onToggle} sx={{ cursor: 'pointer' }}>
        <Box className="inventario-articulo-info">
          <span className="inventario-articulo-codigo">{articulo.CodigoArticulo}</span>
          <span className="inventario-articulo-descripcion">{articulo.DescripcionArticulo}</span>
          {articulo.Descripcion2Articulo && (
            <span className="inventario-articulo-descripcion2">{articulo.Descripcion2Articulo}</span>
          )}
          <div className="inventario-articulo-categorias">
            {articulo.CodigoFamilia && (
              <span className="inventario-familia-tag">Familia: {articulo.CodigoFamilia}</span>
            )}
            {articulo.CodigoSubfamilia && (
              <span className="inventario-subfamilia-tag">Subfamilia: {articulo.CodigoSubfamilia}</span>
            )}
          </div>
        </Box>

        <Box className="inventario-articulo-total">
          <span className="inventario-total-unidades" style={getStockStyle(articulo.totalStockBase)}>
            {formatearUnidad(articulo.totalStockBase, articulo.UnidadBase)}
            {articulo.estado === 'negativo' && (
              <span className="badge-negativo">
                {icons.alert} NEGATIVO
              </span>
            )}
            {articulo.estado === 'cero' && (
              <span className="badge-cero">
                {icons.minus} CERO
              </span>
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
          articulo={articulo}
          getStockStyle={getStockStyle}
          formatearUnidad={formatearUnidad}
          getColorStyle={getColorStyle}
          icons={icons}
          onEditarCantidad={onEditarCantidad}
          onVerDetalles={onVerDetalles}
        />
      )}
    </Paper>
  );
};


const InventarioList = ({
  items,
  expandedItems,
  onToggleItem,
  getEstadoColor,
  getStockStyle,
  formatearUnidad,
  getColorStyle,
  icons,
  onEditarCantidad,
  onVerDetalles,
  hasMore,
  loadingMore,
  onLoadMore
}) => {
  return (
    <Stack spacing={2.5}>
      <Box className="inventario-list">
        <Stack spacing={2.5}>
          {items.map((articulo) => (
            <InventarioArticleCard
              key={articulo.CodigoArticulo}
              articulo={articulo}
              expanded={Boolean(expandedItems[articulo.CodigoArticulo])}
              onToggle={() => onToggleItem(articulo.CodigoArticulo)}
              getEstadoColor={getEstadoColor}
              getStockStyle={getStockStyle}
              formatearUnidad={formatearUnidad}
              getColorStyle={getColorStyle}
              icons={icons}
              onEditarCantidad={onEditarCantidad}
              onVerDetalles={onVerDetalles}
            />
          ))}
        </Stack>
      </Box>

      {(hasMore || loadingMore) && (
        <Paper elevation={1} sx={{ p: 2.5, borderRadius: 3 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            justifyContent="space-between"
          >
            <Stack spacing={0.5}>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>
                Carga progresiva activa
              </Typography>
              <Typography variant="body2" color="text.secondary">
                El resto de artículos se solicita bajo demanda sin bloquear la pantalla.
              </Typography>
            </Stack>

            <Button
              variant="contained"
              onClick={onLoadMore}
              disabled={!hasMore || loadingMore}
              startIcon={loadingMore ? <CircularProgress size={18} color="inherit" /> : icons.plus}
              sx={{ borderRadius: 2, fontWeight: 700, alignSelf: { xs: 'stretch', sm: 'center' } }}
            >
              {loadingMore ? 'Cargando más artículos...' : 'Cargar más'}
            </Button>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
};


const InventarioStateView = ({
  type,
  title,
  message,
  buttonLabel,
  onButtonClick,
  buttonIcon
}) => {
  if (type === 'loading') {
    return (
      <Paper elevation={1} sx={{ p: 6, borderRadius: 3 }}>
        <Stack spacing={2} alignItems="center">
          <CircularProgress />
          <Typography variant="body1">{message}</Typography>
        </Stack>
      </Paper>
    );
  }

  if (type === 'error') {
    return (
      <Paper elevation={1} sx={{ p: 4, borderRadius: 3 }}>
        <Stack spacing={2} alignItems="center">
          <Alert severity="error" sx={{ width: '100%' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            <Typography variant="body2">{message}</Typography>
          </Alert>
          {onButtonClick && (
            <Button variant="contained" onClick={onButtonClick} startIcon={buttonIcon}>
              {buttonLabel}
            </Button>
          )}
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper elevation={1} sx={{ p: 6, borderRadius: 3 }}>
      <Stack spacing={2} alignItems="center">
        <Box textAlign="center">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {message}
          </Typography>
        </Box>
        {onButtonClick && (
          <Button variant="outlined" onClick={onButtonClick}>
            {buttonLabel}
          </Button>
        )}
      </Stack>
    </Paper>
  );
};


const NuevoAjusteDialog = ({
  open,
  onClose,
  articuloBusqueda,
  onArticuloBusquedaChange,
  resultadosBusqueda,
  onSeleccionarArticulo,
  articuloSeleccionado,
  almacenSeleccionado,
  almacenesDisponibles,
  onAlmacenChange,
  ubicacionSeleccionada,
  onUbicacionChange,
  ubicacionBusqueda,
  onUbicacionBusquedaChange,
  ubicacionesDisponibles,
  cargandoUbicaciones,
  onUbicacionesScroll,
  unidadesDisponibles,
  unidadMedidaSeleccionada,
  onUnidadMedidaChange,
  mostrarSelectorTalla,
  tallasDisponibles,
  tallaSeleccionada,
  onTallaChange,
  mostrarSelectorColor,
  coloresDisponibles,
  colorSeleccionado,
  onColorChange,
  cantidadNuevoAjuste,
  onCantidadChange,
  onGuardar
}) => {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Nuevo Ajuste de Inventario</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          <Alert severity="info">
            Complete los siguientes campos para crear un nuevo ajuste de inventario.
          </Alert>

          <Stack spacing={1.5}>
            <TextField
              fullWidth
              autoFocus
              label="Buscar ArtÃ­culo *"
              value={articuloBusqueda}
              onChange={(e) => onArticuloBusquedaChange(e.target.value)}
              placeholder="Ingrese cÃ³digo o descripciÃ³n del artÃ­culo..."
            />

            {resultadosBusqueda.length > 0 && (
              <Paper variant="outlined" sx={{ maxHeight: 240, overflowY: 'auto' }}>
                {resultadosBusqueda.map((articulo) => (
                  <Box
                    key={articulo.CodigoArticulo}
                    onClick={() => onSeleccionarArticulo(articulo)}
                    sx={{
                      px: 2,
                      py: 1.5,
                      cursor: 'pointer',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:last-of-type': { borderBottom: 'none' },
                      '&:hover': { backgroundColor: 'action.hover' }
                    }}
                  >
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                      {articulo.CodigoArticulo}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {articulo.DescripcionArticulo}
                    </Typography>
                  </Box>
                ))}
              </Paper>
            )}
          </Stack>

          {articuloSeleccionado && (
            <Paper
              variant="outlined"
              sx={{ p: 2, borderRadius: 2, backgroundColor: 'rgba(39, 174, 96, 0.06)' }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                ArtÃ­culo seleccionado
              </Typography>
              <Typography variant="body1">
                <strong>{articuloSeleccionado.CodigoArticulo}</strong> - {articuloSeleccionado.DescripcionArticulo}
              </Typography>
            </Paper>
          )}

          <TextField select fullWidth label="AlmacÃ©n *" value={almacenSeleccionado} onChange={(e) => onAlmacenChange(e.target.value)}>
            <MenuItem value="">Seleccionar almacÃ©n</MenuItem>
            {almacenesDisponibles.map((almacen) => (
              <MenuItem key={almacen.CodigoAlmacen} value={almacen.CodigoAlmacen}>
                {almacen.CodigoAlmacen} - {almacen.Almacen || almacen.CodigoAlmacen}
              </MenuItem>
            ))}
          </TextField>

          {almacenSeleccionado && (
            <Autocomplete
              fullWidth
              options={ubicacionesDisponibles}
              loading={cargandoUbicaciones}
              filterOptions={(options) => options}
              value={ubicacionesDisponibles.find((ubicacion) => ubicacion.Ubicacion === ubicacionSeleccionada) || null}
              inputValue={ubicacionBusqueda}
              onChange={(_, nuevaUbicacion) => onUbicacionChange(nuevaUbicacion?.Ubicacion || '')}
              onInputChange={(_, nuevoValor, reason) => {
                if (reason === 'input' || reason === 'clear') {
                  onUbicacionBusquedaChange(nuevoValor);
                }
              }}
              isOptionEqualToValue={(option, value) => option.Ubicacion === value.Ubicacion}
              getOptionLabel={(option) => {
                if (!option) return '';
                return [option.Ubicacion, option.DescripcionUbicacion].filter(Boolean).join(' - ');
              }}
              ListboxProps={{
                onScroll: onUbicacionesScroll,
                style: { maxHeight: 320 }
              }}
              noOptionsText={
                cargandoUbicaciones
                  ? 'Cargando ubicaciones...'
                  : (ubicacionBusqueda ? 'No se encontraron ubicaciones' : 'Sin ubicaciones disponibles')
              }
              loadingText="Cargando ubicaciones..."
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="UbicaciÃƒÂ³n *"
                  placeholder="Buscar ubicaciÃƒÂ³n..."
                />
              )}
              renderOption={(props, ubicacion) => (
                <Box component="li" {...props} key={ubicacion.Ubicacion}>
                  {[ubicacion.Ubicacion, ubicacion.DescripcionUbicacion].filter(Boolean).join(' - ')}
                </Box>
              )}
            />
          )}

          {false && almacenSeleccionado && (
            <TextField select fullWidth label="UbicaciÃ³n *" value={ubicacionSeleccionada} onChange={(e) => onUbicacionChange(e.target.value)}>
              <MenuItem value="">Seleccionar ubicaci?n</MenuItem>
              {ubicacionesDisponibles.map((ubicacion) => (
                <MenuItem key={ubicacion.Ubicacion} value={ubicacion.Ubicacion}>
                  {ubicacion.Ubicacion} - {ubicacion.DescripcionUbicacion}
                </MenuItem>
              ))}
            </TextField>
          )}

          {articuloSeleccionado && (
            <TextField
              select
              fullWidth
              label="Unidad de Medida"
              value={unidadMedidaSeleccionada}
              onChange={(e) => onUnidadMedidaChange(e.target.value)}
            >
              {unidadesDisponibles.map((unidad) => (
                <MenuItem key={unidad} value={unidad}>
                  {unidad}
                </MenuItem>
              ))}
            </TextField>
          )}

          {mostrarSelectorTalla && (
            <TextField select fullWidth label="Talla" value={tallaSeleccionada} onChange={(e) => onTallaChange(e.target.value)}>
              <MenuItem value="">Seleccionar talla</MenuItem>
              {tallasDisponibles.map((talla) => (
                <MenuItem key={talla.codigo || talla} value={talla.codigo || talla}>
                  {talla.descripcion ? `${talla.codigo} - ${talla.descripcion}` : talla}
                </MenuItem>
              ))}
            </TextField>
          )}

          {mostrarSelectorColor && (
            <TextField select fullWidth label="Color" value={colorSeleccionado} onChange={(e) => onColorChange(e.target.value)}>
              <MenuItem value="">Seleccionar color</MenuItem>
              {coloresDisponibles.map((color) => (
                <MenuItem key={color.codigo || color} value={color.codigo || color}>
                  {color.nombre ? `${color.codigo} - ${color.nombre}` : color}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            fullWidth
            label="Cantidad *"
            type="number"
            value={cantidadNuevoAjuste}
            onChange={(e) => onCantidadChange(e.target.value)}
            inputProps={{ step: 'any', min: 0 }}
            placeholder="Ingrese la cantidad..."
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={onGuardar}
          disabled={!articuloSeleccionado || !almacenSeleccionado || !ubicacionSeleccionada || !cantidadNuevoAjuste}
        >
          Crear Ajuste
        </Button>
      </DialogActions>
    </Dialog>
  );
};


const EditarCantidadDialog = ({
  open,
  editandoCantidad,
  onClose,
  unidadesDisponiblesEdit,
  unidadMedidaSeleccionadaEdit,
  onUnidadMedidaChange,
  tallasDisponiblesEdit,
  tallaSeleccionadaEdit,
  onTallaChange,
  coloresDisponiblesEdit,
  colorSeleccionadoEdit,
  onColorChange,
  formatearUnidad,
  getStockStyle,
  nuevaCantidad,
  onNuevaCantidadChange,
  onGuardar
}) => {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Editar Cantidad</DialogTitle>
      <DialogContent dividers>
        {editandoCantidad && (
          <Stack spacing={2.5}>
            <Stack spacing={1}>
              <TextField
                fullWidth
                label="ArtÃ­culo"
                value={`${editandoCantidad.articulo} - ${editandoCantidad.descripcionArticulo}`}
                InputProps={{ readOnly: true }}
              />
              <TextField
                fullWidth
                label="AlmacÃ©n"
                value={editandoCantidad.nombreAlmacen}
                InputProps={{ readOnly: true }}
              />
              <TextField
                fullWidth
                label="UbicaciÃ³n"
                value={editandoCantidad.ubicacionStr}
                InputProps={{ readOnly: true }}
              />
              <TextField
                fullWidth
                label="Partida/Lote"
                value={editandoCantidad.partida || 'N/A'}
                InputProps={{ readOnly: true }}
              />
            </Stack>

            <TextField
              select
              fullWidth
              label="Unidad de Medida"
              value={unidadMedidaSeleccionadaEdit}
              onChange={(e) => onUnidadMedidaChange(e.target.value)}
            >
              {unidadesDisponiblesEdit.map((unidad) => (
                <MenuItem key={unidad} value={unidad}>
                  {unidad}
                </MenuItem>
              ))}
            </TextField>

            {tallasDisponiblesEdit.length > 0 && (
              <TextField select fullWidth label="Talla" value={tallaSeleccionadaEdit} onChange={(e) => onTallaChange(e.target.value)}>
                <MenuItem value="">Seleccionar talla</MenuItem>
                {tallasDisponiblesEdit.map((talla) => (
                  <MenuItem key={talla} value={talla}>
                    {talla}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {coloresDisponiblesEdit.length > 0 && (
              <TextField select fullWidth label="Color" value={colorSeleccionadoEdit} onChange={(e) => onColorChange(e.target.value)}>
                <MenuItem value="">Seleccionar color</MenuItem>
                {coloresDisponiblesEdit.map((color) => (
                  <MenuItem key={color} value={color}>
                    {color}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              fullWidth
              label="Cantidad Actual"
              value={formatearUnidad(editandoCantidad.cantidadActual, editandoCantidad.unidadStock)}
              InputProps={{ readOnly: true }}
              sx={{
                '& .MuiInputBase-input': {
                  ...getStockStyle(editandoCantidad.cantidadActual)
                }
              }}
            />

            <TextField
              fullWidth
              autoFocus
              label="Nueva Cantidad"
              type="number"
              value={nuevaCantidad}
              onChange={(e) => onNuevaCantidadChange(e.target.value)}
              inputProps={{ step: 'any' }}
              placeholder="Ingrese la nueva cantidad..."
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={onGuardar}>
          Guardar Ajuste
        </Button>
      </DialogActions>
    </Dialog>
  );
};


const InventarioDetallesDialog = ({ open, detallesModal, onClose }) => {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Detalles de Variantes</DialogTitle>
      <DialogContent dividers>
        {!detallesModal || detallesModal.length === 0 ? (
          <Alert severity="info">No hay detalles de variantes para este articulo.</Alert>
        ) : (
          <Stack spacing={3}>
            {detallesModal.map((detalle, index) => (
              <Paper key={`${detalle.color.codigo}-${detalle.grupoTalla.codigo}-${index}`} variant="outlined" sx={{ p: 2.5 }}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={1}
                  justifyContent="space-between"
                  sx={{ mb: 2 }}
                >
                  <Typography variant="subtitle1">
                    <strong>Color:</strong> {detalle.color.nombre}
                  </Typography>
                  <Typography variant="subtitle1">
                    <strong>Grupo Talla:</strong> {detalle.grupoTalla.nombre}
                  </Typography>
                </Stack>

                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Talla</TableCell>
                        <TableCell>Descripcion</TableCell>
                        <TableCell align="right">Unidades</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(detalle.tallas)
                        .filter(([_, talla]) => talla.unidades > 0)
                        .map(([codigoTalla, talla], idx) => (
                          <TableRow key={`${codigoTalla}-${idx}`}>
                            <TableCell>{codigoTalla}</TableCell>
                            <TableCell>{talla.descripcion}</TableCell>
                            <TableCell align="right">{talla.unidades}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Typography variant="body1" sx={{ mt: 2, fontWeight: 700 }}>
                  Total unidades: {detalle.unidades}
                </Typography>
              </Paper>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
};


const InventarioPage = () => {
  const [activeTab, setActiveTab] = useState('inventario');
  const [inventario, setInventario] = useState([]);
  const [historialAjustes, setHistorialAjustes] = useState([]);
  const [articulosExpandidos, setArticulosExpandidos] = useState({});
  const [fechasExpandidas, setFechasExpandidas] = useState({});
  const [historialPage, setHistorialPage] = useState(1);
  const [historialLimit, setHistorialLimit] = useState(20);
  const [historialPagination, setHistorialPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    hasPrev: false,
    hasNext: false
  });
  const [historialFilters, setHistorialFilters] = useState(getDefaultHistoryFilters);
  const [loading, setLoading] = useState({ inventario: true, historial: true });
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    codigo: '',
    almacen: '',
    ubicacion: '',
    familia: '',
    subfamilia: ''
  });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [inventarioHasMore, setInventarioHasMore] = useState(false);
  const [inventarioNextOffset, setInventarioNextOffset] = useState(0);
  const [inventarioLoadingMore, setInventarioLoadingMore] = useState(false);
  const [ajustesPendientes, setAjustesPendientes] = useState([]);
  const [editandoCantidad, setEditandoCantidad] = useState(null);
  const [nuevaCantidad, setNuevaCantidad] = useState('');
  const [detallesModal, setDetallesModal] = useState(null);
  const [cargandoDetalles, setCargandoDetalles] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  
  // Estados para el nuevo modal de ajuste
  const [modalNuevoAjuste, setModalNuevoAjuste] = useState(false);
  const [articuloBusqueda, setArticuloBusqueda] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState(null);
  const [almacenSeleccionado, setAlmacenSeleccionado] = useState('');
  const [almacenesDisponibles, setAlmacenesDisponibles] = useState([]);
  const [ubicacionSeleccionada, setUbicacionSeleccionada] = useState('');
  const [ubicacionesDisponibles, setUbicacionesDisponibles] = useState([]);
  const [ubicacionBusqueda, setUbicacionBusqueda] = useState('');
  const [cargandoUbicaciones, setCargandoUbicaciones] = useState(false);
  const [ubicacionesHasMore, setUbicacionesHasMore] = useState(false);
  const [ubicacionesNextOffset, setUbicacionesNextOffset] = useState(0);
  const [unidadMedidaSeleccionada, setUnidadMedidaSeleccionada] = useState('');
  const [tallaSeleccionada, setTallaSeleccionada] = useState('');
  const [colorSeleccionado, setColorSeleccionado] = useState('');
  const [cantidadNuevoAjuste, setCantidadNuevoAjuste] = useState('');

  // Estados para unidades, tallas y colores disponibles
  const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
  const [tallasDisponibles, setTallasDisponibles] = useState([]);
  const [coloresDisponibles, setColoresDisponibles] = useState([]);
  const [mostrarSelectorTalla, setMostrarSelectorTalla] = useState(false);
  const [mostrarSelectorColor, setMostrarSelectorColor] = useState(false);
  const ubicacionesRequestRef = useRef(0);
  const inventarioRequestRef = useRef(0);
  const UBICACIONES_BATCH_SIZE = 50;
  const INVENTARIO_BATCH_SIZE = 30;

  // Estados para ediciÃ³n de cantidad existente
  const [unidadesDisponiblesEdit, setUnidadesDisponiblesEdit] = useState(['unidades']);
  const [tallasDisponiblesEdit, setTallasDisponiblesEdit] = useState([]);
  const [coloresDisponiblesEdit, setColoresDisponiblesEdit] = useState([]);
  const [unidadMedidaSeleccionadaEdit, setUnidadMedidaSeleccionadaEdit] = useState('unidades');
  const [tallaSeleccionadaEdit, setTallaSeleccionadaEdit] = useState('');
  const [colorSeleccionadoEdit, setColorSeleccionadoEdit] = useState('');

  // NUEVA FUNCIÃ“N: Buscar artÃ­culos para el nuevo ajuste
  const buscarArticulos = async (termino) => {
    if (!termino || termino.trim().length < 2) {
      setResultadosBusqueda([]);
      return;
    }

    try {
      const headers = getAuthHeader();
      const response = await API.get(
        `/buscar-articulos?termino=${termino}`,
        { headers }
      );
      setResultadosBusqueda(response.data);
    } catch (error) {
      console.error('Error buscando artÃ­culos:', error);
      setResultadosBusqueda([]);
    }
  };

  // NUEVA FUNCIÃ“N: Cargar ubicaciones por almacÃ©n
  const cargarAlmacenesNuevoAjuste = async () => {
    try {
      const headers = getAuthHeader();
      const response = await API.get(
        '/inventario/almacenes-ajuste',
        { headers }
      );
      setAlmacenesDisponibles(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error cargando almacenes para nuevo ajuste:', error);
      setAlmacenesDisponibles([]);
    }
  };

  const cargarUbicacionesPorAlmacen = async (params) => {
    const {
      codigoAlmacen,
      search = '',
      offset = 0,
      append = false
    } = typeof params === 'string'
      ? { codigoAlmacen: params, search: '', offset: 0, append: false }
      : (params || {});

    if (!codigoAlmacen) {
      setUbicacionesDisponibles([]);
      setUbicacionesHasMore(false);
      setUbicacionesNextOffset(0);
      return;
    }

    const requestId = Date.now() + Math.random();
    ubicacionesRequestRef.current = requestId;

    try {
      setCargandoUbicaciones(true);
      const headers = getAuthHeader();
      const response = await API.get(
        '/inventario/ubicaciones-ajuste',
        {
          headers,
          params: {
            codigoAlmacen,
            search,
            offset,
            limit: UBICACIONES_BATCH_SIZE
          }
        }
      );

      if (ubicacionesRequestRef.current !== requestId) {
        return;
      }

      const payload = response.data || {};
      const items = Array.isArray(payload.items) ? payload.items : [];

      setUbicacionesDisponibles((prev) => {
        if (!append) {
          return items;
        }

        const existentes = new Set(prev.map((ubicacion) => ubicacion.Ubicacion));
        const nuevas = items.filter((ubicacion) => !existentes.has(ubicacion.Ubicacion));
        return [...prev, ...nuevas];
      });
      setUbicacionesHasMore(Boolean(payload.hasMore));
      setUbicacionesNextOffset(Number(payload.nextOffset) || 0);
    } catch (error) {
      console.error('Error cargando ubicaciones:', error);
      setUbicacionesDisponibles([]);
      setUbicacionesHasMore(false);
      setUbicacionesNextOffset(0);
    } finally {
      if (ubicacionesRequestRef.current === requestId) {
        setCargandoUbicaciones(false);
      }
    }
  };

  const handleAlmacenNuevoAjusteChange = (codigoAlmacen) => {
    setAlmacenSeleccionado(codigoAlmacen);
    setUbicacionSeleccionada('');
    setUbicacionBusqueda('');
    setUbicacionesDisponibles([]);
    setUbicacionesHasMore(false);
    setUbicacionesNextOffset(0);
  };

  const handleUbicacionBusquedaChange = (value) => {
    setUbicacionSeleccionada('');
    setUbicacionBusqueda(value);
  };

  const handleUbicacionesScroll = (event) => {
    const listboxNode = event.currentTarget;
    const scrollThreshold = 48;
    const reachedBottom =
      listboxNode.scrollTop + listboxNode.clientHeight >= listboxNode.scrollHeight - scrollThreshold;

    if (!reachedBottom || cargandoUbicaciones || !ubicacionesHasMore || !almacenSeleccionado) {
      return;
    }

    cargarUbicacionesPorAlmacen({
      codigoAlmacen: almacenSeleccionado,
      search: ubicacionBusqueda.trim(),
      offset: ubicacionesNextOffset,
      append: true
    });
  };

  // NUEVA FUNCIÃ“N: Cargar informaciÃ³n completa del artÃ­culo seleccionado
  const seleccionarArticulo = async (articulo) => {
    try {
      const headers = getAuthHeader();
      
      // Obtener informaciÃ³n bÃ¡sica del artÃ­culo
      const response = await API.get(
        `/articulos/${articulo.CodigoArticulo}/variantes-contexto`,
        { headers }
      );
      const contexto = response.data;
      const articuloContexto = contexto.articulo || {};
      
      setArticuloSeleccionado({
        ...articulo,
        ...articuloContexto
      });

      // Cargar unidades de medida disponibles
      const unidades = [
        articuloContexto.UnidadMedida2_,
        articuloContexto.UnidadMedidaAlternativa_
      ].filter((unidad, index, self) => 
        unidad && 
        unidad.trim() !== '' && 
        self.indexOf(unidad) === index
      );
      
      if (unidades.length === 0) {
        unidades.push('unidades');
      }
      
      setUnidadesDisponibles(unidades);
      setUnidadMedidaSeleccionada(unidades[0]);

      // El contexto de variantes viene filtrado por articulo y empresa activa.
      // Extraer tallas Ãºnicas
      // Extraer colores ?nicos
      // Seleccionar primera talla y color por defecto si existen
      const tallasContexto = Array.isArray(contexto.tallas) ? contexto.tallas : [];
      const coloresContexto = Array.isArray(contexto.colores) ? contexto.colores : [];
      const debeMostrarTalla = Boolean(contexto.usaTallas && tallasContexto.length > 0);
      const debeMostrarColor = Boolean(contexto.usaColores && coloresContexto.length > 0);

      setTallasDisponibles(tallasContexto);
      setColoresDisponibles(coloresContexto);
      setMostrarSelectorTalla(debeMostrarTalla);
      setMostrarSelectorColor(debeMostrarColor);
      setTallaSeleccionada(debeMostrarTalla && tallasContexto.length === 1 ? tallasContexto[0].codigo : '');
      setColorSeleccionado(debeMostrarColor && coloresContexto.length === 1 ? coloresContexto[0].codigo : '');

      setResultadosBusqueda([]);
      setArticuloBusqueda(articulo.CodigoArticulo);
      
    } catch (error) {
      console.error('Error cargando artÃ­culo:', error);
      alert('Error al cargar la informaciÃ³n del artÃ­culo');
    }
  };

  // NUEVA FUNCIÃ“N: Guardar nuevo ajuste
  const guardarNuevoAjuste = async () => {
    if (!articuloSeleccionado || !almacenSeleccionado || !ubicacionSeleccionada || !cantidadNuevoAjuste) {
      alert('Por favor complete todos los campos obligatorios');
      return;
    }

    const cantidad = parseFloat(cantidadNuevoAjuste);
    if (isNaN(cantidad)) {
      alert("Por favor ingrese un nÃºmero vÃ¡lido");
      return;
    }

    const nuevoAjuste = {
      articulo: articuloSeleccionado.CodigoArticulo,
      descripcionArticulo: articuloSeleccionado.DescripcionArticulo,
      codigoAlmacen: almacenSeleccionado,
      ubicacionStr: ubicacionSeleccionada,
      partida: '',
      unidadStock: (unidadMedidaSeleccionada === 'unidades' ? '' : unidadMedidaSeleccionada),
      nuevaCantidad: cantidad,
      codigoColor: colorSeleccionado || '',
      codigoTalla01: tallaSeleccionada || ''
    };

    try {
      const headers = getAuthHeader();
      const response = await API.post(
        '/inventario/ajustar-completo',
        { ajustes: [nuevoAjuste] },
        { headers }
      );
      
      if (response.data.success) {
        alert('Nuevo ajuste creado correctamente');
        setModalNuevoAjuste(false);
        resetearModalNuevoAjuste();
        cargarInventario();
        cargarHistorialAjustes();
      }
    } catch (error) {
      console.error('Error guardando nuevo ajuste:', error);
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.mensaje || 
                          error.message;
      alert(`Error al guardar el ajuste: ${errorMessage}`);
    }
  };

  // NUEVA FUNCIÃ“N: Resetear modal de nuevo ajuste
  const resetearModalNuevoAjuste = () => {
    setArticuloBusqueda('');
    setResultadosBusqueda([]);
    setArticuloSeleccionado(null);
    setAlmacenSeleccionado('');
    setUbicacionSeleccionada('');
    setUbicacionBusqueda('');
    setUbicacionesDisponibles([]);
    setCargandoUbicaciones(false);
    setUbicacionesHasMore(false);
    setUbicacionesNextOffset(0);
    setUnidadMedidaSeleccionada('');
    setTallaSeleccionada('');
    setColorSeleccionado('');
    setCantidadNuevoAjuste('');
    setUnidadesDisponibles([]);
    setTallasDisponibles([]);
    setColoresDisponibles([]);
    setMostrarSelectorTalla(false);
    setMostrarSelectorColor(false);
  };

  const cerrarNuevoAjuste = () => {
    setModalNuevoAjuste(false);
    resetearModalNuevoAjuste();
  };

  const cerrarEdicionCantidad = () => {
    setEditandoCantidad(null);
    setUnidadMedidaSeleccionadaEdit('unidades');
    setTallaSeleccionadaEdit('');
    setColorSeleccionadoEdit('');
  };

  // Efecto para buscar artÃ­culos cuando cambia el tÃ©rmino de bÃºsqueda
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (articuloBusqueda.trim().length >= 2) {
        buscarArticulos(articuloBusqueda);
      } else {
        setResultadosBusqueda([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [articuloBusqueda]);

  // Efecto para cargar ubicaciones cuando cambia el almacÃ©n seleccionado
  useEffect(() => {
    if (!almacenSeleccionado) {
      setUbicacionesDisponibles([]);
    }
  }, [almacenSeleccionado]);

  useEffect(() => {
    if (!almacenSeleccionado) {
      setUbicacionesDisponibles([]);
      setUbicacionesHasMore(false);
      setUbicacionesNextOffset(0);
      return;
    }

    const timeoutId = setTimeout(() => {
      cargarUbicacionesPorAlmacen({
        codigoAlmacen: almacenSeleccionado,
        search: ubicacionBusqueda.trim(),
        offset: 0,
        append: false
      });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [almacenSeleccionado, ubicacionBusqueda]);

  useEffect(() => {
    if (modalNuevoAjuste) {
      cargarAlmacenesNuevoAjuste();
    }
  }, [modalNuevoAjuste]);

  // CORRECCIÃ“N: FunciÃ³n mejorada para manejar nÃºmeros negativos y cero
  const formatearUnidad = (cantidad, unidad) => {
    let cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum)) {
      cantidadNum = 0;
    }
    
    // Manejar nÃºmeros negativos y cero
    const esNegativo = cantidadNum < 0;
    const esCero = cantidadNum === 0;
    const cantidadAbs = Math.abs(cantidadNum);
    
    if (!unidad || unidad.trim() === '') {
      unidad = 'unidad';
    }
    
    let cantidadFormateada = cantidadAbs;
    if (!Number.isInteger(cantidadAbs)) {
      cantidadFormateada = parseFloat(cantidadAbs.toFixed(2));
    }

    const unidadesInvariables = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3', 'barra', 'metro'];
    
    const unidadLower = unidad.toLowerCase();
    
    if (unidadesInvariables.includes(unidadLower)) {
      return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidad}`;
    }
    
    const pluralesIrregulares = {
      'ud': 'uds',
      'par': 'pares',
      'metro': 'metros',
      'pack': 'packs',
      'saco': 'sacos',
      'barra': 'barras',
      'caja': 'cajas',
      'rollo': 'rollos',
      'lata': 'latas',
      'bote': 'botes',
      'tubo': 'tubos',
      'unidad': 'unidades',
      'juego': 'juegos',
      'kit': 'kits',
      'paquete': 'paquetes',
      'cajetin': 'cajetines',
      'bidon': 'bidones',
      'palet': 'palets',
      'bobina': 'bobinas',
      'fardo': 'fardos',
      'cubeta': 'cubetas',
      'garrafa': 'garrafas',
      'tambor': 'tambores',
      'cubos': 'cubos',
      'pares': 'pares'
    };

    if (esCero) {
      return `0 ${unidad}`;
    }

    if (cantidadFormateada === 1) {
      if (unidadLower === 'unidad' || unidadLower === 'unidades') {
        return `${esNegativo ? '-' : ''}1 unidad`;
      }
      return `${esNegativo ? '-' : ''}1 ${unidad}`;
    } else {
      if (unidadLower === 'unidad' || unidadLower === 'unidades') {
        return `${esNegativo ? '-' : ''}${cantidadFormateada} unidades`;
      }
      
      if (pluralesIrregulares[unidadLower]) {
        return `${esNegativo ? '-' : ''}${cantidadFormateada} ${pluralesIrregulares[unidadLower]}`;
      }
      
      const ultimaLetra = unidad.charAt(unidad.length - 1);
      const penultimaLetra = unidad.charAt(unidad.length - 2);
      
      if (['a', 'e', 'i', 'o', 'u'].includes(ultimaLetra)) {
        return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidad}s`;
      } else {
        return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidad}es`;
      }
    }
  };

  const formatearFecha = (fechaStr) => {
    if (!fechaStr) return 'Fecha invÃ¡lida';
    
    try {
      const fecha = new Date(fechaStr);
      
      return fecha.toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formateando fecha:', fechaStr, error);
      return 'Fecha invÃ¡lida';
    }
  };

  const formatTallaColor = (talla, color) => {
    if (!talla && !color) return 'N/A';
    
    let result = '';
    if (talla && talla !== 'N/A') result += `T: ${talla}`;
    if (color && color !== 'N/A') result += `${result ? ' | ' : ''}C: ${color}`;
    
    return result || 'N/A';
  };

  const formatearTextoLegible = (valor, fallback = 'N/A') => {
    if (valor === null || valor === undefined) return fallback;
    const texto = String(valor).trim();
    return texto || fallback;
  };

  const normalizarTextoInventario = (valor) => {
    if (valor === null || valor === undefined) return '';
    const texto = String(valor).trim();
    if (!texto) return '';

    if (
      texto === 'SIN UBICACIÃ“N' ||
      texto === 'SIN UBICACIÃƒâ€œN' ||
      texto === 'SIN UBICACIï¿½N' ||
      texto === 'SIN UBICACI?N' ||
      texto === 'SIN UBICACIÃƒÆ’Ã‚â€œN' ||
      texto === 'SIN UBICACIÃƒÆ’Ã¢â‚¬Å“N'
    ) {
      return 'SIN UBICACIÃ“N';
    }

    return texto;
  };

  const construirResumenAjustePendiente = (ajuste) => {
    const resumen = [];
    const ubicacion = [ajuste.codigoAlmacen, normalizarTextoInventario(ajuste.ubicacionStr)].filter(Boolean).join(' / ');

    if (ubicacion) {
      resumen.push({ label: 'UbicaciÃ³n', value: ubicacion });
    }

    if (ajuste.codigoTalla01) {
      resumen.push({ label: 'Talla', value: ajuste.codigoTalla01 });
    }

    if (ajuste.codigoColor) {
      resumen.push({ label: 'Color', value: ajuste.codigoColor });
    }

    if (ajuste.unidadStock && ajuste.unidadStock !== 'unidades') {
      resumen.push({ label: 'Unidad', value: ajuste.unidadStock });
    }

    if (ajuste.partida) {
      resumen.push({ label: 'Partida/Lote', value: ajuste.partida });
    }

    return resumen;
  };

  const agruparHistorialPorFecha = useCallback((items = []) => {
    const agrupado = items.reduce((acc, item) => {
      const fechaKey = new Date(item.FechaRegistro).toISOString().split('T')[0];

      if (!acc[fechaKey]) {
        acc[fechaKey] = {
          fecha: fechaKey,
          totalAjustes: 0,
          detalles: []
        };
      }

      acc[fechaKey].detalles.push(item);
      acc[fechaKey].totalAjustes += 1;
      return acc;
    }, {});

    return Object.values(agrupado).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, []);

  const getColorStyle = (colorCode) => {
    const colorMap = {
      'A': { color: '#1E88E5', fontWeight: 'bold' },
      'V': { color: '#43A047', fontWeight: 'bold' },
      'R': { color: '#E53935', fontWeight: 'bold' },
      'N': { color: '#000000', fontWeight: 'bold' },
      'B': { color: '#FFFFFF', backgroundColor: '#333', padding: '2px 5px', borderRadius: '3px' },
    };
    return colorMap[colorCode] || {};
  };

  // CORRECCIÃ“N: Estilos mejorados para nÃºmeros negativos y cero
  const getStockStyle = (cantidad) => {
    if (cantidad === 0) return { 
      color: '#ff9800', 
      fontWeight: 'bold', 
      backgroundColor: '#fff3e0', 
      padding: '2px 6px', 
      borderRadius: '4px',
      border: '1px solid #ffb74d'
    };
    if (cantidad < 0) return { 
      color: '#e67e22', 
      fontWeight: 'bold', 
      backgroundColor: '#fef9e7', 
      padding: '2px 6px', 
      borderRadius: '4px',
      border: '1px solid #f39c12'
    };
    return { color: '#27ae60' };
  };

  const getEstadoColor = (estado) => {
    switch (estado) {
      case 'positivo': return '#2ecc71';
      case 'negativo': return '#e67e22';
      case 'cero': return '#ff9800';
      case 'agotado': return '#e74c3c';
      default: return '#7f8c8d';
    }
  };

  const cargarVariantesArticulo = useCallback(async (codigoArticulo, unidadActual, tallaActual = '', colorActual = '') => {
    try {
      const headers = getAuthHeader();
      
      // Obtener informaciÃ³n del artÃ­culo para unidades de medida
      const infoArticulo = await API.get(
        `/articulos/${codigoArticulo}/variantes-contexto`,
        { headers }
      );
      if (infoArticulo) {
        const unidades = [
          infoArticulo.UnidadMedida2_,
          infoArticulo.UnidadMedidaAlternativa_
        ].filter((unidad, index, self) => 
          unidad && 
          unidad.trim() !== '' && 
          self.indexOf(unidad) === index
        );
        
        if (unidades.length === 0) {
          unidades.push('unidades');
        }
        
        setUnidadesDisponiblesEdit(unidades);
        
        if (!unidadActual) {
          setUnidadMedidaSeleccionadaEdit(unidades[0]);
        } else {
          setUnidadMedidaSeleccionadaEdit(unidadActual);
        }
      }

      // Obtener stock para extraer tallas y colores disponibles
      const response = await API.get(
        `/stock/por-articulo?codigoArticulo=${codigoArticulo}&incluirSinUbicacion=true`,
        { headers }
      );
      
      const stockData = Array.isArray(response.data) ? response.data : [];
      
      // Extraer tallas Ãºnicas
      const tallasUnicas = [...new Set(stockData
        .filter(item => item.CodigoTalla01_ && item.CodigoTalla01_.trim() !== '')
        .map(item => item.CodigoTalla01_)
      )].sort();
      
      // Extraer colores ?nicos
      const coloresUnicos = [...new Set(stockData
        .filter(item => item.CodigoColor_ && item.CodigoColor_.trim() !== '')
        .map(item => item.CodigoColor_)
      )].sort();
      
      setTallasDisponiblesEdit(tallasUnicas);
      setColoresDisponiblesEdit(coloresUnicos);
      
      // Seleccionar primera talla y color por defecto si existen
      if (tallasUnicas.length > 0) {
        setTallaSeleccionadaEdit(tallasUnicas[0]);
      }
      if (coloresUnicos.length > 0) {
        setColorSeleccionadoEdit(coloresUnicos[0]);
      }

      const contextoResponse = await API.get(
        `/articulos/${codigoArticulo}/variantes-contexto`,
        { headers }
      );
      const contexto = contextoResponse.data || {};
      const articuloContexto = contexto.articulo || {};
      const unidadesContexto = [
        articuloContexto.UnidadMedida2_,
        articuloContexto.UnidadMedidaAlternativa_
      ].filter((unidad, index, self) =>
        unidad &&
        unidad.trim() !== '' &&
        self.indexOf(unidad) === index
      );

      if (unidadesContexto.length === 0) {
        unidadesContexto.push('unidades');
      }

      setUnidadesDisponiblesEdit(unidadesContexto);
      setUnidadMedidaSeleccionadaEdit(unidadActual || unidadesContexto[0]);
      setTallasDisponiblesEdit(Array.isArray(contexto.tallas) ? contexto.tallas.map((talla) => talla.codigo) : []);
      setColoresDisponiblesEdit(Array.isArray(contexto.colores) ? contexto.colores.map((color) => color.codigo) : []);
      setTallaSeleccionadaEdit(tallaActual || '');
      setColorSeleccionadoEdit(colorActual || '');
      
    } catch (error) {
      console.error('Error cargando variantes del artÃ­culo:', error);
      setUnidadesDisponiblesEdit(['unidades']);
      setTallasDisponiblesEdit([]);
      setColoresDisponiblesEdit([]);
    }
  }, []);

  // CORRECCIÃ“N: FunciÃ³n agruparPorArticulo que incluye negativos y cero
  const agruparPorArticulo = useCallback((data) => {
    const agrupado = {};
    
    data.forEach(item => {
      // CORRECCIÃ“N: Generar clave ?nica que incluya todos los campos relevantes
      const codigoArticuloStock = item.CodigoArticuloStock || item.CodigoArticulo;
      const claveUnica = `${codigoArticuloStock}_${item.CodigoAlmacen}_${item.Ubicacion}_${item.UnidadStock || 'unidades'}_${item.Partida || ''}_${item.CodigoColor_ || ''}_${item.CodigoTalla01_ || ''}`;
      
      if (!agrupado[item.CodigoArticulo]) {
        agrupado[item.CodigoArticulo] = {
          CodigoArticulo: item.CodigoArticulo,
          CodigoArticuloStock: codigoArticuloStock,
          DescripcionArticulo: item.DescripcionArticulo,
          Descripcion2Articulo: item.Descripcion2Articulo,
          CodigoFamilia: item.CodigoFamilia,
          CodigoSubfamilia: item.CodigoSubfamilia,
          UnidadBase: item.UnidadBase,
          UnidadAlternativa: item.UnidadAlternativa,
          FactorConversion: item.FactorConversion,
          ubicaciones: [],
          totalStockBase: 0,
          estado: 'positivo'
        };
      }
      
      let cantidadBase = parseFloat(item.CantidadBase);
      if (isNaN(cantidadBase)) {
        cantidadBase = 0;
      }
      
      let cantidad = parseFloat(item.Cantidad);
      if (isNaN(cantidad)) {
        cantidad = 0;
      }
      
      const ubicacion = {
        clave: claveUnica,
        CodigoArticuloStock: codigoArticuloStock,
        CodigoAlmacen: item.CodigoAlmacen,
        NombreAlmacen: item.NombreAlmacen,
        Ubicacion: item.Ubicacion,
        DescripcionUbicacion: item.DescripcionUbicacion,
        Partida: item.Partida,
        Periodo: item.Periodo,
        UnidadStock: item.UnidadStock,
        Cantidad: cantidad,
        CantidadBase: cantidadBase,
        CodigoColor: item.CodigoColor_,
        CodigoTalla01: item.CodigoTalla01_,
        GrupoUnico: claveUnica,
        MovPosicionLinea: item.MovPosicionLinea,
        detalles: null,
        esSinUbicacion: item.EsSinUbicacion === 1 || item.TipoStock === 'SIN_UBICACION',
        sinRegistrosAcumuladoStock: item.SinRegistrosAcumuladoStock === 1,
        TallaColorDisplay: formatTallaColor(item.CodigoTalla01_, item.CodigoColor_)
      };
      
      // VERIFICAR DUPLICADOS ANTES DE AGREGAR
      const existeDuplicado = agrupado[item.CodigoArticulo].ubicaciones.some(
        u => u.clave === claveUnica
      );
      
      if (!existeDuplicado) {
        agrupado[item.CodigoArticulo].ubicaciones.push(ubicacion);
        agrupado[item.CodigoArticulo].totalStockBase += cantidadBase;
      } else {
        console.warn(`Se evitÃ³ duplicado: ${claveUnica}`);
      }
    });
    
    Object.values(agrupado).forEach(articulo => {
      articulo.ubicaciones.sort((a, b) => {
        if (a.esSinUbicacion && !b.esSinUbicacion) return 1;
        if (!a.esSinUbicacion && b.esSinUbicacion) return -1;
        
        if (a.NombreAlmacen < b.NombreAlmacen) return -1;
        if (a.NombreAlmacen > b.NombreAlmacen) return 1;
        
        if (a.Ubicacion < b.Ubicacion) return -1;
        if (a.Ubicacion > b.Ubicacion) return 1;
        
        if (a.Partida && b.Partida) {
          if (a.Partida < b.Partida) return -1;
          if (a.Partida > b.Partida) return 1;
        }
        
        return 0;
      });
      
      if (isNaN(articulo.totalStockBase)) {
        articulo.totalStockBase = 0;
      }
      
      // CORRECCIÃ“N: Determinar estado incluyendo negativos y cero
      if (articulo.totalStockBase === 0) {
        articulo.estado = 'cero';
      } else if (articulo.totalStockBase < 0) {
        articulo.estado = 'negativo';
      } else {
        articulo.estado = 'positivo';
      }
    });
    
    return Object.values(agrupado);
  }, []);

  const inventarioFilters = useMemo(() => ({
    codigo: String(filters.codigo || searchTerm || '').trim(),
    almacen: String(filters.almacen || '').trim(),
    ubicacion: String(filters.ubicacion || '').trim(),
    familia: String(filters.familia || '').trim(),
    subfamilia: String(filters.subfamilia || '').trim()
  }), [filters, searchTerm]);

  const mergeInventarioItems = useCallback((prevItems, nextItems) => {
    const mergedMap = new Map(prevItems.map((item) => [item.CodigoArticulo, item]));
    nextItems.forEach((item) => {
      mergedMap.set(item.CodigoArticulo, item);
    });
    return Array.from(mergedMap.values());
  }, []);

  const cargarInventario = useCallback(async ({ reset = false, offset = 0, filtros = inventarioFilters } = {}) => {
    const requestId = inventarioRequestRef.current + 1;
    inventarioRequestRef.current = requestId;

    try {
      if (reset) {
        setLoading(prev => ({ ...prev, inventario: true }));
        setInventarioLoadingMore(false);
      } else {
        setInventarioLoadingMore(true);
      }
      setError('');
      const headers = getAuthHeader();
      const response = await API.get(
        '/inventario/stock-total-lote',
        {
          headers,
          params: {
            offset,
            limit: INVENTARIO_BATCH_SIZE,
            ...filtros
          }
        }
      );

      if (inventarioRequestRef.current !== requestId) {
        return;
      }

      const payload = response.data || {};
      const items = Array.isArray(payload) ? payload : (payload.items || []);
      const groupedItems = agruparPorArticulo(items);
      const hasMore = Array.isArray(payload) ? false : Boolean(payload.hasMore);
      const nextOffset = Array.isArray(payload)
        ? groupedItems.length
        : Number(payload.nextOffset || 0);

      setInventario((prev) => (reset ? groupedItems : mergeInventarioItems(prev, groupedItems)));
      setInventarioHasMore(hasMore);
      setInventarioNextOffset(nextOffset);
      setLoading(prev => ({ ...prev, inventario: false }));
      setInventarioLoadingMore(false);
    } catch (error) {
      if (inventarioRequestRef.current !== requestId) {
        return;
      }
      console.error('Error al obtener inventario:', error);
      setError('Error al cargar el inventario. Intente nuevamente.');
      setLoading(prev => ({ ...prev, inventario: false }));
      setInventarioLoadingMore(false);
    }
  }, [INVENTARIO_BATCH_SIZE, agruparPorArticulo, inventarioFilters, mergeInventarioItems]);

  const cargarHistorialAjustes = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, historial: true }));
      setError('');
      const headers = getAuthHeader();
      const response = await API.get(
        '/inventario/historial-ajustes-v2',
        {
          headers,
          params: {
            page: historialPage,
            limit: historialLimit,
            fechaDesde: historialFilters.fechaDesde,
            fechaHasta: historialFilters.fechaHasta
          }
        }
      );

      const items = response.data?.items || [];
      setHistorialAjustes(agruparHistorialPorFecha(items));
      setHistorialPagination(response.data?.pagination || {
        page: historialPage,
        limit: historialLimit,
        total: items.length,
        totalPages: 1,
        hasPrev: false,
        hasNext: false
      });
      setLoading(prev => ({ ...prev, historial: false }));
    } catch (error) {
      console.error('Error al obtener historial:', error);
      setError('Error al cargar el historial de ajustes. Intente nuevamente.');
      setLoading(prev => ({ ...prev, historial: false }));
    }
  }, [agruparHistorialPorFecha, historialFilters.fechaDesde, historialFilters.fechaHasta, historialLimit, historialPage]);

  const obtenerInfoArticulo = async (codigoArticulo) => {
    try {
      const headers = getAuthHeader();
      const response = await API.get(
        `/articulos/${codigoArticulo}`,
        { headers }
      );
      return response.data;
    } catch (error) {
      console.error('Error al obtener informaciÃ³n del artÃ­culo:', error);
      return null;
    }
  };

  useEffect(() => {
    if (activeTab === 'historial') {
      cargarHistorialAjustes();
    }
  }, [activeTab, cargarHistorialAjustes]);

  useEffect(() => {
    if (activeTab !== 'inventario') {
      return;
    }

    setArticulosExpandidos({});
    setInventario([]);
    setInventarioHasMore(false);
    setInventarioNextOffset(0);
    cargarInventario({ reset: true, offset: 0, filtros: inventarioFilters });
  }, [activeTab, cargarInventario, inventarioFilters]);

  const refreshInventario = useCallback(() => {
    if (activeTab === 'inventario') {
      setArticulosExpandidos({});
      setInventario([]);
      setInventarioHasMore(false);
      setInventarioNextOffset(0);
      cargarInventario({ reset: true, offset: 0, filtros: inventarioFilters });
    } else {
      cargarHistorialAjustes();
    }
  }, [activeTab, cargarHistorialAjustes, cargarInventario, inventarioFilters]);

  const cargarMasInventario = useCallback(() => {
    if (!inventarioHasMore || inventarioLoadingMore || loading.inventario) {
      return;
    }

    cargarInventario({
      reset: false,
      offset: inventarioNextOffset,
      filtros: inventarioFilters
    });
  }, [cargarInventario, inventarioFilters, inventarioHasMore, inventarioLoadingMore, inventarioNextOffset, loading.inventario]);

  const toggleExpandirArticulo = (codigoArticulo) => {
    setArticulosExpandidos(prev => ({
      ...prev,
      [codigoArticulo]: !prev[codigoArticulo]
    }));
  };

  const toggleExpandirFecha = (fecha) => {
    setFechasExpandidas(prev => ({
      ...prev,
      [fecha]: !prev[fecha]
    }));
  };

  const handleHistorialFilterChange = (event) => {
    const { name, value } = event.target;
    setHistorialPage(1);
    setHistorialFilters((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleHistorialLimitChange = (event) => {
    setHistorialLimit(parseInt(event.target.value, 10) || 20);
    setHistorialPage(1);
  };

  const toggleTodosArticulos = () => {
    if (Object.keys(articulosExpandidos).length === inventario.length) {
      setArticulosExpandidos({});
    } else {
      const allExpanded = {};
      inventario.forEach(art => {
        allExpanded[art.CodigoArticulo] = true;
      });
      setArticulosExpandidos(allExpanded);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const estadoOrden = { 'positivo': 1, 'negativo': 2, 'cero': 3, 'agotado': 4 };

  const visibleInventario = useMemo(() => {
    const result = [...inventario];

    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue, bValue;
        
        if (sortConfig.key === 'estado') {
          aValue = estadoOrden[a.estado];
          bValue = estadoOrden[b.estado];
        } else {
          aValue = a[sortConfig.key];
          bValue = b[sortConfig.key];
        }
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    } else {
      result.sort((a, b) => {
        if (estadoOrden[a.estado] < estadoOrden[b.estado]) return -1;
        if (estadoOrden[a.estado] > estadoOrden[b.estado]) return 1;
        
        if (a.CodigoArticulo < b.CodigoArticulo) return -1;
        if (a.CodigoArticulo > b.CodigoArticulo) return 1;
        return 0;
      });
    }
    
    return result;
  }, [inventario, sortConfig]);

  const stats = useMemo(() => {
    const totalArticulos = visibleInventario.length;
    const totalUnidades = visibleInventario.reduce((total, art) => total + (art.totalStockBase || 0), 0);
    const totalUbicaciones = visibleInventario.reduce((total, art) => {
      const ubicacionesFisicas = new Set(
        art.ubicaciones.map((ubic) => `${ubic.CodigoAlmacen || ''}_${ubic.Ubicacion || ''}`)
      );
      return total + ubicacionesFisicas.size;
    }, 0);
    const stockSinUbicacion = visibleInventario.reduce((total, art) => 
      total + art.ubicaciones.filter(ubic => ubic.esSinUbicacion).reduce((sum, ubic) => sum + (ubic.CantidadBase || 0), 0), 0);
    
    // NUEVO: Calcular stock negativo y cero
    const stockNegativo = visibleInventario.reduce((total, art) => 
      total + art.ubicaciones.filter(ubic => ubic.Cantidad < 0).reduce((sum, ubic) => sum + (ubic.Cantidad || 0), 0), 0);
    
    const stockCero = visibleInventario.reduce((total, art) => 
      total + art.ubicaciones.filter(ubic => ubic.Cantidad === 0).length, 0);
    
    return { 
      totalArticulos, 
      totalUnidades, 
      totalUbicaciones, 
      stockSinUbicacion, 
      stockNegativo,
      stockCero 
    };
  }, [visibleInventario]);

  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setFilters({
      codigo: '',
      almacen: '',
      ubicacion: '',
      familia: '',
      subfamilia: ''
    });
  }, []);

  const inventarioIcons = useMemo(() => ({
    title: <FiPackage />,
    refresh: <FiRefreshCw />,
    add: <FiPlusCircle />,
    inventarioTab: <FiList />,
    historialTab: <FiClock />,
    filter: <FiFilter />,
    minus: <FiMinus />,
    plus: <FiPlus />,
    package: <FiPackage />,
    layers: <FiLayers />,
    mapPin: <FiMapPin />,
    database: <FiDatabase />,
    alert: <FiAlertTriangle />,
    chevronUp: <FiChevronUp />,
    chevronDown: <FiChevronDown />,
    edit: <FiEdit />,
    clear: <FiX />
  }), []);

  const iniciarEdicionCantidad = async (articulo, nombreAlmacen, cantidadActual, clave, codigoAlmacen, ubicacionStr, partida, unidadStock, codigoColor, codigoTalla01, esSinUbicacion, sinRegistrosAcumuladoStock = false) => {
    const articuloCompleto = inventario.find(
      art => art.CodigoArticulo === articulo || art.CodigoArticuloStock === articulo
    );

    if (sinRegistrosAcumuladoStock && esSinUbicacion && Number(cantidadActual) === 0) {
      alert('Cuidado, no hay registros previos en la tabla de AcumuladoStock');
    }
    
    await cargarVariantesArticulo(articulo, unidadStock, codigoTalla01 || '', codigoColor || '');
    
    setEditandoCantidad({
      articulo,
      descripcionArticulo: articuloCompleto?.DescripcionArticulo || '',
      nombreAlmacen,
      cantidadActual,
      clave,
      codigoAlmacen,
      ubicacionStr: esSinUbicacion ? 'SIN UBICACIÃ“N' : ubicacionStr,
      partida: partida || '',
      unidadStock: unidadStock || 'unidades',
      codigoColor: codigoColor || '',
      codigoTalla01: codigoTalla01 || '',
      esSinUbicacion: esSinUbicacion || false
    });
    
    // Establecer valores actuales en los selects
    setUnidadMedidaSeleccionadaEdit(unidadStock || 'unidades');
    setTallaSeleccionadaEdit(codigoTalla01 || '');
    setColorSeleccionadoEdit(codigoColor || '');
    setNuevaCantidad(cantidadActual.toString());
  };

  const guardarAjustePendiente = () => {
    if (!editandoCantidad || !nuevaCantidad) return;
    
    const cantidad = parseFloat(nuevaCantidad);
    if (isNaN(cantidad)) {
      alert("Por favor ingrese un nÃºmero vÃ¡lido");
      return;
    }
    
    const nuevoAjuste = {
      articulo: editandoCantidad.articulo,
      descripcionArticulo: editandoCantidad.descripcionArticulo,
      codigoAlmacen: editandoCantidad.codigoAlmacen,
      ubicacionStr: editandoCantidad.ubicacionStr,
      partida: editandoCantidad.partida || '',
      unidadStock: (unidadMedidaSeleccionadaEdit === 'unidades' ? '' : unidadMedidaSeleccionadaEdit),
      nuevaCantidad: cantidad,
      codigoColor: colorSeleccionadoEdit || '',
      codigoTalla01: tallaSeleccionadaEdit || '',
      combinacionOriginal: {
        articulo: editandoCantidad.articulo,
        codigoAlmacen: editandoCantidad.codigoAlmacen,
        ubicacionStr: editandoCantidad.ubicacionStr,
        partida: editandoCantidad.partida || '',
        unidadStock: editandoCantidad.unidadStock || '',
        codigoColor: editandoCantidad.codigoColor || '',
        codigoTalla01: editandoCantidad.codigoTalla01 || '',
        nuevaCantidad: editandoCantidad.cantidadActual
      }
    };
    
    setAjustesPendientes(prev => [...prev, nuevoAjuste]);
    setEditandoCantidad(null);
    setNuevaCantidad('');
  };

  const eliminarAjustePendiente = (index) => {
    setAjustesPendientes(prev => prev.filter((_, i) => i !== index));
  };

  const verDetalles = async (movPosicionLinea) => {
    if (!movPosicionLinea) return;
    
    try {
      setCargandoDetalles(true);
      const headers = getAuthHeader();
      const response = await API.get(
        `/stock/detalles?movPosicionLinea=${movPosicionLinea}`,
        { headers }
      );
      
      setDetallesModal(response.data);
    } catch (error) {
      console.error('Error cargando detalles:', error);
      alert('Error al cargar los detalles');
    } finally {
      setCargandoDetalles(false);
    }
  };

  const confirmarAjustes = async () => {
    if (ajustesPendientes.length === 0) {
      alert('No hay ajustes para confirmar');
      return;
    }
    
    try {
      const headers = getAuthHeader();
      const response = await API.post(
        '/inventario/ajustar-completo',
        { ajustes: ajustesPendientes },
        { headers }
      );
      
      if (response.data.success) {
        refreshInventario();
        cargarHistorialAjustes();
        setAjustesPendientes([]);
        alert('Ajustes realizados correctamente y registrados en inventarios');
      }
    } catch (error) {
      console.error('Error al confirmar ajustes:', error);
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.mensaje || 
                          error.message;
      alert(`Error al confirmar ajustes: ${errorMessage}`);
    }
  };

  const renderPage = () => (
    <div className="inventario-container">
      <Navbar />

      <div className="inventario-content">
        <InventarioHeader
          onNuevoAjuste={() => setModalNuevoAjuste(true)}
          onRefresh={refreshInventario}
          titleIcon={inventarioIcons.title}
          refreshIcon={inventarioIcons.refresh}
          addIcon={inventarioIcons.add}
        />

        <InventarioTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          inventarioIcon={inventarioIcons.inventarioTab}
          historialIcon={inventarioIcons.historialTab}
        />

        {activeTab === 'inventario' && (
          <InventarioFilters
            open={filtrosAbiertos}
            onToggle={() => setFiltrosAbiertos(!filtrosAbiertos)}
            filters={filters}
            onFilterChange={handleFilterChange}
            onToggleAll={toggleTodosArticulos}
            onResetFilters={resetFilters}
            hasExpandedArticles={Object.keys(articulosExpandidos).length > 0}
            filterIcon={inventarioIcons.filter}
            minusIcon={inventarioIcons.minus}
            plusIcon={inventarioIcons.plus}
            clearIcon={inventarioIcons.clear}
          />
        )}

        {activeTab === 'inventario' && ajustesPendientes.length > 0 && (
          <div className="inventario-panel-ajustes">
            <div className="inventario-panel-header">
              <h3>Ajustes Pendientes <span className="inventario-badge">{ajustesPendientes.length}</span></h3>
              <div className="inventario-panel-actions">
                <button
                  className="inventario-btn-confirmar"
                  onClick={confirmarAjustes}
                >
                  <FiCheck /> Confirmar Ajustes
                </button>
              </div>
            </div>

            <div className="inventario-lista-ajustes">
              {ajustesPendientes.map((ajuste, index) => (
                <div key={index} className="inventario-ajuste-item">
                  <div className="inventario-ajuste-info">
                    <div className="inventario-articulo">
                      <span className="inventario-label">ArtÃ­culo:</span>
                      <div className="inventario-value">
                        <div className="inventario-articulo-codigo">{ajuste.articulo}</div>
                        <div className="inventario-articulo-descripcion">{ajuste.descripcionArticulo}</div>
                      </div>
                    </div>
                    <div className="inventario-ubicacion">
                      <span className="inventario-label">UbicaciÃ³n:</span>
                      <div className="inventario-value">
                        <div>{[ajuste.codigoAlmacen, normalizarTextoInventario(ajuste.ubicacionStr)].filter(Boolean).join(' / ')}</div>
                        {construirResumenAjustePendiente(ajuste)
                          .filter((detalle) => detalle.label !== 'UbicaciÃ³n')
                          .map((detalle) => (
                            <div key={`${index}-${detalle.label}`}>
                              <strong>{detalle.label}:</strong> {detalle.value}
                            </div>
                          ))}
                      </div>
                    </div>
                    <div className="inventario-cantidad">
                      <span className="inventario-label">Nueva Cantidad:</span>
                      <span className="inventario-value">
                        <strong style={getStockStyle(ajuste.nuevaCantidad)}>
                          {formatearUnidad(ajuste.nuevaCantidad, ajuste.unidadStock)}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <button
                    className="inventario-btn-eliminar"
                    onClick={() => eliminarAjustePendiente(index)}
                  >
                    <FiX />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'inventario' && (
          <InventarioResumenCards stats={stats} icons={inventarioIcons} />
        )}

        {cargandoDetalles && (
          <div className="inventario-cargando-detalles">
            <div className="inventario-spinner"></div>
            <p>Cargando detalles...</p>
          </div>
        )}

        <div className="inventario-main-content">
          {activeTab === 'inventario' ? (
            <>
              {error ? (
                <InventarioStateView
                  type="error"
                  title="Error al cargar datos"
                  message={error}
                  buttonLabel="Recargar Inventario"
                  onButtonClick={refreshInventario}
                  buttonIcon={inventarioIcons.refresh}
                />
              ) : loading.inventario && visibleInventario.length === 0 ? (
                <InventarioStateView type="loading" message="Cargando primeros artículos..." />
              ) : visibleInventario.length === 0 ? (
                <InventarioStateView
                  type="empty"
                  title="No se encontraron artículos"
                  message="Intenta ajustar tus filtros de búsqueda"
                  buttonLabel="Limpiar Filtros"
                  onButtonClick={resetFilters}
                />
              ) : (
                <InventarioList
                  items={visibleInventario}
                  expandedItems={articulosExpandidos}
                  onToggleItem={toggleExpandirArticulo}
                  getEstadoColor={getEstadoColor}
                  getStockStyle={getStockStyle}
                  formatearUnidad={formatearUnidad}
                  getColorStyle={getColorStyle}
                  icons={inventarioIcons}
                  onEditarCantidad={iniciarEdicionCantidad}
                  onVerDetalles={verDetalles}
                  hasMore={inventarioHasMore}
                  loadingMore={inventarioLoadingMore}
                  onLoadMore={cargarMasInventario}
                />
              )}
            </>
          ) : (
            <>
              {error ? (
                <InventarioStateView
                  type="error"
                  title="Error al cargar datos"
                  message={error}
                  buttonLabel="Recargar Historial"
                  onButtonClick={cargarHistorialAjustes}
                  buttonIcon={inventarioIcons.refresh}
                />
              ) : loading.historial ? (
                <InventarioStateView type="loading" message="Cargando historial de ajustes..." />
              ) : historialAjustes.length === 0 ? (
                <InventarioStateView
                  type="empty"
                  title="No se encontraron ajustes"
                  message="No hay registros en el historial de ajustes"
                />
              ) : (
                <>
                <Paper elevation={1} sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={2}
                    alignItems={{ xs: 'stretch', md: 'center' }}
                    justifyContent="space-between"
                  >
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <TextField
                        label="Desde"
                        name="fechaDesde"
                        type="date"
                        value={historialFilters.fechaDesde}
                        onChange={handleHistorialFilterChange}
                        InputLabelProps={{ shrink: true }}
                        size="small"
                      />
                      <TextField
                        label="Hasta"
                        name="fechaHasta"
                        type="date"
                        value={historialFilters.fechaHasta}
                        onChange={handleHistorialFilterChange}
                        InputLabelProps={{ shrink: true }}
                        size="small"
                      />
                      <TextField
                        select
                        label="TamaÃ±o"
                        value={historialLimit}
                        onChange={handleHistorialLimitChange}
                        size="small"
                        sx={{ minWidth: 120 }}
                      >
                        <MenuItem value={20}>20</MenuItem>
                        <MenuItem value={25}>25</MenuItem>
                      </TextField>
                    </Stack>

                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                      {historialPagination.total} movimientos en el rango seleccionado
                    </Typography>
                  </Stack>
                </Paper>
                <div className="inventario-historial-list">
                  {historialAjustes.map(item => {
                    const expandido = fechasExpandidas[item.fecha];

                    return (
                      <div key={`${item.fecha}-${item.totalAjustes}`} className="inventario-historial-item">
                        <div
                          className="inventario-fecha-header"
                          onClick={() => toggleExpandirFecha(item.fecha)}
                          style={{ background: expandido ? '#f0f7ff' : '#f5f7fa' }}
                        >
                          <div className="inventario-fecha-info">
                            <span className="inventario-fecha">{formatearFecha(item.fecha)}</span>
                            <span className="inventario-resumen">
                              {item.totalAjustes} ajustes realizados
                            </span>
                          </div>
                          <span className={`inventario-expand-icon ${expandido ? 'expanded' : ''}`}>
                            {expandido ? <FiChevronUp /> : <FiChevronDown />}
                          </span>
                        </div>

                        {expandido && (
                          <div className="inventario-detalles-ajustes">
                            {item.detalles.map((detalle, idx) => (
                              <div key={`${detalle.CodigoArticulo}-${detalle.FechaRegistro}-${idx}`}
                                   className={`inventario-ajuste-detalle ${detalle.Diferencia > 0 ? 'ajuste-positivo' : 'ajuste-negativo'}`}>
                                <div className="inventario-ajuste-detalle-header">
                                  <span className="inventario-ajuste-articulo">
                                    <strong>{detalle.CodigoArticulo}</strong> - {detalle.DescripcionArticulo}
                                  </span>
                                  <span className="inventario-ajuste-cantidad">
                                    {detalle.Diferencia > 0 ? '+' : ''}{detalle.Diferencia}
                                  </span>
                                </div>

                                <div className="inventario-ajuste-detalle-info">
                                  <div>
                                    <span className="inventario-ajuste-label">AlmacÃ©n:</span>
                                    <span>{detalle.NombreAlmacen} ({detalle.CodigoAlmacen})</span>
                                  </div>
                                  <div>
                                    <span className="inventario-ajuste-label">UbicaciÃ³n:</span>
                                    <span>{detalle.Ubicacion} - {detalle.DescripcionUbicacion || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="inventario-ajuste-label">Comentario:</span>
                                    <span>{detalle.Comentario || 'Sin comentario'}</span>
                                  </div>
                                  <div>
                                    <span className="inventario-ajuste-label">Usuario:</span>
                                    <span>{detalle.Usuario || 'No disponible'}</span>
                                  </div>
                                  {(detalle.UnidadMedida || detalle.CodigoColor || detalle.CodigoTalla01 || detalle.Partida) && (
                                    <div>
                                      <span className="inventario-ajuste-label">Variante:</span>
                                      <span>
                                        {[
                                          detalle.UnidadMedida ? `Unidad ${detalle.UnidadMedida}` : '',
                                          detalle.CodigoColor ? `Color ${detalle.CodigoColor}` : '',
                                          detalle.CodigoTalla01 ? `Talla ${detalle.CodigoTalla01}` : '',
                                          detalle.Partida ? `Partida ${detalle.Partida}` : ''
                                        ].filter(Boolean).join(' | ')}
                                      </span>
                                    </div>
                                  )}
                                  <div>
                                    <span className="inventario-ajuste-label">Tipo:</span>
                                    <span className={`badge-${detalle.TipoRegistro?.toLowerCase() || 'movimiento'}`}>
                                      {detalle.TipoRegistro || 'MOVIMIENTO'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="inventario-ajuste-label">Fecha y hora:</span>
                                    <span>{formatearFecha(detalle.FechaRegistro)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Paper elevation={1} sx={{ mt: 2, p: 2, borderRadius: 3 }}>
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={2}
                    alignItems={{ xs: 'stretch', md: 'center' }}
                    justifyContent="space-between"
                  >
                    <Typography variant="body2" color="text.secondary">
                      PÃ¡gina {historialPagination.page} de {historialPagination.totalPages}
                    </Typography>
                    <Pagination
                      page={historialPage}
                      count={historialPagination.totalPages}
                      color="primary"
                      onChange={(_, value) => setHistorialPage(value)}
                    />
                  </Stack>
                </Paper>
                </>
              )}
            </>
          )}
        </div>

        <NuevoAjusteDialog
          open={modalNuevoAjuste}
          onClose={cerrarNuevoAjuste}
          articuloBusqueda={articuloBusqueda}
          onArticuloBusquedaChange={setArticuloBusqueda}
          resultadosBusqueda={resultadosBusqueda}
          onSeleccionarArticulo={seleccionarArticulo}
          articuloSeleccionado={articuloSeleccionado}
          almacenSeleccionado={almacenSeleccionado}
          almacenesDisponibles={almacenesDisponibles}
          onAlmacenChange={handleAlmacenNuevoAjusteChange}
          ubicacionSeleccionada={ubicacionSeleccionada}
          onUbicacionChange={setUbicacionSeleccionada}
          ubicacionBusqueda={ubicacionBusqueda}
          onUbicacionBusquedaChange={handleUbicacionBusquedaChange}
          ubicacionesDisponibles={ubicacionesDisponibles}
          cargandoUbicaciones={cargandoUbicaciones}
          onUbicacionesScroll={handleUbicacionesScroll}
          unidadesDisponibles={unidadesDisponibles}
          unidadMedidaSeleccionada={unidadMedidaSeleccionada}
          onUnidadMedidaChange={setUnidadMedidaSeleccionada}
          mostrarSelectorTalla={mostrarSelectorTalla}
          tallasDisponibles={tallasDisponibles}
          tallaSeleccionada={tallaSeleccionada}
          onTallaChange={setTallaSeleccionada}
          mostrarSelectorColor={mostrarSelectorColor}
          coloresDisponibles={coloresDisponibles}
          colorSeleccionado={colorSeleccionado}
          onColorChange={setColorSeleccionado}
          cantidadNuevoAjuste={cantidadNuevoAjuste}
          onCantidadChange={setCantidadNuevoAjuste}
          onGuardar={guardarNuevoAjuste}
        />

        <EditarCantidadDialog
          open={Boolean(editandoCantidad)}
          editandoCantidad={editandoCantidad}
          onClose={cerrarEdicionCantidad}
          unidadesDisponiblesEdit={unidadesDisponiblesEdit}
          unidadMedidaSeleccionadaEdit={unidadMedidaSeleccionadaEdit}
          onUnidadMedidaChange={setUnidadMedidaSeleccionadaEdit}
          tallasDisponiblesEdit={tallasDisponiblesEdit}
          tallaSeleccionadaEdit={tallaSeleccionadaEdit}
          onTallaChange={setTallaSeleccionadaEdit}
          coloresDisponiblesEdit={coloresDisponiblesEdit}
          colorSeleccionadoEdit={colorSeleccionadoEdit}
          onColorChange={setColorSeleccionadoEdit}
          formatearUnidad={formatearUnidad}
          getStockStyle={getStockStyle}
          nuevaCantidad={nuevaCantidad}
          onNuevaCantidadChange={setNuevaCantidad}
          onGuardar={guardarAjustePendiente}
        />

        <InventarioDetallesDialog
          open={Boolean(detallesModal)}
          detallesModal={detallesModal}
          onClose={() => setDetallesModal(null)}
        />
      </div>
    </div>
  );

  return renderPage();
};

export default InventarioPage;

