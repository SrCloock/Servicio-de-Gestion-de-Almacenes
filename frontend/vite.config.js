import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['6df2-137-74-67-60.ngrok-free.app'],
    proxy: {
      // Rutas backend que usará el frontend (ajustar según tus endpoints reales)
      '/login': 'http://localhost:3000',
      '/PedidosScreen': 'http://localhost:3000',
      '/pedidosPendientes': 'http://localhost:3000',
      '/clientes': 'http://localhost:3000',
      '/clientes/ficha': 'http://localhost:3000',
      '/estadisticasCliente': 'http://localhost:3000',
      '/traspaso': 'http://localhost:3000',
      '/dashboard': 'http://localhost:3000',
      '/preparacion': 'http://localhost:3000',
      '/entrada': 'http://localhost:3000',
      '/rutas': 'http://localhost:3000',
      '/confirmacion-entrega': 'http://localhost:3000',
      '/detalle-albaran': 'http://localhost:3000',
      '/inventario': 'http://localhost:3000',
      // Si tienes un prefijo API, puedes hacer algo tipo '/api': 'http://localhost:3000',
    }
  }
})
