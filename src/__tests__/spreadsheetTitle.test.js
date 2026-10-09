import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NodeSpreadsheet from '../components/NodeSpreadsheet.vue'

/**
 * The table's toolbar holds an editable title
 * (docs/guides/detail-panel.md#table-section). It used to show the table's
 * name as fixed text, and every table is created with the name "Table", so the
 * toolbar repeated the word the section is already labelled with and offered no
 * way to change it.
 */

vi.mock('ag-grid-vue3', () => ({
  AgGridVue: { name: 'AgGridVue', inheritAttrs: false, setup: () => () => null },
}))

const columns = [{ id: 'col0', name: 'A', type: 'text', width: 100 }]

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

function mountNamed(name) {
  wrapper = mount(NodeSpreadsheet, {
    props: { nodeId: 1, tableData: { name, row_count: 2, column_definitions: columns }, cellData: [] },
  })
  return wrapper.find('input.table-title')
}

// Sets the field's text as typing does. Not setValue: that also fires `change`,
// which a browser only fires when the field is left.
function type(title, text) {
  title.element.value = text
}

const nameChanges = () =>
  (wrapper.emitted('structure-change') || []).map(([payload]) => payload).filter(p => p.type === 'name')

describe('the table title', () => {
  it('shows a placeholder, not the word Table, for a table that was never titled', () => {
    const title = mountNamed('Table')
    expect(title.element.value).toBe('')
    expect(title.attributes('placeholder')).toBe('Add a title')
  })

  it('shows the title a table has been given', () => {
    expect(mountNamed('Budget 2026').element.value).toBe('Budget 2026')
  })

  it('saves a typed title, trimmed', async () => {
    const title = mountNamed('Table')
    type(title, '  Budget 2026 ')
    await title.trigger('change')
    expect(nameChanges()).toEqual([{ type: 'name', value: 'Budget 2026' }])
  })

  it('goes back to untitled when the title is cleared', async () => {
    const title = mountNamed('Budget 2026')
    type(title, '')
    await title.trigger('change')
    expect(nameChanges()).toEqual([{ type: 'name', value: 'Table' }])
  })

  it('saves nothing when the title did not change', async () => {
    const title = mountNamed('Budget 2026')
    type(title, 'Budget 2026')
    await title.trigger('change')
    expect(nameChanges()).toEqual([])
  })

  it('puts back the saved title on Escape and saves nothing', async () => {
    const title = mountNamed('Budget 2026')
    type(title, 'Something else')
    await title.trigger('keydown', { key: 'Escape' })
    expect(title.element.value).toBe('Budget 2026')
    await title.trigger('change')
    expect(nameChanges()).toEqual([])
  })
})
