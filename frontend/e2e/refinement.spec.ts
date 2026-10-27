import { expect, type Page, test } from '@playwright/test'
import { measureText } from './helpers.ts'

const question = (n: number, topic = ['Who it’s for', 'The problem', 'Success', 'Edge cases'][n % 4]) => ({
  id: `q${n}`,
  topic,
  text: `Question number ${n}, long enough that it wraps onto a second line on a phone?`,
  why: 'Why Anvil is asking.',
  suggestions: ['First suggestion', 'Second suggestion', 'Third suggestion'],
  number: n,
})

/**
 * The e2e tests run without an API, so this stands in for it: two answered,
 * four open. `topic` replaces each Question's topic.
 */
async function serve(page: Page, status = 'in_progress', topic?: (n: number) => string) {
  await page.route('**/api/projects', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'p1',
            name: 'Parcel delivery platform',
            context: 'Parcels.',
            has_context: true,
            requirement_count: 1,
            is_owner: true,
          },
        ],
      },
    }),
  )
  await page.route('**/api/requirements/r1', (route) =>
    route.fulfill({
      json: {
        id: 'r1',
        title: 'Rebook a missed delivery, with a title long enough to need cutting short on a phone',
        idea: 'Customers rebook a missed delivery themselves.',
        project: { id: 'p1', name: 'Parcel delivery platform' },
        status,
        created_at: '2026-10-15T12:00:00Z',
        updated_at: '2026-10-15T12:00:00Z',
        progress: { answered: 2, total: 6 },
      },
    }),
  )
  await page.route('**/api/requirements/r1/questions', (route) =>
    route.fulfill({
      json: {
        open: [3, 4, 5, 6].map((n) => question(n, topic?.(n))),
        answered: [1, 2].map((n) => ({ ...question(n, topic?.(n)), answer: 'An answer' })),
        exhausted: false,
      },
    }),
  )
}

const fitsWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

const box = async (page: Page, name: RegExp) => (await page.getByRole('region', { name }).boundingBox())!

test('on a wide screen the Project and status sit in the header, by the title', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await serve(page, 'draft')
  await page.goto('/requirements/r1')
  const banner = page.getByRole('banner')
  await expect(banner.getByRole('combobox', { name: 'Project' })).toBeVisible()
  await expect(banner.getByText('Draft')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Project' })).toHaveCount(1)
})

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

// Topics have no length limit, so a model's long one is cut to a line
// wherever it shows, rather than wrapping or widening the page.
const longTopics = {
  words: (n: number) =>
    `What happens when a customer misses several deliveries in a row across different depots on the same day ${n}`,
  'one unbroken word': (n: number) => `${'x'.repeat(200)}${n}`,
}
for (const width of [390, 1280]) {
  for (const [kind, topic] of Object.entries(longTopics)) {
    test(`a long topic of ${kind} is cut to one line at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await serve(page, 'in_progress', topic)
      await page.goto('/requirements/r1')
      await expect(page.getByText('Question 3 of about 6')).toBeVisible()

      const card = page.getByRole('region', { name: /^Question number 3/ })
      const topics = [
        card.getByText(topic(3), { exact: true }),
        page.getByRole('region', { name: /^Answered/ }).getByText(topic(2), { exact: true }),
        page.getByRole('region', { name: /^In the stack/ }).getByText(topic(4), { exact: true }),
      ]
      for (const shown of topics) {
        await expect(shown).toBeVisible()
        expect(await measureText(shown)).toMatchObject({ lines: 1, cutAcross: true })
      }

      // The number beside it keeps its room, inside the card.
      const number = card.getByText('#3', { exact: true })
      expect(await measureText(number)).toEqual({ lines: 1, cutAcross: false, cutDown: false })
      const [numberBox, topicBox, cardBox] = await Promise.all(
        [number, topics[0], card].map(async (locator) => (await locator.boundingBox())!),
      )
      expect(numberBox.x).toBeGreaterThan(topicBox.x + topicBox.width)
      expect(numberBox.x + numberBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)
      expect(await fitsWidth(page)).toBe(true)
    })
  }
}

test.describe('at phone width', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  // The header only has room for the title, so they go under it.
  test('the Project and status sit under the header, with no sideways scroll', async ({ page }) => {
    await serve(page, 'draft')
    await page.goto('/requirements/r1')
    const main = page.getByRole('main')
    await expect(main.getByRole('combobox', { name: 'Project' })).toBeVisible()
    await expect(main.getByText('Draft')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Project' })).toHaveCount(1)
    expect(await fitsWidth(page)).toBe(true)
  })

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

  // The wordmark gives way and the section links shrink to icons on a phone,
  // so the title isn't cut to a letter or two.
  test('the header leaves the title room', async ({ page }) => {
    await serve(page, 'draft')
    await page.goto('/requirements/r1')
    const title = page.getByRole('banner').getByRole('heading', { level: 1 })
    await expect(title).toBeVisible()
    expect((await title.boundingBox())!.width).toBeGreaterThan(140)
    const sections = page.getByRole('navigation', { name: 'Sections' })
    for (const name of ['Requirements', 'Projects'])
      await expect(sections.getByRole('link', { name })).toBeVisible()
    expect(await fitsWidth(page)).toBe(true)
  })
})
