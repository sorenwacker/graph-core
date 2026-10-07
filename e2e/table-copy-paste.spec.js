import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * Copying a block of table cells and pasting it elsewhere in the table
 * (docs/guides/detail-panel.md#table-section), by each route the panel offers:
 * the keyboard onto a selected range, the keyboard onto a clicked cell, and the
 * toolbar buttons.
 */

let ctx

const cell = (page, row, col) => page.locator(`.grid-wrapper .ag-row[row-index="${row}"] .ag-cell[col-id="${col}"]`)

async function fill(page, row, col, text) {
  await cell(page, row, col).click()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

async function dragSelect(page, from, to) {
  const a = await cell(page, ...from).boundingBox()
  const b = await cell(page, ...to).boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 })
  await page.mouse.up()
}

async function block(page, rows, cols) {
  const out = []
  for (const r of rows) {
    const line = []
    for (const c of cols) line.push((await cell(page, r, c).innerText()).trim())
    out.push(line)
  }
  return out
}

const SOURCE = [
  ['a1', 'b1'],
  ['a2', 'b2'],
]

test.beforeAll(async () => {
  ctx = await launchApp()
  const page = ctx.page
  await dismissOnboarding(page)

  const input = page.getByPlaceholder('Add new...')
  await input.fill('Table note')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await input.blur()
  await page.locator('body').press(`${MOD}+Digit3`)
  await page.getByRole('cell', { name: 'Table note' }).click()
  await page.keyboard.press('Space')
  await page.locator('.detail-panel .section-bar [data-section="table"]').click()
  await page.getByRole('button', { name: '+ Add Table' }).click()
  await expect(cell(page, 0, 'A')).toBeVisible()

  await fill(page, 0, 'A', 'a1')
  await fill(page, 0, 'B', 'b1')
  await fill(page, 1, 'A', 'a2')
  await fill(page, 1, 'B', 'b2')
  await page.locator('.spreadsheet-toolbar .table-name').click()
  await expect.poll(() => block(page, [0, 1], ['A', 'B'])).toEqual(SOURCE)
})

test.afterAll(async () => {
  await ctx.close()
})

test('the keyboard copies a block and pastes it onto a selected range', async () => {
  const page = ctx.page
  await dragSelect(page, [0, 'A'], [1, 'B'])
  await expect(page.locator('.selection-info')).toHaveText('2x2')
  await page.keyboard.press(`${MOD}+c`)
  await dragSelect(page, [3, 'C'], [4, 'D'])
  await page.keyboard.press(`${MOD}+v`)
  await expect.poll(() => block(page, [3, 4], ['C', 'D'])).toEqual(SOURCE)
})

test('the keyboard pastes a copied block starting at a clicked cell', async () => {
  const page = ctx.page
  await dragSelect(page, [0, 'A'], [1, 'B'])
  await page.keyboard.press(`${MOD}+c`)
  await cell(page, 2, 'A').click()
  await page.keyboard.press(`${MOD}+v`)
  await page.locator('.spreadsheet-toolbar .table-name').click()
  await expect.poll(() => block(page, [2, 3], ['A', 'B'])).toEqual(SOURCE)
})

test('the toolbar buttons copy a block and paste it onto a selected range', async () => {
  const page = ctx.page
  await dragSelect(page, [0, 'A'], [1, 'B'])
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await dragSelect(page, [0, 'C'], [1, 'D'])
  await page.getByRole('button', { name: 'Paste', exact: true }).click()
  await expect.poll(() => block(page, [0, 1], ['C', 'D'])).toEqual(SOURCE)
})
