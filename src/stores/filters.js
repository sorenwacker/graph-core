import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { DEFAULT_VISIBLE_TYPES, ALL_NODE_TYPES } from '../composables/useGraphSettings'

/**
 * Filters store - manages shared filter state across all views.
 * Filters are synced from the current container's settings.
 */
export const useFiltersStore = defineStore('filters', () => {
  // ===========================================
  // STATE
  // ===========================================

  /** Node types to display */
  const visibleTypes = ref([...DEFAULT_VISIBLE_TYPES])

  /** Maximum depth to display (0 = unlimited) */
  const maxDepth = ref(0)

  /** Whether filters have been modified from container defaults */
  const isDirty = ref(false)

  /** Current container ID these filters are synced from */
  const syncedFromId = ref(null)

  // ===========================================
  // GETTERS (COMPUTED)
  // ===========================================

  /** Check if a node type is visible */
  const isTypeVisible = computed(() => {
    return type => visibleTypes.value.includes(type)
  })

  /** Get all available node types */
  const allTypes = computed(() => ALL_NODE_TYPES)

  /** Number of types currently hidden */
  const hiddenTypesCount = computed(() => {
    return DEFAULT_VISIBLE_TYPES.length - visibleTypes.value.length
  })

  /** Whether any type filter is active */
  const hasTypeFilter = computed(() => {
    return visibleTypes.value.length < DEFAULT_VISIBLE_TYPES.length
  })

  /** Whether depth filter is active */
  const hasDepthFilter = computed(() => {
    return maxDepth.value > 0
  })

  /** Whether any filter is active */
  const hasActiveFilter = computed(() => {
    return hasTypeFilter.value || hasDepthFilter.value
  })

  // ===========================================
  // ACTIONS
  // ===========================================

  /**
   * Toggle visibility of a node type
   * @param {string} type - Node type to toggle
   */
  function toggleType(type) {
    const index = visibleTypes.value.indexOf(type)
    if (index >= 0) {
      visibleTypes.value.splice(index, 1)
    } else {
      visibleTypes.value.push(type)
    }
    isDirty.value = true
  }

  /**
   * Set visible types directly
   * @param {string[]} types - Array of visible types
   */
  function setVisibleTypes(types) {
    visibleTypes.value = [...types]
    isDirty.value = true
  }

  /**
   * Set max depth
   * @param {number} depth - Max depth (0 = unlimited)
   */
  function setMaxDepth(depth) {
    maxDepth.value = depth
    isDirty.value = true
  }

  /**
   * Reset filters to defaults
   */
  function resetToDefaults() {
    visibleTypes.value = [...DEFAULT_VISIBLE_TYPES]
    maxDepth.value = 0
    isDirty.value = true
  }

  /**
   * Show all node types
   */
  function showAllTypes() {
    visibleTypes.value = [...DEFAULT_VISIBLE_TYPES]
    isDirty.value = true
  }

  /**
   * Sync filter state from a container node's settings
   * @param {Object} node - Container node with filter settings
   * @param {Object} workspaceDefaults - Workspace default settings
   */
  function syncFromNode(node, workspaceDefaults = {}) {
    // Load from node settings, falling back to workspace defaults
    if (Array.isArray(node?.graph_type_filter)) {
      visibleTypes.value = [...node.graph_type_filter]
    } else if (Array.isArray(workspaceDefaults.visibleTypes)) {
      visibleTypes.value = [...workspaceDefaults.visibleTypes]
    } else {
      visibleTypes.value = [...DEFAULT_VISIBLE_TYPES]
    }

    if (node?.graph_max_depth != null) {
      maxDepth.value = node.graph_max_depth
    } else if (workspaceDefaults.maxDepth != null) {
      maxDepth.value = workspaceDefaults.maxDepth
    } else {
      maxDepth.value = 0
    }

    syncedFromId.value = node?.id ?? null
    isDirty.value = false
  }

  return {
    // State
    visibleTypes,
    maxDepth,
    isDirty,
    syncedFromId,

    // Getters
    isTypeVisible,
    allTypes,
    hiddenTypesCount,
    hasTypeFilter,
    hasDepthFilter,
    hasActiveFilter,

    // Actions
    toggleType,
    setVisibleTypes,
    setMaxDepth,
    resetToDefaults,
    showAllTypes,
    syncFromNode,
  }
})
