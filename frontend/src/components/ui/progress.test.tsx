import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { Progress } from '@/components/ui/progress'

// Covers our edit to the generated component: shadcn's version drops value.
test('the bar reports the value it is given', async () => {
  const screen = await render(<Progress value={40} aria-label="Progress" />)
  await expect.element(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40')
})
