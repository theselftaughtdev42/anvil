import { FileText, Folder, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { AnvilMark } from '@/components/anvil-mark'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// `children` sit after the logo, e.g. the open Requirement's title and status.
export function AppHeader({ initials, children }: { initials: string; children?: ReactNode }) {
  return (
    <header className="border-b">
      <div className="mx-auto box-content flex h-14 max-w-content items-center gap-4 px-gutter max-sm:gap-2">
        <Link
          to="/"
          className="-mx-1 flex items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <AnvilMark className="w-9 max-sm:w-8" />
          {/* With a page's own content in the header, a phone only has room for the mark. */}
          <span
            className={cn(
              'font-wordmark text-lg leading-none font-black tracking-wordmark',
              children && 'max-sm:sr-only',
            )}
          >
            ANVIL
          </span>
        </Link>
        <HeaderNav />
        <div className="flex min-w-0 flex-1 items-center gap-4 max-sm:gap-2">{children}</div>
        {/* No account menu yet */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label="Account"
        >
          <Avatar>
            <AvatarFallback className="bg-secondary text-xs font-medium text-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </div>
    </header>
  )
}

const sections: { label: string; to: string; icon: LucideIcon; current: (path: string) => boolean }[] = [
  {
    label: 'Requirements',
    to: '/',
    icon: FileText,
    current: (path) => path === '/' || path.startsWith('/requirements/'),
  },
  {
    label: 'Projects',
    to: '/projects',
    icon: Folder,
    current: (path) => path === '/projects' || path.startsWith('/projects/'),
  },
]

// The app's sections. A phone only has room for their icons; the labels stay
// for screen readers.
function HeaderNav() {
  const { pathname } = useLocation()
  return (
    <nav aria-label="Sections" className="flex items-center gap-1 max-sm:gap-0">
      {sections.map(({ label, to, icon: Icon, current }) => {
        const isCurrent = current(pathname)
        return (
          <Link
            key={to}
            to={to}
            aria-current={isCurrent ? 'page' : undefined}
            className={cn(
              'flex h-8 items-center rounded-md px-2.5 text-body-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:w-7 max-sm:justify-center max-sm:px-0',
              isCurrent ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon aria-hidden="true" className="size-4 sm:hidden" />
            <span className="max-sm:sr-only">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
