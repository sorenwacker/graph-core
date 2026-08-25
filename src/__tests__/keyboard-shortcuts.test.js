import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import {
  resolveNotesPreview,
  activeNotesPreview,
  selectElementText,
  useKeyboardShortcuts,
} from '../composables/useKeyboardShortcuts.js'

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

  /**
   * The node spreadsheet handles its own keys. AG Grid leaves focus on a cell
   * div (not an input) after an edit is committed, so without an explicit
   * opt-out the global Enter handler navigated the app into another node and
   * the detail panel reloaded a different node's table - the table appeared to
   * have lost every cell.
   */
  describe('shortcuts inside the node spreadsheet', () => {
    let actions
    let handleKeydown

    beforeEach(() => {
      document.body.innerHTML = `
        <div class="node-spreadsheet" data-owns-keys>
          <div class="grid-wrapper" tabindex="0">
            <div id="cell" class="ag-cell" tabindex="-1"></div>
          </div>
        </div>
        <div id="outside" tabindex="0"></div>
      `
      actions = {
        openSearch: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        showAddNodeModal: vi.fn(),
        deleteSelectedNodes: vi.fn(),
        deleteNode: vi.fn(),
        goToParent: vi.fn(),
        goToFirstChild: vi.fn(),
        goToPrevSibling: vi.fn(),
        goToNextSibling: vi.fn(),
        toggleDetailPanel: vi.fn(),
        clearSelection: vi.fn(),
        selectAll: vi.fn(),
        enterContainer: vi.fn(),
        openDetachedWindow: vi.fn(),
        showShortcuts: vi.fn(),
        selectNode: vi.fn(),
      }
      const state = {
        viewMode: ref('cards'),
        selectedNode: ref({ id: 7 }),
        selectedIds: ref(new Set()),
        currentContainerId: ref(1),
        fullscreenDetail: ref(false),
        detailPinned: ref(false),
        showDetail: ref(true),
        flatChildren: ref([]),
        filteredChildren: ref([]),
        gridColumns: ref(1),
      }
      handleKeydown = useKeyboardShortcuts({ actions, state }).handleKeydown
    })

    afterEach(() => {
      document.body.innerHTML = ''
    })

    function press(key, target) {
      const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true })
      Object.defineProperty(event, 'target', { value: target })
      handleKeydown(event)
      return event
    }

    it('does not navigate into the selected node when Enter is pressed on a grid cell', () => {
      press('Enter', document.getElementById('cell'))
      expect(actions.enterContainer).not.toHaveBeenCalled()
      expect(actions.goToParent).not.toHaveBeenCalled()
    })

    it('does not toggle the detail panel when Space is pressed on a grid cell', () => {
      press(' ', document.getElementById('cell'))
      expect(actions.toggleDetailPanel).not.toHaveBeenCalled()
    })

    it('does not open the new node dialog when n is typed on a grid cell', () => {
      press('n', document.getElementById('cell'))
      expect(actions.showAddNodeModal).not.toHaveBeenCalled()
    })

    it('still navigates into the selected node when Enter is pressed outside the spreadsheet', () => {
      press('Enter', document.getElementById('outside'))
      expect(actions.enterContainer).toHaveBeenCalledWith({ id: 7 })
    })

    it('still opens spotlight search from inside the spreadsheet', () => {
      const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true })
      Object.defineProperty(event, 'target', { value: document.getElementById('cell') })
      handleKeydown(event)
      expect(actions.openSearch).toHaveBeenCalledTimes(1)
    })
  })
})
