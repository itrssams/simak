import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      watch: {
        usePolling: true,
      },
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
        '/media': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
    build: {
      target: 'es2015',
      outDir: path.resolve(__dirname, '../backend/staticfiles'),
      emptyOutDir: true,
    },
  }
})
