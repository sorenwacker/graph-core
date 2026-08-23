import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApplyNotesEditCommand } from '../../commands/ApplyNotesEditCommand.js'

describe('ApplyNotesEditCommand', () => {
  let mockApi

  beforeEach(() => {
    mockApi = {
      updateNode: vi.fn().mockResolvedValue(),
    }
  })

  const options = {
    nodeId: 1,
    oldNotes: 'Original notes content',
    newNotes: 'Improved notes content',
    prompt: 'Improve',
  }

  it('should have type "ollama-improve-notes"', () => {
    const cmd = new ApplyNotesEditCommand(options)
    expect(cmd.type).toBe('apply-notes-edit')
  })

  it('should store nodeId, oldNotes, newNotes, prompt', () => {
    const cmd = new ApplyNotesEditCommand(options)
    expect(cmd.nodeId).toBe(1)
    expect(cmd.oldNotes).toBe('Original notes content')
    expect(cmd.newNotes).toBe('Improved notes content')
    expect(cmd.prompt).toBe('Improve')
  })

  describe('execute()', () => {
    it('should call api.updateNode with newNotes', async () => {
      const cmd = new ApplyNotesEditCommand(options)
      await cmd.execute(mockApi)
      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { notes: 'Improved notes content' })
    })
  })

  describe('undo()', () => {
    it('should call api.updateNode with oldNotes', async () => {
      const cmd = new ApplyNotesEditCommand(options)
      await cmd.undo(mockApi)
      expect(mockApi.updateNode).toHaveBeenCalledWith(1, { notes: 'Original notes content' })
    })
  })

  describe('toJSON()', () => {
    it('should serialize all fields', () => {
      const cmd = new ApplyNotesEditCommand(options)
      expect(cmd.toJSON()).toEqual({
        type: 'apply-notes-edit',
        nodeId: 1,
        oldNotes: 'Original notes content',
        newNotes: 'Improved notes content',
        prompt: 'Improve',
      })
    })

    it('should handle empty notes', () => {
      const cmd = new ApplyNotesEditCommand({
        nodeId: 2,
        oldNotes: '',
        newNotes: 'New content',
        prompt: 'Generate',
      })
      expect(cmd.toJSON()).toEqual({
        type: 'apply-notes-edit',
        nodeId: 2,
        oldNotes: '',
        newNotes: 'New content',
        prompt: 'Generate',
      })
    })
  })

  describe('getDescription()', () => {
    it('should return description with prompt name', () => {
      const cmd = new ApplyNotesEditCommand(options)
      expect(cmd.getDescription()).toBe('AI Improve notes')
    })

    it('should handle short custom prompt', () => {
      const cmd = new ApplyNotesEditCommand({
        ...options,
        prompt: 'Short',
      })
      expect(cmd.getDescription()).toBe('AI Short notes')
    })

    it('should truncate long prompts', () => {
      const cmd = new ApplyNotesEditCommand({
        ...options,
        prompt: 'This is a very long prompt that should be truncated',
      })
      const description = cmd.getDescription()
      expect(description.length).toBeLessThanOrEqual(30)
      expect(description).toContain('...')
    })

    it('should not throw when prompt is undefined (e.g. reconstructed without one)', () => {
      const cmd = new ApplyNotesEditCommand({ nodeId: 1, oldNotes: '', newNotes: 'x' })
      expect(() => cmd.getDescription()).not.toThrow()
      expect(cmd.getDescription()).toBe('AI  notes')
    })
  })

  describe('deserialization', () => {
    it('should be reconstructable from JSON', () => {
      const cmd = new ApplyNotesEditCommand(options)
      const json = cmd.toJSON()

      // Simulate deserialization
      const { type: _type, ...params } = json
      const reconstructed = new ApplyNotesEditCommand(params)

      expect(reconstructed.nodeId).toBe(cmd.nodeId)
      expect(reconstructed.oldNotes).toBe(cmd.oldNotes)
      expect(reconstructed.newNotes).toBe(cmd.newNotes)
      expect(reconstructed.prompt).toBe(cmd.prompt)
    })
  })
})
