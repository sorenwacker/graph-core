/**
 * Composable for spreadsheet cell selection management.
 * Handles mouse-based selection, selection bounds computation, and column selection.
 */

import { ref, computed } from 'vue'

/**
 * Create spreadsheet selection state and handlers.
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.getColumns - Function returning column definitions array
 * @param {Function} options.getRowCount - Function returning row count
 * @param {Function} options.getGridWrapper - Function returning grid wrapper element ref
 * @param {Function} options.refreshCells - Function to refresh cell display
 * @param {Function} options.clearTypingBuffer - Function to clear typing buffer
 * @returns {Object} Selection state and handlers
 */
export function useSpreadsheetSelection(options = {}) {
  const { getColumns, getRowCount, getGridWrapper, refreshCells, clearTypingBuffer } = options

  // Selection state
  const isSelecting = ref(false)
  const selectionStart = ref(null)
  const selectionEnd = ref(null)
  const dragStartPos = ref(null)
  const isDragging = ref(false)
  const lastSelectedColumn = ref(null)

  // Computed selection bounds
  const selectionBounds = computed(() => {
    if (!selectionStart.value || !selectionEnd.value) return null
    return {
      minRow: Math.min(selectionStart.value.row, selectionEnd.value.row),
      maxRow: Math.max(selectionStart.value.row, selectionEnd.value.row),
      minCol: Math.min(selectionStart.value.col, selectionEnd.value.col),
      maxCol: Math.max(selectionStart.value.col, selectionEnd.value.col),
    }
  })

  /**
   * Check if a cell is within the current selection.
   *
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @returns {boolean}
   */
  function isCellSelected(row, col) {
    const bounds = selectionBounds.value
    if (!bounds) return false
    return row >= bounds.minRow && row <= bounds.maxRow && col >= bounds.minCol && col <= bounds.maxCol
  }

  /**
   * Check whether a cell lies on a given outer edge of the current selection.
   *
   * Lets the border be drawn around the perimeter of the selected range rather
   * than around every cell inside it.
   *
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @param {string} edge - One of 'top', 'right', 'bottom', 'left'
   * @returns {boolean}
   */
  function isSelectionEdge(row, col, edge) {
    const bounds = selectionBounds.value
    if (!bounds || !isCellSelected(row, col)) return false

    switch (edge) {
      case 'top':
        return row === bounds.minRow
      case 'bottom':
        return row === bounds.maxRow
      case 'left':
        return col === bounds.minCol
      case 'right':
        return col === bounds.maxCol
      default:
        return false
    }
  }

  /**
   * Clear the current selection.
   */
  function clearSelection() {
    selectionStart.value = null
    selectionEnd.value = null
    if (clearTypingBuffer) clearTypingBuffer()
    if (refreshCells) refreshCells()
  }

  /**
   * Get cell coordinates from a point on the screen.
   *
   * @param {number} x - Client X coordinate
   * @param {number} y - Client Y coordinate
   * @returns {Object|null} {row, col} or null if not a valid cell
   */
  function getCellFromPoint(x, y) {
    const element = document.elementFromPoint(x, y)
    if (!element) return null

    const cellEl = element.closest('.ag-cell')
    if (!cellEl) return null

    const colId = cellEl.getAttribute('col-id')
    if (!colId || colId === '_rowIndex') return null

    const rowEl = cellEl.closest('.ag-row')
    if (!rowEl) return null

    const rowIndex = parseInt(rowEl.getAttribute('row-index'), 10)
    if (isNaN(rowIndex)) return null

    const columns = getColumns ? getColumns() : []
    const colIndex = columns.findIndex(c => c.name === colId)
    if (colIndex === -1) return null

    return { row: rowIndex, col: colIndex }
  }

  /**
   * Get column index from a header click event.
   *
   * @param {MouseEvent} event - Mouse event
   * @returns {number} Column index or -1 if not a column header
   */
  function getColumnIndexFromHeader(event) {
    const columns = getColumns ? getColumns() : []
    const gridWrapper = getGridWrapper ? getGridWrapper() : null

    // Direct header cell click
    const headerCell = event.target.closest('.ag-header-cell')
    if (headerCell) {
      const colId = headerCell.getAttribute('col-id')
      if (colId && colId !== '_rowIndex') {
        return columns.findIndex(c => c.name === colId)
      }
    }

    // Fallback: find column from x position in header row
    if (event.target.closest('.ag-header-row')) {
      const headerCells = gridWrapper?.querySelectorAll('.ag-header-cell')
      for (const cell of headerCells || []) {
        const rect = cell.getBoundingClientRect()
        const colId = cell.getAttribute('col-id')
        if (colId && colId !== '_rowIndex' && event.clientX >= rect.left && event.clientX <= rect.right) {
          return columns.findIndex(c => c.name === colId)
        }
      }
    }
    return -1
  }

  /**
   * Handle mouse down on the grid for selection.
   *
   * @param {MouseEvent} event - Mouse event
   * @param {Object} callbacks - Callback functions
   * @param {Function} callbacks.onContextMenuClose - Called to close context menu
   */
  function handleMouseDown(event, callbacks = {}) {
    if (event.button !== 0) return
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return

    const { onContextMenuClose } = callbacks
    const gridWrapper = getGridWrapper ? getGridWrapper() : null
    const rowCount = getRowCount ? getRowCount() : 0

    // Close context menu on left click
    if (onContextMenuClose) onContextMenuClose()

    // Check if clicking on column header
    const colIndex = getColumnIndexFromHeader(event)
    if (colIndex !== -1) {
      if (rowCount === 0) return

      if (event.shiftKey && lastSelectedColumn.value !== null) {
        // Shift-click: extend selection to column range
        const minCol = Math.min(lastSelectedColumn.value, colIndex)
        const maxCol = Math.max(lastSelectedColumn.value, colIndex)
        selectionStart.value = { row: 0, col: minCol }
        selectionEnd.value = { row: rowCount - 1, col: maxCol }
      } else {
        // Regular click: select entire column
        selectionStart.value = { row: 0, col: colIndex }
        selectionEnd.value = { row: rowCount - 1, col: colIndex }
        lastSelectedColumn.value = colIndex
      }
      if (clearTypingBuffer) clearTypingBuffer()
      if (refreshCells) refreshCells()
      // Focus grid for keyboard shortcuts
      gridWrapper?.focus()
      return
    }

    const cell = getCellFromPoint(event.clientX, event.clientY)
    if (!cell) {
      // Clicked outside data cells, clear selection
      clearSelection()
      return
    }

    // Shift-click to extend selection
    if (event.shiftKey && selectionStart.value) {
      selectionEnd.value = { ...cell }
      if (refreshCells) refreshCells()
      gridWrapper?.focus()
      return
    }

    // Record start position for potential drag detection
    dragStartPos.value = { x: event.clientX, y: event.clientY }
    isDragging.value = false
    isSelecting.value = true
    selectionStart.value = { ...cell }
    selectionEnd.value = { ...cell }
    lastSelectedColumn.value = null // Reset column tracking when selecting cells
    if (clearTypingBuffer) clearTypingBuffer()
    // Focus grid for keyboard shortcuts after selection
    gridWrapper?.focus()
  }

  /**
   * Handle mouse move for drag selection.
   *
   * @param {MouseEvent} event - Mouse event
   */
  function handleMouseMove(event) {
    if (!isSelecting.value) return

    // Check if we've moved enough to consider it a drag (5px threshold)
    if (!isDragging.value && dragStartPos.value) {
      const dx = Math.abs(event.clientX - dragStartPos.value.x)
      const dy = Math.abs(event.clientY - dragStartPos.value.y)
      if (dx > 5 || dy > 5) {
        isDragging.value = true
        if (refreshCells) refreshCells() // Show initial selection now that we're dragging
      }
    }

    if (!isDragging.value) return

    const cell = getCellFromPoint(event.clientX, event.clientY)
    if (!cell) return

    if (!selectionEnd.value || selectionEnd.value.row !== cell.row || selectionEnd.value.col !== cell.col) {
      selectionEnd.value = { ...cell }
      if (refreshCells) refreshCells()
    }
  }

  /**
   * Handle mouse up to finish selection.
   *
   * @param {boolean} contextMenuOpen - Whether context menu is open
   */
  function handleMouseUp(contextMenuOpen = false) {
    // Don't clear selection if context menu is open
    if (contextMenuOpen) {
      isSelecting.value = false
      isDragging.value = false
      dragStartPos.value = null
      return
    }

    // Keep single-cell selection for copy/paste even without drag
    // Only refresh cells (show highlight) if we dragged
    if (isDragging.value) {
      if (refreshCells) refreshCells()
    }

    isSelecting.value = false
    isDragging.value = false
    dragStartPos.value = null
  }

  return {
    // State
    isSelecting,
    selectionStart,
    selectionEnd,
    selectionBounds,
    lastSelectedColumn,

    // Methods
    isCellSelected,
    isSelectionEdge,
    clearSelection,
    getCellFromPoint,
    getColumnIndexFromHeader,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  }
}
