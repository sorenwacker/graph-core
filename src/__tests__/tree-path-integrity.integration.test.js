import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from '../../electron/database/index.js'

/**
 * Integration tests for the materialized-path invariant of the node tree.
 *
 * Every operation that changes a node's parent must reset that node's OWN
 * `depth`/`path` and then recompute its descendants, so that:
 *   - depth equals the number of ancestors, and
 *   - path is the slash-joined ids of the ancestors (root first), referencing
 *     only live ancestors.
 *
 * These exercise the real electron/database operations (not the in-memory
 * TestDatabase helper), covering deleteNode child-reassignment, deleting a
 * root, and reparentToRoot.
 */

let dbPath
let db
let counter = 0

beforeEach(async () => {
  dbPath = path.join(os.tmpdir(), `graphcore-treepath-${process.pid}-${counter++}.db`)
  db = new Database(dbPath)
  await db.ready
})

afterEach(() => {
  if (dbPath && fs.existsSync(dbPath)) fs.rmSync(dbPath)
})

function node(title, parentId = null) {
  return db.createNode({ title, type: 'task', workspace_id: 'w', parent_id: parentId })
}

describe('tree path/depth invariant', () => {
  it('deleteNode reassigns children to the grandparent with correct own depth/path', () => {
    const g = node('G')
    const p = node('P', g.id)
    const c = node('C', p.id)
    const gc = node('GC', c.id)

    // Sanity: initial materialized path/depth.
    expect(db.getNode(c.id).depth).toBe(2)
    expect(db.getNode(c.id).path).toBe(`${g.id}/${p.id}`)
    expect(db.getNode(gc.id).depth).toBe(3)
    expect(db.getNode(gc.id).path).toBe(`${g.id}/${p.id}/${c.id}`)

    db.deleteNode(p.id)

    // C now hangs off G directly: its own depth/path must be reset.
    const cAfter = db.getNode(c.id)
    expect(cAfter.parent_id).toBe(g.id)
    expect(cAfter.depth).toBe(1)
    expect(cAfter.path).toBe(`${g.id}`)

    // GC's path/depth is recomputed from C's corrected state and references no
    // deleted node.
    const gcAfter = db.getNode(gc.id)
    expect(gcAfter.depth).toBe(2)
    expect(gcAfter.path).toBe(`${g.id}/${c.id}`)
    expect(gcAfter.path).not.toContain(`${p.id}`)
  })

  it('keeps depth-capped descendant queries and ancestors correct after delete', () => {
    const g = node('G')
    const p = node('P', g.id)
    const c = node('C', p.id)
    const gc = node('GC', c.id)

    db.deleteNode(p.id)

    // maxDepth=1 from G should now include C (depth 1) but not GC (depth 2).
    const depth1 = db.getDescendants(g.id, 1).map(n => n.id)
    expect(depth1).toContain(c.id)
    expect(depth1).not.toContain(gc.id)

    // Ancestors of GC are exactly G then C.
    expect(db.getAncestors(gc.id).map(n => n.id)).toEqual([g.id, c.id])
  })

  it('deleting a root promotes children to roots with depth 0 and empty path', () => {
    const r = node('R')
    const c = node('C', r.id)
    const gc = node('GC', c.id)

    db.deleteNode(r.id)

    const cAfter = db.getNode(c.id)
    expect(cAfter.parent_id).toBeNull()
    expect(cAfter.depth).toBe(0)
    expect(cAfter.path).toBe('')

    const gcAfter = db.getNode(gc.id)
    expect(gcAfter.depth).toBe(1)
    expect(gcAfter.path).toBe(`${c.id}`)
  })

  it('reparentToRoot resets the node own depth/path and recomputes descendants', () => {
    const g = node('G')
    const p = node('P', g.id)
    const c = node('C', p.id)

    const moved = db.reparentToRoot(p.id)
    expect(moved.parent_id).toBeNull()
    expect(moved.depth).toBe(0)
    expect(moved.path).toBe('')

    const cAfter = db.getNode(c.id)
    expect(cAfter.depth).toBe(1)
    expect(cAfter.path).toBe(`${p.id}`)
  })
})
