import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase, createNodeFactory } from './helpers/testDatabase.js'
import { useColumnOperations } from '../composables/useColumnOperations.js'

/**
 * Table cells are addressed positionally by col_index, so the cell store and
 * column_definitions have to change together. Rewriting the definitions alone
 * leaves every cell to the right of a deleted column pointing at its
 * neighbour's data.
 *
 * setCells writes one cell at a time and must not blank the fields the caller
 * did not mention: value and style arrive from separate UI events.
 */

let db, factory, node

beforeEach(async () => {
  db = await createTestDatabase()
  factory = createNodeFactory(db)
  node = factory.note({ title: 'With a table' })
  db.createNodeTable(node.id, {
    name: 'T',
    column_definitions: [
      { id: 'a', name: 'A', type: 'text' },
      { id: 'b', name: 'B', type: 'text' },
      { id: 'c', name: 'C', type: 'text' },
      { id: 'd', name: 'D', type: 'text' },
    ],
    row_count: 1,
  })
  db.setCells(node.id, [
    { row_index: 0, col_index: 0, value: 'a0' },
    { row_index: 0, col_index: 1, value: 'b0' },
    { row_index: 0, col_index: 2, value: 'c0' },
    { row_index: 0, col_index: 3, value: 'd0' },
  ])
})

afterEach(() => db.close())

const cellsByIndex = () => {
  const out = {}
  for (const c of db.getTableCells(node.id)) out[`${c.row_index},${c.col_index}`] = c.value
  return out
}
const columnNames = () => db.getNodeTable(node.id).column_definitions.map(c => c.name)

describe('deleting a table column', () => {
  it('removes the column from the definitions', () => {
    db.deleteTableColumn(node.id, 1)
    expect(columnNames()).toEqual(['A', 'C', 'D'])
  })

  it('shifts the cells right of it left, so each column keeps its own data', () => {
    db.deleteTableColumn(node.id, 1)
    expect(cellsByIndex()).toEqual({ '0,0': 'a0', '0,1': 'c0', '0,2': 'd0' })
  })

  it('leaves no orphaned cell beyond the last column', () => {
    db.deleteTableColumn(node.id, 1)
    const maxCol = Math.max(...db.getTableCells(node.id).map(c => c.col_index))
    expect(maxCol).toBe(columnNames().length - 1)
  })

  it('does not resurrect old values when a column is added back', () => {
    db.deleteTableColumn(node.id, 1)
    const cols = db.getNodeTable(node.id).column_definitions
    db.updateNodeTable(node.id, { column_definitions: [...cols, { id: 'e', name: 'E', type: 'text' }] })
    expect(cellsByIndex()['0,3']).toBeUndefined()
  })

  it('deletes the last column of a row without touching earlier ones', () => {
    db.deleteTableColumn(node.id, 3)
    expect(cellsByIndex()).toEqual({ '0,0': 'a0', '0,1': 'b0', '0,2': 'c0' })
  })

  it('refuses to delete the only remaining column', () => {
    db.updateNodeTable(node.id, { column_definitions: [{ id: 'a', name: 'A', type: 'text' }] })
    expect(() => db.deleteTableColumn(node.id, 0)).toThrow()
  })

  it('rejects an index outside the column range', () => {
    expect(() => db.deleteTableColumn(node.id, 9)).toThrow()
  })
})

describe('writing a single cell', () => {
  it('keeps the style when only the value is written', () => {
    db.setCells(node.id, [{ row_index: 0, col_index: 0, value: 'a0', style: { bold: true } }])
    db.setCells(node.id, [{ row_index: 0, col_index: 0, value: 'typed over' }])

    const cell = db.getTableCells(node.id).find(c => c.row_index === 0 && c.col_index === 0)
    expect(cell.value).toBe('typed over')
    expect(cell.style).toEqual({ bold: true })
  })

  it('keeps the value when only the style is written', () => {
    db.setCells(node.id, [{ row_index: 0, col_index: 0, style: { bold: true } }])

    const cell = db.getTableCells(node.id).find(c => c.row_index === 0 && c.col_index === 0)
    expect(cell.value).toBe('a0')
    expect(cell.style).toEqual({ bold: true })
  })

  it('round-trips a style object rather than double-encoding it', () => {
    db.setCells(node.id, [{ row_index: 0, col_index: 0, style: { bold: true } }])
    const cell = db.getTableCells(node.id).find(c => c.row_index === 0 && c.col_index === 0)
    expect(typeof cell.style).toBe('object')
  })

  it('still lets a field be cleared explicitly', () => {
    db.setCells(node.id, [{ row_index: 0, col_index: 0, value: null }])
    const cell = db.getTableCells(node.id).find(c => c.row_index === 0 && c.col_index === 0)
    expect(cell.value).toBeNull()
  })
})

describe('the delete-column menu action', () => {
  // The database operation above is only worth having if the menu reaches it.
  function menu(columns) {
    const emitted = []
    const ops = useColumnOperations({
      getTableData: () => ({ column_definitions: columns }),
      getColumns: () => columns,
      emit: (event, payload) => emitted.push([event, payload]),
    })
    return { ops, emitted }
  }

  const COLS = [
    { id: 'a', name: 'A', type: 'text' },
    { id: 'b', name: 'B', type: 'text' },
  ]

  it('asks for the column index rather than replacement definitions', () => {
    const { ops, emitted } = menu(COLS)
    ops.openColumnMenu(1, { stopPropagation() {}, currentTarget: { getBoundingClientRect: () => ({}) } })
    ops.deleteColumn()

    expect(emitted).toEqual([['delete-column', { colIndex: 1 }]])
  })

  it('still refuses to delete the last remaining column', () => {
    const { ops, emitted } = menu([COLS[0]])
    ops.openColumnMenu(0, { stopPropagation() {}, currentTarget: { getBoundingClientRect: () => ({}) } })
    ops.deleteColumn()

    expect(emitted).toEqual([])
  })
})
