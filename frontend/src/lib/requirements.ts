import { queryOptions } from '@tanstack/react-query'
import { api, retryUnlessClientError } from '@/lib/api'

export type RequirementStatus = 'draft' | 'in_progress' | 'complete'

export const requirementStatuses: readonly RequirementStatus[] = ['draft', 'in_progress', 'complete']

export const statusLabels: Record<RequirementStatus, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  complete: 'Complete',
}

// How many of a Requirement's Questions are answered, out of its open and
// answered ones.
export interface Progress {
  answered: number
  total: number
}

// A Requirement as the API returns it (RequirementPublic).
export interface Requirement {
  id: string
  title: string
  idea: string
  project: { id: string; name: string }
  status: RequirementStatus
  created_at: string
  updated_at: string
  // Null while it has no Questions.
  progress: Progress | null
}

// GET /api/requirements: all of the Point of Contact's Requirements, most
// recently updated first. The UI filters them.
export interface RequirementList {
  items: Requirement[]
}

// The list's query key, so a new Requirement can mark it stale.
export const requirementsKey = ['requirements'] as const

export function requirementsQuery() {
  return queryOptions({
    queryKey: requirementsKey,
    queryFn: () => api<RequirementList>('/requirements'),
  })
}

// GET /api/requirements?project_id=: the Point of Contact's Requirements in one
// Project. Under the list's key, so it goes stale with the list.
export function projectRequirementsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...requirementsKey, { projectId }] as const,
    queryFn: () =>
      api<RequirementList>(`/requirements?${new URLSearchParams({ project_id: projectId })}`),
  })
}

export const requirementKey = (id: string) => ['requirements', id] as const

// GET /api/requirements/:id. Its key sits under the list's, so marking the
// list stale marks this stale too.
export function requirementQuery(id: string) {
  return queryOptions({
    queryKey: requirementKey(id),
    queryFn: () => api<Requirement>(`/requirements/${id}`),
    retry: retryUnlessClientError,
  })
}

// How many of `requirements` have each status, and how many there are in all.
export function countByStatus(requirements: Requirement[]): Record<RequirementStatus | 'all', number> {
  const counts = { all: requirements.length, draft: 0, in_progress: 0, complete: 0 }
  for (const requirement of requirements) counts[requirement.status]++
  return counts
}

export function createRequirement(body: { projectId: string; idea: string }): Promise<Requirement> {
  return api<Requirement>('/requirements', {
    method: 'POST',
    json: { project_id: body.projectId, idea: body.idea },
  })
}

// The Project is locked from the first Answer, which moves it out of Draft.
export const isProjectLocked = (requirement: Requirement) => requirement.status !== 'draft'
