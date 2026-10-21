import { queryOptions } from '@tanstack/react-query'
import { api, retryUnlessClientError } from '@/lib/api'

/** The server's limit on an Answer's length (ANSWER_MAX_LENGTH). */
export const ANSWER_MAX_LENGTH = 2000

/** A Question still to answer, as the API returns it (OpenQuestion). */
export interface OpenQuestion {
  id: string
  topic: string
  text: string
  why: string | null
  suggestions: string[]
  /** The "#3" on the card: its order of creation within the Requirement. */
  number: number
}

export interface AnsweredQuestion {
  id: string
  topic: string
  text: string
  answer: string
  number: number
}

/** GET /api/requirements/:id/questions. Answer and Later return it too. */
export interface QuestionStack {
  /** Top of the stack first. */
  open: OpenQuestion[]
  /** In the order they were answered. */
  answered: AnsweredQuestion[]
  exhausted: boolean
}

export const questionsKey = (requirementId: string) => ['requirements', requirementId, 'questions'] as const

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
    json: { answer },
  })
}

/** Later: moves the Question to the bottom of the stack. */
export function putOffQuestion(requirementId: string, questionId: string) {
  return api<QuestionStack>(`/requirements/${requirementId}/questions/${questionId}/later`, {
    method: 'POST',
  })
}
