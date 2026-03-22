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
    children: currentDepth < maxDepth && n.children?.length
      ? filterByDepth(n.children, maxDepth, currentDepth + 1)
      : []
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
      children: n.children ? filterCompletedNodes(n.children) : []
    }))
}

/**
 * Sort nodes recursively by title alphabetically.
 * @param {Array} nodeList - Array of nodes to sort
 * @returns {Array} Sorted node array
 */
export function sortNodesRecursively(nodeList) {
  if (!nodeList) return []
  return [...nodeList]
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    .map(n => ({
      ...n,
      children: n.children ? sortNodesRecursively(n.children) : []
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
      children: n.children ? filterByType(n.children, types) : []
    }))
}

/**
 * Build a map of inherited colors from parent to children.
 * Colors flow down unless a child has its own color set.
 * @param {Array} nodeList - Array of nodes to process
 * @param {string|null} inheritedColor - Color inherited from parent
 * @param {Object} colorMap - Map accumulator (used internally)
 * @returns {Object} Map of nodeId -> effective color
 */
export function buildInheritedColorMap(nodeList, inheritedColor = null, colorMap = {}) {
  if (!nodeList) return colorMap
  for (const node of nodeList) {
    if (!node || !node.id) continue
    // Node's effective color: own color if set, otherwise inherited
    const hasOwnColor = node.color && node.color !== '#0f4c75'
    const effectiveColor = hasOwnColor ? node.color : inheritedColor
    colorMap[node.id] = effectiveColor

    // Pass effective color to children
    if (node.children?.length) {
      buildInheritedColorMap(node.children, effectiveColor, colorMap)
    }
  }
  return colorMap
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
    buildInheritedColorMap
  }
}
