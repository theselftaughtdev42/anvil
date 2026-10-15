import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

// `make frontend-test-ui` sets this to test the Vite dev server instead, so
// edits show up on the next run without a rebuild.
const DEV_SERVER = !!process.env.E2E_DEV_SERVER

// Browser tests that check the SPA follows the design rules in
// docs/design/README.md. They run on
// `vite preview` of the production build, so they need no API or database.
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: DEV_SERVER
      ? `npm run dev -- --port ${PORT} --strictPort`
      : `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
