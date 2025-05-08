import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/PreparacionPedidos.css';

function PreparacionPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [ubicacionesArticulo, setUbicacionesArticulo] = useState({});
  const [mostrarUbicaciones, setMostrarUbicaciones] = useState(null);
  const navigate = useNavigate();

  // Cargar datos del localStorage al inicio
  useEffect(() => {
    const savedData = localStorage.getItem('preparacionPedidosData');
    if (savedData) {
      const { pedidos: savedPedidos, ubicaciones: savedUbicaciones } = JSON.parse(savedData);
      setPedidos(savedPedidos);
      setUbicacionesArticulo(savedUbicaciones);
    } else {
      // Mock de datos iniciales
      const mockPedidos = [
        {
          id: 1025,
          cliente: 'Construcciones Díaz S.L.',
          fecha: '25/05/2023',
          estado: 'pendiente',
          articulos: [
            { id: 1, codigo: 'TRN-6X50', descripcion: 'Tornillo hexagonal 6x50 mm', cantidad: 15, completado: 0 },
            { id: 2, codigo: 'TRC-M8', descripcion: 'Tuerca M8 galvanizada', cantidad: 23, completado: 0 },
            { id: 3, codigo: 'TUB-ALU-20', descripcion: 'Tubo aluminio 20mm', cantidad: 12, completado: 0 },
          ]
        },
        {
          id: 1026,
          cliente: 'Instalaciones Técnicas Martínez',
          fecha: '26/05/2023',
          estado: 'pendiente',
          articulos: [
            { id: 4, codigo: 'BRD-40', descripcion: 'Brida de acero 40mm', cantidad: 8, completado: 0 },
            { id: 5, codigo: 'VLV-1/2', descripcion: 'Válvula de bola 1/2"', cantidad: 5, completado: 0 },
          ]
        }
      ];

      const mockUbicaciones = {
        'TRN-6X50': [
          { nombre: 'Almacén principal - Pasillo 1', cantidad: 50 },
          { nombre: 'Estantería central - Zona B', cantidad: 30 }
        ],
        'TRC-M8': [
          { nombre: 'Pasillo 3 - Estante alto', cantidad: 40 }
        ],
        'TUB-ALU-20': [
          { nombre: 'Zona de carga - Estantería metálica', cantidad: 11 }
        ],
        'BRD-40': [
          { nombre: 'Almacén auxiliar', cantidad: 15 }
        ],
        'VLV-1/2': [
          { nombre: 'Almacén principal - Pasillo 2', cantidad: 10 }
        ]
      };

      setPedidos(mockPedidos);
      setUbicacionesArticulo(mockUbicaciones);
    }
  }, []);

  // Guardar datos en localStorage cuando cambian
  useEffect(() => {
    const dataToSave = {
      pedidos,
      ubicaciones: ubicacionesArticulo
    };
    localStorage.setItem('preparacionPedidosData', JSON.stringify(dataToSave));
  }, [pedidos, ubicacionesArticulo]);

  const seleccionarPedido = (pedido) => {
    setPedidoSeleccionado(pedido);
  };

  const cargarArticulo = (articuloId) => {
    setMostrarUbicaciones(mostrarUbicaciones === articuloId ? null : articuloId);
  };

  const marcarCompletado = (articuloId, cantidad, ubicacionNombre) => {
    const cantidadNum = Number(cantidad);
    if (cantidadNum <= 0) return;

    setPedidos(prevPedidos => {
      return prevPedidos.map(ped => {
        if (ped.id === pedidoSeleccionado.id) {
          return {
            ...ped,
            articulos: ped.articulos.map(art => {
              if (art.id === articuloId) {
                return { ...art, completado: Math.min(art.completado + cantidadNum, art.cantidad) };
              }
              return art;
            })
          };
        }
        return ped;
      });
    });

    setUbicacionesArticulo(prev => {
      const nuevasUbicaciones = { ...prev };
      const codigoArticulo = pedidoSeleccionado.articulos.find(a => a.id === articuloId)?.codigo;
      
      if (codigoArticulo && nuevasUbicaciones[codigoArticulo]) {
        nuevasUbicaciones[codigoArticulo] = nuevasUbicaciones[codigoArticulo].map(ubi => {
          if (ubi.nombre === ubicacionNombre) {
            return { ...ubi, cantidad: Math.max(ubi.cantidad - cantidadNum, 0) };
          }
          return ubi;
        });
      }
      
      return nuevasUbicaciones;
    });

    // Ocultar las ubicaciones después de tomar
    setMostrarUbicaciones(null);
  };

  const guardarCambios = () => {
    setPedidoSeleccionado(null);
  };

  const confirmarEntrega = () => {
    if (pedidoSeleccionado) {
      // Marcar el pedido como completado
      setPedidos(prev => prev.map(p => 
        p.id === pedidoSeleccionado.id ? { ...p, estado: 'completado' } : p
      ));
      
      navigate(`/confirmar-entrega/${pedidoSeleccionado.id}`, {
        state: { pedido: pedidoSeleccionado }
      });
    }
  };

  const estaCompleto = () => {
    if (!pedidoSeleccionado) return false;
    return pedidoSeleccionado.articulos.every(art => art.completado >= art.cantidad);
  };

  return (
    <div className="preparacion-pedidos-container">
      <h2>Preparación de Pedidos</h2>
      
      {!pedidoSeleccionado ? (
        <div className="lista-pedidos">
          <h3>Pedidos pendientes</h3>
          {pedidos.filter(p => p.estado === 'pendiente').map(pedido => (
            <div key={pedido.id} className="pedido-card" onClick={() => seleccionarPedido(pedido)}>
              <div className="fila">
                <span className="etiqueta">Pedido:</span>
                <span className="valor">#{pedido.id}</span>
              </div>
              <div className="fila">
                <span className="etiqueta">Cliente:</span>
                <span className="valor">{pedido.cliente}</span>
              </div>
              <div className="fila">
                <span className="etiqueta">Fecha:</span>
                <span className="valor">{pedido.fecha}</span>
              </div>
              <div className="fila">
                <span className="etiqueta">Artículos:</span>
                <span className="valor">{pedido.articulos.length}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="detalle-pedido">
          <button onClick={guardarCambios} className="btn-volver">
            ← Volver a pedidos
          </button>
          
          <div className="encabezado-pedido">
            <h3>Pedido #{pedidoSeleccionado.id}</h3>
            <p className="fecha">Cliente: {pedidoSeleccionado.cliente} - Fecha: {pedidoSeleccionado.fecha}</p>
          </div>
          
          <div className="tabla-contenedor">
            <table className="tabla-articulos">
              <thead>
                <tr>
                  <th className="columna-codigo">Código</th>
                  <th className="columna-descripcion">Descripción</th>
                  <th className="columna-cantidad">Cantidad</th>
                  <th className="columna-estado">Estado</th>
                  <th className="columna-acciones">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidoSeleccionado.articulos.map(articulo => {
                  const completado = articulo.completado >= articulo.cantidad;
                  const codigoArticulo = articulo.codigo;
                  const ubicaciones = ubicacionesArticulo[codigoArticulo] || [];
                  
                  return (
                    <React.Fragment key={articulo.id}>
                      <tr className={completado ? 'completado' : ''}>
                        <td className="columna-codigo">{codigoArticulo}</td>
                        <td className="columna-descripcion">{articulo.descripcion}</td>
                        <td className="columna-cantidad">
                          {completado ? (
                            <span className="tachado">{articulo.cantidad}</span>
                          ) : (
                            `${articulo.completado} / ${articulo.cantidad}`
                          )}
                        </td>
                        <td className="columna-estado">
                          {completado ? (
                            <span className="estado-completo">✔ Completado</span>
                          ) : articulo.completado > 0 ? (
                            <span className="estado-parcial">⚠ Parcial</span>
                          ) : (
                            <span className="estado-pendiente">✖ Pendiente</span>
                          )}
                        </td>
                        <td className="columna-acciones">
                          <button 
                            onClick={() => cargarArticulo(articulo.id)}
                            className="btn-cargar"
                            disabled={completado}
                          >
                            Cargar
                          </button>
                        </td>
                      </tr>
                      
                      {mostrarUbicaciones === articulo.id && (
                        <tr className="ubicaciones-row">
                          <td colSpan="5">
                            <div className="ubicaciones-container">
                              <h4>Ubicaciones disponibles:</h4>
                              
                              {ubicaciones.length > 0 ? (
                                <table className="tabla-ubicaciones">
                                  <thead>
                                    <tr>
                                      <th>Ubicación</th>
                                      <th>Stock</th>
                                      <th>Cantidad a tomar</th>
                                      <th>Acción</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ubicaciones.map((ubicacion, idx) => {
                                      const maxCantidad = Math.min(
                                        ubicacion.cantidad,
                                        articulo.cantidad - articulo.completado
                                      );
                                      
                                      return (
                                        <tr key={idx}>
                                          <td>{ubicacion.nombre}</td>
                                          <td>{ubicacion.cantidad}</td>
                                          <td>
                                            <input
                                              type="number"
                                              min="0"
                                              max={maxCantidad}
                                              defaultValue="0"
                                              id={`cantidad-${articulo.id}-${idx}`}
                                              className="input-cantidad"
                                            />
                                          </td>
                                          <td>
                                            <button
                                              onClick={() => {
                                                const cantidadInput = document.getElementById(
                                                  `cantidad-${articulo.id}-${idx}`
                                                );
                                                const cantidad = Number(cantidadInput.value);
                                                
                                                if (cantidad > 0 && cantidad <= maxCantidad) {
                                                  marcarCompletado(articulo.id, cantidad, ubicacion.nombre);
                                                } else {
                                                  alert(`La cantidad debe estar entre 0 y ${maxCantidad}`);
                                                }
                                              }}
                                              className="btn-tomar"
                                            >
                                              Tomar
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="sin-stock">No hay stock disponible para este artículo</p>
                              )}
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
            <button 
              onClick={guardarCambios}
              className="btn-guardar"
            >
              Guardar cambios
            </button>
            
            {estaCompleto() && (
              <button 
                onClick={confirmarEntrega}
                className="btn-completar"
              >
                Confirmar Entrega
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PreparacionPedidos;