import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { ProjectPicker } from '@/components/project-picker'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ApiError } from '@/lib/api'
import { projectsKey, projectsQuery } from '@/lib/projects'
import { questionsKey } from '@/lib/questions'
import {
  changeProject,
  changeProjectKey,
  isProjectLocked,
  type Requirement,
  requirementsKey,
} from '@/lib/requirements'

const LOCKED = 'The Project is locked once a Question is answered.'

// The Requirement's Project in the Refinement header. A menu while it's Draft;
// once a Question is answered, its name with a lock that says why.
export function RequirementProject({ requirement }: { requirement: Requirement }) {
  const queryClient = useQueryClient()
  const projects = useQuery({ ...projectsQuery(), enabled: !isProjectLocked(requirement) })
  // A change while an Answer saves would delete the Question it answers, or
  // be refused once the Answer locks the Project.
  const answering = useIsMutating({ mutationKey: questionsKey(requirement.id) }) > 0

  const change = useMutation({
    mutationKey: changeProjectKey(requirement.id),
    // One at a time, so the last pick wins.
    scope: { id: changeProjectKey(requirement.id).join('/') },
    // Dropped once the page closes, so a failure isn't still shown on return.
    gcTime: 0,
    mutationFn: (projectId: string) => changeProject(requirement.id, projectId),
    // Awaited, so the change stays pending until the new stack has loaded. The
    // Requirement and its Questions are under the list's key.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsKey })
      return queryClient.invalidateQueries({ queryKey: requirementsKey })
    },
    // Locked elsewhere, or the Project has gone: show it as it is now.
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 409 || error.status === 422)) {
        void queryClient.invalidateQueries({ queryKey: requirementsKey })
      }
      if (error instanceof ApiError && error.status === 422) {
        void queryClient.invalidateQueries({ queryKey: projectsKey })
      }
    },
  })

  if (isProjectLocked(requirement)) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Focusable, so the reason is there for the keyboard too */}
            <span
              tabIndex={0}
              className="flex min-w-0 items-center gap-1.5 rounded-sm text-body-sm text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:max-w-72"
            >
              <Lock className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                <span className="sr-only">Project: </span>
                {requirement.project.name}
                <span className="sr-only"> (locked)</span>
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent className="text-caption">{LOCKED}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // While a change saves, the menu shows the Project picked.
  const projectId = change.isPending ? change.variables : requirement.project.id
  const picked = projects.data?.items.find((p) => p.id === projectId)
  if (!picked) {
    // The Projects haven't loaded, or couldn't: just the name.
    return (
      <span className="truncate sm:max-w-72 text-body-sm text-muted-foreground">
        <span className="sr-only">Project: </span>
        {requirement.project.name}
      </span>
    )
  }
  return (
    <ProjectPicker
      projects={projects.data!.items}
      value={picked}
      onValueChange={(id) => {
        if (id !== projectId && !answering) change.mutate(id)
      }}
      disabled={answering}
      className="sm:max-w-72"
    />
  )
}
