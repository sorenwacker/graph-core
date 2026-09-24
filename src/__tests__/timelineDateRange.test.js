import { describe, it, expect, vi, afterEach } from 'vitest'
import { calculateDateRange } from '../composables/useTimelineDates.js'

/**
 * The timeline's scrollable range (docs/guides/views.md, "Timeline View"). It
 * used to start exactly at the earliest date in view, or three months ago, so
 * the leftmost bar sat at pixel zero: nothing to scroll back to, and no way to
 * drag a start earlier than any existing date.
 */

const TODAY = '2026-09-22'

afterEach(() => vi.useRealTimers())

function withToday(date) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${date}T12:00:00`))
}

describe('calculateDateRange', () => {
  it('reaches back at least a year from today when the bars are recent', () => {
    withToday(TODAY)
    const range = calculateDateRange([{ displayDate: '2026-08-01', endDisplayDate: '2026-09-30' }])
    expect(range.start <= '2025-09-22').toBe(true)
    expect(range.end >= '2027-09-22').toBe(true)
  })

  it('extends a month beyond the earliest and latest dates when those lie further out', () => {
    withToday(TODAY)
    const range = calculateDateRange([{ displayDate: '2024-03-15', endDisplayDate: '2028-06-10' }])
    expect(range.start).toBe('2024-02-15')
    expect(range.end).toBe('2028-07-10')
  })

  it('counts the days across the whole range', () => {
    withToday(TODAY)
    const range = calculateDateRange([{ displayDate: '2026-09-01', endDisplayDate: '2026-09-02' }])
    const days = (new Date(range.end) - new Date(range.start)) / 86400000 + 1
    expect(range.days).toBe(Math.round(days))
  })

  it('is empty without bars', () => {
    expect(calculateDateRange([])).toEqual({ start: null, end: null, days: 0 })
  })
})
