import { useQuery } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { NewProjectDialog } from '@/components/new-project-dialog'
import { ProjectCard } from '@/components/project-card'
import { Button } from '@/components/ui/button'
import { projectsQuery } from '@/lib/projects'

// /projects: a card per Project, and New project to add one.
export function ProjectsPage() {
  const query = useQuery(projectsQuery())

  return (
    <div className="mt-12 mb-16 max-sm:mt-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-page-heading">Projects</h1>
          <p className="mt-1 text-body text-muted-foreground">
            Each Project gives Anvil the background it needs to ask better Questions.
          </p>
        </div>
        {/* Not while the list won't load; the empty state has its own */}
        {query.isSuccess && query.data.items.length > 0 && <NewProjectDialog />}
      </div>
      <div className="mt-7">
        {query.isPending ? (
          <div role="status" className="flex justify-center py-8 text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading Projects…</span>
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p role="alert" className="text-body-sm text-muted-foreground">
              Couldn't load the Projects.
            </p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        ) : query.data.items.length === 0 ? (
          <section className="mx-auto flex max-w-180 flex-col items-center gap-3 rounded-card border border-dashed border-muted-foreground/30 px-6 py-10 text-center text-body-sm text-muted-foreground">
            <p>No Projects yet. Create the first one, then tell Anvil what it's about.</p>
            <NewProjectDialog label="Create your first project" />
          </section>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.items.map((project) => (
              <li key={project.id} className="grid">
                <ProjectCard project={project} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
