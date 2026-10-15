import { api } from '@/lib/api'

export type RequirementStatus = 'draft' | 'in_progress' | 'complete'

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

// The query key every requirements query sits under, so invalidating it
// refreshes them all.
export const requirementsKey = ['requirements'] as const

export function createRequirement(idea: string): Promise<Requirement> {
  return api<Requirement>('/requirements', { method: 'POST', json: { idea } })
}
