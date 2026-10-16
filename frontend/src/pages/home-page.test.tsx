import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Requirement, RequirementList } from '@/lib/requirements'
import { HomePage } from '@/pages/home-page'

// Real time, as the cards compare against it. Far enough from each boundary
// that a slow test can't tip "2h ago" over.
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

function requirement(overrides: Partial<Requirement>): Requirement {
  return {
    id: 'abc-123',
    title: 'Route change alerts',
    idea: 'Drivers should see route changes on their phone without calling the depot.',
    status: 'draft',
    created_at: hoursAgo(2),
    updated_at: hoursAgo(2),
    progress: null,
    ...overrides,
  }
}

const routeAlerts = requirement({ id: 'r1', status: 'in_progress', updated_at: hoursAgo(2.5) })
const offlineSync = requirement({
  id: 'r2',
  title: 'Offline sync for drivers',
  idea: 'The app keeps working in dead zones and syncs once signal comes back.',
  status: 'complete',
  updated_at: hoursAgo(30),
})
const bulkImport = requirement({
  id: 'r3',
  title: 'Bulk import depots',
  idea: 'Admins upload a spreadsheet of depots instead of adding them one at a time.',
  status: 'draft',
  updated_at: hoursAgo(24 * 21),
})
const everyRequirement = [routeAlerts, offlineSync, bulkImport]

// Stands in for GET /api/requirements, which returns every requirement.
// Returns the mock, to look at what was asked for.
function serve(requirements: Requirement[], response?: (url: URL) => Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(String(input), location.origin)
    if (url.pathname === '/api/config') return Response.json({ idea_placeholder: 'An idea' })
    if (response) return response(url)
    const list: RequirementList = { items: requirements }
    return Response.json(list)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const listRequests = (fetch: ReturnType<typeof serve>) =>
  fetch.mock.calls.map(([input]) => String(input)).filter((url) => url !== '/api/config')

async function renderHome(path = '/') {
  const router = createMemoryRouter(
    [
      { path: '/', element: <HomePage /> },
      { path: '/requirements/:id', element: <p>Opened</p> },
    ],
    { initialEntries: [path] },
  )
  const screen = await render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { screen, router }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const intro = "Describe it in your own words. Anvil will ask questions until it's clear."

test('a first visit shows the steps and the intro, and no tabs', async () => {
  serve([])
  const { screen } = await renderHome()

  await expect.element(screen.getByText('Your requirements will appear here.')).toBeVisible()
  const steps = screen.getByRole('listitem')
  await expect.element(steps.nth(0)).toHaveTextContent('1. Describe your idea')
  await expect.element(steps.nth(1)).toHaveTextContent("2. Answer Anvil's questions")
  await expect.element(steps.nth(2)).toHaveTextContent('3. Get a clear requirement')
  await expect.element(screen.getByText(intro)).toBeVisible()
  await expect.element(screen.getByRole('tablist')).not.toBeInTheDocument()
  await expect.element(screen.getByRole('heading', { name: 'Your requirements' })).not.toBeInTheDocument()
})

test('cards show each requirement, newest first', async () => {
  serve(everyRequirement)
  const { screen } = await renderHome()

  const cards = screen.getByRole('listitem')
  await expect.element(cards.nth(2)).toBeVisible()
  expect(cards.elements()).toHaveLength(3)

  const first = cards.nth(0)
  await expect.element(first).toMatchTextContent('In progress')
  await expect.element(first).toMatchTextContent('2h ago')
  await expect.element(first).toMatchTextContent('Route change alerts')
  await expect.element(first).toMatchTextContent('Drivers should see route changes')
  await expect
    .element(first.getByRole('progressbar', { name: 'Not started' }))
    .toHaveAttribute('aria-valuenow', '0')
  await expect.element(cards.nth(1)).toMatchTextContent('Complete')
  await expect.element(cards.nth(1)).toMatchTextContent('Yesterday')
  await expect.element(cards.nth(2)).toMatchTextContent('Draft')
  await expect.element(cards.nth(2)).toMatchTextContent('3w ago')

  await expect
    .element(screen.getByRole('link', { name: 'Offline sync for drivers' }))
    .toHaveAttribute('href', '/requirements/r2')
  // With requirements, the prompt drops its intro.
  await expect.element(screen.getByText(intro)).not.toBeInTheDocument()
})

test('a card opens its requirement', async () => {
  serve(everyRequirement)
  const { screen, router } = await renderHome()

  await screen.getByRole('link', { name: 'Bulk import depots' }).click()

  await expect.element(screen.getByText('Opened')).toBeVisible()
  expect(router.state.location.pathname).toBe('/requirements/r3')
})

test('each tab shows its count', async () => {
  serve([...everyRequirement, requirement({ id: 'r4', status: 'draft' })])
  const { screen } = await renderHome()

  await expect.element(screen.getByRole('tab', { name: 'All 4' })).toHaveAttribute('aria-selected', 'true')
  await expect.element(screen.getByRole('tab', { name: 'Draft 2' })).toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'In progress 1' })).toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'Complete 1' })).toBeVisible()
})

test('a tab filters by status in the browser and puts it in the URL', async () => {
  const fetch = serve(everyRequirement)
  const { screen, router } = await renderHome()

  await screen.getByRole('tab', { name: /^Complete/ }).click()

  await expect.element(screen.getByRole('link', { name: 'Route change alerts' })).not.toBeInTheDocument()
  await expect.element(screen.getByRole('link', { name: 'Offline sync for drivers' })).toBeVisible()
  expect(router.state.location.search).toBe('?status=complete')

  await screen.getByRole('tab', { name: /^All/ }).click()
  await expect.element(screen.getByRole('link', { name: 'Route change alerts' })).toBeVisible()
  expect(router.state.location.search).toBe('')
  expect(listRequests(fetch)).toEqual(['/api/requirements'])
})

test('the status in the URL picks the tab', async () => {
  const fetch = serve(everyRequirement)
  const { screen } = await renderHome('/?status=draft')

  await expect.element(screen.getByRole('tab', { name: /^Draft/ })).toHaveAttribute('aria-selected', 'true')
  await expect.element(screen.getByRole('link', { name: 'Bulk import depots' })).toBeVisible()
  await expect.element(screen.getByRole('link', { name: 'Route change alerts' })).not.toBeInTheDocument()
  expect(listRequests(fetch)).toEqual(['/api/requirements'])
})

test('an unknown status in the URL shows them all', async () => {
  const fetch = serve(everyRequirement)
  const { screen } = await renderHome('/?status=done')

  await expect.element(screen.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true')
  expect(listRequests(fetch)).toEqual(['/api/requirements'])
})

test('a tab with nothing in it says so', async () => {
  serve([routeAlerts])
  const { screen } = await renderHome('/?status=complete')

  await expect.element(screen.getByText('No complete requirements yet.')).toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'Complete 0' })).toBeVisible()
})

test('a spinner shows while the list loads, and nothing else yet', async () => {
  serve([], () => new Promise(() => {}))
  const { screen } = await renderHome()

  await expect.element(screen.getByRole('status')).toHaveTextContent('Loading your requirements…')
  await expect.element(screen.getByRole('heading', { name: 'Your requirements' })).not.toBeInTheDocument()
  await expect.element(screen.getByText('Your requirements will appear here.')).not.toBeInTheDocument()
  await expect.element(screen.getByRole('textbox')).not.toBeInTheDocument()
})

test('a failure shows only a message, and Retry loads the page', async () => {
  let fail = true
  serve([], async () =>
    fail
      ? Response.json({ detail: 'database unreachable' }, { status: 503 })
      : Response.json({ items: [routeAlerts] }),
  )
  const { screen } = await renderHome()

  await expect.element(screen.getByRole('alert')).toHaveTextContent("Couldn't load your requirements.")
  await expect.element(screen.getByRole('textbox')).not.toBeInTheDocument()
  fail = false
  await screen.getByRole('button', { name: 'Retry' }).click()
  await expect.element(screen.getByRole('link', { name: 'Route change alerts' })).toBeVisible()
})
