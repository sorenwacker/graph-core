import { ref, computed } from 'vue'
import { NARROW_WINDOW_THRESHOLD } from '../utils/uiConstants.js'

/**
 * Composable for managing node selection state and operations.
 * Handles single selection, multi-selection (Ctrl+click), and range selection (Shift+click).
 *
 * @param {Object} options - Configuration options
 * @param {Ref<boolean>} options.showDetail - Ref controlling detail panel visibility
 * @param {Ref<boolean>} options.fullscreenDetail - Ref controlling fullscreen detail mode
 * @param {Ref<boolean>} options.openDetailFullscreen - Ref for fullscreen preference setting
 * @param {ComputedRef<Array>} options.flatChildren - Computed ref of flattened children for range selection
 * @param {Ref<Object>} options.currentContainer - Ref to current container node (for Enter when nothing selected)
 * @param {Function} options.getNode - Function to fetch a node by ID (optional, for selectChildById)
 * @param {Function} options.onError - Error handler function (optional)
 * @returns {Object} Selection state and functions
 */
export function useSelection({
  showDetail,
  fullscreenDetail,
  openDetailFullscreen,
  flatChildren,
  currentContainer,
  getNode,
  onError,
} = {}) {
  // Core selection state
  const selectedNode = ref(null)
  const selectedIds = ref(new Set())
  const lastSelectedNode = ref(null)
  const anchorNode = ref(null)

  /**
   * Check if a node is currently selected
   * @param {number} nodeId - Node ID to check
   * @returns {boolean}
   */
  function isSelected(nodeId) {
    return selectedIds.value.has(nodeId) || selectedNode.value?.id === nodeId
  }

  /**
   * Clear all selection state
   */
  function clearSelection() {
    selectedNode.value = null
    selectedIds.value = new Set()
    anchorNode.value = null
  }

  /**
   * Light select for hover - updates selectedNode without opening detail panel.
   * Only works when detail panel is not showing.
   * @param {Object} node - Node to hover-select
   */
  function hoverSelectNode(node) {
    if (showDetail?.value) return
    selectedNode.value = node
  }

  /**
   * Full select - selects a node. Detail panel opens only on Enter or explicit request.
   * Auto-opens fullscreen if window is narrow (< NARROW_WINDOW_THRESHOLD).
   * @param {Object|null} node - Node to select, or null to deselect
   * @param {Object} options - Selection options
   * @param {boolean} options.fullscreen - Open in fullscreen mode
   * @param {boolean} options.immediate - Open detail immediately
   */
  function selectNode(node, options = {}) {
    // Handle deselection when node is null
    if (!node) {
      selectedNode.value = null
      selectedIds.value = new Set()
      // Detail panel will close via watcher if not pinned
      return
    }

    selectedNode.value = node
    lastSelectedNode.value = node
    anchorNode.value = node // Set anchor for shift+click range selection
    selectedIds.value = new Set([node.id])

    // Only open detail panel if explicitly requested (Enter key, fullscreen, etc.)
    if (options.immediate && showDetail) {
      showDetail.value = true
    }

    // Open fullscreen if explicitly requested OR if setting is enabled OR window is narrow
    const isNarrowWindow = typeof window !== 'undefined' && window.innerWidth < NARROW_WINDOW_THRESHOLD
    if (fullscreenDetail && (options.fullscreen || openDetailFullscreen?.value || isNarrowWindow)) {
      if (showDetail) showDetail.value = true
      fullscreenDetail.value = true
    }
  }

  /**
   * Cancel pending detail panel opening (no-op, kept for API compatibility)
   */
  function cancelDetailOpen() {
    // No-op - detail panel no longer auto-opens on selection
  }

  /**
   * Handle multi-selection with Ctrl+click (toggle), Shift+click (range), or box selection.
   * @param {Object} params - Multi-select parameters
   * @param {Object} params.node - The clicked node (for single node operations)
   * @param {Array} params.nodes - Array of nodes (for box selection)
   * @param {Array} params.nodeIds - Array of node IDs (for box selection)
   * @param {boolean} params.add - Ctrl/Cmd+click mode (toggle selection)
   * @param {boolean} params.range - Shift+click mode (range selection)
   */
  function handleMultiSelect({ node, nodes, nodeIds, add, range }) {
    // Box selection - set all selected nodes at once
    if (nodeIds && nodeIds.length > 0) {
      selectedIds.value = new Set(nodeIds)
      if (nodes && nodes.length > 0) {
        selectedNode.value = nodes[0]
        anchorNode.value = nodes[0]
      }
      return
    }

    if (add) {
      // Ctrl/Cmd+click: toggle selection
      const newSet = new Set(selectedIds.value)
      if (newSet.has(node.id)) {
        newSet.delete(node.id)
        // If we removed the anchor, set new anchor to remaining selection
        if (anchorNode.value?.id === node.id) {
          anchorNode.value = newSet.size > 0 ? flatChildren?.value?.find(n => newSet.has(n.id)) : null
        }
      } else {
        newSet.add(node.id)
        // First Ctrl+click sets the anchor
        if (!anchorNode.value) {
          anchorNode.value = node
        }
      }
      selectedIds.value = newSet
      selectedNode.value = node
      lastSelectedNode.value = node
    } else if (range) {
      // Shift+click: range selection from anchor (like Finder)
      const anchor = anchorNode.value || lastSelectedNode.value
      if (anchor && flatChildren?.value) {
        const allNodes = flatChildren.value
        const anchorIdx = allNodes.findIndex(n => n.id === anchor.id)
        const currIdx = allNodes.findIndex(n => n.id === node.id)
        if (anchorIdx !== -1 && currIdx !== -1) {
          const start = Math.min(anchorIdx, currIdx)
          const end = Math.max(anchorIdx, currIdx)
          const rangeIds = allNodes.slice(start, end + 1).map(n => n.id)
          // Replace selection with range (Finder behavior)
          selectedIds.value = new Set(rangeIds)
        }
      } else {
        // No anchor, just select clicked node
        selectedIds.value = new Set([node.id])
        anchorNode.value = node
      }
      selectedNode.value = node
      // Don't update lastSelectedNode on shift+click to preserve anchor
    }
  }

  /**
   * Update the selected node data (e.g., after an API refresh)
   * @param {Object} updatedNode - Updated node data
   */
  function updateSelectedNode(updatedNode) {
    if (selectedNode.value?.id === updatedNode?.id) {
      selectedNode.value = updatedNode
    }
  }

  /**
   * Remove a node from selection (e.g., after deletion)
   * @param {number} nodeId - Node ID to remove
   */
  function removeFromSelection(nodeId) {
    if (selectedNode.value?.id === nodeId) {
      selectedNode.value = null
    }
    selectedIds.value.delete(nodeId)
    if (anchorNode.value?.id === nodeId) {
      anchorNode.value = null
    }
    if (lastSelectedNode.value?.id === nodeId) {
      lastSelectedNode.value = null
    }
  }

  /**
   * Toggle detail panel visibility (for Enter key shortcut)
   * Opens in fullscreen if the node has no children (unless detached mode)
   * @param {Object} options - Options
   * @param {boolean} options.detached - If true, open in side panel (non-fullscreen)
   */
  function toggleDetailPanel(options = {}) {
    const { detached = false } = options

    if (showDetail?.value) {
      showDetail.value = false
      if (fullscreenDetail) fullscreenDetail.value = false
    } else {
      // If nothing selected, select the current container
      const nodeToShow = selectedNode.value || currentContainer?.value
      if (nodeToShow) {
        if (!selectedNode.value) {
          selectedNode.value = nodeToShow
          selectedIds.value = new Set([nodeToShow.id])
        }
        showDetail.value = true
        // Open fullscreen if node has no children (unless detached mode)
        if (!detached && fullscreenDetail) {
          const hasChildren = nodeToShow.children?.length > 0
          if (!hasChildren) {
            fullscreenDetail.value = true
          }
        }
      }
    }
  }

  /**
   * Select a node by ID, fetching it first if needed
   * @param {number|string} nodeId - Node ID to select
   * @param {Object} options - Selection options (e.g., { fullscreen: true })
   */
  async function selectChildById(nodeId, options = {}) {
    if (!getNode) return
    try {
      const node = await getNode(nodeId)
      selectNode(node, options)
    } catch (err) {
      if (onError) onError(err, { context: 'Selecting child' })
    }
  }

  /**
   * Open a node in fullscreen detail view
   * @param {number|string} nodeId - Node ID to open
   */
  function openNodeFullscreen(nodeId) {
    selectChildById(nodeId, { fullscreen: true })
  }

  /**
   * Select all nodes in flatChildren
   */
  function selectAll() {
    if (flatChildren?.value) {
      selectedIds.value = new Set(flatChildren.value.map(n => n.id))
    }
  }

  return {
    // State
    selectedNode,
    selectedIds,
    lastSelectedNode,
    anchorNode,

    // Computed
    hasSelection: computed(() => selectedNode.value !== null),
    selectionCount: computed(() => selectedIds.value.size),

    // Functions
    isSelected,
    clearSelection,
    hoverSelectNode,
    selectNode,
    cancelDetailOpen,
    handleMultiSelect,
    updateSelectedNode,
    removeFromSelection,
    toggleDetailPanel,
    selectChildById,
    openNodeFullscreen,
    selectAll,
  }
}
