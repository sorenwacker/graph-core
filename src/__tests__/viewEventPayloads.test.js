import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CardsView from '../components/CardsView.vue'
import { useSelection } from '../composables/useSelection'

/**
 * Views emit events that App's handlers consume by shape. A view that emits the
 * wrong shape fails silently: the handler destructures undefined and does
 * nothing, so the interaction looks unresponsive rather than broken.
 *
 * `handleMultiSelect` takes an options object ({ node, add } or { nodes,
 * nodeIds }); `toggleComplete` takes a node, not an id.
 */

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
})

const NODES = [
  { id: 1, title: 'One', type: 'note', children: [] },
  { id: 2, title: 'Two', type: 'note', children: [] },
]

function renderCards() {
  return mount(CardsView, {
    props: { nodes: NODES, selectedNodeId: null },
    global: { stubs: { CardNotes: true, CardTitleEdit: true, TableMiniature: true } },
  })
}

describe('CardsView shift+click', () => {
  it('emits an options object, not a bare node', async () => {
    const w = renderCards()
    await w.findAll('.node-card')[0].trigger('click', { shiftKey: true })

    const payload = w.emitted('select-multiple')?.[0]?.[0]
    expect(payload).toBeTypeOf('object')
    expect(payload).toHaveProperty('node')
    expect(payload.node.id).toBe(1)
  })

  it('emits a payload that actually selects the node when handled', async () => {
    const w = renderCards()
    await w.findAll('.node-card')[0].trigger('click', { shiftKey: true })
    const payload = w.emitted('select-multiple')[0][0]

    // Feed the real emitted payload to the real handler: a bare node would
    // destructure to undefined here and select nothing at all.
    const selection = useSelection()
    selection.clearSelection?.()
    selection.handleMultiSelect(payload)
    expect(selection.selectedIds.value.has(1)).toBe(true)
  })
})

describe('TableView tooltip checkbox', () => {
  it('emits a node object for toggle-complete, not an id', async () => {
    // The tooltip composable hands the view a node id; the view is responsible
    // for resolving it, because every toggle-complete consumer takes a node.
    const captured = []
    vi.resetModules()
    vi.doMock('../composables/useNodeTooltip.js', () => ({
      useNodeTooltip: opts => {
        captured.push(opts)
        return { showTooltip: () => {}, hideTooltip: () => {}, isLocked: { value: false } }
      },
    }))
    const TableView = (await import('../components/TableView.vue')).default

    const w = mount(TableView, {
      props: { nodes: NODES, selectedNodeId: null },
      global: { stubs: { TableMiniature: true, CardNotes: true } },
    })

    captured[0].onToggleComplete(2)
    const payload = w.emitted('toggle-complete')?.[0]?.[0]
    expect(payload).toBeTypeOf('object')
    expect(payload.id).toBe(2)
    vi.doUnmock('../composables/useNodeTooltip.js')
  })
})
