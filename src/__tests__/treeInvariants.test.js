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
