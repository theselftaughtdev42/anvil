import { LoaderCircle } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { OpenQuestion } from '@/lib/api-schema'
import { ANSWER_MAX_LENGTH } from '@/lib/questions'

const MAX_SUGGESTIONS = 3

/** Where the shortcuts leave keys alone. */
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
const INTERACTIVE = `${EDITABLE}, a[href], button, [role="button"], [role="link"], [role="menuitem"], [role="tab"]`
/** The suggestions are radios: Enter on one still answers. */
const isRadio = (target: EventTarget | null) => target instanceof Element && target.getAttribute('role') === 'radio'

type QuestionCardProps = {
  question: OpenQuestion
  /**
   * Set while an Answer or Later is sending. The buttons stay focusable but ignore clicks.
   */
  busy: 'answer' | 'later' | false
  onAnswer: (answer: string) => void
  onLater: () => void
  error?: string
}

/**
 * The Question on top of the stack. Key it by the Question's id, so a new card
 * starts with nothing picked or typed.
 */
export function QuestionCard({ question, busy, onAnswer, onLater, error }: QuestionCardProps) {
  const headingId = useId()
  const ownId = useId()
  const errorId = useId()
  const [picked, setPicked] = useState('')
  const [own, setOwn] = useState('')
  const ownWords = useRef<HTMLTextAreaElement>(null)
  const suggestions = question.suggestions.slice(0, MAX_SUGGESTIONS)

  // Your own words win over a picked suggestion. With neither, nothing happens.
  const answer = () => {
    if (busy) return
    const text = own.trim() || (picked && suggestions[Number(picked)])
    if (text) onAnswer(text)
  }
  const later = () => {
    if (!busy) onLater()
  }

  // 1–3 pick a suggestion, W moves to the text box, Enter answers and L puts the
  // card off, as if their controls were clicked. In the text box only Enter and
  // Esc act: Shift + Enter adds a new line and Esc leaves the box, keeping what's
  // typed. Other controls keep their own keys.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented && !isRadio(event.target)) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing) return
    const target = event.target instanceof Element ? event.target : null
    const inOwnWords = target?.id === ownId
    if (event.key === 'Enter') {
      if (!inOwnWords && target?.closest(INTERACTIVE) && !isRadio(target)) return
      event.preventDefault()
      answer()
      return
    }
    if (event.key === 'Escape' && inOwnWords) {
      ownWords.current?.blur()
      return
    }
    if (inOwnWords || target?.closest(EDITABLE)) return
    const key = event.key.toLowerCase()
    if (key === 'w') {
      event.preventDefault()
      ownWords.current?.focus()
    } else if (key === 'l') {
      event.preventDefault()
      later()
    } else if (/^[1-3]$/.test(key) && Number(key) <= suggestions.length && !busy) {
      event.preventDefault()
      setPicked(String(Number(key) - 1))
    }
  })
  useEffect(() => {
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <section
      aria-labelledby={headingId}
      className="relative z-3 flex min-h-95 flex-col gap-4.5 rounded-question border border-border-strong bg-card-raised p-7 shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="truncate text-caption font-normal tracking-[0.06em] text-topic uppercase">
          {question.topic}
        </span>
        <span className="shrink-0 font-mono text-caption text-faint">#{question.number}</span>
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
              aria-keyshortcuts={String(i + 1)}
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
        ref={ownWords}
        id={ownId}
        aria-keyshortcuts="W"
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
        <Button variant="outline" size="lg" className="px-3.5" aria-keyshortcuts="L" aria-busy={!!busy} onClick={later}>
          {busy === 'later' && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Later
        </Button>
        <Button size="lg" className="px-4.5" aria-keyshortcuts="Enter" aria-busy={!!busy} onClick={answer}>
          {busy === 'answer' && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Answer
        </Button>
      </div>
    </section>
  )
}

export function ShortcutHint({ className }: { className?: string }) {
  return (
    <p className={cn('flex justify-center gap-3.5 text-caption text-muted-foreground', className)}>
      <span>
        <Kbd>1</Kbd>–<Kbd>3</Kbd> pick
      </span>
      <span>
        <Kbd>W</Kbd> write
      </span>
      <span>
        <Kbd>Enter</Kbd> submit
      </span>
      <span>
        <Kbd>L</Kbd> later
      </span>
    </p>
  )
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-sm border border-border-strong px-1.25 py-px font-mono text-[0.6875rem] font-medium text-foreground/80">
      {children}
    </kbd>
  )
}
