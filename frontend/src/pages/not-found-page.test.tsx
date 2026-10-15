import { createMemoryRouter, RouterProvider } from 'react-router'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { NotFoundPage } from '@/pages/not-found-page'

// The not-found page at `/missing`, with `history` before it.
function renderAfter(history: string[]) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>Home</p> },
      { path: '/previous', element: <p>Previous</p> },
      { path: '*', element: <NotFoundPage /> },
    ],
    { initialEntries: [...history, '/missing'], initialIndex: history.length },
  )
  return render(<RouterProvider router={router} />)
}

test('going back returns to the previous page', async () => {
  const screen = await renderAfter(['/previous'])
  await screen.getByRole('button', { name: 'Go back' }).click()
  await expect.element(screen.getByText('Previous')).toBeVisible()
})

// Going back from the first page of a visit would leave Anvil.
test('going back from the first page goes home', async () => {
  const screen = await renderAfter([])
  await screen.getByRole('button', { name: 'Go back' }).click()
  await expect.element(screen.getByText('Home')).toBeVisible()
})
