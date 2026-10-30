import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useId, useState } from 'react'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { deleteProject, type Project, projectKey, projectsKey } from '@/lib/projects'
import { everyProjectRequirementQuery, requirementsKey } from '@/lib/requirements'

const CONFIRM_WORD = 'DELETE'

const requirements = (count: number) => `${count} ${count === 1 ? 'Requirement' : 'Requirements'}`

function whatIsLost(count: number) {
  if (count === 0) return 'It has no Requirements.'
  return `Its ${requirements(count)}, and all their Questions and Answers, will be deleted with it.`
}

/**
 * The Project page's danger zone, for the Project Owner: deletes the Project
 * and its Requirements once they've typed DELETE. `onDeleted` runs before its
 * cached data is dropped, so the page can leave first.
 */
export function ProjectDangerZone({ project, onDeleted }: { project: Project; onDeleted: () => void }) {
  const [openedAt, setOpenedAt] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const queryClient = useQueryClient()
  const headingId = useId()
  const inputId = useId()
  const confirming = openedAt !== null
  const list = useQuery({ ...everyProjectRequirementQuery(project.id), enabled: confirming })
  const items = list.data?.items ?? []
  const failed = !list.isFetching && list.isError
  // Only once it's reloaded since the dialog opened, so it lists what the delete will take.
  const ready = openedAt !== null && !list.isFetching && !failed && list.dataUpdatedAt >= openedAt

  const reload = () => void list.refetch()

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () => deleteProject(project.id, items.length),
    onSuccess: () => {
      setOpenedAt(null)
      onDeleted()
      queryClient.removeQueries({ queryKey: projectKey(project.id), exact: true })
      void queryClient.invalidateQueries({ queryKey: projectsKey })
      void queryClient.invalidateQueries({ queryKey: requirementsKey })
    },
    onError: (failure) => {
      // The Requirements changed since the dialog loaded: show them before asking again.
      if (failure instanceof ApiError && failure.status === 409) reload()
    },
  })

  const changeConfirming = (next: boolean) => {
    if (isPending) return
    setOpenedAt(next ? Date.now() : null)
    setTyped('')
    reset()
  }

  return (
    <section aria-labelledby={headingId} className="mt-12 rounded-card border border-destructive/40 p-4">
      <h2 id={headingId} className="text-section-heading">
        Danger zone
      </h2>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <p className="text-body-sm text-muted-foreground">
          Delete this Project and all its Requirements for good.
        </p>
        <Button type="button" variant="destructive" onClick={() => changeConfirming(true)}>
          Delete project…
        </Button>
      </div>
      <Dialog open={confirming} onOpenChange={changeConfirming}>
        <DialogContent className="rounded-card" aria-busy={isPending || !ready}>
          <DialogHeader>
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogDescription>
              <strong className="font-medium text-foreground wrap-anywhere">{project.name}</strong> will be deleted
              for good. {ready ? whatIsLost(items.length) : ''} This can't be undone.
            </DialogDescription>
          </DialogHeader>
          {!ready ? (
            failed ? (
              <p role="alert" className="text-body-sm text-destructive">
                Couldn't load its Requirements, so it can't be deleted yet.{' '}
                <button type="button" className="underline" onClick={reload}>
                  Retry
                </button>
              </p>
            ) : (
              <p role="status" className="text-body-sm text-muted-foreground">
                Loading its Requirements…
              </p>
            )
          ) : (
            items.length > 0 && (
              <ul
                aria-label="Requirements to delete"
                className="max-h-60 overflow-y-auto rounded-card border px-3"
              >
                {items.map((requirement) => (
                  <li key={requirement.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
                    <span className="min-w-0 truncate text-body-sm">{requirement.title}</span>
                    <StatusBadge status={requirement.status} className="shrink-0" />
                  </li>
                ))}
              </ul>
            )
          )}
          <div className="grid gap-2">
            <Label htmlFor={inputId} className="text-body-sm font-normal">
              Type {CONFIRM_WORD} to confirm
            </Label>
            <Input
              id={inputId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              readOnly={isPending}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {error && (
            <p role="alert" className="text-body-sm text-destructive">
              {error instanceof ApiError && error.status === 409
                ? 'Its Requirements changed. Check the list and try again.'
                : "Couldn't delete it. Try again."}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => changeConfirming(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending || !ready || typed !== CONFIRM_WORD}
              onClick={() => mutate()}
            >
              {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
