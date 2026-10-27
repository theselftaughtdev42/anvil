import { LoaderCircle } from 'lucide-react'
import { type FormEvent, type ReactNode, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AnsweredQuestion } from '@/lib/api-schema'
import { REOPEN_NOTE_MAX_LENGTH } from '@/lib/requirements'

const eyebrow = 'text-caption font-normal tracking-[0.06em] text-muted-foreground uppercase'

/**
 * In place of the stack once Anvil has nothing more to ask: it suggests the
 * Requirement is clear enough, and the Point of Contact confirms it.
 * `nothingNew` says a reopen didn't raise any new Questions.
 */
export function LooksReadyCard({
  answered,
  nothingNew,
  busy,
  error,
  onConfirm,
}: {
  answered: AnsweredQuestion[]
  nothingNew: boolean
  busy: boolean
  error?: string
  onConfirm: () => void
}) {
  const errorId = useId()
  return (
    <OutcomeCard
      label="Looks ready"
      heading="This looks clear enough to act on"
      answered={answered}
      actions={
        <Button
          size="lg"
          className="px-4.5"
          aria-busy={busy}
          aria-describedby={error ? errorId : undefined}
          onClick={() => {
            if (!busy) onConfirm()
          }}
        >
          {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Confirm
        </Button>
      }
    >
      {nothingNew && (
        <p className="text-body-sm font-medium">You reopened it, but Anvil has nothing new to ask.</p>
      )}
      <p className="text-body-sm text-muted-foreground">
        Anvil has no more questions. Whether it's ready is your call: confirm to mark it Complete.
      </p>
      {error && (
        <p id={errorId} role="alert" className="text-body-sm text-destructive">
          {error}
        </p>
      )}
    </OutcomeCard>
  )
}

/**
 * A Complete Requirement's Questions and Answers. Reopen asks what's missing,
 * which Anvil asks new Questions about.
 */
export function CompleteCard({
  answered,
  busy,
  error,
  onReopen,
}: {
  answered: AnsweredQuestion[]
  busy: boolean
  error?: string
  onReopen: (note: string) => void
}) {
  const [reopening, setReopening] = useState(false)
  return (
    <OutcomeCard
      label="Complete"
      heading="You confirmed this is clear enough to act on"
      answered={answered}
      actions={
        reopening ? null : (
          <Button variant="outline" size="lg" className="px-3.5" onClick={() => setReopening(true)}>
            Reopen
          </Button>
        )
      }
    >
      {reopening && (
        <ReopenForm busy={busy} error={error} onReopen={onReopen} onCancel={() => setReopening(false)} />
      )}
    </OutcomeCard>
  )
}

function ReopenForm({
  busy,
  error,
  onReopen,
  onCancel,
}: {
  busy: boolean
  error?: string
  onReopen: (note: string) => void
  onCancel: () => void
}) {
  const noteId = useId()
  const messageId = useId()
  const [note, setNote] = useState('')
  const [empty, setEmpty] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const message = empty ? "Say what's missing to reopen it." : error

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const text = note.trim()
    setEmpty(!text)
    if (text) onReopen(text)
    else field.current?.focus()
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2.5">
      <label htmlFor={noteId} className="text-body-sm font-medium">
        What's missing?
      </label>
      <textarea
        ref={field}
        id={noteId}
        // Opened by a click on Reopen, so moving there is expected.
        autoFocus
        required
        value={note}
        onChange={(event) => {
          setNote(event.target.value)
          if (event.target.value.trim()) setEmpty(false)
        }}
        readOnly={busy}
        rows={3}
        maxLength={REOPEN_NOTE_MAX_LENGTH}
        placeholder="Anvil asks new questions about it"
        aria-invalid={empty || undefined}
        aria-describedby={message ? messageId : undefined}
        className="resize-none rounded-lg border bg-card-sunk px-3 py-2.5 text-body-sm outline-none transition-[color,box-shadow,border-color] placeholder:text-faint focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
      />
      {message && (
        <p id={messageId} role="alert" className="text-body-sm text-destructive">
          {message}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="ghost" size="lg" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="px-4.5" aria-busy={busy}>
          {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          Reopen
        </Button>
      </div>
    </form>
  )
}

function OutcomeCard({
  label,
  heading,
  answered,
  actions,
  children,
}: {
  label: string
  heading: string
  answered: AnsweredQuestion[]
  actions: ReactNode
  children?: ReactNode
}) {
  const headingId = useId()
  const listId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4.5 rounded-question border border-border-strong bg-card-raised p-7"
    >
      <p className={eyebrow}>{label}</p>
      <h2 id={headingId} className="-mt-3 text-[1.375rem] leading-[1.35] font-semibold tracking-[-0.015em] text-balance">
        {heading}
      </h2>
      {children}
      {answered.length > 0 && (
        <section aria-labelledby={listId} className="flex flex-col gap-2.5">
          <h3 id={listId} className={eyebrow}>
            Questions and Answers · {answered.length}
          </h3>
          <ol className="flex flex-col gap-2.5">
            {answered.map((question) => (
              <li
                key={question.id}
                className="flex min-w-0 flex-col gap-1 rounded-lg border border-answered-border bg-answered-background px-3 py-2.5"
              >
                <span className="truncate text-[0.6875rem] tracking-[0.04em] text-answered uppercase">
                  {question.topic}
                </span>
                <span className="text-[0.8125rem] text-answered-foreground">{question.text}</span>
                <span className="text-[0.8125rem] break-words">{question.answer}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {actions && <div className="flex items-center justify-end gap-3">{actions}</div>}
    </section>
  )
}
