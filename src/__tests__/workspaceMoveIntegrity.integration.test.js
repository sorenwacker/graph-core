import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase, createNodeFactory } from './helpers/testDatabase.js'

/**
 * Tree queries filter by the workspace of the node they start from; search
 * filters each row by its own. Changing a node's workspace used to update that
 * node alone, so its descendants stayed behind: shown in neither workspace's
 * graph, yet found by search in the old one.
 */

describe('moving nodes between workspaces', () => {
  let db
  let factory

  beforeEach(async () => {
    db = await createTestDatabase()
    factory = createNodeFactory(db)
  })

  afterEach(() => {
    db.close()
  })

  const ids = nodes => nodes.map(n => n.id).sort()

  it('takes the whole subtree along when a node changes workspace', () => {
    const root = factory.project({ title: 'Root' })
    const child = factory.task({ title: 'Child', parent_id: root.id })
    const grandchild = factory.task({ title: 'Grandchild', parent_id: child.id })

    db.updateNode(root.id, { workspace_id: 'private' })

    expect(db.getNode(child.id).workspace_id).toBe('private')
    expect(db.getNode(grandchild.id).workspace_id).toBe('private')
    expect(ids(db.getDescendants(root.id))).toEqual(ids([child, grandchild]))
    expect(db.search('Grandchild', null, 'work')).toEqual([])
    expect(db.search('Grandchild', null, 'private').map(n => n.id)).toEqual([grandchild.id])
  })

  it('moves trashed descendants too, so a restore lands in the same workspace', () => {
    const root = factory.project({ title: 'Root' })
    const trashed = factory.task({ title: 'Trashed', parent_id: root.id })
    db.deleteNode(trashed.id)

    db.updateNode(root.id, { workspace_id: 'private' })

    expect(db._get('SELECT workspace_id FROM nodes WHERE id = ?', [trashed.id]).workspace_id).toBe('private')
  })

  it('takes a child out of a parent in the old workspace to the root of the new one', () => {
    const root = factory.project({ title: 'Root' })
    const child = factory.task({ title: 'Child', parent_id: root.id })
    const grandchild = factory.task({ title: 'Grandchild', parent_id: child.id })

    db.updateNode(child.id, { workspace_id: 'private' })

    const moved = db.getNode(child.id)
    expect(moved.parent_id).toBeNull()
    expect(moved.depth).toBe(0)
    expect(db.getRoots('private').map(n => n.id)).toContain(child.id)
    expect(db.getDescendants(child.id).map(n => n.id)).toEqual([grandchild.id])
    expect(db.getChildren(root.id).map(n => n.id)).not.toContain(child.id)
  })

  it('leaves parent and subtree alone for an update that keeps the workspace', () => {
    const root = factory.project({ title: 'Root' })
    const child = factory.task({ title: 'Child', parent_id: root.id })

    db.updateNode(child.id, { workspace_id: 'work', title: 'Renamed' })

    expect(db.getNode(child.id).parent_id).toBe(root.id)
  })

  it('adopts the workspace of a new parent from another workspace', () => {
    const elsewhere = factory.project({ title: 'Elsewhere', workspace_id: 'private' })
    const node = factory.task({ title: 'Node' })
    const below = factory.task({ title: 'Below', parent_id: node.id })

    db.moveNode(node.id, elsewhere.id)

    expect(db.getNode(node.id).workspace_id).toBe('private')
    expect(db.getNode(below.id).workspace_id).toBe('private')
    expect(ids(db.getDescendants(elsewhere.id))).toEqual(ids([node, below]))
  })

  it('lists a node whose parent sits in another workspace as orphaned', () => {
    const root = factory.project({ title: 'Root' })
    const child = factory.task({ title: 'Child', parent_id: root.id })
    // The state the old workspace change left behind.
    db._run('UPDATE nodes SET workspace_id = ? WHERE id = ?', ['private', root.id])

    expect(db.getOrphanedNodes().map(n => n.id)).toContain(child.id)
    expect(db.getOrphanedNodes().map(n => n.id)).not.toContain(root.id)
  })
})
