import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // ⬅️ Importa BrowserRouter
import App from './App';
import './index.css';
import './styles/style.css'; // 🔥 AÑADE esta línea también aquí

console.log("React está corriendo ✅");

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
