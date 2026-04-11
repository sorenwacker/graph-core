import { computed } from 'vue'
import { buildInheritedColorMap } from './useNodeFiltering.js'

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
 * @param {Ref<boolean>} options.inheritColors - Whether to inherit colors from parent nodes
 * @returns {Object} Layout computeds and functions
 */
export function useCardsLayout({
  children,
  hideCompleted,
  sortAlphabetically,
  containerWidth,
  containerHeight,
  breadcrumbs,
  currentContainer,
  inheritColors,
}) {
  /**
   * Calculate progress from original children (before filtering)
   */
  function calculateProgress(nodeChildren) {
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
   * Recursively filter children, removing completed nodes when hideCompleted is true
   * Preserves original progress counts in _progress property
   */
  function filterChildrenRecursive(nodeList) {
    if (!nodeList) return []
    if (!hideCompleted.value) return nodeList.filter(Boolean)
    return nodeList
      .filter(node => node && !node.completed && !node.inheritedCompleted)
      .map(node => ({
        ...node,
        _progress: calculateProgress(node.children),
        children: node.children ? filterChildrenRecursive(node.children) : [],
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
   * Calculate optimal number of columns for the grid
   */
  function calculateGridColumns(count, w, h) {
    if (count === 0) return 1
    const gap = 10
    let bestCols = 1
    let bestScore = Infinity

    for (let cols = 1; cols <= Math.min(count, 8); cols++) {
      const rows = Math.ceil(count / cols)
      const cardWidth = (w - gap * (cols - 1)) / cols
      const cardHeight = (h - gap * (rows - 1)) / rows
      const ratio = cardWidth / cardHeight
      const score = Math.abs(Math.log(ratio))
      if (score < bestScore) {
        bestScore = score
        bestCols = cols
      }
    }
    return bestCols
  }

  /**
   * Number of columns in the current grid layout
   */
  const gridColumns = computed(() => {
    return calculateGridColumns(filteredChildren.value.length, containerWidth.value, containerHeight.value)
  })

  /**
   * Compute optimal grid layout for cards
   * Tries to make cards as square as possible
   */
  const cardsGridStyle = computed(() => {
    const count = filteredChildren.value.length
    if (count === 0) return {}

    const cols = gridColumns.value
    const rows = Math.ceil(count / cols)
    const gap = 10

    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap: `${gap}px`,
      height: '100%',
    }
  })

  /**
   * Build inherited color map for cards (parent color flows to children)
   * Uses shared buildInheritedColorMap from useNodeFiltering
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
   * Get inherited color for a specific node
   */
  function getNodeColor(node) {
    return inheritedColorMap.value[node.id] || null
  }

  /**
   * Flatten nested children tree into a single array
   * Used by selection, inline edit, and tree expand composables
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
    filteredChildren,
    sortedChildren,
    flatChildren,
    cardSizeClass,
    cardsGridStyle,
    gridColumns,
    filterChildrenRecursive,
    inheritedColorMap,
    getNodeColor,
  }
}
