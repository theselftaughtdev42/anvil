import type { UseQueryResult } from '@tanstack/react-query'
import { RequirementCard } from '@/components/requirement-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  countByStatus,
  type RequirementList as RequirementListData,
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

// "Your requirements": the status tabs over a grid of cards, or the loading,
// error or empty state in place of the grid. `query` holds every Requirement;
// the tabs filter it here.
export function RequirementList({
  status,
  onStatusChange,
  query,
}: {
  status: StatusFilter
  onStatusChange: (status: StatusFilter) => void
  query: UseQueryResult<RequirementListData>
}) {
  const { data } = query
  const counts = data && countByStatus(data.items)
  const items = data && (status === 'all' ? data.items : data.items.filter((r) => r.status === status))

  return (
    <section aria-labelledby="your-requirements" className="mt-12 mb-16">
      <Tabs value={status} onValueChange={(value) => onStatusChange(value as StatusFilter)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="your-requirements" className="text-section-heading">
            Your requirements
          </h2>
          {counts && (
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
          )}
        </div>
        <TabsContent value={status} className="mt-2">
          {query.isError ? (
            <ListError onRetry={() => void query.refetch()} />
          ) : !items ? (
            <LoadingCards />
          ) : items.length === 0 ? (
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

function LoadingCards() {
  return (
    <div className={grid} aria-busy="true">
      <span className="sr-only">Loading your requirements…</span>
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i} aria-hidden="true" className="gap-3.5 rounded-card p-4.5 shadow-none">
          <div className="flex justify-between">
            <Skeleton className="h-5.5 w-20 rounded-badge bg-muted" />
            <Skeleton className="h-4 w-12 bg-muted" />
          </div>
          <Skeleton className="h-5 w-2/3 bg-muted" />
          <Skeleton className="h-10 w-full bg-muted" />
          <Skeleton className="h-1.5 w-full rounded-full bg-muted" />
          <Skeleton className="h-4 w-20 bg-muted" />
        </Card>
      ))}
    </div>
  )
}

function ListError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <p role="alert" className="text-body-sm text-muted-foreground">Couldn't load your requirements.</p>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}

// What a first visit shows instead of the list: how Refinement goes, and where
// Requirements will appear.
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
