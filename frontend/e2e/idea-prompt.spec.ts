import { expect, test } from '@playwright/test'

// The e2e tests run without an API, so these stand in for it.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { idea_placeholder: 'Riders can tip their driver' } }),
  )
  await page.route('**/api/requirements', (route) =>
    route.fulfill({
      status: 201,
      json: {
        id: 'abc-123',
        title: 'Route change alerts',
        idea: route.request().postDataJSON().idea,
        status: 'draft',
        created_at: '2026-10-15T12:00:00Z',
        updated_at: '2026-10-15T12:00:00Z',
        progress: null,
      },
    }),
  )
  await page.goto('/')
})

test('an idea can be started with the keyboard alone', async ({ page }) => {
  const idea = page.getByRole('textbox', { name: 'Your idea' })
  // Past the header's logo and account button.
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab')
  await expect(idea).toBeFocused()

  await page.keyboard.type('Drivers should see route changes')
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL('/requirements/abc-123')
})

test('the prompt shows a ring while its textarea has focus', async ({ page }) => {
  const prompt = page.locator('form')
  await page.getByRole('textbox', { name: 'Your idea' }).focus()
  await expect.poll(() => prompt.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none')
})
