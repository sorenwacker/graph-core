/**
 * Decode HTML entities in text.
 * Converts encoded characters like &#39; back to their original form.
 *
 * @param {string} text - Text with HTML entities
 * @returns {string} - Decoded text
 */
export function decodeHtmlEntities(text) {
  if (!text) return ''
  // Order matters: decode &amp; LAST to avoid double-unescaping (e.g. &amp;lt; -> &lt; -> <)
  return text
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/**
 * Escape text for safe interpolation into an HTML string or attribute value.
 * Use this for any user-controlled value placed into raw HTML templates
 * (e.g. tooltip/label strings) instead of trusting the value verbatim.
 *
 * @param {string} text - Untrusted text
 * @returns {string} - Text with &, <, >, ", ' replaced by entities
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Decode HTML using DOM API (handles all entities automatically)
 * Browser-only implementation.
 *
 * @param {string} html - HTML string with entities
 * @returns {string} - Decoded text
 */
export function decodeHtml(html) {
  if (!html) return ''
  const txt = document.createElement('textarea')
  txt.innerHTML = html
  return txt.value
}
