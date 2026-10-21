import { Outlet, type RouteObject } from 'react-router'
import { AppShell, type RouteHandle } from '@/components/app-shell'
import { HomePage } from '@/pages/home-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { ProjectsPage } from '@/pages/projects-page'
import { RequirementCrumb, RequirementPage } from '@/pages/requirement-page'

export const routes: RouteObject[] = [
  {
    element: (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/projects', element: <ProjectsPage /> },
      {
        path: '/requirements/:id',
        element: <RequirementPage />,
        handle: { crumb: ({ id = '' }) => <RequirementCrumb id={id} /> } satisfies RouteHandle,
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
