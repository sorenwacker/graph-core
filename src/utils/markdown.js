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
 * Render a length-bounded markdown preview, e.g. for graph node cards.
 *
 * The source is truncated to `maxLen` characters before parsing so the
 * preview stays small, but line breaks are preserved so multi-line
 * constructs (lists, headings, tables) render as markdown rather than being
 * collapsed to a single line.
 *
 * @param {string} text - Markdown source
 * @param {number} [maxLen=500] - Maximum number of source characters to render
 * @returns {string} Sanitized HTML
 */
export function renderMarkdownHtml(text, maxLen = 500) {
  if (!text) return ''
  let snippet = text
  if (snippet.length > maxLen) {
    snippet = snippet.substring(0, maxLen)
    // Avoid cutting in the middle of a markdown link, which would leave a
    // dangling '[label](' that renders as literal text.
    const lastOpen = snippet.lastIndexOf('[')
    const lastClose = snippet.lastIndexOf(')')
    if (lastOpen > lastClose) {
      snippet = snippet.substring(0, lastOpen).trimEnd()
    }
  }
  return sanitizeHtml(marked.parse(snippet))
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
