import { ref, onUnmounted } from 'vue'

/**
 * Composable for detail panel resize functionality.
 * Handles dragging to resize the detail panel width.
 *
 * @param {Object} options
 * @param {string} options.storageKey - LocalStorage key for persisting width
 * @param {number} options.defaultWidth - Default width in pixels
 * @param {number} options.minWidth - Minimum allowed width
 * @param {number} options.maxWidthPercent - Maximum width as percent of window
 */
export function useDetailResize({
  storageKey = 'graphcore-detailWidth',
  defaultWidth = 400,
  minWidth = 300,
  maxWidthPercent = 0.9
} = {}) {
  const storedWidth = typeof localStorage !== 'undefined'
    ? parseInt(localStorage.getItem(storageKey)) || defaultWidth
    : defaultWidth

  const detailWidth = ref(storedWidth)
  const isResizing = ref(false)

  function onResizeMove(e) {
    if (!isResizing.value) return
    const newWidth = window.innerWidth - e.clientX
    detailWidth.value = Math.max(minWidth, Math.min(newWidth, window.innerWidth * maxWidthPercent))
  }

  function onResizeEnd() {
    isResizing.value = false
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeEnd)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, detailWidth.value.toString())
    }
  }

  function onResizeStart(e) {
    isResizing.value = true
    document.addEventListener('mousemove', onResizeMove)
    document.addEventListener('mouseup', onResizeEnd)
    e.preventDefault()
  }

  function setWidth(width) {
    detailWidth.value = Math.max(minWidth, Math.min(width, window.innerWidth * maxWidthPercent))
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, detailWidth.value.toString())
    }
  }

  function cleanup() {
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeEnd)
  }

  // Auto-cleanup on unmount
  onUnmounted(cleanup)

  return {
    // State
    detailWidth,
    isResizing,

    // Methods
    onResizeStart,
    setWidth,
    cleanup
  }
}
