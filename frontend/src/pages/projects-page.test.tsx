import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Project } from '@/lib/projects'
import { ProjectsPage } from '@/pages/projects-page'

function project(overrides: Partial<Project>): Project {
  return {
    id: 'p1',
    name: 'Parcel delivery platform',
    context: 'Booking, tracking and rebooking for home deliveries.',
    has_context: true,
    requirement_count: 6,
    is_owner: true,
    ...overrides,
  }
}

const parcels = project({})
const support = project({
  id: 'p2',
  name: 'Customer support portal',
  context: '  ',
  has_context: false,
  requirement_count: 1,
})

// Stands in for the Projects API. `post` answers POST /api/projects.
function serve(
  projects: Project[] | (() => Promise<Response>),
  post?: (body: { name: string }) => Response,
) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
    if (init?.method === 'POST' && post) return post(JSON.parse(String(init.body)))
    return typeof projects === 'function' ? projects() : Response.json({ items: projects })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function Opened() {
  return <p>Opened {useParams().id}</p>
}

async function renderProjects() {
  const router = createMemoryRouter(
    [
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/projects/:id', element: <Opened /> },
    ],
    { initialEntries: ['/projects'] },
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

test('shows a card per Project, dashed without a Project Context', async () => {
  serve([parcels, support])
  const { screen } = await renderProjects()

  await expect.element(screen.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible()
  await expect
    .element(screen.getByText('Each Project gives Anvil the background it needs to ask better Questions.'))
    .toBeVisible()
  const cards = screen.getByRole('listitem')
  await expect.element(cards.nth(1)).toBeVisible()
  expect(cards.elements()).toHaveLength(2)

  await expect.element(cards.nth(0)).toMatchTextContent('Booking, tracking and rebooking')
  await expect.element(cards.nth(0)).toMatchTextContent('6 Requirements')
  await expect
    .element(cards.nth(0).getByRole('link', { name: 'Parcel delivery platform' }))
    .toHaveAttribute('href', '/projects/p1')
  expect(cards.nth(0).element().querySelector('.border-dashed')).toBeNull()

  await expect
    .element(cards.nth(1))
    .toMatchTextContent('No Project Context yet. Without it, Anvil asks more general Questions.')
  await expect.element(cards.nth(1)).toMatchTextContent('1 Requirement')
  expect(cards.nth(1).element().querySelector('.border-dashed')).not.toBeNull()
})

test('with no Projects, invites you to create the first', async () => {
  serve([])
  const { screen } = await renderProjects()

  await expect.element(screen.getByText(/No Projects yet/)).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'Create your first project' })).toBeVisible()
  await expect.element(screen.getByRole('button', { name: 'New project' })).not.toBeInTheDocument()
})

test("shows an error with a retry when the list won't load", async () => {
  let fail = true
  serve(async () =>
    fail ? new Response(null, { status: 500 }) : Response.json({ items: [parcels] }),
  )
  const { screen } = await renderProjects()

  await expect.element(screen.getByRole('alert')).toHaveTextContent("Couldn't load the Projects.")
  fail = false
  await screen.getByRole('button', { name: 'Retry' }).click()
  await expect.element(screen.getByRole('link', { name: 'Parcel delivery platform' })).toBeVisible()
})

test('New project creates the Project and opens it', async () => {
  const fetch = serve([parcels], ({ name }) =>
    Response.json(project({ id: 'p9', name, context: '', has_context: false }), { status: 201 }),
  )
  const { screen, router } = await renderProjects()

  await screen.getByRole('button', { name: 'New project' }).click()
  const dialog = screen.getByRole('dialog', { name: 'New project' })
  await dialog.getByLabelText('Name').fill('  Driver app ')
  await dialog.getByRole('button', { name: 'Create project' }).click()

  await expect.element(screen.getByText('Opened p9')).toBeVisible()
  expect(router.state.location.pathname).toBe('/projects/p9')
  const post = fetch.mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: 'Driver app' })
})

test("a taken name shows the API's message in the dialog", async () => {
  serve([parcels], ({ name }) =>
    Response.json({ detail: `A Project called "${name}" already exists` }, { status: 409 }),
  )
  const { screen, router } = await renderProjects()

  await screen.getByRole('button', { name: 'New project' }).click()
  const dialog = screen.getByRole('dialog', { name: 'New project' })
  await dialog.getByLabelText('Name').fill('Parcel delivery platform')
  await dialog.getByRole('button', { name: 'Create project' }).click()

  await expect
    .element(dialog.getByRole('alert'))
    .toHaveTextContent('A Project called "Parcel delivery platform" already exists')
  await expect.element(dialog.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
  expect(router.state.location.pathname).toBe('/projects')
})

test("Create project is disabled until there's a name", async () => {
  serve([parcels])
  const { screen } = await renderProjects()

  await screen.getByRole('button', { name: 'New project' }).click()
  const dialog = screen.getByRole('dialog', { name: 'New project' })
  await expect.element(dialog.getByRole('button', { name: 'Create project' })).toBeDisabled()
  await dialog.getByLabelText('Name').fill('   ')
  await expect.element(dialog.getByRole('button', { name: 'Create project' })).toBeDisabled()
})
