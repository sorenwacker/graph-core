import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding } from './helpers.js'

/**
 * The Tasks view is a Kanban board (docs/guides/views.md, "Tasks View"): a
 * new task starts in To do despite the start date it is given at creation,
 * dragging it to In progress stores a mark and today's start date that
 * outlive a reload, and dragging it to Done completes it.
 */

let ctx
const ids = {}

test.beforeAll(async () => {
  ctx = await launchApp()
  await dismissOnboarding(ctx.page)
  for (const title of ['Board task', 'Started task']) {
    ids[title] = (
      await ctx.page.evaluate(
        title => window.electronAPI.createNode({ type: 'task', title, workspace_id: 'work' }),
        title
      )
    ).id
  }
  await ctx.page.reload()
  await dismissOnboarding(ctx.page)
  await openTasks(ctx.page)
})

test.afterAll(async () => {
  await ctx?.close()
})

/** The view switcher's buttons follow viewConfig: graph, cards, table, tasks. */
async function openTasks(page) {
  await page.locator('.view-switcher button').nth(3).click()
  await expect(page.locator('.task-board')).toBeVisible()
}

const inColumn = (page, column, title) => page.locator(`[data-column="${column}"] [data-task-id]`, { hasText: title })

/** Drag a card onto a column with the mouse, the way a user does. */
async function dragTo(page, card, column) {
  const from = await card.boundingBox()
  const to = await column.boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 20, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
  await page.mouse.up()
}

const localToday = () => {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

test('dragging a task to In progress marks it and starts it today, and that outlives a reload', async () => {
  const page = ctx.page
  // New tasks start in To do although they are created with a start date.
  await expect(inColumn(page, 'todo', 'Started task')).toBeVisible()
  await dragTo(page, inColumn(page, 'todo', 'Started task'), page.locator('[data-column="in-progress"]'))
  await expect(inColumn(page, 'in-progress', 'Started task')).toBeVisible()

  const saved = await page.evaluate(id => window.electronAPI.getNode(id), ids['Started task'])
  expect(saved.in_progress).toBe(true)
  expect(saved.start_date).toBe(localToday())

  await page.reload()
  await dismissOnboarding(page)
  await openTasks(page)
  await expect(inColumn(page, 'in-progress', 'Started task')).toBeVisible()
  await expect(page.locator('[data-column="todo"]')).not.toContainText('Started task')
})

test('dragging a task to Done completes it', async () => {
  const page = ctx.page
  const card = inColumn(page, 'todo', 'Board task')
  await expect(card).toBeVisible()
  await dragTo(page, card, page.locator('[data-column="done"]'))

  // Completed tasks are hidden by default, so the card leaves the board...
  await expect(card).toBeHidden()
  // ...and is in Done once they are shown.
  await page.getByLabel('Show completed').check()
  await expect(inColumn(page, 'done', 'Board task')).toBeVisible()
  const saved = await page.evaluate(id => window.electronAPI.getNode(id), ids['Board task'])
  expect(saved.completed).toBe(true)
  expect(saved.end_date).toBe(localToday())
})

test('a task added from the bar appears in To do at once', async () => {
  const page = ctx.page
  await page.locator('.type-select').selectOption('task')
  const input = page.getByPlaceholder('Add new...')
  await input.fill('Fresh task')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(inColumn(page, 'todo', 'Fresh task')).toBeVisible()
})
