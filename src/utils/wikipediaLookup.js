/**
 * Helpers for the Wikipedia lookup (docs/guides/ai-notes.md, "Wikipedia lookup").
 */

/**
 * Append a lookup result to a note under a heading naming the question. The
 * existing note text is kept: a lookup adds to a note, it does not replace it.
 *
 * @param {string|null} notes - The existing note text
 * @param {string} question - What was asked
 * @param {string} result - What the lookup returned
 * @returns {string} The note with the result appended
 */
export function appendLookupResult(notes, question, result) {
  const heading = `## Wikipedia: ${question.replace(/\s+/g, ' ').trim()}`
  const section = `${heading}\n\n${result.trim()}`
  const existing = (notes || '').trimEnd()
  return existing ? `${existing}\n\n${section}` : section
}
