import { useId } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { relativeTime } from '@/lib/relative-time'
import { type Requirement, type RequirementStatus, statusLabels } from '@/lib/requirements'

// Each status's badge and dot colours (--status-* in theme.css).
// The bar takes the dot's colour.
const statusStyles: Record<RequirementStatus, { badge: string; dot: string; bar: string }> = {
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

// One Requirement on the home page. The title is the link, stretched over the
// whole card, so the card opens on a click anywhere while a screen reader
// hears just the title as the link's name.
export function RequirementCard({ requirement }: { requirement: Requirement }) {
  const progressId = useId()
  const style = statusStyles[requirement.status]
  const updated = new Date(requirement.updated_at)
  const { progress } = requirement
  const answered = progress?.answered ?? 0
  // Rounded down, so the bar is only full once every Question is answered, and
  // at least 1% once any is, so it never looks empty after an Answer.
  const percent =
    progress?.total && answered ? Math.max(1, Math.floor((answered / progress.total) * 100)) : 0

  return (
    <Card className="relative gap-3.5 rounded-card p-4.5 shadow-none transition-[color,box-shadow,border-color] hover:border-muted-foreground/40 has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className={`h-5.5 gap-1.5 px-2 rounded-badge text-caption ${style.badge}`}>
          <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
          {statusLabels[requirement.status]}
        </Badge>
        <time
          dateTime={requirement.updated_at}
          title={updated.toLocaleString()}
          className="text-caption font-normal text-muted-foreground"
        >
          {relativeTime(updated)}
        </time>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-card-title">
          <Link
            to={`/requirements/${requirement.id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-card"
          >
            {requirement.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-body-sm text-muted-foreground">{requirement.idea}</p>
      </div>
      <div className="mt-auto flex flex-col gap-1.5">
        {/* Fills in the status's colour. The indicator is hidden at 0%, where
            it would still show a sliver. */}
        <Progress
          value={percent}
          aria-labelledby={progressId}
          className={`h-1.5 bg-muted ${percent === 0 ? '*:data-[slot=progress-indicator]:hidden' : style.bar}`}
        />
        <span id={progressId} className="text-caption font-normal text-muted-foreground">
          {progress ? `${answered} of ${progress.total} questions answered` : 'Not started'}
        </span>
      </div>
    </Card>
  )
}
