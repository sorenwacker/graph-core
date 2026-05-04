import { computed } from 'vue'
import { buildInheritedColorMap } from './useNodeFiltering.js'

const DEFAULT_NODE_COLOR = '#0f4c75'

/**
 * Composable for color inheritance in node hierarchies.
 * Colors flow from parent nodes to children unless a child has its own color.
 *
 * @param {Object} options
 * @param {Ref<Array>} options.children - Child nodes to process
 * @param {Ref<Array>} options.breadcrumbs - Breadcrumb path for ancestor color lookup
 * @param {Ref<Object>} options.currentContainer - Current container node
 * @param {Ref<boolean>} options.inheritColors - Whether to inherit colors from parent nodes
 * @returns {Object} Color inheritance computeds and functions
 */
export function useColorInheritance({ children, breadcrumbs, currentContainer, inheritColors }) {
  /**
   * Build inherited color map for nodes (parent color flows to children).
   * Uses shared buildInheritedColorMap from useNodeFiltering.
   */
  const inheritedColorMap = computed(() => {
    const shouldInherit = inheritColors?.value !== false

    // Find inherited color from ancestors (breadcrumbs)
    let ancestorColor = null
    if (shouldInherit && breadcrumbs?.value) {
      for (const ancestor of breadcrumbs.value) {
        if (ancestor && ancestor.color && ancestor.color !== DEFAULT_NODE_COLOR) {
          ancestorColor = ancestor.color
        }
      }
    }

    // Container's own color, or inherited from ancestors
    const containerHasOwnColor = currentContainer?.value?.color && currentContainer.value.color !== DEFAULT_NODE_COLOR
    const containerColor = containerHasOwnColor ? currentContainer.value.color : shouldInherit ? ancestorColor : null

    // Build color map using shared function
    const colorMap = buildInheritedColorMap(children.value, shouldInherit ? containerColor : null, {}, shouldInherit)

    // Add container itself to the map
    if (currentContainer?.value?.id) {
      colorMap[currentContainer.value.id] = containerColor
    }

    return colorMap
  })

  /**
   * Get inherited color for a specific node.
   *
   * @param {Object} node - Node to get color for
   * @returns {string|null} The effective color for the node, or null
   */
  function getNodeColor(node) {
    return inheritedColorMap.value[node.id] || null
  }

  return {
    inheritedColorMap,
    getNodeColor,
  }
}
