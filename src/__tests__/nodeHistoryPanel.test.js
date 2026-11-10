import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import NodeHistoryPanel from '../components/detail/NodeHistoryPanel.vue'

/**
 * The history panel lists a node's earlier versions, shows one, and asks for a
 * restore with the version's title and notes (docs/guides/detail-panel.md,
 * "Version history"). Sensitive versions follow the node's own notes: hidden
 * until those are shown, then fetched through getNodeVersionNotes.
 */

const getNodeHistory = vi.fn()
const getNodeVersionNotes = vi.fn()

vi.mock('../services/api', () => ({
  api: {
    getNodeHistory: (...args) => getNodeHistory(...args),
    getNodeVersionNotes: (...args) => getNodeVersionNotes(...args),
  },
}))

const MarkdownRenderer = {
  name: 'MarkdownRenderer',
  props: ['content'],
  template: '<div class="stub-md">{{ content }}</div>',
}

const VERSIONS = [
  {
    id: 2,
    node_id: 7,
    title: 'Second',
    notes: 'second text',
    notes_withheld: false,
    source: 'restore',
    saved_at: 2_000,
  },
  { id: 1, node_id: 7, title: 'First', notes: 'first text', notes_withheld: false, source: 'app', saved_at: 1_000 },
]

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

function render(props = {}) {
  return mount(NodeHistoryPanel, {
    props: { nodeId: 7, ...props },
    global: { stubs: { MarkdownRenderer } },
  })
}

describe('NodeHistoryPanel', () => {
  beforeEach(() => {
    getNodeHistory.mockReset()
    getNodeVersionNotes.mockReset()
    getNodeHistory.mockResolvedValue(VERSIONS)
  })

  it('lists the versions newest first, naming what replaced each, and shows the newest', async () => {
    const wrapper = render()
    await flush()

    expect(getNodeHistory).toHaveBeenCalledWith(7)
    const items = wrapper.findAll('.history-item')
    expect(items.map(li => li.find('.history-title').text())).toEqual(['Second', 'First'])
    expect(items.map(li => li.find('.history-meta').text())).toEqual(['before a restore', 'before an edit'])
    expect(wrapper.find('.stub-md').text()).toBe('second text')
  })

  it('restores the selected version with its title and notes', async () => {
    const wrapper = render()
    await flush()

    await wrapper.findAll('.history-item')[1].trigger('click')
    await flush()
    expect(wrapper.find('.stub-md').text()).toBe('first text')

    await wrapper.find('.history-restore').trigger('click')
    expect(wrapper.emitted('restore')).toEqual([[{ title: 'First', notes: 'first text' }]])
  })

  it('says so when there is nothing yet', async () => {
    getNodeHistory.mockResolvedValue([])
    const wrapper = render()
    await flush()
    expect(wrapper.find('.history-empty').exists()).toBe(true)
    expect(wrapper.find('.history-version').exists()).toBe(false)
  })

  it('keeps a sensitive version hidden until the node notes are shown, then fetches it', async () => {
    const withheld = [
      { id: 3, node_id: 7, title: 'Vault', notes: null, notes_withheld: true, source: 'app', saved_at: 3_000 },
    ]
    getNodeHistory.mockResolvedValue(withheld)
    getNodeVersionNotes.mockResolvedValue({ notes: 'the secret', locked: false })

    const hidden = render({ notesWithheld: true })
    await flush()
    expect(getNodeVersionNotes).not.toHaveBeenCalled()
    expect(hidden.find('.history-hint').exists()).toBe(true)
    expect(hidden.find('.history-restore').attributes('disabled')).toBeDefined()

    const shown = render({ notesWithheld: false })
    await flush()
    expect(getNodeVersionNotes).toHaveBeenCalledWith(3)
    expect(shown.find('.stub-md').text()).toBe('the secret')
    await shown.find('.history-restore').trigger('click')
    expect(shown.emitted('restore')).toEqual([[{ title: 'Vault', notes: 'the secret' }]])
  })

  it('reports a version the current key cannot open, and does not offer to restore it', async () => {
    getNodeHistory.mockResolvedValue([
      { id: 4, node_id: 7, title: 'Vault', notes: null, notes_withheld: true, source: 'app', saved_at: 4_000 },
    ])
    getNodeVersionNotes.mockResolvedValue({ notes: null, locked: true })

    const wrapper = render()
    await flush()
    expect(wrapper.find('.history-error').text()).toContain('cannot be decrypted')
    expect(wrapper.find('.history-restore').attributes('disabled')).toBeDefined()
  })
})
