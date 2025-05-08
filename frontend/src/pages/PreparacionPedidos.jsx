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
    const cantidadNum = Number(cantidad);
    if (cantidadNum <= 0) return;

    setPedidos(prev => prev.map(p => {
      if (p.id === pedidoSeleccionado.id) {
        return {
          ...p,
          articulos: p.articulos.map(art => art.id === articuloId
            ? { ...art, completado: Math.min(art.completado + cantidadNum, art.cantidad) }
            : art
          )
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

    setMostrarUbicaciones(null);
  };

  const guardarCambios = () => setPedidoSeleccionado(null);
  const estaCompleto = () =>
    pedidoSeleccionado?.articulos.every(art => art.completado >= art.cantidad);

  const reiniciarDatos = () => {
    localStorage.removeItem('preparacionPedidosData');
    cargarDatosMock();
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
          <h3>Pedidos pendientes</h3>
          {pedidos.filter(p => p.estado === 'pendiente').map(pedido => (
            <div key={pedido.id} className="pedido-card" onClick={() => seleccionarPedido(pedido)}>
              <div className="fila"><span className="etiqueta">Pedido:</span><span className="valor">#{pedido.id}</span></div>
              <div className="fila"><span className="etiqueta">Cliente:</span><span className="valor">{pedido.cliente}</span></div>
              <div className="fila"><span className="etiqueta">Fecha:</span><span className="valor">{pedido.fecha}</span></div>
              <div className="fila"><span className="etiqueta">Artículos:</span><span className="valor">{pedido.articulos.length}</span></div>
            </div>
          ))}
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
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Cantidad</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidoSeleccionado.articulos.map(articulo => {
                  const completado = articulo.completado >= articulo.cantidad;
                  const ubicaciones = ubicacionesArticulo[articulo.codigo] || [];
                  return (
                    <React.Fragment key={articulo.id}>
                      <tr className={completado ? 'completado' : ''}>
                        <td>{articulo.codigo}</td>
                        <td>{articulo.descripcion}</td>
                        <td>{completado ? <span className="tachado">{articulo.cantidad}</span> : `${articulo.completado} / ${articulo.cantidad}`}</td>
                        <td>{completado ? '✔ Completado' : articulo.completado > 0 ? '⚠ Parcial' : '✖ Pendiente'}</td>
                        <td>
                          <button
                            onClick={() => cargarArticulo(articulo.id)}
                            disabled={completado}
                            className="btn-cargar"
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
                                      <th>Cantidad</th>
                                      <th>Acción</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ubicaciones.map((ubi, idx) => {
                                      const max = Math.min(ubi.cantidad, articulo.cantidad - articulo.completado);
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
                                                const val = document.getElementById(`cantidad-${articulo.id}-${idx}`).value;
                                                if (val > 0 && val <= max) {
                                                  marcarCompletado(articulo.id, val, ubi.nombre);
                                                } else {
                                                  alert(`La cantidad debe estar entre 0 y ${max}`);
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
        </div>
      )}
    </div>
  );
}

export default PreparacionPedidos;
