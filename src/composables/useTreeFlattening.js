import { computed } from 'vue'

/**
 * Composable for flattening hierarchical node trees.
 * Used by selection, inline edit, and tree expand composables.
 *
 * @param {Object} options
 * @param {Ref<Array>} options.children - Root nodes of the tree
 * @returns {Object} Tree flattening computeds
 */
export function useTreeFlattening({ children }) {
  /**
   * Flatten nested children tree into a single array.
   * Traverses depth-first, collecting all nodes including nested children.
   */
  const flatChildren = computed(() => {
    const result = []

    function flatten(nodeList) {
      if (!nodeList) return
      for (const node of nodeList) {
        if (!node) continue
        result.push(node)
        if (node.children?.length) {
          flatten(node.children)
        }
      }
    }

    flatten(children.value)
    return result
  })

  return {
    flatChildren,
  }
}
