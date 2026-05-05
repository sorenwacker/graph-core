/**
 * Composable for timeline date utilities.
 * Handles date parsing, formatting, and range calculations.
 */

/**
 * Parse date string as local time (not UTC) to avoid timezone shift issues.
 * @param {string} dateStr - Date string in YYYY-MM-DD or ISO format
 * @returns {Date|null} Parsed date or null if invalid
 */
export function parseLocalDate(dateStr) {
  if (!dateStr) return null
  // Handle both "2024-04-07" and "2024-04-07T..." formats
  const [datePart] = dateStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Format a Date object as YYYY-MM-DD in local time (not UTC).
 * @param {Date} date - Date object to format
 * @returns {string} Formatted date string
 */
export function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get today's date as a formatted string.
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export function getTodayString() {
  return formatLocalDate(new Date())
}

/**
 * Calculate date range from a list of nodes with dates.
 * Extends from 3 months ago to 1 year in the future.
 * @param {Array} nodes - Array of nodes with displayDate and endDisplayDate
 * @returns {Object} Object with start, end, and days count
 */
export function calculateDateRange(nodes) {
  if (nodes.length === 0) return { start: null, end: null, days: 0 }

  const dates = nodes.flatMap(n => [n.displayDate, n.endDisplayDate].filter(Boolean))
  const minDate = dates.reduce((a, b) => (a < b ? a : b))
  const maxDate = dates.reduce((a, b) => (a > b ? a : b))

  // Start from earliest date or 3 months ago, whichever is earlier
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const startDate = parseLocalDate(minDate) < threeMonthsAgo ? minDate : formatLocalDate(threeMonthsAgo)

  // End at latest date or 1 year from now, whichever is later
  const oneYearFromNow = new Date()
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)
  const endDate = parseLocalDate(maxDate) > oneYearFromNow ? maxDate : formatLocalDate(oneYearFromNow)

  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

  return { start: startDate, end: endDate, days: Math.max(days, 1) }
}

/**
 * Generate year markers within a date range.
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @param {Function} getDatePosition - Function to convert date to pixel position
 * @returns {Array} Array of year marker objects with label and position
 */
export function generateYearMarkers(startDate, endDate, getDatePosition) {
  if (!startDate) return []
  const result = []
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)

  let current = new Date(start.getFullYear(), 0, 1)
  if (current < start) current.setFullYear(current.getFullYear() + 1)

  while (current <= end) {
    result.push({
      label: current.getFullYear().toString(),
      position: getDatePosition(formatLocalDate(current)),
    })
    current.setFullYear(current.getFullYear() + 1)
  }
  return result
}

/**
 * Generate month markers within a date range.
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @param {Function} getDatePosition - Function to convert date to pixel position
 * @returns {Array} Array of month marker objects with label and position
 */
export function generateMonthMarkers(startDate, endDate, getDatePosition) {
  if (!startDate) return []
  const result = []
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)

  let current = new Date(start.getFullYear(), start.getMonth(), 1)
  while (current <= end) {
    const position = getDatePosition(formatLocalDate(current))
    result.push({
      label: current.toLocaleDateString('en-US', { month: 'short' }),
      position,
    })
    current.setMonth(current.getMonth() + 1)
  }

  return result
}

/**
 * Generate week markers (Mondays) within a date range.
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @param {Function} getDatePosition - Function to convert date to pixel position
 * @param {number} minZoom - Minimum zoom level to show week markers
 * @param {number} currentZoom - Current zoom level
 * @returns {Array} Array of week marker objects with position
 */
export function generateWeekMarkers(startDate, endDate, getDatePosition, minZoom, currentZoom) {
  if (!startDate || currentZoom < minZoom) return []
  const result = []
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)

  // Find first Monday
  let current = new Date(start)
  const day = current.getDay()
  const daysUntilMonday = day === 0 ? 1 : (8 - day) % 7
  current.setDate(current.getDate() + daysUntilMonday)

  while (current <= end) {
    result.push({
      position: getDatePosition(formatLocalDate(current)),
    })
    current.setDate(current.getDate() + 7)
  }
  return result
}

/**
 * Generate day markers within a date range.
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @param {Function} getDatePosition - Function to convert date to pixel position
 * @param {number} minZoom - Minimum zoom level to show day markers
 * @param {number} currentZoom - Current zoom level
 * @returns {Array} Array of day marker objects with label, position, isWeekend, isFirst
 */
export function generateDayMarkers(startDate, endDate, getDatePosition, minZoom, currentZoom) {
  if (!startDate || currentZoom < minZoom) return []
  const result = []
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)

  let current = new Date(start)
  while (current <= end) {
    const dayOfWeek = current.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isFirst = current.getDate() === 1
    result.push({
      label: current.getDate().toString(),
      position: getDatePosition(formatLocalDate(current)),
      isWeekend,
      isFirst,
    })
    current.setDate(current.getDate() + 1)
  }
  return result
}

/**
 * Generate weekend ranges for shading.
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @param {Function} getDatePosition - Function to convert date to pixel position
 * @param {number} zoomLevel - Current zoom level (pixels per day)
 * @param {number} minZoom - Minimum zoom level to show weekends
 * @returns {Array} Array of weekend objects with position and width
 */
export function generateWeekendRanges(startDate, endDate, getDatePosition, zoomLevel, minZoom) {
  if (!startDate || zoomLevel < minZoom) return []
  const result = []
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)

  let current = new Date(start)
  // Find first Saturday
  while (current.getDay() !== 6 && current <= end) {
    current.setDate(current.getDate() + 1)
  }

  while (current <= end) {
    const saturdayPos = getDatePosition(formatLocalDate(current))
    result.push({
      position: saturdayPos,
      width: zoomLevel * 2, // 2 days (Sat + Sun)
    })
    current.setDate(current.getDate() + 7)
  }
  return result
}

/**
 * Calculate due date urgency (0-1 scale, where 1 is overdue).
 * @param {string} dueDate - Due date string
 * @param {boolean} completed - Whether the item is completed
 * @returns {number|null} Urgency value or null if not applicable
 */
export function calculateDueUrgency(dueDate, completed) {
  if (!dueDate || completed) return null

  const dueDateObj = new Date(dueDate)
  const todayDate = new Date(getTodayString())
  const daysUntilDue = Math.ceil((dueDateObj - todayDate) / (1000 * 60 * 60 * 24))

  // Urgency: 1.0 = overdue, 0.8 = due today, scales down over 14 days
  if (daysUntilDue <= 0) return 1.0
  if (daysUntilDue <= 14) return 1 - daysUntilDue / 14
  return 0
}

/**
 * Get color for due date indicator based on urgency.
 * @param {number|null} urgency - Urgency value (0-1)
 * @returns {string} CSS color value
 */
export function getDueColor(urgency) {
  if (urgency === null || urgency === undefined) return 'transparent'
  // Interpolate from white/yellow to red based on urgency
  const r = 255
  const g = Math.round(255 * (1 - urgency))
  const b = Math.round(255 * (1 - urgency))
  return `rgb(${r}, ${g}, ${b})`
}
