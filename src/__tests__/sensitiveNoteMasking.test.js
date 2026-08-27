import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NotesSection from '../components/detail/NotesSection.vue'

/**
 * A sensitive note must be withheld from every tab, not only the preview.
 * While the session is locked the stored value is ciphertext, and any edit to
 * it is rejected by the main process, so an editor there would show the marker
 * and silently discard what the user typed
 * (docs/architecture/sensitive-notes.md).
 */

vi.mock('../composables/useSensitiveNotes.js', () => ({
  useSensitiveNotes: () => ({
    isLockedNote: notes => typeof notes === 'string' && notes.startsWith('SNENC1:'),
  }),
}))

const stubs = {
  NotesEditor: { name: 'NotesEditor', template: '<div class="stub-editor" />' },
  NotesAIToolbar: true,
  MarkdownRenderer: { name: 'MarkdownRenderer', props: ['content'], template: '<div class="stub-md" />' },
}

function render(props) {
  return mount(NotesSection, { props: { nodeId: 1, ...props }, global: { stubs } })
}

const TABS = ['edit', 'preview', 'split']

describe('a note flagged sensitive and not revealed', () => {
  for (const activeTab of TABS) {
    it(`is withheld on the ${activeTab} tab`, () => {
      const w = render({ notes: 'the secret', notesSensitive: true, showSensitive: false, activeTab })
      expect(w.text()).not.toContain('the secret')
      expect(w.find('.sensitive-hidden').exists()).toBe(true)
      expect(w.find('.stub-editor').exists()).toBe(false)
    })
  }

  it('is shown once revealed', () => {
    const w = render({ notes: 'the secret', notesSensitive: true, showSensitive: true, activeTab: 'edit' })
    expect(w.find('.sensitive-hidden').exists()).toBe(false)
    expect(w.find('.stub-editor').exists()).toBe(true)
  })
})

describe('a note still locked as ciphertext', () => {
  for (const activeTab of TABS) {
    it(`shows the locked prompt on the ${activeTab} tab and offers no editor`, () => {
      const w = render({ notes: 'SNENC1:abc', notesSensitive: true, showSensitive: true, activeTab })
      expect(w.text()).toContain('Sensitive notes are locked')
      expect(w.text()).not.toContain('SNENC1:abc')
      expect(w.find('.stub-editor').exists()).toBe(false)
    })
  }

  it('stays withheld even when the reveal flag is set, because revealing cannot decrypt', () => {
    const w = render({ notes: 'SNENC1:abc', notesSensitive: false, showSensitive: true, activeTab: 'edit' })
    expect(w.find('.sensitive-hidden').exists()).toBe(true)
  })
})

describe('an ordinary note', () => {
  it('renders the editor and the text as before', () => {
    const w = render({ notes: 'nothing secret', activeTab: 'edit' })
    expect(w.find('.sensitive-hidden').exists()).toBe(false)
    expect(w.find('.stub-editor').exists()).toBe(true)
  })

  it('renders the preview', () => {
    const w = render({ notes: 'nothing secret', activeTab: 'preview' })
    expect(w.findComponent({ name: 'MarkdownRenderer' }).props('content')).toBe('nothing secret')
  })
})
