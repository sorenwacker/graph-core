import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Breadcrumbs from '../components/Breadcrumbs.vue'
import { ROOT_DROP_ACTIVE_CLASS } from '../utils/rootDropTarget.js'

/**
 * Cards view drags with native HTML5 drag-and-drop, so the home crumb accepts
 * the drop itself. Graph and table view are tracked by pointer position
 * instead, and reach the same handler through App.
 * See docs/guides/drag-drop.md.
 */

const dragEvent = (id = '5') => ({
  preventDefault: () => {},
  dataTransfer: { getData: () => String(id), dropEffect: '' },
})

function mountCrumbs() {
  return mount(Breadcrumbs, { props: { breadcrumbs: [{ id: 1, title: 'Infrastructure' }] } })
}

describe('breadcrumb root drop target', () => {
  it('moves the dropped node to the top level', async () => {
    const wrapper = mountCrumbs()

    await wrapper.find('.home-crumb').trigger('drop', dragEvent(7))

    expect(wrapper.emitted('drop-to-root')).toEqual([[7]])
  })

  it('ignores a drop that carries no node id', async () => {
    const wrapper = mountCrumbs()

    await wrapper.find('.home-crumb').trigger('drop', dragEvent('a picture'))

    expect(wrapper.emitted('drop-to-root')).toBeUndefined()
  })

  it('highlights while a node is dragged over it and clears on leave', async () => {
    const wrapper = mountCrumbs()
    const crumb = wrapper.find('.home-crumb')

    await crumb.trigger('dragenter', dragEvent())
    expect(crumb.classes()).toContain(ROOT_DROP_ACTIVE_CLASS)

    await crumb.trigger('dragleave', dragEvent())
    expect(crumb.classes()).not.toContain(ROOT_DROP_ACTIVE_CLASS)
  })

  it('clears the highlight once the node is dropped', async () => {
    const wrapper = mountCrumbs()
    const crumb = wrapper.find('.home-crumb')

    await crumb.trigger('dragenter', dragEvent())
    await crumb.trigger('drop', dragEvent())

    expect(crumb.classes()).not.toContain(ROOT_DROP_ACTIVE_CLASS)
  })

  it('still navigates home when clicked', async () => {
    const wrapper = mountCrumbs()

    await wrapper.find('.home-crumb').trigger('click')

    expect(wrapper.emitted('navigate')).toEqual([[-1]])
  })
})
