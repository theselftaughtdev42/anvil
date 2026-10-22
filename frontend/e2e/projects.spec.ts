import { expect, type Page, test } from '@playwright/test'

const projects = [
  {
    id: 'p1',
    name: 'Parcel delivery platform, with a name long enough to wrap on a phone',
    context:
      'Booking, tracking and rebooking for home deliveries. Two delivery attempts, then the parcel waits 7 days at one of 14 depots. Customers get a text after each attempt.',
    has_context: true,
    requirement_count: 6,
    is_owner: true,
  },
  {
    id: 'p2',
    name: 'Customer support portal',
    context: '',
    has_context: false,
    requirement_count: 0,
    is_owner: true,
  },
]

/** The e2e tests run without an API, so this stands in for GET /api/projects. */
async function serve(page: Page) {
  await page.route(
    (url) => url.pathname === '/api/projects',
    (route) => route.fulfill({ json: { items: projects } }),
  )
}

/** Stands in for GET /api/projects/p1 and its Requirements. */
async function serveProject(page: Page) {
  await page.route(
    (url) => url.pathname === '/api/projects/p1',
    (route) => route.fulfill({ json: projects[0] }),
  )
  await page.route(
    (url) => url.pathname === '/api/requirements',
    (route) =>
      route.fulfill({
        json: {
          items: ['Rebook a missed delivery', 'Offline sync for drivers', 'Bulk import depots'].map((title, i) => ({
            id: `r${i}`,
            title,
            idea: title,
            project: { id: 'p1', name: 'Parcel delivery platform' },
            status: 'draft',
            created_at: '2026-10-01T00:00:00Z',
            updated_at: '2026-10-01T00:00:00Z',
            progress: null,
          })),
        },
      }),
  )
}

test("a Project's Requirements sit beside its Project Context", async ({ page }) => {
  await serveProject(page)
  await page.goto('/projects/p1')
  const context = await page.getByLabel('Project Context').boundingBox()
  const side = await page.getByRole('region', { name: 'Requirements in this Project' }).boundingBox()
  expect(side!.x).toBeGreaterThan(context!.x + context!.width)
})

// The page doesn't scroll sideways.
const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test("a Project's context is cut to three lines", async ({ page }) => {
  await serve(page)
  await page.goto('/projects')
  const context = page.getByText(/^Booking, tracking/)
  await expect(context).toBeVisible()
  const { lineHeight, height } = await context.evaluate((el) => {
    const style = getComputedStyle(el)
    return { lineHeight: parseFloat(style.lineHeight), height: el.getBoundingClientRect().height }
  })
  expect(Math.round(height / lineHeight)).toBeLessThanOrEqual(3)
})

test.describe('at phone width', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('the cards stack in one column, with no sideways scroll', async ({ page }) => {
    await serve(page)
    await page.goto('/projects')
    const cards = page.getByRole('listitem')
    await expect(cards).toHaveCount(2)
    const [first, second] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()])
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1)
    expect(await fitsWidth(page)).toBe(true)
  })

  test('the New project dialog fits on screen', async ({ page }) => {
    await serve(page)
    await page.goto('/projects')
    await page.getByRole('button', { name: 'New project' }).click()
    const dialog = page.getByRole('dialog', { name: 'New project' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Name')).toBeFocused()
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
  })
  test("a Project's Requirements go under its Project Context, with no sideways scroll", async ({ page }) => {
    await serveProject(page)
    await page.goto('/projects/p1')
    const save = await page.getByRole('button', { name: 'Save' }).boundingBox()
    const side = await page.getByRole('region', { name: 'Requirements in this Project' }).boundingBox()
    expect(side!.y).toBeGreaterThan(save!.y + save!.height)
    expect(await fitsWidth(page)).toBe(true)
  })
})
