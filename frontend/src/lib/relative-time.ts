const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

// How long ago `date` was, as a card shows it: "Just now", "5m ago", "2h ago",
// "Yesterday", "3d ago", "3w ago", "4mo ago" or "2y ago". A date in the future
// (clock skew) counts as just now.
export function relativeTime(date: Date, now = new Date()): string {
  const elapsed = now.getTime() - date.getTime()
  if (elapsed < MINUTE) return 'Just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`
  if (elapsed < 2 * DAY) return 'Yesterday'
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / WEEK)}w ago`
  if (elapsed < 365 * DAY) return `${Math.floor(elapsed / (30 * DAY))}mo ago`
  return `${Math.floor(elapsed / (365 * DAY))}y ago`
}
