import { ref, computed } from 'vue'
import { api } from '../services/api'
import { handleError } from './useErrorHandler.js'

/**
 * Composable for managing node table (spreadsheet) data
 */
export function useNodeTable() {
  const table = ref(null)
  const cells = ref([])
  const loading = ref(false)

  const hasTable = computed(() => table.value !== null)

  /**
   * Load table and cells for a node
   * @param {number} nodeId - Node ID
   */
  async function loadTable(nodeId) {
    loading.value = true

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
      handleError(err, { context: 'Loading table', silent: true })
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

    try {
      await api.createNodeTable(nodeId, options)
      await loadTable(nodeId)
    } catch (err) {
      handleError(err, { context: 'Creating table' })
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
      handleError(err, { context: 'Updating table' })
    }
  }

  /**
   * Delete one column and the cells belonging to it.
   *
   * Goes through a dedicated operation rather than writing replacement
   * column_definitions, because cells are addressed by position: removing a
   * definition on its own shifts every column's data left.
   *
   * @param {number} nodeId - Node ID
   * @param {number} colIndex - Zero-based index of the column to delete
   */
  async function deleteTableColumn(nodeId, colIndex) {
    try {
      await api.deleteTableColumn(nodeId, colIndex)
      await loadTable(nodeId)
    } catch (err) {
      handleError(err, { context: 'Deleting column' })
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
      handleError(err, { context: 'Deleting table' })
    }
  }

  /**
   * Find or create a cell in the local cache
   * @param {number} rowIndex - Row index
   * @param {number} colIndex - Column index
   * @returns {Object} The cell object
   */
  function findOrCreateCell(rowIndex, colIndex) {
    let cell = cells.value.find(c => c.row_index === rowIndex && c.col_index === colIndex)
    if (!cell) {
      cell = { row_index: rowIndex, col_index: colIndex }
      cells.value.push(cell)
    }
    return cell
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
      col_index: colIndex,
    }

    if (isFormula) {
      cellData.formula = value
    } else {
      cellData.value = value
    }

    try {
      await api.setCells(nodeId, [cellData])

      // Update local cells array to keep it in sync
      const cell = findOrCreateCell(rowIndex, colIndex)
      if (isFormula) {
        cell.formula = value
        cell.value = undefined
      } else {
        cell.value = value
        cell.formula = undefined
      }
    } catch (err) {
      handleError(err, { context: 'Saving cell' })
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
    const cell = findOrCreateCell(rowIndex, colIndex)

    const cellData = {
      row_index: rowIndex,
      col_index: colIndex,
      style: JSON.stringify(style),
    }

    // Preserve existing value and formula
    if (cell.value !== undefined) {
      cellData.value = cell.value
    }
    if (cell.formula !== undefined) {
      cellData.formula = cell.formula
    }

    try {
      await api.setCells(nodeId, [cellData])
      cell.style = JSON.stringify(style)
    } catch (err) {
      handleError(err, { context: 'Saving cell style' })
    }
  }

  return {
    // State
    table,
    cells,
    loading,
    hasTable,

    // Actions
    loadTable,
    createTable,
    updateTable,
    deleteTable,
    saveCell,
    saveCellStyle,
    deleteTableColumn,
  }
}
