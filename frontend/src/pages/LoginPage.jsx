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
          <div className="lp-input-group">
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
          
          <div className="lp-input-group">
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
}

export default LoginPage;