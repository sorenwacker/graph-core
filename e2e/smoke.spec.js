import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * Smoke pack for the built app. Everything here runs in real Electron against
 * dist/, with an isolated profile per run. These flows are exactly what the
 * unit suite cannot see: the boot path, the preload bridge, the real grid and
 * graph, and persistence.
 */

let ctx

test.beforeAll(async () => {
  ctx = await launchApp()
  await dismissOnboarding(ctx.page)
})

test.afterAll(async () => {
  await ctx.close()
})

test('boots with a working preload bridge', async () => {
  const bridge = await ctx.page.evaluate(() => typeof window.electronAPI)
  expect(bridge).toBe('object')
  await expect(ctx.page.locator('.view-switcher button')).toHaveCount(7)
})

test('creates a node from the add bar', async () => {
  const input = ctx.page.getByPlaceholder('Add new...')
  await input.fill('Smoke test node')
  await ctx.page.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(ctx.page.getByText('Smoke test node').first()).toBeVisible()

  // View shortcuts stand down while an editable element has focus, so leave
  // the add bar the way a user would before keyboard navigation.
  await input.blur()
})

test('switches views with the keyboard shortcuts', async () => {
  // Cards (2), then Table (3): each must render its container.
  await ctx.page.locator('body').press(`${MOD}+Digit2`)
  await expect(ctx.page.locator('.cards-container, .cards-view, .node-card').first()).toBeVisible()

  await ctx.page.locator('body').press(`${MOD}+Digit3`)
  await expect(ctx.page.getByText('Smoke test node').first()).toBeVisible()

  await ctx.page.locator('body').press(`${MOD}+Digit1`)
})

test('deletes the selected node and undoes the delete', async () => {
  await ctx.page.locator('body').press(`${MOD}+Digit3`)
  // Scope to the table row: the same text in the sidebar navigates on click
  // instead of selecting.
  const cell = ctx.page.getByRole('cell', { name: 'Smoke test node' })
  await cell.click()
  // Deleting acts on the selection; assert it exists before pressing the key,
  // or a click that lands mid-render deletes nothing.
  await expect(ctx.page.locator('.node-row.selected')).toBeVisible()
  // Delete through the context menu: it is deterministic DOM, while the
  // keyboard path depends on global focus state the harness cannot pin down.
  await cell.click({ button: 'right' })
  await ctx.page.getByText('Delete', { exact: true }).first().click()
  await expect(cell).toHaveCount(0)

  // Undo through the toolbar button: a global keystroke is dropped when the
  // window lacks OS focus, which is routine on CI and background runs.
  await ctx.page.getByRole('button', { name: 'Undo' }).click()
  await expect(cell).toBeVisible()
})

test('keeps data across a relaunch', async () => {
  ctx = await ctx.relaunch()
  await dismissOnboarding(ctx.page)

  await ctx.page.locator('body').press(`${MOD}+Digit3`)
  await expect(ctx.page.getByRole('cell', { name: 'Smoke test node' })).toBeVisible()
})

test('encrypts from settings and survives a relaunch', async () => {
  // Enable encryption in Settings > Security.
  await ctx.page.getByRole('button', { name: 'Open settings menu' }).click()
  await ctx.page.getByRole('button', { name: 'Security' }).click()
  await ctx.page.getByTestId('enable-password').fill('e2e-recovery-pw')
  await ctx.page.getByTestId('enable-password-confirm').fill('e2e-recovery-pw')
  await ctx.page.getByRole('button', { name: 'Encrypt database' }).click()
  await expect(ctx.page.getByText('Encryption enabled', { exact: false })).toBeVisible()

  ctx = await ctx.relaunch()

  // With a keychain (macOS) the relaunch unlocks silently; without one (CI
  // Linux) the unlock screen appears and the recovery password opens the file.
  const unlock = ctx.page.getByTestId('unlock-password')
  try {
    await unlock.waitFor({ timeout: 5000 })
    await unlock.fill('e2e-recovery-pw')
    await ctx.page.getByRole('button', { name: 'Unlock' }).click()
  } catch {
    // No unlock screen: the keychain slot opened the database.
  }

  await dismissOnboarding(ctx.page)
  await ctx.page.locator('body').press(`${MOD}+Digit3`)
  await expect(ctx.page.getByRole('cell', { name: 'Smoke test node' })).toBeVisible()
})
