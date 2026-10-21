import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Covers our edit to the generated components: shadcn imports the plain `cn`,
// which doesn't know the theme's tokens, so it would keep both radii or sizes.
test('dialog content takes a theme radius in place of its own', async () => {
  const screen = await render(
    <Dialog open>
      <DialogContent aria-describedby={undefined} className="rounded-card">
        <DialogTitle>Title</DialogTitle>
      </DialogContent>
    </Dialog>,
  )
  const classes = screen.getByRole('dialog').element().classList
  expect(classes).toContain('rounded-card')
  expect(classes).not.toContain('rounded-lg')
})

test('input and label take a theme type size in place of their own', async () => {
  const screen = await render(
    <>
      <Label htmlFor="name" className="text-caption">
        Name
      </Label>
      <Input id="name" className="text-body" />
    </>,
  )
  expect(screen.getByText('Name').element().classList).not.toContain('text-sm')
  const input = screen.getByRole('textbox').element().classList
  expect(input).toContain('text-body')
  expect(input).not.toContain('text-base')
})

test('select trigger takes a theme type size and radius in place of its own', async () => {
  const screen = await render(
    <Select>
      <SelectTrigger className="rounded-button text-body-sm">
        <SelectValue placeholder="Pick" />
      </SelectTrigger>
    </Select>,
  )
  const classes = screen.getByRole('combobox').element().classList
  expect(classes).toContain('text-body-sm')
  expect(classes).not.toContain('text-sm')
  expect(classes).not.toContain('rounded-md')
})

test('select content takes a theme radius in place of its own', async () => {
  const screen = await render(
    <Select open>
      <SelectTrigger>
        <SelectValue placeholder="Pick" />
      </SelectTrigger>
      <SelectContent position="popper" className="rounded-card">
        <SelectItem value="a">A</SelectItem>
      </SelectContent>
    </Select>,
  )
  const classes = screen.getByRole('listbox').element().classList
  expect(classes).toContain('rounded-card')
  expect(classes).not.toContain('rounded-md')
})
