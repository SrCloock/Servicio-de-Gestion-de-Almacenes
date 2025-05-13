import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/style.css';

function LoginPage() {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await axios.post("http://localhost:3000/login", { usuario, contrasena });

      if (res.data.success) {
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
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        height: '50%',
        background: 'linear-gradient(180deg, #009688 0%, #4db6ac 100%)',
        position: 'relative'
      }}>
        {/* Logo Ferretería Luque */}
        <div style={{
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          width: '150px',
          height: '150px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <img 
            src="/img/logo-ferreteria-luque.png" 
            alt="Ferretería Luque" 
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
        
        {/* Burbuja 1 */}
        <div style={{
          position: 'absolute', top: '40px', left: '20px', width: '80px', height: '80px',
          borderRadius: '50%', backgroundColor: 'rgba(255, 255, 255, 0.07)'
        }}></div>

        {/* Burbuja 2 */}
        <div style={{
          position: 'absolute', top: '100px', right: '30px', width: '60px', height: '60px',
          borderRadius: '50%', backgroundColor: 'rgba(255, 255, 255, 0.07)'
        }}></div>
      </div>

      <div style={{
        height: '50%', backgroundColor: 'white', padding: '30px 20px',
        borderTopLeftRadius: '30px', borderTopRightRadius: '30px', boxShadow: '0 -5px 15px rgba(0,0,0,0.1)'
      }}>
        <form onSubmit={handleSubmit} autoComplete="off">
          <h2 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>Iniciar Sesión</h2>

          <div style={{ marginBottom: '25px' }}>
            <label htmlFor="usuario" style={{ color: '#555' }}>Usuario</label>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid #ccc' }}>
              <i className="fas fa-user" style={{ marginRight: '10px', color: '#888' }}></i>
              <input
                id="usuario"
                type="text"
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                placeholder="Ingrese su usuario"
                required
                style={{
                  border: 'none',
                  outline: 'none',
                  flex: 1,
                  padding: '8px 0',
                  background: 'transparent'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '30px' }}>
            <label htmlFor="contrasena" style={{ color: '#555' }}>Contraseña</label>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid #ccc' }}>
              <i className="fas fa-lock" style={{ marginRight: '10px', color: '#888' }}></i>
              <input
                id="contrasena"
                type="password"
                value={contrasena}
                onChange={e => setContrasena(e.target.value)}
                placeholder="Ingrese su contraseña"
                required
                style={{
                  border: 'none',
                  outline: 'none',
                  flex: 1,
                  padding: '8px 0',
                  background: 'transparent'
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#9575cd',
              color: 'white',
              border: 'none',
              borderRadius: '30px',
              fontWeight: 'bold',
              fontSize: '16px'
            }}
          >
            {loading ? 'Cargando...' : 'Ingresar'}
          </button>

          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <a
              onClick={() => navigate('/config')}
              style={{ color: '#2196F3', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Configurar Conexión
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;