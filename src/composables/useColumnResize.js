/**
 * Composable for managing column resize functionality in table views.
 * Provides mouse-based column resizing with persistence.
 */
import { ref, onUnmounted } from 'vue'
import { loadColumnWidths, saveColumnWidths, MIN_COLUMN_WIDTH } from '../components/config/tableColumns.js'

/**
 * Provides column resize functionality for tables.
 * Handles mouse events for dragging column borders and persists widths.
 */
export function useColumnResize() {
  const colWidths = ref(loadColumnWidths())
  const resizing = ref(null) // column name being resized
  const resizeStartX = ref(0)
  const resizeStartWidth = ref(0)

  function startResize(e, colName) {
    e.preventDefault()
    resizing.value = colName
    resizeStartX.value = e.clientX
    resizeStartWidth.value = colWidths.value[colName]
    document.addEventListener('mousemove', onResizeMove)
    document.addEventListener('mouseup', onResizeEnd)
  }

  function onResizeMove(e) {
    if (!resizing.value) return
    const diff = e.clientX - resizeStartX.value
    const newWidth = Math.max(MIN_COLUMN_WIDTH, resizeStartWidth.value + diff)
    colWidths.value[resizing.value] = newWidth
  }

  function onResizeEnd() {
    if (resizing.value) {
      saveColumnWidths(colWidths.value)
      resizing.value = null
    }
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeEnd)
  }

  onUnmounted(() => {
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeEnd)
  })

  return {
    colWidths,
    resizing,
    startResize,
  }
}
