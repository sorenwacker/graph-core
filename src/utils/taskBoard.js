/**
 * The Tasks board: which column a task belongs in, and what to write when a
 * card is dropped on another column (docs/guides/views.md, "Board"). Done is
 * completion; In progress is a mark stored on the task that only the board
 * sets. Dates play no part: every task receives a start date at creation.
 */

export const BOARD_COLUMNS = [
  { id: 'todo', label: 'To do' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
]

/**
 * The column a task belongs in.
 * @param {Object} task - A task node
 * @returns {'todo'|'in-progress'|'done'}
 */
export function boardColumn(task) {
  if (task.completed) return 'done'
  return task.in_progress ? 'in-progress' : 'todo'
}

/** Today's date as YYYY-MM-DD in local time, the form dates are stored in. */
function todayLocalIso() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The fields to write so that the task lands in the given column, or null
 * when it is there already. A move into In progress also starts the task
 * today. Completing leaves the end date to the node update, which stamps it
 * as completing from anywhere else does.
 * @param {Object} task - A task node
 * @param {string} columnId - Target column
 * @param {string} [today] - YYYY-MM-DD, defaults to today in local time
 * @returns {Object|null}
 */
export function boardChanges(task, columnId, today = todayLocalIso()) {
  if (boardColumn(task) === columnId) return null
  const changes = { completed: columnId === 'done', in_progress: columnId === 'in-progress' }
  if (columnId === 'in-progress') changes.start_date = today
  return changes
}
