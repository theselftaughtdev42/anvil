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
  // `npm run test:unit`. Playwright's tests in e2e/ check the whole built app
  // and run separately.
  test: {
    projects: [
      // Component and module tests, run in headless Chromium.
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
            commands: {
              // Lets a test switch `prefers-reduced-motion` on and off: `commands.setReducedMotion(true)`.
              setReducedMotion: async (ctx, reduce: boolean) => {
                if (!('page' in ctx)) throw new Error('setReducedMotion needs the Playwright provider')
                await ctx.page.emulateMedia({ reducedMotion: reduce ? 'reduce' : 'no-preference' })
              },
            },
          },
        },
      },
      // The lint rules' tests run oxlint itself, which needs Node.
      {
        test: { name: 'lint', include: ['lint/**/*.test.ts'], environment: 'node' },
      },
    ],
  },
})
