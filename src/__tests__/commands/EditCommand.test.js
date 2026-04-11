import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EditCommand } from '../../commands/EditCommand.js'

describe('EditCommand', () => {
  let mockApi

  beforeEach(() => {
    mockApi = {
      updateNode: vi.fn().mockResolvedValue(),
    }
  })

  const oldValues = { title: 'Old Title', notes: 'Old notes' }
  const newValues = { title: 'New Title', notes: 'New notes' }

  it('should have type "edit"', () => {
    const cmd = new EditCommand({ nodeId: 1, oldValues, newValues })
    expect(cmd.type).toBe('edit')
  })

  it('should store nodeId, oldValues, newValues', () => {
    const cmd = new EditCommand({ nodeId: 1, oldValues, newValues })
    expect(cmd.nodeId).toBe(1)
    expect(cmd.oldValues).toEqual(oldValues)
    expect(cmd.newValues).toEqual(newValues)
  })

  describe('execute()', () => {
    it('should call api.updateNode with newValues', async () => {
      const cmd = new EditCommand({ nodeId: 1, oldValues, newValues })
      await cmd.execute(mockApi)
      expect(mockApi.updateNode).toHaveBeenCalledWith(1, newValues)
    })
  })

  describe('undo()', () => {
    it('should call api.updateNode with oldValues', async () => {
      const cmd = new EditCommand({ nodeId: 1, oldValues, newValues })
      await cmd.undo(mockApi)
      expect(mockApi.updateNode).toHaveBeenCalledWith(1, oldValues)
    })
  })

  describe('toJSON()', () => {
    it('should serialize all fields', () => {
      const cmd = new EditCommand({ nodeId: 1, oldValues, newValues })
      expect(cmd.toJSON()).toEqual({
        type: 'edit',
        nodeId: 1,
        oldValues,
        newValues,
      })
    })
  })
})
