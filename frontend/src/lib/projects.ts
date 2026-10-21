import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

// A Project as the API returns it (ProjectPublic).
export interface Project {
  id: string
  name: string
  context: string
  // False while the Project Context is blank.
  has_context: boolean
  requirement_count: number
  // Whether the current user is the Project Owner, so may edit it.
  is_owner: boolean
}

// GET /api/projects: every Project, by name.
export interface ProjectList {
  items: Project[]
}

export const projectsKey = ['projects'] as const

export function projectsQuery() {
  return queryOptions({
    queryKey: projectsKey,
    queryFn: () => api<ProjectList>('/projects'),
  })
}

// Throws an ApiError with the API's message when the name is taken (409).
export function createProject(name: string): Promise<Project> {
  return api<Project>('/projects', { method: 'POST', json: { name } })
}
