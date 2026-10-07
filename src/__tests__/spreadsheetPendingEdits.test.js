import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NodeSpreadsheet from '../components/NodeSpreadsheet.vue'

/**
 * An edit reaches the saved cell list only after a debounce and a database
 * write. The rows handed to the grid are rebuilt from that list whenever any
 * cell is saved, so until an edit's own save landed, the rows showed the cell
 * as it was before: a copy taken straight after typing copied the old value.
 * The rows must show an edit from the moment the grid reports it.
 */

vi.mock('ag-grid-vue3', () => ({
  AgGridVue: { name: 'AgGridVue', inheritAttrs: false, setup: () => () => null },
}))

const tableData = {
  name: 'T',
  row_count: 2,
  column_definitions: [
    { id: 'col0', name: 'A', type: 'text', width: 100 },
    { id: 'col1', name: 'B', type: 'text', width: 100 },
  ],
}

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function edit(row, field, newValue) {
  wrapper.findComponent({ name: 'AgGridVue' }).vm.$emit('cell-value-changed', {
    node: { rowIndex: row },
    colDef: { field },
    newValue,
  })
}

describe('the rows handed to the grid', () => {
  it('show an edit before its save has landed', () => {
    wrapper = mount(NodeSpreadsheet, { props: { nodeId: 1, tableData, cellData: [] } })
    edit(0, 'B', 'typed')
    expect(wrapper.vm.rowData[0].B).toBe('typed')
  })

  it('keep an unsaved edit when another cell is saved', async () => {
    wrapper = mount(NodeSpreadsheet, { props: { nodeId: 1, tableData, cellData: [] } })
    edit(0, 'A', 'first')
    edit(0, 'B', 'second')
    await wrapper.setProps({ cellData: [{ row_index: 0, col_index: 0, value: 'first' }] })
    expect(wrapper.vm.rowData[0]).toMatchObject({ A: 'first', B: 'second' })
  })

  it('follow the saved value once the save has landed', async () => {
    wrapper = mount(NodeSpreadsheet, { props: { nodeId: 1, tableData, cellData: [] } })
    edit(0, 'A', 'first')
    await wrapper.setProps({ cellData: [{ row_index: 0, col_index: 0, value: 'first' }] })
    await wrapper.setProps({ cellData: [{ row_index: 0, col_index: 0, value: 'changed elsewhere' }] })
    expect(wrapper.vm.rowData[0].A).toBe('changed elsewhere')
  })

  it('drop unsaved edits when the table belongs to another node', async () => {
    wrapper = mount(NodeSpreadsheet, { props: { nodeId: 1, tableData, cellData: [] } })
    edit(0, 'A', 'first')
    await wrapper.setProps({ nodeId: 2 })
    expect(wrapper.vm.rowData[0].A).toBe('')
  })
})
