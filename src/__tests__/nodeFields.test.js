import { describe, it, expect } from 'vitest'
import { ref, reactive } from 'vue'
import { NODE_UPDATE_FIELDS, pickNodeFields } from '../utils/nodeFields.js'

describe('nodeFields', () => {
  describe('NODE_UPDATE_FIELDS', () => {
    it('should include per-node display settings for database persistence', () => {
      // These fields must be in the list for per-node settings to work
      // If any are missing, the setting won't be tracked for undo/redo
      const requiredDisplaySettings = ['show_links', 'show_root_node', 'show_external_links', 'graph_layout']
      for (const field of requiredDisplaySettings) {
        expect(NODE_UPDATE_FIELDS, `Missing required field: ${field}`).toContain(field)
      }
    })
  })

  describe('pickNodeFields', () => {
    it('should only extract fields in the provided list', () => {
      const node = {
        id: 1,
        title: 'Test',
        type: 'task',
        parent_id: 5,
        secret: 'should not appear',
      }

      const result = pickNodeFields(node, ['title', 'type'])

      expect(Object.keys(result)).toEqual(['title', 'type'])
      expect(result.id).toBeUndefined()
      expect(result.parent_id).toBeUndefined()
      expect(result.secret).toBeUndefined()
    })

    it('should unwrap Vue reactive objects', () => {
      const node = reactive({
        title: 'Reactive Node',
        type: 'note',
        completed: false,
      })

      const result = pickNodeFields(node, ['title', 'type', 'completed'])

      // Result should be plain object, not reactive
      expect(result.title).toBe('Reactive Node')
      expect(result.type).toBe('note')
      expect(result.completed).toBe(false)
    })

    it('should create a copy of array fields to avoid mutation', () => {
      const originalTags = ['work', 'urgent']
      const node = { tags: originalTags }

      const result = pickNodeFields(node, ['tags'])

      // Should be equal but not same reference
      expect(result.tags).toEqual(['work', 'urgent'])
      expect(result.tags).not.toBe(originalTags)

      // Mutating result should not affect original
      result.tags.push('modified')
      expect(originalTags).toEqual(['work', 'urgent'])
    })

    it('should handle reactive arrays from Vue refs', () => {
      const tagsRef = ref(['reactive', 'tags'])
      const node = reactive({ tags: tagsRef.value })

      const result = pickNodeFields(node, ['tags'])

      expect(result.tags).toEqual(['reactive', 'tags'])
      // Should be a plain array copy
      expect(Array.isArray(result.tags)).toBe(true)
    })

    it('should preserve undefined and null values', () => {
      const node = {
        title: 'Test',
        notes: null,
        due_date: undefined,
      }

      const result = pickNodeFields(node, ['title', 'notes', 'due_date'])

      expect(result.title).toBe('Test')
      expect(result.notes).toBe(null)
      expect(result.due_date).toBeUndefined()
    })
  })
})
