import { describe, it, expect } from 'vitest'

/**
 * Keyboard Shortcuts Tests
 *
 * Documented shortcuts:
 * - Cmd/Ctrl + Delete: Delete selected items
 * - Cmd/Ctrl + Backspace: Delete selected items
 * - Cmd/Ctrl + A: Select all visible items
 * - Escape: Exit fullscreen or clear selection
 */

// Helper to check if a key event should trigger delete
function shouldTriggerDelete(event) {
  const isDeleteKey = event.key === 'Delete' || event.key === 'Backspace'
  return (event.metaKey || event.ctrlKey) && isDeleteKey
}

describe('Keyboard Shortcuts', () => {
  describe('Delete shortcut', () => {
    it('should trigger delete with Cmd+Delete', () => {
      const event = { key: 'Delete', metaKey: true, ctrlKey: false }
      expect(shouldTriggerDelete(event)).toBe(true)
    })

    it('should trigger delete with Cmd+Backspace', () => {
      const event = { key: 'Backspace', metaKey: true, ctrlKey: false }
      expect(shouldTriggerDelete(event)).toBe(true)
    })

    it('should trigger delete with Ctrl+Delete', () => {
      const event = { key: 'Delete', metaKey: false, ctrlKey: true }
      expect(shouldTriggerDelete(event)).toBe(true)
    })

    it('should trigger delete with Ctrl+Backspace', () => {
      const event = { key: 'Backspace', metaKey: false, ctrlKey: true }
      expect(shouldTriggerDelete(event)).toBe(true)
    })

    it('should NOT trigger delete with plain Delete key', () => {
      const event = { key: 'Delete', metaKey: false, ctrlKey: false }
      expect(shouldTriggerDelete(event)).toBe(false)
    })

    it('should NOT trigger delete with plain Backspace key', () => {
      const event = { key: 'Backspace', metaKey: false, ctrlKey: false }
      expect(shouldTriggerDelete(event)).toBe(false)
    })

    it('should NOT trigger delete with other keys', () => {
      const event = { key: 'a', metaKey: true, ctrlKey: false }
      expect(shouldTriggerDelete(event)).toBe(false)
    })
  })
})
