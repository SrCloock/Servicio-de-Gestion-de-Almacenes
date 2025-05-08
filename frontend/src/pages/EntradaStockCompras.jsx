import React, { useState, useEffect } from 'react';
import '../styles/EntradaStockCompras.css';
import { useNavigate } from 'react-router-dom';

function EntradaStockCompras() {
  const [paquetes, setPaquetes] = useState([]);
  const [paqueteSeleccionado, setPaqueteSeleccionado] = useState(null);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [mostrarUbicaciones, setMostrarUbicaciones] = useState(null);
  const [mostrarCompletados, setMostrarCompletados] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const savedData = localStorage.getItem('entradaStockData');

    if (savedData) {
      try {
        const { paquetes: savedPaquetes, ubicaciones: savedUbicaciones } = JSON.parse(savedData);
        setPaquetes(savedPaquetes);
        setUbicaciones(savedUbicaciones);
      } catch (e) {
        console.error("Error al leer localStorage, limpiando datos:", e);
        localStorage.removeItem('entradaStockData');
      }
    }

    if (!savedData || !paquetes.length) {
      const mockPaquetes = [
        {
          id: 1,
          proveedor: 'Ferretería Industrial S.L.',
          fechaRecepcion: '15/05/2023',
          estado: 'pendiente',
          articulos: [
            { id: 1, codigo: 'TRN-6X50', descripcion: 'Tornillo hexagonal 6x50 mm', cantidad: 150 },
            { id: 2, codigo: 'TRC-M8', descripcion: 'Tuerca M8 galvanizada', cantidad: 200 },
            { id: 3, codigo: 'TUB-ALU-20', descripcion: 'Tubo aluminio 20mm', cantidad: 50 },
          ]
        },
        {
          id: 2,
          proveedor: 'Suministros Técnicos García',
          fechaRecepcion: '16/05/2023',
          estado: 'pendiente',
          articulos: [
            { id: 4, codigo: 'BRD-40', descripcion: 'Brida de acero 40mm', cantidad: 30 },
            { id: 5, codigo: 'VLV-1/2', descripcion: 'Válvula de bola 1/2"', cantidad: 25 },
          ]
        },
        // Nuevos paquetes añadidos
        {
          id: 3,
          proveedor: 'Materiales de Construcción Pérez',
          fechaRecepcion: '17/05/2023',
          estado: 'pendiente',
          articulos: [
            { id: 6, codigo: 'CEM-25KG', descripcion: 'Cemento gris 25kg', cantidad: 40 },
            { id: 7, codigo: 'ARENA-20KG', descripcion: 'Arena fina 20kg', cantidad: 30 },
            { id: 8, codigo: 'GRAVA-20KG', descripcion: 'Grava 20kg', cantidad: 30 },
            { id: 9, codigo: 'YESO-5KG', descripcion: 'Yeso 5kg', cantidad: 20 }
          ]
        },
        {
          id: 4,
          proveedor: 'Electricidad Moderna S.A.',
          fechaRecepcion: '18/05/2023',
          estado: 'pendiente',
          articulos: [
            { id: 10, codigo: 'CBL-1.5', descripcion: 'Cable eléctrico 1.5mm', cantidad: 100 },
            { id: 11, codigo: 'CBL-2.5', descripcion: 'Cable eléctrico 2.5mm', cantidad: 80 },
            { id: 12, codigo: 'INT-10A', descripcion: 'Interruptor 10A', cantidad: 25 },
            { id: 13, codigo: 'FUS-16A', descripcion: 'Fusible 16A', cantidad: 30 }
          ]
        },
        {
          id: 5,
          proveedor: 'Fontanería Rápida',
          fechaRecepcion: '19/05/2023',
          estado: 'pendiente',
          articulos: [
            { id: 14, codigo: 'TUB-PVC-32', descripcion: 'Tubo PVC 32mm', cantidad: 25 },
            { id: 15, codigo: 'CODO-PVC-32', descripcion: 'Codo PVC 32mm', cantidad: 15 },
            { id: 16, codigo: 'VLV-ESF-1', descripcion: 'Válvula esférica 1"', cantidad: 10 }
          ]
        },
        // Paquetes completados de ejemplo
        {
          id: 6,
          proveedor: 'Herrería López',
          fechaRecepcion: '10/05/2023',
          estado: 'completado',
          articulos: [
            { id: 17, codigo: 'CHP-20X20', descripcion: 'Chapa acero 20x20cm', cantidad: 50 },
            { id: 18, codigo: 'PNL-AC-3', descripcion: 'Panel acero 3mm', cantidad: 10 }
          ]
        },
        {
          id: 7,
          proveedor: 'Suministros Industriales',
          fechaRecepcion: '12/05/2023',
          estado: 'completado',
          articulos: [
            { id: 19, codigo: 'TRN-INOX-4', descripcion: 'Tornillo inoxidable 4x20', cantidad: 200 },
            { id: 20, codigo: 'TRN-INOX-6', descripcion: 'Tornillo inoxidable 6x30', cantidad: 150 }
          ]
        }
      ];

      const mockUbicaciones = [
        'Almacén principal - Pasillo 1',
        'Estantería central - Zona B',
        'Pasillo 3 - Estante alto',
        'Zona de carga - Estantería metálica',
        'Almacén auxiliar',
        'Almacén exterior - Área A',
        'Pasillo eléctrico - Estante 2',
        'Zona de fontanería',
        'Almacén materiales pesados',
        'Mostrador principal'
      ];

      setPaquetes(mockPaquetes);
      setUbicaciones(mockUbicaciones);
    }
  }, []);

  useEffect(() => {
    const dataToSave = { paquetes, ubicaciones };
    localStorage.setItem('entradaStockData', JSON.stringify(dataToSave));
    console.log("📦 Paquetes guardados:", paquetes);
  }, [paquetes, ubicaciones]);

  const seleccionarPaquete = (paquete) => {
    setPaqueteSeleccionado(paquete);
    const savedAsignaciones = JSON.parse(localStorage.getItem(`asignaciones-${paquete.id}`)) || {};
    setAsignaciones(savedAsignaciones);
  };

  const agregarUbicacion = (articuloId) => {
    setAsignaciones(prev => {
      const nuevasAsignaciones = { ...prev };
      if (!nuevasAsignaciones[articuloId]) {
        nuevasAsignaciones[articuloId] = [];
      }
      const tieneVacia = nuevasAsignaciones[articuloId].some(u => u.ubicacion === '' || u.cantidad === 0);
      if (!tieneVacia) {
        nuevasAsignaciones[articuloId].push({
          ubicacion: ubicaciones[0],
          cantidad: 0,
          id: Date.now()
        });
      }
      return nuevasAsignaciones;
    });
  };

  const eliminarUbicacion = (articuloId, ubicacionId) => {
    setAsignaciones(prev => {
      const nuevasAsignaciones = {
        ...prev,
        [articuloId]: prev[articuloId].filter(u => u.id !== ubicacionId)
      };
      localStorage.setItem(`asignaciones-${paqueteSeleccionado.id}`, JSON.stringify(nuevasAsignaciones));
      return nuevasAsignaciones;
    });
  };

  const cambiarUbicacion = (articuloId, ubicacionId, campo, valor) => {
    setAsignaciones(prev => {
      const nuevasAsignaciones = {
        ...prev,
        [articuloId]: prev[articuloId].map(u => 
          u.id === ubicacionId ? { ...u, [campo]: valor } : u
        )
      };
      localStorage.setItem(`asignaciones-${paqueteSeleccionado.id}`, JSON.stringify(nuevasAsignaciones));
      return nuevasAsignaciones;
    });
  };

  const calcularPendiente = (articulo) => {
    if (!asignaciones[articulo.id]) return articulo.cantidad;
    const asignado = asignaciones[articulo.id].reduce((sum, u) => sum + (Number(u.cantidad) || 0), 0);
    return articulo.cantidad - asignado;
  };

  const guardarAsignaciones = (completar = false) => {
    if (completar) {
      const nuevoPaquetes = paquetes.map(p =>
        p.id === paqueteSeleccionado.id ? { ...p, estado: 'completado' } : p
      );
      setPaquetes(nuevoPaquetes);
      localStorage.setItem('entradaStockData', JSON.stringify({ paquetes: nuevoPaquetes, ubicaciones }));
    }
    setPaqueteSeleccionado(null);
    setAsignaciones({});
  };

  const paquetesPendientes = paquetes.filter(p => p.estado === 'pendiente');
  const paquetesCompletados = paquetes.filter(p => p.estado === 'completado');

  return (
    <div className="entrada-stock-container">
      <div className="entrada-stock-header">
        <h2>📦 Entrada de Stock - Recepción de Compras</h2>
        <button onClick={() => navigate('/PedidosScreen')} className="btn-volver-menu">🔙 Volver</button>
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
      </div>

      <button
        onClick={() => {
          localStorage.removeItem('entradaStockData');
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('asignaciones-')) {
              localStorage.removeItem(key);
            }
          });
          window.location.reload();
        }}
        className="btn-reiniciar"
      >
        🔄 Reiniciar datos
      </button>

      {!paqueteSeleccionado ? (
        <div className="contenedor-principal">
          <div className="lista-paquetes">
            <h3>Paquetes pendientes de ubicación</h3>
            {paquetesPendientes.length > 0 ? (
              paquetesPendientes.map(paquete => (
                <div key={paquete.id} className="paquete-card" onClick={() => seleccionarPaquete(paquete)}>
                  <div className="fila"><span className="etiqueta">Proveedor:</span><span className="valor">{paquete.proveedor}</span></div>
                  <div className="fila"><span className="etiqueta">Fecha:</span><span className="valor">{paquete.fechaRecepcion}</span></div>
                  <div className="fila"><span className="etiqueta">Artículos:</span><span className="valor">{paquete.articulos.length}</span></div>
                </div>
              ))
            ) : (
              <p className="sin-paquetes">No hay paquetes pendientes</p>
            )}
          </div>

          <div className="lista-paquetes">
            <div className="encabezado-completados" onClick={() => setMostrarCompletados(!mostrarCompletados)}>
              <h3>Paquetes ubicados</h3>
              <span>{mostrarCompletados ? '▲' : '▼'}</span>
            </div>
            {mostrarCompletados && paquetesCompletados.length > 0 ? (
              paquetesCompletados.map(paquete => (
                <div key={paquete.id} className="paquete-card completado">
                  <div className="fila"><span className="etiqueta">Proveedor:</span><span className="valor">{paquete.proveedor}</span></div>
                  <div className="fila"><span className="etiqueta">Fecha:</span><span className="valor">{paquete.fechaRecepcion}</span></div>
                  <div className="fila"><span className="etiqueta">Artículos:</span><span className="valor">{paquete.articulos.length}</span></div>
                  <div className="fila"><span className="etiqueta">Estado:</span><span className="valor estado-completo">COMPLETADO</span></div>
                </div>
              ))
            ) : mostrarCompletados && (
              <p className="sin-paquetes">No hay paquetes completados</p>
            )}
          </div>
        </div>
      ) : (
        <div className="detalle-paquete">
          <button onClick={() => guardarAsignaciones(false)} className="btn-volver">← Volver a paquetes</button>

          <div className="encabezado-paquete">
            <h3>Paquete de {paqueteSeleccionado.proveedor}</h3>
            <p className="fecha">Fecha recepción: {paqueteSeleccionado.fechaRecepcion}</p>
          </div>

          <div className="tabla-contenedor">
            <table className="tabla-articulos">
              <thead>
                <tr>
                  <th className="columna-codigo">Código</th>
                  <th className="columna-descripcion">Descripción</th>
                  <th className="columna-cantidad">Cantidad</th>
                  <th className="columna-ubicaciones">Ubicaciones</th>
                  <th className="columna-pendiente">Pendiente</th>
                  <th className="columna-acciones">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paqueteSeleccionado.articulos.map(articulo => {
                  const pendiente = calcularPendiente(articulo);
                  return (
                    <React.Fragment key={articulo.id}>
                      <tr>
                        <td>{articulo.codigo}</td>
                        <td>{articulo.descripcion}</td>
                        <td>{articulo.cantidad}</td>
                        <td>{asignaciones[articulo.id]?.length || 0}</td>
                        <td className={pendiente === 0 ? 'completo' : 'pendiente'}>{pendiente}</td>
                        <td>
                          <button
                            onClick={() => setMostrarUbicaciones(mostrarUbicaciones === articulo.id ? null : articulo.id)}
                            className="btn-ubicar"
                            disabled={pendiente === 0}
                          >
                            {mostrarUbicaciones === articulo.id ? 'Ocultar' : 'Ubicar'}
                          </button>
                        </td>
                      </tr>
                      {mostrarUbicaciones === articulo.id && (
                        <tr className="ubicaciones-row">
                          <td colSpan="6">
                            <div className="ubicaciones-container">
                              <button
                                onClick={() => agregarUbicacion(articulo.id)}
                                className="btn-agregar"
                                disabled={pendiente === 0}
                              >
                                + Añadir ubicación
                              </button>
                              {asignaciones[articulo.id]?.map(ubicacion => (
                                <div key={ubicacion.id} className="ubicacion-item">
                                  <select
                                    value={ubicacion.ubicacion}
                                    onChange={(e) => cambiarUbicacion(articulo.id, ubicacion.id, 'ubicacion', e.target.value)}
                                    className="select-ubicacion"
                                  >
                                    {ubicaciones.map(ubi => (
                                      <option key={ubi} value={ubi}>{ubi}</option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    min="0"
                                    max={pendiente + (Number(ubicacion.cantidad) || 0)}
                                    value={ubicacion.cantidad}
                                    onChange={(e) => {
                                      const max = pendiente + (Number(ubicacion.cantidad) || 0);
                                      const value = Math.min(Number(e.target.value), max);
                                      cambiarUbicacion(articulo.id, ubicacion.id, 'cantidad', value);
                                    }}
                                    placeholder="Cantidad"
                                    className="input-cantidad"
                                  />
                                  <button
                                    onClick={() => eliminarUbicacion(articulo.id, ubicacion.id)}
                                    className="btn-eliminar"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              <div className="resumen">
                                <strong>Total asignado:</strong> {asignaciones[articulo.id]?.reduce((sum, u) => sum + (Number(u.cantidad) || 0), 0) || 0} / {articulo.cantidad}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="acciones">
            <button onClick={() => guardarAsignaciones(false)} className="btn-guardar">Guardar cambios</button>
            {paqueteSeleccionado.articulos.every(art => calcularPendiente(art) === 0) && (
              <button onClick={() => guardarAsignaciones(true)} className="btn-completar">Marcar como completado</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default EntradaStockCompras;