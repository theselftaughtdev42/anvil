import { expect, type Page, test } from '@playwright/test'

const GHERKIN = 'Feature: Rebook a missed delivery\n\n  Scenario: Another day\n    Then it moves to that day\n'

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

test('on a phone the Output fits the width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await serve(page, ['ok'])
  await page.goto('/requirements/r1')
  await page.getByRole('tab', { name: 'Output' }).click()
  await page.getByRole('button', { name: 'Generate Gherkin' }).click()
  await expect(page.getByLabel('Gherkin', { exact: true })).toBeVisible()

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
  ).toBe(true)
})
