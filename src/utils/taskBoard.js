/**
 * The Tasks board: which column a task belongs in, and what to write when a
 * card is dropped on another column. Columns are derived from fields a task
 * already has (docs/guides/views.md, "Board"), so the board keeps no state.
 */

export const BOARD_COLUMNS = [
  { id: 'todo', label: 'To do' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
]

/** Today's date as YYYY-MM-DD in local time, the form dates are stored in. */
function todayLocalIso() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Whether the task's start date is today or earlier. */
function started(task, today) {
  return Boolean(task.start_date) && String(task.start_date).slice(0, 10) <= today
}

/**
 * The column a task belongs in.
 * @param {Object} task - A task node
 * @param {string} [today] - YYYY-MM-DD, defaults to today in local time
 * @returns {'todo'|'in-progress'|'done'}
 */
export function boardColumn(task, today = todayLocalIso()) {
  if (task.completed) return 'done'
  return started(task, today) ? 'in-progress' : 'todo'
}

/**
 * The fields to write so that the task lands in the given column, or null
 * when it is there already. Completing leaves the end date to the node
 * update, which stamps it as completing from anywhere else does.
 * @param {Object} task - A task node
 * @param {string} columnId - Target column
 * @param {string} [today] - YYYY-MM-DD, defaults to today in local time
 * @returns {Object|null}
 */
export function boardChanges(task, columnId, today = todayLocalIso()) {
  if (boardColumn(task, today) === columnId) return null
  if (columnId === 'done') return { completed: true }
  if (columnId === 'in-progress')
    return started(task, today) ? { completed: false } : { completed: false, start_date: today }
  return { completed: false, start_date: null }
}
