import { queryOptions } from '@tanstack/react-query'
import { api, retryUnlessClientError } from '@/lib/api'
import type {
  RequirementCreate,
  RequirementList,
  RequirementPublic,
  RequirementStatus,
  RequirementUpdate,
} from '@/lib/api-schema'

export const requirementStatuses: readonly RequirementStatus[] = ['draft', 'in_progress', 'complete']

export const statusLabels: Record<RequirementStatus, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  complete: 'Complete',
}

export type Requirement = RequirementPublic

export const requirementsKey = ['requirements'] as const

/**
 * GET /api/requirements: all of the Point of Contact's Requirements, most
 * recently updated first. The UI filters them.
 */
export function requirementsQuery() {
  return queryOptions({
    queryKey: requirementsKey,
    queryFn: () => api<RequirementList>('/requirements'),
  })
}

/**
 * GET /api/requirements?project_id=: the Point of Contact's Requirements in one
 * Project. Under the list's key, so it goes stale with the list.
 */
export function projectRequirementsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...requirementsKey, { projectId }] as const,
    queryFn: () =>
      api<RequirementList>(`/requirements?${new URLSearchParams({ project_id: projectId })}`),
  })
}

export const requirementKey = (id: string) => ['requirements', id] as const

/**
 * GET /api/requirements/:id. Its key sits under the list's, so marking the
 * list stale marks this stale too.
 */
export function requirementQuery(id: string) {
  return queryOptions({
    queryKey: requirementKey(id),
    queryFn: () => api<Requirement>(`/requirements/${id}`),
    retry: retryUnlessClientError,
  })
}

export function countByStatus(requirements: Requirement[]): Record<RequirementStatus | 'all', number> {
  const counts = { all: requirements.length, draft: 0, in_progress: 0, complete: 0 }
  for (const requirement of requirements) counts[requirement.status]++
  return counts
}

export function createRequirement(body: { projectId: string; idea: string }): Promise<Requirement> {
  return api<Requirement>('/requirements', {
    method: 'POST',
    json: { project_id: body.projectId, idea: body.idea } satisfies RequirementCreate,
  })
}

/** The Project is locked from the first Answer, which moves it out of Draft. */
export const isProjectLocked = (requirement: Requirement) => requirement.status !== 'draft'

/**
 * PATCH /api/requirements/:id: moves a Draft Requirement to another Project.
 * The server swaps its Open Questions for new ones asked with that Project's
 * Project Context. A 409 once it's locked.
 */
export function changeProject(id: string, projectId: string): Promise<Requirement> {
  return api<Requirement>(`/requirements/${id}`, {
    method: 'PATCH',
    json: { project_id: projectId } satisfies RequirementUpdate,
  })
}

/**
 * Shared by the header's Project menu and the page, which shows the stack
 * reloading while a change is saving.
 */
export const changeProjectKey = (id: string) => ['requirements', id, 'project'] as const
