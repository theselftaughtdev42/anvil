import { CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { Requirement } from '@/lib/requirements'
import { generatedAt, type Output } from '@/lib/outputs'
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
  const summary = generating ? 'Generating…' : output ? `Generated ${generatedAt(output)}` : 'Not generated yet'
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
          <small className="text-caption font-normal text-muted-foreground">{summary}</small>
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
                : 'Only a Complete Requirement can generate an Output. Confirm it Complete first.'}
            </p>
          </>
        )}
        <Button size="lg" disabled={!complete} onClick={onGenerate}>
          Generate Gherkin
        </Button>
      </div>
    )
  }

  return (
    <>
      <PanelHead sub={`Generated ${generatedAt(output)}`}>
        <Button variant="outline" size="lg" disabled={!complete} onClick={onGenerate}>
          <RefreshCw aria-hidden="true" />
          Regenerate
        </Button>
      </PanelHead>
      {alert}
      <pre
        aria-label="Gherkin"
        className="overflow-x-auto rounded-xl border bg-card-sunk px-4 py-3 font-mono text-[0.8125rem] leading-5.25"
      >
        {output.content}
      </pre>
    </>
  )
}

function PanelHead({ sub, children }: { sub: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h3 className="text-[1.375rem] leading-snug font-semibold tracking-tight">Gherkin</h3>
        <p className="text-body-sm text-muted-foreground">{sub}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
