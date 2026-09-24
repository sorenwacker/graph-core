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
// The narrowest a card may be before its children's names truncate and its
// note breaks mid-word. Squareness decides between the widths that clear it.
const MIN_CARD_WIDTH = 360

export function useCardGrid({ items, containerWidth, containerHeight }) {
  /**
   * Calculate optimal number of columns for the grid.
   * Cards must first be wide enough to read; among the counts that clear that,
   * the one making cards closest to square wins.
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
    // How many cards fit at a readable width; at least one, however narrow the
    // window, because one cramped card beats a column too narrow to use.
    const maxCols = Math.max(1, Math.floor((w + gap) / (MIN_CARD_WIDTH + gap)))

    for (let cols = 1; cols <= Math.min(count, 8, maxCols); cols++) {
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

    // The floor a card needs to show its header, note and a row or two of
    // children. Rows used to divide the window between them and shrink to fit,
    // which sliced the child list of every card in the first row. With a floor
    // they keep their height and the view scrolls instead: a card below the
    // fold is easier to deal with than one cut in half. `1fr` still lets a
    // handful of cards stretch to fill the window.
    const minHeight = count <= 2 ? '320px' : '280px'

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
