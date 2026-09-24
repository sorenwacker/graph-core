import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PersonsView from '../components/PersonsView.vue'

/**
 * Pressing Reveal in the persons view renders each person's note through
 * notesForDisplay (docs/architecture/sensitive-notes.md, "Display policy").
 * The template called it without importing it, so the call resolved to
 * undefined and Reveal threw instead of showing anything.
 */

const person = {
  id: 1,
  type: 'person',
  title: 'Alex Placeholder',
  notes: 'plain note',
  email: 'alex@example.org',
  workspace_id: 'people',
}

vi.mock('../services/api.js', () => ({
  api: {
    getNodes: vi.fn(async () => [person]),
    getAllLinks: vi.fn(async () => []),
    getLinkedNodes: vi.fn(async () => []),
    updateNode: vi.fn(async () => person),
    createNode: vi.fn(async () => person),
    deleteNode: vi.fn(async () => {}),
    linkNodes: vi.fn(async () => {}),
    unlinkNodes: vi.fn(async () => {}),
  },
}))

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

function render() {
  return mount(PersonsView, {
    props: { workspaceId: 'people' },
    global: { stubs: { NotesEditor: true, TagsSection: true } },
  })
}

describe('the persons view Reveal button', () => {
  it('shows the note text instead of throwing', async () => {
    const w = render()
    await flush()

    const reveal = w.findAll('button').find(b => b.text() === 'Reveal')
    expect(reveal).toBeTruthy()
    await reveal.trigger('click')
    await flush()

    expect(w.text()).toContain('plain note')
  })

  it('withholds a sensitive note even once revealed', async () => {
    const w = render()
    await flush()
    w.vm.persons[0].notes = null
    w.vm.persons[0].notes_withheld = true
    await flush()

    const reveal = w.findAll('button').find(b => b.text() === 'Reveal')
    await reveal.trigger('click')
    await flush()

    expect(w.find('.person-notes').exists()).toBe(false)
  })
})
