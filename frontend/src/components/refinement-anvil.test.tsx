import { afterEach, expect, test } from 'vitest'
import { commands } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { RefinementAnvil } from '@/components/refinement-anvil'

declare module 'vitest/browser' {
  interface BrowserCommands {
    setReducedMotion: (reduce: boolean) => Promise<void>
  }
}

afterEach(() => commands.setReducedMotion(false))

const parts = (container: HTMLElement) => {
  const anvil = container.querySelector<HTMLElement>('.refinement-anvil')!
  return {
    anvil,
    burst: anvil.querySelector('.burst')!,
    heat: anvil.querySelector('.heat')!,
    billet: anvil.querySelector('.billet')!,
    sparks: [...anvil.querySelectorAll('.sp')],
  }
}

test('the anvil is decorative', async () => {
  const { container } = await render(<RefinementAnvil />)
  expect(parts(container).anvil).toHaveAttribute('aria-hidden', 'true')
})

test('at rest the sparks drift and the face and billet breathe, with no strike', async () => {
  const { container } = await render(<RefinementAnvil />)
  const { burst, heat, billet, sparks } = parts(container)
  expect(sparks.map((s) => getComputedStyle(s).animationName)).toEqual(Array(3).fill('anvil-drift'))
  expect(sparks.map((s) => getComputedStyle(s).animationDuration)).toEqual(['6s', '7.2s', '8.4s'])
  expect(getComputedStyle(heat).animationName).toBe('anvil-heat')
  expect(getComputedStyle(billet).animationName).toBe('anvil-glow')
  expect(getComputedStyle(burst).animationName).toBe('none')
})

// The browser only restarts an animation when its name changes, so each strike must swap it.
test('striking twice in a row plays the strike twice', async () => {
  const screen = await render(<RefinementAnvil strike={0} />)
  const { burst, heat, billet } = parts(screen.container)
  const names = () => [burst, heat, billet].map((el) => getComputedStyle(el).animationName)

  await screen.rerender(<RefinementAnvil strike={1} />)
  const first = names()
  expect(first[0]).toMatch(/^anvil-strike-/)
  expect(first[1]).toMatch(/^anvil-flash-.+, anvil-heat$/)
  expect(first[2]).toMatch(/^anvil-squash-.+, anvil-glow$/)

  await screen.rerender(<RefinementAnvil strike={2} />)
  const second = names()
  second.forEach((name, i) => expect(name).not.toBe(first[i]))
})

test('with reduced motion the anvil is still and the sparks sit at their resting opacity', async () => {
  await commands.setReducedMotion(true)
  const { container } = await render(<RefinementAnvil strike={1} />)
  const { burst, heat, billet, sparks } = parts(container)
  for (const el of [burst, heat, billet, ...sparks]) expect(getComputedStyle(el).animationName).toBe('none')
  expect(sparks.map((s) => getComputedStyle(s).opacity)).toEqual(['0.9', '0.6', '0.45'])
  expect(getComputedStyle(heat).opacity).toBe('0.45')
})

test('striking does not shift the layout', async () => {
  const screen = await render(<RefinementAnvil />)
  const { anvil } = parts(screen.container)
  const before = anvil.getBoundingClientRect().toJSON()
  expect(before).toMatchObject({ width: 64, height: 50 })

  await screen.rerender(<RefinementAnvil strike={1} />)
  expect(anvil.getBoundingClientRect().toJSON()).toEqual(before)
})
