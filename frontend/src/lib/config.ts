import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Config } from '@/lib/api-schema'

/**
 * GET /api/config: deployment settings the UI needs. Fixed for the life of the
 * server, so fetched once per visit.
 */
export const configQuery = queryOptions({
  queryKey: ['config'],
  queryFn: () => api<Config>('/config'),
  staleTime: Infinity,
})
