import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useNodeOperations } from '../composables/useNodeOperations.js'

describe('useNodeOperations composable', () => {
  let mockApi
  let mockPushCommand
  let mockOnSuccess
  let mockOnError
  let ops

  beforeEach(() => {
    mockApi = {
      createNode: vi.fn(),
      getNode: vi.fn(),
      updateNode: vi.fn(),
      deleteNode: vi.fn(),
      getDescendants: vi.fn(),
      moveNode: vi.fn()
    }
    mockPushCommand = vi.fn()
    mockOnSuccess = vi.fn()
    mockOnError = vi.fn()

    ops = useNodeOperations({
      api: mockApi,
      pushCommand: mockPushCommand,
      getWorkspaceIdForNode: (type) => type === 'person' ? 'people' : 'work',
      onSuccess: mockOnSuccess,
      onError: mockOnError,
      broadcastUpdate: vi.fn(),
      broadcastDelete: vi.fn()
    })
  })

  describe('createNode', () => {
    it('should create a node and push command', async () => {
      const newNode = { id: 1, title: 'Test', type: 'task' }
      mockApi.createNode.mockResolvedValue(newNode)

      const result = await ops.createNode({ title: 'Test', type: 'task', parentId: null })

      expect(result).toEqual(newNode)
      expect(mockApi.createNode).toHaveBeenCalledWith({
        title: 'Test',
        type: 'task',
        parent_id: null,
        workspace_id: 'work'
      })
      expect(mockPushCommand).toHaveBeenCalled()
      expect(mockOnSuccess).toHaveBeenCalledWith({ type: 'create', node: newNode, x: undefined, y: undefined })
    })

    it('should return null on error', async () => {
      mockApi.createNode.mockRejectedValue(new Error('API error'))

      const result = await ops.createNode({ title: 'Test', type: 'task' })

      expect(result).toBeNull()
      expect(mockOnError).toHaveBeenCalled()
    })

    it('should use correct workspace for person type', async () => {
      const newNode = { id: 1, title: 'John', type: 'person' }
      mockApi.createNode.mockResolvedValue(newNode)

      await ops.createNode({ title: 'John', type: 'person', parentId: null })

      expect(mockApi.createNode).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: 'people' })
      )
    })
  })

  describe('updateNode', () => {
    it('should update a node and push edit command', async () => {
      const oldNode = { id: 1, title: 'Old', completed: false }
      const updatedNode = { id: 1, title: 'New', completed: false }
      mockApi.getNode.mockResolvedValue(oldNode)
      mockApi.updateNode.mockResolvedValue(true)

      const result = await ops.updateNode(updatedNode)

      expect(result).toBe(true)
      expect(mockApi.updateNode).toHaveBeenCalled()
      expect(mockPushCommand).toHaveBeenCalled()
    })

    it('should auto-set end_date when marking complete', async () => {
      const oldNode = { id: 1, title: 'Task', completed: false }
      const updatedNode = { id: 1, title: 'Task', completed: true }
      mockApi.getNode.mockResolvedValue(oldNode)
      mockApi.updateNode.mockResolvedValue(true)

      await ops.updateNode(updatedNode)

      expect(updatedNode.end_date).toBeDefined()
      expect(updatedNode.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should skip undo tracking when trackUndo is false', async () => {
      const updatedNode = { id: 1, title: 'Task' }
      mockApi.updateNode.mockResolvedValue(true)

      await ops.updateNode(updatedNode, { trackUndo: false })

      expect(mockApi.getNode).not.toHaveBeenCalled()
      expect(mockPushCommand).not.toHaveBeenCalled()
    })
  })

  describe('deleteNode', () => {
    it('should delete a node and its descendants', async () => {
      const node = { id: 1, title: 'Parent' }
      const descendants = [{ id: 2, title: 'Child' }]
      mockApi.getNode.mockResolvedValue(node)
      mockApi.getDescendants.mockResolvedValue(descendants)
      mockApi.deleteNode.mockResolvedValue(true)

      const result = await ops.deleteNode(1)

      expect(result.success).toBe(true)
      expect(result.node).toEqual(node)
      expect(mockApi.deleteNode).toHaveBeenCalledTimes(2)
      expect(mockPushCommand).toHaveBeenCalled()
    })

    it('should return failure if node not found', async () => {
      mockApi.getNode.mockResolvedValue(null)

      const result = await ops.deleteNode(999)

      expect(result.success).toBe(false)
    })
  })

  describe('moveNode', () => {
    it('should move a node and push command', async () => {
      mockApi.moveNode.mockResolvedValue(true)

      const result = await ops.moveNode({ nodeId: 1, oldParentId: 2, newParentId: 3 })

      expect(result).toBe(true)
      expect(mockApi.moveNode).toHaveBeenCalledWith(1, 3)
      expect(mockPushCommand).toHaveBeenCalled()
    })

    it('should not push command if oldParentId is undefined', async () => {
      mockApi.moveNode.mockResolvedValue(true)

      await ops.moveNode({ nodeId: 1, newParentId: 3 })

      expect(mockPushCommand).not.toHaveBeenCalled()
    })
  })

  describe('toggleComplete', () => {
    it('should toggle completion and push command', async () => {
      const node = { id: 1, completed: false }
      mockApi.updateNode.mockResolvedValue(true)

      const result = await ops.toggleComplete(node)

      expect(result).toBe(true)
      expect(mockApi.updateNode).toHaveBeenCalledWith(1, expect.objectContaining({ completed: true }))
      expect(mockPushCommand).toHaveBeenCalled()
    })

    it('should set end_date when completing', async () => {
      const node = { id: 1, completed: false, end_date: null }
      mockApi.updateNode.mockResolvedValue(true)

      await ops.toggleComplete(node)

      expect(mockApi.updateNode).toHaveBeenCalledWith(1, expect.objectContaining({
        completed: true,
        end_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
      }))
    })
  })

  describe('toggleFavorite', () => {
    it('should toggle favorite status', async () => {
      const node = { id: 1, favorite: false }
      mockApi.updateNode.mockResolvedValue(true)

      const result = await ops.toggleFavorite(node)

      expect(result).toBe(true)
      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { favorite: true })
    })
  })

  describe('pickNodeFields', () => {
    it('should extract specified fields from node', () => {
      const node = {
        id: 1,
        title: 'Test',
        type: 'task',
        notes: 'Some notes',
        extraField: 'ignored'
      }

      const result = ops.pickNodeFields(node)

      expect(result.title).toBe('Test')
      expect(result.type).toBe('task')
      expect(result.notes).toBe('Some notes')
      expect(result.extraField).toBeUndefined()
    })
  })
})
