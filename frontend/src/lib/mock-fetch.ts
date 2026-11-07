/**
 * Read the arguments a test's mocked `fetch` was called with, without
 * stringifying a `Request` or non-string body into "[object Object]".
 */

/** The URL a mocked fetch was called with. */
export const requestUrl = (input: RequestInfo | URL) =>
  new URL(input instanceof Request ? input.url : input, location.origin)

/** The path and query a mocked fetch was called with, as the app passes them. */
export function requestPath(input: RequestInfo | URL) {
  const url = requestUrl(input)
  return url.pathname + url.search
}

/** The parsed JSON body a mocked fetch was sent; throws if the body isn't a string. */
export function requestJson(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') throw new Error('Expected a JSON string body')
  return JSON.parse(init.body)
}
