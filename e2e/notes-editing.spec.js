import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * Typing a note in the real app, across the autosave boundary.
 *
 * The notes autosave fires on every pause in typing, and each save used to come
 * back as a fresh record that the panel adopted wholesale. Text typed while the
 * write was in flight was reverted, most visibly a newline pressed just after a
 * save went out, and the whole-document replacement that reverted it also sent
 * the caret to the top of the document.
 *
 * These need the real IPC round-trip to the main process, because that is what
 * makes a save slow enough to race the typing. The detached test is the one that
 * fails against the unfixed code - the main window keeps its own copy of the
 * selected node and never hands a saved record back to the panel, so the same
 * typing is safe there. The two main-window tests cover the path that has to
 * keep working. See docs/architecture/editing.md.
 */

let ctx

test.beforeAll(async () => {
  ctx = await launchApp()
  await dismissOnboarding(ctx.page)
})

test.afterAll(async () => {
  await ctx?.close()
})

/** Open a seeded node's notes editor on the Edit tab. */
async function openNotes(page, title) {
  await page.locator('body').press(`${MOD}+Digit3`)
  const cell = page.getByRole('cell', { name: title })
  await cell.waitFor({ timeout: 10000 })
  await cell.click()
  await expect(page.locator('.node-row.selected')).toBeVisible()
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()

  const editor = page.locator('.cm-content').first()
  await editor.waitFor({ timeout: 10000 })
  await editor.click()
  return editor
}

test('keeps every character typed across an autosave', async () => {
  const page = ctx.page

  await page.evaluate(() =>
    window.electronAPI.createNode({ type: 'note', title: 'Autosave race', notes: '', workspace_id: 'work' })
  )
  await page.reload()
  await dismissOnboarding(page)

  const editor = await openNotes(page, 'Autosave race')
  await page.keyboard.press(`${MOD}+End`)

  // The autosave fires after a pause, so pause deliberately and then keep
  // typing while its write is still in flight. This is the sequence a user
  // produces by thinking mid-sentence, and it is what used to lose text.
  await page.keyboard.type('first line')
  await page.waitForTimeout(700)
  await page.keyboard.press('Enter')
  await page.keyboard.type('second line')
  await page.waitForTimeout(700)
  await page.keyboard.press('Enter')
  await page.keyboard.type('third line')
  await page.waitForTimeout(900)

  expect(await editor.innerText()).toBe('first line\nsecond line\nthird line')
})

test('leaves the caret where it was put', async () => {
  const page = ctx.page

  await page.evaluate(() =>
    window.electronAPI.createNode({
      type: 'note',
      title: 'Caret stability',
      notes: 'alpha\nbravo\ncharlie',
      workspace_id: 'work',
    })
  )
  await page.reload()
  await dismissOnboarding(page)

  const editor = await openNotes(page, 'Caret stability')

  // Type at the end of the first line, let the save round-trip finish without
  // touching the keyboard, then type again. Where the second character lands is
  // where the caret was left: a caret dragged to the top of the document by an
  // incoming value puts it in front of everything instead.
  await page.keyboard.press(`${MOD}+ArrowUp`)
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await page.waitForTimeout(900)
  await page.keyboard.type('?')

  expect(await editor.innerText()).toBe('alpha!?\nbravo\ncharlie')
})

/**
 * The same edit in a detached window, which is where the clobber actually bit.
 *
 * The main window keeps its own copy of the selected node and does not hand a
 * saved record back to the panel, so the race is invisible there. A detached
 * window assigned the record it had just saved straight back into the panel's
 * `node` prop - the record from before the write, already behind whatever was
 * typed during it. Both tests below pass in the main window against the unfixed
 * code and fail here, which is why the detached path is the one gated.
 */
test('keeps text typed in a detached window across an autosave', async () => {
  const page = ctx.page

  await page.evaluate(() =>
    window.electronAPI.createNode({ type: 'note', title: 'Detached race', notes: '', workspace_id: 'work' })
  )
  await page.reload()
  await dismissOnboarding(page)

  await openNotes(page, 'Detached race')
  const opened = ctx.app.waitForEvent('window')
  await page.locator('.detach-btn').click()
  const detached = await opened
  await detached.waitForLoadState('domcontentloaded')

  await detached.getByRole('button', { name: 'Edit', exact: true }).click()
  const editor = detached.locator('.cm-content').first()
  await editor.waitFor({ timeout: 10000 })
  await editor.click()
  await editor.press(`${MOD}+End`)

  await detached.keyboard.type('first line')
  await detached.waitForTimeout(700)
  await detached.keyboard.press('Enter')
  await detached.keyboard.type('second line')
  await detached.waitForTimeout(700)
  await detached.keyboard.press('Enter')
  await detached.keyboard.type('third line')
  await detached.waitForTimeout(900)

  expect(await editor.innerText()).toBe('first line\nsecond line\nthird line')

  // The text that reached the database is the text on screen, not a stale
  // snapshot from a save that raced the typing.
  const stored = await page.evaluate(async () => {
    const rows = await window.electronAPI.getRoots('work')
    const match = rows.find(r => r.title === 'Detached race')
    return (await window.electronAPI.getNode(match.id)).notes
  })
  expect(stored).toBe('first line\nsecond line\nthird line')

  await detached.close()
})
