// ── InventarioDialogs.jsx ─────────────────────────────────────────────────────
// Dialogs: NuevoAjuste, EditarCantidad, Detalles

import React from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography
} from '@mui/material';
import {
  normalizarTexto, normalizarUbicacionDisplay, normalizarUbicacionOption, formatUbicacionLabel
} from './InventarioHelpers';

// ── Nuevo Ajuste ──────────────────────────────────────────────────────────────
export const NuevoAjusteDialog = ({
  open, onClose, articuloBusqueda, onArticuloBusquedaChange, resultadosBusqueda,
  onSeleccionarArticulo, articuloSeleccionado, almacenSeleccionado, almacenesDisponibles,
  onAlmacenChange, ubicacionSeleccionada, onUbicacionChange, ubicacionBusqueda,
  onUbicacionBusquedaChange, ubicacionesDisponibles, cargandoUbicaciones, onUbicacionesScroll,
  unidadesDisponibles, unidadMedidaSeleccionada, onUnidadMedidaChange,
  mostrarSelectorTalla, tallasDisponibles, tallaSeleccionada, onTallaChange,
  mostrarSelectorColor, coloresDisponibles, colorSeleccionado, onColorChange,
  cantidadNuevoAjuste, onCantidadChange, onGuardar, omitirSiguienteBusquedaUbicacionRef
}) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
    <DialogTitle sx={{ fontWeight: 700 }}>Nuevo Ajuste de Inventario</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={3}>
        <Alert severity="info">Complete los siguientes campos para crear un nuevo ajuste de inventario.</Alert>
        <Stack spacing={1.5}>
          <TextField fullWidth autoFocus label="Buscar Artículo *" value={articuloBusqueda}
            onChange={(e) => onArticuloBusquedaChange(e.target.value)}
            placeholder="Ingrese código o descripción del artículo..." />
          {resultadosBusqueda.length > 0 && (
            <Paper variant="outlined" sx={{ maxHeight: 240, overflowY: 'auto' }}>
              {resultadosBusqueda.map((articulo) => (
                <Box key={articulo.CodigoArticulo} onClick={() => onSeleccionarArticulo(articulo)}
                  sx={{ px: 2, py: 1.5, cursor: 'pointer', borderBottom: '1px solid', borderColor: 'divider',
                    '&:last-of-type': { borderBottom: 'none' }, '&:hover': { backgroundColor: 'action.hover' } }}>
                  <Typography variant="body1" sx={{ fontWeight: 700 }}>{normalizarTexto(articulo.CodigoArticulo)}</Typography>
                  <Typography variant="body2" color="text.secondary">{normalizarTexto(articulo.DescripcionArticulo)}</Typography>
                </Box>
              ))}
            </Paper>
          )}
        </Stack>
        {articuloSeleccionado && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, backgroundColor: 'rgba(39,174,96,0.06)' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Artículo seleccionado</Typography>
            <Typography variant="body1">
              <strong>{normalizarTexto(articuloSeleccionado.CodigoArticulo)}</strong> — {normalizarTexto(articuloSeleccionado.DescripcionArticulo)}
            </Typography>
          </Paper>
        )}
        <TextField select fullWidth label="Almacén *" value={almacenSeleccionado} onChange={(e) => onAlmacenChange(e.target.value)}>
          <MenuItem value="">Seleccionar almacén</MenuItem>
          {almacenesDisponibles.map((almacen) => (
            <MenuItem key={almacen.CodigoAlmacen} value={almacen.CodigoAlmacen}>
              {almacen.CodigoAlmacen} — {normalizarTexto(almacen.Almacen) || almacen.CodigoAlmacen}
            </MenuItem>
          ))}
        </TextField>
        {almacenSeleccionado && (
          <Autocomplete
            fullWidth options={ubicacionesDisponibles} loading={cargandoUbicaciones}
            filterOptions={(options) => options}
            value={ubicacionesDisponibles.find((u) => u.Ubicacion === ubicacionSeleccionada) || null}
            inputValue={ubicacionBusqueda}
            onChange={(_, nuevaUbicacion) => {
              const n = normalizarUbicacionOption(nuevaUbicacion);
              omitirSiguienteBusquedaUbicacionRef.current = true;
              onUbicacionChange(n?.Ubicacion || '');
              onUbicacionBusquedaChange(n ? formatUbicacionLabel(n) : '');
            }}
            onInputChange={(_, nuevoValor, reason) => {
              if (omitirSiguienteBusquedaUbicacionRef.current) {
                omitirSiguienteBusquedaUbicacionRef.current = false;
                return;
              }
              if (reason === 'input' || reason === 'clear') {
                onUbicacionChange('');
                onUbicacionBusquedaChange(nuevoValor);
              }
            }}
            isOptionEqualToValue={(option, value) =>
              normalizarUbicacionOption(option)?.Ubicacion === normalizarUbicacionOption(value)?.Ubicacion}
            getOptionLabel={(option) => {
              const n = normalizarUbicacionOption(option);
              return n ? formatUbicacionLabel(n) : '';
            }}
            ListboxProps={{ onScroll: onUbicacionesScroll, style: { maxHeight: 320 } }}
            noOptionsText={cargandoUbicaciones ? 'Cargando ubicaciones...' : (ubicacionBusqueda ? 'No se encontraron ubicaciones' : 'Sin ubicaciones disponibles')}
            loadingText="Cargando ubicaciones..."
            renderInput={(params) => <TextField {...params} label="Ubicación *" placeholder="Buscar ubicación..." />}
            renderOption={(props, ubicacion) => (
              <Box component="li" {...props} key={normalizarUbicacionOption(ubicacion)?.Ubicacion || props.key}>
                {formatUbicacionLabel(normalizarUbicacionOption(ubicacion))}
              </Box>
            )}
          />
        )}
        {articuloSeleccionado && (
          <TextField select fullWidth label="Unidad de Medida" value={unidadMedidaSeleccionada} onChange={(e) => onUnidadMedidaChange(e.target.value)}>
            {unidadesDisponibles.map((unidad) => (
              <MenuItem key={unidad} value={unidad}>{normalizarTexto(unidad)}</MenuItem>
            ))}
          </TextField>
        )}
        {mostrarSelectorTalla && (
          <TextField select fullWidth label="Talla" value={tallaSeleccionada} onChange={(e) => onTallaChange(e.target.value)}>
            <MenuItem value="">Seleccionar talla</MenuItem>
            {tallasDisponibles.map((talla) => (
              <MenuItem key={talla.codigo || talla} value={talla.codigo || talla}>
                {talla.descripcion ? `${talla.codigo} — ${talla.descripcion}` : normalizarTexto(talla)}
              </MenuItem>
            ))}
          </TextField>
        )}
        {mostrarSelectorColor && (
          <TextField select fullWidth label="Color" value={colorSeleccionado} onChange={(e) => onColorChange(e.target.value)}>
            <MenuItem value="">Seleccionar color</MenuItem>
            {coloresDisponibles.map((color) => (
              <MenuItem key={color.codigo || color} value={color.codigo || color}>
                {color.nombre ? `${color.codigo} — ${normalizarTexto(color.nombre)}` : normalizarTexto(color)}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TextField fullWidth label="Cantidad *" type="number" value={cantidadNuevoAjuste}
          onChange={(e) => onCantidadChange(e.target.value)}
          inputProps={{ step: 'any', min: 0 }} placeholder="Ingrese la cantidad..." />
      </Stack>
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}>
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="contained" onClick={onGuardar}
        disabled={!articuloSeleccionado || !almacenSeleccionado || !ubicacionSeleccionada || !cantidadNuevoAjuste}>
        Crear Ajuste
      </Button>
    </DialogActions>
  </Dialog>
);

// ── Editar Cantidad ───────────────────────────────────────────────────────────
export const EditarCantidadDialog = ({
  open, editandoCantidad, onClose, unidadesDisponiblesEdit, unidadMedidaSeleccionadaEdit,
  onUnidadMedidaChange, tallasDisponiblesEdit, tallaSeleccionadaEdit, onTallaChange,
  coloresDisponiblesEdit, colorSeleccionadoEdit, onColorChange,
  formatearUnidad, getStockStyle, nuevaCantidad, onNuevaCantidadChange, onGuardar
}) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle sx={{ fontWeight: 700 }}>Editar Cantidad</DialogTitle>
    <DialogContent dividers>
      {editandoCantidad && (
        <Stack spacing={2.5}>
          <Stack spacing={1}>
            <TextField fullWidth label="Artículo"
              value={`${normalizarTexto(editandoCantidad.articulo)} — ${normalizarTexto(editandoCantidad.descripcionArticulo)}`}
              InputProps={{ readOnly: true }} />
            <TextField fullWidth label="Almacén"
              value={normalizarTexto(editandoCantidad.nombreAlmacen)} InputProps={{ readOnly: true }} />
            <TextField fullWidth label="Ubicación"
              value={normalizarUbicacionDisplay(editandoCantidad.ubicacionStr)} InputProps={{ readOnly: true }} />
            <TextField fullWidth label="Partida/Lote"
              value={editandoCantidad.partida || 'Sin partida'} InputProps={{ readOnly: true }} />
          </Stack>
          <TextField select fullWidth label="Unidad de Medida" value={unidadMedidaSeleccionadaEdit} onChange={(e) => onUnidadMedidaChange(e.target.value)}>
            {unidadesDisponiblesEdit.map((unidad) => (
              <MenuItem key={unidad} value={unidad}>{normalizarTexto(unidad)}</MenuItem>
            ))}
          </TextField>
          {tallasDisponiblesEdit.length > 0 && (
            <TextField select fullWidth label="Talla" value={tallaSeleccionadaEdit} onChange={(e) => onTallaChange(e.target.value)}>
              <MenuItem value="">Seleccionar talla</MenuItem>
              {tallasDisponiblesEdit.map((talla) => (
                <MenuItem key={talla} value={talla}>{normalizarTexto(talla)}</MenuItem>
              ))}
            </TextField>
          )}
          {coloresDisponiblesEdit.length > 0 && (
            <TextField select fullWidth label="Color" value={colorSeleccionadoEdit} onChange={(e) => onColorChange(e.target.value)}>
              <MenuItem value="">Seleccionar color</MenuItem>
              {coloresDisponiblesEdit.map((color) => (
                <MenuItem key={color} value={color}>{normalizarTexto(color)}</MenuItem>
              ))}
            </TextField>
          )}
          <TextField fullWidth label="Cantidad Actual"
            value={formatearUnidad(editandoCantidad.cantidadActual, editandoCantidad.unidadStock)}
            InputProps={{ readOnly: true }}
            sx={{ '& .MuiInputBase-input': { ...getStockStyle(editandoCantidad.cantidadActual) } }} />
          <TextField fullWidth autoFocus label="Nueva Cantidad" type="number"
            value={nuevaCantidad} onChange={(e) => onNuevaCantidadChange(e.target.value)}
            inputProps={{ step: 'any' }} placeholder="Ingrese la nueva cantidad..." />
        </Stack>
      )}
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}>
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="contained" onClick={onGuardar}>Guardar Ajuste</Button>
    </DialogActions>
  </Dialog>
);

// ── Detalles ──────────────────────────────────────────────────────────────────
export const InventarioDetallesDialog = ({ open, detallesModal, onClose }) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
    <DialogTitle sx={{ fontWeight: 700 }}>Detalles de Variantes</DialogTitle>
    <DialogContent dividers>
      {!detallesModal || detallesModal.length === 0 ? (
        <Alert severity="info">No hay detalles de variantes para este artículo.</Alert>
      ) : (
        <Stack spacing={3}>
          {detallesModal.map((detalle, index) => (
            <Paper key={`${detalle.color.codigo}-${detalle.grupoTalla.codigo}-${index}`} variant="outlined" sx={{ p: 2.5 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="subtitle1"><strong>Color:</strong> {normalizarTexto(detalle.color.nombre)}</Typography>
                <Typography variant="subtitle1"><strong>Grupo Talla:</strong> {normalizarTexto(detalle.grupoTalla.nombre)}</Typography>
              </Stack>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Talla</TableCell>
                      <TableCell>Descripción</TableCell>
                      <TableCell align="right">Unidades</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(detalle.tallas)
                      .filter(([_, talla]) => talla.unidades > 0)
                      .map(([codigoTalla, talla], idx) => (
                        <TableRow key={`${codigoTalla}-${idx}`}>
                          <TableCell>{codigoTalla}</TableCell>
                          <TableCell>{normalizarTexto(talla.descripcion)}</TableCell>
                          <TableCell align="right">{talla.unidades}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="body1" sx={{ mt: 2, fontWeight: 700 }}>Total unidades: {detalle.unidades}</Typography>
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