import { LoaderCircle } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { type MouseEvent, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ANSWER_MAX_LENGTH, type OpenQuestion } from '@/lib/questions'

const MAX_SUGGESTIONS = 3

type QuestionCardProps = {
  question: OpenQuestion
  // Set while an Answer or Later is sending. The buttons stay focusable but ignore clicks.
  busy: 'answer' | 'later' | false
  onAnswer: (answer: string) => void
  onLater: () => void
  // Why the last Answer or Later failed.
  error?: string
}

// The Question on top of the stack. Key it by the Question's id, so a new card
// starts with nothing picked or typed.
export function QuestionCard({ question, busy, onAnswer, onLater, error }: QuestionCardProps) {
  const headingId = useId()
  const ownId = useId()
  const errorId = useId()
  const [picked, setPicked] = useState('')
  const [own, setOwn] = useState('')
  const suggestions = question.suggestions.slice(0, MAX_SUGGESTIONS)

  // Your own words win over a picked suggestion. With neither, nothing happens.
  const answer = (event: MouseEvent) => {
    event.preventDefault()
    if (busy) return
    const text = own.trim() || (picked && suggestions[Number(picked)])
    if (text) onAnswer(text)
  }
  const later = () => {
    if (!busy) onLater()
  }

  return (
    <section
      aria-labelledby={headingId}
      className="relative z-3 flex min-h-95 flex-col gap-4.5 rounded-question border border-border-strong bg-card-raised p-7 shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-caption font-normal tracking-[0.06em] text-topic uppercase">
          {question.topic}
        </span>
        <span className="font-mono text-caption text-faint">#{question.number}</span>
      </div>
      <h2 id={headingId} className="text-[1.375rem] leading-[1.35] font-semibold tracking-[-0.015em] text-balance">
        {question.text}
      </h2>
      {question.why && <p className="text-body-sm text-muted-foreground">{question.why}</p>}

      {suggestions.length > 0 && (
        <RadioGroup.Root
          aria-label="Suggested answers"
          value={picked}
          onValueChange={setPicked}
          className="flex flex-col gap-2"
        >
          {suggestions.map((suggestion, i) => (
            <RadioGroup.Item
              key={suggestion}
              value={String(i)}
              className="flex min-h-11 items-center gap-3 rounded-lg border px-3.5 text-left text-body-sm outline-none transition-[color,box-shadow,border-color] hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary-wash data-[state=checked]:font-medium"
            >
              <span aria-hidden="true" className="w-3.5 font-mono text-caption text-faint">
                {i + 1}
              </span>
              {suggestion}
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
      )}

      <label htmlFor={ownId} className="sr-only">
        Your own answer
      </label>
      <textarea
        id={ownId}
        value={own}
        onChange={(event) => setOwn(event.target.value)}
        readOnly={!!busy}
        rows={2}
        maxLength={ANSWER_MAX_LENGTH}
        placeholder="Or answer in your own words"
        aria-describedby={error ? errorId : undefined}
        className="resize-none rounded-lg border bg-card-sunk px-3 py-2.5 text-body-sm outline-none transition-[color,box-shadow,border-color] placeholder:text-faint focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />

      {error && (
        <p id={errorId} role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3">
        <Button variant="outline" size="lg" className="px-3.5" aria-busy={!!busy} onClick={later}>
          {busy === 'later' && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Later
        </Button>
        <Button size="lg" className="px-4.5" aria-busy={!!busy} onClick={answer}>
          {busy === 'answer' && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Answer
        </Button>
      </div>
    </section>
  )
}

// In place of the stack once Anvil has nothing more to ask. No buttons.
export function NoMoreQuestionsCard() {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1.5 rounded-question border bg-card-raised p-7">
      <p className="text-caption font-normal tracking-[0.06em] text-muted-foreground uppercase">No more questions</p>
      <h2 id={headingId} className="text-[1.375rem] leading-[1.35] font-semibold tracking-[-0.015em]">
        Anvil has no more questions for now
      </h2>
    </section>
  )
}
