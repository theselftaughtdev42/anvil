import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProject, projectsKey } from '@/lib/projects'

// "New project": asks for a name, creates the Project, then opens it. A
// rejected name, e.g. one already taken, shows the API's message in the dialog.
export function NewProjectDialog({ label = 'New project' }: { label?: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const nameId = useId()
  const errorId = useId()

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: projectsKey })
      void navigate(`/projects/${project.id}`)
    },
  })

  const changeOpen = (next: boolean) => {
    if (isPending) return
    setOpen(next)
    if (!next) {
      setName('')
      reset()
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (isPending || !name.trim()) return
    mutate(name.trim())
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button>{label}</Button>
      </DialogTrigger>
      <DialogContent className="rounded-card">
        <form onSubmit={submit} aria-busy={isPending} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>You can add its Project Context next.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                if (error) reset()
              }}
              readOnly={isPending}
              // The API's limit (NAME_MAX_LENGTH)
              maxLength={120}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            {error && (
              <p id={errorId} role="alert" className="text-body-sm text-destructive">
                {error.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => changeOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
