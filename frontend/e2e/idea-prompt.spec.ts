import { expect, test } from '@playwright/test'

// The e2e tests run without an API, so these stand in for it.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { idea_placeholder: 'Riders can tip their driver' } }),
  )
  await page.route('**/api/projects', (route) =>
    route.fulfill({
      json: {
        items: [
          { id: 'p1', name: 'Parcel delivery platform', context: 'x', has_context: true, requirement_count: 6, is_owner: true },
          {
            id: 'p2',
            name: 'Customer support portal, with a name long enough to wrap',
            context: '',
            has_context: false,
            requirement_count: 0,
            is_owner: true,
          },
        ],
      },
    }),
  )
  await page.route('**/api/requirements', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { items: [] } })
      : route.fulfill({
      status: 201,
      json: {
        id: 'abc-123',
        title: 'Route change alerts',
        idea: route.request().postDataJSON().idea,
        project: { id: 'p1', name: 'Parcel delivery platform' },
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
  // Past the header's logo, section links and account button.
  for (let i = 0; i < 5; i++) await page.keyboard.press('Tab')
  await expect(idea).toBeFocused()

  await page.keyboard.type('Drivers should see route changes')
  // On to the Project picker, which opens on Enter with the first Project
  // highlighted. Picking it goes back to the idea, so typing carries on.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('option', { name: 'Parcel delivery platform' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('combobox', { name: 'Project' })).toHaveText('ProjectParcel delivery platform')
  await expect(idea).toBeFocused()
  await page.keyboard.type(' on their phone')
  await expect(idea).toHaveValue('Drivers should see route changes on their phone')
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL('/requirements/abc-123')
})

test('the prompt shows a ring while its textarea has focus', async ({ page }) => {
  const prompt = page.locator('form')
  await page.getByRole('textbox', { name: 'Your idea' }).focus()
  await expect.poll(() => prompt.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none')
})

test.describe('at phone width', () => {
  test.use({ viewport: { width: 320, height: 700 } })

  test('the Project menu fits on screen', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Project' }).click()
    const menu = page.getByRole('listbox')
    await expect(menu).toBeVisible()

    const box = (await menu.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= 320)).toBe(true)
  })
})
