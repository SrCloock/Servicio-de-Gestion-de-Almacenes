import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function LoginPage() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await axios.post("http://localhost:3000/login", { usuario, contrasena });
      
      if (res.data.success) {
        // Guardar datos de usuario y permisos
        localStorage.setItem('user', JSON.stringify(res.data.datos));
        localStorage.setItem('permisos', JSON.stringify(res.data.permisos));
        
        // Redirigir según el tipo de usuario
        const categoria = res.data.datos.CodigoCategoriaEmpleadoLc || '';
        if (categoria === 'rep' || categoria === 'Repartidor') {
          navigate('/pedidos-asignados');
        } else {
          navigate('/PedidosScreen');
        }
      } else {
        setError("Usuario o contraseña incorrectos");
      }
    } catch (err) {
      console.error(err);
      if (err.response) {
        setError(err.response.data.mensaje || "Error de conexión al servidor");
      } else if (err.request) {
        setError("No se pudo conectar al servidor. Verifica tu conexión");
      } else {
        setError("Error inesperado. Inténtalo de nuevo");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-body">
      <div className="login-container">
        <div className="logo-rr">
          <img 
            src="/img/logo-ferreteria-luque.png" 
            alt="Ferretería Luque" 
            style={{ maxWidth: '100%', height: 'auto' }}
          />
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
            autoCapitalize="none"
            autoCorrect="off"
            className="login-input"
          />
          
          <label htmlFor="contrasena">Contraseña</label>
          <input
            type="password"
            id="contrasena"
            value={contrasena}
            onChange={e => setContrasena(e.target.value)}
            required
            className="login-input"
          />
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          <div className="boton-container">
            <button 
              type="submit" 
              className="login-btn" 
              disabled={loading}
              aria-label={loading ? "Cargando" : "Iniciar sesión"}
            >
              {loading ? (
                <span className="spinner-container">
                  <span className="spinner"></span> Cargando...
                </span>
              ) : (
                'Iniciar sesión'
              )}
            </button>
          </div>
        </form>
        
        <div className="logo-eurobag">
          <img 
            src="/img/logo-eurobag.png" 
            alt="Eurobag" 
            style={{ maxWidth: '100%', height: 'auto' }}
          />
        </div>
      </div>
    </div>
  );
}

export default LoginPage;