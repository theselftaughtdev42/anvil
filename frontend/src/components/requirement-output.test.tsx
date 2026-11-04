import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { type GherkinState, RequirementOutput } from '@/components/requirement-output'
import type { Output } from '@/lib/outputs'
import type { Requirement } from '@/lib/requirements'

const REQUIREMENT: Requirement = {
  id: 'r1',
  title: 'Rebook a missed delivery',
  idea: 'Customers rebook a missed delivery.',
  project: { id: 'p1', name: 'Parcels' },
  status: 'complete',
  created_at: '2026-11-02T14:00:00Z',
  updated_at: '2026-11-02T14:00:00Z',
  progress: { answered: 9, total: 9 },
}

const OUTPUT: Output = {
  format: 'gherkin',
  content: 'Feature: Rebook a missed delivery\n\n  Scenario: Another day\n    Then it moves\n',
  generated_at: '2026-11-02T14:32:00Z',
  out_of_date: false,
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function show(gherkin: Partial<GherkinState>, requirement: Partial<Requirement> = {}) {
  const state: GherkinState = { output: undefined, generating: false, failed: false, onGenerate: vi.fn(), ...gherkin }
  return {
    state,
    screen: render(<RequirementOutput requirement={{ ...REQUIREMENT, ...requirement }} answered={9} gherkin={state} />),
  }
}

test('with no Output yet it offers to generate one', async () => {
  const { state } = show({})

  await expect.element(page.getByRole('heading', { name: 'No Output yet' })).toBeVisible()
  await expect.element(page.getByText('Not generated yet')).toBeVisible()
  await expect.element(page.getByText(/drawn from its 9 Answers/)).toBeVisible()
  await page.getByRole('button', { name: 'Generate Gherkin' }).click()
  expect(state.onGenerate).toHaveBeenCalledOnce()
})

test.each(['draft', 'in_progress'] as const)('a %s Requirement explains the Output opens up once Complete', async (status) => {
  show({}, { status })

  await expect.element(page.getByRole('button', { name: 'Generate Gherkin' })).toBeDisabled()
  await expect.element(page.getByText(/opens up once this Requirement is Complete/)).toBeVisible()
})

test('an Out of date Output still copies and downloads, but only regenerates once Complete', async () => {
  show({ output: { ...OUTPUT, out_of_date: true } }, { status: 'in_progress' })

  await expect.element(page.getByText('Out of date', { exact: true }).first()).toBeVisible()
  await expect.element(page.getByText(/, before it was reopened/)).toBeVisible()
  await expect.element(page.getByRole('button', { name: 'Copy', exact: true })).toBeEnabled()
  await expect.element(page.getByRole('button', { name: 'Download' })).toBeEnabled()
  const regenerate = page.getByRole('button', { name: 'Regenerate' })
  await expect.element(regenerate).toBeDisabled()
  await expect.element(regenerate).toHaveAccessibleDescription(/Confirm it Complete again to regenerate/)
})

test('an Out of date Output of a Complete Requirement can regenerate', async () => {
  const { state } = show({ output: { ...OUTPUT, out_of_date: true } })

  await expect.element(page.getByText(/Regenerate it to draw on the Answers since it was reopened/)).toBeVisible()
  await page.getByRole('button', { name: 'Regenerate' }).click()
  expect(state.onGenerate).toHaveBeenCalledOnce()
})

test('while generating the button is disabled and says so', async () => {
  show({ generating: true })

  await expect.element(page.getByRole('button', { name: 'Generate Gherkin' })).toBeDisabled()
  await expect.element(page.getByRole('status')).toHaveTextContent('Anvil is writing it from 9 Answers. This takes a few seconds.')
  await expect.element(page.getByText('Generating…')).toBeVisible()
})

test('a failure says so and the button retries', async () => {
  const { state } = show({ failed: true })

  await expect.element(page.getByRole('alert')).toHaveTextContent("Couldn't generate the Gherkin. Try again.")
  await page.getByRole('button', { name: 'Generate Gherkin' }).click()
  expect(state.onGenerate).toHaveBeenCalledOnce()
})

test('a failure keeps the previous Output', async () => {
  show({ output: OUTPUT, failed: true })

  await expect.element(page.getByRole('alert')).toHaveTextContent("Couldn't generate the Gherkin. Try again.")
  await expect.element(page.getByLabelText('Gherkin', { exact: true })).toBeVisible()
  expect(page.getByLabelText('Gherkin', { exact: true }).element().textContent).toBe(OUTPUT.content)
})

test('an Output shows in monospace, with Regenerate', async () => {
  const { state } = show({ output: OUTPUT })

  const gherkin = page.getByLabelText('Gherkin', { exact: true })
  await expect.element(gherkin).toBeVisible()
  expect(gherkin.element().textContent).toBe(OUTPUT.content)
  expect(getComputedStyle(gherkin.element()).whiteSpace).toBe('pre')
  expect(getComputedStyle(gherkin.element()).fontFamily).toMatch(/mono/i)
  await expect.element(page.getByText(/^Generated \d+ Nov, \d\d:\d\d$/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Regenerate' }).click()
  expect(state.onGenerate).toHaveBeenCalledOnce()
})

test('an Output says when it was generated and from how many Answers', async () => {
  show({ output: OUTPUT })

  await expect.element(page.getByText(/^Generated 2 Nov 2026 at \d\d:\d\d · from 9 Answers$/)).toBeVisible()
  expect(page.getByRole('time').element().getAttribute('datetime')).toBe(OUTPUT.generated_at)
})

test('the Gherkin is highlighted, line by line', async () => {
  show({ output: { ...OUTPUT, content: 'Feature: A\n  # Note\n\n  Scenario: B\n    Given "<x>"\n      | a |\n' } })

  await expect.element(page.getByLabelText('Gherkin', { exact: true })).toBeVisible()
  const gherkin = page.getByLabelText('Gherkin', { exact: true }).element()
  const kindOf = (text: string) =>
    [...gherkin.querySelectorAll<HTMLElement>('[data-kind]')].find((el) => el.textContent === text)?.dataset.kind
  expect(kindOf('Feature:')).toBe('keyword')
  expect(kindOf('  # Note')).toBe('comment')
  expect(kindOf('Given')).toBe('step')
  expect(kindOf('<x>')).toBe('placeholder')
  expect(kindOf('|')).toBe('pipe')
  expect(kindOf('a')).toBe('cell')
})

test('the code bar names the file Download saves', async () => {
  show({ output: OUTPUT })

  await expect.element(page.getByText('rebook-a-missed-delivery.feature')).toBeVisible()
  await expect.element(page.getByText('Read-only')).toBeVisible()
})

test('Copy puts the Gherkin on the clipboard and says so', async () => {
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  show({ output: OUTPUT })

  await page.getByRole('button', { name: 'Copy' }).click()

  expect(writeText).toHaveBeenCalledWith(OUTPUT.content)
  await expect.element(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible()
  await expect.element(page.getByRole('status')).toHaveTextContent('Copied the Gherkin')
})

test('Copy says when the clipboard refuses', async () => {
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
  show({ output: OUTPUT })

  await page.getByRole('button', { name: 'Copy' }).click()

  await expect.element(page.getByRole('alert')).toHaveTextContent(
    "Couldn't copy the Gherkin. Select it and copy it yourself, or Download it.",
  )
  await expect.element(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible()
})

test('Copy says so when there is no clipboard, as over plain http', async () => {
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(undefined as unknown as Clipboard)
  show({ output: OUTPUT })

  await page.getByRole('button', { name: 'Copy' }).click()

  await expect.element(page.getByRole('alert')).toHaveTextContent(
    "Couldn't copy the Gherkin. Select it and copy it yourself, or Download it.",
  )
})

test('Copied goes back to Copy after two seconds', async () => {
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  show({ output: OUTPUT })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

  await page.getByRole('button', { name: 'Copy' }).click()
  await vi.waitFor(() => page.getByRole('button', { name: 'Copied', exact: true }).element())
  await vi.advanceTimersByTimeAsync(1999)
  expect(page.getByRole('button', { name: 'Copied', exact: true }).query()).not.toBeNull()
  await vi.advanceTimersByTimeAsync(1)

  await vi.waitFor(() => page.getByRole('button', { name: 'Copy', exact: true }).element())
  expect(page.getByRole('status').element().textContent).toBe('')
})
