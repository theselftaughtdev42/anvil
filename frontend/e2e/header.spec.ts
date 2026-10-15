import { expect, type Locator, type Page, test } from '@playwright/test'
import { resolveColour } from './helpers.ts'

const home = (page: Page) => page.getByRole('banner').getByRole('link', { name: 'ANVIL' })
const account = (page: Page) => page.getByRole('button', { name: 'Account' })
// The centred content column inside the header.
const column = (page: Page) => page.getByRole('banner').locator('> div')

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('the logo links home', async ({ page }) => {
  await expect(home(page)).toHaveAttribute('href', '/')
})

test('the mark sits left of the wordmark', async ({ page }) => {
  const mark = await home(page).locator('svg').boundingBox()
  const wordmark = await home(page).getByText('ANVIL', { exact: true }).boundingBox()
  expect(mark!.x + mark!.width).toBeLessThanOrEqual(wordmark!.x)
})

test('the account button is round and shows initials', async ({ page }) => {
  await expect(account(page)).toHaveText(/^[A-Z]{1,2}$/)
  const box = await account(page).boundingBox()
  expect(box!.width).toBe(box!.height)
  expect(
    parseFloat(await account(page).evaluate((el) => getComputedStyle(el).borderRadius)),
  ).toBeGreaterThanOrEqual(box!.width / 2)
})

test.describe('content column', () => {
  // Content sits from the column's padding edge to the other. Uses the client
  // rect, not boundingBox(), which is null for an empty <main>.
  const contentEdges = (target: Locator) =>
    target.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return {
        left: box.left + parseFloat(style.paddingLeft),
        right: box.right - parseFloat(style.paddingRight),
      }
    })

  test('is capped and centred on a wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    const { left, right } = await contentEdges(column(page))
    expect(left).toBeGreaterThan(100) // capped, not full width
    expect(left).toBeCloseTo(1920 - right, 0)
  })

  test('keeps even gutters, with no sideways scroll, at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const { left, right } = await contentEdges(column(page))
    expect(left).toBeGreaterThan(0)
    expect(left).toBeCloseTo(390 - right, 0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })

  for (const width of [1920, 390]) {
    test(`is shared by the header and the page content at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      expect(await contentEdges(page.getByRole('main'))).toEqual(
        await contentEdges(column(page)),
      )
    })
  }
})

test.describe('focus rings', () => {
  const ring = (target: Locator) => target.evaluate((el) => getComputedStyle(el).boxShadow)

  test('show on keyboard focus', async ({ page }) => {
    for (const target of [home(page), account(page)]) {
      await page.keyboard.press('Tab')
      await expect(target).toBeFocused()
      // Poll: the ring fades in with the button's transition.
      await expect.poll(() => ring(target)).not.toBe('none')
    }
  })

  test('are ember', async ({ page }) => {
    expect(await resolveColour(page, 'var(--ring)')).toBe(
      await resolveColour(page, 'var(--primary)'),
    )
  })

  test('stay hidden on mouse click', async ({ page }) => {
    await account(page).click()
    await expect(account(page)).toBeFocused()
    // Let any ring transition finish, so a ring that faded in would show.
    await account(page).evaluate((el) =>
      Promise.all(el.getAnimations().map((animation) => animation.finished)),
    )
    expect(await ring(account(page))).toBe('none')
  })
})
