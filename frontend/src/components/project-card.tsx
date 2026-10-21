import { Link } from 'react-router'
import { Card } from '@/components/ui/card'
import type { Project } from '@/lib/projects'
import { cn } from '@/lib/utils'

/**
 * One Project on the Projects page. Like a Requirement's card, the name is the
 * link, stretched over the whole card. Without a Project Context the card is
 * dashed and says what that costs.
 */
export function ProjectCard({ project }: { project: Project }) {
  const count = project.requirement_count
  return (
    <Card
      className={cn(
        'relative gap-3.5 rounded-card p-5 shadow-none transition-[color,box-shadow,border-color] hover:border-muted-foreground/40 has-[a:focus-visible]:border-ring has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50',
        !project.has_context && 'border-dashed border-muted-foreground/30 bg-transparent',
      )}
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-card-title">
          <Link
            to={`/projects/${project.id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-card"
          >
            {project.name}
          </Link>
        </h2>
        <p className="line-clamp-3 text-body-sm whitespace-pre-line text-muted-foreground">
          {project.has_context
            ? project.context.trim()
            : 'No Project Context yet. Without it, Anvil asks more general Questions.'}
        </p>
      </div>
      <p className="mt-auto border-t pt-3.5 text-caption font-normal text-muted-foreground">
        {count} {count === 1 ? 'Requirement' : 'Requirements'}
      </p>
    </Card>
  )
}
