import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ✅ CONFIGURACIÓN EXCLUSIVA PARA PRODUCCIÓN
const PUBLIC_IP = '84.120.61.159'
const BACKEND_PORT = 3000

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true
  },
  define: {
    // ✅ URL absoluta para producción
    __API_URL__: JSON.stringify(`http://${PUBLIC_IP}:${BACKEND_PORT}`)
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    // ✅ Configuración optimizada para producción
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          utils: ['axios', 'html5-qrcode']
        }
      }
    }
  }
})