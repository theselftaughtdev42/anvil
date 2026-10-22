import type { Page } from '@playwright/test'

/**
 * What the browser resolves a CSS colour to, e.g. `var(--primary)` or
 * `#E8642C`. Comparing resolved values ignores how each was written.
 */
export function resolveColour(page: Page, colour: string): Promise<string> {
  return page.evaluate((colour) => {
    const probe = document.createElement('div')
    probe.style.color = colour
    document.body.append(probe)
    const resolved = getComputedStyle(probe).color
    probe.remove()
    return resolved
  }, colour)
}
