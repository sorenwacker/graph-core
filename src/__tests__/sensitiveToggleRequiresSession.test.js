import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import DetailPanel from '../components/DetailPanel.vue'
import GraphEditModal from '../components/GraphEditModal.vue'

/**
 * Marking a plaintext note sensitive encrypts it, which needs the sensitive-
 * notes key. The toggle used to be disabled only when the note already held
 * ciphertext, so on a plaintext note with the session locked it stayed live and
 * the write failed in the main process with
 * "Error invoking remote method 'db:updateNode': Sensitive notes are locked".
 * See docs/architecture/sensitive-notes.md.
 */

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
})

// Reassigning the shared status between cases fires the panel's relock watcher
// on components mounted earlier in the file, which reloads the node.
vi.mock('../services/api', () => ({
  api: new Proxy({}, { get: () => vi.fn(async () => null) }),
}))

const status = ref({ available: true, enabled: true, unlocked: false })
const unlockFn = vi.fn(async () => ({ success: true }))
const unlockTouchIdFn = vi.fn(async () => ({ success: true }))

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

vi.mock('../composables/useSensitiveNotes.js', () => ({
  useSensitiveNotes: () => ({
    status,
    unlock: unlockFn,
    unlockWithTouchId: unlockTouchIdFn,
    refresh: vi.fn(),
  }),
}))

const PLAINTEXT_NOTE = { id: 1, title: 'A note', type: 'note', notes: 'in the clear', children: [] }

function render(node = PLAINTEXT_NOTE) {
  return mount(DetailPanel, {
    props: { node, width: 400, workspaces: [] },
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
}

const toggle = w => w.find('.sensitive-btn')

const unlockForm = w => w.find('.sensitive-unlock-form')

const LOCKED = { available: true, enabled: true, unlocked: false, lockable: true, touchId: false }
const SENSITIVE_NOTE = { ...PLAINTEXT_NOTE, notes: null, notes_sensitive: true, notes_withheld: true, has_notes: true }

describe('setting the flag while the session is locked', () => {
  beforeEach(() => {
    status.value = { ...LOCKED }
  })

  it('acts at once, since sealing needs only the public key', async () => {
    const w = render()
    await toggle(w).trigger('click')

    expect(unlockForm(w).exists()).toBe(false)
    expect(w.emitted('update').at(-1)[0]).toMatchObject({ notes_sensitive: true, notes: 'in the clear' })
  })

  it('asks for an unlock only while the key pair does not exist yet', async () => {
    status.value = { ...LOCKED, lockable: false }
    const w = render()
    await toggle(w).trigger('click')

    expect(unlockForm(w).exists()).toBe(true)
    expect(w.emitted('update')).toBeUndefined()
  })
})

describe('clearing the flag while the session is locked', () => {
  beforeEach(() => {
    status.value = { ...LOCKED }
  })

  it('asks for the password instead of attempting the write', async () => {
    const w = render(SENSITIVE_NOTE)
    await toggle(w).trigger('click')

    expect(unlockForm(w).exists()).toBe(true)
    // The flag must not have moved: the write would have failed in the main
    // process with "Sensitive notes are locked".
    expect(w.vm.editedNode.notes_sensitive).toBe(true)
  })

  it('explains that unlocking is what is missing', () => {
    expect(toggle(render(SENSITIVE_NOTE)).attributes('title')).toContain('Unlock')
  })

  it('offers Touch ID when it is set up, and applies the change once it succeeds', async () => {
    status.value = { ...LOCKED, touchId: true }
    unlockTouchIdFn.mockResolvedValueOnce({ success: true })
    const w = render(SENSITIVE_NOTE)
    await toggle(w).trigger('click')

    await w.find('.sensitive-unlock-touch-id').trigger('click')
    await flush()

    expect(unlockTouchIdFn).toHaveBeenCalledTimes(1)
    expect(w.emitted('update').at(-1)[0]).toMatchObject({ notes_sensitive: false })
  })

  it('applies the change the user asked for once the password unlocks', async () => {
    unlockFn.mockResolvedValueOnce({ success: true })
    const w = render(SENSITIVE_NOTE)
    await toggle(w).trigger('click')

    await unlockForm(w).find('input[type="password"]').setValue('recovery')
    await unlockForm(w).trigger('submit')
    await flush()

    expect(unlockFn).toHaveBeenCalledWith('recovery')
    expect(w.emitted('update').at(-1)[0]).toMatchObject({ notes_sensitive: false })
  })

  it('keeps the flag unchanged when the password is wrong', async () => {
    unlockFn.mockResolvedValueOnce({ success: false, error: 'Wrong password' })
    const w = render(SENSITIVE_NOTE)
    await toggle(w).trigger('click')

    await unlockForm(w).find('input[type="password"]').setValue('wrong')
    await unlockForm(w).trigger('submit')
    await flush()

    expect(w.vm.editedNode.notes_sensitive).toBe(true)
    expect(w.text()).toContain('Wrong password')
  })
})

describe('the sensitivity toggle when no key is needed', () => {
  it('acts at once while the session is unlocked', async () => {
    status.value = { available: true, enabled: true, unlocked: true }
    const w = render()
    await toggle(w).trigger('click')

    expect(unlockForm(w).exists()).toBe(false)
    expect(w.vm.editedNode.notes_sensitive).toBe(true)
  })

  it('acts at once while the feature is off, where the flag only masks', async () => {
    // With the feature disabled the write path returns early and no key is
    // involved, so the toggle must not be held hostage to a session.
    status.value = { available: true, enabled: false, unlocked: false }
    const w = render()
    await toggle(w).trigger('click')

    expect(unlockForm(w).exists()).toBe(false)
    expect(w.vm.editedNode.notes_sensitive).toBe(true)
  })
})

describe('the unlock form on the edit tab', () => {
  it('is wired to a handler that exists', async () => {
    // It called `onSensitiveUnlock`, which was never defined, so submitting it
    // did nothing at all. The preview and split tabs used `revealSensitive`.
    status.value = { available: true, enabled: true, unlocked: false }
    const w = render({ ...PLAINTEXT_NOTE, notes: null, notes_sensitive: true, notes_withheld: true })

    // A note with content opens on the preview tab, whose form was wired
    // correctly. The broken one is the edit tab's.
    const editTab = w.findAll('.tabs button').find(b => b.text() === 'Edit')
    await editTab.trigger('click')

    await unlockForm(w).find('input[type="password"]').setValue('recovery')
    await unlockForm(w).trigger('submit')
    await flush()

    expect(unlockFn).toHaveBeenCalledWith('recovery')
  })
})

/**
 * The graph edit modal offers the same flag as a checkbox, and reached the same
 * failing write. A guard on one surface only moves the error rather than
 * removing it.
 */
function renderModal(editedNode) {
  return mount(GraphEditModal, {
    props: { visible: true, node: editedNode, editedNode },
    global: { stubs: { MarkdownRenderer: true } },
  })
}

const sensitiveCheckbox = w => w.find('input[type="checkbox"][data-field="notes_sensitive"]')

describe('the sensitive checkbox in the graph edit modal', () => {
  it('can be set while the session is locked', () => {
    status.value = { ...LOCKED }

    expect(sensitiveCheckbox(renderModal({ ...PLAINTEXT_NOTE })).attributes('disabled')).toBeUndefined()
  })

  it('cannot be cleared while the session is locked', () => {
    status.value = { ...LOCKED }
    const w = renderModal({ ...SENSITIVE_NOTE })
    expect(sensitiveCheckbox(w).attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Unlock sensitive notes')
  })

  it('cannot be set until the key pair exists', () => {
    status.value = { ...LOCKED, lockable: false }

    expect(sensitiveCheckbox(renderModal({ ...PLAINTEXT_NOTE })).attributes('disabled')).toBeDefined()
  })

  it('is available once the session is unlocked', () => {
    status.value = { available: true, enabled: true, unlocked: true }

    expect(sensitiveCheckbox(renderModal({ ...PLAINTEXT_NOTE })).attributes('disabled')).toBeUndefined()
  })

  it('stays available while the feature is off', () => {
    status.value = { available: true, enabled: false, unlocked: false }

    expect(sensitiveCheckbox(renderModal({ ...PLAINTEXT_NOTE })).attributes('disabled')).toBeUndefined()
  })
})
