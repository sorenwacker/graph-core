import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReorderCommand } from '../../commands/ReorderCommand.js'

describe('ReorderCommand', () => {
  let mockApi

  beforeEach(() => {
    mockApi = {
      reorderNode: vi.fn().mockResolvedValue()
    }
  })

  it('should have type "reorder"', () => {
    const cmd = new ReorderCommand({
      nodeId: 1,
      oldTargetId: 2,
      oldPosition: 'after',
      newTargetId: 3,
      newPosition: 'before'
    })
    expect(cmd.type).toBe('reorder')
  })

  it('should store all reorder fields', () => {
    const cmd = new ReorderCommand({
      nodeId: 1,
      oldTargetId: 2,
      oldPosition: 'after',
      newTargetId: 3,
      newPosition: 'before'
    })
    expect(cmd.nodeId).toBe(1)
    expect(cmd.oldTargetId).toBe(2)
    expect(cmd.oldPosition).toBe('after')
    expect(cmd.newTargetId).toBe(3)
    expect(cmd.newPosition).toBe('before')
  })

  describe('execute()', () => {
    it('should call api.reorderNode with new target and position', async () => {
      const cmd = new ReorderCommand({
        nodeId: 1,
        oldTargetId: 2,
        oldPosition: 'after',
        newTargetId: 3,
        newPosition: 'before'
      })
      await cmd.execute(mockApi)
      expect(mockApi.reorderNode).toHaveBeenCalledWith(1, 3, 'before')
    })
  })

  describe('undo()', () => {
    it('should call api.reorderNode with old target and position', async () => {
      const cmd = new ReorderCommand({
        nodeId: 1,
        oldTargetId: 2,
        oldPosition: 'after',
        newTargetId: 3,
        newPosition: 'before'
      })
      await cmd.undo(mockApi)
      expect(mockApi.reorderNode).toHaveBeenCalledWith(1, 2, 'after')
    })
  })

  describe('toJSON()', () => {
    it('should serialize all fields', () => {
      const cmd = new ReorderCommand({
        nodeId: 1,
        oldTargetId: 2,
        oldPosition: 'after',
        newTargetId: 3,
        newPosition: 'before'
      })
      expect(cmd.toJSON()).toEqual({
        type: 'reorder',
        nodeId: 1,
        oldTargetId: 2,
        oldPosition: 'after',
        newTargetId: 3,
        newPosition: 'before'
      })
    })
  })
})
