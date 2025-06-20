import React, { useState, useEffect } from 'react';
import '../styles/UserInfoBar.css';
import { getEmpresas } from '../helpers/authHelper';

const UserInfoBar = () => {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const user = JSON.parse(localStorage.getItem('user'));
  
  useEffect(() => {
    let isMounted = true;
    
    const loadEmpresas = async () => {
      if (!user) return;
      
      setLoading(true);
      setError('');
      
      try {
        const empresasData = await getEmpresas();
        if (isMounted) {
          setEmpresas(empresasData);
        }
      } catch (e) {
        if (isMounted) {
          setError('Error al cargar empresas');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    loadEmpresas();
    
    return () => {
      isMounted = false;
    };
  }, [user]);
  
  const handleEmpresaChange = async (e) => {
    const nuevaEmpresa = e.target.value;
    const updatedUser = {...user, CodigoEmpresa: nuevaEmpresa};
    localStorage.setItem('user', JSON.stringify(updatedUser));
    window.dispatchEvent(new CustomEvent('empresaChanged', { detail: nuevaEmpresa }));
  };

  if (!user) return null;

  return (
    <div className="user-info-bar">
      <div className="user-info-content">
        <span>Usuario: <strong>{user.Nombre}</strong> | </span>
        
        {loading ? (
          <span>Empresa: <strong>Cargando...</strong></span>
        ) : error ? (
          <span className="error-message">{error}</span>
        ) : (
          <span>Empresa: 
            <select 
              value={user.CodigoEmpresa} 
              onChange={handleEmpresaChange}
              className="empresa-selector"
            >
              {empresas.map(empresa => (
                <option key={empresa.CodigoEmpresa} value={empresa.CodigoEmpresa}>
                  {empresa.Empresa} ({empresa.CodigoEmpresa})
                </option>
              ))}
            </select> 
          </span>
        )}
        
        <span> | Categoría: <strong>{user.CodigoCategoriaEmpleadoLc}</strong></span>
      </div>
    </div>
  );
};

export default UserInfoBar;