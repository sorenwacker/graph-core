import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * Entering a node that has no children opens its detail panel
 * (docs/guides/detail-panel.md#opening-the-panel). Entering one that has
 * children does not: there the children are what the view shows.
 */

let ctx

test.beforeAll(async () => {
  ctx = await launchApp()
  await dismissOnboarding(ctx.page)

  await ctx.page.evaluate(async () => {
    await window.electronAPI.createNode({ type: 'note', title: 'Lone leaf', workspace_id: 'work' })
    const parent = await window.electronAPI.createNode({ type: 'note', title: 'Has a child', workspace_id: 'work' })
    await window.electronAPI.createNode({
      type: 'note',
      title: 'The child',
      parent_id: parent.id,
      workspace_id: 'work',
    })
  })
  await ctx.page.reload()
  await dismissOnboarding(ctx.page)
  await ctx.page.locator('body').press(`${MOD}+Digit3`)
})

test.afterAll(async () => {
  await ctx?.close()
})

test('entering a node with children shows the children and leaves the panel closed', async () => {
  const page = ctx.page
  await page.getByRole('cell', { name: 'Has a child' }).click()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('cell', { name: 'The child' })).toBeVisible()
  await expect(page.locator('.detail-panel')).toBeHidden()

  await page.keyboard.press('Shift+Enter')
  await expect(page.getByRole('cell', { name: 'Lone leaf' })).toBeVisible()
})

test('entering a node without children opens its detail panel', async () => {
  const page = ctx.page
  await page.getByRole('cell', { name: 'Lone leaf' }).click()
  await page.keyboard.press('Enter')

  const panel = page.locator('.detail-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.detail-title-input, textarea').first()).toHaveValue('Lone leaf')
  // Still navigated in: the other top-level node is no longer listed.
  await expect(page.getByRole('cell', { name: 'Has a child' })).toBeHidden()
})
