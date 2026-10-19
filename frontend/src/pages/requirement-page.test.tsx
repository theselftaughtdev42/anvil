import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { AnsweredQuestion, OpenQuestion, QuestionStack } from '@/lib/questions'
import type { Requirement } from '@/lib/requirements'
import { routes } from '@/routes'

const ID = 'req-1'

// Like the stub agent: batches of three, then nothing more to ask.
const BANK = [
  { topic: "Who it's for", text: 'Who will use this most?', why: 'It shapes what good looks like.', suggestions: ['Customers', 'Our own staff', 'Both'] },
  { topic: 'The problem', text: 'What happens today, without it?', why: null, suggestions: ['By hand', 'Ask someone', 'Nothing'] },
  { topic: 'Success', text: 'How will you know it works?', why: 'A clear sign of success.', suggestions: ['Fewer requests', 'No help needed', 'A number goes up'] },
  { topic: 'Edge cases', text: 'What should happen when it goes wrong?', why: null, suggestions: ['Retry', 'Fall back', 'Tell someone'] },
]
const BATCH = 3

// Stands in for the Refinement API, with the server's rules: the first Answer
// moves a Draft to In progress, Later sends a card to the bottom, and
// answering the last open card deals the next batch, or exhausts the stack.
// `fail` can answer a request instead, and `hold` can delay one until it settles.
function serveRefinement({
  fail,
  hold,
}: {
  fail?: (url: URL) => Promise<Response> | undefined
  hold?: (url: URL) => Promise<void> | undefined
} = {}) {
  let next = 0
  let open: OpenQuestion[] = []
  const answered: AnsweredQuestion[] = []
  let exhausted = false
  const requirement: Requirement = {
    id: ID,
    title: 'Route change alerts',
    idea: 'Drivers see route changes on their phone.',
    status: 'draft',
    created_at: '2026-10-15T12:00:00Z',
    updated_at: new Date().toISOString(),
    progress: null,
  }
  const deal = () => {
    const batch = BANK.slice(next, next + BATCH)
    if (batch.length === 0) exhausted = true
    open.push(...batch.map((q, i) => ({ ...q, id: `q${next + i + 1}`, number: next + i + 1 })))
    next += batch.length
  }
  deal()
  const stack = (): QuestionStack => ({ open: [...open], answered: [...answered], exhausted })

  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input), location.origin)
    await hold?.(url)
    const failure = fail?.(url)
    if (failure) return failure
    const path = url.pathname
    if (path === '/api/config') return Response.json({ idea_placeholder: 'An idea' })
    const withProgress = () => ({
      ...requirement,
      progress: { answered: answered.length, total: answered.length + open.length },
    })
    if (path === '/api/requirements') return Response.json({ items: [withProgress()] })
    if (path === `/api/requirements/${ID}`) return Response.json(withProgress())
    if (path === `/api/requirements/${ID}/questions`) return Response.json(stack())
    const action = path.match(/^\/api\/requirements\/req-1\/questions\/(\w+)\/(answer|later)$/)
    if (action) {
      const [, questionId, verb] = action
      const question = open.find((q) => q.id === questionId)
      if (!question) return Response.json({ detail: "Question isn't open" }, { status: 409 })
      open = open.filter((q) => q !== question)
      if (verb === 'later') {
        open.push(question)
      } else {
        const { answer } = JSON.parse(String(init?.body)) as { answer: string }
        answered.push({ id: question.id, topic: question.topic, text: question.text, number: question.number, answer })
        if (requirement.status === 'draft') requirement.status = 'in_progress'
        if (open.length === 0) deal()
      }
      return Response.json(stack())
    }
    return Response.json({ detail: 'Requirement not found' }, { status: 404 })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

async function renderPage(path = `/requirements/${ID}`) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const screen = await render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  const card = () => screen.getByRole('region', { name: /\?$/ })
  return {
    screen,
    router,
    card,
    question: (name: string) => screen.getByRole('heading', { level: 2, name }),
    answerButton: () => screen.getByRole('button', { name: 'Answer' }),
    laterButton: () => screen.getByRole('button', { name: 'Later' }),
    ownWords: () => screen.getByRole('textbox', { name: 'Your own answer' }),
    suggestion: (name: string) => screen.getByRole('radio', { name }),
    answeredPile: () => screen.getByRole('region', { name: /^Answered/ }),
    inTheStack: () => screen.getByRole('region', { name: /^In the stack/ }),
  }
}

type Page = Awaited<ReturnType<typeof renderPage>>

const anvilClass = () => document.querySelector('.refinement-anvil')!.className
const marks = () => [...document.querySelectorAll('[data-testid=progress-marks] > *')].map((m) => m.getAttribute('data-mark'))

async function pickAndAnswer(page: Page, question: string, suggestion: string) {
  await expect.element(page.question(question)).toBeVisible()
  await page.suggestion(suggestion).click()
  await page.answerButton().click()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('the header shows the title, and the top card its Question', async () => {
  serveRefinement()
  const page = await renderPage()

  const banner = page.screen.getByRole('banner')
  await expect.element(banner.getByRole('heading', { level: 1, name: 'Route change alerts' })).toBeVisible()

  await expect.element(page.question('Who will use this most?')).toBeVisible()
  await expect.element(page.card()).toMatchTextContent(/who it's for/i)
  await expect.element(page.card()).toMatchTextContent('#1')
  await expect.element(page.card()).toMatchTextContent('It shapes what good looks like.')
  await expect.element(page.screen.getByText('Question 1 of about 3')).toBeVisible()
  expect(marks()).toEqual(['current', 'to-come', 'to-come'])
  await expect.element(page.inTheStack()).toMatchTextContent(/In the stack · 2/i)
  await expect.element(page.inTheStack()).toMatchTextContent('Anvil deals new cards as your answers raise new questions.')
  expect(document.querySelectorAll('[data-testid=card-under]')).toHaveLength(2)
})

test('screen readers get the Question as the card heading and the suggestions as a radio group', async () => {
  serveRefinement()
  const page = await renderPage()

  await expect.element(page.screen.getByRole('region', { name: 'Who will use this most?' })).toBeVisible()
  const group = page.screen.getByRole('radiogroup', { name: 'Suggested answers' })
  await expect.element(group).toBeVisible()
  expect(group.getByRole('radio').elements()).toHaveLength(3)
  await expect.element(page.suggestion('Customers')).toHaveAttribute('aria-checked', 'false')
  await page.suggestion('Customers').click()
  await expect.element(page.suggestion('Customers')).toHaveAttribute('aria-checked', 'true')
})

test('answering shows the next card, adds to the pile, advances the marks and strikes the anvil', async () => {
  serveRefinement()
  const page = await renderPage()
  await expect.element(page.question('Who will use this most?')).toBeVisible()
  expect(anvilClass()).not.toMatch(/hit-/)

  await pickAndAnswer(page, 'Who will use this most?', 'Our own staff')

  await expect.element(page.question('What happens today, without it?')).toBeVisible()
  await expect.element(page.answeredPile()).toMatchTextContent(/Answered · 1/i)
  await expect.element(page.answeredPile()).toMatchTextContent('Who will use this most?')
  await expect.element(page.answeredPile()).toMatchTextContent('Our own staff')
  await expect.element(page.screen.getByText('Question 2 of about 3')).toBeVisible()
  expect(marks()).toEqual(['answered', 'current', 'to-come'])
  expect(anvilClass()).toMatch(/hit-a/)
  // The new card starts with nothing picked.
  await expect.element(page.suggestion('By hand')).toHaveAttribute('aria-checked', 'false')

  await pickAndAnswer(page, 'What happens today, without it?', 'By hand')
  await expect.element(page.question('How will you know it works?')).toBeVisible()
  expect(anvilClass()).toMatch(/hit-b/)
})

test('the Answered pile shows the latest four, newest first', async () => {
  serveRefinement()
  const page = await renderPage()
  await pickAndAnswer(page, 'Who will use this most?', 'Customers')
  await pickAndAnswer(page, 'What happens today, without it?', 'By hand')
  await pickAndAnswer(page, 'How will you know it works?', 'Fewer requests')
  await pickAndAnswer(page, 'What should happen when it goes wrong?', 'Retry')

  await expect.element(page.answeredPile()).toMatchTextContent(/Answered · 4/i)
  const items = page.answeredPile().getByRole('listitem')
  expect(items.elements().map((el) => el.textContent)).toEqual([
    expect.stringContaining('Retry'),
    expect.stringContaining('Fewer requests'),
    expect.stringContaining('By hand'),
    expect.stringContaining('Customers'),
  ])
})

test('Later sends the card to the bottom, and it comes back after the others', async () => {
  serveRefinement()
  const page = await renderPage()
  await expect.element(page.question('Who will use this most?')).toBeVisible()

  await page.laterButton().click()

  await expect.element(page.question('What happens today, without it?')).toBeVisible()
  await expect.element(page.inTheStack()).toMatchTextContent(/success.*who it's for/i)
  expect(anvilClass()).not.toMatch(/hit-/)
  await pickAndAnswer(page, 'What happens today, without it?', 'By hand')
  await pickAndAnswer(page, 'How will you know it works?', 'Fewer requests')
  await expect.element(page.question('Who will use this most?')).toBeVisible()
})

test('your own words take priority over a picked suggestion', async () => {
  const fetch = serveRefinement()
  const page = await renderPage()
  await expect.element(page.question('Who will use this most?')).toBeVisible()

  await page.suggestion('Customers').click()
  await page.ownWords().fill('  Depot managers  ')
  await page.answerButton().click()

  await expect.element(page.answeredPile()).toMatchTextContent('Depot managers')
  await expect.element(page.answeredPile()).not.toMatchTextContent('Customers')
  const answer = fetch.mock.calls.find(([input]) => String(input).endsWith('/answer'))
  expect(JSON.parse(String(answer![1]!.body))).toEqual({ answer: 'Depot managers' })
})

test('Answer does nothing with nothing picked or typed', async () => {
  const fetch = serveRefinement()
  const page = await renderPage()
  await expect.element(page.question('Who will use this most?')).toBeVisible()

  await page.ownWords().fill('   ')
  await page.answerButton().click()

  expect(fetch.mock.calls.some(([input]) => String(input).endsWith('/answer'))).toBe(false)
  await expect.element(page.question('Who will use this most?')).toBeVisible()
})

test('while an Answer is sending the buttons are busy, not disabled, and ignore clicks', async () => {
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  const fetch = serveRefinement({ hold: (url) => (url.pathname.endsWith('/answer') ? held : undefined) })
  const page = await renderPage()
  await pickAndAnswer(page, 'Who will use this most?', 'Both')

  await expect.element(page.answerButton()).toHaveAttribute('aria-busy', 'true')
  await expect.element(page.laterButton()).toHaveAttribute('aria-busy', 'true')
  await expect.element(page.answerButton()).toBeEnabled()
  await expect.element(page.laterButton()).toBeEnabled()
  await page.answerButton().click()
  await page.laterButton().click()
  release()

  await expect.element(page.question('What happens today, without it?')).toBeVisible()
  await expect.element(page.answerButton()).toHaveAttribute('aria-busy', 'false')
  const actions = fetch.mock.calls.filter(([input]) => /\/(answer|later)$/.test(String(input)))
  expect(actions).toHaveLength(1)
})

test('a failed Answer says so on the card, and keeps what was picked', async () => {
  let failing = true
  serveRefinement({
    fail: (url) =>
      failing && url.pathname.endsWith('/answer')
        ? Promise.resolve(Response.json({ detail: 'boom' }, { status: 503 }))
        : undefined,
  })
  const page = await renderPage()
  await pickAndAnswer(page, 'Who will use this most?', 'Both')

  await expect.element(page.screen.getByRole('alert')).toMatchTextContent("Couldn't save your answer. Try again.")
  await expect.element(page.suggestion('Both')).toHaveAttribute('aria-checked', 'true')
  failing = false
  await page.answerButton().click()
  await expect.element(page.question('What happens today, without it?')).toBeVisible()
  await expect.element(page.screen.getByRole('alert')).not.toBeInTheDocument()
})

test('answering the last Question ends on the "no more questions" card, keeping the pile', async () => {
  serveRefinement()
  const page = await renderPage()
  await pickAndAnswer(page, 'Who will use this most?', 'Customers')
  await pickAndAnswer(page, 'What happens today, without it?', 'By hand')
  // Answering the last open card deals the next batch: one more here.
  await pickAndAnswer(page, 'How will you know it works?', 'Fewer requests')
  await expect.element(page.screen.getByText('Question 4 of about 4')).toBeVisible()
  await pickAndAnswer(page, 'What should happen when it goes wrong?', 'Retry')

  await expect.element(page.screen.getByRole('heading', { name: 'Anvil has no more questions for now' })).toBeVisible()
  await expect.element(page.screen.getByText('No more questions', { exact: true })).toBeVisible()
  await expect.element(page.screen.getByText('All 4 answered')).toBeVisible()
  expect(marks()).toEqual(Array(4).fill('answered'))
  await expect.element(page.screen.getByRole('button', { name: 'Answer' })).not.toBeInTheDocument()
  await expect.element(page.screen.getByRole('button', { name: 'Later' })).not.toBeInTheDocument()
  await expect.element(page.answeredPile()).toMatchTextContent(/Answered · 4/i)
  await expect.element(page.inTheStack()).toMatchTextContent(/In the stack · 0/i)
})

test('the home page shows the Requirement as In progress after its first Answer', async () => {
  serveRefinement()
  const page = await renderPage('/')
  await expect.element(page.screen.getByRole('listitem').first()).toMatchTextContent('Draft')
  await page.screen.getByRole('link', { name: 'Route change alerts' }).click()

  await pickAndAnswer(page, 'Who will use this most?', 'Customers')
  await expect.element(page.answeredPile()).toMatchTextContent('Customers')
  await page.router.navigate('/')

  const card = page.screen.getByRole('listitem').first()
  await expect.element(card).toMatchTextContent('In progress')
  await expect.element(card).toMatchTextContent('1 of 3 questions answered')
})

test('a spinner shows while the requirement loads', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(() => new Promise(() => {})))
  const page = await renderPage()

  await expect.element(page.screen.getByRole('status')).toMatchTextContent('Loading the requirement…')
  await expect.element(page.screen.getByRole('button', { name: 'Answer' })).not.toBeInTheDocument()
})

test('a failure to load shows a message, and Retry loads the stack', async () => {
  let failing = true
  serveRefinement({
    fail: (url) =>
      failing && url.pathname.endsWith('/questions')
        ? Promise.resolve(Response.json({ detail: 'down' }, { status: 503 }))
        : undefined,
  })
  const page = await renderPage()

  await expect.element(page.screen.getByRole('alert')).toMatchTextContent("Couldn't load this requirement.")
  failing = false
  await page.screen.getByRole('button', { name: 'Retry' }).click()
  await expect.element(page.question('Who will use this most?')).toBeVisible()
})

test.each(['/requirements/missing', '/requirements/not-a-uuid'])('%s shows the not-found page', async (path) => {
  serveRefinement({
    fail: (url) =>
      url.pathname.endsWith('not-a-uuid') || url.pathname.endsWith('not-a-uuid/questions')
        ? Promise.resolve(Response.json({ detail: [{ loc: ['path', 'requirement_id'], msg: 'Input should be a valid UUID' }] }, { status: 422 }))
        : undefined,
  })
  const page = await renderPage(path)

  await expect.element(page.screen.getByRole('heading', { name: "Nothing's on the anvil here" })).toBeVisible()
  await expect.element(page.screen.getByText('404 · Requirement not found')).toBeVisible()
})
