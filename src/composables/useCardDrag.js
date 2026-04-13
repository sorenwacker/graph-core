import { ref } from 'vue'

/**
 * Composable for card drag-and-drop functionality.
 * Handles drag state and calculates drop positions without being tied to specific move/reorder logic.
 *
 * @param {Object} options
 * @param {Function} options.onMove - Called when dropping inside a target: onMove(sourceNode, targetNode)
 * @param {Function} options.onMoveMultiple - Called when dropping multiple nodes inside a target: onMoveMultiple(nodeIds, targetNode)
 * @param {Function} options.onReorder - Called when dropping before/after: onReorder(sourceNode, targetNode, position)
 * @param {Ref<Set>} options.selectedIds - Set of currently selected node IDs for multi-select drag
 */
export function useCardDrag({ onMove, onMoveMultiple, onReorder, selectedIds } = {}) {
  const draggedNode = ref(null)
  const draggedNodeIds = ref([]) // All node IDs being dragged (for multi-select)
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

    // If the dragged node is part of a multi-selection, drag all selected nodes
    if (selectedIds?.value?.size > 1 && selectedIds.value.has(node.id)) {
      draggedNodeIds.value = [...selectedIds.value]
    } else {
      draggedNodeIds.value = [node.id]
    }

    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', node.id)
    e.target.classList.add('dragging')
  }

  function onDragEnd(e) {
    e.target.classList.remove('dragging')
    draggedNode.value = null
    draggedNodeIds.value = []
    dropTarget.value = null
    dropPosition.value = null
  }

  function onDragOver(e, node) {
    // Skip if not dragging or target is one of the dragged nodes
    if (!draggedNode.value) return
    if (draggedNodeIds.value.includes(node.id)) return
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
    // Skip if not dragging or target is one of the dragged nodes
    if (!draggedNode.value) return
    if (draggedNodeIds.value.includes(targetNode.id)) return

    const sourceNode = draggedNode.value
    const nodeIds = [...draggedNodeIds.value]
    const position = dropPosition.value
    const isMultiDrag = nodeIds.length > 1

    // Clear drag state first
    draggedNode.value = null
    draggedNodeIds.value = []
    dropTarget.value = null
    dropPosition.value = null

    if (position === 'inside') {
      // Move dragged card(s) as child of target
      if (isMultiDrag && onMoveMultiple) {
        await onMoveMultiple(nodeIds, targetNode)
      } else if (onMove) {
        await onMove(sourceNode, targetNode)
      }
    } else {
      // Reorder: move before or after target (same parent)
      // Only supported for single node drag
      if (!isMultiDrag && onReorder) {
        await onReorder(sourceNode, targetNode, position)
      }
    }
  }

  function getDropClass(node) {
    if (!dropTarget.value || dropTarget.value.id !== node.id) return {}
    return {
      'drop-before': dropPosition.value === 'before',
      'drop-after': dropPosition.value === 'after',
      'drop-inside': dropPosition.value === 'inside',
    }
  }

  function isDragging() {
    return draggedNode.value !== null
  }

  function getDragCount() {
    return draggedNodeIds.value.length
  }

  return {
    // State
    draggedNode,
    draggedNodeIds,
    dropTarget,
    dropPosition,

    // Methods
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    getDropClass,
    isDragging,
    getDragCount,
  }
}
