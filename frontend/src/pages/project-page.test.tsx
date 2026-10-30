import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Project } from '@/lib/projects'
import type { Requirement } from '@/lib/requirements'
import { ProjectPage } from '@/pages/project-page'

const parcels: Project = {
  id: 'p1',
  name: 'Parcel delivery platform',
  context: 'Booking, tracking and rebooking for home deliveries.',
  has_context: true,
  requirement_count: 2,
  is_owner: true,
}

function requirement(overrides: Partial<Requirement>): Requirement {
  return {
    id: 'r1',
    title: 'Rebook a missed delivery',
    idea: 'Let customers rebook',
    project: { id: 'p1', name: 'Parcel delivery platform' },
    status: 'in_progress',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    progress: null,
    ...overrides,
  }
}

type Patch = (body: { name: string; context: string }) => Response

/**
 * Stands in for the API: GET and PATCH /api/projects/p1, and its Requirements.
 */
function serve({
  project = parcels,
  requirements = [requirement({}), requirement({ id: 'r2', title: 'Bulk import depots', status: 'draft' })],
  patch,
  remove = () => new Response(null, { status: 204 }),
  everyRequirement = requirements,
}: {
  project?: Project | Response
  requirements?: Requirement[]
  patch?: Patch
  remove?: (url: URL) => Response
  /** Every Requirement in the Project, as its Project Owner sees them. */
  everyRequirement?: Requirement[]
} = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input), location.href)
    if (url.pathname === '/api/requirements') return Response.json({ items: requirements })
    if (init?.method === 'DELETE') return remove(url)
    if (url.pathname === '/api/projects/p1/requirements') return Response.json({ items: everyRequirement })
    if (init?.method === 'PATCH' && patch) return patch(JSON.parse(String(init.body)))
    return project instanceof Response ? project.clone() : Response.json(project)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function Elsewhere() {
  return <p>Now at {useParams().id ?? 'Projects'}</p>
}

async function renderProject(id = 'p1') {
  const router = createMemoryRouter(
    [
      { path: '/projects/:id', element: <ProjectPage /> },
      { path: '/projects', element: <Elsewhere /> },
      { path: '/requirements/:id', element: <Elsewhere /> },
    ],
    { initialEntries: [`/projects/${id}`] },
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const screen = await render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { screen, router, client }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('shows the name and Project Context for editing, with a link back to Projects', async () => {
  serve()
  const { screen } = await renderProject()

  await expect.element(screen.getByLabelText('Name')).toHaveValue('Parcel delivery platform')
  await expect
    .element(screen.getByLabelText('Project Context'))
    .toHaveValue('Booking, tracking and rebooking for home deliveries.')
  await expect
    .element(screen.getByText(/Anvil reads this whenever it refines one of this Project's Requirements/))
    .toBeVisible()
  await expect.element(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects')
  // Nothing to save yet
  await expect.element(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
})

test('Save saves the name and Project Context together', async () => {
  const fetch = serve({
    patch: ({ name, context }) =>
      Response.json({ ...parcels, name, context }),
  })
  const { screen } = await renderProject()

  await screen.getByLabelText('Name').fill('  Parcel platform ')
  await screen.getByLabelText('Project Context').fill('Deliveries run Monday to Saturday.')
  await expect.element(screen.getByText('Unsaved changes')).toBeVisible()
  await screen.getByRole('button', { name: 'Save' }).click()

  await expect.element(screen.getByText('Saved just now')).toBeVisible()
  await expect.element(screen.getByLabelText('Name')).toHaveValue('Parcel platform')
  await expect.element(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  const patch = fetch.mock.calls.find(([, init]) => init?.method === 'PATCH')
  expect(String(patch?.[0])).toBe('/api/projects/p1')
  expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
    name: 'Parcel platform',
    context: 'Deliveries run Monday to Saturday.',
  })
})

test('a taken name shows the API message next to the name', async () => {
  serve({
    patch: ({ name }) => Response.json({ detail: `A Project called "${name}" already exists` }, { status: 409 }),
  })
  const { screen } = await renderProject()

  await screen.getByLabelText('Name').fill('Customer support portal')
  await screen.getByRole('button', { name: 'Save' }).click()

  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent('A Project called "Customer support portal" already exists')
  await expect.element(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
  await expect.element(screen.getByLabelText('Project Context')).not.toHaveAttribute('aria-invalid')
})

test('a rejected Project Context shows the API message next to it', async () => {
  serve({
    patch: () =>
      Response.json(
        { detail: [{ loc: ['body', 'context'], msg: 'String should have at most 20000 characters' }] },
        { status: 422 },
      ),
  })
  const { screen } = await renderProject()

  await screen.getByLabelText('Project Context').fill('Too long')
  await screen.getByRole('button', { name: 'Save' }).click()

  await expect.element(screen.getByRole('alert')).toHaveTextContent('String should have at most 20000 characters')
  await expect.element(screen.getByLabelText('Project Context')).toHaveAttribute('aria-invalid', 'true')
})

test("Save is disabled while the name is blank", async () => {
  serve()
  const { screen } = await renderProject()

  await screen.getByLabelText('Name').fill('   ')
  await expect.element(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
})

test('leaving with unsaved changes asks first', async () => {
  serve()
  const { screen, router } = await renderProject()

  await screen.getByLabelText('Project Context').fill('Half written')
  await screen.getByRole('link', { name: 'Projects' }).click()
  const dialog = screen.getByRole('dialog', { name: 'Leave without saving?' })
  await expect.element(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Keep editing' }).click()
  await expect.element(dialog).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/projects/p1')
  await expect.element(screen.getByLabelText('Project Context')).toHaveValue('Half written')

  await screen.getByRole('link', { name: 'Projects' }).click()
  await screen.getByRole('button', { name: 'Leave' }).click()
  await expect.element(screen.getByText('Now at Projects')).toBeVisible()
})

test('leaving without changes does not ask', async () => {
  serve()
  const { screen } = await renderProject()

  await expect.element(screen.getByLabelText('Name')).toBeVisible()
  await screen.getByRole('link', { name: 'Projects' }).click()
  await expect.element(screen.getByText('Now at Projects')).toBeVisible()
})

test("lists this Project's Requirements, each linking to its Refinement", async () => {
  const fetch = serve()
  const { screen } = await renderProject()

  const side = screen.getByRole('region', { name: 'Requirements in this Project' })
  await expect.element(side.getByText('Changes apply to their next Questions.')).toBeVisible()
  await expect
    .element(side.getByRole('link', { name: 'Rebook a missed delivery' }))
    .toHaveAttribute('href', '/requirements/r1')
  await expect.element(side.getByRole('listitem').nth(0)).toMatchTextContent('In progress')
  await expect.element(side.getByRole('listitem').nth(1)).toMatchTextContent('Bulk import depotsDraft')
  const list = fetch.mock.calls.find(([input]) => String(input).startsWith('/api/requirements'))
  expect(String(list?.[0])).toBe('/api/requirements?project_id=p1')
})

test('lists five Requirements, then says how many more', async () => {
  serve({
    requirements: Array.from({ length: 7 }, (_, i) => requirement({ id: `r${i}`, title: `Requirement ${i}` })),
  })
  const { screen } = await renderProject()

  await expect.element(screen.getByText('and 2 more')).toBeVisible()
  expect(screen.getByRole('region').getByRole('listitem').elements()).toHaveLength(5)
})

test("is read-only when you're not the Project Owner", async () => {
  serve({ project: { ...parcels, is_owner: false } })
  const { screen } = await renderProject()

  await expect
    .element(screen.getByRole('heading', { name: 'Parcel delivery platform', level: 1 }))
    .toBeVisible()
  await expect.element(screen.getByText('Booking, tracking and rebooking for home deliveries.')).toBeVisible()
  await expect.element(screen.getByText('Only the Project Owner can change this Project.')).toBeVisible()
  expect(screen.getByRole('textbox').elements()).toHaveLength(0)
  await expect.element(screen.getByRole('button', { name: 'Save' })).not.toBeInTheDocument()
})

test("shows a 404 for a Project that doesn't exist", async () => {
  serve({ project: Response.json({ detail: 'Project not found' }, { status: 404 }) })
  const { screen } = await renderProject('nope')

  await expect.element(screen.getByText('404 · Project not found')).toBeVisible()
})

test("shows an error with a retry when the Project won't load", async () => {
  serve({ project: new Response(null, { status: 500 }) })
  const { screen } = await renderProject()

  await expect.element(screen.getByRole('alert')).toHaveTextContent("Couldn't load this project.")
  serve()
  await screen.getByRole('button', { name: 'Retry' }).click()
  await expect.element(screen.getByLabelText('Name')).toHaveValue('Parcel delivery platform')
})

test('keeps unsaved changes when the Project fails to reload', async () => {
  serve()
  const { screen, client } = await renderProject()
  await screen.getByLabelText('Project Context').fill('A long, unsaved Project Context')

  serve({ project: Response.json({ detail: 'Not authenticated' }, { status: 401 }) })
  await client.refetchQueries({ queryKey: ['projects', 'p1'] })

  await expect.element(screen.getByRole('alert')).toHaveTextContent(
    "Couldn't refresh this project. Your changes are still here, but saving may fail until the issue is resolved.",
  )
  await expect.element(screen.getByLabelText('Project Context')).toHaveValue('A long, unsaved Project Context')
  await expect.element(screen.getByText("Couldn't load this project.")).not.toBeInTheDocument()
})

const deletes = (fetch: ReturnType<typeof serve>) =>
  fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([input]) => String(input))

async function openDelete(screen: Awaited<ReturnType<typeof renderProject>>['screen']) {
  const zone = screen.getByRole('region', { name: 'Danger zone' })
  await zone.getByRole('button', { name: 'Delete project…' }).click()
  return screen.getByRole('dialog', { name: 'Delete this project?' })
}

test('the delete dialog lists every Requirement that will go', async () => {
  serve({
    everyRequirement: Array.from({ length: 7 }, (_, i) =>
      requirement({ id: `r${i}`, title: `Requirement ${i}`, status: i === 0 ? 'draft' : 'complete' }),
    ),
  })
  const { screen } = await renderProject()

  const dialog = await openDelete(screen)

  await expect
    .element(dialog.getByRole('paragraph').first())
    .toMatchTextContent(
      "Parcel delivery platform will be deleted for good. Its 7 Requirements, and all their Questions and Answers, will be deleted with it. This can't be undone.",
    )
  const listed = dialog.getByRole('list', { name: 'Requirements to delete' }).getByRole('listitem')
  await expect.element(listed.nth(0)).toMatchTextContent('Requirement 0Draft')
  expect(listed.elements()).toHaveLength(7)
  await expect.element(listed.nth(6)).toMatchTextContent('Requirement 6Complete')
})

test('the delete dialog lists Requirements from other Points of Contact too', async () => {
  const fetch = serve({
    everyRequirement: [
      requirement({}),
      requirement({ id: 'r2', title: 'Bulk import depots', status: 'draft' }),
      requirement({ id: 'r3', title: 'Their own idea', status: 'complete' }),
    ],
  })
  const { screen } = await renderProject()
  // The side column shows only yours.
  const side = screen.getByRole('region', { name: 'Requirements in this Project' })
  await expect.element(side.getByRole('listitem').nth(1)).toBeVisible()
  expect(side.getByRole('listitem').elements()).toHaveLength(2)

  const dialog = await openDelete(screen)

  await expect.element(dialog).toMatchTextContent(/Its 3 Requirements, and all their Questions/)
  await expect.element(dialog.getByRole('listitem').nth(2)).toMatchTextContent('Their own ideaComplete')
  expect(fetch.mock.calls.map(([input]) => String(input))).toContain('/api/projects/p1/requirements')
})

test('reopening the delete dialog lists Requirements added since', async () => {
  let everyRequirement = [requirement({})]
  const fetch = serve()
  const base = fetch.getMockImplementation()!
  fetch.mockImplementation(async (input, init) =>
    String(input) === '/api/projects/p1/requirements'
      ? Response.json({ items: everyRequirement })
      : base(input, init),
  )
  const { screen } = await renderProject()

  let dialog = await openDelete(screen)
  await expect.element(dialog).toMatchTextContent(/Its 1 Requirement,/)
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  everyRequirement = [...everyRequirement, requirement({ id: 'r9', title: 'Added meanwhile' })]
  dialog = await openDelete(screen)
  await expect.element(dialog).toMatchTextContent(/Its 2 Requirements,/)
  await expect.element(dialog.getByText('Added meanwhile')).toBeVisible()
})

test('the delete stays disabled until DELETE is typed', async () => {
  const fetch = serve()
  const { screen } = await renderProject()

  const dialog = await openDelete(screen)
  const confirm = dialog.getByRole('button', { name: 'Delete project' })
  await expect.element(dialog.getByRole('listitem').nth(1)).toBeVisible()
  await expect.element(confirm).toBeDisabled()

  const typed = dialog.getByLabelText('Type DELETE to confirm')
  for (const wrong of ['delete', 'DELET', ' DELETE']) {
    await typed.fill(wrong)
    await expect.element(confirm).toBeDisabled()
  }
  await typed.fill('DELETE')
  await expect.element(confirm).toBeEnabled()

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect.element(dialog).not.toBeInTheDocument()
  expect(deletes(fetch)).toEqual([])

  // Opening it again starts from nothing typed.
  const again = await openDelete(screen)
  await expect.element(again.getByLabelText('Type DELETE to confirm')).toHaveValue('')
})

test('deleting goes to the Projects list, even with unsaved changes', async () => {
  const fetch = serve()
  const { screen, router } = await renderProject()
  await screen.getByLabelText('Project Context').fill('Half written')

  const dialog = await openDelete(screen)
  await dialog.getByLabelText('Type DELETE to confirm').fill('DELETE')
  await dialog.getByRole('button', { name: 'Delete project' }).click()

  await expect.element(screen.getByText('Now at Projects')).toBeVisible()
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/projects')
  expect(deletes(fetch)).toEqual(['/api/projects/p1?with_requirements=true&requirement_count=2'])
})

test('an empty Project deletes without taking Requirements', async () => {
  const fetch = serve({ requirements: [] })
  const { screen } = await renderProject()

  const dialog = await openDelete(screen)
  await expect.element(dialog).toMatchTextContent(/It has no Requirements\./)
  await dialog.getByLabelText('Type DELETE to confirm').fill('DELETE')
  await dialog.getByRole('button', { name: 'Delete project' }).click()

  await expect.element(screen.getByText('Now at Projects')).toBeVisible()
  expect(deletes(fetch)).toEqual(['/api/projects/p1?with_requirements=false&requirement_count=0'])
})

test('a Requirement added while the dialog is open is shown before anything is deleted', async () => {
  let everyRequirement = [requirement({})]
  const fetch = serve({
    remove: (url) =>
      url.searchParams.get('requirement_count') === String(everyRequirement.length)
        ? new Response(null, { status: 204 })
        : Response.json({ detail: 'changed' }, { status: 409 }),
  })
  const base = fetch.getMockImplementation()!
  fetch.mockImplementation(async (input, init) =>
    String(input) === '/api/projects/p1/requirements' ? Response.json({ items: everyRequirement }) : base(input, init),
  )
  const { screen, router } = await renderProject()

  const dialog = await openDelete(screen)
  await expect.element(dialog).toMatchTextContent(/Its 1 Requirement,/)
  everyRequirement = [...everyRequirement, requirement({ id: 'r9', title: 'Added meanwhile' })]
  await dialog.getByLabelText('Type DELETE to confirm').fill('DELETE')
  await dialog.getByRole('button', { name: 'Delete project' }).click()

  await expect.element(dialog.getByText('Added meanwhile')).toBeVisible()
  await expect.element(dialog).toMatchTextContent(/Its 2 Requirements,/)
  expect(router.state.location.pathname).toBe('/projects/p1')

  await dialog.getByRole('button', { name: 'Delete project' }).click()
  await expect.element(screen.getByText('Now at Projects')).toBeVisible()
  expect(deletes(fetch)).toEqual([
    '/api/projects/p1?with_requirements=true&requirement_count=1',
    '/api/projects/p1?with_requirements=true&requirement_count=2',
  ])
})

test('a failed delete says so and stays on the Project', async () => {
  serve({ remove: () => Response.json({ detail: 'down' }, { status: 503 }) })
  const { screen, router } = await renderProject()

  const dialog = await openDelete(screen)
  await dialog.getByLabelText('Type DELETE to confirm').fill('DELETE')
  await dialog.getByRole('button', { name: 'Delete project' }).click()

  await expect.element(dialog.getByRole('alert')).toHaveTextContent("Couldn't delete it. Try again.")
  expect(router.state.location.pathname).toBe('/projects/p1')
})

test("there's no danger zone when you're not the Project Owner", async () => {
  serve({ project: { ...parcels, is_owner: false } })
  const { screen } = await renderProject()

  await expect.element(screen.getByText('Only the Project Owner can change this Project.')).toBeVisible()
  await expect.element(screen.getByRole('region', { name: 'Danger zone' })).not.toBeInTheDocument()
})
