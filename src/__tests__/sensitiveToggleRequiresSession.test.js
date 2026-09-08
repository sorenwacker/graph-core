import { describe, it, expect, vi } from 'vitest'
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

vi.mock('../composables/useSensitiveNotes.js', () => ({
  useSensitiveNotes: () => ({
    status,
    unlock: vi.fn(),
    refresh: vi.fn(),
    isLockedNote: notes => typeof notes === 'string' && notes.startsWith('SNENC1:'),
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

describe('the sensitivity toggle on a plaintext note', () => {
  it('is disabled while the sensitive session is locked', () => {
    status.value = { available: true, enabled: true, unlocked: false }

    expect(toggle(render()).attributes('disabled')).toBeDefined()
  })

  it('explains that unlocking is what is missing', () => {
    status.value = { available: true, enabled: true, unlocked: false }

    expect(toggle(render()).attributes('title')).toContain('Unlock')
  })

  it('is available once the session is unlocked', () => {
    status.value = { available: true, enabled: true, unlocked: true }

    expect(toggle(render()).attributes('disabled')).toBeUndefined()
  })

  it('stays available while the feature is off, where the flag only masks', () => {
    // With the feature disabled the write path returns early and no key is
    // involved, so the toggle must not be held hostage to a session.
    status.value = { available: true, enabled: false, unlocked: false }

    expect(toggle(render()).attributes('disabled')).toBeUndefined()
  })
})

describe('the sensitivity toggle on a note already stored as ciphertext', () => {
  it('stays disabled even when the session reports unlocked', () => {
    status.value = { available: true, enabled: true, unlocked: true }
    const w = render({ ...PLAINTEXT_NOTE, notes: 'SNENC1:abc', notes_sensitive: true })

    expect(toggle(w).attributes('disabled')).toBeDefined()
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
  it('is disabled while the sensitive session is locked', () => {
    status.value = { available: true, enabled: true, unlocked: false }

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
