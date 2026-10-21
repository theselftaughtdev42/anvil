import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'

/**
 * The logo's anvil gone cold: soot instead of ash. Decorative, so hidden from
 * screen readers.
 */
function ColdAnvil() {
  return (
    <svg viewBox="2 28 94 44" aria-hidden="true" className="mb-10 w-42">
      <path
        d="M4 34 C16 34 24 32 28 30 H94 V44 H78 Q68 46 66 58 H76 V70 H28 V58 H38 Q36 46 28 44 Q14 42 4 34 Z"
        className="fill-muted stroke-border"
        strokeWidth={0.75}
      />
    </svg>
  )
}

/** `label` and `message` say what's missing: a page by default. */
export function NotFoundPage({
  label = 'Page not found',
  message = "There's no page at this address. The link may be mistyped, or the page may have moved.",
}: {
  label?: string
  message?: string
}) {
  const navigate = useNavigate()
  // The first page of the visit has the key "default": going back from it
  // would leave Anvil, so go home instead.
  const { key } = useLocation()
  const goBack = () => (key === 'default' ? navigate('/') : navigate(-1))

  return (
    <div className="flex flex-col items-center py-24 text-center">
      <ColdAnvil />
      <p className="text-caption tracking-widest text-muted-foreground uppercase">
        404 · {label}
      </p>
      <h1 className="mt-3 text-page-heading">Nothing's on the anvil here</h1>
      <p className="mt-3 max-w-md text-body text-muted-foreground">{message}</p>
      <Button size="lg" className="mt-8" onClick={goBack}>
        <ArrowLeft />
        Go back
      </Button>
    </div>
  )
}
