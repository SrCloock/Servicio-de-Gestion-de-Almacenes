import { useState, useEffect } from 'react';
import '../styles/styleEstadisticasCliente.css';

function EstadisticasClientePage() {
  const [cif, setCif] = useState('');
  const [tabActiva, setTabActiva] = useState('historico-pedidos');
  const [pedidos, setPedidos] = useState([]);
  const [consumos, setConsumos] = useState([]);
  const [cobros, setCobros] = useState([]); // <-- nuevo estado para cobros

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cifParam = params.get('cif');
    if (cifParam) {
      setCif(cifParam);
      cargarHistoricoPedidos(cifParam);
      cargarConsumos(cifParam);
      cargarCobros(cifParam); // <-- cargar también cobros
    }
  }, []);

  const cargarHistoricoPedidos = async (cif) => {
    try {
      const response = await fetch(`http://localhost:3000/historicoPedidos?cif=${cif}`);
      const data = await response.json();
      setPedidos(data);
    } catch (error) {
      console.error('Error al cargar histórico de pedidos:', error);
    }
  };

  const cargarConsumos = async (cif) => {
    try {
      const response = await fetch(`http://localhost:3000/consumosCliente?cif=${cif}`);
      const data = await response.json();
      setConsumos(data);
    } catch (error) {
      console.error('Error al cargar consumos:', error);
    }
  };

  const cargarCobros = async (cif) => { // <-- nueva función
    try {
      const response = await fetch(`http://localhost:3000/cobrosCliente?cif=${cif}`);
      const data = await response.json();
      setCobros(data);
    } catch (error) {
      console.error('Error al cargar cobros:', error);
    }
  };

  const cambiarTab = (tabId) => {
    setTabActiva(tabId);
  };

  const volver = () => {
    const clienteGuardado = JSON.parse(localStorage.getItem('clienteSeleccionado'));
    if (clienteGuardado?.CodigoCliente) {
      window.location.href = `/clientes/ficha?codigo=${clienteGuardado.CodigoCliente}`;
    } else {
      window.location.href = '/clientes';
    }
  };

  return (
    <div className="dashboard-body">
      <header className="top-menu">
        <img src="/img/eurobag-logo.jpg" className="logo" alt="Eurobag" />
        <div className="icon">🧾<span>Cliente</span></div>
        <div className="icon">📋<span>Potencial</span></div>
        <div className="icon">🗓️<span>Calend.</span></div>
        <div className="icon">💲<span>Gastos</span></div>
      </header>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tabActiva === 'historico-pedidos' ? 'active' : ''}`} onClick={() => cambiarTab('historico-pedidos')}>Histórico Pedidos</button>
        <button className={`tab ${tabActiva === 'ultimas-visitas' ? 'active' : ''}`} onClick={() => cambiarTab('ultimas-visitas')}>Últimas Visitas</button>
        <button className={`tab ${tabActiva === 'cobros' ? 'active' : ''}`} onClick={() => cambiarTab('cobros')}>Cobros</button>
        <button className={`tab ${tabActiva === 'consumos' ? 'active' : ''}`} onClick={() => cambiarTab('consumos')}>Consumos</button>
      </div>

      {/* Contenido de pestañas */}
      <div className="tab-content-container">
        {tabActiva === 'historico-pedidos' && (
          <div className="tab-content active">
            <h3>Histórico de Pedidos - CIF: {cif}</h3>
            <table>
              <thead>
                <tr>
                  <th>Base Imponible</th>
                  <th>Código Comisionista</th>
                  <th>Fecha</th>
                  <th>Código Empresa</th>
                  <th>Número Pedido</th>
                  <th>Descripción Artículo</th>
                  <th>Descripción 2 Artículo</th>
                  <th>CIF</th>
                  <th>Unidades</th>
                  <th>Precio</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((pedido, index) => (
                  <tr key={index}>
                    <td>{Number(pedido.BaseImponible).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                    <td>{pedido.CodigoComisionista}</td>
                    <td>{pedido.FechaPedido ? new Date(pedido.FechaPedido).toLocaleDateString() : ''}</td>
                    <td>{pedido.CodigoEmpresa}</td>
                    <td>{pedido.NumeroPedido}</td>
                    <td>{pedido.DescripcionArticulo}</td>
                    <td>{pedido.Descripcion2Articulo}</td>
                    <td>{pedido.CifDni}</td>
                    <td>{Number(pedido.UnidadesPedidas).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                    <td>{Number(pedido.Precio).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

    {tabActiva === 'ultimas-visitas' && (
  <div className="tab-content active">
    <h3>Últimas Visitas - CIF: {cif}</h3>
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Nombre</th>
          <th>Hora Inicial</th>
          <th>Hora Final</th>
          <th>Observaciones</th>
          <th>Tipo Visita</th>
        </tr>
      </thead>
      <tbody>
        {/* Aquí no mostramos datos, solo simulamos que el diseño ya está listo */}
        <tr>
          <td colSpan="6" style={{ textAlign: 'center', color: 'gray' }}>
            No hay visitas registradas.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
)}

        {tabActiva === 'cobros' && (
          <div className="tab-content active">
            <h3>Cobros - CIF: {cif}</h3>
            <table>
              <thead>
                <tr>
                  <th>Código Cliente</th>
                  <th>Razón Social</th>
                  <th>Factura</th>
                  <th>Fecha Factura</th>
                  <th>Fecha Vencimiento</th>
                  <th>Tipo Efecto</th>
                  <th>Importe Pendiente</th>
                  <th>Comentario</th>
                </tr>
              </thead>
              <tbody>
                {cobros.map((cobro, index) => (
                  <tr key={index}>
                    <td>{cobro.CodigoClienteProveedor}</td>
                    <td>{cobro.RazonSocial}</td>
                    <td>{cobro.Factura}</td>
                    <td>{cobro.FechaFactura ? new Date(cobro.FechaFactura).toLocaleDateString() : ''}</td>
                    <td>{cobro.FechaVencimiento ? new Date(cobro.FechaVencimiento).toLocaleDateString() : ''}</td>
                    <td>{cobro.TipoEfecto}</td>
                    <td>{Number(cobro.ImportePendiente).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                    <td>{cobro.Comentario}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tabActiva === 'consumos' && (
          <div className="tab-content active">
            <h3>Consumos - CIF: {cif}</h3>
            <table>
              <thead>
                <tr>
                  <th>Año</th>
                  {consumos.length > 0 && 
                    Object.keys(consumos[0]).filter(k => k !== 'Anyo' && k !== 'Total').map((empresa, index) => (
                      <th key={index}>{empresa}</th>
                    ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {consumos.map((consumo, index) => (
                  <tr key={index}>
                    <td>{consumo.Anyo}</td>
                    {Object.keys(consumo).filter(k => k !== 'Anyo' && k !== 'Total').map((empresa, idx) => (
                      <td key={idx}>
                        {Number(consumo[empresa] || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                    ))}
                    <td>{Number(consumo.Total).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <button className="volver" onClick={volver}>VOLVER</button>
    </div>
  );
}

export default EstadisticasClientePage;
