import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { LeaveGuard } from '@/components/leave-guard'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { type Project, projectKey, projectsKey, updateProject } from '@/lib/projects'
import { cn } from '@/lib/utils'

// The API's limits (NAME_MAX_LENGTH, CONTEXT_MAX_LENGTH)
const NAME_MAX_LENGTH = 120
const CONTEXT_MAX_LENGTH = 20_000

const CONTEXT_PROMPT =
  "Anvil reads this whenever it refines one of this Project's Requirements. Write what you'd tell a new colleague: who it's for, how things work today, the rules, and the words you use."

// The name and Project Context: editable, with Save, for the Project Owner;
// read-only for anyone else.
export function ProjectForm({ project }: { project: Project }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(project.name)
  const [context, setContext] = useState(project.context)
  const [saved, setSaved] = useState(false)
  const nameId = useId()
  const nameErrorId = useId()
  const contextId = useId()
  const contextHintId = useId()
  const contextErrorId = useId()

  const save = useMutation({
    mutationFn: () => updateProject(project.id, { name: name.trim(), context }),
    onSuccess: (next) => {
      queryClient.setQueryData(projectKey(project.id), next)
      void queryClient.invalidateQueries({ queryKey: projectsKey, exact: true })
      setName(next.name)
      setContext(next.context)
      setSaved(true)
    },
  })

  const dirty = name.trim() !== project.name || context !== project.context
  const error = save.error ? fieldOf(save.error) : undefined

  const edited = () => {
    setSaved(false)
    if (save.isError) save.reset()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (save.isPending || !dirty || !name.trim()) return
    save.mutate()
  }

  if (!project.is_owner) {
    return (
      <div>
        <p className="text-caption font-normal text-muted-foreground">Name</p>
        <h1 className="mt-2 text-page-heading break-words">{project.name}</h1>
        <h2 className="mt-8 text-section-heading">Project Context</h2>
        <p className="mt-1 text-body-sm text-muted-foreground">{CONTEXT_PROMPT}</p>
        <div className="mt-3 rounded-card border bg-card p-4 text-body whitespace-pre-wrap break-words">
          {project.context.trim() || (
            <span className="text-muted-foreground">No Project Context yet.</span>
          )}
        </div>
        <p className="mt-4 text-caption font-normal text-muted-foreground">
          Only the Project Owner can change this Project.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} aria-busy={save.isPending}>
      <LeaveGuard dirty={dirty} message="Your changes to this Project will be lost." />
      <Label htmlFor={nameId} className="text-caption font-normal text-muted-foreground">
        Name
      </Label>
      <input
        id={nameId}
        value={name}
        onChange={(event) => {
          setName(event.target.value)
          edited()
        }}
        readOnly={save.isPending}
        maxLength={NAME_MAX_LENGTH}
        autoComplete="off"
        aria-invalid={error?.field === 'name' ? true : undefined}
        aria-describedby={error?.field === 'name' ? nameErrorId : undefined}
        className="-mx-2 mt-1 block w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 py-1 text-page-heading outline-none transition-[color,box-shadow,border-color] hover:border-input focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
      />
      {error?.field === 'name' && (
        <p id={nameErrorId} role="alert" className="mt-1 text-body-sm text-destructive">
          {error.message}
        </p>
      )}
      <Label htmlFor={contextId} className="mt-8 text-section-heading">
        Project Context
      </Label>
      <p id={contextHintId} className="mt-1 text-body-sm text-muted-foreground">
        {CONTEXT_PROMPT}
      </p>
      <textarea
        id={contextId}
        value={context}
        onChange={(event) => {
          setContext(event.target.value)
          edited()
        }}
        readOnly={save.isPending}
        maxLength={CONTEXT_MAX_LENGTH}
        rows={16}
        aria-invalid={error?.field === 'context' ? true : undefined}
        aria-describedby={cn(contextHintId, error?.field === 'context' && contextErrorId)}
        className="mt-3 block min-h-40 w-full resize-y rounded-card border bg-card p-4 text-body outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive read-only:text-muted-foreground"
      />
      {error?.field === 'context' && (
        <p id={contextErrorId} role="alert" className="mt-1 text-body-sm text-destructive">
          {error.message}
        </p>
      )}
      <div className="mt-5 flex items-center justify-between gap-4">
        {error?.field === 'form' ? (
          <p role="alert" className="text-body-sm text-destructive">
            {error.message}
          </p>
        ) : (
          <p role="status" className="text-caption font-normal text-muted-foreground">
            {save.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : saved ? 'Saved just now' : ''}
          </p>
        )}
        <Button type="submit" size="lg" disabled={save.isPending || !dirty || !name.trim()}>
          {save.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Save
        </Button>
      </div>
    </form>
  )
}

// Which field a failed save belongs next to. A taken name is a 409; a field
// that fails validation is a 422 whose message starts with the field's name.
function fieldOf(error: Error): { field: 'name' | 'context' | 'form'; message: string } {
  if (error instanceof ApiError && error.status === 409) return { field: 'name', message: error.message }
  if (error instanceof ApiError && error.status === 422) {
    const match = /^(name|context): (.*)$/.exec(error.message)
    if (match) return { field: match[1] as 'name' | 'context', message: match[2] }
  }
  return { field: 'form', message: "Couldn't save the project. Try again." }
}
