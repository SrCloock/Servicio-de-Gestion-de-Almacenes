import { useState, useEffect } from 'react';
import '../styles/styleClienteFicha.css';

function FichaClientePage() {
  const [cliente, setCliente] = useState({});

useEffect(() => {
  const clienteGuardado = localStorage.getItem('clienteSeleccionado');

  if (clienteGuardado) {
    setCliente(JSON.parse(clienteGuardado));
    localStorage.removeItem('clienteSeleccionado');
  } else {
    const params = new URLSearchParams(window.location.search);
    const codigo = params.get('codigo');
    const codigoEmpresa = localStorage.getItem('codigoEmpresaSeleccionada');

    if (codigo && codigoEmpresa) {
      fetch(`http://localhost:3000/clienteFicha?codigoCliente=${codigo}&codigoEmpresa=${codigoEmpresa}`)
        .then(response => response.json())
        .then(data => {
          if (data) {
            setCliente(data);
          } else {
            alert('Cliente no encontrado.');
          }
        })
        .catch(error => console.error('Error al cargar ficha cliente:', error));
    }
  }
}, []);


const abrirEstadisticas = () => {
  // 1. Recoger los valores actuales de los inputs
  const nuevosDatos = {
    ...cliente,
    Nombre: document.querySelector('input[name="Nombre"]')?.value || cliente.Nombre,
    CifDni: document.querySelector('input[name="CifDni"]')?.value || cliente.CifDni,
    TipoCliente: document.querySelector('input[name="TipoCliente"]')?.value || cliente.TipoCliente,
    Nombre1: document.querySelector('input[name="Nombre1"]')?.value || cliente.Nombre1,
    FormadePago: document.querySelector('input[name="FormadePago"]')?.value || cliente.FormadePago,
    Email1: document.querySelector('input[name="Email1"]')?.value || cliente.Email1,
    Email2: document.querySelector('input[name="Email2"]')?.value || cliente.Email2,
    Telefono: document.querySelector('input[name="Telefono"]')?.value || cliente.Telefono,
    Fax: document.querySelector('input[name="Fax"]')?.value || cliente.Fax,
    CodigoPostal: document.querySelector('input[name="CodigoPostal"]')?.value || cliente.CodigoPostal,
    Domicilio: document.querySelector('input[name="Domicilio"]')?.value || cliente.Domicilio,
    Municipio: document.querySelector('input[name="Municipio"]')?.value || cliente.Municipio,
    Provincia: document.querySelector('input[name="Provincia"]')?.value || cliente.Provincia,
    ObservacionesCliente: document.querySelector('textarea[name="ObservacionesCliente"]')?.value || cliente.ObservacionesCliente,
  };

  // 2. Guardar los datos actualizados en localStorage
  localStorage.setItem('clienteSeleccionado', JSON.stringify(nuevosDatos));

  // 3. Ahora navegar a estadísticas
  if (nuevosDatos.CifDni) {
    window.location.href = `/estadisticasCliente?cif=${encodeURIComponent(nuevosDatos.CifDni)}`;
  }
};

  const abrirNuevaVisita = () => {
    if (cliente.Nombre) {
      window.location.href = `/nuevaVisita?nombre=${encodeURIComponent(cliente.Nombre)}`;
    }
  };

  const abrirNuevoPedido = () => {
    if (cliente.Nombre) {
      window.location.href = `/nuevoPedido?nombre=${encodeURIComponent(cliente.Nombre)}`;
    }
  };

  const guardarCliente = async () => {
    try {
      const respuesta = await fetch('http://localhost:3000/guardarCliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cliente)
      });

      const resultado = await respuesta.json();

      if (resultado.success) {
        alert('Cliente guardado correctamente.');
      } else {
        alert('Error al guardar cliente.');
      }
    } catch (error) {
      console.error('Error al guardar cliente:', error);
      alert('Error de conexión al guardar.');
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

      <main className="ficha-cliente">
        <h2>Ficha de Cliente</h2>

        <div className="formulario-grid">
          <label>Nombre:</label>
          <input value={cliente.Nombre || ''} onChange={e => setCliente({ ...cliente, Nombre: e.target.value })} />

          <label>Código:</label>
          <input value={cliente.CodigoCliente || ''} disabled />

          <label>CIF / NIF:</label>
          <input value={cliente.CifDni || ''} onChange={e => setCliente({ ...cliente, CifDni: e.target.value })} />

          <label>Tipo de Cliente:</label>
          <input value={cliente.TipoCliente || ''} onChange={e => setCliente({ ...cliente, TipoCliente: e.target.value })} />

          <label>Persona de Contacto:</label>
          <input value={cliente.Nombre1 || ''} onChange={e => setCliente({ ...cliente, Nombre1: e.target.value })} />

          <label>Forma de Pago:</label>
          <input value={cliente.FormadePago || ''} onChange={e => setCliente({ ...cliente, FormadePago: e.target.value })} />

          <label>Email 1:</label>
          <input value={cliente.Email1 || ''} onChange={e => setCliente({ ...cliente, Email1: e.target.value })} />

          <label>Email 2:</label>
          <input value={cliente.Email2 || ''} onChange={e => setCliente({ ...cliente, Email2: e.target.value })} />

          <label>Teléfono:</label>
          <input value={cliente.Telefono || ''} onChange={e => setCliente({ ...cliente, Telefono: e.target.value })} />

          <label>Fax:</label>
          <input value={cliente.Fax || ''} onChange={e => setCliente({ ...cliente, Fax: e.target.value })} />

          <label>Código Postal:</label>
          <input value={cliente.CodigoPostal || ''} onChange={e => setCliente({ ...cliente, CodigoPostal: e.target.value })} />

          <label>Dirección:</label>
          <input value={cliente.Domicilio || ''} onChange={e => setCliente({ ...cliente, Domicilio: e.target.value })} />

          <label>Municipio:</label>
          <input value={cliente.Municipio || ''} onChange={e => setCliente({ ...cliente, Municipio: e.target.value })} />

          <label>Provincia:</label>
          <input value={cliente.Provincia || ''} onChange={e => setCliente({ ...cliente, Provincia: e.target.value })} />

          <label>Observaciones:</label>
          <textarea value={cliente.ObservacionesCliente || ''} onChange={e => setCliente({ ...cliente, ObservacionesCliente: e.target.value })} />
        </div>

        <div className="botones">
          <button onClick={abrirEstadisticas}>ESTADÍSTICA</button>
          <button>RESUMEN CLI.</button>
          <button onClick={abrirNuevaVisita}>NUEVA VISITA</button>
          <button onClick={abrirNuevoPedido}>NUEVO PEDIDO</button>
          <button className="guardar" onClick={guardarCliente}>Guardar</button>
        </div>
      </main>
    </div>
  );
}

export default FichaClientePage;
