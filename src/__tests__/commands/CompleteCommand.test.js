import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CompleteCommand } from '../../commands/CompleteCommand.js'

describe('CompleteCommand', () => {
  let mockApi

  beforeEach(() => {
    mockApi = {
      updateNode: vi.fn().mockResolvedValue()
    }
  })

  it('should have type "complete"', () => {
    const cmd = new CompleteCommand({ nodeId: 1, oldCompleted: false, newCompleted: true })
    expect(cmd.type).toBe('complete')
  })

  it('should store nodeId, oldCompleted, newCompleted', () => {
    const cmd = new CompleteCommand({ nodeId: 1, oldCompleted: false, newCompleted: true })
    expect(cmd.nodeId).toBe(1)
    expect(cmd.oldCompleted).toBe(false)
    expect(cmd.newCompleted).toBe(true)
  })

  describe('execute()', () => {
    it('should call api.updateNode with newCompleted', async () => {
      const cmd = new CompleteCommand({ nodeId: 1, oldCompleted: false, newCompleted: true })
      await cmd.execute(mockApi)
      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { completed: true })
    })
  })

  describe('undo()', () => {
    it('should call api.updateNode with oldCompleted', async () => {
      const cmd = new CompleteCommand({ nodeId: 1, oldCompleted: false, newCompleted: true })
      await cmd.undo(mockApi)
      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { completed: false })
    })
  })

  describe('toJSON()', () => {
    it('should serialize all fields', () => {
      const cmd = new CompleteCommand({ nodeId: 1, oldCompleted: false, newCompleted: true })
      expect(cmd.toJSON()).toEqual({
        type: 'complete',
        nodeId: 1,
        oldCompleted: false,
        newCompleted: true
      })
    })
  })
})
