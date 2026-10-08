import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * The detail panel's section bar and how the sections share the panel
 * (docs/guides/detail-panel.md#section-bar).
 *
 * Measured in the running app, in a window short enough that an open Metadata
 * section does not fit beside the notes. The rules are geometry, so the test
 * reads rectangles rather than CSS source: the section buttons stay where they
 * are whatever is open, open sections follow the order of the buttons, and
 * open notes keep their share of the height instead of being scrolled away.
 *
 * The detached window is not driven here: it renders the same panel with the
 * same `fullscreen` class, so the fullscreen cases cover its layout.
 */

const NOTES_MIN_SHARE = 0.4
const PX = 1.5
const SECTIONS = ['notes', 'table', 'tasks', 'metadata']
const BODY = {
  notes: '.notes-section',
  table: '.table-section',
  tasks: '.children-section',
  metadata: '.meta-section',
}

let ctx

test.beforeAll(async () => {
  ctx = await launchApp()
  await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1400, 640))
  await dismissOnboarding(ctx.page)

  const input = ctx.page.getByPlaceholder('Add new...')
  await input.fill('Layout note')
  await ctx.page.getByRole('button', { name: 'Add', exact: true }).click()
  await input.blur()
  await ctx.page.locator('body').press(`${MOD}+Digit3`)
  await ctx.page.getByRole('cell', { name: 'Layout note' }).click()
  await ctx.page.keyboard.press('Space')
  await expect(ctx.page.locator('.detail-panel .section-bar')).toBeVisible()
  // The panel slides in; positions read during the slide are not the layout.
  await expect
    .poll(() =>
      ctx.page.evaluate(() =>
        Math.abs(innerWidth - document.querySelector('.detail-panel').getBoundingClientRect().right)
      )
    )
    .toBeLessThanOrEqual(PX)
})

test.afterAll(async () => {
  await ctx.close()
})

const toggle = (page, key) => page.locator(`.detail-panel .section-bar [data-section="${key}"]`)

async function setOpen(page, key, open) {
  const button = toggle(page, key)
  if ((await button.getAttribute('aria-pressed')) !== String(open)) await button.click()
  await expect(button).toHaveAttribute('aria-pressed', String(open))
  if (BODY[key]) {
    const body = page.locator(`.detail-panel ${BODY[key]}`)
    if (open) await expect(body).toBeVisible()
    else await expect(body).toBeHidden()
  }
}

async function setOpenSections(page, openKeys) {
  for (const key of SECTIONS) await setOpen(page, key, openKeys.includes(key))
}

async function setFullscreen(page, fullscreen) {
  const panel = page.locator('.detail-panel')
  const isFullscreen = await panel.evaluate(el => el.classList.contains('fullscreen'))
  if (isFullscreen !== fullscreen) await page.locator('.detail-panel .fullscreen-btn').click()
  if (fullscreen) await expect(panel).toHaveClass(/fullscreen/)
  else await expect(panel).not.toHaveClass(/fullscreen/)
}

function measure(page) {
  return page.evaluate(bodies => {
    const rect = el => {
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, height: r.height, width: r.width }
    }
    const visible = el => el && el.getClientRects().length > 0
    const panel = document.querySelector('.detail-panel')
    const outer = panel.querySelector('.collapsible-sections')
    const body = {}
    for (const [key, selector] of Object.entries(bodies)) {
      const el = panel.querySelector(selector)
      body[key] = visible(el) ? rect(el) : null
    }
    const buttons = {}
    for (const el of panel.querySelectorAll('.section-bar [data-section]')) buttons[el.dataset.section] = rect(el)
    return {
      buttons,
      body,
      outer: { ...rect(outer), scrollHeight: outer.scrollHeight, clientHeight: outer.clientHeight },
    }
  }, BODY)
}

function expectNotesKeepTheirShare(m) {
  expect(m.outer.scrollHeight).toBeLessThanOrEqual(m.outer.clientHeight + PX)
  expect(m.body.notes.height).toBeGreaterThanOrEqual(m.outer.clientHeight * NOTES_MIN_SHARE - PX)
  expect(m.body.notes.top).toBeGreaterThanOrEqual(m.outer.top - PX)
}

for (const mode of ['side panel', 'fullscreen']) {
  test.describe(mode, () => {
    test.beforeEach(async () => {
      await setFullscreen(ctx.page, mode === 'fullscreen')
      await setOpenSections(ctx.page, ['notes'])
    })

    test('the section buttons stay in place whatever is open', async () => {
      const baseline = (await measure(ctx.page)).buttons
      expect(Object.keys(baseline)).toEqual(SECTIONS)
      for (const key of SECTIONS) expect(Math.abs(baseline[key].top - baseline.notes.top)).toBeLessThanOrEqual(PX)

      const combinations = [['notes', 'metadata'], ['notes', 'tasks'], ['notes', 'table'], ['metadata'], [], SECTIONS]
      for (const open of combinations) {
        await setOpenSections(ctx.page, open)
        const { buttons } = await measure(ctx.page)
        for (const key of SECTIONS) {
          for (const side of ['left', 'top', 'width', 'height']) {
            const moved = Math.abs(buttons[key][side] - baseline[key][side])
            expect(moved, `${key}.${side} with [${open}] open`).toBeLessThanOrEqual(PX)
          }
        }
      }
    })

    test('a button does not move under the pointer', async () => {
      const before = (await measure(ctx.page)).buttons.table
      await toggle(ctx.page, 'table').hover()
      // Long enough for a hover transition to finish, so a lift would show.
      await ctx.page.waitForTimeout(400)
      const after = (await measure(ctx.page)).buttons.table
      expect(Math.abs(after.top - before.top)).toBeLessThan(0.1)
      expect(Math.abs(after.left - before.left)).toBeLessThan(0.1)
    })

    test('an open section is no taller or wider than its contents need', async () => {
      await setOpenSections(ctx.page, ['table'])
      const m = await ctx.page.evaluate(() => {
        const section = document.querySelector('.detail-panel .table-section')
        const lower = document.querySelector('.detail-panel .bottom-sections')
        const button = section.querySelector('.create-table-btn').getBoundingClientRect()
        return {
          spare: section.getBoundingClientRect().height - button.height,
          sideways: lower.scrollWidth - lower.clientWidth,
        }
      })
      expect(m.spare).toBeLessThan(60)
      expect(m.sideways).toBeLessThanOrEqual(PX)
    })

    test('a section body carries no title of its own', async () => {
      await setOpenSections(ctx.page, SECTIONS)
      await expect(ctx.page.locator('.detail-panel .collapsible-sections .section-title')).toHaveCount(0)
    })

    test('the buttons and the contents of open sections share one left edge', async () => {
      await setOpenSections(ctx.page, ['notes', 'metadata'])
      const lefts = await ctx.page.evaluate(() => {
        const left = selector => document.querySelector(`.detail-panel ${selector}`).getBoundingClientRect().left
        return {
          firstButton: left('.section-bar [data-section]'),
          notesContent: left('.notes-section .tabs-row'),
          metaContent: left('.meta-section .meta-item label'),
        }
      })
      for (const [name, value] of Object.entries(lefts)) {
        expect(Math.abs(value - lefts.firstButton), name).toBeLessThanOrEqual(PX)
      }
    })

    test('open sections follow the order of the buttons', async () => {
      await setOpenSections(ctx.page, SECTIONS)
      const { body } = await measure(ctx.page)
      expect(body.table.top).toBeGreaterThanOrEqual(body.notes.bottom - PX)
      expect(body.tasks.top).toBeGreaterThanOrEqual(body.table.bottom - PX)
      if (mode === 'fullscreen') {
        // Wide enough for both: Tasks and Metadata share the row below the table.
        expect(Math.abs(body.metadata.top - body.tasks.top)).toBeLessThanOrEqual(PX)
        expect(body.metadata.left).toBeGreaterThan(body.tasks.left)
      } else {
        expect(body.metadata.top).toBeGreaterThanOrEqual(body.tasks.bottom - PX)
      }
    })

    test('open notes keep their share of the height when Metadata is open', async () => {
      await setOpenSections(ctx.page, ['notes', 'metadata'])
      expectNotesKeepTheirShare(await measure(ctx.page))
    })
  })
}

test('action labels stay on one line, and on one row at the default panel width', async () => {
  await setFullscreen(ctx.page, false)
  const m = await ctx.page.evaluate(() => {
    const actions = document.querySelector('.detail-panel .detail-actions')
    const buttons = [...actions.querySelectorAll(':scope > button, :scope > .export-dropdown > button')]
    const rect = actions.getBoundingClientRect()
    return {
      tops: buttons.map(b => b.getBoundingClientRect().top),
      heights: buttons.map(b => b.getBoundingClientRect().height),
      labels: buttons.map(b => b.textContent.trim()),
      overflow: Math.max(...buttons.map(b => b.getBoundingClientRect().right)) - rect.right,
    }
  })
  expect(m.labels).toEqual(['Wrap with Parent', 'Move to Root', 'Export', 'Delete'])
  for (const height of m.heights) expect(Math.abs(height - m.heights[3])).toBeLessThanOrEqual(PX)
  expect(m.overflow).toBeLessThanOrEqual(PX)
  // At the default panel width all four share one row.
  for (const top of m.tops) expect(Math.abs(top - m.tops[0])).toBeLessThanOrEqual(PX)
})

test('a person node has the same bar and the same notes share', async () => {
  await setFullscreen(ctx.page, false)
  await setOpenSections(ctx.page, ['notes', 'metadata'])
  await ctx.page.locator('.detail-panel .meta-section select').first().selectOption('person')
  await expect(ctx.page.locator('.detail-panel .person-form')).toBeVisible()

  const before = (await measure(ctx.page)).buttons
  expect(Object.keys(before)).toEqual(['notes', 'details'])
  await setOpen(ctx.page, 'details', true)
  const m = await measure(ctx.page)
  for (const key of ['notes', 'details']) {
    expect(Math.abs(m.buttons[key].left - before[key].left)).toBeLessThanOrEqual(PX)
    expect(Math.abs(m.buttons[key].top - before[key].top)).toBeLessThanOrEqual(PX)
  }
  expectNotesKeepTheirShare(m)
})
