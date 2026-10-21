import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { AppHeader } from '@/components/app-header'

/** The home link needs a router around it. */
const renderHeader = () =>
  render(
    <MemoryRouter>
      <AppHeader initials="AB" />
    </MemoryRouter>,
  )

test('the account button shows the initials it is given', async () => {
  const screen = await renderHeader()
  await expect.element(screen.getByRole('button', { name: 'Account' })).toHaveTextContent('AB')
})

// The mark is decorative, so the wordmark alone names the link.
test('the home link is named by the wordmark', async () => {
  const screen = await renderHeader()
  await expect
    .element(screen.getByRole('link', { name: 'ANVIL', exact: true }))
    .toHaveAttribute('href', '/')
})

test('a page can put its own content after the logo, and the wordmark still names the home link', async () => {
  const screen = await render(
    <MemoryRouter>
      <AppHeader initials="AB">
        <h1>Route change alerts</h1>
      </AppHeader>
    </MemoryRouter>,
  )
  await expect.element(screen.getByRole('banner').getByRole('heading', { name: 'Route change alerts' })).toBeVisible()
  await expect.element(screen.getByRole('link', { name: 'ANVIL', exact: true })).toBeInTheDocument()
})

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppHeader initials="AB" />
    </MemoryRouter>,
  )

const sectionLink = (screen: Awaited<ReturnType<typeof renderAt>>, name: string) =>
  screen.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name })

test('the header links to Requirements and Projects', async () => {
  const screen = await renderAt('/')
  await expect.element(sectionLink(screen, 'Requirements')).toHaveAttribute('href', '/')
  await expect.element(sectionLink(screen, 'Projects')).toHaveAttribute('href', '/projects')
})

for (const [path, current, other] of [
  ['/', 'Requirements', 'Projects'],
  ['/requirements/r1', 'Requirements', 'Projects'],
  ['/projects', 'Projects', 'Requirements'],
  ['/projects/p1', 'Projects', 'Requirements'],
]) {
  test(`at ${path} the ${current} link is current`, async () => {
    const screen = await renderAt(path)
    await expect.element(sectionLink(screen, current)).toHaveAttribute('aria-current', 'page')
    await expect.element(sectionLink(screen, other)).not.toHaveAttribute('aria-current')
  })
}

test('on a page outside both sections, neither link is current', async () => {
  const screen = await renderAt('/no-such-page')
  await expect.element(sectionLink(screen, 'Requirements')).not.toHaveAttribute('aria-current')
  await expect.element(sectionLink(screen, 'Projects')).not.toHaveAttribute('aria-current')
})
