import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useUndoRedo } from '../composables/useUndoRedo.js'
import {
  CreateCommand,
  DeleteCommand,
  EditCommand,
  MoveCommand,
  CompleteCommand,
  LinkCommand,
  UnlinkCommand,
} from '../commands/index.js'

/**
 * Integration tests for undo/redo workflows.
 * These tests verify multi-command sequences work correctly.
 */
describe('undo/redo workflows', () => {
  let mockApi, undoRedo

  beforeEach(() => {
    mockApi = {
      createNode: vi.fn().mockResolvedValue({ id: 100 }),
      deleteNode: vi.fn().mockResolvedValue(),
      updateNode: vi.fn().mockResolvedValue(),
      moveNode: vi.fn().mockResolvedValue(),
      restoreNode: vi.fn().mockResolvedValue({ id: 1, parent_id: 2 }),
      linkNodes: vi.fn().mockResolvedValue(),
      unlinkNodes: vi.fn().mockResolvedValue(),
    }
    // Disable persistence in tests to avoid cross-test pollution
    undoRedo = useUndoRedo({ api: mockApi, persist: false })
  })

  describe('create then undo', () => {
    it('should undo node creation with hard delete', async () => {
      const command = new CreateCommand({
        nodeId: 1,
        nodeData: { title: 'Test', type: 'task' },
        parentId: null,
      })
      undoRedo.pushCommand(command)

      await undoRedo.undo()

      expect(mockApi.deleteNode).toHaveBeenCalledWith(1, true) // hard delete
      expect(undoRedo.canUndo.value).toBe(false)
      expect(undoRedo.canRedo.value).toBe(true)
    })

    it('should redo node creation', async () => {
      const command = new CreateCommand({
        nodeId: 1,
        nodeData: { title: 'Test', type: 'task' },
        parentId: 5,
      })
      undoRedo.pushCommand(command)

      await undoRedo.undo()
      await undoRedo.redo()

      expect(mockApi.createNode).toHaveBeenCalledWith({
        title: 'Test',
        type: 'task',
        parent_id: 5,
      })
    })
  })

  describe('edit then undo', () => {
    it('should restore original values on undo', async () => {
      const command = new EditCommand({
        nodeId: 1,
        oldValues: { title: 'Original' },
        newValues: { title: 'Changed' },
      })
      undoRedo.pushCommand(command)

      await undoRedo.undo()

      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { title: 'Original' })
    })

    it('should apply new values on redo', async () => {
      const command = new EditCommand({
        nodeId: 1,
        oldValues: { title: 'Original' },
        newValues: { title: 'Changed' },
      })
      undoRedo.pushCommand(command)

      await undoRedo.undo()
      mockApi.updateNode.mockClear()
      await undoRedo.redo()

      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { title: 'Changed' })
    })
  })

  describe('delete then undo', () => {
    it('should restore node on undo', async () => {
      const command = new DeleteCommand({
        nodeData: { id: 1, title: 'Deleted', parent_id: 5 },
      })
      undoRedo.pushCommand(command)

      mockApi.restoreNode.mockResolvedValue({ id: 1, parent_id: 5 })
      await undoRedo.undo()

      expect(mockApi.restoreNode).toHaveBeenCalledWith(1)
    })

    it('should fix parent_id if changed during restore', async () => {
      const command = new DeleteCommand({
        nodeData: { id: 1, title: 'Deleted', parent_id: 5 },
      })
      undoRedo.pushCommand(command)

      // Simulate parent was deleted, so restore puts node at different parent
      mockApi.restoreNode.mockResolvedValue({ id: 1, parent_id: null })
      await undoRedo.undo()

      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { parent_id: 5 })
    })
  })

  describe('move then undo', () => {
    it('should move back to original parent on undo', async () => {
      const command = new MoveCommand({
        nodeId: 1,
        oldParentId: 5,
        newParentId: 10,
      })
      undoRedo.pushCommand(command)

      await undoRedo.undo()

      expect(mockApi.moveNode).toHaveBeenCalledWith(1, 5)
    })

    it('should move to new parent on redo', async () => {
      const command = new MoveCommand({
        nodeId: 1,
        oldParentId: 5,
        newParentId: 10,
      })
      undoRedo.pushCommand(command)

      await undoRedo.undo()
      mockApi.moveNode.mockClear()
      await undoRedo.redo()

      expect(mockApi.moveNode).toHaveBeenCalledWith(1, 10)
    })
  })

  describe('complete then undo', () => {
    it('should toggle completion status on undo', async () => {
      const command = new CompleteCommand({
        nodeId: 1,
        oldCompleted: false,
        newCompleted: true,
      })
      undoRedo.pushCommand(command)

      await undoRedo.undo()

      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { completed: false })
    })
  })

  describe('link/unlink then undo', () => {
    it('should unlink on undo of link', async () => {
      const command = new LinkCommand({ sourceId: 1, targetId: 2 })
      undoRedo.pushCommand(command)

      await undoRedo.undo()

      expect(mockApi.unlinkNodes).toHaveBeenCalledWith(1, 2)
    })

    it('should link on undo of unlink', async () => {
      const command = new UnlinkCommand({ sourceId: 1, targetId: 2 })
      undoRedo.pushCommand(command)

      await undoRedo.undo()

      expect(mockApi.linkNodes).toHaveBeenCalledWith(1, 2)
    })
  })

  describe('multi-command workflows', () => {
    it('should undo multiple commands in reverse order', async () => {
      const callOrder = []

      mockApi.updateNode.mockImplementation((id, data) => {
        callOrder.push({ action: 'update', id, data })
        return Promise.resolve()
      })

      // Create -> Edit -> Edit sequence
      undoRedo.pushCommand(
        new EditCommand({
          nodeId: 1,
          oldValues: { title: 'A' },
          newValues: { title: 'B' },
        })
      )
      undoRedo.pushCommand(
        new EditCommand({
          nodeId: 1,
          oldValues: { title: 'B' },
          newValues: { title: 'C' },
        })
      )
      undoRedo.pushCommand(
        new EditCommand({
          nodeId: 1,
          oldValues: { title: 'C' },
          newValues: { title: 'D' },
        })
      )

      expect(undoRedo.undoCount.value).toBe(3)

      // Undo all three
      await undoRedo.undo() // D -> C
      await undoRedo.undo() // C -> B
      await undoRedo.undo() // B -> A

      expect(callOrder).toEqual([
        { action: 'update', id: 1, data: { title: 'C' } },
        { action: 'update', id: 1, data: { title: 'B' } },
        { action: 'update', id: 1, data: { title: 'A' } },
      ])

      expect(undoRedo.undoCount.value).toBe(0)
      expect(undoRedo.redoCount.value).toBe(3)
    })

    it('should redo in correct order after undo', async () => {
      const callOrder = []

      mockApi.updateNode.mockImplementation((id, data) => {
        callOrder.push({ action: 'update', id, data })
        return Promise.resolve()
      })

      undoRedo.pushCommand(
        new EditCommand({
          nodeId: 1,
          oldValues: { title: 'A' },
          newValues: { title: 'B' },
        })
      )
      undoRedo.pushCommand(
        new EditCommand({
          nodeId: 1,
          oldValues: { title: 'B' },
          newValues: { title: 'C' },
        })
      )

      await undoRedo.undo()
      await undoRedo.undo()
      callOrder.length = 0 // Clear for redo checks

      await undoRedo.redo() // A -> B
      await undoRedo.redo() // B -> C

      expect(callOrder).toEqual([
        { action: 'update', id: 1, data: { title: 'B' } },
        { action: 'update', id: 1, data: { title: 'C' } },
      ])
    })

    it('should clear redo stack when new command is pushed after undo', async () => {
      undoRedo.pushCommand(
        new EditCommand({
          nodeId: 1,
          oldValues: { title: 'A' },
          newValues: { title: 'B' },
        })
      )
      undoRedo.pushCommand(
        new EditCommand({
          nodeId: 1,
          oldValues: { title: 'B' },
          newValues: { title: 'C' },
        })
      )

      await undoRedo.undo() // C -> B, redo has C
      expect(undoRedo.redoCount.value).toBe(1)

      // Push new command - should clear redo stack
      undoRedo.pushCommand(
        new EditCommand({
          nodeId: 1,
          oldValues: { title: 'B' },
          newValues: { title: 'X' },
        })
      )

      expect(undoRedo.redoCount.value).toBe(0)
      expect(undoRedo.undoCount.value).toBe(2)
    })

    it('should handle mixed command types', async () => {
      // Simulate real workflow: create, edit, complete
      const createCmd = new CreateCommand({
        nodeId: 1,
        nodeData: { title: 'Task', type: 'task' },
        parentId: null,
      })
      const editCmd = new EditCommand({
        nodeId: 1,
        oldValues: { title: 'Task' },
        newValues: { title: 'Updated Task' },
      })
      const completeCmd = new CompleteCommand({
        nodeId: 1,
        oldCompleted: false,
        newCompleted: true,
      })

      undoRedo.pushCommand(createCmd)
      undoRedo.pushCommand(editCmd)
      undoRedo.pushCommand(completeCmd)

      // Undo all
      await undoRedo.undo() // uncomplete
      expect(mockApi.updateNode).toHaveBeenLastCalledWith(1, { completed: false })

      await undoRedo.undo() // revert title
      expect(mockApi.updateNode).toHaveBeenLastCalledWith(1, { title: 'Task' })

      await undoRedo.undo() // delete created node
      expect(mockApi.deleteNode).toHaveBeenCalledWith(1, true)

      expect(undoRedo.undoCount.value).toBe(0)
      expect(undoRedo.redoCount.value).toBe(3)
    })
  })

  describe('tag operations', () => {
    it('should undo tag addition', async () => {
      const command = new EditCommand({
        nodeId: 1,
        oldValues: { tags: ['bug'] },
        newValues: { tags: ['bug', 'feature'] },
      })
      undoRedo.pushCommand(command)

      await undoRedo.undo()

      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { tags: ['bug'] })
    })

    it('should redo tag addition', async () => {
      const command = new EditCommand({
        nodeId: 1,
        oldValues: { tags: [] },
        newValues: { tags: ['urgent'] },
      })
      undoRedo.pushCommand(command)

      await undoRedo.undo()
      mockApi.updateNode.mockClear()
      await undoRedo.redo()

      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { tags: ['urgent'] })
    })

    it('should undo tag removal', async () => {
      const command = new EditCommand({
        nodeId: 1,
        oldValues: { tags: ['bug', 'feature', 'urgent'] },
        newValues: { tags: ['bug'] },
      })
      undoRedo.pushCommand(command)

      await undoRedo.undo()

      expect(mockApi.updateNode).toHaveBeenCalledWith(1, {
        tags: ['bug', 'feature', 'urgent'],
      })
    })

    it('should handle empty tags array', async () => {
      const command = new EditCommand({
        nodeId: 1,
        oldValues: { tags: ['last-tag'] },
        newValues: { tags: [] },
      })
      undoRedo.pushCommand(command)

      await undoRedo.undo()

      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { tags: ['last-tag'] })
    })
  })

  describe('error handling in workflows', () => {
    it('should preserve stack state when undo fails mid-workflow', async () => {
      undoRedo.pushCommand(
        new EditCommand({
          nodeId: 1,
          oldValues: { title: 'A' },
          newValues: { title: 'B' },
        })
      )
      undoRedo.pushCommand(
        new EditCommand({
          nodeId: 2,
          oldValues: { title: 'X' },
          newValues: { title: 'Y' },
        })
      )

      // First undo succeeds, second fails
      mockApi.updateNode
        .mockResolvedValueOnce() // first undo succeeds
        .mockRejectedValueOnce(new Error('Network error'))

      await undoRedo.undo() // succeeds
      await undoRedo.undo() // fails

      // First command should be in redo, failed command back in undo
      expect(undoRedo.undoCount.value).toBe(1)
      expect(undoRedo.redoCount.value).toBe(1)
    })

    it('should call onError with failed command', async () => {
      const onError = vi.fn()
      const ur = useUndoRedo({ api: mockApi, onError })

      const failingCmd = new EditCommand({
        nodeId: 1,
        oldValues: { title: 'A' },
        newValues: { title: 'B' },
      })
      ur.pushCommand(failingCmd)

      mockApi.updateNode.mockRejectedValue(new Error('DB error'))
      await ur.undo()

      expect(onError).toHaveBeenCalledWith(expect.any(Error), failingCmd)
    })
  })
})
