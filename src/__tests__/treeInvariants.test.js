import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase, createNodeFactory } from './helpers/testDatabase.js'

/**
 * Two invariants the tree has to keep: every live node is reachable from a root,
 * and no node is its own ancestor. Restoring a node under a still-trashed parent
 * breaks the first; moving a node under its own descendant breaks the second and
 * makes the recursive path update walk a cycle.
 */

let db, factory

beforeEach(async () => {
  db = await createTestDatabase()
  factory = createNodeFactory(db)
})

afterEach(() => db.close())

describe('restoring a node from the trash', () => {
  it('reattaches it to the nearest live ancestor when its parent is still trashed', () => {
    const root = factory.project({ title: 'Root' })
    const mid = factory.project({ title: 'Mid', parent_id: root.id })
    const leaf = factory.task({ title: 'Leaf', parent_id: mid.id })

    db.deleteNode(leaf.id, false)
    db.deleteNode(mid.id, false)
    db.restoreNode(leaf.id)

    // Its own parent is still in the trash, so the leaf would be invisible:
    // not a root, and not a child of anything the tree shows.
    const restored = db.getNode(leaf.id)
    expect(restored.parent_id).toBe(root.id)
    expect(db.getChildren(root.id).map(n => n.id)).toContain(leaf.id)
  })

  it('reattaches it to the root level when no ancestor survives', () => {
    const parent = factory.project({ title: 'Parent' })
    const child = factory.task({ title: 'Child', parent_id: parent.id })

    db.deleteNode(child.id, false)
    db.deleteNode(parent.id, false)
    db.restoreNode(child.id)

    expect(db.getNode(child.id).parent_id).toBeNull()
  })

  it('recomputes depth and path when it is reattached', () => {
    const root = factory.project({ title: 'Root' })
    const mid = factory.project({ title: 'Mid', parent_id: root.id })
    const leaf = factory.task({ title: 'Leaf', parent_id: mid.id })

    db.deleteNode(leaf.id, false)
    db.deleteNode(mid.id, false)
    db.restoreNode(leaf.id)

    const restored = db.getNode(leaf.id)
    expect(restored.depth).toBe(1)
    expect(restored.path).toBe(String(root.id))
  })

  it('leaves the parent alone when it is still live', () => {
    const parent = factory.project({ title: 'Parent' })
    const child = factory.task({ title: 'Child', parent_id: parent.id })

    db.deleteNode(child.id, false)
    db.restoreNode(child.id)

    expect(db.getNode(child.id).parent_id).toBe(parent.id)
  })
})

describe('moving a node', () => {
  it('refuses to move a node under its own child', () => {
    const parent = factory.project({ title: 'Parent' })
    const child = factory.project({ title: 'Child', parent_id: parent.id })

    expect(() => db.moveNode(parent.id, child.id)).toThrow(/descendant|itself|cycle/i)
    expect(db.getNode(parent.id).parent_id).toBeNull()
  })

  it('refuses to move a node under a deeper descendant', () => {
    const a = factory.project({ title: 'A' })
    const b = factory.project({ title: 'B', parent_id: a.id })
    const c = factory.project({ title: 'C', parent_id: b.id })

    expect(() => db.moveNode(a.id, c.id)).toThrow(/descendant|itself|cycle/i)
    expect(db.getNode(a.id).parent_id).toBeNull()
  })

  it('refuses to make a node its own parent', () => {
    const node = factory.task({ title: 'Self' })
    expect(() => db.moveNode(node.id, node.id)).toThrow(/descendant|itself|cycle/i)
  })

  it('still allows an ordinary move to an unrelated parent', () => {
    const a = factory.project({ title: 'A' })
    const b = factory.project({ title: 'B' })
    const child = factory.task({ title: 'Child', parent_id: a.id })

    db.moveNode(child.id, b.id)
    expect(db.getNode(child.id).parent_id).toBe(b.id)
  })

  it('still allows moving a node up to the root', () => {
    const a = factory.project({ title: 'A' })
    const child = factory.task({ title: 'Child', parent_id: a.id })

    db.moveNode(child.id, null)
    expect(db.getNode(child.id).parent_id).toBeNull()
  })
})

describe('linking two nodes', () => {
  it('stores one row however the pair is ordered', () => {
    const a = factory.note({ title: 'A' })
    const b = factory.note({ title: 'B' })

    db.linkNodes(a.id, b.id)
    db.linkNodes(b.id, a.id)

    // UNIQUE(source_id, target_id) stops the identical row but not the reverse,
    // and reads treat a link as bidirectional, so B would appear twice.
    const rows = db._query('SELECT COUNT(*) AS n FROM node_links')[0].n
    expect(rows).toBe(1)
    expect(db.getLinkedNodes(a.id).filter(n => n.id === b.id)).toHaveLength(1)
    expect(db.getLinkedNodes(b.id).filter(n => n.id === a.id)).toHaveLength(1)
  })

  it('rejects the reverse link the same way it rejects a repeat of the same one', () => {
    const a = factory.note({ title: 'A' })
    const b = factory.note({ title: 'B' })

    db.linkNodes(a.id, b.id)
    // The stored direction is an implementation detail; both orders are the
    // same link, so both are rejected rather than one succeeding silently.
    expect(db.linkNodes(b.id, a.id).success).toBe(false)
    expect(db.linkNodes(a.id, b.id).success).toBe(false)
  })

  it('unlinks the pair whichever way it was stored', () => {
    const a = factory.note({ title: 'A' })
    const b = factory.note({ title: 'B' })

    db.linkNodes(a.id, b.id)
    db.linkNodes(b.id, a.id)
    db.unlinkNodes(a.id, b.id)

    expect(db.getLinkedNodes(a.id)).toHaveLength(0)
    expect(db.getLinkedNodes(b.id)).toHaveLength(0)
  })

  it('refuses to link a node to itself', () => {
    const a = factory.note({ title: 'A' })
    expect(db.linkNodes(a.id, a.id).success).toBe(false)
    expect(db.getLinkedNodes(a.id)).toHaveLength(0)
  })
})
