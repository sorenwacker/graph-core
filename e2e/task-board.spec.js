import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding } from './helpers.js'

/**
 * The Tasks view's Board layout (docs/guides/views.md, "Board"): a task sits
 * in the column its fields put it in, dragging it to Done completes it, and
 * the layout choice survives a relaunch.
 */

let ctx
let taskId

test.beforeAll(async () => {
  ctx = await launchApp()
  await dismissOnboarding(ctx.page)
  taskId = (
    await ctx.page.evaluate(() =>
      window.electronAPI.createNode({ type: 'task', title: 'Board task', workspace_id: 'work' })
    )
  ).id
  await ctx.page.reload()
  await dismissOnboarding(ctx.page)
  // The view switcher's buttons follow viewConfig: graph, cards, table, tasks.
  await ctx.page.locator('.view-switcher button').nth(3).click()
})

test.afterAll(async () => {
  await ctx?.close()
})

test('dragging a task to Done completes it', async () => {
  const page = ctx.page
  await expect(page.getByRole('cell', { name: 'Board task' })).toBeVisible()
  await page.getByRole('button', { name: 'Board', exact: true }).click()

  const card = page.locator('[data-column="todo"] [data-task-id]', { hasText: 'Board task' })
  await expect(card).toBeVisible()
  const done = page.locator('[data-column="done"]')
  await expect(done).toBeVisible()

  const from = await card.boundingBox()
  const to = await done.boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 20, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
  await page.mouse.up()

  // Completed tasks are hidden by default, so the card leaves the board...
  await expect(card).toBeHidden()
  // ...and is in Done once they are shown.
  await page.getByLabel('Show completed').check()
  await expect(page.locator('[data-column="done"]', { hasText: 'Board task' })).toBeVisible()
  const saved = await page.evaluate(id => window.electronAPI.getNode(id), taskId)
  expect(Boolean(saved.completed)).toBe(true)
})

test('the board layout is remembered across a relaunch', async () => {
  ctx = await ctx.relaunch()
  await dismissOnboarding(ctx.page)
  await ctx.page.locator('.view-switcher button').nth(3).click()
  await expect(ctx.page.locator('.task-board')).toBeVisible()
  await expect(ctx.page.locator('.tasks-table')).toBeHidden()
})
