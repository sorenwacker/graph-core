import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useTimelineDrag } from '../composables/useTimelineDrag.js'

/**
 * Timeline drag tests.
 *
 * Focused on handleDragEnd field mapping: a due_date-only node renders with its
 * due_date on the LEFT edge of the bar (displayDate = due_date), so a move must
 * write the dragged start side to due_date, not the end side.
 */

const PX_PER_DAY = 10
const BASE = new Date('2026-01-01T00:00:00Z').getTime()
const DAY_MS = 86400000

function makeDrag(emit) {
  return useTimelineDrag({
    getDatePosition: d => ((new Date(d).getTime() - BASE) / DAY_MS) * PX_PER_DAY,
    positionToDate: p => new Date(BASE + Math.round(p / PX_PER_DAY) * DAY_MS).toISOString().slice(0, 10),
    scrollableRef: ref({ getBoundingClientRect: () => ({ left: 0 }), scrollLeft: 0 }),
    zoomLevel: ref(PX_PER_DAY),
    emit,
    getBarStyle: () => ({}),
  })
}

function dragMoveBy(drag, node, pixels) {
  const startX = node.displayDate ? ((new Date(node.displayDate).getTime() - BASE) / DAY_MS) * PX_PER_DAY : 0
  drag.handleDragStart({ preventDefault() {}, stopPropagation() {}, clientX: startX }, node, 'move')
  drag.handleDragMove({ clientX: startX + pixels })
  drag.handleDragEnd()
}

describe('useTimelineDrag handleDragEnd', () => {
  it('maps a due_date-only move to the start (left) edge', () => {
    const emit = vi.fn()
    const drag = makeDrag(emit)
    const node = { id: 1, due_date: '2026-01-10', displayDate: '2026-01-10', endDisplayDate: '2026-01-20' }

    dragMoveBy(drag, node, 4 * PX_PER_DAY) // shift right by 4 days

    const update = emit.mock.calls.find(c => c[0] === 'update')
    expect(update).toBeTruthy()
    expect(update[1]).toEqual({ id: 1, due_date: '2026-01-14' })
    // regression: must not write the end-side date to due_date
    expect(update[1].due_date).not.toBe('2026-01-24')
  })

  it('moves start_date and end_date together for a ranged node', () => {
    const emit = vi.fn()
    const drag = makeDrag(emit)
    const node = {
      id: 2,
      start_date: '2026-01-10',
      end_date: '2026-01-20',
      displayDate: '2026-01-10',
      endDisplayDate: '2026-01-20',
    }

    dragMoveBy(drag, node, 4 * PX_PER_DAY)

    const update = emit.mock.calls.find(c => c[0] === 'update')
    expect(update[1]).toEqual({ id: 2, start_date: '2026-01-14', end_date: '2026-01-24' })
  })
})
