import { expect, type Page, test } from '@playwright/test'

test('a requirement link loads its page directly', async ({ page }) => {
  await page.goto('/requirements/abc-123')
  await expect(page.getByRole('heading', { name: 'Requirement' })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('abc-123')
})

test('the requirement page links back home', async ({ page }) => {
  await page.goto('/requirements/abc-123')
  await page.getByRole('link', { name: 'Back home' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Requirement' })).toBeHidden()
})

const notFound = (page: Page) => page.getByRole('heading', { name: "Nothing's on the anvil here" })

test('an unknown address shows the not-found page, under the header', async ({ page }) => {
  await page.goto('/no/such/page')
  await expect(notFound(page)).toBeVisible()
  await expect(page.getByRole('banner')).toBeVisible()
})

// Going back from the first page of a visit would leave Anvil.
test('going back from a not-found first page goes home', async ({ page }) => {
  await page.goto('/no/such/page')
  await page.getByRole('button', { name: 'Go back' }).click()
  await expect(page).toHaveURL('/')
})
