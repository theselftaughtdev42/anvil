import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { StatusBadge } from '@/components/status-badge'
import { projectRequirementsQuery } from '@/lib/requirements'

/** How many Requirements to list before "and N more". */
const REQUIREMENTS_SHOWN = 5

/**
 * The Project page's side column: the Project's Requirements, each linking to
 * its Refinement.
 */
export function ProjectRequirements({ projectId }: { projectId: string }) {
  const query = useQuery(projectRequirementsQuery(projectId))
  const items = query.data?.items ?? []
  const more = items.length - REQUIREMENTS_SHOWN

  return (
    <section aria-labelledby={`${projectId}-requirements`} className="lg:pt-4">
      <h2 id={`${projectId}-requirements`} className="text-body-sm font-semibold">
        Requirements in this Project
      </h2>
      <p className="mt-1 text-caption font-normal text-muted-foreground">Changes apply to their next Questions.</p>
      <div className="mt-3 border-t">
        {query.isPending ? (
          <p className="py-3 text-caption font-normal text-muted-foreground">Loading…</p>
        ) : query.isError ? (
          <p role="alert" className="py-3 text-caption font-normal text-muted-foreground">
            Couldn't load its Requirements.
          </p>
        ) : items.length === 0 ? (
          <p className="py-3 text-caption font-normal text-muted-foreground">No Requirements yet.</p>
        ) : (
          <>
            <ul>
              {items.slice(0, REQUIREMENTS_SHOWN).map((requirement) => (
                <li key={requirement.id} className="flex items-center justify-between gap-3 border-b py-2.5">
                  <Link
                    to={`/requirements/${requirement.id}`}
                    className="min-w-0 truncate rounded-sm text-body-sm outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {requirement.title}
                  </Link>
                  <StatusBadge status={requirement.status} className="shrink-0" />
                </li>
              ))}
            </ul>
            {more > 0 && (
              <p className="pt-3 text-caption font-normal text-muted-foreground">and {more} more</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
