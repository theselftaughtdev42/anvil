import { queryOptions } from '@tanstack/react-query'
import { api, retryUnlessClientError } from '@/lib/api'
import type { AnswerCreate, QuestionStack } from '@/lib/api-schema'

/** The server's limit on an Answer's length (ANSWER_MAX_LENGTH). */
export const ANSWER_MAX_LENGTH = 2000

export const questionsKey = (requirementId: string) => ['requirements', requirementId, 'questions'] as const

/** GET /api/requirements/:id/questions. Answer and Later return the stack too. */
export function questionsQuery(requirementId: string) {
  return queryOptions({
    queryKey: questionsKey(requirementId),
    queryFn: () => api<QuestionStack>(`/requirements/${requirementId}/questions`),
    retry: retryUnlessClientError,
  })
}

export function answerQuestion(requirementId: string, questionId: string, answer: string) {
  return api<QuestionStack>(`/requirements/${requirementId}/questions/${questionId}/answer`, {
    method: 'POST',
    json: { answer } satisfies AnswerCreate,
  })
}

/** Later: moves the Question to the bottom of the stack. */
export function putOffQuestion(requirementId: string, questionId: string) {
  return api<QuestionStack>(`/requirements/${requirementId}/questions/${questionId}/later`, {
    method: 'POST',
  })
}
