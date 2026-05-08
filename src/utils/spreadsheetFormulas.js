/**
 * Spreadsheet formula detection and parsing utilities.
 */

/**
 * Check if a value is a formula (starts with '=').
 *
 * @param {string} value - Cell value to check
 * @returns {boolean} True if value is a formula
 */
export function isFormula(value) {
  if (typeof value !== 'string') return false
  return value.startsWith('=')
}

/**
 * Get column letter name (A, B, ..., Z, AA, AB, ...).
 *
 * @param {number} index - Column index (0-based)
 * @returns {string} Column name (e.g., 'A', 'B', 'AA')
 */
export function getColumnName(index) {
  let name = ''
  let i = index
  while (i >= 0) {
    name = String.fromCharCode(65 + (i % 26)) + name
    i = Math.floor(i / 26) - 1
  }
  return name
}

/**
 * Parse a cell reference (e.g., 'A1', 'B2') into row and column indices.
 *
 * @param {string} ref - Cell reference string
 * @returns {Object|null} {row, col} indices or null if invalid
 */
export function parseCellReference(ref) {
  if (typeof ref !== 'string') return null

  const match = ref.match(/^([A-Z]+)(\d+)$/i)
  if (!match) return null

  const colStr = match[1].toUpperCase()
  const rowStr = match[2]

  // Convert column letters to index
  let col = 0
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64)
  }
  col -= 1 // Convert to 0-based

  const row = parseInt(rowStr, 10) - 1 // Convert to 0-based

  if (row < 0 || col < 0) return null

  return { row, col }
}

/**
 * Convert row and column indices to a cell reference string.
 *
 * @param {number} row - Row index (0-based)
 * @param {number} col - Column index (0-based)
 * @returns {string} Cell reference (e.g., 'A1')
 */
export function toCellReference(row, col) {
  return getColumnName(col) + (row + 1)
}
