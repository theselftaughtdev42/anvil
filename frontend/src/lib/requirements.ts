import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type RequirementStatus = 'draft' | 'in_progress' | 'complete'

export const requirementStatuses: readonly RequirementStatus[] = ['draft', 'in_progress', 'complete']

export const statusLabels: Record<RequirementStatus, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  complete: 'Complete',
}

// A Requirement as the API returns it (RequirementPublic).
export interface Requirement {
  id: string
  title: string
  idea: string
  status: RequirementStatus
  created_at: string
  updated_at: string
  // Null until Requirements have Questions.
  progress: null
}

// GET /api/requirements: the Point of Contact's Requirements, most recently
// updated first. `counts` covers all of them, whatever the filter.
export interface RequirementList {
  items: Requirement[]
  counts: Record<RequirementStatus | 'all', number>
}

// The query key every requirements query sits under, so invalidating it
// refreshes them all.
export const requirementsKey = ['requirements'] as const

// The list, filtered to one status, or every Requirement when `status` is
// undefined.
export function requirementsQuery(status?: RequirementStatus) {
  return queryOptions({
    queryKey: [...requirementsKey, status ?? 'all'],
    queryFn: () => api<RequirementList>(status ? `/requirements?status=${status}` : '/requirements'),
  })
}

export function createRequirement(idea: string): Promise<Requirement> {
  return api<Requirement>('/requirements', { method: 'POST', json: { idea } })
}
