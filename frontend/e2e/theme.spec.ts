import { expect, type Page, test } from '@playwright/test'
import { resolveColour } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test.describe('dark mode only', () => {
  test('the page is the background colour, with foreground text', async ({ page }) => {
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      await resolveColour(page, 'var(--background)'),
    )
    await expect(page.locator('body')).toHaveCSS(
      'color',
      await resolveColour(page, 'var(--foreground)'),
    )
  })

  test.describe('when the OS prefers light', () => {
    test.use({ colorScheme: 'light' })

    test('stays dark', async ({ page }) => {
      await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
      await expect(page.locator('body')).toHaveCSS(
        'background-color',
        await resolveColour(page, 'var(--background)'),
      )
    })
  })

  test('paints the background before the stylesheet loads', async ({ page }) => {
    const background = await resolveColour(page, 'var(--background)')
    // With the stylesheet blocked, only index.html's inline style is left, so
    // this also catches its copy of the colour drifting from theme.css.
    await page.route('**/*.css', (route) => route.abort())
    await page.goto('/')
    await expect(page.locator('html')).toHaveCSS('background-color', background)
  })
})

test.describe('type', () => {
  const wordmark = (page: Page) =>
    page.getByRole('banner').getByText('ANVIL', { exact: true })

  test('every font in use loads', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready)
    const faces = await page.evaluate(() =>
      [...document.fonts].map((face) => ({ family: face.family, status: face.status })),
    )
    expect(faces.filter((face) => face.status === 'error')).toEqual([])
    // The body and wordmark fonts are web fonts that loaded, not fallbacks.
    for (const target of [page.locator('body'), wordmark(page)]) {
      const first = await target.evaluate(
        (el) => getComputedStyle(el).fontFamily.split(',')[0].replaceAll('"', '').trim(),
      )
      expect(faces).toContainEqual({ family: first, status: 'loaded' })
    }
  })

  test("the wordmark's font is used nowhere else", async ({ page }) => {
    const users = await wordmark(page).evaluate((mark) => {
      const family = getComputedStyle(mark).fontFamily
      return [...document.querySelectorAll('body *')]
        .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE))
        .filter((el) => getComputedStyle(el).fontFamily === family)
        .map((el) => el.textContent)
    })
    expect(users).toEqual(['ANVIL'])
  })
})
