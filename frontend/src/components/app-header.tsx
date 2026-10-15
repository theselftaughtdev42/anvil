import { AnvilMark } from '@/components/anvil-mark'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

export function AppHeader({ initials }: { initials: string }) {
  return (
    <header className="border-b">
      <div className="mx-auto box-content flex h-14 max-w-content items-center justify-between px-gutter">
        <a
          href="/"
          className="-mx-1 flex items-center gap-2 rounded-md px-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <AnvilMark className="w-9" />
          <span className="font-wordmark text-lg leading-none font-black tracking-wordmark">
            ANVIL
          </span>
        </a>
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
