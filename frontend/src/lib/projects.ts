import { queryOptions } from '@tanstack/react-query'
import { api, retryUnlessClientError } from '@/lib/api'
import type { ProjectCreate, ProjectList, ProjectPublic, ProjectUpdate } from '@/lib/api-schema'

export type Project = ProjectPublic

export const projectsKey = ['projects'] as const

/** GET /api/projects: every Project, by name. */
export function projectsQuery() {
  return queryOptions({
    queryKey: projectsKey,
    queryFn: () => api<ProjectList>('/projects'),
  })
}

/** Throws an ApiError with the API's message when the name is taken (409). */
export function createProject(name: string): Promise<Project> {
  return api<Project>('/projects', { method: 'POST', json: { name } satisfies ProjectCreate })
}

export const projectKey = (id: string) => ['projects', id] as const

/**
 * GET /api/projects/:id. Its key sits under the list's, so marking the list
 * stale marks this stale too.
 */
export function projectQuery(id: string) {
  return queryOptions({
    queryKey: projectKey(id),
    queryFn: () => api<Project>(`/projects/${id}`),
    retry: retryUnlessClientError,
  })
}

/**
 * Only the Project Owner may. Throws an ApiError with the API's message, e.g.
 * when the new name is taken (409).
 */
export function updateProject(id: string, changes: { name: string; context: string }): Promise<Project> {
  return api<Project>(`/projects/${id}`, { method: 'PATCH', json: changes satisfies ProjectUpdate })
}
