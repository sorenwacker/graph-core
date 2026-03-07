import { ref } from 'vue'

/**
 * Composable for context menu state and actions.
 * Handles showing, hiding, and processing context menu actions.
 *
 * @param {Object} options
 * @param {Function} options.onLoadLinks - Called to load linked nodes: onLoadLinks(nodeId) => links[]
 * @param {Function} options.onViewDetails - Called when "View Details" selected: onViewDetails(node)
 * @param {Function} options.onEnter - Called when "Enter" selected: onEnter(node)
 * @param {Function} options.onAddChild - Called when "Add Child" selected: onAddChild(node)
 * @param {Function} options.onToggleComplete - Called when toggling complete: onToggleComplete(node)
 * @param {Function} options.onToggleFavorite - Called when toggling favorite: onToggleFavorite(node)
 * @param {Function} options.onOpenLinkSearch - Called to open link search: onOpenLinkSearch(node)
 * @param {Function} options.onOpenMoveSearch - Called to open move search: onOpenMoveSearch(node)
 * @param {Function} options.onUnlink - Called to unlink nodes: onUnlink(sourceId, targetId)
 * @param {Function} options.onMoveToWorkspace - Called to move node to workspace: onMoveToWorkspace(nodeId, workspaceId)
 * @param {Function} options.onDelete - Called to delete node: onDelete(nodeId)
 * @param {Function} options.onRefreshSelectedNode - Called to refresh selected node after unlink
 */
export function useContextMenu({
  onLoadLinks,
  onViewDetails,
  onEnter,
  onAddChild,
  onToggleComplete,
  onToggleFavorite,
  onOpenLinkSearch,
  onOpenMoveSearch,
  onUnlink,
  onMoveToWorkspace,
  onDelete,
  onRefreshSelectedNode
} = {}) {
  const contextMenu = ref({
    visible: false,
    x: 0,
    y: 0,
    node: null,
    linkedNodes: []
  })

  async function showContextMenu(e, node) {
    e.preventDefault()
    e.stopPropagation()

    // Load linked nodes for the menu
    let links = []
    if (onLoadLinks) {
      try {
        links = await onLoadLinks(node.id)
      } catch (err) {
        console.error('Failed to load links:', err)
      }
    }

    contextMenu.value = {
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node: node,
      linkedNodes: links || []
    }
  }

  function closeContextMenu() {
    contextMenu.value.visible = false
  }

  function handleViewDetails(node) {
    if (onViewDetails) onViewDetails(node)
    closeContextMenu()
  }

  function handleEnter(node) {
    if (onEnter) onEnter(node)
    closeContextMenu()
  }

  function handleAddChild(node) {
    closeContextMenu()
    if (onAddChild) onAddChild(node)
  }

  function handleToggleComplete(node) {
    if (onToggleComplete) onToggleComplete(node)
    closeContextMenu()
  }

  function handleToggleFavorite(node) {
    if (onToggleFavorite) onToggleFavorite(node)
    closeContextMenu()
  }

  function handleOpenLinkSearch(node) {
    if (onOpenLinkSearch) onOpenLinkSearch(node)
    closeContextMenu()
  }

  function handleOpenMoveSearch(node) {
    if (onOpenMoveSearch) onOpenMoveSearch(node)
    closeContextMenu()
  }

  async function handleUnlink({ source, target }) {
    if (onUnlink) {
      try {
        await onUnlink(source.id, target.id)
        // Remove from local linked nodes list
        contextMenu.value.linkedNodes = contextMenu.value.linkedNodes.filter(n => n.id !== target.id)
        // Refresh selected node if it's the source
        if (onRefreshSelectedNode) {
          await onRefreshSelectedNode(source.id)
        }
      } catch (err) {
        console.error('Failed to unlink nodes:', err)
      }
    }
  }

  async function handleMoveToWorkspace({ node, workspaceId }) {
    if (onMoveToWorkspace) {
      try {
        await onMoveToWorkspace(node.id, workspaceId)
      } catch (err) {
        console.error('Failed to move to workspace:', err)
      }
    }
    closeContextMenu()
  }

  function handleDelete(node) {
    if (onDelete) onDelete(node.id)
    closeContextMenu()
  }

  // Alias for use with view components
  async function handleViewContextMenu({ event, node }) {
    await showContextMenu(event, node)
  }

  // Computed helpers
  function isVisible() {
    return contextMenu.value.visible
  }

  function getNode() {
    return contextMenu.value.node
  }

  function getPosition() {
    return { x: contextMenu.value.x, y: contextMenu.value.y }
  }

  function getLinkedNodes() {
    return contextMenu.value.linkedNodes
  }

  return {
    // State
    contextMenu,

    // Methods
    showContextMenu,
    closeContextMenu,
    handleViewDetails,
    handleEnter,
    handleAddChild,
    handleToggleComplete,
    handleToggleFavorite,
    handleOpenLinkSearch,
    handleOpenMoveSearch,
    handleUnlink,
    handleMoveToWorkspace,
    handleDelete,
    handleViewContextMenu,

    // Helpers
    isVisible,
    getNode,
    getPosition,
    getLinkedNodes
  }
}
