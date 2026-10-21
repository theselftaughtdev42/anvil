import { useEffect } from 'react'
import { useBlocker } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * While `dirty`, asks before leaving for another page in Anvil, and has the
 * browser ask before closing or reloading the tab. `message` says what's lost.
 */
export function LeaveGuard({ dirty, message }: { dirty: boolean; message: string }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // Saved, or changed back, while the dialog was up.
  useEffect(() => {
    if (blocker.state === 'blocked' && !dirty) blocker.reset()
  }, [blocker, dirty])

  const stay = () => blocker.reset?.()
  return (
    <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && stay()}>
      <DialogContent className="rounded-card">
        <DialogHeader>
          <DialogTitle>Leave without saving?</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={stay}>
            Keep editing
          </Button>
          <Button variant="destructive" onClick={() => blocker.proceed?.()}>
            Leave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
