import { OllamaImproveNotesCommand, ReorderCommand } from '../commands/index.js'
import { useAppContext } from './useAppContext'
import type { Ref } from 'vue'
import type { Api, Node, Command, NodeType } from '../types'
import type {
  NodeOperations,
  CreateNodeParams,
  DeleteResult,
  DeleteMultipleResult,
  MoveNodeParams,
  MoveMultipleParams,
} from './useAppContext'

/**
 * Options for useNodeActionsUI composable.
 */
export interface UseNodeActionsUIOptions {
  /** Node operations composable (from useNodeOperations) */
  nodeOps: NodeOperations
  /** Push undo/redo command (from useUndoRedo) */
  pushCommand: (command: Command) => void
  /** Get workspace ID for node type */
  getWorkspaceIdForNode: (type: string) => number | null | undefined
}

/**
 * Parameters for wrapping a node with a parent.
 */
export interface WrapWithParentParams {
  /** ID of the node to wrap */
  nodeId: number
  /** Title for the new parent group */
  parentTitle: string
}

/**
 * Parameters for adding a child node.
 */
export interface AddChildNodeParams {
  /** Parent node ID */
  parentId: number
  /** Child node title */
  title: string
  /** Child node type */
  type?: NodeType | string
  /** X position (optional, for graph view) */
  x?: number
  /** Y position (optional, for graph view) */
  y?: number
}

/**
 * Parameters for reordering a node.
 */
export interface ReorderParams {
  /** ID of the node to reorder */
  nodeId: number
  /** ID of the target node */
  targetId: number
  /** Position relative to target */
  position: 'before' | 'after' | 'inside'
}

/**
 * Parameters for linking nodes from graph.
 */
export interface LinkNodesParams {
  /** Source node ID */
  sourceId: number
  /** Target node ID */
  targetId: number
}

/**
 * Payload for AI-improved notes.
 */
export interface AIImproveNotesPayload {
  /** Node ID */
  nodeId: number
  /** Original notes content */
  oldNotes: string
  /** Improved notes content */
  newNotes: string
  /** Prompt used for improvement */
  prompt: string
  /** Selection range for partial replacement */
  selectionRange?: { from: number; to: number }
  /** Full notes content (for selection range context) */
  fullNotes?: string
}

/**
 * Options for refreshing after changes.
 */
export interface RefreshOptions {
  /** Whether to refresh sidebar */
  sidebar?: boolean
  /** Whether to refresh recent items */
  recent?: boolean
}

/**
 * Return type for useNodeActionsUI composable.
 */
export interface UseNodeActionsUIReturn {
  /** Add a child node to a parent */
  addChildNode: (params: AddChildNodeParams) => Promise<Node | null>
  /** Clear selection state after delete operations */
  clearSelectionAfterDelete: () => void
  /** Delete a node with UI state management */
  deleteNode: (nodeId: number) => Promise<void>
  /** Delete multiple nodes with UI state management */
  deleteMultipleNodes: (nodeIds: number[]) => Promise<void>
  /** Delete selected nodes (for keyboard shortcut) */
  deleteSelectedNodes: () => Promise<void>
  /** Wrap a node with a new parent group */
  wrapWithParent: (params: WrapWithParentParams) => Promise<void>
  /** Move a node with UI state updates */
  moveNode: (params: MoveNodeParams) => Promise<void>
  /** Move multiple nodes with UI state updates */
  moveMultipleNodes: (params: MoveMultipleParams) => Promise<void>
  /** Move a node to root level */
  moveNodeToRoot: (nodeId: number) => Promise<void>
  /** Toggle node completion with view updates */
  toggleComplete: (node: Node) => Promise<boolean>
  /** Toggle node favorite with data reload */
  toggleFavorite: (node: Node) => Promise<boolean>
  /** Link nodes from graph view with refresh */
  linkNodesFromGraph: (params: LinkNodesParams) => Promise<void>
  /** Unlink nodes from graph view with refresh */
  unlinkNodesFromGraph: (params: LinkNodesParams) => Promise<void>
  /** Handle AI-improved notes from DetailPanel */
  handleAIImproveNotes: (payload: AIImproveNotesPayload) => Promise<void>
  /** Handle reorder of a node (for drag-and-drop) */
  handleReorder: (params: ReorderParams) => Promise<void>
  /** Update a node with full UI refresh */
  updateNode: (updatedNode: Partial<Node> & { id: number }, trackUndo?: boolean) => Promise<boolean>
  /** Clear all selection state */
  clearSelection: () => void
}

/**
 * ViewRenderer component ref interface.
 */
interface ViewRendererRef {
  loadTasks?: () => void | Promise<void>
  [key: string]: unknown
}

/**
 * Composable for node actions that require UI state management.
 * Wraps core node operations with selection, navigation, and refresh logic.
 *
 * Uses the app context for shared state and functions, reducing parameter count.
 *
 * @param options - Configuration options
 * @returns Node action handlers with UI management
 */
export function useNodeActionsUI({
  nodeOps,
  pushCommand,
  getWorkspaceIdForNode,
}: UseNodeActionsUIOptions): UseNodeActionsUIReturn {
  // Get shared state and functions from app context
  const {
    api,
    selectedNode,
    selectedIds,
    showDetail,
    currentContainerId,
    breadcrumbs,
    children,
    expandedIds,
    flatChildren,
    viewRendererRef,
    error,
    enterContainer,
    navigateBack,
    refreshAfterChange,
    refreshAfterDelete,
    refreshGraphAfterStructureChange,
    refreshDetailPanelLinks,
    loadSidebarTree,
    loadFavorites,
    loadChildren,
    invalidateSidebarCache,
    loadRecentItems,
    loadTags,
  } = useAppContext()

  /**
   * Clear selection state after delete operations.
   */
  function clearSelectionAfterDelete(): void {
    showDetail.value = false
    selectedNode.value = null
  }

  /**
   * Delete a node with UI state management.
   */
  async function deleteNode(nodeId: number): Promise<void> {
    const node = await api.getNode(nodeId)
    if (!node) return

    const descendants = (await api.getDescendants(nodeId)) || []
    const allIds = new Set([node, ...descendants].map(n => String(n.id)))
    const needsNavigation =
      allIds.has(String(currentContainerId.value)) || breadcrumbs.value.some(b => allIds.has(String(b.id)))

    const result = await nodeOps.deleteNode(nodeId)
    if (result.success) {
      clearSelectionAfterDelete()
      if (needsNavigation) {
        if (node.parent_id) {
          await enterContainer({ id: node.parent_id } as Node)
        } else {
          currentContainerId.value = null
          breadcrumbs.value = []
        }
      }
      await refreshAfterDelete()
    }
  }

  /**
   * Delete multiple nodes with UI state management.
   */
  async function deleteMultipleNodes(nodeIds: number[]): Promise<void> {
    if (!nodeIds || nodeIds.length === 0) return
    if (nodeIds.length > 1 && !confirm(`Delete ${nodeIds.length} nodes? (Cmd+Z to undo)`)) return

    const nodeIdSet = new Set(nodeIds.map(String))
    const needsNavigation =
      nodeIdSet.has(String(currentContainerId.value)) || breadcrumbs.value.some(b => nodeIdSet.has(String(b.id)))

    const result = await nodeOps.deleteMultipleNodes(nodeIds)
    if (result.success) {
      clearSelectionAfterDelete()
      if (needsNavigation) {
        navigateBack()
      }
      await refreshAfterDelete()
    }
  }

  /**
   * Wrap a node with a new parent group.
   */
  async function wrapWithParent({ nodeId, parentTitle }: WrapWithParentParams): Promise<void> {
    try {
      const node = await api.getNode(nodeId)
      if (!node) {
        throw new Error('Node not found')
      }

      // Create new parent at same level as current node
      const newParent = await api.createNode({
        title: parentTitle,
        type: 'group' as NodeType,
        parent_id: node.parent_id,
        workspace_id: getWorkspaceIdForNode('group'),
      })
      if (!newParent || !newParent.id) {
        throw new Error('Failed to create parent node')
      }

      // Move current node under new parent
      await api.moveNode(nodeId, newParent.id)
      await refreshAfterChange()
      await refreshGraphAfterStructureChange()

      // Refresh selected node if it was the wrapped node
      if (selectedNode.value?.id === nodeId) {
        const updatedNode = flatChildren.value.find(n => n.id === nodeId)
        if (updatedNode) {
          selectedNode.value = updatedNode
        }
      }
    } catch (e) {
      console.error('Failed to wrap with parent:', e)
      throw e
    }
  }

  /**
   * Move a node with UI state updates.
   */
  async function moveNode({ nodeId, oldParentId, newParentId }: MoveNodeParams): Promise<void> {
    const success = await nodeOps.moveNode({ nodeId, oldParentId, newParentId })
    if (success) {
      if (newParentId) expandedIds.value.add(newParentId)
      await refreshAfterChange()
      await refreshGraphAfterStructureChange()
    }
  }

  /**
   * Move multiple nodes with UI state updates.
   */
  async function moveMultipleNodes({ nodeIds, newParentId }: MoveMultipleParams): Promise<void> {
    const success = await nodeOps.moveMultipleNodes({ nodeIds, newParentId })
    if (success) {
      if (newParentId) expandedIds.value.add(newParentId)
      await refreshAfterChange()
      await refreshGraphAfterStructureChange()
      selectedIds.value.clear()
    }
  }

  /**
   * Move a node to root level.
   */
  async function moveNodeToRoot(nodeId: number): Promise<void> {
    const success = await nodeOps.moveNodeToRoot(nodeId)
    if (success) {
      await refreshAfterChange()
      await refreshGraphAfterStructureChange()
    }
  }

  /**
   * Toggle node completion with view updates.
   */
  async function toggleComplete(node: Node): Promise<boolean> {
    const success = await nodeOps.toggleComplete(node)
    if (success) {
      await loadChildren(currentContainerId.value, { silent: true })
      ;(viewRendererRef.value as ViewRendererRef)?.loadTasks?.()
    }
    return success
  }

  /**
   * Toggle node favorite with data reload.
   */
  async function toggleFavorite(node: Node): Promise<boolean> {
    const success = await nodeOps.toggleFavorite(node)
    if (success) {
      await loadChildren(currentContainerId.value, { silent: true })
      await loadFavorites()
    }
    return success
  }

  /**
   * Link nodes from graph view with refresh.
   */
  async function linkNodesFromGraph({ sourceId, targetId }: LinkNodesParams): Promise<void> {
    const success = await nodeOps.linkNodes(sourceId, targetId)
    if (success) {
      await refreshGraphAfterStructureChange()
      await refreshDetailPanelLinks(sourceId, targetId)
    }
  }

  /**
   * Unlink nodes from graph view with refresh.
   */
  async function unlinkNodesFromGraph({ sourceId, targetId }: LinkNodesParams): Promise<void> {
    const success = await nodeOps.unlinkNodes(sourceId, targetId)
    if (success) {
      await refreshGraphAfterStructureChange()
      await refreshDetailPanelLinks(sourceId, targetId)
    }
  }

  /**
   * Handle AI-improved notes from DetailPanel.
   */
  async function handleAIImproveNotes(payload: AIImproveNotesPayload): Promise<void> {
    const { nodeId, oldNotes, newNotes, prompt, selectionRange, fullNotes } = payload
    const currentFullNotes = fullNotes ?? ''

    let finalOldNotes: string
    let finalNewNotes: string
    if (selectionRange) {
      finalOldNotes = currentFullNotes
      finalNewNotes =
        currentFullNotes.slice(0, selectionRange.from) + newNotes + currentFullNotes.slice(selectionRange.to)
    } else {
      finalOldNotes = oldNotes
      finalNewNotes = newNotes
    }

    const command = new OllamaImproveNotesCommand({
      nodeId,
      oldNotes: finalOldNotes,
      newNotes: finalNewNotes,
      prompt,
    })
    await command.execute(api)
    pushCommand(command)

    if (selectedNode.value && selectedNode.value.id === nodeId) {
      selectedNode.value = { ...selectedNode.value, notes: finalNewNotes }
    }
  }

  /**
   * Update a node with full UI refresh.
   */
  async function updateNode(updatedNode: Partial<Node> & { id: number }, trackUndo: boolean = true): Promise<boolean> {
    try {
      const success = await nodeOps.updateNode(updatedNode, { trackUndo })
      if (success) {
        await loadChildren(currentContainerId.value, { silent: true })
        invalidateSidebarCache()
        await loadSidebarTree()
        await Promise.all([loadRecentItems(), loadFavorites(), loadTags()])
      }
      return success
    } catch (e) {
      console.error('updateNode failed:', e)
      throw e
    }
  }

  /**
   * Add a child node to a parent.
   */
  async function addChildNode({ parentId, title, type, x, y }: AddChildNodeParams): Promise<Node | null> {
    const newNode = await nodeOps.createNode({ title, type, parentId, x, y })
    if (newNode) {
      expandedIds.value.add(parentId)
      await refreshAfterChange({ sidebar: false, recent: false })
    }
    return newNode
  }

  /**
   * Handle reorder of a node (for drag-and-drop).
   */
  async function handleReorder({ nodeId, targetId, position }: ReorderParams): Promise<void> {
    try {
      // Find original position for undo - look at current siblings
      const node = await api.getNode(nodeId)
      if (!node) return

      const siblings = node.parent_id
        ? (await api.getChildren(node.parent_id)).filter((n: Node) => n.id !== nodeId)
        : children.value.filter(n => n.id !== nodeId)

      // Find where this node currently sits among siblings by sort_order
      const currentNode = children.value.find(n => n.id === nodeId) || node
      const sortedSiblings = [...siblings].sort((a: Node, b: Node) => (a.sort_order || 0) - (b.sort_order || 0))

      // Find the sibling that comes just before this node's current position
      let prevSibling: Node | null = null
      for (const sib of sortedSiblings) {
        if ((sib.sort_order || 0) < (currentNode.sort_order || 0)) {
          prevSibling = sib
        } else {
          break
        }
      }

      // Store undo info
      const oldTargetId = prevSibling ? prevSibling.id : sortedSiblings[0]?.id || null
      const oldPosition: 'before' | 'after' = prevSibling ? 'after' : 'before'

      await api.reorderNode(nodeId, targetId, position)

      if (oldTargetId) {
        pushCommand(
          new ReorderCommand({
            nodeId,
            oldTargetId,
            oldPosition,
            newTargetId: targetId,
            newPosition: position,
          })
        )
      }

      await refreshAfterChange()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  /**
   * Delete selected nodes (for keyboard shortcut).
   */
  async function deleteSelectedNodes(): Promise<void> {
    if (selectedIds.value.size === 0) return
    const idsToDelete = [...selectedIds.value]
    const result = await nodeOps.deleteMultipleNodes(idsToDelete)
    if (result.success) {
      selectedIds.value = new Set()
      selectedNode.value = null
      showDetail.value = false
      await loadChildren(currentContainerId.value, { silent: true })
      await loadSidebarTree()
    }
  }

  /**
   * Clear all selection state.
   */
  function clearSelection(): void {
    selectedIds.value = new Set()
    selectedNode.value = null
    showDetail.value = false
  }

  return {
    addChildNode,
    clearSelectionAfterDelete,
    deleteNode,
    deleteMultipleNodes,
    deleteSelectedNodes,
    wrapWithParent,
    moveNode,
    moveMultipleNodes,
    moveNodeToRoot,
    toggleComplete,
    toggleFavorite,
    linkNodesFromGraph,
    unlinkNodesFromGraph,
    handleAIImproveNotes,
    handleReorder,
    updateNode,
    clearSelection,
  }
}
