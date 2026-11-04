import { test as base } from '@playwright/test'

export { expect, type Locator, type Page } from '@playwright/test'

/**
 * Playwright's `test`, with any API call a test hasn't stubbed answered in the
 * browser. Otherwise it reaches Vite's proxy, which logs a connection error
 * for the absent backend. A test's own routes still win, as Playwright tries
 * the latest first.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    // A 500, as the proxy gave, so pages behave as they did without a backend.
    await page.route('**/api/**', (route) => route.fulfill({ status: 500, json: { detail: 'Not stubbed' } }))
    await provide(page)
  },
})
