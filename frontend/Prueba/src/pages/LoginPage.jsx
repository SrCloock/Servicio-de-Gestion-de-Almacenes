import { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/style.css';

function LoginPage() {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');

  const generarCaptcha = () => {
    const canvas = document.getElementById("captcha");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ123456789";
    let code = "";

    ctx.clearRect(0, 0, 100, 40);
    ctx.font = "24px Arial";

    for (let i = 0; i < 5; i++) {
      const char = chars.charAt(Math.floor(Math.random() * chars.length));
      code += char;
      ctx.fillStyle = `rgb(${Math.random()*100},${Math.random()*100},${Math.random()*100})`;
      ctx.fillText(char, 15 * i + 5, 30);
    }

    setCaptchaCode(code);
  };

  useEffect(() => {
    generarCaptcha();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (captcha.toUpperCase() !== captchaCode) {
      alert("Código CAPTCHA incorrecto.");
      generarCaptcha();
      return;
    }
    try {
      const res = await axios.post("http://localhost:3000/login", { usuario, contrasena });
      if (res.data.success) {
        alert("Login correcto");
        window.location.href = "/clientes";
      } else {
        alert("Usuario o contraseña incorrectos");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al servidor.");
    }
  };

  return (
    <div className="login-body">
      <div className="login-container">
        <form onSubmit={handleSubmit}>
          <label>Usuario:</label>
          <input type="text" value={usuario} onChange={e => setUsuario(e.target.value)} required />
          <label>Contraseña:</label>
          <input type="password" value={contrasena} onChange={e => setContrasena(e.target.value)} required />
          <div className="captcha-container">
            <canvas id="captcha" width="100" height="40"></canvas>
            <input type="text" placeholder="Escribe el código" value={captcha} onChange={e => setCaptcha(e.target.value)} required />
          </div>
          <button type="submit" className="login-btn">✔</button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;