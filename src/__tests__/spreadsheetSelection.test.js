import { describe, it, expect, beforeEach } from 'vitest'
import { useSpreadsheetSelection } from '../composables/useSpreadsheetSelection.js'

const columns = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]

let selection

beforeEach(() => {
  selection = useSpreadsheetSelection({
    getColumns: () => columns,
    getRowCount: () => 4,
    getGridWrapper: () => null,
    refreshCells: () => {},
    clearTypingBuffer: () => {},
  })
})

function select(startRow, startCol, endRow, endCol) {
  selection.selectionStart.value = { row: startRow, col: startCol }
  selection.selectionEnd.value = { row: endRow, col: endCol }
}

describe('selection range edges', () => {
  it('reports no edges when nothing is selected', () => {
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      expect(selection.isSelectionEdge(0, 0, edge)).toBe(false)
    }
  })

  it('reports every edge for a single selected cell', () => {
    select(1, 1, 1, 1)
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      expect(selection.isSelectionEdge(1, 1, edge)).toBe(true)
    }
  })

  it('marks only the outer sides of a range so the border wraps the range, not each cell', () => {
    // Range spans rows 1-2, columns 0-2. The middle cell of the top row is on
    // the top edge only; drawing all four sides here would box every cell.
    select(1, 0, 2, 2)

    expect(selection.isSelectionEdge(1, 1, 'top')).toBe(true)
    expect(selection.isSelectionEdge(1, 1, 'bottom')).toBe(false)
    expect(selection.isSelectionEdge(1, 1, 'left')).toBe(false)
    expect(selection.isSelectionEdge(1, 1, 'right')).toBe(false)

    expect(selection.isSelectionEdge(2, 0, 'bottom')).toBe(true)
    expect(selection.isSelectionEdge(2, 0, 'left')).toBe(true)
    expect(selection.isSelectionEdge(2, 0, 'top')).toBe(false)
    expect(selection.isSelectionEdge(2, 2, 'right')).toBe(true)
  })

  it('reports no edges for a cell outside the selection', () => {
    select(1, 0, 2, 1)
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      expect(selection.isSelectionEdge(0, 2, edge)).toBe(false)
    }
  })

  it('handles a range dragged upwards and to the left', () => {
    // selectionEnd before selectionStart: bounds normalise, edges follow.
    select(3, 2, 1, 1)
    expect(selection.isSelectionEdge(1, 1, 'top')).toBe(true)
    expect(selection.isSelectionEdge(1, 1, 'left')).toBe(true)
    expect(selection.isSelectionEdge(3, 2, 'bottom')).toBe(true)
    expect(selection.isSelectionEdge(3, 2, 'right')).toBe(true)
  })

  it('ignores an unknown edge name', () => {
    select(1, 1, 1, 1)
    expect(selection.isSelectionEdge(1, 1, 'diagonal')).toBe(false)
  })
})
