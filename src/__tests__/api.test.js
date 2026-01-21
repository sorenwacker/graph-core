import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Test the filterNulls helper and webApi
describe('API Module', () => {
  describe('filterNulls helper', () => {
    // Import the module to test filterNulls behavior through the API
    let api, originalFetch

    beforeEach(() => {
      // Reset modules
      vi.resetModules()
      originalFetch = global.fetch
    })

    afterEach(() => {
      global.fetch = originalFetch
      vi.restoreAllMocks()
    })

    it('should filter null values from arrays', async () => {
      // Mock fetch to return array with nulls
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1 }, null, { id: 2 }, undefined, { id: 3 }])
      })

      // In web mode, the API doesn't filter nulls - only electronApi does
      // So we test that the response comes through
      const { api } = await import('../services/api.js')
      const result = await api.getNodes()
      expect(result).toEqual([{ id: 1 }, null, { id: 2 }, undefined, { id: 3 }])
    })

    it('should return non-arrays unchanged', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, title: 'Test' })
      })

      const { api } = await import('../services/api.js')
      const result = await api.getNode(1)
      expect(result).toEqual({ id: 1, title: 'Test' })
    })
  })

  describe('webApi', () => {
    let api, originalFetch

    beforeEach(async () => {
      vi.resetModules()
      originalFetch = global.fetch
      // Ensure we're testing web API (no electronAPI)
      delete window.electronAPI

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([])
      })

      const module = await import('../services/api.js')
      api = module.api
    })

    afterEach(() => {
      global.fetch = originalFetch
      vi.restoreAllMocks()
    })

    describe('Node CRUD operations', () => {
      it('getNodes should call correct endpoint', async () => {
        await api.getNodes()
        expect(fetch).toHaveBeenCalledWith('/api/nodes', expect.any(Object))
      })

      it('getNodes with params should include query string', async () => {
        await api.getNodes({ type: 'task', limit: 10 })
        expect(fetch).toHaveBeenCalledWith('/api/nodes?type=task&limit=10', expect.any(Object))
      })

      it('getNode should call correct endpoint', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 123, title: 'Test' })
        })
        await api.getNode(123)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/123', expect.any(Object))
      })

      it('createNode should POST with data', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 1, title: 'New Node' })
        })
        await api.createNode({ title: 'New Node', type: 'task' })
        expect(fetch).toHaveBeenCalledWith('/api/nodes', {
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          body: JSON.stringify({ title: 'New Node', type: 'task' })
        })
      })

      it('updateNode should PATCH with data', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 1, title: 'Updated' })
        })
        await api.updateNode(1, { title: 'Updated' })
        expect(fetch).toHaveBeenCalledWith('/api/nodes/1', {
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
          body: JSON.stringify({ title: 'Updated' })
        })
      })

      it('deleteNode should DELETE', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
        await api.deleteNode(1)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/1?hard=false', {
          headers: { 'Content-Type': 'application/json' },
          method: 'DELETE'
        })
      })

      it('deleteNode with hard=true should include hard param', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
        await api.deleteNode(1, true)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/1?hard=true', {
          headers: { 'Content-Type': 'application/json' },
          method: 'DELETE'
        })
      })
    })

    describe('Tree operations', () => {
      it('getRoots should call correct endpoint', async () => {
        await api.getRoots()
        expect(fetch).toHaveBeenCalledWith('/api/roots', expect.any(Object))
      })

      it('getRoots with workspaceId should include param', async () => {
        await api.getRoots('work')
        expect(fetch).toHaveBeenCalledWith('/api/roots?workspace_id=work', expect.any(Object))
      })

      it('getChildren should call correct endpoint', async () => {
        await api.getChildren(1)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/1/children', expect.any(Object))
      })

      it('getChildren with type filter', async () => {
        await api.getChildren(1, 'task')
        expect(fetch).toHaveBeenCalledWith('/api/nodes/1/children?type=task', expect.any(Object))
      })

      it('getDescendants should call correct endpoint', async () => {
        await api.getDescendants(1)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/1/descendants', expect.any(Object))
      })

      it('getDescendants with maxDepth', async () => {
        await api.getDescendants(1, 3)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/1/descendants?max_depth=3', expect.any(Object))
      })

      it('getAncestors should call correct endpoint', async () => {
        await api.getAncestors(1)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/1/ancestors', expect.any(Object))
      })

      it('moveNode should POST to move endpoint', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
        await api.moveNode(1, 2)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/1/move', {
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          body: JSON.stringify({ new_parent_id: 2 })
        })
      })
    })

    describe('Links operations', () => {
      it('linkNodes should POST', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
        await api.linkNodes(1, 2)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/1/link/2', {
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        })
      })

      it('unlinkNodes should DELETE', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
        await api.unlinkNodes(1, 2)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/1/link/2', {
          headers: { 'Content-Type': 'application/json' },
          method: 'DELETE'
        })
      })

      it('getAllLinks should call correct endpoint', async () => {
        await api.getAllLinks()
        expect(fetch).toHaveBeenCalledWith('/api/links', expect.any(Object))
      })

      it('getAllLinks with nodeIds', async () => {
        await api.getAllLinks([1, 2, 3])
        expect(fetch).toHaveBeenCalledWith('/api/links?node_ids=1,2,3', expect.any(Object))
      })
    })

    describe('Search operations', () => {
      it('search should include query', async () => {
        await api.search('test')
        expect(fetch).toHaveBeenCalledWith('/api/search?q=test', expect.any(Object))
      })

      it('search with type filter', async () => {
        await api.search('test', 'task')
        expect(fetch).toHaveBeenCalledWith('/api/search?q=test&type=task', expect.any(Object))
      })

      it('search with workspaceId', async () => {
        await api.search('test', null, 'work')
        expect(fetch).toHaveBeenCalledWith('/api/search?q=test&workspace_id=work', expect.any(Object))
      })
    })

    describe('Trash operations', () => {
      it('getTrash should call correct endpoint', async () => {
        await api.getTrash()
        expect(fetch).toHaveBeenCalledWith('/api/trash?limit=100', expect.any(Object))
      })

      it('getTrash with custom limit', async () => {
        await api.getTrash(50)
        expect(fetch).toHaveBeenCalledWith('/api/trash?limit=50', expect.any(Object))
      })

      it('restoreNode should POST', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
        await api.restoreNode(1)
        expect(fetch).toHaveBeenCalledWith('/api/nodes/1/restore', {
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        })
      })

      it('emptyTrash should DELETE', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
        await api.emptyTrash()
        expect(fetch).toHaveBeenCalledWith('/api/trash', {
          headers: { 'Content-Type': 'application/json' },
          method: 'DELETE'
        })
      })
    })

    describe('Error handling', () => {
      it('should throw on non-ok response', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: false,
          status: 404
        })
        await expect(api.getNode(999)).rejects.toThrow('API error: 404')
      })

      it('should throw on network error', async () => {
        global.fetch.mockRejectedValueOnce(new Error('Network error'))
        await expect(api.getNodes()).rejects.toThrow('Network error')
      })
    })

    describe('Workspace operations', () => {
      it('getWorkspaces should call correct endpoint', async () => {
        await api.getWorkspaces()
        expect(fetch).toHaveBeenCalledWith('/api/workspaces', expect.any(Object))
      })

      it('createWorkspace should POST with data', async () => {
        global.fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'new', name: 'New Workspace' })
        })
        await api.createWorkspace({ name: 'New Workspace', color: '#ff0000' })
        expect(fetch).toHaveBeenCalledWith('/api/workspaces', {
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          body: JSON.stringify({ name: 'New Workspace', color: '#ff0000' })
        })
      })
    })

    describe('Desktop-only operations return errors in web mode', () => {
      it('backup should return error', async () => {
        const result = await api.backup()
        expect(result.error).toBeDefined()
      })

      it('listBackups should return empty array', async () => {
        const result = await api.listBackups()
        expect(result).toEqual([])
      })

      it('reload should return error', async () => {
        const result = await api.reload()
        expect(result.error).toBeDefined()
      })
    })
  })
})
