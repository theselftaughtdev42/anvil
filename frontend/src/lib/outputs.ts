import { queryOptions } from '@tanstack/react-query'
import { api, retryUnlessClientError } from '@/lib/api'
import type { OutputFormat, OutputList, OutputPublic } from '@/lib/api-schema'

export type Output = OutputPublic

export const outputFormatLabels: Record<OutputFormat, string> = {
  gherkin: 'Gherkin',
}

export const outputsKey = (requirementId: string) => ['requirements', requirementId, 'outputs'] as const

/** GET /api/requirements/:id/outputs: at most one per Output format. */
export function outputsQuery(requirementId: string) {
  return queryOptions({
    queryKey: outputsKey(requirementId),
    queryFn: () => api<OutputList>(`/requirements/${requirementId}/outputs`),
    retry: retryUnlessClientError,
  })
}

/**
 * POST /api/requirements/:id/outputs/gherkin: generates the Gherkin Output,
 * replacing any there was. A 409 unless the Requirement is Complete, and a 503
 * when the agent is unavailable, which leaves any previous Output as it was.
 */
export function generateGherkin(requirementId: string): Promise<Output> {
  return api<Output>(`/requirements/${requirementId}/outputs/gherkin`, { method: 'POST' })
}

/** Shared by the Output tab and its trigger, which both show it generating. */
export const generateKey = (requirementId: string, format: OutputFormat) =>
  ['requirements', requirementId, 'outputs', format, 'generate'] as const

/** When an Output was generated, as "2 Nov, 14:32". */
export function generatedAt(output: Output): string {
  return new Date(output.generated_at).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
