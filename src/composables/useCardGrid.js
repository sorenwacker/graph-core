import { computed } from 'vue'

/**
 * Composable for card grid layout calculations.
 * Handles grid column computation, card sizing, and grid styles.
 *
 * @param {Object} options
 * @param {Ref<Array>} options.items - Array of items to display in grid
 * @param {Ref<number>} options.containerWidth - Container width in pixels
 * @param {Ref<number>} options.containerHeight - Container height in pixels
 * @returns {Object} Grid layout computeds
 */
export function useCardGrid({ items, containerWidth, containerHeight }) {
  /**
   * Calculate optimal number of columns for the grid.
   * Algorithm selects columns that make cards as close to square as possible.
   *
   * @param {number} count - Number of items
   * @param {number} w - Container width
   * @param {number} h - Container height
   * @returns {number} Optimal number of columns
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
   * Card size class based on number of cards.
   * xl: 1-2 cards, lg: 3-4, md: 5-9, sm: 10-16, xs: 17+
   */
  const cardSizeClass = computed(() => {
    const count = items.value.length
    if (count <= 2) return 'card-xl'
    if (count <= 4) return 'card-lg'
    if (count <= 9) return 'card-md'
    if (count <= 16) return 'card-sm'
    return 'card-xs'
  })

  /**
   * Number of columns in the current grid layout.
   */
  const gridColumns = computed(() => {
    return calculateGridColumns(items.value.length, containerWidth.value, containerHeight.value)
  })

  /**
   * Compute optimal grid layout style for cards.
   * Uses minmax for rows to fill available space while allowing content to determine minimum.
   */
  const cardsGridStyle = computed(() => {
    const count = items.value.length
    if (count === 0) return {}

    const cols = gridColumns.value
    const gap = 10

    // Calculate minimum card height based on count
    // More cards = smaller minimum height
    const minHeight = count <= 2 ? '200px' : count <= 4 ? '150px' : count <= 9 ? '120px' : '80px'

    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridAutoRows: `minmax(${minHeight}, 1fr)`,
      gap: `${gap}px`,
      alignContent: 'stretch',
    }
  })

  return {
    cardSizeClass,
    cardsGridStyle,
    gridColumns,
    calculateGridColumns,
  }
}
