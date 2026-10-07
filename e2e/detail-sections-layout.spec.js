import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * How the detail panel's sections share its space
 * (docs/guides/detail-panel.md#how-sections-share-the-panel).
 *
 * Measured in the running app, in a window short enough that an open Metadata
 * section does not fit beside the notes. The rules are geometry, so the test
 * reads rectangles rather than CSS source: collapsed headers share a row above
 * the open sections, an open section starts at the panel's left edge, and open
 * notes keep their share of the height instead of being scrolled away.
 *
 * The detached window is not driven here: it renders the same panel with the
 * same `fullscreen` class, so the fullscreen cases cover its layout.
 */

const NOTES_MIN_SHARE = 0.4
const PX = 1.5

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
  await expect(ctx.page.locator('.detail-panel .notes-section')).toBeVisible()
})

test.afterAll(async () => {
  await ctx.close()
})

function measure(page) {
  return page.evaluate(() => {
    const rect = el => {
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, height: r.height }
    }
    const section = selector => {
      const el = document.querySelector(`.detail-panel ${selector}`)
      if (!el) return null
      return {
        collapsed: el.classList.contains('collapsed'),
        box: rect(el),
        header: rect(el.querySelector('.section-header')),
      }
    }
    const outer = document.querySelector('.detail-panel .collapsible-sections')
    const lower = document.querySelector('.detail-panel .bottom-sections')
    return {
      outer: { ...rect(outer), scrollHeight: outer.scrollHeight, clientHeight: outer.clientHeight },
      lower: lower ? rect(lower) : null,
      notes: section('.notes-section'),
      table: section('.table-section'),
      tasks: section('.children-section'),
      meta: section('.meta-section'),
    }
  })
}

async function setCollapsed(page, selector, collapsed) {
  const section = page.locator(`.detail-panel ${selector}`)
  const isCollapsed = await section.evaluate(el => el.classList.contains('collapsed'))
  if (isCollapsed !== collapsed) await section.locator('.section-header').first().click()
  if (collapsed) await expect(section).toHaveClass(/collapsed/)
  else await expect(section).not.toHaveClass(/collapsed/)
}

async function setFullscreen(page, fullscreen) {
  const panel = page.locator('.detail-panel')
  const isFullscreen = await panel.evaluate(el => el.classList.contains('fullscreen'))
  if (isFullscreen !== fullscreen) await page.locator('.detail-panel .fullscreen-btn').click()
  if (fullscreen) await expect(panel).toHaveClass(/fullscreen/)
  else await expect(panel).not.toHaveClass(/fullscreen/)
}

function expectHeaderRowAbove(m, collapsedNames, openName) {
  const [first, ...rest] = collapsedNames.map(name => m[name].header)
  for (const header of rest) {
    expect(Math.abs(header.top - first.top)).toBeLessThanOrEqual(PX)
  }
  for (const header of [first, ...rest]) {
    expect(m[openName].box.top).toBeGreaterThanOrEqual(header.bottom - PX)
  }
  expect(Math.abs(m[openName].box.left - m.lower.left)).toBeLessThanOrEqual(PX)
}

function expectNotesKeepTheirShare(m) {
  expect(m.outer.scrollHeight).toBeLessThanOrEqual(m.outer.clientHeight + PX)
  expect(m.notes.box.height).toBeGreaterThanOrEqual(m.outer.clientHeight * NOTES_MIN_SHARE - PX)
  expect(m.notes.box.top).toBeGreaterThanOrEqual(m.outer.top - PX)
}

for (const mode of ['side panel', 'fullscreen']) {
  test.describe(mode, () => {
    test.beforeEach(async () => {
      await setFullscreen(ctx.page, mode === 'fullscreen')
      await setCollapsed(ctx.page, '.children-section', true)
      await setCollapsed(ctx.page, '.meta-section', true)
    })

    test('collapsed headers share a row above an open Metadata section', async () => {
      await setCollapsed(ctx.page, '.meta-section', false)
      expectHeaderRowAbove(await measure(ctx.page), ['table', 'tasks'], 'meta')
    })

    test('collapsed headers share a row above an open Tasks section', async () => {
      await setCollapsed(ctx.page, '.children-section', false)
      expectHeaderRowAbove(await measure(ctx.page), ['table', 'meta'], 'tasks')
    })

    test('section titles and open contents share one left edge', async () => {
      await setCollapsed(ctx.page, '.meta-section', false)
      const lefts = await ctx.page.evaluate(() => {
        const left = selector => document.querySelector(`.detail-panel ${selector}`).getBoundingClientRect().left
        return {
          notesTitle: left('.notes-section .section-title'),
          notesContent: left('.notes-section .tabs-row'),
          tableTitle: left('.table-section .section-title'),
          metaTitle: left('.meta-section .section-title'),
          metaContent: left('.meta-section .meta-item label'),
        }
      })
      for (const [name, value] of Object.entries(lefts)) {
        expect(Math.abs(value - lefts.notesTitle), name).toBeLessThanOrEqual(PX)
      }
    })

    test('open Tasks and Metadata sections are placed for the mode', async () => {
      await setCollapsed(ctx.page, '.children-section', false)
      await setCollapsed(ctx.page, '.meta-section', false)
      const m = await measure(ctx.page)
      expect(m.tasks.box.top).toBeGreaterThanOrEqual(m.table.header.bottom - PX)
      if (mode === 'fullscreen') {
        // Wide enough for both: they share the row below the header.
        expect(Math.abs(m.meta.box.top - m.tasks.box.top)).toBeLessThanOrEqual(PX)
      } else {
        expect(m.meta.box.top).toBeGreaterThanOrEqual(m.tasks.box.bottom - PX)
        expect(Math.abs(m.meta.box.left - m.lower.left)).toBeLessThanOrEqual(PX)
      }
    })

    test('open notes keep their share of the height when Metadata is open', async () => {
      await setCollapsed(ctx.page, '.meta-section', false)
      expectNotesKeepTheirShare(await measure(ctx.page))
    })
  })
}

test('open notes keep their share of the height on a person node', async () => {
  await setFullscreen(ctx.page, false)
  await setCollapsed(ctx.page, '.meta-section', false)
  await ctx.page.locator('.detail-panel .meta-section select').first().selectOption('person')
  await expect(ctx.page.locator('.detail-panel .person-form')).toBeVisible()
  await setCollapsed(ctx.page, '.meta-section', false)
  expectNotesKeepTheirShare(await measure(ctx.page))
})
