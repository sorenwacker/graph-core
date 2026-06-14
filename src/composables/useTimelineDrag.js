/**
 * Composable for timeline bar drag and resize operations
 * Handles moving and resizing timeline bars
 */

import { ref } from 'vue'

/**
 * Create timeline drag handler
 * @param {Object} options
 * @param {Function} options.getDatePosition - Function to convert date to pixel position
 * @param {Function} options.positionToDate - Function to convert pixel position to date
 * @param {Ref} options.scrollableRef - Reference to scrollable container
 * @param {Ref} options.zoomLevel - Current zoom level
 * @param {Function} options.emit - Vue emit function
 * @param {Function} options.getBarStyle - Function to get base bar style
 * @param {number} options.minBarWidth - Minimum bar width in pixels
 */
export function useTimelineDrag({
  getDatePosition,
  positionToDate,
  scrollableRef,
  zoomLevel,
  emit,
  getBarStyle,
  minBarWidth = 20,
}) {
  // Drag state for timeline bars
  const dragState = ref(null) // { node, type: 'move' | 'resize-start' | 'resize-end', startX, ... }

  /**
   * Start dragging a bar
   */
  function handleDragStart(e, node, type) {
    e.preventDefault()
    e.stopPropagation()

    // Hide tooltip during drag
    emit('hide-tooltip')

    const container = scrollableRef.value
    if (!container) return

    const rect = container.getBoundingClientRect()
    const startX = e.clientX - rect.left + container.scrollLeft

    dragState.value = {
      node,
      type, // 'move', 'resize-start', 'resize-end'
      startX,
      originalStart: node.displayDate,
      originalEnd: node.endDisplayDate,
      startPos: getDatePosition(node.displayDate),
      endPos: getDatePosition(node.endDisplayDate),
    }

    // Select the node being dragged
    emit('select', node)
  }

  /**
   * Handle drag movement
   */
  function handleDragMove(e) {
    if (!dragState.value) return

    const container = scrollableRef.value
    if (!container) return

    const rect = container.getBoundingClientRect()
    const currentX = e.clientX - rect.left + container.scrollLeft
    const deltaX = currentX - dragState.value.startX

    const { type, startPos, endPos } = dragState.value

    if (type === 'move') {
      // Move both start and end
      const newStartDate = positionToDate(startPos + deltaX)
      const newEndDate = positionToDate(endPos + deltaX)
      if (newStartDate && newEndDate) {
        dragState.value.newStart = newStartDate
        dragState.value.newEnd = newEndDate
      }
    } else if (type === 'resize-start') {
      // Only move start, keep end fixed
      const newStartDate = positionToDate(startPos + deltaX)
      const endDate = dragState.value.originalEnd
      if (newStartDate && newStartDate <= endDate) {
        dragState.value.newStart = newStartDate
        dragState.value.newEnd = endDate
      }
    } else if (type === 'resize-end') {
      // Only move end, keep start fixed
      const startDate = dragState.value.originalStart
      const newEndDate = positionToDate(endPos + deltaX)
      if (newEndDate && newEndDate >= startDate) {
        dragState.value.newStart = startDate
        dragState.value.newEnd = newEndDate
      }
    }
  }

  /**
   * End drag and save changes
   */
  function handleDragEnd() {
    if (!dragState.value) return

    const { node, newStart, newEnd, originalStart, originalEnd } = dragState.value

    // Only emit update if dates actually changed
    if (newStart && newEnd && (newStart !== originalStart || newEnd !== originalEnd)) {
      // Determine which date fields to update based on original node data
      const updates = { id: node.id }

      if (node.start_date || !node.due_date) {
        // Node has start_date or uses start_date/end_date pattern
        updates.start_date = newStart
        updates.end_date = newEnd
      } else {
        // Node only has due_date. The bar's left edge is the due_date
        // (displayDate = due_date, endDisplayDate = today), so the dragged
        // start side maps to due_date, not the end side.
        updates.due_date = newStart
      }

      emit('update', updates)
    }

    dragState.value = null
  }

  /**
   * Get bar style with drag preview
   */
  function getDragBarStyle(node) {
    const baseStyle = getBarStyle(node)

    // If this node is being dragged, use preview position
    if (dragState.value && dragState.value.node.id === node.id) {
      const { newStart, newEnd } = dragState.value
      if (newStart && newEnd) {
        const left = getDatePosition(newStart) + 'px'
        const startDate = new Date(newStart)
        const endDate = new Date(newEnd)
        const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
        const width = Math.max(days * zoomLevel.value, minBarWidth) + 'px'
        return { ...baseStyle, left, width }
      }
    }

    return baseStyle
  }

  return {
    dragState,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    getDragBarStyle,
  }
}
