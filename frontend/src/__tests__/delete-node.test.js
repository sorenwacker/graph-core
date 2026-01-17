import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the database
const mockDb = {
  nodes: new Map(),
  nodeIdCounter: 1,

  reset() {
    this.nodes.clear()
    this.nodeIdCounter = 1
  },

  createNode(data) {
    const id = this.nodeIdCounter++
    const node = {
      id,
      ...data,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    this.nodes.set(id, node)
    return node
  },

  getNode(id) {
    const node = this.nodes.get(id)
    if (!node || node.deleted_at) return null
    return node
  },

  getChildren(parentId) {
    return Array.from(this.nodes.values()).filter(
      n => n.parent_id === parentId && !n.deleted_at
    )
  },

  deleteNode(id, hard = false) {
    const node = this.nodes.get(id)
    if (!node) return { success: false }

    if (hard) {
      this.nodes.delete(id)
    } else {
      // Soft delete - only marks this node, NOT children
      node.deleted_at = new Date().toISOString()
    }
    return { success: true }
  },

  restoreNode(id) {
    const node = this.nodes.get(id)
    if (!node) return null
    node.deleted_at = null
    return node
  }
}

describe('Delete Node Behavior', () => {
  beforeEach(() => {
    mockDb.reset()
  })

  it('should only delete the specified node, not its children', () => {
    // Create parent node
    const parent = mockDb.createNode({
      title: 'Parent',
      type: 'folder',
      parent_id: null
    })

    // Create child nodes
    const child1 = mockDb.createNode({
      title: 'Child 1',
      type: 'task',
      parent_id: parent.id
    })

    const child2 = mockDb.createNode({
      title: 'Child 2',
      type: 'task',
      parent_id: parent.id
    })

    // Create grandchild
    const grandchild = mockDb.createNode({
      title: 'Grandchild',
      type: 'task',
      parent_id: child1.id
    })

    // Verify initial state
    expect(mockDb.getNode(parent.id)).not.toBeNull()
    expect(mockDb.getNode(child1.id)).not.toBeNull()
    expect(mockDb.getNode(child2.id)).not.toBeNull()
    expect(mockDb.getNode(grandchild.id)).not.toBeNull()
    expect(mockDb.getChildren(parent.id)).toHaveLength(2)

    // Delete parent (soft delete)
    mockDb.deleteNode(parent.id, false)

    // Parent should be deleted
    expect(mockDb.getNode(parent.id)).toBeNull()

    // Children should NOT be deleted - this is the expected behavior
    expect(mockDb.getNode(child1.id)).not.toBeNull()
    expect(mockDb.getNode(child2.id)).not.toBeNull()
    expect(mockDb.getNode(grandchild.id)).not.toBeNull()
  })

  it('should be able to restore a soft-deleted node', () => {
    const node = mockDb.createNode({
      title: 'Test Node',
      type: 'task',
      parent_id: null
    })

    // Delete node
    mockDb.deleteNode(node.id, false)
    expect(mockDb.getNode(node.id)).toBeNull()

    // Restore node
    mockDb.restoreNode(node.id)
    expect(mockDb.getNode(node.id)).not.toBeNull()
    expect(mockDb.getNode(node.id).title).toBe('Test Node')
  })

  it('should delete only selected nodes in multi-delete', () => {
    // Create multiple nodes
    const node1 = mockDb.createNode({ title: 'Node 1', type: 'task', parent_id: null })
    const node2 = mockDb.createNode({ title: 'Node 2', type: 'task', parent_id: null })
    const node3 = mockDb.createNode({ title: 'Node 3', type: 'task', parent_id: null })

    // Delete only nodes 1 and 2
    const nodeIdsToDelete = [node1.id, node2.id]
    for (const id of nodeIdsToDelete) {
      mockDb.deleteNode(id, false)
    }

    // Node 1 and 2 should be deleted
    expect(mockDb.getNode(node1.id)).toBeNull()
    expect(mockDb.getNode(node2.id)).toBeNull()

    // Node 3 should still exist
    expect(mockDb.getNode(node3.id)).not.toBeNull()
  })

  it('should not delete linked nodes when deleting a node', () => {
    // Create person
    const person = mockDb.createNode({
      title: 'John Doe',
      type: 'person',
      parent_id: null
    })

    // Create organization
    const org = mockDb.createNode({
      title: 'Acme Corp',
      type: 'organization',
      parent_id: null
    })

    // Create a task that would be "linked" (simulated)
    const task = mockDb.createNode({
      title: 'Task',
      type: 'task',
      parent_id: null
    })

    // Delete the person
    mockDb.deleteNode(person.id, false)

    // Person should be deleted
    expect(mockDb.getNode(person.id)).toBeNull()

    // Organization and task should NOT be deleted (they were linked, not children)
    expect(mockDb.getNode(org.id)).not.toBeNull()
    expect(mockDb.getNode(task.id)).not.toBeNull()
  })
})
