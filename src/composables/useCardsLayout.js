import { computed } from 'vue'

const DEFAULT_NODE_COLOR = '#0f4c75'

/**
 * Composable for cards view layout calculations and filtering.
 * Handles grid style computation, card sizing, child filtering, and color inheritance.
 *
 * @param {Object} options
 * @param {Ref<Array>} options.children - Raw children nodes
 * @param {Ref<boolean>} options.hideCompleted - Whether to hide completed items
 * @param {Ref<boolean>} options.sortAlphabetically - Whether to sort alphabetically
 * @param {Ref<number>} options.containerWidth - Container width in pixels
 * @param {Ref<number>} options.containerHeight - Container height in pixels
 * @param {Ref<Array>} options.breadcrumbs - Breadcrumb path for color inheritance
 * @param {Ref<Object>} options.currentContainer - Current container node
 * @returns {Object} Layout computeds and functions
 */
export function useCardsLayout({
  children,
  hideCompleted,
  sortAlphabetically,
  containerWidth,
  containerHeight,
  breadcrumbs,
  currentContainer
}) {
  /**
   * Recursively filter children, removing completed nodes when hideCompleted is true
   */
  function filterChildrenRecursive(nodeList) {
    if (!nodeList) return []
    if (!hideCompleted.value) return nodeList.filter(Boolean)
    return nodeList
      .filter(node => node && !node.completed && !node.inheritedCompleted)
      .map(node => ({
        ...node,
        children: node.children ? filterChildrenRecursive(node.children) : []
      }))
  }

  /**
   * Filtered and optionally sorted children for cards view
   */
  const filteredChildren = computed(() => {
    let result = filterChildrenRecursive(children.value)
    if (sortAlphabetically.value) {
      result = [...result].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
    }
    return result
  })

  /**
   * Sorted children for graph/timeline views (no completion filtering)
   */
  const sortedChildren = computed(() => {
    if (!sortAlphabetically.value) return children.value
    return [...children.value].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
  })

  /**
   * Card size class based on number of cards
   * xl: 1-2 cards, lg: 3-4, md: 5-9, sm: 10-16, xs: 17+
   */
  const cardSizeClass = computed(() => {
    const count = filteredChildren.value.length
    if (count <= 2) return 'card-xl'
    if (count <= 4) return 'card-lg'
    if (count <= 9) return 'card-md'
    if (count <= 16) return 'card-sm'
    return 'card-xs'
  })

  /**
   * Compute optimal grid layout for cards
   * Tries to make cards as square as possible
   */
  const cardsGridStyle = computed(() => {
    const count = filteredChildren.value.length
    if (count === 0) return {}

    const w = containerWidth.value
    const h = containerHeight.value
    const gap = 10

    // Find optimal columns by minimizing difference from square cards
    let bestCols = 1
    let bestScore = Infinity

    for (let cols = 1; cols <= Math.min(count, 8); cols++) {
      const rows = Math.ceil(count / cols)
      const cardWidth = (w - gap * (cols - 1)) / cols
      const cardHeight = (h - gap * (rows - 1)) / rows
      // Score: how far from square (1:1 ratio). Lower is better.
      const ratio = cardWidth / cardHeight
      const score = Math.abs(Math.log(ratio)) // log(1) = 0 for perfect square
      if (score < bestScore) {
        bestScore = score
        bestCols = cols
      }
    }

    const rows = Math.ceil(count / bestCols)

    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${bestCols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap: `${gap}px`,
      height: '100%'
    }
  })

  /**
   * Build inherited color map for cards (parent color flows to children)
   */
  const inheritedColorMap = computed(() => {
    const colorMap = {}
    function buildMap(nodeList, inheritedColor = null) {
      if (!nodeList) return
      for (const node of nodeList) {
        if (!node || !node.id) continue
        const hasOwnColor = node.color && node.color !== DEFAULT_NODE_COLOR
        const effectiveColor = hasOwnColor ? node.color : inheritedColor
        colorMap[node.id] = effectiveColor
        if (node.children?.length) {
          buildMap(node.children, effectiveColor)
        }
      }
    }
    // Find inherited color from ancestors (breadcrumbs)
    let ancestorColor = null
    if (breadcrumbs?.value) {
      for (const ancestor of breadcrumbs.value) {
        if (ancestor && ancestor.color && ancestor.color !== DEFAULT_NODE_COLOR) {
          ancestorColor = ancestor.color
        }
      }
    }
    // Start with container's own color, or inherited from ancestors
    const containerColor = currentContainer?.value?.color && currentContainer.value.color !== DEFAULT_NODE_COLOR
      ? currentContainer.value.color
      : ancestorColor
    buildMap(children.value, containerColor)
    return colorMap
  })

  /**
   * Get inherited color for a specific node
   */
  function getNodeColor(node) {
    return inheritedColorMap.value[node.id] || null
  }

  return {
    filteredChildren,
    sortedChildren,
    cardSizeClass,
    cardsGridStyle,
    filterChildrenRecursive,
    inheritedColorMap,
    getNodeColor
  }
}
