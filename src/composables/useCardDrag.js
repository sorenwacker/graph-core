import { ref } from 'vue'

/**
 * Composable for card drag-and-drop functionality.
 * Handles drag state and calculates drop positions without being tied to specific move/reorder logic.
 *
 * @param {Object} options
 * @param {Function} options.onMove - Called when dropping inside a target: onMove(sourceNode, targetNode)
 * @param {Function} options.onReorder - Called when dropping before/after: onReorder(sourceNode, targetNode, position)
 */
export function useCardDrag({ onMove, onReorder } = {}) {
  const draggedNode = ref(null)
  const dropTarget = ref(null)
  const dropPosition = ref(null) // 'before', 'after', 'inside'

  function onDragStart(e, node) {
    // Don't start drag if it originated from an input or textarea
    const target = e.target
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('input, textarea')) {
      e.preventDefault()
      return
    }
    draggedNode.value = node
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', node.id)
    e.target.classList.add('dragging')
  }

  function onDragEnd(e) {
    e.target.classList.remove('dragging')
    draggedNode.value = null
    dropTarget.value = null
    dropPosition.value = null
  }

  function onDragOver(e, node) {
    if (!draggedNode.value || draggedNode.value.id === node.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    dropTarget.value = node

    // Determine drop position based on mouse position
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const width = rect.width

    // Shift key forces reorder-only mode (no nesting)
    const reorderOnly = e.shiftKey

    // Left 35% = before, right 35% = after, middle 30% = inside
    // This makes it easier to reorder without accidentally nesting
    if (x < width * 0.35) {
      dropPosition.value = 'before'
    } else if (x > width * 0.65) {
      dropPosition.value = 'after'
    } else if (reorderOnly) {
      // In reorder-only mode, use left/right half for before/after
      dropPosition.value = x < width * 0.5 ? 'before' : 'after'
    } else {
      dropPosition.value = 'inside'
    }
  }

  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      dropTarget.value = null
      dropPosition.value = null
    }
  }

  async function onDrop(e, targetNode) {
    e.preventDefault()
    if (!draggedNode.value || draggedNode.value.id === targetNode.id) return

    const sourceNode = draggedNode.value
    const position = dropPosition.value

    // Clear drag state first
    draggedNode.value = null
    dropTarget.value = null
    dropPosition.value = null

    if (position === 'inside') {
      // Move dragged card as child of target
      if (onMove) {
        await onMove(sourceNode, targetNode)
      }
    } else {
      // Reorder: move before or after target (same parent)
      if (onReorder) {
        await onReorder(sourceNode, targetNode, position)
      }
    }
  }

  function getDropClass(node) {
    if (!dropTarget.value || dropTarget.value.id !== node.id) return {}
    return {
      'drop-before': dropPosition.value === 'before',
      'drop-after': dropPosition.value === 'after',
      'drop-inside': dropPosition.value === 'inside'
    }
  }

  function isDragging() {
    return draggedNode.value !== null
  }

  return {
    // State
    draggedNode,
    dropTarget,
    dropPosition,

    // Methods
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    getDropClass,
    isDragging
  }
}
