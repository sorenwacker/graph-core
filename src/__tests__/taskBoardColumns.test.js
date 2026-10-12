import { describe, it, expect } from 'vitest'
import { BOARD_COLUMNS, boardColumn, boardChanges } from '../utils/taskBoard.js'

const TODAY = '2026-10-12'

/**
 * The Tasks board places a task by its completion and its in-progress mark,
 * and writes those back when a card is moved (docs/guides/views.md, "Board").
 * The start date plays no part: every task receives one at creation.
 */

describe('boardColumn', () => {
  it('names three columns in order', () => {
    expect(BOARD_COLUMNS.map(c => c.id)).toEqual(['todo', 'in-progress', 'done'])
  })

  it('puts a completed task in Done even while it is still marked in progress', () => {
    expect(boardColumn({ completed: 1, in_progress: 1 })).toBe('done')
    expect(boardColumn({ completed: true })).toBe('done')
  })

  it('puts a marked task in In progress', () => {
    expect(boardColumn({ completed: 0, in_progress: 1 })).toBe('in-progress')
  })

  it('puts an unmarked task in To do whatever its start date', () => {
    expect(boardColumn({ completed: 0, in_progress: 0, start_date: '2020-01-01' })).toBe('todo')
    expect(boardColumn({ completed: 0 })).toBe('todo')
  })
})

describe('boardChanges', () => {
  it('writes nothing for a drop on the column the task is already in', () => {
    expect(boardChanges({ completed: 0 }, 'todo', TODAY)).toBeNull()
    expect(boardChanges({ completed: 0, in_progress: 1 }, 'in-progress', TODAY)).toBeNull()
    expect(boardChanges({ completed: 1 }, 'done', TODAY)).toBeNull()
  })

  it('completes a task dropped on Done and clears its mark', () => {
    expect(boardChanges({ completed: 0, in_progress: 1 }, 'done', TODAY)).toEqual({
      completed: true,
      in_progress: false,
    })
  })

  it('marks a task dropped on In progress and starts it today, reopening it if it was done', () => {
    const started = { completed: false, in_progress: true, start_date: TODAY }
    expect(boardChanges({ completed: 0, start_date: '2020-01-01' }, 'in-progress', TODAY)).toEqual(started)
    expect(boardChanges({ completed: 1 }, 'in-progress', TODAY)).toEqual(started)
  })

  it('clears the mark and reopens a task dropped on To do, leaving its dates alone', () => {
    expect(boardChanges({ completed: 0, in_progress: 1 }, 'todo', TODAY)).toEqual({
      completed: false,
      in_progress: false,
    })
    expect(boardChanges({ completed: 1 }, 'todo', TODAY)).toEqual({ completed: false, in_progress: false })
  })
})
