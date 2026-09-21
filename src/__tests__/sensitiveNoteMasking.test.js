import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NotesSection from '../components/detail/NotesSection.vue'

/**
 * A node read withholds sensitive notes, so the section is told the text is
 * absent rather than deciding for itself. While it is absent there is no editor
 * on any tab: it would look empty, and the main process discards a write from a
 * caller that never held the text (docs/architecture/sensitive-notes.md).
 */

const stubs = {
  NotesEditor: { name: 'NotesEditor', template: '<div class="stub-editor" />' },
  NotesAIToolbar: { name: 'NotesAIToolbar', template: '<div class="stub-ai" />' },
  MarkdownRenderer: { name: 'MarkdownRenderer', props: ['content'], template: '<div class="stub-md" />' },
}

function render(props) {
  return mount(NotesSection, { props: { nodeId: 1, ...props }, global: { stubs } })
}

const TABS = ['edit', 'preview', 'split']

describe('a note whose text was withheld', () => {
  for (const activeTab of TABS) {
    it(`offers no editor on the ${activeTab} tab`, () => {
      const w = render({ notes: '', withheld: true, activeTab })
      expect(w.find('.sensitive-hidden').exists()).toBe(true)
      expect(w.find('.stub-editor').exists()).toBe(false)
      expect(w.find('.stub-ai').exists()).toBe(false)
    })
  }

  it('asks the owner of the node to reveal it', async () => {
    const w = render({ notes: '', withheld: true })
    await w.find('.sensitive-hidden .unlock-btn').trigger('click')
    expect(w.emitted('reveal')).toHaveLength(1)
  })

  it('points to the session unlock instead while the session is locked', () => {
    const w = render({ notes: '', withheld: true, locked: true })
    expect(w.text()).toContain('Sensitive notes are locked')
    expect(w.find('.sensitive-hidden .unlock-btn').exists()).toBe(false)
  })

  it('shows why a reveal failed', () => {
    const w = render({ notes: '', withheld: true, revealError: 'This note cannot be decrypted' })
    expect(w.find('.sensitive-unlock-error').text()).toBe('This note cannot be decrypted')
  })
})

describe('a note whose text is held', () => {
  it('renders the editor', () => {
    const w = render({ notes: 'revealed or ordinary', activeTab: 'edit' })
    expect(w.find('.sensitive-hidden').exists()).toBe(false)
    expect(w.find('.stub-editor').exists()).toBe(true)
  })

  it('renders the preview', () => {
    const w = render({ notes: 'revealed or ordinary', activeTab: 'preview' })
    expect(w.findComponent({ name: 'MarkdownRenderer' }).props('content')).toBe('revealed or ordinary')
  })
})
