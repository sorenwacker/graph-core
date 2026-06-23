import { describe, it, expect, afterEach } from 'vitest'
import { resolveNotesPreview, activeNotesPreview, selectElementText } from '../composables/useKeyboardShortcuts.js'

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

  describe('Cmd/Ctrl+A in notes preview', () => {
    afterEach(() => {
      document.body.innerHTML = ''
      window.getSelection()?.removeAllRanges()
    })

    it('resolves the enclosing preview element for an element node', () => {
      document.body.innerHTML = '<div class="notes-preview markdown-body"><p id="t">hello</p></div>'
      const p = document.getElementById('t')
      expect(resolveNotesPreview(p)).toBe(document.querySelector('.notes-preview'))
    })

    it('resolves the enclosing preview element for a text node', () => {
      document.body.innerHTML = '<div class="notes-preview"><p id="t">hello</p></div>'
      const textNode = document.getElementById('t').firstChild
      expect(resolveNotesPreview(textNode)).toBe(document.querySelector('.notes-preview'))
    })

    it('returns null when the node is not inside a preview', () => {
      document.body.innerHTML = '<div class="cards"><p id="t">hello</p></div>'
      expect(resolveNotesPreview(document.getElementById('t'))).toBe(null)
      expect(resolveNotesPreview(null)).toBe(null)
    })

    it('detects an active preview from the event target', () => {
      document.body.innerHTML = '<div class="notes-preview"><p id="t">hi</p></div>'
      const e = { target: document.getElementById('t') }
      expect(activeNotesPreview(e)).toBe(document.querySelector('.notes-preview'))
    })

    it('detects an active preview from the focused element', () => {
      document.body.innerHTML = '<div class="notes-preview" tabindex="0" id="pv">hi</div>'
      const pv = document.getElementById('pv')
      pv.focus()
      const e = { target: document.body }
      expect(activeNotesPreview(e)).toBe(pv)
    })

    it('returns null when nothing points at a preview', () => {
      document.body.innerHTML = '<div class="cards"><p id="t">hi</p></div>'
      const e = { target: document.getElementById('t') }
      expect(activeNotesPreview(e)).toBe(null)
    })

    it('selectElementText selects the full text of an element', () => {
      document.body.innerHTML = '<div class="notes-preview" id="pv"><p>alpha beta</p></div>'
      const pv = document.getElementById('pv')
      selectElementText(pv)
      const sel = window.getSelection()
      expect(sel.toString()).toContain('alpha beta')
    })
  })
})
