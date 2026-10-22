import { useId } from 'react'
import { RefinementAnvil } from '@/components/refinement-anvil'
import { cn } from '@/lib/utils'
import type { AnsweredQuestion, OpenQuestion } from '@/lib/api-schema'

const ANSWERED_SHOWN = 4
const NEXT_SHOWN = 3

const eyebrow = 'text-caption font-normal tracking-[0.06em] text-muted-foreground uppercase'

/**
 * The anvil, "Question 3 of about 7" and one mark per Question: answered,
 * current, still to come. `strike` replays the anvil's strike when it changes.
 */
export function RefinementProgress({
  answered,
  open,
  strike,
}: {
  answered: number
  open: number
  strike: number
}) {
  const total = answered + open
  return (
    <div className="flex flex-col items-center gap-2.5">
      <RefinementAnvil strike={strike} className="mb-1" />
      <p className="text-[0.8125rem] text-muted-foreground">
        {open === 0 ? `All ${total} answered` : `Question ${answered + 1} of about ${total}`}
      </p>
      {/* The label above says the same in words. */}
      <div aria-hidden="true" data-testid="progress-marks" className="flex max-w-full flex-wrap justify-center gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            data-mark={i < answered ? 'answered' : i === answered ? 'current' : 'to-come'}
            className={cn(
              'h-1 w-7 rounded-full',
              i < answered ? 'bg-answered' : i === answered ? 'bg-muted-foreground' : 'bg-muted',
            )}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * The latest Answers, newest first. `answered` is in the order they were given.
 */
export function AnsweredPile({ answered, className }: { answered: AnsweredQuestion[]; className?: string }) {
  const labelId = useId()
  const latest = answered.slice(-ANSWERED_SHOWN).reverse()
  return (
    <section aria-labelledby={labelId} className={cn('flex flex-col gap-2.5', className)}>
      <h2 id={labelId} className={eyebrow}>
        Answered · {answered.length}
      </h2>
      {latest.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {latest.map((question) => (
            <li
              key={question.id}
              className="flex flex-col gap-1 rounded-lg border border-answered-border bg-answered-background px-3 py-2.5"
            >
              <span className="text-[0.6875rem] tracking-[0.04em] text-answered uppercase">{question.topic}</span>
              <span className="text-[0.8125rem] text-answered-foreground">{question.text}</span>
              <span className="text-[0.8125rem] break-words">{question.answer}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The next few topics under the top card, and how many cards are under it. */
export function NextInStack({ open, className }: { open: OpenQuestion[]; className?: string }) {
  const labelId = useId()
  const under = open.slice(1)
  return (
    <section aria-labelledby={labelId} className={cn('flex flex-col gap-2.5', className)}>
      <h2 id={labelId} className={eyebrow}>
        In the stack · {under.length}
      </h2>
      {under.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {under.slice(0, NEXT_SHOWN).map((question) => (
            <li
              key={question.id}
              className="rounded-lg border bg-card px-3 py-2.5 text-caption font-normal tracking-[0.04em] text-muted-foreground uppercase"
            >
              {question.topic}
            </li>
          ))}
        </ul>
      )}
      <p className="rounded-lg border border-dashed border-border-strong px-3 py-2.5 text-caption font-normal text-faint">
        Anvil deals new cards as your answers raise new questions.
      </p>
    </section>
  )
}
