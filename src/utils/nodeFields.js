/**
 * Node field utilities for CRUD operations.
 */

// Node update field list - used for building old/new value objects
export const NODE_UPDATE_FIELDS = [
  'title', 'type', 'notes', 'notes_sensitive', 'completed', 'favorite',
  'due_date', 'start_date', 'end_date', 'color', 'importance',
  'location', 'email', 'phone', 'organization', 'role', 'website'
]

/**
 * Extract specified fields from a node object.
 *
 * @param {Object} node - Node object
 * @param {string[]} fields - Fields to extract (defaults to NODE_UPDATE_FIELDS)
 * @returns {Object} - Object with extracted fields
 */
export function pickNodeFields(node, fields = NODE_UPDATE_FIELDS) {
  const result = {}
  for (const field of fields) {
    result[field] = node[field]
  }
  return result
}
