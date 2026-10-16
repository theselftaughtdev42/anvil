import { expect, type Page, test } from '@playwright/test'

const statuses = ['draft', 'in_progress', 'complete'] as const

const requirements = statuses.flatMap((status, i) =>
  [0, 1].map((n) => ({
    id: `${status}-${n}`,
    title: `${n ? 'Another' : 'A'} ${status.replace('_', ' ')} requirement, with a title long enough to wrap`,
    idea: 'Drivers should see route changes on their phone without calling the depot, wherever they are.',
    status,
    created_at: '2026-10-01T12:00:00Z',
    updated_at: new Date(Date.now() - (i * 2 + n + 1) * 3_600_000).toISOString(),
    progress: null,
  })),
)

// The e2e tests run without an API, so this stands in for GET
// /api/requirements, which returns every requirement.
async function serve(page: Page, items: typeof requirements) {
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { idea_placeholder: 'Riders can tip their driver' } }),
  )
  await page.route(
    (url) => url.pathname === '/api/requirements',
    (route) => route.fulfill({ json: { items } }),
  )
}

// The page doesn't scroll sideways.
const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test('a card can be reached and opened by keyboard, with a focus ring', async ({ page }) => {
  await serve(page, requirements)
  await page.goto('/')
  const link = page.getByRole('link', { name: requirements[0].title })
  const card = page.locator('[data-slot=card]').filter({ has: link })
  await expect(link).toBeVisible()

  // Past the header, the prompt and the tabs, which are one tab stop.
  for (let i = 0; i < 20 && !(await link.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab')
  }
  await expect(link).toBeFocused()
  await expect.poll(() => card.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none')

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(`/requirements/${requirements[0].id}`)
})

test('the selected tab survives a refresh', async ({ page }) => {
  await serve(page, requirements)
  await page.goto('/')

  await page.getByRole('tab', { name: 'Complete 2' }).click()
  await expect(page).toHaveURL('/?status=complete')
  await page.reload()

  await expect(page.getByRole('tab', { name: 'Complete 2' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('link', { name: /complete requirement/ })).toHaveCount(2)
  await expect(page.getByRole('link', { name: /draft requirement/ })).toHaveCount(0)
})

test.describe('at phone width', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('the cards stack in one column, with no sideways scroll', async ({ page }) => {
    await serve(page, requirements)
    await page.goto('/')
    const cards = page.locator('[data-slot=card]')
    await expect(cards).toHaveCount(6)

    const [first, second] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()])
    expect(second!.x).toBe(first!.x)
    expect(second!.y).toBeGreaterThan(first!.y)
    expect(await fitsWidth(page)).toBe(true)
  })

  test('the first visit has no sideways scroll', async ({ page }) => {
    await serve(page, [])
    await page.goto('/')
    await expect(page.getByText('Your requirements will appear here.')).toBeVisible()
    expect(await fitsWidth(page)).toBe(true)
  })
})
