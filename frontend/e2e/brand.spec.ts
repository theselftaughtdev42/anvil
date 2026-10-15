import { expect, test } from '@playwright/test'

test('the page title is Anvil', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Anvil')
})

test('the favicon is served as an SVG', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="icon"]').getAttribute('href')
  const response = await request.get(href!)
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('image/svg+xml')
})

test('the header mark keeps its three sparks as separate elements', async ({ page }) => {
  await page.goto('/')
  const mark = page.getByRole('banner').getByRole('link').locator('svg')
  // Separate so they can be animated, hottest first.
  for (const spark of ['spark-1', 'spark-2', 'spark-3']) {
    await expect(mark.locator(`#${spark}`)).toHaveCount(1)
  }
})
