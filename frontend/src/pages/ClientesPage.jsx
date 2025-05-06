import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/styleCliente.css';

function ClientesPage() {
  const [datos, setDatos] = useState([]);
  const [filtroNombre, setFiltroNombre] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('CodigoCliente');
  const [valorFiltro, setValorFiltro] = useState('');
  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [campoOrden, setCampoOrden] = useState('');
  const [ordenAscendente, setOrdenAscendente] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    const codigoEmpresaSeleccionada = localStorage.getItem('codigoEmpresaSeleccionada');
    const nombreEmpresaSeleccionada = localStorage.getItem('nombreEmpresaSeleccionada');

    if (codigoEmpresaSeleccionada) {
      setEmpresaFiltro(nombreEmpresaSeleccionada || '');

      fetch(`http://localhost:3000/clientes?codigoEmpresa=${codigoEmpresaSeleccionada}`)
        .then(response => response.json())
        .then(data => setDatos(data))
        .catch(error => console.error('Error al cargar clientes:', error));
    }
  }, []);

  const ordenarTabla = (campo) => {
    let nuevaOrdenAscendente = true;
    if (campo === campoOrden) {
      nuevaOrdenAscendente = !ordenAscendente;
    }

    const datosOrdenados = [...datos].sort((a, b) => {
      let valA = a[campo];
      let valB = b[campo];
      const esNumero = !isNaN(Number(valA)) && !isNaN(Number(valB));

      if (esNumero) {
        valA = Number(valA);
        valB = Number(valB);
      } else {
        valA = (valA || '').toString().toUpperCase();
        valB = (valB || '').toString().toUpperCase();
      }

      if (valA < valB) return nuevaOrdenAscendente ? -1 : 1;
      if (valA > valB) return nuevaOrdenAscendente ? 1 : -1;
      return 0;
    });

    setDatos(datosOrdenados);
    setCampoOrden(campo);
    setOrdenAscendente(nuevaOrdenAscendente);
  };

  const filtrarClientes = () => {
    const campoMap = {
      CodigoCliente: 'CodigoCliente',
      Nombre: 'Nombre',
      Domicilio: 'Domicilio',
      Municipio: 'Municipio',
      Provincia: 'Provincia',
      CodigoPostal: 'CodigoPostal',
      Telefono: 'Telefono',
      Fax: 'Fax',
      Email1: 'Email1'
    };

    const campoFiltroReal = campoMap[tipoFiltro];

    return datos.filter(d => {
      const campoCliente = (d[campoFiltroReal] || "").toString().toLowerCase();
      const nombreCliente = (d.Nombre || "").toLowerCase();
      return nombreCliente.includes(filtroNombre.toLowerCase()) && campoCliente.includes(valorFiltro.toLowerCase());
    });
  };

  const verCliente = (codigo) => {
    navigate(`/clientes/ficha?codigo=${codigo}`);
  };

  const datosFiltrados = filtrarClientes();

  return (
    <div className="dashboard-body">
      <header className="top-menu">
        <img src="/img/eurobag-logo.jpg" className="logo" alt="Eurobag" />
        <div className="icon">🧾<span>Cliente</span></div>
        <div className="icon">📋<span>Potencial</span></div>
        <div className="icon">🗓️<span>Calend.</span></div>
        <div className="icon">💲<span>Gastos</span></div>
      </header>

      <main className="clientes-section">
        <div className="filtros">
          <div>
            <label>Nombre:</label>
            <input type="text" value={filtroNombre} onChange={(e) => setFiltroNombre(e.target.value)} placeholder="Buscar..." />
          </div>

          <div>
            <label>Filtro:</label>
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
              <option value="CodigoCliente">Código</option>
              <option value="Nombre">Cliente</option>
              <option value="Domicilio">Domicilio</option>
              <option value="Municipio">Municipio</option>
              <option value="Provincia">Provincia</option>
              <option value="CodigoPostal">C.P.</option>
              <option value="Telefono">Tlf</option>
              <option value="Fax">Fax</option>
              <option value="Email1">Email</option>
            </select>
          </div>

          <div>
            <label>Valor:</label>
            <input type="text" value={valorFiltro} onChange={(e) => setValorFiltro(e.target.value)} placeholder="Valor" />
          </div>

          <div>
            <label>Empresa:</label>
            <select value={empresaFiltro} disabled>
              <option>{empresaFiltro}</option>
            </select>
          </div>

          <button>BUSCAR</button>
        </div>

        <table id="tablaClientes">
          <thead>
            <tr>
              <th></th>
              <th onClick={() => ordenarTabla('CodigoCliente')}>Código</th>
              <th onClick={() => ordenarTabla('Nombre')}>Cliente</th>
              <th onClick={() => ordenarTabla('Domicilio')}>Domicilio</th>
              <th onClick={() => ordenarTabla('Municipio')}>Municipio</th>
              <th onClick={() => ordenarTabla('Provincia')}>Provincia</th>
              <th onClick={() => ordenarTabla('CodigoPostal')}>C.P.</th>
              <th onClick={() => ordenarTabla('Telefono')}>Tlf</th>
              <th onClick={() => ordenarTabla('Fax')}>Fax</th>
              <th onClick={() => ordenarTabla('Email1')}>Email</th>
            </tr>
          </thead>
          <tbody>
            {datosFiltrados.map((c, index) => (
              <tr key={index}>
                <td><button onClick={() => verCliente(c.CodigoCliente)}>✔</button></td>
                <td>{c.CodigoCliente}</td>
                <td>{c.Nombre}</td>
                <td>{c.Domicilio}</td>
                <td>{c.Municipio}</td>
                <td>{c.Provincia}</td>
                <td>{c.CodigoPostal}</td>
                <td>{c.Telefono}</td>
                <td>{c.Fax}</td>
                <td>{c.Email1}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <button className="btn-estadistica">ESTADÍSTICA</button>
      </main>
    </div>
  );
}

export default ClientesPage;
