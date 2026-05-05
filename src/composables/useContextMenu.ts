import { ref, type Ref } from 'vue'
import { useErrorHandler } from './useErrorHandler'
import type { Node } from '../types'

/**
 * Context menu state structure.
 */
export interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  node: Node | null
  linkedNodes: Node[]
}

/**
 * Position coordinates for context menu.
 */
export interface ContextMenuPosition {
  x: number
  y: number
}

/**
 * Parameters for unlink handler.
 */
export interface UnlinkParams {
  source: Node
  target: Node
}

/**
 * Parameters for move to workspace handler.
 */
export interface MoveToWorkspaceParams {
  node: Node
  workspaceId: number
}

/**
 * Parameters for view context menu handler.
 */
export interface ViewContextMenuParams {
  event: MouseEvent
  node: Node
}

/**
 * Options for useContextMenu composable.
 */
export interface UseContextMenuOptions {
  /** Called to load linked nodes */
  onLoadLinks?: (nodeId: number) => Promise<Node[]>
  /** Called when "View Details" selected */
  onViewDetails?: (node: Node) => void
  /** Called when "Enter" selected */
  onEnter?: (node: Node) => void
  /** Called when "Add Child" selected */
  onAddChild?: (node: Node) => void
  /** Called when toggling complete */
  onToggleComplete?: (node: Node) => void
  /** Called when toggling favorite */
  onToggleFavorite?: (node: Node) => void
  /** Called to open link search */
  onOpenLinkSearch?: (node: Node) => void
  /** Called to open move search */
  onOpenMoveSearch?: (node: Node) => void
  /** Called to unlink nodes */
  onUnlink?: (sourceId: number, targetId: number) => Promise<void>
  /** Called to move node to workspace */
  onMoveToWorkspace?: (nodeId: number, workspaceId: number) => Promise<void>
  /** Called to delete node */
  onDelete?: (nodeId: number) => void
  /** Called to refresh selected node after unlink */
  onRefreshSelectedNode?: (nodeId: number) => Promise<void>
}

/**
 * Return type for useContextMenu composable.
 */
export interface UseContextMenuReturn {
  // State
  contextMenu: Ref<ContextMenuState>

  // Methods
  showContextMenu: (e: MouseEvent, node: Node) => Promise<void>
  closeContextMenu: () => void
  handleViewDetails: (node: Node) => void
  handleEnter: (node: Node) => void
  handleAddChild: (node: Node) => void
  handleToggleComplete: (node: Node) => void
  handleToggleFavorite: (node: Node) => void
  handleOpenLinkSearch: (node: Node) => void
  handleOpenMoveSearch: (node: Node) => void
  handleUnlink: (params: UnlinkParams) => Promise<void>
  handleMoveToWorkspace: (params: MoveToWorkspaceParams) => Promise<void>
  handleDelete: (node: Node) => void
  handleViewContextMenu: (params: ViewContextMenuParams) => Promise<void>

  // Helpers
  isVisible: () => boolean
  getNode: () => Node | null
  getPosition: () => ContextMenuPosition
  getLinkedNodes: () => Node[]
}

/**
 * Composable for context menu state and actions.
 * Handles showing, hiding, and processing context menu actions.
 *
 * @param options - Configuration options
 * @returns Context menu state and functions
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
  onRefreshSelectedNode,
}: UseContextMenuOptions = {}): UseContextMenuReturn {
  const { handleError } = useErrorHandler()

  const contextMenu = ref<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
    linkedNodes: [],
  })

  async function showContextMenu(e: MouseEvent, node: Node): Promise<void> {
    e.preventDefault()
    e.stopPropagation()

    // Load linked nodes for the menu
    let links: Node[] = []
    if (onLoadLinks) {
      try {
        links = await onLoadLinks(node.id)
      } catch (err) {
        handleError(err as Error, { context: 'Loading links', silent: true })
      }
    }

    contextMenu.value = {
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node: node,
      linkedNodes: links || [],
    }
  }

  function closeContextMenu(): void {
    contextMenu.value.visible = false
  }

  function handleViewDetails(node: Node): void {
    if (onViewDetails) onViewDetails(node)
    closeContextMenu()
  }

  function handleEnter(node: Node): void {
    if (onEnter) onEnter(node)
    closeContextMenu()
  }

  function handleAddChild(node: Node): void {
    closeContextMenu()
    if (onAddChild) onAddChild(node)
  }

  function handleToggleComplete(node: Node): void {
    if (onToggleComplete) onToggleComplete(node)
    closeContextMenu()
  }

  function handleToggleFavorite(node: Node): void {
    if (onToggleFavorite) onToggleFavorite(node)
    closeContextMenu()
  }

  function handleOpenLinkSearch(node: Node): void {
    if (onOpenLinkSearch) onOpenLinkSearch(node)
    closeContextMenu()
  }

  function handleOpenMoveSearch(node: Node): void {
    if (onOpenMoveSearch) onOpenMoveSearch(node)
    closeContextMenu()
  }

  async function handleUnlink({ source, target }: UnlinkParams): Promise<void> {
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
        handleError(err as Error, { context: 'Unlinking nodes' })
      }
    }
  }

  async function handleMoveToWorkspace({ node, workspaceId }: MoveToWorkspaceParams): Promise<void> {
    if (onMoveToWorkspace) {
      try {
        await onMoveToWorkspace(node.id, workspaceId)
      } catch (err) {
        handleError(err as Error, { context: 'Moving to workspace' })
      }
    }
    closeContextMenu()
  }

  function handleDelete(node: Node): void {
    if (onDelete) onDelete(node.id)
    closeContextMenu()
  }

  // Alias for use with view components
  async function handleViewContextMenu({ event, node }: ViewContextMenuParams): Promise<void> {
    await showContextMenu(event, node)
  }

  // Computed helpers
  function isVisible(): boolean {
    return contextMenu.value.visible
  }

  function getNode(): Node | null {
    return contextMenu.value.node
  }

  function getPosition(): ContextMenuPosition {
    return { x: contextMenu.value.x, y: contextMenu.value.y }
  }

  function getLinkedNodes(): Node[] {
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
    getLinkedNodes,
  }
}
