import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import NodeSpreadsheet from '../components/NodeSpreadsheet.vue'

// Capture the attrs the component passes to AG Grid without booting the real
// grid (jsdom cannot lay it out anyway).
const captured = vi.hoisted(() => ({ attrs: null }))
vi.mock('ag-grid-vue3', () => ({
  AgGridVue: {
    name: 'AgGridVue',
    inheritAttrs: false,
    setup(_, { attrs }) {
      captured.attrs = attrs
      return () => null
    },
  },
}))

const tableData = {
  name: 'T',
  row_count: 3,
  column_definitions: [
    { id: 'col0', name: 'A', type: 'text', width: 100 },
    { id: 'col1', name: 'B', type: 'text', width: 100 },
  ],
}

function mountSheet() {
  return mount(NodeSpreadsheet, {
    props: { nodeId: 1, tableData, cellData: [] },
  })
}

let wrapper
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('NodeSpreadsheet grid configuration', () => {
  it('lets data columns flex to fill the panel width instead of pinning them to a stored width', () => {
    wrapper = mountSheet()
    const defs = captured.attrs['column-defs']
    const dataCols = defs.filter(d => d.field !== '_rowIndex')
    expect(dataCols.length).toBe(2)
    for (const col of dataCols) {
      // A fixed width would override defaultColDef.flex and leave the grid
      // narrower (or wider) than the detail panel.
      expect(col.width).toBeUndefined()
    }
    expect(captured.attrs['default-col-def'].flex).toBe(1)
  })

  it('keeps the row index column at a fixed width', () => {
    wrapper = mountSheet()
    const rowIndexCol = captured.attrs['column-defs'].find(d => d.field === '_rowIndex')
    expect(rowIndexCol.width).toBe(45)
  })

  it('does not enable AG Grid row selection (which adds a checkbox column)', () => {
    wrapper = mountSheet()
    expect(captured.attrs['row-selection']).toBeUndefined()
  })
})

describe('NodeSpreadsheet.css AG Grid selectors', () => {
  it('wraps selectors targeting AG Grid-generated DOM in :deep()', () => {
    // The stylesheet is loaded via <style scoped src>. AG Grid creates its
    // cells outside Vue's template, so they never receive the data-v scope
    // attribute: a bare `.cell-selected` rule compiles to
    // `.cell-selected[data-v-x]` and silently never matches. Every selector
    // that targets grid-internal DOM must therefore be wrapped in :deep().
    const cssPath = join(dirname(fileURLToPath(import.meta.url)), '../components/NodeSpreadsheet.css')
    const css = readFileSync(cssPath, 'utf-8')
    const selectors = [...css.matchAll(/(^|\})\s*([^{}]+?)\s*\{/gs)]
      .map(m => m[2].trim())
      .filter(s => !s.startsWith('@'))

    const gridInternal = /\.(ag-|cell-selected|row-index-)/
    const offenders = selectors.filter(sel => {
      if (!gridInternal.test(sel)) return false
      // Every grid-internal class in the selector must appear inside :deep().
      return sel.split(',').some(part => {
        const p = part.trim()
        const deepStart = p.indexOf(':deep(')
        if (deepStart === -1) return gridInternal.test(p)
        return gridInternal.test(p.slice(0, deepStart))
      })
    })

    expect(offenders).toEqual([])
  })
})
