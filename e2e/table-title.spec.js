import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * A table's title is edited in its toolbar and kept
 * (docs/guides/detail-panel.md#table-section).
 */

let ctx

test.beforeAll(async () => {
  ctx = await launchApp()
  const page = ctx.page
  await dismissOnboarding(page)
  const input = page.getByPlaceholder('Add new...')
  await input.fill('Titled table')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await input.blur()
  await page.locator('body').press(`${MOD}+Digit3`)
  await page.getByRole('cell', { name: 'Titled table' }).click()
  await page.keyboard.press('Space')
  await page.locator('.detail-panel .section-bar [data-section="table"]').click()
  await page.getByRole('button', { name: '+ Add Table' }).click()
})

test.afterAll(async () => {
  await ctx?.close()
})

test('a new table has no title and does not repeat the section name', async () => {
  const title = ctx.page.getByLabel('Table title')
  await expect(title).toBeVisible()
  await expect(title).toHaveValue('')
  await expect(title).toHaveAttribute('placeholder', 'Add a title')
})

test('Escape abandons a title edit without closing the panel', async () => {
  const title = ctx.page.getByLabel('Table title')
  await title.click()
  await ctx.page.keyboard.type('Not kept')
  await ctx.page.keyboard.press('Escape')
  await expect(title).toHaveValue('')
  await expect(ctx.page.locator('.detail-panel')).toBeVisible()
})

test('a typed title is saved and shown again when the panel is reopened', async () => {
  const page = ctx.page
  const title = page.getByLabel('Table title')
  await title.click()
  await page.keyboard.type('Budget 2026')
  await page.keyboard.press('Enter')
  await expect(title).toHaveValue('Budget 2026')

  await page.keyboard.press('Escape')
  await expect(page.locator('.detail-panel')).toBeHidden()
  await page.getByRole('cell', { name: 'Titled table' }).click()
  await page.keyboard.press('Space')
  await expect(page.getByLabel('Table title')).toHaveValue('Budget 2026')
})
