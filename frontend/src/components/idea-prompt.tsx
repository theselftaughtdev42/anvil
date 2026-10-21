import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ProjectPicker } from '@/components/project-picker'
import { Button } from '@/components/ui/button'
import { configQuery } from '@/lib/config'
import { projectsKey, projectsQuery } from '@/lib/projects'
import { createRequirement, requirementsKey } from '@/lib/requirements'

// The Retry and "Create a Project" actions read as links within the caption.
const inlineLinkClass =
  'rounded-sm text-foreground underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

// "What's your idea?": starts a Requirement in the picked Project from the
// idea typed here, then opens it. No Project is picked to begin with, so the
// choice is always deliberate. `showIntro`, for someone with no
// Requirements yet, adds a line explaining Refinement.
export function IdeaPrompt({ showIntro = false }: { showIntro?: boolean }) {
  const [idea, setIdea] = useState('')
  const [pickedId, setPickedId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [needsProject, setNeedsProject] = useState(false)
  const ideaRef = useRef<HTMLTextAreaElement>(null)
  const ideaId = useId()
  const errorId = useId()
  const projectErrorId = useId()
  // No placeholder until it loads, or if it can't.
  const { data: config } = useQuery(configQuery)
  const projects = useQuery(projectsQuery())

  const items = projects.data?.items ?? []
  // Undefined until one is picked, or if the picked one has gone.
  const picked = items.find((p) => p.id === pickedId)
  const projectId = picked?.id

  const { mutate, isPending, error } = useMutation({
    mutationFn: createRequirement,
    onSuccess: (requirement) => {
      // Not awaited: the lists refetch when they're next shown. The Project's
      // Requirement count has changed too.
      void queryClient.invalidateQueries({ queryKey: requirementsKey })
      void queryClient.invalidateQueries({ queryKey: projectsKey })
      void navigate(`/requirements/${requirement.id}`)
    },
  })

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (isPending || !idea.trim()) return
    if (!projectId) {
      setNeedsProject(true)
      return
    }
    mutate({ projectId, idea })
  }

  const pickProject = (id: string) => {
    setPickedId(id)
    setNeedsProject(false)
  }

  // Enter submits and Shift + Enter adds a new line. Enter while an IME is
  // composing confirms the composition, so leave it alone.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  return (
    <section className="mx-auto mt-16 max-w-180 text-center">
      <h1 className="text-page-heading">What's your idea?</h1>
      {showIntro && (
        <p className="mt-2 text-body text-muted-foreground">
          Describe it in your own words. Anvil will ask questions until it's clear.
        </p>
      )}
      <form
        onSubmit={submit}
        aria-busy={isPending}
        className="mt-6 rounded-card border bg-card text-left transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
      >
        <label htmlFor={ideaId} className="sr-only">
          Your idea
        </label>
        <textarea
          ref={ideaRef}
          id={ideaId}
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          onKeyDown={onKeyDown}
          readOnly={isPending}
          rows={3}
          placeholder={config?.idea_placeholder}
          aria-describedby={error ? errorId : undefined}
          className="block w-full resize-none bg-transparent px-4 pt-4 pb-2 text-body outline-none placeholder:text-muted-foreground/70 read-only:text-muted-foreground"
        />
        <div className="flex items-center justify-between gap-4 px-2 pb-2">
          <div className="min-w-0">
            {projects.isError ? (
              <p className="pl-2 text-caption font-normal text-muted-foreground">
                Couldn't load the Projects.{' '}
                <button
                  type="button"
                  onClick={() => void projects.refetch()}
                  className={inlineLinkClass}
                >
                  Retry
                </button>
              </p>
            ) : projects.isSuccess && items.length === 0 ? (
              <p className="pl-2 text-caption font-normal text-muted-foreground">
                Each Requirement belongs to a Project.{' '}
                <Link
                  to="/projects"
                  className={inlineLinkClass}
                >
                  Create a Project
                </Link>{' '}
                to start.
              </p>
            ) : (
              projects.isSuccess && (
                <ProjectPicker
                  projects={items}
                  value={picked}
                  onValueChange={pickProject}
                  // Straight back to typing the idea.
                  onPicked={() => ideaRef.current?.focus()}
                  disabled={isPending}
                  invalid={needsProject}
                  describedBy={needsProject ? projectErrorId : undefined}
                />
              )
            )}
          </div>
          <Button type="submit" disabled={isPending || items.length === 0}>
            {isPending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Starting
              </>
            ) : (
              <>
                Start refining
                <ArrowRight aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
      </form>
      {needsProject && (
        <p id={projectErrorId} role="alert" className="mt-3 text-left text-body-sm text-destructive">
          Pick a Project to start refining.
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-3 text-left text-body-sm text-destructive">
          {error.message}
        </p>
      )}
    </section>
  )
}
