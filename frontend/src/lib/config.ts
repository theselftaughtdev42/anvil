import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

/** Deployment settings the UI needs (GET /api/config). */
export interface Config {
  idea_placeholder: string
}

/** Fixed for the life of the server, so fetched once per visit. */
export const configQuery = queryOptions({
  queryKey: ['config'],
  queryFn: () => api<Config>('/config'),
  staleTime: Infinity,
})
