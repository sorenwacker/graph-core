/**
 * Node field utilities for CRUD operations.
 */
import { toRaw } from 'vue'

// Node update field list - used for building old/new value objects
export const NODE_UPDATE_FIELDS = [
  'title',
  'type',
  'notes',
  'notes_sensitive',
  'completed',
  'favorite',
  'due_date',
  'start_date',
  'end_date',
  'color',
  'importance',
  'location',
  'email',
  'phone',
  'organization',
  'role',
  'website',
  'tags',
  'show_links',
  'show_root_node',
  'show_external_links',
  'graph_layout',
  'graph_max_depth',
  'graph_type_filter',
  'graph_relax_locked',
  'graph_fit_locked',
  'graph_physics',
  'collapsed',
]

/**
 * Extract specified fields from a node object.
 * Uses toRaw to unwrap Vue reactive proxies for IPC serialization.
 *
 * A node read withholds sensitive notes (docs/architecture/sensitive-notes.md),
 * so `notes` is left out for a node that never held them, and marked
 * `notes_revealed` for one whose editor fetched them through getNodeNotes.
 *
 * @param {Object} node - Node object
 * @param {string[]} fields - Fields to extract (defaults to NODE_UPDATE_FIELDS)
 * @returns {import('../types').UpdateNodeData} - Object with extracted fields
 */
export function pickNodeFields(node, fields = NODE_UPDATE_FIELDS) {
  const rawNode = toRaw(node)
  const result = {}
  for (const field of fields) {
    if (field === 'notes' && rawNode.notes_withheld) continue
    const value = rawNode[field]
    // Unwrap nested reactive values (like arrays)
    result[field] = Array.isArray(value) ? [...toRaw(value)] : value
  }
  if ('notes' in result && rawNode.notes_revealed) result.notes_revealed = true
  return result
}
