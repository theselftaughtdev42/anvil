import type { RequirementStatus } from '@/lib/api-schema'

/**
 * Each status's badge and dot colours (--status-* in theme.css).
 * A progress bar takes the dot's colour.
 */
export const statusStyles: Record<RequirementStatus, { badge: string; dot: string; bar: string }> = {
  draft: {
    badge: 'border-status-draft-border bg-status-draft-background text-status-draft-foreground',
    dot: 'bg-status-draft',
    bar: '*:data-[slot=progress-indicator]:bg-status-draft',
  },
  in_progress: {
    badge:
      'border-status-in-progress-border bg-status-in-progress-background text-status-in-progress-foreground',
    dot: 'bg-status-in-progress',
    bar: '*:data-[slot=progress-indicator]:bg-status-in-progress',
  },
  complete: {
    badge:
      'border-status-complete-border bg-status-complete-background text-status-complete-foreground',
    dot: 'bg-status-complete',
    bar: '*:data-[slot=progress-indicator]:bg-status-complete',
  },
}
