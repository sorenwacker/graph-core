import { ref, computed, watch, onUnmounted } from 'vue'
import { SIDEBAR_WIDTH, SIDEBAR_HIDE_DELAY_MS } from '../utils/uiConstants.js'

/**
 * Composable for managing sidebar UI state.
 * Handles hover visibility, section collapse states, and tree expansion.
 *
 * @param {Object} options
 * @param {Ref<boolean>} options.pinned - Ref controlling pinned state (from settings)
 * @returns {Object} Sidebar state and functions
 */
export function useSidebar({ pinned } = {}) {
  // Hover state
  const hovered = ref(false)
  let hideTimeout = null
  let isUnmounted = false

  // Cleanup on unmount
  onUnmounted(() => {
    isUnmounted = true
    if (hideTimeout) {
      clearTimeout(hideTimeout)
      hideTimeout = null
    }
  })

  // Helper to get boolean from localStorage
  function getStoredBoolean(key, defaultValue = false) {
    if (typeof localStorage === 'undefined') return defaultValue
    const stored = localStorage.getItem(key)
    if (stored === null) return defaultValue
    return stored === 'true'
  }

  // Section collapse states - persisted to localStorage
  const treeCollapsed = ref(getStoredBoolean('sidebar-tree-collapsed'))
  const favoritesCollapsed = ref(getStoredBoolean('sidebar-favorites-collapsed'))
  const recentCollapsed = ref(getStoredBoolean('sidebar-recent-collapsed'))
  const tagsCollapsed = ref(getStoredBoolean('sidebar-tags-collapsed'))

  // Persist collapse state changes
  watch(treeCollapsed, (val) => localStorage.setItem('sidebar-tree-collapsed', String(val)))
  watch(favoritesCollapsed, (val) => localStorage.setItem('sidebar-favorites-collapsed', String(val)))
  watch(recentCollapsed, (val) => localStorage.setItem('sidebar-recent-collapsed', String(val)))
  watch(tagsCollapsed, (val) => localStorage.setItem('sidebar-tags-collapsed', String(val)))

  // Tree expansion state
  const expandedIds = ref(new Set())

  // Computed visibility - visible if pinned OR hovered
  const visible = computed(() => pinned?.value || hovered.value)

  /**
   * Handle mouse enter on sidebar
   */
  function onEnter() {
    if (hideTimeout) {
      clearTimeout(hideTimeout)
      hideTimeout = null
    }
    hovered.value = true
  }

  /**
   * Handle mouse leave on sidebar
   * @param {MouseEvent} event - Optional mouse event for position check
   */
  function onLeave(event) {
    // Don't hide if pinned
    if (pinned?.value) return

    // Don't hide if mouse is still within sidebar bounds
    if (event && event.clientX <= SIDEBAR_WIDTH) {
      return
    }

    hideTimeout = setTimeout(() => {
      if (!isUnmounted) {
        hovered.value = false
      }
    }, SIDEBAR_HIDE_DELAY_MS)
  }

  /**
   * Toggle expansion of a tree node
   * @param {number} nodeId - Node ID to toggle
   */
  function toggleExpand(nodeId) {
    if (expandedIds.value.has(nodeId)) {
      expandedIds.value.delete(nodeId)
    } else {
      expandedIds.value.add(nodeId)
    }
    // Trigger reactivity
    expandedIds.value = new Set(expandedIds.value)
  }

  /**
   * Expand all nodes in a path (for navigation)
   * @param {Array} path - Array of nodes with id property
   */
  function expandToPath(path) {
    for (const node of path) {
      if (node?.id) {
        expandedIds.value.add(node.id)
      }
    }
    expandedIds.value = new Set(expandedIds.value)
  }

  /**
   * Toggle tree section collapse
   */
  function toggleTreeCollapse() {
    treeCollapsed.value = !treeCollapsed.value
  }

  /**
   * Toggle favorites section collapse
   */
  function toggleFavoritesCollapse() {
    favoritesCollapsed.value = !favoritesCollapsed.value
  }

  /**
   * Toggle recent section collapse
   */
  function toggleRecentCollapse() {
    recentCollapsed.value = !recentCollapsed.value
  }

  /**
   * Toggle tags section collapse
   */
  function toggleTagsCollapse() {
    tagsCollapsed.value = !tagsCollapsed.value
  }

  return {
    // State
    hovered,
    expandedIds,
    treeCollapsed,
    favoritesCollapsed,
    recentCollapsed,
    tagsCollapsed,

    // Computed
    visible,

    // Methods
    onEnter,
    onLeave,
    toggleExpand,
    expandToPath,
    toggleTreeCollapse,
    toggleFavoritesCollapse,
    toggleRecentCollapse,
    toggleTagsCollapse
  }
}
