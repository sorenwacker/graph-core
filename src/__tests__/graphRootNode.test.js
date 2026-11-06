import { describe, it, expect } from 'vitest'
import { buildElements } from '../composables/useGraphElements.js'

// The show-root-node toggle alone decides whether the container being viewed
// is drawn. Filters apply to the children, never to the node the user entered.

const nodeIds = elements => elements.filter(e => !e.data.source).map(e => e.data.id)

function build(parentNode, nodeList, extra = {}) {
  return buildElements({ nodeList, parentNode, visibleTypes: ['note', 'task'], ...extra })
}

describe('root node at a leaf', () => {
  const leaf = { id: 7, title: 'Leaf', type: 'note', children: [] }

  it('draws the leaf when the root node is shown', () => {
    expect(nodeIds(build(leaf, [], { showRootNode: true }))).toEqual(['7'])
  })

  it('hides the leaf when the root node is turned off', () => {
    expect(nodeIds(build(leaf, [], { showRootNode: false }))).toEqual([])
  })

  it('draws a completed leaf while completed nodes are hidden', () => {
    const done = { ...leaf, completed: 1 }
    expect(nodeIds(build(done, [], { showRootNode: true, hideCompleted: true }))).toEqual(['7'])
  })

  it('draws a leaf whose type is filtered out of the listing', () => {
    const person = { ...leaf, type: 'person' }
    expect(nodeIds(build(person, [], { showRootNode: true }))).toEqual(['7'])
  })

  it('draws the leaf when its only children are hidden', () => {
    const child = { id: 8, title: 'Done child', type: 'note', completed: 1, parent_id: 7, children: [] }
    const elements = build(leaf, [child], { showRootNode: true, hideCompleted: true })
    expect(nodeIds(elements)).toEqual(['7'])
    expect(elements.filter(e => e.data.source)).toEqual([])
  })
})

describe('root node with children', () => {
  const parent = { id: 1, title: 'Parent', type: 'note' }
  const child = { id: 2, title: 'Child', type: 'note', parent_id: 1, children: [] }

  it('draws the root and an edge to each child when shown', () => {
    const elements = build(parent, [child], { showRootNode: true })
    expect(nodeIds(elements)).toEqual(['1', '2'])
    expect(elements.some(e => e.data.source === '1' && e.data.target === '2')).toBe(true)
  })

  it('draws only the children when the root is turned off', () => {
    const elements = build(parent, [child], { showRootNode: false })
    expect(nodeIds(elements)).toEqual(['2'])
    expect(elements.filter(e => e.data.source)).toEqual([])
  })
})
