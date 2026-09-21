import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * A note marked sensitive, seen from the running app: its text is in no list
 * view and not in the hover tooltip, and appears in the detail panel only after
 * Show is pressed (docs/architecture/sensitive-notes.md, "Read path").
 *
 * Sensitive-note encryption stays off here. That is the state in which the flag
 * used to be display masking alone, so every view held the plaintext and the
 * ones that forgot to mask it showed it.
 */

const SECRET = 'zebra-crossing-7731'
const TITLE = 'Vault entry'

let ctx

test.beforeAll(async () => {
  ctx = await launchApp()
  await dismissOnboarding(ctx.page)
  await ctx.page.evaluate(
    ([title, notes]) =>
      window.electronAPI.createNode({ type: 'person', title, notes, notes_sensitive: true, workspace_id: 'work' }),
    [TITLE, SECRET]
  )
  await ctx.page.reload()
  await dismissOnboarding(ctx.page)
})

test.afterAll(async () => {
  await ctx?.close()
})

/** Switch to the table view unless it is already showing. */
async function showTable(page) {
  if (!(await page.locator('.table-view').isVisible())) await page.locator('body').press(`${MOD}+Digit3`)
  const cell = page.getByRole('cell', { name: TITLE })
  await cell.waitFor({ timeout: 10000 })
  return cell
}

test('no node read hands the text to the renderer', async () => {
  const leaked = await ctx.page.evaluate(async secret => {
    const roots = await window.electronAPI.getRoots('work')
    const found = await window.electronAPI.search('Vault', null, 'work')
    return JSON.stringify([roots, found]).includes(secret)
  }, SECRET)
  expect(leaked).toBe(false)
})

for (const [view, digit] of [
  ['graph', 1],
  ['cards', 2],
  ['table', 3],
]) {
  test(`the ${view} view does not contain the text`, async () => {
    await ctx.page.locator('body').press(`${MOD}+Digit${digit}`)
    await expect(ctx.page.getByText(TITLE).first()).toBeVisible({ timeout: 10000 })
    await expect(ctx.page.locator('body')).not.toContainText(SECRET)
  })
}

test('the hover tooltip shows a placeholder, not the text', async () => {
  const page = ctx.page
  // A fresh profile pins the sidebar, and no tooltip shows while it is open.
  // Unpinned, it stays open while the pointer is over it, so move off it first.
  await page.getByTitle('Unpin sidebar').click()
  await page.mouse.move(700, 500)
  await expect(page.locator('.sidebar.pinned, .sidebar.show')).toHaveCount(0)

  const cell = await showTable(page)
  await cell.hover()

  const tooltip = page.locator('.tippy-box')
  await expect(tooltip).toBeVisible({ timeout: 5000 })
  await expect(tooltip).toContainText('Sensitive content hidden')
  await expect(tooltip).not.toContainText(SECRET)
})

test('the detail panel shows the text only after Show is pressed', async () => {
  const page = ctx.page
  const cell = await showTable(page)
  await cell.click()
  await expect(page.locator('.node-row.selected')).toBeVisible()
  await page.keyboard.press('Space')

  const hidden = page.locator('.sensitive-hidden')
  await expect(hidden).toBeVisible({ timeout: 10000 })
  await expect(page.locator('body')).not.toContainText(SECRET)

  await hidden.getByRole('button', { name: 'Show' }).click()
  await expect(page.getByText(SECRET).first()).toBeVisible({ timeout: 10000 })
})
