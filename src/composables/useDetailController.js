import { ref, watch } from 'vue'
import { useDetailResize } from './useDetailResize.js'

/**
 * Controller composable for detail panel management.
 * Centralizes detail panel state and operations.
 *
 * @param {Object} options
 * @param {Ref<boolean>} options.detailPinned - External pinned state (optional, creates internal if not provided)
 * @returns {Object} Detail panel state and handlers
 */
export function useDetailController(options = {}) {
  // Panel visibility state
  const showDetail = ref(false)
  const fullscreenDetail = ref(false)
  const detailPinned = options.detailPinned || ref(false)

  // Component ref for detail panel
  const detailPanelRef = ref(null)

  // Detail panel resize functionality
  const { detailWidth, isResizing: isResizingDetail, onResizeStart: onDetailResizeStart } = useDetailResize()

  /**
   * Close the detail panel and reset all states.
   */
  function closeDetail() {
    showDetail.value = false
    fullscreenDetail.value = false
    detailPinned.value = false
  }

  /**
   * Open the detail panel.
   * @param {Object} options - Open options
   * @param {boolean} options.fullscreen - Open in fullscreen mode
   */
  function openDetail({ fullscreen = false } = {}) {
    showDetail.value = true
    if (fullscreen) {
      fullscreenDetail.value = true
    }
  }

  /**
   * Toggle fullscreen mode.
   */
  function toggleFullscreen() {
    fullscreenDetail.value = !fullscreenDetail.value
  }

  /**
   * Toggle pinned state.
   */
  function togglePin() {
    detailPinned.value = !detailPinned.value
  }

  /**
   * Load linked nodes in the detail panel.
   * Delegates to the detail panel component ref.
   */
  function loadLinkedNodes() {
    detailPanelRef.value?.loadLinkedNodes()
  }

  /**
   * Load children in the detail panel.
   * Delegates to the detail panel component ref.
   */
  function loadChildren() {
    detailPanelRef.value?.loadChildren()
  }

  return {
    // State
    showDetail,
    fullscreenDetail,
    detailPinned,
    detailWidth,
    isResizingDetail,

    // Refs
    detailPanelRef,

    // Handlers
    closeDetail,
    openDetail,
    toggleFullscreen,
    togglePin,
    onDetailResizeStart,

    // Delegation methods
    loadLinkedNodes,
    loadChildren,
  }
}
