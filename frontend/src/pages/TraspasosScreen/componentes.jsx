import React from 'react';
import {
  Alert, Badge, Box, Button, Chip, CircularProgress, Paper,
  Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tabs, Tab, Typography
} from '@mui/material';
import { commonSelectStyles, formatUbicacionDisplay, formatTallaColor, formatearUnidad, mostrarUnidadMedida } from './hooksYHelpers';

// ============================================================
// CHIP DE INFO (talla/color)
// ============================================================
export const StockInfoChip = ({ label, style = {}, color = 'default', variant = 'outlined', sx = {} }) => {
  if (!label) return null;
  return (
    <Chip
      label={label}
      color={color}
      variant={variant}
      size="small"
      sx={{ fontWeight: 600, ...style, ...sx }}
    />
  );
};

// ============================================================
// HEADER
// ============================================================
export const TraspasosHeader = ({ activeSection, onChangeSection, pendientesCount }) => (
  <Stack spacing={3}>
    <Typography variant="h4" component="h1" sx={{ textAlign: 'center', color: '#1a365d', fontWeight: 700, pb: 2, borderBottom: '3px solid #2c5282' }}>
      Traspaso entre Ubicaciones
    </Typography>
    <Paper elevation={1} sx={{ p: 2.5, borderRadius: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center" flexWrap="wrap" useFlexGap>
        <Button variant={activeSection === 'traspasos' ? 'contained' : 'outlined'} onClick={() => onChangeSection('traspasos')} sx={{ minWidth: 180, fontWeight: 700 }}>
          Traspasos
        </Button>
        <Badge badgeContent={pendientesCount || 0} color="error" invisible={!pendientesCount}>
          <Button variant={activeSection === 'verificacion' ? 'contained' : 'outlined'} onClick={() => onChangeSection('verificacion')} sx={{ minWidth: 180, fontWeight: 700 }}>
            Verificacion
          </Button>
        </Badge>
        <Button variant={activeSection === 'historial' ? 'contained' : 'outlined'} onClick={() => onChangeSection('historial')} sx={{ minWidth: 180, fontWeight: 700 }}>
          Historial
        </Button>
      </Stack>
    </Paper>
  </Stack>
);

// ============================================================
// TABS MODO
// ============================================================
export const TraspasosModeTabs = ({ activeTab, onChange }) => (
  <Paper elevation={1} sx={{ borderRadius: 3, overflow: 'hidden' }}>
    <Tabs value={activeTab} onChange={(_, v) => onChange(v)} variant="fullWidth">
      <Tab label="Por Articulo" value="articulo" />
      <Tab label="Por Ubicacion" value="ubicacion" />
    </Tabs>
  </Paper>
);

// ============================================================
// ESTADO (loading/error/info)
// ============================================================
export const TraspasosStateView = ({ type = 'info', title, message }) => {
  if (type === 'loading') {
    return (
      <Paper elevation={1} sx={{ p: 4, borderRadius: 3 }}>
        <Stack spacing={2} alignItems="center">
          <CircularProgress />
          <Typography variant="body1">{message || 'Cargando...'}</Typography>
        </Stack>
      </Paper>
    );
  }
  return (
    <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
      <Alert severity={type === 'error' ? 'error' : 'info'}>
        {title && <strong>{title}</strong>}
        {title && message ? ' ' : ''}
        {message}
      </Alert>
    </Paper>
  );
};

// ============================================================
// BUSCAR ARTÍCULO
// ============================================================
export const ArticuloSearchPanel = ({ loadOptions, onChange, articuloSeleccionado, AsyncSelect }) => (
  <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
    <Stack spacing={2}>
      <Typography variant="h6" sx={{ color: '#1a365d', fontWeight: 700 }}>Articulos con Stock</Typography>
      <Box>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>Buscar articulo:</Typography>
        <AsyncSelect
          cacheOptions
          defaultOptions={[]}
          loadOptions={loadOptions}
          onChange={onChange}
          placeholder="Escriba codigo o descripcion..."
          noOptionsMessage={({ inputValue }) => inputValue.length < 2 ? 'Escriba al menos 2 caracteres...' : 'No se encontraron articulos'}
          loadingMessage={() => 'Buscando...'}
          styles={commonSelectStyles}
          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        />
      </Box>
      {articuloSeleccionado && (
        <Paper variant="outlined" sx={{ p: 2, backgroundColor: 'rgba(66, 153, 225, 0.08)' }}>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            Articulo seleccionado: {articuloSeleccionado.DescripcionArticulo} ({articuloSeleccionado.CodigoArticulo})
          </Typography>
        </Paper>
      )}
    </Stack>
  </Paper>
);

// ============================================================
// SELECTOR ORIGEN
// ============================================================
export const OrigenSelectorCard = ({
  SelectComponent, opcionesAlmacenes, opcionesUbicacionesStock,
  almacenOrigen, grupoUnicoOrigen, onAlmacenChange, onUbicacionChange,
  getNombreAlmacen, ubicacionOrigen, unidadMedida, partida,
  tallaOrigen, colorOrigen, getColorStyle, stockDisponibleInfo, mostrarUnidadMedida: mostrarUnidad
}) => (
  <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
    <Stack spacing={2}>
      <Typography variant="h6" sx={{ color: '#1a365d', fontWeight: 700 }}>Origen</Typography>
      <Box>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>Almacen:</Typography>
        <SelectComponent
          value={opcionesAlmacenes.find(opt => opt.value === almacenOrigen) || null}
          onChange={onAlmacenChange}
          options={opcionesAlmacenes}
          placeholder="Seleccionar almacen..."
          isSearchable
          noOptionsMessage={() => 'No hay almacenes disponibles'}
          styles={commonSelectStyles}
          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        />
      </Box>
      <Box>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>Ubicacion y Variantes:</Typography>
        <SelectComponent
          value={opcionesUbicacionesStock.find(opt => opt.value === grupoUnicoOrigen) || null}
          onChange={onUbicacionChange}
          options={opcionesUbicacionesStock}
          placeholder="Seleccionar ubicacion y variante..."
          isSearchable
          isDisabled={!almacenOrigen}
          noOptionsMessage={() => 'No hay ubicaciones disponibles'}
          styles={commonSelectStyles}
          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        />
      </Box>
      {ubicacionOrigen && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Typography variant="body2">
              <strong>Unidad:</strong> {mostrarUnidad(unidadMedida)}
              {partida && <span>, <strong>Lote:</strong> {partida}</span>}
            </Typography>
            {(tallaOrigen || colorOrigen) && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2"><strong>Talla/Color:</strong></Typography>
                <StockInfoChip label={`${tallaOrigen || ''}${colorOrigen || ''}`} style={getColorStyle(colorOrigen)} />
              </Stack>
            )}
            {stockDisponibleInfo && (
              <Typography variant="body2">
                <strong>Stock disponible:</strong> {stockDisponibleInfo}
                {ubicacionOrigen === 'SIN-UBICACION' && <span className="sin-ubicacion-badge"> - Stock Sin Ubicación</span>}
              </Typography>
            )}
          </Stack>
        </Paper>
      )}
    </Stack>
  </Paper>
);

// ============================================================
// SELECTOR DESTINO
// ============================================================
export const DestinoSelectorCard = ({
  title = 'Destino', SelectComponent, opcionesAlmacenes, opcionesUbicacionesDestino,
  almacenDestino, ubicacionDestino, onAlmacenChange, onUbicacionChange,
  onUbicacionInputChange, onUbicacionMenuOpen, onUbicacionMenuScrollToBottom,
  cargandoUbicacionesDestino
}) => (
  <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
    <Stack spacing={2}>
      <Typography variant="h6" sx={{ color: '#1a365d', fontWeight: 700 }}>{title}</Typography>
      <Box>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>Almacen:</Typography>
        <SelectComponent
          value={opcionesAlmacenes.find(opt => opt.value === almacenDestino) || null}
          onChange={onAlmacenChange}
          options={opcionesAlmacenes}
          placeholder="Seleccionar almacen..."
          isSearchable
          noOptionsMessage={() => 'No hay almacenes disponibles'}
          styles={commonSelectStyles}
          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        />
      </Box>
      <Box>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>Ubicacion:</Typography>
        <SelectComponent
          value={
            opcionesUbicacionesDestino.find(opt => opt.value === ubicacionDestino) ||
            // ✅ Si la ubicación principal ya está seteada pero aún no está en las opciones
            // (porque la lista aún no se renderizó), mostrarla igualmente
            (ubicacionDestino ? { value: ubicacionDestino, label: ubicacionDestino } : null)
          }
          onChange={onUbicacionChange}
          onInputChange={onUbicacionInputChange}
          onMenuOpen={onUbicacionMenuOpen}
          onMenuScrollToBottom={onUbicacionMenuScrollToBottom}
          options={opcionesUbicacionesDestino}
          placeholder="Seleccionar ubicacion..."
          isSearchable
          isDisabled={!almacenDestino}
          isLoading={cargandoUbicacionesDestino}
          noOptionsMessage={() => 'No hay ubicaciones disponibles'}
          styles={commonSelectStyles}
          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        />
      </Box>
    </Stack>
  </Paper>
);

// ============================================================
// PANEL CANTIDAD
// ============================================================
export const CantidadPanel = ({ title = 'Cantidad', cantidad, onCantidadChange, stockInfo, buttonLabel, onSubmit, loading, max }) => (
  <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
    <Stack spacing={2}>
      <Typography variant="h6" sx={{ color: '#1a365d', fontWeight: 700 }}>{title}</Typography>
      <Box>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>Cantidad a traspasar:</Typography>
        <input
          type="number"
          value={cantidad}
          onChange={onCantidadChange}
          required
          min="1"
          step="any"
          max={max}
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem' }}
        />
        {stockInfo && <div className="stock-info"><strong>Stock disponible:</strong> {stockInfo}</div>}
      </Box>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={onSubmit} disabled={loading}>
          {loading ? 'Agregando...' : buttonLabel}
        </Button>
      </Stack>
    </Stack>
  </Paper>
);

// ============================================================
// LISTA UBICACIONES AGRUPADAS POR ALMACÉN (modo por ubicación)
// ============================================================
export const UbicacionesAgrupadasList = ({
  AsyncSelect, loadOptions, onAsyncChange, almacenes,
  almacenesExpandidos, ubicacionesCargadas, onToggleAlmacen, onSeleccionarUbicacion, loading
}) => (
  <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
    <Stack spacing={2.5}>
      <Typography variant="h6" sx={{ color: '#1a365d', fontWeight: 700 }}>Seleccionar Ubicacion de Origen</Typography>
      <Box>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>Buscar ubicacion:</Typography>
        <AsyncSelect
          cacheOptions
          defaultOptions={[]}
          loadOptions={loadOptions}
          onChange={onAsyncChange}
          placeholder="Escriba codigo de ubicacion..."
          noOptionsMessage={({ inputValue }) => inputValue.length < 2 ? 'Escriba al menos 2 caracteres...' : 'No se encontraron ubicaciones'}
          loadingMessage={() => 'Buscando...'}
          styles={commonSelectStyles}
          menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        />
      </Box>
      <div className="almacenes-container">
        {almacenes.map(almacen => (
          <div key={almacen.CodigoAlmacen} className="almacen-item">
            <div className="almacen-header" onClick={() => onToggleAlmacen(almacen.CodigoAlmacen)}>
              <span>{almacen.Almacen} ({almacen.CodigoAlmacen})</span>
              <span>{almacenesExpandidos[almacen.CodigoAlmacen] ? '▲' : '▼'}</span>
            </div>
            {almacenesExpandidos[almacen.CodigoAlmacen] && (
              <div className="ubicaciones-list">
                {loading ? (
                  <div className="cargando-ubicaciones">Cargando ubicaciones...</div>
                ) : (
                  ubicacionesCargadas[almacen.CodigoAlmacen]?.map((ubicacion, index) => (
                    <div
                      key={`${almacen.CodigoAlmacen}-${ubicacion.Ubicacion}-${index}`}
                      className={`ubicacion-item ${ubicacion.Ubicacion === 'SIN-UBICACION' ? 'sin-ubicacion-option' : ''}`}
                      onClick={() => onSeleccionarUbicacion(almacen.CodigoAlmacen, ubicacion.Ubicacion)}
                    >
                      <span className="ubicacion-codigo">{ubicacion.Ubicacion === 'SIN-UBICACION' ? '[SIN UBICACION]' : ubicacion.Ubicacion}</span>
                      <span className="ubicacion-stock">{ubicacion.CantidadArticulos} artículos</span>
                    </div>
                  )) || <div className="sin-ubicaciones">No hay ubicaciones disponibles</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Stack>
  </Paper>
);

// ============================================================
// TABLA ARTÍCULOS EN UBICACIÓN
// ============================================================
export const ArticulosUbicacionTable = ({
  articulosUbicacion, ubicacionSeleccionada, articuloUbicacionSeleccionado,
  setArticuloUbicacionSeleccionado, getColorStyle, paginationUbicacion, onPageChange
}) => (
  <Stack spacing={2}>
    <TableContainer component={Paper} elevation={1} sx={{ borderRadius: 3 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Codigo</TableCell>
            <TableCell>Descripcion</TableCell>
            <TableCell>Stock</TableCell>
            <TableCell>Unidad</TableCell>
            <TableCell>Talla y Color</TableCell>
            <TableCell align="right">Acciones</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {articulosUbicacion.map((articulo, index) => {
            const uniqueKey = [articulo.CodigoArticulo, ubicacionSeleccionada?.ubicacion, articulo.UnidadMedida, articulo.Partida || '', articulo.Talla || '', articulo.CodigoColor_ || '', index].join('|');
            const tallaColor = formatTallaColor(articulo.Talla, articulo.CodigoColor_);
            const selected = articuloUbicacionSeleccionado?.uniqueKey === uniqueKey;
            return (
              <TableRow key={uniqueKey} hover selected={selected} onClick={() => setArticuloUbicacionSeleccionado({ ...articulo, uniqueKey, tallaColorDisplay: tallaColor })} sx={{ cursor: 'pointer' }}>
                <TableCell>{articulo.CodigoArticulo}</TableCell>
                <TableCell>{articulo.DescripcionArticulo}</TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    <Typography variant="body2">{formatearUnidad(articulo.Cantidad, articulo.UnidadMedida)}</Typography>
                    {articulo.UnidadMedida !== articulo.UnidadBase && articulo.FactorConversion && (
                      <Typography variant="caption" color="text.secondary">({formatearUnidad(articulo.Cantidad * articulo.FactorConversion, articulo.UnidadBase)})</Typography>
                    )}
                  </Stack>
                </TableCell>
                <TableCell>{mostrarUnidadMedida(articulo.UnidadMedida)}</TableCell>
                <TableCell>
                  {tallaColor && <StockInfoChip label={tallaColor} style={getColorStyle(articulo.CodigoColor_)} sx={{ width: 'fit-content' }} />}
                  {articulo.NombreColor && <Typography variant="caption" color="text.secondary">{articulo.NombreColor}</Typography>}
                </TableCell>
                <TableCell align="right">
                  <Button size="small" variant={selected ? 'contained' : 'outlined'}>Seleccionar</Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
    {paginationUbicacion.totalPages > 1 && (
      <Paper elevation={1} sx={{ p: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems="center">
          <Button disabled={paginationUbicacion.page === 1} onClick={() => onPageChange(paginationUbicacion.page - 1)}>Anterior</Button>
          <Typography variant="body2">Pagina {paginationUbicacion.page} de {Math.ceil(paginationUbicacion.total / paginationUbicacion.pageSize)}</Typography>
          <Button disabled={paginationUbicacion.page * paginationUbicacion.pageSize >= paginationUbicacion.total} onClick={() => onPageChange(paginationUbicacion.page + 1)}>Siguiente</Button>
        </Stack>
      </Paper>
    )}
  </Stack>
);
