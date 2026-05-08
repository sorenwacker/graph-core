/**
 * Spreadsheet cell style utilities.
 * Handles parsing, checking, and converting cell styles.
 */

/**
 * Parse a cell style from a cell object.
 *
 * @param {Object|null} cell - Cell data object with optional style property
 * @returns {Object|null} Parsed style object or null
 */
export function parseCellStyle(cell) {
  if (!cell?.style) return null
  try {
    return typeof cell.style === 'string' ? JSON.parse(cell.style) : cell.style
  } catch {
    return null
  }
}

/**
 * Get cell style for a specific row and column from cell data.
 *
 * @param {Array} cellData - Array of cell objects
 * @param {number} row - Row index
 * @param {number} col - Column index
 * @returns {Object|null} Parsed style object or null
 */
export function getCellStyleFromData(cellData, row, col) {
  const cell = cellData.find(c => c.row_index === row && c.col_index === col)
  return parseCellStyle(cell)
}

/**
 * Check if any cell in a selection bounds has a specific style property.
 *
 * @param {Object} bounds - Selection bounds {minRow, maxRow, minCol, maxCol}
 * @param {Array} cellData - Array of cell objects
 * @param {string} styleProp - Style property to check (e.g., 'bold', 'italic')
 * @returns {boolean} True if any selected cell has the style property
 */
export function selectionHasStyle(bounds, cellData, styleProp) {
  if (!bounds) return false

  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const style = getCellStyleFromData(cellData, r, c)
      if (style?.[styleProp]) return true
    }
  }
  return false
}

/**
 * Get the common color for all cells in a selection.
 * Returns null if cells have different colors.
 *
 * @param {Object} bounds - Selection bounds {minRow, maxRow, minCol, maxCol}
 * @param {Array} cellData - Array of cell objects
 * @returns {string|null} Common color value or null
 */
export function getSelectionColor(bounds, cellData) {
  if (!bounds) return null

  let commonColor = undefined
  for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
    for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
      const style = getCellStyleFromData(cellData, r, c)
      const color = style?.color || null
      if (commonColor === undefined) {
        commonColor = color
      } else if (commonColor !== color) {
        return null
      }
    }
  }
  return commonColor
}

/**
 * Create a cell style object for AG Grid from a parsed style.
 *
 * @param {Object|null} style - Parsed style object
 * @returns {Object|null} AG Grid compatible style object
 */
export function toAgGridCellStyle(style) {
  if (!style) return null
  return {
    fontWeight: style.bold ? '700' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    color: style.color || null,
  }
}

/**
 * Create a cell style callback function for AG Grid.
 *
 * @param {Array} cellData - Array of cell objects
 * @returns {Function} AG Grid cellStyle callback function
 */
export function createCellStyleCallback(cellData) {
  return params => {
    const colIndex = params.colDef.context?.colIndex
    if (colIndex === undefined) return null
    const style = getCellStyleFromData(cellData, params.node.rowIndex, colIndex)
    return toAgGridCellStyle(style)
  }
}
