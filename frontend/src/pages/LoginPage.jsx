import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../helpers/api';
import '../styles/LoginPage.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const [credenciales, setCredenciales] = useState({ usuario: '', contrasena: '' });
  const [loading, setLoading] = useState(false);

  const handleChange = (campo, valor) => {
    setCredenciales(prev => ({ ...prev, [campo]: valor }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data } = await API.post("/login", credenciales);
      
      if (data.success) {
        localStorage.setItem('user', JSON.stringify(data.datos));
        navigate('/PedidosScreen');
      } else {
        alert("Usuario o contraseña incorrectos");
      }
    } catch {
      alert("Error de conexión al servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-login-body">
      <div className="lp-login-container">
        <div className="lp-logo-container">
          <img 
            src="/img/logo-ferreteria-luque.png" 
            alt="Ferretería Luque" 
            className="lp-main-logo"
          />
          <p className="lp-app-subtitle">Sistema de Gestión de Almacenes</p>
        </div>
        
        <form onSubmit={handleSubmit} autoComplete="off">
          {[
            { id: 'usuario', label: 'Usuario', type: 'text', placeholder: 'Ingrese su usuario' },
            { id: 'contrasena', label: 'Contraseña', type: 'password', placeholder: 'Ingrese su contraseña' }
          ].map(({ id, label, type, placeholder }) => (
            <div key={id} className="lp-input-group">
              <label htmlFor={id}>{label}</label>
              <input
                type={type}
                id={id}
                value={credenciales[id]}
                onChange={e => handleChange(id, e.target.value)}
                required
                placeholder={placeholder}
              />
            </div>
          ))}
          
          <div className="lp-button-container">
            <button 
              type="submit" 
              className="lp-login-button" 
              disabled={loading}
            >
              {loading ? (
                <span className="lp-button-loading">
                  <span className="lp-spinner"></span> Cargando...
                </span>
              ) : (
                'Iniciar Sesión →'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;