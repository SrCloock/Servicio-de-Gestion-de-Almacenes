import React, { useState, useEffect } from 'react';
import '../styles/TraspasoAlmacenesScreen.css';
import { useNavigate } from 'react-router-dom';

function TraspasoAlmacenesScreen() {
  const navigate = useNavigate();
  const [articulos, setArticulos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [traspasoData, setTraspasoData] = useState({
    articulo: '',
    origen: '',
    destino: '',
    cantidad: ''
  });

  useEffect(() => {
    setArticulos([
      { codigo: 'TRN-6X50', nombre: 'Tornillo hexagonal 6x50 mm' },
      { codigo: 'TRC-M8', nombre: 'Tuerca M8 galvanizada' },
      { codigo: 'TUB-ALU-20', nombre: 'Tubo aluminio 20mm' },
      { codigo: 'BRD-40', nombre: 'Brida de acero 40mm' },
      { codigo: 'VLV-1/2', nombre: 'Válvula de bola 1/2"' },
      { codigo: 'CBL-2.5', nombre: 'Cable eléctrico 2.5mm' },
      { codigo: 'INT-16A', nombre: 'Interruptor 16A' },
      { codigo: 'TUB-PVC-25', nombre: 'Tubo PVC 25mm' },
      { codigo: 'FUS-10A', nombre: 'Fusible 10A' },
      { codigo: 'CHP-30', nombre: 'Chapas acero 30x30cm' },
      { codigo: 'PNL-AL-2', nombre: 'Panel aluminio 2mm' },
      { codigo: 'TRN-INOX-5', nombre: 'Tornillo inoxidable 5x20' },
      { codigo: 'TUB-CU-15', nombre: 'Tubo cobre 15mm' },
      { codigo: 'CODO-15', nombre: 'Codo cobre 15mm' },
      { codigo: 'VLV-ESF-3/4', nombre: 'Válvula esférica 3/4"' }
    ]);
  }, []);
  
  useEffect(() => {
    if (traspasoData.articulo) {
      const ubicacionesMock = {
        'TRN-6X50': ['Almacén principal - Pasillo 1', 'Estantería central - Zona B'],
        'TRC-M8': ['Pasillo 3 - Estante alto', 'Mostrador principal'],
        'TUB-ALU-20': ['Zona de carga - Estantería metálica', 'Almacén metales'],
        'BRD-40': ['Almacén auxiliar', 'Pasillo 2 - Estante medio'],
        'VLV-1/2': ['Almacén principal - Pasillo 2', 'Mostrador fontanería'],
        'CBL-2.5': ['Almacén eléctrico - Rack 1', 'Mostrador principal'],
        'INT-16A': ['Caja de interruptores', 'Pasillo eléctrico'],
        'TUB-PVC-25': ['Exterior - Estantería PVC', 'Almacén fontanería'],
        'FUS-10A': ['Caja de fusibles', 'Pasillo eléctrico'],
        'CHP-30': ['Almacén metales - Zona A', 'Zona de corte'],
        'PNL-AL-2': ['Almacén metales - Zona B', 'Zona de carga'],
        'TRN-INOX-5': ['Pasillo 4 - Estante bajo', 'Mostrador herrajes'],
        'TUB-CU-15': ['Almacén fontanería', 'Mostrador fontanería'],
        'CODO-15': ['Almacén fontanería', 'Pasillo 1 - Estante alto'],
        'VLV-ESF-3/4': ['Mostrador fontanería', 'Almacén principal']
      };
      setUbicaciones(ubicacionesMock[traspasoData.articulo] || []);
      setTraspasoData((prev) => ({ ...prev, origen: '', destino: '' }));
    }
  }, [traspasoData.articulo]);

  const handleTraspaso = async () => {
    const { articulo, origen, destino, cantidad } = traspasoData;
    if (!articulo || !origen || !destino || !cantidad) {
      alert('⚠️ Completa todos los campos');
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/traspasoAlmacen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(traspasoData)
      });
      const result = await response.json();

      if (result.success) {
        alert('✅ Traspaso realizado correctamente');
        setTraspasoData({ articulo: '', origen: '', destino: '', cantidad: '' });
        setUbicaciones([]);
      } else {
        alert('❌ Error al realizar el traspaso');
      }
    } catch (error) {
      console.error('Error al realizar traspaso:', error);
      alert('❌ Error de conexión con el servidor');
    }
  };

  return (
    <div className="traspaso-container">
      <div className="traspaso-header">
        <h2>🏭 Traspaso entre Almacenes</h2>
        <button className="btn-volver" onClick={() => navigate('/PedidosScreen')}>🔙 Volver</button>
        <div className="bubble bubble1"></div>
        <div className="bubble bubble2"></div>
      </div>

      <div className="traspaso-form">
        <select
          value={traspasoData.articulo}
          onChange={(e) => setTraspasoData({ ...traspasoData, articulo: e.target.value })}
        >
          <option value="">📦 Selecciona un artículo</option>
          {articulos.map((art) => (
            <option key={art.codigo} value={art.codigo}>
              {art.nombre}
            </option>
          ))}
        </select>

        <select
          value={traspasoData.origen}
          onChange={(e) => setTraspasoData({ ...traspasoData, origen: e.target.value })}
          disabled={!ubicaciones.length}
        >
          <option value="">🏷️ Ubicación Origen</option>
          {ubicaciones.map((ubi, index) => (
            <option key={index} value={ubi}>{ubi}</option>
          ))}
        </select>

        <select
          value={traspasoData.destino}
          onChange={(e) => setTraspasoData({ ...traspasoData, destino: e.target.value })}
          disabled={!ubicaciones.length}
        >
          <option value="">📍 Ubicación Destino</option>
          {ubicaciones.map((ubi, index) => (
            <option key={index} value={ubi}>{ubi}</option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Cantidad"
          value={traspasoData.cantidad}
          onChange={(e) => setTraspasoData({ ...traspasoData, cantidad: e.target.value })}
        />

        <button onClick={handleTraspaso}>✅ Confirmar Traspaso</button>
      </div>
    </div>
  );
}

export default TraspasoAlmacenesScreen;
