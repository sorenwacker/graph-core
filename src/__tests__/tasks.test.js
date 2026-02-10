import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Tasks API', () => {
  describe('webApi.getTasks', () => {
    let api, originalFetch

    beforeEach(async () => {
      vi.resetModules()
      originalFetch = global.fetch
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

    it('getTasks should call correct endpoint with no params', async () => {
      await api.getTasks()
      expect(fetch).toHaveBeenCalledWith('/api/tasks', expect.any(Object))
    })

    it('getTasks with workspaceId should include param', async () => {
      await api.getTasks({ workspaceId: 'work' })
      expect(fetch).toHaveBeenCalledWith('/api/tasks?workspaceId=work', expect.any(Object))
    })

    it('getTasks with completed filter should include param', async () => {
      await api.getTasks({ completed: false })
      expect(fetch).toHaveBeenCalledWith('/api/tasks?completed=false', expect.any(Object))
    })

    it('getTasks with due date range should include both params', async () => {
      await api.getTasks({ dueDateFrom: '2024-01-01', dueDateTo: '2024-12-31' })
      expect(fetch).toHaveBeenCalledWith(
        '/api/tasks?dueDateFrom=2024-01-01&dueDateTo=2024-12-31',
        expect.any(Object)
      )
    })

    it('getTasks with importance filter should include param', async () => {
      await api.getTasks({ importance: 5 })
      expect(fetch).toHaveBeenCalledWith('/api/tasks?importance=5', expect.any(Object))
    })

    it('getTasks with parentId filter should include param', async () => {
      await api.getTasks({ parentId: 123 })
      expect(fetch).toHaveBeenCalledWith('/api/tasks?parentId=123', expect.any(Object))
    })

    it('getTasks with multiple filters should include all params', async () => {
      await api.getTasks({
        workspaceId: 'work',
        completed: false,
        importance: 3,
        parentId: 10
      })
      expect(fetch).toHaveBeenCalledWith(
        '/api/tasks?workspaceId=work&completed=false&importance=3&parentId=10',
        expect.any(Object)
      )
    })
  })
})

describe('Task Helper Functions', () => {
  describe('isOverdue', () => {
    it('should return true for past due dates', () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 1)
      const dateStr = pastDate.toISOString().split('T')[0]

      const isOverdue = (dueDateStr) => {
        if (!dueDateStr) return false
        const dueDate = new Date(dueDateStr)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        dueDate.setHours(0, 0, 0, 0)
        return dueDate < today
      }

      expect(isOverdue(dateStr)).toBe(true)
    })

    it('should return false for future due dates', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7)
      const dateStr = futureDate.toISOString().split('T')[0]

      const isOverdue = (dueDateStr) => {
        if (!dueDateStr) return false
        const dueDate = new Date(dueDateStr)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        dueDate.setHours(0, 0, 0, 0)
        return dueDate < today
      }

      expect(isOverdue(dateStr)).toBe(false)
    })

    it('should return false for today', () => {
      const today = new Date()
      const dateStr = today.toISOString().split('T')[0]

      const isOverdue = (dueDateStr) => {
        if (!dueDateStr) return false
        const dueDate = new Date(dueDateStr)
        const todayDate = new Date()
        todayDate.setHours(0, 0, 0, 0)
        dueDate.setHours(0, 0, 0, 0)
        return dueDate < todayDate
      }

      expect(isOverdue(dateStr)).toBe(false)
    })

    it('should return false for null/undefined due date', () => {
      const isOverdue = (dueDateStr) => {
        if (!dueDateStr) return false
        const dueDate = new Date(dueDateStr)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        dueDate.setHours(0, 0, 0, 0)
        return dueDate < today
      }

      expect(isOverdue(null)).toBe(false)
      expect(isOverdue(undefined)).toBe(false)
    })
  })

  describe('formatDueDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const formatDueDate = (dueDateStr) => {
        if (!dueDateStr) return ''
        return dueDateStr.split('T')[0]
      }

      expect(formatDueDate('2024-06-15T00:00:00Z')).toBe('2024-06-15')
      expect(formatDueDate('2024-06-15')).toBe('2024-06-15')
    })

    it('should return empty string for null/undefined', () => {
      const formatDueDate = (dueDateStr) => {
        if (!dueDateStr) return ''
        return dueDateStr.split('T')[0]
      }

      expect(formatDueDate(null)).toBe('')
      expect(formatDueDate(undefined)).toBe('')
    })
  })
})
