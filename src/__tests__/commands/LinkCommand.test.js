import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LinkCommand } from '../../commands/LinkCommand.js'
import { UnlinkCommand } from '../../commands/UnlinkCommand.js'

describe('LinkCommand', () => {
  let mockApi

  beforeEach(() => {
    mockApi = {
      linkNodes: vi.fn().mockResolvedValue(),
      unlinkNodes: vi.fn().mockResolvedValue(),
    }
  })

  it('should have type "link"', () => {
    const cmd = new LinkCommand({ sourceId: 1, targetId: 2 })
    expect(cmd.type).toBe('link')
  })

  it('should store sourceId and targetId', () => {
    const cmd = new LinkCommand({ sourceId: 1, targetId: 2 })
    expect(cmd.sourceId).toBe(1)
    expect(cmd.targetId).toBe(2)
  })

  describe('execute()', () => {
    it('should call api.linkNodes with sourceId and targetId', async () => {
      const cmd = new LinkCommand({ sourceId: 1, targetId: 2 })
      await cmd.execute(mockApi)
      expect(mockApi.linkNodes).toHaveBeenCalledWith(1, 2)
    })
  })

  describe('undo()', () => {
    it('should call api.unlinkNodes with sourceId and targetId', async () => {
      const cmd = new LinkCommand({ sourceId: 1, targetId: 2 })
      await cmd.undo(mockApi)
      expect(mockApi.unlinkNodes).toHaveBeenCalledWith(1, 2)
    })
  })

  describe('toJSON()', () => {
    it('should serialize all fields', () => {
      const cmd = new LinkCommand({ sourceId: 1, targetId: 2 })
      expect(cmd.toJSON()).toEqual({
        type: 'link',
        sourceId: 1,
        targetId: 2,
      })
    })
  })
})

describe('UnlinkCommand', () => {
  let mockApi

  beforeEach(() => {
    mockApi = {
      linkNodes: vi.fn().mockResolvedValue(),
      unlinkNodes: vi.fn().mockResolvedValue(),
    }
  })

  it('should have type "unlink"', () => {
    const cmd = new UnlinkCommand({ sourceId: 1, targetId: 2 })
    expect(cmd.type).toBe('unlink')
  })

  describe('execute()', () => {
    it('should call api.unlinkNodes (opposite of LinkCommand)', async () => {
      const cmd = new UnlinkCommand({ sourceId: 1, targetId: 2 })
      await cmd.execute(mockApi)
      expect(mockApi.unlinkNodes).toHaveBeenCalledWith(1, 2)
    })
  })

  describe('undo()', () => {
    it('should call api.linkNodes (opposite of LinkCommand)', async () => {
      const cmd = new UnlinkCommand({ sourceId: 1, targetId: 2 })
      await cmd.undo(mockApi)
      expect(mockApi.linkNodes).toHaveBeenCalledWith(1, 2)
    })
  })
})
