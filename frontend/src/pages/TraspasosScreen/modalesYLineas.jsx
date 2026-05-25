import React from 'react';
import {
  Box, Button, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography
} from '@mui/material';
import { StockInfoChip } from './componentes';
import { formatearUnidad, mostrarUnidadMedida, formatUbicacionDisplay, formatTallaColor } from './hooksYHelpers';

// ============================================================
// TABLA TRASPASOS PENDIENTES (verificación)
// ============================================================
export const TraspasosPendientesTable = ({
  traspasosPendientes, getNombreAlmacen, getColorStyle,
  onEliminar, onConfirmar, onVolver, loading
}) => (
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
          {traspasosPendientes.map(traspaso => (
            <TableRow key={traspaso.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{traspaso.articulo.CodigoArticulo}</Typography>
                <Typography variant="caption" color="text.secondary">{traspaso.articulo.DescripcionArticulo}</Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2">{getNombreAlmacen(traspaso.origen.almacen)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {traspaso.origen.esSinUbicacion ? '[SIN UBICACION]' : traspaso.origen.ubicacion}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2">{getNombreAlmacen(traspaso.destino.almacen)}</Typography>
                <Typography variant="caption" color="text.secondary">{traspaso.destino.ubicacion}</Typography>
              </TableCell>
              <TableCell>
                {formatearUnidad(traspaso.cantidad, mostrarUnidadMedida(traspaso.unidadMedida))}
              </TableCell>
              <TableCell>
                <Stack spacing={0.5}>
                  {traspaso.partida && (
                    <Typography variant="caption"><strong>Lote:</strong> {traspaso.partida}</Typography>
                  )}
                  {(traspaso.talla || traspaso.color) && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="caption"><strong>Talla/Color:</strong></Typography>
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
      <Button variant="outlined" onClick={onVolver}>Volver a Traspasos</Button>
    </Stack>
  </Stack>
);

// ============================================================
// TABLA HISTORIAL
// ============================================================
export const HistorialTraspasosTable = ({ historial, formatFecha, getColorStyle }) => (
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
          const tallaColor = item.CodigoTalla01_ && item.CodigoColor_
            ? `${item.CodigoTalla01_}${item.CodigoColor_}` : '';
          return (
            <TableRow key={`${item.FechaRegistro}-${index}-${item.CodigoArticulo}`} hover>
              <TableCell>{item.FechaFormateada || formatFecha(item.FechaRegistro)}</TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.CodigoArticulo}</Typography>
                <Typography variant="caption" color="text.secondary">{item.DescripcionArticulo}</Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2">{item.NombreAlmacenOrigen} ({item.OrigenAlmacen})</Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.OrigenUbicacion === 'SIN-UBICACION' ? '[SIN UBICACION]' : item.OrigenUbicacion}
                  {item.DescripcionUbicacionOrigen ? ` - ${item.DescripcionUbicacionOrigen}` : ''}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2">{item.NombreAlmacenDestino} ({item.DestinoAlmacen})</Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.DestinoUbicacion}
                  {item.DescripcionUbicacionDestino ? ` - ${item.DescripcionUbicacionDestino}` : ''}
                </Typography>
              </TableCell>
              <TableCell>
                {formatearUnidad(item.Cantidad, mostrarUnidadMedida(item.UnidadMedida))}
              </TableCell>
              <TableCell>
                <Stack spacing={0.5}>
                  {item.Partida && <Typography variant="caption"><strong>Lote:</strong> {item.Partida}</Typography>}
                  {tallaColor && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="caption"><strong>Talla/Color:</strong></Typography>
                      <StockInfoChip label={tallaColor} style={getColorStyle(item.CodigoColor_)} />
                    </Stack>
                  )}
                </Stack>
              </TableCell>
              <TableCell>{item.Usuario || 'Desconocido'}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </TableContainer>
);
