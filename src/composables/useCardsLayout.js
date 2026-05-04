import { useChildrenFiltering } from './useNodeFiltering.js'
import { useCardGrid } from './useCardGrid.js'
import { useColorInheritance } from './useColorInheritance.js'
import { useTreeFlattening } from './useTreeFlattening.js'

/**
 * Composable for cards view layout calculations and filtering.
 * Orchestrates grid style computation, card sizing, child filtering, and color inheritance
 * by composing smaller focused units.
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
  // Compose filtering logic
  const { filteredChildren, sortedChildren, filterChildrenRecursive } = useChildrenFiltering({
    children,
    hideCompleted,
    sortAlphabetically,
  })

  // Compose grid layout logic (uses filteredChildren for grid calculations)
  const { cardSizeClass, cardsGridStyle, gridColumns } = useCardGrid({
    items: filteredChildren,
    containerWidth,
    containerHeight,
  })

  // Compose color inheritance logic
  const { inheritedColorMap, getNodeColor } = useColorInheritance({
    children,
    breadcrumbs,
    currentContainer,
    inheritColors,
  })

  // Compose tree flattening logic
  const { flatChildren } = useTreeFlattening({
    children,
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
