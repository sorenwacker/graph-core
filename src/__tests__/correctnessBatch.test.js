import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from '../../electron/database/index.js'

let dir, db

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'gc-corr-'))
  db = new Database(join(dir, 'graph.db'))
  await db.ready
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/**
 * moveNode refuses to make a node its own ancestor, because the path rewrite
 * then walks a cycle until the stack overflows. updateNode reparents through
 * the same `parent_id` field and had no such guard, so the same corruption was
 * one API call away.
 */
describe('reparenting through updateNode', () => {
  it('refuses to put a node inside its own descendant', () => {
    const parent = db.createNode({ type: 'note', title: 'P', workspace_id: 'work' })
    const child = db.createNode({ type: 'note', title: 'C', parent_id: parent.id, workspace_id: 'work' })

    expect(() => db.updateNode(parent.id, { parent_id: child.id })).toThrow(/descendant|itself/i)
    expect(db.getNode(parent.id).parent_id).toBeNull()
  })

  it('refuses to make a node its own parent', () => {
    const n = db.createNode({ type: 'note', title: 'N', workspace_id: 'work' })
    expect(() => db.updateNode(n.id, { parent_id: n.id })).toThrow(/itself/i)
  })

  it('still allows an ordinary reparent', () => {
    const a = db.createNode({ type: 'note', title: 'A', workspace_id: 'work' })
    const b = db.createNode({ type: 'note', title: 'B', workspace_id: 'work' })
    db.updateNode(b.id, { parent_id: a.id })
    expect(db.getNode(b.id).parent_id).toBe(a.id)
  })
})

/**
 * The style column holds JSON. The renderer stringified it and the database
 * layer stringified whatever it was given, so a style round-tripped as a JSON
 * string containing JSON.
 */
describe('cell style storage', () => {
  it('stores style as JSON, not as JSON wrapped in a string', async () => {
    const { useNodeTable } = await import('../composables/useNodeTable.js')
    const calls = []
    const api = (await import('../services/api')).api
    const original = api.setCells
    api.setCells = async (nodeId, cells) => {
      calls.push(cells[0])
      return { success: true }
    }
    try {
      const t = useNodeTable()
      await t.saveCellStyle(1, 0, 0, { bold: true })
      // The database layer stringifies what it is given; handing it a string
      // stores JSON inside a JSON string.
      expect(typeof calls[0].style, 'style was pre-stringified').toBe('object')
      expect(calls[0].style).toEqual({ bold: true })
    } finally {
      api.setCells = original
    }
  })
})

/**
 * Priority sort. The importance comparator already puts the highest first, so
 * starting the column descending negated it and the first click showed the
 * least important work at the top.
 */
describe('sorting tasks by priority', () => {
  it('puts the most important first on the first click', async () => {
    const { useTaskFiltering } = await import('../composables/useTaskFiltering.js')
    const t = useTaskFiltering({ getTasks: () => [] })
    t.toggleSort('importance')
    expect(t.sortAsc.value, 'importance starts reversed').toBe(true)
  })
})

/**
 * Cmd/Ctrl+Enter opened the add-node dialog from inside a text field: the
 * branch sits above the editable guard that the later shortcuts sit below.
 */
describe('Cmd/Ctrl+Enter', () => {
  it('does not fire while the caret is in a text field', async () => {
    const source = (await import('fs')).readFileSync(
      (await import('path')).join(__dirname, '../composables/useKeyboardShortcuts.js'),
      'utf-8'
    )
    const guard = source.indexOf('if (isEditableElement(e.target)) return')
    const cmdEnter = source.indexOf("e.key === 'Enter'", source.indexOf('Cmd/Ctrl+Enter'))
    expect(guard, 'the blanket editable guard is missing').toBeGreaterThan(-1)
    expect(cmdEnter, 'Cmd/Ctrl+Enter branch not found').toBeGreaterThan(-1)
    expect(cmdEnter, 'Cmd/Ctrl+Enter is handled before the editable guard').toBeGreaterThan(guard)
  })
})

/**
 * WorkspaceSelector confirms before it emits, and only emits when the user
 * accepts. App confirmed a second time with different wording, so one deletion
 * asked twice.
 */
describe('deleting a workspace', () => {
  it('is confirmed in one place', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const app = readFileSync(join(__dirname, '../App.vue'), 'utf-8')
    const selector = readFileSync(join(__dirname, '../components/WorkspaceSelector.vue'), 'utf-8')

    expect(selector).toMatch(/confirm\(/)
    const appConfirms = (app.match(/\bconfirm\(/g) || []).length
    expect(appConfirms, 'App still confirms a deletion the selector already confirmed').toBe(0)
  })
})
