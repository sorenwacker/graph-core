import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const updateNode = vi.fn().mockResolvedValue(true)
const getNode = vi.fn().mockResolvedValue({ id: 7, title: 'A note', type: 'note', notes: 'start', children: [] })

vi.mock('../services/api.js', () => {
  const stub = {
    api: {
      updateNode: (...args) => updateNode(...args),
      getNode: (...args) => getNode(...args),
      getWorkspaces: async () => [],
      getChildren: async () => [],
      getLinkedNodes: async () => [],
      getNodeTable: async () => null,
      onSensitiveLocked: () => {},
      sensitiveStatus: async () => ({ enabled: false, unlocked: false }),
    },
  }
  return stub
})
vi.mock('../services/api', () => {
  const stub = {
    api: {
      updateNode: (...args) => updateNode(...args),
      getNode: (...args) => getNode(...args),
      getWorkspaces: async () => [],
      getChildren: async () => [],
      getLinkedNodes: async () => [],
      getNodeTable: async () => null,
      onSensitiveLocked: () => {},
      sensitiveStatus: async () => ({ enabled: false, unlocked: false }),
    },
  }
  return stub
})

const broadcastNodeUpdate = vi.fn()
vi.mock('../composables/useDetachedWindow.js', () => ({
  useDetachedWindow: () => ({
    broadcastNodeUpdate: (...args) => broadcastNodeUpdate(...args),
    broadcastNodeDelete: vi.fn(),
    onMessage: vi.fn(),
  }),
}))

import DetachedView from '../components/DetachedView.vue'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
})

/**
 * A detached window and the main window can show the same node at once. Every
 * save here is broadcast, and the main window answers a broadcast by reloading
 * its container and rebuilding the graph. Doing that on each autosave means the
 * main window churns for the whole time a note is being typed in the detached
 * one - and it sends the just-saved record back, which used to overwrite the
 * text still being typed.
 */
describe('saving from a detached window', () => {
  beforeEach(() => {
    updateNode.mockClear()
    broadcastNodeUpdate.mockClear()
  })

  async function render() {
    const w = mount(DetachedView, {
      props: { nodeId: 7 },
      global: {
        stubs: {
          NotesEditor: true,
          NotesAIToolbar: true,
          MarkdownRenderer: true,
          NodeSpreadsheet: true,
          ChildrenSection: true,
          MetadataGridSection: true,
          PersonDetailForm: true,
          OrganizationDetailForm: true,
          TagInput: true,
        },
      },
    })
    await flushPromises()
    return w
  }

  const panel = w => w.findComponent({ name: 'DetailPanel' })

  it('writes a mid-edit autosave without telling the other windows', async () => {
    const w = await render()

    panel(w).vm.$emit('update', { id: 7, notes: 'half a sen' }, { refresh: false })
    await flushPromises()

    expect(updateNode).toHaveBeenCalledWith(7, expect.objectContaining({ notes: 'half a sen' }))
    expect(broadcastNodeUpdate).not.toHaveBeenCalled()
  })

  it('tells the other windows once the edit is finished', async () => {
    const w = await render()

    panel(w).vm.$emit('update', { id: 7, notes: 'a whole sentence' }, { refresh: true })
    await flushPromises()

    expect(broadcastNodeUpdate).toHaveBeenCalledTimes(1)
  })

  it('does not hand the panel back the text it saved', async () => {
    const w = await render()
    const before = panel(w).props('node')

    panel(w).vm.$emit('update', { id: 7, notes: 'half a sen' }, { refresh: false })
    await flushPromises()

    // A new object here is a stale record arriving at the open editor.
    expect(panel(w).props('node')).toBe(before)
  })
})
