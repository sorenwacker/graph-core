import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeleteCommand } from '../../commands/DeleteCommand.js'
import { DeleteMultipleCommand } from '../../commands/DeleteMultipleCommand.js'

describe('DeleteCommand', () => {
  let mockApi

  beforeEach(() => {
    mockApi = {
      deleteNode: vi.fn().mockResolvedValue(),
      restoreNode: vi.fn().mockResolvedValue({ id: 1, parent_id: 2 }),
      updateNode: vi.fn().mockResolvedValue()
    }
  })

  const nodeData = { id: 1, title: 'Test', parent_id: 2 }

  it('should have type "delete"', () => {
    const cmd = new DeleteCommand({ nodeData })
    expect(cmd.type).toBe('delete')
  })

  it('should store nodeData', () => {
    const cmd = new DeleteCommand({ nodeData })
    expect(cmd.nodeData).toEqual(nodeData)
  })

  describe('execute()', () => {
    it('should call api.deleteNode with soft delete', async () => {
      const cmd = new DeleteCommand({ nodeData })
      await cmd.execute(mockApi)
      expect(mockApi.deleteNode).toHaveBeenCalledWith(1, false)
    })
  })

  describe('undo()', () => {
    it('should call api.restoreNode', async () => {
      const cmd = new DeleteCommand({ nodeData })
      await cmd.undo(mockApi)
      expect(mockApi.restoreNode).toHaveBeenCalledWith(1)
    })

    it('should restore parent_id if it changed after restore', async () => {
      mockApi.restoreNode.mockResolvedValue({ id: 1, parent_id: 99 }) // Different parent
      const cmd = new DeleteCommand({ nodeData })
      await cmd.undo(mockApi)
      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { parent_id: 2 })
    })

    it('should not update parent_id if unchanged', async () => {
      mockApi.restoreNode.mockResolvedValue({ id: 1, parent_id: 2 }) // Same parent
      const cmd = new DeleteCommand({ nodeData })
      await cmd.undo(mockApi)
      expect(mockApi.updateNode).not.toHaveBeenCalled()
    })
  })

  describe('toJSON()', () => {
    it('should serialize nodeData', () => {
      const cmd = new DeleteCommand({ nodeData })
      expect(cmd.toJSON()).toEqual({
        type: 'delete',
        nodeData
      })
    })
  })
})

describe('DeleteMultipleCommand', () => {
  let mockApi

  beforeEach(() => {
    mockApi = {
      deleteNode: vi.fn().mockResolvedValue(),
      restoreNode: vi.fn().mockImplementation(id =>
        Promise.resolve({ id, parent_id: id === 1 ? 2 : 3 })
      ),
      updateNode: vi.fn().mockResolvedValue()
    }
  })

  const nodes = [
    { id: 1, title: 'Node 1', parent_id: 2 },
    { id: 2, title: 'Node 2', parent_id: 3 }
  ]

  it('should have type "delete-multiple"', () => {
    const cmd = new DeleteMultipleCommand({ nodes })
    expect(cmd.type).toBe('delete-multiple')
  })

  it('should store nodes array', () => {
    const cmd = new DeleteMultipleCommand({ nodes })
    expect(cmd.nodes).toEqual(nodes)
  })

  describe('execute()', () => {
    it('should call api.deleteNode for each node', async () => {
      const cmd = new DeleteMultipleCommand({ nodes })
      await cmd.execute(mockApi)
      expect(mockApi.deleteNode).toHaveBeenCalledTimes(2)
      expect(mockApi.deleteNode).toHaveBeenCalledWith(1, false)
      expect(mockApi.deleteNode).toHaveBeenCalledWith(2, false)
    })
  })

  describe('undo()', () => {
    it('should call api.restoreNode for each node', async () => {
      const cmd = new DeleteMultipleCommand({ nodes })
      await cmd.undo(mockApi)
      expect(mockApi.restoreNode).toHaveBeenCalledTimes(2)
      expect(mockApi.restoreNode).toHaveBeenCalledWith(1)
      expect(mockApi.restoreNode).toHaveBeenCalledWith(2)
    })

    it('should restore parent_id for nodes where it changed', async () => {
      mockApi.restoreNode.mockImplementation(id =>
        Promise.resolve({ id, parent_id: 99 }) // Different parent for all
      )
      const cmd = new DeleteMultipleCommand({ nodes })
      await cmd.undo(mockApi)
      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { parent_id: 2 })
      expect(mockApi.updateNode).toHaveBeenCalledWith(2, { parent_id: 3 })
    })
  })

  describe('toJSON()', () => {
    it('should serialize nodes array', () => {
      const cmd = new DeleteMultipleCommand({ nodes })
      expect(cmd.toJSON()).toEqual({
        type: 'delete-multiple',
        nodes
      })
    })
  })
})
