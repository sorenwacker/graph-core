import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { escapeHtml } from './html.js'

// Configure marked for inline rendering with links handled by click handler
marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    link({ href, title, text }) {
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
      return `<a href="${escapeHtml(href)}"${titleAttr} class="external-link" rel="noopener">${text}</a>`
    },
  },
})

/**
 * Sanitize an HTML string for rendering via v-html / innerHTML.
 * Strips scripts, event handlers, and javascript: URLs while preserving the
 * markup produced by marked, KaTeX (incl. MathML) and mention/hashtag spans.
 *
 * @param {string} html - HTML string to sanitize
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(html) {
  if (!html) return ''
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
}

/**
 * Parse markdown text and return sanitized HTML safe for v-html.
 *
 * @param {string} text - Markdown source
 * @returns {string} Sanitized HTML
 */
export function renderMarkdown(text) {
  if (!text) return ''
  return sanitizeHtml(marked.parse(text))
}

/**
 * Render a markdown preview for graph node cards. The text is cut off at the
 * first empty line (blank-line paragraph break), so a multi-line first block
 * stays intact, and capped at maxLen characters so the node stays compact.
 *
 * @param {string} text - Markdown source
 * @param {number} [maxLen=500] - Maximum character length
 * @returns {string} Sanitized HTML
 */
export function renderMarkdownHtml(text, maxLen = 500) {
  if (!text) return ''
  // Keep the first non-empty block: skip any leading blank lines, then cut at
  // the first empty (blank, whitespace-only) line. Normalize CRLF first so a
  // single empty line is recognized regardless of line-ending style.
  const blocks = text.replace(/\r\n/g, '\n').split(/\n[ \t]*\n/)
  let firstBlock = (blocks.find(b => b.trim() !== '') || '').trim()

  // Also apply character limit
  if (firstBlock.length > maxLen) {
    firstBlock = firstBlock.substring(0, maxLen)
    // Don't cut in middle of a markdown link
    const lastOpen = firstBlock.lastIndexOf('['),
      lastClose = firstBlock.lastIndexOf(')')
    if (lastOpen > lastClose) {
      firstBlock = firstBlock.substring(0, lastOpen).trimEnd()
    }
  }

  return sanitizeHtml(marked.parse(firstBlock))
}

// Global click handler for external links - opens in system browser
export function handleExternalLinkClick(e) {
  const link = e.target.closest('a[href]')
  if (link) {
    const href = link.getAttribute('href')
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      e.preventDefault()
      e.stopPropagation()
      if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(href)
      } else {
        window.open(href, '_blank')
      }
    }
  }
}

export { marked }
