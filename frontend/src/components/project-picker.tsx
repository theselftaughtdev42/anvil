import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRef } from 'react'
import type { Project } from '@/lib/projects'

// The idea prompt's Project picker. It starts on "Pick one", with
// nothing picked; a Project without a Project Context says what that costs.
export function ProjectPicker({
  projects,
  value,
  onValueChange,
  onPicked,
  disabled,
  invalid,
  describedBy,
}: {
  projects: Project[]
  // Undefined while nothing is picked.
  value: string | undefined
  onValueChange: (id: string) => void
  // Called once the menu has closed after a pick, in place of focusing the
  // picker again, e.g. to move focus on. Escape still returns to the picker.
  onPicked?: () => void
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
}) {
  const picked = projects.find((project) => project.id === value)
  const justPicked = useRef(false)

  return (
    // '' shows the placeholder; Radix won't take undefined back once set.
    <Select
      value={value ?? ''}
      onValueChange={(id) => {
        justPicked.current = true
        onValueChange(id)
      }}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        aria-label="Project"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="min-w-0 max-w-full gap-1.5 rounded-button px-2.5 text-body-sm shadow-none"
      >
        <span aria-hidden="true" className="text-muted-foreground">Project</span>
        {/* Just the name: the options' captions stay in the menu */}
        <SelectValue placeholder="Pick one">{picked?.name}</SelectValue>
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="start"
        onCloseAutoFocus={(event) => {
          if (!justPicked.current || !onPicked) return
          justPicked.current = false
          event.preventDefault()
          onPicked()
        }}
        className="max-w-[min(22rem,var(--radix-select-content-available-width))] rounded-card"
      >
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id} textValue={project.name} className="py-2">
            <span className="flex flex-col items-start gap-0.5">
              <span className="text-body-sm font-medium">{project.name}</span>
              {!project.has_context && (
                <span className="text-caption font-normal whitespace-normal text-muted-foreground">
                  No Project Context yet, so Anvil asks more general Questions
                </span>
              )}
            </span>
          </SelectItem>
        ))}
        <SelectSeparator />
        <p className="px-2 py-1.5 text-caption font-normal text-muted-foreground">
          You can change the Project until the first Question is answered.
        </p>
      </SelectContent>
    </Select>
  )
}
