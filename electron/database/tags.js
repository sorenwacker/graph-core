/**
 * Tag operations for managing tag nodes.
 * Tags are first-class nodes that can be linked to other nodes.
 * @module database/tags
 */

/**
 * Creates tag operations bound to a database context.
 * @param {Object} ctx - Database context with query methods
 * @returns {Object} Object containing all tag operations
 */
function createTagOperations(ctx) {
  return {
    /**
     * Get all tag nodes in a workspace.
     * @param {string|null|undefined} workspaceId - Workspace filter
     * @returns {Node[]} Array of tag nodes
     */
    getTagNodes(workspaceId = undefined) {
      let sql = "SELECT * FROM nodes WHERE type = 'tag' AND deleted_at IS NULL"
      const values = []

      sql = ctx._applyWorkspaceFilter(sql, values, workspaceId)
      sql += ' ORDER BY title COLLATE NOCASE'

      return ctx._query(sql, values).map(r => ctx._rowToNode(r))
    },

    /**
     * Get or create a tag node by name.
     * If a tag with the given name exists in the workspace, returns it.
     * Otherwise creates a new tag node.
     * @param {string} name - Tag name
     * @param {string|null} workspaceId - Workspace ID
     * @returns {Node} The tag node
     */
    getOrCreateTagNode(name, workspaceId = null) {
      const trimmedName = name.trim()
      if (!trimmedName) {
        throw new Error('Tag name cannot be empty')
      }

      // Search for existing tag (case-insensitive)
      let sql = "SELECT * FROM nodes WHERE type = 'tag' AND LOWER(title) = LOWER(?) AND deleted_at IS NULL"
      const values = [trimmedName]

      if (workspaceId === null) {
        sql += ' AND workspace_id IS NULL'
      } else {
        sql += ' AND workspace_id = ?'
        values.push(workspaceId)
      }

      const existing = ctx._query(sql, values)[0]
      if (existing) {
        return ctx._rowToNode(existing)
      }

      // Create new tag node at root level (parent_id = NULL)
      const now = new Date().toISOString()
      ctx.db.run(
        `INSERT INTO nodes (type, title, workspace_id, parent_id, path, depth, created_at, updated_at)
         VALUES (?, ?, ?, NULL, '', 0, ?, ?)`,
        ['tag', trimmedName, workspaceId, now, now]
      )

      const result = ctx._query('SELECT last_insert_rowid() as id')
      const newId = result[0]?.id
      ctx._save()

      // Fetch and return the created node as a plain object
      const newNode = ctx._query('SELECT * FROM nodes WHERE id = ?', [newId])[0]
      return ctx._rowToNode(newNode)
    },

    /**
     * Get all nodes linked to a specific tag node.
     * @param {number} tagNodeId - The tag node ID
     * @param {Object} options - Query options
     * @param {boolean} options.hideCompleted - Exclude completed nodes
     * @returns {Node[]} Array of nodes linked to the tag
     */
    getNodesLinkedToTag(tagNodeId, options = {}) {
      let sql = `
        SELECT DISTINCT n.* FROM nodes n
        JOIN node_links nl ON (
          (nl.source_id = n.id AND nl.target_id = ?) OR
          (nl.target_id = n.id AND nl.source_id = ?)
        )
        WHERE n.deleted_at IS NULL AND n.id != ?
      `
      const values = [tagNodeId, tagNodeId, tagNodeId]

      if (options.hideCompleted) {
        sql += ' AND n.completed = 0'
      }

      sql += ' ORDER BY n.updated_at DESC'

      return ctx._query(sql, values).map(r => ctx._rowToNode(r))
    },

    /**
     * Search tag nodes by partial name match.
     * @param {string} query - Search query
     * @param {string|null|undefined} workspaceId - Workspace filter
     * @param {number} limit - Max results
     * @returns {Node[]} Array of matching tag nodes
     */
    searchTagNodes(query, workspaceId = undefined, limit = 20) {
      let sql = "SELECT * FROM nodes WHERE type = 'tag' AND deleted_at IS NULL AND title LIKE ?"
      const values = [`%${query}%`]

      sql = ctx._applyWorkspaceFilter(sql, values, workspaceId)
      sql += ' ORDER BY title COLLATE NOCASE LIMIT ?'
      values.push(limit)

      return ctx._query(sql, values).map(r => ctx._rowToNode(r))
    },
  }
}

module.exports = {
  createTagOperations,
}
