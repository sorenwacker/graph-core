import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore } from '../stores/nodes.js'

// Mock the API
vi.mock('../services/api.js', () => ({
  api: {
    getRoots: vi.fn(),
    getNode: vi.fn(),
    getDescendants: vi.fn(),
    getAncestors: vi.fn(),
    createNode: vi.fn(),
    updateNode: vi.fn(),
    deleteNode: vi.fn(),
    moveNode: vi.fn(),
  },
}))

import { api } from '../services/api.js'

describe('Nodes Store', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useNodesStore()
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should have null currentContainerId', () => {
      expect(store.currentContainerId).toBeNull()
    })

    it('should have empty children', () => {
      expect(store.children).toEqual([])
    })

    it('should have empty breadcrumbs', () => {
      expect(store.breadcrumbs).toEqual([])
    })

    it('should not be loading', () => {
      expect(store.loading).toBe(false)
    })

    it('should have isAtRoot as true', () => {
      expect(store.isAtRoot).toBe(true)
    })
  })

  describe('loadChildren', () => {
    it('should load root nodes when containerId is null', async () => {
      const mockRoots = [
        { id: 1, title: 'Node 1' },
        { id: 2, title: 'Node 2' },
      ]
      api.getRoots.mockResolvedValue(mockRoots)

      await store.loadChildren(null, 'work')

      expect(api.getRoots).toHaveBeenCalledWith('work')
      expect(store.children).toEqual(mockRoots)
      expect(store.currentContainer).toBeNull()
      expect(store.breadcrumbs).toEqual([])
    })

    it('should load container and descendants when containerId is provided', async () => {
      const mockContainer = { id: 10, title: 'Container' }
      const mockDescendants = [
        { id: 11, title: 'Child 1' },
        { id: 12, title: 'Child 2' },
      ]
      const mockAncestors = [{ id: 5, title: 'Grandparent' }]

      api.getNode.mockResolvedValue(mockContainer)
      api.getDescendants.mockResolvedValue(mockDescendants)
      api.getAncestors.mockResolvedValue(mockAncestors)

      await store.loadChildren(10, 'work')

      expect(api.getNode).toHaveBeenCalledWith(10)
      expect(api.getDescendants).toHaveBeenCalledWith(10)
      expect(store.currentContainer).toEqual(mockContainer)
      expect(store.children).toEqual(mockDescendants)
      expect(store.currentContainerId).toBe(10)
    })

    it('should set loading state during load', async () => {
      api.getRoots.mockImplementation(
        () =>
          new Promise(resolve => {
            expect(store.loading).toBe(true)
            resolve([])
          })
      )

      await store.loadChildren(null)
      expect(store.loading).toBe(false)
    })

    it('should set error on failure', async () => {
      api.getRoots.mockRejectedValue(new Error('Network error'))

      await store.loadChildren(null)

      expect(store.error).toBe('Network error')
    })
  })

  describe('createNode', () => {
    it('should create node via API', async () => {
      const nodeData = { title: 'New Node', type: 'task' }
      const created = { id: 100, ...nodeData }
      api.createNode.mockResolvedValue(created)

      const result = await store.createNode(nodeData)

      expect(api.createNode).toHaveBeenCalledWith(nodeData)
      expect(result).toEqual(created)
    })

    it('should push to undo stack', async () => {
      const nodeData = { title: 'New Node', type: 'task', parent_id: 5 }
      const created = { id: 100, ...nodeData }
      api.createNode.mockResolvedValue(created)

      await store.createNode(nodeData)

      expect(store.undoStack.length).toBe(1)
      expect(store.undoStack[0].type).toBe('create')
      expect(store.undoStack[0].nodeId).toBe(100)
    })
  })

  describe('updateNode', () => {
    it('should update node via API', async () => {
      const oldNode = { id: 1, title: 'Old Title' }
      const updates = { title: 'New Title' }
      const updatedNode = { id: 1, title: 'New Title' }

      api.getNode.mockResolvedValueOnce(oldNode).mockResolvedValueOnce(updatedNode)
      api.updateNode.mockResolvedValue({})

      const result = await store.updateNode(1, updates)

      expect(api.updateNode).toHaveBeenCalledWith(1, updates)
      expect(result).toEqual(updatedNode)
    })

    it('should push to undo stack when trackUndo is true', async () => {
      const oldNode = { id: 1, title: 'Old Title' }
      api.getNode.mockResolvedValue(oldNode)
      api.updateNode.mockResolvedValue({})

      await store.updateNode(1, { title: 'New Title' }, true)

      expect(store.undoStack.length).toBe(1)
      expect(store.undoStack[0].type).toBe('edit')
    })

    it('should not push to undo stack when trackUndo is false', async () => {
      api.getNode.mockResolvedValue({ id: 1 })
      api.updateNode.mockResolvedValue({})

      await store.updateNode(1, { title: 'New Title' }, false)

      expect(store.undoStack.length).toBe(0)
    })
  })

  describe('deleteNode', () => {
    it('should delete node via API', async () => {
      const node = { id: 1, title: 'Node', parent_id: null }
      api.getNode.mockResolvedValue(node)
      api.deleteNode.mockResolvedValue({})

      await store.deleteNode(1)

      expect(api.deleteNode).toHaveBeenCalledWith(1, false)
    })

    it('should push to undo stack', async () => {
      const node = { id: 1, title: 'Node', parent_id: 5 }
      api.getNode.mockResolvedValue(node)
      api.deleteNode.mockResolvedValue({})

      await store.deleteNode(1)

      expect(store.undoStack.length).toBe(1)
      expect(store.undoStack[0].type).toBe('delete')
      expect(store.undoStack[0].nodeData).toEqual(node)
    })
  })

  describe('moveNode', () => {
    it('should move node via API', async () => {
      const node = { id: 1, parent_id: 5 }
      api.getNode.mockResolvedValue(node)
      api.moveNode.mockResolvedValue({})

      await store.moveNode(1, 10)

      expect(api.moveNode).toHaveBeenCalledWith(1, 10)
    })

    it('should push to undo stack with old and new parent', async () => {
      const node = { id: 1, parent_id: 5 }
      api.getNode.mockResolvedValue(node)
      api.moveNode.mockResolvedValue({})

      await store.moveNode(1, 10)

      expect(store.undoStack[0].oldParentId).toBe(5)
      expect(store.undoStack[0].newParentId).toBe(10)
    })
  })

  describe('toggleComplete', () => {
    it('should toggle completed status', async () => {
      const node = { id: 1, completed: false }
      api.getNode.mockResolvedValue(node)
      api.updateNode.mockResolvedValue({})

      const result = await store.toggleComplete(node)

      expect(result).toBe(true)
      expect(api.updateNode).toHaveBeenCalledWith(1, { completed: true })
    })
  })

  describe('toggleFavorite', () => {
    it('should toggle favorite status', async () => {
      const node = { id: 1, favorite: true }
      api.getNode.mockResolvedValue(node)
      api.updateNode.mockResolvedValue({})

      const result = await store.toggleFavorite(node)

      expect(result).toBe(false)
      expect(api.updateNode).toHaveBeenCalledWith(1, { favorite: false })
    })
  })

  describe('undo/redo', () => {
    it('should have hasUndo false when stack is empty', () => {
      expect(store.hasUndo).toBe(false)
    })

    it('should have hasUndo true after action', async () => {
      api.createNode.mockResolvedValue({ id: 1 })
      await store.createNode({ title: 'Test' })
      expect(store.hasUndo).toBe(true)
    })

    it('should clear redo stack on new action', async () => {
      store.redoStack = [{ type: 'test' }]
      api.createNode.mockResolvedValue({ id: 1 })
      await store.createNode({ title: 'Test' })
      expect(store.redoStack.length).toBe(0)
    })

    it('should limit undo stack to 50 items', async () => {
      for (let i = 0; i < 55; i++) {
        store.pushUndo({ type: 'test', id: i })
      }
      expect(store.undoStack.length).toBe(50)
    })

    it('clearUndoHistory should clear both stacks', () => {
      store.undoStack = [{ type: 'test' }]
      store.redoStack = [{ type: 'test' }]
      store.clearUndoHistory()
      expect(store.undoStack.length).toBe(0)
      expect(store.redoStack.length).toBe(0)
    })
  })

  describe('flatChildren', () => {
    it('should flatten nested children', () => {
      store.children = [
        { id: 1, title: 'A', children: [{ id: 2, title: 'B', children: [{ id: 3, title: 'C' }] }] },
        { id: 4, title: 'D' },
      ]

      expect(store.flatChildren.length).toBe(4)
      expect(store.flatChildren.map(n => n.id)).toEqual([1, 2, 3, 4])
    })

    it('should handle empty children', () => {
      store.children = []
      expect(store.flatChildren).toEqual([])
    })

    it('should filter out null entries', () => {
      store.children = [{ id: 1 }, null, { id: 2 }]
      expect(store.flatChildren.length).toBe(2)
    })
  })

  describe('navigation', () => {
    it('navigateToRoot should load root', async () => {
      api.getRoots.mockResolvedValue([])
      await store.navigateToRoot('work')
      expect(api.getRoots).toHaveBeenCalledWith('work')
      expect(store.currentContainerId).toBeNull()
    })

    it('navigateToContainer should load container', async () => {
      api.getNode.mockResolvedValue({ id: 5 })
      api.getDescendants.mockResolvedValue([])
      api.getAncestors.mockResolvedValue([])

      await store.navigateToContainer(5, 'work')

      expect(store.currentContainerId).toBe(5)
    })

    it('navigateToParent should go up one level', async () => {
      store.breadcrumbs = [
        { id: 1, title: 'Root' },
        { id: 5, title: 'Parent' },
        { id: 10, title: 'Current' },
      ]
      api.getNode.mockResolvedValue({ id: 5 })
      api.getDescendants.mockResolvedValue([])
      api.getAncestors.mockResolvedValue([])

      await store.navigateToParent('work')

      expect(api.getNode).toHaveBeenCalledWith(5)
    })

    it('navigateToParent should go to root when at first level', async () => {
      store.breadcrumbs = [{ id: 5, title: 'Current' }]
      api.getRoots.mockResolvedValue([])

      await store.navigateToParent('work')

      expect(api.getRoots).toHaveBeenCalled()
    })
  })
})
