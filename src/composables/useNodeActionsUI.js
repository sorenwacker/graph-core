import { OllamaImproveNotesCommand, ReorderCommand } from '../commands/index.js'
import { useAppContext } from './useAppContext'

/**
 * Composable for node actions that require UI state management.
 * Wraps core node operations with selection, navigation, and refresh logic.
 *
 * Uses the app context for shared state and functions, reducing parameter count.
 *
 * @param {Object} options
 * @param {Object} options.nodeOps - Node operations composable (from useNodeOperations)
 * @param {Function} options.pushCommand - Push undo/redo command (from useUndoRedo)
 * @param {Function} options.getWorkspaceIdForNode - Get workspace ID for node type
 */
export function useNodeActionsUI({ nodeOps, pushCommand, getWorkspaceIdForNode }) {
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
   * Clear selection state after delete operations
   */
  function clearSelectionAfterDelete() {
    showDetail.value = false
    selectedNode.value = null
  }

  /**
   * Delete a node with UI state management
   */
  async function deleteNode(nodeId) {
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
          await enterContainer({ id: node.parent_id })
        } else {
          currentContainerId.value = null
          breadcrumbs.value = []
        }
      }
      await refreshAfterDelete()
    }
  }

  /**
   * Delete multiple nodes with UI state management
   */
  async function deleteMultipleNodes(nodeIds) {
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
   * Wrap a node with a new parent group
   */
  async function wrapWithParent({ nodeId, parentTitle }) {
    try {
      const node = await api.getNode(nodeId)
      if (!node) {
        throw new Error('Node not found')
      }

      // Create new parent at same level as current node
      const newParent = await api.createNode({
        title: parentTitle,
        type: 'group',
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
   * Move a node with UI state updates
   */
  async function moveNode({ nodeId, oldParentId, newParentId }) {
    const success = await nodeOps.moveNode({ nodeId, oldParentId, newParentId })
    if (success) {
      if (newParentId) expandedIds.value.add(newParentId)
      await refreshAfterChange()
      await refreshGraphAfterStructureChange()
    }
  }

  /**
   * Move multiple nodes with UI state updates
   */
  async function moveMultipleNodes({ nodeIds, newParentId }) {
    const success = await nodeOps.moveMultipleNodes({ nodeIds, newParentId })
    if (success) {
      if (newParentId) expandedIds.value.add(newParentId)
      await refreshAfterChange()
      await refreshGraphAfterStructureChange()
      selectedIds.value.clear()
    }
  }

  /**
   * Move a node to root level
   */
  async function moveNodeToRoot(nodeId) {
    const success = await nodeOps.moveNodeToRoot(nodeId)
    if (success) {
      await refreshAfterChange()
      await refreshGraphAfterStructureChange()
    }
  }

  /**
   * Toggle node completion with view updates
   */
  async function toggleComplete(node) {
    const success = await nodeOps.toggleComplete(node)
    if (success) {
      await loadChildren(currentContainerId.value, { silent: true })
      viewRendererRef.value?.loadTasks?.()
    }
    return success
  }

  /**
   * Toggle node favorite with data reload
   */
  async function toggleFavorite(node) {
    const success = await nodeOps.toggleFavorite(node)
    if (success) {
      await loadChildren(currentContainerId.value, { silent: true })
      await loadFavorites()
    }
    return success
  }

  /**
   * Link nodes from graph view with refresh
   */
  async function linkNodesFromGraph({ sourceId, targetId }) {
    const success = await nodeOps.linkNodes(sourceId, targetId)
    if (success) {
      await refreshGraphAfterStructureChange()
      await refreshDetailPanelLinks(sourceId, targetId)
    }
  }

  /**
   * Unlink nodes from graph view with refresh
   */
  async function unlinkNodesFromGraph({ sourceId, targetId }) {
    const success = await nodeOps.unlinkNodes(sourceId, targetId)
    if (success) {
      await refreshGraphAfterStructureChange()
      await refreshDetailPanelLinks(sourceId, targetId)
    }
  }

  /**
   * Handle AI-improved notes from DetailPanel
   */
  async function handleAIImproveNotes(payload) {
    const { nodeId, oldNotes, newNotes, prompt, selectionRange, fullNotes } = payload
    const currentFullNotes = fullNotes ?? ''

    let finalOldNotes, finalNewNotes
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
   * Update a node with full UI refresh
   */
  async function updateNode(updatedNode, trackUndo = true) {
    const success = await nodeOps.updateNode(updatedNode, { trackUndo })
    if (success) {
      await loadChildren(currentContainerId.value, { silent: true })
      invalidateSidebarCache()
      await loadSidebarTree()
      await Promise.all([loadRecentItems(), loadFavorites(), loadTags()])
    }
    return success
  }

  /**
   * Add a child node to a parent
   */
  async function addChildNode({ parentId, title, type, x, y }) {
    const newNode = await nodeOps.createNode({ title, type, parentId, x, y })
    if (newNode) {
      expandedIds.value.add(parentId)
      await refreshAfterChange({ sidebar: false, recent: false })
    }
    return newNode
  }

  /**
   * Handle reorder of a node (for drag-and-drop)
   */
  async function handleReorder({ nodeId, targetId, position }) {
    try {
      // Find original position for undo - look at current siblings
      const node = await api.getNode(nodeId)
      const siblings = node.parent_id
        ? (await api.getChildren(node.parent_id)).filter(n => n.id !== nodeId)
        : children.value.filter(n => n.id !== nodeId)

      // Find where this node currently sits among siblings by sort_order
      const currentNode = children.value.find(n => n.id === nodeId) || (await api.getNode(nodeId))
      const sortedSiblings = [...siblings].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

      // Find the sibling that comes just before this node's current position
      let prevSibling = null
      for (const sib of sortedSiblings) {
        if ((sib.sort_order || 0) < (currentNode.sort_order || 0)) {
          prevSibling = sib
        } else {
          break
        }
      }

      // Store undo info
      const oldTargetId = prevSibling ? prevSibling.id : sortedSiblings[0]?.id || null
      const oldPosition = prevSibling ? 'after' : 'before'

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
      error.value = e.message
    }
  }

  /**
   * Delete selected nodes (for keyboard shortcut)
   */
  async function deleteSelectedNodes() {
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
   * Clear all selection state
   */
  function clearSelection() {
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
