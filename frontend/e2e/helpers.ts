import type { Locator, Page } from '@playwright/test'

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

/**
 * How many lines tall an element is, by its line height, and whether its text
 * runs past its box (so is clipped) either way.
 */
export function measureText(locator: Locator): Promise<{ lines: number; cutAcross: boolean; cutDown: boolean }> {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el)
    const lineHeight = parseFloat(style.lineHeight)
    if (Number.isNaN(lineHeight)) throw new Error('line-height has no length')
    const height = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    return {
      lines: Math.round(height / lineHeight),
      // 1px slack: on Linux, Chromium snaps glyph widths to whole pixels, so a
      // line broken anywhere can end 1px past the box though nothing is cut.
      cutAcross: el.scrollWidth > el.clientWidth + 1,
      cutDown: el.scrollHeight > el.clientHeight,
    }
  })
}
