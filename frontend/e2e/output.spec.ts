import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { resolveColour } from './helpers.ts'

const GHERKIN = [
  '# Written by Anvil',
  'Feature: Rebook a missed delivery',
  '',
  '  Scenario Outline: Another day',
  '    Given a missed delivery to "<address>"',
  '    When I pick a day that is a long way off so this step runs well past the edge of a phone screen',
  '    Then it moves to that day',
  '',
  '      Examples:',
  '        | address     |',
  '        | 1 High \\| St |',
  '',
].join('\n')

/**
 * Stands in for the API: a Complete Requirement with no Output yet. Generating
 * answers with each of `replies` in turn, a status code or the Output, and
 * waits for `release` first when it's given.
 */
async function serve(page: Page, replies: (number | 'ok')[], release?: Promise<void>) {
  await page.route('**/api/projects', (route) => route.fulfill({ json: { items: [] } }))
  await page.route('**/api/requirements/r1', (route) =>
    route.fulfill({
      json: {
        id: 'r1',
        title: 'Rebook a missed delivery',
        idea: 'Customers rebook a missed delivery themselves.',
        project: { id: 'p1', name: 'Parcels' },
        status: 'complete',
        created_at: '2026-11-02T12:00:00Z',
        updated_at: '2026-11-02T12:00:00Z',
        progress: { answered: 2, total: 2 },
      },
    }),
  )
  const answered = [1, 2].map((n) => ({ id: `q${n}`, topic: 'Who', text: `Question ${n}?`, answer: 'An answer', number: n }))
  await page.route('**/api/requirements/r1/questions', (route) =>
    route.fulfill({ json: { open: [], answered, exhausted: true, nothing_new_since_reopen: false } }),
  )
  let output: unknown
  await page.route('**/api/requirements/r1/outputs', (route) =>
    route.fulfill({ json: { items: output ? [output] : [] } }),
  )
  await page.route('**/api/requirements/r1/outputs/gherkin', async (route) => {
    await release
    const reply = replies.shift()
    if (reply !== 'ok') {
      await route.fulfill({ status: reply, json: { detail: 'The refinement agent is unavailable. Try again.' } })
      return
    }
    output = { format: 'gherkin', content: GHERKIN, generated_at: new Date().toISOString() }
    await route.fulfill({ json: output })
  })
}

test('generating shows the Gherkin, after a failure and a retry', async ({ page }) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await serve(page, [503, 'ok'], held)
  await page.goto('/requirements/r1')

  await page.getByRole('tab', { name: 'Output' }).click()
  await expect(page.getByRole('heading', { name: 'No Output yet' })).toBeVisible()
  const generate = page.getByRole('button', { name: 'Generate Gherkin' })
  await generate.click()

  await expect(generate).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('Anvil is writing it from 2 Answers')
  release()

  await expect(page.getByRole('alert')).toHaveText("Couldn't generate the Gherkin. Try again.")
  await generate.click()

  const gherkin = page.getByLabel('Gherkin', { exact: true })
  await expect(gherkin).toHaveText(GHERKIN, { useInnerText: true })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Regenerate' })).toBeEnabled()
})

test('generating carries on while the Refinement tab is open', async ({ page }) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await serve(page, ['ok'], held)
  await page.goto('/requirements/r1')
  await page.getByRole('tab', { name: 'Output' }).click()
  await page.getByRole('button', { name: 'Generate Gherkin' }).click()

  await page.getByRole('tab', { name: 'Refinement' }).click()
  await page.getByRole('tab', { name: 'Output' }).click()
  await expect(page.getByRole('button', { name: 'Generate Gherkin' })).toBeDisabled()
  release()

  await expect(page.getByLabel('Gherkin', { exact: true })).toContainText('Feature: Rebook a missed delivery')
})

async function showOutput(page: Page) {
  await serve(page, ['ok'])
  await page.goto('/requirements/r1')
  await page.getByRole('tab', { name: 'Output' }).click()
  await page.getByRole('button', { name: 'Generate Gherkin' }).click()
  await expect(page.getByLabel('Gherkin', { exact: true })).toBeVisible()
}

test('on a phone the Output fits the width, and long steps scroll inside the code', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await showOutput(page)

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true)
  const gherkin = page.getByLabel('Gherkin', { exact: true })
  expect(await gherkin.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  const tops = new Set<number>()
  for (const name of ['Copy', 'Download', 'Regenerate']) {
    const button = page.getByRole('button', { name, exact: true })
    await expect(button).toBeInViewport({ ratio: 1 })
    tops.add((await button.boundingBox())!.y)
  }
  // One row, with Copy and Download as square icon buttons
  expect(tops.size).toBe(1)
  for (const name of ['Copy', 'Download']) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!
    expect(box.width).toBe(box.height)
  }
  for (const name of ['Refinement', 'Output']) {
    await expect(page.getByRole('tab', { name })).toBeInViewport({ ratio: 1 })
  }
})

test('the Gherkin is highlighted with the theme colours', async ({ page }) => {
  await showOutput(page)
  const gherkin = page.getByLabel('Gherkin', { exact: true })
  const colours = {
    'Feature:': 'var(--gherkin-keyword)',
    Given: 'var(--gherkin-step)',
    '<address>': 'var(--gherkin-placeholder)',
    '|': 'var(--gherkin-punctuation)',
    '1 High \\| St': 'var(--gherkin-string)',
    '# Written by Anvil': 'var(--gherkin-comment)',
  }
  for (const [text, colour] of Object.entries(colours)) {
    await expect(gherkin.getByText(text, { exact: true }).first()).toHaveCSS('color', await resolveColour(page, colour))
  }
})

test('Copy puts the exact Gherkin on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await showOutput(page)

  const copy = page.getByRole('button', { name: 'Copy', exact: true })
  const width = (await copy.boundingBox())!.width
  await copy.click()

  const copied = page.getByRole('button', { name: 'Copied', exact: true })
  await expect(copied).toBeVisible()
  expect((await copied.boundingBox())!.width).toBe(width)
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(GHERKIN)
})

test("Download saves the Gherkin as a .feature file named after the Requirement's title", async ({ page }) => {
  await showOutput(page)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ])

  expect(download.suggestedFilename()).toBe('rebook-a-missed-delivery.feature')
  expect(await readFile(await download.path(), 'utf8')).toBe(GHERKIN)
})
