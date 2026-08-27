import { test, expect } from '@playwright/test'
import { launchApp, dismissOnboarding, MOD } from './helpers.js'

/**
 * Regressions fixed in 1.17.0, exercised against the built app in an isolated
 * profile. These are the cases where a failure either destroys data or is
 * invisible until a user hits it, so the unit suite alone is not enough: each
 * one depends on the real main process, the real database file, or both.
 *
 * Two styles are used deliberately:
 *
 * - Fixes that are a UI behaviour (list continuation, result ordering) are
 *   driven through the interface, because the interface is where they broke.
 * - Fixes that are a database invariant (cell reindexing, trash reattachment,
 *   acyclicity) are driven through `window.electronAPI`. That is the real
 *   preload bridge into the real main process, which is the layer those fixes
 *   live in, and it does not depend on grid internals that would make the test
 *   flake for reasons unrelated to the invariant.
 */

let ctx

const bridge = (page, fn, arg) => page.evaluate(fn, arg)

test.beforeAll(async () => {
  ctx = await launchApp()
  await dismissOnboarding(ctx.page)
})

test.afterAll(async () => {
  // beforeAll can refuse to launch (isolation gate), leaving no context.
  await ctx?.close()
})

test('deleting a table column takes its cells with it', async () => {
  const result = await bridge(ctx.page, async () => {
    const api = window.electronAPI
    const node = await api.createNode({ type: 'note', title: 'Column integrity', workspace_id: 'work' })
    await api.createNodeTable(node.id, {
      name: 'T',
      column_definitions: [
        { id: 'a', name: 'A', type: 'text' },
        { id: 'b', name: 'B', type: 'text' },
        { id: 'c', name: 'C', type: 'text' },
        { id: 'd', name: 'D', type: 'text' },
      ],
      row_count: 1,
    })
    await api.setCells(node.id, [
      { row_index: 0, col_index: 0, value: 'a0' },
      { row_index: 0, col_index: 1, value: 'b0' },
      { row_index: 0, col_index: 2, value: 'c0' },
      { row_index: 0, col_index: 3, value: 'd0' },
    ])

    await api.deleteTableColumn(node.id, 1)

    const table = await api.getNodeTable(node.id)
    const cells = await api.getTableCells(node.id)
    return {
      columns: table.column_definitions.map(c => c.name),
      values: cells.sort((x, y) => x.col_index - y.col_index).map(c => c.value),
    }
  })

  // Each surviving column must still show its own data, not its neighbour's,
  // and the deleted column's cells must not be stranded past the last column.
  expect(result.columns).toEqual(['A', 'C', 'D'])
  expect(result.values).toEqual(['a0', 'c0', 'd0'])
})

test('typing into a styled cell keeps the styling', async () => {
  const style = await bridge(ctx.page, async () => {
    const api = window.electronAPI
    const node = await api.createNode({ type: 'note', title: 'Cell styling', workspace_id: 'work' })
    await api.createNodeTable(node.id, {
      name: 'T',
      column_definitions: [{ id: 'a', name: 'A', type: 'text' }],
      row_count: 1,
    })
    await api.setCells(node.id, [{ row_index: 0, col_index: 0, value: 'before', style: { bold: true } }])
    // A value written on its own, exactly as committing an edit does.
    await api.setCells(node.id, [{ row_index: 0, col_index: 0, value: 'typed over' }])

    const cell = (await api.getTableCells(node.id))[0]
    return { value: cell.value, style: cell.style }
  })

  expect(style.value).toBe('typed over')
  expect(style.style).toEqual({ bold: true })
})

test('restoring an item whose parent is still trashed puts it somewhere visible', async () => {
  const restored = await bridge(ctx.page, async () => {
    const api = window.electronAPI
    const root = await api.createNode({ type: 'project', title: 'Reachability root', workspace_id: 'work' })
    const mid = await api.createNode({
      type: 'project',
      title: 'Reachability mid',
      parent_id: root.id,
      workspace_id: 'work',
    })
    const leaf = await api.createNode({
      type: 'task',
      title: 'Reachability leaf',
      parent_id: mid.id,
      workspace_id: 'work',
    })

    // Trash the child first: deleting a parent only reparents children that
    // are still live, so this is what leaves a node pointing at a trashed one.
    await api.deleteNode(leaf.id, false)
    await api.deleteNode(mid.id, false)
    await api.restoreNode(leaf.id)

    const node = await api.getNode(leaf.id)
    const rootChildren = await api.getChildren(root.id)
    return { parentId: node.parent_id, rootId: root.id, underRoot: rootChildren.some(c => c.id === leaf.id) }
  })

  // Restored in place it would be neither a root nor a child of anything shown.
  expect(restored.parentId).toBe(restored.rootId)
  expect(restored.underRoot).toBe(true)
})

test('an item cannot be moved into its own descendant', async () => {
  const outcome = await bridge(ctx.page, async () => {
    const api = window.electronAPI
    const parent = await api.createNode({ type: 'project', title: 'Cycle parent', workspace_id: 'work' })
    const child = await api.createNode({
      type: 'project',
      title: 'Cycle child',
      parent_id: parent.id,
      workspace_id: 'work',
    })

    let message = null
    try {
      await api.moveNode(parent.id, child.id)
    } catch (e) {
      message = String(e?.message || e)
    }
    const after = await api.getNode(parent.id)
    return { message, parentId: after.parent_id }
  })

  // The old code also threw here - by overflowing the call stack while the
  // path rebuild walked the cycle it had just created. Any-throw therefore
  // passed against the bug, so the guard's own message is what is asserted.
  expect(outcome.message).toMatch(/descendant|itself/i)
  expect(outcome.parentId).toBeNull()
})

test('linking the same pair twice stores one link either way round', async () => {
  const links = await bridge(ctx.page, async () => {
    const api = window.electronAPI
    const a = await api.createNode({ type: 'note', title: 'Link A', workspace_id: 'work' })
    const b = await api.createNode({ type: 'note', title: 'Link B', workspace_id: 'work' })

    await api.linkNodes(a.id, b.id)
    const second = await api.linkNodes(b.id, a.id) // the reverse direction

    // getLinkedNodes resolves to nodes and hides a duplicate row, so count the
    // stored links for the pair instead.
    const all = await api.getAllLinks([a.id, b.id])
    const rows = all.filter(
      l => (l.source_id === a.id && l.target_id === b.id) || (l.source_id === b.id && l.target_id === a.id)
    ).length
    return { rows, secondAccepted: second?.success !== false }
  })

  // The reverse direction is the same link, so it must be refused and must not
  // add a second row.
  expect(links.rows).toBe(1)
  expect(links.secondAccepted).toBe(false)
})

test('search puts the item a query names above notes that mention it', async () => {
  const order = await bridge(ctx.page, async () => {
    const api = window.electronAPI
    const person = await api.createNode({ type: 'person', title: 'Test Person Alpha', workspace_id: 'work' })
    const note = await api.createNode({
      type: 'note',
      title: 'Intake meeting',
      notes: 'Test Person Alpha attended',
      workspace_id: 'work',
    })

    // Stored timestamps have one-second resolution, so creating the two in
    // order leaves them equal and the old date-only ranking returned them in
    // insertion order - which happened to look right. Wait past the second
    // boundary and touch the note, so it is strictly the newer row and date
    // ranking would definitely put it first.
    await new Promise(r => setTimeout(r, 1200))
    await api.updateNode(note.id, { title: 'Intake meeting' })

    const results = await api.search('Alpha', null, 'work', { limit: 10, offset: 0 })
    return { titles: results.map(r => r.title), personId: person.id, firstId: results[0]?.id }
  })

  expect(order.titles[0]).toBe('Test Person Alpha')
  expect(order.firstId).toBe(order.personId)
})

test('the notes editor continues a list without inserting blank lines', async () => {
  const page = ctx.page

  // Seed a list that already holds a blank line. A freshly typed two-item list
  // is tight, and the old code only inserted a blank line into a list that was
  // already loose - so typing one from scratch passed against the bug.
  await bridge(page, async () => {
    await window.electronAPI.createNode({
      type: 'note',
      title: 'List behaviour',
      notes: '- Anne\n\n- Bravo',
      workspace_id: 'work',
    })
  })
  await page.reload()
  await dismissOnboarding(page)

  // Same path split-view.spec.js uses: select the row in Table view, then
  // Space opens the detail panel with the notes editor on its Edit tab.
  // A double-click in the graph navigates into the node instead.
  await page.locator('body').press(`${MOD}+Digit3`)
  const cell = page.getByRole('cell', { name: 'List behaviour' })
  await cell.waitFor({ timeout: 10000 })
  await cell.click()
  // Assert the row is selected before the shortcut: a click landing mid-render
  // leaves nothing selected and Space then opens nothing.
  await expect(page.locator('.node-row.selected')).toBeVisible()
  await page.keyboard.press('Space')

  // The notes section opens on whichever tab was last used; CodeMirror only
  // renders on Edit and Split, so choose one explicitly.
  await page.getByRole('button', { name: 'Edit', exact: true }).click()

  const editor = page.locator('.cm-content').first()
  await editor.waitFor({ timeout: 10000 })
  await editor.click()
  // Put the caret at the very end of the loose list, then continue it.
  await page.keyboard.press(`${MOD}+End`)
  await page.keyboard.press('Enter')
  await page.keyboard.type('Charlie')

  const text = await editor.innerText()
  // The new item follows the previous one directly. The old code preserved the
  // list's looseness by inserting another blank line ahead of every marker, so
  // one stray blank line made every later Enter add one too.
  expect(text).toContain('Charlie')
  expect(text).not.toMatch(/- Bravo\s*\n\s*\n\s*- Charlie/)
})

test('undo does not reach into the workspace you left', async () => {
  const page = ctx.page

  const before = await bridge(page, async () => {
    const api = window.electronAPI
    const node = await api.createNode({ type: 'note', title: 'Workspace scope', workspace_id: 'work' })
    return node.id
  })

  // Make an undoable edit through the interface so it lands on the stack.
  await page.reload()
  await dismissOnboarding(page)
  await page.getByPlaceholder('Add new...').fill('Undo scope probe')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Undo scope probe').first()).toBeVisible()
  await page.getByPlaceholder('Add new...').blur()

  const undo = page.getByRole('button', { name: 'Undo' })
  await expect(undo).toBeEnabled()

  // Switching workspace must clear the stack: commands record item ids, which
  // carry no workspace, so an undo afterwards would edit something unseen.
  const others = await page.evaluate(async () => {
    const workspaces = await window.electronAPI.getWorkspaces()
    return workspaces.map(w => w.id)
  })
  const target = others.find(id => id !== 'work')
  test.skip(!target, 'needs a second workspace to switch to')

  // The switcher is a select, not a menu.
  await page.locator('.workspace-dropdown').selectOption(target)

  await expect(undo).toBeDisabled()
  expect(before).toBeGreaterThan(0)
})
