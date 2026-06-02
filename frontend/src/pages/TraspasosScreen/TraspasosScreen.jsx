import '../../styles/TraspasosPage.css';
import React from 'react';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';

import { useTraspasosPage, getColorStyle, formatUbicacionDisplay, formatearUnidad, mostrarUnidadMedida, formatFecha } from './hooksYHelpers';
import {
  TraspasosHeader, TraspasosModeTabs, TraspasosStateView,
  ArticuloSearchPanel, OrigenSelectorCard, DestinoSelectorCard,
  CantidadPanel, UbicacionesAgrupadasList, ArticulosUbicacionTable,
  StockInfoChip
} from './componentes';
import { TraspasosPendientesTable, HistorialTraspasosTable } from './modalesYLineas';
import { usePermissions } from '../../PermissionsManager';

const TraspasosPage = () => {
  const { canViewTransfers } = usePermissions();

  const {
    activeSection, setActiveSection,
    activeTab, setActiveTab,
    loading,
    almacenes,
    historial,
    traspasosPendientes, setTraspasosPendientes,
    articuloSeleccionado, setArticuloSeleccionado,
    stockDisponible,
    almacenOrigen, ubicacionOrigen,
    almacenDestino, ubicacionDestino, setUbicacionDestino,
    cargandoUbicacionesDestino,
    cantidad, setCantidad,
    unidadMedida, partida,
    tallaOrigen, colorOrigen,
    stockDisponibleInfo,
    grupoUnicoOrigen,
    almacenesExpandidos, ubicacionesCargadas,
    ubicacionSeleccionada, setUbicacionSeleccionada,
    articulosUbicacion,
    paginationUbicacion,
    articuloUbicacionSeleccionado, setArticuloUbicacionSeleccionado,
    vistaUbicacion, setVistaUbicacion,
    opcionesAlmacenes, opcionesAlmacenesDestino,
    opcionesUbicacionesDestino, opcionesUbicacionesStock,
    getNombreAlmacen,
    handleAlmacenDestinoChange,
    handleUbicacionDestinoInputChange,
    handleUbicacionesDestinoMenuOpen,
    handleUbicacionesDestinoScroll,
    cambiarAlmacenOrigen,
    seleccionarUbicacionOrigen,
    handleCantidadChange,
    agregarTraspasoArticulo,
    agregarTraspasoUbicacion,
    confirmarTraspasos,
    toggleAlmacenExpandido,
    cargarHistorial,
    cargarArticulosUbicacion,
    cargarOpcionesArticulos,
    cargarOpcionesUbicaciones,
  } = useTraspasosPage();

  // FIX: guard de permisos — sin canViewTransfers la pantalla queda bloqueada
  if (!canViewTransfers) {
    return (
      <div className="traspasos-container">
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Paper sx={{ p: 4, maxWidth: 500, mx: 'auto', borderRadius: 3 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Acceso restringido</Typography>
            <Typography color="text.secondary">No tienes permiso para acceder a esta sección.</Typography>
          </Paper>
        </Box>
      </div>
    );
  }

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

      {/* ── SECCIÓN TRASPASOS ─────────────────────────────── */}
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

            {/* ── TAB: POR ARTÍCULO ── */}
            {activeTab === 'articulo' && (
              <div className="modo-articulo">
                <ArticuloSearchPanel
                  AsyncSelect={AsyncSelect}
                  loadOptions={cargarOpcionesArticulos}
                  onChange={(opt) => {
                    if (opt) setArticuloSeleccionado(opt.data);
                    else setArticuloSeleccionado(null);
                  }}
                  articuloSeleccionado={articuloSeleccionado}
                />

                {articuloSeleccionado && stockDisponible.length === 0 && !loading && (
                  <TraspasosStateView type="info" title="Sin stock disponible." message="Este articulo no tiene ubicaciones disponibles para traspaso." />
                )}

                {articuloSeleccionado && stockDisponible.length > 0 && (
                  <Stack spacing={3}>
                    <OrigenSelectorCard
                      SelectComponent={Select}
                      opcionesAlmacenes={[...new Set(stockDisponible.map(i => i.CodigoAlmacen))].map(cod => ({
                        value: cod,
                        label: getNombreAlmacen(cod)
                      }))}
                      opcionesUbicacionesStock={opcionesUbicacionesStock}
                      almacenOrigen={almacenOrigen}
                      grupoUnicoOrigen={grupoUnicoOrigen}
                      onAlmacenChange={(opt) => { if (opt) cambiarAlmacenOrigen(opt.value); }}
                      onUbicacionChange={(opt) => { if (opt) seleccionarUbicacionOrigen(opt.data); }}
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
                      opcionesAlmacenes={opcionesAlmacenesDestino}
                      opcionesUbicacionesDestino={opcionesUbicacionesDestino.filter(u =>
                        almacenDestino !== almacenOrigen || u.value !== ubicacionOrigen
                      )}
                      almacenDestino={almacenDestino}
                      ubicacionDestino={ubicacionDestino}
                      onAlmacenChange={handleAlmacenDestinoChange}
                      onUbicacionChange={(opt) => { if (opt) setUbicacionDestino(opt.value); }}
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
                )}
              </div>
            )}

            {/* ── TAB: POR UBICACIÓN ── */}
            {activeTab === 'ubicacion' && (
              <div className="modo-ubicacion">
                {vistaUbicacion === 'seleccion' ? (
                  <UbicacionesAgrupadasList
                    AsyncSelect={AsyncSelect}
                    loadOptions={cargarOpcionesUbicaciones}
                    onAsyncChange={(opt) => {
                      if (opt) {
                        const [almacen, ubicacion] = opt.value.split('|');
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
                        }}
                      >
                        &larr; Volver a ubicaciones
                      </button>
                      <h2>Artículos en {formatUbicacionDisplay(ubicacionSeleccionada?.ubicacion, ubicacionSeleccionada?.ubicacion === 'SIN-UBICACION')}</h2>
                    </div>

                    <div className="form-section">
                      <div className="ubicacion-seleccionada-info">
                        <span>Almacén: {getNombreAlmacen(ubicacionSeleccionada?.almacen)}</span>
                        <span>Ubicación: {formatUbicacionDisplay(ubicacionSeleccionada?.ubicacion, ubicacionSeleccionada?.ubicacion === 'SIN-UBICACION')}</span>
                      </div>

                      <ArticulosUbicacionTable
                        articulosUbicacion={articulosUbicacion}
                        ubicacionSeleccionada={ubicacionSeleccionada}
                        articuloUbicacionSeleccionado={articuloUbicacionSeleccionado}
                        setArticuloUbicacionSeleccionado={setArticuloUbicacionSeleccionado}
                        getColorStyle={getColorStyle}
                        paginationUbicacion={paginationUbicacion}
                        onPageChange={(page) => cargarArticulosUbicacion(ubicacionSeleccionada.almacen, ubicacionSeleccionada.ubicacion, page)}
                      />
                    </div>
                  </>
                )}

                {articuloUbicacionSeleccionado && (
                  <Stack spacing={3}>
                    <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
                      <Stack spacing={2}>
                        <Typography variant="h6" sx={{ color: '#1a365d', fontWeight: 700 }}>Detalles del Traspaso</Typography>
                        <div className="articulo-seleccionado">
                          <span>Artículo seleccionado: </span>
                          {articuloUbicacionSeleccionado.DescripcionArticulo} ({articuloUbicacionSeleccionado.CodigoArticulo})
                          <div className="unidad-info">
                            <strong>Unidad:</strong> {mostrarUnidadMedida(articuloUbicacionSeleccionado.UnidadMedida)}
                            {articuloUbicacionSeleccionado.Partida && <span>, <strong>Lote:</strong> {articuloUbicacionSeleccionado.Partida}</span>}
                          </div>
                          {articuloUbicacionSeleccionado.tallaColorDisplay && (
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                              <Typography variant="body2"><strong>Talla/Color:</strong></Typography>
                              <StockInfoChip
                                label={articuloUbicacionSeleccionado.tallaColorDisplay}
                                style={getColorStyle(articuloUbicacionSeleccionado.CodigoColor_)}
                              />
                            </Stack>
                          )}
                        </div>
                      </Stack>
                    </Paper>

                    <DestinoSelectorCard
                      SelectComponent={Select}
                      opcionesAlmacenes={opcionesAlmacenesDestino}
                      opcionesUbicacionesDestino={opcionesUbicacionesDestino.filter(u =>
                        almacenDestino !== ubicacionSeleccionada?.almacen ||
                        u.value !== ubicacionSeleccionada?.ubicacion
                      )}
                      almacenDestino={almacenDestino}
                      ubicacionDestino={ubicacionDestino}
                      onAlmacenChange={handleAlmacenDestinoChange}
                      onUbicacionChange={(opt) => { if (opt) setUbicacionDestino(opt.value); }}
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

      {/* ── SECCIÓN VERIFICACIÓN ──────────────────────────── */}
      {activeSection === 'verificacion' && (
        <div className="verificacion-section">
          <h2>Traspasos Pendientes de Confirmación</h2>
          {traspasosPendientes.length === 0 ? (
            <TraspasosStateView type="info" title="No hay traspasos pendientes." message="Agrega traspasos antes de pasar a verificacion." />
          ) : (
            <TraspasosPendientesTable
              traspasosPendientes={traspasosPendientes}
              getNombreAlmacen={getNombreAlmacen}
              getColorStyle={getColorStyle}
              onEliminar={(id) => setTraspasosPendientes(prev => prev.filter(t => t.id !== id))}
              onConfirmar={confirmarTraspasos}
              onVolver={() => setActiveSection('traspasos')}
              loading={loading}
            />
          )}
        </div>
      )}

      {/* ── SECCIÓN HISTORIAL ─────────────────────────────── */}
      {activeSection === 'historial' && (
        <div className="historial-section">
          <h2>Historial de Traspasos</h2>
          {historial.length === 0 ? (
            <TraspasosStateView type="info" title="No hay traspasos registrados." message="Todavia no hay movimientos en el historial." />
          ) : (
            <HistorialTraspasosTable
              historial={historial}
              formatFecha={formatFecha}
              getColorStyle={getColorStyle}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default TraspasosPage;