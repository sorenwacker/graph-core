import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MoveCommand } from '../../commands/MoveCommand.js'

describe('MoveCommand', () => {
  let mockApi

  beforeEach(() => {
    mockApi = {
      moveNode: vi.fn().mockResolvedValue(),
    }
  })

  it('should have type "move"', () => {
    const cmd = new MoveCommand({ nodeId: 1, oldParentId: 2, newParentId: 3 })
    expect(cmd.type).toBe('move')
  })

  it('should store nodeId, oldParentId, newParentId', () => {
    const cmd = new MoveCommand({ nodeId: 1, oldParentId: 2, newParentId: 3 })
    expect(cmd.nodeId).toBe(1)
    expect(cmd.oldParentId).toBe(2)
    expect(cmd.newParentId).toBe(3)
  })

  describe('execute()', () => {
    it('should call api.moveNode with nodeId and newParentId', async () => {
      const cmd = new MoveCommand({ nodeId: 1, oldParentId: 2, newParentId: 3 })
      await cmd.execute(mockApi)
      expect(mockApi.moveNode).toHaveBeenCalledWith(1, 3)
    })
  })

  describe('undo()', () => {
    it('should call api.moveNode with nodeId and oldParentId', async () => {
      const cmd = new MoveCommand({ nodeId: 1, oldParentId: 2, newParentId: 3 })
      await cmd.undo(mockApi)
      expect(mockApi.moveNode).toHaveBeenCalledWith(1, 2)
    })
  })

  describe('toJSON()', () => {
    it('should serialize all fields', () => {
      const cmd = new MoveCommand({ nodeId: 1, oldParentId: 2, newParentId: 3 })
      expect(cmd.toJSON()).toEqual({
        type: 'move',
        nodeId: 1,
        oldParentId: 2,
        newParentId: 3,
      })
    })
  })
})
