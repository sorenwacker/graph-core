import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailPanel from '../components/DetailPanel.vue'
import { AUTOSAVE_DELAY_MS } from '../utils/settingsConstants'

/**
 * Saving a note is a round-trip: the panel emits the text it had when the
 * autosave fired, the write is awaited, and the saved record comes back as a
 * fresh `node` prop. Typing continues during that round-trip, so the record
 * that returns is already stale.
 *
 * The panel used to adopt every incoming `node` wholesale, which reverted the
 * editor to the stale text and destroyed whatever was typed while the write
 * was in flight - most visibly a just-pressed Enter, which vanished. Fields the
 * user has changed since the last save must survive a same-node refresh.
 */

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
})

const NODE = { id: 1, title: 'A note', type: 'note', notes: '', children: [] }

function render() {
  return mount(DetailPanel, {
    props: { node: NODE, width: 400, workspaces: [] },
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

const editor = w => w.findComponent({ name: 'NotesEditor' })

describe('a note edit that races the save round-trip', () => {
  it('keeps the text typed while the write was in flight', async () => {
    const w = render()
    editor(w).vm.$emit('update:model-value', 'abc')
    await w.vm.$nextTick()

    // The autosave emitted "abc"; the user presses Enter before it returns.
    editor(w).vm.$emit('update:model-value', 'abc\n')
    await w.vm.$nextTick()

    // The saved record comes back, still holding the pre-Enter text.
    await w.setProps({ node: { ...NODE, notes: 'abc' } })

    expect(editor(w).props('modelValue')).toBe('abc\n')
  })

  it('keeps a title typed while the write was in flight', async () => {
    const w = render()
    // Typing only: `setValue` would also fire `change`, which saves and so ends
    // the race this is about.
    const title = w.find('.title-input')
    title.element.value = 'Renamed'
    await title.trigger('input')

    await w.setProps({ node: { ...NODE, title: 'A note' } })

    expect(w.find('.title-input').element.value).toBe('Renamed')
  })
})

describe('a change made elsewhere', () => {
  it('reaches the editor when nothing is being typed', async () => {
    const w = render()

    await w.setProps({ node: { ...NODE, notes: 'written by another window' } })

    expect(editor(w).props('modelValue')).toBe('written by another window')
  })
})

/**
 * Saving reloads the container and rebuilds the graph. The notes autosave fires
 * on every pause in typing, so doing that on each autosave leaves the graph
 * rebuilding under the cursor for as long as the note is being written. The
 * autosave asks for the write only; the reload waits for the end of the edit.
 */
describe('what a save asks the app to do', () => {
  it('does not reload the view for an autosave mid-edit', async () => {
    vi.useFakeTimers()
    try {
      const w = render()
      editor(w).vm.$emit('update:model-value', 'still typing')
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)

      const saves = w.emitted('update')
      expect(saves).toHaveLength(1)
      expect(saves[0][0]).toMatchObject({ id: 1, notes: 'still typing' })
      expect(saves[0][1]).toEqual({ refresh: false })
    } finally {
      vi.useRealTimers()
    }
  })

  it('reloads the view once the editor is left', async () => {
    const w = render()
    editor(w).vm.$emit('blur')
    await w.vm.$nextTick()

    const saves = w.emitted('update')
    expect(saves).toHaveLength(1)
    expect(saves[0][1]).toEqual({ refresh: true })
  })

  it('reloads the view when a field other than the notes is changed', async () => {
    const w = render()
    const title = w.find('.title-input')
    title.element.value = 'Renamed'
    await title.trigger('input')
    await title.trigger('change')

    const saves = w.emitted('update')
    expect(saves).toHaveLength(1)
    expect(saves[0][1]).toEqual({ refresh: true })
  })
})

/**
 * An autosave in flight is not yet written. Closing the panel used to clear its
 * timer and drop the text with it, and leaving the editor for another tab left
 * the app's view behind whatever had been written mid-edit.
 */
describe('leaving an edit unfinished', () => {
  it('saves text still waiting on the autosave timer when the panel closes', () => {
    const w = render()
    editor(w).vm.$emit('update:model-value', 'not yet written')

    w.unmount()

    const saves = w.emitted('update')
    expect(saves).toHaveLength(1)
    expect(saves[0][0]).toMatchObject({ notes: 'not yet written' })
    expect(saves[0][1]).toEqual({ refresh: true })
  })

  it('asks for a reload when the editor is left for another tab', async () => {
    vi.useFakeTimers()
    try {
      const w = render()
      editor(w).vm.$emit('update:model-value', 'a note')
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)
      expect(w.emitted('update')[0][1]).toEqual({ refresh: false })

      await w.findAll('.tabs button')[1].trigger('click')
      await w.vm.$nextTick()

      const saves = w.emitted('update')
      expect(saves).toHaveLength(2)
      expect(saves[1][1]).toEqual({ refresh: true })
    } finally {
      vi.useRealTimers()
    }
  })
})
