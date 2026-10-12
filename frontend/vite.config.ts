import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to `fastapi dev` while using the Vite dev server
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
