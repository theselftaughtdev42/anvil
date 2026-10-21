import type { ComponentProps } from 'react'
import Logo from '@/assets/logo.svg?react'

/**
 * The main mark, src/assets/logo.svg. It's decorative here: the wordmark
 * beside it names the link, so drop the file's own label.
 */
export function AnvilMark(props: ComponentProps<'svg'>) {
  return <Logo role={undefined} aria-label={undefined} aria-hidden="true" {...props} />
}
