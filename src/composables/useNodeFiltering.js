import { computed } from 'vue'
import { useFiltersStore } from '../stores/filters.js'
import { buildColorMap } from '../utils/nodeColor.js'

/**
 * Composable for node filtering and transformation operations.
 * Provides functions for flattening, filtering by depth, completion status,
 * type visibility, and building inherited color maps.
 */

/**
 * Flatten a hierarchical node tree into a flat array.
 * @param {Array} nodeList - Array of nodes with potential children
 * @param {Array} result - Accumulator for results (used internally)
 * @param {boolean} skipCompleted - Whether to skip completed nodes
 * @param {number} maxDepth - Maximum depth to traverse (0 = unlimited)
 * @param {number} currentDepth - Current traversal depth (used internally)
 * @returns {Array} Flattened array of nodes
 */
export function flattenNodes(nodeList, result = [], skipCompleted = false, maxDepth = 0, currentDepth = 1) {
  if (!nodeList) return result
  for (const node of nodeList) {
    if (!node) continue
    // Skip completed nodes AND all their children
    if (skipCompleted && node.completed) continue
    result.push(node)
    // Only recurse if within depth limit (0 = unlimited)
    if (node.children?.length && (maxDepth === 0 || currentDepth < maxDepth)) {
      flattenNodes(node.children, result, skipCompleted, maxDepth, currentDepth + 1)
    }
  }
  return result
}

/**
 * Filter nodes recursively by maximum depth.
 * @param {Array} nodeList - Array of nodes to filter
 * @param {number} maxDepth - Maximum depth (0 = unlimited)
 * @param {number} currentDepth - Current depth (used internally)
 * @returns {Array} Filtered node array with children truncated at maxDepth
 */
export function filterByDepth(nodeList, maxDepth, currentDepth = 1) {
  if (!nodeList) return []
  if (maxDepth === 0) return nodeList.filter(Boolean) // 0 = unlimited
  return nodeList.filter(Boolean).map(n => ({
    ...n,
    children:
      currentDepth < maxDepth && n.children?.length ? filterByDepth(n.children, maxDepth, currentDepth + 1) : [],
  }))
}

/**
 * Filter out completed nodes and their children recursively.
 * @param {Array} nodeList - Array of nodes to filter
 * @returns {Array} Filtered array without completed nodes
 */
export function filterCompletedNodes(nodeList) {
  if (!nodeList) return []
  return nodeList
    .filter(n => n && !n.completed)
    .map(n => ({
      ...n,
      children: n.children ? filterCompletedNodes(n.children) : [],
    }))
}

/**
 * Sort nodes recursively by title alphanumerically.
 * @param {Array} nodeList - Array of nodes to sort
 * @returns {Array} Sorted node array
 */
export function sortNodesRecursively(nodeList) {
  if (!nodeList) return []
  return [...nodeList]
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' }))
    .map(n => ({
      ...n,
      children: n.children ? sortNodesRecursively(n.children) : [],
    }))
}

/**
 * Filter nodes recursively by visible types.
 * @param {Array} nodeList - Array of nodes to filter
 * @param {Array} types - Array of type strings to include
 * @returns {Array} Filtered array with only matching types
 */
export function filterByType(nodeList, types) {
  if (!nodeList || !types || types.length === 0) return []
  return nodeList
    .filter(n => n && types.includes(n.type))
    .map(n => ({
      ...n,
      children: n.children ? filterByType(n.children, types) : [],
    }))
}

/**
 * Filter out children of collapsed nodes.
 * A collapsed node is included, but its descendants are hidden.
 * @param {Array} nodeList - Array of nodes to filter
 * @returns {Array} Filtered array with collapsed node children removed
 */
export function filterCollapsedNodes(nodeList) {
  if (!nodeList) return []
  return nodeList.filter(Boolean).map(n => ({
    ...n,
    // If node is collapsed, remove its children; otherwise recurse
    children: n.collapsed ? [] : n.children ? filterCollapsedNodes(n.children) : [],
  }))
}

/**
 * Build a map of inherited colors from parent to children.
 * Colors flow down unless a child has its own color set. Delegates to the
 * shared color service so every view resolves colors by the same rule.
 * @param {Array} nodeList - Array of nodes to process
 * @param {string|null} inheritedColor - Color inherited from parent
 * @param {Object} colorMap - Map accumulator (used internally)
 * @param {boolean} shouldInherit - Whether to inherit colors from parents (default true)
 * @returns {Object} Map of nodeId -> effective color
 */
export function buildInheritedColorMap(nodeList, inheritedColor = null, colorMap = {}, shouldInherit = true) {
  return buildColorMap(nodeList, inheritedColor, colorMap, shouldInherit)
}

/**
 * Composable wrapper for node filtering functions.
 * Can be used directly or as individual imports.
 * @returns {Object} Object with all filtering functions
 */
export function useNodeFiltering() {
  return {
    flattenNodes,
    filterByDepth,
    filterCompletedNodes,
    sortNodesRecursively,
    filterByType,
    filterCollapsedNodes,
    buildInheritedColorMap,
  }
}

/**
 * Calculate progress from children nodes.
 *
 * @param {Array} nodeChildren - Array of child nodes
 * @returns {Object|null} Progress object with completed, total, percent or null
 */
export function calculateProgress(nodeChildren) {
  if (!nodeChildren?.length) return null
  const tasks = nodeChildren.filter(c => c && (c.type === 'task' || c.type === 'project'))
  if (tasks.length === 0) return null
  const completed = tasks.filter(c => c.completed).length
  return {
    completed,
    total: tasks.length,
    percent: Math.round((completed / tasks.length) * 100),
  }
}

/**
 * Recursively filter children, removing completed nodes when hideCompleted is true.
 * Preserves original progress counts in _progress property.
 *
 * @param {Array} nodeList - Array of nodes to filter
 * @param {boolean} hideCompleted - Whether to hide completed items
 * @returns {Array} Filtered array of nodes
 */
export function filterChildrenRecursive(nodeList, hideCompleted) {
  if (!nodeList) return []
  if (!hideCompleted) return nodeList.filter(Boolean)
  return nodeList
    .filter(node => node && !node.completed && !node.inheritedCompleted)
    .map(node => ({
      ...node,
      _progress: calculateProgress(node.children),
      children: node.children ? filterChildrenRecursive(node.children, hideCompleted) : [],
    }))
}

/**
 * Reactive composable for filtered and sorted children.
 * Provides computed refs that react to changes in source data.
 * Uses the shared filter store for type filtering.
 *
 * @param {Object} options
 * @param {Ref<Array>} options.children - Raw children nodes
 * @param {Ref<boolean>} options.hideCompleted - Whether to hide completed items
 * @param {Ref<boolean>} options.sortAlphabetically - Whether to sort alphabetically
 * @param {boolean} options.applyTypeFilter - Whether to apply type filter from store (default: true)
 * @returns {Object} Reactive computeds for filtered and sorted children
 */
export function useChildrenFiltering({ children, hideCompleted, sortAlphabetically, applyTypeFilter = true }) {
  const filtersStore = useFiltersStore()

  /**
   * Internal filter function using current hideCompleted value.
   */
  function filterRecursive(nodeList) {
    return filterChildrenRecursive(nodeList, hideCompleted.value)
  }

  /**
   * Apply type filter recursively to nodes
   */
  function applyTypeFilterRecursive(nodeList) {
    if (!nodeList || !applyTypeFilter || !filtersStore.hasTypeFilter) return nodeList
    return nodeList
      .filter(node => {
        if (!node) return false
        // Always hide tag type from direct display
        if (node.type === 'tag') return false
        return filtersStore.visibleTypes.includes(node.type)
      })
      .map(node => ({
        ...node,
        children: node.children ? applyTypeFilterRecursive(node.children) : [],
      }))
  }

  /**
   * Filtered and optionally sorted children for cards view.
   * Applies completion filter, type filter, and optional sorting.
   */
  const filteredChildren = computed(() => {
    // First apply completion filter
    let result = filterRecursive(children.value)
    // Then apply type filter from store
    result = applyTypeFilterRecursive(result)
    // Finally sort if needed (alphanumeric: handles "Item 2" before "Item 10")
    if (sortAlphabetically.value) {
      result = [...result].sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
      )
    }
    return result
  })

  /**
   * Sorted children for graph/timeline views (no completion filtering).
   * Type filtering is applied separately in graph view.
   */
  const sortedChildren = computed(() => {
    if (!sortAlphabetically.value) return children.value
    return [...children.value].sort((a, b) =>
      (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
    )
  })

  return {
    filteredChildren,
    sortedChildren,
    filterChildrenRecursive: filterRecursive,
  }
}
