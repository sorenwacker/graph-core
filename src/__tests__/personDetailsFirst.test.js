// @vitest-environment jsdom
/**
 * A person opens with Details on top and Notes beneath, both open
 * (docs/guides/detail-panel.md > Section Bar).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PersonDetailForm from '../components/detail/PersonDetailForm.vue'

function mountPerson() {
  setActivePinia(createPinia())
  return mount(PersonDetailForm, {
    props: {
      editedNode: { id: 1, type: 'person', title: 'Example Person', notes: 'note' },
      linkedNodes: [],
      activeTab: 'preview',
    },
    shallow: true,
  })
}

describe('person detail form', () => {
  it('lists Details before Notes in the section bar, both open', () => {
    const bar = mountPerson().findComponent({ name: 'SectionBar' })
    expect(bar.props('sections').map(s => [s.key, s.open])).toEqual([
      ['details', true],
      ['notes', true],
    ])
  })

  it('renders the details section above the notes section', () => {
    const html = mountPerson().html()
    const meta = html.indexOf('meta-section')
    const notes = html.indexOf('notes-section')
    expect(meta).toBeGreaterThan(-1)
    expect(notes).toBeGreaterThan(-1)
    expect(meta).toBeLessThan(notes)
  })
})
