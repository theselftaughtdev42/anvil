import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { IdeaPrompt } from '@/components/idea-prompt'
import type { Project } from '@/lib/projects'
import { requirementsKey } from '@/lib/requirements'

const requirement = {
  id: 'abc-123',
  title: 'Route change alerts',
  idea: 'Route change alerts',
  project: { id: 'p1', name: 'Parcel delivery platform' },
  status: 'draft',
  created_at: '2026-10-15T12:00:00Z',
  updated_at: '2026-10-15T12:00:00Z',
  progress: null,
}

function RequirementStub() {
  return <p>Requirement {useParams().id}</p>
}

const placeholder = 'Riders can tip their driver'

function project(overrides: Partial<Project>): Project {
  return {
    id: 'p1',
    name: 'Parcel delivery platform',
    context: 'Booking and tracking home deliveries.',
    has_context: true,
    requirement_count: 6,
    is_owner: true,
    ...overrides,
  }
}

const everyProject = [
  project({}),
  project({ id: 'p2', name: 'Driver app', requirement_count: 1 }),
  project({ id: 'p3', name: 'Customer support portal', context: '', has_context: false, requirement_count: 0 }),
]

/**
 * Stands in for the server: /api/config and /api/projects answer straight
 * away, and every other fetch waits for `response`, so tests can look at the
 * form while it's submitting. Returns the mock of those other fetches.
 */
function respondWith(
  response: () => Promise<Response>,
  projects: () => Promise<Response> = async () => Response.json({ items: everyProject }),
) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(response)
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof globalThis.fetch>(async (input, init) =>
      input === '/api/config'
        ? Response.json({ idea_placeholder: placeholder })
        : input === '/api/projects'
          ? projects()
          : fetch(input, init),
    ),
  )
  return fetch
}

function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((r) => (resolve = r))
  return { response: () => promise, resolve }
}

async function renderPrompt(props: { showIntro?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([
    { path: '/', element: <IdeaPrompt {...props} /> },
    { path: '/requirements/:id', element: <RequirementStub /> },
    { path: '/projects', element: <p>Projects page</p> },
  ])
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  // The prompt can't submit until it knows the Projects.
  await vi.waitFor(() => expect(queryClient.getQueryState(['projects'])?.status).not.toBe('pending'))
  const picker = screen.getByRole('combobox', { name: 'Project' })
  // Opens the picker and picks the Project whose name starts with `name`.
  const pick = async (name = 'Parcel delivery platform') => {
    await picker.click()
    await screen.getByRole('option', { name: new RegExp(`^${name}`) }).click()
    await expect.element(picker).toHaveTextContent(`Project${name}`)
  }
  return { screen, queryClient, idea: screen.getByRole('textbox', { name: 'Your idea' }), picker, pick }
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
  const { screen, idea, pick } = await renderPrompt()
  await pick()

  await idea.fill('Route change alerts')
  await userEvent.keyboard('{Enter}')

  await expect.element(screen.getByText('Requirement abc-123')).toBeVisible()
  const [path, init] = fetch.mock.calls[0]
  expect(path).toBe('/api/requirements')
  expect(init?.method).toBe('POST')
  expect(init?.body).toBe('{"project_id":"p1","idea":"Route change alerts"}')
})

test('the button submits too', async () => {
  respondWith(async () => Response.json(requirement, { status: 201 }))
  const { screen, idea, pick } = await renderPrompt()
  await pick()

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
  const { screen, idea, pick } = await renderPrompt()
  await pick()

  await idea.fill('Route change alerts')
  await userEvent.keyboard('{Enter}')

  await expect.element(screen.getByRole('button', { name: 'Starting' })).toBeDisabled()
  await expect.element(idea).toHaveAttribute('readonly')
  await expect.element(screen.getByRole('combobox', { name: 'Project' })).toBeDisabled()
  await userEvent.keyboard('{Enter}')
  expect(fetch).toHaveBeenCalledTimes(1)

  resolve(Response.json(requirement, { status: 201 }))
  await expect.element(screen.getByText('Requirement abc-123')).toBeVisible()
})

test('a new requirement marks the requirements and Projects lists stale', async () => {
  respondWith(async () => Response.json(requirement, { status: 201 }))
  const { screen, queryClient, idea, pick } = await renderPrompt()
  queryClient.setQueryData(requirementsKey, { items: [] })
  // The Projects are on screen, so refetch straight away; watch the call.
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  await pick()

  await idea.fill('Route change alerts')
  await userEvent.keyboard('{Enter}')

  await expect.element(screen.getByText('Requirement abc-123')).toBeVisible()
  expect(queryClient.getQueryState(requirementsKey)?.isInvalidated).toBe(true)
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects'] })
})

test('the picker lists each Project, saying which have no Project Context', async () => {
  respondWith(async () => Response.json(requirement, { status: 201 }))
  const { screen, picker } = await renderPrompt()

  await picker.click()

  const options = screen.getByRole('option')
  await expect.element(options.nth(2)).toBeVisible()
  expect(options.nth(0).element().textContent).toBe('Parcel delivery platform')
  expect(options.nth(1).element().textContent).toBe('Driver app')
  await expect
    .element(options.nth(2))
    .toHaveTextContent('Customer support portalNo Project Context yet, so Anvil asks more general Questions')
  await expect
    .element(screen.getByText('You can change the Project until the first Question is answered.'))
    .toBeVisible()
  // Closed, or it would leave the rest of the page hidden from the next test.
  await userEvent.keyboard('{Escape}')
  await expect.element(screen.getByRole('listbox')).not.toBeInTheDocument()
})

test('no Project is picked to begin with, and submitting asks for one', async () => {
  const fetch = respondWith(async () => Response.json(requirement, { status: 201 }))
  const { screen, idea, picker, pick } = await renderPrompt()

  await expect.element(picker).toHaveTextContent('ProjectPick one')
  await idea.fill('Route change alerts')
  await userEvent.keyboard('{Enter}')
  await screen.getByRole('button', { name: 'Start refining' }).click()

  expect(fetch).not.toHaveBeenCalled()
  await expect.element(screen.getByRole('alert')).toHaveTextContent('Pick a Project to start refining.')
  await expect.element(picker).toHaveAttribute('aria-invalid', 'true')
  await expect.element(picker).toHaveAccessibleDescription('Pick a Project to start refining.')
  await expect.element(idea).toHaveValue('Route change alerts')

  await pick()
  await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
  await expect.element(picker).not.toHaveAttribute('aria-invalid')
})

test('picking a Project goes straight back to the idea, ready to type', async () => {
  respondWith(async () => Response.json(requirement, { status: 201 }))
  const { idea, pick } = await renderPrompt()

  await idea.fill('Route change')
  await pick()

  await expect.element(idea).toHaveFocus()
  await userEvent.keyboard(' alerts')
  await expect.element(idea).toHaveValue('Route change alerts')
})

test('closing the menu with Escape stays on the picker', async () => {
  respondWith(async () => Response.json(requirement, { status: 201 }))
  const { screen, picker } = await renderPrompt()

  await picker.click()
  await expect.element(screen.getByRole('listbox')).toBeVisible()
  await userEvent.keyboard('{Escape}')

  await expect.element(screen.getByRole('listbox')).not.toBeInTheDocument()
  await expect.element(picker).toHaveFocus()
})

test('the idea is sent with the picked Project', async () => {
  const fetch = respondWith(async () =>
    Response.json({ ...requirement, project: { id: 'p2', name: 'Driver app' } }, { status: 201 }),
  )
  const { screen, idea, pick } = await renderPrompt()

  await pick('Driver app')
  await idea.fill('Route change alerts')
  await userEvent.keyboard('{Enter}')

  await expect.element(screen.getByText('Requirement abc-123')).toBeVisible()
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({ project_id: 'p2' })
})

test("with no Projects, the prompt links to creating one and won't submit", async () => {
  const fetch = respondWith(
    async () => Response.json(requirement, { status: 201 }),
    async () => Response.json({ items: [] }),
  )
  const { screen, idea, picker } = await renderPrompt()

  await expect.element(screen.getByText(/Each Requirement belongs to a Project/)).toBeVisible()
  await expect.element(picker).not.toBeInTheDocument()
  await expect.element(screen.getByRole('button', { name: 'Start refining' })).toBeDisabled()
  await idea.fill('Route change alerts')
  await userEvent.keyboard('{Enter}')
  expect(fetch).not.toHaveBeenCalled()

  await screen.getByRole('link', { name: 'Create a Project' }).click()
  await expect.element(screen.getByText('Projects page')).toBeVisible()
})

test("if the Projects won't load, Retry tries again", async () => {
  let fail = true
  respondWith(
    async () => Response.json(requirement, { status: 201 }),
    async () => (fail ? Response.json({ detail: 'down' }, { status: 503 }) : Response.json({ items: everyProject })),
  )
  const { screen, picker } = await renderPrompt()

  await expect.element(screen.getByText(/Couldn't load the Projects/)).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Start refining' })).toBeDisabled()
  fail = false
  await screen.getByRole('button', { name: 'Retry' }).click()
  await expect.element(picker).toHaveTextContent('ProjectPick one')
})

test('a failure keeps the idea, shows the error and lets you try again', async () => {
  const fetch = respondWith(async () =>
    Response.json({ detail: 'database unreachable' }, { status: 503 }),
  )
  const { screen, idea, pick } = await renderPrompt()
  await pick()

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

test('the intro only shows when asked for', async () => {
  respondWith(async () => Response.json(requirement, { status: 201 }))
  const { screen } = await renderPrompt()

  await expect.element(screen.getByRole('textbox', { name: 'Your idea' })).toBeVisible()
  await expect.element(screen.getByText(/Anvil will ask questions/)).not.toBeInTheDocument()
})
