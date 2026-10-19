import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { AppHeader } from '@/components/app-header'

// The home link needs a router around it.
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
