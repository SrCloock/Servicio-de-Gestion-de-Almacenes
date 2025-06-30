import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/LoginPage.css';

function LoginPage() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await axios.post("http://localhost:3000/login", { usuario, contrasena });
      if (res.data.success) {
        localStorage.setItem('user', JSON.stringify(res.data.datos));
        navigate('/PedidosScreen');
      } else {
        alert("Usuario o contraseña incorrectos");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al servidor.");
    }
    setLoading(false);
  };

  return (
    <div className="login-body">
      <div className="login-container">
        <div className="logo-container">
          <img 
            src="/img/logo-ferreteria-luque.png" 
            alt="Ferretería Luque" 
            className="main-logo"
          />
          <p className="app-subtitle">Sistema de Gestión de Almacenes</p>
        </div>
        
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="input-group">
            <label htmlFor="usuario">Usuario</label>
            <input
              type="text"
              id="usuario"
              value={usuario}
              onChange={e => setUsuario(e.target.value)}
              required
              placeholder="Ingrese su usuario"
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="contrasena">Contraseña</label>
            <input
              type="password"
              id="contrasena"
              value={contrasena}
              onChange={e => setContrasena(e.target.value)}
              required
              placeholder="Ingrese su contraseña"
            />
          </div>
          
          <div className="button-container">
            <button 
              type="submit" 
              className="login-button" 
              disabled={loading}
            >
              {loading ? (
                <span className="button-loading">
                  <span className="spinner"></span> Cargando...
                </span>
              ) : (
                'Iniciar Sesión →'
              )}
            </button>
          </div>
        </form>
        
        <div className="partner-logo">
          <img 
            src="/img/logo-eurobag.png" 
            alt="Eurobag" 
            className="partner-image"
          />
        </div>
      </div>
    </div>
  );
}

export default LoginPage;