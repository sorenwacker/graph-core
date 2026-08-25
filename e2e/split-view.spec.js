import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * The notes split view renders both panes and its divider is draggable to
 * change the editor/preview ratio. Isolated instance so it is stable.
 */

let ctx

test.beforeAll(async () => {
  ctx = await launchApp()
  await dismissOnboarding(ctx.page)

  const input = ctx.page.getByPlaceholder('Add new...')
  await input.fill('Split note')
  await ctx.page.getByRole('button', { name: 'Add', exact: true }).click()
  await input.blur()
  await ctx.page.locator('body').press(`${MOD}+Digit3`)
  await ctx.page.getByRole('cell', { name: 'Split note' }).click()
  await ctx.page.keyboard.press('Space')
  await ctx.page.getByRole('button', { name: 'Split', exact: true }).click()
})

test.afterAll(async () => {
  await ctx.close()
})

function paneWidths(page) {
  return page.evaluate(() => {
    const e = document.querySelector('.notes-split .split-editor')
    const p = document.querySelector('.notes-split .split-preview')
    return {
      editor: e ? Math.round(e.getBoundingClientRect().width) : 0,
      preview: p ? Math.round(p.getBoundingClientRect().width) : 0,
      divider: Boolean(document.querySelector('.notes-split .split-divider')),
    }
  })
}

test('renders both panes and a divider', async () => {
  const w = await paneWidths(ctx.page)
  expect(w.divider).toBe(true)
  expect(w.editor).toBeGreaterThan(40)
  expect(w.preview).toBeGreaterThan(40)
})

test('dragging the divider changes the ratio', async () => {
  const before = await paneWidths(ctx.page)
  const divider = ctx.page.locator('.notes-split .split-divider')
  const box = await divider.boundingBox()
  await ctx.page.mouse.move(box.x + 3, box.y + box.height / 2)
  await ctx.page.mouse.down()
  await ctx.page.mouse.move(box.x - 120, box.y + box.height / 2, { steps: 8 })
  await ctx.page.mouse.up()

  const after = await paneWidths(ctx.page)
  expect(after.editor).toBeLessThan(before.editor - 30)
})
