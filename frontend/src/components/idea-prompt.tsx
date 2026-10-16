import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { configQuery } from '@/lib/config'
import { createRequirement, requirementsKey } from '@/lib/requirements'

// Offered on a first visit; clicking one fills the prompt.
const EXAMPLE_IDEAS = [
  'Let customers reschedule deliveries',
  'A dashboard of late orders',
  'Single sign-on for staff',
]

// "What's your idea?": starts a Requirement from the idea typed here, then
// opens it. `showIntro`, for someone with no Requirements yet, adds a line
// explaining Refinement and some example ideas to start from.
export function IdeaPrompt({ showIntro = false }: { showIntro?: boolean }) {
  const [idea, setIdea] = useState('')
  const ideaRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const ideaId = useId()
  const errorId = useId()
  // No placeholder until it loads, or if it can't.
  const { data: config } = useQuery(configQuery)

  const { mutate, isPending, error } = useMutation({
    mutationFn: createRequirement,
    onSuccess: (requirement) => {
      // Not awaited: the home page's list refetches when it's next shown.
      void queryClient.invalidateQueries({ queryKey: requirementsKey })
      void navigate(`/requirements/${requirement.id}`)
    },
  })

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (isPending || !idea.trim()) return
    mutate(idea)
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
          id={ideaId}
          ref={ideaRef}
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          onKeyDown={onKeyDown}
          readOnly={isPending}
          rows={3}
          placeholder={config?.idea_placeholder}
          aria-describedby={error ? errorId : undefined}
          className="block w-full resize-none bg-transparent px-4 pt-4 pb-2 text-body outline-none placeholder:text-muted-foreground/70 read-only:text-muted-foreground"
        />
        <div className="flex items-center justify-between gap-4 pr-2 pb-2 pl-4">
          <p className="text-caption font-normal text-muted-foreground">
            {isPending ? 'Opening your requirement…' : 'Enter to start · Shift + Enter for a new line'}
          </p>
          <Button type="submit" disabled={isPending}>
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
      {error && (
        <p id={errorId} role="alert" className="mt-3 text-left text-body-sm text-destructive">
          {error.message}
        </p>
      )}
      {showIntro && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="text-caption font-normal text-muted-foreground">Try one:</span>
          {EXAMPLE_IDEAS.map((example) => (
            <button
              key={example}
              type="button"
              disabled={isPending}
              onClick={() => {
                setIdea(example)
                ideaRef.current?.focus()
              }}
              className="h-8 rounded-full border px-3 text-body-sm text-foreground/80 transition-[color,box-shadow] outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
