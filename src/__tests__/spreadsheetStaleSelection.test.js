import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import NodeSpreadsheet from '../components/NodeSpreadsheet.vue'
import { useSpreadsheetKeyboard } from '../composables/useSpreadsheetKeyboard.js'

/**
 * A spreadsheet selection must not outlive the user's attention. The keyboard
 * handler runs on document in the capture phase and calls stopPropagation, and
 * it deliberately claims keys while focus is on body. Nothing cleared the
 * selection when the pointer went elsewhere, so after clicking a cell and then
 * clicking the graph, Cmd+Backspace blanked the selected cells and swallowed
 * the event instead of deleting the node.
 *
 * Every destructive branch is gated on there being a selection, so clearing it
 * when a click lands outside the grid closes all of them at once.
 */

vi.mock('ag-grid-vue3', () => ({
  AgGridVue: { name: 'AgGridVue', inheritAttrs: false, setup: () => () => null },
}))

const tableData = {
  name: 'T',
  row_count: 3,
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

function mountSheet() {
  const outside = document.createElement('div')
  outside.id = 'outside'
  document.body.appendChild(outside)
  wrapper = mount(NodeSpreadsheet, { props: { nodeId: 1, tableData, cellData: [] }, attachTo: document.body })
  return { outside }
}

// jsdom has no hit-testing; the grid's own mousedown maps a point to a cell.
document.elementFromPoint = () => null

function mousedownOn(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
}

describe('a selection when the click goes elsewhere', () => {
  it('is dropped when the pointer goes outside the grid', async () => {
    const { outside } = mountSheet()
    const selection = wrapper.vm.selection

    selection.selectionStart.value = { row: 0, col: 0 }
    selection.selectionEnd.value = { row: 1, col: 1 }
    expect(selection.selectionBounds.value).not.toBeNull()

    mousedownOn(outside)
    await wrapper.vm.$nextTick()

    expect(selection.selectionBounds.value).toBeNull()
  })

  it('is left to the grid when the click lands on a cell', async () => {
    mountSheet()
    const selection = wrapper.vm.selection

    // A real cell, so the grid's own handler selects rather than clears.
    const row = document.createElement('div')
    row.className = 'ag-row'
    row.setAttribute('row-index', '0')
    const cell = document.createElement('div')
    cell.className = 'ag-cell'
    cell.setAttribute('col-id', 'A')
    row.appendChild(cell)
    wrapper.vm.gridWrapper.appendChild(row)
    document.elementFromPoint = () => cell

    mousedownOn(cell)
    await wrapper.vm.$nextTick()

    expect(selection.selectionBounds.value).not.toBeNull()
  })

  it('survives a right-click, which opens the context menu on the selection', async () => {
    const { outside } = mountSheet()
    const selection = wrapper.vm.selection
    selection.selectionStart.value = { row: 0, col: 0 }
    selection.selectionEnd.value = { row: 1, col: 1 }

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }))
    await wrapper.vm.$nextTick()

    expect(selection.selectionBounds.value).not.toBeNull()
  })
})

/**
 * With no selection left, the branches that acted on a stale one cannot fire.
 */
describe('the keyboard handler with no selection', () => {
  it('leaves Backspace and printable keys alone while focus is on body', () => {
    const actions = { deleteSelectedCells: vi.fn(), fillSelectionWithValue: vi.fn(), copySelection: vi.fn() }
    const { handleKeyDown } = useSpreadsheetKeyboard({
      getGridWrapper: () => document.createElement('div'),
      getSelectionBounds: () => null,
      actions,
      isColumnMenuOpen: () => false,
      isContextMenuOpen: () => false,
    })

    for (const key of ['Backspace', 'Delete', 'x']) {
      const event = new KeyboardEvent('keydown', { key, cancelable: true })
      vi.spyOn(event, 'stopPropagation')
      handleKeyDown(event)
      expect(event.stopPropagation, `${key} was swallowed`).not.toHaveBeenCalled()
    }
    expect(actions.deleteSelectedCells).not.toHaveBeenCalled()
    expect(actions.fillSelectionWithValue).not.toHaveBeenCalled()
  })
})
