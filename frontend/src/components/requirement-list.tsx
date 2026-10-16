import { LoaderCircle } from 'lucide-react'
import { RequirementCard } from '@/components/requirement-card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  countByStatus,
  type Requirement,
  type RequirementStatus,
  requirementStatuses,
  statusLabels,
} from '@/lib/requirements'

export type StatusFilter = RequirementStatus | 'all'

const tabs: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...requirementStatuses.map((status) => ({ value: status, label: statusLabels[status] })),
]

const grid = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'

// "Your requirements": the status tabs over a grid of cards, or the empty
// state in place of the grid. `requirements` holds every Requirement; the tabs
// filter it here.
export function RequirementList({
  status,
  onStatusChange,
  requirements,
}: {
  status: StatusFilter
  onStatusChange: (status: StatusFilter) => void
  requirements: Requirement[]
}) {
  const counts = countByStatus(requirements)
  const items = status === 'all' ? requirements : requirements.filter((r) => r.status === status)

  return (
    <section aria-labelledby="your-requirements" className="mt-12 mb-16">
      <Tabs value={status} onValueChange={(value) => onStatusChange(value as StatusFilter)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="your-requirements" className="text-section-heading">
            Your requirements
          </h2>
          <TabsList
            aria-label="Filter by status"
            className="h-9 max-w-full justify-start overflow-x-auto"
          >
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex-none px-2.5 text-body-sm sm:px-3 font-medium data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-background"
              >
                {tab.label}{' '}
                <span className="text-caption font-normal text-muted-foreground">
                  {counts[tab.value]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value={status} className="mt-2">
          {items.length === 0 ? (
            <p className="py-8 text-center text-body-sm text-muted-foreground">
              {status === 'all'
                ? 'No requirements yet.'
                : `No ${statusLabels[status].toLowerCase()} requirements yet.`}
            </p>
          ) : (
            <ul className={grid}>
              {items.map((requirement) => (
                <li key={requirement.id} className="grid">
                  <RequirementCard requirement={requirement} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </section>
  )
}

// What the home page shows in place of everything below the header when the
// list won't load: if the API is down, an idea couldn't be submitted either.
export function ListError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p role="alert" className="text-body-sm text-muted-foreground">Couldn't load your requirements.</p>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}

export function ListLoading() {
  return (
    <div role="status" className="mt-12 mb-16 flex justify-center py-8 text-muted-foreground">
      <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
      <span className="sr-only">Loading your requirements…</span>
    </div>
  )
}

export function FirstVisit() {
  return (
    <section className="mx-auto mt-10 mb-16 flex max-w-180 flex-col items-center gap-2 rounded-card border border-dashed border-muted-foreground/30 px-6 py-8 text-center text-body-sm text-muted-foreground">
      <ol className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {['Describe your idea', "Answer Anvil's questions", 'Get a clear requirement'].map(
          (step, i) => (
            <li key={step}>
              <span className="font-semibold text-foreground">{i + 1}.</span> {step}
            </li>
          ),
        )}
      </ol>
      <p>Your requirements will appear here.</p>
    </section>
  )
}
