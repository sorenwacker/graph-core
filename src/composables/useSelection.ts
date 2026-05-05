import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { NARROW_WINDOW_THRESHOLD } from '../utils/uiConstants.js'
import type { Node, TreeNode } from '../types'

/**
 * Options for useSelection composable.
 */
export interface UseSelectionOptions {
  /** Ref controlling detail panel visibility */
  showDetail?: Ref<boolean>
  /** Ref controlling fullscreen detail mode */
  fullscreenDetail?: Ref<boolean>
  /** Ref for fullscreen preference setting */
  openDetailFullscreen?: Ref<boolean>
  /** Computed ref of flattened children for range selection */
  flatChildren?: ComputedRef<TreeNode[]>
  /** Ref to current container node (for Enter when nothing selected) */
  currentContainer?: Ref<Node | null>
  /** Function to fetch a node by ID */
  getNode?: (id: number | string) => Promise<Node>
  /** Error handler function */
  onError?: (error: Error, options?: { context?: string }) => void
}

/**
 * Options for selectNode function.
 */
export interface SelectNodeOptions {
  /** Open in fullscreen mode */
  fullscreen?: boolean
  /** Open detail immediately */
  immediate?: boolean
}

/**
 * Options for toggleDetailPanel function.
 */
export interface ToggleDetailPanelOptions {
  /** If true, open in side panel (non-fullscreen) */
  detached?: boolean
}

/**
 * Parameters for handleMultiSelect function.
 */
export interface MultiSelectParams {
  /** The clicked node (for single node operations) */
  node?: Node | TreeNode
  /** Array of nodes (for box selection) */
  nodes?: (Node | TreeNode)[]
  /** Array of node IDs (for box selection) */
  nodeIds?: number[]
  /** Ctrl/Cmd+click mode (toggle selection) */
  add?: boolean
  /** Shift+click mode (range selection) */
  range?: boolean
}

/**
 * Return type for useSelection composable.
 */
export interface UseSelectionReturn {
  // State
  selectedNode: Ref<Node | TreeNode | null>
  selectedIds: Ref<Set<number>>
  lastSelectedNode: Ref<Node | TreeNode | null>
  anchorNode: Ref<Node | TreeNode | null>

  // Computed
  hasSelection: ComputedRef<boolean>
  selectionCount: ComputedRef<number>

  // Functions
  isSelected: (nodeId: number) => boolean
  clearSelection: () => void
  hoverSelectNode: (node: Node | TreeNode) => void
  selectNode: (node: Node | TreeNode | null, options?: SelectNodeOptions) => void
  cancelDetailOpen: () => void
  handleMultiSelect: (params: MultiSelectParams) => void
  updateSelectedNode: (updatedNode: Node | TreeNode) => void
  removeFromSelection: (nodeId: number) => void
  toggleDetailPanel: (options?: ToggleDetailPanelOptions) => void
  selectChildById: (nodeId: number | string, options?: SelectNodeOptions) => Promise<void>
  openNodeFullscreen: (nodeId: number | string) => void
  selectAll: () => void
}

/**
 * Composable for managing node selection state and operations.
 * Handles single selection, multi-selection (Ctrl+click), and range selection (Shift+click).
 *
 * @param options - Configuration options
 * @returns Selection state and functions
 */
export function useSelection({
  showDetail,
  fullscreenDetail,
  openDetailFullscreen,
  flatChildren,
  currentContainer,
  getNode,
  onError,
}: UseSelectionOptions = {}): UseSelectionReturn {
  // Core selection state
  const selectedNode = ref<Node | TreeNode | null>(null)
  const selectedIds = ref<Set<number>>(new Set())
  const lastSelectedNode = ref<Node | TreeNode | null>(null)
  const anchorNode = ref<Node | TreeNode | null>(null)

  /**
   * Check if a node is currently selected.
   * @param nodeId - Node ID to check
   * @returns true if the node is selected
   */
  function isSelected(nodeId: number): boolean {
    return selectedIds.value.has(nodeId) || selectedNode.value?.id === nodeId
  }

  /**
   * Clear all selection state.
   */
  function clearSelection(): void {
    selectedNode.value = null
    selectedIds.value = new Set()
    anchorNode.value = null
  }

  /**
   * Light select for hover - updates selectedNode without opening detail panel.
   * Only works when detail panel is not showing.
   * @param node - Node to hover-select
   */
  function hoverSelectNode(node: Node | TreeNode): void {
    if (showDetail?.value) return
    selectedNode.value = node
  }

  /**
   * Full select - selects a node. Detail panel opens only on Enter or explicit request.
   * Auto-opens fullscreen if window is narrow (< NARROW_WINDOW_THRESHOLD).
   * @param node - Node to select, or null to deselect
   * @param options - Selection options
   */
  function selectNode(node: Node | TreeNode | null, options: SelectNodeOptions = {}): void {
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
    // But only for leaf nodes (nodes without children) - non-leaf nodes should be navigated into
    const isNarrowWindow = typeof window !== 'undefined' && window.innerWidth < NARROW_WINDOW_THRESHOLD
    const treeNode = node as TreeNode
    const hasChildren = treeNode.children && treeNode.children.length > 0
    if (fullscreenDetail && !hasChildren && (options.fullscreen || openDetailFullscreen?.value || isNarrowWindow)) {
      if (showDetail) showDetail.value = true
      fullscreenDetail.value = true
    }
  }

  /**
   * Cancel pending detail panel opening (no-op, kept for API compatibility).
   */
  function cancelDetailOpen(): void {
    // No-op - detail panel no longer auto-opens on selection
  }

  /**
   * Handle multi-selection with Ctrl+click (toggle), Shift+click (range), or box selection.
   * @param params - Multi-select parameters
   */
  function handleMultiSelect({ node, nodes, nodeIds, add, range }: MultiSelectParams): void {
    // Box selection - set all selected nodes at once
    if (nodeIds && nodeIds.length > 0) {
      selectedIds.value = new Set(nodeIds)
      if (nodes && nodes.length > 0) {
        selectedNode.value = nodes[0]
        anchorNode.value = nodes[0]
      }
      return
    }

    if (!node) return

    if (add) {
      // Ctrl/Cmd+click: toggle selection
      const newSet = new Set(selectedIds.value)
      if (newSet.has(node.id)) {
        newSet.delete(node.id)
        // If we removed the anchor, set new anchor to remaining selection
        if (anchorNode.value?.id === node.id) {
          anchorNode.value = newSet.size > 0 ? (flatChildren?.value?.find(n => newSet.has(n.id)) ?? null) : null
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
   * Update the selected node data (e.g., after an API refresh).
   * @param updatedNode - Updated node data
   */
  function updateSelectedNode(updatedNode: Node | TreeNode): void {
    if (selectedNode.value?.id === updatedNode?.id) {
      selectedNode.value = updatedNode
    }
  }

  /**
   * Remove a node from selection (e.g., after deletion).
   * @param nodeId - Node ID to remove
   */
  function removeFromSelection(nodeId: number): void {
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
   * Toggle detail panel visibility (for Enter key shortcut).
   * Opens in fullscreen if the node has no children (unless detached mode).
   * @param options - Toggle options
   */
  function toggleDetailPanel(options: ToggleDetailPanelOptions = {}): void {
    const { detached = false } = options

    if (showDetail?.value) {
      showDetail.value = false
      if (fullscreenDetail) fullscreenDetail.value = false
    } else if (showDetail) {
      // If nothing selected, select the current container
      const nodeToShow = selectedNode.value || currentContainer?.value
      if (nodeToShow) {
        if (!selectedNode.value) {
          selectedNode.value = nodeToShow
          selectedIds.value = new Set([nodeToShow.id])
        }
        showDetail.value = true
        // Open fullscreen only if:
        // - Node is the current container (root being viewed), OR
        // - Setting is enabled, OR
        // - Window is narrow
        // But only for leaf nodes (no children)
        if (!detached && fullscreenDetail) {
          const treeNode = nodeToShow as TreeNode
          const hasChildren = treeNode.children && treeNode.children.length > 0
          const isCurrentContainer = currentContainer?.value?.id === nodeToShow.id
          const isNarrowWindow = typeof window !== 'undefined' && window.innerWidth < NARROW_WINDOW_THRESHOLD
          if (!hasChildren && (isCurrentContainer || openDetailFullscreen?.value || isNarrowWindow)) {
            fullscreenDetail.value = true
          }
        }
      }
    }
  }

  /**
   * Select a node by ID, fetching it first if needed.
   * @param nodeId - Node ID to select
   * @param options - Selection options
   */
  async function selectChildById(nodeId: number | string, options: SelectNodeOptions = {}): Promise<void> {
    if (!getNode) return
    try {
      const node = await getNode(nodeId)
      selectNode(node, options)
    } catch (err) {
      if (onError) onError(err as Error, { context: 'Selecting child' })
    }
  }

  /**
   * Open a node in fullscreen detail view.
   * @param nodeId - Node ID to open
   */
  function openNodeFullscreen(nodeId: number | string): void {
    selectChildById(nodeId, { fullscreen: true })
  }

  /**
   * Select all nodes in flatChildren.
   */
  function selectAll(): void {
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
