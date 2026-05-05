/**
 * Composable for timeline user interactions.
 * Handles clicks, context menus, panning, and column resizing.
 */

import { ref } from 'vue'

// Column resize constants
const MIN_LABELS_WIDTH = 100
const MAX_LABELS_WIDTH = 400
const DEFAULT_LABELS_WIDTH = 200

/**
 * Create timeline interaction handlers.
 * @param {Object} options
 * @param {Function} options.emit - Vue emit function
 * @param {Ref} options.scrollableRef - Reference to scrollable container
 * @param {Ref} options.labelsRef - Reference to labels container
 * @param {Function} options.onScroll - Callback when scroll position changes
 * @returns {Object} Interaction state and handlers
 */
export function useTimelineInteractions({ emit, scrollableRef, labelsRef, onScroll }) {
  // Labels column width state
  const labelsWidth = ref(DEFAULT_LABELS_WIDTH)
  const labelsDragState = ref(null)

  // Canvas panning state
  const panState = ref(null)

  /**
   * Handle context menu on a node.
   */
  function handleContextMenu(e, node) {
    e.preventDefault()
    emit('context-menu', { event: e, node })
  }

  /**
   * Handle click on a node with modifier support.
   * Cmd+Alt+Click: delete
   * Cmd+Click: add child
   * Click: select
   */
  function handleNodeClick(e, node) {
    const hasCmd = e.metaKey || e.ctrlKey
    const hasAlt = e.altKey

    if (hasCmd && hasAlt) {
      emit('delete', node.id)
    } else if (hasCmd) {
      emit('add-child', { parentId: node.id, title: '', prompt: true })
    } else {
      emit('select', node)
    }
  }

  /**
   * Sync vertical scroll between labels and timeline.
   */
  function syncScroll(source) {
    if (!scrollableRef.value || !labelsRef.value) return
    if (source === 'timeline') {
      labelsRef.value.scrollTop = scrollableRef.value.scrollTop
      if (onScroll) {
        onScroll(scrollableRef.value.scrollLeft)
      }
    } else {
      scrollableRef.value.scrollTop = labelsRef.value.scrollTop
    }
  }

  /**
   * Start resizing labels column.
   */
  function handleLabelsDragStart(e) {
    e.preventDefault()
    labelsDragState.value = { startX: e.clientX, startWidth: labelsWidth.value }
  }

  /**
   * Handle labels column resize movement.
   */
  function handleLabelsDragMove(e) {
    if (!labelsDragState.value) return
    const delta = e.clientX - labelsDragState.value.startX
    labelsWidth.value = Math.max(MIN_LABELS_WIDTH, Math.min(MAX_LABELS_WIDTH, labelsDragState.value.startWidth + delta))
  }

  /**
   * End labels column resize.
   */
  function handleLabelsDragEnd() {
    labelsDragState.value = null
  }

  /**
   * Start canvas panning.
   */
  function handlePanStart(e) {
    // Only pan with middle mouse or when clicking empty space
    if (e.button === 1 || (e.button === 0 && e.target.classList.contains('timeline-body'))) {
      e.preventDefault()
      const container = scrollableRef.value
      if (!container) return
      panState.value = {
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: container.scrollLeft,
        scrollTop: container.scrollTop,
      }
    }
  }

  /**
   * Handle canvas pan movement.
   */
  function handlePanMove(e) {
    if (!panState.value) return
    const container = scrollableRef.value
    if (!container) return
    const dx = e.clientX - panState.value.startX
    const dy = e.clientY - panState.value.startY
    container.scrollLeft = panState.value.scrollLeft - dx
    container.scrollTop = panState.value.scrollTop - dy
    // Sync labels scroll
    if (labelsRef.value) {
      labelsRef.value.scrollTop = container.scrollTop
    }
  }

  /**
   * End canvas panning.
   */
  function handlePanEnd() {
    panState.value = null
  }

  /**
   * Setup global event listeners.
   */
  function setupListeners() {
    document.addEventListener('mousemove', handleLabelsDragMove)
    document.addEventListener('mouseup', handleLabelsDragEnd)
    document.addEventListener('mousemove', handlePanMove)
    document.addEventListener('mouseup', handlePanEnd)
  }

  /**
   * Cleanup global event listeners.
   */
  function cleanupListeners() {
    document.removeEventListener('mousemove', handlePanMove)
    document.removeEventListener('mouseup', handlePanEnd)
    document.removeEventListener('mousemove', handleLabelsDragMove)
    document.removeEventListener('mouseup', handleLabelsDragEnd)
  }

  return {
    // State
    labelsWidth,
    labelsDragState,
    panState,

    // Handlers
    handleContextMenu,
    handleNodeClick,
    syncScroll,
    handleLabelsDragStart,
    handleLabelsDragMove,
    handleLabelsDragEnd,
    handlePanStart,
    handlePanMove,
    handlePanEnd,

    // Lifecycle
    setupListeners,
    cleanupListeners,
  }
}
