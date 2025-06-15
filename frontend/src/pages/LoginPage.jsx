import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

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
        // Guardar token y datos de usuario
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.datos));
        localStorage.setItem('permisos', JSON.stringify(res.data.permisos));
        
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
        <div className="logo-rr">
          <img src="/img/logo-ferreteria-luque.png" alt="Ferretería Luque" />
          <p>Sistema de Gestión de Almacenes</p>
        </div>
        
        <form onSubmit={handleSubmit} autoComplete="off">
          <label htmlFor="usuario">Usuario</label>
          <input
            type="text"
            id="usuario"
            value={usuario}
            onChange={e => setUsuario(e.target.value)}
            required
          />
          
          <label htmlFor="contrasena">Contraseña</label>
          <input
            type="password"
            id="contrasena"
            value={contrasena}
            onChange={e => setContrasena(e.target.value)}
            required
          />
          
          <div className="captcha-container">
            {/* Aquí iría el captcha */}
          </div>
          
          <div className="boton-container">
            <button type="submit" className="login-btn">
              {loading ? '🔄' : '→'}
            </button>
          </div>
        </form>
        
        <div className="logo-eurobag">
          <img src="/img/logo-eurobag.png" alt="Eurobag" />
        </div>
      </div>
    </div>
  );
}

export default LoginPage;