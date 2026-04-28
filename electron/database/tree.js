/**
 * Tree operations - roots, projects, inbox, tree building.
 * @module database/tree
 */

/**
 * Create tree operations bound to database context.
 * @param {Object} ctx - Database context with _query, _rowToNode, _applyWorkspaceFilter, getNode, getDescendants methods
 * @returns {Object} Tree operations
 */
function createTreeOperations(ctx) {
  return {
    /**
     * Get root nodes (no parent).
     * @param {string|null|undefined} workspaceId - Workspace filter
     * @returns {Array} Root nodes
     */
    getRoots(workspaceId = undefined) {
      let sql =
        'SELECT *, (EXISTS(SELECT 1 FROM node_tables WHERE node_id = nodes.id)) as has_table FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL'
      const values = []

      sql = ctx._applyWorkspaceFilter(sql, values, workspaceId)

      sql += ' ORDER BY sort_order, created_at'
      const results = ctx._query(sql, values)
      console.log(`getRoots(${workspaceId}): found ${results.length} root nodes`)
      return results.map(r => ctx._rowToNode(r))
    },

    /**
     * Get all project nodes.
     * @returns {Array} Project nodes
     */
    getProjects() {
      return ctx
        ._query("SELECT * FROM nodes WHERE type = 'project' AND deleted_at IS NULL ORDER BY sort_order, created_at")
        .map(r => ctx._rowToNode(r))
    },

    /**
     * Get inbox (root nodes).
     * @returns {Array} Inbox nodes
     */
    getInbox() {
      return ctx
        ._query('SELECT * FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_order, created_at')
        .map(r => ctx._rowToNode(r))
    },

    /**
     * Build tree view with nested children.
     * @param {number|null} rootId - Root node ID or null for all
     * @returns {Array} Tree structure
     */
    getTree(rootId = null) {
      const nodes = rootId
        ? [ctx.getNode(rootId), ...ctx.getDescendants(rootId)]
        : this.getRoots().flatMap(root => [root, ...ctx.getDescendants(root.id)])

      const nodeMap = new Map()
      for (const node of nodes) {
        if (node) nodeMap.set(node.id, { ...node, children: [] })
      }

      const roots = []
      for (const node of nodeMap.values()) {
        if (node.parent_id && nodeMap.has(node.parent_id)) {
          nodeMap.get(node.parent_id).children.push(node)
        } else if (!node.parent_id || node.id === rootId) {
          roots.push(node)
        }
      }

      return roots
    },

    /**
     * Get trash (deleted nodes).
     * @param {number} limit - Maximum results
     * @returns {Array} Deleted nodes
     */
    getTrash(limit = 100) {
      return ctx
        ._query('SELECT * FROM nodes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?', [limit])
        .map(r => ctx._rowToNode(r))
    },

    /**
     * Restore a deleted node.
     * @param {number} id - Node ID
     * @returns {Object} Restored node
     */
    restoreNode(id) {
      ctx._run('UPDATE nodes SET deleted_at = NULL WHERE id = ?', [id])
      return ctx.getNode(id)
    },

    /**
     * Permanently delete all trashed nodes.
     * @returns {Object} Count of deleted nodes
     */
    emptyTrash() {
      const result = ctx._query('SELECT COUNT(*) as count FROM nodes WHERE deleted_at IS NOT NULL')
      const count = result[0]?.count || 0
      ctx._run('DELETE FROM nodes WHERE deleted_at IS NOT NULL')
      return { deleted: count }
    },

    /**
     * Get orphaned nodes (parent doesn't exist).
     * @returns {Array} Orphaned nodes
     */
    getOrphanedNodes() {
      return ctx
        ._query(
          `
        SELECT n.* FROM nodes n
        WHERE n.deleted_at IS NULL
          AND n.parent_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM nodes p
            WHERE p.id = n.parent_id
              AND p.deleted_at IS NULL
          )
        ORDER BY n.updated_at DESC
      `
        )
        .map(r => ctx._rowToNode(r))
    },

    /**
     * Move orphaned node to root.
     * @param {number} nodeId - Node ID
     * @returns {Object} Updated node
     */
    reparentToRoot(nodeId) {
      ctx._run('UPDATE nodes SET parent_id = NULL WHERE id = ?', [nodeId])
      ctx._updateDescendantPaths(nodeId)
      return ctx.getNode(nodeId)
    },

    /**
     * Repair workspace_id for descendants to match root.
     * @returns {Object} Count of fixed nodes
     */
    repairWorkspaces() {
      const roots = ctx._query('SELECT * FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL')
      let fixed = 0

      for (const root of roots) {
        const rootWorkspace = root.workspace_id
        const pathPrefix = root.path ? `${root.path}/${root.id}` : `${root.id}`
        const descendants = ctx._query(
          'SELECT id, workspace_id FROM nodes WHERE (path = ? OR path LIKE ?) AND deleted_at IS NULL',
          [pathPrefix, `${pathPrefix}/%`]
        )

        for (const desc of descendants) {
          const descWorkspace = desc.workspace_id
          const needsFix =
            (rootWorkspace === null && descWorkspace !== null) ||
            (rootWorkspace !== null && descWorkspace !== rootWorkspace)
          if (needsFix) {
            ctx._run('UPDATE nodes SET workspace_id = ? WHERE id = ?', [rootWorkspace, desc.id])
            fixed++
          }
        }
      }

      console.log(`repairWorkspaces: fixed ${fixed} nodes`)
      if (fixed > 0) ctx._save()
      return { fixed }
    },
  }
}

module.exports = {
  createTreeOperations,
}
