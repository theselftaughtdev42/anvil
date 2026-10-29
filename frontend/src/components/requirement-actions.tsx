import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ellipsis, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { projectsKey } from '@/lib/projects'
import {
  deleteRequirement,
  type Requirement,
  requirementKey,
  requirementsKey,
  statusLabels,
} from '@/lib/requirements'

function answersLost(answered: number) {
  if (answered === 0) return 'It has no answers yet.'
  return `Its ${answered} ${answered === 1 ? 'answer' : 'answers'} will be lost.`
}

/**
 * The ⋯ menu for a Requirement, on its card and in the Refinement header.
 * Delete asks first; `onDeleted` runs before its cached data is dropped, so a
 * page showing it can leave first.
 */
export function RequirementActions({
  requirement,
  onDeleted,
  className,
}: {
  requirement: Requirement
  onDeleted?: () => void
  className?: string
}) {
  const [confirming, setConfirming] = useState(false)
  const queryClient = useQueryClient()

  const { mutate, isPending, isError, reset } = useMutation({
    mutationFn: () => deleteRequirement(requirement.id),
    onSuccess: () => {
      setConfirming(false)
      onDeleted?.()
      queryClient.removeQueries({ queryKey: requirementKey(requirement.id) })
      void queryClient.invalidateQueries({ queryKey: requirementsKey })
      // Projects show how many Requirements they have.
      void queryClient.invalidateQueries({ queryKey: projectsKey })
    },
  })

  const changeConfirming = (next: boolean) => {
    if (isPending) return
    setConfirming(next)
    if (!next) reset()
  }

  return (
    <>
      {/* Not modal: a modal menu closing as the dialog opens can leave the page unclickable. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${requirement.title}`}
            className={cn('text-muted-foreground max-sm:size-9', className)}
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44 rounded-button shadow-[0_8px_24px_rgb(0_0_0/0.4)]">
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirming(true)}
            className="data-[variant=destructive]:focus:bg-destructive/12 dark:data-[variant=destructive]:focus:bg-destructive/12"
          >
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirming} onOpenChange={changeConfirming}>
        <DialogContent className="rounded-card" aria-busy={isPending}>
          <DialogHeader>
            <DialogTitle>Delete this requirement?</DialogTitle>
            <DialogDescription>
              <strong className="font-medium text-foreground wrap-anywhere">{requirement.title}</strong> (
              {statusLabels[requirement.status]}) will be deleted for good.{' '}
              {answersLost(requirement.progress?.answered ?? 0)} This can't be undone.
            </DialogDescription>
          </DialogHeader>
          {isError && (
            <p role="alert" className="text-body-sm text-destructive">
              Couldn't delete it. Try again.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => changeConfirming(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={isPending} onClick={() => mutate()}>
              {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Delete requirement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
