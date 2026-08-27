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
      expect(result).toHaveProperty('hasTable')

      // Actions
      expect(result).toHaveProperty('loadTable')
      expect(result).toHaveProperty('createTable')
      expect(result).toHaveProperty('updateTable')
      expect(result).toHaveProperty('deleteTable')
      expect(result).toHaveProperty('saveCell')
      expect(result).toHaveProperty('saveCellStyle')
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

      const { table, cells, loadTable } = useNodeTable()

      await loadTable(1)

      // Failures are reported through the shared error handler, not stored in
      // a ref nothing reads; the table is left empty.
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

      const { table, createTable } = useNodeTable()

      await createTable(1)

      expect(table.value).toBeNull()
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
})
