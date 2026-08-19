/**
 * Composable for spreadsheet keyboard handling.
 * Manages keyboard shortcuts, typing buffer for multi-cell input, and event handling.
 */

import { ref } from 'vue'

/**
 * Create spreadsheet keyboard handler.
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.getGridWrapper - Function returning grid wrapper element ref
 * @param {Function} options.getSelectionBounds - Function returning current selection bounds
 * @param {Object} options.actions - Object containing action handlers
 * @param {Function} options.actions.copySelection - Copy handler
 * @param {Function} options.actions.pasteSelection - Paste handler
 * @param {Function} options.actions.cutSelection - Cut handler
 * @param {Function} options.actions.toggleBold - Bold toggle handler
 * @param {Function} options.actions.toggleItalic - Italic toggle handler
 * @param {Function} options.actions.deleteSelectedCells - Delete handler
 * @param {Function} options.actions.fillSelectionWithValue - Fill handler
 * @param {Function} options.actions.clearSelection - Clear selection handler
 * @param {Function} options.actions.closeColumnMenu - Close column menu handler
 * @param {Function} options.actions.closeContextMenu - Close context menu handler
 * @param {Function} options.isColumnMenuOpen - Function returning column menu state
 * @param {Function} options.isContextMenuOpen - Function returning context menu state
 * @returns {Object} Keyboard handler state and methods
 */
export function useSpreadsheetKeyboard(options = {}) {
  const { getGridWrapper, getSelectionBounds, actions = {}, isColumnMenuOpen, isContextMenuOpen } = options

  /**
   * Report whether a cell editor currently owns keyboard input.
   *
   * AG Grid focuses the editor's input element while a cell is being edited,
   * so a focused text-entry element is the authoritative signal. This is read
   * from the DOM on every key rather than tracked from AG Grid's editing
   * events because the grid is remounted whenever the table's shape changes:
   * a missed `cellEditingStopped` would leave a cached flag stuck on and
   * disable the table shortcuts for the rest of the session.
   *
   * @returns {boolean} True when a text-entry element has focus.
   */
  function isCellEditorFocused() {
    const el = typeof document === 'undefined' ? null : document.activeElement
    if (!el) return false
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true
  }

  // Typing buffer for multi-cell input
  const typingBuffer = ref('')
  let typingTimeout = null

  /**
   * Clear the typing buffer and timeout.
   */
  function clearTypingBuffer() {
    typingBuffer.value = ''
    if (typingTimeout) {
      clearTimeout(typingTimeout)
      typingTimeout = null
    }
  }

  /**
   * Cleanup timeouts on unmount.
   */
  function cleanup() {
    if (typingTimeout) {
      clearTimeout(typingTimeout)
      typingTimeout = null
    }
  }

  // Keyboard shortcut definitions
  const shortcuts = {
    c: { handler: () => actions.copySelection?.(), needsSelection: true },
    v: { handler: () => actions.pasteSelection?.(), needsSelection: false },
    x: { handler: () => actions.cutSelection?.(), needsSelection: true },
    b: { handler: () => actions.toggleBold?.(), needsSelection: true },
    i: { handler: () => actions.toggleItalic?.(), needsSelection: true },
  }

  /**
   * Handle keydown events for the spreadsheet.
   *
   * @param {KeyboardEvent} event - Keyboard event
   */
  function handleKeyDown(event) {
    const gridWrapper = getGridWrapper ? getGridWrapper() : null

    if (!gridWrapper?.contains(document.activeElement) && document.activeElement !== document.body) {
      return
    }

    // This handler runs on document in the capture phase, so it sees every key
    // before the cell editor does. While an editor is open every key belongs to
    // it: without this guard Backspace and Delete were swallowed here (so
    // characters could not be deleted) and blanked the whole selected range
    // instead, discarding the text still open in the editor.
    if (isCellEditorFocused()) {
      return
    }

    const selectionBounds = getSelectionBounds ? getSelectionBounds() : null

    // Handle Cmd/Ctrl shortcuts
    if (event.metaKey || event.ctrlKey) {
      const shortcut = shortcuts[event.key]
      if (shortcut && (!shortcut.needsSelection || selectionBounds)) {
        event.preventDefault()
        event.stopPropagation()
        shortcut.handler()
        return
      }
    }

    // Escape - Close menus and clear selection
    if (event.key === 'Escape') {
      const columnMenuOpen = isColumnMenuOpen ? isColumnMenuOpen() : false
      const contextMenuOpen = isContextMenuOpen ? isContextMenuOpen() : false

      if (columnMenuOpen) {
        actions.closeColumnMenu?.()
      } else if (contextMenuOpen) {
        actions.closeContextMenu?.()
      } else {
        actions.clearSelection?.()
      }
      return
    }

    // Delete/Backspace - Clear selected cells
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectionBounds) {
      event.preventDefault()
      event.stopPropagation()
      actions.deleteSelectedCells?.()
      return
    }

    // Type into multiple selected cells
    // Only handle if we have a multi-cell selection (more than 1 cell)
    if (selectionBounds) {
      const cellCount =
        (selectionBounds.maxRow - selectionBounds.minRow + 1) * (selectionBounds.maxCol - selectionBounds.minCol + 1)

      // Check if it's a printable character (single char, not special key)
      if (cellCount > 1 && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        event.stopPropagation()

        // Accumulate characters in typing buffer
        typingBuffer.value += event.key

        // Clear existing timeout
        if (typingTimeout) clearTimeout(typingTimeout)

        // Fill all selected cells with accumulated buffer
        actions.fillSelectionWithValue?.(typingBuffer.value)

        // Clear buffer after 1.5 seconds of no typing
        typingTimeout = setTimeout(() => {
          typingBuffer.value = ''
        }, 1500)

        return
      }
    }
  }

  return {
    // State
    typingBuffer,
    shortcuts,

    // Methods
    handleKeyDown,
    clearTypingBuffer,
    cleanup,
  }
}
