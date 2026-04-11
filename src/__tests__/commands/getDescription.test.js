import { describe, it, expect } from 'vitest'
import {
  CreateCommand,
  DeleteCommand,
  DeleteMultipleCommand,
  EditCommand,
  MoveCommand,
  CompleteCommand,
  LinkCommand,
  UnlinkCommand,
  ReorderCommand,
} from '../../commands/index.js'

describe('Command getDescription', () => {
  describe('CreateCommand', () => {
    it('should include node title', () => {
      const cmd = new CreateCommand({
        nodeId: 1,
        nodeData: { title: 'New Task' },
        parentId: null,
      })
      expect(cmd.getDescription()).toBe('Create "New Task"')
    })

    it('should fallback to "item" when no title', () => {
      const cmd = new CreateCommand({
        nodeId: 1,
        nodeData: {},
        parentId: null,
      })
      expect(cmd.getDescription()).toBe('Create "item"')
    })
  })

  describe('DeleteCommand', () => {
    it('should include node title', () => {
      const cmd = new DeleteCommand({
        nodeData: { id: 1, title: 'Deleted Item' },
      })
      expect(cmd.getDescription()).toBe('Delete "Deleted Item"')
    })
  })

  describe('DeleteMultipleCommand', () => {
    it('should include count', () => {
      const cmd = new DeleteMultipleCommand({
        nodes: [{ id: 1 }, { id: 2 }, { id: 3 }],
      })
      expect(cmd.getDescription()).toBe('Delete 3 items')
    })
  })

  describe('EditCommand', () => {
    it('should show field name for single field edit', () => {
      const cmd = new EditCommand({
        nodeId: 1,
        oldValues: { title: 'Old' },
        newValues: { title: 'New' },
      })
      expect(cmd.getDescription()).toBe('Edit title')
    })

    it('should show generic Edit for multiple fields', () => {
      const cmd = new EditCommand({
        nodeId: 1,
        oldValues: { title: 'Old', notes: '' },
        newValues: { title: 'New', notes: 'Added' },
      })
      expect(cmd.getDescription()).toBe('Edit')
    })

    it('should show Edit tags for tag changes', () => {
      const cmd = new EditCommand({
        nodeId: 1,
        oldValues: { tags: [] },
        newValues: { tags: ['bug'] },
      })
      expect(cmd.getDescription()).toBe('Edit tags')
    })
  })

  describe('MoveCommand', () => {
    it('should return Move', () => {
      const cmd = new MoveCommand({
        nodeId: 1,
        oldParentId: 5,
        newParentId: 10,
      })
      expect(cmd.getDescription()).toBe('Move')
    })
  })

  describe('CompleteCommand', () => {
    it('should return Complete when completing', () => {
      const cmd = new CompleteCommand({
        nodeId: 1,
        oldCompleted: false,
        newCompleted: true,
      })
      expect(cmd.getDescription()).toBe('Complete')
    })

    it('should return Uncomplete when uncompleting', () => {
      const cmd = new CompleteCommand({
        nodeId: 1,
        oldCompleted: true,
        newCompleted: false,
      })
      expect(cmd.getDescription()).toBe('Uncomplete')
    })
  })

  describe('LinkCommand', () => {
    it('should return Link', () => {
      const cmd = new LinkCommand({ sourceId: 1, targetId: 2 })
      expect(cmd.getDescription()).toBe('Link')
    })
  })

  describe('UnlinkCommand', () => {
    it('should return Unlink', () => {
      const cmd = new UnlinkCommand({ sourceId: 1, targetId: 2 })
      expect(cmd.getDescription()).toBe('Unlink')
    })
  })

  describe('ReorderCommand', () => {
    it('should return Reorder', () => {
      const cmd = new ReorderCommand({
        nodeId: 1,
        oldTargetId: 2,
        oldPosition: 'before',
        newTargetId: 3,
        newPosition: 'after',
      })
      expect(cmd.getDescription()).toBe('Reorder')
    })
  })
})
