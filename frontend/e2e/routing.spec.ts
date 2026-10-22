import { expect, type Page, test } from '@playwright/test'

const requirement = {
  id: 'abc-123',
  title: 'Route change alerts',
  idea: 'Drivers see route changes on their phone.',
  project: { id: 'p1', name: 'Driver app' },
  status: 'draft',
  created_at: '2026-10-15T12:00:00Z',
  updated_at: '2026-10-15T12:00:00Z',
  progress: { answered: 0, total: 1 },
}
const stack = {
  open: [{ id: 'q1', topic: "Who it's for", text: 'Who will use this most?', why: null, suggestions: ['Customers'], number: 1 }],
  answered: [],
  exhausted: false,
}

/** The e2e tests run without an API, so this stands in for it. */
async function serveRequirement(page: Page) {
  await page.route('**/api/requirements/abc-123', (route) => route.fulfill({ json: requirement }))
  await page.route('**/api/requirements/abc-123/questions', (route) => route.fulfill({ json: stack }))
}

test('a requirement link loads its page directly', async ({ page }) => {
  await serveRequirement(page)
  await page.goto('/requirements/abc-123')
  await expect(page.getByRole('banner').getByRole('heading', { name: 'Route change alerts' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Who will use this most?' })).toBeVisible()
})

test('the requirement page links back home from the logo', async ({ page }) => {
  await serveRequirement(page)
  await page.route('**/api/requirements', (route) => route.fulfill({ json: { items: [requirement] } }))
  await page.route('**/api/config', (route) => route.fulfill({ json: { idea_placeholder: 'An idea' } }))
  await page.goto('/requirements/abc-123')
  await page.getByRole('banner').getByRole('link', { name: 'ANVIL' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Who will use this most?' })).toBeHidden()
})

test('a requirement that is not found shows the not-found page', async ({ page }) => {
  await page.route('**/api/requirements/gone*', (route) =>
    route.fulfill({ status: 404, json: { detail: 'Requirement not found' } }),
  )
  await page.route('**/api/requirements/gone/questions', (route) =>
    route.fulfill({ status: 404, json: { detail: 'Requirement not found' } }),
  )
  await page.goto('/requirements/gone')
  await expect(page.getByText('404 · Requirement not found')).toBeVisible()
})

const notFound = (page: Page) => page.getByRole('heading', { name: "Nothing's on the anvil here" })

test('an unknown address shows the not-found page, under the header', async ({ page }) => {
  await page.goto('/no/such/page')
  await expect(notFound(page)).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()
})

// Going back from the first page of a visit would leave Anvil.
test('going back from a not-found first page goes home', async ({ page }) => {
  await page.goto('/no/such/page')
  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(page).toHaveURL('/')
})
