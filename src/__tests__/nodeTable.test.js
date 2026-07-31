import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Node Table Feature', () => {
  describe('API - webApi table methods', () => {
    let api, originalFetch

    beforeEach(async () => {
      vi.resetModules()
      originalFetch = global.fetch
      delete window.electronAPI

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const module = await import('../services/api.js')
      api = module.api
    })

    afterEach(() => {
      global.fetch = originalFetch
      vi.restoreAllMocks()
    })

    describe('getNodeTable', () => {
      it('should call correct endpoint with node ID', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 1, node_id: 123, name: 'Table' }),
        })
        const result = await api.getNodeTable(123)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/123/table', expect.any(Object))
        expect(result).toEqual({ id: 1, node_id: 123, name: 'Table' })
      })

      it('should return null when no table exists', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(null),
        })
        const result = await api.getNodeTable(999)
        expect(result).toBeNull()
      })
    })

    describe('createNodeTable', () => {
      it('should POST to create table', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 1, node_id: 123, name: 'My Table' }),
        })
        const result = await api.createNodeTable(123, { name: 'My Table' })
        expect(fetch).toHaveBeenCalledWith('/api/nodes/123/table', {
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          body: JSON.stringify({ name: 'My Table' }),
        })
        expect(result.name).toBe('My Table')
      })

      it('should create table with default column definitions', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 1,
              node_id: 123,
              column_definitions: [
                { id: 'col1', name: 'A', type: 'text', width: 100 },
                { id: 'col2', name: 'B', type: 'text', width: 100 },
              ],
              row_count: 5,
            }),
        })
        const result = await api.createNodeTable(123, {})
        expect(result.column_definitions).toBeDefined()
        expect(result.row_count).toBe(5)
      })
    })

    describe('updateNodeTable', () => {
      it('should PATCH to update table', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 1, name: 'Updated Name' }),
        })
        await api.updateNodeTable(123, { name: 'Updated Name' })
        expect(fetch).toHaveBeenCalledWith('/api/nodes/123/table', {
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated Name' }),
        })
      })

      it('should update column definitions', async () => {
        const newCols = [{ id: 'col1', name: 'Column A', type: 'text', width: 150 }]
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 1, column_definitions: newCols }),
        })
        const result = await api.updateNodeTable(123, { column_definitions: newCols })
        expect(result.column_definitions).toEqual(newCols)
      })
    })

    describe('deleteNodeTable', () => {
      it('should DELETE table', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        })
        const result = await api.deleteNodeTable(123)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/123/table', {
          headers: { 'Content-Type': 'application/json' },
          method: 'DELETE',
        })
        expect(result.success).toBe(true)
      })
    })

    describe('getTableCells', () => {
      it('should call correct endpoint', async () => {
        const mockCells = [
          { row_index: 0, col_index: 0, value: 'A1' },
          { row_index: 0, col_index: 1, value: 'B1' },
        ]
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCells),
        })
        const result = await api.getTableCells(123)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/123/table/cells', expect.any(Object))
        expect(result).toEqual(mockCells)
      })
    })

    describe('setCells', () => {
      it('should POST cells to update', async () => {
        const cells = [{ row_index: 0, col_index: 0, value: 'Updated' }]
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, updated: 1 }),
        })
        const result = await api.setCells(123, cells)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/123/table/cells', {
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          body: JSON.stringify({ cells }),
        })
        expect(result.success).toBe(true)
      })

      it('should handle formula cells', async () => {
        const cells = [{ row_index: 2, col_index: 0, formula: '=SUM(A1:A2)', computed_value: '10' }]
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, updated: 1 }),
        })
        await api.setCells(123, cells)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/123/table/cells', {
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          body: JSON.stringify({ cells }),
        })
      })
    })

    describe('clearCells', () => {
      it('should DELETE to clear all cells', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, cleared: 10 }),
        })
        const result = await api.clearCells(123)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/123/table/cells', {
          headers: { 'Content-Type': 'application/json' },
          method: 'DELETE',
        })
        expect(result.success).toBe(true)
      })
    })
  })

  describe('API - electronApi table methods', () => {
    let api

    beforeEach(async () => {
      vi.resetModules()

      // Mock electronAPI
      window.electronAPI = {
        getNodeTable: vi.fn().mockResolvedValue({ id: 1, node_id: 123 }),
        createNodeTable: vi.fn().mockResolvedValue({ id: 1, node_id: 123 }),
        updateNodeTable: vi.fn().mockResolvedValue({ id: 1 }),
        deleteNodeTable: vi.fn().mockResolvedValue({ success: true }),
        getTableCells: vi.fn().mockResolvedValue([]),
        setCells: vi.fn().mockResolvedValue({ success: true }),
        clearCells: vi.fn().mockResolvedValue({ success: true }),
      }

      const module = await import('../services/api.js')
      api = module.api
    })

    afterEach(() => {
      delete window.electronAPI
      vi.restoreAllMocks()
    })

    it('getNodeTable should call electronAPI', async () => {
      await api.getNodeTable(123)
      expect(window.electronAPI.getNodeTable).toHaveBeenCalledWith(123)
    })

    it('createNodeTable should call electronAPI', async () => {
      await api.createNodeTable(123, { name: 'Test' })
      expect(window.electronAPI.createNodeTable).toHaveBeenCalledWith(123, { name: 'Test' })
    })

    it('updateNodeTable should call electronAPI', async () => {
      await api.updateNodeTable(123, { name: 'Updated' })
      expect(window.electronAPI.updateNodeTable).toHaveBeenCalledWith(123, { name: 'Updated' })
    })

    it('deleteNodeTable should call electronAPI', async () => {
      await api.deleteNodeTable(123)
      expect(window.electronAPI.deleteNodeTable).toHaveBeenCalledWith(123)
    })

    it('getTableCells should call electronAPI', async () => {
      await api.getTableCells(123)
      expect(window.electronAPI.getTableCells).toHaveBeenCalledWith(123)
    })

    it('setCells should call electronAPI', async () => {
      const cells = [{ row_index: 0, col_index: 0, value: 'test' }]
      await api.setCells(123, cells)
      expect(window.electronAPI.setCells).toHaveBeenCalledWith(123, cells)
    })

    it('clearCells should call electronAPI', async () => {
      await api.clearCells(123)
      expect(window.electronAPI.clearCells).toHaveBeenCalledWith(123)
    })
  })

  describe('useNodeTable composable', () => {
    let useNodeTable, api

    beforeEach(async () => {
      vi.resetModules()

      // Mock the API module
      vi.doMock('../services/api.js', () => ({
        api: {
          getNodeTable: vi.fn(),
          createNodeTable: vi.fn(),
          updateNodeTable: vi.fn(),
          deleteNodeTable: vi.fn(),
          getTableCells: vi.fn(),
          setCells: vi.fn(),
          clearCells: vi.fn(),
        },
      }))

      const apiModule = await import('../services/api.js')
      api = apiModule.api

      const composableModule = await import('../composables/useNodeTable.js')
      useNodeTable = composableModule.useNodeTable
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should initialize with empty state', () => {
      const { table, cells, loading, error } = useNodeTable()
      expect(table.value).toBeNull()
      expect(cells.value).toEqual([])
      expect(loading.value).toBe(false)
      expect(error.value).toBeNull()
    })

    it('loadTable should fetch table and cells', async () => {
      const mockTable = { id: 1, node_id: 123, name: 'Test Table' }
      const mockCells = [{ row_index: 0, col_index: 0, value: 'A1' }]

      api.getNodeTable.mockResolvedValue(mockTable)
      api.getTableCells.mockResolvedValue(mockCells)

      const { table, cells, loadTable } = useNodeTable()
      await loadTable(123)

      expect(api.getNodeTable).toHaveBeenCalledWith(123)
      expect(api.getTableCells).toHaveBeenCalledWith(123)
      expect(table.value).toEqual(mockTable)
      expect(cells.value).toEqual(mockCells)
    })

    it('loadTable should handle no table gracefully', async () => {
      api.getNodeTable.mockResolvedValue(null)

      const { table, cells, loadTable } = useNodeTable()
      await loadTable(123)

      expect(table.value).toBeNull()
      expect(cells.value).toEqual([])
    })

    it('createTable should create and load table', async () => {
      const mockTable = { id: 1, node_id: 123, name: 'New Table' }
      api.createNodeTable.mockResolvedValue(mockTable)
      api.getNodeTable.mockResolvedValue(mockTable)
      api.getTableCells.mockResolvedValue([])

      const { table, createTable } = useNodeTable()
      await createTable(123, { name: 'New Table' })

      expect(api.createNodeTable).toHaveBeenCalledWith(123, { name: 'New Table' })
      expect(table.value).toEqual(mockTable)
    })

    it('saveCell should update cells via API', async () => {
      api.setCells.mockResolvedValue({ success: true })

      const { saveCell } = useNodeTable()
      await saveCell(123, 0, 0, 'New Value')

      expect(api.setCells).toHaveBeenCalledWith(123, [{ row_index: 0, col_index: 0, value: 'New Value' }])
    })

    it('saveCell should handle formula cells', async () => {
      api.setCells.mockResolvedValue({ success: true })

      const { saveCell } = useNodeTable()
      await saveCell(123, 2, 0, '=SUM(A1:A2)', true)

      expect(api.setCells).toHaveBeenCalledWith(123, [{ row_index: 2, col_index: 0, formula: '=SUM(A1:A2)' }])
    })

    it('deleteTable should remove table', async () => {
      api.deleteNodeTable.mockResolvedValue({ success: true })

      const { table, deleteTable } = useNodeTable()
      table.value = { id: 1, node_id: 123 }

      await deleteTable(123)

      expect(api.deleteNodeTable).toHaveBeenCalledWith(123)
      expect(table.value).toBeNull()
    })

    it('should set error on API failure', async () => {
      api.getNodeTable.mockRejectedValue(new Error('Network error'))

      const { error, loadTable } = useNodeTable()
      await loadTable(123)

      expect(error.value).toBe('Network error')
    })

    it('hasTable should return true when table exists', () => {
      const { table, hasTable } = useNodeTable()
      expect(hasTable.value).toBe(false)

      table.value = { id: 1, node_id: 123 }
      expect(hasTable.value).toBe(true)
    })
  })
})
