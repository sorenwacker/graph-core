import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TestDatabase, createNodeFactory } from './helpers/testDatabase.js'

/**
 * Database Integration Tests
 *
 * These tests run against a real in-memory SQLite database using sql.js.
 * No mocks - actual database operations are verified.
 */

describe('Database Integration Tests', () => {
  let db
  let factory

  beforeEach(async () => {
    db = await TestDatabase.create()
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
        completed: true
      })

      expect(updated.title).toBe('Updated Title')
      expect(updated.notes).toBe('Some notes')
      expect(updated.completed).toBe(true)
    })

    it('should soft delete a node', () => {
      const node = factory.task({ title: 'To Delete' })

      db.deleteNode(node.id, false)

      expect(db.getNode(node.id)).toBeNull()
      expect(db.getTrash().some((n) => n.id === node.id)).toBe(true)
    })

    it('should hard delete a node', () => {
      const node = factory.task({ title: 'To Delete' })

      db.deleteNode(node.id, true)

      expect(db.getNode(node.id)).toBeNull()
      expect(db.getTrash().some((n) => n.id === node.id)).toBe(false)
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
      expect(children.every((c) => c.parent_id === parent.id)).toBe(true)
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
  })

  describe('Tags', () => {
    it('should store and retrieve tags', () => {
      const node = factory.task({
        title: 'Tagged Node',
        tags: ['urgent', 'bug', 'backend']
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
      expect(bugNodes.every((n) => n.tags.includes('bug'))).toBe(true)
    })
  })

  describe('Search', () => {
    it('should search by title', () => {
      factory.task({ title: 'Important Meeting' })
      factory.task({ title: 'Unrelated Task' })
      factory.note({ title: 'Meeting Notes' })

      const results = db.search('Meeting')
      expect(results.length).toBe(2)
      expect(results.every((r) => r.title.includes('Meeting'))).toBe(true)
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
      expect(workspaces.some((w) => w.id === 'work')).toBe(true)
      expect(workspaces.some((w) => w.id === 'private')).toBe(true)
    })

    it('should filter roots by workspace', () => {
      factory.task({ title: 'Work Task', workspace_id: 'work' })
      factory.task({ title: 'Private Task', workspace_id: 'private' })

      const workRoots = db.getRoots('work')
      const privateRoots = db.getRoots('private')

      expect(workRoots.every((r) => r.workspace_id === 'work')).toBe(true)
      expect(privateRoots.every((r) => r.workspace_id === 'private')).toBe(true)
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
        title: "Test's \"Special\" <Characters> & More"
      })

      const retrieved = db.getNode(node.id)
      expect(retrieved.title).toBe("Test's \"Special\" <Characters> & More")
    })

    it('should handle unicode in notes', () => {
      const node = factory.note({
        title: 'Unicode Test',
        notes: 'Japanese: \u65e5\u672c\u8a9e, Emoji: \ud83d\ude00\ud83d\ude80\ud83c\udf33'
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
})
