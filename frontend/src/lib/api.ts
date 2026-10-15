// The one place the API's base URL is set. Relative, so in dev calls go
// through Vite's `/api` proxy, and in production they hit the same origin.
const API_BASE = '/api'

// A non-2xx response. `message` is the server's `detail` when it sent a
// string one, otherwise the status text.
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

async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (
      typeof body === 'object' &&
      body !== null &&
      'detail' in body &&
      typeof body.detail === 'string'
    ) {
      return body.detail
    }
  } catch {
    // Not JSON, e.g. a proxy's HTML error page
  }
  return response.statusText || `Request failed with status ${response.status}`
}
