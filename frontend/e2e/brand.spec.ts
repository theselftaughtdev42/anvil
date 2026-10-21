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

// Sparks belong to the Refinement anvil, where something is being forged.
test('the header mark is the anvil alone, with no sparks', async ({ page }) => {
  await page.goto('/')
  const mark = page.getByRole('banner').getByRole('link', { name: 'ANVIL' }).locator('svg')
  await expect(mark.locator('path')).toHaveCount(1)
  await expect(mark.locator('#anvil')).toHaveCount(1)
})
