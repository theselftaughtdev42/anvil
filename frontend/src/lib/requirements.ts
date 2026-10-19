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

export function createRequirement(idea: string): Promise<Requirement> {
  return api<Requirement>('/requirements', { method: 'POST', json: { idea } })
}
