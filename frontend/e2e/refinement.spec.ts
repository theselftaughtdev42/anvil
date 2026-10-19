import { expect, type Page, test } from '@playwright/test'

const question = (n: number) => ({
  id: `q${n}`,
  topic: ['Who it’s for', 'The problem', 'Success', 'Edge cases'][n % 4],
  text: `Question number ${n}, long enough that it wraps onto a second line on a phone?`,
  why: 'Why Anvil is asking.',
  suggestions: ['First suggestion', 'Second suggestion', 'Third suggestion'],
  number: n,
})

// The e2e tests run without an API, so this stands in for it: two answered,
// four open.
async function serve(page: Page) {
  await page.route('**/api/requirements/r1', (route) =>
    route.fulfill({
      json: {
        id: 'r1',
        title: 'Rebook a missed delivery, with a title long enough to need cutting short on a phone',
        idea: 'Customers rebook a missed delivery themselves.',
        status: 'in_progress',
        created_at: '2026-10-15T12:00:00Z',
        updated_at: '2026-10-15T12:00:00Z',
        progress: { answered: 2, total: 6 },
      },
    }),
  )
  await page.route('**/api/requirements/r1/questions', (route) =>
    route.fulfill({
      json: {
        open: [3, 4, 5, 6].map(question),
        answered: [1, 2].map((n) => ({ ...question(n), answer: 'An answer' })),
        exhausted: false,
      },
    }),
  )
}

const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

const box = async (page: Page, name: RegExp) => (await page.getByRole('region', { name }).boundingBox())!

test('on a wide screen the Answered pile and the stack sit either side of the card', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await serve(page)
  await page.goto('/requirements/r1')
  await expect(page.getByText('Question 3 of about 6')).toBeVisible()

  const card = await box(page, /^Question number 3/)
  const answered = await box(page, /^Answered/)
  const next = await box(page, /^In the stack/)
  expect(answered.x + answered.width).toBeLessThan(card.x)
  expect(next.x).toBeGreaterThan(card.x + card.width)
  expect(answered.y).toBeLessThan(card.y + card.height)
})

test.describe('at phone width', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('the side columns stack under the card, with no sideways scroll', async ({ page }) => {
    await serve(page)
    await page.goto('/requirements/r1')
    await expect(page.getByText('Question 3 of about 6')).toBeVisible()

    const card = await box(page, /^Question number 3/)
    const answered = await box(page, /^Answered/)
    const next = await box(page, /^In the stack/)
    expect(answered.y).toBeGreaterThan(card.y + card.height)
    expect(next.y).toBeGreaterThan(answered.y + answered.height)
    expect(await fitsWidth(page)).toBe(true)
  })

  // The wordmark gives way on a phone, so the title isn't cut to a letter or two.
  test('the header leaves the title room', async ({ page }) => {
    await serve(page)
    await page.goto('/requirements/r1')
    const title = page.getByRole('banner').getByRole('heading', { level: 1 })
    await expect(title).toBeVisible()
    expect((await title.boundingBox())!.width).toBeGreaterThan(140)
  })
})
