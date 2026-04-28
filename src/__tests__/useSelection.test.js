import { describe, it, expect, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { useSelection } from '../composables/useSelection.js'

describe('useSelection composable', () => {
  let showDetail, fullscreenDetail, openDetailFullscreen, flatChildren
  let selection

  beforeEach(() => {
    // Setup mock refs
    showDetail = ref(false)
    fullscreenDetail = ref(false)
    openDetailFullscreen = ref(false)
    flatChildren = computed(() => [
      { id: 1, title: 'Node 1' },
      { id: 2, title: 'Node 2' },
      { id: 3, title: 'Node 3' },
      { id: 4, title: 'Node 4' },
      { id: 5, title: 'Node 5' },
    ])

    selection = useSelection({
      showDetail,
      fullscreenDetail,
      openDetailFullscreen,
      flatChildren,
    })
  })

  describe('initial state', () => {
    it('should have null selectedNode', () => {
      expect(selection.selectedNode.value).toBeNull()
    })

    it('should have empty selectedIds', () => {
      expect(selection.selectedIds.value.size).toBe(0)
    })

    it('should have hasSelection as false', () => {
      expect(selection.hasSelection.value).toBe(false)
    })

    it('should have selectionCount as 0', () => {
      expect(selection.selectionCount.value).toBe(0)
    })
  })

  describe('selectNode', () => {
    it('should select a node', () => {
      const node = { id: 1, title: 'Test Node' }
      selection.selectNode(node)

      expect(selection.selectedNode.value).toEqual(node)
      expect(selection.selectedIds.value.has(1)).toBe(true)
      expect(selection.hasSelection.value).toBe(true)
    })

    it('should open detail panel immediately when using immediate option', () => {
      const node = { id: 1, title: 'Test Node' }
      selection.selectNode(node, { immediate: true })

      expect(showDetail.value).toBe(true)
    })

    it('should set anchor node for range selection', () => {
      const node = { id: 1, title: 'Test Node' }
      selection.selectNode(node)

      expect(selection.anchorNode.value).toEqual(node)
    })

    it('should set lastSelectedNode', () => {
      const node = { id: 1, title: 'Test Node' }
      selection.selectNode(node)

      expect(selection.lastSelectedNode.value).toEqual(node)
    })

    it('should deselect when called with null', () => {
      const node = { id: 1, title: 'Test Node' }
      selection.selectNode(node)
      selection.selectNode(null)

      expect(selection.selectedNode.value).toBeNull()
      expect(selection.selectedIds.value.size).toBe(0)
    })

    it('should open fullscreen when option is passed', () => {
      const node = { id: 1, title: 'Test Node' }
      selection.selectNode(node, { fullscreen: true })

      expect(fullscreenDetail.value).toBe(true)
    })

    it('should open fullscreen when preference is enabled', () => {
      openDetailFullscreen.value = true
      const node = { id: 1, title: 'Test Node' }
      selection.selectNode(node)

      expect(fullscreenDetail.value).toBe(true)
    })
  })

  describe('hoverSelectNode', () => {
    it('should update selectedNode on hover', () => {
      const node = { id: 1, title: 'Test Node' }
      selection.hoverSelectNode(node)

      expect(selection.selectedNode.value).toEqual(node)
    })

    it('should not change selection when detail panel is open', () => {
      showDetail.value = true
      const node1 = { id: 1, title: 'Node 1' }
      const node2 = { id: 2, title: 'Node 2' }

      selection.selectNode(node1)
      selection.hoverSelectNode(node2)

      expect(selection.selectedNode.value).toEqual(node1)
    })
  })

  describe('clearSelection', () => {
    it('should clear all selection state', () => {
      const node = { id: 1, title: 'Test Node' }
      selection.selectNode(node)
      selection.clearSelection()

      expect(selection.selectedNode.value).toBeNull()
      expect(selection.selectedIds.value.size).toBe(0)
      expect(selection.anchorNode.value).toBeNull()
    })
  })

  describe('isSelected', () => {
    it('should return true for selected node', () => {
      const node = { id: 1, title: 'Test Node' }
      selection.selectNode(node)

      expect(selection.isSelected(1)).toBe(true)
    })

    it('should return false for non-selected node', () => {
      const node = { id: 1, title: 'Test Node' }
      selection.selectNode(node)

      expect(selection.isSelected(2)).toBe(false)
    })

    it('should return true for node in selectedIds set', () => {
      selection.handleMultiSelect({ node: { id: 1 }, add: true })
      selection.handleMultiSelect({ node: { id: 2 }, add: true })

      expect(selection.isSelected(1)).toBe(true)
      expect(selection.isSelected(2)).toBe(true)
    })
  })

  describe('handleMultiSelect - Ctrl+click (add mode)', () => {
    it('should add node to selection', () => {
      selection.handleMultiSelect({ node: { id: 1 }, add: true })

      expect(selection.selectedIds.value.has(1)).toBe(true)
      expect(selection.selectionCount.value).toBe(1)
    })

    it('should toggle node selection on second click', () => {
      selection.handleMultiSelect({ node: { id: 1 }, add: true })
      selection.handleMultiSelect({ node: { id: 1 }, add: true })

      expect(selection.selectedIds.value.has(1)).toBe(false)
      expect(selection.selectionCount.value).toBe(0)
    })

    it('should allow multiple selections', () => {
      selection.handleMultiSelect({ node: { id: 1 }, add: true })
      selection.handleMultiSelect({ node: { id: 2 }, add: true })
      selection.handleMultiSelect({ node: { id: 3 }, add: true })

      expect(selection.selectionCount.value).toBe(3)
      expect(selection.selectedIds.value.has(1)).toBe(true)
      expect(selection.selectedIds.value.has(2)).toBe(true)
      expect(selection.selectedIds.value.has(3)).toBe(true)
    })

    it('should set anchor on first Ctrl+click', () => {
      const node = { id: 1, title: 'Node 1' }
      selection.handleMultiSelect({ node, add: true })

      expect(selection.anchorNode.value).toEqual(node)
    })

    it('should not auto-open detail panel (requires Enter key)', () => {
      selection.handleMultiSelect({ node: { id: 1 }, add: true })

      // Detail panel only opens via toggleDetailPanel() or explicit immediate: true
      expect(showDetail.value).toBe(false)
    })
  })

  describe('toggleDetailPanel', () => {
    it('should open detail panel when closed', () => {
      selection.selectNode({ id: 1, title: 'Node 1' })
      showDetail.value = false

      selection.toggleDetailPanel()

      expect(showDetail.value).toBe(true)
    })

    it('should close detail panel when open', () => {
      selection.selectNode({ id: 1, title: 'Node 1' })
      showDetail.value = true

      selection.toggleDetailPanel()

      expect(showDetail.value).toBe(false)
    })

    it('should NOT open fullscreen for child leaf node when setting is disabled', () => {
      openDetailFullscreen.value = false
      selection.selectNode({ id: 1, title: 'Leaf Node' }) // no children = leaf, but not current container
      showDetail.value = false
      fullscreenDetail.value = false

      selection.toggleDetailPanel()

      expect(showDetail.value).toBe(true)
      expect(fullscreenDetail.value).toBe(false)
    })

    it('should open fullscreen for leaf node when setting is enabled', () => {
      openDetailFullscreen.value = true
      selection.selectNode({ id: 1, title: 'Leaf Node' }) // no children = leaf
      showDetail.value = false
      fullscreenDetail.value = false

      selection.toggleDetailPanel()

      expect(showDetail.value).toBe(true)
      expect(fullscreenDetail.value).toBe(true)
    })

    it('should NOT open fullscreen for node with children even when setting is enabled', () => {
      openDetailFullscreen.value = true
      selection.selectNode({ id: 1, title: 'Parent Node', children: [{ id: 2 }] })
      showDetail.value = false
      fullscreenDetail.value = false

      selection.toggleDetailPanel()

      expect(showDetail.value).toBe(true)
      expect(fullscreenDetail.value).toBe(false)
    })

    it('should close fullscreen when closing detail panel', () => {
      selection.selectNode({ id: 1, title: 'Node 1' })
      showDetail.value = true
      fullscreenDetail.value = true

      selection.toggleDetailPanel()

      expect(showDetail.value).toBe(false)
      expect(fullscreenDetail.value).toBe(false)
    })
  })

  describe('handleMultiSelect - Shift+click (range mode)', () => {
    it('should select range from anchor to clicked node', () => {
      // Set anchor first
      selection.selectNode({ id: 2, title: 'Node 2' })

      // Shift+click on node 4
      selection.handleMultiSelect({ node: { id: 4 }, range: true })

      // Should select nodes 2, 3, 4
      expect(selection.selectedIds.value.has(2)).toBe(true)
      expect(selection.selectedIds.value.has(3)).toBe(true)
      expect(selection.selectedIds.value.has(4)).toBe(true)
      expect(selection.selectedIds.value.has(1)).toBe(false)
      expect(selection.selectedIds.value.has(5)).toBe(false)
    })

    it('should work in reverse direction', () => {
      // Set anchor at node 4
      selection.selectNode({ id: 4, title: 'Node 4' })

      // Shift+click on node 2
      selection.handleMultiSelect({ node: { id: 2 }, range: true })

      // Should select nodes 2, 3, 4
      expect(selection.selectionCount.value).toBe(3)
      expect(selection.selectedIds.value.has(2)).toBe(true)
      expect(selection.selectedIds.value.has(3)).toBe(true)
      expect(selection.selectedIds.value.has(4)).toBe(true)
    })

    it('should select single node if no anchor', () => {
      selection.handleMultiSelect({ node: { id: 3 }, range: true })

      expect(selection.selectionCount.value).toBe(1)
      expect(selection.selectedIds.value.has(3)).toBe(true)
    })
  })

  describe('updateSelectedNode', () => {
    it('should update selected node data', () => {
      selection.selectNode({ id: 1, title: 'Old Title' })
      selection.updateSelectedNode({ id: 1, title: 'New Title' })

      expect(selection.selectedNode.value.title).toBe('New Title')
    })

    it('should not update if different node', () => {
      selection.selectNode({ id: 1, title: 'Node 1' })
      selection.updateSelectedNode({ id: 2, title: 'Node 2' })

      expect(selection.selectedNode.value.title).toBe('Node 1')
    })
  })

  describe('removeFromSelection', () => {
    it('should remove node from selectedIds', () => {
      selection.handleMultiSelect({ node: { id: 1 }, add: true })
      selection.handleMultiSelect({ node: { id: 2 }, add: true })
      selection.removeFromSelection(1)

      expect(selection.selectedIds.value.has(1)).toBe(false)
      expect(selection.selectedIds.value.has(2)).toBe(true)
    })

    it('should clear selectedNode if it matches', () => {
      selection.selectNode({ id: 1, title: 'Node 1' })
      selection.removeFromSelection(1)

      expect(selection.selectedNode.value).toBeNull()
    })

    it('should clear anchor if it matches', () => {
      selection.selectNode({ id: 1, title: 'Node 1' })
      expect(selection.anchorNode.value.id).toBe(1)

      selection.removeFromSelection(1)
      expect(selection.anchorNode.value).toBeNull()
    })
  })

  describe('without dependencies', () => {
    it('should work without showDetail ref', () => {
      const sel = useSelection({})
      sel.selectNode({ id: 1, title: 'Test' })

      expect(sel.selectedNode.value.id).toBe(1)
    })

    it('should work without flatChildren for simple selection', () => {
      const sel = useSelection({ showDetail: ref(false) })
      sel.selectNode({ id: 1, title: 'Test' })

      expect(sel.selectedNode.value.id).toBe(1)
    })
  })

  describe('pin-protected selection (App.vue pattern)', () => {
    // Tests the wrapper pattern used in App.vue to prevent deselection when pinned
    let detailPinned
    let sel
    let wrappedSelectNode

    beforeEach(() => {
      detailPinned = ref(false)
      sel = useSelection({
        showDetail: ref(false),
        fullscreenDetail: ref(false),
        openDetailFullscreen: ref(false),
        flatChildren: computed(() => []),
      })

      // Recreate the wrapper pattern used in App.vue
      wrappedSelectNode = (node, options = {}) => {
        if (!node && detailPinned.value) {
          return
        }
        sel.selectNode(node, options)
      }
    })

    it('should allow deselection when not pinned', () => {
      const node = { id: 1, title: 'Test Node' }
      wrappedSelectNode(node)
      expect(sel.selectedNode.value).toEqual(node)

      wrappedSelectNode(null)
      expect(sel.selectedNode.value).toBeNull()
    })

    it('should prevent deselection when pinned', () => {
      const node = { id: 1, title: 'Test Node' }
      wrappedSelectNode(node)
      expect(sel.selectedNode.value).toEqual(node)

      detailPinned.value = true
      wrappedSelectNode(null)

      // Selection should remain because detail is pinned
      expect(sel.selectedNode.value).toEqual(node)
    })

    it('should allow selecting a different node when pinned', () => {
      const node1 = { id: 1, title: 'Node 1' }
      const node2 = { id: 2, title: 'Node 2' }

      wrappedSelectNode(node1)
      detailPinned.value = true
      wrappedSelectNode(node2)

      // Selecting a new node should work even when pinned
      expect(sel.selectedNode.value).toEqual(node2)
    })

    it('should allow deselection again after unpinning', () => {
      const node = { id: 1, title: 'Test Node' }
      wrappedSelectNode(node)
      detailPinned.value = true

      wrappedSelectNode(null)
      expect(sel.selectedNode.value).toEqual(node) // Still selected

      detailPinned.value = false
      wrappedSelectNode(null)
      expect(sel.selectedNode.value).toBeNull() // Now deselected
    })
  })
})
