import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount, shallowMount } from '@vue/test-utils'
import TrashView from '../components/TrashView.vue'
import ViewRenderer from '../components/ViewRenderer.vue'

/**
 * The Trash view's per-item Delete permanently deletes the node
 * (docs/guides/views.md, Trash). It must not reach the soft-delete path that
 * the other views' `delete` event uses, so it travels under its own event name
 * from TrashView through ViewRenderer to useDataLoading.permanentlyDelete.
 */

const item = { id: 7, title: 'Old note', type: 'note', deleted_at: '2026-10-01T00:00:00Z' }

describe('Trash permanent delete', () => {
  it('TrashView emits delete-permanently with the item', async () => {
    const wrapper = mount(TrashView, { props: { items: [item] } })
    await wrapper.find('button.small.danger').trigger('click')
    expect(wrapper.emitted('delete-permanently')).toEqual([[item]])
    expect(wrapper.emitted('delete')).toBeUndefined()
  })

  it('ViewRenderer forwards delete-permanently from the trash view, not delete', async () => {
    const wrapper = shallowMount(ViewRenderer, { props: { viewMode: 'trash', trashedItems: [item] } })
    wrapper.findComponent(TrashView).vm.$emit('delete-permanently', item)
    expect(wrapper.emitted('delete-permanently')).toEqual([[item]])
    expect(wrapper.emitted('delete')).toBeUndefined()
  })

  it('App binds delete-permanently to permanentlyDelete', () => {
    const app = readFileSync(resolve(__dirname, '../App.vue'), 'utf8')
    expect(app).toMatch(/@delete-permanently="permanentlyDelete"/)
  })
})
