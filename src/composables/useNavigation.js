import { ref, computed, nextTick } from 'vue'
import { MAX_HISTORY_SIZE, SIDEBAR_HIDE_DELAY_MS } from '../utils/uiConstants.js'
import { useErrorHandler } from './useErrorHandler.js'

/**
 * Composable for managing container navigation state and operations.
 * Handles drill-down navigation, breadcrumbs, history, transitions, and debouncing.
 *
 * @param {Object} options
 * @param {Object} options.api - API service for data fetching
 * @param {Ref<string>} options.workspace - Current workspace ref
 * @param {Object} options.debounce - Debounce configuration { enabled: true, delay: 200 }
 * @param {Function} options.onBeforeNavigate - Called before navigation starts (nodeId, direction)
 * @param {Function} options.onAfterNavigate - Called after navigation completes (nodeId, direction)
 * @param {Function} options.onBreadcrumbsBuilt - Called after breadcrumbs are built (for sidebar expansion)
 * @param {Function} options.onSidebarSync - Called with root children to sync sidebar tree
 * @param {Function} options.onTransitionStart - Called when transition animation starts (direction)
 * @param {Function} options.onTransitionEnd - Called when transition animation ends
 * @param {Function} options.onNotFound - Called when container not found (404), receives (error, containerId)
 * @param {Function} options.onLeafNode - Called when entering a leaf node (node), return true to prevent enter
 * @param {Function} options.onError - Called on navigation error (for non-404 errors)
 * @param {Function} options.filterByWorkspace - Custom filter function for workspace filtering
 * @param {Function} options.buildChildTree - External buildChildTree function (from useDataLoading)
 * @returns {Object} Navigation state and functions
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
} = {}) {
  const { handleError } = useErrorHandler()

  // Core navigation state
  const currentContainerId = ref(null)
  const currentContainer = ref(null)
  const breadcrumbs = ref([])
  const navigationHistory = ref([])
  const children = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Debounce state
  let isLoadingChildren = false
  let lastLoadTime = 0
  let lastLoadedContainerId = null

  /**
   * Build a nested tree from flat descendants (internal version)
   */
  function internalBuildChildTree(flatNodes, parentId, parentCompleted = false) {
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
        }
      })
      .filter(Boolean)
  }

  /**
   * Build tree from direct children and all descendants
   */
  function buildTree(directChildren, allDescendants, parentCompleted = false) {
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
        }
      })
      .filter(Boolean)
  }

  /**
   * Filter nodes by workspace if filter function provided
   */
  function applyWorkspaceFilter(nodes) {
    if (!filterByWorkspace) return (nodes || []).filter(Boolean)
    return (nodes || []).filter(n => n && filterByWorkspace(n, workspace?.value))
  }

  /**
   * Load children for a container
   * @param {number|null} containerId - Container ID or null for root
   * @param {Object} options - Load options
   * @param {boolean} options.silent - If true, don't update loading state
   */
  async function loadChildren(containerId = null, { silent = false } = {}) {
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
        const ws = workspace?.value
        const roots = await api.getRoots(ws)
        const filteredRoots = applyWorkspaceFilter(roots)

        // Fetch descendants for each root to build nested structure
        const buildFn = externalBuildChildTree || internalBuildChildTree
        const rootsWithChildren = await Promise.all(
          filteredRoots.map(async root => {
            if (!root || !root.id) return null
            const descendants = await api.getDescendants(root.id)
            return {
              ...root,
              children: buildFn(descendants, root.id),
            }
          })
        )

        const validRoots = rootsWithChildren.filter(Boolean)
        children.value = validRoots
        currentContainer.value = null
        breadcrumbs.value = []

        // Sync sidebar tree at root level
        if (onSidebarSync) {
          onSidebarSync(validRoots)
        }
      } else {
        // Get container and its children
        const [container, containerChildren] = await Promise.all([
          api.getNode(containerId),
          api.getChildren(containerId),
        ])
        currentContainer.value = container

        // Build children with nested structure for tree view
        const descendants = await api.getDescendants(containerId)
        children.value = buildTree(containerChildren, descendants)

        // Build breadcrumbs
        const ancestors = await api.getAncestors(containerId)
        // Filter out any null entries and any ancestor that has same id as container
        breadcrumbs.value = (ancestors || []).filter(a => a && a.id !== container.id)
        if (container) breadcrumbs.value.push(container)

        // Notify callback for sidebar expansion etc.
        if (onBreadcrumbsBuilt) {
          onBreadcrumbsBuilt(breadcrumbs.value)
        }
      }

      currentContainerId.value = containerId
    } catch (e) {
      handleError(e, { context: 'Loading container', silent: true })

      // If node not found (404), call handler and potentially reset to root
      if (e.message?.includes('404') || e.message?.includes('Not found')) {
        if (onNotFound) {
          await onNotFound(e, containerId)
        }
        return
      }

      error.value = e.message
      if (onError) {
        await onError(e, containerId)
      }
    } finally {
      if (!silent) loading.value = false
      isLoadingChildren = false
      lastLoadTime = Date.now()
    }
  }

  /**
   * Navigate into a container with transition animation
   */
  async function enterContainer(node, { skipHistory = false, direction = 'forward' } = {}) {
    const nodeId = typeof node === 'object' ? node?.id : node
    const nodeObj = typeof node === 'object' ? node : null

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
   * Navigate back in history
   */
  function navigateBack() {
    if (navigationHistory.value.length > 0) {
      const previousId = navigationHistory.value.pop()
      enterContainer(previousId, { skipHistory: true, direction: 'back' })
    } else {
      // Fallback: go to parent if no history
      goToParent()
    }
  }

  /**
   * Navigate to a specific breadcrumb by index
   */
  async function navigateToBreadcrumb(index) {
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
   * Navigate to parent container
   */
  function goToParent() {
    if (breadcrumbs.value.length > 1) {
      navigateToBreadcrumb(breadcrumbs.value.length - 2)
    } else if (breadcrumbs.value.length === 1) {
      navigateToBreadcrumb(-1)
    }
  }

  /**
   * Navigate to first child of current container
   */
  function goToFirstChild() {
    if (children.value.length > 0) {
      enterContainer(children.value[0])
    }
  }

  /**
   * Navigate to sibling (previous or next)
   * @param {number} direction - -1 for previous, 1 for next
   */
  async function goToSibling(direction) {
    if (!currentContainer.value) return
    const parentId = currentContainer.value.parent_id
    const siblings = parentId ? await api.getChildren(parentId) : await api.getRoots(workspace?.value)
    const currentIndex = siblings.findIndex(s => s.id === currentContainer.value.id)
    const targetIndex = currentIndex + direction
    if (targetIndex >= 0 && targetIndex < siblings.length) {
      enterContainer(siblings[targetIndex])
    }
  }

  /**
   * Navigate to previous sibling
   */
  const goToPrevSibling = () => goToSibling(-1)

  /**
   * Navigate to next sibling
   */
  const goToNextSibling = () => goToSibling(1)

  /**
   * Navigate to a node's parent container and select the node
   * @param {Object} node - Node to navigate to
   */
  async function navigateToNode(node) {
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
