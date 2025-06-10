import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,       // escucha en todas las interfaces
    port: 3000,       // o el puerto que uses
    allowedHosts: 'all'  // permite cualquier host externo
  }
})
