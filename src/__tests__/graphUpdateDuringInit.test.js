import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'

// Entering a container sets the container before its children arrive. When
// that also rebuilds the graph (the container has its own root-node or filter
// setting), the children's update used to be dropped because it came in while
// the rebuild was still laying out, and the graph showed the previous view
// until something else changed or the app was reloaded.

// Every method the component calls on the instance is a no-op returning an
// empty collection, except destroyed(), which reports a live instance.
const fakeCy = () => {
  const collection = new Proxy(function () {}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined
      if (prop === 'length') return 0
      if (prop === 'destroyed') return () => false
      if (prop === 'forEach') return () => {}
      return collection
    },
    apply: () => collection,
  })
  return collection
}

let finishLayout
const updateGraph = vi.fn(async () => {})

vi.mock('../composables/useGraphInit.js', () => ({
  useGraphInit: () => ({
    createCytoscapeInstance: () => fakeCy(),
    setupHtmlLabels() {},
    applyInitialLayout: (_cy, _hasPos, done) => {
      finishLayout = done
    },
  }),
}))

vi.mock('../composables/useGraphUpdate.js', () => ({
  useGraphUpdate: () => ({
    buildElementsWithLinks: async () => [],
    updateGraph,
  }),
}))

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)

let host, teleportTarget

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  teleportTarget = document.createElement('div')
  teleportTarget.id = 'view-controls-target'
  document.body.appendChild(teleportTarget)
  updateGraph.mockClear()
  finishLayout = null
})
afterEach(() => {
  host.remove()
  teleportTarget.remove()
})

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe('an update that arrives while the graph is initializing', () => {
  it('is applied once the initial layout completes', async () => {
    const { default: GraphView } = await import('../components/GraphView.vue')
    const w = mount(GraphView, {
      props: { nodes: [] },
      attachTo: host,
      global: { plugins: [createPinia()] },
    })
    await flush()
    expect(finishLayout).toBeTypeOf('function')

    // Children arrive mid-initialization.
    await w.vm.updateGraph()
    expect(updateGraph).not.toHaveBeenCalled()

    finishLayout()
    await flush()
    expect(updateGraph).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('does nothing extra when no update arrived meanwhile', async () => {
    const { default: GraphView } = await import('../components/GraphView.vue')
    const w = mount(GraphView, {
      props: { nodes: [] },
      attachTo: host,
      global: { plugins: [createPinia()] },
    })
    await flush()
    finishLayout()
    await flush()
    expect(updateGraph).not.toHaveBeenCalled()
    w.unmount()
  })
})
