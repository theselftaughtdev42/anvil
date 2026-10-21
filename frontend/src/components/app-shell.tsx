import { Fragment, type ReactNode } from 'react'
import { type Params, useMatches } from 'react-router'
import { AppHeader } from '@/components/app-header'

/** A route's `handle.crumb` names its page in the header, after the logo. */
export type RouteHandle = { crumb?: (params: Params) => ReactNode }

/**
 * Every page: the header with the matched routes' crumbs, then the page in the
 * content column.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const crumbs = useMatches().flatMap((match) => {
    const crumb = (match.handle as RouteHandle | undefined)?.crumb
    return crumb ? [<Fragment key={match.id}>{crumb(match.params)}</Fragment>] : []
  })
  return (
    <>
      {/* Placeholder until the stub current user lands (#19) */}
      <AppHeader initials="TM">{crumbs.length > 0 && crumbs}</AppHeader>
      <main className="mx-auto box-content max-w-content px-gutter">{children}</main>
    </>
  )
}

/** One crumb. The page's name is its heading. */
export function Crumb({ children }: { children: ReactNode }) {
  return (
    <>
      <span aria-hidden="true" className="text-border-strong">
        /
      </span>
      <h1 className="min-w-0 flex-1 truncate text-body-sm font-medium">{children}</h1>
    </>
  )
}
