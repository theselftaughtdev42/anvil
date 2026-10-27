import { useIsMutating, useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { Crumb } from '@/components/app-shell'
import { NoMoreQuestionsCard, QuestionCard, ShortcutHint } from '@/components/question-card'
import { RequirementProject } from '@/components/requirement-project'
import { StatusBadge } from '@/components/status-badge'
import { AnsweredPile, NextInStack, RefinementProgress } from '@/components/refinement-panels'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import type { QuestionStack } from '@/lib/api-schema'
import { answerQuestion, putOffQuestion, questionsKey, questionsQuery } from '@/lib/questions'
import {
  changeProjectKey,
  isProjectLocked,
  type Requirement,
  requirementKey,
  requirementQuery,
  requirementsKey,
} from '@/lib/requirements'
import { NotFoundPage } from '@/pages/not-found-page'

/** How many cards peek out under the top one. */
const CARDS_UNDER = 2

/** A malformed id is a 422, which means the same as a 404 here. */
const isNotFound = (error: Error | null) =>
  error instanceof ApiError && (error.status === 404 || error.status === 422)

/**
 * Refinement: the Requirement's Questions as a stack of cards, answered one at a time.
 */
export function RequirementPage() {
  const { id = '' } = useParams()
  const requirement = useQuery(requirementQuery(id))
  const stack = useQuery(questionsQuery(id))
  // Its Questions are swapped for new ones, asked with the new Project Context.
  const changingProject = useIsMutating({ mutationKey: changeProjectKey(id) }) > 0
  const lastChange = useMutationState({
    filters: { mutationKey: changeProjectKey(id) },
    select: (mutation) => mutation.state.status,
  }).at(-1)

  if (isNotFound(requirement.error) || isNotFound(stack.error)) {
    return (
      <NotFoundPage
        label="Requirement not found"
        message="There's no requirement at this address. The link may be mistyped."
      />
    )
  }

  const retry = () => {
    if (requirement.isError) void requirement.refetch()
    if (stack.isError) void stack.refetch()
  }

  return (
    <>
      {requirement.data && (
        <div className="flex items-center justify-between gap-3 pt-4 sm:hidden">
          <RequirementMeta requirement={requirement.data} />
        </div>
      )}
      {/* Once it's locked, there's nothing to try again */}
      {lastChange === 'error' && requirement.data && !isProjectLocked(requirement.data) && (
        <p role="alert" className="pt-6 text-center text-body-sm text-destructive">
          Couldn't change the Project. Try again.
        </p>
      )}
      {requirement.isError || stack.isError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p role="alert" className="text-body-sm text-muted-foreground">
            Couldn't load this requirement.
          </p>
          <Button variant="outline" onClick={retry}>
            Retry
          </Button>
        </div>
      ) : changingProject ? (
        <div role="status" className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
          <span className="text-body-sm">Asking new Questions for this Project…</span>
        </div>
      ) : requirement.isPending || stack.isPending ? (
        <div role="status" className="flex justify-center py-24 text-muted-foreground">
          <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading the requirement…</span>
        </div>
      ) : (
        <Refinement requirementId={id} stack={stack.data} />
      )}
    </>
  )
}

/**
 * The Requirement's title, Project and status, once it loads. A phone only
 * has room for the title, so the page shows the rest there.
 */
export function RequirementCrumb({ id }: { id: string }) {
  const { data } = useQuery(requirementQuery(id))
  if (!data) return null
  return (
    <>
      <Crumb>{data.title}</Crumb>
      <div className="flex shrink-0 items-center gap-3 max-sm:hidden">
        <RequirementMeta requirement={data} />
      </div>
    </>
  )
}

function RequirementMeta({ requirement }: { requirement: Requirement }) {
  return (
    <>
      <RequirementProject requirement={requirement} />
      <StatusBadge status={requirement.status} className="shrink-0" />
    </>
  )
}

function Refinement({ requirementId, stack }: { requirementId: string; stack: QuestionStack }) {
  const queryClient = useQueryClient()
  // Bumped on every Answer, to strike the anvil.
  const [strikes, setStrikes] = useState(0)

  const onStack = (next: QuestionStack) => queryClient.setQueryData(questionsKey(requirementId), next)
  // The Question was answered or put off elsewhere: show the stack as it is now.
  const onError = (error: Error) => {
    if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
      void queryClient.invalidateQueries({ queryKey: questionsKey(requirementId) })
    }
  }

  // Answer and Later share the stack's key, so the Project menu can wait for them.
  const answer = useMutation({
    mutationKey: questionsKey(requirementId),
    mutationFn: ({ questionId, text }: { questionId: string; text: string }) =>
      answerQuestion(requirementId, questionId, text),
    onSuccess: (next) => {
      onStack(next)
      setStrikes((n) => n + 1)
      // Locks the Project now, not once the Requirement reloads, so the menu
      // can't be picked from in between.
      queryClient.setQueryData(requirementQuery(requirementId).queryKey, (r) =>
        r?.status === 'draft' ? { ...r, status: 'in_progress' as const } : r,
      )
      // The first Answer moves it to In progress, and every Answer changes its
      // progress and when it was last updated.
      void queryClient.invalidateQueries({ queryKey: requirementKey(requirementId), exact: true })
      void queryClient.invalidateQueries({ queryKey: requirementsKey, exact: true })
    },
    onError,
  })
  const later = useMutation({
    mutationKey: questionsKey(requirementId),
    mutationFn: (questionId: string) => putOffQuestion(requirementId, questionId),
    onSuccess: onStack,
    onError,
  })

  const top = stack.open.at(0)
  const busy = answer.isPending ? 'answer' : later.isPending ? 'later' : false
  // Only the card that failed shows the error.
  const error =
    answer.isError && answer.variables.questionId === top?.id
      ? "Couldn't save your answer. Try again."
      : later.isError && later.variables === top?.id
        ? "Couldn't move this card. Try again."
        : undefined

  return (
    <div className="flex flex-col gap-7 pt-9 pb-14">
      <RefinementProgress answered={stack.answered.length} open={stack.open.length} strike={strikes} />
      <div className="mx-auto grid w-full max-w-135 items-start gap-10 lg:max-w-none lg:grid-cols-[minmax(0,1fr)_minmax(0,33.75rem)_minmax(0,1fr)]">
        <AnsweredPile answered={stack.answered} className="order-2 lg:order-none lg:pt-2" />
        <div data-testid="stack" className="relative order-1 min-w-0 pb-19 lg:order-none">
          {top ? (
            <>
              {stack.open.slice(1, 1 + CARDS_UNDER).map((question, i) => (
                <div
                  key={question.id}
                  aria-hidden="true"
                  data-testid="card-under"
                  className={
                    i === 0
                      ? 'absolute inset-x-0 top-0 bottom-19 z-2 origin-bottom translate-y-3.5 scale-[0.955] rounded-question border bg-card'
                      : 'absolute inset-x-0 top-0 bottom-19 z-1 origin-bottom translate-y-7 scale-[0.91] rounded-question border bg-card-sunk'
                  }
                />
              ))}
              <QuestionCard
                key={top.id}
                question={top}
                busy={busy}
                error={error}
                onAnswer={(text) => answer.mutate({ questionId: top.id, text })}
                onLater={() => later.mutate(top.id)}
              />
              <ShortcutHint className="absolute inset-x-0 bottom-0 pointer-coarse:hidden" />
            </>
          ) : (
            <NoMoreQuestionsCard />
          )}
        </div>
        <NextInStack open={stack.open} className="order-3 lg:order-none lg:pt-2" />
      </div>
    </div>
  )
}
