/**
 * Shared formatting utilities
 */

/**
 * Get initials from a name (e.g., "John Doe" -> "JD")
 * @param {string} name - The name to get initials from
 * @returns {string} The initials (1-2 characters)
 */
export function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/**
 * Parse a date value into a Date in LOCAL time.
 * Date-only strings (YYYY-MM-DD) are parsed as local dates, not UTC midnight,
 * so they always fall on the intended calendar day regardless of timezone.
 * @param {string|Date} value - The date value to parse
 * @returns {Date|null} Parsed date, or null if missing/invalid
 */
export function parseDateLocal(value) {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  const str = String(value).trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str)
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Difference between a date and today in LOCAL calendar days.
 * 0 = today, negative = past, positive = future.
 * @param {string|Date} value - The date value
 * @returns {number|null} Day difference, or null if missing/invalid
 */
export function daysFromToday(value) {
  const d = parseDateLocal(value)
  if (!d) return null
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((startOfDate - startOfToday) / 86400000)
}

/**
 * Check if a due date is overdue (before today, date-based in local time).
 * @param {string|Date} value - The due date
 * @returns {boolean} True if the date is before today
 */
export function isOverdue(value) {
  const days = daysFromToday(value)
  return days !== null && days < 0
}

/**
 * Check if a due date is today or within the next 3 days (local time).
 * @param {string|Date} value - The due date
 * @returns {boolean} True if the date is between today and 3 days from now
 */
export function isDueSoon(value) {
  const days = daysFromToday(value)
  return days !== null && days >= 0 && days <= 3
}

/**
 * Format a date for display.
 * Shared implementation for all formatDate call sites.
 * @param {string|Date} date - The date to format
 * @param {Object} [options]
 * @param {string} [options.empty=''] - Value returned for missing dates
 * @param {'locale'|'iso'} [options.style='locale'] - 'locale' = "Jul 30, 2026", 'iso' = "2026-07-30"
 * @returns {string} Formatted date string
 */
export function formatDate(date, { empty = '', style = 'locale' } = {}) {
  if (!date) return empty
  if (style === 'iso') {
    if (typeof date === 'string') return date.split('T')[0]
    const d = parseDateLocal(date)
    if (!d) return empty
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  const d = parseDateLocal(date)
  if (!d) return empty
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Get contrasting text color (white or black) based on background luminance
 * @param {string} hexColor - The background color in hex format
 * @returns {string} '#000000' or '#ffffff' for optimal contrast
 */
export function getContrastColor(hexColor) {
  if (!hexColor) return '#ffffff'
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.4 ? '#000000' : '#ffffff'
}

/**
 * Check due date status for a node
 * @param {Object} node - Node with due_date and completed properties
 * @returns {string|null} 'overdue', 'soon' (within 3 days), or null
 */
export function getDueStatus(node) {
  if (!node?.due_date || node.completed) return null
  const daysUntilDue = daysFromToday(node.due_date)
  if (daysUntilDue === null) return null
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= 3) return 'soon'
  return null
}
