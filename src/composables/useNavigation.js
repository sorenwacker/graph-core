import { ref, computed } from 'vue'
import { MAX_HISTORY_SIZE } from '../utils/uiConstants.js'

/**
 * Composable for managing container navigation state and operations.
 * Handles drill-down navigation, breadcrumbs, and history.
 *
 * @param {Object} options
 * @param {Object} options.api - API service for data fetching
 * @param {Ref<string>} options.workspace - Current workspace ref
 * @param {Function} options.onBeforeNavigate - Called before navigation starts
 * @param {Function} options.onAfterNavigate - Called after navigation completes
 * @param {Function} options.onBreadcrumbsBuilt - Called after breadcrumbs are built (for sidebar expansion)
 * @param {Function} options.onError - Called on navigation error
 * @param {Function} options.filterByWorkspace - Custom filter function for workspace filtering
 * @returns {Object} Navigation state and functions
 */
export function useNavigation({
  api,
  workspace,
  onBeforeNavigate,
  onAfterNavigate,
  onBreadcrumbsBuilt,
  onError,
  filterByWorkspace
} = {}) {
  // Core navigation state
  const currentContainerId = ref(null)
  const currentContainer = ref(null)
  const breadcrumbs = ref([])
  const navigationHistory = ref([])
  const children = ref([])
  const loading = ref(false)
  const error = ref(null)

  /**
   * Build a nested tree from flat descendants
   */
  function buildChildTree(flatNodes, parentId) {
    if (!flatNodes) return []
    const childNodes = flatNodes.filter(n => n && n.parent_id === parentId)
    return childNodes.map(child => {
      if (!child || !child.id) return null
      return {
        ...child,
        children: buildChildTree(flatNodes, child.id)
      }
    }).filter(Boolean)
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
    if (!silent) loading.value = true
    error.value = null

    try {
      if (containerId === null) {
        // Root level - get all root nodes
        const ws = workspace?.value
        const roots = await api.getRoots(ws)
        const filteredRoots = applyWorkspaceFilter(roots)

        // Fetch descendants for each root
        const rootsWithChildren = await Promise.all(
          filteredRoots.map(async (root) => {
            if (!root || !root.id) return null
            const descendants = await api.getDescendants(root.id)
            const filteredDescendants = applyWorkspaceFilter(descendants)
            return {
              ...root,
              children: buildChildTree(filteredDescendants, root.id)
            }
          })
        )

        children.value = rootsWithChildren.filter(Boolean)
        currentContainer.value = null
        breadcrumbs.value = []
      } else {
        // Get container and its children
        const [container, containerChildren] = await Promise.all([
          api.getNode(containerId),
          api.getChildren(containerId)
        ])
        currentContainer.value = container

        // Build children with nested structure
        const descendants = await api.getDescendants(containerId)
        children.value = containerChildren.filter(Boolean).map(child => ({
          ...child,
          children: buildChildTree(descendants, child.id)
        }))

        // Build breadcrumbs
        const ancestors = await api.getAncestors(containerId)
        breadcrumbs.value = (ancestors || []).filter(a => a && a.id !== container.id)
        if (container) breadcrumbs.value.push(container)

        // Notify callback for sidebar expansion etc.
        if (onBreadcrumbsBuilt) {
          onBreadcrumbsBuilt(breadcrumbs.value)
        }
      }

      currentContainerId.value = containerId
    } catch (e) {
      console.error('Failed to load:', e)
      error.value = e.message
      if (onError) {
        await onError(e, containerId)
      }
    } finally {
      if (!silent) loading.value = false
    }
  }

  /**
   * Navigate into a container
   */
  async function enterContainer(node, { skipHistory = false, direction = 'forward' } = {}) {
    const nodeId = typeof node === 'object' ? node?.id : node

    if (onBeforeNavigate) {
      await onBeforeNavigate(nodeId, direction)
    }

    // Push current location to history before navigating
    if (!skipHistory && currentContainerId.value !== nodeId) {
      navigationHistory.value.push(currentContainerId.value)
      // Limit history size
      if (navigationHistory.value.length > MAX_HISTORY_SIZE) {
        navigationHistory.value.shift()
      }
    }

    await loadChildren(nodeId ?? null)

    if (onAfterNavigate) {
      await onAfterNavigate(nodeId, direction)
    }
  }

  /**
   * Navigate back in history
   */
  async function navigateBack() {
    if (navigationHistory.value.length > 0) {
      const previousId = navigationHistory.value.pop()
      await enterContainer(previousId, { skipHistory: true, direction: 'back' })
    } else {
      await goToParent()
    }
  }

  /**
   * Navigate to a specific breadcrumb by index
   */
  async function navigateToBreadcrumb(index) {
    if (index < 0) {
      await loadChildren(null)
    } else {
      await loadChildren(breadcrumbs.value[index].id)
    }
  }

  /**
   * Navigate to parent container
   */
  async function goToParent() {
    if (breadcrumbs.value.length > 1) {
      await navigateToBreadcrumb(breadcrumbs.value.length - 2)
    } else if (breadcrumbs.value.length === 1) {
      await navigateToBreadcrumb(-1)
    }
  }

  /**
   * Navigate to first child of current container
   */
  async function goToFirstChild() {
    if (children.value.length > 0) {
      await enterContainer(children.value[0])
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
    goToFirstChild
  }
}
