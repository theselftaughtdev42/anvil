import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { IdeaPrompt } from '@/components/idea-prompt'
import { FirstVisit, ListError, ListLoading, RequirementList, type StatusFilter } from '@/components/requirement-list'
import { requirementStatuses, requirementsQuery } from '@/lib/requirements'

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get('status')
  // Anything else in the URL, e.g. a stale link's typo, shows them all.
  const status = requirementStatuses.find((s) => s === param)
  const query = useQuery(requirementsQuery())

  const changeStatus = (next: StatusFilter) => {
    setSearchParams(next === 'all' ? {} : { status: next }, { replace: true })
  }

  if (query.isPending) return <ListLoading />
  if (query.isError) return <ListError onRetry={() => void query.refetch()} />
  const firstVisit = query.data.items.length === 0

  return (
    <>
      <IdeaPrompt showIntro={firstVisit} />
      {firstVisit ? (
        <FirstVisit />
      ) : (
        <RequirementList status={status ?? 'all'} onStatusChange={changeStatus} requirements={query.data.items} />
      )}
    </>
  )
}
