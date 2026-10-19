import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { AnvilMark } from '@/components/anvil-mark'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// `children` sit after the logo, e.g. the open Requirement's title and status.
export function AppHeader({ initials, children }: { initials: string; children?: ReactNode }) {
  return (
    <header className="border-b">
      <div className="mx-auto box-content flex h-14 max-w-content items-center gap-4 px-gutter">
        <Link
          to="/"
          className="-mx-1 flex items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <AnvilMark className="w-9" />
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
        <div className="flex min-w-0 flex-1 items-center gap-4">{children}</div>
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
