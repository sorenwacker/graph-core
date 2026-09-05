import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * Dropping a node on the breadcrumb home icon moves it to the top level.
 *
 * The unit tests cover each drag mechanism in isolation with a faked pointer;
 * this one proves the wiring end to end - a real drag in the packaged app, a
 * real database write, and the node still at the top level after a reload.
 * See docs/guides/drag-drop.md.
 */

let ctx

test.beforeAll(async () => {
  ctx = await launchApp()
  await dismissOnboarding(ctx.page)
})

test.afterAll(async () => {
  await ctx?.close()
})

test('drags a child onto the breadcrumb home icon to move it to the top level', async () => {
  const page = ctx.page

  const parentId = await page.evaluate(async () => {
    const parent = await window.electronAPI.createNode({ type: 'note', title: 'Parent box', workspace_id: 'work' })
    await window.electronAPI.createNode({
      type: 'note',
      title: 'Nested child',
      parent_id: parent.id,
      workspace_id: 'work',
    })
    return parent.id
  })

  await page.reload()
  await dismissOnboarding(page)

  // Enter the parent so the child is the row being dragged.
  await page.locator('body').press(`${MOD}+Digit3`)
  const parentCell = page.getByRole('cell', { name: 'Parent box' })
  await parentCell.waitFor({ timeout: 10000 })
  await parentCell.dblclick()

  const childCell = page.getByRole('cell', { name: 'Nested child' })
  await childCell.waitFor({ timeout: 10000 })
  // The row is present before its drag handler settles; starting the drag on
  // that boundary produces a mousedown the table never turns into a drag.
  await expect(childCell).toBeVisible()
  await page.waitForTimeout(300)

  const from = await childCell.boundingBox()
  const home = await page.locator('.home-crumb').boundingBox()

  // Table view drags with a mouse-tracked ghost, so drive real mouse events.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y - 40, { steps: 5 })
  await page.mouse.move(home.x + home.width / 2, home.y + home.height / 2, { steps: 10 })
  await expect(page.locator('.home-crumb.drop-target')).toBeVisible()
  await page.mouse.up()

  await expect
    .poll(async () => page.evaluate(() => window.electronAPI.getRoots('work').then(rs => rs.map(r => r.title))), {
      timeout: 10000,
    })
    .toContain('Nested child')

  const stillParented = await page.evaluate(id => window.electronAPI.getDescendants(id), parentId)
  expect(stillParented.map(n => n.title)).not.toContain('Nested child')
})

test('drags a graph node onto the breadcrumb home icon', async () => {
  const page = ctx.page

  const parentId = await page.evaluate(async () => {
    const parent = await window.electronAPI.createNode({ type: 'note', title: 'Graph box', workspace_id: 'work' })
    await window.electronAPI.createNode({
      type: 'note',
      title: 'Graph child',
      parent_id: parent.id,
      workspace_id: 'work',
    })
    return parent.id
  })

  await page.reload()
  await dismissOnboarding(page)

  // Enter the parent in table view, then switch to the graph.
  await page.locator('body').press(`${MOD}+Digit3`)
  const parentCell = page.getByRole('cell', { name: 'Graph box' })
  await parentCell.waitFor({ timeout: 10000 })
  await parentCell.dblclick()
  await page.locator('body').press(`${MOD}+Digit1`)

  const label = page.locator('.node-html', { hasText: 'Graph child' }).first()
  await label.waitFor({ timeout: 15000 })
  await page.waitForTimeout(2000)

  const from = await label.boundingBox()
  const home = await page.locator('.home-crumb').boundingBox()

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y - 60, { steps: 5 })
  await page.mouse.move(home.x + home.width / 2, home.y + home.height / 2, { steps: 15 })
  await page.mouse.up()

  await expect
    .poll(async () => page.evaluate(() => window.electronAPI.getRoots('work').then(rs => rs.map(r => r.title))), {
      timeout: 10000,
    })
    .toContain('Graph child')

  const stillParented = await page.evaluate(id => window.electronAPI.getDescendants(id), parentId)
  expect(stillParented.map(n => n.title)).not.toContain('Graph child')
})
