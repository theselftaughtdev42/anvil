import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { AppHeader } from '@/components/app-header'

test('the account button shows the initials it is given', async () => {
  const screen = await render(<AppHeader initials="AB" />)
  await expect.element(screen.getByRole('button', { name: 'Account' })).toHaveTextContent('AB')
})

// The mark is decorative, so the wordmark alone names the link.
test('the home link is named by the wordmark', async () => {
  const screen = await render(<AppHeader initials="AB" />)
  await expect
    .element(screen.getByRole('link', { name: 'ANVIL', exact: true }))
    .toHaveAttribute('href', '/')
})
