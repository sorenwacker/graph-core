/**
 * Composable for spreadsheet clipboard and cell operations
 * Handles copy, cut, paste, delete, and multi-cell fill operations
 */

import { handleError } from './useErrorHandler.js'

/**
 * Copy selected cells to clipboard as tab-separated values
 * @param {Object} options
 * @param {Object} options.selectionBounds - {minRow, maxRow, minCol, maxCol}
 * @param {Array} options.columns - Column definitions
 * @param {Array} options.rowData - Row data array
 * @returns {Promise<boolean>} Whether the text reached the clipboard
 */
export async function copySelection({ selectionBounds, columns, rowData }) {
  if (!selectionBounds) return false

  const lines = []

  for (let r = selectionBounds.minRow; r <= selectionBounds.maxRow; r++) {
    const row = rowData[r]
    const cells = []
    for (let c = selectionBounds.minCol; c <= selectionBounds.maxCol; c++) {
      const colName = columns[c]?.name
      cells.push(row?.[colName] ?? '')
    }
    lines.push(cells.join('\t'))
  }

  const text = lines.join('\n')

  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    handleError(err, { context: 'Copying to clipboard' })
    return false
  }
}

/**
 * Delete content from selected cells
 * @param {Object} options
 * @param {Object} options.selectionBounds - {minRow, maxRow, minCol, maxCol}
 * @param {Array} options.columns - Column definitions
 * @param {Object} options.gridApi - AG Grid API
 * @param {Function} options.emit - Vue emit function
 */
export function deleteSelectedCells({ selectionBounds, columns, gridApi, emit }) {
  if (!selectionBounds) return

  for (let r = selectionBounds.minRow; r <= selectionBounds.maxRow; r++) {
    for (let c = selectionBounds.minCol; c <= selectionBounds.maxCol; c++) {
      emit('cell-change', {
        row: r,
        col: c,
        value: '',
        isFormula: false,
      })

      // Update grid display
      if (gridApi) {
        const rowNode = gridApi.getRowNode(String(r))
        if (rowNode && columns[c]) {
          rowNode.setDataValue(columns[c].name, '')
        }
      }
    }
  }
}

/**
 * Cut selected cells: copy first, and delete only if the copy succeeded.
 * @param {Object} options - Same as copySelection + deleteSelectedCells
 * @returns {Promise<void>}
 */
export async function cutSelection(options) {
  // Only clear the cells once their contents are safely on the clipboard.
  // Deleting after a failed copy destroys the only copy that existed.
  const copied = await copySelection(options)
  if (!copied) return
  deleteSelectedCells(options)
}

/**
 * Fill all selected cells with a value
 * @param {Object} options
 * @param {string} options.value - Value to fill
 * @param {Object} options.selectionBounds - {minRow, maxRow, minCol, maxCol}
 * @param {Array} options.columns - Column definitions
 * @param {Object} options.gridApi - AG Grid API
 * @param {Function} options.emit - Vue emit function
 */
export function fillSelectionWithValue({ value, selectionBounds, columns, gridApi, emit }) {
  if (!selectionBounds) return

  const isFormula = value.startsWith('=')

  for (let r = selectionBounds.minRow; r <= selectionBounds.maxRow; r++) {
    for (let c = selectionBounds.minCol; c <= selectionBounds.maxCol; c++) {
      emit('cell-change', {
        row: r,
        col: c,
        value: value,
        isFormula: isFormula,
      })

      // Update grid display
      if (gridApi) {
        const rowNode = gridApi.getRowNode(String(r))
        if (rowNode && columns[c]) {
          rowNode.setDataValue(columns[c].name, value)
        }
      }
    }
  }
}

/**
 * Split clipboard text into rows of cell values.
 *
 * Normalizes CRLF/CR line endings (Excel/Windows) and strips the trailing
 * newline Excel appends, which would otherwise clear the row below the paste.
 *
 * @param {string} text - Tab- and newline-separated clipboard text
 * @returns {string[][]} Rows of cell values
 */
function parseClipboardText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map(line => line.split('\t'))
}

/**
 * Report whether clipboard text holds more than one cell.
 *
 * @param {string} text - Clipboard text
 * @returns {boolean} True when the text spans several rows or columns
 */
export function isMultiCellText(text) {
  if (!text) return false
  const rows = parseClipboardText(text)
  return rows.length > 1 || rows[0].length > 1
}

/**
 * Write a block of clipboard text into the grid.
 *
 * @param {Object} options
 * @param {string} options.text - Tab- and newline-separated text
 * @param {number} options.startRow - Row of the block's top-left cell
 * @param {number} options.startCol - Column of the block's top-left cell
 * @param {Array} options.columns - Column definitions
 * @param {Array} options.rowData - Row data array
 * @param {Object} options.gridApi - AG Grid API
 * @param {Function} options.emit - Vue emit function
 */
export function pasteText({ text, startRow, startCol, columns, rowData, gridApi, emit }) {
  if (!text) return

  const rows = parseClipboardText(text)

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const targetRow = startRow + r
      const targetCol = startCol + c

      if (targetRow < rowData.length && targetCol < columns.length) {
        const value = rows[r][c]

        emit('cell-change', {
          row: targetRow,
          col: targetCol,
          value: value,
          isFormula: value.startsWith('='),
        })

        if (gridApi) {
          const rowNode = gridApi.getRowNode(String(targetRow))
          if (rowNode) {
            rowNode.setDataValue(columns[targetCol].name, value)
          }
        }
      }
    }
  }
}

/**
 * Paste from the system clipboard into the grid, starting at the top-left cell
 * of the selection.
 *
 * @param {Object} options
 * @param {Object} options.selectionBounds - {minRow, maxRow, minCol, maxCol} (optional)
 * @param {Array} options.columns - Column definitions
 * @param {Array} options.rowData - Row data array
 * @param {Object} options.gridApi - AG Grid API
 * @param {Function} options.emit - Vue emit function
 */
export async function pasteSelection({ selectionBounds, columns, rowData, gridApi, emit }) {
  let text
  try {
    text = await navigator.clipboard.readText()
  } catch (err) {
    // Copy in this same file reports through the shared handler; a paste that
    // the browser refuses is just as visible to the user and must say so.
    handleError(err, { context: 'Pasting from clipboard' })
    return
  }

  pasteText({
    text,
    startRow: selectionBounds?.minRow ?? 0,
    startCol: selectionBounds?.minCol ?? 0,
    columns,
    rowData,
    gridApi,
    emit,
  })
}
