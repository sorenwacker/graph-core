import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { getImportanceLabel } from './constants.js'

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true
})

// Render markdown safely
function renderMarkdown(text) {
  if (!text) return ''
  const html = marked.parse(text)
  return DOMPurify.sanitize(html)
}

// Format date for display
function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

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
  // Check if node is marked sensitive or contains sensitive keywords
  const isSensitive = node.notes_sensitive ||
                      node.notes?.toLowerCase().includes('password') ||
                      node.notes?.toLowerCase().includes('secret') ||
                      node.notes?.toLowerCase().includes('api_key') ||
                      node.notes?.toLowerCase().includes('credential')

  let tooltip = `<div class="tt-header">`
  if (showCheckbox && node.type === 'task') {
    tooltip += `<label class="tt-checkbox"><input type="checkbox" data-node-id="${node.id}" ${isCompleted ? 'checked' : ''} /></label>`
  }
  tooltip += `<div class="tt-title">${node.title}</div>`
  tooltip += `</div>`

  tooltip += `<div class="tt-meta">`
  tooltip += `<span class="tt-type ${node.type}">${node.type}</span>`
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
    if (isSensitive && hideSensitive) {
      tooltip += `<div class="tt-notes">[Sensitive content hidden]</div>`
    } else {
      const notesHtml = renderMarkdown(node.notes)
      tooltip += `<div class="tt-notes markdown-body">${notesHtml}</div>`
    }
  }

  return tooltip
}

/**
 * Get or create the fixed tooltip anchor element
 * Places tooltip at top-right corner of viewport
 */
let fixedAnchor = null
export function getFixedTooltipReference() {
  if (!fixedAnchor) {
    fixedAnchor = document.createElement('div')
    fixedAnchor.id = 'tooltip-anchor'
    fixedAnchor.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      width: 1px;
      height: 1px;
      pointer-events: none;
      z-index: -1;
    `
    document.body.appendChild(fixedAnchor)
  }
  return fixedAnchor
}

/**
 * Default tippy options for consistent tooltips
 * Uses fixed position at top-right corner of viewport
 */
export const tooltipOptions = {
  allowHTML: true,
  interactive: true,
  interactiveBorder: 20,
  duration: [200, 150],
  placement: 'bottom-end',
  theme: 'graph-tooltip',
  maxWidth: 400,
  trigger: 'manual',
  appendTo: () => document.body
}
