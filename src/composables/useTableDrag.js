/**
 * Composable for drag and drop functionality in table views.
 * Handles node reordering and reparenting via mouse drag.
 */
import { ref } from 'vue'
import { findRootDropTarget, setRootDropHighlight } from '../utils/rootDropTarget.js'

// Only accept simple hex colors for the ghost badge; anything else (including
// user-supplied strings trying to smuggle CSS/markup) falls back to the default.
const SAFE_HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/**
 * Creates a drag ghost element for visual feedback during drag.
 * Built with DOM APIs (textContent) so user-controlled node title/color are
 * never interpolated into HTML.
 */
function createDragGhost(node, x, y) {
  const ghost = document.createElement('div')
  ghost.className = 'drag-ghost'

  const typeEl = document.createElement('span')
  typeEl.className = 'ghost-type'
  typeEl.style.background = SAFE_HEX_COLOR.test(node.color || '') ? node.color : '#0f4c75'
  typeEl.textContent = node.type[0].toUpperCase()

  const titleEl = document.createElement('span')
  titleEl.className = 'ghost-title'
  titleEl.textContent = node.title

  const actionEl = document.createElement('span')
  actionEl.className = 'ghost-action'

  ghost.append(typeEl, titleEl, actionEl)
  // Only the position is inline: it follows the cursor. Everything else is in
  // TableView.css so the themes can restyle it - an inline background could not
  // be overridden by a theme rule.
  ghost.style.position = 'fixed'
  ghost.style.left = `${x + 10}px`
  ghost.style.top = `${y + 10}px`
  document.body.appendChild(ghost)
  return ghost
}

/**
 * Determines drop position based on cursor Y position within row.
 * Top 35% = before, bottom 35% = after, middle 30% = inside (unless shift key).
 */
function calculateDropPosition(e, rect, reorderOnly) {
  const y = e.clientY - rect.top
  const height = rect.height

  if (y < height * 0.35) {
    return 'before'
  } else if (y > height * 0.65) {
    return 'after'
  } else if (reorderOnly) {
    return y < height * 0.5 ? 'before' : 'after'
  } else {
    return 'inside'
  }
}

/**
 * Provides drag and drop functionality for table rows.
 */
export function useTableDrag({ findNodeById, selectedIds, onMove, onMoveMultiple, onReorder }) {
  const draggedNode = ref(null)
  const dropTarget = ref(null)
  const dropPosition = ref(null) // 'before', 'after', 'inside'
  const isDragging = ref(false)
  const dragGhost = ref(null)
  const justFinishedDrag = ref(false)

  let lastTargetId = null
  let lastPosition = null

  function onMouseDown(e, node) {
    // Don't start drag from interactive elements
    if (e.target.closest('input, button, .expand-btn')) return

    e.preventDefault()
    draggedNode.value = node

    // Reset tracking variables for new drag
    lastTargetId = null
    lastPosition = null

    dragGhost.value = createDragGhost(node, e.clientX, e.clientY)
    isDragging.value = true

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e) {
    if (!isDragging.value || !dragGhost.value) return

    // Move ghost
    dragGhost.value.style.left = `${e.clientX + 10}px`
    dragGhost.value.style.top = `${e.clientY + 10}px`

    const actionEl = dragGhost.value.querySelector('.ghost-action')

    // Find drop target
    const elemBelow = document.elementFromPoint(e.clientX, e.clientY)
    const row = elemBelow?.closest('tr.node-row')
    const table = elemBelow?.closest('.table-view')
    // The breadcrumb home icon sits outside the table, so it is hit-tested
    // directly rather than through a row. See docs/guides/drag-drop.md.
    const overRoot = Boolean(findRootDropTarget(e.clientX, e.clientY))
    setRootDropHighlight(overRoot)

    let newTargetId = null
    let newPosition = null

    if (overRoot) {
      newTargetId = 'root'
      newPosition = 'root'
    } else if (row) {
      const nodeId = parseInt(row.dataset.nodeId)
      if (nodeId && nodeId !== draggedNode.value?.id) {
        newTargetId = nodeId

        const rect = row.getBoundingClientRect()
        const reorderOnly = e.shiftKey
        newPosition = calculateDropPosition(e, rect, reorderOnly)
      }
    } else if (table) {
      newTargetId = 'root'
      newPosition = 'root'
    }

    // Only update DOM if target or position changed
    if (newTargetId !== lastTargetId || newPosition !== lastPosition) {
      // Clear previous drop indicators
      document.querySelectorAll('.drop-before, .drop-after, .drop-inside').forEach(el => {
        el.classList.remove('drop-before', 'drop-after', 'drop-inside')
      })

      if (newTargetId && newTargetId !== 'root' && row) {
        const targetNode = findNodeById(newTargetId)
        if (targetNode) {
          dropTarget.value = targetNode
          dropPosition.value = newPosition
          row.classList.add(`drop-${newPosition}`)

          if (actionEl) {
            if (newPosition === 'before') actionEl.textContent = '\u2191 before'
            else if (newPosition === 'after') actionEl.textContent = '\u2193 after'
            else actionEl.textContent = '\u2192 as child'
          }
        }
      } else if (newTargetId === 'root') {
        dropTarget.value = 'root'
        dropPosition.value = null
        if (actionEl) actionEl.textContent = '\u2192 to root'
      } else {
        dropTarget.value = null
        dropPosition.value = null
        if (actionEl) actionEl.textContent = ''
      }

      lastTargetId = newTargetId
      lastPosition = newPosition
    }
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)

    // Clear drop indicators
    document.querySelectorAll('.drop-before, .drop-after, .drop-inside').forEach(el => {
      el.classList.remove('drop-before', 'drop-after', 'drop-inside')
    })
    setRootDropHighlight(false)

    if (dragGhost.value) {
      dragGhost.value.remove()
      dragGhost.value = null
    }

    if (draggedNode.value && dropTarget.value) {
      const sourceNode = draggedNode.value
      const targetNode = dropTarget.value

      // Check if we're moving multiple selected items
      const hasMultipleSelected = selectedIds?.value?.size > 1 && selectedIds.value.has(sourceNode.id)

      if (targetNode === 'root') {
        // Move to root (no parent)
        if (hasMultipleSelected) {
          onMoveMultiple({ nodeIds: Array.from(selectedIds.value), newParentId: null })
        } else {
          onMove({ nodeId: sourceNode.id, oldParentId: sourceNode.parent_id, newParentId: null })
        }
      } else if (dropPosition.value === 'inside') {
        // Move as child of target
        if (hasMultipleSelected) {
          onMoveMultiple({ nodeIds: Array.from(selectedIds.value), newParentId: targetNode.id })
        } else {
          onMove({ nodeId: sourceNode.id, oldParentId: sourceNode.parent_id, newParentId: targetNode.id })
        }
      } else {
        // Reorder: move before or after target
        onReorder({
          nodeId: sourceNode.id,
          targetId: targetNode.id,
          position: dropPosition.value,
        })
      }
    }

    isDragging.value = false
    draggedNode.value = null
    dropTarget.value = null
    dropPosition.value = null
    lastTargetId = null
    lastPosition = null

    // Prevent accidental expand clicks right after drag
    justFinishedDrag.value = true
    setTimeout(() => {
      justFinishedDrag.value = false
    }, 200)
  }

  function getDropClass(node) {
    if (!dropTarget.value || dropTarget.value.id !== node.id) return {}
    return {
      'drop-before': dropPosition.value === 'before',
      'drop-after': dropPosition.value === 'after',
      'drop-inside': dropPosition.value === 'inside',
    }
  }

  return {
    draggedNode,
    dropTarget,
    dropPosition,
    isDragging,
    justFinishedDrag,
    onMouseDown,
    getDropClass,
  }
}
