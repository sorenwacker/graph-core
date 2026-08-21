import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import CardNotes from '../components/CardNotes.vue'

/**
 * A card whose node has no notes still needs a click target, otherwise notes
 * can never be started on it: the display element used to render only when
 * notes already existed, so an empty card offered nothing to click.
 */

function mountNotes(props = {}) {
  return mount(CardNotes, {
    props: { notes: '', modelValue: '', isEditing: false, sensitive: false, size: 'normal', ...props },
  })
}

describe('CardNotes with no notes', () => {
  it('still renders a display element to click', () => {
    const wrapper = mountNotes({ notes: '' })
    expect(wrapper.find('.card-notes-display').exists()).toBe(true)
  })

  it('starts editing when that element is clicked', async () => {
    const wrapper = mountNotes({ notes: '' })

    await wrapper.find('.card-notes-display').trigger('click')

    expect(wrapper.emitted('startEdit')).toHaveLength(1)
  })

  it('marks the empty placeholder so it can be styled as muted', () => {
    const wrapper = mountNotes({ notes: '' })
    expect(wrapper.find('.card-notes-display').classes()).toContain('empty')
  })

  it('shows placeholder text rather than an empty box', () => {
    const wrapper = mountNotes({ notes: '' })
    expect(wrapper.find('.card-notes-display').text()).toBe('Add notes...')
  })

  it('treats whitespace-only notes as empty', () => {
    const wrapper = mountNotes({ notes: '   \n  ' })
    expect(wrapper.find('.card-notes-display').classes()).toContain('empty')
  })
})

describe('CardNotes with notes', () => {
  it('renders the notes and no placeholder class', () => {
    const wrapper = mountNotes({ notes: 'hello world' })
    const display = wrapper.find('.card-notes-display')

    expect(display.classes()).not.toContain('empty')
    expect(display.text()).toContain('hello world')
  })

  it('starts editing when clicked', async () => {
    const wrapper = mountNotes({ notes: 'hello' })

    await wrapper.find('.card-notes-display').trigger('click')

    expect(wrapper.emitted('startEdit')).toHaveLength(1)
  })
})

describe('CardNotes empty placeholder layout', () => {
  it('does not let the placeholder claim the flex space a real note gets', () => {
    // A real note grows to fill the card (flex: 1). If the placeholder did the
    // same, a note-less card would hand that space to an empty box instead of
    // its children. The rule must also come after the size-* rules, which set
    // flex at equal specificity, or source order lets them win.
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../components/CardNotes.vue'), 'utf-8')

    const emptyRule = /\.card-notes-display\.empty\s*\{[^}]*flex:\s*0 0 auto/s
    expect(source).toMatch(emptyRule)

    const emptyAt = source.search(/\.card-notes-display\.empty\s*\{/)
    const lastSizeAt = source.search(/\.card-notes-display\.size-grandchild\s*\{/)
    expect(emptyAt).toBeGreaterThan(lastSizeAt)
  })
})

describe('CardNotes when notes are sensitive', () => {
  it('shows the lock and does not start editing on click', async () => {
    const wrapper = mountNotes({ notes: 'secret', sensitive: true })
    const display = wrapper.find('.card-notes-display')

    expect(display.find('.lock-icon-display').exists()).toBe(true)

    await display.trigger('click')
    expect(wrapper.emitted('startEdit')).toBeUndefined()
  })

  it('does not offer an add-notes placeholder for an empty sensitive node', () => {
    // Sensitive nodes are locked, so inviting an edit would be misleading.
    const wrapper = mountNotes({ notes: '', sensitive: true })
    expect(wrapper.find('.card-notes-display').classes()).not.toContain('empty')
  })
})
