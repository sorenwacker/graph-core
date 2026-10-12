import { describe, it, expect } from 'vitest'
import { BOARD_COLUMNS, boardColumn, boardChanges } from '../utils/taskBoard.js'

/**
 * The Tasks board places a task by its completion and its stored mark, and
 * writes those back when a card is moved (docs/guides/views.md, "Board").
 * The start date plays no part: every task receives one at creation.
 */

const TODAY = '2026-10-12'

describe('boardColumn', () => {
  it('names four columns in order', () => {
    expect(BOARD_COLUMNS.map(c => c.id)).toEqual(['todo', 'in-progress', 'blocked', 'done'])
  })

  it('puts a completed task in Done whatever marks it still carries', () => {
    expect(boardColumn({ completed: 1, in_progress: 1 })).toBe('done')
    expect(boardColumn({ completed: 1, blocked: 1 })).toBe('done')
  })

  it('puts a marked task in its column', () => {
    expect(boardColumn({ completed: 0, in_progress: 1 })).toBe('in-progress')
    expect(boardColumn({ completed: 0, blocked: 1 })).toBe('blocked')
  })

  it('puts an unmarked task in To do whatever its start date', () => {
    expect(boardColumn({ completed: 0, in_progress: 0, blocked: 0, start_date: '2020-01-01' })).toBe('todo')
    expect(boardColumn({ completed: 0 })).toBe('todo')
  })
})

describe('boardChanges', () => {
  it('writes nothing for a drop on the column the task is already in', () => {
    expect(boardChanges({ completed: 0 }, 'todo', TODAY)).toBeNull()
    expect(boardChanges({ completed: 0, blocked: 1 }, 'blocked', TODAY)).toBeNull()
    expect(boardChanges({ completed: 1 }, 'done', TODAY)).toBeNull()
  })

  it('completes a task dropped on Done and clears its marks', () => {
    expect(boardChanges({ completed: 0, in_progress: 1 }, 'done', TODAY)).toEqual({
      completed: true,
      in_progress: false,
      blocked: false,
    })
  })

  it('marks a task dropped on In progress and starts it today, reopening it if it was done', () => {
    const started = { completed: false, in_progress: true, blocked: false, start_date: TODAY }
    expect(boardChanges({ completed: 0, start_date: '2020-01-01' }, 'in-progress', TODAY)).toEqual(started)
    expect(boardChanges({ completed: 1 }, 'in-progress', TODAY)).toEqual(started)
    expect(boardChanges({ completed: 0, blocked: 1 }, 'in-progress', TODAY)).toEqual(started)
  })

  it('marks a task dropped on Blocked and leaves its dates alone', () => {
    expect(boardChanges({ completed: 0, in_progress: 1, start_date: '2020-01-01' }, 'blocked', TODAY)).toEqual({
      completed: false,
      in_progress: false,
      blocked: true,
    })
  })

  it('clears the mark and reopens a task dropped on To do, leaving its dates alone', () => {
    expect(boardChanges({ completed: 0, in_progress: 1 }, 'todo', TODAY)).toEqual({
      completed: false,
      in_progress: false,
      blocked: false,
    })
    expect(boardChanges({ completed: 1 }, 'todo', TODAY)).toEqual({
      completed: false,
      in_progress: false,
      blocked: false,
    })
  })
})
