import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useTaskDisplayUtils } from '../composables/useTaskFiltering.js'
import {
  formatDate as sharedFormatDate,
  parseDateLocal,
  daysFromToday,
  isOverdue as sharedIsOverdue,
  getDueStatus,
} from '../utils/formatting.js'
import { formatDate as tableFormatDate, isOverdue as tableIsOverdue } from '../components/config/tableFormatters.js'

/** Build a YYYY-MM-DD string from a LOCAL date (no UTC conversion). */
function localDateStr(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

describe('Tasks API', () => {
  describe('webApi.getTasks', () => {
    let api, originalFetch

    beforeEach(async () => {
      vi.resetModules()
      originalFetch = global.fetch
      delete window.electronAPI

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
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
      expect(fetch).toHaveBeenCalledWith('/api/tasks?dueDateFrom=2024-01-01&dueDateTo=2024-12-31', expect.any(Object))
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
        parentId: 10,
      })
      expect(fetch).toHaveBeenCalledWith(
        '/api/tasks?workspaceId=work&completed=false&importance=3&parentId=10',
        expect.any(Object)
      )
    })
  })
})

describe('Task Helper Functions (production implementations)', () => {
  const { isOverdue, isDueSoon, formatDate, formatRelativeDate } = useTaskDisplayUtils()

  describe('isOverdue', () => {
    it('should return true for past due dates', () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 1)
      expect(isOverdue(localDateStr(pastDate))).toBe(true)
    })

    it('should return false for future due dates', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7)
      expect(isOverdue(localDateStr(futureDate))).toBe(false)
    })

    it('should return false for today', () => {
      expect(isOverdue(localDateStr(new Date()))).toBe(false)
    })

    it('should return false for null/undefined due date', () => {
      expect(isOverdue(null)).toBe(false)
      expect(isOverdue(undefined)).toBe(false)
    })
  })

  describe('isDueSoon', () => {
    it('should return true for today and within 3 days', () => {
      const inTwoDays = new Date()
      inTwoDays.setDate(inTwoDays.getDate() + 2)
      expect(isDueSoon(localDateStr(new Date()))).toBe(true)
      expect(isDueSoon(localDateStr(inTwoDays))).toBe(true)
    })

    it('should return false for past dates, far future, and missing dates', () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const nextWeek = new Date()
      nextWeek.setDate(nextWeek.getDate() + 7)
      expect(isDueSoon(localDateStr(yesterday))).toBe(false)
      expect(isDueSoon(localDateStr(nextWeek))).toBe(false)
      expect(isDueSoon(null)).toBe(false)
    })
  })

  describe('formatDate (task display)', () => {
    it('should format date as YYYY-MM-DD', () => {
      expect(formatDate('2024-06-15T00:00:00Z')).toBe('2024-06-15')
      expect(formatDate('2024-06-15')).toBe('2024-06-15')
    })

    it('should return "-" for null/undefined', () => {
      expect(formatDate(null)).toBe('-')
      expect(formatDate(undefined)).toBe('-')
    })
  })

  describe('local date parsing regression (date-only strings west of UTC)', () => {
    let originalTZ

    beforeEach(() => {
      originalTZ = process.env.TZ
      // UTC-7 in July: UTC midnight of a date-only string is the PREVIOUS local day
      process.env.TZ = 'America/Los_Angeles'
      vi.useFakeTimers()
      // Local time: Jul 15 2026, 08:00 in Los Angeles
      vi.setSystemTime(new Date(2026, 6, 15, 8, 0, 0))
    })

    afterEach(() => {
      vi.useRealTimers()
      if (originalTZ === undefined) delete process.env.TZ
      else process.env.TZ = originalTZ
    })

    it('a task due today (date-only string) is not overdue', () => {
      expect(isOverdue('2026-07-15')).toBe(false)
      expect(tableIsOverdue('2026-07-15')).toBe(false)
      expect(sharedIsOverdue('2026-07-15')).toBe(false)
    })

    it('formatRelativeDate shows Today (not Yesterday) for a task due today', () => {
      expect(formatRelativeDate('2026-07-15')).toBe('Today')
    })

    it('formatRelativeDate handles yesterday/tomorrow/near-future/far-future', () => {
      expect(formatRelativeDate('2026-07-14')).toBe('Yesterday')
      expect(formatRelativeDate('2026-07-16')).toBe('Tomorrow')
      expect(formatRelativeDate('2026-07-20')).toBe('in 5d')
      expect(formatRelativeDate('2026-07-10')).toBe('5d ago')
      expect(formatRelativeDate('2026-08-30')).toBe('2026-08-30')
      expect(formatRelativeDate(null)).toBe('-')
    })

    it('parseDateLocal parses date-only strings as local dates', () => {
      const d = parseDateLocal('2026-07-15')
      expect(d.getFullYear()).toBe(2026)
      expect(d.getMonth()).toBe(6)
      expect(d.getDate()).toBe(15)
      expect(d.getHours()).toBe(0)
      expect(parseDateLocal(null)).toBe(null)
      expect(parseDateLocal('not-a-date')).toBe(null)
    })

    it('daysFromToday is date-based, not time-based', () => {
      expect(daysFromToday('2026-07-15')).toBe(0)
      expect(daysFromToday('2026-07-14')).toBe(-1)
      expect(daysFromToday('2026-07-16')).toBe(1)
      // Datetime later today is still "today", not tomorrow/yesterday
      expect(daysFromToday('2026-07-15T23:00:00')).toBe(0)
      expect(daysFromToday(null)).toBe(null)
    })

    it('getDueStatus marks a task due today as soon, not overdue', () => {
      expect(getDueStatus({ due_date: '2026-07-15', completed: false })).toBe('soon')
      expect(getDueStatus({ due_date: '2026-07-14', completed: false })).toBe('overdue')
      expect(getDueStatus({ due_date: '2026-07-25', completed: false })).toBe(null)
      expect(getDueStatus({ due_date: '2026-07-14', completed: true })).toBe(null)
    })

    it('shared locale formatDate shows the intended calendar day', () => {
      expect(sharedFormatDate('2026-07-15')).toBe('Jul 15, 2026')
    })
  })
})

describe('formatDate consolidation', () => {
  it('table formatters and task display agree on empty-value placeholder', () => {
    const { formatDate } = useTaskDisplayUtils()
    expect(tableFormatDate(null)).toBe('-')
    expect(tableFormatDate('')).toBe('-')
    expect(formatDate(null)).toBe('-')
  })

  it('table formatter extracts the date portion of ISO strings', () => {
    expect(tableFormatDate('2024-06-15T10:30:00Z')).toBe('2024-06-15')
    expect(tableFormatDate('2024-06-15')).toBe('2024-06-15')
  })

  it('shared formatDate supports iso and locale styles with explicit empty value', () => {
    expect(sharedFormatDate('2024-06-15T10:30:00Z', { style: 'iso' })).toBe('2024-06-15')
    expect(sharedFormatDate(null)).toBe('')
    expect(sharedFormatDate(null, { empty: '-' })).toBe('-')
    expect(sharedFormatDate(new Date(2024, 5, 15), { style: 'iso' })).toBe('2024-06-15')
  })
})
