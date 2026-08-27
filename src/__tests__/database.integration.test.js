import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase, createNodeFactory } from './helpers/testDatabase.js'

/**
 * Database Integration Tests
 *
 * These tests run the REAL production database module
 * (electron/database/index.js) against a throwaway SQLite file. No mocks and no
 * mirrored logic - a regression in electron/database/* fails these tests.
 */

describe('Database Integration Tests', () => {
  let db
  let factory

  beforeEach(async () => {
    db = await createTestDatabase()
    factory = createNodeFactory(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('Node CRUD', () => {
    it('should create a node and retrieve it', () => {
      const node = factory.task({ title: 'Test Task' })

      expect(node.id).toBeDefined()
      expect(node.title).toBe('Test Task')
      expect(node.type).toBe('task')
      expect(node.workspace_id).toBe('work')
      expect(node.completed).toBe(false)

      const retrieved = db.getNode(node.id)
      expect(retrieved.title).toBe('Test Task')
    })

    it('should update a node', () => {
      const node = factory.task({ title: 'Original' })

      const updated = db.updateNode(node.id, {
        title: 'Updated Title',
        notes: 'Some notes',
        completed: true,
      })

      expect(updated.title).toBe('Updated Title')
      expect(updated.notes).toBe('Some notes')
      expect(updated.completed).toBe(true)
    })

    it('should soft delete a node', () => {
      const node = factory.task({ title: 'To Delete' })

      db.deleteNode(node.id, false)

      expect(db.getNode(node.id)).toBeNull()
      expect(db.getTrash().some(n => n.id === node.id)).toBe(true)
    })

    it('should hard delete a node', () => {
      const node = factory.task({ title: 'To Delete' })

      db.deleteNode(node.id, true)

      expect(db.getNode(node.id)).toBeNull()
      expect(db.getTrash().some(n => n.id === node.id)).toBe(false)
    })

    it('should restore a soft-deleted node', () => {
      const node = factory.task({ title: 'Deleted' })
      db.deleteNode(node.id, false)

      const restored = db.restoreNode(node.id)

      expect(restored.title).toBe('Deleted')
      expect(db.getNode(node.id)).not.toBeNull()
    })

    it('should reassign children to grandparent when deleting parent', () => {
      const grandparent = factory.project({ title: 'Grandparent' })
      const parent = factory.project({ title: 'Parent', parent_id: grandparent.id })
      const child = factory.task({ title: 'Child', parent_id: parent.id })

      db.deleteNode(parent.id, false)

      const updatedChild = db.getNode(child.id)
      expect(updatedChild.parent_id).toBe(grandparent.id)
    })
  })

  describe('Tree Operations', () => {
    it('should get root nodes', () => {
      factory.project({ title: 'Root 1' })
      factory.project({ title: 'Root 2' })

      const roots = db.getRoots('work')
      expect(roots.length).toBe(2)
    })

    it('should get children of a node', () => {
      const parent = factory.project({ title: 'Parent' })
      factory.task({ title: 'Child 1', parent_id: parent.id })
      factory.task({ title: 'Child 2', parent_id: parent.id })

      const children = db.getChildren(parent.id)
      expect(children.length).toBe(2)
      expect(children.every(c => c.parent_id === parent.id)).toBe(true)
    })

    it('should calculate depth and path correctly', () => {
      const root = factory.project({ title: 'Root' })
      const child = factory.task({ title: 'Child', parent_id: root.id })
      const grandchild = factory.task({ title: 'Grandchild', parent_id: child.id })

      expect(root.depth).toBe(0)
      expect(root.path).toBe('')

      expect(child.depth).toBe(1)
      expect(child.path).toBe(`${root.id}`)

      expect(grandchild.depth).toBe(2)
      expect(grandchild.path).toBe(`${root.id}/${child.id}`)
    })

    it('should get descendants', () => {
      const { root, children, grandchildren } = factory.tree(2, 2)

      const descendants = db.getDescendants(root.id)
      expect(descendants.length).toBe(children.length + grandchildren.length)
    })

    it('should batch get descendants for multiple roots', () => {
      // Create two separate trees
      const tree1 = factory.tree(2, 1) // 2 children, 1 grandchild each
      const tree2 = factory.tree(3, 1) // 3 children, 1 grandchild each

      const result = db.getDescendantsBatch([tree1.root.id, tree2.root.id])

      // Result should be a Map keyed by root ID
      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(2)

      // Each root should have its descendants
      const tree1Descendants = result.get(tree1.root.id)
      const tree2Descendants = result.get(tree2.root.id)

      expect(tree1Descendants.length).toBe(tree1.children.length + tree1.grandchildren.length)
      expect(tree2Descendants.length).toBe(tree2.children.length + tree2.grandchildren.length)
    })

    it('should return empty arrays for roots with no descendants in batch', () => {
      const leafNode = factory.task({ title: 'Leaf' })
      // tree(depth=1, childrenPerLevel=2) creates root with 2 direct children, no grandchildren
      const treeWithChildren = factory.tree(1, 2)

      const result = db.getDescendantsBatch([leafNode.id, treeWithChildren.root.id])

      expect(result.get(leafNode.id)).toEqual([])
      expect(result.get(treeWithChildren.root.id).length).toBe(2)
    })

    it('should return empty map for empty root IDs array', () => {
      const result = db.getDescendantsBatch([])
      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(0)
    })

    it('should get ancestors', () => {
      const root = factory.project({ title: 'Root' })
      const child = factory.task({ title: 'Child', parent_id: root.id })
      const grandchild = factory.task({ title: 'Grandchild', parent_id: child.id })

      const ancestors = db.getAncestors(grandchild.id)
      expect(ancestors.length).toBe(2)
      expect(ancestors[0].id).toBe(root.id)
      expect(ancestors[1].id).toBe(child.id)
    })

    it('should move a node to a new parent', () => {
      const parent1 = factory.project({ title: 'Parent 1' })
      const parent2 = factory.project({ title: 'Parent 2' })
      const child = factory.task({ title: 'Child', parent_id: parent1.id })

      const moved = db.moveNode(child.id, parent2.id)

      expect(moved.parent_id).toBe(parent2.id)
      expect(moved.path).toBe(`${parent2.id}`)
      expect(db.getChildren(parent1.id).length).toBe(0)
      expect(db.getChildren(parent2.id).length).toBe(1)
    })

    it('should move a node to root', () => {
      const parent = factory.project({ title: 'Parent' })
      const child = factory.task({ title: 'Child', parent_id: parent.id })

      const moved = db.moveNode(child.id, null)

      expect(moved.parent_id).toBeNull()
      expect(moved.depth).toBe(0)
      expect(moved.path).toBe('')
    })
  })

  describe('Node Links', () => {
    it('should create a link between nodes', () => {
      const node1 = factory.task({ title: 'Node 1' })
      const node2 = factory.task({ title: 'Node 2' })

      const result = db.linkNodes(node1.id, node2.id)
      expect(result.success).toBe(true)

      const linked = db.getLinkedNodes(node1.id)
      expect(linked.length).toBe(1)
      expect(linked[0].id).toBe(node2.id)
    })

    it('should get linked nodes from both directions', () => {
      const node1 = factory.task({ title: 'Node 1' })
      const node2 = factory.task({ title: 'Node 2' })

      db.linkNodes(node1.id, node2.id)

      const linkedFromNode2 = db.getLinkedNodes(node2.id)
      expect(linkedFromNode2.length).toBe(1)
      expect(linkedFromNode2[0].id).toBe(node1.id)
    })

    it('should remove a link between nodes', () => {
      const node1 = factory.task({ title: 'Node 1' })
      const node2 = factory.task({ title: 'Node 2' })

      db.linkNodes(node1.id, node2.id)
      db.unlinkNodes(node1.id, node2.id)

      expect(db.getLinkedNodes(node1.id).length).toBe(0)
    })

    it('should not create duplicate links', () => {
      const node1 = factory.task({ title: 'Node 1' })
      const node2 = factory.task({ title: 'Node 2' })

      db.linkNodes(node1.id, node2.id)
      const result = db.linkNodes(node1.id, node2.id)

      expect(result.success).toBe(false)
    })

    it('should handle multiple links per node', () => {
      const { center, linked } = factory.linked(3)

      const allLinked = db.getLinkedNodes(center.id)
      expect(allLinked.length).toBe(linked.length)
    })

    it('should not delete linked nodes when soft deleting a node', () => {
      const person = factory.person({ title: 'John Doe' })
      const org = factory.task({ title: 'Acme Task' })
      db.linkNodes(person.id, org.id)

      db.deleteNode(person.id, false)

      // The linked partner survives, and the deleted node is excluded from its links
      expect(db.getNode(person.id)).toBeNull()
      expect(db.getNode(org.id)).not.toBeNull()
      expect(db.getLinkedNodes(org.id).length).toBe(0)

      // Restoring the node brings the link back (soft delete keeps the link row)
      db.restoreNode(person.id)
      const linked = db.getLinkedNodes(org.id)
      expect(linked.length).toBe(1)
      expect(linked[0].id).toBe(person.id)
    })
  })

  describe('Tags', () => {
    it('should store and retrieve tags', () => {
      const node = factory.task({
        title: 'Tagged Node',
        tags: ['urgent', 'bug', 'backend'],
      })

      const retrieved = db.getNode(node.id)
      expect(retrieved.tags).toEqual(['urgent', 'bug', 'backend'])
    })

    it('should update tags', () => {
      const node = factory.task({ title: 'Node', tags: ['old-tag'] })

      db.updateNode(node.id, { tags: ['new-tag-1', 'new-tag-2'] })

      const updated = db.getNode(node.id)
      expect(updated.tags).toEqual(['new-tag-1', 'new-tag-2'])
    })

    it('should get all unique tags', () => {
      factory.task({ title: 'Node 1', tags: ['bug', 'urgent'] })
      factory.task({ title: 'Node 2', tags: ['feature', 'urgent'] })
      factory.task({ title: 'Node 3', tags: ['bug', 'backend'] })

      const allTags = db.getAllTags()
      expect(allTags).toContain('bug')
      expect(allTags).toContain('urgent')
      expect(allTags).toContain('feature')
      expect(allTags).toContain('backend')
      expect(allTags.length).toBe(4)
    })

    it('should get nodes by tag', () => {
      factory.task({ title: 'Node 1', tags: ['bug'] })
      factory.task({ title: 'Node 2', tags: ['feature'] })
      factory.task({ title: 'Node 3', tags: ['bug', 'urgent'] })

      const bugNodes = db.getNodesByTag('bug')
      expect(bugNodes.length).toBe(2)
      expect(bugNodes.every(n => n.tags.includes('bug'))).toBe(true)
    })
  })

  describe('Search', () => {
    it('ranks a title match above a notes-only match that was updated later', () => {
      const person = factory.person({ title: 'Test Person Alpha' })
      const meeting = factory.note({ title: '260826 Intake meeting', notes: 'Test Person Alpha attended' })

      // The meeting note is the more recently touched of the two, so pure
      // recency ordering would put it first.
      db._run('UPDATE nodes SET updated_at = ? WHERE id = ?', ['2026-08-01 09:00:00', person.id])
      db._run('UPDATE nodes SET updated_at = ? WHERE id = ?', ['2026-08-26 09:00:00', meeting.id])

      const results = db.search('Alpha')
      expect(results.map(r => r.id)).toEqual([person.id, meeting.id])
    })

    it('orders results exact title, title prefix, title contains, then notes-only', () => {
      const notesOnly = factory.note({ title: '260826 Intake meeting', notes: 'about Alpha' })
      const contains = factory.task({ title: 'Call with Alpha' })
      const prefix = factory.note({ title: 'Alpha onboarding' })
      const exact = factory.person({ title: 'Alpha' })

      // Recency runs opposite to the intended ranking: the weakest match is the
      // newest. Only the relevance tiers can produce the expected order.
      db._run('UPDATE nodes SET updated_at = ? WHERE id = ?', ['2026-08-26 09:00:00', notesOnly.id])
      db._run('UPDATE nodes SET updated_at = ? WHERE id = ?', ['2026-08-25 09:00:00', contains.id])
      db._run('UPDATE nodes SET updated_at = ? WHERE id = ?', ['2026-08-24 09:00:00', prefix.id])
      db._run('UPDATE nodes SET updated_at = ? WHERE id = ?', ['2026-08-23 09:00:00', exact.id])

      const results = db.search('Alpha')
      expect(results.map(r => r.title)).toEqual([
        'Alpha',
        'Alpha onboarding',
        'Call with Alpha',
        '260826 Intake meeting',
      ])
    })

    it('falls back to most recently updated within the same relevance tier', () => {
      const older = factory.task({ title: 'Alpha sync' })
      const newer = factory.task({ title: 'Alpha review' })

      db._run('UPDATE nodes SET updated_at = ? WHERE id = ?', ['2026-08-01 09:00:00', older.id])
      db._run('UPDATE nodes SET updated_at = ? WHERE id = ?', ['2026-08-26 09:00:00', newer.id])

      const results = db.search('Alpha')
      expect(results.map(r => r.id)).toEqual([newer.id, older.id])
    })

    it('ranks in the database so the best match survives pagination', () => {
      const notesOnly = factory.note({ title: '260826 Intake meeting', notes: 'Alpha was there' })
      const person = factory.person({ title: 'Test Person Alpha' })

      db._run('UPDATE nodes SET updated_at = ? WHERE id = ?', ['2026-08-26 09:00:00', notesOnly.id])
      db._run('UPDATE nodes SET updated_at = ? WHERE id = ?', ['2026-08-01 09:00:00', person.id])

      const firstPage = db.search('Alpha', null, undefined, { limit: 1, offset: 0 })
      expect(firstPage.map(r => r.id)).toEqual([person.id])
    })

    it('is case-insensitive when matching an exact title', () => {
      const exact = factory.person({ title: 'Alpha' })
      const contains = factory.task({ title: 'Call with Alpha' })

      db._run('UPDATE nodes SET updated_at = ? WHERE id = ?', ['2026-08-01 09:00:00', exact.id])
      db._run('UPDATE nodes SET updated_at = ? WHERE id = ?', ['2026-08-26 09:00:00', contains.id])

      const results = db.search('alpha')
      expect(results.map(r => r.id)).toEqual([exact.id, contains.id])
    })

    it('should search by title', () => {
      factory.task({ title: 'Important Meeting' })
      factory.task({ title: 'Unrelated Task' })
      factory.note({ title: 'Meeting Notes' })

      const results = db.search('Meeting')
      expect(results.length).toBe(2)
      expect(results.every(r => r.title.includes('Meeting'))).toBe(true)
    })

    it('should search by notes', () => {
      factory.task({ title: 'Task 1', notes: 'Contains keyword here' })
      factory.task({ title: 'Task 2', notes: 'No match' })

      const results = db.search('keyword')
      expect(results.length).toBe(1)
      expect(results[0].title).toBe('Task 1')
    })

    it('should filter search by type', () => {
      factory.task({ title: 'Meeting' })
      factory.note({ title: 'Meeting' })

      const taskResults = db.search('Meeting', 'task')
      expect(taskResults.length).toBe(1)
      expect(taskResults[0].type).toBe('task')
    })

    it('should not return deleted nodes in search', () => {
      const node = factory.task({ title: 'Searchable' })
      db.deleteNode(node.id, false)

      const results = db.search('Searchable')
      expect(results.length).toBe(0)
    })

    it('should support pagination with limit and offset', () => {
      // Create 10 nodes with searchable titles
      for (let i = 0; i < 10; i++) {
        factory.task({ title: `Searchable Item ${i}` })
      }

      const page1 = db.search('Searchable', null, undefined, { limit: 3, offset: 0 })
      const page2 = db.search('Searchable', null, undefined, { limit: 3, offset: 3 })
      const page3 = db.search('Searchable', null, undefined, { limit: 3, offset: 6 })
      const page4 = db.search('Searchable', null, undefined, { limit: 3, offset: 9 })

      expect(page1.length).toBe(3)
      expect(page2.length).toBe(3)
      expect(page3.length).toBe(3)
      expect(page4.length).toBe(1)

      // Results should not overlap
      const allIds = [...page1, ...page2, ...page3, ...page4].map(n => n.id)
      const uniqueIds = new Set(allIds)
      expect(uniqueIds.size).toBe(10)
    })

    it('should return total count for pagination', () => {
      for (let i = 0; i < 15; i++) {
        factory.task({ title: `Countable ${i}` })
      }

      const count = db.searchCount('Countable')
      expect(count).toBe(15)
    })

    it('should filter by workspace in search', () => {
      factory.task({ title: 'Work Meeting', workspace_id: 'work' })
      factory.task({ title: 'Private Meeting', workspace_id: 'private' })

      const workResults = db.search('Meeting', null, 'work')
      expect(workResults.length).toBe(1)
      expect(workResults[0].workspace_id).toBe('work')
    })

    it('should hide completed items when option is set', () => {
      factory.task({ title: 'Open Task', completed: false })
      factory.task({ title: 'Done Task', completed: true })

      const allResults = db.search('Task')
      const openOnly = db.search('Task', null, undefined, { hideCompleted: true })

      expect(allResults.length).toBe(2)
      expect(openOnly.length).toBe(1)
      expect(openOnly[0].completed).toBe(false)
    })
  })

  describe('Workspaces', () => {
    it('should have default workspaces', () => {
      const workspaces = db.getWorkspaces()
      expect(workspaces.some(w => w.id === 'work')).toBe(true)
      expect(workspaces.some(w => w.id === 'private')).toBe(true)
    })

    it('should filter roots by workspace', () => {
      factory.task({ title: 'Work Task', workspace_id: 'work' })
      factory.task({ title: 'Private Task', workspace_id: 'private' })

      const workRoots = db.getRoots('work')
      const privateRoots = db.getRoots('private')

      expect(workRoots.every(r => r.workspace_id === 'work')).toBe(true)
      expect(privateRoots.every(r => r.workspace_id === 'private')).toBe(true)
    })
  })

  describe('show_links setting', () => {
    it('should default show_links to 1', () => {
      const node = factory.task({ title: 'Test' })
      expect(node.show_links).toBe(1)
    })

    it('should persist show_links = 0', () => {
      const node = factory.task({ title: 'Test', show_links: 0 })

      expect(node.show_links).toBe(0)
      expect(db.getNode(node.id).show_links).toBe(0)
    })

    it('should update show_links', () => {
      const node = factory.task({ title: 'Test' })

      db.updateNode(node.id, { show_links: 0 })
      expect(db.getNode(node.id).show_links).toBe(0)

      db.updateNode(node.id, { show_links: 1 })
      expect(db.getNode(node.id).show_links).toBe(1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty database', () => {
      expect(db.getRoots()).toEqual([])
      expect(db.getAllTags()).toEqual([])
    })

    it('should handle special characters in title', () => {
      const node = factory.task({
        title: 'Test\'s "Special" <Characters> & More',
      })

      const retrieved = db.getNode(node.id)
      expect(retrieved.title).toBe('Test\'s "Special" <Characters> & More')
    })

    it('should handle unicode in notes', () => {
      const node = factory.note({
        title: 'Unicode Test',
        notes: 'Japanese: \u65e5\u672c\u8a9e, Emoji: \ud83d\ude00\ud83d\ude80\ud83c\udf33',
      })

      const retrieved = db.getNode(node.id)
      expect(retrieved.notes).toContain('\u65e5\u672c\u8a9e')
    })

    it('should handle getting non-existent node', () => {
      expect(db.getNode(99999)).toBeNull()
    })

    it('should handle getting ancestors of root node', () => {
      const root = factory.project({ title: 'Root' })
      expect(db.getAncestors(root.id)).toEqual([])
    })

    it('should handle empty tags array', () => {
      const node = factory.task({ title: 'No Tags', tags: [] })
      expect(db.getNode(node.id).tags).toEqual([])
    })
  })

  describe('reorderNode', () => {
    it('should move a child before an earlier sibling', () => {
      const root = factory.project({ title: 'Root' })
      const a = factory.task({ title: 'A', parent_id: root.id })
      const b = factory.task({ title: 'B', parent_id: root.id })
      const c = factory.task({ title: 'C', parent_id: root.id })

      db.reorderNode(c.id, a.id, 'before')

      const order = db.getChildren(root.id).map(n => n.id)
      expect(order).toEqual([c.id, a.id, b.id])
    })

    it('should move a child after a later sibling', () => {
      const root = factory.project({ title: 'Root' })
      const a = factory.task({ title: 'A', parent_id: root.id })
      const b = factory.task({ title: 'B', parent_id: root.id })
      const c = factory.task({ title: 'C', parent_id: root.id })

      db.reorderNode(a.id, c.id, 'after')

      const order = db.getChildren(root.id).map(n => n.id)
      expect(order).toEqual([b.id, c.id, a.id])
    })

    it('should produce contiguous, distinct sort_order values (no collisions)', () => {
      const root = factory.project({ title: 'Root' })
      const a = factory.task({ title: 'A', parent_id: root.id })
      const b = factory.task({ title: 'B', parent_id: root.id })
      const c = factory.task({ title: 'C', parent_id: root.id })

      db.reorderNode(c.id, b.id, 'before')

      const orders = db.getChildren(root.id).map(n => n.sort_order)
      expect(orders).toEqual([0, 1, 2])
      expect(new Set(orders).size).toBe(orders.length)
    })

    it('should return null when the node or target does not exist', () => {
      const root = factory.project({ title: 'Root' })
      const a = factory.task({ title: 'A', parent_id: root.id })
      expect(db.reorderNode(a.id, 99999, 'before')).toBeNull()
      expect(db.reorderNode(99999, a.id, 'before')).toBeNull()
    })
  })

  describe('path/depth maintenance after reparenting', () => {
    it('should update path/depth of reparented children when deleting their parent', () => {
      const grandparent = factory.project({ title: 'Grandparent' })
      const parent = factory.task({ title: 'Parent', parent_id: grandparent.id })
      const child = factory.task({ title: 'Child', parent_id: parent.id })
      const grandchild = factory.task({ title: 'Grandchild', parent_id: child.id })

      db.deleteNode(parent.id)

      const movedChild = db.getNode(child.id)
      expect(movedChild.parent_id).toBe(grandparent.id)
      expect(movedChild.path).toBe(`${grandparent.id}`)
      expect(movedChild.depth).toBe(1)

      const movedGrandchild = db.getNode(grandchild.id)
      expect(movedGrandchild.path).toBe(`${grandparent.id}/${child.id}`)
      expect(movedGrandchild.depth).toBe(2)

      // Path-based subtree lookup must still find the whole subtree
      const descendants = db.getDescendants(grandparent.id).map(n => n.id)
      expect(descendants).toContain(child.id)
      expect(descendants).toContain(grandchild.id)
    })

    it('should reset children to roots when deleting a root parent', () => {
      const root = factory.project({ title: 'Root' })
      const child = factory.task({ title: 'Child', parent_id: root.id })

      db.deleteNode(root.id)

      const promoted = db.getNode(child.id)
      expect(promoted.parent_id).toBeNull()
      expect(promoted.path).toBe('')
      expect(promoted.depth).toBe(0)
    })

    it('should update descendant paths when moving a node', () => {
      const rootA = factory.project({ title: 'Root A' })
      const rootB = factory.project({ title: 'Root B' })
      const child = factory.task({ title: 'Child', parent_id: rootA.id })
      const grandchild = factory.task({ title: 'Grandchild', parent_id: child.id })

      db.moveNode(child.id, rootB.id)

      expect(db.getNode(child.id).path).toBe(`${rootB.id}`)
      expect(db.getNode(grandchild.id).path).toBe(`${rootB.id}/${child.id}`)
      expect(db.getNode(grandchild.id).depth).toBe(2)
    })

    it('should update path/depth when reorderNode reparents onto another parent', () => {
      const rootA = factory.project({ title: 'Root A' })
      const rootB = factory.project({ title: 'Root B' })
      const nodeA = factory.task({ title: 'A child', parent_id: rootA.id })
      const childOfA = factory.task({ title: 'A grandchild', parent_id: nodeA.id })
      const nodeB = factory.task({ title: 'B child', parent_id: rootB.id })

      db.reorderNode(nodeA.id, nodeB.id, 'after')

      const moved = db.getNode(nodeA.id)
      expect(moved.parent_id).toBe(rootB.id)
      expect(moved.path).toBe(`${rootB.id}`)
      expect(moved.depth).toBe(1)

      const movedChild = db.getNode(childOfA.id)
      expect(movedChild.path).toBe(`${rootB.id}/${nodeA.id}`)
      expect(movedChild.depth).toBe(2)
    })
  })

  describe('foreign key cascades', () => {
    it('should cascade-delete links when a linked node is hard deleted', () => {
      const a = factory.task({ title: 'A' })
      const b = factory.task({ title: 'B' })
      db.linkNodes(a.id, b.id)

      db.deleteNode(a.id, true)

      const links = db._query('SELECT * FROM node_links')
      expect(links).toHaveLength(0)
    })
  })

  describe('updateNode reparenting', () => {
    it('should recompute path/depth of the subtree when updateNode changes parent_id', () => {
      const rootA = factory.project({ title: 'Root A' })
      const rootB = factory.project({ title: 'Root B' })
      const child = factory.task({ title: 'Child', parent_id: rootA.id })
      const grandchild = factory.task({ title: 'Grandchild', parent_id: child.id })

      db.updateNode(child.id, { parent_id: rootB.id })

      const moved = db.getNode(child.id)
      expect(moved.parent_id).toBe(rootB.id)
      expect(moved.path).toBe(`${rootB.id}`)
      expect(moved.depth).toBe(1)

      const movedGrandchild = db.getNode(grandchild.id)
      expect(movedGrandchild.path).toBe(`${rootB.id}/${child.id}`)
      expect(movedGrandchild.depth).toBe(2)

      // Path-based subtree lookup must follow the node to its new parent
      expect(
        db
          .getDescendants(rootB.id)
          .map(n => n.id)
          .sort()
      ).toEqual([child.id, grandchild.id].sort())
      expect(db.getDescendants(rootA.id)).toEqual([])
    })

    it('should promote a node to root when updateNode clears parent_id', () => {
      const root = factory.project({ title: 'Root' })
      const child = factory.task({ title: 'Child', parent_id: root.id })
      const grandchild = factory.task({ title: 'Grandchild', parent_id: child.id })

      db.updateNode(child.id, { parent_id: null })

      const promoted = db.getNode(child.id)
      expect(promoted.parent_id).toBeNull()
      expect(promoted.path).toBe('')
      expect(promoted.depth).toBe(0)
      expect(db.getNode(grandchild.id).path).toBe(`${child.id}`)
      expect(db.getNode(grandchild.id).depth).toBe(1)
    })

    it('should leave path/depth untouched when the update does not reparent', () => {
      const root = factory.project({ title: 'Root' })
      const child = factory.task({ title: 'Child', parent_id: root.id })

      db.updateNode(child.id, { title: 'Renamed' })

      const updated = db.getNode(child.id)
      expect(updated.title).toBe('Renamed')
      expect(updated.path).toBe(`${root.id}`)
      expect(updated.depth).toBe(1)
    })
  })

  describe('trash purge and hard delete under ON DELETE SET NULL', () => {
    it('should not orphan a live node whose trashed parent is purged', () => {
      const root = factory.project({ title: 'Root' })
      const parent = factory.task({ title: 'Parent', parent_id: root.id })
      const child = factory.task({ title: 'Child', parent_id: parent.id })

      // Trash the child first so the parent's soft delete does not reparent it,
      // then restore it: a live node whose parent is still in the trash.
      db.deleteNode(child.id)
      db.deleteNode(parent.id)
      db.restoreNode(child.id)
      const grandchild = factory.task({ title: 'Grandchild', parent_id: child.id })

      db.emptyTrash()

      const survivor = db.getNode(child.id)
      expect(survivor).not.toBeNull()
      expect(survivor.parent_id).toBeNull()
      expect(survivor.path).toBe('')
      expect(survivor.depth).toBe(0)

      // It must show up as a real root, not a depth-1 node pointing at a purged id
      expect(db.getRoots('work').map(n => n.id)).toContain(child.id)
      expect(db.getOrphanedNodes().map(n => n.id)).not.toContain(child.id)

      const movedGrandchild = db.getNode(grandchild.id)
      expect(movedGrandchild.path).toBe(`${child.id}`)
      expect(movedGrandchild.depth).toBe(1)
      expect(db.getDescendants(child.id).map(n => n.id)).toEqual([grandchild.id])
    })

    it('should report the number of purged nodes', () => {
      factory.task({ title: 'A' })
      const b = factory.task({ title: 'B' })
      db.deleteNode(b.id)

      expect(db.emptyTrash()).toEqual({ deleted: 1 })
      expect(db.getTrash()).toEqual([])
    })

    it('should fix path/depth of trashed children when their parent is hard deleted', () => {
      const root = factory.project({ title: 'Root' })
      const parent = factory.task({ title: 'Parent', parent_id: root.id })
      const child = factory.task({ title: 'Child', parent_id: parent.id })

      db.deleteNode(child.id)
      db.deleteNode(parent.id, true)

      const restored = db.restoreNode(child.id)
      expect(restored.parent_id).toBeNull()
      expect(restored.path).toBe('')
      expect(restored.depth).toBe(0)
      expect(db.getRoots('work').map(n => n.id)).toContain(child.id)
    })
  })

  describe('getDescendantsBatch across workspaces', () => {
    it('should return descendants for roots in different workspaces', () => {
      const rootA = factory.project({ title: 'Root A', workspace_id: 'wsA' })
      const childA = factory.task({ title: 'Child A', parent_id: rootA.id, workspace_id: 'wsA' })
      const rootB = factory.project({ title: 'Root B', workspace_id: 'wsB' })
      const childB = factory.task({ title: 'Child B', parent_id: rootB.id, workspace_id: 'wsB' })

      const result = db.getDescendantsBatch([rootA.id, rootB.id])

      expect(result.get(rootA.id).map(n => n.id)).toEqual([childA.id])
      expect(result.get(rootB.id).map(n => n.id)).toEqual([childB.id])
    })
  })
})
