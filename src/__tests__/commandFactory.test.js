import { describe, it, expect } from 'vitest'
import {
  fromJSON,
  serializeStack,
  deserializeStack,
  CreateCommand,
  DeleteCommand,
  DeleteMultipleCommand,
  EditCommand,
  MoveCommand,
  CompleteCommand,
  LinkCommand,
  UnlinkCommand,
  ReorderCommand
} from '../commands/index.js'

describe('commandFactory', () => {
  describe('fromJSON', () => {
    it('should return null for null input', () => {
      expect(fromJSON(null)).toBe(null)
    })

    it('should return null for missing type', () => {
      expect(fromJSON({})).toBe(null)
    })

    it('should return null for unknown type', () => {
      expect(fromJSON({ type: 'unknown' })).toBe(null)
    })

    it('should deserialize CreateCommand', () => {
      const json = {
        type: 'create',
        nodeId: 1,
        nodeData: { title: 'Test' },
        parentId: 5,
        linkedToId: null
      }
      const cmd = fromJSON(json)
      expect(cmd).toBeInstanceOf(CreateCommand)
      expect(cmd.nodeId).toBe(1)
      expect(cmd.nodeData).toEqual({ title: 'Test' })
      expect(cmd.parentId).toBe(5)
    })

    it('should deserialize DeleteCommand', () => {
      const json = {
        type: 'delete',
        nodeData: { id: 1, title: 'Test', parent_id: 5 }
      }
      const cmd = fromJSON(json)
      expect(cmd).toBeInstanceOf(DeleteCommand)
      expect(cmd.nodeData.id).toBe(1)
    })

    it('should deserialize DeleteMultipleCommand', () => {
      const json = {
        type: 'delete-multiple',
        nodes: [
          { id: 1, parent_id: 5 },
          { id: 2, parent_id: 5 }
        ]
      }
      const cmd = fromJSON(json)
      expect(cmd).toBeInstanceOf(DeleteMultipleCommand)
      expect(cmd.nodes).toHaveLength(2)
    })

    it('should deserialize EditCommand', () => {
      const json = {
        type: 'edit',
        nodeId: 1,
        oldValues: { title: 'Old' },
        newValues: { title: 'New' }
      }
      const cmd = fromJSON(json)
      expect(cmd).toBeInstanceOf(EditCommand)
      expect(cmd.oldValues.title).toBe('Old')
      expect(cmd.newValues.title).toBe('New')
    })

    it('should deserialize MoveCommand', () => {
      const json = {
        type: 'move',
        nodeId: 1,
        oldParentId: 5,
        newParentId: 10
      }
      const cmd = fromJSON(json)
      expect(cmd).toBeInstanceOf(MoveCommand)
      expect(cmd.oldParentId).toBe(5)
      expect(cmd.newParentId).toBe(10)
    })

    it('should deserialize CompleteCommand', () => {
      const json = {
        type: 'complete',
        nodeId: 1,
        oldCompleted: false,
        newCompleted: true
      }
      const cmd = fromJSON(json)
      expect(cmd).toBeInstanceOf(CompleteCommand)
      expect(cmd.oldCompleted).toBe(false)
      expect(cmd.newCompleted).toBe(true)
    })

    it('should deserialize LinkCommand', () => {
      const json = {
        type: 'link',
        sourceId: 1,
        targetId: 2
      }
      const cmd = fromJSON(json)
      expect(cmd).toBeInstanceOf(LinkCommand)
      expect(cmd.sourceId).toBe(1)
      expect(cmd.targetId).toBe(2)
    })

    it('should deserialize UnlinkCommand', () => {
      const json = {
        type: 'unlink',
        sourceId: 1,
        targetId: 2
      }
      const cmd = fromJSON(json)
      expect(cmd).toBeInstanceOf(UnlinkCommand)
    })

    it('should deserialize ReorderCommand', () => {
      const json = {
        type: 'reorder',
        nodeId: 1,
        oldTargetId: 2,
        oldPosition: 'before',
        newTargetId: 3,
        newPosition: 'after'
      }
      const cmd = fromJSON(json)
      expect(cmd).toBeInstanceOf(ReorderCommand)
      expect(cmd.oldTargetId).toBe(2)
      expect(cmd.newPosition).toBe('after')
    })
  })

  describe('serializeStack', () => {
    it('should serialize empty array', () => {
      expect(serializeStack([])).toEqual([])
    })

    it('should serialize array of commands', () => {
      const commands = [
        new EditCommand({
          nodeId: 1,
          oldValues: { title: 'A' },
          newValues: { title: 'B' }
        }),
        new MoveCommand({
          nodeId: 2,
          oldParentId: 5,
          newParentId: 10
        })
      ]

      const serialized = serializeStack(commands)

      expect(serialized).toHaveLength(2)
      expect(serialized[0].type).toBe('edit')
      expect(serialized[1].type).toBe('move')
    })
  })

  describe('deserializeStack', () => {
    it('should return empty array for non-array input', () => {
      expect(deserializeStack(null)).toEqual([])
      expect(deserializeStack(undefined)).toEqual([])
      expect(deserializeStack('string')).toEqual([])
    })

    it('should filter out invalid commands', () => {
      const jsonArray = [
        { type: 'edit', nodeId: 1, oldValues: {}, newValues: {} },
        { type: 'invalid' },
        null,
        { type: 'move', nodeId: 2, oldParentId: 5, newParentId: 10 }
      ]

      const commands = deserializeStack(jsonArray)

      expect(commands).toHaveLength(2)
      expect(commands[0]).toBeInstanceOf(EditCommand)
      expect(commands[1]).toBeInstanceOf(MoveCommand)
    })
  })

  describe('round-trip serialization', () => {
    it('should preserve command data through serialize/deserialize', () => {
      const original = [
        new CreateCommand({
          nodeId: 1,
          nodeData: { title: 'Task', type: 'task', notes: 'Details' },
          parentId: 5,
          linkedToId: 10
        }),
        new EditCommand({
          nodeId: 1,
          oldValues: { title: 'Task' },
          newValues: { title: 'Updated Task' }
        }),
        new CompleteCommand({
          nodeId: 1,
          oldCompleted: false,
          newCompleted: true
        })
      ]

      const serialized = serializeStack(original)
      const deserialized = deserializeStack(serialized)

      expect(deserialized).toHaveLength(3)

      // CreateCommand
      expect(deserialized[0]).toBeInstanceOf(CreateCommand)
      expect(deserialized[0].nodeData.title).toBe('Task')
      expect(deserialized[0].linkedToId).toBe(10)

      // EditCommand
      expect(deserialized[1]).toBeInstanceOf(EditCommand)
      expect(deserialized[1].oldValues.title).toBe('Task')
      expect(deserialized[1].newValues.title).toBe('Updated Task')

      // CompleteCommand
      expect(deserialized[2]).toBeInstanceOf(CompleteCommand)
      expect(deserialized[2].oldCompleted).toBe(false)
      expect(deserialized[2].newCompleted).toBe(true)
    })
  })
})
