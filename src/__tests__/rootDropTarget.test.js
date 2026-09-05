import { describe, it, expect, vi } from 'vitest'
import {
  ROOT_DROP_ACTIVE_CLASS,
  findRootDropTarget,
  setRootDropHighlight,
  nodeIdFromDragEvent,
} from '../utils/rootDropTarget.js'

/**
 * Graph, cards and table view each drag by a different mechanism - a canvas
 * grab, native HTML5 drag-and-drop, and a mouse-tracked ghost - so the check
 * for "is the pointer over the breadcrumb home icon" lives here rather than
 * three times over. See docs/guides/drag-drop.md.
 */

function fakeDoc({ hit = null, crumb = null } = {}) {
  return {
    elementFromPoint: vi.fn(() => hit),
    querySelector: vi.fn(() => crumb),
  }
}

function fakeElement(matches) {
  const el = { classList: { add: vi.fn(), remove: vi.fn() } }
  el.closest = vi.fn(() => (matches ? el : null))
  return el
}

describe('findRootDropTarget', () => {
  it('returns the home crumb when the pointer is over it', () => {
    const crumb = fakeElement(true)
    const doc = fakeDoc({ hit: crumb })

    expect(findRootDropTarget(10, 20, doc)).toBe(crumb)
    expect(doc.elementFromPoint).toHaveBeenCalledWith(10, 20)
  })

  it('returns null when the pointer is over something else', () => {
    expect(findRootDropTarget(10, 20, fakeDoc({ hit: fakeElement(false) }))).toBeNull()
  })

  it('returns null when the pointer is over nothing at all', () => {
    expect(findRootDropTarget(10, 20, fakeDoc({ hit: null }))).toBeNull()
  })
})

describe('setRootDropHighlight', () => {
  it('marks the crumb while a node is over it', () => {
    const crumb = fakeElement(true)
    setRootDropHighlight(true, fakeDoc({ crumb }))
    expect(crumb.classList.add).toHaveBeenCalledWith(ROOT_DROP_ACTIVE_CLASS)
  })

  it('clears the mark when the node leaves', () => {
    const crumb = fakeElement(true)
    setRootDropHighlight(false, fakeDoc({ crumb }))
    expect(crumb.classList.remove).toHaveBeenCalledWith(ROOT_DROP_ACTIVE_CLASS)
  })

  it('does nothing when there is no breadcrumb on screen', () => {
    expect(() => setRootDropHighlight(true, fakeDoc({ crumb: null }))).not.toThrow()
  })
})

describe('nodeIdFromDragEvent', () => {
  it('reads the dragged node id that the card drag put on the event', () => {
    expect(nodeIdFromDragEvent({ dataTransfer: { getData: () => '42' } })).toBe(42)
  })

  it('returns null when the payload is not a node id', () => {
    expect(nodeIdFromDragEvent({ dataTransfer: { getData: () => 'some text' } })).toBeNull()
  })

  it('returns null when the event carries no data at all', () => {
    expect(nodeIdFromDragEvent({})).toBeNull()
  })
})
