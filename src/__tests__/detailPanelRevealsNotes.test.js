import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import DetailPanel from '../components/DetailPanel.vue'
import GraphEditModal from '../components/GraphEditModal.vue'

/**
 * A node read withholds sensitive notes, so the detail panel opens without the
 * text and fetches it through getNodeNotes when the user asks
 * (docs/architecture/sensitive-notes.md, "Read path").
 */

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
})

const getNodeNotes = vi.fn()

vi.mock('../services/api', () => ({
  api: new Proxy({}, { get: (_target, name) => (name === 'getNodeNotes' ? getNodeNotes : vi.fn(async () => null)) }),
}))

const status = ref({ available: true, enabled: false, unlocked: false })
const unlockFn = vi.fn(async () => ({ success: true }))
const unlockTouchIdFn = vi.fn(async () => ({ success: true }))

vi.mock('../composables/useSensitiveNotes.js', () => ({
  useSensitiveNotes: () => ({ status, unlock: unlockFn, unlockWithTouchId: unlockTouchIdFn, refresh: vi.fn() }),
}))

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

const WITHHELD = {
  id: 7,
  title: 'Vault',
  type: 'note',
  notes: null,
  notes_sensitive: true,
  notes_withheld: true,
  has_notes: true,
  children: [],
}

const NotesEditor = { name: 'NotesEditor', props: ['modelValue'], template: '<div class="stub-editor" />' }
const MarkdownRenderer = { name: 'MarkdownRenderer', props: ['content'], template: '<div class="stub-md" />' }

function render(node = WITHHELD) {
  return mount(DetailPanel, {
    props: { node, width: 400, workspaces: [] },
    global: {
      stubs: {
        NotesEditor,
        MarkdownRenderer,
        NotesAIToolbar: true,
        NodeSpreadsheet: true,
        ChildrenSection: true,
        MetadataGridSection: true,
        PersonDetailForm: true,
        OrganizationDetailForm: true,
        TagInput: true,
      },
    },
  })
}

const tab = (w, name) => w.findAll('.tabs button').find(b => b.text() === name)
const lastUpdate = w => w.emitted('update').at(-1)[0]

beforeEach(() => {
  getNodeNotes.mockReset()
  unlockFn.mockClear()
  unlockTouchIdFn.mockClear()
  status.value = { available: true, enabled: false, unlocked: false }
})

describe('a node whose notes were withheld', () => {
  it('does not fetch the text by being opened', async () => {
    render()
    await flush()
    expect(getNodeNotes).not.toHaveBeenCalled()
  })

  for (const name of ['Edit', 'Preview', 'Split']) {
    it(`offers no editor and no text on the ${name} tab`, async () => {
      const w = render()
      await tab(w, name).trigger('click')
      expect(w.find('.sensitive-hidden').exists()).toBe(true)
      expect(w.find('.stub-editor').exists()).toBe(false)
      expect(w.find('.stub-md').exists()).toBe(false)
    })
  }

  it('hides the AI toolbar, which would otherwise work on an empty text', () => {
    const w = render()
    expect(w.findComponent({ name: 'NotesAIToolbar' }).exists()).toBe(false)
  })

  it('never sends notes when another field is saved', async () => {
    const w = render()
    await w.find('.favorite-btn').trigger('click')
    expect(lastUpdate(w).notes_withheld).toBe(true)
    expect(lastUpdate(w).notes_revealed).toBeUndefined()
  })
})

describe('revealing', () => {
  it('fetches the text through getNodeNotes and shows it', async () => {
    getNodeNotes.mockResolvedValue({ notes: 'the secret', locked: false })
    const w = render()

    await w.find('.sensitive-hidden .unlock-btn').trigger('click')
    await flush()

    expect(getNodeNotes).toHaveBeenCalledWith(7)
    expect(w.find('.sensitive-hidden').exists()).toBe(false)
    expect(w.findComponent(MarkdownRenderer).props('content')).toBe('the secret')
  })

  it('marks what it saves afterwards as revealed', async () => {
    getNodeNotes.mockResolvedValue({ notes: 'the secret', locked: false })
    const w = render()
    await w.find('.sensitive-hidden .unlock-btn').trigger('click')
    await flush()

    await w.find('.favorite-btn').trigger('click')

    expect(lastUpdate(w)).toMatchObject({ notes: 'the secret', notes_withheld: false, notes_revealed: true })
  })

  it('keeps the text when the saved record comes back without it', async () => {
    getNodeNotes.mockResolvedValue({ notes: 'the secret', locked: false })
    const w = render()
    await w.find('.sensitive-hidden .unlock-btn').trigger('click')
    await flush()

    await w.setProps({ node: { ...WITHHELD, title: 'Vault renamed' } })
    await flush()

    expect(w.find('.sensitive-hidden').exists()).toBe(false)
    expect(w.findComponent(MarkdownRenderer).props('content')).toBe('the secret')
  })

  it('drops the text when another node is opened', async () => {
    getNodeNotes.mockResolvedValue({ notes: 'the secret', locked: false })
    const w = render()
    await w.find('.sensitive-hidden .unlock-btn').trigger('click')
    await flush()

    await w.setProps({ node: { ...WITHHELD, id: 8 } })
    await flush()

    expect(w.find('.sensitive-hidden').exists()).toBe(true)
    expect(w.html()).not.toContain('the secret')
  })

  it('says so when the call fails, instead of leaving Show doing nothing', async () => {
    getNodeNotes.mockRejectedValue(new Error('no handler registered'))
    const w = render()
    await w.find('.sensitive-hidden .unlock-btn').trigger('click')
    await flush()

    expect(w.find('.sensitive-hidden').exists()).toBe(true)
    expect(w.find('.sensitive-unlock-error').text()).toMatch(/could not be loaded/i)
  })

  it('says so when the note cannot be decrypted', async () => {
    getNodeNotes.mockResolvedValue({ notes: null, locked: true })
    const w = render()
    await w.find('.sensitive-hidden .unlock-btn').trigger('click')
    await flush()

    expect(w.find('.sensitive-hidden').exists()).toBe(true)
    expect(w.find('.sensitive-unlock-error').text()).toMatch(/cannot be decrypted/i)
  })
})

describe('with the sensitive session locked', () => {
  beforeEach(() => {
    status.value = { available: true, enabled: true, unlocked: false }
  })

  it('asks for the password, then fetches the text', async () => {
    getNodeNotes.mockResolvedValue({ notes: 'the secret', locked: false })
    const w = render()

    const form = w.find('.sensitive-unlock-form')
    await form.find('input[type="password"]').setValue('recovery')
    await form.trigger('submit')
    await flush()

    expect(unlockFn).toHaveBeenCalledWith('recovery')
    expect(getNodeNotes).toHaveBeenCalledWith(7)
    expect(w.findComponent(MarkdownRenderer).props('content')).toBe('the secret')
  })

  it('offers Touch ID when it is set up, and fetches the text after it', async () => {
    status.value = { available: true, enabled: true, unlocked: false, lockable: true, touchId: true }
    getNodeNotes.mockResolvedValue({ notes: 'the secret', locked: false })
    const w = render()

    await w.find('.sensitive-unlock-touch-id').trigger('click')
    await flush()

    expect(unlockTouchIdFn).toHaveBeenCalledTimes(1)
    expect(getNodeNotes).toHaveBeenCalledWith(7)
    expect(w.findComponent(MarkdownRenderer).props('content')).toBe('the secret')
  })

  it('shows why Touch ID did not unlock', async () => {
    status.value = { available: true, enabled: true, unlocked: false, lockable: true, touchId: true }
    unlockTouchIdFn.mockResolvedValueOnce({ success: false, error: 'Touch ID was not confirmed' })
    const w = render()
    await w.find('.sensitive-unlock-touch-id').trigger('click')
    await flush()
    expect(w.find('.sensitive-unlock-error').text()).toBe('Touch ID was not confirmed')
  })

  it('offers no Touch ID button without it', () => {
    status.value = { available: true, enabled: true, unlocked: false, lockable: true, touchId: false }
    expect(render().find('.sensitive-unlock-touch-id').exists()).toBe(false)
  })

  it('drops revealed text when the session relocks', async () => {
    status.value = { available: true, enabled: true, unlocked: true }
    getNodeNotes.mockResolvedValue({ notes: 'the secret', locked: false })
    const w = render()
    await w.find('.sensitive-hidden .unlock-btn').trigger('click')
    await flush()

    status.value = { available: true, enabled: true, unlocked: false }
    await flush()

    expect(w.find('.sensitive-hidden').exists()).toBe(true)
    expect(w.html()).not.toContain('the secret')
  })
})

describe('the graph edit modal, which has no reveal of its own', () => {
  function renderModal(editedNode) {
    return mount(GraphEditModal, {
      props: { visible: true, node: editedNode, editedNode },
      global: { stubs: { MarkdownRenderer } },
    })
  }

  it('offers no notes field for a node whose notes were withheld', () => {
    const w = renderModal(WITHHELD)
    expect(w.find('.notes-field textarea').exists()).toBe(false)
    expect(w.find('.notes-field').text()).toContain('detail panel')
  })

  it('keeps the notes field for an ordinary node', () => {
    const w = renderModal({ ...WITHHELD, notes: 'plain', notes_sensitive: false, notes_withheld: false })
    expect(w.find('.notes-field textarea').exists()).toBe(true)
  })
})

describe('flagging an open note as sensitive', () => {
  const PLAIN = { ...WITHHELD, notes: 'the secret', notes_sensitive: false, notes_withheld: false }

  it('saves the flag with the text, then withholds the text at once', async () => {
    const w = render(PLAIN)
    await w.find('.sensitive-btn').trigger('click')
    await flush()

    expect(lastUpdate(w)).toMatchObject({ notes_sensitive: true, notes: 'the secret' })
    expect(w.find('.sensitive-hidden').exists()).toBe(true)
    expect(w.html()).not.toContain('the secret')
    expect(w.find('.stub-editor').exists()).toBe(false)
  })

  it('does not fetch the text again by itself', async () => {
    const w = render(PLAIN)
    await w.find('.sensitive-btn').trigger('click')
    await flush()
    expect(getNodeNotes).not.toHaveBeenCalled()
  })

  it('fetches the text back once the flag is cleared', async () => {
    getNodeNotes.mockResolvedValue({ notes: 'the secret', locked: false })
    const w = render(PLAIN)
    await w.find('.sensitive-btn').trigger('click')
    await flush()
    await w.find('.sensitive-btn').trigger('click')
    await flush()

    expect(lastUpdate(w)).toMatchObject({ notes_sensitive: false })
    expect(lastUpdate(w).notes ?? null).toBeNull()
    expect(getNodeNotes).toHaveBeenCalledWith(7)
    expect(w.findComponent(MarkdownRenderer).props('content')).toBe('the secret')
  })
})
