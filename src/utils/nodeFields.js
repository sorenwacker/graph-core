/**
 * Node field utilities for CRUD operations.
 */
import { toRaw } from 'vue'

// Node update field list - used for building old/new value objects
export const NODE_UPDATE_FIELDS = [
  'title', 'type', 'notes', 'notes_sensitive', 'completed', 'favorite',
  'due_date', 'start_date', 'end_date', 'color', 'importance',
  'location', 'email', 'phone', 'organization', 'role', 'website', 'tags',
  'show_links', 'show_root_node', 'show_external_links', 'graph_layout'
]

/**
 * Extract specified fields from a node object.
 * Uses toRaw to unwrap Vue reactive proxies for IPC serialization.
 *
 * @param {Object} node - Node object
 * @param {string[]} fields - Fields to extract (defaults to NODE_UPDATE_FIELDS)
 * @returns {Object} - Object with extracted fields
 */
export function pickNodeFields(node, fields = NODE_UPDATE_FIELDS) {
  const rawNode = toRaw(node)
  const result = {}
  for (const field of fields) {
    const value = rawNode[field]
    // Unwrap nested reactive values (like arrays)
    result[field] = Array.isArray(value) ? [...toRaw(value)] : value
  }
  return result
}
