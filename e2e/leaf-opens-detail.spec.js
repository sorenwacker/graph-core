import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * Entering a node that has no children opens its detail panel in place
 * (docs/guides/detail-panel.md#opening-the-panel) instead of navigating into
 * it. Entering one that has children navigates as usual.
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

test('entering a node without children opens its detail panel in place', async () => {
  const page = ctx.page
  await page.getByRole('cell', { name: 'Lone leaf' }).click()
  await page.keyboard.press('Enter')

  const panel = page.locator('.detail-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.detail-title-input, textarea').first()).toHaveValue('Lone leaf')
  // Not navigated in: the view still lists the other top-level node, so
  // closing the panel leaves the user where they were.
  await expect(page.getByRole('cell', { name: 'Has a child' })).toBeVisible()
})

test('double-clicking a childless node in the graph opens its detail panel', async () => {
  const page = ctx.page
  // Back to the top level, in the graph, with the panel closed.
  await page.keyboard.press('Escape')
  await page.locator('body').press(`${MOD}+Digit1`)
  await page.locator('.home-crumb').click()
  const leaf = page.locator('.node-html', { hasText: 'Lone leaf' })
  await expect(leaf).toBeVisible()
  await expect(page.locator('.detail-panel')).toBeHidden()
  await page.waitForTimeout(800)

  const box = await leaf.boundingBox()
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)

  const panel = page.locator('.detail-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.detail-title-input, textarea').first()).toHaveValue('Lone leaf')
  // It stays open: nothing that follows the double-click closes it again.
  await page.waitForTimeout(1500)
  await expect(panel).toBeVisible()

  // Closing it leaves the graph as it was, with both top-level nodes drawn.
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(leaf).toBeVisible()
  await expect(page.locator('.node-html', { hasText: 'Has a child' })).toBeVisible()
})

test('double-clicking a childless child inside a container opens its detail panel', async () => {
  const page = ctx.page
  await page.keyboard.press('Escape')
  await page.locator('.home-crumb').click()
  const parent = page.locator('.node-html', { hasText: 'Has a child' })
  await expect(parent).toBeVisible()
  await page.waitForTimeout(800)
  let box = await parent.boundingBox()
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)

  const child = page.locator('.node-html', { hasText: 'The child' })
  await expect(child).toBeVisible()
  await expect(page.locator('.detail-panel')).toBeHidden()
  await page.waitForTimeout(1200)
  box = await child.boundingBox()
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)

  const panel = page.locator('.detail-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.detail-title-input, textarea').first()).toHaveValue('The child')
  await page.waitForTimeout(1500)
  await expect(panel).toBeVisible()
})

test('a node whose children are all hidden opens its detail panel when entered', async () => {
  const page = ctx.page
  await page.keyboard.press('Escape')
  await page.evaluate(async () => {
    const parent = await window.electronAPI.createNode({
      type: 'note',
      title: 'Only done inside',
      workspace_id: 'work',
    })
    await window.electronAPI.createNode({
      type: 'task',
      title: 'Finished task',
      parent_id: parent.id,
      workspace_id: 'work',
      completed: true,
    })
    await window.electronAPI.setSetting('graphcore-hideCompleted', 'true')
  })
  await page.reload()
  await dismissOnboarding(page)
  await page.locator('body').press(`${MOD}+Digit3`)
  await page.locator('.home-crumb').click()

  await page.getByRole('cell', { name: 'Only done inside' }).click()
  await page.keyboard.press('Enter')

  const panel = page.locator('.detail-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.detail-title-input, textarea').first()).toHaveValue('Only done inside')
})
