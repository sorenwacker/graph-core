/**
 * The one place a view gets note text to show
 * (docs/architecture/sensitive-notes.md, "Display policy").
 *
 * A node read withholds sensitive notes, so for those there is no text to
 * return. What remains to decide here is the Hide Sensitive setting, which
 * masks notes that are not flagged but mention a credential.
 */

// Keywords that indicate potentially sensitive content in notes
const SENSITIVE_KEYWORDS = ['password', 'secret', 'api_key', 'credential']

/**
 * @typedef {Object} DisplayedNotes
 * @property {string} text - The text to show; empty when there is none or it is withheld
 * @property {'sensitive'|'keyword'|null} withheld - Why the text is withheld, or null
 */

/**
 * Get the note text a view may show for a node.
 *
 * @param {Object|null} node - The node
 * @param {Object} [options]
 * @param {boolean} [options.hideSensitive=false] - The Hide Sensitive setting
 * @returns {DisplayedNotes} The text, or the reason there is none to show
 */
export function notesForDisplay(node, { hideSensitive = false } = {}) {
  if (!node) return { text: '', withheld: null }
  // notes_sensitive covers a local copy flagged a moment ago, which still
  // carries the text until the next read replaces it.
  if (node.notes_withheld || node.notes_sensitive) return { text: '', withheld: 'sensitive' }
  const text = node.notes || ''
  if (hideSensitive && SENSITIVE_KEYWORDS.some(keyword => text.toLowerCase().includes(keyword))) {
    return { text: '', withheld: 'keyword' }
  }
  return { text, withheld: null }
}

/**
 * Whether a node has note content, including content that is withheld.
 *
 * @param {Object|null} node - The node
 * @returns {boolean} True when the node has notes
 */
export function hasNotes(node) {
  return Boolean(node?.has_notes ?? node?.notes)
}
