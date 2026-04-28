/**
 * Node link operations.
 * @module database/links
 */

/**
 * Create link operations bound to database context.
 * @param {Object} ctx - Database context with _query, _run, _rowToNode methods
 * @returns {Object} Link operations
 */
function createLinkOperations(ctx) {
  return {
    /**
     * Create a link between two nodes.
     * @param {number} sourceId - Source node ID
     * @param {number} targetId - Target node ID
     * @returns {Object} Success status
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
     * Remove a link between two nodes.
     * @param {number} sourceId - Source node ID
     * @param {number} targetId - Target node ID
     * @returns {Object} Success status
     */
    unlinkNodes(sourceId, targetId) {
      ctx._run('DELETE FROM node_links WHERE source_id = ? AND target_id = ?', [sourceId, targetId])
      return { success: true }
    },

    /**
     * Get all links, optionally filtered by node IDs.
     * @param {number[]|null} nodeIds - Filter to links involving these nodes
     * @returns {Array} Link objects
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
     * Get all nodes linked to a given node.
     * @param {number} id - Node ID
     * @returns {Array} Linked node objects
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
