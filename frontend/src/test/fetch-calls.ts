/**
 * Read what a test's mocked `fetch` was called with, without stringifying a
 * `Request` or non-string body into "[object Object]".
 */

/** The URL a mocked fetch was called with, exactly as passed: a path, for the app's own calls. */
export const requestTarget = (input: RequestInfo | URL) => (input instanceof Request ? input.url : input.toString())

/** The URL a mocked fetch was called with, parsed. */
export const requestUrl = (input: RequestInfo | URL) => new URL(requestTarget(input), location.origin)

/** The parsed JSON body a mocked fetch was sent; throws if the body isn't a string. */
export function requestJson(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') throw new Error('Expected a JSON string body')
  return JSON.parse(init.body)
}
