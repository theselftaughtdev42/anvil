import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  renameKey,
  renameRequirement,
  type Requirement,
  requirementQuery,
  requirementsKey,
  TITLE_MAX_LENGTH,
} from '@/lib/requirements'

/**
 * The Requirement's title in the Refinement header, renamed in place: click it,
 * then Enter or click away to save, or Esc to cancel. A blank title isn't saved.
 */
export function RequirementTitle({ requirement }: { requirement: Requirement }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<string | null>(null)
  // Esc blurs the box to close it, and the blur mustn't then save.
  const cancelled = useRef(false)

  const rename = useMutation({
    mutationKey: renameKey(requirement.id),
    // One at a time, so the last rename wins.
    scope: { id: renameKey(requirement.id).join('/') },
    // Dropped once the page closes, so a failure isn't still shown on return.
    gcTime: 0,
    mutationFn: (title: string) => renameRequirement(requirement.id, title),
    onSuccess: (next) => {
      queryClient.setQueryData(requirementQuery(requirement.id).queryKey, next)
      // The lists show the title too. The Questions don't change, and refetching
      // them could undo an Answer saved meanwhile.
      void queryClient.invalidateQueries({
        queryKey: requirementsKey,
        predicate: (query) => query.queryKey[2] === undefined,
      })
    },
  })

  // While a rename saves, the header shows the new title.
  const title = rename.isPending ? rename.variables : requirement.title

  if (draft === null) {
    return (
      <button
        type="button"
        title="Rename"
        onClick={() => setDraft(title)}
        className="group flex max-w-full cursor-text items-center gap-1.5 rounded-sm text-left outline-none hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <span className="truncate">{title}</span>
        <Pencil
          className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground"
          aria-hidden="true"
        />
      </button>
    )
  }

  const save = () => {
    const next = draft.trim()
    if (!cancelled.current && next && next !== title) rename.mutate(next)
    cancelled.current = false
    setDraft(null)
  }

  return (
    <Input
      aria-label="Title"
      autoFocus
      value={draft}
      maxLength={TITLE_MAX_LENGTH}
      aria-invalid={draft.trim() ? undefined : true}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          if (draft.trim()) event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          cancelled.current = true
          event.currentTarget.blur()
        }
      }}
      onBlur={save}
      // The header clips a ring, so the border alone shows focus.
      className="h-7 px-2 text-body-sm font-medium focus-visible:ring-0 md:text-body-sm"
    />
  )
}
