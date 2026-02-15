import { describe, it, expect } from 'vitest'
import { Command } from '../../commands/Command.js'

describe('Command base class', () => {
  it('should store type on construction', () => {
    const cmd = new Command('test-type')
    expect(cmd.type).toBe('test-type')
  })

  it('should throw on execute() if not implemented', async () => {
    const cmd = new Command('test')
    await expect(cmd.execute({})).rejects.toThrow('execute() must be implemented')
  })

  it('should throw on undo() if not implemented', async () => {
    const cmd = new Command('test')
    await expect(cmd.undo({})).rejects.toThrow('undo() must be implemented')
  })

  it('should serialize to JSON with type', () => {
    const cmd = new Command('test-type')
    expect(cmd.toJSON()).toEqual({ type: 'test-type' })
  })
})
