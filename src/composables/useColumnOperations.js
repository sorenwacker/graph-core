/**
 * Composable for spreadsheet column operations.
 * Handles column renaming, deletion, and context menu management.
 */

import { ref, watch, nextTick } from 'vue'

/**
 * Create column operations handler.
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.getTableData - Function returning table data
 * @param {Function} options.getColumns - Function returning column definitions array
 * @param {Function} options.emit - Vue emit function for structure-change and delete-column events
 * @returns {Object} Column operation state and handlers
 */
export function useColumnOperations(options = {}) {
  const { getTableData, getColumns, emit } = options

  // Column editing state
  const editingColumn = ref(null)
  const editingColumnName = ref('')
  const columnInputPos = ref({ x: 0, y: 0 })
  const columnInput = ref(null)

  // Column context menu state
  const showColumnMenu = ref(false)
  const columnMenuPos = ref({ x: 0, y: 0 })
  const columnMenuIndex = ref(null)

  // Auto-focus column input when editing starts
  watch(editingColumn, val => {
    if (val !== null) {
      nextTick(() => {
        columnInput.value?.focus()
        columnInput.value?.select()
      })
    }
  })

  /**
   * Start renaming a column from the context menu.
   */
  function renameColumnFromMenu() {
    if (columnMenuIndex.value === null) return

    const columns = getColumns ? getColumns() : []
    const headerCells = document.querySelectorAll('.ag-header-cell')
    const colName = columns[columnMenuIndex.value]?.name

    for (const cell of headerCells) {
      if (cell.getAttribute('col-id') === colName) {
        const rect = cell.getBoundingClientRect()
        editingColumn.value = columnMenuIndex.value
        editingColumnName.value = colName
        columnInputPos.value = { x: rect.left, y: rect.top, width: rect.width }
        break
      }
    }

    showColumnMenu.value = false
    columnMenuIndex.value = null
  }

  /**
   * Delete the currently selected column from context menu.
   */
  function deleteColumn() {
    if (columnMenuIndex.value === null) return

    const tableData = getTableData ? getTableData() : null
    const currentCols = tableData?.column_definitions || []

    if (currentCols.length <= 1) {
      // Don't delete the last column
      showColumnMenu.value = false
      columnMenuIndex.value = null
      return
    }

    // Deleting a column has to move the cells with it. Emitting replacement
    // column_definitions would leave every cell to the right showing its
    // neighbour's data, so this goes through a dedicated operation that
    // rewrites both together.
    emit('delete-column', { colIndex: columnMenuIndex.value })

    showColumnMenu.value = false
    columnMenuIndex.value = null
  }

  /**
   * Save the column rename.
   */
  function saveColumnRename() {
    if (editingColumn.value === null) return

    const newName = editingColumnName.value.trim()
    if (!newName) {
      cancelColumnRename()
      return
    }

    const tableData = getTableData ? getTableData() : null
    const currentCols = tableData?.column_definitions || []

    // Check for duplicate names (excluding current column)
    const isDuplicate = currentCols.some((col, idx) => idx !== editingColumn.value && col.name === newName)

    if (isDuplicate) {
      // Append number to make unique
      let uniqueName = newName
      let counter = 2
      while (currentCols.some((col, idx) => idx !== editingColumn.value && col.name === uniqueName)) {
        uniqueName = `${newName}${counter}`
        counter++
      }
      editingColumnName.value = uniqueName
    }

    const finalName = isDuplicate ? editingColumnName.value : newName

    // Create plain objects to avoid Vue Proxy issues
    const updatedCols = currentCols.map((col, idx) => ({
      id: col.id,
      name: idx === editingColumn.value ? finalName : col.name,
      type: col.type || 'text',
    }))

    emit('structure-change', { type: 'column_definitions', value: updatedCols })
    editingColumn.value = null
    editingColumnName.value = ''
  }

  /**
   * Cancel the column rename operation.
   */
  function cancelColumnRename() {
    editingColumn.value = null
    editingColumnName.value = ''
  }

  /**
   * Handle keydown in the column rename input.
   *
   * @param {KeyboardEvent} event - Keyboard event
   */
  function handleColumnInputKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveColumnRename()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelColumnRename()
    }
  }

  /**
   * Handle double-click on a column header to start renaming.
   *
   * @param {MouseEvent} event - Mouse event
   */
  function handleHeaderDoubleClick(event) {
    const headerCell = event.target.closest('.ag-header-cell')
    if (!headerCell) return

    const colId = headerCell.getAttribute('col-id')
    if (!colId || colId === '_rowIndex') return

    const columns = getColumns ? getColumns() : []
    const colIndex = columns.findIndex(c => c.name === colId)
    if (colIndex === -1) return

    event.preventDefault()
    event.stopPropagation()

    const rect = headerCell.getBoundingClientRect()
    editingColumn.value = colIndex
    editingColumnName.value = columns[colIndex].name
    columnInputPos.value = { x: rect.left, y: rect.top, width: rect.width }
  }

  /**
   * Close the column context menu.
   */
  function closeColumnMenu() {
    showColumnMenu.value = false
    columnMenuIndex.value = null
  }

  /**
   * Open the column context menu at a position.
   *
   * @param {number} colIndex - Column index
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  function openColumnMenu(colIndex, x, y) {
    columnMenuIndex.value = colIndex
    columnMenuPos.value = { x, y }
    showColumnMenu.value = true
  }

  return {
    // State
    editingColumn,
    editingColumnName,
    columnInputPos,
    columnInput,
    showColumnMenu,
    columnMenuPos,
    columnMenuIndex,

    // Methods
    renameColumnFromMenu,
    deleteColumn,
    saveColumnRename,
    cancelColumnRename,
    handleColumnInputKeydown,
    handleHeaderDoubleClick,
    closeColumnMenu,
    openColumnMenu,
  }
}
