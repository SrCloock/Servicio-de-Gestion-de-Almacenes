import React, { useState, useEffect } from 'react';
import API from '../helpers/api'; // ✅ CORREGIDO: Importación correcta
import '../styles/UserInfoBar.css';
import { getAuthHeader } from '../helpers/authHelper';

const UserInfoBar = () => {
  const [empresas, setEmpresas] = useState([]);
  const user = JSON.parse(localStorage.getItem('user'));

  // ✅ CORREGIDO: Usar API configurada en lugar de axios directo
  useEffect(() => {
    const fetchEmpresas = async () => {
      try {
        const headers = getAuthHeader();
        // ✅ USAR API EN LUGAR DE AXIOS CON LOCALHOST
        const response = await API.get('/empresas', { headers });
        setEmpresas(response.data);
      } catch (error) {
        console.error('Error al obtener empresas:', error);
      }
    };
    fetchEmpresas();
  }, []);

  const handleEmpresaChange = async (e) => {
    const nuevaEmpresa = e.target.value;
    const updatedUser = { ...user, CodigoEmpresa: nuevaEmpresa };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    window.location.reload();
  };

  if (!user) return null;

  return (
    <div className="user-info-bar">
      <div className="user-info-content">
        <span>Usuario: <strong>{user.Nombre}</strong> | </span>

        <span>
          Empresa:
          <select
            value={user.CodigoEmpresa}
            onChange={handleEmpresaChange}
            className="empresa-selector"
          >
            {empresas.map((empresa) => (
              <option key={empresa.CodigoEmpresa} value={empresa.CodigoEmpresa}>
                {empresa.Empresa} ({empresa.CodigoEmpresa})
              </option>
            ))}
          </select>
        </span>

        <span> | Categoría: <strong>{user.CodigoCategoriaEmpleadoLc}</strong></span>
      </div>
    </div>
  );
};

export default UserInfoBar;