/**
 * Table column configuration for TableView component.
 * Defines column widths, storage keys, and column metadata.
 */

const STORAGE_KEY = 'graphcore-table-colwidths'

/**
 * Default column widths for the table view.
 */
export const defaultColumnWidths = {
  expand: 30,
  type: 60,
  check: 30,
  title: 300,
  notes: 200,
  due: 90,
  children: 40,
  fav: 30,
  actions: 60,
}

/**
 * Load saved column widths from localStorage.
 * Falls back to defaults if no saved widths or parse error.
 */
export function loadColumnWidths() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      return { ...defaultColumnWidths, ...JSON.parse(saved) }
    } catch {
      return { ...defaultColumnWidths }
    }
  }
  return { ...defaultColumnWidths }
}

/**
 * Save column widths to localStorage.
 */
export function saveColumnWidths(widths) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(widths))
}

/**
 * Minimum column width in pixels.
 */
export const MIN_COLUMN_WIDTH = 30
