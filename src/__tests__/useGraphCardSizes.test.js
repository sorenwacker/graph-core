import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useGraphLayout } from '../composables/useGraphLayout.js'

/**
 * The graph's node boxes follow their rendered cards (docs/guides/views.md,
 * "Graph View"), so edges end at the card border. The cards live in the DOM
 * and are rebuilt by the label plugin on every data or style change, so the
 * watcher has to pick up cards that appear later, not only the ones present
 * when it starts.
 */

let resizeCallback
let observed
let mutationCallback

class FakeResizeObserver {
  constructor(cb) {
    resizeCallback = cb
  }
  observe(el) {
    observed.add(el)
  }
  unobserve(el) {
    observed.delete(el)
  }
  disconnect() {
    observed.clear()
  }
}

class FakeMutationObserver {
  constructor(cb) {
    mutationCallback = cb
  }
  observe() {}
  disconnect() {
    mutationCallback = null
  }
}

function card(id, width, height) {
  const el = document.createElement('div')
  el.className = 'node-html'
  el.dataset.nodeId = id
  Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true })
  Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true })
  return el
}

function fakeCy() {
  const nodes = new Map()
  const cy = {
    nodes: () => ({ forEach: fn => nodes.forEach(fn) }),
    getElementById: id => nodes.get(id) || { length: 0 },
    container: () => container,
    batch: fn => fn(),
    add(id, width = 180, height = 80) {
      const node = {
        length: 1,
        id: () => id,
        width: () => width,
        height: () => height,
        style: vi.fn(s => {
          width = s.width
          height = s.height
        }),
      }
      nodes.set(id, node)
      return node
    },
  }
  const container = document.createElement('div')
  return { cy, container }
}

describe('graph node boxes follow their cards', () => {
  let cy, container, layout

  beforeEach(() => {
    observed = new Set()
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    vi.stubGlobal('MutationObserver', FakeMutationObserver)
    ;({ cy, container } = fakeCy())
    layout = useGraphLayout({ getCy: () => cy })
  })

  afterEach(() => {
    layout.cleanup()
    vi.unstubAllGlobals()
  })

  it('sizes a node box to the card that is already rendered', () => {
    const node = cy.add('a')
    container.appendChild(card('a', 300, 120))
    layout.watchCardSizes(container)
    resizeCallback([{ target: container.firstChild }])
    expect(node.style).toHaveBeenCalledWith({ width: 300, height: 120 })
  })

  it('picks up a card the label plugin renders later', () => {
    const node = cy.add('b')
    layout.watchCardSizes(container)
    const later = card('b', 250, 90)
    container.appendChild(later)
    mutationCallback([{ addedNodes: [later], removedNodes: [] }])
    expect(observed.has(later)).toBe(true)
    resizeCallback([{ target: later }])
    expect(node.style).toHaveBeenCalledWith({ width: 250, height: 90 })
  })

  it('does not rewrite a box that already matches, which would re-render the card forever', () => {
    const node = cy.add('c', 300, 120)
    container.appendChild(card('c', 300, 120))
    layout.watchCardSizes(container)
    resizeCallback([{ target: container.firstChild }])
    expect(node.style).not.toHaveBeenCalled()
  })

  it('measures only cards inside the graph, not table rows that share the attribute', () => {
    const node = cy.add('d')
    const row = card('d', 900, 30)
    document.body.appendChild(row)
    container.appendChild(card('d', 200, 70))
    layout.syncNodeDimensions()
    expect(node.style).toHaveBeenCalledWith({ width: 200, height: 70 })
    row.remove()
  })

  it('stops observing on cleanup', () => {
    container.appendChild(card('e', 1, 1))
    layout.watchCardSizes(container)
    expect(observed.size).toBe(1)
    layout.cleanup()
    expect(observed.size).toBe(0)
  })
})
