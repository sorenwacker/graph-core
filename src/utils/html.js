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
