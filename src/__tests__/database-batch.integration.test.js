import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from '../../electron/database/index.js'

/**
 * Disk-level integration tests for the real Database persistence path.
 *
 * Unlike the in-memory TestDatabase helper, these exercise electron/database
 * index.js against an actual file, covering _batch()/_save() behaviour:
 * deferred single write, transactional rollback, and durable persistence.
 */

let dbPath
let db
let counter = 0

beforeEach(async () => {
  dbPath = path.join(os.tmpdir(), `graphcore-batch-${process.pid}-${counter++}.db`)
  db = new Database(dbPath)
  await db.ready
})

afterEach(() => {
  if (dbPath && fs.existsSync(dbPath)) fs.rmSync(dbPath)
})

describe('Database _batch', () => {
  it('writes to disk once for the whole batch, not per statement', () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync')

    db._batch(() => {
      db.createNode({ title: 'A', type: 'task', workspace_id: 'w' })
      db.createNode({ title: 'B', type: 'task', workspace_id: 'w' })
      db.createNode({ title: 'C', type: 'task', workspace_id: 'w' })
    })

    expect(writeSpy).toHaveBeenCalledTimes(1)
    writeSpy.mockRestore()
  })

  it('persists all batched rows', () => {
    db._batch(() => {
      db.createNode({ title: 'A', type: 'task', workspace_id: 'w' })
      db.createNode({ title: 'B', type: 'task', workspace_id: 'w' })
    })

    const roots = db.getRoots('w').filter(Boolean)
    expect(roots.map(n => n.title).sort()).toEqual(['A', 'B'])
  })

  it('rolls back and does not persist when the batch throws', () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync')

    expect(() =>
      db._batch(() => {
        db.createNode({ title: 'Keep?', type: 'task', workspace_id: 'w' })
        throw new Error('boom')
      })
    ).toThrow('boom')

    // Nothing written to disk, and the in-memory row was rolled back.
    expect(writeSpy).not.toHaveBeenCalled()
    expect(db.getRoots('w').filter(Boolean)).toHaveLength(0)
    writeSpy.mockRestore()
  })

  it('still writes once per statement outside a batch', () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync')
    db.createNode({ title: 'solo', type: 'task', workspace_id: 'w' })
    expect(writeSpy).toHaveBeenCalledTimes(1)
    writeSpy.mockRestore()
  })
})

describe('Database path/depth maintenance', () => {
  it('deleteNode recomputes path/depth of reparented children and their descendants', () => {
    const gp = db.createNode({ title: 'GP', type: 'project', workspace_id: 'w' })
    const p = db.createNode({ title: 'P', type: 'task', workspace_id: 'w', parent_id: gp.id })
    const c = db.createNode({ title: 'C', type: 'task', workspace_id: 'w', parent_id: p.id })
    const gc = db.createNode({ title: 'GC', type: 'task', workspace_id: 'w', parent_id: c.id })

    db.deleteNode(p.id)

    const child = db.getNode(c.id)
    expect(child.parent_id).toBe(gp.id)
    expect(child.path).toBe(`${gp.id}`)
    expect(child.depth).toBe(1)

    const grandchild = db.getNode(gc.id)
    expect(grandchild.path).toBe(`${gp.id}/${c.id}`)
    expect(grandchild.depth).toBe(2)

    // After emptying trash, no live path may reference the deleted node.
    db.emptyTrash()
    const stale = db._query('SELECT id FROM nodes WHERE path = ? OR path LIKE ? OR path LIKE ?', [
      `${p.id}`,
      `%/${p.id}`,
      `%/${p.id}/%`,
    ])
    expect(stale).toHaveLength(0)

    const descendants = db.getDescendants(gp.id).map(n => n.id)
    expect(descendants).toContain(c.id)
    expect(descendants).toContain(gc.id)
  })

  it('deleteNode promotes children of a deleted root to real roots', () => {
    const root = db.createNode({ title: 'Root', type: 'project', workspace_id: 'w' })
    const child = db.createNode({ title: 'Child', type: 'task', workspace_id: 'w', parent_id: root.id })

    db.deleteNode(root.id)

    const promoted = db.getNode(child.id)
    expect(promoted.parent_id).toBeNull()
    expect(promoted.path).toBe('')
    expect(promoted.depth).toBe(0)
  })

  it('reorderNode onto a target under a different parent updates path/depth of the subtree', () => {
    const rootA = db.createNode({ title: 'Root A', type: 'project', workspace_id: 'w' })
    const rootB = db.createNode({ title: 'Root B', type: 'project', workspace_id: 'w' })
    const nodeA = db.createNode({ title: 'A child', type: 'task', workspace_id: 'w', parent_id: rootA.id })
    const childOfA = db.createNode({ title: 'A grandchild', type: 'task', workspace_id: 'w', parent_id: nodeA.id })
    const nodeB = db.createNode({ title: 'B child', type: 'task', workspace_id: 'w', parent_id: rootB.id })

    db.reorderNode(nodeA.id, nodeB.id, 'before')

    const moved = db.getNode(nodeA.id)
    expect(moved.parent_id).toBe(rootB.id)
    expect(moved.path).toBe(`${rootB.id}`)
    expect(moved.depth).toBe(1)

    const movedChild = db.getNode(childOfA.id)
    expect(movedChild.path).toBe(`${rootB.id}/${nodeA.id}`)
    expect(movedChild.depth).toBe(2)

    expect(db.getDescendants(rootB.id).map(n => n.id)).toEqual(
      expect.arrayContaining([nodeA.id, childOfA.id, nodeB.id])
    )
  })

  it('reparentToRoot resets the node own path/depth and rebuilds descendants', () => {
    const root = db.createNode({ title: 'Root', type: 'project', workspace_id: 'w' })
    const mid = db.createNode({ title: 'Mid', type: 'task', workspace_id: 'w', parent_id: root.id })
    const leaf = db.createNode({ title: 'Leaf', type: 'task', workspace_id: 'w', parent_id: mid.id })

    db.reparentToRoot(mid.id)

    const rooted = db.getNode(mid.id)
    expect(rooted.parent_id).toBeNull()
    expect(rooted.path).toBe('')
    expect(rooted.depth).toBe(0)

    const child = db.getNode(leaf.id)
    expect(child.path).toBe(`${mid.id}`)
    expect(child.depth).toBe(1)
  })

  it('moveNode and deleteNode write to disk once for the whole subtree', () => {
    const rootA = db.createNode({ title: 'Root A', type: 'project', workspace_id: 'w' })
    const rootB = db.createNode({ title: 'Root B', type: 'project', workspace_id: 'w' })
    const mid = db.createNode({ title: 'Mid', type: 'task', workspace_id: 'w', parent_id: rootA.id })
    db.createNode({ title: 'Leaf 1', type: 'task', workspace_id: 'w', parent_id: mid.id })
    db.createNode({ title: 'Leaf 2', type: 'task', workspace_id: 'w', parent_id: mid.id })

    const writeSpy = vi.spyOn(fs, 'writeFileSync')

    db.moveNode(mid.id, rootB.id)
    expect(writeSpy).toHaveBeenCalledTimes(1)

    db.deleteNode(mid.id)
    expect(writeSpy).toHaveBeenCalledTimes(2)

    writeSpy.mockRestore()
  })
})

describe('Database foreign key enforcement', () => {
  it('hard delete cascades node_links rows', () => {
    const a = db.createNode({ title: 'A', type: 'task', workspace_id: 'w' })
    const b = db.createNode({ title: 'B', type: 'task', workspace_id: 'w' })
    db.linkNodes(a.id, b.id)

    db.deleteNode(a.id, true)

    expect(db._query('SELECT * FROM node_links')).toHaveLength(0)
  })

  it('emptyTrash cascades links and node tables of trashed nodes', () => {
    const a = db.createNode({ title: 'A', type: 'task', workspace_id: 'w' })
    const b = db.createNode({ title: 'B', type: 'task', workspace_id: 'w' })
    db.linkNodes(a.id, b.id)
    db.createNodeTable(a.id, { name: 'T', column_definitions: [{ name: 'col' }] })
    db.setCells(a.id, [{ row_index: 0, col_index: 0, value: 'cell' }])

    db.deleteNode(a.id) // soft delete keeps the row, so links/tables survive
    expect(db._query('SELECT * FROM node_links')).toHaveLength(1)

    db.emptyTrash()

    expect(db._query('SELECT * FROM node_links')).toHaveLength(0)
    expect(db._query('SELECT * FROM node_tables')).toHaveLength(0)
    expect(db._query('SELECT * FROM node_table_cells')).toHaveLength(0)
  })
})

describe('Database CSV round-trip', () => {
  it('re-imports CSV containing quoted newlines, commas and quotes', () => {
    const root = db.createNode({
      title: 'Root, with comma',
      type: 'project',
      workspace_id: 'w',
      notes: 'line one\nline two, with "quotes"',
    })
    db.createNode({
      title: 'Child',
      type: 'task',
      workspace_id: 'w',
      parent_id: root.id,
      notes: 'multi\nline\nnotes',
    })

    const { csv, rowCount } = db.exportCSV(root.id)
    expect(rowCount).toBe(2)

    const result = db.importCSV(csv, null, 'w2')
    expect(result.nodesImported).toBe(2)
    expect(result.rowsSkipped).toBe(0)

    const importedRoot = db.getRoots('w2').filter(Boolean)[0]
    expect(importedRoot.title).toBe('Root, with comma')
    expect(importedRoot.notes).toBe('line one\nline two, with "quotes"')

    const importedChildren = db.getChildren(importedRoot.id)
    expect(importedChildren).toHaveLength(1)
    expect(importedChildren[0].notes).toBe('multi\nline\nnotes')
  })

  it('reports skipped malformed rows instead of silently dropping them', () => {
    const csv = 'title,notes\nGood,ok\n,missing title'
    const result = db.importCSV(csv, null, 'w')
    expect(result.nodesImported).toBe(1)
    expect(result.rowsSkipped).toBe(1)
  })
})

describe('Database importJSON persistence', () => {
  it('imports a tree in one write and survives a reload from disk', async () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync')

    const result = db.importJSON(
      {
        root: {
          id: 1,
          title: 'Root',
          type: 'project',
          children: [
            { id: 2, title: 'Child 1', type: 'task' },
            { id: 3, title: 'Child 2', type: 'task', children: [{ id: 4, title: 'Grandchild', type: 'task' }] },
          ],
        },
      },
      null,
      'w'
    )

    expect(result.nodesImported).toBe(4)
    expect(writeSpy).toHaveBeenCalledTimes(1)
    writeSpy.mockRestore()

    // Reload from disk in a fresh instance and confirm the tree persisted.
    const reloaded = new Database(dbPath)
    await reloaded.ready
    const root = reloaded.getRoots('w').filter(Boolean)[0]
    expect(root.title).toBe('Root')
    const descendants = reloaded.getDescendants(root.id)
    expect(descendants).toHaveLength(3)
  })
})
