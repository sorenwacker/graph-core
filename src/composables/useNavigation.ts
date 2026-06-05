import { ref, computed, nextTick, type Ref, type ComputedRef } from 'vue'
import { MAX_HISTORY_SIZE, SIDEBAR_HIDE_DELAY_MS } from '../utils/uiConstants.js'
import { useErrorHandler } from './useErrorHandler.js'
import type { Api, Node, TreeNode } from '../types'

/**
 * Debounce configuration.
 */
export interface DebounceConfig {
  enabled: boolean
  delay: number
}

/**
 * Direction of navigation transition.
 */
export type NavigationDirection = 'forward' | 'back'

/**
 * Options for useNavigation composable.
 */
export interface UseNavigationOptions {
  /** API service for data fetching */
  api: Api
  /** Current workspace ref */
  workspace?: Ref<number | null>
  /** Debounce configuration */
  debounce?: DebounceConfig
  /** Called before navigation starts */
  onBeforeNavigate?: (nodeId: number | null, direction: NavigationDirection) => void | Promise<void>
  /** Called after navigation completes */
  onAfterNavigate?: (nodeId: number | null, direction: NavigationDirection) => void | Promise<void>
  /** Called after breadcrumbs are built (for sidebar expansion) */
  onBreadcrumbsBuilt?: (breadcrumbs: Node[]) => void
  /** Called with root children to sync sidebar tree */
  onSidebarSync?: (roots: TreeNode[]) => void
  /** Called when transition animation starts */
  onTransitionStart?: (direction: NavigationDirection) => void
  /** Called when transition animation ends */
  onTransitionEnd?: () => void
  /** Called when container not found (404), receives error and containerId */
  onNotFound?: (error: Error, containerId: number | null) => void | Promise<void>
  /** Called when entering a leaf node, return true to prevent enter */
  onLeafNode?: (node: TreeNode) => boolean | void
  /** Called on navigation error (for non-404 errors) */
  onError?: (error: Error, containerId: number | null) => void | Promise<void>
  /** Called to select a node after navigation */
  onSelectNode?: (node: Node) => void
  /** Custom filter function for workspace filtering */
  filterByWorkspace?: (node: Node, workspaceId: number | null) => boolean
  /** External buildChildTree function (from useDataLoading) */
  buildChildTree?: (flatNodes: Node[], parentId: number, parentCompleted?: boolean) => TreeNode[]
}

/**
 * Options for enterContainer function.
 */
export interface EnterContainerOptions {
  /** Skip adding to navigation history */
  skipHistory?: boolean
  /** Navigation direction for animation */
  direction?: NavigationDirection
}

/**
 * Options for loadChildren function.
 */
export interface LoadChildrenOptions {
  /** If true, don't update loading state */
  silent?: boolean
}

/**
 * Return type for useNavigation composable.
 */
export interface UseNavigationReturn {
  // State
  currentContainerId: Ref<number | null>
  currentContainer: Ref<Node | null>
  breadcrumbs: Ref<Node[]>
  navigationHistory: Ref<(number | null)[]>
  children: Ref<TreeNode[]>
  loading: Ref<boolean>
  error: Ref<string | null>

  // Computed
  isAtRoot: ComputedRef<boolean>
  hasHistory: ComputedRef<boolean>
  canGoUp: ComputedRef<boolean>

  // Methods
  loadChildren: (containerId?: number | null, options?: LoadChildrenOptions) => Promise<void>
  enterContainer: (node: Node | TreeNode | number | null, options?: EnterContainerOptions) => Promise<void>
  navigateBack: () => void
  navigateToBreadcrumb: (index: number) => Promise<void>
  goToParent: () => void
  goToFirstChild: () => void
  goToSibling: (direction: number) => Promise<void>
  goToPrevSibling: () => Promise<void>
  goToNextSibling: () => Promise<void>
  navigateToNode: (node: Node) => Promise<void>
}

/**
 * Composable for managing container navigation state and operations.
 * Handles drill-down navigation, breadcrumbs, history, transitions, and debouncing.
 *
 * @param options - Configuration options
 * @returns Navigation state and functions
 */
export function useNavigation({
  api,
  workspace,
  debounce = { enabled: true, delay: 200 },
  onBeforeNavigate,
  onAfterNavigate,
  onBreadcrumbsBuilt,
  onSidebarSync,
  onTransitionStart,
  onTransitionEnd,
  onNotFound,
  onLeafNode,
  onError,
  onSelectNode,
  filterByWorkspace,
  buildChildTree: externalBuildChildTree,
}: UseNavigationOptions): UseNavigationReturn {
  const { handleError } = useErrorHandler()

  // Core navigation state
  const currentContainerId = ref<number | null>(null)
  const currentContainer = ref<Node | null>(null)
  const breadcrumbs = ref<Node[]>([])
  const navigationHistory = ref<(number | null)[]>([])
  const children = ref<TreeNode[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Debounce state
  let isLoadingChildren = false
  let lastLoadTime = 0
  let lastLoadedContainerId: number | null = null

  /**
   * Build a nested tree from flat descendants (internal version).
   */
  function internalBuildChildTree(flatNodes: Node[], parentId: number, parentCompleted = false): TreeNode[] {
    if (!flatNodes) return []
    const childNodes = flatNodes.filter(n => n && n.parent_id === parentId)
    return childNodes
      .map(child => {
        if (!child || !child.id) return null
        const inheritedCompleted = parentCompleted || child.completed
        return {
          ...child,
          inheritedCompleted: parentCompleted, // true if any ancestor is completed
          children: internalBuildChildTree(flatNodes, child.id, inheritedCompleted),
        } as TreeNode
      })
      .filter((n): n is TreeNode => n !== null)
  }

  /**
   * Build tree from direct children and all descendants.
   */
  function buildTree(directChildren: Node[], allDescendants: Node[], parentCompleted = false): TreeNode[] {
    if (!directChildren) return []
    const buildFn = externalBuildChildTree || internalBuildChildTree
    return directChildren
      .filter(Boolean)
      .map(child => {
        if (!child || !child.id) return null
        const inheritedCompleted = parentCompleted || child.completed
        return {
          ...child,
          inheritedCompleted: parentCompleted,
          children: buildFn(allDescendants, child.id, inheritedCompleted),
        } as TreeNode
      })
      .filter((n): n is TreeNode => n !== null)
  }

  /**
   * Filter nodes by workspace if filter function provided.
   */
  function applyWorkspaceFilter(nodes: Node[]): Node[] {
    if (!filterByWorkspace) return (nodes || []).filter(Boolean)
    return (nodes || []).filter(n => n && filterByWorkspace(n, workspace?.value ?? null))
  }

  /**
   * Load children for a container.
   * @param containerId - Container ID or null for root
   * @param options - Load options
   */
  async function loadChildren(
    containerId: number | null = null,
    { silent = false }: LoadChildrenOptions = {}
  ): Promise<void> {
    const now = Date.now()
    const timeSinceLastLoad = now - lastLoadTime

    // Strict guard against re-entry
    if (isLoadingChildren) {
      return
    }

    // Debounce: skip if called within delay for same container
    if (debounce.enabled && timeSinceLastLoad < debounce.delay && lastLoadedContainerId === containerId) {
      return
    }

    isLoadingChildren = true
    lastLoadedContainerId = containerId

    if (!silent) loading.value = true
    error.value = null

    try {
      if (containerId === null) {
        // Root level - get all root nodes with their descendants
        const ws = workspace?.value ?? null
        const roots = await api.getRoots(ws)
        const filteredRoots = applyWorkspaceFilter(roots)

        // Filter out tag nodes - they have their own section
        const isNotTag = (n: Node | null) => n?.type !== 'tag'

        // Fetch descendants for each root to build nested structure
        const buildFn = externalBuildChildTree || internalBuildChildTree
        const rootsWithChildren = await Promise.all(
          filteredRoots.filter(isNotTag).map(async root => {
            if (!root || !root.id) return null
            const descendants = await api.getDescendants(root.id)
            const filteredDescendants = (descendants || []).filter(isNotTag) as Node[]
            return {
              ...root,
              children: buildFn(filteredDescendants, root.id),
            } as TreeNode
          })
        )

        const validRoots = rootsWithChildren.filter((r): r is TreeNode => r !== null)
        children.value = validRoots
        currentContainer.value = null
        breadcrumbs.value = []

        // Sync sidebar tree at root level
        if (onSidebarSync) {
          onSidebarSync(validRoots)
        }
      } else {
        // Get container first to check its type
        const container = await api.getNode(containerId)
        currentContainer.value = container

        // Tag nodes show linked nodes instead of children
        if (container?.type === 'tag') {
          const linkedNodes = await api.getLinkedNodes(containerId)
          // Convert linked nodes to tree nodes (flat, no nested children for tags)
          children.value = (linkedNodes || [])
            .filter(n => n && n.type !== 'tag') // Exclude other tags
            .map(n => ({ ...n, children: [] }) as TreeNode)
        } else {
          // Regular container - get children
          const containerChildren = await api.getChildren(containerId)
          // Build children with nested structure for tree view
          const descendants = await api.getDescendants(containerId)
          children.value = buildTree(containerChildren, descendants)
        }

        // Build breadcrumbs
        const ancestors = await api.getAncestors(containerId)
        // Filter out any null entries and any ancestor that has same id as container
        breadcrumbs.value = (ancestors || []).filter(a => a && a.id !== container?.id)
        if (container) breadcrumbs.value.push(container)

        // Notify callback for sidebar expansion etc.
        if (onBreadcrumbsBuilt) {
          onBreadcrumbsBuilt(breadcrumbs.value)
        }
      }

      currentContainerId.value = containerId
    } catch (e) {
      handleError(e as Error, { context: 'Loading container', silent: true })

      // If node not found (404), call handler and potentially reset to root
      const errorMessage = (e as Error).message || ''
      if (errorMessage.includes('404') || errorMessage.includes('Not found')) {
        if (onNotFound) {
          await onNotFound(e as Error, containerId)
        }
        return
      }

      error.value = errorMessage
      if (onError) {
        await onError(e as Error, containerId)
      }
    } finally {
      if (!silent) loading.value = false
      isLoadingChildren = false
      lastLoadTime = Date.now()
    }
  }

  /**
   * Navigate into a container with transition animation.
   */
  async function enterContainer(
    node: Node | TreeNode | number | null,
    { skipHistory = false, direction = 'forward' }: EnterContainerOptions = {}
  ): Promise<void> {
    const nodeId = typeof node === 'object' && node !== null ? node.id : (node as number | null)
    const nodeObj = typeof node === 'object' ? (node as TreeNode) : null

    // Call before-navigate hook (e.g., to cancel pending detail open)
    if (onBeforeNavigate) {
      await onBeforeNavigate(nodeId, direction)
    }

    // If node has no children (leaf node), delegate to callback
    if (nodeObj && (!nodeObj.children || nodeObj.children.length === 0)) {
      if (onLeafNode) {
        const handled = onLeafNode(nodeObj)
        if (handled !== false) return
      }
    }

    // Push current location to history before navigating
    if (!skipHistory && currentContainerId.value !== nodeId) {
      navigationHistory.value.push(currentContainerId.value)
      // Limit history size
      if (navigationHistory.value.length > MAX_HISTORY_SIZE) {
        navigationHistory.value.shift()
      }
    }

    // Start transition animation
    if (onTransitionStart) {
      onTransitionStart(direction)
    }

    await nextTick()
    setTimeout(async () => {
      await loadChildren(nodeId ?? null)

      if (onTransitionEnd) {
        onTransitionEnd()
      }

      if (onAfterNavigate) {
        await onAfterNavigate(nodeId, direction)
      }
    }, SIDEBAR_HIDE_DELAY_MS)
  }

  /**
   * Navigate back in history.
   */
  function navigateBack(): void {
    if (navigationHistory.value.length > 0) {
      const previousId = navigationHistory.value.pop()
      enterContainer(previousId ?? null, { skipHistory: true, direction: 'back' })
    } else {
      // Fallback: go to parent if no history
      goToParent()
    }
  }

  /**
   * Navigate to a specific breadcrumb by index.
   */
  async function navigateToBreadcrumb(index: number): Promise<void> {
    if (onTransitionStart) {
      onTransitionStart('back')
    }

    await nextTick()
    setTimeout(async () => {
      if (index < 0) {
        await loadChildren(null)
      } else {
        await loadChildren(breadcrumbs.value[index].id)
      }

      if (onTransitionEnd) {
        onTransitionEnd()
      }
    }, 150)
  }

  /**
   * Navigate to parent container.
   */
  function goToParent(): void {
    if (breadcrumbs.value.length > 1) {
      navigateToBreadcrumb(breadcrumbs.value.length - 2)
    } else if (breadcrumbs.value.length === 1) {
      navigateToBreadcrumb(-1)
    }
  }

  /**
   * Navigate to first child of current container.
   */
  function goToFirstChild(): void {
    if (children.value.length > 0) {
      enterContainer(children.value[0])
    }
  }

  /**
   * Navigate to sibling (previous or next).
   * @param direction - -1 for previous, 1 for next
   */
  async function goToSibling(direction: number): Promise<void> {
    if (!currentContainer.value) return
    const parentId = currentContainer.value.parent_id
    const siblings = parentId ? await api.getChildren(parentId) : await api.getRoots(workspace?.value ?? null)
    const currentIndex = siblings.findIndex(s => s.id === currentContainer.value?.id)
    const targetIndex = currentIndex + direction
    if (targetIndex >= 0 && targetIndex < siblings.length) {
      enterContainer(siblings[targetIndex])
    }
  }

  /**
   * Navigate to previous sibling.
   */
  const goToPrevSibling = (): Promise<void> => goToSibling(-1)

  /**
   * Navigate to next sibling.
   */
  const goToNextSibling = (): Promise<void> => goToSibling(1)

  /**
   * Navigate to a node's parent container and select the node.
   * @param node - Node to navigate to
   */
  async function navigateToNode(node: Node): Promise<void> {
    const parentId = node.parent_id
    await loadChildren(parentId)
    if (onSelectNode) {
      onSelectNode(node)
    }
  }

  return {
    // State
    currentContainerId,
    currentContainer,
    breadcrumbs,
    navigationHistory,
    children,
    loading,
    error,

    // Computed
    isAtRoot: computed(() => currentContainerId.value === null),
    hasHistory: computed(() => navigationHistory.value.length > 0),
    canGoUp: computed(() => breadcrumbs.value.length > 0),

    // Methods
    loadChildren,
    enterContainer,
    navigateBack,
    navigateToBreadcrumb,
    goToParent,
    goToFirstChild,
    goToSibling,
    goToPrevSibling,
    goToNextSibling,
    navigateToNode,
  }
}
