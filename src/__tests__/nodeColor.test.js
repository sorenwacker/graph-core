import { describe, it, expect } from 'vitest'
import { DEFAULT_NODE_COLOR, hasExplicitColor, resolveNodeColor, buildColorMap } from '../utils/nodeColor.js'

describe('hasExplicitColor', () => {
  it('is false for missing, empty, or placeholder colors', () => {
    expect(hasExplicitColor(null)).toBe(false)
    expect(hasExplicitColor({})).toBe(false)
    expect(hasExplicitColor({ color: '' })).toBe(false)
    expect(hasExplicitColor({ color: DEFAULT_NODE_COLOR })).toBe(false)
  })

  it('is true for a real color', () => {
    expect(hasExplicitColor({ color: '#ff0000' })).toBe(true)
  })
})

describe('resolveNodeColor', () => {
  it('uses the node own color when set', () => {
    expect(resolveNodeColor({ id: 1, color: '#ff0000' })).toBe('#ff0000')
  })

  it('inherits from the nearest ancestor with a color (grandparent)', () => {
    const grandparent = { id: 1, color: '#00ff00' }
    const parent = { id: 2, parent_id: 1 } // no color
    const child = { id: 3, parent_id: 2 } // no color
    const byId = { 1: grandparent, 2: parent, 3: child }
    const color = resolveNodeColor(child, { getParent: n => byId[n.parent_id] || null })
    expect(color).toBe('#00ff00')
  })

  it('prefers the nearer ancestor when multiple ancestors have colors', () => {
    const grandparent = { id: 1, color: '#00ff00' }
    const parent = { id: 2, parent_id: 1, color: '#0000ff' }
    const child = { id: 3, parent_id: 2 }
    const byId = { 1: grandparent, 2: parent, 3: child }
    expect(resolveNodeColor(child, { getParent: n => byId[n.parent_id] || null })).toBe('#0000ff')
  })

  it('falls back to a linked color when no ancestor has one', () => {
    const child = { id: 3, parent_id: 2 }
    const parent = { id: 2 }
    const byId = { 2: parent }
    const color = resolveNodeColor(child, {
      getParent: n => byId[n.parent_id] || null,
      getLinkedColor: () => '#abcdef',
    })
    expect(color).toBe('#abcdef')
  })

  it('returns null when nothing resolves', () => {
    expect(resolveNodeColor({ id: 1 })).toBeNull()
  })

  it('does not inherit when inherit is false', () => {
    const parent = { id: 1, color: '#00ff00' }
    const child = { id: 2, parent_id: 1 }
    const byId = { 1: parent }
    expect(resolveNodeColor(child, { getParent: n => byId[n.parent_id] || null, inherit: false })).toBeNull()
  })

  it('tolerates a cycle in the parent chain', () => {
    const a = { id: 1, parent_id: 2 }
    const b = { id: 2, parent_id: 1 }
    const byId = { 1: a, 2: b }
    expect(resolveNodeColor(a, { getParent: n => byId[n.parent_id] || null })).toBeNull()
  })
})

describe('buildColorMap', () => {
  it('pushes a parent color down to children without their own color', () => {
    const tree = [{ id: 1, color: '#ff0000', children: [{ id: 2, children: [{ id: 3 }] }] }]
    const map = buildColorMap(tree)
    expect(map[1]).toBe('#ff0000')
    expect(map[2]).toBe('#ff0000')
    expect(map[3]).toBe('#ff0000')
  })

  it('lets a child override the inherited color', () => {
    const tree = [{ id: 1, color: '#ff0000', children: [{ id: 2, color: '#00ff00' }] }]
    const map = buildColorMap(tree)
    expect(map[2]).toBe('#00ff00')
  })

  it('does not propagate colors when inherit is false', () => {
    const tree = [{ id: 1, color: '#ff0000', children: [{ id: 2 }] }]
    const map = buildColorMap(tree, null, {}, false)
    expect(map[1]).toBe('#ff0000')
    expect(map[2]).toBeNull()
  })
})
