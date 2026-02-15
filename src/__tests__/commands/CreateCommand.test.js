import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreateCommand } from '../../commands/CreateCommand.js'

describe('CreateCommand', () => {
  let mockApi

  beforeEach(() => {
    mockApi = {
      createNode: vi.fn().mockResolvedValue({ id: 99 }),
      deleteNode: vi.fn().mockResolvedValue(),
      unlinkNodes: vi.fn().mockResolvedValue()
    }
  })

  const nodeData = { title: 'Test Node', type: 'task' }

  it('should have type "create"', () => {
    const cmd = new CreateCommand({ nodeId: 1, nodeData, parentId: 2 })
    expect(cmd.type).toBe('create')
  })

  it('should store nodeId, nodeData, parentId, linkedToId', () => {
    const cmd = new CreateCommand({ nodeId: 1, nodeData, parentId: 2, linkedToId: 3 })
    expect(cmd.nodeId).toBe(1)
    expect(cmd.nodeData).toEqual(nodeData)
    expect(cmd.parentId).toBe(2)
    expect(cmd.linkedToId).toBe(3)
  })

  it('should default linkedToId to null', () => {
    const cmd = new CreateCommand({ nodeId: 1, nodeData, parentId: 2 })
    expect(cmd.linkedToId).toBe(null)
  })

  describe('execute()', () => {
    it('should call api.createNode with nodeData and parent_id', async () => {
      const cmd = new CreateCommand({ nodeId: 1, nodeData, parentId: 2 })
      await cmd.execute(mockApi)
      expect(mockApi.createNode).toHaveBeenCalledWith({
        ...nodeData,
        parent_id: 2
      })
    })

    it('should update nodeId from created result', async () => {
      const cmd = new CreateCommand({ nodeId: 1, nodeData, parentId: 2 })
      await cmd.execute(mockApi)
      expect(cmd.nodeId).toBe(99) // Updated from mock response
    })
  })

  describe('undo()', () => {
    it('should call api.deleteNode with hard delete', async () => {
      const cmd = new CreateCommand({ nodeId: 1, nodeData, parentId: 2 })
      await cmd.undo(mockApi)
      expect(mockApi.deleteNode).toHaveBeenCalledWith(1, true)
    })

    it('should unlink before delete if linkedToId exists', async () => {
      const cmd = new CreateCommand({ nodeId: 1, nodeData, parentId: 2, linkedToId: 3 })
      await cmd.undo(mockApi)
      expect(mockApi.unlinkNodes).toHaveBeenCalledWith(1, 3)
      expect(mockApi.deleteNode).toHaveBeenCalledWith(1, true)
    })

    it('should not call unlinkNodes if linkedToId is null', async () => {
      const cmd = new CreateCommand({ nodeId: 1, nodeData, parentId: 2 })
      await cmd.undo(mockApi)
      expect(mockApi.unlinkNodes).not.toHaveBeenCalled()
    })
  })

  describe('toJSON()', () => {
    it('should serialize all fields', () => {
      const cmd = new CreateCommand({ nodeId: 1, nodeData, parentId: 2, linkedToId: 3 })
      expect(cmd.toJSON()).toEqual({
        type: 'create',
        nodeId: 1,
        nodeData,
        parentId: 2,
        linkedToId: 3
      })
    })
  })
})
