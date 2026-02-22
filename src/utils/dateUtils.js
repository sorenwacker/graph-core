/**
 * Calculate due date status relative to today.
 * @param {string|Date} dueDate - The due date to check
 * @returns {Object|null} Status object with type, days, and text, or null if no date
 */
export function getDueDateStatus(dueDate) {
  if (!dueDate) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)

  const diffTime = due - today
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays)
    return { type: 'overdue', days: absDays, text: `${absDays}d late` }
  } else if (diffDays === 0) {
    return { type: 'today', days: 0, text: 'Today' }
  } else if (diffDays === 1) {
    return { type: 'soon', days: 1, text: 'Tomorrow' }
  } else if (diffDays <= 3) {
    return { type: 'soon', days: diffDays, text: `${diffDays}d to go` }
  } else if (diffDays <= 7) {
    return { type: 'upcoming', days: diffDays, text: `${diffDays}d` }
  } else {
    return { type: 'future', days: diffDays, text: `${diffDays}d` }
  }
}

/**
 * Calculate countdown to start or end date for a node.
 * Returns info about days until start (if future) or days until end.
 * @param {Object} node - Node with start_date, due_date, end_date, completed fields
 * @returns {Object|null} Countdown object with type, days, and text, or null
 */
export function getDateCountdown(node) {
  if (!node || node.completed) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Check start date first - if in future, show "N days to start"
  if (node.start_date) {
    const start = new Date(node.start_date)
    start.setHours(0, 0, 0, 0)
    const diffDays = Math.round((start - today) / (1000 * 60 * 60 * 24))

    if (diffDays > 0) {
      return { type: 'to-start', days: diffDays, text: `${diffDays}d to start` }
    }
  }

  // Check due_date or end_date for "N days to end"
  const endDate = node.due_date || node.end_date
  if (endDate) {
    const end = new Date(endDate)
    end.setHours(0, 0, 0, 0)
    const diffDays = Math.round((end - today) / (1000 * 60 * 60 * 24))

    if (diffDays > 0) {
      return { type: 'to-end', days: diffDays, text: `${diffDays}d left` }
    } else if (diffDays === 0) {
      return { type: 'ends-today', days: 0, text: 'Ends today' }
    }
  }

  return null
}
