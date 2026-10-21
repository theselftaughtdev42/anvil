import { afterEach, expect, test, vi } from 'vitest'
import { api, ApiError } from '@/lib/api'

function respondWith(response: Response) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('calls paths under /api and returns the JSON body', async () => {
  const fetch = respondWith(Response.json({ status: 'ok' }))

  expect(await api<{ status: string }>('/health/live')).toEqual({ status: 'ok' })
  expect(fetch).toHaveBeenCalledWith('/api/health/live', expect.anything())
})

test('sends `json` as a JSON body', async () => {
  const fetch = respondWith(Response.json({}, { status: 201 }))

  await api('/requirements', { method: 'POST', json: { idea: 'A thing' } })

  const [, init] = fetch.mock.calls[0]
  expect(init?.body).toBe('{"idea":"A thing"}')
  expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
})

// The browser sets FormData's multipart Content-Type, so api() mustn't.
test('passes a plain body through untouched', async () => {
  const fetch = respondWith(Response.json({}, { status: 201 }))
  const form = new FormData()

  await api('/uploads', { method: 'POST', body: form })

  const [, init] = fetch.mock.calls[0]
  expect(init?.body).toBe(form)
  expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
})

// Accepts a Headers, which a plain object spread would drop.
test("sends the caller's headers over the defaults", async () => {
  const fetch = respondWith(Response.json({}))

  await api('/health/live', { headers: new Headers({ Accept: 'text/plain', 'X-Trace': '1' }) })

  const headers = new Headers(fetch.mock.calls[0][1]?.headers)
  expect(headers.get('Accept')).toBe('text/plain')
  expect(headers.get('X-Trace')).toBe('1')
})

test('returns nothing for a 204', async () => {
  respondWith(new Response(null, { status: 204 }))

  expect(await api('/requirements/1', { method: 'DELETE' })).toBeUndefined()
})

test('returns nothing for an empty 200', async () => {
  respondWith(new Response('', { status: 200, headers: { 'Content-Length': '0' } }))

  expect(await api('/requirements/1', { method: 'PUT' })).toBeUndefined()
})

test("throws the server's detail on a non-2xx response", async () => {
  respondWith(Response.json({ detail: 'database unreachable' }, { status: 503 }))

  const error = await api('/health/ready').catch((e: unknown) => e)
  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ status: 503, message: 'database unreachable' })
})

test("throws a validation error's field messages", async () => {
  respondWith(
    Response.json(
      {
        detail: [
          { type: 'missing', loc: ['body', 'idea'], msg: 'Field required', input: null },
          { type: 'json_invalid', loc: ['body', 0], msg: 'JSON decode error', input: {} },
        ],
      },
      { status: 422 },
    ),
  )

  await expect(api('/requirements', { method: 'POST', json: {} })).rejects.toMatchObject({
    status: 422,
    message: 'idea: Field required; JSON decode error',
  })
})

test('falls back to the status text when there is no usable detail', async () => {
  respondWith(new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }))

  await expect(api('/health/live')).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' })
})

// HTTP/2 has no status text, so this is the usual message in production.
test('falls back to the status code when there is no status text either', async () => {
  respondWith(new Response('<html>Bad gateway</html>', { status: 502 }))

  await expect(api('/health/live')).rejects.toMatchObject({
    status: 502,
    message: 'Request failed with status 502',
  })
})
