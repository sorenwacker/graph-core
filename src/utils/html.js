/**
 * Decode HTML entities in text.
 * Converts encoded characters like &#39; back to their original form.
 *
 * @param {string} text - Text with HTML entities
 * @returns {string} - Decoded text
 */
export function decodeHtmlEntities(text) {
  if (!text) return ''
  return text
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}
