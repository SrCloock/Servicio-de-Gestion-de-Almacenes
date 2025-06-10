import { useEffect, useState } from 'react';
import axios from 'axios';

function ClientesPage() {
  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:3000/clientes')
      .then(res => setClientes(res.data))
      .catch(err => console.error('Error al obtener clientes:', err));
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Lista de Clientes</h1>
      <ul>
        {clientes.map((cliente, i) => (
          <li key={i}>{cliente.codigo} - {cliente.cliente}</li>
        ))}
      </ul>
    </div>
  );
}

export default ClientesPage;