/**
 * Composable for spreadsheet clipboard and cell operations
 * Handles copy, cut, paste, delete, and multi-cell fill operations
 */

/**
 * Copy selected cells to clipboard as tab-separated values
 * @param {Object} options
 * @param {Object} options.selectionBounds - {minRow, maxRow, minCol, maxCol}
 * @param {Array} options.columns - Column definitions
 * @param {Array} options.rowData - Row data array
 * @returns {Promise<void>}
 */
export async function copySelection({ selectionBounds, columns, rowData }) {
  if (!selectionBounds) return

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
  } catch (err) {
    console.warn('Failed to copy to clipboard:', err.message)
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
        isFormula: false
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
 * Cut selected cells (copy then delete)
 * @param {Object} options - Same as copySelection + deleteSelectedCells
 */
export async function cutSelection(options) {
  await copySelection(options)
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
        isFormula: isFormula
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
 * Paste from clipboard into grid
 * @param {Object} options
 * @param {Object} options.selectionBounds - {minRow, maxRow, minCol, maxCol} (optional)
 * @param {Array} options.columns - Column definitions
 * @param {Array} options.rowData - Row data array
 * @param {Object} options.gridApi - AG Grid API
 * @param {Function} options.emit - Vue emit function
 */
export async function pasteSelection({ selectionBounds, columns, rowData, gridApi, emit }) {
  const startRow = selectionBounds?.minRow ?? 0
  const startCol = selectionBounds?.minCol ?? 0

  let text = ''
  try {
    text = await navigator.clipboard.readText()
  } catch (err) {
    console.warn('Failed to read from clipboard:', err.message)
    return
  }

  if (!text) return

  const lines = text.split('\n')

  for (let r = 0; r < lines.length; r++) {
    const cells = lines[r].split('\t')
    for (let c = 0; c < cells.length; c++) {
      const targetRow = startRow + r
      const targetCol = startCol + c

      if (targetRow < rowData.length && targetCol < columns.length) {
        const value = cells[c]
        const isFormula = value.startsWith('=')

        emit('cell-change', {
          row: targetRow,
          col: targetCol,
          value: value,
          isFormula: isFormula
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
