import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { IdeaPrompt } from '@/components/idea-prompt'
import { FirstVisit, RequirementList, type StatusFilter } from '@/components/requirement-list'
import { requirementStatuses, requirementsQuery } from '@/lib/requirements'

// The idea prompt, then the Point of Contact's Requirements, filtered by the
// `?status=` in the URL so the tab survives a refresh. One request fetches
// them all; the tabs filter in the browser. Someone with no Requirements at
// all gets the first-visit layout instead.
export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get('status')
  // Anything else in the URL, e.g. a stale link's typo, shows them all.
  const status = requirementStatuses.find((s) => s === param)
  const query = useQuery(requirementsQuery())
  // False until the list loads (or if it fails), so the list's own loading and
  // error states show first; only a loaded, empty list means a first visit.
  const firstVisit = query.data?.items.length === 0

  const changeStatus = (next: StatusFilter) => {
    setSearchParams(next === 'all' ? {} : { status: next }, { replace: true })
  }

  return (
    <>
      <IdeaPrompt showIntro={firstVisit} />
      {firstVisit ? (
        <FirstVisit />
      ) : (
        <RequirementList status={status ?? 'all'} onStatusChange={changeStatus} query={query} />
      )}
    </>
  )
}
