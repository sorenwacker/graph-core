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
 * Format a date for display
 * @param {string|Date} date - The date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
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
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(node.due_date)
  due.setHours(0, 0, 0, 0)
  const daysUntilDue = Math.ceil((due - today) / (1000 * 60 * 60 * 24))
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= 3) return 'soon'
  return null
}
