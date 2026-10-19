// The one place the API's base URL is set. Relative, so in dev calls go
// through Vite's `/api` proxy, and in production they hit the same origin.
const API_BASE = '/api'

// A non-2xx response. `message` is the server's `detail` (a validation
// error's field messages, joined), otherwise the status text, otherwise the
// status code.
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// Calls `path` under the API and returns its JSON body, typed as `T`. JSON
// bodies are sent with `json`; throws ApiError on a non-2xx response.
export async function api<T>(
  path: `/${string}`,
  { json, headers, ...init }: RequestInit & { json?: unknown } = {},
): Promise<T> {
  // `headers` may be a Headers or [name, value] pairs, which don't spread, so
  // read it through Headers. The caller's headers win over the defaults.
  const requestHeaders = new Headers(headers)
  if (!requestHeaders.has('Accept')) requestHeaders.set('Accept', 'application/json')
  if (json !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }
  const response = await fetch(API_BASE + path, {
    ...init,
    headers: requestHeaders,
    body: json === undefined ? init.body : JSON.stringify(json),
  })
  if (!response.ok) {
    throw new ApiError(response.status, await errorMessage(response))
  }
  // 204 No Content and friends have no body to parse.
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T
  }
  return (await response.json()) as T
}

// For a query's `retry`: a 4xx won't fix itself, so only retry the rest, up
// to three times.
export function retryUnlessClientError(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
  return failureCount < 3
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const message = detailMessage(body.detail)
      if (message) return message
    }
  } catch {
    // Not JSON, e.g. a proxy's HTML error page
  }
  return response.statusText || `Request failed with status ${response.status}`
}

// FastAPI's `detail` is a string, except when a request fails validation
// (422): then it's a list of field errors, each with a `loc` and a `msg`.
function detailMessage(detail: unknown): string | undefined {
  if (typeof detail === 'string') return detail
  if (!Array.isArray(detail)) return undefined
  const messages = detail.flatMap(fieldErrorMessage)
  return messages.length > 0 ? messages.join('; ') : undefined
}

// One field error as "idea: Field required", or just its `msg` when its
// `loc` doesn't end in a field name.
function fieldErrorMessage(error: unknown): string[] {
  if (typeof error !== 'object' || error === null) return []
  if (!('msg' in error) || typeof error.msg !== 'string') return []
  const field = 'loc' in error && Array.isArray(error.loc) ? error.loc.at(-1) : undefined
  return [typeof field === 'string' ? `${field}: ${error.msg}` : error.msg]
}
