import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCardDrag } from '../composables/useCardDrag.js'

/**
 * Create a mock drag event for testing.
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock event object
 */
function createMockDragEvent(overrides = {}) {
  return {
    target: {
      tagName: 'DIV',
      closest: () => null,
      classList: { add: vi.fn(), remove: vi.fn() },
    },
    dataTransfer: {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
    },
    preventDefault: vi.fn(),
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, width: 1000 }),
      contains: () => false,
    },
    clientX: 500,
    shiftKey: false,
    relatedTarget: null,
    ...overrides,
  }
}

describe('useCardDrag composable', () => {
  let onMove, onReorder, drag

  beforeEach(() => {
    onMove = vi.fn()
    onReorder = vi.fn()
    drag = useCardDrag({ onMove, onReorder })
  })

  describe('initial state', () => {
    it('should have null draggedNode', () => {
      expect(drag.draggedNode.value).toBeNull()
    })

    it('should have null dropTarget', () => {
      expect(drag.dropTarget.value).toBeNull()
    })

    it('should have null dropPosition', () => {
      expect(drag.dropPosition.value).toBeNull()
    })

    it('should report not dragging', () => {
      expect(drag.isDragging()).toBe(false)
    })
  })

  describe('onDragStart', () => {
    it('should set draggedNode', () => {
      const node = { id: 1, title: 'Test' }
      const e = createMockDragEvent()

      drag.onDragStart(e, node)

      expect(drag.draggedNode.value).toEqual(node)
      expect(e.dataTransfer.effectAllowed).toBe('move')
      expect(e.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 1)
      expect(e.target.classList.add).toHaveBeenCalledWith('dragging')
    })

    it('should prevent drag from input elements', () => {
      const node = { id: 1, title: 'Test' }
      const e = createMockDragEvent({ target: { tagName: 'INPUT', closest: () => null } })

      drag.onDragStart(e, node)

      expect(e.preventDefault).toHaveBeenCalled()
      expect(drag.draggedNode.value).toBeNull()
    })

    it('should prevent drag from textarea elements', () => {
      const node = { id: 1, title: 'Test' }
      const e = createMockDragEvent({ target: { tagName: 'TEXTAREA', closest: () => null } })

      drag.onDragStart(e, node)

      expect(e.preventDefault).toHaveBeenCalled()
      expect(drag.draggedNode.value).toBeNull()
    })

    it('should prevent drag when inside input/textarea', () => {
      const node = { id: 1, title: 'Test' }
      const e = createMockDragEvent({
        target: {
          tagName: 'DIV',
          closest: selector => (selector === 'input, textarea' ? document.createElement('input') : null),
        },
      })

      drag.onDragStart(e, node)

      expect(e.preventDefault).toHaveBeenCalled()
      expect(drag.draggedNode.value).toBeNull()
    })

    it('should report isDragging true after drag start', () => {
      const node = { id: 1, title: 'Test' }
      const e = createMockDragEvent()

      drag.onDragStart(e, node)

      expect(drag.isDragging()).toBe(true)
    })
  })

  describe('onDragEnd', () => {
    it('should clear all drag state', () => {
      // Setup drag state
      drag.draggedNode.value = { id: 1 }
      drag.dropTarget.value = { id: 2 }
      drag.dropPosition.value = 'before'

      const e = {
        target: {
          classList: { remove: vi.fn() },
        },
      }

      drag.onDragEnd(e)

      expect(drag.draggedNode.value).toBeNull()
      expect(drag.dropTarget.value).toBeNull()
      expect(drag.dropPosition.value).toBeNull()
      expect(e.target.classList.remove).toHaveBeenCalledWith('dragging')
    })
  })

  describe('onDragOver', () => {
    beforeEach(() => {
      drag.draggedNode.value = { id: 1 }
      drag.draggedNodeIds.value = [1]
    })

    it('should ignore if no dragged node', () => {
      drag.draggedNode.value = null
      const e = { preventDefault: vi.fn() }

      drag.onDragOver(e, { id: 2 })

      expect(e.preventDefault).not.toHaveBeenCalled()
      expect(drag.dropTarget.value).toBeNull()
    })

    it('should ignore if dragging over same node', () => {
      const e = { preventDefault: vi.fn() }

      drag.onDragOver(e, { id: 1 })

      expect(e.preventDefault).not.toHaveBeenCalled()
    })

    it('should set dropPosition to before for left half', () => {
      const e = {
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: '' },
        clientX: 100,
        altKey: false,
        currentTarget: {
          getBoundingClientRect: () => ({ left: 0, width: 1000 }),
        },
      }

      drag.onDragOver(e, { id: 2 })

      expect(drag.dropPosition.value).toBe('before')
      expect(drag.dropTarget.value).toEqual({ id: 2 })
    })

    it('should set dropPosition to after for right half', () => {
      const e = {
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: '' },
        clientX: 800,
        altKey: false,
        currentTarget: {
          getBoundingClientRect: () => ({ left: 0, width: 1000 }),
        },
      }

      drag.onDragOver(e, { id: 2 })

      expect(drag.dropPosition.value).toBe('after')
    })

    it('should set dropPosition to inside with alt key', () => {
      const e = {
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: '' },
        clientX: 500,
        altKey: true,
        currentTarget: {
          getBoundingClientRect: () => ({ left: 0, width: 1000 }),
        },
      }

      drag.onDragOver(e, { id: 2 })

      expect(drag.dropPosition.value).toBe('inside')
    })

    it('should set dropPosition to after at midpoint without alt key', () => {
      const e = {
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: '' },
        clientX: 500, // Exactly 50%
        altKey: false,
        currentTarget: {
          getBoundingClientRect: () => ({ left: 0, width: 1000 }),
        },
      }

      drag.onDragOver(e, { id: 2 })

      expect(drag.dropPosition.value).toBe('after') // 500 >= 500 (50%) = after
    })

    it('should set dropPosition to before for left of center', () => {
      const e = {
        preventDefault: vi.fn(),
        dataTransfer: { dropEffect: '' },
        clientX: 400, // Left of center
        altKey: false,
        currentTarget: {
          getBoundingClientRect: () => ({ left: 0, width: 1000 }),
        },
      }

      drag.onDragOver(e, { id: 2 })

      expect(drag.dropPosition.value).toBe('before')
    })
  })

  describe('onDragLeave', () => {
    it('should clear drop state when leaving target', () => {
      drag.dropTarget.value = { id: 2 }
      drag.dropPosition.value = 'before'

      const e = {
        currentTarget: { contains: () => false },
        relatedTarget: null,
      }

      drag.onDragLeave(e)

      expect(drag.dropTarget.value).toBeNull()
      expect(drag.dropPosition.value).toBeNull()
    })

    it('should not clear when moving to child element', () => {
      const target = { id: 2 }
      drag.dropTarget.value = target
      drag.dropPosition.value = 'before'

      const e = {
        currentTarget: { contains: () => true },
        relatedTarget: document.createElement('div'),
      }

      drag.onDragLeave(e)

      expect(drag.dropTarget.value).toEqual(target)
      expect(drag.dropPosition.value).toBe('before')
    })
  })

  describe('onDrop', () => {
    it('should call onMove when dropping inside', async () => {
      const source = { id: 1, title: 'Source' }
      const target = { id: 2, title: 'Target' }
      drag.draggedNode.value = source
      drag.draggedNodeIds.value = [source.id]
      drag.dropPosition.value = 'inside'

      const e = { preventDefault: vi.fn() }
      await drag.onDrop(e, target)

      expect(onMove).toHaveBeenCalledWith(source, target)
      expect(onReorder).not.toHaveBeenCalled()
    })

    it('should call onReorder when dropping before', async () => {
      const source = { id: 1, title: 'Source' }
      const target = { id: 2, title: 'Target' }
      drag.draggedNode.value = source
      drag.draggedNodeIds.value = [source.id]
      drag.dropPosition.value = 'before'

      const e = { preventDefault: vi.fn() }
      await drag.onDrop(e, target)

      expect(onReorder).toHaveBeenCalledWith(source, target, 'before')
      expect(onMove).not.toHaveBeenCalled()
    })

    it('should call onReorder when dropping after', async () => {
      const source = { id: 1, title: 'Source' }
      const target = { id: 2, title: 'Target' }
      drag.draggedNode.value = source
      drag.draggedNodeIds.value = [source.id]
      drag.dropPosition.value = 'after'

      const e = { preventDefault: vi.fn() }
      await drag.onDrop(e, target)

      expect(onReorder).toHaveBeenCalledWith(source, target, 'after')
    })

    it('should clear drag state after drop', async () => {
      drag.draggedNode.value = { id: 1 }
      drag.draggedNodeIds.value = [1]
      drag.dropTarget.value = { id: 2 }
      drag.dropPosition.value = 'before'

      const e = { preventDefault: vi.fn() }
      await drag.onDrop(e, { id: 2 })

      expect(drag.draggedNode.value).toBeNull()
      expect(drag.dropTarget.value).toBeNull()
      expect(drag.dropPosition.value).toBeNull()
    })

    it('should ignore drop on same node', async () => {
      drag.draggedNode.value = { id: 1 }
      drag.draggedNodeIds.value = [1]

      const e = { preventDefault: vi.fn() }
      await drag.onDrop(e, { id: 1 })

      expect(onMove).not.toHaveBeenCalled()
      expect(onReorder).not.toHaveBeenCalled()
    })

    it('should ignore drop with no dragged node', async () => {
      drag.draggedNode.value = null

      const e = { preventDefault: vi.fn() }
      await drag.onDrop(e, { id: 2 })

      expect(onMove).not.toHaveBeenCalled()
      expect(onReorder).not.toHaveBeenCalled()
    })
  })

  describe('getDropClass', () => {
    it('should return empty object when no drop target', () => {
      expect(drag.getDropClass({ id: 1 })).toEqual({})
    })

    it('should return empty object for non-matching node', () => {
      drag.dropTarget.value = { id: 2 }
      drag.dropPosition.value = 'before'

      expect(drag.getDropClass({ id: 1 })).toEqual({})
    })

    it('should return drop-before class', () => {
      drag.dropTarget.value = { id: 1 }
      drag.dropPosition.value = 'before'

      expect(drag.getDropClass({ id: 1 })).toEqual({
        'drop-before': true,
        'drop-after': false,
        'drop-inside': false,
      })
    })

    it('should return drop-after class', () => {
      drag.dropTarget.value = { id: 1 }
      drag.dropPosition.value = 'after'

      expect(drag.getDropClass({ id: 1 })).toEqual({
        'drop-before': false,
        'drop-after': true,
        'drop-inside': false,
      })
    })

    it('should return drop-inside class', () => {
      drag.dropTarget.value = { id: 1 }
      drag.dropPosition.value = 'inside'

      expect(drag.getDropClass({ id: 1 })).toEqual({
        'drop-before': false,
        'drop-after': false,
        'drop-inside': true,
      })
    })
  })

  describe('multi-select drag', () => {
    it('should drag all selected nodes when dragged node is in selection', () => {
      const selectedIds = { value: new Set([1, 2, 3]) }
      const dragWithSelection = useCardDrag({ onMove, onReorder, selectedIds })

      const node = { id: 2, title: 'Selected Node' }
      const e = createMockDragEvent()

      dragWithSelection.onDragStart(e, node)

      expect(dragWithSelection.draggedNodeIds.value).toEqual([1, 2, 3])
      expect(dragWithSelection.getDragCount()).toBe(3)
    })

    it('should drag only single node when not in selection', () => {
      const selectedIds = { value: new Set([1, 2]) }
      const dragWithSelection = useCardDrag({ onMove, onReorder, selectedIds })

      const node = { id: 3, title: 'Not Selected' }
      const e = createMockDragEvent()

      dragWithSelection.onDragStart(e, node)

      expect(dragWithSelection.draggedNodeIds.value).toEqual([3])
      expect(dragWithSelection.getDragCount()).toBe(1)
    })

    it('should call onMoveMultiple when dropping multiple nodes inside', async () => {
      const onMoveMultiple = vi.fn()
      const selectedIds = { value: new Set([1, 2, 3]) }
      const dragWithSelection = useCardDrag({ onMove, onMoveMultiple, onReorder, selectedIds })

      const source = { id: 1, title: 'Source' }
      const target = { id: 4, title: 'Target' }

      // Simulate starting drag with multi-selection
      dragWithSelection.draggedNode.value = source
      dragWithSelection.draggedNodeIds.value = [1, 2, 3]
      dragWithSelection.dropPosition.value = 'inside'

      const e = { preventDefault: vi.fn() }
      await dragWithSelection.onDrop(e, target)

      expect(onMoveMultiple).toHaveBeenCalledWith([1, 2, 3], target)
      expect(onMove).not.toHaveBeenCalled()
    })

    it('should skip reorder for multi-select drag', async () => {
      const selectedIds = { value: new Set([1, 2]) }
      const dragWithSelection = useCardDrag({ onMove, onReorder, selectedIds })

      dragWithSelection.draggedNode.value = { id: 1 }
      dragWithSelection.draggedNodeIds.value = [1, 2]
      dragWithSelection.dropPosition.value = 'before'

      const e = { preventDefault: vi.fn() }
      await dragWithSelection.onDrop(e, { id: 3 })

      // Multi-select doesn't support reorder
      expect(onReorder).not.toHaveBeenCalled()
      expect(onMove).not.toHaveBeenCalled()
    })

    it('should ignore dragOver on any dragged node', () => {
      const selectedIds = { value: new Set([1, 2, 3]) }
      const dragWithSelection = useCardDrag({ onMove, onReorder, selectedIds })

      dragWithSelection.draggedNode.value = { id: 1 }
      dragWithSelection.draggedNodeIds.value = [1, 2, 3]

      const e = { preventDefault: vi.fn() }
      // Try to drag over node 2 which is in the dragged set
      dragWithSelection.onDragOver(e, { id: 2 })

      expect(e.preventDefault).not.toHaveBeenCalled()
      expect(dragWithSelection.dropTarget.value).toBeNull()
    })
  })

  describe('without callbacks', () => {
    it('should work without onMove callback', async () => {
      const dragNoCallbacks = useCardDrag({})
      dragNoCallbacks.draggedNode.value = { id: 1 }
      dragNoCallbacks.draggedNodeIds.value = [1]
      dragNoCallbacks.dropPosition.value = 'inside'

      const e = { preventDefault: vi.fn() }
      await dragNoCallbacks.onDrop(e, { id: 2 })

      // Should not throw
      expect(dragNoCallbacks.draggedNode.value).toBeNull()
    })

    it('should work without onReorder callback', async () => {
      const dragNoCallbacks = useCardDrag({})
      dragNoCallbacks.draggedNode.value = { id: 1 }
      dragNoCallbacks.draggedNodeIds.value = [1]
      dragNoCallbacks.dropPosition.value = 'before'

      const e = { preventDefault: vi.fn() }
      await dragNoCallbacks.onDrop(e, { id: 2 })

      // Should not throw
      expect(dragNoCallbacks.draggedNode.value).toBeNull()
    })
  })
})
