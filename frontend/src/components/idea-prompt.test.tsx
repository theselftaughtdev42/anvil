import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { IdeaPrompt } from '@/components/idea-prompt'
import { requirementsKey } from '@/lib/requirements'

const requirement = {
  id: 'abc-123',
  title: 'Route change alerts',
  idea: 'Route change alerts',
  status: 'draft',
  created_at: '2026-10-15T12:00:00Z',
  updated_at: '2026-10-15T12:00:00Z',
  progress: null,
}

function RequirementStub() {
  return <p>Requirement {useParams().id}</p>
}

const placeholder = 'Riders can tip their driver'

// Stands in for the server: /api/config answers straight away, and every
// other fetch waits for `response`, so tests can look at the form while it's
// submitting. Returns the mock of those other fetches.
function respondWith(response: () => Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(response)
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof globalThis.fetch>(async (input, init) =>
      input === '/api/config' ? Response.json({ idea_placeholder: placeholder }) : fetch(input, init),
    ),
  )
  return fetch
}

// A response that arrives when the test calls `resolve`.
function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((r) => (resolve = r))
  return { response: () => promise, resolve }
}

async function renderPrompt(props: { showIntro?: boolean } = {}) {
  const queryClient = new QueryClient()
  const router = createMemoryRouter([
    { path: '/', element: <IdeaPrompt {...props} /> },
    { path: '/requirements/:id', element: <RequirementStub /> },
  ])
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { screen, queryClient, idea: screen.getByRole('textbox', { name: 'Your idea' }) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('the placeholder comes from the server', async () => {
  respondWith(async () => Response.json(requirement, { status: 201 }))
  const { idea } = await renderPrompt()

  await expect.element(idea).toHaveAttribute('placeholder', placeholder)
})

test('Enter creates the requirement and opens it', async () => {
  const fetch = respondWith(async () => Response.json(requirement, { status: 201 }))
  const { screen, idea } = await renderPrompt()

  await idea.fill('Route change alerts')
  await userEvent.keyboard('{Enter}')

  await expect.element(screen.getByText('Requirement abc-123')).toBeVisible()
  const [path, init] = fetch.mock.calls[0]
  expect(path).toBe('/api/requirements')
  expect(init?.method).toBe('POST')
  expect(init?.body).toBe('{"idea":"Route change alerts"}')
})

test('the button submits too', async () => {
  respondWith(async () => Response.json(requirement, { status: 201 }))
  const { screen, idea } = await renderPrompt()

  await idea.fill('Route change alerts')
  await screen.getByRole('button', { name: 'Start refining' }).click()

  await expect.element(screen.getByText('Requirement abc-123')).toBeVisible()
})

test('Shift + Enter adds a new line instead', async () => {
  const fetch = respondWith(async () => Response.json(requirement, { status: 201 }))
  const { idea } = await renderPrompt()

  await idea.fill('First line')
  await userEvent.keyboard('{Shift>}{Enter}{/Shift}Second line')

  await expect.element(idea).toHaveValue('First line\nSecond line')
  expect(fetch).not.toHaveBeenCalled()
})

test('an empty or blank idea does nothing', async () => {
  const fetch = respondWith(async () => Response.json(requirement, { status: 201 }))
  const { screen, idea } = await renderPrompt()

  await idea.click()
  await userEvent.keyboard('{Enter}')
  await idea.fill('   ')
  await screen.getByRole('button', { name: 'Start refining' }).click()

  expect(fetch).not.toHaveBeenCalled()
  await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
})

test('while submitting, the form is locked and ignores another submit', async () => {
  const { response, resolve } = deferred()
  const fetch = respondWith(response)
  const { screen, idea } = await renderPrompt()

  await idea.fill('Route change alerts')
  await userEvent.keyboard('{Enter}')

  await expect.element(screen.getByRole('button', { name: 'Starting' })).toBeDisabled()
  await expect.element(idea).toHaveAttribute('readonly')
  await expect.element(screen.getByText('Opening your requirement…')).toBeVisible()
  await userEvent.keyboard('{Enter}')
  expect(fetch).toHaveBeenCalledTimes(1)

  resolve(Response.json(requirement, { status: 201 }))
  await expect.element(screen.getByText('Requirement abc-123')).toBeVisible()
})

test('a new requirement marks the requirements list stale', async () => {
  respondWith(async () => Response.json(requirement, { status: 201 }))
  const { screen, queryClient, idea } = await renderPrompt()
  queryClient.setQueryData(requirementsKey, { items: [] })

  await idea.fill('Route change alerts')
  await userEvent.keyboard('{Enter}')

  await expect.element(screen.getByText('Requirement abc-123')).toBeVisible()
  expect(queryClient.getQueryState(requirementsKey)?.isInvalidated).toBe(true)
})

test('a failure keeps the idea, shows the error and lets you try again', async () => {
  const fetch = respondWith(async () =>
    Response.json({ detail: 'database unreachable' }, { status: 503 }),
  )
  const { screen, idea } = await renderPrompt()

  await idea.fill('Route change alerts')
  await userEvent.keyboard('{Enter}')

  await expect.element(screen.getByRole('alert')).toHaveTextContent('database unreachable')
  await expect.element(idea).toHaveValue('Route change alerts')
  await expect.element(idea).not.toHaveAttribute('readonly')
  await expect.element(idea).toHaveAccessibleDescription('database unreachable')

  fetch.mockImplementation(async () => Response.json(requirement, { status: 201 }))
  await screen.getByRole('button', { name: 'Start refining' }).click()
  await expect.element(screen.getByText('Requirement abc-123')).toBeVisible()
})

test('the intro and example ideas only show when asked for', async () => {
  respondWith(async () => Response.json(requirement, { status: 201 }))
  const { screen } = await renderPrompt()

  await expect.element(screen.getByRole('textbox', { name: 'Your idea' })).toBeVisible()
  await expect.element(screen.getByText(/Anvil will ask questions/)).not.toBeInTheDocument()
  await expect.element(screen.getByText('Try one:')).not.toBeInTheDocument()
})

test('an example idea fills the prompt, ready to start', async () => {
  const fetch = respondWith(async () => Response.json(requirement, { status: 201 }))
  const { screen, idea } = await renderPrompt({ showIntro: true })

  await expect.element(screen.getByText(/Anvil will ask questions/)).toBeVisible()
  await screen.getByRole('button', { name: 'A dashboard of late orders' }).click()

  await expect.element(idea).toHaveValue('A dashboard of late orders')
  await expect.element(idea).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expect.element(screen.getByText('Requirement abc-123')).toBeVisible()
  expect(fetch.mock.calls[0][1]?.body).toBe('{"idea":"A dashboard of late orders"}')
})
