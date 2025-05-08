import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/PreparacionPedidos.css';

function PreparacionPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [ubicacionesArticulo, setUbicacionesArticulo] = useState({});
  const [mostrarUbicaciones, setMostrarUbicaciones] = useState(null);
  const navigate = useNavigate();

  const cargarDatosMock = () => {
    const mockPedidos = [
      // Pedidos pendientes originales
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
      },
      // Nuevos pedidos pendientes
      {
        id: 1027,
        cliente: 'Electricidad Moderna S.A.',
        fecha: '27/05/2023',
        estado: 'pendiente',
        articulos: [
          { id: 6, codigo: 'CBL-2.5', descripcion: 'Cable eléctrico 2.5mm', cantidad: 50, completado: 0 },
          { id: 7, codigo: 'INT-16A', descripcion: 'Interruptor 16A', cantidad: 10, completado: 0 },
          { id: 8, codigo: 'TUB-PVC-25', descripcion: 'Tubo PVC 25mm', cantidad: 8, completado: 0 },
          { id: 9, codigo: 'FUS-10A', descripcion: 'Fusible 10A', cantidad: 15, completado: 0 }
        ]
      },
      {
        id: 1028,
        cliente: 'Herrería Industrial',
        fecha: '28/05/2023',
        estado: 'pendiente',
        articulos: [
          { id: 10, codigo: 'CHP-30', descripcion: 'Chapas acero 30x30cm', cantidad: 20, completado: 0 },
          { id: 11, codigo: 'PNL-AL-2', descripcion: 'Panel aluminio 2mm', cantidad: 5, completado: 0 },
          { id: 12, codigo: 'TRN-INOX-5', descripcion: 'Tornillo inoxidable 5x20', cantidad: 100, completado: 0 }
        ]
      },
      // Pedidos completados
      {
        id: 1021,
        cliente: 'Fontanería Rápida',
        fecha: '21/05/2023',
        estado: 'completado',
        articulos: [
          { id: 13, codigo: 'TUB-CU-15', descripcion: 'Tubo cobre 15mm', cantidad: 10, completado: 10 },
          { id: 14, codigo: 'CODO-15', descripcion: 'Codo cobre 15mm', cantidad: 8, completado: 8 },
          { id: 15, codigo: 'VLV-ESF-3/4', descripcion: 'Válvula esférica 3/4"', cantidad: 4, completado: 4 }
        ]
      },
      {
        id: 1022,
        cliente: 'Carpintería Martínez',
        fecha: '22/05/2023',
        estado: 'completado',
        articulos: [
          { id: 16, codigo: 'TCL-40', descripcion: 'Tiraclavo 40mm', cantidad: 50, completado: 50 },
          { id: 17, codigo: 'BIS-35', descripcion: 'Bisagra 35mm', cantidad: 12, completado: 12 },
          { id: 18, codigo: 'CLV-50', descripcion: 'Clavo 50mm', cantidad: 200, completado: 200 }
        ]
      },
      {
        id: 1023,
        cliente: 'Taller Mecánico AutoRapido',
        fecha: '23/05/2023',
        estado: 'completado',
        articulos: [
          { id: 19, codigo: 'BND-12', descripcion: 'Banda elástica 12mm', cantidad: 5, completado: 5 },
          { id: 20, codigo: 'ABR-120', descripcion: 'Lija abrasiva 120', cantidad: 10, completado: 10 },
          { id: 21, codigo: 'GRS-LIT', descripcion: 'Grasa lubricante 1L', cantidad: 3, completado: 3 },
          { id: 22, codigo: 'JUN-NBR', descripcion: 'Junta NBR 50mm', cantidad: 8, completado: 8 }
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
      ],
      'CBL-2.5': [
        { nombre: 'Almacén eléctrico - Rack 1', cantidad: 120 },
        { nombre: 'Mostrador principal', cantidad: 30 }
      ],
      'INT-16A': [
        { nombre: 'Caja de interruptores', cantidad: 25 }
      ],
      'TUB-PVC-25': [
        { nombre: 'Exterior - Estantería PVC', cantidad: 15 }
      ],
      'FUS-10A': [
        { nombre: 'Caja de fusibles', cantidad: 40 }
      ],
      'CHP-30': [
        { nombre: 'Almacén metales - Zona A', cantidad: 35 }
      ],
      'PNL-AL-2': [
        { nombre: 'Almacén metales - Zona B', cantidad: 8 }
      ],
      'TRN-INOX-5': [
        { nombre: 'Pasillo 4 - Estante bajo', cantidad: 200 }
      ],
      'TUB-CU-15': [
        { nombre: 'Almacén fontanería', cantidad: 25 }
      ],
      'CODO-15': [
        { nombre: 'Almacén fontanería', cantidad: 20 }
      ],
      'VLV-ESF-3/4': [
        { nombre: 'Mostrador fontanería', cantidad: 12 }
      ],
      'TCL-40': [
        { nombre: 'Pasillo 5 - Estante medio', cantidad: 100 }
      ],
      'BIS-35': [
        { nombre: 'Caja de herrajes', cantidad: 30 }
      ],
      'CLV-50': [
        { nombre: 'Pasillo 1 - Estante alto', cantidad: 500 }
      ],
      'BND-12': [
        { nombre: 'Almacén taller', cantidad: 15 }
      ],
      'ABR-120': [
        { nombre: 'Estantería abrasivos', cantidad: 25 }
      ],
      'GRS-LIT': [
        { nombre: 'Estantería líquidos', cantidad: 10 }
      ],
      'JUN-NBR': [
        { nombre: 'Caja de juntas', cantidad: 20 }
      ]
    };

    setPedidos(mockPedidos);
    setUbicacionesArticulo(mockUbicaciones);
  };

  useEffect(() => {
    let cargarMock = false;
    try {
      const savedData = localStorage.getItem('preparacionPedidosData');
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed?.pedidos?.length > 0 && parsed?.ubicaciones) {
          setPedidos(parsed.pedidos);
          setUbicacionesArticulo(parsed.ubicaciones);
        } else {
          cargarMock = true;
        }
      } else {
        cargarMock = true;
      }
    } catch (e) {
      console.error("Error al leer localStorage:", e);
      cargarMock = true;
    }

    if (cargarMock) {
      cargarDatosMock();
    }
  }, []);

  useEffect(() => {
    const dataToSave = {
      pedidos,
      ubicaciones: ubicacionesArticulo
    };
    localStorage.setItem('preparacionPedidosData', JSON.stringify(dataToSave));
  }, [pedidos, ubicacionesArticulo]);

  const seleccionarPedido = (pedido) => setPedidoSeleccionado(pedido);
  const cargarArticulo = (id) => setMostrarUbicaciones(mostrarUbicaciones === id ? null : id);

  const marcarCompletado = (articuloId, cantidad, ubicacionNombre) => {
    let cantidadNum = Number(cantidad);
    const articulo = pedidoSeleccionado.articulos.find(a => a.id === articuloId);
    const maxPermitido = articulo.cantidad - articulo.completado;
    
    if (cantidadNum > maxPermitido) {
      cantidadNum = maxPermitido;
    }

    if (cantidadNum <= 0) return;

    setPedidoSeleccionado(prev => {
      const articulosActualizados = prev.articulos.map(art => 
        art.id === articuloId
          ? { ...art, completado: art.completado + cantidadNum }
          : art
      );
      
      return {
        ...prev,
        articulos: articulosActualizados
      };
    });

    setPedidos(prev => prev.map(p => {
      if (p.id === pedidoSeleccionado.id) {
        const articulosActualizados = p.articulos.map(art => 
          art.id === articuloId
            ? { ...art, completado: art.completado + cantidadNum }
            : art
        );
        
        return {
          ...p,
          articulos: articulosActualizados,
          estado: articulosActualizados.every(art => art.completado >= art.cantidad) 
            ? 'completado' 
            : p.estado
        };
      }
      return p;
    }));

    const codigoArticulo = pedidoSeleccionado.articulos.find(a => a.id === articuloId)?.codigo;
    setUbicacionesArticulo(prev => {
      const nuevas = { ...prev };
      if (codigoArticulo && nuevas[codigoArticulo]) {
        nuevas[codigoArticulo] = nuevas[codigoArticulo].map(ubi =>
          ubi.nombre === ubicacionNombre
            ? { ...ubi, cantidad: Math.max(ubi.cantidad - cantidadNum, 0) }
            : ubi
        );
      }
      return nuevas;
    });
  };

  const guardarCambios = () => {
    setPedidos(prev => prev.map(p => 
      p.id === pedidoSeleccionado.id ? pedidoSeleccionado : p
    ));
    setPedidoSeleccionado(null);
  };

  const marcarComoCompletado = () => {
    setPedidos(prev => prev.map(p => 
      p.id === pedidoSeleccionado.id 
        ? { ...p, estado: 'completado' } 
        : p
    ));
    setPedidoSeleccionado(null);
  };

  const estaCompleto = () =>
    pedidoSeleccionado?.articulos.every(art => art.completado >= art.cantidad);

  const reiniciarDatos = () => {
    localStorage.removeItem('preparacionPedidosData');
    cargarDatosMock();
    setPedidoSeleccionado(null);
  };

  return (
    <div className="preparacion-pedidos-container">
      <div className="preparacion-header">
        <h2>📋 Preparación de Pedidos</h2>
        <button onClick={() => navigate('/PedidosScreen')} className="btn-volver-menu">🔙 Volver</button>
        <button onClick={reiniciarDatos} className="btn-reiniciar">🔄 Reiniciar pedidos</button>
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
      </div>

      {!pedidoSeleccionado ? (
        <div className="lista-pedidos">
          <div className="seccion-pedidos">
            <h3>Pedidos pendientes</h3>
            <div className="pedidos-grid">
              {pedidos.filter(p => p.estado === 'pendiente').map(pedido => (
                <div key={pedido.id} className="pedido-card" onClick={() => seleccionarPedido(pedido)}>
                  <div className="fila"><span className="etiqueta">Pedido:</span><span className="valor">#{pedido.id}</span></div>
                  <div className="fila"><span className="etiqueta">Cliente:</span><span className="valor">{pedido.cliente}</span></div>
                  <div className="fila"><span className="etiqueta">Fecha:</span><span className="valor">{pedido.fecha}</span></div>
                  <div className="fila"><span className="etiqueta">Artículos:</span><span className="valor">{pedido.articulos.length}</span></div>
                </div>
              ))}
            </div>
          </div>

          <div className="seccion-pedidos">
            <h3>Pedidos completados</h3>
            <div className="pedidos-grid">
              {pedidos.filter(p => p.estado === 'completado').map(pedido => (
                <div key={pedido.id} className="pedido-card completado">
                  <div className="fila"><span className="etiqueta">Pedido:</span><span className="valor">#{pedido.id}</span></div>
                  <div className="fila"><span className="etiqueta">Cliente:</span><span className="valor">{pedido.cliente}</span></div>
                  <div className="fila"><span className="etiqueta">Fecha:</span><span className="valor">{pedido.fecha}</span></div>
                  <div className="fila"><span className="etiqueta">Estado:</span><span className="valor estado-completo">COMPLETADO</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="detalle-pedido">
          <button onClick={guardarCambios} className="btn-volver">← Volver a pedidos</button>

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
                  const ubicaciones = ubicacionesArticulo[articulo.codigo] || [];
                  return (
                    <React.Fragment key={articulo.id}>
                      <tr className={completado ? 'completado' : ''}>
                        <td className="columna-codigo">{articulo.codigo}</td>
                        <td className="columna-descripcion">{articulo.descripcion}</td>
                        <td className="columna-cantidad">{completado ? <span className="tachado">{articulo.cantidad}</span> : `${articulo.completado} / ${articulo.cantidad}`}</td>
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
                            className={`btn-cargar ${completado ? 'completado' : ''}`}
                          >
                            Cargar
                          </button>
                        </td>
                      </tr>
                      {mostrarUbicaciones === articulo.id && (
                        <tr className="ubicaciones-row">
                          <td colSpan="5">
                            <div className="ubicaciones-container">
                              <h4>Ubicaciones disponibles (Restante: {articulo.cantidad - articulo.completado})</h4>
                              {ubicaciones.length > 0 ? (
                                <table className="tabla-ubicaciones">
                                  <thead>
                                    <tr>
                                      <th>Ubicación</th>
                                      <th>Stock</th>
                                      <th>Cantidad a cargar</th>
                                      <th>Acción</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ubicaciones.map((ubi, idx) => {
                                      const max = Math.min(
                                        ubi.cantidad, 
                                        articulo.cantidad - articulo.completado
                                      );
                                      return (
                                        <tr key={idx}>
                                          <td>{ubi.nombre}</td>
                                          <td>{ubi.cantidad}</td>
                                          <td>
                                            <input
                                              type="number"
                                              min="0"
                                              max={max}
                                              defaultValue="0"
                                              id={`cantidad-${articulo.id}-${idx}`}
                                              className="input-cantidad"
                                            />
                                          </td>
                                          <td>
                                            <button
                                              onClick={() => {
                                                const input = document.getElementById(`cantidad-${articulo.id}-${idx}`);
                                                let val = Number(input.value);
                                                if (val > max) {
                                                  val = max;
                                                  input.value = max;
                                                }
                                                if (val > 0) {
                                                  marcarCompletado(articulo.id, val, ubi.nombre);
                                                  input.value = "0";
                                                }
                                              }}
                                              className="btn-tomar"
                                              disabled={max <= 0}
                                            >
                                              {max <= 0 ? 'Completado' : 'Tomar'}
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              ) : (
                                <p>No hay stock disponible</p>
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
              Guardar pedido
            </button>
            {estaCompleto() && (
              <button 
                onClick={marcarComoCompletado}
                className="btn-completar"
              >
                Marcar como completado
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PreparacionPedidos;