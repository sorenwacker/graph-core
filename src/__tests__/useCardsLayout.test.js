import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useCardGrid } from '../composables/useCardGrid.js'
import { useCardsLayout } from '../composables/useCardsLayout.js'

describe('useCardsLayout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  let children
  let hideCompleted
  let sortAlphabetically
  let containerWidth
  let containerHeight
  let breadcrumbs
  let currentContainer
  let inheritColors

  beforeEach(() => {
    children = ref([])
    hideCompleted = ref(false)
    sortAlphabetically = ref(false)
    containerWidth = ref(800)
    containerHeight = ref(600)
    breadcrumbs = ref([])
    currentContainer = ref(null)
    inheritColors = ref(true)
  })

  function createLayout() {
    return useCardsLayout({
      children,
      hideCompleted,
      sortAlphabetically,
      containerWidth,
      containerHeight,
      breadcrumbs,
      currentContainer,
      inheritColors,
    })
  }

  describe('initialization', () => {
    it('should return all expected properties', () => {
      const result = createLayout()

      expect(result).toHaveProperty('filteredChildren')
      expect(result).toHaveProperty('sortedChildren')
      expect(result).toHaveProperty('flatChildren')
      expect(result).toHaveProperty('cardSizeClass')
      expect(result).toHaveProperty('cardsGridStyle')
      expect(result).toHaveProperty('gridColumns')
      expect(result).toHaveProperty('inheritedColorMap')
      expect(result).toHaveProperty('getNodeColor')
    })
  })

  describe('filteredChildren', () => {
    it('should return all children when hideCompleted is false', () => {
      children.value = [
        { id: 1, title: 'Task 1', completed: false },
        { id: 2, title: 'Task 2', completed: true },
      ]
      const { filteredChildren } = createLayout()

      expect(filteredChildren.value).toHaveLength(2)
    })

    it('should filter out completed children when hideCompleted is true', () => {
      children.value = [
        { id: 1, title: 'Task 1', completed: false },
        { id: 2, title: 'Task 2', completed: true },
      ]
      hideCompleted.value = true
      const { filteredChildren } = createLayout()

      expect(filteredChildren.value).toHaveLength(1)
      expect(filteredChildren.value[0].id).toBe(1)
    })

    it('should filter completed children recursively', () => {
      children.value = [
        {
          id: 1,
          title: 'Parent',
          completed: false,
          children: [
            { id: 2, title: 'Child 1', completed: false },
            { id: 3, title: 'Child 2', completed: true },
          ],
        },
      ]
      hideCompleted.value = true
      const { filteredChildren } = createLayout()

      expect(filteredChildren.value[0].children).toHaveLength(1)
      expect(filteredChildren.value[0].children[0].id).toBe(2)
    })

    it('should sort alphabetically when sortAlphabetically is true', () => {
      children.value = [
        { id: 1, title: 'Zebra' },
        { id: 2, title: 'Apple' },
        { id: 3, title: 'Mango' },
      ]
      sortAlphabetically.value = true
      const { filteredChildren } = createLayout()

      expect(filteredChildren.value[0].title).toBe('Apple')
      expect(filteredChildren.value[1].title).toBe('Mango')
      expect(filteredChildren.value[2].title).toBe('Zebra')
    })
  })

  describe('sortedChildren', () => {
    it('should return original order when sortAlphabetically is false', () => {
      children.value = [
        { id: 1, title: 'Zebra' },
        { id: 2, title: 'Apple' },
      ]
      const { sortedChildren } = createLayout()

      expect(sortedChildren.value[0].title).toBe('Zebra')
    })

    it('should return sorted order when sortAlphabetically is true', () => {
      children.value = [
        { id: 1, title: 'Zebra' },
        { id: 2, title: 'Apple' },
      ]
      sortAlphabetically.value = true
      const { sortedChildren } = createLayout()

      expect(sortedChildren.value[0].title).toBe('Apple')
    })
  })

  describe('cardSizeClass', () => {
    it('should return card-xl for 1-2 cards', () => {
      children.value = [{ id: 1 }, { id: 2 }]
      const { cardSizeClass } = createLayout()

      expect(cardSizeClass.value).toBe('card-xl')
    })

    it('should return card-lg for 3-4 cards', () => {
      children.value = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
      const { cardSizeClass } = createLayout()

      expect(cardSizeClass.value).toBe('card-lg')
    })

    it('should return card-md for 5-9 cards', () => {
      children.value = Array.from({ length: 9 }, (_, i) => ({ id: i + 1 }))
      const { cardSizeClass } = createLayout()

      expect(cardSizeClass.value).toBe('card-md')
    })

    it('should return card-sm for 10-16 cards', () => {
      children.value = Array.from({ length: 16 }, (_, i) => ({ id: i + 1 }))
      const { cardSizeClass } = createLayout()

      expect(cardSizeClass.value).toBe('card-sm')
    })

    it('should return card-xs for 17+ cards', () => {
      children.value = Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }))
      const { cardSizeClass } = createLayout()

      expect(cardSizeClass.value).toBe('card-xs')
    })
  })

  describe('gridColumns', () => {
    it('should return 1 for empty children', () => {
      const { gridColumns } = createLayout()

      expect(gridColumns.value).toBe(1)
    })

    it('should calculate optimal columns based on container dimensions', () => {
      children.value = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
      containerWidth.value = 800
      containerHeight.value = 600
      const { gridColumns } = createLayout()

      // Algorithm selects columns that make cards closest to square
      expect(gridColumns.value).toBeGreaterThanOrEqual(1)
      expect(gridColumns.value).toBeLessThanOrEqual(4)
    })
  })

  describe('cardsGridStyle', () => {
    it('should return empty object for no children', () => {
      const { cardsGridStyle } = createLayout()

      expect(cardsGridStyle.value).toEqual({})
    })

    it('should return grid style for children', () => {
      children.value = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
      const { cardsGridStyle } = createLayout()

      expect(cardsGridStyle.value.display).toBe('grid')
      expect(cardsGridStyle.value.gridTemplateColumns).toMatch(/repeat\(\d+, 1fr\)/)
      expect(cardsGridStyle.value.gap).toBe('10px')
      expect(cardsGridStyle.value.alignContent).toBe('stretch')
    })
  })

  describe('flatChildren', () => {
    it('should flatten nested children', () => {
      children.value = [
        {
          id: 1,
          title: 'Parent',
          children: [
            { id: 2, title: 'Child 1' },
            {
              id: 3,
              title: 'Child 2',
              children: [{ id: 4, title: 'Grandchild' }],
            },
          ],
        },
      ]
      const { flatChildren } = createLayout()

      expect(flatChildren.value).toHaveLength(4)
      expect(flatChildren.value.map(n => n.id)).toEqual([1, 2, 3, 4])
    })

    it('should handle empty children', () => {
      const { flatChildren } = createLayout()

      expect(flatChildren.value).toEqual([])
    })
  })

  describe('inheritedColorMap', () => {
    it('should include container color in map', () => {
      currentContainer.value = { id: 1, color: '#ff0000' }
      children.value = [{ id: 2 }]
      const { inheritedColorMap } = createLayout()

      expect(inheritedColorMap.value[1]).toBe('#ff0000')
    })

    it('should not inherit ancestor colors to children when inheritColors is false', () => {
      inheritColors.value = false
      currentContainer.value = { id: 1, color: '#ff0000' }
      children.value = [{ id: 2 }] // Child without own color
      const { inheritedColorMap } = createLayout()

      // Container keeps its own color, but child doesn't inherit
      expect(inheritedColorMap.value[2]).toBeNull()
    })

    it('should inherit color from breadcrumbs', () => {
      breadcrumbs.value = [{ id: 1, color: '#00ff00' }, { id: 2 }]
      currentContainer.value = { id: 3 }
      children.value = [{ id: 4 }]
      const { inheritedColorMap } = createLayout()

      expect(inheritedColorMap.value[3]).toBe('#00ff00')
    })
  })

  describe('getNodeColor', () => {
    it('should return color from inheritedColorMap', () => {
      currentContainer.value = { id: 1, color: '#ff0000' }
      children.value = [{ id: 2, color: '#00ff00' }]
      const { getNodeColor } = createLayout()

      expect(getNodeColor({ id: 2 })).toBe('#00ff00')
    })

    it('should return null for nodes not in map', () => {
      children.value = [{ id: 1 }]
      const { getNodeColor } = createLayout()

      expect(getNodeColor({ id: 999 })).toBeNull()
    })
  })

  describe('progress calculation', () => {
    it('should preserve progress info when filtering', () => {
      children.value = [
        {
          id: 1,
          title: 'Parent',
          completed: false,
          children: [
            { id: 2, title: 'Task 1', type: 'task', completed: true },
            { id: 3, title: 'Task 2', type: 'task', completed: false },
          ],
        },
      ]
      hideCompleted.value = true
      const { filteredChildren } = createLayout()

      expect(filteredChildren.value[0]._progress).toEqual({
        completed: 1,
        total: 2,
        percent: 50,
      })
    })
  })
})

/**
 * The column count used to be chosen purely to make cards square. On a wide
 * window that produced many narrow columns, and a card narrow enough to
 * truncate its children's names ("HPC Admin C...") and cut its note mid-word.
 * A card has a readable width first; squareness decides between the options
 * that clear it.
 */
describe('cards stay wide enough to read', () => {
  function columnsFor(count, width, height) {
    const { gridColumns } = useCardGrid({
      items: ref(Array.from({ length: count }, (_, i) => ({ id: i + 1 }))),
      containerWidth: ref(width),
      containerHeight: ref(height),
    })
    return gridColumns.value
  }

  it('does not slice a wide window into narrow columns', () => {
    const cols = columnsFor(14, 2000, 950)
    const cardWidth = (2000 - 10 * (cols - 1)) / cols
    expect(cardWidth, `${cols} columns gave ${cardWidth}px cards`).toBeGreaterThanOrEqual(360)
  })

  it('holds the same floor on a laptop window', () => {
    const cols = columnsFor(14, 1440, 800)
    const cardWidth = (1440 - 10 * (cols - 1)) / cols
    expect(cardWidth).toBeGreaterThanOrEqual(360)
  })

  it('still uses a single column when the window is narrower than one card', () => {
    expect(columnsFor(6, 320, 800)).toBe(1)
  })

  it('never asks for more columns than there are cards', () => {
    expect(columnsFor(2, 2400, 900)).toBeLessThanOrEqual(2)
  })
})

/**
 * Rows used to divide the window height between them, with a floor as low as
 * 80px. Fourteen cards over four rows left each one too short for its own
 * contents, so the child list was sliced through the middle. A card keeps a
 * height it can show something in, and the view scrolls when they do not all
 * fit - a card cut in half is worse than one below the fold.
 */
describe('cards keep a usable height', () => {
  function rowsFor(count, width, height) {
    const { cardsGridStyle } = useCardGrid({
      items: ref(Array.from({ length: count }, (_, i) => ({ id: i + 1 }))),
      containerWidth: ref(width),
      containerHeight: ref(height),
    })
    return cardsGridStyle.value.gridAutoRows
  }

  it('does not shrink rows below a readable height when there are many cards', () => {
    const rows = rowsFor(14, 2000, 950)
    const min = Number((rows.match(/minmax\((\d+)px/) || [])[1])
    expect(min, `rows could collapse to ${rows}`).toBeGreaterThanOrEqual(260)
  })

  it('keeps the same floor as the count grows', () => {
    for (const count of [10, 17, 40]) {
      const min = Number((rowsFor(count, 2000, 950).match(/minmax\((\d+)px/) || [])[1])
      expect(min, `${count} cards`).toBeGreaterThanOrEqual(260)
    }
  })

  it('still lets a small number of cards stretch to fill the window', () => {
    expect(rowsFor(2, 2000, 950)).toMatch(/1fr\)$/)
  })
})
