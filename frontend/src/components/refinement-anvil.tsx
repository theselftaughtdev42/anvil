import { useId, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import './refinement-anvil.css'

// The paths come from src/assets/logo.svg: the anvil, and one spark drawn three times.
// The sparks fly off a hot billet on the face, so the anvil is visibly forging something.
const ANVIL = 'M4 34 C16 34 24 32 28 30 H94 V44 H78 Q68 46 66 58 H76 V70 H28 V58 H38 Q36 46 28 44 Q14 42 4 34 Z'
const SPARK = 'M0 -8 L4 0 L0 8 L-4 0 Z'

// Placement just above the billet; opacity (--o), loop length, start offset and sideways
// drift from the prototype.
const SPARKS = [
  { place: 'translate(61 13) scale(0.75)', o: 0.9, d: '6s', delay: '0s', dx: '2px' },
  { place: 'translate(54 8) scale(0.45)', o: 0.6, d: '7.2s', delay: '-2.4s', dx: '-6px' },
  { place: 'translate(69 5) scale(0.35)', o: 0.45, d: '8.4s', delay: '-5.1s', dx: '7px' },
]

type RefinementAnvilProps = {
  // Bump this on every Answer to replay the strike. 0 means no strike yet.
  strike?: number
  className?: string
}

// The small anvil above the Refinement page's progress marks. Decorative.
export function RefinementAnvil({ strike = 0, className }: RefinementAnvilProps) {
  const id = useId()
  // Two identically keyframed classes, swapped on each strike, make the browser restart it.
  const hit = strike === 0 ? undefined : strike % 2 ? 'hit-a' : 'hit-b'

  return (
    <div className={cn('refinement-anvil', hit, className)} aria-hidden="true">
      <svg width="64" height="50" viewBox="0 -14 100 86">
        <defs>
          <linearGradient id={`${id}face`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E8642C" />
            <stop offset="1" stopColor="#E8642C" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}hot`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E9C27A" />
            <stop offset="1" stopColor="#E8642C" />
          </linearGradient>
        </defs>
        <path d={ANVIL} fill="#EDE6DA" />
        <path className="heat" d="M28 30 H94 V37 H28 Z" fill={`url(#${id}face)`} />
        <rect className="billet" x="48" y="23" width="26" height="7" rx="1.5" fill={`url(#${id}hot)`} />
        <g className="burst">
          {SPARKS.map(({ place, o, d, delay, dx }) => (
            <g key={place} transform={place}>
              <path
                className="sp"
                style={{ '--o': o, '--d': d, '--delay': delay, '--dx': dx } as CSSProperties}
                d={SPARK}
                fill="#E8642C"
              />
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
