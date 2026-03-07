import { ref, computed } from 'vue'
import { api } from '../services/api'

/**
 * Composable for managing node table (spreadsheet) data
 */
export function useNodeTable() {
  const table = ref(null)
  const cells = ref([])
  const loading = ref(false)
  const error = ref(null)

  const hasTable = computed(() => table.value !== null)

  /**
   * Convert cells array to a 2D matrix for jspreadsheet
   * @returns {Array<Array>} 2D array organized as [row][col]
   */
  const cellsAsMatrix = computed(() => {
    if (!table.value || cells.value.length === 0) return []

    const rowCount = table.value.row_count || 5
    const colCount = table.value.column_definitions?.length || 4

    // Initialize empty matrix
    const matrix = []
    for (let r = 0; r < rowCount; r++) {
      matrix[r] = new Array(colCount).fill('')
    }

    // Fill in cell values
    for (const cell of cells.value) {
      if (cell.row_index < rowCount && cell.col_index < colCount) {
        // Use formula display if present, otherwise value
        matrix[cell.row_index][cell.col_index] = cell.formula || cell.value || ''
      }
    }

    return matrix
  })

  /**
   * Load table and cells for a node
   * @param {number} nodeId - Node ID
   */
  async function loadTable(nodeId) {
    loading.value = true
    error.value = null

    try {
      const tableData = await api.getNodeTable(nodeId)
      table.value = tableData

      if (tableData) {
        const cellsData = await api.getTableCells(nodeId)
        cells.value = cellsData || []
      } else {
        cells.value = []
      }
    } catch (err) {
      error.value = err.message
      table.value = null
      cells.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Create a new table for a node
   * @param {number} nodeId - Node ID
   * @param {Object} options - Table options { name?, column_definitions?, row_count? }
   */
  async function createTable(nodeId, options = {}) {
    loading.value = true
    error.value = null

    try {
      await api.createNodeTable(nodeId, options)
      await loadTable(nodeId)
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  /**
   * Update table settings
   * @param {number} nodeId - Node ID
   * @param {Object} updates - Fields to update
   */
  async function updateTable(nodeId, updates) {
    try {
      const updatedTable = await api.updateNodeTable(nodeId, updates)
      table.value = updatedTable
    } catch (err) {
      error.value = err.message
    }
  }

  /**
   * Delete the table for a node
   * @param {number} nodeId - Node ID
   */
  async function deleteTable(nodeId) {
    try {
      await api.deleteNodeTable(nodeId)
      table.value = null
      cells.value = []
    } catch (err) {
      error.value = err.message
    }
  }

  /**
   * Save a single cell value
   * @param {number} nodeId - Node ID
   * @param {number} rowIndex - Row index
   * @param {number} colIndex - Column index
   * @param {string} value - Cell value or formula
   * @param {boolean} isFormula - Whether value is a formula
   */
  async function saveCell(nodeId, rowIndex, colIndex, value, isFormula = false) {
    const cellData = {
      row_index: rowIndex,
      col_index: colIndex
    }

    if (isFormula) {
      cellData.formula = value
    } else {
      cellData.value = value
    }

    try {
      await api.setCells(nodeId, [cellData])

      // Update local cells array to keep it in sync
      const existingCell = cells.value.find(
        c => c.row_index === rowIndex && c.col_index === colIndex
      )
      if (existingCell) {
        if (isFormula) {
          existingCell.formula = value
          existingCell.value = undefined
        } else {
          existingCell.value = value
          existingCell.formula = undefined
        }
      } else {
        cells.value.push({
          row_index: rowIndex,
          col_index: colIndex,
          value: isFormula ? undefined : value,
          formula: isFormula ? value : undefined
        })
      }
    } catch (err) {
      error.value = err.message
    }
  }

  /**
   * Save cell style
   * @param {number} nodeId - Node ID
   * @param {number} rowIndex - Row index
   * @param {number} colIndex - Column index
   * @param {Object} style - Style object { bold?, italic?, color? }
   */
  async function saveCellStyle(nodeId, rowIndex, colIndex, style) {
    // Find existing cell to preserve value/formula
    const existingCell = cells.value.find(
      c => c.row_index === rowIndex && c.col_index === colIndex
    )

    const cellData = {
      row_index: rowIndex,
      col_index: colIndex,
      style: JSON.stringify(style)
    }

    // Preserve existing value and formula
    if (existingCell?.value !== undefined) {
      cellData.value = existingCell.value
    }
    if (existingCell?.formula !== undefined) {
      cellData.formula = existingCell.formula
    }

    try {
      await api.setCells(nodeId, [cellData])
      // Update local cells array
      if (existingCell) {
        existingCell.style = JSON.stringify(style)
      } else {
        cells.value.push({ row_index: rowIndex, col_index: colIndex, style: JSON.stringify(style) })
      }
    } catch (err) {
      error.value = err.message
    }
  }

  /**
   * Save multiple cells at once
   * @param {number} nodeId - Node ID
   * @param {Array} cellsToSave - Array of { row_index, col_index, value?, formula? }
   */
  async function saveCells(nodeId, cellsToSave) {
    try {
      await api.setCells(nodeId, cellsToSave)
    } catch (err) {
      error.value = err.message
    }
  }

  /**
   * Clear all cells in the table
   * @param {number} nodeId - Node ID
   */
  async function clearAllCells(nodeId) {
    try {
      await api.clearCells(nodeId)
      cells.value = []
    } catch (err) {
      error.value = err.message
    }
  }

  /**
   * Add rows to the table
   * @param {number} nodeId - Node ID
   * @param {number} count - Number of rows to add
   */
  async function addRows(nodeId, count = 1) {
    if (!table.value) return

    const newRowCount = (table.value.row_count || 5) + count
    await updateTable(nodeId, { row_count: newRowCount })
  }

  /**
   * Add columns to the table
   * @param {number} nodeId - Node ID
   * @param {number} count - Number of columns to add
   */
  async function addColumns(nodeId, count = 1) {
    if (!table.value) return

    const currentCols = table.value.column_definitions || []
    const newCols = [...currentCols]

    for (let i = 0; i < count; i++) {
      const colIndex = newCols.length
      const colName = getColumnName(colIndex)
      newCols.push({
        id: `col${colIndex}`,
        name: colName,
        type: 'text',
        width: 100
      })
    }

    await updateTable(nodeId, { column_definitions: newCols })
  }

  /**
   * Get column letter name (A, B, ..., Z, AA, AB, ...)
   * @param {number} index - Column index
   * @returns {string} Column name
   */
  function getColumnName(index) {
    let name = ''
    let i = index
    while (i >= 0) {
      name = String.fromCharCode(65 + (i % 26)) + name
      i = Math.floor(i / 26) - 1
    }
    return name
  }

  return {
    // State
    table,
    cells,
    loading,
    error,
    hasTable,
    cellsAsMatrix,

    // Actions
    loadTable,
    createTable,
    updateTable,
    deleteTable,
    saveCell,
    saveCellStyle,
    saveCells,
    clearAllCells,
    addRows,
    addColumns,
    getColumnName
  }
}
