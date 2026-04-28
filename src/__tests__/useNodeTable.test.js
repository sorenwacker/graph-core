import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useNodeTable } from '../composables/useNodeTable.js'

// Mock the api service
vi.mock('../services/api', () => ({
  api: {
    getNodeTable: vi.fn(),
    getTableCells: vi.fn(),
    createNodeTable: vi.fn(),
    updateNodeTable: vi.fn(),
    deleteNodeTable: vi.fn(),
    setCells: vi.fn(),
    clearCells: vi.fn(),
  },
}))

describe('useNodeTable', () => {
  let api

  beforeEach(async () => {
    vi.clearAllMocks()
    api = (await import('../services/api')).api
  })

  describe('initialization', () => {
    it('should return all expected properties and methods', () => {
      const result = useNodeTable()

      // State
      expect(result).toHaveProperty('table')
      expect(result).toHaveProperty('cells')
      expect(result).toHaveProperty('loading')
      expect(result).toHaveProperty('error')
      expect(result).toHaveProperty('hasTable')
      expect(result).toHaveProperty('cellsAsMatrix')

      // Actions
      expect(result).toHaveProperty('loadTable')
      expect(result).toHaveProperty('createTable')
      expect(result).toHaveProperty('updateTable')
      expect(result).toHaveProperty('deleteTable')
      expect(result).toHaveProperty('saveCell')
      expect(result).toHaveProperty('saveCellStyle')
      expect(result).toHaveProperty('saveCells')
      expect(result).toHaveProperty('clearAllCells')
      expect(result).toHaveProperty('addRows')
      expect(result).toHaveProperty('addColumns')
      expect(result).toHaveProperty('getColumnName')
    })

    it('should start with null table', () => {
      const { table, hasTable } = useNodeTable()

      expect(table.value).toBeNull()
      expect(hasTable.value).toBe(false)
    })

    it('should start with empty cells', () => {
      const { cells } = useNodeTable()

      expect(cells.value).toEqual([])
    })

    it('should start with loading false', () => {
      const { loading } = useNodeTable()

      expect(loading.value).toBe(false)
    })
  })

  describe('getColumnName', () => {
    it('should return A for index 0', () => {
      const { getColumnName } = useNodeTable()

      expect(getColumnName(0)).toBe('A')
    })

    it('should return B for index 1', () => {
      const { getColumnName } = useNodeTable()

      expect(getColumnName(1)).toBe('B')
    })

    it('should return Z for index 25', () => {
      const { getColumnName } = useNodeTable()

      expect(getColumnName(25)).toBe('Z')
    })

    it('should return AA for index 26', () => {
      const { getColumnName } = useNodeTable()

      expect(getColumnName(26)).toBe('AA')
    })

    it('should return AB for index 27', () => {
      const { getColumnName } = useNodeTable()

      expect(getColumnName(27)).toBe('AB')
    })
  })

  describe('cellsAsMatrix', () => {
    it('should return empty array when no table', () => {
      const { cellsAsMatrix } = useNodeTable()

      expect(cellsAsMatrix.value).toEqual([])
    })

    it('should convert cells to 2D matrix', () => {
      const { table, cells, cellsAsMatrix } = useNodeTable()

      table.value = {
        row_count: 3,
        column_definitions: [{ id: 'col0' }, { id: 'col1' }],
      }

      cells.value = [
        { row_index: 0, col_index: 0, value: 'A1' },
        { row_index: 0, col_index: 1, value: 'B1' },
        { row_index: 1, col_index: 0, value: 'A2' },
      ]

      expect(cellsAsMatrix.value).toEqual([
        ['A1', 'B1'],
        ['A2', ''],
        ['', ''],
      ])
    })

    it('should prefer formula over value', () => {
      const { table, cells, cellsAsMatrix } = useNodeTable()

      table.value = {
        row_count: 1,
        column_definitions: [{ id: 'col0' }],
      }

      cells.value = [{ row_index: 0, col_index: 0, value: '10', formula: '=5+5' }]

      expect(cellsAsMatrix.value[0][0]).toBe('=5+5')
    })
  })

  describe('loadTable', () => {
    it('should load table and cells', async () => {
      api.getNodeTable.mockResolvedValue({
        id: 1,
        row_count: 5,
        column_definitions: [],
      })
      api.getTableCells.mockResolvedValue([{ row_index: 0, col_index: 0, value: 'test' }])

      const { table, cells, loading, loadTable } = useNodeTable()

      await loadTable(1)

      expect(api.getNodeTable).toHaveBeenCalledWith(1)
      expect(api.getTableCells).toHaveBeenCalledWith(1)
      expect(table.value).toEqual({ id: 1, row_count: 5, column_definitions: [] })
      expect(cells.value).toEqual([{ row_index: 0, col_index: 0, value: 'test' }])
      expect(loading.value).toBe(false)
    })

    it('should handle missing table', async () => {
      api.getNodeTable.mockResolvedValue(null)

      const { table, cells, loadTable } = useNodeTable()

      await loadTable(1)

      expect(table.value).toBeNull()
      expect(cells.value).toEqual([])
    })

    it('should handle errors', async () => {
      api.getNodeTable.mockRejectedValue(new Error('Network error'))

      const { table, cells, error, loadTable } = useNodeTable()

      await loadTable(1)

      expect(error.value).toBe('Network error')
      expect(table.value).toBeNull()
      expect(cells.value).toEqual([])
    })
  })

  describe('createTable', () => {
    it('should create table and reload', async () => {
      api.createNodeTable.mockResolvedValue({ id: 1 })
      api.getNodeTable.mockResolvedValue({ id: 1, row_count: 5 })
      api.getTableCells.mockResolvedValue([])

      const { createTable } = useNodeTable()

      await createTable(1, { name: 'Test Table' })

      expect(api.createNodeTable).toHaveBeenCalledWith(1, { name: 'Test Table' })
      expect(api.getNodeTable).toHaveBeenCalledWith(1)
    })

    it('should handle errors', async () => {
      api.createNodeTable.mockRejectedValue(new Error('Creation failed'))

      const { error, createTable } = useNodeTable()

      await createTable(1)

      expect(error.value).toBe('Creation failed')
    })
  })

  describe('updateTable', () => {
    it('should update table settings', async () => {
      api.updateNodeTable.mockResolvedValue({ id: 1, row_count: 10 })

      const { table, updateTable } = useNodeTable()

      await updateTable(1, { row_count: 10 })

      expect(api.updateNodeTable).toHaveBeenCalledWith(1, { row_count: 10 })
      expect(table.value).toEqual({ id: 1, row_count: 10 })
    })
  })

  describe('deleteTable', () => {
    it('should delete table and clear state', async () => {
      api.deleteNodeTable.mockResolvedValue(undefined)

      const { table, cells, deleteTable } = useNodeTable()
      table.value = { id: 1 }
      cells.value = [{ row_index: 0, col_index: 0, value: 'test' }]

      await deleteTable(1)

      expect(api.deleteNodeTable).toHaveBeenCalledWith(1)
      expect(table.value).toBeNull()
      expect(cells.value).toEqual([])
    })
  })

  describe('saveCell', () => {
    it('should save cell value', async () => {
      api.setCells.mockResolvedValue(undefined)

      const { cells, saveCell } = useNodeTable()

      await saveCell(1, 0, 0, 'Hello')

      expect(api.setCells).toHaveBeenCalledWith(1, [{ row_index: 0, col_index: 0, value: 'Hello' }])
      expect(cells.value[0]).toMatchObject({ row_index: 0, col_index: 0, value: 'Hello' })
    })

    it('should save cell formula', async () => {
      api.setCells.mockResolvedValue(undefined)

      const { cells, saveCell } = useNodeTable()

      await saveCell(1, 0, 0, '=SUM(A1:A5)', true)

      expect(api.setCells).toHaveBeenCalledWith(1, [{ row_index: 0, col_index: 0, formula: '=SUM(A1:A5)' }])
      expect(cells.value[0]).toMatchObject({ row_index: 0, col_index: 0, formula: '=SUM(A1:A5)' })
    })

    it('should update existing cell', async () => {
      api.setCells.mockResolvedValue(undefined)

      const { cells, saveCell } = useNodeTable()
      cells.value = [{ row_index: 0, col_index: 0, value: 'Old' }]

      await saveCell(1, 0, 0, 'New')

      expect(cells.value[0].value).toBe('New')
    })
  })

  describe('saveCellStyle', () => {
    it('should save cell style', async () => {
      api.setCells.mockResolvedValue(undefined)

      const { cells, saveCellStyle } = useNodeTable()

      await saveCellStyle(1, 0, 0, { bold: true, color: '#ff0000' })

      expect(api.setCells).toHaveBeenCalledWith(1, [
        expect.objectContaining({
          row_index: 0,
          col_index: 0,
          style: JSON.stringify({ bold: true, color: '#ff0000' }),
        }),
      ])
    })

    it('should preserve existing value when saving style', async () => {
      api.setCells.mockResolvedValue(undefined)

      const { cells, saveCellStyle } = useNodeTable()
      cells.value = [{ row_index: 0, col_index: 0, value: 'Hello' }]

      await saveCellStyle(1, 0, 0, { bold: true })

      expect(api.setCells).toHaveBeenCalledWith(1, [
        expect.objectContaining({
          row_index: 0,
          col_index: 0,
          value: 'Hello',
        }),
      ])
    })
  })

  describe('clearAllCells', () => {
    it('should clear all cells', async () => {
      api.clearCells.mockResolvedValue(undefined)

      const { cells, clearAllCells } = useNodeTable()
      cells.value = [
        { row_index: 0, col_index: 0, value: 'A' },
        { row_index: 0, col_index: 1, value: 'B' },
      ]

      await clearAllCells(1)

      expect(api.clearCells).toHaveBeenCalledWith(1)
      expect(cells.value).toEqual([])
    })
  })

  describe('addRows', () => {
    it('should add rows to table', async () => {
      api.updateNodeTable.mockResolvedValue({ row_count: 7 })

      const { table, addRows } = useNodeTable()
      table.value = { row_count: 5 }

      await addRows(1, 2)

      expect(api.updateNodeTable).toHaveBeenCalledWith(1, { row_count: 7 })
    })

    it('should do nothing if no table', async () => {
      const { addRows } = useNodeTable()

      await addRows(1, 2)

      expect(api.updateNodeTable).not.toHaveBeenCalled()
    })
  })

  describe('addColumns', () => {
    it('should add columns to table', async () => {
      api.updateNodeTable.mockResolvedValue({})

      const { table, addColumns } = useNodeTable()
      table.value = { column_definitions: [{ id: 'col0', name: 'A' }] }

      await addColumns(1, 2)

      expect(api.updateNodeTable).toHaveBeenCalledWith(1, {
        column_definitions: [
          { id: 'col0', name: 'A' },
          { id: 'col1', name: 'B', type: 'text', width: 100 },
          { id: 'col2', name: 'C', type: 'text', width: 100 },
        ],
      })
    })
  })
})
