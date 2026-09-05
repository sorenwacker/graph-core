import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { useTableDrag } from '../composables/useTableDrag.js'

/**
 * Table view drags with a mouse-tracked ghost rather than native drag-and-drop,
 * so the breadcrumb home icon is found by hit-testing the pointer.
 * See docs/guides/drag-drop.md.
 */

describe('table drag onto the breadcrumb root', () => {
  let onMove, onMoveMultiple, onReorder, selectedIds, crumb
  const node = { id: 3, title: 'Child', type: 'note', parent_id: 9 }

  beforeEach(() => {
    onMove = vi.fn()
    onMoveMultiple = vi.fn()
    onReorder = vi.fn()
    selectedIds = ref(new Set())
    // Not every DOM environment defines hit-testing; the drag only needs it to
    // answer which element is under the pointer.
    if (!document.elementFromPoint) document.elementFromPoint = () => null
    crumb = document.createElement('span')
    crumb.className = 'crumb home-crumb'
    document.body.appendChild(crumb)
  })

  afterEach(() => {
    crumb.remove()
    document.querySelectorAll('.drag-ghost').forEach(el => el.remove())
    vi.restoreAllMocks()
  })

  function dragOntoCrumb({ over = crumb } = {}) {
    const drag = useTableDrag({
      findNodeById: () => null,
      selectedIds,
      onMove,
      onMoveMultiple,
      onReorder,
    })

    drag.onMouseDown({ target: { closest: () => null }, preventDefault: () => {}, clientX: 0, clientY: 0 }, node)
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(over)
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 12 }))
    return drag
  }

  it('marks the crumb while the pointer is over it', () => {
    dragOntoCrumb()

    expect(crumb.classList.contains('drop-target')).toBe(true)
  })

  it('moves the dragged node to the top level on release', () => {
    dragOntoCrumb()
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 30, clientY: 12 }))

    expect(onMove).toHaveBeenCalledWith({ nodeId: 3, oldParentId: 9, newParentId: null })
    expect(crumb.classList.contains('drop-target')).toBe(false)
  })

  it('moves the whole selection when the dragged node is part of one', () => {
    selectedIds.value = new Set([3, 4])
    dragOntoCrumb()
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 30, clientY: 12 }))

    expect(onMoveMultiple).toHaveBeenCalledWith({ nodeIds: [3, 4], newParentId: null })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('does nothing special when the pointer is elsewhere', () => {
    dragOntoCrumb({ over: document.body })
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 500, clientY: 500 }))

    expect(onMove).not.toHaveBeenCalled()
    expect(onMoveMultiple).not.toHaveBeenCalled()
  })
})
