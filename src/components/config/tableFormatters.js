/**
 * Formatting and utility functions for TableView.
 * Contains cell renderers, formatters, and display logic.
 */

import { decodeHtmlEntities } from '../../utils/html.js'

/**
 * Format a date string for display.
 * Extracts just the date portion from ISO format.
 */
export function formatDate(dateStr) {
  if (!dateStr) return ''
  return dateStr.split('T')[0]
}

/**
 * Truncate notes text for preview display.
 * Removes markdown formatting and limits to 50 characters.
 */
export function truncateNotes(notes) {
  if (!notes) return ''
  let text = notes.replace(/[#*_`[\]]/g, '').trim()
  text = decodeHtmlEntities(text)
  return text.length > 50 ? text.substring(0, 50) + '...' : text
}

/**
 * Check if a due date is overdue.
 */
export function isOverdue(dateStr) {
  if (!dateStr) return false
  const due = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

/**
 * Get badge style for person nodes.
 * CSS variables handle all type colors including person.
 */
export function getBadgeStyle() {
  return {}
}

/**
 * Get indentation padding based on node depth.
 */
export function getIndentPadding(node) {
  const depth = node.depth || 0
  const basePadding = 8
  const indentPerLevel = 24
  return `${basePadding + depth * indentPerLevel}px`
}

/**
 * Get tree prefix for visual hierarchy using Unicode box-drawing characters.
 * Uses parentIsLastStack to determine correct vertical lines.
 */
export function getTreePrefix(node, isLast, parentIsLastStack) {
  const depth = node.depth || 0
  if (depth === 0) return ''

  let prefix = ''
  // Add continuation lines for each ancestor level
  for (let i = 0; i < parentIsLastStack.length; i++) {
    prefix += parentIsLastStack[i] ? '  ' : '\u2502 ' // | character
  }
  // Add branch and horizontal line
  prefix += isLast ? '\u2514\u2500' : '\u251c\u2500' // corner or T-junction
  return prefix
}

/**
 * Get CSS class based on node depth for row styling.
 */
export function getDepthRowClass(node) {
  const depth = node.depth || 0
  if (depth === 0) return 'depth-row-0'
  if (depth === 1) return 'depth-row-1'
  if (depth === 2) return 'depth-row-2'
  if (depth === 3) return 'depth-row-3'
  return 'depth-row-deep'
}

/**
 * Get row style based on node color.
 * Applies gradient background for colored nodes.
 */
export function getRowStyle(node, colorMap) {
  const color = colorMap[node.id] || node.color
  if (color && color !== '#0f4c75') {
    return { background: `linear-gradient(90deg, ${color}55 0%, transparent 50%)` }
  }
  return {}
}
