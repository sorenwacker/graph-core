/**
 * Node types as tags.
 *
 * Every node type doubles as a tag: the sidebar legend shows how many nodes of
 * each type a workspace holds, and opening a type lists every node of it in one
 * place, wherever it sits in the hierarchy (docs/reference/node-types.md,
 * "Every type is also a list"). The listing is a virtual container built in the
 * renderer (src/utils/typeListings.ts); these are the two queries behind it.
 * @module database/typeListings
 */

/**
 * Creates the type listing queries bound to a database context.
 * @param {Object} ctx - Database context with query methods
 * @returns {Object} Object containing the type listing operations
 */
function createTypeListingOperations(ctx) {
  return {
    /**
     * Get every node of one type in a workspace, at any depth.
     * @param {string} type - Node type
     * @param {string|null|undefined} workspaceId - Workspace filter
     * @returns {Node[]} Nodes of that type, by title
     */
    getNodesOfType(type, workspaceId = undefined) {
      let sql = 'SELECT * FROM nodes WHERE type = ? AND deleted_at IS NULL'
      const values = [type]

      sql = ctx._applyWorkspaceFilter(sql, values, workspaceId)
      sql += ' ORDER BY title COLLATE NOCASE'

      return ctx._query(sql, values).map(r => ctx._rowToNode(r))
    },

    /**
     * Count the nodes of each type in a workspace. Tags have their own section
     * and are left out; a type with no nodes does not appear.
     * @param {string|null|undefined} workspaceId - Workspace filter
     * @returns {Array<{type: string, count: number}>} Counts, by type name
     */
    getNodeTypeCounts(workspaceId = undefined) {
      let sql = "SELECT type, COUNT(*) AS count FROM nodes WHERE type != 'tag' AND deleted_at IS NULL"
      const values = []

      sql = ctx._applyWorkspaceFilter(sql, values, workspaceId)
      sql += ' GROUP BY type ORDER BY type'

      return ctx._query(sql, values).map(r => ({ type: r.type, count: Number(r.count) }))
    },
  }
}

module.exports = {
  createTypeListingOperations,
}
