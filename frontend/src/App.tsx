import { QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router'
import { AppHeader } from '@/components/app-header'
import { queryClient } from '@/lib/query-client'
import { HomePage } from '@/pages/home-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { RequirementPage } from '@/pages/requirement-page'

// Every page sits under the header, in the content column.
function Layout() {
  return (
    <>
      {/* Placeholder until the stub current user lands (#19) */}
      <AppHeader initials="TM" />
      <main className="mx-auto box-content max-w-content px-gutter">
        <Outlet />
      </main>
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/requirements/:id', element: <RequirementPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

export default App
