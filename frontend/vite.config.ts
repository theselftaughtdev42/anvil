import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import svgr from 'vite-plugin-svgr'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), svgr()],
  resolve: {
    // `@/` points at src/, as in tsconfig.app.json
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // Forward API calls to `fastapi dev` while using the Vite dev server
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  // Component tests (`npm run test:unit`), rendered in headless Chromium.
  // Playwright's tests in e2e/ check the whole built app and run separately.
  test: {
    include: ['src/**/*.test.tsx'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
})
