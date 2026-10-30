import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router'
import { ProjectDangerZone } from '@/components/project-danger-zone'
import { ProjectForm } from '@/components/project-form'
import { ProjectRequirements } from '@/components/project-requirements'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { projectQuery } from '@/lib/projects'
import { NotFoundPage } from '@/pages/not-found-page'

/** A malformed id is a 422, which means the same as a 404 here. */
const isNotFound = (error: Error | null) =>
  error instanceof ApiError && (error.status === 404 || error.status === 422)

/**
 * /projects/:id: the Project's name and Project Context, and its Requirements.
 */
export function ProjectPage() {
  const { id = '' } = useParams()
  const project = useQuery(projectQuery(id))
  const navigate = useNavigate()
  const [deleted, setDeleted] = useState(false)

  const leave = () => {
    // Unmount the form first, so its leave guard doesn't ask about unsaved changes.
    flushSync(() => setDeleted(true))
    void navigate('/projects', { replace: true })
  }

  if (deleted) return null

  // Once the Project has loaded, a failed reload keeps it on screen, so it
  // never throws away unsaved changes.
  if (!project.data && isNotFound(project.error)) {
    return (
      <NotFoundPage
        label="Project not found"
        message="There's no project at this address. The link may be mistyped."
      />
    )
  }

  return (
    <div className="mt-8 mb-16">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 rounded-md text-body-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Projects
      </Link>
      {project.data ? (
        <>
          {project.isError && (
            <p role="alert" className="mt-4 text-body-sm text-muted-foreground">
              Couldn't refresh this project. Your changes are still here, but saving may fail until the issue is resolved.
            </p>
          )}
          <div className="mt-8 grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:gap-8">
            {/* Remounts with a different Project, so the draft starts from it */}
            <div>
              <ProjectForm key={project.data.id} project={project.data} />
              {project.data.is_owner && <ProjectDangerZone project={project.data} onDeleted={leave} />}
            </div>
            <ProjectRequirements projectId={project.data.id} />
          </div>
        </>
      ) : project.isPending ? (
        <div role="status" className="flex justify-center py-24 text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading the project…</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p role="alert" className="text-body-sm text-muted-foreground">
            Couldn't load this project.
          </p>
          <Button variant="outline" onClick={() => void project.refetch()}>
            Retry
          </Button>
        </div>
      )}
    </div>
  )
}
