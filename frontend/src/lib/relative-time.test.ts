import { expect, test } from 'vitest'
import { relativeTime } from '@/lib/relative-time'

const now = new Date('2026-10-15T12:00:00Z')
const ago = (ms: number) => relativeTime(new Date(now.getTime() - ms), now)

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

test.each([
  [0, 'Just now'],
  [59_000, 'Just now'],
  [-5 * minute, 'Just now'],
  [minute, '1m ago'],
  [59 * minute, '59m ago'],
  [hour, '1h ago'],
  [2 * hour, '2h ago'],
  [23 * hour, '23h ago'],
  [day, 'Yesterday'],
  [47 * hour, 'Yesterday'],
  [2 * day, '2d ago'],
  [6 * day, '6d ago'],
  [7 * day, '1w ago'],
  [21 * day, '3w ago'],
  [29 * day, '4w ago'],
  [30 * day, '1mo ago'],
  [364 * day, '12mo ago'],
  [365 * day, '1y ago'],
  [800 * day, '2y ago'],
])('%i ms ago reads "%s"', (ms, expected) => {
  expect(ago(ms)).toBe(expected)
})
