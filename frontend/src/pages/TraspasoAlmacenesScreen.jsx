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
      { codigo: 'ART001', nombre: 'Tornillos' },
      { codigo: 'ART002', nombre: 'Tuercas' },
      { codigo: 'ART003', nombre: 'Arandelas' }
    ]);
  }, []);

  useEffect(() => {
    if (traspasoData.articulo) {
      const ubicacionesMock = {
        ART001: ['A1', 'A2', 'A3'],
        ART002: ['B1', 'B2'],
        ART003: ['C1']
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
