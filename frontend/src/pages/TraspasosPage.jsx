import '../styles/TraspasosPage.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import API from '../helpers/api';
import { getAuthHeader } from '../helpers/authHelper';
import { v4 as uuidv4 } from 'uuid';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import { Alert, Badge, Box, Button, Chip, CircularProgress, Paper, Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Typography } from '@mui/material';

const TraspasosHeader = ({
  activeSection,
  onChangeSection,
  pendientesCount
}) => {
  return (
    <Stack spacing={3}>
      <Typography
        variant="h4"
        component="h1"
        sx={{
          textAlign: 'center',
          color: '#1a365d',
          fontWeight: 700,
          pb: 2,
          borderBottom: '3px solid #2c5282'
        }}
      >
        Traspaso entre Ubicaciones
      </Typography>

      <Paper elevation={1} sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center" flexWrap="wrap" useFlexGap>
          <Button
            variant={activeSection === 'traspasos' ? 'contained' : 'outlined'}
            onClick={() => onChangeSection('traspasos')}
            sx={{ minWidth: 180, fontWeight: 700 }}
          >
            Traspasos
          </Button>

          <Badge badgeContent={pendientesCount || 0} color="error" invisible={!pendientesCount}>
            <Button
              variant={activeSection === 'verificacion' ? 'contained' : 'outlined'}
              onClick={() => onChangeSection('verificacion')}
              sx={{ minWidth: 180, fontWeight: 700 }}
            >
              Verificacion
            </Button>
          </Badge>

          <Button
            variant={activeSection === 'historial' ? 'contained' : 'outlined'}
            onClick={() => onChangeSection('historial')}
            sx={{ minWidth: 180, fontWeight: 700 }}
          >
            Historial
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
};


const TraspasosModeTabs = ({ activeTab, onChange }) => {
  return (
    <Paper elevation={1} sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Tabs
        value={activeTab}
        onChange={(_, value) => onChange(value)}
        variant="fullWidth"
      >
        <Tab label="Por Articulo" value="articulo" />
        <Tab label="Por Ubicacion" value="ubicacion" />
      </Tabs>
    </Paper>
  );
};


const ArticuloSearchPanel = ({
  loadOptions,
  onChange,
  articuloSeleccionado,
  AsyncSelect
}) => {
  return (
    <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6" sx={{ color: '#1a365d', fontWeight: 700 }}>
          Articulos con Stock
        </Typography>

        <Box>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>
            Buscar articulo:
          </Typography>
          <div className="search-container">
            <AsyncSelect
              cacheOptions
              defaultOptions={[]}
              loadOptions={loadOptions}
              onChange={onChange}
              placeholder="Escriba codigo o descripcion..."
              noOptionsMessage={({ inputValue }) =>
                inputValue.length < 2
                  ? 'Escriba al menos 2 caracteres...'
                  : 'No se encontraron articulos'
              }
              loadingMessage={() => 'Buscando...'}
              styles={{
                control: (base) => ({
                  ...base,
                  minHeight: '44px',
                  borderColor: '#ddd',
                  '&:hover': {
                    borderColor: '#aaa'
                  }
                }),
                menu: (base) => ({
                  ...base,
                  zIndex: 9999
                })
              }}
            />
          </div>
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
};


const StockInfoChip = ({ label, style = {}, color = 'default', variant = 'outlined', sx = {} }) => {
  if (!label) {
    return null;
  }

  return (
    <Chip
      label={label}
      color={color}
      variant={variant}
      size="small"
      sx={{
        fontWeight: 600,
        ...style,
        ...sx
      }}
    />
  );
};


const OrigenSelectorCard = ({
  SelectComponent,
  opcionesAlmacenes,
  opcionesUbicacionesStock,
  almacenOrigen,
  grupoUnicoOrigen,
  onAlmacenChange,
  onUbicacionChange,
  getNombreAlmacen,
  ubicacionOrigen,
  unidadMedida,
  partida,
  tallaOrigen,
  colorOrigen,
  getColorStyle,
  stockDisponibleInfo,
  mostrarUnidadMedida
}) => {
  return (
    <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6" sx={{ color: '#1a365d', fontWeight: 700 }}>
          Origen
        </Typography>

        <Box>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>
            Almacen:
          </Typography>
          <SelectComponent
            className="react-select-container"
            classNamePrefix="react-select"
            value={opcionesAlmacenes.find((opt) => opt.value === almacenOrigen) || null}
            onChange={onAlmacenChange}
            options={opcionesAlmacenes}
            placeholder="Seleccionar almacen..."
            isSearchable
            noOptionsMessage={() => 'No hay almacenes disponibles'}
          />
        </Box>

        <Box>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>
            Ubicacion y Variantes:
          </Typography>
          <SelectComponent
            className="react-select-container"
            classNamePrefix="react-select"
            value={opcionesUbicacionesStock.find((opt) => opt.value === grupoUnicoOrigen) || null}
            onChange={onUbicacionChange}
            options={opcionesUbicacionesStock}
            placeholder="Seleccionar ubicacion y variante..."
            isSearchable
            isDisabled={!almacenOrigen}
            noOptionsMessage={() => 'No hay ubicaciones disponibles'}
            filterOption={(option, inputValue) => {
              if (!inputValue) return true;
              return option.label.toLowerCase().includes(inputValue.toLowerCase());
            }}
          />
        </Box>

        {ubicacionOrigen && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography variant="body2">
                <strong>Unidad seleccionada:</strong> {mostrarUnidadMedida(unidadMedida)}
                {partida && <span>, <strong>Lote:</strong> {partida}</span>}
              </Typography>

              {(tallaOrigen || colorOrigen) && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2">
                    <strong>Talla/Color:</strong>
                  </Typography>
                  <StockInfoChip
                    label={`${tallaOrigen || ''}${colorOrigen || ''}`}
                    style={getColorStyle(colorOrigen)}
                  />
                </Stack>
              )}

              {stockDisponibleInfo && (
                <Typography variant="body2">
                  <strong>Stock disponible:</strong> {stockDisponibleInfo}
                  {ubicacionOrigen === 'SIN-UBICACION' && (
                    <span className="sin-ubicacion-badge"> - Stock Sin Ubicación</span>
                  )}
                </Typography>
              )}
            </Stack>
          </Paper>
        )}
      </Stack>
    </Paper>
  );
};


const DestinoSelectorCard = ({
  title = 'Destino',
  SelectComponent,
  opcionesAlmacenes,
  opcionesUbicacionesDestino,
  almacenDestino,
  ubicacionDestino,
  onAlmacenChange,
  onUbicacionChange,
  onUbicacionInputChange,
  onUbicacionMenuOpen,
  onUbicacionMenuScrollToBottom,
  cargandoUbicacionesDestino
}) => {
  return (
    <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6" sx={{ color: '#1a365d', fontWeight: 700 }}>
          {title}
        </Typography>

        <Box>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>
            Almacen:
          </Typography>
          <SelectComponent
            className="react-select-container"
            classNamePrefix="react-select"
            value={opcionesAlmacenes.find((opt) => opt.value === almacenDestino) || null}
            onChange={onAlmacenChange}
            options={opcionesAlmacenes}
            placeholder="Seleccionar almacen..."
            isSearchable
            noOptionsMessage={() => 'No hay almacenes disponibles'}
          />
        </Box>

        <Box>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>
            Ubicacion:
          </Typography>
          <SelectComponent
            className="react-select-container"
            classNamePrefix="react-select"
            value={opcionesUbicacionesDestino.find((opt) => opt.value === ubicacionDestino) || null}
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
          />
        </Box>
      </Stack>
    </Paper>
  );
};


const CantidadPanel = ({
  title = 'Cantidad',
  cantidad,
  onCantidadChange,
  stockInfo,
  buttonLabel,
  onSubmit,
  loading,
  max
}) => {
  return (
    <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6" sx={{ color: '#1a365d', fontWeight: 700 }}>
          {title}
        </Typography>

        <Box>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>
            Cantidad a traspasar:
          </Typography>
          <input
            className="form-control-enhanced"
            type="number"
            value={cantidad}
            onChange={onCantidadChange}
            required
            min="1"
            step="any"
            max={max}
          />
          {stockInfo && (
            <div className="stock-info">
              <strong>Stock disponible:</strong> {stockInfo}
            </div>
          )}
        </Box>

        <Stack direction="row" justifyContent="flex-end">
          <Button variant="contained" onClick={onSubmit} disabled={loading}>
            {loading ? 'Agregando...' : buttonLabel}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};


const UbicacionesAgrupadasList = ({
  AsyncSelect,
  loadOptions,
  onAsyncChange,
  almacenes,
  almacenesExpandidos,
  ubicacionesCargadas,
  onToggleAlmacen,
  onSeleccionarUbicacion,
  loading
}) => {
  return (
    <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
      <Stack spacing={2.5}>
        <Typography variant="h6" sx={{ color: '#1a365d', fontWeight: 700 }}>
          Seleccionar Ubicacion de Origen
        </Typography>

        <Box>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600, color: '#2d3748' }}>
            Buscar ubicacion:
          </Typography>
          <AsyncSelect
            cacheOptions
            defaultOptions={[]}
            loadOptions={loadOptions}
            onChange={onAsyncChange}
            placeholder="Escriba codigo de ubicacion..."
            noOptionsMessage={({ inputValue }) =>
              inputValue.length < 2
                ? 'Escriba al menos 2 caracteres...'
                : 'No se encontraron ubicaciones'
            }
            loadingMessage={() => 'Buscando...'}
            styles={{
              control: (base) => ({
                ...base,
                minHeight: '44px',
                borderColor: '#ddd',
                '&:hover': {
                  borderColor: '#aaa'
                }
              }),
              menu: (base) => ({
                ...base,
                zIndex: 9999
              })
            }}
          />
        </Box>

        <div className="almacenes-container">
          {almacenes.map((almacen) => (
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
                        <span className="ubicacion-codigo">
                          {ubicacion.Ubicacion === 'SIN-UBICACION' ? '[SIN UBICACION]' : ubicacion.Ubicacion}
                        </span>
                        <span className="ubicacion-stock">
                          {ubicacion.CantidadArticulos} artículos
                        </span>
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
};


const TraspasosStateView = ({ type = 'info', title, message }) => {
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


const ArticulosUbicacionTable = ({
  articulosUbicacion,
  ubicacionSeleccionada,
  articuloUbicacionSeleccionado,
  setArticuloUbicacionSeleccionado,
  formatTallaColor,
  getColorStyle,
  formatearUnidad,
  mostrarUnidadMedida,
  paginationUbicacion,
  onPageChange
}) => {
  return (
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
              const uniqueKey = [
                articulo.CodigoArticulo,
                ubicacionSeleccionada.ubicacion,
                articulo.UnidadMedida,
                articulo.Partida || '',
                articulo.Talla || '',
                articulo.CodigoColor_ || '',
                index
              ].join('|');

              const tallaColor = formatTallaColor(articulo.Talla, articulo.CodigoColor_);
              const selected = articuloUbicacionSeleccionado?.uniqueKey === uniqueKey;

              return (
                <TableRow
                  key={uniqueKey}
                  hover
                  selected={selected}
                  onClick={() =>
                    setArticuloUbicacionSeleccionado({
                      ...articulo,
                      uniqueKey,
                      tallaColorDisplay: tallaColor
                    })
                  }
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{articulo.CodigoArticulo}</TableCell>
                  <TableCell>{articulo.DescripcionArticulo}</TableCell>
                  <TableCell>
                    <Stack spacing={0.5}>
                      <Typography variant="body2">
                        {formatearUnidad(articulo.Cantidad, articulo.UnidadMedida)}
                      </Typography>
                      {articulo.UnidadMedida !== articulo.UnidadBase && articulo.FactorConversion && (
                        <Typography variant="caption" color="text.secondary">
                          ({formatearUnidad(articulo.Cantidad * articulo.FactorConversion, articulo.UnidadBase)})
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>{mostrarUnidadMedida(articulo.UnidadMedida)}</TableCell>
                  <TableCell>
                    <Stack spacing={0.5}>
                      {tallaColor && (
                        <StockInfoChip
                          label={tallaColor}
                          style={getColorStyle(articulo.CodigoColor_)}
                          sx={{ width: 'fit-content' }}
                        />
                      )}
                      {articulo.NombreColor && (
                        <Typography variant="caption" color="text.secondary">
                          {articulo.NombreColor}
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant={selected ? 'contained' : 'outlined'}>
                      Seleccionar
                    </Button>
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
            <Button
              disabled={paginationUbicacion.page === 1}
              onClick={() => onPageChange(paginationUbicacion.page - 1)}
            >
              Anterior
            </Button>
            <Typography variant="body2">
              Pagina {paginationUbicacion.page} de {Math.ceil(paginationUbicacion.total / paginationUbicacion.pageSize)}
            </Typography>
            <Button
              disabled={paginationUbicacion.page * paginationUbicacion.pageSize >= paginationUbicacion.total}
              onClick={() => onPageChange(paginationUbicacion.page + 1)}
            >
              Siguiente
            </Button>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
};


const TraspasosPendientesTable = ({
  traspasosPendientes,
  getNombreAlmacen,
  formatearUnidad,
  mostrarUnidadMedida,
  getColorStyle,
  onEliminar,
  onConfirmar,
  onVolver,
  loading
}) => {
  return (
    <Stack spacing={2.5}>
      <TableContainer component={Paper} elevation={1} sx={{ borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Articulo</TableCell>
              <TableCell>Origen</TableCell>
              <TableCell>Destino</TableCell>
              <TableCell>Cantidad</TableCell>
              <TableCell>Variantes</TableCell>
              <TableCell align="right">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {traspasosPendientes.map((traspaso) => (
              <TableRow key={traspaso.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {traspaso.articulo.CodigoArticulo}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {traspaso.articulo.DescripcionArticulo}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{getNombreAlmacen(traspaso.origen.almacen)}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {traspaso.origen.esSinUbicacion ? '[SIN UBICACION]' : traspaso.origen.ubicacion}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{getNombreAlmacen(traspaso.destino.almacen)}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {traspaso.destino.ubicacion}
                  </Typography>
                </TableCell>
                <TableCell>
                  {formatearUnidad(traspaso.cantidad, mostrarUnidadMedida(traspaso.unidadMedida))}
                </TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    {traspaso.partida && (
                      <Typography variant="caption">
                        <strong>Lote:</strong> {traspaso.partida}
                      </Typography>
                    )}
                    {(traspaso.talla || traspaso.color) && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="caption">
                          <strong>Talla/Color:</strong>
                        </Typography>
                        <StockInfoChip
                          label={`${traspaso.talla || ''}${traspaso.color || ''}`}
                          style={getColorStyle(traspaso.color)}
                        />
                      </Stack>
                    )}
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Button color="error" variant="outlined" size="small" onClick={() => onEliminar(traspaso.id)}>
                    Eliminar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
        <Button variant="contained" onClick={onConfirmar} disabled={loading}>
          {loading ? 'Confirmando...' : 'Confirmar Todos los Traspasos'}
        </Button>
        <Button variant="outlined" onClick={onVolver}>
          Volver a Traspasos
        </Button>
      </Stack>
    </Stack>
  );
};


const HistorialTraspasosTable = ({
  historial,
  formatFecha,
  formatearUnidad,
  mostrarUnidadMedida,
  getColorStyle
}) => {
  return (
    <TableContainer component={Paper} elevation={1} sx={{ borderRadius: 3 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Fecha</TableCell>
            <TableCell>Articulo</TableCell>
            <TableCell>Origen</TableCell>
            <TableCell>Destino</TableCell>
            <TableCell>Cantidad</TableCell>
            <TableCell>Variantes</TableCell>
            <TableCell>Usuario</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {historial.map((item, index) => {
            const usuario = item.Usuario || 'Desconocido';
            const tallaColor = item.CodigoTalla01_ && item.CodigoColor_
              ? `${item.CodigoTalla01_}${item.CodigoColor_}`
              : '';

            return (
              <TableRow key={`${item.FechaRegistro}-${index}-${item.CodigoArticulo}`} hover>
                <TableCell>{item.FechaFormateada || formatFecha(item.FechaRegistro)}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {item.CodigoArticulo}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.DescripcionArticulo}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{item.OrigenAlmacen}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.OrigenUbicacion === 'SIN-UBICACION' ? '[SIN UBICACION]' : item.OrigenUbicacion}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{item.DestinoAlmacen}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.DestinoUbicacion}
                  </Typography>
                </TableCell>
                <TableCell>
                  {formatearUnidad(item.Cantidad, mostrarUnidadMedida(item.UnidadMedida))}
                </TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    {item.Partida && (
                      <Typography variant="caption">
                        <strong>Lote:</strong> {item.Partida}
                      </Typography>
                    )}
                    {tallaColor && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="caption">
                          <strong>Talla/Color:</strong>
                        </Typography>
                        <StockInfoChip
                          label={tallaColor}
                          style={getColorStyle(item.CodigoColor_)}
                        />
                      </Stack>
                    )}
                  </Stack>
                </TableCell>
                <TableCell>{usuario}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};


const TraspasosPage = () => {
  // =========== ESTADOS ===========
  const [activeSection, setActiveSection] = useState('traspasos');
  const [activeTab, setActiveTab] = useState('articulo');
  const [loading, setLoading] = useState(false);
  const [almacenes, setAlmacenes] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [traspasosPendientes, setTraspasosPendientes] = useState([]);
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [articulosConStock, setArticulosConStock] = useState([]);
  const [pagination, setPagination] = useState({ 
    page: 1, 
    pageSize: 15,
    total: 0, 
    totalPages: 1 
  });
  const [loadingArticulos, setLoadingArticulos] = useState(false);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState(null);
  const [stockDisponible, setStockDisponible] = useState([]);
  const [almacenOrigen, setAlmacenOrigen] = useState('');
  const [ubicacionOrigen, setUbicacionOrigen] = useState('');
  const [almacenDestino, setAlmacenDestino] = useState('');
  const [ubicacionDestino, setUbicacionDestino] = useState('');
  const [ubicacionDestinoBusqueda, setUbicacionDestinoBusqueda] = useState('');
  const [cargandoUbicacionesDestino, setCargandoUbicacionesDestino] = useState(false);
  const [ubicacionesDestinoHasMore, setUbicacionesDestinoHasMore] = useState(false);
  const [ubicacionesDestinoNextOffset, setUbicacionesDestinoNextOffset] = useState(0);
  const [cantidad, setCantidad] = useState('');
  const [unidadMedida, setUnidadMedida] = useState('');
  const [partida, setPartida] = useState('');
  const [allArticulosLoaded, setAllArticulosLoaded] = useState(false);
  const [ubicacionesAgrupadas, setUbicacionesAgrupadas] = useState([]);
  const [ubicacionesFiltradas, setUbicacionesFiltradas] = useState([]);
  const [almacenExpandido, setAlmacenExpandido] = useState(null);
  const [ubicacionSeleccionada, setUbicacionSeleccionada] = useState(null);
  const [articulosUbicacion, setArticulosUbicacion] = useState([]);
  const [paginationUbicacion, setPaginationUbicacion] = useState({ 
    page: 1, 
    pageSize: 15,
    total: 0 
  });
  const [articuloUbicacionSeleccionado, setArticuloUbicacionSeleccionado] = useState(null);
  const [vistaUbicacion, setVistaUbicacion] = useState('seleccion');
  const [grupoUnicoOrigen, setGrupoUnicoOrigen] = useState('');
  const [busquedaUbicacion, setBusquedaUbicacion] = useState('');
  const [tallaOrigen, setTallaOrigen] = useState('');
  const [colorOrigen, setColorOrigen] = useState('');
  const [stockDisponibleInfo, setStockDisponibleInfo] = useState('');
  const [tipoUnidadMedida, setTipoUnidadMedida] = useState('');
  const [almacenesExpandidos, setAlmacenesExpandidos] = useState({});
  const [ubicacionesCargadas, setUbicacionesCargadas] = useState({});
  const [cargandoBusquedaUbicacion, setCargandoBusquedaUbicacion] = useState(false);
  const [ubicacionesBuscadas, setUbicacionesBuscadas] = useState([]);

  const searchTimer = useRef(null);
  const searchRef = useRef(null);
  const listaRef = useRef(null);
  const ubicacionesDestinoRequestRef = useRef(0);
  const UBICACIONES_DESTINO_BATCH_SIZE = 50;

  // =========== FUNCIONES DE UTILIDAD ===========
  const formatearUnidad = (cantidad, unidad) => {
    let cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum)) {
      cantidadNum = 0;
    }
    
    const esNegativo = cantidadNum < 0;
    const cantidadAbs = Math.abs(cantidadNum);
    
    let unidadStr = String(unidad || '');
    if (!unidadStr.trim()) {
      unidadStr = 'unidad';
    }
    
    let cantidadFormateada = cantidadAbs;
    if (!Number.isInteger(cantidadAbs)) {
      cantidadFormateada = parseFloat(cantidadAbs.toFixed(2));
    }

    const unidadesInvariables = ['kg', 'm', 'cm', 'mm', 'l', 'ml', 'g', 'mg', 'm2', 'm3', 'barra', 'metro'];
    
    const unidadLower = unidadStr.toLowerCase();
    
    if (unidadesInvariables.includes(unidadLower)) {
      return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidadStr}`;
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
      'paquete': 'paquetes'
    };

    if (cantidadFormateada === 1) {
      if (unidadLower === 'unidad' || unidadLower === 'unidades') {
        return `${esNegativo ? '-' : ''}1 unidad`;
      }
      return `${esNegativo ? '-' : ''}1 ${unidadStr}`;
    } else {
      if (unidadLower === 'unidad' || unidadLower === 'unidades') {
        return `${esNegativo ? '-' : ''}${cantidadFormateada} unidades`;
      }
      
      if (pluralesIrregulares[unidadLower]) {
        return `${esNegativo ? '-' : ''}${cantidadFormateada} ${pluralesIrregulares[unidadLower]}`;
      }
      
      const ultimaLetra = unidadStr.charAt(unidadStr.length - 1);
      const penultimaLetra = unidadStr.charAt(unidadStr.length - 2);
      
      if (['a', 'e', 'i', 'o', 'u'].includes(ultimaLetra)) {
        return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidadStr}s`;
      } else {
        return `${esNegativo ? '-' : ''}${cantidadFormateada} ${unidadStr}es`;
      }
    }
  };

  const formatCantidad = (valor) => {
    const num = parseFloat(valor);
    return isNaN(num) ? '0' : num.toLocaleString('es-ES', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  const normalizarUnidadMedida = (unidad) => {
    if (!unidad || unidad === 'unidades' || unidad.trim() === '') {
      return '';
    }
    return unidad;
  };

  const mostrarUnidadMedida = (unidad) => {
    if (!unidad || unidad === '') {
      return 'unidades';
    }
    return unidad;
  };

  const getCantidadBase = (item) => {
    const cantidadBase = parseFloat(item?.CantidadBase);
    if (!isNaN(cantidadBase)) {
      return cantidadBase;
    }

    const cantidad = parseFloat(item?.Cantidad);
    const factorConversion = parseFloat(item?.FactorConversion);
    const unidadMedida = String(item?.UnidadMedida || '').trim();
    const unidadAlternativa = String(item?.UnidadAlternativa || '').trim();

    if (
      unidadMedida &&
      unidadAlternativa &&
      unidadMedida === unidadAlternativa &&
      !isNaN(cantidad) &&
      !isNaN(factorConversion) &&
      factorConversion > 0
    ) {
      return cantidad * factorConversion;
    }

    return isNaN(cantidad) ? 0 : cantidad;
  };

  const formatStockDisponible = (item) => {
    const cantidad = parseFloat(item?.Cantidad || 0);
    const unidad = item?.UnidadMedida || '';
    const unidadBase = item?.UnidadBase || '';
    const cantidadBase = getCantidadBase(item);

    if (unidadBase && unidad && unidad !== unidadBase) {
      return `${formatearUnidad(cantidad, unidad)} (${formatearUnidad(cantidadBase, unidadBase)})`;
    }

    return formatearUnidad(cantidad, unidad);
  };

  const getNombreAlmacen = (codigo) => {
    if (!codigo || codigo === 'undefined') return 'Almacén no disponible';
    if (codigo === 'SIN-UBICACION') return 'Stock Sin Ubicación';
    
    const almacen = almacenes.find(a => a.CodigoAlmacen === codigo);
    return almacen ? `${almacen.Almacen} (${codigo})` : `${codigo}`;
  };

  const formatUbicacionDisplay = (ubicacion, esSinUbicacion) => {
    if (esSinUbicacion || ubicacion === 'SIN-UBICACION') {
      return 'Stock Sin Ubicación';
    }
    return ubicacion;
  };

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

  const formatTallaColor = (talla, colorCode) => {
    if (!talla && !colorCode) return null;
    let display = '';
    if (talla) display += talla;
    if (colorCode) display += colorCode;
    return display;
  };

  // =========== FUNCIONES ASÍNCRONAS ===========
  const cargarOpcionesArticulos = async (inputValue) => {
    if (!inputValue || inputValue.length < 2) {
      return [];
    }

    try {
      const headers = getAuthHeader();
      const response = await API.get('/buscar-articulos', {
        headers,
        params: { termino: inputValue }
      });
      
      const articulos = Array.isArray(response.data) ? response.data : [];
      
      return articulos.map(articulo => ({
        value: articulo.CodigoArticulo || '',
        label: `${articulo.CodigoArticulo || ''} - ${articulo.DescripcionArticulo || ''}`,
        data: articulo
      }));
    } catch (error) {
      console.error('Error buscando artículos:', error);
      return [];
    }
  };

  const cargarOpcionesUbicaciones = async (inputValue) => {
    if (!inputValue || inputValue.length < 2) {
      return [];
    }

    try {
      const headers = getAuthHeader();
      const response = await API.get('/buscar-ubicaciones', {
        headers,
        params: { termino: inputValue }
      });
      
      let resultados = response.data.map(ubicacion => ({
        value: `${ubicacion.CodigoAlmacen}|${ubicacion.Ubicacion}`,
        label: `${getNombreAlmacen(ubicacion.CodigoAlmacen)} → ${formatUbicacionDisplay(ubicacion.Ubicacion, ubicacion.Ubicacion === 'SIN-UBICACION')} (${ubicacion.CantidadArticulos} artículos)`,
        data: ubicacion
      }));

      if (inputValue.toUpperCase().includes('SIN') || inputValue.toUpperCase().includes('UBICACION')) {
        resultados.unshift({
          value: 'TODOS|SIN-UBICACION',
          label: 'Stock Sin Ubicación (Varios artículos)',
          data: {
            CodigoAlmacen: 'TODOS',
            NombreAlmacen: 'Stock Sin Ubicación',
            Ubicacion: 'SIN-UBICACION',
            DescripcionUbicacion: 'Stock sin ubicación asignada',
            CantidadArticulos: 'Varios'
          }
        });
      }

      return resultados;
    } catch (error) {
      console.error('Error buscando ubicaciones:', error);
      return [];
    }
  };

  const cargarStockAlternativo = async () => {
    try {
      const headers = getAuthHeader();
      
      // Usar el endpoint específico para traspasos
      const response = await API.get(
        `/traspasos/stock-por-articulo`,
        { 
          headers,
          params: { codigoArticulo: articuloSeleccionado.CodigoArticulo }
        }
      );
      
      const stockData = response.data;
      
      console.log('✅ [TRASPASOS] Datos de stock recibidos:', stockData);
      
      const stockNormalizado = stockData.map(item => ({
        CodigoAlmacen: item.CodigoAlmacen,
        NombreAlmacen: item.NombreAlmacen,
        Ubicacion: item.Ubicacion,
        UbicacionPrincipal: item.UbicacionPrincipal || '',
        DescripcionUbicacion: item.DescripcionUbicacion,
        Cantidad: item.Cantidad,
        UnidadMedida: item.UnidadStock,
        TipoUnidadMedida_: item.UnidadStock,
        Partida: item.Partida || '',
        CodigoColor_: item.CodigoColor_ || '',
        Talla: item.CodigoTalla01_ || '',
        EsSinUbicacion: item.EsSinUbicacion === 1 || item.TipoStock === 'SIN_UBICACION',
        EsUbicacionPrincipal: item.EsUbicacionPrincipal === 1,
        GrupoUnico: item.ClaveUnica || '',
        UnidadBase: item.UnidadBase,
        UnidadAlternativa: item.UnidadAlternativa,
        FactorConversion: item.FactorConversion,
        CantidadBase: item.CantidadBase
      }));
      
      setStockDisponible(stockNormalizado);
      
      if (stockNormalizado.length > 0) {
        const ubicacionPorDefecto = stockNormalizado.find(item => item.EsUbicacionPrincipal) || stockNormalizado.reduce((max, item) => 
          getCantidadBase(item) > getCantidadBase(max) ? item : max
        );
        
        setAlmacenOrigen(ubicacionPorDefecto.CodigoAlmacen);
        setUbicacionOrigen(ubicacionPorDefecto.Ubicacion);
        setUnidadMedida(ubicacionPorDefecto.UnidadMedida);
        setTipoUnidadMedida(ubicacionPorDefecto.UnidadMedida);
        setPartida(ubicacionPorDefecto.Partida || '');
        setTallaOrigen(ubicacionPorDefecto.Talla || '');
        setColorOrigen(ubicacionPorDefecto.CodigoColor_ || '');
        setGrupoUnicoOrigen(ubicacionPorDefecto.GrupoUnico || '');
        setStockDisponibleInfo(formatStockDisponible(ubicacionPorDefecto));
      }
    } catch (error) {
      console.error('❌ [TRASPASOS] Error cargando stock:', error);
      
      // Fallback: intentar con el método anterior
      try {
        console.log('🔄 [TRASPASOS] Intentando fallback con ubicacionesMultiples...');
        const headers = getAuthHeader();
        
        const response = await API.post(
          '/ubicacionesMultiples',
          {
            articulos: [{ codigo: articuloSeleccionado.CodigoArticulo }]
          },
          { headers }
        );
        
        const stockData = response.data[articuloSeleccionado.CodigoArticulo] || [];
        
        const stockNormalizado = stockData.map(item => ({
          CodigoAlmacen: item.codigoAlmacen,
          NombreAlmacen: item.nombreAlmacen,
          Ubicacion: item.ubicacion,
          UbicacionPrincipal: '',
          DescripcionUbicacion: item.descripcionUbicacion,
          Cantidad: item.unidadSaldo,
          UnidadMedida: item.unidadMedida || 'unidades',
          TipoUnidadMedida_: item.unidadMedida || 'unidades',
          Partida: item.partida || '',
          CodigoColor_: item.codigoColor || '',
          Talla: item.codigoTalla || '',
          EsSinUbicacion: false,
          EsUbicacionPrincipal: false,
          GrupoUnico: `${item.codigoAlmacen}_${item.ubicacion}_${item.unidadMedida}_${item.partida || ''}_${item.codigoTalla || ''}_${item.codigoColor || ''}`
        }));
        
        setStockDisponible(stockNormalizado);
        
        if (stockNormalizado.length > 0) {
          const ubicacionPorDefecto = stockNormalizado.find(item => item.EsUbicacionPrincipal) || stockNormalizado.reduce((max, item) => 
            getCantidadBase(item) > getCantidadBase(max) ? item : max
          );
          
          setAlmacenOrigen(ubicacionPorDefecto.CodigoAlmacen);
          setUbicacionOrigen(ubicacionPorDefecto.Ubicacion);
          setUnidadMedida(ubicacionPorDefecto.UnidadMedida);
          setTipoUnidadMedida(ubicacionPorDefecto.UnidadMedida);
          setPartida(ubicacionPorDefecto.Partida || '');
          setTallaOrigen(ubicacionPorDefecto.Talla || '');
          setColorOrigen(ubicacionPorDefecto.CodigoColor_ || '');
          setGrupoUnicoOrigen(ubicacionPorDefecto.GrupoUnico || '');
          setStockDisponibleInfo(formatStockDisponible(ubicacionPorDefecto));
        }
      } catch (fallbackError) {
        console.error('❌ [TRASPASOS] Error en fallback:', fallbackError);
        alert(`Error cargando stock: No se pudo obtener información del stock para este artículo`);
        setStockDisponible([]);
      }
    }
  };

  const cargarStock = async () => {
    if (!articuloSeleccionado) return;
    
    try {
      await cargarStockAlternativo();
    } catch (error) {
      console.error('Error cargando stock:', error);
      setStockDisponible([]);
      alert(`Error cargando stock: No se pudo obtener información del stock para este artículo`);
    }
  };

  const cargarHistorial = useCallback(async () => {
    try {
      const headers = getAuthHeader();
      const response = await API.get('/historial-traspasos', { 
        headers,
        params: { page: 1, pageSize: 50 }
      });
      
      if (response.data && response.data.success) {
        setHistorial(response.data.traspasos || []);
      } else {
        setHistorial([]);
      }
    } catch (error) {
      console.error('Error cargando historial:', error);
      
      let errorMsg = 'Error al cargar historial';
      if (error.response?.data?.mensaje) {
        errorMsg += `: ${error.response.data.mensaje}`;
      } else if (error.message) {
        errorMsg += `: ${error.message}`;
      }
      
      alert(errorMsg);
      setHistorial([]);
    }
  }, []);

  const cargarUbicacionesConResiliencia = async (codigoAlmacen) => {
    try {
      const headers = getAuthHeader();
      const response = await API.get(
        `/ubicaciones-por-almacen/${codigoAlmacen}`,
        { headers, timeout: 10000 }
      );
      return response.data;
    } catch (error) {
      console.warn(`No se pudieron cargar las ubicaciones para ${codigoAlmacen}, usando valor por defecto`);
      return [
        { 
          Ubicacion: 'SIN-UBICACION', 
          DescripcionUbicacion: 'Stock sin ubicación asignada',
          CantidadArticulos: 'Varios'
        }
      ];
    }
  };

  const cargarArticulosUbicacion = useCallback(async (almacen, ubicacion, page = 1) => {
    try {
      const headers = getAuthHeader();
      const response = await API.get(
        `/stock/por-ubicacion`,
        { 
          headers,
          params: {
            codigoAlmacen: almacen,
            ubicacion: ubicacion,
            page,
            pageSize: paginationUbicacion.pageSize
          }
        }
      );
      
      const articulosConTipoUnidad = response.data.articulos.map(articulo => ({
        ...articulo,
        TipoUnidadMedida_: articulo.TipoUnidadMedida_ || articulo.UnidadMedida || 'unidades'
      }));
      
      setArticulosUbicacion(articulosConTipoUnidad);
      setPaginationUbicacion({
        page,
        pageSize: response.data.pageSize,
        total: response.data.total
      });
      
      setUbicacionSeleccionada({ almacen, ubicacion });
      setVistaUbicacion('detalle');
    } catch (error) {
      console.error('Error cargando artículos:', error);
      setArticulosUbicacion([]);
      alert(`Error cargando artículos: ${error.response?.data?.mensaje || error.message}`);
    }
  }, [paginationUbicacion.pageSize]);

  const cargarUbicacionesDestino = useCallback(async ({
    excluirUbicacion = '',
    search = '',
    offset = 0,
    append = false
  } = {}) => {
    if (!almacenDestino) return;
    
    try {
      const requestId = Date.now() + Math.random();
      ubicacionesDestinoRequestRef.current = requestId;
      setCargandoUbicacionesDestino(true);

      const headers = getAuthHeader();
      const response = await API.get(
        '/ubicaciones-completas',
        { 
          headers,
          params: {
            codigoAlmacen: almacenDestino,
            excluirUbicacion,
            incluirSinUbicacion: 'true',
            search,
            offset,
            limit: UBICACIONES_DESTINO_BATCH_SIZE
          }
        }
      );

      if (ubicacionesDestinoRequestRef.current !== requestId) {
        return;
      }

      const payload = response.data || {};
      const items = Array.isArray(payload.items) ? payload.items : [];

      setUbicacionesDestino((prev) => {
        if (!append) {
          return items;
        }

        const existentes = new Set(prev.map((ubicacion) => ubicacion.Ubicacion));
        const nuevas = items.filter((ubicacion) => !existentes.has(ubicacion.Ubicacion));
        return [...prev, ...nuevas];
      });
      setUbicacionesDestinoHasMore(Boolean(payload.hasMore));
      setUbicacionesDestinoNextOffset(Number(payload.nextOffset) || 0);
    } catch (error) {
      console.error('Error cargando ubicaciones destino:', error);
      setUbicacionesDestino([]);
      setUbicacionesDestinoHasMore(false);
      setUbicacionesDestinoNextOffset(0);
      alert(`Error cargando ubicaciones: ${error.response?.data?.mensaje || error.message}`);
    } finally {
      setCargandoUbicacionesDestino(false);
    }
  }, [almacenDestino, UBICACIONES_DESTINO_BATCH_SIZE]);

  const handleAlmacenDestinoChange = useCallback((selectedOption) => {
    if (!selectedOption) return;

    setAlmacenDestino(selectedOption.value);
    setUbicacionDestino('');
    setUbicacionDestinoBusqueda('');
    setUbicacionesDestino([]);
    setUbicacionesDestinoHasMore(false);
    setUbicacionesDestinoNextOffset(0);
  }, []);

  const handleUbicacionDestinoInputChange = useCallback((inputValue, meta) => {
    if (meta.action === 'input-change') {
      setUbicacionDestino('');
      setUbicacionDestinoBusqueda(inputValue);
    }

    if (meta.action === 'menu-close') {
      return '';
    }

    return inputValue;
  }, []);

  const handleUbicacionesDestinoMenuOpen = useCallback(() => {
    if (!almacenDestino || ubicacionesDestino.length > 0 || cargandoUbicacionesDestino) {
      return;
    }

    cargarUbicacionesDestino({
      search: ubicacionDestinoBusqueda.trim(),
      offset: 0,
      append: false
    });
  }, [
    almacenDestino,
    ubicacionesDestino.length,
    cargandoUbicacionesDestino,
    cargarUbicacionesDestino,
    ubicacionDestinoBusqueda
  ]);

  const handleUbicacionesDestinoScroll = useCallback(() => {
    if (!almacenDestino || cargandoUbicacionesDestino || !ubicacionesDestinoHasMore) {
      return;
    }

    cargarUbicacionesDestino({
      search: ubicacionDestinoBusqueda.trim(),
      offset: ubicacionesDestinoNextOffset,
      append: true
    });
  }, [
    almacenDestino,
    cargandoUbicacionesDestino,
    ubicacionesDestinoHasMore,
    ubicacionesDestinoNextOffset,
    ubicacionDestinoBusqueda,
    cargarUbicacionesDestino
  ]);

  // =========== useMemo HOOKS ===========
  const opcionesAlmacenes = useMemo(() => {
    return almacenes.map(almacen => ({
      value: almacen.CodigoAlmacen,
      label: `${almacen.Almacen} (${almacen.CodigoAlmacen})`
    }));
  }, [almacenes]);

  const opcionesUbicacionesDestino = useMemo(() => {
    return ubicacionesDestino.map(ubicacion => ({
      value: ubicacion.Ubicacion,
      label: `${ubicacion.Ubicacion === 'SIN-UBICACION' ? '[SIN UBICACIÓN] ' : ''}${formatUbicacionDisplay(ubicacion.Ubicacion, ubicacion.Ubicacion === 'SIN-UBICACION')}${ubicacion.DescripcionUbicacion ? ` - ${ubicacion.DescripcionUbicacion}` : ''}`,
      data: ubicacion
    }));
  }, [ubicacionesDestino, formatUbicacionDisplay]);

  const opcionesUbicacionesStock = useMemo(() => {
    if (!Array.isArray(stockDisponible) || !almacenOrigen) {
      return [];
    }
    
    return stockDisponible
      .filter(item => item && item.CodigoAlmacen === almacenOrigen)
      .map((item) => {
        if (!item) return null;
        
        const tallaColor = formatTallaColor(item.Talla || '', item.CodigoColor_ || '');
        let label = '';
        
        if (item.EsSinUbicacion) {
          label += '[SIN UBICACIÓN] ';
        }
        
        label += formatUbicacionDisplay(item.Ubicacion || '', item.EsSinUbicacion);
        
        if (tallaColor) {
          label += ` - ${tallaColor}`;
        }
        
        label += ` - ${formatStockDisponible(item)}`;
        
        if (item.Partida) {
          label += ` (Lote: ${item.Partida})`;
        }
        
        return {
          value: item.GrupoUnico || '',
          label: label,
          data: item
        };
      })
      .filter(option => option !== null);
  }, [stockDisponible, almacenOrigen, formatTallaColor, formatUbicacionDisplay, formatearUnidad]);

  // =========== useEffect HOOKS ===========
  useEffect(() => {
    const cargarDatosIniciales = async () => {
      try {
        const headers = getAuthHeader();
        const resAlmacenes = await API.get('/almacenes', { headers });
        setAlmacenes(resAlmacenes.data);
      } catch (error) {
        console.error('Error cargando datos iniciales:', error);
        alert(`Error cargando datos iniciales: ${error.response?.data?.mensaje || error.message}`);
      }
    };
    
    cargarDatosIniciales();
    
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setMostrarResultados(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (articuloSeleccionado) {
      cargarStock();
    }
  }, [articuloSeleccionado]);

  useEffect(() => {
    if (!almacenDestino) {
      setUbicacionesDestino([]);
      setUbicacionesDestinoHasMore(false);
      setUbicacionesDestinoNextOffset(0);
      return;
    }

    const timeoutId = setTimeout(() => {
      cargarUbicacionesDestino({
        search: ubicacionDestinoBusqueda.trim(),
        offset: 0,
        append: false
      });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [almacenDestino, ubicacionDestinoBusqueda, cargarUbicacionesDestino]);

  // =========== FUNCIONES DE INTERACCIÓN ===========
  const toggleAlmacenExpandido = async (codigoAlmacen) => {
    if (almacenesExpandidos[codigoAlmacen]) {
      setAlmacenesExpandidos(prev => ({ ...prev, [codigoAlmacen]: false }));
      return;
    }

    if (!ubicacionesCargadas[codigoAlmacen]) {
      try {
        setLoading(true);
        const ubicacionesData = await cargarUbicacionesConResiliencia(codigoAlmacen);
        
        const ubicacionesConSinUbicacion = [
          { 
            Ubicacion: 'SIN-UBICACION', 
            DescripcionUbicacion: 'Stock sin ubicación asignada',
            CantidadArticulos: 'Varios'
          },
          ...ubicacionesData
        ];
        
        setUbicacionesCargadas(prev => ({
          ...prev,
          [codigoAlmacen]: ubicacionesConSinUbicacion
        }));
      } catch (error) {
        console.error('Error cargando ubicaciones:', error);
        setUbicacionesCargadas(prev => ({
          ...prev,
          [codigoAlmacen]: [
            { 
              Ubicacion: 'SIN-UBICACION', 
              DescripcionUbicacion: 'Stock sin ubicación asignada',
              CantidadArticulos: 'Varios'
            }
          ]
        }));
      } finally {
        setLoading(false);
      }
    }

    setAlmacenesExpandidos(prev => ({ ...prev, [codigoAlmacen]: true }));
  };

  const seleccionarArticulo = (articulo) => {
    setArticuloSeleccionado(articulo);
    setTerminoBusqueda('');
    setMostrarResultados(false);
    setAllArticulosLoaded(false);
  };

  const cambiarAlmacenOrigen = (codigoAlmacen) => {
    setAlmacenOrigen(codigoAlmacen);
    setUbicacionOrigen('');
    setGrupoUnicoOrigen('');
    setUnidadMedida('');
    setTipoUnidadMedida('');
    setPartida('');
    setTallaOrigen('');
    setColorOrigen('');
    setStockDisponibleInfo('');
    
    const ubicacionesEnAlmacen = stockDisponible.filter(
      item => item.CodigoAlmacen === codigoAlmacen
    );
    
    if (ubicacionesEnAlmacen.length > 0) {
      const ubicacionPorDefecto = ubicacionesEnAlmacen.find(item => item.EsUbicacionPrincipal) || ubicacionesEnAlmacen.reduce((max, item) => 
        getCantidadBase(item) > getCantidadBase(max) ? item : max
      );
      
      setUbicacionOrigen(ubicacionPorDefecto.Ubicacion);
      setUnidadMedida(ubicacionPorDefecto.UnidadMedida);
      setTipoUnidadMedida(ubicacionPorDefecto.UnidadMedida);
      setPartida(ubicacionPorDefecto.Partida || '');
      setTallaOrigen(ubicacionPorDefecto.Talla || '');
      setColorOrigen(ubicacionPorDefecto.CodigoColor_ || '');
      setGrupoUnicoOrigen(ubicacionPorDefecto.GrupoUnico || '');
      setStockDisponibleInfo(formatStockDisponible(ubicacionPorDefecto));
    }
  };

  const seleccionarUbicacionOrigen = (item) => {
    setUbicacionOrigen(item.Ubicacion);
    setUnidadMedida(item.UnidadMedida);
    setTipoUnidadMedida(item.UnidadMedida);
    setPartida(item.Partida || '');
    setTallaOrigen(item.Talla || '');
    setColorOrigen(item.CodigoColor_ || '');
    setGrupoUnicoOrigen(item.GrupoUnico || '');
    setStockDisponibleInfo(formatStockDisponible(item));
    cargarUbicacionesDestino(item.Ubicacion);
  };

  const handleCantidadChange = (e) => {
    const value = e.target.value;
    if (/^\d*\.?\d*$/.test(value)) {
      setCantidad(value);
      
      if (articuloSeleccionado && stockDisponible.length > 0) {
        const stockItem = stockDisponible.find(
          item => item.CodigoAlmacen === almacenOrigen && 
                  item.Ubicacion === ubicacionOrigen &&
                  item.UnidadMedida === unidadMedida &&
                  (item.Partida || '') === partida &&
                  item.Talla === tallaOrigen &&
                  item.CodigoColor_ === colorOrigen
        );
        
        if (stockItem && parseFloat(value) > stockItem.Cantidad) {
          setCantidad(stockItem.Cantidad.toString());
        }
      }
    }
  };

  const agregarTraspasoArticulo = () => {
    const cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum)) {
      alert('La cantidad debe ser un número');
      return;
    }
    
    if (cantidadNum <= 0) {
      alert('La cantidad debe ser un número positivo');
      return;
    }

    if (!articuloSeleccionado || !almacenOrigen || !ubicacionOrigen || !almacenDestino || !ubicacionDestino || !cantidad) {
      alert('Complete todos los campos');
      return;
    }
    
    const stockItem = stockDisponible.find(
      item => item.CodigoAlmacen === almacenOrigen && 
              item.Ubicacion === ubicacionOrigen &&
              item.UnidadMedida === unidadMedida &&
              (item.Partida || '') === partida &&
              item.Talla === tallaOrigen &&
              item.CodigoColor_ === colorOrigen
    );
    
    if (!stockItem || cantidadNum > stockItem.Cantidad) {
      alert(`Cantidad supera el stock disponible (${stockItem?.Cantidad || 0})`);
      return;
    }
    
    const unidadMedidaNormalizada = normalizarUnidadMedida(unidadMedida);
    
    const nuevoTraspaso = {
      id: uuidv4(),
      articulo: {
        ...articuloSeleccionado,
        unidadMedida: unidadMedidaNormalizada,
        partida: partida,
        talla: tallaOrigen,
        color: colorOrigen
      },
      origen: {
        almacen: almacenOrigen,
        ubicacion: ubicacionOrigen,
        grupoUnico: grupoUnicoOrigen,
        esSinUbicacion: stockItem?.EsSinUbicacion || false
      },
      destino: {
        almacen: almacenDestino,
        ubicacion: ubicacionDestino
      },
      cantidad: cantidadNum,
      unidadMedida: unidadMedidaNormalizada,
      partida: partida,
      talla: tallaOrigen,
      color: colorOrigen
    };
    
    setTraspasosPendientes(prev => [...prev, nuevoTraspaso]);
    
    setArticuloSeleccionado(null);
    setTerminoBusqueda('');
    setCantidad('');
    setStockDisponibleInfo('');
  };

  const agregarTraspasoUbicacion = () => {
    const cantidadNum = parseFloat(cantidad);
    if (isNaN(cantidadNum)) {
      alert('La cantidad debe ser un número');
      return;
    }
    
    if (cantidadNum <= 0) {
      alert('La cantidad debe ser un número positivo');
      return;
    }

    if (!articuloUbicacionSeleccionado || !almacenDestino || !ubicacionDestino || !cantidad) {
      alert('Complete todos los campos');
      return;
    }
    
    if (cantidadNum > articuloUbicacionSeleccionado.Cantidad) {
      alert(`Cantidad supera el stock disponible (${articuloUbicacionSeleccionado.Cantidad})`);
      return;
    }
    
    const unidadMedidaNormalizada = normalizarUnidadMedida(articuloUbicacionSeleccionado.UnidadMedida);
    
    const nuevoTraspaso = {
      id: uuidv4(),
      articulo: {
        ...articuloUbicacionSeleccionado,
        unidadMedida: unidadMedidaNormalizada,
        partida: articuloUbicacionSeleccionado.Partida || '',
        talla: articuloUbicacionSeleccionado.Talla || '',
        color: articuloUbicacionSeleccionado.CodigoColor_ || ''
      },
      origen: {
        almacen: ubicacionSeleccionada.almacen,
        ubicacion: ubicacionSeleccionada.ubicacion,
        esSinUbicacion: ubicacionSeleccionada.ubicacion === 'SIN-UBICACION'
      },
      destino: {
        almacen: almacenDestino,
        ubicacion: ubicacionDestino
      },
      cantidad: cantidadNum,
      unidadMedida: unidadMedidaNormalizada,
      partida: articuloUbicacionSeleccionado.Partida || '',
      talla: articuloUbicacionSeleccionado.Talla || '',
      color: articuloUbicacionSeleccionado.CodigoColor_ || ''
    };
    
    setTraspasosPendientes(prev => [...prev, nuevoTraspaso]);
    
    setArticuloUbicacionSeleccionado(null);
    setCantidad('');
  };

  const confirmarTraspasos = async () => {
    if (traspasosPendientes.length === 0) {
      alert('No hay traspasos para confirmar');
      return;
    }
    
    setLoading(true);
    
    try {
      const headers = getAuthHeader();
      const user = JSON.parse(localStorage.getItem('user'));
      const empresa = user?.CodigoEmpresa;
      const ejercicio = new Date().getFullYear();
      
      const traspasosValidados = traspasosPendientes.map(traspaso => {
        const cantidadEntera = parseFloat(Number(traspaso.cantidad));
        
        const partida = traspaso.partida || '';
        const talla = traspaso.talla || '';
        const color = traspaso.color || '';
        
        const tipoUnidadMedida = normalizarUnidadMedida(traspaso.unidadMedida);
        
        const ubicacionOrigenFinal = traspaso.origen.esSinUbicacion ? 'SIN-UBICACION' : traspaso.origen.ubicacion;
        
        return {
          articulo: traspaso.articulo.CodigoArticulo,
          origenAlmacen: traspaso.origen.almacen,
          origenUbicacion: ubicacionOrigenFinal,
          destinoAlmacen: traspaso.destino.almacen,
          destinoUbicacion: traspaso.destino.ubicacion,
          cantidad: cantidadEntera,
          unidadMedida: tipoUnidadMedida,
          partida: partida,
          grupoTalla: talla ? 1 : 0,
          codigoTalla: talla,
          codigoColor: color,
          codigoEmpresa: empresa,
          ejercicio: ejercicio,
          grupoUnicoOrigen: traspaso.origen.grupoUnico || '',
          descripcionArticulo: traspaso.articulo.DescripcionArticulo || '',
          esSinUbicacion: traspaso.origen.esSinUbicacion || false
        };
      });

      console.log('Datos a enviar:', JSON.stringify(traspasosValidados, null, 2));

      const resultados = [];
      for (const [index, traspaso] of traspasosValidados.entries()) {
        try {
          const response = await API.post('/traspaso', traspaso, { headers });
          resultados.push({ success: true, data: response.data });
          console.log('Traspaso realizado:', response.data);
        } catch (err) {
          console.error('Error en traspaso individual:', err.response?.data || err.message);
          resultados.push({ 
            success: false, 
            error: err.response?.data?.mensaje || err.response?.data?.error || err.message,
            articulo: traspaso.articulo,
            origen: {
              almacen: traspaso.origenAlmacen,
              ubicacion: traspaso.origenUbicacion
            },
            traspasoIndex: index
          });
        }
      }

      const traspasosFallidos = resultados.filter(r => !r.success);
      if (traspasosFallidos.length > 0) {
        const mensajeError = traspasosFallidos.map(t => 
          `Artículo: ${t.articulo} - Origen: ${t.origen.almacen}/${t.origen.ubicacion}\nError: ${t.error}`
        ).join('\n\n');
        
        alert(`Algunos traspasos fallaron:\n\n${mensajeError}`);
        
        const indicesFallados = traspasosFallidos.map(t => t.traspasoIndex);
        setTraspasosPendientes(prev => prev.filter((_, index) => indicesFallados.includes(index)));
      } else {
        alert('Todos los traspasos realizados correctamente');
        setTraspasosPendientes([]);
      }

      await cargarHistorial();
      setActiveSection('historial');
    } catch (err) {
      console.error('Error confirmando traspasos:', err);
      
      let errorMsg = 'Error al realizar traspasos';
      if (err.response?.data) {
        errorMsg += `: ${err.response.data.mensaje || 'Error desconocido'}`;
        if (err.response.data.error) {
          errorMsg += ` (${err.response.data.error})`;
          if (err.response.data.error.includes('stock')) {
            errorMsg += '\nVerifique que el stock existe en la ubicación de origen';
          }
        }
      } else if (err.message) {
        errorMsg += `: ${err.message}`;
      }
      
      alert(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const formatFecha = (fechaStr) => {
    if (!fechaStr) return 'Fecha no disponible';
    
    try {
      if (typeof fechaStr === 'string' && fechaStr.includes('/')) {
        return fechaStr;
      }
      
      if (fechaStr instanceof Date) {
        return fechaStr.toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }
      
      const fecha = new Date(fechaStr);
      if (!isNaN(fecha.getTime())) {
        return fecha.toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }
      
      return fechaStr;
    } catch (e) {
      console.error('Error formateando fecha:', e);
      return fechaStr;
    }
  };

  // =========== RENDER ===========
  return (
    <div className="traspasos-container">
      <TraspasosHeader
        activeSection={activeSection}
        pendientesCount={traspasosPendientes.length}
        onChangeSection={(section) => {
          if (section === 'verificacion' && traspasosPendientes.length === 0) {
            alert('Agregue traspasos primero');
            return;
          }

          if (section === 'historial') {
            setActiveSection('historial');
            cargarHistorial();
            return;
          }

          setActiveSection(section);
        }}
      />
      
      {activeSection === 'traspasos' && (
        <div className="traspasos-section">
          <Stack spacing={3}>
            <TraspasosModeTabs
              activeTab={activeTab}
              onChange={(value) => {
                setActiveTab(value);
                setVistaUbicacion('seleccion');
              }}
            />
          
          {activeTab === 'articulo' && (
            <div className="modo-articulo">
              <ArticuloSearchPanel
                AsyncSelect={AsyncSelect}
                loadOptions={cargarOpcionesArticulos}
                onChange={(selectedOption) => {
                  if (selectedOption) {
                    seleccionarArticulo(selectedOption.data);
                  } else {
                    setArticuloSeleccionado(null);
                  }
                }}
                articuloSeleccionado={articuloSeleccionado}
              />

              {articuloSeleccionado && stockDisponible.length === 0 && !loading && (
                <TraspasosStateView
                  type="info"
                  title="Sin stock disponible."
                  message="Este articulo no tiene ubicaciones disponibles para traspaso."
                />
              )}

              {articuloSeleccionado && stockDisponible.length > 0 && (
                <>
                  <Stack spacing={3}>
                    <OrigenSelectorCard
                      SelectComponent={Select}
                      opcionesAlmacenes={[...new Set(stockDisponible.map(item => item.CodigoAlmacen))]
                        .map((codigo) => ({
                          value: codigo,
                          label: getNombreAlmacen(codigo)
                        }))}
                      opcionesUbicacionesStock={opcionesUbicacionesStock}
                      almacenOrigen={almacenOrigen}
                      grupoUnicoOrigen={grupoUnicoOrigen}
                      onAlmacenChange={(selectedOption) => {
                        if (selectedOption) {
                          cambiarAlmacenOrigen(selectedOption.value);
                        }
                      }}
                      onUbicacionChange={(selectedOption) => {
                        if (selectedOption) {
                          seleccionarUbicacionOrigen(selectedOption.data);
                        }
                      }}
                      getNombreAlmacen={getNombreAlmacen}
                      ubicacionOrigen={ubicacionOrigen}
                      unidadMedida={unidadMedida}
                      partida={partida}
                      tallaOrigen={tallaOrigen}
                      colorOrigen={colorOrigen}
                      getColorStyle={getColorStyle}
                      stockDisponibleInfo={stockDisponibleInfo}
                      mostrarUnidadMedida={mostrarUnidadMedida}
                    />

                    <DestinoSelectorCard
                      SelectComponent={Select}
                      opcionesAlmacenes={opcionesAlmacenes}
                      opcionesUbicacionesDestino={opcionesUbicacionesDestino.filter(ubicacion =>
                        almacenDestino !== almacenOrigen || ubicacion.value !== ubicacionOrigen
                      )}
                      almacenDestino={almacenDestino}
                      ubicacionDestino={ubicacionDestino}
                      onAlmacenChange={handleAlmacenDestinoChange}
                      onUbicacionChange={(selectedOption) => {
                        if (selectedOption) {
                          setUbicacionDestino(selectedOption.value);
                        }
                      }}
                      onUbicacionInputChange={handleUbicacionDestinoInputChange}
                      onUbicacionMenuOpen={handleUbicacionesDestinoMenuOpen}
                      onUbicacionMenuScrollToBottom={handleUbicacionesDestinoScroll}
                      cargandoUbicacionesDestino={cargandoUbicacionesDestino}
                    />

                    <CantidadPanel
                      cantidad={cantidad}
                      onCantidadChange={handleCantidadChange}
                      stockInfo={stockDisponibleInfo}
                      buttonLabel="Agregar Traspaso"
                      onSubmit={agregarTraspasoArticulo}
                      loading={loading}
                    />
                  </Stack>
                </>
              )}
            </div>
          )}
          
          {activeTab === 'ubicacion' && (
            <div className="modo-ubicacion">
              {vistaUbicacion === 'seleccion' ? (
                <UbicacionesAgrupadasList
                  AsyncSelect={AsyncSelect}
                  loadOptions={cargarOpcionesUbicaciones}
                  onAsyncChange={(selectedOption) => {
                    if (selectedOption) {
                      const [almacen, ubicacion] = selectedOption.value.split('|');
                      cargarArticulosUbicacion(almacen, ubicacion);
                    }
                  }}
                  almacenes={almacenes}
                  almacenesExpandidos={almacenesExpandidos}
                  ubicacionesCargadas={ubicacionesCargadas}
                  onToggleAlmacen={toggleAlmacenExpandido}
                  onSeleccionarUbicacion={cargarArticulosUbicacion}
                  loading={loading}
                />
              ) : (
                <>
                  <div className="form-section-header">
                    <button 
                      className="btn-volver"
                      onClick={() => {
                        setVistaUbicacion('seleccion');
                        setUbicacionSeleccionada(null);
                        setArticulosUbicacion([]);
                      }}
                    >
                      &larr; Volver a ubicaciones
                    </button>
                    <h2>Artículos en {formatUbicacionDisplay(ubicacionSeleccionada.ubicacion, ubicacionSeleccionada.ubicacion === 'SIN-UBICACION')}</h2>
                  </div>
                  
                  <div className="form-section">
                    <div className="ubicacion-seleccionada-info">
                      <span>Almacén: {getNombreAlmacen(ubicacionSeleccionada.almacen)}</span>
                      <span>Ubicación: {formatUbicacionDisplay(ubicacionSeleccionada.ubicacion, ubicacionSeleccionada.ubicacion === 'SIN-UBICACION')}</span>
                    </div>
                    
                    <ArticulosUbicacionTable
                      articulosUbicacion={articulosUbicacion}
                      ubicacionSeleccionada={ubicacionSeleccionada}
                      articuloUbicacionSeleccionado={articuloUbicacionSeleccionado}
                      setArticuloUbicacionSeleccionado={setArticuloUbicacionSeleccionado}
                      formatTallaColor={formatTallaColor}
                      getColorStyle={getColorStyle}
                      formatearUnidad={formatearUnidad}
                      mostrarUnidadMedida={mostrarUnidadMedida}
                      paginationUbicacion={paginationUbicacion}
                      onPageChange={(page) =>
                        cargarArticulosUbicacion(
                          ubicacionSeleccionada.almacen,
                          ubicacionSeleccionada.ubicacion,
                          page
                        )
                      }
                    />
                  </div>
                </>
              )}

              {articuloUbicacionSeleccionado && (
                <Stack spacing={3}>
                  <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
                    <Stack spacing={2}>
                      <Typography variant="h6" sx={{ color: '#1a365d', fontWeight: 700 }}>
                        Detalles del Traspaso
                      </Typography>
                      <div className="articulo-seleccionado">
                        <span>Artículo seleccionado: </span>
                        {articuloUbicacionSeleccionado.DescripcionArticulo}
                        ({articuloUbicacionSeleccionado.CodigoArticulo})
                        <div className="unidad-info">
                          <strong>Unidad:</strong> {mostrarUnidadMedida(articuloUbicacionSeleccionado.UnidadMedida)}
                          {articuloUbicacionSeleccionado.Partida && <span>, <strong>Lote:</strong> {articuloUbicacionSeleccionado.Partida}</span>}
                        </div>

                        <Stack spacing={1} sx={{ mt: 1.5 }}>
                          {articuloUbicacionSeleccionado.tallaColorDisplay && (
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="body2"><strong>Talla/Color:</strong></Typography>
                              <StockInfoChip
                                label={articuloUbicacionSeleccionado.tallaColorDisplay}
                                style={getColorStyle(articuloUbicacionSeleccionado.CodigoColor_)}
                              />
                            </Stack>
                          )}

                          {articuloUbicacionSeleccionado.NombreColor && (
                            <Typography variant="body2">
                              <strong>Nombre Color:</strong> {articuloUbicacionSeleccionado.NombreColor}
                            </Typography>
                          )}
                        </Stack>
                      </div>
                    </Stack>
                  </Paper>

                  <DestinoSelectorCard
                    title="Destino"
                    SelectComponent={Select}
                    opcionesAlmacenes={opcionesAlmacenes}
                    opcionesUbicacionesDestino={opcionesUbicacionesDestino.filter(ubicacion =>
                      almacenDestino !== ubicacionSeleccionada.almacen ||
                      ubicacion.value !== ubicacionSeleccionada.ubicacion
                    )}
                    almacenDestino={almacenDestino}
                    ubicacionDestino={ubicacionDestino}
                    onAlmacenChange={handleAlmacenDestinoChange}
                    onUbicacionChange={(selectedOption) => {
                      if (selectedOption) {
                        setUbicacionDestino(selectedOption.value);
                      }
                    }}
                    onUbicacionInputChange={handleUbicacionDestinoInputChange}
                    onUbicacionMenuOpen={handleUbicacionesDestinoMenuOpen}
                    onUbicacionMenuScrollToBottom={handleUbicacionesDestinoScroll}
                    cargandoUbicacionesDestino={cargandoUbicacionesDestino}
                  />

                  <CantidadPanel
                    cantidad={cantidad}
                    onCantidadChange={handleCantidadChange}
                    stockInfo={formatearUnidad(articuloUbicacionSeleccionado.Cantidad, articuloUbicacionSeleccionado.UnidadMedida)}
                    buttonLabel="Agregar Traspaso"
                    onSubmit={agregarTraspasoUbicacion}
                    loading={loading}
                    max={articuloUbicacionSeleccionado.Cantidad}
                  />
                </Stack>
              )}
            </div>
          )}
          </Stack>
        </div>
      )}
      
      {activeSection === 'verificacion' && (
        <div className="verificacion-section">
          <h2>Traspasos Pendientes de Confirmación</h2>
          
          {traspasosPendientes.length === 0 ? (
            <TraspasosStateView
              type="info"
              title="No hay traspasos pendientes."
              message="Agrega traspasos antes de pasar a verificacion."
            />
          ) : (
            <TraspasosPendientesTable
              traspasosPendientes={traspasosPendientes}
              getNombreAlmacen={getNombreAlmacen}
              formatearUnidad={formatearUnidad}
              mostrarUnidadMedida={mostrarUnidadMedida}
              getColorStyle={getColorStyle}
              onEliminar={(id) =>
                setTraspasosPendientes(traspasosPendientes.filter((item) => item.id !== id))
              }
              onConfirmar={confirmarTraspasos}
              onVolver={() => setActiveSection('traspasos')}
              loading={loading}
            />
          )}
        </div>
      )}
      
      {activeSection === 'historial' && (
        <div className="historial-section">
          <h2>Historial de Traspasos</h2>
          
          {historial.length === 0 ? (
            <TraspasosStateView
              type="info"
              title="No hay traspasos registrados."
              message="Todavia no hay movimientos en el historial."
            />
          ) : (
            <HistorialTraspasosTable
              historial={historial}
              formatFecha={formatFecha}
              formatearUnidad={formatearUnidad}
              mostrarUnidadMedida={mostrarUnidadMedida}
              getColorStyle={getColorStyle}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default TraspasosPage;
