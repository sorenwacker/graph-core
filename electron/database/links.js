/**
 * Node link operations for creating and managing relationships between nodes.
 * A link is stored as a single directed row (source_id -> target_id) in the
 * node_links table but is treated as bidirectional on read and removal.
 * @module database/links
 */

/**
 * @typedef {Object} Link
 * @property {number} source_id - Source node ID
 * @property {number} target_id - Target node ID
 * @property {string} created_at - Creation timestamp
 */

/**
 * @typedef {Object} DatabaseContext
 * @property {Function} _query - Execute SQL query returning array of rows
 * @property {Function} _run - Execute SQL statement returning result info
 * @property {Function} _rowToNode - Convert database row to Node object
 */

/**
 * @typedef {Object} LinkResult
 * @property {boolean} success - Whether the operation succeeded
 * @property {string} [error] - Error message if operation failed
 */

/**
 * Creates link operations bound to a database context.
 * Links represent relationships between nodes independent of the parent-child hierarchy.
 * @param {DatabaseContext} ctx - Database context with query methods
 * @returns {Object} Object containing all link operations
 */
function createLinkOperations(ctx) {
  return {
    /**
     * Links two nodes, stored as a single directed row (source -> target).
     * Reads (getLinkedNodes, getAllLinks) and unlinkNodes treat the link as
     * bidirectional, so direction does not matter to callers.
     * Updates the updated_at timestamp on both nodes.
     * @param {number} sourceId - ID of the source node
     * @param {number} targetId - ID of the target node
     * @returns {LinkResult} Success status with optional error message
     */
    linkNodes(sourceId, targetId) {
      try {
        ctx._run('INSERT INTO node_links (source_id, target_id) VALUES (?, ?)', [sourceId, targetId])
        ctx._run('UPDATE nodes SET updated_at = CURRENT_TIMESTAMP WHERE id IN (?, ?)', [sourceId, targetId])
        return { success: true }
      } catch (e) {
        return { success: false, error: e.message }
      }
    },

    /**
     * Removes the link between two nodes in either direction, matching the
     * bidirectional read semantics so the argument order does not matter.
     * @param {number} sourceId - ID of one linked node
     * @param {number} targetId - ID of the other linked node
     * @returns {LinkResult} Success status object
     */
    unlinkNodes(sourceId, targetId) {
      ctx._run('DELETE FROM node_links WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)', [
        sourceId,
        targetId,
        targetId,
        sourceId,
      ])
      return { success: true }
    },

    /**
     * Retrieves all links, optionally filtered to links involving specific nodes.
     * When nodeIds is provided, returns links where either source or target is in the list.
     * @param {number[]|null} [nodeIds=null] - Optional array of node IDs to filter by
     * @returns {Link[]} Array of link objects with source_id and target_id
     */
    getAllLinks(nodeIds = null) {
      if (nodeIds && nodeIds.length > 0) {
        const placeholders = nodeIds.map(() => '?').join(', ')
        return ctx._query(
          `SELECT * FROM node_links WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`,
          [...nodeIds, ...nodeIds]
        )
      }
      return ctx._query('SELECT * FROM node_links')
    },

    /**
     * Retrieves all nodes that are linked to a given node.
     * Returns nodes on either end of links where the given node is source or target.
     * Does not include deleted nodes.
     * @param {number} id - ID of the node to find linked nodes for
     * @returns {Node[]} Array of linked node objects (excluding the queried node itself)
     */
    getLinkedNodes(id) {
      const numId = Number(id)
      const links = ctx._query('SELECT * FROM node_links WHERE source_id = ? OR target_id = ?', [numId, numId])

      const linkedIds = new Set()
      for (const link of links) {
        if (link.source_id !== numId) linkedIds.add(link.source_id)
        if (link.target_id !== numId) linkedIds.add(link.target_id)
      }

      if (linkedIds.size === 0) return []

      const placeholders = [...linkedIds].map(() => '?').join(', ')
      return ctx
        ._query(`SELECT * FROM nodes WHERE id IN (${placeholders}) AND deleted_at IS NULL`, [...linkedIds])
        .map(r => ctx._rowToNode(r))
    },
  }
}

module.exports = {
  createLinkOperations,
}
