import { useState, useEffect } from 'react';
import '../styles/style.css';

function DashboardPage() {
  const [empresas, setEmpresas] = useState([]);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState('');
  const [nombreEmpresaSeleccionada, setNombreEmpresaSeleccionada] = useState('');

  const [comisionistas, setComisionistas] = useState([]);
  const [comisionistaSeleccionado, setComisionistaSeleccionado] = useState('');

  useEffect(() => {
    fetch('http://localhost:3000/dashboard')
      .then(response => response.json())
      .then(data => setEmpresas(data))
      .catch(error => console.error('Error al cargar empresas:', error));

    // Recuperar empresa y comisionista seleccionados del localStorage
    const codigoEmpresaGuardada = localStorage.getItem('codigoEmpresaSeleccionada');
    const nombreEmpresaGuardada = localStorage.getItem('nombreEmpresaSeleccionada');

    if (codigoEmpresaGuardada && nombreEmpresaGuardada) {
      setEmpresaSeleccionada(codigoEmpresaGuardada);
      setNombreEmpresaSeleccionada(nombreEmpresaGuardada);
      cargarComisionistasPorEmpresa(codigoEmpresaGuardada);
    }
  }, []);

  const cargarComisionistasPorEmpresa = (codigoEmpresa) => {
    fetch(`http://localhost:3000/comisionistas?codigoEmpresa=${codigoEmpresa}`)
      .then(response => response.json())
      .then(data => setComisionistas(data))
      .catch(error => console.error('Error al cargar comisionistas:', error));
  };

  const handleEmpresaChange = (event) => {
    const selectedCodigoEmpresa = event.target.value;

    const empresaSeleccionadaObj = empresas.find(emp => emp.CodigoEmpresa.toString() === selectedCodigoEmpresa);

    if (empresaSeleccionadaObj) {
      setEmpresaSeleccionada(selectedCodigoEmpresa);
      setNombreEmpresaSeleccionada(empresaSeleccionadaObj.Empresa);

      localStorage.setItem('codigoEmpresaSeleccionada', selectedCodigoEmpresa);
      localStorage.setItem('nombreEmpresaSeleccionada', empresaSeleccionadaObj.Empresa);

      cargarComisionistasPorEmpresa(selectedCodigoEmpresa);
    }
  };

  const handleComisionistaChange = (event) => {
    setComisionistaSeleccionado(event.target.value);
  };

  return (
    <div className="dashboard-body">
      <header className="top-menu">
        <a href="/clientes" className="icon">🧾<span>Cliente</span></a>
        <div className="icon">📋<span>Potencial</span></div>
        <div className="icon">🗓️<span>Calend.</span></div>
        <div className="icon">💲<span>Gastos</span></div>
      </header>

      <main className="dashboard">
        <section className="config">
          <h3>CONFIGURACIÓN:</h3>

          <label>Seleccionar Empresa:</label>
          <select value={empresaSeleccionada} onChange={handleEmpresaChange}>
            <option value="">-- Selecciona una empresa --</option>
            {empresas.map((empresa, index) => (
              <option key={index} value={empresa.CodigoEmpresa}>
                {empresa.Empresa}
              </option>
            ))}
          </select>

          {nombreEmpresaSeleccionada && (
            <p style={{ marginTop: '10px' }}>
              Empresa seleccionada: <strong>{nombreEmpresaSeleccionada}</strong>
            </p>
          )}

          <label>Seleccionar Delegado de Venta:</label>
          <select value={comisionistaSeleccionado} onChange={handleComisionistaChange}>
            <option value="">-- Selecciona un comisionista --</option>
            {comisionistas.map((comisionista, index) => (
              <option key={index} value={comisionista.Comisionista}>
                {comisionista.Comisionista}
              </option>
            ))}
          </select>
        </section>

        <section className="informes">
          <h3>INFORMES:</h3>
          <div className="buttons">
            <div className="btn">Por Servir</div>
            <div className="btn">Por Cobrar</div>
            <div className="btn">Por Semana</div>
          </div>
        </section>

        <section className="maestros">
          <h3>MAESTROS:</h3>
          <div className="buttons">
            <div className="btn">Comisionistas</div>
            <div className="btn">Bloqueos</div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default DashboardPage;
