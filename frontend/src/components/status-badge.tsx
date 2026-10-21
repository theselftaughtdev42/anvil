import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { type RequirementStatus, statusLabels } from '@/lib/requirements'
import { statusStyles } from '@/lib/status-styles'

/** `labelClassName` styles the label, e.g. to keep only the dot on a phone. */
export function StatusBadge({
  status,
  className,
  labelClassName,
}: {
  status: RequirementStatus
  className?: string
  labelClassName?: string
}) {
  const style = statusStyles[status]
  return (
    <Badge variant="outline" className={cn('h-5.5 gap-1.5 px-2 rounded-badge text-caption', style.badge, className)}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
      <span className={labelClassName}>{statusLabels[status]}</span>
    </Badge>
  )
}
