import { Check, CircleAlert, Copy, Download, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { featureFilename, type GherkinKind, tokenizeGherkin } from '@/lib/gherkin'
import type { Requirement } from '@/lib/requirements'
import { generatedAt, generatedAtInFull, type Output } from '@/lib/outputs'
import { statusStyles } from '@/lib/status-styles'
import { cn } from '@/lib/utils'

/** The state of the one Output format there is, Gherkin. */
export type GherkinState = {
  output: Output | undefined
  generating: boolean
  failed: boolean
  onGenerate: () => void
}

/**
 * The Output tab: the Output formats down the side, with Gherkin the only one,
 * and its Output, or a way to generate it.
 */
export function RequirementOutput({
  requirement,
  answered,
  gherkin,
}: {
  requirement: Requirement
  answered: number
  gherkin: GherkinState
}) {
  const { output, generating } = gherkin
  const summary = generating
    ? 'Generating…'
    : output?.out_of_date
      ? 'Out of date'
      : output
        ? `Generated ${generatedAt(output)}`
        : 'Not generated yet'
  return (
    <div className="flex flex-wrap items-start gap-8 pt-9 pb-14">
      <nav aria-label="Output format" className="flex max-w-60 flex-[1_1_12.5rem] flex-col gap-2.5">
        <p className="text-caption font-normal tracking-wider text-muted-foreground uppercase">Output format</p>
        <button
          type="button"
          aria-current="true"
          className="flex w-full flex-col items-start gap-1 rounded-lg border border-primary bg-primary-wash px-3 py-2.5 text-left font-medium leading-tight"
        >
          Gherkin
          <small
            className={cn(
              'text-caption font-normal text-muted-foreground',
              output?.out_of_date && !generating && 'text-status-in-progress-foreground',
            )}
          >
            {summary}
          </small>
        </button>
        <p className="rounded-lg border border-dashed border-border-strong px-3 py-2.5 text-caption font-normal text-muted-foreground">
          More Output formats will be listed here.
        </p>
      </nav>
      <div className="flex min-w-0 flex-[999_1_35rem] flex-col gap-4" aria-busy={generating}>
        <GherkinPanel requirement={requirement} answered={answered} gherkin={gherkin} />
      </div>
    </div>
  )
}

function GherkinPanel({
  requirement,
  answered,
  gherkin: { output, generating, failed, onGenerate },
}: {
  requirement: Requirement
  answered: number
  gherkin: GherkinState
}) {
  const complete = requirement.status === 'complete'
  const answers = `${answered} ${answered === 1 ? 'Answer' : 'Answers'}`

  if (generating) {
    return (
      <>
        <PanelHead sub={<span role="status">Anvil is writing it from {answers}. This takes a few seconds.</span>}>
          <Button size="lg" disabled>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            {output ? 'Regenerate' : 'Generate Gherkin'}
          </Button>
        </PanelHead>
        <div aria-hidden="true" className="flex flex-col gap-3 rounded-xl border bg-card-sunk px-5 py-4.5">
          {['w-[46%]', 'ml-4 w-[34%]', 'ml-4 w-[58%]', 'ml-4 w-[40%]', 'mt-2 ml-4 w-[24%]', 'ml-8 w-[52%]'].map(
            (width) => (
              <Skeleton key={width} className={cn('h-2.5 rounded-full', width)} />
            ),
          )}
        </div>
      </>
    )
  }

  const alert = failed && (
    <p role="alert" className="text-body font-medium text-destructive">
      Couldn't generate the Gherkin. Try again.
    </p>
  )

  if (!output) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong px-7 py-10 text-center">
        {failed ? (
          <>
            <CircleAlert className="size-5 text-destructive" aria-hidden="true" />
            {alert}
            <p className="max-w-95 text-body-sm text-muted-foreground">Nothing about the Requirement changed.</p>
          </>
        ) : (
          <>
            <h3 className="text-section-heading">No Output yet</h3>
            <p className="max-w-95 text-body-sm text-muted-foreground">
              {complete
                ? `Turn this Complete Requirement into a Gherkin Feature, with Scenarios drawn from its ${answers}.`
                : 'The Output opens up once this Requirement is Complete. Answer its Questions, then confirm it Complete.'}
            </p>
          </>
        )}
        <Button size="lg" disabled={!complete} onClick={onGenerate}>
          Generate Gherkin
        </Button>
      </div>
    )
  }

  const staleNote = output.out_of_date && (
    <p id="out-of-date-note" className="text-body-sm text-status-in-progress-foreground">
      {complete
        ? 'Regenerate it to draw on the Answers since it was reopened. Copy and Download give this version until then.'
        : 'Confirm it Complete again to regenerate. Copy and Download still give this version.'}
    </p>
  )
  return (
    <GherkinOutput
      output={output}
      filename={featureFilename(requirement.title)}
      answers={answers}
      alert={alert}
      note={staleNote}
    >
      <Button
        variant="outline"
        size="lg"
        disabled={!complete}
        aria-describedby={output.out_of_date ? 'out-of-date-note' : undefined}
        onClick={onGenerate}
      >
        <RefreshCw aria-hidden="true" />
        Regenerate
      </Button>
    </GherkinOutput>
  )
}

/** On a phone, Copy and Download show only their icons so the actions fit on one row. */
const PHONE_ICON_ONLY = 'max-sm:size-10 max-sm:has-[>svg]:px-0'

function GherkinOutput({
  output,
  filename,
  answers,
  alert,
  note,
  children,
}: {
  output: Output
  filename: string
  answers: string
  alert: React.ReactNode
  note: React.ReactNode
  children: React.ReactNode
}) {
  const [copied, setCopied] = useState<'copied' | 'failed'>()
  useEffect(() => {
    if (copied !== 'copied') return
    const timer = setTimeout(() => setCopied(undefined), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () =>
    // Inside then() so a missing clipboard (an insecure context) fails like a refused one
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(output.content))
      .then(
        () => setCopied('copied'),
        () => setCopied('failed'),
      )
  return (
    <>
      <PanelHead
        badge={
          output.out_of_date && (
            <Badge variant="outline" className={cn('h-5.5 rounded-badge px-2 text-caption', statusStyles.in_progress.badge)}>
              Out of date
            </Badge>
          )
        }
        sub={
          <>
            Generated <time dateTime={output.generated_at}>{generatedAtInFull(output)}</time>
            {output.out_of_date ? ', before it was reopened' : ` · from ${answers}`}
          </>
        }
      >
        <Button variant="outline" size="lg" className={PHONE_ICON_ONLY} onClick={copy}>
          {copied === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {/* Both labels share one grid cell, so the button keeps the wider one's width */}
          <span className="grid max-sm:sr-only">
            <span aria-hidden={copied === 'copied'} className={cn('col-start-1 row-start-1', copied === 'copied' && 'invisible')}>
              Copy
            </span>
            <span aria-hidden={copied !== 'copied'} className={cn('col-start-1 row-start-1', copied !== 'copied' && 'invisible')}>
              Copied
            </span>
          </span>
        </Button>
        <Button
          variant="outline"
          size="lg"
          className={PHONE_ICON_ONLY}
          onClick={() => download(filename, output.content)}
        >
          <Download aria-hidden="true" />
          <span className="max-sm:sr-only">Download</span>
        </Button>
        {children}
        <span role="status" className="sr-only">
          {copied === 'copied' ? 'Copied the Gherkin' : ''}
        </span>
      </PanelHead>
      {note}
      {alert}
      {copied === 'failed' && (
        <p role="alert" className="text-body font-medium text-destructive">
          Couldn't copy the Gherkin. Select it and copy it yourself, or Download it.
        </p>
      )}
      <div className="overflow-hidden rounded-xl border bg-card-sunk">
        <div className="flex items-center gap-2 border-b px-3.5 py-2.5 text-[0.8125rem] text-muted-foreground">
          <span className="min-w-0 truncate font-mono">{filename}</span>
          <span className="ml-auto shrink-0 text-caption font-normal">Read-only</span>
        </div>
        <GherkinCode content={output.content} />
      </div>
    </>
  )
}

const KIND_CLASSES: Record<GherkinKind, string> = {
  keyword: 'font-semibold text-gherkin-keyword',
  title: 'font-semibold',
  step: 'text-gherkin-step',
  string: 'text-gherkin-string',
  placeholder: 'rounded-[3px] bg-gherkin-placeholder-background text-gherkin-placeholder',
  pipe: 'text-gherkin-punctuation',
  cell: 'text-gherkin-string',
  comment: 'text-gherkin-comment italic',
  narrative: 'font-medium',
  description: 'text-gherkin-comment',
}

/** The Gherkin, highlighted and with line numbers that copying leaves out. */
function GherkinCode({ content }: { content: string }) {
  const lines = tokenizeGherkin(content)
  return (
    <pre
      aria-label="Gherkin"
      className="overflow-x-auto py-3 pr-4 font-mono text-[0.8125rem] leading-5.25 [counter-reset:line]"
    >
      {lines.map((tokens, line) => (
        <span
          key={line}
          className="before:inline-block before:w-11 before:pr-4 before:text-right before:text-gherkin-punctuation before:content-[counter(line)] before:select-none before:[counter-increment:line]"
        >
          {tokens.map(({ text, kind }, i) => (
            <span key={i} className={kind && KIND_CLASSES[kind]} data-kind={kind}>
              {text}
            </span>
          ))}
          {line < lines.length - 1 || content.endsWith('\n') ? '\n' : null}
        </span>
      ))}
    </pre>
  )
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  link.click()
  // Revoked on the next task, once the click has started the download
  setTimeout(() => URL.revokeObjectURL(url))
}

function PanelHead({
  badge,
  sub,
  children,
}: {
  badge?: React.ReactNode
  sub: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2.5">
          <h3 className="text-[1.375rem] leading-snug font-semibold tracking-tight">Gherkin</h3>
          {badge}
        </div>
        <p className="text-body-sm text-muted-foreground">{sub}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
