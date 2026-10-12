import { describe, it, expect } from 'vitest'
import { BOARD_COLUMNS, boardColumn, boardChanges } from '../utils/taskBoard.js'

/**
 * The Tasks board derives a task's column from fields it already has and
 * writes those fields back when a card is moved (docs/guides/views.md,
 * "Board").
 */

const TODAY = '2026-10-12'

describe('boardColumn', () => {
  it('names three columns in order', () => {
    expect(BOARD_COLUMNS.map(c => c.id)).toEqual(['todo', 'in-progress', 'done'])
  })

  it('puts a completed task in Done whatever its dates', () => {
    expect(boardColumn({ completed: 1, start_date: '2020-01-01' }, TODAY)).toBe('done')
    expect(boardColumn({ completed: true }, TODAY)).toBe('done')
  })

  it('puts an unstarted task in To do', () => {
    expect(boardColumn({ completed: 0 }, TODAY)).toBe('todo')
    expect(boardColumn({ completed: 0, start_date: null }, TODAY)).toBe('todo')
  })

  it('treats a start date in the future as not started', () => {
    expect(boardColumn({ completed: 0, start_date: '2026-10-13' }, TODAY)).toBe('todo')
  })

  it('puts a task started today or earlier in In progress', () => {
    expect(boardColumn({ completed: 0, start_date: '2026-10-12' }, TODAY)).toBe('in-progress')
    expect(boardColumn({ completed: 0, start_date: '2026-09-01' }, TODAY)).toBe('in-progress')
  })
})

describe('boardChanges', () => {
  it('writes nothing for a drop on the column the task is already in', () => {
    expect(boardChanges({ completed: 0 }, 'todo', TODAY)).toBeNull()
    expect(boardChanges({ completed: 1 }, 'done', TODAY)).toBeNull()
  })

  it('completes a task dropped on Done', () => {
    expect(boardChanges({ completed: 0, start_date: '2026-09-01' }, 'done', TODAY)).toEqual({ completed: true })
  })

  it('starts a task today when dropped on In progress without a start date', () => {
    expect(boardChanges({ completed: 0 }, 'in-progress', TODAY)).toEqual({ completed: false, start_date: TODAY })
  })

  it('pulls a future start date back to today when dropped on In progress', () => {
    expect(boardChanges({ completed: 0, start_date: '2026-11-01' }, 'in-progress', TODAY)).toEqual({
      completed: false,
      start_date: TODAY,
    })
  })

  it('reopens a completed task dropped on In progress and keeps its start date', () => {
    expect(boardChanges({ completed: 1, start_date: '2026-09-01' }, 'in-progress', TODAY)).toEqual({ completed: false })
  })

  it('clears the start date and reopens a task dropped on To do', () => {
    expect(boardChanges({ completed: 0, start_date: '2026-09-01' }, 'todo', TODAY)).toEqual({
      completed: false,
      start_date: null,
    })
    expect(boardChanges({ completed: 1 }, 'todo', TODAY)).toEqual({ completed: false, start_date: null })
  })
})
