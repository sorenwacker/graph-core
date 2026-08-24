import { getImportanceLabel } from './constants.js'
import { escapeHtml } from './html.js'
import { renderMarkdown } from './markdown.js'
import { formatDate } from './formatting.js'

// Keywords that indicate potentially sensitive content in notes
const SENSITIVE_KEYWORDS = ['password', 'secret', 'api_key', 'credential']

// Layout constants for tooltip positioning
const TOOLTIP_MARGIN = 20
// Fallback top offset (used only when the content area can't be measured);
// clears the header navbar (~87px).
const TOOLTIP_TOP_OFFSET = 96

/**
 * Build tooltip HTML for a node
 * @param {Object} node - The node object
 * @param {Object} options - Options for tooltip building
 * @param {boolean} options.showCheckbox - Whether to show the checkbox
 * @param {boolean} options.hideSensitive - Whether to hide sensitive content
 * @returns {string} HTML string for tooltip content
 */
export function buildTooltipHTML(node, options = {}) {
  const { showCheckbox = true, hideSensitive = false } = options

  if (!node) return ''

  const childCount = node.children?.length || 0
  const isCompleted = node.completed
  // Notes explicitly flagged sensitive are always masked in the hover info.
  // Keyword-detected notes are masked only when the Hide Sensitive setting is on.
  const explicitlySensitive = !!node.notes_sensitive
  const keywordSensitive = SENSITIVE_KEYWORDS.some(kw => node.notes?.toLowerCase().includes(kw))

  let tooltip = `<div class="tt-header">`
  if (showCheckbox && node.type === 'task') {
    tooltip += `<label class="tt-checkbox"><input type="checkbox" data-node-id="${node.id}" ${isCompleted ? 'checked' : ''} /></label>`
  }
  tooltip += `<div class="tt-title">${escapeHtml(node.title)}</div>`
  tooltip += `</div>`

  tooltip += `<div class="tt-meta">`
  tooltip += `<span class="tt-type ${escapeHtml(node.type)}">${escapeHtml(node.type)}</span>`
  if (childCount > 0) tooltip += `<span class="tt-children">${childCount} items</span>`
  if (node.importance) tooltip += `<span class="tt-priority">${getImportanceLabel(node.importance)}</span>`
  tooltip += `</div>`

  if (node.due_date || node.start_date || node.end_date) {
    tooltip += `<div class="tt-dates">`
    if (node.due_date) tooltip += `<span class="tt-due">Due: ${formatDate(node.due_date)}</span>`
    if (node.start_date) tooltip += `<span class="tt-start">Start: ${formatDate(node.start_date)}</span>`
    if (node.end_date) tooltip += `<span class="tt-end">End: ${formatDate(node.end_date)}</span>`
    tooltip += `</div>`
  }

  if (node.notes) {
    if (explicitlySensitive || (keywordSensitive && hideSensitive)) {
      tooltip += `<div class="tt-notes">[Sensitive content hidden]</div>`
    } else {
      const notesHtml = renderMarkdown(node.notes)
      tooltip += `<div class="tt-notes markdown-body">${notesHtml}</div>`
    }
  }

  return tooltip
}

/**
 * Get or create the dynamic tooltip anchor element
 * Positions tooltip on opposite side of cursor
 * @param {MouseEvent} event - Mouse event with cursor position
 */
let dynamicAnchor = null
export function getFixedTooltipReference(event) {
  if (!dynamicAnchor) {
    dynamicAnchor = document.createElement('div')
    dynamicAnchor.id = 'tooltip-anchor'
    dynamicAnchor.style.cssText = `
      position: fixed;
      width: 1px;
      height: 1px;
      pointer-events: none;
      z-index: -1;
    `
    document.body.appendChild(dynamicAnchor)
  }

  // Position on opposite horizontal side of cursor, always at top
  const viewportWidth = window.innerWidth
  const cursorX = event?.clientX ?? viewportWidth / 2

  // Determine which side to show tooltip (opposite of cursor)
  const showOnRight = cursorX < viewportWidth / 2

  // Anchor just below the top chrome — header navbar, add-node bar, and the
  // breadcrumb/path bar (which also holds the graph control buttons) — so the
  // tooltip renders inside the view area, not over any of those bars.
  const contentEl = document.querySelector('.content-body')
  const topOffset = contentEl ? Math.round(contentEl.getBoundingClientRect().top) + 8 : TOOLTIP_TOP_OFFSET

  // Position anchor at top, on opposite side
  dynamicAnchor.style.top = `${topOffset}px`
  // Must explicitly clear the opposite side with 'auto' to override previous positioning
  dynamicAnchor.style.left = showOnRight ? 'auto' : `${TOOLTIP_MARGIN}px`
  dynamicAnchor.style.right = showOnRight ? `${TOOLTIP_MARGIN}px` : 'auto'

  return dynamicAnchor
}

/**
 * Get placement based on cursor position
 * @param {MouseEvent} event - Mouse event with cursor position
 */
export function getTooltipPlacement(event) {
  const viewportWidth = window.innerWidth
  const cursorX = event?.clientX ?? viewportWidth / 2
  const showOnRight = cursorX < viewportWidth / 2
  return showOnRight ? 'bottom-start' : 'bottom-end'
}

/**
 * Default tippy options for consistent tooltips
 * Uses fixed position at top-right corner of viewport
 */
export const tooltipOptions = {
  // Below the settings overlay (z-index 1100 in SettingsPanel.css): a tooltip
  // must never paint over an open panel.
  zIndex: 1000,
  allowHTML: true,
  interactive: true,
  interactiveBorder: 20,
  duration: [200, 150],
  placement: 'bottom-end',
  theme: 'graph-tooltip',
  maxWidth: 'none',
  trigger: 'manual',
  appendTo: () => document.body,
}
